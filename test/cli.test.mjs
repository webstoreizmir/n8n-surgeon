import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.mjs';

const good = JSON.parse(await readFile(new URL('./fixtures/good.json', import.meta.url), 'utf8'));

/** In-memory n8n: records PUTs, serves GETs. */
function fakeClient(initial) {
  let live = structuredClone(initial);
  const puts = [];
  return {
    puts,
    async getWorkflow() { return structuredClone(live); },
    async updateWorkflow(id, body) { puts.push(body); live = { ...live, ...body }; return live; },
  };
}

function capture() {
  const out = [], errs = [];
  return { out, errs, log: (s) => out.push(String(s)), err: (s) => errs.push(String(s)) };
}

test('push is a dry run without --yes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'surgeon-'));
  const file = join(dir, 'wf.json');
  const edited = structuredClone(good);
  edited.nodes[1].parameters.value = '={{ $json.y }}';
  await writeFile(file, JSON.stringify(edited));
  const client = fakeClient(good);
  const io = capture();
  const code = await main(['push', '1', file, '--backup-dir', dir], { client, ...io });
  assert.equal(code, 0);
  assert.equal(client.puts.length, 0);
  assert.match(io.out.join('\n'), /dry run/);
});

test('push refuses removals unless --allow-removals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'surgeon-'));
  const file = join(dir, 'wf.json');
  const edited = structuredClone(good);
  edited.nodes.pop();
  delete edited.connections.Set;
  await writeFile(file, JSON.stringify(edited));
  const client = fakeClient(good);
  const io = capture();
  const code = await main(['push', '1', file, '--yes', '--backup-dir', dir], { client, ...io });
  assert.equal(code, 1);
  assert.equal(client.puts.length, 0);
  assert.match(io.errs.join("\n"), /would remove 1 node\(s\): "HTTP", 1 connection\(s\)/);
});

test('push refuses when --expect does not match the live hash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'surgeon-'));
  const file = join(dir, 'wf.json');
  await writeFile(file, JSON.stringify(good));
  const client = fakeClient(good);
  const io = capture();
  const code = await main(['push', '1', file, '--yes', '--expect', 'deadbeef', '--backup-dir', dir], { client, ...io });
  assert.equal(code, 1);
  assert.equal(client.puts.length, 0);
  assert.match(io.errs.join('\n'), /does not match --expect/);
});

test('push refuses a file with lint errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'surgeon-'));
  const file = join(dir, 'wf.json');
  const edited = structuredClone(good);
  edited.nodes[2].parameters.url = '={{ $env.X }}';
  await writeFile(file, JSON.stringify(edited));
  const client = fakeClient(good);
  const io = capture();
  const code = await main(['push', '1', file, '--yes', '--backup-dir', dir], { client, ...io });
  assert.equal(code, 1);
  assert.equal(client.puts.length, 0);
});

test('push writes, backs up, strips read-only settings and verifies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'surgeon-'));
  const file = join(dir, 'wf.json');
  const liveWithNoise = { ...structuredClone(good), settings: { executionOrder: 'v1', binaryMode: 'default' } };
  const edited = structuredClone(liveWithNoise);
  edited.nodes[1].parameters.value = '={{ $json.y }}';
  await writeFile(file, JSON.stringify(edited));
  const client = fakeClient(liveWithNoise);
  const io = capture();
  const code = await main(['push', '1', file, '--yes', '--backup-dir', dir], { client, ...io });
  assert.equal(code, 0, io.errs.join('\n'));
  assert.equal(client.puts.length, 1);
  assert.equal('binaryMode' in client.puts[0].settings, false);
  assert.equal(client.puts[0].nodes[1].parameters.value, '={{ $json.y }}');
  const backups = (await readdir(dir)).filter((f) => f.startsWith('1-'));
  assert.equal(backups.length, 1);
  assert.match(io.out.join('\n'), /ok  hash/);
});

test('lint command exits 1 on errors', async () => {
  const io = capture();
  const code = await main(['lint', fileURLToPath(new URL('./fixtures/bad.json', import.meta.url))], io);
  assert.equal(code, 1);
  assert.match(io.out.join('\n'), /env-access/);
});
