/**
 * Fiches d'exemple reprises des étiquettes de balance du magasin : servent aux
 * tests et à vérifier la mise en page sur des contenus réels.
 */
import { emptyNutrition, emptyProduct, type Product } from "./product";
import { DEFAULT_SETTINGS, type LibrarySettings } from "./storage";

export const SAMPLE_SETTINGS: LibrarySettings = {
  ...DEFAULT_SETTINGS,
  store: {
    name: "SUPER U",
    address: "82 chemin des Espélugues, 84800 L'Isle-sur-la-Sorgue",
  },
};

export function painAuChocolat(): Product {
  return {
    ...emptyProduct("2026-09-25T00:00:00.000Z"),
    id: "pain-au-chocolat",
    name: "Pains au chocolat pur beurre U x4",
    barcode: "2000000271040",
    pieces: 4,
    netWeightGrams: 220,
    priceCents: 300,
    dateKind: "ddm",
    shelfLifeDays: 4,
    bakedToday: true,
    components: [
      {
        id: "c1",
        name: "",
        ingredients:
          "Farine de BLÉ CRC®, BEURRE 19 %, eau, chocolat 10,5 % (sucre, pâte de cacao, beurre de cacao, émulsifiant : lécithines de tournesol), sucre, levure, sel, ŒUF, GLUTEN de BLÉ, enzymes, agent de traitement de la farine : acide ascorbique.",
      },
    ],
    mayContain: "noisettes, SOJA, amandes",
    origin:
      "farine de BLÉ France ; beurre, chocolat UE / non UE. CRC® = Culture Raisonnée Contrôlée.",
    nutrition: [
      {
        ...emptyNutrition(),
        id: "n1",
        energyKj: 1824,
        energyKcal: 436,
        fat: 23,
        saturates: 14,
        carbohydrates: 49,
        sugars: 15,
        fibre: 3,
        protein: 7.6,
        salt: 0.9,
      },
    ],
  };
}

const VIENNOISERIE_NUTRITION = {
  energyKj: 1780,
  energyKcal: 426,
  fat: 24,
  saturates: 15,
  carbohydrates: 44,
  sugars: 12,
  fibre: null,
  protein: 7.4,
  salt: 1,
};

export function assortiment(): Product {
  return {
    ...emptyProduct("2026-09-25T00:00:00.000Z"),
    id: "assortiment",
    name: "Assortiment mini viennoiseries pur beurre U x12",
    barcode: "2000000271965",
    pieces: 12,
    netWeightGrams: 300,
    priceCents: 420,
    dateKind: "ddm",
    shelfLifeDays: 4,
    components: [
      {
        id: "c1",
        name: "Mini croissant",
        ingredients:
          "farine de BLÉ CRC, BEURRE fin de France 23 %, eau, levure, sucre, ŒUFS, sel, GLUTEN de BLÉ, agents de traitement de la farine (acide ascorbique, amylases, hémicellulases), dorure (ŒUFS).",
      },
      {
        id: "c2",
        name: "Mini pain au chocolat",
        ingredients:
          "farine de BLÉ CRC, BEURRE fin de France 20 %, eau, chocolat 13 % (sucre, pâte de cacao, beurre de cacao, émulsifiant (lécithine de SOJA), arôme naturel de vanille), levure, sucre, ŒUFS, sel, GLUTEN de BLÉ, agents de traitement de la farine (acide ascorbique, amylases, hémicellulases), dorure (ŒUFS).",
      },
      {
        id: "c3",
        name: "Mini pain aux raisins",
        ingredients:
          "farine de BLÉ CRC, BEURRE fin de France 18 %, CRÈME pâtissière 17 % (eau, sucre, LAIT écrémé en poudre, amidon modifié, ŒUFS), raisins secs 12 %, eau, sucre, levure, ŒUFS, sel, GLUTEN de BLÉ, dorure (ŒUFS).",
      },
    ],
    nutrition: [{ ...emptyNutrition(), id: "n1", ...VIENNOISERIE_NUTRITION }],
  };
}
