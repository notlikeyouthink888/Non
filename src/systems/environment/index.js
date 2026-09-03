/**
 * وحدة البيئة: سماء، شمس/قمر، ظلال، ضباب جوي، خريطة بيئة ديناميكية، دورة اليوم والطقس.
 * تكتب: world.timeOfDay, world.weather — وتُصدر time:changed.
 */
import * as THREE from 'three';
import { createSky, sunDirection } from './sky.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';

const DAY = {
  //                    sun color            intensity  ambient sky      ambient ground  fogDensity  exposure
  night:   { sun: 0x9fb6d8, i: 0.16, skyC: 0x223047, gndC: 0x0c1016, fog: 0.00030, exp: 1.10 },
  dawn:    { sun: 0xffb271, i: 1.35, skyC: 0x6b83a8, gndC: 0x3a3128, fog: 0.00017, exp: 0.68 },
  day:     { sun: 0xfff0d2, i: 2.60, skyC: 0xa6c6ea, gndC: 0x6a6450, fog: 0.00016, exp: 0.95 },
  dusk:    { sun: 0xff9448, i: 1.20, skyC: 0x76708f, gndC: 0x372e2b, fog: 0.00019, exp: 0.66 },
};

export default {
  name: 'environment',
  deps: [],
  api: {},

  async init(ctx) {
    const { scene, renderer, world, quality } = ctx;
    this.ctx = ctx;

    this.sky = createSky();
    scene.add(this.sky.mesh);

    this.sun = new THREE.DirectionalLight(0xfff4e2, 3.2);
    this.sun.castShadow = true;
    const sm = quality.shadowMap;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 2200;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.blurSamples = 12;
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;

    this.hemi = new THREE.HemisphereLight(0x9fc4ef, 0x5c5a4e, 0.42);
    scene.add(this.hemi);

    // ضوء ملء بارد بسيط لمحاكاة الارتداد السماوي على الواجهات المظللة
    this.fill = new THREE.DirectionalLight(0x9dc0f0, 0.16);
    this.fill.castShadow = false;
    scene.add(this.fill);

    scene.fog = new THREE.FogExp2(0x9fc4ef, 0.00022);

    // خريطة بيئة ديناميكية من السماء (PMREM) — تُحدَّث عند تغيّر الوقت بشكل ملموس
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.envScene = new THREE.Scene();
    this.envSky = createSky();
    this.envSky.mesh.onBeforeRender = () => {};
    this.envSky.mesh.scale.setScalar(500);
    this.envScene.add(this.envSky.mesh);
    this._lastEnvHour = -99;
    this._envTarget = null;

    this._forceShadow = true;
    this.setTimeOfDay(ctx.time.hour, true);

    ctx.bus.on('quality:changed', ({ level }) => {
      const q = ctx.app.quality;
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    });

    this.api = {
      setTimeOfDay: (h) => this.setTimeOfDay(h),
      get sunDirection() { return this.sunDir.clone(); },
      get isNight() { return this.night > 0.5; },
      get nightFactor() { return this.night; },
      horizonColor: () => this.fogColor.clone(),
      setWeather: (w) => { Object.assign(world.weather, w); this.sky.uniforms.uCloudiness.value = world.weather.cloudiness; ctx.bus.emit('weather:changed', world.weather); },
      envMap: () => this._envTarget?.texture || null,
    };

    ctx.bus.on('time:changed', ({ hour }) => this.setTimeOfDay(hour, false, true));

    // مع مسار ما بعد المعالجة يتولّى OutputPass التعيين اللوني — نمنع التطبيق المزدوج
    ctx.bus.on('fx:composer', ({ enabled }) => {
      this.sky.material.toneMapped = !enabled;
      this.sky.material.needsUpdate = true;
      this.envSky.material.toneMapped = false;   // خريطة البيئة دائمًا خطّية
      this.envSky.material.needsUpdate = true;
    });
  },

  setTimeOfDay(hour, force = false, fromBus = false) {
    const ctx = this.ctx;
    const { world, scene } = ctx;
    world.timeOfDay = hour;
    if (!fromBus) ctx.time.hour = hour;

    const sunDir = sunDirection(hour);
    this.sunDir = sunDir;
    const el = sunDir.y;

    // مزج معاملات وقت اليوم حسب ارتفاع الشمس
    const dayW = smoothstep(0.02, 0.28, el);
    const twiW = smoothstep(-0.22, 0.02, el) * (1 - dayW);
    const nightW = 1 - smoothstep(-0.20, 0.005, el);
    this.night = nightW;

    const rising = hour < 12;
    const twi = rising ? DAY.dawn : DAY.dusk;
    const mixC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

    let sunCol = mixC(DAY.night.sun, twi.sun, clamp(twiW * 2.2, 0, 1));
    sunCol = sunCol.lerp(new THREE.Color(DAY.day.sun), dayW);
    const inten = lerp(lerp(DAY.night.i, twi.i, clamp(twiW * 1.6, 0, 1)), DAY.day.i, dayW);

    this.sun.color.copy(sunCol);
    this.sun.intensity = inten;
    // ليلًا: ضوء القمر من الجهة المقابلة
    const moonDir = sunDir.clone().multiplyScalar(-1);
    this.moonDir = moonDir;
    const lightDir = nightW > 0.72 ? moonDir : sunDir;
    this.sun.position.copy(lightDir).multiplyScalar(1500);
    if (nightW > 0.72) { this.sun.color.setHex(0x8ea6cc); this.sun.intensity = 0.22 * smoothstep(0.0, 0.5, moonDir.y); }

    const skyC = mixC(DAY.night.skyC, twi.skyC, clamp(twiW * 1.8, 0, 1)).lerp(new THREE.Color(DAY.day.skyC), dayW);
    const gndC = mixC(DAY.night.gndC, twi.gndC, clamp(twiW * 1.8, 0, 1)).lerp(new THREE.Color(DAY.day.gndC), dayW);
    this.hemi.color.copy(skyC);
    this.hemi.groundColor.copy(gndC);
    this.hemi.intensity = lerp(0.38, 0.95, dayW) + twiW * 0.20;

    this.fill.color.copy(skyC);
    this.fill.intensity = lerp(0.05, 0.22, dayW);
    this.fill.position.set(-sunDir.x, Math.max(0.45, sunDir.y * 0.4 + 0.5), -sunDir.z).multiplyScalar(800);

    // الضباب = لون الأفق (عمق جوي)
    const horizon = skyC.clone().lerp(new THREE.Color(0xffffff), dayW * 0.14);
    if (twiW > 0.15) horizon.lerp(new THREE.Color(rising ? 0xffb98a : 0xff9c63), twiW * 0.5);
    if (nightW > 0.5) horizon.lerp(new THREE.Color(0x131b28), nightW * 0.8);
    this.fogColor = horizon;
    scene.fog.color.copy(horizon);
    scene.fog.density = lerp(lerp(DAY.night.fog, twi.fog, clamp(twiW * 1.6, 0, 1)), DAY.day.fog, dayW)
      * lerp(0.9, 1.45, world.weather.humidity);

    ctx.renderer.toneMappingExposure = lerp(lerp(DAY.night.exp, twi.exp, twiW), DAY.day.exp, dayW);

    const u = this.sky.uniforms;
    u.uSunDir.value.copy(sunDir);
    u.uMoonDir.value.copy(moonDir);
    u.uNight.value = nightW;
    u.uCloudiness.value = world.weather.cloudiness;
    u.uTurbidity.value = lerp(2.2, 4.6, world.weather.humidity);
    u.uCityGlow.value = clamp(world.buildings.length / 400, 0, 1.2);
    u.uGroundColor.value.copy(gndC);

    this._forceShadow = true;
    ctx.bus.emit('time:changed:done', { hour, sunDir, isNight: nightW > 0.5, night: nightW });
    this._envDirty = Math.abs(hour - this._lastEnvHour) > 0.12 || force;
  },

  _updateShadowFrustum() {
    const rig = this.ctx.cameraRig;
    const key = `${Math.round(rig.target.x / 6)},${Math.round(rig.target.z / 6)},${Math.round(rig.dist / 8)},${Math.round((this.sunDir?.y || 0) * 200)},${Math.round((this.sunDir?.x || 0) * 200)}`;
    if (key === this._shadowKey && !this._forceShadow) return;
    this._shadowKey = key; this._forceShadow = false;
    const q = this.ctx.app.quality;
    const d = clamp(rig.dist * 1.25, 90, q.shadowDistance);
    const c = this.ctx.cameraRig.target;
    this.sunTarget.position.copy(c);
    const dir = (this.night > 0.72 ? this.moonDir : this.sunDir);
    this.sun.position.copy(c).addScaledVector(dir, Math.max(600, d * 2.2));
    const cam = this.sun.shadow.camera;
    cam.left = -d; cam.right = d; cam.top = d; cam.bottom = -d;
    cam.near = 1; cam.far = Math.max(1200, d * 5);
    // تثبيت الظل على شبكة النسيج لتقليل الاهتزاز
    const texel = (2 * d) / this.ctx.app.quality.shadowMap;
    this.sunTarget.position.set(Math.round(c.x / texel) * texel, c.y, Math.round(c.z / texel) * texel);
    cam.updateProjectionMatrix();
    this.ctx.renderer.shadowMap.needsUpdate = true;
  },

  _updateEnv() {
    const ctx = this.ctx;
    const u = this.envSky.uniforms, s = this.sky.uniforms;
    for (const k of Object.keys(u)) {
      if (u[k].value?.copy) u[k].value.copy(s[k].value); else u[k].value = s[k].value;
    }
    const prev = this._envTarget;
    this._envTarget = this.pmrem.fromScene(this.envScene, 0, 1, 1200);
    ctx.scene.environment = this._envTarget.texture;
    ctx.scene.environmentIntensity = lerp(0.62, 0.95, 1 - this.night);
    prev?.dispose();
    this._lastEnvHour = ctx.time.hour;
    this._envDirty = false;
    ctx.bus.emit('env:updated', { hour: this._lastEnvHour });
  },

  update(dt, ctx) {
    this.sky.uniforms.uTime.value += dt;
    this._updateShadowFrustum();
    if (this._envDirty) this._updateEnv();
    if (ctx.time.flowing) this.setTimeOfDay(ctx.time.hour, false, true);
  },

  showcase(ctx) {
    ctx.cameraRig.setPreset('aerial');
    ctx.time.setHour(6.4);
  },

  stats() { return { night: +(this.night || 0).toFixed(2), sunY: +(this.sunDir?.y || 0).toFixed(3), exposure: +this.ctx.renderer.toneMappingExposure.toFixed(2) }; },

  dispose() {
    this.sky?.mesh.removeFromParent();
    this.sky?.material.dispose();
    this.envSky?.material.dispose();
    this._envTarget?.dispose();
    this.pmrem?.dispose();
    this.sun?.removeFromParent(); this.hemi?.removeFromParent(); this.fill?.removeFromParent();
  },
};
