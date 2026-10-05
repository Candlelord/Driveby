import * as THREE from 'three';
import { NORTH_EDGE, hash1 } from './geo.js';
import { discoveries } from './places.js';
import { biomeAt } from './north.js';
import { drawPostcard } from './postcardArt.js';
import { softDotTexture } from '../world/textures.js';

/**
 * What there is to do: find places, keep the tank full, pick up fuel tickets,
 * run errands for money — with your friend in the passenger seat talking you
 * through it.
 */

const FIND_BONUS = 80;
const TICKET_FUEL = 0.25;
const FUEL_PRICE = 90; // a full tank
const FILL_RATE = 0.25; // tank per second at the pump

// --- markers in the world ---------------------------------------------------------

/** A tall glowing column, like a checkpoint: you can see where to go from far off. */
class Beacons {
  constructor(scene, count = 8) {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
    this.items = [];
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xc6f000, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 3;
      scene.add(mesh);
      this.items.push(mesh);
    }
  }

  /** `list`: [{ x, y, z, colour, radius, height }] — the nearest few are shown. */
  set(list, time) {
    this.items.forEach((mesh, i) => {
      const b = list[i];
      mesh.visible = Boolean(b);
      if (!b) return;
      mesh.position.set(b.x, b.y - 2, b.z);
      mesh.scale.set(b.radius ?? 4, b.height ?? 140, b.radius ?? 4);
      mesh.material.color.setHex(b.colour ?? 0xc6f000);
      mesh.material.opacity = 0.22 + Math.sin(time * 3 + i) * 0.06;
    });
  }
}

/** A filling station: canopy, pumps, kiosk, and a tall lit sign. */
function stationModel() {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.7 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.8 });
  const lime = new THREE.MeshStandardMaterial({ color: 0xc6f000, roughness: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  const box = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  box(16, 0.5, 9, paper, 0, 5.6, 0);
  box(16.2, 0.7, 0.3, lime, 0, 5.6, 4.6);
  box(16.2, 0.7, 0.3, lime, 0, 5.6, -4.6);
  box(14, 0.08, 7, glow, 0, 5.3, 0);
  for (const [x, z] of [[-7, -3.6], [7, -3.6], [-7, 3.6], [7, 3.6]]) box(0.4, 5.4, 0.4, dark, x, 2.7, z);
  for (const x of [-3, 3]) {
    box(0.9, 1.7, 0.7, lime, x, 0.85, 0);
    box(3.2, 0.2, 1.4, dark, x, 0.1, 0);
  }
  box(9, 3.8, 5.5, paper, 0, 1.9, -11);
  box(7.4, 1.6, 0.1, glow, 0, 1.7, -8.2);
  box(0.5, 8, 0.5, dark, 9.5, 4, 5);
  const sign = box(0.35, 3.2, 5, dark, 9.5, 9.2, 5);
  sign.material = [signMaterial(), signMaterial(), dark, dark, dark, dark];
  group.userData.glow = glow;
  return group;
}

let signMat = null;
function signMaterial() {
  if (signMat) return signMat;
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, 500, 320);
  ctx.fillStyle = '#c6f000';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(500, 0);
  ctx.lineTo(500, 56);
  ctx.lineTo(0, 110);
  ctx.fill();
  ctx.fillStyle = '#f5f2e8';
  ctx.font = 'italic 900 140px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FUEL', 250, 195);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  signMat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  return signMat;
}

function ticketMesh() {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 170;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c6f000';
  ctx.fillRect(0, 0, 300, 170);
  ctx.strokeStyle = '#0b0b0c';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 292, 162);
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(220, 12);
  ctx.lineTo(220, 158);
  ctx.stroke();
  ctx.fillStyle = '#0b0b0c';
  ctx.font = 'italic 900 70px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FUEL', 112, 72);
  ctx.font = '800 26px Arial, sans-serif';
  ctx.fillText('TICKET +25%', 112, 128);
  ctx.font = 'italic 900 60px Impact, sans-serif';
  ctx.fillText('+', 262, 88);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.25), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: softDotTexture(), color: 0xc6f000, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.z = -0.05;
  const group = new THREE.Group();
  group.add(glow, card);
  return group;
}

// --- the friend -------------------------------------------------------------------

