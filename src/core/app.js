/** تركيب التطبيق: العارض، المشهد، النواة، الحلقة، وواجهة الاختبار window.__CITY */
import * as THREE from 'three';
import { Bus } from './bus.js';
import { RNG } from './rng.js';
import { Kernel } from './kernel.js';
import { createWorld } from './world.js';
import { TextureFactory } from './textures.js';
import { MaterialLibrary } from './materials.js';
import { CameraRig } from './cameraRig.js';
import { TimeController } from './time.js';
import { QUALITY, autoQuality, detectPlatform, WORLD } from './config.js';
import { EMA } from './math.js';

export class App {
  constructor({ canvas, modules = [], params = new URLSearchParams() }) {
    this.canvas = canvas;
    this.params = params;
    this.consoleErrors = [];
    this.logs = [];
    this.log = this._makeLogger();
    this.platform = detectPlatform();
    this.qualityName = autoQuality(this.platform);
    this.quality = { ...QUALITY[this.qualityName] };
    this.seed = +(params.get('seed') || WORLD.seed);
    this.showcase = params.get('showcase') || null;
    this.bus = new Bus(this.log);
    this.rng = new RNG(this.seed);
    this.world = createWorld(this.seed);
    this.modulesToLoad = modules;
    this.ready = false;
    this.frame = 0;
    this.fps = new EMA(0.08, 60);
    this.frameMs = new EMA(0.08, 16);
    this._frameTimes = [];
    this.boot = 'بدء التشغيل';
    this._captureHooks();
  }

  _makeLogger() {
    const push = (level, args) => {
      const msg = args.map((a) => (a instanceof Error ? a.message : typeof a === 'object' ? safeJson(a) : String(a))).join(' ');
      this.logs.push({ level, msg, t: Date.now() });
      if (this.logs.length > 400) this.logs.shift();
      if (level === 'error') this.consoleErrors.push(msg);
    };
    return {
      info: (...a) => { push('info', a); console.log(...a); },
      warn: (...a) => { push('warn', a); console.warn(...a); },
      error: (...a) => { push('error', a); console.error(...a); },
      debug: (...a) => { push('debug', a); },
    };
  }

  _captureHooks() {
    window.addEventListener('error', (e) => this.consoleErrors.push(`window.error: ${e.message} @${e.filename}:${e.lineno}`));
    window.addEventListener('unhandledrejection', (e) => this.consoleErrors.push(`unhandledrejection: ${e.reason?.message || e.reason}`));
  }

