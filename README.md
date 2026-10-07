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
| Choisir un outil | `1` à `7` |
| Tourner | `R` |
| Forme du splitter (T, Y droite, Y gauche, Croix) | `F` (ou `R` quand il est posé sur un tapis) |
| Effacer | clic droit ou Gomme |

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
    buildings.js        poser, trouver, enlever des bâtiments
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
    camera.js           caméra, zoom, limites de la carte
    splitterPicker.js   choix de la forme du splitter

  ui/                   l'interface HTML autour de la carte
    hud.js              objectif, numéro de carte, messages
    toolbar.js          palette d'outils
    hint.js             bulle d'aide
    perf.js             compteur d'images par seconde
```

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
- Splitters à plusieurs formes, avec rotation stricte des sorties
- Foreuse, Four, Presse avec barre de progression
- Objectif de livraison au dépôt
