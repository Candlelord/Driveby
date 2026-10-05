#!/usr/bin/env node
/**
 * Bake building models into facade textures.
 *
 *   npm i --no-save playwright-core        # one-off; not a project dependency
 *   npx vite &                              # the dev server must be running
 *   node scripts/bake-facades.mjs [name]
 *
 * For each entry in facades.config.json this opens scripts/bake.html in
 * Chrome (CHROME_PATH, or the usual install locations), which renders the
 * model straight on into albedo / normal / window-mask images; they are saved
 * as WebP under public/models/facades/ with content-hashed names (the service
 * worker serves them cache-first) and recorded in src/world/facade-manifest.json.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const config = JSON.parse(await readFile(new URL('../facades.config.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);
const base = process.env.BAKE_URL ?? 'http://localhost:5173';

const { chromium } = await import('playwright-core');
const executablePath =
  process.env.CHROME_PATH ??
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const outDir = new URL('../public/models/facades/', import.meta.url);
await mkdir(outDir, { recursive: true });
const manifestUrl = new URL('../src/world/facade-manifest.json', import.meta.url);
let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
} catch {
  // First run.
}

for (const [name, spec] of Object.entries(config.facades)) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push(e.message));
  const params = new URLSearchParams({ model: spec.model, yaw: String(spec.yaw ?? 0), ppm: String(spec.ppm ?? 80) });
  if (spec.crop) params.set('crop', spec.crop.join(','));
  if (spec.glass) params.set('glass', spec.glass);
  if (spec.relief) params.set('relief', String(spec.relief));
  await page.goto(`${base}/scripts/bake.html?${params}`);
  await page.waitForFunction(() => document.title === 'done', null, { timeout: 120000 }).catch(() => {});
  const result = await page.evaluate(() => window.__bake);
  await page.close();
  if (!result) {
    console.log(`${name}: bake failed ${logs.join(' ')}`);
    continue;
  }
  const entry = { size: result.size, relief: result.relief, roofFrom: spec.roofFrom ?? 1, roofScale: spec.roofScale ?? 1, files: {} };
  for (const kind of ['albedo', 'normal', 'windows', 'height']) {
    const png = Buffer.from(result[kind].split(',')[1], 'base64');
    const webp = await sharp(png)
      .webp({ quality: kind === 'albedo' ? 88 : 82, alphaQuality: 90 })
      .toBuffer();
    const hash = createHash('sha1').update(webp).digest('hex').slice(0, 8);
    const file = `${name}.${kind}.${hash}.webp`;
    await writeFile(new URL(file, outDir), webp);
    entry.files[kind] = file;
    console.log(`${name} ${kind}: ${result.px.join('×')}, ${Math.round(webp.length / 1024)} KB`);
  }
  manifest[name] = entry;
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
}
await browser.close();
