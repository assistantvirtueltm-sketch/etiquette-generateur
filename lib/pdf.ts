/**
 * Génération des PDF (planches d'étiquettes du jour et planche de calibration).
 *
 * pdf-lib construit le document en mémoire dans le navigateur : les barres sont
 * des rectangles vectoriels, les textes des polices standard. Seul le logo du
 * magasin est une image ; le code-barres n'en est jamais une.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";

import {
  A4_MM,
  AGIPA_118987,
  labelSlot,
  labelsPerSheet,
  mmToPt,
  NO_OFFSET,
  sheetMarginsMm,
  type PrintOffsetMm,
  type SheetSpec,
} from "./label-layout";
import { prepareLabel, planSheets, type PreparedLabel } from "./label-job";
import type { LabelContent, MeasureText } from "./label-render";
import { localDay, type Product } from "./product";
import type { LibrarySettings } from "./storage";

export { sanitizeForPdf } from "./text-layout";

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

function measurerFor(fonts: Fonts): MeasureText {
  return (text, sizePt, bold) =>
    (bold ? fonts.bold : fonts.regular).widthOfTextAtSize(text, sizePt);
}

/**
 * Mesureur de texte partagé avec l'aperçu de l'UI : l'aperçu utilise les mêmes
 * métriques de police que le PDF, donc la même mise en page au dixième de mm.
 */
export async function createMeasurer(): Promise<MeasureText> {
  const doc = await PDFDocument.create();
  return measurerFor({
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  });
}

export interface PrintJob {
  product: Product;
  count: number;
}

export interface GeneratedPdf {
  bytes: Uint8Array;
  fileName: string;
  labelCount: number;
  sheetCount: number;
  warnings: readonly string[];
}

/** Levée quand au moins un produit ne peut pas être imprimé. */
export class LabelRefusedError extends Error {
  constructor(readonly refused: readonly PreparedLabel[]) {
    super(
      `Impression refusée : ${refused
        .map(
          (label) =>
            `« ${label.product.name || "sans nom"} » (${label.issues.find((i) => i.level === "error")?.message ?? "fiche invalide"})`,
        )
        .join(" ; ")}`,
    );
    this.name = "LabelRefusedError";
  }
}

