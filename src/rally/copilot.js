import { scanCorners } from './corners.js';

// Where the co-driver looks, how finely, and what counts as a corner.
const LOOK = 190;
const SHOW_WITHIN = 150; // chips appear this far ahead
const VOICE_KEY = 'driveby.voice';

const WORDS = ['hairpin', 'one', 'two', 'three', 'four', 'five', 'six'];

/**
 * The co-driver.
 *
 * It reads the road ahead straight off the road function — the same
 * `heading(s)` the world is drawn from — finds the corners, grades each one on
 * the usual 1–6 scale (with hairpins on top) and calls them: as chips on
 * screen, and out loud if the browser has a voice and the player has it on.
 * Between corners it passes the time with a joke or a remark about how the
 * driving is going. Every line is the game's own.
 */
export class Copilot {
  constructor({ ui, physics }) {
    this.ui = ui;
    this.physics = physics;
    this.enabled = false; // notes are only read on a stage
    this.voice = readVoice();
    this.called = new Set();
    this.shown = [];
    this._scanClock = 0;
    this._quiet = 0; // seconds until the next joke is allowed
    this._lastCrashes = 0;
    this._lastNote = 0;
    this._speaking = false;
    this.corners = [];
    ui.setVoice?.(this.voice);
    ui.onVoiceToggle = () => this.setVoice(!this.voice);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'v' || event.key === 'V') this.setVoice(!this.voice);
    });
  }

  setVoice(on) {
    this.voice = on;
    try {
      window.localStorage.setItem(VOICE_KEY, on ? '1' : '0');
    } catch {
      // Not remembered; still works for this visit.
    }
    this.ui.setVoice?.(on);
    if (!on) window.speechSynthesis?.cancel();
  }

  /** A stage starts or ends: switch note-reading on or off. */
  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    this.called.clear();
    this.corners = [];
    this.ui.setNotes([]);
    if (!on) window.speechSynthesis?.cancel();
  }

  /** Something happened that is worth a remark. */
  react(kind, data = {}) {
    const pool = LINES[kind];
    if (!pool) return;
    let line = pick(pool);
    if (kind === 'split') line = pick(data.delta <= 0 ? LINES.splitGood : LINES.splitBad);
    this._say(line, kind === 'start' ? 0 : 0.5);
  }

  update(state) {
    // A crash is always worth a remark.
    const crashes = this.physics.crashes;
    if (crashes !== this._lastCrashes) {
      this._lastCrashes = crashes;
      if (this.enabled) this.react('crash');
    }
    this._quiet = Math.max(0, this._quiet - state.dt);
    if (!this.enabled) return;

    this._scanClock -= state.dt;
    if (this._scanClock <= 0) {
      this._scanClock = 0.12;
      this.corners = this._scan(state.travelled);
    }
    this._announce(state);

    // Long straight, nothing to call: a remark, now and then.
    const next = this.corners[0];
    if (this._quiet <= 0 && state.speed > 12 && (!next || next.start - state.travelled > 120)) {
      this._quiet = 24 + Math.random() * 24;
      this._say(pick(LINES.straight));
    }
  }

  /** The corners in the next LOOK units, nearest first. */
  _scan(from) {
    return scanCorners(from + 4, LOOK);
  }

  _announce(state) {
    const upcoming = this.corners.filter((c) => c.start - state.travelled < SHOW_WITHIN);
    this.ui.setNotes(
      upcoming.slice(0, 2).map((c) => ({
        dir: c.dir,
        severity: c.severity,
        label: c.severity === 0 ? 'hairpin' : String(c.severity),
        extra: c.angle < 0.3 && c.severity >= 4 ? 'kink' : c.length > 70 && c.angle > 0.7 ? 'long' : c.tightens ? 'tightens' : c.opens ? 'opens' : '',
      }))
    );

    // Call it a few seconds out, so there is time to do something about it.
    const lead = state.speed * 3.1 + 18;
    const next = this.corners[0];
    if (next && next.start - state.travelled < lead && !this.called.has(next.key)) {
      this.called.add(next.key);
      if (this.called.size > 40) this.called.delete(this.called.values().next().value);
      this._speakNote(next);
    }
  }

  _noteText(c) {
    const parts = [c.dir, WORDS[c.severity]];
    if (c.angle < 0.3 && c.severity >= 4) parts.push('kink');
    else if (c.length > 70 && c.angle > 0.7) parts.push('long');
    else if (c.tightens) parts.push('tightens');
    else if (c.opens) parts.push('opens');
    if (c.into) parts.push('into', c.into.dir, WORDS[c.into.severity]);
    return parts.join(' ');
  }

  _speakNote(corner) {
    this._quiet = Math.max(this._quiet, 6);
    this._lastNote = performance.now();
    this._speak(this._noteText(corner), { rate: 1.28, priority: true });
  }

  /** A remark: shown as a caption, spoken if voice is on and nothing is being called. */
  _say(line, delay = 0) {
    const fire = () => {
      this.ui.say(line, 'Co-driver');
      this._speak(line, { rate: 1.08, priority: false });
    };
    if (delay) setTimeout(fire, delay * 1000);
    else fire();
  }

  _speak(text, { rate = 1.1, priority = false } = {}) {
    if (!this.voice || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    // A corner call cuts across a joke; a joke never cuts across a call.
    if (synth.speaking) {
      if (!priority) return;
      synth.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = 1;
    utterance.volume = 0.9;
    const voices = synth.getVoices();
    const english = voices.find((v) => /^en-(GB|ZA|NG|IE)/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang));
    if (english) utterance.voice = english;
    synth.speak(utterance);
  }
}

