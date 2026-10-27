/**
 * Settings keys the n8n public API reports on GET but rejects on PUT
 * ("request/body/settings must NOT have additional properties").
 * Sending them back verbatim is the #1 way a round-trip patch fails.
 */
export const READONLY_SETTINGS = ['binaryMode', 'timeSavedMode'];

/** Top-level keys the PUT endpoint accepts. */
export const PUT_KEYS = ['name', 'nodes', 'connections', 'settings', 'staticData'];

export function toPutBody(wf) {
  const body = {};
  for (const k of PUT_KEYS) if (wf[k] !== undefined) body[k] = wf[k];
  if (body.settings) {
    body.settings = { ...body.settings };
    for (const k of READONLY_SETTINGS) delete body.settings[k];
  }
  if (!body.settings) body.settings = {};
  return body;
}
