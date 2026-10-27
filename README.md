# n8n-surgeon

Safe, surgical patching of **live** n8n workflows from the command line.

n8n's public API lets you `PUT` a whole workflow. That is convenient and dangerous: a stale local copy overwrites someone else's change, a `settings` key that `GET` returns makes `PUT` fail, a typo in a connection name is accepted and only breaks at run time, and nothing tells you how much you just deleted. `n8n-surgeon` puts the guard rails back.

```
n8n-surgeon pull  <id> [file]          fetch a live workflow (deterministic JSON, sorted keys)
n8n-surgeon hash  <file|id>            content hash of a file or a live workflow
n8n-surgeon diff  <id> <file>          what pushing <file> would change, as +N / -M lines
n8n-surgeon lint  <file>               safety rules that n8n itself does not enforce
n8n-surgeon push  <id> <file> [--yes]  lint -> baseline check -> diff -> backup -> write -> verify
```

## Why

Every rule in `lint` and every step in `push` comes from a real outage while running n8n in production:

| What went wrong | Guard |
|---|---|
| `PUT` rejected with *settings must NOT have additional properties* | `push` strips `binaryMode` / `timeSavedMode`; `lint` warns |
| `$env.X` silently resolved to `undefined` in an HTTP node | `env-access` error |
| Template generator left `{tenant_id}` in a live node | `unreplaced-placeholder` warning |
| Patch script added a node on top of an existing one | `overlapping-position` warning |
| Connection pointed at a renamed node, accepted, failed at run time | `dangling-connection` error |
| Two people edited the same workflow, second push erased the first | `--expect <hash>` baseline check |
| A "small" patch silently deleted nodes and edges | structural removal guard, `--allow-removals` required |
| Push went through, nobody checked | post-push verification of node count, edge count, `active`, hash |

## Install

```sh
npm install -g n8n-surgeon   # or: npx n8n-surgeon
export N8N_URL=https://n8n.example.com
export N8N_API_KEY=...
```

Node 20+, no runtime dependencies.

## Workflow

```sh
n8n-surgeon pull abc123 wf.json              # wf.json: 14 nodes, hash 9f2c...
# edit wf.json
n8n-surgeon lint wf.json                     # exit 1 on errors
n8n-surgeon diff abc123 wf.json              # +3 / -0 lines
n8n-surgeon push abc123 wf.json --expect 9f2c...          # dry run
n8n-surgeon push abc123 wf.json --expect 9f2c... --yes    # writes, backups/abc123-<ts>.json
```

`push` exit codes: `0` ok or dry run, `1` refused or verification failed, `2` usage error.

## Lint rules

| rule | severity | catches |
|---|---|---|
| `env-access` | error | `$env` in any node parameter |
| `dangling-connection` | error | connection to or from a node that does not exist |
| `duplicate-node-name` | error | two nodes with the same name |
| `missing-credential` | error | credential reference without an id |
| `unreplaced-placeholder` | warning | `{snake_case}` placeholders outside `{{ }}` expressions |
| `orphan-node` | warning | enabled non-trigger node with no connections |
| `overlapping-position` | warning | two nodes within 40 px of each other |
| `readonly-settings` | warning | settings keys that `PUT` rejects |

## Library use

```js
import { lintWorkflow, lineDiff, workflowHash, toPutBody } from 'n8n-surgeon';
```

## Roadmap

- `restore <backup>` command
- node-level diff (which node changed, not which line)
- `--rules` / `--ignore` flags and a `.n8nsurgeonrc`
- rule: expression referencing a node name that does not exist (`$('Foo')`)
- rule: Code node that returns a non-array
- GitHub Action: lint on PR, push on merge

## License

MIT
