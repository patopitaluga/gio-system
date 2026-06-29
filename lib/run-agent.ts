import { type Agent } from '@openai/agents';
import { createAgentRunTrace } from './agent-run-trace.ts';
import { logUserPrompt } from '../utils/turn-log.ts';

/** Imported in `agent-lesson.ts`, `agent-exercises.ts`, `agent-interests.ts`, and `lib/orchestrator.ts`. */
export async function runLoggedAgent<TAgent extends Agent<any, any>>(
  agent: TAgent,
  input: string,
  contextLabel: string,
) {
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
