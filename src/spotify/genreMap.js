/**
 * Genre → mood lookup.
 *
 * This is the primary classification signal, because it has to be: Spotify
 * deprecated audio-features and audio-analysis for new apps in November 2024
 * and there is still no reinstated access path, so tempo / energy / valence are
 * simply not available. Nothing in this game may depend on them.
 *
 * Matching is substring-based against the artist's genre tags, longest rule
 * first, so "melodic hardcore" does not get caught by "melodic".
 */
export const GENRE_RULES = [
  // --- hip-hop
  ['hip hop', 'hiphop'],
  ['hip-hop', 'hiphop'],
  ['rap', 'hiphop'],
  ['trap', 'hiphop'],
  ['drill', 'hiphop'],
  ['grime', 'hiphop'],
  ['boom bap', 'hiphop'],
  ['g funk', 'hiphop'],
  ['crunk', 'hiphop'],
  ['phonk', 'hiphop'],

  // --- sad
  ['singer-songwriter', 'sad'],
  ['sad', 'sad'],
  ['slowcore', 'sad'],
  ['sadcore', 'sad'],
  ['emo', 'sad'],
  ['shoegaze', 'sad'],
  ['post-rock', 'sad'],
  ['folk', 'sad'],
  ['americana', 'sad'],
  ['blues', 'sad'],
  ['ballad', 'sad'],
  ['piano', 'sad'],
  ['classical', 'sad'],
  ['requiem', 'sad'],
  ['gospel', 'sad'],
  ['soul', 'sad'],

  // --- chill
  ['lo-fi', 'chill'],
  ['lofi', 'chill'],
  ['chillhop', 'chill'],
  ['chill', 'chill'],
  ['ambient', 'chill'],
  ['downtempo', 'chill'],
  ['trip hop', 'chill'],
  ['jazz', 'chill'],
  ['bossa nova', 'chill'],
  ['neo soul', 'chill'],
  ['dream pop', 'chill'],
  ['bedroom pop', 'chill'],
  ['indie folk', 'chill'],
  ['study', 'chill'],
  ['meditation', 'chill'],

  // --- happy
  ['dance pop', 'happy'],
  ['dance', 'happy'],
  ['disco', 'happy'],
  ['funk', 'happy'],
  ['afrobeat', 'happy'],
  ['afrobeats', 'happy'],
  ['amapiano', 'happy'],
  ['reggaeton', 'happy'],
  ['latin', 'happy'],
  ['salsa', 'happy'],
  ['house', 'happy'],
  ['synthpop', 'happy'],
  ['power pop', 'happy'],
  ['ska', 'happy'],
  ['reggae', 'happy'],
  ['k-pop', 'happy'],
  ['pop', 'happy'],
  ['rock', 'happy'],
  ['punk', 'happy'],
  ['metal', 'hiphop'], // punchy and dark; closest of the four buckets
].sort((a, b) => b[0].length - a[0].length);

/**
 * Weak secondary signal — title keywords only break ties, never override a
 * confident genre match.
 */
const TITLE_HINTS = [
  [/\b(sad|alone|lonely|cry|tears|goodbye|funeral|grief|miss you|without you)\b/i, 'sad'],
  [/\b(chill|calm|slow|dream|sleep|drift|float|quiet)\b/i, 'chill'],
  [/\b(party|dance|celebrate|sunshine|happy|good time|feel good)\b/i, 'happy'],
];

export const MOODS = ['sad', 'chill', 'happy', 'hiphop'];

/**
 * Classify one track.
 *
 * @param {{name: string, genres: string[]}} track
 * @returns {{mood: string, confidence: number, reason: string}}
 */
export function classifyTrack(track) {
  const votes = { sad: 0, chill: 0, happy: 0, hiphop: 0 };
  let matched = null;

  for (const genre of track.genres ?? []) {
    const lower = genre.toLowerCase();
    for (const [needle, mood] of GENRE_RULES) {
      if (lower.includes(needle)) {
        // Longer, more specific matches count for more.
        votes[mood] += 1 + needle.length / 20;
        matched = matched ?? genre;
        break;
      }
    }
  }

  const total = Object.values(votes).reduce((sum, v) => sum + v, 0);

  if (total > 0) {
    const [mood, score] = topVote(votes);
    // Confidence is how decisively the winner beat the field.
    const confidence = Math.min(0.98, 0.45 + (score / total) * 0.5);
    return { mood, confidence, reason: `genre: ${matched}` };
  }

  for (const [pattern, mood] of TITLE_HINTS) {
    if (pattern.test(track.name ?? '')) {
      return { mood, confidence: 0.3, reason: 'title keyword' };
    }
  }

  // No genre tags at all is common for smaller artists. Chill is the least
  // wrong default: it is the bucket a misfiled track disrupts least.
  return { mood: 'chill', confidence: 0.1, reason: 'no genre data' };
}

function topVote(votes) {
  let best = 'chill';
  let bestScore = -1;
  for (const [mood, score] of Object.entries(votes)) {
    if (score > bestScore) {
      best = mood;
      bestScore = score;
    }
  }
  return [best, bestScore];
}
