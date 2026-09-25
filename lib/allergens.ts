/**
 * Mise en évidence des allergènes (règlement INCO, art. 21) : dans la liste
 * des ingrédients, les allergènes s'écrivent en MAJUSCULES, comme sur les
 * cartons fournisseurs. Le rendu imprime en gras tout mot entièrement en
 * majuscules ; ce module repère en plus les allergènes probables restés en
 * minuscules pour que l'opérateur les corrige.
 *
 * Module pur : aucune dépendance navigateur.
 */

/**
 * Termes des 14 familles d'allergènes (annexe II INCO) que l'on rencontre sur
 * les fiches de viennoiserie / pâtisserie. Formes au singulier et sans accent :
 * la comparaison se fait sur des mots normalisés.
 */
const ALLERGEN_TERMS: readonly string[] = [
  // Céréales contenant du gluten
  "gluten", "ble", "froment", "seigle", "orge", "avoine", "epeautre", "kamut",
  // Crustacés, mollusques, poissons
  "crustace", "crevette", "mollusque", "poisson",
  // Œufs
  "oeuf", "œuf",
  // Arachides, soja
  "arachide", "cacahuete", "soja",
  // Lait et dérivés
  "lait", "beurre", "creme", "fromage", "lactose", "lactoserum", "babeurre",
  "yaourt", "mascarpone", "caseine", "caseinate",
  // Fruits à coque
  "amande", "noisette", "noix", "cajou", "pecan", "pistache", "macadamia",
  // Autres
  "celeri", "moutarde", "sesame", "sulfite", "lupin",
];

/**
 * Expressions contenant un terme ci-dessus mais qui ne sont **pas** des
 * allergènes : on ne les signale pas.
 */
const FALSE_FRIENDS: readonly string[] = [
  "beurre de cacao",
  "noix de coco",
  "lait de coco",
  "creme de coco",
  "noix de muscade",
];

export function normalizeWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe");
}

function singular(word: string): string {
  return word.length > 3 && /[sx]$/.test(word) && word !== "noix"
    ? word.slice(0, -1)
    : word;
}

/**
 * Replie chaque unité UTF-16 sur sa lettre de base en minuscule, **sans changer
 * la longueur** du texte : les positions trouvées restent valables dans la
 * saisie d'origine.
 */
function foldPreservingLength(text: string): string {
  return text
    .split("")
    .map((unit) => unit.normalize("NFD")[0].toLowerCase())
    .join("");
}

/** Positions couvertes par un faux ami (« beurre de cacao »…). */
function falseFriendPositions(text: string): Set<number> {
  const folded = foldPreservingLength(text);
  const masked = new Set<number>();
  for (const phrase of FALSE_FRIENDS) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(phrase, from);
      if (at < 0) break;
      for (let i = at; i < at + phrase.length; i++) masked.add(i);
      from = at + phrase.length;
    }
  }
  return masked;
}

const TERMS = new Set(ALLERGEN_TERMS.map((term) => normalizeWord(term)));

/** Un mot (au moins trois lettres, pour épargner « UE », « AB »…) entièrement en majuscules. */
export function isEmphasized(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toUpperCase() &&
    letters !== letters.toLowerCase();
}

const WORD = /[\p{L}]+/gu;

export interface AllergenHint {
  /** Mot tel qu'écrit dans la saisie. */
  word: string;
  /** Position du mot dans le texte. */
  index: number;
}

/**
 * Allergènes probables écrits en minuscules. Ne signale qu'une fois chaque mot
 * (la première occurrence), et ignore les faux amis (« beurre de cacao »…).
 */
export function unemphasizedAllergens(text: string): AllergenHint[] {
  const masked = falseFriendPositions(text);

  const hints: AllergenHint[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    const index = match.index ?? 0;
    if (masked.has(index) || isEmphasized(word)) continue;
    const key = singular(normalizeWord(word));
    if (!TERMS.has(key) || seen.has(key)) continue;
    seen.add(key);
    hints.push({ word, index });
  }
  return hints;
}

/** Passe en majuscules les allergènes probables restés en minuscules. */
export function emphasizeAllergens(text: string): string {
  const hints = unemphasizedAllergens(text).map((hint) =>
    normalizeWord(hint.word),
  );
  if (hints.length === 0) return text;
  const targets = new Set(hints.map(singular));
  const masked = falseFriendPositions(text);
  return text.replace(WORD, (word, index: number) =>
    !masked.has(index) && targets.has(singular(normalizeWord(word)))
      ? word.toUpperCase()
      : word,
  );
}
