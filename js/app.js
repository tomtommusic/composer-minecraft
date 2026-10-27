import { MATERIALS, MAT, INSTRUMENTS, noteName, midiFor, instrumentFromBelow } from './data.js?v=0.2.5';
import { World, Sim, DX, DY, ZMIN, ZMAX, isConductive } from './engine.js?v=0.2.5';
import { drawBackground, drawCell, iconCanvas, THEMES } from './render.js?v=0.2.5';
import { audio, playNote } from './sound.js?v=0.2.5';
import { helpHTML, wireHelp } from './guide.js?v=0.2.5';

const $ = s => document.querySelector(s);
const DIRS = ['Nord', 'Est', 'Sud', 'Ouest'];
const ARROWS = ['↑', '→', '↓', '←'];
const STORE = 'cfm.projects', CUR = 'cfm.current', PREFS = 'cfm.prefs';
const clone = o => JSON.parse(JSON.stringify(o));

// ---------- Stockage local (protégé : peut être indisponible) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

// ---------- État ----------
const S = {
  id: null, name: 'Sans titre', edition: 'java', theme: 'tableau', mode: 'simple',
  world: new World(48, 28), sim: null,
  layer: 0, tool: 'select', rot: 1, lastBelow: null,
  sel: null,            // rectangle sélectionné { x0, y0, x1, y1 } sur l'étage affiché
  allLayers: false,     // mode Avancé : la sélection inclut tous les étages
  clip: null,           // presse-papiers { w, h, cells: [[dx, dy, dz, cell]] }
  paste: null,          // collage en cours { buf, move }
  pasteAt: null,
  hover: null, size: 44,
  running: false, speed: 1, audioT: 0,
  hist: [], fut: [], tab: 'redstone',
  prefs: Object.assign({ lang: 'fr', showNames: true, showPower: false }, store.get(PREFS, {})),
};

const canvas = $('#stage'), g = canvas.getContext('2d'), wrap = $('#stageWrap');
const L = () => (S.mode === 'advanced' ? S.layer : 0);

