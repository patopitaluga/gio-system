import { marked } from 'marked';

/** Imported in `agent-lessons.ts` and `agent-exercises.ts` (`sendLessonByEmail` / `sendExercisesByEmail`). */
export async function markdownToHtml(markdown: string): Promise<string> {
  return marked.parse(markdown);
}
