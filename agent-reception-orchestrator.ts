/**
 * App entry triage: **reception-orchestrator-agent** routes each user message to
 * general conversation, lessons, or exercises.
 *
 * **Exports**:
 * - `runOrchestrator` — invokes **reception-orchestrator-agent**; imported in `conversation/session-manager.ts`
 * - `OrchestratorRoute` — `general` | `lesson` | `exercises`
 * - `resolveOrchestratorRoute` — parse agent output; used in tests
 */
import { Agent } from '@openai/agents';
import { invokeLoggedAgent } from './lib/invoke-agent.ts';
import { assertAgentEnv } from './lib/study-plan-context.ts';
import { NO_CAPTATION_FOLLOWUP_RULE } from './lib/prompt-rules.ts';

/** Orchestrator triage outcomes. Used in `agent-reception-orchestrator.ts`, `conversation/session-manager.ts`, and `test/study-output.test.ts`. */
export const OrchestratorRoute = {
  General: 'general',
  Lesson: 'lesson',
  Exercises: 'exercises',
} as const;

export type OrchestratorRoute = (typeof OrchestratorRoute)[keyof typeof OrchestratorRoute];

/** Used in `createReceptionOrchestratorAgent`. */
function buildReceptionOrchestratorInstructions(): string {
  return `You are Gio-System's reception-orchestrator agent — the first routing step for every user message. Reply with ONLY one word — no punctuation, no explanation:
- "${OrchestratorRoute.General}" — general conversation, language Q&A, email, or anything that is NOT specifically requesting lesson or exercises content.
- "${OrchestratorRoute.Lesson}" — the user wants lesson content (study theory, learn, review, or repeat a saved lesson, teaching content).
- "${OrchestratorRoute.Exercises}" — the user wants exercises (practice, drills, activities). Repeat or review exercises is exercises; repeat or review a lesson is lesson, not exercises.

${NO_CAPTATION_FOLLOWUP_RULE}`;
}

/** Used in `runOrchestrator`. */
function createReceptionOrchestratorAgent(): Agent {
  return new Agent({
    name: 'reception-orchestrator-agent',
    instructions: buildReceptionOrchestratorInstructions(),
    tools: [],
  });
}

/** Used in `runOrchestrator`. Used in `test/study-output.test.ts`. */
export function resolveOrchestratorRoute(
  result: { finalOutput?: string | null },
): OrchestratorRoute {
  const route = result.finalOutput?.trim().toLowerCase() ?? '';

  if (route === OrchestratorRoute.General) return OrchestratorRoute.General;
  if (route === OrchestratorRoute.Lesson) return OrchestratorRoute.Lesson;
  if (route === OrchestratorRoute.Exercises) return OrchestratorRoute.Exercises;

  throw new Error(`reception-orchestrator-agent did not produce a valid route: ${JSON.stringify(result.finalOutput)}`);
}

/** **reception-orchestrator-agent** — triage to general, lesson, or exercises. Imported in `conversation/session-manager.ts`. */
export async function runOrchestrator(userPrompt: string): Promise<OrchestratorRoute> {
  assertAgentEnv();

  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('User prompt is required');

  const agent = createReceptionOrchestratorAgent();
  const result = await invokeLoggedAgent(agent, prompt, 'reception-orchestrator-agent');

  return resolveOrchestratorRoute(result);
}
