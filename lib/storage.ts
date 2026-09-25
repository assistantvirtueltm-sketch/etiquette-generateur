/**
 * Persistance locale — seul point d'accès au `localStorage`.
 *
 * Les données utilisateur ne vivent nulle part ailleurs (pas de backend) :
 * toute lecture est défensive (mode privé, quota, storage bloqué) et versionnée,
 * pour qu'un ancien format soit migré plutôt qu'effacé. Le fichier de
 * sauvegarde JSON a le même schéma que le contenu du storage : exporter puis
 * réimporter redonne exactement la même base.
 */
import { normalizeWord } from "./allergens";
import {
  compositionOf,
  newId,
  NUTRIENTS,
  type Composition,
  type DateKind,
  type NutritionTable,
  type Product,
  type ProductComponent,
  type ReferenceSheet,
} from "./product";
import type { SymbologyChoice } from "./symbology";

export const STORAGE_KEY = "etiquettes-bvp:library:v2";
/** Clé de la version précédente (planche mono-produit), migrée à la lecture. */
export const LEGACY_STORAGE_KEY = "barcode-generator:library:v1";
export const SCHEMA_VERSION = 2;
/** Marque des fichiers de sauvegarde, pour reconnaître un export à l'import. */
export const EXPORT_FORMAT = "etiquettes-bvp";

export interface StoreInfo {
  /** Enseigne / raison sociale imprimée en pied d'étiquette. */
  name: string;
  /** Adresse postale complète, sur une ligne. */
  address: string;
}

export interface StoreLogo {
  /** Image PNG ou JPEG en data URL. */
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

/**
 * Hauteur d'x minimale des mentions obligatoires (INCO art. 13) : 1,2 mm, ou
 * 0,9 mm si la plus grande face de l'emballage fait moins de 80 cm².
 */
export type MinXHeightMm = 1.2 | 0.9;

export interface LibrarySettings {
  /** Décalage global d'impression, en mm. Propre à chaque imprimante. */
  offsetXMm: number;
  offsetYMm: number;
  store: StoreInfo;
  logo: StoreLogo | null;
  minXHeightMm: MinXHeightMm;
}

export interface Library {
  version: number;
  products: Product[];
  /** Compositions réutilisables (autocomplétion des fiches). */
  references: ReferenceSheet[];
  settings: LibrarySettings;
}

export const DEFAULT_SETTINGS: LibrarySettings = {
  offsetXMm: 0,
  offsetYMm: 0,
  store: { name: "", address: "" },
  logo: null,
  minXHeightMm: 1.2,
};

export function emptyLibrary(): Library {
  return {
    version: SCHEMA_VERSION,
    products: [],
    references: [],
    settings: { ...DEFAULT_SETTINGS, store: { ...DEFAULT_SETTINGS.store } },
  };
}

// ---------------------------------------------------------------------------
// Lecture défensive

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Raw)
    : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asInteger(value: unknown, fallback: number, min: number): number {
  const n = asNumber(value, fallback);
  return Math.max(min, Math.trunc(n));
}

const SYMBOLOGY_CHOICES: readonly SymbologyChoice[] = [
  "auto",
  "ean13",
  "ean8",
  "upca",
  "code128",
];

function migrateComponent(raw: unknown): ProductComponent | null {
  const record = asRecord(raw);
  if (!record) return null;
  return {
    id: asString(record.id) || newId("c"),
    name: asString(record.name),
    ingredients: asString(record.ingredients),
  };
}

function migrateNutrition(raw: unknown): NutritionTable | null {
  const record = asRecord(raw);
  if (!record) return null;
  const table = {
    id: asString(record.id) || newId("n"),
    title: asString(record.title),
  } as NutritionTable;
  for (const nutrient of NUTRIENTS) {
    table[nutrient.key] = asNullableNumber(record[nutrient.key]);
  }
  return table;
}

function migrateComposition(record: Raw): Composition {
  const components = (Array.isArray(record.components) ? record.components : [])
    .map(migrateComponent)
    .filter((c): c is ProductComponent => c !== null);
  return {
    name: asString(record.name ?? record.label ?? record.description),
    supplierCode: asString(record.supplierCode),
    components:
      components.length > 0
        ? components
        : [{ id: newId("c"), name: "", ingredients: asString(record.ingredients) }],
    mayContain: asString(record.mayContain),
    origin: asString(record.origin),
    storage: asString(record.storage),
    thawed: asBoolean(record.thawed, false),
    nutrition: (Array.isArray(record.nutrition) ? record.nutrition : [])
      .map(migrateNutrition)
      .filter((t): t is NutritionTable => t !== null),
  };
}

