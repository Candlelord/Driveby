import { CONFIG } from './config.js';
import { curvature } from './path.js';
import { dirtAt } from './rally/track.js';

// Lateral acceleration (units/s²) a car on dry tarmac can hold in a corner.
// Past it the car understeers toward the outside of the bend, which on gravel
// and in the wet happens at a fraction of the speed.
const GRIP_ACCEL = 34;
const SLIDE_GAIN = 0.34; // lateral units/s of drift per unit of lateral acceleration over the limit
const HANDBRAKE_DRAG = 12;
const FUEL_RANGE = 15000; // units of road on a full tank
const LIMP_SPEED = 6; // what an empty tank still manages
const BRAKING = 9; // units/s² the governor assumes when it looks for a corner ahead
const CORNER_LOOK = [6, 16, 30, 50, 78];
// How much faster than the grip allows a driver will still take a corner: the
// margin is what the slide and the handbrake are for.
const CORNER_MARGIN = 1.22; // units/s² of deceleration with the handbrake hard on

/**
 * Arcade car feel — not a simulation.
 *
 * There is no fail state, so none of this exists to create challenge; it exists
 * so the car has weight. Every value here is about lag and inertia rather than
 * forces: speed eases toward a target rather than snapping, steering trails the
 * input, and the body leans into what it is doing.
 */
export class CarPhysics {
  constructor() {
    this.speed = 0;
    this.targetSpeed = CONFIG.speed;
    this.steer = 0;
    this.steerVelocity = 0;
    this.lateral = 0;
    this.roll = 0;
    this.pitchTrim = 0;
    this.bob = 0;
    this.travelled = 0;
    this.edgePressure = 0; // 0..1, how hard the car is being held off the verge
    this.knock = 0; // lateral velocity from a collision, decaying
    this.impact = 0; // 0..1 shake from the last collision, decaying
    this.impactYaw = 0; // the body twisting from a hit
    // In a city street the car may mount the pavement, up to the building
    // line: `wall` is that limit, set each frame by collisions.js (null on an
    // open road, where the soft verge applies instead). `wallHit` is raised
    // when the car meets it.
    this.wall = null;
    this.wallHit = 0;

    // Rally handling (see _updateRally). `slide` is the car's drift toward the
    // outside of a bend, in lateral units/s; `bodyYaw` is how far the nose has
    // swung from the road's direction, for the look of it.
    this.slide = 0;
    this.bodyYaw = 0;
    this.handbrake = 0; // 0..1, smoothed
    this.slip = 0; // 0..1, how much the tyres are giving up
    this.dirt = 0; // 0..1, how loose the road under the car is
    this.grip = 1;
    this.spray = 0; // 0..1.5, dust or mud being thrown up
    this.smoke = 0; // 0..1, tyre smoke on a hard surface
    // True while the car is held on a start line.
    this.hold = false;
    // Fuel: 1 is a full tank. Only drains on a route (see rally/stations.js).
    this.fuel = 1;
    this.fuelOn = false;
    // Per-car handling, from the garage: grip and speed multipliers.
    this.stats = { grip: 1, speed: 1, tank: 1 };
    // A distance to stop at: the car slows so as to rest exactly there.
    this.holdAt = null;
    // How many times the car has hit something (for clean-stage bonuses).
    this.crashes = 0;
  }

  /**
   * Hit something. The car keeps going — there is still no fail state — but it
   * loses most of its speed, is shoved sideways and the body twists, so a hit
   * has weight and costs you something.
   *
   * @param {number} speedAfter forward speed to drop to (never raised)
   * @param {number} sideways lateral shove, units/sec (+ is right)
   * @param {number} strength 0..1, how violent it was
   */
  collide(speedAfter, sideways, strength) {
    this.speed = Math.max(0, Math.min(this.speed, speedAfter));
    this.knock += sideways;
    this.impact = Math.min(1, Math.max(this.impact, strength));
    if (strength > 0.12) this.crashes++;
    this.impactYaw += Math.sign(sideways || 1) * strength * 0.25;
  }

  /**
   * @param {number} dt
   * @param {number} input steering, -1..1
   * @param {object} live blended environment profile
   * @param {number} shake extra irregular motion from an extreme weather event
   */
  update(dt, input, live, shake = 0, throttle = 0, handbrake = false) {
    this._updateRally(dt, input, live, handbrake);
    this._updateSpeed(dt, live, throttle);
    this._updateSteering(dt, input);
    this._updateSuspension(dt, live, shake + this.impact * 1.4);
    this.travelled += this.speed * dt;
    if (this.fuelOn) {
      // About three average stages to a tank, and boost drinks it.
      const range = FUEL_RANGE * this.stats.tank;
      this.fuel = Math.max(0, this.fuel - ((this.speed * dt) / range) * (1 + throttle * 0.8));
    }

    // Collision aftermath decays away over a second or so. (The knock itself
    // is applied in _updateSteering, before the wall and verge checks.)
    this.knock *= Math.exp(-3.2 * dt);
    this.impact *= Math.exp(-2.4 * dt);
    this.impactYaw *= Math.exp(-2.8 * dt);
  }

