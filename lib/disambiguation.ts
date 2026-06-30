/** Loads gitignored `disambiguation.md`. Override path with `DISAMBIGUATION_PATH` in `.env`. */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { projectRoot } from './workspace.ts';

const DEFAULT_DISAMBIGUATION_FILE = 'disambiguation.md';

/** Used in `test/disambiguation.test.ts`. */
export const TRANSCRIPTION_PROMPT_MAX_CHARS = 1024;

/** Imported in `conversation/instructions.ts`. Default input for `buildTranscriptionPrompt` and `isEmptyOrDisambiguationHallucination`. */
export function loadDisambiguation(): string {
  const configured = process.env.DISAMBIGUATION_PATH?.trim();
  const disambiguationPath = !configured
    ? path.join(projectRoot, DEFAULT_DISAMBIGUATION_FILE)
    : path.isAbsolute(configured)
      ? path.resolve(configured)
      : path.resolve(projectRoot, configured);

  if (!existsSync(disambiguationPath)) return '';

  return readFileSync(disambiguationPath, 'utf8').trim();
}

/** Imported in `conversation/general-conversation-agent.ts` and `conversation/session-manager.ts`. Used in `test/disambiguation.test.ts`. */
export function buildTranscriptionPrompt(disambiguation = loadDisambiguation()): string | undefined {
  if (!disambiguation) return undefined;

  if (disambiguation.length <= TRANSCRIPTION_PROMPT_MAX_CHARS) return disambiguation;

  const truncated = disambiguation.slice(0, TRANSCRIPTION_PROMPT_MAX_CHARS);
  const lastNewline = truncated.lastIndexOf('\n');

  if (lastNewline > TRANSCRIPTION_PROMPT_MAX_CHARS * 0.5) return truncated.slice(0, lastNewline).trimEnd();

  return truncated.trimEnd();
}

/** Imported in `conversation/session-manager.ts`. Used in `test/disambiguation.test.ts`. */
export function isEmptyOrDisambiguationHallucination(
  transcript: string | undefined,
  disambiguation = loadDisambiguation(),
): boolean {
  const spoken = transcript?.trim() ?? '';
  if (!spoken) return true;
  if (!disambiguation) return false;

  const disambiguationLines = disambiguation.split('\n').map((line) => line.trim()).filter(Boolean);
  if (disambiguationLines.length === 0) return false;

  const matchedLines = disambiguationLines.filter((line) => spoken.includes(line));
  if (disambiguationLines.length === 1) return matchedLines.length === 1;

  return matchedLines.length >= 2;
}
