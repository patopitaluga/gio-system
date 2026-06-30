import { tool } from '@openai/agents';
import { z } from 'zod';
import {
  saveShortcoming,
  logShortcomingSaved,
  logShortcomingAlreadySaved,
  type LearningMemoryKind,
} from '../../lib/save-shortcomings.ts';

/** Used in `agents/agent-shortcomings-observer.ts` and `lib/agent-run-trace.ts`. */
export const SAVE_SHORTCOMING_TOOL_NAME = 'save_shortcoming';

/** Imported in `agents/agent-shortcomings-observer.ts`. */
export const saveShortcomingTool = tool({
  name: SAVE_SHORTCOMING_TOOL_NAME,
  description:
    'Save a language mistake (shortcoming) or practice opportunity the student showed in this turn to shortcomings.md. '
    + 'Use shortcoming for errors — especially agreement (singular/plural, gender, subject–verb). '
    + 'Use opportunity for gaps, near-misses, or topics worth revisiting.',
  parameters: z.object({
    kind: z
      .enum(['shortcoming', 'opportunity'])
      .describe('shortcoming = a mistake; opportunity = a gap or practice angle worth remembering'),
    topic: z
      .string()
      .min(1)
      .describe('Short label, e.g. "Passato prossimo auxiliary" or "Congiuntivo after pensare"'),
    note: z
      .string()
      .optional()
      .describe('Brief context from the conversation — quote the error or what revealed the gap'),
  }),
  async execute({ kind, topic, note }) {
    const result = saveShortcoming(kind as LearningMemoryKind, topic, note);

    if (result.saved) logShortcomingSaved(result.kind, result.topic, result.savedPath);
    else if (result.duplicate) logShortcomingAlreadySaved(result.kind, result.topic, result.savedPath);

    return JSON.stringify(result);
  },
});
