import { type Agent } from '@openai/agents';
import { createAgentRunTrace } from './agent-run-trace.ts';
import { logUserPrompt } from '../utils/turn-log.ts';

/** Runs an agent and logs each API request, tool call, and token usage to the console. */
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
