import { RealtimeAgent as ConversationAgent } from '@openai/agents/realtime';

/** Used in `conversation/plugin-tools.ts`, `conversation/session-manager.ts`, and `lib/plugins.ts`. */
export type AgentTool = NonNullable<
  NonNullable<ConstructorParameters<typeof ConversationAgent>[0]>['tools']
>[number];

/** Imported in `conversation/instructions.ts`, `conversation/plugin-tools.ts`, and `lib/agent-run-trace.ts`. Used in `test/tools.test.ts`. */
export function getToolName(tool: unknown): string | undefined {
  if (typeof tool === 'object' && tool !== null && 'name' in tool) {
    const { name } = tool as { name: unknown };

    if (typeof name === 'string' && name.trim()) return name;
  }

  return undefined;
}

/** Imported in `conversation/plugin-tools.ts`. Used in `test/tools.test.ts`. */
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
