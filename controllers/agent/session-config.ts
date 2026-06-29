import { RealtimeAgent } from '@openai/agents/realtime';
import { buildTranscriptionPrompt } from '../../config/dictionary.ts';
import { buildAgentInstructions } from './instructions.ts';
import type { AgentTool } from '../../config/tools.ts';

export function createAgent(tools: AgentTool[]) {
  return new RealtimeAgent({
    name: 'Learning assistant',
    instructions: buildAgentInstructions(tools),
    tools,
  });
}

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
