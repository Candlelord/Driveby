import { WORLD, NORTH_EDGE, clamp } from './geo.js';
import { biomeWeights, KANO_CENTRE } from './north.js';

const BASE = `${import.meta.env.BASE_URL}world/`;
const NORTH_SCALE = 16; // metres per pixel of the drawn north
const BIOME_RGB = { forest: [118, 150, 88], savanna: [196, 180, 120], sahel: [214, 190, 140], desert: [236, 210, 160] };

/**
 * The map: Lagos is the image baked from OpenStreetMap (map.webp); the north
 * (and the land and sea around Lagos) is drawn here once, from the same data
 * the world is generated from. Both the minimap and the big map draw views of
 * these two layers, with routes and icons on top.
 */
export class MapLayers {
  constructor(world) {
    this.world = world;
    this.lagos = null;
    this.north = null;
  }

  async load() {
    if (this.world.meta) {
      const image = new Image();
      image.src = BASE + 'map.webp';
      try {
        await image.decode();
        this.lagos = image;
      } catch {
        this.lagos = null;
      }
    }
    this.north = this._drawNorth();
  }

  _drawNorth() {
    const w = Math.ceil((WORLD.maxX - WORLD.minX) / NORTH_SCALE);
    const h = Math.ceil((WORLD.maxZ - WORLD.minZ) / NORTH_SCALE);
    // Ground colour on a coarse grid, smoothed up.
    const coarse = document.createElement('canvas');
    const cw = Math.ceil(w / 4);
    const ch = Math.ceil(h / 4);
    coarse.width = cw;
    coarse.height = ch;
    const cctx = coarse.getContext('2d');
    const img = cctx.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const wx = WORLD.minX + (x + 0.5) * NORTH_SCALE * 4;
        const wz = WORLD.minZ + (y + 0.5) * NORTH_SCALE * 4;
        let rgb;
        if (wz > NORTH_EDGE) {
          const code = this.world.groundAt(wx, wz);
          rgb = code === 0 ? [44, 92, 128] : [130, 160, 100];
        } else {
          const wgt = biomeWeights(wx, wz);
          rgb = [0, 0, 0];
          for (const [k, v] of Object.entries(wgt)) for (let c = 0; c < 3; c++) rgb[c] += BIOME_RGB[k][c] * v;
        }
        const i = (y * cw + x) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      }
    }
    cctx.putImageData(img, 0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(coarse, 0, 0, w, h);
    const px = (x) => (x - WORLD.minX) / NORTH_SCALE;
    const pz = (z) => (z - WORLD.minZ) / NORTH_SCALE;
    // Kano's wall.
    ctx.strokeStyle = '#8a4a2a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px(KANO_CENTRE.x), pz(KANO_CENTRE.z), KANO_CENTRE.r / NORTH_SCALE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(160, 100, 60, 0.35)';
    ctx.fill();
    // Buildings as dots, roads as lines.
    const north = this.world.north;
    ctx.fillStyle = '#9a6a48';
    for (const b of north.buildings) {
      const [x, z] = b.ring[0];
      ctx.fillRect(px(x) - 0.6, pz(z) - 0.6, 1.4, 1.4);
    }
    const sorted = [...north.roads].sort((a, b) => b.cls - a.cls);
    for (const road of sorted) {
      ctx.strokeStyle = road.cls === 0 ? '#f4b446' : road.cls <= 3 ? '#fcecA0' : road.flags & 2 ? '#c2804e' : '#ffffff';
      ctx.lineWidth = road.cls === 0 ? 3 : road.cls <= 3 ? 2 : 1.3;
      ctx.beginPath();
      road.pts.forEach(([x, z], i) => (i ? ctx.lineTo(px(x), pz(z)) : ctx.moveTo(px(x), pz(z))));
      ctx.stroke();
    }
    return canvas;
  }

  /**
   * Draw a view of the map into a 2D context. The view is centred on (cx, cz)
   * at `scale` metres per pixel, rotated by `rotation` (radians; the world
   * turns, so pass -heading for a heading-up minimap).
   */
  draw(ctx, width, height, cx, cz, scale, rotation = 0) {
    ctx.save();
    ctx.fillStyle = '#2c5c80';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rotation);
    ctx.imageSmoothingEnabled = true;
    const reach = (Math.hypot(width, height) / 2) * scale;
    if (this.north) this._blit(ctx, this.north, WORLD.minX, WORLD.minZ, NORTH_SCALE, cx, cz, scale, reach);
    const m = this.world.meta;
    if (this.lagos && m) this._blit(ctx, this.lagos, m.minX, m.minZ, m.mapScale, cx, cz, scale, reach);
    ctx.restore();
  }

  /** Draw the part of a georeferenced image that falls within `reach` of the centre. */
  _blit(ctx, image, ox, oz, ims, cx, cz, scale, reach) {
    const sx0 = clamp(Math.floor((cx - reach - ox) / ims), 0, image.width);
    const sz0 = clamp(Math.floor((cz - reach - oz) / ims), 0, image.height);
    const sx1 = clamp(Math.ceil((cx + reach - ox) / ims), 0, image.width);
    const sz1 = clamp(Math.ceil((cz + reach - oz) / ims), 0, image.height);
    if (sx1 <= sx0 || sz1 <= sz0) return;
    const dx = (ox + sx0 * ims - cx) / scale;
    const dz = (oz + sz0 * ims - cz) / scale;
    ctx.drawImage(image, sx0, sz0, sx1 - sx0, sz1 - sz0, dx, dz, ((sx1 - sx0) * ims) / scale, ((sz1 - sz0) * ims) / scale);
  }
}

