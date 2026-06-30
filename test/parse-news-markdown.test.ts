import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNewsPlainText,
  parseNewsMarkdown,
} from '../lib/parse-news-markdown.ts';

const SAMPLE = `# Nuove immagini da Euclid

**Link:** https://www.repubblica.it/scienze/2026/06/29/euclid

L'Agenzia Spaziale Europea ha pubblicato nuove immagini del telescopio Euclid.

In una immagine si vede una "culla di stelle" nella Via Lattea.

------

## Vocabulario

- **telescopio** — instrumento para observar objetos muy lejanos en el espacio
- **galassia** — grupo enorme de estrellas en el universo`;

describe('parseNewsMarkdown', () => {
  it('extracts title, link, body, and vocabulary', () => {
    const parsed = parseNewsMarkdown(SAMPLE);

    assert.equal(parsed.title, 'Nuove immagini da Euclid');
    assert.equal(parsed.link, 'https://www.repubblica.it/scienze/2026/06/29/euclid');
    assert.match(parsed.bodyMarkdown, /L'Agenzia Spaziale Europea/);
    assert.doesNotMatch(parsed.bodyMarkdown, /## Vocabulario/);
    assert.doesNotMatch(parsed.bodyMarkdown, /^\*\*Link:/m);
    assert.doesNotMatch(parsed.bodyMarkdown, /^#/m);
    assert.match(parsed.vocabularyMarkdown, /## Vocabulario/);
    assert.match(parsed.vocabularyMarkdown, /\*\*telescopio\*\*/);
  });

  it('falls back to full markdown when structure is missing', () => {
    const parsed = parseNewsMarkdown('Solo testo senza titolo.');

    assert.equal(parsed.title, '');
    assert.equal(parsed.link, '');
    assert.equal(parsed.bodyMarkdown, 'Solo testo senza titolo.');
    assert.equal(parsed.vocabularyMarkdown, '');
  });
});

describe('formatNewsPlainText', () => {
  it('formats title, link, body, and vocabulary with separators', () => {
    const text = formatNewsPlainText(parseNewsMarkdown(SAMPLE));

    assert.match(text, /^Nuove immagini da Euclid/);
    assert.match(text, /https:\/\/www\.repubblica\.it/);
    assert.match(text, /L'Agenzia Spaziale Europea/);
    assert.match(text, /\*\*telescopio\*\*/);
    assert.doesNotMatch(text, /\*\*Link:\*\*/);
    assert.equal((text.match(/------/g) ?? []).length, 2);
  });
});
