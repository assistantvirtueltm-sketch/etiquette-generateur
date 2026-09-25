# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Webapp d'impression d'étiquettes codes-barres : l'utilisateur saisit un code
(EAN-13 par défaut) + un libellé produit, l'app génère à la volée un PDF A4
imprimable d'une **planche mono-produit** (65 étiquettes identiques) sur support
Apli/Agipa réf. 118990, puis le télécharge. Voir `README.md` pour l'usage.

Contraintes de cadrage (décidées, ne pas les réintroduire en question) :
- **Aucune base de données, aucune authentification, aucune API route.** Tout est
  client-side ; `next.config.ts` force `output: "export"` pour qu'aucun runtime
  serveur ne soit requis (déploiement Vercel zéro config).
- La bibliothèque de produits vit **uniquement dans le `localStorage`**.
- PDF construit dans le navigateur, **codes-barres vectoriels** : ni image, ni
  canvas rastérisé (des barres floues cassent la lecture en caisse).

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

Vérification dans un vrai navigateur (aucune dépendance de test E2E n'est
installée) : `npm run build`, servir `out/` (`python3 -m http.server`), puis
piloter Chromium avec `npm install --no-save playwright` et
`chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })`.

## Architecture

Pipeline, du champ de saisie au PDF — chaque étage est un module pur et testé :

```
saisie ──▶ symbology.ts       validation / détection du type / clé de contrôle
       ──▶ barcode-modules.ts bwip-js raw() → largeurs de barres en modules
       ──▶ label-render.ts    primitives de dessin en mm (rects + textes)
       ──┬▶ pdf.ts            pdf-lib → planche A4 (rectangles vectoriels)
         └▶ LabelPreview.tsx  même contenu en SVG → l'aperçu = l'impression
```

- `lib/label-layout.ts` — **source unique des cotes**. Aucune position ne doit
  être écrite en dur ailleurs. Une planche est décrite par son **pas** (cote du
  massicot), pas par sa gouttière, et la matrice est **centrée** sur la page :
  les marges sont donc calculées (`sheetMarginsMm`), pas saisies. Pour la
  118990 : étiquette 38 × 21,2 mm, pas 38 × 21,2 mm (**étiquettes jointives,
  aucune gouttière**), matrice 190 × 275,6 mm, marges calculées 10,0 / 10,7 mm.
  Les cotes viennent du gabarit du fabricant, relevé dans
  `docs/apli-118990-gabarit.md` — la seule source autoritaire ; ne pas les
  déduire d'un autre support au même format (la matrice Avery L7651 a le même
  38 × 21,2 mm mais un pas de 40,6 mm, ce qui fait déborder les colonnes
  extérieures de 5 mm).
- Planche entamée et calibration : `labelSlot(spec, index, offset)` est le seul
  point qui place une étiquette. L'index de départ (première étiquette libre)
  et le décalage imprimante X/Y (réglé via la planche de calibration, persisté
  dans les réglages de `lib/storage.ts`) passent par lui ; ne pas les appliquer
  ailleurs.
- Ajouter un format de planche = ajouter une `SheetSpec` à `SHEET_SPECS`
  (cotes relevées sur le gabarit du fabricant, plus un `purchase` — lien
  marchand https + référence vendue). `components/SheetSpecCard.tsx` en dérive
  la fiche du support et le bouton d'achat, sans code par format ; les tests
  `catalogue des planches` s'appliquent automatiquement au nouveau format.
  Tant que l'UI ne propose qu'un format, `app/page.tsx` fixe `SPEC`.
- `lib/barcode-modules.ts` — n'utilise **que** `bwipjs.raw()` (sous-chemin
  `bwip-js/browser`) : `sbs` est la suite des largeurs en modules commençant par
  une barre. On ne charge aucune police bwip-js et on ne rastérise rien.
- `lib/label-render.ts` — décide de la X-dimension : nominale (0,33 mm) si elle
  rentre, sinon réduite pour que le code **et ses zones de silence** tiennent
  dans la largeur utile ; expose le grossissement et avertit sous 0,25 mm.
  Mesure les textes via une fonction injectée (`MeasureText`) pour rester pur.
- `lib/pdf.ts` — fournit ce mesureur depuis les métriques Helvetica de pdf-lib,
  **partagé avec l'aperçu** : l'écran et le papier ont la même mise en page au
  dixième de mm. Assainit aussi les libellés (polices standard = WinAnsi
  uniquement, sinon `drawText` échoue) et produit la planche de calibration.
- `lib/storage.ts` — seul accès au `localStorage`, schéma versionné, `migrate()`
  ne lève jamais et écarte les entrées illisibles au lieu de tout effacer.
- `lib/library-store.ts` — store externe lu par `useSyncExternalStore`. La
  persistance se fait **à l'écriture**, pas dans un effet (la règle
  `react-hooks/set-state-in-effect` interdit le `setState` dans un effet) ;
  l'instantané serveur est vide et stable pour éviter tout écart d'hydratation.
- `app/page.tsx` — seul détenteur de l'état d'UI (brouillon, sélection, statut).
  Tout ce qui touche `localStorage`, pdf-lib ou bwip-js est dans des composants
  `"use client"`.

## Règles de travail

- Le PDF ne contient **ni traits de découpe ni fond** : le support est
  prédécoupé, toute encre hors zone est visible sur la planche.
- Toute modification des cotes ou du rendu se vérifie sur un PDF réellement
  généré (le mesurer), pas seulement à la lecture du diff.
- Les cotes de planche sont figées par deux tests de `lib/label-layout.test.ts` :
  `retrouve les cotes du gabarit du fabricant` et `colle aux bornes en twips du
  gabarit`, qui comparent les emplacements calculés aux valeurs brutes du
  gabarit Word. Les mettre à jour demande de relire le gabarit, pas d'ajuster la
  valeur attendue.
- `lib/barcode-decode.test.ts` est le garde-fou central : il reconstruit la
  trame de modules depuis les rectangles millimétrés puis **décode** le résultat
  avec les tables EAN normatives. Un changement de mise en page qui casse la
  lisibilité du code y échoue. L'étendre plutôt que le contourner. Il ne
  relit aujourd'hui que l'EAN-13 : EAN-8, UPC-A et Code 128 (aussi acceptés
  par `symbology.ts`) n'ont pas encore ce filet.
- Les tests tournent en environnement node : pour du code qui touche au
  `localStorage`, stubber `window` (`vi.stubGlobal`) comme dans
  `lib/storage.test.ts`.
