import { whiteNoiseBuffer, brownNoiseBuffer, rainBuffer, loopSource } from './noise.js';

/**
 * The sound of being inside the car.
 *
 * Everything here is our own audio, which matters: the Spotify stream is DRM
 * sandboxed and cannot be analysed or filtered, so all the "muffling" the brief
 * asks for happens on *this* bus. The music is only ever touched through the
 * SDK's own volume control (see player.js), and only for brief ducks.
 *
 * Signal chain:
 *   engine / wind / road / rain / drift / gust  ->  per-layer gain
 *     -> SFX low-pass (opens in clear weather, closes in heavy)
 *     -> master gain -> destination
 */
export class Sfx {
  constructor() {
    this.context = null;
    this.started = false;
    this.muted = false;
    this.masterLevel = 0.75;
    this._duckUntil = 0;
    this._nextAmbience = 8;
  }

  /**
   * Browsers require a gesture before audio can start, so this is called from
   * the first real input rather than at load.
   */
  start() {
    if (this.started) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    this.context = new Ctx();
    this.started = true;

    const ctx = this.context;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.masterLevel;
    this.master.connect(ctx.destination);

    // The one filter that does the "outside world is muffled" work.
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 18000;
    this.lowpass.Q.value = 0.7;
    this.lowpass.connect(this.master);

    this.white = whiteNoiseBuffer(ctx);
    this.brown = brownNoiseBuffer(ctx);
    this.rainNoise = rainBuffer(ctx);

    this._buildEngine();
    this._buildWind();
    this._buildRoad();
    this._buildWeather();
  }

  /**
   * Two detuned saws through a low-pass — the classic cheap engine. The
   * detuning is what stops it reading as a synth tone.
   */
  _buildEngine() {
    const ctx = this.context;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineFilter.Q.value = 3.5;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.lowpass);

