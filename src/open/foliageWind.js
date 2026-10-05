export const FOLIAGE_TIME = { value: 0 };

// Identical deformation for leaves and their shadow pass; trunks stay fixed.
export function applyFoliageWind(material, strength) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFoliageTime = FOLIAGE_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFoliageTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 windAnchor = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          windAnchor = instanceMatrix * windAnchor;
        #endif
        windAnchor = modelMatrix * windAnchor;
        float gust = sin(uFoliageTime * 1.15 + windAnchor.x * 0.045 + windAnchor.z * 0.031);
        float flutter = sin(uFoliageTime * 2.7 + windAnchor.x * 0.21 - windAnchor.z * 0.16);
        float flex = clamp(position.y / 5.0, 0.0, 1.0);
        transformed.x += (gust + flutter * 0.25) * flex * ${strength.toFixed(3)};
        transformed.z += sin(uFoliageTime * 0.9 + windAnchor.z * 0.05) * flex * ${ (strength * 0.45).toFixed(3)};
      `);
  };
  material.customProgramCacheKey = () => `foliage-wind-${strength}`;
  return material;
}
