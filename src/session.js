import { SpotifyAuth } from './spotify/auth.js';
import { Library } from './spotify/library.js';
import { Player } from './spotify/player.js';
import { buildMockTracks } from './spotify/mock.js';
import { Screens } from './ui/screens.js';
import { BLOCK_ORDER } from './moods.js';

/**
 * Ties Spotify to the game, and stays entirely optional.
 *
 * The drive runs whether or not an account is connected: with a library, the
 * block clock advances on real track ends and blocks are built from real songs;
 * without one, the mock playlist and its timer carry on exactly as before.
 * Nothing in the world code knows which is happening.
 */
export class Session {
  constructor(environment) {
    this.environment = environment;
    this.auth = new SpotifyAuth({
      clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
      redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? window.location.origin + window.location.pathname,
    });
    this.library = new Library(this.auth);
    this.player = new Player(this.auth);
    this.screens = new Screens(document.getElementById('screens'));
    this.state = 'idle';
    this.nowPlaying = null;
  }

  async begin() {
    this.screens.onSkip = () => this._startDriving();
    this.screens.onDone = () => this._startDriving();
    this.screens.onConnect = () => this.auth.beginLogin();

    // A previously built and corrected library takes precedence — no reason to
    // make someone re-review their own decisions.
    if (this.library.restore()) {
      await this._afterLibrary();
      return;
    }

    if (!this.auth.configured) {
      this.library.tracks = buildMockTracks();
      this.library.loaded = true;
      this.screens.showConnect({ configured: false });
      // Show the review screen from the stand-in library, so the classifier is
      // still exercised end to end without credentials.
      this._mock = true;
      return;
    }

    try {
      const resumed = await this.auth.resume();
      if (!resumed) {
        this.screens.showConnect({ configured: true });
        return;
      }
    } catch (error) {
      this.screens.showConnect({ configured: true, error: error.message });
      return;
    }

    await this._buildLibrary();
  }

  /** Debug/entry hook: show the review screen for whatever library exists. */
  showReview() {
    if (!this.library.loaded) return false;
    this.screens.showReview(this.library);
    return true;
  }

  async _buildLibrary() {
    try {
      await this.library.build((stage, progress) => this.screens.showLoading(stage, progress));
      await this._afterLibrary();
    } catch (error) {
      this.screens.showMessage('Could not read your library', error.message);
    }
  }

  async _afterLibrary() {
    const mode = await this.player.connect(this.library.profile);
    if (mode === 'deeplink') {
      this.deepLinkOnly = true;
    }
    this.screens.showReview(this.library);
  }

  _startDriving() {
    this.screens.hide();
    this.state = 'driving';

    if (this.library.loaded && !this._mock) {
      const blocks = this.library.buildBlocks(BLOCK_ORDER);
      if (blocks.length) this.environment.useBlocks(blocks, (track) => this._play(track));
    }
    this.onStart?.();
  }

  async _play(track) {
    this.nowPlaying = track;
    if (!track) return;
    await this.player.playTrack(track).catch(() => {});
  }

  update() {
    this.player.update();
  }
}
