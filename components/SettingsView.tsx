"use client";

import { useRef, useState } from "react";

import { SheetSpecCard } from "@/components/SheetSpecCard";
import {
  buttonClass,
  Card,
  Field,
  inputClass,
} from "@/components/ui";
import type { SheetSpec } from "@/lib/label-layout";
import type {
  ImportMode,
  Library,
  LibrarySettings,
  MinXHeightMm,
  StoreLogo,
} from "@/lib/storage";

/** Le logo vit dans le localStorage (quelques Mo en tout) : on le borne. */
const MAX_LOGO_BYTES = 300 * 1024;

interface SettingsViewProps {
  library: Library;
  spec: SheetSpec;
  busy: boolean;
  onSettingsChange: (patch: Partial<LibrarySettings>) => void;
  onCalibration: () => void;
  onExportAll: () => void;
  onExportReferences: () => void;
  onImport: (file: File, mode: ImportMode) => void;
  onRemoveReference: (id: string) => void;
  onError: (message: string) => void;
}

function readLogo(file: File): Promise<StoreLogo> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      reject(new Error("Logo : format PNG ou JPEG uniquement."));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error("Logo trop lourd (300 Ko maximum)."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Logo illisible."));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onerror = () => reject(new Error("Logo illisible."));
      image.onload = () =>
        resolve({
          dataUrl,
          widthPx: image.naturalWidth,
          heightPx: image.naturalHeight,
        });
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function SettingsView({
  library,
  spec,
  busy,
  onSettingsChange,
  onCalibration,
  onExportAll,
  onExportReferences,
  onImport,
  onRemoveReference,
  onError,
}: SettingsViewProps) {
  const { settings } = library;
  const importInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card title="Magasin">
          <p className="mb-4 text-xs text-stone-500">
            Nom et adresse de l&apos;exploitant : mention obligatoire, imprimée
            en pied de chaque étiquette.
          </p>
          <div className="space-y-4">
            <Field label="Enseigne / raison sociale">
              <input
                type="text"
                value={settings.store.name}
                onChange={(event) =>
                  onSettingsChange({
                    store: { ...settings.store, name: event.target.value },
                  })
                }
                placeholder="SUPER U"
                className={inputClass}
              />
            </Field>
            <Field label="Adresse postale complète">
              <input
                type="text"
                value={settings.store.address}
                onChange={(event) =>
                  onSettingsChange({
                    store: { ...settings.store, address: event.target.value },
                  })
                }
                placeholder="82 chemin des Espélugues, 84800 L'Isle-sur-la-Sorgue"
                className={inputClass}
              />
            </Field>
            <div>
              <p className="text-xs font-medium text-stone-600">Logo</p>
              <div className="mt-2 flex items-center gap-3">
                {settings.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL locale, pas d'optimisation possible
                  <img
                    src={settings.logo.dataUrl}
                    alt="Logo du magasin"
                    className="h-10 w-auto rounded border border-stone-200 bg-white p-1"
                  />
                ) : (
                  <span className="text-sm text-stone-500">Aucun logo.</span>
                )}
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => logoInput.current?.click()}
                >
                  {settings.logo ? "Remplacer" : "Choisir un fichier"}
                </button>
                {settings.logo ? (
                  <button
                    type="button"
                    className={`${buttonClass} text-red-700`}
                    onClick={() => onSettingsChange({ logo: null })}
                  >
                    Retirer
                  </button>
                ) : null}
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    readLogo(file).then(
                      (logo) => onSettingsChange({ logo }),
                      (error: Error) => onError(error.message),
                    );
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-stone-500">
                PNG ou JPEG, 300 Ko max. Imprimé en haut à gauche (16 × 9 mm
                au plus).
              </p>
            </div>
          </div>
        </Card>

        <Card title="Taille minimale du texte">
          <fieldset className="space-y-2 text-sm text-stone-700">
            <legend className="mb-2 text-xs text-stone-500">
              Hauteur d&apos;x minimale des mentions obligatoires (règlement
              INCO, art. 13). En dessous, l&apos;impression est refusée.
            </legend>
            {([1.2, 0.9] as MinXHeightMm[]).map((value) => (
              <label key={value} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="min-x-height"
                  checked={settings.minXHeightMm === value}
                  onChange={() => onSettingsChange({ minXHeightMm: value })}
                  className="mt-1"
                />
                <span>
                  {value === 1.2
                    ? "1,2 mm — cas général"
                    : "0,9 mm — uniquement si la plus grande face de l'emballage fait moins de 80 cm²"}
                </span>
              </label>
            ))}
          </fieldset>
        </Card>

        <Card title="Calibration de l'imprimante">
          <p className="mb-3 text-xs text-stone-500">
            Décalage appliqué à toute la planche, propre à l&apos;imprimante de
            ce poste (il n&apos;est pas écrasé par un import).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Décalage X (mm, + vers la droite)">
              <DecimalInputSigned
                value={settings.offsetXMm}
                onChange={(offsetXMm) => onSettingsChange({ offsetXMm })}
              />
            </Field>
            <Field label="Décalage Y (mm, + vers le bas)">
              <DecimalInputSigned
                value={settings.offsetYMm}
                onChange={(offsetYMm) => onSettingsChange({ offsetYMm })}
              />
            </Field>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCalibration}
            className={`${buttonClass} mt-3 w-full`}
          >
            Télécharger la planche de calibration
          </button>
          <p className="mt-2 text-xs text-stone-500">
            L&apos;imprimer à 100 % sur papier ordinaire et la superposer à une
            feuille d&apos;étiquettes, à contre-jour.
          </p>
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="Sauvegarde">
          <p className="mb-3 text-xs text-stone-500">
            Les fiches vivent dans ce navigateur uniquement. Exporter
            régulièrement : le fichier JSON est la seule sauvegarde, et il sert
            à installer le même catalogue sur un autre poste.
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" className={buttonClass} onClick={onExportAll}>
              Exporter toute la base (fiches, référentiel, magasin)
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={onExportReferences}
            >
              Exporter le référentiel seul (à partager, sans codes ni prix)
            </button>
          </div>
          <fieldset className="mt-4 space-y-1 text-sm text-stone-700">
            <legend className="mb-1 text-xs font-medium text-stone-600">
              Import d&apos;un fichier
            </legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="import-mode"
                checked={importMode === "merge"}
                onChange={() => setImportMode("merge")}
                className="mt-1"
              />
              Fusionner avec la base actuelle (les fiches du fichier
              remplacent celles de même identifiant)
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="import-mode"
                checked={importMode === "replace"}
                onChange={() => setImportMode("replace")}
                className="mt-1"
              />
              Remplacer toute la base par le fichier
            </label>
          </fieldset>
          <button
            type="button"
            className={`${buttonClass} mt-3 w-full`}
            onClick={() => importInput.current?.click()}
          >
            Importer un fichier JSON
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onImport(file, importMode);
            }}
          />
        </Card>

        <Card title={`Référentiel (${library.references.length})`}>
          <p className="mb-3 text-xs text-stone-500">
            Compositions proposées à la saisie d&apos;une dénomination. Il se
            remplit à chaque enregistrement de fiche et par import.
          </p>
          {library.references.length === 0 ? (
            <p className="text-sm text-stone-500">Référentiel vide.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-stone-200 overflow-y-auto">
              {[...library.references]
                .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                .map((reference) => (
                  <li key={reference.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {reference.name}
                      {reference.supplierCode ? (
                        <span className="ml-2 font-mono text-xs text-stone-500">
                          {reference.supplierCode}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className={`${buttonClass} text-red-700`}
                      onClick={() => onRemoveReference(reference.id)}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <SheetSpecCard spec={spec} />
      </div>
    </div>
  );
}

/** Décalage signé (« -0,5 ») : saisie libre, appliquée quand elle est lisible. */
function DecimalInputSigned({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value).replace(".", ","));
  const parsed = Number(text.trim().replace(",", "."));
  const invalid = text.trim() !== "" && !Number.isFinite(parsed);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const next = Number(event.target.value.trim().replace(",", "."));
        if (event.target.value.trim() === "") onChange(0);
        else if (Number.isFinite(next)) onChange(next);
      }}
      className={`${inputClass} ${invalid ? "border-red-400" : ""}`}
    />
  );
}
