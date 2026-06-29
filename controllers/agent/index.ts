/**
 * Application entry point for the Realtime agent.
 *
 * Wires startup dependencies: loads tools (`loadAgentTools`), then
 * constructs a `TurnSessionManager` bound to that tool list. Called
 * once when the Express server starts.
 *
 * **Exports** (1 function):
 * - `createAgentService` — loads tools and returns the session manager
 *
 * @module controllers/agent/index
 */
import { TurnSessionManager } from './session-manager.ts';
import { loadAgentTools } from './tools.ts';

/**
 * Loads agent tools and creates the session manager for the server lifetime.
 *
 * Imported in:
 * - `server.ts` — startup; `sessionManager` is passed to HTTP and WebSocket handlers
 *
 * Returns:
 * - `sessionManager` — used by `createTurnPostHandler` and `attachRealtimeWebSocket`
 * - `agentTools` — the resolved tool list (currently unused outside this module)
 */
export async function createAgentService() {
  const agentTools = await loadAgentTools();
  const sessionManager = new TurnSessionManager(agentTools);

  return { sessionManager, agentTools };
}
