import { MOODS } from '../spotify/genreMap.js';
import { ROUTES } from '../routes/lagosParis.js';
import './menus.css';

const MOOD_LABELS = { sad: 'Sad', chill: 'Chill', happy: 'Happy', hiphop: 'Hip-Hop' };

/**
 * The two screens that sit in front of the drive: connecting an account, and
 * reviewing what the classifier decided.
 *
 * Both are overlays on the running scene rather than separate pages — the drive
 * never stops, which is the whole point of the game.
 */
export class Screens {
  constructor(root) {
    this.root = root;
    this.onConnect = () => {};
    this.onSkip = () => {};
    this.onDone = () => {};
    this.library = null;
    // Which trip the player picked: 'endless' (the playlist chooses the
    // places) or a route id. `?route=lagos-paris` preselects one.
    const requested = new URLSearchParams(window.location.search).get('route');
    this.trip = ROUTES[requested] ? requested : 'endless';
    // Set by main.js when there is saved progress: { title, sub }. When there
    // is, picking up where you left off is the default.
    this.resume = null;
    // Set by main.js: { stats() } for the menu, and onGarage() to open the garage.
    this.hooks = null;
    this.onGarage = null;
  }

  offerResume(resume) {
    this.resume = resume;
    if (resume && !new URLSearchParams(window.location.search).get('route')) this.trip = 'resume';
  }

  _tripPicker() {
    const options = [
      ...(this.resume ? [{ id: 'resume', title: this.resume.title, sub: this.resume.sub }] : []),
      { id: 'endless', title: 'Endless drive', sub: 'Your music picks the places. No destination.' },
      ...Object.values(ROUTES).map((route) => ({ id: route.id, title: route.title, sub: route.subtitle })),
    ];
    return `<div class="trip" role="radiogroup" aria-label="Trip">
      ${options
        .map(
          (option) => `<button class="trip-option${option.id === this.trip ? ' is-on' : ''}" role="radio"
            aria-checked="${option.id === this.trip}" data-trip="${option.id}">
            <b>${escapeHtml(option.title)}</b><span>${escapeHtml(option.sub)}</span></button>`
        )
        .join('')}
    </div>`;
  }

  _wireTripPicker() {
    this.root.querySelector('.trip')?.addEventListener('click', (event) => {
      const button = event.target.closest('.trip-option');
      if (!button) return;
      this.trip = button.dataset.trip;
      for (const option of this.root.querySelectorAll('.trip-option')) {
        const on = option === button;
        option.classList.toggle('is-on', on);
        option.setAttribute('aria-checked', String(on));
      }
    });
  }

  hide() {
    this.root.innerHTML = '';
    this.root.classList.remove('is-open');
  }

  _open(html) {
    this.root.innerHTML = html;
    this.root.classList.add('is-open');
  }

  /**
   * The main menu: a paper-white sheet cut by a black diagonal, the title
   * painted across the cut, the ways to play down the black side.
   */
  showConnect({ configured, error }) {
    this._menuArgs = { configured, error };
    const stats = this.hooks?.stats?.() ?? null;
    const resume = this.resume;
    const trips = Object.values(ROUTES);
    const route = trips[0];
    this._open(`
      <div class="mm">
        <div class="mm-slab"></div>
        <svg class="mm-scribbles" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M5 63 C 14 59, 24 66, 36 61" fill="none" stroke="#c6f000" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M8 66 C 18 63, 26 69, 34 65" fill="none" stroke="#0b0b0c" stroke-width="0.5" stroke-linecap="round"/>
          <path d="M43 12 l3 5 l-6 -1 z M47 8 l1.4 3 l-3 -0.4 z" fill="#c6f000"/>
          <path d="M31 83 q4 -6 9 -2 t 8 -3" fill="none" stroke="#0b0b0c" stroke-width="0.6" stroke-linecap="round"/>
        </svg>
        <header class="mm-title">
          <div class="mm-word gfx">Drive<span>by</span></div>
          <div class="mm-tag">a rally · Lagos <b>→</b> Paris <b>→</b> Amsterdam</div>
        </header>
        ${
          stats
            ? `<p class="mm-note">stages done: <b>${stats.stages}</b><br/>postcards: <b>${stats.postcards}</b><br/>garage: <b>$${stats.cash.toLocaleString('en-GB')}</b></p>`
            : ''
        }
        <nav class="mm-nav">
          ${resume ? `<button class="brush is-primary" data-trip="resume">Continue<small>${escapeHtml(resume.sub)}</small></button>` : ''}
          ${trips
            .map(
              (r, i) =>
                `<button class="brush${!resume && i === 0 ? ' is-primary' : ' alt'}" data-trip="${r.id}">${escapeHtml(r.title.replace('→', '→'))}${'<small>a rally in ' + r.legs.filter((l) => l.stage).length + ' stages</small>'}</button>`
            )
            .join('')}
          <button class="brush alt" data-trip="endless">Endless drive<small>your music picks the places</small></button>
          <button class="brush alt" data-action="garage">Garage<small>cars, paint, postcards</small></button>
          ${configured ? '<button class="brush ghost" data-action="connect">Connect Spotify</button>' : ''}
          ${
            configured
              ? ''
              : '<p class="mm-fine">Spotify is not set up in this build, so music runs from a stand-in playlist. Nothing is ever written to your account.</p>'
          }
          ${error ? `<p class="mm-fine" style="color:#ff3d8b">${escapeHtml(error)}</p>` : ''}
        </nav>
      </div>`);
    void route;

    this.root.querySelectorAll('[data-trip]').forEach((button) =>
      button.addEventListener('click', () => {
        this.trip = button.dataset.trip;
        this.onSkip();
      })
    );
    this.root.querySelector('[data-action="garage"]').addEventListener('click', () => this.onGarage?.());
    this.root.querySelector('[data-action="connect"]')?.addEventListener('click', () => this.onConnect());
  }

