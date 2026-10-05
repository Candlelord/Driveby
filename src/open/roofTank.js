import * as THREE from 'three';

/** Find a supported point with tank-radius clearance from every roof edge. */
export function roofTankPosition(ring, triangles) {
  let best = null, clearance = 1.0;
  const candidates = triangles.map(ids => ids.reduce((p, i) => [p[0] + ring[i][0] / 3, p[1] + ring[i][1] / 3], [0,0]));
  for (const p of candidates) {
    let distance = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i+1)%ring.length], dx = b[0]-a[0], dz = b[1]-a[1];
      const t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz || 1)));
      distance = Math.min(distance, Math.hypot(p[0]-a[0]-dx*t, p[1]-a[1]-dz*t));
    }
    if (distance > clearance) { best = p; clearance = distance; }
  }
  return best;
}

export function roofTankGeometry() {
  const profile = [new THREE.Vector2(0,0),new THREE.Vector2(0.8,0),new THREE.Vector2(0.82,0.08),new THREE.Vector2(0.8,0.18),new THREE.Vector2(0.8,0.28)];
  for (let i=0; i<6; i++) {
    const y=0.35+i*0.22;
    profile.push(new THREE.Vector2(0.76,y),new THREE.Vector2(0.81,y+0.04),new THREE.Vector2(0.81,y+0.1),new THREE.Vector2(0.76,y+0.15));
  }
  profile.push(new THREE.Vector2(0.7,1.75),new THREE.Vector2(0.36,1.87),new THREE.Vector2(0.36,1.96),new THREE.Vector2(0,1.96));
  return new THREE.LatheGeometry(profile, 16);
}
