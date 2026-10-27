import { createHash } from 'node:crypto';

/** Deterministic JSON: keys sorted at every level, 2-space indent. */
export function stableStringify(value, indent = 2) {
  return JSON.stringify(sortKeys(value), null, indent);
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  }
  return v;
}

/** The parts of a workflow that a PUT can change. Everything else is server-managed noise. */
export function comparable(wf) {
  return {
    name: wf.name,
    nodes: wf.nodes ?? [],
    connections: wf.connections ?? {},
    settings: wf.settings ?? {},
  };
}

/** sha256 of the comparable surface; two workflows with the same hash are byte-identical where it matters. */
export function workflowHash(wf) {
  return createHash('sha256').update(stableStringify(comparable(wf))).digest('hex');
}
