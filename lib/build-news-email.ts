import { wrapEmailHtml } from './email-html.ts';
import { markdownToHtml } from './markdown-to-html.ts';
import {
  formatNewsPlainText,
  parseNewsMarkdown,
} from './parse-news-markdown.ts';

/** Payload for `sendEmail` when mailing a news reading. */
export type NewsEmailContent = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Builds subject, plain text, and styled HTML for a news reading email.
 *
 * Imported in `agents/agent-news.ts` (`sendNewsByEmail`).
 */
export async function buildNewsEmailContent(
  newsMarkdown: string,
  fallbackDateLabel: string,
): Promise<NewsEmailContent> {
  const parsed = parseNewsMarkdown(newsMarkdown);
  const bodyHtml = parsed.bodyMarkdown
    ? await markdownToHtml(parsed.bodyMarkdown)
    : await markdownToHtml(newsMarkdown);
  const vocabularyHtml = parsed.vocabularyMarkdown
    ? await markdownToHtml(parsed.vocabularyMarkdown)
    : undefined;
  const title = parsed.title || 'Lettura del giorno';
  const subject = parsed.title || `Lettura del giorno — ${fallbackDateLabel}`;

  return {
    subject,
    text: formatNewsPlainText(parsed),
    html: wrapEmailHtml({
      title,
      bodyHtml,
      vocabularyHtml,
      linkUrl: parsed.link,
      linkLabel: 'Leggi l\'articolo originale',
      preheader: parsed.title ? fallbackDateLabel : undefined,
    }),
  };
}
