import { CONFIG } from './config.js';
import {
  MOOD_PROFILES,
  MOOD_COLOR_KEYS,
  MOOD_NUMBER_KEYS,
  BLOCK_ORDER,
  MOCK_BLOCKS,
} from './moods.js';
import {
  TERRAIN_PROFILES,
  TERRAIN_COLOR_KEYS,
  TERRAIN_NUMBER_KEYS,
  TERRAIN_ORDER,
  PROP_TYPES,
} from './terrains.js';
import {
  CLIMATE_PROFILES,
  CLIMATE_COLOR_KEYS,
  CLIMATE_NUMBER_KEYS,
  CLIMATE_ORDER,
} from './climates.js';
import { createLiveProfile, blendProfiles, smoothstep, clamp01 } from './blend.js';

const MOOD_KEYS = { colors: MOOD_COLOR_KEYS, numbers: MOOD_NUMBER_KEYS };
const TERRAIN_KEYS = { colors: TERRAIN_COLOR_KEYS, numbers: TERRAIN_NUMBER_KEYS };
const CLIMATE_KEYS = { colors: CLIMATE_COLOR_KEYS, numbers: CLIMATE_NUMBER_KEYS };

// Written by compose() from two or more axes.
const DERIVED_COLORS = ['skyTop', 'skyHorizon', 'skyBottom', 'fogColor', 'groundColor'];

/**
 * One axis of the environment: holds a current and previous profile plus a
 * crossfade between them. Subclasses decide *when* to advance.
 */
class Axis {
  constructor(profiles, keys, startId) {
    this.profiles = profiles;
    this.keys = keys;
    this.fromId = startId;
    this.toId = startId;
    this.transition = 1;
  }

  get isTransitioning() {
    return this.transition < 1;
  }

  get label() {
    const to = this.profiles[this.toId].label;
    if (!this.isTransitioning) return to;
    return `${this.profiles[this.fromId].label} → ${to}`;
  }

  advanceTo(id, immediate = false) {
    if (id === this.toId) return;
    this.fromId = this.toId;
    this.toId = id;
    this.transition = immediate ? 1 : 0;
  }

  step(dt, seconds) {
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / seconds);
    }
  }

  writeInto(live) {
    blendProfiles(
      live,
      this.profiles[this.fromId],
      this.profiles[this.toId],
      smoothstep(this.transition),
      this.keys
    );
  }
}

/**
 * The whole environment: mood, terrain and climate, each on its own clock.
 *
 * - Mood advances on the mock playlist's block boundaries (song-count driven).
 * - Terrain advances on distance travelled — you drive *into* new country.
 * - Climate advances on its own timer and drifts independently of both.
 *
 * Nothing syncs them deliberately, which is the point: the combinations that
 * come up are ones nobody authored.
 */
export class Environment {
  constructor() {
    this.blocks = MOCK_BLOCKS;
    this.order = BLOCK_ORDER;
    this.blockIndex = 0;
    this.songIndex = 0;
    this.songTime = 0;

    this.mood = new Axis(MOOD_PROFILES, MOOD_KEYS, this.order[0]);
    this.terrain = new Axis(TERRAIN_PROFILES, TERRAIN_KEYS, TERRAIN_ORDER[0]);
    this.climate = new Axis(CLIMATE_PROFILES, CLIMATE_KEYS, CLIMATE_ORDER[0]);

    this.nextTerrainAt = CONFIG.terrainRunLength;
    this.climateTime = 0;
    this.nextClimateAt = CONFIG.climateRunSeconds;

    // Lightning, when the climate has any.
    this.flash = 0;
    this.nextStrikeIn = 4;
    this._stormActive = false;

    this.live = createLiveProfile([MOOD_KEYS, TERRAIN_KEYS, CLIMATE_KEYS], DERIVED_COLORS);
    this.propWeights = {};
    this.update(0, 0);
  }

  get currentBlock() {
    const mood = this.order[this.blockIndex % this.order.length];
    return this.blocks.find((block) => block.mood === mood) || this.blocks[0];
  }

  get blockProgress() {
    const total = this.currentBlock.songCount;
    return Math.min(1, (this.songIndex + this.songTime / CONFIG.songSeconds) / total);
  }

  update(dt, travelled) {
    this._updateMood(dt);
    this._updateTerrain(travelled);
    this._updateClimate(dt);

    this.mood.step(dt, CONFIG.crossfadeSeconds);
    this.terrain.step(dt, CONFIG.terrainCrossfadeSeconds);
    this.climate.step(dt, CONFIG.climateCrossfadeSeconds);

    this.mood.writeInto(this.live);
    this.terrain.writeInto(this.live);
    this.climate.writeInto(this.live);

    this._updatePropWeights();
    this._updateLightning(dt);
    this.compose();
  }

