/* ══ AVANT LE FAUTEUIL, LE JUGE — 31 octobre 2026 ═══════════════════════
   « N'oublie pas de me faire un résumé de ce que je dois savoir avant un RDV
   d'un client. Credo vient le 13 novembre, il faut que je me souvienne de
   relire notre conversation. » (Yéman, 31 octobre 2026). Maquette
   Jx3pJY3ZkzWkr9a9RXUFf3, les cinq choix tranchés au sélecteur le même jour :
     1. le bloc vit sous chaque rendez-vous du Carnet ET dans Parcours ;
     2. une notification la veille à 19 h, une le matin à 7 h ;
     3. la Note du carnet venue de son WhatsApp personnel est écrite par
        Opale (la session Claude) ; le Trône ne devine rien, il lit `note`,
        les Conversations de la Maison et ses propres données ;
     4. la ligne paraît même sans message : « Elle a dit » reste vide et le dit ;
     5. photo ou vidéo reçue = pièce dans le coffre, attachée au rendez-vous ;
        un lien Facebook, TikTok ou Instagram = gardé comme lien, jamais copié.

   CE MODULE NE LIT RIEN. Il reçoit tout en paramètres (le rendez-vous, la
   cliente, ses rendez-vous, ses messages entrants, son carnet, ce qu'elle
   doit, les heures d'ouverture, la catégorie des prestations) et rend un
   briefing en six lignes. Une fonction serveur l'emportera pour la
   notification du soir : un magasin, React ou les réglages du navigateur
   dans son paquet la casseraient. `scripts/verifie-avant-le-fauteuil.mjs`
   le prouve, et prouve sa pureté.

   IL N'IMPORTE RIEN D'`agenda.ts`, à dessein : c'est `agenda.ts` qui lui
   emprunte le type `PieceEnvoyee` pour le champ `pieces` du rendez-vous.
   `RdvLu` redit donc, champ par champ, le visage du rendez-vous qu'il lit
   (un `Appointment` s'y glisse tel quel, par structure). */

/* ── LES RÈGLES CHOISIES ─────────────────────────────────────────────── */
/** Au-delà, on recompte les locks : son prix suit le comptage. */
export const COMPTAGE_APRES_JOURS = 120;
/** Un enfant : prévenir le parent au numéro à prévenir. */
export const ENFANT_MOINS_DE_ANS = 16;
/** Les messages entrants retenus : les 30 jours avant le rendez-vous, les 3 plus récents. */
export const FIL_JOURS = 30;
export const FIL_MESSAGES_MAX = 3;
/** Un message se coupe à tant de caractères, avec « … ». */
export const COUPE_A = 160;
/** Regarder les pièces tant de minutes avant l'heure. */
export const REGARDER_AVANT_MIN = 15;
/** La notification du téléphone tient en tant de caractères. */
export const NOTIFICATION_MAX = 300;

/* ── CE QU'ELLE A ENVOYÉ ─────────────────────────────────────────────── */
/** UNE PIÈCE ATTACHÉE AU RENDEZ-VOUS (choix 5). Une photo ou une vidéo
    reçue vit dans le coffre Supabase Storage `pieces-des-clientes`
    (`chemin`) ; un lien garde son adresse et son titre (`url`), la vidéo du
    lien n'est jamais copiée. `origine` dit qui l'a posée : son WhatsApp
    personnel (par Opale), les Conversations de la Maison, ou la main. */
export type PieceEnvoyee = {
  id: string;
  kind: 'photo' | 'video' | 'lien';
  titre: string;
  /** ISO : le jour, ou l'instant. */
  quand: string;
  url?: string;
  chemin?: string;
  origine?: 'whatsapp' | 'conversations' | 'main';
};

/* ── CE QUE LE JUGE REÇOIT ───────────────────────────────────────────── */
/** Le rendez-vous, tel que le Carnet le porte, plus son prix et sa phrase. */
export type RdvLu = {
  id: string;
  clientId: string;
  date: string;
  time: string;
  status: 'confirmé' | 'en attente' | 'honoré' | 'annulé';
  serviceIds: string[];
  note?: string;
  pieces?: PieceEnvoyee[];
  coveredBySub?: boolean;
  dureeMin?: number;
  prixXof: number;
  /** La phrase du rendez-vous (`apptLabel`). */
  libelle: string;
};

export type ClienteLue = {
  id: string;
  name: string;
  phone?: string;
  phone2?: string;
  birthday?: string;
  civilite?: string;
  lockCount?: number;
};

