import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { placeAt, visibleRange } from './place.js';

// Where a station stands in a leg: just before the city, after the stage has
// finished and well before the next one starts. Leg 0 also gets one at the
// beginning, so the first stage is not the first time you see a pump.
const AT = 0.945;
const FIRST_AT = 0.055;

const PUMP_LATERAL = 7.0; // just off the road edge, within reach of a car pulled to the side
const ZONE_HALF = 7; // along the road: pull up within this of the pumps
const ZONE_LATERAL = 3.3; // and to the right of this
const PRICE = 110; // dollars for a full tank
const FILL_RATE = 0.22; // tank fractions per second
const SIGN_HEIGHT = 8.5;

/**
 * Fuel stops. A tank drains with distance (faster under boost); a station
 * stands by the road at the end of every stage, with a tall lit sign you can
 * see coming. Pull in on the right, stop beside the pumps, and the tank fills
 * for money. Run dry and the car crawls; a passer-by tops you up a little so
 * the trip can never be stranded.
 */
export class FuelStations {
  constructor(scene, { garage, physics, ui, sfx }) {
    this.garage = garage;
    this.physics = physics;
    this.ui = ui;
    this.sfx = sfx;
    this.stops = []; // absolute distances
    this.active = null;
    this.refuelling = false;
    this._spent = 0;
    this._dryTime = 0;
    this._lastBeep = 0;
    this._noCash = false;

    this.glowMaterials = [];
    this.group = this._build();
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Lay stations along a route: `layout` is the director's own leg arithmetic. */
  setRoute(route, { origin, legStarts, legLengths }) {
    this.stops = [];
    route.legs.forEach((leg, i) => {
      if (!leg.stage) return;
      this.stops.push(origin + legStarts[i] + legLengths[i] * AT);
      if (i === 0) this.stops.push(origin + legStarts[i] + legLengths[i] * FIRST_AT);
    });
    this.stops.sort((a, b) => a - b);
  }

  clear() {
    this.stops = [];
    this.group.visible = false;
    this.active = null;
  }

  _build() {
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.7 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.8 });
    const lime = new THREE.MeshStandardMaterial({ color: 0xc6f000, roughness: 0.6 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: true });
    this.glowMaterials.push(glow);

