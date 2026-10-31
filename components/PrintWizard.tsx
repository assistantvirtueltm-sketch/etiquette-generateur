"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";

import { buttonClass, primaryButtonClass } from "@/components/ui";
import { labelsPerSheet, type SheetSpec } from "@/lib/label-layout";
import { planSheets, prepareLabel } from "@/lib/label-job";
import type { MeasureText } from "@/lib/label-render";
import {
  formatDate,
  formatLongDate,
  formatPrice,
  formatWeight,
  labelDates,
  labelDay,
  type PrintFor,
  type Product,
} from "@/lib/product";
import type { LibrarySettings } from "@/lib/storage";

/** Jour validé à l'étape 1 : les étiquettes porteront exactement celui-ci. */
export interface ConfirmedDay {
  printFor: PrintFor;
  day: Date;
}

/**
 * État du parcours, tenu par la page : il survit à l'affichage du PDF
 * (étape 3), d'où l'on peut revenir aux quantités.
 */
export interface WizardState {
  /** Heure d'ouverture du parcours : base des deux jours proposés. */
  openedAt: Date;
  /** Jour coché à l'étape 1, pas encore validé. Aucun par défaut. */
  choice: PrintFor | null;
  confirmed: ConfirmedDay | null;
  /** Message affiché à l'étape 1 (jour à choisir à nouveau). */
  notice: string | null;
  /** Échec de la génération, affiché à l'étape 2. */
  error: string | null;
}

export function startWizard(now: Date, notice: string | null = null): WizardState {
  return { openedAt: now, choice: null, confirmed: null, notice, error: null };
}

export const WIZARD_STEPS = ["Jour", "Quantités", "Impression"] as const;

const MAX_PER_PRODUCT = 800;

const plural = (count: number, word: string) =>
  `${count} ${word}${count > 1 ? "s" : ""}`;

interface PrintWizardProps {
  state: WizardState;
  products: readonly Product[];
  settings: LibrarySettings;
  spec: SheetSpec;
  measure: MeasureText;
  quantities: Readonly<Record<string, number>>;
  /** Date de l'impression dont les quantités sont reprises, sinon null. */
  prefilledFrom: Date | null;
  onQuantityChange: (productId: string, count: number) => void;
  onReset: () => void;
  onChoose: (printFor: PrintFor) => void;
  onConfirm: () => void;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
  busy: boolean;
}

/**
 * Parcours guidé d'impression : 1. le jour porté par les étiquettes
 * (aujourd'hui ou demain, sans choix par défaut, puis confirmation de la date
 * imprimée) ; 2. les quantités et les feuilles à charger ; 3. le PDF, dans
 * la fenêtre d'aperçu. Rien ne s'imprime sans être passé par chaque étape.
 */
export function PrintWizard(props: PrintWizardProps) {
  const { state, onClose } = props;
  const step = state.confirmed ? 1 : 0;
  const heading = useRef<HTMLHeadingElement>(null);

  // Échap ferme ; le titre de l'étape prend le focus à chaque étape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-wizard-title"
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3">
          <WizardSteps current={step} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer sans imprimer"
            className="rounded-md px-2 py-1 text-lg leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            ×
          </button>
        </div>
        {state.confirmed ? (
          <QuantitiesStep {...props} confirmed={state.confirmed} heading={heading} />
        ) : (
          <DayStep {...props} heading={heading} />
        )}
      </div>
    </div>
  );
}

