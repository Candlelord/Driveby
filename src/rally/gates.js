import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { placeAt, visibleRange } from './place.js';

const HALF_SPAN = CONFIG.roadHalfWidth + 1.6;
const HEIGHT = 6.4;

/**
 * The start and finish arches: inflatable tubes in red and white stripes with a
 * banner across the top, as on a real stage. Two arches exist; they are moved
 * to wherever the next stage starts and ends, and hidden when out of range.
 */
export class Gates {
  constructor(scene) {
    this.stripes = stripeTexture();
    this.tubeMaterial = new THREE.MeshStandardMaterial({ map: this.stripes, roughness: 0.55, metalness: 0 });
    this.start = this._arch(scene, 'START', '#c6f000', '#0a0a0a');
    this.end = this._arch(scene, 'FINISH', '#f6f2e6', '#0a0a0a', true);
    this.last = { start: null, end: null };
  }

  _arch(scene, label, bannerColor, textColor, checkered = false) {
    const group = new THREE.Group();

    // The arch itself: a flattened half-ellipse of tube, stripes running round it.
    const curve = new THREE.CurvePath();
    const path = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI;
      path.push(new THREE.Vector3(Math.cos(a) * HALF_SPAN, Math.sin(a) * (HEIGHT - 0.6), 0));
    }
    const spline = new THREE.CatmullRomCurve3(path);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(spline, 56, 0.5, 10, false), this.tubeMaterial);
    tube.castShadow = true;
    group.add(tube);
    // Feet.
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.95, 0.35, 12),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
      );
      foot.position.set(side * HALF_SPAN, 0.17, 0);
      group.add(foot);
    }

    // The banner hangs under the crown, facing the car coming up the road and
    // (mirrored) the one that has passed it.
    const texture = bannerTexture(label, bannerColor, textColor, checkered);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_SPAN * 1.55, 1.9),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.7,
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: 0.1,
        side: THREE.DoubleSide,
      })
    );
    banner.position.set(0, HEIGHT - 2.1, 0.05);
    group.add(banner);

    group.visible = false;
    scene.add(group);
    return group;
  }

  /**
   * @param {{start:number, end:number}|null} gates absolute distances for the stage ahead
   * @param {{startS:number, endS:number}|null} active the stage in play, so its gates stay up
   */
  update(state, frame, gates) {
    const range = visibleRange(CONFIG);
    const live = state.live;
    for (const [key, group] of [['start', this.start], ['end', this.end]]) {
      const s = gates?.[key];
      const near = s !== undefined && s !== null && s - state.travelled < range && s - state.travelled > -40;
      group.visible = Boolean(near);
      if (!near) continue;
      placeAt(group, frame, s, 0, { live });
      // Night: the banner glows a little.
      const glow = 0.1 + live.lampIntensity * 0.5;
      group.children[group.children.length - 1].material.emissiveIntensity = glow;
      this.tubeMaterial.emissive.setRGB(1, 1, 1).multiplyScalar(live.lampIntensity * 0.08);
    }
  }
}

let stripes = null;
function stripeTexture() {
  if (stripes) return stripes;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 ? '#f4f1e8' : '#d8261c';
    ctx.fillRect((i * canvas.width) / bands, 0, canvas.width / bands + 1, canvas.height);
  }
  stripes = new THREE.CanvasTexture(canvas);
  stripes.colorSpace = THREE.SRGBColorSpace;
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
  stripes.repeat.set(7, 1);
  stripes.anisotropy = 4;
  return stripes;
}

function bannerTexture(label, background, ink, checkered) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (checkered) {
    const size = 32;
    ctx.fillStyle = '#0a0a0a';
    for (let y = 0; y < canvas.height; y += size) {
      for (let x = 0; x < 128; x += size) {
        if (((x + y) / size) % 2 === 0) {
          ctx.fillRect(x, y, size, size);
          ctx.fillRect(canvas.width - 128 + x, y, size, size);
        }
      }
    }
  } else {
    // Two black slashes at the ends, cut at the angle used throughout the UI.
    ctx.fillStyle = '#0a0a0a';
    for (const x of [60, 130, canvas.width - 190, canvas.width - 120]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 38, 0);
      ctx.lineTo(x - 30, canvas.height);
      ctx.lineTo(x - 68, canvas.height);
      ctx.fill();
    }
  }
  ctx.fillStyle = ink;
  ctx.font = 'italic 900 190px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2 + 8);
  ctx.transform(1, 0, -0.14, 1, 0, 0);
  ctx.fillText(label, 0, 0);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
