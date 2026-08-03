import { CONFIG } from './config.js';

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
  }

  /**
   * @param {number} dt
   * @param {number} input steering, -1..1
   * @param {object} live blended environment profile
   * @param {number} shake extra irregular motion from an extreme weather event
   */
  update(dt, input, live, shake = 0, throttle = 0) {
    this._updateSpeed(dt, live, throttle);
    this._updateSteering(dt, input);
    this._updateSuspension(dt, live, shake);
    this.travelled += this.speed * dt;
  }

  _updateSpeed(dt, live, throttle) {
    // Each terrain set has its own comfortable cruise: open highway runs
    // faster than a forest or a mountain pass.
    //
    // Holding the screen asks for more. It scales the set's own cruise rather
    // than replacing it, so a mountain pass still feels slower flat out than an
    // open highway does — the boost is the driver leaning on it, not a
    // different road.
    this.cruise = CONFIG.speed * live.speedScale;
    this.targetSpeed = this.cruise * (1 + throttle * (CONFIG.boostScale - 1));

    // Asymmetric: pulling away takes longer than easing off, which is what
    // makes a standing start feel like effort rather than a jump cut.
    const gap = this.targetSpeed - this.speed;
    const rate = gap > 0 ? CONFIG.accelRate : CONFIG.brakeRate;

    // Acceleration falls off as the car approaches its cap, so the last few
    // units per second take the longest — a torque curve without the maths.
    const headroom = Math.max(0.12, 1 - this.speed / (this.targetSpeed * 1.35));
    // Steering slackens off as the car gains speed, the way a real one does at
    // motorway pace, so flat out is a committed straight line rather than the
    // same twitchy lane-change with a bigger number attached.
    this.speed += gap * (1 - Math.exp(-rate * headroom * dt));
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
    this.lateral += this.steer * CONFIG.steerRate * speedFactor * dt;

    // Soft boundary: rather than a wall, the verge pushes back harder the
    // further onto it you get. There is no way to leave the road and no penalty
    // for trying — the car just declines.
    const limit = CONFIG.maxLateral;
    const over = Math.abs(this.lateral) - limit;
    if (over > 0) {
      const push = Math.min(1, over / CONFIG.edgeSoftness);
      this.lateral -= Math.sign(this.lateral) * push * CONFIG.edgeReturn * dt;
      this.edgePressure = push;
    } else {
      this.edgePressure = Math.max(0, this.edgePressure - dt * 3);
    }
    this.lateral = clamp(this.lateral, -limit - CONFIG.edgeSoftness, limit + CONFIG.edgeSoftness);

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
