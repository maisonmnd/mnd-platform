/* ══ LES ENVOIS PROGRAMMÉS — 13 novembre 2026 ═══════════════════════════
   « Programmer un WhatsApp » remplace « Appel reçu » (maquette
   `public/maquette-les-envois-programmes.html`, validée le 13 novembre 2026,
   « construis »). On écrit le WhatsApp maintenant, avec sa pièce jointe si
   besoin, on choisit l'heure, et l'assistant du sujet l'envoie à l'heure
   dite, seul ; ou bien « par l'app » : à l'heure dite, le téléphone sonne et
   WhatsApp s'ouvre, le message écrit.

   LES CHOIX DE YÉMAN (sélecteur de la maquette) :
     · bouton = remplace : « Suite à son appel » est le premier modèle ;
     · qui = sujet : Perle pour les clientes, Grenat pour l'argent, d'office
       et modifiable ; par le WhatsApp de la Maison, signé à son nom ;
     · fenêtre = porte : elle n'a pas écrit depuis 24 h, un MODÈLE
       D'OUVERTURE approuvé par Meta, puis le message à sa réponse ;
       et sa note : « Si la cliente n'a pas écrit et si c'est un message
       privé, passer : Opale l'envoie par WhatsApp Web » ;
     · avant = seul : il part seul ; « Me demander avant » se coche ;
     · nuit = exact : l'heure EXACTE, même la nuit ;
     · répéter = oui : une fois, chaque jour, semaine, mois, année ;
     · appels = convertir : les appels « à rappeler » non faits deviennent
       des envois à valider d'un toucher ;
     · pièce = tout : un fichier de l'appareil, une pièce du Trône tirée au
       moment d'envoyer, l'itinéraire (un lien dans le texte) ;
     · app = choix : « Seul, par l'assistant » d'office, ou « Par l'app » ;
     · plusieurs = chacune : un message chacune, chacune sa ligne.

   UNE LIGNE DE LA SALLE D'ATTENTE, PAS UN SYSTÈME À CÔTÉ. Un envoi programmé
   est une ligne de la table `envois`, type `programme`, avec son heure
   (`partA`, `prevuA`), son colis, son auteur et son assistant. La salle la
   montre, on la retient, on l'envoie maintenant, comme les autres ; le
   facteur (`envois-partent`) la porte.

   CE FICHIER EST LA SOURCE. Le bloc ⟨envois-programmes⟩ est recopié tel
   quel dans `supabase/functions/envois-partent/index.ts`
   (`node scripts/terminer-copie-serveur.mjs`) ; le banc des douze lunes (R8)
   et `verifie-les-envois-programmes` comparent la copie. Le bloc ne lit
   rien d'autre que lui-même. Pur : ni React, ni magasin, ni Supabase. */

import { prenomDevine } from './civilite';

/* ⟨envois-programmes⟩ */
/** Le type des lignes d'envoi programmées. */
export const TYPE_PROGRAMME = 'programme';
/** « Me demander avant » : l'heure est venue, la ligne attend le oui. Aussi
    les appels convertis : rien ne part sans le oui. */
export const A_VALIDER = 'à-valider';
/** Le modèle d'ouverture est parti : la ligne attend sa réponse. */
export const ATTEND_SA_REPONSE = 'attend-sa-réponse';
/** Message privé, fenêtre fermée : une consigne à Opale (WhatsApp Web). */
export const CONFIE_A_OPALE = 'confié-à-opale';
/** Par l'app : le téléphone a sonné, une main l'envoie de son WhatsApp. */
export const PAR_L_APP = 'par-l-app';
/** Une pièce du Trône (sa facture, son reçu) à tirer par un Trône ouvert. */
export const PIECE_A_TIRER = 'à-préparer';
/** « À revoir » : rien n'est parti, la ligne dit pourquoi. Le même mot que
    le journal (« échec ») : aucune fonction ne retente une ligne programmée. */
export const A_REVOIR = 'échec';

export type Repetition = 'jamais' | 'jour' | 'semaine' | 'mois' | 'annee';
export const REPETITIONS: readonly Repetition[] = ['jamais', 'jour', 'semaine', 'mois', 'annee'];
export type AgentDuProgramme = 'perle' | 'grenat';
export const NOM_DE_L_AGENT: Record<AgentDuProgramme, string> = { perle: 'Perle', grenat: 'Grenat' };
export type ModeDuProgramme = 'seul' | 'app';
export type TelephoneDuProgramme = 'moi' | 'comptoir';

/** La pièce jointe. Un fichier de l'appareil se garde dans le compartiment
    privé `envois-programmes` (0206) ; une pièce du Trône (facture, reçu) se
    TIRE au moment d'envoyer : un Trône ouvert fait son PDF et le range au
    même endroit (`chemin`), juste avant que le facteur la porte. */
export type PieceDuProgramme =
  | { genre: 'fichier'; chemin: string; nom: string; type: string; octets: number }
  | { genre: 'facture' | 'recu'; invoiceId?: string; chemin?: string; nom?: string; type?: string; octets?: number; tireeLe?: string };

export type ColisProgramme = {
  genre: 'programme';
  /** Le numéro au moment de programmer ; la fiche relue l'emporte. */
  numero: string;
  /** Le message, son prénom posé et la devise de la Maison au bout. */
  texte: string;
  piece?: PieceDuProgramme;
  agent: AgentDuProgramme;
  /** Le nom au journal et au fil : « Perle », « Grenat ». */
  parQui: string;
  /** Un message personnel, au nom de Yéman : fenêtre fermée, Opale l'envoie
      par WhatsApp Web, sans modèle. */
  prive?: boolean;
  mode: ModeDuProgramme;
  telephone?: TelephoneDuProgramme;
  demander?: boolean;
  repeter: Repetition;
  /** Le {{1}} du modèle d'ouverture : « Mme Awa ». */
  appel: string;
};

