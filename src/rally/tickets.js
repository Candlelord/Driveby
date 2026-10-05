import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { hash } from '../path.js';
import { placeAt, visibleRange } from './place.js';
import { softDotTexture } from '../world/textures.js';

const PER_STAGE = 2;
const FUEL_GAIN = 0.25;
const SLOTS = PER_STAGE;

/**
 * Fuel tickets: a lime ticket hanging in the air just off the racing line, two
 * to a stage. Drive through one and the tank takes a quarter more — a reason to
 * leave the racing line, and a way to skip a stop.
 */
export class FuelTickets {
  constructor(scene, { physics }) {
    this.physics = physics;
    this.taken = new Set();
    const texture = ticketTexture();
    const glowTexture = softDotTexture();
    this.slots = [];
    for (let i = 0; i < SLOTS; i++) {
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 0.95),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false })
      );
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(4.2, 4.2),
        new THREE.MeshBasicMaterial({ map: glowTexture, color: 0xff3d8b, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })
      );
      glow.position.z = -0.05;
      const group = new THREE.Group();
      group.add(glow, card);
      group.visible = false;
      scene.add(group);
      this.slots.push(group);
    }
  }

  /** Where this stage's tickets are: a pure function of the stage, so they stay put. */
  static spots(region) {
    return Array.from({ length: PER_STAGE }, (_, k) => {
      const seed = (region.index + 1) * 13 + k * 7;
      const at = 0.3 + k * 0.32 + hash(seed) * 0.08;
      const lateral = (k % 2 ? 1 : -1) * (1.8 + hash(seed + 3) * 1.8);
      return { id: `${region.index}-${k}`, s: region.start + (region.end - region.start) * at, lateral };
    });
  }

  /** @returns {boolean} true if a ticket was taken this frame */
  update(state, frame, region) {
    let got = false;
    const spots = region && region.index >= 0 ? FuelTickets.spots(region) : [];
    this.slots.forEach((group, i) => {
      const spot = spots[i];
      if (!spot || this.taken.has(spot.id)) {
        group.visible = false;
        return;
      }
      const ahead = spot.s - state.travelled;
      const near = ahead < visibleRange(CONFIG) && ahead > -20;
      group.visible = near;
      if (!near) return;
      placeAt(group, frame, spot.s, spot.lateral, { y: 1.5 + Math.sin(state.time * 2.4 + i * 2) * 0.1, live: state.live });
      group.rotation.y += Math.sin(state.time * 1.6 + i) * 0.3;
      group.children[0].material.opacity = 0.35 + Math.sin(state.time * 4 + i) * 0.15;
      if (Math.abs(ahead) < 3.2 && Math.abs(state.lateral - spot.lateral) < 2.3) {
        this.taken.add(spot.id);
        group.visible = false;
        this.physics.fuel = Math.min(1, this.physics.fuel + FUEL_GAIN);
        got = true;
      }
    });
    return got;
  }
}

let map = null;
function ticketTexture() {
  if (map) return map;
  const canvas = document.createElement('canvas');
  canvas.width = 340;
  canvas.height = 190;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c6f000';
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(330, 0);
  ctx.arc(330, 95, 22, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(330, 190);
  ctx.lineTo(10, 190);
  ctx.arc(10, 95, 22, Math.PI / 2, -Math.PI / 2, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0b0b0c';
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(250, 14);
  ctx.lineTo(250, 176);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#0b0b0c';
  ctx.font = 'italic 900 78px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FUEL', 128, 78);
  ctx.font = '800 30px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('TICKET  +25%', 128, 140);
  ctx.font = 'italic 900 64px Impact, sans-serif';
  ctx.fillText('+', 295, 96);
  map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}
