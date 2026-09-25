"use client";

import { useMemo, useState } from "react";

import { LabelPreview } from "@/components/LabelPreview";
import {
  buttonClass,
  Card,
  DecimalInput,
  Field,
  inputClass,
  IssueList,
  primaryButtonClass,
} from "@/components/ui";
import { emphasizeAllergens, normalizeWord, unemphasizedAllergens } from "@/lib/allergens";
import type { SheetSpec } from "@/lib/label-layout";
import { prepareLabel } from "@/lib/label-job";
import type { MeasureText } from "@/lib/label-render";
import {
  compositionOf,
  DATE_WORDING,
  emptyComponent,
  emptyNutrition,
  formatNumber,
  formatPrice,
  MAX_SHELF_LIFE_DAYS,
  NUTRIENTS,
  parsePrice,
  pricePerKgCents,
  type NutritionTable,
  type Product,
  type ProductComponent,
  type ReferenceSheet,
} from "@/lib/product";
import type { LibrarySettings } from "@/lib/storage";
import { resolveCode, SYMBOLOGY_LABELS } from "@/lib/symbology";

interface ProductEditorProps {
  /** Fiche telle qu'enregistrée : chaque modification est écrite aussitôt. */
  product: Product;
  isNew: boolean;
  references: readonly ReferenceSheet[];
  settings: LibrarySettings;
  spec: SheetSpec;
  measure: MeasureText | null;
  today: Date;
  onChange: (product: Product) => void;
  onClose: () => void;
}

/** Deux versions d'une fiche sont-elles identiques (date de modif. exclue) ? */
function sameContent(a: Product, b: Product): boolean {
  return (
    JSON.stringify({ ...a, updatedAt: "" }) ===
    JSON.stringify({ ...b, updatedAt: "" })
  );
}

function matchesQuery(reference: ReferenceSheet, query: string): boolean {
  const q = normalizeWord(query).trim();
  if (q.length < 2) return false;
  return (
    normalizeWord(reference.name).includes(q) ||
    reference.supplierCode.includes(q)
  );
}

/**
 * Éditeur de fiche à enregistrement immédiat : chaque frappe est écrite dans
 * la base. La version à l'ouverture est gardée pour pouvoir tout annuler.
 */
