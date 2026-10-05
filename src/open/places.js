import { toWorld } from './geo.js';

/**
 * Places worth finding. Lagos's are real, positioned from their coordinates;
 * the north's come from north.js. Each has a short note for the journal (in
 * the voice of someone who has just been there) and a line for your friend.
 *
 * `theme` picks the postcard drawing (see postcardArt.js).
 */
const LAGOS = [
  ['national-theatre', 'National Theatre', 6.4764727, 3.36949215, 'city', 'Built for FESTAC ’77 and shaped like a general’s cap. Every Lagosian has an opinion about it.', 'National Theatre! From the expressway it looks like a hat somebody left on the ground.'],
  ['tbs', 'Tafawa Balewa Square', 6.4485, 3.3985, 'city', 'The old racecourse, now a parade ground with the horses kept on the gate.', 'TBS. They held the independence celebrations here. The horses on the gate never moved since.'],
  ['cathedral', 'Cathedral Church of Christ', 6.4522, 3.3896, 'city', 'Gothic arches on the Marina, older than most of the skyline round it.', 'That cathedral has been standing on the Marina since before your grandpapa.'],
  ['link-bridge', 'Lekki–Ikoyi Link Bridge', 6.4489, 3.4329, 'lagoon', 'The cable-stayed bridge everyone photographs at night, white cables lit up over the lagoon.', 'The Link Bridge. People jog here at 6 a.m. like they have no fear of the hold-up at 8.'],
  ['third-mainland', 'Third Mainland Bridge', 6.4975, 3.4005, 'lagoon', 'Eleven-odd kilometres over the lagoon, one of the longest bridges in Africa.', 'Third Mainland. Look left, that is Makoko on the water. Look right, that is traffic. Always traffic.'],
  ['makoko', 'Makoko', 6.497, 3.387, 'lagoon', 'A whole neighbourhood on stilts over the lagoon, getting about by canoe.', 'Makoko. People live their whole lives on the water here. School by canoe, market by canoe.'],
  ['balogun', 'Balogun Market', 6.4547, 3.388, 'market', 'Fabric, shoes, electronics, everything. Bring patience and small change.', 'Balogun. If you cannot find it here, it has not been invented.'],
  ['idumota', 'Idumota', 6.457, 3.385, 'market', 'The busiest crossroads on the Island, where the market spills into the road.', 'Idumota. Hold your phone tight and your patience tighter.'],
  ['stadium', 'National Stadium, Surulere', 6.4993, 3.364, 'city', 'Where the Green Eagles played. Quieter now, still enormous.', 'The National Stadium. My uncle swears he saw Rashidi Yekini score here. He swears a lot of things.'],
  ['unilag', 'University of Lagos', 6.5158, 3.3897, 'lagoon', 'Akoka’s campus on the lagoon, the “University of First Choice and the Nation’s Pride”.', 'UNILAG! The lagoon front is where everybody pretends to read.'],
  ['bar-beach', 'Bar Beach and Eko Atlantic', 6.421, 3.413, 'sea', 'The Atlantic on one side, a new city being pushed out into the sea on the other.', 'Smell that sea breeze. They are building a whole city on sand they pumped out of the ocean.'],
  ['freedom-park', 'Freedom Park', 6.4497, 3.3946, 'city', 'The old colonial prison, turned into a park for music, art and late evenings.', 'This used to be Broad Street Prison. Now it is concerts and suya. Glow-up.'],
  ['muson', 'MUSON Centre', 6.444, 3.404, 'city', 'Concert halls on Onikan, home of the Lagos classical music crowd.', 'MUSON. Classical music in Lagos. Yes, it exists, I have seen it.'],
  ['ikoyi-club', 'Ikoyi Club 1938', 6.453, 3.437, 'city', 'Golf, tennis and very old members.', 'Ikoyi Club. Membership is basically inherited. We are just looking.'],
  ['carter-bridge', 'Carter Bridge', 6.4637, 3.379, 'lagoon', 'The first bridge to the Island, still carrying Lagos across the lagoon.', 'Carter Bridge. The original. Everybody uses it, nobody admires it.'],
  ['tejuosho', 'Tejuosho Market', 6.507, 3.37, 'market', 'Yaba’s big market, now with a multi-storey building and the old chaos around it.', 'Tejuosho. You can buy okrika here that fits better than new.'],
  ['ojuelegba', 'Ojuelegba', 6.509, 3.363, 'market', 'The junction everybody sings about, buses packed in every direction.', 'Ojuelegba! You know the song. Now you know the traffic.'],
  ['computer-village', 'Computer Village', 6.5963, 3.3426, 'market', 'Ikeja’s phone and laptop market, a city of shops inside a city.', 'Computer Village. Anything with a battery, fixed in twenty minutes, questions not asked.'],
  ['oshodi', 'Oshodi Interchange', 6.553, 3.344, 'market', 'The transport hub that replaced the old Oshodi market under the bridges.', 'Oshodi. Ten years ago you could not pass here on foot. Now look at it.'],
  ['nike-gallery', 'Nike Art Gallery', 6.4396, 3.4877, 'city', 'Five floors of Nigerian art in Lekki.', 'Nike Art Gallery. Five floors. I have only ever reached the second one.'],
  ['polo-club', 'Lagos Polo Club', 6.451, 3.413, 'city', 'Horses and big hats in the middle of Ikoyi.', 'Polo Club. Horses, hats, and somebody’s cousin who says “darling” too much.'],
  ['lekki-phase1', 'Admiralty Way', 6.448, 3.473, 'city', 'Lekki Phase 1’s main road of restaurants, gyms and traffic.', 'Admiralty Way. Every restaurant here has a neon sign and a long story.'],
];

