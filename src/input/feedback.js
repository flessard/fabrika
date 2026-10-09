// Ce que voit et entend le joueur quand une commande est appliquée (voir sim/commands.js).
//
// Les commandes du joueur de ce poste : son, et en cas de refus, la bulle d'aide qui
// tremble ; un filtre posé ouvre sa fiche ; un groupe déplacé reste sélectionné.
// Celles d'un autre joueur (un jour, en multijoueur) : seulement le son, venu de l'endroit.
import { emit, on } from '../core/events.js';
import { localPlayerId } from '../sim/commands.js';
import { ui } from '../state.js';
import { playSound } from '../audio/sounds.js';

const SOUND = {
  place: 'place', placeBelts: 'place', placeGroup: 'place', moveGroup: 'place',
  erase: 'remove', eraseGroup: 'remove',
  rotate: 'click', setShape: 'click', setPriority: 'click', toggleFilter: 'click', takeOutput: 'place', clearItem: 'remove', emptyDump: 'remove', research: 'goal', setStorageOutput: 'click', setEnabled: 'click', setRecipe: 'click',
};
/** Commandes dont le refus mérite d'être signalé (effacer une case vide ne dit rien). */
const SAYS_NO = new Set(['place', 'placeBelts', 'placeGroup', 'moveGroup', 'rotate', 'setShape', 'setStorageOutput']);

export function initCommandFeedback() {
  on('command:done', ({ command, ok, result, problem, at }) => {
    const mine = command.player === localPlayerId();
    if (!ok) {
      if (mine && SAYS_NO.has(command.type)) {
        playSound('deny');
        emit('placement:denied', { problem }); // la bulle d'aide dit pourquoi
      }
      return;
    }
    playSound(SOUND[command.type], mine ? null : at);
    if (!mine) return;
    // Un filtre se règle tout de suite : sa fiche s'ouvre.
    if (command.type === 'place' && result.filters) ui.selected = result;
    // Un groupe déplacé reste sélectionné, prêt pour une autre action.
    if (command.type === 'moveGroup') ui.selection = result;
  });
}
