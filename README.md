# Fabrika

Petit jeu d'usine en pixel art, vu de haut, qui se joue dans le navigateur.
On extrait du minerai, on le transporte sur des tapis, on le transforme dans des machines
et on livre les commandes au dépôt.

## Jouer en local

Il faut [Node.js](https://nodejs.org) (version 20 ou plus).

```bash
npm install      # une seule fois
npm run dev      # serveur de développement, la page se recharge à chaque modification
```

Puis ouvrir l'adresse affichée (souvent <http://localhost:5173>).

`npm run build` produit une version à publier dans `dist/`.

### Options dans l'adresse

| Option | Effet |
|---|---|
| `?renderer=canvas` | Utilise l'ancien rendu Canvas 2D au lieu de PixiJS (pour comparer) |
| `?stress` | Remplit la carte de boucles de tapis pleines d'items, pour mesurer la vitesse |

Le compteur sous la mini-carte affiche le rendu utilisé, les images par seconde et le temps de dessin.

## Rendu

Le dessin passe par [PixiJS](https://pixijs.com), qui utilise la carte graphique
(WebGPU si le navigateur le permet, sinon WebGL). Le pixel art est toujours dessiné
par le code de `src/render/sprites/`, mais une seule fois par image d'animation :
chaque résultat devient une texture réutilisée.

## Contrôles

| Action | Contrôle |
|---|---|
| Se déplacer sur la carte | glisser (outil Déplacer), WASD / flèches, trackpad |
| Zoom | `+` / `−`, molette |
| Choisir un outil | `1` à `9`, `0` pour Sélection, `T` pour Tunnel, `I` pour Filtre |
| Voir le sous-sol / revenir en surface | `U`, ou le bouton Sous-sol |
| Tunnel : passer de l'entrée à la sortie | `F` (après une entrée, l'outil passe tout seul à la sortie) |
| Tourner | `R` |
| Forme du splitter, du prioritaire ou du groupeur (T, Y droite, Y gauche, Croix) | `F` (ou `R` quand il est posé sur un tapis) |
| Ordre des priorités du splitter prioritaire | `P`, ou ▲ dans sa fiche |
| Ouvrir la fiche d'un bâtiment (stock, cadence, débit) | clic avec l'outil Déplacer |
| Régler un filtre (quels items vont dans quelle sortie) | dans sa fiche, qui s'ouvre quand on le pose : clic sur les icônes d'items de chaque sortie |
| Fermer la fiche | `Échap` ou × |
| Couper le son | `M` |
| Tracer des tapis | glisser avec l'outil Tapis : le chemin s'affiche en aperçu et les tapis sont posés au relâchement (revenir en arrière raccourcit, `Échap` ou clic droit annule) |
| Effacer | clic droit ou Gomme |
| Sélectionner plusieurs bâtiments | glisser avec l'outil Sélection, ou `Maj` + glisser avec Déplacer |
| Déplacer / copier / effacer la sélection | menu au-dessus de la sélection, ou `X` / `C` / `Suppr` |
| Pendant un déplacement ou une copie | clic pour poser, `R` tourner le groupe, `Échap` ou clic droit pour annuler |

## Organisation du code

```
index.html              structure de la page (HUD, mini-carte, palette)
styles/main.css         style de l'interface
assets/                 fichiers d'art et de son (voir assets/README.md)
src/
  main.js               point d'entrée : branche les modules et lance la boucle de jeu
  config.js             tous les réglages (taille de carte, vitesses, zoom…)
  state.js              l'état partagé : game (la partie), view (caméra), ui (sélection)

  core/                 outils de base, sans rien de propre au jeu
    grid.js             directions, coordonnées de cases
    random.js           hasard reproductible (graine), bruit pour le terrain
    events.js           petit bus d'événements (la simulation annonce, l'interface écoute)

  data/                 définitions du contenu, faciles à modifier
    palette.js          les couleurs du pixel art
    items.js            les items (minerai, lingot, plaque…)
    buildings.js        les bâtiments, leurs recettes, et les outils de la palette
    splitterShapes.js   les formes du splitter

  world/                la carte et ce qui est posé dessus
    terrain.js          génération procédurale (sol, décor, gisements)
    buildings.js        poser, trouver, enlever des bâtiments (surface et sous-sol)
    starterFactory.js   l'usine de départ
    map.js              démarrer une nouvelle carte
    stressTest.js       boucles de tapis pour le mode ?stress

  sim/                  la simulation (aucun dessin ici)
    simulation.js       un pas de simulation
    transfer.js         faire passer un item d'une case à la suivante
    belt.js             tapis et jonctions
    splitter.js         splitters et suggestions de formes
    machines.js         foreuse, four, presse, dépôt
    particles.js        fumée, étincelles, icônes
    goal.js             objectif du tableau

  render/               le dessin (lit l'état, ne le modifie pas)
    pixiRenderer.js     rendu PixiJS (par défaut)
    canvasRenderer.js   rendu Canvas 2D (?renderer=canvas)
    scene.js            ce que les deux rendus calculent pareil (visible, curseur…)
    pen.js              outils de dessin pixel par pixel
    terrainImage.js     image du terrain (fabriquée une fois par carte)
    minimap.js          mini-carte
    sprites/            dessin des items, des tapis et des machines

  input/                ce que fait le joueur
    controls.js         souris, trackpad, clavier
    actions.js          poser, effacer, tourner, tracer des tapis
    selection.js        sélectionner plusieurs bâtiments, les déplacer, copier, effacer
    camera.js           caméra, zoom, limites de la carte
    splitterPicker.js   choix de la forme du splitter

  ui/                   l'interface HTML autour de la carte
    hud.js              objectif, numéro de carte, messages
    toolbar.js          palette d'outils
    hint.js             bulle d'aide
    selectionMenu.js    menu au-dessus de la sélection (déplacer, copier, effacer)
    perf.js             compteur d'images par seconde
```

### Surface et sous-sol

La carte a deux couches : `game.grid` (la surface) et `game.under` (le sous-sol).
Chaque bâtiment dit dans `data/buildings.js` les couches qu'il occupe (`layers`), d'où
viennent ses items (`inputLayer`) et où il les envoie (`outputLayer`). Un item part sur la
couche où le bâtiment envoie ses items et n'est reçu que par un bâtiment qui les prend sur
cette couche (`sim/transfer.js`). L'entrée de tunnel occupe les deux couches, reçoit en
surface et envoie au sous-sol ; la sortie fait l'inverse. Les versions souterraines du tapis,
des splitters et du groupeur (`underBelt`, `underSplitter`…) se comportent comme leur
version de surface (`base`).

### Le principe

- La **simulation** (`sim/`) fait avancer l'usine par pas fixes de 1/60 s. Elle ne dessine rien.
- Le **rendu** (`render/`) lit l'état et dessine. Il ne modifie rien.
- Les **données** (`data/`) décrivent le contenu. Ajouter un item ou une recette se fait surtout là.
- `state.js` contient tout l'état partagé. Les modules le lisent et le modifient directement.

### Ajouter une machine qui transforme des items

1. Ajouter ses items dans `src/data/items.js`.
2. Ajouter la machine dans `src/data/buildings.js` avec `kind: 'crafter'`, un temps et ses recettes.
3. Ajouter son outil dans `TOOLS` (même fichier).
4. Dessiner son sprite dans `src/render/sprites/machines.js` (`STATIC_SPRITES`, et si elle bouge,
   `animationState` pour décrire son image d'animation et `ANIMATE` pour la dessiner).

La simulation la prend en charge sans autre changement.

## Ce qu'il y a dans le prototype

- Carte de 64 × 48 cases générée procéduralement (lacs, arbres, gisements de fer, cuivre, charbon)
- Tapis qui se raccordent automatiquement (droit, coin, T, croix) et qui alternent les entrées aux jonctions
- Aperçu sous le curseur qui montre les raccords avant de poser
- Filtres : chaque sortie prend les items choisis dans sa fiche (une sortie sans choix prend
  le reste), avec des pastilles de couleur sur le tapis pour voir ce qui part où
- Splitters à plusieurs formes (alternance stricte), splitters prioritaires (1, 2, 3)
  et groupeurs (2 ou 3 entrées, à tour de rôle)
- Files d'items centrées : un item par case, les tapis bloqués s'arrêtent
- Foreuse, Four, Presse avec stock interne et barre de progression
- Sélection de plusieurs bâtiments à déplacer, copier ou effacer, en tournant le groupe
  (les bâtiments déplacés ou copiés repartent vides)
- Tunnels et sous-sol : une entrée fait descendre les items, une sortie les fait remonter.
  Au sous-sol (`U`), tapis, splitters, prioritaires et groupeurs souterrains passent sous
  les machines, les tapis et même l'eau, mais deux tapis souterrains ne se croisent jamais
- Entrées et sorties des machines : un raccord (bouche sombre et pinces vertes pour une entrée,
  orange pour une sortie) là où un tapis est branché ; ailleurs, des flèches montrent où brancher
  (la sortie toujours, toutes les entrées en survolant une machine ou avec un outil de tapis)
- Fiche de chaque bâtiment : état, stock, cadence réelle et maximale, débit des tapis
- Sons rétro générés par le code, avec son spatial (plus fort près des usines)
- Objectif de livraison au dépôt
