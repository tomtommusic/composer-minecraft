# Composer for Minecraft (Bêta)

Webapp pour composer de la musique avec des **blocs musicaux** et de la **redstone** simulés, puis reproduire le circuit dans Minecraft.

Outil non officiel, sans lien avec Mojang ni Microsoft. Les sons et les images sont créés pour l'app (imitations), ce ne sont pas les fichiers du jeu.

## Version 0.2 (Bêta)

- Mode **Simple** (un étage, empilement automatique : un bloc musical posé sur un matériau se met dessus) et mode **Avancé** (étages, redstone en 3D : poussière en escalier, torche au sol, bloc au-dessus d'un bloc musical qui l'empêche de jouer)
- **Sélection** d'un bloc (outil Sélection) ou de plusieurs (outil Zone) : copier, coller, déplacer, dupliquer, tourner, retourner, supprimer, avec raccourcis clavier
- Les projets de la v0.1 sont convertis automatiquement

## Version 0.1 (Bêta)

- Palette par onglets : bloc musical, 17 matériaux (instrument selon le bloc dessous), poussière, répéteur, torche, levier, boutons, bloc de redstone
- Plan de travail avec 7 fonds (tableau noir, gazon, quartz, pierre, bois, sable, neige)
- Simulation tick par tick (0,1 s) : ▶ / pause, ■ remise à zéro, ⏭ tick suivant, vitesse ×1 / ×0,5 / ×0,25
- 16 instruments synthétisés, 25 hauteurs (0 à 24 clics), noms Do Ré Mi ou C D E
- Sauvegarde automatique dans le navigateur, liste de projets, export / import de fichiers `.cfm`
- Guide intégré : instruments, ticks et figures de notes (calculateur de tempo), règles de redstone
- États allumé / éteint lisibles sans dépendre de la couleur

## À venir

Pistons, pistons collants, slime, blocs de commande (sons du jeu), différences Java / Bedrock, export PDF tutoriel.

## Structure

- `index.html`, `css/style.css`
- `js/engine.js` : moteur de redstone
- `js/sound.js` : synthèse des instruments
- `js/render.js` : dessin des blocs et des fonds
- `js/data.js` : matériaux, instruments, noms de notes
- `js/guide.js` : guide intégré
- `js/app.js` : interface

Aucune étape de compilation : GitHub Pages sert les fichiers tels quels.
