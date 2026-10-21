// Accès aux données Grist commun aux widgets FPCA.
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

  // Lit TOUTE la table liée au widget, sans les filtres de la vue Grist.
  // Les valeurs sont brutes : dates en secondes, listes au format ["L", …].
  // En cas d'échec, on se rabat sur les enregistrements de la vue (filtrés).
  let tableId = null;
  async function chargerTable(secours = []) {
    try {
      tableId = tableId || (await grist.getSelectedTableId());
      if (!tableId) throw new Error("table liée inconnue");
      const lignes = colonnesEnLignes(await grist.docApi.fetchTable(tableId));
      // Même ordre que dans la table Grist
      if (lignes.length && "manualSort" in lignes[0]) lignes.sort((a, b) => a.manualSort - b.manualSort);
      return { lignes, source: "table" };
    } catch (e) {
      console.warn("[FPCA] Lecture de la table impossible, repli sur la vue :", e);
      return { lignes: secours, source: "vue" };
    }
  }

  globalThis.FPCA.grist = { colonnesEnLignes, chargerTable };
})();
