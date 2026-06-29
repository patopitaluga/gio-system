/**
 * Registers every tool the Realtime fallback agent can call.
 *
 * Built-in communication tools (e.g. `send_email` when SMTP is configured)
 * are merged with tools from local plugins in the gitignored `plugins/` folder
 * (`loadPluginTools`), then passed to `TurnSessionManager`. Lesson and exercises
 * requests are handled by `lib/orchestrator.ts` before the Realtime session sees them.
 *
 * **Exports** (1 function):
 * - `loadAgentTools` — assembles built-ins + plugins, logs the final tool names,
 *   returns the list for the Realtime session
 *
 * @module controllers/agent/tools
 */
import { filterNamedTools, getToolName, type AgentTool } from '../../config/tools.ts';
import { loadPluginTools, resolvePluginsDir } from '../../config/plugins.ts';
import {
  createSendEmailTool,
  isEmailConfigured,
} from '../../tools/communication-tools/send-email.ts';

function createBuiltinTools(): AgentTool[] {
  return isEmailConfigured() ? [createSendEmailTool()] : [];
}

/**
 * Assembles built-in and plugin tools.
 *
 * Imported in:
 * - `controllers/agent/index.ts` — `createAgentService`
 *
 * Passed to:
 * - `TurnSessionManager` — tools on the Realtime fallback agent at connect time
 * - `buildAgentInstructions` via `createAgent` — available-tools section in system prompt
 */
export async function loadAgentTools(): Promise<AgentTool[]> {
  const agentTools = filterNamedTools([
    ...createBuiltinTools(),
    ...await loadPluginTools(resolvePluginsDir()),
  ]);
  const toolNames = agentTools.map((tool) => getToolName(tool)).filter(Boolean);

  console.log('Agent tools loaded', { tools: toolNames });

  return agentTools;
}
