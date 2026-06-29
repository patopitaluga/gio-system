import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSCRIPTION_PROMPT_MAX_CHARS,
  buildTranscriptionPrompt,
  isEmptyOrDisambiguationHallucination,
} from '../lib/disambiguation.ts';

describe('buildTranscriptionPrompt', () => {
  it('returns undefined for empty disambiguation', () => {
    assert.equal(buildTranscriptionPrompt(''), undefined);
  });

  it('returns the full disambiguation when it fits the prompt limit', () => {
    const disambiguation = 'MCP, Gio-System, README.md';
    assert.equal(buildTranscriptionPrompt(disambiguation), disambiguation);
  });

  it('truncates long disambiguation lists at a line boundary when possible', () => {
    const lines = Array.from({ length: 200 }, (_, index) => `term-${index}`).join('\n');
    const prompt = buildTranscriptionPrompt(lines);

    assert.ok(prompt);
    assert.ok(prompt!.length <= TRANSCRIPTION_PROMPT_MAX_CHARS);
    assert.doesNotMatch(prompt!, /term-199$/);
  });
});

describe('isEmptyOrDisambiguationHallucination', () => {
  const disambiguation = [
    'MCP — Model Context Protocol (not MSP)',
    'Gio-System — this project name',
    'README.md — project readme file',
  ].join('\n');

  it('treats empty transcript as unusable', () => {
    assert.equal(isEmptyOrDisambiguationHallucination('', disambiguation), true);
    assert.equal(isEmptyOrDisambiguationHallucination('   ', disambiguation), true);
  });

  it('treats multi-line disambiguation echo as hallucination', () => {
    const transcript = `${disambiguation}\n`;
    assert.equal(isEmptyOrDisambiguationHallucination(transcript, disambiguation), true);
  });

  it('allows real speech that mentions one disambiguation term', () => {
    assert.equal(
      isEmptyOrDisambiguationHallucination('update the README.md file', disambiguation),
      false,
    );
  });
});
