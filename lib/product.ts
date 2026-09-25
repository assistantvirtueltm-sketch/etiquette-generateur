/**
 * Fiche produit BVP : composition (ce qui vient du carton fournisseur) +
 * données commerciales propres au magasin (code caisse, prix, durée de vie).
 *
 * Module pur : validation, dates et formats d'affichage, sans navigateur.
 */
import { unemphasizedAllergens } from "./allergens";
import { resolveCode, type SymbologyChoice } from "./symbology";

export interface ProductComponent {
  id: string;
  /** Nom du composant d'un assortiment (« Mini croissant »), vide sinon. */
  name: string;
  /** Liste des ingrédients, allergènes en MAJUSCULES. */
  ingredients: string;
}

/** Valeurs pour 100 g. `null` = non renseigné. */
export interface NutritionTable {
  id: string;
  /** Titre du tableau quand il y en a plusieurs (« Dots Pink Nubes »). */
  title: string;
  energyKj: number | null;
  energyKcal: number | null;
  fat: number | null;
  saturates: number | null;
  carbohydrates: number | null;
  sugars: number | null;
  /** Facultatif dans la déclaration nutritionnelle. */
  fibre: number | null;
  protein: number | null;
  salt: number | null;
}

export type DateKind = "dlc" | "ddm";

/** Ce qui se recopie depuis le carton fournisseur : partagé via le référentiel. */
export interface Composition {
  /** Dénomination de vente, imprimée en tête d'étiquette. */
  name: string;
  /** Référence du produit chez le fournisseur (6 ou 9 chiffres), facultative. */
  supplierCode: string;
  components: ProductComponent[];
  /** « Peut contenir des traces de … » (étiquetage de précaution). */
  mayContain: string;
  /** Origine des ingrédients, texte libre. */
  origin: string;
  /** Conditions particulières de conservation. */
  storage: string;
  /** Vendu décongelé : mention « Produit décongelé, ne pas recongeler ». */
  thawed: boolean;
  nutrition: NutritionTable[];
}

