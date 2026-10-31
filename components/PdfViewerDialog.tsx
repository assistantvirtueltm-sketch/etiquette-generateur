"use client";

import { useEffect, useRef } from "react";

import { WizardSteps } from "@/components/PrintWizard";
import { buttonClass, primaryButtonClass } from "@/components/ui";

export interface OpenedPdf {
  /** URL `blob:` du PDF généré en mémoire (révoquée à la fermeture). */
  url: string;
  fileName: string;
  title: string;
  /** Consigne affichée au-dessus du PDF (feuilles à charger…). */
  hint: string;
}

/**
 * Fenêtre d'aperçu du PDF dans l'app : le visionneur PDF du navigateur dans
 * un cadre, avec impression directe. Le téléchargement reste proposé, et
 * « Ouvrir dans un onglet » sert de repli aux navigateurs (mobiles surtout)
 * qui n'affichent pas un PDF dans un cadre. Avec `onBack`, la fenêtre est
 * l'étape 3 du parcours d'impression et permet de revenir aux quantités.
 */
export function PdfViewerDialog({
  pdf,
  onClose,
  onBack,
}: {
  pdf: OpenedPdf;
  onClose: () => void;
  onBack?: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Échap ferme la fenêtre ; le focus part sur « Fermer » à l'ouverture.
  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function print() {
    try {
      // Même origine (URL blob:) : la boîte d'impression du navigateur
      // s'ouvre sur le PDF lui-même, pas sur la page de l'app.
      frame.current?.contentWindow?.focus();
      frame.current?.contentWindow?.print();
    } catch {
      window.open(pdf.url, "_blank", "noopener");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-viewer-title"
        className="flex h-full max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
      >
        {onBack ? (
          <div className="border-b border-stone-200 px-4 py-2">
            <WizardSteps current={2} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="pdf-viewer-title" className="truncate text-sm font-semibold text-stone-900">
              {pdf.title}
            </h2>
            <p className="text-xs text-stone-600">{pdf.hint}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onBack ? (
              <button type="button" className={buttonClass} onClick={onBack}>
                ← Modifier les quantités
              </button>
            ) : null}
            <button type="button" className={primaryButtonClass} onClick={print}>
              Imprimer
            </button>
            <a
              href={pdf.url}
              target="_blank"
              rel="noopener"
              className={buttonClass}
            >
              Ouvrir dans un onglet
            </a>
            <a href={pdf.url} download={pdf.fileName} className={buttonClass}>
              Télécharger
            </a>
            <button
              ref={closeButton}
              type="button"
              className={buttonClass}
              onClick={onClose}
            >
              Fermer
            </button>
          </div>
        </div>
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          À l&apos;impression : choisir « Taille réelle » / « 100 % » et
          décocher « Ajuster à la page ».
        </p>
        <iframe
          ref={frame}
          src={pdf.url}
          title={pdf.title}
          className="min-h-0 w-full flex-1 bg-stone-100"
        />
      </div>
    </div>
  );
}
