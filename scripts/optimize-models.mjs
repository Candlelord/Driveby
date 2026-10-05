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
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt, resample, quantize, flatten, join } from '@gltf-transform/functions';
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
  const doc = await io.read(src.pathname);
  const before = { bytes: (await stat(src.pathname)).size, tris: triangles(doc) };

  // 1. Strip parts by name.
  const strip = (spec.strip ?? []).map((p) => new RegExp(p, 'i'));
  let removed = 0;
  for (const node of doc.getRoot().listNodes()) {
    if (strip.some((re) => re.test(node.getName()))) {
      node.setMesh(null);
      removed++;
    }
  }
  await doc.transform(prune());

  // 2. Geometry.
  await doc.transform(
    weld(),
    ...(spec.simplify ? [simplify({ simplifier: MeshoptSimplifier, ratio: spec.simplify, error: spec.error ?? 0.001 })] : []),
    dedup(),
    prune()
  );

  // 3. Textures: capped size, WebP.
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [spec.maxTexture ?? 1024, spec.maxTexture ?? 1024], quality: spec.quality ?? 82 })
  );

  // 4. Compress.
  await doc.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  await io.write(out.pathname, doc);

  // The file name carries a hash of its contents. The service worker serves
  // everything but pages cache-first, which is only safe when a changed file
  // gets a new name.
  const hash = createHash('sha1').update(await readFile(out.pathname)).digest('hex').slice(0, 8);
  const hashed = `${name}.${hash}.glb`;
  for (const file of await readdir(new URL('../public/models/', import.meta.url))) {
    if (file.startsWith(`${name}.`) && file !== hashed && file !== `${name}.glb` && file.endsWith(".glb")) {
      await unlink(new URL(`../public/models/${file}`, import.meta.url));
    }
  }
  await rename(out.pathname, new URL(`../public/models/${hashed}`, import.meta.url).pathname);
  manifest[name] = hashed;
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');

  const after = { bytes: (await stat(new URL(`../public/models/${hashed}`, import.meta.url).pathname)).size, tris: triangles(doc) };
  console.log(`${name}: ${kb(before.bytes)} → ${kb(after.bytes)}, ${before.tris | 0} → ${after.tris | 0} triangles (${removed} parts stripped)`);
}
