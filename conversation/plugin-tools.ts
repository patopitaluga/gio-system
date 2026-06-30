/**
 * Registers every tool **general-conversation-agent** can call.
 *
 * Loads tools from local plugins in the gitignored `plugins/` folder
 * (`loadPluginTools`), then passed to `TurnSessionManager`. Lesson and exercises
 * requests are handled by `agents/agent-reception-orchestrator.ts` before the conversation agent sees them.
 * Email is handled by generate-lesson-agent / generate-exercises-agent or cron — not here.
 *
 * **Exports** (1 function):
 * - `loadAgentTools` — loads plugins, logs the final tool names,
 *   returns the list for the general-conversation session
 *
 * @module conversation/plugin-tools
 */
import { filterNamedTools, getToolName, type AgentTool } from '../lib/tools.ts';
import { loadPluginTools, resolvePluginsDir } from '../lib/plugins.ts';

/**
 * Assembles plugin tools for general-conversation-agent.
 *
 * Imported in:
 * - `conversation/index.ts` — `createAgentService`
 *
 * Passed to:
 * - `TurnSessionManager` — tools on the session at connect time
 * - `buildAgentInstructions` via `createAgent` — available-tools section in system prompt
 */
export async function loadAgentTools(): Promise<AgentTool[]> {
  const agentTools = filterNamedTools(await loadPluginTools(resolvePluginsDir()));
  const toolNames = agentTools.map((tool) => getToolName(tool)).filter(Boolean);

  console.log('Agent tools loaded', { tools: toolNames });

  return agentTools;
}
