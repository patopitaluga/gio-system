/**
 * **general-conversation-agent** — Realtime multimodal agent for the `general` route
 * (voice, text, images): open conversation, language Q&A, email, plugins — anything
 * that is not a lesson or exercises request.
 *
 * **Exports**:
 * - `createAgent` — builds the Realtime agent; imported in `conversation/session-manager.ts`
 * - `createSessionConfig` — Realtime API transport/model/audio options for the same session
 */
import { RealtimeAgent as ConversationAgent } from '@openai/agents/realtime';
import { buildTranscriptionPrompt } from '../lib/disambiguation.ts';
import { buildAgentInstructions } from './instructions.ts';
import type { AgentTool } from '../lib/tools.ts';

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
