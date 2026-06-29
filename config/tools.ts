import type { RealtimeAgent } from '@openai/agents/realtime';

export type AgentTool = NonNullable<
  NonNullable<ConstructorParameters<typeof RealtimeAgent>[0]>['tools']
>[number];

export function getToolName(tool: unknown): string | undefined {
  if (typeof tool === 'object' && tool !== null && 'name' in tool) {
    const { name } = tool as { name: unknown };

    if (typeof name === 'string' && name.trim()) return name;
  }

  return undefined;
}

/** Drops tool entries that have no usable name. */
export function filterNamedTools<T>(tools: T[]): T[] {
  return tools.filter((tool) => {
    const name = getToolName(tool);

    if (!name) {
      console.warn('Skipping tool without a name');
      return false;
    }

    return true;
  });
}
