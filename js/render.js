// Dessin des blocs et des fonds (pixel art original, généré par code).
// Les états allumé/éteint ne reposent jamais seulement sur la couleur :
// halo lumineux, contour blanc, rayons, traits pleins vs pointillés.

import { MAT, noteName, midiFor, INSTRUMENTS, instrumentFromBelow } from './data.js?v=0.2.4';

const DX = [0, 1, 0, -1, 0, 0], DY = [-1, 0, 1, 0, 0, 0];

export function hash(x, y, i = 0) {
  let h = (x * 374761393 + y * 668265263 + i * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0);
}

// Texture « pixel » : n x n sous-pixels tirés d'une palette (couleur 0 dominante).
function texture(g, px, py, s, cols, seed, n = 6) {
  const p = s / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = hash(seed + i, j * 7 + 3, seed) % 10;
    g.fillStyle = h < 6 ? cols[0] : h < 8 ? cols[1] : cols[2];
    g.fillRect(px + i * p, py + j * p, Math.ceil(p), Math.ceil(p));
  }
}

function bevel(g, px, py, s, light = 'rgba(255,255,255,.28)', dark = 'rgba(0,0,0,.35)') {
  const w = Math.max(1, s * 0.06);
  g.fillStyle = light; g.fillRect(px, py, s, w); g.fillRect(px, py, w, s);
  g.fillStyle = dark; g.fillRect(px, py + s - w, s, w); g.fillRect(px + s - w, py, w, s);
}

// ---------- Fonds du plan de travail ----------
export const THEMES = {
  tableau: { name: 'Tableau noir', grid: 'rgba(240,240,220,.13)', cols: ['#1f2b27', '#23312c', '#1b2522'], chalk: true },
  gazon:   { name: 'Gazon',        grid: 'rgba(0,0,0,.16)',       cols: ['#5f9e3a', '#548f33', '#6cae44'] },
  quartz:  { name: 'Quartz',       grid: 'rgba(80,70,60,.16)',    cols: ['#ece6dc', '#e3dccf', '#f5f1ea'] },
  pierre:  { name: 'Pierre',       grid: 'rgba(0,0,0,.18)',       cols: ['#8a8a8a', '#7b7b7b', '#999999'] },
  bois:    { name: 'Bois',         grid: 'rgba(40,20,0,.25)',     cols: ['#a47a45', '#93693a', '#b58a52'], planks: true },
  sable:   { name: 'Sable',        grid: 'rgba(90,70,20,.16)',    cols: ['#ddd0a0', '#d2c38f', '#e8ddb3'] },
  neige:   { name: 'Neige',        grid: 'rgba(60,90,130,.18)',   cols: ['#f4f8fc', '#e8eff7', '#ffffff'] },
};

