/**
 * تشغيل خادم المدير (server/worker.js) محليًا للفحص: قاعدة D1 بديلة فوق node:sqlite،
 * ومزوّدات وهمية (OpenRouter وClaude وتيليغرام) على منفذ آخر تسجّل ما يصلها.
 */

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import worker from '../server/worker.js';
import { reportMarkdown, orSse, jsonFor } from './mocks.mjs';

/** بديل D1 بالواجهة نفسها: prepare().bind().first/all/run و batch. */
export function d1(file = ':memory:') {
  const db = new DatabaseSync(file);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())), raw: db };
}

const readBody = (req) => new Promise((res) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });

/** المزوّدات الوهمية: تعيد تقريرًا تجريبيًا، وترفض المفاتيح التي فيها «limit» بانتهاء الحصة اليومية. */
export function startUpstream(port) {
  const log = { or: [], an: [], tg: [] };
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const url = new URL(req.url, 'http://x');
    const auth = req.headers.authorization || req.headers['x-api-key'] || '';
    const send = (status, obj, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
    if (url.pathname.startsWith('/tg/')) {
      log.tg.push({ path: url.pathname, type: req.headers['content-type'] || '', body: body.toString('utf8') });
      return send(200, { ok: true, result: {} });
    }
    if (url.pathname === '/api/v1/key') return /limit|good|second/.test(auth) ? send(200, { data: { label: 'x', is_free_tier: true, limit_remaining: 40 } }) : send(401, { error: { code: 401, message: 'No auth' } });
    if (url.pathname === '/api/v1/chat/completions') {
      const b = JSON.parse(body.toString('utf8') || '{}');
      log.or.push({ key: auth, models: b.models, model: b.model, stream: !!b.stream });
      if (/limit/.test(auth)) return send(429, { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day' } });
      if (/bad/.test(auth)) return send(401, { error: { code: 401, message: 'User not found.' } });
      const user = b.messages?.[1]?.content;
      const text = typeof user === 'string' ? user : (user || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
      if (b.stream) { res.writeHead(200, { 'content-type': 'text/event-stream' }); return res.end(orSse(reportMarkdown(text), b.models[0])); }
      const sys = b.messages?.[0]?.content || '';
      const props = b.response_format?.json_schema?.schema?.properties || Object.fromEntries(['figures', 'choices', 'titles', 'ok'].filter((k) => sys.includes(`"${k}"`)).map((k) => [k, {}]));
      return send(200, { id: 'gen', model: b.models[0], choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(jsonFor({ messages: b.messages }, props)) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    if (url.pathname === '/v1/models') return /sk-ant/.test(auth) && !/bad/.test(auth) ? send(200, { data: [] }) : send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    if (url.pathname === '/v1/messages') {
      const b = JSON.parse(body.toString('utf8') || '{}');
      log.an.push({ key: auth, model: b.model, fallbacks: b.fallbacks, beta: req.headers['anthropic-beta'] || '' });
      if (/credit/.test(auth)) return send(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } });
      return send(200, { id: 'msg', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text: 'مرحبا' }], stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 2 } });
    }
    send(404, { error: 'not found' });
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, log })));
}

/** يشغّل الـ Worker خلف خادم HTTP محلي. */
export function startWorker(port, upstreamPort, { password = 'admin-pass-123' } = {}) {
  const env = {
    DB: d1(),
    ADMIN_PASSWORD: password,
    OR_UPSTREAM: `http://127.0.0.1:${upstreamPort}/api/v1`,
    ANTHROPIC_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
    TELEGRAM_API: `http://127.0.0.1:${upstreamPort}/tg`,
  };
  const pending = new Set();
  const ctx = { waitUntil: (p) => { const x = Promise.resolve(p).catch(() => {}); pending.add(x); x.finally(() => pending.delete(x)); } };
  const server = createServer(async (req, res) => {
    const body = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : await readBody(req);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const r = await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, body }), env, ctx);
    const out = {};
    r.headers.forEach((v, k) => { if (k !== 'content-length' && k !== 'content-encoding') out[k] = v; });
    res.writeHead(r.status, out);
    if (r.body) { for await (const chunk of r.body) res.write(chunk); }
    res.end();
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, env, settle: () => Promise.all([...pending]) })));
}
