/**
 * Suivi des sauvegardes JSON et rappel d'export.
 *
 * Le `localStorage` est la seule copie des fiches : un nettoyage du
 * navigateur les efface. Sans serveur, pas de notification hors de l'app ;
 * on mémorise donc, par poste, la dernière sauvegarde et le début des
 * modifications non sauvegardées, et l'app affiche un rappel à l'ouverture.
 *
 * Module pur (dates injectées), testé dans `lib/backup.test.ts`.
 */

export interface BackupState {
  /** Dernier export complet (ISO), null si jamais. */
  lastExportAt: string | null;
  /** Première modification non sauvegardée (ISO), null si tout est sauvegardé. */
  unsavedSince: string | null;
  /** Délai avant rappel, en jours ; 0 = rappels désactivés. */
  intervalDays: number;
  /** Rappel repoussé jusqu'à cette date (ISO). */
  snoozedUntil: string | null;
}

export const BACKUP_INTERVALS: readonly { days: number; label: string }[] = [
  { days: 1, label: "Chaque jour" },
  { days: 3, label: "Tous les 3 jours" },
  { days: 7, label: "Chaque semaine" },
  { days: 14, label: "Toutes les 2 semaines" },
  { days: 0, label: "Jamais (déconseillé)" },
];

export const DEFAULT_BACKUP: BackupState = {
  lastExportAt: null,
  unsavedSince: null,
  intervalDays: 3,
  snoozedUntil: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function time(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Une modification vient d'avoir lieu : ouvre la période non sauvegardée. */
export function markChanged(state: BackupState, now: Date): BackupState {
  return state.unsavedSince
    ? state
    : { ...state, unsavedSince: now.toISOString() };
}

/** Export complet téléchargé : tout est sauvegardé. */
export function markExported(state: BackupState, now: Date): BackupState {
  return {
    ...state,
    lastExportAt: now.toISOString(),
    unsavedSince: null,
    snoozedUntil: null,
  };
}

/** « Me le rappeler demain » : repousse le rappel de 24 h. */
export function snooze(state: BackupState, now: Date): BackupState {
  return { ...state, snoozedUntil: new Date(now.getTime() + DAY_MS).toISOString() };
}

export interface BackupReminder {
  /** Jours écoulés depuis la dernière sauvegarde, null si jamais sauvegardé. */
  daysSinceExport: number | null;
  /** Début des modifications non sauvegardées. */
  unsavedSince: Date;
}

/**
 * Rappel à afficher, ou null. Il faut à la fois des modifications non
 * sauvegardées depuis au moins `intervalDays` jours, des données à perdre,
 * rappels actifs et non repoussés.
 */
export function backupReminder(
  state: BackupState,
  hasData: boolean,
  now: Date,
): BackupReminder | null {
  if (state.intervalDays <= 0 || !hasData) return null;
  const unsaved = time(state.unsavedSince);
  if (unsaved === null) return null;
  const snoozed = time(state.snoozedUntil);
  if (snoozed !== null && snoozed > now.getTime()) return null;
  if (now.getTime() - unsaved < state.intervalDays * DAY_MS) return null;
  const exported = time(state.lastExportAt);
  return {
    daysSinceExport:
      exported === null ? null : Math.floor((now.getTime() - exported) / DAY_MS),
    unsavedSince: new Date(unsaved),
  };
}

/** Lecture défensive (storage ou version antérieure sans suivi). */
export function migrateBackup(raw: unknown): BackupState {
  const record =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const iso = (value: unknown) =>
    typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
  const interval = record.intervalDays;
  return {
    lastExportAt: iso(record.lastExportAt),
    unsavedSince: iso(record.unsavedSince),
    intervalDays: BACKUP_INTERVALS.some((option) => option.days === interval)
      ? (interval as number)
      : DEFAULT_BACKUP.intervalDays,
    snoozedUntil: iso(record.snoozedUntil),
  };
}
