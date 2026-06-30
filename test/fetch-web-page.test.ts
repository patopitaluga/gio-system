import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText } from '../lib/fetch-web-page.ts';

describe('htmlToText', () => {
  it('strips tags and collapses whitespace', () => {
    const text = htmlToText('<html><body><h1>Title</h1><p>Hello <b>world</b></p></body></html>');

    assert.equal(text, 'Title Hello world');
  });

  it('removes script content', () => {
    const text = htmlToText('<div>Visible<script>hidden();</script> text</div>');

    assert.equal(text, 'Visible text');
  });
});
