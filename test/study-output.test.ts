import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { RunItem } from '@openai/agents';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { getToolOutputs, wasAnyToolUsed } from '../lib/agent-tool-outputs.ts';
import {
  resolveAgentOutput,
} from '../lib/resolve-agent-output.ts';
import {
  resolveRelevantAgent,
  RelevantAgent,
} from '../agent-reception-orchestrator.ts';
import {
  readPreviousExercise,
  readPreviousLesson,
  listStudyOutputDates,
  saveStudyOutput,
} from '../lib/save-study-output.ts';
import { StudyOutputToolName } from '../tools/study-output-tools/tool-names.ts';
import type { RetrieveStudyOutputResult } from '../tools/study-output-tools/retrieve-existing-study-output.ts';
import {
  retrieveStudyOutput,
} from '../tools/study-output-tools/retrieve-existing-study-output.ts';
import { logStudyOutputStatus } from '../lib/log-study-output-status.ts';
import {
  formatOpenAiUsageLine,
  usageFromAgentsUsage,
  usageFromRealtimeResponse,
} from '../lib/log-openai-usage.ts';
import {
  summarizeToolArgsForLog,
  summarizeToolResultForLog,
} from '../lib/agent-run-trace.ts';
import { Usage } from '@openai/agents';

function toolCall(callId: string, name: string): RunItem {
  return {
    type: 'tool_call_item',
    rawItem: { callId, name },
  } as RunItem;
}

function toolOutput(callId: string, output: string): RunItem {
  return {
    type: 'tool_call_output_item',
    rawItem: { callId },
    output,
  } as RunItem;
}

function isoDateDaysBefore(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString().slice(0, 10);
}

function mockRetrieveToolOutput(result: RetrieveStudyOutputResult): string {
  return JSON.stringify(result);
}

