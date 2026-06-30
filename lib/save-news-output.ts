import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { projectRoot } from './workspace.ts';
import { formatCurrentDate } from './study-plan-context.ts';

const NEWS_DIR = 'news';

type SavedNewsOutput = {
  markdown: string;
  savedPath: string;
  dateIso: string;
};

function resolveNewsPath(dateIso: string, root = projectRoot): string {
  return path.join(root, NEWS_DIR, `${dateIso}.md`);
}

/** Imported in `agent-news.ts` and `cronjob.ts`. */
export function saveNewsOutput(
  markdown: string,
  dateIso = formatCurrentDate().iso,
  root = projectRoot,
): string {
  const dir = path.join(root, NEWS_DIR);
  mkdirSync(dir, { recursive: true });

  const filePath = resolveNewsPath(dateIso, root);

  if (!existsSync(filePath)) writeFileSync(filePath, markdown, 'utf8');

  return filePath;
}

/** Imported in `agent-news.ts` and `cronjob.ts`. Used in `test/save-news-output.test.ts`. */
export function readPreviousNews(
  dateIso: string,
  root = projectRoot,
): SavedNewsOutput | null {
  const filePath = resolveNewsPath(dateIso, root);

  if (!existsSync(filePath)) return null;

  return {
    markdown: readFileSync(filePath, 'utf8'),
    savedPath: filePath,
    dateIso,
  };
}

/** Imported in `agent-news.ts` and `cronjob.ts`. */
export function logNewsOutputStatus(
  source: 'archive' | 'generated',
  savedPath: string,
  options?: { prefix?: string },
) {
  const prefix = options?.prefix ?? '';

  if (source === 'archive') {
    console.log(`${prefix}📂 Loaded existing news digest from ${savedPath}`);

    return;
  }

  console.log(`${prefix}✨ New news digest created and saved to ${savedPath}`);
}
