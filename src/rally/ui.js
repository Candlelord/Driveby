import './rally.css';
import { formatTime, formatDelta } from './field.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Speed is shown on a dial scaled so a cruise looks like a road car's and a
// flat-out boost like a rally car's.
const KMH_PER_UNIT = 3.0;
const DIAL_MAX = 240;
const SWEEP = 250; // degrees of needle travel

const ARROW_LEFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.2 6.2 12l9.3 8.8 2.3-2.5L11.4 12l6.4-6.3z" fill="currentColor"/></svg>';
const ARROW_RIGHT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3.2 17.8 12l-9.3 8.8-2.3-2.5L12.6 12 6.2 5.7z" fill="currentColor"/></svg>';
const PEDAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10l1.6 17.4c.1 1-.7 1.6-1.6 1.6H7c-.9 0-1.7-.6-1.6-1.6z" fill="currentColor"/><path d="M8.6 7h6.8M8.9 10.6h6.2M9.2 14.2h5.6" stroke="#c6f000" stroke-width="1.4" stroke-linecap="round"/></svg>';

/**
 * Everything the rally puts on screen: the stage card, speedometer, countdown,
 * split banners, the title as you wait on the line, pace-note chips, the
 * co-driver's line, touch controls and the results sheet.
 *
 * One root element, built once; each part is updated only when its text
 * changes, since this runs every frame.
 */
export class RallyUi {
  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'rl';
    this.root.hidden = true;
    this.root.innerHTML = `
      <svg width="0" height="0" style="position:absolute" aria-hidden="true">
        <filter id="rl-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </svg>
      <div class="rl-card is-idle" hidden>
        <div class="tag"><b class="ss"></b> <span class="stage"></span></div>
        <div class="row"><div class="pct gfx">0<small>%</small></div><div class="time">0:00.00</div></div>
        <div class="bar"><i></i></div>
        <div class="trip"></div>
      </div>
      <div class="rl-dial"><div class="readout"><span class="kmh">0</span><small>km/h</small></div></div>
      <div class="rl-fuel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15zM15 9h2.2a1.8 1.8 0 0 1 1.8 1.8V16a1 1 0 0 0 2 0V8.4L18.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.5 6.5h5v4h-5z" fill="currentColor"/></svg><div class="bar"><i></i></div></div>
      <div class="rl-fuelhint"></div>
      <button class="rl-voice" aria-label="Co-driver voice" title="Co-driver voice (V)"></button>
      <div class="rl-count gfx"></div>
      <div class="rl-split"><span class="what"></span><span class="delta"></span></div>
      <div class="rl-grid">
        <div class="number gfx lime"></div>
        <div class="name gfx"></div>
        <div class="meta"></div>
      </div>
      <div class="rl-finish gfx lime">Finish</div>
      <div class="rl-note"></div>
      <div class="rl-say"></div>
      <div class="rl-controls">
        <div class="rl-steer">
          <button class="rl-btn rl-arrow" data-btn="left" aria-label="Steer left">${ARROW_LEFT}</button>
          <button class="rl-btn rl-arrow" data-btn="right" aria-label="Steer right">${ARROW_RIGHT}</button>
        </div>
        <div class="rl-pedals">
          <button class="rl-btn rl-brake" data-btn="brake" aria-label="Handbrake">hand<br/>brake</button>
          <button class="rl-btn rl-pedal" data-btn="pedal" aria-label="Accelerator">${PEDAL}</button>
        </div>
      </div>
      <div class="rl-keys"><b>←→</b> steer &nbsp; <b>↑</b> boost &nbsp; <b>space</b> handbrake</div>
      <div class="rl-results"></div>`;
    document.body.appendChild(this.root);

