// Guide intégré (banque d'information). Bêta : le contenu va grandir.
import { MATERIALS, INSTRUMENTS, noteName } from './data.js';

const FIGS = [
  { id: 'dc', name: 'double croche', per: 0.25 },
  { id: 'c', name: 'croche', per: 0.5 },
  { id: 'ct', name: 'croche de triolet', per: 1 / 3 },
  { id: 'n', name: 'noire', per: 1 },
  { id: 'b', name: 'blanche', per: 2 },
];

const fmt = n => (Math.round(n * 10) / 10).toString().replace('.', ',');

export function helpHTML() {
  const rows = MATERIALS.map(m => {
    const i = INSTRUMENTS[m.instr];
    const range = i.perc ? 'percussion' : `${noteName(i.base)} à ${noteName(i.base + 24)}`;
    return `<tr><td>${m.name}</td><td>${i.name}</td><td>${range}</td></tr>`;
  }).join('');
  const tempo = [1, 2, 3, 4, 5, 6, 8].map(n =>
    `<tr><td>${n} tick${n > 1 ? 's' : ''}</td><td>${fmt(n / 10)} s</td><td>${fmt(150 / n)}</td><td>${fmt(300 / n)}</td></tr>`).join('');

  return `
  <h2>Guide <span class="beta">Bêta</span></h2>
  <p class="muted">Composer avec des blocs musicaux et de la redstone, puis reproduire le circuit dans Minecraft.</p>

  <h3>Pour commencer</h3>
  <ol>
    <li>Choisis un élément dans la palette du bas (onglets Musique, Matériaux, Redstone), puis touche le plan de travail pour le poser.</li>
    <li>Pose un <b>bloc musical</b> et choisis sa note dans le panneau de réglage. Dépose un <b>matériau</b> dessus pour changer d’instrument (c’est le bloc placé dessous dans le jeu).</li>
    <li>Relie-le à une source (bouton, levier) avec de la <b>poussière</b> ou des <b>répéteurs</b>. Les répéteurs servent de métronome : chaque tick = 0,1 s.</li>
    <li>Appuie sur <b>▶</b>. Depuis le début (tick 0), ▶ appuie aussi sur tous les boutons. <b>⏭</b> avance d’un seul tick pour observer le courant.</li>
  </ol>

  <h3>Instruments selon le bloc dessous</h3>
  <table class="ref"><tr><th>Bloc dessous</th><th>Instrument</th><th>Registre (0 à 24 clics)</th></tr>${rows}</table>
  <p class="muted">Tout autre bloc (ou de l’air) donne la harpe. Chaque clic droit monte d’un demi-ton; après 24 clics, on revient à 0.</p>

  <h3>Ticks et figures de notes</h3>
  <p>Un tick de redstone dure <b>0,1 s</b>. Le tempo dépend donc du nombre de ticks donné à chaque figure.</p>
  <table class="ref"><tr><th>Une double croche =</th><th>Durée</th><th>Noire = (BPM)</th><th>Si c’est une croche : noire =</th></tr>${tempo}</table>
  <p class="muted">Repère pratique : 1 tick par double croche → noire = 150. 2 ticks → noire = 75. Les triolets demandent un nombre de ticks divisible par 3 (ex. 2 ticks par croche de triolet → noire = 100).</p>
  <div class="calc">
    Je veux une <select id="cFig">${FIGS.map(f => `<option value="${f.id}" ${f.id === 'n' ? 'selected' : ''}>${f.name}</option>`).join('')}</select>
    à noire = <input id="cBpm" type="number" min="20" max="600" value="100" style="width:80px">
    → <output id="cOut"></output>
  </div>

  <h3>Règles de redstone simulées</h3>
  <ul>
    <li><b>Poussière</b> : signal de 15 qui perd 1 par bloc. Elle n’alimente que les blocs vers lesquels elle pointe. Un point isolé pointe partout; une ligne pointe dans son axe.</li>
    <li><b>Répéteur</b> : lit son arrière, renvoie un signal plein (15) vers l’avant après 1 à 4 ticks. Une impulsion plus courte que son délai est allongée.</li>
    <li><b>Torche</b> : s’éteint 1 tick après que le bloc qui la porte reçoit du courant (inverseur). Elle n’alimente pas son propre bloc support.</li>
    <li><b>Bouton</b> : pierre = 10 ticks (1 s), bois = 15 ticks (1,5 s). <b>Levier</b> et <b>bloc de redstone</b> : courant continu.</li>
    <li><b>Bloc plein alimenté</b> : il active les composants qui le touchent (blocs musicaux, répéteurs), mais le courant ne passe pas d’un bloc à l’autre. Le verre et la pierre lumineuse ne conduisent pas.</li>
    <li><b>Bloc musical</b> : il joue une seule fois, au moment où il reçoit du courant. Pour rejouer, le courant doit s’éteindre puis revenir.</li>
  </ul>

  <h3>Java ou Bedrock</h3>
  <p>Les éléments de cette version (poussière, répéteur, torche, bouton, levier) se comportent de la même façon dans les deux éditions pour la musique. Les vraies différences (pistons, quasi-connectivité, slime) arriveront avec ces blocs. L’option Bedrock est marquée <b>Bêta</b> en attendant.</p>

  <h3>Raccourcis</h3>
  <p><kbd>Espace</kbd> jouer/pause · <kbd>.</kbd> tick suivant · <kbd>R</kbd> tourner · <kbd>Suppr</kbd> effacer la sélection · <kbd>Ctrl</kbd>+<kbd>Z</kbd> annuler · <kbd>Échap</kbd> outil Sélection · clic droit = effacer.</p>

  <h3>À propos</h3>
  <p class="muted">Outil non officiel, sans lien avec Mojang ni Microsoft. Les sons et les images sont créés pour cette app : ce sont des imitations, pas les fichiers du jeu.</p>`;
}

export function wireHelp(root) {
  const fig = root.querySelector('#cFig'), bpm = root.querySelector('#cBpm'), out = root.querySelector('#cOut');
  const calc = () => {
    const f = FIGS.find(x => x.id === fig.value), b = +bpm.value;
    if (!b || b <= 0) { out.textContent = '—'; return; }
    const sec = (60 / b) * f.per, ticks = sec * 10, r = Math.max(1, Math.round(ticks));
    const real = 60 / ((r / 10) / f.per);
    out.textContent = Math.abs(ticks - r) < 0.01
      ? `${r} tick${r > 1 ? 's' : ''} exactement`
      : `${fmt(ticks)} ticks → arrondi à ${r} (noire = ${fmt(real)} réel)`;
  };
  fig.onchange = calc; bpm.oninput = calc; calc();
}
