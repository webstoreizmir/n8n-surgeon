import test from 'node:test';
import assert from 'node:assert/strict';
import { toPutBody } from '../src/sanitize.mjs';

test('strips read-only settings and server fields', () => {
  const body = toPutBody({
    id: '1', active: true, createdAt: 'x', versionId: 'v', tags: [],
    name: 'wf', nodes: [], connections: {},
    settings: { executionOrder: 'v1', binaryMode: 'default', timeSavedMode: 'auto' },
  });
  assert.deepEqual(body, { name: 'wf', nodes: [], connections: {}, settings: { executionOrder: 'v1' } });
});

test('always sends a settings object', () => {
  assert.deepEqual(toPutBody({ name: 'a', nodes: [], connections: {} }).settings, {});
});