    const q = (sel) => this.root.querySelector(sel);
    this.card = q('.rl-card');
    this.ssEl = q('.rl-card .ss');
    this.stageEl = q('.rl-card .stage');
    this.pctEl = q('.rl-card .pct');
    this.timeEl = q('.rl-card .time');
    this.barEl = q('.rl-card .bar i');
    this.tripEl = q('.rl-card .trip');
    this.countEl = q('.rl-count');
    this.splitEl = q('.rl-split');
    this.gridEl = q('.rl-grid');
    this.finishEl = q('.rl-finish');
    this.noteEl = q('.rl-note');
    this.sayEl = q('.rl-say');
    this.controls = q('.rl-controls');
    this.keys = q('.rl-keys');
    this.resultsEl = q('.rl-results');
    this.kmhEl = q('.kmh');
    this.fuelEl = q('.rl-fuel');
    this.fuelFill = q('.rl-fuel .bar i');
    this.fuelHint = q('.rl-fuelhint');

    this.voiceEl = q('.rl-voice');
    this.onVoiceToggle = () => {};
    this.voiceEl.addEventListener('click', () => this.onVoiceToggle());
    this._buildDial(q('.rl-dial'));
    this._last = {};
    this.touch = window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints ?? 0) > 0 || /[?&]touch=1/.test(window.location.search);
    if (/[?&]touch=0/.test(window.location.search)) this.touch = false;
    this.controls.classList.toggle('is-on', this.touch);
    this.keys.hidden = this.touch;
  }

  /** The on-screen controls, for Input.bindButtons. */
  get buttons() {
    const find = (name) => this.root.querySelector(`[data-btn="${name}"]`);
    return { left: find('left'), right: find('right'), pedal: find('pedal'), brake: find('brake') };
  }

  /** Show or hide the whole rally layer. */
  setActive(active) {
    this.root.hidden = !active;
    document.body.classList.toggle('rally-on', active);
  }

  _buildDial(host) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 160 160');
    const centre = 80;
    const radius = 66;
    const angle = (value) => ((-SWEEP / 2 + (value / DIAL_MAX) * SWEEP - 90) * Math.PI) / 180;
    const point = (value, r) => [centre + Math.cos(angle(value)) * r, centre + Math.sin(angle(value)) * r];
    const add = (tag, attrs, parent = svg) => {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      parent.appendChild(el);
      return el;
    };

    // A sheared black plate with a paper rim, like a gauge painted on a board.
    add('path', { d: 'M12 22 L146 8 L152 136 L24 152 Z', fill: '#0b0b0c', opacity: 0.9 });
    add('path', { d: 'M12 22 L146 8 L152 136 L24 152 Z', fill: 'none', stroke: '#f5f2e8', 'stroke-width': 2.5 });
    // Redline.
    const [rx0, ry0] = point(190, radius);
    const [rx1, ry1] = point(DIAL_MAX, radius);
    add('path', { d: `M${rx0} ${ry0} A${radius} ${radius} 0 0 1 ${rx1} ${ry1}`, fill: 'none', stroke: '#ff3d8b', 'stroke-width': 5 });
    for (let v = 0; v <= DIAL_MAX; v += 20) {
      const major = v % 40 === 0;
      const [x0, y0] = point(v, radius - (major ? 11 : 7));
      const [x1, y1] = point(v, radius);
      add('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: v >= 190 ? '#ff3d8b' : '#f5f2e8', 'stroke-width': major ? 3 : 1.6, 'stroke-linecap': 'round' });
      if (major) {
        const [tx, ty] = point(v, radius - 22);
        const label = add('text', { x: tx, y: ty + 3.5, 'text-anchor': 'middle', fill: '#f5f2e8', 'font-size': 10, 'font-weight': 800, 'font-family': 'Impact, Arial Narrow, sans-serif', 'font-style': 'italic' });
        label.textContent = v;
      }
    }
    this.needle = add('g', { class: 'rl-needle' });
    add('path', { d: 'M78 82 L80 22 L82 82 Z', fill: '#c6f000', stroke: '#0b0b0c', 'stroke-width': 1 }, this.needle);
    add('circle', { cx: centre, cy: centre, r: 7, fill: '#f5f2e8', stroke: '#0b0b0c', 'stroke-width': 2 });
    this.needle.style.transform = `rotate(${-SWEEP / 2}deg)`;
    host.insertBefore(svg, host.firstChild);
  }

  /** The co-driver's voice switch: a speaker, with a slash through it when off. */
  setVoice(on) {
    this.voiceEl.classList.toggle('is-off', !on);
    this.voiceEl.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/>${
      on
        ? '<path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
        : '<path d="M15 9l6 6M21 9l-6 6" fill="none" stroke="#ff3d8b" stroke-width="2" stroke-linecap="round"/>'
    }</svg>`;
  }

  /** The fuel gauge, and the nudge toward a station. */
  setFuel({ level, refuelling, out, hint, price }) {
    const pct = Math.round(level * 100);
    if (pct !== this._last.fuel) {
      this._last.fuel = pct;
      this.fuelFill.style.width = pct + "%";
    }
    const mode = out ? "out" : refuelling ? "filling" : level < 0.2 ? "low" : "";
    if (mode !== this._last.fuelMode) {
      this._last.fuelMode = mode;
      this.fuelEl.className = "rl-fuel " + mode;
    }
    const text = refuelling ? "filling · $" + price + " a tank" : out ? "out of fuel · crawl on" : hint;
    if (text !== this._last.fuelText) {
      this._last.fuelText = text;
      this.fuelHint.textContent = text;
      this.fuelHint.classList.toggle("is-on", Boolean(text));
    }
  }

  /** Per-frame: the speedometer. */
  update(state) {
    const kmh = Math.round(state.speed * KMH_PER_UNIT);
    if (kmh !== this._last.kmh) {
      this._last.kmh = kmh;
      this.kmhEl.textContent = kmh;
      const turn = -SWEEP / 2 + Math.min(1.04, kmh / DIAL_MAX) * SWEEP;
      this.needle.style.transform = `rotate(${turn.toFixed(1)}deg)`;
    }
  }

  /** The route line under the stage card: "Abuja → Kaduna · 190 km to go · Nigeria". */
  setTrip({ from, to, left, country }) {
    const text = `${from} → ${to} · ${left} · ${country}`;
    if (text !== this._last.trip) {
      this._last.trip = text;
      this.tripEl.textContent = text;
    }
  }

  /** The stage card: null between stages. */
  setStage(info) {
    this.card.hidden = false;
    this.card.classList.toggle('is-idle', !info);
    if (!info) {
      this.ssEl.textContent = '';
      this.stageEl.textContent = this._last.trip ? 'Liaison' : '';
      return;
    }
    const ss = `SS${info.number}`;
    if (ss !== this._last.ss) {
      this._last.ss = ss;
      this.ssEl.textContent = ss;
    }
    if (info.name !== this._last.name) {
      this._last.name = info.name;
      this.stageEl.textContent = info.name;
    }
    const pct = Math.round(info.progress * 100);
    if (pct !== this._last.pct) {
      this._last.pct = pct;
      this.pctEl.firstChild.textContent = pct;
      this.barEl.style.width = `${pct}%`;
    }
    const time = formatTime(info.time);
    if (time !== this._last.time) {
      this._last.time = time;
      this.timeEl.textContent = time;
    }
  }

  /** Off-stage the card says where you are driving instead. */
  setLiaison(text) {
    if (text !== this._last.liaison) {
      this._last.liaison = text;
      if (this.card.classList.contains('is-idle')) this.stageEl.textContent = text;
    }
  }

  countdown(text) {
    const el = this.countEl;
    el.textContent = text;
    el.classList.remove('pop', 'go');
    void el.offsetWidth; // restart the animation
    el.classList.add(text === 'GO' ? 'go' : 'pop');
    el.classList.toggle('lime', text === 'GO');
  }

  split({ number, delta }) {
    const el = this.splitEl;
    el.classList.toggle('ahead', delta <= 0);
    el.querySelector('.what').textContent = `Split ${number}`;
    el.querySelector('.delta').textContent = formatDelta(delta);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  finish() {
    this.finishEl.classList.remove('show');
    void this.finishEl.offsetWidth;
    this.finishEl.classList.add('show');
  }

  showGrid({ number, name, from, to, km, surface, resuming = false }) {
    this.gridEl.querySelector('.number').textContent = resuming ? `Stage ${number} · resuming` : `Stage ${number}`;
    this.gridEl.querySelector('.name').textContent = name;
    this.gridEl.querySelector('.meta').innerHTML = `${escapeHtml(from)} → ${escapeHtml(to)} &nbsp;·&nbsp; <b>${km} km</b> &nbsp;·&nbsp; ${escapeHtml(surface)}`;
    this.gridEl.classList.add('is-on');
  }

  hideGrid() {
    this.gridEl.classList.remove('is-on');
  }

  /**
   * A pace note on screen: chips like `RIGHT 3`, the corner after it dimmer.
   * `notes` is an array of { dir, severity, label }; empty clears.
   */
  setNotes(notes) {
    const key = notes.map((n) => `${n.dir}${n.severity}${n.label ?? ''}`).join('|');
    if (key === this._last.notes) return;
    this._last.notes = key;
    this.noteEl.classList.toggle('is-on', notes.length > 0);
    if (!notes.length) return;
    this.noteEl.innerHTML = notes
      .map((n, i) => {
        const arrow = n.dir === 'left' ? ARROW_LEFT : n.dir === 'right' ? ARROW_RIGHT : '';
        const hard = n.severity <= 2 ? ' hard' : '';
        const text = n.label ?? (n.severity === 0 ? 'hairpin' : n.severity);
        return `<span class="rl-chip${hard}${i ? ' next' : ''}">${arrow}${escapeHtml(String(text))}${n.extra ? `<small>${escapeHtml(n.extra)}</small>` : ''}</span>`;
      })
      .join('');
  }

  /** The co-driver's spoken line, as a caption. */
  say(text, name = 'Co-driver', seconds = 3.4) {
    this.sayEl.innerHTML = `<b>${escapeHtml(name)}</b>${escapeHtml(text)}`;
    this.sayEl.classList.add('is-on');
    clearTimeout(this._sayTimer);
    this._sayTimer = setTimeout(() => this.sayEl.classList.remove('is-on'), seconds * 1000);
  }

  showResults({ number, name, from, to, time, result, cash, onContinue }) {
    const rows = result.rows
      .map(
        (row) => `<tr class="${row.player ? 'me' : ''}">
          <td class="n">${row.position}</td>
          <td class="who">${escapeHtml(row.name)}<small>${escapeHtml(row.team)}</small></td>
          <td class="t">${formatTime(row.time)}</td>
          <td class="g">${row.position === 1 ? '' : formatDelta(row.gap)}</td></tr>`
      )
      .join('');
    const place = result.position;
    const suffix = ['st', 'nd', 'rd'][place - 1] ?? 'th';
    this.resultsEl.innerHTML = `
      <div class="sheet">
        <div class="head">
          <div>
            <h2 class="gfx">Stage ${number} done</h2>
            <div class="sub">${escapeHtml(name)} &nbsp;·&nbsp; ${escapeHtml(from)} → ${escapeHtml(to)} &nbsp;·&nbsp; ${formatTime(time)}</div>
          </div>
          <div class="pos"><div class="big gfx lime">${place}<sup>${suffix}</sup></div><div class="of">of ${result.rows.length}</div></div>
        </div>
        <table>${rows}</table>
        <div class="prize">
          <div class="money${result.clean ? ' clean' : ''}"><small>prize money</small>+$${result.prize.toLocaleString('en-GB')}</div>
          <div class="overall">overall ${result.overallPosition}${['st', 'nd', 'rd'][result.overallPosition - 1] ?? 'th'}${result.overallPosition === 1 ? '' : ` · ${formatDelta(result.overallGap)}`} &nbsp;·&nbsp; garage $${cash.toLocaleString('en-GB')}</div>
        </div>
        <div class="actions"><button class="brush" data-action="go">Next stage</button></div>
      </div>`;
    this.resultsEl.classList.add('is-on');
    this.resultsEl.querySelector('[data-action="go"]').addEventListener('click', () => onContinue(), { once: true });
  }

  hideResults() {
    this.resultsEl.classList.remove('is-on');
    this.resultsEl.innerHTML = '';
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
