/**
 * **news-agent** — picks one newspaper article and returns graded reading in the target language.
 * Cron entry via `cronjob.ts`; CLI via `npm run news`.
 *
 * **Exports**:
 * - `askLlmToCurateNews` — **news-agent**. `cronjob.ts`, CLI (`npm run news`).
 * - `sendNewsByEmail` — imported in `cronjob.ts`.
 */
import { Agent, webSearchTool } from '@openai/agents';
import { fileURLToPath } from 'url';
import { askAgentAndLog } from './lib/ask-agent.ts';
import { loadStudentContext } from './lib/student-context.ts';
import { loadInterestsFile } from './lib/save-interests.ts';
import { formatCurrentDate } from './lib/study-plan-context.ts';
import { markdownToHtml } from './lib/markdown-to-html.ts';
import {
  logNewsOutputStatus,
  readPreviousNews,
  saveNewsOutput,
} from './lib/save-news-output.ts';
import {
  resolveNewsNewspaperDomain,
  resolveNewsNewspaperUrl,
} from './lib/fetch-web-page.ts';
import {
  isEmailConfigured,
  sendEmail,
  type SendEmailResult,
} from './tools/communication-tools/send-email.ts';

const WEB_SEARCH_TOOL_NAME = 'web_search';

/** Used in `createNewsAgent`. */
function buildNewsInstructions(
  newspaperUrl: string,
  newspaperDomain: string,
  interests: string,
  studentContext: string,
  todayLabel: string,
): string {
  const contextBlock = studentContext.trim()
    ? `\nStudent context:\n---\n${studentContext}\n---\n`
    : '';

  const interestsBlock = interests.trim()
    ? interests.trim()
    : '(none saved yet — use the fallback selection rules below)';

  return `You are news-agent in Gio-System. Your job is to pick **one** newspaper article and deliver it as **graded reading in the article's language** (the student's target language from context — e.g. Italian text from an Italian paper).

Today: ${todayLabel}
Newspaper homepage: ${newspaperUrl}
Search scope: ${newspaperDomain} only (enforced by your web search tool).
${contextBlock}
Saved interests (prefer an article that matches one of these topics):
---
${interestsBlock}
---

## Finding the article

Use the hosted **${WEB_SEARCH_TOOL_NAME}** tool. Search until you find **one** suitable **recent** article on ${newspaperDomain} (prefer stories from the last few days; avoid years-old links unless nothing recent fits).

- Prefer a match to saved interests; otherwise pick a simple uplifting story at the student's level.
- **Exactly one article** — do not list alternatives, do not write about multiple stories.

## Tone and content (required)

The article must be **uplifting, calm, non-controversial**.

Prefer: human interest, culture, food, travel, sport (without injury focus), science discoveries, nature, community events, arts, gentle humor.

**Never pick** stories about violence, crime, war, tragedy, disasters, heated politics, scandal, or fear-mongering.

## Rewriting (required)

Search snippets are source material only. Do **not** paste the original article word for word.

Write a **simplified news article** in the **target language** (the language of the newspaper — not the student's native language). It should read like a real short news piece, not a poem or a list of telegraphic facts.

Style rules:
- **Prose paragraphs** — 2–3 paragraphs, each with several connected sentences. Never put one sentence per line.
- **Simplify** vocabulary and grammar for the student's level (e.g. A1–A2), but keep normal article flow: who, what, where, why.
- Use simple connectors (e, ma, anche, perché, oggi, ieri) so sentences link naturally.
- Sentences can be short, but group them into paragraphs like a newspaper, not isolated stubs.
- Rough length: about 120–200 words — enough to feel like an article, not a caption.
- Present tense is fine when it fits; avoid literary or bureaucratic tone.

**Do not** write the body in Spanish or any native/support language.
**Do not** add a tutor intro, outro, or commentary.
**Do not** summarize several articles — only the one you chose.

Bad (do not do this — choppy "poem" lines):
\`\`\`
Euclid è un telescopio.
Guarda l'universo.
Le foto sono belle.
\`\`\`

Good (simplified article prose):
\`\`\`
L'Agenzia Spaziale Europea ha pubblicato nuove immagini del telescopio Euclid. Le foto mostrano regioni dove nascono stelle giovani e un vasto gruppo di galassie lontane.

In una immagine si vede una "culla di stelle" nella Via Lattea, con gas e polvere che circondano stelle appena nate. Un'altra foto riunisce più di 50 mila galassie in un solo scatto. Gli scienziati useranno questi dati per studiare meglio l'universo e la materia oscura.
\`\`\`

## Output format (use exactly this structure)

# {title in target language}

**Link:** {url on ${newspaperDomain}}

{2–3 paragraphs of simplified article prose in the target language — no bullet lists, no metadata fields, no one-sentence-per-line layout}

## Rules

- One article only. One reading passage only.
- Body text must be in the target language, simplified to the student's level.
- Only use an article you found via ${WEB_SEARCH_TOOL_NAME} on ${newspaperDomain}.
- Deliver the full output in your final reply. Do not ask follow-up questions.`;
}

