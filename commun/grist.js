// Accès aux données Grist commun aux widgets FPCA : lecture de la table, métadonnées, écriture.
globalThis.FPCA = globalThis.FPCA || {};

(function () {
  // Format colonnes de fetchTable → liste d'enregistrements
  function colonnesEnLignes(t) {
    return t.id.map((id, i) => {
      const r = { id };
      for (const k in t) r[k] = t[k][i];
      return r;
    });
  }

  let tableId = null;
  async function idTable() {
    tableId = tableId || (await grist.getSelectedTableId());
    if (!tableId) throw new Error("table liée inconnue");
    return tableId;
  }

  // Lit TOUTE la table liée au widget, sans les filtres de la vue Grist.
  // Les valeurs sont brutes : dates en secondes, listes au format ["L", …].
  // En cas d'échec, on se rabat sur les enregistrements de la vue (filtrés).
  async function chargerTable(secours = []) {
    try {
      const lignes = colonnesEnLignes(await grist.docApi.fetchTable(await idTable()));
      // Même ordre que dans la table Grist
      if (lignes.length && "manualSort" in lignes[0]) lignes.sort((a, b) => a.manualSort - b.manualSort);
      return { lignes, source: "table" };
    } catch (e) {
      console.warn("[FPCA] Lecture de la table impossible, repli sur la vue :", e);
      return { lignes: secours, source: "vue" };
    }
  }

  // Colonnes de la table liée : type, formule, choix. Map colId → description.
  async function colonnes() {
    const id = await idTable();
    const [t, c] = await Promise.all([grist.docApi.fetchTable("_grist_Tables"),
                                      grist.docApi.fetchTable("_grist_Tables_column")]);
    const ref = t.id[t.tableId.indexOf(id)];
    const res = new Map();
    c.id.forEach((_, i) => {
      if (c.parentId[i] !== ref) return;
      let options = {};
      try { options = JSON.parse(c.widgetOptions[i] || "{}"); } catch {}
      const type = String(c.type[i] || "Any");
      res.set(c.colId[i], {
        colId: c.colId[i],
        label: c.label[i] || c.colId[i],
        type: type.split(":")[0],
        // Colonne formule = non modifiable. Une colonne vide (formule sans texte) reste modifiable.
        formule: !!c.isFormula[i] && !!String(c.formula[i] || "").trim(),
        choix: Array.isArray(options.choices) ? options.choices : [],
      });
    });
    return res;
  }

  // Écrit des valeurs dans une ligne de la table liée
  async function ecrire(rowId, champs) {
    await grist.docApi.applyUserActions([["UpdateRecord", await idTable(), rowId, champs]]);
  }

  globalThis.FPCA.grist = { colonnesEnLignes, chargerTable, colonnes, ecrire };
})();
