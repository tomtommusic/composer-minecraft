// Moteur de simulation de redstone, vue du dessus (une seule couche).
// Un pas = 1 tick de redstone = 0,1 seconde.
//
// Règles suivies (comportement de Java Edition) :
//  - Poussière : signal de 15 qui perd 1 par bloc. Elle alimente les blocs
//    vers lesquels elle « pointe » (un point isolé pointe dans les 4 directions,
//    une ligne pointe dans son axe, sinon seulement vers ses connexions).
//  - Répéteur : lit l'arrière, sort 15 vers l'avant après 1 à 4 ticks,
//    prolonge les impulsions trop courtes jusqu'à son délai, alimente fortement
//    le bloc devant lui.
//  - Torche (murale) : allumée par défaut, s'éteint 1 tick après que le bloc
//    qui la porte est alimenté. N'alimente pas le bloc qui la porte.
//  - Levier, bouton, bloc de redstone : sources de 15 tout autour.
//  - Bloc plein conducteur alimenté : active les composants voisins
//    (blocs musicaux, répéteurs); alimenté fortement, il alimente aussi la poussière.
//  - Bloc musical : joue sa note sur le front montant (quand il devient alimenté).

import { BUTTON_TICKS, MAT } from './data.js';

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const opp = d => (d + 2) % 4;

export class World {
  constructor(w = 48, h = 28) { this.w = w; this.h = h; this.cells = new Map(); }
  k(x, y) { return x + ',' + y; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inside(x, y) ? this.cells.get(x + ',' + y) || null : null; }
  set(x, y, c) { if (this.inside(x, y)) this.cells.set(x + ',' + y, c); }
  del(x, y) { this.cells.delete(x + ',' + y); }
  *each() { for (const [k, c] of this.cells) { const i = k.indexOf(','); yield [+k.slice(0, i), +k.slice(i + 1), c, k]; } }
  toJSON() { return { w: this.w, h: this.h, cells: [...this.each()].map(([x, y, c]) => [x, y, c]) }; }
  static fromJSON(o) {
    const w = new World(o.w || 48, o.h || 28);
    for (const [x, y, c] of o.cells || []) w.set(x, y, c);
    return w;
  }
}

// Un bloc qui peut être alimenté comme un bloc plein (et porter une torche).
export function isConductive(c) {
  if (!c) return false;
  if (c.type === 'note') return true;
  if (c.type === 'solid') return !!MAT[c.mat]?.cond;
  return false;
}

// La poussière se connecte-t-elle (visuellement) à ce voisin, situé dans la direction d ?
function dustConnects(n, d) {
  if (!n) return false;
  switch (n.type) {
    case 'dust': case 'lever': case 'button': case 'torch': case 'rblock': return true;
    case 'repeater': return n.dir === d || n.dir === opp(d);
    default: return false;
  }
}

export class Sim {
  constructor(world, onNote) {
    this.world = world;
    this.onNote = onNote || (() => {});
    this.reset();
  }

  reset() {
    this.tick = 0;
    this.torch = new Map();    // clé -> allumée ?
    this.rep = new Map();      // clé -> sortie active ?
    this.repIn = new Set();    // répéteurs dont l'entrée est alimentée
    this.pend = new Map();     // clé -> { kind, at, val }
    this.btn = new Map();      // clé -> tick de fin
    this.dust = new Map();     // clé -> puissance 1..15
    this.dustPts = new Map();  // clé -> directions vers lesquelles la poussière pointe
    this.powered = new Map();  // clé -> 'strong' | 'weak'
    this.noteOn = new Set();
    this.notePrev = new Map();
    this.flash = new Map();    // clé -> moment du dernier son (pour l'animation)
    this.settle();
  }

  // Stabilise le circuit sans jouer de sons (état « déjà construit »).
  settle() {
    for (let i = 0; i < 60; i++) {
      this.step(true);
      if (this.pend.size === 0 && this.btn.size === 0) break;
    }
    // Remet l'horloge à 0 en gardant les changements encore en attente (ex. une horloge de torches)
    const shift = this.tick;
    for (const p of this.pend.values()) p.at = Math.max(1, p.at - shift);
    this.tick = 0;
  }

  isTorchLit(k) { return this.torch.has(k) ? this.torch.get(k) : true; }
  isLeverOn(c) { return !!c.on; }
  isButtonOn(k) { return this.btn.has(k); }

  pressButton(x, y) {
    const c = this.world.get(x, y); if (!c || c.type !== 'button') return;
    const k = this.world.k(x, y);
    this.btn.set(k, this.tick + 1 + (BUTTON_TICKS[c.kind] || 10));
  }

  // Puissance qu'une source en (x,y) envoie vers la direction d.
  emit(c, k, d) {
    switch (c.type) {
      case 'lever': return c.on ? 15 : 0;
      case 'button': return this.btn.has(k) ? 15 : 0;
      case 'rblock': return 15;
      case 'torch': return (d !== c.dir && this.isTorchLit(k)) ? 15 : 0;
      case 'repeater': return (d === c.dir && this.rep.get(k)) ? 15 : 0;
      default: return 0;
    }
  }

  step(silent = false) {
    const t = ++this.tick;
    // 1. Changements programmés (répéteurs, torches) et fin des boutons
    for (const [k, p] of this.pend) {
      if (p.at <= t) {
        if (p.kind === 'rep') this.rep.set(k, p.val); else this.torch.set(k, p.val);
        this.pend.delete(k);
      }
    }
    for (const [k, until] of this.btn) if (until <= t) this.btn.delete(k);
    this.compute(silent);
  }

