import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Étiquettes BVP",
  description:
    "Étiquetage réglementaire BVP : fiches produits, planches A4 Agipa 118987 (8 étiquettes 99,1 × 67,7 mm) avec code-barres caisse.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