const BANTER = [
  'You know the best thing about a road trip? Nobody can call you into a meeting.',
  'If we see a suya spot, we are stopping. That is not a request.',
  'My mum thinks we are at the library. Keep it that way.',
  'This car is older than both of us combined and it still drives better than my cousin.',
  'Left, right, it does not matter. We are exploring. Exploring has no wrong turns.',
  'Imagine if we had planned this trip. Boring.',
  'Look at the sky. Even the clouds are on holiday.',
  'We should come back here at night. Everything looks different at night.',
  'Write this down: best field trip of all time. Nobody else has to agree.',
  'Did you lock the house? I am joking. I think. Did you?',
  'I love this song. I do not know it, but I love it.',
  'Go off the road a bit, the map is not the boss of us.',
];

const AREA_LINES = {
  forest: 'Forest now. Smell that? That is rain on red earth.',
  savanna: 'Savanna! Look how far you can see. Lions? No. Cows? Definitely.',
  sahel: 'We are in the Sahel. Dry, flat, and the sky is enormous.',
  desert: 'Desert. Proper sand. Do not stop on the soft bits.',
  lagos: 'Back in Lagos. Hold on to your mirrors.',
};

export class Friend {
  constructor(hud, name = 'Tunde') {
    this.hud = hud;
    this.name = name;
    this.voice = readVoice();
    this.quiet = 25;
  }

  setVoice(on) {
    this.voice = on;
    try {
      localStorage.setItem('driveby.voice', on ? '1' : '0');
    } catch {
      // not remembered
    }
    if (!on) speechSynthesis?.cancel();
  }

  say(text, seconds = 4.5) {
    this.hud.say(text, this.name, seconds);
    this.quiet = Math.max(this.quiet, 14);
    if (!this.voice || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    if (synth.speaking) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    const voices = synth.getVoices();
    const v = voices.find((x) => /en-NG/i.test(x.lang)) ?? voices.find((x) => /en-(GB|ZA|IE)/i.test(x.lang)) ?? voices.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    synth.speak(u);
  }

  update(dt, vehicle) {
    this.quiet -= dt;
    if (this.quiet <= 0 && Math.abs(vehicle.speed) > 6) {
      this.quiet = 40 + Math.random() * 40;
      this.say(BANTER[Math.floor(Math.random() * BANTER.length)]);
    }
  }
}

function readVoice() {
  try {
    return localStorage.getItem('driveby.voice') === '1';
  } catch {
    return false;
  }
}

// --- the game's systems -------------------------------------------------------------

export class Gameplay {
  constructor(scene, { world, hud, garage, vehicle, sfx }) {
    this.world = world;
    this.hud = hud;
    this.garage = garage;
    this.vehicle = vehicle;
    this.sfx = sfx;
    this.friend = new Friend(hud);
    this.places = discoveries(world);
    this.found = new Set();
    this.waypoint = null;
    this.job = null;
    this.ticketsTaken = new Set();
    this.area = '';
    this.biome = '';
    this.beacons = new Beacons(scene);

    // Fuel stations: OpenStreetMap's in Lagos, and the north's.
    this.stations = [...(world.pois.fuel ?? []), ...world.north.fuel].map((s, i) => ({ ...s, id: `fuel-${i}` }));
    this.stationPool = Array.from({ length: 5 }, () => {
      const m = stationModel();
      m.visible = false;
      scene.add(m);
      return m;
    });

    // Fuel tickets: scattered along roads, everywhere, for finding.
    this.tickets = this._placeTickets();
    this.ticketPool = Array.from({ length: 6 }, () => {
      const m = ticketMesh();
      m.visible = false;
      scene.add(m);
      return m;
    });

    // Errand spots: markets, sights and villages.
    this.jobSpots = this.places.filter((p, i) => p.theme === 'market' || i % 3 === 0).map((p) => ({ x: p.x, z: p.z, name: p.name, id: p.id }));
    this.refuelling = false;
  }

  _placeTickets() {
    const out = [];
    const graph = this.world.graph;
    if (graph?.nodes?.length) {
      const n = graph.nodes.length / 2;
      for (let k = 0; k < 110; k++) {
        const i = Math.floor(hash1(k * 7.31 + 3) * n);
        out.push({ id: `t${k}`, x: graph.nodes[i * 2], z: graph.nodes[i * 2 + 1] });
      }
    }
    // The north: along its roads.
    const roads = this.world.north.roads;
    for (let k = 0; k < 70; k++) {
      const road = roads[Math.floor(hash1(k * 3.9 + 1) * roads.length)];
      const p = road.pts[Math.floor(hash1(k * 5.3) * road.pts.length)];
      out.push({ id: `n${k}`, x: p[0], z: p[1] });
    }
    return out;
  }

