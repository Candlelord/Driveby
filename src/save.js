/**
 * Saved progress.
 *
 * One slot, in this browser's local storage: which trip you were on, how far
 * along it you were, and enough of the drive's state to put you back on the
 * same stretch of road with the same music block. Written every few seconds
 * while driving and whenever the page is hidden, so closing the tab, locking
 * the phone or the browser killing a background tab all keep your place.
 *
 * Storage can be unavailable (private windows, blocked site data), so every
 * access is guarded and the game simply runs without saving.
 */

// v2: the open world (position, fuel, places found…). The v1 road-trip save is left alone.
const KEY = 'driveby.save.v2';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    return save && save.version === 2 ? save : null;
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...save, version: 2, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** "3 hours ago" style, for the resume button. */
export function savedAgo(save) {
  const minutes = Math.max(0, Math.round((Date.now() - (save.savedAt ?? Date.now())) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
