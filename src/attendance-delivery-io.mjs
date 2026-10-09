import { setTimeout as delay } from 'node:timers/promises';

// Retry reads/token exchange, never blindly retry message POSTs or lease writes.
export async function request(url, init = {}, { retrySafe = false, fetchImpl = fetch, sleep = delay } = {}) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try { response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(30000) }); }
    catch (error) {
      if (!retrySafe || attempt >= 2) throw new Error('NETWORK_REQUEST_FAILED', { cause: error });
      await sleep(1000 * 2 ** attempt); continue;
    }
    const throttled = response.status === 429;
    if (retrySafe && attempt < 2 && (throttled || [500, 502, 503, 504].includes(response.status))) {
      const retryAfter = response.headers.get('retry-after');
      const seconds = /^\d+$/.test(retryAfter || '') ? Number(retryAfter) : Math.max(0, (Date.parse(retryAfter) - Date.now()) / 1000);
      if (Number.isFinite(seconds) && seconds > 60) return response;
      await response.arrayBuffer();
      await sleep(Number.isFinite(seconds) ? seconds * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    return response;
  }
}
export function createRepoStore(repository, token, fetcher = request) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) throw new Error('Missing repository ledger credentials');
  const base = `https://api.github.com/repos/${repository}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  async function read(file) {
    const r = await fetcher(`${base}/contents/${file}?ref=main`, { headers }, { retrySafe: true });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`LEDGER_READ_FAILED: HTTP ${r.status}`);
    const body = await r.json();
    return { sha: body.sha, value: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) };
  }
  async function write(file, value, expectedSha, message) {
    const json = JSON.stringify(value);
    const body = { message: `${message} [skip ci]`, branch: 'main', content: Buffer.from(`${json}\n`).toString('base64'), ...(expectedSha ? { sha: expectedSha } : {}) };
    try {
      const r = await fetcher(`${base}/contents/${file}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`LEDGER_WRITE_FAILED: HTTP ${r.status}`);
      return { sha: (await r.json()).content.sha, value };
    } catch (error) {
      // A timed-out PUT might have succeeded. Read it back rather than overwrite.
      const current = await read(file);
      if (current && JSON.stringify(current.value) === json) return current;
      throw error;
    }
  }
  async function successfulRun(runId) {
    if (!/^\d+$/.test(String(runId))) throw new Error('Invalid source run');
    const r = await fetcher(`${base}/actions/runs/${runId}`, { headers }, { retrySafe: true });
    if (!r.ok) throw new Error(`PRODUCER_RUN_READ_FAILED: HTTP ${r.status}`);
    const run = await r.json();
    if (run.status !== 'completed' || run.conclusion !== 'success' || run.name !== 'Attendance Crawl' || run.head_branch !== 'main') throw new Error('PRODUCER_NOT_SUCCESSFUL');
  }
  return { read, write, successfulRun };
}
