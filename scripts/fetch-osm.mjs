#!/usr/bin/env node
/**
 * Download the OpenStreetMap data the Lagos part of the world is built from.
 *
 *   node scripts/fetch-osm.mjs          # everything missing from osm-cache/
 *   node scripts/fetch-osm.mjs --force  # everything, again
 *
 * Writes raw Overpass JSON into osm-cache/ (gitignored); scripts/build-world.mjs
 * turns it into the game's chunk files. The area is fetched in tiles so no one
 * query is large enough to time out. Data © OpenStreetMap contributors, ODbL.
 */
import { mkdir, writeFile, access } from 'node:fs/promises';

export const BBOX = { south: 6.41, west: 3.34, north: 6.6, east: 3.5 };
const TILE_LAT = 0.0475;
const TILE_LON = 0.04;
const ENDPOINTS = ['https://overpass-api.de/api/interpreter'];
const force = process.argv.includes('--force');
const dir = new URL('../osm-cache/', import.meta.url);
await mkdir(dir, { recursive: true });

const ROADS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|track|road';

async function query(body, attempt = 0) {
  const url = ENDPOINTS[attempt % ENDPOINTS.length];
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': 'driveby-game/1.0 (world builder)', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(body),
    });
    const text = await response.text();
    if (!response.ok || !text.startsWith('{')) throw new Error(`${response.status} ${text.slice(0, 120)}`);
    const json = JSON.parse(text);
    if (json.remark && /timeout|runtime error/i.test(json.remark)) throw new Error(json.remark);
    return text;
  } catch (error) {
    if (attempt >= 9) throw error;
    const wait = Math.min(60000, 12000 * (attempt + 1));
    console.log(`  retry in ${wait / 1000}s: ${error.message.slice(0, 100)}`);
    await new Promise((r) => setTimeout(r, wait));
    return query(body, attempt + 1);
  }
}

async function fetchTo(name, body) {
  const file = new URL(name, dir);
  if (!force) {
    try {
      await access(file);
      console.log(`${name}: cached`);
      return;
    } catch {
      // not yet
    }
  }
  const started = Date.now();
  let text;
  try {
    text = await query(body);
  } catch (error) {
    console.log(`${name}: FAILED (${error.message.slice(0, 80)}) — run again to retry`);
    return;
  }
  await writeFile(file, text);
  console.log(`${name}: ${Math.round(text.length / 1024)} KB in ${Math.round((Date.now() - started) / 1000)}s`);
  await new Promise((r) => setTimeout(r, 4000));
}

const bbox = (s, w, n, e) => `${s},${w},${n},${e}`;
const whole = bbox(BBOX.south, BBOX.west, BBOX.north, BBOX.east);

// Water and coast, places, fuel and landmarks: small queries over the whole area.
await fetchTo('water.json', `[out:json][timeout:300];(way["natural"~"^(water|coastline)$"](${whole});relation["natural"="water"](${whole});way["waterway"~"^(riverbank|canal|river)$"](${whole});way["landuse"~"^(reservoir|basin)$"](${whole}););out body geom;`);
await fetchTo('pois.json', `[out:json][timeout:300];(nwr["amenity"="fuel"](${whole});node["place"~"^(suburb|neighbourhood|quarter|town|village)$"](${whole});nwr["tourism"~"^(attraction|museum|monument|viewpoint|artwork|zoo|theme_park|gallery)$"](${whole});nwr["historic"](${whole});nwr["amenity"~"^(marketplace|university|theatre|ferry_terminal)$"](${whole});nwr["shop"="mall"](${whole});nwr["leisure"="stadium"](${whole});nwr["man_made"="lighthouse"](${whole}););out center tags;`);

// Buildings and roads, tile by tile. `--reverse` walks the tiles the other way,
// so two copies can share the work.
const tiles = [];
for (let lat = BBOX.south; lat < BBOX.north - 1e-6; lat += TILE_LAT) for (let lon = BBOX.west; lon < BBOX.east - 1e-6; lon += TILE_LON) tiles.push([lat, lon]);
if (process.argv.includes('--reverse')) tiles.reverse();
for (const [lat, lon] of tiles) {
  {
    const tile = bbox(lat.toFixed(4), lon.toFixed(4), Math.min(BBOX.north, lat + TILE_LAT).toFixed(4), Math.min(BBOX.east, lon + TILE_LON).toFixed(4));
    const id = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
    await fetchTo(`roads_${id}.json`, `[out:json][timeout:300];way["highway"~"^(${ROADS})$"](${tile});out body geom;`);
    await fetchTo(`buildings_${id}.json`, `[out:json][timeout:300];way["building"](${tile});out body geom;`);
    await fetchTo(`land_${id}.json`, `[out:json][timeout:300];(way["landuse"](${tile});relation["landuse"](${tile});way["leisure"~"^(park|stadium|golf_course|pitch|garden)$"](${tile});way["natural"~"^(beach|sand|wetland|wood|scrub|grassland)$"](${tile});relation["natural"~"^(wetland|beach)$"](${tile}););out body geom;`);
  }
}
console.log('done');
