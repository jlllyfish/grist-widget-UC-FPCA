// Notifications FPCA : colonnes Grist et profils de document (un profil par type de dossier).
// Aucun accès au DOM ni à Grist ici : tout part du record, ce qui permet de tester hors navigateur.
// Pour ajouter un type de dossier (ex. habilitation complète) : compléter COLUMN_MAP si besoin, puis ajouter un profil.
globalThis.FPCA = globalThis.FPCA || {};

(function () {
  const { texte, nomSur } = globalThis.FPCA.pdf;

  // ════════════════════════════════════════════════════════════════
  // 📋 Correspondance : identifiant interne → identifiant de colonne Grist (sans le $)
  //    Une seule table pour tous les profils.
  // ════════════════════════════════════════════════════════════════
  const COLUMN_MAP = {
    // ── Références ──
    dossier_number: "dossier_number",
    ref_ds: "dossier_number",
    date_depot: "Ref_dossier_date_derniere_modification",
    annee_depot: "Ref_dossier_date_derniere_modification",

    // ── Type de dossier (choix du profil) ──
    type_de_demande: "type_de_demande",
    mode_evaluation: "quel_est_le_mode_d_evaluation",

    // ── Informations dossier ──
    organisme: "Orga",
    departement: "Dpt_code",
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

    // ── Listes habilitées ──
    ucare_intitules: "Ref_UCARE",              // UC : texte multiligne issu de lookupRecords
    modules_ccf: "Intitules_modules_CCF",      // CCF : un module par ligne

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
    adaptation: "Adaptation_horaires",

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
    conf_adaptation: "Conformite_adaptation_horaires",

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
    rem_adaptation: "Adaptation_horaires_remarque",
  };

  function lire(rec, champ) {
    const col = COLUMN_MAP[champ];
    return col && rec ? rec[col] : undefined;
  }
  const simplifier = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

  // Ligne de grille : code (colonne de gauche), libellé, puis les clés pièce / conformité / remarque
  const ligne = (code, libelle, piece, conf, rem) => ({ code, libelle, piece, conf, rem });

  // Listes habilitées : texte multiligne ou liste Grist → une entrée par ligne
  function lignesDe(v) {
    if (Array.isArray(v)) return v.filter((x) => x !== "L").map(texte).map((s) => s.trim()).filter(Boolean);
    return typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : [];
  }
  // UC : « BPREA - N12- Intitulé » → « N12 – Intitulé »
  const formatUcare = (l) => {
    const m = l.match(/- (N[\d]*[A-Z]*-\s*.+)$/i);
    return m ? m[1].replace(/-\s*/, "– ") : l;
  };

  // ════════════════════════════════════════════════════════════════
  // Profils
  // ════════════════════════════════════════════════════════════════
  const PROFILS = [
    {
      id: "uc",
      nom: "Actualisation UC",
      criteres: [["type_de_demande", "Actualisation"], ["mode_evaluation", "Unités Capitalisables (UC)"]],
      titre: "Notification de décision d'actualisation d'habilitation UC",
      titreGrille: "Grille d'analyse du dossier de demande d'actualisation UC",
      pied: "Notification d'actualisation d'habilitation UC",
      liste: { champ: "ucare_intitules", libelle: "Intitulé(s) UCARE(s) habilitée(s)", format: formatUcare, editable: false },
      suffixeFichier: "actu",
      grille: [
        ligne("Doc.4", "Liste des UCARE (avec dossier de nouvelle(s) UCARE soumises à l'habilitation)", "doc4", "conf_doc4", "rem_doc4"),
        ligne("Doc.5", "Tableau relatif au taux de qualification des horaires formateurs", "doc5", "conf_doc5", "rem_doc5"),
        ligne("", "Partenariats", "partenariats", "conf_partenariats", "rem_partenariats"),
        ligne("", "Diplômes et CV des nouveaux formateurs", "cv_formateurs", "conf_cv", "rem_cv"),
        ligne("", "Nouvelles attestations formation agrément aux UC", "attestations", "conf_attestations", "rem_attestations"),
        ligne("Autres pièces", "Acte du conseil d'administration", "acte_ca", "conf_ca", "rem_ca"),
        ligne("", "Protocole d'évaluation (annexes 1, 2 et 3)", "protocole", "conf_protocole", "rem_protocole"),
        ligne("", "Ruban pédagogique", "ruban", "conf_ruban", "rem_ruban"),
        ligne("", "Calendrier d'alternance (app)", "calendrier", "conf_calendrier", "rem_calendrier"),
      ],
    },
    {
      id: "ccf",
      nom: "Actualisation CCF",
      criteres: [["type_de_demande", "Actualisation"], ["mode_evaluation", "Contrôle en Cours de Formation (CCF)"]],
      titre: "Notification de décision d'actualisation d'habilitation CCF",
      titreGrille: "Grille d'analyse du dossier de demande d'actualisation CCF",
      pied: "Notification d'actualisation d'habilitation CCF",
      liste: { champ: "modules_ccf", libelle: "Intitulé(s) module(s) habilité(s)", format: (l) => l, editable: true },
      suffixeFichier: "actu-CCF",
      grille: [
        ligne("Doc.5", "Tableau relatif au taux de qualification des horaires formateurs", "doc5", "conf_doc5", "rem_doc5"),
        ligne("", "Partenariats", "partenariats", "conf_partenariats", "rem_partenariats"),
        ligne("", "Diplômes et CV des nouveaux formateurs", "cv_formateurs", "conf_cv", "rem_cv"),
        ligne("Autres pièces", "Ruban pédagogique", "ruban", "conf_ruban", "rem_ruban"),
        ligne("", "Calendrier d'alternance (app)", "calendrier", "conf_calendrier", "rem_calendrier"),
        ligne("", "Adaptation des horaires (app)", "adaptation", "conf_adaptation", "rem_adaptation"),
      ],
    },
  ];

  // Champs modifiables dans le widget pour un profil : grille, liste (si éditable), décision, observations
  PROFILS.forEach((p) => {
    p.editables = [
      ...p.grille.flatMap((l) => [l.piece, l.conf, l.rem]),
      ...(p.liste.editable ? [p.liste.champ] : []),
      "decision", "observations",
    ];
    p.booleens = new Set(p.grille.flatMap((l) => [l.piece, l.conf]));
  });

  const correspond = (rec, p) => p.criteres.every(([champ, v]) => simplifier(lire(rec, champ)) === simplifier(v));
  // Profil d'un dossier parmi ceux demandés (tous par défaut)
  const profilDe = (rec, actifs = PROFILS) => (rec ? actifs.find((p) => correspond(rec, p)) || null : null);

  // Pourquoi un dossier n'est pas traité (affiché quand la recherche le trouve hors périmètre)
  const MOTIFS = [[["type_de_demande", "Habilitation complète"]], "dossier d'habilitation"];
  function motifHorsPerimetre(rec) {
    const p = profilDe(rec);   // profil existant mais non activé par l'URL
    if (p) return `dossier ${p.nom}`;
    if (MOTIFS[0].every(([champ, v]) => simplifier(lire(rec, champ)) === simplifier(v))) return MOTIFS[1];
    const type = lire(rec, "type_de_demande");
    const mode = lire(rec, "mode_evaluation");
    return `hors périmètre (${[type, mode].filter(Boolean).join(" / ") || "type non renseigné"})`;
  }

  // Notification complétée = décision renseignée
  const estComplete = (rec) => !!texte(lire(rec, "decision")).trim();

  const listeLignes = (rec, profil) => lignesDe(lire(rec, profil.liste.champ)).map(profil.liste.format);

  function annee(v) {
    const d = globalThis.FPCA.pdf.dateDe(v);
    if (d && !isNaN(d)) return String(d.getFullYear());
    return v ? String(v).substring(0, 4) : "";
  }

  // dept-site-diplôme-suffixe-année.pdf (suffixe : « actu » pour UC, « actu-CCF » pour CCF)
  function nomFichier(rec, profil) {
    const t = (champ) => texte(lire(rec, champ)).trim();
    const parties = [t("departement"), t("site"), t("diplome"), profil?.suffixeFichier, annee(lire(rec, "annee_depot"))]
      .filter(Boolean);
    return `${nomSur(parties.join("-")) || "dossier"}.pdf`;
  }

  globalThis.FPCA.notif = { COLUMN_MAP, PROFILS, lire, profilDe, motifHorsPerimetre, estComplete, listeLignes, lignesDe, nomFichier };
})();
