import type { RunItem } from '@openai/agents';

function getToolCallId(item: RunItem): string | undefined {
  if (item.type !== 'tool_call_item' && item.type !== 'tool_call_output_item') return undefined;

  const raw = item.rawItem as { callId?: string; call_id?: string; id?: string };

  return raw.callId ?? raw.call_id ?? raw.id;
}

function getToolCallName(item: RunItem): string | undefined {
  if (item.type !== 'tool_call_item') return undefined;

  const raw = item.rawItem as { name?: string };

  return raw.name;
}

/** Returns parsed tool outputs for a given tool name, in call order. */
export function getToolOutputs<T>(
  items: RunItem[],
  toolName: string,
  parse: (output: unknown) => T | undefined,
): T[] {
  const callIdToName = new Map<string, string>();
  const results: T[] = [];

  for (const item of items) {
    if (item.type === 'tool_call_item') {
      const callId = getToolCallId(item);
      const name = getToolCallName(item);

      if (callId && name) callIdToName.set(callId, name);
    }

    if (item.type !== 'tool_call_output_item') continue;

    const callId = getToolCallId(item);
    const name = callId ? callIdToName.get(callId) : undefined;

    if (name !== toolName) continue;

    const parsed = parseToolJsonOutput(item.output, parse);
    if (parsed !== undefined) results.push(parsed);
  }

  return results;
}

export function wasAnyToolUsed(items: RunItem[], toolNames: string[]): boolean {
  const allowed = new Set(toolNames);

  return items.some((item) => {
    const name = getToolCallName(item);

    return name !== undefined && allowed.has(name);
  });
}

function parseToolJsonOutput<T>(
  output: unknown,
  parse: (value: unknown) => T | undefined,
): T | undefined {
  if (typeof output === 'string') 
    try {
      return parse(JSON.parse(output));
    } catch {
      return undefined;
    }
  

  return parse(output);
}
