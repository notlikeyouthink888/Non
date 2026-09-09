/**
 * سجل الوحدات + عزل الأعطال.
 * أي استثناء داخل وحدة يُسجَّل ويُعطّل الوحدة فقط — التطبيق يستمر.
 */
export class Kernel {
  constructor(ctx) {
    this.ctx = ctx;
    this.modules = new Map();   // name -> {mod, state, errors[]}
    this.order = [];
    this.log = ctx.log;
  }

  register(mod) {
    if (!mod?.name) throw new Error('module must have a name');
    this.modules.set(mod.name, { mod, state: 'registered', errors: [], ms: 0, deps: mod.deps || [] });
    return this;
  }

  _entry(name) { return this.modules.get(name); }

  /** ترتيب طوبولوجي حسب deps */
  _resolveOrder() {
    const done = new Set(), out = [], visiting = new Set();
    const visit = (name) => {
      if (done.has(name)) return;
      const e = this.modules.get(name);
      if (!e) return;
      if (visiting.has(name)) { this.log.warn(`[kernel] dependency cycle at ${name}`); return; }
      visiting.add(name);
      for (const d of e.deps) visit(d);
      visiting.delete(name);
      done.add(name); out.push(name);
    };
    for (const name of this.modules.keys()) visit(name);
    this.order = out;
    return out;
  }

  async guard(entry, phase, fn) {
    try {
      const t0 = performance.now();
      const r = await fn();
      entry.ms += performance.now() - t0;
      return r;
    } catch (err) {
      entry.errors.push({ phase, message: String(err?.message || err), stack: err?.stack });
      entry.state = 'degraded';
      this.log.error(`[kernel] "${entry.mod.name}" failed in ${phase}:`, err);
      this.ctx.bus.emit('module:error', { name: entry.mod.name, phase, error: String(err?.message || err) });
      this.ctx.bus.emit('module:degraded', { name: entry.mod.name });
      return null;
    }
  }

  async initAll() {
    this._resolveOrder();
    for (const name of this.order) {
      const e = this._entry(name);
      // إن كانت تبعية معطّلة نُعلِم الوحدة لكن نُكمل
      const badDeps = e.deps.filter((d) => this._entry(d)?.state === 'degraded');
      if (badDeps.length) this.log.warn(`[kernel] ${name}: degraded deps ${badDeps.join(',')}`);
      if (e.state === 'degraded') continue;
      this.ctx.progress?.('تهيئة: ' + name);
      await frame();
      const ok = await this.guard(e, 'init', () => e.mod.init?.(this.ctx));
      if (e.state !== 'degraded') e.state = 'ready';
      void ok;
    }
    return this.report();
  }

  update(dt) {
    for (const name of this.order) {
      const e = this._entry(name);
      if (e.state !== 'ready' || !e.mod.update) continue;
      try { e.mod.update(dt, this.ctx); }
      catch (err) {
        e.errors.push({ phase: 'update', message: String(err?.message || err), stack: err?.stack });
        e.state = 'degraded';
        this.log.error(`[kernel] "${name}" update failed (module disabled):`, err);
        this.ctx.bus.emit('module:error', { name, phase: 'update', error: String(err?.message || err) });
      }
    }
  }

  tick() {
    for (const name of this.order) {
      const e = this._entry(name);
      if (e.state !== 'ready' || !e.mod.tick) continue;
      try { e.mod.tick(this.ctx); }
      catch (err) {
        e.errors.push({ phase: 'tick', message: String(err?.message || err) });
        e.state = 'degraded';
        this.log.error(`[kernel] "${name}" tick failed (module disabled):`, err);
      }
    }
  }

  onQuality(level) {
    for (const [name, e] of this.modules) {
      if (e.state !== 'ready' || !e.mod.onQuality) continue;
      try { e.mod.onQuality(level, this.ctx); }
      catch (err) { this.log.warn(`[kernel] ${name}.onQuality failed`, err); }
    }
  }

  get(name) { return this.modules.get(name)?.mod; }
  api(name) { return this.modules.get(name)?.mod?.api; }

  report() {
    const out = {};
    for (const [name, e] of this.modules) {
      out[name] = { state: e.state, errors: e.errors.map((x) => x.message), initMs: Math.round(e.ms), stats: safe(() => e.mod.stats?.()) };
    }
    return out;
  }

  dispose() {
    for (const [name, e] of this.modules) {
      try { e.mod.dispose?.(); } catch (err) { this.log.warn(`[kernel] dispose ${name}`, err); }
    }
  }
}

function frame() {
  return new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
}

function safe(fn) { try { return fn() ?? null; } catch { return null; } }
