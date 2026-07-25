/**
 * Playback.
 *
 * Option A is the Web Playback SDK: the app becomes a Spotify Connect device
 * and gets real in-browser audio. It requires Premium. Option B, the fallback,
 * is deep-linking to the Spotify app — no in-app audio, but it works for
 * everyone.
 *
 * A hard constraint shapes everything here: the SDK streams through a
 * DRM-sandboxed element. There is no raw buffer, so no AnalyserNode, no beat
 * detection, and no filter can be attached to the music. `setVolume` is the
 * only lever, which is why ducking is a coarse volume dip rather than the
 * low-pass an audio engineer would reach for. The muffling all happens on our
 * own SFX bus instead.
 */

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

export class Player {
  constructor(auth) {
    this.auth = auth;
    this.mode = 'none'; // 'sdk' | 'deeplink' | 'none'
    this.ready = false;
    this.deviceId = null;
    this.current = null;
    this.baseVolume = 0.8;
    this._duckLevel = 0;
    this._duckUntil = 0;
    this._sdk = null;
  }

  get isPremium() {
    return this.mode === 'sdk';
  }

  /**
   * Try the SDK; fall back to deep links if the account is not Premium or the
   * SDK cannot initialise.
   * @returns {Promise<'sdk'|'deeplink'>}
   */
  async connect(profile) {
    if (profile?.product && profile.product !== 'premium') {
      this.mode = 'deeplink';
      return this.mode;
    }

    try {
      await loadScript(SDK_URL);
      await this._initSdk();
      this.mode = 'sdk';
    } catch {
      this.mode = 'deeplink';
    }
    return this.mode;
  }

  _initSdk() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Spotify SDK timed out')), 12_000);

      const start = () => {
        const player = new window.Spotify.Player({
          name: 'Endless Road Trip',
          getOAuthToken: (cb) => {
            this.auth.token().then(cb).catch(() => cb(''));
          },
          volume: this.baseVolume,
        });

        player.addListener('ready', ({ device_id }) => {
          clearTimeout(timeout);
          this.deviceId = device_id;
          this.ready = true;
          resolve();
        });
        player.addListener('initialization_error', ({ message }) => reject(new Error(message)));
        player.addListener('authentication_error', ({ message }) => reject(new Error(message)));
        player.addListener('account_error', ({ message }) => reject(new Error(message)));
        player.addListener('player_state_changed', (state) => {
          if (!state) return;
          this.current = state.track_window?.current_track ?? null;
          this.paused = state.paused;
          this.position = state.position;
          this.duration = state.duration;
          if (state.paused && state.position === 0 && this._onTrackEnd) this._onTrackEnd();
        });

        this._sdk = player;
        player.connect();
      };

      if (window.Spotify) start();
      else window.onSpotifyWebPlaybackSDKReady = start;
    });
  }

  /** Called when a track finishes, so the block clock can advance. */
  onTrackEnd(handler) {
    this._onTrackEnd = handler;
  }

  async playTrack(track) {
    if (this.mode === 'deeplink') {
      // No in-app audio: hand off to the Spotify app and let it take over.
      window.open(`https://open.spotify.com/track/${track.id}`, '_blank', 'noopener');
      return false;
    }
    if (!this.ready) return false;

    const token = await this.auth.token();
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [track.uri] }),
    });
    return true;
  }

  pause() {
    this._sdk?.pause();
  }

  /**
   * Briefly dip the music under a one-shot. Small and simple on purpose — this
   * is a blunt volume change, not a mix, so anything more than a slight dip
   * reads as a mistake.
   */
  duck(amount = 0.15, seconds = 1) {
    this._duckLevel = Math.max(this._duckLevel, Math.min(0.35, amount));
    this._duckUntil = Math.max(this._duckUntil, performance.now() + seconds * 1000);
  }

  /** Crossfade support for block boundaries: the music side of the fade. */
  setBlockFade(fade) {
    this._blockFade = Math.max(0, Math.min(1, fade));
  }

  update() {
    if (this.mode !== 'sdk' || !this.ready) return;

    if (performance.now() > this._duckUntil) this._duckLevel *= 0.9;
    const target = this.baseVolume * (1 - this._duckLevel) * (this._blockFade ?? 1);

    if (Math.abs((this._lastVolume ?? -1) - target) > 0.01) {
      this._lastVolume = target;
      this._sdk.setVolume(target).catch(() => {});
    }
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