function isoDay(date: Date): string {
  const day = localDay(date);
  const mm = String(day.getMonth() + 1).padStart(2, "0");
  const dd = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${mm}-${dd}`;
}

function drawLabel(
  page: ReturnType<PDFDocument["addPage"]>,
  content: LabelContent,
  slotX: number,
  slotY: number,
  fonts: Fonts,
  logo: PDFImage | null,
) {
  const pageHeightPt = page.getHeight();
  const black = rgb(0, 0, 0);
  for (const bar of content.bars) {
    page.drawRectangle({
      x: mmToPt(slotX + bar.xMm),
      y: pageHeightPt - mmToPt(slotY + bar.yMm + bar.heightMm),
      width: mmToPt(bar.widthMm),
      height: mmToPt(bar.heightMm),
      color: black,
    });
  }
  for (const text of content.texts) {
    page.drawText(text.text, {
      x: mmToPt(slotX + text.xMm),
      y: pageHeightPt - mmToPt(slotY + text.baselineYMm),
      size: text.sizePt,
      font: text.bold ? fonts.bold : fonts.regular,
      color: black,
    });
  }
  if (logo && content.logo) {
    page.drawImage(logo, {
      x: mmToPt(slotX + content.logo.xMm),
      y: pageHeightPt - mmToPt(slotY + content.logo.yMm + content.logo.heightMm),
      width: mmToPt(content.logo.widthMm),
      height: mmToPt(content.logo.heightMm),
    });
  }
}

/**
 * Planches du jour : les étiquettes de chaque produit se suivent, feuille
 * après feuille, de gauche à droite puis de haut en bas. Refuse l'impression
 * (sans rien produire) si une seule fiche est invalide ou déborde.
 */
export async function buildPrintPdf(
  jobs: readonly PrintJob[],
  settings: LibrarySettings,
  printedAt: Date,
  spec: SheetSpec = AGIPA_118987,
): Promise<GeneratedPdf> {
  const wanted = jobs.filter((job) => Math.trunc(job.count) > 0);
  if (wanted.length === 0) throw new Error("Aucune étiquette demandée.");

  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const measure = measurerFor(fonts);

  const prepared = wanted.map((job) =>
    prepareLabel(job.product, settings, printedAt, spec, measure),
  );
  const refused = prepared.filter((label) => !label.printable);
  if (refused.length > 0) throw new LabelRefusedError(refused);

  let logo: PDFImage | null = null;
  if (settings.logo) {
    logo = settings.logo.dataUrl.startsWith("data:image/png")
      ? await doc.embedPng(settings.logo.dataUrl)
      : await doc.embedJpg(settings.logo.dataUrl);
  }

  const day = isoDay(printedAt);
  doc.setTitle(`Étiquettes du ${day}`);
  doc.setSubject(`${spec.reference} — ${spec.name}`);
  doc.setCreator("etiquettes-bvp");

  const perSheet = labelsPerSheet(spec);
  const offset: PrintOffsetMm = { xMm: settings.offsetXMm, yMm: settings.offsetYMm };
  const plan = planSheets(
    wanted.map((job) => ({ productId: job.product.id, count: job.count })),
    perSheet,
  );

  let page: ReturnType<PDFDocument["addPage"]> | null = null;
  let index = 0;
  wanted.forEach((job, jobIndex) => {
    const content = prepared[jobIndex].content!;
    for (let n = 0; n < Math.trunc(job.count); n++, index++) {
      const slotIndex = index % perSheet;
      if (slotIndex === 0) {
        page = doc.addPage([mmToPt(A4_MM.widthMm), mmToPt(A4_MM.heightMm)]);
      }
      const slot = labelSlot(spec, slotIndex, offset);
      drawLabel(page!, content, slot.xMm, slot.yMm, fonts, logo);
    }
  });

  const warnings = [
    ...new Set(
      prepared.flatMap((label) =>
        label.issues
          .filter((issue) => issue.level === "warning")
          .map((issue) => `${label.product.name} : ${issue.message}`),
      ),
    ),
  ];

  return {
    bytes: await doc.save(),
    fileName: `etiquettes-${day}.pdf`,
    labelCount: plan.totalLabels,
    sheetCount: plan.sheets,
    warnings,
  };
}

/**
 * Planche de calibration à imprimer sur papier ordinaire : contour de chaque
 * emplacement + numéro, pour vérifier l'alignement (et le décalage appliqué)
 * avant de consommer un support adhésif.
 */
export async function buildCalibrationPdf(
  spec: SheetSpec = AGIPA_118987,
  offset: PrintOffsetMm = NO_OFFSET,
): Promise<GeneratedPdf> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Calibration ${spec.reference}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([mmToPt(A4_MM.widthMm), mmToPt(A4_MM.heightMm)]);
  const pageHeightPt = page.getHeight();
  const ink = rgb(0.45, 0.45, 0.45);

  page.drawText(
    `Calibration ${spec.reference} — ${spec.name} — décalage X ${offset.xMm.toFixed(1)} mm / Y ${offset.yMm.toFixed(1)} mm`,
    {
      x: mmToPt(Math.max(sheetMarginsMm(spec).leftMm, 5)),
      y: pageHeightPt - mmToPt(6),
      size: 7,
      font,
      color: ink,
    },
  );

  const perSheet = labelsPerSheet(spec);
  for (let i = 0; i < perSheet; i++) {
    const slot = labelSlot(spec, i, offset);
    page.drawRectangle({
      x: mmToPt(slot.xMm),
      y: pageHeightPt - mmToPt(slot.yMm + slot.heightMm),
      width: mmToPt(slot.widthMm),
      height: mmToPt(slot.heightMm),
      borderColor: ink,
      borderWidth: 0.25,
    });
    const labelNumber = String(i + 1);
    page.drawText(labelNumber, {
      x:
        mmToPt(slot.xMm + slot.widthMm / 2) -
        font.widthOfTextAtSize(labelNumber, 10) / 2,
      y: pageHeightPt - mmToPt(slot.yMm + slot.heightMm / 2) - 3,
      size: 10,
      font,
      color: ink,
    });
  }

  return {
    bytes: await doc.save(),
    fileName: `calibration-${spec.id}.pdf`,
    labelCount: perSheet,
    sheetCount: 1,
    warnings: [],
  };
}
