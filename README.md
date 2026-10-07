# Fabrika

Petit jeu d'usine en pixel art, vu de haut, qui se joue dans le navigateur.
On extrait du minerai, on le transporte sur des tapis, on le transforme dans des machines
et on livre les commandes au dépôt.

## Jouer

Ouvre `index.html` dans un navigateur. Aucun build ni dépendance (un seul fichier HTML).

## Contrôles

| Action | Contrôle |
|---|---|
| Se déplacer sur la carte | glisser (outil Déplacer), WASD / flèches, trackpad |
| Zoom | `+` / `−`, molette |
| Choisir un outil | `1` à `7` |
| Tourner | `R` |
| Forme du splitter (T, Y droite, Y gauche, Croix) | `F` (ou `R` quand il est posé sur un tapis) |
| Effacer | clic droit ou Gomme |

## Ce qu'il y a dans le prototype

- Carte de 64 × 48 cases générée procéduralement (lacs, arbres, gisements de fer, cuivre, charbon)
- Tapis qui se raccordent automatiquement (droit, coin, T, croix) et qui alternent les entrées aux jonctions
- Splitters à plusieurs formes, avec rotation stricte des sorties
- Foreuse, Four, Presse avec barre de progression
- Objectif de livraison au dépôt