/** Un message des Conversations de la Maison. Seuls les entrants comptent. */
export type MessageLu = {
  quand: string;
  texte: string;
  type?: string;
  sens: 'entrant' | 'sortant';
};

/** Son contrat vivant : carnet des Trois, formule en lunes, abonnement. */
export type CarnetLu = {
  nom: string;
  faites: number;
  reservees: number;
  /** null : sans limite. */
  restantes: number | null;
  expireLe?: string;
};

export type EntreeAvantLeFauteuil = {
  aujourdhui: string;
  rdv: RdvLu;
  cliente: ClienteLue | null;
  /** Tous ses rendez-vous, celui-ci compris. */
  sesRdv: RdvLu[];
  /** Les messages de la cliente dans les Conversations de la Maison. */
  messages: MessageLu[];
  carnet?: CarnetLu | null;
  /** Ce qu'elle doit à la Maison, en francs. */
  duXof: number;
  ouverture: (iso: string) => { closed: boolean; openMin: number; closeMin: number };
  /** La catégorie TRESSES, ou un nom Tresses, Nattes, Vanilles. */
  prestationsTresses: (serviceId: string) => boolean;
};

/* ── CE QUE LE JUGE REND ─────────────────────────────────────────────── */
export type ElleADit = { texte: string; quand: string; source: 'note' | 'conversations' };

export type BriefingAvantLeFauteuil = {
  /** La Note du carnet d'abord (sans date : `quand` vide), puis ses messages. */
  elleADit: ElleADit[];
  compte: { phrase: string; duXof: number; carnet?: CarnetLu | null; horsCarnet: boolean };
  derniereNote: { date: string; texte: string } | null;
  attention: string[];
  aPreparer: string[];
  pieces: PieceEnvoyee[];
  aRelire: boolean;
  /** La ligne du résumé replié : « coiffure de marraine · 2 pièces envoyées ». */
  resume: string;
  /** Le comptage, en clair, pour la notification : jamais venue, ou depuis combien de mois. */
  comptage: { aRefaire: boolean; premiereVenue: boolean; mois: number | null };
};

