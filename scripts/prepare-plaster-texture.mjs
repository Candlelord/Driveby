import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const source = process.argv[2];
if (!source) throw new Error('Pass the generated plaster PNG path.');
await mkdir(new URL('../src/assets/', import.meta.url), { recursive: true });
await sharp(source).resize(512, 512).webp({ quality: 84 }).toFile(new URL('../src/assets/plaster-weathered-v1.webp', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
console.log('Prepared 512px plaster material asset.');
