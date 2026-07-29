import * as THREE from 'three';

/**
 * The painterly shading patch.
 *
 * What reads as "hand-lit animation" in Ghibli / Shinkai / BotW frames is not
 * texture detail — it is the light falloff. A physically correct lambert term
 * goes to black at the terminator and rolls off linearly, which is exactly the
 * look of an unlit 3D scene. Painted light does two different things:
 *
 *   1. It wraps. Surfaces facing away from the light still receive colour,
 *      as if lit by bounce, so nothing collapses to silhouette-black.
 *   2. It banks. Most of the transition happens in a soft band around the
 *      terminator rather than being spread evenly — the two-tone read of a
 *      cel ramp, without the hard step.
 *
 * Both are one line in the diffuse irradiance term, so rather than converting
 * every material to MeshToonMaterial (losing the roughness response the wet
 * roads depend on), this rewrites the shared lighting chunk once at startup.
 * Every MeshStandardMaterial in the scene inherits the ramp, and specular
 * behaviour is untouched — "PBR materials, painted light", which is precisely
 * the brief.
 *
 * Must run before the first material compiles.
 */
export function applyPainterlyShading({ wrap = 0.45, band = 0.62 } = {}) {
  const target = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tvec3 irradiance = dotNL * directLight.color;';

  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (!chunk.includes(target)) {
    // A three upgrade moved the line. Fail loudly in dev rather than silently
    // shipping the un-stylised look.
    console.warn('[painterly] lighting chunk did not match; shading left standard');
    return false;
  }

  const replacement = `
	float dotNLraw = dot( geometryNormal, directLight.direction );
	// Painterly falloff: wrapped so shade stays coloured, banked so most of the
	// transition lives in a soft band at the terminator.
	float dotNLwrap = saturate( ( dotNLraw + ${glslFloat(wrap)} ) / ( 1.0 + ${glslFloat(wrap)} ) );
	float dotNL = mix( dotNLwrap, smoothstep( 0.22, 0.78, dotNLwrap ), ${glslFloat(band)} );
	vec3 irradiance = dotNL * directLight.color;`;

  THREE.ShaderChunk.lights_physical_pars_fragment = chunk.replace(target, replacement);
  return true;
}

function glslFloat(value) {
  const s = String(value);
  return s.includes('.') ? s : s + '.0';
}
