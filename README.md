# Endless Road Trip — v0.1 prototype

An endless, auto-driving road trip. No win state, no fail state; the loop is
about continuing the drive.

This build is the **visual + driving systems prototype** only. There is no
Spotify auth and no audio — mock song blocks stand in, so the terrain / mood /
weather transition system can be built and felt before real music is wired up.

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

## Controls

| Input | Action |
|---|---|
| Arrow keys / `A` `D` | Steer (desktop) |
| Drag anywhere | Steer — drag across ~¼ of the screen is full lock |
| Device tilt | Steer. On iOS, tap **enable tilt steering** first (the OS requires a gesture before handing over orientation events) |

The car drives itself forward at a constant speed. Steering only moves it across
the road, and it clamps at the lane edges — there is nothing to crash into.

## What's in this build

- **Endless road.** The centreline is a closed-form function of distance rather
  than an accumulated segment list, so it never drifts and needs no chunk
  bookkeeping. The car sits at the world origin and the road is transformed
  around it, which keeps float precision constant no matter how far you drive.
- **Mock mood blocks.** Four hardcoded blocks (`src/moods.js`) cycling in fixed
  order: sad → chill → happy → hip-hop → repeat. A block ends when its last
  "song" finishes — length is song-count driven, not timer driven, matching how
  the real Spotify-backed version has to behave.
- **Crossfading environment.** On a block boundary, sky gradient, fog colour and
  density, ambient and directional light, ground/road/prop colours, hill height,
  and weather all interpolate over ~4 seconds. Nothing hard-cuts.
- **Roadside scenery that morphs.** Every scatter slot draws all four prop
  shapes at the same spot, scaled by how much of their mood is currently mixed
  in — so pines shrink away as boulders grow in their place.
- **Weather.** Rain streaks and drifting dust/mist, both with amount and colour
  driven by the blended profile, so they ramp instead of switching on.
- **Debug overlay.** Current mood (both, mid-crossfade), block progress, song
  counter, distance. Testing only — not a real UI.

Flat-shaded solid colours throughout, no textures on any geometry. The one
exception is a generated soft-dot alpha ramp used for particles and the sun
glow: untextured points render as hard squares, which reads as a glitch rather
than mist.

## Layout

```
src/
  main.js          scene setup, the frame loop, camera
  config.js        every tuning knob (speed, steering, block pacing, densities)
  moods.js         the four mood profiles + mock block data
  moodDirector.js  the song/block clock and crossfade state
  blend.js         generic profile interpolation
  path.js          road centreline maths + the car-local transform
  input.js         keyboard / drag / tilt steering
  ui.js            debug overlay
  world/
    sky.js         gradient dome, sun/moon disc
    road.js        asphalt, edge lines, dashed centre line
    terrain.js     the ground either side, and its shared height function
    props.js       instanced trees / rocks / buildings / street lamps
    car.js         placeholder vehicle
    weather.js     rain and dust particles
    ribbon.js      the strip-of-quads primitive road and terrain share
```

## Tuning

`src/config.js` holds the knobs worth playing with — `speed`, `steerRate`,
`steerResponse`, and the camera values change the driving feel; `songSeconds`
and `crossfadeSeconds` change transition pacing (drop `songSeconds` to ~3 to see
the full mood loop quickly).

Per-mood colours and weather live in `src/moods.js`. Any key listed in
`COLOR_KEYS` or `NUMBER_KEYS` is blended automatically — adding a new one to a
profile plus its key list is all it takes for it to crossfade.

In a dev build, `window.__roadtrip` exposes `{ state, director, scene, camera,
renderer, CONFIG }` for poking at the sim from the console.

## Deliberately not in this build

Spotify OAuth, any audio playback, the purchased car model, genre-based mood
classification, persistent progress, rest stops, journal/postcards, companion
presence, and any narrative content.

Two things from the spec that were interpreted rather than implemented
literally: the hip-hop profile's "sharp shadows" is done as high-contrast
lighting rather than real shadow maps — an infinite road needs careful shadow
frustum management and it was not worth the mobile cost at this stage. Prop
placement is a deterministic hash scatter rather than an authored layout.

## Performance

Around 30 draw calls and ~8.5k triangles in a typical frame. Road and terrain
are rewritten into preallocated buffers each frame with no per-frame allocation;
scenery is instanced; particle systems scale via draw range rather than
rebuilding.

## Next phase

Real Spotify data (saved/top/recently-played tracks), the genre → mood
classifier, and the real car model. The mood profile shape and the director's
block clock are the two seams those changes land on: swap the mock blocks for
classified ones and replace the song timer with playback events, and the rest of
the scene keeps working unchanged.
