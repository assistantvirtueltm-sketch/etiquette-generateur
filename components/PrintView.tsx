"use client";

import { useMemo, useState } from "react";

import { LabelPreview } from "@/components/LabelPreview";
import { OrientationSwitch } from "@/components/OrientationSwitch";
import { buttonClass, Card, IssueList, primaryButtonClass } from "@/components/ui";
import {
  labelsPerSheet,
  type Orientation,
  type SheetSpec,
} from "@/lib/label-layout";
import { planSheets, prepareLabel } from "@/lib/label-job";
import type { MeasureText } from "@/lib/label-render";
import {
  formatDate,
  formatPrice,
  formatWeight,
  labelDates,
  type Product,
} from "@/lib/product";
import type { LibrarySettings } from "@/lib/storage";

interface PrintViewProps {
  products: readonly Product[];
  settings: LibrarySettings;
  spec: SheetSpec;
  measure: MeasureText | null;
  today: Date;
  quantities: Readonly<Record<string, number>>;
  /** Date de l'impression dont les quantités sont reprises, sinon null. */
  prefilledFrom: Date | null;
  onQuantityChange: (productId: string, count: number) => void;
  onReset: () => void;
  onPrint: () => void;
  onOrientationChange: (orientation: Orientation) => void;
  busy: boolean;
}

const MAX_PER_PRODUCT = 800;

/**
 * Mercuriale du jour : les produits actifs, le nombre d'étiquettes voulu pour
 * chacun, et le nombre de feuilles à mettre dans l'imprimante.
 */
export function PrintView({
  products,
  settings,
  spec,
  measure,
  today,
  quantities,
  prefilledFrom,
  onQuantityChange,
  onReset,
  onPrint,
  onOrientationChange,
  busy,
}: PrintViewProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const perSheet = labelsPerSheet(spec);

  const prepared = useMemo(
    () =>
      measure
        ? new Map(
            products.map((product) => [
              product.id,
              prepareLabel(product, settings, today, spec, measure),
            ]),
          )
        : null,
    [products, settings, today, spec, measure],
  );

  const lines = products
    .map((product) => ({ productId: product.id, count: quantities[product.id] ?? 0 }))
    .filter((line) => line.count > 0);
  const plan = planSheets(lines, perSheet);
  const blocked = lines.filter(
    (line) => prepared?.get(line.productId)?.printable === false,
  );

  const previewProduct =
    products.find((product) => product.id === previewId) ?? products[0] ?? null;
  const preview = previewProduct ? prepared?.get(previewProduct.id) : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card
        title={`Mercuriale du ${formatDate(today)}`}
        actions={
          <button type="button" className={buttonClass} onClick={onReset}>
            Tout remettre à zéro
          </button>
        }
      >
        {prefilledFrom && products.length > 0 ? (
          <p className="mb-3 rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-700">
            Quantités reprises de la dernière impression, le{" "}
            {formatDate(prefilledFrom)}. Les ajuster si besoin.
          </p>
        ) : null}
        {products.length === 0 ? (
          <p className="text-sm text-stone-500">
            Aucun produit actif. Créer ou activer des fiches dans l&apos;onglet
            « Fiches produits ».
          </p>
        ) : (
          <ul className="divide-y divide-stone-200">
            {products.map((product) => {
              const label = prepared?.get(product.id);
              const count = quantities[product.id] ?? 0;
              const dates = labelDates(product, today);
              return (
                <li
                  key={product.id}
                  className={`flex flex-wrap items-center gap-3 py-3 ${
                    previewProduct?.id === product.id ? "bg-stone-50" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewId(product.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium text-stone-900">
                      {product.name}
                    </span>
                    <span className="block text-xs text-stone-500">
                      {formatPrice(product.priceCents)}
                      {product.netWeightGrams ? ` · ${formatWeight(product.netWeightGrams)}` : ""} ·{" "}
                      {product.dateKind.toUpperCase()} {dates.limit}
                    </span>
                    {label && !label.printable ? (
                      <span className="block text-xs text-red-700">
                        Non imprimable :{" "}
                        {label.issues.find((issue) => issue.level === "error")?.message}
                      </span>
                    ) : null}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Une étiquette de moins pour ${product.name}`}
                      className={buttonClass}
                      disabled={count === 0}
                      onClick={() => onQuantityChange(product.id, count - 1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={MAX_PER_PRODUCT}
                      aria-label={`Nombre d'étiquettes pour ${product.name}`}
                      value={count}
                      onChange={(event) =>
                        onQuantityChange(
                          product.id,
                          Math.min(
                            MAX_PER_PRODUCT,
                            Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                          ),
                        )
                      }
                      className="w-16 rounded-md border border-stone-300 px-2 py-1.5 text-center text-sm"
                    />
                    <button
                      type="button"
                      aria-label={`Une étiquette de plus pour ${product.name}`}
                      className={buttonClass}
                      onClick={() =>
                        onQuantityChange(product.id, Math.min(MAX_PER_PRODUCT, count + 1))
                      }
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
        <Card title="Impression">
          <div className="mb-4 border-b border-stone-200 pb-4">
            <p className="mb-2 text-xs font-medium text-stone-600">
              Sens des étiquettes
            </p>
            <OrientationSwitch
              value={settings.orientation}
              onChange={onOrientationChange}
            />
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-600">Étiquettes</dt>
              <dd className="font-semibold">{plan.totalLabels}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Feuilles {spec.reference}</dt>
              <dd className="font-semibold">{plan.sheets}</dd>
            </div>
          </dl>
          {plan.sheets > 0 ? (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Mettre <strong>{plan.sheets} feuille{plan.sheets > 1 ? "s" : ""}</strong>{" "}
              {spec.reference} dans l&apos;imprimante
              {plan.unusedOnLastSheet > 0
                ? ` (${plan.unusedOnLastSheet} étiquette${plan.unusedOnLastSheet > 1 ? "s" : ""} vide${plan.unusedOnLastSheet > 1 ? "s" : ""} sur la dernière).`
                : "."}{" "}
              Imprimer à 100 % (« taille réelle »).
            </p>
          ) : (
            <p className="mt-3 text-sm text-stone-500">
              Choisir le nombre d&apos;étiquettes de chaque produit.
            </p>
          )}
          {blocked.length > 0 ? (
            <p className="mt-3 text-sm text-red-700">
              {blocked.length} produit(s) demandé(s) non imprimable(s) : corriger
              la fiche ou remettre la quantité à zéro.
            </p>
          ) : null}
          <button
            type="button"
            className={`${primaryButtonClass} mt-4 w-full`}
            disabled={busy || plan.totalLabels === 0 || blocked.length > 0 || !measure}
            onClick={onPrint}
          >
            Générer et télécharger le PDF
          </button>
        </Card>

        {previewProduct && preview ? (
          <Card title="Aperçu">
            <p className="mb-2 truncate text-sm font-medium">{previewProduct.name}</p>
            {preview.content ? (
              <LabelPreview
                spec={spec}
                content={preview.content}
                logoUrl={settings.logo?.dataUrl}
                pxPerMm={3.4}
              />
            ) : null}
            <div className="mt-3">
              <IssueList issues={preview.issues} />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
