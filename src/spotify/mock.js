import { classifyTrack } from './genreMap.js';

/**
 * A stand-in library.
 *
 * The Spotify half of this build cannot be exercised without a registered app
 * and a real account, so the classifier, the review screen and the block
 * builder are wired to run against this instead when there are no credentials.
 * Everything downstream of `Library.tracks` therefore stays testable.
 */
const RAW = [
  ['Ghost Town Radio', 'The Long Way', ['indie folk', 'singer-songwriter']],
  ['Paper Boats', 'Aurelie Vance', ['chamber pop', 'singer-songwriter']],
  ['Hollow Season', 'Mara Quist', ['slowcore', 'sadcore']],
  ['Nine Winters', 'Bell & Ash', ['folk', 'americana']],
  ['Salt Air', 'Coen Marsh', ['shoegaze', 'dream pop']],
  ['Low Tide Blues', 'Ruth Delacroix', ['blues', 'soul']],

  ['Cassette Sunlight', 'Nubu', ['lo-fi beats', 'chillhop']],
  ['Slow Orbit', 'Hana Ito', ['ambient', 'downtempo']],
  ['Blue Hour Drive', 'Petra Lune', ['trip hop', 'downtempo']],
  ['Rosewater', 'Kofi Blaise', ['neo soul', 'jazz']],
  ['Paperlight', 'Sen & Oro', ['bedroom pop', 'dream pop']],
  ['Quiet Machines', 'Vell', ['ambient', 'study beats']],

  ['Sunburst Avenue', 'The Tangerines', ['dance pop', 'power pop']],
  ['Kilele', 'Ade Nwosu', ['afrobeats', 'amapiano']],
  ['Gold Rush Disco', 'Volta Kids', ['disco', 'funk']],
  ['Verano Loco', 'Mireya Sol', ['latin pop', 'reggaeton']],
  ['Neon Bicycle', 'Hyper Marina', ['synthpop', 'dance']],
  ['Ten Foot Tall', 'The Bright Ones', ['ska', 'reggae']],

  ['Concrete Garden', 'MC Vandal', ['east coast hip hop', 'boom bap']],
  ['Nightshift', 'Dree', ['trap', 'rap']],
  ['Southside Static', 'Kilo Grey', ['drill', 'grime']],
  ['Chrome Lungs', 'PHNTM', ['phonk', 'trap']],
  ['Bodega Hours', 'Ives Marlow', ['jazz rap', 'hip hop']],
  ['Late Pass', 'Sable Ray', ['g funk', 'rap']],

  // A few deliberately hard ones, so the review screen has something to surface.
  ['Untitled Sketch 4', 'Anon Collective', []],
  ['Miss You Already', 'Private Press', []],
  ['Dance With The Dark', 'Two Rivers', ['experimental']],
  ['Winter Sun', 'Halden', ['post-rock', 'ambient']],
];

export function buildMockTracks() {
  return RAW.map(([name, artist, genres], index) => {
    const entry = {
      id: `mock-${index}`,
      uri: `spotify:track:mock${index}`,
      name,
      artist,
      durationMs: 150_000 + index * 4000,
      genres,
    };
    const result = classifyTrack(entry);
    return { ...entry, mood: result.mood, confidence: result.confidence, reason: result.reason };
  });
}