    // The canopy: a flat roof on four posts over the pump island.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 8.5), paper);
    roof.position.set(0, 5.4, 0);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.7, 0.3), lime);
    const edgeA = edge.clone();
    edgeA.position.set(0, 5.4, 4.3);
    const edgeB = edge.clone();
    edgeB.position.set(0, 5.4, -4.3);
    const underlight = new THREE.Mesh(new THREE.BoxGeometry(13, 0.08, 6.5), glow);
    underlight.position.set(0, 5.1, 0);
    group.add(roof, edgeA, edgeB, underlight);
    for (const [x, z] of [[-6.5, -3.4], [6.5, -3.4], [-6.5, 3.4], [6.5, 3.4]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.2, 0.4), dark);
      post.position.set(x, 2.6, z);
      group.add(post);
    }
    // Two pumps.
    for (const x of [-2.6, 2.6]) {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.7), lime);
      pump.position.set(x, 0.85, 0);
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.05), dark);
      face.position.set(x, 1.3, 0.37);
      const faceB = face.clone();
      faceB.position.z = -0.37;
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 1.4), dark);
      base.position.set(x, 0.1, 0);
      group.add(pump, face, faceB, base);
    }
    // The shop behind.
    const shop = new THREE.Mesh(new THREE.BoxGeometry(9, 3.8, 5.5), paper);
    shop.position.set(0, 1.9, 8.8);
    const shopGlass = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.6, 0.1), glow);
    shopGlass.position.set(0, 1.7, 5.98);
    group.add(shop, shopGlass);

    // The pylon sign, tall enough to see from a long way off.
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, SIGN_HEIGHT, 0.5), dark);
    pole.position.set(-8.4, SIGN_HEIGHT / 2, 5.2);
    const texture = signTexture();
    const signMaterial = new THREE.MeshBasicMaterial({ map: texture, fog: true, toneMapped: false });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 5.4), [signMaterial, signMaterial, dark, dark, dark, dark]);
    sign.position.set(-8.4, SIGN_HEIGHT + 1.2, 5.2);
    group.add(pole, sign);

    for (const mesh of group.children) mesh.castShadow = false;
    return group;
  }

  /** Per frame. Returns nothing; talks to the HUD and the garage. */
  update(state, frame) {
    const s = state.travelled;
    const range = visibleRange(CONFIG);
    // The nearest station not far behind.
    let next = null;
    for (const stop of this.stops) {
      if (stop > s - 60) {
        next = stop;
        break;
      }
    }
    this.active = next;
    const near = next !== null && next - s < range;
    this.group.visible = near;
    if (near) {
      // The island sits to the right of the road, facing it.
      placeAt(this.group, frame, next, PUMP_LATERAL + 1.6, { live: state.live, yaw: Math.PI / 2 });
      const lit = state.live.lampIntensity;
      for (const m of this.glowMaterials) m.color.setRGB(1, 0.94, 0.78).multiplyScalar(0.35 + lit * 1.6);
    }

    const { physics } = this;
    const fuel = physics.fuel;
    const ahead = next !== null ? next - s : Infinity;
    const inZone = next !== null && Math.abs(s - next) < ZONE_HALF && state.lateral > ZONE_LATERAL;

    // Pulling in is helped along: once you have committed to the right-hand
    // side near the pumps, the car brakes itself to rest beside them, and sets
    // off again when the tank is full (or you steer back out).
    const wantsFuel = fuel < 0.995 && this.garage.cash >= 1;
    const committed = wantsFuel && next !== null && state.lateral > 3.0 && ahead < 80 && ahead > -ZONE_HALF;
    if (committed) {
      physics.holdAt = next - 1.5;
      this._assist = true;
    } else if (this._assist) {
      this._assist = false;
      physics.holdAt = null;
    }

    // Refuelling: stopped beside the pumps.
    this.refuelling = false;
    if (inZone && physics.speed < 1.8 && fuel < 0.995) {
      const cash = this.garage.cash;
      const want = Math.min(FILL_RATE * state.dt, 1 - fuel);
      const cost = want * PRICE;
      if (cash >= cost && cash >= 1) {
        this.refuelling = true;
        this._noCash = false;
        physics.fuel = Math.min(1, fuel + want);
        this._spent += cost;
        // Charge in whole dollars so the garage total stays tidy.
        if (this._spent >= 1) {
          const whole = Math.floor(this._spent);
          this.garage.add(-whole);
          this._spent -= whole;
        }
        if (state.time - this._lastBeep > 0.22) {
          this._lastBeep = state.time;
          this.sfx?.beep(700 + physics.fuel * 500, 0.05, 0.08);
        }
      } else if (!this._noCash) {
        this._noCash = true;
        this.ui.say?.('Pockets are empty. Win some prize money and come back.', 'Station', 4);
      }
    }

    // Dry: crawl, and eventually someone helps.
    if (physics.fuel <= 0.001) {
      this._dryTime += state.dt;
      if (this._dryTime > 22) {
        this._dryTime = 0;
        physics.fuel = 0.1;
        this.ui.say?.('A passer-by tips a can of fuel in. Do not make a habit of it.', 'Roadside', 4.5);
      }
    } else this._dryTime = 0;

    this.ui.setFuel?.({
      level: physics.fuel,
      refuelling: this.refuelling,
      out: physics.fuel <= 0.001,
      // The nudge: low-ish fuel and a station coming up.
      hint: ahead < 340 && ahead > -20 && physics.fuel < 0.7 && !this.refuelling ? (inZone ? 'stop to fill up' : 'fuel ahead · pull in right, then stop') : '',
      price: PRICE,
    });
  }
}

let signMap = null;
function signTexture() {
  if (signMap) return signMap;
  const canvas = document.createElement('canvas');
  canvas.width = 540;
  canvas.height = 340;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, 540, 340);
  ctx.fillStyle = '#c6f000';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(540, 0);
  ctx.lineTo(540, 62);
  ctx.lineTo(0, 118);
  ctx.fill();
  ctx.fillStyle = '#f5f2e8';
  ctx.font = 'italic 900 150px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FUEL', 270, 205);
  ctx.fillStyle = '#c6f000';
  ctx.font = '800 34px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('OPEN · PAY AT THE PUMP', 270, 300);
  signMap = new THREE.CanvasTexture(canvas);
  signMap.colorSpace = THREE.SRGBColorSpace;
  signMap.anisotropy = 8;
  return signMap;
}
