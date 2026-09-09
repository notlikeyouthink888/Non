/**
 * قبة سماء إجرائية: تشتت رايلي/مي نهارًا، شفق دافئ، ليل بنجوم وقمر ومجرّة خافتة.
 * تُعيد أيضًا لون الأفق لاستعماله في الضباب (العمق الجوي).
 */
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vWorldDir;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vWorldDir = normalize( wp.xyz - cameraPosition );
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // دائمًا في أقصى العمق
}
`;

const FRAG = /* glsl */`
precision highp float;
#include <common>
#include <tonemapping_pars_fragment>
varying vec3 vWorldDir;

uniform vec3  uSunDir;
uniform vec3  uMoonDir;
uniform float uTurbidity;
uniform float uCloudiness;
uniform float uExposure;
uniform float uTime;
uniform float uNight;        // 0 نهار .. 1 ليل
uniform vec3  uGroundColor;
uniform float uCityGlow;

// معاملات التشتت
const vec3 betaR = vec3( 5.5e-6, 13.0e-6, 22.4e-6 );
const float betaM_base = 21e-6;
const float hR = 7994.0;
const float hM = 1200.0;

float rayleighPhase( float mu ) { return 3.0 / ( 16.0 * PI ) * ( 1.0 + mu * mu ); }
float miePhase( float mu, float g ) {
  float g2 = g * g;
  return 3.0 / ( 8.0 * PI ) * ( ( 1.0 - g2 ) * ( 1.0 + mu * mu ) ) /
         ( ( 2.0 + g2 ) * pow( 1.0 + g2 - 2.0 * g * mu, 1.5 ) );
}

float hash21( vec2 p ) {
  p = fract( p * vec2( 234.34, 435.345 ) );
  p += dot( p, p + 34.23 );
  return fract( p.x * p.y );
}

float starField( vec3 dir ) {
  // إسقاط على شبكة كروية
  vec3 d = normalize( dir );
  vec2 uv = vec2( atan( d.z, d.x ) / ( 2.0 * PI ) + 0.5, acos( clamp( d.y, -1.0, 1.0 ) ) / PI );
  float total = 0.0;
  for ( int L = 0; L < 3; L++ ) {
    float scale = 260.0 * pow( 1.9, float( L ) );
    vec2 g = uv * scale;
    vec2 id = floor( g );
    vec2 f = fract( g ) - 0.5;
    float h = hash21( id + float( L ) * 71.3 );
    if ( h > 0.986 - float( L ) * 0.004 ) {
      vec2 off = vec2( hash21( id + 3.1 ), hash21( id + 7.7 ) ) - 0.5;
      float d2 = length( f - off * 0.7 );
      float mag = ( h - 0.982 ) * 240.0;
      float twinkle = 0.75 + 0.25 * sin( uTime * ( 1.2 + h * 4.0 ) + h * 30.0 );
      total += smoothstep( 0.055, 0.0, d2 ) * mag * twinkle;
    }
  }
  return total;
}

