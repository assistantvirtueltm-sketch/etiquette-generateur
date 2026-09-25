/**
 * Sauvegarde automatique dans un dossier choisi par l'utilisateur — typiquement
 * un dossier synchronisé (OneDrive, Google Drive, Dropbox, partage réseau…).
 *
 * Sans serveur : l'API File System Access du navigateur (Chrome, Edge) donne
 * un accès en écriture au dossier choisi ; le client de synchronisation du
 * poste se charge d'envoyer le fichier dans le « drive ». Firefox et Safari ne
 * la proposent pas : le rappel d'export manuel reste alors la seule sauvegarde.
 *
 * Ce module-ci est pur (dossier injecté) et testé ; le pilotage navigateur
 * (IndexedDB, permissions, écriture différée) est dans
 * `lib/folder-backup-store.ts`.
 */

/** Sous-ensemble de `FileSystemDirectoryHandle` utilisé ici. */
export interface DirectoryLike {
  name: string;
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{
    createWritable(): Promise<{
      write(data: string): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
}

/** Fichier toujours à jour, écrasé à chaque écriture. */
export const LATEST_BACKUP_FILE = "etiquettes-bvp-sauvegarde.json";

/**
 * Copie du jour, écrasée dans la journée mais conservée ensuite : un
 * historique quotidien, utile si une mauvaise manipulation est synchronisée.
 */
export function dailyBackupFile(now: Date): string {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `etiquettes-bvp-${now.getFullYear()}-${mm}-${dd}.json`;
}

/** Délai d'écriture après la dernière modification (regroupe les frappes). */
export const WRITE_DELAY_MS = 1000;

async function writeFile(
  directory: DirectoryLike,
  name: string,
  content: string,
): Promise<void> {
  const file = await directory.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Écrit la sauvegarde complète : le fichier courant puis la copie du jour.
 * @returns les noms de fichiers écrits.
 */
export async function writeFolderBackup(
  directory: DirectoryLike,
  content: string,
  now: Date,
): Promise<string[]> {
  const names = [LATEST_BACKUP_FILE, dailyBackupFile(now)];
  for (const name of names) await writeFile(directory, name, content);
  return names;
}

/** L'API est-elle disponible dans ce navigateur ? */
export function folderBackupSupported(scope: object | undefined): boolean {
  return scope !== undefined && "showDirectoryPicker" in scope;
}
