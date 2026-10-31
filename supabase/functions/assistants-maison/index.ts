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
  veilleDe: 8,
  veilleA: 20,
  silenceMin: 30,
  tenueHeures: 2
};
var reglagesComplets = (r) => {
  const n = (v, d, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : d;
  return {
    rythmeMin: n(r?.rythmeMin, REGLAGES_PAR_DEFAUT.rythmeMin, 5, 60),
    veilleDe: n(r?.veilleDe, REGLAGES_PAR_DEFAUT.veilleDe, 0, 23),
    veilleA: n(r?.veilleA, REGLAGES_PAR_DEFAUT.veilleA, 1, 24),
    silenceMin: n(r?.silenceMin, REGLAGES_PAR_DEFAUT.silenceMin, 15, 240),
    tenueHeures: n(r?.tenueHeures, REGLAGES_PAR_DEFAUT.tenueHeures, 1, 12)
  };
};
var SEUIL_SOMMEIL_MIN = 25;
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
function etatDe(a, maintenantMs, seuilMin = SEUIL_SOMMEIL_MIN) {
  if (!a.aUnJeton) return { etat: "sans-jeton", detail: "aucun jeton : l'assistant n'a jamais été relié" };
  const vu = Date.parse(a.vuLe ?? "");
  if (!Number.isFinite(vu)) return { etat: "endormi", detail: "jamais passé" };
  const ecartMin = Math.floor((maintenantMs - vu) / 6e4);
  if (ecartMin > seuilMin) return { etat: "endormi", detail: `endormi depuis ${dureeDite(ecartMin)}` };
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
  "assistant-endormi"
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
  "assistant-endormi": "L'autre assistant dort"
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
var GENRES_DE_DECISION = ["reponse", "place-tenue", "note", "argent", "cercle"];
var CHOIX_PAR_GENRE = {
  reponse: ["envoyer", "modifier", "non"],
  "place-tenue": ["confirmer", "autre-heure", "non"],
  note: ["envoyer", "modifier", "non"],
  argent: ["envoyer", "modifier", "non"],
  cercle: [...CERCLES]
};
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
  "notifier"
];
var ACTIONS_DU_SOUVERAIN = ["jeton.donner", "jeton.retirer", "decision.trancher", "place.trancher"];
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

// scripts/serveur/assistants-maison.ts
var VERSION = "2026-10-31-a";
var ECRAN = "Les assistants";
var ADRESSE_DES_ASSISTANTS = "/trone/#/assistants";
var ETIQUETTE_DES_NOTIFICATIONS = "mnd-assistants";
var ENVOI_MAX_MS = 8e3;
var FENETRE_DU_VERROU_JOURS = 90;
var TZ = "Africa/Porto-Novo";
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
  etat: l.etat ?? {}
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
  creeLe: l.cree_le
});
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
      lignes.push(socle("whatsapp", {
        genre: "whatsapp",
        numero: tel,
        modele: Deno.env.get("WA_TEMPLATE_CONF") ?? "confirmation_rdv",
        parQui: "Le Trône",
        texteAuFil: `Bonjour ${prenom}, c'est confirmé : votre rendez-vous est retenu ${quand}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`,
        composants: [{ type: "body", parameters: [{ type: "text", text: prenom }, { type: "text", text: quand }] }]
      }));
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
  const eveilleDepuis = Number.isFinite(precedent) && maintenantMs - precedent <= SEUIL_SOMMEIL_MIN * 6e4 && moi.eveille_depuis ? moi.eveille_depuis : maintenant;
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
  await s.sb.from("assistants").update({ vu_le: maintenant, eveille_depuis: eveilleDepuis, etat }).eq("id", moi.id);
  const [reglages, relaisLus, decisionsLues, tous] = await Promise.all([
    s.reglages(),
    s.sb.from("assistants_relais").select("*").eq("pour", moi.id).is("traite_le", null).order("quand", { ascending: true }).limit(200),
    s.sb.from("assistants_decisions").select("*").eq("assistant", moi.id).not("tranchee", "is", null).is("executee_le", null).order("cree_le", { ascending: true }).limit(200),
    s.assistants()
  ]);
  const relais = (relaisLus.data ?? []).map(relaisDe).filter((r) => !relaisPerime(r, maintenantMs));
  const decisions = (decisionsLues.data ?? []).map(decisionDe);
  const autres = tous.filter((a) => a.id !== moi.id).map((a) => {
    const e = etatDe(assistantDe(a), maintenantMs);
    return { id: a.id, nom: a.nom, etat: e.etat, detail: e.detail, vuLe: a.vu_le ?? null };
  });
  return rendu({ assistant: { id: moi.id, nom: moi.nom }, precedentVuLe, eveilleDepuis, empeche: etat.empeche ?? null, notifie, reglages, relais, decisions, autres });
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
    branch_id: moi.branch_id ?? null
  });
  let sent = 0;
  if (d.notifier === true) sent = (await s.notifieLePorteur(moi, "decision", { nom: moi.nom })).sent;
  return rendu({ id, sent });
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
async function jetonDonner(s, qui, d) {
  const id = chaine(d.id).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) return refus("id-invalide");
  const present = await s.assistant(id);
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
  const texte = choix === "modifier" ? chaine(d.texte).slice(0, 1e3) || null : null;
  await s.sb.from("assistants_decisions").update({ tranchee: choix, tranchee_le: (/* @__PURE__ */ new Date()).toISOString(), tranchee_par: qui.userId, texte_modifie: texte }).eq("id", id);
  return rendu({ id, choix });
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
    await s.sb.from("assistants_decisions").update({ tranchee: choix, tranchee_le: maintenant, tranchee_par: qui.userId, texte_modifie: heureProposee ?? (chaine(d.mot).slice(0, 200) || null) }).eq("id", dec.id);
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
      }
    }
    return refus("action-inconnue");
  } catch (e) {
    dis("erreur", { motif: String(e?.message ?? e).slice(0, 120) });
    return refus("erreur", 500);
  }
});