  /**
   * Rally handling, in the road's own frame.
   *
   * The road bends and the car, left alone, goes straight on: relative to the
   * road that is a drift toward the outside of the bend. How hard it drifts is
   * how much more lateral acceleration the corner asks for than the surface
   * can give, `speed² × curvature − grip`. On dry tarmac the highway curves ask
   * for almost nothing; on gravel, and in the wet, rally bends ask for a lot.
   * Steering into the bend wins the ground back, and the slide itself scrubs
   * speed, so a car pushed wide slows down on its own.
   *
   * The handbrake locks the rears: a hard stop, and the nose swings to where
   * you are steering.
   */
  _updateRally(dt, input, live, handbrake) {
    const s = this.travelled;
    const dirt = dirtAt(s);
    const wet = clamp((0.72 - (live.roadRoughness ?? 1)) / 0.38, 0, 1);
    this.dirt = dirt;
    this.grip = (1 - dirt * 0.42) * (1 - wet * 0.22);

    this.handbrake += ((handbrake && !this.hold ? 1 : 0) - this.handbrake) * (1 - Math.exp(-9 * dt));
    const hb = this.handbrake;

    const bend = curvature(s + 5);
    const needed = bend * this.speed * this.speed;
    const available = GRIP_ACCEL * this.grip * this.stats.grip * (1 - hb * 0.5);
    const excess = Math.max(0, Math.abs(needed) - available);
    const target = -Math.sign(needed) * excess * SLIDE_GAIN * (1 - hb * 0.35);
    this.slide += (target - this.slide) * (1 - Math.exp(-3.5 * dt));

    // Scrub: sliding and braking cost speed. The handbrake only bites while the
    // car is moving, so it cannot be used to reverse.
    const scrub = Math.abs(this.slide) * 0.35 + hb * HANDBRAKE_DRAG * Math.min(1, this.speed / 14);
    this.speed = Math.max(0, this.speed - scrub * dt);

    const slipNow = clamp(Math.abs(this.slide) / 5.5 + hb * (this.speed > 6 ? 0.9 : 0), 0, 1.2);
    this.slip += (slipNow - this.slip) * (1 - Math.exp(-6 * dt));

    // The nose: into the bend as the tyres give up, and wherever you are
    // steering when the rears are locked.
    const into = -Math.sign(bend) * Math.min(0.42, this.slip * 0.36 + Math.min(0.12, Math.abs(bend) * this.speed * 0.2) * dirt);
    const yawTarget = into - input * 0.3 * hb;
    this.bodyYaw += (yawTarget - this.bodyYaw) * (1 - Math.exp(-5 * dt));

    const fast = Math.min(1.2, this.speed / CONFIG.speed);
    this.spray = clamp(dirt * fast * (0.3 + this.slip * 1.1), 0, 1.5);
    this.smoke = clamp((1 - dirt) * (this.slip - 0.3) * 1.6, 0, 1);
  }

  /**
   * The fastest the car should be going now, given the bends it can see. Each
   * look-ahead point allows the speed its own bend permits plus what braking
   * can shed over the distance to it (v² = vSafe² + 2·a·d), and the slowest of
   * them wins — so the car is already down to speed when it gets there.
   */
  _cornerSpeed() {
    const available = GRIP_ACCEL * this.grip * this.stats.grip;
    let allowed = Infinity;
    for (const d of CORNER_LOOK) {
      const bend = Math.abs(curvature(this.travelled + d));
      if (bend < 0.0005) continue;
      const safe = Math.sqrt(available / bend) * CORNER_MARGIN;
      allowed = Math.min(allowed, Math.sqrt(safe * safe + 2 * BRAKING * d));
    }
    return allowed;
  }

  _updateSpeed(dt, live, throttle) {
    // Each terrain set has its own comfortable cruise: open highway runs
    // faster than a forest or a mountain pass.
    //
    // Holding the screen asks for more. It scales the set's own cruise rather
    // than replacing it, so a mountain pass still feels slower flat out than an
    // open highway does — the boost is the driver leaning on it, not a
    // different road.
    this.cruise = CONFIG.speed * live.speedScale * (1 - this.dirt * 0.1) * this.stats.speed;
    // The pedal asks for more than the road allows: the governor lifts for a
    // corner ahead unless the throttle is held, which carries the speed in
    // and lets the car push wide.
    const wanted = this.cruise * (1 + throttle * (CONFIG.boostScale - 1));
    const governed = this._cornerSpeed() * (1 + throttle * 0.9);
    let limit = Math.min(wanted, governed);
    if (this.holdAt !== null) {
      // Rest exactly on the mark: v² = 2·a·d, with a gentle approach.
      limit = Math.min(limit, Math.sqrt(2 * 4.5 * Math.max(0, this.holdAt - this.travelled)) + 0.15);
    }
    // An empty tank crawls.
    if (this.fuelOn && this.fuel <= 0.001) limit = Math.min(limit, LIMP_SPEED);
    this.targetSpeed = this.hold ? 0 : limit;

    // Asymmetric: pulling away takes longer than easing off, which is what
    // makes a standing start feel like effort rather than a jump cut.
    const gap = this.targetSpeed - this.speed;
    const rate = gap > 0 ? CONFIG.accelRate : this.hold || this.holdAt !== null ? 7 : CONFIG.brakeRate;

    // Acceleration falls off as the car approaches its cap, so the last few
    // units per second take the longest — a torque curve without the maths.
    // (A held car has a target of zero; dividing by it would turn a speed of
    // exactly zero into NaN and take the whole world with it.)
    const headroom = this.targetSpeed > 0.01 ? Math.max(0.12, 1 - this.speed / (this.targetSpeed * 1.35)) : 1;
    // Steering slackens off as the car gains speed, the way a real one does at
    // motorway pace, so flat out is a committed straight line rather than the
    // same twitchy lane-change with a bigger number attached.
    this.speed += gap * (1 - Math.exp(-rate * headroom * dt));
    // Past the mark there is nothing left to coast on.
    if (this.holdAt !== null && this.travelled > this.holdAt) this.speed *= Math.exp(-9 * dt);
  }

