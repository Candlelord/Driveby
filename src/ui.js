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
    this.event = document.getElementById('hud-event');
    this.flash = document.getElementById('flash');
    this.hint = document.getElementById('hint');
    // A tablet has no arrow keys to offer. Same touch test as the quality tier
    // uses, because iPadOS Safari will happily claim to be a laptop.
    if ((navigator.maxTouchPoints ?? 0) > 0 && this.hint?.dataset.touch) {
      this.hint.textContent = this.hint.dataset.touch;
    }

    this._lastLabel = '';
    this._wasCrossfading = null;
    this._lastSong = '';
    this._lastMiles = '';
    this._lastTerrain = '';
    this._lastClimate = '';
    this._lastBanner = null;
    this._lastFlash = -1;
    this._hintHidden = false;

    this.route = document.getElementById('route');
    this.routeFrom = document.getElementById('route-from');
    this.routeTo = document.getElementById('route-to');
    this.routeLeft = document.getElementById('route-left');
    this.routeCountry = document.getElementById('route-country');
    this.routeFill = document.getElementById('route-fill');
    this.routeTotal = document.getElementById('route-total');
    this.toastRoot = document.getElementById('toast');
    this.fadeRoot = document.getElementById('fade');
    this._routeText = '';
  }

  setRouteVisible(visible) {
    this.route.hidden = !visible;
  }

  setRoute({ from, to, left, country, total, progress }) {
    const text = [from, to, left, country, total].join('|');
    if (text !== this._routeText) {
      this._routeText = text;
      this.routeFrom.textContent = from;
      this.routeTo.textContent = to;
      this.routeLeft.textContent = left;
      this.routeCountry.textContent = country;
      this.routeTotal.textContent = total;
    }
    this.routeFill.style.width = `${(progress * 100).toFixed(2)}%`;
  }

  /** A road-sign moment: a place name, held for a few seconds. */
  toast(title, sub, seconds = 5) {
    this.toastRoot.querySelector('.toast-title').textContent = title;
    this.toastRoot.querySelector('.toast-sub').textContent = sub ?? '';
    this.toastRoot.classList.add('is-live');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastRoot.classList.remove('is-live'), seconds * 1000);
  }

  /** Full-screen fade, with an optional title card. `card` null clears it. */
  setFade(opacity, card) {
    this.fadeRoot.style.opacity = opacity.toFixed(3);
    if (card !== undefined) this.setFadeCard(card);
  }

  setFadeCard(card) {
    this.fadeRoot.querySelector('.fade-title').textContent = card?.title ?? '';
    this.fadeRoot.querySelector('.fade-sub').textContent = card?.sub ?? '';
  }

  /** Debug: briefly name a force-triggered event even before its label lands. */
  flashEvent(name) {
    this.event.textContent = name;
    this.event.classList.add('is-live');
    this._lastEvent = undefined;
  }

  update(environment, state, landmark) {
    const labels = environment.labels;

    if (labels.mood !== this._lastLabel) {
      this.mood.textContent = labels.mood;
      this._lastLabel = labels.mood;
    }
    if (labels.set !== this._lastTerrain) {
      this.terrain.textContent = labels.set;
      this._lastTerrain = labels.set;
    }
    // Terrain, weather and time of year share one line — the season belongs
    // next to the climate, since between them they say what it is like outside.
    const conditions = `${labels.climate} \u00b7 ${labels.season}`;
    if (conditions !== this._lastClimate) {
      this.climate.textContent = conditions;
      this._lastClimate = conditions;
    }

    // One banner line, shared. A landmark takes precedence over an event —
    // if you are driving past the Great Wall in a storm, the wall is the news.
    const banner = landmark ?? labels.event;
    if (banner !== this._lastBanner) {
      this._lastBanner = banner;
      this.event.textContent = banner ?? '';
      this.event.classList.toggle('is-live', Boolean(banner));
    }

    // Drive the lightning wash straight off the flash value.
    const flash = state.live.screenFlash ?? 0;
    if (Math.abs(flash - this._lastFlash) > 0.01) {
      this.flash.style.opacity = (flash * 0.85).toFixed(3);
      this._lastFlash = flash;
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
