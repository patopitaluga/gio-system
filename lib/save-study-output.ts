import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { projectRoot } from '../config/workspace.ts';
import { formatCurrentDate } from './study-plan-context.ts';

export type StudyOutputKind = 'lessons' | 'exercises';

const DATE_FILENAME_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;

function resolveCanonicalOutputPath(dir: string, dateIso: string): string {
  return path.join(dir, `${dateIso}.md`);
}

/**
 * Used in:
 * - `agent-lesson.ts` — after `generateDailyLesson()`
 * - `agent-exercises.ts` — after `generateDailyExercises()`
 */
export function saveStudyOutput(
  kind: StudyOutputKind,
  markdown: string,
  dateIso = formatCurrentDate().iso,
  root = projectRoot,
): string {
  const dir = path.join(root, kind);
  mkdirSync(dir, { recursive: true });

  const filePath = resolveCanonicalOutputPath(dir, dateIso);

  if (!existsSync(filePath)) writeFileSync(filePath, markdown, 'utf8');

  return filePath;
}

type SavedStudyOutput = {
  markdown: string;
  savedPath: string;
  dateIso: string;
};

function readStudyOutputFile(
  kind: StudyOutputKind,
  dateIso: string,
  root = projectRoot,
): SavedStudyOutput | null {
  const filePath = resolveCanonicalOutputPath(path.join(root, kind), dateIso);

  if (!existsSync(filePath)) return null;

  return {
    markdown: readFileSync(filePath, 'utf8'),
    savedPath: filePath,
    dateIso,
  };
}

/**
 * Used in:
 * - `cronjob.ts` — skip generation when today's lesson file already exists
 * - `tools/study-output-tools/retrieve-existing-study-output.ts` — `retrieve_existing_lesson` tool
 */
export function readPreviousLesson(
  dateIso: string,
  root = projectRoot,
): SavedStudyOutput | null {
  return readStudyOutputFile('lessons', dateIso, root);
}

/**
 * Used in:
 * - `cronjob.ts` — skip generation when today's exercises file already exists
 * - `tools/study-output-tools/retrieve-existing-study-output.ts` — `retrieve_existing_exercises` tool
 */
export function readPreviousExercise(
  dateIso: string,
  root = projectRoot,
): SavedStudyOutput | null {
  return readStudyOutputFile('exercises', dateIso, root);
}

/**
 * Used in:
 * - `lib/orchestrator.ts` — lists recent saved dates in orchestrator instructions
 */
export function listStudyOutputDates(
  kind: StudyOutputKind,
  limit = 10,
  root = projectRoot,
): string[] {
  const dir = path.join(root, kind);

  if (!existsSync(dir)) return [];

  const dates = new Set<string>();

  for (const filename of readdirSync(dir)) {
    const match = filename.match(DATE_FILENAME_PATTERN);
    if (match) dates.add(match[1]);
  }

  return [...dates].sort((a, b) => b.localeCompare(a)).slice(0, limit);
}
