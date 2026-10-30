// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   RECEPTION-WA : l'assistant de la Maison qui répond sur WhatsApp.

   Fichier fabriqué par `node scripts/reception-wa-serveur.mjs` depuis
   `scripts/serveur/reception-wa.ts` et les modules purs du dépôt (la voix
   et les règles de « Proposer une réponse », la grille tarifaire du site) :
   on ne le corrige jamais ici, on corrige le dépôt et on refait le fichier.

   Appelée par whatsapp-automate seul, quand son juge se tait : Claude écrit
   la réponse de la Maison et dit la suite ; l'automate l'envoie.

   AUCUN SECRET ICI : CLE_SERVICE, SUPABASE_URL, ANTHROPIC_API_KEY viennent
   de l'environnement (déjà posés pour les autres fonctions).

   Déploiement : Supabase → Edge Functions → New function « reception-wa »
   → coller CE FICHIER ENTIER → Deploy → « Verify JWT » DÉCOCHÉ (la porte
   est CLE_SERVICE, jugée ici). Vérifier : son adresse répond sa version.
   ═══════════════════════════════════════════════════════════════════ */
// scripts/serveur/reception-wa.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// src/shared/ia-anonymise-pur.ts
var TELEPHONE = /(?:\+|00)?\d(?:[\s.\-]?\d){7,}/g;
var DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
var COURRIEL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
function sansCoordonnees(texte) {
  return String(texte ?? "").replace(COURRIEL, "[adresse]").replace(TELEPHONE, (m) => DATE_ISO.test(m.trim()) ? m : "[numéro]");
}
var echappe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function prenomEtInitiale(p) {
  const prenom = (p.prenom ?? "").trim();
  const nom = (p.nom ?? "").trim();
  const initiale = nom ? `${nom.charAt(0).toLocaleUpperCase("fr")}.` : "";
  if (prenom) return initiale ? `${prenom} ${initiale}` : prenom;
  return initiale;
}
function nomsEnInitiales(texte, personnes) {
  let t = String(texte ?? "");
  const formes = personnes.filter((p) => (p.nom ?? "").trim().length > 1).flatMap((p) => {
    const prenom = (p.prenom ?? "").trim();
    const nom = (p.nom ?? "").trim();
    const court = prenomEtInitiale(p);
    return prenom ? [{ motif: `${prenom} ${nom}`, court }, { motif: `${nom} ${prenom}`, court }] : [{ motif: nom, court }];
  }).sort((a, b) => b.motif.length - a.motif.length);
  for (const f of formes) {
    t = t.replace(new RegExp(`(^|[^\\p{L}])${echappe(f.motif)}(?=$|[^\\p{L}])`, "giu"), (_m, avant) => `${avant}${f.court}`);
  }
  return t;
}
var pourClaude = (texte, personnes = []) => sansCoordonnees(nomsEnInitiales(texte, personnes));

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

// src/shared/agenda-pur.ts
var hourToMin = (h) => {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(h.trim());
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 9 * 60;
};
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

