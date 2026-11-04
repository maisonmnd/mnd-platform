// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   ASSISTANTS-MAISON : la porte des assistants reliés (Opale, Onyx) vers
   le Trône : le passage, les relais, les décisions, les rendez-vous.

   Fichier fabriqué par `node scripts/assistants-maison-serveur.mjs` depuis
   `scripts/serveur/assistants-maison.ts` et les modules purs du dépôt
   (assistants-pur, civilite, salle-des-envois) : on ne le corrige jamais
   ici, on corrige le dépôt et on refait le fichier.

   Appelée par la ligne de commande des assistants avec leur jeton d'appareil
   (en-tête x-jeton-assistant, empreinte dans la table `assistants`), et par
   l'écran « Les assistants » du Trône avec la session d'un souverain.

   AUCUN SECRET ICI : SUPABASE_URL, CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   viennent de l'environnement (déjà posés) ; WA_TOKEN, WA_PHONE_ID et
   WA_TEMPLATE_CONF ne servent qu'à savoir si la pièce WhatsApp se dépose.

   Déploiement : `node scripts/mise-en-ligne.mjs fonction assistants-maison
   --commit <sha> --jwt non` (la porte est jugée ici : l'empreinte du jeton,
   ou le JWT d'un souverain). Vérifier : son adresse répond sa version.
   ═══════════════════════════════════════════════════════════════════ */
// scripts/serveur/assistants-maison.ts
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
var MINUTE_DU_JOUR = 3;
var MINUTE_DU_SOIR = 7;
function minutesDuTour(rythme, depart) {
  for (let decale = 0; decale < rythme; decale++) {
    const o = (depart + decale) % rythme;
    const m = [];
    for (let x = o; x < 60; x += rythme) m.push(x);
    if (!m.includes(0) && !m.includes(30)) return m;
  }
  return [depart];
}
var champDesMinutes = (m, rythme) => m.length <= 2 ? m.join(",") : `${m[0]}-59/${rythme}`;
var champDesHeures = (de, a) => a - de === 1 ? `${de}` : `${de}-${a - 1}`;
function cronsDeLaVeille(r) {
  const crons = [];
  const finDuJour = Math.min(r.soirDe, r.veilleA);
  if (finDuJour > r.veilleDe) crons.push(`${champDesMinutes(minutesDuTour(r.rythmeMin, MINUTE_DU_JOUR), r.rythmeMin)} ${champDesHeures(r.veilleDe, finDuJour)} * * *`);
  const debutDuSoir = Math.max(r.soirDe, r.veilleDe);
  if (r.veilleA > debutDuSoir) crons.push(`${champDesMinutes(minutesDuTour(r.rythmeSoirMin, MINUTE_DU_SOIR), r.rythmeSoirMin)} ${champDesHeures(debutDuSoir, r.veilleA)} * * *`);
  return crons;
}
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
function heureDite(dateISO, time, maintenantMs) {
  const h = String(time ?? "").replace(/^(\d{1,2}):(\d{2})$/, (_m, hh, mm) => mm === "00" ? `${Number(hh)} h` : `${Number(hh)} h ${mm}`);
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  const demain = aCotonou(maintenantMs + 864e5).dateISO;
  if (dateISO === aujourdhui) return `aujourd'hui ${h}`;
  if (dateISO === demain) return `demain ${h}`;
  const d = /* @__PURE__ */ new Date(`${dateISO}T12:00:00Z`);
  const ecartJours = Math.round((d.getTime() - (/* @__PURE__ */ new Date(`${aujourdhui}T12:00:00Z`)).getTime()) / 864e5);
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  if (ecartJours > 0 && ecartJours < 7) return `${JOURS[d.getUTCDay()]} ${h}`;
  const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `le ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${h}`;
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
function numeroCle(texte) {
  const chiffres = String(texte ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (chiffres.length < 8 || chiffres.length > 15) return null;
  return chiffres;
}
var GENRES_DE_RELAIS = [
  "rdv-pose-pour-toi",
  "rdv-deplace",
  "rdv-annule",
  "place-tenue",
  "place-confirmee",
  "place-refusee",
  "fil-ouvert",
  "hermine-a-prevenir",
  "envie-lue",
  "argent-a-trancher",
  "assistant-endormi",
  /* La Maison intelligente (2 novembre 2026) : un fait à savoir, un geste à
     faire, d'un professionnel à un autre (« Achat saisi, Caisse Principale »). */
  "signal",
  "a-faire"
];
var RELAIS_DIT = {
  "rdv-pose-pour-toi": "Rendez-vous posé pour toi",
  "rdv-deplace": "Rendez-vous déplacé",
  "rdv-annule": "Rendez-vous annulé",
  "place-tenue": "Place tenue, à confirmer",
  "place-confirmee": "Place confirmée",
  "place-refusee": "Place refusée",
  "fil-ouvert": "La même personne écrit aux deux : je réponds",
  "hermine-a-prevenir": "Tresses posées : Hermine à prévenir",
  "envie-lue": "Une envie lue, posée en Note du carnet",
  "argent-a-trancher": "Une question d'argent à trancher",
  "assistant-endormi": "L'autre assistant dort",
  signal: "Un fait à savoir",
  "a-faire": "Un geste à faire"
};
var RELAIS_QUI_DEMANDE_UN_GESTE = ["place-tenue", "hermine-a-prevenir", "argent-a-trancher", "fil-ouvert"];
var estGenreDeRelais = (g) => typeof g === "string" && GENRES_DE_RELAIS.includes(g);
var relaisPerime = (r, maintenantMs) => {
  const p = Date.parse(r.perimeLe ?? "");
  return Number.isFinite(p) && p <= maintenantMs;
};
var MOT_AU_PLUS = 100;
var MOTS_DU_RELAIS = /* @__PURE__ */ new Set([
  // le temps
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
  "janv",
  "févr",
  "avr",
  "juil",
  "sept",
  "oct",
  "nov",
  "déc",
  "aujourd",
  "hui",
  "demain",
  "hier",
  "matin",
  "midi",
  "soir",
  "semaine",
  "prochaine",
  "prochain",
  "avant",
  "après",
  "vers",
  "entre",
  "heure",
  "heures",
  "min",
  // les personnes, par leur lien
  "sœur",
  "soeur",
  "frère",
  "frere",
  "mère",
  "mere",
  "père",
  "pere",
  "maman",
  "papa",
  "parent",
  "enfant",
  "fille",
  "fils",
  "mari",
  "femme",
  "amie",
  "ami",
  "cliente",
  "client",
  "madame",
  "monsieur",
  "mme",
  // les gestes de la Maison
  "rdv",
  "rendez",
  "vous",
  "place",
  "tenue",
  "tenir",
  "confirme",
  "confirmer",
  "confirmée",
  "refusée",
  "annule",
  "annuler",
  "annulé",
  "déplacer",
  "déplacé",
  "décaler",
  "décalé",
  "poser",
  "posé",
  "posée",
  "pose",
  "création",
  "creation",
  "consultation",
  "devis",
  "retwist",
  "racines",
  "soin",
  "coiffure",
  "tresses",
  "nattes",
  "couleur",
  "longueur",
  "locks",
  "calibre",
  "repousse",
  "reprise",
  "prix",
  "acompte",
  "tarif",
  "carnet",
  "formule",
  "séance",
  "séances",
  "reste",
  "doit",
  "payé",
  "payer",
  "espèces",
  "momo",
  "carte",
  "retard",
  "absente",
  "absent",
  "venue",
  "venir",
  "viendra",
  "passe",
  "passera",
  "avec",
  "pour",
  "chez",
  "sans",
  "ensemble",
  "aussi",
  "seule",
  "seul",
  "envie",
  "photo",
  "photos",
  "vidéo",
  "vidéos",
  "lien",
  "modèle",
  "note",
  "fiche",
  "dossier",
  "documents",
  "hermine",
  "prévenir",
  "prévenue",
  "prévenu",
  "écrit",
  "répond",
  "réponds",
  "réponse",
  "demande",
  "demandé",
  "question",
  "dit",
  "veut",
  "voudrait",
  "préfère",
  "plutôt",
  "autre",
  "même",
  "déjà",
  "encore",
  "puis",
  "donc",
  "mais",
  "oui",
  "non",
  "ok",
  "yéman",
  "yeman",
  "brice",
  "opale",
  "onyx",
  "maison",
  "mnd",
  "trône",
  "trone",
  "fauteuil",
  // les petits mots
  "une",
  "des",
  "les",
  "est",
  "sont",
  "son",
  "ses",
  "leur",
  "elle",
  "lui",
  "moi",
  "toi",
  "nous",
  "qui",
  "que",
  "quoi",
  "dans",
  "sur",
  "par",
  "pas",
  "plus",
  "tout",
  "tous",
  "toute",
  "cette",
  "ces",
  "cet",
  "aux",
  "ici",
  "là"
]);
var retireLesAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
var motsDe = (texte) => String(texte ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
function vocabulairePermis(catalogue, prenoms) {
  const v = /* @__PURE__ */ new Set();
  for (const m of MOTS_DU_RELAIS) {
    v.add(m);
    v.add(retireLesAccents(m));
  }
  for (const source of [catalogue, prenoms]) for (const texte of source) for (const m of motsDe(texte)) {
    v.add(m);
    v.add(retireLesAccents(m));
  }
  return v;
}
function motEstPropre(mot, permis) {
  const t = String(mot ?? "").trim();
  if (!t) return { ok: true };
  if (t.length > MOT_AU_PLUS) return { ok: false, motif: `plus de ${MOT_AU_PLUS} caractères` };
  if (/[«»"“”„]/.test(t)) return { ok: false, motif: "des guillemets : un relais ne cite jamais" };
  if (/\d{8,}/.test(t.replace(/[\s.-]/g, ""))) return { ok: false, motif: "un numéro : la clé du numéro a son champ" };
  for (const m of motsDe(t)) {
    if (/^\d+$/.test(m) || m.length < 3) continue;
    if (m.endsWith("h") && /^\d+h$/.test(m)) continue;
    if (permis.has(m) || permis.has(retireLesAccents(m))) continue;
    return { ok: false, motif: `un mot hors des faits de la Maison : « ${m} »` };
  }
  return { ok: true };
}
var GENRES_DE_DECISION = ["reponse", "place-tenue", "note", "argent", "cercle", "rdv", "depense", "publication", "planning", "acces"];
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
var CHOIX_AVEC_TEXTE = ["modifier", "autre-heure", "corriger"];
var PRIVE_CONTACT_AU_PLUS = 60;
var PRIVE_MESSAGE_AU_PLUS = 1200;
function priveEstPropre(p) {
  if (!p || typeof p !== "object") return { ok: false, motif: "ni contact ni message" };
  const contact = String(p.contact ?? "").trim();
  const message = String(p.message ?? "").trim();
  if (!contact && !message) return { ok: false, motif: "ni contact ni message" };
  if (contact.length > PRIVE_CONTACT_AU_PLUS) return { ok: false, motif: `un contact de plus de ${PRIVE_CONTACT_AU_PLUS} caractères` };
  if (message.length > PRIVE_MESSAGE_AU_PLUS) return { ok: false, motif: `un message de plus de ${PRIVE_MESSAGE_AU_PLUS} caractères` };
  return { ok: true, prive: { contact, message } };
}
var estDateISO = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
var estHeure = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
var texteCourt = (v, max) => String(v ?? "").trim().slice(0, max);
var numeroCleDe = (v) => numeroCle(typeof v === "string" || typeof v === "number" ? String(v) : null);
function faitsDeLaCarte(genre, f) {
  const o = f && typeof f === "object" ? f : {};
  switch (genre) {
    case "rdv": {
      const cle = numeroCleDe(o.numeroCle);
      const services = Array.isArray(o.services) ? o.services.map((s) => texteCourt(s, 60)).filter(Boolean).slice(0, 6) : [];
      if (!cle) return { ok: false, motif: "le numéro de la cliente" };
      if (services.length === 0) return { ok: false, motif: "les prestations" };
      if (!estDateISO(o.date) || !estHeure(o.time)) return { ok: false, motif: "le jour et l'heure" };
      const prevenir = numeroCleDe(o.prevenir);
      return { ok: true, faits: {
        numeroCle: cle,
        services,
        date: o.date,
        time: o.time,
        ...texteCourt(o.clientId, 60) ? { clientId: texteCourt(o.clientId, 60) } : {},
        ...texteCourt(o.pour, 60) ? { pour: texteCourt(o.pour, 60) } : {},
        ...prevenir ? { prevenir } : {},
        ...o.tenue === true ? { tenue: true } : {}
      } };
    }
    case "depense": {
      const montantXof = typeof o.montantXof === "number" && Number.isFinite(o.montantXof) ? Math.round(o.montantXof) : NaN;
      if (!(montantXof > 0)) return { ok: false, motif: "le montant" };
      const objet = texteCourt(o.objet, 80);
      const categorie = texteCourt(o.categorie, 60);
      const cle = texteCourt(o.cle, 120);
      if (!objet) return { ok: false, motif: "l'objet" };
      if (!categorie) return { ok: false, motif: "la catégorie" };
      if (!cle) return { ok: false, motif: "la clé du message" };
      if (o.date !== void 0 && !estDateISO(o.date)) return { ok: false, motif: "la date" };
      return { ok: true, faits: {
        montantXof,
        objet,
        categorie,
        cle,
        ...texteCourt(o.caisse, 60) ? { caisse: texteCourt(o.caisse, 60) } : {},
        ...texteCourt(o.porteur, 60) ? { porteur: texteCourt(o.porteur, 60) } : {},
        ...texteCourt(o.beneficiaire, 60) ? { beneficiaire: texteCourt(o.beneficiaire, 60) } : {},
        ...estDateISO(o.date) ? { date: o.date } : {}
      } };
    }
    case "publication": {
      const reseau = texteCourt(o.reseau, 30);
      if (!reseau) return { ok: false, motif: "le réseau" };
      return { ok: true, faits: { reseau, ...texteCourt(o.quand, 40) ? { quand: texteCourt(o.quand, 40) } : {}, ...texteCourt(o.apercu, 400) ? { apercu: texteCourt(o.apercu, 400) } : {} } };
    }
    case "planning": {
      const quoi = texteCourt(o.quoi, 160);
      if (!quoi) return { ok: false, motif: "ce qui change" };
      return { ok: true, faits: { quoi, ...estDateISO(o.jour) ? { jour: o.jour } : {} } };
    }
    case "acces": {
      const quoi = texteCourt(o.quoi, 160);
      if (!quoi) return { ok: false, motif: "l'accès demandé" };
      return { ok: true, faits: { quoi, ...texteCourt(o.pour, 60) ? { pour: texteCourt(o.pour, 60) } : {} } };
    }
    default:
      return { ok: true, faits: null };
  }
}
var GENRES_AVEC_FAITS = ["rdv", "depense", "publication", "planning", "acces"];
var RESUME_AU_PLUS = 160;
var estGenreDeDecision = (g) => typeof g === "string" && GENRES_DE_DECISION.includes(g);
function resumeEstPropre(resume) {
  const t = String(resume ?? "").trim();
  if (!t) return { ok: false, motif: "un résumé vide" };
  if (t.length > RESUME_AU_PLUS) return { ok: false, motif: `plus de ${RESUME_AU_PLUS} caractères` };
  if (/[«»"“”„]/.test(t)) return { ok: false, motif: "des guillemets : un résumé ne cite jamais" };
  if (/\d{8,}/.test(t.replace(/[\s.-]/g, ""))) return { ok: false, motif: "un numéro dans le résumé" };
  return { ok: true };
}
var HEURES_OUVREES_PAR_DEFAUT = { ouvreDe: 8, fermeA: 20, joursOuverts: [2, 3, 4, 5, 6] };
function echeanceOuvree(depuisMs, heures, h = HEURES_OUVREES_PAR_DEFAUT) {
  let reste = Math.max(0, heures) * 60;
  let t = depuisMs;
  for (let garde = 0; garde < 24 * 14 && reste > 0; garde++) {
    const c = aCotonou(t);
    const minuteDuJour = c.heure * 60 + c.minute;
    const ouvre = h.ouvreDe * 60;
    const ferme = h.fermeA * 60;
    if (!h.joursOuverts.includes(c.jour) || minuteDuJour >= ferme) {
      const lendemain = new Date(t + DECALAGE_COTONOU_MIN * 6e4);
      lendemain.setUTCDate(lendemain.getUTCDate() + 1);
      lendemain.setUTCHours(h.ouvreDe, 0, 0, 0);
      t = lendemain.getTime() - DECALAGE_COTONOU_MIN * 6e4;
      continue;
    }
    if (minuteDuJour < ouvre) {
      t += (ouvre - minuteDuJour) * 6e4;
      continue;
    }
    const dispo = ferme - minuteDuJour;
    const pris = Math.min(dispo, reste);
    t += pris * 6e4;
    reste -= pris;
  }
  return new Date(t).toISOString();
}
var cleDeJour = (numero, dateISO) => `jour:${numero}:${dateISO}`;
var hex = (o) => Array.from(o, (b) => b.toString(16).padStart(2, "0")).join("");
function nouveauJetonAssistant(id) {
  const o = new Uint8Array(24);
  globalThis.crypto.getRandomValues(o);
  return `assistant-${id}-${hex(o)}`;
}
async function empreinteDuJetonAssistant(jeton) {
  const h = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(jeton ?? "").trim()));
  return hex(new Uint8Array(h));
}
var EN_TETE_DU_JETON_ASSISTANT = "x-jeton-assistant";
var PORTE_ASSISTANT = "assistant";
function corpsDeNotification(genre, detail) {
  const qui = detail?.nom ?? "Votre assistant";
  switch (genre) {
    case "place-tenue":
      return { titre: "Une place tenue pour vous", corps: `${detail?.heure ?? "Une place"} : confirmez d'un toucher dans Les assistants.` };
    case "place-confirmee":
      return { titre: "Place confirmée", corps: `${detail?.heure ?? "La place"} est confirmée par l'autre fauteuil.` };
    case "place-refusee":
      return { titre: "Place refusée", corps: `${detail?.heure ?? "La place"} n'est pas tenue : une autre heure est à proposer.` };
    case "rdv-pose-pour-toi":
      return { titre: "Rendez-vous posé pour vous", corps: detail?.heure ?? "Un rendez-vous vous attend au Trône." };
    case "rdv-deplace":
      return { titre: "Rendez-vous déplacé", corps: detail?.heure ?? "Un de vos rendez-vous a bougé." };
    case "rdv-annule":
      return { titre: "Rendez-vous annulé", corps: detail?.heure ?? "Un de vos rendez-vous est annulé." };
    case "hermine-a-prevenir":
      return { titre: "Tresses posées", corps: "Hermine est à prévenir depuis votre fil." };
    case "argent-a-trancher":
      return { titre: "Une question d'argent", corps: "Un relais vous attend au Trône." };
    case "fil-ouvert":
      return { titre: "La même personne vous écrit à tous les deux", corps: "L'autre assistant répond ; un relais le dit." };
    case "envie-lue":
      return { titre: "Une envie notée", corps: "Une Note du carnet a été posée sur un rendez-vous." };
    case "assistant-endormi":
      return { titre: "L'autre assistant dort", corps: "Des fils attendent de son côté." };
    case "signal":
      return { titre: "Un fait à savoir", corps: "Un relais vous attend au Trône." };
    case "a-faire":
      return { titre: "Un geste à faire", corps: "Un relais vous attend au Trône." };
    case "cartes": {
      const n = Math.max(1, Math.round(detail?.n ?? 1));
      return { titre: n > 1 ? `${n} cartes vous attendent` : "Une carte vous attend", corps: `${qui} : à valider dans Les assistants.` };
    }
    case "decision":
      return { titre: "Une décision vous attend", corps: `${qui} a laissé une proposition dans Les assistants.` };
    case "sommeil":
      return { titre: `${qui} dort`, corps: `Aucun passage depuis ${detail?.depuis ?? "un moment"}. Relancez-le d'un clic.` };
    case "empeche":
      return { titre: `${qui} est empêché`, corps: detail?.empeche ?? "Un contrôle a échoué au dernier passage." };
  }
}
var TOURNURES_INTERDITES = [
  "c'est noté",
  "c'est bien noté",
  "n'hésite pas",
  "n'hésitez pas",
  "belle journée",
  "bonne continuation",
  "à très vite",
  "a très vite",
  "je la garde dans ton dossier",
  "je te réserve la place",
  "merci pour ton message",
  "merci pour votre message",
  "je reste disponible",
  "bien à toi",
  "bien à vous",
  "au plaisir",
  "cordialement",
  "en tant qu'assistant",
  "je suis un assistant",
  "je suis une ia"
];
function tournureInterdite(texte) {
  const t = retireLesAccents(String(texte ?? "").toLowerCase()).replace(/[’]/g, "'");
  for (const x of TOURNURES_INTERDITES) if (t.includes(retireLesAccents(x))) return x;
  return null;
}
var ACTIONS_DU_JETON = [
  "passage",
  "relais.deposer",
  "relais.traiter",
  "decision.deposer",
  "decision.executee",
  "rdv.poser",
  "rdv.deplacer",
  "rdv.annuler",
  "note.poser",
  "notifier",
  /* 1er novembre 2026 : la dépense du jour posée « à valider », et la fiche retrouvée par son nom (lecture seule). */
  "depense.poser",
  "fiche.chercher",
  /* 2 novembre 2026, le socle : le bilan déposé avant le Conseil du matin. */
  "bilan.deposer"
];
var ACTIONS_DU_SOUVERAIN = ["jeton.donner", "jeton.retirer", "decision.trancher", "place.trancher", "loin.basculer"];
var porteDeLAction = (action) => {
  if (typeof action !== "string") return null;
  if (ACTIONS_DU_JETON.includes(action)) return "jeton";
  if (ACTIONS_DU_SOUVERAIN.includes(action)) return "souverain";
  return null;
};
var NOTE_AU_PLUS = 200;
function noteEstPropre(note) {
  const t = String(note ?? "").trim();
  if (!t) return { ok: false, motif: "une note vide" };
  if (t.length > NOTE_AU_PLUS) return { ok: false, motif: `plus de ${NOTE_AU_PLUS} caractères` };
  if (/[«»"“”„]/.test(t)) return { ok: false, motif: "des guillemets : une note ne cite jamais" };
  if (/\d{8,}/.test(t.replace(/[\s.-]/g, ""))) return { ok: false, motif: "un numéro dans la note" };
  return { ok: true };
}
var estUneTresse = (nomDePrestation, labelDeRubrique) => {
  const p = String(nomDePrestation ?? "").toLowerCase();
  const r = String(labelDeRubrique ?? "").toLowerCase();
  return /tresse/.test(r) || /tresse|natte|vanille/.test(p);
};
var NOTIFICATIONS_DE = 7;
var NOTIFICATIONS_A = 22;
var notificationPermise = (heureCotonou) => heureCotonou >= NOTIFICATIONS_DE && heureCotonou < NOTIFICATIONS_A;
var modeDe = (loinDepuis) => {
  const ok = !!loinDepuis && Number.isFinite(Date.parse(loinDepuis));
  return { loin: ok, loinDepuis: ok ? loinDepuis : null };
};
var COMPTES_DU_BILAN = ["lus", "repondus", "pouces", "rdvPoses", "depenses", "cartes", "relais", "publications"];
var MOT_DU_BILAN_AU_PLUS = 100;
function bilanEstPropre(b) {
  const o = b && typeof b === "object" ? b : {};
  const jour = String(o.jour ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return { ok: false, motif: "le jour" };
  const brut = o.comptes && typeof o.comptes === "object" ? o.comptes : {};
  const comptes = {};
  for (const k of Object.keys(brut)) {
    if (!COMPTES_DU_BILAN.includes(k)) return { ok: false, motif: `un compte inconnu : ${k.slice(0, 20)}` };
    const v = brut[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e4) return { ok: false, motif: `le compte ${k}` };
    comptes[k] = Math.round(v);
  }
  const mot = String(o.mot ?? "").trim();
  if (mot) {
    if (mot.length > MOT_DU_BILAN_AU_PLUS) return { ok: false, motif: `un mot de plus de ${MOT_DU_BILAN_AU_PLUS} caractères` };
    const r = resumeEstPropre(mot);
    if (!r.ok) return { ok: false, motif: r.motif };
  }
  return { ok: true, bilan: { jour, comptes, ...mot ? { mot } : {} } };
}

// src/shared/maison-intelligente-pur.ts
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
    /* AVANCÉ LE 4 NOVEMBRE 2026 (maquette 9KCMgAb1…) : il naît avec la
       clôture de la journée, à 15 h et à 19 h (fonction `cloture-du-jour`). */
    porteurs: ["yeman"],
    tourne: "fonction",
    ouDit: "une fonction du Trône, à 15 h et à 19 h",
    statut: "en-installation",
    chaqueJour: "La clôture de la journée à 15 h et à 19 h : chaque rendez-vous à son état final, une facture au même prix et au même argent, le papier parti, les pièces payées effacées signalées, la caisse du jour par moyen et par tiroir.",
    seul: "Envoyer le papier pas encore parti (par la salle), passer honoré un rendez-vous réglé en entier, relier une facture à son seul rendez-vous.",
    enCarte: "Tout argent qui sort, tout écart, une absence, un prix, un effacement.",
    quinzaine: "avancé au 4 novembre 2026"
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
var passeAuTrone = (p) => p.tourne === "session" && !p.horsDuTrone;
var RESERVE = "reserve";
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

// src/shared/civilite.ts
var DIT = { madame: "Madame", mademoiselle: "Mademoiselle", monsieur: "Monsieur" };
var ABREGE = { madame: "Mme", mademoiselle: "Mlle", monsieur: "M." };
var civiliteDe = (c) => c?.civilite && DIT[c.civilite] ? c.civilite : c?.auMasculin ? "monsieur" : "madame";
var prenomSeul = (nom) => (nom ?? "").trim().split(/\s+/)[0] ?? "";
var appelDe = (c, repli) => {
  const prenom = prenomSeul(c?.name ?? repli);
  const connue = !!c?.civilite && !!DIT[c.civilite] || !!c?.auMasculin;
  if (!connue) return prenom || "Madame, Monsieur";
  const civ = civiliteDe(c);
  return prenom ? `${ABREGE[civ]} ${prenom}` : DIT[civ];
};

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

// src/shared/lien-du-rdv-pur.ts
var ALPHABET_DE_LA_REFERENCE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var PREFIXE_DE_LA_REFERENCE = "MND-";
function referenceDuRendezVous(apptId) {
  let h = 2166136261;
  for (const c of String(apptId ?? "")) {
    h ^= c.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += ALPHABET_DE_LA_REFERENCE[h % 32];
    h = Math.floor(h / 32);
  }
  return `${PREFIXE_DE_LA_REFERENCE}${s}`;
}
var base64url = (octets) => btoa(String.fromCharCode(...new Uint8Array(octets))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function signe(secret, texte) {
  const enc = new TextEncoder();
  const cle = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", cle, enc.encode(texte))).slice(0, 22);
}
async function jetonDuRendezVous(secret, apptId) {
  if (!secret || !/^[A-Za-z0-9_-]{1,120}$/.test(apptId)) throw new Error("jeton du rendez-vous : identifiant ou secret impossible");
  return `${apptId}.${await signe(secret, `rdv:${apptId}`)}`;
}
function composantsDeLaConfirmation(o) {
  const corps = [{ type: "text", text: o.prenom }, { type: "text", text: o.quand }];
  if (!o.avecLiens) return [{ type: "body", parameters: corps }];
  return [
    { type: "body", parameters: [...corps, { type: "text", text: o.reference }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: o.jeton }] },
    { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: o.jeton }] }
  ];
}
function texteDeLaConfirmation(o) {
  return o.avecLiens ? `Bonjour ${o.prenom}, c'est confirmé : votre rendez-vous est retenu ${o.quand}. Votre référence : ${o.reference}. Nous vous attendons. Pour déplacer ou annuler, touchez le bouton ci-dessous.` : `Bonjour ${o.prenom}, c'est confirmé : votre rendez-vous est retenu ${o.quand}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`;
}
var NOM_DU_SECRET_DES_LIENS = "SUPABASE_SERVICE_ROLE_KEY";

// src/shared/assistants-depenses-pur.ts
var MONTANT_AU_PLUS_XOF = 2e6;
var OBJET_AU_PLUS = 80;
var JOURS_EN_ARRIERE = 60;
var RECU_AU_PLUS_OCTETS = 5 * 1024 * 1024;
var TYPES_DE_RECU = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
var CAISSE_PAR_DEFAUT = "Caisse Principale";
var COMPARTIMENT_DES_RECUS = "fil";
var DOSSIER_DES_RECUS = "depense";
var sansAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
var MOTS_VIDES = /* @__PURE__ */ new Set(["les", "des", "pour", "avec", "une", "aux", "sur", "par", "dans", "chez", "caisse", "principale"]);
var motsDeLObjet = (t) => sansAccents(t).split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
var unTexteSain = (t, auPlus) => {
  const v = String(t ?? "").replace(/\s+/g, " ").trim();
  if (v.length < 2 || v.length > auPlus) return null;
  if (/\d{8,}/.test(v.replace(/[\s.-]/g, ""))) return null;
  return v;
};
function lisLaDemandeDeDepense(d, aujourdhui) {
  const brut = d.montantXof;
  const montant = typeof brut === "number" ? brut : typeof brut === "string" && /^\s*\d[\d\s.]*$/.test(brut) ? Number(brut.replace(/[\s.]/g, "")) : NaN;
  if (!Number.isFinite(montant) || montant <= 0) return { ok: false, motif: "montant", detail: "un montant en francs, plus grand que zéro" };
  if (!Number.isInteger(montant)) return { ok: false, motif: "montant", detail: "des francs entiers" };
  if (montant > MONTANT_AU_PLUS_XOF) return { ok: false, motif: "montant-hors-borne", detail: `plus de ${MONTANT_AU_PLUS_XOF} F : à saisir au Trône` };
  const objet = unTexteSain(String(d.objet ?? ""), OBJET_AU_PLUS);
  if (!objet) return { ok: false, motif: "objet", detail: `deux à ${OBJET_AU_PLUS} signes, sans numéro` };
  let beneficiaire;
  if (d.beneficiaire !== void 0 && String(d.beneficiaire).trim()) {
    const b = unTexteSain(String(d.beneficiaire), 60);
    if (!b) return { ok: false, motif: "beneficiaire", detail: "deux à 60 signes, sans numéro" };
    beneficiaire = b;
  }
  const categorie = String(d.categorie ?? "").trim();
  if (!categorie) return { ok: false, motif: "categorie" };
  let date = aujourdhui;
  if (d.date !== void 0 && d.date !== "") {
    if (typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(`${d.date}T12:00:00Z`))) return { ok: false, motif: "date-invalide" };
    if (d.date > aujourdhui) return { ok: false, motif: "date-future" };
    const ecart = (Date.parse(`${aujourdhui}T12:00:00Z`) - Date.parse(`${d.date}T12:00:00Z`)) / 864e5;
    if (ecart > JOURS_EN_ARRIERE) return { ok: false, motif: "date-ancienne", detail: `plus de ${JOURS_EN_ARRIERE} jours : à saisir au Trône` };
    date = d.date;
  }
  const caisse = String(d.caisse ?? "").trim() || void 0;
  const porteur = String(d.porteur ?? "").trim() || void 0;
  return { ok: true, v: { montantXof: montant, objet, ...beneficiaire ? { beneficiaire } : {}, categorie, ...caisse ? { caisse } : {}, ...porteur ? { porteur } : {}, date, autre: d.autre === true } };
}
function categorieConnue(nom, categories) {
  const cle = sansAccents(nom).trim();
  for (const c of categories) {
    const n = String(c.name ?? "").trim();
    if (n && sansAccents(n) === cle) return n;
  }
  return null;
}
var vivantesDe = (caisses, branchId) => caisses.filter((c) => String(c.branchId ?? "") === branchId && !c.archiveeLe).map((c) => String(c.name ?? "").trim()).filter(Boolean);
function caisseDeLaDepense(nom, caisses, branchId) {
  const vivantes = vivantesDe(caisses, branchId);
  if (nom) {
    const trouvee = vivantes.find((c) => sansAccents(c) === sansAccents(nom).trim());
    return trouvee ? { ok: true, caisse: trouvee } : { ok: false, caisses: vivantes };
  }
  return { ok: true, caisse: vivantes.find((c) => sansAccents(c) === sansAccents(CAISSE_PAR_DEFAUT)) ?? vivantes[0] ?? CAISSE_PAR_DEFAUT };
}
function porteurConnu(nom, liste) {
  const noms = liste.map((x) => String(x ?? "").trim()).filter(Boolean);
  const cle = sansAccents(nom).trim();
  if (!cle) return null;
  const exact = noms.find((n) => sansAccents(n) === cle);
  if (exact) return exact;
  const parPrenom = noms.filter((n) => sansAccents(n).split(/\s+/)[0] === cle.split(/\s+/)[0] && cle.split(/\s+/).length === 1);
  return parPrenom.length === 1 ? parPrenom[0] : null;
}
function prestataireNomme(textes, prestataires) {
  const mots = new Set(textes.flatMap((t) => sansAccents(t ?? "").split(/[^a-z0-9]+/)).filter(Boolean));
  for (const p of prestataires) {
    if (p.archived === true) continue;
    const nom = String(p.name ?? "").trim();
    const premier = sansAccents(nom).split(/[^a-z0-9]+/).find((m) => m.length >= 3);
    if (premier && mots.has(premier)) return nom;
  }
  return null;
}
function doublonDeLaDepense(n, existantes) {
  const siens = new Set(motsDeLObjet(n.label));
  for (const e of existantes) {
    if (String(e.branchId ?? "") !== n.branchId || e.date !== n.date) continue;
    if (Math.round(Number(e.amountXof ?? -1)) !== n.amountXof) continue;
    if (e.validation?.etat === "refusee") continue;
    const leurs = motsDeLObjet(String(e.label ?? ""));
    if (siens.size === 0 || leurs.length === 0 || leurs.some((m) => siens.has(m))) return e;
  }
  return null;
}
var saisiePar = (e) => String(e.validation?.soumisPar ?? "").trim() || String(e.porteur ?? "").trim() || "la Maison";
var libelleDeLaDepense = (objet, beneficiaire) => beneficiaire ? `${beneficiaire} · ${objet}` : objet;
var hex2 = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
async function idDeLaDepense(assistantId, idempotence) {
  const h = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${assistantId}|${String(idempotence ?? "").trim()}`));
  return `exp-${assistantId}-${hex2(new Uint8Array(h)).slice(0, 20)}`;
}
function lisLeRecu(r) {
  if (r === void 0 || r === null) return { ok: true, recu: null };
  if (typeof r !== "object") return { ok: false, motif: "recu-illisible" };
  const o = r;
  const type = String(o.type ?? "").toLowerCase();
  if (!TYPES_DE_RECU.includes(type)) return { ok: false, motif: "recu-type" };
  const b64 = String(o.base64 ?? "").replace(/\s+/g, "");
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, motif: "recu-illisible" };
  if (Math.floor(b64.length * 3 / 4) > RECU_AU_PLUS_OCTETS + 3) return { ok: false, motif: "recu-trop-lourd" };
  let octets;
  try {
    const bin = atob(b64);
    octets = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  } catch {
    return { ok: false, motif: "recu-illisible" };
  }
  if (octets.length === 0) return { ok: false, motif: "recu-illisible" };
  if (octets.length > RECU_AU_PLUS_OCTETS) return { ok: false, motif: "recu-trop-lourd" };
  const nom = String(o.nom ?? "").trim() || `recu.${type === "application/pdf" ? "pdf" : type.split("/")[1]}`;
  return { ok: true, recu: { nom: nom.slice(-120), type, octets } };
}
function cheminDuRecu(branchId, depenseId, nom) {
  const propre = String(nom).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80);
  return `${branchId}/${DOSSIER_DES_RECUS}/${depenseId}-${propre}`;
}
var fr = (n) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;
var pieceDuJournal = (montantXof, categorie) => `Dépense à valider, ${fr(montantXof)}, ${categorie}`;

// src/shared/assistants-fiches-pur.ts
var FICHES_AU_PLUS = 5;
var LECTURES_PAR_JOUR = 60;
var RDV_AU_PLUS = 5;
var motsDuNom = (t) => sansAccents(t).split(/[^a-z0-9]+/).filter(Boolean);
function lisLaRecherche(d, numeroCle2) {
  const brutNum = String(d.numeroCle ?? "").trim();
  if (brutNum) {
    const n = numeroCle2(brutNum);
    return n ? { ok: true, numero: n } : { ok: false, motif: "numero-invalide" };
  }
  const mots = motsDuNom(String(d.nom ?? ""));
  const lettres = mots.join("").replace(/[0-9]/g, "").length;
  if (lettres < 2 || !mots.some((m) => m.length >= 2)) return { ok: false, motif: "nom-trop-court" };
  return { ok: true, nom: mots };
}
function motifDeLaBase(mots) {
  const long = [...mots].sort((a, b) => b.length - a.length)[0] ?? "";
  return `%${long.replace(/[aeiouycn]/g, "_")}%`;
}
function ficheCorrespond(nomDeLaFiche, mots) {
  const siens = motsDuNom(nomDeLaFiche);
  return mots.length > 0 && mots.every((m) => siens.some((s) => s.startsWith(m)));
}
function ficheLisible(f, rdvs, nomDe, aujourdhui) {
  const d = f.data;
  const civ = String(d.civilite ?? "");
  const numeros = [d.phone, d.phone2].map((x) => String(x ?? "").trim()).filter((x) => x.replace(/\D/g, "").length >= 8);
  const avenir = rdvs.filter((r) => r.date >= aujourdhui && r.status !== "annulé").sort((a, b) => `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`)).slice(0, RDV_AU_PLUS).map((r) => ({
    id: r.id,
    date: r.date,
    heure: String(r.time ?? ""),
    prestations: (Array.isArray(r.serviceIds) ? r.serviceIds : []).map((s) => nomDe(String(s)) ?? "Prestation").filter(Boolean),
    updatedAt: String(r.updatedAt ?? "")
  }));
  return {
    id: f.id,
    nom: String(d.name ?? "").trim(),
    ...civ === "madame" || civ === "mademoiselle" || civ === "monsieur" ? { civilite: civ } : {},
    numeros,
    rdvs: avenir
  };
}
var pieceDeLaLecture = (n) => `une recherche de fiche, ${n === 0 ? "aucune trouvée" : n === 1 ? "une trouvée" : `${n} trouvées`}`;

// scripts/serveur/assistants-maison.ts
var VERSION = "2026-11-03-a · le socle : cartes de tous les genres, Je suis loin, bilan du matin ; la confirmation à liens";
var BRANCHE_PHARE = "br-40r6u6frno";
var ECRAN = "Les assistants";
var ADRESSE_DES_ASSISTANTS = "/trone/#/assistants";
var ETIQUETTE_DES_NOTIFICATIONS = "mnd-assistants";
var ENVOI_MAX_MS = 8e3;
var FENETRE_DU_VERROU_JOURS = 90;
var TZ = "Africa/Porto-Novo";
var UN_TOUR_AU_MOINS_MS = 4 * 6e4;
var JOURS_DU_BILAN = 7;
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${EN_TETE_DU_JETON_ASSISTANT}`,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
var json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, "content-type": "application/json" } });
var refus = (motif, status = 400, plus = {}) => json({ ok: false, motif, version: VERSION, ...plus }, status);
var rendu = (plus = {}) => json({ ok: true, version: VERSION, ...plus });
var dis = (quoi, o = {}) => console.log(`assistants-maison · ${quoi} · ${JSON.stringify(o)}`);
var chaine = (v) => typeof v === "string" ? v.trim() : "";
var nombre = (v) => typeof v === "number" && Number.isFinite(v) ? v : void 0;
var estDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
var heureNette = (v) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(chaine(v));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
};
var identifiant = (prefixe) => `${prefixe}-${globalThis.crypto.randomUUID()}`;
var lignesDe = (rows) => (rows ?? []).map((r) => ({ id: r.id, ...r.data ?? {} }));
var plusTard = (ms, minutes) => new Date(ms + minutes * 6e4).toISOString();
var dateCotonouDans = (ms, jours) => aCotonou(ms + jours * 864e5).dateISO;
var maitreParDefaut = (b) => {
  const masters = Array.isArray(b.masters) ? b.masters.filter((m) => typeof m === "string") : [];
  const voulu = chaine(b.masterParDefaut);
  if (voulu && masters.includes(voulu)) return voulu;
  return masters[0] ?? "";
};
var numeroIntl = (brut) => {
  const d = (brut ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00229")) return d.slice(2);
  if (d.startsWith("229")) return d;
  if (d.length === 10 && d.startsWith("01")) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};
var heureLisible = (hhmm) => {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? "")) return hhmm ?? "";
  const [h, m] = hhmm.split(":");
  const minutes = Number(m);
  return Number.isFinite(minutes) && minutes > 0 ? `${Number(h)} h ${String(minutes).padStart(2, "0")}` : `${Number(h)} h`;
};
var jourEnClair = (iso) => {
  try {
    return (/* @__PURE__ */ new Date(`${iso}T12:00:00`)).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  } catch {
    return iso;
  }
};
var jourCourt = (ms) => {
  try {
    return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
  } catch {
    return aCotonou(ms).dateISO;
  }
};
var assistantDe = (l) => ({
  id: l.id,
  nom: l.nom,
  porteurTeamId: l.porteur_team_id ?? null,
  porteurUserId: l.porteur_user_id ?? null,
  appareil: l.appareil ?? null,
  aUnJeton: !!l.empreinte,
  vuLe: l.vu_le ?? null,
  eveilleDepuis: l.eveille_depuis ?? null,
  etat: l.etat ?? {},
  loinDepuis: l.loin_depuis ?? null
});
var relaisDe = (l) => ({
  id: l.id,
  de: l.de,
  pour: l.pour,
  genre: l.genre,
  numeroCle: l.numero_cle ?? null,
  clientId: l.client_id ?? null,
  rdvId: l.rdv_id ?? null,
  mot: l.mot ?? null,
  quand: l.quand,
  perimeLe: l.perime_le ?? null,
  luLe: l.lu_le ?? null,
  traiteLe: l.traite_le ?? null
});
var decisionDe = (l) => ({
  id: l.id,
  assistant: l.assistant,
  genre: l.genre,
  numeroCle: l.numero_cle ?? null,
  clientId: l.client_id ?? null,
  rdvId: l.rdv_id ?? null,
  resume: l.resume,
  proposition: l.proposition ?? null,
  choix: Array.isArray(l.choix) ? l.choix : [],
  echeance: l.echeance ?? null,
  tranchee: l.tranchee ?? null,
  trancheeLe: l.tranchee_le ?? null,
  trancheePar: l.tranchee_par ?? null,
  texteModifie: l.texte_modifie ?? null,
  executeeLe: l.executee_le ?? null,
  creeLe: l.cree_le,
  /* Les faits, pour que l'assistant exécute la carte ; JAMAIS `prive` : le
     nom et le message sont au porteur seul, à l'écran, pas à la machine. */
  faits: l.faits ?? null
});
var effaceLePrive = (dec, maintenant) => ({ prive: null, ...dec.prive != null ? { prive_efface_le: maintenant } : {} });
var Serveur = class {
  constructor(sb, url, service) {
    this.sb = sb;
    this.url = url;
    this.service = service;
  }
  /* Les lectures. */
  async assistants() {
    const { data } = await this.sb.from("assistants").select("*").limit(100);
    return data ?? [];
  }
  async assistant(id) {
    const { data } = await this.sb.from("assistants").select("*").eq("id", id).maybeSingle();
    return data ?? null;
  }
  async reglages() {
    const { data } = await this.sb.from("documents").select("data").eq("key", "mnd_settings").maybeSingle();
    return reglagesComplets(data?.data?.assistants ?? null);
  }
  async brancheVedette() {
    const { data } = await this.sb.from("branches").select("id, data").limit(100);
    const lignes = lignesDe(data);
    return lignes.find((b) => b.flagship === true || b.flagship === "true") ?? lignes.find((b) => (b.status ?? "active") === "active") ?? lignes[0] ?? null;
  }
  async catalogue() {
    const [services, categories] = await Promise.all([
      this.sb.from("catalog_services").select("id, data").limit(1e3).then((r) => lignesDe(r.data)).catch(() => []),
      this.sb.from("catalog_categories").select("id, data").limit(1e3).then((r) => lignesDe(r.data)).catch(() => [])
    ]);
    const prestations = services.map((s) => ({ id: String(s.id), name: chaine(s.name), categoryId: chaine(s.categoryId) || void 0 }));
    const rubriques = categories.map((c) => ({ id: String(c.id), label: chaine(c.label) || chaine(c.name) }));
    const noms = [...prestations.map((p) => p.name), ...categories.flatMap((c) => [chaine(c.label), chaine(c.fon), chaine(c.name)])].filter(Boolean);
    return { noms, prestations, rubriques };
  }
  async ficheParId(id) {
    const { data } = await this.sb.from("clients").select("id, data").eq("id", id).maybeSingle();
    if (!data) return null;
    const d = data.data ?? {};
    return {
      id: String(data.id),
      name: chaine(d.name) || void 0,
      prenom: chaine(d.prenom) || void 0,
      phone: chaine(d.phone) || void 0,
      phone2: chaine(d.phone2) || void 0,
      civilite: chaine(d.civilite) || void 0,
      auMasculin: d.auMasculin === true,
      branchId: chaine(d.branchId) || void 0
    };
  }
  /** Les fiches d'un numéro, par la base (0125, service seule) : `phone` et `phone2`, puis la famille. */
  async fichesDuNumero(numero) {
    const { data, error } = await this.sb.rpc("fiches_du_numero", { n: numero });
    if (error || !Array.isArray(data)) return [];
    return data;
  }
  async rdv(id) {
    const { data } = await this.sb.from("appointments").select("id, branch_id, data, updated_at").eq("id", id).maybeSingle();
    return data ?? null;
  }
  async rdvAVenir(clientId, aujourdhui) {
    const { data } = await this.sb.from("appointments").select("id, data").eq("data->>clientId", clientId).gte("data->>date", aujourdhui).neq("data->>status", "annulé").order("data->>date", { ascending: true }).limit(20);
    const lignes = (data ?? []).map((r) => ({ ...r.data, id: r.id }));
    lignes.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return lignes[0] ?? null;
  }
  /* Les écritures communes. */
  async journalise(parNom, g) {
    const id = identifiant("geste");
    const geste = {
      id,
      ...g.branchId ? { branchId: g.branchId } : {},
      quand: (/* @__PURE__ */ new Date()).toISOString(),
      parNom,
      porte: PORTE_ASSISTANT,
      verbe: g.verbe,
      table: g.table,
      ecran: ECRAN,
      pieceId: g.pieceId,
      piece: g.piece,
      ...g.champs?.length ? { champs: g.champs } : {}
    };
    try {
      await this.sb.from("journal_gestes").insert({ id, branch_id: g.branchId ?? null, data: geste });
    } catch {
    }
  }
  /** La notification au porteur d'un assistant, par push-notify (mode to-staff) : jamais un nom, jamais un extrait. */
  async notifieLePorteur(a, genre, detail) {
    if (!a) return { sent: 0, motif: "assistant-inconnu" };
    if (!a.porteur_user_id) return { sent: 0, motif: "porteur-sans-compte" };
    const { titre, corps } = corpsDeNotification(genre, detail);
    try {
      const r = await fetch(`${this.url}/functions/v1/push-notify`, {
        method: "POST",
        signal: AbortSignal.timeout(ENVOI_MAX_MS),
        headers: { "content-type": "application/json", authorization: `Bearer ${this.service}` },
        body: JSON.stringify({ mode: "to-staff", userId: a.porteur_user_id, title: titre, body: corps, url: ADRESSE_DES_ASSISTANTS, tag: ETIQUETTE_DES_NOTIFICATIONS })
      });
      const lu = await r.json().catch(() => ({}));
      return { sent: Number(lu.sent ?? 0) || 0 };
    } catch (e) {
      dis("notification en échec", { genre, motif: String(e?.message ?? e).slice(0, 80) });
      return { sent: 0, motif: "push-notify" };
    }
  }
  /** Un relais déposé par la fonction : la ligne, la notification si le genre
      demande un geste, la ligne de journal. Le `mot` a déjà passé le filtre. */
  async deposeUnRelais(de, r) {
    const id = identifiant("relais");
    const quand = (/* @__PURE__ */ new Date()).toISOString();
    await this.sb.from("assistants_relais").insert({
      id,
      de: de.id,
      pour: r.pour.id,
      genre: r.genre,
      numero_cle: r.numeroCle ?? null,
      client_id: r.clientId ?? null,
      rdv_id: r.rdvId ?? null,
      mot: r.mot ?? null,
      quand,
      perime_le: r.perimeLe ?? null,
      branch_id: de.branch_id ?? null
    });
    let sent = 0;
    if (RELAIS_QUI_DEMANDE_UN_GESTE.includes(r.genre)) sent = (await this.notifieLePorteur(r.pour, r.genre, r.heure ? { heure: r.heure } : void 0)).sent;
    await this.journalise(de.nom, { verbe: "pose", table: "assistants_relais", pieceId: id, piece: `Relais : ${RELAIS_DIT[r.genre]}`, branchId: de.branch_id });
    return { id, sent };
  }
  /** L'autre assistant : celui dont le porteur tient ce maître. */
  async assistantDuMaitre(pourMaitre, saufId) {
    if (!pourMaitre) return null;
    return (await this.assistants()).find((a) => a.id !== saufId && a.porteur_team_id === pourMaitre) ?? null;
  }
  /** LA CONFIRMATION OFFICIELLE D'UNE PLACE TENUE (modèle Meta de la Maison).
      Un rendez-vous posé « confirmé » n'a pas besoin d'elle : la base signe sa
      pose (trace 0092, `operation = 'pose'`, à l'instant de l'insert, que
      l'insert vienne de `pose_si_libre` ou de la clé service), et
      `confirmation-rdv` balaie toutes les dix minutes ce qui est confirmé,
      non annulé, à venir, posé depuis moins de deux heures et sans
      `sansConfirmation` : il part de lui-même, push et modèle, par la salle
      des envois. Une place tenue, elle, naît « en attente » avec
      `sansConfirmation: true`, et peut n'être confirmée que le lendemain
      matin : `confirmationEstNeuve` la tiendrait pour ancienne (la pose date
      de plus de deux heures) et rien ne partirait. On dépose donc ici LA MÊME
      PIÈCE que `confirmation-rdv` : `conf-<rdv>-push` et, si les clés Meta
      sont posées, `conf-<rdv>-whatsapp`, statut « en-attente », mêmes colis,
      mêmes identifiants ; le facteur `envois-partent` les porte à l'heure de
      la salle, et `confirmation-rdv`, s'il repasse dans la fenêtre, voit ces
      lignes et ne double rien. `ignoreDuplicates` : une ligne déjà là reste. */
  async deposeLaConfirmationOfficielle(rdv, maintenantMs) {
    const fiche = await this.ficheParId(rdv.clientId);
    const { data: docs } = await this.sb.from("documents").select("key, data").in("key", ["mnd_house_identity", "mnd_auto_config"]);
    const lus = docs ?? [];
    const nomMaison = chaine(lus.find((d) => d.key === "mnd_house_identity")?.data?.nom) || "Maison MND";
    const cfg = lus.find((d) => d.key === "mnd_auto_config")?.data ?? {};
    const regles = reglesDepuis(cfg);
    const prenom = appelDe(fiche, rdv.clientName);
    const quand = `${jourEnClair(rdv.date)} à ${heureLisible(rdv.time)}`;
    const { partA, calme } = heureDeDepart(maintenantMs, regles);
    const socle = (canal, colis) => ({
      id: `conf-${rdv.id}-${canal}`,
      branch_id: rdv.branchId ?? null,
      data: {
        id: `conf-${rdv.id}-${canal}`,
        branchId: rdv.branchId,
        type: "confirmation",
        canal,
        apptId: rdv.id,
        clientId: rdv.clientId,
        dateRdv: rdv.date,
        heure: rdv.time,
        statut: "en-attente",
        quand: new Date(maintenantMs).toISOString(),
        deposeLe: new Date(maintenantMs).toISOString(),
        partA: new Date(partA).toISOString(),
        ...calme ? { calme: true } : {},
        prenom,
        colis,
        deposePar: "assistants-maison"
      }
    });
    const lignes = [socle("push", {
      genre: "push",
      clientId: rdv.clientId,
      titre: `${nomMaison} · c'est confirmé`,
      corps: `${prenom}, votre rendez-vous est retenu ${quand}. ${chaine(cfg.itineraire)}`.trim(),
      url: "/couronne/"
    })];
    const tel = numeroIntl(chaine(rdv.numeroAPrevenir) || fiche?.phone);
    if (Deno.env.get("WA_TOKEN") && Deno.env.get("WA_PHONE_ID") && tel) {
      const modele = Deno.env.get("WA_TEMPLATE_CONF") ?? "confirmation_rdv";
      const liens = (Deno.env.get("WA_TEMPLATE_CONF_LIENS") ?? "").trim();
      const secret = (Deno.env.get(NOM_DU_SECRET_DES_LIENS) ?? "").trim();
      const reference = referenceDuRendezVous(rdv.id);
      const jeton = liens && secret ? await jetonDuRendezVous(secret, rdv.id).catch(() => "") : "";
      const sansLiens = { modele, composants: composantsDeLaConfirmation({ avecLiens: false, prenom, quand, reference, jeton }), texteAuFil: texteDeLaConfirmation({ avecLiens: false, prenom, quand, reference }) };
      lignes.push(socle("whatsapp", jeton ? {
        genre: "whatsapp",
        numero: tel,
        modele: liens,
        parQui: "Le Trône",
        texteAuFil: texteDeLaConfirmation({ avecLiens: true, prenom, quand, reference }),
        composants: composantsDeLaConfirmation({ avecLiens: true, prenom, quand, reference, jeton }),
        repli: sansLiens
      } : { genre: "whatsapp", numero: tel, parQui: "Le Trône", ...sansLiens }));
    }
    const { error } = await this.sb.from("envois").upsert(lignes, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      dis("confirmation non déposée", { motif: String(error.message ?? "").slice(0, 80) });
      return 0;
    }
    return lignes.length;
  }
};
async function passage(s, moi, d) {
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const c = d.controles ?? {};
  const controles = { chrome: c.chrome !== false, lie: c.lie !== false, nonLus: c.nonLus !== false };
  const precedentVuLe = moi.vu_le ?? null;
  const precedent = Date.parse(precedentVuLe ?? "");
  const reglages = await s.reglages();
  const eveilleDepuis = Number.isFinite(precedent) && maintenantMs - precedent <= seuilDeSommeilMin(precedent, maintenantMs, reglages) * 6e4 && moi.eveille_depuis ? moi.eveille_depuis : maintenant;
  const etat = { ...moi.etat ?? {} };
  delete etat.dortPrevenuLe;
  etat.controles = controles;
  etat.empeche = empecheDit(controles);
  if (chaine(d.version)) etat.version = chaine(d.version).slice(0, 40);
  if (nombre(d.traites) !== void 0) etat.traites = Math.max(0, Math.round(nombre(d.traites)));
  let notifie = 0;
  if (etat.empeche) {
    const prevenu = Date.parse(chaine(etat.empechePrevenuLe));
    if (!(Number.isFinite(prevenu) && prevenu >= Date.parse(eveilleDepuis))) {
      notifie = (await s.notifieLePorteur(moi, "empeche", { nom: moi.nom, empeche: String(etat.empeche) })).sent;
      etat.empechePrevenuLe = maintenant;
    }
  } else {
    delete etat.empechePrevenuLe;
  }
  const mode = modeDe(moi.loin_depuis);
  const cartesNouvelles = Math.max(0, Math.round(nombre(d.cartesNouvelles) ?? 0));
  let notifieCartes = 0;
  if (mode.loin && cartesNouvelles > 0 && notificationPermise(aCotonou(maintenantMs).heure)) {
    const dejaPrevenu = Date.parse(chaine(etat.cartesPrevenuLe));
    if (!(Number.isFinite(dejaPrevenu) && maintenantMs - dejaPrevenu < UN_TOUR_AU_MOINS_MS)) {
      notifieCartes = (await s.notifieLePorteur(moi, "cartes", { n: cartesNouvelles, nom: moi.nom })).sent;
      etat.cartesPrevenuLe = maintenant;
    }
  }
  await s.sb.from("assistants").update({ vu_le: maintenant, eveille_depuis: eveilleDepuis, etat }).eq("id", moi.id);
  const [relaisLus, decisionsLues, tous] = await Promise.all([
    s.sb.from("assistants_relais").select("*").eq("pour", moi.id).is("traite_le", null).order("quand", { ascending: true }).limit(200),
    s.sb.from("assistants_decisions").select("*").eq("assistant", moi.id).not("tranchee", "is", null).is("executee_le", null).order("cree_le", { ascending: true }).limit(200),
    s.assistants()
  ]);
  const relais = (relaisLus.data ?? []).map(relaisDe).filter((r) => !relaisPerime(r, maintenantMs));
  const decisions = (decisionsLues.data ?? []).map(decisionDe);
  const autres = tous.filter((a) => a.id !== moi.id).map((a) => {
    const e = etatDe(assistantDe(a), maintenantMs, reglages);
    return { id: a.id, nom: a.nom, etat: e.etat, detail: e.detail, vuLe: a.vu_le ?? null };
  });
  const heure = aCotonou(maintenantMs).heure;
  const veille = { dansLaVeille: dansLaVeille(heure, reglages), rythmeMin: rythmeA(heure, reglages), crons: cronsDeLaVeille(reglages) };
  return rendu({ assistant: { id: moi.id, nom: moi.nom }, precedentVuLe, eveilleDepuis, empeche: etat.empeche ?? null, notifie, reglages, veille, mode, notifieCartes, relais, decisions, autres });
}
async function relaisDeposer(s, moi, d) {
  const genre = d.genre;
  if (!estGenreDeRelais(genre)) return refus("genre-inconnu");
  const pourId = chaine(d.pour);
  if (!pourId || pourId === moi.id) return refus("pour-invalide");
  const pour = await s.assistant(pourId);
  if (!pour) return refus("assistant-inconnu", 404);
  const numero = numeroCle(chaine(d.numeroCle)) ?? null;
  const clientId = chaine(d.clientId) || null;
  const rdvId = chaine(d.rdvId) || null;
  const mot = chaine(d.mot);
  if (mot) {
    const [catalogue, fiche, fiches] = await Promise.all([
      s.catalogue(),
      clientId ? s.ficheParId(clientId) : Promise.resolve(null),
      !clientId && numero ? s.fichesDuNumero(numero) : Promise.resolve([])
    ]);
    const prenoms = [...fiche ? [fiche.name ?? "", fiche.prenom ?? ""] : [], ...fiches.map((f) => f.nom)].flatMap((n) => motsDe(n));
    const juge = motEstPropre(mot, vocabulairePermis(catalogue.noms, prenoms));
    if (!juge.ok) return refus("mot-refuse", 400, { detail: juge.motif });
  }
  const perimeDansMin = nombre(d.perimeDansMin);
  const { id, sent } = await s.deposeUnRelais(moi, {
    pour,
    genre,
    numeroCle: numero,
    clientId,
    rdvId,
    mot: mot || null,
    perimeLe: perimeDansMin && perimeDansMin > 0 ? plusTard(Date.now(), Math.min(perimeDansMin, 60 * 24 * 14)) : null
  });
  return rendu({ id, sent });
}
async function relaisTraiter(s, moi, d) {
  const id = chaine(d.id);
  if (!id) return refus("id");
  const { data } = await s.sb.from("assistants_relais").select("*").eq("id", id).maybeSingle();
  const r = data ?? null;
  if (!r) return refus("relais-inconnu", 404);
  if (r.pour !== moi.id) return refus("pas-a-toi", 403);
  const maintenant = (/* @__PURE__ */ new Date()).toISOString();
  await s.sb.from("assistants_relais").update({ traite_le: maintenant, lu_le: r.lu_le ?? maintenant }).eq("id", id);
  return rendu({ id });
}
async function decisionDeposer(s, moi, d) {
  const genre = d.genre;
  if (!estGenreDeDecision(genre)) return refus("genre-inconnu");
  const resume = chaine(d.resume);
  const jugeResume = resumeEstPropre(resume);
  if (!jugeResume.ok) return refus("resume-refuse", 400, { detail: jugeResume.motif });
  const proposition = chaine(d.proposition) || null;
  const tournure = tournureInterdite(proposition);
  if (tournure) return refus("proposition-refusee", 400, { tournure });
  const lusFaits = faitsDeLaCarte(genre, d.faits);
  if (!lusFaits.ok) return refus("faits-refuses", 400, { detail: lusFaits.motif });
  if (GENRES_AVEC_FAITS.includes(genre) && !lusFaits.faits) return refus("faits-refuses", 400, { detail: "les faits de la carte" });
  let faits = lusFaits.faits ?? null;
  const mode = modeDe(moi.loin_depuis);
  let prive = null;
  if (d.prive !== void 0 && d.prive !== null) {
    if (!mode.loin) return refus("prive-hors-loin", 409, { detail: "le nom et le message ne viennent au Trône qu en mode Je suis loin" });
    const p = priveEstPropre(d.prive);
    if (!p.ok) return refus("prive-refuse", 400, { detail: p.motif });
    prive = p.prive;
  }
  if (genre === "depense") {
    const f = faits;
    const autre = d.autre === true;
    const lue = lisLaDemandeDeDepense({ ...f, autre }, aCotonou(Date.now()).dateISO);
    if (!lue.ok) return refus(lue.motif, 400, lue.detail ? { detail: lue.detail } : {});
    const c = await controleLaDepense(s, moi, lue.v);
    if (!c.ok) return c.refus;
    faits = {
      ...f,
      categorie: c.categorie,
      caisse: c.caisse,
      ...c.porteur ? { porteur: c.porteur } : {},
      date: lue.v.date,
      ...autre ? { autre: true } : {}
    };
  }
  const echeanceMin = nombre(d.echeanceMin);
  const id = identifiant("decision");
  await s.sb.from("assistants_decisions").insert({
    id,
    assistant: moi.id,
    genre,
    numero_cle: numeroCle(chaine(d.numeroCle)) ?? null,
    client_id: chaine(d.clientId) || null,
    rdv_id: chaine(d.rdvId) || null,
    resume,
    proposition,
    choix: [...CHOIX_PAR_GENRE[genre]],
    echeance: echeanceMin && echeanceMin > 0 ? plusTard(Date.now(), Math.min(echeanceMin, 60 * 24 * 14)) : null,
    branch_id: moi.branch_id ?? null,
    faits,
    prive
  });
  let sent = 0;
  if (d.notifier === true && !mode.loin) sent = (await s.notifieLePorteur(moi, "decision", { nom: moi.nom })).sent;
  return rendu({ id, sent, ...mode.loin ? { loin: true } : {}, ...faits ? { faits } : {} });
}
async function decisionExecutee(s, moi, d) {
  const id = chaine(d.id);
  if (!id) return refus("id");
  const { data } = await s.sb.from("assistants_decisions").select("*").eq("id", id).maybeSingle();
  const dec = data ?? null;
  if (!dec) return refus("decision-inconnue", 404);
  if (dec.assistant !== moi.id) return refus("pas-a-toi", 403);
  await s.sb.from("assistants_decisions").update({ executee_le: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
  return rendu({ id });
}
async function rdvPoser(s, moi, d) {
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const numero = numeroCle(chaine(d.numeroCle));
  if (!numero) return refus("numero-invalide");
  const serviceIds = Array.isArray(d.serviceIds) ? d.serviceIds.filter((x) => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : [];
  if (serviceIds.length === 0) return refus("prestations");
  const date = d.date;
  if (!estDate(date)) return refus("date-invalide");
  const time = heureNette(d.time);
  if (!time) return refus("heure-invalide");
  const pourMaitre = chaine(d.pourMaitre);
  if (!pourMaitre) return refus("pour-maitre");
  const idempotence = chaine(d.idempotence);
  if (!idempotence) return refus("idempotence");
  const tenue = d.tenue === true;
  const ajouter = d.ajouter === true;
  let fiche = null;
  const clientId = chaine(d.clientId);
  if (clientId) fiche = await s.ficheParId(clientId);
  else {
    const fiches = await s.fichesDuNumero(numero);
    if (fiches.length > 1) return refus("plusieurs-fiches", 409, { fiches: fiches.map((f) => ({ id: f.id, nom: f.nom, parFamille: f.parFamille === true })) });
    if (fiches.length === 1) fiche = await s.ficheParId(fiches[0].id) ?? { id: fiches[0].id, name: fiches[0].nom, branchId: fiches[0].branchId };
  }
  if (!fiche) return refus("fiche-inconnue", 404);
  const cleGeste = `geste:${idempotence}`.slice(0, 200);
  const { data: priseGeste } = await s.sb.from("assistants_prises").upsert({ cle: cleGeste, assistant: moi.id, rdv_id: null, quand: maintenant }, { onConflict: "cle", ignoreDuplicates: true }).select("cle");
  if (!priseGeste || priseGeste.length === 0) {
    const { data: deja } = await s.sb.from("assistants_prises").select("*").eq("cle", cleGeste).maybeSingle();
    const dejaLa = deja ?? null;
    if (dejaLa?.rdv_id) return rendu({ verdict: "deja", rdvId: dejaLa.rdv_id });
  }
  const libereLeGeste = async () => {
    try {
      await s.sb.from("assistants_prises").delete().eq("cle", cleGeste);
    } catch {
    }
  };
  const cleJour = cleDeJour(numero, date);
  const { data: priseJour } = await s.sb.from("assistants_prises").upsert({ cle: cleJour, assistant: moi.id, rdv_id: null, quand: maintenant }, { onConflict: "cle", ignoreDuplicates: true }).select("cle");
  if (!priseJour || priseJour.length === 0) {
    const { data: tenueParRow } = await s.sb.from("assistants_prises").select("*").eq("cle", cleJour).maybeSingle();
    const tenuePar = tenueParRow ?? null;
    if (tenuePar && tenuePar.assistant !== moi.id) {
      await libereLeGeste();
      const autre2 = await s.assistant(tenuePar.assistant);
      return refus("pris", 409, { par: autre2?.nom ?? tenuePar.assistant, quand: tenuePar.quand });
    }
  }
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  if (!ajouter) {
    const dejaUn = await s.rdvAVenir(fiche.id, aujourdhui);
    if (dejaUn) {
      await libereLeGeste();
      return refus("deja-un-rdv", 409, { rdv: { id: dejaUn.id, date: dejaUn.date, time: dejaUn.time } });
    }
  }
  const branche = await s.brancheVedette();
  const branchId = fiche.branchId || branche?.id || "";
  if (!branchId) {
    await libereLeGeste();
    return refus("branche-inconnue", 500);
  }
  const master = chaine(d.master) || (branche ? maitreParDefaut(branche) : "");
  const reglages = await s.reglages();
  const autre = pourMaitre !== moi.porteur_team_id ? await s.assistantDuMaitre(pourMaitre, moi.id) : null;
  const rdvId = identifiant("rdv");
  const dureeMin = nombre(d.dureeMin);
  const note = chaine(d.note);
  const rdv = {
    id: rdvId,
    branchId,
    clientId: fiche.id,
    ...fiche.name ? { clientName: fiche.name } : {},
    serviceIds,
    date,
    time,
    master,
    status: tenue ? "en attente" : "confirmé",
    source: "assistant",
    poseePar: moi.nom,
    pourMaitre,
    ...numeroCle(chaine(d.numeroAPrevenir)) ? { numeroAPrevenir: chaine(d.numeroAPrevenir) } : {},
    sansConfirmation: tenue,
    creeLe: maintenant,
    ...dureeMin && dureeMin > 0 ? { dureeMin: Math.round(dureeMin) } : {},
    ...note && noteEstPropre(note).ok ? { note } : {},
    ...tenue ? { tenue: { jusqua: echeanceOuvree(maintenantMs, reglages.tenueHeures), par: moi.id, ...autre ? { pour: autre.id } : {} } } : {}
  };
  const dansLaFenetre = date > aujourdhui && date <= dateCotonouDans(maintenantMs, FENETRE_DU_VERROU_JOURS);
  let masterPose = master;
  if (dansLaFenetre) {
    const { data: verdict, error } = await s.sb.rpc("pose_si_libre", { p_rdv: rdv, p_maitres: [master] });
    const v = verdict ?? null;
    if (error || !v) {
      await libereLeGeste();
      return refus("verrou", 500, { detail: String(error?.message ?? "sans verdict").slice(0, 120) });
    }
    if (!v.ok) {
      await libereLeGeste();
      return refus(v.raison ?? "creneau_pris");
    }
    if (v.verdict === "deja" || v.verdict === "deja_pose") {
      await s.sb.from("assistants_prises").update({ rdv_id: v.id ?? rdvId }).eq("cle", cleGeste);
      return rendu({ verdict: "deja", rdvId: v.id ?? rdvId, master: v.master ?? master });
    }
    masterPose = v.master ?? master;
  } else {
    const { error } = await s.sb.from("appointments").insert({ id: rdvId, branch_id: branchId, data: rdv });
    if (error) {
      await libereLeGeste();
      return refus("pose-refusee", 500, { detail: String(error.message ?? "").slice(0, 120) });
    }
  }
  await s.sb.from("assistants_prises").update({ rdv_id: rdvId }).eq("cle", cleGeste);
  await s.sb.from("assistants_prises").update({ rdv_id: rdvId }).eq("cle", cleJour).eq("assistant", moi.id);
  const heure = heureDite(date, time, maintenantMs);
  const catalogue = await s.catalogue();
  const prestations = serviceIds.map((id) => catalogue.prestations.find((p) => p.id === id)).filter((p) => !!p);
  const prestation = prestations[0]?.name ?? "";
  let sent = 0;
  if (autre) {
    if (tenue) {
      const r = await s.deposeUnRelais(moi, { pour: autre, genre: "place-tenue", numeroCle: numero, clientId: fiche.id, rdvId, mot: heure, perimeLe: rdv.tenue?.jusqua, heure });
      sent += r.sent;
      await s.sb.from("assistants_decisions").insert({
        id: identifiant("decision"),
        assistant: autre.id,
        genre: "place-tenue",
        numero_cle: numero,
        client_id: fiche.id,
        rdv_id: rdvId,
        resume: `Place tenue ${heure} sur ton fauteuil, posée par ${moi.nom}${prestation ? `, ${prestation}` : ""}`.slice(0, 160),
        proposition: null,
        choix: [...CHOIX_PAR_GENRE["place-tenue"]],
        echeance: rdv.tenue?.jusqua ?? null,
        branch_id: autre.branch_id ?? moi.branch_id ?? null
      });
    } else {
      const r = await s.deposeUnRelais(moi, { pour: autre, genre: "rdv-pose-pour-toi", numeroCle: numero, clientId: fiche.id, rdvId, mot: heure });
      sent += (await s.notifieLePorteur(autre, "rdv-pose-pour-toi", { heure })).sent + r.sent;
    }
  }
  const tresses = prestations.some((p) => estUneTresse(p.name, catalogue.rubriques.find((r) => r.id === p.categoryId)?.label));
  if (tresses && moi.id !== "opale") {
    const opale = await s.assistant("opale");
    if (opale) sent += (await s.deposeUnRelais(moi, { pour: opale, genre: "hermine-a-prevenir", numeroCle: numero, clientId: fiche.id, rdvId, mot: heure })).sent;
  }
  await s.journalise(moi.nom, { verbe: "pose", table: "appointments", pieceId: rdvId, piece: `Rendez-vous ${heure}${prestation ? `, ${prestation}` : ""}`, branchId });
  dis("rdv", { par: moi.id, verdict: tenue ? "tenue" : "pose", fenetre: dansLaFenetre, autre: autre?.id ?? null });
  return rendu({ verdict: tenue ? "tenue" : "pose", rdvId, master: masterPose, sent, ...tenue ? { tenue: rdv.tenue } : {} });
}
async function rdvSousVerrou(s, d) {
  const rdvId = chaine(d.rdvId);
  if (!rdvId) return { ok: false, reponse: refus("rdv") };
  const updatedAt = chaine(d.updatedAt);
  if (!updatedAt) return { ok: false, reponse: refus("updated-at") };
  const ligne = await s.rdv(rdvId);
  if (!ligne) return { ok: false, reponse: refus("rdv-inconnu", 404) };
  if (Date.parse(ligne.updated_at) !== Date.parse(updatedAt)) return { ok: false, reponse: refus("modifie-entre-temps", 409, { updatedAt: ligne.updated_at }) };
  return { ok: true, ligne };
}
async function ecrisLeRdv(s, ligne, data) {
  const { data: ecrit } = await s.sb.from("appointments").update({ data }).eq("id", ligne.id).eq("updated_at", ligne.updated_at).select("id, updated_at");
  const rows = ecrit ?? [];
  return rows[0] ?? null;
}
async function rdvDeplacer(s, moi, d) {
  const date = d.date;
  if (!estDate(date)) return refus("date-invalide");
  const time = heureNette(d.time);
  if (!time) return refus("heure-invalide");
  const v = await rdvSousVerrou(s, d);
  if (!v.ok) return v.reponse;
  const avant = v.ligne.data;
  const apres = { ...avant, date, time };
  const ecrit = await ecrisLeRdv(s, v.ligne, apres);
  if (!ecrit) return refus("modifie-entre-temps", 409);
  const maintenantMs = Date.now();
  const heure = heureDite(date, time, maintenantMs);
  let sent = 0;
  const autre = avant.pourMaitre && avant.pourMaitre !== moi.porteur_team_id ? await s.assistantDuMaitre(avant.pourMaitre, moi.id) : null;
  if (autre) {
    const r = await s.deposeUnRelais(moi, { pour: autre, genre: "rdv-deplace", numeroCle: numeroCle(avant.numeroAPrevenir) ?? null, clientId: avant.clientId, rdvId: avant.id, mot: heure });
    sent += r.sent + (await s.notifieLePorteur(autre, "rdv-deplace", { heure })).sent;
  }
  await s.journalise(moi.nom, {
    verbe: "modifie",
    table: "appointments",
    pieceId: v.ligne.id,
    piece: `Rendez-vous ${heure}`,
    branchId: v.ligne.branch_id,
    champs: [{ champ: "Date", avant: avant.date, apres: date }, { champ: "Heure", avant: avant.time, apres: time }]
  });
  return rendu({ rdvId: v.ligne.id, updatedAt: ecrit.updated_at, sent });
}
async function rdvAnnuler(s, moi, d) {
  const v = await rdvSousVerrou(s, d);
  if (!v.ok) return v.reponse;
  const avant = v.ligne.data;
  if (avant.status === "annulé") return rendu({ rdvId: v.ligne.id, updatedAt: v.ligne.updated_at, verdict: "deja" });
  const ecrit = await ecrisLeRdv(s, v.ligne, { ...avant, status: "annulé" });
  if (!ecrit) return refus("modifie-entre-temps", 409);
  const heure = heureDite(avant.date, avant.time, Date.now());
  let sent = 0;
  const autre = avant.pourMaitre && avant.pourMaitre !== moi.porteur_team_id ? await s.assistantDuMaitre(avant.pourMaitre, moi.id) : null;
  if (autre) {
    const r = await s.deposeUnRelais(moi, { pour: autre, genre: "rdv-annule", numeroCle: numeroCle(avant.numeroAPrevenir) ?? null, clientId: avant.clientId, rdvId: avant.id, mot: heure });
    sent += r.sent + (await s.notifieLePorteur(autre, "rdv-annule", { heure })).sent;
  }
  await s.journalise(moi.nom, {
    verbe: "modifie",
    table: "appointments",
    pieceId: v.ligne.id,
    piece: `Rendez-vous ${heure}, annulé`,
    branchId: v.ligne.branch_id,
    champs: [{ champ: "Statut", avant: avant.status, apres: "annulé" }]
  });
  return rendu({ rdvId: v.ligne.id, updatedAt: ecrit.updated_at, sent });
}
async function notePoser(s, moi, d) {
  const rdvId = chaine(d.rdvId);
  if (!rdvId) return refus("rdv");
  const note = chaine(d.note);
  const juge = noteEstPropre(note);
  if (!juge.ok) return refus("note-refusee", 400, { detail: juge.motif });
  const ligne = await s.rdv(rdvId);
  if (!ligne) return refus("rdv-inconnu", 404);
  const maintenantMs = Date.now();
  const lu = chaine(ligne.data.note);
  const ajout = `${moi.nom}, ${jourCourt(maintenantMs)} : ${note}`;
  await s.sb.from("appointments").update({ data: { ...ligne.data, note: lu ? `${lu}
${ajout}` : ajout } }).eq("id", rdvId);
  await s.journalise(moi.nom, { verbe: "modifie", table: "appointments", pieceId: rdvId, piece: `Note du carnet, rendez-vous ${heureDite(ligne.data.date, ligne.data.time, maintenantMs)}`, branchId: ligne.branch_id });
  return rendu({ rdvId });
}
var GENRES_DE_NOTIFICATION = /* @__PURE__ */ new Set(["decision", "sommeil", "empeche"]);
async function notifier(s, moi, d) {
  const genre = chaine(d.genre);
  if (!estGenreDeRelais(genre) && !GENRES_DE_NOTIFICATION.has(genre)) return refus("genre-inconnu");
  const pourId = chaine(d.pour) || "moi";
  const pour = pourId === "moi" || pourId === moi.id ? moi : await s.assistant(pourId);
  if (!pour) return refus("assistant-inconnu", 404);
  const brut = d.detail ?? {};
  const fait = (v) => {
    const t = chaine(v).slice(0, 60);
    return t && !/[«»"“”„]/.test(t) && !/\d{8,}/.test(t.replace(/[\s.-]/g, "")) ? t : void 0;
  };
  const detail = { heure: fait(brut.heure), depuis: fait(brut.depuis), empeche: fait(brut.empeche), nom: moi.nom };
  const r = await s.notifieLePorteur(pour, genre, detail);
  return rendu({ sent: r.sent, ...r.motif ? { motif: r.motif } : {} });
}
async function controleLaDepense(s, moi, v) {
  const branchId = chaine(moi.branch_id) || (await s.brancheVedette())?.id || BRANCHE_PHARE;
  const [cats, boites, docs] = await Promise.all([
    s.sb.from("expense_categories").select("id, data").limit(500),
    s.sb.from("cashboxes").select("id, data").limit(1e3),
    s.sb.from("documents").select("key, data").in("key", ["mnd_porteurs", "mnd_prestataires"])
  ]);
  const doc = (k) => (docs.data ?? []).find((x) => x.key === k)?.data;
  const prestataires = Array.isArray(doc("mnd_prestataires")) ? doc("mnd_prestataires") : [];
  const prestataire = prestataireNomme([v.objet, v.beneficiaire], prestataires);
  if (prestataire) return { ok: false, refus: refus("prestataire", 409, { prestataire, detail: "sa mission naît du rituel honoré, son paiement fait la dépense" }) };
  const categories = lignesDe(cats.data);
  const categorie = categorieConnue(v.categorie, categories);
  if (!categorie) return { ok: false, refus: refus("categorie-inconnue", 400, { categories: categories.map((c) => chaine(c.name)).filter(Boolean) }) };
  const caisse = caisseDeLaDepense(v.caisse, lignesDe(boites.data), branchId);
  if (!caisse.ok) return { ok: false, refus: refus("caisse-inconnue", 400, { caisses: caisse.caisses }) };
  let porteur;
  if (v.porteur) {
    const liste = Array.isArray(doc("mnd_porteurs")) ? doc("mnd_porteurs") : [];
    porteur = porteurConnu(v.porteur, liste) ?? void 0;
    if (!porteur) return { ok: false, refus: refus("porteur-inconnu", 400, { porteurs: liste.map((x) => chaine(x)).filter(Boolean) }) };
  }
  const label = libelleDeLaDepense(v.objet, v.beneficiaire);
  if (!v.autre) {
    const { data: duJour } = await s.sb.from("expenses").select("id, data").eq("branch_id", branchId).eq("data->>date", v.date).limit(1e3);
    const doublon = doublonDeLaDepense({ branchId, date: v.date, amountXof: v.montantXof, label }, lignesDe(duJour));
    if (doublon) {
      return { ok: false, refus: refus("doublon", 409, { deja: {
        id: doublon.id,
        label: doublon.label,
        amountXof: doublon.amountXof,
        date: doublon.date,
        saisiePar: saisiePar(doublon),
        ...doublon.validation?.soumisLe ? { soumisLe: doublon.validation.soumisLe } : {}
      } }) };
    }
  }
  return { ok: true, branchId, label, categorie, caisse: caisse.caisse, ...porteur ? { porteur } : {} };
}
var ligneDeLaDepense = (c, v, id, validation, fichier) => ({
  id,
  branchId: c.branchId,
  label: c.label,
  amountXof: v.montantXof,
  date: v.date,
  cashbox: c.caisse,
  category: c.categorie,
  recurring: null,
  ...c.porteur ? { porteur: c.porteur } : {},
  ...fichier ? { fichier } : {},
  validation
});
async function poseLaLigne(s, id, branchId, depense) {
  const { error } = await s.sb.from("expenses").insert({ id, branch_id: branchId, data: depense });
  if (!error) return "posee";
  const { data: posee } = await s.sb.from("expenses").select("id").eq("id", id).maybeSingle();
  if (posee) return "deja";
  dis("dépense non écrite", { motif: String(error.message ?? "").slice(0, 80) });
  return "echec";
}
async function depensePoser(s, moi, d) {
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  const lue = lisLaDemandeDeDepense(d, aujourdhui);
  if (!lue.ok) return refus(lue.motif, 400, lue.detail ? { detail: lue.detail } : {});
  const v = lue.v;
  const idempotence = chaine(d.idempotence);
  if (!idempotence) return refus("idempotence");
  const recuLu = lisLeRecu(d.recu);
  if (!recuLu.ok) return refus(recuLu.motif);
  const id = await idDeLaDepense(moi.id, idempotence);
  const { data: dejaLa } = await s.sb.from("expenses").select("id").eq("id", id).maybeSingle();
  if (dejaLa) return rendu({ verdict: "deja", id });
  const c = await controleLaDepense(s, moi, v);
  if (!c.ok) return c.refus;
  const { branchId, label, categorie } = c;
  let fichier;
  if (recuLu.recu) {
    const chemin = cheminDuRecu(branchId, id, recuLu.recu.nom);
    const { error } = await s.sb.storage.from(COMPARTIMENT_DES_RECUS).upload(chemin, recuLu.recu.octets, { contentType: recuLu.recu.type, upsert: true });
    if (error) {
      dis("reçu non déposé", { motif: String(error.message ?? "").slice(0, 80) });
      return refus("recu-non-depose", 502);
    }
    fichier = { chemin, nom: recuLu.recu.nom, type: recuLu.recu.type, taille: recuLu.recu.octets.length };
  }
  const depense = ligneDeLaDepense(c, v, id, { etat: "attente", soumisLe: maintenant, soumisPar: moi.nom }, fichier);
  const ecrite = await poseLaLigne(s, id, branchId, depense);
  if (ecrite === "deja") return rendu({ verdict: "deja", id });
  if (ecrite === "echec") return refus("ecriture", 500);
  await s.journalise(moi.nom, { verbe: "pose", table: "expenses", pieceId: id, piece: pieceDuJournal(v.montantXof, categorie), branchId });
  return rendu({
    verdict: "posee",
    id,
    label,
    amountXof: v.montantXof,
    date: v.date,
    cashbox: c.caisse,
    category: categorie,
    ...c.porteur ? { porteur: c.porteur } : {},
    recu: !!fichier
  });
}
async function bilanDeposer(s, moi, d) {
  const lu = bilanEstPropre(d.bilan ?? { jour: d.jour, comptes: d.comptes, mot: d.mot });
  if (!lu.ok) return refus("bilan-refuse", 400, { detail: lu.motif });
  const maintenantMs = Date.now();
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  const plusAncien = dateCotonouDans(maintenantMs, -JOURS_DU_BILAN);
  if (lu.bilan.jour > aujourdhui || lu.bilan.jour < plusAncien) return refus("jour-hors-borne", 400, { detail: `de ${plusAncien} à ${aujourdhui}` });
  const id = `${moi.id}:${lu.bilan.jour}`;
  const { error } = await s.sb.from("assistants_bilans").upsert(
    { id, assistant: moi.id, jour: lu.bilan.jour, comptes: lu.bilan.comptes, mot: lu.bilan.mot ?? null },
    { onConflict: "id" }
  );
  if (error) {
    dis("bilan non écrit", { motif: String(error.message ?? "").slice(0, 80) });
    return refus("ecriture", 500);
  }
  return rendu({ id, jour: lu.bilan.jour, comptes: lu.bilan.comptes });
}
async function ficheChercher(s, moi, d) {
  const maintenantMs = Date.now();
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  const lue = lisLaRecherche({ nom: d.nom, numeroCle: d.numeroCle }, numeroCle);
  if (!lue.ok) return refus(lue.motif);
  const debutDuJour = new Date(Date.parse(`${aujourdhui}T00:00:00+01:00`)).toISOString();
  const { data: lues } = await s.sb.from("journal_gestes").select("id").eq("data->>parNom", moi.nom).eq("data->>verbe", "lit").gte("data->>quand", debutDuJour).limit(LECTURES_PAR_JOUR + 1);
  if ((lues ?? []).length >= LECTURES_PAR_JOUR) return refus("plafond-des-lectures", 429, { auPlus: LECTURES_PAR_JOUR });
  let trouvees = [];
  if ("numero" in lue) {
    const ids = (await s.fichesDuNumero(lue.numero)).map((f) => f.id).slice(0, 20);
    if (ids.length) {
      const { data } = await s.sb.from("clients").select("id, data").in("id", ids);
      trouvees = data ?? [];
    }
  } else {
    const { data } = await s.sb.from("clients").select("id, data").ilike("data->>name", motifDeLaBase(lue.nom)).limit(300);
    trouvees = (data ?? []).filter((r) => ficheCorrespond(chaine(r.data?.name), lue.nom));
  }
  trouvees = trouvees.filter((r) => r.data?.archived !== true).sort((a, b) => chaine(a.data?.name).localeCompare(chaine(b.data?.name), "fr"));
  const plus = trouvees.length > FICHES_AU_PLUS;
  const { prestations } = await s.catalogue();
  const nomDe = (id) => prestations.find((p) => p.id === id)?.name || void 0;
  const fiches = [];
  for (const f of trouvees.slice(0, FICHES_AU_PLUS)) {
    const { data: appts } = await s.sb.from("appointments").select("id, data, updated_at").eq("data->>clientId", f.id).gte("data->>date", aujourdhui).limit(20);
    const rdvs = (appts ?? []).map((a) => ({
      id: a.id,
      date: a.data.date,
      time: a.data.time,
      status: a.data.status,
      serviceIds: a.data.serviceIds,
      updatedAt: a.updated_at
    }));
    fiches.push(ficheLisible({ id: f.id, data: f.data ?? {} }, rdvs, nomDe, aujourdhui));
  }
  await s.journalise(moi.nom, { verbe: "lit", table: "clients", pieceId: identifiant("lecture"), piece: pieceDeLaLecture(fiches.length), branchId: moi.branch_id });
  return rendu({ fiches, plus });
}
async function jetonDonner(s, qui, d) {
  const id = chaine(d.id).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) return refus("id-invalide");
  const present = await s.assistant(id);
  if (present?.porteur_user_id && present.porteur_user_id !== qui.userId) return refus("pas-ton-assistant", 403);
  const teamVise = chaine(d.porteurTeamId) || present?.porteur_team_id || "";
  if (teamVise) {
    const { data: t } = await s.sb.from("team").select("data").eq("id", teamVise).maybeSingle();
    const nomDuMaitre = chaine(t?.data?.name).trim().toLowerCase();
    if (nomDuMaitre && nomDuMaitre !== qui.nom.trim().toLowerCase()) return refus("pas-ton-assistant", 403);
  }
  const jeton = nouveauJetonAssistant(id);
  const empreinte = await empreinteDuJetonAssistant(jeton);
  const maintenant = (/* @__PURE__ */ new Date()).toISOString();
  const nom = chaine(d.nom).slice(0, 40) || present?.nom || id.charAt(0).toUpperCase() + id.slice(1);
  const champs = {
    nom,
    porteur_team_id: chaine(d.porteurTeamId) || present?.porteur_team_id || null,
    porteur_user_id: qui.userId,
    appareil: chaine(d.appareil).slice(0, 80) || present?.appareil || null,
    empreinte,
    jeton_pose_le: maintenant
  };
  if (present) await s.sb.from("assistants").update(champs).eq("id", id);
  else await s.sb.from("assistants").insert({ id, ...champs, etat: {}, branch_id: (await s.brancheVedette())?.id ?? null });
  dis("jeton donné", { assistant: id });
  return rendu({ id, nom, jeton });
}
async function jetonRetirer(s, _qui, d) {
  const id = chaine(d.id).toLowerCase();
  const present = await s.assistant(id);
  if (!present) return refus("assistant-inconnu", 404);
  await s.sb.from("assistants").update({ empreinte: null }).eq("id", id);
  dis("jeton retiré", { assistant: id });
  return rendu({ id });
}
async function decisionTrancher(s, qui, d) {
  const id = chaine(d.id);
  if (!id) return refus("id");
  const { data } = await s.sb.from("assistants_decisions").select("*").eq("id", id).maybeSingle();
  const dec = data ?? null;
  if (!dec) return refus("decision-inconnue", 404);
  const sien = await s.assistant(dec.assistant);
  if (!sien || sien.porteur_user_id !== qui.userId) return refus("pas-ta-decision", 403);
  if (dec.tranchee) return refus("deja-tranchee", 409);
  const choix = chaine(d.choix);
  const permis = Array.isArray(dec.choix) ? dec.choix : [];
  if (!permis.includes(choix)) return refus("choix-inconnu");
  if (dec.genre === "place-tenue") return placeTrancher(s, qui, { ...d, decisionId: dec.id, choix, mot: d.texte ?? d.mot });
  if (dec.genre === "depense") return carteDeDepenseTranchee(s, qui, sien, dec, choix, d);
  const maintenant = (/* @__PURE__ */ new Date()).toISOString();
  const texte = CHOIX_AVEC_TEXTE.includes(choix) ? chaine(d.texte).slice(0, 1e3) || null : null;
  await s.sb.from("assistants_decisions").update({
    tranchee: choix,
    tranchee_le: maintenant,
    tranchee_par: qui.userId,
    texte_modifie: texte,
    ...effaceLePrive(dec, maintenant)
  }).eq("id", id);
  return rendu({ id, choix });
}
async function carteDeDepenseTranchee(s, qui, sien, dec, choix, d) {
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const trancheLaCarte = async (plus = {}) => {
    await s.sb.from("assistants_decisions").update({
      tranchee: choix,
      tranchee_le: maintenant,
      tranchee_par: qui.userId,
      texte_modifie: null,
      executee_le: maintenant,
      ...effaceLePrive(dec, maintenant),
      ...plus
    }).eq("id", dec.id);
  };
  if (choix === "non") {
    await trancheLaCarte();
    return rendu({ id: dec.id, choix });
  }
  const avant = dec.faits ?? {};
  const brut = d.faits && typeof d.faits === "object" ? d.faits : {};
  const corrections = {};
  if (choix === "corriger") {
    for (const k of ["montantXof", "objet", "categorie", "caisse"]) if (brut[k] !== void 0 && brut[k] !== "") corrections[k] = brut[k];
    if (Object.keys(corrections).length === 0) return refus("faits-refuses", 400, { detail: "ce qui est corrigé : montant, objet, catégorie ou caisse" });
  }
  const lus = faitsDeLaCarte("depense", { ...avant, ...corrections });
  if (!lus.ok) return refus("faits-refuses", 400, { detail: lus.motif });
  const f = lus.faits;
  const autre = avant.autre === true || d.autre === true;
  const lue = lisLaDemandeDeDepense({ ...f, autre }, aCotonou(maintenantMs).dateISO);
  if (!lue.ok) return refus(lue.motif, 400, lue.detail ? { detail: lue.detail } : {});
  const faitsTenus = { ...f, ...autre ? { autre: true } : {} };
  const id = await idDeLaDepense(sien.id, f.cle);
  const { data: dejaLa } = await s.sb.from("expenses").select("id").eq("id", id).maybeSingle();
  if (dejaLa) {
    await trancheLaCarte({ faits: faitsTenus });
    return rendu({ id: dec.id, choix, depense: { verdict: "deja", id } });
  }
  const c = await controleLaDepense(s, sien, lue.v);
  if (!c.ok) return c.refus;
  const validation = { etat: "validee", soumisLe: maintenant, soumisPar: sien.nom, decidePar: qui.nom, decideLe: maintenant };
  const ecrite = await poseLaLigne(s, id, c.branchId, ligneDeLaDepense(c, lue.v, id, validation));
  if (ecrite === "echec") return refus("ecriture", 500);
  if (ecrite === "posee") {
    await s.journalise(qui.nom, {
      verbe: "pose",
      table: "expenses",
      pieceId: id,
      branchId: c.branchId,
      piece: pieceDuJournal(lue.v.montantXof, c.categorie).replace("Dépense à valider", "Dépense validée sur une carte")
    });
  }
  await trancheLaCarte({ faits: { ...faitsTenus, categorie: c.categorie, caisse: c.caisse } });
  return rendu({ id: dec.id, choix, depense: { verdict: ecrite, id, amountXof: lue.v.montantXof, category: c.categorie, cashbox: c.caisse } });
}
async function loinBasculer(s, qui, d) {
  if (typeof d.loin !== "boolean") return refus("loin", 400, { detail: "loin : vrai ou faux" });
  const loin = d.loin;
  const miens = (await s.assistants()).filter((a) => {
    const p = professionnel(a.id);
    return a.porteur_user_id === qui.userId && !!p && passeAuTrone(p);
  });
  if (miens.length === 0) return refus("pas-d-assistant", 404, { detail: "aucun assistant à vous ne passe au Trône" });
  const maintenant = (/* @__PURE__ */ new Date()).toISOString();
  const avant = miens.some((a) => modeDe(a.loin_depuis).loin);
  const apres = [];
  for (const a of miens) {
    const depuis = loin ? modeDe(a.loin_depuis).loinDepuis ?? maintenant : null;
    await s.sb.from("assistants").update({ loin_depuis: depuis, loin_par: loin ? qui.nom : null }).eq("id", a.id);
    apres.push({ id: a.id, nom: a.nom, ...modeDe(depuis) });
  }
  await s.journalise(qui.nom, {
    verbe: "modifie",
    table: "assistants",
    pieceId: miens.map((a) => a.id).join(","),
    piece: loin ? "Je suis loin : les cartes au Trône" : "Je suis là : les questions à l'ordinateur",
    champs: [{ champ: "Mode", avant: avant ? "loin" : "là", apres: loin ? "loin" : "là" }]
  });
  return rendu({ loin, assistants: apres });
}
async function placeTrancher(s, qui, d) {
  const choix = chaine(d.choix);
  if (!["confirmer", "autre-heure", "non"].includes(choix)) return refus("choix-inconnu");
  let dec = null;
  if (chaine(d.decisionId)) {
    const { data } = await s.sb.from("assistants_decisions").select("*").eq("id", chaine(d.decisionId)).maybeSingle();
    dec = data ?? null;
    if (!dec) return refus("decision-inconnue", 404);
  } else if (chaine(d.rdvId)) {
    const { data } = await s.sb.from("assistants_decisions").select("*").eq("rdv_id", chaine(d.rdvId)).eq("genre", "place-tenue").is("tranchee", null).limit(1);
    dec = (data ?? [])[0] ?? null;
  } else return refus("decision-ou-rdv");
  const rdvId = dec?.rdv_id ?? chaine(d.rdvId);
  const ligne = rdvId ? await s.rdv(rdvId) : null;
  if (!ligne) return refus("rdv-inconnu", 404);
  const rdv = ligne.data;
  if (!rdv.tenue) return refus("pas-une-place-tenue");
  const sien = dec ? await s.assistant(dec.assistant) : await s.assistantDuMaitre(rdv.pourMaitre ?? "", "");
  if (!sien || sien.porteur_user_id !== qui.userId) return refus("pas-ta-decision", 403);
  if (dec?.tranchee) return refus("deja-tranchee", 409);
  if (rdv.tenue.confirmeeLe || rdv.tenue.refuseeLe) return refus("deja-tranchee", 409);
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const heure = heureDite(rdv.date, rdv.time, maintenantMs);
  const date = estDate(d.date) ? d.date : null;
  const time = heureNette(d.time);
  const heureProposee = choix === "autre-heure" && date && time ? heureDite(date, time, maintenantMs) : null;
  const apres = choix === "confirmer" ? { ...rdv, status: "confirmé", sansConfirmation: false, tenue: { ...rdv.tenue, confirmeeLe: maintenant } } : { ...rdv, status: "annulé", tenue: { ...rdv.tenue, refuseeLe: maintenant } };
  const ecrit = await ecrisLeRdv(s, ligne, apres);
  if (!ecrit) return refus("modifie-entre-temps", 409);
  if (dec) {
    await s.sb.from("assistants_decisions").update({
      tranchee: choix,
      tranchee_le: maintenant,
      tranchee_par: qui.userId,
      texte_modifie: heureProposee ?? (chaine(d.mot).slice(0, 200) || null),
      ...effaceLePrive(dec, maintenant)
    }).eq("id", dec.id);
  }
  const poseur = await s.assistant(rdv.tenue.par);
  let sent = 0;
  if (poseur && poseur.id !== sien.id) {
    const genre = choix === "confirmer" ? "place-confirmee" : "place-refusee";
    const r = await s.deposeUnRelais(sien, { pour: poseur, genre, numeroCle: numeroCle(rdv.numeroAPrevenir) ?? dec?.numero_cle ?? null, clientId: rdv.clientId, rdvId: rdv.id, mot: heureProposee ?? heure });
    sent += r.sent + (await s.notifieLePorteur(poseur, genre, { heure: heureProposee ?? heure })).sent;
  }
  let deposes = 0;
  if (choix === "confirmer") deposes = await s.deposeLaConfirmationOfficielle(apres, maintenantMs);
  await s.journalise(qui.nom, {
    verbe: "modifie",
    table: "appointments",
    pieceId: rdv.id,
    branchId: ligne.branch_id,
    piece: `${choix === "confirmer" ? "Place confirmée" : "Place refusée"}, rendez-vous ${heure}`,
    champs: [{ champ: "Statut", avant: rdv.status, apres: apres.status }]
  });
  return rendu({ rdvId: rdv.id, choix, updatedAt: ecrit.updated_at, sent, deposes });
}
async function laPorte(sb, req) {
  const jetonAssistant = (req.headers.get(EN_TETE_DU_JETON_ASSISTANT) ?? "").trim();
  if (jetonAssistant) {
    const empreinte = await empreinteDuJetonAssistant(jetonAssistant);
    const { data } = await sb.from("assistants").select("*").eq("empreinte", empreinte).maybeSingle();
    if (data) return { genre: "jeton", moi: data };
  }
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (jwt) {
    const { data: lu } = await sb.auth.getUser(jwt);
    const uid = lu?.user?.id;
    if (uid) {
      const { data: staff } = await sb.from("staff").select("user_id, name, role").eq("user_id", uid).maybeSingle();
      if (staff && staff.role === "souverain") return { genre: "souverain", qui: { userId: uid, nom: chaine(staff.name) || "Un souverain" } };
    }
  }
  return null;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const service = (Deno.env.get("CLE_SERVICE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !service) return json({ ok: false, motif: "environnement", version: VERSION }, 500);
  const sb = createClient(url, service);
  const s = new Serveur(sb, url, service);
  if (req.method === "GET") {
    const n = (await s.assistants()).length;
    return json({ ok: true, fonction: "assistants-maison", version: VERSION, assistants: n });
  }
  if (req.method !== "POST") return refus("POST seulement", 405);
  try {
    let d = {};
    try {
      d = await req.json();
    } catch {
      return refus("demande-illisible");
    }
    const action = chaine(d.action);
    const exige = porteDeLAction(action);
    if (!exige) return refus("action-inconnue");
    const porte = await laPorte(sb, req);
    if (!porte) return refus("reserve-aux-assistants", 403);
    if (porte.genre !== exige) return refus("mauvaise-porte", 403);
    if (porte.genre === "jeton") {
      const moi = porte.moi;
      switch (action) {
        case "passage":
          return await passage(s, moi, d);
        case "relais.deposer":
          return await relaisDeposer(s, moi, d);
        case "relais.traiter":
          return await relaisTraiter(s, moi, d);
        case "decision.deposer":
          return await decisionDeposer(s, moi, d);
        case "decision.executee":
          return await decisionExecutee(s, moi, d);
        case "rdv.poser":
          return await rdvPoser(s, moi, d);
        case "rdv.deplacer":
          return await rdvDeplacer(s, moi, d);
        case "rdv.annuler":
          return await rdvAnnuler(s, moi, d);
        case "note.poser":
          return await notePoser(s, moi, d);
        case "notifier":
          return await notifier(s, moi, d);
        case "depense.poser":
          return await depensePoser(s, moi, d);
        case "fiche.chercher":
          return await ficheChercher(s, moi, d);
        case "bilan.deposer":
          return await bilanDeposer(s, moi, d);
      }
    } else {
      const qui = porte.qui;
      switch (action) {
        case "jeton.donner":
          return await jetonDonner(s, qui, d);
        case "jeton.retirer":
          return await jetonRetirer(s, qui, d);
        case "decision.trancher":
          return await decisionTrancher(s, qui, d);
        case "place.trancher":
          return await placeTrancher(s, qui, d);
        case "loin.basculer":
          return await loinBasculer(s, qui, d);
      }
    }
    return refus("action-inconnue");
  } catch (e) {
    dis("erreur", { motif: String(e?.message ?? e).slice(0, 120) });
    return refus("erreur", 500);
  }
});
