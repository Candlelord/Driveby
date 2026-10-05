import { hash1 as hash } from './geo.js';

/**
 * Postcards, drawn rather than photographed: a small painted scene per card,
 * set in a polaroid frame with a handwritten caption. Each scene is a list of
 * simple layers — sky, sun, hills, water, trees, buildings — in a palette per
 * theme, so a card is a few lines of data and no image file.
 */

const THEMES = {
  lagoon: [['sky', '#f4a672', '#fde9c4'], ['sun', 0.7, 0.46, 0.1, '#fff4d0'], ['skyline', 0.6, '#c58a6b'], ['water', 0.6, '#3b7a96', '#7fb3c4'], ['bridge', 0.64, '#4a4038']],
  market: [['sky', '#9fd0e8', '#fbeed2'], ['buildings', 8, 0.7, ['#d68b52', '#c9733b', '#e6b46d', '#8f5d3a']], ['ground', 0.7, '#a77a4a'], ['bus', 0.78, '#f2c21b'], ['trees', 'palm', 3, 0.7, '#2f7d3e']],
  hills: [['sky', '#8ec4e8', '#f3e9cf'], ['sun', 0.28, 0.3, 0.08, '#fffbe8'], ['hills', 0.5, '#6d8a6a', 0.12, 1], ['hills', 0.62, '#4f6e4c', 0.1, 2], ['ground', 0.8, '#7a8a52'], ['trees', 'acacia', 4, 0.8, '#3b5a2c']],
  savanna: [['sky', '#e9a05c', '#fde7b8'], ['sun', 0.5, 0.58, 0.13, '#fff1c4'], ['hills', 0.62, '#9b7a4a', 0.05, 3], ['ground', 0.68, '#b5924f'], ['trees', 'acacia', 3, 0.74, '#2e3b22'], ['trees', 'baobab', 1, 0.78, '#6a5238']],
  river: [['sky', '#86bfe2', '#f4efdc'], ['hills', 0.5, '#5f7f5a', 0.1, 4], ['water', 0.58, '#4e8da8', '#9fcbd8'], ['ground', 0.86, '#a7915a'], ['trees', 'palm', 2, 0.6, '#2d6b38']],
  rock: [['sky', '#9ecaea', '#fbeed3'], ['ground', 0.74, '#b09564'], ['rockdome', 0.66, '#6f655e'], ['trees', 'acacia', 2, 0.78, '#34502a']],
  mosque: [['sky', '#e7a77a', '#fbe2bd'], ['sun', 0.2, 0.52, 0.09, '#fff2cc'], ['mosque', 0.7, '#e8dcc0', '#2f6b52'], ['ground', 0.74, '#b89a68']],
  walls: [['sky', '#cfe0ea', '#f7e9ce'], ['mudwall', 0.62, '#b8663f'], ['ground', 0.74, '#c4955b'], ['trees', 'palm', 2, 0.74, '#2f7036']],
  desert: [['sky', '#f2b36a', '#fde8bd'], ['sun', 0.68, 0.45, 0.11, '#fff4cf'], ['dunes', 0.55, '#d79a54', '#c0803f'], ['dunes', 0.7, '#e8b471', '#cf8e4a']],
  camel: [['sky', '#f0b476', '#fbe9c6'], ['dunes', 0.62, '#dba15c', '#c5883f'], ['camel', 0.7, '#6a4a2e'], ['sun', 0.3, 0.4, 0.09, '#fff4d2']],
  stars: [['night', '#0b1026', '#25305c'], ['stars', 70], ['dunes', 0.78, '#2a2a3c', '#1e1e30']],
  mountain: [['sky', '#9dbbd6', '#efe3cf'], ['mountains', 0.58, '#6b5a52', '#a8917c'], ['dunes', 0.82, '#c58a50', '#ae7440']],
  oasis: [['sky', '#9fd0ea', '#faeed3'], ['dunes', 0.6, '#e1aa66', '#c98c47'], ['water', 0.74, '#3f8fa0', '#8ac4cb'], ['trees', 'palm', 4, 0.74, '#2a6a3a']],
  pastel: [['sky', '#bfe0ee', '#faf0d8'], ['stack', 0.76, ['#e9c2a0', '#d9a7a0', '#c7d6b0', '#e8d9a0', '#a9c4d8']], ['trees', 'palm', 2, 0.78, '#2d6b38']],
  switchback: [['sky', '#a9cbe2', '#f5ead2'], ['mountains', 0.5, '#7b6a58', '#b49b83'], ['road', 0.6, '#484848']],
  sea: [['sky', '#91c8ee', '#f4f0df'], ['sun', 0.78, 0.3, 0.08, '#fffbe6'], ['water', 0.5, '#2f78a8', '#79b4d6'], ['skyline', 0.5, '#f1ece0']],
  city: [['sky', '#c8d8e6', '#f7f0e0'], ['skyline', 0.72, '#efe9dc'], ['ground', 0.8, '#9a9488']],
  lavender: [['sky', '#9ccbec', '#f7eed6'], ['hills', 0.48, '#7d90a8', 0.08, 5], ['rows', 0.56, '#7a56a8', '#b08ad0']],
  plane: [['sky', '#9fcaea', '#f6efd8'], ['road', 0.7, '#4a4a4a'], ['trees', 'plane', 6, 0.7, '#4f7d3a']],
  village: [['sky', '#a8cdea', '#f6ecd4'], ['hills', 0.5, '#8aa070', 0.1, 6], ['buildings', 6, 0.66, ['#d9c6a4', '#c9b08a', '#e4d3b2']], ['trees', 'pine', 3, 0.74, '#3a5a32']],
  forest: [['sky', '#aeb8bc', '#dfe0da'], ['fog', 0.5], ['trees', 'pine', 9, 0.8, '#2f4a35'], ['ground', 0.82, '#4a3f30']],
  log: [['sky', '#aab5b6', '#d9dcd5'], ['ground', 0.6, '#556b3a'], ['log', 0.7, '#6a4a2e'], ['trees', 'pine', 5, 0.62, '#2d4630']],
  mud: [['sky', '#a9b2b6', '#d6d8d0'], ['ground', 0.58, '#6b4a2e'], ['puddle', 0.76, '#8f7552'], ['trees', 'pine', 4, 0.58, '#34503a']],
  fields: [['sky', '#a6cdea', '#f7efd7'], ['sun', 0.8, 0.28, 0.07, '#fffbe4'], ['rows', 0.5, '#c8b256', '#e0cc78'], ['trees', 'poplar', 4, 0.5, '#4d7a3c']],
  spire: [['sky', '#b6c2cc', '#e7e4d6'], ['hills', 0.62, '#7b8f66', 0.06, 7], ['spire', 0.7, '#8c8478'], ['rain', 40]],
  windmill: [['sky', '#9ccbee', '#f6efd9'], ['ground', 0.7, '#7fa35c'], ['water', 0.82, '#5b95b4', '#a2cadb'], ['windmill', 0.7, '#9a5a3a']],
  tulips: [['sky', '#a4cdec', '#f6efd9'], ['rows', 0.56, '#d83a5a', '#f2c52a'], ['windmill', 0.5, '#9a5a3a']],
  canal: [['sky', '#bcd0de', '#f5ecd6'], ['buildings', 6, 0.62, ['#7a4030', '#a35a3a', '#8a4a38', '#c0a070']], ['water', 0.66, '#4a7a8a', '#86aab5']],
};

