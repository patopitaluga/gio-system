import { tool } from '@openai/agents';
import { z } from 'zod';
import {
  readPreviousExercise,
  readPreviousLesson,
  type StudyOutputKind,
} from '../../lib/save-study-output.ts';

export const RETRIEVE_EXISTING_LESSON_TOOL_NAME = 'retrieve_existing_lesson';
export const RETRIEVE_EXISTING_EXERCISES_TOOL_NAME = 'retrieve_existing_exercises';

export type RetrieveStudyOutputResult = {
  found: boolean;
  dateIso: string;
  markdown?: string;
  savedPath?: string;
};

/** Loads a saved lesson or exercises file. Used by the retrieve tools and tests. */
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

export const retrieveExistingLessonTool = createRetrieveExistingStudyOutputTool(
  'lessons',
  RETRIEVE_EXISTING_LESSON_TOOL_NAME,
  'lesson',
);

export const retrieveExistingExercisesTool = createRetrieveExistingStudyOutputTool(
  'exercises',
  RETRIEVE_EXISTING_EXERCISES_TOOL_NAME,
  'exercises',
);
