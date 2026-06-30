import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { styleText } from 'node:util';
import { projectRoot } from './workspace.ts';
import { formatCurrentDate } from './study-plan-context.ts';

/** Default path for `loadInterestsFile` and `saveInterest`. */
export const INTERESTS_PATH = path.join(projectRoot, 'interests.md');

const INTERESTS_HEADER = `# Interests

Topics the learner has expressed interest in during conversations.

`;

const INTEREST_LINE_PATTERN = /^- \*\*(.+?)\*\*(?: — (.+))? \((noted .+)\)$/;

/** Return type for `saveInterest`. */
export type SaveInterestResult = {
  saved: boolean;
  savedPath: string;
  topic: string;
  duplicate: boolean;
};

/** Imported in `agent-interests.ts`. Default input for `saveInterest`. */
export function loadInterestsFile(interestsPath = INTERESTS_PATH): string {
  if (!existsSync(interestsPath)) return '';

  return readFileSync(interestsPath, 'utf8');
}

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

function listExistingTopics(content: string): Set<string> {
  const topics = new Set<string>();

  for (const line of content.split('\n')) {
    const match = line.match(INTEREST_LINE_PATTERN);
    if (match) topics.add(normalizeTopic(match[1]));
  }

  return topics;
}

/** Used in `listSavedInterestLabels` and `findRestatedSavedInterest`. */
function listSavedInterestLabels(content: string): { label: string; normalized: string }[] {
  const labels: { label: string; normalized: string }[] = [];

  for (const line of content.split('\n')) {
    const match = line.match(INTEREST_LINE_PATTERN);
    if (match) labels.push({ label: match[1], normalized: normalizeTopic(match[1]) });
  }

  return labels;
}

/** Used in `findRestatedSavedInterest`. */
function interestSegmentsFromUserPrompt(userPrompt: string): string[] | null {
  const match = userPrompt.match(/\binterested in\s+(.+)/is);
  if (!match) return null;

  const clause = match[1].replace(/[.?!].*$/, '').trim();
  if (!clause) return null;

  return clause.split(/\s+and\s+|,/i).map((segment) => segment.trim()).filter(Boolean);
}

/** Used in `findRestatedSavedInterest`. */
function segmentMatchesSavedTopic(segment: string, savedTopics: { label: string; normalized: string }[]): boolean {
  const segNorm = normalizeTopic(segment);

  return savedTopics.some(
    (topic) => segNorm.includes(topic.normalized) || topic.normalized.includes(segNorm),
  );
}

/**
 * When the user only restates interest in topics already in `interests.md`, returns the
 * first matching saved label so callers can skip interests-observer-agent.
 *
 * Imported in `agent-interests.ts`. Used in `test/interests.test.ts`.
 */
export function findRestatedSavedInterest(
  userPrompt: string,
  interestsContent = loadInterestsFile(),
): string | null {
  const segments = interestSegmentsFromUserPrompt(userPrompt);
  if (!segments || segments.length === 0) return null;

  const savedTopics = listSavedInterestLabels(interestsContent);
  if (savedTopics.length === 0) return null;

  for (const segment of segments) {
    if (!segmentMatchesSavedTopic(segment, savedTopics)) return null;
  }

  const firstMatch = savedTopics.find(
    (topic) => segmentMatchesSavedTopic(segments[0], [topic]),
  );

  return firstMatch?.label ?? segments[0];
}

function ensureInterestsFile(content: string): string {
  const trimmed = content.trim();

  if (!trimmed) return INTERESTS_HEADER;

  if (trimmed.startsWith('# Interests')) return `${trimmed}\n`;

  return `${INTERESTS_HEADER}${trimmed}\n`;
}

/** Imported in `tools/interest-tools/save-interest.ts`. Used in `test/interests.test.ts`. */
export function saveInterest(
  topic: string,
  note?: string,
  dateIso = formatCurrentDate().iso,
  interestsPath = INTERESTS_PATH,
): SaveInterestResult {
  const trimmedTopic = topic.trim();
  if (!trimmedTopic) throw new Error('Interest topic is required');

  const existingContent = loadInterestsFile(interestsPath);
  const existingTopics = listExistingTopics(existingContent);

  if (existingTopics.has(normalizeTopic(trimmedTopic))) return {
      saved: false,
      savedPath: interestsPath,
      topic: trimmedTopic,
      duplicate: true,
    };

  const noteText = note?.trim();
  const line = noteText
    ? `- **${trimmedTopic}** — ${noteText} (noted ${dateIso})`
    : `- **${trimmedTopic}** (noted ${dateIso})`;

  const base = ensureInterestsFile(existingContent);
  writeFileSync(interestsPath, `${base}${line}\n`, 'utf8');

  return {
    saved: true,
    savedPath: interestsPath,
    topic: trimmedTopic,
    duplicate: false,
  };
}

/** Imported in `tools/interest-tools/save-interest.ts` and `agent-interests.ts`. */
export function logInterestSaved(topic: string, savedPath: string) {
  console.log(
    styleText('green', `💡 Interest identified, saving to ${savedPath}: ${topic}`),
  );
}

/** Imported in `tools/interest-tools/save-interest.ts` and `agent-interests.ts`. */
export function logInterestAlreadySaved(topic: string, savedPath: string) {
  console.log(
    styleText('dim', `💡 Interest already saved in ${savedPath}: ${topic}`),
  );
}
