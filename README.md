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

Pour jouer à plusieurs, lancer aussi le serveur relais (port 3002) :

```bash
npm run relay
```

`npm run build` produit une version à publier dans `dist/`.

### Options dans l'adresse

| Option | Effet |
|---|---|
| `?renderer=canvas` | Utilise l'ancien rendu Canvas 2D au lieu de PixiJS (pour comparer) |
| `?stress` | Remplit la carte de boucles de tapis pleines d'items, pour mesurer la vitesse |
| `?server=ws://…` | Adresse du serveur relais du multijoueur (par défaut : port 3002 de la même machine) |

Le compteur sous la mini-carte affiche le rendu utilisé, les images par seconde et le temps de dessin.

## Inventaire et Assembleur

Les tapis ne sont pas illimités : une partie commence avec **50 tapis** dans l'inventaire
(commun à toute l'équipe, affiché dans le HUD et sur le bouton Tapis). Poser un tapis, même
souterrain, en dépense un ; l'effacer le rend. Sans stock, la pose est refusée (« plus de tapis
en stock ») et un tracé trop long montre en rouge les cases qui ne seront pas posées.

L'**Assembleur** (touche `E`) fabrique des tapis : **1 plaque de fer + 1 fil de cuivre → 2 tapis**,
en 2 s, ou **1 engrenage + 1 fil de cuivre → 3 tapis**. Ce sont des recettes à plusieurs
ingrédients, avec une réserve par ingrédient. Pour récupérer les tapis : le bouton **Prendre** de sa fiche, ou les
envoyer au dépôt par un tapis (un objet de construction livré va dans l'inventaire).

Ce qui coûte quelque chose se règle avec `cost` dans `data/buildings.js` (pour l'instant, les
tapis) ; l'inventaire est dans `src/world/inventory.js`, et fait partie de l'état de la partie.

## Résidus et Décharge

Chaque foreuse sort, en plus de son minerai, **1 résidu tous les 3 minerais**, **sur le
même tapis** que le minerai. Personne n'en veut : ni le dépôt, ni les machines. Un
résidu qui arrive devant un four ou le dépôt bloque donc la ligne. Il faut le trier avec
un **Filtre** (touche `I`) qui l'envoie de côté, vers une **Décharge** (touche `G`,
1 case), qui détruit tout ce qu'elle reçoit, par n'importe quel côté. Le filtre et la
décharge sont disponibles dès le début.

Quand un convoyeur bute sur une machine qui **refuse** son item (résidus devant un four ou
le dépôt, item sans recette active), une **bulle rouge** clignote au-dessus de lui avec
l'item barré, et une **croix rouge** marque le bord où il bute. Le survoler, ou ouvrir sa
fiche, dit pourquoi et quoi faire. Une machine simplement pleine ne déclenche rien : ce
n'est pas un refus. (`machineRefuses` dans `sim/machines.js`, `refusal` et
`refusalMarks` dans `render/scene.js`, sprites dans `render/sprites/refusal.js`.)

Réglages : `residue` sur la foreuse dans `data/buildings.js` (item, fréquence) ; l'item
`rubble` (`waste: true`) dans `data/items.js`.

## Palette d'outils

La barre du bas ne montre que l'essentiel :

| Touche | Bouton |
|---|---|
| `1` `2` `3` | Déplacer, Sélection, Gomme |
| `4` | Tapis (avec le stock restant) |
| `5` | **Logistique** : splitter, prioritaire, filtre, groupeur, tunnel |
| `6` | **Production** : foreuse, four, presse, assembleur |
| `7` | **Stockage** : conteneur, décharge |
| `R` | Tourner (visible seulement quand on tient un bâtiment) |
| `U` | Sous-sol |

Une famille est un seul bouton qui montre son dernier bâtiment choisi. Un clic ouvre un
plateau au-dessus avec tous ses bâtiments (verrouillés compris, avec leur cadenas). Sa
touche prend son dernier bâtiment, et rappuyer passe au suivant (le plateau s'affiche un
instant pour montrer où on en est). Les lettres restent : `T` tunnel, `I` filtre,
`E` assembleur, `B` conteneur, `G` décharge. Le rangement est dans `ui/toolbar.js`
(`SLOTS`, `GROUPS`).

