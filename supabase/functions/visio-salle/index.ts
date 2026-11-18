// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   VISIO-SALLE : la visio gratuite de quinze minutes (la Consultation,
   lot 3). Les créneaux, la réservation, l'entrée par le lien de la
   cliente ou par la session de l'équipe, et la salle qui se ferme
   d'elle-même à la fin du créneau (Daily, `exp` + `eject_at_room_exp`).

   Fichier fabriqué par `node scripts/visio-salle-serveur.mjs` depuis
   `scripts/serveur/visio-salle.ts` et `src/shared/visio-pur.ts` : on ne
   le corrige jamais ici, on corrige le dépôt et on refait le fichier.

   AUCUN SECRET ICI : SUPABASE_URL, CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   et DAILY_API_KEY viennent de l'environnement. Sans DAILY_API_KEY, la
   visio reste fermée et le site ne la propose pas.

   Déploiement : `node scripts/mise-en-ligne.mjs fonction visio-salle
   --commit <sha> --jwt non` (la porte est jugée ici : le jeton du lien, ou
   la session d'un membre de l'équipe). Vérifier : son adresse répond sa version.
   ═══════════════════════════════════════════════════════════════════ */
// scripts/serveur/visio-salle.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// src/shared/lien-reservation.ts
var ID_SUR = /^[A-Za-z0-9_-]{1,80}$/;
var IDENTITE_SURE = /^[A-Za-z0-9_-]{1,80}~\d{8}~[A-Za-z0-9_-]{22}$/;
function jetonDuLien(l) {
  const gestes = l.gestes.filter((g) => /^[A-Za-z0-9_-]{1,80}$/.test(g));
  const calibre = l.calibre && ID_SUR.test(l.calibre) ? l.calibre : "";
  const identite = l.identite && IDENTITE_SURE.test(l.identite) ? l.identite : "";
  const segments = identite ? [l.besoin, gestes.join("~"), calibre, identite] : [l.besoin, gestes.join("~"), calibre];
  return segments.join(".").replace(/\.$/, "");
}

