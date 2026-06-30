import { tool } from '@openai/agents';
import { z } from 'zod';
import {
  readPreviousExercise,
  readPreviousLesson,
  type StudyOutputKind,
} from '../../lib/save-study-output.ts';
import { StudyOutputToolName } from './tool-names.ts';

/** JSON payload from retrieve study-output tools; parsed in `lib/resolve-agent-output.ts`. */
export type RetrieveStudyOutputResult = {
  found: boolean;
  dateIso: string;
  markdown?: string;
  savedPath?: string;
};

/** Used in retrieve tools below. Used in `test/study-output.test.ts`. */
export function retrieveStudyOutput(
  kind: StudyOutputKind,
  dateIso: string,
  root?: string,
): RetrieveStudyOutputResult {
  const loaded = kind === 'lessons'
    ? readPreviousLesson(dateIso, root)
    : readPreviousExercise(dateIso, root);

  if (!loaded) return { found: false, dateIso };

  return {
    found: true,
    dateIso,
    markdown: loaded.markdown,
    savedPath: loaded.savedPath,
  };
}

function createRetrieveExistingStudyOutputTool(
  kind: StudyOutputKind,
  toolName: string,
  label: 'lesson' | 'exercises',
) {
  return tool({
    name: toolName,
    description:
      `Load a previously saved ${label} from disk for the given ISO date (YYYY-MM-DD). `
      + 'Returns the exact stored markdown when found.',
    parameters: z.object({
      dateIso: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe('ISO date of the saved file, e.g. "2026-06-27"'),
    }),
    async execute({ dateIso }) {
      return JSON.stringify(retrieveStudyOutput(kind, dateIso));
    },
  });
}

/** Imported in `agent-lessons.ts`. */
export const retrieveExistingLessonTool = createRetrieveExistingStudyOutputTool(
  'lessons',
  StudyOutputToolName.RetrieveLesson,
  'lesson',
);

/** Imported in `agent-exercises.ts`. */
export const retrieveExistingExercisesTool = createRetrieveExistingStudyOutputTool(
  'exercises',
  StudyOutputToolName.RetrieveExercises,
  'exercises',
);
