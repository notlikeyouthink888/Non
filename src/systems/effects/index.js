/**
 * وحدة المؤثرات: مسار ما بعد المعالجة (EffectComposer).
 * RenderPass → SSAO (اختياري) → Bloom → SMAA → Grade → Output
 * تعمل دائمًا (حتى بأقل جودة) لضمان اتساق مسار الألوان.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GradeShader } from './gradePass.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';

export default {
  name: 'effects',
  deps: [],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    const { renderer, scene, camera, quality, params } = ctx;
    this.enabled = params.get('fx') !== '0';
    const size = renderer.getSize(new THREE.Vector2());
    const dpr = renderer.getPixelRatio();

    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
      Math.max(1, size.x * dpr), Math.max(1, size.y * dpr),
      { type: THREE.HalfFloatType, samples: 0, depthBuffer: true }
    ));
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    if (quality.ssao) {
      this.ssao = new SSAOPass(scene, camera, size.x * dpr, size.y * dpr);
      this.ssao.kernelRadius = 10;
      this.ssao.minDistance = 0.0012;
      this.ssao.maxDistance = 0.12;
      this.ssao.output = SSAOPass.OUTPUT.Default;
      this.composer.addPass(this.ssao);
    }
    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.09, 0.40, 2.30);
      this.composer.addPass(this.bloom);
    }
    // OutputPass أولًا: يحوّل HDR الخطّي إلى فضاء العرض، ثم تعمل SMAA والتدرّج على قيم 0..1
    this.output = new OutputPass();
    this.composer.addPass(this.output);

    if (quality.smaa) {
      this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    }
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uResolution.value.set(size.x * dpr, size.y * dpr);
    this.grade.uniforms.uGrain.value = quality.grain ? 0.030 : 0.0;
    this.grade.uniforms.uTilt.value = quality.dof ? 0.55 : 0.0;
    this.grade.renderToScreen = true;
    this.composer.addPass(this.grade);

    // السماء يجب ألا تُعالَج بالـ tone mapping مرتين
    ctx.bus.emit('fx:composer', { enabled: true });

    ctx.bus.on('resize', ({ w, h, dpr: d }) => {
      this.composer.setPixelRatio(d);
      this.composer.setSize(w, h);
      this.grade.uniforms.uResolution.value.set(w * d, h * d);
      this.ssao?.setSize(w * d, h * d);
      this.bloom?.setSize(w, h);
    });

    ctx.bus.on('time:changed:done', ({ night }) => {
      if (this.bloom) {
        // القيم هنا في فضاء HDR خطّي قبل التعيين اللوني ⇒ عتبة أعلى من 1
        this.bloom.strength = lerp(0.085, 0.40, smoothstep(0.15, 0.8, night));
        this.bloom.threshold = lerp(2.35, 0.72, smoothstep(0.15, 0.8, night));
        this.bloom.radius = lerp(0.42, 0.62, smoothstep(0.15, 0.8, night));
      }
      this.grade.uniforms.uSaturation.value = lerp(1.07, 1.16, smoothstep(0.2, 0.8, night));
      this.grade.uniforms.uVignette.value = lerp(0.32, 0.44, smoothstep(0.2, 0.8, night));
    });

    this.api = {
      render: (dt) => this.render(dt),
      composer: () => this.composer,
      setEnabled: (name, v) => this.setEnabled(name, v),
      setTilt: (v) => { this.grade.uniforms.uTilt.value = v; },
      passes: () => this.composer.passes.map((p) => p.constructor.name),
    };
  },

  setEnabled(name, v) {
    const map = { ssao: this.ssao, bloom: this.bloom, smaa: this.smaa, grade: this.grade };
    if (map[name]) map[name].enabled = v;
  },

  render(dt) {
    const ctx = this.ctx;
    this.grade.uniforms.uTime.value += dt;
    // اضبط شريط التركيز حسب بُعد الكاميرا: قريب ⇒ عمق ميدان أوضح
    const d = ctx.cameraRig.dist;
    this.grade.uniforms.uBand.value = lerp(0.18, 0.60, clamp((d - 60) / 700, 0, 1));
    this.grade.uniforms.uTilt.value = ctx.app.quality.dof ? lerp(0.75, 0.18, clamp((d - 60) / 800, 0, 1)) : 0;
    if (this.enabled) this.composer.render(dt);
    else ctx.renderer.render(ctx.scene, ctx.camera);
  },

  onQuality(level, ctx) {
    const q = ctx.app.quality;
    if (this.bloom) this.bloom.enabled = q.bloom;
    if (this.smaa) this.smaa.enabled = q.smaa;
    if (this.ssao) this.ssao.enabled = q.ssao;
    this.grade.uniforms.uGrain.value = q.grain ? 0.03 : 0;
  },

  showcase(ctx) { ctx.cameraRig.setPreset('downtown'); },

  stats() { return { passes: this.composer?.passes.length || 0, enabled: this.enabled }; },

  dispose() { this.composer?.dispose?.(); },
};
