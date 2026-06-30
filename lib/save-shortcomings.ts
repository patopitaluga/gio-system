import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { styleText } from 'node:util';
import { projectRoot } from './workspace.ts';
import { formatCurrentDate } from './study-plan-context.ts';

/** Default path for `loadShortcomingsFile` and `saveShortcoming`. */
export const SHORTCOMINGS_PATH = path.join(projectRoot, 'shortcomings.md');

/** Saved in `shortcomings.md` via `saveShortcoming`. */
export type LearningMemoryKind = 'shortcoming' | 'opportunity';

const SHORTCOMINGS_HEADER = `# Shortcomings and opportunities

Mistakes, gaps, and practice opportunities noticed during conversations — for future lessons and tutoring.

`;

const MEMORY_LINE_PATTERN = /^- \*\*(shortcoming|opportunity): (.+?)\*\*(?: — (.+))? \((noted .+)\)$/;

/** Return type for `saveShortcoming`. */
export type SaveShortcomingResult = {
  saved: boolean;
  savedPath: string;
  topic: string;
  kind: LearningMemoryKind;
  duplicate: boolean;
};

/** Imported in `agents/agent-shortcomings-observer.ts`. Default input for `saveShortcoming`. */
export function loadShortcomingsFile(shortcomingsPath = SHORTCOMINGS_PATH): string {
  if (!existsSync(shortcomingsPath)) return '';

  return readFileSync(shortcomingsPath, 'utf8');
}

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

function memoryKey(kind: LearningMemoryKind, topic: string): string {
  return `${kind}:${normalizeTopic(topic)}`;
}

function listExistingMemoryKeys(content: string): Set<string> {
  const keys = new Set<string>();

  for (const line of content.split('\n')) {
    const match = line.match(MEMORY_LINE_PATTERN);
    if (match) keys.add(memoryKey(match[1] as LearningMemoryKind, match[2]));
  }

  return keys;
}

function ensureShortcomingsFile(content: string): string {
  const trimmed = content.trim();

  if (!trimmed) return SHORTCOMINGS_HEADER;

  if (trimmed.startsWith('# Shortcomings')) return `${trimmed}\n`;

  return `${SHORTCOMINGS_HEADER}${trimmed}\n`;
}

/** Imported in `tools/shortcomings-tools/save-shortcoming.ts`. Used in `test/shortcomings.test.ts`. */
export function saveShortcoming(
  kind: LearningMemoryKind,
  topic: string,
  note?: string,
  dateIso = formatCurrentDate().iso,
  shortcomingsPath = SHORTCOMINGS_PATH,
): SaveShortcomingResult {
  const trimmedTopic = topic.trim();
  if (!trimmedTopic) throw new Error('Learning memory topic is required');

  const existingContent = loadShortcomingsFile(shortcomingsPath);
  const existingKeys = listExistingMemoryKeys(existingContent);
  const key = memoryKey(kind, trimmedTopic);

  if (existingKeys.has(key)) return {
      saved: false,
      savedPath: shortcomingsPath,
      topic: trimmedTopic,
      kind,
      duplicate: true,
    };

  const noteText = note?.trim();
  const line = noteText
    ? `- **${kind}: ${trimmedTopic}** — ${noteText} (noted ${dateIso})`
    : `- **${kind}: ${trimmedTopic}** (noted ${dateIso})`;

  const base = ensureShortcomingsFile(existingContent);
  writeFileSync(shortcomingsPath, `${base}${line}\n`, 'utf8');

  return {
    saved: true,
    savedPath: shortcomingsPath,
    topic: trimmedTopic,
    kind,
    duplicate: false,
  };
}

/** Imported in `tools/shortcomings-tools/save-shortcoming.ts` and `agents/agent-shortcomings-observer.ts`. */
export function logShortcomingSaved(
  kind: LearningMemoryKind,
  topic: string,
  savedPath: string,
) {
  const label = kind === 'shortcoming' ? 'Shortcoming' : 'Opportunity';

  console.log(
    styleText('yellow', `📌 ${label} noted, saving to ${savedPath}: ${topic}`),
  );
}

/** Imported in `tools/shortcomings-tools/save-shortcoming.ts` and `agents/agent-shortcomings-observer.ts`. */
export function logShortcomingAlreadySaved(
  kind: LearningMemoryKind,
  topic: string,
  savedPath: string,
) {
  console.log(
    styleText('dim', `📌 Already saved in ${savedPath} (${kind}): ${topic}`),
  );
}
