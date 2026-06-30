/** Parsed fields from news-agent markdown output. */
export type ParsedNewsMarkdown = {
  title: string;
  link: string;
  bodyMarkdown: string;
  vocabularyMarkdown: string;
};

const VOCABULARY_HEADING_PATTERN = /^##\s+Vocab/i;
const MARKDOWN_SEPARATOR_PATTERN = /^-{3,}\s*$/;

/** Used in `parseNewsMarkdown`. */
function isVocabularyStart(line: string): boolean {
  return MARKDOWN_SEPARATOR_PATTERN.test(line) || VOCABULARY_HEADING_PATTERN.test(line);
}

/**
 * Extracts title, source link, article body, and vocabulary from news-agent output.
 *
 * Imported in `lib/build-news-email.ts`. Used in `test/parse-news-markdown.test.ts`.
 */
export function parseNewsMarkdown(markdown: string): ParsedNewsMarkdown {
  const lines = markdown.trim().split('\n');
  let title = '';
  let link = '';
  const bodyLines: string[] = [];
  const vocabularyLines: string[] = [];
  let pastHeader = false;
  let inVocabulary = false;

  for (const line of lines) {
    const heading = line.match(/^#\s+(.+)$/);
    if (heading && !title) {
      title = heading[1].trim();
      continue;
    }

    const linkLine = line.match(/^\*\*Link:\*\*\s*(.+)$/i);
    if (linkLine) {
      link = linkLine[1].trim();
      pastHeader = true;
      continue;
    }

    if (!title) continue;

    if (!inVocabulary && isVocabularyStart(line)) {
      inVocabulary = true;
      if (VOCABULARY_HEADING_PATTERN.test(line)) vocabularyLines.push(line);
      continue;
    }

    if (inVocabulary) vocabularyLines.push(line);
    else {
      pastHeader = true;
      bodyLines.push(line);
    }
  }

  const bodyMarkdown = bodyLines.join('\n').trim();
  const vocabularyMarkdown = vocabularyLines.join('\n').trim();

  if (!title && !pastHeader) {
    return {
      title: '',
      link: '',
      bodyMarkdown: markdown.trim(),
      vocabularyMarkdown: '',
    };
  }

  return { title, link, bodyMarkdown, vocabularyMarkdown };
}

/** Used in `buildNewsEmailContent`. */
export function formatNewsPlainText(parsed: ParsedNewsMarkdown): string {
  const parts: string[] = [];

  if (parsed.title) parts.push(parsed.title);
  if (parsed.link) parts.push('', parsed.link);
  if (parsed.link && parsed.bodyMarkdown) parts.push('', '------');
  if (parsed.bodyMarkdown) parts.push('', parsed.bodyMarkdown);
  if (parsed.bodyMarkdown && parsed.vocabularyMarkdown) parts.push('', '------');
  if (parsed.vocabularyMarkdown) parts.push('', parsed.vocabularyMarkdown);

  return parts.join('\n').trim();
}
