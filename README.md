# Widgets Grist FPCA — DRAAF Occitanie

Widgets personnalisés Grist qui génèrent les notifications officielles de l'unité FPCA-VAE (SRFD, DRAAF Occitanie) en **PDF vectoriel** (pdfmake + police Marianne).

| Widget | URL à coller dans Grist (« Widget personnalisé » → « URL ») |
|---|---|
| Tous types (UC + CCF) | `https://jlllyfish.github.io/grist-widget-UC-FPCA/notification/?v=0.5.4` |
| Actualisation UC seule | `https://jlllyfish.github.io/grist-widget-UC-FPCA/notification/?profil=uc&v=0.5.0` |
| Actualisation CCF seule | `https://jlllyfish.github.io/grist-widget-UC-FPCA/notification/?profil=ccf&v=0.5.0` |

L'ancienne adresse `…/actu_uc/` redirige vers `…/notification/?profil=uc`.

Accès du widget à régler sur **« Accès complet »**.

## Organisation

```
notification/
  index.html   page du widget (formulaire + aperçu du PDF) — porte le numéro de version
  profils.js   colonnes Grist (COLUMN_MAP) et profils de document : UC, CCF… (grille, titres, liste habilitée)
  document.js  composition du PDF pour un dossier et son profil
  app.js       navigation, filtres, saisie enregistrée dans Grist, aperçu PDF, téléchargements
actu_uc/       redirection de l'ancienne adresse
commun/
  grist.js     lecture de toute la table liée (sans les filtres de la vue), métadonnées des colonnes, écriture
  pdf.js       socle pdfmake : polices, en-tête, pied de page, coche vectorielle, formats
  logo.js      logo du ministère (SVG), partagé par l'aperçu et le PDF
vendor/        bibliothèques embarquées (voir vendor/README.md)
```

## Ajouter un type de dossier

Dans `notification/profils.js` : ajouter les colonnes manquantes à `COLUMN_MAP`, puis un objet dans `PROFILS` (critères, titres, liste habilitée, lignes de grille, suffixe du nom de fichier). Le widget signale au démarrage les colonnes introuvables dans la table.

## Publier une nouvelle version

1. Changer la version dans `notification/index.html` : la balise `<meta name="fpca-version">` **et** tous les `?v=` de la page.
2. Pousser sur `main` : GitHub Pages publie en une à deux minutes.
3. Dans Grist, mettre à jour le `?v=` de l'URL du widget pour forcer le rechargement.

La version s'affiche en bas à droite du widget et dans la console du navigateur.

## Historique

- **0.5.4** — Liste des modules CCF sur 1 colonne par défaut (UCARE UC : 3 colonnes par défaut). Défaut réglable par profil (`colonnesParDefaut`).
- **0.5.3** — Choix de 1, 2 ou 3 colonnes (3 par défaut) pour la liste UCARE / modules dans le PDF, dossier par dossier. Enregistré dans la colonne Grist facultative `Colonnes_liste` (Numérique) si elle existe, sinon dans le navigateur.
- **0.5.2** — Filtre « Toutes notifications / À traiter / Complétées » (complétée = décision renseignée), ✓ devant les dossiers complétés dans la liste, badge d'état dans le formulaire. Un dossier qui sort des filtres après une saisie reste affiché jusqu'au changement de dossier.
- **0.5.1** — Formulaire et aperçu à 50 / 50 par défaut, séparateur déplaçable à la souris (ou aux flèches du clavier), largeur mémorisée ; double-clic pour revenir à 50 / 50.
- **0.5.0** — Widget unique pour tous les types de dossiers, organisé en profils : Actualisation UC et Actualisation CCF (grille CCF à 6 pièces, dont « Adaptation des horaires », liste des modules modifiable). Le profil est choisi automatiquement selon le dossier ; filtre « Type » ; paramètre `?profil=` pour restreindre. Pied de page et titres CCF corrigés. Colonnes introuvables signalées.
- **0.4.1** — Recherche sans résultat expliquée : « dossier d'habilitation » (Habilitation complète), « dossier évaluation CCF » (Contrôle en Cours de Formation), autre type hors périmètre, dossier masqué par les filtres, ou « Aucun dossier ne correspond ».
- **0.4.0** — Saisie directe dans le widget, enregistrée automatiquement dans Grist : grille d'analyse (bascules « Pièce déposée » / « Conforme » et remarques), décision (choix de la colonne Grist) et observations. L'aperçu affiche désormais le vrai PDF, régénéré après chaque modification (copie HTML de la page A4 supprimée). Les colonnes formule, absentes ou de mauvais type sont signalées et non modifiables. Date de signature : date du jour. En section étroite, saisie et aperçu passent en onglets.
- **0.3.0** — Barre de navigation au style DSFR (composants du Système de design de l'État, embarqués). Filtres croisés par département, organisme et diplôme : chaque menu n'affiche que les valeurs compatibles avec les autres filtres, avec le nombre de dossiers. Recherche et filtres mémorisés d'une ouverture à l'autre ; bouton « Réinitialiser ».
- **0.2.0** — Navigation dans le widget : flèches ◀ ▶, liste déroulante, recherche (n°, organisme, site, diplôme, département). Le widget lit toute la table, sans subir les filtres de la vue. Option « Suivre Grist » pour synchroniser la sélection dans les deux sens. Le ZIP porte sur les dossiers affichés par la recherche.
- **0.1.1** — Logo du ministère en SVG vectoriel (aperçu et PDF) : le PDF ne contient plus aucune image matricielle (≈ 75 Ko).
- **0.1.0** — PDF vectoriel (pdfmake) à la place de html2canvas + jsPDF ; lot téléchargé en un seul ZIP ; bibliothèques hébergées dans le dépôt ; correction de la sélection d'une ligne hors périmètre ou filtrée (le widget n'affiche plus silencieusement un autre dossier).
