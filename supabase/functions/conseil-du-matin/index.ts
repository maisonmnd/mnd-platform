// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   CONSEIL-DU-MATIN : Saphir, version simple. Chaque matin à 7 h (Cotonou),
   la page de la direction : ce qui presse, hier, aujourd'hui, les dix
   professionnels, les crédits, et le lundi le chiffre du lundi.

   Fichier fabriqué par `node scripts/conseil-du-matin-serveur.mjs` depuis
   `scripts/serveur/conseil-du-matin.ts` et les modules purs du dépôt
   (conseil-du-matin-pur, maison-intelligente-pur, assistants-pur) : on ne
   le corrige jamais ici, on corrige le dépôt et on refait le fichier.

   Appelée par le cron `conseil-du-matin` (0151) avec la clé service, et
   par l'écran « Les assistants » du Trône avec la session d'un souverain.
   Aucun appel à Claude.

   AUCUN SECRET ICI : SUPABASE_URL, CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   viennent de l'environnement (déjà posés).

   Déploiement : `node scripts/mise-en-ligne.mjs fonction conseil-du-matin
   --commit <sha> --jwt non` (la porte est jugée ici : la clé service, ou le
   JWT d'un souverain). Vérifier : son adresse répond sa version.
   ═══════════════════════════════════════════════════════════════════ */
// scripts/serveur/conseil-du-matin.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// src/shared/assistants-pur.ts
var REGLAGES_PAR_DEFAUT = {
  rythmeMin: 10,
  veilleDe: 6,
  veilleA: 24,
  soirDe: 18,
  rythmeSoirMin: 30,
  silenceMin: 45,
  tenueHeures: 2
};
var reglagesComplets = (r) => {
  const n = (v, d, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : d;
  return {
    rythmeMin: n(r?.rythmeMin, REGLAGES_PAR_DEFAUT.rythmeMin, 5, 60),
    veilleDe: n(r?.veilleDe, REGLAGES_PAR_DEFAUT.veilleDe, 0, 23),
    veilleA: n(r?.veilleA, REGLAGES_PAR_DEFAUT.veilleA, 1, 24),
    soirDe: n(r?.soirDe, REGLAGES_PAR_DEFAUT.soirDe, 0, 24),
    rythmeSoirMin: n(r?.rythmeSoirMin, REGLAGES_PAR_DEFAUT.rythmeSoirMin, 5, 60),
    silenceMin: n(r?.silenceMin, REGLAGES_PAR_DEFAUT.silenceMin, 15, 240),
    tenueHeures: n(r?.tenueHeures, REGLAGES_PAR_DEFAUT.tenueHeures, 1, 12)
  };
};
function dansLaVeille(heure, r) {
  const h = Math.floor(heure);
  return h >= r.veilleDe && h < r.veilleA;
}
function rythmeA(heure, r) {
  if (!dansLaVeille(heure, r)) return null;
  return Math.floor(heure) >= r.soirDe ? r.rythmeSoirMin : r.rythmeMin;
}
var MARGE_DE_SOMMEIL_MIN = 15;
function seuilDeSommeilMin(depuisMs, jusquaMs, r) {
  const debut = Math.min(depuisMs, jusquaMs);
  const fin = Math.max(depuisMs, jusquaMs);
  let plusLong = 0;
  if (!Number.isFinite(debut) || !Number.isFinite(fin)) return Math.max(r.rythmeMin, r.rythmeSoirMin) + MARGE_DE_SOMMEIL_MIN;
  for (let t = debut, k = 0; k <= 25; t += 36e5, k++) {
    const rythme = rythmeA(aCotonou(Math.min(t, fin)).heure, r);
    if (rythme !== null && rythme > plusLong) plusLong = rythme;
    if (t >= fin) break;
  }
  return (plusLong || Math.max(r.rythmeMin, r.rythmeSoirMin)) + MARGE_DE_SOMMEIL_MIN;
}
var heureRondeDite = (h) => h % 24 === 0 ? "minuit" : `${h} h`;
var DECALAGE_COTONOU_MIN = 60;
function aCotonou(ms) {
  const d = new Date(ms + DECALAGE_COTONOU_MIN * 6e4);
  return {
    heure: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    jour: d.getUTCDay(),
    dateISO: d.toISOString().slice(0, 10)
  };
}
function empecheDit(c) {
  if (!c) return null;
  if (c.chrome === false) return "Chrome ne répond pas";
  if (c.lie === false) return "WhatsApp Web délié : le code QR est à l'écran";
  if (c.nonLus === false) return "la liste des non-lus ne se charge pas";
  return null;
}
function etatDe(a, maintenantMs, r = REGLAGES_PAR_DEFAUT) {
  if (!a.aUnJeton) return { etat: "sans-jeton", detail: "aucun jeton : l'assistant n'a jamais été relié" };
  const vu = Date.parse(a.vuLe ?? "");
  if (!Number.isFinite(vu)) return { etat: "endormi", detail: "jamais passé" };
  const ecartMin = Math.floor((maintenantMs - vu) / 6e4);
  if (ecartMin > seuilDeSommeilMin(vu, maintenantMs, r)) {
    return dansLaVeille(aCotonou(maintenantMs).heure, r) ? { etat: "endormi", detail: `endormi depuis ${dureeDite(ecartMin)}` } : { etat: "endormi", detail: `au repos jusqu'à ${heureRondeDite(r.veilleDe)}, comme chaque nuit` };
  }
  const empeche = a.etat?.empeche ?? empecheDit(a.etat?.controles);
  if (empeche) return { etat: "empeche", detail: `empêché : ${empeche}` };
  return { etat: "eveille", detail: `dernier passage il y a ${dureeDite(ecartMin)}` };
}
var dureeDite = (min) => {
  if (min < 1) return "moins d'une minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 48) return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  return `${Math.floor(h / 24)} jours`;
};
var CERCLES = ["cliente", "proche", "famille", "fournisseur", "inconnu"];
var CHOIX_PAR_GENRE = {
  reponse: ["envoyer", "modifier", "non"],
  "place-tenue": ["confirmer", "autre-heure", "non"],
  note: ["envoyer", "modifier", "non"],
  argent: ["envoyer", "modifier", "non"],
  cercle: [...CERCLES],
  /* « Poser et répondre » : la pose et la réponse partent au tour suivant. */
  rdv: ["poser", "autre-heure", "modifier", "non"],
  /* « Valider » : la dépense entre DÉJÀ VALIDÉE au nom du porteur, d'un
     toucher (choix 4 de « Je suis loin ») ; « Corriger » la valide avec les
     faits corrigés sur la carte ; « Non » : ce n'est pas une dépense. */
  depense: ["valider", "corriger", "non"],
  publication: ["publier", "modifier", "non"],
  planning: ["accepter", "modifier", "non"],
  acces: ["accorder", "refuser"]
};
var decisionEnAttente = (d, maintenantMs) => {
  if (d.tranchee) return false;
  const e = Date.parse(d.echeance ?? "");
  return !(Number.isFinite(e) && e <= maintenantMs);
};

// src/shared/maison-intelligente-pur.ts
var PORTEURS = {
  yeman: { prenom: "Yéman", teamId: "st-5qduae5jef" },
  brice: { prenom: "Brice", teamId: "st-d4t24p6inh" }
};
var PROFESSIONNELS = [
  {
    id: "opale",
    nom: "Opale",
    tient: "l'assistante de Yéman",
    departements: ["dept-direction"],
    departementDit: "Direction",
    porteurs: ["yeman"],
    tourne: "session",
    ouDit: "l'ordinateur de Yéman, Chrome",
    statut: "en-ligne",
    chaqueJour: "Lit le WhatsApp de Yéman, propose ses réponses, pose ses rendez-vous et ses dépenses depuis son fil.",
    seul: "Lire, classer, un pouce sur un « Ok ».",
    enCarte: "Chaque réponse, rendez-vous, dépense.",
    quinzaine: "en ligne"
  },
  {
    id: "onyx",
    nom: "Onyx",
    tient: "l'assistant de Brice",
    departements: ["dept-direction"],
    departementDit: "Direction",
    porteurs: ["brice"],
    tourne: "session",
    ouDit: "le Mac de Brice, VS Code",
    statut: "en-installation",
    chaqueJour: "La même chose pour Brice, dans sa voix.",
    seul: "Lire, classer, un pouce sur un « Ok ».",
    enCarte: "Chaque réponse, rendez-vous, dépense.",
    quinzaine: "en installation"
  },
  {
    id: "saphir",
    nom: "Saphir",
    tient: "le conseil",
    departements: ["dept-direction"],
    departementDit: "Direction",
    porteurs: ["yeman", "brice"],
    tourne: "fonction",
    ouDit: "une fonction du Trône, à 7 h",
    statut: "en-ligne",
    chaqueJour: "À 7 h, lit les bilans de tous et écrit le Conseil du matin : une page sur le téléphone.",
    seul: "Lire, résumer, classer, rappeler.",
    enCarte: "Une priorité qui change, un budget qui déborde.",
    quinzaine: "semaines 1 et 2, puis à chaque quinzaine"
  },
  {
    id: "perle",
    nom: "Perle",
    tient: "les clientes",
    departements: ["dept-clientele"],
    departementDit: "Clientèle",
    porteurs: ["yeman"],
    tourne: "fonction",
    ouDit: "les fonctions du WhatsApp de la Maison",
    statut: "en-ligne",
    chaqueJour: "Le WhatsApp de la Maison : réserve, répond, garde les rendez-vous, envies, anniversaires, relances, avis Google, briefing avant le fauteuil.",
    seul: "Modèles approuvés, réponses de la réception, réservation sous verrou.",
    enCarte: "Tout texte libre hors réception, toute remise, toute cliente endormie.",
    quinzaine: "semaines 3 et 4 (lot 3)"
  },
  {
    id: "ambre",
    nom: "Ambre",
    tient: "les réseaux",
    departements: ["dept-marketing"],
    departementDit: "Marketing et Fidélité",
    porteurs: ["yeman"],
    tourne: "machine",
    ouDit: "la machine de la Maison, Chrome",
    statut: "maquette",
    chaqueJour: "Instagram, Facebook, TikTok, LinkedIn, le Journal du site, le référencement du site dans Google et les IA : plan du mardi, publications, réponses aux commentaires, bilan du lundi.",
    seul: "Publier dans le plan validé, répondre aux commentaires.",
    enCarte: "Le plan de la semaine, toute cliente ou enfant, tout argent.",
    quinzaine: "semaines 3 et 4"
  },
  {
    id: "grenat",
    nom: "Grenat",
    tient: "l'argent",
    departements: ["dept-vente-caisse", "dept-finances"],
    departementDit: "Vente et Caisse, Finances",
    porteurs: ["yeman"],
    tourne: "fonction",
    ouDit: "une fonction du Trône",
    statut: "a-construire",
    chaqueJour: "La clôture du soir, les dépenses à valider rangées, les factures en retard relancées, les missions à payer, les écarts de caisse.",
    seul: "Ranger, rapprocher, préparer, relancer par modèle.",
    enCarte: "Tout argent qui sort, tout écart, tout refus.",
    quinzaine: "semaines 5 et 6"
  },
  {
    id: "jade",
    nom: "Jade",
    tient: "le stock",
    departements: ["dept-atelier"],
    departementDit: "Atelier",
    porteurs: ["brice"],
    tourne: "fonction",
    ouDit: "une fonction du Trône",
    statut: "a-construire",
    chaqueJour: "Le stock et le Laboratoire : réassort, bons prêts, achats par photos, fournisseurs à rappeler, inventaire du mois.",
    seul: "Compter, préparer un bon, lire un achat.",
    enCarte: "Envoyer un bon, créer un fournisseur, un écart d'inventaire.",
    quinzaine: "semaines 5 et 6"
  },
  {
    id: "topaze",
    nom: "Topaze",
    tient: "l'équipe",
    departements: ["dept-equipe", "dept-academie"],
    departementDit: "Équipe et Académie",
    porteurs: ["brice"],
    tourne: "fonction",
    ouDit: "une fonction du Trône",
    statut: "a-construire",
    chaqueJour: "Les fauteuils : jours creux et pleins, planning, pointage, congés, préparation de la paie, missions, Académie.",
    seul: "Lire, préparer, rappeler.",
    enCarte: "Un planning changé, une paie, une mission payée, une sanction.",
    quinzaine: "semaines 7 et 8"
  },
  {
    id: "jaspe",
    nom: "Jaspe",
    tient: "le gardien",
    departements: ["dept-systeme"],
    departementDit: "Système",
    porteurs: ["yeman"],
    tourne: "machine",
    ouDit: "la machine de la Maison",
    statut: "a-construire",
    chaqueJour: "Bancs, sauvegardes de nuit, versions des fonctions, conflits de synchro, jetons et accès, publication, crédits.",
    seul: "Vérifier, sauvegarder, publier ce qui est commité et vert.",
    enCarte: "Un accès, un jeton, une clé, une panne.",
    quinzaine: "semaines 7 et 8"
  },
  {
    id: "cristal",
    nom: "Cristal",
    tient: "le secrétariat",
    departements: [],
    departementDit: "à part",
    porteurs: ["yeman"],
    tourne: "session",
    ouDit: "l'ordinateur de Yéman",
    statut: "a-part",
    chaqueJour: "Les papiers de famille, les factures d'eau et d'électricité, les démarches, les mails de services, les lettres de la Maison.",
    seul: "Lire, ranger, préparer.",
    enCarte: "Tout envoi, tout paiement.",
    quinzaine: "en ligne, à part",
    horsDuTrone: true
  }
];
var ID_DES_PROFESSIONNELS = PROFESSIONNELS.map((p) => p.id);
var professionnel = (id) => PROFESSIONNELS.find((p) => p.id === id) ?? null;
var STATUT_DIT = {
  "en-ligne": "en ligne",
  "en-installation": "en installation",
  maquette: "maquette validée",
  "a-construire": "à construire",
  "a-part": "à part, hors du Trône"
};
var passeAuTrone = (p) => p.tourne === "session" && !p.horsDuTrone;
var ENVELOPPE_USD = 200;
var PLAFONDS_PAR_DEFAUT = {
  opale: 0,
  onyx: 0,
  cristal: 5,
  saphir: 15,
  perle: 60,
  ambre: 25,
  grenat: 15,
  jade: 10,
  topaze: 10,
  jaspe: 5
};
var RESERVE = "reserve";
var ALERTE_PAR_DEFAUT = 0.8;
var plafondsComplets = (r) => {
  const plafonds = {};
  for (const p of PROFESSIONNELS) {
    const v = r?.plafonds?.[p.id];
    plafonds[p.id] = typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= ENVELOPPE_USD ? Math.round(v * 100) / 100 : PLAFONDS_PAR_DEFAUT[p.id] ?? 0;
  }
  const somme = Math.round(Object.values(plafonds).reduce((a2, b) => a2 + b, 0) * 100) / 100;
  plafonds[RESERVE] = Math.max(0, Math.round((ENVELOPPE_USD - somme) * 100) / 100);
  const a = r?.alerteA;
  return {
    plafonds,
    alerteA: typeof a === "number" && a >= 0.5 && a <= 1 ? a : ALERTE_PAR_DEFAUT,
    somme,
    depasse: Math.max(0, Math.round((somme - ENVELOPPE_USD) * 100) / 100)
  };
};
var CHANTIER_VERS_PROFESSIONNEL = {
  capture: "grenat",
  recu: "grenat",
  cahier: "perle",
  "reponse-wa": "perle",
  avis: "perle",
  diagnostic: "perle",
  "fiche-du-jour": "perle",
  lettre: "cristal",
  prevision: "saphir",
  question: "saphir",
  processus: "saphir",
  achat: "jade"
};
var COMPTEURS_DU_LIVRE = [
  { cle: "mnd_ia_compteur_huit", parChantier: true, professionnel: RESERVE, dit: "ia-maison" },
  { cle: "mnd_assistant_wa_compte", parChantier: false, professionnel: "perle", dit: "réception WhatsApp" },
  { cle: "mnd_variantes_wa_compte", parChantier: false, professionnel: "perle", dit: "variantes WhatsApp" },
  { cle: "mnd_tri_compte", parChantier: false, professionnel: "perle", dit: "tri des messages" },
  { cle: "mnd_ia_compteur_diagnostic", parChantier: false, professionnel: "perle", dit: "diagnostic photo" },
  { cle: "mnd_ia_compteur", parChantier: false, professionnel: "saphir", dit: "Centre de commande" },
  { cle: "mnd_dictee_compte", parChantier: false, professionnel: RESERVE, dit: "la dictée" }
];
var CLES_DES_COMPTEURS = COMPTEURS_DU_LIVRE.map((c) => c.cle);
var usdDe = (l) => {
  const v = l?.usd;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
};
var appelsDe = (l) => {
  const v = l?.appels;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
};
var arrondi = (v) => Math.round(v * 1e4) / 1e4;
function alerteDe(usd, plafond, alerteA) {
  if (plafond <= 0) return usd > 0 ? "depasse" : "ok";
  if (usd >= plafond) return "depasse";
  if (usd >= plafond * alerteA) return "proche";
  return "ok";
}
function livreDuMois(documents, mois, reglages) {
  const { plafonds, alerteA } = plafondsComplets(reglages);
  const usd = {};
  const appels = {};
  const ajoute = (id, u, a) => {
    usd[id] = (usd[id] ?? 0) + u;
    appels[id] = (appels[id] ?? 0) + a;
  };
  const sans = /* @__PURE__ */ new Set();
  for (const c of COMPTEURS_DU_LIVRE) {
    const doc = documents[c.cle] ?? null;
    if (!doc || typeof doc !== "object") continue;
    const ligne = doc[mois];
    if (!c.parChantier) {
      ajoute(c.professionnel, usdDe(ligne), appelsDe(ligne));
      continue;
    }
    const detail = doc.parChantier?.[mois] ?? {};
    let usdDetaille = 0;
    let appelsDetailles = 0;
    for (const [chantier, l] of Object.entries(detail)) {
      const id = CHANTIER_VERS_PROFESSIONNEL[chantier];
      if (!id) sans.add(chantier);
      ajoute(id ?? RESERVE, usdDe(l), appelsDe(l));
      usdDetaille += usdDe(l);
      appelsDetailles += appelsDe(l);
    }
    ajoute(RESERVE, Math.max(0, usdDe(ligne) - usdDetaille), Math.max(0, appelsDe(ligne) - appelsDetailles));
  }
  const lignes = [...PROFESSIONNELS.map((p) => ({ id: p.id, nom: p.nom })), { id: RESERVE, nom: "La réserve" }].map(({ id, nom }) => {
    const u = arrondi(usd[id] ?? 0);
    const plafond = plafonds[id] ?? 0;
    return { id, nom, usd: u, appels: appels[id] ?? 0, plafond, part: plafond > 0 ? Math.round(u / plafond * 1e3) / 1e3 : null, alerte: alerteDe(u, plafond, alerteA) };
  });
  const totalUsd = arrondi(lignes.reduce((a, l) => a + l.usd, 0));
  const partDeLEnveloppe = Math.round(totalUsd / ENVELOPPE_USD * 1e3) / 1e3;
  return {
    mois,
    lignes,
    totalUsd,
    enveloppeUsd: ENVELOPPE_USD,
    partDeLEnveloppe,
    alerte: alerteDe(totalUsd, ENVELOPPE_USD, alerteA),
    chantiersSansProfessionnel: [...sans].sort()
  };
}
var moisDeCotonou = (ms) => new Date(ms + 60 * 6e4).toISOString().slice(0, 7);
var dollarsDits = (usd) => `${usd < 10 ? usd.toFixed(2).replace(".", ",") : String(Math.round(usd))} $`;

// src/shared/conseil-du-matin-pur.ts
var VERSION_DU_CONSEIL = "2026-11-02-a";
var PRESSE_AU_PLUS = 5;
var CARTE_ANCIENNE_H = 24;
var LACUNES_DITES = {
  assistants: "le registre des professionnels",
  cartes: "les cartes",
  relais: "les relais",
  bilans: "les bilans",
  journal: "le journal",
  rdv: "les rendez-vous du jour",
  equipe: "l'équipe",
  depenses: "les dépenses",
  taches: "les tâches de la nuit",
  compteurs: "les compteurs de crédits",
  actives: "les clientes actives",
  reglages: "les réglages"
};
var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function jourDit(jourISO) {
  const d = /* @__PURE__ */ new Date(`${jourISO}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return jourISO;
  const j = d.getUTCDate();
  return `${JOURS[d.getUTCDay()]} ${j === 1 ? "1er" : j} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function dateDite(jourISO) {
  const d = /* @__PURE__ */ new Date(`${jourISO}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return jourISO;
  const j = d.getUTCDate();
  return `${j === 1 ? "1er" : j} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
var moisDit = (mois) => {
  const [a, m] = mois.split("-").map(Number);
  return Number.isFinite(a) && m >= 1 && m <= 12 ? `${MOIS[m - 1]} ${a}` : mois;
};
var pluriel = (n, un, plusieurs) => n > 1 ? plusieurs : un;
var nombreDit = (n, un, plusieurs) => `${n} ${pluriel(n, un, plusieurs)}`;
var capitale = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
var de = (nom) => /^[aeiouyhàâéèêîôûAEIOUYHÀÂÉÈÊÎÔÛ]/.test(nom) ? `d'${nom}` : `de ${nom}`;
function heureDite(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return mi ? `${h} h ${String(mi).padStart(2, "0")}` : `${h} h`;
}
function prenomPropre(nom) {
  const p = String(nom ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}][\p{L}'-]{0,19}$/u.test(p) ? p : null;
}
function tacheDite(t) {
  const s = String(t ?? "").trim();
  if (!s || s.length > 60 || /\d{5,}/.test(s.replace(/[\s_-]/g, "")) || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(s)) return "une tâche du serveur";
  return `la tâche « ${s} »`;
}
var entier = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
var nomDe = (id) => professionnel(id)?.nom ?? null;
function pointsQuiPressent(f, maintenantMs, livre) {
  const points = [];
  const r = reglagesComplets(f.reglagesAssistants ?? null);
  const heure = aCotonou(maintenantMs).heure;
  const manquees = [...new Set((f.lacunes ?? []).map((l) => LACUNES_DITES[l]).filter(Boolean))];
  if (manquees.length) points.push({ rang: 0, ton: "alerte", texte: `Saphir n'a pas pu lire ${manquees.join(", ")} ce matin : la page est incomplète.` });
  for (const t of f.tachesEnEchec ?? []) {
    const n = entier(t.echecs);
    if (n === 0) continue;
    points.push({ rang: 1, ton: "alerte", texte: `${capitale(tacheDite(t.tache))} a échoué ${n === 1 ? "une fois" : `${n} fois`} depuis hier matin.` });
  }
  for (const p of PROFESSIONNELS) {
    if (!passeAuTrone(p)) continue;
    const a = (f.assistants ?? []).find((x) => x.id === p.id);
    if (!a || !a.aUnJeton) continue;
    const e = etatDe({ aUnJeton: a.aUnJeton, vuLe: a.vuLe ?? null, etat: a.etat ?? {} }, maintenantMs, r);
    if (e.etat === "empeche") points.push({ rang: 2, ton: "alerte", texte: `${p.nom} est ${e.detail}.` });
    else if (e.etat === "endormi" && dansLaVeille(heure, r)) {
      points.push({ rang: 2, ton: "alerte", texte: e.detail.startsWith("endormi depuis ") ? `${p.nom} dort ${e.detail.slice("endormi ".length)}.` : `${p.nom} dort : ${e.detail}.` });
    }
  }
  const vieilles = /* @__PURE__ */ new Map();
  for (const c of f.cartes ?? []) {
    if (!decisionEnAttente({ tranchee: c.tranchee ?? null, echeance: c.echeance ?? null }, maintenantMs)) continue;
    const ne = Date.parse(c.creeLe);
    if (!Number.isFinite(ne) || maintenantMs - ne < CARTE_ANCIENNE_H * 36e5) continue;
    const qui = nomDe(c.assistant) ?? "un professionnel";
    vieilles.set(qui, (vieilles.get(qui) ?? 0) + 1);
  }
  for (const [qui, n] of vieilles) {
    points.push({ rang: 3, ton: "attention", texte: `${n === 1 ? "Une carte attend" : `${n} cartes attendent`} depuis plus d'un jour chez ${qui}.` });
  }
  if (livre.alerte !== "ok") {
    points.push({
      rang: 4,
      ton: livre.alerte === "depasse" ? "alerte" : "attention",
      texte: `Les crédits de la Maison : ${dollarsDits(livre.totalUsd)} sur ${livre.enveloppeUsd} $ en ${moisDit(livre.mois)}.`
    });
  }
  for (const l of livre.lignes) {
    if (l.alerte === "ok") continue;
    points.push({
      rang: 4,
      ton: l.alerte === "depasse" ? "alerte" : "attention",
      texte: l.alerte === "depasse" ? `${l.nom} a dépassé son plafond : ${dollarsDits(l.usd)} sur ${dollarsDits(l.plafond)}.` : `${l.nom} approche de son plafond : ${dollarsDits(l.usd)} sur ${dollarsDits(l.plafond)}.`
    });
  }
  const dep = entier(f.depensesAValider);
  if (dep > 0) points.push({ rang: 5, ton: "attention", texte: dep === 1 ? "Une dépense attend sa validation." : `${dep} dépenses attendent leur validation.` });
  const places = (f.cartes ?? []).filter((c) => c.genre === "place-tenue" && decisionEnAttente({ tranchee: c.tranchee ?? null, echeance: c.echeance ?? null }, maintenantMs)).length;
  if (places > 0) points.push({ rang: 6, ton: "attention", texte: `${places === 1 ? "Une place tenue attend" : `${places} places tenues attendent`} une réponse.` });
  return points.sort((a, b) => a.rang - b.rang);
}
var PORTES_DITES = {
  trone: "au Trône",
  assistant: "par les assistants",
  couronne: "depuis Ma Couronne",
  automate: "par l'automate WhatsApp",
  serveur: "par le serveur",
  site: "depuis le site",
  comptoir: "au comptoir"
};
function hier(f, jour, jourDHier) {
  const lignes = [];
  const parPorte = /* @__PURE__ */ new Map();
  for (const [porte, n] of Object.entries(f.gestesHier ?? {})) {
    const c = entier(n);
    if (!c) continue;
    const dite = PORTES_DITES[porte] ?? "ailleurs";
    parPorte.set(dite, (parPorte.get(dite) ?? 0) + c);
  }
  const total = [...parPorte.values()].reduce((a, b) => a + b, 0);
  if (total === 0) lignes.push("Hier, aucun geste au journal.");
  else {
    const detail = [...parPorte.entries()].sort((a, b) => b[1] - a[1]).map(([dite, n]) => `${n} ${dite}`).join(", ");
    lignes.push(`Hier, ${nombreDit(total, "geste", "gestes")} au journal : ${detail}.`);
  }
  const COMPTES_DITS = [
    ["lus", "lu", "lus"],
    ["repondus", "réponse", "réponses"],
    ["pouces", "pouce", "pouces"],
    ["rdvPoses", "rendez-vous posé", "rendez-vous posés"],
    ["depenses", "dépense", "dépenses"],
    ["cartes", "carte", "cartes"],
    ["relais", "relais", "relais"],
    ["publications", "publication", "publications"]
  ];
  const parQui = /* @__PURE__ */ new Map();
  for (const b of f.bilans ?? []) {
    if (b.jour !== jour && b.jour !== jourDHier) continue;
    if (!nomDe(b.assistant)) continue;
    const deja = parQui.get(b.assistant);
    if (!deja || String(b.jour) > String(deja.jour)) parQui.set(b.assistant, b);
  }
  for (const [id, b] of parQui) {
    const comptes = b.comptes ?? {};
    const parts = COMPTES_DITS.map(([k, un, plusieurs]) => [entier(comptes[k]), un, plusieurs]).filter(([n]) => n > 0).map(([n, un, plusieurs]) => nombreDit(n, un, plusieurs));
    lignes.push(`Le bilan ${de(nomDe(id))} : ${parts.length ? parts.join(", ") : "rien à compter"}.`);
  }
  const relies = PROFESSIONNELS.filter((p) => passeAuTrone(p) && (f.assistants ?? []).some((a) => a.id === p.id && a.aUnJeton));
  if (relies.length && parQui.size === 0) lignes.push("Aucun bilan déposé ce matin.");
  const rh = entier(f.relais?.hier);
  const rt = entier(f.relais?.aTraiter);
  if (rh === 0 && rt === 0) lignes.push("Aucun relais hier.");
  else lignes.push(`${capitale(nombreDit(rh, "relais", "relais"))} entre professionnels hier${rt ? `, ${rt} encore à traiter` : ""}.`);
  return lignes;
}
function aujourdhui(f) {
  const rdvs = (f.rdvDuJour ?? []).filter((r) => String(r.status ?? "") !== "annulé");
  if (rdvs.length === 0) return ["Aucun rendez-vous aujourd'hui."];
  const heures = rdvs.map((r) => String(r.time ?? "")).filter((t) => heureDite(t)).sort();
  const premiere = heures.length ? heureDite(heures[0]) : null;
  const lignes = [`${capitale(nombreDit(rdvs.length, "rendez-vous", "rendez-vous"))} aujourd'hui${premiere ? `, le premier à ${premiere}` : ""}.`];
  const parFauteuil = /* @__PURE__ */ new Map();
  for (const r of rdvs) {
    const p = prenomPropre(f.equipe?.[String(r.master ?? "")]) ?? "sans maître nommé";
    parFauteuil.set(p, (parFauteuil.get(p) ?? 0) + 1);
  }
  lignes.push(`Par fauteuil : ${[...parFauteuil.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p, n]) => `${p} ${n}`).join(", ")}.`);
  return lignes;
}
function lesDix(f, maintenantMs) {
  const r = reglagesComplets(f.reglagesAssistants ?? null);
  return PROFESSIONNELS.map((p) => {
    const porteurs = p.porteurs.map((k) => PORTEURS[k].prenom).join(" et ");
    const base = { id: p.id, nom: p.nom, tient: p.tient, porteurs };
    if (passeAuTrone(p)) {
      const a = (f.assistants ?? []).find((x) => x.id === p.id);
      if (!a || !a.aUnJeton) return { ...base, dit: "Pas encore relié au Trône.", ton: "calme" };
      const e = etatDe({ aUnJeton: true, vuLe: a.vuLe ?? null, etat: a.etat ?? {} }, maintenantMs, r);
      const loin = a.loinDepuis && Number.isFinite(Date.parse(a.loinDepuis)) ? " Mode « Je suis loin »." : "";
      if (e.etat === "eveille") return { ...base, dit: `En veille, ${e.detail}.${loin}`, ton: "ok" };
      const alerte = e.etat === "empeche" || dansLaVeille(aCotonou(maintenantMs).heure, r);
      return { ...base, dit: `${capitale(e.detail)}.${loin}`, ton: alerte ? "alerte" : "calme" };
    }
    return { ...base, dit: `${capitale(STATUT_DIT[p.statut])}, ${p.ouDit}.`, ton: p.statut === "en-ligne" ? "ok" : "calme" };
  });
}
function lundi(f, jour) {
  if (typeof f.actives90 !== "number" || !Number.isFinite(f.actives90) || f.actives90 < 0) return null;
  const n = Math.round(f.actives90);
  const c = f.conseil?.actives90;
  const depart = typeof c?.depart === "number" && Number.isFinite(c.depart) && c.depart >= 0 ? Math.round(c.depart) : null;
  const cibles = (Array.isArray(c?.cibles) ? c.cibles : []).filter((x) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.le)) && typeof x.valeur === "number" && Number.isFinite(x.valeur) && x.valeur > 0).sort((a, b) => a.le.localeCompare(b.le));
  const cible = cibles.find((x) => x.le >= jour) ?? null;
  let dit = `Le chiffre du lundi : ${nombreDit(n, "cliente active", "clientes actives")} à 90 jours.`;
  if (depart !== null) dit += ` Au départ : ${depart}.`;
  if (cible) dit += ` Cible au ${dateDite(cible.le)} : ${Math.round(cible.valeur)}.`;
  return { actives90: n, dit };
}
function ecrisLeConseil(f, maintenantMs) {
  const c = aCotonou(maintenantMs);
  const jour = c.dateISO;
  const jourDHier = aCotonou(maintenantMs - 864e5).dateISO;
  const livre = livreDuMois(f.compteurs ?? {}, moisDeCotonou(maintenantMs), f.livre ?? null);
  const points = pointsQuiPressent(f, maintenantMs, livre);
  const presse = points.slice(0, PRESSE_AU_PLUS).map(({ texte, ton }) => ({ texte, ton }));
  if (points.length > PRESSE_AU_PLUS) {
    const reste = points.length - (PRESSE_AU_PLUS - 1);
    presse[PRESSE_AU_PLUS - 1] = { texte: `Et ${reste} autres points, dans Les assistants.`, ton: "attention" };
  }
  const alertes = livre.lignes.filter((l) => l.alerte !== "ok").map((l) => `${l.nom} : ${dollarsDits(l.usd)} sur ${dollarsDits(l.plafond)}.`);
  const part = Math.round(livre.partDeLEnveloppe * 100);
  const n = points.length;
  return {
    jour,
    titre: "Le Conseil du matin",
    jourDit: jourDit(jour),
    ecritLe: new Date(maintenantMs).toISOString(),
    version: VERSION_DU_CONSEIL,
    presse,
    pressentEnTout: n,
    hier: hier(f, jour, jourDHier),
    aujourdhui: aujourdhui(f),
    dix: lesDix(f, maintenantMs),
    credits: {
      mois: livre.mois,
      totalUsd: livre.totalUsd,
      enveloppeUsd: livre.enveloppeUsd,
      dit: `${capitale(moisDit(livre.mois))} : ${dollarsDits(livre.totalUsd)} sur ${livre.enveloppeUsd} $ (${part} %).`,
      alertes
    },
    lundi: c.jour === 1 ? lundi(f, jour) : null,
    revue: jour.endsWith("-01") ? "La revue du mois, aujourd'hui, à deux : trente minutes avec Saphir." : null,
    notification: {
      titre: "Le Conseil du matin",
      corps: n === 0 ? "Rien ne presse ce matin. La page vous attend dans Les assistants." : n === 1 ? "Un point presse ce matin." : `${n} points pressent ce matin.`
    }
  };
}

// scripts/serveur/conseil-du-matin.ts
var VERSION = "2026-11-02-b";
var ADRESSE = "/trone/#/assistants";
var ETIQUETTE = "mnd-conseil";
var ENVOI_MAX_MS = 8e3;
var PAGE = 1e3;
var PAGES_AU_PLUS = 20;
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
var json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, "content-type": "application/json" } });
var dis = (quoi, plus = {}) => console.log(JSON.stringify({ fonction: "conseil-du-matin", quoi, ...plus }));
var minuitDe = (jourISO) => new Date(Date.parse(`${jourISO}T00:00:00Z`) - 60 * 6e4).toISOString();
var moinsDesJours = (jourISO, n) => new Date(Date.parse(`${jourISO}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
async function parPages(requete) {
  const tout = [];
  for (let i = 0; i < PAGES_AU_PLUS; i += 1) {
    const { data, error } = await requete(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw new Error(String(error?.message ?? error));
    const lot = data ?? [];
    tout.push(...lot);
    if (lot.length < PAGE) break;
  }
  return tout;
}
async function litLesFaits(sb, maintenantMs) {
  const lacunes = [];
  const essaie = async (cle, defaut, f) => {
    try {
      return await f();
    } catch (e) {
      lacunes.push(cle);
      dis("lecture manquée", { cle, motif: String(e?.message ?? e).slice(0, 80) });
      return defaut;
    }
  };
  const c = aCotonou(maintenantMs);
  const jour = c.dateISO;
  const hier2 = aCotonou(maintenantMs - 864e5).dateISO;
  const debutHier = minuitDe(hier2);
  const debutJour = minuitDe(jour);
  const maintenant = new Date(maintenantMs).toISOString();
  const documents = await essaie("compteurs", {}, async () => {
    const { data, error } = await sb.from("documents").select("key, data").in("key", ["mnd_settings", ...CLES_DES_COMPTEURS]);
    if (error) throw new Error(error.message);
    return Object.fromEntries((data ?? []).map((d) => [String(d.key), d.data ?? null]));
  });
  const reglages = documents.mnd_settings ?? {};
  const compteurs = Object.fromEntries(CLES_DES_COMPTEURS.map((k) => [k, documents[k] ?? null]));
  const [assistants, cartes, relaisHier, relaisATraiter, bilans, gestes, rdvs, equipe, depenses, taches] = await Promise.all([
    essaie("assistants", [], async () => {
      const { data, error } = await sb.from("assistants").select("*").order("id");
      if (error) throw new Error(error.message);
      return (data ?? []).map((a) => ({
        id: String(a.id),
        nom: typeof a.nom === "string" ? a.nom : null,
        aUnJeton: !!a.empreinte,
        vuLe: a.vu_le ?? null,
        etat: a.etat ?? {},
        loinDepuis: a.loin_depuis ?? null
      }));
    }),
    essaie("cartes", [], async () => (await parPages((de2, a) => sb.from("assistants_decisions").select("id, assistant, genre, cree_le, echeance, tranchee").is("tranchee", null).order("id").range(de2, a))).map((d) => ({ assistant: String(d.assistant), genre: String(d.genre), creeLe: String(d.cree_le), echeance: d.echeance ?? null, tranchee: null }))),
    essaie("relais", 0, async () => (await parPages((de2, a) => sb.from("assistants_relais").select("id").gte("quand", debutHier).lt("quand", debutJour).order("id").range(de2, a))).length),
    essaie("relais", 0, async () => (await parPages((de2, a) => sb.from("assistants_relais").select("id, perime_le").is("traite_le", null).order("id").range(de2, a))).filter((r) => !r.perime_le || String(r.perime_le) > maintenant).length),
    essaie("bilans", [], async () => {
      const { data, error } = await sb.from("assistants_bilans").select("assistant, jour, comptes").in("jour", [hier2, jour]);
      if (error) throw new Error(error.message);
      return (data ?? []).map((b) => ({ assistant: String(b.assistant), jour: String(b.jour).slice(0, 10), comptes: b.comptes ?? {} }));
    }),
    essaie("journal", {}, async () => {
      const lignes = await parPages((de2, a) => sb.from("journal_gestes").select("id, data").gte("data->>quand", debutHier).lt("data->>quand", debutJour).order("id").range(de2, a));
      const parPorte = {};
      for (const g of lignes) {
        const p = String(g.data?.porte ?? "trone");
        parPorte[p] = (parPorte[p] ?? 0) + 1;
      }
      return parPorte;
    }),
    essaie("rdv", [], async () => (await parPages((de2, a) => sb.from("appointments").select("id, data").eq("data->>date", jour).order("id").range(de2, a))).map((r) => ({ time: r.data?.time, master: r.data?.master, status: r.data?.status }))),
    essaie("equipe", {}, async () => Object.fromEntries((await parPages((de2, a) => sb.from("team").select("id, data").order("id").range(de2, a))).map((t) => [String(t.id), String(t.data?.name ?? "")]))),
    essaie("depenses", 0, async () => (await parPages((de2, a) => sb.from("expenses").select("id").eq("data->validation->>etat", "attente").order("id").range(de2, a))).length),
    essaie("taches", [], async () => {
      const { data, error } = await sb.rpc("conseil_taches_en_echec", { depuis: new Date(maintenantMs - 864e5).toISOString() });
      if (error) throw new Error(error.message);
      return (data ?? []).map((t) => ({ tache: t.tache, echecs: t.echecs }));
    })
  ]);
  let actives90 = null;
  if (c.jour === 1) {
    actives90 = await essaie("actives", null, async () => {
      const lignes = await parPages((de2, a) => sb.from("appointments").select("id, data").eq("data->>status", "honoré").gt("data->>date", moinsDesJours(jour, 90)).lte("data->>date", jour).order("id").range(de2, a));
      return new Set(lignes.map((r) => String(r.data?.clientId ?? "")).filter(Boolean)).size;
    });
  }
  return {
    assistants,
    cartes,
    relais: { hier: relaisHier, aTraiter: relaisATraiter },
    bilans,
    gestesHier: gestes,
    rdvDuJour: rdvs,
    equipe,
    depensesAValider: depenses,
    tachesEnEchec: taches,
    compteurs,
    reglagesAssistants: reglages.assistants ?? null,
    livre: reglages.livreDesCredits ?? null,
    conseil: reglages.conseil ?? null,
    actives90,
    lacunes: [...new Set(lacunes)]
  };
}
async function notifieLesSouverains(sb, url, service, page) {
  const { data } = await sb.from("staff").select("user_id").eq("role", "souverain");
  const ids = [...new Set((data ?? []).map((s) => String(s.user_id ?? "")).filter(Boolean))];
  let envoyes = 0;
  for (const userId of ids) {
    try {
      const r = await fetch(`${url}/functions/v1/push-notify`, {
        method: "POST",
        signal: AbortSignal.timeout(ENVOI_MAX_MS),
        headers: { "content-type": "application/json", authorization: `Bearer ${service}` },
        body: JSON.stringify({ mode: "to-staff", userId, title: page.notification.titre, body: page.notification.corps, url: ADRESSE, tag: ETIQUETTE })
      });
      const lu = await r.json().catch(() => ({}));
      envoyes += Number(lu.sent ?? 0) || 0;
    } catch (e) {
      dis("notification en échec", { motif: String(e?.message ?? e).slice(0, 80) });
    }
  }
  return envoyes;
}
async function laPorte(sb, req, service) {
  const cle = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!cle) return null;
  if (service && cle === service) return "cron";
  const { data: lu } = await sb.auth.getUser(cle);
  const uid = lu?.user?.id;
  if (!uid) return null;
  const { data: staff } = await sb.from("staff").select("user_id, role").eq("user_id", uid).eq("role", "souverain").maybeSingle();
  return staff ? "souverain" : null;
}
async function laSourceDuCorps(req) {
  try {
    const d = await req.clone().json();
    return typeof d?.source === "string" ? d.source : "";
  } catch {
    return "";
  }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ ok: true, fonction: "conseil-du-matin", version: VERSION });
  if (req.method !== "POST") return json({ ok: false, motif: "POST seulement", version: VERSION }, 405);
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const service = (Deno.env.get("CLE_SERVICE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !service) return json({ ok: false, motif: "environnement", version: VERSION }, 500);
  const sb = createClient(url, service);
  try {
    const porte = await laPorte(sb, req, service);
    if (!porte) return json({ ok: false, motif: "reserve-au-cron-et-aux-souverains", version: VERSION }, 403);
    const source = porte === "cron" && await laSourceDuCorps(req) === "essai" ? "essai" : porte;
    const maintenantMs = Date.now();
    const faits = await litLesFaits(sb, maintenantMs);
    const page = ecrisLeConseil(faits, maintenantMs);
    const { data: avant } = await sb.from("conseil_du_matin").select("page").eq("jour", page.jour).maybeSingle();
    let notifieLe = (avant?.page ?? null)?.notifieLe ?? null;
    let notifies = 0;
    if (source === "cron" && !notifieLe) {
      notifies = await notifieLesSouverains(sb, url, service, page);
      notifieLe = new Date(maintenantMs).toISOString();
    }
    const ecrite = { ...page, notifieLe };
    const { error } = await sb.from("conseil_du_matin").upsert(
      { jour: page.jour, page: ecrite, version: VERSION, ecrit_le: page.ecritLe },
      { onConflict: "jour" }
    );
    if (error) {
      dis("page non écrite", { motif: String(error.message ?? "").slice(0, 80) });
      return json({ ok: false, motif: "ecriture", version: VERSION }, 500);
    }
    dis("page écrite", { jour: page.jour, source, pressent: page.pressentEnTout, notifies, lacunes: faits.lacunes ?? [] });
    return json({ ok: true, version: VERSION, jour: page.jour, source, pressent: page.pressentEnTout, notifies, lacunes: faits.lacunes ?? [] });
  } catch (e) {
    dis("erreur", { motif: String(e?.message ?? e).slice(0, 120) });
    return json({ ok: false, motif: "erreur", version: VERSION }, 500);
  }
});
