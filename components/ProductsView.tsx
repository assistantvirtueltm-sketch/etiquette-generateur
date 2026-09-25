"use client";

import { useMemo, useState } from "react";

import { ProductEditor } from "@/components/ProductEditor";
import { buttonClass, Card, inputClass, primaryButtonClass } from "@/components/ui";
import { normalizeWord } from "@/lib/allergens";
import type { SheetSpec } from "@/lib/label-layout";
import type { MeasureText } from "@/lib/label-render";
import {
  emptyProduct,
  formatPrice,
  hasBlockingIssue,
  newId,
  productIssues,
  type Product,
} from "@/lib/product";
import type { Library } from "@/lib/storage";

interface ProductsViewProps {
  library: Library;
  spec: SheetSpec;
  measure: MeasureText | null;
  today: Date;
  onSave: (product: Product) => void;
  onRemove: (product: Product) => void;
  onToggleActive: (product: Product, active: boolean) => void;
}

type Editing = { product: Product; isNew: boolean } | null;

/**
 * Espace dédié à la modification des fiches : la mercuriale d'impression ne
 * permet pas de toucher aux ingrédients.
 */
export function ProductsView({
  library,
  spec,
  measure,
  today,
  onSave,
  onRemove,
  onToggleActive,
}: ProductsViewProps) {
  const [editing, setEditing] = useState<Editing>(null);
  const [query, setQuery] = useState("");

  const products = useMemo(() => {
    const q = normalizeWord(query).trim();
    return [...library.products]
      .filter(
        (product) =>
          q === "" ||
          normalizeWord(product.name).includes(q) ||
          product.supplierCode.includes(q) ||
          product.barcode.includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [library.products, query]);

  if (editing) {
    return (
      <ProductEditor
        key={editing.product.id}
        initial={editing.product}
        isNew={editing.isNew}
        references={library.references}
        settings={library.settings}
        spec={spec}
        measure={measure}
        today={today}
        onSave={(product) => {
          onSave(product);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <Card
      title={`Fiches produits (${library.products.length})`}
      actions={
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => setEditing({ product: emptyProduct(), isNew: true })}
        >
          + Nouvelle fiche
        </button>
      }
    >
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher (nom, réf. fournisseur, code-barres)"
        className={`${inputClass} mb-4`}
      />
      {products.length === 0 ? (
        <p className="text-sm text-stone-500">
          {library.products.length === 0
            ? "Aucune fiche. Créer une fiche, ou importer une sauvegarde dans les réglages."
            : "Aucune fiche ne correspond à la recherche."}
        </p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {products.map((product) => {
            const issues = productIssues(product);
            const blocked = hasBlockingIssue(issues);
            return (
              <li key={product.id} className="flex flex-wrap items-center gap-3 py-3">
                <label className="flex items-center gap-2 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={product.active}
                    onChange={(event) =>
                      onToggleActive(product, event.target.checked)
                    }
                  />
                  Actif
                </label>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">
                    {product.name || "(sans dénomination)"}
                  </p>
                  <p className="text-xs text-stone-500">
                    {product.priceCents > 0 ? formatPrice(product.priceCents) : "prix ?"}{" "}
                    · {product.pieces} pièce(s) · {product.dateKind.toUpperCase()} J+
                    {product.shelfLifeDays}
                    {product.supplierCode ? ` · réf. ${product.supplierCode}` : ""}
                  </p>
                  {blocked ? (
                    <p className="text-xs text-red-700">
                      Fiche incomplète :{" "}
                      {issues.find((issue) => issue.level === "error")?.message}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setEditing({ product, isNew: false })}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() =>
                      setEditing({
                        product: {
                          ...structuredClone(product),
                          id: newId(),
                          name: `${product.name} (copie)`,
                          barcode: "",
                        },
                        isNew: true,
                      })
                    }
                  >
                    Dupliquer
                  </button>
                  <button
                    type="button"
                    className={`${buttonClass} text-red-700`}
                    onClick={() => onRemove(product)}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
