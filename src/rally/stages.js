import { STAGE_FROM, STAGE_TO, dirtAt } from './track.js';
import { RIVALS, parTime, rivalTimes, settle } from './field.js';
import { CONFIG } from '../config.js';

// How far out the car starts to settle on the line, and where it rests.
const APPROACH = 260;
const LINE_GAP = 3; // the car stops this far short of the gate
const COUNT_STEP = 0.85; // seconds per count
const SPLITS = [0.25, 0.5, 0.75];
const OVERRUN = 62; // the car coasts to a halt this far past the finish

/**
 * Every leg between two stops is a timed stage.
 *
 * The cities at either end are liaison — drive as you like, nothing is
 * counted. At the stage start the car is brought to a stop on the line behind
 * the gate, the countdown runs, and from "go" the clock counts to the finish
 * gate. Three splits compare you with the fastest crew; at the line there is a
 * results table, prize money, and a button to carry on.
 *
 * Phases: free → approach → grid → countdown → running → finish → results → free.
 * `resume` is the one-off phase a saved game re-enters mid-stage: the same
 * countdown, with the clock held at the saved time.
 */
export class StageRunner {
  constructor({ director, physics, ui, sfx, wallet }) {
    this.director = director;
    this.physics = physics;
    this.ui = ui;
    this.sfx = sfx;
    this.wallet = wallet;

    this.phase = 'free';
    this.index = -1; // leg index of the stage in play
    this.geometry = null;
    this.completed = new Set();
    this.totals = { player: 0, rivals: RIVALS.map(() => 0) };
    this.history = []; // finished stages: { index, time, position, prize }
    this.time = 0;
    this.countdown = 0;
    this.lastCount = 4;
    this.splitsDone = 0;
    this.crashesAtStart = 0;
    this.finishTimer = 0;
    this.finalTime = 0;
    this.resuming = false;
    this.latest = null;
    this.gates = null; // { start, end, name } for the stage ahead, in absolute distance
  }

  /** Called when the route starts or resumes. */
  start(snapshot) {
    this.phase = 'free';
    this.index = -1;
    this.completed = new Set(snapshot?.completed ?? []);
    this.totals = snapshot?.totals ?? { player: 0, rivals: RIVALS.map(() => 0) };
    this.history = snapshot?.history ?? [];
    this.physics.holdAt = null;
    this.physics.hold = false;
    if (snapshot?.current) {
      this.index = snapshot.current.index;
      this.time = snapshot.current.time;
      this.splitsDone = snapshot.current.splitsDone ?? 0;
      this.phase = 'resume';
    }
  }

  /** True while the road is closed to traffic: from the approach to the gate until the results. */
  get closed() {
    return ['approach', 'grid', 'countdown', 'running', 'finish', 'results'].includes(this.phase);
  }

  /** What to write to the save slot. */
  snapshot() {
    const live = this.phase === 'running' || this.phase === 'countdown' || this.phase === 'resume';
    return {
      completed: [...this.completed],
      totals: this.totals,
      history: this.history,
      current: live && this.index >= 0 ? { index: this.index, time: this.time, splitsDone: this.splitsDone } : null,
    };
  }

  _geometry(index) {
    const d = this.director;
    const leg = d.route.legs[index];
    const start = d.origin + d.legStarts[index] + d.legLengths[index] * STAGE_FROM;
    const end = d.origin + d.legStarts[index] + d.legLengths[index] * STAGE_TO;
    return { index, leg, stage: leg.stage, start, end, length: end - start };
  }

  /** The stage the car is in or about to be in, or null where there is none (the ferry). */
  stageAt(progress) {
    const d = this.director;
    const i = d._legAt(Math.max(0, progress));
    return d.route.legs[i]?.stage ? this._geometry(i) : null;
  }

  /** Dirt share of a stage, sampled along it. */
  _dirtShare(g) {
    let sum = 0;
    for (let k = 0; k < 24; k++) sum += dirtAt(g.start + (g.length * (k + 0.5)) / 24);
    return sum / 24;
  }

  _prepare(index) {
    const g = this._geometry(index);
    this.index = index;
    this.geometry = g;
    this.par = parTime(g.length, this._dirtShare(g), CONFIG.speed);
    this.rivals = rivalTimes(this.par, index);
    this.pace = Math.min(...this.rivals);
    return g;
  }

