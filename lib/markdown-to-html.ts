import { marked } from 'marked';

/** Imported in `agent-lesson.ts` and `agent-exercises.ts` (`sendLessonByEmail` / `sendExercisesByEmail`). */
export async function markdownToHtml(markdown: string): Promise<string> {
  return marked.parse(markdown);
}