// src/shared/visio-pur.ts
var DUREE_MIN = 15;
var AVANT_L_ENTREE_MIN = 5;
var DECALAGE_DE_COTONOU_MS = 60 * 6e4;
var REGLAGES_DE_DEPART = () => ({
  version: 1,
  actif: false,
  jours: [2, 3, 4, 5, 6],
  heures: ["10:00", "10:15", "10:30", "10:45"],
  horizonJours: 7,
  delaiMin: 120,
  parTelephone: 1,
  limiteJours: 90,
  changementAvantMin: 120,
  changementsMax: 2,
  auCarnet: false,
  priveeDureeMin: 60
});
var HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;
var entier = (x, min, max, defaut) => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
};
function reglagesSurs(x) {
  const d = REGLAGES_DE_DEPART();
  if (!x || typeof x !== "object") return d;
  const o = x;
  const jours = Array.isArray(o.jours) ? [...new Set(o.jours.map((j) => Math.round(Number(j))).filter((j) => j >= 1 && j <= 7))].sort((a, b) => a - b) : d.jours;
  const heures = Array.isArray(o.heures) ? [...new Set(o.heures.map(String).filter((h) => HEURE.test(h)))].sort() : d.heures;
  return {
    version: 1,
    actif: o.actif === true,
    jours,
    heures: heures.slice(0, 48),
    horizonJours: entier(o.horizonJours, 1, 30, d.horizonJours),
    delaiMin: entier(o.delaiMin, 0, 2880, d.delaiMin),
    parTelephone: entier(o.parTelephone, 1, 5, d.parTelephone),
    limiteJours: entier(o.limiteJours, 0, 365, d.limiteJours),
    changementAvantMin: entier(o.changementAvantMin, 0, 2880, d.changementAvantMin),
    changementsMax: entier(o.changementsMax, 0, 5, d.changementsMax),
    auCarnet: o.auCarnet === true,
    priveeDureeMin: entier(o.priveeDureeMin, 15, 240, d.priveeDureeMin),
    ...typeof o.modifieLe === "string" ? { modifieLe: o.modifieLe } : {},
    ...typeof o.modifiePar === "string" ? { modifiePar: o.modifiePar } : {}
  };
}
var jourDeCotonou = (ms) => new Date(ms + DECALAGE_DE_COTONOU_MS).toISOString().slice(0, 10);
var instantDeCotonou = (jour, hhmm) => new Date(Date.parse(`${jour}T${hhmm}:00.000Z`) - DECALAGE_DE_COTONOU_MS).toISOString();
var jourDeLaSemaine = (jour) => {
  const j = (/* @__PURE__ */ new Date(`${jour}T12:00:00Z`)).getUTCDay();
  return j === 0 ? 7 : j;
};
var plusDesJours = (jour, n) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
var finDe = (debut) => new Date(Date.parse(debut) + DUREE_MIN * 6e4).toISOString();
function creneauxOuverts(r, maintenantMs, pris) {
  const prisMs = new Set(pris.map((p) => Date.parse(p)));
  const premier = maintenantMs + r.delaiMin * 6e4;
  const aujourdhui = jourDeCotonou(maintenantMs);
  const tous = [];
  for (let i = 0; i < r.horizonJours; i += 1) {
    const jour = plusDesJours(aujourdhui, i);
    if (!r.jours.includes(jourDeLaSemaine(jour))) continue;
    for (const h of r.heures) {
      const debut = instantDeCotonou(jour, h);
      const ms = Date.parse(debut);
      if (ms < premier || prisMs.has(ms)) continue;
      tous.push({ debut, fin: finDe(debut) });
    }
  }
  return tous;
}
var creneauValide = (r, maintenantMs, pris, debut) => creneauxOuverts(r, maintenantMs, pris).some((c) => Date.parse(c.debut) === Date.parse(debut));
var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
var heureDite = (iso) => new Date(Date.parse(iso) + DECALAGE_DE_COTONOU_MS).toISOString().slice(11, 16);
function jourDit(jour) {
  const d = /* @__PURE__ */ new Date(`${jour}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
var creneauDit = (debut) => `${jourDit(jourDeCotonou(Date.parse(debut)))} · ${heureDite(debut)}`;
var FORME_DE_L_ID = /^vz-[a-z0-9]{6,24}$/;
var FORME_DU_JETON = /^[A-Za-z0-9_-]{32}$/;
var FORME_DE_LA_CONSULTATION = /^[A-Za-z0-9_-]{1,80}$/;
var cheminDeLaSalle = (id, jeton) => `/couronne/#/visio/${id}.${jeton}`;
var numeroCourt = (tel) => String(tel ?? "").replace(/\D/g, "").slice(-8);
var UN_JOUR_MS = 864e5;
function annuleeATemps(v, avantMin) {
  if (v.statut !== "annulée") return false;
  if (v.annuleePar === "maison") return true;
  const le = Date.parse(String(v.annuleeLe ?? ""));
  if (!Number.isFinite(le)) return true;
  return le <= Date.parse(v.debut) - avantMin * 6e4;
}
var comptePourLaLimite = (v, r) => v.statut !== "annulée" || !annuleeATemps(v, r.changementAvantMin);
function limiteDe(visios, r, maintenantMs) {
  const enCours = (v) => v.statut === "réservée" && Date.parse(v.debut) + DUREE_MIN * 6e4 >= maintenantMs;
  const aVenir = visios.some(enCours);
  if (r.limiteJours <= 0) {
    return visios.filter(enCours).length >= r.parTelephone ? { ok: false, prochaineLe: "", aVenir: true } : { ok: true };
  }
  const depuis = maintenantMs - r.limiteJours * UN_JOUR_MS;
  const comptees = visios.filter((v) => comptePourLaLimite(v, r) && Date.parse(v.debut) > depuis).map((v) => Date.parse(v.debut)).sort((a, b) => b - a);
  if (comptees.length < r.parTelephone) return { ok: true };
  return { ok: false, prochaineLe: jourDeCotonou(comptees[r.parTelephone - 1] + r.limiteJours * UN_JOUR_MS), aVenir };
}
function changementPermis(v, r, maintenantMs, parLaMaison = false) {
  if (v.statut !== "réservée") return "pas-reservee";
  const debutMs = Date.parse(v.debut);
  if (parLaMaison) return maintenantMs < debutMs ? "permis" : "trop-tard";
  if (maintenantMs > debutMs - r.changementAvantMin * 6e4) return "trop-tard";
  if ((v.deplacements ?? 0) >= r.changementsMax) return "trop-de-fois";
  return "permis";
}
var changementsRestants = (v, r) => Math.max(0, r.changementsMax - (v.deplacements ?? 0));
var creneauDuChangement = (r, maintenantMs, pris, debut, parLaMaison = false) => creneauValide(parLaMaison ? { ...r, delaiMin: 0 } : r, maintenantMs, pris, debut);
var nomDeLaSalle = (id, debut) => `mnd-${id}-${Math.floor(Date.parse(debut) / 6e4).toString(36)}`;
var NIVEAUX = [
  { id: "aucune", dit: "Pas de réparation" },
  { id: "douce", dit: "Douce" },
  { id: "essentielle", dit: "Essentielle" },
  { id: "intensive", dit: "Intensive" },
  { id: "alala", dit: "ÀLÀLÀ™" }
];
var LONGUEURS = [
  { id: "courte", dit: "Courte" },
  { id: "mi-longue", dit: "Mi-longue" },
  { id: "longue", dit: "Longue" }
];
var SUITES = [
  { id: "privee", dit: "Consultation privée", pourElle: "La consultation privée, à la Maison : locks témoins faites devant vous et devis ferme." },
  { id: "devis", dit: "Devis", pourElle: "Votre devis arrive dans votre espace : il ne reste qu’à le valider." },
  { id: "soins", dit: "Soins", pourElle: "Des soins suffisent : réservez votre rituel quand vous le souhaitez." }
];
var priveeObligatoire = (n) => n === "intensive" || n === "alala";
var suiteRetenue = (r) => priveeObligatoire(r.niveau) ? "privee" : r.suite;
var dans = (x, l) => l.some((v) => v.id === x) ? x : void 0;
var ID_DE_PRESTATION = /^[A-Za-z0-9_-]{1,80}$/;
var RITUEL_AU_PLUS = 6;
function rituelSur(x) {
  if (!x || typeof x !== "object") return null;
  const o = x;
  const ids = Array.isArray(o.serviceIds) ? o.serviceIds : [];
  const noms = Array.isArray(o.noms) ? o.noms : [];
  const serviceIds = [];
  const dits = [];
  ids.forEach((id, i) => {
    if (typeof id !== "string" || !ID_DE_PRESTATION.test(id) || serviceIds.includes(id) || serviceIds.length >= RITUEL_AU_PLUS) return;
    serviceIds.push(id);
    dits.push(typeof noms[i] === "string" ? noms[i].trim().slice(0, 120) : "");
  });
  if (!serviceIds.length) return null;
  return { besoin: o.besoin === "enfant" ? "enfant" : "entretien", serviceIds, noms: dits };
}
function resumeSur(x) {
  if (!x || typeof x !== "object") return null;
  const o = x;
  const r = {};
  const niveau = dans(o.niveau, NIVEAUX);
  if (niveau) r.niveau = niveau;
  const longueur = dans(o.longueur, LONGUEURS);
  if (longueur) r.longueur = longueur;
  const suite = dans(o.suite, SUITES);
  if (suite) r.suite = suite;
  const rituel = rituelSur(o.rituel);
  if (rituel) r.rituel = rituel;
  if (o.privee === true) r.privee = true;
  const e = Math.round(Number(o.estimationXof));
  if (Number.isFinite(e) && e > 0) r.estimationXof = e;
  if (typeof o.mot === "string" && o.mot.trim()) r.mot = o.mot.trim().slice(0, 400);
  if (typeof o.par === "string") r.par = o.par.slice(0, 60);
  if (typeof o.le === "string") r.le = o.le;
  return Object.keys(r).length ? r : null;
}
function sansLocksEncore(consultation) {
  const c = consultation && typeof consultation === "object" ? consultation.couronne : null;
  return !!c && typeof c === "object" && c.nees === "aucune";
}
var A_VOIR_AVEC_LA_MAISON = "À voir avec la Maison";
var pourLeBilan = (texte) => /^je ne sais pas\.?$/i.test(String(texte ?? "").trim()) ? A_VOIR_AVEC_LA_MAISON : String(texte ?? "");
var jetonDuRituel = (r) => jetonDuLien({ besoin: r.besoin, gestes: r.serviceIds });
var cheminDeLaPrivee = (consultationId) => `/consultation/${consultationId && FORME_DE_LA_CONSULTATION.test(consultationId) ? `?privee=${encodeURIComponent(consultationId)}` : ""}`;
function affichesDeLaSuite(r, consultationId, sansLocks = false) {
  if (!r) return {};
  const privee = r.privee === true || suiteRetenue(r) === "privee";
  const a = {};
  if (r.rituel && !priveeObligatoire(r.niveau)) {
    const jeton = jetonDuRituel(r.rituel);
    a.rituel = { nom: "Votre rituel", noms: r.rituel.noms.filter(Boolean).map(pourLeBilan), chemin: `/reserver/?r=${jeton}`, jeton };
  }
  if (privee) {
    a.privee = {
      nom: "Consultation privée",
      ligne: sansLocks ? "À la Maison, devant vos cheveux" : "À la Maison, devant vos locks",
      unite: sansLocks ? "déduits de votre création" : "déduits de votre rituel",
      chemin: cheminDeLaPrivee(consultationId)
    };
  }
  return a;
}

// src/shared/salle-des-envois.ts
var DECALAGE_DU_SALON_H = 1;
var REGLES_PAR_DEFAUT = { salleMin: 10, calmeDe: 20, calmeA: 8 };
var FACTEUR_VIVANT_MS = 5 * 6e4;
function reglesDepuis(cfg) {
  const n = (v, min, max, defaut) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : defaut;
  };
  return {
    salleMin: n(cfg?.salleMin, 1, 120, REGLES_PAR_DEFAUT.salleMin),
    calmeDe: n(cfg?.calmeDe, 0, 23, REGLES_PAR_DEFAUT.calmeDe),
    calmeA: n(cfg?.calmeA, 0, 23, REGLES_PAR_DEFAUT.calmeA)
  };
}
var heureDuSalon = (ms) => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 36e5);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
};
function dansLesHeuresCalmes(ms, r) {
  if (r.calmeDe === r.calmeA) return false;
  const h = heureDuSalon(ms);
  return r.calmeDe < r.calmeA ? h >= r.calmeDe && h < r.calmeA : h >= r.calmeDe || h < r.calmeA;
}
function finDesHeuresCalmes(ms, r) {
  const local = new Date(ms + DECALAGE_DU_SALON_H * 36e5);
  const fin = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), r.calmeA, 0, 0) - DECALAGE_DU_SALON_H * 36e5;
  return fin > ms ? fin : fin + 864e5;
}
function heureDeDepart(maintenantMs, r) {
  const apresLaSalle = maintenantMs + r.salleMin * 6e4;
  if (!dansLesHeuresCalmes(apresLaSalle, r)) return { partA: apresLaSalle, calme: false };
  return { partA: finDesHeuresCalmes(apresLaSalle, r), calme: true };
}
var facteurVivant = (vuLe, maintenantMs) => {
  const t = Date.parse(vuLe ?? "");
  return Number.isFinite(t) && maintenantMs - t <= FACTEUR_VIVANT_MS && t - maintenantMs <= FACTEUR_VIVANT_MS;
};

