/**
 * **Two agents in one file** — `identify-lesson-intent-agent` and
 * `generate-lesson-agent`. Both share lesson tooling and wiring.
 * Each export runs one agent; callers include the app, CLI, and cron.
 * CLI entry for `npm run lesson` → `askLlmToIdentifyLessonIntent`.
 *
 * **Exports**:
 * - `askLlmToIdentifyLessonIntent` — **identify-lesson-intent-agent** (retrieve or generate). App, CLI, tests.
 * - `askLlmToGenerateLesson` — **generate-lesson-agent**. Cron, `generate_new_lesson`.
 * - `sendLessonByEmail` — imported in `cronjob.ts`
 */
import { Agent } from '@openai/agents';
import type { RunItem } from '@openai/agents';
import { askAgentAndLog } from '../lib/ask-agent.ts';
import { fileURLToPath } from 'url';
import {
  formatCurrentDate,
  loadStudyPlan,
  type StudyPlanDate,
} from '../lib/study-plan-context.ts';
import { markdownToHtml } from '../lib/markdown-to-html.ts';
import { saveStudyOutput } from '../lib/save-study-output.ts';
import { logStudyOutputStatus } from '../lib/log-study-output-status.ts';
import { NO_CAPTATION_FOLLOWUP_RULE } from '../lib/prompt-rules.ts';
import { resolveAgentOutput, type AgentLoopResult } from '../lib/resolve-agent-output.ts';
import { listStudyOutputDates } from '../lib/save-study-output.ts';
import { askLlmToIdentifyInterests } from './agent-interests-observer.ts';
import { askLlmToIdentifyShortcomings } from './agent-shortcomings-observer.ts';
import { logTurnError } from '../utils/turn-log.ts';
import { createGenerateNewLessonTool } from '../tools/study-output-tools/generate-study-output-tool.ts';
import { retrieveExistingLessonTool } from '../tools/study-output-tools/retrieve-existing-study-output.ts';
import { StudyOutputToolName } from '../tools/study-output-tools/tool-names.ts';
import {
  createSendEmailAgentTool,
  isEmailConfigured,
  SEND_EMAIL_TOOL_NAME,
  sendEmail,
  type SendEmailResult,
} from '../tools/communication-tools/send-email.ts';
import {
  warnIfMarkStudyPlanToolMissing,
  MARK_STUDY_PLAN_ITEMS_TOOL_NAME,
  markStudyPlanItemsTool,
} from '../tools/study-plan-tools/mark-study-plan-items.ts';

const DEFAULT_LESSON_PROMPT = 'Generate the lesson for today.';

function formatSavedDates(dates: string[]): string {
  return dates.length > 0
    ? dates.map((date) => `- ${date}`).join('\n')
    : '- (none yet)';
}

/** Used in `createIdentifyLessonIntentAgent`. */
function buildIdentifyLessonIntentInstructions(today: StudyPlanDate, lessonDates: string[]): string {
  return `You are the identify-lesson-intent agent in Gio-System — figure out what the user wants regarding lessons, then retrieve saved content or trigger generation.

Today: ${today.generatedAt} (${today.label}, ${today.iso})

Saved lessons (newest first, ISO dates):
${formatSavedDates(lessonDates)}

Tools — ${StudyOutputToolName.RetrieveLesson}, ${StudyOutputToolName.GenerateLesson}:
- Infer the target date from the message in any language, using today as the anchor for relative dates (yesterday, last week, etc.).
- To read, review, show, repeat, or load an existing saved lesson when a file exists for that date, call ${StudyOutputToolName.RetrieveLesson} with that dateIso.
- If ${StudyOutputToolName.RetrieveLesson} returns found:true, your final reply MUST be the markdown from the tool verbatim. Do not rewrite, summarize, or regenerate it.
- For newly generated lesson content, or when no saved lesson exists for the requested date, call ${StudyOutputToolName.GenerateLesson} with the full user request as userPrompt.
- When calling ${StudyOutputToolName.GenerateLesson}, pass the user's message unchanged unless you need to clarify the plan day.
- If ${StudyOutputToolName.RetrieveLesson} returns found:false and the user only wanted a past lesson, explain that none is saved for that date and ask whether to generate one.
- On retrieve, do not invent lesson content yourself.
- You MUST call exactly one study tool before finishing, unless you are only explaining that a retrieve found nothing.

${NO_CAPTATION_FOLLOWUP_RULE}`;
}

/** Used in `askLlmToIdentifyLessonIntent`. */
function createIdentifyLessonIntentAgent(today: StudyPlanDate, lessonDates: string[]): Agent {
  return new Agent({
    name: 'identify-lesson-intent-agent',
    instructions: buildIdentifyLessonIntentInstructions(today, lessonDates),
    tools: [retrieveExistingLessonTool, createGenerateNewLessonTool()],
  });
}

/**
 * **identify-lesson-intent-agent** — retrieve saved file or call `generate_new_lesson`.
 *
 * Imported in `conversation/session-manager.ts`, CLI (`npm run lesson`), tests, and
 * `agents/agent-reception-orchestrator.ts` (`npm run gio`).
 */
export async function askLlmToIdentifyLessonIntent(userPrompt: string): Promise<AgentLoopResult> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('Lesson prompt is required');

  const today = formatCurrentDate();
  const lessonDates = listStudyOutputDates('lessons', 10);
  const agent = createIdentifyLessonIntentAgent(today, lessonDates);
  const result = await askAgentAndLog(agent, prompt, 'identify-lesson-intent-agent');

  const output = resolveAgentOutput(
    result,
    StudyOutputToolName.RetrieveLesson,
    StudyOutputToolName.GenerateLesson,
  );
  askLlmToIdentifyInterests(prompt, output.markdown, 'lesson').catch((error) => {
    logTurnError('interests identification failed', error, { source: 'lesson' });
  });
  askLlmToIdentifyShortcomings(prompt, output.markdown, 'lesson').catch((error) => {
    logTurnError('shortcomings identification failed', error, { source: 'lesson' });
  });

  return output;
}

