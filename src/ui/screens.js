import { MOODS } from '../spotify/genreMap.js';

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
  }

  hide() {
    this.root.innerHTML = '';
    this.root.classList.remove('is-open');
  }

  _open(html) {
    this.root.innerHTML = html;
    this.root.classList.add('is-open');
  }

  showConnect({ configured, error }) {
    this._open(`
      <div class="panel">
        <h1>Endless Road Trip</h1>
        <p class="lede">Your library becomes the road. Songs play in mood blocks,
        and the country and the weather change with them.</p>
        ${
          configured
            ? `<button class="primary" data-action="connect">Connect Spotify</button>`
            : `<p class="note">No Spotify client ID is configured, so the live
                connection is unavailable in this build. You can still drive, and
                still see the classifier and review screen running against a
                stand-in library.</p>`
        }
        <button class="ghost" data-action="skip">
          ${configured ? 'Just drive' : 'Continue'}
        </button>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
        <p class="fineprint">Nothing is ever written back to your Spotify account.
        Your mood corrections stay on this device.</p>
      </div>
    `);

    this.root.querySelector('[data-action="connect"]')?.addEventListener('click', () => this.onConnect());
    this.root.querySelector('[data-action="skip"]').addEventListener('click', () => this.onSkip());
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
