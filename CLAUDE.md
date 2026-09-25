# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Générateur d'étiquettes réglementaires BVP (boulangerie-viennoiserie-
pâtisserie) pour un magasin U, en remplacement d'une balance étiqueteuse Digi.
L'utilisateur tient des **fiches produits** ; chaque jour il choisit dans la
« mercuriale » le nombre d'étiquettes par produit actif, et l'app génère un PDF
A4 **multi-produits** sur planches Agipa 118987 (8 étiquettes 99,1 × 67,7 mm).
Projet public : chaque magasin saisit ses propres codes caisse. Voir
`README.md` pour l'usage.

Contraintes de cadrage (décidées, ne pas les réintroduire en question) :
- **Aucune base de données, aucune authentification, aucune API route.** Tout est
  client-side ; `next.config.ts` force `output: "export"` pour qu'aucun runtime
  serveur ne soit requis (déploiement Vercel zéro config).
- Les données vivent **uniquement dans le `localStorage`** ; la sauvegarde est
  un fichier JSON (export complet ou référentiel seul) à réimporter.
- PDF construit dans le navigateur, **codes-barres vectoriels** : ni image, ni
  canvas rastérisé (des barres floues cassent la lecture en caisse). Le logo
  du magasin est la seule image du PDF.
- Code-barres = EAN-13 généré par la caisse (préfixe 2), collé tel quel ; le
  prix n'y est pas encodé. Vente à la pièce à **prix fixe** : pas de pesée,
  mais un **poids net nominal** saisi par fiche, d'où le prix au kg imprimé.
- Pas d'impression à partir d'une étiquette donnée (planche entamée) ni
  d'historique des impressions : volontairement abandonnés.

## Commands

```bash
npm run dev                      # serveur de dev
npm run build                    # build + export statique dans out/
npm run lint                     # eslint . (Next 16 a supprimé `next lint`)
npm run typecheck                # tsc --noEmit
npm test                         # suite complète (Vitest, environnement node)
npm test -- lib/pdf.test.ts      # un seul fichier
npm test -- -t "clé de contrôle" # un seul test par son nom
npm run test:watch
```

Vitest ne ramasse que `lib/**/*.test.ts` (`vitest.config.mts`) : les composants
n'ont pas de tests, toute logique testable doit vivre dans `lib/`.
`lib/fixtures.ts` contient des fiches réelles (pain au chocolat, assortiment de
3 mini viennoiseries) : s'en servir pour les tests de mise en page.

Vérification dans un vrai navigateur (aucune dépendance de test E2E n'est
installée) : `npm run build`, servir `out/` (`python3 -m http.server`), puis
piloter Chromium avec `npm install --no-save playwright` et
`chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })`. Pour
regarder un PDF généré : `pip install pymupdf` puis `get_pixmap()`.

## Architecture

Pipeline, de la fiche produit au PDF — chaque étage est un module pur et testé :

```
fiche ──▶ product.ts         modèle, contrôles (productIssues), dates, prix
      ──▶ symbology.ts       validation du code caisse / clé de contrôle
      ──▶ barcode-modules.ts bwip-js raw() → largeurs de barres en modules
      ──▶ label-render.ts    primitives en mm (barres, textes, logo) + débordement
          (text-layout.ts : gras des allergènes, coupure des lignes)
      ──▶ label-job.ts       prepareLabel : tout ce qui précède, pour une date
      ──┬▶ pdf.ts            pdf-lib → N feuilles A4 (buildPrintPdf)
        └▶ LabelPreview.tsx  même contenu en SVG → l'aperçu = l'impression
```

