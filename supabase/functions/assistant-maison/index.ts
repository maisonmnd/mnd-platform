// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   ASSISTANT-MAISON : le passage du matin de l'Assistant Maison.

   Fichier fabriqué par `node scripts/assistant-maison-serveur.mjs` depuis
   `scripts/serveur/assistant-maison.ts` et les modules purs du dépôt (le
   cerveau, la lecture des fiches, la Cadence) : le plan qu'elle dépose est
   celui que le Trône montre. On ne le corrige jamais ici : on corrige le
   dépôt et on refait le fichier.

   Chaque réveil : elle dit qu'elle vit, fabrique les remises à son nom des
   messages PARTIS, et le premier réveil après 8 h (heure du salon), si
   l'Assistant est Actif, dépose le plan du jour dans la salle d'attente.
   Le facteur `envois-partent` porte les messages, jamais la nuit.

   AUCUN SECRET ICI : la clé service vient de l'environnement.

   Déploiement : Supabase → Edge Functions → New function
   « assistant-maison » → coller CE FICHIER ENTIER → Deploy. Puis le cron
   (Integrations → Cron), toutes les quinze minutes : `0,15,30,45 * * * *`,
   avec l'en-tête Authorization: Bearer <clé service>, comme le facteur.
   ═══════════════════════════════════════════════════════════════════ */
