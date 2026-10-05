import { toWorld } from './geo.js';
// Bounds of cached OSM way 217574079, National Arts Theatre.
export const THEATRE = { lat: 6.4764727, lon: 3.36949215 };
const min = toWorld(6.4773109, 3.3686546), max = toWorld(6.4756345, 3.3703297);
export function isTheatreFootprint(ring) {
  const xs=ring.map(p=>p[0]), zs=ring.map(p=>p[1]);
  return Math.abs(Math.min(...xs)-min.x)<2 && Math.abs(Math.max(...xs)-max.x)<2 &&
    Math.abs(Math.min(...zs)-min.z)<2 && Math.abs(Math.max(...zs)-max.z)<2;
}
