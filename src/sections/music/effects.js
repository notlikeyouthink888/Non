/** إعدادات المؤثرات الصوتية: معادل خماسي، باس، محيطي، صدى، جهارة، توازن. */

import { h, fill, chipGroup, toggle as toggleSwitch, settingRow } from '../../core/dom.js';
import { sheet, toast } from '../../core/ui.js';
import { state } from '../../core/store.js';
import { updateEffects, EQ_PRESETS, REVERBS } from './player.js';

const FREQS = ['60Hz', '250Hz', '1kHz', '4kHz', '12kHz'];

export function openEffects() {
  const body = h('div');
  sheet('المؤثرات الصوتية', body);
  render();

  function render() {
    const fx = state.music.effects;

    fill(body, [
      settingRow('تفعيل المؤثرات', 'يطبّقها على كل ما يُشغَّل', toggleSwitch(fx.enabled, (on) => {
        updateEffects({ enabled: on });
        render();
      })),

      h('h2.sec', 'نمط جاهز'),
      chipGroup(
        Object.entries(EQ_PRESETS).map(([value, p]) => ({ value, label: p.label })),
        fx.preset,
        (value) => { updateEffects({ preset: value, bands: [...EQ_PRESETS[value].bands], enabled: true }); render(); },
      ),

      h('h2.sec', 'المعادل (dB)'),
      h('div.eq-bands', FREQS.map((f, i) => {
        const val = h('div.v', fmtDb(fx.bands[i]));
        return h('div.eq-band', [
          val,
          h('div.slot', h('input', {
            type: 'range', min: -15, max: 15, step: 1, value: fx.bands[i],
            oninput: (e) => {
              const bands = [...state.music.effects.bands];
              bands[i] = Number(e.target.value);
              val.textContent = fmtDb(bands[i]);
              updateEffects({ bands, preset: 'custom', enabled: true });
            },
          })),
          h('div.f', f),
        ]);
      })),

      h('h2.sec', 'تعزيزات'),
      slider('تعزيز الباس', fx.bass, 0, 1000, (v) => updateEffects({ bass: v, enabled: true }), (v) => `${Math.round(v / 10)}%`),
      slider('الصوت المحيطي', fx.virtualizer, 0, 1000, (v) => updateEffects({ virtualizer: v, enabled: true }), (v) => `${Math.round(v / 10)}%`),
      slider('رفع الجهارة', fx.loudness, 0, 2000, (v) => updateEffects({ loudness: v, enabled: true }), (v) => `+${(v / 100).toFixed(1)} dB`),
      slider('التوازن يمين/يسار', fx.balance, -1, 1, (v) => updateEffects({ balance: v }), balanceText, 0.05),

      h('h2.sec', 'الصدى (Reverb)'),
      chipGroup(REVERBS, fx.reverb, (v) => { updateEffects({ reverb: v, enabled: true }); }),

      h('h2.sec', 'خيارات'),
      settingRow('دمج القنوات (مونو)', 'مفيد لسمّاعة واحدة', toggleSwitch(fx.monoMix, (on) => updateEffects({ monoMix: on }))),

      h('button.btn.ghost.block', {
        style: { marginTop: '14px' },
        onclick: () => {
          updateEffects({
            enabled: false, preset: 'flat', bands: [0, 0, 0, 0, 0], bass: 0,
            virtualizer: 0, reverb: 'none', loudness: 0, monoMix: false, balance: 0,
          });
          toast('أُعيدت المؤثرات إلى الوضع الطبيعي', 'ok');
          render();
        },
      }, '↺ إعادة الضبط'),
    ]);
  }
}

function slider(label, value, min, max, onChange, fmt, step = 1) {
  const out = h('span.muted.mono', fmt(value));
  return h('div.field', [
    h('div.row.between', [h('label', { style: { margin: 0 } }, label), out]),
    h('input', {
      type: 'range', min, max, step, value,
      oninput: (e) => { const v = Number(e.target.value); out.textContent = fmt(v); onChange(v); },
    }),
  ]);
}

const fmtDb = (v) => `${v > 0 ? '+' : ''}${v}`;
// القيمة السالبة = يسار، الموجبة = يمين (كما في StereoPanner والمحرّك الأصلي)
const balanceText = (v) => (Math.abs(v) < 0.03 ? 'وسط' : v < 0 ? `يسار ${Math.round(-v * 100)}%` : `يمين ${Math.round(v * 100)}%`);
