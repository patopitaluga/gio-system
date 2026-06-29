/**
 * Reads gitignored `agent-context.md` — your personal notes on how the agent
 * should behave. Override the path with `AGENT_CONTEXT_PATH` in `.env`.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { projectRoot } from './workspace.ts';

const DEFAULT_CONTEXT_FILE = 'agent-context.md';

/** Imported in `conversation/instructions.ts` and `agent-interests.ts`. */
export function loadAgentContext(): string {
  const configured = process.env.AGENT_CONTEXT_PATH?.trim();
  const contextPath = !configured
    ? path.join(projectRoot, DEFAULT_CONTEXT_FILE)
    : path.isAbsolute(configured)
      ? path.resolve(configured)
      : path.resolve(projectRoot, configured);

  if (!existsSync(contextPath)) return '';

  return readFileSync(contextPath, 'utf8').trim();
}