// src/shared/porte-des-modeles-pur.ts
var JAMAIS_DEUX_FOIS_MS = 20 * 36e5;
var CONFIRMATION_RECENTE_MS = 24 * 36e5;
var numeroWa = (brut) => {
  const d = (brut ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00229")) return d.slice(2);
  if (d.startsWith("229")) return d;
  if (d.length === 10 && d.startsWith("01")) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

// src/shared/agenda-pur.ts
var pad2 = (n) => n < 10 ? `0${n}` : `${n}`;
var hourToMin = (h) => {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(h.trim());
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 9 * 60;
};
var minutesDeHhmm = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
var hhmmDeMinutes = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
var JOURS2 = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
function ouvertureDuJour(dateIso, semaine, exceptions = []) {
  const FERME = { closed: true, openMin: 0, closeMin: 0 };
  const dow = (/* @__PURE__ */ new Date(`${dateIso}T00:00:00`)).getDay();
  const jour = semaine.find((h) => h.key === JOURS2[dow]);
  if (!jour || jour.closed) return FERME;
  const base = { closed: false, openMin: hourToMin(jour.open), closeMin: hourToMin(jour.close) };
  const ex = exceptions.find((e) => e.date === dateIso && !e.staffId);
  if (!ex) return base;
  if (ex.closed) return FERME;
  return {
    closed: false,
    openMin: ex.open?.trim() ? hourToMin(ex.open) : base.openMin,
    closeMin: ex.close?.trim() ? hourToMin(ex.close) : base.closeMin
  };
}
function plagesBloquees(murs, branchId, dateIso, master) {
  return murs.filter((b) => b.branchId === branchId && b.date === dateIso && (!b.master || b.master === master)).map((b) => [
    b.debut?.trim() ? hourToMin(b.debut) : 0,
    b.fin?.trim() ? hourToMin(b.fin) : 24 * 60
  ]).filter(([s, e]) => e > s);
}
var PREMIER_RENDEZ_VOUS_MIN = 8 * 60 + 30;
var MAITRE_QUI_PARTAGE = "Team";
var DEUX_TETES_AU_PLUS = 2;
var bloqueLaVenue = (maitre, nouvelleLourde, deja) => maitre !== MAITRE_QUI_PARTAGE || !!nouvelleLourde && !!deja.lourde;
function creneauxLibres(o) {
  if (o.opening.closed) return [];
  const capMaison = o.capMaison ?? 0;
  const capMaitre = o.capMaitre ?? 0;
  if (capMaison > 0 && o.occupes.length >= capMaison) return [];
  const duMaitre = o.occupes.filter((a) => a.maitre === o.master);
  if (capMaitre > 0 && duMaitre.length >= capMaitre) return [];
  const busy = duMaitre.filter((a) => bloqueLaVenue(o.master, o.lourde, a)).map((a) => [a.debutMin, a.debutMin + a.dureeMin]);
  if (o.bloques) busy.push(...o.bloques);
  const pas = o.pasMin ?? 60;
  const cap = o.capSimultane ?? 0;
  const out = [];
  let dernier = -1;
  for (let g = o.opening.openMin; g < o.opening.closeMin; g += pas) {
    const m = Math.max(g, PREMIER_RENDEZ_VOUS_MIN);
    if (m + o.durationMin > o.opening.closeMin) break;
    if (m <= dernier) continue;
    dernier = m;
    if (o.maintenantMin != null && m <= o.maintenantMin) continue;
    const overlaps = busy.some(([s, e]) => m < e && m + o.durationMin > s);
    if (overlaps) continue;
    if (duMaitre.filter((a) => m < a.debutMin + a.dureeMin && m + o.durationMin > a.debutMin).length >= DEUX_TETES_AU_PLUS) continue;
    if (cap > 0) {
      const ensemble = o.occupes.filter((a) => m < a.debutMin + a.dureeMin && m + o.durationMin > a.debutMin).length;
      if (ensemble >= cap) continue;
    }
    out.push(hhmmDeMinutes(m));
  }
  return out;
}
var occupesDuJour = (occupes, dateIso) => occupes.filter((c) => c.jour === dateIso && c.debut).map((c) => ({ maitre: c.maitre, debutMin: minutesDeHhmm(c.debut), dureeMin: c.duree, ...c.lourde ? { lourde: true } : {} }));
var PLACES_EN_LIGNE = 1;

// src/shared/catalogue-pur.ts
function fenetreEnJours(f) {
  const de = Number(f?.deSemaines);
  const a = Number(f?.aSemaines);
  if (!f || !Number.isFinite(de) || !Number.isFinite(a) || de < 0 || a < de) return null;
  return { min: Math.round(de * 7), max: Math.round(a * 7) };
}

// src/shared/place-du-serveur.ts
var UN_JOUR_MS2 = 864e5;
function agendaDepuisLesLignes(l) {
  const objet2 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const chaine = (v) => typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  const liste = (v) => Array.isArray(v) ? v : [];
  const ids = (v) => liste(v).filter((x) => typeof x === "string" && x !== "");
  const entier2 = (v) => {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d{1,4}(\.\d+)?\s*$/.test(v) ? Number(v) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const MODES = ["fixe", "variable", "devis"];
  const brancheId = chaine(l.branche?.id);
  if (!l.branche || !brancheId) return null;
  const branche = objet2(l.branche.data);
  const reglages2 = objet2(l.reglages);
  const vitrine = objet2(l.vitrine);
  const masques = objet2(vitrine.siteMasques);
  const semaine = liste(reglages2.hours).map(objet2).filter((h) => chaine(h.key) !== "").map((h) => ({ key: chaine(h.key), open: chaine(h.open), close: chaine(h.close), closed: !!h.closed }));
  const exceptions = liste(l.exceptions).map(objet2).filter((e) => chaine(e.date) !== "").map((e) => ({
    date: chaine(e.date),
    ...chaine(e.staffId) ? { staffId: chaine(e.staffId) } : {},
    ...chaine(e.open) ? { open: chaine(e.open) } : {},
    ...chaine(e.close) ? { close: chaine(e.close) } : {},
    closed: !!e.closed
  }));
  const murs = (l.blocages ?? []).map((b) => objet2(objet2(b).data)).filter((b) => chaine(b.branchId) !== "" && chaine(b.date) !== "").map((b) => ({
    branchId: chaine(b.branchId),
    date: chaine(b.date),
    ...chaine(b.master) ? { master: chaine(b.master) } : {},
    ...chaine(b.debut) ? { debut: chaine(b.debut) } : {},
    ...chaine(b.fin) ? { fin: chaine(b.fin) } : {}
  }));
  const occupes = (l.occupes ?? []).map(objet2).filter((c) => chaine(c.jour) !== "" && /^\d{1,2}:\d{2}/.test(chaine(c.debut))).map((c) => {
    const d = Number(c.duree);
    return { jour: chaine(c.jour), maitre: chaine(c.maitre), debut: chaine(c.debut), duree: Number.isFinite(d) && d >= 1 ? d : 60, ...c.lourde === true ? { lourde: true } : {} };
  });
  const siegesDuJour = {};
  for (const r of (l.places ?? []).map(objet2)) {
    const n = Number(r.places);
    if (/^\d{4}-\d{2}-\d{2}$/.test(chaine(r.jour)) && Number.isInteger(n) && n >= 1) siegesDuJour[chaine(r.jour)] = n;
  }
  const services = (l.services ?? []).map((r) => {
    const d = objet2(r.data);
    const duree = Number(d.durationMin);
    const mode = chaine(d.priceMode);
    return {
      id: chaine(r.id) || chaine(d.id),
      name: chaine(d.name),
      categoryId: chaine(d.categoryId),
      ...d.durationMin !== void 0 && d.durationMin !== null && d.durationMin !== "" && Number.isFinite(duree) && duree >= 0 ? { durationMin: duree } : {},
      ...MODES.includes(mode) ? { priceMode: mode } : {},
      ...d.hidePrice ? { hidePrice: true } : {},
      ...d.consultationAvant === true ? { consultationAvant: true } : {},
      ...d.enabled === false ? { enabled: false } : {},
      ...d.archived ? { archived: true } : {},
      ...chaine(d.master) ? { master: chaine(d.master) } : {},
      ...fenetreEnJours(objet2(d.fenetreApresVenue)) ? { fenetreApresVenue: { deSemaines: Number(objet2(d.fenetreApresVenue).deSemaines), aSemaines: Number(objet2(d.fenetreApresVenue).aSemaines) } } : {}
    };
  }).filter((s) => s.id !== "");
  const categories = (l.categories ?? []).map((r) => {
    const d = objet2(r.data);
    return { id: chaine(r.id), ...chaine(d.parentId) ? { parentId: chaine(d.parentId) } : {} };
  }).filter((c) => c.id !== "");
  return {
    branchId: brancheId,
    maitres: ids(branche.masters),
    /* LES PLACES EN LIGNE, PAS LES FAUTEUILS — 24 octobre 2026 : cet agenda
       ne juge que les portes en ligne (le site, WhatsApp), et en ligne un
       rituel ne chevauche jamais un autre (`PLACES_EN_LIGNE`). Les fauteuils
       de la branche restent au comptoir. */
    sieges: PLACES_EN_LIGNE,
    ...Object.keys(siegesDuJour).length > 0 ? { siegesDuJour } : {},
    capMaison: entier2(reglages2.maxRdvParJourMaison),
    capMaitre: entier2(reglages2.maxRdvParJourMaitre),
    semaine,
    exceptions,
    murs,
    occupes,
    services,
    categories,
    masques: { services: ids(masques.services), categories: ids(masques.categories) },
    formules: liste(vitrine.formulesRapides).map(objet2).map((f) => ({ serviceIds: ids(f.serviceIds) })).filter((f) => f.serviceIds.length > 0)
  };
}
var jourDeCotonou2 = (ms) => new Date(ms + 36e5).toISOString().slice(0, 10);
function isoApresJours(iso, n) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t + n * UN_JOUR_MS2).toISOString().slice(0, 10) : "";
}
function joursDEcart(dateIso, ms) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || isoApresJours(dateIso, 0) !== dateIso) return Number.NaN;
  return Math.round((Date.parse(`${dateIso}T00:00:00Z`) - Date.parse(`${jourDeCotonou2(ms)}T00:00:00Z`)) / UN_JOUR_MS2);
}
function finDeLaReservation(aujourdhuiIso) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(aujourdhuiIso ?? ""));
  if (!m) return "";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + 4, 0)).toISOString().slice(0, 10);
}
function joursDeLaFenetre(ms) {
  const n = joursDEcart(finDeLaReservation(jourDeCotonou2(ms)), ms);
  return Number.isFinite(n) ? n : 0;
}
var minutesDeCotonou = (ms) => Math.floor(((ms + 36e5) % UN_JOUR_MS2 + UN_JOUR_MS2) % UN_JOUR_MS2 / 6e4);
function laPlaceEstRecevable(p, ms, jourMeme = false) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(p.time ?? ""));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return "creneau_invalide";
  const ecart = joursDEcart(String(p.date ?? ""), ms);
  if (Number.isNaN(ecart)) return "creneau_invalide";
  const aujourdhuiPasEncoreCommence = jourMeme && ecart === 0 && Number(m[1]) * 60 + Number(m[2]) > minutesDeCotonou(ms);
  if (ecart < 1 && !aujourdhuiPasEncoreCommence || ecart > joursDeLaFenetre(ms)) return "creneau_hors_fenetre";
  return null;
}