// ضوضاء بسيطة للغيوم
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = hash21( i ), b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) ), d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
float fbm2( vec2 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 5; i++ ) { s += a * vnoise( p ); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec3 dir = normalize( vWorldDir );
  float up = dir.y;
  vec3 sun = normalize( uSunDir );
  float mu = dot( dir, sun );

  // كثافة بصرية تقريبية على طول الشعاع
  float zenith = max( up, -0.05 );
  float sR = hR / max( zenith + 0.15 * pow( 93.885 - degrees( acos( clamp( zenith, -1.0, 1.0 ) ) ), -1.253 ), 0.02 );
  float sM = hM / max( zenith + 0.15 * pow( 93.885 - degrees( acos( clamp( zenith, -1.0, 1.0 ) ) ), -1.253 ), 0.02 );

  float betaM = betaM_base * uTurbidity;
  vec3 extinction = exp( - ( betaR * sR + betaM * sM ) * 1.0 );

  float sunE = smoothstep( -0.12, 0.10, sun.y );        // شدّة الشمس مع الارتفاع
  vec3 sunColor = mix( vec3( 1.55, 0.62, 0.24 ), vec3( 1.0, 0.98, 0.95 ), smoothstep( 0.0, 0.32, sun.y ) );

  vec3 inR = betaR * rayleighPhase( mu );
  vec3 inM = vec3( betaM * miePhase( mu, 0.80 ) );
  vec3 scatter = ( inR * sR + inM * sM ) * 88.0 * sunColor * sunE;
  vec3 dayCol = scatter * ( 1.0 - extinction * 0.35 );

  // قرص الشمس + هالة
  float sunDisk = smoothstep( 0.99965, 0.99992, mu ) * sunE;
  float sunHalo = pow( max( mu, 0.0 ), 340.0 ) * 0.55 * sunE + pow( max( mu, 0.0 ), 12.0 ) * 0.10 * sunE;
  dayCol += sunColor * ( sunDisk * 11.0 + sunHalo );

  // شفق: شريط دافئ قرب الأفق عند الغروب/الشروق
  float horizonBand = exp( - abs( up ) * 9.0 );
  float twilight = smoothstep( 0.22, -0.16, sun.y ) * smoothstep( -0.34, -0.02, sun.y );
  dayCol += vec3( 1.15, 0.42, 0.16 ) * horizonBand * twilight * 0.9 * ( 0.4 + 0.6 * pow( max( mu, 0.0 ), 3.0 ) );

  // ---- ليل ----
  vec3 moon = normalize( uMoonDir );
  float mmu = dot( dir, moon );
  vec3 nightCol = mix( vec3( 0.008, 0.014, 0.030 ), vec3( 0.020, 0.033, 0.062 ), smoothstep( -0.1, 0.65, up ) );
  // وهج المدينة على الأفق
  nightCol += vec3( 0.085, 0.055, 0.030 ) * exp( - max( up, 0.0 ) * 7.0 ) * uCityGlow;
  // مجرّة خافتة
  float band = exp( - pow( ( dir.y - dir.x * 0.35 ) * 2.6, 2.0 ) );
  nightCol += vec3( 0.030, 0.032, 0.048 ) * band * ( 0.35 + 0.65 * fbm2( vec2( atan( dir.z, dir.x ) * 3.0, dir.y * 6.0 ) ) );
  nightCol += vec3( 0.95, 0.96, 1.0 ) * starField( dir ) * 0.55 * smoothstep( 0.0, 0.12, up );
  // القمر
  float moonDisk = smoothstep( 0.99940, 0.99975, mmu ) * smoothstep( -0.10, 0.06, moon.y );
  float moonGlow = pow( max( mmu, 0.0 ), 180.0 ) * 0.35 * smoothstep( -0.08, 0.10, moon.y );
  nightCol += vec3( 0.95, 0.95, 0.88 ) * ( moonDisk * 3.6 + moonGlow );

  vec3 col = mix( dayCol, nightCol, uNight );

  // ---- غيوم ----
  if ( up > -0.02 ) {
    vec2 cuv = dir.xz / max( up + 0.09, 0.02 ) * 0.55;
    float t = uTime * 0.004;
    float c1 = fbm2( cuv * 0.7 + vec2( t, t * 0.4 ) );
    float c2 = fbm2( cuv * 1.9 - vec2( t * 1.6, t * 0.7 ) );
    float cov = smoothstep( 0.62 - uCloudiness * 0.42, 0.92 - uCloudiness * 0.30, c1 * 0.68 + c2 * 0.42 );
    float thick = smoothstep( 0.0, 1.0, cov ) * smoothstep( -0.01, 0.10, up );
    float lightSide = clamp( dot( normalize( vec3( sun.x, 0.25, sun.z ) ), normalize( vec3( dir.x, 0.25, dir.z ) ) ), 0.0, 1.0 );
    vec3 lit = mix( vec3( 0.42, 0.45, 0.52 ), vec3( 1.25, 1.16, 1.06 ), lightSide * 0.85 + 0.15 );
    lit *= mix( 0.16, 1.0, sunE );
    lit = mix( lit, vec3( 0.05, 0.06, 0.10 ), uNight * 0.82 );
    lit += sunColor * pow( max( mu, 0.0 ), 8.0 ) * 0.5 * sunE * ( 1.0 - uNight );
    col = mix( col, lit, thick * 0.90 );
  }

  // أرضية افتراضية أسفل الأفق (تمنع فراغًا أسود عند النظر لأسفل)
  col = mix( col, uGroundColor * ( 0.35 + 0.65 * ( 1.0 - uNight ) ), smoothstep( -0.005, -0.09, up ) );

  col *= uExposure;
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSky() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.2) },
    uMoonDir: { value: new THREE.Vector3(-0.3, -0.6, -0.2) },
    uTurbidity: { value: 2.6 },
    uCloudiness: { value: 0.35 },
    uExposure: { value: 1.0 },
    uTime: { value: 0 },
    uNight: { value: 0 },
    uGroundColor: { value: new THREE.Color(0x2a2f2a) },
    uCityGlow: { value: 0.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: true,
    // toneMapped يُضبط لاحقًا: false عند تفعيل مسار ما بعد المعالجة (OutputPass يتولّى ذلك)
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.position.copy(camera.position);
    mesh.scale.setScalar(Math.max(camera.far * 0.5, 2000));
  };
  return { mesh, uniforms, material: mat };
}

/** موضع الشمس التحليلي (خط عرض ~30°) */
export function sunDirection(hour, latDeg = 30, decDeg = 16) {
  const lat = latDeg * Math.PI / 180, dec = decDeg * Math.PI / 180;
  const H = (hour - 12) / 12 * Math.PI;
  const sinEl = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
  // az: 0 = جنوب، موجب باتجاه الغرب
  const y = Math.sin(el), r = Math.cos(el);
  return new THREE.Vector3(Math.sin(az) * r, y, Math.cos(az) * r).normalize();
}
