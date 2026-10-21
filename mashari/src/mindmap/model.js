/**
 * بيانات الخريطة الذهنية: دوائر (nodes) لكل دائرة أب واحد، وروابط إضافية حرّة بين أي دائرتين.
 * map = { nodes: [{ id, t, x, y, c, p }], links: [[a, b]] }
 * الدائرة المركزية id = 'root' ونصّها null يعني «اسم المشروع».
 */

import { uid } from '../core/store.js';
import { MAP_TEMPLATE } from '../data/guide.js';

export const COLORS = [
  { id: 'n', name: 'رمادي' },
  { id: 'b', name: 'أزرق' },
  { id: 'c', name: 'فيروزي' },
  { id: 'p', name: 'بنفسجي' },
  { id: 'k', name: 'وردي' },
  { id: 'y', name: 'أصفر — فكرة' },
  { id: 'g', name: 'أخضر — إيجابي' },
  { id: 'r', name: 'أحمر — سلبي' },
];

/** ألوان فروع المركز بالتناوب (الأخضر والأحمر نخليها لاختيارك). */
const BRANCH_CYCLE = ['b', 'p', 'y', 'c', 'k'];

export function newMap() {
  return { nodes: [{ id: 'root', t: null, x: 0, y: 0, c: 'root', p: null }], links: [] };
}

export function ensureMap(study) {
  if (!study.map || !study.map.nodes?.length) study.map = newMap();
  return study.map;
}

export const nodeById = (map, id) => map.nodes.find((n) => n.id === id) || null;
export const childrenOf = (map, id) => map.nodes.filter((n) => n.p === id);

/** الدائرة وكل فروعها (لأي عمق). */
export function descendants(map, id) {
  const out = [id];
  for (let i = 0; i < out.length; i++) {
    for (const n of map.nodes) if (n.p === out[i]) out.push(n.id);
  }
  return out;
}

export function labelOf(node, rootLabel) {
  return node.id === 'root' ? (node.t || rootLabel) : node.t;
}

/** يضيف فرعًا ويختار له مكانًا فارغًا قريبًا من أبوه. */
export function addChild(map, parentId, text, radiusOf, color = null) {
  const parent = nodeById(map, parentId) || nodeById(map, 'root');
  const c = color || (parent.id === 'root'
    ? BRANCH_CYCLE[childrenOf(map, 'root').length % BRANCH_CYCLE.length]
    : parent.c);
  const node = { id: uid('n'), t: text, x: parent.x, y: parent.y, c, p: parent.id };
  map.nodes.push(node);
  const spot = findSpot(map, parent, node, radiusOf);
  node.x = Math.round(spot.x);
  node.y = Math.round(spot.y);
  return node;
}

function findSpot(map, parent, node, radiusOf) {
  const rP = radiusOf(parent);
  const rN = radiusOf(node);
  const others = map.nodes.filter((n) => n.id !== node.id);
  const isRoot = !parent.p;
  let candidates;
  if (isRoot) {
    // حول المركز: نبدأ من فوق ونوزّع بالتساوي
    candidates = Array.from({ length: 16 }, (_, i) => ({ a: -Math.PI / 2 + (i * Math.PI) / 8, off: 0 }));
  } else {
    const gp = nodeById(map, parent.p) || { x: 0, y: 0 };
    const base = Math.atan2(parent.y - gp.y, parent.x - gp.x) || 0;
    candidates = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.1, -2.1].map((off) => ({ a: base + off, off }));
  }

  let best = null;
  for (let ring = 0; ring < 5; ring++) {
    const dist = rP + rN + (isRoot ? 70 : 46) + ring * 64;
    for (const { a, off } of candidates) {
      const x = parent.x + Math.cos(a) * dist;
      const y = parent.y + Math.sin(a) * dist;
      let clear = Infinity;
      for (const o of others) {
        const d = Math.hypot(o.x - x, o.y - y) - radiusOf(o) - rN - 16;
        if (d < clear) clear = d;
      }
      // للمركز: أبعد مكان عن الباقين. للفروع: مروحة تبدأ من الاتجاه نفسه.
      const score = isRoot ? clear : Math.min(clear, 26) - Math.abs(off) * 9 - ring * 30;
      if (!best || score > best.score) best = { x, y, clear, score };
    }
    if (best.clear >= 0) return best;
  }
  return best;
}

/** يحذف الدائرة وفروعها وأي روابط عليها. */
export function deleteNode(map, id) {
  if (id === 'root') return;
  const gone = new Set(descendants(map, id));
  map.nodes = map.nodes.filter((n) => !gone.has(n.id));
  map.links = map.links.filter(([a, b]) => !gone.has(a) && !gone.has(b));
}

/** يربط أو يفك الربط بين دائرتين. يعيد added | removed | tree */
export function toggleLink(map, a, b) {
  const na = nodeById(map, a);
  const nb = nodeById(map, b);
  if (!na || !nb || a === b) return 'tree';
  if (na.p === b || nb.p === a) return 'tree';
  const i = map.links.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (i >= 0) {
    map.links.splice(i, 1);
    return 'removed';
  }
  map.links.push([a, b]);
  return 'added';
}

