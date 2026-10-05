/** Road wear stays anchored in metres as chunks stream in and out. */
export function applyRoadWear(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoadWorld;\nvarying float vRoadAcross;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadWorld = (modelMatrix * vec4(position, 1.0)).xz;\nvRoadAcross = uv.x;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vRoadWorld;
        varying float vRoadAcross;
        float roadHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float roadNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(roadHash(i), roadHash(i + vec2(1.0, 0.0)), f.x),
            mix(roadHash(i + vec2(0.0, 1.0)), roadHash(i + vec2(1.0)), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float verge = 1.0 - smoothstep(0.0, 0.11, min(vRoadAcross, 1.0 - vRoadAcross));
        float wheelDistance = min(min(abs(vRoadAcross - 0.18), abs(vRoadAcross - 0.32)),
          min(abs(vRoadAcross - 0.68), abs(vRoadAcross - 0.82)));
        float tyreWear = 1.0 - smoothstep(0.015, 0.06, wheelDistance);
        float age = roadNoise(vRoadWorld * 0.07);
        vec2 repairGrid = vRoadWorld / 17.0;
        vec2 repairCell = floor(repairGrid), repairUv = fract(repairGrid);
        float repair = step(0.86, roadHash(repairCell)) *
          smoothstep(0.12, 0.17, repairUv.x) * (1.0 - smoothstep(0.72, 0.77, repairUv.x)) *
          smoothstep(0.16, 0.21, repairUv.y) * (1.0 - smoothstep(0.55, 0.6, repairUv.y));
        float crackNoise = roadNoise(vRoadWorld * 0.45);
        float cracks = (1.0 - smoothstep(0.004, 0.018, abs(crackNoise - 0.5))) * step(0.65, age);
        diffuseColor.rgb *= 0.92 + age * 0.16 - tyreWear * 0.08 - repair * 0.17 - cracks * 0.12;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.04, 0.85), verge * 0.5);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor - tyreWear * 0.1 + verge * 0.05, 0.65, 1.0);');
  };
  material.customProgramCacheKey = () => 'road-wear-v1';
  return material;
}
