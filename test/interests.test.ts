import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { saveInterest, findRestatedSavedInterest } from '../lib/save-interests.ts';

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

describe('findRestatedSavedInterest', () => {
  const content = [
    '# Interests',
    '',
    '- **Geology** — noted earlier (noted 2026-06-30)',
  ].join('\n');

  it('returns the saved label when the user restates a single saved interest', () => {
    assert.equal(
      findRestatedSavedInterest('Im interested in geology', content),
      'Geology',
    );
  });

  it('returns null when the user expresses interest in something new', () => {
    assert.equal(
      findRestatedSavedInterest('Im interested in astronomy', content),
      null,
    );
  });

  it('returns null when a compound interest includes something new', () => {
    assert.equal(
      findRestatedSavedInterest('Im interested in geology and astronomy', content),
      null,
    );
  });

  it('returns null when the user is not stating an interest', () => {
    assert.equal(
      findRestatedSavedInterest('Give me a lesson about geology', content),
      null,
    );
  });
});
