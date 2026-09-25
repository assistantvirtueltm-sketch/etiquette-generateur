/**
 * Composition de texte : découpe en segments gras / normaux et coupure en
 * lignes à une largeur donnée, avec les métriques de police injectées
 * (`MeasureText`). Module pur, partagé par le PDF et l'aperçu.
 */
import { isEmphasized } from "./allergens";
import { ptToMm } from "./label-layout";

/** Largeur d'un texte en points, à la taille et à la graisse demandées. */
export type MeasureText = (
  text: string,
  sizePt: number,
  bold: boolean,
) => number;

export interface Run {
  text: string;
  bold: boolean;
}

/** Morceau de ligne prêt à dessiner. */
export interface LinePiece {
  text: string;
  bold: boolean;
  /** Décalage depuis le début de la ligne. */
  xMm: number;
  widthMm: number;
}

export interface Line {
  pieces: LinePiece[];
  widthMm: number;
}

/**
 * Caractères représentables par les polices standard PDF (WinAnsi). Tout le
 * reste ferait échouer `drawText` (et la mesure), on le remplace en amont.
 */
const WIN_ANSI_SAFE =
  /^[ -~ -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/;

export function sanitizeForPdf(text: string): {
  text: string;
  changed: boolean;
} {
  // Retours à la ligne et tabulations saisis dans les zones de texte : de
  // simples espaces sur l'étiquette.
  const flat = text.replace(/[\t\r\n]+/g, " ");
  if (WIN_ANSI_SAFE.test(flat)) return { text: flat, changed: false };
  const safe = [...flat]
    .map((ch) => (WIN_ANSI_SAFE.test(ch) ? ch : "?"))
    .join("");
  return { text: safe, changed: true };
}

/**
 * Découpe un texte en segments, en mettant en gras les mots entièrement en
 * MAJUSCULES : la convention de mise en évidence des allergènes.
 */
export function emphasisRuns(text: string): Run[] {
  const runs: Run[] = [];
  for (const match of text.matchAll(/\S+|\s+/g)) {
    const token = match[0];
    const bold = /\S/.test(token) && isEmphasized(token);
    // Les espaces prennent la graisse du mot qui précède.
    const last = runs.at(-1);
    if (last && (last.bold === bold || !/\S/.test(token))) {
      last.text += token;
    } else {
      runs.push({ text: token, bold });
    }
  }
  return runs;
}

/**
 * Jetons insécables : un mot suivi de sa ponctuation et de ses espaces. On
 * s'autorise aussi à couper après « , ; : ) / » collés au mot suivant, fréquent
 * dans les listes d'ingrédients recopiées (« sucre;levure;sel »). Seule
 * l'espace ordinaire est sécable : l'espace insécable (U+00A0) lie un nombre à
 * son unité (« 19 % », « 1 g »).
 */
const TOKEN = /[^ ,;:)/]*[,;:)/]* */g;

interface Token {
  text: string;
  bold: boolean;
}

function tokenize(runs: readonly Run[]): Token[] {
  const tokens: Token[] = [];
  for (const run of runs) {
    for (const match of run.text.matchAll(TOKEN)) {
      if (match[0] !== "") tokens.push({ text: match[0], bold: run.bold });
    }
  }
  return tokens;
}

/**
 * Coupe les segments en lignes de `maxWidthMm` au plus. Un mot plus long que
 * la ligne est coupé au caractère. Les espaces de fin de ligne ne comptent
 * pas dans la largeur.
 */
export function wrapRuns(
  runs: readonly Run[],
  maxWidthMm: number,
  sizePt: number,
  measure: MeasureText,
): Line[] {
  const width = (text: string, bold: boolean) =>
    ptToMm(measure(text, sizePt, bold));

  const lines: Line[] = [];
  let current: Token[] = [];

  const lineWidth = (tokens: readonly Token[]) =>
    layoutLine(tokens, width).widthMm;

  const flush = () => {
    if (current.length > 0) lines.push(layoutLine(current, width));
    current = [];
  };

  for (const token of tokenize(runs)) {
    const candidate = [...current, token];
    if (lineWidth(candidate) <= maxWidthMm + 1e-9) {
      current = candidate;
      continue;
    }
    flush();
    if (lineWidth([token]) <= maxWidthMm + 1e-9) {
      current = [token];
      continue;
    }
    // Mot plus long que la ligne : coupure au caractère.
    let rest = token.text;
    while (rest.length > 0) {
      let take = rest.length;
      while (take > 1 && width(rest.slice(0, take).trimEnd(), token.bold) > maxWidthMm) {
        take -= 1;
      }
      const part = { text: rest.slice(0, take), bold: token.bold };
      rest = rest.slice(take);
      if (rest.length > 0) {
        current = [part];
        flush();
      } else {
        current = [part];
      }
    }
  }
  flush();
  return lines;
}

function layoutLine(
  tokens: readonly Token[],
  width: (text: string, bold: boolean) => number,
): Line {
  // Fusionne les jetons contigus de même graisse : moins d'opérateurs de
  // texte dans le PDF, et un crénage identique à l'écran.
  const merged: Token[] = [];
  for (const token of tokens) {
    const last = merged.at(-1);
    if (last && last.bold === token.bold) last.text += token.text;
    else merged.push({ ...token });
  }
  const last = merged.at(-1);
  if (last) last.text = last.text.trimEnd();

  const pieces: LinePiece[] = [];
  let xMm = 0;
  for (const token of merged) {
    if (token.text === "") continue;
    const widthMm = width(token.text, token.bold);
    pieces.push({ text: token.text, bold: token.bold, xMm, widthMm });
    xMm += widthMm;
  }
  return { pieces, widthMm: xMm };
}