function readVoice() {
  try {
    return window.localStorage.getItem(VOICE_KEY) !== '0';
  } catch {
    return true;
  }
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * The patter. Written for the game; nothing quoted from anywhere.
 */
const LINES = {
  start: [
    'Seatbelts on, nerves off. Well, one of those.',
    'Notes are written, tyres are round. What could go wrong?',
    'Stage is open. Try to leave some road for everyone else.',
    'I counted the corners. I stopped counting when I ran out of fingers.',
    'Remember, the pedal on the right is the fun one.',
    'Smooth is fast. Fast is also fast. Pick one.',
  ],
  straight: [
    'Flat out here. Enjoy it, I have seen the next page.',
    'Nice and open. My coffee is trying to leave the cup.',
    'If you can read this, you are not going fast enough. Hold the pedal.',
    'This is the bit where I say nothing is coming. Do not trust me.',
    'Quick check: do you know where the handbrake is? Big pink button. Lovely.',
    'Did you know a rally car is just a shopping trolley that took ambition seriously?',
    'We are making great time. I have no idea where, but great time.',
    'Fun fact: I have never once been car sick. Do not make me start now.',
    'The road is a bit like an opinion. It changes sharply when you least expect it.',
    'On a long straight, I like to think about snacks. Currently thinking about plantain chips.',
    'Light at the end of the tunnel? No. Dust. Just dust. Keep going.',
    'Left foot on the floor, right foot on the floor. Wait, that is not right.',
    'We have been driving a while. Is it still called a shortcut?',
  ],
  crash: [
    'That was not in the notes.',
    'Bit of a scenic detour, was it?',
    'Good news: the car still has all four corners. Mostly.',
    'I felt that in my fillings.',
    'We call that a rapid unscheduled landscape inspection.',
    'Right. Now we know where that is. Forget it.',
    'Careful. The bumpers are optional, the stage time is not.',
  ],
  splitGood: [
    'Split is green! Do not look smug, it distracts me.',
    'Ahead of the pack. Do not tell the others, they will drive faster.',
    'Brilliant. Keep doing whatever you are doing.',
    'That is quick. Suspiciously quick. I like it.',
  ],
  splitBad: [
    'A little behind. Nothing a brave corner will not fix.',
    'We are losing time. Probably the car. Definitely the car.',
    'Pink split. Pink is a lovely colour, and a slow one.',
    'Do not panic. The others have to get round the same bends.',
  ],
  finish: [
    'Across the line. My hands are still shaking, in a good way.',
    'And breathe. That one had everything.',
    'Finish! I would like to go slower next time. I would also like a pony.',
    'Done. Can we do that again? Slightly more of it, slightly less dust.',
  ],
};
