"use client";

import type { Orientation } from "@/lib/label-layout";

/**
 * Interrupteur à glissière paysage / portrait. Le support ne change pas : en
 * portrait, le contenu de chaque étiquette est tourné d'un quart de tour.
 */
export function OrientationSwitch({
  value,
  onChange,
}: {
  value: Orientation;
  onChange: (value: Orientation) => void;
}) {
  const portrait = value === "portrait";
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={portrait ? "text-stone-500" : "font-semibold text-stone-900"}>
        Paysage
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={portrait}
        aria-label="Étiquettes en portrait"
        onClick={() => onChange(portrait ? "landscape" : "portrait")}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 ${
          portrait ? "bg-stone-900" : "bg-stone-300"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
            portrait ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className={portrait ? "font-semibold text-stone-900" : "text-stone-500"}>
        Portrait
      </span>
    </div>
  );
}
