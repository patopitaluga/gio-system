import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterNamedTools, getToolName } from '../lib/tools.ts';

describe('filterNamedTools', () => {
  it('removes tools without a name', () => {
    const filtered = filterNamedTools([{ name: 'ok' }, {}, { name: '' }]);
    assert.deepEqual(filtered, [{ name: 'ok' }]);
  });

  it('keeps all named tools', () => {
    const tools = [{ name: 'send_email' }, { name: 'echo' }];
    assert.deepEqual(filterNamedTools(tools), tools);
  });
});

describe('getToolName', () => {
  it('reads the name from a tool object', () => {
    assert.equal(getToolName({ name: 'send_email' }), 'send_email');
    assert.equal(getToolName({ name: 1 }), undefined);
    assert.equal(getToolName(null), undefined);
  });
});
