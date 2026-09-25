import { describe, expect, it } from "vitest";

import {
  dailyBackupFile,
  folderBackupSupported,
  LATEST_BACKUP_FILE,
  writeFolderBackup,
  type DirectoryLike,
} from "./folder-backup";

/** Dossier en mémoire : nom de fichier → contenu, écritures comptées. */
function memoryDirectory() {
  const files = new Map<string, string>();
  let closed = 0;
  const directory: DirectoryLike = {
    name: "OneDrive - Étiquettes",
    async getFileHandle(name, { create }) {
      if (!create && !files.has(name)) throw new Error("absent");
      return {
        async createWritable() {
          let buffer = "";
          return {
            async write(data: string) {
              buffer += data;
            },
            async close() {
              files.set(name, buffer);
              closed += 1;
            },
          };
        },
      };
    },
  };
  return { directory, files, closed: () => closed };
}

describe("writeFolderBackup", () => {
  it("écrit le fichier courant et la copie du jour", async () => {
    const { directory, files, closed } = memoryDirectory();
    const names = await writeFolderBackup(directory, '{"a":1}', new Date(2026, 8, 25, 9));
    expect(names).toEqual([LATEST_BACKUP_FILE, "etiquettes-bvp-2026-09-25.json"]);
    expect(files.get(LATEST_BACKUP_FILE)).toBe('{"a":1}');
    expect(files.get("etiquettes-bvp-2026-09-25.json")).toBe('{"a":1}');
    expect(closed()).toBe(2);
  });

  it("écrase le fichier courant et garde les copies des jours précédents", async () => {
    const { directory, files } = memoryDirectory();
    await writeFolderBackup(directory, "lundi", new Date(2026, 8, 21, 9));
    await writeFolderBackup(directory, "mardi", new Date(2026, 8, 22, 9));
    await writeFolderBackup(directory, "mardi soir", new Date(2026, 8, 22, 18));
    expect(files.get(LATEST_BACKUP_FILE)).toBe("mardi soir");
    expect(files.get("etiquettes-bvp-2026-09-21.json")).toBe("lundi");
    expect(files.get("etiquettes-bvp-2026-09-22.json")).toBe("mardi soir");
  });

  it("remonte l'erreur d'écriture (autorisation retirée…)", async () => {
    const directory: DirectoryLike = {
      name: "x",
      getFileHandle: () => Promise.reject(new DOMException("refus", "NotAllowedError")),
    };
    await expect(writeFolderBackup(directory, "{}", new Date())).rejects.toThrow("refus");
  });
});

describe("dailyBackupFile", () => {
  it("nomme la copie d'après la date locale", () => {
    expect(dailyBackupFile(new Date(2026, 0, 5, 23, 59))).toBe("etiquettes-bvp-2026-01-05.json");
  });
});

describe("folderBackupSupported", () => {
  it("détecte l'API du navigateur", () => {
    expect(folderBackupSupported(undefined)).toBe(false);
    expect(folderBackupSupported({})).toBe(false);
    expect(folderBackupSupported({ showDirectoryPicker: () => null })).toBe(true);
  });
});
