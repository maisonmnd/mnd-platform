/* ═══════════════════════════════════════════════════════════════════
   FETE-DE-COURONNE — l'anniversaire de la couronne d'un enfant, chaque année.

   Le Club des Petites Couronnes (MND Kids), programme validé par Yéman le
   21 octobre 2026 au sélecteur, lot 5 « la fête de couronne » : « Chaque
   année, l'anniversaire de ta couronne : une photo, un diplôme, et une
   coiffure de fête si tu veux. » Côté parents : « Au jour anniversaire de sa
   Première Couronne, un mot sur WhatsApp. »

   L'ANNIVERSAIRE (contrat commun du Club) : le jour et le mois du PREMIER
   rendez-vous honoré qui porte la Première Couronne Kids (`sv-kids-vekpe`,
   ou le pack `sv-kids-naissance`), chaque année à partir d'un an. Sans
   Première Couronne Kids à la Maison, pas d'anniversaire. Un 29 février se
   fête le 28 les années communes.

   Réveillée par le cron plusieurs fois par jour, elle :
     ① lit les rendez-vous honorés qui portent une Première Couronne Kids ;
     ② à partir de 10 h, heure de Cotonou, pour chaque enfant dont la
        couronne a son anniversaire aujourd'hui (ou l'a eu dans les trois
        jours : un cron manqué se rattrape, une vieille fête ne ressort
        pas), écrit aux parents ;
     ③ DÉPOSE chaque message dans la salle d'attente des envois (le facteur
        `envois-partent` le porte, jamais pendant les heures calmes), à
        identifiant déterministe : un enfant, une année, un message. Le cron
        peut se réveiller vingt fois.

   À QUI : celle qui paie pour le foyer de l'enfant (la tête portée de son
   compte), appelée comme partout (`appelDe`, aucune civilité supposée) ;
   sinon le numéro de la fiche de l'enfant, à « Madame, Monsieur ». Jamais
   un numéro de pièce, jamais une date sans son année.

   RIEN NE PART SANS SON MODÈLE : le secret WA_TEMPLATE_FETE_DE_COURONNE
   nomme le modèle approuvé par Meta (`fete_de_couronne`). Sans lui, rien.

   AUCUN SECRET ICI. Tout vient de l'environnement de la fonction.
   Déploiement : Supabase → Edge Functions → New function
   « fete-de-couronne » → coller CE FICHIER ENTIER → Deploy, « Verify JWT »
   désactivé. Puis le cron (Integrations → Cron), `0 9,11,13,15,17 * * *`
   (10 h, 12 h, 14 h, 16 h et 18 h à Cotonou), SQL Snippet :
   select public.appelle_fonction_edge('fete-de-couronne');
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

// ── DEBUT tournee (tout le juge et la tournée : scripts/verifie-la-fete-de-couronne les rejoue contre une base simulée)

const TZ = 'Africa/Porto-Novo'; // le fuseau de la Maison, pas celui du serveur

/** La version de ce fichier, rendue dans chaque réponse. */
const VERSION = '2026-11-05-a · ce qui va partir : une fête arrêtée d’avance, ou d’un modèle en pause, ne se dépose pas ; M. et Mme devant le prénom';

/** Numéro béninois → format international sans « + » (copie de rappels-j1). */
const numeroIntl = (brut: string | undefined): string | null => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

/* ══ LE PRÉNOM COMPOSÉ — 7 novembre 2026 ══════════════════════════════════
   « Quand on leur écrit, on écrive toujours, dans leur rendez-vous et dans
   leur messagerie WhatsApp, tout le prénom composé » (Yéman) : le prénom
   d'usage de la fiche, sinon celui que le Trône devine du nom. Recopié de
   `src/shared/civilite.ts` entre ses repères ; verifie-le-prenom-d-usage
   et le banc des douze lunes tiennent la copie. */
/* ⟨prenom-d-usage⟩ */
/** LES PRÉNOMS QUI SE COMPOSENT (liste du 7 novembre 2026) : en tête d'un nom
    de trois mots ou plus sans NOM en capitales, ils prennent le mot suivant. */