## Arbre de recherche

Une nouvelle partie ne donne que le **tapis**, la **foreuse**, le **four**, le **filtre** et
la **décharge** : de quoi faire les lingots de la première commande et trier les résidus. Le reste se débloque dans l'arbre de recherche
(touche `K`, ou le bouton **Recherche** du HUD), en dépensant des items **livrés au dépôt**.
Toutes les livraisons comptent, même celles qui ne servent pas à la commande. Les tapis
livrés vont dans l'inventaire, pas dans la recherche.

| Bâtiment | Requiert | Coût |
|---|---|---|
| Splitter, Groupeur | Tapis | 8 lingots de fer |
| Presse | Four | 10 lingots de fer |
| Tunnel | Groupeur | 15 plaques de fer |
| Conteneur | Presse | 15 plaques de fer |
| Assembleur | Presse | 10 plaques de fer + 10 fils de cuivre |
| Prioritaire | Splitter | 20 plaques de fer + 15 fils de cuivre |

Dans la palette, un outil pas encore débloqué est grisé avec un cadenas ; le choisir ouvre
l'arbre. Un message annonce chaque recherche devenue possible, et le bouton Recherche
montre combien il y en a. L'arbre est dans `data/research.js`, les règles dans
`sim/research.js` (`game.unlocked`, `game.credits`, sauvegardés), la fenêtre dans
`ui/research.js`, et le déblocage est la commande `research`. Poser un bâtiment verrouillé
est refusé par les commandes elles-mêmes (multijoueur compris). Une sauvegarde d'avant
l'arbre garde tout débloqué ; l'usine de démonstration du menu aussi.

## Recettes

Le four, la presse et l'assembleur acceptent plusieurs sortes d'items, et on choisit dans
leur fiche quelle recette faire pour chacun (des boutons à allumer ou éteindre) :

| Machine | Recettes possibles | Actives au départ |
|---|---|---|
| Four | minerai de fer → lingot de fer ; minerai de cuivre → lingot de cuivre | les deux |
| Presse | lingot de fer → plaque **ou** engrenage ; lingot de cuivre → fil | plaque et fil |
| Assembleur | plaque + fil → 2 tapis ; engrenage + fil → 3 tapis | la première |

Une seule recette active par ingrédient : en allumer une éteint celle qui utilise le même.
Un item sans recette active est refusé par la machine (il reste sur le tapis). Les
recettes sont dans `data/buildings.js` (`recipes`, `defaultRecipes`), les règles dans
`data/recipes.js`, le choix est la commande `setRecipe` (champ `recipes` du bâtiment, gardé
à la copie, au déplacement et dans la sauvegarde).

## Marche / arrêt

Les machines (foreuse, four, presse, assembleur) peuvent être **arrêtées** : elles ne
fabriquent ni ne sortent plus rien, leur fabrication en cours est mise en pause, et elles
acceptent encore des items jusqu'à ce que leur stock d'entrée soit plein. Une machine
arrêtée est assombrie, avec un voyant rouge. Commande `setEnabled` (champ `enabled` du
bâtiment) : l'état est sauvegardé et partagé en multijoueur.

## Tapis : une seule entrée

Un tapis n'a qu'**une entrée** : son arrière, ou un côté s'il fait un coin. Il n'a qu'une
sortie, devant. Donc :

- **réunir** deux lignes demande un **groupeur** ;
- **séparer** une ligne demande un **splitter**, un **filtre** ou un **prioritaire**.

