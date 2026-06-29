import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isSpeechPreviewEnabled } from '../server.ts';

describe('isSpeechPreviewEnabled', () => {
  const original = process.env.SPEECH_PREVIEW;

  beforeEach(() => {
    delete process.env.SPEECH_PREVIEW;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SPEECH_PREVIEW;
     else 
      process.env.SPEECH_PREVIEW = original;
    
  });

  it('is enabled by default', () => {
    assert.equal(isSpeechPreviewEnabled(), true);
  });

  it('can be disabled with false-like values', () => {
    for (const value of ['false', '0', 'no']) {
      process.env.SPEECH_PREVIEW = value;
      assert.equal(isSpeechPreviewEnabled(), false, `expected ${value} to disable preview`);
    }
  });
});
