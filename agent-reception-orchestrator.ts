/**
 * App entry triage: **reception-orchestrator-agent** identifies the relevant agent for
 * each user message — general conversation, lessons, or exercises.
 * CLI entry for `npm run gio` → `askLlmToIdentifyRelevantAgent` then that agent.
 *
 * **Exports**:
 * - `askLlmToIdentifyRelevantAgent` — **reception-orchestrator-agent**; imported in `conversation/session-manager.ts`
 * - `RelevantAgent` — `general` | `lesson` | `exercises`
 * - `resolveRelevantAgent` — parse agent output; used in tests
 */
import { Agent } from '@openai/agents';
import { fileURLToPath } from 'url';
import { askLlmToIdentifyLessonIntent } from './agent-lessons.ts';
import { askLlmToIdentifyExercisesIntent } from './agent-exercises.ts';
import {
  afterGeneralConversationReply,
  askLlmToGeneralConversation,
} from './agent-general-conversation.ts';
import { askAgentAndLog } from './lib/ask-agent.ts';
import { logStudyOutputStatus } from './lib/log-study-output-status.ts';
import { NO_CAPTATION_FOLLOWUP_RULE } from './lib/prompt-rules.ts';
import { loadAgentTools } from './conversation/tools.ts';

/** Reception-orchestrator triage outcomes. Used in `agent-reception-orchestrator.ts`, `conversation/session-manager.ts`, and `test/study-output.test.ts`. */
export const RelevantAgent = {
  General: 'general',
  Lesson: 'lesson',
  Exercises: 'exercises',
} as const;

export type RelevantAgent = (typeof RelevantAgent)[keyof typeof RelevantAgent];

/** Used in `createReceptionOrchestratorAgent`. */
function buildReceptionOrchestratorInstructions(): string {
  return `You are Gio-System's reception-orchestrator agent — the first step for every user message: identify which agent should handle it. Reply with ONLY one word — no punctuation, no explanation:
- "${RelevantAgent.General}" — general conversation, language Q&A, email, or anything that is NOT specifically requesting lesson or exercises content.
- "${RelevantAgent.Lesson}" — the user wants lesson content (study theory, learn, review, or repeat a saved lesson, teaching content).
- "${RelevantAgent.Exercises}" — the user wants exercises (practice, drills, activities). Repeat or review exercises is exercises; repeat or review a lesson is lesson, not exercises.

${NO_CAPTATION_FOLLOWUP_RULE}`;
}

/** Used in `askLlmToIdentifyRelevantAgent`. */
function createReceptionOrchestratorAgent(): Agent {
  return new Agent({
    name: 'reception-orchestrator-agent',
    instructions: buildReceptionOrchestratorInstructions(),
    tools: [],
  });
}

/** Used in `askLlmToIdentifyRelevantAgent`. Used in `test/study-output.test.ts`. */
export function resolveRelevantAgent(
  result: { finalOutput?: string | null },
): RelevantAgent {
  const reply = result.finalOutput?.trim().toLowerCase() ?? '';

  if (reply === RelevantAgent.General) return RelevantAgent.General;
  if (reply === RelevantAgent.Lesson) return RelevantAgent.Lesson;
  if (reply === RelevantAgent.Exercises) return RelevantAgent.Exercises;

  throw new Error(`reception-orchestrator-agent did not produce a valid relevant agent: ${JSON.stringify(result.finalOutput)}`);
}

/**
 * **reception-orchestrator-agent** — identify the relevant agent: `general`, `lesson`, or `exercises`.
 *
 * Imported in `conversation/session-manager.ts` and CLI (`npm run gio` via `gioCli`).
 */
export async function askLlmToIdentifyRelevantAgent(userPrompt: string): Promise<RelevantAgent> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('User prompt is required');

  const agent = createReceptionOrchestratorAgent();
  const result = await askAgentAndLog(agent, prompt, 'reception-orchestrator-agent');

  return resolveRelevantAgent(result);
}

/** Used in CLI entry when this file is the main module. */
function readCliPrompt(): string {
  const args = process.argv.slice(2).join(' ').trim();
  if (!args) throw new Error('Usage: npm run gio -- <your message>');

  return args;
}

/** Used in CLI entry when this file is the main module. */
async function gioCli(prompt: string) {
  const relevantAgent = await askLlmToIdentifyRelevantAgent(prompt);

  if (relevantAgent === RelevantAgent.General) {
    const tools = await loadAgentTools();
    const response = await askLlmToGeneralConversation(prompt, tools);

    console.log(`relevant agent: ${relevantAgent}`);
    console.log(response);
    await afterGeneralConversationReply(prompt, response);
    return;
  }

  const result = relevantAgent === RelevantAgent.Lesson
    ? await askLlmToIdentifyLessonIntent(prompt)
    : await askLlmToIdentifyExercisesIntent(prompt);
  const kind = relevantAgent === RelevantAgent.Lesson ? 'lessons' : 'exercises';

  logStudyOutputStatus(kind, result.source, result.savedPath);
  console.log(`relevant agent: ${relevantAgent}`);
  console.log(result.markdown);
  if (result.emailed) console.log('Emailed via send_email tool.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is not set');
  gioCli(readCliPrompt()).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
