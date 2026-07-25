import * as THREE from 'three';
import { CONFIG } from './config.js';
import { MOOD_PROFILES, MOOD_COLOR_KEYS, MOOD_NUMBER_KEYS, BLOCK_ORDER, MOCK_BLOCKS } from './moods.js';
import { TERRAIN_SETS, TERRAIN_POOLS, SET_COLOR_KEYS, SET_NUMBER_KEYS } from './terrainSets.js';
import { CLIMATE_PROFILES, CLIMATE_COLOR_KEYS, CLIMATE_NUMBER_KEYS } from './climates.js';
import { EventDirector } from './events.js';
import { createLiveProfile, blendProfiles, blendLiveToward, smoothstep, clamp01 } from './blend.js';

const MOOD_KEYS = { colors: MOOD_COLOR_KEYS, numbers: MOOD_NUMBER_KEYS };
const SET_KEYS = { colors: SET_COLOR_KEYS, numbers: SET_NUMBER_KEYS };
const CLIMATE_KEYS = { colors: CLIMATE_COLOR_KEYS, numbers: CLIMATE_NUMBER_KEYS };

// Written by compose() from two or more layers.
const DERIVED_COLORS = ['skyTop', 'skyHorizon', 'skyBottom', 'fogColor', 'groundColor'];

// Aurora forces a clear night whatever the mood was doing.
const CLEAR_NIGHT = {
  top: new THREE.Color(0x05060e),
  horizon: new THREE.Color(0x101a30),
  bottom: new THREE.Color(0x0b1020),
};

