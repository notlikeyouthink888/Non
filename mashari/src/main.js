/** نقطة الدخول — دراسة مشاريع */

import './styles/base.css';
import './styles/app.css';
import './styles/mindmap.css';
import { mountApp } from './app.js';
import { save, setSaveErrorHandler } from './core/store.js';
import { applyTheme, closeTopLayer, toast } from './core/ui.js';
import { System } from './core/native.js';

applyTheme();
mountApp(document.getElementById('app'));

// زر الرجوع: يسكّر آخر شي مفتوح، وإذا ماكو شي يصغّر التطبيق
System.onBack(() => { if (!closeTopLayer()) System.minimize(); });

// حفظ فوري لما يطلع التطبيق للخلفية
System.onPause(() => save(true));
window.addEventListener('beforeunload', () => save(true));

setSaveErrorHandler(() => toast('ما گدرت أحفظ — المساحة ممتلئة. احفظ نسخة من الإعدادات.', 'err'));
window.addEventListener('error', (e) => console.error('[mashari]', e.error || e.message));

const boot = document.getElementById('boot');
boot?.classList.add('gone');
setTimeout(() => boot?.remove(), 500);
