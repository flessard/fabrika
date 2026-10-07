# Assets

Pour l'instant, tout le pixel art est dessiné dans le code (`src/render/sprites/`)
et il n'y a pas encore de son. Ce dossier accueillera les fichiers quand on passera
à de vrais sprites (par exemple générés avec Sprite Fusion).

## Organisation prévue

```
assets/
  sprites/
    items/       un PNG par item, 7 × 7 px          ex. fe_plate.png
    buildings/   un PNG par bâtiment                 ex. furnace.png (32 × 32)
    terrain/     tuiles de sol et de décor, 16 × 16
  sounds/        effets sonores (.ogg ou .mp3)
```

## Conventions

- Une case = 16 × 16 px. Les machines 2 × 2 font 32 × 32 px, le dépôt 48 × 48 px.
- Noms de fichiers = l'identifiant utilisé dans le code (`fe_plate`, `furnace`, `drill`…).
- Couleurs de la palette du jeu (`src/data/palette.js`) pour garder un style cohérent.
- Animations : une bande horizontale d'images de même taille (sprite sheet).
