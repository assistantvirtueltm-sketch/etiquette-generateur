/**
 * Géométrie de la planche d'étiquettes — SOURCE UNIQUE des cotes.
 *
 * Toutes les dimensions sont exprimées en millimètres et converties en points
 * PDF au dernier moment (voir `mmToPt`). Aucune position ne doit être écrite en
 * dur ailleurs dans le code : une erreur de 1 mm décale toute la planche et rend
 * le support papier inutilisable.
 *
 * Une planche est décrite par son **pas** (distance entre deux étiquettes
 * consécutives, cote réelle du massicot), pas par sa gouttière : c'est ainsi que
 * les fabricants spécifient leurs supports, et la gouttière s'en déduit. La
 * matrice est centrée sur la page, d'où des marges calculées plutôt que saisies.
 */

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

/** Millimètres → points PostScript (unité de pdf-lib). */
export function mmToPt(valueMm: number): number {
  return (valueMm * PT_PER_INCH) / MM_PER_INCH;
}

export const A4_MM = { widthMm: 210, heightMm: 297 } as const;

export interface SheetSpec {
  id: string;
  /** Libellé affiché dans l'UI. */
  name: string;
  /** Référence commerciale du support. */
  reference: string;
  labelWidthMm: number;
  labelHeightMm: number;
  columns: number;
  rows: number;
  /** Pas horizontal : bord gauche d'une étiquette au bord gauche de la suivante. */
  columnPitchMm: number;
  /** Pas vertical : bord haut d'une étiquette au bord haut de la suivante. */
  rowPitchMm: number;
  /** Marges imposées, si le support n'est pas centré sur la page. */
  marginLeftMm?: number;
  marginTopMm?: number;
  /** Où se procurer le support, affiché dans la fiche de la planche. */
  purchase?: PurchaseLink;
}

export interface PurchaseLink {
  /** URL absolue et https d'une page marchande. */
  url: string;
  /** Marchand et référence vendue, ex. « Amazon.fr — Agipa 102199 ». */
  label: string;
}

/**
 * Agipa (Apli) réf. 118987 — 8 étiquettes de 99,1 × 67,7 mm par feuille A4,
 * coins arrondis, 2 colonnes × 4 lignes.
 *
 * ⚠️ Cotes PROVISOIRES : le gabarit du fabricant n'a pas encore été relevé
 * (cf. `docs/agipa-118987-gabarit.md`). Ce sont les cotes de la matrice
 * standard de ce format (2 × 4, gouttière verticale de 2,5 mm entre les
 * colonnes, lignes jointives, matrice centrée : marges 4,65 / 13,1 mm). À
 * confirmer sur le gabarit Word d'Apli, puis à figer par un test comme pour
 * l'ancienne 118990.
 */
export const AGIPA_118987: SheetSpec = {
  id: "agipa-118987",
  name: "8 étiquettes 99,1 × 67,7 mm (A4)",
  reference: "Agipa 118987",
  labelWidthMm: 99.1,
  labelHeightMm: 67.7,
  columns: 2,
  rows: 4,
  columnPitchMm: 101.6,
  rowPitchMm: 67.7,
  purchase: {
    url: "https://www.bureau-vallee.fr/800-etiquettes-multi-usages-99-1x67-7-174353.html",
    label: "Bureau Vallée — Agipa 118987 (boîte de 800)",
  },
};

export const SHEET_SPECS: readonly SheetSpec[] = [AGIPA_118987];

export function labelsPerSheet(spec: SheetSpec): number {
  return spec.columns * spec.rows;
}

/** Encombrement de la matrice d'étiquettes (hors marges). */
export function matrixSizeMm(spec: SheetSpec): {
  widthMm: number;
  heightMm: number;
} {
  return {
    widthMm: (spec.columns - 1) * spec.columnPitchMm + spec.labelWidthMm,
    heightMm: (spec.rows - 1) * spec.rowPitchMm + spec.labelHeightMm,
  };
}

/**
 * Marges du support : celles déclarées par la planche, sinon celles qui
 * découlent du centrage de la matrice sur la page.
 */
export function sheetMarginsMm(spec: SheetSpec): {
  leftMm: number;
  topMm: number;
} {
  const matrix = matrixSizeMm(spec);
  return {
    leftMm: spec.marginLeftMm ?? (A4_MM.widthMm - matrix.widthMm) / 2,
    topMm: spec.marginTopMm ?? (A4_MM.heightMm - matrix.heightMm) / 2,
  };
}

/** Gouttières déduites du pas — utile à l'affichage, jamais au calcul. */
export function sheetGapsMm(spec: SheetSpec): {
  columnGapMm: number;
  rowGapMm: number;
} {
  return {
    columnGapMm: spec.columnPitchMm - spec.labelWidthMm,
    rowGapMm: spec.rowPitchMm - spec.labelHeightMm,
  };
}

/**
 * Sens de lecture de l'étiquette. Le support ne tourne pas : en portrait, le
 * contenu est composé dans un cadre hauteur × largeur puis tourné de 90° dans
 * le sens horaire à l'impression (le haut du texte vers le bord droit de
 * l'étiquette).
 */
export type Orientation = "landscape" | "portrait";

/** Cadre de mise en page d'une étiquette, dans son sens de lecture. */
export function labelBoxMm(
  spec: SheetSpec,
  orientation: Orientation,
): { widthMm: number; heightMm: number } {
  // Le « paysage » est le sens de la planche : l'étiquette telle que posée.
  return orientation === "landscape"
    ? { widthMm: spec.labelWidthMm, heightMm: spec.labelHeightMm }
    : { widthMm: spec.labelHeightMm, heightMm: spec.labelWidthMm };
}

