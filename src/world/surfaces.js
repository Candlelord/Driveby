import * as THREE from 'three';

/**
 * Procedural surface textures.
 *
 * Realism at road-trip distances is mostly micro-detail: aggregate in the
 * asphalt, polished tyre lines down each lane, gravel on the verge, grain in
 * the soil, bark on a trunk and individual leaves in a canopy. All of it is
 * generated here at startup from tileable noise, so the game still ships with
 * no binary assets and every surface keeps taking its colour from the live
 * mood/set palette — the maps are near-white albedo that the material colour
 * multiplies, plus normal and roughness maps that do not care about colour.
 *
 * Sizes follow the quality tier through `setSurfaceSize()`, called once from
 * main.js before any material is built.
 */

let SIZE = 512;
const cache = new Map();

export function setSurfaceSize(size) {
  SIZE = size;
}

function cached(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

// --- tileable noise ---------------------------------------------------------

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Value noise on a lattice of `period` cells that wraps, so tiles join. */
function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Fractal noise over a unit tile. `u`, `v` in [0, 1); `base` is the lattice
 * period of the first octave, doubled each octave so every one still tiles.
 */
function fbm(u, v, base, octaves, seed, gain = 0.5) {
  let total = 0;
  let amplitude = 1;
  let norm = 0;
  let period = base;
  for (let o = 0; o < octaves; o++) {
    total += valueNoise(u * period, v * period, period, seed + o * 17) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    period *= 2;
  }
  return total / norm;
}

// --- texture assembly -------------------------------------------------------

function dataTexture(data, size, { srgb = false, repeat = true } = {}) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Grey (or tinted) albedo from a [0, 1] field. */
function albedoFrom(field, size, tint = [1, 1, 1]) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = Math.max(0, Math.min(1, field[i]));
    data[i * 4] = Math.round(value * tint[0] * 255);
    data[i * 4 + 1] = Math.round(value * tint[1] * 255);
    data[i * 4 + 2] = Math.round(value * tint[2] * 255);
    data[i * 4 + 3] = 255;
  }
  return dataTexture(data, size, { srgb: true });
}

/** Roughness is read from the green channel. */
function roughnessFrom(field, size) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = Math.round(Math.max(0, Math.min(1, field[i])) * 255);
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return dataTexture(data, size);
}

/** Tangent-space normal map from a wrapping height field. */
function normalFrom(height, size, strength) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((dy / len * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, size);
}

function field(size, fn) {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) out[y * size + x] = fn(x / size, y / size, x, y);
  }
  return out;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// --- surfaces ---------------------------------------------------------------

/**
 * Asphalt, mapped once across the full carriageway (u: 0 at the left edge
 * line, 1 at the right) and repeating along the road.
 *
 * Aggregate speckle and a low hum of patching give it grain; the polished,
 * darker strips are the two wheel tracks in each lane, which is the detail that
 * makes a road read as *driven on* rather than as a grey plane. The same strips
 * are smoother in the roughness map, so a wet road shines first where the tyres
 * run, as it does.
 */