const PRENOMS_QUI_SE_COMPOSENT: readonly string[] = ['Marie', 'Anne', 'Jean', 'Paul', 'Pierre', 'Louis'];
/** Les particules d'un nom de famille : « de », « da », « d'Agbo »… */
const PARTICULE_DU_NOM = /^(?:de|da|do|dos|das|du|des|di|del|della|van|von|le|la|d['’]\S*)$/i;
/** Un mot tout en capitales : au moins deux lettres, accents compris, l'apostrophe et le trait d'union admis. */
const motEnCapitales = (m: string): boolean => /^[\p{Lu}'’-]+$/u.test(m) && (m.match(/\p{Lu}/gu) ?? []).length >= 2;
/** La capitale d'un second prénom écrit en minuscules ; rien d'autre ne bouge. */
const capitaleDuSecond = (m: string): string => (/^\p{Ll}/u.test(m) ? `${m.charAt(0).toUpperCase()}${m.slice(1)}` : m);

/** LE PRÉNOM QUE LE TRÔNE DEVINE d'un nom complet (les règles 2 à 5). Le
    trait d'union se recolle dans le prénom, jamais vers un NOM en capitales
    (« Awa - KOSSI » reste deux mots). */
const prenomDevine = (nom: unknown): string => {
  const mots = String(nom ?? '').trim().replace(/\s+/g, ' ')
    .replace(/(\S+) ?- ?(?=(\S+))/g, (tout: string, g: string, d: string) => (motEnCapitales(g) || motEnCapitales(d) ? tout : `${g}-`))
    .split(' ').filter(Boolean);
  if (mots.length === 0) return '';
  const nomDeFamille = mots.findIndex((m, i) => i > 0 && motEnCapitales(m));
  if (nomDeFamille > 0) {
    const fin = mots.findIndex((m, i) => i > 0 && (i >= nomDeFamille || !/^\p{L}/u.test(m)));
    const prenoms = mots.slice(0, fin);
    while (prenoms.length > 1 && PARTICULE_DU_NOM.test(prenoms[prenoms.length - 1])) prenoms.pop();
    return prenoms.map((m, i) => (i > 0 && !PARTICULE_DU_NOM.test(m) ? capitaleDuSecond(m) : m)).join(' ');
  }
  const premier = mots[0].toLowerCase();
  const second = mots[1] ?? '';
  if (mots.length >= 3 && PRENOMS_QUI_SE_COMPOSENT.some((p) => p.toLowerCase() === premier) && /^\p{L}/u.test(second) && !PARTICULE_DU_NOM.test(second)) {
    return `${mots[0]} ${capitaleDuSecond(second)}`;
  }
  return mots[0];
};

/** LE PRÉNOM D'USAGE d'une cliente : celui de sa fiche, sinon celui que le
    Trône devine de son nom. `repli` sert quand la fiche manque mais qu'un nom
    est connu ailleurs (le rendez-vous, la demande du site). */
const prenomDUsage = (c: { name?: unknown; prenomUsage?: unknown } | null | undefined, repli?: unknown): string => {
  const note = String(c?.prenomUsage ?? '').trim().replace(/\s+/g, ' ');
  return note || prenomDevine(c?.name ?? repli);
};
/* ⟨/prenom-d-usage⟩ */
/* La Maison écrit « Madame Naffi ». Recopié de `src/shared/civilite.ts` ;
   `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; prenomUsage?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : '';
  /* Tout le prénom composé (7 novembre 2026) : « Mme Anne Marie », jamais « Mme Anne ». */
  const prenom = prenomDUsage(d, repli);
  /* La civilité inconnue ne se suppose plus (13 octobre 2026) : le prénom seul. */
  if (!civ) return prenom || 'Madame, Monsieur';
  /* Abrégée devant le prénom (28 octobre 2026) : « M. Jean-Luc », « Mme Shadé » ; seule, en entier. */
  if (prenom) return `${civ === 'monsieur' ? 'M.' : civ === 'mademoiselle' ? 'Mlle' : 'Mme'} ${prenom}`;
  return civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
};

/* ══ LA SALLE D'ATTENTE — recopiée de rappels-j1 (src/shared/salle-des-envois.ts) ══ */
const DECALAGE_DU_SALON_H = 1;
type ReglesDeLaSalle = { salleMin: number; calmeDe: number; calmeA: number };
const REGLES_PAR_DEFAUT: ReglesDeLaSalle = { salleMin: 10, calmeDe: 20, calmeA: 8 };
const FACTEUR_VIVANT_MS = 5 * 60_000;
function reglesDepuis(cfg: { salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown } | null | undefined): ReglesDeLaSalle {
  const n = (v: unknown, min: number, max: number, defaut: number): number => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : defaut;
  };
  return {
    salleMin: n(cfg?.salleMin, 1, 120, REGLES_PAR_DEFAUT.salleMin),
    calmeDe: n(cfg?.calmeDe, 0, 23, REGLES_PAR_DEFAUT.calmeDe),
    calmeA: n(cfg?.calmeA, 0, 23, REGLES_PAR_DEFAUT.calmeA),
  };
}
const heureDuSalon = (ms: number): number => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
};
function dansLesHeuresCalmes(ms: number, r: ReglesDeLaSalle): boolean {
  if (r.calmeDe === r.calmeA) return false;
  const h = heureDuSalon(ms);
  return r.calmeDe < r.calmeA ? (h >= r.calmeDe && h < r.calmeA) : (h >= r.calmeDe || h < r.calmeA);
}
function finDesHeuresCalmes(ms: number, r: ReglesDeLaSalle): number {
  const local = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  const fin = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), r.calmeA, 0, 0) - DECALAGE_DU_SALON_H * 3_600_000;
  return fin > ms ? fin : fin + 86_400_000;
}
function heureDeDepart(maintenantMs: number, r: ReglesDeLaSalle): { partA: number; calme: boolean } {
  const apresLaSalle = maintenantMs + r.salleMin * 60_000;
  if (!dansLesHeuresCalmes(apresLaSalle, r)) return { partA: apresLaSalle, calme: false };
  return { partA: finDesHeuresCalmes(apresLaSalle, r), calme: true };
}
const facteurVivant = (vuLe: string | undefined | null, maintenantMs: number): boolean => {
  const t = Date.parse(vuLe ?? '');
  return Number.isFinite(t) && maintenantMs - t <= FACTEUR_VIVANT_MS && t - maintenantMs <= FACTEUR_VIVANT_MS;
};
/* ── fin du calcul recopié ── */