/**
 * Passe d'un rectangle du cadre de lecture au repère de l'étiquette posée sur
 * la planche (origine en haut à gauche). Identité en paysage ; en portrait,
 * rotation de 90° horaire : (u, v) → (largeur − v, u).
 */
export function boxToSlotRect(
  spec: SheetSpec,
  orientation: Orientation,
  rect: RectMm,
): RectMm {
  if (orientation === "landscape") return rect;
  return {
    xMm: spec.labelWidthMm - (rect.yMm + rect.heightMm),
    yMm: rect.xMm,
    widthMm: rect.heightMm,
    heightMm: rect.widthMm,
  };
}

/** Décalage global d'impression, pour compenser la dérive d'une imprimante. */
export interface PrintOffsetMm {
  xMm: number;
  yMm: number;
}

export const NO_OFFSET: PrintOffsetMm = { xMm: 0, yMm: 0 };

/**
 * Rectangle exprimé depuis le coin **haut-gauche** de la page (sens de lecture),
 * converti vers le repère bas-gauche de PDF par `lib/pdf.ts`.
 */
export interface RectMm {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Emplacement de la n-ième étiquette (0 = en haut à gauche), remplissage
 * ligne par ligne, de gauche à droite.
 */
export function labelSlot(
  spec: SheetSpec,
  index: number,
  offset: PrintOffsetMm = NO_OFFSET,
): RectMm {
  const perSheet = labelsPerSheet(spec);
  if (!Number.isInteger(index) || index < 0 || index >= perSheet) {
    throw new RangeError(
      `index d'étiquette hors planche : ${index} (0..${perSheet - 1})`,
    );
  }
  const margins = sheetMarginsMm(spec);
  const column = index % spec.columns;
  const row = Math.floor(index / spec.columns);
  return {
    xMm: margins.leftMm + column * spec.columnPitchMm + offset.xMm,
    yMm: margins.topMm + row * spec.rowPitchMm + offset.yMm,
    widthMm: spec.labelWidthMm,
    heightMm: spec.labelHeightMm,
  };
}

/**
 * Contrôle que les cotes tiennent dans une A4. `slack` est l'espace restant à
 * droite / en bas une fois la dernière étiquette posée. Sert de garde-fou en
 * test : sur un support centré, il doit valoir la marge opposée.
 */
export function sheetFitReport(spec: SheetSpec): {
  usedWidthMm: number;
  usedHeightMm: number;
  slackRightMm: number;
  slackBottomMm: number;
  fits: boolean;
} {
  const margins = sheetMarginsMm(spec);
  const matrix = matrixSizeMm(spec);
  const usedWidthMm = margins.leftMm + matrix.widthMm;
  const usedHeightMm = margins.topMm + matrix.heightMm;
  const slackRightMm = A4_MM.widthMm - usedWidthMm;
  const slackBottomMm = A4_MM.heightMm - usedHeightMm;
  return {
    usedWidthMm,
    usedHeightMm,
    slackRightMm,
    slackBottomMm,
    fits: slackRightMm >= -1e-9 && slackBottomMm >= -1e-9,
  };
}

/** Points PostScript → millimètres. */
export function ptToMm(valuePt: number): number {
  return (valuePt * MM_PER_INCH) / PT_PER_INCH;
}

/**
 * Hauteur d'x de l'Helvetica, en fraction du corps (métrique AFM « XHeight »
 * 523/1000). Sert à convertir la hauteur d'x minimale légale en corps de
 * police : corps (pt) = hauteur d'x (pt) / 0,523.
 */
export const HELVETICA_X_HEIGHT_EM = 0.523;

/**
 * Hauteur des chiffres de l'Helvetica en fraction du corps (≈ 0,70, valeur
 * prise un peu basse pour rester du bon côté du minimum légal).
 */
export const HELVETICA_FIGURE_HEIGHT_EM = 0.7;

/** Corps (pt) donnant des chiffres d'au moins `heightMm` de haut. */
export function figureFontSizePt(heightMm: number): number {
  return mmToPt(heightMm) / HELVETICA_FIGURE_HEIGHT_EM;
}

/** Corps minimal (pt) pour respecter une hauteur d'x donnée (mm). */
export function minFontSizePt(xHeightMm: number): number {
  return mmToPt(xHeightMm) / HELVETICA_X_HEIGHT_EM;
}

/**
 * Mise en page interne d'une étiquette BVP, de haut en bas :
 * en-tête (logo + dénomination), corps (ingrédients, allergènes, valeurs
 * nutritionnelles, mentions), pied (code-barres à gauche, dates / quantité /
 * prix à droite), puis ligne du magasin.
 */
export const LABEL_STYLE = {
  /** Marge intérieure : le jet d'encre ne doit jamais approcher la découpe. */
  paddingXMm: 2.5,
  paddingYMm: 2.2,
  /** Emprise maximale du logo. */
  logoMaxWidthMm: 16,
  logoMaxHeightMm: 9,
  gapLogoNameMm: 2,
  nameMaxPt: 10,
  /** Interligne en fraction du corps. */
  lineHeightEm: 1.12,
  /** Corps maximal du texte courant ; il est réduit jusqu'au minimum légal. */
  bodyMaxPt: 7.5,
  gapSectionMm: 1,
  /** Espace entre deux paragraphes du corps. */
  paragraphGapEm: 0.25,
  /** Hauteur des barres (hors chiffres). */
  barsHeightMm: 10,
  gapBarcodeDigitsMm: 0.4,
  digitsPt: 7,
  gapFooterColumnsMm: 3,
  pricePt: 16,
  /** X-dimension nominale d'un EAN-13 à 100 % de grossissement. */
  nominalModuleMm: 0.33,
  /** Sous ce seuil, les barres deviennent risquées à l'impression jet d'encre. */
  thinModuleWarnMm: 0.25,
} as const;
