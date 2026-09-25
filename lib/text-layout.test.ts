import { describe, expect, it } from "vitest";

import { createMeasurer } from "./pdf";
import { emphasisRuns, wrapRuns } from "./text-layout";

const measure = await createMeasurer();

describe("emphasisRuns", () => {
  it("met en gras les mots en majuscules et regroupe les segments", () => {
    expect(emphasisRuns("farine de BLÉ, BEURRE 19 %")).toEqual([
      { text: "farine de ", bold: false },
      { text: "BLÉ, BEURRE ", bold: true },
      { text: "19 %", bold: false },
    ]);
  });
});

describe("wrapRuns", () => {
  const text = "Farine de BLÉ, BEURRE 19 %, eau, chocolat 10,5 % (sucre, pâte de cacao, beurre de cacao), sucre, levure, sel.";

  it("coupe aux espaces sans dépasser la largeur", () => {
    const lines = wrapRuns(emphasisRuns(text), 40, 7, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.widthMm).toBeLessThanOrEqual(40 + 1e-9);
    const rebuilt = lines
      .map((line) => line.pieces.map((piece) => piece.text).join(""))
      .join(" ");
    expect(rebuilt).toBe(text);
  });

  it("peut couper après une ponctuation collée (« sucre;levure;sel »)", () => {
    const lines = wrapRuns(
      [{ text: "sucre;levure;sel;farine;chocolat;beurre;œufs", bold: false }],
      15,
      7,
      measure,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.widthMm).toBeLessThanOrEqual(15 + 1e-9);
  });

  it("ne sépare jamais un nombre de son unité (espace insécable)", () => {
    for (let width = 8; width < 30; width += 0.5) {
      const lines = wrapRuns([{ text: "sel 0,9 g", bold: false }], width, 7, measure);
      expect(lines.some((line) => line.pieces.at(-1)?.text.endsWith("0,9"))).toBe(false);
    }
  });

  it("coupe au caractère un mot plus long que la ligne", () => {
    const lines = wrapRuns([{ text: "hémicellulases", bold: true }], 8, 7, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((line) => line.pieces[0].text).join("")).toBe("hémicellulases");
  });

  it("positionne les segments bout à bout", () => {
    const [line] = wrapRuns(emphasisRuns("farine de BLÉ"), 100, 7, measure);
    expect(line.pieces).toHaveLength(2);
    expect(line.pieces[1].xMm).toBeCloseTo(line.pieces[0].widthMm, 10);
  });
});