function migrateProduct(raw: unknown, now: string): Product | null {
  const record = asRecord(raw);
  if (!record) return null;
  const composition = migrateComposition(record);
  // v1 : `input` (ou `code` / `value`) portait le code-barres.
  const barcode = asString(
    record.barcode ?? record.input ?? record.code ?? record.value,
  );
  if (composition.name.trim() === "" && barcode.trim() === "") return null;
  const isLegacy = !("components" in record);
  const symbology = SYMBOLOGY_CHOICES.includes(
    record.symbology as SymbologyChoice,
  )
    ? (record.symbology as SymbologyChoice)
    : "auto";
  const dateKind: DateKind = record.dateKind === "ddm" ? "ddm" : "dlc";
  return {
    ...composition,
    id: asString(record.id) || newId(),
    // Un produit v1 n'a ni prix ni ingrédients : on ne le propose pas à
    // l'impression tant que sa fiche n'est pas complétée.
    active: isLegacy ? false : asBoolean(record.active, true),
    barcode,
    symbology,
    pieces: asInteger(record.pieces, 1, 1),
    netWeightGrams:
      asNullableNumber(record.netWeightGrams) || null,
    priceCents: asInteger(record.priceCents, 0, 0),
    dateKind,
    shelfLifeDays: asInteger(record.shelfLifeDays, 3, 0),
    bakedToday: asBoolean(record.bakedToday, false),
    createdAt: asString(record.createdAt, now),
    updatedAt: asString(record.updatedAt, now),
  };
}

function migrateReference(raw: unknown, now: string): ReferenceSheet | null {
  const record = asRecord(raw);
  if (!record) return null;
  const composition = migrateComposition(record);
  if (composition.name.trim() === "") return null;
  return {
    ...composition,
    id: asString(record.id) || newId("r"),
    updatedAt: asString(record.updatedAt, now),
  };
}

function migrateLogo(raw: unknown): StoreLogo | null {
  const record = asRecord(raw);
  if (!record) return null;
  const dataUrl = asString(record.dataUrl);
  if (!/^data:image\/(png|jpeg);base64,/.test(dataUrl)) return null;
  const widthPx = asNumber(record.widthPx, 0);
  const heightPx = asNumber(record.heightPx, 0);
  if (widthPx <= 0 || heightPx <= 0) return null;
  return { dataUrl, widthPx, heightPx };
}

function migrateSettings(raw: unknown): LibrarySettings {
  const record = asRecord(raw) ?? {};
  const store = asRecord(record.store) ?? {};
  return {
    offsetXMm: asNumber(record.offsetXMm, DEFAULT_SETTINGS.offsetXMm),
    offsetYMm: asNumber(record.offsetYMm, DEFAULT_SETTINGS.offsetYMm),
    store: { name: asString(store.name), address: asString(store.address) },
    logo: migrateLogo(record.logo),
    minXHeightMm: record.minXHeightMm === 0.9 ? 0.9 : 1.2,
  };
}

export interface MigrationResult {
  library: Library;
  /** Entrées illisibles écartées pendant la migration. */
  dropped: number;
}

/**
 * Normalise un contenu quelconque (storage ou fichier importé) vers le schéma
 * courant. Ne lève jamais : au pire, renvoie une bibliothèque vide.
 */
export function migrate(raw: unknown): MigrationResult {
  const record = Array.isArray(raw) ? { products: raw } : asRecord(raw);
  if (!record) return { library: emptyLibrary(), dropped: 0 };
  const now = new Date().toISOString();
  let dropped = 0;

  const products: Product[] = [];
  for (const entry of Array.isArray(record.products) ? record.products : []) {
    const product = migrateProduct(entry, now);
    if (product) products.push(product);
    else dropped += 1;
  }
  const references: ReferenceSheet[] = [];
  for (const entry of Array.isArray(record.references) ? record.references : []) {
    const reference = migrateReference(entry, now);
    if (reference) references.push(reference);
    else dropped += 1;
  }
  return {
    library: {
      version: SCHEMA_VERSION,
      products,
      references,
      settings: migrateSettings(record.settings),
    },
    dropped,
  };
}

export function loadLibrary(): MigrationResult {
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { library: emptyLibrary(), dropped: 0 };
    return migrate(JSON.parse(raw));
  } catch {
    // Storage indisponible ou JSON corrompu : l'app reste utilisable sans
    // persistance plutôt que de planter au démarrage.
    return { library: emptyLibrary(), dropped: 0 };
  }
}