/** Used in `askLlmToCurateNews`. */
function createNewsAgent(
  newspaperUrl: string,
  newspaperDomain: string,
  interests: string,
  studentContext: string,
  todayLabel: string,
): Agent {
  return new Agent({
    name: 'news-agent',
    instructions: buildNewsInstructions(
      newspaperUrl,
      newspaperDomain,
      interests,
      studentContext,
      todayLabel,
    ),
    tools: [
      webSearchTool({
        searchContextSize: 'medium',
        externalWebAccess: true,
        filters: { allowedDomains: [newspaperDomain] },
      }),
    ],
  });
}

/**
 * **news-agent** — search the configured newspaper and build one graded reading in the target language.
 *
 * Imported in `cronjob.ts` and CLI (`npm run news`).
 */
export async function askLlmToCurateNews(): Promise<{
  markdown: string;
  savedPath: string;
  source: 'generated';
}> {
  const newspaperUrl = resolveNewsNewspaperUrl();
  const newspaperDomain = resolveNewsNewspaperDomain();
  const today = formatCurrentDate();
  const interests = loadInterestsFile();
  const studentContext = loadStudentContext();
  const agent = createNewsAgent(
    newspaperUrl,
    newspaperDomain,
    interests,
    studentContext,
    today.label,
  );
  const prompt = [
    `Find one article from ${newspaperUrl} (${newspaperDomain}) for today.`,
    'Use web_search; match interests when possible.',
    'Output one simplified news article in the target language: prose paragraphs, not one sentence per line.',
  ].join(' ');

  const result = await askAgentAndLog(agent, prompt, 'news-agent');
  const markdown = result.finalOutput?.trim();

  if (!markdown) throw new Error('news-agent did not produce a reading');

  const savedPath = saveNewsOutput(markdown, today.iso);

  return {
    markdown,
    savedPath,
    source: 'generated',
  };
}

/** Imported in `cronjob.ts`. */
export async function sendNewsByEmail(newsMarkdown: string): Promise<SendEmailResult> {
  if (!isEmailConfigured()) throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env');

  const today = formatCurrentDate();

  return sendEmail({
    subject: `Lettura del giorno — ${today.label}`,
    text: newsMarkdown,
    html: await markdownToHtml(newsMarkdown),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is not set');

  askLlmToCurateNews()
    .then(async ({ markdown, savedPath, source }) => {
      logNewsOutputStatus(source, savedPath);
      console.log(markdown);

      if (isEmailConfigured()) {
        const emailed = await sendNewsByEmail(markdown);
        console.log(`News emailed to ${emailed.to}`);
      } else {
        console.log('SMTP not configured — digest saved only.');
      }
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
