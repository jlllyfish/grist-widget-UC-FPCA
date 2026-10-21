// Actualisation UC — liaison avec Grist, navigation, aperçu HTML et téléchargements.
// La composition du PDF est dans document.js, le socle pdfmake dans ../commun/pdf.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const { formatDate, texte, versBlob, telecharger } = FPCA.pdf;
  const { lire, estDossierValide, ucareLignes, nomFichier, GRILLE, FILTRES } = FPCA.actuUC;
  const construire = FPCA.actuUC.construireDocument;

  // ── Version ──
  const VERSION = document.querySelector('meta[name="fpca-version"]')?.content || "?";
  $("version").textContent = `version ${VERSION} · PDF vectoriel`;
  console.log(`[Actualisation UC] version ${VERSION} chargée`);

  // ── Logo, partagé avec le PDF ──
  document.querySelectorAll(".logo-ministere").forEach((img) => (img.src = FPCA.LOGO));

  // ── État ──
  let tous = [];          // dossiers du périmètre, lus dans toute la table (sans les filtres de la vue)
  let liste = [];         // dossiers correspondant à la recherche
  let courant = null;     // dossier affiché
  let source = "";        // "table" ou "vue" (repli)

  const setStatus = (msg, ok = true) => {
    $("status").textContent = msg;
    $("status").style.color = ok ? "#666" : "#c9000a";
  };
  const libelleFiltres = FILTRES.map(([, v]) => `"${v}"`).join(" / ");
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lie = () => $("lier-grist").checked;

  // ════════════════════════════════════════════════════════════════
  // Aperçu HTML
  // ════════════════════════════════════════════════════════════════
  function fill(id, value) {
    const el = $(id);
    if (el) el.textContent = value ?? "";
  }

  function renderDocument() {
    const rec = courant;
    if (!rec) return;
    const t = (champ) => texte(lire(rec, champ));
    const d = (champ) => formatDate(lire(rec, champ));

    fill("r-ref-ds", t("ref_ds"));
    fill("r-date-depot", d("date_depot"));
    fill("f-organisme", t("organisme"));
    fill("f-site", t("site"));
    fill("f-diplome", t("diplome"));
    fill("f-option", t("option"));
    fill("f-supports", t("supports"));
    fill("f-date-debut", d("date_debut"));
    fill("f-date-fin", d("date_fin"));
    fill("f-voie", t("voie"));
    fill("f-duree-centre", t("duree_centre"));
    fill("f-duree-entreprise", t("duree_entreprise"));
    fill("f-cycle", t("cycle"));

    const ucare = $("ucare-list");
    ucare.innerHTML = "";
    ucareLignes(rec).forEach((ligne) => {
      const div = document.createElement("div");
      div.textContent = `• ${ligne}`;
      ucare.appendChild(div);
    });

    fill("f-decision", t("decision"));
    fill("f-observations", t("observations"));
    fill("f-date-signature", d("date_signature") || new Date().toLocaleDateString("fr-FR"));

    // Grille : mêmes lignes que le PDF
    const corps = $("grille-corps");
    corps.innerHTML = "";
    GRILLE.forEach(([code, libelle, piece, conf, rem]) => {
      const tr = document.createElement("tr");
      [[code], [libelle], [lire(rec, piece) ? "✓" : "", "check-cell"], [lire(rec, conf) ? "✓" : "", "check-cell"],
       [texte(lire(rec, rem))]].forEach(([contenu, classe]) => {
        const td = document.createElement("td");
        td.textContent = contenu;
        if (classe) td.className = classe;
        tr.appendChild(td);
      });
      corps.appendChild(tr);
    });
  }

  // ════════════════════════════════════════════════════════════════
  // Navigation et recherche
  // ════════════════════════════════════════════════════════════════
  const libelle = (rec) =>
    [lire(rec, "dossier_number"), lire(rec, "organisme"), lire(rec, "site"), lire(rec, "diplome")]
      .map((v) => texte(v)).filter(Boolean).join(" — ") || `Ligne ${rec.id}`;

  // Tous les mots saisis doivent apparaître dans le n°, l'organisme, le site, le diplôme ou le département
  function correspond(rec, mots) {
    const cible = norm(["dossier_number", "organisme", "site", "diplome", "departement", "option"]
      .map((c) => texte(lire(rec, c))).join(" "));
    return mots.every((m) => cible.includes(m));
  }

  function majListe() {
    const mots = norm($("recherche").value).split(/\s+/).filter(Boolean);
    liste = mots.length ? tous.filter((r) => correspond(r, mots)) : tous;
    $("sel-dossier").innerHTML = liste.length
      ? liste.map((r, i) => `<option value="${i}"></option>`).join("")
      : `<option value="">${tous.length ? "Aucun dossier ne correspond" : "Aucun dossier"}</option>`;
    // textContent : pas d'injection HTML depuis les données
    [...$("sel-dossier").options].forEach((o, i) => { if (liste[i]) o.textContent = libelle(liste[i]); });
    // Garde le dossier affiché s'il est toujours dans la liste, sinon prend le premier
    const i = courant ? liste.findIndex((r) => r.id === courant.id) : -1;
    if (i >= 0) courant = liste[i];
    else courant = liste[0] || (mots.length ? courant : null);
    majNav();
    renderDocument();
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
      : "Les dossiers correspondant à la recherche dans une archive";
  }

  function aller(i, { sync = true } = {}) {
    if (i < 0 || i >= liste.length) return;
    courant = liste[i];
    majNav();
    renderDocument();
    setStatus("");
    // Déplace aussi le curseur Grist ; sans effet si la ligne est masquée par un filtre de la vue
    if (sync && lie()) grist.setCursorPos({ rowId: courant.id }).catch(() => {});
  }

  const indexCourant = () => (courant ? liste.findIndex((r) => r.id === courant.id) : -1);
  $("btn-prec").addEventListener("click", () => aller(indexCourant() - 1));
  $("btn-suiv").addEventListener("click", () => aller(indexCourant() + 1));
  $("sel-dossier").addEventListener("change", (e) => aller(Number(e.target.value)));
  $("recherche").addEventListener("input", majListe);
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
  let idGrist = null;   // dernière ligne sélectionnée dans Grist, appliquée dès que la table est lue
  async function recharger() {
    const r = await FPCA.grist.chargerTable(dernierSecours);
    source = r.source;
    tous = r.lignes.filter(estDossierValide);
    majListe();
    const i = lie() && idGrist !== null ? liste.findIndex((r) => r.id === idGrist) : -1;
    if (i >= 0 && courant?.id !== idGrist) aller(i, { sync: false });
    setStatus("");
    if (!tous.length) setStatus(`⚠️ Aucun dossier de type ${libelleFiltres}`, false);
    else if (source === "vue") setStatus("⚠️ Table illisible : seuls les dossiers visibles dans la vue sont listés", false);
  }

  grist.onRecords((records) => {
    dernierSecours = (records || []);
    clearTimeout(minuteur);
    minuteur = setTimeout(recharger, 250);
  });

  grist.onRecord((record) => {
    if (!record) return;
    idGrist = record.id;
    if (!lie() || !tous.length) return;
    // Recherche par id dans la liste du widget : les valeurs de la vue sont décodées différemment
    let i = liste.findIndex((r) => r.id === record.id);
    if (i < 0 && tous.some((r) => r.id === record.id)) {
      $("recherche").value = "";   // dossier masqué par la recherche : on l'efface
      majListe();
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
