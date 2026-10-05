import { WORLD, clamp, lerp } from './geo.js';

/**
 * Driving, properly: your throttle, your brakes, your steering, anywhere.
 *
 * An arcade model, tuned for feel rather than accuracy. The car keeps its
 * velocity in the world and turns its body; the tyres then pull the sideways
 * part of that velocity back toward zero, as hard as the surface allows. On
 * tarmac that is immediate; on dirt and sand it lags, and with the handbrake
 * on the rear lets go entirely — which is what a slide is. Steering lock
 * shrinks with speed, the way a real car's useful lock does.
 *
 * Buildings and water are solid. Hills have gravity. Nothing kills you.
 */

const GRIP = { asphalt: 1, dirt: 0.74, grass: 0.66, sand: 0.52, water: 0.4 };
const ROLLING = { asphalt: 0.012, dirt: 0.03, grass: 0.05, sand: 0.09, water: 0.2 };
const WHEELBASE = 2.55;
const GRAVITY = 22;
const RADIUS = 1.05; // collision circles, front and back
const OFFSET = 1.25;

export class Vehicle {
  constructor(world) {
    this.world = world;
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
    this.yaw = 0; // 0 faces north (-Z); positive turns right (clockwise from above)
    this.steer = 0; // smoothed, -1..1
    this.speed = 0; // forward, m/s (negative reversing)
    this.slip = 0; // 0..1 how much the tyres are sliding
    this.lateral = 0; // sideways speed, m/s
    this.surface = 'asphalt';
    this.grounded = true;
    this.pitch = 0;
    this.roll = 0;
    this.bodyRoll = 0;
    this.impact = 0; // 0..1, decays: the last hit
    this.crashes = 0;
    this.onRoad = null;
    this.stats = { grip: 1, speed: 1, tank: 1 };
    this.fuel = 1;
    this.fuelOn = true;
    this.odometer = 0;
    this.lastSafe = { x: 0, z: 0, yaw: 0 };
    this.onHit = null; // (strength) => void
  }