const NORTH_NOTES = {
  ogere: ['A roadside town on the way north, famous for its bush meat stalls.', 'Ogere. Do not ask what is in that pot, just enjoy the smell.'],
  olokemeji: ['Forest country, red earth roads and cocoa farms.', 'Proper forest now. Wind the window down, smell the rain.'],
  kishi: ['Savanna farm town, yams piled high on market day.', 'Kishi. Look at those yams. Each one could feed a family.'],
  madalla: ['A crossroads town in the shadow of the granite hills.', 'Madalla. The rock over there is watching us.'],
  dawaki: ['Sahel village of mud houses with cool, thick walls.', 'Mud walls this thick keep the inside cool all day. Proper engineering.'],
  gezawa: ['Cattle country. The herds have right of way.', 'Gezawa. If a cow is on the road, the cow has right of way.'],
  kano: ['The old walled city, a thousand years of trade across the Sahara.', 'Kano! The walls go round the whole old city. Trade from here reached all the way to the Mediterranean.'],
  kurmi: ['One of the oldest markets in West Africa, under the same roofs for centuries.', 'Kurmi Market. Traders have been selling here for five hundred years.'],
  'gidan-makama': ['The old palace, now a museum of Kano’s history.', 'Gidan Makama. The palace that is now a museum. Very old, very cool inside.'],
  'kano-mosque': ['The central mosque by the emir’s palace.', 'The central mosque. Friday prayers here, the whole city stops.'],
  'dye-pits': ['Indigo dye pits in use for centuries, cloth turning blue in the ground.', 'Kofar Mata dye pits. That blue has been made the same way for five hundred years.'],
  'kofar-nassarawa': ['The southern gate of the old city.', 'Kofar Nassarawa. One of the gates of the old wall.'],
  'kofar-mata': ['The western gate, near the dye pits.', 'Kofar Mata. Through here for the dye pits.'],
  'kofar-mazugal': ['The northern gate, facing the desert.', 'The north gate. Out there is nothing but sand.'],
  'kofar-dawanau': ['The eastern gate.', 'Kofar Dawanau. Another gate, another story.'],
  'zuma-rock': ['A monolith of granite rising seven hundred metres, with a face if you look for it.', 'Zuma Rock! Look, there is a face on it. They say it watches over the whole region.'],
  oasis: ['Palms and a pool of water in the middle of nothing.', 'An oasis. Real water. I thought those were just in cartoons.'],
  dunes: ['Ridges of sand as far as you can see.', 'Dunes as far as the eye can see. Drive fast and do not stop.'],
  'savanna-dome': ['A granite dome above the savanna, a view across half the country.', 'From up here you can see everywhere we have been.'],
};

/** All discoverable places: [{ id, name, x, z, radius, theme, note, line }]. */
export function discoveries(world) {
  const list = [];
  for (const [id, name, lat, lon, theme, note, line] of LAGOS) {
    const { x, z } = toWorld(lat, lon);
    list.push({ id, name, x, z, radius: id === 'third-mainland' ? 260 : 90, theme, note, line });
  }
  // More from OpenStreetMap: named sights not already covered.
  const extra = (world.pois?.sights ?? [])
    .filter((s) => ['museum', 'monument', 'stadium', 'marketplace', 'mall', 'theatre', 'attraction', 'zoo', 'theme_park', 'lighthouse', 'memorial', 'university', 'gallery', 'ferry_terminal'].includes(s.kind))
    .filter((s) => !list.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 400));
  const seen = new Set();
  for (const s of extra) {
    if (seen.has(s.name) || list.length > 70) continue;
    seen.add(s.name);
    const theme = s.kind === 'marketplace' || s.kind === 'mall' ? 'market' : s.kind === 'ferry_terminal' || s.kind === 'lighthouse' ? 'lagoon' : 'city';
    list.push({ id: `osm-${s.osm}`, name: s.name, x: s.x, z: s.z, radius: 70, theme, note: `${capital(s.kind.replace('_', ' '))} in Lagos.`, line: `${s.name}. Mark it in the book.` });
  }
  const themeFor = (p) => (p.kind === 'village' ? ({ forest: 'forest', savanna: 'savanna', sahel: 'walls' }[p.biome] ?? 'hills') : { kano: 'walls', kurmi: 'market', 'gidan-makama': 'walls', 'kano-mosque': 'mosque', 'dye-pits': 'pastel', 'zuma-rock': 'rock', oasis: 'oasis', dunes: 'desert', 'savanna-dome': 'hills' }[p.id] ?? (p.kind === 'gate' ? 'walls' : 'hills'));
  for (const p of world.north.places) {
    const [note, line] = NORTH_NOTES[p.id] ?? ['Somewhere worth stopping.', 'Write this one down.'];
    list.push({ id: p.id, name: p.name, x: p.x, z: p.z, radius: p.radius ?? (p.kind === 'city' ? 900 : p.kind === 'village' ? 200 : 110), theme: themeFor(p), note, line });
  }
  return list;
}

function capital(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
