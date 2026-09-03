/** تمريرة ختامية: عمق ميدان مصغّر (tilt-shift)، تظليل حواف، تدرّج لوني، حبيبات، انحراف لوني خفيف. */
import * as THREE from 'three';

export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    uTilt: { value: 0.55 },        // شدة عمق الميدان
    uFocus: { value: 0.56 },       // موضع شريط التركيز (0..1 من أعلى)
    uBand: { value: 0.30 },        // عرض الشريط
    uVignette: { value: 0.30 },
    uGrain: { value: 0.030 },
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.065 },
    uLift: { value: new THREE.Vector3(0.004, 0.006, 0.012) },
    uCA: { value: 0.55 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uTilt, uFocus, uBand, uVignette, uGrain, uSaturation, uContrast, uCA;
    uniform vec2 uResolution;
    uniform vec3 uLift;
    varying vec2 vUv;

    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }

    void main() {
      vec2 texel = 1.0 / uResolution;
      float d = abs( vUv.y - uFocus );
      float blur = smoothstep( uBand, uBand + 0.34, d ) * uTilt;

      vec3 col;
      if ( blur > 0.002 ) {
        float r = blur * 3.4;
        vec3 s = texture2D( tDiffuse, vUv ).rgb * 0.24;
        s += texture2D( tDiffuse, vUv + vec2( texel.x * r * 1.4, 0.0 ) ).rgb * 0.14;
        s += texture2D( tDiffuse, vUv - vec2( texel.x * r * 1.4, 0.0 ) ).rgb * 0.14;
        s += texture2D( tDiffuse, vUv + vec2( 0.0, texel.y * r * 1.4 ) ).rgb * 0.14;
        s += texture2D( tDiffuse, vUv - vec2( 0.0, texel.y * r * 1.4 ) ).rgb * 0.14;
        s += texture2D( tDiffuse, vUv + texel * r ).rgb * 0.05;
        s += texture2D( tDiffuse, vUv - texel * r ).rgb * 0.05;
        s += texture2D( tDiffuse, vUv + vec2( texel.x, -texel.y ) * r ).rgb * 0.05;
        s += texture2D( tDiffuse, vUv - vec2( texel.x, -texel.y ) * r ).rgb * 0.05;
        col = s;
      } else {
        col = texture2D( tDiffuse, vUv ).rgb;
      }

      // انحراف لوني خفيف نحو الأطراف
      vec2 dir = vUv - 0.5;
      float ca = uCA * dot( dir, dir ) * 0.006;
      if ( uCA > 0.0 ) {
        col.r = texture2D( tDiffuse, vUv + dir * ca ).r;
        col.b = texture2D( tDiffuse, vUv - dir * ca ).b;
      }

      // تدرّج لوني
      float lum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = mix( vec3( lum ), col, uSaturation );
      col = ( col - 0.5 ) * uContrast + 0.5;
      col += uLift * ( 1.0 - lum );

      // تظليل الحواف
      float v = 1.0 - uVignette * dot( dir, dir ) * 2.1;
      col *= clamp( v, 0.0, 1.0 );

      // حبيبات
      float g = hash( vUv * uResolution + fract( uTime ) * 137.0 ) - 0.5;
      col += g * uGrain * ( 1.0 - lum * 0.6 );

      gl_FragColor = vec4( max( col, 0.0 ), 1.0 );
    }
  `,
};