/** Fil des étapes, repris en tête de la fenêtre du PDF (étape 3). */
export function WizardSteps({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Étapes">
      {WIZARD_STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={`flex items-center gap-1.5 ${
            index === current
              ? "font-semibold text-stone-900"
              : index < current
                ? "text-stone-600"
                : "text-stone-400"
          }`}
        >
          <span
            className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] ${
              index === current
                ? "bg-stone-900 text-white"
                : index < current
                  ? "bg-stone-300 text-stone-800"
                  : "border border-stone-300"
            }`}
          >
            {index < current ? "✓" : index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function DayStep({
  state,
  onChoose,
  onConfirm,
  onClose,
  heading,
}: PrintWizardProps & { heading: RefObject<HTMLHeadingElement | null> }) {
  const choices = (["today", "tomorrow"] as const).map((printFor) => ({
    printFor,
    day: labelDay(state.openedAt, printFor),
  }));
  const chosen = choices.find((choice) => choice.printFor === state.choice) ?? null;
  const tomorrow = chosen?.printFor === "tomorrow";

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <h2
          id="print-wizard-title"
          ref={heading}
          tabIndex={-1}
          className="text-lg font-semibold text-stone-900 outline-none"
        >
          Pour quel jour préparez-vous les étiquettes ?
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          La date d&apos;emballage et les dates limites imprimées en dépendent.
        </p>
        {state.notice ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {state.notice}
          </p>
        ) : null}
        <div
          role="radiogroup"
          aria-labelledby="print-wizard-title"
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          {choices.map(({ printFor, day }) => {
            const selected = state.choice === printFor;
            return (
              <button
                key={printFor}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChoose(printFor)}
                className={`rounded-lg border-2 p-4 text-left transition-colors ${
                  selected
                    ? printFor === "tomorrow"
                      ? "border-amber-500 bg-amber-50"
                      : "border-stone-900 bg-stone-50"
                    : "border-stone-200 hover:border-stone-400"
                }`}
              >
                <span className="block text-lg font-semibold text-stone-900">
                  {printFor === "today" ? "Aujourd'hui" : "Demain"}
                </span>
                <span className="block text-sm text-stone-700">{formatLongDate(day)}</span>
                <span className="mt-2 block text-xs text-stone-500">
                  {printFor === "today"
                    ? "Produits emballés aujourd'hui."
                    : "Préparer dès ce soir les étiquettes de demain."}
                </span>
              </button>
            );
          })}
        </div>
        {chosen ? (
          <div
            aria-live="polite"
            className={`mt-4 rounded-lg border px-4 py-3 ${
              tomorrow
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "border-emerald-200 bg-emerald-50 text-emerald-950"
            }`}
          >
            <p className="text-sm">Date imprimée sur toutes les étiquettes :</p>
            <p className="mt-1 text-2xl font-semibold">
              Emballé le {formatDate(chosen.day)}
            </p>
            <p className="text-sm">
              {formatLongDate(chosen.day)}
              {tomorrow ? " : c'est demain, pas aujourd'hui." : "."}
            </p>
            <p className="mt-2 text-xs">
              Les dates limites (DLC / DDM) de chaque produit sont calculées à
              partir de ce jour.
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 px-5 py-3">
        <button type="button" className={buttonClass} onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!chosen}
          onClick={onConfirm}
        >
          Valider cette date
        </button>
      </div>
    </>
  );
}

function QuantitiesStep({
  confirmed,
  products,
  settings,
  spec,
  measure,
  quantities,
  prefilledFrom,
  onQuantityChange,
  onReset,
  onBack,
  onNext,
  busy,
  state,
  heading,
}: PrintWizardProps & {
  confirmed: ConfirmedDay;
  heading: RefObject<HTMLHeadingElement | null>;
}) {
  const { day, printFor } = confirmed;
  const prepared = useMemo(
    () =>
      new Map(
        products.map((product) => [
          product.id,
          prepareLabel(product, settings, day, spec, measure),
        ]),
      ),
    [products, settings, day, spec, measure],
  );

  const lines = products
    .map((product) => ({ productId: product.id, count: quantities[product.id] ?? 0 }))
    .filter((line) => line.count > 0);
  const plan = planSheets(lines, labelsPerSheet(spec));
  const blocked = lines.filter(
    (line) => prepared.get(line.productId)?.printable === false,
  );

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <h2
          id="print-wizard-title"
          ref={heading}
          tabIndex={-1}
          className="text-lg font-semibold text-stone-900 outline-none"
        >
          Combien d&apos;étiquettes pour chaque produit ?
        </h2>
        <p
          className={`mt-2 rounded-md px-3 py-2 text-sm ${
            printFor === "tomorrow"
              ? "border border-amber-300 bg-amber-50 text-amber-900"
              : "bg-stone-100 text-stone-700"
          }`}
        >
          Étiquettes datées du <strong>{formatLongDate(day)}</strong>
          {printFor === "tomorrow" ? " (préparation pour demain)" : " (aujourd'hui)"}.{" "}
          <button type="button" className="underline" onClick={onBack}>
            Changer le jour
          </button>
        </p>
        {prefilledFrom ? (
          <p className="mt-2 text-xs text-stone-600">
            Quantités reprises de la dernière impression, le{" "}
            {formatDate(prefilledFrom)}. Les ajuster si besoin.
          </p>
        ) : null}
        <ul className="mt-3 divide-y divide-stone-200">
          {products.map((product) => {
            const label = prepared.get(product.id);
            const count = quantities[product.id] ?? 0;
            const dates = labelDates(product, day);
            return (
              <li key={product.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-stone-900">
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
                </div>
                <QuantityStepper
                  name={product.name}
                  count={count}
                  onChange={(next) => onQuantityChange(product.id, next)}
                />
              </li>
            );
          })}
        </ul>
        <div className="mt-1 flex justify-end">
          <button type="button" className="text-xs text-stone-600 underline" onClick={onReset}>
            Tout remettre à zéro
          </button>
        </div>
        {plan.sheets > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
            <p className="text-base font-semibold">
              {plural(plan.totalLabels, "étiquette")} :{" "}
              {plural(plan.sheets, "feuille")} {spec.reference}
            </p>
            {plan.unusedOnLastSheet > 0 ? (
              <p className="text-sm">
                {plural(plan.unusedOnLastSheet, "emplacement")}{" "}
                {plan.unusedOnLastSheet > 1 ? "resteront vides" : "restera vide"} sur
                la dernière feuille.
              </p>
            ) : null}
            <p className="mt-2 text-sm">
              <strong>
                Mettez dès maintenant {plural(plan.sheets, "feuille")}{" "}
                d&apos;étiquettes vierge{plan.sheets > 1 ? "s" : ""} dans
                l&apos;imprimante
              </strong>
              , puis cliquez sur « Suivant ».
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-500">
            Indiquez le nombre d&apos;étiquettes d&apos;au moins un produit.
          </p>
        )}
        {blocked.length > 0 ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {plural(blocked.length, "produit")} demandé{blocked.length > 1 ? "s" : ""}{" "}
            non imprimable{blocked.length > 1 ? "s" : ""} : corriger la fiche
            ou remettre la quantité à zéro.
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 px-5 py-3">
        <button type="button" className={buttonClass} onClick={onBack}>
          Retour
        </button>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={busy || plan.totalLabels === 0 || blocked.length > 0}
          onClick={onNext}
        >
          {busy ? "Préparation…" : "Suivant"}
        </button>
      </div>
    </>
  );
}

function QuantityStepper({
  name,
  count,
  onChange,
}: {
  name: string;
  count: number;
  onChange: (count: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Une étiquette de moins pour ${name}`}
        className={buttonClass}
        disabled={count === 0}
        onClick={() => onChange(count - 1)}
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={MAX_PER_PRODUCT}
        aria-label={`Nombre d'étiquettes pour ${name}`}
        value={count}
        onChange={(event) =>
          onChange(
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
        aria-label={`Une étiquette de plus pour ${name}`}
        className={buttonClass}
        onClick={() => onChange(Math.min(MAX_PER_PRODUCT, count + 1))}
      >
        +
      </button>
    </div>
  );
}
