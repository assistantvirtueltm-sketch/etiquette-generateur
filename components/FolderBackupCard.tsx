"use client";

import { useSyncExternalStore } from "react";

import { buttonClass, Card, primaryButtonClass } from "@/components/ui";
import { LATEST_BACKUP_FILE } from "@/lib/folder-backup";
import {
  chooseBackupFolder,
  disableFolderBackup,
  getFolderBackupStatus,
  getServerFolderBackupStatus,
  reactivateFolderBackup,
  subscribeFolderBackup,
  writeFolderBackupNow,
} from "@/lib/folder-backup-store";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Sauvegarde automatique dans un dossier synchronisé (OneDrive, Google Drive,
 * Dropbox…), via l'API File System Access : aucun serveur.
 */
export function FolderBackupCard() {
  const status = useSyncExternalStore(
    subscribeFolderBackup,
    getFolderBackupStatus,
    getServerFolderBackupStatus,
  );

  return (
    <Card title="Sauvegarde automatique dans un dossier">
      {!status.supported ? (
        <p className="text-sm text-stone-600">
          Ce navigateur ne permet pas d&apos;écrire dans un dossier. Utiliser{" "}
          <strong>Chrome ou Edge</strong> pour activer la sauvegarde
          automatique ; sinon, exporter régulièrement le JSON (rappel
          ci-dessous).
        </p>
      ) : (
        <div className="space-y-3 text-sm text-stone-700">
          <p className="text-xs text-stone-500">
            Choisir un dossier synchronisé avec votre drive (OneDrive, Google
            Drive, Dropbox, partage réseau…) : chaque modification y est
            écrite automatiquement, dans{" "}
            <span className="font-mono">{LATEST_BACKUP_FILE}</span>, plus une
            copie par jour (
            <span className="font-mono">etiquettes-bvp-AAAA-MM-JJ.json</span>
            ). Le logiciel du drive se charge de l&apos;envoi.
          </p>

          {status.folderName ? (
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Dossier</dt>
                <dd className="font-medium text-stone-900">{status.folderName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">État</dt>
                <dd
                  className={
                    status.permission === "granted"
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }
                >
                  {status.writing
                    ? "écriture…"
                    : status.permission === "granted"
                      ? "active"
                      : "en pause : autorisation à renouveler"}
                </dd>
              </div>
              {status.lastWriteAt ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Dernière écriture</dt>
                  <dd className="text-stone-800">{formatTime(status.lastWriteAt)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {status.error ? (
            <p className="text-xs text-red-700">{status.error}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {status.folderName && status.permission !== "granted" ? (
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => void reactivateFolderBackup()}
              >
                Réactiver
              </button>
            ) : null}
            <button
              type="button"
              className={status.folderName ? buttonClass : primaryButtonClass}
              onClick={() => void chooseBackupFolder()}
            >
              {status.folderName ? "Changer de dossier" : "Choisir un dossier"}
            </button>
            {status.folderName && status.permission === "granted" ? (
              <button
                type="button"
                className={buttonClass}
                onClick={() => void writeFolderBackupNow()}
              >
                Écrire maintenant
              </button>
            ) : null}
            {status.folderName ? (
              <button
                type="button"
                className={`${buttonClass} text-red-700`}
                onClick={() => void disableFolderBackup()}
              >
                Désactiver
              </button>
            ) : null}
          </div>
          <p className="text-xs text-stone-500">
            Après un redémarrage du navigateur, il peut demander de réautoriser
            l&apos;accès au dossier (bouton « Réactiver ») ; choisir « Autoriser
            à chaque visite » évite cette étape.
          </p>
        </div>
      )}
    </Card>
  );
}
