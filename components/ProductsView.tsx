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
  formatWeight,
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
  /** Écrit la fiche (création ou modification) dans la base, aussitôt. */
  onChange: (product: Product) => void;
  /** Fermeture de l'éditeur : mise à jour du référentiel, fiche vide retirée. */
  onClose: (productId: string) => void;
  onRemove: (product: Product) => void;
  editing: Editing;
  onEditingChange: (editing: Editing) => void;
  onToggleActive: (product: Product, active: boolean) => void;
}

/**
 * Fiche ouverte dans l'éditeur. Tenue par la page, pour qu'un changement
 * d'onglet ne ferme pas la fiche en cours (elle est déjà enregistrée, mais le
 * référentiel n'est alimenté qu'à la fermeture).
 */
export type Editing = { id: string; isNew: boolean } | null;

/**
 * Espace dédié à la modification des fiches : la mercuriale d'impression ne
 * permet pas de toucher aux ingrédients.
 */
export function ProductsView({
  library,
  spec,
  measure,
  today,
  onChange,
  onClose,
  onRemove,
  onToggleActive,
  editing,
  onEditingChange: setEditing,
}: ProductsViewProps) {
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

  // La fiche éditée est lue dans la base : elle y est écrite à chaque frappe.
  const edited = editing
    ? library.products.find((product) => product.id === editing.id)
    : undefined;

  /** Crée la fiche dans la base dès l'ouverture de l'éditeur. */
  function open(product: Product) {
    onChange(product);
    setEditing({ id: product.id, isNew: true });
  }

  if (editing && edited) {
    return (
      <ProductEditor
        key={edited.id}
        product={edited}
        isNew={editing.isNew}
        references={library.references}
        settings={library.settings}
        spec={spec}
        measure={measure}
        today={today}
        onChange={onChange}
        onClose={() => {
          onClose(edited.id);
          setEditing(null);
        }}
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
          onClick={() => open(emptyProduct())}
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
                    · {product.pieces} pièce(s)
                    {product.netWeightGrams ? ` · ${formatWeight(product.netWeightGrams)}` : ""}{" "}
                    · {product.dateKind.toUpperCase()} J+
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
                    onClick={() => setEditing({ id: product.id, isNew: false })}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() =>
                      open({
                        ...structuredClone(product),
                        id: newId(),
                        name: `${product.name} (copie)`,
                        barcode: "",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
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
