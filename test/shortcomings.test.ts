import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { saveShortcoming } from '../lib/save-shortcomings.ts';

describe('saveShortcoming', () => {
  let tempRoot = '';
  let shortcomingsPath = '';

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'gio-shortcomings-'));
    shortcomingsPath = path.join(tempRoot, 'shortcomings.md');
  });

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates shortcomings.md with a new shortcoming', () => {
    const result = saveShortcoming(
      'shortcoming',
      'Passato prossimo auxiliary',
      'Wrote "ho andato" instead of "sono andato"',
      '2026-06-28',
      shortcomingsPath,
    );

    assert.equal(result.saved, true);
    assert.equal(result.duplicate, false);
    const content = readFileSync(shortcomingsPath, 'utf8');
    assert.match(content, /shortcoming: Passato prossimo auxiliary/);
    assert.match(content, /ho andato/);
  });

  it('creates an opportunity entry', () => {
    saveShortcoming(
      'opportunity',
      'Congiuntivo after pensare',
      'Asked when to use subjunctive',
      '2026-06-28',
      shortcomingsPath,
    );

    assert.match(
      readFileSync(shortcomingsPath, 'utf8'),
      /opportunity: Congiuntivo after pensare/,
    );
  });

  it('does not write duplicate kind+topic pairs', () => {
    saveShortcoming('shortcoming', 'Gender agreement', undefined, '2026-06-28', shortcomingsPath);
    const result = saveShortcoming(
      'shortcoming',
      'gender agreement',
      'Mentioned again',
      '2026-06-29',
      shortcomingsPath,
    );

    assert.equal(result.saved, false);
    assert.equal(result.duplicate, true);
    assert.equal(readFileSync(shortcomingsPath, 'utf8').match(/Gender agreement/gi)?.length, 1);
  });

  it('allows the same topic as both shortcoming and opportunity', () => {
    saveShortcoming('shortcoming', 'Articles', 'Used wrong article', '2026-06-28', shortcomingsPath);
    const result = saveShortcoming(
      'opportunity',
      'Articles',
      'Needs more practice choosing definite vs indefinite',
      '2026-06-29',
      shortcomingsPath,
    );

    assert.equal(result.saved, true);
    assert.equal(readFileSync(shortcomingsPath, 'utf8').match(/Articles/g)?.length, 2);
  });
});
