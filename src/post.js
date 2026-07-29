import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CONFIG } from './config.js';

/**
 * Colour grade + lens character, applied in display space after tone mapping —
 * which is where a colourist would work, and where vignette and grain read
 * correctly.
 *
 * Every parameter is driven by the blended mood profile, so the grade
 * crossfades along with the scene rather than switching.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
    uHighlightTint: { value: new THREE.Vector3(1, 1, 1) },
    uTintStrength: { value: 0 },
    uVignette: { value: 0 },
    uShadowLift: { value: new THREE.Vector3(0, 0, 0) },
    uGrain: { value: 0 },
    uAberration: { value: 0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uContrast;
    uniform float uSaturation;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uTintStrength;
    uniform float uVignette;
    uniform vec3 uShadowLift;
    uniform float uGrain;
    uniform float uAberration;

    varying vec2 vUv;

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    void main() {
      vec2 offset = vUv - 0.5;
      float radius = length(offset);

      // Lens dispersion, quadratic so the centre of frame stays clean. The
      // constant puts uAberration ~1.0 at a few pixels of fringing in the
      // corners, which is the most it should ever be noticed.
      float spread = uAberration * radius * radius * 0.006;
      vec3 color = vec3(
        texture2D(tDiffuse, vUv - offset * spread).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv + offset * spread).b
      );

      color = (color - 0.5) * uContrast + 0.5;

      float luma = dot(color, LUMA);
      color = mix(vec3(luma), color, uSaturation);

      // Split tone: shadows and highlights pull toward different hues, which is
      // most of what separates a "coloured" frame from a tinted one.
      vec3 tint = mix(uShadowTint, uHighlightTint, smoothstep(0.05, 0.95, luma));
      color = mix(color, color * tint, uTintStrength);

      // Painted shadows are never black: lift the darkest values toward the
      // mood's shadow hue, hardest where the frame is darkest. This is the
      // "colourful shadows" of the art direction in one line.
      float darkness = pow(1.0 - smoothstep(0.0, 0.4, luma), 2.0);
      color += uShadowLift * darkness;

      color *= 1.0 - uVignette * smoothstep(0.32, 0.92, radius);

      float grain = fract(sin(dot(vUv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      color += (grain - 0.5) * uGrain;

      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};

/**
 * The render pipeline.
 *
 * scene -> bloom -> tone map -> grade. Bloom is the expensive link, so it can
 * be dropped at runtime without disturbing the rest of the chain: the grade
 * pass carries the look on its own, just without the glow.
 */
export class Post {
  constructor(renderer, scene, camera, tier) {
    this.renderer = renderer;
    this.tier = tier;

    // Highlights need headroom above 1.0 for bloom to have anything to pick up,
    // so tone mapping happens after it rather than in the base render.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.6,
      0.7,
      0.75
    );
    this.composer.addPass(this.bloom);

    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.grade = new ShaderPass(GradeShader);
    this.grade.renderToScreen = true;
    this.composer.addPass(this.grade);

    this.bloomEnabled = true;
    this.setSize(window.innerWidth, window.innerHeight);

    // Frame-time watchdog state.
    this._sampleTime = 0;
    this._sampleFrames = 0;
    this._step = 0;

    if (!tier.bloom) this.setBloomEnabled(false);
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
    const pixelRatio = this.renderer.getPixelRatio();
    this.grade.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
  }

  setBloomEnabled(enabled) {
    this.bloomEnabled = enabled;
    this.bloom.enabled = enabled;
  }

  update(state) {
    const live = state.live;
    const u = this.grade.uniforms;

    u.uTime.value = state.time;

    // Exposure is applied before tone mapping, so it rolls highlights off the
    // way a real stop change does instead of just lifting the whole image.
    this.renderer.toneMappingExposure = live.exposureFinal;
    u.uContrast.value = live.contrast;
    u.uSaturation.value = live.saturation;
    u.uTintStrength.value = live.tintStrength;
    u.uVignette.value = live.vignette;
    u.uGrain.value = live.grain;
    u.uAberration.value = live.aberration;

    // Normalise tints to a pure hue shift — an un-normalised colour would
    // darken the image as well as tint it.
    normalisedTint(live.shadowTint, u.uShadowTint.value);
    normalisedTint(live.highlightTint, u.uHighlightTint.value);

    // Shadow lift rides the same mood hue as the split-tone, scaled well down.
    u.uShadowLift.value.set(
      live.shadowTint.r * 0.055,
      live.shadowTint.g * 0.055,
      live.shadowTint.b * 0.055
    );

    this.bloom.strength = live.bloomStrengthFinal ?? live.bloomStrength;
    this.bloom.threshold = live.bloomThreshold;
    this.bloom.radius = live.bloomRadius;

    this._watchPerformance(state.dt);
  }

  /**
   * Walk the two runtime-adjustable costs back if the device can't hold a
   * decent frame rate: bloom first, then resolution. Geometry budgets are fixed
   * at startup by the tier, since changing those means reallocating buffers.
   *
   * One-way. Re-enabling on a recovered average would just oscillate.
   */
  _watchPerformance(dt) {
    if (this._step >= 2) return;

    this._sampleTime += dt;
    this._sampleFrames++;
    if (this._sampleTime < 3) return;

    const averageFrameMs = (this._sampleTime / this._sampleFrames) * 1000;
    if (averageFrameMs > CONFIG.bloomDropFrameMs) {
      if (this._step === 0 && this.bloomEnabled) {
        this.setBloomEnabled(false);
      } else {
        const ratio = Math.max(1, this.renderer.getPixelRatio() * 0.75);
        this.renderer.setPixelRatio(ratio);
        this.setSize(window.innerWidth, window.innerHeight);
      }
      this._step++;
    }
    this._sampleTime = 0;
    this._sampleFrames = 0;
  }

  render() {
    this.composer.render();
  }
}

function normalisedTint(color, out) {
  const peak = Math.max(color.r, color.g, color.b, 0.0001);
  out.set(color.r / peak, color.g / peak, color.b / peak);
  return out;
}
