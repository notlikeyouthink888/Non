/**
 * تشغيل خادم المدير (server/worker.js) محليًا للفحص: قاعدة D1 بديلة فوق node:sqlite،
 * ومزوّدات وهمية (OpenRouter وClaude وتيليغرام) على منفذ آخر تسجّل ما يصلها.
 */

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import worker, { ReportJob } from '../server/worker.js';
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

/**
 * بديل Durable Objects: نسخة واحدة لكل معرّف، تخزين في الذاكرة بنسخ منظَّم، ومنبّه بمؤقّت.
 * evict(id) يستبدل النسخة بأخرى جديدة على التخزين نفسه (كإعادة تشغيل الخادم).
 */
export function durable(Cls, env) {
  const objs = new Map();
  const make = () => {
    const data = new Map();
    let timer = null;
    const entry = { data };
    const storage = {
      get: async (k) => (Array.isArray(k) ? new Map(k.filter((x) => data.has(x)).map((x) => [x, structuredClone(data.get(x))])) : structuredClone(data.get(k))),
      put: async (k, v) => {
        if (typeof k === 'object') for (const [a, b] of Object.entries(k)) data.set(a, structuredClone(b));
        else data.set(k, structuredClone(v));
      },
      delete: async (k) => data.delete(k),
      deleteAll: async () => data.clear(),
      list: async ({ prefix = '' } = {}) => new Map([...data.keys()].filter((k) => k.startsWith(prefix)).sort().map((k) => [k, structuredClone(data.get(k))])),
      setAlarm: async (t) => {
        clearTimeout(timer);
        timer = setTimeout(() => entry.obj.alarm().catch((e) => console.error('[alarm]', e)), Math.max(0, Number(t) - Date.now()));
        timer.unref?.();
      },
      deleteAlarm: async () => clearTimeout(timer),
    };
    entry.state = { storage, waitUntil: () => {} };
    entry.obj = new Cls(entry.state, env);
    return entry;
  };
  return {
    idFromName: (n) => String(n),
    get: (id) => ({ fetch: async (req) => { if (!objs.has(id)) objs.set(id, make()); return objs.get(id).obj.fetch(req); } }),
    evict: (id) => { const e = objs.get(id); if (e) e.obj = new Cls(e.state, env); },
    has: (id) => objs.has(id),
  };
}

/** يرسل بث SSE دفعة واحدة، أو حدثًا حدثًا بمهلة (ctl.slow) لمحاكاة كتابة تستغرق وقتًا. */
async function sendSse(res, text, delay) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  if (!delay) { res.end(text); return; }
  for (const ev of text.split(/(?<=\n\n)/)) {
    if (res.destroyed) return;
    res.write(ev);
    await new Promise((r) => setTimeout(r, delay));
  }
  res.end();
}

const readBody = (req) => new Promise((res) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });

/** المزوّدات الوهمية: تعيد تقريرًا تجريبيًا، وترفض المفاتيح التي فيها «limit» بانتهاء الحصة اليومية. */
export function startUpstream(port) {
  const log = { or: [], an: [], tg: [], gem: [] };
  const ctl = { slow: 0 }; // مهلة بين أحداث البث (ملّي ثانية)
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const url = new URL(req.url, 'http://x');
    const auth = req.headers.authorization || req.headers['x-api-key'] || '';
    const send = (status, obj, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
    if (url.pathname.startsWith('/tg/')) {
      const type = req.headers['content-type'] || '';
      const json = /json/.test(type) ? JSON.parse(body.toString('utf8') || '{}') : null;
      const chat = json ? String(json.chat_id) : (body.toString('latin1').match(/name="chat_id"\r\n\r\n([^\r]+)/) || [])[1] || '';
      log.tg.push({ path: url.pathname, type, chat, json, raw: body, body: body.toString('utf8') });
      // محادثة غير موجودة (لاختبار رسائل الفشل)
      if (chat === '999') return send(400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' });
      const fileId = `FILE-${log.tg.length}`;
      return send(200, { ok: true, result: url.pathname.endsWith('/sendDocument') ? { document: { file_id: json?.document || fileId } } : {} });
    }
    // Gemini: مفتاح فيه «FlashOut» انتهت حصته اليومية لأول نموذج فقط (الحصة لكل نموذج)، و«Bad» مرفوض
    const gkey = req.headers['x-goog-api-key'] || auth.replace(/^Bearer /, '');
    if (url.pathname === '/gemini/v1beta/models') {
      if (!/^AIza/.test(gkey) || /Bad/.test(gkey)) return send(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } });
      return send(200, { models: [
        { name: 'models/gemini-flash-latest', displayName: 'Gemini Flash Latest', supportedGenerationMethods: ['generateContent', 'countTokens'], inputTokenLimit: 1048576, outputTokenLimit: 65536 },
        { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1048576, outputTokenLimit: 65536 },
        { name: 'models/gemini-2.5-flash-preview-tts', displayName: 'Gemini TTS', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
      ] });
    }
    if (url.pathname === '/gemini/v1beta/openai/chat/completions') {
      const b = JSON.parse(body.toString('utf8') || '{}');
      log.gem.push({ key: gkey, model: b.model, stream: !!b.stream, models: b.models, reasoning: b.reasoning, reasoning_effort: b.reasoning_effort, response_format: b.response_format });
      if (/Bad/.test(gkey)) return send(400, [{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }]);
      if (/FlashOut/.test(gkey) && b.model === 'gemini-flash-latest') {
        return send(429, [{ error: { code: 429, message: 'You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20', status: 'RESOURCE_EXHAUSTED', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }]);
      }
      const user = b.messages?.[1]?.content;
      const text = typeof user === 'string' ? user : (user || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
      if (b.stream) return sendSse(res, orSse(reportMarkdown(text), b.model), ctl.slow);
      const sys = b.messages?.[0]?.content || '';
      const props = Object.fromEntries(['figures', 'choices', 'titles', 'ok'].filter((k) => sys.includes(`"${k}"`)).map((k) => [k, {}]));
      return send(200, { id: 'gem', model: b.model, choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(jsonFor({ messages: b.messages }, props)) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    if (url.pathname === '/api/v1/key') return /limit|good|second/.test(auth) ? send(200, { data: { label: 'x', is_free_tier: true, limit_remaining: 40 } }) : send(401, { error: { code: 401, message: 'No auth' } });
    if (url.pathname === '/api/v1/chat/completions') {
      const b = JSON.parse(body.toString('utf8') || '{}');
      log.or.push({ key: auth, models: b.models, model: b.model, stream: !!b.stream });
      if (/limit/.test(auth)) return send(429, { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day' } });
      if (/bad/.test(auth)) return send(401, { error: { code: 401, message: 'User not found.' } });
      const user = b.messages?.[1]?.content;
      const text = typeof user === 'string' ? user : (user || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
      if (b.stream) return sendSse(res, orSse(reportMarkdown(text), b.models[0]), ctl.slow);
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
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, log, ctl })));
}

/** يشغّل الـ Worker خلف خادم HTTP محلي. */
export function startWorker(port, upstreamPort, { password = 'admin-pass-123' } = {}) {
  const env = {
    DB: d1(),
    ADMIN_PASSWORD: password,
    OR_UPSTREAM: `http://127.0.0.1:${upstreamPort}/api/v1`,
    ANTHROPIC_UPSTREAM: `http://127.0.0.1:${upstreamPort}`,
    GEMINI_UPSTREAM: `http://127.0.0.1:${upstreamPort}/gemini/v1beta`,
    TELEGRAM_API: `http://127.0.0.1:${upstreamPort}/tg`,
  };
  env.JOBS = durable(ReportJob, env);
  // cutAfter: يقطع اتصال الهاتف بعد هذا العدد من بايتات رد مهمة (مرة واحدة)، كضعف الشبكة
  const ctl = { cutAfter: 0, cuts: 0, jobs: 0 };
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
    if (out['x-asas-job']) ctl.jobs++;
    let sent = 0;
    if (r.body) {
      for await (const chunk of r.body) {
        if (ctl.cutAfter && out['x-asas-job'] && sent + chunk.byteLength > ctl.cutAfter) {
          res.write(chunk.subarray(0, Math.max(0, ctl.cutAfter - sent)));
          ctl.cutAfter = 0;
          ctl.cuts++;
          res.destroy();
          return;
        }
        res.write(chunk);
        sent += chunk.byteLength;
      }
    }
    res.end();
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, env, ctl, settle: () => Promise.all([...pending]) })));
}
