/**
 * Test de bout en bout de l'encodage : on reconstruit la trame de modules
 * depuis les rectangles millimétrés de l'étiquette, puis on la **décode** avec
 * les tables EAN normatives. Cela valide toute la chaîne (bwip-js → modules →
 * millimètres → arrondis) sans faire confiance à l'encodeur sur parole.
 */
import { describe, expect, it } from "vitest";

import { barPattern } from "./barcode-modules";
import { painAuChocolat, SAMPLE_SETTINGS } from "./fixtures";
import { AGIPA_118987, boxToSlotRect } from "./label-layout";
import { prepareLabel } from "./label-job";
import { createMeasurer } from "./pdf";
import { resolveCode, type Symbology } from "./symbology";

const measure = await createMeasurer();

const L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const R = L.map((bits) => [...bits].map((b) => (b === "0" ? "1" : "0")).join(""));
const G = R.map((bits) => [...bits].reverse().join(""));
const FIRST_DIGIT_PARITY = [
  "OOOOOO", "OOEOEE", "OOEEOE", "OOEEEO", "OEOOEE",
  "OEEOOE", "OEEEOO", "OEOEOE", "OEOEEO", "OEEOEO",
];

/** Trame binaire (1 = barre noire) reconstruite depuis les rectangles imprimés. */
function modulesFromLabel(input: string, symbology: Symbology): string {
  const resolved = resolveCode(input, symbology);
  if (!resolved.ok) throw new Error(resolved.error);
  const pattern = barPattern(resolved.code.symbology, resolved.code.value);
  // Étiquette BVP complète (texte, logo absent, pied), comme à l'impression.
  const { content } = prepareLabel(
    { ...painAuChocolat(), barcode: input, symbology },
    SAMPLE_SETTINGS,
    new Date(2026, 8, 25),
    AGIPA_118987,
    measure,
  );
  if (!content) throw new Error("mise en page impossible");

  const originMm = content.bars[0].xMm;
  const bits = Array.from({ length: pattern.totalModules }, () => "0");
  for (const bar of content.bars) {
    const start = Math.round((bar.xMm - originMm) / content.moduleMm);
    const width = Math.round(bar.widthMm / content.moduleMm);
    expect(width).toBeGreaterThan(0);
    for (let i = start; i < start + width; i++) bits[i] = "1";
  }
  return bits.join("");
}

/**
 * Même reconstruction en portrait, mais sur les rectangles **tournés** tels
 * que posés sur la planche (`boxToSlotRect`) : les barres deviennent des
 * traits horizontaux, lus de haut en bas.
 */
function modulesFromPortraitSlot(input: string): string {
  const resolved = resolveCode(input, "ean13");
  if (!resolved.ok) throw new Error(resolved.error);
  const pattern = barPattern(resolved.code.symbology, resolved.code.value);
  const { content } = prepareLabel(
    { ...painAuChocolat(), barcode: input },
    { ...SAMPLE_SETTINGS, orientation: "portrait" },
    new Date(2026, 8, 25),
    AGIPA_118987,
    measure,
  );
  if (!content) throw new Error("mise en page impossible");
  const rects = content.bars.map((bar) =>
    boxToSlotRect(AGIPA_118987, "portrait", bar),
  );
  for (const rect of rects) {
    expect(rect.xMm).toBeGreaterThanOrEqual(0);
    expect(rect.xMm + rect.widthMm).toBeLessThanOrEqual(AGIPA_118987.labelWidthMm);
  }
  const originMm = rects[0].yMm;
  const bits = Array.from({ length: pattern.totalModules }, () => "0");
  for (const rect of rects) {
    const start = Math.round((rect.yMm - originMm) / content.moduleMm);
    const width = Math.round(rect.heightMm / content.moduleMm);
    for (let i = start; i < start + width; i++) bits[i] = "1";
  }
  return bits.join("");
}

function decodeDigit(bits: string, table: readonly string[]): number {
  const digit = table.indexOf(bits);
  if (digit < 0) throw new Error(`motif de 7 modules inconnu : ${bits}`);
  return digit;
}

function decodeEan13(bits: string): string {
  expect(bits).toHaveLength(95);
  expect(bits.slice(0, 3)).toBe("101");
  expect(bits.slice(45, 50)).toBe("01010");
  expect(bits.slice(92)).toBe("101");

  const parity: string[] = [];
  const left: number[] = [];
  for (let i = 0; i < 6; i++) {
    const chunk = bits.slice(3 + i * 7, 10 + i * 7);
    if (L.includes(chunk)) {
      parity.push("O");
      left.push(decodeDigit(chunk, L));
    } else {
      parity.push("E");
      left.push(decodeDigit(chunk, G));
    }
  }
  const firstDigit = FIRST_DIGIT_PARITY.indexOf(parity.join(""));
  expect(firstDigit).toBeGreaterThanOrEqual(0);

  const right: number[] = [];
  for (let i = 0; i < 6; i++) {
    right.push(decodeDigit(bits.slice(50 + i * 7, 57 + i * 7), R));
  }
  return `${firstDigit}${left.join("")}${right.join("")}`;
}

function decodeEan8(bits: string): string {
  expect(bits).toHaveLength(67);
  expect(bits.slice(0, 3)).toBe("101");
  expect(bits.slice(31, 36)).toBe("01010");
  expect(bits.slice(64)).toBe("101");
  const digits: number[] = [];
  for (let i = 0; i < 4; i++) {
    digits.push(decodeDigit(bits.slice(3 + i * 7, 10 + i * 7), L));
  }
  for (let i = 0; i < 4; i++) {
    digits.push(decodeDigit(bits.slice(36 + i * 7, 43 + i * 7), R));
  }
  return digits.join("");
}

describe("relecture des barres imprimées", () => {
  it.each(["2000000271040", "2000000271965", "2000000319650"])(
    "relit le code caisse %s (préfixe 2, circulation restreinte)",
    (value) => {
      expect(decodeEan13(modulesFromLabel(value, "ean13"))).toBe(value);
    },
  );

  it("relit le code caisse sur une étiquette tournée en portrait", () => {
    expect(decodeEan13(modulesFromPortraitSlot("2000000271040"))).toBe(
      "2000000271040",
    );
  });

  it("relit un EAN-13", () => {
    expect(decodeEan13(modulesFromLabel("5901234123457", "ean13"))).toBe(
      "5901234123457",
    );
  });

  it("relit un EAN-13 dont la clé a été calculée", () => {
    expect(decodeEan13(modulesFromLabel("400638133393", "ean13"))).toBe(
      "4006381333931",
    );
  });

  it("relit un UPC-A (EAN-13 préfixé de 0)", () => {
    expect(decodeEan13(modulesFromLabel("036000291452", "upca"))).toBe(
      "0036000291452",
    );
  });

  it("relit un EAN-8", () => {
    expect(decodeEan8(modulesFromLabel("96385074", "ean8"))).toBe("96385074");
  });
});