// src/shared/catalogue-pur.ts
var CATEGORIE_VEKPE = "atl-i-vekpe";
var CATEGORIE_FINFIN = "atl-iv-finfin";
var fondeLaCouronne = (s) => s.categoryId === CATEGORIE_VEKPE;
var priceModeOf = (s) => s.priceMode ?? (s.hidePrice ? "devis" : "fixe");
var racineOf = (cats, id) => {
  let cur = cats.find((c) => c.id === id);
  for (let i = 0; cur?.parentId && i < 8; i += 1) {
    const parent = cats.find((c) => c.id === cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur;
};

// src/shared/qualification.ts
function exigeConsultation(s, cats) {
  if (s.consultationAvant === true) return true;
  if (fondeLaCouronne(s)) return true;
  if (priceModeOf(s) === "devis") return true;
  return racineOf(cats, s.categoryId)?.id === CATEGORIE_FINFIN;
}
var porteDe = (s, cats) => exigeConsultation(s, cats) ? "consultation" : "directe";

// src/shared/reservation-express.ts
var PLACES_PAR_JOUR = 2;
function prochainesPlaces(jours, combien = 6) {
  const tries = [...jours].sort((x, y) => x.iso < y.iso ? -1 : 1).map((j) => ({ iso: j.iso, heures: [...j.heures].sort((x, y) => x.heure < y.heure ? -1 : 1) }));
  const cle = (iso, h) => `${iso} ${h.heure}`;
  const prises = /* @__PURE__ */ new Set();
  const out = [];
  for (const j of tries) {
    if (out.length >= combien) break;
    const matin = j.heures[0];
    const apres = j.heures.find((h) => h.heure >= "13:00" && h !== matin) ?? j.heures[1];
    for (const h of [matin, apres].filter(Boolean).slice(0, PLACES_PAR_JOUR)) {
      if (out.length >= combien) break;
      out.push({ iso: j.iso, place: h });
      prises.add(cle(j.iso, h));
    }
  }
  for (const j of tries) {
    for (const h of j.heures) {
      if (out.length >= combien) break;
      if (!prises.has(cle(j.iso, h))) {
        out.push({ iso: j.iso, place: h });
        prises.add(cle(j.iso, h));
      }
    }
  }
  return out.sort((x, y) => x.iso < y.iso ? -1 : x.iso > y.iso ? 1 : x.place.heure < y.place.heure ? -1 : 1);
}

// src/shared/automate-wa.ts
var MINUTE_WA = 60 * 1e3;
var HEURE_WA = 60 * MINUTE_WA;
var JOUR_WA = 24 * HEURE_WA;
var TOUR_PERIME_MS = 15 * MINUTE_WA;
var LA_MAISON_A_PARLE_MS = 7 * JOUR_WA;
var JOURS_LONGS_WA = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var MOIS_LONGS_WA = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function instantACotonou(ms) {
  const d = new Date(ms + HEURE_WA);
  return { iso: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() };
}
var isoPlusJoursWa = (iso, n) => {
  const d = /* @__PURE__ */ new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function heureDite(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return hhmm ?? "";
  const minutes = Number(m[2]);
  return minutes > 0 ? `${Number(m[1])} h ${m[2]}` : `${Number(m[1])} h`;
}
function jourDitAvecAnnee(iso) {
  const d = /* @__PURE__ */ new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  const n = d.getUTCDate();
  return `${JOURS_LONGS_WA[d.getUTCDay()]} ${n === 1 ? "1er" : n} ${MOIS_LONGS_WA[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function prochaineOuvertureDite(maintenantMs, semaine, exceptions) {
  if (semaine.length === 0) return null;
  const ici = instantACotonou(maintenantMs);
  const ce = ouvertureDuJour(ici.iso, semaine, exceptions);
  if (!ce.closed && ici.min >= ce.openMin && ici.min < ce.closeMin) return null;
  for (let i = 0; i <= 14; i += 1) {
    const iso = isoPlusJoursWa(ici.iso, i);
    const f = ouvertureDuJour(iso, semaine, exceptions);
    if (f.closed) continue;
    if (i === 0 && ici.min >= f.openMin) continue;
    const h = heureDite(`${String(Math.floor(f.openMin / 60)).padStart(2, "0")}:${String(f.openMin % 60).padStart(2, "0")}`);
    const quand = i === 0 ? "aujourd'hui" : i === 1 ? "demain" : jourDitAvecAnnee(iso);
    return `${quand} dès ${h}`;
  }
  return "dès sa réouverture";
}
function prixDuCatalogue(lignes) {
  const out = {};
  for (const l of lignes) {
    const d = l?.data ?? {};
    const p = Math.round(Number(d.priceXof));
    if (!Number.isFinite(p) || p <= 0 || d.hidePrice === true || d.priceMode === "devis" || d.archived === true) continue;
    out[l.id] = p;
    if (typeof d.code === "string" && d.code.trim()) out[d.code.trim()] = p;
  }
  return out;
}
var prixDitWa = (n) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;

// src/shared/ia-reponse-wa-pur.ts
var FIL_MAX = 12;
var SIGNES_MAX_PAR_MESSAGE = 600;
var MOTS_MAX = 70;
var SIGNES_MAX = 600;
var LIENS_DE_LA_MAISON = {
  catalogue: "https://maisonmnd.com/reserver/?besoin=entretien",
  creation: "https://maisonmnd.com/reserver/?besoin=creation",
  reparation: "https://maisonmnd.com/reserver/?besoin=reparation"
};
var LIGNES_DE_CATALOGUE_MAX = 40;
var PLACES_DITES = 6;
function paliersDeLocks(bandes) {
  const tri = [...bandes].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));
  return tri.map((b, i) => {
    const avant = i > 0 ? tri[i - 1].maxLocks ?? 0 : 0;
    const max = b.maxLocks ?? null;
    const palier = max == null ? `plus de ${avant} locks` : avant === 0 ? `jusqu’à ${max} locks` : `${avant + 1} à ${max} locks`;
    return { id: b.id, palier, locks: max ?? avant + 100 };
  });
}
var AGENDA_NON_CONSULTE = "Agenda : non consulté. Ne promets aucune place : invite à réserver sur maisonmnd.com/reserver/ ou dis que la Maison confirme l’heure.";
var FORMAT_DU_JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
function dateDitePourClaude(iso, heure) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const jour = FORMAT_DU_JOUR.format(/* @__PURE__ */ new Date(`${iso}T12:00:00Z`));
  const h = String(heure ?? "").trim();
  return h ? `${jour} à ${h}` : jour;
}
function lignesDuCataloguePourClaude(services, categories) {
  const prix = prixDuCatalogue(services.map((s) => ({ id: s.id, data: s })));
  const cats = [...categories];
  const out = [];
  for (const s of services) {
    if (s.archived === true || s.hidePrice === true || !s.name?.trim()) continue;
    const nom = s.name.trim();
    if (porteDe(s, cats) === "consultation") {
      out.push(`${nom} : consultation d’abord, devis remis par écrit après la consultation (aucun prix avant)`);
    } else {
      const p = prix[s.id];
      const paliers = (s.prixParPalier ?? []).filter((x) => x.prixXof > 0 && x.palier.trim());
      const distincts = new Set(paliers.map((x) => x.prixXof));
      if ((s.prixPourElle ?? 0) > 0) out.push(`${nom} : ${prixDitWa(s.prixPourElle)} pour elle, d’après son nombre de locks`);
      else if (distincts.size > 1) out.push(`${nom}, selon le nombre de locks : ${paliers.map((x) => `${x.palier}, ${prixDitWa(x.prixXof)}`).join(" ; ")}`);
      else if (paliers.length > 0) out.push(`${nom} : ${s.priceMode === "variable" ? "à partir de " : ""}${prixDitWa(paliers[0].prixXof)}`);
      else if (p > 0) out.push(`${nom} : ${s.priceMode === "variable" ? "à partir de " : ""}${prixDitWa(p)}`);
      else continue;
    }
    if (out.length >= LIGNES_DE_CATALOGUE_MAX) break;
  }
  return out;
}
var enCapitales = (m) => /^\p{Lu}[\p{Lu}'’-]+$/u.test(m);
var personneDuNom = (nom) => {
  const mots = String(nom ?? "").trim().split(/\s+/).filter(Boolean);
  if (mots.length >= 2 && enCapitales(mots[0]) && !enCapitales(mots[1])) {
    return { prenom: mots.slice(1).join(" "), nom: mots[0] };
  }
  return { prenom: mots[0] ?? "", nom: mots.slice(1).join(" ") };
};
var formesAMasquer = (p) => {
  const nom = (p.nom ?? "").trim();
  return nom.replace(/[^\p{L}]/gu, "").length >= 3 ? [p, { nom }] : [p];
};
var coupe = (t, n) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
};
var NATURE_DU_MESSAGE = {
  image: "une photo",
  video: "une vidéo",
  audio: "un message vocal",
  document: "un document",
  sticker: "un autocollant",
  location: "sa position",
  contacts: "une fiche de contact"
};
var TYPES_DE_MOTS = /* @__PURE__ */ new Set(["text", "button", "interactive", "template"]);
function filPourClaude(fil, personnes, qui = "Elle") {
  const masques = personnes.flatMap(formesAMasquer);
  const lignes = [];
  for (const m of fil) {
    if (m.sens === "sortant" && m.etat === "non-remis") continue;
    const texte = String(m.texte ?? "").trim();
    const nature = m.type ? NATURE_DU_MESSAGE[m.type] : void 0;
    let dit = "";
    if (!m.type || TYPES_DE_MOTS.has(m.type)) dit = texte;
    else if (nature) dit = texte && texte !== nature ? `[${nature}] ${texte}` : `[${nature}]`;
    if (!dit) continue;
    lignes.push(`${m.sens === "entrant" ? qui : "La Maison"} : ${pourClaude(coupe(dit, SIGNES_MAX_PAR_MESSAGE), masques)}`);
  }
  return lignes.slice(-FIL_MAX);
}
function contextePourClaude(o) {
  const nomDeLaFiche = o.fiche?.name?.trim() ?? "";
  const profil = o.nomProfil && !/\d/.test(o.nomProfil) ? o.nomProfil.trim() : "";
  const personnes = [nomDeLaFiche, profil].filter(Boolean).map(personneDuNom);
  const masques = personnes.flatMap(formesAMasquer);
  const sienne = personneDuNom(nomDeLaFiche || profil);
  const elle = nomDeLaFiche || profil ? prenomEtInitiale(sienne) : "";
  const nomRemis = [sienne.prenom, sienne.nom].filter(Boolean).join(" ");
  const appel = o.fiche ? appelDe({ ...o.fiche, name: nomDeLaFiche ? nomRemis : o.fiche.name }, profil ? nomRemis : null) : appelDe(null, profil ? nomRemis : null);
  const lignes = [];
  lignes.push("CONTEXTE, pour écrire la réponse de la Maison.");
  lignes.push(`La cliente : ${elle || "sans fiche"}. On l’appelle : ${appel}.`);
  if (o.fiche && !o.fiche.civilite) lignes.push("Sa civilité n’est pas notée sur sa fiche.");
  lignes.push(`Aujourd’hui : ${dateDitePourClaude(o.aujourdhui)}.`);
  if (o.fiche) {
    const rdv = o.prochainRdv;
    lignes.push(rdv ? `Son prochain rendez-vous : ${dateDitePourClaude(rdv.date, rdv.time)}${rdv.gestes?.length ? ` (${rdv.gestes.join(", ")})` : ""}.` : "Aucun rendez-vous à venir.");
    const venue = o.derniereVenue;
    if (venue) lignes.push(`Sa dernière venue : ${dateDitePourClaude(venue.date)}${venue.gestes?.length ? ` (${venue.gestes.join(", ")})` : ""}.`);
    if (typeof o.resteDu === "number" && Number.isFinite(o.resteDu) && o.resteDu >= 0) {
      lignes.push(o.resteDu > 0 ? `Reste dû sur son compte : ${prixDitWa(o.resteDu)}. N’en parle QUE si son message porte sur ce qu’elle doit ou sur un règlement ; ne cite aucun numéro de pièce.` : "Rien à régler : son compte est soldé.");
    }
  } else {
    lignes.push("Elle n’a pas de fiche à la Maison : ni rendez-vous connu, ni compte.");
  }
  if (o.places) {
    const dites = prochainesPlaces(o.places.filter((j) => /^\d{4}-\d{2}-\d{2}$/.test(j.iso) && j.iso > o.aujourdhui), PLACES_DITES);
    lignes.push(dites.length ? `Prochaines places libres (les seules que tu peux proposer) : ${dites.map((p) => dateDitePourClaude(p.iso, p.place.heure)).join(" ; ")}.` : "Agenda consulté : aucune place libre prochainement. Ne promets rien ; dis que la Maison la rappelle pour une date.");
  } else {
    lignes.push(AGENDA_NON_CONSULTE);
  }
  const compte = o.locks?.compte && o.locks.compte > 0 ? Math.round(o.locks.compte) : 0;
  const declare = o.locks?.declare && o.locks.declare > 0 ? Math.round(o.locks.declare) : 0;
  lignes.push(compte ? `Son nombre de locks, compté à la Maison : environ ${compte}.` : declare ? `Son nombre de locks, annoncé par elle : environ ${declare} (pas encore compté à la Maison).` : "Son nombre de locks : inconnu. Avant tout prix qui en dépend, demande-le-lui, approximativement.");
  lignes.push(o.catalogue.length ? `Catalogue (les seuls prix que tu peux donner, tels quels) :
${o.catalogue.slice(0, LIGNES_DE_CATALOGUE_MAX).map((l) => `- ${l}`).join("\n")}` : "Catalogue : aucun prix disponible. Ne donne aucun montant ; dis que l’équipe précise.");
  lignes.push(`Liens de la Maison, à donner tels quels, un seul par message : le catalogue en ligne, où elle voit les prix et réserve un soin, un entretien, une reprise ou une coiffure : ${LIENS_DE_LA_MAISON.catalogue} ; la consultation de création : ${LIENS_DE_LA_MAISON.creation} ; la consultation de réparation : ${LIENS_DE_LA_MAISON.reparation}.`);
  const lui = o.fiche?.civilite === "monsieur" || o.fiche?.auMasculin === true;
  const tours = filPourClaude(o.fil, personnes, lui ? "Lui" : "Elle");
  lignes.push(tours.length ? `Le fil (les ${Math.min(FIL_MAX, tours.length)} derniers messages, le plus récent en bas) :
${tours.join("\n")}` : "Le fil : aucun message écrit encore.");
  lignes.push("Écris maintenant la réponse de la Maison à son dernier message.");
  if (o.dejaProposee?.trim()) lignes.push(`Une proposition a déjà été écartée, écris-en une autre, différente : « ${coupe(o.dejaProposee, SIGNES_MAX)} ».`);
  return pourClaude(lignes.join("\n"), masques);
}
function consigneDeLaReponse() {
  return [
    "Tu écris, au nom de la Maison MND, maison de soin et de création de locks à Cotonou, la réponse WhatsApp à une cliente.",
    "Une personne de l’équipe la relira, la corrigera et décidera seule de l’envoyer : tu PROPOSES, tu n’envoies rien.",
    "",
    "La voix de la Maison MND est celle d’une maison d’exception : élégante, posée, attentionnée. Jamais familière, jamais commerciale, jamais pressante.",
    "Des phrases complètes et soignées, un français choisi : la Maison accueille, prend soin, parle de « votre couronne » et de « vos locks », d’un « rituel » plutôt que d’une prestation.",
    "Le vouvoiement, toujours. On dit « la Maison », JAMAIS « salon ». Ni « coucou », ni « ok », ni abréviation, ni point d’exclamation répété.",
    `Pas d’émoji, pas de tiret long, pas de liste, pas de titre. ${MOTS_MAX} mots au plus, en français (ou dans la langue de la cliente).`,
    "Le ton, par exemple : « Avec plaisir, Mme Clarisse. Pour vous indiquer le juste prix de votre entretien, pourriez-vous nous dire combien de locks vous portez, approximativement ? »",
    "",
    "Ce que tu sais d’elle est dans le contexte : comment on l’appelle (reprends cet appel tel quel, n’invente ni nom ni civilité),",
    "son prochain rendez-vous, ce qui lui reste à régler, son nombre de locks s’il est connu, les places libres si l’agenda a été consulté, les prix du catalogue et les liens de la Maison.",
    "",
    "Les prix, comme sur maisonmnd.com :",
    "- Une création de locks ou une réparation commence TOUJOURS par une consultation. N’en donne AUCUN prix, ni « à partir de », ni estimation : la Maison remet son devis par écrit après la consultation. Propose de réserver la consultation, avec son lien.",
    "- Les soins, les entretiens, les reprises, les coiffures et le reste se réservent au prix de la carte : ceux du catalogue du contexte, écrits tels quels. Tu peux donner le lien du catalogue en ligne, où elle retrouve les prix et réserve.",
    "- Avant tout prix qui dépend du nombre de locks, il te faut son nombre de locks. S’il n’est ni dans le contexte ni dans le fil, demande-lui d’abord, avec délicatesse, combien de locks elle porte approximativement, sans citer de montant. Une fois le nombre connu, donne le prix du palier qui lui correspond.",
    "- Aucun autre montant, aucune estimation, aucune remise que le contexte ne donne pas.",
    "",
    "Pour inscrire un rendez-vous, si elle n’a pas de fiche ou si sa civilité n’est pas notée : demande d’abord « Pour inscrire votre rendez-vous, comment devons-nous vous appeler ? », puis « Madame ou Monsieur ? ». Jamais une civilité supposée, jamais un simple prénom à sa place.",
    "",
    "Règles absolues :",
    "- Les places : ne promets JAMAIS une place, une heure ni un jour qui ne figure pas dans l’agenda du contexte. Sans agenda, invite à réserver sur maisonmnd.com/reserver/ ou dis que la Maison lui confirme l’heure.",
    "- Le cuir chevelu et les cheveux : aucun diagnostic ni avis à distance (démangeaison, plaque, chute, douleur). Invite à passer à la Maison ou à prendre une consultation.",
    "- Ne cite JAMAIS un numéro de facture, de reçu ou de devis, ni aucun numéro de téléphone.",
    "- Ce qu’elle doit : n’en parle jamais de toi-même. Seulement si son dernier message porte sur un règlement ou sur ce qu’elle doit ; aucune relance.",
    "- Une photo, un vocal se disent dans le fil entre crochets (« [une photo] ») : tu ne les vois pas et ne les entends pas. Ne décris rien, ne juge rien ; propose de regarder ensemble à la Maison.",
    "- N’invente rien : ce que le contexte ne dit pas, tu ne le sais pas ; propose alors que l’équipe précise.",
    "- Ne signe pas, n’ajoute ni devise ni longue formule finale : la personne qui envoie s’en charge.",
    "- Réponds à son dernier message, dans la suite du fil : si la Maison a déjà salué dans les derniers échanges, ne salue pas une seconde fois.",
    "",
    'Réponds uniquement par l’objet demandé : { "reponse": "le texte du message" }.'
  ].join("\n");
}
var SCHEMA_DE_LA_REPONSE = {
  type: "object",
  properties: { reponse: { type: "string", description: `Le message WhatsApp proposé, ${MOTS_MAX} mots au plus, sans émoji.` } },
  required: ["reponse"],
  additionalProperties: false
};
var NUMERO = /\d(?:[\s.\-]?\d){7,}/g;
var DATE_ISO2 = /^\d{4}-\d{2}-\d{2}$/;
var PIECE = /(^|[^\p{L}])(?:MND(?:-[A-Z])?|CMD|F)-\d|\bn[°º]\s*\d/iu;
var porteUnNumero = (t) => PIECE.test(t) || [...t.matchAll(NUMERO)].some((m) => !DATE_ISO2.test(m[0].trim()));
var EMOJI = /(?![\u00A9\u00AE\u2122])[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;
var motsDe = (t) => String(t ?? "").trim().split(/\s+/).filter(Boolean).length;
function coupeAuxPhrases(t) {
  if (motsDe(t) <= MOTS_MAX && t.length <= SIGNES_MAX) return t;
  const phrases = (t.match(/[^.!?…]+[.!?…]*/g) ?? [t]).map((p) => p.trim()).filter(Boolean);
  let garde = "";
  for (const p of phrases) {
    const essai = garde ? `${garde} ${p}` : p;
    if (motsDe(essai) > MOTS_MAX || essai.length > SIGNES_MAX) break;
    garde = essai;
  }
  if (garde) return garde;
  const mots = t.split(/\s+/);
  let court = "";
  for (const m of mots) {
    const essai = court ? `${court} ${m}` : m;
    if (motsDe(essai) > MOTS_MAX || essai.length > SIGNES_MAX - 1) break;
    court = essai;
  }
  return `${court.replace(/[\s,;:]+$/, "")}…`;
}
function lectureDeLaReponse(brut) {
  const champ = brut && typeof brut === "object" ? brut.reponse : brut;
  if (typeof champ !== "string") return null;
  let t = champ.replace(/\r\n?/g, "\n").replace(/\s*[—–]\s*/g, ", ").replace(/\*\*/g, "").replace(EMOJI, "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
  if (!t) return null;
  if (porteUnNumero(t)) return null;
  if (/(^|[^\p{L}])salons?(?=$|[^\p{L}])/iu.test(t)) return null;
  t = coupeAuxPhrases(t.replace(/\n/g, " "));
  return t || null;
}

// src/shared/chat-du-site-pur.ts
var NOMS_DES_JOURS = {
  lun: "lundi",
  mar: "mardi",
  mer: "mercredi",
  jeu: "jeudi",
  ven: "vendredi",
  sam: "samedi",
  dim: "dimanche"
};
var ORDRE_DES_JOURS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
var heureDite2 = (h) => {
  const m = /^(\d{1,2})\s*[h:]\s*(\d{2})?$/i.exec(String(h ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}h${m[2] ?? "00"}` : "";
};
function heuresPourClaude(semaine) {
  if (!Array.isArray(semaine) || !semaine.length) return [];
  const fenetre = (clef) => {
    const j = semaine.find((h) => h?.key === clef);
    const o = heureDite2(j?.open ?? "");
    const f = heureDite2(j?.close ?? "");
    return !j || j.closed || !o || !f ? "fermé" : `${o} à ${f}`;
  };
  const groupes = [];
  for (const clef of ORDRE_DES_JOURS) {
    const texte = fenetre(clef);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.texte === texte) dernier.a = clef;
    else groupes.push({ de: clef, a: clef, texte });
  }
  return groupes.map((g) => `${g.de === g.a ? NOMS_DES_JOURS[g.de] : `du ${NOMS_DES_JOURS[g.de]} au ${NOMS_DES_JOURS[g.a]}`} : ${g.texte}`);
}

// src/shared/reception-wa-pur.ts
var SUITES = ["rien", "reserver", "creation", "reparation", "calibre", "equipe", "venir"];
var REPERES_DE_LA_CONSIGNE = [
  [
    "Tu écris, au nom de la Maison MND, maison de soin et de création de locks à Cotonou, la réponse WhatsApp à une cliente.",
    "Tu es l’assistant de la Maison MND, maison de soin et de création de locks à Cotonou : tu réponds toi-même, sur WhatsApp, au nom de la Maison, à toute heure."
  ],
  [
    "Une personne de l’équipe la relira, la corrigera et décidera seule de l’envoyer : tu PROPOSES, tu n’envoies rien.",
    "Ton message part tel quel, sans relecture : chaque mot compte. Ce dont tu n’es pas sûr, tu le dis, et tu confies la suite à l’équipe."
  ],
  [
    "- Ne signe pas, n’ajoute ni devise ni longue formule finale : la personne qui envoie s’en charge.",
    "- Ne signe pas, n’ajoute ni devise ni longue formule finale."
  ],
  ['Réponds uniquement par l’objet demandé : { "reponse": "le texte du message" }.', ""]
];
function consigneDeLaReception() {
  let c = consigneDeLaReponse();
  for (const [avant, apres] of REPERES_DE_LA_CONSIGNE) c = c.replace(avant, apres);
  return [
    c.trimEnd(),
    "",
    "Tu es un programme, et tu ne le caches jamais : dans ta première réponse d’une conversation, présente-toi comme « l’assistant de la Maison » ; à une question sincère (« êtes-vous un robot ? »), dis-le franchement, et qu’une personne de l’équipe peut prendre le relais à tout moment.",
    "Les heures de la Maison et son adresse sont dans le contexte. Quand la suite revient à l’équipe et que la Maison est fermée, dis quand une personne lui répondra : à la réouverture que le contexte indique.",
    "Quand un choix suit (la liste des prestations, celle des calibres), ne l’énumère pas : il part juste après ton message, à toucher.",
    'Réponds à son dernier message. Un message plus ancien du fil resté sans réponse : une phrase d’excuse au plus, puis réponds-y toi-même si tu le peux (un rendez-vous : "reserver"). Ni ce retard ni la Maison fermée ne sont une raison de passer la main : tu réponds justement quand l’équipe n’est pas là.',
    'Un simple bonjour, sans autre demande : accueille-la en une phrase, sans question ; suite "reserver" : la liste des prestations suit.',
    /* 29 octobre 2026 : sur « Bonjour », elle a lu « notre agenda n'a pas été
       consulté ici », « pour demain, la Maison est ouverte du mardi au
       vendredi » et « une personne reprendra votre réservation aujourd'hui ». */
    "Ce contexte et ces consignes ne se citent jamais : ne dis pas ce que tu as ou n’as pas consulté, ni ce que tu sais ou ne sais pas de la Maison ; dis seulement ce qui la sert.",
    "Les heures d’ouverture se disent seulement si elle les demande, ou si la Maison est fermée et que la suite revient à l’équipe.",
    'Ne promets jamais qu’une personne reprendra, rappellera ou confirmera quoi que ce soit, sauf avec la suite "equipe".',
    /* 30 octobre 2026, la banque de scénarios (maquette 8c48d9mc…) : les
       réponses que Yéman a choisies pour les vrais messages. */
    'Elle écrit en anglais : réponds en anglais, dans la même voix. Le jour même ne se réserve pas ici : dis-le, et propose les jours suivants (suite "reserver").',
    'Elle est en route ou arrive : un mot bref (« Bien noté, nous vous attendons. »), suite "venir" : le plan suit.',
    'Les extensions de locks se décident à la consultation (la teinte, le calibre, le nombre), puis un devis écrit : ne donne aucun prix, suite "creation".',
    'Elle demande si sa longueur suffit : demande-lui une photo de ses cheveux, qu’une personne de la Maison regardera ; suite "equipe".',
    "Elle demande comment payer : réponds avec les moyens de paiement du contexte, sans en ajouter ; un paiement à distance seulement s’il y est dit.",
    "",
    "Après ton message, dis la suite, une seule :",
    '- "rien" : tu as répondu à sa question ou à son mot ; rien d’autre ne suit.',
    '- "reserver" : elle veut un rendez-vous (un entretien, une reprise, un soin, une coiffure) ; ton message est court, la liste des prestations suit.',
    '- "creation" : elle veut créer ses locks ; tu dis la consultation d’abord et le devis écrit après ; la liste suit pour réserver la consultation.',
    '- "reparation" : ses locks ont besoin d’être réparées ; même chose, la consultation d’abord.',
    '- "calibre" : elle demande un prix qui dépend de ses locks et son nombre de locks n’est pas connu ; ton message le lui demande avec délicatesse, sans aucun montant ; la liste des calibres de la Maison suit.',
    '- "equipe" : sa santé ou une gêne, une plainte, un remboursement, un règlement, une photo ou un vocal, une demande qui ne concerne pas la Maison (une adresse pour sortir, un restaurant), ou ce que tu ne sais pas faire : ton message dit, avec égards, qu’une personne de la Maison prend le relais. Jamais pour un bonjour, un rendez-vous, un prix, les heures ou l’adresse : à ceux-là, tu réponds toi-même.',
    /* 30 octobre 2026 : à « Envoie-moi la localisation », elle a lu « je ne
       peux pas vous transmettre de localisation ». */
    '- "venir" : elle demande l’adresse, le chemin, la localisation ou un itinéraire ; ton message donne l’adresse en une phrase et dit que le plan pour venir suit ; le plan de la Maison et la Maison sur Google Maps partent juste après ton message. Ne dis jamais que tu ne peux pas envoyer la localisation, et ne promets aucune personne pour guider.',
    "",
    'Réponds uniquement par l’objet demandé : { "texte": "ton message", "suite": "rien" }.'
  ].join("\n");
}
var SCHEMA_DE_LA_RECEPTION = {
  type: "object",
  properties: {
    texte: { type: "string", description: "Le message WhatsApp, au nom de la Maison, sans émoji." },
    suite: { type: "string", enum: [...SUITES], description: "Ce qui suit le message." }
  },
  required: ["texte", "suite"],
  additionalProperties: false
};
var ADRESSE_DE_LA_MAISON = "Ilot 130-F, Maison 88, Portail Marron, quartier Suru-Léré, Cotonou";
var AGENDA_DE_LA_RECEPTION = 'Les places libres : pour un rendez-vous, ta suite est "reserver", et la liste qui suit lui propose les vraies places. Ne promets aucune heure ni aucun jour, et ne parle pas de l’agenda.';
function contexteDeLaReception(o) {
  const base = contextePourClaude(o).replace(AGENDA_NON_CONSULTE, AGENDA_DE_LA_RECEPTION);
  const heures = heuresPourClaude(o.semaine);
  const reouverture = prochaineOuvertureDite(o.maintenantMs, o.semaine, o.exceptions);
  const lignes = [
    base,
    "",
    "LA MAISON :",
    `- Adresse : ${ADRESSE_DE_LA_MAISON}.`,
    heures.length ? `- Heures d’ouverture : ${heures.join(" ; ")}.` : "- Heures d’ouverture : non communiquées ; ne donne aucune heure.",
    reouverture === null ? "- En ce moment, la Maison est ouverte : une personne de l’équipe peut répondre dans la journée." : `- En ce moment, la Maison est fermée, et tu réponds pour elle ; si la suite revient à l’équipe, une personne lui répondra ${reouverture}.`,
    ...(o.paiements ?? []).length > 0 ? [`- Moyens de paiement à la Maison : ${(o.paiements ?? []).join(", ")}.`] : [],
    ...o.paiementEnLigne ? ["- Paiement à distance : la Maison envoie un lien de paiement en ligne (MND PAY), sur demande."] : [],
    o.premiereReponse ? "- C’est ta première réponse dans cette conversation : présente-toi comme l’assistant de la Maison." : "- La Maison a déjà répondu dans cette conversation : ne te présente pas de nouveau, ne salue pas une seconde fois."
  ];
  return lignes.join("\n");
}
function montantsDe(t) {
  return [...String(t ?? "").matchAll(/(\d{1,3}(?:[   .]\d{3})+|\d+)\s*(?:F\b|FCFA\b|francs?\b)/giu)].map((m) => Number(m[1].replace(/[^\d]/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
}
function lectureDeLaReception(brut, montantsPermis) {
  if (!brut || typeof brut !== "object") return null;
  const b = brut;
  const texte = lectureDeLaReponse({ reponse: b.texte });
  if (!texte) return null;
  const suite = SUITES.includes(b.suite) ? b.suite : "rien";
  const montants = montantsDe(texte);
  if ((suite === "creation" || suite === "reparation" || suite === "calibre") && montants.length > 0) return null;
  if (montants.some((n) => !montantsPermis.has(n))) return null;
  return { texte, suite };
}
var CHOIX_DU_CALIBRE = "calibre:";
var CALIBRE_INCONNU = `${CHOIX_DU_CALIBRE}inconnu`;
var LIGNES_MAX = 10;
function listeDesCalibres(bandes) {
  const paliers = paliersDeLocks(bandes);
  const nomDe = new Map(bandes.map((b) => [b.id, String(b.name ?? "").trim()]));
  const lignes = paliers.slice(0, LIGNES_MAX - 1).map((p) => {
    const nom = nomDe.get(p.id) || p.palier;
    return { id: `${CHOIX_DU_CALIBRE}${p.id}`, titre: nom.slice(0, 24), ...nom !== p.palier ? { description: p.palier.slice(0, 72) } : {} };
  });
  return [...lignes, { id: CALIBRE_INCONNU, titre: "Je ne sais pas", description: "La Maison les comptera avec vous" }];
}
function calibreDuChoix(id, bandes) {
  const m = /^(?:MND:\d+:)?calibre:(.+)$/.exec(String(id ?? ""));
  if (!m) return null;
  if (m[1] === "inconnu") return "inconnu";
  const p = paliersDeLocks(bandes).find((x) => x.id === m[1]);
  return p ? { locks: p.locks, palier: p.palier } : null;
}
var RECEPTIONS_PAR_JOUR = 20;

// src/apps/revelateur/prix-calibre.ts
var PRIX_FIXES = /* @__PURE__ */ new Set(["sv-gbigbi-essentiel", "sv-rituel-mq6wbusw", "sv-rituel-mq6zu12s", "sv-rituel-mp2qnjwa"]);
var bandesTriees = (bandes) => [...bandes].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));
var bandeDuCompte = (lockCount, bandes) => {
  if (!lockCount || lockCount <= 0 || bandes.length === 0) return void 0;
  const tri = bandesTriees(bandes);
  return tri.find((b) => lockCount <= (b.maxLocks ?? Infinity)) ?? tri[tri.length - 1];
};
var bandeDeLaPrestation = (s, ctx) => {
  let id = s.categoryId;
  for (let i = 0; id && i < 8; i += 1) {
    const propre = ctx.sets?.[id];
    if (propre?.length) return bandeDuCompte(ctx.lockCount, propre);
    id = ctx.cats?.find((c) => c.id === id)?.parentId;
  }
  return ctx.bande;
};
var sertLaBande = (s, bande) => {
  if (s.bandIds?.length) return !!bande && s.bandIds.includes(bande.id);
  if (!bande) return true;
  if (s.bandId) return s.bandId === bande.id;
  const cles = Object.keys(s.priceFloors ?? {});
  return cles.length === 0 || cles.includes(bande.id);
};
var modeDuTarif = (s) => s.tarifMode ?? (s.ratePerLock ? "lock" : "calibre");
var arrondi = (x) => {
  const r = Math.round(x / 500) * 500;
  return r === 0 && x > 0 ? Math.round(x) : r;
};
var prixSelonLesLocks = (s, lockCount) => {
  if (!s.paliersDeLocks?.length || !lockCount || lockCount <= 0) return void 0;
  let gagnant;
  for (const pal of s.paliersDeLocks) {
    if (lockCount > pal.auDela && (!gagnant || pal.auDela > gagnant.auDela)) gagnant = pal;
  }
  return gagnant?.prixXof;
};
var suitLeModele = (s, ctx) => !PRIX_FIXES.has(s.id) && !ctx.baremeSuspendu && s.scalesWithModel === true;
function prixSelonLeCalibre(s, ctx) {
  const base = Number(s.priceXof ?? 0);
  if (PRIX_FIXES.has(s.id)) return base || void 0;
  const bande = bandeDeLaPrestation(s, ctx);
  const deBase = prixSelonLesLocks(s, ctx.lockCount) ?? base;
  if (!sertLaBande(s, bande)) return deBase || void 0;
  if (modeDuTarif(s) === "calibre" && bande && s.priceFloors?.[bande.id] !== void 0) return s.priceFloors[bande.id];
  const auLock = modeDuTarif(s) === "lock" ? ctx.lockCount && ctx.lockCount > 0 && s.ratePerLock ? ctx.lockCount * s.ratePerLock : void 0 : s.ratePerLock && ctx.lockCount && ctx.lockCount > 0 ? Math.max(ctx.lockCount * s.ratePerLock, bande ? s.priceFloors?.[bande.id] ?? 0 : 0) : void 0;
  if (auLock !== void 0) return auLock;
  const grilleLongueur = !!s.prixParLongueur && Object.keys(s.prixParLongueur).length > 0;
  const coef = !grilleLongueur && suitLeModele(s, ctx) && bande ? bande.coef : 1;
  const prix = arrondi(deBase * coef);
  return prix || void 0;
}

// scripts/serveur/reception-wa.ts
var VERSION = "2026-10-30-c";
var MODELES = ["claude-haiku-5-5", "claude-sonnet-5-5"];
var TARIFS = {
  "claude-haiku-5-5": { entree: 1, sortie: 5 },
  "claude-sonnet-5-5": { entree: 3, sortie: 15 }
};
var CLE_DU_COMPTE = "mnd_assistant_wa_compte";
var DELAI_CLAUDE_MS = 2e4;
var json = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
var dis = (quoi, o = {}) => console.log(`reception-wa · ${quoi} · ${JSON.stringify(o)}`);
var jourDeLaMaison = (ms) => new Date(ms + 36e5).toISOString().slice(0, 10);
async function toutes(sb, table) {
  const out = [];
  for (let de = 0; ; de += 1e3) {
    const { data, error } = await sb.from(table).select("id, data").order("id", { ascending: true }).range(de, de + 999);
    if (error) throw new Error(`${table} : ${error.message}`);
    out.push(...data ?? []);
    if ((data ?? []).length < 1e3) break;
  }
  return out;
}
async function appelleClaude(cle, corps) {
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_CLAUDE_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: arret.signal,
      headers: { "content-type": "application/json", "x-api-key": cle, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(corps)
    });
    const texte = await r.text();
    let lu;
    try {
      lu = JSON.parse(texte);
    } catch {
      lu = { error: { message: texte.slice(0, 200) } };
    }
    return { status: r.status, corps: lu };
  } finally {
    clearTimeout(minuterie);
  }
}
var modeleInconnu = (status, c) => (status === 404 || status === 400) && /model/i.test(String(c.error?.message ?? ""));
function prestationsAvecLeursPaliers(services, cats, bandes, sets, baremeSuspendu, sesLocks) {
  const paliers = paliersDeLocks(bandes);
  const tri = [...bandes].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));
  const bandeDuCompte2 = (n) => tri.find((b) => n <= (b.maxLocks ?? Infinity)) ?? tri[tri.length - 1];
  return services.map((l) => {
    const s = { ...l.data, id: l.id };
    const prixParPalier = [];
    for (const p of paliers) {
      const bande = bandes.find((b) => b.id === p.id);
      const prix = prixSelonLeCalibre(s, { bande, lockCount: p.locks, sets, cats, baremeSuspendu });
      if (prix && prix > 0) prixParPalier.push({ palier: p.palier, prixXof: prix });
    }
    const pourElle = sesLocks > 0 ? prixSelonLeCalibre(s, { bande: bandeDuCompte2(sesLocks), lockCount: sesLocks, sets, cats, baremeSuspendu }) : void 0;
    return { ...s, ...prixParPalier.length ? { prixParPalier } : {}, ...pourElle && pourElle > 0 ? { prixPourElle: pourElle } : {} };
  });
}
async function compteLAppel(sb, modele, usage, maintenantMs) {
  try {
    const mois = jourDeLaMaison(maintenantMs).slice(0, 7);
    const { data } = await sb.from("documents").select("data").eq("key", CLE_DU_COMPTE).maybeSingle();
    const avant = data?.data ?? {};
    const t = TARIFS[modele] ?? TARIFS["claude-sonnet-5-5"];
    const e = Number(usage?.input_tokens ?? 0);
    const so = Number(usage?.output_tokens ?? 0);
    const m = avant[mois] ?? {};
    const neuf = {
      appels: (m.appels ?? 0) + 1,
      entree: (m.entree ?? 0) + e,
      sortie: (m.sortie ?? 0) + so,
      usd: Math.round(((m.usd ?? 0) + (e * t.entree + so * t.sortie) / 1e6) * 1e4) / 1e4
    };
    await sb.from("documents").upsert({ key: CLE_DU_COMPTE, data: { ...avant, [mois]: neuf } });
  } catch (e) {
    dis("compte non ecrit", { motif: String(e?.message ?? e).slice(0, 120) });
  }
}
Deno.serve(async (req) => {
  const cleClaude = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
  if (req.method === "GET") return json({ fonction: "reception-wa", version: VERSION, claude: cleClaude ? "oui" : "non" });
  const service = (Deno.env.get("CLE_SERVICE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const cleRecue = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!service || cleRecue !== service) return json({ ok: false, motif: "porte", version: VERSION }, 401);
  if (!cleClaude) return json({ ok: false, motif: "cle-claude-absente", version: VERSION });
  let d;
  try {
    d = await req.json();
  } catch {
    return json({ ok: false, motif: "demande-illisible", version: VERSION }, 400);
  }
  if (!d || typeof d.numero !== "string" || !/^\d{8,15}$/.test(d.numero)) return json({ ok: false, motif: "numero", version: VERSION }, 400);
  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", service);
  const maintenantMs = Date.now();
  try {
    const depuis = new Date(maintenantMs - 864e5).toISOString();
    const { count } = await sb.from("messages_wa").select("id", { count: "exact", head: true }).eq("data->>numero", d.numero).eq("data->>reception", "true").gte("data->>quand", depuis);
    if ((count ?? 0) >= RECEPTIONS_PAR_JOUR) {
      dis("plafond du numero");
      return json({ ok: false, motif: "plafond", version: VERSION });
    }
    const [msgs, docs, services, categories, fiche] = await Promise.all([
      sb.from("messages_wa").select("data").eq("data->>numero", d.numero).order("data->>quand", { ascending: false }).limit(12),
      sb.from("documents").select("key, data").in("key", ["mnd_settings", "mnd_horaires_exceptions", "mnd_model_bands", "mnd_model_band_sets", "mnd_payment_methods"]),
      toutes(sb, "catalog_services"),
      toutes(sb, "catalog_categories"),
      d.clientId ? sb.from("clients").select("data").eq("id", d.clientId).maybeSingle() : Promise.resolve({ data: null })
    ]);
    const doc = (k) => (docs.data ?? []).find((x) => x.key === k)?.data;
    const reglages = doc("mnd_settings") ?? {};
    const modes = Array.isArray(doc("mnd_payment_methods")) ? doc("mnd_payment_methods") : [];
    const paiements = modes.filter((x) => typeof x === "string" && x.trim().length > 0 && x.length < 40).map((x) => x.trim()).slice(0, 12);
    const exceptions = doc("mnd_horaires_exceptions") ?? [];
    const bandes = Array.isArray(doc("mnd_model_bands")) ? doc("mnd_model_bands") : [];
    const sets = doc("mnd_model_band_sets") ?? {};
    const cats = categories.map((c) => ({ ...c.data, id: c.id }));
    const fil = (msgs.data ?? []).map((m) => m.data).reverse().filter((m) => m && (m.sens === "entrant" || m.sens === "sortant")).map((m) => ({
      sens: m.sens,
      texte: String(m.texte ?? ""),
      ...typeof m.type === "string" ? { type: m.type } : {},
      ...typeof m.etat === "string" ? { etat: m.etat } : {}
    }));
    const f = fiche.data?.data ?? {};
    const touche = calibreDuChoix(d.choixId, bandes);
    const declare = touche && touche !== "inconnu" ? touche.locks : Number(f.lockCountDeclare ?? 0) || 0;
    const compte = Number(f.lockCount ?? 0) || 0;
    const prestations = prestationsAvecLeursPaliers(services, cats, bandes, sets, reglages.baremeSuspendu === true, compte || declare);
    const catalogue = lignesDuCataloguePourClaude(prestations, cats);
    const permis = /* @__PURE__ */ new Set();
    for (const p of prestations) {
      for (const x of p.prixParPalier ?? []) permis.add(x.prixXof);
      if (p.prixPourElle) permis.add(p.prixPourElle);
    }
    for (const v of Object.values(prixDuCatalogue(services.map((s) => ({ id: s.id, data: s.data }))))) if (v > 0) permis.add(v);
    const contexte = contexteDeLaReception({
      fil,
      fiche: d.fiche ?? null,
      ...d.nomProfil ? { nomProfil: d.nomProfil } : {},
      prochainRdv: d.prochainRdv ?? null,
      derniereVenue: d.derniereVenue ?? null,
      catalogue,
      locks: { compte, declare },
      aujourdhui: jourDeLaMaison(maintenantMs),
      semaine: Array.isArray(reglages.hours) ? reglages.hours : [],
      exceptions: Array.isArray(exceptions) ? exceptions : [],
      maintenantMs,
      premiereReponse: !fil.some((m) => m.sens === "sortant"),
      paiements,
      paiementEnLigne: reglages.mndPay?.actif === true
    });
    const corps = {
      max_tokens: 700,
      system: consigneDeLaReception(),
      messages: [{ role: "user", content: contexte }],
      tools: [{ name: "reponds", description: "Le message de la Maison, et la suite.", input_schema: SCHEMA_DE_LA_RECEPTION }],
      tool_choice: { type: "tool", name: "reponds" }
    };
    let lu = null;
    for (const modele of MODELES) {
      const r = await appelleClaude(cleClaude, { model: modele, ...corps });
      if (modeleInconnu(r.status, r.corps)) continue;
      if (r.status < 200 || r.status >= 300) {
        dis("claude refuse", { status: r.status, genre: r.corps.error?.type ?? "" });
        return json({ ok: false, motif: "claude", version: VERSION });
      }
      lu = { modele, corps: r.corps };
      break;
    }
    if (!lu) return json({ ok: false, motif: "modele", version: VERSION });
    await compteLAppel(sb, lu.modele, lu.corps.usage, maintenantMs);
    const entree = lu.corps.content?.find((c) => c.type === "tool_use" && c.name === "reponds")?.input;
    const reponse = lectureDeLaReception(entree, permis);
    if (!reponse) {
      dis("reponse ecartee par les juges");
      return json({ ok: false, motif: "juges", version: VERSION });
    }
    const lignes = reponse.suite === "calibre" ? listeDesCalibres(bandes) : [];
    const suite = reponse.suite === "calibre" && lignes.length <= 1 ? "rien" : reponse.suite;
    dis("reponse", { suite, modele: lu.modele, lignes: lignes.length });
    return json({ ok: true, texte: reponse.texte, suite, ...suite === "calibre" ? { lignes } : {}, version: VERSION });
  } catch (e) {
    dis("erreur", { motif: String(e?.message ?? e).slice(0, 160) });
    return json({ ok: false, motif: "erreur", version: VERSION });
  }
});
