/**
 * Lint rules for n8n workflow JSON. Each rule returns findings:
 *   { rule, severity: 'error'|'warning', node?: string, message }
 * The rules encode failures that n8n does not warn about and that only show up
 * at runtime, usually in production.
 */

const TRIGGER_RE = /trigger|webhook|cron|schedule|manual|start|form|chat/i;

function walkStrings(value, visit, path = []) {
  if (typeof value === 'string') return visit(value, path);
  if (Array.isArray(value)) return value.forEach((v, i) => walkStrings(v, visit, [...path, i]));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkStrings(v, visit, [...path, k]);
  }
}

export const RULES = {
  /** `$env` is blocked by default (N8N_BLOCK_ENV_ACCESS_IN_NODE) and silently resolves to undefined. */
  'env-access'(wf) {
    const out = [];
    for (const node of wf.nodes ?? []) {
      walkStrings(node.parameters, (s, path) => {
        if (/\$env\b/.test(s)) out.push({
          rule: 'env-access', severity: 'error', node: node.name,
          message: `uses $env at parameters.${path.join('.')}; embed the value or use a credential`,
        });
      });
    }
    return out;
  },

  /** `{tenant_id}`-style placeholders left over from a template generator. */
  'unreplaced-placeholder'(wf) {
    const out = [];
    for (const node of wf.nodes ?? []) {
      walkStrings(node.parameters, (s, path) => {
        const m = s.match(/(?<!\{)\{([a-z][a-z0-9_]*)\}(?!\})/g);
        if (m) out.push({
          rule: 'unreplaced-placeholder', severity: 'warning', node: node.name,
          message: `placeholder ${[...new Set(m)].join(', ')} at parameters.${path.join('.')}`,
        });
      });
    }
    return out;
  },

  'duplicate-node-name'(wf) {
    const seen = new Map();
    for (const node of wf.nodes ?? []) seen.set(node.name, (seen.get(node.name) ?? 0) + 1);
    return [...seen].filter(([, c]) => c > 1).map(([name, c]) => ({
      rule: 'duplicate-node-name', severity: 'error', node: name,
      message: `${c} nodes share this name; connections become ambiguous`,
    }));
  },

  /** A connection that names a node which does not exist. n8n accepts the PUT and breaks at run time. */
  'dangling-connection'(wf) {
    const names = new Set((wf.nodes ?? []).map((n) => n.name));
    const out = [];
    for (const [from, byType] of Object.entries(wf.connections ?? {})) {
      if (!names.has(from)) out.push({
        rule: 'dangling-connection', severity: 'error', node: from, message: 'source node does not exist',
      });
      for (const outputs of Object.values(byType)) {
        for (const output of outputs ?? []) {
          for (const edge of output ?? []) {
            if (edge?.node && !names.has(edge.node)) out.push({
              rule: 'dangling-connection', severity: 'error', node: from,
              message: `connects to missing node "${edge.node}"`,
            });
          }
        }
      }
    }
    return out;
  },

  /** Non-trigger node with no edges at all: usually a leftover from a failed patch. */
  'orphan-node'(wf) {
    const linked = new Set();
    for (const [from, byType] of Object.entries(wf.connections ?? {})) {
      for (const outputs of Object.values(byType)) {
        for (const output of outputs ?? []) for (const edge of output ?? []) {
          if (edge?.node) { linked.add(from); linked.add(edge.node); }
        }
      }
    }
    return (wf.nodes ?? [])
      .filter((n) => !linked.has(n.name) && !TRIGGER_RE.test(n.type) && !n.disabled)
      .map((n) => ({ rule: 'orphan-node', severity: 'warning', node: n.name, message: 'no incoming or outgoing connections' }));
  },

  /** Two nodes drawn on top of each other hide one of them in the editor. */
  'overlapping-position'(wf, { minDistance = 40 } = {}) {
    const nodes = (wf.nodes ?? []).filter((n) => Array.isArray(n.position));
    const out = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const [ax, ay] = nodes[i].position, [bx, by] = nodes[j].position;
      if (Math.abs(ax - bx) < minDistance && Math.abs(ay - by) < minDistance) out.push({
        rule: 'overlapping-position', severity: 'warning', node: nodes[j].name,
        message: `overlaps "${nodes[i].name}" at [${bx}, ${by}]`,
      });
    }
    return out;
  },

  /** Settings keys that GET returns but PUT rejects. `push` strips them; `lint` tells you why. */
  'readonly-settings'(wf) {
    const bad = ['binaryMode', 'timeSavedMode'].filter((k) => wf.settings && k in wf.settings);
    return bad.map((k) => ({
      rule: 'readonly-settings', severity: 'warning',
      message: `settings.${k} is returned by GET but rejected by PUT`,
    }));
  },

  'missing-credential'(wf) {
    const out = [];
    for (const node of wf.nodes ?? []) {
      for (const [type, cred] of Object.entries(node.credentials ?? {})) {
        if (!cred || !cred.id) out.push({
          rule: 'missing-credential', severity: 'error', node: node.name, message: `credential "${type}" has no id`,
        });
      }
    }
    return out;
  },
};

export function lintWorkflow(wf, { rules = Object.keys(RULES), options = {} } = {}) {
  const findings = [];
  for (const name of rules) {
    const rule = RULES[name];
    if (!rule) throw new Error(`unknown rule: ${name}`);
    findings.push(...rule(wf, options[name] ?? {}));
  }
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  return { findings, errors, warnings, ok: errors === 0 };
}

export function formatFindings(result) {
  if (!result.findings.length) return 'no findings';
  const lines = result.findings.map((f) => {
    const where = f.node ? ` [${f.node}]` : '';
    return `${f.severity === 'error' ? 'E' : 'W'} ${f.rule}${where}: ${f.message}`;
  });
  lines.push(`${result.errors} error(s), ${result.warnings} warning(s)`);
  return lines.join('\n');
}
