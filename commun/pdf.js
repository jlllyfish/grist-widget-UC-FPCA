// Socle PDF commun aux widgets FPCA : pdfmake + police Marianne, en vectoriel.
// Les fonctions de construction sont pures (aucun accès au DOM) : elles se testent hors navigateur.
globalThis.FPCA = globalThis.FPCA || {};

(function () {
  const PT = 2.834645669; // 1 mm en points
  const PX = 0.75;        // 1 px CSS en points (page A4 à 96 dpi)

  // Marianne ne contient pas les espaces fines insécables produites par toLocaleString
  const nbsp = (s) => String(s ?? "").replace(/[  ]/g, " ");

  // ── Valeurs Grist → texte ──
  function dateDe(v) {
    if (v instanceof Date) return v;
    if (typeof v === "number") return new Date(v * 1000);
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v);
    return null;
  }
  function formatDate(v) {
    if (v === null || v === undefined || v === "") return "";
    const d = dateDe(v);
    // Une date libre (« septembre/2025 », « 01/09/2023 ») est conservée telle quelle
    if (!d || isNaN(d)) return String(v);
    return d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  }
  function texte(v) {
    if (v === null || v === undefined || v === false) return "";
    if (Array.isArray(v)) return v.filter((x) => x !== "L").map(texte).filter(Boolean).join(", ");
    if (v instanceof Date) return formatDate(v);
    return nbsp(String(v));
  }

  // ── Polices ──
  let pret = false;
  function preparer() {
    if (pret) return;
    const pm = globalThis.pdfMake;
    if (!pm) throw new Error("pdfmake n'est pas chargé (vendor/pdfmake.min.js).");
    if (!globalThis.pdfMakeMarianne) throw new Error("La police Marianne n'est pas chargée (vendor/marianne.js).");
    pm.vfs = globalThis.pdfMakeMarianne;
    pm.fonts = { Marianne: { normal: "Marianne-Regular.ttf", bold: "Marianne-Bold.ttf",
                             italics: "Marianne-Italic.ttf", bolditalics: "Marianne-BoldItalic.ttf" } };
    pret = true;
  }

  // ── Éléments de mise en page ──
  // Marianne n'a pas de glyphe ✓ : la coche est dessinée en vectoriel, centrée dans sa cellule.
  function coche(coche, taille = 7) {
    if (!coche) return { text: "" };
    return {
      columns: [
        { width: "*", text: "" },
        { width: taille, canvas: [{ type: "polyline", lineWidth: 1.2, lineColor: "#161616", lineCap: "round",
            points: [{ x: 0, y: taille * 0.55 }, { x: taille * 0.38, y: taille * 0.9 }, { x: taille, y: taille * 0.1 }] }] },
        { width: "*", text: "" },
      ],
      margin: [0, 1.5, 0, 0],
    };
  }

  // Bloc d'en-tête : logo à gauche, lignes de texte alignées à droite
  function enTete(lignes, { tailleTexte = 11 * PX } = {}) {
    const hauteur = 90 * PX;
    return {
      columns: [
        { width: hauteur * (globalThis.FPCA.LOGO_RATIO || 1.39), image: globalThis.FPCA.LOGO, fit: [65 * PT, hauteur] },
        { width: "*", alignment: "right", fontSize: tailleTexte, lineHeight: 1.4, margin: [0, 6, 9, 0],
          text: lignes.flatMap((l, i) => [i ? "\n" : "", typeof l === "string" ? { text: l } : l]) },
      ],
      margin: [0, 0, 0, 6 * PX],
    };
  }

  // Pied de page dessiné sur chaque page : filet + deux textes
  function pied(gauche, droite) {
    return (page, total, taille) => ({
      margin: [10 * PT, 5 * PT, 10 * PT, 0],
      stack: [
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: taille.width - 20 * PT, y2: 0, lineWidth: 0.5, lineColor: "#B4B4B4" }] },
        { columns: [{ text: gauche }, { text: droite, alignment: "right" }],
          fontSize: 8, color: "#646464", margin: [0, 1.5 * PT, 0, 0] },
      ],
    });
  }

  // Bordures fines noires, comme dans l'aperçu HTML
  const bordures = (epaisseur = 1 * PX, padH = 7 * PX, padV = 4 * PX) => ({
    hLineWidth: () => epaisseur, vLineWidth: () => epaisseur,
    hLineColor: () => "#000000", vLineColor: () => "#000000",
    paddingLeft: () => padH, paddingRight: () => padH,
    paddingTop: () => padV, paddingBottom: () => padV,
  });

  // Nom de fichier sûr pour Windows et macOS
  const nomSur = (s) => String(s).replace(/[\/\\:*?"<>|]/g, "_").replace(/\s+/g, "_");

  // ── Génération ──
  function creer(definition) {
    preparer();
    return globalThis.pdfMake.createPdf(definition);
  }
  const versBlob = (definition) => new Promise((ok, ko) => {
    try { creer(definition).getBlob(ok); } catch (e) { ko(e); }
  });
  function telecharger(blob, nom) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
  }

  globalThis.FPCA.pdf = { PT, PX, nbsp, dateDe, formatDate, texte, preparer, coche, enTete, pied, bordures,
                          nomSur, creer, versBlob, telecharger };
})();
