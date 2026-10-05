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
