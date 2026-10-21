/** ناقل أحداث صغير بين الواجهات (حتى ما تصير استيرادات دائرية). */

const subs = new Map();

export function on(topic, fn) {
  if (!subs.has(topic)) subs.set(topic, new Set());
  subs.get(topic).add(fn);
  return () => subs.get(topic)?.delete(fn);
}

export function emit(topic, data) {
  subs.get(topic)?.forEach((fn) => {
    try { fn(data); } catch (err) { console.warn('[bus]', topic, err); }
  });
}