/** Ce que le facteur et le Trône lisent d'une ligne programmée. */
export type LigneProgrammee = {
  id: string;
  type: string;
  canal: string;
  statut: string;
  branchId?: string;
  clientId?: string;
  prenom?: string;
  numero?: string;
  /** Le rendez-vous dont parle le message : relu avant de partir. */
  apptId?: string;
  dateRdv?: string;
  heure?: string;
  serieId: string;
  /** La première fois de la série : les suivantes se comptent depuis elle. */
  serieA?: string;
  occurrence: number;
  lotId?: string;
  /** L'instant voulu, et celui où il pourra partir. */
  prevuA: string;
  partA?: string;
  calme?: boolean;
  parLaMain?: boolean;
  modele?: string;
  auteur?: string;
  auteurUserId?: string;
  deposeLe?: string;
  quand?: string;
  depuisUnAppel?: string;
  ouiLe?: string;
  ouiPar?: string;
  porteLe?: string;
  porteDe?: string;
  waOuvertureId?: string;
  consigneId?: string;
  confieLe?: string;
  sonneLe?: string;
  prevenuLe?: string;
  parLApp?: boolean;
  parOpale?: boolean;
  suivanteId?: string;
  waMessageId?: string;
  detail?: string;
  colis: ColisProgramme;
  [k: string]: unknown;
};

/* ── Le temps, à Cotonou : UTC + 1, toute l'année ── */
const DECALAGE_DU_PROGRAMME_MS = 3_600_000;
/** L'instant d'un jour et d'une heure de Cotonou. */
export const instantDuProgramme = (jour: string, hhmm: string): number => {
  const h = /^\d{1,2}:\d{2}$/.test(hhmm ?? '') ? hhmm.padStart(5, '0') : '09:00';
  return Date.parse(`${jour}T${h}:00+01:00`);
};
/** Le jour de Cotonou d'un instant. */
export const jourDuProgramme = (ms: number): string => new Date(ms + DECALAGE_DU_PROGRAMME_MS).toISOString().slice(0, 10);
const joursDuMois = (annee: number, mois: number): number => new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();

/** LA FOIS SUIVANTE d'une série, après `apresMs`, comptée depuis sa première
    fois (`ancreIso`) : le 31 janvier chaque mois donne le 28 février puis le
    31 mars, jamais le 28 mars ; le 29 février chaque année, le 28 les
    autres années. `null` : une fois seulement. */
export function prochaineFois(ancreIso: string, r: Repetition, apresMs: number): string | null {
  if (r === 'jamais') return null;
  const t0 = Date.parse(ancreIso);
  if (!Number.isFinite(t0)) return null;
  const l = new Date(t0 + DECALAGE_DU_PROGRAMME_MS);
  const Y = l.getUTCFullYear(); const M = l.getUTCMonth(); const D = l.getUTCDate();
  const h = l.getUTCHours(); const mi = l.getUTCMinutes();
  for (let n = 1; n <= 40_000; n += 1) {
    let ms: number;
    if (r === 'jour') ms = Date.UTC(Y, M, D + n, h, mi);
    else if (r === 'semaine') ms = Date.UTC(Y, M, D + 7 * n, h, mi);
    else if (r === 'mois') {
      const y = Y + Math.floor((M + n) / 12); const m = (M + n) % 12;
      ms = Date.UTC(y, m, Math.min(D, joursDuMois(y, m)), h, mi);
    } else ms = Date.UTC(Y + n, M, Math.min(D, joursDuMois(Y + n, M)), h, mi);
    ms -= DECALAGE_DU_PROGRAMME_MS;
    if (ms > apresMs) return new Date(ms).toISOString();
  }
  return null;
}

/** LA LIGNE DE LA FOIS SUIVANTE : un envoi répété se reprogramme seul, UNE
    fois (son identifiant est fixe, `<série>-<n+1>` : l'écrire deux fois ne
    crée rien de plus). Elle repart du début : ni oui, ni porte, ni consigne ;
    une pièce du Trône se tirera de nouveau, un fichier se garde. */
export function ligneSuivante(l: LigneProgrammee, maintenantMs: number): LigneProgrammee | null {
  const c = l.colis;
  if (!c || c.genre !== 'programme') return null;
  const ancre = l.serieA ?? l.prevuA;
  const prevu = Date.parse(l.prevuA);
  const suivant = prochaineFois(ancre, c.repeter, Math.max(Number.isFinite(prevu) ? prevu : 0, maintenantMs));
  if (!suivant) return null;
  const iso = new Date(maintenantMs).toISOString();
  const piece: PieceDuProgramme | undefined = !c.piece ? undefined
    : c.piece.genre === 'fichier' ? c.piece
      : { genre: c.piece.genre, ...(c.piece.invoiceId ? { invoiceId: c.piece.invoiceId } : {}) };
  return {
    id: `${l.serieId}-${l.occurrence + 1}`, type: TYPE_PROGRAMME, canal: 'whatsapp', statut: 'en-attente',
    ...(l.branchId ? { branchId: l.branchId } : {}), ...(l.clientId ? { clientId: l.clientId } : {}),
    ...(l.prenom ? { prenom: l.prenom } : {}), ...(l.numero ? { numero: l.numero } : {}),
    serieId: l.serieId, serieA: ancre, occurrence: l.occurrence + 1, ...(l.lotId ? { lotId: l.lotId } : {}),
    prevuA: suivant, partA: suivant, calme: false, ...(l.modele ? { modele: l.modele } : {}),
    ...(l.auteur ? { auteur: l.auteur } : {}), ...(l.auteurUserId ? { auteurUserId: l.auteurUserId } : {}),
    deposeLe: iso, quand: iso, apptId: '', dateRdv: '',
    colis: { ...c, ...(piece ? { piece } : {}) },
  };
}

