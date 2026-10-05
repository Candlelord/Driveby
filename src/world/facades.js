import * as THREE from 'three';
import manifest from './facade-manifest.json';

/**
 * Baked building facades (see scripts/bake-facades.mjs): a real model's colour,
 * relief and windows, drawn as one textured quad. Materials appear at once and
 * pick their textures up when they arrive, so a street is never invisible
 * while it loads.
 *
 * The flatness of a quad is hidden two ways. A baked height map drives
 * parallax in the fragment shader, so balconies stand off the wall and windows
 * sink into it as the view slides past, and a normal map carries the finer
 * relief under the light. The mansard roof is a second, squashed section of the
 * quad, so a tall roof on a real building does not become half the street.
 */

const loader = new THREE.TextureLoader();
const materials = new Map();

export function facadeSize(name) {
  const [width, height] = manifest[name].size;
  const { roofFrom = 1, roofScale = 1 } = manifest[name];
  return { width, height, roofFrom, roofScale, shownHeight: height * (roofFrom + (1 - roofFrom) * roofScale) };
}

export function facadeMaterial(name) {
  if (materials.has(name)) return materials.get(name);
  const entry = manifest[name];
  const base = `${import.meta.env.BASE_URL}models/facades/`;
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    alphaTest: 0.5,
    emissive: 0xffd9a0,
    emissiveIntensity: 0,
  });
  const load = (file, srgb) => {
    const texture = loader.load(base + file, () => (material.needsUpdate = true));
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 8;
    return texture;
  };
  material.map = load(entry.files.albedo, true);
  material.normalMap = load(entry.files.normal, false);
  material.emissiveMap = load(entry.files.windows, true);
  const height = entry.files.height ? load(entry.files.height, false) : null;
  const [width, tall] = entry.size;
  // How far one metre of depth moves the texture, in uv units per axis.
  const relief = new THREE.Vector2((entry.relief ?? 1.2) / width, (entry.relief ?? 1.2) / tall);

  if (height) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHeight = { value: height };
      shader.uniforms.uRelief = { value: relief };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uHeight;\nuniform vec2 uRelief;')
        .replace(
          '#include <map_fragment>',
          `// Parallax: walk the view ray into the baked depth until it meets the wall.
          vec2 pUv = vMapUv;
          {
            vec3 q0 = dFdx( -vViewPosition );
            vec3 q1 = dFdy( -vViewPosition );
            vec2 st0 = dFdx( vMapUv );
            vec2 st1 = dFdy( vMapUv );
            vec3 N = normalize( vNormal );
            vec3 q1perp = cross( q1, N );
            vec3 q0perp = cross( N, q0 );
            vec3 T = normalize( q1perp * st0.x + q0perp * st1.x );
            vec3 B = normalize( q1perp * st0.y + q0perp * st1.y );
            vec3 V = normalize( vViewPosition );
            vec3 vt = vec3( dot( V, T ), dot( V, B ), dot( V, N ) );
            vec2 step = vt.xy / max( vt.z, 0.22 ) * uRelief / 10.0;
            float depth = 0.0;
            float surface = 1.0 - textureLod( uHeight, pUv, 0.0 ).r;
            for ( int i = 0; i < 10; i ++ ) {
              if ( depth >= surface ) break;
              pUv -= step;
              surface = 1.0 - textureLod( uHeight, pUv, 0.0 ).r;
              depth += 0.1;
            }
          }
          #define vMapUv pUv
          #define vNormalMapUv pUv
          #define vEmissiveMapUv pUv
          #include <map_fragment>`
        );
    };
    material.customProgramCacheKey = () => 'facade-parallax';
  }
  materials.set(name, material);
  return material;
}

/** Per frame: windows light up with the lamps. */
export function updateFacades(live) {
  const glow = Math.min(1, live.lampIntensity * 1.1) * (0.35 + 0.65 * (live.propEmissive ?? 0.6));
  for (const material of materials.values()) material.emissiveIntensity = glow * 0.9;
}

/**
 * A facade as geometry: the wall at full height and, above `roofFrom`, the
 * roof squashed to `roofScale`. UVs keep the texture whole.
 */
function facadeQuad(name, ws, hs, mirror) {
  const { width, height, roofFrom, roofScale } = facadeSize(name);
  const w = width * ws;
  const wallTop = height * roofFrom * hs;
  const top = wallTop + height * (1 - roofFrom) * roofScale * hs;
  const rows = roofFrom < 1 ? [[0, 0], [wallTop, roofFrom], [top, 1]] : [[0, 0], [top, 1]];
  const position = [];
  const uv = [];
  const index = [];
  rows.forEach(([y, v], r) => {
    for (const [x, u] of [[-w / 2, 0], [w / 2, 1]]) {
      position.push(x, y, 0);
      uv.push(mirror ? 1 - u : u, v);
    }
    if (r > 0) {
      const a = (r - 1) * 2;
      index.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(position.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Quads for a run of facades along a street, both sides, as one geometry per
 * baked building. `layout` is [[name, x, side, widthScale, heightScale, mirror]].
 * The building line is `front` from the centreline; a side's buildings face
 * the road. Returns { name: BufferGeometry }.
 */
export function facadeRow(layout, front) {
  const groups = new Map();
  for (const [name, x, side, ws = 1, hs = 1, mirror = false] of layout) {
    const quad = facadeQuad(name, ws, hs, mirror);
    if (side > 0) quad.rotateY(Math.PI);
    quad.translate(side > 0 ? -x : x, 0, side * front);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(quad);
  }
  const out = {};
  for (const [name, list] of groups) out[name] = merge(list);
  return out;
}

function merge(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const index = [];
  let v = 0;
  for (const g of list) {
    position.set(g.attributes.position.array, v * 3);
    normal.set(g.attributes.normal.array, v * 3);
    uv.set(g.attributes.uv.array, v * 2);
    for (const i of g.index.array) index.push(i + v);
    v += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setIndex(index);
  return merged;
}