export function asphaltMaps() {
  return cached('asphalt', () => {
    const size = SIZE;
    const tracks = [-4.0, -1.8, 1.8, 4.0]; // metres from centre, half-width 5.7
    const halfWidth = 5.7;

    const wear = field(size, (u) => {
      const w = (u - 0.5) * 2 * halfWidth;
      let m = 0;
      for (const t of tracks) m = Math.max(m, 1 - smoothstep(0.25, 0.75, Math.abs(w - t)));
      return m;
    });

    // Fine aggregate (a few pixels across), over a very gentle undulation —
    // anything coarser reads as orange peel rather than as a road.
    const height = field(size, (u, v, x, y) => {
      const grain = hash2(x, y, 3);
      const stones = fbm(u, v, 160, 2, 11);
      const swell = fbm(u, v, 12, 3, 12);
      return grain * 0.3 + stones * 0.5 + swell * 0.2;
    });

    const albedo = field(size, (u, v, x, y) => {
      const i = y * size + x;
      const patch = fbm(u, v, 3, 4, 5); // repairs and old resurfacing
      const speck = hash2(x, y, 9);
      let value = 0.78 + (patch - 0.5) * 0.18 + (height[i] - 0.5) * 0.16;
      if (speck > 0.985) value += 0.16; // pale aggregate catching the light
      else if (speck < 0.02) value -= 0.12;
      value -= wear[i] * 0.07;
      // A faint oily centre stripe down each lane.
      const w = (u - 0.5) * 2 * halfWidth;
      value -= (1 - smoothstep(0.1, 0.6, Math.abs(Math.abs(w) - 2.9))) * 0.04;
      return value;
    });

    const roughness = field(size, (u, v, x, y) => {
      const i = y * size + x;
      return 0.92 - wear[i] * 0.22 - (1 - height[i]) * 0.08;
    });

    return {
      map: albedoFrom(albedo, size),
      roughnessMap: roughnessFrom(roughness, size),
      normalMap: normalFrom(height, size, 1.6),
    };
  });
}

/** Loose gravel and packed dirt for the shoulders. */
export function gravelMaps() {
  return cached('gravel', () => {
    const size = Math.max(128, SIZE / 2);
    const height = field(size, (u, v, x, y) => {
      // Cellular-ish pebbles: bright where a jittered noise peaks.
      const n = fbm(u, v, 48, 2, 21);
      return smoothstep(0.45, 0.75, n) * 0.7 + hash2(x, y, 4) * 0.3;
    });
    const albedo = field(size, (u, v, x, y) => {
      const i = y * size + x;
      return 0.74 + (height[i] - 0.5) * 0.4 + (fbm(u, v, 4, 3, 8) - 0.5) * 0.15;
    });
    return {
      map: albedoFrom(albedo, size),
      normalMap: normalFrom(height, size, 3.5),
    };
  });
}

/** Paint that has had a few winters: speckled loss and a slightly dirty edge. */
export function paintMap() {
  return cached('paint', () => {
    const size = Math.max(128, SIZE / 4);
    const albedo = field(size, (u, v, x, y) => {
      const loss = fbm(u, v, 16, 3, 31);
      return 0.92 - smoothstep(0.62, 0.8, loss) * 0.45 - hash2(x, y, 2) * 0.06;
    });
    return albedoFrom(albedo, size);
  });
}

/**
 * Ground detail: a soft mottle of soil, clumps and stones under whatever colour
 * the set paints the land. Neutral enough to read as grass, sand or snow
 * depending on the tint.
 */
export function groundMaps() {
  return cached('ground', () => {
    const size = SIZE;
    const height = field(size, (u, v, x, y) => {
      const clumps = fbm(u, v, 12, 4, 41);
      const blades = hash2(x, y, 6);
      return clumps * 0.7 + blades * 0.3;
    });
    const albedo = field(size, (u, v, x, y) => {
      const i = y * size + x;
      const patches = fbm(u, v, 4, 3, 42);
      return 0.8 + (height[i] - 0.5) * 0.28 + (patches - 0.5) * 0.2;
    });
    return {
      map: albedoFrom(albedo, size),
      normalMap: normalFrom(height, size, 2.6),
    };
  });
}

/** Low-frequency variation sampled at a second scale to break tiling up. */
export function macroMap() {
  return cached('macro', () => {
    const size = 256;
    const albedo = field(size, (u, v) => 0.5 + (fbm(u, v, 3, 5, 77) - 0.5) * 1.6);
    const texture = albedoFrom(albedo, size);
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
  });
}