export function ProductEditor({
  product: draft,
  isNew,
  references,
  settings,
  spec,
  measure,
  today,
  onChange,
  onClose,
}: ProductEditorProps) {
  // Version à l'ouverture de l'éditeur, pour « Annuler mes modifications ».
  const [snapshot] = useState<Product>(draft);
  // Incrémenté quand des valeurs sont imposées de l'extérieur (reprise d'une
  // fiche du référentiel) : force les champs numériques à se réinitialiser.
  const [revision, setRevision] = useState(0);
  const [priceText, setPriceText] = useState(
    draft.priceCents > 0 ? formatNumber(draft.priceCents / 100) : "",
  );
  const [nameFocused, setNameFocused] = useState(false);

  const update = (patch: Partial<Product>) =>
    onChange({ ...draft, ...patch, updatedAt: new Date().toISOString() });

  function revert() {
    onChange(snapshot);
    setPriceText(
      snapshot.priceCents > 0 ? formatNumber(snapshot.priceCents / 100) : "",
    );
    setRevision((n) => n + 1);
  }
  const modified = !sameContent(draft, snapshot);

  const updateComponent = (id: string, patch: Partial<ProductComponent>) =>
    update({
      components: draft.components.map((component) =>
        component.id === id ? { ...component, ...patch } : component,
      ),
    });

  const updateNutrition = (id: string, patch: Partial<NutritionTable>) =>
    update({
      nutrition: draft.nutrition.map((table) =>
        table.id === id ? { ...table, ...patch } : table,
      ),
    });

  const suggestions = useMemo(
    () =>
      nameFocused
        ? references
            .filter((reference) => matchesQuery(reference, draft.name))
            .slice(0, 8)
        : [],
    [nameFocused, references, draft.name],
  );

  const code = resolveCode(draft.barcode, draft.symbology);
  const perKg =
    draft.netWeightGrams !== null && draft.netWeightGrams > 0
      ? pricePerKgCents(draft.priceCents, draft.netWeightGrams)
      : null;
  const prepared = useMemo(
    () => (measure ? prepareLabel(draft, settings, today, spec, measure) : null),
    [draft, settings, today, spec, measure],
  );

  function applyReference(reference: ReferenceSheet) {
    const composition = compositionOf(reference);
    update({ ...composition });
    setRevision((n) => n + 1);
    setNameFocused(false);
  }

  const shelfLifeInvalid =
    !Number.isInteger(draft.shelfLifeDays) ||
    draft.shelfLifeDays < 0 ||
    draft.shelfLifeDays > MAX_SHELF_LIFE_DAYS;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px]">
      <form
        className="space-y-6"
        // Pas de bouton « Enregistrer » : Entrée ne doit rien soumettre.
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <span>
            Enregistrement automatique : chaque modification est prise en
            compte immédiatement.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={!modified}
              onClick={revert}
            >
              Annuler mes modifications
            </button>
            <button type="button" className={primaryButtonClass} onClick={onClose}>
              Fermer la fiche
            </button>
          </div>
        </div>
        <Card title={isNew ? "Nouvelle fiche produit" : "Modifier la fiche"}>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div className="relative">
              <Field
                label="Dénomination de vente"
                hint="Commencer à taper : les fiches du référentiel correspondantes sont proposées."
              >
                <input
                  type="text"
                  value={draft.name}
                  autoComplete="off"
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="Pains au chocolat pur beurre x4"
                  className={inputClass}
                />
              </Field>
              {suggestions.length > 0 ? (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-stone-300 bg-white shadow-lg">
                  {suggestions.map((reference) => (
                    <li key={reference.id}>
                      <button
                        type="button"
                        // mousedown : passe avant la perte de focus du champ.
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applyReference(reference);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-stone-100"
                      >
                        <span className="font-medium">{reference.name}</span>
                        {reference.supplierCode ? (
                          <span className="ml-2 font-mono text-xs text-stone-500">
                            {reference.supplierCode}
                          </span>
                        ) : null}
                        <span className="block text-xs text-stone-500">
                          Reprendre la composition (ingrédients, allergènes,
                          valeurs nutritionnelles)
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Field label="Réf. fournisseur (facultatif)" hint="6 ou 9 chiffres.">
              <input
                type="text"
                inputMode="numeric"
                value={draft.supplierCode}
                onChange={(event) =>
                  update({ supplierCode: event.target.value.replace(/\s/g, "") })
                }
                className={`${inputClass} font-mono`}
              />
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => update({ active: event.target.checked })}
            />
            Produit actif (proposé dans la mercuriale d&apos;impression)
          </label>
        </Card>

        <Card title="Caisse et vente">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Code-barres (généré par la caisse)"
              hint={
                draft.barcode.trim() === "" ? (
                  "Copier-coller le code créé en caisse."
                ) : code.ok ? (
                  <span className="text-emerald-700">
                    {SYMBOLOGY_LABELS[code.code.symbology]} ·{" "}
                    <span className="font-mono">{code.code.value}</span>
                    {code.code.checkDigitComputed ? " · clé calculée" : ""}
                  </span>
                ) : (
                  <span className="text-red-700">{code.error}</span>
                )
              }
            >
              <input
                type="text"
                autoComplete="off"
                value={draft.barcode}
                onChange={(event) => update({ barcode: event.target.value })}
                placeholder="2000000271040"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Nombre de pièces">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={draft.pieces}
                  onChange={(event) =>
                    update({ pieces: Math.trunc(Number(event.target.value)) })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Poids net (g)">
                <DecimalInput
                  key={`weight-${revision}`}
                  value={draft.netWeightGrams}
                  onChange={(value) =>
                    update({ netWeightGrams: value === undefined ? -1 : value })
                  }
                />
              </Field>
              <Field label="Prix de vente (€)">
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceText}
                  onChange={(event) => {
                    setPriceText(event.target.value);
                    update({ priceCents: parsePrice(event.target.value) ?? 0 });
                  }}
                  placeholder="3,00"
                  className={`${inputClass} ${
                    priceText !== "" && parsePrice(priceText) === null
                      ? "border-red-400"
                      : ""
                  }`}
                />
              </Field>
            </div>
          </div>

          {perKg !== null ? (
            <p className="mt-2 text-xs text-stone-600">
              Prix au kg calculé : <strong>{formatPrice(perKg)}</strong>
            </p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <fieldset className="text-xs font-medium text-stone-600">
              <legend>Type de date</legend>
              {(["dlc", "ddm"] as const).map((kind) => (
                <label key={kind} className="mt-1 flex items-center gap-2 text-sm font-normal text-stone-700">
                  <input
                    type="radio"
                    name="date-kind"
                    checked={draft.dateKind === kind}
                    onChange={() => update({ dateKind: kind })}
                  />
                  {kind === "dlc" ? "DLC" : "DDM"} — « {DATE_WORDING[kind]} … »
                </label>
              ))}
            </fieldset>
            <Field
              label="Durée de vie (jours)"
              hint="Date imprimée = jour de l'impression + ce nombre de jours."
            >
              <input
                type="number"
                min={0}
                max={MAX_SHELF_LIFE_DAYS}
                step={1}
                value={draft.shelfLifeDays}
                onChange={(event) =>
                  update({ shelfLifeDays: Math.trunc(Number(event.target.value)) })
                }
                className={`${inputClass} ${shelfLifeInvalid ? "border-red-400" : ""}`}
              />
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={draft.bakedToday}
              onChange={(event) => update({ bakedToday: event.target.checked })}
            />
            Imprimer « Cuit et emballé le même jour »
          </label>
        </Card>

        <Card
          title="Composition"
          actions={
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                update({ components: [...draft.components, emptyComponent()] })
              }
            >
              + Composant (assortiment)
            </button>
          }
        >
          <p className="mb-4 text-xs text-stone-500">
            Recopier la liste du carton fournisseur. Les{" "}
            <strong>allergènes s&apos;écrivent en MAJUSCULES</strong> : ils
            sont imprimés en gras.
          </p>
          <div className="space-y-5">
            {draft.components.map((component, index) => {
              const hints = unemphasizedAllergens(component.ingredients);
              const multiple = draft.components.length > 1;
              return (
                <div
                  key={component.id}
                  className={multiple ? "rounded-md border border-stone-200 p-3" : ""}
                >
                  {multiple ? (
                    <div className="mb-2 flex items-end gap-2">
                      <Field label={`Composant n° ${index + 1}`} className="flex-1">
                        <input
                          type="text"
                          value={component.name}
                          placeholder="Mini croissant"
                          onChange={(event) =>
                            updateComponent(component.id, { name: event.target.value })
                          }
                          className={inputClass}
                        />
                      </Field>
                      <button
                        type="button"
                        className={`${buttonClass} text-red-700`}
                        onClick={() =>
                          update({
                            components: draft.components.filter(
                              (item) => item.id !== component.id,
                            ),
                          })
                        }
                      >
                        Retirer
                      </button>
                    </div>
                  ) : null}
                  <Field label="Ingrédients">
                    <textarea
                      rows={5}
                      value={component.ingredients}
                      onChange={(event) =>
                        updateComponent(component.id, {
                          ingredients: event.target.value,
                        })
                      }
                      placeholder="Farine de BLÉ, BEURRE 19 %, eau, chocolat 10,5 % (sucre, pâte de cacao, …), sucre, levure, sel, ŒUF…"
                      className={inputClass}
                    />
                  </Field>
                  {hints.length > 0 ? (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-amber-700">
                      Allergène(s) possible(s) en minuscules :{" "}
                      {hints.map((hint) => hint.word).join(", ")}
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          updateComponent(component.id, {
                            ingredients: emphasizeAllergens(component.ingredients),
                          })
                        }
                      >
                        Mettre en majuscules
                      </button>
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              label="Peut contenir (traces)"
              hint="Ex. : noisettes, SOJA, amandes."
            >
              <input
                type="text"
                value={draft.mayContain}
                onChange={(event) => update({ mayContain: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Origine" hint="Ex. : farine de BLÉ France.">
              <input
                type="text"
                value={draft.origin}
                onChange={(event) => update({ origin: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field
              label="Conditions de conservation"
              hint="Ex. : À conserver à l'abri de la chaleur et de l'humidité."
            >
              <input
                type="text"
                value={draft.storage}
                onChange={(event) => update({ storage: event.target.value })}
                className={inputClass}
              />
            </Field>
            <label className="flex items-center gap-2 self-center text-sm text-stone-700">
              <input
                type="checkbox"
                checked={draft.thawed}
                onChange={(event) => update({ thawed: event.target.checked })}
              />
              Vendu décongelé (« Produit décongelé, ne pas recongeler »)
            </label>
          </div>
        </Card>

        <Card
          title="Valeurs nutritionnelles (pour 100 g)"
          actions={
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                update({ nutrition: [...draft.nutrition, emptyNutrition()] })
              }
            >
              + Tableau
            </button>
          }
        >
          {draft.nutrition.length === 0 ? (
            <p className="text-sm text-stone-500">
              Aucun tableau. En ajouter un (ou un par variété pour un
              assortiment qui en déclare plusieurs).
            </p>
          ) : null}
          <div className="space-y-5">
            {draft.nutrition.map((table) => (
              <div key={table.id} className="rounded-md border border-stone-200 p-3">
                <div className="mb-3 flex items-end gap-2">
                  <Field
                    label="Titre (si plusieurs tableaux)"
                    className="flex-1"
                  >
                    <input
                      type="text"
                      value={table.title}
                      placeholder="Dots Pink Nubes"
                      onChange={(event) =>
                        updateNutrition(table.id, { title: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <button
                    type="button"
                    className={`${buttonClass} text-red-700`}
                    onClick={() =>
                      update({
                        nutrition: draft.nutrition.filter((t) => t.id !== table.id),
                      })
                    }
                  >
                    Retirer
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {NUTRIENTS.map((nutrient) => (
                    <Field
                      key={nutrient.key}
                      label={`${nutrient.label} (${nutrient.unit})${nutrient.optional ? " — facultatif" : ""}`}
                    >
                      <DecimalInput
                        key={`${table.id}-${nutrient.key}-${revision}`}
                        value={table[nutrient.key]}
                        onChange={(value) =>
                          updateNutrition(table.id, {
                            [nutrient.key]: value ?? null,
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex gap-2">
          <button type="button" className={primaryButtonClass} onClick={onClose}>
            Fermer la fiche
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!modified}
            onClick={revert}
          >
            Annuler mes modifications
          </button>
        </div>
      </form>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card title="Aperçu à l'échelle">
          {prepared?.content ? (
            <LabelPreview
              spec={spec}
              content={prepared.content}
              logoUrl={settings.logo?.dataUrl}
            />
          ) : (
            <p className="text-sm text-stone-500">
              Saisir un code-barres valide pour voir l&apos;étiquette.
            </p>
          )}
          {prepared?.content ? (
            <p className="mt-2 text-xs text-stone-500">
              Texte courant en {formatNumber(prepared.content.bodySizePt)} pt
              (minimum légal {formatNumber(Math.round(prepared.content.minSizePt * 10) / 10)} pt).
            </p>
          ) : null}
        </Card>
        <Card title="Contrôles">
          {prepared ? <IssueList issues={prepared.issues} /> : null}
        </Card>
      </div>
    </div>
  );
}
