import { classifyTrack, MOODS } from './genreMap.js';

const API = 'https://api.spotify.com/v1';
const STORAGE_KEY = 'roadtrip.library.v1';

/**
 * Pulls the user's listening history, tags every track with a mood, and keeps
 * the result locally.
 *
 * The local store is the source of truth once built — nothing is ever written
 * back to Spotify, and corrections the player makes on the review screen
 * survive across sessions.
 */
export class Library {
  constructor(auth) {
    this.auth = auth;
    this.tracks = [];
    this.profile = null;
    this.loaded = false;
  }

  /** Restore a previously built and corrected library. */
  restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.tracks) || !data.tracks.length) return false;
      this.tracks = data.tracks;
      this.profile = data.profile ?? null;
      this.loaded = true;
      return true;
    } catch {
      return false;
    }
  }

  save() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tracks: this.tracks, profile: this.profile, savedAt: Date.now() })
    );
  }

  clear() {
    localStorage.removeItem(STORAGE_KEY);
    this.tracks = [];
    this.loaded = false;
  }

  async _get(path) {
    const token = await this.auth.token();
    const response = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 429) {
      // Respect the documented backoff rather than hammering.
      const wait = Number(response.headers.get('Retry-After') ?? 2);
      await sleep((wait + 1) * 1000);
      return this._get(path);
    }
    if (!response.ok) throw new Error(`Spotify ${path} failed (${response.status})`);
    return response.json();
  }

  /**
   * Build the library from scratch.
   * @param {(stage: string, progress: number) => void} onProgress
   */
  async build(onProgress = () => {}) {
    onProgress('profile', 0.05);
    this.profile = await this._get('/me');

    onProgress('tracks', 0.15);
    const collected = new Map();

    // Three sources, because each says something different: top tracks are
    // what they love, saved tracks are what they chose to keep, recently
    // played is what they are actually listening to right now.
    const sources = [
      '/me/top/tracks?limit=50&time_range=short_term',
      '/me/top/tracks?limit=50&time_range=long_term',
      '/me/tracks?limit=50',
      '/me/tracks?limit=50&offset=50',
      '/me/player/recently-played?limit=50',
    ];

    for (let i = 0; i < sources.length; i++) {
      try {
        const page = await this._get(sources[i]);
        for (const item of page.items ?? []) {
          const track = item.track ?? item;
          if (!track?.id) continue;
          if (!collected.has(track.id)) collected.set(track.id, track);
        }
      } catch {
        // A missing scope or an empty history should not sink the whole build.
      }
      onProgress('tracks', 0.15 + (i / sources.length) * 0.35);
    }

    onProgress('artists', 0.55);
    const genresByArtist = await this._fetchArtistGenres([...collected.values()], onProgress);

    onProgress('classify', 0.9);
    this.tracks = [...collected.values()].map((track) => {
      const genres = [...new Set(track.artists.flatMap((a) => genresByArtist.get(a.id) ?? []))];
      const entry = {
        id: track.id,
        uri: track.uri,
        name: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        durationMs: track.duration_ms,
        genres,
      };
      const result = classifyTrack(entry);
      return { ...entry, mood: result.mood, confidence: result.confidence, reason: result.reason };
    });

    this.loaded = true;
    this.save();
    onProgress('done', 1);
    return this.tracks;
  }

  /**
   * Genre tags live on the artist, not the track, so this is the one place a
   * batch fetch is needed. `/artists?ids=` takes 50 at a time.
   */
  async _fetchArtistGenres(tracks, onProgress) {
    const ids = [...new Set(tracks.flatMap((t) => t.artists.map((a) => a.id)))].filter(Boolean);
    const genres = new Map();

    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      try {
        const data = await this._get(`/artists?ids=${batch.join(',')}`);
        for (const artist of data.artists ?? []) {
          if (artist) genres.set(artist.id, artist.genres ?? []);
        }
      } catch {
        // Skip the batch; those tracks fall back to title/default classification.
      }
      onProgress('artists', 0.55 + (i / Math.max(1, ids.length)) * 0.35);
    }
    return genres;
  }

  /** Player correction from the review screen. */
  setMood(trackId, mood) {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track || !MOODS.includes(mood)) return;
    track.mood = mood;
    track.confidence = 1;
    track.reason = 'corrected by you';
    this.save();
  }

  byMood(mood) {
    return this.tracks.filter((t) => t.mood === mood);
  }

  get counts() {
    const counts = Object.fromEntries(MOODS.map((m) => [m, 0]));
    for (const track of this.tracks) counts[track.mood]++;
    return counts;
  }

  /** Lowest-confidence first — those are the ones worth a human glance. */
  reviewOrder(limit = 40) {
    return [...this.tracks].sort((a, b) => a.confidence - b.confidence).slice(0, limit);
  }

  /**
   * Turn the library into blocks of songs, one per mood, in the game's fixed
   * order. This is what replaces MOCK_BLOCKS once a library exists.
   */
  buildBlocks(order, maxPerBlock = 6) {
    return order
      .map((mood) => {
        const pool = shuffle(this.byMood(mood));
        const songs = pool.slice(0, maxPerBlock);
        return songs.length ? { mood, songCount: songs.length, songs } : null;
      })
      .filter(Boolean);
  }
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
