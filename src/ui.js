/**
 * Debug overlay only — mood name, block progress, distance. Deliberately DOM
 * rather than in-3D so it costs nothing and is trivial to delete later.
 */
export class Ui {
  constructor() {
    this.root = document.getElementById('hud');
    this.mood = document.getElementById('hud-mood');
    this.bar = document.getElementById('hud-bar');
    this.song = document.getElementById('hud-song');
    this.miles = document.getElementById('hud-miles');
    this.terrain = document.getElementById('hud-terrain');
    this.climate = document.getElementById('hud-climate');
    this.hint = document.getElementById('hint');

    this._lastLabel = '';
    this._wasCrossfading = null;
    this._lastSong = '';
    this._lastMiles = '';
    this._lastTerrain = '';
    this._lastClimate = '';
    this._hintHidden = false;
  }

  update(environment, state) {
    const labels = environment.labels;

    if (labels.mood !== this._lastLabel) {
      this.mood.textContent = labels.mood;
      this._lastLabel = labels.mood;
    }
    if (labels.terrain !== this._lastTerrain) {
      this.terrain.textContent = labels.terrain;
      this._lastTerrain = labels.terrain;
    }
    if (labels.climate !== this._lastClimate) {
      this.climate.textContent = labels.climate;
      this._lastClimate = labels.climate;
    }

    const block = environment.currentBlock;
    const song = `song ${Math.min(environment.songIndex + 1, block.songCount)}/${block.songCount}`;
    if (song !== this._lastSong) {
      this.song.textContent = song;
      this._lastSong = song;
    }

    const miles = `${(state.travelled / 1609.34).toFixed(1)} mi`;
    if (miles !== this._lastMiles) {
      this.miles.textContent = miles;
      this._lastMiles = miles;
    }

    if (environment.isTransitioning !== this._wasCrossfading) {
      this._wasCrossfading = environment.isTransitioning;
      this.root.classList.toggle('is-crossfading', this._wasCrossfading);
    }

    this.bar.style.width = `${(environment.blockProgress * 100).toFixed(1)}%`;
    document.documentElement.style.setProperty('--accent', `#${state.live.accent.getHexString()}`);

    if (!this._hintHidden && state.hasInput && state.time > 3) {
      this.hint.classList.add('is-hidden');
      this._hintHidden = true;
    }
  }
}