// src/shared/consultation-privee-pur.ts
function momentSur(x) {
  if (!x || typeof x !== "object") return null;
  const o = x;
  const jour = typeof o.jour === "string" ? o.jour.trim() : "";
  const heure = typeof o.heure === "string" ? o.heure.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) return null;
  return { jour, heure };
}
var maitresDe = (agenda) => agenda.maitres.length > 0 ? [...agenda.maitres] : [""];
function heuresDuJour(agenda, iso, dureeMin) {
  const parHeure = /* @__PURE__ */ new Map();
  const opening = ouvertureDuJour(iso, agenda.semaine, agenda.exceptions);
  if (opening.closed) return parHeure;
  const occupes = occupesDuJour(agenda.occupes, iso);
  for (const master of maitresDe(agenda)) {
    const libres = creneauxLibres({
      opening,
      durationMin: dureeMin,
      occupes,
      bloques: plagesBloquees(agenda.murs, agenda.branchId, iso, master),
      master,
      capMaison: agenda.capMaison,
      capMaitre: agenda.capMaitre,
      capSimultane: agenda.sieges,
      maintenantMin: null
    });
    for (const h of libres) parHeure.set(h, [...parHeure.get(h) ?? [], master]);
  }
  return parHeure;
}
function laPriveeTient(agenda, m, dureeMin, ms) {
  const recevable = laPlaceEstRecevable({ date: m.jour, time: m.heure }, ms);
  if (recevable) return { ok: false, erreur: recevable };
  if (ouvertureDuJour(m.jour, agenda.semaine, agenda.exceptions).closed) return { ok: false, erreur: "creneau_ferme" };
  const maitres = heuresDuJour(agenda, m.jour, dureeMin).get(m.heure);
  if (!maitres || maitres.length === 0) return { ok: false, erreur: "creneau_pris" };
  return { ok: true, maitres };
}
function placesDeLaPrivee(agenda, dureeMin, ms, horizonJours = 30) {
  const voulu = Math.round(Number(horizonJours));
  const n = Math.max(1, Math.min(joursDeLaFenetre(ms), Number.isFinite(voulu) && voulu > 0 ? voulu : 30));
  const aujourdhui = jourDeCotonou2(ms);
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    const iso = isoApresJours(aujourdhui, i);
    for (const heure of [...heuresDuJour(agenda, iso, dureeMin).keys()].sort()) out.push({ iso, heure });
  }
  return out;
}
var idDuRdvDeLaPrivee = (consultationId) => `rdv-privee-${consultationId}`;
var idDeLaDemandeDeLaPrivee = (consultationId) => `dem-privee-${consultationId}`;
var NOM_DE_LA_PRIVEE = "Consultation privée";
var NOM_DE_LA_VISIO_AU_CARNET = "Visio · 15 minutes";
function rdvDeLaPrivee(o) {
  const note = [
    "Consultation privée réservée sur le site",
    o.regleXof > 0 ? `réglée en ligne : ${o.regleXof} F, déduits de son rituel` : "",
    o.reference ? `réf. ${o.reference}` : ""
  ].filter(Boolean).join(" · ");
  return {
    id: idDuRdvDeLaPrivee(o.consultationId),
    branchId: o.branchId,
    clientId: "",
    clientName: o.prenom || "Consultation privée",
    serviceIds: [],
    date: o.moment.jour,
    time: o.moment.heure,
    dureeMin: o.dureeMin,
    status: "confirmé",
    source: "consultation",
    creeLe: o.maintenantIso,
    consultationId: o.consultationId,
    forfait: { nom: NOM_DE_LA_PRIVEE, totalXof: 0, baseXof: 0, poseAt: o.maintenantIso.slice(0, 10) },
    note
  };
}

// src/shared/estimation-pur.ts
var PRIX_DE_LA_CONSULTATION_PRIVEE_XOF = 15e3;

// scripts/serveur/visio-salle.ts
var VERSION = "2026-11-18-b";
var DAILY = "https://api.daily.co/v1";
var LIMITE = { seau: "visio", max: 6, fenetreMin: 10 };
var DAILY_MAX_MS = 8e3;
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
var json = (corps, status = 200) => new Response(JSON.stringify({ version: VERSION, maintenant: (/* @__PURE__ */ new Date()).toISOString(), ...corps }), { status, headers: { ...CORS, "content-type": "application/json" } });
var dis = (quoi, plus = {}) => console.log(JSON.stringify({ fonction: "visio-salle", quoi, ...plus }));
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function aleatoire(n, alphabet = ALPHABET) {
  const o = new Uint8Array(n);
  crypto.getRandomValues(o);
  return [...o].map((b) => alphabet[b % alphabet.length]).join("");
}
async function empreinte(jeton) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
var prenomDe = (nom) => String(nom ?? "").trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
var ipDe = (req) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnue";
var objet = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
async function reglages(sb) {
  const { data } = await sb.from("documents").select("data").eq("key", "mnd_visio").maybeSingle();
  return reglagesSurs(data?.data);
}
async function prisDepuis(sb, depuis) {
  const { data } = await sb.from("visios").select("debut").neq("statut", "annulée").gte("debut", depuis).limit(1e3);
  return (data ?? []).map((l) => l.debut);
}
async function permis(sb, ip) {
  const depuis = new Date(Date.now() - LIMITE.fenetreMin * 6e4).toISOString();
  const { count, error } = await sb.from("edge_rate_limits").select("*", { count: "exact", head: true }).eq("bucket", LIMITE.seau).eq("ip", ip).gte("at", depuis);
  if (error) return true;
  if ((count ?? 0) >= LIMITE.max) return false;
  await sb.from("edge_rate_limits").insert({ bucket: LIMITE.seau, ip });
  return true;
}
async function parLeJeton(sb, id, jeton) {
  if (typeof id !== "string" || typeof jeton !== "string" || !FORME_DE_L_ID.test(id) || !FORME_DU_JETON.test(jeton)) return null;
  const { data } = await sb.from("visios").select("*").eq("id", id).maybeSingle();
  const l = data;
  if (!l) return null;
  const h = await empreinte(jeton);
  if (l.jeton_hash === h) return { l, porte: "entree" };
  if (l.billet_hash && l.billet_hash === h) return { l, porte: "billet" };
  return null;
}
async function delEquipe(sb, req) {
  const cle = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!cle) return null;
  const { data: lu } = await sb.auth.getUser(cle);
  const uid = lu?.user?.id;
  if (!uid) return null;
  const { data: staff } = await sb.from("staff").select("user_id").eq("user_id", uid).maybeSingle();
  return staff ? uid : null;
}
async function parLId(sb, id) {
  if (typeof id !== "string" || !FORME_DE_L_ID.test(id)) return null;
  const { data } = await sb.from("visios").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}
