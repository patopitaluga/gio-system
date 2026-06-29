const MERMAID_BLOCK_PATTERN = /```mermaid\r?\n([\s\S]*?)```/g;

function fixNodeLabels(text: string): string {
  return text.replace(/\[([^\]]*)\]/g, (match, label: string) => {
    if (!label.includes('\\n') && !label.includes('\n')) return match;

    return `[${label.replace(/\\n/g, '<br/>').replace(/\r?\n/g, '<br/>')}]`;
  });
}

function normalizeMermaidDiagram(diagram: string): string {
  return fixNodeLabels(diagram);
}

/** Fixes common Mermaid mistakes before writing markdown to disk. */
export function normalizeMarkdownContent(content: string): string {
  if (!content.includes('```mermaid')) return content;

  return content.replace(MERMAID_BLOCK_PATTERN, (block, diagram: string) => {
    return `\`\`\`mermaid\n${normalizeMermaidDiagram(diagram)}\`\`\``;
  });
}

export function shouldNormalizeMarkdown(filePath: string, content: string): boolean {
  return filePath.toLowerCase().endsWith('.md') || content.includes('```mermaid');
}

/** Normalizes diagram lines appended without a surrounding mermaid fence. */
export function normalizeMarkdownChunk(content: string): string {
  if (content.includes('```mermaid')) return normalizeMarkdownContent(content);

  return content
    .split('\n')
    .map((line) => {
      const looksLikeMermaidLine =
        /-->|graph |flowchart |sequenceDiagram|classDiagram|\[[^\]]*\\n/.test(line);

      if (!looksLikeMermaidLine) return line;

      return fixNodeLabels(line);
    })
    .join('\n');
}

export function prepareMarkdownForWrite(filePath: string, content: string): string {
  if (!shouldNormalizeMarkdown(filePath, content)) return content;

  return normalizeMarkdownContent(content);
}

export function prepareMarkdownForAppend(filePath: string, content: string): string {
  if (!filePath.toLowerCase().endsWith('.md') && !content.includes('```mermaid')) return content;

  return normalizeMarkdownChunk(content);
}
