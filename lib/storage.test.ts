import { afterEach, describe, expect, it, vi } from "vitest";

import { assortiment, painAuChocolat, SAMPLE_SETTINGS } from "./fixtures";
import {
  applyImport,
  DEFAULT_SETTINGS,
  emptyLibrary,
  EXPORT_FORMAT,
  LEGACY_STORAGE_KEY,
  loadLibrary,
  migrate,
  parseImport,
  referenceKey,
  saveLibrary,
  serializeLibrary,
  serializeReferences,
  STORAGE_KEY,
  upsertReference,
  type Library,
} from "./storage";

function stubStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
  vi.stubGlobal("window", { localStorage: storage });
  return map;
}

function sampleLibrary(): Library {
  const library = emptyLibrary();
  library.products.push(painAuChocolat(), assortiment());
  library.references = upsertReference([], painAuChocolat(), "2026-09-25T00:00:00.000Z");
  library.settings = { ...SAMPLE_SETTINGS, offsetXMm: 0.4 };
  return library;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("migrate", () => {
  it("fait un aller-retour exact par le fichier de sauvegarde", () => {
    const library = sampleLibrary();
    const exported = JSON.parse(serializeLibrary(library));
    expect(exported.format).toBe(EXPORT_FORMAT);
    const { library: migrated, dropped } = migrate(exported);
    expect(dropped).toBe(0);
    expect(migrated.products).toEqual(library.products);
    expect(migrated.references).toEqual(library.references);
    expect(migrated.settings).toEqual(library.settings);
  });

  it("reprend les produits de la version mono-produit (v1), désactivés", () => {
    const { library, dropped } = migrate({
      version: 1,
      products: [
        {
          id: "old",
          name: "Café",
          input: "5901234123457",
          symbology: "ean13",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      settings: { offsetXMm: -0.6, offsetYMm: 0.2, startIndex: 12 },
    });
    expect(dropped).toBe(0);
    expect(library.version).toBe(2);
    const [product] = library.products;
    expect(product).toMatchObject({
      id: "old",
      name: "Café",
      barcode: "5901234123457",
      symbology: "ean13",
      active: false,
      priceCents: 0,
    });
    expect(product.components).toHaveLength(1);
    expect(library.settings.offsetXMm).toBe(-0.6);
    expect(library.settings.offsetYMm).toBe(0.2);
  });

  it("écarte les entrées illisibles sans perdre les autres", () => {
    const { library, dropped } = migrate({
      products: [null, {}, painAuChocolat(), "n'importe quoi"],
      references: [{ name: "" }, { name: "Brioche" }],
    });
    expect(dropped).toBe(4);
    expect(library.products).toHaveLength(1);
    expect(library.references).toHaveLength(1);
  });

  it("normalise les champs aberrants", () => {
    const { library } = migrate({
      products: [
        {
          ...painAuChocolat(),
          pieces: -3,
          netWeightGrams: 0,
          priceCents: "trois euros",
          shelfLifeDays: 2.7,
          dateKind: "demain",
          nutrition: [{ energyKj: -5, fat: "12", salt: 0.9 }],
        },
      ],
      settings: {
        offsetXMm: "nope",
        minXHeightMm: 0.5,
        logo: { dataUrl: "javascript:alert(1)", widthPx: 10, heightPx: 10 },
      },
    });
    const [product] = library.products;
    expect(product.pieces).toBe(1);
    expect(product.netWeightGrams).toBeNull();
    expect(product.priceCents).toBe(0);
    expect(product.shelfLifeDays).toBe(2);
    expect(product.dateKind).toBe("dlc");
    expect(product.nutrition[0].energyKj).toBeNull();
    expect(product.nutrition[0].fat).toBeNull();
    expect(product.nutrition[0].salt).toBe(0.9);
    expect(library.settings.offsetXMm).toBe(DEFAULT_SETTINGS.offsetXMm);
    expect(library.settings.minXHeightMm).toBe(1.2);
    expect(library.settings.logo).toBeNull();
  });

  it("ne lève jamais sur une entrée absurde", () => {
    expect(migrate(null).library).toEqual(emptyLibrary());
    expect(migrate("texte").library).toEqual(emptyLibrary());
    expect(migrate(42).library.products).toEqual([]);
  });
});

describe("loadLibrary / saveLibrary", () => {
  it("fait un aller-retour par le localStorage", () => {
    stubStorage();
    const library = sampleLibrary();
    expect(saveLibrary(library).ok).toBe(true);
    expect(loadLibrary().library).toEqual(library);
  });

  it("migre la bibliothèque de l'ancienne clé", () => {
    stubStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify({
        version: 1,
        products: [{ name: "Thé", input: "96385074" }],
      }),
    });
    expect(loadLibrary().library.products[0].barcode).toBe("96385074");
  });

  it("préfère la clé courante à l'ancienne", () => {
    stubStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify({ products: [{ name: "Ancien", input: "96385074" }] }),
      [STORAGE_KEY]: serializeLibrary(sampleLibrary()),
    });
    expect(loadLibrary().library.products).toHaveLength(2);
  });

  it("repart d'une bibliothèque vide si le contenu est corrompu", () => {
    stubStorage({ [STORAGE_KEY]: "{ pas du json" });
    expect(loadLibrary().library).toEqual(emptyLibrary());
  });

  it("reste utilisable quand le storage est indisponible", () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("storage bloqué");
      },
    });
    expect(loadLibrary().library).toEqual(emptyLibrary());
    const result = saveLibrary(emptyLibrary());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("storage bloqué");
  });

  it("signale un quota dépassé au lieu de planter", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
      },
    });
    expect(saveLibrary(emptyLibrary()).ok).toBe(false);
  });
});

