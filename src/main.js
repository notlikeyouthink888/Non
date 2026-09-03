import { App } from './core/app.js';
import terrain from './systems/terrain/index.js';
import environment from './systems/environment/index.js';
import roads from './systems/roads/index.js';
import zoning from './systems/zoning/index.js';
import buildings from './systems/buildings/index.js';
import props from './systems/props/index.js';
import traffic from './systems/traffic/index.js';
import effects from './systems/effects/index.js';
import simulation from './systems/simulation/index.js';
import tools from './systems/tools/index.js';
import ui from './systems/ui/index.js';
import audio from './systems/audio/index.js';
import democity from './systems/democity/index.js';

const params = new URLSearchParams(location.search);
const only = params.get('showcase');

// وضع الاستعراض يشغّل الوحدة المطلوبة + تبعياتها + البيئة والمؤثرات والواجهة
const ALL = [terrain, environment, roads, zoning, buildings, props, traffic, effects, simulation, tools, ui, audio, democity];

function pickModules() {
  if (!only) return ALL;
  const byName = new Map(ALL.map((m) => [m.name, m]));
  const keep = new Set(['environment', 'effects', 'ui', only]);
  const addDeps = (n) => { for (const d of (byName.get(n)?.deps || [])) { if (!keep.has(d)) { keep.add(d); addDeps(d); } } };
  for (const n of [...keep]) addDeps(n);
  return ALL.filter((m) => keep.has(m.name));
}

const canvas = document.getElementById('view');
const app = new App({ canvas, modules: pickModules(), params });
app.expose();

const bootMsg = document.querySelector('#boot .boot-msg');
app.bus.on('boot:progress', ({ text }) => { if (bootMsg) bootMsg.textContent = text + '…'; });

app.init().then(() => {
  document.getElementById('boot')?.classList.add('gone');
}).catch((e) => {
  console.error('[fatal]', e);
  const b = document.getElementById('boot');
  if (b) b.querySelector('.boot-msg').textContent = 'تعذّر بدء التطبيق: ' + e.message;
});
