import * as THREE from 'three';
import { asphaltMaps, gravelMaps, groundMaps } from '../world/surfaces.js';
import { applyRoadWear } from './roadWear.js';

/**
 * Shared materials for the open world: ground, roads, buildings, water.
 *
 * Buildings carry everything per vertex — wall colour, a seed, a window style —
 * so a whole chunk of them is one draw call, and the windows are drawn in the
 * fragment shader in real metres (the walls' UVs are metres along and up).
 */

export const NIGHT = { value: 0 };
export const WATER_TIME = { value: 0 };
const WARM = new THREE.Color(1.0, 0.74, 0.44);

let cache = null;

export function worldMaterials() {
  if (cache) return cache;

  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, ...pick(groundMaps(), ['map', 'normalMap']) });
  if (ground.map) {
    ground.map.wrapS = ground.map.wrapT = THREE.RepeatWrapping;
  }
  if (ground.normalMap) ground.normalScale.set(0.6, 0.6);

  const asphalt = asphaltMaps();
  const road = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9, metalness: 0, map: asphalt.map, roughnessMap: asphalt.roughnessMap, normalMap: asphalt.normalMap, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  road.normalScale.set(0.3, 0.3);
  applyRoadWear(road);
  const gravel = gravelMaps();
  const dirt = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98, metalness: 0, map: gravel.map, normalMap: gravel.normalMap, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  dirt.normalScale.set(0.9, 0.9);

  const marking = new THREE.MeshBasicMaterial({ color: 0xffffff, map: dashTexture(), alphaTest: 0.5, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
  const markingSolid = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9c9890, roughness: 0.9, metalness: 0 });

  const water = new THREE.MeshStandardMaterial({ color: 0x2d5566, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.92 });
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = WATER_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterWorld = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWaterTime;\nvarying vec2 vWaterWorld;')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        float rippleA = dot(vWaterWorld, vec2(0.65, 0.38)) + uWaterTime * 0.9;
        float rippleB = dot(vWaterWorld, vec2(-0.31, 0.84)) - uWaterTime * 0.65;
        vec3 ripple = vec3(cos(rippleA) * 0.075 - cos(rippleB) * 0.025, 0.0,
          cos(rippleA) * 0.04 + cos(rippleB) * 0.065);
        normal = normalize(normal + mat3(viewMatrix) * ripple);`);
  };
  water.customProgramCacheKey = () => 'lagoon-ripples-v1';

  const buildings = buildingMaterial();
  const thatch = new THREE.MeshStandardMaterial({ color: 0xb59a5c, roughness: 1, metalness: 0, vertexColors: false });

  cache = { ground, road, dirt, marking, markingSolid, concrete, water, buildings, thatch };
  return cache;
}

function pick(object, keys) {
  const out = {};
  for (const k of keys) if (object[k]) out[k] = object[k];
  return out;
}

function dashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 4, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Walls and roofs. Attributes: `color` (paint), `aStyle` (0 house, 1 office,
 * 2 industrial, 3 mud, 4 blank wall, 9 roof), `aSeed` (0..1 per building).
 * UVs are metres: u along the wall, v up it.
 */
function buildingMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = NIGHT;
    shader.uniforms.uWarm = { value: WARM };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aStyle;\nattribute float aSeed;\nvarying float vStyle;\nvarying float vSeed;\nvarying vec2 vWall;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStyle = aStyle;\nvSeed = aSeed;\nvWall = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uNight;
        uniform vec3 uWarm;
        varying float vStyle;
        varying float vSeed;
        varying vec2 vWall;
        float bHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float bNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), f.x),
            mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0)), f.x), f.y);
        }`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float bWin = 0.0;
        float bLit = 0.0;
        if (vStyle < 3.5) {
          vec2 bay = vStyle < 0.5 ? vec2(3.6, 3.2) : vStyle < 1.5 ? vec2(2.2, 3.6) : vStyle < 2.5 ? vec2(7.0, 9.0) : vec2(4.5, 3.0);
          vec2 cell = vWall / bay;
          vec2 f = fract(cell);
          vec2 id = floor(cell) + floor(vSeed * 97.0);
          if (vStyle < 0.5) {
            // Houses and flats: a window in each bay, a door or shutter at the bottom.
            bWin = step(0.24, f.x) * step(f.x, 0.76) * step(0.34, f.y) * step(f.y, 0.82);
            if (cell.y < 1.0) bWin *= step(0.5, bHash(id + 3.1));
            diffuseColor.rgb *= 1.0 - 0.18 * step(f.y, 0.06);
          } else if (vStyle < 1.5) {
            // Offices and towers: a curtain wall of glass between slab lines.
            bWin = step(0.05, f.x) * step(f.x, 0.95) * step(0.14, f.y) * step(f.y, 0.92);
          } else if (vStyle < 2.5) {
            // Sheds: one band of high windows.
            bWin = step(0.1, f.x) * step(f.x, 0.9) * step(0.62, f.y) * step(f.y, 0.8) * step(cell.y, 1.0);
          } else {
            // Mud brick: small deep windows, few of them.
            bWin = step(0.42, f.x) * step(f.x, 0.58) * step(0.45, f.y) * step(f.y, 0.65) * step(bHash(id), 0.4);
          }
          bLit = step(bHash(id * 1.7 + 11.0), vStyle < 1.5 ? 0.45 : 0.3) * bWin;
          vec3 glass = mix(vec3(0.07, 0.09, 0.11), vec3(0.2, 0.28, 0.34), vStyle > 0.5 && vStyle < 1.5 ? 0.7 : 0.15);
          // A darker recess under the lintel and varied reflected sky per pane.
          glass *= 0.65 + 0.45 * smoothstep(0.35, 0.7, f.y) + bHash(id + 6.0) * 0.2;
          glass += vec3(0.045, 0.055, 0.065) * smoothstep(0.3, 0.9, f.y);
          float curtain = step(0.66, bHash(id + 4.7)) * step(vStyle, 0.5);
          glass = mix(glass, vec3(0.28, 0.24, 0.18) * (0.8 + 0.2 * sin(f.x * 65.0)), curtain * 0.6);
          float mullion = 1.0 - smoothstep(0.009, 0.022, abs(f.x - 0.5));
          glass = mix(glass, vec3(0.36, 0.36, 0.32), mullion * 0.75);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, bWin);
        }
        // Grime at the foot of the walls, and a little patchiness everywhere.
        float wear = bNoise(vWall * vec2(0.7, 0.19) + vSeed * 43.0);
        float grain = bNoise(vWall * 35.0 + vSeed * 71.0);
        if (vStyle < 8.5) {
          // Damp rising from the pavement, runoff streaks and uneven plaster.
          float damp = 1.0 - smoothstep(0.1, 1.8 + wear * 1.1, vWall.y);
          diffuseColor.rgb *= 1.0 - damp * 0.25;
          diffuseColor.rgb *= 0.91 + wear * 0.13 + grain * 0.035;
          float runoff = smoothstep(0.64, 0.86, bNoise(vec2(vWall.x * 4.0, vSeed * 39.0)));
          diffuseColor.rgb *= 1.0 - runoff * (0.04 + wear * 0.08) * (1.0 - bWin);
        } else {
          // Roof seams and mottled patches replace the solid grey cap.
          float seam = 1.0 - smoothstep(0.015, 0.05, min(fract(vWall.x * 0.85), 1.0 - fract(vWall.x * 0.85)));
          diffuseColor.rgb *= 0.83 + wear * 0.22 + grain * 0.035 - seam * 0.1;
        }`
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, bWin);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uWarm * bLit * uNight * 1.6;');
  };
  material.customProgramCacheKey = () => 'open-buildings-depth-v2';
  return material;
}
