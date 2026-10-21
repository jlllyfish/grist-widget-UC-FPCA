# Widgets Grist FPCA — DRAAF Occitanie

Widgets personnalisés Grist qui génèrent les notifications officielles de l'unité FPCA-VAE (SRFD, DRAAF Occitanie) en **PDF vectoriel** (pdfmake + police Marianne).

| Widget | URL à coller dans Grist (« Widget personnalisé » → « URL ») |
|---|---|
| Actualisation UC | `https://jlllyfish.github.io/grist-widget-UC-FPCA/actu_uc/?v=0.2.0` |

Accès du widget à régler sur **« Accès complet »**.

## Organisation

```
actu_uc/
  index.html   page du widget (aperçu A4) — porte le numéro de version
  document.js  correspondance des colonnes Grist (COLUMN_MAP) et composition du PDF
  app.js       liaison avec Grist, aperçu, téléchargements
commun/
  grist.js     lecture de toute la table liée (sans les filtres de la vue)
  pdf.js       socle pdfmake : polices, en-tête, pied de page, coche vectorielle, formats
  logo.js      logo du ministère (SVG), partagé par l'aperçu et le PDF
vendor/        bibliothèques embarquées (voir vendor/README.md)
```

## Publier une nouvelle version

1. Changer la version dans `actu_uc/index.html` : la balise `<meta name="fpca-version">` **et** tous les `?v=` de la page.
2. Pousser sur `main` : GitHub Pages publie en une à deux minutes.
3. Dans Grist, mettre à jour le `?v=` de l'URL du widget pour forcer le rechargement.

La version s'affiche en bas à droite du widget et dans la console du navigateur.

## Historique

- **0.2.0** — Navigation dans le widget : flèches ◀ ▶, liste déroulante, recherche (n°, organisme, site, diplôme, département). Le widget lit toute la table, sans subir les filtres de la vue. Option « Suivre Grist » pour synchroniser la sélection dans les deux sens. Le ZIP porte sur les dossiers affichés par la recherche.
- **0.1.1** — Logo du ministère en SVG vectoriel (aperçu et PDF) : le PDF ne contient plus aucune image matricielle (≈ 75 Ko).
- **0.1.0** — PDF vectoriel (pdfmake) à la place de html2canvas + jsPDF ; lot téléchargé en un seul ZIP ; bibliothèques hébergées dans le dépôt ; correction de la sélection d'une ligne hors périmètre ou filtrée (le widget n'affiche plus silencieusement un autre dossier).
