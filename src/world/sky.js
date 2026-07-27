import * as THREE from 'three';
import { softDotTexture } from './textures.js';

// The dome is centred on the camera, so a vertex's local position *is* the
// view direction — expressed in the sky group's own frame, which is the frame
// the sun direction is authored in. No world-space round trip needed.
const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Three-stop vertical gradient plus two things that do most of the atmospheric
 * work: a glow band pinned to the horizon, and a broad scattering halo around
 * the sun direction. Both are far cheaper and better-behaved than stacking
 * transparent quads in front of the dome.
 */
const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform vec3 sunDirection;
  uniform vec3 sunGlowColor;
  uniform vec3 cloudColor;
  uniform vec3 cloudLitColor;
  uniform float sunGlowStrength;
  uniform float sunGlowPower;
  uniform float horizonStrength;
  uniform float horizonWidth;
  uniform float cloudAmount;
  uniform float cloudSharpness;
  uniform float time;
  uniform float drift;

  varying vec3 vDirection;

  // --- value noise + fbm, enough for a cloud deck and cheap enough for mobile
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      total += noise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return total;
  }

  void main() {
    vec3 direction = normalize(vDirection);
    float height = direction.y;

    vec3 sky = mix(bottomColor, topColor, smoothstep(-0.05, 0.62, height));

    // Glow band centred on the horizon line.
    float band = exp(-abs(height) / max(horizonWidth, 0.001));
    sky = mix(sky, horizonColor, band * horizonStrength);

    // --- cloud deck.
    //
    // Projected onto a flat plane above the camera rather than onto the sphere,
    // so cells stretch toward the horizon the way real cloud cover does instead
    // of ringing the dome evenly. Two layers at different speeds give depth.
    if (cloudAmount > 0.001 && height > 0.005) {
      vec2 plane = direction.xz / max(height, 0.02);
      vec2 scroll = vec2(drift * 0.03, drift * 0.012 + time * 0.004);

      float base = fbm(plane * 0.55 + scroll);
      float detail = fbm(plane * 1.7 - scroll * 1.9);
      float density = base * 0.72 + detail * 0.28;

      // Sharpness turns the same field from haze into distinct cumulus.
      float cover = smoothstep(0.62 - cloudAmount * 0.36, 0.62 - cloudAmount * 0.36 + cloudSharpness, density);
      // Fade the deck out at the horizon so it does not form a hard ring.
      cover *= smoothstep(0.0, 0.22, height);

      // Light the tops from the sun side.
      float toSunFlat = max(dot(normalize(direction), normalize(sunDirection)), 0.0);
      vec3 cloud = mix(cloudColor, cloudLitColor, pow(toSunFlat, 2.0) * 0.85 + detail * 0.25);
      sky = mix(sky, cloud, cover * cloudAmount);
    }

    // Scattering around the sun, strongest when looking straight at it.
    float toSun = max(dot(direction, normalize(sunDirection)), 0.0);
    sky += sunGlowColor * pow(toSun, sunGlowPower) * sunGlowStrength;

    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

const RIDGE_NEAR_RADIUS = 560;
const RIDGE_FAR_RADIUS = 700;

/**
 * Everything beyond the fog: dome, sun/moon, stars and distant ridges. All of
 * it hangs off a group that rides with the camera and counter-rotates with the
 * road heading, so the sky stays world-fixed while the car turns underneath it.
 */
export class Sky {
  constructor(scene, tier) {
    this.starCount = tier.stars;
    this.ridgeSegments = tier.ridgeSegments;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.domeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color() },
        horizonColor: { value: new THREE.Color() },
        bottomColor: { value: new THREE.Color() },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        sunGlowColor: { value: new THREE.Color() },
        sunGlowStrength: { value: 0 },
        sunGlowPower: { value: 8 },
        horizonStrength: { value: 0 },
        horizonWidth: { value: 0.2 },
        cloudColor: { value: new THREE.Color() },
        cloudLitColor: { value: new THREE.Color() },
        cloudAmount: { value: 0 },
        cloudSharpness: { value: 0.22 },
        time: { value: 0 },
        drift: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 18), this.domeMaterial);
    this.dome.renderOrder = -4;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this._buildStars();
    this._buildRidges();

    this.discMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: softDotTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });

    // Three layers make a convincing sun: a hard core disc, a soft additive
    // halo with no rim of its own, and the dome's broad scattering behind both.
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });

    this.core = new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.coreMaterial);
    this.core.renderOrder = -1;
    this.core.frustumCulled = false;
    this.group.add(this.core);

    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32), this.discMaterial);
    this.disc.renderOrder = -1;
    this.disc.frustumCulled = false;
    this.group.add(this.disc);

    this.sunDirection = new THREE.Vector3(0, 1, 0);
    this._discPosition = new THREE.Vector3();
  }

  _buildStars() {
    const count = this.starCount;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Upper hemisphere only — anything below the horizon is behind terrain.
      const theta = Math.random() * Math.PI * 2;
      const y = 0.06 + Math.random() * 0.94;
      const r = Math.sqrt(1 - y * y);
      positions[i * 3] = Math.cos(theta) * r * 820;
      positions[i * 3 + 1] = y * 820;
      positions[i * 3 + 2] = Math.sin(theta) * r * 820;
      sizes[i] = 3 + Math.random() * 9;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      map: softDotTexture(),
      size: 7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });

    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.stars.renderOrder = -3;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
  }

  /**
   * Two rings of silhouette hills sitting outside the fog. Distant landforms
   * are what tell you the world continues past the visible road — without them
   * the fog just reads as an empty wall.
   */
  _buildRidges() {
    this.ridges = [];

    const layers = [
      { radius: RIDGE_FAR_RADIUS, amplitude: 46, base: -12, seed: 3.1, drift: 0.00022 },
      { radius: RIDGE_NEAR_RADIUS, amplitude: 62, base: -26, seed: 8.7, drift: 0.00045 },
    ];

    for (const layer of layers) {
      const positions = new Float32Array((this.ridgeSegments + 1) * 2 * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const indices = [];
      for (let i = 0; i < this.ridgeSegments; i++) {
        const a = i * 2;
        indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
      geometry.setIndex(indices);
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RIDGE_FAR_RADIUS * 1.5);

      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = -2;
      mesh.frustumCulled = false;
      this.group.add(mesh);

      this.ridges.push({ ...layer, geometry, positions, material });
    }
  }

  _updateRidges(state) {
    const live = state.live;

    for (let l = 0; l < this.ridges.length; l++) {
      const ridge = this.ridges[l];
      // Nearer layers slide past faster, which reads as parallax depth even
      // though both rings are effectively at infinity.
      const phase = state.travelled * ridge.drift;
      let p = 0;

      for (let i = 0; i <= this.ridgeSegments; i++) {
        const angle = (i / this.ridgeSegments) * Math.PI * 2;
        const x = Math.cos(angle) * ridge.radius;
        const z = Math.sin(angle) * ridge.radius;

        const n =
          Math.sin(angle * 3 + phase * 7 + ridge.seed) * 0.5 +
          Math.sin(angle * 7.3 - phase * 11 + ridge.seed * 2) * 0.3 +
          Math.sin(angle * 13.7 + phase * 17) * 0.2;
        const height = ridge.base + (n * 0.5 + 0.5) * ridge.amplitude * live.ridgeHeight;

        ridge.positions[p++] = x;
        ridge.positions[p++] = height;
        ridge.positions[p++] = z;
        ridge.positions[p++] = x;
        ridge.positions[p++] = -160;
        ridge.positions[p++] = z;
      }

      ridge.geometry.attributes.position.needsUpdate = true;
      // Ridges sit outside the fog, so they have to be hazed by hand — without
      // this they read as flat cut-out bands rather than distance.
      // Thicker air hazes distant landforms harder — without tying this to fog
      // density, ridges stay crisp in weather that has swallowed everything else.
      const haze = l === 0 ? 0.45 + live.fogDensity * 25 : 0.22 + live.fogDensity * 20;
      ridge.material.color
        .copy(l === 0 ? live.ridgeFarColor : live.ridgeNearColor)
        .lerp(live.fogColor, Math.min(haze, 0.92));
      ridge.material.opacity = live.ridgeOpacity * (l === 0 ? 0.75 : 1);
      ridge.material.visible = live.ridgeOpacity > 0.01;
    }
  }

  update(state, camera) {
    const live = state.live;
    const uniforms = this.domeMaterial.uniforms;

    uniforms.topColor.value.copy(live.skyTop);
    uniforms.horizonColor.value.copy(live.skyHorizon);
    uniforms.bottomColor.value.copy(live.skyBottom);
    uniforms.sunGlowColor.value.copy(live.sunGlowColor);
    uniforms.sunGlowStrength.value = live.sunGlowStrength;
    uniforms.sunGlowPower.value = live.sunGlowPower;
    uniforms.horizonStrength.value = live.horizonStrength;
    uniforms.horizonWidth.value = live.horizonWidth;
    uniforms.cloudColor.value.copy(live.cloudColor);
    uniforms.cloudLitColor.value.copy(live.cloudLitColor);
    uniforms.cloudAmount.value = live.cloudAmount;
    uniforms.cloudSharpness.value = live.cloudSharpness;
    uniforms.time.value = state.time;
    // Clouds drift with distance travelled, not just time, so they slide past
    // as you drive rather than only churning in place.
    uniforms.drift.value = state.travelled * 0.0006;

    // Ride with the camera, counter-rotate with the road so the sky is world-fixed.
    this.group.position.copy(camera.position);
    this.group.rotation.y = state.heading;

    const azimuth = live.sunAzimuth;
    const elevation = live.sunElevation;
    const cosElevation = Math.cos(elevation);
    this.sunDirection
      .set(Math.sin(azimuth) * cosElevation, Math.sin(elevation), -Math.cos(azimuth) * cosElevation)
      .normalize();
    uniforms.sunDirection.value.copy(this.sunDirection);

    this._discPosition.copy(this.sunDirection).multiplyScalar(760);

    this.core.position.copy(this._discPosition);
    this.core.scale.setScalar(live.discSize);
    this.core.lookAt(this.group.position);
    // Driven past 1.0 so the disc has headroom for bloom to pick up.
    this.coreMaterial.color.copy(live.discColor).multiplyScalar(live.discIntensity);
    this.coreMaterial.opacity = live.discOpacity;
    this.core.visible = live.discOpacity > 0.01;

    this.disc.position.copy(this._discPosition).multiplyScalar(0.99);
    this.disc.scale.setScalar(live.discSize * 4.5);
    this.disc.quaternion.copy(this.core.quaternion);
    this.discMaterial.color.copy(live.sunGlowColor);
    this.discMaterial.opacity = live.discOpacity * 0.5;
    this.disc.visible = this.core.visible;

    // A slow collective shimmer. Per-star twinkle would need a custom shader;
    // this reads as atmosphere for one multiply.
    const twinkle = 0.92 + 0.08 * Math.sin(state.time * 2.3);
    const stars = (live.starOpacityFinal ?? live.starOpacity) * twinkle;
    this.starMaterial.color.copy(live.starColor);
    this.starMaterial.opacity = stars;
    this.stars.visible = stars > 0.01;

    this._updateRidges(state);
  }
}
