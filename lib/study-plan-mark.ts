import { readFileSync, writeFileSync } from 'fs';
import { STUDY_PLAN_PATH } from './study-plan-context.ts';

export function markStudyPlanItemInContent(
  content: string,
  itemText: string,
  todayLabel: string,
): { content: string; marked: string } {
  const header = `- **${todayLabel}:**`;
  const headerIndex = content.indexOf(header);

  if (headerIndex === -1)
    throw new Error(`No plan entry for ${todayLabel}`);

  const afterHeader = content.slice(headerIndex + header.length);
  const nextEntryOffset = afterHeader.search(/\n- \*\*|\n## /);
  const sectionEnd = nextEntryOffset === -1
    ? content.length
    : headerIndex + header.length + nextEntryOffset;

  const section = content.slice(headerIndex, sectionEnd);
  const lines = section.split('\n');
  const normalizedSearch = itemText.trim().toLowerCase();
  let markedLine = '';

  const updatedLines = lines.map((line) => {
    if (markedLine) return line;

    const normalizedLine = line.toLowerCase();

    if (/^\s*- \[x\]/.test(line) && normalizedLine.includes(normalizedSearch)) {
      markedLine = line;
      return line;
    }

    if (!/^\s*- \[ \]/.test(line)) return line;
    if (!normalizedLine.includes(normalizedSearch)) return line;

    markedLine = line;
    return line.replace('- [ ]', '- [x]');
  });

  if (!markedLine)
    throw new Error(`Could not find plan item matching "${itemText}" for ${todayLabel}`);

  const updatedSection = updatedLines.join('\n');
  const updatedContent = content.slice(0, headerIndex) + updatedSection + content.slice(sectionEnd);

  return { content: updatedContent, marked: itemText };
}

export function markStudyPlanItems(itemTexts: string[], todayLabel: string): string[] {
  let content = readFileSync(STUDY_PLAN_PATH, 'utf8');
  const marked: string[] = [];

  for (const itemText of itemTexts) {
    const result = markStudyPlanItemInContent(content, itemText, todayLabel);
    content = result.content;
    marked.push(result.marked);
  }

  writeFileSync(STUDY_PLAN_PATH, content, 'utf8');

  return marked;
}
