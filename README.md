# Endless Road Trip — v0.1 prototype

An endless, auto-driving road trip. No win state, no fail state; the loop is
about continuing the drive.

Your own music sets the mood; the mood decides where you are and what the
weather is doing.

**Verification status:** the world, audio, physics and classifier are all
exercised in a real browser. The live Spotify connection is *not* — it needs a
registered app and a real account, neither of which exist in the environment
this was built in. See "What is and isn't verified" at the end.

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

For Spotify, copy `.env.example` to `.env.local` and fill in a client ID from
the [Spotify dashboard](https://developer.spotify.com/dashboard). Without one
the game still runs on the mock playlist, and the classifier and review screen
still run against a stand-in library.

## Controls

| Input | Action |
|---|---|
| Arrow keys / `A` `D` | Steer (desktop) |
| Drag anywhere | Steer — drag across ~¼ of the screen is full lock |
| Device tilt | Steer. On iOS, tap **enable tilt steering** first (the OS requires a gesture before handing over orientation events) |
| `1`–`5` | Force tornado / lightning / snow / sandstorm / aurora |
| `0` | Stop the running event |
| `M` | Mute audio |
| `R` | Reopen the mood review screen |

The car drives itself forward at a constant speed. Steering only moves it across
the road, and it clamps at the lane edges — there is nothing to crash into.

## The environment system

Four layers. Each owns a different slice of the look, and later layers override
earlier ones in `compose()` — which is what lets a sandstorm read as a sandstorm
over any place in any mood, without either of them knowing sandstorms exist.

| Layer | Owns | Advances on |
|---|---|---|
| **Mood** (`moods.js`) | Sky, sun, lamps, lens, colour grade | Song-block boundaries |
| **Terrain set** (`terrainSets.js`) | Place: landform, ground, scenery, features | Drawn from the mood's pool at block start |
| **Climate** (`climates.js`) | Air: precipitation, visibility, wet road | Named by the terrain set |
| **Event** (`events.js`) | Rare dramatic overlay | Its own scheduler |

### Terrain sets

28 of them, pooled per mood. A block start draws one at random from the
incoming mood's pool, so a Sad block might be a flooded plain or a burned forest
or an ice road, and you don't know which until you're in it.

| Mood | Pool |
|---|---|
| Sad (8) | flooded plain, cliff coast, burned forest, rural crossroads, highland moor, ice road, *mountain pass*, *salt flats* |
| Chill (10) | pine forest, misty lake, redwood corridor, terraced valley, autumn birches, *river crossing*, *blossom avenue*, *highland moor*, *mountain pass*, *bioluminescent valley* |
| Happy (9) | wheat fields, palm highway, desert bloom, orchard hills, lavender fields, canyon road, *river crossing*, *blossom avenue*, *salt flats* |
| Hip-Hop (7) | skyline drive, neon underpass, rooftop skybridge, warehouse district, refinery coast, tunnel run, *bioluminescent valley* |

*Italicised sets sit in more than one pool and read differently depending on
which mood's light is falling on them.*

Landform comes from four controls in `terrain.js`: `hillHeight` (amplitude),
`hillScale` (how big the forms are), `hillSharpness` (bends the noise — above 1
for jagged peaks, below 1 for wind-rounded dunes), and `causeway` / `cliffSide`
for raised banks and cliff walls. Features — water planes, god-rays, distant
skylines, overpass arches, tunnels, ground fog — are each one number on the
profile, so a set turns one on simply by having a non-zero value and it fades
with everything else.

**Tunnels** are the one feature with reach outside the renderer. `tunnelAt()`
returns how enclosed the road is at a given distance, and three systems read the
same function: the geometry places segments where it is non-zero, the lighting
swaps the sky's fill for the tunnel's own lamps, and the audio drops the wind
while swelling the road noise and closing the bus filter. Tunnels run in
stretches, not continuously — the interesting part is the mouth.

Scenery does **not** cross-fade between sets. Each slot along the road belongs
to whichever set was current when that stretch first came into existence, which
is ~330 units ahead — well outside the fog. The swap is never seen happening,
and it is far cheaper than blending every shape against every other. Ground
colour and landform *do* crossfade, over ~5s.

### Climates

clear, clear night, wet night, mist, rain, ash, leaf fall, petals, frozen, snow,
storm. A terrain set names the one it wants, so each mood's characteristic
weather falls out of its pool rather than being stated twice.

Falling particles are one parameterised system, not several: snow, ash, autumn
leaves and blossom petals differ only in colour, fall speed and how much they
sway. `frozen` has no precipitation at all — what sells it is black ice, the
most reflective road surface in the game.

### Events

Five, each a short timeline of phases producing overrides:

- **Tornado** — funnel on the horizon, trees bending, debris building, a
  green-grey whiteout at the pass-through, then clearing faster than it arrived
- **Lightning storm** — full-screen flashes, rain stepping up behind them
- **Sandstorm** — orange fog wall, fast dust, neon blooming through the haze
- **Snowfall** — everything pales, fog shortens, nothing else runs alongside
- **Aurora** — the rare quiet one; forces a clear night sky whatever the mood
  was doing, and silences all other weather

None of them touch steering or the car's control. Press **1–5** to force one and
**0** to stop it.

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
- **Debug overlay.** All four layers (both values, mid-crossfade), block
  progress, song counter, distance. Testing only — not a real UI.

Flat-shaded solid colours throughout, no textures on any geometry. The two
exceptions are generated: a soft-dot alpha ramp for particles, stars and glows,
and a wedge ramp for headlight beams. Untextured points render as hard squares,
which reads as a glitch rather than mist.

## Spotify, audio and physics

### Spotify

OAuth 2.0 **Authorization Code with PKCE** — the right flow for a public client
with no server, and the only one that still yields a refresh token. Access
tokens live in memory; the refresh token goes to localStorage, which is the
honest tradeoff for a serverless client.

After login it pulls top tracks (short and long term), saved tracks and recently
played, then batch-fetches the **artist** objects — because genre tags live on
the artist and are the primary classification signal available.

> Spotify deprecated `audio-features` and `audio-analysis` for new apps in
> November 2024 with no reinstated access path. **Nothing in this game may
> depend on tempo, energy or valence.** Speed and intensity cues come from mood
> and terrain instead.

`genreMap.js` holds the genre → mood table (longest rule first, so "melodic
hardcore" isn't caught by "melodic"), with track-title keywords as a weak
tiebreaker and a confidence score. The review screen is pre-filled and sorted
**lowest confidence first** — the player is correcting a decision, not sorting a
library from scratch. Corrections persist locally and are never written back.

**Playback** tries the Web Playback SDK first (real in-browser audio, Premium
only) and falls back to deep-linking the Spotify app. A hard constraint shapes
the audio design:

> The SDK streams through a DRM-sandboxed element. There is **no raw buffer** —
> no `AnalyserNode`, no beat detection, and no filter can be attached to the
> music. `setVolume` is the only lever.

So ducking is a coarse volume dip, not the low-pass an engineer would reach for,
and all the muffling happens on our own SFX bus instead.

### Audio

Every SFX layer is **synthesised, not sampled** — no assets to license, nothing
to download, and every parameter is live. Wind genuinely thickens with speed
rather than crossfading between two recordings of wind.

```
engine (3 detuned oscillators) / wind (white) / road (brown) /
rain / hush / gust            ->  per-layer gain
  -> SFX low-pass  (opens in clear weather, closes in heavy)
  -> master gain -> destination
```

The low-pass is the "music is inside the car" effect: severity from rain, drift,
wind and fog closes it from 18kHz down to ~500Hz, so the outside world thickens
against the music without the music ever being touched. One-shots (birds, gulls,
thunder) briefly duck the SDK volume by 10–20%. Press **M** to mute.

### Physics

Arcade, not simulation — there is no fail state, so this exists to give the car
weight, not to create challenge. Speed eases toward a per-terrain cap with an
asymmetric curve (pulling away takes longer than easing off) and falling
acceleration near the cap. Steering has two stages of lag: the wheel follows the
finger, the car follows the wheel. Body roll trails the steering so the car
settles after a correction. Suspension bob is a function of *distance*, not
time, scaled by the terrain set's roughness, with event shake layered on top.
The road edge is a soft push-back with a rumble-strip cue, never a wall.

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
  environment.js   the four layers, their clocks, and compose()
  moods.js         4 mood profiles + mock block data
  terrainSets.js   18 terrain sets and the per-mood pools
  climates.js      8 climate profiles
  events.js        5 extreme weather events and their scheduler
  physics.js       arcade car feel
  session.js       ties Spotify to the game; entirely optional
  blend.js         generic profile interpolation
  path.js          road centreline maths + the car-local transform
  input.js         keyboard / drag / tilt steering
  ui.js            debug overlay
  audio/
    noise.js       generated white / brown / rain buffers
    sfx.js         the SFX bus, layers, muffle filter and one-shots
  spotify/
    auth.js        OAuth PKCE
    library.js     data pull, classification, local store, block building
    genreMap.js    genre -> mood table and the classifier
    player.js      Web Playback SDK + deep-link fallback
    mock.js        stand-in library for running without credentials
  props/
    kit.js         the 18-shape roadside prop kit
  ui/
    screens.js     connect and review screens
  world/
    sky.js         gradient dome, sun/moon, stars, distant ridges
    road.js        asphalt, edge lines, dashed centre line
    terrain.js     the ground either side, and its shared height function
    props.js       instanced scenery, spawned per terrain set
    features.js    water, god-rays, skyline, overpasses, ground fog
    eventVisuals.js funnel cloud, debris, aurora ribbons
    carGeometry.js the car model, shared by the player and traffic
    car.js         player car, headlight pool and beams
    traffic.js     other cars, both directions
    weather.js     rain, drift (snow/ash) and haze
    ribbon.js      the strip-of-quads primitive road and terrain share
    textures.js    the generated alpha ramps
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

Draw calls scale with what a set actually uses: unused prop shapes and features
are hidden entirely rather than drawn at zero scale. Road and terrain are rewritten into preallocated buffers
each frame with no per-frame allocation; scenery and traffic are instanced; the
car is merged to one mesh per material so detail costs no draw calls; particle
systems scale via draw range rather than rebuilding.

## What is and isn't verified

**Verified in a real browser**, by driving the build and reading values back:

- All 18 terrain sets render, with their water, cliffs, causeways, god-rays,
  skylines and overpasses
- All 5 events reach their intended peaks (funnel, debris, shake, fog, drift,
  aurora all confirmed at the right magnitudes)
- The classifier, review screen, corrections and their persistence, and block
  building — running against the stand-in library
- The audio graph: 3 engine oscillators, 5 noise layers, and the muffle filter
  measurably closing from ~7.8kHz in clear air to ~3.1kHz in a storm
- Physics acceleration curve, and the quality tiers

**Not verified, and cannot be here:**

- **The live Spotify connection.** OAuth PKCE, the token exchange and refresh,
  the real data pull, and Web Playback SDK audio are all written but have never
  run against Spotify's servers — there is no client ID and no Premium account
  in this environment. Treat that path as untested code, not working code.
- **Real-device performance.** Frame timings here come from a software
  renderer, so the tier thresholds and the watchdog's 26ms cutoff are reasoned
  rather than measured.

## Deliberately not in this build

The purchased car model, persistent progress across sessions, the weighted
Sad→Happy mood drift, rest stops, journal/postcards, companion presence, and any
narrative content.

Interpretations rather than literal implementations: the hip-hop "sharp shadows"
is high-contrast lighting rather than real shadow maps (an infinite road needs
careful shadow frustum management, and it was not worth the mobile cost). Prop
placement is a deterministic hash scatter rather than an authored layout. A few
per-set flourishes listed as optional in the brief — gull and crow silhouettes,
a redwood the road passes *through* — are not in; the sets read without them.

## Next phase

Real Spotify data (saved/top/recently-played tracks), the genre → mood
classifier, and the real car model. The mood profile shape and the block clock
in `environment.js` are the two seams those changes land on: swap the mock
blocks for classified ones and replace the song timer with playback events, and
the rest of the scene keeps working unchanged. Terrain and climate are already
independent of all of it.
