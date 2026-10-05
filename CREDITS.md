# Credits

## Map data

Lagos roads, building footprints, land use, water and points of interest are
derived from ? [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
available under the [Open Database Licence (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).
The derived map database is shipped in `public/world/`; `scripts/fetch-osm.mjs`
and `scripts/build-world.mjs` reproduce it from Overpass data. The northern
landscape is procedural, with fictional distances and layouts.

## 3D models

| Model | Author | Licence | Source |
|---|---|---|---|
| CarConcept (player car; interior, wipers and engine stripped, simplified and compressed) | © 2024 Darmstadt Graphics Group GmbH | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [KhronosGroup/glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept) |
| Cartoon Sports Car (the Harmattan GT; steering wheel and ground plane stripped, paint made tintable, simplified and compressed) | RCC Design | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/3d-models/cartoon-sports-car-0fd87559642a41b7a7924876ad3e9399) |
| Haussmannien Building 1 and 2 (baked into the Paris street facades) | pacpak | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/pacpak) |
| Dutch Canals House Amsterdam 3 (baked into the Amsterdam street facades) | ustoopia | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/ustoopia) |
| Cicada (garage car; interior and shadow stripped, compressed) | RCC Design | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/3d-models/cicada-retro-cartoon-car) |
| Executive Sedan (the Kestrel Saloon, and in traffic) | RCC Design | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/retrovalorem) |
| Ambulance (the Rapid Response, and in traffic) | RCC Design | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/retrovalorem) |
| Retro Anime Vintage Volkswagen Van (traffic and the Lagos danfo, recoloured) | Jungle Jim | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/) |
| Zhiguli Soviet Cars (traffic) | spacelynxcanfly | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/) |
| Shop (1) — market stall | Vadim Rychkov | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/) |
| Low Poly Shop | Samad.Ahmed | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/) |
| Street Barrier | Mehdi Shahsavan | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | [Sketchfab](https://sketchfab.com/) |

The facades are rendered from those models into textures (`npm run models -- bldg`, then `node scripts/bake-facades.mjs`); the models themselves are not shipped.

Everything else in the game — roads, terrain, trees, buildings, people, other
cars, sky and sound — is generated in code.

- Atlantic GT: Retro Car by dylanheyes, CC BY 4.0, https://sketchfab.com/3d-models/retro-car-4ddec407d79c42f58bff02512da89e4b; simplified and compressed.
- Palm Compact: Retro Car by dylanheyes, CC BY 4.0, https://sketchfab.com/3d-models/retro-car-e2a2aee55f514db5ad5c1e82c8f4235b; simplified and compressed.
