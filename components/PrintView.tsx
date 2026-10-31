"use client";

import { useMemo, useState } from "react";

import { LabelPreview } from "@/components/LabelPreview";
import { OrientationSwitch } from "@/components/OrientationSwitch";
import { Card, IssueList } from "@/components/ui";
import type { Orientation, SheetSpec } from "@/lib/label-layout";
import { prepareLabel } from "@/lib/label-job";
import type { MeasureText } from "@/lib/label-render";
import {
  formatDate,
  formatPrice,
  formatWeight,
  labelDates,
  type Product,
} from "@/lib/product";
import type { LastPrint, LibrarySettings } from "@/lib/storage";

interface PrintViewProps {
  products: readonly Product[];
  settings: LibrarySettings;
  spec: SheetSpec;
  measure: MeasureText | null;
  today: Date;
  lastPrint: LastPrint | null;
  onStart: () => void;
  onOrientationChange: (orientation: Orientation) => void;
}

/** Bouton d'entrée du parcours : le plus visible de la page. */
const startButtonClass =
  "rounded-lg bg-stone-900 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400";

const START_STEPS = [
  "Choisir le jour : aujourd'hui ou demain",
  "Indiquer le nombre d'étiquettes par produit",
  "Mettre les feuilles et imprimer",
];

/**
 * Onglet Impression : point de départ du parcours guidé (`PrintWizard`), et
 * contrôle des produits actifs avec l'aperçu de leur étiquette.
 */
export function PrintView({
  products,
  settings,
  spec,
  measure,
  today,
  lastPrint,
  onStart,
  onOrientationChange,
}: PrintViewProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);

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

  const previewProduct =
    products.find((product) => product.id === previewId) ?? products[0] ?? null;
  const preview = previewProduct ? prepared?.get(previewProduct.id) : undefined;
  const lastPrintLabels = lastPrint
    ? Object.values(lastPrint.quantities).reduce((sum, count) => sum + count, 0)
    : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-semibold text-stone-900">
            Imprimer des étiquettes
          </h2>
          <ol className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-3">
            {START_STEPS.map((text, index) => (
              <li key={text} className="flex items-start gap-2">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-800">
                  {index + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className={`${startButtonClass} mt-5 w-full sm:w-auto`}
            disabled={products.length === 0 || !measure}
            onClick={onStart}
          >
            Préparer les étiquettes
          </button>
          {products.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">
              Aucun produit actif. Créer ou activer des fiches dans l&apos;onglet
              « Fiches produits ».
            </p>
          ) : lastPrint ? (
            <p className="mt-3 text-xs text-stone-500">
              Dernière impression le {formatDate(new Date(lastPrint.printedAt))} :{" "}
              {lastPrintLabels} étiquette{lastPrintLabels > 1 ? "s" : ""}.
            </p>
          ) : null}
        </section>

        {products.length > 0 ? (
          <Card title={`Produits actifs (${products.length})`}>
            <p className="mb-2 text-xs text-stone-500">
              Cliquer sur un produit pour voir son étiquette.
            </p>
            <ul className="divide-y divide-stone-200">
              {products.map((product) => {
                const label = prepared?.get(product.id);
                const dates = labelDates(product, today);
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => setPreviewId(product.id)}
                      className={`block w-full px-2 py-3 text-left ${
                        previewProduct?.id === product.id ? "bg-stone-50" : ""
                      }`}
                    >
                      <span className="block truncate text-sm font-medium text-stone-900">
                        {product.name}
                      </span>
                      <span className="block text-xs text-stone-500">
                        {formatPrice(product.priceCents)}
                        {product.netWeightGrams ? ` · ${formatWeight(product.netWeightGrams)}` : ""} ·{" "}
                        {product.dateKind.toUpperCase()} {dates.limit} si imprimé aujourd&apos;hui
                      </span>
                      {label && !label.printable ? (
                        <span className="block text-xs text-red-700">
                          Non imprimable :{" "}
                          {label.issues.find((issue) => issue.level === "error")?.message}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="min-w-0 space-y-6 lg:sticky lg:top-4 lg:self-start">
        <Card title="Sens des étiquettes">
          <OrientationSwitch
            value={settings.orientation}
            onChange={onOrientationChange}
          />
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
