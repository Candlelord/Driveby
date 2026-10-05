import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { placeAt, visibleRange } from './place.js';
import { drawPostcard } from './postcardArt.js';
import { softDotTexture } from '../world/textures.js';

/**
 * Three postcards on every stage: little polaroids hanging in the air just off
 * the racing line, each a painted scene with a caption. Drive through one to
 * collect it; they live in the garage, and the lot of them are the reason to
 * take the stages a bit wide.
 *
 * Indexed by the leg of the route. Captions and scenes are the game's own.
 * Each entry: [caption, theme (see postcardArt.js), how far through the stage,
 * and which side of the road].
 */
const CARDS = [
  [['Lagoon at sunrise', 'lagoon', 0.18, -2.2], ['Yellow danfo, mid-argument', 'market', 0.5, 2.6], ['Bridge over the water', 'lagoon', 0.8, -1.4]],
  [['Cocoa pods drying in the sun', 'savanna', 0.2, 2.4], ['Ibadan rooftops, rust and gold', 'market', 0.52, -2.6], ['Roadside plantain, still hot', 'market', 0.82, 1.2]],
  [['The Niger at Jebba', 'river', 0.22, -2.4], ['A rock that looks like a loaf', 'rock', 0.55, 2.6], ['Dust devil on the savanna', 'savanna', 0.82, -1.2]],
  [['Granite in the afternoon', 'hills', 0.2, 2.2], ['Mosque at dusk', 'mosque', 0.5, -2.5], ['Hills like sleeping elephants', 'hills', 0.8, 1.6]],
  [['Harmattan haze', 'savanna', 0.22, -2.0], ['Red walls of Kano', 'walls', 0.52, 2.5], ['Dyed cloth on a line', 'market', 0.8, -1.8]],
  [['Where one country ends', 'savanna', 0.2, 2.6], ['Sahel sunset', 'desert', 0.52, -2.2], ['A camel with opinions', 'camel', 0.8, 1.4]],
  [['The first real dune', 'desert', 0.2, -2.4], ['Agadez minaret', 'mosque', 0.5, 2.3], ['Tea on the sand', 'camel', 0.8, -1.6]],
  [['Sand sea, no horizon', 'desert', 0.2, 2.3], ['The Hoggar, all teeth', 'mountain', 0.5, -2.6], ['So many stars', 'stars', 0.8, 1.5]],
  [['One lonely acacia', 'savanna', 0.2, -2.3], ['Oasis, briefly', 'oasis', 0.5, 2.5], ['Tracks that end in sky', 'desert', 0.8, -1.3]],
  [['M’zab houses, stacked pastel', 'pastel', 0.2, 2.4], ['Palm grove shade', 'oasis', 0.5, -2.4], ['Dust and a thermos', 'desert', 0.8, 1.6]],
  [['Atlas road, all switchbacks', 'switchback', 0.2, -2.2], ['First sight of the sea', 'sea', 0.5, 2.5], ['The white city', 'city', 0.8, -1.5]],
  null,
  [['Lavender, four o’clock', 'lavender', 0.2, 2.4], ['A tunnel of plane trees', 'plane', 0.5, -2.3], ['Stone village on its hill', 'village', 0.8, 1.7]],
  [['Mist in the forest', 'forest', 0.3, -2.4], ['Fallen log, fresh moss', 'log', 0.55, 2.4], ['Mud, glorious mud', 'mud', 0.8, -1.4]],
  [['Brussels, grey and gold', 'city', 0.2, 2.2], ['Fields that go forever', 'fields', 0.5, -2.5], ['Spire, rain coming', 'spire', 0.8, 1.5]],
  [['Windmill on the dyke', 'windmill', 0.2, -2.2], ['Tulips by the roadside', 'tulips', 0.5, 2.5], ['The canal, at last', 'canal', 0.8, -1.4]],
];

/** Every postcard on the route, with ids: { id, stage, caption, theme, at, lateral }. */
export const POSTCARDS = CARDS.map((cards, stage) =>
  (cards ?? []).map(([caption, theme, at, lateral], k) => ({ id: `${stage}-${k}`, stage, k, caption, theme, at, lateral, seed: stage * 10 + k + 1 }))
);
export const ALL_POSTCARDS = POSTCARDS.flat();

const SLOTS = 3;

export class Postcards {
  constructor(scene, garage) {
    this.garage = garage;
    this.slots = [];
    const glowTexture = softDotTexture();
    for (let i = 0; i < SLOTS; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 220;
      canvas.height = 264;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(1.35, 1.62),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false })
      );
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 4.6),
        new THREE.MeshBasicMaterial({ map: glowTexture, color: 0xc6f000, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })
      );
      glow.position.z = -0.05;
      const group = new THREE.Group();
      group.add(glow, card);
      group.visible = false;
      scene.add(group);
      this.slots.push({ group, canvas, texture, card: null });
    }
  }

  /**
   * @param {{start:number,end:number,index:number}|null} region
   * @returns {object|null} the postcard collected this frame, if any
   */
  update(state, frame, region) {
    const cards = region && region.index >= 0 ? POSTCARDS[region.index] ?? [] : [];
    let collected = null;
    this.slots.forEach((slot, i) => {
      const card = cards[i];
      if (!card || this.garage.postcards.includes(card.id)) {
        slot.group.visible = false;
        return;
      }
      if (slot.card?.id !== card.id) {
        slot.card = card;
        drawPostcard(slot.canvas, card);
        slot.texture.needsUpdate = true;
      }
      const s = region.start + (region.end - region.start) * card.at;
      const ahead = s - state.travelled;
      const near = ahead < visibleRange(CONFIG) && ahead > -20;
      slot.group.visible = near;
      if (!near) return;
      const bob = Math.sin(state.time * 2.1 + i * 2) * 0.12;
      placeAt(slot.group, frame, s, card.lateral, { y: 1.9 + bob, live: state.live });
      slot.group.rotation.y += Math.sin(state.time * 1.3 + i) * 0.35;
      slot.group.children[0].material.opacity = 0.4 + Math.sin(state.time * 3 + i) * 0.15;

      if (Math.abs(ahead) < 3.2 && Math.abs(state.lateral - card.lateral) < 2.3 && this.garage.collect(card.id)) {
        collected = card;
        slot.group.visible = false;
      }
    });
    return collected;
  }
}