/** Bark: vertical fissures, wrapped round a trunk by the cylinder's UVs. */
export function barkMaps() {
  return cached('bark', () => {
    const size = Math.max(128, SIZE / 2);
    const height = field(size, (u, v) => {
      // Stretch the noise along the trunk so ridges run vertically.
      const ridges = fbm(u, v * 0.25, 10, 4, 51);
      const fissure = Math.abs(Math.sin((u * 14 + ridges * 3) * Math.PI));
      return fissure * 0.65 + ridges * 0.35;
    });
    const albedo = field(size, (u, v, x, y) => 0.55 + height[y * size + x] * 0.45);
    return {
      map: albedoFrom(albedo, size),
      normalMap: normalFrom(height, size, 4.0),
    };
  });
}

/** Rock: lumpy, cracked, and rough. */
export function rockMaps() {
  return cached('rock', () => {
    const size = Math.max(128, SIZE / 2);
    const height = field(size, (u, v) => {
      const lumps = fbm(u, v, 6, 5, 61);
      const cracks = 1 - smoothstep(0.0, 0.05, Math.abs(fbm(u, v, 5, 3, 62) - 0.5));
      return lumps - cracks * 0.3;
    });
    const albedo = field(size, (u, v, x, y) => 0.68 + height[y * size + x] * 0.3 + (hash2(x, y, 3) - 0.5) * 0.08);
    return {
      map: albedoFrom(albedo, size),
      normalMap: normalFrom(height, size, 3.0),
    };
  });
}

// --- alpha cards ------------------------------------------------------------

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A deterministic PRNG so cards come out the same every load. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A spray of broad leaves. Grey-green values so the set's foliage colour
 * multiplies through; darker toward the centre, where a real cluster is
 * self-shadowed.
 */
export function leafCard() {
  return cached('leaf', () =>
    canvasTexture(256, (ctx, size) => {
      const random = rng(7);
      const half = size / 2;
      // Twigs underneath.
      ctx.strokeStyle = 'rgb(80,70,60)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = random() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(half, half);
        ctx.lineTo(half + Math.cos(a) * half * 0.8, half + Math.sin(a) * half * 0.8);
        ctx.stroke();
      }
      for (let i = 0; i < 150; i++) {
        const r = Math.sqrt(random()) * half * 0.82;
        const a = random() * Math.PI * 2;
        const x = half + Math.cos(a) * r;
        const y = half + Math.sin(a) * r;
        const shade = 150 + random() * 95 - (1 - r / half) * 60;
        const g = Math.round(shade);
        ctx.fillStyle = `rgb(${Math.round(g * 0.94)},${g},${Math.round(g * 0.86)})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(random() * Math.PI * 2);
        ctx.beginPath();
        const length = 9 + random() * 8;
        ctx.ellipse(0, 0, length, length * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
        // Midrib catches the light.
        ctx.strokeStyle = `rgba(255,255,255,0.18)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-length, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();
        ctx.restore();
      }
    })
  );
}

/**
 * A drooping conifer bough, as a dense filled spray rather than individual
 * needles: thin strokes vanish under alpha testing once the texture mips down,
 * leaving a tree that is all core. The silhouette is ragged with needle tips,
 * the interior is mottled and darker toward the twig.
 */
export function needleCard() {
  return cached('needle', () =>
    canvasTexture(256, (ctx, size) => {
      const random = rng(13);
      const mid = size / 2;
      // Sub-sprays fanning down from the top centre.
      for (let spray = 0; spray < 7; spray++) {
        const angle = -0.9 + (spray / 6) * 1.8 + (random() - 0.5) * 0.2;
        const length = size * (0.62 + random() * 0.32);
        const tipX = mid + Math.sin(angle) * length * 0.62;
        const tipY = Math.cos(angle) * length;
        for (let i = 0; i < 140; i++) {
          const t = random();
          const x = mid + (tipX - mid) * t + (random() - 0.5) * 6;
          const y = tipY * t;
          const width = (1 - t * 0.7) * 26;
          const side = random() < 0.5 ? -1 : 1;
          const g = Math.round(110 + random() * 120 - (1 - t) * 30);
          ctx.strokeStyle = `rgb(${Math.round(g * 0.88)},${g},${Math.round(g * 0.86)})`;
          ctx.lineWidth = 2.6 + random() * 1.8;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + side * width * (0.5 + random() * 0.5), y + 5 + random() * 9);
          ctx.stroke();
        }
      }
    })
  );
}