// scripts/serveur/assistant-maison.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// src/shared/agenda-pur.ts
var pad2 = (n) => n < 10 ? `0${n}` : `${n}`;
var hourToMin = (h) => {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(h.trim());
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 9 * 60;
};
var hhmmDeMinutes = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
var JOURS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
function ouvertureDuJour(dateIso, semaine, exceptions = []) {
  const FERME = { closed: true, openMin: 0, closeMin: 0 };
  const dow = (/* @__PURE__ */ new Date(`${dateIso}T00:00:00`)).getDay();
  const jour = semaine.find((h) => h.key === JOURS[dow]);
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
function creneauxLibres(o) {
  if (o.opening.closed) return [];
  const capMaison = o.capMaison ?? 0;
  const capMaitre = o.capMaitre ?? 0;
  if (capMaison > 0 && o.occupes.length >= capMaison) return [];
  const duMaitre = o.occupes.filter((a2) => a2.maitre === o.master);
  if (capMaitre > 0 && duMaitre.length >= capMaitre) return [];
  const busy = duMaitre.map((a2) => [a2.debutMin, a2.debutMin + a2.dureeMin]);
  if (o.bloques) busy.push(...o.bloques);
  const pas = o.pasMin ?? 60;
  const cap = o.capSimultane ?? 0;
  const out = [];
  for (let m = o.opening.openMin; m + o.durationMin <= o.opening.closeMin; m += pas) {
    if (o.maintenantMin != null && m <= o.maintenantMin) continue;
    const overlaps = busy.some(([s, e]) => m < e && m + o.durationMin > s);
    if (overlaps) continue;
    if (cap > 0) {
      const ensemble = o.occupes.filter((a2) => m < a2.debutMin + a2.dureeMin && m + o.durationMin > a2.debutMin).length;
      if (ensemble >= cap) continue;
    }
    out.push(hhmmDeMinutes(m));
  }
  return out;
}
var apptPaidXof = (a2) => a2.payments?.length ? a2.payments.reduce((s, p) => s + (Number(p.amountXof) || 0), 0) : Number(a2.paidXof) || 0;
var dureeDuRendezVous = (a2, byId) => a2.dureeMin || (a2.serviceIds ?? []).map((id) => byId.get(id)).filter((s) => !!s).reduce(
  (sum, s) => sum + ((a2.longueur ? s.dureeParLongueur?.[a2.longueur] : void 0) ?? s.durationMin),
  0
) || 60;

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

// src/shared/clients-pur.ts
var estDePassage = (c) => c.dePassage === true;
var aDefaitSesLocks = (c) => c.locksDefaits === true;
var estDiaspora = (c) => c.diaspora === true || (c.segments ?? []).some((s) => s.trim().toLowerCase() === "diaspora");
var MOIS_AVANT_SORTIE = 5;
var moisAvant = (iso2, n) => {
  const [y, m, d] = iso2.split("-").map((x) => parseInt(x, 10));
  const cible = new Date(y, m - 1 - n, 1);
  const dernierJour = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate();
  const jour = Math.min(d, dernierJour);
  const mm = String(cible.getMonth() + 1).padStart(2, "0");
  return `${cible.getFullYear()}-${mm}-${String(jour).padStart(2, "0")}`;
};
var dortDepuisLongtemps = (c, derniereVenue2, aujourdhui, mois = MOIS_AVANT_SORTIE) => {
  if (!derniereVenue2) return false;
  if (estDiaspora(c)) return false;
  return derniereVenue2 < moisAvant(aujourdhui, mois);
};
function ageDe(birthday, aujourdhui) {
  if (!birthday) return void 0;
  const n = /* @__PURE__ */ new Date(`${birthday}T00:00:00`);
  const j = /* @__PURE__ */ new Date(`${aujourdhui}T00:00:00`);
  if (Number.isNaN(n.getTime()) || Number.isNaN(j.getTime())) return void 0;
  let a2 = j.getFullYear() - n.getFullYear();
  const m = j.getMonth() - n.getMonth();
  if (m < 0 || m === 0 && j.getDate() < n.getDate()) a2 -= 1;
  return a2;
}
var estMineur = (client, aujourdhui) => {
  const a2 = ageDe(client.birthday, aujourdhui);
  return a2 !== void 0 && a2 < 18;
};

// src/shared/cadence-pur.ts
var pad22 = (n) => String(n).padStart(2, "0");
var toISO = (d) => `${d.getFullYear()}-${pad22(d.getMonth() + 1)}-${pad22(d.getDate())}`;
var fromISO = (iso2) => /* @__PURE__ */ new Date(`${iso2.slice(0, 10)}T12:00:00`);
var addDaysISO = (iso2, n) => {
  const d = fromISO(iso2);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
var timeToMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
var prochainJourOuvertSelon = (iso2, estFerme) => {
  let d = iso2;
  for (let i = 0; i < 14; i += 1) {
    if (!estFerme(d)) return d;
    d = addDaysISO(d, 1);
  }
  return iso2;
};
var prochaineOccurrence = (depart, pas, today) => {
  let iso2 = depart;
  for (let i = 0; i < 200 && iso2 < today; i += 1) iso2 = addDaysISO(iso2, Math.max(1, pas));
  return iso2;
};
var prochainJourDeSemaine = (iso2, jour) => {
  const ecart = (jour - fromISO(iso2).getDay() + 7) % 7;
  return ecart === 0 ? iso2 : addDaysISO(iso2, ecart);
};
var sesJours = (j) => {
  if (j === void 0) return [];
  const l = (typeof j === "number" ? [j] : [...j]).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return [...new Set(l)].slice(0, 2);
};
var prochainJourParmi = (iso2, jours) => {
  if (jours.length === 0) return iso2;
  let meilleur = "";
  for (const j of jours) {
    const d = prochainJourDeSemaine(iso2, j);
    if (!meilleur || d < meilleur) meilleur = d;
  }
  return meilleur;
};
var poseLaDateSelon = (iso2, jourPrefere, estFerme) => {
  const jours = sesJours(jourPrefere);
  return prochainJourOuvertSelon(jours.length === 0 ? iso2 : prochainJourParmi(iso2, jours), estFerme);
};
var medianInt = (xs) => {
  const s = [...xs].sort((a2, b) => a2 - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
function cadenceObservee(appts, clientId) {
  const joursEntre = (a2, b) => Math.round((fromISO(b).getTime() - fromISO(a2).getTime()) / 864e5);
  const honorees = appts.filter((a2) => a2.clientId === clientId && a2.status === "honoré").sort((a2, b) => a2.date.localeCompare(b.date));
  const visites = honorees.filter((a2) => !(a2.seriesIndex && a2.seriesIndex > 1));
  if (visites.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < visites.length; i++) gaps.push(joursEntre(visites[i - 1].date, visites[i].date));
  const use = gaps.filter((g) => g > 0);
  const sample = use.length || gaps.length;
  const base = use.length ? use : gaps;
  const jours = Math.max(14, medianInt(base));
  const mean = base.reduce((acc, g) => acc + g, 0) / base.length;
  const variance = base.reduce((acc, g) => acc + (g - mean) ** 2, 0) / base.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const confidence = sample >= 3 && cv < 0.35 ? "haute" : sample >= 2 && cv < 0.6 ? "moyenne" : "faible";
  return { jours, semaines: Math.max(2, Math.round(jours / 7)), sample, confidence };
}
function predictNextVisitSelon(appts, cliente, clientId, today, estFerme) {
  const none = { iso: null, predicted: false, avgDays: null, confidence: null, overdueDays: 0, sample: 0, template: null };
  const mine = appts.filter((a2) => a2.clientId === clientId);
  const upcoming = mine.filter((a2) => a2.date >= today && a2.status !== "annulé" && a2.status !== "honoré").sort((a2, b) => a2.date.localeCompare(b.date) || timeToMin(a2.time) - timeToMin(b.time))[0];
  if (upcoming) return { ...none, iso: upcoming.date, predicted: false };
  if (cliente && (estDePassage(cliente) || estDiaspora(cliente) || aDefaitSesLocks(cliente))) return none;
  const honored = mine.filter((a2) => a2.status === "honoré").sort((a2, b) => a2.date.localeCompare(b.date));
  if (honored.length === 0) return none;
  const template = honored[honored.length - 1];
  if (cliente && dortDepuisLongtemps(cliente, template.date, today, MOIS_AVANT_SORTIE)) return none;
  const daysBetween = (a2, b) => Math.round((fromISO(b).getTime() - fromISO(a2).getTime()) / 864e5);
  const visits = honored.filter((a2) => !(a2.seriesIndex && a2.seriesIndex > 1));
  const obs = cadenceObservee(mine, clientId);
  if (visits.length >= 2 && obs) {
    const { jours: med, sample, confidence } = obs;
    const echeance2 = addDaysISO(visits[visits.length - 1].date, med);
    const iso3 = poseLaDateSelon(prochaineOccurrence(echeance2, med, today), cliente?.jourPrefere, estFerme);
    return { iso: iso3, predicted: true, avgDays: med, confidence, overdueDays: Math.max(0, daysBetween(echeance2, today)), sample, template };
  }
  const echeance = addDaysISO(template.date, 30);
  const iso2 = poseLaDateSelon(prochaineOccurrence(echeance, 30, today), cliente?.jourPrefere, estFerme);
  return { iso: iso2, predicted: true, avgDays: 30, confidence: "faible", overdueDays: Math.max(0, daysBetween(echeance, today)), sample: 0, template };
}

// src/shared/civilite.ts
var DIT = { madame: "Madame", mademoiselle: "Mademoiselle", monsieur: "Monsieur" };
var civiliteDe = (c) => c?.civilite && DIT[c.civilite] ? c.civilite : c?.auMasculin ? "monsieur" : "madame";
var prenomSeul = (nom) => (nom ?? "").trim().split(/\s+/)[0] ?? "";
var appelDe = (c, repli) => {
  const prenom = prenomSeul(c?.name ?? repli);
  const connue = !!c?.civilite && !!DIT[c.civilite] || !!c?.auMasculin;
  if (!connue) return prenom || "Madame, Monsieur";
  const mot = DIT[civiliteDe(c)];
  return prenom ? `${mot} ${prenom}` : mot;
};

// src/shared/audiences-pur.ts
var aAccepteLesNouvelles = (c) => c.nouvelles?.oui === true;

// src/shared/entre-deux-pur.ts
var RANG = { conseil: 0, voir: 1, sante: 2 };
var SOUCIS = [
  {
    cle: "seches",
    dit: "Sèches",
    niveau: "conseil",
    mots: ["sec", "secs", "seche", "seches", "sechent", "deshydrat*", "tirent", "tire"],
    brouillon: "Nourrir : quelques gouttes d’huile légère sur le cuir chevelu, deux fois par semaine, en massage lent. Sécher entièrement après chaque lavage.",
    suite: "Le Soin Hydratant DÀNDÀN à la prochaine séance"
  },
  {
    cle: "cassantes",
    dit: "Cassantes, qui s’amincissent",
    niveau: "voir",
    mots: ["cass*", "aminci*", "fines", "fragile*", "coupent"],
    brouillon: "Votre maîtresse vous rappelle. En attendant : pas d’attache serrée, et un foulard en satin la nuit.",
    suite: "Un diagnostic KÒKÒ, une reconstruction GBÌGBÌ",
    avancer: true
  },
  {
    cle: "inegales",
    dit: "Inégales, racines qui s’emmêlent",
    niveau: "voir",
    mots: ["inegal*", "emmel*", "colle", "collent", "fusion*"],
    brouillon: "Votre maîtresse regarde et vous rappelle. Ne séparez pas les racines vous-même.",
    suite: "Avancer la reprise, une reprise frontale",
    avancer: true
  },
  {
    cle: "pousse",
    dit: "Racines qui ont trop poussé",
    niveau: "conseil",
    mots: ["pousse", "poussent", "repousse", "defait*", "defont"],
    brouillon: "C’est le signe que la reprise approche. La Maison peut avancer votre rendez-vous : choisissez l’heure qui vous va.",
    suite: "Avancer le rendez-vous",
    avancer: true
  },
  {
    cle: "odeur",
    dit: "Odeur, séchage long",
    niveau: "conseil",
    mots: ["odeur*", "sent", "humide", "sechage"],
    brouillon: "Sceller : séchez entièrement avant de nouer, et jamais de couronne humide sous le foulard.",
    suite: "La Purification WÈWÈ si cela dure"
  },
  {
    cle: "gratte",
    dit: "Ça gratte, plaques, rougeurs",
    niveau: "sante",
    mots: ["gratt*", "demang*", "plaque*", "rougeur*", "irrit*", "croute*", "pellicule*"],
    brouillon: "Merci de nous l’avoir dit. Votre maîtresse vous rappelle. En attendant, ne grattez pas et ne mettez aucun produit nouveau.",
    suite: "Un médecin si besoin ; aucun conseil écrit"
  },
  {
    cle: "chute",
    dit: "Chute, trous, douleur",
    niveau: "sante",
    mots: ["chute", "tombent", "perds", "trou", "trous", "douleur*", "doulour*", "saign*", "brule*", "infection*"],
    brouillon: "Merci de nous l’avoir dit. La Maison vous rappelle très vite.",
    suite: "Un médecin si besoin ; aucun conseil écrit"
  },
  {
    cle: "autre",
    dit: "Autre chose",
    niveau: "voir",
    mots: [],
    brouillon: "Merci de nous l’avoir dit. Votre maîtresse vous répond.",
    suite: "Selon ce qu’elle dit"
  }
];
var souciDe = (cle) => SOUCIS.find((s) => s.cle === cle);
function niveauDe(cles) {
  let n = "conseil";
  for (const c of cles) {
    const s = souciDe(c);
    if (s && RANG[s.niveau] > RANG[n]) n = s.niveau;
  }
  return n;
}

// src/shared/gerard-entre-deux-pur.ts
function souciOuvertDe(siens) {
  const ouverts = siens.filter((s) => s.etat === "ouvert" && !s.bien && (s.soucis ?? []).length > 0).map((s) => niveauDe(s.soucis));
  if (ouverts.includes("sante")) return "sante";
  if (ouverts.includes("voir")) return "a-voir";
  return void 0;
}

// src/shared/gestes-en-francais.ts
var GESTES_EN_FRANCAIS = {
  "VÈKPÈ": { court: "Création", long: "Création de locks" },
  "SÍNSIN": { court: "Resserrage", long: "Resserrage des racines" },
  "FÍNFÍN": { court: "Restauration", long: "Restauration" },
  "YÈKPÈ": { court: "Couleur", long: "Couleur végétale" },
  "GBÀTÀ": { court: "Défaisage", long: "Défaisage" },
  "DÀNDÀN": { court: "Hydratation", long: "Hydratation" },
  "KLƆKLƆ": { court: "Lavage", long: "Lavage rituel" },
  "KÒKÒ": { court: "Consultation", long: "Consultation" },
  "GBÌGBÌ": { court: "Reconstruction", long: "Reconstruction" },
  "GBÈJÍ": { court: "Entretien", long: "Entretien suivi" },
  /* Les noms du catalogue, choisis par Yéman au sélecteur le 13 octobre 2026. */
  "VÍVÍVÓ": { court: "Activateur", long: "Activateur de pousse" },
  "WÈWÈ": { court: "Purification", long: "Purification" }
};
var litLaMarqueWa = (nom) => {
  const s = String(nom ?? "").replace(/\s+/g, " ").trim();
  const m = /^([^\s™®]+)(?:™|®)?\s*(.*)$/u.exec(s);
  const marque = (m?.[1] ?? "").normalize("NFC");
  const brutDuReste = m?.[2] ?? "";
  const reste = brutDuReste.replace(/^[·:–-]\s*/u, "");
  const variante = reste.split(" · ")[0]?.trim() ?? "";
  return { marque, variante, sansNiveau: /^[·:–-]/u.test(brutDuReste) };
};

// src/shared/objectifs-des-fauteuils-pur.ts
var DEBUT_DE_L_HISTOIRE = "2025-01-01";
var SEMAINES_RECENTES = 26;
var JOURS_MIN = 6;
var iso = (d) => d.toISOString().slice(0, 10);
function ajouteJours(j, n) {
  const d = /* @__PURE__ */ new Date(`${j}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
var jourDeSemaine = (j) => (/* @__PURE__ */ new Date(`${j}T12:00:00Z`)).getUTCDay();
function rdvParJour(rdvs) {
  const m = /* @__PURE__ */ new Map();
  for (const a2 of rdvs) {
    if (a2.status === "annulé" || !/^\d{4}-\d{2}-\d{2}$/.test(String(a2.date))) continue;
    m.set(a2.date, (m.get(a2.date) ?? 0) + 1);
  }
  return m;
}
function quantile(tries, part) {
  if (tries.length === 0) return 0;
  const k = Math.min(tries.length - 1, Math.max(0, Math.ceil(part * tries.length) - 1));
  return tries[k];
}
function reperesParJour(o) {
  const hier = ajouteJours(o.aujourdhui, -1);
  const recent = ajouteJours(o.aujourdhui, -7 * SEMAINES_RECENTES);
  const vus = [[], [], [], [], [], [], []];
  const tous = [[], [], [], [], [], [], []];
  for (let j = DEBUT_DE_L_HISTOIRE; j <= hier; j = ajouteJours(j, 1)) {
    const n = o.parJour.get(j) ?? 0;
    if (!o.ouvertLe(j) && n === 0) continue;
    const s = jourDeSemaine(j);
    tous[s].push(n);
    if (j >= recent) vus[s].push(n);
  }
  return vus.map((recents, s) => {
    const lus = recents.length >= JOURS_MIN ? recents : tous[s];
    const depuis = recents.length >= JOURS_MIN ? recent > DEBUT_DE_L_HISTOIRE ? recent : DEBUT_DE_L_HISTOIRE : DEBUT_DE_L_HISTOIRE;
    const tries = [...lus].sort((a2, b) => a2 - b);
    const objectif = quantile(tries, 0.75);
    return {
      jour: s,
      jours: tries.length,
      ordinaire: quantile(tries, 0.5),
      objectif,
      plafond: quantile(tries, 0.9),
      record: tous[s].length ? Math.max(...tous[s]) : 0,
      atteint: tries.filter((n) => n >= objectif).length,
      depuis
    };
  });
}
var reperesDe = (reperes, j) => reperes[jourDeSemaine(j)];

// src/shared/previsions-pur.ts
var estUneVenue = (a2, aujourdhui) => a2.status === "honoré" || a2.date < aujourdhui && a2.status !== "annulé" && (!!a2.encaisse || !!a2.facture);

// src/shared/finance-pur.ts
var ligneNetXof = (l) => Math.max(0, l.qty * l.unitXof * (1 - l.discountPct / 100) - (l.discountXof ?? 0));
var invoiceTotal = (inv) => {
  const sub = inv.lines.reduce((s, l) => s + ligneNetXof(l), 0);
  return Math.max(0, Math.round(sub * (1 - inv.globalDiscountPct / 100)) - (inv.globalDiscountXof ?? 0));
};
var invoiceReglements = (inv) => {
  if (inv.payments && inv.payments.length > 0) return inv.payments;
  if (inv.status !== "payée") return [];
  return [{
    id: `ip-${inv.id}`,
    date: inv.date,
    amountXof: invoiceTotal(inv),
    method: inv.payment ?? "Espèces",
    cashbox: inv.cashbox,
    time: inv.time,
    /* La devise de la pièce d'avant descend sur son versement unique : les
       lectures par versement (tiroir en devise, PDF) n'ont ainsi qu'UNE forme. */
    ...inv.fx ? { fx: inv.fx } : {},
    ...inv.encaissePar ? { encaissePar: inv.encaissePar } : {}
  }];
};
var invoiceRegleXof = (inv) => invoiceReglements(inv).reduce((s, p) => s + p.amountXof, 0);
var invoiceResteXof = (inv) => Math.max(0, invoiceTotal(inv) - invoiceRegleXof(inv));

// src/shared/relances-pur.ts
var seRelance = (f) => f.kind === "facture" && f.status !== "brouillon";

// src/shared/cartes-cadeaux-pur.ts
var estEchue = (c, aujourdhui) => !!c.valableJusquau && c.valableJusquau < aujourdhui.slice(0, 10);
function etatDeLaCarte(c, aujourdhui) {
  if (c.statut === "annulee") return "annulee";
  if (c.statut === "a-regler") return "a-regler";
  if (c.statut === "rattachee") return "sur-sa-fiche";
  if (estEchue(c, aujourdhui)) return "echue";
  if (!c.remiseLe) return c.remise === "imprimee" ? "a-remettre" : "a-envoyer";
  return "attend-sa-visite";
}

// src/shared/promos-pur.ts
var uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
var HEURES_DE_LA_PROMO = 48;
var ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
var normaliseLeCode = (brut) => (brut ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
var tireDeLAlphabet = (n) => {
  let s = "";
  for (let i = 0; i < n; i += 1) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
};
var prefixeDuCode = (mot, pct) => {
  const m = normaliseLeCode(mot).slice(0, 10) || "PROMO";
  return pct && pct > 0 ? `${m}${Math.round(pct)}` : m;
};
var expirationDe = (creeLe, heures = HEURES_DE_LA_PROMO) => new Date(Date.parse(creeLe) + heures * 36e5).toISOString();
function fabriqueLeCode(a2, deja = []) {
  const creeLe = a2.maintenant ?? (/* @__PURE__ */ new Date()).toISOString();
  const pris = new Set(deja.map((c) => normaliseLeCode(c.code)));
  const prefixe = prefixeDuCode(a2.mot, a2.remisePct);
  let code = `${prefixe}-${tireDeLAlphabet(3)}`;
  for (let i = 0; i < 20 && pris.has(normaliseLeCode(code)); i += 1) code = `${prefixe}-${tireDeLAlphabet(3)}`;
  if (pris.has(normaliseLeCode(code))) code = `${prefixe}-${tireDeLAlphabet(5)}`;
  return {
    id: uid(),
    branchId: a2.branchId,
    clientId: a2.clientId,
    clientNom: a2.clientNom,
    code,
    remisePct: a2.remisePct && a2.remisePct > 0 ? Math.round(a2.remisePct) : void 0,
    remiseXof: a2.remiseXof && a2.remiseXof > 0 ? Math.round(a2.remiseXof) : void 0,
    serviceId: a2.serviceId,
    creeLe,
    expireLe: expirationDe(creeLe, a2.heures ?? HEURES_DE_LA_PROMO),
    parQui: a2.parQui,
    note: a2.note
  };
}
var estUtilise = (c) => !!c.utiliseLe;
var estExpire = (c, maintenant) => Date.parse(c.expireLe) <= Date.parse(maintenant);
var codesVivantsDe = (codes, clientId, maintenant, branchId) => codes.filter((c) => c.clientId === clientId && (!branchId || c.branchId === branchId) && !estUtilise(c) && !estExpire(c, maintenant)).sort((a2, b) => a2.expireLe.localeCompare(b.expireLe));

// src/shared/processus-pur.ts
var minutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
function deuxPlaces(jours) {
  const avec = jours.filter((j) => j.heures.length > 0);
  if (avec.length >= 2) return [{ iso: avec[0].iso, heure: avec[0].heures[0] }, { iso: avec[1].iso, heure: avec[1].heures[0] }];
  if (avec.length === 1) {
    const h = avec[0].heures;
    const seconde = h.find((x) => minutes(x) >= 13 * 60 && x !== h[0]) ?? h[1];
    return seconde ? [{ iso: avec[0].iso, heure: h[0] }, { iso: avec[0].iso, heure: seconde }] : [{ iso: avec[0].iso, heure: h[0] }];
  }
  return [];
}

// src/apps/trone/routes/clients/rdv-fluide-pur.ts
var PAS_DES_PLACES_MIN = 30;
var PERSONNE = "\0personne";
function placesDuJour(o) {
  const passe = o.iso < o.aujourdhui;
  if (o.ouverture.closed || passe) return { iso: o.iso, ferme: o.ouverture.closed, passe, heures: [] };
  const heures = creneauxLibres({
    opening: o.ouverture,
    durationMin: Math.max(15, Math.round(o.durationMin)),
    occupes: o.occupes,
    bloques: o.bloques,
    master: PERSONNE,
    capSimultane: Math.max(0, Math.floor(o.sieges)),
    maintenantMin: o.iso === o.aujourdhui ? o.maintenantMin : null,
    pasMin: o.pasMin ?? PAS_DES_PLACES_MIN
  });
  return { iso: o.iso, ferme: false, passe: false, heures };
}

// src/shared/numero-a-prevenir-pur.ts
var telDuRdv = (a2, fiche) => (a2.numeroAPrevenir ?? "").trim() || (fiche?.phone ?? "").trim();

// src/shared/dernier-message-pur.ts
var SERVICES_DES_ENVOIS = [
  "confirmation",
  "rappel-j1",
  "accuse",
  "relance-facture",
  "rappel-echeance",
  "fin-de-paquet",
  "prix-revu"
];
var PAS_PARTI = /* @__PURE__ */ new Set(["écarté", "périmé", "échec", "retenu", "sans-abonnement", "sans-numero"]);
var jourACotonou = (quand) => {
  const q = String(quand ?? "");
  if (q.length <= 10) return q;
  const t = Date.parse(q);
  return Number.isFinite(t) ? new Date(t + 36e5).toISOString().slice(0, 10) : q.slice(0, 10);
};
var estUnService = (e) => SERVICES_DES_ENVOIS.includes(e.type ?? "") || e.type === "gerard" && e.genre === "garder";
function derniersMessagesHorsService(envois, messages = []) {
  const m = /* @__PURE__ */ new Map();
  const pose = (clientId, quand) => {
    const j = jourACotonou(quand);
    if (!clientId || !/^\d{4}-\d{2}-\d{2}$/.test(j)) return;
    const avant = m.get(clientId);
    if (!avant || j > avant) m.set(clientId, j);
  };
  for (const e of envois) {
    if (estUnService(e) || PAS_PARTI.has(e.statut ?? "")) continue;
    pose(e.clientId, e.deposeLe ?? e.quand);
  }
  for (const w of messages) if (w.sens === "sortant") pose(w.clientId, w.quand);
  return m;
}
function attendUneReponse(messages, maintenantMs) {
  const dernier = /* @__PURE__ */ new Map();
  for (const w of messages) {
    if (!w.clientId || !w.quand || w.sens !== "entrant" && w.sens !== "sortant") continue;
    const avant = dernier.get(w.clientId);
    if (!avant || w.quand > avant.quand) dernier.set(w.clientId, { sens: w.sens, quand: w.quand });
  }
  const out = /* @__PURE__ */ new Set();
  for (const [id, d] of dernier) {
    const t = Date.parse(d.quand);
    if (d.sens === "entrant" && Number.isFinite(t) && maintenantMs - t < 48 * 36e5) out.add(id);
  }
  return out;
}
function dernieresRelancesDeFacture(envois) {
  const m = /* @__PURE__ */ new Map();
  for (const e of envois) {
    if (e.type !== "relance-facture" || PAS_PARTI.has(e.statut ?? "") || !e.clientId) continue;
    const j = jourACotonou(e.deposeLe ?? e.quand);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) continue;
    const avant = m.get(e.clientId);
    if (!avant || j > avant) m.set(e.clientId, j);
  }
  return m;
}

// src/shared/assistant-reponses-pur.ts
var GESTE_DU_LIBELLE = {
  "Oui, je viens": "OUI",
  "Changer l’heure": "AUTRE",
  "Je ne peux plus": "NON",
  "Oui": "OUI",
  "Avec le soin": "SOIN",
  "Pas cette fois": "NON",
  "Une autre date": "AUTRE",
  "Merci, je réserve": "OUI",
  "Merci": "MERCI",
  "Une place": "OUI",
  "La carte cadeau": "CARTE",
  "Prendre un RDV": "OUI",
  "Pas pour l’instant": "NON"
};
var PREFIXE_DU_BOUTON = "GERARD";
var charge = (ligneId, libelle) => `${PREFIXE_DU_BOUTON}:${ligneId}:${GESTE_DU_LIBELLE[libelle] ?? "OUI"}`.slice(0, 128);

// src/shared/gerard-pur.ts
var ENVIE_TOUS_LES_JOURS = 30;
var PREMIERE_ENVIE_APRES = 30;
var ENVIE_AVANT_CADENCE_MIN = 21;
var COMBINER_AVANT = 7;
var COMBINER_JUSQUA = 4;
var ANNIV_GRACE_JOURS = 1;
var GARDER_AVANT = 2;
var GARDER_SI_POSE_DEPUIS = 7;
var RELANCE_TOUS_LES_JOURS = 28;
var RELANCE_APRES_CADENCE = 10;
var ENDORMIE_DES_JOURS = 150;
var ENDORMIE_FOIS_MAX = 3;
var ENDORMIE_ECART = 42;
var UNE_VENUE_APRES = 60;
var ECART_MIN = 14;
var ENVIE_REFUSEE_ATTEND = 90;
var CREUX_DE = 3;
var CREUX_A = 7;
var REMISE_CREUX_PCT = 15;
var REMISE_ANNIV_PCT = 10;
var ANNIV_VALABLE_JOURS = 30;
var REMISES_PAR_SEMAINE = 8;
var NOEL_DU = "11-15";
var NOEL_AU = "12-15";
var FETES_DU = "11-01";
var FETES_AU = "12-24";
var ENVIE_TOUS_LES_JOURS_EN_FETES = 21;
var RELANCE_TOUS_LES_JOURS_EN_FETES = 14;
var estSaisonDesFetes = (j) => j.slice(5) >= FETES_DU && j.slice(5) <= FETES_AU;
var intervalleDesEnvies = (j) => estSaisonDesFetes(j) ? ENVIE_TOUS_LES_JOURS_EN_FETES : ENVIE_TOUS_LES_JOURS;
var intervalleDesRelances = (j) => estSaisonDesFetes(j) ? RELANCE_TOUS_LES_JOURS_EN_FETES : RELANCE_TOUS_LES_JOURS;
var SIGNATURE = "Maison MND";
var IMAGE_DE_LA_CARTE = "https://maisonmnd.com/trone/assets/cartes/carte-anniversaire.png";
var CORPS = {
  garder: { nom: "gerard_garder", categorie: "UTILITY", corps: "Bonjour {{1}}, votre {{2}} est {{3}}. C’est toujours bon pour vous ?", boutons: ["Oui, je viens", "Changer l’heure", "Je ne peux plus"] },
  avant: { nom: "gerard_avant", categorie: "MARKETING", corps: "Bonjour {{1}}, votre prochain {{2}} approche : il est prévu {{3}}. Je vous réserve votre place ? Avec un soin ajouté le même jour, votre coiffure de sortie est offerte.", boutons: ["Oui", "Avec le soin", "Pas cette fois"] },
  envie: { nom: "gerard_envie", categorie: "MARKETING", corps: "Bonjour {{1}}, pour prendre soin de vos locks avant votre prochain {{2}}, prévu {{3}}, la Maison vous propose {{4}}. Je vous trouve une place ?", boutons: ["Oui", "Pas cette fois"] },
  place: { nom: "gerard_place", categorie: "MARKETING", corps: "Bonjour {{1}}, il est temps de votre {{2}} : nous avons de la place {{3}}. Je vous en garde une ?", boutons: ["Oui", "Une autre date", "Pas cette fois"] },
  anniversaire: { nom: "gerard_anniversaire", categorie: "MARKETING", enTete: "image", corps: "Joyeux anniversaire {{1}} ! Toute la Maison vous souhaite une très belle année. Pour l’occasion, une attention vous attend sur votre prochain soin, jusqu’au {{2}}.", boutons: ["Merci, je réserve", "Merci"] },
  carte: { nom: "gerard_carte_anniversaire", categorie: "MARKETING", enTete: "image", corps: "Joyeux anniversaire {{1}} ! Toute la Maison vous souhaite une très belle journée, et une année douce et lumineuse.", boutons: ["Merci"] },
  "carte-foyer": { nom: "gerard_carte_foyer", categorie: "MARKETING", enTete: "image", corps: "Bonjour {{1}}, joyeux anniversaire à {{2}} ! Toute la Maison lui souhaite une très belle journée, et une année douce et lumineuse.", boutons: ["Merci"] },
  fetes: { nom: "gerard_fetes", categorie: "MARKETING", corps: "Bonjour {{1}}, les fêtes approchent et les places du 15 au 24 décembre {{2}} partent vite. Je vous en garde une ? Et pour offrir, la carte cadeau de la Maison se commande en deux minutes.", boutons: ["Une place", "La carte cadeau", "Pas cette fois"] },
  endormie: { nom: "gerard_endormie", categorie: "MARKETING", corps: "Bonjour {{1}}, cela fait {{2}} mois que nous n’avons pas vu vos locks. Comment vont-elles ? Si l’envie vous prend d’un soin, la Maison a de la place les semaines qui viennent.", boutons: ["Prendre un RDV", "Pas pour l’instant"] },
  nouvelles: { nom: "nouvelles_de_la_maison", categorie: "MARKETING", corps: "Bonjour {{1}}, des nouvelles de la Maison : {{2}} Répondez simplement à ce message si cela vous tente.", boutons: ["Oui", "Pas cette fois"] }
};
var MODELES_DE_GERARD = Object.fromEntries(
  Object.entries(CORPS).map(([cle, m]) => [cle, { ...m, corps: `${m.corps}

${SIGNATURE}` }])
);
var remplis = (corps, variables) => corps.replace(/\{\{(\d+)\}\}/g, (_m, n) => variables[Number(n) - 1] ?? "");
var ESSAI_MAX = 5;
var PLAFOND_FRANCS_PAR_DEFAUT = 6e4;
var entierBorne = (x, defaut, max) => typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(max, Math.round(x)) : defaut;
var reglagesLus = (r) => ({
  mode: r?.mode === "essai" || r?.mode === "ouvert" ? r.mode : "eteint",
  essai: Array.isArray(r?.essai) ? r.essai.filter((x) => typeof x === "string").slice(0, ESSAI_MAX) : [],
  essaiDepuis: typeof r?.essaiDepuis === "string" ? r.essaiDepuis : void 0,
  dernierPassage: typeof r?.dernierPassage === "string" ? r.dernierPassage : void 0,
  remisesParSemaine: entierBorne(r?.remisesParSemaine, REMISES_PAR_SEMAINE, 30),
  plafondFrancs: entierBorne(r?.plafondFrancs, PLAFOND_FRANCS_PAR_DEFAUT, 1e6),
  eteintes: genresLus(r?.eteintes),
  jamais: Object.fromEntries(Object.entries(r?.jamais && typeof r.jamais === "object" ? r.jamais : {}).map(([id, g]) => [id, genresLus(g)]).filter(([, g]) => g.length > 0)),
  approuves: Array.isArray(r?.approuves) ? [...new Set(r.approuves.filter((n) => typeof n === "string" && Object.values(CORPS).some((m) => m.nom === n)))] : [],
  parQui: r?.parQui,
  le: r?.le
});
var partSeulSurWhatsApp = (r, cle) => r.mode !== "eteint" && r.approuves.includes(CORPS[cle].nom);
var partSeule = (s, r) => s.canal === "whatsapp" && !s.aLaMainSeulement && partSeulSurWhatsApp(r, s.modele);
function genresLus(x) {
  if (!Array.isArray(x)) return [];
  return [...new Set(x.filter((g) => typeof g === "string" && g in PRIORITE))];
}
function plafondDeLaSemaine(o) {
  const siens = o.codes.filter((c) => c.creeLe.slice(0, 10) >= o.lundi);
  let francs = 0;
  for (const c of siens) {
    if (c.utiliseLe) francs += Math.max(0, c.remiseReelleXof ?? 0);
    else if (c.expireLe > o.maintenantIso) francs += c.remiseXof ?? Math.round((c.remisePct ?? 0) / 100 * Math.max(0, o.ticketMoyenXof));
  }
  const restantes = francs >= o.plafondFrancs ? 0 : Math.max(0, o.remisesParSemaine - siens.length);
  return { faites: siens.length, francs, restantes };
}
function familleDuNom(nom) {
  const n = String(nom ?? "");
  if (/^Droit de service/i.test(n)) return "autre";
  if (/SÍNSIN|resserrage|reprise/i.test(n)) return "resserrage";
  if (/YÈKPÈ|couleur|coloration/i.test(n)) return "couleur";
  if (/DÀNDÀN|hydrat/i.test(n)) return "hydratation";
  if (/KLƆKLƆ|lavage|shampoing/i.test(n)) return "lavage";
  if (/coiffure|styling|nattes|vanilles/i.test(n)) return "coiffure";
  return "autre";
}
var ENVIE_DITE = {
  hydratation: "Un soin hydratant",
  couleur: "Une coloration",
  lavage: "Un lavage rituel",
  "midi-deux": "Une coiffure entre midi et deux",
  coiffure: "Une coiffure payante"
};
var GENRE_DIT = {
  garder: "Garder son RDV",
  anniversaire: "Anniversaire",
  combiner: "Tout combiner",
  envie: "Une envie du fil",
  creux: "Jour creux",
  noel: "Noël",
  retard: "En retard",
  "une-venue": "Une seule venue",
  endormie: "Endormie"
};
var EST_UN_SERVICE = {
  garder: true,
  combiner: false,
  retard: false,
  "une-venue": false,
  anniversaire: false,
  envie: false,
  creux: false,
  noel: false,
  endormie: false
};
var PRIORITE = {
  garder: 100,
  anniversaire: 90,
  combiner: 80,
  creux: 70,
  retard: 60,
  envie: 50,
  noel: 45,
  "une-venue": 40,
  endormie: 30
};
var JOURS2 = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
var midi = (j) => /* @__PURE__ */ new Date(`${j}T12:00:00Z`);
var plusJours = (j, n) => {
  const d = midi(j);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
var ecartJours = (a2, b) => Math.round((midi(b).getTime() - midi(a2).getTime()) / 864e5);
var jourDit = (j) => {
  const d = midi(j);
  const n = d.getUTCDate();
  return `${JOURS2[d.getUTCDay()]} ${n === 1 ? "1er" : n} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
var heureDite = (h) => {
  const [hh, mm] = String(h).split(":");
  return `${Number(hh)} h${mm && mm !== "00" ? ` ${mm}` : ""}`;
};
var placeDite = (p) => `${jourDit(p.iso)} à ${heureDite(p.heure)}`;
var moisDit = (j) => `${MOIS[Number(j.slice(5, 7)) - 1]} ${j.slice(0, 4)}`;
var bissextile = (a2) => a2 % 4 === 0 && a2 % 100 !== 0 || a2 % 400 === 0;
function moisEtJourDe(naissance) {
  const t = String(naissance ?? "").trim();
  const iso2 = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const [m, j] = iso2 ? [Number(iso2[2]), Number(iso2[3])] : fr ? [Number(fr[2]), Number(fr[1])] : [0, 0];
  if (m < 1 || m > 12 || j < 1 || j > 31) return void 0;
  return `${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}
var seFeteLe = (mj, annee) => mj === "02-29" && !bissextile(annee) ? "02-28" : mj;
function anniversaireDansLaGrace(naissance, aujourdhui) {
  const mj = moisEtJourDe(naissance);
  if (!mj) return void 0;
  return Array.from({ length: ANNIV_GRACE_JOURS + 1 }, (_, k) => plusJours(aujourdhui, -k)).find((j) => j.slice(5, 10) === seFeteLe(mj, Number(j.slice(0, 4))));
}
var derniereVenue = (f, aujourdhui) => f.rdvs.filter((r) => r.venu && r.date <= aujourdhui).reduce((d, r) => !d || r.date > d ? r.date : d, void 0);
var prochainRdv = (f, aujourdhui) => f.rdvs.filter((r) => r.date >= aujourdhui && r.status !== "annulé" && !r.venu).sort((a2, b) => (a2.date + a2.time).localeCompare(b.date + b.time))[0];
function dateDeCadence(f, aujourdhui) {
  const r = prochainRdv(f, aujourdhui);
  if (r) return { iso: r.date, posee: true };
  return f.cadence.iso ? { iso: f.cadence.iso, posee: false } : null;
}
var a = (f, fam) => f.rdvs.filter((r) => r.venu && r.familles.includes(fam)).map((r) => r.date).sort();
var vientAMidi = (f) => {
  const venues = f.rdvs.filter((r) => r.venu).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 4);
  return venues.filter((r) => {
    const s = midi(r.date).getUTCDay();
    const h = Number(r.time.slice(0, 2));
    return s >= 1 && s <= 5 && h >= 11 && h < 14;
  }).length >= 2;
};
function choisisLEnvie(f, aujourdhui) {
  const envies = f.traces.filter((t) => t.genre === "envie" && t.envie).sort((x, y) => x.quand.localeCompare(y.quand));
  const derniere = envies[envies.length - 1]?.envie;
  const refusee = (e) => envies.some((t) => t.envie === e && t.reponse === "non" && ecartJours(t.quand.slice(0, 10), aujourdhui) < ENVIE_REFUSEE_ATTEND);
  const couleurs = a(f, "couleur");
  const candidates = [];
  if (f.soucis.some((s) => s === "seches" || s === "cassantes")) candidates.push("hydratation");
  if (couleurs.length && ecartJours(couleurs[couleurs.length - 1], aujourdhui) >= 90) candidates.push("couleur");
  if (vientAMidi(f)) candidates.push("midi-deux");
  const m = Number(aujourdhui.slice(5, 7));
  if (m === 11 || m === 12 || a(f, "coiffure").length) candidates.push("coiffure");
  if ((f.cadence.rythmeJours ?? 0) >= 42) candidates.push("lavage");
  candidates.push("hydratation", "lavage");
  return candidates.find((e) => e !== derniere && !refusee(e)) ?? null;
}
function joursCreux(o) {
  let reste = Math.max(0, o.remisesRestantes);
  const out = [];
  for (let k = CREUX_DE; k <= CREUX_A; k++) {
    const j = plusJours(o.aujourdhui, k);
    if (!o.ouvertLe(j)) continue;
    const poses = o.parJour.get(j) ?? 0;
    const ordinaire = o.ordinaireDe(j);
    const manque = Math.max(0, ordinaire - poses);
    if (manque === 0) continue;
    const remises = Math.min(manque, reste);
    reste -= remises;
    out.push({ iso: j, poses, ordinaire, manque, remises });
  }
  return out;
}
var deuxPlacesDites = (p) => p.length >= 2 ? `${placeDite(p[0])} ou ${placeDite(p[1])}` : p.length === 1 ? placeDite(p[0]) : "cette semaine";
function propositionDeLEnvie(e, f, aujourdhui) {
  switch (e) {
    case "hydratation":
      return f.soucis.some((x) => x === "seches" || x === "cassantes") ? "un soin hydratant de 45 minutes, pour vos cheveux secs" : "un soin hydratant de 45 minutes";
    case "couleur": {
      const cs = a(f, "couleur");
      return `une retouche de votre couleur végétale de ${moisDit(cs[cs.length - 1] ?? aujourdhui)}`;
    }
    case "lavage":
      return "un lavage rituel (shampoing)";
    case "midi-deux":
      return "une coiffure express entre midi et deux, pendant votre pause";
    case "coiffure":
      return "une coiffure pour vos occasions";
  }
}
function modeleDeLEnvie(e, f, c, aujourdhui) {
  const prevu = !c ? "bientôt" : c.posee ? `le ${jourDit(c.iso)}` : `vers le ${jourDit(c.iso)}`;
  return { modele: "envie", variables: [f.appel, f.soinDit, prevu, propositionDeLEnvie(e, f, aujourdhui)] };
}
var traceDe = (f, genres) => f.traces.filter((t) => genres.includes(t.genre)).sort((x, y) => x.quand.localeCompare(y.quand));
var derniereTrace = (f, genres) => {
  const t = traceDe(f, genres);
  return t.length ? t[t.length - 1].quand.slice(0, 10) : void 0;
};
var TOUS_SAUF_GARDER = ["anniversaire", "combiner", "envie", "creux", "noel", "retard", "une-venue", "endormie"];
var RELANCES = ["retard", "une-venue", "endormie", "creux"];
function canalDe(f, genre) {
  if (EST_UN_SERVICE[genre]) return f.couronne ? "couronne" : f.telephone ? "whatsapp" : null;
  if (f.stop) return null;
  if (f.couronne) return "couronne";
  if (f.accord && f.telephone) return "whatsapp";
  return aLaMainSeulement(f, genre) && f.telephone ? "whatsapp" : null;
}
var RELANCES_A_LA_MAIN = ["combiner", "retard", "une-venue"];
var aLaMainSeulement = (f, genre) => !EST_UN_SERVICE[genre] && !f.stop && !f.couronne && !f.accord && RELANCES_A_LA_MAIN.includes(genre);
function anniversaireDuJour(f, ctx) {
  const A = ctx.aujourdhui;
  if (f.archivee) return null;
  const anniv = anniversaireDansLaGrace(f.birthday, A);
  if (!anniv) return null;
  const vu = (etat) => ({ clientId: f.id, jour: anniv, etat });
  if (traceDe(f, ["anniversaire"]).some((t) => t.quand.slice(0, 4) === anniv.slice(0, 4))) return vu("deja");
  if (ctx.eteintes?.includes("anniversaire")) return vu("eteinte");
  if (f.jamais?.includes("anniversaire")) return vu("jamais");
  if (f.enfantDuFoyer && !f.payeur) return vu("sans-payeur");
  const auPayeur = !!f.payeur && (!!f.enfantDuFoyer || !f.telephone && !f.couronne);
  const dest = auPayeur && f.payeur ? f.payeur : { appel: f.appel, telephone: f.telephone, couronne: f.couronne, stop: f.stop };
  if (f.stop || dest.stop) return vu("stop");
  const canal = dest.telephone ? "whatsapp" : dest.couronne ? "couronne" : null;
  if (!canal) return vu("sans-numero");
  const quand = [["Anniversaire", jourDit(anniv)], ...anniv < A ? [["Rattrapage", "pas écrit le jour même"]] : []];
  const pose = (modele, variables, pourquoi, code) => ({
    ...vu("carte"),
    situation: {
      clientId: f.id,
      genre: "anniversaire",
      canal,
      modele,
      variables,
      texte: remplis(MODELES_DE_GERARD[modele].corps, variables),
      pourquoi: [...quand, ...pourquoi],
      priorite: PRIORITE.anniversaire,
      ...code ? { code } : {},
      ...auPayeur && f.payeur ? { pourId: f.payeur.id } : {}
    }
  });
  if (auPayeur) return pose("carte-foyer", [dest.appel, f.appel], [["La carte part à", `${dest.appel}, qui paie pour le foyer`]]);
  const silence = !!f.souciOuvert || !!f.attendUneReponse || (f.resteDu ?? 0) > 0 || !!f.derniereRelanceLe && ecartJours(f.derniereRelanceLe, A) < 7;
  const sansAttention = f.ecartee ? "de passage, de la diaspora ou locks défaits" : silence ? "un silence en cours (souci, réponse due ou somme due)" : canal === "whatsapp" && !f.accord ? "pas d’accord des nouvelles" : (f.birthdayGiftAt ?? "").slice(0, 4) === anniv.slice(0, 4) ? "séance anniversaire déjà offerte" : (f.codesVivants ?? 0) > 0 ? "une remise déjà à son nom" : ctx.remisesRestantes <= 0 ? "plafond de la semaine atteint" : "";
  if (!sansAttention) {
    const jusquau = plusJours(A, ANNIV_VALABLE_JOURS);
    return pose(
      "anniversaire",
      [f.appel, jourDit(jusquau)],
      [["Remise à son nom", `${REMISE_ANNIV_PCT} %, ${ANNIV_VALABLE_JOURS} jours`]],
      { mot: "ANNIV", pct: REMISE_ANNIV_PCT, jusquau }
    );
  }
  return pose("carte", [f.appel], [["La carte seule", sansAttention]]);
}
function situationDuJour(f, ctx) {
  const A = ctx.aujourdhui;
  const sollicitable = !f.ecartee && !f.enfantDuFoyer;
  const fait = (genre, modele, variables, pourquoi, extra = {}) => {
    if (ctx.eteintes?.includes(genre) || f.jamais?.includes(genre)) return null;
    const canal = canalDe(f, genre);
    if (!canal) return null;
    const main = canal === "whatsapp" && aLaMainSeulement(f, genre);
    return {
      clientId: f.id,
      genre,
      canal,
      modele,
      variables,
      texte: remplis(MODELES_DE_GERARD[modele].corps, variables),
      pourquoi: main ? [...pourquoi, ["Accord des nouvelles", "pas encore : à la main seulement"]] : pourquoi,
      priorite: PRIORITE[genre],
      ...main ? { aLaMainSeulement: true } : {},
      ...extra
    };
  };
  const r = sollicitable ? prochainRdv(f, A) : void 0;
  if (r && ecartJours(A, r.date) === GARDER_AVANT && (!r.creeLe || ecartJours(r.creeLe.slice(0, 10), A) >= GARDER_SI_POSE_DEPUIS) && !traceDe(f, ["garder"]).some((t) => t.quand.slice(0, 10) >= plusJours(r.date, -GARDER_AVANT - 1))) {
    const s = fait(
      "garder",
      "garder",
      [f.appel, f.soinDit, placeDite({ iso: r.date, heure: r.time })],
      [["Son RDV", placeDite({ iso: r.date, heure: r.time })], ["Pris le", r.creeLe ? jourDit(r.creeLe.slice(0, 10)) : "avant le 5 sept. 2026"]]
    );
    if (s) return s;
  }
  const carte = anniversaireDuJour(f, ctx)?.situation;
  if (carte) return carte;
  if (!sollicitable) return null;
  if (f.souciOuvert) return null;
  if (f.attendUneReponse) return null;
  if ((f.resteDu ?? 0) > 0) return null;
  if (f.derniereRelanceLe && ecartJours(f.derniereRelanceLe, A) < 7) return null;
  const siens = derniereTrace(f, TOUS_SAUF_GARDER);
  const recemment = [siens, f.dernierMessageHorsService].filter((x) => !!x).sort().pop();
  const tropTot = !!recemment && ecartJours(recemment, A) < ECART_MIN;
  const aDejaUneRemise = (f.codesVivants ?? 0) > 0;
  if (tropTot) return null;
  const s0 = derniereVenue(f, A);
  const c = dateDeCadence(f, A);
  const pourquoiDuFil = [
    ["Dernière venue", s0 ? jourDit(s0) : "aucune"],
    ["Sa date de cadence", c ? `${jourDit(c.iso)}${c.posee ? " (RDV posé)" : " (la Cadence)"}` : "aucune"],
    ["Son rythme", f.cadence.rythmeJours ? `${Math.round(f.cadence.rythmeJours / 7)} semaines` : "non mesuré"]
  ];
  const creux = ctx.remisesRestantes > 0 ? ctx.creux.find((j) => j.remises > 0) : void 0;
  const offreCreux = (motif) => {
    if (!creux || aDejaUneRemise) return null;
    const places = ctx.placesDe(f.id, creux.iso);
    if (places.length === 0) return null;
    const heures = places.slice(0, 2).map((p) => heureDite(p.heure));
    return fait(
      "creux",
      "nouvelles",
      [f.appel, `une place s’est libérée ${jourDit(creux.iso)} à ${heures.join(" ou à ")}, et ce jour-là la Maison vous fait une remise sur votre ${f.soinDit}.`],
      [...pourquoiDuFil, ["Jour creux", `${jourDit(creux.iso)} : ${creux.poses} posés, ordinaire ${creux.ordinaire}`], ["Pourquoi elle", motif]],
      { code: { mot: "CREUX", pct: REMISE_CREUX_PCT, jusquau: creux.iso, jour: creux.iso } }
    );
  };
  const venues = f.rdvs.filter((x) => x.venu).length;
  if (s0 && c && A > s0 && A <= c.iso && (c.posee || venues >= 2)) {
    const avantCadence = ecartJours(A, c.iso);
    if (avantCadence <= COMBINER_AVANT && avantCadence >= COMBINER_JUSQUA && !c.posee && !traceDe(f, ["combiner"]).some((t) => t.quand.slice(0, 10) > s0)) {
      const rattrape = avantCadence < COMBINER_AVANT ? [["Rattrapage", `prévu le ${jourDit(plusJours(c.iso, -COMBINER_AVANT))}, pas écrit à temps`]] : [];
      return fait("combiner", "avant", [f.appel, f.soinDit, `vers le ${jourDit(c.iso)}`], [...pourquoiDuFil, ...rattrape]);
    }
    if (A.slice(5) >= NOEL_DU && A.slice(5) <= NOEL_AU && !traceDe(f, ["noel"]).some((t) => t.quand.slice(0, 4) === A.slice(0, 4)) && !(c.posee && c.iso.slice(5) >= "12-15" && c.iso.slice(5) <= "12-24") && !f.carteVivante) {
      return fait("noel", "fetes", [f.appel, A.slice(0, 4)], pourquoiDuFil);
    }
    const depuis = ecartJours(s0, A);
    const premiere = Math.min(PREMIERE_ENVIE_APRES, intervalleDesEnvies(A));
    const derniereEnvie = derniereTrace(f, ["envie", "creux"]);
    const dueLe = derniereEnvie && derniereEnvie > s0 ? plusJours(derniereEnvie, intervalleDesEnvies(A)) : plusJours(s0, premiere);
    if (depuis >= premiere && A >= dueLe && avantCadence >= ENVIE_AVANT_CADENCE_MIN) {
      const viaCreux = offreCreux("son envie du mois tombe sur un jour creux");
      if (viaCreux) return viaCreux;
      const e = choisisLEnvie(f, A);
      if (e) {
        const m = modeleDeLEnvie(e, f, c, A);
        return fait("envie", m.modele, m.variables, [...pourquoiDuFil, ["L’envie", ENVIE_DITE[e]]], { envie: e });
      }
    }
    return null;
  }
  if (prochainRdv(f, A)) return null;
  const derniereRelance = derniereTrace(f, RELANCES);
  if (derniereRelance && ecartJours(derniereRelance, A) < intervalleDesRelances(A)) return null;
  if (!s0) return null;
  const sansVenir = ecartJours(s0, A);
  if (sansVenir >= ENDORMIE_DES_JOURS) {
    const fois = traceDe(f, ["endormie"]);
    if (fois.length >= ENDORMIE_FOIS_MAX) return null;
    if (fois.length && ecartJours(fois[fois.length - 1].quand.slice(0, 10), A) < ENDORMIE_ECART) return null;
    const mois = Math.floor(sansVenir / 30);
    return fait(
      "endormie",
      "endormie",
      [f.appel, String(mois)],
      [...pourquoiDuFil, ["Sans venue depuis", `${mois} mois`], ["Relances d’endormie", `${fois.length} sur ${ENDORMIE_FOIS_MAX}`]]
    );
  }
  if (venues >= 2 && c && !c.posee && ecartJours(c.iso, A) >= RELANCE_APRES_CADENCE) {
    const viaCreux = offreCreux(`en retard de ${ecartJours(c.iso, A)} jours`);
    if (viaCreux) return viaCreux;
    const places = ctx.placesDe(f.id);
    return fait(
      "retard",
      "place",
      [f.appel, f.soinDit, deuxPlacesDites(places)],
      [...pourquoiDuFil, ["Date attendue", jourDit(c.iso)], ["Retard", `${ecartJours(c.iso, A)} jours`]]
    );
  }
  if (venues === 1 && sansVenir >= UNE_VENUE_APRES) {
    const places = ctx.placesDe(f.id);
    const dejaResserree = f.rdvs.some((x) => x.venu && x.familles.includes("resserrage"));
    return fait(
      "une-venue",
      "place",
      [f.appel, dejaResserree ? f.soinDit : "premier resserrage des racines", deuxPlacesDites(places)],
      [...pourquoiDuFil, ["Ses venues", "1"], ["Première venue", jourDit(s0)]]
    );
  }
  return null;
}
function planDuJour(fiches, ctx) {
  const restant = new Map(ctx.creux.map((j) => [j.iso, j.remises]));
  let semaine = ctx.remisesRestantes;
  const out = [];
  const brutes = fiches.map((f) => ({ f, s: situationDuJour(f, ctx) })).filter((x) => !!x.s).sort((x, y) => y.s.priorite - x.s.priorite);
  for (const { f, s } of brutes) {
    if (!s.code) {
      out.push(s);
      continue;
    }
    const jour = s.code.jour;
    const n = jour ? restant.get(jour) ?? 0 : 1;
    if (n > 0 && semaine > 0) {
      if (jour) restant.set(jour, n - 1);
      semaine -= 1;
      out.push(s);
      continue;
    }
    const sans = situationDuJour(f, { ...ctx, creux: [], remisesRestantes: 0 });
    if (sans) out.push(sans);
  }
  return out;
}
var HEURE_DU_PASSAGE_DE = 8;
var HEURE_DU_PASSAGE_A = 20;
var idDeLaLigne = (aujourdhui, clientId, canal) => `gerard-${aujourdhui}-${clientId}-${canal}`;
var texteSansSignature = (texte) => texte.replace(new RegExp(`\\n\\n${SIGNATURE}$`), "");
var communs = (s, o) => ({
  branchId: o.branchId,
  type: "gerard",
  clientId: s.clientId,
  prenom: o.prenom,
  apptId: s.genre === "garder" && o.rdv ? o.rdv.id : "",
  dateRdv: s.genre === "garder" && o.rdv ? o.rdv.date : "",
  ...s.genre === "garder" && o.rdv ? { heure: o.rdv.time } : {},
  deposeLe: o.maintenantIso,
  quand: o.maintenantIso,
  genre: s.genre,
  ...s.envie ? { envie: s.envie } : {},
  ...s.pourId ? { pourId: s.pourId } : {},
  modele: s.modele,
  texte: s.texte,
  ...o.codePromo ? { codePromo: o.codePromo } : s.code ? { codeAFaire: s.code } : {}
});
function ligneDeNotification(s, o) {
  return {
    id: idDeLaLigne(o.aujourdhui, s.clientId, "push"),
    canal: "push",
    statut: "en-attente",
    partA: o.partA,
    calme: o.calme,
    ...communs(s, o),
    colis: { genre: "push", clientId: o.compte, titre: SIGNATURE, corps: texteSansSignature(s.texte), url: "/couronne/" }
  };
}
function ligneWhatsApp(s, o) {
  return {
    id: idDeLaLigne(o.aujourdhui, s.clientId, "whatsapp"),
    canal: "whatsapp",
    statut: "en-attente",
    partA: o.partA,
    calme: o.calme,
    ...communs(s, o),
    colis: {
      genre: "whatsapp",
      numero: o.numero,
      modele: MODELES_DE_GERARD[s.modele].nom,
      composants: [
        /* LA CARTE EN EN-TÊTE : un modèle déposé chez Meta avec une image en
           tête exige son image à chaque envoi, sinon Meta refuse le message. */
        ...MODELES_DE_GERARD[s.modele].enTete === "image" ? [{ type: "header", parameters: [{ type: "image", image: { link: IMAGE_DE_LA_CARTE } }] }] : [],
        { type: "body", parameters: s.variables.map((v) => ({ type: "text", text: v.replace(/\s+/g, " ").trim() })) },
        /* Chaque bouton porte sa ligne : la réponse s'y écrit, l'automate ne la prend pas. */
        ...MODELES_DE_GERARD[s.modele].boutons.map((b, i) => ({
          type: "button",
          sub_type: "quick_reply",
          index: String(i),
          parameters: [{ type: "payload", payload: charge(idDeLaLigne(o.aujourdhui, s.clientId, "whatsapp"), b) }]
        }))
      ],
      texteAuFil: s.texte,
      parQui: "Assistant Maison"
    }
  };
}
function tracesDesEnvois(envois) {
  const m = /* @__PURE__ */ new Map();
  for (const e of envois) {
    if (e.type !== "gerard" || !e.clientId || !e.genre) continue;
    const pasMaintenant = e.statut === "écarté" && e.reponse === "non";
    if (!pasMaintenant && (e.statut === "écarté" || e.statut === "périmé" || e.statut === "échec" || e.statut === "sans-abonnement")) continue;
    const reponse = e.reponse === "oui" || e.reponse === "non" || e.reponse === "jamais" ? e.reponse : void 0;
    const t = { quand: e.deposeLe ?? e.quand ?? "", genre: e.genre, ...e.envie ? { envie: e.envie } : {}, ...reponse ? { reponse } : {} };
    const l = m.get(e.clientId);
    if (l) l.push(t);
    else m.set(e.clientId, [t]);
  }
  return m;
}

// src/shared/assistant-lecture-pur.ts
var NOM_DE_LA_FAMILLE = {
  resserrage: "resserrage des racines",
  couleur: "couleur végétale",
  hydratation: "soin hydratant",
  lavage: "lavage rituel",
  coiffure: "coiffure",
  autre: "soin"
};
var lundiDe = (j) => {
  const d = /* @__PURE__ */ new Date(`${j}T12:00:00Z`);
  const s = (d.getUTCDay() + 6) % 7;
  return addDaysISO(j, -s);
};
function lisLAssistant(e) {
  const today = e.aujourdhui;
  const { clients, rdvs: appts, prestations: byId, pieces, codes, abonnes: abonnes2 } = e;
  const factures = new Set(pieces.filter((p) => p.apptId && p.kind === "facture").map((p) => p.apptId));
  const parCliente = /* @__PURE__ */ new Map();
  for (const a2 of appts) {
    const l = parCliente.get(a2.clientId);
    if (l) l.push(a2);
    else parCliente.set(a2.clientId, [a2]);
  }
  const nomDuService = (id) => byId.get(id)?.name ?? "";
  const ilYA60 = addDaysISO(today, -60);
  const traces = tracesDesEnvois(e.envois);
  const abonnee = (c) => abonnes2.has(c.id) || !!c.authUserId && abonnes2.has(c.authUserId);
  const maintenantIso = new Date(e.maintenantMs).toISOString();
  const rg = reglagesLus(e.reglagesGerard);
  const estFerme = (iso2) => e.ouverture(iso2).closed;
  const resteDu = /* @__PURE__ */ new Map();
  for (const p of pieces) {
    if (!seRelance(p)) continue;
    const reste = invoiceResteXof(p);
    if (reste > 0) resteDu.set(p.clientId, (resteDu.get(p.clientId) ?? 0) + reste);
  }
  const envoisLus = e.envois;
  const messagesLus = e.messages;
  const dernierHorsService = derniersMessagesHorsService(envoisLus, messagesLus);
  const derniereRelance = dernieresRelancesDeFacture(envoisLus);
  const attend = attendUneReponse(messagesLus, e.maintenantMs);
  const payeurDe = new Map(e.familles.map((f) => [f.id, f.payerClientId]));
  const ficheDe = new Map(clients.map((c) => [c.id, c]));
  const stopDe = (c) => c.nouvelles?.par === "stop" && c.nouvelles?.oui === false;
  const aUnNumero = (c) => (c.phone ?? "").replace(/\D/g, "").length >= 8;
  const payeurDeLaFiche = (c) => {
    const id = c.familyId ? payeurDe.get(c.familyId) : void 0;
    const p = id && id !== c.id ? ficheDe.get(id) : void 0;
    return p ? { id: p.id, appel: appelDe(p), telephone: aUnNumero(p), couronne: abonnee(p), stop: stopDe(p) } : void 0;
  };
  const carteSurSaFiche = new Set(e.cartes.filter((k) => !!k.clientId && etatDeLaCarte(k, today) === "sur-sa-fiche" && !estEchue(k, today)).map((k) => k.clientId));
  const signalementsDe = /* @__PURE__ */ new Map();
  for (const s of e.signalements) {
    const l = signalementsDe.get(s.clientId);
    if (l) l.push(s);
    else signalementsDe.set(s.clientId, [s]);
  }
  const fiches = clients.map((c) => {
    const siens = parCliente.get(c.id) ?? [];
    const rdvs = siens.map((a2) => ({
      id: a2.id,
      date: a2.date,
      time: a2.time,
      status: a2.status,
      creeLe: a2.creeLe,
      familles: (a2.serviceIds ?? []).map((id) => familleDuNom(nomDuService(id))),
      venu: estUneVenue({ date: a2.date, status: a2.status, encaisse: apptPaidXof(a2) > 0, facture: !!a2.invoiceId || factures.has(a2.id) }, today)
    }));
    const cad = siens.length ? predictNextVisitSelon(siens, c, c.id, today, estFerme) : null;
    const derniere = siens.filter((a2) => a2.status === "honoré").sort((x, y) => x.date.localeCompare(y.date)).pop();
    const premierNom = derniere ? nomDuService(derniere.serviceIds?.[0] ?? "") : "";
    const geste = GESTES_EN_FRANCAIS[litLaMarqueWa(premierNom).marque];
    const soinDit = geste ? geste.long.toLowerCase() : NOM_DE_LA_FAMILLE[familleDuNom(premierNom)];
    const sesSignalements = signalementsDe.get(c.id) ?? [];
    return {
      id: c.id,
      appel: appelDe(c),
      soinDit,
      birthday: c.birthday,
      birthdayGiftAt: c.birthdayGiftAt,
      accord: aAccepteLesNouvelles(c),
      stop: stopDe(c),
      couronne: abonnee(c),
      telephone: aUnNumero(c),
      ecartee: estDePassage(c) || estDiaspora(c) || aDefaitSesLocks(c) || !!c.archived,
      archivee: !!c.archived,
      payeur: payeurDeLaFiche(c),
      soucis: sesSignalements.filter((s) => (s.quand ?? "") >= ilYA60).flatMap((s) => s.soucis ?? []),
      souciOuvert: souciOuvertDe(sesSignalements),
      resteDu: resteDu.get(c.id) ?? 0,
      derniereRelanceLe: derniereRelance.get(c.id),
      dernierMessageHorsService: dernierHorsService.get(c.id),
      attendUneReponse: attend.has(c.id),
      /* Enfant d'un foyer : un autre paie pour elle, et rien ne dit qu'elle
         est majeure. Dans le doute, on n'écrit pas : le parent reçoit. */
      enfantDuFoyer: (() => {
        const payeur = c.familyId ? payeurDe.get(c.familyId) : void 0;
        return !!payeur && payeur !== c.id && !(c.birthday && !estMineur(c, today));
      })(),
      carteVivante: carteSurSaFiche.has(c.id),
      codesVivants: codesVivantsDe(codes, c.id, maintenantIso).length,
      jamais: rg.jamais[c.id] ?? [],
      rdvs,
      traces: traces.get(c.id) ?? [],
      /* La date ATTENDUE : pour une cliente en retard, la Cadence reporte
         sa date au cycle suivant ; l'Assistant lit la date manquée. */
      cadence: {
        iso: cad?.predicted ? cad.overdueDays > 0 ? addDaysISO(today, -cad.overdueDays) : cad.iso : null,
        rythmeJours: cad?.avgDays ?? (c.rythmeSemaines ? c.rythmeSemaines * 7 : null)
      }
    };
  });
  const lundi = lundiDe(today);
  const ilYA90 = addDaysISO(today, -90);
  const tickets = pieces.filter((p) => seRelance(p) && p.date >= ilYA90).map(invoiceTotal).filter((x) => x > 0);
  const ticketMoyenXof = tickets.length ? Math.round(tickets.reduce((a2, b) => a2 + b, 0) / tickets.length) : 0;
  const plafond = plafondDeLaSemaine({
    codes: codes.filter((k) => k.branchId === e.branche.id),
    lundi,
    maintenantIso,
    ticketMoyenXof,
    remisesParSemaine: rg.remisesParSemaine,
    plafondFrancs: rg.plafondFrancs
  });
  const remisesRestantes = plafond.restantes;
  const ouvertLe = (j) => !estFerme(j);
  const parJour = rdvParJour(appts.map((a2) => ({ date: a2.date, status: a2.status })));
  const reperes = reperesParJour({ parJour, aujourdhui: today, ouvertLe });
  const creux = joursCreux({ aujourdhui: today, parJour, ordinaireDe: (j) => reperesDe(reperes, j).ordinaire, ouvertLe, remisesRestantes });
  const sieges = Math.max(0, e.branche.seats ?? 0);
  const occupesDu = (iso2) => appts.filter((a2) => a2.date === iso2 && a2.status !== "annulé").map((a2) => ({ maitre: a2.master, debutMin: timeToMin(a2.time), dureeMin: dureeDuRendezVous(a2, byId) }));
  const cache = /* @__PURE__ */ new Map();
  const placesDe = (clientId, jour) => {
    const dernier = (parCliente.get(clientId) ?? []).filter((a2) => a2.status === "honoré").sort((x, y) => x.date.localeCompare(y.date)).pop();
    const duree = dernier ? Math.max(30, dureeDuRendezVous(dernier, byId)) : 120;
    const maitre = dernier?.master || "Team";
    const cle = `${duree}|${maitre}|${jour ?? "7"}`;
    if (!cache.has(cle)) {
      const jours = jour ? [jour] : [1, 2, 3, 4, 5, 6, 7].map((k) => addDaysISO(today, k));
      cache.set(cle, deuxPlaces(jours.map((iso2) => placesDuJour({
        iso: iso2,
        aujourdhui: today,
        maintenantMin: 0,
        ouverture: e.ouverture(iso2),
        durationMin: duree,
        occupes: occupesDu(iso2),
        bloques: plagesBloquees(e.blocages, e.branche.id, iso2, maitre),
        sieges
      }))));
    }
    return cache.get(cle);
  };
  const parId = new Map(clients.map((c) => [c.id, c]));
  const rdvAGarder = (clientId) => (parCliente.get(clientId) ?? []).filter((a2) => a2.date === addDaysISO(today, 2) && a2.status !== "annulé" && a2.status !== "honoré").map((a2) => ({ id: a2.id, date: a2.date, time: a2.time, numeroAPrevenir: a2.numeroAPrevenir }))[0];
  return {
    fiches,
    ctx: { aujourdhui: today, creux, remisesRestantes, placesDe, eteintes: rg.eteintes },
    nomDe: (id) => parId.get(id)?.name ?? "",
    clientDe: (id) => parId.get(id),
    compteDe: (id) => {
      const c = parId.get(id);
      return c?.authUserId && abonnes2.has(c.authUserId) ? c.authUserId : id;
    },
    rdvAGarder,
    telDe: (s) => {
      if (s.pourId) return (parId.get(s.pourId)?.phone ?? "").trim();
      const c = parId.get(s.clientId);
      const r = s.genre === "garder" ? rdvAGarder(s.clientId) : void 0;
      return r ? telDuRdv(r, c) : (c?.phone ?? "").trim();
    },
    plafond: { ...plafond, remisesParSemaine: rg.remisesParSemaine, plafondFrancs: rg.plafondFrancs }
  };
}
var heuresJusquA = (jour, maintenantMs) => Math.max(1, Math.ceil((Date.parse(`${jour}T23:59:00+01:00`) - maintenantMs) / 36e5));
function codeDeLaSituation(s, o, deja) {
  if (!s.code) return void 0;
  return fabriqueLeCode({
    branchId: o.branchId,
    clientId: s.clientId,
    clientNom: o.nom,
    mot: s.code.mot,
    remisePct: s.code.pct,
    heures: heuresJusquA(s.code.jusquau, o.maintenantMs),
    parQui: "Assistant Maison",
    note: GENRE_DIT[s.genre],
    maintenant: new Date(o.maintenantMs).toISOString()
  }, deja);
}

// src/shared/numero-wa-pur.ts
var numeroWa = (brut) => {
  const d = (brut ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00229")) return d.slice(2);
  if (d.startsWith("229")) return d;
  if (d.length === 10 && d.startsWith("01")) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

// src/shared/assistant-passage-pur.ts
var CLE_DU_SERVEUR = "mnd_assistant_serveur";
function lignesDuPassage(o) {
  const r = reglagesLus(o.reglagesGerard);
  if (r.mode === "eteint") return [];
  const aujourdhui = o.cerveau.ctx.aujourdhui;
  const maintenantIso = new Date(o.maintenantMs).toISOString();
  const { partA, calme } = heureDeDepart(o.maintenantMs, o.regles);
  const depart = { partA: new Date(partA).toISOString(), calme };
  const lignes = [];
  for (const s of o.plan) {
    const c = o.cerveau.clientDe(s.clientId);
    const outils = {
      branchId: o.branchId,
      aujourdhui,
      maintenantIso,
      prenom: prenomSeul(c?.name),
      rdv: s.genre === "garder" ? o.cerveau.rdvAGarder(s.clientId) : void 0
    };
    if (s.canal === "couronne") {
      lignes.push(ligneDeNotification(s, { ...outils, compte: o.cerveau.compteDe(s.pourId ?? s.clientId), ...depart }));
    } else if (partSeule(s, r)) {
      const numero = numeroWa(o.cerveau.telDe(s));
      if (numero) lignes.push(ligneWhatsApp(s, { ...outils, numero, ...depart }));
    }
  }
  return lignes;
}
var lignesNeuves = (lignes, existantes) => lignes.filter((l) => !existantes.has(l.id));
function remisesAFabriquer(envois) {
  const out = [];
  for (const brut of envois) {
    const e = brut;
    if (e.type !== "gerard" || e.statut !== "envoyé" || !e.codeAFaire || e.codePromo || !e.id || !e.clientId) continue;
    if (e.codeAFaire.mot !== "CREUX" && e.codeAFaire.mot !== "ANNIV") continue;
    out.push({ id: e.id, clientId: e.clientId, genre: e.genre ?? "creux", codeAFaire: e.codeAFaire, branchId: e.branchId ?? "" });
  }
  return out;
}

// scripts/serveur/assistant-maison.ts
var VERSION = "2026-10-27-d";
var json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
var jourDuSalon = (ms) => new Date(ms + 36e5).toISOString().slice(0, 10);
var heureDuSalon2 = (ms) => {
  const d = new Date(ms + 36e5);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};
async function toutes(sb, table, filtre, colonnes = "id, branch_id, data") {
  const out = [];
  for (let de = 0; ; de += 1e3) {
    let q = sb.from(table).select(colonnes).order("id", { ascending: true }).range(de, de + 999);
    if (filtre) q = filtre(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} : ${error.message}`);
    out.push(...data ?? []);
    if ((data ?? []).length < 1e3) break;
  }
  return out;
}
async function document(sb, cle) {
  const { data, error } = await sb.from("documents").select("data").eq("key", cle).maybeSingle();
  if (error) throw new Error(`documents ${cle} : ${error.message}`);
  return data?.data ?? null;
}
async function abonnes(sb) {
  const ids = /* @__PURE__ */ new Set();
  let apres = "";
  for (; ; ) {
    let q = sb.from("push_subscriptions").select("endpoint, client_id").order("endpoint", { ascending: true }).limit(1e3);
    if (apres) q = q.gt("endpoint", apres);
    const { data, error } = await q;
    if (error) throw new Error(`push_subscriptions : ${error.message}`);
    const rangs = data ?? [];
    for (const r of rangs) if (r.client_id) ids.add(r.client_id);
    if (rangs.length < 1e3) break;
    apres = rangs[rangs.length - 1].endpoint;
  }
  return ids;
}
async function fabriqueLesRemises(sb, maintenantMs) {
  const parties = await toutes(sb, "envois", (q) => q.eq("data->>type", "gerard").eq("data->>statut", "envoyé"));
  const aFaire = remisesAFabriquer(parties.map((l) => l.data));
  if (aFaire.length === 0) return 0;
  const codes = (await toutes(sb, "codes_promo")).map((l) => l.data);
  const aujourdhui = jourDuSalon(maintenantMs);
  let faites = 0;
  for (const l of aFaire) {
    const ligne = parties.find((p) => p.id === l.id);
    if (!ligne) continue;
    if (l.codeAFaire.jusquau < aujourdhui) {
      await sb.from("envois").update({ data: { ...ligne.data, codePromo: "", detailRemise: "jour passé, pas de remise" } }).eq("id", l.id).is("data->>codePromo", null);
      continue;
    }
    const { data: fiche } = await sb.from("clients").select("data").eq("id", l.clientId).maybeSingle();
    const code = codeDeLaSituation(
      { clientId: l.clientId, genre: l.genre, code: l.codeAFaire },
      { branchId: l.branchId, nom: String(fiche?.data?.name ?? ""), maintenantMs },
      codes
    );
    if (!code) continue;
    const { data: prise } = await sb.from("envois").update({ data: { ...ligne.data, codePromo: code.code } }).eq("id", l.id).is("data->>codePromo", null).select("id");
    if ((prise ?? []).length === 0) continue;
    const { error } = await sb.from("codes_promo").upsert({ id: code.id, branch_id: code.branchId, data: code });
    if (error) console.error("assistant-maison: remise", error.message);
    else {
      faites++;
      codes.push(code);
    }
  }
  return faites;
}
async function passage(sb, maintenantMs, reglagesGerard) {
  const aujourdhui = jourDuSalon(maintenantMs);
  const reglages = await document(sb, "mnd_settings");
  if (!Array.isArray(reglages?.hours) || reglages.hours.length === 0) {
    return { deposees: 0, plan: 0, erreurs: ["heures de la Maison introuvables (mnd_settings.hours) : rien déposé"] };
  }
  const exceptions = await document(sb, "mnd_horaires_exceptions") ?? [];
  const regles = reglesDepuis(await document(sb, "mnd_auto_config"));
  const ouverture = (iso2) => ouvertureDuJour(iso2, reglages.hours, exceptions);
  const [branches, clients, rdvs, prestations, signalements, envois, messages, pieces, blocages, familles, cartes, codes, abonnees] = await Promise.all([
    toutes(sb, "branches"),
    toutes(sb, "clients"),
    toutes(sb, "appointments"),
    toutes(sb, "catalog_services"),
    toutes(sb, "signalements"),
    toutes(sb, "envois"),
    toutes(sb, "messages_wa"),
    toutes(sb, "invoices"),
    toutes(sb, "blocages"),
    toutes(sb, "families"),
    toutes(sb, "cartes_cadeaux"),
    toutes(sb, "codes_promo"),
    abonnes(sb)
  ]);
  const d = (l) => l.map((x) => x.data);
  const existantes = new Set(envois.map((e) => e.id));
  let deposees = 0;
  let plan = 0;
  const erreurs = [];
  for (const b of d(branches)) {
    const cerveau = lisLAssistant({
      aujourdhui,
      maintenantMs,
      branche: { id: b.id, seats: b.seats },
      clients: d(clients).filter((c) => c.branchId === b.id && !c.archived),
      rdvs: d(rdvs).filter((a2) => a2.branchId === b.id),
      prestations: new Map(d(prestations).map((s) => [s.id, s])),
      signalements: d(signalements),
      abonnes: abonnees,
      envois: d(envois),
      messages: d(messages),
      pieces: d(pieces),
      blocages: d(blocages),
      familles: d(familles),
      cartes: d(cartes),
      codes: d(codes),
      reglagesGerard,
      ouverture
    });
    const leurPlan = planDuJour(cerveau.fiches, cerveau.ctx);
    plan += leurPlan.length;
    const neuves = lignesNeuves(lignesDuPassage({ cerveau, plan: leurPlan, reglagesGerard, maintenantMs, branchId: b.id, regles }), existantes);
    if (neuves.length === 0) continue;
    const { error } = await sb.from("envois").upsert(neuves.map((l) => ({ id: l.id, branch_id: l.branchId, data: l })), { onConflict: "id", ignoreDuplicates: true });
    if (error) erreurs.push(`envois : ${error.message}`);
    else {
      deposees += neuves.length;
      for (const l of neuves) existantes.add(l.id);
    }
  }
  return { deposees, plan, erreurs };
}
Deno.serve(async (req) => {
  if (req.method === "GET") return json({ fonction: "assistant-maison", version: VERSION });
  const service = (Deno.env.get("CLE_SERVICE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const cleRecue = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!service || cleRecue !== service) return json({ erreur: "réservé au cron", version: VERSION }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", service);
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const aujourdhui = jourDuSalon(maintenantMs);
  try {
    const avant = await document(sb, CLE_DU_SERVEUR) ?? {};
    await sb.from("documents").upsert({ key: CLE_DU_SERVEUR, data: { ...avant, vuLe: maintenant, version: VERSION } });
    const remises = await fabriqueLesRemises(sb, maintenantMs);
    const brut = await document(sb, "mnd_gerard");
    const r = reglagesLus(brut);
    const h = heureDuSalon2(maintenantMs);
    const du = r.mode !== "eteint" && avant.passageLe !== aujourdhui && h >= HEURE_DU_PASSAGE_DE && h < HEURE_DU_PASSAGE_A;
    let rapport = null;
    if (du) {
      rapport = await passage(sb, maintenantMs, brut);
      if (rapport.erreurs.length === 0) {
        await sb.from("documents").upsert({ key: CLE_DU_SERVEUR, data: { ...avant, vuLe: maintenant, version: VERSION, passageLe: aujourdhui, deposees: rapport.deposees, remises } });
      }
    }
    return json({ version: VERSION, mode: r.mode === "eteint" ? "pause" : "actif", remises, passage: rapport ?? (du ? null : "pas maintenant") });
  } catch (e) {
    console.error("assistant-maison", String(e));
    return json({ version: VERSION, erreur: String(e?.message ?? e).slice(0, 300) }, 500);
  }
});
