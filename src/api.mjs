/** Thin client for the n8n public REST API (v1). Reads base URL and key from env by default. */
export class N8nClient {
  constructor({ baseUrl = process.env.N8N_URL, apiKey = process.env.N8N_API_KEY, fetchImpl = globalThis.fetch } = {}) {
    if (!baseUrl) throw new Error('N8N_URL is not set');
    if (!apiKey) throw new Error('N8N_API_KEY is not set');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async request(method, path, body) {
    const res = await this.fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: { 'X-N8N-API-KEY': this.apiKey, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  getWorkflow(id) { return this.request('GET', `/workflows/${encodeURIComponent(id)}`); }
  updateWorkflow(id, body) { return this.request('PUT', `/workflows/${encodeURIComponent(id)}`, body); }
  listWorkflows() { return this.request('GET', '/workflows?limit=250'); }
}