// ---------- Palette ----------
const outline = (c, s) => { c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(s * .1, s * .1, s * .8, s * .8); };
const PALETTE = {
  outils: { label: 'Outils', items: [
    { id: 'select', name: 'Sélection / jouer', draw: (c, s) => { c.fillStyle = '#ffd34d'; c.beginPath(); c.moveTo(s * .3, s * .15); c.lineTo(s * .3, s * .8); c.lineTo(s * .45, s * .65); c.lineTo(s * .58, s * .88); c.lineTo(s * .68, s * .83); c.lineTo(s * .55, s * .6); c.lineTo(s * .75, s * .6); c.closePath(); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke(); } },
    { id: 'zone', name: 'Zone (multiple)', draw: (c, s) => { c.strokeStyle = '#000'; c.lineWidth = 5; c.strokeRect(s * .15, s * .2, s * .7, s * .6); c.strokeStyle = '#ffd34d'; c.lineWidth = 2.5; c.setLineDash([s * .1, s * .07]); c.strokeRect(s * .15, s * .2, s * .7, s * .6); c.setLineDash([]); c.fillStyle = '#ffd34d'; c.fillRect(s * .7, s * .65, s * .18, s * .18); } },
    { id: 'erase', name: 'Gomme', draw: (c, s) => { c.save(); c.translate(s / 2, s / 2); c.rotate(-0.6); c.fillStyle = '#ff8fa0'; c.fillRect(-s * .3, -s * .14, s * .38, s * .28); c.fillStyle = '#e7e7e7'; c.fillRect(s * .08, -s * .14, s * .22, s * .28); c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(-s * .3, -s * .14, s * .6, s * .28); c.restore(); } },
  ] },
  musique: { label: 'Musique', items: [
    { id: 'note', name: 'Bloc musical', cell: { type: 'note', clicks: 0 } },
  ] },
  materiaux: { label: 'Matériaux', items: MATERIALS.map(m => ({ id: 'mat:' + m.id, name: m.name, mat: m.id, sub: INSTRUMENTS[m.instr].name })) },
  redstone: { label: 'Redstone', items: [
    { id: 'dust', name: 'Poussière', cell: { type: 'dust' } },
    { id: 'repeater', name: 'Répéteur', cell: { type: 'repeater', dir: 1, delay: 1 }, st: { out: true } },
    { id: 'torch', name: 'Torche', cell: { type: 'torch', dir: 3 }, st: { lit: true } },
    { id: 'lever', name: 'Levier', cell: { type: 'lever', on: true } },
    { id: 'button:stone', name: 'Bouton de pierre', cell: { type: 'button', kind: 'stone' } },
    { id: 'button:wood', name: 'Bouton de bois', cell: { type: 'button', kind: 'wood' } },
    { id: 'rblock', name: 'Bloc de redstone', cell: { type: 'rblock' } },
  ] },
  bientot: { label: 'Bientôt', items: [
    { id: 'soon:piston', name: 'Piston', soon: true, draw: (c, s) => { c.fillStyle = '#9a9a9a'; c.fillRect(s * .1, s * .3, s * .8, s * .6); c.fillStyle = '#b08850'; c.fillRect(s * .1, s * .1, s * .8, s * .22); outline(c, s); } },
    { id: 'soon:sticky', name: 'Piston collant', soon: true, draw: (c, s) => { c.fillStyle = '#9a9a9a'; c.fillRect(s * .1, s * .3, s * .8, s * .6); c.fillStyle = '#7cc46a'; c.fillRect(s * .1, s * .1, s * .8, s * .22); outline(c, s); } },
    { id: 'soon:slime', name: 'Bloc de slime', soon: true, draw: (c, s) => { c.fillStyle = '#7cc46a'; c.fillRect(s * .1, s * .1, s * .8, s * .8); c.fillStyle = '#5a9e4b'; c.fillRect(s * .3, s * .3, s * .4, s * .4); outline(c, s); } },
    { id: 'soon:cmd', name: 'Bloc de commande', soon: true, draw: (c, s) => { c.fillStyle = '#c47a3c'; c.fillRect(s * .1, s * .1, s * .8, s * .8); c.fillStyle = '#e8e8e8'; c.fillRect(s * .3, s * .3, s * .4, s * .4); c.fillStyle = '#333'; c.font = `700 ${s * .26}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('/', s / 2, s / 2); outline(c, s); } },
  ] },
};

function buildPalette() {
  const tabs = $('#tabs'); tabs.innerHTML = '';
  for (const [key, cat] of Object.entries(PALETTE)) {
    const b = document.createElement('button');
    b.textContent = cat.label; b.className = key === S.tab ? 'on' : ''; b.setAttribute('role', 'tab');
    b.onclick = () => { S.tab = key; buildPalette(); };
    tabs.appendChild(b);
  }
  const box = $('#items'); box.innerHTML = '';
  for (const it of PALETTE[S.tab].items) {
    const b = document.createElement('button');
    b.className = 'item' + (S.tool === it.id ? ' on' : '') + (it.soon ? ' soon' : '');
    b.title = it.sub ? `${it.name} → ${it.sub}` : it.name;
    b.appendChild(iconCanvas(it, 40));
    const sp = document.createElement('span'); sp.textContent = it.name; b.appendChild(sp);
    if (it.sub) { const sm = document.createElement('span'); sm.style.color = 'var(--muted)'; sm.style.fontSize = '10px'; sm.textContent = it.sub; b.appendChild(sm); }
    if (it.soon) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'bientôt'; b.appendChild(t); }
    b.onclick = () => {
      if (it.soon) { status('Cet élément arrive dans une prochaine version.'); return; }
      setTool(it.id);
    };
    box.appendChild(b);
  }
  updateRotate();
}

// Les gestes tactiles sont gérés par l'app (1 doigt = outil, 2 doigts = déplacer / zoomer)
function setTouch() { canvas.style.touchAction = 'none'; }

function setTool(id) {
  if (S.paste) endPaste(true);
  S.tool = id;
  if (!['select', 'zone'].includes(id) && S.sel && !isSingle()) S.sel = null;
  setTouch(); buildPalette(); refreshSelUI(); draw();
  const hints = {
    select: 'Touche un bloc pour le régler, un levier ou un bouton pour l’actionner. Glisse pour te déplacer.',
    zone: 'Glisse pour encadrer plusieurs blocs, puis copie, déplace, tourne…',
    erase: 'Touche ou glisse pour effacer.',
    note: 'Pose un bloc musical (aussi sur un matériau : il se place dessus), puis choisis sa note.',
    dust: 'Glisse pour tracer une ligne de poussière.',
    repeater: 'La flèche indique la sortie. Retouche un répéteur pour le tourner.',
    torch: 'À côté d’un bloc plein, la torche s’y accroche; sinon elle est posée au sol.',
  };
  if (id.startsWith('mat:')) status('Pose ce matériau sur un bloc musical pour changer son instrument, ou seul comme bloc plein.');
  else status(hints[id] || hints[id.split(':')[0]] || '');
}

function updateRotate() {
  const show = ['repeater', 'torch'].includes(S.tool);
  $('#rotate').style.visibility = show ? 'visible' : 'hidden';
  $('#rotLabel').textContent = `${ARROWS[S.rot]} ${DIRS[S.rot]}`;
}

// ---------- Historique ----------
function snapshot() { return JSON.stringify(S.world.toJSON()); }
function pushHist() { S.hist.push(snapshot()); if (S.hist.length > 120) S.hist.shift(); S.fut = []; }
function restore(json) { const w = World.fromJSON(JSON.parse(json)); S.world.cells = w.cells; refreshSelUI(); changed(false); }
function undo() { if (S.paste) { endPaste(); return; } if (!S.hist.length) return; S.fut.push(snapshot()); restore(S.hist.pop()); autosave(); }
function redo() { if (!S.fut.length) return; S.hist.push(snapshot()); restore(S.fut.pop()); autosave(); }

// ---------- Projets ----------
function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function projectData() {
  return { app: 'composer-for-minecraft', version: 2, name: S.name, edition: S.edition, theme: S.theme, mode: S.mode, world: S.world.toJSON() };
}
let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const all = store.get(STORE, {});
    all[S.id] = { name: S.name, updated: Date.now(), data: projectData() };
    if (store.set(STORE, all)) store.set(CUR, S.id);
  }, 400);
}
function loadProject(data, id) {
  if (S.paste) endPaste(true);
  S.id = id || newId();
  S.name = data.name || 'Sans titre';
  S.edition = data.edition || 'java';
  S.theme = THEMES[data.theme] ? data.theme : 'tableau';
  S.mode = data.mode === 'advanced' ? 'advanced' : 'simple';
  S.layer = 0;
  S.world = World.fromJSON(data.world || {});
  S.hist = []; S.fut = []; S.sel = null;
  S.sim = new Sim(S.world, onNote);
  setRunning(false);
  syncControls(); resize(); scrollToWorld(); refreshSelUI(); updateReadout(); changed(true);
}
function newProject() {
  loadProject({ name: 'Sans titre', world: { w: 48, h: 28, cells: [] } });
  status('Nouveau projet créé.');
}

function syncControls() {
  $('#projName').value = S.name;
  $('#edition').value = S.edition;
  $('#theme').value = S.theme;
  $('#mode').value = S.mode;
  $('#lang').value = S.prefs.lang;
  $('#showNames').checked = S.prefs.showNames;
  $('#showPower').checked = S.prefs.showPower;
  updateLayerUI();
}

function changed(save = true) { if (save) autosave(); if (S.mode === 'advanced') updateLayerUI(); draw(); }

// ---------- Démo ----------
function demoProject() {
  const w = new World(48, 28);
  const y = 6; let x = 2;
  // Do Do Do Ré Mi(blanche) Ré(blanche) Do Mi Ré Ré Do — chaque noire = 4 ticks (noire = 150)
  const melody = [[6, 4], [6, 4], [6, 4], [8, 4], [10, 8], [8, 8], [6, 4], [10, 4], [8, 4], [8, 4], [6, 0]];
  w.set(x++, y, 0, { type: 'button', kind: 'stone' });
  w.set(x++, y, 0, { type: 'repeater', dir: 1, delay: 1 });
  melody.forEach(([clicks, dur]) => {
    w.set(x++, y, 0, { type: 'note', clicks });
    for (let left = dur; left > 0; left -= 4) w.set(x++, y, 0, { type: 'repeater', dir: 1, delay: Math.min(4, left) });
  });
  return { name: 'Au clair de la lune', edition: 'java', theme: 'gazon', mode: 'simple', world: w.toJSON() };
}

// ---------- Simulation & son ----------
function instrAt(x, y, z) { return instrumentFromBelow(S.world.get(x, y, z - 1)); }

function onNote(x, y, z, c, instr) {
  const lead = Math.max(0, (S.audioT - audio().currentTime) * 1000);
  S.sim.flash.set(S.world.k(x, y, z), performance.now() + lead);
  playNote(instr, midiFor(instr, c.clicks), S.audioT || 0);
}

function previewNote(x, y, z) {
  const c = S.world.get(x, y, z); if (!c || c.type !== 'note') return;
  const instr = instrAt(x, y, z);
  playNote(instr, midiFor(instr, c.clicks));
}

function setRunning(on) {
  S.running = on;
  const b = $('#play');
  b.textContent = on ? '❚❚' : '▶';
  b.classList.toggle('paused', on);
  if (on) S.audioT = audio().currentTime + 0.06;
}

function stepOnce() {
  audio(); S.audioT = audio().currentTime + 0.02;
  S.sim.step(); updateReadout(); draw();
}

function loop() {
  if (S.running) {
    const ctx = audio();
    if (S.audioT < ctx.currentTime - 0.25) S.audioT = ctx.currentTime + 0.02;
    let n = 0;
    while (S.audioT < ctx.currentTime + 0.12 && n++ < 20) {
      S.sim.step();
      S.audioT += 0.1 / S.speed;
    }
    updateReadout();
  }
  const anim = S.running || [...S.sim.flash.values()].some(t => performance.now() - t < 400);
  if (anim) draw();
  requestAnimationFrame(loop);
}

function updateReadout() {
  $('#tickOut').textContent = 'Tick ' + S.sim.tick;
  $('#timeOut').textContent = (S.sim.tick / 10).toFixed(1).replace('.', ',') + ' s';
}

// ---------- Dessin ----------
// Caméra : le terrain se déplace librement dans toutes les directions.
// view.x / view.y = décalage (en pixels) du coin du terrain par rapport au coin visible.
const view = {
  _x: 0, _y: 0,
  get x() { return this._x; }, set x(v) { this._x = v; applyView(); },
  get y() { return this._y; }, set y(v) { this._y = v; applyView(); },
};
function applyView() {
  // garder au moins un petit morceau du terrain à l'écran
  const W = S.world.w * S.size, H = S.world.h * S.size, keep = 48;
  view._x = Math.max(-(wrap.clientWidth - keep), Math.min(W - keep, view._x));
  view._y = Math.max(-(wrap.clientHeight - keep), Math.min(H - keep, view._y));
  canvas.style.transform = `translate(${-view._x}px, ${-view._y}px)`;
  $('#stagePad').style.backgroundPosition = `${-view._x}px ${-view._y}px`;
}
const pad = () => ({ x: 0, y: 0 });

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = S.world.w * S.size, H = S.world.h * S.size;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  applyView();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

// Place le coin du terrain (ou la case wx, wy) à (ox, oy) pixels du bord visible
function scrollToWorld(wx = 0, wy = 0, ox = 16, oy = 16) {
  const P = pad();
  view.x = P.x + wx * S.size - ox;
  view.y = P.y + wy * S.size - oy;
}

function cellState(x, y, z, c, k) {
  const sim = S.sim, now = performance.now(), W = S.world;
  const st = { lang: S.prefs.lang, showNames: S.prefs.showNames, showPower: S.prefs.showPower };
  switch (c.type) {
    case 'dust': { st.level = sim.dust.get(k) || 0; const i = sim.dustInfo.get(k); st.pts = i?.pts; st.vert = i?.vert; break; }
    case 'repeater': st.out = !!sim.rep.get(k); st.input = sim.repIn.has(k); break;
    case 'torch': st.lit = sim.isTorchLit(k); break;
    case 'button': st.on = sim.isButtonOn(k); break;
    case 'solid': st.powered = sim.powered.has(k); break;
    case 'note': {
      st.below = W.get(x, y, z - 1);
      st.blocked = !!W.get(x, y, z + 1);
      const t = sim.flash.get(k);
      st.flash = t != null && now >= t ? Math.max(0, 1 - (now - t) / 350) : 0;
      break;
    }
  }
  return st;
}

function draw() {
  const s = S.size, W = S.world, z0 = L();
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) drawBackground(g, S.theme, x, y, s);
  // Mode Avancé : l'étage du dessous, en transparence
  if (S.mode === 'advanced') {
    g.save(); g.globalAlpha = 0.3;
    for (const [x, y, z, c, k] of W.each()) if (z === z0 - 1 && !W.get(x, y, z0)) drawCell(g, c, x, y, s, { ...cellState(x, y, z, c, k), showNames: false, showPower: false });
    g.restore();
  }
  for (const [x, y, z, c, k] of W.each()) if (z === z0) drawCell(g, c, x, y, s, cellState(x, y, z, c, k));

  // Aperçu sous le pointeur
  const h = S.hover;
  if (S.paste) drawPasteGhost();
  else if (h && !['select', 'erase', 'zone'].includes(S.tool) && !W.get(h.x, h.y, z0)) {
    const ghost = ghostCell(h.x, h.y);
    if (ghost) { g.save(); g.globalAlpha = 0.45; drawCell(g, ghost, h.x, h.y, s, { lit: true, pts: [1, 3], showNames: false }); g.restore(); }
  }
  if (h && !S.paste) { g.strokeStyle = S.tool === 'erase' ? '#ff6b5e' : 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.strokeRect(h.x * s + 1, h.y * s + 1, s - 2, s - 2); }

  // Sélection : contour double (noir + or), pointillé si plusieurs cases
  if (S.sel) {
    const { x0, y0, x1, y1 } = S.sel;
    const rx = x0 * s + 1.5, ry = y0 * s + 1.5, rw = (x1 - x0 + 1) * s - 3, rh = (y1 - y0 + 1) * s - 3;
    g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeRect(rx, ry, rw, rh);
    g.lineWidth = 2.5; g.strokeStyle = '#ffd34d';
    if (!isSingle()) g.setLineDash([8, 5]);
    g.strokeRect(rx, ry, rw, rh); g.setLineDash([]);
    if (!isSingle()) { g.fillStyle = 'rgba(255,211,77,.08)'; g.fillRect(rx, ry, rw, rh); }
  }
}

function drawPasteGhost() {
  const a = S.pasteAt || S.hover; if (!a) return;
  const s = S.size, buf = S.paste.buf;
  g.save(); g.globalAlpha = 0.55;
  for (const [dx, dy, dz, c] of buf.cells) if (dz === 0) drawCell(g, c, a.x + dx, a.y + dy, s, { lit: true, showNames: S.prefs.showNames, lang: S.prefs.lang });
  g.restore();
  g.lineWidth = 2.5; g.strokeStyle = '#7fe0a0'; g.setLineDash([6, 4]);
  g.strokeRect(a.x * s + 1, a.y * s + 1, buf.w * s - 2, buf.h * s - 2); g.setLineDash([]);
}

function ghostCell(x, y) {
  const t = S.tool;
  if (t === 'note') return { type: 'note', clicks: 0 };
  if (t.startsWith('mat:')) return { type: 'solid', mat: t.slice(4) };
  if (t === 'dust') return { type: 'dust' };
  if (t === 'repeater') return { type: 'repeater', dir: S.rot, delay: 1 };
  if (t === 'torch') return { type: 'torch', dir: torchAttach(x, y) };
  if (t === 'lever') return { type: 'lever', on: false };
  if (t.startsWith('button:')) return { type: 'button', kind: t.slice(7) };
  if (t === 'rblock') return { type: 'rblock' };
  return null;
}

// Torche : s'accroche à un bloc plein voisin (en priorité dans le sens choisi), sinon posée au sol
function torchAttach(x, y) {
  const back = (S.rot + 2) % 4;
  for (const d of [back, S.rot, (S.rot + 1) % 4, (S.rot + 3) % 4]) if (isConductive(S.world.get(x + DX[d], y + DY[d], L()))) return d;
  return 5;
}

// ---------- Sélection ----------
function isSingle() { return S.sel && S.sel.x0 === S.sel.x1 && S.sel.y0 === S.sel.y1; }
function selLayers() {
  if (S.mode === 'simple') return [...Array(ZMAX - ZMIN + 1).keys()].map(i => i + ZMIN);
  return S.allLayers ? [...Array(ZMAX - ZMIN + 1).keys()].map(i => i + ZMIN) : [S.layer];
}
function normRect(a, b) { return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }; }

function gather(rect, remove = false) {
  const cells = [], base = L();
  for (const z of selLayers()) for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) {
    const c = S.world.get(x, y, z);
    if (c) { cells.push([x - rect.x0, y - rect.y0, z - base, clone(c)]); if (remove) S.world.del(x, y, z); }
  }
  return { w: rect.x1 - rect.x0 + 1, h: rect.y1 - rect.y0 + 1, cells };
}

function place(buf, ax, ay) {
  const base = L();
  for (const [dx, dy, dz, c] of buf.cells) S.world.set(ax + dx, ay + dy, base + dz, clone(c));
}

// Tourner (90° horaire) ou retourner (miroir gauche-droite) un tampon
function transform(buf, op) {
  const cells = buf.cells.map(([dx, dy, dz, c0]) => {
    const c = clone(c0);
    let nx = dx, ny = dy;
    if (op === 'rot') {
      nx = buf.h - 1 - dy; ny = dx;
      if (c.dir != null && c.dir < 4) c.dir = (c.dir + 1) % 4;
    } else {
      nx = buf.w - 1 - dx;
      if (c.dir === 1) c.dir = 3; else if (c.dir === 3) c.dir = 1;
    }
    return [nx, ny, dz, c];
  });
  return op === 'rot' ? { w: buf.h, h: buf.w, cells } : { w: buf.w, h: buf.h, cells };
}

function countSel() { return S.sel ? gather(S.sel).cells.filter(([, , dz]) => dz === 0).length : 0; }

const sel = {
  copy() {
    if (!S.sel) return;
    S.clip = gather(S.sel);
    status(`${S.clip.cells.length} bloc${S.clip.cells.length > 1 ? 's' : ''} copié${S.clip.cells.length > 1 ? 's' : ''}.`);
    refreshSelUI();
  },
  paste() {
    if (!S.clip) return;
    startPaste(clone(S.clip), false);
  },
  move() {
    if (!S.sel) return;
    pushHist();
    const buf = gather(S.sel, true);
    S.clip = clone(buf);
    const at = { x: S.sel.x0, y: S.sel.y0 };
    startPaste(buf, true, at);
    changed(false);
  },
  duplicate() {
    if (!S.sel) return;
    pushHist();
    const buf = gather(S.sel), { x0, y0, x1, y1 } = S.sel, W = S.world;
    let ax = x1 + 1, ay = y0;
    if (ax + buf.w > W.w) { ax = x0; ay = y1 + 1; }
    if (ay + buf.h > W.h) { ax = Math.min(x0 + 1, W.w - buf.w); ay = Math.min(y0 + 1, W.h - buf.h); }
    place(buf, ax, ay);
    S.sel = { x0: ax, y0: ay, x1: Math.min(W.w - 1, ax + buf.w - 1), y1: Math.min(W.h - 1, ay + buf.h - 1) };
    refreshSelUI(); changed(); status('Dupliqué. Tu peux déplacer la copie.');
  },
  turn(op) {
    if (S.paste) { S.paste.buf = transform(S.paste.buf, op); draw(); return; }
    if (!S.sel) return;
    pushHist();
    const buf = transform(gather(S.sel, true), op), W = S.world;
    const ax = Math.min(S.sel.x0, W.w - buf.w), ay = Math.min(S.sel.y0, W.h - buf.h);
    place(buf, Math.max(0, ax), Math.max(0, ay));
    S.sel = { x0: Math.max(0, ax), y0: Math.max(0, ay), x1: Math.max(0, ax) + buf.w - 1, y1: Math.max(0, ay) + buf.h - 1 };
    refreshSelUI(); changed();
  },
  remove() {
    if (!S.sel) return;
    pushHist(); gather(S.sel, true);
    S.sel = null; refreshSelUI(); changed();
  },
  clear() { S.sel = null; refreshSelUI(); draw(); },
};

function startPaste(buf, move, at) {
  S.paste = { buf, move };
  S.pasteAt = at || (S.sel ? { x: Math.min(S.sel.x1 + 1, S.world.w - 1), y: S.sel.y0 } : { x: 0, y: 0 });
  S.sel = null;
  setTouch(); refreshSelUI(); draw();
  status(move ? 'Touche l’endroit où déplacer (coin en haut à gauche).' : 'Touche l’endroit où coller. Tu peux coller plusieurs fois.');
}

function endPaste(cancel = false) {
  const p = S.paste; if (!p) return;
  S.paste = null; S.pasteAt = null;
  if (cancel && p.move) { // annuler un déplacement = remettre les blocs
    if (S.hist.length) restore(S.hist.pop());
    status('Déplacement annulé.');
  } else status('');
  setTouch(); refreshSelUI(); draw();
}

function pasteAt(p) {
  const buf = S.paste.buf;
  const ax = Math.min(p.x, S.world.w - buf.w), ay = Math.min(p.y, S.world.h - buf.h);
  if (!S.paste.move) pushHist();
  place(buf, Math.max(0, ax), Math.max(0, ay));
  const rect = { x0: Math.max(0, ax), y0: Math.max(0, ay), x1: Math.max(0, ax) + buf.w - 1, y1: Math.max(0, ay) + buf.h - 1 };
  if (S.paste.move) { S.paste = null; S.pasteAt = null; S.sel = rect; setTouch(); status('Déplacé.'); }
  else { S.pasteAt = { x: rect.x0, y: rect.y0 }; status('Collé. Touche ailleurs pour coller encore, ou Terminer.'); }
  refreshSelUI(); changed();
}

// Barre d'actions de la sélection
const selbar = $('#selbar');
function refreshSelUI() {
  if (S.sel && (S.sel.x1 >= S.world.w || S.sel.y1 >= S.world.h)) S.sel = null;
  if (S.paste) {
    selbar.hidden = false;
    selbar.innerHTML = `<span class="sb-label">${S.paste.move ? 'Déplacer' : 'Coller'} · ${S.paste.buf.cells.length} bloc${S.paste.buf.cells.length > 1 ? 's' : ''}</span>
      <button data-s="rot" title="Tourner (R)">↻</button><button data-s="flip" title="Retourner (F)">⇋</button>
      <button data-s="done" class="sb-ok">${S.paste.move ? 'Annuler' : 'Terminer'}</button>`;
  } else if (S.sel && ['select', 'zone'].includes(S.tool)) {
    const n = countSel();
    const single = isSingle();
    if (single && n === 0) { selbar.hidden = true; } else {
      selbar.hidden = false;
      selbar.innerHTML = `<span class="sb-label">${single ? '1 bloc' : `${n} bloc${n > 1 ? 's' : ''} · ${S.sel.x1 - S.sel.x0 + 1}×${S.sel.y1 - S.sel.y0 + 1}`}</span>
        <button data-s="copy" title="Copier (Ctrl+C)">Copier</button>
        <button data-s="paste" title="Coller (Ctrl+V)" ${S.clip ? '' : 'disabled'}>Coller</button>
        <button data-s="move" title="Déplacer (Ctrl+X)">Déplacer</button>
        <button data-s="dup" title="Dupliquer (Ctrl+D)">Dupliquer</button>
        <button data-s="rot" title="Tourner (R)">↻</button>
        <button data-s="flip" title="Retourner (F)">⇋</button>
        <button data-s="del" class="sb-del" title="Supprimer (Suppr)">🗑</button>
        ${S.mode === 'advanced' ? `<label class="sb-check"><input type="checkbox" data-s="all" ${S.allLayers ? 'checked' : ''}> Tous les étages</label>` : ''}
        <button data-s="x" title="Désélectionner (Échap)">✕</button>`;
    }
  } else if (S.clip && ['select', 'zone'].includes(S.tool)) {
    selbar.hidden = false;
    selbar.innerHTML = `<span class="sb-label">Presse-papiers : ${S.clip.cells.length} bloc${S.clip.cells.length > 1 ? 's' : ''}</span><button data-s="paste">Coller</button>`;
  } else selbar.hidden = true;
  if (S.sel && !S.paste && (!isSingle() || S.world.get(S.sel.x0, S.sel.y0, L()))) openInspector(); else closeInspector();
}
selbar.addEventListener('click', e => {
  const b = e.target.closest('button[data-s]'); if (!b) return;
  ({ copy: sel.copy, paste: sel.paste, move: sel.move, dup: sel.duplicate, rot: () => sel.turn('rot'), flip: () => sel.turn('flip'),
     del: sel.remove, x: sel.clear, done: () => endPaste(true) })[b.dataset.s]?.();
});
selbar.addEventListener('change', e => { if (e.target.dataset.s === 'all') { S.allLayers = e.target.checked; refreshSelUI(); } });

// ---------- Étages ----------
function updateLayerUI() {
  const box = $('#layers');
  box.hidden = S.mode !== 'advanced';
  $('#layerVal').textContent = S.layer > 0 ? '+' + S.layer : String(S.layer);
  const n = [...S.world.each()].filter(([, , z]) => z === S.layer).length;
  $('#layerCount').textContent = n + ' bloc' + (n > 1 ? 's' : '');
}
function setLayer(z) {
  S.layer = Math.max(ZMIN, Math.min(ZMAX, z));
  if (!isSingle()) S.sel = null;
  updateLayerUI(); refreshSelUI(); draw();
}
$('#layerUp').onclick = () => setLayer(S.layer + 1);
$('#layerDown').onclick = () => setLayer(S.layer - 1);

function setMode(m) {
  S.mode = m; S.layer = 0; S.sel = null;
  updateLayerUI(); refreshSelUI(); changed();
  if (m === 'advanced') status('Mode Avancé : change d’étage avec ▲ ▼. L’étage du dessous apparaît en transparence.');
  else {
    const other = [...S.world.each()].some(([x, y, z]) => z !== 0 && !(z === -1 && S.world.get(x, y, 0)?.type === 'note'));
    status(other ? 'Mode Simple : des blocs restent sur d’autres étages; ils fonctionnent toujours mais sont cachés.' : 'Mode Simple : un seul étage, empilement automatique.');
  }
}

// ---------- Interaction avec le plan ----------
function cellAt(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / S.size), y = Math.floor((e.clientY - r.top) / S.size);
  return S.world.inside(x, y) ? { x, y } : null;
}

let drag = null, gesture = null;
const touches = new Map(); // doigts posés : id -> { x, y }

// Zoom en gardant le point (cx, cy) de l'écran au même endroit
function zoomAt(size, cx, cy) {
  size = Math.max(16, Math.min(96, Math.round(size)));
  if (size === S.size) return;
  const r = wrap.getBoundingClientRect(), P = pad();
  const wx = (view.x + cx - r.left - P.x) / S.size, wy = (view.y + cy - r.top - P.y) / S.size;
  S.size = size; resize();
  scrollToWorld(wx, wy, cx - r.left, cy - r.top);
}

function twoFingers() {
  const [a, b] = [...touches.values()];
  return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
}
function startGesture() {
  const f = twoFingers();
  gesture = { ...f, sl: view.x, st: view.y, size: S.size };
}

canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // pas de défilement auto (Windows)
canvas.addEventListener('pointerdown', e => {
  audio();
  if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // Deuxième doigt : on annule le geste en cours et on passe en déplacement / zoom
  if (touches.size >= 2) {
    if (drag?.painting && S.hist.length) restore(S.hist.pop());
    if (drag?.zone) { S.sel = drag.prevSel || null; refreshSelUI(); }
    drag = null; startGesture(); draw(); return;
  }
  canvas.setPointerCapture(e.pointerId);
  // Molette enfoncée : déplacer le terrain
  if (e.button === 1) { e.preventDefault(); drag = { pan: true, sx: e.clientX, sy: e.clientY, sl: view.x, st: view.y }; canvas.style.cursor = 'grabbing'; return; }
  const p = cellAt(e); if (!p) return;
  if (e.button === 2) { e.preventDefault(); if (!S.paste) { pushHist(); applyTool('erase', p, false); changed(); } return; }
  // Sélection et collage : toucher = agir, glisser = déplacer le terrain
  if (S.paste || S.tool === 'select') { drag = { tap: true, moved: false, sx: e.clientX, sy: e.clientY, sl: view.x, st: view.y }; return; }
  if (S.tool === 'zone') { drag = { zone: true, start: p, prevSel: S.sel }; S.sel = normRect(p, p); refreshSelUI(); draw(); return; }
  pushHist();
  drag = { last: p, painting: true };
  applyTool(S.tool, p, false);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture) {
    if (touches.size < 2) return;
    const f = twoFingers();
    const ratio = f.d / gesture.d;
    if (Math.abs(ratio - 1) > 0.06) { zoomAt(gesture.size * ratio, f.mx, f.my); startGesture(); return; }
    view.x = gesture.sl - (f.mx - gesture.mx);
    view.y = gesture.st - (f.my - gesture.my);
    return;
  }
  if (drag?.pan) { view.x = drag.sl - (e.clientX - drag.sx); view.y = drag.st - (e.clientY - drag.sy); return; }
  const p = cellAt(e);
  if (e.pointerType === 'mouse') {
    const old = S.hover; S.hover = p;
    if (S.paste && p) S.pasteAt = p;
    if (!old || !p || old.x !== p.x || old.y !== p.y) draw();
  }
  if (!drag) return;
  if (drag.tap) {
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
    if (drag.moved) { view.x = drag.sl - (e.clientX - drag.sx); view.y = drag.st - (e.clientY - drag.sy); }
    return;
  }
  if (!p) return;
  if (drag.zone) { S.sel = normRect(drag.start, p); draw(); return; }
  if (drag.painting) {
    if (p.x === drag.last.x && p.y === drag.last.y) return;
    if (['dust', 'erase'].includes(S.tool) || S.tool.startsWith('mat:')) applyTool(S.tool, p, true);
    drag.last = p;
  }
});
function endPointer(e, cancelled) {
  touches.delete(e.pointerId);
  if (gesture) { if (touches.size < 2) { gesture = null; drag = null; } return; }
  if (drag?.pan) { drag = null; canvas.style.cursor = ''; return; }
  const p = cancelled ? null : cellAt(e);
  if (drag?.tap && !drag.moved && p) { if (S.paste) pasteAt(p); else selectAt(p); }
  if (drag?.zone) { refreshSelUI(); draw(); }
  if (drag?.painting) changed();
  drag = null;
}
canvas.addEventListener('pointerup', e => endPointer(e, false));
canvas.addEventListener('pointercancel', e => endPointer(e, true));
// Dans la marge autour du terrain : glisser déplace toujours la vue
let padPan = null;
const padEl = $('#stagePad');
padEl.style.touchAction = 'none';
padEl.addEventListener('pointerdown', e => {
  if (e.target === canvas) return;
  padEl.setPointerCapture(e.pointerId);
  padPan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, sl: view.x, st: view.y, moved: false };
});
padEl.addEventListener('pointermove', e => {
  if (!padPan || e.pointerId !== padPan.id) return;
  view.x = padPan.sl - (e.clientX - padPan.sx); view.y = padPan.st - (e.clientY - padPan.sy);
});
const endPad = e => {
  if (!padPan || e.pointerId !== padPan.id) return;
  const tap = Math.hypot(e.clientX - padPan.sx, e.clientY - padPan.sy) < 8;
  padPan = null;
  if (tap && S.sel && ['select', 'zone'].includes(S.tool) && !S.paste) { S.sel = null; refreshSelUI(); draw(); } // toucher le vide = désélectionner
};
padEl.addEventListener('pointerup', endPad);
padEl.addEventListener('pointercancel', endPad);

// Molette : zoom vers la souris. Pavé tactile : deux doigts = déplacer, pincer = zoomer.
wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1; // lignes / pages -> pixels
  const dx = e.deltaX * k, dy = e.deltaY * k;
  if (!e.ctrlKey && Math.abs(dx) > 0.5) { view.x += dx; view.y += dy; return; } // glissement du pavé tactile
  zoomAt(S.size * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
}, { passive: false });
canvas.addEventListener('pointerleave', () => { if (S.hover) { S.hover = null; draw(); } });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function selectAt(p) {
  const z = L(), c = S.world.get(p.x, p.y, z);
  if (c && c.type === 'lever') { pushHist(); c.on = !c.on; if (!S.running) setRunning(true); changed(); }
  else if (c && c.type === 'button') { S.sim.pressButton(p.x, p.y, z); if (!S.running) setRunning(true); }
  else if (c && c.type === 'note') previewNote(p.x, p.y, z);
  S.sel = c ? { x0: p.x, y0: p.y, x1: p.x, y1: p.y } : null;
  refreshSelUI(); draw();
}

function selectOne(p) { S.sel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; refreshSelUI(); }

function applyTool(tool, p, dragging) {
  const W = S.world, z = L(), c = W.get(p.x, p.y, z);
  if (tool === 'erase') {
    if (c) {
      W.del(p.x, p.y, z);
      // Mode Simple : effacer un bloc musical efface aussi son bloc dessous
      if (S.mode === 'simple' && c.type === 'note') W.del(p.x, p.y, z - 1);
      if (S.sel && isSingle() && S.sel.x0 === p.x && S.sel.y0 === p.y) { S.sel = null; refreshSelUI(); }
    }
    draw(); return;
  }
  if (tool.startsWith('mat:')) {
    const id = tool.slice(4);
    if (c && c.type === 'note') { W.set(p.x, p.y, z - 1, { type: 'solid', mat: id }); S.lastBelow = id; previewNote(p.x, p.y, z); selectOne(p); }
    else if (c && c.type === 'solid') c.mat = id;
    else if (!c) W.set(p.x, p.y, z, { type: 'solid', mat: id });
    draw(); return;
  }
  if (c) {
    if (dragging) return;
    if (tool === 'note' && c.type === 'solid') {
      // Empilement : le matériau passe dessous, le bloc musical se pose dessus
      if (!W.get(p.x, p.y, z - 1)) W.set(p.x, p.y, z - 1, c);
      W.set(p.x, p.y, z, { type: 'note', clicks: 0 });
      previewNote(p.x, p.y, z);
    }
    else if (tool === 'repeater' && c.type === 'repeater') { c.dir = (c.dir + 1) % 4; S.rot = c.dir; updateRotate(); }
    else if (tool === 'torch' && c.type === 'torch') { c.dir = c.dir === 5 ? 0 : c.dir === 3 ? 5 : c.dir + 1; }
    else if (tool === 'lever' && c.type === 'lever') { c.on = !c.on; }
    selectOne(p); draw(); return;
  }
  const n = ghostCell(p.x, p.y); if (!n) return;
  W.set(p.x, p.y, z, n);
  if (n.type === 'note') {
    if (S.lastBelow && !W.get(p.x, p.y, z - 1) && S.mode === 'simple') W.set(p.x, p.y, z - 1, { type: 'solid', mat: S.lastBelow });
    previewNote(p.x, p.y, z); selectOne(p);
  }
  else if (!dragging && n.type !== 'dust') selectOne(p);
  draw();
}

// ---------- Inspecteur ----------
const insp = $('#inspector');
function closeInspector() { if (!insp.hidden) { insp.hidden = true; insp.innerHTML = ''; } }

// ---------- Inspecteur de sélection multiple ----------
function selCells(type) {
  const out = [], z = L(), r = S.sel; if (!r) return out;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const c = S.world.get(x, y, z); if (c && c.type === type) out.push({ x, y, z, c });
  }
  return out;
}

function playChord(notes) {
  for (const n of notes.slice(0, 10)) { const i = instrAt(n.x, n.y, n.z); playNote(i, midiFor(i, n.c.clicks)); }
}

function openMulti() {
  const notes = selCells('note'), reps = selCells('repeater');
  if (!notes.length && !reps.length) return closeInspector();
  insp.hidden = false;
  let h = `<h3><span>Sélection multiple</span><button data-x="close" aria-label="Fermer">✕</button></h3>`;
  if (notes.length) {
    const clicks = notes.map(n => n.c.clicks || 0), lo = Math.min(...clicks), hi = Math.max(...clicks);
    const instrs = [...new Set(notes.map(n => instrAt(n.x, n.y, n.z)))];
    const one = instrs.length === 1 ? instrs[0] : null;
    const range = one ? `${noteName(midiFor(one, lo), S.prefs.lang)} à ${noteName(midiFor(one, hi), S.prefs.lang)}` : `${lo} à ${hi} clics`;
    const base = INSTRUMENTS[one || 'harp'].base;
    h += `<div class="bignote">${notes.length} bloc${notes.length > 1 ? 's' : ''} musica${notes.length > 1 ? 'ux' : 'l'}</div>
      <div class="sub">${one ? INSTRUMENTS[one].name : instrs.length + ' instruments'} · ${range}</div>
      <label class="field">Transposer (garde les intervalles)</label>
      <div class="row">
        <button class="chip" data-m="tr" data-v="-12" ${lo < 12 ? 'disabled' : ''}>−8ve</button>
        <button class="chip" data-m="tr" data-v="-1" ${lo < 1 ? 'disabled' : ''}>−½ ton</button>
        <button class="chip" data-m="tr" data-v="1" ${hi > 23 ? 'disabled' : ''}>+½ ton</button>
        <button class="chip" data-m="tr" data-v="12" ${hi > 12 ? 'disabled' : ''}>+8ve</button>
      </div>
      <p class="hint" style="margin-top:6px">Possible : de −${lo} à +${24 - hi} demi-tons.</p>
      <label class="field">Mettre toutes à la même note${one ? '' : ' (clics)'}</label>
      <div class="pitchgrid">${Array.from({ length: 25 }, (_, i) => {
        const nm = noteName(base + i, S.prefs.lang);
        const all = lo === hi && lo === i;
        return `<button data-m="set" data-v="${i}" class="${nm.includes('♯') ? 'sharp' : ''} ${all ? 'on' : ''}">${one ? nm : i}<small>${one ? i : ''}</small></button>`;
      }).join('')}</div>
      <label class="field">Bloc dessous de toutes (instrument)</label>
      <select data-m="below">
        <option value="_keep" selected>— garder tel quel —</option>
        <option value="">Rien / terre — Harpe</option>
        ${MATERIALS.filter(m => m.id !== 'dirt').map(m => `<option value="${m.id}">${m.name} — ${INSTRUMENTS[m.instr].name}</option>`).join('')}
      </select>
      <button class="btn-main" data-m="hear">♪ Écouter ensemble</button>`;
  }
  if (reps.length) {
    const ds = new Set(reps.map(r => r.c.delay || 1));
    h += `<label class="field">Délai des ${reps.length} répéteur${reps.length > 1 ? 's' : ''}</label>
      <div class="row">${[1, 2, 3, 4].map(d => `<button class="chip ${ds.size === 1 && ds.has(d) ? 'on' : ''}" data-m="delay" data-v="${d}">${d} tick${d > 1 ? 's' : ''}</button>`).join('')}</div>`;
  }
  h += `<p class="hint">Les changements touchent ${S.mode === 'advanced' ? 'l’étage affiché' : 'tous les blocs encadrés'}. Annulable avec ↶.</p>`;
  insp.innerHTML = h;
}

function multiAction(act, v) {
  const notes = selCells('note');
  if (act === 'hear') { playChord(notes); return; }
  pushHist();
  if (act === 'tr') {
    const d = +v;
    if (notes.some(n => (n.c.clicks || 0) + d < 0 || (n.c.clicks || 0) + d > 24)) { S.hist.pop(); status('Impossible : certaines notes sortiraient des deux octaves.'); return; }
    notes.forEach(n => { n.c.clicks = (n.c.clicks || 0) + d; });
    playChord(notes);
  } else if (act === 'set') {
    notes.forEach(n => { n.c.clicks = +v; });
    if (notes[0]) previewNote(notes[0].x, notes[0].y, notes[0].z);
  } else if (act === 'delay') {
    selCells('repeater').forEach(r => { r.c.delay = +v; });
  } else if (act === 'below') {
    if (v === '_keep') { S.hist.pop(); return; }
    notes.forEach(n => { if (v) S.world.set(n.x, n.y, n.z - 1, { type: 'solid', mat: v }); else S.world.del(n.x, n.y, n.z - 1); });
    if (v) S.lastBelow = v;
    playChord(notes);
  }
  openInspector(); changed();
}

function openInspector() {
  if (!S.sel) return closeInspector();
  if (!isSingle()) return openMulti();
  const x = S.sel.x0, y = S.sel.y0, z = L(), c = S.world.get(x, y, z);
  if (!c) return closeInspector();
  insp.hidden = false;
  const k = S.world.k(x, y, z);
  const head = (t) => `<h3><span>${t}</span><button data-x="close" aria-label="Fermer">✕</button></h3>`;
  let h = '';
  switch (c.type) {
    case 'note': {
      const below = S.world.get(x, y, z - 1);
      const instr = instrumentFromBelow(below), ins = INSTRUMENTS[instr], midi = midiFor(instr, c.clicks);
      const belowVal = below?.type === 'solid' ? below.mat : below ? '_other' : '';
      h = head('Bloc musical') +
        `<div class="bignote">${noteName(midi, S.prefs.lang)}</div>
         <div class="sub">${ins.name} · ${c.clicks || 0} clic${(c.clicks || 0) > 1 ? 's' : ''}</div>
         ${S.world.get(x, y, z + 1) ? '<p class="warn">⚠ Un bloc est posé au-dessus : ce bloc musical ne peut pas jouer.</p>' : ''}
         <div class="stepper"><button data-x="cl-">−</button><span>${c.clicks || 0} / 24</span><button data-x="cl+">+</button></div>
         <label class="field">Hauteur (25 notes, deux octaves)</label>
         <div class="pitchgrid">${Array.from({ length: 25 }, (_, i) => {
           const nm = noteName(ins.base + i, S.prefs.lang);
           return `<button data-x="pitch" data-v="${i}" class="${nm.includes('♯') ? 'sharp' : ''} ${i === (c.clicks || 0) ? 'on' : ''}">${nm}<small>${i}</small></button>`;
         }).join('')}</div>
         <label class="field">Bloc dessous (instrument)</label>
         <select data-x="below">
           <option value="" ${belowVal === '' ? 'selected' : ''}>Rien / terre — Harpe</option>
           ${belowVal === '_other' ? `<option value="_other" selected>Autre bloc — ${ins.name}</option>` : ''}
           ${MATERIALS.filter(m => m.id !== 'dirt').map(m => `<option value="${m.id}" ${m.id === belowVal ? 'selected' : ''}>${m.name} — ${INSTRUMENTS[m.instr].name}</option>`).join('')}
           <option value="dirt" ${belowVal === 'dirt' ? 'selected' : ''}>Terre (bloc) — Harpe</option>
         </select>
         <button class="btn-main" data-x="hear">♪ Écouter</button>
         <p class="hint">Dans le jeu : clic droit sur le bloc musical ${c.clicks || 0} fois.${ins.perc ? ' Les percussions changent de « grain » plutôt que de note.' : ''}</p>`;
      break;
    }
    case 'repeater':
      h = head('Répéteur') +
        `<label class="field">Délai</label>
         <div class="row">${[1, 2, 3, 4].map(d => `<button class="chip ${c.delay === d ? 'on' : ''}" data-x="delay" data-v="${d}">${d} tick${d > 1 ? 's' : ''}<br><small>${(d / 10).toFixed(1).replace('.', ',')} s</small></button>`).join('')}</div>
         <label class="field">Sortie vers</label>
         <div class="row">${[0, 1, 2, 3].map(d => `<button class="chip ${c.dir === d ? 'on' : ''}" data-x="dir" data-v="${d}">${ARROWS[d]}</button>`).join('')}</div>
         <p class="hint">État : entrée ${S.sim.repIn.has(k) ? 'alimentée' : 'éteinte'}, sortie ${S.sim.rep.get(k) ? 'active' : 'éteinte'}.<br>Dans le jeu : chaque clic droit ajoute 1 tick (0,1 s).</p>`;
      break;
    case 'torch':
      h = head('Torche de redstone') +
        `<label class="field">Accrochée</label>
         <div class="row">${[0, 1, 2, 3].map(d => `<button class="chip ${c.dir === d ? 'on' : ''}" data-x="dir" data-v="${d}">${ARROWS[d]} ${DIRS[d]}</button>`).join('')}
         <button class="chip wide ${c.dir === 5 || c.dir == null ? 'on' : ''}" data-x="dir" data-v="5">Posée au sol (sur le bloc dessous)</button></div>
         <p class="hint">${S.sim.isTorchLit(k) ? 'Allumée' : 'Éteinte'}. La torche s’éteint 1 tick après que son bloc support reçoit du courant : c’est un inverseur. Elle alimente fortement le bloc au-dessus d’elle.</p>`;
      break;
    case 'lever':
      h = head('Levier') + `<button class="btn-main" data-x="toggle">${c.on ? 'Mettre à OFF' : 'Mettre à ON'}</button>
        <p class="hint">Avec l’outil Sélection, touche le levier directement sur le plan pour l’actionner.</p>`;
      break;
    case 'button':
      h = head(c.kind === 'wood' ? 'Bouton de bois' : 'Bouton de pierre') +
        `<label class="field">Type</label>
         <div class="row"><button class="chip ${c.kind !== 'wood' ? 'on' : ''}" data-x="kind" data-v="stone">Pierre<br><small>1 s (10 ticks)</small></button>
         <button class="chip ${c.kind === 'wood' ? 'on' : ''}" data-x="kind" data-v="wood">Bois<br><small>1,5 s (15 ticks)</small></button></div>
         <button class="btn-main" data-x="press">Appuyer</button>`;
      break;
    case 'solid':
      h = head('Bloc plein') +
        `<label class="field">Matériau</label>
         <select data-x="mat">${MATERIALS.map(m => `<option value="${m.id}" ${m.id === c.mat ? 'selected' : ''}>${m.name}</option>`).join('')}</select>
         <p class="hint">${MAT[c.mat]?.cond ? 'Conducteur : il peut porter une torche et transmettre le courant aux composants voisins.' : 'Non conducteur (comme dans le jeu) : il ne transmet pas le courant.'}</p>`;
      break;
    case 'dust':
      h = head('Poussière de redstone') + `<div class="bignote">${S.sim.dust.get(k) || 0}</div><div class="sub">puissance du signal (0 à 15)</div>
        <p class="hint">Le signal perd 1 par bloc. La poussière alimente le bloc sous elle et les blocs vers lesquels elle pointe : une ligne qui passe à côté d’un bloc musical ne le fait pas jouer.${S.mode === 'advanced' ? ' Elle peut monter ou descendre d’un étage (▲ ▼), sauf si un bloc plein est posé au-dessus d’elle.' : ''}</p>`;
      break;
    case 'rblock':
      h = head('Bloc de redstone') + `<p class="hint">Source permanente de puissance 15 dans toutes les directions.</p>`;
      break;
  }
  if (S.mode === 'advanced') h += `<p class="hint">Étage ${z > 0 ? '+' + z : z}.</p>`;
  h += `<button class="danger" data-x="delete">Supprimer ce bloc</button>`;
  insp.innerHTML = h;
}

insp.addEventListener('click', e => {
  const m = e.target.closest('button[data-m]');
  if (m) { if (!m.disabled) multiAction(m.dataset.m, m.dataset.v); return; }
  const b = e.target.closest('[data-x]'); if (!b || b.tagName === 'SELECT') return;
  const act = b.dataset.x, v = b.dataset.v;
  if (act === 'close') { S.sel = null; refreshSelUI(); draw(); return; }
  const x = S.sel.x0, y = S.sel.y0, z = L(), c = S.world.get(x, y, z); if (!c) return;
  if (act === 'hear') { previewNote(x, y, z); return; }
  if (act === 'press') { S.sim.pressButton(x, y, z); if (!S.running) setRunning(true); return; }
  pushHist();
  switch (act) {
    case 'cl-': c.clicks = Math.max(0, (c.clicks || 0) - 1); previewNote(x, y, z); break;
    case 'cl+': c.clicks = ((c.clicks || 0) + 1) % 25; previewNote(x, y, z); break;
    case 'pitch': c.clicks = +v; previewNote(x, y, z); break;
    case 'delay': c.delay = +v; break;
    case 'dir': c.dir = +v; if (c.type === 'repeater') { S.rot = +v; updateRotate(); } break;
    case 'toggle': c.on = !c.on; break;
    case 'kind': c.kind = v; break;
    case 'delete':
      S.world.del(x, y, z);
      if (S.mode === 'simple' && c.type === 'note') S.world.del(x, y, z - 1);
      S.sel = null; refreshSelUI(); changed(); return;
  }
  openInspector(); changed();
});
insp.addEventListener('change', e => {
  const ms = e.target.closest('select[data-m]');
  if (ms) { multiAction(ms.dataset.m, ms.value); return; }
  const s = e.target.closest('select[data-x]'); if (!s || !S.sel) return;
  const x = S.sel.x0, y = S.sel.y0, z = L(), c = S.world.get(x, y, z); if (!c) return;
  if (s.value === '_other') return;
  pushHist();
  if (s.dataset.x === 'below') {
    if (s.value) { S.world.set(x, y, z - 1, { type: 'solid', mat: s.value }); S.lastBelow = s.value; }
    else { S.world.del(x, y, z - 1); S.lastBelow = null; }
    previewNote(x, y, z);
  }
  if (s.dataset.x === 'mat') c.mat = s.value;
  openInspector(); changed();
});

// ---------- Barre du haut ----------
function status(t) { $('#status').textContent = t; }

$('#projName').addEventListener('input', e => { S.name = e.target.value || 'Sans titre'; autosave(); });
$('#edition').addEventListener('change', e => {
  S.edition = e.target.value; changed();
  status(S.edition === 'bedrock' ? 'Bedrock (Bêta) : la simulation utilise pour l’instant les règles Java. Les différences arrivent avec les pistons.' : 'Java Edition sélectionnée.');
});
$('#mode').addEventListener('change', e => setMode(e.target.value));
$('#theme').innerHTML = Object.entries(THEMES).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');
$('#theme').addEventListener('change', e => { S.theme = e.target.value; changed(); });
const savePrefs = () => { store.set(PREFS, S.prefs); draw(); if (!insp.hidden) openInspector(); };
$('#lang').addEventListener('change', e => { S.prefs.lang = e.target.value; savePrefs(); });
$('#showNames').addEventListener('change', e => { S.prefs.showNames = e.target.checked; savePrefs(); });
$('#showPower').addEventListener('change', e => { S.prefs.showPower = e.target.checked; savePrefs(); });

document.querySelectorAll('details.menu').forEach(d => d.addEventListener('toggle', () => {
  if (d.open) document.querySelectorAll('details.menu').forEach(o => { if (o !== d) o.open = false; });
}));
document.addEventListener('pointerdown', e => {
  document.querySelectorAll('details.menu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
});

$('#fileMenu').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  $('#fileMenu').open = false;
  const act = b.dataset.act;
  if (act === 'new') newProject();
  if (act === 'open') openDialog();
  if (act === 'dup') { const d = projectData(); d.name = S.name + ' (copie)'; loadProject(d); status('Copie créée.'); }
  if (act === 'export') exportFile();
  if (act === 'import') $('#fileIn').click();
  if (act === 'demo') { loadProject(demoProject()); status('Exemple chargé : appuie sur ▶ ou touche le bouton de pierre.'); }
});

function exportFile() {
  const blob = new Blob([JSON.stringify(projectData(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (S.name || 'projet').replace(/[\\/:*?"<>|]+/g, '-') + '.cfm';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  status('Fichier exporté.');
}

$('#fileIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.world) throw new Error('format');
    loadProject(data); status(`« ${S.name} » importé.`);
  } catch { status('Ce fichier n’est pas un projet Composer valide.'); }
});

function openDialog() {
  const all = store.get(STORE, {});
  const list = Object.entries(all).sort((a, b) => b[1].updated - a[1].updated);
  const ul = $('#projList');
  ul.innerHTML = list.length ? '' : '<li class="muted">Aucun projet sauvegardé pour l’instant.</li>';
  for (const [id, p] of list) {
    const li = document.createElement('li'); if (id === S.id) li.className = 'cur';
    const d = new Date(p.updated).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' });
    li.innerHTML = `<span class="n"></span><span class="d">${d}</span><button type="button" data-o>Ouvrir</button><button type="button" data-d title="Supprimer">🗑</button>`;
    li.querySelector('.n').textContent = p.name;
    li.querySelector('[data-o]').onclick = () => { loadProject(p.data, id); $('#dlgOpen').close(); status(`« ${p.name} » ouvert.`); };
    li.querySelector('[data-d]').onclick = () => {
      if (!confirm(`Supprimer « ${p.name} » de cet appareil ?`)) return;
      const a = store.get(STORE, {}); delete a[id]; store.set(STORE, a); openDialog();
    };
    ul.appendChild(li);
  }
  if (!$('#dlgOpen').open) $('#dlgOpen').showModal();
}

$('#helpBtn').onclick = () => { $('#helpBody').innerHTML = helpHTML(); wireHelp($('#helpBody')); $('#dlgHelp').showModal(); $('#dlgHelp').scrollTop = 0; document.activeElement?.blur(); };
$('#undo').onclick = undo; $('#redo').onclick = redo;
const zoomCenter = d => { const r = wrap.getBoundingClientRect(); zoomAt(S.size + d, r.left + r.width / 2, r.top + r.height / 2); };
$('#zoomIn').onclick = () => zoomCenter(8);
$('#recenter').onclick = () => scrollToWorld();
$('#zoomOut').onclick = () => zoomCenter(-8);
$('#rotate').onclick = () => { S.rot = (S.rot + 1) % 4; updateRotate(); draw(); };

// ---------- Transport ----------
// ▶ depuis le début (tick 0) : appuie aussi sur tous les boutons, comme un départ.
$('#play').onclick = () => {
  audio();
  if (!S.running && S.sim.tick === 0) for (const [x, y, z, c] of S.world.each()) if (c.type === 'button') S.sim.pressButton(x, y, z);
  setRunning(!S.running);
};
$('#stop').onclick = () => { setRunning(false); S.sim.reset(); updateReadout(); draw(); if (!insp.hidden) openInspector(); };
$('#step').onclick = () => { setRunning(false); stepOnce(); if (!insp.hidden) openInspector(); };
$('#speed').onchange = e => { S.speed = +e.target.value; };

// ---------- Clavier ----------
document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea') || document.querySelector('dialog[open]')) return;
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && key === 'y') { e.preventDefault(); redo(); return; }
  if (mod && key === 'c') { e.preventDefault(); sel.copy(); return; }
  if (mod && key === 'x') { e.preventDefault(); sel.move(); return; }
  if (mod && key === 'v') { e.preventDefault(); sel.paste(); return; }
  if (mod && key === 'd') { e.preventDefault(); sel.duplicate(); return; }
  if (mod && key === 'a') { e.preventDefault(); setTool('zone'); S.sel = { x0: 0, y0: 0, x1: S.world.w - 1, y1: S.world.h - 1 }; refreshSelUI(); draw(); return; }
  if (e.key === ' ') { e.preventDefault(); $('#play').click(); }
  else if (e.key === '.') $('#step').click();
  else if (e.key === 'PageUp' || e.key === ']') { if (S.mode === 'advanced') setLayer(S.layer + 1); }
  else if (e.key === 'PageDown' || e.key === '[') { if (S.mode === 'advanced') setLayer(S.layer - 1); }
  else if (e.key === 'Escape') {
    if (S.paste) endPaste(true);
    else { S.sel = null; if (S.tool !== 'zone') setTool('select'); refreshSelUI(); draw(); }
  }
  else if (key === 'f') { if (S.paste || (S.sel && !isSingle())) sel.turn('flip'); }
  else if (key === 'r') {
    if (S.paste || (S.sel && !isSingle())) { sel.turn('rot'); return; }
    const c = S.sel && S.world.get(S.sel.x0, S.sel.y0, L());
    if (c && c.type === 'repeater') { pushHist(); c.dir = (c.dir + 1) % 4; openInspector(); changed(); }
    else if (c && c.type === 'torch') { pushHist(); c.dir = c.dir === 5 ? 0 : c.dir === 3 ? 5 : c.dir + 1; openInspector(); changed(); }
    else { S.rot = (S.rot + 1) % 4; updateRotate(); draw(); }
  }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) sel.remove();
});

// Redimensionnement de la fenêtre
window.addEventListener('resize', () => resize());

// ---------- Démarrage ----------
(function init() {
  buildPalette(); setTool('select');
  const all = store.get(STORE, {}), cur = store.get(CUR, null);
  if (cur && all[cur]) loadProject(all[cur].data, cur);
  else { loadProject(demoProject()); status('Bienvenue ! Un exemple est chargé : appuie sur ▶ ou touche le bouton de pierre.'); }
  requestAnimationFrame(loop);
})();
