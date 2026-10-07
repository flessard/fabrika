// Les niveaux : chacun est une commande à livrer au dépôt.
//
// Un niveau est réussi quand toute sa commande est livrée ; on passe alors au suivant.
// Seuls les items de la commande comptent, et une ressource déjà complète ne compte plus.
// La difficulté monte de trois façons : les quantités, le nombre de ressources
// différentes, et des produits de plus en plus transformés (des lignes plus longues).
// Après le dernier niveau, la partie continue librement.
//
// Les noms des niveaux sont dans les dictionnaires (src/i18n/) : 'level.<numéro>'.
export const LEVELS = [
  { goals: [{ item: 'fe_ingot', count: 10 }] },
  { goals: [{ item: 'fe_plate', count: 20 }] },
  { goals: [{ item: 'fe_plate', count: 20 }, { item: 'cu_wire', count: 15 }] },
  { goals: [{ item: 'fe_plate', count: 40 }, { item: 'cu_wire', count: 30 }, { item: 'coal', count: 30 }] },
  { goals: [{ item: 'fe_plate', count: 100 }, { item: 'cu_wire', count: 80 }, { item: 'coal', count: 60 }, { item: 'cu_ingot', count: 40 }] },
];