    this.engineOscillators = [];
    for (const [type, detune, level] of [
      ['sawtooth', 0, 0.5],
      ['sawtooth', 7, 0.35],
      ['square', -1200, 0.18], // an octave down for body
    ]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 48;
      osc.detune.value = detune;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(this.engineFilter);
      osc.start();
      this.engineOscillators.push(osc);
    }
  }

  _buildWind() {
    const ctx = this.context;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windFilter.connect(this.lowpass);
    this.wind = loopSource(ctx, this.white, this.windFilter, 0);
  }

  _buildRoad() {
    const ctx = this.context;
    this.roadFilter = ctx.createBiquadFilter();
    this.roadFilter.type = 'lowpass';
    this.roadFilter.frequency.value = 900;
    this.roadFilter.connect(this.lowpass);
    this.road = loopSource(ctx, this.brown, this.roadFilter, 0);
  }

  _buildWeather() {
    const ctx = this.context;

    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'highpass';
    this.rainFilter.frequency.value = 900;
    this.rainFilter.connect(this.lowpass);
    this.rain = loopSource(ctx, this.rainNoise, this.rainFilter, 0);

    // Snow and ash: not silence, but a soft hush that removes the top end.
    this.hushFilter = ctx.createBiquadFilter();
    this.hushFilter.type = 'lowpass';
    this.hushFilter.frequency.value = 420;
    this.hushFilter.connect(this.lowpass);
    this.hush = loopSource(ctx, this.white, this.hushFilter, 0);

    // Storm and tornado gusts: low, slow-moving noise.
    this.gustFilter = ctx.createBiquadFilter();
    this.gustFilter.type = 'bandpass';
    this.gustFilter.frequency.value = 220;
    this.gustFilter.Q.value = 0.9;
    this.gustFilter.connect(this.lowpass);
    this.gust = loopSource(ctx, this.brown, this.gustFilter, 0);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) ramp(this.master.gain, muted ? 0 : this.masterLevel, 0.25, this.context);
  }

  /**
   * @param {object} state driving state
   * @param {object} live blended environment profile
   * @param {object} [music] optional player, for one-shot ducking
   */
  update(state, live, music) {
    if (!this.started || this.context.state === 'suspended') return;

    const ctx = this.context;
    const speed = state.speed / 34; // normalised against base cruise
    const t = ctx.currentTime;

    // --- engine: pitch and volume both climb with speed
    const rpm = 46 + speed * 74;
    for (const osc of this.engineOscillators) {
      osc.frequency.setTargetAtTime(rpm, t, 0.12);
    }
    this.engineFilter.frequency.setTargetAtTime(240 + speed * 520, t, 0.15);
    this.engineGain.gain.setTargetAtTime(0.1 + speed * 0.13, t, 0.2);

    // --- wind and road, both speed-driven
    const tunnelDuck = 1 - (live.tunnelCoverage ?? 0) * 0.7;
    this.wind.gain.gain.setTargetAtTime(Math.max(0, speed - 0.15) * 0.14 * tunnelDuck, t, 0.25);
    this.windFilter.frequency.setTargetAtTime(520 + speed * 700, t, 0.25);

    const roughness = live.roughness ?? 1;
    const boxed = 1 + (live.tunnelCoverage ?? 0) * 0.8;
    this.road.gain.gain.setTargetAtTime(speed * 0.16 * roughness * boxed, t, 0.2);
    this.roadFilter.frequency.setTargetAtTime(420 + speed * 900 * roughness, t, 0.2);

    // --- weather layers straight off the climate
    this.rain.gain.gain.setTargetAtTime(live.rain * 0.2, t, 0.5);
    this.rainFilter.frequency.setTargetAtTime(1400 - live.rain * 600, t, 0.5);
    this.hush.gain.gain.setTargetAtTime(live.drift * 0.06, t, 0.8);
    this.gust.gain.gain.setTargetAtTime(Math.max(0, live.wind - 0.35) * 0.3, t, 0.4);
    this.gustFilter.frequency.setTargetAtTime(160 + live.wind * 260, t, 0.4);

    // --- the muffle. Heavy weather closes the filter down, so the outside
    // --- world thickens; clear skies open it back up and everything breathes.
    const severity = Math.min(
      1,
      live.rain * 0.5 + live.drift * 0.4 + Math.max(0, live.wind - 0.3) * 0.7 + live.fogDensity * 18
    );
    // A tunnel does the opposite of weather: it strips the wind but boxes the
    // sound in, so the cutoff drops and the road layer swells.
    const tunnel = live.tunnelCoverage ?? 0;
    const cutoff = (18000 - severity * 15800) * (1 - tunnel * 0.72);
    this.lowpass.frequency.setTargetAtTime(Math.max(500, cutoff), t, 0.6);

    // --- rumble strip when the car leans on the verge
    if (state.edgePressure > 0.05 && !this._rumbling) {
      this._rumbling = true;
      this.road.gain.gain.setTargetAtTime(0.34, t, 0.05);
    } else if (state.edgePressure <= 0.05) {
      this._rumbling = false;
    }

    this._updateAmbience(state, live, music);
  }

  /**
   * Occasional one-shots — a bird, a gull, a distant thunder roll. Each one
   * briefly ducks the music, which is the only handle the SDK gives us.
   */
  _updateAmbience(state, live, music) {
    this._nextAmbience -= state.dt;
    if (this._nextAmbience > 0) return;
    this._nextAmbience = 9 + Math.random() * 22;

    if (live.screenFlash > 0.3) {
      this.thunder();
      music?.duck(0.2, 2.2);
      return;
    }
    // Nothing sings in a storm.
    if (live.rain > 0.5 || live.wind > 0.8) return;

    this.chirp(live.lampIntensity > 0.5 ? 'night' : 'day');
    music?.duck(0.12, 0.9);
  }

  /** A short two-note call, FM-ish. Cheap, and reads as "a bird" well enough. */
  chirp(kind = 'day') {
    if (!this.started) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const base = kind === 'night' ? 380 : 1900 + Math.random() * 900;

    const osc = ctx.createOscillator();
    osc.type = kind === 'night' ? 'sine' : 'triangle';
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(kind === 'night' ? 0.035 : 0.06, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * (kind === 'night' ? 0.7 : 1.4), t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.4);

    osc.connect(gain).connect(this.lowpass);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  /** A noise burst dragged down through a closing filter. */
  thunder() {
    if (!this.started) return;
    const ctx = this.context;
    const t = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = this.brown;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(70, t + 2.4);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);

    source.connect(filter).connect(gain).connect(this.master);
    source.start(t);
    source.stop(t + 2.7);
  }
}

function ramp(param, value, seconds, context) {
  param.setTargetAtTime(value, context.currentTime, seconds / 3);
}
