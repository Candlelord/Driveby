/**
 * GPS: the road network as a graph, and the shortest drive through it.
 *
 * Lagos's network comes from OpenStreetMap (graph.json: junctions and the
 * road geometry between them); the north's is built here from its own road
 * polylines, joined where they meet, and tied to Lagos where the expressway
 * leaves the real map. Routes are A* on road length, one-way streets
 * respected, with motorways and main roads made a little cheaper so the
 * route prefers them the way a driver would.
 */

const CLASS_COST = [0.82, 0.86, 0.9, 0.94, 0.97, 1, 1.05, 1.2, 1.25, 1.3];

export class RoadGraph {
  constructor() {
    this.x = [];
    this.z = [];
    this.adj = []; // node -> [{ to, len, geom: [[x,z]...] }]
    this.grid = new Map();
  }

  _node(x, z) {
    const id = this.x.length;
    this.x.push(x);
    this.z.push(z);
    this.adj.push([]);
    const key = this._cell(x, z);
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key).push(id);
    return id;
  }

  _cell(x, z) {
    return `${Math.floor(x / 120)},${Math.floor(z / 120)}`;
  }

  _edge(a, b, len, geom, cls, oneway) {
    const cost = len * (CLASS_COST[cls] ?? 1);
    this.adj[a].push({ from: a, to: b, len, cost, geom, cls, oneway: Boolean(oneway) });
    if (!oneway) this.adj[b].push({ from: b, to: a, len, cost, geom: geom.slice().reverse(), cls, oneway: false });
  }

  /** Add Lagos's OpenStreetMap graph. */
  addLagos(data) {
    const base = this.x.length;
    for (let i = 0; i < data.nodes.length; i += 2) this._node(data.nodes[i], data.nodes[i + 1]);
    for (const [a, b, len, cls, oneway, flat] of data.edges) {
      const geom = [];
      for (let i = 0; i < flat.length; i += 2) geom.push([flat[i], flat[i + 1]]);
      this._edge(base + a, base + b, Math.max(1, len), geom, cls, oneway);
    }
  }

  /** Add road polylines (the north), joining them where they touch. */
  addPolylines(roads) {
    for (const road of roads) {
      let prev = null;
      let since = [];
      let length = 0;
      road.pts.forEach(([x, z], i) => {
        // Keep a node every ~80 m, and at the ends; snap onto an existing node nearby.
        if (prev !== null) {
          const [px, pz] = since[since.length - 1];
          length += Math.hypot(x - px, z - pz);
        }
        since.push([x, z]);
        const last = i === road.pts.length - 1;
        if (prev === null || length > 80 || last) {
          const snap = this.nearest(x, z, 9);
          const id = snap ?? this._node(x, z);
          if (prev !== null && id !== prev) this._edge(prev, id, length, since, road.cls, false);
          prev = id;
          since = [[x, z]];
          length = 0;
        }
      });
    }
  }

  /** Join two points' nearest nodes with a straight edge (Lagos to the north). */
  link(x0, z0, x1, z1) {
    const a = this.nearest(x0, z0, 500);
    const b = this.nearest(x1, z1, 500);
    if (a === null || b === null || a === b) return;
    const len = Math.hypot(this.x[a] - this.x[b], this.z[a] - this.z[b]);
    this._edge(a, b, len, [[this.x[a], this.z[a]], [this.x[b], this.z[b]]], 0, false);
  }

  nearest(x, z, radius = 400) {
    let best = null;
    let bestD = radius;
    const r = Math.ceil(radius / 120);
    const cx = Math.floor(x / 120);
    const cz = Math.floor(z / 120);
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        for (const id of this.grid.get(`${cx + i},${cz + j}`) ?? []) {
          const d = Math.hypot(this.x[id] - x, this.z[id] - z);
          if (d < bestD && this.adj[id].length) {
            bestD = d;
            best = id;
          }
        }
      }
    }
    return best;
  }

  /**
   * The best drive from one point to another, as a polyline of world points
   * (starting at the car and ending at the destination), or null.
   */
  route(x0, z0, x1, z1) {
    const start = this.nearest(x0, z0, 600);
    const goal = this.nearest(x1, z1, 2500);
    if (start === null || goal === null) return null;
    const n = this.x.length;
    const g = new Float64Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const via = new Array(n);
    const heap = new Heap();
    g[start] = 0;
    heap.push(start, 0);
    const gx = this.x[goal];
    const gz = this.z[goal];
    let found = false;
    let steps = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (++steps > 400000) break;
      for (const e of this.adj[cur]) {
        const ng = g[cur] + e.cost;
        if (ng < g[e.to]) {
          g[e.to] = ng;
          came[e.to] = cur;
          via[e.to] = e;
          heap.push(e.to, ng + Math.hypot(this.x[e.to] - gx, this.z[e.to] - gz) * 0.82);
        }
      }
    }
    if (!found) return null;
    const chain = [];
    for (let cur = goal; cur !== start; cur = came[cur]) chain.push(via[cur]);
    chain.reverse();
    const points = [[x0, z0]];
    for (const e of chain) for (const p of e.geom) points.push(p);
    points.push([x1, z1]);
    return points;
  }
}

/** A small binary min-heap of (id, priority). */
class Heap {
  constructor() {
    this.ids = [];
    this.pri = [];
  }

  get size() {
    return this.ids.length;
  }

  push(id, p) {
    const ids = this.ids;
    const pri = this.pri;
    ids.push(id);
    pri.push(p);
    let i = ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= pri[i]) break;
      [ids[i], ids[parent]] = [ids[parent], ids[i]];
      [pri[i], pri[parent]] = [pri[parent], pri[i]];
      i = parent;
    }
  }

  pop() {
    const ids = this.ids;
    const pri = this.pri;
    const top = ids[0];
    const lastId = ids.pop();
    const lastP = pri.pop();
    if (ids.length) {
      ids[0] = lastId;
      pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < ids.length && pri[l] < pri[m]) m = l;
        if (r < ids.length && pri[r] < pri[m]) m = r;
        if (m === i) break;
        [ids[i], ids[m]] = [ids[m], ids[i]];
        [pri[i], pri[m]] = [pri[m], pri[i]];
        i = m;
      }
    }
    return top;
  }
}

/** Distance from a point to a polyline, and how far along it the nearest point is. */
export function routeProgress(route, x, z) {
  let best = Infinity;
  let bestAlong = 0;
  let along = 0;
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const [x0, z0] = route[i];
    const [x1, z1] = route[i + 1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const t = len ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (len * len))) : 0;
    const d = Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
    if (d < best) {
      best = d;
      bestAlong = along + len * t;
    }
    along += len;
  }
  total = along;
  return { off: best, along: bestAlong, remaining: total - bestAlong };
}
