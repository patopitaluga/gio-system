/**
 * Reads gitignored `student-context.md` — who the student is and how tutors should adapt
 * (native language, target language, level, goals, tone). Override the path with
 * `STUDENT_CONTEXT_PATH` in `.env`.
 *
 * **Callers**:
 * - `conversation/instructions.ts` — Realtime session instructions (`buildAgentInstructions`)
 * - `agent-interests.ts` — interests-observer runs (`askLlmToIdentifyInterests`)
 * - `agent-shortcomings.ts` — shortcomings-observer runs (`askLlmToIdentifyShortcomings`)
 * - `agent-vocabulary.ts` — vocabulary-agent instructions (`askLlmToShowVocabulary`)
 * - `conversation/index.ts` — warms cache at server startup (`createAgentService`)
 *
 * No field parsing: the whole markdown is passed to the LLM. See `student-context.example.md`.
 */
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { projectRoot } from './workspace.ts';

const DEFAULT_CONTEXT_FILE = 'student-context.md';

let cachedContent: string | null = null;
let cachedMtime = 0;

/** Imported in `loadStudentContext`. */
export function resolveStudentContextPath(): string {
  const configured = process.env.STUDENT_CONTEXT_PATH?.trim();

  if (!configured) return path.join(projectRoot, DEFAULT_CONTEXT_FILE);

  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(projectRoot, configured);
}

/**
 * Returns student context markdown, cached until the file changes.
 *
 * Imported in `conversation/instructions.ts`, `agent-interests.ts`, and `agent-vocabulary.ts`.
 */
export function loadStudentContext(): string {
  const contextPath = resolveStudentContextPath();
  const mtime = existsSync(contextPath) ? statSync(contextPath).mtimeMs : 0;

  if (cachedContent !== null && cachedMtime === mtime) return cachedContent;

  if (!existsSync(contextPath)) {
    cachedContent = '';
    cachedMtime = mtime;

    return '';
  }

  const content = readFileSync(contextPath, 'utf8').trim();

  cachedContent = content;
  cachedMtime = mtime;

  return content;
}

/** Warms the cache at server startup. Imported in `conversation/index.ts` (`createAgentService`). */
export function warmStudentContext(): void {
  loadStudentContext();
}