  update(state) {
    const { physics, director, ui } = this;
    if (!director.active) {
      if (this.phase !== 'free') this._release(true);
      this.gates = null;
      ui.setStage(null);
      return;
    }
    const s = state.travelled;
    const progress = s - director.origin;
    const here = this.stageAt(progress);

    // The next unfinished stage around the car, for the gates.
    if (this.phase === 'free' || this.phase === 'approach') {
      const next = here && !this.completed.has(here.index) && s < here.end ? here : null;
      this.gates = next ? { start: next.start, end: next.end, name: next.stage.name } : null;
    }

    switch (this.phase) {
      case 'free': {
        if (!here || this.completed.has(here.index)) break;
        if (s > here.start - APPROACH && s < here.start - LINE_GAP) {
          this._prepare(here.index);
          this.phase = 'approach';
        } else if (s >= here.start - LINE_GAP && s < here.end - 40) {
          // Arrived mid-stage without a start (a jump, an old save): run it
          // from here, the clock starting at zero.
          this._prepare(here.index);
          this._begin();
        }
        break;
      }

      case 'approach': {
        const g = this.geometry;
        // Come to a stop on the line: the speed allowed shrinks as √(2·a·d).
        physics.holdAt = g.start - LINE_GAP;
        if (g.start - s < 12 && physics.speed < 0.6) {
          physics.hold = true;
          this.phase = 'grid';
          this.countdown = -0.8;
          this.lastCount = 4;
          ui.showGrid({
            number: this._number(g.index),
            name: g.stage.name,
            from: director.route.stops[g.index].name,
            to: director.route.stops[g.index + 1].name,
            km: g.leg.km,
            surface: this._surfaceLabel(g),
          });
        }
        break;
      }

      case 'grid':
      case 'countdown':
        this._tickCountdown(state);
        break;

      case 'resume': {
        if (this.index < 0 || !director.route.legs[this.index]?.stage) {
          this.phase = 'free';
          break;
        }
        const g = this._prepare(this.index);
        physics.hold = true;
        this.resuming = true;
        this.phase = 'grid';
        this.countdown = -0.4;
        this.lastCount = 4;
        ui.showGrid({
          number: this._number(g.index),
          name: g.stage.name,
          from: director.route.stops[g.index].name,
          to: director.route.stops[g.index + 1].name,
          km: g.leg.km,
          surface: 'back on the stage',
          resuming: true,
        });
        break;
      }

      case 'running':
        this._tickRunning(state);
        break;

      case 'finish':
        this.finishTimer += state.dt;
        if (this.finishTimer > 1.8 && (physics.speed < 1.5 || this.finishTimer > 5)) this._results();
        break;

      default:
        break;
    }

    const live = ['running', 'countdown', 'grid', 'finish', 'results'].includes(this.phase) && this.geometry;
    ui.setStage(
      live
        ? {
            number: this._number(this.index),
            name: this.geometry.stage.name,
            time: this.time,
            progress: this.phase === 'grid' ? 0 : this._fraction(s),
            running: this.phase === 'running',
          }
        : null
    );
  }

  /** Stage numbers count road stages only; the ferry is not one. */
  _number(index) {
    let n = 0;
    for (let i = 0; i <= index; i++) if (this.director.route.legs[i].stage) n++;
    return n;
  }

  _surfaceLabel(g) {
    const share = this._dirtShare(g);
    return share > 0.6 ? 'gravel & dirt' : share > 0.15 ? 'mixed surface' : 'tarmac';
  }

  _fraction(s) {
    const g = this.geometry;
    return g ? Math.min(1, Math.max(0, (s - g.start) / g.length)) : 0;
  }

  _tickCountdown(state) {
    this.countdown += state.dt;
    const t = this.countdown;
    this.phase = t < 0 ? 'grid' : 'countdown';
    if (t < 0) return;
    const count = 3 - Math.floor(t / COUNT_STEP);
    if (count !== this.lastCount) {
      this.lastCount = count;
      if (count >= 1) {
        this.ui.countdown(String(count));
        this.sfx?.beep(520, 0.12, 0.2);
      } else {
        this._begin();
      }
    }
  }

  /** Lights out: release the car and start the clock. */
  _begin() {
    this.ui.countdown('GO');
    this.sfx?.beep(880, 0.4, 0.26);
    this.physics.hold = false;
    this.physics.holdAt = null;
    this.phase = 'running';
    if (!this.resuming) {
      this.time = 0;
      this.splitsDone = 0;
    }
    this.resuming = false;
    this.crashesAtStart = this.physics.crashes;
    this.ui.hideGrid();
  }

  _tickRunning(state) {
    const g = this.geometry;
    const s = state.travelled;
    this.time += state.dt;
    const f = this._fraction(s);

    // Splits: your time against the fastest crew's pace at the same point.
    while (this.splitsDone < SPLITS.length && f >= SPLITS[this.splitsDone]) {
      const ghost = this.pace * SPLITS[this.splitsDone];
      this.ui.split({ number: this.splitsDone + 1, delta: this.time - ghost });
      this.splitsDone++;
    }

    if (s >= g.end) {
      this.phase = 'finish';
      this.finishTimer = 0;
      this.finalTime = this.time;
      this.physics.holdAt = g.end + OVERRUN;
      this.ui.finish();
      this.sfx?.beep(660, 0.5, 0.26);
    }
  }

  _results() {
    const clean = this.physics.crashes === this.crashesAtStart;
    const result = settle(this.rivals, this.finalTime, this.totals, { clean });
    this.totals = result.overall;
    this.completed.add(this.index);
    this.history.push({ index: this.index, time: this.finalTime, position: result.position, prize: result.prize });
    this.wallet?.add(result.prize);
    this.latest = result;
    this.phase = 'results';
    this.physics.hold = true;
    const g = this.geometry;
    this.ui.showResults({
      number: this._number(this.index),
      name: g.stage.name,
      from: this.director.route.stops[this.index].name,
      to: this.director.route.stops[this.index + 1].name,
      time: this.finalTime,
      result,
      cash: this.wallet?.cash ?? 0,
      onContinue: () => this._release(true),
    });
  }

  _release(done = false) {
    this.physics.hold = false;
    this.physics.holdAt = null;
    if (done) this.phase = 'free';
    this.ui.hideResults();
    this.ui.hideGrid();
  }
}
