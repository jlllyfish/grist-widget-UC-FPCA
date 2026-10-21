// Notifications FPCA : composition du PDF (pdfmake) pour un dossier et son profil.
globalThis.FPCA = globalThis.FPCA || {};

(function () {
  const { PT, PX, texte, formatDate, coche, enTete, pied, bordures } = globalThis.FPCA.pdf;
  const { lire, listeLignes } = globalThis.FPCA.notif;

  const T = 11 * PX;          // taille de texte courante (11 px de l'aperçu)
  const BLEU = "#1A3A6B";
  const FOND_LIBELLE = "#F7F8FC";

  const ENTETE = [{ text: "DRAAF Occitanie", bold: true },
                  "Service Régional de la Formation et du Développement", "Unité FPCA-VAE"];

  function references(rec) {
    const ligne = (libelle, valeur) => ({
      text: [{ text: `${libelle} `, italics: true }, { text: valeur, bold: true, color: BLEU }],
      lineHeight: 1.5,
    });
    return {
      stack: [
        ligne("Référence dossier Démarche Numérique :", texte(lire(rec, "ref_ds"))),
        ligne("Date de dépôt du dossier complet :", formatDate(lire(rec, "date_depot"))),
      ],
      margin: [0, 8 * PX, 0, 8 * PX],
    };
  }

  function titre(libelle) {
    return {
      table: { widths: ["*"], body: [[{ text: libelle.toUpperCase(), bold: true, alignment: "center",
                                        fontSize: 13 * PX, characterSpacing: 0.4, fillColor: "#F0F4FF" }]] },
      layout: bordures(2 * PX, 6 * PX, 6 * PX),
      margin: [0, 10 * PX, 0, 12 * PX],
    };
  }

  function informations(rec) {
    const lignes = [
      ["Organisme de formation", texte(lire(rec, "organisme"))],
      ["Site de formation", texte(lire(rec, "site"))],
      ["Diplôme", texte(lire(rec, "diplome"))],
      ["Option / spécialité", texte(lire(rec, "option"))],
      ["Support(s)", texte(lire(rec, "supports"))],
      ["Date de début d'habilitation", formatDate(lire(rec, "date_debut"))],
      ["Date de fin d'habilitation", formatDate(lire(rec, "date_fin"))],
      ["Voie de formation (APP ou FPC)", texte(lire(rec, "voie"))],
      ["Durée de formation centre (h)", texte(lire(rec, "duree_centre"))],
      ["Durée de formation entreprise (h)", texte(lire(rec, "duree_entreprise"))],
      ["Cycle de formation", texte(lire(rec, "cycle"))],
    ];
    return {
      table: {
        widths: [52 * PT, "*"],
        body: lignes.map(([l, v]) => [
          { text: l, italics: true, fillColor: FOND_LIBELLE },
          { text: v, bold: true, color: BLEU },
        ]),
      },
      layout: bordures(),
      margin: [0, 0, 0, 8 * PX],
    };
  }

  // Encadré UCARE / modules : 3 colonnes remplies ligne par ligne
  function liste(rec, profil) {
    const items = listeLignes(rec, profil).map((l) => ({ text: `• ${l}`, fontSize: 9.5 * PX }));
    const rangees = [];
    for (let i = 0; i < items.length; i += 3) {
      const r = items.slice(i, i + 3);
      while (r.length < 3) r.push({ text: "" });
      rangees.push(r);
    }
    const contenu = [{ text: profil.liste.libelle, italics: true, bold: true }];
    if (rangees.length) {
      contenu.push({
        table: { widths: ["*", "*", "*"], body: rangees },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 8 * PX,
                  paddingTop: () => 1, paddingBottom: () => 1 },
        margin: [0, 4 * PX, 0, 0],
      });
    }
    return {
      table: { widths: ["*"], body: [[{ stack: contenu }]] },
      layout: bordures(1 * PX, 7 * PX, 5 * PX),
      margin: [0, 0, 0, 8 * PX],
    };
  }

  function decision(rec) {
    const libelle = (t) => ({ text: t.toUpperCase(), bold: true, fillColor: FOND_LIBELLE });
    // Date de signature : toujours la date du jour de génération du PDF
    const dateSignature = new Date().toLocaleDateString("fr-FR");
    return {
      table: {
        widths: [42 * PT, "*"],
        body: [
          [libelle("Décision"), { text: texte(lire(rec, "decision")), bold: true }],
          [libelle("Observations"), { text: texte(lire(rec, "observations")) }],
          [libelle("Date et signature"), {
            fontSize: 10 * PX, lineHeight: 1.4, margin: [0, 0, 0, 15 * PT],
            text: [
              "Le délégué académique, Chef du Service Régional de la Formation et du Développement\n",
              { text: "Paul CANDAELE\n", italics: true },
              { text: `le : ${dateSignature}`, bold: true },
            ],
          }],
        ],
      },
      layout: bordures(),
    };
  }

  function grille(rec, profil) {
    const entete = ["", "Pièces déposées", "Pièces déposées", "Conformité", "Remarques"]
      .map((t) => ({ text: t, bold: true, alignment: "center", fillColor: "#DDE4F0" }));
    const lignes = profil.grille.map((l) => [
      { text: l.code, bold: true, italics: true, alignment: "center" },
      { text: l.libelle, italics: true },
      coche(!!lire(rec, l.piece)),
      coche(!!lire(rec, l.conf)),
      { text: texte(lire(rec, l.rem)) },
    ]);
    return [
      {
        table: { widths: ["*"], body: [[{ text: profil.titreGrille, bold: true, fontSize: 12 * PX, alignment: "center",
                                          color: "#FFFFFF", fillColor: BLEU }]] },
        layout: bordures(1 * PX, 5 * PX, 5 * PX),
        margin: [0, 10 * PX, 0, 0],
      },
      {
        table: { headerRows: 1, dontBreakRows: true, widths: [18 * PT, "*", 20 * PT, 20 * PT, "*"],
                 body: [entete, ...lignes] },
        layout: bordures(),
      },
    ];
  }

  function construireDocument(rec, profil) {
    return {
      pageSize: "A4",
      pageOrientation: "portrait",
      pageMargins: [15 * PT, 15 * PT, 15 * PT, 15 * PT],
      defaultStyle: { font: "Marianne", fontSize: T, lineHeight: 1.2, color: "#111111" },
      footer: pied("DRAAF-SRFD Occitanie / unité FPCA-VAE", profil.pied),
      content: [
        // Page 1 — notification
        enTete(ENTETE),
        references(rec),
        titre(profil.titre),
        informations(rec),
        liste(rec, profil),
        decision(rec),
        // Page 2 — grille d'analyse
        { ...enTete(ENTETE), pageBreak: "before", margin: [0, 0, 0, 10 * PX] },
        ...grille(rec, profil),
      ],
      info: {
        title: `${profil.pied} — ${texte(lire(rec, "dossier_number"))}`,
        author: "DRAAF Occitanie — SRFD",
        creator: "grist-widget-UC-FPCA",
      },
    };
  }

  globalThis.FPCA.notif.construireDocument = construireDocument;
})();
