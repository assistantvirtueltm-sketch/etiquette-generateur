import { describe, expect, it } from "vitest";

import {
  A4_MM,
  AGIPA_118987,
  minFontSizePt,
  SHEET_SPECS,
  labelSlot,
  labelsPerSheet,
  mmToPt,
  ptToMm,
  sheetFitReport,
  sheetGapsMm,
  sheetMarginsMm,
} from "./label-layout";

const spec = AGIPA_118987;

describe("conversions", () => {
  it("convertit mm ↔ pt", () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 10);
    expect(ptToMm(72)).toBeCloseTo(25.4, 10);
    expect(ptToMm(mmToPt(38))).toBeCloseTo(38, 10);
  });

  it("convertit la hauteur d'x légale en corps Helvetica", () => {
    // 1,2 mm de hauteur d'x ≈ 6,5 pt ; 0,9 mm ≈ 4,9 pt.
    expect(minFontSizePt(1.2)).toBeCloseTo(6.5, 1);
    expect(minFontSizePt(0.9)).toBeCloseTo(4.88, 1);
  });
});

describe("planche Agipa 118987", () => {
  /**
   * Valeurs brutes du gabarit Word du fabricant (`docs/agipa-118987-gabarit.doc`,
   * cf. `docs/agipa-118987-gabarit.md`) : marges 264 / 743 twips, bornes de
   * cellules −8, 5592, 5752, 11370 twips (étiquette, gouttière, étiquette),
   * hauteur de ligne exacte 3838 twips. Ce test fige la seule source
   * autoritaire des cotes : le mettre à jour demande de relire le gabarit.
   */
  it("colle aux bornes en twips du gabarit", () => {
    const TWIPS_PER_MM = 1440 / 25.4;
    const mm = (twips: number) => twips / TWIPS_PER_MM;
    const margins = sheetMarginsMm(spec);
    expect(Math.abs(margins.leftMm - mm(264))).toBeLessThan(0.02);
    expect(Math.abs(margins.topMm - mm(743))).toBeLessThan(0.02);
    // Bord gauche des cellules « étiquette » (1re et 3e colonne du tableau).
    // Tolérance de 0,2 mm : le gabarit décale sa table de −8 twips (0,14 mm),
    // compensation de bordure propre aux tableaux Word.
    [-8, 5752].forEach((cellTwips, column) => {
      expect(Math.abs(labelSlot(spec, column).xMm - mm(264 + cellTwips))).toBeLessThan(0.2);
    });
    // Le pas se lit d'une cellule « étiquette » à la suivante.
    expect(spec.columnPitchMm).toBeCloseTo(mm(5752 - -8), 2);
    expect(spec.labelWidthMm).toBeCloseTo(mm(11370 - 5752), 1);
    expect(spec.labelHeightMm).toBeCloseTo(mm(3838), 2);
    expect(spec.rowPitchMm).toBeCloseTo(mm(3838), 2);
  });

  it("compte 8 étiquettes de 99,1 × 67,7 mm", () => {
    expect(labelsPerSheet(spec)).toBe(8);
    expect(spec.labelWidthMm).toBe(99.1);
    expect(spec.labelHeightMm).toBe(67.7);
  });

  it("centre la matrice : marges 4,65 / 13,1 mm, gouttière 2,5 mm entre colonnes", () => {
    const margins = sheetMarginsMm(spec);
    expect(margins.leftMm).toBeCloseTo(4.65, 6);
    expect(margins.topMm).toBeCloseTo(13.1, 6);
    const gaps = sheetGapsMm(spec);
    expect(gaps.columnGapMm).toBeCloseTo(2.5, 6);
    expect(gaps.rowGapMm).toBeCloseTo(0, 6);
  });

  it("tient dans une A4 avec des marges symétriques", () => {
    const report = sheetFitReport(spec);
    const margins = sheetMarginsMm(spec);
    expect(report.fits).toBe(true);
    expect(report.slackRightMm).toBeCloseTo(margins.leftMm, 6);
    expect(report.slackBottomMm).toBeCloseTo(margins.topMm, 6);
  });

  it("remplit ligne par ligne, de gauche à droite", () => {
    const first = labelSlot(spec, 0);
    const second = labelSlot(spec, 1);
    const nextRow = labelSlot(spec, 2);
    expect(second.xMm - first.xMm).toBeCloseTo(spec.columnPitchMm, 6);
    expect(second.yMm).toBe(first.yMm);
    expect(nextRow.xMm).toBeCloseTo(first.xMm, 6);
    expect(nextRow.yMm - first.yMm).toBeCloseTo(spec.rowPitchMm, 6);
    const last = labelSlot(spec, 7);
    expect(last.xMm + last.widthMm).toBeLessThanOrEqual(A4_MM.widthMm);
    expect(last.yMm + last.heightMm).toBeLessThanOrEqual(A4_MM.heightMm);
  });

  it("applique le décalage de calibration", () => {
    const base = labelSlot(spec, 0);
    const shifted = labelSlot(spec, 0, { xMm: -0.8, yMm: 1.2 });
    expect(shifted.xMm).toBeCloseTo(base.xMm - 0.8, 6);
    expect(shifted.yMm).toBeCloseTo(base.yMm + 1.2, 6);
  });

  it("refuse un index hors planche", () => {
    expect(() => labelSlot(spec, 8)).toThrow(RangeError);
    expect(() => labelSlot(spec, -1)).toThrow(RangeError);
    expect(() => labelSlot(spec, 1.5)).toThrow(RangeError);
  });
});

/**
 * Contrôles valables pour **tout** format ajouté au catalogue : une planche qui
 * ne tient pas dans une A4, ou dont le lien d'achat est mal formé, échoue ici
 * avant d'arriver dans l'UI.
 */
describe("catalogue des planches", () => {
  it("n'est pas vide et n'a pas d'identifiant en double", () => {
    expect(SHEET_SPECS.length).toBeGreaterThan(0);
    const ids = SHEET_SPECS.map((sheet) => sheet.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SHEET_SPECS.map((sheet) => [sheet.id, sheet] as const))(
    "%s tient dans une A4 et se pose du haut vers le bas",
    (_id, sheet) => {
      expect(sheetFitReport(sheet).fits).toBe(true);
      // Le pas ne peut pas être plus petit que l'étiquette (chevauchement).
      expect(sheet.columnPitchMm).toBeGreaterThanOrEqual(sheet.labelWidthMm);
      expect(sheet.rowPitchMm).toBeGreaterThanOrEqual(sheet.labelHeightMm);
      const last = labelSlot(sheet, labelsPerSheet(sheet) - 1);
      expect(last.xMm + last.widthMm).toBeLessThanOrEqual(A4_MM.widthMm);
      expect(last.yMm + last.heightMm).toBeLessThanOrEqual(A4_MM.heightMm);
    },
  );

  it.each(SHEET_SPECS.map((sheet) => [sheet.id, sheet] as const))(
    "%s pointe vers une page marchande en https",
    (_id, sheet) => {
      expect(sheet.purchase).toBeDefined();
      const purchase = sheet.purchase!;
      expect(purchase.label.trim().length).toBeGreaterThan(0);
      const url = new URL(purchase.url);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).not.toBe("");
    },
  );
});
