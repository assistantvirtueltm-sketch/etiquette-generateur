"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { PrintView } from "@/components/PrintView";
import { ProductsView } from "@/components/ProductsView";
import { SettingsView } from "@/components/SettingsView";
import { downloadJson, downloadPdf } from "@/lib/download";
import { AGIPA_118987 } from "@/lib/label-layout";
import type { MeasureText } from "@/lib/label-render";
import {
  acknowledgeLibraryNotice,
  getLibraryState,
  getServerLibraryState,
  subscribeLibrary,
  updateLibrary,
} from "@/lib/library-store";
import {
  buildCalibrationPdf,
  buildPrintPdf,
  createMeasurer,
  LabelRefusedError,
} from "@/lib/pdf";
import type { Product } from "@/lib/product";
import {
  applyImport,
  parseImport,
  serializeLibrary,
  serializeReferences,
  upsertReference,
  type ImportMode,
  type LibrarySettings,
} from "@/lib/storage";

const SPEC = AGIPA_118987;

type Tab = "print" | "products" | "settings";
type Status = { kind: "info" | "error"; text: string } | null;

const TABS: { id: Tab; label: string }[] = [
  { id: "print", label: "Impression du jour" },
  { id: "products", label: "Fiches produits" },
  { id: "settings", label: "Réglages et sauvegarde" },
];

/** Mesureur de police et date du jour : n'existent que côté navigateur. */
interface ClientEnv {
  measure: MeasureText;
  today: Date;
}

function isoToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function Page() {
  const { library, dropped, error: storeError } = useSyncExternalStore(
    subscribeLibrary,
    getLibraryState,
    getServerLibraryState,
  );
  const [env, setEnv] = useState<ClientEnv | null>(null);
  const [tab, setTab] = useState<Tab>("print");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  // Les métriques de police servent à la fois au PDF et à l'aperçu.
  useEffect(() => {
    createMeasurer().then((measure) => setEnv({ measure, today: new Date() }));
  }, []);

  const activeProducts = useMemo(
    () =>
      library.products
        .filter((product) => product.active)
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [library.products],
  );

  function updateSettings(patch: Partial<LibrarySettings>) {
    updateLibrary((current) => ({
      ...current,
      settings: { ...current.settings, ...patch },
    }));
  }

  function saveProduct(product: Product) {
    updateLibrary((current) => {
      const exists = current.products.some((item) => item.id === product.id);
      const hasComposition = product.components.some(
        (component) => component.ingredients.trim() !== "",
      );
      return {
        ...current,
        products: exists
          ? current.products.map((item) => (item.id === product.id ? product : item))
          : [...current.products, product],
        references: hasComposition
          ? upsertReference(current.references, product)
          : current.references,
      };
    });
    setStatus({ kind: "info", text: `Fiche « ${product.name} » enregistrée.` });
  }

  function removeProduct(product: Product) {
    if (!window.confirm(`Supprimer la fiche « ${product.name || "sans nom"} » ?`)) {
      return;
    }
    updateLibrary((current) => ({
      ...current,
      products: current.products.filter((item) => item.id !== product.id),
    }));
  }

  async function print() {
    const jobs = activeProducts
      .map((product) => ({ product, count: quantities[product.id] ?? 0 }))
      .filter((job) => job.count > 0);
    setBusy(true);
    try {
      const pdf = await buildPrintPdf(jobs, library.settings, new Date(), SPEC);
      downloadPdf(pdf.bytes, pdf.fileName);
      setStatus({
        kind: "info",
        text: [
          `${pdf.fileName} : ${pdf.labelCount} étiquette(s) sur ${pdf.sheetCount} feuille(s). Mettre ${pdf.sheetCount} feuille(s) ${SPEC.reference} dans l'imprimante et imprimer à 100 %.`,
          ...pdf.warnings,
        ].join(" "),
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text:
          error instanceof LabelRefusedError || error instanceof Error
            ? error.message
            : "Génération impossible.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function printCalibration() {
    setBusy(true);
    try {
      const pdf = await buildCalibrationPdf(SPEC, {
        xMm: library.settings.offsetXMm,
        yMm: library.settings.offsetYMm,
      });
      downloadPdf(pdf.bytes, pdf.fileName);
      setStatus({
        kind: "info",
        text: "Planche de calibration téléchargée : l'imprimer à 100 % sur papier ordinaire et la superposer au support.",
      });
    } finally {
      setBusy(false);
    }
  }

  function handleImport(file: File, mode: ImportMode) {
    void file.text().then((text) => {
      const parsed = parseImport(text);
      if (!parsed.ok) {
        setStatus({ kind: "error", text: parsed.error });
        return;
      }
      const incoming = parsed.result.library;
      if (
        mode === "replace" &&
        !window.confirm(
          `Remplacer toute la base (${library.products.length} fiche(s), ${library.references.length} référence(s)) par le fichier (${incoming.products.length} fiche(s), ${incoming.references.length} référence(s)) ? Exporter d'abord la base actuelle si besoin.`,
        )
      ) {
        return;
      }
      let summary = "";
      updateLibrary((current) => {
        const result = applyImport(current, incoming, mode);
        summary = `Import terminé : ${result.productsAdded} fiche(s) ajoutée(s), ${result.productsUpdated} mise(s) à jour ; référentiel : ${result.referencesAdded} ajoutée(s), ${result.referencesUpdated} mise(s) à jour.`;
        return result.library;
      });
      setQuantities({});
      setStatus({
        kind: parsed.result.dropped > 0 ? "error" : "info",
        text:
          parsed.result.dropped > 0
            ? `${summary} ${parsed.result.dropped} entrée(s) illisible(s) écartée(s).`
            : summary,
      });
    });
  }

  const notice =
    storeError ??
    (dropped > 0
      ? `${dropped} entrée(s) illisible(s) ont été écartées au chargement.`
      : null);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Étiquettes BVP
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Étiquetage réglementaire des produits de boulangerie-viennoiserie-pâtisserie
            · {SPEC.reference} — {SPEC.name}
          </p>
        </div>
        <nav className="flex gap-1 rounded-lg bg-stone-200 p-1" aria-label="Sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === item.id
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {notice ? (
        <p
          role="alert"
          className="mb-5 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <span>{notice}</span>
          <button type="button" onClick={acknowledgeLibraryNotice} className="shrink-0 underline">
            Masquer
          </button>
        </p>
      ) : null}

      {status ? (
        <p
          aria-live="polite"
          className={`mb-5 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
            status.kind === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          <span>{status.text}</span>
          <button type="button" onClick={() => setStatus(null)} className="shrink-0 underline">
            Fermer
          </button>
        </p>
      ) : null}

      {!env ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : tab === "print" ? (
        <PrintView
          products={activeProducts}
          settings={library.settings}
          spec={SPEC}
          measure={env.measure}
          today={env.today}
          quantities={quantities}
          onQuantityChange={(productId, count) =>
            setQuantities((current) => ({ ...current, [productId]: count }))
          }
          onReset={() => setQuantities({})}
          onPrint={() => void print()}
          onOrientationChange={(orientation) => updateSettings({ orientation })}
          busy={busy}
        />
      ) : tab === "products" ? (
        <ProductsView
          library={library}
          spec={SPEC}
          measure={env.measure}
          today={env.today}
          onSave={saveProduct}
          onRemove={removeProduct}
          onToggleActive={(product, active) =>
            updateLibrary((current) => ({
              ...current,
              products: current.products.map((item) =>
                item.id === product.id ? { ...item, active } : item,
              ),
            }))
          }
        />
      ) : (
        <SettingsView
          library={library}
          spec={SPEC}
          busy={busy}
          onSettingsChange={updateSettings}
          onCalibration={() => void printCalibration()}
          onExportAll={() =>
            downloadJson(
              serializeLibrary(library),
              `etiquettes-bvp-sauvegarde-${isoToday()}.json`,
            )
          }
          onExportReferences={() =>
            downloadJson(
              serializeReferences(library),
              `etiquettes-bvp-referentiel-${isoToday()}.json`,
            )
          }
          onImport={handleImport}
          onRemoveReference={(id) =>
            updateLibrary((current) => ({
              ...current,
              references: current.references.filter((ref) => ref.id !== id),
            }))
          }
          onError={(message) => setStatus({ kind: "error", text: message })}
        />
      )}
    </main>
  );
}
