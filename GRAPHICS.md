# 50 graphics & 3D improvements

Status against the current build. **Done** items are implemented and were
checked in a browser; **Listed** items are specified but not built.

## Sky and atmosphere

| # | Improvement | Status |
|---|---|---|
| 1 | Procedural cloud deck — 4-octave fbm projected onto a plane above the camera, so cells stretch toward the horizon instead of ringing the dome | **Done** |
| 2 | Two cloud layers at different scroll speeds for parallax depth | **Done** |
| 3 | Clouds lit from the sun side, tops picking up the key light | **Done** |
| 4 | Cloud cover and edge sharpness as per-mood parameters (overcast Sad, crisp cumulus Happy) | **Done** |
| 5 | Clouds drift with distance travelled, not just time, so they slide past as you drive | **Done** |
| 6 | Star shimmer | **Done** |
| 7 | Three-stop sky gradient with a horizon glow band | **Done** (earlier pass) |
| 8 | In-shader sun scattering halo | **Done** (earlier pass) |
| 9 | Parallax ridge silhouettes hazed by fog density | **Done** (earlier pass) |
| 10 | Anamorphic lens flare streaks on the sun disc | Listed |
| 11 | Screen-space god rays from the sun | Listed |
| 12 | Height fog as a separate gradient from distance fog | Listed |

## Scenery and instancing

| # | Improvement | Status |
|---|---|---|
| 13 | Per-instance colour jitter, so identical props stop reading as clones | **Done** |
| 14 | Emissive props exempt from the jitter — a neon sign in a different orange each instance reads as a bug | **Done** |
| 15 | Non-uniform per-instance scale on X and Z | **Done** |
| 16 | Wind sway on vegetation, each prop on its own phase | **Done** |
| 17 | Distance fade-in at the spawn boundary instead of popping | **Done** |
| 18 | Clumping so density varies into thickets and clearings | **Done** (earlier pass) |
| 19 | Density scaled by fog reach, so foggy sets stay populated | **Done** (earlier pass) |
| 20 | 26 new prop types — signage, fences, agriculture, industry, camp furniture | **Done** |
| 21 | Per-prop scale damping so large structures don't dwarf the road | **Done** |
| 22 | Road-aligned vs. scattered orientation per prop type | **Done** |
| 23 | Conifers as stacked tiers; broadleaf canopies as overlapping lobes | **Done** (earlier pass) |
| 24 | Prop LOD — swap to a cheaper mesh past a distance threshold | Listed |
| 25 | Contact darkening where props meet the ground | Listed |

## Terrain and water

| # | Improvement | Status |
|---|---|---|
| 26 | Per-vertex terrain colour banded by height — hollows toward the accent, ridges toward the light | **Done** |
| 27 | Pale caps on high ground, strengthened by the climate's ground tint (snow on peaks) | **Done** |
| 28 | Water displaced by two crossed sine trains into actual waves | **Done** |
| 29 | Wave amplitude driven by wind, so still air leaves the surface near-flat | **Done** |
| 30 | Recomputed water normals so the sun track moves with the swell | **Done** |
| 31 | Terrain sharpness exponent for jagged peaks vs. rounded dunes | **Done** (earlier pass) |
| 32 | Foam where water meets the shore | Listed |
| 33 | Planar reflection on water | Listed |
| 34 | Triplanar-style slope blending on steep terrain | Listed |

## Particles and life

| # | Improvement | Status |
|---|---|---|
| 35 | Birds, gated on weather and daylight — they only fly when birds would | **Done** |
| 36 | Fireflies on glowing night sets, with a collective pulse | **Done** |
| 37 | Exhaust plume, thicker when cold and at speed | **Done** |
| 38 | Tyre spray on wet roads, scaled by speed | **Done** |
| 39 | One parameterised drift system covering snow, ash, leaves and petals | **Done** (earlier pass) |
| 40 | Wind-slanted rain streaks | **Done** (earlier pass) |
| 41 | Dust motes made visible inside light shafts | Listed |
| 42 | Rain ripple rings on the road surface | Listed |
| 43 | Windscreen droplets as a screen-space layer | Listed |

## Lighting, lens and render

| # | Improvement | Status |
|---|---|---|
| 44 | Bloom before tone mapping, so highlights keep headroom | **Done** (earlier pass) |
| 45 | Split-tone grade, vignette, grain, chromatic aberration — all per-mood | **Done** (earlier pass) |
| 46 | Headlight pool and fog-gated beam shafts | **Done** (earlier pass) |
| 47 | Tunnel lighting that replaces the sky's fill rather than dimming it | **Done** (earlier pass) |
| 48 | Real shadow map for the car, replacing the blob | Listed |
| 49 | FXAA for tiers where MSAA is off | Listed |
| 50 | Depth of field on the far field | Listed |

**36 done, 14 listed.** The listed items are all real work rather than
placeholders — the four most valuable are a car shadow map (48), water
reflection (33), god rays (11) and FXAA on the low tier (49).
