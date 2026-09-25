import { describe, expect, it } from "vitest";

import { barPattern } from "./barcode-modules";
import { assortiment, painAuChocolat, SAMPLE_SETTINGS } from "./fixtures";
import { AGIPA_118987, LABEL_STYLE, minFontSizePt } from "./label-layout";
import { prepareLabel } from "./label-job";
import { bodyParagraphs, buildLabelContent } from "./label-render";
import { labelDates, type Product } from "./product";
import { createMeasurer } from "./pdf";
import type { LibrarySettings } from "./storage";
import { resolveCode } from "./symbology";

const spec = AGIPA_118987;
const measure = await createMeasurer();
const DAY = new Date(2026, 8, 25);

function render(product: Product, settings: LibrarySettings = SAMPLE_SETTINGS) {
  const prepared = prepareLabel(product, settings, DAY, spec, measure);
  if (!prepared.content) throw new Error("code-barres invalide");
  return { prepared, content: prepared.content };
}

function allText(product: Product, settings?: LibrarySettings): string {
  return render(product, settings).content.texts.map((t) => t.text).join(" ");
}

describe("barPattern", () => {
  it("décode un EAN-13 en 95 modules et 30 barres", () => {
    const pattern = barPattern("ean13", "2000000271040");
    expect(pattern.totalModules).toBe(95);
    expect(pattern.bars).toHaveLength(30);
    expect(pattern.quietLeftModules).toBe(11);
    expect(pattern.quietRightModules).toBe(7);
  });

  it("décode les autres symbologies", () => {
    expect(barPattern("ean8", "96385074").totalModules).toBe(67);
    expect(barPattern("upca", "036000291452").totalModules).toBe(95);
    expect(barPattern("code128", "REF-1234").totalModules).toBeGreaterThan(0);
  });
});

describe("étiquette BVP", () => {
  it("imprime une fiche complète sans erreur, au corps maximal", () => {
    const { prepared, content } = render(painAuChocolat());
    expect(prepared.issues).toEqual([]);
    expect(prepared.printable).toBe(true);
    expect(content.fits).toBe(true);
    expect(content.bodySizePt).toBe(LABEL_STYLE.bodyMaxPt);
  });

  it("garde tout le contenu dans l'étiquette, marges intérieures comprises", () => {
    for (const product of [painAuChocolat(), assortiment()]) {
      const { content } = render(product);
      for (const text of content.texts) {
        expect(text.xMm).toBeGreaterThanOrEqual(LABEL_STYLE.paddingXMm - 1e-6);
        expect(text.xMm + text.widthMm).toBeLessThanOrEqual(
          spec.labelWidthMm - LABEL_STYLE.paddingXMm + 1e-6,
        );
        expect(text.baselineYMm).toBeLessThanOrEqual(
          spec.labelHeightMm - LABEL_STYLE.paddingYMm,
        );
      }
      for (const bar of content.bars) {
        expect(bar.yMm + bar.heightMm).toBeLessThan(spec.labelHeightMm);
      }
    }
  });

  it("n'imprime aucun texte sous le corps minimal légal", () => {
    const { content } = render(assortiment());
    const minPt = minFontSizePt(SAMPLE_SETTINGS.minXHeightMm);
    for (const text of content.texts) {
      expect(text.sizePt).toBeGreaterThanOrEqual(minPt - 1e-9);
    }
    // L'assortiment, plus long, descend au corps minimal mais tient.
    expect(content.fits).toBe(true);
    expect(content.bodySizePt).toBeLessThan(LABEL_STYLE.bodyMaxPt);
  });

  it("refuse une fiche trop longue au lieu de la tronquer", () => {
    const product = assortiment();
    product.components.push({
      id: "c4",
      name: "Mini brioche",
      ingredients: product.components[1].ingredients,
    });
    const { prepared, content } = render(product);
    expect(content.fits).toBe(false);
    expect(content.overflowMm).toBeGreaterThan(0);
    expect(prepared.printable).toBe(false);
    expect(prepared.issues.map((i) => i.message).join(" ")).toContain(
      "dépasse l'étiquette",
    );
    // Rien n'est coupé : le dernier ingrédient figure toujours dans le rendu.
    expect(allText(product)).toContain("Mini brioche");
  });

  it("tient au minimal de 0,9 mm ce qui déborde à 1,2 mm", () => {
    const product = assortiment();
    product.components.push({
      id: "c4",
      name: "Mini brioche",
      ingredients: product.components[1].ingredients,
    });
    const { content } = render(product, { ...SAMPLE_SETTINGS, minXHeightMm: 0.9 });
    expect(content.fits).toBe(true);
  });

  it("met les allergènes (mots en majuscules) en gras", () => {
    const { content } = render(painAuChocolat());
    const bold = content.texts.filter((t) => t.bold).map((t) => t.text).join(" ");
    const regular = content.texts.filter((t) => !t.bold).map((t) => t.text).join(" ");
    expect(bold).toContain("BLÉ");
    expect(bold).toContain("SOJA");
    expect(bold).toContain("ŒUF");
    expect(regular).toContain("noisettes");
    expect(regular).not.toContain("SOJA");
  });

  it("imprime les dates calculées, la quantité et le prix", () => {
    const product = painAuChocolat();
    const text = allText(product);
    const dates = labelDates(product, DAY);
    expect(dates).toEqual({
      packedOn: "25/09/2026",
      limitWording: "À consommer de préférence avant le",
      limit: "29/09/2026",
    });
    expect(text).toContain("25/09/2026");
    expect(text).toContain("À consommer de préférence avant le");
    expect(text).toContain("29/09/2026");
    expect(text).toContain("4 pièces");
    expect(text).toContain("3,00 €");
    expect(text).toContain("2 000000 271040");
  });

  it("utilise la formule de la DLC", () => {
    const product = { ...painAuChocolat(), dateKind: "dlc" as const };
    expect(allText(product)).toContain("À consommer jusqu'au");
  });

  it("imprime la mention décongelé et la référence fournisseur", () => {
    const product = {
      ...painAuChocolat(),
      thawed: true,
      bakedToday: false,
      supplierCode: "123456",
    };
    const text = allText(product);
    expect(text).toContain("Produit décongelé, ne pas recongeler.");
    expect(text).not.toContain("Cuit et emballé le même jour");
    expect(text).toContain("Réf. 123456");
  });

  it("exige le nom et l'adresse du magasin", () => {
    const { prepared } = render(painAuChocolat(), {
      ...SAMPLE_SETTINGS,
      store: { name: "", address: "" },
    });
    expect(prepared.printable).toBe(false);
    expect(prepared.issues.map((i) => i.message).join(" ")).toContain(
      "adresse du magasin",
    );
  });

  it("place le logo en haut à gauche et décale la dénomination", () => {
    const withLogo = render(painAuChocolat(), {
      ...SAMPLE_SETTINGS,
      logo: { dataUrl: "data:image/png;base64,AA==", widthPx: 120, heightPx: 66 },
    }).content;
    const withoutLogo = render(painAuChocolat()).content;
    expect(withLogo.logo).not.toBeNull();
    expect(withLogo.logo!.widthMm).toBeLessThanOrEqual(LABEL_STYLE.logoMaxWidthMm);
    expect(withLogo.logo!.heightMm).toBeLessThanOrEqual(LABEL_STYLE.logoMaxHeightMm);
    expect(withLogo.texts[0].xMm).toBeGreaterThan(
      withLogo.logo!.xMm + withLogo.logo!.widthMm,
    );
    expect(withoutLogo.logo).toBeNull();
  });

  it("garde le code-barres à la X-dimension nominale, zones de silence comprises", () => {
    const { content } = render(painAuChocolat());
    expect(content.moduleMm).toBeCloseTo(LABEL_STYLE.nominalModuleMm, 10);
    const pattern = barPattern("ean13", "2000000271040");
    const first = content.bars[0];
    expect(first.xMm - pattern.quietLeftModules * content.moduleMm).toBeGreaterThanOrEqual(
      LABEL_STYLE.paddingXMm - 1e-9,
    );
    // Aucun texte ne mord sur le bloc code-barres (zones de silence incluses).
    const blockRight =
      first.xMm + (pattern.totalModules + pattern.quietRightModules) * content.moduleMm;
    const barsTop = first.yMm;
    const barsBottom = first.yMm + first.heightMm;
    for (const text of content.texts) {
      const inBand = text.baselineYMm > barsTop && text.baselineYMm < barsBottom;
      if (inBand) expect(text.xMm).toBeGreaterThanOrEqual(blockRight);
    }
  });

  it("alerte quand un Code 128 rend les barres trop fines", () => {
    const product = {
      ...painAuChocolat(),
      barcode: "REFERENCE-INTERNE-2026-000123456789",
      symbology: "code128" as const,
    };
    const resolved = resolveCode(product.barcode, product.symbology);
    expect(resolved.ok).toBe(true);
    const { content } = render(product);
    expect(content.moduleMm).toBeLessThan(LABEL_STYLE.thinModuleWarnMm);
    expect(content.warnings.join(" ")).toContain("Barres très fines");
  });

  it("remplace les caractères non imprimables et le signale", () => {
    const product = { ...painAuChocolat(), name: "Croissant 🥐" };
    const { content } = render(product);
    expect(content.texts[0].text).toContain("?");
    expect(content.warnings.join(" ")).toContain("caractères");
  });
});

