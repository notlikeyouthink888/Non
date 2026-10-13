/**
 * قاعدة المعرفة الموحّدة: محتوى مُحقَّق لأشهر الفحوصات والأعمال.
 * تُستعمل لتوليد تقرير كامل دون اتصال، وتُمرَّر للذكاء الاصطناعي مرجعًا
 * يمنعه من مخالفة القيم والمواصفات القياسية.
 */

import concrete from './concrete.js';
import aggregates from './aggregates.js';
import soil from './soil.js';
import roads from './roads.js';
import survey from './survey.js';
import construction from './construction.js';

export const KB = { ...concrete, ...aggregates, ...soil, ...roads, ...survey, ...construction };

export function getKB(id) {
  return id ? KB[id] || null : null;
}

/** مراجع عامة معروفة لكل قسم — كتب حقيقية متداولة دون أرقام طبعات قد تخطئ. */
export const CAT_REFS = {
  concrete: ['A. M. Neville — Properties of Concrete, Pearson.', 'P. K. Mehta & P. J. M. Monteiro — Concrete: Microstructure, Properties, and Materials, McGraw-Hill.', 'ACI 318 — Building Code Requirements for Structural Concrete, American Concrete Institute.'],
  materials: ['M. S. Mamlouk & J. P. Zaniewski — Materials for Civil and Construction Engineers, Pearson.', 'A. M. Neville — Properties of Concrete, Pearson.', 'المواصفات القياسية العراقية الصادرة عن الجهاز المركزي للتقييس والسيطرة النوعية.'],
  soil: ['B. M. Das — Principles of Geotechnical Engineering, Cengage Learning.', 'K. H. Head — Manual of Soil Laboratory Testing, Whittles Publishing.'],
  foundations: ['B. M. Das — Principles of Foundation Engineering, Cengage Learning.', 'J. E. Bowles — Foundation Analysis and Design, McGraw-Hill.'],
  steel: ['J. C. McCormac & S. F. Csernak — Structural Steel Design, Pearson.', 'AISC 360 — Specification for Structural Steel Buildings.'],
  roads: ['N. J. Garber & L. A. Hoel — Traffic and Highway Engineering, Cengage Learning.', 'Y. H. Huang — Pavement Analysis and Design, Pearson.', 'Asphalt Institute — MS-2 Asphalt Mix Design Methods.'],
  survey: ['C. D. Ghilani & P. R. Wolf — Elementary Surveying: An Introduction to Geomatics, Pearson.'],
  construction: ['R. Chudley & R. Greeno — Building Construction Handbook, Routledge.', 'R. L. Peurifoy et al. — Construction Planning, Equipment, and Methods, McGraw-Hill.'],
  finishing: ['R. Chudley & R. Greeno — Building Construction Handbook, Routledge.'],
  water: ['V. T. Chow — Open-Channel Hydraulics, McGraw-Hill.', 'B. R. Munson et al. — Fundamentals of Fluid Mechanics, Wiley.', 'L. W. Mays — Water Resources Engineering, Wiley.'],
  sanitary: ['M. L. Davis & D. A. Cornwell — Introduction to Environmental Engineering, McGraw-Hill.', 'Metcalf & Eddy — Wastewater Engineering: Treatment and Resource Recovery, McGraw-Hill.', 'WHO — Guidelines for Drinking-water Quality.'],
  bridges: ['R. M. Barker & J. A. Puckett — Design of Highway Bridges, Wiley.', 'AASHTO — LRFD Bridge Design Specifications.'],
  structures: ['J. C. McCormac & R. H. Brown — Design of Reinforced Concrete, Wiley.', 'R. C. Hibbeler — Structural Analysis, Pearson.', 'ACI 318 — Building Code Requirements for Structural Concrete.'],
  repair: ['J. H. Bungey, S. G. Millard & M. G. Grantham — Testing of Concrete in Structures, CRC Press.', 'ACI 562 — Code Requirements for Assessment, Repair, and Rehabilitation of Existing Concrete Structures.'],
  management: ['D. W. Halpin & B. A. Senior — Construction Management, Wiley.', 'PMI — A Guide to the Project Management Body of Knowledge (PMBOK Guide).', 'FIDIC — Conditions of Contract for Construction.'],
  safety: ['OSHA — Safety and Health Regulations for Construction (29 CFR 1926).', 'تعليمات السلامة المهنية النافذة في العراق.'],
};

/** نصوص عامة تصلح لكل المواضيع في أقسام بعينها. */
export const GENERIC = {
  trainingIntro: [
    'يُعدّ التدريب الصيفي حلقة الوصل بين الدراسة النظرية في الجامعة والواقع العملي في مواقع العمل، إذ يتيح للطالب مشاهدة تنفيذ الأعمال الهندسية خطوة بخطوة، والتعرف على المعدات والمواد وأساليب الإشراف وضبط الجودة، والتعامل مع المهندسين والفنيين والعمال.',
    'ويهدف هذا التقرير إلى توثيق ما شاهده المتدرب وشارك فيه خلال مدة التدريب، وبيان الخبرات المكتسبة والملاحظات الفنية والتوصيات.',
  ],
  roles: [
    'مدير المشروع: مسؤول عن توفير الموارد والمصادقة على طريقة العمل ومتابعة التنفيذ العام.',
    'مهندس الموقع: ينظّم العمل اليومي ويتأكد من التنفيذ حسب المخططات والمواصفات وهذه الوثيقة.',
    'مهندس الجودة: يُعدّ خطة الفحص ويطلب الاستلامات ويوثّق النتائج وحالات عدم المطابقة.',
    'مسؤول السلامة: يقيّم المخاطر ويتأكد من التزام العاملين بإجراءات السلامة ومعدات الوقاية.',
    'الملاحظ (المشرف الفني): يوجّه العمال ويتابع جودة التنفيذ في كل مرحلة.',
  ],
  env: [
    'جمع المخلفات وفرزها ونقلها إلى الأماكن المخصصة.',
    'رش الماء لتقليل الغبار وتغطية المواد الناعمة أثناء النقل.',
    'منع تسرب الزيوت والوقود من المعدات إلى التربة.',
    'تقليل الضوضاء والعمل ضمن الساعات المسموح بها قرب المناطق السكنية.',
    'غسل الخلاطات والمضخات في مواقع مخصصة.',
  ],
  safety: [
    'ارتداء معدات الوقاية الشخصية (الخوذة، حذاء الأمان، السترة العاكسة، القفازات، النظارات).',
    'تقييم مخاطر النشاط قبل البدء وإطلاع العاملين عليها.',
    'تأمين الحفريات والحواف والفتحات بالحواجز.',
    'فحص المعدات والأدوات الكهربائية قبل الاستعمال.',
    'توفير الإسعافات الأولية ومطفآت الحريق.',
  ],
  hazards: ['السقوط من المرتفعات', 'سقوط المواد من الأعلى', 'الاصطدام بالمعدات', 'الصعق الكهربائي', 'الإجهاد الحراري', 'الغبار والضوضاء'],
  ppe: ['خوذة واقية', 'حذاء أمان', 'سترة عاكسة', 'قفازات', 'نظارات واقية', 'حزام أمان للعمل على المرتفعات'],
  emergency: ['تحديد نقطة تجمع ومسارات الإخلاء', 'تعليق أرقام الطوارئ في الموقع', 'وجود مسعف مدرّب وحقيبة إسعافات', 'الإبلاغ الفوري عن الحوادث وتوثيقها'],
};
