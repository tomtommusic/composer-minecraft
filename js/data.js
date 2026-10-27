// Données de référence : matériaux, instruments, noms de notes.
// Les visuels et les sons de l'app sont originaux (dessinés / synthétisés),
// ils évoquent le jeu sans reprendre les fichiers de Mojang.

// Instruments du bloc musical. `base` = note MIDI jouée à 0 clic (Fa♯ de l'octave indiquée).
export const INSTRUMENTS = {
  harp:           { name: 'Harpe',             base: 54, perc: false },
  bass:           { name: 'Basse',             base: 30, perc: false },
  basedrum:       { name: 'Grosse caisse',     base: 54, perc: true  },
  snare:          { name: 'Caisse claire',     base: 54, perc: true  },
  hat:            { name: 'Baguettes (clics)', base: 54, perc: true  },
  guitar:         { name: 'Guitare',           base: 42, perc: false },
  flute:          { name: 'Flûte',             base: 66, perc: false },
  bell:           { name: 'Cloche',            base: 78, perc: false },
  chime:          { name: 'Carillon',          base: 78, perc: false },
  xylophone:      { name: 'Xylophone',         base: 78, perc: false },
  iron_xylophone: { name: 'Vibraphone',        base: 54, perc: false },
  cow_bell:       { name: 'Cloche de vache',   base: 66, perc: false },
  didgeridoo:     { name: 'Didgeridoo',        base: 30, perc: false },
  bit:            { name: 'Bit (8 bits)',      base: 54, perc: false },
  banjo:          { name: 'Banjo',             base: 54, perc: false },
  pling:          { name: 'Pling (piano élec.)', base: 54, perc: false },
};

// Matériaux : posés sous un bloc musical, ils choisissent l'instrument.
// Posés seuls sur le plan de travail, ce sont des blocs pleins.
// `cond` = bloc conducteur (peut être alimenté et porter une torche).
export const MATERIALS = [
  { id: 'dirt',      name: 'Terre',            instr: 'harp',           cond: true,  c: ['#7a5536', '#5e3f26', '#8d6644'] },
  { id: 'planks',    name: 'Planches de bois', instr: 'bass',           cond: true,  c: ['#b08850', '#8c6a3c', '#c49a5e'] },
  { id: 'stone',     name: 'Pierre',           instr: 'basedrum',       cond: true,  c: ['#7f7f7f', '#6a6a6a', '#959595'] },
  { id: 'sand',      name: 'Sable',            instr: 'snare',          cond: true,  c: ['#dccf9a', '#c9bb82', '#ebe0b0'] },
  { id: 'gravel',    name: 'Gravier',          instr: 'snare',          cond: true,  c: ['#857c78', '#6c6461', '#a29894'] },
  { id: 'glass',     name: 'Verre',            instr: 'hat',            cond: false, c: ['#cfeaf2', '#a9d3df', '#ffffff'] },
  { id: 'wool',      name: 'Laine',            instr: 'guitar',         cond: true,  c: ['#e9e9e9', '#d4d4d4', '#f7f7f7'] },
  { id: 'clay',      name: 'Argile',           instr: 'flute',          cond: true,  c: ['#a2a7b6', '#8e93a2', '#b3b8c6'] },
  { id: 'gold',      name: 'Bloc d’or',        instr: 'bell',           cond: true,  c: ['#f5d13d', '#d9a91f', '#fff08a'] },
  { id: 'ice',       name: 'Glace compacte',   instr: 'chime',          cond: true,  c: ['#93b9f0', '#7aa3df', '#b9d4fa'] },
  { id: 'bone',      name: 'Bloc d’os',        instr: 'xylophone',      cond: true,  c: ['#e5e0c8', '#cdc6a8', '#f4f0de'] },
  { id: 'iron',      name: 'Bloc de fer',      instr: 'iron_xylophone', cond: true,  c: ['#dcdcdc', '#bdbdbd', '#f2f2f2'] },
  { id: 'soulsand',  name: 'Sable des âmes',   instr: 'cow_bell',       cond: true,  c: ['#5d4637', '#4a372b', '#6f5644'] },
  { id: 'pumpkin',   name: 'Citrouille',       instr: 'didgeridoo',     cond: true,  c: ['#d9802a', '#b8661c', '#ec9a40'] },
  { id: 'emerald',   name: 'Bloc d’émeraude',  instr: 'bit',            cond: true,  c: ['#3fd06f', '#23a352', '#7cf0a0'] },
  { id: 'hay',       name: 'Botte de foin',    instr: 'banjo',          cond: true,  c: ['#c9a52a', '#a8861a', '#e3c24a'] },
  { id: 'glowstone', name: 'Pierre lumineuse', instr: 'pling',          cond: false, c: ['#e8c06a', '#b98c3a', '#fff0b0'] },
];
export const MAT = Object.fromEntries(MATERIALS.map(m => [m.id, m]));

// Durée d'un bouton (en ticks de redstone de 0,1 s).
export const BUTTON_TICKS = { stone: 10, wood: 15 };

const FR = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const EN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function noteName(midi, lang = 'fr', withOctave = true) {
  const n = (lang === 'en' ? EN : FR)[((midi % 12) + 12) % 12];
  return withOctave ? n + (Math.floor(midi / 12) - 1) : n;
}

// Instrument d'un bloc musical selon le bloc situé dessous (null = air -> harpe)
export function instrumentFromBelow(b) {
  if (!b) return 'harp';
  if (b.type === 'solid') return MAT[b.mat]?.instr || 'harp';
  if (b.type === 'note') return 'bass'; // un bloc musical est en bois
  return 'harp';
}

export function midiFor(instr, clicks) {
  return (INSTRUMENTS[instr] || INSTRUMENTS.harp).base + (clicks || 0);
}
