import { CONFIG } from './config.js';

const CAR_HALF_WIDTH = 1.0;
const CAR_LENGTH = 4.5; // centre-to-centre along the road that counts as touching
const CAR_WIDTH = 1.95; // centre-to-centre across the road that counts as touching
const KERB_LINE = CONFIG.roadHalfWidth + 0.2;

/**
 * Hitting the city: building fronts, parked cars and the kerb.
 *
 * Traffic handles its own collisions (it is the thing that moves); this is
 * everything static. Street props report where their building line is and
 * where cars are parked as they are laid (Props.streets / Props.parked), so
 * the solid world is exactly the one on screen.
 */
export class Collisions {
  constructor({ physics, props, sfx, dressing = null }) {
    this.dressing = dressing;
    this.physics = physics;
    this.props = props;
    this.sfx = sfx;
    this.cooldown = 0;
    this.wasOnPavement = false;
  }

  update(state) {
    const { physics, props } = this;
    const s = state.travelled;
    this.cooldown = Math.max(0, this.cooldown - state.dt);

    // Inside a street, the car may use the pavement up to the building line.
    const street = props.streets.find((st) => s >= st.s0 - 1 && s <= st.s1 + 1);
    physics.wall = street ? street.front - CAR_HALF_WIDTH - 0.2 : null;

    // Meeting the buildings: a scrape at a shallow angle, a proper thump if
    // you steer straight into them.
    if (physics.wallHit > 0) {
      const into = physics.wallHit;
      physics.wallHit = 0;
      if (this.cooldown === 0 && into > 1.5) {
        const strength = Math.min(1, 0.15 + into / 14 + state.speed / 120);
        physics.collide(state.speed * (0.9 - strength * 0.5), -Math.sign(state.lateral) * (2 + strength * 5), strength * 0.7);
        this.sfx?.crash(strength * 0.7);
        this.cooldown = 0.7;
      }
    }

    // Mounting or dropping off the kerb is a jolt.
    const onPavement = Math.abs(state.lateral) > KERB_LINE;
    if (onPavement !== this.wasOnPavement && state.live.sidewalk > 0.5) {
      physics.impact = Math.max(physics.impact, 0.18);
    }
    this.wasOnPavement = onPavement;

    // Tyre stacks at the edge of a stage: heavy, and they go over.
    if (this.dressing && this.cooldown === 0) {
      for (const stack of this.dressing.solids) {
        const ds = stack.s - s;
        const dl = stack.lateral - state.lateral;
        if (Math.abs(ds) > 2.9 || Math.abs(dl) > 1.55) continue;
        const strength = Math.min(1, 0.22 + state.speed / 75);
        physics.collide(state.speed * 0.66, -Math.sign(dl || 1) * (1.5 + strength * 3), strength * 0.55);
        this.sfx?.crash(strength * 0.6);
        this.dressing.knock(stack.id, Math.sign(ds) || 1, dl);
        this.cooldown = 0.35;
        break;
      }
    }

    // Parked cars are as solid as moving ones, and do not move.
    for (const car of props.parked) {
      const ds = car.s - s;
      const dl = car.lateral - state.lateral;
      if (Math.abs(ds) > CAR_LENGTH || Math.abs(dl) > CAR_WIDTH || this.cooldown > 0) continue;
      const glancing = Math.abs(dl) > CAR_WIDTH * 0.6 || ds < 0;
      const strength = Math.min(1, 0.2 + state.speed / 45);
      physics.collide(glancing ? state.speed * 0.7 : state.speed * 0.1, -Math.sign(dl || 1) * (4 + strength * 7), strength);
      this.sfx?.crash(strength);
      this.cooldown = 0.9;
      break;
    }
  }
}
