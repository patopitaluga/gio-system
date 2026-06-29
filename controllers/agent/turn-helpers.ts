import type { TurnMetadata } from './types.ts';

import { parseToolArguments } from '../../lib/parse-tool-arguments.ts';

export { parseToolArguments };

export function formatToolAction(
  toolName: string,
  args: Record<string, unknown>,
  result: string,
): string {
  if (result.startsWith('Error:')) {
    const target =
      args.filePath ??
      args.directoryPath ??
      args.fromPath ??
      args.toPath ??
      'file';
    return `${toolName} failed on ${String(target)}: ${result}`;
  }

  switch (toolName) {
    case 'write_file':
    case 'append_file':
    case 'delete_file':
    case 'rename_file':
      return `${toolName}: ${result}`;
    case 'read_file': {
      const filePath = String(args.filePath ?? 'file');
      return `${toolName}: read ${filePath} (${result.length} bytes)`;
    }
    case 'list_files':
      return `${toolName}: ${result.split('\n')[0]}`;
    default:
      return result ? `${toolName}: ${result}` : `${toolName} ran`;
  }
}

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

export function responseHasToolCalls(event: {
  type: string;
  response?: { output?: Array<{ type: string }> };
}): boolean {
  return event.response?.output?.some((item) => item.type === 'function_call') ?? false;
}

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
