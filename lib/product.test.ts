import { describe, expect, it } from "vitest";

import { assortiment, painAuChocolat } from "./fixtures";
import {
  addDays,
  emptyNutrition,
  emptyProduct,
  formatPrice,
  formatWeight,
  hasBlockingIssue,
  labelDates,
  parseNumber,
  netQuantityFigureHeightMm,
  parsePrice,
  piecesLabel,
  pricePerKgCents,
  productIssues,
} from "./product";

const messages = (product: Parameters<typeof productIssues>[0]) =>
  productIssues(product).map((issue) => `${issue.level}: ${issue.message}`);

describe("productIssues", () => {
  it("accepte les fiches d'exemple", () => {
    expect(productIssues(painAuChocolat())).toEqual([]);
    expect(productIssues(assortiment())).toEqual([]);
  });

  it("bloque une fiche vide sur chaque champ obligatoire", () => {
    const issues = messages(emptyProduct());
    expect(issues.join("\n")).toMatch(/error: Dénomination/);
    expect(issues.join("\n")).toMatch(/error: Code-barres/);
    expect(issues.join("\n")).toMatch(/error: Prix/);
    expect(issues.join("\n")).toMatch(/error: Liste des ingrédients/);
    expect(hasBlockingIssue(productIssues(emptyProduct()))).toBe(true);
  });

  it("refuse un code caisse à la clé fausse", () => {
    const issues = messages({ ...painAuChocolat(), barcode: "2000000271041" });
    expect(issues.join(" ")).toContain("Clé de contrôle invalide");
  });

  it("valide la référence fournisseur sur 6 ou 9 chiffres", () => {
    expect(messages({ ...painAuChocolat(), supplierCode: "123456" })).toEqual([]);
    expect(messages({ ...painAuChocolat(), supplierCode: "123456789" })).toEqual([]);
    expect(messages({ ...painAuChocolat(), supplierCode: "12345" }).join(" ")).toContain(
      "6 ou 9 chiffres",
    );
  });

  it("exige un nom pour chaque composant d'un assortiment", () => {
    const product = assortiment();
    product.components[1] = { ...product.components[1], name: "" };
    expect(messages(product).join(" ")).toContain("Composant n° 2 : nom manquant");
  });

  it("signale un allergène en minuscules sans bloquer", () => {
    const product = painAuChocolat();
    product.components[0] = {
      ...product.components[0],
      ingredients: "farine de blé, lait, beurre de cacao",
    };
    const issues = productIssues(product);
    expect(hasBlockingIssue(issues)).toBe(false);
    expect(issues[0].message).toContain("blé, lait");
    expect(issues[0].message).not.toContain("beurre");
  });

  it("bloque un tableau nutritionnel incomplet, pas l'absence de tableau", () => {
    const incomplete = { ...painAuChocolat(), nutrition: [emptyNutrition()] };
    expect(hasBlockingIssue(productIssues(incomplete))).toBe(true);
    const none = { ...painAuChocolat(), nutrition: [] };
    expect(hasBlockingIssue(productIssues(none))).toBe(false);
    expect(messages(none).join(" ")).toContain("Aucune déclaration nutritionnelle");
  });

  it("met en garde contre « cuit le jour même » sur un produit décongelé", () => {
    const product = { ...painAuChocolat(), thawed: true, bakedToday: true };
    expect(messages(product).join(" ")).toContain("induire le consommateur en erreur");
  });

  it("borne la durée de vie", () => {
    expect(hasBlockingIssue(productIssues({ ...painAuChocolat(), shelfLifeDays: -1 }))).toBe(true);
    expect(hasBlockingIssue(productIssues({ ...painAuChocolat(), shelfLifeDays: 91 }))).toBe(true);
    expect(hasBlockingIssue(productIssues({ ...painAuChocolat(), shelfLifeDays: 0 }))).toBe(false);
  });
});

describe("dates", () => {
  it("calcule la date limite en jours calendaires, fin de mois comprise", () => {
    const product = { ...painAuChocolat(), dateKind: "dlc" as const, shelfLifeDays: 3 };
    expect(labelDates(product, new Date(2026, 8, 29, 23, 59))).toEqual({
      packedOn: "29/09/2026",
      limitWording: "À consommer jusqu'au",
      limit: "02/10/2026",
    });
    expect(addDays(new Date(2026, 11, 30), 3).getFullYear()).toBe(2027);
  });

  it("franchit le changement d'heure sans décaler le jour", () => {
    // Passage à l'heure d'hiver le 25/10/2026 en France.
    const product = { ...painAuChocolat(), shelfLifeDays: 1 };
    expect(labelDates(product, new Date(2026, 9, 24, 23, 30)).limit).toBe("25/10/2026");
    expect(labelDates(product, new Date(2026, 9, 25, 0, 30)).limit).toBe("26/10/2026");
  });
});

describe("poids net et prix au kilo", () => {
  it("calcule le prix au kilo arrondi au centime", () => {
    expect(pricePerKgCents(300, 220)).toBe(1364);
    expect(pricePerKgCents(420, 300)).toBe(1400);
    expect(pricePerKgCents(389, 220)).toBe(1768);
    expect(pricePerKgCents(300, null)).toBeNull();
  });

  it("donne la hauteur légale des chiffres selon le poids", () => {
    expect(netQuantityFigureHeightMm(50)).toBe(2);
    expect(netQuantityFigureHeightMm(51)).toBe(3);
    expect(netQuantityFigureHeightMm(200)).toBe(3);
    expect(netQuantityFigureHeightMm(220)).toBe(4);
    expect(netQuantityFigureHeightMm(1000)).toBe(4);
    expect(netQuantityFigureHeightMm(1001)).toBe(6);
  });

  it("formate le poids en g puis en kg", () => {
    expect(formatWeight(220)).toBe("220 g");
    expect(formatWeight(1250)).toBe("1,25 kg");
  });

  it("avertit sans poids, bloque un poids aberrant", () => {
    const none = productIssues({ ...painAuChocolat(), netWeightGrams: null });
    expect(hasBlockingIssue(none)).toBe(false);
    expect(none[0].message).toContain("Poids net non renseigné");
    expect(hasBlockingIssue(productIssues({ ...painAuChocolat(), netWeightGrams: -1 }))).toBe(true);
    expect(hasBlockingIssue(productIssues({ ...painAuChocolat(), netWeightGrams: 0 }))).toBe(true);
  });
});

describe("formats", () => {
  it("lit et écrit les prix à la française", () => {
    expect(parsePrice("3,00")).toBe(300);
    expect(parsePrice("3.5")).toBe(350);
    expect(parsePrice("4,20 €")).toBe(420);
    expect(parsePrice("12")).toBe(1200);
    expect(parsePrice("3,999")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
    expect(formatPrice(300)).toBe("3,00 €");
    expect(formatPrice(1205)).toBe("12,05 €");
  });

  it("lit les valeurs nutritionnelles", () => {
    expect(parseNumber("7,6")).toBe(7.6);
    expect(parseNumber(" ")).toBeNull();
    expect(parseNumber("7,6g")).toBeUndefined();
  });

  it("accorde le nombre de pièces", () => {
    expect(piecesLabel(1)).toBe("1 pièce");
    expect(piecesLabel(4)).toBe("4 pièces");
  });
});
