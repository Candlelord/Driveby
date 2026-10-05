import { hash2 } from './geo.js';

// Shells and close-up fittings must agree on the same roof shape.
export function pitchedRoof(building, points = building.ring) {
  const seed = hash2(building.ring[0][0], building.ring[0][1]);
  if (building.kind !== 0 || building.h >= 10 || points.length !== 4 || seed >= 0.45) return null;
  const corners = points.slice();
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (distance(corners[0], corners[1]) < distance(corners[1], corners[2])) corners.push(corners.shift());
  const [a, b, c, d] = corners;
  const length = distance(a, b), width = distance(b, c);
  const perpendicular = Math.abs((b[0]-a[0])*(c[0]-b[0]) + (b[1]-a[1])*(c[1]-b[1])) / (length * width);
  if (!(length > 4 && length < 35 && width > 4 && width < 20 && perpendicular < 0.1 && Math.abs(distance(c,d)-length) < 0.5 && Math.abs(distance(d,a)-width) < 0.5)) return null;
  return { corners, rise: Math.min(2.8, width * 0.28), tx: (b[0]-a[0])/length, tz: (b[1]-a[1])/length };
}
