// Actualisation UC — liaison avec Grist, aperçu HTML et téléchargements.
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
  let currentRecord = null;
  let allRecords = [];
  let currentIndex = 0;

  const setStatus = (msg, ok = true) => {
    $("status").textContent = msg;
    $("status").style.color = ok ? "#666" : "#c9000a";
  };
  const setBoutons = (pdf, tout = pdf) => {
    $("btn-pdf").disabled = !pdf;
    $("btn-all").disabled = !tout;
  };
  const libelleFiltres = FILTRES.map(([, v]) => `"${v}"`).join(" / ");

  // ════════════════════════════════════════════════════════════════
  // Aperçu HTML
  // ════════════════════════════════════════════════════════════════
  function fill(id, value) {
    const el = $(id);
    if (el) el.textContent = value ?? "";
  }

  function renderDocument() {
    const rec = currentRecord;
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

    const liste = $("ucare-list");
    liste.innerHTML = "";
    ucareLignes(rec).forEach((ligne) => {
      const div = document.createElement("div");
      div.textContent = `• ${ligne}`;
      liste.appendChild(div);
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

  function updateNav() {
    const total = allRecords.length;
    const i = currentRecord ? allRecords.findIndex((r) => r.id === currentRecord.id) : -1;
    if (i >= 0) currentIndex = i;
    $("nav-counter").textContent = total && i >= 0 ? `${currentIndex + 1} / ${total}` : total ? `— / ${total}` : "— / —";
  }

  // ════════════════════════════════════════════════════════════════
  // Grist
  // ════════════════════════════════════════════════════════════════
  grist.ready({ requiredAccess: "full" });

  grist.onRecords((records) => {
    if (!records) return;
    allRecords = records.filter(estDossierValide);
    if (!allRecords.length) {
      setStatus(`⚠️ Aucun dossier de type ${libelleFiltres}`, false);
      setBoutons(false);
      updateNav();
      return;
    }
    // Rafraîchit le dossier affiché avec ses données à jour
    const frais = currentRecord && allRecords.find((r) => r.id === currentRecord.id);
    if (frais) currentRecord = frais;
    else if (!currentRecord) currentRecord = allRecords[0];
    renderDocument();
    $("btn-all").disabled = false;
    updateNav();
  });

  grist.onRecord((record) => {
    if (!record) {
      setStatus("⚠️ Aucune ligne sélectionnée (ligne filtrée ou inexistante)", false);
      setBoutons(false, allRecords.length > 0);
      return;
    }
    if (!estDossierValide(record)) {
      const num = lire(record, "dossier_number") ?? record.id;
      setStatus(`⚠️ Dossier ${num} hors périmètre (pas ${libelleFiltres})`, false);
      setBoutons(false, allRecords.length > 0);
      return;
    }
    currentRecord = record;
    renderDocument();
    updateNav();
    setBoutons(true, true);
    setStatus("");
  });

  // ════════════════════════════════════════════════════════════════
  // Téléchargements
  // ════════════════════════════════════════════════════════════════
  $("btn-pdf").addEventListener("click", async () => {
    if (!currentRecord) return;
    try {
      setStatus("⏳ Génération du PDF…");
      telecharger(await versBlob(construire(currentRecord)), nomFichier(currentRecord));
      setStatus("PDF téléchargé");
    } catch (err) {
      console.error(err);
      setStatus(`❌ ${err.message}`, false);
    }
  });

  // Un seul fichier ZIP : le navigateur bloque les téléchargements multiples
  $("btn-all").addEventListener("click", async () => {
    const n = allRecords.length;
    if (!n || !confirm(`Générer ${n} PDF dans une archive ZIP ?`)) return;
    setBoutons(false);
    try {
      const zip = new JSZip();
      const vus = new Map();
      for (let i = 0; i < n; i++) {
        const rec = allRecords[i];
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
      setBoutons(!!currentRecord && estDossierValide(currentRecord), allRecords.length > 0);
    }
  });
})();
