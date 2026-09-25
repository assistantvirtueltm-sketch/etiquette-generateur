/**
 * Contenu d'une étiquette BVP, en primitives de dessin (rectangles, textes,
 * emplacement du logo) exprimées en millimètres depuis le coin haut-gauche de
 * l'étiquette.
 *
 * Module pur et unique source de vérité de la mise en page : il alimente à la
 * fois le PDF (`lib/pdf.ts`) et l'aperçu SVG de l'UI, ce qui garantit que ce que
 * l'on voit à l'écran est exactement ce qui sera imprimé.
 *
 * Règle centrale : aucun texte n'est imprimé sous la hauteur d'x minimale
 * légale, et rien n'est tronqué. Si le contenu ne tient pas au corps minimal,
 * l'étiquette est déclarée en débordement et l'impression est refusée.
 */
import type { BarPattern } from "./barcode-modules";
import {
  figureFontSizePt,
  LABEL_STYLE,
  labelBoxMm,
  minFontSizePt,
  type Orientation,
  ptToMm,
  type SheetSpec,
} from "./label-layout";
import {
  formatNumber,
  formatPrice,
  formatWeight,
  netQuantityFigureHeightMm,
  piecesLabel,
  pricePerKgCents,
  type LabelDates,
  type NutritionTable,
  type Product,
} from "./product";
import type { StoreInfo } from "./storage";
import {
  emphasisRuns,
  sanitizeForPdf,
  wrapRuns,
  type Line,
  type MeasureText,
  type Run,
} from "./text-layout";

export type { MeasureText } from "./text-layout";

