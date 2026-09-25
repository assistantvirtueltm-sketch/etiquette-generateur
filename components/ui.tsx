"use client";

import { useState, type ReactNode } from "react";

import { formatNumber, parseNumber, type ProductIssue } from "@/lib/product";

export const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm shadow-xs outline-none focus:border-stone-500";

export const buttonClass =
  "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400";

export const primaryButtonClass =
  "rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400";

export function Card({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs font-medium text-stone-600 ${className}`}>
      {label}
      {children}
      {hint ? (
        <span className="mt-1 block font-normal text-stone-500">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * Saisie d'un nombre décimal à la française. Garde le texte tapé (« 3, ») tant
 * qu'il n'est pas complet ; le parent reçoit `null` pour un champ vide et
 * `undefined` pour une saisie illisible. Pour forcer une nouvelle valeur
 * depuis l'extérieur, changer la `key` du composant.
 */
export function DecimalInput({
  value,
  onChange,
  className = inputClass,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null | undefined) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value === null ? "" : formatNumber(value));
  const invalid = parseNumber(text) === undefined;
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(parseNumber(event.target.value));
      }}
      className={`${className} ${invalid ? "border-red-400" : ""}`}
    />
  );
}

export function IssueList({ issues }: { issues: readonly ProductIssue[] }) {
  if (issues.length === 0) {
    return (
      <p className="text-sm text-emerald-700">
        Fiche complète : prête à imprimer.
      </p>
    );
  }
  return (
    <ul className="space-y-1 text-sm">
      {issues.map((issue) => (
        <li
          key={issue.message}
          className={
            issue.level === "error" ? "text-red-700" : "text-amber-700"
          }
        >
          {issue.level === "error" ? "✕ " : "⚠ "}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