export function drawBackground(g, theme, x, y, s) {
  const th = THEMES[theme] || THEMES.tableau;
  const px = x * s, py = y * s;
  if (th.chalk) {
    g.fillStyle = th.cols[0]; g.fillRect(px, py, s, s);
  } else {
    texture(g, px, py, s, th.cols, hash(x, y, 1) % 1000, 4);
    if (th.planks) { g.fillStyle = 'rgba(40,20,0,.22)'; g.fillRect(px, py + s * .5 - 1, s, 2); if (hash(x, y, 2) % 2) g.fillRect(px + s * .5, py, 2, s * .5); else g.fillRect(px + s * .25, py + s * .5, 2, s * .5); }
  }
  g.strokeStyle = th.grid; g.lineWidth = 1;
  g.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

// ---------- Matériaux ----------
export function drawMaterial(g, id, px, py, s, seed = 0) {
  const m = MAT[id] || MAT.stone;
  texture(g, px, py, s, m.c, seed + id.length * 31);
  const u = s / 16;
  g.save();
  switch (id) {
    case 'planks':
      g.fillStyle = 'rgba(60,35,10,.45)';
      for (const yy of [4, 8, 12]) g.fillRect(px, py + yy * u, s, u * .8);
      g.fillRect(px + 7 * u, py, u * .8, 4 * u); g.fillRect(px + 3 * u, py + 8 * u, u * .8, 4 * u);
      break;
    case 'glass':
      g.clearRect(px, py, s, s);
      g.fillStyle = 'rgba(200,235,245,.25)'; g.fillRect(px, py, s, s);
      g.strokeStyle = '#e9f7fb'; g.lineWidth = u * 1.2; g.strokeRect(px + u * .6, py + u * .6, s - u * 1.2, s - u * 1.2);
      g.fillStyle = '#ffffff'; g.fillRect(px + 3 * u, py + 3 * u, u, u); g.fillRect(px + 4 * u, py + 4 * u, u, u); g.fillRect(px + 5 * u, py + 5 * u, u, u);
      break;
    case 'gold': case 'iron': case 'emerald':
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = u; g.strokeRect(px + 2.5 * u, py + 2.5 * u, 11 * u, 11 * u);
      if (id === 'emerald') { g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(px + 8 * u, py + 4 * u); g.lineTo(px + 12 * u, py + 8 * u); g.lineTo(px + 8 * u, py + 12 * u); g.lineTo(px + 4 * u, py + 8 * u); g.closePath(); g.fill(); }
      if (id === 'iron') { g.fillStyle = 'rgba(0,0,0,.3)'; for (const [a, b] of [[4, 4], [11, 4], [4, 11], [11, 11]]) g.fillRect(px + a * u, py + b * u, u, u); }
      break;
    case 'hay':
      g.fillStyle = 'rgba(120,70,10,.6)'; g.fillRect(px, py + 3 * u, s, 1.5 * u); g.fillRect(px, py + 11.5 * u, s, 1.5 * u);
      break;
    case 'bone':
      g.strokeStyle = 'rgba(120,110,80,.5)'; g.lineWidth = u; g.strokeRect(px + 3.5 * u, py + 3.5 * u, 9 * u, 9 * u);
      g.fillStyle = 'rgba(120,110,80,.5)'; g.fillRect(px + 7 * u, py + 7 * u, 2 * u, 2 * u);
      break;
    case 'pumpkin':
      g.fillStyle = 'rgba(120,50,0,.35)'; for (const xx of [3, 7.5, 12]) g.fillRect(px + xx * u, py, u, s);
      g.fillStyle = '#4c7a2a'; g.fillRect(px + 6.5 * u, py + 6.5 * u, 3 * u, 3 * u);
      break;
    case 'glowstone':
      g.fillStyle = '#fff7c8'; for (let i = 0; i < 6; i++) { const h = hash(i, seed, 5); g.fillRect(px + (h % 13 + 1) * u, py + ((h >>> 4) % 13 + 1) * u, 2 * u, 2 * u); }
      break;
    case 'ice':
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = u * .7; g.beginPath(); g.moveTo(px + 3 * u, py + 13 * u); g.lineTo(px + 9 * u, py + 6 * u); g.lineTo(px + 13 * u, py + 3 * u); g.stroke();
      break;
    case 'wool':
      g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = u * .7; for (let i = 2; i < 16; i += 4) { g.beginPath(); g.moveTo(px, py + i * u); g.lineTo(px + s, py + (i + 2) * u); g.stroke(); }
      break;
  }
  g.restore();
  if (id !== 'glass') bevel(g, px, py, s);
}

// ---------- Glyphes ----------
function noteGlyph(g, cx, cy, r, col) {
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = r * 0.18;
  g.beginPath(); g.ellipse(cx - r * .45, cy + r * .45, r * .32, r * .24, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx + r * .45, cy + r * .3, r * .32, r * .24, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(cx - r * .17, cy + r * .4); g.lineTo(cx - r * .17, cy - r * .55); g.lineTo(cx + r * .73, cy - r * .7); g.lineTo(cx + r * .73, cy + r * .25); g.stroke();
  g.fillRect(cx - r * .17, cy - r * .62, r * .9, r * .2);
}

function glow(g, cx, cy, r, col) {
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,80,40,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
}

function pill(g, text, cx, cy, s) {
  g.font = `700 ${Math.max(9, s * 0.25)}px system-ui, sans-serif`;
  const w = g.measureText(text).width + s * 0.14, h = Math.max(11, s * 0.3);
  g.fillStyle = 'rgba(10,10,14,.82)';
  roundRect(g, cx - w / 2, cy - h / 2, w, h, h / 2); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cx, cy + 0.5);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------- Blocs ----------
// st : état d'affichage { lit, on, level, pts, out, input, flash (0..1), active, powered, lang, showPower, showNames }
export function drawCell(g, c, x, y, s, st = {}) {
  const px = x * s, py = y * s, cx = px + s / 2, cy = py + s / 2;
  switch (c.type) {
    case 'solid': {
      drawMaterial(g, c.mat, px, py, s, hash(x, y) % 97);
      if (st.powered) { g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(2, s * .07); g.setLineDash([s * .12, s * .08]); g.strokeRect(px + s * .12, py + s * .12, s * .76, s * .76); g.setLineDash([]); }
      break;
    }
    case 'note': {
      // Anneau extérieur = le bloc situé dessous (il choisit l'instrument)
      const below = st.below;
      if (below && below.type === 'solid') drawMaterial(g, below.mat, px, py, s, hash(x, y) % 97);
      else if (below && below.type === 'note') texture(g, px, py, s, ['#6b4426', '#5a3820', '#7a5030'], 11, 4);
      else { g.fillStyle = '#4a3020'; g.fillRect(px, py, s, s); }
      const b = s * 0.15;
      texture(g, px + b, py + b, s - 2 * b, ['#6b4426', '#5a3820', '#7a5030'], hash(x, y, 4) % 50, 5);
      g.strokeStyle = '#1d120a'; g.lineWidth = Math.max(1.5, s * .045); g.strokeRect(px + b, py + b, s - 2 * b, s - 2 * b);
      noteGlyph(g, cx, cy - s * .1, s * .26, st.flash > 0 ? '#ffffff' : '#f1dfb8');
      const instr = instrumentFromBelow(below);
      if (st.showNames !== false) pill(g, noteName(midiFor(instr, c.clicks), st.lang), cx, py + s * .8, s);
      if (st.blocked) { // un bloc posé au-dessus empêche la note de jouer
        g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(2, s * .06);
        g.beginPath(); g.moveTo(px + s * .2, py + s * .2); g.lineTo(px + s * .8, py + s * .62); g.moveTo(px + s * .8, py + s * .2); g.lineTo(px + s * .2, py + s * .62); g.stroke();
      }
      if (st.flash > 0) {
        g.strokeStyle = `rgba(255,255,255,${st.flash})`; g.lineWidth = s * .12 * st.flash + 2;
        g.strokeRect(px + 2, py + 2, s - 4, s - 4);
        g.fillStyle = `rgba(255,255,200,${0.35 * st.flash})`; g.fillRect(px, py, s, s);
      }
      break;
    }
    case 'dust': {
      const lvl = st.level || 0, on = lvl > 0;
      const pts = st.pts || [0, 1, 2, 3];
      const shade = on ? `rgb(${150 + lvl * 7},${20 + lvl * 3},${15})` : '#8f2a1f';
      const w = on ? s * .24 : s * .16;
      g.lineCap = 'butt';
      for (const d of pts) {
        g.strokeStyle = shade; g.lineWidth = w;
        g.setLineDash(on ? [] : [s * .1, s * .07]);
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + DX[d] * s / 2, cy + DY[d] * s / 2); g.stroke();
        if (on) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = Math.max(1.5, w * .25); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + DX[d] * s / 2, cy + DY[d] * s / 2); g.stroke(); }
      }
      g.setLineDash([]);
      g.fillStyle = shade; g.beginPath(); g.arc(cx, cy, w * .9, 0, Math.PI * 2); g.fill();
      if (on) { glow(g, cx, cy, s * .45, 'rgba(255,60,30,.35)'); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, w * .3, 0, Math.PI * 2); g.fill(); }
      for (const [d, dz] of st.vert || []) pill(g, dz > 0 ? '▲' : '▼', cx + DX[d] * s * .33, cy + DY[d] * s * .33, s * .62);
      if (st.showPower && on) pill(g, String(lvl), px + s * .78, py + s * .2, s * .8);
      break;
    }
    case 'repeater': {
      g.fillStyle = '#b9b9b9'; g.fillRect(px + s * .06, py + s * .06, s * .88, s * .88);
      texture(g, px + s * .06, py + s * .06, s * .88, ['#c4c4c4', '#b0b0b0', '#d2d2d2'], hash(x, y, 6) % 40, 4);
      g.strokeStyle = '#3a3a3a'; g.lineWidth = Math.max(1, s * .04); g.strokeRect(px + s * .06, py + s * .06, s * .88, s * .88);
      g.save(); g.translate(cx, cy); g.rotate(c.dir * Math.PI / 2);
      // flèche (vers le haut avant rotation)
      const out = !!st.out;
      g.fillStyle = out ? '#ff2d1f' : '#4a1410';
      g.beginPath(); g.moveTo(0, -s * .4); g.lineTo(s * .24, -s * .1); g.lineTo(s * .09, -s * .1); g.lineTo(s * .09, s * .38); g.lineTo(-s * .09, s * .38); g.lineTo(-s * .09, -s * .1); g.lineTo(-s * .24, -s * .1); g.closePath(); g.fill();
      g.strokeStyle = out ? '#ffffff' : '#222'; g.lineWidth = Math.max(1.5, s * .04); g.setLineDash(out ? [] : [s * .06, s * .05]); g.stroke(); g.setLineDash([]);
      // entrée alimentée : petit carré à l'arrière
      if (st.input) { g.fillStyle = '#fff'; g.fillRect(-s * .07, s * .3, s * .14, s * .1); }
      g.restore();
      if (out) glow(g, cx + DX[c.dir] * s * .3, cy + DY[c.dir] * s * .3, s * .35, 'rgba(255,60,30,.4)');
      pill(g, String(c.delay || 1), px + s * .8, py + s * .8, s * .75);
      break;
    }
    case 'torch': {
      // Murale (c.dir 0-3 = côté du bloc support) ou posée au sol (c.dir 5)
      const wall = c.dir != null && c.dir < 4;
      const tx = wall ? cx - DX[c.dir] * s * .08 : cx, ty = wall ? cy - DY[c.dir] * s * .08 : cy;
      g.strokeStyle = '#7a5530'; g.lineCap = 'round';
      if (wall) {
        g.lineWidth = s * .14;
        g.beginPath(); g.moveTo(cx + DX[c.dir] * s * .5, cy + DY[c.dir] * s * .5); g.lineTo(tx, ty); g.stroke();
      } else {
        g.fillStyle = '#7a5530'; g.fillRect(cx - s * .09, cy - s * .09, s * .18, s * .18);
      }
      g.lineCap = 'butt';
      if (st.lit) {
        glow(g, tx, ty, s * .5, 'rgba(255,90,40,.55)');
        g.strokeStyle = '#fff3b0'; g.lineWidth = Math.max(1.5, s * .05);
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(tx + Math.cos(a) * s * .17, ty + Math.sin(a) * s * .17); g.lineTo(tx + Math.cos(a) * s * .3, ty + Math.sin(a) * s * .3); g.stroke(); }
        g.fillStyle = '#ff3a1c'; g.beginPath(); g.arc(tx, ty, s * .13, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(tx, ty, s * .06, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = '#3a1a14'; g.beginPath(); g.arc(tx, ty, s * .12, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#8a8a8a'; g.lineWidth = Math.max(1, s * .03); g.stroke();
      }
      break;
    }
    case 'lever': {
      g.fillStyle = '#6f6f6f'; g.fillRect(px + s * .3, py + s * .22, s * .4, s * .56);
      g.strokeStyle = '#2a2a2a'; g.lineWidth = Math.max(1, s * .04); g.strokeRect(px + s * .3, py + s * .22, s * .4, s * .56);
      const on = !!c.on;
      const ex = cx + (on ? s * .28 : -s * .28), ey = cy - s * .3;
      g.strokeStyle = '#8a6438'; g.lineWidth = s * .1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy + s * .05); g.lineTo(ex, ey); g.stroke(); g.lineCap = 'butt';
      if (on) glow(g, ex, ey, s * .3, 'rgba(255,60,30,.5)');
      g.fillStyle = on ? '#ff2d1f' : '#3a1a14'; g.beginPath(); g.arc(ex, ey, s * .1, 0, Math.PI * 2); g.fill();
      g.strokeStyle = on ? '#fff' : '#888'; g.lineWidth = Math.max(1, s * .035); g.stroke();
      pill(g, on ? 'ON' : 'OFF', cx, py + s * .85, s * .7);
      break;
    }
    case 'button': {
      const on = !!st.on, wood = c.kind === 'wood';
      const inset = on ? s * .34 : s * .28;
      if (on) glow(g, cx, cy, s * .5, 'rgba(255,60,30,.45)');
      g.fillStyle = wood ? (on ? '#7a5a30' : '#a57e48') : (on ? '#666' : '#9a9a9a');
      g.fillRect(px + inset, py + inset, s - 2 * inset, s - 2 * inset);
      g.strokeStyle = on ? '#fff' : '#2a2a2a'; g.lineWidth = Math.max(1.5, s * .045);
      g.strokeRect(px + inset, py + inset, s - 2 * inset, s - 2 * inset);
      break;
    }
    case 'rblock': {
      texture(g, px, py, s, ['#b3170e', '#8f1009', '#d8291c'], hash(x, y, 7) % 60);
      g.fillStyle = '#ffd9d0'; for (const [a, b] of [[.25, .25], [.65, .3], [.35, .7], [.7, .7]]) g.fillRect(px + s * a, py + s * b, s * .08, s * .08);
      bevel(g, px, py, s);
      break;
    }
  }
}

// Petite icône pour la palette
export function iconCanvas(item, size = 44) {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  if (item.mat) drawMaterial(g, item.mat, 0, 0, size, 3);
  else if (item.cell) drawCell(g, item.cell, 0, 0, size, item.st || { lit: true, showNames: false, pts: [1, 3], level: 15 });
  else if (item.draw) item.draw(g, size);
  return cv;
}

