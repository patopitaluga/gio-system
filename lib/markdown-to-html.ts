import { marked } from 'marked';

/** Imported in `lib/build-news-email.ts`, `agents/agent-lessons.ts`, and `agents/agent-exercises.ts`. */
export async function markdownToHtml(markdown: string): Promise<string> {
  return marked.parse(markdown);
}
