/**
 * يولّد ملف PDF للاختبار: صفحات بأحجام مختلفة (عمودية وأفقية وصغيرة)
 * حتى نتأكّد أنّ العارض يرتّبها بلا قفز. الاستعمال:
 *   node tools/dev/make-test-pdf.mjs out.pdf 12
 */

import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'test.pdf';
const count = Number(process.argv[3]) || 12;

const SIZES = [
  [595, 842],   // A4 عمودي
  [842, 595],   // A4 أفقي
  [420, 595],   // A5
  [612, 792],   // Letter
];

const objs = [];
const add = (body) => { objs.push(body); return objs.length; };

const pageIds = [];
const kidsPlaceholder = add('');   // 1: Pages (يُملأ لاحقًا)
const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

for (let i = 1; i <= count; i++) {
  const [w, hgt] = SIZES[i % SIZES.length];
  const text = `Page ${i} of ${count}  -  ${w}x${hgt}`;
  const stream = `BT /F1 28 Tf 48 ${hgt - 90} Td (${text}) Tj ET\n`
    + `1 0 0 RG 3 w 40 40 m ${w - 40} ${hgt - 40} l S\n`
    + `0 0 1 RG 40 ${hgt - 40} m ${w - 40} 40 l S\n`;
  const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  const pageId = add(`<< /Type /Page /Parent ${kidsPlaceholder} 0 R /MediaBox [0 0 ${w} ${hgt}] `
    + `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  pageIds.push(pageId);
}

objs[kidsPlaceholder - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
const catalogId = add(`<< /Type /Catalog /Pages ${kidsPlaceholder} 0 R >>`);

let pdf = '%PDF-1.4\n';
const offsets = [0];
objs.forEach((body, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
for (let i = 1; i <= objs.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

writeFileSync(out, pdf, 'latin1');
console.log(`كُتب ${out} — ${count} صفحة`);
