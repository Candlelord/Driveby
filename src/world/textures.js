import * as THREE from 'three';

let softDot = null;

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