  restore(save) {
    this.found = new Set(save?.found ?? []);
    this.ticketsTaken = new Set(save?.tickets ?? []);
    this.job = save?.job ?? null;
    this.waypoint = save?.waypoint ?? (this.job ? { x: this.job.to.x, z: this.job.to.z, label: this.job.to.name } : null);
  }

  snapshot() {
    return { found: [...this.found], tickets: [...this.ticketsTaken], job: this.job, waypoint: this.waypoint };
  }

  setWaypoint(wp) {
    this.waypoint = wp;
    this.onWaypoint?.(wp);
  }

  /** Icons for the maps. */
  icons(full = false) {
    const v = this.vehicle;
    const out = [];
    for (const s of this.stations) if (full || Math.hypot(s.x - v.x, s.z - v.z) < 1600) out.push({ kind: 'fuel', x: s.x, z: s.z, label: s.name });
    for (const p of this.places) {
      const found = this.found.has(p.id);
      if (!full && Math.hypot(p.x - v.x, p.z - v.z) > 1800) continue;
      out.push({ kind: found ? 'found' : 'sight', x: p.x, z: p.z, label: found ? p.name : '???' });
    }
    for (const t of this.tickets) {
      if (this.ticketsTaken.has(t.id)) continue;
      if (Math.hypot(t.x - v.x, t.z - v.z) < (full ? 700 : 420)) out.push({ kind: 'ticket', x: t.x, z: t.z, label: 'Fuel ticket' });
    }
    if (this.job) out.push({ kind: 'drop', x: this.job.to.x, z: this.job.to.z, label: this.job.to.name, pin: true });
    else for (const s of this.jobSpots) if (full || Math.hypot(s.x - v.x, s.z - v.z) < 1500) out.push({ kind: 'job', x: s.x, z: s.z, label: `Errand at ${s.name}` });
    if (this.waypoint) out.push({ kind: 'flag', x: this.waypoint.x, z: this.waypoint.z, pin: true });
    return out;
  }

