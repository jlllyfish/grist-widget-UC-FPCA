# Bibliothèques embarquées

Le widget a l'accès complet aux documents Grist : tout le code qu'il exécute est servi depuis ce dépôt, en versions figées, plutôt que depuis des CDN tiers. Seul `grist-plugin-api.js` est chargé depuis `docs.getgrist.com` (code de Grist lui-même).

| Fichier | Contenu | Version | Licence |
|---|---|---|---|
| `pdfmake.min.js` | pdfmake (génération PDF vectorielle) | 0.2.20 | MIT |
| `jszip.min.js` | JSZip (archive des PDF en lot) | 3.10.1 | MIT ou GPLv3 |
| `marianne.js` | Police Marianne (4 graisses TTF) encodée pour pdfmake | — | Réservée aux services de l'État |
| `fonts/` | Marianne woff2 pour l'aperçu HTML (DSFR) | 1.13.1 | Réservée aux services de l'État |

Fichiers repris du dépôt [jlllyfish/pdf_pony](https://github.com/jlllyfish/pdf_pony) (commit `8904b3f`). Les textes de licence sont dans `licences/`.

**Attention :** la police Marianne ne contient ni ✓ ni ☐. Le PDF dessine donc les coches en vectoriel (`FPCA.pdf.coche`).
