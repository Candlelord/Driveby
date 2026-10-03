import * as THREE from 'three';

/**
 * The city at night.
 *
 * A dark box with one neon stripe round it is a building in a game; a building
 * in a photograph is a grid of windows, some lit and most not, in a scatter of
 * warm tungsten and cool LED, over a ground floor of bright shopfronts. All of
 * that is generated in the fragment shader from the box's own position scaled
 * by its instance transform, so stretched boxes of any size get windows of a
 * real size (about 3.2 m bays, 3.6 m floors) and no texture is needed.
 *
 * Which windows are lit comes from a per-instance seed — the instance colour's
 * red channel, which the scatter already sets from a hash of the slot — so a
 * building keeps the same pattern of lights as it drives past instead of
 * reshuffling every frame as the world scrolls.
 *
 * Billboards get a generated atlas of invented ads, one cell per board.
 */

export const CITY_UNIFORMS = {
  uNight: { value: 0 },
  uWarm: { value: new THREE.Color(1.0, 0.72, 0.42) },
  uCool: { value: new THREE.Color(0.62, 0.8, 1.0) },
  uShop: { value: new THREE.Color(1, 0.3, 0.6) },
};

const SEED_VERTEX = /* glsl */ `
  #ifdef USE_INSTANCING
    vec3 cityScale = vec3(
      length(instanceMatrix[0].xyz),
      length(instanceMatrix[1].xyz),
      length(instanceMatrix[2].xyz)
    );
  #else
    vec3 cityScale = vec3(1.0);
  #endif
  #ifdef USE_INSTANCING_COLOR
    vCitySeed = instanceColor.r;
  #else
    vCitySeed = 0.5;
  #endif
`;

/**
 * Windows on a stretched unit box. `bay` is window spacing in metres
 * (width, floor height); `industrial` gives a warehouse's single high band of
 * clerestory glazing instead of a full grid.
 */
export function facadeMaterial({ bay = [3.2, 3.6], litFraction = 0.42, industrial = false } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.08 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CITY_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFacade;\nvarying float vCitySeed;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${SEED_VERTEX}
        float facing = abs(normal.x) > 0.5 ? 1.0 : 0.0;
        // Along-face distance in metres; the side offset stops opposite faces
        // sharing a pattern.
        float across = mix(position.x * cityScale.x, position.z * cityScale.z + 17.0, facing);
        vFacade = vec3(across, position.y * cityScale.y, normal.y > 0.5 ? 1.0 : 0.0);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFacade;
        varying float vCitySeed;
        uniform float uNight;
        uniform vec3 uWarm;
        uniform vec3 uCool;
        uniform vec3 uShop;
        float cityHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 bayUv = vFacade.xy / vec2(${glsl(bay[0])}, ${glsl(bay[1])});
        vec2 cell = floor(bayUv);
        vec2 f = fract(bayUv);
        float wall = 1.0 - vFacade.z;
        float ground = step(cell.y, 0.5) * ${industrial ? '0.0' : '1.0'};
        ${
          industrial
            ? `float pane = step(0.08, f.x) * step(f.x, 0.92) * step(0.62, f.y) * step(f.y, 0.86);
               // Only the top storey of a shed has glazing.
               pane *= step(1.0, cell.y);`
            : `float pane = step(0.16, f.x) * step(f.x, 0.84) * mix(step(0.26, f.y) * step(f.y, 0.86), step(0.06, f.y) * step(f.y, 0.92), ground);`
        }
        pane *= wall;
        float h = cityHash(cell + vec2(vCitySeed * 97.13, vCitySeed * 41.7));
        float lit = step(1.0 - mix(${glsl(litFraction)}, 0.8, ground), h);
        vec3 tint = mix(uWarm, uCool, step(0.68, fract(h * 7.13)));
        tint = mix(tint, uShop, ground);
        float dim = 0.45 + 0.55 * fract(h * 3.71);
        // Slab edges between floors read darker, glass darker still.
        diffuseColor.rgb *= mix(1.0, 0.72, wall * step(f.y, 0.1) * (1.0 - ground));
        diffuseColor.rgb *= mix(1.0, 0.3, pane);
        vec3 windowGlow = pane * lit * tint * dim * uNight * mix(1.7, 2.6, ground);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.08, pane);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += windowGlow;`
      );
  };
  material.customProgramCacheKey = () => `facade-${bay}-${litFraction}-${industrial}`;
  return material;
}

/** Lit window dots on the distant skyline: an unlit material, so glow only. */
export function skylineWindows(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CITY_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFacade;\nvarying float vCitySeed;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${SEED_VERTEX}
        float facing = abs(normal.x) > 0.5 ? 1.0 : 0.0;
        vFacade = vec3(mix(position.x * cityScale.x, position.z * cityScale.z + 17.0, facing), position.y * cityScale.y, normal.y > 0.5 ? 1.0 : 0.0);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFacade;
        varying float vCitySeed;
        uniform float uNight;
        uniform vec3 uWarm;
        uniform vec3 uCool;
        float cityHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 bayUv = vFacade.xy / vec2(4.0, 4.2);
        vec2 cell = floor(bayUv);
        vec2 f = fract(bayUv);
        float pane = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.8) * (1.0 - vFacade.z);
        float h = cityHash(cell + vCitySeed * 61.3);
        float lit = step(0.62, h);
        diffuseColor.rgb += pane * lit * mix(uWarm, uCool, step(0.7, fract(h * 5.3))) * uNight * 0.55;`
      );
  };
  material.customProgramCacheKey = () => 'skyline-windows';
  return material;
}