describe('study output orchestrator', () => {
  describe('repeat yesterday lesson', () => {
    /**
     * "Yesterday" / "ayer" → dateIso is the orchestrator LLM's job.
     * Unit tests mock the retrieve tool output. Live LLM + tool runs: `test/integration/study-output.test.ts` (via `npm test`).
     */
    const todayIso = '2026-06-28';
    const yesterdayIso = isoDateDaysBefore(todayIso, 1);
    const exactContent = [
      '# Lección del 27 de junio',
      '',
      '## Pronombres personales',
      'Contenido guardado exactamente como el cron lo generó.',
    ].join('\n');

    it('returns the mocked yesterday lesson verbatim, not a model paraphrase', () => {
      const result = resolveAgentOutput(
        {
          newItems: [
            toolCall('call-yesterday', StudyOutputToolName.RetrieveLesson),
            toolOutput(
              'call-yesterday',
              mockRetrieveToolOutput({
                found: true,
                dateIso: yesterdayIso,
                markdown: exactContent,
                savedPath: `lessons/${yesterdayIso}.md`,
              }),
            ),
          ],
          finalOutput: 'Here is a shorter recap of yesterday\'s lesson on pronouns.',
        },
        StudyOutputToolName.RetrieveLesson,
        StudyOutputToolName.GenerateLesson,
      );

      assert.equal(result.source, 'archive');
      assert.equal(result.markdown, exactContent);
      assert.equal(result.savedPath, `lessons/${yesterdayIso}.md`);
      assert.notEqual(result.markdown, 'Here is a shorter recap of yesterday\'s lesson on pronouns.');
    });
  });

  describe('agent-tool-outputs', () => {
    it('collects outputs for a tool by call id', () => {
      const items = [
        toolCall('call-1', StudyOutputToolName.RetrieveLesson),
        toolOutput('call-1', JSON.stringify({ found: true, dateIso: '2026-06-27', markdown: '# Lesson' })),
      ];

      const outputs = getToolOutputs(items, StudyOutputToolName.RetrieveLesson, (value) => value);

      assert.equal(outputs.length, 1);
      assert.deepEqual(outputs[0], {
        found: true,
        dateIso: '2026-06-27',
        markdown: '# Lesson',
      });
    });

    it('detects whether any allowed tool was used', () => {
      const items = [toolCall('call-1', StudyOutputToolName.GenerateLesson)];

      assert.equal(
        wasAnyToolUsed(items, [StudyOutputToolName.RetrieveLesson, StudyOutputToolName.GenerateLesson]),
        true,
      );
    });

    it('returns false when only unrelated tools ran', () => {
      const items = [toolCall('call-1', 'send_email')];

      assert.equal(
        wasAnyToolUsed(items, [StudyOutputToolName.RetrieveExercises, StudyOutputToolName.GenerateExercises]),
        false,
      );
    });
  });

  describe('resolveAgentOutput', () => {
    it('prefers retrieved markdown over final output', () => {
      const result = resolveAgentOutput(
        {
          newItems: [
            toolCall('call-1', StudyOutputToolName.RetrieveLesson),
            toolOutput(
              'call-1',
              mockRetrieveToolOutput({
                found: true,
                dateIso: '2026-06-27',
                markdown: '# Archived lesson',
                savedPath: 'lessons/2026-06-27.md',
              }),
            ),
          ],
          finalOutput: 'Summarized lesson',
        },
        StudyOutputToolName.RetrieveLesson,
        StudyOutputToolName.GenerateLesson,
      );

      assert.equal(result.source, 'archive');
      assert.equal(result.markdown, '# Archived lesson');
      assert.equal(result.savedPath, 'lessons/2026-06-27.md');
      assert.equal(result.emailed, false);
    });

    it('uses generate tool output when retrieve did not find a file', () => {
      const result = resolveAgentOutput(
        {
          newItems: [
            toolCall('call-1', StudyOutputToolName.GenerateLesson),
            toolOutput(
              'call-1',
              JSON.stringify({
                markdown: '# Fresh lesson',
                savedPath: 'lessons/2026-06-28.md',
                emailed: true,
              }),
            ),
          ],
          finalOutput: 'Fresh lesson',
        },
        StudyOutputToolName.RetrieveLesson,
        StudyOutputToolName.GenerateLesson,
      );

      assert.equal(result.source, 'generated');
      assert.equal(result.markdown, '# Fresh lesson');
      assert.equal(result.emailed, true);
    });

    it('falls back to final output when retrieve returns found:false', () => {
      const result = resolveAgentOutput(
        {
          newItems: [
            toolCall('call-1', StudyOutputToolName.RetrieveLesson),
            toolOutput('call-1', JSON.stringify({ found: false, dateIso: '2026-06-27' })),
          ],
          finalOutput: 'No saved lesson for that date.',
        },
        StudyOutputToolName.RetrieveLesson,
        StudyOutputToolName.GenerateLesson,
      );

      assert.equal(result.source, 'message');
      assert.equal(result.markdown, 'No saved lesson for that date.');
    });

    it('throws when no tool output or final message is available', () => {
      assert.throws(
        () => resolveAgentOutput(
          { newItems: [], finalOutput: '   ' },
          StudyOutputToolName.RetrieveLesson,
          StudyOutputToolName.GenerateLesson,
        ),
        /Agent did not produce a response/,
      );
    });
  });

  describe('resolveRelevantAgent', () => {
    it('returns general for a general reply', () => {
      assert.equal(
        resolveRelevantAgent({ finalOutput: RelevantAgent.General }),
        RelevantAgent.General,
      );
    });

    it('returns lesson for a lesson reply', () => {
      assert.equal(
        resolveRelevantAgent({ finalOutput: RelevantAgent.Lesson }),
        RelevantAgent.Lesson,
      );
    });

    it('returns exercises for an exercises reply', () => {
      assert.equal(
        resolveRelevantAgent({ finalOutput: RelevantAgent.Exercises }),
        RelevantAgent.Exercises,
      );
    });

    it('throws for an invalid relevant-agent reply', () => {
      assert.throws(
        () => resolveRelevantAgent({ finalOutput: 'maybe lesson?' }),
        /did not produce a valid relevant agent/,
      );
    });
  });
});

