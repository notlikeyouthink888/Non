/**
 * قاعدة المعرفة الموحّدة لمواد المرحلة الثانية: محتوى مُحقَّق لتجارب المختبر والأعمال الحقلية
 * والمواضيع النظرية. تُستعمل لتوليد تقرير كامل دون اتصال، وتُمرَّر للذكاء الاصطناعي مرجعًا
 * يمنعه من مخالفة القيم والمواصفات القياسية.
 */

import concrete from './concrete.js';
import aggregates from './aggregates.js';
import concreteExtra, { SUPPLEMENT } from './concrete_extra.js';
import strength from './strength.js';
import strengthTheory from './strength_theory.js';
import fluids from './fluids.js';
import survey from './survey.js';
import math from './math.js';

export const KB = { ...concrete, ...aggregates, ...concreteExtra, ...strength, ...strengthTheory, ...fluids, ...survey, ...math };

// إضافات المرحلة الثانية (النظرية وأسئلة المناقشة والقراءات) لمداخل الخرسانة الأقدم
for (const [id, extra] of Object.entries(SUPPLEMENT)) {
  if (KB[id]) KB[id] = { ...KB[id], ...extra };
}

export function getKB(id) {
  return id ? KB[id] || null : null;
}

/** الكتب المنهجية المتداولة في أقسام الهندسة المدنية لكل مادة — دون أرقام طبعات قد تخطئ. */
export const CAT_REFS = {
  strength: [
    'R. C. Hibbeler — Mechanics of Materials — Pearson.',
    'F. P. Beer, E. R. Johnston, J. T. DeWolf & D. F. Mazurek — Mechanics of Materials — McGraw-Hill.',
    'E. P. Popov — Engineering Mechanics of Solids — Prentice Hall.',
  ],
  concrete: [
    'A. M. Neville — Properties of Concrete — Pearson.',
    'M. S. Shetty — Concrete Technology: Theory and Practice — S. Chand.',
    'P. K. Mehta & P. J. M. Monteiro — Concrete: Microstructure, Properties, and Materials — McGraw-Hill.',
    'المواصفة القياسية العراقية رقم (5) — الإسمنت البورتلاندي، ورقم (45) — ركام المصادر الطبيعية المستعمل في الخرسانة والبناء.',
  ],
  survey: [
    'C. D. Ghilani & P. R. Wolf — Elementary Surveying: An Introduction to Geomatics — Pearson.',
    'B. C. Punmia — Surveying, Vol. 1 — Laxmi Publications.',
    'J. Uren & W. F. Price — Surveying for Engineers — Palgrave Macmillan.',
  ],
  fluids: [
    'B. R. Munson, D. F. Young & T. H. Okiishi — Fundamentals of Fluid Mechanics — Wiley.',
    'V. L. Streeter & E. B. Wylie — Fluid Mechanics — McGraw-Hill.',
    'R. K. Bansal — A Textbook of Fluid Mechanics and Hydraulic Machines — Laxmi Publications.',
  ],
  math: [
    'E. Kreyszig — Advanced Engineering Mathematics — Wiley.',
    'G. B. Thomas et al. — Thomas\' Calculus — Pearson.',
    'D. G. Zill — Differential Equations with Boundary-Value Problems — Cengage Learning.',
  ],
};

/** نصوص عامة تصلح لكل المواضيع في أقسام بعينها. */
export const GENERIC = {
  trainingIntro: [
    'يُعدّ التدريب الصيفي حلقة الوصل بين الدراسة النظرية في الجامعة والواقع العملي في مواقع العمل، إذ يتيح للطالب مشاهدة تنفيذ الأعمال الهندسية خطوة بخطوة، والتعرف على المعدات والمواد وأساليب الإشراف وضبط الجودة، والتعامل مع المهندسين والفنيين والعمال.',
    'ويهدف هذا التقرير إلى توثيق ما شاهده المتدرب وشارك فيه خلال مدة التدريب، وبيان الخبرات المكتسبة والملاحظات الفنية والتوصيات.',
  ],
  safety: [
    'ارتداء معدات الوقاية الشخصية (الخوذة، حذاء الأمان، السترة العاكسة، القفازات، النظارات).',
    'الالتزام بتعليمات المشرف ومسؤول السلامة في الموقع.',
    'الابتعاد عن مسارات المعدات الثقيلة وحواف الحفريات.',
    'عدم لمس الأجهزة والمعدات الكهربائية دون إذن.',
  ],
  labSafety: [
    'ارتداء الصدرية والنظارات والقفازات عند التعامل مع الإسمنت والمواد الكيميائية.',
    'الوقوف خلف الحاجز الواقي عند فحص النماذج حتى الفشل.',
    'عدم تشغيل الأجهزة إلا بحضور المشرف.',
    'تنظيف الأجهزة وإعادتها إلى أماكنها بعد الانتهاء.',
  ],
};
