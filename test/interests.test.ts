import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { saveInterest } from '../lib/save-interests.ts';

describe('saveInterest', () => {
  let tempRoot = '';
  let interestsPath = '';

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'gio-interests-'));
    interestsPath = path.join(tempRoot, 'interests.md');
  });

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates interests.md with a new topic', () => {
    const result = saveInterest('Italian cooking', 'Asked about food vocabulary', '2026-06-28', interestsPath);

    assert.equal(result.saved, true);
    assert.equal(result.duplicate, false);
    assert.match(readFileSync(interestsPath, 'utf8'), /Italian cooking/);
    assert.match(readFileSync(interestsPath, 'utf8'), /Asked about food vocabulary/);
  });

  it('does not write duplicate topics', () => {
    saveInterest('Travel to Rome', undefined, '2026-06-28', interestsPath);
    const result = saveInterest('travel to rome', 'Mentioned again', '2026-06-29', interestsPath);

    assert.equal(result.saved, false);
    assert.equal(result.duplicate, true);
    assert.equal(readFileSync(interestsPath, 'utf8').match(/Travel to Rome/gi)?.length, 1);
  });
});
