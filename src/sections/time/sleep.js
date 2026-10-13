/**
 * حاسبة النوم — مبنية على دورات النوم (٩٠ دقيقة تقريبًا للدورة الواحدة)
 * وعلى أن متوسط زمن الاستغراق في النوم ≈ ١٤ دقيقة.
 * تقترح أفضل أوقات النوم والاستيقاظ وتذكّر بموعد الاسترخاء قبل النوم.
 */

import { state } from '../../core/store.js';
import { clock, pad, durMin } from '../../core/fmt.js';

/** أوقات النوم المثالية لهدف استيقاظ محدّد. */
export function bedtimesFor(wakeHour, wakeMinute, opts = {}) {
  const s = { ...state.time.sleep, ...opts };
  const wake = new Date();
  wake.setHours(wakeHour, wakeMinute, 0, 0);
  if (wake.getTime() <= Date.now()) wake.setDate(wake.getDate() + 1);

  const out = [];
  for (let cycles = 6; cycles >= 3; cycles--) {
    const t = new Date(wake.getTime() - (cycles * s.cycleMin + s.fallAsleepMin) * 60000);
    out.push({
      cycles,
      at: t.getTime(),
      hour: t.getHours(),
      minute: t.getMinutes(),
      sleepMin: cycles * s.cycleMin,
      quality: cycles >= 5 ? 'ممتاز' : cycles === 4 ? 'مقبول' : 'قليل',
      best: cycles === s.targetCycles,
    });
  }
  return out;
}

/** أوقات الاستيقاظ المثالية إذا نمتُ الآن. */
export function wakeTimesIfSleepingNow(from = Date.now()) {
  const s = state.time.sleep;
  const out = [];
  for (let cycles = 3; cycles <= 6; cycles++) {
    const t = new Date(from + (s.fallAsleepMin + cycles * s.cycleMin) * 60000);
    out.push({
      cycles,
      at: t.getTime(),
      hour: t.getHours(),
      minute: t.getMinutes(),
      sleepMin: cycles * s.cycleMin,
      best: cycles === s.targetCycles,
    });
  }
  return out;
}

/** الموعد الموصى به للنوم الليلة بناءً على هدف الاستيقاظ المحفوظ. */
export function recommendedBedtime() {
  const s = state.time.sleep;
  const list = bedtimesFor(s.wakeHour, s.wakeMinute);
  return list.find((x) => x.cycles === s.targetCycles) || list[1];
}

/** موعد بدء الاسترخاء (قبل النوم بـ windDownMin). */
export function windDownAt() {
  const bed = recommendedBedtime();
  if (!bed) return null;
  return bed.at - state.time.sleep.windDownMin * 60000;
}

/** نص إرشادي حسب الساعة الحالية. */
export function sleepAdvice(now = new Date()) {
  const bed = recommendedBedtime();
  if (!bed) return null;
  const minutesToBed = Math.round((bed.at - now.getTime()) / 60000);
  const s = state.time.sleep;

  if (minutesToBed <= 0 && minutesToBed > -240) {
    return { tone: 'danger', text: `تجاوزت وقت نومك المثالي بـ ${durMin(-minutesToBed)}. نم الآن لتضمن ${s.targetCycles} دورات.` };
  }
  if (minutesToBed <= s.windDownMin) {
    return { tone: 'warn', text: `ابدأ الاسترخاء الآن — وقت النوم بعد ${durMin(minutesToBed)}. أطفئ الشاشات وخفّف الإضاءة.` };
  }
  if (minutesToBed <= 180) {
    return { tone: 'ok', text: `وقت نومك المثالي ${clock(bed.hour, bed.minute, state.settings.hour12)} (بعد ${durMin(minutesToBed)}). تجنّب الكافيين من الآن.` };
  }
  return { tone: 'ok', text: `وقت نومك المثالي الليلة ${clock(bed.hour, bed.minute, state.settings.hour12)} لتستيقظ ${clock(s.wakeHour, s.wakeMinute, state.settings.hour12)} نشيطًا.` };
}

/** نصائح ثابتة مستندة إلى توصيات صحة النوم الشائعة. */
export const SLEEP_TIPS = [
  { t: 'ثبّت موعد الاستيقاظ', s: 'الاستيقاظ في نفس الوقت يوميًا — حتى في العطلة — هو أقوى مثبّت لساعتك الداخلية.' },
  { t: 'أوقف الكافيين مبكرًا', s: 'الكافيين يبقى فعّالًا ٦–٨ ساعات؛ آخر فنجان قبل النوم بثماني ساعات.' },
  { t: 'ضوء الصباح', s: '١٠–٣٠ دقيقة ضوء طبيعي بعد الاستيقاظ تقدّم إفراز الميلاتونين ليلًا.' },
  { t: 'برودة الغرفة', s: 'أفضل نوم بين ١٨ و٢٠ درجة مئوية؛ الجسم يحتاج انخفاض حرارته لبدء النوم.' },
  { t: 'اترك الشاشات', s: 'الضوء الأزرق قبل النوم بساعة يؤخّر النعاس؛ استبدله بقراءة ورقية أو تمدّد خفيف.' },
  { t: 'قاعدة ٢٠ دقيقة', s: 'إن لم تنم خلال ٢٠ دقيقة، انهض واعمل شيئًا هادئًا ثم عد — لا تربط السرير بالأرق.' },
  { t: 'القيلولة القصيرة', s: '١٠–٢٠ دقيقة قبل الثالثة عصرًا تنعش دون أن تسرق نوم الليل.' },
  { t: 'آخر وجبة', s: 'أنهِ العشاء قبل النوم بـ ٣ ساعات؛ الهضم الثقيل يقطع النوم العميق.' },
];

export function sleepDebtHint(hoursSlept, target = 7.5) {
  const debt = target - hoursSlept;
  if (debt <= 0) return 'نومك كافٍ اليوم.';
  return `ينقصك ${durMin(debt * 60)} من النوم — عوّضها الليلة أو بقيلولة قصيرة.`;
}

export const formatSleepTime = (h, m) => `${pad(h)}:${pad(m)}`;