  /** Back to the menu as it was (after the garage). */
  reshowMenu() {
    if (this._menuArgs) this.showConnect(this._menuArgs);
  }

  showLoading(stage, progress) {
    this._open(`
      <div class="panel">
        <h1>Reading your library</h1>
        <p class="lede">${escapeHtml(stageLabel(stage))}</p>
        <div class="progress"><div class="progress-fill" style="width:${Math.round(progress * 100)}%"></div></div>
      </div>
    `);
  }

  /**
   * Pre-filled, not blank: the player is correcting a decision, not sorting a
   * library from scratch. Lowest-confidence tracks come first, because those
   * are the only ones worth their attention.
   */
  showReview(library) {
    this.library = library;
    const counts = library.counts;
    const rows = library
      .reviewOrder(40)
      .map(
        (track) => `
        <li class="row" data-id="${track.id}">
          <div class="row-main">
            <span class="title">${escapeHtml(track.name)}</span>
            <span class="artist">${escapeHtml(track.artist)}</span>
            <span class="why">${escapeHtml(track.reason)}${
              track.confidence < 0.35 ? ' · low confidence' : ''
            }</span>
          </div>
          <div class="choices">
            ${MOODS.map(
              (mood) => `
              <button class="chip${track.mood === mood ? ' is-on' : ''}"
                      data-mood="${mood}">${MOOD_LABELS[mood]}</button>`
            ).join('')}
          </div>
        </li>`
      )
      .join('');

    this._open(`
      <div class="panel wide">
        <h1>Check the sorting</h1>
        <p class="lede">Everything is already tagged — this is only for fixing the
        ones it got wrong. Least certain first.</p>
        <div class="tallies">
          ${MOODS.map(
            (mood) => `<span class="tally"><b>${counts[mood]}</b> ${MOOD_LABELS[mood]}</span>`
          ).join('')}
        </div>
        <ul class="rows">${rows}</ul>
        ${this._tripPicker()}
        <button class="primary" data-action="done">Start driving</button>
      </div>
    `);

    this.root.querySelector('.rows').addEventListener('click', (event) => {
      const button = event.target.closest('.chip');
      if (!button) return;
      const row = button.closest('.row');
      const mood = button.dataset.mood;
      this.library.setMood(row.dataset.id, mood);
      for (const chip of row.querySelectorAll('.chip')) {
        chip.classList.toggle('is-on', chip === button);
      }
    });

    this._wireTripPicker();
    this.root.querySelector('[data-action="done"]').addEventListener('click', () => this.onDone());
  }

  showMessage(title, body) {
    this._open(`
      <div class="panel">
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">${escapeHtml(body)}</p>
        <button class="primary" data-action="skip">Continue</button>
      </div>
    `);
    this.root.querySelector('[data-action="skip"]').addEventListener('click', () => this.onSkip());
  }
}

function stageLabel(stage) {
  return (
    {
      profile: 'Saying hello…',
      tracks: 'Collecting your top, saved and recent tracks…',
      artists: 'Fetching artist genres — the only mood signal Spotify still exposes…',
      classify: 'Sorting into moods…',
      done: 'Done.',
    }[stage] ?? 'Working…'
  );
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
