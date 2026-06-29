import { RealtimeAgent as ConversationAgent } from '@openai/agents/realtime';
import { buildTranscriptionPrompt } from '../lib/disambiguation.ts';
import { buildAgentInstructions } from './instructions.ts';
import type { AgentTool } from '../lib/tools.ts';

/** Used in `conversation/session-manager.ts` (`connect`). */
export function createAgent(tools: AgentTool[]) {
  return new ConversationAgent({
    name: 'Learning assistant',
    instructions: buildAgentInstructions(tools),
    tools,
  });
}

/** Used in `conversation/session-manager.ts` (`connect`). */
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
