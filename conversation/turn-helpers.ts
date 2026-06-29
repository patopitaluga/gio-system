import type { TurnMetadata } from './types.ts';

import { parseToolArguments } from '../lib/parse-tool-arguments.ts';

/** Re-exported for `conversation/session-manager.ts`. Implemented in `lib/parse-tool-arguments.ts`. Used in `test/turn-helpers.test.ts`. */
export { parseToolArguments };

/** Imported in `conversation/session-manager.ts`. Used in `test/turn-helpers.test.ts`. */
export function formatToolAction(
  toolName: string,
  _args: Record<string, unknown>,
  result: string,
): string {
  if (result.startsWith('Error:')) return `${toolName} failed: ${result}`;

  return result ? `${toolName}: ${result}` : `${toolName} ran`;
}

/** Imported in `conversation/session-manager.ts`. Used in `test/turn-helpers.test.ts`. */
export function buildUserPrompt(metadata: TurnMetadata, transcript?: string): string {
  const parts: string[] = [];

  if (metadata.imageDataUrl) parts.push('[Image attached]');

  const spoken = transcript?.trim();
  const typed = metadata.question?.trim();

  if (spoken && typed && spoken !== typed) parts.push(`${spoken} (${typed})`);
   else if (spoken) 
    parts.push(spoken);
   else if (typed) 
    parts.push(typed);
   else if (metadata.hasAudio) 
    parts.push('Voice command');
  

  return parts.join(' ');
}

/** Imported in `conversation/session-manager.ts`. Used in `test/turn-helpers.test.ts`. */
export function responseHasToolCalls(event: {
  type: string;
  response?: { output?: Array<{ type: string }> };
}): boolean {
  return event.response?.output?.some((item) => item.type === 'function_call') ?? false;
}

/** Imported in `conversation/session-manager.ts`. Used in `test/turn-helpers.test.ts`. */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;

  if (typeof value === 'object' && value !== null) {
    const err = value as { message?: string; error?: { message?: string } };
    if (typeof err.message === 'string' && err.message) return new Error(err.message);
    if (typeof err.error?.message === 'string' && err.error.message) return new Error(err.error.message);
    return new Error(JSON.stringify(value));
  }

  return new Error(String(value));
}
