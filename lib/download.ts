/**
 * URL `blob:` d'un PDF généré en mémoire, pour l'afficher dans l'app. À
 * révoquer (`URL.revokeObjectURL`) quand l'aperçu se ferme.
 */
export function pdfObjectUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
}

/** Déclenche le téléchargement d'un export JSON de la bibliothèque. */
export function downloadJson(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