  /** Neighbourhood and biome names for where the car is. */
  _area() {
    const v = this.vehicle;
    if (v.z > NORTH_EDGE) {
      let best = null;
      let bestD = 2200;
      for (const p of this.world.pois.places ?? []) {
        const d = Math.hypot(p.x - v.x, p.z - v.z) * (p.kind === 'suburb' ? 0.75 : 1);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return { area: best?.name ?? 'Lagos', biome: 'lagos' };
    }
    const biome = biomeAt(v.x, v.z);
    let near = null;
    for (const p of this.world.north.places) {
      if ((p.kind === 'village' || p.kind === 'city') && Math.hypot(p.x - v.x, p.z - v.z) < (p.kind === 'city' ? 1600 : 600)) near = p;
    }
    return { area: near?.name ?? { forest: 'The Bush', savanna: 'The Savanna', sahel: 'The Sahel', desert: 'The Desert' }[biome], biome };
  }

  update(dt, time) {
    const v = this.vehicle;
    const hud = this.hud;

    // Where are we.
    const { area, biome } = this._area();
    if (area !== this.area) {
      if (this.area) hud.toast(area, biome === 'lagos' ? 'Lagos' : 'the north', 2.6);
      this.area = area;
    }
    if (biome !== this.biome) {
      if (this.biome) this.friend.say(AREA_LINES[biome]);
      this.biome = biome;
    }

    // Discoveries.
    for (const p of this.places) {
      if (this.found.has(p.id)) continue;
      if (Math.hypot(p.x - v.x, p.z - v.z) > p.radius) continue;
      this.found.add(p.id);
      this.garage.add(FIND_BONUS);
      hud.card((canvas) => drawPostcard(canvas, { caption: p.name, theme: p.theme, seed: hash1(p.x + p.z) * 100 }), `discovered · <b>+$${FIND_BONUS}</b> · ${this.found.size} of ${this.places.length}`);
      this.friend.say(p.line, 6);
      this.sfx?.beep(990, 0.14, 0.18);
      setTimeout(() => this.sfx?.beep(1320, 0.25, 0.18), 120);
      this.onChange?.();
    }

    // Fuel stations: the nearest few get a building; stop beside the pumps to fill up.
    const near = this.stations.map((s) => ({ s, d: Math.hypot(s.x - v.x, s.z - v.z) })).sort((a, b) => a.d - b.d);
    this.stationPool.forEach((model, i) => {
      const entry = near[i];
      if (!entry || entry.d > 900) {
        model.visible = false;
        return;
      }
      const s = entry.s;
      if (!s.placed) {
        // Face the nearest road, the pumps beside it.
        const road = this.world.nearestRoad(s.x, s.z, 80);
        s.angle = road ? Math.atan2(road.x - s.x, -(road.z - s.z)) : 0;
        s.placed = Boolean(road);
      }
      model.visible = true;
      model.position.set(s.x, this.world.terrainHeight(s.x, s.z), s.z);
      model.rotation.set(0, -s.angle, 0);
      const lit = this.night ?? 0;
      model.userData.glow.color.setRGB(1, 0.94, 0.8).multiplyScalar(0.4 + lit * 1.6);
    });
    const station = near[0] && near[0].d < 13 ? near[0].s : null;
    this.refuelling = false;
    if (station) {
      if (v.fuel < 0.995) {
        if (Math.abs(v.speed) < 1.5) {
          const want = Math.min(FILL_RATE * dt, 1 - v.fuel);
          const cost = want * FUEL_PRICE;
          if (this.garage.cash >= Math.max(1, cost)) {
            v.fuel += want;
            this._spent = (this._spent ?? 0) + cost;
            if (this._spent >= 1) {
              const whole = Math.floor(this._spent);
              this.garage.add(-whole);
              this._spent -= whole;
            }
            this.refuelling = true;
            hud.prompt(`filling up <small>$${FUEL_PRICE} a tank · ${Math.round(v.fuel * 100)}%</small>`);
          } else hud.prompt('no money for fuel <small>find places, run errands</small>');
        } else hud.prompt(`${station.name} <small>stop here to fill up</small>`);
      } else hud.prompt(`${station.name} <small>tank full</small>`);
    } else if (v.fuel <= 0) {
      hud.prompt('out of fuel <small>crawl to a station, or find a ticket</small>');
    } else hud.prompt('');
    if (v.fuel < 0.15 && !this._warned) {
      this._warned = true;
      this.friend.say('Fuel is low! The pump icons on the map. Do not make me push this car.');
    }
    if (v.fuel > 0.4) this._warned = false;
    if (v.fuel <= 0) {
      // Nobody gets stranded: after a while someone tips a can in.
      this._dry = (this._dry ?? 0) + dt;
      if (this._dry > 25) {
        this._dry = 0;
        v.fuel = 0.12;
        this.friend.say('A man on an okada just gave us a jerrycan. Lagos, I love you.');
      }
    } else this._dry = 0;

    // Fuel tickets.
    const tickets = this.tickets.filter((t) => !this.ticketsTaken.has(t.id)).map((t) => ({ t, d: Math.hypot(t.x - v.x, t.z - v.z) })).filter((e) => e.d < 350).sort((a, b) => a.d - b.d);
    this.ticketPool.forEach((mesh, i) => {
      const e = tickets[i];
      mesh.visible = Boolean(e);
      if (!e) return;
      const y = this.world.surfaceAt(e.t.x, e.t.z).y;
      mesh.position.set(e.t.x, y + 1.8 + Math.sin(time * 2.2 + i) * 0.15, e.t.z);
      mesh.rotation.y = time * 1.2 + i;
      if (e.d < 5) {
        this.ticketsTaken.add(e.t.id);
        v.fuel = Math.min(1, v.fuel + TICKET_FUEL);
        hud.toast('Fuel ticket', 'tank +25%', 2.4);
        this.sfx?.beep(1100, 0.12, 0.2);
        this.onChange?.();
      }
    });

    // Errands.
    this._updateJob();

    // Beacons: waypoint, errand target, the nearest errand spots.
    const beacons = [];
    if (this.waypoint) beacons.push({ x: this.waypoint.x, z: this.waypoint.z, y: this.world.terrainHeight(this.waypoint.x, this.waypoint.z), colour: 0xc6f000, radius: 3.5 });
    if (this.job) beacons.push({ x: this.job.to.x, z: this.job.to.z, y: this.world.terrainHeight(this.job.to.x, this.job.to.z), colour: 0xff3d8b, radius: 6 });
    else {
      for (const s of this.jobSpots) {
        const d = Math.hypot(s.x - v.x, s.z - v.z);
        if (d < 700) beacons.push({ x: s.x, z: s.z, y: this.world.terrainHeight(s.x, s.z), colour: 0xffb02e, radius: 5, height: 60, d });
      }
    }
    this.beacons.set(beacons.slice(0, 8), time);

    this.friend.update(dt, v);
  }

  _updateJob() {
    const v = this.vehicle;
    const hud = this.hud;
    if (!this.job) {
      // Roll into an errand spot slowly to take a job.
      for (const s of this.jobSpots) {
        if (Math.hypot(s.x - v.x, s.z - v.z) > 9) continue;
        if (Math.abs(v.speed) > 6) {
          hud.prompt(`errand at ${s.name} <small>slow down to take it</small>`);
          return;
        }
        if (this._cooldownSpot === s.id) return;
        this._offer(s);
        return;
      }
      this._cooldownSpot = null;
      hud.setJob(null);
      return;
    }
    const j = this.job;
    const d = Math.hypot(j.to.x - v.x, j.to.z - v.z);
    hud.setJob({ title: `Deliver ${j.cargo}`, meta: `to ${j.to.name} · <b>${(d / 1000).toFixed(1)} km</b> · $${j.pay}` });
    if (d < 10 && Math.abs(v.speed) < 5) {
      const fast = (performance.now() - j.started) / 1000 < j.par;
      const pay = j.pay + (fast ? Math.round(j.pay * 0.3) : 0);
      this.garage.add(pay);
      hud.toast('Delivered', `+$${pay}${fast ? ' · fast!' : ''}`, 3.5);
      this.friend.say(fast ? 'Delivered, and quick! They tipped us. Respect.' : 'Delivered. They said thank you. Lagos does not say thank you often, enjoy it.');
      this.sfx?.beep(880, 0.2, 0.2);
      this._cooldownSpot = this.jobSpots.find((s) => Math.hypot(s.x - j.to.x, s.z - j.to.z) < 12)?.id ?? null;
      this.job = null;
      if (this.waypoint && Math.hypot(this.waypoint.x - j.to.x, this.waypoint.z - j.to.z) < 30) this.setWaypoint(null);
      hud.setJob(null);
      this.onChange?.();
    }
  }

  _offer(from) {
    const v = this.vehicle;
    const options = this.jobSpots.filter((s) => s.id !== from.id).map((s) => ({ s, d: Math.hypot(s.x - from.x, s.z - from.z) })).filter((e) => e.d > 1200 && e.d < 9000);
    if (!options.length) return;
    const pick = options[Math.floor(Math.random() * options.length)];
    const cargo = CARGO[Math.floor(Math.random() * CARGO.length)];
    const pay = Math.round(80 + (pick.d / 1000) * 85);
    this.job = { cargo, from: { name: from.name, x: from.x, z: from.z }, to: { name: pick.s.name, x: pick.s.x, z: pick.s.z }, pay, started: performance.now(), par: pick.d / 13 + 30 };
    this.setWaypoint({ x: pick.s.x, z: pick.s.z, label: pick.s.name });
    this.hud.toast('Errand', `${cargo} to ${pick.s.name}`, 3.5);
    this.friend.say(`Okay, they want ${cargo} taken to ${pick.s.name}. ${(pick.d / 1000).toFixed(1)} kilometres. Follow the green line.`);
    void v;
    this.onChange?.();
  }

  cancelJob() {
    if (!this.job) return;
    this.job = null;
    this.setWaypoint(null);
    this.hud.setJob(null);
  }

  /** Journal entries, discovered or not. */
  journal() {
    return this.places.map((p) => ({ ...p, found: this.found.has(p.id) }));
  }
}

const CARGO = [
  'a crate of tomatoes',
  'bales of ankara fabric',
  'a cooler of chilled zobo',
  'a bag of suya spice',
  'a second-hand generator',
  'aso-ebi for a wedding',
  'a very calm goat',
  'twenty loaves of agege bread',
  'a box of phone screens',
  'a drum set for a church',
  'a sack of yams',
  'a carved wooden stool',
  'a cake that must not be shaken',
  'a stack of exam papers',
  'a crate of palm wine',
];
