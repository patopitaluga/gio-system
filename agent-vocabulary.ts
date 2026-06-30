/**
 * **vocabulary-agent** — themed vocabulary lists with IPA, syllable mnemonics, and
 * pronunciation audio via `speak_pronunciation`.
 * CLI entry for `npm run vocabulary` → `askLlmToShowVocabulary`.
 *
 * **Exports**:
 * - `askLlmToShowVocabulary` — **vocabulary-agent**. App, CLI (`npm run gio`), tests.
 */
import { Agent } from '@openai/agents';
import { fileURLToPath } from 'url';
import { askAgentAndLog } from './lib/ask-agent.ts';
import { loadStudentContext } from './lib/student-context.ts';
import { NO_CAPTATION_FOLLOWUP_RULE } from './lib/prompt-rules.ts';
import type { AgentLoopResult } from './lib/resolve-agent-output.ts';
import { askLlmToIdentifyInterests } from './agent-interests.ts';
import { askLlmToIdentifyShortcomings } from './agent-shortcomings.ts';
import { logTurnError } from './utils/turn-log.ts';
import {
  SPEAK_PRONUNCIATION_TOOL_NAME,
  speakPronunciationTool,
} from './tools/vocabulary-tools/speak-pronunciation.ts';

const VOCABULARY_ENTRY_FORMAT = `### {headword in target language} — {translation in student language}

- **IPA:** /.../  (narrow IPA for the target-language pronunciation)
- **Syllables:** {syllables separated by ·}
- **Sounds like:** {for each syllable, a familiar word or spelling in the student's language, e.g. "**cu** · like *coo* in "cool" · **rva** · like *rva* in "erva" without the e"}
- **Audio:** 🔊 [Listen]({audioUrl from ${SPEAK_PRONUNCIATION_TOOL_NAME}})`;

/** Used in `createVocabularyAgent`. */
function buildVocabularyInstructions(languageContext: string): string {
  return `You are vocabulary-agent in Gio-System. The user wants a vocabulary list with pronunciation guidance for their target language — not a full lesson and not exercises.

Student language profile (target language, student language, level):
---
${languageContext}
---

Core rules:
1. Use the student profile above for target language and student language. Headwords MUST be in the target language only.
2. Translations, syllable hints, and "Sounds like" lines go in the student's language.
3. Do not use the student's language for headwords unless they explicitly asked to learn a different target language in this message.

For each headword:
1. Call ${SPEAK_PRONUNCIATION_TOOL_NAME} with the headword in the target language (short phrase only).
2. Use the returned audioUrl in the entry. Every headword MUST have audio.

Each entry MUST follow this markdown structure exactly:

${VOCABULARY_ENTRY_FORMAT}

Rules:
- Infer the theme from the user message (for example Formula 1, food, travel, or a single word like "fork").
- For a single-word request, still use the full entry format for that word.
- Include 8–15 high-value terms for themed lists unless the user asked for fewer.
- Deliver the full list in your final reply. Do not ask whether they want a list they already requested.
- Call ${SPEAK_PRONUNCIATION_TOOL_NAME} once per headword before you write that entry.

${NO_CAPTATION_FOLLOWUP_RULE}`;
}

/** Used in `askLlmToShowVocabulary`. */
function createVocabularyAgent(languageContext: string): Agent {
  return new Agent({
    name: 'vocabulary-agent',
    instructions: buildVocabularyInstructions(languageContext),
    tools: [speakPronunciationTool],
  });
}

/**
 * **vocabulary-agent** — vocabulary list with IPA, syllable mnemonics, and audio.
 *
 * Imported in `conversation/session-manager.ts`, `agent-reception-orchestrator.ts` (`gioCli`), and CLI (`npm run vocabulary`).
 */
export async function askLlmToShowVocabulary(userPrompt: string): Promise<AgentLoopResult> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('Vocabulary prompt is required');

  const languageContext = loadStudentContext();
  if (!languageContext.trim()) throw new Error(
    'Student language profile is not configured. Copy student-context.example.md to student-context.md '
    + 'and set your native and target languages.',
  );

  const agent = createVocabularyAgent(languageContext);
  const result = await askAgentAndLog(agent, prompt, 'vocabulary-agent');
  const markdown = result.finalOutput?.trim();

  if (!markdown) throw new Error('vocabulary-agent did not produce a response');

  askLlmToIdentifyInterests(prompt, markdown, 'vocabulary').catch((error) => {
    logTurnError('interests identification failed', error, { source: 'vocabulary' });
  });
  askLlmToIdentifyShortcomings(prompt, markdown, 'vocabulary').catch((error) => {
    logTurnError('shortcomings identification failed', error, { source: 'vocabulary' });
  });

  return {
    markdown,
    savedPath: '',
    emailed: false,
    source: 'message',
  };
}

/** Used in CLI entry when this file is the main module. */
function readCliPrompt(): string {
  const args = process.argv.slice(2).join(' ').trim();
  if (!args) throw new Error('Usage: npm run vocabulary -- <your message>');

  return args;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is not set');
  askLlmToShowVocabulary(readCliPrompt())
    .then((result) => {
      console.log(result.markdown);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
