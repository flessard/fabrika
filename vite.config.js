// Configuration de Vite (serveur de développement et build).
import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : le build fonctionne aussi dans un sous-dossier (ex. GitHub Pages).
  base: './',
  build: {
    // main.js attend que PixiJS soit prêt avec un « await » au niveau du module.
    target: 'es2022',
  },
});
