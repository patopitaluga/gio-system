import { type Agent, type RunResult } from '@openai/agents';
import { createAgentRunTrace } from './agent-run-trace.ts';
import { logUserPrompt } from '../utils/turn-log.ts';

/**
 * Sends `input` to an OpenAI Agents SDK agent with prompt logging and run tracing.
 *
 * Logs `input` via `logUserPrompt`, wraps `runner.run` with `createAgentRunTrace`, then
 * returns the SDK `RunResult`.
 *
 * Imported in `agent-lessons.ts`, `agent-exercises.ts`, `agent-interests.ts`,
 * `agent-shortcomings.ts`, `agent-news.ts`, and `agent-reception-orchestrator.ts`.
 *
 * @param agent - Configured SDK agent to call.
 * @param input - Prompt or turn text passed to the agent.
 * @param contextLabel - Label for logs and traces (usually the agent name).
 */
export async function askAgentAndLog<TAgent extends Agent<any, any>>(
  agent: TAgent,
  input: string,
  contextLabel: string,
): Promise<RunResult<any, TAgent>> {
  logUserPrompt(contextLabel, input);

  const trace = createAgentRunTrace(contextLabel);

  try {
    const result = await trace.runner.run(agent, input);

    trace.finish(result);

    return result;
  } catch (error) {
    trace.finishWithError(error);
    throw error;
  }
}