- `lib/label-layout.ts` — **source unique des cotes** (planche et `LABEL_STYLE`
  de l'étiquette). Aucune position ne doit être écrite en dur ailleurs. Une
  planche est décrite par son **pas** (cote du massicot), pas par sa
  gouttière, et la matrice est **centrée** : les marges sont calculées
  (`sheetMarginsMm`), pas saisies. Les cotes de `AGIPA_118987` sont
  **provisoires** (matrice standard du format, gabarit du fabricant pas encore
  relevé) : voir `docs/agipa-118987-gabarit.md`. Quand le gabarit est
  disponible, les relever et les figer par un test qui compare aux valeurs
  brutes du gabarit — ne pas les déduire d'un autre support au même format.
- **Orientation** (réglage `orientation`, interrupteur de l'onglet Impression) :
  le support ne tourne jamais. `label-render` compose dans le cadre de lecture
  (`labelBoxMm` : 99,1 × 67,7 en paysage, 67,7 × 99,1 en portrait) ; `pdf.ts`
  tourne le contenu portrait de 90° horaire (`boxToSlotRect` pour les barres,
  `rotate` pour textes et logo). L'aperçu SVG montre l'étiquette dans son sens
  de lecture. En portrait, le pied s'empile : infos pleine largeur, puis poids
  et prix à droite du code-barres (« beside »), ou tout en pleine largeur
  (« stacked ») si les montants sont trop larges.
- `labelSlot(spec, index, offset)` est le seul point qui place une étiquette ;
  le décalage imprimante X/Y (planche de calibration, réglages) passe par lui.
- Ajouter un format = ajouter une `SheetSpec` à `SHEET_SPECS` (+ `purchase`).
  Les tests `catalogue des planches` s'y appliquent automatiquement ; tant que
  l'UI ne propose qu'un format, `app/page.tsx` fixe `SPEC`.
- `lib/label-render.ts` — mise en page d'une étiquette : en-tête (logo +
  dénomination), corps (ingrédients par composant, traces, origine, valeurs
  nutritionnelles, mentions), pied (code-barres à gauche ; dates, pièces,
  prix au kg, réf. fournisseur, puis poids net + prix à droite), ligne du
  magasin. Les chiffres du poids net respectent la hauteur légale
  (`netQuantityFigureHeightMm` : 2/3/4/6 mm selon le poids,
  `figureFontSizePt`). Le corps prend le plus
  grand corps qui tient, **jamais sous `minFontSizePt(minXHeightMm)`** (hauteur
  d'x légale INCO : 1,2 mm, ou 0,9 mm si emballage < 80 cm²). Si ça ne tient
  pas : `fits: false` + erreur bloquante. **Ne jamais tronquer** un texte
  réglementaire (c'était le défaut des étiquettes Digi d'origine).
- `lib/text-layout.ts` — mots entièrement en MAJUSCULES (≥ 3 lettres) = gras
  (convention allergènes, cf. `lib/allergens.ts` qui détecte aussi les
  allergènes laissés en minuscules). Coupure aux espaces ordinaires et après
  `, ; : ) /` ; l'espace insécable lie un nombre à son unité. Assainit les
  textes pour WinAnsi (polices standard, sinon `drawText` échoue).
- `lib/pdf.ts` — fournit le mesureur Helvetica de pdf-lib, **partagé avec
  l'aperçu** : écran et papier ont la même mise en page au dixième de mm.
  `buildPrintPdf` refuse tout le lot (`LabelRefusedError`) si une seule fiche
  n'est pas imprimable ; produit aussi la planche de calibration.
- `lib/storage.ts` — seul accès au `localStorage`, schéma versionné (v2 ;
  migre la v1 mono-produit de l'ancienne clé), `migrate()` ne lève jamais et
  écarte les entrées illisibles. Le fichier d'export a le même schéma.
  `applyImport` : fusion (fiches par id, référentiel par clé réf. fournisseur
  sinon nom) ou remplacement ; le décalage imprimante n'est jamais importé.
  Le **référentiel** (`references`) = compositions réutilisables, proposé en
  autocomplétion de la dénomination.
- **Enregistrement immédiat** des fiches : pas de bouton « Enregistrer ».
  `ProductEditor` lit la fiche dans la base et écrit chaque frappe
  (`onChange` → `updateLibrary`) ; la fiche est créée dès « Nouvelle fiche ».
  Le référentiel n'est alimenté qu'à la **fermeture** (`closeProduct` dans
  `app/page.tsx`) — sa clé est le nom, l'alimenter à chaque frappe créerait
  une fiche par lettre — et une fiche fermée vide (`isBlankProduct`) est
  retirée. La version à l'ouverture sert à « Annuler mes modifications ».
  La fiche ouverte (`editing`) est tenue par la page pour survivre à un
  changement d'onglet.
- `lib/backup.ts` — rappel de sauvegarde JSON (pas de serveur : rappel dans
  l'app, à l'ouverture). `library.backup` est **propre au poste** : exclu de
  l'export, conservé par `applyImport`. `updateLibrary` ouvre la période « non
  sauvegardé » (`markChanged`) à chaque changement de contenu
  (`contentChanged` : fiches, référentiel, réglages — pas le suivi lui-même) ;
  l'export complet la referme (`markExported`). Rappel si des modifications
  attendent depuis `intervalDays` (3 par défaut, réglable, 0 = jamais),
  repoussable de 24 h.
- `lib/library-store.ts` — store externe lu par `useSyncExternalStore`. La
  persistance se fait **à l'écriture**, pas dans un effet (la règle
  `react-hooks/set-state-in-effect` interdit le `setState` dans un effet) ;
  l'instantané serveur est vide et stable pour éviter tout écart d'hydratation.
- `app/page.tsx` — état d'UI (onglet, quantités du jour, statut) ; trois
  écrans : `PrintView` (mercuriale), `ProductsView`/`ProductEditor` (espace
  dédié à la modification des fiches), `SettingsView`. La date du jour et le
  mesureur ne sont créés que côté client (évite l'écart d'hydratation).

## Règles de travail

- Le PDF ne contient **ni traits de découpe ni fond** : le support est
  prédécoupé, toute encre hors zone est visible sur la planche.
- Toute modification des cotes ou du rendu se vérifie sur un PDF réellement
  généré (le mesurer / le regarder), pas seulement à la lecture du diff.
- `lib/barcode-decode.test.ts` est le garde-fou central : il reconstruit la
  trame de modules depuis les rectangles millimétrés d'une étiquette BVP
  complète puis **décode** le résultat avec les tables EAN normatives (dont
  les codes caisse réels 2000000271040…). L'étendre plutôt que le contourner.
  EAN-8/UPC-A sont relus ; Code 128 n'a pas encore ce filet.
- Les contrôles réglementaires (`productIssues`, débordement) aident mais ne
  valent pas validation qualité : ne pas les présenter comme un avis juridique.
- Les tests tournent en environnement node : pour du code qui touche au
  `localStorage`, stubber `window` (`vi.stubGlobal`) comme dans
  `lib/storage.test.ts`.
