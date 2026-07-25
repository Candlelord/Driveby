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
    this.hint = document.getElementById('hint');

    this._lastLabel = '';
    this._lastSong = '';
    this._lastMiles = '';
    this._hintHidden = false;
  }

  update(director, state) {
    const label = director.label;
    if (label !== this._lastLabel) {
      this.mood.textContent = label;
      this._lastLabel = label;
    }

    const block = director.currentBlock;
    const song = `song ${Math.min(director.songIndex + 1, block.songCount)}/${block.songCount}`;
    if (song !== this._lastSong) {
      this.song.textContent = song;
      this._lastSong = song;
    }

    const miles = `${(state.travelled / 1609.34).toFixed(1)} mi`;
    if (miles !== this._lastMiles) {
      this.miles.textContent = miles;
      this._lastMiles = miles;
    }

    this.bar.style.width = `${(director.blockProgress * 100).toFixed(1)}%`;
    document.documentElement.style.setProperty('--accent', `#${state.live.accent.getHexString()}`);

    if (!this._hintHidden && state.hasInput && state.time > 3) {
      this.hint.classList.add('is-hidden');
      this._hintHidden = true;
    }
  }
}
