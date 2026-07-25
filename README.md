# Endless Road Trip — v0.1 prototype

An endless, auto-driving road trip. No win state, no fail state; the loop is
about continuing the drive.

This build is the **visual + driving systems prototype** only. There is no
Spotify auth and no audio — mock song blocks stand in, so the environment
systems can be built and felt before real music is wired up.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

The dev server binds to all interfaces, so a phone on the same network can hit
`http://<your-machine-ip>:5173` to test touch and tilt steering.

```bash
npm run build && npm run preview   # production build
```

Append `?quality=low`, `medium` or `high` to force a rendering tier — useful for
checking how the game looks and runs on a weaker device from a desktop.

## Controls

| Input | Action |
|---|---|
| Arrow keys / `A` `D` | Steer (desktop) |
| Drag anywhere | Steer — drag across ~¼ of the screen is full lock |
| Device tilt | Steer. On iOS, tap **enable tilt steering** first (the OS requires a gesture before handing over orientation events) |

The car drives itself forward at a constant speed. Steering only moves it across
the road, and it clamps at the lane edges — there is nothing to crash into.

## The environment system

Three independent axes, each with its own profile set and its own clock. They
compose rather than nest, which is where most of the variety comes from: 4 moods
× 5 terrains × 5 climates is 100 combinations, and nothing keeps them in sync.

| Axis | Owns | Advances on | Crossfade |
|---|---|---|---|
| **Mood** (`moods.js`) | Sky, sun, lamps, lens, colour grade | Song-block boundaries | ~4s |
| **Terrain** (`terrains.js`) | Landform, ground colour, scenery | Distance driven (~2600 units) | ~9s |
| **Climate** (`climates.js`) | Precipitation, visibility, veil, wet road | Its own timer (~70s) | ~11s |

**Moods:** sad, chill, happy, hip-hop — cycling in the fixed block order the
spec asks for.

**Terrains:** plains, forest, desert, mountains, city. Three shape parameters
tell them apart: `hillHeight` is amplitude, `hillScale` is how big the forms
are, and `hillSharpness` bends the noise — above 1 it pushes peaks up and
flattens valleys into mountains, below 1 it rounds everything into dunes. Each
terrain also carries its own scenery type (round trees, pines, cacti, boulders,
tower blocks).

**Climates:** clear, mist, rain, storm, snow. Storm throws its rain sideways and
carries lightning; snow drifts and sways and whitens whatever terrain is
underneath.

`compose()` in `environment.js` is where the axes meet: climate *veils* and
*dims* whatever the mood is doing and *tints* whatever terrain is underneath, so
a storm reads as a storm at midday or at midnight, over grass or over sand,
without either of the other axes knowing storms exist.

## What's in this build

- **Endless road.** The centreline is a closed-form function of distance rather
  than an accumulated segment list, so it never drifts and needs no chunk
  bookkeeping. The car sits at the world origin and the road is transformed
  around it, which keeps float precision constant no matter how far you drive.
- **Mock mood blocks.** A block ends when its last "song" finishes — length is
  song-count driven, not timer driven, matching how the real Spotify-backed
  version has to behave.
- **Traffic.** Cars in both directions, instancing the same model the player
  drives. Same-direction traffic runs slower so you steadily catch and pass it;
  oncoming traffic closes at nearly twice your speed and is gone in a second. At
  night the two read completely differently — receding tail lights versus
  headlights growing out of the dark. Nothing collides: instead of a crash,
  traffic eases toward its shoulder when you end up on top of it.
- **Car lights.** A lit pool of road ahead of the car, and beam shafts at lamp
  height that only come up when there is something in the air to scatter off —
  so clear nights stay clean and fog gets shafts. Lamps come on for darkness
  *and* for heavy weather.
- **Distance.** Two rings of parallax ridge silhouettes and a starfield sit
  outside the fog, hazed toward the fog colour in proportion to its density.
- **A full grade per mood.** Bloom, exposure, contrast, saturation, split
  toning, vignette, grain and chromatic aberration crossfade with everything
  else. Field of view too — happy is wide and open, sad is tight and closed in.
- **Debug overlay.** All three axes (both values, mid-crossfade), block
  progress, song counter, distance. Testing only — not a real UI.

Flat-shaded solid colours throughout, no textures on any geometry. The two
exceptions are generated: a soft-dot alpha ramp for particles, stars and glows,
and a wedge ramp for headlight beams. Untextured points render as hard squares,
which reads as a glitch rather than mist.

## Mobile

`quality.js` picks a tier at startup from pointer type, core count and device
memory, deliberately starting conservative on touch — better to hold a smooth
medium than to stutter at high for the three seconds the watchdog needs.

Two kinds of setting. **Budgets** (draw distance, terrain resolution, particle
counts, traffic slots, star count) are fixed at startup, because changing them
means reallocating geometry. **Bloom and pixel ratio** are adjustable at
runtime, so those are what the frame-time watchdog in `post.js` walks back —
bloom first, then resolution. One-way; re-enabling on a recovered average would
just oscillate.

