// Actualisation UC : correspondance des colonnes Grist et composition du PDF.
// Aucun accès au DOM ni à Grist ici : tout part du record, ce qui permet de tester hors navigateur.
globalThis.FPCA = globalThis.FPCA || {};

(function () {
  const { PT, PX, texte, formatDate, coche, enTete, pied, bordures, nomSur } = globalThis.FPCA.pdf;

  // ════════════════════════════════════════════════════════════════
  // 📋 Correspondance : identifiant interne → identifiant de colonne Grist (sans le $)
  // ════════════════════════════════════════════════════════════════
  const COLUMN_MAP = {
    // ── Numéro de dossier ──
    dossier_number: "dossier_number",

    // ── Références ──
    ref_ds: "dossier_number",
    date_depot: "Ref_dossier_date_derniere_modification",

    // ── Informations dossier ──
    type_de_demande: "type_de_demande",
    organisme: "Orga",
    departement: "Dpt_code",
    annee_depot: "Ref_dossier_date_derniere_modification",
    site: "site_de_formation_concerne",
    diplome: "diplome_only",
    option: "intitule_diplome",
    supports: "support_de_la_formation_uc",
    date_debut: "debut_de_l_habilitation",
    date_fin: "fin_de_l_habilitation",
    voie: "quelle_est_la_voie_de_formation",
    duree_centre: "nombre_d_heures_en_centre_de_formation",
    duree_entreprise: "nombre_d_heures_en_entreprise",
    cycle: "periode_cycle_fr",

    // ── UCARE — texte multiligne issu de lookupRecords ──
    ucare_intitules: "Ref_UCARE",

    // ── Décision ──
    decision: "decision",
    observations: "Observations",

    // ── Grille d'analyse — pièces déposées ──
    doc4: "doc4",
    doc5: "Tableau_qualification_horaire",
    partenariats: "Partenariats",
    cv_formateurs: "Diplomes_et_CV",
    attestations: "Nouvelles_attestations",
    acte_ca: "Actes_CA",
    protocole: "Protocole_eval",
    ruban: "Ruban_pedago",
    calendrier: "Calendrier_alternance",

    // ── Grille d'analyse — conformité ──
    conf_doc4: "Conformite_doc4",
    conf_doc5: "Conformite_tableau_qualif_horaire",
    conf_partenariats: "Conformite_partenariat",
    conf_cv: "Conformite_diplomes_et_CV",
    conf_attestations: "Conformite_nouvelles_attestations",
    conf_ca: "Conformite_actes_CA",
    conf_protocole: "Conformite_protocole_eval",
    conf_ruban: "Conformite_ruban_peda",
    conf_calendrier: "Conformite_calendrier_alternance",

    // ── Grille d'analyse — remarques ──
    rem_doc4: "Remarque_doc4",
    rem_doc5: "Remarque_tableau_qualif_horaire",
    rem_partenariats: "Remarque_partenariat",
    rem_cv: "Remarque_diplomes_et_CV",
    rem_attestations: "Remarque_nouvelles_attestations",
    rem_ca: "Remarque_actes_CA",
    rem_protocole: "Remarque_protocole_eval",
    rem_ruban: "Remarque_ruban_peda",
    rem_calendrier: "Remarque_calendrier_alternance",
  };

  // ── Dossiers concernés par ce widget ──
  const FILTRES = [
    ["type_de_demande", "Actualisation"],
    ["quel_est_le_mode_d_evaluation", "Unités Capitalisables (UC)"],
  ];
  const estDossierValide = (r) => !!r && FILTRES.every(([col, v]) => r[col] === v);

  // ── Lignes de la grille d'analyse : [code, libellé, clé pièce] — conformité et remarque en découlent ──
  const GRILLE = [
    ["Doc.4", "Liste des UCARE (avec dossier de nouvelle(s) UCARE soumises à l'habilitation)", "doc4", "conf_doc4", "rem_doc4"],
    ["Doc.5", "Tableau relatif au taux de qualification des horaires formateurs", "doc5", "conf_doc5", "rem_doc5"],
    ["", "Partenariats", "partenariats", "conf_partenariats", "rem_partenariats"],
    ["", "Diplômes et CV des nouveaux formateurs", "cv_formateurs", "conf_cv", "rem_cv"],
    ["", "Nouvelles attestations formation agrément aux UC", "attestations", "conf_attestations", "rem_attestations"],
    ["Autres pièces", "Acte du conseil d'administration", "acte_ca", "conf_ca", "rem_ca"],
    ["", "Protocole d'évaluation (annexes 1, 2 et 3)", "protocole", "conf_protocole", "rem_protocole"],
    ["", "Ruban pédagogique", "ruban", "conf_ruban", "rem_ruban"],
    ["", "Calendrier d'alternance (app)", "calendrier", "conf_calendrier", "rem_calendrier"],
  ];

  // ── Lecture ──
  function lire(rec, champ) {
    const col = COLUMN_MAP[champ];
    return col && rec ? rec[col] : undefined;
  }

  // « … - N12- Intitulé » → « N12 – Intitulé »
  function ucareLignes(rec) {
    const brut = lire(rec, "ucare_intitules");
    if (typeof brut !== "string") return [];
    return brut.split("\n").map((s) => s.trim()).filter(Boolean).map((ligne) => {
      const m = ligne.match(/- (N[\d]*[A-Z]*-\s*.+)$/i);
      return m ? m[1].replace(/-\s*/, "– ") : ligne;
    });
  }

  function annee(v) {
    const d = globalThis.FPCA.pdf.dateDe(v);
    if (d && !isNaN(d)) return String(d.getFullYear());
    return v ? String(v).substring(0, 4) : "";
  }

  // dept-site-diplôme-actu-année.pdf
  function nomFichier(rec) {
    const t = (champ) => texte(lire(rec, champ)).trim();
    const parties = [
      t("departement"), t("site"), t("diplome"),
      lire(rec, "type_de_demande") === "Actualisation" ? "actu" : "",
      annee(lire(rec, "annee_depot")),
    ].filter(Boolean);
    return `${nomSur(parties.join("-")) || "dossier"}.pdf`;
  }

  // ════════════════════════════════════════════════════════════════
  // Composition du PDF
  // ════════════════════════════════════════════════════════════════
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

  // Encadré UCARE : 3 colonnes remplies ligne par ligne, comme la grille CSS de l'aperçu
  function ucare(rec) {
    const items = ucareLignes(rec).map((l) => ({ text: `• ${l}`, fontSize: 9.5 * PX }));
    const rangees = [];
    for (let i = 0; i < items.length; i += 3) {
      const r = items.slice(i, i + 3);
      while (r.length < 3) r.push({ text: "" });
      rangees.push(r);
    }
    const contenu = [{ text: "Intitulé(s) UCARE(s) habilitée(s)", italics: true, bold: true }];
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

  function grille(rec) {
    const entete = ["", "Pièces déposées", "Pièces déposées", "Conformité", "Remarques"]
      .map((t) => ({ text: t, bold: true, alignment: "center", fillColor: "#DDE4F0" }));
    const lignes = GRILLE.map(([code, libelle, piece, conf, rem]) => [
      { text: code, bold: true, italics: true, alignment: "center" },
      { text: libelle, italics: true },
      coche(!!lire(rec, piece)),
      coche(!!lire(rec, conf)),
      { text: texte(lire(rec, rem)) },
    ]);
    return [
      {
        table: { widths: ["*"], body: [[{ text: "Grille d'analyse du dossier de demande d'actualisation UC",
                                          bold: true, fontSize: 12 * PX, alignment: "center",
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

  function construireDocument(rec) {
    return {
      pageSize: "A4",
      pageOrientation: "portrait",
      pageMargins: [15 * PT, 15 * PT, 15 * PT, 15 * PT],
      defaultStyle: { font: "Marianne", fontSize: T, lineHeight: 1.2, color: "#111111" },
      footer: pied("DRAAF-SRFD Occitanie / unité FPCA-VAE", "Notification d'actualisation d'habilitation UC"),
      content: [
        // Page 1 — notification
        enTete(ENTETE),
        references(rec),
        titre("Notification de décision d'actualisation d'habilitation UC"),
        informations(rec),
        ucare(rec),
        decision(rec),
        // Page 2 — grille d'analyse
        { ...enTete(ENTETE), pageBreak: "before", margin: [0, 0, 0, 10 * PX] },
        ...grille(rec),
      ],
      info: {
        title: `Notification d'actualisation d'habilitation UC — ${texte(lire(rec, "dossier_number"))}`,
        author: "DRAAF Occitanie — SRFD",
        creator: "grist-widget-UC-FPCA",
      },
    };
  }

  // Champs modifiables dans le widget (enregistrés dans Grist) : la grille, la décision et les observations
  const EDITABLES = [
    ...GRILLE.flatMap(([, , piece, conf, rem]) => [piece, conf, rem]),
    "decision", "observations",
  ];

  globalThis.FPCA.actuUC = { COLUMN_MAP, FILTRES, GRILLE, EDITABLES, estDossierValide, lire, ucareLignes, nomFichier,
                             construireDocument };
})();
