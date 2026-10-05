# Continuation status — 5 October 2026

Claude's final probe completed before his session ended. The saved `probe.png`
shows the National Theatre from x + 260 m, z + 60 m, yaw -1.3, with streets and
buildings visible. The earlier probe was x + 60 m facing the wall. This supports
the wall explanation; a new opposite-heading test has not been performed.

Completed locally in this continuation:

- Rebuilt `public/world/` from 47 cached OSM files: 16,694 roads, 209,186
  buildings, 1,589 chunks, 18,085 graph nodes and 23,147 edges; 63 fuel stations.
- Parsed every generated chunk referenced in the metadata. World output is
  17,038,612 bytes, including map imagery and graph.
- Fixed stale map caching: network-first world files, a new service worker
  cache version, no cached HTTP errors, no HTML fallback for missing map data.
- Added OSM attribution to the full map and CREDITS.md; rewrote README for
  free roam, controls, fuel and map generation; marked GRAPHICS.md historical.
- Kept Claude's existing CSS cleanup. Added map fetch/build npm scripts.
- Production build passed. Vite reports its existing bundle-size and mixed
  static/dynamic north import warnings. `git diff --check` passed.
- Cache regression checks passed; rerun with
  `node scripts/test-service-worker.mjs`.

Unfinished:

- The cache now has 48 files. Two land-use tiles remain missing:
  `land_6.5050_3.4600.json`, `land_6.5525_3.4200.json`. The shipped map
  was built from the 47-file cache described above. All road/building tiles
  are present. The attempted Overpass retry failed with network errors and
  was stopped. Rerun `npm run world:fetch`, then `npm run world:build`.
- No browser is connected through the current UI tool (Chrome and in-app
  browser both unavailable). Fresh visual verification remains needed for
  Third Mainland Bridge, lagoon, fuel accessibility, Kano and journal layout.
- The user requested pushing this build for deployment testing to
  `claude/new-session-ccla6k`, `main` and `claude/modest-maxwell-l4cpzv`.
  Fresh visual checks remain pending: native Chrome was found, but computer-use
  stopped because it could not reliably identify the browser URL.

## Building pass

Added physical street-facing facade details, varied roof silhouettes and richer
procedural surface/glass shading. Corrected wall shading normals to agree with
face winding. New architecture uses four instanced material batches per chunk,
with a quality-scaled part limit and distance visibility. Geometry checks pass
for outside placement, positive transform determinants, both footprint windings,
deterministic rebuilds, roof slopes and normals matching triangles. A fresh
interactive visual check is still pending; these are geometry/build results.

## Bridge and traffic fixes

Road runs now split at chunk boundaries and surface queries also examine adjacent
chunks. Bridge elevations follow the actual direction of connected OSM ways
and reconcile branching ramps at shared nodes. Bridge ends start at normal
road height rather than the lagoon bed. Paved driving height matches the
rendered road lift. Parapets stop sideways slides; elevated cars ignore low
buildings below them, and recovery resets falling/tilted vehicle state.
Traffic crash rotation returns to its road heading and resets on respawn; lane
offsets use the actual road width. `node scripts/test-driving.mjs` reproduces
bridge seams, reversed ways, underpasses, barriers and sideways crash recovery.
These regressions and existing geometry/cache checks pass. Visual playtesting
remains user-side.

## Street character pass

Corrected shopfront outward normals. Added varied window displays, roller
shutters and pavement slabs with a consistent world-space texture scale.
Storefront geometry is batched and capped per chunk. Added an optional Coastal
colour grade in pause/garage, with warm highlights and turquoise shadow tint;
new profiles default to it while existing saved look preferences are kept.
The broader city-feel goal is active: runtime visual verification and further
street/landmark/lighting refinement remain.

## Pavement life and lagoon pass

Added batched Eko bus shelters, timber benches and bins beside suitable roads.
Placement rejects water, bridge roads, nearby building footprints and junctions;
limits are ten sites and three shelters per chunk. Actual baked Lagos data
produced 710 furniture sites, including 378 shelters across 373 chunks.
Added animated lagoon normal ripples anchored in world coordinates so shifting
the large water mesh does not drag the wave pattern with the car. Production
build and pavement placement checks passed. Full rendered appearance remains
unverified here; city-feel goal remains active.

## Bridge falls and sideways traffic follow-up

Bridge parapet collision now covers segment endpoints using lateral projection,
so chunk seams cannot disable the rails and forward exits remain open. Cars
retain tyre contact on descending bridge spans instead of launching from deck
height changes. Bridge rendering treats zero-height flagged decks consistently
with collision. Traffic impact rotation is limited to 0.3 radians and realigns
during the crash cooldown, preventing graph-following cars moving sideways.
Driving regression checks cover endpoint rails, descending ramps and crash
cooldown alignment. Runtime visual verification remains outstanding.

## Articulated pavement pedestrians

Replaced rigid box figures with rounded torsos and heads, noses, hair, eyes,
separate trousers and shoes, and animated opposing arm/leg swings. Basket
carriers steady their load with a raised arm. Height and clothing vary per
person. Seven instanced batches keep draw calls bounded; inactive people and
unused loads no longer occupy rendered instances. Walking offsets use actual
road widths and pavement height. Water, bridge roads, building interiors and
unloaded road paths are rejected. Pedestrian regression checks cover gait,
pavement placement and immediate removal of blocked walkers. Rendered visual
quality still needs in-game review; the overall city-feel goal remains active.

## Night street atmosphere

Street lamps now have small camera-facing halos and soft warm pavement pools,
batched in two additional draws per chunk and faded with the existing NIGHT
uniform. Pools use lamp-arm positions and reject water/bridge surfaces. Open
shop interiors gain warm emissive detail at dusk; the atlas shutter cell stays
dark. This is inexpensive projected illumination rather than extra shadowed
lights. Placement/render-state checks pass. Browser shader compilation and
the final night appearance remain unverified and need in-game review.

## National Theatre facade pass

The landmark's plain cylindrical wall now has two glazing tiers, 64 structural
fins, horizontal trim bands, 192 bronze relief motifs and four entrance
porticoes. Roof supports follow the saddle silhouette. Repeated details use
eight instanced batches instead of individual meshes. This remains an artistic
interpretation, informed by the official National Theatre architectural
description: https://nationaltheatre.gov.ng/wp-content/uploads/2024/06/NATMOS-2023-with-Cover.pdf
Landmark geometry checks and production build passed. In-game appearance and
interaction with the baked surrounding footprints still require visual review.
