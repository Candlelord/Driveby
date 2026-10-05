// OSM heights are metres unless an explicit unit is supplied.
export function metres(value) {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  const feet = text.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*")?$/);
  if (feet) return Number(feet[1]) * 0.3048 + Number(feet[2] || 0) * 0.0254;
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|cm)?$/);
  if (!match) return null;
  const scale = /ft|feet/.test(match[2] || '') ? 0.3048 : match[2] === 'cm' ? 0.01 : 1;
  const height = Number(match[1]) * scale;
  return height > 0 ? height : null;
}

export function buildingHeight(tags, kind, area, seed) {
  const measured = metres(tags.height);
  if (measured) return Math.min(measured, 250);
  const levelText = String(tags['building:levels'] ?? '');
  const levels = /^\d+(?:\.\d+)?$/.test(levelText) ? Number(levelText) : 0;
  if (levels > 0) {
    const roofLevels = Number(tags['roof:levels']) || 0;
    const roof = metres(tags['roof:height']) ?? (roofLevels > 0 ? roofLevels * 3 : 1);
    return Math.min(levels * 3.2 + roof, 250);
  }
  // Explicit single-storey uses should not randomly become three-storey blocks.
  if (/^(bungalow|cabin|hut|garage|garages|carport)$/.test(tags.building)) return 3.4 + seed * 0.7;
  const big = area > 600;
  return kind === 1 ? 10 + seed * (big ? 30 : 12) : kind === 2 ? 7 + seed * 5 : kind === 3 ? 12 + seed * 8 : kind === 7 ? 5 : 3.4 + Math.floor(seed * 3.2) * 3.2 + (big ? 3.2 : 0);
}