  compute(silent) {
    const W = this.world, t = this.tick;
    const powered = new Map();
    const act = new Set();
    const repIn = new Set();
    const dust = new Map();
    const dustPts = new Map();

    const neighbor = (x, y, d) => {
      const nx = x + DX[d], ny = y + DY[d];
      const n = W.get(nx, ny);
      return n ? { x: nx, y: ny, c: n, k: W.k(nx, ny) } : null;
    };
    const feedRepeater = (nb, d) => { if (nb && nb.c.type === 'repeater' && nb.c.dir === d) repIn.add(nb.k); };

    // a) Blocs alimentés fortement par un répéteur
    for (const [x, y, c, k] of W.each()) {
      if (c.type === 'repeater' && this.rep.get(k)) {
        const nb = neighbor(x, y, c.dir);
        if (nb && isConductive(nb.c)) powered.set(nb.k, 'strong');
      }
    }

    // b) Puissance de la poussière (propagation par niveaux)
    const buckets = Array.from({ length: 16 }, () => []);
    for (const [x, y, c, k] of W.each()) {
      if (c.type !== 'dust') continue;
      let lvl = 0;
      for (let d = 0; d < 4; d++) {
        const nb = neighbor(x, y, d); if (!nb) continue;
        lvl = Math.max(lvl, this.emit(nb.c, nb.k, opp(d)));
        if (powered.get(nb.k) === 'strong') lvl = 15;
      }
      if (lvl > 0) { dust.set(k, lvl); buckets[lvl].push([x, y]); }
    }
    for (let L = 15; L >= 2; L--) {
      for (const [x, y] of buckets[L]) {
        if (dust.get(W.k(x, y)) !== L) continue;
        for (let d = 0; d < 4; d++) {
          const nb = neighbor(x, y, d);
          if (!nb || nb.c.type !== 'dust') continue;
          if ((dust.get(nb.k) || 0) < L - 1) { dust.set(nb.k, L - 1); buckets[L - 1].push([nb.x, nb.y]); }
        }
      }
    }

    // c) Forme de la poussière et blocs visés
    for (const [x, y, c, k] of W.each()) {
      if (c.type !== 'dust') continue;
      const conns = [];
      for (let d = 0; d < 4; d++) { const nb = neighbor(x, y, d); if (nb && dustConnects(nb.c, d)) conns.push(d); }
      let pts;
      if (conns.length === 0) pts = [0, 1, 2, 3];
      else if (conns.length === 1) pts = [conns[0], opp(conns[0])];
      else pts = conns;
      dustPts.set(k, { conns, pts });
      if (!dust.get(k)) continue;
      for (const d of pts) {
        const nb = neighbor(x, y, d); if (!nb) continue;
        if (isConductive(nb.c) && !powered.has(nb.k)) powered.set(nb.k, 'weak');
        if (nb.c.type === 'note') act.add(nb.k);
        feedRepeater(nb, d);
      }
    }

    // d) Sources directes vers les composants voisins
    for (const [x, y, c, k] of W.each()) {
      if (!['lever', 'button', 'rblock', 'torch', 'repeater'].includes(c.type)) continue;
      for (let d = 0; d < 4; d++) {
        if (!this.emit(c, k, d)) continue;
        const nb = neighbor(x, y, d); if (!nb) continue;
        if (nb.c.type === 'note') act.add(nb.k);
        feedRepeater(nb, d);
      }
    }

    // e) Blocs alimentés -> composants voisins (le courant ne passe pas d'un bloc à l'autre)
    for (const [k] of powered) {
      const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1);
      const c = W.get(x, y);
      if (c && c.type === 'note') act.add(k);
      for (let d = 0; d < 4; d++) {
        const nb = neighbor(x, y, d); if (!nb) continue;
        if (nb.c.type === 'note') act.add(nb.k);
        feedRepeater(nb, d);
      }
    }

    // f) Torches : s'éteignent si leur bloc support est alimenté
    for (const [x, y, c, k] of W.each()) {
      if (c.type !== 'torch') continue;
      const nb = neighbor(x, y, c.dir);
      const want = !(nb && powered.has(nb.k));
      if (this.isTorchLit(k) !== want && !this.pend.has(k)) this.pend.set(k, { kind: 'torch', at: t + 1, val: want });
    }

    // g) Répéteurs : programment leur changement après le délai
    for (const [, , c, k] of W.each()) {
      if (c.type !== 'repeater') continue;
      const input = repIn.has(k), out = !!this.rep.get(k);
      if (input !== out && !this.pend.has(k)) this.pend.set(k, { kind: 'rep', at: t + (c.delay || 1), val: input });
    }

    // h) Blocs musicaux : front montant -> son
    const now = (typeof performance !== 'undefined') ? performance.now() : 0;
    for (const [x, y, c, k] of W.each()) {
      if (c.type !== 'note') continue;
      const on = act.has(k);
      if (on && !this.notePrev.get(k) && !silent) { this.flash.set(k, now); this.onNote(x, y, c); }
      this.notePrev.set(k, on);
    }

    // Nettoyage des états de cases supprimées
    for (const k of [...this.pend.keys()]) if (!W.cells.has(k)) this.pend.delete(k);

    this.powered = powered; this.noteOn = act; this.repIn = repIn;
    this.dust = dust; this.dustPts = dustPts;
  }
}
