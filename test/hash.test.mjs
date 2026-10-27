import test from 'node:test';
import assert from 'node:assert/strict';
import { stableStringify, workflowHash } from '../src/hash.mjs';

test('stableStringify sorts keys at every level', () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }, 0), '{"a":{"c":3,"d":2},"b":1}');
});

test('hash ignores server-managed fields', () => {
  const a = { name: 'x', nodes: [], connections: {}, settings: {}, updatedAt: '1', versionId: 'a' };
  const b = { name: 'x', nodes: [], connections: {}, settings: {}, updatedAt: '2', versionId: 'b' };
  assert.equal(workflowHash(a), workflowHash(b));
});

test('hash changes when a node parameter changes', () => {
  const a = { name: 'x', nodes: [{ name: 'n', parameters: { v: 1 } }], connections: {}, settings: {} };
  const b = { name: 'x', nodes: [{ name: 'n', parameters: { v: 2 } }], connections: {}, settings: {} };
  assert.notEqual(workflowHash(a), workflowHash(b));
});
