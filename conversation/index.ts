/**
 * Application entry point for the conversation assistant.
 *
 * Wires startup dependencies: loads tools (`loadAgentTools`), then
 * Constructs a `TurnSessionManager` bound to that tool list. Warms the student context
 * cache once via `warmStudentContext`. Called once when the Express server starts.
 *
 * **Exports** (1 function):
 * - `createAgentService` — loads tools and returns the session manager
 *
 * @module conversation/index
 */
import { TurnSessionManager } from './session-manager.ts';
import { warmStudentContext } from '../lib/student-context.ts';
import { loadAgentTools } from './plugin-tools.ts';

/**
 * Loads agent tools and creates the session manager for the server lifetime.
 *
 * Imported in:
 * - `server.ts` — startup; `sessionManager` is passed to HTTP and WebSocket handlers
 *
 * Returns:
 * - `sessionManager` — used by `createTurnPostHandler` and `attachWebSocket`
 * - `agentTools` — the resolved tool list (currently unused outside this module)
 */
export async function createAgentService() {
  const agentTools = await loadAgentTools();
  warmStudentContext();
  const sessionManager = new TurnSessionManager(agentTools);

  return { sessionManager, agentTools };
}