Poser, tracer, copier, déplacer ou tourner quelque chose qui donnerait deux entrées à un tapis
(un tapis, une machine ou un splitter qui déverse sur le côté d'une ligne déjà alimentée) est
refusé : « deux entrées sur un tapis : il faut un groupeur ». Dans la simulation, un tapis
n'accepte d'items que par son entrée (`inputSide`, `mergeProblem` dans `src/sim/belt.js`).

## Conteneur

Le **Conteneur** (touche `B`, 2 × 2 cases) garde des items : **6 emplacements**, chacun d'une seule sorte,
jusqu'à la taille de son paquet (`stack` dans `data/items.js`) :

| Item | Paquet |
|---|---|
| Tapis | 20 |
| Minerais, charbon, lingots, plaques | 50 |
| Fil de cuivre | 100 |

Les tapis et machines qui arrivent sur ses côtés le remplissent tant qu'il y a de la place.
Sa **sortie** (devant) se règle dans sa fiche : fermée, il garde tout ; ouverte, il renvoie ses
items un par un (une réserve tampon sur une ligne). Sa fiche montre les emplacements, et
**Prendre** met les objets de construction (tapis) dans l'inventaire. Code : `src/sim/storage.js`.

## Exploration

La carte fait **128 × 96 cases** et ne se voit pas d'un coup : un **brouillard** la couvre.
Au départ, seule une zone autour du dépôt est découverte, avec les premiers gisements (fer,
cuivre, charbon). Chaque bâtiment éclaire un rayon autour de lui : 16 cases pour le dépôt,
6 pour les foreuses, fours et presses, 4 pour les tapis, splitters, tunnels… On explore donc
en étirant des tapis vers l'inconnu ; ce qui est découvert le reste. On ne construit pas dans
le brouillard (« zone inexplorée »). La mini-carte est elle aussi dans le brouillard.

La zone découverte (`game.explored`, `src/world/fog.js`) fait partie de l'état de la partie :
elle est sauvegardée et identique pour tous les joueurs. Le brouillard est dessiné dans une
image (`src/render/fogImage.js`), refaite seulement quand la zone découverte change.

## Niveaux

Une partie est une suite de **commandes à livrer au dépôt** (`src/data/levels.js`). Chaque
niveau demande une ou plusieurs ressources ; dès que toute la commande est livrée, on passe
au suivant. Seuls les items de la commande comptent, et une ressource complète ne compte plus.

| Niveau | Commande |
|---|---|
| 1 · Premiers lingots | 10 lingots de fer |
| 2 · Plaques de fer | 20 plaques de fer |
| 3 · Le cuivre | 20 plaques de fer, 15 fils de cuivre |
| 4 · Charbon et tri | 40 plaques, 30 fils, 30 charbons |
| 5 · Grande commande | 100 plaques, 80 fils, 60 charbons, 40 lingots de cuivre |

La difficulté monte par les quantités, le nombre de ressources et des produits plus
transformés. Après le dernier niveau, la partie continue librement. Une **carte de niveau**
présente la commande au début et après chaque niveau réussi ; le **panneau du HUD** la suit
ressource par ressource. Le niveau fait partie de l'état de l'usine (`sim/levels.js`) :
il est sauvegardé et identique pour tous les joueurs d'une partie à plusieurs.

## Écran titre

Au lancement, un menu s'affiche par-dessus la carte, qui tourne déjà en fond (assombrie,
la caméra dérive doucement, une usine de démonstration à trois lignes y travaille, sans son
ni message) : **Nouvelle partie**
(cette carte, à neuf : seulement le dépôt de livraison, avec un gisement de fer tout près),
**Continuer** (s'il y a une sauvegarde), **Héberger une partie** et **Rejoindre une partie**
(avec le code de 4 lettres). Le bouton **Menu** du HUD y ramène ; pendant une partie à
plusieurs, revenir au menu quitte la partie. Le logo et le petit tapis animé sont dessinés
par le code (`src/ui/title.js`).

## Rendu

La caméra glisse sans à-coups : le rendu arrondit sa position au pixel de jeu (pour garder
le pixel art net) et le canevas est décalé de la fraction restante, au pixel d'écran près
(`applySubpixelOffset` dans `src/input/camera.js`).

Le dessin passe par [PixiJS](https://pixijs.com), qui utilise la carte graphique
(WebGPU si le navigateur le permet, sinon WebGL). Le pixel art est toujours dessiné
par le code de `src/render/sprites/`, mais une seule fois par image d'animation :
chaque résultat devient une texture réutilisée.

## Contrôles

| Action | Contrôle |
|---|---|
| Se déplacer sur la carte | glisser (outil Déplacer), WASD / flèches, trackpad |
| Zoom | molette ou pincement (progressif, vers la souris) ; `+` / `−` (crans entiers, pixels parfaitement nets) |
| Choisir un outil | `1` à `9`, `0` pour Sélection, `T` pour Tunnel, `I` pour Filtre |
| Voir le sous-sol / revenir en surface | `U`, ou le bouton Sous-sol |
| Tunnel : passer de l'entrée à la sortie | `F` (après une entrée, l'outil passe tout seul à la sortie) |
| Tourner | `R` |
| Forme du splitter, du prioritaire ou du groupeur (T, Y droite, Y gauche, Croix) | `F` (ou `R` quand il est posé sur un tapis) |
| Ordre des priorités du splitter prioritaire | `P`, ou ▲ dans sa fiche |
| Ouvrir la fiche d'un bâtiment (stock, cadence, débit) | clic avec l'outil Déplacer |
| Régler un filtre (quels items vont dans quelle sortie) | dans sa fiche, qui s'ouvre quand on le pose : clic sur les icônes d'items de chaque sortie |
| Fermer la fiche | `Échap` ou × |
| Mettre une machine en marche / l'arrêter | `O` en la survolant avec Déplacer, le bouton de sa fiche, ou « Marche / arrêt » dans le menu de la sélection |
| Menu (reprendre, sauvegarder, charger, son, langue, taille de l'interface, multijoueur, aide, menu principal) | `Échap` quand il n'y a plus rien à annuler, ou le bouton Menu du HUD |
| Couper le son | `M` |
| Sauvegarder / reprendre la partie | `Ctrl` / `⌘` + `S`, ou Sauvegarder et Charger dans le menu Échap |
| Tracer des tapis | glisser avec l'outil Tapis : le chemin s'affiche en aperçu et les tapis sont posés au relâchement (revenir en arrière raccourcit, `Échap` ou clic droit annule) |
| Effacer | clic droit ou Gomme |
| Sélectionner plusieurs bâtiments | glisser avec l'outil Sélection, ou `Maj` + glisser avec Déplacer |
| Déplacer / copier / effacer la sélection | menu au-dessus de la sélection, ou `X` / `C` / `Suppr` |
| Pendant un déplacement ou une copie | clic pour poser, `R` tourner le groupe, `Échap` ou clic droit pour annuler |

## Organisation du code

```
server/relay.js         serveur relais du multijoueur (Node)
index.html              structure de la page (HUD, mini-carte, palette)
styles/main.css         style de l'interface
assets/                 fichiers d'art et de son (voir assets/README.md)
src/
  main.js               point d'entrée : branche les modules et lance la boucle de jeu
  config.js             tous les réglages (taille de carte, vitesses, zoom…)
  i18n/                 langues : t('clé'), dictionnaires fr.js et en.js
  net/
    client.js           multijoueur : connexion au relais, tours, état de l'usine, empreintes
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
    levels.js           les niveaux : la commande à livrer pour chacun

  world/                la carte et ce qui est posé dessus
    terrain.js          génération procédurale (sol, décor, gisements)
    buildings.js        poser, trouver, enlever des bâtiments (surface et sous-sol)
    starterFactory.js   le départ d'une partie (le dépôt) et l'usine de démonstration
    map.js              démarrer une nouvelle carte
    fog.js              brouillard : ce qui est découvert, autour des bâtiments
    inventory.js        inventaire : objets en stock, dépenser, rembourser
    save.js             sauvegarder, charger, empreinte de l'usine
    stressTest.js       boucles de tapis pour le mode ?stress

  sim/                  la simulation (aucun dessin ici)
    simulation.js       un pas de simulation (commandes des joueurs, puis bâtiments)
    commands.js         les commandes : la seule façon de modifier l'usine
    transfer.js         faire passer un item d'une case à la suivante
    belt.js             tapis et jonctions
    splitter.js         splitters et suggestions de formes
    machines.js         foreuse, four, presse, assembleur, dépôt
    storage.js          conteneur : emplacements, paquets, sortie
    particles.js        fumée, étincelles, icônes
    levels.js           progression : niveau en cours, ce qui a été livré pour lui

  render/               le dessin (lit l'état, ne le modifie pas)
    pixiRenderer.js     rendu PixiJS (par défaut)
    canvasRenderer.js   rendu Canvas 2D (?renderer=canvas)
    scene.js            ce que les deux rendus calculent pareil (visible, curseur…)
    pen.js              outils de dessin pixel par pixel
    terrainImage.js     image du terrain (fabriquée une fois par carte)
    fogImage.js         image du brouillard (refaite quand la zone découverte change)
    minimap.js          mini-carte
    sprites/            dessin des items, des tapis et des machines

  input/                ce que fait le joueur
    controls.js         souris, trackpad, clavier
    actions.js          poser, effacer, tourner, tracer des tapis (émet des commandes)
    feedback.js         sons et réactions quand une commande est appliquée
    selection.js        sélectionner plusieurs bâtiments, les déplacer, copier, effacer
    camera.js           caméra, zoom, limites de la carte
    splitterPicker.js   choix de la forme du splitter

  ui/                   l'interface HTML autour de la carte
    hud.js              objectif, numéro de carte, messages
    toolbar.js          palette d'outils
    hint.js             bulle d'aide
    pauseMenu.js        menu Échap (sauvegarde, son, langue, multijoueur, aide)
    uiScale.js          taille de l'interface (75 % à 150 %), sans toucher à la carte
    levelCard.js        carte de niveau (la commande à livrer, niveau réussi)
    selectionMenu.js    menu au-dessus de la sélection (déplacer, copier, effacer)
    perf.js             compteur d'images par seconde
    cursors.js          curseurs de souris en pixel art
    multiplayer.js      ligne Multijoueur du HUD, messages, curseurs des autres joueurs
    title.js            écran titre (menu de démarrage, logo, tapis animé)
```

### Commandes et sauvegarde

L'interface ne modifie jamais l'usine elle-même. Chaque action du joueur (poser, effacer,
tourner, changer une forme, régler un filtre ou des priorités, tracer des tapis, déplacer,
copier ou effacer un groupe) devient une **commande** : des données simples, mises en file
par `issue()` et appliquées au début du pas de simulation suivant (`src/sim/commands.js`).
Le handler de la commande revérifie tout ; l'aperçu sous le curseur n'est qu'un aperçu.
L'événement `command:done` permet ensuite à l'interface de réagir (son, refus, fiche ouverte).

La simulation est **déterministe** : la même partie et les mêmes commandes, dans le même ordre,
donnent la même usine. Le hasard ne sert qu'aux effets visuels (fumée, poussière, étincelles).
Chaque bâtiment a un identifiant stable (`b.id`), y compris dans les réservations de cases.

La **sauvegarde** (`src/world/save.js`) garde la graine (le terrain se regénère), le tick, les
livraisons et tous les bâtiments dans leur ordre, avec leur état complet. Une partie rechargée
continue exactement comme elle se serait poursuivie. `fingerprint()` donne une empreinte de
l'usine : deux usines identiques ont la même empreinte.

C'est la base d'un futur multijoueur : il suffira de faire passer les commandes par le réseau
(chacune porte déjà le numéro du joueur) et de comparer les empreintes pour détecter une
désynchronisation.

### Multijoueur (jusqu'à 4 joueurs)

Dans le menu Échap, **Héberger** ouvre une partie avec l'usine actuelle et donne un code de 4 lettres ;
les autres joueurs tapent ce code et cliquent **Rejoindre**. Chacun voit le curseur des autres
(un cadre de sa couleur avec son nom). **Quitter** fait continuer seul avec l'usine telle quelle.

Le multijoueur est en **lockstep** : chaque joueur fait tourner la même usine chez lui, et seules
les commandes voyagent.

- `server/relay.js` (Node + `ws`) ne simule rien. Toutes les 50 ms, il envoie un **tour** qui
  autorise 3 pas de simulation de plus et contient les commandes reçues entre-temps, dans l'ordre.
  Il sert donc d'horloge commune.
- `src/net/client.js` envoie les commandes au serveur au lieu de les appliquer, prévoit celles des
  tours à leur tick, et limite la simulation au tick autorisé (`maxTick()`). Un joueur en retard
  (onglet en arrière-plan, partie rejointe) rattrape en simulant plus vite.
- **Rejoindre** : le serveur demande l'état de l'usine (une sauvegarde) à un joueur déjà là et
  l'envoie au nouveau, avec les tours qui ont suivi (il en garde 2 minutes).
- **Désynchronisation** : toutes les 3 s (180 ticks), chaque joueur envoie l'empreinte de son usine.
  Celui qui diffère du joueur de référence (le plus petit numéro) reçoit l'usine d'un autre.
- Pendant une partie à plusieurs, « Nouvelle carte » et « Charger » sont désactivés ; sauvegarder
  reste possible (dans son propre navigateur).
- L'adresse `http://localhost:3002/` du relais affiche les parties en cours, avec le nombre
  d'empreintes comparées et de divergences.

Pour jouer depuis d'autres ordinateurs, le serveur de jeu et le relais doivent être joignables
sur le réseau (Vite écoute aujourd'hui seulement sur 127.0.0.1).

### Langues

Le jeu est en français et en anglais ; on choisit dans le menu « Langue » du HUD, et le
choix est retenu. Au premier lancement, c'est la langue du navigateur (français, sinon anglais).

Tous les textes affichés passent par `t('clé', { paramètres })` (`src/i18n/index.js`).
Les dictionnaires sont `src/i18n/fr.js` (la référence) et `src/i18n/en.js` ; une clé absente
d'une langue retombe sur le français. Les données (`data/`) n'ont que des identifiants : les noms
viennent des clés `building.<type>`, `item.<id>`, `tool.<id>`, `shape.<id>`. Dans la page, les
éléments marqués `data-i18n` (ou `-html`, `-title`, `-aria`) sont remplis tout seuls.

Ajouter une langue : copier `fr.js`, le traduire, l'ajouter à `LANGS` dans `src/i18n/index.js`.

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

1. Ajouter ses items dans `src/data/items.js`, et leurs noms dans `src/i18n/` (`item.<id>`, `item.<id>.plural`).
2. Ajouter la machine dans `src/data/buildings.js` avec `kind: 'crafter'`, un temps et ses recettes,
   et son nom dans `src/i18n/` (`building.<type>`).
3. Ajouter son outil dans `TOOLS` (même fichier), et son nom (`tool.<id>`).
4. Dessiner son sprite dans `src/render/sprites/machines.js` (`STATIC_SPRITES`, et si elle bouge,
   `animationState` pour décrire son image d'animation et `ANIMATE` pour la dessiner).

La simulation la prend en charge sans autre changement.

## Ce qu'il y a dans le prototype

- Carte de 128 × 96 cases générée procéduralement (lacs, arbres, gisements de fer, cuivre, charbon),
  à découvrir : un brouillard recule autour des bâtiments
- Tapis à une seule entrée (droit ou coin) : deux lignes se réunissent par un groupeur et se séparent
  par un splitter, un filtre ou un prioritaire ; une jonction directe est refusée à la pose
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
- Multijoueur jusqu'à 4 joueurs (lockstep, code de partie, curseurs des autres, resynchronisation)
- Sauvegarde de la partie dans le navigateur (`Ctrl`/`⌘` + `S`), qui reprend à l'identique
- Fiche de chaque bâtiment : état, stock, cadence réelle et maximale, débit des tapis
- Sons rétro générés par le code, avec son spatial (plus fort près des usines)
- 5 niveaux de commandes à livrer au dépôt, de plus en plus longues
