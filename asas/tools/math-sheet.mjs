/**
 * لوحة مراجعة بصرية لكل معادلات قاعدة المعرفة: تحوّلها وترسمها في صفحة HTML ثم تلتقط صورًا.
 * الاستعمال: node tools/math-sheet.mjs [مجلد الإخراج]
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { KB } from '../src/data/kb/index.js';
import { mathPieces, autoMath } from '../src/core/mathconv.js';
import { svg } from '../src/core/mathjax.js';

const out = resolve(process.argv[2] || 'tools/out');
mkdirSync(out, { recursive: true });
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const m = (tex, src) => { const r = svg(tex, false); return r ? `<span class="m">${r.svg}</span>` : `<b class="err">${esc(src)}</b>`; };
const prose = (t) => autoMath(t).map((x) => (x.math !== undefined ? m(x.math, x.src) : esc(x.text))).join('');
const line = (l) => mathPieces(l).map((p) => p.t === 'math' ? m(p.tex, p.src) : p.t === 'label' ? `<span class="lb">${esc(p.s)}:</span>` : p.t === 'note' ? `<span class="nt">(${p.parts.map((x) => x.math !== undefined ? m(x.math, x.src) : esc(x.text)).join('')})</span>` : `<span>${esc(p.s)}</span>`).join(' ');

const rows = [];
for (const [id, kb] of Object.entries(KB)) {
  const eqs = kb.calc?.eq || [];
  const items = [...eqs.map((e) => ['eq', e]), ...(kb.calc?.vars || []).map((v) => ['v', v]), ...(kb.calc?.example ? [['ex', kb.calc.example]] : []),
    ...(kb.examples || []).flatMap((e) => [...(e.s || []), e.a].map((s) => ['st', s]))];
  for (const [k, t] of items) rows.push(`<div class="row ${k}"><code>${esc(id)}</code><div class="r">${k === 'eq' ? line(t) : prose(t)}</div></div>`);
}
const html = `<!doctype html><meta charset="utf-8"><style>
body{font:17px/1.9 "Noto Naskh Arabic","Noto Sans Arabic",serif;direction:rtl;margin:16px;width:1100px}
.row{display:flex;gap:10px;border-bottom:1px solid #eee;padding:4px 0}.row code{font-size:10px;color:#999;width:110px;direction:ltr}
.eq .r{text-align:center;flex:1;font-size:19px}.r{flex:1}.m svg{overflow:visible}.lb{color:#555}.nt{color:#666;font-size:15px}.err{color:red}
</style>${rows.join('\n')}`;
writeFileSync(`${out}/sheet.html`, html);
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((x) => existsSync(x)), args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1140, height: 1000 } });
await p.goto(`file://${out}/sheet.html`);
const H = await p.evaluate(() => document.body.scrollHeight);
let n = 0;
for (let y = 0; y < H; y += 1800) { await p.screenshot({ path: `${out}/sheet-${String(++n).padStart(2, '0')}.png`, fullPage: true, clip: { x: 0, y, width: 1140, height: Math.min(1800, H - y) } }); }
console.log('rows', rows.length, 'pages', n, 'errors', (html.match(/class="err"/g) || []).length);
await b.close();
