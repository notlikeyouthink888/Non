/** اختيار الصور من المعرض أو التقاطها بالكاميرا، ثم إضافتها إلى المسودة. */
import { addFiles } from '../core/project.js';
import { busy, toast } from '../core/ui.js';
import { n } from '../core/fmt.js';

function chooseFiles({ camera = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (camera) input.capture = 'environment';
    else input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve([...(input.files || [])]);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

/** @returns {Promise<number>} عدد الصور المضافة */
export async function importFiles(files) {
  if (!files.length) return 0;
  const b = busy('تجهيز الصور…');
  try {
    const { ok, failed } = await addFiles(files, (p, i, total) => b.set(p, `تجهيز الصورة ${n(i)} من ${n(total)}`));
    if (failed) toast(`تعذّرت قراءة ${n(failed)} من الصور`, 'warn');
    return ok;
  } finally {
    b.done();
  }
}

export async function pickAndImport(opts) {
  return importFiles(await chooseFiles(opts));
}
