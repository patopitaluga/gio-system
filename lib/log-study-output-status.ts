import { styleText } from 'node:util';
import type { StudyOutputKind } from './save-study-output.ts';

/** Parameter type for `logStudyOutputStatus`. */
export type StudyOutputSource = 'archive' | 'generated' | 'message';

const STATUS_LABELS: Record<
  StudyOutputKind,
  Record<'archive' | 'generated', string>
> = {
  lessons: {
    archive: '📂 Loaded existing lesson from',
    generated: '✨ New lesson created and saved to',
  },
  exercises: {
    archive: '📂 Loaded existing exercises from',
    generated: '✨ New exercises created and saved to',
  },
};

/** Imported in `agents/agent-lessons.ts`, `agents/agent-exercises.ts`, and `cronjob.ts`. Used in `test/study-output.test.ts`. */
export function logStudyOutputStatus(
  kind: StudyOutputKind,
  source: StudyOutputSource,
  savedPath: string,
  options?: { prefix?: string },
) {
  const prefix = options?.prefix ?? '';

  if (source === 'archive') {
    console.log(
      styleText('cyan', `${prefix}${STATUS_LABELS[kind].archive} ${savedPath}`),
    );

    return;
  }

  if (source === 'generated') {
    console.log(
      styleText('green', `${prefix}${STATUS_LABELS[kind].generated} ${savedPath}`),
    );

    return;
  }

  console.log(
    styleText('yellow', `${prefix}💬 Agent reply (no file on disk)`),
  );
}
