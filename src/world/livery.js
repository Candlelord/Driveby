import * as THREE from 'three';

/**
 * Liveries: stripes, a white roof, a door roundel and a sponsor band, painted
 * onto whatever car model is loaded.
 *
 * They are done in the paint material's shader rather than as decals or
 * textures: the fragment knows where it is in the car's own frame (nose at -Z,
 * up is +Y, the centreline at x = 0), so a stripe is "within 0.19 of the
 * centreline on a surface that faces up" and works on any model that is the
 * right way round, with no UV work.
 */

export const LIVERIES = [
  { id: 'plain', name: 'Plain' },
  { id: 'stripes', name: 'Twin stripes' },
  { id: 'rally', name: 'Works rally' },
];

const NUMBER = (() => {
  let texture = null;
  return (digits = '07') => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5f2e8';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#0b0b0c';
    ctx.font = 'italic 900 88px Impact, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(digits, 64, 70);
    if (texture) texture.dispose();
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
})();

/** One car's livery state: uniforms the shaders read, and a way to patch a material. */
export function createLivery() {
  const uniforms = {
    uLivery: { value: 0 },
    uCarInv: { value: new THREE.Matrix4() },
    uStripe: { value: new THREE.Color(0xf5f2e8) },
    uBand: { value: new THREE.Color(0xc6f000) },
    uNumber: { value: NUMBER('07') },
  };
  return {
    uniforms,
    /** Choose a livery by id; `paint` (a hex) picks stripes that contrast with it. */
    set(id, paint = 0xc8221b, digits = '07') {
      uniforms.uLivery.value = Math.max(0, LIVERIES.findIndex((l) => l.id === id));
      const luminance = new THREE.Color(paint).getHSL({}).l;
      uniforms.uStripe.value.setHex(luminance > 0.62 ? 0x16161a : 0xf5f2e8);
      uniforms.uBand.value.setHex(luminance > 0.62 ? 0xd8261c : 0xc6f000);
      uniforms.uNumber.value = NUMBER(digits);
    },
    /** Keep the car-frame transform current (call once a frame, from the car group). */
    track(group) {
      group.updateWorldMatrix(true, false);
      uniforms.uCarInv.value.copy(group.matrixWorld).invert();
    },
    /** Patch a paint material so it draws the livery. */
    apply(material) {
      const previous = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previous?.call(material, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform mat4 uCarInv;\nvarying vec3 vLocalPos;\nvarying vec3 vLocalN;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vec4 liveryWorld = modelMatrix * vec4( transformed, 1.0 );
            vLocalPos = ( uCarInv * liveryWorld ).xyz;
            vLocalN = normalize( mat3( uCarInv ) * ( mat3( modelMatrix ) * objectNormal ) );`
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nuniform float uLivery;\nuniform vec3 uStripe;\nuniform vec3 uBand;\nuniform sampler2D uNumber;\nvarying vec3 vLocalPos;\nvarying vec3 vLocalN;'
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            if ( uLivery > 0.5 ) {
              vec3 p = vLocalPos;
              float up = smoothstep( 0.5, 0.82, vLocalN.y );
              float side = smoothstep( 0.55, 0.8, abs( vLocalN.x ) );
              float ax = abs( p.x );
              // Two stripes down the centre, on bonnet, roof and boot.
              float bands = ( 1.0 - smoothstep( 0.15, 0.17, ax ) ) + smoothstep( 0.25, 0.27, ax ) * ( 1.0 - smoothstep( 0.34, 0.36, ax ) );
              float paint = clamp( bands, 0.0, 1.0 ) * up;
              vec3 livery = diffuseColor.rgb;
              livery = mix( livery, uStripe, paint );
              if ( uLivery > 1.5 ) {
                // Works rally: white roof, a sponsor band along the sills, and a
                // numbered roundel on each door.
                float roof = up * smoothstep( 1.02, 1.06, p.y );
                livery = mix( livery, vec3( 0.96, 0.95, 0.9 ), roof );
                float band = side * smoothstep( 0.27, 0.29, p.y ) * ( 1.0 - smoothstep( 0.4, 0.42, p.y ) );
                livery = mix( livery, uBand, band );
                vec2 d = vec2( p.z + 0.12, p.y - 0.78 );
                float disc = side * ( 1.0 - smoothstep( 0.255, 0.27, length( d ) ) );
                vec2 uv = vec2( 0.5 - sign( p.x ) * d.x / 0.52, 0.5 + d.y / 0.52 );
                vec3 number = texture2D( uNumber, uv ).rgb;
                livery = mix( livery, number, disc );
              }
              diffuseColor.rgb = livery;
            }`
          );
      };
      const key = material.customProgramCacheKey?.bind(material);
      material.customProgramCacheKey = () => `livery-${key ? key() : ''}`;
      material.needsUpdate = true;
    },
  };
}