describe("bodyParagraphs", () => {
  it("préfixe chaque composant d'un assortiment par son nom", () => {
    const paragraphs = bodyParagraphs(assortiment());
    expect(paragraphs[0][0]).toEqual({ text: "Mini croissant – ", bold: true });
    expect(paragraphs[2][0].text).toContain("Mini pain aux raisins");
  });

  it("lie les nombres à leur unité par une espace insécable", () => {
    const text = bodyParagraphs(painAuChocolat())
      .flat()
      .map((run) => run.text)
      .join("");
    expect(text).toContain("19 %");
    expect(text).toContain("sel 0,9 g");
  });

  it("n'imprime pas de valeurs nutritionnelles quand il n'y en a pas", () => {
    const text = bodyParagraphs({ ...painAuChocolat(), nutrition: [] })
      .flat()
      .map((run) => run.text)
      .join("");
    expect(text).not.toContain("Valeurs nutritionnelles");
  });

  it("titre les tableaux quand il y en a plusieurs", () => {
    const product = painAuChocolat();
    product.nutrition = [
      { ...product.nutrition[0], id: "a", title: "Dots Pink" },
      { ...product.nutrition[0], id: "b", title: "Dots Yellow" },
    ];
    const text = bodyParagraphs(product).flat().map((r) => r.text).join("");
    expect(text).toContain("pour 100 g – Dots Pink");
    expect(text).toContain("pour 100 g – Dots Yellow");
  });
});

describe("buildLabelContent", () => {
  it("reste pur : même entrée, même sortie", () => {
    const product = painAuChocolat();
    const input = {
      spec,
      product,
      pattern: barPattern("ean13", "2000000271040"),
      humanReadable: "2 000000 271040",
      dates: labelDates(product, DAY),
      store: SAMPLE_SETTINGS.store,
      logoAspect: null,
      minXHeightMm: 1.2,
      measure,
    };
    expect(buildLabelContent(input)).toEqual(buildLabelContent(input));
  });
});