// --- icons --------------------------------------------------------------------

/** Draw a map icon at (x, y) in canvas pixels. `kind`: car, fuel, sight, found, flag, job, drop, ticket, place. */
export function drawIcon(ctx, kind, x, y, size = 1, label = '') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  const disc = (fill, stroke = '#0b0b0c', r = 9) => {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };
  const glyph = (text, colour = '#0b0b0c', px = 12) => {
    ctx.fillStyle = colour;
    ctx.font = `900 ${px}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 1);
  };
  switch (kind) {
    case 'fuel':
      disc('#ffb02e');
      ctx.fillStyle = '#0b0b0c';
      ctx.fillRect(-4, -5, 6, 10);
      ctx.fillRect(2, -2, 3, 2);
      ctx.fillRect(4, -2, 1.6, 6);
      break;
    case 'sight':
      disc('#f5f2e8');
      glyph('?', '#0b0b0c', 14);
      break;
    case 'found':
      disc('#5bc8ff');
      glyph('★', '#0b0b0c', 12);
      break;
    case 'job':
      disc('#c6f000');
      glyph('$', '#0b0b0c', 13);
      break;
    case 'drop':
      disc('#ff3d8b');
      glyph('↓', '#0b0b0c', 13);
      break;
    case 'ticket':
      ctx.rotate(-0.2);
      ctx.fillStyle = '#c6f000';
      ctx.strokeStyle = '#0b0b0c';
      ctx.lineWidth = 2;
      ctx.fillRect(-8, -5, 16, 10);
      ctx.strokeRect(-8, -5, 16, 10);
      break;
    case 'flag':
      ctx.fillStyle = '#0b0b0c';
      ctx.fillRect(-1.5, -16, 3, 18);
      ctx.fillStyle = '#c6f000';
      ctx.beginPath();
      ctx.moveTo(1.5, -16);
      ctx.lineTo(14, -11);
      ctx.lineTo(1.5, -6);
      ctx.fill();
      ctx.strokeStyle = '#0b0b0c';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    case 'car':
      ctx.fillStyle = '#f5f2e8';
      ctx.strokeStyle = '#0b0b0c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(8, 9);
      ctx.lineTo(0, 4);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    default:
      break;
  }
  if (label) {
    ctx.font = '800 11px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(11,11,12,0.9)';
    ctx.strokeText(label, 0, 12);
    ctx.fillStyle = '#f5f2e8';
    ctx.fillText(label, 0, 12);
  }
  ctx.restore();
}

/** Stroke a route (world points) in a view transform. */
export function drawRoute(ctx, route, toScreen, width = 5) {
  if (!route || route.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [w, colour] of [[width + 4, '#0b0b0c'], [width, '#c6f000']]) {
    ctx.lineWidth = w;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    route.forEach(([x, z], i) => {
      const [sx, sy] = toScreen(x, z);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.stroke();
  }
  ctx.restore();
}

/** The minimap: heading-up, zooming out with speed, with icons and the route. */
export class Minimap {
  constructor(layers, canvas) {
    this.layers = layers;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.radius = 300;
  }

  draw(vehicle, { route, icons }) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const target = 260 + Math.min(Math.abs(vehicle.speed), 45) * 6;
    this.radius += (target - this.radius) * 0.04;
    const scale = this.radius / (w / 2);
    const rot = -vehicle.yaw;
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.clip();
    this.layers.draw(ctx, w, h, vehicle.x, vehicle.z, scale, rot);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const toScreen = (x, z) => {
      const dx = (x - vehicle.x) / scale;
      const dz = (z - vehicle.z) / scale;
      return [w / 2 + dx * cos - dz * sin, h / 2 + dx * sin + dz * cos];
    };
    drawRoute(ctx, route, toScreen, 7);
    // Icons: pinned to the rim when out of range, so you always know which way.
    for (const icon of icons) {
      let [sx, sy] = toScreen(icon.x, icon.z);
      const dx = sx - w / 2;
      const dy = sy - h / 2;
      const d = Math.hypot(dx, dy);
      const rim = w / 2 - 16;
      if (d > rim) {
        if (!icon.pin) continue;
        sx = w / 2 + (dx / d) * rim;
        sy = h / 2 + (dy / d) * rim;
      }
      drawIcon(ctx, icon.kind, sx, sy, 1.6);
    }
    drawIcon(ctx, 'car', w / 2, h / 2, 1.7);
    ctx.restore();
  }
}

/**
 * The big map: north-up, drag to pan, wheel or pinch to zoom, tap to put a
 * waypoint down (or tap an icon to head for it).
 */
export class BigMap {
  constructor(layers, { onWaypoint, onClose }) {
    this.layers = layers;
    this.onWaypoint = onWaypoint;
    this.onClose = onClose;
    this.panel = document.createElement('div');
    this.panel.className = 'ow-panel ow-map';
    this.panel.innerHTML = `
      <canvas></canvas>
      <div class="bar"><div class="title gfx">Map</div><div style="display:flex;gap:10px"><button class="brush small alt" data-a="clear">Clear waypoint</button><button class="brush small" data-a="close">Back to driving</button></div></div>
      <div class="legend"><div><i style="background:#ffb02e;border-radius:50%"></i>Fuel</div><div><i style="background:#f5f2e8;border-radius:50%"></i>Undiscovered</div><div><i style="background:#5bc8ff;border-radius:50%"></i>Discovered</div><div><i style="background:#c6f000;border-radius:50%"></i>Errand</div><div><i style="background:#c6f000"></i>Fuel ticket</div></div>
      <div class="hint">tap to set a waypoint · drag to move · scroll or pinch to zoom · M or Esc to close</div>
      <div class="attribution">Map data ? <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> ? ODbL</div>`;
    document.body.appendChild(this.panel);
    this.canvas = this.panel.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.cx = 0;
    this.cz = 0;
    this.scale = 12;
    this.data = { route: null, icons: [], labels: [], car: null };
    this.panel.querySelector('[data-a="close"]').addEventListener('click', () => this.onClose?.());
    this.panel.querySelector('[data-a="clear"]').addEventListener('click', () => this.onWaypoint?.(null));
    this._bindInput();
  }

  get open() {
    return this.panel.classList.contains('is-on');
  }

  show(vehicle, data) {
    this.cx = vehicle.x;
    this.cz = vehicle.z;
    this.data = data;
    this.panel.classList.add('is-on');
    this.draw();
  }

  hide() {
    this.panel.classList.remove('is-on');
  }

  update(data) {
    this.data = data;
    if (this.open) this.draw();
  }

  _bindInput() {
    const c = this.canvas;
    const pointers = new Map();
    let moved = 0;
    let pinch = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
    });
    c.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX;
        p.y = e.clientY;
        const [a2, b2] = [...pointers.values()];
        const d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y);
        if (pinch !== null && d0 > 0) this.scale = clamp(this.scale * (d0 / d1), 1.5, 80);
        pinch = d1;
        moved += 10;
      } else {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        moved += Math.abs(dx) + Math.abs(dy);
        this.cx -= dx * this.scale * devicePixelRatio;
        this.cz -= dy * this.scale * devicePixelRatio;
        p.x = e.clientX;
        p.y = e.clientY;
      }
      this.draw();
    });
    const up = (e) => {
      const wasTap = pointers.size === 1 && moved < 8;
      pointers.delete(e.pointerId);
      pinch = null;
      if (wasTap) this._tap(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.scale = clamp(this.scale * Math.exp(e.deltaY * 0.0015), 1.5, 80);
        this.draw();
      },
      { passive: false }
    );
  }

  _toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * devicePixelRatio;
    const py = (clientY - r.top) * devicePixelRatio;
    return [this.cx + (px - this.canvas.width / 2) * this.scale, this.cz + (py - this.canvas.height / 2) * this.scale];
  }

  _tap(clientX, clientY) {
    const [x, z] = this._toWorld(clientX, clientY);
    // Snap to an icon if one is under the finger.
    let best = null;
    let bestD = 22 * devicePixelRatio * this.scale;
    for (const icon of this.data.icons) {
      const d = Math.hypot(icon.x - x, icon.z - z);
      if (d < bestD) {
        bestD = d;
        best = icon;
      }
    }
    this.onWaypoint?.(best ? { x: best.x, z: best.z, label: best.label } : { x, z, label: 'Waypoint' });
  }

  draw() {
    const c = this.canvas;
    const w = Math.round(c.clientWidth * devicePixelRatio);
    const h = Math.round(c.clientHeight * devicePixelRatio);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = this.ctx;
    this.layers.draw(ctx, w, h, this.cx, this.cz, this.scale, 0);
    const toScreen = (x, z) => [w / 2 + (x - this.cx) / this.scale, h / 2 + (z - this.cz) / this.scale];
    const size = devicePixelRatio * 1.1;
    // Place names, when zoomed in enough to read them.
    ctx.save();
    ctx.textAlign = 'center';
    for (const label of this.data.labels ?? []) {
      if (label.minScale && this.scale > label.minScale) continue;
      const [sx, sy] = toScreen(label.x, label.z);
      if (sx < -100 || sy < -40 || sx > w + 100 || sy > h + 40) continue;
      ctx.font = `${label.big ? 'italic 900' : '800'} ${Math.round((label.big ? 22 : 12) * devicePixelRatio)}px ${label.big ? 'Impact, sans-serif' : '"Arial Narrow", Arial, sans-serif'}`;
      ctx.lineWidth = 4 * devicePixelRatio;
      ctx.strokeStyle = 'rgba(11,11,12,0.75)';
      ctx.strokeText(label.text.toUpperCase(), sx, sy);
      ctx.fillStyle = label.big ? '#c6f000' : '#f5f2e8';
      ctx.fillText(label.text.toUpperCase(), sx, sy);
    }
    ctx.restore();
    drawRoute(ctx, this.data.route, toScreen, 4 * devicePixelRatio);
    for (const icon of this.data.icons) {
      const [sx, sy] = toScreen(icon.x, icon.z);
      if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      drawIcon(ctx, icon.kind, sx, sy, size, this.scale < 6 ? icon.label ?? '' : '');
    }
    if (this.data.waypoint) {
      const [sx, sy] = toScreen(this.data.waypoint.x, this.data.waypoint.z);
      drawIcon(ctx, 'flag', sx, sy, size * 1.4);
    }
    if (this.data.car) {
      const [sx, sy] = toScreen(this.data.car.x, this.data.car.z);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.data.car.yaw);
      drawIcon(ctx, 'car', 0, 0, size * 1.3);
      ctx.restore();
    }
  }
}
