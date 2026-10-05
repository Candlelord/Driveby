# Driveby

A free-roaming field trip through Lagos and a connected northern landscape.
Drive yourself, pick destinations on the map, discover places with your friend
Tunde, run optional errands, and keep the tank full. There are no timed stages.

Lagos uses OpenStreetMap roads and building footprints within latitude
6.41–6.60 and longitude 3.34–3.50 (about 18 × 21 km). Buildings and landmarks
use generated geometry, so this is an interpretation of the city. Beyond
Lagos, the forest, savanna, Sahel, Kano and desert are procedural; their
layouts and distances are fictional. The overall bounds are 28 × 54 km.

## Run locally

```sh
npm install
npm run dev
npm run build
npm run preview
```

Vite serves the development build at http://localhost:5173. Append
`?quality=low`, `?quality=medium` or `?quality=high` to select a graphics tier.
Choose a new exploration or Continue from the main menu. Spotify is optional;
without credentials the game uses a stand-in playlist to drive the lighting
and mood. See `.env.example` for configuration. Live Spotify is unverified.

## Controls

| Input | Action |
|---|---|
| W / Up | Accelerate |
| S / Down | Brake, then reverse |
| A, D / Left, Right | Steer |
| Space | Handbrake |
| M / Tab | Open or close the map |
| Esc / P | Pause menu |
| J | Field-trip journal |
| R | Recover to a nearby road |
| V | Toggle Tunde's voice |

The map supports dragging, wheel or pinch zoom, and clicking destinations to
set a waypoint. Routes follow the road graph when possible; a direct line is
used when a graph route is unavailable. Pause offers the garage, journal,
look settings, recovery, and Save and quit to menu. Gamepad triggers and left
stick, plus touch driving buttons, are also supported; desktop is the primary
target.

Discoveries earn money and journal entries. Errands are optional. Stop near a
fuel station's pumps to refill automatically if you can afford it ($90 per
full tank). Glowing fuel tickets restore 25% of the tank. Empty fuel permits
slow movement, and an emergency refill prevents permanent stranding.
Progress autosaves in this browser's local storage; garage purchases and
paint choices are also stored locally.

## Map data pipeline

The baked map ships in `public/world/`, so ordinary builds need no Overpass
access. To refresh it:

```sh
npm run world:fetch
npm run world:build
npm run build
```

The downloader caches raw Overpass JSON in the ignored `osm-cache/` folder.
Rerunning it retries missing files; `--force` refreshes existing files.
It requests water and POIs plus roads, buildings and land use for 16 tiles:
50 cache files in total. Confirm all are present before calling the map
complete. The builder can run on a partial cache, leaving sparse areas.

The builder generates 400 m chunks, a ground raster, road graph, points of
interest and map image. Coordinates use metres around 6.455 N, 3.39 E: X is
east, Z is south, Y is up. The game's service worker retrieves world data from
the network first so rebuilt maps can reach returning players; hashed model
and application assets remain cached.

Map data © OpenStreetMap contributors, ODbL. See [CREDITS.md](CREDITS.md).

## Code layout

- `src/main.js`: loading, menu, overlays, simulation and rendering loop.
- `src/open/world.js`, `streamer.js`, `chunk.js`: map data, streaming and geometry.
- `src/open/north.js`, `farTerrain.js`: generated north and distant terrain.
- `src/open/vehicle.js`, `camera.js`, `controls.js`: driving, collisions and camera.
- `src/open/route.js`, `maps.js`: road graph, GPS, minimap and full map.
- `src/open/gameplay.js`, `places.js`, `menus.js`: fuel, errands, discoveries and journal.
- `src/open/traffic.js`, `peds.js`, `streets.js`, `landmarks3d.js`: city life and landmarks.
- `src/world/`: cars, model loading, sky, surfaces, weather and lighting.
- `src/garage/`, `garage.js`: car selection, purchases, paint and liveries.
- `src/spotify/`, `session.js`: optional music integration and mock playlist.
- `scripts/`: map download/build and model optimization.

Raw models live in ignored `models-src/`. Add entries to `models.config.json`
and run `npm run models` to optimize them into hashed files in `public/models/`
and update the runtime manifest. Keep licences and credits with every model.
Procedural geometry is the fallback while models load.

In development, `window.__drive` exposes the vehicle, world, renderer, scene,
camera, garage and gameplay for inspection. It is absent from production.

## Verification and remaining limits

The preceding session captured the menu, driving HUD, map and GPS, pause,
Lagos streets, generated biomes and several gameplay probes. Its final saved
National Theatre screenshot shows the building and surrounding streets from
farther away; the earlier grey view was taken beside its wall.

A fresh interactive browser pass is still needed for the Third Mainland
Bridge and lagoon, fuel station accessibility, Kano close-up and journal
layout. The current continuation has no connected browser. Build and data
checks do not establish those visual results. See `HANDOFF.md` for the latest
cache coverage and checks. `GRAPHICS.md` is a historical graphics checklist.

## Building architecture

Street-facing buildings now include batched 3D window surrounds, lintels,
sills, floor bands, entrances, parapets, selected balconies and air conditioners.
Small rectangular houses can have pitched zinc roofs. The facade shader adds
window reflections, curtain variation, plaster grain, damp and runoff marks.
Close-up architecture fades out by chunk distance; quality tiers cap the extra
instances to keep dense streets bounded. Footprints and collision shells stay
in map coordinates. Run `node scripts/test-building-details.mjs` to check
placement, winding, deterministic streaming rebuilds and geometry budgets.

The pause menu and garage offer Coastal colour alongside Clean and Gritty.
It gently warms highlights and cools shade. New garage profiles start with it;
existing profiles keep their saved look. Shops now have display windows or
roller shutters, outward-facing awnings, and patterned pavement slabs.

Pavements now include Eko bus shelters, benches and bins beside suitable roads.
Their placement avoids mapped water, buildings, junctions and bridge decks.
The lagoon has animated surface ripples anchored in world coordinates.
