/** ملخّص نهاية اليوم — يُبنى عند منتصف الليل ويُعرض عند أول فتح بعده. */

import { h } from '../../core/dom.js';
import { state, save } from '../../core/store.js';
import { durMin, longDate, fromDayKey, dayKey } from '../../core/fmt.js';
import { sheet } from '../../core/ui.js';

const SECTION_NAMES = {
  music: 'الأغاني', time: 'الوقت', commit: 'الالتزامات', places: 'الأماكن', growth: 'الإنتاجية',
};

/** يبني ملخّصًا ليوم محدّد ('YYYY-MM-DD'). */
export function buildSummary(key) {
  const usage = state.time.usage.days[key] || { ms: 0, opens: 0, sections: {} };
  const tasks = state.time.tasks.filter((t) => t.date === key);
  const doneTasks = tasks.filter((t) => t.done);
  const commits = state.commit.log[key] || [];
  const growthDone = state.growth.done.filter((d) => typeof d === 'object' && d.day === key);

  const sections = Object.entries(usage.sections || {})
    .sort((a, b) => b[1] - a[1])
    .map(([id, ms]) => ({ id, name: SECTION_NAMES[id] || id, ms }));

  const minutes = usage.ms / 60000;
  const limit = state.time.usage.dailyLimitMin || 420;

  return {
    day: key,
    usageMs: usage.ms,
    usageText: durMin(minutes),
    opens: usage.opens,
    overLimit: minutes >= limit,
    limitText: durMin(limit),
    sections,
    tasksTotal: tasks.length,
    tasksDone: doneTasks.length,
    commitsDone: commits.length,
    commitsTotal: state.commit.active.length,
    growthDone: growthDone.length,
    score: score({ minutes, limit, tasks: tasks.length, doneTasks: doneTasks.length, commits: commits.length, commitsTotal: state.commit.active.length }),
    seen: false,
    builtAt: Date.now(),
  };
}

function score({ minutes, limit, tasks, doneTasks, commits, commitsTotal }) {
  let s = 50;
  if (tasks) s += (doneTasks / tasks) * 25; else s += 10;
  if (commitsTotal) s += (commits / commitsTotal) * 25; else s += 10;
  if (minutes > limit) s -= Math.min(25, (minutes - limit) / 12);
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** الرأي المختصر على اليوم. */
function verdict(s) {
  if (s.score >= 85) return { tone: 'ok', text: 'يوم ممتاز — حافظ على هذا الإيقاع.' };
  if (s.score >= 65) return { tone: 'ok', text: 'يوم جيّد. عنصر واحد إضافي غدًا يكفي.' };
  if (s.score >= 45) return { tone: 'warn', text: 'يوم متوسّط — ابدأ غدًا بأصعب مهمة أولًا.' };
  return { tone: 'danger', text: 'يوم ضعيف. اختر التزامًا واحدًا فقط لغد وأنجزه.' };
}

export function showSummarySheet(summary) {
  if (!summary) return;
  const s = state.time.summaries[summary.day] || summary;
  s.seen = true;
  save();

  const v = verdict(s);
  const date = longDate(fromDayKey(s.day));

  sheet('ملخّص يومك', h('div', [
    h('div.center', { style: { marginBottom: '14px' } }, [
      h('div.muted', date),
      h('div', { style: { fontSize: '46px', fontWeight: '700', lineHeight: 1.1 } }, String(s.score)),
      h('div.muted', 'من 100'),
    ]),

    h('div.card.tight', [
      h('div.row.between', [h('span', '⏱ وقت التطبيق'), h('b.mono', s.usageText)]),
      h('div.row.between', { style: { marginTop: '6px' } }, [h('span.muted', 'مرات الفتح'), h('span.muted.mono', String(s.opens))]),
      s.overLimit ? h('div.badge.danger', { style: { marginTop: '8px', display: 'inline-block' } }, `تجاوزت حدّك (${s.limitText})`) : null,
    ]),

    s.sections.length ? h('div.card.tight', [
      h('div.card-t', 'أين ذهب وقتك'),
      ...s.sections.map((x) => h('div', { style: { marginTop: '8px' } }, [
        h('div.row.between', [h('span.muted', x.name), h('span.muted.mono', durMin(x.ms / 60000))]),
        h('div.bar', h('i', { style: { width: `${Math.round((x.ms / Math.max(1, s.usageMs)) * 100)}%` } })),
      ])),
    ]) : null,

    h('div.grid2', [
      statCard('المهام', `${s.tasksDone}/${s.tasksTotal}`),
      statCard('الالتزامات', `${s.commitsDone}/${s.commitsTotal}`),
    ]),
    h('div.grid2', [
      statCard('عناصر الإنتاجية', String(s.growthDone)),
      statCard('التقييم', `${s.score}%`),
    ]),

    h('div.card', { style: { marginTop: '4px' } }, [
      h('div.card-t', 'الخلاصة'),
      h('div.card-s', v.text),
    ]),
  ]));
}

function statCard(label, value) {
  return h('div.card.tight.center', [
    h('div', { style: { fontSize: '19px', fontWeight: '700' } }, value),
    h('div.muted', label),
  ]);
}

/** قائمة الملخّصات السابقة. */
export function summaryHistory(limit = 14) {
  return Object.values(state.time.summaries)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, limit);
}

/** ملخّص اليوم الجاري (حيّ، دون انتظار منتصف الليل). */
export function liveSummary() {
  return buildSummary(dayKey());
}

/** يرسم بطاقة الملخّص داخل التبويب. */
export function summaryCard(summary, onOpen) {
  const v = verdict(summary);
  return h('div.card', { onclick: onOpen }, [
    h('div.row.between', [
      h('div', [
        h('div.card-t', longDate(fromDayKey(summary.day))),
        h('div.card-s', `${summary.usageText} · مهام ${summary.tasksDone}/${summary.tasksTotal}`),
      ]),
      h('span.badge.' + (v.tone === 'danger' ? 'danger' : v.tone === 'warn' ? 'warn' : 'ok'), String(summary.score)),
    ]),
  ]);
}