/**
 * A grass tuft: tapered blades, darker at the root where they shade each other.
 * Drawn bottom-up so v = 0 is the ground.
 */
export function grassCard() {
  return cached('grass', () =>
    canvasTexture(128, (ctx, size) => {
      const random = rng(29);
      for (let i = 0; i < 46; i++) {
        const x = size * (0.08 + random() * 0.84);
        const h = size * (0.45 + random() * 0.53);
        const lean = (random() - 0.5) * size * 0.35;
        const w = 1.6 + random() * 2.2;
        const gradient = ctx.createLinearGradient(0, size, 0, size - h);
        const top = Math.round(190 + random() * 65);
        gradient.addColorStop(0, 'rgb(128,128,112)');
        gradient.addColorStop(1, `rgb(${top},${top},${Math.round(top * 0.88)})`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x - w, size);
        ctx.quadraticCurveTo(x + lean * 0.3, size - h * 0.6, x + lean, size - h);
        ctx.quadraticCurveTo(x + lean * 0.3 + w * 0.3, size - h * 0.6, x + w, size);
        ctx.closePath();
        ctx.fill();
      }
    })
  );
}

/** A palm frond: a midrib with long leaflets either side. */
export function frondCard() {
  return cached('frond', () =>
    canvasTexture(256, (ctx, size) => {
      const random = rng(37);
      const mid = size / 2;
      ctx.strokeStyle = 'rgb(150,140,110)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mid, 0);
      ctx.lineTo(mid, size);
      ctx.stroke();
      for (let i = 0; i < 46; i++) {
        const y = (i / 46) * size;
        const reach = Math.sin((i / 46) * Math.PI) * mid * 0.95 + 10;
        for (const side of [-1, 1]) {
          const g = Math.round(150 + random() * 90);
          ctx.strokeStyle = `rgb(${Math.round(g * 0.9)},${g},${Math.round(g * 0.85)})`;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(mid, y);
          ctx.quadraticCurveTo(mid + side * reach * 0.5, y + 4, mid + side * reach, y + 18 + random() * 8);
          ctx.stroke();
        }
      }
    })
  );
}

/**
 * Break up visible tiling by multiplying the albedo with a second, much larger
 * sample of a low-frequency map. `scale` is how many detail tiles one macro
 * tile spans (along each axis); `amount` how hard it modulates.
 */
export function withMacroVariation(material, scale, amount) {
  const macro = macroMap();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.macroMap = { value: macro };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D macroMap;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float macroA = texture2D( macroMap, vMapUv * ${glsl(1 / scale[0])} * vec2( 1.0, ${glsl(scale[0] / scale[1])} ) ).r;
        float macroB = texture2D( macroMap, vMapUv * ${glsl(0.37 / scale[0])} * vec2( 1.0, ${glsl(scale[0] / scale[1])} ) + 0.31 ).r;
        diffuseColor.rgb *= 1.0 + ( macroA * 0.6 + macroB * 0.4 - 0.5 ) * ${glsl(amount * 2)};`
      );
  };
  material.customProgramCacheKey = () => `macro-${scale[0]}-${scale[1]}-${amount}`;
  return material;
}

function glsl(value) {
  const s = String(Number(value.toFixed(6)));
  return s.includes('.') || s.includes('e') ? s : s + '.0';
}

/**
 * Foliage cards are double-sided, and three flips a double-sided surface's
 * normal on its back face — which on a card whose normals deliberately point
 * up or out of the crown turns half the leaves black. Keep the authored normal
 * on both faces.
 */
export function keepCardNormals(material) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      'float faceDirection = 1.0;\n' +
        THREE.ShaderChunk.normal_fragment_begin.replace(
          'float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;',
          ''
        )
    );
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `cards-${key ? key() : ''}`;
  return material;
}
