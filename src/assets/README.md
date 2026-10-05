# Building plaster texture

`plaster-weathered-v1.webp` was generated with the built-in imagegen tool and
resized/compressed using `scripts/prepare-plaster-texture.mjs`. The source is
an AI-generated material image, not a scan of any particular Lagos building.
The game samples it as neutral detail data over three metres and varies its
offset by building. Vite fingerprints the asset for deployment caching.

Exact generation prompt:

> Use case: photorealistic-natural. Asset type: seamless square albedo texture for plaster building walls in a 3D Lagos driving game. Flat orthographic straight-on scan of 3 metres by 3 metres of finely textured aged lime plaster, off-white neutral grey base, subtle uneven trowel marks, small aggregate pores, faint hairline cracks, restrained patchiness and mild weathering. Texture fills the whole square edge-to-edge, seamlessly tileable on all four edges. Even diffuse lighting, no directional shadows, no vignetting, no perspective. No windows, doors, bricks, strong stains, objects, text, borders or watermark. Low contrast so wall paint colours can tint this neutral texture naturally. Photographic material detail, believable scale.
