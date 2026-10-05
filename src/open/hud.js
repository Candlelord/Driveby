import './hud.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DIAL_MAX = 240;
const SWEEP = 250;
const ARROW_L = '<svg viewBox="0 0 24 24"><path d="M15.5 3.2 6.2 12l9.3 8.8 2.3-2.5L11.4 12l6.4-6.3z" fill="currentColor"/></svg>';
const ARROW_R = '<svg viewBox="0 0 24 24"><path d="M8.5 3.2 17.8 12l-9.3 8.8-2.3-2.5L12.6 12 6.2 5.7z" fill="currentColor"/></svg>';
const PUMP = '<svg viewBox="0 0 24 24"><path d="M5 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15zM15 9h2.2a1.8 1.8 0 0 1 1.8 1.8V16a1 1 0 0 0 2 0V8.4L18.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.5 6.5h5v4h-5z" fill="currentColor"/></svg>';
const MENU = '<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The driving HUD: minimap (drawn by maps.js into the canvas here), speed and
 * fuel, where you are, money, the errand in hand, your friend's lines,
 * prompts, discovery cards, toasts and the touch controls.
 *
 * Each part only touches the DOM when its value changes, since this runs
 * every frame.
 */
export class Hud {
  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'ow';
    this.root.hidden = true;
    this.root.innerHTML = `
      <svg width="0" height="0" style="position:absolute" aria-hidden="true">
        <filter id="ow-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </svg>
      <div class="ow-where"><div class="area gfx"></div><div class="sub"></div></div>
      <div class="ow-cash gfx lime">$0</div>
      <button class="ow-menu-btn" aria-label="Menu" title="Menu (Esc)">${MENU}</button>
      <div class="ow-job" hidden><div class="what"></div><div class="meta"></div></div>
      <div class="ow-mini" title="Map (M)"><canvas width="460" height="460"></canvas><div class="north">N</div><div class="place"></div></div>
      <div class="ow-fuel">${PUMP}<div class="bar"><i></i></div></div>
      <div class="ow-dial"><div class="readout"><span class="kmh">0</span><small>km/h</small></div></div>
      <div class="ow-prompt"></div>
      <div class="ow-toast"><div class="t gfx"></div><div class="s"></div></div>
      <div class="ow-card"><canvas width="220" height="264"></canvas><div class="tag"></div></div>
      <div class="ow-say"></div>
      <div class="ow-touch">
        <div class="grp">
          <button class="ow-btn arrow" data-b="left" aria-label="Steer left">${ARROW_L}</button>
          <button class="ow-btn arrow" data-b="right" aria-label="Steer right">${ARROW_R}</button>
        </div>
        <div class="grp">
          <button class="ow-btn hand" data-b="hand" aria-label="Handbrake">hand<br/>brake</button>
          <button class="ow-btn brake" data-b="brake" aria-label="Brake and reverse">brake<br/>rev</button>
          <button class="ow-btn gas" data-b="gas" aria-label="Accelerate">gas</button>
        </div>
      </div>
      <div class="ow-keys"><b>W/S</b> gas · brake &nbsp; <b>A/D</b> steer &nbsp; <b>space</b> handbrake &nbsp; <b>M</b> map &nbsp; <b>Esc</b> menu &nbsp; <b>R</b> reset</div>`;
    document.body.appendChild(this.root);
    const q = (s) => this.root.querySelector(s);
    this.el = {
      area: q('.ow-where .area'),
      sub: q('.ow-where .sub'),
      cash: q('.ow-cash'),
      menu: q('.ow-menu-btn'),
      job: q('.ow-job'),
      jobWhat: q('.ow-job .what'),
      jobMeta: q('.ow-job .meta'),
      mini: q('.ow-mini'),
      miniCanvas: q('.ow-mini canvas'),
      miniPlace: q('.ow-mini .place'),
      fuel: q('.ow-fuel'),
      fuelFill: q('.ow-fuel .bar i'),
      kmh: q('.kmh'),
      prompt: q('.ow-prompt'),
      toast: q('.ow-toast'),
      card: q('.ow-card'),
      cardCanvas: q('.ow-card canvas'),
      cardTag: q('.ow-card .tag'),
      say: q('.ow-say'),
      touch: q('.ow-touch'),
      keys: q('.ow-keys'),
    };
    this._buildDial(q('.ow-dial'));
    this.last = {};
    this.touch = window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints ?? 0) > 0 || /[?&]touch=1/.test(location.search);
    if (/[?&]touch=0/.test(location.search)) this.touch = false;
    this.el.touch.classList.toggle('is-on', this.touch);
    document.body.classList.toggle('ow-touching', this.touch);
    this.el.keys.hidden = this.touch;
    setTimeout(() => this.el.keys.classList.add('is-faded'), 14000);
  }

  get buttons() {
    const f = (n) => this.root.querySelector(`[data-b="${n}"]`);
    return { left: f('left'), right: f('right'), gas: f('gas'), brake: f('brake'), hand: f('hand') };
  }

  setActive(on) {
    this.root.hidden = !on;
    document.body.classList.toggle('ow-on', on);
  }

  _buildDial(host) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 160 160');
    const c = 80;
    const r = 66;
    const ang = (v) => ((-SWEEP / 2 + (v / DIAL_MAX) * SWEEP - 90) * Math.PI) / 180;
    const pt = (v, rr) => [c + Math.cos(ang(v)) * rr, c + Math.sin(ang(v)) * rr];
    const add = (tag, attrs, parent = svg) => {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      parent.appendChild(el);
      return el;
    };
    add('path', { d: 'M12 22 L146 8 L152 136 L24 152 Z', fill: '#0b0b0c', opacity: 0.9 });
    add('path', { d: 'M12 22 L146 8 L152 136 L24 152 Z', fill: 'none', stroke: '#f5f2e8', 'stroke-width': 2.5 });
    const [a0, b0] = pt(190, r);
    const [a1, b1] = pt(DIAL_MAX, r);
    add('path', { d: `M${a0} ${b0} A${r} ${r} 0 0 1 ${a1} ${b1}`, fill: 'none', stroke: '#ff3d8b', 'stroke-width': 5 });
    for (let v = 0; v <= DIAL_MAX; v += 20) {
      const major = v % 40 === 0;
      const [x0, y0] = pt(v, r - (major ? 11 : 7));
      const [x1, y1] = pt(v, r);
      add('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: v >= 190 ? '#ff3d8b' : '#f5f2e8', 'stroke-width': major ? 3 : 1.6, 'stroke-linecap': 'round' });
      if (major) {
        const [tx, ty] = pt(v, r - 22);
        add('text', { x: tx, y: ty + 3.5, 'text-anchor': 'middle', fill: '#f5f2e8', 'font-size': 10, 'font-weight': 800, 'font-family': 'Impact, Arial Narrow, sans-serif', 'font-style': 'italic' }).textContent = v;
      }
    }
    this.needle = add('g', { class: 'ow-needle' });
    add('path', { d: 'M78 82 L80 22 L82 82 Z', fill: '#c6f000', stroke: '#0b0b0c', 'stroke-width': 1 }, this.needle);
    add('circle', { cx: c, cy: c, r: 7, fill: '#f5f2e8', stroke: '#0b0b0c', 'stroke-width': 2 });
    this.needle.style.transform = `rotate(${-SWEEP / 2}deg)`;
    host.insertBefore(svg, host.firstChild);
  }

  set(name, value, apply) {
    if (this.last[name] === value) return;
    this.last[name] = value;
    apply(value);
  }

  setSpeed(ms) {
    const kmh = Math.round(Math.abs(ms) * 3.6);
    this.set('kmh', kmh, (v) => {
      this.el.kmh.textContent = v;
      this.needle.style.transform = `rotate(${(-SWEEP / 2 + Math.min(1.04, v / DIAL_MAX) * SWEEP).toFixed(1)}deg)`;
    });
  }

  setFuel(level) {
    this.set('fuel', Math.round(level * 100), (v) => (this.el.fuelFill.style.width = `${v}%`));
    this.set('fuelMode', level <= 0 ? 'out' : level < 0.18 ? 'low' : '', (m) => (this.el.fuel.className = `ow-fuel ${m}`));
  }

  setArea(area, sub) {
    this.set('area', area, (v) => (this.el.area.textContent = v));
    this.set('sub', sub, (v) => (this.el.sub.innerHTML = v));
    this.set('miniPlace', area, (v) => (this.el.miniPlace.textContent = v));
  }

  setCash(cash) {
    this.set('cash', cash, (v) => (this.el.cash.textContent = `$${v.toLocaleString('en-GB')}`));
  }

  setJob(job) {
    const key = job ? `${job.title}|${job.meta}` : '';
    this.set('job', key, () => {
      this.el.job.hidden = !job;
      if (!job) return;
      this.el.jobWhat.textContent = job.title;
      this.el.jobMeta.innerHTML = job.meta;
    });
  }

  prompt(text) {
    this.set('prompt', text || '', (v) => {
      this.el.prompt.innerHTML = v;
      this.el.prompt.classList.toggle('is-on', Boolean(v));
    });
  }

  say(text, name = 'Tunde', seconds = 4.2) {
    this.el.say.innerHTML = `<b>${esc(name)}</b>${esc(text)}`;
    this.el.say.classList.add('is-on');
    clearTimeout(this._sayT);
    this._sayT = setTimeout(() => this.el.say.classList.remove('is-on'), seconds * 1000);
  }

  toast(title, sub = '', seconds = 3.5) {
    this.el.toast.querySelector('.t').textContent = title;
    this.el.toast.querySelector('.s').textContent = sub;
    this.el.toast.querySelector('.s').hidden = !sub;
    this.el.toast.classList.add('is-on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.el.toast.classList.remove('is-on'), seconds * 1000);
  }

  /** A polaroid slides in: `draw(canvas)` paints it, `tag` is the line under it. */
  card(draw, tag, seconds = 6) {
    draw(this.el.cardCanvas);
    this.el.cardTag.innerHTML = tag;
    this.el.card.classList.add('is-on');
    clearTimeout(this._cardT);
    this._cardT = setTimeout(() => this.el.card.classList.remove('is-on'), seconds * 1000);
  }
}