/**
 * A billboard face: an unlit screen showing one cell of the ad atlas, chosen
 * by the instance seed.
 */
export function screenMaterial() {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: adAtlas(), fog: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCitySeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SEED_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCitySeed;')
      .replace(
        '#include <map_fragment>',
        `float adCell = floor(fract(vCitySeed * 13.7) * ${ATLAS_COLS * ATLAS_ROWS}.0);
        vec2 adUv = (vMapUv + vec2(mod(adCell, ${ATLAS_COLS}.0), floor(adCell / ${ATLAS_COLS}.0)))
          / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
        diffuseColor *= texture2D(map, adUv);`
      )
      // The instance colour carries the seed; it is not meant as a tint.
      .replace('#include <color_fragment>', '');
  };
  material.customProgramCacheKey = () => 'billboard-screen';
  return material;
}

export function updateCity(live) {
  // Windows come on as the street lamps do; sets without lit props stay dim.
  CITY_UNIFORMS.uNight.value = Math.min(1, live.lampIntensity) * (0.35 + 0.65 * Math.min(1, live.propEmissive));
  CITY_UNIFORMS.uShop.value.copy(live.propE).lerp(CITY_UNIFORMS.uWarm.value, 0.35);
}

// --- ad atlas ---------------------------------------------------------------

const ATLAS_COLS = 2;
const ATLAS_ROWS = 4;
let atlas = null;

// Invented brands only.
const ADS = [
  { bg: ['#ff2f7a', '#5a0f8a'], title: 'AFTER DARK', sub: 'radio 99.4', fg: '#fff2fb' },
  { bg: ['#0bd3ff', '#063a7a'], title: 'NIGHT DRIVE', sub: 'open all hours', fg: '#e8fbff' },
  { bg: ['#ffb627', '#c4370f'], title: 'NOODLE BAR', sub: 'next exit · 24/7', fg: '#2a0d05' },
  { bg: ['#121212', '#3a3a3a'], title: 'LOW/LIGHT', sub: 'new album out now', fg: '#ff4fd8' },
  { bg: ['#7affc8', '#0b6b5a'], title: 'PULSE', sub: 'energy drink', fg: '#062a22' },
  { bg: ['#f4f1ea', '#c9c3b6'], title: 'MOTEL NOVA', sub: 'vacancy', fg: '#d01f3c' },
  { bg: ['#6a3cff', '#120a3a'], title: 'SKYLINE FM', sub: 'the city never sleeps', fg: '#ffe14d' },
  { bg: ['#ff5a36', '#3a0a1a'], title: 'CHROME', sub: 'detailing & tint', fg: '#ffffff' },
];

function adAtlas() {
  if (atlas) return atlas;
  const cellW = 512;
  const cellH = 228;
  const canvas = document.createElement('canvas');
  canvas.width = cellW * ATLAS_COLS;
  canvas.height = cellH * ATLAS_ROWS;
  const ctx = canvas.getContext('2d');

  ADS.forEach((ad, i) => {
    const x = (i % ATLAS_COLS) * cellW;
    // Canvas rows run top-down; texture rows bottom-up, so flip the row.
    const y = (ATLAS_ROWS - 1 - Math.floor(i / ATLAS_COLS)) * cellH;
    const gradient = ctx.createLinearGradient(x, y, x + cellW, y + cellH);
    gradient.addColorStop(0, ad.bg[0]);
    gradient.addColorStop(1, ad.bg[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, cellW, cellH);

    // A bold graphic shape behind the type.
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = ad.fg;
    ctx.beginPath();
    ctx.arc(x + cellW * 0.82, y + cellH * 0.5, cellH * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = ad.fg;
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 64px "Arial Black", Impact, sans-serif';
    ctx.fillText(ad.title, x + 28, y + cellH * 0.42, cellW - 56);
    ctx.font = '600 26px Arial, sans-serif';
    ctx.globalAlpha = 0.85;
    ctx.fillText(ad.sub.toUpperCase(), x + 30, y + cellH * 0.74, cellW - 60);
    ctx.globalAlpha = 1;

    // A thin frame, as printed boards have.
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 6;
    ctx.strokeRect(x + 3, y + 3, cellW - 6, cellH - 6);
  });

  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  return atlas;
}

function glsl(value) {
  const s = String(value);
  return s.includes('.') ? s : s + '.0';
}
