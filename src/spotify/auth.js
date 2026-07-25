/**
 * Spotify OAuth — Authorization Code with PKCE.
 *
 * PKCE rather than implicit or a client secret: this is a public client with no
 * server, so there is nowhere safe to keep a secret, and the implicit flow is
 * deprecated and gives no refresh token.
 *
 * Access tokens live in memory only. The refresh token goes to localStorage,
 * which is the honest tradeoff for a serverless client — it is the same
 * exposure any purely client-side Spotify app carries.
 */

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const STORAGE_KEY = 'roadtrip.spotify.refresh';
const VERIFIER_KEY = 'roadtrip.spotify.verifier';

const SCOPES = [
  'user-read-private',
  'user-top-read',
  'user-library-read',
  'user-read-recently-played',
  // Only needed for the Web Playback SDK path.
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

export class SpotifyAuth {
  constructor({ clientId, redirectUri }) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.accessToken = null;
    this.expiresAt = 0;
    this.refreshToken = localStorage.getItem(STORAGE_KEY);
  }

  get configured() {
    return Boolean(this.clientId);
  }

  get connected() {
    return Boolean(this.accessToken || this.refreshToken);
  }

  /** Send the user to Spotify. Returns nothing — the page navigates away. */
  async beginLogin() {
    const verifier = randomString(64);
    sessionStorage.setItem(VERIFIER_KEY, verifier);

    const challenge = await sha256Base64Url(verifier);
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });

    window.location.assign(`${AUTH_URL}?${params}`);
  }

  /**
   * Call on load. If we came back from Spotify with a code, exchange it and
   * clean the URL; otherwise try the stored refresh token.
   *
   * @returns {Promise<boolean>} whether we ended up with a usable token
   */
  async resume() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      cleanUrl();
      throw new Error(`Spotify authorisation was declined (${error})`);
    }

    if (code) {
      const verifier = sessionStorage.getItem(VERIFIER_KEY);
      cleanUrl();
      if (!verifier) throw new Error('Missing PKCE verifier — start the login again');
      await this._exchange({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        code_verifier: verifier,
      });
      sessionStorage.removeItem(VERIFIER_KEY);
      return true;
    }

    if (this.refreshToken) {
      try {
        await this.refresh();
        return true;
      } catch {
        this.disconnect();
        return false;
      }
    }
    return false;
  }

  /** A valid access token, refreshing first if it is close to expiry. */
  async token() {
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) return this.accessToken;
    if (!this.refreshToken) throw new Error('Not connected to Spotify');
    await this.refresh();
    return this.accessToken;
  }

  async refresh() {
    await this._exchange({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    });
  }

  async _exchange(body) {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, ...body }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Spotify token request failed (${response.status}) ${detail}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
    // A refresh response may or may not rotate the refresh token.
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
      localStorage.setItem(STORAGE_KEY, data.refresh_token);
    }
  }

  disconnect() {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = 0;
    localStorage.removeItem(STORAGE_KEY);
  }
}

function cleanUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  window.history.replaceState({}, '', url.toString());
}

function randomString(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ('0' + b.toString(16)).slice(-2)).join('').slice(0, length);
}

async function sha256Base64Url(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
