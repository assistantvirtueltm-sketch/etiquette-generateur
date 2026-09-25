/**
 * Store externe de la bibliothèque, branché sur `useSyncExternalStore`.
 *
 * La persistance se fait à l'écriture (et non dans un effet) : chaque mise à
 * jour écrit dans le `localStorage` puis notifie les abonnés. Le rendu serveur
 * (export statique) reçoit un instantané vide et stable, ce qui évite tout
 * écart d'hydratation.
 */
import { markChanged } from "./backup";
import {
  contentChanged,
  emptyLibrary,
  loadLibrary,
  saveLibrary,
  type Library,
} from "./storage";

export interface LibraryState {
  library: Library;
  /** Entrées écartées au chargement (format illisible). */
  dropped: number;
  /** Dernière erreur de persistance, si le storage est indisponible. */
  error: string | null;
}

const SERVER_STATE: LibraryState = {
  library: emptyLibrary(),
  dropped: 0,
  error: null,
};

let state: LibraryState | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLibraryState(): LibraryState {
  if (!state) {
    const { library, dropped } = loadLibrary();
    state = { library, dropped, error: null };
  }
  return state;
}

export function getServerLibraryState(): LibraryState {
  return SERVER_STATE;
}

export function updateLibrary(
  updater: (current: Library) => Library,
): LibraryState {
  const current = getLibraryState();
  const updated = updater(current.library);
  // Toute modification du contenu ouvre (ou prolonge) la période « non
  // sauvegardé » qui déclenche le rappel d'export.
  const library = contentChanged(current.library, updated)
    ? { ...updated, backup: markChanged(updated.backup, new Date()) }
    : updated;
  const saved = saveLibrary(library);
  state = {
    library,
    dropped: current.dropped,
    error: saved.ok ? null : (saved.error ?? "Sauvegarde locale impossible."),
  };
  notify();
  return state;
}

/** Efface le bandeau d'information une fois lu par l'utilisateur. */
export function acknowledgeLibraryNotice(): void {
  const current = getLibraryState();
  if (current.dropped === 0 && current.error === null) return;
  state = { ...current, dropped: 0, error: null };
  notify();
}

/** Réservé aux tests : oublie l'instantané mémorisé. */
export function resetLibraryStore(): void {
  state = null;
  listeners.clear();
}