  place(x, z, yaw = 0) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = this.vz = this.vy = 0;
    this.speed = 0;
    this.y = this.world.surfaceAt(x, z).y;
    this.lastSafe = { x, z, yaw };
  }

  get forward() {
    return [Math.sin(this.yaw), -Math.cos(this.yaw)];
  }

  /**
   * @param {{throttle:number, brake:number, steer:number, handbrake:boolean}} input
   */
  update(dt, input) {
    const [fx, fz] = this.forward;
    const rx = -fz;
    const rz = fx;
    let vf = this.vx * fx + this.vz * fz;
    let vr = this.vx * rx + this.vz * rz;

    const here = this.world.surfaceAt(this.x, this.z, this.y);
    this.surface = here.surface;
    this.onRoad = here.road;
    const grip = (GRIP[here.surface] ?? 0.8) * this.stats.grip;
    const top = 50 * this.stats.speed; // m/s, about 180 km/h for the base car
    const power = 9.5 * this.stats.speed * (this.fuelOn && this.fuel <= 0 ? 0.12 : 1);

    // Steering: the wheel follows the input, and its useful lock shrinks with speed.
    this.steer += (input.steer - this.steer) * (1 - Math.exp(-9 * dt));
    const lock = lerp(0.62, 0.11, clamp(Math.abs(vf) / 42, 0, 1));
    const delta = this.steer * lock;

    if (this.grounded) {
      // Engine, brakes, reverse.
      if (input.throttle > 0) vf += input.throttle * power * Math.max(0, 1 - Math.max(0, vf) / top) * dt;
      if (input.brake > 0) {
        if (vf > 0.6) vf -= input.brake * 22 * dt;
        else vf -= input.brake * 6 * Math.max(0, 1 + vf / 9) * dt; // reverse, up to about 9 m/s
      }
      if (input.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 11 * dt);
      // Rolling resistance and air.
      vf -= vf * (ROLLING[here.surface] ?? 0.03) * dt * 6;
      vf -= vf * Math.abs(vf) * 0.0009 * dt;
      if (Math.abs(vf) < 0.05 && !input.throttle && !input.brake) vf = 0;

      // Turning: the kinematic rate, capped by what the tyres can hold.
      let yawRate = (vf / WHEELBASE) * Math.tan(delta);
      const maxYaw = (13 * grip) / Math.max(4, Math.abs(vf));
      if (!input.handbrake) yawRate = clamp(yawRate, -maxYaw, maxYaw);
      else yawRate *= 1.55;
      this.yaw += yawRate * dt;

      // The tyres pull the sideways velocity out, slowly when loose.
      const hold = input.handbrake ? 1.6 : 9 * grip;
      const before = vr;
      vr *= Math.exp(-hold * dt);
      // A slide scrubs speed.
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), Math.abs(before - vr) * 0.25);
    } else {
      // In the air the body keeps turning a little with the wheel, for style.
      this.yaw += this.steer * 0.6 * dt;
    }

    // Rebuild velocity in the new heading.
    const [nfx, nfz] = this.forward;
    const nrx = -nfz;
    const nrz = nfx;
    this.vx = nfx * vf + nrx * vr;
    this.vz = nfz * vf + nrz * vr;
    this.speed = vf;
    this.lateral = vr;
    this.slip = clamp(Math.abs(vr) / 6 + (input.handbrake && Math.abs(vf) > 4 ? 0.6 : 0), 0, 1);

    // Move, then resolve.
    const px = this.x;
    const pz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this._collide(px, pz);
    this._bounds();

    // Height: follow the ground, fall off edges, land with a thump.
    const under = this.world.surfaceAt(this.x, this.z, this.y);
    if (under.surface === 'water') {
      // Water is a wall: back to where you were, stopped.
      this.x = px;
      this.z = pz;
      this.vx *= -0.25;
      this.vz *= -0.25;
      this._hit(0.25);
    } else {
      const ground = under.y;
      if (this.y > ground + 0.4) {
        this.grounded = false;
        this.vy -= GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y <= ground) {
          if (this.vy < -7) this._hit(Math.min(1, -this.vy / 25));
          this.y = ground;
          this.vy = 0;
          this.grounded = true;
        }
      } else {
        // On the ground: ride it, and leave it at speed off a crest.
        const rise = (ground - this.y) / Math.max(dt, 1e-3);
        this.vy = this.grounded ? rise : 0;
        this.y = ground;
        this.grounded = true;
        if (this.grounded && this.vy < -9 && Math.abs(vf) > 18) {
          this.grounded = false;
        }
      }
      if (this.grounded && Math.abs(vf) > 2 && (under.road || under.surface !== 'water')) {
        this.lastSafe = { x: this.x, z: this.z, yaw: this.yaw };
      }
    }

    // Body attitude from the ground under the four corners, and lean from cornering.
    const f = 1.6;
    const s = 0.9;
    const hF = this.world.surfaceAt(this.x + nfx * f, this.z + nfz * f, this.y).y;
    const hB = this.world.surfaceAt(this.x - nfx * f, this.z - nfz * f, this.y).y;
    const hR = this.world.surfaceAt(this.x + nrx * s, this.z + nrz * s, this.y).y;
    const hL = this.world.surfaceAt(this.x - nrx * s, this.z - nrz * s, this.y).y;
    const pitch = this.grounded ? Math.atan2(hF - hB, f * 2) : this.pitch * 0.98;
    const roll = this.grounded ? Math.atan2(hR - hL, s * 2) : this.roll * 0.98;
    this.pitch += (pitch - this.pitch) * (1 - Math.exp(-10 * dt));
    this.roll += (roll - this.roll) * (1 - Math.exp(-10 * dt));
    const lean = clamp((vf * this.steer * lock) * 0.012, -0.09, 0.09);
    this.bodyRoll += (lean - this.bodyRoll) * (1 - Math.exp(-5 * dt));

    // Fuel: by distance, more when the right foot is down.
    const moved = Math.hypot(this.x - px, this.z - pz);
    this.odometer += moved;
    if (this.fuelOn) this.fuel = Math.max(0, this.fuel - (moved / (9000 * this.stats.tank)) * (0.6 + input.throttle * 0.7));
    this.impact *= Math.exp(-2.6 * dt);
  }

  /** Push out of any building the car's two circles overlap, and lose speed into it. */
  _collide(px, pz) {
    const [fx, fz] = this.forward;
    for (let pass = 0; pass < 2; pass++) {
      for (const k of [OFFSET, -OFFSET]) {
        const cx = this.x + fx * k;
        const cz = this.z + fz * k;
        for (const b of this.world.buildingsNear(cx, cz)) {
          const [minX, minZ, maxX, maxZ] = b.box;
          if (cx < minX - RADIUS || cx > maxX + RADIUS || cz < minZ - RADIUS || cz > maxZ + RADIUS) continue;
          const hit = circlePolygon(cx, cz, RADIUS, b.ring);
          if (!hit) continue;
          this.x += hit.nx * hit.depth;
          this.z += hit.nz * hit.depth;
          const vn = this.vx * hit.nx + this.vz * hit.nz;
          if (vn < 0) {
            this.vx -= vn * hit.nx * 1.25;
            this.vz -= vn * hit.nz * 1.25;
            // Scraping along a wall costs a little; going into it costs a lot.
            this.vx *= 0.92;
            this.vz *= 0.92;
            if (-vn > 2.5) this._hit(Math.min(1, -vn / 22));
          }
        }
      }
    }
    void px;
    void pz;
  }

  _bounds() {
    const margin = 50;
    if (this.x < WORLD.minX + margin || this.x > WORLD.maxX - margin || this.z < WORLD.minZ + margin || this.z > WORLD.maxZ - margin) {
      this.x = clamp(this.x, WORLD.minX + margin, WORLD.maxX - margin);
      this.z = clamp(this.z, WORLD.minZ + margin, WORLD.maxZ - margin);
      this.vx *= -0.3;
      this.vz *= -0.3;
    }
  }

  /** Something hit the car (or the car hit something): `strength` 0..1. */
  _hit(strength) {
    if (strength < 0.08) return;
    this.impact = Math.max(this.impact, strength);
    this.crashes++;
    this.onHit?.(strength);
  }

  /** An external knock (traffic): a shove in the world frame and a speed loss. */
  knock(dx, dz, keep, strength) {
    this.vx = this.vx * keep + dx;
    this.vz = this.vz * keep + dz;
    this._hit(strength);
  }

  /** Back on the last bit of road you were driving on, facing the way you were. */
  recover() {
    const road = this.world.nearestRoad(this.lastSafe.x, this.lastSafe.z, 200);
    if (road) this.place(road.x, road.z, road.angle);
    else this.place(this.lastSafe.x, this.lastSafe.z, this.lastSafe.yaw);
  }
}

/** Circle vs polygon: { nx, nz, depth } pushing the circle out, or null. */
function circlePolygon(cx, cz, r, ring) {
  let inside = false;
  let best = Infinity;
  let bx = 0;
  let bz = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > cz !== zj > cz && cx < ((xj - xi) * (cz - zi)) / (zj - zi) + xi) inside = !inside;
    const dx = xi - xj;
    const dz = zi - zj;
    const len2 = dx * dx + dz * dz || 1;
    const t = clamp(((cx - xj) * dx + (cz - zj) * dz) / len2, 0, 1);
    const qx = xj + dx * t;
    const qz = zj + dz * t;
    const d = Math.hypot(cx - qx, cz - qz);
    if (d < best) {
      best = d;
      bx = qx;
      bz = qz;
    }
  }
  if (!inside && best >= r) return null;
  let nx = cx - bx;
  let nz = cz - bz;
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  if (inside) {
    nx = -nx;
    nz = -nz;
    return { nx, nz, depth: best + r };
  }
  return { nx, nz, depth: r - best };
}
