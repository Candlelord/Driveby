import { CONFIG } from './config.js';
import { MOOD_PROFILES, BLOCK_ORDER, MOCK_BLOCKS, PROP_TYPES } from './moods.js';
import { createLiveProfile, blendProfiles, smoothstep } from './blend.js';

/**
 * Drives the whole visual state off a mock playlist.
 *
 * The clock here stands in for audio: each "song" is a fixed number of seconds,
 * and a block ends when its last song does — length is song-count driven, not
 * timer driven, which is how the real Spotify-backed version has to behave.
 * When a block ends the next one starts playing immediately while the
 * environment crossfades underneath it over a few seconds.
 */
export class MoodDirector {
  constructor() {
    this.blocks = MOCK_BLOCKS;
    this.order = BLOCK_ORDER;

    this.blockIndex = 0;
    this.songIndex = 0;
    this.songTime = 0;

    this.fromMood = this.currentBlock.mood;
    this.toMood = this.currentBlock.mood;
    this.transition = 1; // 0..1, 1 = settled

    this.live = createLiveProfile();
    this.propWeights = {};
    this.apply();
  }

  get currentBlock() {
    return this.blockForMood(this.order[this.blockIndex % this.order.length]);
  }

  get nextBlock() {
    return this.blockForMood(this.order[(this.blockIndex + 1) % this.order.length]);
  }

  blockForMood(mood) {
    return this.blocks.find((block) => block.mood === mood) || this.blocks[0];
  }

  get isTransitioning() {
    return this.transition < 1;
  }

  /** Label for the debug overlay — shows both moods mid-crossfade. */
  get label() {
    const from = MOOD_PROFILES[this.fromMood].label;
    const to = MOOD_PROFILES[this.toMood].label;
    return this.isTransitioning ? `${from} → ${to}` : to;
  }

  update(dt) {
    this.songTime += dt;
    while (this.songTime >= CONFIG.songSeconds) {
      this.songTime -= CONFIG.songSeconds;
      this.songIndex++;
      if (this.songIndex >= this.currentBlock.songCount) {
        this.advanceBlock();
      }
    }

    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / CONFIG.crossfadeSeconds);
    }

    this.apply();
  }

  advanceBlock() {
    this.fromMood = this.currentBlock.mood;
    this.blockIndex = (this.blockIndex + 1) % this.order.length;
    this.toMood = this.currentBlock.mood;
    this.songIndex = 0;
    this.transition = 0;
  }

  apply() {
    const t = smoothstep(this.transition);
    blendProfiles(this.live, MOOD_PROFILES[this.fromMood], MOOD_PROFILES[this.toMood], t);

    // Prop shape is the one non-numeric property, so it blends as weights:
    // the outgoing shape scales away while the incoming one grows in.
    const fromType = MOOD_PROFILES[this.fromMood].propType;
    const toType = MOOD_PROFILES[this.toMood].propType;
    for (const type of PROP_TYPES) this.propWeights[type] = 0;
    this.propWeights[fromType] += 1 - t;
    this.propWeights[toType] += t;
  }

  /** Fraction of the current block that has played, for the debug bar. */
  get blockProgress() {
    const total = this.currentBlock.songCount;
    return Math.min(1, (this.songIndex + this.songTime / CONFIG.songSeconds) / total);
  }
}
