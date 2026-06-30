import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { readPreviousNews, saveNewsOutput } from '../lib/save-news-output.ts';

describe('saveNewsOutput', () => {
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'gio-news-'));
  });

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates a dated news file once', () => {
    const savedPath = saveNewsOutput('# Digest\n\nArticle one', '2026-06-30', tempRoot);

    assert.match(savedPath, /news\/2026-06-30\.md$/);
    assert.match(readFileSync(savedPath, 'utf8'), /Article one/);

    const secondPath = saveNewsOutput('# Updated', '2026-06-30', tempRoot);
    assert.equal(secondPath, savedPath);
    assert.match(readFileSync(savedPath, 'utf8'), /Article one/);
  });

  it('reads a saved digest', () => {
    saveNewsOutput('# Digest', '2026-06-30', tempRoot);
    const existing = readPreviousNews('2026-06-30', tempRoot);

    assert.ok(existing);
    assert.equal(existing?.markdown, '# Digest');
  });
});
