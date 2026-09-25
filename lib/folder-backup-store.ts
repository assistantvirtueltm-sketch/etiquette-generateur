/**
 * Pilotage navigateur de la sauvegarde automatique dans un dossier (cf.
 * `lib/folder-backup.ts`). Store externe lu par `useSyncExternalStore`, comme
 * `lib/library-store.ts`.
 *
 * - Le dossier choisi (un `FileSystemDirectoryHandle`) ne peut pas aller dans
 *   le `localStorage` : il est conservé dans IndexedDB.
 * - Après un rechargement, le navigateur redemande souvent l'autorisation
 *   d'écrire (état « prompt ») : elle ne peut être rendue que sur un clic,
 *   d'où `reactivateFolderBackup`. Chrome propose aussi « Autoriser à chaque
 *   visite », qui évite ce clic.
 * - Chaque modification de la base est écrite une seconde après la dernière
 *   frappe ; une écriture réussie vaut sauvegarde (`markExported`) et fait
 *   taire le rappel d'export.
 */
import { markExported } from "./backup";
import {
  folderBackupSupported,
  WRITE_DELAY_MS,
  writeFolderBackup,
  type DirectoryLike,
} from "./folder-backup";
import { getLibraryState, subscribeLibrary, updateLibrary } from "./library-store";
import { contentChanged, serializeLibrary } from "./storage";

type Permission = "granted" | "prompt" | "denied";

/** Handle de dossier tel que l'expose Chrome / Edge (API non typée par TS). */
interface DirectoryHandle extends DirectoryLike {
  queryPermission(options: { mode: "readwrite" }): Promise<Permission>;
  requestPermission(options: { mode: "readwrite" }): Promise<Permission>;
}

interface PickerScope {
  showDirectoryPicker(options: {
    id?: string;
    mode?: "readwrite";
    startIn?: string;
  }): Promise<DirectoryHandle>;
}

export interface FolderBackupStatus {
  /** L'API existe dans ce navigateur. */
  supported: boolean;
  /** Nom du dossier choisi, null si aucun. */
  folderName: string | null;
  /** Autorisation d'écriture sur le dossier. */
  permission: Permission | null;
  /** Dernière écriture réussie pendant cette session. */
  lastWriteAt: string | null;
  writing: boolean;
  error: string | null;
}

const SERVER_STATUS: FolderBackupStatus = {
  supported: false,
  folderName: null,
  permission: null,
  lastWriteAt: null,
  writing: false,
  error: null,
};

let status: FolderBackupStatus = SERVER_STATUS;
let handle: DirectoryHandle | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function setStatus(patch: Partial<FolderBackupStatus>) {
  status = { ...status, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeFolderBackup(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFolderBackupStatus(): FolderBackupStatus {
  return status;
}

export function getServerFolderBackupStatus(): FolderBackupStatus {
  return SERVER_STATUS;
}

// --- IndexedDB : un seul enregistrement, le dossier choisi -----------------

const DB_NAME = "etiquettes-bvp";
const STORE = "handles";
const KEY = "backup-folder";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idb<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

// --- Écriture ---------------------------------------------------------------

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function flush(): Promise<void> {
  timer = null;
  if (!handle || status.permission !== "granted") return;
  const { library } = getLibraryState();
  const now = new Date();
  setStatus({ writing: true });
  try {
    await writeFolderBackup(handle, serializeLibrary(library, now), now);
    // Une frappe pendant l'écriture n'est pas dans le fichier : dans ce cas on
    // note l'écriture sans déclarer la base sauvegardée, et on réécrit.
    const changedMeanwhile = contentChanged(library, getLibraryState().library);
    updateLibrary((current) => ({
      ...current,
      backup: changedMeanwhile
        ? { ...current.backup, lastExportAt: now.toISOString() }
        : markExported(current.backup, now),
    }));
    setStatus({ writing: false, lastWriteAt: now.toISOString(), error: null });
    if (changedMeanwhile) schedule();
  } catch (error) {
    // Autorisation retirée entre-temps : on repasse en attente de clic.
    const permission = await handle.queryPermission({ mode: "readwrite" }).catch(
      () => "prompt" as const,
    );
    setStatus({
      writing: false,
      permission,
      error: `Écriture impossible dans « ${handle.name} » : ${errorMessage(error)}`,
    });
  }
}

function schedule(delayMs = WRITE_DELAY_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), delayMs);
}

/** Toute modification non sauvegardée déclenche une écriture différée. */
function onLibraryChange() {
  if (
    handle &&
    status.permission === "granted" &&
    getLibraryState().library.backup.unsavedSince
  ) {
    schedule();
  }
}

// --- Actions ----------------------------------------------------------------

/** À appeler une fois côté client (idempotent). */
export async function initFolderBackup(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const supported = folderBackupSupported(
    typeof window === "undefined" ? undefined : window,
  );
  setStatus({ supported });
  if (!supported) return;
  subscribeLibrary(onLibraryChange);
  try {
    handle = (await idb<DirectoryHandle | undefined>("readonly", (store) =>
      store.get(KEY),
    )) ?? null;
    if (!handle) return;
    const permission = await handle.queryPermission({ mode: "readwrite" });
    setStatus({ folderName: handle.name, permission });
    onLibraryChange();
  } catch (error) {
    setStatus({ error: `Dossier de sauvegarde illisible : ${errorMessage(error)}` });
  }
}

/** Choix du dossier (sur clic) ; écrit aussitôt une première sauvegarde. */
export async function chooseBackupFolder(): Promise<void> {
  try {
    const picked = await (window as unknown as PickerScope).showDirectoryPicker({
      id: "etiquettes-bvp",
      mode: "readwrite",
      startIn: "documents",
    });
    handle = picked;
    await idb("readwrite", (store) => store.put(picked, KEY));
    const permission = await picked.queryPermission({ mode: "readwrite" });
    setStatus({ folderName: picked.name, permission, error: null });
    await flush();
  } catch (error) {
    // Fenêtre fermée sans choisir : ce n'est pas une erreur.
    if (error instanceof DOMException && error.name === "AbortError") return;
    setStatus({ error: `Choix du dossier impossible : ${errorMessage(error)}` });
  }
}

/** Rend l'autorisation d'écrire (sur clic) après un rechargement. */
export async function reactivateFolderBackup(): Promise<void> {
  if (!handle) return;
  try {
    const permission = await handle.requestPermission({ mode: "readwrite" });
    setStatus({ permission, error: null });
    if (permission === "granted") await flush();
  } catch (error) {
    setStatus({ error: `Autorisation refusée : ${errorMessage(error)}` });
  }
}

/** Écrit tout de suite, sans attendre une modification. */
export async function writeFolderBackupNow(): Promise<void> {
  if (timer) clearTimeout(timer);
  await flush();
}

/** Oublie le dossier : plus aucune écriture automatique. */
export async function disableFolderBackup(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  handle = null;
  setStatus({ folderName: null, permission: null, lastWriteAt: null, error: null });
  try {
    await idb("readwrite", (store) => store.delete(KEY));
  } catch (error) {
    setStatus({ error: errorMessage(error) });
  }
}
