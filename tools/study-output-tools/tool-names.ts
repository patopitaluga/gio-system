/** OpenAI tool name strings for lesson/exercises retrieve and generate. Any agent may load these tools. Used in `agents/agent-lessons.ts`, `agents/agent-exercises.ts`, `lib/agent-run-trace.ts`, and tests. */
export const StudyOutputToolName = {
  RetrieveLesson: 'retrieve_existing_lesson',
  RetrieveExercises: 'retrieve_existing_exercises',
  GenerateLesson: 'generate_new_lesson',
  GenerateExercises: 'generate_new_exercises',
} as const;

export type StudyOutputToolName = (typeof StudyOutputToolName)[keyof typeof StudyOutputToolName];
