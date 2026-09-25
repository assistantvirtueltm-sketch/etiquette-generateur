import { describe, expect, it } from "vitest";

import { emphasizeAllergens, isEmphasized, unemphasizedAllergens } from "./allergens";

describe("isEmphasized", () => {
  it("reconnaît les mots en majuscules d'au moins trois lettres", () => {
    expect(isEmphasized("BLÉ")).toBe(true);
    expect(isEmphasized("ŒUFS),")).toBe(true);
    expect(isEmphasized("(SOJA)")).toBe(true);
    expect(isEmphasized("Blé")).toBe(false);
    expect(isEmphasized("UE")).toBe(false);
    expect(isEmphasized("19%")).toBe(false);
  });
});

describe("unemphasizedAllergens", () => {
  it("signale les allergènes écrits en minuscules, une fois chacun", () => {
    const hints = unemphasizedAllergens(
      "farine de blé, beurre, œufs, lait, sucre, lait écrémé, noisettes",
    );
    expect(hints.map((hint) => hint.word)).toEqual([
      "blé",
      "beurre",
      "œufs",
      "lait",
      "noisettes",
    ]);
  });

  it("ignore les allergènes déjà en majuscules et les faux amis", () => {
    expect(
      unemphasizedAllergens(
        "farine de BLÉ, BEURRE, beurre de cacao, noix de coco, Beurre de Cacao",
      ),
    ).toEqual([]);
  });

  it("donne la position du mot dans la saisie d'origine", () => {
    const text = "Œufs, crème fraîche";
    const [first, second] = unemphasizedAllergens(text);
    expect(text.slice(first.index, first.index + first.word.length)).toBe("Œufs");
    expect(text.slice(second.index, second.index + second.word.length)).toBe("crème");
  });
});

describe("emphasizeAllergens", () => {
  it("passe les allergènes en majuscules sans toucher au reste", () => {
    expect(
      emphasizeAllergens("farine de blé, beurre de cacao, beurre, lait écrémé"),
    ).toBe("farine de BLÉ, beurre de cacao, BEURRE, LAIT écrémé");
  });

  it("laisse un texte conforme intact", () => {
    const text = "Farine de BLÉ, sucre";
    expect(emphasizeAllergens(text)).toBe(text);
  });
});
