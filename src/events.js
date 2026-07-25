// Extreme weather events.
//
// A fourth layer, sitting on top of mood / terrain set / climate rather than
// belonging to any of them. An event is a short timeline of phases; at each
// moment it produces a set of *overrides* that get applied last in compose(),
// plus a few flags the world reads directly (funnel cloud, aurora ribbons,
// screen flash, camera shake).
//
// None of them touch steering or the car's control — they are atmospheric
// beats, and this game has no fail state.

import { clamp01, smoothstep } from './blend.js';

/**
 * Each event declares a total duration and an `at(t)` returning the overrides
 * for normalised time t in [0,1]. Anything omitted is left as the layers below
 * had it.
 */
export const EVENTS = {
  // Builds on the horizon, passes through in a whiteout, clears faster than it
  // arrived. Best over a Sad block.
  tornado: {
    label: 'tornado',
    duration: 46,
    moods: ['sad'],
    at(t) {
      const build = smoothstep(clamp01(t / 0.55)); // slow approach
      const peak = bump(t, 0.62, 0.72); // the pass-through
      const clear = smoothstep(clamp01((t - 0.78) / 0.22));
      const present = Math.max(build * (1 - clear), peak);

      return {
        funnel: build * (1 - clear),
        funnelNear: smoothstep(clamp01((t - 0.35) / 0.3)) * (1 - clear),
        veilColor: 0x8f9a63, // sickly green-grey
        veilStrength: present * 0.72,
        fogScale: 1 + present * 1.6 + peak * 5,
        lightDamp: 1 - present * 0.72,
        wind: 0.3 + present * 1.9,
        debris: present * 0.9 + peak * 1.2,
        rain: present * 0.5,
        shake: peak * 1.4 + build * 0.15,
        propLean: present, // trees bend away from the funnel
      };
    },
  },

  // A burst of flashes with the rain briefly stepping up behind them.
  lightning: {
    label: 'lightning storm',
    duration: 34,
    moods: ['sad'],
    at(t) {
      const envelope = smoothstep(clamp01(t / 0.15)) * (1 - smoothstep(clamp01((t - 0.7) / 0.3)));
      return {
        climate: 'storm',
        climateBlend: envelope,
        strikes: envelope, // strike scheduler runs while this is up
        wind: 0.3 + envelope * 0.7,
        shake: 0,
      };
    },
  },

  // A wall of dust rolling in from one side. Hip-hop context: the neon has to
  // fight through it.
  sandstorm: {
    label: 'sandstorm',
    duration: 40,
    moods: ['hiphop'],
    at(t) {
      const roll = smoothstep(clamp01(t / 0.3));
      const hold = 1 - smoothstep(clamp01((t - 0.62) / 0.38));
      const present = roll * hold;
      return {
        veilColor: 0xb06a30,
        veilStrength: present * 0.85,
        fogColorOverride: 0x8a4e22,
        fogOverrideStrength: present,
        fogScale: 1 + present * 3.4,
        lightDamp: 1 - present * 0.55,
        wind: 0.2 + present * 1.6,
        debris: present * 0.55,
        haze: 0.3 + present * 0.7,
        hazeSize: 1.6 + present * 2.4,
        bloomBoost: present * 0.5, // neon reads hazy rather than sharp
        shake: present * 0.25,
      };
    },
  },

  // Can run over any mood, but reads best on Chill. Everything pales.
  snow: {
    label: 'snowfall',
    duration: 70,
    moods: ['chill', 'sad', 'happy'],
    at(t) {
      const envelope = smoothstep(clamp01(t / 0.18)) * (1 - smoothstep(clamp01((t - 0.75) / 0.25)));
      return {
        climate: 'snow',
        climateBlend: envelope,
        shake: 0,
      };
    },
  },

  // The rare, quiet one. Forces a clear night sky for its duration.
  aurora: {
    label: 'aurora',
    duration: 60,
    moods: null, // any
    at(t) {
      const envelope = smoothstep(clamp01(t / 0.2)) * (1 - smoothstep(clamp01((t - 0.72) / 0.28)));
      return {
        aurora: envelope,
        clearNight: envelope, // pull the sky to a clear night whatever the mood
        // Explicit rather than `rain: 0`: the other events' amounts combine by
        // max (so a tornado never *removes* a Sad block's rain), and aurora is
        // the one that genuinely needs to silence what is underneath it.
        quiet: envelope,
        fogScale: 1 - envelope * 0.45,
        starBoost: envelope,
        shake: 0,
      };
    },
  },
};

export const EVENT_NAMES = Object.keys(EVENTS);

/**
 * Runs at most one event at a time, picks new ones occasionally, and can be
 * forced from the debug keys.
 */
export class EventDirector {
  constructor(config) {
    this.config = config;
    this.active = null;
    this.elapsed = 0;
    this.cooldown = config.eventFirstDelay;
    this.overrides = {};
    this.forced = null;
  }

  get label() {
    return this.active ? EVENTS[this.active].label : null;
  }

  get progress() {
    return this.active ? this.elapsed / EVENTS[this.active].duration : 0;
  }

  /** Debug hook: start an event immediately, cancelling anything running. */
  force(name) {
    if (!EVENTS[name]) return false;
    this.active = name;
    this.elapsed = 0;
    return true;
  }

  stop() {
    this.active = null;
    this.elapsed = 0;
    this.cooldown = this.config.eventCooldown;
    this.overrides = {};
  }

  update(dt, mood) {
    if (this.active) {
      this.elapsed += dt;
      const event = EVENTS[this.active];
      if (this.elapsed >= event.duration) {
        this.stop();
      } else {
        this.overrides = event.at(this.elapsed / event.duration);
        return this.overrides;
      }
    }

    this.overrides = {};
    this.cooldown -= dt;
    if (this.cooldown > 0) return this.overrides;

    this.cooldown = this.config.eventCooldown * (0.6 + Math.random() * 1.4);
    if (Math.random() < this.config.eventChance) {
      const candidates = EVENT_NAMES.filter((name) => {
        const moods = EVENTS[name].moods;
        // Aurora is rarer than the rest, and takes any mood.
        if (name === 'aurora') return Math.random() < 0.35;
        return !moods || moods.includes(mood);
      });
      if (candidates.length) {
        this.active = candidates[Math.floor(Math.random() * candidates.length)];
        this.elapsed = 0;
      }
    }
    return this.overrides;
  }
}

/** A smooth 0→1→0 pulse between two times. */
function bump(t, start, end) {
  if (t < start || t > end) return 0;
  const x = (t - start) / (end - start);
  return Math.sin(x * Math.PI);
}
