import { drawPostcard } from './postcardArt.js';
import { hash1 } from './geo.js';

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The pause menu (Esc, or the ☰ button): back to driving, the map, the
 * journal, the garage, settings, and saving out to the main menu.
 */
export class PauseMenu {
  constructor(actions) {
    this.actions = actions; // { resume, map, journal, garage, quit, toggleVoice, setLook, cancelJob, reset }
    this.panel = document.createElement('div');
    this.panel.className = 'ow-panel ow-pause';
    document.body.appendChild(this.panel);
  }

  get open() {
    return this.panel.classList.contains('is-on');
  }

  show(info) {
    this.render(info);
    this.panel.classList.add('is-on');
  }

  hide() {
    this.panel.classList.remove('is-on');
  }

  render({ found, total, cash, km, area, voice, look, job }) {
    this.panel.innerHTML = `
      <div class="inner">
        <div>
          <h1 class="gfx">Paused</h1>
          <p class="stats">somewhere near <b>${esc(area)}</b><br/>
          places found: <b>${found} of ${total}</b><br/>
          driven: <b>${km.toFixed(1)} km</b><br/>
          in the garage: <b>$${cash.toLocaleString('en-GB')}</b>${job ? `<br/>errand: <b>${esc(job)}</b>` : ''}</p>
        </div>
        <nav>
          <button class="brush" data-a="resume">Keep driving</button>
          <button class="brush alt" data-a="map">Map</button>
          <button class="brush alt" data-a="journal">Field-trip journal</button>
          <button class="brush alt" data-a="garage">Garage</button>
          <button class="brush alt" data-a="reset">Back on the road</button>
          ${job ? '<button class="brush pink" data-a="cancelJob">Drop the errand</button>' : ''}
          <div class="toggles">
            <button class="ow-chip${voice ? ' is-on' : ''}" data-a="voice">Tunde talks: ${voice ? 'on' : 'off'}</button>
            <button class="ow-chip${look === 'real' ? ' is-on' : ''}" data-look="real">Clean look</button>
            <button class="ow-chip${look === 'drive' ? ' is-on' : ''}" data-look="drive">Gritty look</button>
          </div>
          <button class="brush pink small" data-a="quit">Save and quit to menu</button>
        </nav>
      </div>`;
    const a = this.actions;
    this.panel.querySelectorAll('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        const name = b.dataset.a;
        if (name === 'voice') a.toggleVoice();
        else a[name]?.();
      })
    );
    this.panel.querySelectorAll('[data-look]').forEach((b) => b.addEventListener('click', () => a.setLook(b.dataset.look)));
  }
}

/** The journal: a polaroid for every place, blank until you have been there. */
export class Journal {
  constructor({ onClose }) {
    this.onClose = onClose;
    this.panel = document.createElement('div');
    this.panel.className = 'ow-panel ow-journal';
    document.body.appendChild(this.panel);
  }

  get open() {
    return this.panel.classList.contains('is-on');
  }

  show(entries) {
    const found = entries.filter((e) => e.found).length;
    this.panel.innerHTML = `
      <div class="head"><div><h2 class="gfx">Field-trip journal</h2><div class="count">${found} of ${entries.length} places</div></div><button class="brush" data-a="close">Back</button></div>
      <div class="grid">${entries
        .map((e, i) =>
          e.found
            ? `<div class="entry" style="--tilt:${((i * 37) % 7) - 3}deg"><canvas width="220" height="264" data-i="${i}"></canvas><h3>${esc(e.name)}</h3><p>${esc(e.note)}</p></div>`
            : `<div class="entry locked" style="--tilt:${((i * 37) % 7) - 3}deg"><div>?<span>not found yet</span></div></div>`
        )
        .join('')}</div>`;
    for (const canvas of this.panel.querySelectorAll('canvas[data-i]')) {
      const e = entries[Number(canvas.dataset.i)];
      drawPostcard(canvas, { caption: e.name, theme: e.theme, seed: hash1(e.x + e.z) * 100 });
    }
    this.panel.querySelector('[data-a="close"]').addEventListener('click', () => this.onClose?.());
    this.panel.classList.add('is-on');
  }

  hide() {
    this.panel.classList.remove('is-on');
  }
}