describe('study output storage', () => {
  /** Real filesystem I/O, isolated under /tmp — never touches the user's lessons/ folder. */
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'gio-study-output-'));
  });

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('saves and reads the canonical lesson file for a date', () => {
    const savedPath = saveStudyOutput('lessons', '# Saved lesson', '2026-06-27', tempRoot);
    const loaded = readPreviousLesson('2026-06-27', tempRoot);

    assert.equal(savedPath, path.join(tempRoot, 'lessons', '2026-06-27.md'));
    assert.equal(loaded?.markdown, '# Saved lesson');
    assert.equal(readFileSync(savedPath, 'utf8'), '# Saved lesson');
  });

  it('reads a previously saved exercises file for a date', () => {
    saveStudyOutput('exercises', '# Saved exercises', '2026-06-27', tempRoot);
    const loaded = readPreviousExercise('2026-06-27', tempRoot);

    assert.equal(loaded?.markdown, '# Saved exercises');
    assert.equal(loaded?.savedPath, path.join(tempRoot, 'exercises', '2026-06-27.md'));
  });

  it('does not overwrite an existing file for the same date', () => {
    const lessonsDir = path.join(tempRoot, 'lessons');
    mkdirSync(lessonsDir, { recursive: true });
    const filePath = path.join(lessonsDir, '2026-06-28.md');
    writeFileSync(filePath, 'existing', 'utf8');

    const savedPath = saveStudyOutput('lessons', 'new content', '2026-06-28', tempRoot);

    assert.equal(savedPath, filePath);
    assert.equal(readFileSync(filePath, 'utf8'), 'existing');
  });

  it('lists unique dates newest first and ignores missing folders', () => {
    assert.deepEqual(listStudyOutputDates('lessons', 10, tempRoot), []);

    saveStudyOutput('lessons', 'a', '2026-06-25', tempRoot);
    saveStudyOutput('lessons', 'b', '2026-06-27', tempRoot);
    saveStudyOutput('lessons', 'c', '2026-06-26', tempRoot);

    assert.deepEqual(listStudyOutputDates('lessons', 2, tempRoot), [
      '2026-06-27',
      '2026-06-26',
    ]);
  });

  it('retrieveStudyOutput returns found:false when the file is missing', () => {
    assert.deepEqual(retrieveStudyOutput('lessons', '2026-06-27', tempRoot), {
      found: false,
      dateIso: '2026-06-27',
    });
  });

  it('retrieveStudyOutput returns saved lesson content', () => {
    saveStudyOutput('lessons', '# Canonical', '2026-06-27', tempRoot);

    assert.equal(retrieveStudyOutput('lessons', '2026-06-27', tempRoot).markdown, '# Canonical');
  });
});

describe('logStudyOutputStatus', () => {
  it('uses archive and generated labels for lessons', () => {
    assert.doesNotThrow(() => {
      logStudyOutputStatus('lessons', 'archive', 'lessons/2026-06-29.md');
      logStudyOutputStatus('lessons', 'generated', 'lessons/2026-06-29.md');
    });
  });
});

describe('logOpenAiUsage', () => {
  it('formats agent usage snapshots', () => {
    const usage = usageFromAgentsUsage(new Usage({ inputTokens: 1200, outputTokens: 300, requests: 2 }));

    assert.equal(usage.totalTokens, 1500);
    assert.match(formatOpenAiUsageLine('generate-lesson-agent', usage), /1,?500 tokens/);
    assert.match(formatOpenAiUsageLine('generate-lesson-agent', usage), /input: 1,?200/);
  });

  it('parses Realtime response usage', () => {
    const usage = usageFromRealtimeResponse({
      input_tokens: 500,
      output_tokens: 150,
      total_tokens: 650,
    });

    assert.equal(usage?.totalTokens, 650);
    assert.equal(usageFromRealtimeResponse(undefined), null);
  });

  it('summarizes study-output tool args and results for logs', () => {
    assert.deepEqual(
      summarizeToolArgsForLog(StudyOutputToolName.GenerateLesson, { userPrompt: 'Generate the lesson for today.' }),
      { userPrompt: 'Generate the lesson for today.' },
    );
    assert.match(
      summarizeToolResultForLog(
        StudyOutputToolName.RetrieveLesson,
        JSON.stringify({ found: true, dateIso: '2026-06-28', markdown: '# Lesson' }),
      ),
      /found:true · 2026-06-28 · 8 chars/,
    );
  });
});
