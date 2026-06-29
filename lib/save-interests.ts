import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { projectRoot } from '../config/workspace.ts';
import { formatCurrentDate } from './study-plan-context.ts';

export const INTERESTS_PATH = path.join(projectRoot, 'interests.md');

const INTERESTS_HEADER = `# Interests

Topics the learner has expressed interest in during conversations.

`;

const INTEREST_LINE_PATTERN = /^- \*\*(.+?)\*\*(?: — (.+))? \((noted .+)\)$/;

export type SaveInterestResult = {
  saved: boolean;
  savedPath: string;
  topic: string;
  duplicate: boolean;
};

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

function ensureInterestsFile(content: string): string {
  const trimmed = content.trim();

  if (!trimmed) return INTERESTS_HEADER;

  if (trimmed.startsWith('# Interests')) return `${trimmed}\n`;

  return `${INTERESTS_HEADER}${trimmed}\n`;
}

/** Appends a new interest bullet to `interests.md` when the topic is not already saved. */
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

  if (existingTopics.has(normalizeTopic(trimmedTopic))) {
    return {
      saved: false,
      savedPath: interestsPath,
      topic: trimmedTopic,
      duplicate: true,
    };
  }

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
