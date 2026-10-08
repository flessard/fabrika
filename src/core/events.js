// Petit bus d'événements : la simulation annonce ce qui se passe,
// l'interface écoute, sans que les deux se connaissent.
//
// Événements utilisés :
//   'map:new'         une nouvelle carte vient d'être générée
//   'research:done'   un outil vient d'être débloqué (payload : { id })
//   'item:delivered'  un item est arrivé au dépôt (payload : { itemType, x, y })
//   'press:hit'       le piston d'une presse frappe (payload : { x, y } en pixels)

const listeners = new Map();

export function on(name, callback) {
  if (!listeners.has(name)) listeners.set(name, []);
  listeners.get(name).push(callback);
}

export function emit(name, payload) {
  for (const callback of listeners.get(name) ?? []) callback(payload);
}
