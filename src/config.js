// Réglages globaux du jeu. Tout ce qu'on voudrait ajuster en itérant vit ici.

/** Taille d'une case, en pixels de jeu (avant le zoom). */
export const TILE = 16;

/** Taille de la carte, en cases. On ne la voit pas toute : elle se découvre (voir world/fog.js). */
export const MAP_W = 128;
export const MAP_H = 96;
/** Pixels de la mini-carte par case (la mini-carte fait 128 × 96 pixels). */
export const MINIMAP_SCALE = 1;

/** Bordure sombre autour de la carte dans l'image du terrain, en pixels. */
export const MAP_PADDING = 24;
/** Hauteur de la falaise dessinée sous le bord bas de la carte, en pixels. */
export const CLIFF_HEIGHT = 10;

/** Pas fixe de la simulation : 60 mises à jour par seconde. */
export const SIM_DT = 1 / 60;

/** Vitesse des tapis, en cases par seconde. */
export const BELT_SPEED = 2.4;

/** Zoom : 1 pixel de jeu = N pixels à l'écran (crans entiers au clavier, progressif à la molette). */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;
/** Vitesse de défilement au clavier, en pixels de jeu par seconde. */
export const PAN_SPEED = 260;
/** Marge (px) visible au-delà du bord de la carte. */
export const CAMERA_MARGIN = 20;
/** Hauteur de la palette d'outils (px écran), pour ne pas cacher le bas de la carte. */
export const TOOLBAR_HEIGHT = 100;
