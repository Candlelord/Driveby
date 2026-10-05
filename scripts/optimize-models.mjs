#!/usr/bin/env node
/**
 * Model pipeline: takes raw .glb files from models-src/ and writes
 * web-ready ones to public/models/.
 *
 *   npm run models            # all models in models.config.json
 *   npm run models -- car     # just those whose name contains "car"
 *
 * Raw downloads are usually far too heavy for a phone browser — 10 MB of PNG
 * textures and 200k triangles for something seen from 10 metres. For each
 * model this strips parts nobody will see (interiors, engines, wipers),
 * simplifies the geometry, resizes and re-encodes the textures as WebP, and
 * meshopt-compresses what is left. The runtime loader (src/world/models.js)
 * decodes it.
 *
 * Adding a model: drop the .glb in models-src/, add an entry to
 * models.config.json (with its licence and credit), run `npm run models`.
 */
import { readFile, writeFile, stat, rename, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { metalRough, dedup, prune, weld, simplify, textureCompress, meshopt, resample, quantize, flatten, join } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const config = JSON.parse(await readFile(new URL('../models.config.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// name -> hashed file name, merged across runs so optimising one model does
// not forget the others. The game reads this (src/world/model-manifest.json).
const manifestUrl = new URL('../src/world/model-manifest.json', import.meta.url);
let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
} catch {
  // First run.
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const triangles = (doc) =>
  doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);

for (const [name, spec] of Object.entries(config.models)) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  const src = new URL(`../models-src/${spec.src}`, import.meta.url);
  const out = new URL(`../public/models/${name}.glb`, import.meta.url);
  const doc = await io.read(fileURLToPath(src));
  const before = { bytes: (await stat(fileURLToPath(src))).size, tris: triangles(doc) };

  // 0. Old spec/gloss materials (three.js no longer reads them) become metal/rough.
  await doc.transform(metalRough());

  // 0b. Paint baked into an atlas as a flat colour is turned neutral, so the
  // game can tint it (setPaint) instead of being stuck with the artist's green.
  for (const rule of spec.neutralise ?? []) {
    const hue = new RegExp(rule.texture, 'i');
    for (const texture of doc.getRoot().listTextures()) {
      if (!hue.test(texture.getURI() || texture.getName())) continue;
      const { data, info } = await sharp(Buffer.from(texture.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += 3) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (g > r * rule.gOverR && b > r * rule.bOverR && g > 40) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const v = Math.min(255, lum * rule.gain);
          data[i] = data[i + 1] = data[i + 2] = v;
        }
      }
      texture.setImage(await sharp(data, { raw: info }).png().toBuffer()).setMimeType('image/png');
    }
  }

  // 0c. Hue changes baked into a texture: pixels inside a colour box are
  // scaled per channel (an orange van becomes a yellow danfo).
  for (const rule of spec.recolor ?? []) {
    for (const texture of doc.getRoot().listTextures()) {
      const { data, info } = await sharp(Buffer.from(texture.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += 3) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r >= rule.minR && g >= rule.minG && g <= rule.maxG && b <= rule.maxB && r > g * rule.rOverG) {
          data[i + 1] = Math.min(255, g * rule.mul[1]);
          data[i + 2] = Math.min(255, b * rule.mul[2]);
        }
      }
      texture.setImage(await sharp(data, { raw: info }).png().toBuffer()).setMimeType('image/png');
    }
  }

  // 1. Strip parts by name.
  const strip = (spec.strip ?? []).map((p) => new RegExp(p, 'i'));
  let removed = 0;
  for (const node of doc.getRoot().listNodes()) {
    if (strip.some((re) => re.test(node.getName()))) {
      node.setMesh(null);
      removed++;
    }
  }
  // 1b. Parts that share the paint's material (rims, brake discs) get a copy of
  // it, so tinting the paint leaves them alone.
  const trim = (spec.trim ?? []).map((p) => new RegExp(p, 'i'));
  if (trim.length) {
    const copies = new Map();
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      // A part is trim if it, or anything above it, is named as such.
      let named = false;
      for (let n = node; n && !named; n = n.getParentNode()) named = trim.some((re) => re.test(n.getName()));
      if (!named) continue;
      for (const prim of mesh.listPrimitives()) {
        const material = prim.getMaterial();
        if (!material || /_TRIM$/.test(material.getName())) continue;
        if (!copies.has(material)) copies.set(material, material.clone().setName(material.getName() + '_TRIM'));
        prim.setMaterial(copies.get(material));
      }
    }
  }
  await doc.transform(prune());

  // 2. Geometry. Buildings and the like are merged first (one mesh per
  // material), so the simplifier works on the whole object rather than on
  // every window frame separately.
  if (spec.join) await doc.transform(flatten(), join({ keepMeshes: false, keepNamed: false }), prune());
  await doc.transform(
    weld(),
    ...(spec.simplify ? [simplify({ simplifier: MeshoptSimplifier, ratio: spec.simplify, error: spec.error ?? 0.001 })] : []),
    dedup(),
    prune()
  );

  // 3. Textures: capped size, WebP. Named textures can be capped lower.
  for (const [pattern, size] of Object.entries(spec.textureMax ?? {})) {
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: new RegExp(pattern, 'i'), resize: [size, size], quality: spec.quality ?? 82 }));
  }
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [spec.maxTexture ?? 1024, spec.maxTexture ?? 1024], quality: spec.quality ?? 82 })
  );

  // 4. Compress.
  await doc.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  await io.write(fileURLToPath(out), doc);

  // The file name carries a hash of its contents. The service worker serves
  // everything but pages cache-first, which is only safe when a changed file
  // gets a new name.
  const hash = createHash('sha1').update(await readFile(fileURLToPath(out))).digest('hex').slice(0, 8);
  const hashed = `${name}.${hash}.glb`;
  for (const file of await readdir(new URL('../public/models/', import.meta.url))) {
    if (file.startsWith(`${name}.`) && file !== hashed && file !== `${name}.glb` && file.endsWith(".glb")) {
      await unlink(new URL(`../public/models/${file}`, import.meta.url));
    }
  }
  await rename(fileURLToPath(out), fileURLToPath(new URL(`../public/models/${hashed}`, import.meta.url)));
  manifest[name] = hashed;
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');

  const after = { bytes: (await stat(fileURLToPath(new URL(`../public/models/${hashed}`, import.meta.url)))).size, tris: triangles(doc) };
  console.log(`${name}: ${kb(before.bytes)} → ${kb(after.bytes)}, ${before.tris | 0} → ${after.tris | 0} triangles (${removed} parts stripped)`);
}
