/**
 * Line diff via LCS (dynamic programming). Workflow JSON is a few thousand lines
 * at most, so O(n*m) with a typed-array table is fine and has no dependencies.
 */
export function lineDiff(aText, bText) {
  const a = aText.split('\n');
  const b = bText.split('\n');
  const n = a.length, m = b.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => table[i * (m + 1) + j];
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * (m + 1) + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: ' ', line: a[i] }); i++; j++; }
    else if (at(i + 1, j) >= at(i, j + 1)) { ops.push({ t: '-', line: a[i] }); i++; }
    else { ops.push({ t: '+', line: b[j] }); j++; }
  }
  while (i < n) ops.push({ t: '-', line: a[i++] });
  while (j < m) ops.push({ t: '+', line: b[j++] });
  const added = ops.filter((o) => o.t === '+').length;
  const removed = ops.filter((o) => o.t === '-').length;
  return { ops, added, removed, identical: added === 0 && removed === 0 };
}

/** Unified-ish output with `context` lines around each change. */
export function formatDiff(diff, { context = 3, color = false } = {}) {
  const { ops } = diff;
  const keep = new Set();
  ops.forEach((o, idx) => {
    if (o.t === ' ') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(ops.length - 1, idx + context); k++) keep.add(k);
  });
  const out = [];
  let last = -2;
  for (const idx of [...keep].sort((x, y) => x - y)) {
    if (idx !== last + 1 && out.length) out.push('@@');
    const o = ops[idx];
    let line = `${o.t}${o.line}`;
    if (color && o.t === '+') line = `\x1b[32m${line}\x1b[0m`;
    if (color && o.t === '-') line = `\x1b[31m${line}\x1b[0m`;
    out.push(line);
    last = idx;
  }
  out.push(`+${diff.added} / -${diff.removed} lines`);
  return out.join('\n');
}
