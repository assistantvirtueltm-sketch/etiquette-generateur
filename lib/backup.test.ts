import { describe, expect, it } from "vitest";

import {
  backupReminder,
  DEFAULT_BACKUP,
  markChanged,
  markExported,
  migrateBackup,
  snooze,
  type BackupState,
} from "./backup";

const at = (iso: string) => new Date(iso);
const DAY0 = at("2026-09-25T08:00:00.000Z");
const plusDays = (days: number) => new Date(DAY0.getTime() + days * 86_400_000);

function changedOn(date: Date, state: BackupState = DEFAULT_BACKUP) {
  return markChanged(state, date);
}

describe("backupReminder", () => {
  it("ne rappelle rien tant qu'aucune modification n'attend", () => {
    expect(backupReminder(DEFAULT_BACKUP, true, plusDays(30))).toBeNull();
  });

  it("rappelle une fois le délai écoulé depuis la 1re modification non sauvegardée", () => {
    const state = changedOn(DAY0); // délai par défaut : 3 jours
    expect(backupReminder(state, true, plusDays(2.9))).toBeNull();
    const reminder = backupReminder(state, true, plusDays(3));
    expect(reminder).not.toBeNull();
    expect(reminder!.daysSinceExport).toBeNull();
    expect(reminder!.unsavedSince).toEqual(DAY0);
  });

  it("garde la date de la 1re modification, pas de la dernière", () => {
    const state = markChanged(changedOn(DAY0), plusDays(2));
    expect(state.unsavedSince).toBe(DAY0.toISOString());
  });

  it("compte les jours depuis la dernière sauvegarde", () => {
    const exported = markExported(DEFAULT_BACKUP, DAY0);
    const state = markChanged(exported, plusDays(1));
    expect(backupReminder(state, true, plusDays(5))!.daysSinceExport).toBe(5);
  });

  it("se tait après un export, jusqu'à la modification suivante", () => {
    const exported = markExported(changedOn(DAY0), plusDays(4));
    expect(exported.unsavedSince).toBeNull();
    expect(backupReminder(exported, true, plusDays(20))).toBeNull();
  });

  it("se repousse de 24 h", () => {
    const state = snooze(changedOn(DAY0), plusDays(4));
    expect(backupReminder(state, true, plusDays(4.5))).toBeNull();
    expect(backupReminder(state, true, plusDays(5.01))).not.toBeNull();
  });

  it("ne rappelle rien sans données ou rappels désactivés", () => {
    const state = changedOn(DAY0);
    expect(backupReminder(state, false, plusDays(10))).toBeNull();
    expect(backupReminder({ ...state, intervalDays: 0 }, true, plusDays(10))).toBeNull();
  });

  it("respecte le délai choisi", () => {
    const state = { ...changedOn(DAY0), intervalDays: 1 };
    expect(backupReminder(state, true, plusDays(1))).not.toBeNull();
  });
});

describe("migrateBackup", () => {
  it("écarte les valeurs illisibles", () => {
    expect(
      migrateBackup({ lastExportAt: "hier", unsavedSince: 12, intervalDays: 5 }),
    ).toEqual(DEFAULT_BACKUP);
    expect(migrateBackup(null)).toEqual(DEFAULT_BACKUP);
  });

  it("garde un suivi valide", () => {
    const state = { ...markExported(DEFAULT_BACKUP, DAY0), intervalDays: 7 };
    expect(migrateBackup(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
