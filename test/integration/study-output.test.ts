/**
 * Integration tests for the lesson orchestrator (real OpenAI Agent + tool runs).
 *
 * Not run by default — requires API access and costs tokens:
 *
 *   RUN_OPENAI_INTEGRATION_TESTS=1 npm run test:integration
 *
 * Loads OPENAI_API_KEY from .env when present (same as other npm scripts).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { projectRoot } from '../../config/workspace.ts';
import { getLesson } from '../../agent-lesson.ts';

const runIntegration =
  process.env.RUN_OPENAI_INTEGRATION_TESTS === '1'
  && Boolean(process.env.OPENAI_API_KEY?.trim());

const INTEGRATION_DATE = '2099-03-15';
const INTEGRATION_MARKER = `integration-lesson-${INTEGRATION_DATE}`;

function integrationLessonPath(dateIso: string): string {
  return path.join(projectRoot, 'lessons', `${dateIso}.md`);
}

/** Local calendar yesterday — matches how the orchestrator LLM resolves "yesterday". */
function getLocalYesterdayIso(): string {
  const now = new Date();
  now.setDate(now.getDate() - 1);

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function writeIntegrationLesson(dateIso: string, content: string): void {
  const filePath = integrationLessonPath(dateIso);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function backupLessonFile(dateIso: string): string | null {
  const filePath = integrationLessonPath(dateIso);

  if (!existsSync(filePath)) return null;

  return readFileSync(filePath, 'utf8');
}

function restoreLessonFile(dateIso: string, backup: string | null): void {
  const filePath = integrationLessonPath(dateIso);

  if (backup === null) {
    if (existsSync(filePath)) rmSync(filePath);

    return;
  }

  writeFileSync(filePath, backup, 'utf8');
}

describe('study output LLM integration', { skip: !runIntegration }, () => {
  describe('getLesson', () => {
    it(
      'calls retrieve_existing_lesson for an explicit saved date',
      { timeout: 120_000 },
      async () => {
        const exactContent = [
          `# ${INTEGRATION_MARKER}`,
          '',
          'This lesson must be returned verbatim by retrieve_existing_lesson.',
        ].join('\n');

        writeIntegrationLesson(INTEGRATION_DATE, exactContent);

        try {
          const result = await getLesson(
            `Please show me the lesson from ${INTEGRATION_DATE}. I want the exact saved version.`,
          );

          assert.equal(result.source, 'archive');
          assert.equal(result.markdown.trim(), exactContent.trim());
          assert.match(result.savedPath, new RegExp(`${INTEGRATION_DATE}\\.md$`));
        } finally {
          restoreLessonFile(INTEGRATION_DATE, null);
        }
      },
    );

    it(
      'calls retrieve_existing_lesson for yesterday and returns saved content',
      { timeout: 120_000 },
      async () => {
        const yesterdayIso = getLocalYesterdayIso();
        const exactContent = [
          `# ${INTEGRATION_MARKER}-yesterday`,
          '',
          'Saved lesson for relative-date integration test.',
        ].join('\n');
        const backup = backupLessonFile(yesterdayIso);

        writeIntegrationLesson(yesterdayIso, exactContent);

        const prompts = [
          'I want to repeat yesterday\'s lesson because I don\'t remember some things.',
          'Quiero repetir la lección de ayer porque no recuerdo algunas cosas.',
        ];

        try {
          let lastResult = await getLesson(prompts[0]);

          for (const prompt of prompts.slice(1)) {
            if (lastResult.source === 'archive') break;

            lastResult = await getLesson(prompt);
          }

          assert.equal(
            lastResult.source,
            'archive',
            `Expected retrieve_existing_lesson for ${yesterdayIso}; `
            + `got source=${lastResult.source}. `
            + `Response starts with: ${lastResult.markdown.slice(0, 160)}`,
          );
          assert.equal(lastResult.markdown.trim(), exactContent.trim());
        } finally {
          restoreLessonFile(yesterdayIso, backup);
        }
      },
    );
  });
});

describe('study output LLM integration (skipped)', { skip: runIntegration }, () => {
  it('documents how to run live OpenAI integration tests', () => {
    assert.ok(true);
  });
});
