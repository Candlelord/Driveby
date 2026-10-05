import { distToSeg } from './world.js';

/** Street-facing shop walls need space for their projecting rain awning. */
export function shopfrontRoad(index, x, z, nx, nz) {
  let best = null, distance = 12;
  for (const seg of index.roadsNear(x, z, 12)) {
    if (seg.road?.flags & 1 || (seg.road?.cls ?? 5) >= 7) continue;
    const hit = distToSeg(x, z, seg);
    const rx=seg.x0+(seg.x1-seg.x0)*hit.t, rz=seg.z0+(seg.z1-seg.z0)*hit.t;
    const setback = hit.dist - seg.hw;
    if ((rx-x)*nx+(rz-z)*nz <= 0 || setback < 2 || setback > distance) continue;
    distance = setback; best = seg;
  }
  return best;
}
