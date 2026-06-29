import { styleText } from 'node:util';
import type { StudyOutputKind } from './save-study-output.ts';

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

/** Prints a colored CLI line indicating whether content was loaded or newly created. */
export function logStudyOutputStatus(
  kind: StudyOutputKind,
  source: StudyOutputSource,
  savedPath: string,
  options?: { prefix?: string },
): void {
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
