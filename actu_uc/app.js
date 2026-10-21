// Actualisation UC — navigation, saisie enregistrée dans Grist, aperçu du PDF et téléchargements.
// La composition du PDF est dans document.js, le socle pdfmake dans ../commun/pdf.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const { formatDate, texte, versBlob, telecharger } = FPCA.pdf;
  const { COLUMN_MAP, lire, estDossierValide, motifHorsPerimetre, ucareLignes, nomFichier, GRILLE, EDITABLES, FILTRES } = FPCA.actuUC;
  const construire = FPCA.actuUC.construireDocument;

  // ── Version ──
  const VERSION = document.querySelector('meta[name="fpca-version"]')?.content || "?";
  $("version").textContent = `version ${VERSION} · PDF vectoriel`;
  console.log(`[Actualisation UC] version ${VERSION} chargée`);
  $("date-jour").textContent = new Date().toLocaleDateString("fr-FR");

  // ── État ──
  let tous = [];          // dossiers du périmètre, lus dans toute la table (sans les filtres de la vue)
  let horsPerimetre = []; // autres lignes de la table : servent à expliquer une recherche sans résultat
  let liste = [];         // dossiers retenus par la recherche et les filtres
  let courant = null;     // dossier affiché
  let source = "";        // "table" ou "vue" (repli)
  let META = null;        // colonnes de la table : type, formule, choix

  const setStatus = (msg, ok = true) => {
    $("status").textContent = msg;
    $("status").style.color = ok ? "#666" : "#c9000a";
  };
  const libelleFiltres = FILTRES.map(([, v]) => `"${v}"`).join(" / ");
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lie = () => $("lier-grist").checked;

  // ════════════════════════════════════════════════════════════════
  // Formulaire
  // ════════════════════════════════════════════════════════════════
  const BOOLEENS = new Set(GRILLE.flatMap(([, , piece, conf]) => [piece, conf]));
  const champGrille = new Set(GRILLE.flatMap(([, , p, c, r]) => [p, c, r]));

  function bascule(champ, libelle) {
    const div = document.createElement("div");
    div.className = "fr-toggle";
    const input = Object.assign(document.createElement("input"), { type: "checkbox", id: `ch-${champ}`, className: "fr-toggle__input" });
    const label = Object.assign(document.createElement("label"), { className: "fr-toggle__label", htmlFor: input.id, textContent: libelle });
    label.dataset.frCheckedLabel = "Oui";
    label.dataset.frUncheckedLabel = "Non";
    div.append(input, label);
    return div;
  }

  // Grille : une carte par pièce, deux bascules et une remarque
  GRILLE.forEach(([code, libelle, piece, conf, rem]) => {
    const carte = document.createElement("div");
    carte.className = "ligne-grille";
    const titre = document.createElement("p");
    titre.className = "titre";
    titre.textContent = code ? `${code} — ` : "";
    titre.appendChild(Object.assign(document.createElement("span"), { textContent: libelle }));
    const bascules = document.createElement("div");
    bascules.className = "bascules";
    bascules.append(bascule(piece, "Pièce déposée"), bascule(conf, "Conforme"));
    const remarque = Object.assign(document.createElement("input"), {
      type: "text", id: `ch-${rem}`, className: "fr-input", placeholder: "Remarque" });
    remarque.setAttribute("aria-label", `Remarque — ${libelle}`);
    const contenu = document.createElement("div");
    contenu.className = "contenu";
    contenu.append(bascules, remarque);
    carte.append(titre, contenu);
    $("form-grille").appendChild(carte);
  });

  // Pourquoi un champ n'est pas modifiable (null s'il l'est)
  function blocage(champ) {
    if (!courant) return "Aucun dossier";
    if (source !== "table") return "Table illisible";
    if (!META) return null;
    const m = META.get(COLUMN_MAP[champ]);
    if (!m) return `Colonne ${COLUMN_MAP[champ]} absente de la table`;
    if (m.formule) return `Colonne formule ${m.colId} : à modifier dans Grist`;
    if (BOOLEENS.has(champ) && m.type !== "Bool") return `Colonne ${m.colId} de type ${m.type} (Bool attendu)`;
    return null;
  }

  // Options du menu Décision : les choix de la colonne Grist, à défaut les valeurs déjà saisies
  function majChoixDecision() {
    const sel = $("ch-decision");
    const m = META?.get(COLUMN_MAP.decision);
    let choix = m?.choix?.length ? [...m.choix] : [...new Set(tous.map((r) => texte(lire(r, "decision"))).filter(Boolean))].sort();
    const v = courant ? texte(lire(courant, "decision")) : "";
    if (v && !choix.includes(v)) choix.push(v);
    sel.innerHTML = "";
    sel.add(new Option("— Non renseignée —", ""));
    choix.forEach((c) => sel.add(new Option(c, c)));
  }

  // Remplit le formulaire. Sans "force", on ne touche ni au champ en cours de saisie
  // ni aux valeurs pas encore enregistrées (le rechargement après sauvegarde ne doit rien écraser).
  function remplirFormulaire(force) {
    majChoixDecision();
    EDITABLES.forEach((champ) => {
      const el = $(`ch-${champ}`);
      if (!el) return;
      const raison = blocage(champ);
      el.disabled = !!raison;
      el.title = raison || "";
      (el.closest(".fr-toggle, .fr-input-group, .fr-select-group") || el).classList.toggle("champ-bloque", !!raison);
      const col = COLUMN_MAP[champ];
      if (!force && (el === document.activeElement || (enAttente(courant?.id) && col in attente.champs))) return;
      const v = courant ? lire(courant, champ) : null;
      if (el.type === "checkbox") el.checked = !!v;
      else el.value = typeof v === "string" ? v : texte(v);
    });
  }

  function remplirResume() {
    const dl = $("resume-dossier");
    dl.innerHTML = "";
    $("resume-ucare").innerHTML = "";
    if (!courant) return;
    const t = (c) => texte(lire(courant, c));
    const d = (c) => formatDate(lire(courant, c));
    [["N° de dossier", t("ref_ds")], ["Dépôt", d("date_depot")], ["Organisme", t("organisme")], ["Site", t("site")],
     ["Diplôme", [t("diplome"), t("option")].filter(Boolean).join(" — ")], ["Support(s)", t("supports")],
     ["Habilitation", [d("date_debut"), d("date_fin")].filter(Boolean).join(" → ")], ["Voie", t("voie")],
     ["Durées", [t("duree_centre") && `${t("duree_centre")} h centre`, t("duree_entreprise") && `${t("duree_entreprise")} h entreprise`].filter(Boolean).join(", ")],
     ["Cycle", t("cycle")]].forEach(([libelle, valeur]) => {
      dl.append(Object.assign(document.createElement("dt"), { textContent: libelle }),
                Object.assign(document.createElement("dd"), { textContent: valeur || "—" }));
    });
    ucareLignes(courant).forEach((l) => $("resume-ucare").appendChild(Object.assign(document.createElement("li"), { textContent: l })));
  }

  // ════════════════════════════════════════════════════════════════
  // Enregistrement automatique dans Grist
  // ════════════════════════════════════════════════════════════════
  let attente = null;               // { rowId, champs } : modifications pas encore envoyées
  let envoi = null;                 // lot en cours d'envoi
  let fileEcriture = Promise.resolve();
  let minuteurSauvegarde = null;
  const enAttente = (rowId) => attente && attente.rowId === rowId;

  function etatSauvegarde(cle, detail = "") {
    const el = $("etat-sauvegarde");
    el.className = `etat-sauvegarde${cle === "erreur" ? " erreur" : ""}`;
    el.textContent = { modifie: "· modifié", encours: "· enregistrement…", enregistre: "· ✓ enregistré",
                       erreur: `· ✗ non enregistré${detail ? ` (${detail})` : ""}`, "": "" }[cle];
  }

  function modifier(champ, valeur, immediat) {
    if (!courant || blocage(champ)) return;
    const col = COLUMN_MAP[champ];
    courant[col] = valeur;                                   // affichage et aperçu immédiats
    if (attente && attente.rowId !== courant.id) enregistrer();
    attente = attente || { rowId: courant.id, champs: {} };
    attente.champs[col] = valeur;
    etatSauvegarde("modifie");
    clearTimeout(minuteurSauvegarde);
    minuteurSauvegarde = setTimeout(enregistrer, immediat ? 0 : 800);
    pageApercu = champGrille.has(champ) ? 2 : 1;
    planifierApercu();
  }

  function enregistrer() {
    clearTimeout(minuteurSauvegarde);
    if (!attente) return fileEcriture;
    const lot = attente;
    attente = null;
    fileEcriture = fileEcriture.then(async () => {
      envoi = lot;
      etatSauvegarde("encours");
      try {
        await FPCA.grist.ecrire(lot.rowId, lot.champs);
        if (!attente) etatSauvegarde("enregistre");
      } catch (e) {
        console.error(e);
        etatSauvegarde("erreur", e.message);
        setStatus(`❌ Enregistrement impossible : ${e.message}`, false);
      } finally {
        envoi = null;
      }
    });
    return fileEcriture;
  }
  addEventListener("pagehide", enregistrer);

  // Bascules : enregistrement immédiat. Textes : après une pause de frappe, et en quittant le champ.
  EDITABLES.forEach((champ) => {
    const el = $(`ch-${champ}`);
    if (!el) return;
    if (el.type === "checkbox" || el.tagName === "SELECT") {
      el.addEventListener("change", () => modifier(champ, el.type === "checkbox" ? el.checked : el.value, true));
    } else {
      el.addEventListener("input", () => modifier(champ, el.value, false));
      el.addEventListener("change", enregistrer);
    }
  });

  // ════════════════════════════════════════════════════════════════
  // Aperçu : le vrai PDF
  // ════════════════════════════════════════════════════════════════
  let urlApercu = null;
  let jetonApercu = 0;
  let minuteurApercu = null;
  let signatureApercu = "";
  let pageApercu = 1;     // page à montrer : la grille est en page 2

  function planifierApercu(delai = 500) {
    clearTimeout(minuteurApercu);
    minuteurApercu = setTimeout(genererApercu, delai);
  }

  async function genererApercu() {
    const jeton = ++jetonApercu;
    const iframe = $("apercu-pdf");
    if (!courant) {
      iframe.hidden = true;
      $("apercu-vide").hidden = false;
      signatureApercu = "";
      return;
    }
    const signature = JSON.stringify(courant);
    if (signature === signatureApercu && !iframe.hidden) return;
    try {
      const blob = await versBlob(construire(courant));
      if (jeton !== jetonApercu) return;   // une génération plus récente est en cours
      const ancien = urlApercu;
      urlApercu = URL.createObjectURL(blob);
      iframe.src = `${urlApercu}#page=${pageApercu}&view=FitH`;
      iframe.hidden = false;
      $("apercu-vide").hidden = true;
      signatureApercu = signature;
      if (ancien) setTimeout(() => URL.revokeObjectURL(ancien), 5000);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Aperçu impossible : ${e.message}`, false);
    }
  }

  // Section étroite : onglets Saisie / Aperçu
  function onglet(vue) {
    $("corps").classList.toggle("vue-saisie", vue === "saisie");
    $("corps").classList.toggle("vue-apercu", vue === "apercu");
    [["onglet-saisie", "saisie"], ["onglet-apercu", "apercu"]].forEach(([id, v]) => {
      $(id).setAttribute("aria-selected", String(v === vue));
      $(id).classList.toggle("fr-btn--tertiary", v !== vue);
    });
  }
  $("onglet-saisie").addEventListener("click", () => onglet("saisie"));
  $("onglet-apercu").addEventListener("click", () => onglet("apercu"));

  // ════════════════════════════════════════════════════════════════
  // Navigation et filtres
  // ════════════════════════════════════════════════════════════════
  const libelle = (rec) =>
    [lire(rec, "dossier_number"), lire(rec, "organisme"), lire(rec, "site"), lire(rec, "diplome")]
      .map((v) => texte(v)).filter(Boolean).join(" — ") || `Ligne ${rec.id}`;

  // ── Filtres croisés : chaque menu ne propose que les valeurs compatibles avec les autres filtres ──
  const FACETTES = [
    { champ: "departement", id: "filtre-departement", tous: "Tous départements" },
    { champ: "organisme", id: "filtre-organisme", tous: "Tous organismes" },
    { champ: "diplome", id: "filtre-diplome", tous: "Tous diplômes" },
  ];
  const VIDE = "∅";   // valeur des dossiers où le champ n'est pas renseigné
  const cle = (rec, champ) => texte(lire(rec, champ)).trim() || VIDE;
  const choix = (f) => $(f.id).value;

  // Mémorise recherche et filtres : Grist recharge souvent le widget en changeant de page
  const MEMO = "fpca-actu-uc:filtres";
  function memoriser() {
    const etat = { recherche: $("recherche").value };
    FACETTES.forEach((f) => (etat[f.champ] = choix(f)));
    try { localStorage.setItem(MEMO, JSON.stringify(etat)); } catch {}
  }
  let memoire = {};
  try { memoire = JSON.parse(localStorage.getItem(MEMO)) || {}; } catch {}
  $("recherche").value = memoire.recherche || "";

  // Tous les mots saisis doivent apparaître dans le n°, l'organisme, le site, le diplôme ou le département
  function correspond(rec, mots) {
    if (!mots.length) return true;
    const cible = norm(["dossier_number", "organisme", "site", "diplome", "departement", "option"]
      .map((c) => texte(lire(rec, c))).join(" "));
    return mots.every((m) => cible.includes(m));
  }
  const passe = (rec, sauf) => FACETTES.every((f) => f === sauf || !choix(f) || cle(rec, f.champ) === choix(f));

  function majFacettes(mots) {
    FACETTES.forEach((f) => {
      const sel = $(f.id);
      const voulu = sel.value || memoire[f.champ] || "";
      const base = tous.filter((r) => correspond(r, mots) && passe(r, f));
      const compte = new Map();
      base.forEach((r) => { const k = cle(r, f.champ); compte.set(k, (compte.get(k) || 0) + 1); });
      if (voulu && !compte.has(voulu)) compte.set(voulu, 0);
      const valeurs = [...compte.keys()].sort((x, y) =>
        x === VIDE ? 1 : y === VIDE ? -1 : x.localeCompare(y, "fr", { numeric: true, sensitivity: "base" }));
      sel.innerHTML = "";
      sel.add(new Option(f.tous, ""));
      valeurs.forEach((v) => sel.add(new Option(`${v === VIDE ? "(non renseigné)" : v} (${compte.get(v)})`, v)));
      sel.value = voulu;
    });
    memoire = {};   // appliquée une seule fois, au premier chargement
  }

  // Affiche le dossier courant : formulaire complet s'il a changé, mise à jour prudente sinon
  let idAffiche = null;
  function afficher() {
    const change = (courant?.id ?? null) !== idAffiche;
    idAffiche = courant?.id ?? null;
    if (change) pageApercu = 1;
    remplirResume();
    remplirFormulaire(change);
    planifierApercu(change ? 0 : 500);
  }

  // Recherche sans résultat : explique pourquoi (dossier d'un autre type, ou masqué par les filtres)
  function messageSansResultat(mots) {
    if (!tous.length && !mots.length) return "Aucun dossier";
    if (!mots.length) return "Aucun dossier ne correspond aux filtres";
    const masques = tous.filter((r) => correspond(r, mots));
    if (masques.length) return `${masques.length > 1 ? `${masques.length} dossiers masqués` : "Dossier masqué"} par les filtres département / organisme / diplôme`;
    const autres = horsPerimetre.filter((r) => correspond(r, mots));
    if (!autres.length) return "Aucun dossier ne correspond";
    const details = autres.slice(0, 3).map((r) => `${texte(lire(r, "dossier_number")) || `ligne ${r.id}`} : ${motifHorsPerimetre(r)}`);
    if (autres.length > 3) details.push(`et ${autres.length - 3} autre(s)`);
    return details.join(" · ");
  }

  function majListe() {
    const mots = norm($("recherche").value).split(/\s+/).filter(Boolean);
    majFacettes(mots);
    liste = tous.filter((r) => correspond(r, mots) && passe(r, null));
    const filtre = liste.length !== tous.length || mots.length || FACETTES.some(choix);
    $("btn-reinit").hidden = !filtre;
    const message = liste.length ? "" : messageSansResultat(mots);
    $("nb-resultats").textContent = message || (tous.length ? `${liste.length} dossier${liste.length > 1 ? "s" : ""} sur ${tous.length}` : "");
    $("nb-resultats").classList.toggle("alerte", !!message);
    $("nb-resultats").title = message;
    $("sel-dossier").innerHTML = "";
    if (liste.length) liste.forEach((r, i) => $("sel-dossier").add(new Option(libelle(r), String(i))));
    else $("sel-dossier").add(new Option(message, ""));
    // Garde le dossier affiché s'il est toujours dans la liste, sinon prend le premier
    const i = courant ? liste.findIndex((r) => r.id === courant.id) : -1;
    if (i >= 0) courant = liste[i];
    else courant = liste[0] || (filtre ? (courant && tous.find((r) => r.id === courant.id)) || null : null);
    majNav();
    afficher();
    memoriser();
  }

  function reinitialiser() {
    $("recherche").value = "";
    FACETTES.forEach((f) => ($(f.id).value = ""));
    majListe();
  }

  function majNav() {
    const n = liste.length;
    const i = courant ? liste.findIndex((r) => r.id === courant.id) : -1;
    if (i >= 0) $("sel-dossier").value = String(i);
    $("nav-counter").textContent = n ? `${i >= 0 ? i + 1 : "—"} / ${n}` : "— / —";
    $("btn-prec").disabled = i <= 0;
    $("btn-suiv").disabled = i < 0 || i >= n - 1;
    $("btn-pdf").disabled = !courant;
    $("btn-all").disabled = !n;
    $("btn-all").textContent = n ? `ZIP (${n})` : "ZIP";
    $("btn-all").title = n === tous.length ? "Tous les dossiers dans une archive"
      : "Les dossiers retenus par la recherche et les filtres, dans une archive";
  }

  function aller(i, { sync = true } = {}) {
    if (i < 0 || i >= liste.length) return;
    enregistrer();   // les modifications en attente partent avec l'identifiant de leur dossier
    courant = liste[i];
    majNav();
    afficher();
    setStatus("");
    // Déplace aussi le curseur Grist ; sans effet si la ligne est masquée par un filtre de la vue
    if (sync && lie()) grist.setCursorPos({ rowId: courant.id }).catch(() => {});
  }

  const indexCourant = () => (courant ? liste.findIndex((r) => r.id === courant.id) : -1);
  $("btn-prec").addEventListener("click", () => aller(indexCourant() - 1));
  $("btn-suiv").addEventListener("click", () => aller(indexCourant() + 1));
  $("sel-dossier").addEventListener("change", (e) => aller(Number(e.target.value)));
  $("recherche").addEventListener("input", majListe);
  FACETTES.forEach((f) => $(f.id).addEventListener("change", majListe));
  $("btn-reinit").addEventListener("click", reinitialiser);
  $("recherche").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && liste.length) aller(0);
  });

  // ════════════════════════════════════════════════════════════════
  // Grist
  // ════════════════════════════════════════════════════════════════
  grist.ready({ requiredAccess: "full" });

  // onRecords sert de signal : on relit toute la table pour ne pas dépendre des filtres de la vue
  let minuteur = null;
  let dernierSecours = [];
  let idGristEnAttente = null;   // ligne sélectionnée dans Grist avant la première lecture de la table
  async function recharger() {
    const r = await FPCA.grist.chargerTable(dernierSecours);
    source = r.source;
    if (!META && source === "table") {
      try { META = await FPCA.grist.colonnes(); }
      catch (e) { console.warn("[Actualisation UC] Métadonnées des colonnes illisibles :", e); }
    }
    // Réapplique les modifications pas encore confirmées par Grist
    [envoi, attente].forEach((lot) => {
      const rec = lot && r.lignes.find((x) => x.id === lot.rowId);
      if (rec) Object.assign(rec, lot.champs);
    });
    tous = r.lignes.filter(estDossierValide);
    horsPerimetre = r.lignes.filter((x) => !estDossierValide(x));
    majListe();
    if (idGristEnAttente !== null) {
      const i = lie() ? liste.findIndex((x) => x.id === idGristEnAttente) : -1;
      idGristEnAttente = null;
      if (i >= 0 && courant?.id !== liste[i].id) aller(i, { sync: false });
    }
    setStatus("");
    if (!tous.length) setStatus(`⚠️ Aucun dossier de type ${libelleFiltres}`, false);
    else if (source === "vue") setStatus("⚠️ Table illisible : dossiers de la vue seulement, saisie désactivée", false);
  }

  grist.onRecords((records) => {
    dernierSecours = records || [];
    clearTimeout(minuteur);
    minuteur = setTimeout(recharger, 250);
  });

  grist.onRecord((record) => {
    if (!record) return;
    if (!tous.length) { idGristEnAttente = record.id; return; }
    if (!lie()) return;
    // Recherche par id dans la liste du widget : les valeurs de la vue sont décodées différemment
    let i = liste.findIndex((r) => r.id === record.id);
    if (i < 0 && tous.some((r) => r.id === record.id)) {
      reinitialiser();   // dossier masqué par la recherche ou les filtres : on les efface
      i = liste.findIndex((r) => r.id === record.id);
    }
    if (i >= 0) {
      if (!courant || courant.id !== record.id) aller(i, { sync: false });
      return;
    }
    const num = lire(record, "dossier_number") ?? record.id;
    setStatus(`Ligne ${num} hors périmètre (pas ${libelleFiltres}) : dossier affiché inchangé`);
  });

  // ════════════════════════════════════════════════════════════════
  // Téléchargements
  // ════════════════════════════════════════════════════════════════
  $("btn-pdf").addEventListener("click", async () => {
    if (!courant) return;
    try {
      await enregistrer();
      setStatus("⏳ Génération du PDF…");
      telecharger(await versBlob(construire(courant)), nomFichier(courant));
      setStatus("PDF téléchargé");
    } catch (err) {
      console.error(err);
      setStatus(`❌ ${err.message}`, false);
    }
  });

  // Un seul fichier ZIP : le navigateur bloque les téléchargements multiples
  $("btn-all").addEventListener("click", async () => {
    const lot = [...liste];
    const n = lot.length;
    if (!n || !confirm(`Générer ${n} PDF dans une archive ZIP ?`)) return;
    $("btn-all").disabled = $("btn-pdf").disabled = true;
    try {
      await enregistrer();
      const zip = new JSZip();
      const vus = new Map();
      for (let i = 0; i < n; i++) {
        const rec = lot[i];
        setStatus(`⏳ ${i + 1}/${n} — ${lire(rec, "dossier_number") ?? rec.id}…`);
        let nom = nomFichier(rec);
        const k = (vus.get(nom) || 0) + 1;
        vus.set(nom, k);
        if (k > 1) nom = nom.replace(/\.pdf$/, `-${k}.pdf`);
        zip.file(nom, await versBlob(construire(rec)));
      }
      setStatus("⏳ Compression de l'archive…");
      const date = new Date().toISOString().slice(0, 10);
      telecharger(await zip.generateAsync({ type: "blob" }), `actualisations_UC_${date}.zip`);
      setStatus(`${n} PDF dans l'archive`);
    } catch (err) {
      console.error(err);
      setStatus(`❌ ${err.message}`, false);
    } finally {
      majNav();
    }
  });
})();