/** يضيف فروع القالب اللي مو موجودة. يعيد عدد المضاف. */
export function applyTemplate(map, radiusOf) {
  const have = new Set(childrenOf(map, 'root').map((n) => n.t));
  let added = 0;
  for (const b of MAP_TEMPLATE) {
    if (have.has(b.t)) continue;
    addChild(map, 'root', b.t, radiusOf, b.c);
    added++;
  }
  return added;
}

/** ينقل الإيجابيات والسلبيات من الدراسة كفروع. يعيد عدد المضاف. */
export function importPoints(map, study, radiusOf, titles = { pros: '✅ الإيجابيات', cons: '❌ السلبيات' }) {
  let added = 0;
  const branch = (title, color, items) => {
    if (!items.length) return;
    let b = childrenOf(map, 'root').find((n) => n.t === title);
    if (!b) b = addChild(map, 'root', title, radiusOf, color);
    const have = new Set(childrenOf(map, b.id).map((n) => n.t));
    for (const it of items) {
      if (have.has(it.t)) continue;
      addChild(map, b.id, it.t, radiusOf, color);
      added++;
    }
  };
  branch(titles.pros, 'g', study.pros);
  branch(titles.cons, 'r', study.cons);
  return added;
}

/** ترتيب دائري تلقائي: كل فرع ياخذ زاوية حسب حجمه، وكل مستوى بحلقة أبعد. */
export function autoLayout(map, radiusOf) {
  const kids = new Map(map.nodes.map((n) => [n.id, []]));
  map.nodes.forEach((n) => { if (n.p && kids.has(n.p)) kids.get(n.p).push(n); });
  const leafCount = new Map();
  const leaves = (id) => {
    if (leafCount.has(id)) return leafCount.get(id);
    const ch = kids.get(id) || [];
    const v = ch.length ? ch.reduce((a, c) => a + leaves(c.id), 0) : 1;
    leafCount.set(id, v);
    return v;
  };

  // أكبر نصف قطر وعدد الدوائر بكل مستوى
  const depthOf = new Map([['root', 0]]);
  const order = [nodeById(map, 'root')];
  for (let i = 0; i < order.length; i++) {
    for (const c of kids.get(order[i].id) || []) {
      depthOf.set(c.id, depthOf.get(order[i].id) + 1);
      order.push(c);
    }
  }
  const maxR = [];
  const count = [];
  for (const n of order) {
    const d = depthOf.get(n.id);
    maxR[d] = Math.max(maxR[d] || 0, radiusOf(n));
    count[d] = (count[d] || 0) + 1;
  }
  const ringR = [0];
  for (let d = 1; d < maxR.length; d++) {
    const spaced = ringR[d - 1] + maxR[d - 1] + maxR[d] + 56;
    const roomy = (count[d] * (2 * maxR[d] + 22)) / (2 * Math.PI);
    ringR[d] = Math.max(spaced, roomy);
  }

  const root = nodeById(map, 'root');
  root.x = 0;
  root.y = 0;
  const place = (id, a0, a1, depth) => {
    const ch = kids.get(id) || [];
    const total = ch.reduce((a, c) => a + leaves(c.id), 0);
    let a = a0;
    for (const c of ch) {
      const span = ((a1 - a0) * leaves(c.id)) / total;
      const mid = a + span / 2;
      c.x = Math.round(Math.cos(mid) * ringR[depth + 1]);
      c.y = Math.round(Math.sin(mid) * ringR[depth + 1]);
      place(c.id, a, a + span, depth + 1);
      a += span;
    }
  };
  place('root', -Math.PI / 2, (3 * Math.PI) / 2, 0);
}

/** حدود الخريطة لتوسيط العرض. */
export function bounds(map, radiusOf) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of map.nodes) {
    const r = radiusOf(n);
    x0 = Math.min(x0, n.x - r);
    y0 = Math.min(y0, n.y - r);
    x1 = Math.max(x1, n.x + r);
    y1 = Math.max(y1, n.y + r);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** الخريطة كنص مرتّب (للمشاركة والنسخ). */
export function outline(map, rootLabel) {
  const lines = [];
  const walk = (id, depth) => {
    const n = nodeById(map, id);
    if (!n) return;
    lines.push('   '.repeat(Math.max(0, depth - 1)) + (depth ? '• ' : '') + labelOf(n, rootLabel));
    childrenOf(map, id).forEach((c) => walk(c.id, depth + 1));
  };
  walk('root', 0);
  if (map.links.length) {
    lines.push('', '🔗 روابط:');
    for (const [a, b] of map.links) {
      const na = nodeById(map, a);
      const nb = nodeById(map, b);
      if (na && nb) lines.push(`• ${labelOf(na, rootLabel)} ↔ ${labelOf(nb, rootLabel)}`);
    }
  }
  return lines.join('\n');
}
