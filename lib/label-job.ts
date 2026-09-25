/**
 * Prépare l'étiquette d'un produit pour une date d'impression : contrôles de
 * la fiche, code-barres, dates calculées et mise en page. Utilisé tel quel par
 * l'aperçu et par le PDF, pour qu'un produit refusé à l'écran le soit aussi à
 * l'impression.
 */
import { barPattern } from "./barcode-modules";
import type { SheetSpec } from "./label-layout";
import { buildLabelContent, type LabelContent, type MeasureText } from "./label-render";
import {
  hasBlockingIssue,
  labelDates,
  productIssues,
  type Product,
  type ProductIssue,
} from "./product";
import type { LibrarySettings } from "./storage";
import { resolveCode } from "./symbology";

export interface PreparedLabel {
  product: Product;
  /** null quand le code-barres est invalide : pas de mise en page possible. */
  content: LabelContent | null;
  /** Contrôles de la fiche + contrôles de mise en page. */
  issues: ProductIssue[];
  printable: boolean;
}

export function prepareLabel(
  product: Product,
  settings: LibrarySettings,
  printedAt: Date,
  spec: SheetSpec,
  measure: MeasureText,
): PreparedLabel {
  const issues = productIssues(product);
  const code = resolveCode(product.barcode, product.symbology);
  let content: LabelContent | null = null;
  if (code.ok) {
    content = buildLabelContent({
      spec,
      product,
      pattern: barPattern(code.code.symbology, code.code.value),
      humanReadable: code.code.humanReadable,
      dates: labelDates(product, printedAt),
      store: settings.store,
      logoAspect: settings.logo
        ? settings.logo.widthPx / settings.logo.heightPx
        : null,
      minXHeightMm: settings.minXHeightMm,
      orientation: settings.orientation,
      measure,
    });
    issues.push(
      ...content.errors.map((message) => ({ level: "error" as const, message })),
      ...content.warnings.map((message) => ({
        level: "warning" as const,
        message,
      })),
    );
  }
  return {
    product,
    content,
    issues,
    printable: content !== null && !hasBlockingIssue(issues),
  };
}

export interface PrintLine {
  productId: string;
  count: number;
}

export interface SheetPlan {
  totalLabels: number;
  sheets: number;
  /** Emplacements libres sur la dernière feuille. */
  unusedOnLastSheet: number;
}

export function planSheets(
  lines: readonly PrintLine[],
  perSheet: number,
): SheetPlan {
  const totalLabels = lines.reduce(
    (sum, line) => sum + Math.max(0, Math.trunc(line.count)),
    0,
  );
  const sheets = Math.ceil(totalLabels / perSheet);
  return {
    totalLabels,
    sheets,
    unusedOnLastSheet: sheets * perSheet - totalLabels,
  };
}
