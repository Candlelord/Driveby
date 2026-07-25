import * as THREE from 'three';

let softDot = null;
let beam = null;

/**
 * A soft circular alpha falloff, drawn once into a canvas.
 *
 * The scene is otherwise texture-free by design, but particles and glows need
 * an alpha ramp: untextured points render as hard squares, and a flat circle
 * used as a halo reads as a second disc rather than light.
 */
export function softDotTexture() {
  if (softDot) return softDot;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  softDot = new THREE.CanvasTexture(canvas);
  softDot.colorSpace = THREE.SRGBColorSpace;
  return softDot;
}

/**
 * A headlight beam: a wedge that starts narrow at the lamp (v = 0) and spreads
 * as it travels (v = 1), fading out along its length and across its width.
 *
 * Mapped onto a flat quad lying at lamp height, this reads as a light shaft
 * from the chase camera without any volumetric rendering.
 */
export function beamTexture() {
  if (beam) return beam;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    // v runs along the beam, 0 at the lamp.
    const v = y / (size - 1);
    const halfWidth = 0.07 + v * 0.43;
    const reach = Math.pow(1 - v, 1.4); // energy falls off with distance
    for (let x = 0; x < size; x++) {
      const u = Math.abs(x / (size - 1) - 0.5);
      const across = 1 - smoothstep(halfWidth * 0.35, halfWidth, u);
      const alpha = Math.max(0, across * reach);
      const i = (y * size + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  beam = new THREE.CanvasTexture(canvas);
  beam.colorSpace = THREE.SRGBColorSpace;
  // Row 0 of the canvas is the narrow end, and the beam quad puts v = 0 at the
  // lamp — so the default vertical flip has to be off for the two to line up.
  beam.flipY = false;
  return beam;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