/* ── LES PETITES MAINS ───────────────────────────────────────────────── */
const midi = (iso: string): Date => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
export const plusJours = (iso: string, n: number): string => { const d = midi(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const ecartJours = (de: string, a: string): number => Math.round((midi(a).getTime() - midi(de).getTime()) / 86_400_000);
const jourDe = (iso: string): string => iso.slice(0, 10);

/** « 70 000 F », espaces fines insécables entre les milliers. */
export const francs = (n: number): string => {
  const entier = Math.round(Number.isFinite(n) ? n : 0);
  return `${String(Math.abs(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
};

/** « 20 h », « 19 h 45 ». */
export const heureDite = (hhmm: string): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  return m[2] === '00' ? `${Number(m[1])} h` : `${Number(m[1])} h ${m[2]}`;
};

const minutesDe = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmmDe = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** L'heure moins tant de minutes : « 20:00 » moins 15 = « 19:45 ». */
export const heureMoins = (hhmm: string, min: number): string => {
  const m = minutesDe(hhmm);
  return m === null ? hhmm : hhmmDe(m - min);
};

/** Coupe à `n` caractères, « … » compris : on ne lit pas un roman au fauteuil. */
export const coupe = (texte: string, n = COUPE_A): string => {
  const t = texte.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

/** L'âge à un jour donné ; `undefined` si la date de naissance ne se lit pas
    (AAAA-MM-JJ, ou JJ/MM/AAAA). */
export const ageA = (birthday: string | undefined, jour: string): number | undefined => {
  const t = (birthday ?? '').trim();
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const iso = fr ? `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
  if (!iso) return undefined;
  const n = midi(iso); const j = midi(jour);
  if (Number.isNaN(n.getTime()) || Number.isNaN(j.getTime())) return undefined;
  let a = j.getUTCFullYear() - n.getUTCFullYear();
  const m = j.getUTCMonth() - n.getUTCMonth();
  if (m < 0 || (m === 0 && j.getUTCDate() < n.getUTCDate())) a--;
  return a < 0 ? undefined : a;
};

/** UN NUMÉRO ÉTRANGER : nettoyé, il ne commence ni par +229, ni par 229, ni
    par 0. Sans numéro, rien à dire. */
export const numeroEtranger = (phone: string | undefined): boolean => {
  const net = (phone ?? '').replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (!net) return false;
  return !/^(\+?229|0)/.test(net);
};

/* ── LA DERNIÈRE VENUE ───────────────────────────────────────────────── */
/** Ses rendez-vous honorés avant celui-ci, du plus récent au plus ancien. */
const venuesAvant = (sesRdv: readonly RdvLu[], rdv: RdvLu): RdvLu[] =>
  sesRdv
    .filter((a) => a.id !== rdv.id && a.status === 'honoré' && a.date < rdv.date)
    .sort((x, y) => y.date.localeCompare(x.date) || y.time.localeCompare(x.time));

/* ── LE JUGE ─────────────────────────────────────────────────────────── */
export function avantLeFauteuil(e: EntreeAvantLeFauteuil): BriefingAvantLeFauteuil {
  const { rdv } = e;
  const pieces = rdv.pieces ?? [];

  /* ELLE A DIT : la Note du carnet d'abord (Opale l'y a posée, elle n'a pas
     de date propre), puis ses messages entrants des Conversations, les trois
     plus récents des trente jours avant le rendez-vous, coupés. */
  const elleADit: ElleADit[] = [];
  const note = (rdv.note ?? '').trim();
  if (note) elleADit.push({ texte: note, quand: '', source: 'note' });
  const depuis = plusJours(rdv.date, -FIL_JOURS);
  const entrants = e.messages
    .filter((m) => m.sens === 'entrant' && m.texte.trim() !== '' && jourDe(m.quand) >= depuis && jourDe(m.quand) <= rdv.date)
    .sort((x, y) => y.quand.localeCompare(x.quand))
    .slice(0, FIL_MESSAGES_MAX);
  for (const m of entrants) elleADit.push({ texte: coupe(m.texte), quand: m.quand, source: 'conversations' });

  /* SON COMPTE. */
  const carnet = e.carnet ?? null;
  const duXof = Math.max(0, Math.round(e.duXof || 0));
  let phrase: string;
  let horsCarnet = false;
  if (carnet && rdv.coveredBySub) {
    const reste = carnet.restantes === null ? 'sans limite' : String(carnet.restantes);
    phrase = `Séance incluse dans son ${carnet.nom} : faites ${carnet.faites}, réservées ${carnet.reservees}, reste ${reste}.`;
  } else if (carnet) {
    phrase = `Hors carnet : ${francs(rdv.prixXof)} à la carte.`;
    horsCarnet = true;
  } else {
    phrase = duXof > 0 ? `Pas de carnet. Elle doit ${francs(duXof)}.` : 'Pas de carnet. Rien dû.';
  }

  /* DERNIÈRE NOTE : celle du dernier rendez-vous honoré avant celui-ci qui
     en porte une. Un rendez-vous honoré sans note n'apprend rien d'elle. */
  const venues = venuesAvant(e.sesRdv, rdv);
  const avecNote = venues.find((a) => (a.note ?? '').trim() !== '');
  const derniereNote = avecNote ? { date: avecNote.date, texte: (avecNote.note ?? '').trim() } : null;

  /* LE COMPTAGE : jamais venue, ou plus de 120 jours. */
  const derniere = venues[0];
  const joursSans = derniere ? ecartJours(derniere.date, rdv.date) : null;
  const premiereVenue = !derniere;
  const mois = joursSans === null ? null : Math.round(joursSans / 30.4375);
  const comptageARefaire = premiereVenue || (joursSans ?? 0) > COMPTAGE_APRES_JOURS;

  /* ATTENTION, dans un ordre fixe : dette, enfant, tresses, hors heures,
     numéro étranger, comptage. */
  const attention: string[] = [];
  if (duXof > 0) attention.push(`Elle doit ${francs(duXof)} à la Maison : à régler avant de partir.`);
  const age = ageA(e.cliente?.birthday, rdv.date);
  if (age !== undefined && age < ENFANT_MOINS_DE_ANS) attention.push('Enfant : prévenir le parent au numéro à prévenir.');
  if (rdv.serviceIds.some((id) => e.prestationsTresses(id))) attention.push('Tresses : prévenir Hermine, coiffeuse externe.');
  const ouv = e.ouverture(rdv.date);
  const debut = minutesDe(rdv.time);
  const duree = rdv.dureeMin && rdv.dureeMin > 0 ? rdv.dureeMin : 60;
  if (ouv.closed || (debut !== null && (debut < ouv.openMin || debut + duree > ouv.closeMin))) {
    attention.push('Hors des heures d’ouverture : elle a prévenu, la Maison a dit oui.');
  }
  if (numeroEtranger(e.cliente?.phone || e.cliente?.phone2)) attention.push('Numéro étranger : vérifier que la confirmation de la veille est bien remise.');
  if (premiereVenue) attention.push('Première venue : compter les locks avant le prix.');
  else if (comptageARefaire) attention.push(`${mois} mois sans venir : recompter les locks, son prix suit le comptage.`);

  /* À PRÉPARER. */
  const aPreparer: string[] = [];
  if (pieces.length > 0) {
    const quoi = pieces.length === 1 ? 'la pièce' : `les ${pieces.length} pièces`;
    aPreparer.push(`Regarder ${quoi} avant ${heureDite(heureMoins(rdv.time, REGARDER_AVANT_MIN))}.`);
  }
  if (comptageARefaire) aPreparer.push('Le comptage, puis le bilan de séance.');
  if (aPreparer.length === 0) aPreparer.push('Rien de plus.');

  /* LE RÉSUMÉ DE LA LIGNE REPLIÉE : deux fragments, les plus parlants d'abord. */
  const fragments: string[] = [];
  if (pieces.length === 1) fragments.push(coupe(pieces[0].titre, 40));
  else if (pieces.length > 1) fragments.push(`${pieces.length} pièces envoyées`);
  if (premiereVenue) fragments.push('première venue');
  else if (comptageARefaire) fragments.push(`retour après ${mois} mois`);
  if (duXof > 0) fragments.push(`doit ${francs(duXof)}`);
  if (carnet && rdv.coveredBySub) fragments.push('séance incluse');
  const nbMessages = entrants.length;
  if (nbMessages > 0) fragments.push(nbMessages === 1 ? '1 message à relire' : `${nbMessages} messages à relire`);
  else if (note) fragments.push('une note à relire');
  else fragments.push('rien sur WhatsApp');
  const resume = fragments.slice(0, 2).join(' · ');

  return {
    elleADit,
    compte: { phrase, duXof, carnet, horsCarnet },
    derniereNote,
    attention,
    aPreparer,
    pieces,
    aRelire: elleADit.length > 0 || pieces.length > 0,
    resume,
    comptage: { aRefaire: comptageARefaire, premiereVenue, mois },
  };
}

/* ── LA NOTIFICATION DU TÉLÉPHONE (choix 2) ──────────────────────────── */
/** Le soir vers 19 h pour demain, le matin vers 7 h pour aujourd'hui. Une
    phrase par tête à relire (« Credo à 20 h a envoyé 2 pièces »), puis les
    autres en un mot (« Justine revient après 5 mois ») ; 300 caractères au
    plus. Rien à dire sans rendez-vous : null. */
export function notificationAvantLeFauteuil(e: {
  quand: 'soir' | 'matin';
  jour: string;
  briefings: { nom: string; heure: string; b: BriefingAvantLeFauteuil }[];
}): { titre: string; texte: string } | null {
  const tetes = [...e.briefings].sort((x, y) => x.heure.localeCompare(y.heure));
  if (tetes.length === 0) return null;
  const n = tetes.length;
  const titre = `${e.quand === 'soir' ? 'Demain' : 'Aujourd’hui'}, ${n} ${n > 1 ? 'têtes' : 'tête'}`;
  const phrases: string[] = [];
  for (const t of tetes.filter((x) => x.b.aRelire)) {
    const np = t.b.pieces.length;
    phrases.push(np > 0
      ? `${t.nom} à ${heureDite(t.heure)} a envoyé ${np} ${np > 1 ? 'pièces' : 'pièce'}`
      : `${t.nom} à ${heureDite(t.heure)} a écrit, à relire`);
  }
  for (const t of tetes.filter((x) => !x.b.aRelire)) {
    const c = t.b.comptage;
    if (c.premiereVenue) phrases.push(`${t.nom}, première venue`);
    else if (c.aRefaire) phrases.push(`${t.nom} revient après ${c.mois} mois`);
    else if (t.b.compte.duXof > 0) phrases.push(`${t.nom} doit ${francs(t.b.compte.duXof)}`);
    else phrases.push(`${t.nom} à ${heureDite(t.heure)}`);
  }
  const texte = `${phrases.join('. ')}.`;
  return { titre, texte: texte.length <= NOTIFICATION_MAX ? texte : `${texte.slice(0, NOTIFICATION_MAX - 1).trimEnd()}…` };
}