const depot = (maintenantMs: number, r: ReglesDeLaSalle, colis: Record<string, unknown>, prenom?: string): Record<string, unknown> => {
  const { partA, calme } = heureDeDepart(maintenantMs, r);
  return {
    deposeLe: new Date(maintenantMs).toISOString(), partA: new Date(partA).toISOString(),
    ...(calme ? { calme: true } : {}), ...(prenom ? { prenom } : {}), colis,
  };
};

// ── DEBUT anniversaire (copie bornée de la règle du Club, src/shared/club-pur.ts ; scripts/verifie-la-fete-de-couronne la rejoue contre l'original)

/** Les prestations qui posent la Première Couronne d'un enfant (src/shared/kids.ts). */
const PREMIERE_COURONNE_KIDS: readonly string[] = ['sv-kids-vekpe', 'sv-kids-naissance'];

/** Ce qu'on lit d'un rendez-vous. */
type RdvLu = { id?: string; clientId?: string; date?: string; status?: string; serviceIds?: string[] };

const estIso = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** LE JOUR DE LA PREMIÈRE COURONNE D'UN ENFANT : le premier rendez-vous
    honoré qui la porte. Aucun : null (pas d'anniversaire). */
function premiereCouronneKids(rdvs: readonly RdvLu[], clientId: string): string | null {
  let premier: string | null = null;
  for (const a of rdvs) {
    if (a.clientId !== clientId || a.status !== 'honoré' || !estIso(a.date)) continue;
    if (!(a.serviceIds ?? []).some((s) => PREMIERE_COURONNE_KIDS.includes(s))) continue;
    if (premier === null || a.date < premier) premier = a.date;
  }
  return premier;
}

/** L'ANNIVERSAIRE D'UNE ANNÉE DONNÉE : même jour, même mois ; un 29 février
    se fête le 28 les années communes. */
function anniversaireEn(premiereLe: string, annee: number): string {
  const [, m, j] = premiereLe.split('-').map(Number);
  const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
  const jour = m === 2 && j === 29 && !bissextile ? 28 : j;
  return `${String(annee).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/** LA COURONNE A-T-ELLE SON ANNIVERSAIRE CE JOUR-LÀ ? Le nombre d'années
    (un et plus), sinon 0 : le jour même de la Première Couronne n'en est pas un. */
function anneesDeCouronne(premiereLe: string, jour: string): number {
  if (!estIso(premiereLe) || !estIso(jour)) return 0;
  const annee = Number(jour.slice(0, 4));
  const annees = annee - Number(premiereLe.slice(0, 4));
  if (annees < 1) return 0;
  return anniversaireEn(premiereLe, annee) === jour ? annees : 0;
}
// ── FIN anniversaire

// ── DEBUT phrases (ce que les parents lisent : l'année toujours, aucun numéro de pièce, aucune civilité supposée)

/** La fête ne part qu'à partir de 10 h, heure de Cotonou. */
const HEURE_DE_LA_FETE = 10;
/** Un cron manqué se rattrape dans les trois jours ; une vieille fête ne ressort pas. */
const JOURS_DE_RATTRAPAGE = 3;
/** Une borne par passage. */
const BORNE_DES_MESSAGES = 40;

const JOURS_DITS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « mardi 21 octobre 2025 » : la date dite, toujours avec son année. */
const jourDitAvecLAnnee = (iso: string): string => {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return `${JOURS_DITS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_DITS[m - 1]} ${a}`;
};
function decaleLeJour(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

const ANNEES_DITES = ['un an', 'deux ans', 'trois ans', 'quatre ans', 'cinq ans', 'six ans', 'sept ans', 'huit ans', 'neuf ans', 'dix ans',
  'onze ans', 'douze ans', 'treize ans', 'quatorze ans', 'quinze ans'];
/** « un an », « deux ans »… en lettres jusqu'à quinze, en chiffres au-delà. */
const anneesDites = (n: number): string => ANNEES_DITES[n - 1] ?? `${n} ans`;

/** Le prénom de l'enfant, tel qu'on le nomme à ses parents. */
const prenomDe = (fiche: { name?: unknown } | undefined): string =>
  prenomDUsage(fiche);

/** LES QUATRE VARIABLES DU MODÈLE `fete_de_couronne` : l'appel des parents,
    le prénom de l'enfant, ses années de couronne, le jour de sa Première
    Couronne avec l'année. */
const variablesDeLaFete = (o: { appel: string; enfant: string; annees: number; premiereLe: string }): string[] => [
  o.appel,
  o.enfant,
  anneesDites(o.annees),
  jourDitAvecLAnnee(o.premiereLe),
];
/** Ce qu'ils lisent, tel que le fil du Trône le garde : le texte du modèle, variables posées. */
const texteDeLaFete = (v: readonly string[]): string =>
  `Bonjour ${v[0]},\nIl y a ${v[2]}, le ${v[3]}, la couronne de ${v[1]} est née à la Maison MND. Joyeux anniversaire de couronne !\nÀ sa prochaine visite, une photo pour son carnet, un diplôme, et une coiffure de fête si le cœur lui en dit.`;
// ── FIN phrases

// ── DEBUT juge (qui reçoit quoi aujourd'hui ; pur, éprouvé par le banc)

/** Une fête à écrire : l'enfant, le jour de l'anniversaire, ses années. */
type Fete = { enfantId: string; premiereLe: string; leJour: string; annees: number };

/** LES FÊTES DU JOUR : chaque enfant dont la couronne a son anniversaire
    aujourd'hui, ou l'a eu dans les trois jours. */
function fetesDuJour(rdvs: readonly RdvLu[], aujourdhui: string): Fete[] {
  const enfants = [...new Set(rdvs.map((a) => a.clientId).filter((x): x is string => !!x))];
  const out: Fete[] = [];
  for (const enfantId of enfants) {
    const premiereLe = premiereCouronneKids(rdvs, enfantId);
    if (!premiereLe) continue;
    for (let d = 0; d <= JOURS_DE_RATTRAPAGE; d++) {
      const jour = decaleLeJour(aujourdhui, -d);
      const annees = anneesDeCouronne(premiereLe, jour);
      if (annees > 0) { out.push({ enfantId, premiereLe, leJour: jour, annees }); break; }
    }
  }
  return out;
}

/** L'identifiant au journal des envois : un enfant, une année, un message. */
const idDeLaFete = (f: Fete): string => `fc-${f.enfantId}-${f.leJour.slice(0, 4)}-whatsapp`;

/** À QUI ÉCRIRE : celle qui paie pour le foyer de l'enfant, si elle a un
    numéro ; sinon le numéro de la fiche de l'enfant, adressé à ses parents. */
type FicheLue = { id: string; name?: string; phone?: string; civilite?: string; auMasculin?: boolean; archived?: boolean; familyId?: string };
function destinataireDeLaFete(
  enfant: FicheLue | undefined, fiches: ReadonlyMap<string, FicheLue>, payeurDuFoyer: ReadonlyMap<string, string>,
): { fiche: FicheLue; appel: string } | null {
  if (!enfant || enfant.archived) return null;
  const payeur = enfant.familyId ? fiches.get(payeurDuFoyer.get(enfant.familyId) ?? '') : undefined;
  if (payeur && payeur.id !== enfant.id && !payeur.archived && numeroIntl(payeur.phone)) return { fiche: payeur, appel: appelDe(payeur) };
  if (numeroIntl(enfant.phone)) return { fiche: enfant, appel: appelDe(null) };
  return null;
}
// ── FIN juge
/* ══ ARRÊTÉ D'AVANCE, MODÈLE EN PAUSE — 5 novembre 2026 (ce qui va partir) ══
   « Ne pas envoyer » (la direction, depuis l'onglet « À venir ») et
   l'interrupteur « En service / En pause » d'un modèle. Recopié À
   L'IDENTIQUE de `src/shared/arret-d-avance-pur.ts` ; le banc des douze
   lunes (R8) compare la copie. NE RIEN RETOUCHER ENTRE LES REPÈRES. ══ */
/* ⟨arret-d-avance⟩ */
/** Un message arrêté d'avance : sa clé, qui l'a arrêté et quand ; « Remettre » pose `remisLe`. */
type ArretDAvance = { id?: string; cle?: string; arreteLe?: string; arretePar?: string; remisLe?: string; remisPar?: string; [k: string]: unknown };
/** Un modèle Meta en pause chez nous : `enPause` vrai, qui, quand, pourquoi ; « Reprendre » le remet à faux. */
type PauseDuModele = { id?: string; modele?: string; enPause?: boolean; par?: string; le?: string; motif?: string; parOpale?: boolean; [k: string]: unknown };
/** Ce que la porte d'avance décide d'une ligne. `repli` : le modèle est en pause, son repli part à sa place. */
type VerdictDAvance =
  | { verdict: 'arrete'; cle: string; par: string; le: string; motif: string }
  | { verdict: 'en-pause'; modele: string; motif: string }
  | { verdict: 'repli'; modele: string; motif: string };
/** Ce qu'une ligne d'envoi porte et que la clé lit. */
type LigneDAvance = {
  id?: unknown; type?: unknown; genre?: unknown; apptId?: unknown; seanceId?: unknown; invoiceId?: unknown; rang?: unknown;
  clientId?: unknown; teteId?: unknown; subId?: unknown; campagneId?: unknown; dateRdv?: unknown; anniversaire?: unknown;
  colis?: { genre?: unknown; modele?: unknown; repli?: { modele?: unknown } | null } | null;
  [k: string]: unknown;
};

/** Le mot qui ouvre le détail d'une ligne arrêtée d'avance : le Trône le lit. */
const MARQUE_DE_L_ARRET = 'arrêté d’avance';
/** Opale signale un modèle au deuxième « non remis » de suite, le met en pause au cinquième. */
const NON_REMIS_SIGNALE_AU = 2;
const NON_REMIS_EN_PAUSE_AU = 5;

const motDAvance = (v: unknown): string => String(v ?? '').trim();

/** LA CLÉ D'UN MESSAGE : la même pour la prévision, la ligne en salle et la
    ligne prise par le facteur. Une ligne que rien ne décrit n'est qu'elle-même. */
function cleDuMessage(l: LigneDAvance | null | undefined): string {
  const type = motDAvance(l?.type);
  const id = motDAvance(l?.id);
  const rdv = motDAvance(l?.apptId);
  if ((type === 'rappel-j1' || type === 'confirmation' || type === 'reprise-j3') && rdv) return `${type}:${rdv}`;
  if (type === 'point-apres' || type === 'point-avant') {
    const seance = motDAvance(l?.seanceId) || rdv;
    if (seance) return `${type}:${seance}`;
  }
  if (type === 'relance-facture') {
    const m = /^rl-(.+)-(\d+)-whatsapp$/.exec(id);
    if (m) return `relance:${m[1]}:${m[2]}`;
    if (motDAvance(l?.invoiceId) && motDAvance(l?.rang)) return `relance:${motDAvance(l?.invoiceId)}:${motDAvance(l?.rang)}`;
  }
  if (type === 'rappel-echeance' || type === 'prix-revu') {
    const m = /^(?:rv|pr)-(.+)-whatsapp$/.exec(id);
    if (m) return `${type === 'prix-revu' ? 'prix-revu' : 'echeance'}:${m[1]}`;
  }
  if (type === 'fete-de-couronne') {
    const m = /^fc-(.+)-(\d{4})-whatsapp$/.exec(id);
    if (m) return `fete:${m[1]}:${m[2]}`;
  }
  if (type === 'avis-google' && motDAvance(l?.invoiceId)) return `avis:${motDAvance(l?.invoiceId)}`;
  if (type === 'papier-de-la-piece' && motDAvance(l?.invoiceId)) return `papier:${motDAvance(l?.invoiceId)}`;
  if (type === 'campagne' && motDAvance(l?.campagneId)) return `campagne:${motDAvance(l?.campagneId)}:${motDAvance(l?.clientId)}`;
  if (type === 'gerard') {
    const genre = motDAvance(l?.genre);
    const jour = /^gerard-(\d{4}-\d{2}-\d{2})-/.exec(id)?.[1] ?? '';
    if (genre === 'garder' && rdv) return `garder:${rdv}`;
    if (genre === 'anniversaire' && motDAvance(l?.clientId) && jour) return `anniv:${motDAvance(l?.clientId)}:${jour.slice(0, 4)}`;
    if (genre && motDAvance(l?.clientId) && jour) return `perle:${genre}:${motDAvance(l?.clientId)}:${jour}`;
  }
  return `ligne:${id}`;
}

/** L'ARRÊT EN VIGUEUR pour cette clé, ou null. Remis après le dernier arrêt : plus d'arrêt. */
function arretEnVigueur(cle: string, arrets: readonly (ArretDAvance | null | undefined)[] | null | undefined): ArretDAvance | null {
  if (!cle) return null;
  for (const a of arrets ?? []) {
    if (!a || motDAvance(a.cle ?? a.id) !== cle || !motDAvance(a.arreteLe)) continue;
    if (motDAvance(a.remisLe) && motDAvance(a.remisLe) >= motDAvance(a.arreteLe)) continue;
    return a;
  }
  return null;
}

/** LE MODÈLE EST-IL EN PAUSE ? La pause en vigueur, ou null. */
function modeleEnPause(modele: unknown, pauses: readonly (PauseDuModele | null | undefined)[] | null | undefined): PauseDuModele | null {
  const m = motDAvance(modele);
  if (!m) return null;
  for (const p of pauses ?? []) if (p && motDAvance(p.modele ?? p.id) === m && p.enPause === true) return p;
  return null;
}

/** « mercredi 4 novembre 2026 à 21 h 40 », à l'heure de Cotonou (UTC + 1, sans heure d'été). */
function momentDAvance(iso: unknown): string {
  const t = Date.parse(motDAvance(iso));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 3_600_000);
  const JOURS_DITS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const j = d.getUTCDate();
  const mi = d.getUTCMinutes();
  return `${JOURS_DITS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_DITS[d.getUTCMonth()]} ${d.getUTCFullYear()} à ${d.getUTCHours()} h${mi ? ` ${String(mi).padStart(2, '0')}` : ''}`;
}

/** LA PORTE D'AVANCE : l'arrêt de la direction d'abord, quel que soit le
    canal (le SMS d'un rappel arrêté ne part pas non plus) ; puis, pour un
    modèle WhatsApp, la pause : son repli part s'il en a un qui n'est pas en
    pause, sinon rien. `null` : rien ne l'arrête ici. */
function laPorteDAvance(
  l: LigneDAvance | null | undefined,
  o: { arrets?: readonly (ArretDAvance | null | undefined)[] | null; pauses?: readonly (PauseDuModele | null | undefined)[] | null },
): VerdictDAvance | null {
  const cle = cleDuMessage(l);
  const arret = arretEnVigueur(cle, o.arrets);
  if (arret) {
    const par = motDAvance(arret.arretePar) || 'la direction';
    const le = motDAvance(arret.arreteLe);
    const quand = momentDAvance(le);
    return { verdict: 'arrete', cle, par, le, motif: `${MARQUE_DE_L_ARRET} par ${par}${quand ? `, ${quand}` : ''}` };
  }
  if (motDAvance(l?.colis?.genre) !== 'whatsapp') return null;
  const modele = motDAvance(l?.colis?.modele);
  const pause = modeleEnPause(modele, o.pauses);
  if (!pause) return null;
  const repli = motDAvance(l?.colis?.repli?.modele);
  if (repli && repli !== modele && !modeleEnPause(repli, o.pauses)) {
    return { verdict: 'repli', modele: repli, motif: `le modèle ${modele} est en pause : ${repli} part à sa place` };
  }
  const par = motDAvance(pause.par);
  return { verdict: 'en-pause', modele, motif: `le modèle ${modele} est en pause${par ? ` (${par === 'Opale' ? 'mis en pause par Opale' : `par ${par}`})` : ''}` };
}

/** CE QUE LA LIGNE DEVIENT quand elle ne part pas. Arrêtée : « écarté », par
    qui l'a arrêtée ; le colis reste, « Remettre » peut la rendre tant que
    son heure n'est pas passée. En pause : « périmé », marqué par Opale (les
    fonctions ne la redéposent pas). Un repli n'écrit rien : la ligne part. */
function ligneRetenueDAvance(v: VerdictDAvance, maintenantIso: string): Record<string, unknown> | null {
  if (v.verdict === 'arrete') {
    return { statut: 'écarté', ecartePar: v.par, ecarteLe: maintenantIso, detail: v.motif, arretDAvance: { cle: v.cle, par: v.par, le: v.le } };
  }
  if (v.verdict === 'en-pause') return { statut: 'périmé', detail: `retenu par Opale : ${v.motif}`, modeleEnPause: v.modele };
  return null;
}

/** LA SÉRIE DES « NON REMIS » d'un modèle : du plus récent au plus ancien, les
    messages sortants que WhatsApp a jugés, comptés tant qu'ils sont « non
    remis ». Un message encore en route ne compte ni pour ni contre. */
function serieDeNonRemis(messages: readonly ({ sens?: unknown; etat?: unknown; quand?: unknown } | null | undefined)[]): number {
  const juges = messages
    .filter((m): m is { sens?: unknown; etat?: unknown; quand?: unknown } => !!m && motDAvance(m.sens) === 'sortant'
      && ['non-remis', 'remis', 'lu'].includes(motDAvance(m.etat)) && Number.isFinite(Date.parse(motDAvance(m.quand))))
    .sort((a, b) => Date.parse(motDAvance(b.quand)) - Date.parse(motDAvance(a.quand)));
  let n = 0;
  for (const m of juges) {
    if (motDAvance(m.etat) !== 'non-remis') break;
    n += 1;
  }
  return n;
}

/** CE QU'OPALE FAIT D'UNE SÉRIE : rien, le signaler, ou mettre le modèle en pause. */
function veilleDuModele(serie: number): 'rien' | 'signale' | 'pause' {
  if (serie >= NON_REMIS_EN_PAUSE_AU) return 'pause';
  if (serie >= NON_REMIS_SIGNALE_AU) return 'signale';
  return 'rien';
}

/** Ce qu'une fonction donne pour lire : la base, telle que le client Supabase la présente. */
type BaseDAvance = { from(t: string): { select(c: string): { range(de: number, a: number): PromiseLike<{ data: unknown[] | null; error: unknown }> } } };
/** LA LECTURE AU DÉPÔT : une fonction qui dépose lit les arrêts et les pauses
    une fois par passage. Une lecture qui échoue n'arrête rien ici : le
    facteur, lui, ne laisse rien partir sans les avoir lus. */
async function litLesArretsEtLesPauses(sb: BaseDAvance): Promise<{ arrets: ArretDAvance[]; pauses: PauseDuModele[] }> {
  const lis = async (t: string): Promise<Record<string, unknown>[]> => {
    try {
      const { data, error } = await sb.from(t).select('id, data').range(0, 4999);
      if (error) return [];
      return ((data ?? []) as { id?: unknown; data?: Record<string, unknown> | null }[]).map((r) => ({ ...(r?.data ?? {}), id: String(r?.id ?? '') }));
    } catch {
      return [];
    }
  };
  const [arrets, pauses] = await Promise.all([lis('envois_arretes'), lis('modeles_en_pause')]);
  return { arrets: arrets as ArretDAvance[], pauses: pauses as PauseDuModele[] };
}
/* ⟨/arret-d-avance⟩ */


/** Les verdicts du journal qui ne comptent pas comme un message parti. */
const SE_RETENTE = new Set(['échec', 'périmé']);

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });

/** LA TOURNÉE : lit, juge, dépose. `sb` est le client service ; le banc lui
    passe une base simulée, et un faux `envoie`. */
// deno-lint-ignore no-explicit-any
async function tournee(sb: any, o: { maintenantMs: number; MODELE_FETE: string; WA_TOKEN: string; WA_PHONE_ID: string; envoie?: typeof fetch }): Promise<Record<string, unknown>> {
  const { maintenantMs, MODELE_FETE, WA_TOKEN, WA_PHONE_ID } = o;
  const envoie = o.envoie ?? fetch;
  const aujourdhui = new Date(maintenantMs).toLocaleDateString('en-CA', { timeZone: TZ });
  if (!MODELE_FETE) return { version: VERSION, jour: aujourdhui, messages: 'sans-modele' };
  if (heureDuSalon(maintenantMs) < HEURE_DE_LA_FETE) return { version: VERSION, jour: aujourdhui, messages: 'pas-encore' };

  const { data: docs } = await sb.from('documents').select('key, data')
    .in('key', ['mnd_auto_config', 'mnd_facteur']);
  const regles = reglesDepuis(docs?.find((d) => d.key === 'mnd_auto_config')?.data as Record<string, unknown> | undefined);
  const salleOuverte = facteurVivant((docs?.find((d) => d.key === 'mnd_facteur')?.data as { vuLe?: string } | undefined)?.vuLe, maintenantMs);
  if (!salleOuverte && (!WA_TOKEN || !WA_PHONE_ID)) return { version: VERSION, messages: 'sans-facteur' };
  /* Ce qui va partir (5 novembre 2026) : les fêtes arrêtées d'avance et les modèles en pause. */
  const avanceDuDepot = await litLesArretsEtLesPauses(sb);

  /* ① LES PREMIÈRES COURONNES KIDS HONORÉES, par pages (une lecture plafonne à mille lignes). */
  const rdvs: RdvLu[] = [];
  const vus = new Set<string>();
  for (const sv of PREMIERE_COURONNE_KIDS) {
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from('appointments').select('id, data')
        .eq('data->>status', 'honoré').contains('data', { serviceIds: [sv] }).range(de, de + 999);
      if (error) return { version: VERSION, messages: 'lecture-refusee', motif: String(error.message ?? '').slice(0, 120) };
      for (const l of (data ?? []) as { id: string; data: RdvLu }[]) {
        if (vus.has(l.id)) continue;
        vus.add(l.id);
        rdvs.push({ ...l.data, id: l.id });
      }
      if ((data ?? []).length < 1000) break;
    }
  }

  /* ② LES FÊTES DU JOUR. */
  const fetes = fetesDuJour(rdvs, aujourdhui);
  if (fetes.length === 0) return { version: VERSION, jour: aujourdhui, messages: 0, couronnes: rdvs.length };

  /* Le journal : un message déjà posé ne se repose pas ; seul un échec se retente. */
  const deja = new Set<string>();
  for (let i = 0; i < fetes.length; i += 200) {
    const { data } = await sb.from('envois').select('id, data').in('id', fetes.slice(i, i + 200).map(idDeLaFete));
    for (const l of (data ?? []) as { id: string; data: { statut?: string } }[]) {
      if (!SE_RETENTE.has(l.data?.statut ?? '')) deja.add(l.id);
    }
  }
  const restent = fetes.filter((f) => !deja.has(idDeLaFete(f)));
  if (restent.length === 0) return { version: VERSION, jour: aujourdhui, messages: 0, deja: deja.size };

  /* Les fiches : l'enfant, et celle qui paie pour son foyer. */
  const fiches = new Map<string, FicheLue>();
  const litLesFiches = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('clients').select('id, data').in('id', ids.slice(i, i + 200));
      for (const l of data ?? []) fiches.set(l.id as string, { id: l.id as string, ...(l.data as object) });
    }
  };
  await litLesFiches([...new Set(restent.map((f) => f.enfantId))]);
  const foyers = [...new Set([...fiches.values()].filter((x) => x.familyId).map((x) => x.familyId as string))];
  const payeurDuFoyer = new Map<string, string>();
  if (foyers.length) {
    const { data: lignesDesFoyers } = await sb.from('families').select('id, data').in('id', foyers);
    for (const l of (lignesDesFoyers ?? []) as { id: string; data: { payerClientId?: string } }[]) {
      if (l.data?.payerClientId) payeurDuFoyer.set(l.id, l.data.payerClientId);
    }
    await litLesFiches([...payeurDuFoyer.values()].filter((id) => !fiches.has(id)));
  }

  let parties = 0;
  let bornee = false;
  const sautes: Record<string, number> = {};
  const saute = (pourquoi: string) => { sautes[pourquoi] = (sautes[pourquoi] ?? 0) + 1; };

  for (const f of restent) {
    if (parties >= BORNE_DES_MESSAGES) { bornee = true; break; }
    const enfant = fiches.get(f.enfantId);
    if (!enfant) { saute('sans-fiche'); continue; }
    if (enfant.archived) { saute('archivee'); continue; }
    const dest = destinataireDeLaFete(enfant, fiches, payeurDuFoyer);
    const tel = numeroIntl(dest?.fiche.phone);
    if (!dest || !tel) { saute('sans-numero'); continue; }
    const prenom = prenomDe(enfant);
    if (!prenom) { saute('sans-prenom'); continue; }

    const id = idDeLaFete(f);
    const variables = variablesDeLaFete({ appel: dest.appel, enfant: prenom, annees: f.annees, premiereLe: f.premiereLe });
    const texteAuFil = texteDeLaFete(variables);
    const composants = [{ type: 'body', parameters: variables.map((text) => ({ type: 'text', text })) }];
    const maintenant = new Date(maintenantMs).toISOString();
    const branchId = (enfant as { branchId?: string }).branchId ?? null;
    const commun = {
      id, branchId, type: 'fete-de-couronne', canal: 'whatsapp', apptId: '', dateRdv: '',
      clientId: dest.fiche.id, teteId: enfant.id, numero: tel, quand: maintenant,
      anniversaire: f.leJour, premiereCouronneLe: f.premiereLe, annees: f.annees,
    };
    /* ARRÊTÉE D'AVANCE, OU SON MODÈLE EN PAUSE (5 novembre 2026, ce qui va
       partir) : la ligne s'écrit telle qu'elle partirait, mais « écarté »
       (par qui l'a arrêtée) ou « périmé » (retenue par Opale). */
    const aDeposer = {
      ...commun, statut: 'en-attente',
      ...depot(maintenantMs, regles, { genre: 'whatsapp', numero: tel, modele: MODELE_FETE, parQui: 'la Maison, automatiquement', texteAuFil, composants }, dest.appel),
    };
    const dAvance = laPorteDAvance(aDeposer, avanceDuDepot);
    if (dAvance && dAvance.verdict !== 'repli') {
      await sb.from('envois').upsert({ id, branch_id: branchId, data: { ...aDeposer, ...ligneRetenueDAvance(dAvance, maintenant) } }, { onConflict: 'id' });
      saute(dAvance.verdict === 'arrete' ? 'arretee-d-avance' : 'modele-en-pause');
      continue;
    }
    if (salleOuverte) {
      await sb.from('envois').upsert({
        id, branch_id: branchId,
        data: {
          ...commun, statut: 'en-attente',
          ...depot(maintenantMs, regles, { genre: 'whatsapp', numero: tel, modele: MODELE_FETE, parQui: 'la Maison, automatiquement', texteAuFil, composants }, dest.appel),
        },
      }, { onConflict: 'id' });
      parties++;
      continue;
    }
    /* Le facteur se tait : on envoie comme les rappels, hors des heures calmes seulement. */
    if (dansLesHeuresCalmes(maintenantMs, regles)) { saute('heures-calmes'); continue; }
    let statut = 'échec';
    let detail: string | undefined;
    let waId = '';
    try {
      const rep = await envoie(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: tel, type: 'template', template: { name: MODELE_FETE, language: { code: 'fr' }, components: composants } }),
        signal: AbortSignal.timeout(10_000),
      });
      const corps = await rep.json().catch(() => ({}));
      waId = String(corps?.messages?.[0]?.id ?? '');
      if (rep.ok) { statut = 'envoyé'; if (!waId) detail = 'accepté sans identifiant Meta'; }
      else detail = String(corps?.error?.message ?? `HTTP ${rep.status}`);
    } catch (e) {
      detail = String(e);
    }
    await sb.from('envois').upsert({
      id, branch_id: branchId,
      data: { ...commun, statut, ...(detail ? { detail: detail.slice(0, 300) } : {}), ...(waId ? { waMessageId: waId } : {}) },
    }, { onConflict: 'id' });
    if (statut !== 'envoyé') { saute('refus-meta'); continue; }
    parties++;
    if (waId) {
      const idFil = `wa-${waId}`;
      await sb.from('messages_wa').upsert({
        id: idFil, branch_id: branchId,
        data: {
          id: idFil, waId, branchId, sens: 'sortant', numero: tel, clientId: dest.fiche.id, texte: texteAuFil,
          type: 'text', quand: maintenant, etat: 'en-route', modele: MODELE_FETE, parQui: 'la Maison, automatiquement',
        },
      }, { onConflict: 'id' });
    }
  }

  return {
    version: VERSION, jour: aujourdhui, messages: parties, aEcrire: restent.length, salle: salleOuverte, sautes,
    ...(bornee ? { borne: BORNE_DES_MESSAGES } : {}),
  };
}
// ── FIN tournee

Deno.serve(async (req) => {
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  const MODELE_FETE = (Deno.env.get('WA_TEMPLATE_FETE_DE_COURONNE') ?? '').trim();
  const WA_TOKEN = Deno.env.get('WA_TOKEN') ?? '';
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID') ?? '';

  /* ⓪ LE CONTRÔLE DE SANTÉ : ouvrir l'adresse dans un navigateur ne lance
     RIEN. On dit la version et ce qui est posé, en longueurs seules. */
  if (req.method === 'GET') {
    return json({
      fonction: 'fete-de-couronne', version: VERSION,
      secrets: {
        WA_TEMPLATE_FETE_DE_COURONNE: MODELE_FETE.length,
        CLE_SERVICE: service.length, WA_TOKEN: WA_TOKEN.length, WA_PHONE_ID: WA_PHONE_ID.length,
      },
    });
  }

  /* Seul le cron (armé de la clé service) réveille la tournée. */
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) {
    return json({ erreur: 'réservé au cron', attendueLg: service.length, recueLg: cleRecue.length }, 401);
  }
  if (!MODELE_FETE) return json({ version: VERSION, messages: 'sans-modele' });

  const sb = createClient(urlBase, service);
  try {
    const r = await tournee(sb, { maintenantMs: Date.now(), MODELE_FETE, WA_TOKEN, WA_PHONE_ID });
    return json(r, r.messages === 'lecture-refusee' ? 500 : 200);
  } catch (e) {
    return json({ version: VERSION, messages: 'echec', motif: String(e).slice(0, 200) }, 500);
  }
});
