/** ناقل أحداث بسيط بلا تبعيات — لا يسمح لخطأ مستمع بإسقاط المُصدِر. */
export class Bus {
  constructor(log = console) { this.map = new Map(); this.log = log; }
  on(ev, fn) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev).add(fn);
    return () => this.off(ev, fn);
  }
  once(ev, fn) { const un = this.on(ev, (...a) => { un(); fn(...a); }); return un; }
  off(ev, fn) { this.map.get(ev)?.delete(fn); }
  emit(ev, payload) {
    const set = this.map.get(ev);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload, ev); }
      catch (e) { this.log.warn?.(`[bus] listener failed for "${ev}":`, e); }
    }
  }
}
