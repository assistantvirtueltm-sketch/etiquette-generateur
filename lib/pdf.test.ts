import { inflateSync } from "node:zlib";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { assortiment, painAuChocolat, SAMPLE_SETTINGS } from "./fixtures";
import { A4_MM, AGIPA_118987, labelSlot, mmToPt } from "./label-layout";
import { buildCalibrationPdf, buildPrintPdf, LabelRefusedError, sanitizeForPdf } from "./pdf";

const spec = AGIPA_118987;
const DAY = new Date(2026, 8, 25);
// 1x1 PNG transparent.
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Contenu décompressé des flux du PDF, pour compter les opérateurs de dessin. */
function contentStreams(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const chunks: string[] = [];
  let from = 0;
  for (;;) {
    const start = buf.indexOf("stream", from);
    if (start < 0) break;
    const dataStart = buf[start + 6] === 0x0d ? start + 8 : start + 7;
    const end = buf.indexOf("endstream", dataStart);
    if (end < 0) break;
    const chunk = buf.subarray(dataStart, end);
    try {
      chunks.push(inflateSync(chunk).toString("latin1"));
    } catch {
      chunks.push(chunk.toString("latin1"));
    }
    from = end + 9;
  }
  return chunks.join("\n");
}

const countOps = (content: string, pattern: RegExp) =>
  (content.match(pattern) ?? []).length;

/** Premier déplacement `cm` du flux : origine de la 1re barre dessinée. */
function firstTranslate(bytes: Uint8Array): { xPt: number; yPt: number } {
  const match = contentStreams(bytes).match(
    /1 0 0 1 (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) cm/,
  );
  if (!match) throw new Error("aucune barre");
  return { xPt: Number(match[1]), yPt: Number(match[2]) };
}

describe("buildPrintPdf", () => {
  it("enchaîne les produits sur autant de feuilles A4 que nécessaire", async () => {
    const pdf = await buildPrintPdf(
      [
        { product: painAuChocolat(), count: 5 },
        { product: assortiment(), count: 4 },
      ],
      SAMPLE_SETTINGS,
      DAY,
    );
    expect(Buffer.from(pdf.bytes).toString("latin1", 0, 5)).toBe("%PDF-");
    expect(pdf.labelCount).toBe(9);
    expect(pdf.sheetCount).toBe(2);
    expect(pdf.fileName).toBe("etiquettes-2026-09-25.pdf");
    expect(pdf.warnings).toEqual([]);

    const reloaded = await PDFDocument.load(pdf.bytes);
    expect(reloaded.getPageCount()).toBe(2);
    const size = reloaded.getPage(0).getSize();
    expect(size.width).toBeCloseTo(mmToPt(A4_MM.widthMm), 6);
    expect(size.height).toBeCloseTo(mmToPt(A4_MM.heightMm), 6);

    const content = contentStreams(pdf.bytes);
    // 30 barres vectorielles (chemins remplis) par étiquette, aucune image.
    expect(countOps(content, /\nf\n/g)).toBe(30 * 9);
    expect(content).not.toMatch(/\bDo\b/);
  });

  it("pose la 1re barre dans le 1er emplacement de la planche", async () => {
    const pdf = await buildPrintPdf(
      [{ product: painAuChocolat(), count: 1 }],
      SAMPLE_SETTINGS,
      DAY,
    );
    const { xPt, yPt } = firstTranslate(pdf.bytes);
    const slot = labelSlot(spec, 0);
    expect(xPt).toBeGreaterThan(mmToPt(slot.xMm));
    expect(xPt).toBeLessThan(mmToPt(slot.xMm + slot.widthMm / 2));
    const topMm = A4_MM.heightMm - yPt / mmToPt(1);
    expect(topMm).toBeGreaterThan(slot.yMm);
    expect(topMm).toBeLessThan(slot.yMm + slot.heightMm);
  });

  it("applique le décalage de calibration à toute la planche", async () => {
    const jobs = [{ product: painAuChocolat(), count: 1 }];
    const base = await buildPrintPdf(jobs, SAMPLE_SETTINGS, DAY);
    const shifted = await buildPrintPdf(
      jobs,
      { ...SAMPLE_SETTINGS, offsetXMm: 1 },
      DAY,
    );
    expect(firstTranslate(shifted.bytes).xPt - firstTranslate(base.bytes).xPt).toBeCloseTo(
      mmToPt(1),
      6,
    );
  });

  it("embarque le logo une seule fois et le dessine sur chaque étiquette", async () => {
    const pdf = await buildPrintPdf(
      [{ product: painAuChocolat(), count: 3 }],
      { ...SAMPLE_SETTINGS, logo: { dataUrl: PNG_1PX, widthPx: 1, heightPx: 1 } },
      DAY,
    );
    const content = contentStreams(pdf.bytes);
    expect(countOps(content, /\bDo\b/g)).toBe(3);
  });

  it("refuse tout le lot si une fiche est invalide", async () => {
    const broken = { ...assortiment(), priceCents: 0 };
    await expect(
      buildPrintPdf(
        [
          { product: painAuChocolat(), count: 2 },
          { product: broken, count: 2 },
        ],
        SAMPLE_SETTINGS,
        DAY,
      ),
    ).rejects.toBeInstanceOf(LabelRefusedError);
  });

  it("refuse une demande vide", async () => {
    await expect(
      buildPrintPdf([{ product: painAuChocolat(), count: 0 }], SAMPLE_SETTINGS, DAY),
    ).rejects.toThrow("Aucune étiquette");
  });
});

describe("buildCalibrationPdf", () => {
  it("trace les 8 emplacements numérotés", async () => {
    const pdf = await buildCalibrationPdf(spec, { xMm: 0.5, yMm: -0.5 });
    const content = contentStreams(pdf.bytes);
    // Un contour (chemin tracé) par emplacement.
    expect(countOps(content, /\nS\n/g)).toBe(8);
    // 8 numéros + la ligne d'en-tête rappelant le décalage.
    expect(countOps(content, /Tj/g)).toBe(9);
    expect(pdf.fileName).toBe("calibration-agipa-118987.pdf");
  });
});

describe("sanitizeForPdf", () => {
  it("laisse passer les accents et remplace l'inconnu", () => {
    expect(sanitizeForPdf("Crème brûlée – ŒUF 250 g")).toEqual({
      text: "Crème brûlée – ŒUF 250 g",
      changed: false,
    });
    expect(sanitizeForPdf("Bonbons 🍬")).toEqual({
      text: "Bonbons ?",
      changed: true,
    });
  });

  it("aplatit les retours à la ligne saisis", () => {
    expect(sanitizeForPdf("farine,\nsucre")).toEqual({
      text: "farine, sucre",
      changed: false,
    });
  });
});
