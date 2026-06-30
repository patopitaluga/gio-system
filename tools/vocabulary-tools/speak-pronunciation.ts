import { tool } from '@openai/agents';
import { z } from 'zod';
import {
  logPronunciationSaved,
  synthesizePronunciationAudio,
} from '../../lib/synthesize-pronunciation.ts';

/** Used in `agents/agent-vocabulary.ts` and `lib/agent-run-trace.ts`. */
export const SPEAK_PRONUNCIATION_TOOL_NAME = 'speak_pronunciation';

/** Imported in `agents/agent-vocabulary.ts`. */
export const speakPronunciationTool = tool({
  name: SPEAK_PRONUNCIATION_TOOL_NAME,
  description:
    'Generate MP3 pronunciation audio for a word or short phrase in the target language. '
    + 'Returns audioUrl to embed in the vocabulary entry markdown.',
  parameters: z.object({
    text: z
      .string()
      .min(1)
      .describe('Word or short phrase to pronounce, in the target language'),
    filenameSlug: z
      .string()
      .optional()
      .describe('Optional safe filename slug without extension, e.g. "curva"'),
  }),
  async execute({ text, filenameSlug }) {
    const result = await synthesizePronunciationAudio(text, { filenameSlug });

    logPronunciationSaved(result.text, result.audioUrl);

    return JSON.stringify(result);
  },
});
