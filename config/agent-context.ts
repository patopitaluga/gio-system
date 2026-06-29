/**
 * Reads gitignored `agent-context.md` — your personal notes on how the agent
 * should behave. Override the path with `AGENT_CONTEXT_PATH` in `.env`.
 *
 * **Exports:**
 * - `resolveAgentContextPath` — resolves the context file path from env
 * - `loadAgentContext` — reads and trims the file, or returns `''` if missing
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { projectRoot } from './workspace.ts';

const DEFAULT_CONTEXT_FILE = 'agent-context.md';

/**
 * Resolves the path to the agent context markdown file.
 *
 * Used in:
 * - `config/agent-context.ts` — `loadAgentContext`
 */
export function resolveAgentContextPath(): string {
  const configured = process.env.AGENT_CONTEXT_PATH?.trim();

  if (!configured) return path.join(projectRoot, DEFAULT_CONTEXT_FILE);

  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(projectRoot, configured);
}

/**
 * Returns the agent context file contents, or an empty string if the file
 * does not exist.
 *
 * Imported in:
 * - `controllers/agent/instructions.ts`
 */
export function loadAgentContext(): string {
  const contextPath = resolveAgentContextPath();

  if (!existsSync(contextPath)) return '';

  return readFileSync(contextPath, 'utf8').trim();
}
