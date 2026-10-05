/** Continuous elevations for connected OSM bridge ways, including reversed ways. */
export function bridgeDecks(ways, toX, toZ) {
  const bridges = ways.filter((w) => w.tags.bridge && w.tags.bridge !== 'no');
  const ends = new Map(), seen = new Set(), deck = new Map();
  for (const w of bridges) for (const n of [w.nodes[0], w.nodes.at(-1)]) {
    if (!ends.has(n)) ends.set(n, []);
    ends.get(n).push(w);
  }
  for (const start of bridges) {
    if (seen.has(start.id)) continue;
    const chain = [start]; seen.add(start.id);
    for (const dir of [0, 1]) {
      let node = dir === 0 ? start.nodes.at(-1) : start.nodes[0];
      for (;;) {
        const next = (ends.get(node) ?? []).find((w) => !seen.has(w.id));
        if (!next) break;
        seen.add(next.id);
        if (dir === 0) chain.push(next); else chain.unshift(next);
        node = next.nodes[0] === node ? next.nodes.at(-1) : next.nodes[0];
      }
    }
    let node = chain[0].nodes[0];
    if (chain.length > 1 && [chain[1].nodes[0], chain[1].nodes.at(-1)].includes(node)) node = chain[0].nodes.at(-1);
    const ordered = chain.map((w) => {
      const reverse = w.nodes[0] !== node;
      node = reverse ? w.nodes[0] : w.nodes.at(-1);
      const points = reverse ? w.geometry.slice().reverse() : w.geometry;
      const distances = [0];
      for (let i = 1; i < points.length; i++) distances.push(distances.at(-1) + Math.hypot(
        toX(points[i].lon) - toX(points[i - 1].lon), toZ(points[i].lat) - toZ(points[i - 1].lat)));
      return { w, reverse, distances, length: distances.at(-1) };
    });
    const total = ordered.reduce((sum, w) => sum + w.length, 0);
    const layer = Math.max(...chain.map((w) => Number(w.tags.layer) || 1));
    const height = Math.min(12, 5.5 + Math.max(0, layer - 1) * 4 + (total > 1500 ? 3 : 0));
    const ramp = Math.min(160, total / 3);
    let along = 0;
    for (const { w, reverse, distances, length } of ordered) {
      const values = distances.map((d) => {
        const t = ramp > 0 ? Math.max(0, Math.min(1, Math.min(along + d, total - along - d) / ramp)) : 0;
        // Match the normal land road at each abutment, never the lagoon bed.
        return 0.5 + height * t * t * (3 - 2 * t);
      });
      deck.set(w.id, reverse ? values.reverse() : values);
      along += length;
    }
  }
  // Branching ramps can belong to different chains but still share an OSM node.
  const nodeHeight = new Map();
  for (const w of bridges) w.nodes.forEach((node, i) => {
    nodeHeight.set(node, Math.max(nodeHeight.get(node) ?? 0, deck.get(w.id)[i]));
  });
  for (const w of bridges) deck.set(w.id, w.nodes.map((node) => nodeHeight.get(node)));
  return deck;
}
