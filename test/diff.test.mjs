import test from 'node:test';
import assert from 'node:assert/strict';
import { lineDiff, formatDiff } from '../src/diff.mjs';

test('identical inputs produce no ops', () => {
  const d = lineDiff('a\nb\nc', 'a\nb\nc');
  assert.equal(d.identical, true);
  assert.deepEqual([d.added, d.removed], [0, 0]);
});

test('counts added and removed lines', () => {
  const d = lineDiff('a\nb\nc', 'a\nx\nc\nd');
  assert.deepEqual([d.added, d.removed], [2, 1]);
  assert.equal(d.identical, false);
});

test('formatDiff shows context and the +/- summary', () => {
  const out = formatDiff(lineDiff('1\n2\n3\n4\n5\n6\n7\n8\n9', '1\n2\n3\n4\nX\n6\n7\n8\n9'), { context: 1 });
  assert.equal(out, ' 4\n-5\n+X\n 6\n+1 / -1 lines');
});
