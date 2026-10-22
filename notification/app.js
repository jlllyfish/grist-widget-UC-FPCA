// Notifications FPCA — navigation, saisie enregistrée dans Grist, aperçu du PDF et téléchargements.
// Profils (UC, CCF…) : profils.js. Composition du PDF : document.js. Socle pdfmake : ../commun/pdf.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const { formatDate, texte, versBlob, telecharger } = FPCA.pdf;
  const { COLUMN_MAP, PROFILS, lire, profilDe, motifHorsPerimetre, estComplete, listeLignes, nomFichier, construireDocument } = FPCA.notif;

  // ── Version ──
  const VERSION = document.querySelector('meta[name="fpca-version"]')?.content || "?";
  $("version").textContent = `version ${VERSION} · PDF vectoriel`;
  console.log(`[Notifications FPCA] version ${VERSION} chargée`);
  $("date-jour").textContent = new Date().toLocaleDateString("fr-FR");

  // ── Profils actifs : tous, ou ceux de l'URL (?profil=ccf ou ?profil=uc,ccf) ──
  const demandes = (new URLSearchParams(location.search).get("profil") || "").toLowerCase().split(",").filter(Boolean);
  const ACTIFS = demandes.length ? PROFILS.filter((p) => demandes.includes(p.id)) : PROFILS;
  if (!ACTIFS.length) ACTIFS.push(...PROFILS);
  const profil = (rec) => profilDe(rec, ACTIFS);
  const estDossierValide = (rec) => !!profil(rec);
  $("toolbar-title").textContent = ACTIFS.length === 1 ? ACTIFS[0].nom : "Notifications FPCA";
  const libelleProfils = ACTIFS.map((p) => p.nom).join(" / ");

  // ── État ──
  let tous = [];          // dossiers du périmètre, lus dans toute la table (sans les filtres de la vue)
  let horsPerimetre = []; // autres lignes de la table : servent à expliquer une recherche sans résultat
  let liste = [];         // dossiers retenus par la recherche et les filtres
  let courant = null;     // dossier affiché
  let source = "";        // "table" ou "vue" (repli)
  let META = null;        // colonnes de la table : type, formule, choix

  const setStatus = (msg, ok = true) => {
    $("status").textContent = msg;
    $("status").title = msg;
    $("status").style.color = ok ? "#666" : "#c9000a";
  };
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lie = () => $("lier-grist").checked;

  // ════════════════════════════════════════════════════════════════
  // Formulaire (reconstruit quand le profil du dossier affiché change)
  // ════════════════════════════════════════════════════════════════
  let profilForm = null;

  function bascule(champ, libelle) {
    const div = el("div", { className: "fr-toggle" });
    const input = el("input", { type: "checkbox", id: `ch-${champ}`, className: "fr-toggle__input" });
    const label = el("label", { className: "fr-toggle__label", htmlFor: input.id, textContent: libelle });
    label.dataset.frCheckedLabel = "Oui";
    label.dataset.frUncheckedLabel = "Non";
    div.append(input, label);
    return div;
  }

  function brancher(champ) {
    const champEl = $(`ch-${champ}`);
    if (!champEl || champEl.dataset.branche) return;
    champEl.dataset.branche = "1";
    // Bascules et menus : enregistrement immédiat. Textes : après une pause de frappe, et en quittant le champ.
    if (champEl.type === "checkbox" || champEl.tagName === "SELECT") {
      champEl.addEventListener("change", () => modifier(champ, champEl.type === "checkbox" ? champEl.checked : champEl.value, true));
    } else {
      champEl.addEventListener("input", () => modifier(champ, champEl.value, false));
      champEl.addEventListener("change", enregistrer);
    }
  }

  function construireFormulaire(p) {
    profilForm = p;
    const grille = $("form-grille");
    const zoneListe = $("form-liste");
    grille.innerHTML = "";
    zoneListe.innerHTML = "";
    if (!p) return;

    // Grille : une carte par pièce, deux bascules et une remarque
    p.grille.forEach((l) => {
      const titre = el("p", { className: "titre", textContent: l.code ? `${l.code} — ` : "" });
      titre.appendChild(el("span", { textContent: l.libelle }));
      const bascules = el("div", { className: "bascules" });
      bascules.append(bascule(l.piece, "Pièce déposée"), bascule(l.conf, "Conforme"));
      const remarque = el("input", { type: "text", id: `ch-${l.rem}`, className: "fr-input", placeholder: "Remarque" });
      remarque.setAttribute("aria-label", `Remarque — ${l.libelle}`);
      const contenu = el("div", { className: "contenu" });
      contenu.append(bascules, remarque);
      const carte = el("div", { className: "ligne-grille" });
      carte.append(titre, contenu);
      grille.appendChild(carte);
    });

    // Liste habilitée modifiable (CCF : modules)
    if (p.liste.editable) {
      const groupe = el("div", { className: "fr-input-group" });
      groupe.append(
        el("label", { className: "fr-label petit", htmlFor: `ch-${p.liste.champ}`, textContent: `${p.liste.libelle} — un par ligne` }),
        el("textarea", { className: "fr-input", id: `ch-${p.liste.champ}`, rows: 4 }),
      );
      zoneListe.appendChild(groupe);
    }
    p.editables.forEach(brancher);
  }

  // Pourquoi un champ n'est pas modifiable (null s'il l'est)
  function blocage(champ) {
    if (!courant) return "Aucun dossier";
    if (source !== "table") return "Table illisible";
    if (!META) return null;
    const m = META.get(COLUMN_MAP[champ]);
    if (!m) return `Colonne ${COLUMN_MAP[champ]} absente de la table`;
    if (m.formule) return `Colonne formule ${m.colId} : à modifier dans Grist`;
    if (profilForm?.booleens.has(champ) && m.type !== "Bool") return `Colonne ${m.colId} de type ${m.type} (Bool attendu)`;
    return null;
  }

  // Options du menu Décision : les choix de la colonne Grist, à défaut les valeurs déjà saisies
  function majChoixDecision() {
    const sel = $("ch-decision");
    const m = META?.get(COLUMN_MAP.decision);
    const choix = m?.choix?.length ? [...m.choix] : [...new Set(tous.map((r) => texte(lire(r, "decision"))).filter(Boolean))].sort();
    const v = courant ? texte(lire(courant, "decision")) : "";
    if (v && !choix.includes(v)) choix.push(v);
    sel.innerHTML = "";
    sel.add(new Option("— Non renseignée —", ""));
    choix.forEach((c) => sel.add(new Option(c, c)));
  }

  // Remplit le formulaire. Sans "force", on ne touche ni au champ en cours de saisie
  // ni aux valeurs pas encore enregistrées (le rechargement après sauvegarde ne doit rien écraser).
  function remplirFormulaire(force) {
    const p = courant ? profil(courant) : null;
    if (p !== profilForm) { construireFormulaire(p); force = true; }
    majChoixDecision();
    (p?.editables || ["decision", "observations"]).forEach((champ) => {
      const champEl = $(`ch-${champ}`);
      if (!champEl) return;
      const raison = blocage(champ);
      champEl.disabled = !!raison;
      champEl.title = raison || "";
      (champEl.closest(".fr-toggle, .fr-input-group, .fr-select-group") || champEl).classList.toggle("champ-bloque", !!raison);
      const col = COLUMN_MAP[champ];
      if (!force && (champEl === document.activeElement || (enAttente(courant?.id) && col in attente.champs))) return;
      const v = courant ? lire(courant, champ) : null;
      if (champEl.type === "checkbox") champEl.checked = !!v;
      else if (Array.isArray(v)) champEl.value = FPCA.notif.lignesDe(v).join("\n");
      else champEl.value = typeof v === "string" ? v : texte(v);
    });
  }

  // ── Nombre de colonnes de la liste UCARE / modules dans le PDF (1, 2 ou 3 ; 3 par défaut) ──
  // Enregistré dans la colonne Grist « Colonnes_liste » si elle existe (choix partagé par l'équipe),
  // sinon dans ce navigateur, dossier par dossier.
  const MEMO_COLONNES = "fpca-notif:colonnes-liste";
  let colonnesLocales = {};
  try { colonnesLocales = JSON.parse(localStorage.getItem(MEMO_COLONNES)) || {}; } catch {}
  const colonneGrist = () => {
    const m = META?.get(COLUMN_MAP.colonnes_liste);
    return m && !m.formule && source === "table";
  };
  function colonnesDe(rec) {
    const v = Number(colonneGrist() ? lire(rec, "colonnes_liste") : colonnesLocales[rec?.id]);
    return [1, 2, 3].includes(v) ? v : 3;
  }
  function choisirColonnes(n) {
    if (!courant) return;
    if (colonneGrist()) modifier("colonnes_liste", n, true);
    else {
      if (n === 3) delete colonnesLocales[courant.id]; else colonnesLocales[courant.id] = n;
      try { localStorage.setItem(MEMO_COLONNES, JSON.stringify(colonnesLocales)); } catch {}
      pageApercu = 1;
      planifierApercu(0);
    }
  }
  document.querySelectorAll('input[name="colonnes-liste"]').forEach((r) =>
    r.addEventListener("change", () => choisirColonnes(Number(r.value))));

  function remplirResume() {
    const dl = $("resume-dossier");
    dl.innerHTML = "";
    $("resume-liste").innerHTML = "";
    const p = courant ? profil(courant) : null;
    $("badge-profil").textContent = p?.nom || "";
    $("badge-profil").hidden = !p;
    const fait = !!courant && estComplete(courant);
    $("badge-etat").textContent = fait ? "Complétée" : "À traiter";
    $("badge-etat").className = `fr-badge fr-badge--sm fr-badge--no-icon ${fait ? "fr-badge--success" : "fr-badge--new"}`;
    $("badge-etat").hidden = !courant;
    if (!courant) return;
    const t = (c) => texte(lire(courant, c));
    const d = (c) => formatDate(lire(courant, c));
    [["N° de dossier", t("ref_ds")], ["Dépôt", d("date_depot")], ["Organisme", t("organisme")], ["Site", t("site")],
     ["Diplôme", [t("diplome"), t("option")].filter(Boolean).join(" — ")], ["Support(s)", t("supports")],
     ["Habilitation", [d("date_debut"), d("date_fin")].filter(Boolean).join(" → ")], ["Voie", t("voie")],
     ["Durées", [t("duree_centre") && `${t("duree_centre")} h centre`, t("duree_entreprise") && `${t("duree_entreprise")} h entreprise`].filter(Boolean).join(", ")],
     ["Cycle", t("cycle")]].forEach(([libelle, valeur]) => {
      dl.append(el("dt", { textContent: libelle }), el("dd", { textContent: valeur || "—" }));
    });
    const n = colonnesDe(courant);
    document.querySelectorAll('input[name="colonnes-liste"]').forEach((r) => (r.checked = Number(r.value) === n));
    $("choix-colonnes").hidden = !p;
    $("choix-colonnes").title = colonneGrist() ? "Enregistré dans Grist (colonne Colonnes_liste)" : "Mémorisé dans ce navigateur";
    // Liste non modifiable (UC : UCARE issues d'une formule) affichée dans le résumé
    if (p && !p.liste.editable) {
      const lignes = listeLignes(courant, p);
      $("resume-liste").append(el("li", { className: "titre-liste", textContent: p.liste.libelle }));
      if (!lignes.length) $("resume-liste").append(el("li", { textContent: "—" }));
      lignes.forEach((l) => $("resume-liste").appendChild(el("li", { textContent: l })));
    }
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
    const e = $("etat-sauvegarde");
    e.className = `etat-sauvegarde${cle === "erreur" ? " erreur" : ""}`;
    e.textContent = { modifie: "· modifié", encours: "· enregistrement…", enregistre: "· ✓ enregistré",
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
    const p = profil(courant);
    pageApercu = p?.grille.some((l) => [l.piece, l.conf, l.rem].includes(champ)) ? 2 : 1;
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
  ["decision", "observations"].forEach(brancher);

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
    const p = courant ? profil(courant) : null;
    if (!p) {
      iframe.hidden = true;
      $("apercu-vide").hidden = false;
      signatureApercu = "";
      return;
    }
    const signature = JSON.stringify([courant, colonnesDe(courant)]);
    if (signature === signatureApercu && !iframe.hidden) return;
    try {
      const blob = await versBlob(construireDocument(courant, p, { colonnes: colonnesDe(courant) }));
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

  // ── Séparateur déplaçable : largeur du formulaire en %, mémorisée ──
  const MEMO_LARGEUR = "fpca-notif:largeur-saisie";
  const sep = $("separateur");
  function largeur(pct, memoriser = true) {
    const corps = $("corps").getBoundingClientRect().width || 1;
    const min = (280 / corps) * 100;                                   // 280 px minimum de chaque côté
    const v = Math.min(100 - min, Math.max(min, pct));
    $("corps").style.setProperty("--largeur-saisie", `${v.toFixed(1)}%`);
    sep.setAttribute("aria-valuenow", String(Math.round(v)));
    if (memoriser) try { localStorage.setItem(MEMO_LARGEUR, String(v)); } catch {}
  }
  sep.setAttribute("aria-valuemin", "0");
  sep.setAttribute("aria-valuemax", "100");
  let pctInitial = 50;
  try { pctInitial = Number(localStorage.getItem(MEMO_LARGEUR)) || 50; } catch {}
  largeur(pctInitial, false);

  sep.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    sep.setPointerCapture(e.pointerId);
    sep.classList.add("actif");
    $("corps").classList.add("redimension");
    const rect = $("corps").getBoundingClientRect();
    const deplacer = (ev) => largeur(((ev.clientX - rect.left) / rect.width) * 100, false);
    const fin = (ev) => {
      sep.removeEventListener("pointermove", deplacer);
      sep.classList.remove("actif");
      $("corps").classList.remove("redimension");
      largeur(((ev.clientX - rect.left) / rect.width) * 100);
    };
    sep.addEventListener("pointermove", deplacer);
    sep.addEventListener("pointerup", fin, { once: true });
    sep.addEventListener("pointercancel", fin, { once: true });
  });
  sep.addEventListener("dblclick", () => largeur(50));
  sep.addEventListener("keydown", (e) => {
    const actuel = Number(sep.getAttribute("aria-valuenow")) || 50;
    const pas = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") largeur(actuel - pas);
    else if (e.key === "ArrowRight") largeur(actuel + pas);
    else if (e.key === "Home" || e.key === "Enter") largeur(50);
    else return;
    e.preventDefault();
  });
  $("onglet-apercu").addEventListener("click", () => onglet("apercu"));

  // ════════════════════════════════════════════════════════════════
  // Navigation et filtres
  // ════════════════════════════════════════════════════════════════
  // ✓ devant les notifications complétées (décision renseignée)
  const libelle = (rec) => (estComplete(rec) ? "\u2713 " : "") +
    ([lire(rec, "dossier_number"), lire(rec, "organisme"), lire(rec, "site"), lire(rec, "diplome")]
      .map((v) => texte(v)).filter(Boolean).join(" — ") || `Ligne ${rec.id}`);
  const ETATS = { oui: "Complétées", non: "À traiter" };

  // ── Filtres croisés : chaque menu ne propose que les valeurs compatibles avec les autres filtres ──
  const VIDE = "∅";   // valeur des dossiers où le champ n'est pas renseigné
  const FACETTES = [
    { champ: "etat", id: "filtre-etat", tous: "Toutes notifications", valeur: (rec) => ETATS[estComplete(rec) ? "oui" : "non"] },
    { champ: "type", id: "filtre-type", tous: "Tous types", valeur: (rec) => profil(rec)?.nom },
    { champ: "departement", id: "filtre-departement", tous: "Tous départements" },
    { champ: "organisme", id: "filtre-organisme", tous: "Tous organismes" },
    { champ: "diplome", id: "filtre-diplome", tous: "Tous diplômes" },
  ];
  $("filtre-type").hidden = ACTIFS.length < 2;
  const cle = (rec, f) => (f.valeur ? f.valeur(rec) : texte(lire(rec, f.champ)).trim()) || VIDE;
  const choix = (f) => $(f.id).value;

  // Mémorise recherche et filtres : Grist recharge souvent le widget en changeant de page
  const MEMO = `fpca-notif:filtres:${ACTIFS.map((p) => p.id).join(",")}`;
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
  const passe = (rec, sauf) => FACETTES.every((f) => f === sauf || !choix(f) || cle(rec, f) === choix(f));

  function majFacettes(mots) {
    FACETTES.forEach((f) => {
      const sel = $(f.id);
      const voulu = sel.value || memoire[f.champ] || "";
      const base = tous.filter((r) => correspond(r, mots) && passe(r, f));
      const compte = new Map();
      base.forEach((r) => { const k = cle(r, f); compte.set(k, (compte.get(k) || 0) + 1); });
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
    if (masques.length) return `${masques.length > 1 ? `${masques.length} dossiers masqués` : "Dossier masqué"} par les filtres`;
    const autres = horsPerimetre.filter((r) => correspond(r, mots));
    if (!autres.length) return "Aucun dossier ne correspond";
    const details = autres.slice(0, 3).map((r) => `${texte(lire(r, "dossier_number")) || `ligne ${r.id}`} : ${motifHorsPerimetre(r)}`);
    if (autres.length > 3) details.push(`et ${autres.length - 3} autre(s)`);
    return details.join(" · ");
  }

  // garder : rafraîchissement des données (ex. après une saisie) → le dossier affiché reste affiché,
  // même s'il ne correspond plus aux filtres (ex. décision saisie avec le filtre « À traiter »).
  function majListe({ garder = false } = {}) {
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
    const encore = courant && tous.find((r) => r.id === courant.id);
    if (i >= 0) courant = liste[i];
    else if (garder && encore) courant = encore;
    else courant = liste[0] || (filtre ? encore || null : null);
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
    const sel = $("sel-dossier");
    sel.querySelector("option.hors-filtres")?.remove();
    if (i >= 0) sel.value = String(i);
    else if (courant && n) {
      // Dossier affiché qui ne correspond plus aux filtres (ex. décision saisie avec « À traiter »)
      const o = new Option(`${libelle(courant)} — hors filtres`, "", true, true);
      o.className = "hors-filtres";
      o.disabled = true;
      sel.prepend(o);
      sel.value = "";
    }
    $("nav-counter").textContent = n ? `${i >= 0 ? i + 1 : "—"} / ${n}` : "— / —";
    $("btn-prec").disabled = i <= 0;
    $("btn-suiv").disabled = !n || i >= n - 1;   // hors filtres (i = -1) : ▶ mène au premier dossier de la liste
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
  $("recherche").addEventListener("input", () => majListe());
  FACETTES.forEach((f) => $(f.id).addEventListener("change", () => majListe()));
  $("btn-reinit").addEventListener("click", reinitialiser);
  $("recherche").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && liste.length) aller(0);
  });

  // ════════════════════════════════════════════════════════════════
  // Grist
  // ════════════════════════════════════════════════════════════════
  grist.ready({ requiredAccess: "full" });

  // Colonnes attendues par les profils actifs mais absentes de la table : signalées une fois
  function colonnesManquantes() {
    if (!META) return [];
    const champs = new Set(ACTIFS.flatMap((p) => [...p.editables, p.liste.champ, ...p.criteres.map(([c]) => c)]));
    return [...champs].map((c) => COLUMN_MAP[c]).filter((col) => col && !META.has(col));
  }

  // onRecords sert de signal : on relit toute la table pour ne pas dépendre des filtres de la vue
  let minuteur = null;
  let dernierSecours = [];
  let idGristEnAttente = null;   // ligne sélectionnée dans Grist avant la première lecture de la table
  async function recharger() {
    const r = await FPCA.grist.chargerTable(dernierSecours);
    source = r.source;
    if (!META && source === "table") {
      try { META = await FPCA.grist.colonnes(); }
      catch (e) { console.warn("[Notifications FPCA] Métadonnées des colonnes illisibles :", e); }
    }
    // Réapplique les modifications pas encore confirmées par Grist
    [envoi, attente].forEach((lot) => {
      const rec = lot && r.lignes.find((x) => x.id === lot.rowId);
      if (rec) Object.assign(rec, lot.champs);
    });
    tous = r.lignes.filter(estDossierValide);
    horsPerimetre = r.lignes.filter((x) => !estDossierValide(x));
    majListe({ garder: true });
    if (idGristEnAttente !== null) {
      const i = lie() ? liste.findIndex((x) => x.id === idGristEnAttente) : -1;
      idGristEnAttente = null;
      if (i >= 0 && courant?.id !== liste[i].id) aller(i, { sync: false });
    }
    setStatus("");
    const manquantes = colonnesManquantes();
    if (manquantes.length) console.warn("[Notifications FPCA] Colonnes introuvables :", manquantes);
    if (!tous.length) setStatus(`⚠️ Aucun dossier de type ${libelleProfils}`, false);
    else if (source === "vue") setStatus("⚠️ Table illisible : dossiers de la vue seulement, saisie désactivée", false);
    else if (manquantes.length) setStatus(`⚠️ Colonnes introuvables : ${manquantes.join(", ")}`, false);
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
    setStatus(`Ligne ${num} : ${motifHorsPerimetre(record)} — dossier affiché inchangé`);
  });

  // ════════════════════════════════════════════════════════════════
  // Téléchargements
  // ════════════════════════════════════════════════════════════════
  $("btn-pdf").addEventListener("click", async () => {
    const p = courant && profil(courant);
    if (!p) return;
    try {
      await enregistrer();
      setStatus("⏳ Génération du PDF…");
      telecharger(await versBlob(construireDocument(courant, p, { colonnes: colonnesDe(courant) })), nomFichier(courant, p));
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
        const p = profil(rec);
        setStatus(`⏳ ${i + 1}/${n} — ${lire(rec, "dossier_number") ?? rec.id}…`);
        let nom = nomFichier(rec, p);
        const k = (vus.get(nom) || 0) + 1;
        vus.set(nom, k);
        if (k > 1) nom = nom.replace(/\.pdf$/, `-${k}.pdf`);
        zip.file(nom, await versBlob(construireDocument(rec, p, { colonnes: colonnesDe(rec) })));
      }
      setStatus("⏳ Compression de l'archive…");
      const date = new Date().toISOString().slice(0, 10);
      const types = [...new Set(lot.map((r) => profil(r).id.toUpperCase()))].join("-");
      telecharger(await zip.generateAsync({ type: "blob" }), `notifications_${types}_${date}.zip`);
      setStatus(`${n} PDF dans l'archive`);
    } catch (err) {
      console.error(err);
      setStatus(`❌ ${err.message}`, false);
    } finally {
      majNav();
    }
  });
})();
