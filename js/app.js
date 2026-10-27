import { MATERIALS, MAT, INSTRUMENTS, noteName, midiOf, instrumentOf } from './data.js';
import { World, Sim, DX, DY, isConductive } from './engine.js';
import { drawBackground, drawCell, iconCanvas, THEMES } from './render.js';
import { audio, playNote } from './sound.js';
import { helpHTML, wireHelp } from './guide.js';

const $ = s => document.querySelector(s);
const DIRS = ['Nord', 'Est', 'Sud', 'Ouest'];
const ARROWS = ['↑', '→', '↓', '←'];
const STORE = 'cfm.projects', CUR = 'cfm.current', PREFS = 'cfm.prefs';

// ---------- Stockage local (protégé : peut être indisponible) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

// ---------- État ----------
const S = {
  id: null, name: 'Sans titre', edition: 'java', theme: 'tableau',
  world: new World(48, 28), sim: null,
  tool: 'select', rot: 1, lastBelow: 'dirt',
  sel: null, hover: null, size: 44,
  running: false, speed: 1, audioT: 0,
  hist: [], fut: [], tab: 'redstone',
  prefs: Object.assign({ lang: 'fr', showNames: true, showPower: false }, store.get(PREFS, {})),
};

const canvas = $('#stage'), g = canvas.getContext('2d'), wrap = $('#stageWrap');

