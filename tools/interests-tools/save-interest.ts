import { tool } from '@openai/agents';
import { z } from 'zod';
import { saveInterest, logInterestSaved, logInterestAlreadySaved } from '../../lib/save-interests.ts';

/** Used in `agents/agent-interests-observer.ts` and `lib/agent-run-trace.ts`. */
export const SAVE_INTEREST_TOOL_NAME = 'save_interest';

/** Imported in `agents/agent-interests-observer.ts`. */
export const saveInterestTool = tool({
  name: SAVE_INTEREST_TOOL_NAME,
  description:
    'Save a language-learning-relevant topic the user expressed interest in to interests.md. '
    + 'Call only for vocabulary themes, culture, goals, or subjects worth revisiting in their target language.',
  parameters: z.object({
    topic: z
      .string()
      .min(1)
      .describe('Short label for the topic, e.g. "Italian cooking" or "Travel to Rome"'),
    note: z
      .string()
      .optional()
      .describe('Brief context from the conversation explaining the interest'),
  }),
  async execute({ topic, note }) {
    const result = saveInterest(topic, note);

    if (result.saved) logInterestSaved(result.topic, result.savedPath);
    else if (result.duplicate) logInterestAlreadySaved(result.topic, result.savedPath);

    return JSON.stringify(result);
  },
});