export function saveLibrary(library: Library): { ok: boolean; error?: string } {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Sauvegarde locale impossible : ${error.message}`
          : "Sauvegarde locale impossible.",
    };
  }
}

// ---------------------------------------------------------------------------
// Sauvegarde / import

/** Sauvegarde complète : produits, référentiel et réglages du magasin. */
export function serializeLibrary(library: Library, now = new Date()): string {
  return JSON.stringify(
    { format: EXPORT_FORMAT, exportedAt: now.toISOString(), ...library },
    null,
    2,
  );
}

/**
 * Référentiel seul (compositions sans code caisse ni prix) : le fichier à
 * partager avec d'autres magasins, qui créent leurs propres codes.
 */
export function serializeReferences(
  library: Library,
  now = new Date(),
): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      exportedAt: now.toISOString(),
      version: SCHEMA_VERSION,
      references: library.references,
    },
    null,
    2,
  );
}

export function parseImport(
  json: string,
): { ok: true; result: MigrationResult } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "Fichier illisible : JSON invalide." };
  }
  const result = migrate(raw);
  const { products, references } = result.library;
  if (products.length === 0 && references.length === 0) {
    return {
      ok: false,
      error: "Le fichier ne contient ni produit ni fiche de référentiel.",
    };
  }
  return { ok: true, result };
}

/** Clé d'unicité d'une fiche du référentiel : référence fournisseur, sinon nom. */
export function referenceKey(composition: Composition): string {
  const code = composition.supplierCode.trim();
  if (code !== "") return `code:${code}`;
  return `nom:${normalizeWord(composition.name).replace(/\s+/g, " ").trim()}`;
}

/** Ajoute ou remplace (même clé) une composition dans le référentiel. */
export function upsertReference(
  references: readonly ReferenceSheet[],
  composition: Composition,
  now = new Date().toISOString(),
): ReferenceSheet[] {
  if (composition.name.trim() === "") return [...references];
  const key = referenceKey(composition);
  const existing = references.find((ref) => referenceKey(ref) === key);
  const sheet: ReferenceSheet = {
    ...compositionOf(composition),
    id: existing?.id ?? newId("r"),
    updatedAt: now,
  };
  return existing
    ? references.map((ref) => (ref.id === existing.id ? sheet : ref))
    : [...references, sheet];
}

export type ImportMode = "merge" | "replace";

export interface ImportSummary {
  library: Library;
  productsAdded: number;
  productsUpdated: number;
  referencesAdded: number;
  referencesUpdated: number;
}

/**
 * Applique un fichier importé.
 * - « merge » : produits fusionnés par identifiant, fiches du référentiel par
 *   clé ; les réglages locaux sont gardés, sauf enseigne / logo encore vides.
 * - « replace » : la base du fichier remplace tout, sauf le décalage
 *   d'impression, propre à l'imprimante de ce poste.
 */
export function applyImport(
  current: Library,
  incoming: Library,
  mode: ImportMode,
): ImportSummary {
  if (mode === "replace") {
    return {
      library: {
        ...incoming,
        settings: {
          ...incoming.settings,
          offsetXMm: current.settings.offsetXMm,
          offsetYMm: current.settings.offsetYMm,
        },
      },
      productsAdded: incoming.products.length,
      productsUpdated: 0,
      referencesAdded: incoming.references.length,
      referencesUpdated: 0,
    };
  }

  const products = [...current.products];
  let productsAdded = 0;
  let productsUpdated = 0;
  for (const product of incoming.products) {
    const index = products.findIndex((p) => p.id === product.id);
    if (index >= 0) {
      products[index] = product;
      productsUpdated += 1;
    } else {
      products.push(product);
      productsAdded += 1;
    }
  }

  let references = current.references;
  let referencesAdded = 0;
  let referencesUpdated = 0;
  for (const reference of incoming.references) {
    const known = references.some(
      (ref) => referenceKey(ref) === referenceKey(reference),
    );
    references = upsertReference(references, reference, reference.updatedAt);
    if (known) referencesUpdated += 1;
    else referencesAdded += 1;
  }

  const settings = { ...current.settings };
  if (settings.store.name === "" && settings.store.address === "") {
    settings.store = { ...incoming.settings.store };
  }
  if (!settings.logo && incoming.settings.logo) {
    settings.logo = incoming.settings.logo;
  }

  return {
    library: { ...current, products, references, settings },
    productsAdded,
    productsUpdated,
    referencesAdded,
    referencesUpdated,
  };
}