function origineDe(req) {
  const o = (req.headers.get("origin") ?? "").trim();
  return /^https:\/\/[^/\s]+$/.test(o) ? o : "";
}
async function daily(cle, chemin, corps) {
  const ctl = new AbortController();
  const minuterie = setTimeout(() => ctl.abort(), DAILY_MAX_MS);
  try {
    const r = await fetch(`${DAILY}${chemin}`, {
      method: corps === void 0 ? "GET" : "POST",
      headers: { Authorization: `Bearer ${cle}`, "content-type": "application/json" },
      ...corps === void 0 ? {} : { body: JSON.stringify(corps) },
      signal: ctl.signal
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  } finally {
    clearTimeout(minuterie);
  }
}
async function laSalle(sb, cle, l) {
  if (l.salle && l.salle_url) return { nom: l.salle, url: l.salle_url };
  const nom = nomDeLaSalle(l.id, l.debut);
  const exp = Math.floor(Date.parse(l.fin) / 1e3);
  const nbf = Math.floor((Date.parse(l.debut) - AVANT_L_ENTREE_MIN * 6e4) / 1e3);
  let r = await daily(cle, "/rooms", {
    name: nom,
    privacy: "private",
    properties: { nbf, exp, eject_at_room_exp: true, max_participants: 3, enable_chat: false, lang: "fr" }
  });
  if (!r.ok) r = await daily(cle, `/rooms/${nom}`);
  const url = typeof r.d.url === "string" ? r.d.url : "";
  if (!r.ok || !url) throw new Error(`salle ${r.status}`);
  await sb.from("visios").update({ salle: nom, salle_url: url, maj_le: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", l.id);
  return { nom, url };
}
async function uneEntree(cle, salle, fin, nom, maison) {
  const r = await daily(cle, "/meeting-tokens", {
    properties: { room_name: salle, exp: Math.floor(Date.parse(fin) / 1e3), eject_at_token_exp: true, user_name: nom, is_owner: maison, lang: "fr" }
  });
  const t = typeof r.d.token === "string" ? r.d.token : "";
  if (!r.ok || !t) throw new Error(`jeton ${r.status}`);
  return t;
}
async function entre(sb, cle, l, nom, maison) {
  const maintenant = Date.now();
  if (l.statut === "annulée") return json({ ok: false, motif: "annulee" });
  if (maintenant >= Date.parse(l.fin)) return json({ ok: false, motif: "fermee", resume: resumeSur(l.resume) });
  if (maintenant < Date.parse(l.debut) - AVANT_L_ENTREE_MIN * 6e4) return json({ ok: false, motif: "trop-tot", debut: l.debut, fin: l.fin });
  const salle = await laSalle(sb, cle, l);
  const jeton = await uneEntree(cle, salle.nom, l.fin, nom, maison);
  dis("entrée", { id: l.id, maison });
  return json({ ok: true, url: `${salle.url}?t=${encodeURIComponent(jeton)}`, debut: l.debut, fin: l.fin });
}
async function deposeLeModele(sb, d) {
  if (!d.modele) return "sans-modele";
  const numero = numeroWa(d.telephone);
  if (numero.length < 11) return "numero";
  const { data: deja } = await sb.from("envois").select("id, data").eq("id", d.id).maybeSingle();
  const statutDeja = String(objet(deja?.data).statut ?? "");
  if (deja && statutDeja !== "en-attente") return statutDeja || "deja";
  const colis = { genre: "whatsapp", numero, modele: d.modele, parQui: "la Maison, automatiquement", texteAuFil: d.texteAuFil, composants: d.composants };
  const { data: docs } = await sb.from("documents").select("key, data").in("key", ["mnd_auto_config", "mnd_facteur"]);
  const regles = reglesDepuis(docs?.find((x) => x.key === "mnd_auto_config")?.data ?? {});
  const maintenant = Date.now();
  const salleOuverte = facteurVivant(docs?.find((x) => x.key === "mnd_facteur")?.data?.vuLe, maintenant);
  const base = {
    id: d.id,
    branchId: d.branchId,
    type: "visio",
    canal: "whatsapp",
    apptId: "",
    invoiceId: "",
    clientId: "",
    visioId: d.visioId,
    dateRdv: jourDeCotonou(Date.parse(d.debut)),
    heure: heureDite(d.debut),
    quand: new Date(maintenant).toISOString(),
    prenom: d.prenom
  };
  let ligne;
  if (salleOuverte) {
    const { partA, calme } = heureDeDepart(Math.max(maintenant, d.pasAvantMs ?? 0), regles);
    ligne = { ...base, statut: "en-attente", deposeLe: new Date(maintenant).toISOString(), partA: new Date(partA).toISOString(), ...calme ? { calme: true } : {}, colis };
  } else {
    const jeton = (Deno.env.get("WA_TOKEN") ?? "").trim();
    const telId = (Deno.env.get("WA_PHONE_ID") ?? "").trim();
    if (!jeton || !telId) return "sans-whatsapp";
    let statut = "échec";
    let detail = "";
    try {
      const r = await fetch(`https://graph.facebook.com/v20.0/${telId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ messaging_product: "whatsapp", to: numero, type: "template", template: { name: d.modele, language: { code: "fr" }, components: d.composants } })
      });
      if (r.ok) statut = "envoyé";
      else detail = (await r.text()).slice(0, 300);
    } catch (e) {
      detail = String(e?.message ?? e).slice(0, 300);
    }
    ligne = { ...base, statut, ...detail ? { detail } : {}, colis };
  }
  const { error } = await sb.from("envois").upsert({ id: d.id, branch_id: d.branchId, data: ligne }, { onConflict: "id" });
  return error ? "journal" : String(ligne.statut);
}
var parti = (statut) => statut === "en-attente" || statut === "envoyé";
async function confirmeSurWhatsApp(sb, req, v) {
  const modele = (Deno.env.get("WA_TEMPLATE_VISIO") ?? "").trim();
  if (!modele) return "sans-modele";
  const origine = origineDe(req);
  if (!origine) return "sans-origine";
  const prenom = prenomDe(v.nom);
  const quand = creneauDit(v.debut);
  const lien = `${origine}${v.chemin}`;
  return await deposeLeModele(sb, {
    id: v.envoiId ?? `env-${v.id}-wa-visio`,
    visioId: v.id,
    branchId: v.branchId,
    debut: v.debut,
    prenom,
    telephone: v.telephone,
    modele,
    composants: [{ type: "body", parameters: [{ type: "text", text: prenom }, { type: "text", text: quand }, { type: "text", text: lien }] }],
    texteAuFil: `Bonjour ${prenom}, votre visio gratuite avec la Maison MND est réservée : ${quand}. Votre lien d’entrée : ${lien}`
  });
}
async function retireDeLaSalle(sb, visioId, motif, garde = () => false) {
  const { data } = await sb.from("envois").select("id, data").eq("data->>visioId", visioId).limit(50);
  let n = 0;
  for (const e of data ?? []) {
    if (garde(e.id) || String(e.data?.statut ?? "") !== "en-attente") continue;
    const { data: ecrit } = await sb.from("envois").update({ data: { ...e.data, statut: "périmé", detail: motif } }).eq("id", e.id).eq("data->>statut", "en-attente").select("id");
    if (Array.isArray(ecrit) && ecrit.length) n += 1;
  }
  return n;
}
async function brancheDe(sb, voulue) {
  if (voulue) {
    const { data } = await sb.from("branches").select("id, data").eq("id", voulue).maybeSingle();
    if (data) return { id: String(data.id), data: objet(data.data) };
  }
  const { data: toutes } = await sb.from("branches").select("id, data").limit(50);
  const lignes = (toutes ?? []).map((b) => ({ id: String(b.id), data: objet(b.data) }));
  return lignes.find((b) => b.data.flagship === true) ?? lignes[0] ?? null;
}
var maitreDe = (b) => {
  const voulu = typeof b.data.masterParDefaut === "string" ? b.data.masterParDefaut.trim() : "";
  const maitres = Array.isArray(b.data.masters) ? b.data.masters.filter((m) => typeof m === "string" && m !== "") : [];
  return voulu && maitres.includes(voulu) ? voulu : maitres[0] ?? "";
};
async function inscrisLaVisioAuCarnet(sb, v) {
  const branche = await brancheDe(sb, v.branchId);
  if (!branche) return null;
  const id = `rdv-visio-${v.id}`;
  const maintenant = (/* @__PURE__ */ new Date()).toISOString();
  const rdv = {
    id,
    branchId: branche.id,
    clientId: "",
    clientName: prenomDe(v.nom) || "Visio",
    serviceIds: [],
    date: jourDeCotonou(Date.parse(v.debut)),
    time: heureDite(v.debut),
    dureeMin: 15,
    master: maitreDe(branche),
    status: "confirmé",
    source: "consultation",
    creeLe: maintenant,
    sansConfirmation: true,
    visioId: v.id,
    forfait: { nom: NOM_DE_LA_VISIO_AU_CARNET, totalXof: 0, baseXof: 0, poseAt: maintenant.slice(0, 10) },
    note: "Visio gratuite réservée sur le site · en ligne, dans Ma Couronne"
  };
  const { error } = await sb.from("appointments").insert({ id, branch_id: branche.id, data: rdv });
  if (error && !/duplicate|unique/i.test(String(error.message))) {
    dis("carnet · visio non inscrite", { id: v.id });
    return null;
  }
  return id;
}
async function suisAuCarnet(sb, rdvId, patch) {
  if (!rdvId) return;
  for (let essai = 0; essai < 3; essai += 1) {
    const { data } = await sb.from("appointments").select("id, data, updated_at").eq("id", rdvId).maybeSingle();
    if (!data) return;
    const { data: ecrit } = await sb.from("appointments").update({ data: { ...objet(data.data), ...patch } }).eq("id", rdvId).eq("updated_at", data.updated_at).select("id");
    if (Array.isArray(ecrit) && ecrit.length) return;
  }
}
async function noteSurLaConsultation(sb, consultationId, patch) {
  if (!consultationId) return;
  const { data: row } = await sb.from("consultations_queue").select("id, data").eq("id", consultationId).maybeSingle();
  if (!row) return;
  await sb.from("consultations_queue").update({ data: { ...objet(row.data), ...patch } }).eq("id", consultationId);
}
async function sansLocksDe(sb, consultationId) {
  if (!consultationId) return false;
  const { data: row } = await sb.from("consultations_queue").select("id, data").eq("id", consultationId).maybeSingle();
  return sansLocksEncore(row?.data);
}
async function lisLAgenda(sb, branchId, du, au) {
  const [branche, docs, blocages, occupes] = await Promise.all([
    sb.from("branches").select("id, data").eq("id", branchId).maybeSingle(),
    sb.from("documents").select("key, data").in("key", ["mnd_settings", "mnd_horaires_exceptions"]),
    sb.from("blocages").select("id, data").eq("data->>branchId", branchId).gte("data->>date", du).lte("data->>date", au).limit(1e3),
    sb.rpc("creneaux_occupes", { p_branch: branchId, p_du: du, p_au: au })
  ]);
  const pris = Array.isArray(occupes.data) ? occupes.data : [];
  if (!branche.data || docs.error || blocages.error || occupes.error || pris.length >= 1e3) return null;
  const doc = (cle) => (docs.data ?? []).find((d) => d.key === cle)?.data;
  return agendaDepuisLesLignes({
    branche: branche.data,
    reglages: doc("mnd_settings"),
    exceptions: doc("mnd_horaires_exceptions"),
    services: [],
    categories: [],
    blocages: blocages.data ?? [],
    occupes: pris
  });
}
var prixDeLaPrivee = () => {
  const n = Math.round(Number(Deno.env.get("CONSULTATION_FEE_XOF") ?? PRIX_DE_LA_CONSULTATION_PRIVEE_XOF));
  return Number.isFinite(n) && n > 0 ? n : PRIX_DE_LA_CONSULTATION_PRIVEE_XOF;
};
async function reserveLaPrivee(sb, consultationId, voulu) {
  const { data: row } = await sb.from("consultations_queue").select("id, data").eq("id", consultationId).maybeSingle();
  if (!row) return { status: 404, corps: { ok: false, motif: "inconnue" } };
  const c = objet(row.data);
  const rdvId = idDuRdvDeLaPrivee(consultationId);
  const { data: deja } = await sb.from("appointments").select("id, data").eq("id", rdvId).maybeSingle();
  if (deja && String(objet(deja.data).status ?? "") !== "annulé") {
    const a = objet(deja.data);
    return { status: 200, corps: { ok: true, verdict: "deja", rdvId, moment: { jour: String(a.date ?? ""), heure: String(a.time ?? "") } } };
  }
  const { data: regles } = await sb.from("payments").select("id, data").eq("data->>partnerId", consultationId);
  const reussis = (regles ?? []).filter((p) => (p.data?.status ?? "") === "success");
  const regle = reussis.reduce((s, p) => s + Math.round(Number(p.data?.amountXof ?? 0)), 0);
  if (regle + 1 < prixDeLaPrivee()) return { status: 402, corps: { ok: false, motif: "a-regler" } };
  const moment = voulu ?? momentSur(c.momentVoulu);
  if (!moment) return { status: 400, corps: { ok: false, motif: "sans-moment" } };
  const branche = await brancheDe(sb, typeof c.branchId === "string" && c.branchId ? c.branchId : null);
  if (!branche) return { status: 500, corps: { ok: false, motif: "branche" } };
  const maintenant = Date.now();
  const le = new Date(maintenant).toISOString();
  const refuse = async (raison, status = 409) => {
    await sb.from("consultations_queue").update({ data: { ...c, momentVoulu: moment, momentRefuse: { ...moment, raison, le } } }).eq("id", consultationId);
    return { status, corps: { ok: false, motif: raison, raison } };
  };
  const r = await reglages(sb);
  const agenda = await lisLAgenda(sb, branche.id, moment.jour, moment.jour);
  if (!agenda) return await refuse("agenda", 503);
  const verdict = laPriveeTient(agenda, moment, r.priveeDureeMin, maintenant);
  if (!verdict.ok) return await refuse(verdict.erreur);
  const client = objet(c.client);
  const prenom = prenomDe(String(client.name ?? ""));
  const telephone = String(client.phone ?? "");
  const rdv = rdvDeLaPrivee({
    consultationId,
    branchId: branche.id,
    prenom,
    moment,
    dureeMin: r.priveeDureeMin,
    maintenantIso: le,
    regleXof: regle,
    ...reussis[0]?.id ? { reference: reussis[0].id } : {}
  });
  const numero = numeroWa(telephone);
  const demande = {
    id: idDeLaDemandeDeLaPrivee(consultationId),
    genre: "rdv",
    createdAt: le,
    branchId: branche.id,
    prenom,
    telephone: numero ? `+${numero}` : telephone,
    besoin: c.parcours === "creation" ? "creation" : "reparation",
    mot: "Consultation privée réglée en ligne",
    source: "site",
    page: "/consultation/",
    consentementLe: le,
    statut: "nouvelle",
    serviceIds: [],
    date: moment.jour,
    time: moment.heure,
    consultationId
  };
  const { data: pose, error } = await sb.rpc("pose_si_libre", { p_rdv: rdv, p_maitres: verdict.maitres, p_demande: demande });
  const posee = pose ?? null;
  if (error || !posee) {
    dis("privée · verrou muet", { consultation: consultationId });
    return await refuse("verrou", 500);
  }
  if (!posee.ok) return await refuse(posee.raison ?? "creneau_pris");
  const pris = posee.id ?? rdvId;
  const { momentVoulu: _v, momentRefuse: _r, ...reste } = c;
  await sb.from("consultations_queue").update({
    data: {
      ...reste,
      rdvId: pris,
      rdv: { id: pris, date: moment.jour, time: moment.heure, ...posee.master ? { master: posee.master } : {}, poseLe: le },
      momentFixe: `${jourDit(moment.jour)} · ${moment.heure}`
    }
  }).eq("id", consultationId);
  dis("privée posée", { consultation: consultationId, verdict: posee.verdict });
  return { status: 200, corps: { ok: true, verdict: posee.verdict === "pose" ? "pose" : "deja", rdvId: pris, moment } };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return json({ ok: true, fonction: "visio-salle" });
  if (req.method !== "POST") return json({ ok: false, motif: "POST seulement" }, 405);
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const service = (Deno.env.get("CLE_SERVICE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const cle = (Deno.env.get("DAILY_API_KEY") ?? "").trim();
  if (!url || !service) return json({ ok: false, motif: "environnement" }, 500);
  const sb = createClient(url, service);
  let corps = {};
  try {
    corps = await req.json();
  } catch {
  }
  const geste = String(corps.geste ?? "");
  try {
    if (geste === "creneaux") {
      const r = await reglages(sb);
      const actif = r.actif && !!cle;
      const maintenant = Date.now();
      const creneaux = actif ? creneauxOuverts(r, maintenant, await prisDepuis(sb, new Date(maintenant).toISOString())) : [];
      return json({ ok: true, actif, cle: !!cle, creneaux });
    }
    if (geste === "reserver") {
      const r = await reglages(sb);
      if (!r.actif || !cle) return json({ ok: false, motif: "fermee" }, 409);
      const nom = String(corps.nom ?? "").trim().slice(0, 80);
      const telephone = String(corps.telephone ?? "").trim().slice(0, 30);
      const debut = String(corps.debut ?? "");
      const numero = numeroCourt(telephone);
      if (nom.length < 2 || numero.length < 8 || !Number.isFinite(Date.parse(debut))) return json({ ok: false, motif: "incomplet" }, 400);
      if (numeroWa(telephone).length < 11) return json({ ok: false, motif: "numero", raison: "numero" }, 400);
      if (!await permis(sb, ipDe(req))) return json({ ok: false, motif: "rate_limited" }, 429);
      const maintenant = Date.now();
      const debutIso = new Date(Date.parse(debut)).toISOString();
      if (!creneauValide(r, maintenant, await prisDepuis(sb, new Date(maintenant).toISOString()), debutIso)) return json({ ok: false, motif: "pris" }, 409);
      let siennes = await sb.from("visios").select("debut, statut, annulee_le, annulee_par").eq("numero", numero).order("debut", { ascending: false }).limit(60);
      if (siennes.error) siennes = await sb.from("visios").select("debut, statut").eq("numero", numero).order("debut", { ascending: false }).limit(60);
      const duNumero = (siennes.data ?? []).map((l) => ({
        debut: String(l.debut),
        statut: String(l.statut),
        annuleeLe: typeof l.annulee_le === "string" ? l.annulee_le : null,
        annuleePar: typeof l.annulee_par === "string" ? l.annulee_par : null
      }));
      const limite = limiteDe(duNumero, r, maintenant);
      if (!limite.ok) {
        dis("limite", { aVenir: limite.aVenir });
        return json({ ok: false, motif: limite.aVenir ? "deja" : "limite", raison: "limite", prochaineLe: limite.prochaineLe }, 409);
      }
      let consultationId = typeof corps.consultationId === "string" && FORME_DE_LA_CONSULTATION.test(corps.consultationId) ? corps.consultationId : null;
      let branchId = null;
      if (consultationId) {
        const { data: row } = await sb.from("consultations_queue").select("id, data").eq("id", consultationId).maybeSingle();
        if (!row) consultationId = null;
        const b = objet(row?.data).branchId;
        branchId = typeof b === "string" && b ? b : null;
      }
      const id = `vz-${aleatoire(12, "abcdefghijklmnopqrstuvwxyz0123456789")}`;
      const jeton = aleatoire(32);
      const billet = aleatoire(32);
      const socle = {
        id,
        consultation_id: consultationId,
        debut: debutIso,
        fin: finDe(debutIso),
        nom,
        telephone,
        numero,
        jeton_hash: await empreinte(jeton),
        statut: "réservée"
      };
      let { error } = await sb.from("visios").insert({ ...socle, billet_hash: await empreinte(billet), branch_id: branchId, lien_etat: "a-envoyer" });
      const sansBillet = !!error && /column|schema cache/i.test(String(error.message));
      if (sansBillet) ({ error } = await sb.from("visios").insert(socle));
      if (error) return json({ ok: false, motif: /duplicate|unique/i.test(String(error.message)) ? "pris" : "ecriture" }, 409);
      const whatsapp = await confirmeSurWhatsApp(sb, req, { id, nom, telephone, debut: debutIso, chemin: cheminDeLaSalle(id, jeton), branchId }).catch(() => "erreur");
      if (!sansBillet && parti(whatsapp)) await sb.from("visios").update({ lien_etat: "whatsapp" }).eq("id", id);
      const rdvId = r.auCarnet ? await inscrisLaVisioAuCarnet(sb, { id, nom, debut: debutIso, branchId }).catch(() => null) : null;
      if (rdvId && !sansBillet) await sb.from("visios").update({ rdv_id: rdvId }).eq("id", id);
      await noteSurLaConsultation(sb, consultationId, { visio: { id, debut: debutIso, statut: "réservée" }, ...rdvId ? { rdvId } : {} });
      dis("réservée", { id, debut: debutIso, consultation: !!consultationId, whatsapp, carnet: !!rdvId });
      return json({
        ok: true,
        id,
        debut: debutIso,
        fin: finDe(debutIso),
        whatsapp,
        parWhatsApp: parti(whatsapp),
        ...sansBillet ? {} : { billet, chemin: cheminDeLaSalle(id, billet) },
        changement: { max: r.changementsMax, avantMin: r.changementAvantMin }
      });
    }
    if (geste === "etat" || geste === "entrer" || geste === "annuler" || geste === "suite-vue") {
      const p = await parLeJeton(sb, corps.id, corps.jeton);
      if (!p) return json({ ok: false, motif: "inconnue" }, 404);
      const { l, porte } = p;
      if (geste === "etat") {
        const maintenant = Date.now();
        const fermee = maintenant >= Date.parse(l.fin);
        const r = await reglages(sb);
        const juge = changementPermis({ debut: l.debut, statut: l.statut, deplacements: l.deplacements }, r, maintenant);
        const resume = fermee ? resumeSur(l.resume) : null;
        return json({
          ok: true,
          debut: l.debut,
          fin: l.fin,
          statut: l.statut,
          prenom: prenomDe(l.nom),
          consultationId: l.consultation_id,
          resume,
          actif: !!cle,
          billet: porte === "billet",
          /* Les affiches de la suite suivent son parcours (elle n'a pas encore de locks). */
          sansLocks: resume ? await sansLocksDe(sb, l.consultation_id) : false,
          changement: {
            permis: juge === "permis",
            ...juge === "permis" ? {} : { motif: juge },
            reste: changementsRestants(l, r),
            max: r.changementsMax,
            avantMin: r.changementAvantMin
          }
        });
      }
      if (geste === "annuler") {
        const maintenant = Date.now();
        if (l.statut !== "réservée" || maintenant >= Date.parse(l.debut)) return json({ ok: false, motif: "trop-tard" }, 409);
        const r = await reglages(sb);
        const le = new Date(maintenant).toISOString();
        let { error } = await sb.from("visios").update({ statut: "annulée", annulee_par: "cliente", maj_le: le }).eq("id", l.id);
        if (error && /column|schema cache/i.test(String(error.message))) ({ error } = await sb.from("visios").update({ statut: "annulée", maj_le: le }).eq("id", l.id));
        if (error) return json({ ok: false, motif: "ecriture" }, 500);
        await suisAuCarnet(sb, l.rdv_id, { status: "annulé" });
        await retireDeLaSalle(sb, l.id, "visio annulée par la cliente");
        await noteSurLaConsultation(sb, l.consultation_id, { visio: { id: l.id, debut: l.debut, statut: "annulée" } });
        dis("annulée par la cliente", { id: l.id });
        return json({ ok: true, compte: maintenant > Date.parse(l.debut) - r.changementAvantMin * 6e4 });
      }
      if (geste === "suite-vue") {
        if (Date.now() < Date.parse(l.fin) || !resumeSur(l.resume)) return json({ ok: false, motif: "trop-tot" }, 409);
        if (!l.suite_vue_le) await sb.from("visios").update({ suite_vue_le: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", l.id);
        const retires = await retireDeLaSalle(sb, l.id, "vue sur sa page", (id) => !id.startsWith(`env-${l.id}-wa-suite`));
        return json({ ok: true, retires });
      }
      if (porte !== "entree") return json({ ok: false, motif: "par-whatsapp" }, 403);
      if (!cle) return json({ ok: false, motif: "sans-service" }, 503);
      return await entre(sb, cle, l, prenomDe(l.nom) || "Cliente", false);
    }
    if (geste === "deplacer") {
      let l;
      let porte;
      if (typeof corps.jeton === "string") {
        const p = await parLeJeton(sb, corps.id, corps.jeton);
        if (!p) return json({ ok: false, motif: "inconnue" }, 404);
        ({ l, porte } = p);
      } else {
        if (!await delEquipe(sb, req)) return json({ ok: false, motif: "reserve-a-l-equipe" }, 403);
        l = await parLId(sb, corps.id);
        if (!l) return json({ ok: false, motif: "inconnue" }, 404);
        porte = "maison";
      }
      const parLaMaison = porte === "maison";
      const r = await reglages(sb);
      const maintenant = Date.now();
      const juge = changementPermis({ debut: l.debut, statut: l.statut, deplacements: l.deplacements }, r, maintenant, parLaMaison);
      if (juge !== "permis") return json({ ok: false, motif: juge, reste: changementsRestants(l, r) }, 409);
      const voulu = String(corps.debut ?? "");
      if (!Number.isFinite(Date.parse(voulu))) return json({ ok: false, motif: "incomplet" }, 400);
      if (!parLaMaison && !await permis(sb, ipDe(req))) return json({ ok: false, motif: "rate_limited" }, 429);
      const debutIso = new Date(Date.parse(voulu)).toISOString();
      if (!creneauDuChangement(r, maintenant, await prisDepuis(sb, new Date(maintenant).toISOString()), debutIso, parLaMaison)) return json({ ok: false, motif: "pris" }, 409);
      const jetonNeuf = porte === "entree" ? null : aleatoire(32);
      const jetonDuLien2 = porte === "entree" ? String(corps.jeton) : jetonNeuf;
      const le = new Date(maintenant).toISOString();
      const deplacements = (l.deplacements ?? 0) + (parLaMaison ? 0 : 1);
      const { data: ecrit, error } = await sb.from("visios").update({
        debut: debutIso,
        fin: finDe(debutIso),
        deplacements,
        deplacee_le: le,
        deplacee_de: l.debut,
        salle: null,
        salle_url: null,
        maj_le: le,
        ...jetonNeuf ? { jeton_hash: await empreinte(jetonNeuf) } : {}
      }).eq("id", l.id).eq("debut", l.debut).eq("statut", "réservée").select("id");
      if (error) return json({ ok: false, motif: /duplicate|unique/i.test(String(error.message)) ? "pris" : "ecriture" }, 409);
      if (!Array.isArray(ecrit) || ecrit.length === 0) return json({ ok: false, motif: "a-change" }, 409);
      await suisAuCarnet(sb, l.rdv_id, { date: jourDeCotonou(Date.parse(debutIso)), time: heureDite(debutIso), deplaceLe: le, deplacePar: parLaMaison ? "maison" : "cliente" });
      await noteSurLaConsultation(sb, l.consultation_id, { visio: { id: l.id, debut: debutIso, statut: "réservée" } });
      const envoiId = `env-${l.id}-wa-visio-${maintenant.toString(36)}${aleatoire(4, "abcdefghijklmnopqrstuvwxyz0123456789")}`;
      await retireDeLaSalle(sb, l.id, "visio déplacée");
      const whatsapp = await confirmeSurWhatsApp(sb, req, {
        id: l.id,
        nom: l.nom,
        telephone: l.telephone,
        debut: debutIso,
        chemin: cheminDeLaSalle(l.id, jetonDuLien2),
        branchId: l.branch_id ?? null,
        envoiId
      }).catch(() => "erreur");
      if (jetonNeuf) await sb.from("visios").update({ lien_etat: parti(whatsapp) ? "whatsapp" : "a-envoyer" }).eq("id", l.id);
      dis("déplacée", { id: l.id, par: porte, debut: debutIso, whatsapp });
      return json({
        ok: true,
        debut: debutIso,
        fin: finDe(debutIso),
        deplacements,
        reste: Math.max(0, r.changementsMax - deplacements),
        whatsapp,
        parWhatsApp: parti(whatsapp)
      });
    }
    if (geste === "entrer-maison") {
      if (!await delEquipe(sb, req)) return json({ ok: false, motif: "reserve-a-l-equipe" }, 403);
      const l = await parLId(sb, corps.id);
      if (!l) return json({ ok: false, motif: "inconnue" }, 404);
      if (!cle) return json({ ok: false, motif: "sans-service" }, 503);
      return await entre(sb, cle, l, "Maison MND", true);
    }
    if (geste === "nouveau-lien") {
      if (!await delEquipe(sb, req)) return json({ ok: false, motif: "reserve-a-l-equipe" }, 403);
      const l = await parLId(sb, corps.id);
      if (!l) return json({ ok: false, motif: "inconnue" }, 404);
      if (l.statut === "annulée") return json({ ok: false, motif: "annulee" }, 409);
      if (Date.now() >= Date.parse(l.fin)) return json({ ok: false, motif: "fermee" }, 409);
      const jeton = aleatoire(32);
      const { error } = await sb.from("visios").update({ jeton_hash: await empreinte(jeton), maj_le: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", l.id);
      if (error) return json({ ok: false, motif: "ecriture" }, 500);
      await sb.from("visios").update({ lien_etat: "a-la-main" }).eq("id", l.id);
      dis("nouveau lien", { id: l.id });
      return json({ ok: true, id: l.id, debut: l.debut, fin: l.fin, chemin: cheminDeLaSalle(l.id, jeton) });
    }
    if (geste === "suite") {
      if (!await delEquipe(sb, req)) return json({ ok: false, motif: "reserve-a-l-equipe" }, 403);
      const l = await parLId(sb, corps.id);
      if (!l) return json({ ok: false, motif: "inconnue" }, 404);
      const resume = resumeSur(l.resume);
      if (l.statut !== "tenue" || !resume) return json({ ok: false, motif: "sans-resume" }, 409);
      if (l.suite_vue_le) return json({ ok: true, rituel: "vue", privee: "vue" });
      const affiches = affichesDeLaSuite(resume, l.consultation_id, await sansLocksDe(sb, l.consultation_id));
      const prenom = prenomDe(l.nom);
      const pasAvantMs = Date.parse(l.fin);
      const commun = { visioId: l.id, branchId: l.branch_id ?? null, debut: l.debut, prenom, telephone: l.telephone, pasAvantMs };
      const garde = (suffixe, presente) => presente ? Promise.resolve(0) : retireDeLaSalle(sb, l.id, "la Maison ne la propose plus", (id) => id !== `env-${l.id}-wa-suite-${suffixe}`);
      await garde("rituel", !!affiches.rituel);
      await garde("privee", !!affiches.privee);
      let rituel = "rien";
      if (affiches.rituel) {
        const gestes = affiches.rituel.noms.join(" et ") || "votre rituel";
        rituel = await deposeLeModele(sb, {
          ...commun,
          id: `env-${l.id}-wa-suite-rituel`,
          modele: (Deno.env.get("WA_TEMPLATE_RESA_PREPAREE") ?? "").trim() || "reservation_preparee",
          composants: [
            { type: "body", parameters: [{ type: "text", text: prenom || "Madame" }, { type: "text", text: gestes }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: affiches.rituel.jeton }] }
          ],
          texteAuFil: `Bonjour ${prenom || "Madame"}, la Maison MND a préparé votre réservation : ${gestes}. Il ne vous reste qu’à choisir votre jour et votre heure.`
        }).catch(() => "erreur");
      }
      let privee = "rien";
      if (affiches.privee) {
        const ou = affiches.privee.ligne.charAt(0).toLowerCase() + affiches.privee.ligne.slice(1);
        privee = !l.consultation_id ? "sans-consultation" : await deposeLeModele(sb, {
          ...commun,
          id: `env-${l.id}-wa-suite-privee`,
          modele: (Deno.env.get("WA_TEMPLATE_SUITE_PRIVEE") ?? "").trim(),
          composants: [
            { type: "body", parameters: [{ type: "text", text: prenom || "Madame" }, { type: "text", text: ou }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: l.consultation_id }] }
          ],
          texteAuFil: `Bonjour ${prenom || "Madame"}, merci pour votre visio avec la Maison MND. La Maison vous propose la consultation privée, ${ou}. Touchez « Choisir mon moment » pour la réserver.`
        }).catch(() => "erreur");
      }
      dis("suite", { id: l.id, rituel, privee });
      return json({ ok: true, rituel, privee });
    }
    if (geste === "moments-privee") {
      const r = await reglages(sb);
      const branche = await brancheDe(sb, typeof corps.branchId === "string" && corps.branchId ? corps.branchId : null);
      if (!branche) return json({ ok: true, moments: [], dureeMin: r.priveeDureeMin });
      const maintenant = Date.now();
      const horizon = Math.max(1, Math.min(60, Math.round(Number(corps.horizonJours ?? 30)) || 30));
      const du = jourDeCotonou(maintenant);
      const au = jourDeCotonou(maintenant + (horizon + 1) * 864e5);
      const agenda = await lisLAgenda(sb, branche.id, du, au);
      const moments = agenda ? placesDeLaPrivee(agenda, r.priveeDureeMin, maintenant, horizon).map((p) => ({ jour: p.iso, heure: p.heure })) : [];
      return json({ ok: true, moments, dureeMin: r.priveeDureeMin, lisible: !!agenda });
    }
    if (geste === "reserver-privee") {
      const consultationId = typeof corps.consultationId === "string" && FORME_DE_LA_CONSULTATION.test(corps.consultationId) ? corps.consultationId : "";
      if (!consultationId) return json({ ok: false, motif: "incomplet" }, 400);
      const moment = momentSur(corps.moment);
      if (corps.moment !== void 0 && corps.moment !== null && !moment) return json({ ok: false, motif: "incomplet" }, 400);
      if (!await delEquipe(sb, req) && !await permis(sb, ipDe(req))) return json({ ok: false, motif: "rate_limited" }, 429);
      const rendu = await reserveLaPrivee(sb, consultationId, moment);
      return json(rendu.corps, rendu.status);
    }
    return json({ ok: false, motif: "geste inconnu" }, 400);
  } catch (e) {
    dis("erreur", { geste, motif: String(e?.message ?? e).slice(0, 120) });
    return json({ ok: false, motif: "erreur" }, 500);
  }
});