// ---------- Palette ----------
const PALETTE = {
  outils: { label: 'Outils', items: [
    { id: 'select', name: 'Sélection / jouer', draw: (c, s) => { c.fillStyle = '#ffd34d'; c.beginPath(); c.moveTo(s * .3, s * .15); c.lineTo(s * .3, s * .8); c.lineTo(s * .45, s * .65); c.lineTo(s * .58, s * .88); c.lineTo(s * .68, s * .83); c.lineTo(s * .55, s * .6); c.lineTo(s * .75, s * .6); c.closePath(); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke(); } },
    { id: 'erase', name: 'Gomme', draw: (c, s) => { c.save(); c.translate(s / 2, s / 2); c.rotate(-0.6); c.fillStyle = '#ff8fa0'; c.fillRect(-s * .3, -s * .14, s * .38, s * .28); c.fillStyle = '#e7e7e7'; c.fillRect(s * .08, -s * .14, s * .22, s * .28); c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(-s * .3, -s * .14, s * .6, s * .28); c.restore(); } },
  ] },
  musique: { label: 'Musique', items: [
    { id: 'note', name: 'Bloc musical', cell: { type: 'note', below: 'dirt', clicks: 0 } },
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
    { id: 'soon:piston', name: 'Piston', soon: true, draw: (c, s) => { c.fillStyle = '#9a9a9a'; c.fillRect(s * .1, s * .3, s * .8, s * .6); c.fillStyle = '#b08850'; c.fillRect(s * .1, s * .1, s * .8, s * .22); c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(s * .1, s * .1, s * .8, s * .8); } },
    { id: 'soon:sticky', name: 'Piston collant', soon: true, draw: (c, s) => { c.fillStyle = '#9a9a9a'; c.fillRect(s * .1, s * .3, s * .8, s * .6); c.fillStyle = '#7cc46a'; c.fillRect(s * .1, s * .1, s * .8, s * .22); c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(s * .1, s * .1, s * .8, s * .8); } },
    { id: 'soon:slime', name: 'Bloc de slime', soon: true, draw: (c, s) => { c.fillStyle = '#7cc46a'; c.fillRect(s * .1, s * .1, s * .8, s * .8); c.fillStyle = '#5a9e4b'; c.fillRect(s * .3, s * .3, s * .4, s * .4); c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(s * .1, s * .1, s * .8, s * .8); } },
    { id: 'soon:cmd', name: 'Bloc de commande', soon: true, draw: (c, s) => { c.fillStyle = '#c47a3c'; c.fillRect(s * .1, s * .1, s * .8, s * .8); c.fillStyle = '#e8e8e8'; c.fillRect(s * .3, s * .3, s * .4, s * .4); c.fillStyle = '#333'; c.font = `700 ${s * .26}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('/', s / 2, s / 2); c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(s * .1, s * .1, s * .8, s * .8); } },
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

function setTool(id) {
  S.tool = id;
  wrap.style.touchAction = id === 'select' ? 'auto' : 'none';
  canvas.style.touchAction = wrap.style.touchAction;
  buildPalette();
  const hints = {
    select: 'Touche un bloc pour le régler. Touche un levier ou un bouton pour l’actionner.',
    erase: 'Touche ou glisse pour effacer.',
    note: 'Pose un bloc musical, puis choisis sa note dans le panneau de réglage.',
    dust: 'Glisse pour tracer une ligne de poussière.',
    repeater: 'La flèche indique la sortie. Retouche un répéteur pour le tourner.',
    torch: 'Pose la torche à côté d’un bloc plein : elle s’y accroche.',
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
function restore(json) { const w = World.fromJSON(JSON.parse(json)); S.world.cells = w.cells; S.sel = null; closeInspector(); changed(false); }
function undo() { if (!S.hist.length) return; S.fut.push(snapshot()); restore(S.hist.pop()); }
function redo() { if (!S.fut.length) return; S.hist.push(snapshot()); restore(S.fut.pop()); }

// ---------- Projets ----------
function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function projectData() {
  return { app: 'composer-for-minecraft', version: 1, name: S.name, edition: S.edition, theme: S.theme, world: S.world.toJSON() };
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
  S.id = id || newId();
  S.name = data.name || 'Sans titre';
  S.edition = data.edition || 'java';
  S.theme = THEMES[data.theme] ? data.theme : 'tableau';
  S.world = World.fromJSON(data.world || {});
  S.hist = []; S.fut = []; S.sel = null; closeInspector();
  S.sim = new Sim(S.world, onNote);
  setRunning(false);
  syncControls(); resize(); changed(true);
}
function newProject() {
  loadProject({ name: 'Sans titre', world: { w: 48, h: 28, cells: [] } });
  status('Nouveau projet créé.');
}

function syncControls() {
  $('#projName').value = S.name;
  $('#edition').value = S.edition;
  $('#theme').value = S.theme;
  $('#lang').value = S.prefs.lang;
  $('#showNames').checked = S.prefs.showNames;
  $('#showPower').checked = S.prefs.showPower;
}

function changed(save = true) { if (save) autosave(); draw(); }

// ---------- Démo ----------
function demoProject() {
  const w = new World(48, 28);
  const y = 6; let x = 2;
  // Do Do Do Ré Mi(blanche) Ré(blanche) Do Mi Ré Ré Do(ronde) — chaque noire = 4 ticks (noire = 150)
  const melody = [[6, 4], [6, 4], [6, 4], [8, 4], [10, 8], [8, 8], [6, 4], [10, 4], [8, 4], [8, 4], [6, 0]];
  w.set(x++, y, { type: 'button', kind: 'stone' });
  w.set(x++, y, { type: 'repeater', dir: 1, delay: 1 });
  melody.forEach(([clicks, dur]) => {
    w.set(x++, y, { type: 'note', clicks, below: 'dirt' });
    for (let left = dur; left > 0; left -= 4) w.set(x++, y, { type: 'repeater', dir: 1, delay: Math.min(4, left) });
  });
  // Petite basse en parallèle : planches de bois sous les blocs musicaux
  return { name: 'Au clair de la lune', edition: 'java', theme: 'gazon', world: w.toJSON() };
}

// ---------- Simulation & son ----------
function onNote(x, y, c) {
  const lead = Math.max(0, (S.audioT - audio().currentTime) * 1000);
  S.sim.flash.set(S.world.k(x, y), performance.now() + lead);
  playNote(instrumentOf(c), midiOf(c), S.audioT || 0);
}

function setRunning(on) {
  S.running = on;
  const b = $('#play');
  b.textContent = on ? '❚❚' : '▶';
  b.classList.toggle('paused', on);
  if (on) { S.audioT = audio().currentTime + 0.06; }
}

function stepOnce() {
  audio(); S.audioT = audio().currentTime + 0.02;
  S.sim.step(); updateReadout(); draw();
}

function loop() {
  if (S.running) {
    const ctx = audio();
    if (S.audioT < ctx.currentTime - 0.25) S.audioT = ctx.currentTime + 0.02; // rattrapage après une pause d'onglet
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
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = S.world.w * S.size, H = S.world.h * S.size;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function cellState(x, y, c, k) {
  const sim = S.sim, now = performance.now();
  const st = { lang: S.prefs.lang, showNames: S.prefs.showNames, showPower: S.prefs.showPower };
  switch (c.type) {
    case 'dust': st.level = sim.dust.get(k) || 0; st.pts = sim.dustPts.get(k)?.pts; break;
    case 'repeater': st.out = !!sim.rep.get(k); st.input = sim.repIn.has(k); break;
    case 'torch': st.lit = sim.isTorchLit(k); break;
    case 'button': st.on = sim.isButtonOn(k); break;
    case 'solid': st.powered = sim.powered.has(k); break;
    case 'note': {
      const t = sim.flash.get(k);
      st.flash = t != null && now >= t ? Math.max(0, 1 - (now - t) / 350) : 0;
      break;
    }
  }
  return st;
}

function draw() {
  const s = S.size, W = S.world;
  // Fond
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) drawBackground(g, S.theme, x, y, s);
  // Blocs
  for (const [x, y, c, k] of W.each()) drawCell(g, c, x, y, s, cellState(x, y, c, k));
  // Aperçu du bloc sous le pointeur
  const h = S.hover;
  if (h && !['select', 'erase'].includes(S.tool) && !W.get(h.x, h.y)) {
    const ghost = ghostCell(h.x, h.y);
    if (ghost) { g.save(); g.globalAlpha = 0.45; drawCell(g, ghost, h.x, h.y, s, { lit: true, pts: [1, 3], showNames: false }); g.restore(); }
  }
  if (h) { g.strokeStyle = S.tool === 'erase' ? '#ff6b5e' : 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.strokeRect(h.x * s + 1, h.y * s + 1, s - 2, s - 2); }
  // Sélection : contour double (noir + or) pour être visible sur tous les fonds
  if (S.sel) {
    const { x, y } = S.sel;
    g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
    g.lineWidth = 2.5; g.strokeStyle = '#ffd34d'; g.strokeRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
  }
}

function ghostCell(x, y) {
  const t = S.tool;
  if (t === 'note') return { type: 'note', below: S.lastBelow, clicks: 0 };
  if (t.startsWith('mat:')) return { type: 'solid', mat: t.slice(4) };
  if (t === 'dust') return { type: 'dust' };
  if (t === 'repeater') return { type: 'repeater', dir: S.rot, delay: 1 };
  if (t === 'torch') return { type: 'torch', dir: torchAttach(x, y) };
  if (t === 'lever') return { type: 'lever', on: false };
  if (t.startsWith('button:')) return { type: 'button', kind: t.slice(7) };
  if (t === 'rblock') return { type: 'rblock' };
  return null;
}

// La torche s'accroche au bloc plein voisin (en priorité dans le sens choisi)
function torchAttach(x, y) {
  const back = (S.rot + 2) % 4;
  for (const d of [back, S.rot, (S.rot + 1) % 4, (S.rot + 3) % 4]) if (isConductive(S.world.get(x + DX[d], y + DY[d]))) return d;
  return back;
}

// ---------- Interaction avec le plan ----------
function cellAt(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / S.size), y = Math.floor((e.clientY - r.top) / S.size);
  return S.world.inside(x, y) ? { x, y } : null;
}

let drag = null;
canvas.addEventListener('pointerdown', e => {
  audio();
  const p = cellAt(e); if (!p) return;
  if (e.button === 2) { e.preventDefault(); applyTool('erase', p, false); return; }
  if (S.tool === 'select') { drag = { start: p, moved: false, sx: e.clientX, sy: e.clientY }; return; }
  canvas.setPointerCapture(e.pointerId);
  pushHist();
  drag = { last: p, painting: true };
  applyTool(S.tool, p, false);
});
canvas.addEventListener('pointermove', e => {
  const p = cellAt(e);
  if (e.pointerType === 'mouse') { const old = S.hover; S.hover = p; if (!old || !p || old.x !== p.x || old.y !== p.y) draw(); }
  if (!drag || !p) return;
  if (drag.painting) {
    if (p.x === drag.last.x && p.y === drag.last.y) return;
    if (['dust', 'erase'].includes(S.tool) || S.tool.startsWith('mat:')) applyTool(S.tool, p, true);
    drag.last = p;
  } else if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
});
canvas.addEventListener('pointerup', e => {
  if (drag && !drag.painting && !drag.moved) { const p = cellAt(e); if (p) selectAt(p); }
  if (drag && drag.painting) changed();
  drag = null;
});
canvas.addEventListener('pointercancel', () => { if (drag && drag.painting) changed(); drag = null; });
canvas.addEventListener('pointerleave', () => { if (S.hover) { S.hover = null; draw(); } });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function selectAt(p) {
  const c = S.world.get(p.x, p.y);
  if (c && c.type === 'lever') { pushHist(); c.on = !c.on; if (!S.running) setRunning(true); changed(); }
  else if (c && c.type === 'button') { S.sim.pressButton(p.x, p.y); if (!S.running) setRunning(true); }
  else if (c && c.type === 'note') { previewNote(c); }
  S.sel = c ? p : null;
  c ? openInspector() : closeInspector();
  draw();
}

function applyTool(tool, p, dragging) {
  const W = S.world, c = W.get(p.x, p.y);
  if (tool === 'erase') { if (c) { W.del(p.x, p.y); if (S.sel && S.sel.x === p.x && S.sel.y === p.y) { S.sel = null; closeInspector(); } } draw(); return; }
  if (tool.startsWith('mat:')) {
    const id = tool.slice(4);
    if (c && c.type === 'note') { c.below = id; S.lastBelow = id; previewNote(c); S.sel = p; openInspector(); }
    else if (c && c.type === 'solid') c.mat = id;
    else if (!c) W.set(p.x, p.y, { type: 'solid', mat: id });
    draw(); return;
  }
  if (c) {
    if (dragging) return;
    if (tool === 'repeater' && c.type === 'repeater') { c.dir = (c.dir + 1) % 4; S.rot = c.dir; updateRotate(); }
    else if (tool === 'torch' && c.type === 'torch') { c.dir = (c.dir + 1) % 4; }
    else if (tool === 'lever' && c.type === 'lever') { c.on = !c.on; }
    S.sel = p; openInspector(); draw(); return;
  }
  const n = ghostCell(p.x, p.y); if (!n) return;
  W.set(p.x, p.y, n);
  if (n.type === 'note') { previewNote(n); S.sel = p; openInspector(); }
  else if (!dragging && n.type !== 'dust') { S.sel = p; openInspector(); }
  draw();
}

function previewNote(c) { playNote(instrumentOf(c), midiOf(c)); }

// ---------- Inspecteur ----------
const insp = $('#inspector');
function closeInspector() { insp.hidden = true; insp.innerHTML = ''; }

function openInspector() {
  if (!S.sel) return closeInspector();
  const { x, y } = S.sel, c = S.world.get(x, y);
  if (!c) return closeInspector();
  insp.hidden = false;
  const k = S.world.k(x, y);
  const head = (t) => `<h3><span>${t}</span><button data-x="close" aria-label="Fermer">✕</button></h3>`;
  let h = '';
  switch (c.type) {
    case 'note': {
      const ins = INSTRUMENTS[instrumentOf(c)], midi = midiOf(c);
      h = head('Bloc musical') +
        `<div class="bignote">${noteName(midi, S.prefs.lang)}</div>
         <div class="sub">${ins.name} · ${c.clicks || 0} clic${(c.clicks || 0) > 1 ? 's' : ''}</div>
         <div class="stepper"><button data-x="cl-">−</button><span>${c.clicks || 0} / 24</span><button data-x="cl+">+</button></div>
         <label class="field">Hauteur (25 notes, deux octaves)</label>
         <div class="pitchgrid">${Array.from({ length: 25 }, (_, i) => {
           const m = ins.base + i, nm = noteName(m, S.prefs.lang);
           return `<button data-x="pitch" data-v="${i}" class="${nm.includes('♯') ? 'sharp' : ''} ${i === (c.clicks || 0) ? 'on' : ''}">${nm}<small>${i}</small></button>`;
         }).join('')}</div>
         <label class="field">Bloc dessous (instrument)</label>
         <select data-x="below">${MATERIALS.map(m => `<option value="${m.id}" ${m.id === (c.below || 'dirt') ? 'selected' : ''}>${m.name} — ${INSTRUMENTS[m.instr].name}</option>`).join('')}</select>
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
        `<label class="field">Accrochée au bloc situé</label>
         <div class="row">${[0, 1, 2, 3].map(d => `<button class="chip ${c.dir === d ? 'on' : ''}" data-x="dir" data-v="${d}">${ARROWS[d]} ${DIRS[d]}</button>`).join('')}</div>
         <p class="hint">${S.sim.isTorchLit(k) ? 'Allumée' : 'Éteinte'}. La torche s’éteint 1 tick après que son bloc support reçoit du courant : c’est un inverseur.</p>`;
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
        <p class="hint">Le signal perd 1 par bloc. La poussière n’alimente que les blocs vers lesquels elle pointe : une ligne qui passe à côté d’un bloc musical ne le fait pas jouer.</p>`;
      break;
    case 'rblock':
      h = head('Bloc de redstone') + `<p class="hint">Source permanente de puissance 15 dans toutes les directions.</p>`;
      break;
  }
  h += `<button class="danger" data-x="delete">Supprimer ce bloc</button>`;
  insp.innerHTML = h;
}

insp.addEventListener('click', e => {
  const b = e.target.closest('[data-x]'); if (!b || b.tagName === 'SELECT') return;
  const act = b.dataset.x, v = b.dataset.v;
  if (act === 'close') { S.sel = null; closeInspector(); draw(); return; }
  const { x, y } = S.sel, c = S.world.get(x, y); if (!c) return;
  if (act === 'hear') { previewNote(c); return; }
  if (act === 'press') { S.sim.pressButton(x, y); if (!S.running) setRunning(true); return; }
  pushHist();
  switch (act) {
    case 'cl-': c.clicks = Math.max(0, (c.clicks || 0) - 1); previewNote(c); break;
    case 'cl+': c.clicks = ((c.clicks || 0) + 1) % 25; previewNote(c); break;
    case 'pitch': c.clicks = +v; previewNote(c); break;
    case 'delay': c.delay = +v; break;
    case 'dir': c.dir = +v; if (c.type === 'repeater') { S.rot = +v; updateRotate(); } break;
    case 'toggle': c.on = !c.on; break;
    case 'kind': c.kind = v; break;
    case 'delete': S.world.del(x, y); S.sel = null; closeInspector(); changed(); return;
  }
  openInspector(); changed();
});
insp.addEventListener('change', e => {
  const sel = e.target.closest('select[data-x]'); if (!sel || !S.sel) return;
  const c = S.world.get(S.sel.x, S.sel.y); if (!c) return;
  pushHist();
  if (sel.dataset.x === 'below') { c.below = sel.value; S.lastBelow = sel.value; previewNote(c); }
  if (sel.dataset.x === 'mat') c.mat = sel.value;
  openInspector(); changed();
});

// ---------- Barre du haut ----------
function status(t) { $('#status').textContent = t; }

$('#projName').addEventListener('input', e => { S.name = e.target.value || 'Sans titre'; autosave(); });
$('#edition').addEventListener('change', e => {
  S.edition = e.target.value; changed();
  status(S.edition === 'bedrock' ? 'Bedrock (Bêta) : la simulation utilise pour l’instant les règles Java. Les différences arrivent avec les pistons.' : 'Java Edition sélectionnée.');
});
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
$('#zoomIn').onclick = () => { S.size = Math.min(80, S.size + 8); resize(); };
$('#zoomOut').onclick = () => { S.size = Math.max(24, S.size - 8); resize(); };
$('#rotate').onclick = () => { S.rot = (S.rot + 1) % 4; updateRotate(); draw(); };

// ---------- Transport ----------
// ▶ depuis le début (tick 0) : appuie aussi sur tous les boutons, comme un départ.
$('#play').onclick = () => {
  audio();
  if (!S.running && S.sim.tick === 0) for (const [x, y, c] of S.world.each()) if (c.type === 'button') S.sim.pressButton(x, y);
  setRunning(!S.running);
};
$('#stop').onclick = () => { setRunning(false); S.sim.reset(); updateReadout(); draw(); if (!insp.hidden) openInspector(); };
$('#step').onclick = () => { setRunning(false); stepOnce(); if (!insp.hidden) openInspector(); };
$('#speed').onchange = e => { S.speed = +e.target.value; };

// ---------- Clavier ----------
document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea') || document.querySelector('dialog[open]')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.key === ' ') { e.preventDefault(); $('#play').click(); }
  else if (e.key === '.') $('#step').click();
  else if (e.key === 'Escape') { setTool('select'); S.sel = null; closeInspector(); draw(); }
  else if (e.key.toLowerCase() === 'r') {
    const c = S.sel && S.world.get(S.sel.x, S.sel.y);
    if (c && (c.type === 'repeater' || c.type === 'torch')) { pushHist(); c.dir = (c.dir + 1) % 4; openInspector(); changed(); }
    else { S.rot = (S.rot + 1) % 4; updateRotate(); draw(); }
  }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { pushHist(); S.world.del(S.sel.x, S.sel.y); S.sel = null; closeInspector(); changed(); }
});

window.addEventListener('resize', () => draw());

// ---------- Démarrage ----------
(function init() {
  buildPalette(); setTool('select');
  const all = store.get(STORE, {}), cur = store.get(CUR, null);
  if (cur && all[cur]) loadProject(all[cur].data, cur);
  else { loadProject(demoProject()); status('Bienvenue ! Un exemple est chargé : appuie sur ▶ ou touche le bouton de pierre.'); }
  requestAnimationFrame(loop);
})();