  async init() {
    const t0 = performance.now();
    const q = this.quality;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,                 // نستعمل SMAA في مسار ما بعد المعالجة
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      preserveDrawingBuffer: true,      // مطلوب لالتقاط اللقطات
      logarithmicDepthBuffer: false,
    });
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, q.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = true;
    renderer.info.autoReset = false;
    this.renderer = renderer;

    const gl = renderer.getContext();
    this.glInfo = {
      version: gl.getParameter(gl.VERSION),
      renderer: (() => { const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })(),
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, 9000);
    this.cameraRig = new CameraRig(this.camera, this.canvas, this.world);
    this.time = new TimeController(this.bus, { hour: +(this.params.get('time') || 15) });

    this.textures = new TextureFactory(renderer, { size: q.texSize, anisotropy: Math.min(q.anisotropy, renderer.capabilities.getMaxAnisotropy()), seed: this.seed });
    this.materials = new MaterialLibrary(this.textures);

    this.ctx = {
      app: this, scene: this.scene, renderer, camera: this.camera, cameraRig: this.cameraRig,
      world: this.world, bus: this.bus, rng: this.rng, config: { WORLD }, quality: this.quality,
      qualityName: this.qualityName, textures: this.textures, materials: this.materials,
      time: this.time, log: this.log, platform: this.platform, params: this.params,
      module: (n) => this.kernel.get(n),
    };

    this.ctx.progress = (text) => {
      this.boot = text;
      this.bus.emit('boot:progress', { text });
      this.log.info('[boot] ' + text);
    };

    this.kernel = new Kernel(this.ctx);
    for (const m of this.modulesToLoad) this.kernel.register(m);

    this._resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.bus.emit('resize', { w, h, dpr: renderer.getPixelRatio() });
    };
    window.addEventListener('resize', this._resize);

    this.ctx.progress('تهيئة الوحدات');
    await this.kernel.initAll();

    // وضع الاستعراض: وحدة واحدة فقط
    if (this.showcase) {
      const e = this.kernel.modules.get(this.showcase);
      if (e && e.state === 'ready') {
        await this.kernel.guard(e, 'showcase', () => e.mod.showcase?.(this.ctx));
      } else {
        this.log.error(`showcase: module "${this.showcase}" not available`);
      }
    }

    this.initMs = performance.now() - t0;
    this.ready = true;
    this.bus.emit('app:ready', { ms: this.initMs });
    this.log.info(`[app] ready in ${Math.round(this.initMs)}ms — quality=${this.qualityName} showcase=${this.showcase || '-'}`);
    this._loop();
    return this;
  }

  setQuality(name) {
    if (!QUALITY[name]) return false;
    this.qualityName = name;
    Object.assign(this.quality, QUALITY[name]);
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, this.quality.pixelRatio));
    this.ctx.qualityName = name;
    this.kernel.onQuality(name);
    this.bus.emit('quality:changed', { level: name });
    return true;
  }

  _loop() {
    let last = performance.now();
    this._winStart = last; this._winFrames = 0; this._fpsWall = 0;
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const now = performance.now();
      let dt = (now - last) / 1000; last = now;
      dt = Math.min(dt, 1 / 20);
      this.frame++;
      this.renderer.info.reset();

      this.cameraRig.update(dt);
      const simTicks = this.time.advance(dt);
      this.kernel.update(dt);
      for (let i = 0; i < simTicks; i++) this.kernel.tick();

      const fx = this.kernel.get('effects');
      if (fx?.api?.render) fx.api.render(dt);
      else this.renderer.render(this.scene, this.camera);

      const ms = performance.now() - now;
      this.frameMs.push(ms);
      this._frameTimes.push(ms);
      if (this._frameTimes.length > 180) this._frameTimes.shift();
      // fps بالساعة الحقيقية على نافذة زمنية (أدق من 1/dt تحت العرض البرمجي)
      this._winFrames++;
      const wall = now - this._winStart;
      if (wall > 900) { this._fpsWall = (this._winFrames * 1000) / wall; this._winStart = now; this._winFrames = 0; }
    };
    this._raf = requestAnimationFrame(tick);
  }

  stats() {
    const info = this.renderer.info;
    const ft = [...this._frameTimes].sort((a, b) => a - b);
    return {
      ready: this.ready,
      quality: this.qualityName,
      seed: this.seed,
      showcase: this.showcase,
      fps: +(this._fpsWall || (this.frameMs.v > 0 ? 1000 / this.frameMs.v : 0)).toFixed(1),
      frameMs: +this.frameMs.v.toFixed(2),
      frameMsP95: ft.length ? +ft[Math.floor(ft.length * 0.95)].toFixed(2) : 0,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length || 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      textureMB: +(this.textures.bytes / 1048576).toFixed(1),
      initMs: Math.round(this.initMs || 0),
      timeOfDay: +this.time.hour.toFixed(2),
      camera: this.cameraRig.state(),
      modules: this.kernel.report(),
      consoleErrors: this.consoleErrors.slice(0, 30),
      gl: this.glInfo,
      population: this.world.stats.population,
      buildings: this.world.buildings.length,
      roads: this.world.roads.edges.size,
      cars: this.world.agents.cars.length,
    };
  }

  expose() {
    const api = {
      app: this,
      get ready() { return this.app.ready; },
      setTimeOfDay: (h) => { this.time.setHour(h); return this.time.hour; },
      setCameraPreset: (n) => this.cameraRig.setPreset(n),
      setCamera: (o) => {
        const r = this.cameraRig;
        if (o.x !== undefined) r.tTarget.x = r.target.x = o.x;
        if (o.z !== undefined) r.tTarget.z = r.target.z = o.z;
        if (o.dist !== undefined) r.tDist = r.dist = o.dist;
        if (o.yaw !== undefined) r.tYaw = r.yaw = o.yaw;
        if (o.pitch !== undefined) r.tPitch = r.pitch = o.pitch;
        if (o.fov !== undefined) { this.camera.fov = o.fov; this.camera.updateProjectionMatrix(); }
        r.apply(0, true);
        return r.state();
      },
      presets: () => CameraRig.presetNames(),
      setQuality: (n) => this.setQuality(n),
      stats: () => this.stats(),
      logs: () => this.logs,
      world: this.world,
      module: (n) => this.kernel.get(n),
      boot: () => this.boot,
      resetFrameStats: () => {
        this._frameTimes.length = 0; this.frameMs = new EMA(0.15, 16);
        this._winStart = performance.now(); this._winFrames = 0; this._fpsWall = 0;
      },
    };
    api.app = this;
    globalThis.__CITY = api;
    return api;
  }
}

function safeJson(o) { try { return JSON.stringify(o); } catch { return '[object]'; } }
