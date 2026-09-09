/** بديل الويب لمكتبة الأغاني: يختار المستخدم ملفات/مجلدًا من المتصفّح. */

let counter = 0;

export function pickAudioFiles(previous) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    try { input.webkitdirectory = false; } catch { /* تجاهل */ }

    input.onchange = async () => {
      const files = [...(input.files || [])].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(f.name));
      const tracks = await Promise.all(files.map(readMeta));
      const merged = [...(previous?.tracks || []), ...tracks];
      resolve({ tracks: merged });
    };
    input.click();
  });
}

function readMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.src = url;
    const done = () => resolve({
      id: 'web-' + (++counter),
      title: file.name.replace(/\.[^.]+$/, ''),
      artist: 'غير معروف',
      album: 'ملفات محلية',
      durationMs: Number.isFinite(probe.duration) ? Math.round(probe.duration * 1000) : 0,
      uri: url,
      artUri: null,
      size: file.size,
      path: file.name,
      addedAt: file.lastModified || Date.now(),
    });
    probe.onloadedmetadata = done;
    probe.onerror = done;
    setTimeout(done, 2500);
  });
}
