// Moteur de simulation de redstone en 3D (étages).
// Un pas = 1 tick de redstone = 0,1 seconde.
//
// Règles suivies (comportement de Java Edition) :
//  - Poussière : signal de 15 qui perd 1 par bloc. Elle alimente le bloc sous
//    elle et les blocs vers lesquels elle « pointe » (un point isolé pointe
//    dans les 4 directions, une ligne dans son axe, sinon vers ses connexions).
//    Elle monte ou descend d'un étage, sauf si un bloc plein la « coupe ».
//  - Répéteur : lit l'arrière, sort 15 vers l'avant après 1 à 4 ticks,
//    prolonge les impulsions trop courtes, alimente fortement le bloc devant.
//  - Torche (murale ou posée au sol) : s'éteint 1 tick après que son bloc
//    support est alimenté. Alimente fortement le bloc au-dessus d'elle.
//  - Levier / bouton (posés au sol) : 15 tout autour, alimentent fortement le
//    bloc sur lequel ils sont posés. Bloc de redstone : 15 tout autour.
//  - Bloc conducteur alimenté : active les composants qui le touchent;
//    alimenté fortement, il alimente aussi la poussière voisine.
//  - Bloc musical : joue sur le front montant, seulement si rien n'est posé
//    au-dessus. L'instrument dépend du bloc situé dessous.

import { BUTTON_TICKS, MAT, instrumentFromBelow } from './data.js?v=0.2.5';

// 0 Nord, 1 Est, 2 Sud, 3 Ouest, 4 Haut, 5 Bas
export const DX = [0, 1, 0, -1, 0, 0];
export const DY = [-1, 0, 1, 0, 0, 0];
export const DZ = [0, 0, 0, 0, 1, -1];
export const UP = 4, DOWN = 5;
export const opp = d => [2, 3, 0, 1, 5, 4][d];

export const ZMIN = -4, ZMAX = 8;

export class World {
  constructor(w = 48, h = 28) { this.w = w; this.h = h; this.cells = new Map(); }
  k(x, y, z = 0) { return x + ',' + y + ',' + z; }
  inside(x, y, z = 0) { return x >= 0 && y >= 0 && x < this.w && y < this.h && z >= ZMIN && z <= ZMAX; }
  get(x, y, z = 0) { return this.inside(x, y, z) ? this.cells.get(x + ',' + y + ',' + z) || null : null; }
  set(x, y, z, c) { if (this.inside(x, y, z)) this.cells.set(x + ',' + y + ',' + z, c); }
  del(x, y, z = 0) { this.cells.delete(x + ',' + y + ',' + z); }
  *each() {
    for (const [k, c] of this.cells) {
      const [x, y, z] = k.split(',').map(Number);
      yield [x, y, z, c, k];
    }
  }
  toJSON() { return { w: this.w, h: this.h, cells: [...this.each()].map(([x, y, z, c]) => [x, y, z, c]) }; }

  // Lit aussi les anciens projets (v0.1 : [x, y, cellule] avec `below` sur les blocs musicaux)
  static fromJSON(o) {
    const w = new World(o.w || 48, o.h || 28);
    for (const e of o.cells || []) {
      if (e.length === 3) {
        const [x, y, c0] = e;
        const c = { ...c0 };
        if (c.type === 'note' && 'below' in c) {
          if (c.below && c.below !== 'dirt' && !w.get(x, y, -1)) w.set(x, y, -1, { type: 'solid', mat: c.below });
          delete c.below;
        }
        w.set(x, y, 0, c);
      } else {
        const [x, y, z, c] = e;
        w.set(x, y, z, c);
      }
    }
    return w;
  }
}

// Bloc plein qui peut être alimenté (et porter une torche, couper la poussière)
export function isConductive(c) {
  if (!c) return false;
  if (c.type === 'note') return true;
  if (c.type === 'solid') return !!MAT[c.mat]?.cond;
  return false;
}