  _updateSteering(dt, input) {
    // Two stages of lag: the wheel follows the finger, and the car follows the
    // wheel. One alone reads as either twitchy or mushy.
    const wheelTarget = clamp(input, -1, 1);
    this.steerVelocity += (wheelTarget - this.steerVelocity) * (1 - Math.exp(-CONFIG.steerResponse * dt));
    this.steer += (this.steerVelocity - this.steer) * (1 - Math.exp(-CONFIG.steerFollow * dt));

    // Lateral rate is capped rather than proportional: past the base cruise the
    // car covers ground faster but does not also change lanes faster, which is
    // what keeps a boost controllable instead of skittish.
    const speedFactor = Math.min(1.25, this.speed / CONFIG.speed);
    // A loose surface gives the front tyres less to bite on, so the same lock
    // moves the car a little less.
    this.lateral += this.steer * CONFIG.steerRate * speedFactor * (1 - this.dirt * 0.16) * dt;
    this.lateral += this.knock * dt;
    this.lateral += this.slide * dt;

    // In a street the buildings are a hard edge: the car stops against them,
    // and how fast it was moving sideways says how hard it hit.
    if (this.wall !== null) {
      if (Math.abs(this.lateral) > this.wall) {
        const into = Math.abs(this.steer * CONFIG.steerRate * speedFactor + this.knock);
        this.wallHit = Math.max(this.wallHit, into);
        this.lateral = Math.sign(this.lateral) * this.wall;
        this.knock = 0;
      }
      this.edgePressure = 0;
    }

    // Soft boundary: rather than a wall, the verge pushes back harder the
    // further onto it you get. There is no way to leave the road and no penalty
    // for trying — the car just declines.
    const limit = CONFIG.maxLateral;
    const over = this.wall !== null ? 0 : Math.abs(this.lateral) - limit;
    if (over > 0) {
      const push = Math.min(1, over / CONFIG.edgeSoftness);
      this.lateral -= Math.sign(this.lateral) * push * CONFIG.edgeReturn * dt;
      this.edgePressure = push;
    } else {
      this.edgePressure = Math.max(0, this.edgePressure - dt * 3);
    }
    // Out of a street, the edge closes back in at verge-return speed rather
    // than snapping, so leaving the pavement where the buildings end eases you
    // back onto the road instead of teleporting you there.
    const verge = limit + CONFIG.edgeSoftness;
    this.release = this.wall !== null
      ? Math.max(verge, Math.abs(this.lateral))
      : Math.max(verge, (this.release ?? verge) - CONFIG.edgeReturn * dt);
    if (this.wall === null) this.lateral = clamp(this.lateral, -this.release, this.release);

    // Body roll trails the steering rather than tracking it, so the car settles
    // after a correction instead of snapping upright.
    const rollTarget = -this.steer * CONFIG.bodyRoll * speedFactor;
    this.roll += (rollTarget - this.roll) * (1 - Math.exp(-CONFIG.rollFollow * dt));
  }

  _updateSuspension(dt, live, shake) {
    // Road texture is a function of distance, not time, so the car stops
    // jiggling when it stops moving.
    const d = this.travelled;
    const texture =
      Math.sin(d * 0.62) * 0.5 + Math.sin(d * 1.53 + 1.1) * 0.32 + Math.sin(d * 3.7 + 2.6) * 0.18;

    const roughness = live.roughness ?? 1;
    const base = texture * 0.035 * roughness;

    // Event shake is layered on top and deliberately irregular — it should not
    // feel like a faster version of the road.
    const gust =
      shake > 0
        ? (Math.sin(d * 7.3 + this.travelled * 0.4) + Math.sin(d * 11.9)) * 0.5 * shake * 0.32
        : 0;

    this.bob = base + gust;
    this.shakeYaw = shake * Math.sin(d * 5.1) * 0.02;
    this.shakeRoll = shake * Math.sin(d * 3.3 + 0.7) * 0.03;
  }
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
