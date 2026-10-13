/** نقطة الدخول — أساس: تقارير الهندسة المدنية. */

import './styles/fonts.css';
import './styles/app.css';
import { mountApp } from './app.js';
import { state, save, subscribe } from './core/store.js';
import { applyTheme } from './core/ui.js';
import { loadMath } from './core/math.js';

function boot() {
  applyTheme(state.ui);
  subscribe('ui', () => applyTheme(state.ui));
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => applyTheme(state.ui));

  mountApp(document.getElementById('app'));

  const bootEl = document.getElementById('boot');
  bootEl?.classList.add('gone');
  setTimeout(() => bootEl?.remove(), 500);

  // محرّك المعادلات يُجهَّز في وقت الفراغ حتى تظهر المعادلات مرسومة من أول عرض
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
  idle(() => loadMath().catch(() => {}));
}

window.addEventListener('error', (e) => console.error('[asas]', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[asas] وعد مرفوض', e.reason));
window.addEventListener('beforeunload', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

boot();