describe("parseImport", () => {
  it("importe une sauvegarde complète", () => {
    const parsed = parseImport(serializeLibrary(sampleLibrary()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.library.products).toHaveLength(2);
  });

  it("importe un référentiel seul, sans code caisse ni prix", () => {
    const text = serializeReferences(sampleLibrary());
    expect(text).not.toContain("2000000271040");
    expect(text).not.toContain("priceCents");
    const parsed = parseImport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.library.products).toEqual([]);
    expect(parsed.result.library.references).toHaveLength(1);
  });

  it("refuse un fichier illisible ou vide", () => {
    expect(parseImport("<html>").ok).toBe(false);
    expect(parseImport("{}").ok).toBe(false);
  });
});

describe("référentiel", () => {
  it("identifie une fiche par sa référence fournisseur, sinon par son nom", () => {
    expect(referenceKey({ ...painAuChocolat(), supplierCode: "123456" })).toBe(
      "code:123456",
    );
    expect(referenceKey({ ...painAuChocolat(), name: "  Pains  au Chocolat " })).toBe(
      "nom:pains au chocolat",
    );
  });

  it("remplace une fiche existante au lieu de la dupliquer", () => {
    const first = upsertReference([], painAuChocolat());
    const updated = upsertReference(first, {
      ...painAuChocolat(),
      origin: "France",
    });
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe(first[0].id);
    expect(updated[0].origin).toBe("France");
    expect(upsertReference(updated, assortiment())).toHaveLength(2);
  });

  it("ignore une composition sans nom", () => {
    expect(upsertReference([], { ...painAuChocolat(), name: " " })).toEqual([]);
  });
});

describe("applyImport", () => {
  it("fusionne par identifiant et garde les réglages locaux", () => {
    const current = emptyLibrary();
    current.products.push(painAuChocolat());
    current.settings = { ...SAMPLE_SETTINGS, offsetXMm: 1.5 };
    const incoming = sampleLibrary();
    incoming.products[0] = { ...incoming.products[0], priceCents: 350 };
    incoming.settings = {
      ...incoming.settings,
      store: { name: "AUTRE", address: "ailleurs" },
    };

    const result = applyImport(current, incoming, "merge");
    expect(result.productsAdded).toBe(1);
    expect(result.productsUpdated).toBe(1);
    expect(result.referencesAdded).toBe(1);
    expect(result.library.products).toHaveLength(2);
    expect(result.library.products[0].priceCents).toBe(350);
    expect(result.library.settings.store.name).toBe("SUPER U");
    expect(result.library.settings.offsetXMm).toBe(1.5);
  });

  it("reprend l'enseigne et le logo du fichier si le poste n'en a pas", () => {
    const incoming = sampleLibrary();
    incoming.settings.logo = {
      dataUrl: "data:image/png;base64,AA==",
      widthPx: 120,
      heightPx: 66,
    };
    const result = applyImport(emptyLibrary(), incoming, "merge");
    expect(result.library.settings.store).toEqual(SAMPLE_SETTINGS.store);
    expect(result.library.settings.logo).toEqual(incoming.settings.logo);
  });

  it("remplace tout sauf le décalage d'impression du poste", () => {
    const current = sampleLibrary();
    current.settings.offsetYMm = -0.7;
    const incoming = emptyLibrary();
    incoming.products.push(assortiment());
    incoming.settings.offsetYMm = 3;
    const result = applyImport(current, incoming, "replace");
    expect(result.library.products.map((p) => p.id)).toEqual(["assortiment"]);
    expect(result.library.references).toEqual([]);
    expect(result.library.settings.offsetYMm).toBe(-0.7);
  });
});