  _updateMood(dt) {
    this.songTime += dt;
    while (this.songTime >= CONFIG.songSeconds) {
      this.songTime -= CONFIG.songSeconds;
      this.songIndex++;
      if (this.songIndex >= this.currentBlock.songCount) {
        this.blockIndex = (this.blockIndex + 1) % this.order.length;
        this.songIndex = 0;
        this.mood.advanceTo(this.order[this.blockIndex]);
      }
    }
  }

  _updateTerrain(travelled) {
    if (travelled < this.nextTerrainAt) return;
    this.terrain.advanceTo(pickNext(TERRAIN_ORDER, this.terrain.toId));
    // Vary the run length so the country doesn't change on a metronome.
    this.nextTerrainAt = travelled + CONFIG.terrainRunLength * (0.7 + Math.random() * 0.7);
  }

  _updateClimate(dt) {
    this.climateTime += dt;
    if (this.climateTime < this.nextClimateAt) return;
    this.climate.advanceTo(pickNext(CLIMATE_ORDER, this.climate.toId));
    this.climateTime = 0;
    this.nextClimateAt = CONFIG.climateRunSeconds * (0.6 + Math.random() * 0.8);
  }

  /**
   * Prop shape is the one non-numeric terrain property, so it blends as
   * weights: the outgoing shape scales away while the incoming one grows in.
   */
  _updatePropWeights() {
    const t = smoothstep(this.terrain.transition);
    for (const type of PROP_TYPES) this.propWeights[type] = 0;
    this.propWeights[TERRAIN_PROFILES[this.terrain.fromId].propType] += 1 - t;
    this.propWeights[TERRAIN_PROFILES[this.terrain.toId].propType] += t;
  }

  _updateLightning(dt) {
    this.flash = Math.max(0, this.flash - dt * 4.5);

    const active = this.live.lightning >= 0.5;
    if (active !== this._stormActive) {
      this._stormActive = active;
      // Restart the schedule when a storm rolls in. Without this the countdown
      // only runs during storms, so a storm arriving after a long dry spell
      // would sit silent while it burned through a stale delay.
      if (active) this.nextStrikeIn = 0.4 + Math.random() * 2.5;
    }
    if (!active) return;

    this.nextStrikeIn -= dt;
    if (this.nextStrikeIn > 0) return;

    this.flash = 0.55 + Math.random() * 0.45;
    this.nextStrikeIn = CONFIG.lightningInterval * (0.4 + Math.random() * 1.6);
  }

  /**
   * Combine the three axes into the values the world actually renders with.
   *
   * This is where the system earns its keep: climate veils and dims whatever
   * the mood is doing, and tints whatever terrain is underneath, so a storm
   * reads as a storm at midday or midnight, over grass or over sand.
   */
  compose() {
    const live = this.live;
    const veil = clamp01(live.veilStrength);

    live.skyTop.copy(live.skyTopBase).lerp(live.veilColor, veil * 0.75);
    live.skyHorizon.copy(live.skyHorizonBase).lerp(live.veilColor, veil);
    live.skyBottom.copy(live.skyBottomBase).lerp(live.veilColor, veil);
    live.fogColor.copy(live.fogColorBase).lerp(live.veilColor, veil);

    live.groundColor
      .copy(live.groundColorBase)
      .lerp(live.groundTint, clamp01(live.groundTintStrength));

    live.fogDensity = live.fogDensityBase * live.fogScale;

    // A flash lifts the fill light and blows the exposure for a few frames.
    const flash = this.flash;
    live.ambientIntensity = live.ambientIntensityBase * live.ambientScale + flash * 9;
    live.sunIntensity = live.sunIntensityBase * live.lightDamp;
    live.exposureFinal = live.exposure * (1 + flash * 0.35);

    // Heavy weather and darkness both make the car want its lights on.
    live.headlights = clamp01(
      Math.max(live.headlightBias, live.lampIntensity, veil * 0.8, live.rain, live.snow * 0.7)
    );

    // Beams only read against something to scatter off — fog, rain, snow.
    live.beamStrength = clamp01(live.headlights * (0.25 + live.fogDensity * 26));
  }

  /** Debug-overlay summary of all three axes. */
  get labels() {
    return {
      mood: this.mood.label,
      terrain: this.terrain.label,
      climate: this.climate.label,
    };
  }

  get isTransitioning() {
    return this.mood.isTransitioning || this.terrain.isTransitioning || this.climate.isTransitioning;
  }
}

/** Pick any entry other than the current one, so every change is visible. */
function pickNext(order, current) {
  const options = order.filter((id) => id !== current);
  return options[Math.floor(Math.random() * options.length)];
}
