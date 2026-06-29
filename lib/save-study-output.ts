import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { projectRoot } from './workspace.ts';
import { formatCurrentDate } from './study-plan-context.ts';

/** Used in `lib/save-study-output.ts`, `tools/study-output-tools/retrieve-existing-study-output.ts`, and `lib/log-study-output-status.ts`. */
export type StudyOutputKind = 'lessons' | 'exercises';

const DATE_FILENAME_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;

function resolveCanonicalOutputPath(dir: string, dateIso: string): string {
  return path.join(dir, `${dateIso}.md`);
}

/**
 * Imported in `agent-lesson.ts` and `agent-exercises.ts`.
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

/** Imported in `cronjob.ts` and `tools/study-output-tools/retrieve-existing-study-output.ts`. Used in `test/study-output.test.ts`. */
export function readPreviousLesson(
  dateIso: string,
  root = projectRoot,
): SavedStudyOutput | null {
  return readStudyOutputFile('lessons', dateIso, root);
}

/** Imported in `cronjob.ts` and `tools/study-output-tools/retrieve-existing-study-output.ts`. Used in `test/study-output.test.ts`. */
export function readPreviousExercise(
  dateIso: string,
  root = projectRoot,
): SavedStudyOutput | null {
  return readStudyOutputFile('exercises', dateIso, root);
}

/** Imported in `lib/orchestrator.ts`. Used in `test/study-output.test.ts`. */
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
