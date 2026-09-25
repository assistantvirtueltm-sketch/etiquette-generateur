# Agipa 118987 — cotes de la planche

**Statut : PROVISOIRE.** Le gabarit Word du fabricant n'a pas encore été relevé
(le site d'Apli n'était pas accessible depuis l'environnement de développement).
Les cotes de `AGIPA_118987` (`lib/label-layout.ts`) sont celles de la matrice
standard du format 99,1 × 67,7 mm, 8 étiquettes par A4 :

| Propriété | Valeur |
| --- | --- |
| Étiquette | 99,1 × 67,7 mm, coins arrondis |
| Disposition | 2 colonnes × 4 lignes |
| Pas horizontal | 101,6 mm (gouttière de 2,5 mm entre les colonnes) |
| Pas vertical | 67,7 mm (lignes jointives) |
| Matrice | 200,7 × 270,8 mm, centrée |
| Marges calculées | 4,65 mm à gauche, 13,1 mm en haut |

## À faire pour figer les cotes

1. Télécharger le gabarit Word de la réf. 118987 sur le site d'Apli
   (rubrique « gabarits d'étiquettes imprimables ») et le déposer dans `docs/`.
2. Relever la largeur des colonnes, la hauteur des lignes et les marges
   (en twips : 1 mm = 56,6929 twips).
3. Corriger `AGIPA_118987` si besoin, puis ajouter à
   `lib/label-layout.test.ts` un test qui compare les emplacements calculés
   aux valeurs brutes du gabarit.

En attendant, la planche de calibration (onglet « Réglages ») permet de
contrôler l'alignement sur une vraie feuille avant d'imprimer : l'imprimer à
100 % sur papier ordinaire et la superposer à une feuille d'étiquettes.

Le contenu de l'étiquette garde une marge intérieure de 2,5 × 2,2 mm : un écart
de pas d'un ou deux dixièmes de millimètre reste donc sans conséquence.
