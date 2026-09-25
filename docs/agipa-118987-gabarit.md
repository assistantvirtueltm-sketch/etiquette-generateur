# Gabarit Agipa 118987 — cotes relevées

Source autoritaire des cotes de la planche : `agipa-118987-gabarit.doc`, le
gabarit Word fourni par le fabricant (Word 2000, tableau de 4 lignes ×
3 colonnes : étiquette, gouttière, étiquette). Les valeurs ci-dessous ont été
extraites des structures binaires du document (1 mm = 1440/25,4 = 56,6929
twips) :

| Propriété | Valeur relevée | En mm |
| --- | --- | --- |
| `sprmSXaPage` (largeur page) | 11934 twips | 210,50 |
| `sprmSYaPage` (hauteur page) | 16866 twips | 297,50 |
| `sprmSDxaLeft` (marge gauche) | 264 twips | 4,66 |
| `sprmSDyaTop` (marge haute) | 743 twips | 13,11 |
| `sprmTDefTable` (bornes de cellules) | −8, 5592, 5752, 11370 twips | −0,14 … 200,55 |
| `sprmTDyaRowHeight` (hauteur exacte) | −3838 twips | 67,70 |
| `sprmTDxaGapHalf` (retrait de texte) | 70 twips | 1,23 |

Conclusions retenues dans `lib/label-layout.ts` (`AGIPA_118987`) :

- Étiquette 99,1 × 67,7 mm, 2 colonnes × 4 lignes, **lignes jointives**.
- Pas horizontal : de la 1re cellule « étiquette » (−8) à la seconde (5752),
  soit 5760 twips = **101,6 mm** ; la gouttière entre colonnes vaut donc
  2,5 mm.
- La matrice (200,7 × 270,8 mm) est **centrée** sur la feuille : le centrage
  sur une A4 réelle redonne 4,65 mm à gauche et 13,10 mm en haut, soit les
  marges du gabarit (4,66 / 13,11 mm) à 0,01 mm près.
- Comme pour les autres gabarits Apli, la table est décalée de −8 twips
  (0,14 mm) : compensation de bordure propre au rendu des tableaux Word, pas
  une cote du massicot. Le test `colle aux bornes en twips du gabarit`
  (`lib/label-layout.test.ts`) la tolère explicitement.
- Le gabarit décrit une page de 210,5 × 297,5 mm ; cet écart d'un
  demi-millimètre est un arrondi de l'outil d'origine. Le PDF reste en A4
  exacte.

Validation terrain : planche imprimée et posée sur le support en magasin,
alignement conforme.

## Relire le gabarit

LibreOffice refuse ce type de fichier ; les cotes se relisent directement dans
les flux OLE (`pip install olefile`) en cherchant les opcodes sprm ci-dessus
dans le flux `WordDocument` — les valeurs sont des entiers signés 16 bits qui
suivent l'opcode sur 2 octets (pour `sprmTDefTable` : 2 octets de taille,
1 octet de nombre de cellules, puis les bornes).
