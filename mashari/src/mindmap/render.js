/**
 * رسم الخريطة بـ SVG: كل دائرة حجمها حسب كلامها، والخطوط تربط بين المراكز.
 * نفس الرسم يُستعمل للمحرّر وللمعاينة الصغيرة.
 */

import { svg } from '../core/dom.js';
import { labelOf, bounds } from './model.js';

export const FONT = "'Noto Sans Arabic', 'Segoe UI', Tahoma, system-ui, sans-serif";

const ctx = document.createElement('canvas').getContext('2d');
const cache = new Map();

function measure(text, size, weight) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  return ctx.measureText(text).width;
}

/** يكسر الكلمة الطويلة جدًا لقطع تدخل بالسطر. */
function splitLong(word, maxW, size, weight) {
  if (measure(word, size, weight) <= maxW * 1.35) return [word];
  const parts = [];
  let cur = '';
  for (const ch of word) {
    if (cur && measure(cur + ch, size, weight) > maxW) { parts.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function wrap(text, maxW, size, weight) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean).flatMap((w) => splitLong(w, maxW, size, weight));
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (!line || measure(test, size, weight) <= maxW) line = test;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

/** أسطر الدائرة ونصف قطرها. */
export function nodeBox(node, rootLabel) {
  const isRoot = node.id === 'root';
  const label = labelOf(node, rootLabel) || '';
  const key = (isRoot ? 'R|' : 'N|') + label;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = isRoot ? 15 : 13;
  const weight = isRoot ? 700 : 600;
  const lh = isRoot ? 20 : 17.5;
  const len = label.length;
  const maxW = isRoot ? (len <= 18 ? 120 : 150) : (len <= 12 ? 82 : len <= 34 ? 106 : 134);
  let lines = wrap(label, maxW, size, weight);
  const maxLines = isRoot ? 4 : 7;
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  const w = Math.max(...lines.map((l) => measure(l, size, weight)));
  const hgt = lines.length * lh;
  const r = Math.max(isRoot ? 46 : 30, Math.ceil(Math.hypot(w / 2, hgt / 2)) + (isRoot ? 12 : 9));
  const box = { lines, r, size, weight, lh };
  if (cache.size > 2000) cache.clear();
  cache.set(key, box);
  return box;
}

export const makeRadius = (rootLabel) => (n) => nodeBox(n, rootLabel).r;

/** يرسم الخطوط والدوائر داخل مجموعتين. يعيد مراجع العناصر لتحديثها أثناء السحب. */
export function drawMap(linksG, nodesG, map, rootLabel, { selected = null, linkFrom = null } = {}) {
  linksG.replaceChildren();
  nodesG.replaceChildren();
  const nodeEls = new Map();
  const linkEls = [];
  const byId = new Map(map.nodes.map((n) => [n.id, n]));

  for (const n of map.nodes) {
    const p = n.p && byId.get(n.p);
    if (!p) continue;
    const el = svg('line', { class: `mm-link c-${n.c}`, x1: p.x, y1: p.y, x2: n.x, y2: n.y });
    linksG.append(el);
    linkEls.push({ el, a: p.id, b: n.id });
  }
  for (const [a, b] of map.links) {
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) continue;
    const el = svg('line', { class: 'mm-xlink', x1: na.x, y1: na.y, x2: nb.x, y2: nb.y });
    linksG.append(el);
    linkEls.push({ el, a, b });
  }

  for (const n of map.nodes) {
    const box = nodeBox(n, rootLabel);
    const cls = ['mm-node', `c-${n.c}`];
    if (n.id === 'root') cls.push('root');
    if (selected === n.id) cls.push('sel');
    if (linkFrom === n.id) cls.push('linking');
    const g = svg('g', { class: cls.join(' '), transform: `translate(${n.x} ${n.y})`, 'data-id': n.id });
    g.append(svg('circle', { class: 'halo', r: box.r + 7 }));
    g.append(svg('circle', { class: 'body', r: box.r }));
    const text = svg('text', {
      'font-family': FONT, 'font-size': box.size, 'font-weight': box.weight,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    });
    const top = -((box.lines.length - 1) * box.lh) / 2;
    box.lines.forEach((line, i) => text.append(svg('tspan', { x: 0, y: top + i * box.lh, text: line })));
    g.append(text);
    nodesG.append(g);
    nodeEls.set(n.id, g);
  }
  return { nodeEls, linkEls };
}

/** معاينة صغيرة ثابتة للخريطة. */
export function mapPreview(map, rootLabel) {
  const b = bounds(map, makeRadius(rootLabel));
  const pad = 26;
  const el = svg('svg', {
    class: 'mm-preview',
    viewBox: `${b.x0 - pad} ${b.y0 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`,
    preserveAspectRatio: 'xMidYMid meet',
    'aria-hidden': 'true',
  });
  const lg = svg('g');
  const ng = svg('g');
  el.append(lg, ng);
  drawMap(lg, ng, map, rootLabel);
  return el;
}
