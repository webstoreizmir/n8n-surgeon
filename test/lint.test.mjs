import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { lintWorkflow, RULES } from '../src/lint.mjs';

const load = async (f) => JSON.parse(await readFile(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const rulesOf = (r) => [...new Set(r.findings.map((f) => f.rule))].sort();

test('clean workflow has no findings', async () => {
  const r = lintWorkflow(await load('good.json'));
  assert.deepEqual(r.findings, []);
  assert.equal(r.ok, true);
});

test('bad workflow trips every rule', async () => {
  const r = lintWorkflow(await load('bad.json'));
  assert.deepEqual(rulesOf(r), Object.keys(RULES).sort());
  assert.equal(r.ok, false);
});

test('env-access is an error and names the node', async () => {
  const r = lintWorkflow(await load('bad.json'), { rules: ['env-access'] });
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].severity, 'error');
  assert.equal(r.findings[0].node, 'HTTP');
});

test('dangling-connection catches both missing source and missing target', async () => {
  const r = lintWorkflow(await load('bad.json'), { rules: ['dangling-connection'] });
  const msgs = r.findings.map((f) => f.message).sort();
  assert.equal(msgs.length, 2);
  assert.match(msgs[0], /Ghost/);
  assert.match(msgs[1], /source node does not exist/);
});

test('placeholder rule ignores n8n {{ }} expressions', () => {
  const wf = { nodes: [{ name: 'n', type: 'x', parameters: { a: '={{ $json.x }}', b: 'id {tenant_id}' } }] };
  const r = lintWorkflow(wf, { rules: ['unreplaced-placeholder'] });
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].message, /tenant_id/);
});

test('unknown rule name throws', () => {
  assert.throws(() => lintWorkflow({}, { rules: ['nope'] }), /unknown rule/);
});