/** Draw one postcard onto a canvas (any size; the layout scales). */
export function drawPostcard(canvas, card) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  // The print.
  ctx.fillStyle = '#f6f2e6';
  ctx.fillRect(0, 0, w, h);
  const margin = w * 0.06;
  const pw = w - margin * 2;
  const ph = h * 0.74;
  ctx.save();
  ctx.beginPath();
  ctx.rect(margin, margin, pw, ph);
  ctx.clip();
  ctx.translate(margin, margin);
  paint(ctx, pw, ph, THEMES[card.theme] ?? THEMES.hills, hash(card.seed ?? 1));
  // A little vignette and a faded edge, as on an old print.
  const vignette = ctx.createRadialGradient(pw / 2, ph / 2, pw * 0.25, pw / 2, ph / 2, pw * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(40,30,20,0.35)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, pw, ph);
  ctx.restore();
  // Caption, in marker.
  ctx.fillStyle = '#1b1b1d';
  ctx.font = `italic 700 ${Math.round(h * 0.062)}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  wrap(ctx, card.caption, w / 2, margin + ph + (h - margin - ph) / 2, pw * 0.96, h * 0.07);
}

function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  lines.push(line);
  const top = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, top + i * lineHeight));
}

function paint(ctx, w, h, ops, seed) {
  let n = 0;
  const rand = () => hash(seed * 31 + n++ * 7.31);
  for (const [op, ...a] of ops) DRAW[op]?.(ctx, w, h, a, rand);
}

const DRAW = {
  sky(ctx, w, h, [top, bottom]) {
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.8);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
  night(ctx, w, h, [top, bottom]) {
    DRAW.sky(ctx, w, h, [top, bottom]);
  },
  stars(ctx, w, h, [count], rand) {
    ctx.fillStyle = '#fff8e0';
    for (let i = 0; i < count; i++) ctx.fillRect(rand() * w, rand() * h * 0.7, 1.5, 1.5);
  },
  sun(ctx, w, h, [x, y, r, color]) {
    const g = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, w * r * 3);
    g.addColorStop(0, 'rgba(255,244,208,0.9)');
    g.addColorStop(1, 'rgba(255,244,208,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(w * x, h * y, w * r, 0, Math.PI * 2);
    ctx.fill();
  },
  hills(ctx, w, h, [base, color, amp, shift], rand) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      const y = h * base - Math.sin(x * 0.018 + shift * 2.1) * h * amp * 0.5 - Math.sin(x * 0.041 + shift) * h * amp * 0.25;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.fill();
  },
  mountains(ctx, w, h, [base, dark, light], rand) {
    for (const [k, color] of [[0.6, light], [1, dark]]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      let x = -10;
      while (x < w + 30) {
        const peak = h * (base - 0.18 * k * (0.5 + rand() * 0.7));
        const span = 30 + rand() * 50;
        ctx.lineTo(x + span / 2, peak);
        ctx.lineTo(x + span, h * (base + 0.04));
        x += span;
      }
      ctx.lineTo(w, h);
      ctx.fill();
    }
  },
  dunes(ctx, w, h, [base, a, b], rand) {
    const g = ctx.createLinearGradient(0, h * base - 20, 0, h);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 5) ctx.lineTo(x, h * base - Math.sin(x * 0.02 + base * 9) * h * 0.06 - Math.sin(x * 0.007 + 1) * h * 0.05);
    ctx.lineTo(w, h);
    ctx.fill();
  },
  ground(ctx, w, h, [y, color]) {
    ctx.fillStyle = color;
    ctx.fillRect(0, h * y, w, h);
  },
  water(ctx, w, h, [y, deep, light]) {
    const g = ctx.createLinearGradient(0, h * y, 0, h);
    g.addColorStop(0, light ?? deep);
    g.addColorStop(1, deep);
    ctx.fillStyle = g;
    ctx.fillRect(0, h * y, w, h);
  },
  skyline(ctx, w, h, [base, color], rand) {
    ctx.fillStyle = color;
    let x = 0;
    while (x < w) {
      const bw = 12 + rand() * 20;
      const bh = h * (0.08 + rand() * 0.22);
      ctx.fillRect(x, h * base - bh, bw, bh + 4);
      x += bw + 1;
    }
  },
  buildings(ctx, w, h, [count, base, palette], rand) {
    const bw = w / count;
    for (let i = 0; i < count; i++) {
      const bh = h * (0.14 + rand() * 0.22);
      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(i * bw, h * base - bh, bw - 2, bh + h * 0.3);
      ctx.fillStyle = 'rgba(30,20,10,0.45)';
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) ctx.fillRect(i * bw + 6 + c * (bw / 2.4), h * base - bh + 8 + r * 20, 7, 11);
    }
  },
  stack(ctx, w, h, [base, palette], rand) {
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = palette[(i + row) % palette.length];
        const bw = w / 5;
        ctx.fillRect(i * bw - row * 14, h * (base - 0.42 + row * 0.1), bw - 3, h * 0.11);
        ctx.fillStyle = 'rgba(40,30,20,0.4)';
        ctx.fillRect(i * bw - row * 14 + bw * 0.4, h * (base - 0.4 + row * 0.1), 7, 10);
      }
    }
  },
  mudwall(ctx, w, h, [base, color], rand) {
    ctx.fillStyle = color;
    ctx.fillRect(0, h * (base - 0.22), w, h * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < w; x += 18) ctx.fillRect(x, h * (base - 0.25), 9, 8);
    ctx.fillRect(w * 0.45, h * (base - 0.12), w * 0.1, h * 0.2);
  },
  mosque(ctx, w, h, [base, wall, dome]) {
    ctx.fillStyle = wall;
    ctx.fillRect(w * 0.2, h * (base - 0.2), w * 0.6, h * 0.24);
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * (base - 0.2), w * 0.16, Math.PI, 0);
    ctx.fill();
    for (const x of [0.16, 0.84]) {
      ctx.fillStyle = wall;
      ctx.fillRect(w * x - 5, h * (base - 0.42), 10, h * 0.46);
      ctx.fillStyle = dome;
      ctx.beginPath();
      ctx.arc(w * x, h * (base - 0.42), 8, Math.PI, 0);
      ctx.fill();
    }
  },
  rockdome(ctx, w, h, [base, color]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * (base + 0.1));
    ctx.quadraticCurveTo(w * 0.38, h * (base - 0.4), w * 0.52, h * (base - 0.34));
    ctx.quadraticCurveTo(w * 0.66, h * (base - 0.3), w * 0.72, h * (base + 0.1));
    ctx.fill();
  },
  trees(ctx, w, h, [kind, count, base, color], rand) {
    for (let i = 0; i < count; i++) {
      const x = (i + 0.3 + rand() * 0.5) * (w / count);
      const y = h * (base + rand() * 0.05);
      const s = 0.7 + rand() * 0.7;
      TREES[kind]?.(ctx, x, y, s, color, h);
    }
  },
  bus(ctx, w, h, [base, color]) {
    const x = w * 0.28;
    const y = h * base;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 34, 84, 30);
    ctx.fillStyle = '#1b1b1d';
    ctx.fillRect(x, y - 20, 84, 4);
    ctx.fillStyle = '#9ac4d8';
    for (let i = 0; i < 5; i++) ctx.fillRect(x + 6 + i * 15, y - 30, 11, 9);
    ctx.fillStyle = '#1b1b1d';
    for (const wx of [18, 64]) {
      ctx.beginPath();
      ctx.arc(x + wx, y - 3, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  camel(ctx, w, h, [base, color]) {
    const x = w * 0.5;
    const y = h * base;
    ctx.fillStyle = color;
    ctx.fillRect(x - 24, y - 26, 48, 14);
    ctx.beginPath();
    ctx.arc(x - 8, y - 30, 9, Math.PI, 0);
    ctx.arc(x + 10, y - 30, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + 22, y - 44, 6, 22);
    ctx.fillRect(x + 22, y - 48, 16, 7);
    for (const lx of [-20, -8, 10, 20]) ctx.fillRect(x + lx, y - 14, 4, 22);
  },
  bridge(ctx, w, h, [y, color]) {
    ctx.fillStyle = color;
    ctx.fillRect(0, h * y, w, 6);
    for (let x = 12; x < w; x += 48) ctx.fillRect(x, h * y, 6, h * 0.1);
  },
  road(ctx, w, h, [base, color]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * base);
    ctx.lineTo(w * 0.62, h * base);
    ctx.lineTo(w * 0.95, h);
    ctx.lineTo(w * 0.05, h);
    ctx.fill();
    ctx.strokeStyle = '#f5f2e8';
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * base);
    ctx.lineTo(w * 0.5, h);
    ctx.stroke();
    ctx.setLineDash([]);
  },
  rows(ctx, w, h, [base, a, b]) {
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? a : b;
      const y = h * base + i * h * 0.04;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * base);
      ctx.lineTo(w * (0.5 + (i - 5.5) * 0.12) - 12, h);
      ctx.lineTo(w * (0.5 + (i - 5.5) * 0.12) + 12, h);
      ctx.fill();
      void y;
    }
  },
  fog(ctx, w, h, [amount]) {
    const g = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.85);
    g.addColorStop(0, `rgba(225,228,224,${amount})`);
    g.addColorStop(1, 'rgba(225,228,224,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
  puddle(ctx, w, h, [base, color]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * base, w * 0.3, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  log(ctx, w, h, [base, color]) {
    ctx.fillStyle = color;
    ctx.fillRect(w * 0.15, h * base - 14, w * 0.7, 26);
    ctx.fillStyle = '#c9a678';
    ctx.beginPath();
    ctx.ellipse(w * 0.85, h * base - 1, 8, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  spire(ctx, w, h, [base, color]) {
    ctx.fillStyle = color;
    ctx.fillRect(w * 0.44, h * (base - 0.1), w * 0.12, h * 0.2);
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h * (base - 0.1));
    ctx.lineTo(w * 0.5, h * (base - 0.42));
    ctx.lineTo(w * 0.58, h * (base - 0.1));
    ctx.fill();
  },
  windmill(ctx, w, h, [base, color]) {
    const x = w * 0.7;
    const y = h * base;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 14, y);
    ctx.lineTo(x - 8, y - 46);
    ctx.lineTo(x + 8, y - 46);
    ctx.lineTo(x + 14, y);
    ctx.fill();
    ctx.strokeStyle = '#3a2a20';
    ctx.lineWidth = 3;
    for (let a = 0; a < 4; a++) {
      const ang = a * (Math.PI / 2) + 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y - 46);
      ctx.lineTo(x + Math.cos(ang) * 40, y - 46 + Math.sin(ang) * 40);
      ctx.stroke();
    }
  },
  rain(ctx, w, h, [count], rand) {
    ctx.strokeStyle = 'rgba(80,90,100,0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 14);
      ctx.stroke();
    }
  },
};

const TREES = {
  palm(ctx, x, y, s, color) {
    ctx.strokeStyle = '#5a4430';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 6 * s, y - 28 * s, x + 2 * s, y - 56 * s);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * s;
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + 2 * s, y - 56 * s);
      ctx.quadraticCurveTo(x + Math.cos(ang) * 16 * s, y - 66 * s, x + Math.cos(ang) * 26 * s, y - 50 * s + Math.sin(ang) * 6);
      ctx.stroke();
    }
  },
  acacia(ctx, x, y, s, color) {
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(x - 2 * s, y - 34 * s, 4 * s, 34 * s);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y - 38 * s, 26 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  baobab(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 12 * s, y);
    ctx.quadraticCurveTo(x - 7 * s, y - 40 * s, x - 10 * s, y - 56 * s);
    ctx.lineTo(x + 10 * s, y - 56 * s);
    ctx.quadraticCurveTo(x + 7 * s, y - 40 * s, x + 12 * s, y);
    ctx.fill();
    ctx.fillStyle = '#3f5a2c';
    ctx.beginPath();
    ctx.ellipse(x, y - 60 * s, 22 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  pine(ctx, x, y, s, color) {
    ctx.fillStyle = '#3a2c20';
    ctx.fillRect(x - 2 * s, y - 8 * s, 4 * s, 8 * s);
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x - (22 - i * 4) * s, y - (6 + i * 18) * s);
      ctx.lineTo(x, y - (38 + i * 18) * s);
      ctx.lineTo(x + (22 - i * 4) * s, y - (6 + i * 18) * s);
      ctx.fill();
    }
  },
  plane(ctx, x, y, s, color) {
    ctx.fillStyle = '#9a8f80';
    ctx.fillRect(x - 3 * s, y - 40 * s, 6 * s, 40 * s);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y - 52 * s, 26 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  poplar(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y - 30 * s, 7 * s, 34 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  },
};
