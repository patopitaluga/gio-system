import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserPrompt,
  formatToolAction,
  parseToolArguments,
  responseHasToolCalls,
  toError,
} from '../controllers/agent/turn-helpers.ts';

describe('parseToolArguments', () => {
  it('returns empty object for missing input', () => {
    assert.deepEqual(parseToolArguments(undefined), {});
  });

  it('parses valid JSON', () => {
    assert.deepEqual(parseToolArguments('{"subject":"Lesson","text":"Hello"}'), {
      subject: 'Lesson',
      text: 'Hello',
    });
  });

  it('returns empty object for invalid JSON', () => {
    assert.deepEqual(parseToolArguments('{bad'), {});
  });
});

describe('formatToolAction', () => {
  it('formats send_email success via the default branch', () => {
    assert.equal(
      formatToolAction('send_email', { subject: 'Lesson' }, 'Email sent to pato@example.com'),
      'send_email: Email sent to pato@example.com',
    );
  });

  it('formats tool errors with a fallback target', () => {
    assert.equal(
      formatToolAction('send_email', {}, 'Error: SMTP is not configured'),
      'send_email failed on file: Error: SMTP is not configured',
    );
  });

  it('formats mark_study_plan_items results', () => {
    assert.equal(
      formatToolAction('mark_study_plan_items', { itemTexts: ['Pronouns'] }, '{"marked":1}'),
      'mark_study_plan_items: {"marked":1}',
    );
  });
});

describe('buildUserPrompt', () => {
  it('uses spoken transcript for audio turns', () => {
    assert.equal(buildUserPrompt({ hasAudio: true }, 'spoken'), 'spoken');
  });

  it('combines spoken and typed text when they differ', () => {
    assert.equal(
      buildUserPrompt({ question: 'typed', hasAudio: true }, 'spoken'),
      'spoken (typed)',
    );
  });

  it('falls back to voice command label for audio-only turns', () => {
    assert.equal(buildUserPrompt({ hasAudio: true }), 'Voice command');
  });

  it('includes image marker when an image is attached', () => {
    assert.equal(
      buildUserPrompt({ question: 'describe this', imageDataUrl: 'data:image/png;base64,abc' }),
      '[Image attached] describe this',
    );
  });
});

describe('responseHasToolCalls', () => {
  it('detects function_call output items', () => {
    assert.equal(
      responseHasToolCalls({
        type: 'response.done',
        response: { output: [{ type: 'function_call' }] },
      }),
      true,
    );
  });

  it('returns false when there are no tool calls', () => {
    assert.equal(
      responseHasToolCalls({
        type: 'response.done',
        response: { output: [{ type: 'message' }] },
      }),
      false,
    );
  });
});

describe('toError', () => {
  it('passes through Error instances', () => {
    const error = new Error('boom');
    assert.equal(toError(error), error);
  });

  it('extracts nested API error messages', () => {
    assert.equal(toError({ error: { message: 'rate limited' } }).message, 'rate limited');
  });
});