/* ── Le numéro, sa clé, la fenêtre ── */
/** Le numéro au format de Meta : 229 et ses chiffres (la règle de `numeroWa`). */
export const numeroDuProgramme = (brut: unknown): string => {
  const d = String(brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};
/** Ce qu'on relit de la fiche avant d'envoyer. */
export type FicheDuProgramme = {
  name?: unknown; phone?: unknown; phone2?: unknown; archived?: unknown;
  nouvelles?: { oui?: unknown; par?: unknown } | null;
  [k: string]: unknown;
};
/** LE NUMÉRO OÙ L'ENVOYER, relu : celui de la fiche d'aujourd'hui (le premier,
    sinon le second), sinon celui noté en programmant. */
export const numeroDeLEnvoi = (l: Pick<LigneProgrammee, 'clientId' | 'colis'>, fiche: FicheDuProgramme | null | undefined): string =>
  numeroDuProgramme(fiche?.phone) || numeroDuProgramme(fiche?.phone2) || numeroDuProgramme(l.colis?.numero);

/** Un message du fil, tel qu'on le lit pour la fenêtre. */
export type MessageDuProgramme = { sens?: unknown; canal?: unknown; quand?: unknown; [k: string]: unknown };
export const FENETRE_DU_PROGRAMME_MS = 24 * 3_600_000;
const entrantVrai = (m: MessageDuProgramme | null | undefined): boolean =>
  !!m && m.sens === 'entrant' && m.canal !== 'site';
/** ELLE A ÉCRIT DANS LES 24 HEURES : seul ce qu'ELLE envoie ouvre la fenêtre,
    jamais nos messages ; une demande du site n'ouvre rien (la règle de
    `whatsapp-envoi` et de `fenetreDe`). `messages` : le fil de son numéro. */
export function fenetreOuverte(messages: readonly (MessageDuProgramme | null | undefined)[], maintenantMs: number): boolean {
  return messages.some((m) => {
    if (!entrantVrai(m)) return false;
    const t = Date.parse(String(m?.quand ?? ''));
    return Number.isFinite(t) && t > maintenantMs - FENETRE_DU_PROGRAMME_MS && t <= maintenantMs + 5 * 60_000;
  });
}
/** ELLE A RÉPONDU au modèle d'ouverture : un message d'elle après son départ. */
export function aReponduDepuis(messages: readonly (MessageDuProgramme | null | undefined)[], depuisIso: string | undefined): boolean {
  const d = Date.parse(String(depuisIso ?? ''));
  if (!Number.isFinite(d)) return false;
  return messages.some((m) => entrantVrai(m) && Date.parse(String(m?.quand ?? '')) > d);
}

/* ── Ce que le facteur relit avant de porter ── */
export const MOTIF_FICHE_DISPARUE = 'la fiche n’existe plus';
export const MOTIF_SANS_NUMERO = 'pas de numéro WhatsApp sur la fiche';
export const MOTIF_STOP = 'elle a écrit STOP : la Maison ne lui écrit plus seule';
export const MOTIF_OPALE_ENDORMIE = 'message privé, elle n’a pas écrit depuis 24 h, et Opale n’était pas éveillée pour l’envoyer par WhatsApp Web';
export const MOTIF_MODELE_PAS_APPROUVE = 'elle n’a pas écrit depuis 24 h, et le modèle d’ouverture n’est pas encore approuvé chez Meta : rien n’est parti';
export const MOTIF_SANS_REPONSE = 'elle n’a pas répondu au modèle d’ouverture en sept jours : le message n’est pas parti';
export const MOTIF_SANS_AUTEUR = 'message privé sans auteur connecté : Opale ne reçoit une consigne qu’au nom de la direction';
export const MOTIF_CONSIGNE_TROP_LONGUE = 'le message et sa pièce dépassent les mille signes d’une consigne à Opale';
/** Sans réponse au modèle d'ouverture en sept jours, la ligne passe à revoir. */
export const ATTENTE_DE_LA_REPONSE_MS = 7 * 86_400_000;

/** POURQUOI IL NE PART PAS, relu à l'heure dite : la fiche existe encore, le
    numéro aussi, elle n'a pas écrit STOP, et le rendez-vous dont parle le
    message n'a été ni annulé ni déplacé. `null` : tout tient. */
export function pourquoiLeProgrammeNePartPas(
  l: Pick<LigneProgrammee, 'clientId' | 'colis' | 'apptId' | 'dateRdv' | 'heure'>,
  o: { fiche?: FicheDuProgramme | null; rdv?: { date?: string; time?: string; status?: string } | null; maintenantMs: number },
): string | null {
  if (l.clientId && !o.fiche) return MOTIF_FICHE_DISPARUE;
  if (!numeroDeLEnvoi(l, o.fiche)) return MOTIF_SANS_NUMERO;
  if (o.fiche?.nouvelles && o.fiche.nouvelles.oui === false && o.fiche.nouvelles.par === 'stop') return MOTIF_STOP;
  if (l.apptId) {
    const r = o.rdv;
    if (!r) return 'le rendez-vous dont parle le message n’existe plus';
    if (r.status === 'annulé') return 'le rendez-vous dont parle le message a été annulé';
    if ((r.date ?? '') !== (l.dateRdv ?? '') || (r.time ?? '') !== (l.heure ?? '')) return 'le rendez-vous dont parle le message a été déplacé';
    const h = /^\d{1,2}:\d{2}$/.test(r.time ?? '') ? (r.time as string).padStart(5, '0') : '23:59';
    const moment = Date.parse(`${r.date}T${h}:00+01:00`);
    if (Number.isFinite(moment) && moment <= o.maintenantMs) return 'l’heure du rendez-vous dont parle le message est passée';
  }
  return null;
}

/* ── La voie ── */
/** Opale veille : son guetteur a regardé depuis trois minutes, ou elle est
    passée au Trône depuis quarante-cinq (son tour du soir est de trente). */
export function opaleEveillee(a: { empreinte?: unknown; vu_le?: unknown; guette_le?: unknown } | null | undefined, maintenantMs: number): boolean {
  if (!a || !a.empreinte) return false;
  const g = Date.parse(String(a.guette_le ?? ''));
  const v = Date.parse(String(a.vu_le ?? ''));
  return (Number.isFinite(g) && maintenantMs - g <= 3 * 60_000) || (Number.isFinite(v) && maintenantMs - v <= 45 * 60_000);
}
/** Une pièce du Trône pas encore tirée. */
export const pieceATirer = (p: PieceDuProgramme | undefined): boolean => !!p && p.genre !== 'fichier' && !p.chemin;

export type FaitsDeLaVoie = {
  fenetreOuverte: boolean;
  opaleEveillee: boolean;
  /** Le nom du modèle d'ouverture approuvé (le secret `WA_TEMPLATE_OUVERTURE`) ; vide : pas encore approuvé. */
  modeleDOuverture: string;
  /** Une autre ligne a déjà ouvert la porte à ce numéro et attend sa réponse. */
  porteOuverteDe: string | null;
};
export type VoieDuProgramme =
  | { voie: 'app' } | { voie: 'demander' } | { voie: 'tirer' } | { voie: 'texte' } | { voie: 'opale' }
  | { voie: 'ouverture' } | { voie: 'rejoint'; de: string } | { voie: 'revoir'; motif: string };

/** PAR OÙ IL PART, à l'heure dite. Par l'app : le téléphone de qui l'a
    programmé sonne, pas de règle des 24 h. « Me demander avant » : rien sans
    le oui. Une pièce du Trône se tire d'abord. Elle a écrit dans les 24 h :
    le message part tel quel, par le WhatsApp de la Maison. Sinon : privé,
    Opale l'envoie par WhatsApp Web ; sinon le modèle d'ouverture (un seul
    par numéro : une porte déjà ouverte, on l'attend avec elle). */
export function voieDuProgramme(l: Pick<LigneProgrammee, 'colis' | 'ouiLe'>, f: FaitsDeLaVoie): VoieDuProgramme {
  const c = l.colis;
  if (c.mode === 'app') return { voie: 'app' };
  if (c.demander === true && !l.ouiLe) return { voie: 'demander' };
  if (pieceATirer(c.piece)) return { voie: 'tirer' };
  if (f.fenetreOuverte) return { voie: 'texte' };
  if (c.prive === true) return f.opaleEveillee ? { voie: 'opale' } : { voie: 'revoir', motif: MOTIF_OPALE_ENDORMIE };
  if (f.porteOuverteDe) return { voie: 'rejoint', de: f.porteOuverteDe };
  if (!f.modeleDOuverture) return { voie: 'revoir', motif: MOTIF_MODELE_PAS_APPROUVE };
  return { voie: 'ouverture' };
}

/* ── Le modèle d'ouverture (docs/modeles-whatsapp-envois-programmes.md) ── */
/** Le nom proposé chez Meta ; le secret `WA_TEMPLATE_OUVERTURE` le pose,
    APRÈS l'approbation. */
export const MODELE_D_OUVERTURE = 'un_message_pour_vous';
/** Le corps exact déposé chez Meta, {{1}} l'appel. */
export const CORPS_D_OUVERTURE = 'Bonjour {{1}}, la Maison MND a un message pour vous. Touchez « Lire le message », ou répondez simplement, pour le recevoir ici.';
export const texteDOuverture = (appel: string): string => CORPS_D_OUVERTURE.replace('{{1}}', String(appel ?? '').trim() || 'Madame, Monsieur');
export const composantsDOuverture = (appel: string): unknown[] =>
  [{ type: 'body', parameters: [{ type: 'text', text: String(appel ?? '').replace(/\s+/g, ' ').trim() || 'Madame, Monsieur' }] }];

/* ── Ce qui part chez Meta ── */
export type FamilleDuFichier = 'image' | 'video' | 'audio' | 'document';
export const familleDuFichier = (type: string): FamilleDuFichier => {
  const m = String(type ?? '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/png') return 'image';
  if (m === 'video/mp4' || m === 'video/3gpp') return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'document';
};
/** Les messages à porter : le texte seul, ou la pièce avec sa légende (1 024
    signes au plus, jamais sur un son), ou la pièce puis le texte. */
export function messagesAPorter(numero: string, texte: string, media?: { id: string; famille: FamilleDuFichier; nom: string } | null): Record<string, unknown>[] {
  const t = String(texte ?? '').trim();
  const leTexte = { messaging_product: 'whatsapp', recipient_type: 'individual', to: numero, type: 'text', text: { body: t, preview_url: true } };
  if (!media) return [leTexte];
  const legende = media.famille !== 'audio' && t.length > 0 && t.length <= 1024;
  const corps: Record<string, unknown> = { id: media.id };
  if (media.famille === 'document') corps.filename = media.nom;
  if (legende) corps.caption = t;
  const laPiece = { messaging_product: 'whatsapp', recipient_type: 'individual', to: numero, type: media.famille, [media.famille]: corps };
  return legende || !t ? [laPiece] : [laPiece, leTexte];
}

/** LA CLÉ D'UNE PHASE (réservée au fil avant de parler, comme la clé d'une
    pièce) : la même ligne, la même phase, un seul message, même si le facteur
    est coupé au milieu et reprend. */
export const cleDuProgramme = (id: string, phase: 'ouverture' | 'message'): string => `programme-${id}-${phase}`;

/* ── La consigne à Opale (charte, section 22) ── */
export const DEBUT_DE_LA_CONSIGNE = 'Envoi programmé';
/** LA CONSIGNE : qui l'a programmé, le numéro, le texte mot pour mot, la pièce
    (un lien signé de vingt-quatre heures), et la réponse attendue. `null` :
    plus de mille signes, la consigne ne la porterait pas. */
export function texteDeLaConsigne(o: { auteur: string; numero: string; prenom?: string; texte: string; piece?: { nom: string; lien: string } | null }): string | null {
  const t = [
    `${DEBUT_DE_LA_CONSIGNE} par ${o.auteur || 'la direction'} : à envoyer maintenant depuis WhatsApp Web, au +${o.numero}${o.prenom ? ` (${o.prenom})` : ''}, une seule fois.`,
    'Le message, mot pour mot :',
    String(o.texte ?? '').trim(),
    ...(o.piece ? [`La pièce jointe à joindre (${o.piece.nom}) : ${o.piece.lien}`] : []),
    'Parti : consigne repondre --statut faite. Impossible : --statut en-attente, et pourquoi.',
  ].join('\n');
  return t.length <= 1000 ? t : null;
}
/* ⟨/envois-programmes⟩ */

/* ══ CE QUI SUIT EST AU TRÔNE SEULEMENT (le formulaire, la file, les appels) ══ */

/** Les tailles que WhatsApp accepte : une image 5 Mo, le reste 16 Mo (le
    compartiment de 0206). */
export const OCTETS_MAX_IMAGE = 5 * 1024 * 1024;
export const OCTETS_MAX = 16 * 1024 * 1024;
export const TYPES_PERMIS: readonly string[] = [
  'image/jpeg', 'image/png', 'application/pdf', 'video/mp4',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain',
];
/** Un fichier de l'appareil : son type, son poids. `null` : il peut partir. */
export function pieceRefusee(f: { type: string; octets: number }): string | null {
  if (!TYPES_PERMIS.includes(f.type)) return 'WhatsApp n’accepte que les photos JPEG ou PNG, les PDF, les documents Word, Excel ou texte, et les vidéos MP4.';
  const max = familleDuFichier(f.type) === 'image' ? OCTETS_MAX_IMAGE : OCTETS_MAX;
  if (f.octets > max) return `Ce fichier pèse ${Math.round(f.octets / 104857.6) / 10} Mo : ${max === OCTETS_MAX_IMAGE ? 'une photo' : 'une pièce'} part jusqu’à ${max / 1048576} Mo.`;
  return null;
}
/** Le chemin du fichier dans le compartiment : le lot, puis un nom sans
    accent ni espace (jamais le nom de la cliente). */
export const cheminDuFichier = (lotId: string, nom: string): string => {
  const point = nom.lastIndexOf('.');
  const ext = point > 0 ? nom.slice(point + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) : '';
  return `${lotId}/piece${ext ? `.${ext}` : ''}`;
};

/* ── Les modèles du formulaire ── */
export type CleDuModeleDeMessage = 'appel' | 'rdv' | 'relance' | 'anniv' | 'libre';
export type ModeleDeMessage = { cle: CleDuModeleDeMessage; nom: string; agent: AgentDuProgramme; repeter: Repetition; texte: string; piece?: 'facture' };
/** « {prénom} » se remplace par le prénom de chaque cliente ; « {motif} » par
    le motif de son appel. Le premier modèle est le texte de `messageAppel`. */
export const MODELES_DE_MESSAGE: readonly ModeleDeMessage[] = [
  { cle: 'appel', nom: 'Suite à son appel', agent: 'perle', repeter: 'jamais',
    texte: 'Bonjour {prénom}, la Maison MND a bien reçu votre appel{motif}. Quand vous conviendrait-il de passer ?' },
  { cle: 'rdv', nom: 'Rappel de rendez-vous', agent: 'perle', repeter: 'jamais',
    texte: 'Bonjour {prénom}, un petit rappel de la Maison MND : votre rendez-vous est prévu {rendez-vous}. Nous vous attendons.' },
  { cle: 'relance', nom: 'Relance d’un paiement', agent: 'grenat', repeter: 'jamais', piece: 'facture',
    texte: 'Bonjour {prénom}, un mot de la Maison MND au sujet de votre règlement : il reste un montant à régler sur votre facture, jointe à ce message. Merci de votre confiance.' },
  { cle: 'anniv', nom: 'Anniversaire', agent: 'perle', repeter: 'annee',
    texte: 'Joyeux anniversaire {prénom}. Toute la Maison MND pense à vous aujourd’hui.' },
  { cle: 'libre', nom: 'Message libre', agent: 'perle', repeter: 'jamais', texte: '' },
];
export const modeleDeMessage = (cle: string): ModeleDeMessage => MODELES_DE_MESSAGE.find((m) => m.cle === cle) ?? MODELES_DE_MESSAGE[4];

/** « Suite à son appel » : le texte de `messageAppel` (shared/appels), le
    motif dans le message, tout le prénom composé. */
export function texteSuiteASonAppel(nom: string, motif: string): string {
  const prenom = prenomDevine(nom) || String(nom ?? '').trim();
  return `Bonjour ${prenom}, la Maison MND a bien reçu votre appel${motif ? ` au sujet de « ${motif} »` : ''}. Quand vous conviendrait-il de passer ?`;
}

/** Le motif de son appel posé dans le texte du modèle (le formulaire le montre à vue). */
export const avecLeMotif = (texte: string, motif: string): string =>
  String(texte ?? '').split('{motif}').join(motif ? ` au sujet de « ${motif} »` : '');

/** Le texte d'une cliente : son prénom, le motif, le rendez-vous. */
export function texteDeLaCliente(modele: string, o: { prenom: string; motif?: string; rendezVous?: string }): string {
  return String(modele ?? '')
    .split('{prénom}').join(o.prenom || '')
    .split('{prenom}').join(o.prenom || '')
    .split('{motif}').join(o.motif ? ` au sujet de « ${o.motif} »` : '')
    .split('{rendez-vous}').join(o.rendezVous || 'bientôt')
    .replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').replace(/ +([,.])/g, '$1').trim();
}

/* ── Quand ── */
export type ChoixDuQuand = 'h1' | 'soir' | 'demain9' | 'autre';
export const QUANDS: readonly { cle: ChoixDuQuand; nom: string }[] = [
  { cle: 'h1', nom: 'Dans 1 h' }, { cle: 'soir', nom: 'Ce soir 18 h' }, { cle: 'demain9', nom: 'Demain 9 h' }, { cle: 'autre', nom: 'Le jour choisi' },
];
/** L'instant choisi. « Ce soir 18 h » passé : demain 18 h. `null` : le jour choisi est illisible. */
export function instantChoisi(choix: ChoixDuQuand, maintenantMs: number, jour?: string, heure?: string): number | null {
  const aujourdhui = jourDuProgramme(maintenantMs);
  const demain = jourDuProgramme(maintenantMs + 86_400_000);
  if (choix === 'h1') return Math.ceil((maintenantMs + 3_600_000) / 60_000) * 60_000;
  if (choix === 'soir') { const t = instantDuProgramme(aujourdhui, '18:00'); return t > maintenantMs ? t : instantDuProgramme(demain, '18:00'); }
  if (choix === 'demain9') return instantDuProgramme(demain, '09:00');
  if (!jour || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  const t = instantDuProgramme(jour, heure && /^\d{1,2}:\d{2}$/.test(heure) ? heure : '09:00');
  return Number.isFinite(t) ? t : null;
}

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 16 h », « 16 h 30 ». */
export const heureDuProgramme = (ms: number): string => {
  const d = new Date(ms + DECALAGE_DU_PROGRAMME_MS);
  const h = d.getUTCHours(); const m = d.getUTCMinutes();
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};
/** « Aujourd’hui · 16 h 30 », « Demain · 9 h », « ven. 15 nov. 2026 · 10 h » (l'année toujours, hors des deux premiers). */
export function quandDit(iso: string | undefined, maintenantMs: number): string {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return '';
  const jour = jourDuProgramme(t);
  if (jour === jourDuProgramme(maintenantMs)) return `Aujourd’hui · ${heureDuProgramme(t)}`;
  if (jour === jourDuProgramme(maintenantMs + 86_400_000)) return `Demain · ${heureDuProgramme(t)}`;
  if (jour === jourDuProgramme(maintenantMs - 86_400_000)) return `Hier · ${heureDuProgramme(t)}`;
  const d = new Date(`${jour}T12:00:00Z`);
  return `${JOURS_COURTS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${heureDuProgramme(t)}`;
}
export const REPETITION_DITE: Record<Repetition, string> = {
  jamais: 'une fois', jour: 'chaque jour', semaine: 'chaque semaine', mois: 'chaque mois', annee: 'chaque année',
};

/* ── Les lignes que le formulaire programme ── */
export type Destinataire = { clientId?: string; nom: string; prenom: string; appel: string; numero: string; rendezVous?: { apptId: string; date: string; time: string; dit: string } };
export type Programmation = {
  lotId: string;
  branchId: string;
  modele: CleDuModeleDeMessage;
  /** Le texte du formulaire, « {prénom} » encore à poser. */
  texte: string;
  motif?: string;
  prevuMs: number;
  repeter: Repetition;
  agent: AgentDuProgramme;
  mode: ModeDuProgramme;
  telephone: TelephoneDuProgramme;
  demander: boolean;
  prive: boolean;
  piece?: PieceDuProgramme;
  auteur: string;
  auteurUserId?: string;
};

/** UNE LIGNE PAR CLIENTE, à son prénom, jamais un groupe. `signe` pose la
    devise de la Maison au bout (`signeLeMessage`). Une ligne qui parle d'un
    rendez-vous le nomme : le facteur le relit. */
export function lignesDeLaProgrammation(p: Programmation, destinataires: readonly Destinataire[], maintenantMs: number, signe: (t: string) => string): LigneProgrammee[] {
  const iso = new Date(maintenantMs).toISOString();
  const prevu = new Date(p.prevuMs).toISOString();
  return destinataires.map((d, i) => {
    const serieId = `${p.lotId}-${i + 1}`;
    const rdv = p.modele === 'rdv' && p.repeter === 'jamais' ? d.rendezVous : undefined;
    const texte = signe(texteDeLaCliente(p.texte, { prenom: d.prenom, motif: p.motif, rendezVous: rdv?.dit }));
    const colis: ColisProgramme = {
      genre: 'programme', numero: d.numero, texte, agent: p.agent, parQui: NOM_DE_L_AGENT[p.agent],
      mode: p.mode, repeter: p.repeter, appel: d.appel,
      ...(p.mode === 'app' ? { telephone: p.telephone } : { ...(p.demander ? { demander: true } : {}), ...(p.prive ? { prive: true } : {}) }),
      ...(p.piece ? { piece: p.piece } : {}),
    };
    return {
      id: `${serieId}-1`, type: TYPE_PROGRAMME, canal: 'whatsapp', statut: 'en-attente', branchId: p.branchId,
      ...(d.clientId ? { clientId: d.clientId } : {}), prenom: d.prenom, numero: d.numero,
      ...(rdv ? { apptId: rdv.apptId, dateRdv: rdv.date, heure: rdv.time } : { apptId: '', dateRdv: '' }),
      serieId, serieA: prevu, occurrence: 1, lotId: p.lotId, prevuA: prevu, partA: prevu, calme: false, modele: p.modele,
      auteur: p.auteur, ...(p.auteurUserId ? { auteurUserId: p.auteurUserId } : {}), deposeLe: iso, quand: iso, colis,
    };
  });
}

/* ── La file ── */
export type OngletDeLaFile = 'a-venir' | 'partis' | 'a-revoir';
const A_VENIR = new Set(['en-attente', 'retenu', A_VALIDER, ATTEND_SA_REPONSE, CONFIE_A_OPALE, PAR_L_APP, PIECE_A_TIRER, 'en-envoi']);
/** L'onglet d'une ligne : à venir (y compris ce qui attend un oui, sa réponse,
    Opale ou une main), partis, ou à revoir (pas parti : échec, périmé). Une
    ligne écartée par une main n'est nulle part : elle reste au journal. */
export function ongletDe(l: Pick<LigneProgrammee, 'statut'>): OngletDeLaFile | null {
  if (A_VENIR.has(l.statut)) return 'a-venir';
  if (l.statut === 'envoyé') return 'partis';
  if (l.statut === A_REVOIR || l.statut === 'périmé') return 'a-revoir';
  return null;
}
export type Pastille = { dit: string; ton: '' | 'attend' | 'ok' | 'ko' };
/** Ce que la ligne dit d'elle-même, en pastilles. */
export function pastillesDe(l: LigneProgrammee, maintenantMs: number): Pastille[] {
  const c = l.colis;
  const p: Pastille[] = [];
  const t = Date.parse(String(l.partA ?? l.prevuA ?? ''));
  const min = Number.isFinite(t) ? Math.ceil((t - maintenantMs) / 60_000) : NaN;
  if (l.statut === 'en-attente') {
    if (c.mode === 'app') p.push({ dit: `par l’app, sur ${c.telephone === 'comptoir' ? 'le téléphone du comptoir' : 'votre téléphone'}`, ton: 'attend' });
    else if (c.demander && !l.ouiLe) p.push({ dit: 'vous demandera avant', ton: 'attend' });
    else if (Number.isFinite(min) && min <= 60) p.push({ dit: min <= 0 ? 'part à l’instant' : `part dans ${min} min`, ton: 'attend' });
    else p.push({ dit: 'programmé', ton: '' });
  }
  if (l.statut === 'retenu') p.push({ dit: 'retenu', ton: 'attend' });
  if (l.statut === A_VALIDER) p.push({ dit: l.depuisUnAppel ? 'ancien appel : à valider d’un toucher' : 'attend votre oui', ton: 'attend' });
  if (l.statut === ATTEND_SA_REPONSE) p.push({ dit: 'modèle d’ouverture parti : il part à sa réponse', ton: 'attend' });
  if (l.statut === CONFIE_A_OPALE) p.push({ dit: 'confié à Opale (WhatsApp Web)', ton: 'attend' });
  if (l.statut === PAR_L_APP) p.push({ dit: 'prêt : à envoyer par l’app', ton: 'attend' });
  if (l.statut === PIECE_A_TIRER) p.push({ dit: 'sa pièce attend un Trône ouvert', ton: 'attend' });
  if (l.statut === 'en-envoi') p.push({ dit: 'part à l’instant', ton: 'attend' });
  if (l.statut === 'envoyé') {
    p.push({ dit: l.parLApp ? 'envoyé par l’app' : l.parOpale ? 'envoyé par Opale' : l.porteLe ? 'parti à sa réponse' : 'parti', ton: 'ok' });
    if (l.etat === 'lu') p.push({ dit: 'lu', ton: 'ok' });
  }
  if (l.statut === A_REVOIR || l.statut === 'périmé') p.push({ dit: String(l.detail ?? 'pas parti'), ton: 'ko' });
  if (c.prive) p.push({ dit: 'privé', ton: '' });
  if (c.repeter !== 'jamais') p.push({ dit: REPETITION_DITE[c.repeter], ton: '' });
  if (c.piece) p.push({ dit: c.piece.genre === 'fichier' ? `pièce · ${c.piece.nom}` : c.piece.genre === 'facture' ? 'sa facture, tirée à l’envoi' : 'son reçu, tiré à l’envoi', ton: '' });
  return p;
}
/** Qui l'envoie, dit sur la ligne. */
export const quiLEnvoie = (l: Pick<LigneProgrammee, 'colis'>): string =>
  (l.colis.mode === 'app' ? 'Par l’app' : l.colis.prive ? `${l.colis.parQui}, ou Opale` : l.colis.parQui);

/* ── Les gestes de la file ── */
/** LE OUI (« Envoyer », sur une ligne à valider) : elle attend de nouveau,
    à son heure si elle n'est pas venue, sinon tout de suite. `null` : elle
    n'attend plus de oui. */
export function leOui<T extends LigneProgrammee>(l: T, qui: string, maintenantMs: number): T | null {
  if (l.statut !== A_VALIDER) return null;
  const prevu = Date.parse(l.prevuA);
  const part = Math.max(Number.isFinite(prevu) ? prevu : maintenantMs, maintenantMs);
  return { ...l, statut: 'en-attente', partA: new Date(part).toISOString(), calme: false, ouiLe: new Date(maintenantMs).toISOString(), ouiPar: qui };
}
/** « Retenir » sur une ligne à valider ou à envoyer par l'app : elle se tient. */
export function retiensLeProgramme<T extends LigneProgrammee>(l: T, qui: string, maintenantMs: number): T | null {
  if (l.statut !== 'en-attente' && l.statut !== A_VALIDER && l.statut !== PAR_L_APP) return null;
  return { ...l, statut: 'retenu', retenuPar: qui, retenuLe: new Date(maintenantMs).toISOString() };
}
/** « C'est envoyé » : la main l'a envoyée de son WhatsApp. */
export function envoyeParLApp<T extends LigneProgrammee>(l: T, qui: string, maintenantMs: number): T | null {
  if (l.statut !== PAR_L_APP && l.statut !== 'en-attente' && l.statut !== 'retenu') return null;
  const iso = new Date(maintenantMs).toISOString();
  return { ...l, statut: 'envoyé', parLApp: true, envoyePar: qui, quand: iso, detail: `envoyé par l’app, ${heureDuProgramme(maintenantMs)}` };
}
/** « Pas envoyé » au retour : la ligne redevient prête. */
export function pasEnvoyeParLApp<T extends LigneProgrammee>(l: T): T | null {
  if (l.statut !== 'envoyé' || !l.parLApp) return null;
  const { parLApp: _a, envoyePar: _b, detail: _d, ...reste } = l as T & { envoyePar?: string };
  return { ...(reste as T), statut: PAR_L_APP };
}
/** « Corriger et reprogrammer » : une ligne à revoir repart, à l'heure dite. */
export function reprogramme<T extends LigneProgrammee>(l: T, o: { texte?: string; prevuMs: number; maintenantMs: number }): T | null {
  if (l.statut !== A_REVOIR && l.statut !== 'périmé' && l.statut !== 'retenu') return null;
  const prevu = new Date(Math.max(o.prevuMs, o.maintenantMs)).toISOString();
  const { detail: _d, porteLe: _p, porteDe: _q, waOuvertureId: _w, consigneId: _c, confieLe: _f, ouiLe: _o, ouiPar: _r, retenuPar: _x, retenuLe: _y, sonneLe: _s, prevenuLe: _v, ...reste } = l as T & { retenuPar?: string; retenuLe?: string };
  return {
    ...(reste as T), statut: 'en-attente', prevuA: prevu, partA: prevu, calme: false, parLaMain: false,
    colis: { ...l.colis, ...(o.texte !== undefined ? { texte: o.texte } : {}) },
  };
}

/** DANS LA SALLE D'ATTENTE : un envoi programmé y paraît dans l'heure qui
    vient (la salle montre ce qui part bientôt), retenu, ou s'il est passé
    sans partir. La file les montre tous. */
export function programmeDansLaSalle(l: { type?: string; statut?: string; partA?: string }, maintenantMs: number): boolean {
  if (l.type !== TYPE_PROGRAMME) return true;
  if (l.statut === 'retenu') return true;
  const t = Date.parse(String(l.partA ?? ''));
  return !Number.isFinite(t) || t - maintenantMs <= 60 * 60_000;
}

/* ── Les appels déjà notés ── */
export type AppelAConvertir = { id: string; branchId: string; clientId?: string; nom: string; phone?: string; motif: string; suite: 'rappel' | 'rdv'; quand?: string; fait: boolean; at: string; envoiId?: string };
/** L'identifiant fixe de l'envoi d'un ancien appel : le convertir deux fois
    ne fait qu'une ligne. */
export const idDeLEnvoiDeLAppel = (appelId: string): string => `prog-appel-${appelId}-1`;

/** LES APPELS « À RAPPELER » NON FAITS DEVIENNENT DES ENVOIS, à leur date (9 h
    à Cotonou), « à valider d'un toucher » : rien ne part sans le oui.
    Idempotent (l'identifiant de la ligne vient de l'appel) ; aucun appel
    perdu : un appel sans numéro reste au journal des appels, et le dit. */
export function appelsAConvertir(
  appels: readonly AppelAConvertir[],
  o: {
    dejaLa: (id: string) => boolean;
    fiche: (id: string) => { name?: string; prenomUsage?: string; phone?: string; phone2?: string; civilite?: string } | undefined;
    appelDe: (fiche: { name?: string; prenomUsage?: string; civilite?: string } | undefined, nom: string) => string;
    signe: (t: string) => string;
    maintenantMs: number;
    auteur: string;
  },
): { lignes: LigneProgrammee[]; marques: { appelId: string; envoiId: string }[]; sansNumero: string[] } {
  const lignes: LigneProgrammee[] = []; const marques: { appelId: string; envoiId: string }[] = []; const sansNumero: string[] = [];
  const iso = new Date(o.maintenantMs).toISOString();
  for (const a of appels) {
    if (!a || a.fait || a.suite !== 'rappel' || a.envoiId) continue;
    const id = idDeLEnvoiDeLAppel(a.id);
    if (o.dejaLa(id)) { marques.push({ appelId: a.id, envoiId: id }); continue; }
    const f = a.clientId ? o.fiche(a.clientId) : undefined;
    const numero = numeroDuProgramme(a.phone) || numeroDuProgramme(f?.phone) || numeroDuProgramme(f?.phone2);
    if (!numero) { sansNumero.push(a.id); continue; }
    const jour = /^\d{4}-\d{2}-\d{2}/.test(a.quand ?? '') ? String(a.quand).slice(0, 10) : jourDuProgramme(o.maintenantMs);
    const prevu = new Date(instantDuProgramme(jour, '09:00')).toISOString();
    const prenom = String(f?.prenomUsage ?? '').trim() || prenomDevine(f?.name ?? a.nom) || a.nom.trim();
    lignes.push({
      id, type: TYPE_PROGRAMME, canal: 'whatsapp', statut: A_VALIDER, branchId: a.branchId,
      ...(a.clientId ? { clientId: a.clientId } : {}), prenom, numero, apptId: '', dateRdv: '',
      serieId: `prog-appel-${a.id}`, serieA: prevu, occurrence: 1, prevuA: prevu, partA: prevu, calme: false, modele: 'appel',
      auteur: o.auteur, deposeLe: iso, quand: iso, depuisUnAppel: a.id,
      colis: {
        genre: 'programme', numero, texte: o.signe(texteSuiteASonAppel(f?.name ?? a.nom, a.motif)), agent: 'perle', parQui: 'Perle',
        mode: 'seul', repeter: 'jamais', appel: o.appelDe(f, a.nom),
      },
    });
    marques.push({ appelId: a.id, envoiId: id });
  }
  return { lignes, marques, sansNumero };
}
