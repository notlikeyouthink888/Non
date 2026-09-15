/** نقطة الدخول — Your World */

import './styles/base.css';
import { mountApp } from './app.js';
import { state, save, flush, initStore, onStoreError } from './core/store.js';
import { applyAccent, toast } from './core/ui.js';
import { startUsage, onSummaryReady } from './core/usage.js';
import { initPlayer } from './sections/music/player.js';
import { initAlarms } from './sections/time/alarms.js';
import { showSummarySheet } from './sections/time/summary.js';

async function boot() {
  // نقرأ التخزين الدائم قبل رسم الواجهة حتى لا تُبنى الشاشات على بيانات ناقصة.
  await initStore();
  onStoreError((msg) => toast(msg, 'err'));

  applyAccent(state.settings.accent || '#7c5cff');

  const root = document.getElementById('app');
  mountApp(root);

  startUsage();
  onSummaryReady((summary) => showSummarySheet(summary));

  // إعادة جدولة المنبهات وربط المشغّل — الاثنان يعملان دون إنترنت.
  await Promise.allSettled([initPlayer(), initAlarms()]);

  // ملخّص اليوم السابق إن لم يُعرض بعد
  const pending = state.time.lastSummaryDay;
  if (pending && state.time.summaries[pending] && !state.time.summaries[pending].seen) {
    setTimeout(() => showSummarySheet(state.time.summaries[pending]), 900);
  }

  document.getElementById('boot')?.classList.add('gone');
  setTimeout(() => document.getElementById('boot')?.remove(), 600);
}

window.addEventListener('error', (e) => console.error('[YW]', e.error || e.message));

// على أندرويد قد لا يصل beforeunload؛ الاعتماد على إخفاء الصفحة هو الأضمن.
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
window.addEventListener('pagehide', () => save(true));
window.addEventListener('beforeunload', () => { save(true); flush(); });

boot();