export interface Product extends Composition {
  id: string;
  /** Proposé dans la mercuriale d'impression. */
  active: boolean;
  /** Code-barres généré par la caisse, tel que collé. */
  barcode: string;
  symbology: SymbologyChoice;
  /** Nombre de pièces du lot (vente à la pièce). */
  pieces: number;
  /** Prix de vente du lot, en centimes. */
  priceCents: number;
  dateKind: DateKind;
  /** Durée de vie : date limite = date d'impression + N jours. */
  shelfLifeDays: number;
  /** « Cuit et emballé le même jour ». */
  bakedToday: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Fiche du référentiel : une composition réutilisable, sans données caisse. */
export interface ReferenceSheet extends Composition {
  id: string;
  updatedAt: string;
}

export const NUTRIENTS: readonly {
  key: Exclude<keyof NutritionTable, "id" | "title">;
  label: string;
  unit: string;
  optional?: boolean;
}[] = [
  { key: "energyKj", label: "Énergie", unit: "kJ" },
  { key: "energyKcal", label: "Énergie", unit: "kcal" },
  { key: "fat", label: "Matières grasses", unit: "g" },
  { key: "saturates", label: "dont acides gras saturés", unit: "g" },
  { key: "carbohydrates", label: "Glucides", unit: "g" },
  { key: "sugars", label: "dont sucres", unit: "g" },
  { key: "fibre", label: "Fibres alimentaires", unit: "g", optional: true },
  { key: "protein", label: "Protéines", unit: "g" },
  { key: "salt", label: "Sel", unit: "g" },
];

export function newId(prefix = "p"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyComponent(): ProductComponent {
  return { id: newId("c"), name: "", ingredients: "" };
}

export function emptyNutrition(): NutritionTable {
  return {
    id: newId("n"),
    title: "",
    energyKj: null,
    energyKcal: null,
    fat: null,
    saturates: null,
    carbohydrates: null,
    sugars: null,
    fibre: null,
    protein: null,
    salt: null,
  };
}

export function emptyProduct(now = new Date().toISOString()): Product {
  return {
    id: newId(),
    active: true,
    name: "",
    supplierCode: "",
    barcode: "",
    symbology: "auto",
    pieces: 1,
    priceCents: 0,
    dateKind: "dlc",
    shelfLifeDays: 3,
    bakedToday: false,
    components: [emptyComponent()],
    mayContain: "",
    origin: "",
    storage: "",
    thawed: false,
    nutrition: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function compositionOf(source: Composition): Composition {
  return {
    name: source.name,
    supplierCode: source.supplierCode,
    components: source.components.map((component) => ({ ...component })),
    mayContain: source.mayContain,
    origin: source.origin,
    storage: source.storage,
    thawed: source.thawed,
    nutrition: source.nutrition.map((table) => ({ ...table })),
  };
}

// ---------------------------------------------------------------------------
// Validation

export interface ProductIssue {
  /** Une erreur bloque l'impression, un avertissement non. */
  level: "error" | "warning";
  message: string;
}

export const SUPPLIER_CODE = /^(\d{6}|\d{9})$/;
export const MAX_SHELF_LIFE_DAYS = 90;

function nutritionComplete(table: NutritionTable): boolean {
  return NUTRIENTS.every(
    (nutrient) => nutrient.optional || table[nutrient.key] !== null,
  );
}

/**
 * Contrôles de la fiche. Les erreurs empêchent d'imprimer ; le débordement de
 * l'étiquette, qui dépend de la mise en page, est contrôlé à part
 * (`lib/label-render.ts`).
 */
export function productIssues(product: Product): ProductIssue[] {
  const issues: ProductIssue[] = [];
  const error = (message: string) => issues.push({ level: "error", message });
  const warning = (message: string) =>
    issues.push({ level: "warning", message });

  if (product.name.trim() === "") error("Dénomination de vente manquante.");

  const code = resolveCode(product.barcode, product.symbology);
  if (!code.ok) error(`Code-barres : ${code.error}`);

  if (!Number.isInteger(product.pieces) || product.pieces < 1) {
    error("Nombre de pièces : un entier supérieur ou égal à 1.");
  }
  if (!Number.isInteger(product.priceCents) || product.priceCents <= 0) {
    error("Prix de vente manquant.");
  }
  if (
    !Number.isInteger(product.shelfLifeDays) ||
    product.shelfLifeDays < 0 ||
    product.shelfLifeDays > MAX_SHELF_LIFE_DAYS
  ) {
    error(`Durée de vie : entre 0 et ${MAX_SHELF_LIFE_DAYS} jours.`);
  }
  if (
    product.supplierCode.trim() !== "" &&
    !SUPPLIER_CODE.test(product.supplierCode.trim())
  ) {
    error("Référence fournisseur : 6 ou 9 chiffres.");
  }

  const filled = product.components.filter(
    (component) => component.ingredients.trim() !== "",
  );
  if (filled.length === 0) error("Liste des ingrédients manquante.");
  if (product.components.length > 1) {
    product.components.forEach((component, index) => {
      if (component.name.trim() === "") {
        error(`Composant n° ${index + 1} : nom manquant (assortiment).`);
      }
      if (component.ingredients.trim() === "") {
        error(`Composant n° ${index + 1} : ingrédients manquants.`);
      }
    });
  }

  const hints = product.components.flatMap((component) =>
    unemphasizedAllergens(component.ingredients).map((hint) => hint.word),
  );
  if (hints.length > 0) {
    warning(
      `Allergène(s) possible(s) écrit(s) en minuscules : ${[...new Set(hints)].join(", ")}. Les allergènes s'écrivent en MAJUSCULES pour être imprimés en gras.`,
    );
  }

  if (product.nutrition.length === 0) {
    warning(
      "Aucune déclaration nutritionnelle : à ne laisser vide que si le produit relève d'une dérogation.",
    );
  }
  product.nutrition.forEach((table, index) => {
    if (!nutritionComplete(table)) {
      error(
        `Valeurs nutritionnelles${table.title ? ` « ${table.title} »` : ` n° ${index + 1}`} incomplètes.`,
      );
    }
    if (product.nutrition.length > 1 && table.title.trim() === "") {
      error(`Valeurs nutritionnelles n° ${index + 1} : titre manquant.`);
    }
  });

  if (product.thawed && product.bakedToday) {
    warning(
      "« Cuit et emballé le même jour » sur un produit décongelé peut induire le consommateur en erreur.",
    );
  }
  return issues;
}

export function hasBlockingIssue(issues: readonly ProductIssue[]): boolean {
  return issues.some((issue) => issue.level === "error");
}

// ---------------------------------------------------------------------------
// Dates et formats

export const DATE_WORDING: Record<DateKind, string> = {
  dlc: "À consommer jusqu'au",
  ddm: "À consommer de préférence avant le",
};

/** Date locale du jour, sans heure (évite les décalages de fuseau). */
export function localDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(day: Date, days: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

export function formatDate(day: Date): string {
  const dd = String(day.getDate()).padStart(2, "0");
  const mm = String(day.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${day.getFullYear()}`;
}

export interface LabelDates {
  packedOn: string;
  limitWording: string;
  limit: string;
}

export function labelDates(product: Product, printedAt: Date): LabelDates {
  const day = localDay(printedAt);
  return {
    packedOn: formatDate(day),
    limitWording: DATE_WORDING[product.dateKind],
    limit: formatDate(addDays(day, product.shelfLifeDays)),
  };
}

export function formatPrice(cents: number): string {
  const euros = Math.trunc(cents / 100);
  const rest = String(Math.abs(cents % 100)).padStart(2, "0");
  return `${euros},${rest} €`;
}

/** « 3,5 » / « 3.50 » / « 3 € » → centimes ; null si illisible. */
export function parsePrice(input: string): number | null {
  const cleaned = input.replace(/[€\s]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Nombre au format français (virgule), sans zéros inutiles. */
export function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

/** « 3,1 » → 3.1 ; vide → null ; illisible → undefined. */
export function parseNumber(input: string): number | null | undefined {
  const cleaned = input.trim().replace(",", ".");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

export function piecesLabel(pieces: number): string {
  return `${pieces} pièce${pieces > 1 ? "s" : ""}`;
}
