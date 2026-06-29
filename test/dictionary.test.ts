import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSCRIPTION_PROMPT_MAX_CHARS,
  buildTranscriptionPrompt,
  isEmptyOrDictionaryHallucination,
} from '../config/dictionary.ts';

describe('buildTranscriptionPrompt', () => {
  it('returns undefined for empty dictionary', () => {
    assert.equal(buildTranscriptionPrompt(''), undefined);
  });

  it('returns the full dictionary when it fits the prompt limit', () => {
    const dictionary = 'MCP, Gio-System, README.md';
    assert.equal(buildTranscriptionPrompt(dictionary), dictionary);
  });

  it('truncates long dictionaries at a line boundary when possible', () => {
    const lines = Array.from({ length: 200 }, (_, index) => `term-${index}`).join('\n');
    const prompt = buildTranscriptionPrompt(lines);

    assert.ok(prompt);
    assert.ok(prompt!.length <= TRANSCRIPTION_PROMPT_MAX_CHARS);
    assert.doesNotMatch(prompt!, /term-199$/);
  });
});

describe('isEmptyOrDictionaryHallucination', () => {
  const dictionary = [
    'MCP — Model Context Protocol (not MSP)',
    'Gio-System — this project name',
    'README.md — project readme file',
  ].join('\n');

  it('treats empty transcript as unusable', () => {
    assert.equal(isEmptyOrDictionaryHallucination('', dictionary), true);
    assert.equal(isEmptyOrDictionaryHallucination('   ', dictionary), true);
  });

  it('treats multi-line dictionary echo as hallucination', () => {
    const transcript = `${dictionary}\n`;
    assert.equal(isEmptyOrDictionaryHallucination(transcript, dictionary), true);
  });

  it('allows real speech that mentions one dictionary term', () => {
    assert.equal(
      isEmptyOrDictionaryHallucination('update the README.md file', dictionary),
      false,
    );
  });
});