/** Used in `askLlmToGenerateLesson`. */
function buildGenerateLessonInstructions(studyPlan: string, today: StudyPlanDate): string {
  const emailRule = isEmailConfigured()
    ? `9. Call ${SEND_EMAIL_TOOL_NAME} only when the user explicitly asks to send or email the lesson. Include the full lesson as plain text; you may omit html. Otherwise return the lesson as your final response only — do not send email on your own.`
    : '9. Email is not configured. Always return the lesson as your final response.';

  return `You are an expert language teacher.

Current date and time: ${today.generatedAt} (${today.label}, ${today.iso})

Full study plan:
---
${studyPlan}
---

Follow the user prompt to decide which plan day to teach and any extra focus (for example tomorrow's entry or additional vocabulary topics).

Core rules:
1. Infer from the plan the target language, the student's language, and any other relevant context.
2. Find the plan entry for the day requested in the user prompt (default: today).
3. For that day, separate THEORETICAL CONTENT from EXERCISES or PRACTICE.
   - Theory: new topics, grammar, vocabulary, explanations, rules.
   - Exercises/practice: activities such as "practice", "write", "conjugate", "simulate", "compose a text", etc.
4. Write a complete lesson on theoretical content only.
5. Do not include exercises, practice tasks, or student activities.
6. Write clearly and structurally in the student's language, with examples in the target language when appropriate.
7. If the day only lists practice activities, teach the underlying theory needed to understand them, without assigning those activities.
8. After writing the lesson, call ${MARK_STUDY_PLAN_ITEMS_TOOL_NAME} at most once with unchecked THEORETICAL plan item texts you covered. Do not pass practice or exercise lines (for example "write", "practice", "conjugate"). Pass planDateLabel matching the plan day you taught (same format as plan headers, e.g. "29 de junio (Lunes)"). If that day has no unchecked theoretical items, skip this tool entirely.
9. ${NO_CAPTATION_FOLLOWUP_RULE}
${emailRule.replace(/^9\./, '10.')}

Output format:
- Start with a brief header:
  1. Generation date and time: ${today.generatedAt}
  2. Plan location derived from the document structure (section, unit, month, module, etc.) and the theoretical content items numbered. Example: "Unit 1 · Content 1: \\"Personal pronouns\\"". List all theoretical items covered.
- Then continue with the lesson body.
- No meta preambles outside that header.
- End with the lesson content only — no closing offers or teasers.`;
}

/** Used in `askLlmToGenerateLesson`. */
function createGenerateLessonAgent(studyPlan: string, today: StudyPlanDate): Agent {
  const tools = [markStudyPlanItemsTool];

  if (isEmailConfigured()) tools.push(createSendEmailAgentTool());

  return new Agent({
    name: 'generate-lesson-agent',
    instructions: buildGenerateLessonInstructions(studyPlan, today),
    tools,
  });
}

/** Used in `askLlmToGenerateLesson`. */
function wasToolUsed(result: { newItems: RunItem[] }, toolName: string): boolean {
  return result.newItems.some((item) => {
    if (item.type !== 'tool_call_item') return false;

    const raw = item.rawItem;
    return raw && 'name' in raw && raw.name === toolName;
  });
}

/**
 * **generate-lesson-agent** — write new lesson from study plan. Cron, `generate_new_lesson`.
 *
 * Imported in `cronjob.ts` and `tools/study-output-tools/generate-study-output-tool.ts`.
 */
export async function askLlmToGenerateLesson(
  userPrompt: string = DEFAULT_LESSON_PROMPT,
): Promise<AgentLoopResult> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('Lesson prompt is required');

  const today = formatCurrentDate();
  const studyPlan = loadStudyPlan();
  const agent = createGenerateLessonAgent(studyPlan, today);

  const result = await askAgentAndLog(agent, prompt, 'generate-lesson-agent');

  warnIfMarkStudyPlanToolMissing(result);

  const lessonMarkdown = result.finalOutput?.trim();

  if (!lessonMarkdown) throw new Error('The agent did not generate a lesson');

  const savedPath = saveStudyOutput('lessons', lessonMarkdown, today.iso);

  return {
    markdown: lessonMarkdown,
    emailed: wasToolUsed(result, SEND_EMAIL_TOOL_NAME),
    savedPath,
    source: 'generated',
  };
}

/** Used in CLI entry when this file is the main module. */
function readCliPrompt(): string {
  const args = process.argv.slice(2).join(' ').trim();

  return args || DEFAULT_LESSON_PROMPT;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { // is running by cli command
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is not set');
  const prompt = readCliPrompt();

  askLlmToIdentifyLessonIntent(prompt)
    .then((result) => {
      logStudyOutputStatus('lessons', result.source, result.savedPath);
      console.log(result.markdown);
      if (result.emailed) console.log('Lesson emailed via send_email tool.');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

/** Imported in `cronjob.ts`. */
export async function sendLessonByEmail(lessonMarkdown: string): Promise<SendEmailResult> {
  const today = formatCurrentDate();

  return sendEmail({
    subject: `Lección del día — ${today.label}`,
    text: lessonMarkdown,
    html: await markdownToHtml(lessonMarkdown),
  });
}
