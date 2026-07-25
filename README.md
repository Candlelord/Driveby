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
- **Distance.** Two rings of parallax ridge silhouettes and a starfield sit
  outside the fog, hazed toward the fog colour in proportion to its density.
  Without them the fog reads as an empty wall rather than as depth.
- **A full grade per mood.** Bloom, exposure, contrast, saturation, split
  toning, vignette, grain and chromatic aberration are mood properties like any
  other, so the look crossfades with the scene. Field of view is too — happy is
  wide and open, sad is tight and closed in.
- **Debug overlay.** Current mood (both, mid-crossfade), block progress, song
  counter, distance. Testing only — not a real UI.

Flat-shaded solid colours throughout, no textures on any geometry. The one
exception is a generated soft-dot alpha ramp used for particles, stars and the
sun glow: untextured points render as hard squares, which reads as a glitch
rather than mist.

## Render pipeline

`scene -> bloom -> tone map -> grade`, via `EffectComposer`.

Tone mapping happens *after* bloom so highlights keep headroom above 1.0 for
bloom to pick up — the sun disc, neon strips and headlights are deliberately
driven past 1.0 for exactly that reason. Exposure is applied before tone
mapping, where a stop change rolls highlights off properly instead of just
lifting the image; everything else is graded after, in display space, which is
where vignette and grain behave.

Bloom is the expensive link and the one that gets dropped: `CONFIG.quality`
defaults to `'auto'`, which starts with bloom on and disables it if the average
frame time crosses `bloomDropFrameMs`. The downgrade is one-way, since
re-enabling on a recovered average would just oscillate. `'high'` and `'low'`
pin it. The grade pass carries the look on its own without bloom — you lose the
glow, not the palette.

## Layout

```
src/
  main.js          scene setup, the frame loop, camera
  post.js          bloom + colour grade pipeline, quality watchdog
  config.js        every tuning knob (speed, steering, block pacing, densities)
  moods.js         the four mood profiles + mock block data
  moodDirector.js  the song/block clock and crossfade state
  blend.js         generic profile interpolation
  path.js          road centreline maths + the car-local transform
  input.js         keyboard / drag / tilt steering
  ui.js            debug overlay
  world/
    sky.js         gradient dome, sun/moon, stars, distant ridges
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

`src/moods.js` is the art direction: sky, lighting, weather, horizon, lens and
grade for all four moods. Any key listed in `COLOR_KEYS` or `NUMBER_KEYS` is
blended automatically — adding a new one to a profile plus its key list is all
it takes for it to crossfade.

Two things worth knowing before touching the numbers. Three's Lambert BRDF
divides irradiance by pi, so the light intensities that produce the brightness
you expect are roughly 3x what looks reasonable written down — tune those
against rendered pixels, not by eye on the source. And the grade should be felt,
not seen: `aberration` around 1.0 is already a few pixels of fringing in the
corners, and it goes garish fast.

In a dev build, `window.__roadtrip` exposes `{ state, director, scene, camera,
renderer, post, CONFIG, MOOD_PROFILES }` for poking at the sim from the console.
Mutating `MOOD_PROFILES` takes effect on the next frame, which makes it the
fastest way to dial a colour in.

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

Around 32 draw calls and ~11k triangles in a typical scene pass, plus the
post-processing chain. Road and terrain are rewritten into preallocated buffers
each frame with no per-frame allocation; scenery is instanced; the car is merged
down to one mesh per material; particle systems scale via draw range rather than
rebuilding.

## Next phase

Real Spotify data (saved/top/recently-played tracks), the genre → mood
classifier, and the real car model. The mood profile shape and the director's
block clock are the two seams those changes land on: swap the mock blocks for
classified ones and replace the song timer with playback events, and the rest of
the scene keeps working unchanged.
