import { tool } from '@openai/agents/realtime';
import { z } from 'zod';

/**
 * Example plugin. Copy this folder into `plugins/hello/` to enable it.
 *
 * Each plugin is a subdirectory of `plugins/` with an `index.ts` that exports:
 *   export const tools = [ ... ];
 */
export const tools = [
  tool({
    name: 'echo',
    description: 'Returns the message unchanged (example plugin).',
    parameters: z.object({
      message: z.string().describe('Text to echo back'),
    }),
    async execute({ message }) {
      return message;
    },
  }),
];