export interface LabelRect {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface LabelText {
  /** Bord gauche du texte. */
  xMm: number;
  /** Ligne de base du texte (et non son sommet). */
  baselineYMm: number;
  sizePt: number;
  text: string;
  bold: boolean;
  /** Largeur mesurée du texte : l'aperçu s'en sert pour coller au PDF. */
  widthMm: number;
}

export interface LabelContent {
  /** Sens de lecture de l'étiquette. */
  orientation: Orientation;
  /** Cadre de la mise en page, dans le sens de lecture. */
  widthMm: number;
  heightMm: number;
  /** Barres noires à remplir. */
  bars: readonly LabelRect[];
  texts: readonly LabelText[];
  /** Emplacement du logo du magasin, s'il y en a un. */
  logo: LabelRect | null;
  /** Corps retenu pour le texte courant. */
  bodySizePt: number;
  /** Corps minimal légal, déduit de la hauteur d'x minimale. */
  minSizePt: number;
  /** Tout le contenu tient dans l'étiquette. */
  fits: boolean;
  /** Dépassement vertical au corps minimal (0 si tout tient). */
  overflowMm: number;
  /** X-dimension retenue. */
  moduleMm: number;
  /** Grossissement par rapport à la X-dimension nominale (1 = 100 %). */
  magnification: number;
  /** Bloquent l'impression. */
  errors: readonly string[];
  warnings: readonly string[];
}

export interface BuildLabelContentInput {
  spec: SheetSpec;
  product: Product;
  pattern: BarPattern;
  /** Chaîne lisible imprimée sous les barres. */
  humanReadable: string;
  dates: LabelDates;
  store: StoreInfo;
  /** Largeur / hauteur du logo, ou null sans logo. */
  logoAspect: number | null;
  /** Hauteur d'x minimale des mentions obligatoires. */
  minXHeightMm: number;
  /** Paysage par défaut (sens du support). */
  orientation?: Orientation;
  measure: MeasureText;
}

const style = LABEL_STYLE;

const lineHeightMm = (sizePt: number) => ptToMm(sizePt * style.lineHeightEm);
/** Ligne de base de la 1re ligne sous le haut de la boîte (≈ jambage haut). */
const firstBaselineMm = (sizePt: number) => ptToMm(sizePt) * 0.8;

/** Descend de 0,25 pt en 0,25 pt, du corps maximal au corps minimal inclus. */
function sizesFrom(maxPt: number, minPt: number): number[] {
  const sizes: number[] = [];
  for (let size = Math.max(maxPt, minPt); size > minPt + 1e-9; size -= 0.25) {
    sizes.push(Math.round(size * 100) / 100);
  }
  sizes.push(minPt);
  return sizes;
}

/** Espace insécable : un nombre n'est jamais séparé de son unité. */
const NBSP = "\u00a0";

/** Lie « 19 % » par une espace insécable dans les textes saisis. */
function bindUnits(text: string): string {
  return text.replace(/(\d) (?=%)/g, `$1${NBSP}`);
}

function nutritionRuns(table: NutritionTable, multiple: boolean): Run[] {
  const n = (value: number | null) =>
    `${value === null ? "?" : formatNumber(value)}${NBSP}`;
  const parts = [
    `énergie ${n(table.energyKj)}kJ / ${n(table.energyKcal)}kcal`,
    `matières grasses ${n(table.fat)}g, dont acides gras saturés ${n(table.saturates)}g`,
    `glucides ${n(table.carbohydrates)}g, dont sucres ${n(table.sugars)}g`,
    ...(table.fibre === null ? [] : [`fibres alimentaires ${n(table.fibre)}g`]),
    `protéines ${n(table.protein)}g`,
    `sel ${n(table.salt)}g`,
  ];
  const title = multiple && table.title.trim() ? ` – ${table.title.trim()}` : "";
  return [
    { text: `Valeurs nutritionnelles moyennes pour 100 g${title} : `, bold: false },
    { text: `${parts.join(" ; ")}.`, bold: false },
  ];
}

/** Paragraphes du corps, dans l'ordre d'impression. */
export function bodyParagraphs(product: Product): Run[][] {
  const paragraphs: Run[][] = [];
  const components = product.components.filter(
    (component) => component.ingredients.trim() !== "",
  );
  const multiple = components.length > 1;
  for (const component of components) {
    const runs: Run[] = [];
    if (multiple) runs.push({ text: `${component.name.trim()} – `, bold: true });
    runs.push({ text: "Ingrédients : ", bold: false });
    runs.push(...emphasisRuns(bindUnits(component.ingredients.trim())));
    paragraphs.push(runs);
  }
  if (product.mayContain.trim()) {
    paragraphs.push([
      { text: "Peut contenir : ", bold: false },
      ...emphasisRuns(product.mayContain.trim()),
    ]);
  }
  if (product.origin.trim()) {
    paragraphs.push([
      { text: "Origine : ", bold: false },
      ...emphasisRuns(product.origin.trim()),
    ]);
  }
  for (const table of product.nutrition) {
    paragraphs.push(nutritionRuns(table, product.nutrition.length > 1));
  }
  const mentions: Run[] = [];
  if (product.thawed) {
    mentions.push({ text: "Produit décongelé, ne pas recongeler. ", bold: true });
  }
  if (product.storage.trim()) {
    mentions.push({ text: `${product.storage.trim()} `, bold: false });
  }
  if (product.bakedToday) {
    mentions.push({ text: "Cuit et emballé le même jour.", bold: false });
  }
  if (mentions.length > 0) paragraphs.push(mentions);
  return paragraphs;
}

/** Nettoie les textes pour les polices standard PDF ; signale un remplacement. */
function sanitizeRuns(runs: readonly Run[], flag: { changed: boolean }): Run[] {
  return runs.map((run) => {
    const safe = sanitizeForPdf(run.text);
    if (safe.changed) flag.changed = true;
    return { text: safe.text, bold: run.bold };
  });
}

interface Block {
  lines: Line[];
  sizePt: number;
  heightMm: number;
}

function block(lines: Line[], sizePt: number): Block {
  return { lines, sizePt, heightMm: lines.length * lineHeightMm(sizePt) };
}

function emitBlock(
  texts: LabelText[],
  source: Block,
  xMm: number,
  topMm: number,
  align: "left" | "right" = "left",
  widthMm = 0,
) {
  source.lines.forEach((line, index) => {
    const baselineYMm =
      topMm + index * lineHeightMm(source.sizePt) + firstBaselineMm(source.sizePt);
    const lineX = align === "right" ? xMm + widthMm - line.widthMm : xMm;
    for (const piece of line.pieces) {
      texts.push({
        xMm: lineX + piece.xMm,
        baselineYMm,
        sizePt: source.sizePt,
        text: piece.text,
        bold: piece.bold,
        widthMm: piece.widthMm,
      });
    }
  });
}

export function buildLabelContent(input: BuildLabelContentInput): LabelContent {
  const { spec, product, pattern, dates, store, measure } = input;
  const orientation = input.orientation ?? "landscape";
  const box = labelBoxMm(spec, orientation);
  // En portrait, la colonne de droite serait trop étroite : le pied s'empile
  // (infos, poids et prix, puis code-barres sur toute la largeur).
  const stacked = orientation === "portrait";
  const errors: string[] = [];
  const warnings: string[] = [];
  const sanitized = { changed: false };

  const minPt = minFontSizePt(input.minXHeightMm);
  const innerLeft = style.paddingXMm;
  const innerTop = style.paddingYMm;
  const innerWidth = box.widthMm - 2 * style.paddingXMm;
  const innerBottom = box.heightMm - style.paddingYMm;

  const texts: LabelText[] = [];

  // --- En-tête : logo + dénomination -------------------------------------
  let logo: LabelRect | null = null;
  if (input.logoAspect && input.logoAspect > 0) {
    let widthMm = style.logoMaxWidthMm;
    let heightMm = widthMm / input.logoAspect;
    if (heightMm > style.logoMaxHeightMm) {
      heightMm = style.logoMaxHeightMm;
      widthMm = heightMm * input.logoAspect;
    }
    logo = { xMm: innerLeft, yMm: innerTop, widthMm, heightMm };
  }
  const nameX = logo ? innerLeft + logo.widthMm + style.gapLogoNameMm : innerLeft;
  const nameWidth = innerLeft + innerWidth - nameX;
  const nameRuns = sanitizeRuns(
    [{ text: product.name.trim().toUpperCase(), bold: true }],
    sanitized,
  );
  let name = block([], minPt);
  for (const sizePt of sizesFrom(style.nameMaxPt, minPt)) {
    name = block(wrapRuns(nameRuns, nameWidth, sizePt, measure), sizePt);
    if (name.lines.length <= 2) break;
  }
  const headerHeight = Math.max(logo?.heightMm ?? 0, name.heightMm);
  // Dénomination centrée verticalement sur le logo quand elle est plus basse.
  emitBlock(texts, name, nameX, innerTop + (headerHeight - name.heightMm) / 2);

  // --- Ligne du magasin (nom et adresse de l'exploitant) ------------------
  const storeName = store.name.trim();
  const storeAddress = store.address.trim();
  if (!storeName || !storeAddress) {
    errors.push(
      "Nom et adresse du magasin manquants (mention obligatoire) : les renseigner dans les réglages.",
    );
  }
  const storeRuns = sanitizeRuns(
    [
      { text: storeName, bold: true },
      { text: storeName && storeAddress ? ` – ${storeAddress}` : storeAddress, bold: false },
    ].filter((run) => run.text !== ""),
    sanitized,
  );
  const storeBlock = block(wrapRuns(storeRuns, innerWidth, minPt, measure), minPt);
  const storeTop = innerBottom - storeBlock.heightMm;
  emitBlock(texts, storeBlock, innerLeft, storeTop);

  // --- Pied : code-barres à gauche, dates / quantité / prix à droite ------
  const totalWithQuietModules =
    pattern.totalModules + pattern.quietLeftModules + pattern.quietRightModules;
  const barcodeMaxWidth = stacked ? innerWidth : innerWidth * 0.45;
  const moduleMm = Math.min(
    style.nominalModuleMm,
    barcodeMaxWidth / totalWithQuietModules,
  );
  const magnification = moduleMm / style.nominalModuleMm;
  if (moduleMm < style.thinModuleWarnMm) {
    warnings.push(
      `Barres très fines (${moduleMm.toFixed(3)} mm, ${Math.round(magnification * 100)} % du nominal) : vérifier la lecture en caisse avant d'imprimer.`,
    );
  }
  const barcodeWidth = totalWithQuietModules * moduleMm;
  const digitsSizeMm = ptToMm(style.digitsPt);
  const barcodeHeight =
    style.barsHeightMm + style.gapBarcodeDigitsMm + digitsSizeMm;

  const footerPt = Math.max(minPt, 7);
  const rightX = stacked
    ? innerLeft
    : innerLeft + barcodeWidth + style.gapFooterColumnsMm;
  const rightWidth = innerLeft + innerWidth - rightX;
  const perKg = pricePerKgCents(product.priceCents, product.netWeightGrams);
  const footerParagraphs: Run[][] = [
    [
      { text: "Emballé le ", bold: false },
      { text: dates.packedOn, bold: true },
      ...(product.supplierCode.trim()
        ? [{ text: ` – Réf. ${product.supplierCode.trim()}`, bold: false }]
        : []),
    ],
    [
      { text: `${dates.limitWording} `, bold: false },
      { text: dates.limit, bold: true },
    ],
    [
      { text: piecesLabel(product.pieces), bold: false },
      ...(perKg === null
        ? []
        : [{ text: ` – Prix au kg : ${formatPrice(perKg)}`, bold: false }]),
    ],
  ];
  const footerLines = footerParagraphs.flatMap((runs) =>
    wrapRuns(sanitizeRuns(runs, sanitized), rightWidth, footerPt, measure),
  );
  const infoBlock = block(footerLines, footerPt);

  // Dernière ligne : poids net (chiffres à la hauteur légale) et prix. Sur
  // une seule ligne quand la place le permet, sinon l'un sous l'autre.
  const priceText = formatPrice(product.priceCents);
  const weight =
    product.netWeightGrams === null
      ? null
      : {
          prefix: "Poids net ",
          value: formatWeight(product.netWeightGrams),
          sizePt: Math.max(
            footerPt,
            figureFontSizePt(netQuantityFigureHeightMm(product.netWeightGrams)),
          ),
        };
  const pricePt = Math.max(style.pricePt, weight?.sizePt ?? 0);
  const priceWidth = ptToMm(measure(priceText, pricePt, true));
  const weightPrefixWidth = weight
    ? ptToMm(measure(weight.prefix, footerPt, false))
    : 0;
  const weightValueWidth = weight
    ? ptToMm(measure(weight.value, weight.sizePt, true))
    : 0;
  const weightWidth = weightPrefixWidth + weightValueWidth;
  // Placement du poids et du prix. Trois dispositions, de la plus compacte à
  // la plus sûre :
  // - « side »    (paysage) : colonne de droite = infos, puis poids + prix ;
  // - « beside »  (portrait) : infos pleine largeur, puis poids et prix
  //   empilés à droite du code-barres ;
  // - « stacked » (portrait, valeurs trop larges) : infos, poids + prix,
  //   puis code-barres, tout en pleine largeur.
  const besideX = innerLeft + barcodeWidth + style.gapFooterColumnsMm;
  const besideWidth = innerLeft + innerWidth - besideX;
  const besideFits =
    priceWidth <= besideWidth &&
    (!weight || Math.max(weightPrefixWidth, weightValueWidth) <= besideWidth);
  const mode = !stacked ? "side" : besideFits ? "beside" : "stacked";

  // Lignes de chiffres seuls : pas besoin d'interligne au-delà du corps.
  const priceRowHeight = ptToMm(pricePt);
  const sameRow =
    mode !== "beside" &&
    (!weight || weightWidth + style.gapFooterColumnsMm + priceWidth <= rightWidth);
  const weightValueRowHeight = weight && !sameRow ? ptToMm(weight.sizePt) : 0;
  // En « beside », le libellé « Poids net » passe au-dessus de la valeur.
  const weightPrefixRowHeight =
    weight && mode === "beside" ? lineHeightMm(footerPt) : 0;
  const amountsHeight = weightPrefixRowHeight + weightValueRowHeight + priceRowHeight;

  let footerHeight: number;
  if (mode === "side") {
    footerHeight = Math.max(barcodeHeight, infoBlock.heightMm + amountsHeight);
  } else if (mode === "beside") {
    footerHeight =
      infoBlock.heightMm + style.gapSectionMm + Math.max(barcodeHeight, amountsHeight);
  } else {
    footerHeight =
      infoBlock.heightMm + amountsHeight + style.gapSectionMm + barcodeHeight;
  }
  const footerTop = storeTop - style.gapSectionMm - footerHeight;
  const barcodeTop =
    mode === "side"
      ? footerTop
      : mode === "beside"
        ? footerTop + infoBlock.heightMm + style.gapSectionMm
        : footerTop + footerHeight - barcodeHeight;
  /** Bas de la ligne du prix. */
  const priceRowBottom =
    mode === "stacked" ? footerTop + infoBlock.heightMm + amountsHeight : footerTop + footerHeight;
  /** Colonne des montants : bord gauche et largeur. */
  const amountsX = mode === "beside" ? besideX : rightX;
  const amountsWidth = mode === "beside" ? besideWidth : rightWidth;

  const barsX = innerLeft + pattern.quietLeftModules * moduleMm;
  const bars: LabelRect[] = pattern.bars.map((bar) => ({
    xMm: barsX + bar.xModules * moduleMm,
    yMm: barcodeTop,
    widthMm: bar.widthModules * moduleMm,
    heightMm: style.barsHeightMm,
  }));
  const digits = sanitizeForPdf(input.humanReadable).text;
  const digitsWidth = ptToMm(measure(digits, style.digitsPt, false));
  texts.push({
    xMm: barsX + (pattern.totalModules * moduleMm - digitsWidth) / 2,
    baselineYMm:
      barcodeTop + style.barsHeightMm + style.gapBarcodeDigitsMm + digitsSizeMm * 0.8,
    sizePt: style.digitsPt,
    text: digits,
    bold: false,
    widthMm: digitsWidth,
  });

  emitBlock(texts, infoBlock, rightX, footerTop);
  const priceTop = priceRowBottom - priceRowHeight;
  const priceBaseline = priceTop + firstBaselineMm(pricePt);
  if (weight) {
    const valueTop = sameRow ? priceTop : priceTop - weightValueRowHeight;
    const valueBaseline = sameRow ? priceBaseline : valueTop + firstBaselineMm(weight.sizePt);
    const beside = mode === "beside";
    texts.push(
      {
        // En « beside », libellé et valeur sont alignés à droite, sur deux lignes.
        xMm: beside ? amountsX + amountsWidth - weightPrefixWidth : amountsX,
        baselineYMm: beside
          ? valueTop - weightPrefixRowHeight + firstBaselineMm(footerPt)
          : valueBaseline,
        sizePt: footerPt,
        text: weight.prefix,
        bold: false,
        widthMm: weightPrefixWidth,
      },
      {
        xMm: beside
          ? amountsX + amountsWidth - weightValueWidth
          : amountsX + weightPrefixWidth,
        baselineYMm: valueBaseline,
        sizePt: weight.sizePt,
        text: weight.value,
        bold: true,
        widthMm: weightValueWidth,
      },
    );
  }
  texts.push({
    xMm: amountsX + amountsWidth - priceWidth,
    baselineYMm: priceBaseline,
    sizePt: pricePt,
    text: priceText,
    bold: true,
    widthMm: priceWidth,
  });

  // --- Corps : le plus grand corps qui tient, jamais sous le minimum ------
  const bodyTop = innerTop + headerHeight + style.gapSectionMm;
  const bodyAvailable = footerTop - style.gapSectionMm - bodyTop;
  const paragraphs = bodyParagraphs(product).map((runs) =>
    sanitizeRuns(runs, sanitized),
  );
  let body: Block[] = [];
  let bodySizePt = minPt;
  let bodyHeight = 0;
  for (const sizePt of sizesFrom(style.bodyMaxPt, minPt)) {
    body = paragraphs.map((runs) =>
      block(wrapRuns(runs, innerWidth, sizePt, measure), sizePt),
    );
    bodySizePt = sizePt;
    bodyHeight =
      body.reduce((sum, b) => sum + b.heightMm, 0) +
      Math.max(0, body.length - 1) * ptToMm(sizePt * style.paragraphGapEm);
    if (bodyHeight <= bodyAvailable + 1e-9) break;
  }
  let cursor = bodyTop;
  for (const paragraph of body) {
    emitBlock(texts, paragraph, innerLeft, cursor);
    cursor += paragraph.heightMm + ptToMm(bodySizePt * style.paragraphGapEm);
  }

  const overflowMm = Math.max(0, bodyHeight - bodyAvailable);
  const headerOverflow = name.lines.length > 2;
  if (overflowMm > 0) {
    errors.push(
      `Le texte dépasse l'étiquette de ${overflowMm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mm, même au corps minimal légal (${minPt.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} pt). Raccourcir la fiche : rien n'est coupé automatiquement.`,
    );
  }
  if (headerOverflow) {
    warnings.push("Dénomination longue : imprimée sur plus de deux lignes.");
  }
  if (sanitized.changed) {
    warnings.push(
      "Certains caractères ne sont pas imprimables et ont été remplacés par « ? ».",
    );
  }

  return {
    orientation,
    widthMm: box.widthMm,
    heightMm: box.heightMm,
    bars,
    texts,
    logo,
    bodySizePt,
    minSizePt: minPt,
    fits: overflowMm === 0,
    overflowMm,
    moduleMm,
    magnification,
    errors,
    warnings,
  };
}
