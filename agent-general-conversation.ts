/**
 * **general-conversation-agent** — Realtime multimodal agent for the `general` route
 * (voice, text, images): open conversation, language Q&A, email, plugins — anything
 * that is not a lesson or exercises request.
 *
 * **Exports**:
 * - `createAgent` — builds the Realtime agent; imported in `conversation/session-manager.ts`
 * - `createSessionConfig` — Realtime API transport/model/audio options for the same session
 * - `askLlmToGeneralConversation` — text CLI path; imported in `agent-reception-orchestrator.ts`
 * - `afterGeneralConversationReply` — post-reply interests; imported in `conversation/session-manager.ts` and `agent-reception-orchestrator.ts`
 */
import { Agent } from '@openai/agents';
import { RealtimeAgent as ConversationAgent } from '@openai/agents/realtime';
import { askLlmToIdentifyInterests } from './agent-interests.ts';
import { askAgentAndLog } from './lib/ask-agent.ts';
import { buildTranscriptionPrompt } from './lib/disambiguation.ts';
import { logTurnError } from './utils/turn-log.ts';
import { buildAgentInstructions } from './conversation/instructions.ts';
import type { AgentTool } from './lib/tools.ts';

/** Imported in `conversation/session-manager.ts` (`finish`) and `agent-reception-orchestrator.ts` (`gioCli`). */
export function afterGeneralConversationReply(userPrompt: string, assistantResponse: string) {
  return askLlmToIdentifyInterests(userPrompt, assistantResponse, 'conversation').catch((error) => {
    logTurnError('interests identification failed', error, { source: 'conversation' });
  });
}

/**
 * **general-conversation-agent** — text turn for CLI (`npm run gio`).
 *
 * Imported in `agent-reception-orchestrator.ts` (`gioCli`).
 */
export async function askLlmToGeneralConversation(
  userPrompt: string,
  tools: AgentTool[],
): Promise<string> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('User prompt is required');

  const agent = new Agent({
    name: 'general-conversation-agent',
    instructions: buildAgentInstructions(tools),
    tools,
  });
  const result = await askAgentAndLog(agent, prompt, 'general-conversation-agent');
  const response = result.finalOutput?.trim();

  if (!response) throw new Error('general-conversation-agent did not produce a response');

  return response;
}

/** Used in `conversation/session-manager.ts` (`connect`). */
export function createAgent(tools: AgentTool[]) {
  return new ConversationAgent({
    name: 'general-conversation-agent',
    instructions: buildAgentInstructions(tools),
    tools,
  });
}

/** Used in `conversation/session-manager.ts` (`connect`). Realtime SDK session options — not user-facing config. */
export function createSessionConfig() {
  const transcriptionPrompt = buildTranscriptionPrompt();
  const transcription: {
    model: 'gpt-4o-mini-transcribe';
    language: string;
    prompt?: string;
  } = {
    model: 'gpt-4o-mini-transcribe',
    language: 'es',
  };

  if (transcriptionPrompt) transcription.prompt = transcriptionPrompt;

  return {
    transport: 'websocket' as const,
    // gpt-realtime-1.5 for multimodal input (audio, text, images); turn-based, text-only output — not streaming UX.
    model: 'gpt-realtime-1.5',
    config: {
      outputModalities: ['text'] as ('text' | 'audio')[],
      audio: {
        input: {
          format: 'pcm16' as const,
          turnDetection: null,
          transcription,
        },
      },
    },
  };
}
