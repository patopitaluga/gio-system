import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNewsEmailContent } from '../lib/build-news-email.ts';

const SAMPLE = `# Nuove immagini da Euclid

**Link:** https://www.repubblica.it/scienze/2026/06/29/euclid

L'Agenzia Spaziale Europea ha pubblicato nuove immagini.

------

## Vocabulario

- **telescopio** — instrumento para observar objetos muy lejanos en el espacio`;

describe('buildNewsEmailContent', () => {
  it('uses the article title as subject and wraps HTML in an email layout', async () => {
    const { subject, text, html } = await buildNewsEmailContent(SAMPLE, '29 de junio (lunes)');

    assert.equal(subject, 'Nuove immagini da Euclid');
    assert.match(text, /^Nuove immagini da Euclid/);
    assert.doesNotMatch(text, /\*\*Link:\*\*/);
    assert.match(text, /\*\*telescopio\*\*/);
    assert.equal((text.match(/------/g) ?? []).length, 2);
    assert.match(html, /<h1[^>]*>Nuove immagini da Euclid<\/h1>/);
    assert.match(html, /Leggi l'articolo originale/);
    assert.match(html, /href="https:\/\/www\.repubblica\.it/);
    assert.equal((html.match(/<hr[^>]*\/?>/g) ?? []).length, 2);
    assert.match(html, /Agenzia Spaziale Europea/);
    assert.match(html, /telescopio/);
    assert.match(html, /<h2[^>]*>Vocabulario<\/h2>/);
  });

  it('falls back to date label when title is missing', async () => {
    const { subject } = await buildNewsEmailContent('Solo testo.', '29 de junio (lunes)');

    assert.equal(subject, 'Lettura del giorno — 29 de junio (lunes)');
  });
});
