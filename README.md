# Étiquettes BVP

Générateur d'étiquettes réglementaires pour le rayon boulangerie-viennoiserie-
pâtisserie, en remplacement d'une balance étiqueteuse. On tient des **fiches
produits** (dénomination, ingrédients et allergènes, valeurs nutritionnelles,
code-barres créé par la caisse, prix, durée de vie), puis chaque jour on
choisit le nombre d'étiquettes par produit : l'app génère un **PDF A4** sur
planches **Agipa 118987** (8 étiquettes de 99,1 × 67,7 mm par feuille), à
imprimer tel quel.

- Aucune base de données, aucun compte, aucun appel réseau : tout est calculé
  dans le navigateur. Les fiches vivent dans le `localStorage`.
- **Sauvegarde JSON** : export complet (fiches, référentiel, magasin) à
  réimporter sur le même poste ou sur un autre ; export du **référentiel seul**
  (compositions sans code caisse ni prix) pour partager des fiches entre
  magasins.
- **Rappel de sauvegarde** : quand des modifications attendent depuis plus de
  3 jours (réglable) sans export complet, un bandeau le rappelle à
  l'ouverture de l'app, avec « Sauvegarder maintenant » et « Me le rappeler
  demain ». Suivi propre à chaque poste.
- Code-barres **vectoriel** (EAN-13 de la caisse), net à toutes les
  résolutions.

## Ce que l'étiquette contient

En-tête : logo du magasin et dénomination de vente. Corps : ingrédients (un
paragraphe par composant d'assortiment), allergènes **en gras**, traces
éventuelles, origine, valeurs nutritionnelles pour 100 g, mentions
(« Produit décongelé, ne pas recongeler », conservation, « Cuit et emballé le
même jour »). Pied : code-barres, date d'emballage, DLC (« À consommer
jusqu'au ») ou DDM (« À consommer de préférence avant le ») calculée à partir
de la durée de vie du produit, nombre de pièces, référence fournisseur, poids
net (chiffres à la hauteur légale : 4 mm entre 200 g et 1 kg), prix au kilo
calculé depuis le poids net et le prix, prix de vente ;
nom et adresse du magasin.

Un interrupteur **Paysage / Portrait** (onglet Impression, mémorisé) choisit
le sens de lecture : en portrait, le contenu de chaque étiquette est tourné
d'un quart de tour sur la même planche.

**Garde-fous :**

- Rien n'est jamais tronqué ni imprimé sous la hauteur d'x minimale légale
  (1,2 mm, ou 0,9 mm pour un emballage de moins de 80 cm², règlement INCO
  art. 13). Une fiche trop longue est refusée à l'impression, avec le
  dépassement en mm.
- Les allergènes s'écrivent en MAJUSCULES dans la liste des ingrédients : ils
  sont imprimés en gras. L'app repère les allergènes probables laissés en
  minuscules et propose de les corriger.
- Une fiche incomplète (code-barres invalide, prix, ingrédients, adresse du
  magasin…) bloque l'impression.

Ces contrôles aident, ils ne remplacent pas la validation des fiches par le
responsable qualité.

## Utilisation quotidienne

1. **Réglages** (une fois) : enseigne, adresse complète, logo ; imprimer la
   planche de calibration et régler le décalage si besoin.
2. **Fiches produits** : créer les fiches à partir des cartons fournisseurs.
   En tapant la dénomination, les fiches du référentiel sont proposées et
   leur composition peut être reprise. Coller le code-barres créé en caisse.
   Tout est enregistré à chaque frappe (pas de bouton « Enregistrer ») ;
   « Annuler mes modifications » revient à la fiche telle qu'à l'ouverture.
3. **Impression du jour** : saisir le nombre d'étiquettes de chaque produit
   actif. L'app indique combien de feuilles mettre dans l'imprimante, puis
   télécharge le PDF.
4. Imprimer **à 100 %** : dans la boîte de dialogue d'impression, choisir
   « Taille réelle » / « 100 % » et **désactiver** « Ajuster à la page ».

## Développement

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # suite de tests (Vitest)
npm run lint
npm run typecheck
npm run build      # export statique dans out/
```

## Déploiement

Export statique (`output: "export"`) : Vercel détecte Next.js et sert `out/`
sans configuration, aucun runtime serveur n'est requis.

⚠️ Les cotes de la planche Agipa 118987 sont provisoires tant que le gabarit du
fabricant n'a pas été relevé : voir `docs/agipa-118987-gabarit.md`.
