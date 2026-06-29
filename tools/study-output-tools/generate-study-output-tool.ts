import { tool } from '@openai/agents';
import { z } from 'zod';

/** Used in `lib/orchestrator.ts`. */
export const GENERATE_NEW_LESSON_TOOL_NAME = 'generate_new_lesson';

/** Used in `lib/orchestrator.ts`. */
export const GENERATE_NEW_EXERCISES_TOOL_NAME = 'generate_new_exercises';

/** JSON payload from generate study-output tools; parsed in `lib/orchestrator.ts`. */
export type GenerateStudyOutputResult = {
  markdown: string;
  savedPath: string;
  emailed: boolean;
};

/** Imported in `lib/orchestrator.ts`. */
export function createGenerateNewLessonTool() {
  return tool({
    name: GENERATE_NEW_LESSON_TOOL_NAME,
    description:
      'Generate a brand-new lesson from the study plan. Use when the user wants fresh content '
      + 'or no saved lesson exists for the requested date.',
    parameters: z.object({
      userPrompt: z
        .string()
        .min(1)
        .describe('The full user request to pass to the lesson generator'),
    }),
    async execute({ userPrompt }) {
      const { generateDailyLesson } = await import('../../agent-lesson.ts');
      const result = await generateDailyLesson(userPrompt);
      const payload: GenerateStudyOutputResult = {
        markdown: result.markdown,
        savedPath: result.savedPath,
        emailed: result.emailed,
      };

      return JSON.stringify(payload);
    },
  });
}

/** Imported in `lib/orchestrator.ts`. */
export function createGenerateNewExercisesTool() {
  return tool({
    name: GENERATE_NEW_EXERCISES_TOOL_NAME,
    description:
      'Generate brand-new exercises from the study plan. Use when the user wants fresh content '
      + 'or no saved exercises exist for the requested date.',
    parameters: z.object({
      userPrompt: z
        .string()
        .min(1)
        .describe('The full user request to pass to the exercises generator'),
    }),
    async execute({ userPrompt }) {
      const { generateDailyExercises } = await import('../../agent-exercises.ts');
      const result = await generateDailyExercises(userPrompt);
      const payload: GenerateStudyOutputResult = {
        markdown: result.markdown,
        savedPath: result.savedPath,
        emailed: result.emailed,
      };

      return JSON.stringify(payload);
    },
  });
}