| | high | medium | low |
|---|---|---|---|
| Pixel ratio cap | 2 | 1.5 | 1.25 |
| MSAA | on | off | off |
| Bloom | on | on | off |
| Road drawn ahead | 360u | 296u | 232u |
| Triangles | ~21k | ~16k | ~12.5k |

Rendering also stops entirely when the tab is backgrounded, which on a phone is
the difference between a game and a battery drain. Touch steering is a
drag-anywhere virtual stick, and the viewport handles the address bar
collapsing (`visualViewport`) and safe-area insets.

## Render pipeline

`scene -> bloom -> tone map -> grade`, via `EffectComposer`.

Tone mapping happens *after* bloom so highlights keep headroom above 1.0 for
bloom to pick up — the sun disc, neon strips and headlights are deliberately
driven past 1.0 for exactly that reason. Exposure is applied before tone
mapping, where a stop change rolls highlights off properly instead of just
lifting the image; everything else is graded after, in display space, which is
where vignette and grain behave. The grade pass carries the look without bloom —
you lose the glow, not the palette.

## Layout

```
src/
  main.js          scene setup, the frame loop, camera
  config.js        tuning knobs; quality.js overwrites the budget ones
  quality.js       device tiering and per-tier budgets
  post.js          bloom + colour grade pipeline, quality watchdog
  environment.js   the three axes, their clocks, and compose()
  moods.js         4 mood profiles + mock block data
  terrains.js      5 terrain profiles
  climates.js      5 climate profiles
  blend.js         generic profile interpolation
  path.js          road centreline maths + the car-local transform
  input.js         keyboard / drag / tilt steering
  ui.js            debug overlay
  world/
    sky.js         gradient dome, sun/moon, stars, distant ridges
    road.js        asphalt, edge lines, dashed centre line
    terrain.js     the ground either side, and its shared height function
    props.js       instanced trees / cacti / rocks / buildings / street lamps
    carGeometry.js the car model, shared by the player and traffic
    car.js         player car, headlight pool and beams
    traffic.js     other cars, both directions
    weather.js     rain, snow and haze
    ribbon.js      the strip-of-quads primitive road and terrain share
    textures.js    the two generated alpha ramps
```

## Tuning

`src/config.js` holds the driving feel (`speed`, `steerRate`, `steerResponse`,
the camera values) and the three environment clocks. Drop `songSeconds` to ~3,
`terrainRunLength` to ~200 and `climateRunSeconds` to ~5 to see everything cycle
quickly — but set `environment.nextTerrainAt` / `nextClimateAt` too, since the
first thresholds are captured when the Environment is constructed.

The profile files are the art direction. Any key listed in a `*_COLOR_KEYS` or
`*_NUMBER_KEYS` array is blended automatically — adding a new one to a profile
plus its key list is all it takes for it to crossfade.

Two things worth knowing before touching the numbers. Three's Lambert BRDF
divides irradiance by pi, so the light intensities that produce the brightness
you expect are roughly 3x what looks reasonable written down — tune those
against rendered pixels, not by eye on the source. And the grade should be felt,
not seen: `aberration` around 1.0 is already a few pixels of fringing in the
corners, and it goes garish fast.

In a dev build, `window.__roadtrip` exposes `{ state, environment, traffic,
scene, camera, renderer, post, tier, CONFIG, MOOD_PROFILES, TERRAIN_PROFILES,
CLIMATE_PROFILES }`. Mutating a profile takes effect on the next frame, which
makes it the fastest way to dial a colour in. To jump straight to a combination:

```js
const e = __roadtrip.environment;
for (const [axis, id] of [[e.mood,'hiphop'], [e.terrain,'city'], [e.climate,'snow']]) {
  axis.fromId = id; axis.toId = id; axis.transition = 1;
}
```

## Performance

Around 47 draw calls and ~21k triangles in a high-tier scene pass, plus the
post-processing chain. Road and terrain are rewritten into preallocated buffers
each frame with no per-frame allocation; scenery and traffic are instanced; the
car is merged to one mesh per material so detail costs no draw calls; particle
systems scale via draw range rather than rebuilding.

## Deliberately not in this build

Spotify OAuth, any audio playback, the purchased car model, genre-based mood
classification, persistent progress, rest stops, journal/postcards, companion
presence, and any narrative content.

Two things from the spec that were interpreted rather than implemented
literally: the hip-hop profile's "sharp shadows" is done as high-contrast
lighting rather than real shadow maps — an infinite road needs careful shadow
frustum management and it was not worth the mobile cost at this stage. Prop
placement is a deterministic hash scatter rather than an authored layout.

## Next phase

Real Spotify data (saved/top/recently-played tracks), the genre → mood
classifier, and the real car model. The mood profile shape and the block clock
in `environment.js` are the two seams those changes land on: swap the mock
blocks for classified ones and replace the song timer with playback events, and
the rest of the scene keeps working unchanged. Terrain and climate are already
independent of all of it.