function dustConnectsFlat(n, d) {
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
    this.torch = new Map();
    this.rep = new Map();
    this.repIn = new Set();
    this.pend = new Map();
    this.btn = new Map();
    this.dust = new Map();
    this.dustInfo = new Map();
    this.powered = new Map();
    this.noteOn = new Set();
    this.notePrev = new Map();
    this.flash = new Map();
    this.settle();
  }

  settle() {
    for (let i = 0; i < 60; i++) {
      this.step(true);
      if (this.pend.size === 0 && this.btn.size === 0) break;
    }
    const shift = this.tick;
    for (const p of this.pend.values()) p.at = Math.max(1, p.at - shift);
    this.tick = 0;
  }

  isTorchLit(k) { return this.torch.has(k) ? this.torch.get(k) : true; }
  isButtonOn(k) { return this.btn.has(k); }

  pressButton(x, y, z) {
    const c = this.world.get(x, y, z); if (!c || c.type !== 'button') return;
    this.btn.set(this.world.k(x, y, z), this.tick + 1 + (BUTTON_TICKS[c.kind] || 10));
  }

  // Puissance qu'une source envoie vers la direction d (0..5)
  emit(c, k, d) {
    switch (c.type) {
      case 'lever': return c.on ? 15 : 0;
      case 'button': return this.btn.has(k) ? 15 : 0;
      case 'rblock': return 15;
      case 'torch': return (d !== (c.dir ?? DOWN) && this.isTorchLit(k)) ? 15 : 0;
      case 'repeater': return (d === c.dir && this.rep.get(k)) ? 15 : 0;
      default: return 0;
    }
  }

  step(silent = false) {
    const t = ++this.tick;
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
    const powered = new Map(), act = new Set(), repIn = new Set();
    const dust = new Map(), dustInfo = new Map();
    const cells = [...W.each()];

    const nb = (x, y, z, d) => {
      const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
      const c = W.get(nx, ny, nz);
      return c ? { x: nx, y: ny, z: nz, c, k: W.k(nx, ny, nz) } : null;
    };
    const feedRepeater = (n, d) => { if (n && n.c.type === 'repeater' && d < 4 && n.c.dir === d) repIn.add(n.k); };
    const strong = (n) => { if (n && isConductive(n.c)) powered.set(n.k, 'strong'); };

    // a) Alimentation forte : répéteur (avant), torche (dessus), levier/bouton (bloc dessous)
    for (const [x, y, z, c, k] of cells) {
      if (c.type === 'repeater' && this.rep.get(k)) strong(nb(x, y, z, c.dir));
      else if (c.type === 'torch' && this.isTorchLit(k) && (c.dir ?? DOWN) !== UP) strong(nb(x, y, z, UP));
      else if ((c.type === 'lever' && c.on) || (c.type === 'button' && this.btn.has(k))) strong(nb(x, y, z, DOWN));
    }

    // b) Graphe de la poussière (à plat + marches)
    const links = new Map(); // clé -> [{k, x, y, z, d}]
    for (const [x, y, z, c, k] of cells) {
      if (c.type !== 'dust') continue;
      const L = [], conns = [], vert = [];
      const cutAbove = isConductive(W.get(x, y, z + 1));
      for (let d = 0; d < 4; d++) {
        const n = nb(x, y, z, d);
        if (n && dustConnectsFlat(n.c, d)) { conns.push(d); if (n.c.type === 'dust') L.push(n); continue; }
        // Marche vers le haut : poussière en (x+d, z+1), rien de plein au-dessus de nous
        const up = W.get(x + DX[d], y + DY[d], z + 1);
        if (up && up.type === 'dust' && !cutAbove) {
          conns.push(d); vert.push([d, 1]); L.push({ x: x + DX[d], y: y + DY[d], z: z + 1, c: up, k: W.k(x + DX[d], y + DY[d], z + 1) }); continue;
        }
        // Marche vers le bas : poussière en (x+d, z-1), case à côté non pleine
        const down = W.get(x + DX[d], y + DY[d], z - 1);
        if (down && down.type === 'dust' && !isConductive(n?.c)) {
          conns.push(d); vert.push([d, -1]); L.push({ x: x + DX[d], y: y + DY[d], z: z - 1, c: down, k: W.k(x + DX[d], y + DY[d], z - 1) });
        }
      }
      let pts;
      if (conns.length === 0) pts = [0, 1, 2, 3];
      else if (conns.length === 1) pts = [conns[0], opp(conns[0])];
      else pts = conns;
      links.set(k, L);
      dustInfo.set(k, { conns, pts, vert, x, y, z });
    }

    // c) Puissance de la poussière
    const buckets = Array.from({ length: 16 }, () => []);
    for (const [x, y, z, c, k] of cells) {
      if (c.type !== 'dust') continue;
      let lvl = 0;
      for (let d = 0; d < 6; d++) {
        const n = nb(x, y, z, d); if (!n) continue;
        lvl = Math.max(lvl, this.emit(n.c, n.k, opp(d)));
        if (powered.get(n.k) === 'strong') lvl = 15;
      }
      if (lvl > 0) { dust.set(k, lvl); buckets[lvl].push(k); }
    }
    for (let L = 15; L >= 2; L--) {
      for (const k of buckets[L]) {
        if (dust.get(k) !== L) continue;
        for (const n of links.get(k) || []) {
          if ((dust.get(n.k) || 0) < L - 1) { dust.set(n.k, L - 1); buckets[L - 1].push(n.k); }
        }
      }
    }

    // d) La poussière alimente le bloc dessous et les blocs visés
    for (const [k, info] of dustInfo) {
      if (!dust.get(k)) continue;
      const { x, y, z } = info;
      const below = nb(x, y, z, DOWN);
      if (below && isConductive(below.c) && !powered.has(below.k)) powered.set(below.k, 'weak');
      for (const d of info.pts) {
        const n = nb(x, y, z, d); if (!n) continue;
        if (isConductive(n.c) && !powered.has(n.k)) powered.set(n.k, 'weak');
        if (n.c.type === 'note') act.add(n.k);
        feedRepeater(n, d);
      }
    }

    // e) Sources directes -> composants voisins
    for (const [x, y, z, c, k] of cells) {
      if (!['lever', 'button', 'rblock', 'torch', 'repeater'].includes(c.type)) continue;
      for (let d = 0; d < 6; d++) {
        if (!this.emit(c, k, d)) continue;
        const n = nb(x, y, z, d); if (!n) continue;
        if (n.c.type === 'note') act.add(n.k);
        feedRepeater(n, d);
      }
    }

    // f) Blocs alimentés -> composants voisins (6 directions)
    for (const [k] of powered) {
      const [x, y, z] = k.split(',').map(Number);
      const c = W.get(x, y, z);
      if (c && c.type === 'note') act.add(k);
      for (let d = 0; d < 6; d++) {
        const n = nb(x, y, z, d); if (!n) continue;
        if (n.c.type === 'note') act.add(n.k);
        feedRepeater(n, d);
      }
    }

    // g) Torches
    for (const [x, y, z, c, k] of cells) {
      if (c.type !== 'torch') continue;
      const n = nb(x, y, z, c.dir ?? DOWN);
      const want = !(n && powered.has(n.k));
      if (this.isTorchLit(k) !== want && !this.pend.has(k)) this.pend.set(k, { kind: 'torch', at: t + 1, val: want });
    }

    // h) Répéteurs
    for (const [, , , c, k] of cells) {
      if (c.type !== 'repeater') continue;
      const input = repIn.has(k), out = !!this.rep.get(k);
      if (input !== out && !this.pend.has(k)) this.pend.set(k, { kind: 'rep', at: t + (c.delay || 1), val: input });
    }

    // i) Blocs musicaux
    const now = (typeof performance !== 'undefined') ? performance.now() : 0;
    for (const [x, y, z, c, k] of cells) {
      if (c.type !== 'note') continue;
      const on = act.has(k);
      if (on && !this.notePrev.get(k) && !silent && !W.get(x, y, z + 1)) {
        this.flash.set(k, now);
        this.onNote(x, y, z, c, instrumentFromBelow(W.get(x, y, z - 1)));
      }
      this.notePrev.set(k, on);
    }

    for (const k of [...this.pend.keys()]) if (!W.cells.has(k)) this.pend.delete(k);
    this.powered = powered; this.noteOn = act; this.repIn = repIn;
    this.dust = dust; this.dustInfo = dustInfo;
  }
}
