import { tool } from '@openai/agents';
import { z } from 'zod';
import { StudyOutputToolName } from './tool-names.ts';

/** JSON payload from generate study-output tools; parsed in `lib/resolve-agent-output.ts`. */
export type GenerateStudyOutputResult = {
  markdown: string;
  savedPath: string;
  emailed: boolean;
};

/** Imported in `agent-lessons.ts`. */
export function createGenerateNewLessonTool() {
  return tool({
    name: StudyOutputToolName.GenerateLesson,
    description:
      'Generate a brand-new lesson from the study plan. Use when the user wants fresh content '
      + 'or no saved lesson exists for the requested date.',
    parameters: z.object({
      userPrompt: z
        .string()
        .min(1)
        .describe('The full user request to pass to generate-lesson-agent'),
    }),
    async execute({ userPrompt }) {
      const { askLlmToGenerateLesson } = await import('../../agent-lessons.ts');
      const result = await askLlmToGenerateLesson(userPrompt);
      const payload: GenerateStudyOutputResult = {
        markdown: result.markdown,
        savedPath: result.savedPath,
        emailed: result.emailed,
      };

      return JSON.stringify(payload);
    },
  });
}

/** Imported in `agent-exercises.ts`. */
export function createGenerateNewExercisesTool() {
  return tool({
    name: StudyOutputToolName.GenerateExercises,
    description:
      'Generate brand-new exercises from the study plan. Use when the user wants fresh content '
      + 'or no saved exercises exist for the requested date.',
    parameters: z.object({
      userPrompt: z
        .string()
        .min(1)
        .describe('The full user request to pass to generate-exercises-agent'),
    }),
    async execute({ userPrompt }) {
      const { askLlmToGenerateExercises } = await import('../../agent-exercises.ts');
      const result = await askLlmToGenerateExercises(userPrompt);
      const payload: GenerateStudyOutputResult = {
        markdown: result.markdown,
        savedPath: result.savedPath,
        emailed: result.emailed,
      };

      return JSON.stringify(payload);
    },
  });
}
