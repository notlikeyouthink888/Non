/**
 * كاتب PDF صغير بلا مكتبات: كل صفحة صورة JPEG مضمّنة مباشرة (DCTDecode)
 * فلا يُعاد ضغطها، مع رقم صفحة اختياري بخط Helvetica القياسي.
 */

const enc = new TextEncoder();

/** أحجام الصفحات بالنقاط (1/72 بوصة)، عموديًا. */
export const PAGE_SIZES = {
  a4: { label: 'A4', w: 595.28, h: 841.89 },
  letter: { label: 'Letter', w: 612, h: 792 },
  a5: { label: 'A5', w: 419.53, h: 595.28 },
  legal: { label: 'Legal', w: 612, h: 1008 },
  fit: { label: 'مطابق للصورة', w: 0, h: 0 },
};

export const MARGINS = { none: 0, small: 18, large: 40 };

// عروض أرقام Helvetica و«/» والمسافة (من 1000)
const HELV = { digit: 556, '/': 278, ' ': 278 };
const textWidth = (s, size) =>
  [...s].reduce((sum, c) => sum + (/\d/.test(c) ? HELV.digit : HELV[c] ?? 556), 0) * size / 1000;

const num = (n) => (Math.round(n * 100) / 100).toString();

/** نصّ PDF بترميز UTF-16BE (يدعم العربية في الخصائص). */
function pdfText(s) {
  let hex = 'FEFF';
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0');
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else {
      hex += cp.toString(16).padStart(4, '0');
    }
  }
  return `<${hex.toUpperCase()}>`;
}

function pdfDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `(D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z)`;
}

/** يحسب أبعاد الصفحة ومكان الصورة داخلها. */
export function layoutPage(imgW, imgH, { size = 'a4', orientation = 'auto', margin = 'small' } = {}) {
  const m = MARGINS[margin] ?? 0;
  let pw, ph;
  if (size === 'fit') {
    // الضلع الأطول يساوي الضلع الأطول لورقة A4
    const k = 841.89 / Math.max(imgW, imgH);
    pw = imgW * k + m * 2;
    ph = imgH * k + m * 2;
  } else {
    const s = PAGE_SIZES[size] ?? PAGE_SIZES.a4;
    const landscape = orientation === 'landscape' || (orientation === 'auto' && imgW > imgH);
    pw = landscape ? s.h : s.w;
    ph = landscape ? s.w : s.h;
  }
  const bw = pw - m * 2, bh = ph - m * 2;
  const k = Math.min(bw / imgW, bh / imgH);
  const dw = imgW * k, dh = imgH * k;
  return { pw, ph, x: (pw - dw) / 2, y: (ph - dh) / 2, dw, dh };
}

/**
 * @param {{jpeg: Uint8Array, w: number, h: number}[]} images
 * @param {{title?: string, size?: string, orientation?: string, margin?: string, pageNumbers?: boolean}} opts
 * @returns {Blob}
 */
export function buildPdf(images, opts = {}) {
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (data) => {
    const b = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(b);
    pos += b.length;
  };
  const obj = (id, body) => {
    offsets[id] = pos;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };

  // \xE2\xE3\xCF\xD3 بعد الترويسة تعلن أن الملف ثنائي
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const n = images.length;
  const pageIds = images.map((_, i) => 5 + i * 3);

  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${n} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, `<< /Title ${pdfText(opts.title || 'pdfs')} /Producer ${pdfText('pdfs')} /Creator ${pdfText('pdfs')} /CreationDate ${pdfDate()} >>`);

  images.forEach((img, i) => {
    const pid = pageIds[i], cid = pid + 1, iid = pid + 2;
    const L = layoutPage(img.w, img.h, opts);

    let content = `q\n${num(L.dw)} 0 0 ${num(L.dh)} ${num(L.x)} ${num(L.y)} cm\n/Im0 Do\nQ\n`;
    if (opts.pageNumbers) {
      const label = `${i + 1} / ${n}`;
      const fs = 9;
      const tx = (L.pw - textWidth(label, fs)) / 2;
      const ty = Math.max(8, Math.min(18, L.y / 2 - fs / 3));
      content += `BT\n0.45 g\n/F1 ${fs} Tf\n${num(tx)} ${num(ty)} Td\n(${label}) Tj\nET\n`;
    }

    obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(L.pw)} ${num(L.ph)}] ` +
      `/Resources << /XObject << /Im0 ${iid} 0 R >> /Font << /F1 3 0 R >> /ProcSet [/PDF /Text /ImageC] >> ` +
      `/Contents ${cid} 0 R >>`);

    const cb = enc.encode(content);
    offsets[cid] = pos;
    push(`${cid} 0 obj\n<< /Length ${cb.length} >>\nstream\n`);
    push(cb);
    push('\nendstream\nendobj\n');

    offsets[iid] = pos;
    push(`${iid} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`);
    push(img.jpeg);
    push('\nendstream\nendobj\n');
  });

  const total = 5 + n * 3;
  const xref = pos;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) {
    x += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}
