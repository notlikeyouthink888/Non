/** نقطة الدخول — Your World */

import './styles/base.css';
import { mountApp } from './app.js';
import { state, save } from './core/store.js';
import { applyAccent } from './core/ui.js';
import { startUsage, onSummaryReady } from './core/usage.js';
import { initPlayer } from './sections/music/player.js';
import { initAlarms } from './sections/time/alarms.js';
import { showSummarySheet } from './sections/time/summary.js';

async function boot() {
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
window.addEventListener('beforeunload', () => save(true));

boot();
