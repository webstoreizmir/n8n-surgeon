import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { N8nClient } from './api.mjs';
import { stableStringify, workflowHash, comparable } from './hash.mjs';
import { lineDiff, formatDiff } from './diff.mjs';
import { lintWorkflow, formatFindings } from './lint.mjs';
import { toPutBody } from './sanitize.mjs';

const HELP = `n8n-surgeon <command> [options]

  pull <id> [file]            fetch a live workflow to a file (default: <id>.json)
  hash <file|id>              print the content hash of a file or a live workflow
  diff <id> <file>            show what pushing <file> would change on the live workflow
  lint <file>                 run safety rules on a workflow file
  push <id> <file> [--yes] [--expect <hash>] [--allow-removals] [--backup-dir <dir>]
                              dry run by default; --yes writes

env: N8N_URL, N8N_API_KEY
`;

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { opt[key] = next; i++; } else opt[key] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }

export async function main(argv, { client, log = console.log, err = console.error } = {}) {
  const { pos, opt } = parseArgs(argv);
  const [cmd, ...rest] = pos;
  if (!cmd || opt.help) { log(HELP); return 0; }
  const getClient = () => client ?? new N8nClient();

  switch (cmd) {
    case 'pull': {
      const [id, file = `${id}.json`] = rest;
      if (!id) throw new Error('pull needs an id');
      const wf = await getClient().getWorkflow(id);
      await writeFile(file, stableStringify(wf) + '\n');
      log(`${file}: ${wf.nodes?.length ?? 0} nodes, hash ${workflowHash(wf)}`);
      return 0;
    }
    case 'hash': {
      const [target] = rest;
      if (!target) throw new Error('hash needs a file or id');
      const wf = target.endsWith('.json') ? await readJson(target) : await getClient().getWorkflow(target);
      log(workflowHash(wf));
      return 0;
    }
    case 'lint': {
      const [file] = rest;
      if (!file) throw new Error('lint needs a file');
      const result = lintWorkflow(await readJson(file));
      log(formatFindings(result));
      return result.ok ? 0 : 1;
    }
    case 'diff': {
      const [id, file] = rest;
      if (!id || !file) throw new Error('diff needs <id> <file>');
      const live = await getClient().getWorkflow(id);
      const local = await readJson(file);
      const d = lineDiff(stableStringify(comparable(live)), stableStringify(comparable(local)));
      log(d.identical ? 'identical' : formatDiff(d, { color: process.stdout.isTTY }));
      return d.identical ? 0 : 1;
    }
    case 'push': return push(rest, opt, { getClient, log, err });
    default:
      err(`unknown command: ${cmd}\n${HELP}`);
      return 2;
  }
}

async function push([id, file], opt, { getClient, log, err }) {
  if (!id || !file) throw new Error('push needs <id> <file>');
  const api = getClient();
  const local = await readJson(file);

  // 1. lint: refuse to push a file with errors
  const lint = lintWorkflow(local);
  if (!lint.ok) { err(formatFindings(lint)); err('refusing to push: lint errors'); return 1; }

  // 2. baseline: the live workflow must be what we think it is
  const live = await api.getWorkflow(id);
  const liveHash = workflowHash(live);
  if (opt.expect && opt.expect !== liveHash) {
    err(`live hash ${liveHash} does not match --expect ${opt.expect}; someone changed the workflow since you pulled it`);
    return 1;
  }

  // 3. diff with removal guard
  const d = lineDiff(stableStringify(comparable(live)), stableStringify(comparable(local)));
  if (d.identical) { log('identical: nothing to push'); return 0; }
  log(formatDiff(d, { color: process.stdout.isTTY }));
  const loss = removals(live, local);
  if (loss.length && !opt['allow-removals']) {
    err(`refusing: push would remove ${loss.join(', ')} (pass --allow-removals if intended)`);
    return 1;
  }
  if (!opt.yes) { log('dry run: pass --yes to write'); return 0; }

  // 4. backup
  const dir = opt['backup-dir'] ?? 'backups';
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${dir}/${id}-${stamp}.json`;
  await writeFile(backup, stableStringify(live) + '\n');
  log(`backup: ${backup}`);

  // 5. write
  await api.updateWorkflow(id, toPutBody(local));

  // 6. verify
  const after = await api.getWorkflow(id);
  const check = {
    nodes: [after.nodes?.length, local.nodes?.length],
    edges: [countEdges(after.connections), countEdges(local.connections)],
    active: [after.active, live.active],
    hash: [workflowHash(after), workflowHash(toPutBody(local))],
  };
  let ok = true;
  for (const [k, [got, want]] of Object.entries(check)) {
    const good = got === want;
    ok &&= good;
    log(`${good ? 'ok ' : 'BAD'} ${k}: ${got}${good ? '' : ` (expected ${want})`}`);
  }
  if (!ok) err(`post-push verification failed; restore from ${backup}`);
  return ok ? 0 : 1;
}

/** Structural losses: nodes that vanish, edges that vanish. A changed value is not a loss. */
export function removals(live, local) {
  const out = [];
  const after = new Set((local.nodes ?? []).map((n) => n.name));
  const gone = (live.nodes ?? []).map((n) => n.name).filter((n) => !after.has(n));
  if (gone.length) out.push(`${gone.length} node(s): ${gone.map((n) => `"${n}"`).join(', ')}`);
  const before = countEdges(live.connections), now = countEdges(local.connections);
  if (now < before) out.push(`${before - now} connection(s)`);
  return out;
}

function countEdges(connections = {}) {
  let n = 0;
  for (const byType of Object.values(connections)) for (const outputs of Object.values(byType)) for (const o of outputs ?? []) n += (o ?? []).length;
  return n;
}
