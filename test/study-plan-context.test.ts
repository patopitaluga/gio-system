import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalDateIso } from '../lib/study-plan-context.ts';

describe('formatLocalDateIso', () => {
  it('uses the local calendar date, not UTC', () => {
    const date = new Date(2026, 5, 28, 21, 41, 0);

    assert.equal(formatLocalDateIso(date), '2026-06-28');
  });
});