/** One crossfading axis: a current profile, a previous one, and a mix. */
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

  advanceTo(id) {
    if (id === this.toId) return false;
    this.fromId = this.toId;
    this.toId = id;
    this.transition = 0;
    return true;
  }

  step(dt, seconds) {
    if (this.transition < 1) this.transition = Math.min(1, this.transition + dt / seconds);
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
 * The whole environment, in four layers.
 *
 *   mood        palette, light, lens, grade      — advances on song blocks
 *   terrain set place, landform, scenery         — drawn from the mood's pool
 *   climate     air, precipitation, visibility   — named by the terrain set
 *   event       rare dramatic overlay            — its own scheduler
 *
 * Later layers override earlier ones in compose(), which is what lets a
 * sandstorm read as a sandstorm over any set in any mood.
 */
export class Environment {
  constructor() {
    this.blocks = MOCK_BLOCKS;
    this.order = BLOCK_ORDER;
    this.blockIndex = 0;
    this.songIndex = 0;
    this.songTime = 0;

    const startMood = this.order[0];
    const startSet = TERRAIN_POOLS[startMood][0];

    this.mood = new Axis(MOOD_PROFILES, MOOD_KEYS, startMood);
    this.set = new Axis(TERRAIN_SETS, SET_KEYS, startSet);
    this.climate = new Axis(CLIMATE_PROFILES, CLIMATE_KEYS, TERRAIN_SETS[startSet].climate);

    // Props swap outside the fog rather than cross-scaling, so scenery is
    // tracked as distance segments: everything past a boundary belongs to the
    // set that was current when the boundary was laid down.
    this.setSegments = [{ from: -Infinity, setId: startSet }];

    this.events = new EventDirector(CONFIG);
    this.flash = 0;
    this.nextStrikeIn = 2;
    this._strikesActive = false;

    this.live = createLiveProfile([MOOD_KEYS, SET_KEYS, CLIMATE_KEYS], DERIVED_COLORS);
    this.overrides = {};
    this.update(0, 0);
  }

  /**
   * Swap the mock playlist for real blocks built from the user's library.
   * `onSong` is called with each track as it starts, so playback and the
   * environment stay on the same clock.
   */
  useBlocks(blocks, onSong) {
    this.blocks = blocks;
    this.order = blocks.map((block) => block.mood);
    this.blockIndex = 0;
    this.songIndex = 0;
    this.songTime = 0;
    this.onSong = onSong;
    this.mood.advanceTo(this.order[0]);
    this._emitSong();
  }

  /** Called by the player when a real track finishes, in place of the timer. */
  songFinished(travelled) {
    this.songTime = 0;
    this._advanceSong(travelled);
  }

  _emitSong() {
    const block = this.currentBlock;
    const song = block.songs?.[this.songIndex];
    if (song && this.onSong) this.onSong(song);
  }

  get currentBlock() {
    const mood = this.order[this.blockIndex % this.order.length];
    return this.blocks.find((block) => block.mood === mood) || this.blocks[0];
  }

  get blockProgress() {
    const total = this.currentBlock.songCount;
    return Math.min(1, (this.songIndex + this.songTime / CONFIG.songSeconds) / total);
  }

  get labels() {
    return {
      mood: this.mood.label,
      set: this.set.label,
      climate: this.climate.label,
      event: this.events.label,
    };
  }

  get isTransitioning() {
    return this.mood.isTransitioning || this.set.isTransitioning || this.climate.isTransitioning;
  }

  /** Which terrain set the scenery at this distance belongs to. */
  setAt(distance) {
    for (let i = this.setSegments.length - 1; i >= 0; i--) {
      if (distance >= this.setSegments[i].from) return this.setSegments[i].setId;
    }
    return this.setSegments[0].setId;
  }

  update(dt, travelled) {
    this._updateMood(dt, travelled);

    this.mood.step(dt, CONFIG.crossfadeSeconds);
    this.set.step(dt, CONFIG.setCrossfadeSeconds);
    this.climate.step(dt, CONFIG.setCrossfadeSeconds);

    this.mood.writeInto(this.live);
    this.set.writeInto(this.live);
    this.climate.writeInto(this.live);

    this.overrides = this.events.update(dt, this.mood.toId);
    this._updateLightning(dt);
    this._pruneSegments(travelled);
    this.compose();
  }

  _updateMood(dt, travelled) {
    // Real playback drives the clock when there is a library; the mock timer
    // stands in when there is not.
    if (this.onSong) return;

    this.songTime += dt;
    while (this.songTime >= CONFIG.songSeconds) {
      this.songTime -= CONFIG.songSeconds;
      this._advanceSong(travelled);
    }
  }

  _advanceSong(travelled) {
    this.songIndex++;
    if (this.songIndex >= this.currentBlock.songCount) {
      this.blockIndex = (this.blockIndex + 1) % this.order.length;
      this.songIndex = 0;
      this._startBlock(travelled);
    }
    this._emitSong();
  }

  /** A new block picks a new place from the incoming mood's pool. */
  _startBlock(travelled) {
    const mood = this.order[this.blockIndex];
    this.mood.advanceTo(mood);

    const pool = TERRAIN_POOLS[mood];
    const options = pool.filter((id) => id !== this.set.toId);
    const nextSet = options.length
      ? options[Math.floor(Math.random() * options.length)]
      : pool[0];

    if (this.set.advanceTo(nextSet)) {
      this.climate.advanceTo(TERRAIN_SETS[nextSet].climate);
      // New scenery starts beyond the fog, so the swap itself is never seen.
      this.setSegments.push({ from: travelled + CONFIG.propSwapDistance, setId: nextSet });
    }
  }

  _pruneSegments(travelled) {
    while (this.setSegments.length > 1 && this.setSegments[1].from < travelled - 200) {
      this.setSegments.shift();
    }
  }

  _updateLightning(dt) {
    this.flash = Math.max(0, this.flash - dt * 4.5);

    const active = (this.overrides.strikes ?? 0) > 0.4;
    if (active !== this._strikesActive) {
      this._strikesActive = active;
      // Restart the schedule when a storm arrives, so the first strike does not
      // have to wait out a stale countdown.
      if (active) this.nextStrikeIn = 0.4 + Math.random() * 2.5;
    }
    if (!active) return;

    this.nextStrikeIn -= dt;
    if (this.nextStrikeIn > 0) return;

    this.flash = 0.55 + Math.random() * 0.45;
    this.nextStrikeIn = CONFIG.lightningInterval * (0.4 + Math.random() * 1.6);
  }

  /** Combine the layers into the values the world actually renders with. */
  compose() {
    const live = this.live;
    const ov = this.overrides;

    // --- event climate (snow event, lightning's storm) pulls the blended
    // --- climate rather than replacing one of its endpoints.
    if (ov.climate && ov.climateBlend > 0) {
      blendLiveToward(live, CLIMATE_PROFILES[ov.climate], clamp01(ov.climateBlend), CLIMATE_KEYS);
    }

    // --- straight numeric overrides
    const veil = clamp01(ov.veilStrength ?? live.veilStrength);
    const veilColor = ov.veilColor !== undefined ? tmpColor(ov.veilColor) : live.veilColor;
    const fogScale = live.fogScale * (ov.fogScale ?? 1);
    const lightDamp = live.lightDamp * (ov.lightDamp ?? 1);

    // Events add to what is underneath rather than replacing it, so a tornado
    // over a rainy block keeps the rain.
    live.rain = ov.rain !== undefined ? Math.max(live.rain, ov.rain) : live.rain;
    live.drift = ov.drift !== undefined ? ov.drift : live.drift;
    live.haze = ov.haze !== undefined ? Math.max(live.haze, ov.haze) : live.haze;
    live.hazeSize = ov.hazeSize ?? live.hazeSize;
    live.wind = ov.wind ?? live.wind;

    // ...except when an event explicitly wants stillness.
    const quiet = clamp01(ov.quiet ?? 0);
    if (quiet > 0) {
      live.rain *= 1 - quiet;
      live.drift *= 1 - quiet;
      live.haze *= 1 - quiet;
    }

    // --- sky and fog
    live.skyTop.copy(live.skyTopBase).lerp(veilColor, veil * 0.75);
    live.skyHorizon.copy(live.skyHorizonBase).lerp(veilColor, veil);
    live.skyBottom.copy(live.skyBottomBase).lerp(veilColor, veil);
    live.fogColor.copy(live.fogColorBase).lerp(veilColor, veil);

    // The terrain set's own push on the sky — how a burned forest goes orange
    // or a rural dusk goes violet without leaving the Sad palette.
    const nudge = clamp01(live.skyNudgeStrength);
    if (nudge > 0) {
      live.skyTop.lerp(live.skyNudge, nudge * 0.5);
      live.skyHorizon.lerp(live.skyNudge, nudge);
      live.skyBottom.lerp(live.skyNudge, nudge * 0.8);
      live.fogColor.lerp(live.skyNudge, nudge * 0.7);
    }

    if (ov.fogOverrideStrength > 0) {
      const dust = tmpColorB(ov.fogColorOverride);
      live.fogColor.lerp(dust, clamp01(ov.fogOverrideStrength));
      live.skyHorizon.lerp(dust, clamp01(ov.fogOverrideStrength));
      live.skyBottom.lerp(dust, clamp01(ov.fogOverrideStrength) * 0.9);
    }

    const clearNight = clamp01(ov.clearNight ?? 0);
    if (clearNight > 0) {
      live.skyTop.lerp(CLEAR_NIGHT.top, clearNight);
      live.skyHorizon.lerp(CLEAR_NIGHT.horizon, clearNight);
      live.skyBottom.lerp(CLEAR_NIGHT.bottom, clearNight);
      live.fogColor.lerp(CLEAR_NIGHT.bottom, clearNight);
      // Recolouring the dome is not enough on its own — the sun's scattering
      // halo and its disc are separate, and would still be blazing away in what
      // is supposed to be a night sky.
      live.sunGlowStrength *= 1 - clearNight;
      live.discOpacity *= 1 - clearNight * 0.92;
      live.discIntensity *= 1 - clearNight * 0.55;
      live.lampIntensity = Math.max(live.lampIntensity, clearNight * 0.9);
    }

    // --- ground
    live.groundColor
      .copy(live.groundColorBase)
      .lerp(live.groundTint, clamp01(live.groundTintStrength));

    live.fogDensity = live.fogDensityBase * fogScale;

    // --- light
    const flash = this.flash;
    const nightDim = 1 - clearNight * 0.72;
    live.ambientIntensity = live.ambientIntensityBase * live.ambientScale * nightDim + flash * 9;
    live.sunIntensity = live.sunIntensityBase * lightDamp * nightDim;
    live.exposureFinal = live.exposure * (1 + flash * 0.35);
    live.starOpacityFinal = clamp01(live.starOpacity + (ov.starBoost ?? 0) * 0.9);
    live.bloomStrengthFinal = live.bloomStrength + (ov.bloomBoost ?? 0);

    // --- car and world flags read straight off the overrides
    live.headlights = clamp01(
      Math.max(live.headlightBias, live.lampIntensity, veil * 0.8, live.rain, live.drift * 0.7)
    );
    live.beamStrength = clamp01(live.headlights * (0.25 + live.fogDensity * 26));

    live.funnel = ov.funnel ?? 0;
    live.funnelNear = ov.funnelNear ?? 0;
    live.debris = ov.debris ?? 0;
    live.aurora = ov.aurora ?? 0;
    live.shake = ov.shake ?? 0;
    live.propLean = ov.propLean ?? 0;
    live.screenFlash = flash;
  }
}

// Two scratch colours rather than one: the veil colour is held as a reference
// across several lerps, so a second tmpColor() call would quietly corrupt it.
const SCRATCH_A = new THREE.Color();
const SCRATCH_B = new THREE.Color();
function tmpColor(hex) {
  return SCRATCH_A.set(hex);
}
function tmpColorB(hex) {
  return SCRATCH_B.set(hex);
}
