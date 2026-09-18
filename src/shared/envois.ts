/* ══ LE JOURNAL DES ENVOIS — 18 septembre 2026 ═══════════════════════════
   « Comment retrouver toutes les confirmations de RDV WhatsApp qui partent
   chez la cliente ? » (Yéman). Maquette `maquette-le-journal-des-envois.html`,
   arbitrages tranchés : un onglet « Envois automatiques » dans Conversations,
   et chaque message dans le fil de la cliente.

   Les fonctions planifiées écrivent déjà tout dans la table `envois` : une
   ligne par message, par personne et par canal. Personne ne la lisait, sauf
   la tournée du matin pour les rappels. CE FICHIER EST LE LECTEUR : il dit
   ce qu'un envoi est devenu, pourquoi un échec a échoué, en français, et ce
   qu'un jour compte. Pur, éprouvé par `verifie-journal-des-envois`. */

export type TypeDEnvoi = 'accuse' | 'confirmation' | 'rappel-j1' | 'avis-google' | 'fin-de-paquet';

/** Ce que le journal lit d'une ligne `envois`. Les champs viennent de
    fonctions différentes, écrites à des dates différentes : tous facultatifs
    sauf l'identité et l'instant. */
export type EnvoiLu = {
  id: string;
  type: string;
  canal: string;
  statut: string;
  quand: string;
  branchId?: string;
  apptId?: string;
  clientId?: string;
  /** Le numéro, quand il n'y a pas encore de fiche (l'accusé du site). */
  numero?: string;
  prenom?: string;
  dateRdv?: string;
  heure?: string;
  /** Ce que Meta a rapporté ensuite : en route, remis, lu, non remis. */
  etat?: string;
  detail?: string;
  /** Le code d'erreur de Meta, quand il y en a un. */
  codeMeta?: number;
};

export type DevenuDeLEnvoi = 'lu' | 'remis' | 'en-route' | 'non-remis' | 'echec' | 'personne' | 'a-la-main' | 'en-cours';

/** CE QUE LE MESSAGE EST DEVENU. L'accusé de Meta l'emporte sur le statut
    d'envoi : « envoyé » dit seulement que Meta a accepté la requête. */
export const devenuDe = (e: Pick<EnvoiLu, 'statut' | 'etat'>): DevenuDeLEnvoi => {
  if (e.etat === 'lu') return 'lu';
  if (e.etat === 'remis') return 'remis';
  if (e.etat === 'non-remis') return 'non-remis';
  if (e.statut === 'échec') return 'echec';
  if (e.statut === 'sans-abonnement' || e.statut === 'sans-numero') return 'personne';
  if (e.statut === 'à-la-main') return 'a-la-main';
  if (e.statut === 'en cours') return 'en-cours';
  return 'en-route';
};

export const DEVENU_DIT: Record<DevenuDeLEnvoi, string> = {
  lu: 'lu', remis: 'remis', 'en-route': 'en route', 'non-remis': 'non remis', echec: 'échec',
  personne: 'personne à joindre', 'a-la-main': 'envoyé à la main', 'en-cours': 'en cours',
};

/** Ce qui demande un regard : ce qui n'est pas arrivé. */
export const estARegarder = (d: DevenuDeLEnvoi): boolean => d === 'echec' || d === 'non-remis';

export const TYPE_DIT: Record<string, string> = {
  accuse: 'Accusé de demande',
  confirmation: 'Confirmation',
  'rappel-j1': 'Rappel de la veille',
  'avis-google': 'Demande d’avis',
  'fin-de-paquet': 'Fin de paquet',
};
export const typeDit = (t: string): string => TYPE_DIT[t] ?? t;

export const CANAL_DIT: Record<string, string> = {
  whatsapp: 'WhatsApp', push: 'Notification', sms: 'SMS', 'wa-main': 'WhatsApp, à la main',
};
export const canalDit = (c: string): string => CANAL_DIT[c] ?? c;

/* ── LE MOTIF, EN FRANÇAIS ───────────────────────────────────────────────
   Meta répond en anglais, par un code et un titre ; les fonctions en gardent
   ce qu'elles reçoivent. L'écran dit ce qu'il faut FAIRE, pas le code : « ce
   numéro n'a pas WhatsApp » se règle en appelant, « modèle en attente »
   en patientant. Le code d'abord, le texte à défaut : les fonctions d'avant
   le 18 septembre ne gardaient que le texte. Un motif inconnu se montre tel
   quel, jamais remplacé par une supposition. */
const MOTIFS: { codes: number[]; texte?: RegExp; dit: string }[] = [
  { codes: [131026], texte: /undeliverable|incapable of receiving|not a valid whatsapp/i, dit: 'ce numéro n’a pas WhatsApp, ou ne peut pas recevoir ce message' },
  { codes: [132001], texte: /template name does not exist|does not exist in the translation|template.*not found/i, dit: 'modèle pas encore approuvé chez Meta, ou nom de modèle inconnu' },
  { codes: [132000], texte: /number of parameters/i, dit: 'le modèle attend d’autres variables : à vérifier chez Meta' },
  { codes: [132015], texte: /template is paused/i, dit: 'modèle mis en pause par Meta' },
  { codes: [132016], texte: /template is disabled/i, dit: 'modèle désactivé par Meta' },
  { codes: [131047], texte: /re-?engagement/i, dit: 'hors de la fenêtre de 24 heures : il faut un modèle' },
  { codes: [131049], texte: /healthy ecosystem/i, dit: 'Meta a retenu le message pour ne pas lasser la cliente' },
  { codes: [131050], texte: /stopped marketing|user has stopped/i, dit: 'la cliente a refusé les messages de la Maison' },
  { codes: [131030], texte: /allowed list/i, dit: 'numéro hors de la liste de test de Meta' },
  { codes: [190], texte: /access token|session has expired/i, dit: 'jeton Meta expiré : à renouveler dans les secrets' },
  { codes: [131056], texte: /pair rate limit/i, dit: 'trop de messages vers ce numéro en peu de temps' },
  { codes: [130429, 80007], texte: /rate limit/i, dit: 'trop d’envois d’un coup : Meta a freiné' },
  { codes: [131042], texte: /payment/i, dit: 'moyen de paiement Meta à régulariser' },
  { codes: [131031], texte: /account has been locked|account.*(restricted|locked)/i, dit: 'compte WhatsApp de la Maison bloqué par Meta' },
  { codes: [], texte: /fetch failed|network|timed? ?out|aborted|econnreset/i, dit: 'coupure réseau : retenté au prochain passage' },
  { codes: [], texte: /accepté sans identifiant/i, dit: 'accepté par Meta, sans suivi possible' },
];

export function motifEnClair(e: Pick<EnvoiLu, 'statut' | 'detail' | 'codeMeta' | 'canal' | 'etat'>): string {
  if (e.statut === 'sans-numero') return 'pas de numéro sur la fiche';
  if (e.statut === 'sans-abonnement') return e.canal === 'push' ? 'pas d’application Ma Couronne' : 'personne à joindre';
  const detail = (e.detail ?? '').trim();
  if (e.codeMeta != null) {
    const parCode = MOTIFS.find((m) => m.codes.includes(Number(e.codeMeta)));
    if (parCode) return parCode.dit;
  }
  if (detail) {
    const parTexte = MOTIFS.find((m) => m.texte?.test(detail));
    if (parTexte) return parTexte.dit;
    return detail.length > 120 ? `${detail.slice(0, 117)}…` : detail;
  }
  return devenuDe(e) === 'echec' || devenuDe(e) === 'non-remis' ? 'motif non précisé par Meta' : '';
}

/* ── LE JOUR, À L'HEURE DU SALON ─────────────────────────────────────────
   `quand` est un instant UTC. À 00 h 30 à Cotonou, il est encore 23 h 30 la
   veille en UTC : lire la date brute rangerait l'envoi du matin dans hier. */
export const jourDuSalon = (iso: string, fuseau = 'Africa/Porto-Novo'): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-CA', { timeZone: fuseau });
};

/** Le jour « AAAA-MM-JJ » décalé de `n` jours. */
export const jourDecale = (jour: string, n: number): string => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type FiltreDuJournal = {
  jour: 'aujourdhui' | 'hier' | 'semaine';
  type: 'tout' | TypeDEnvoi;
  seulementARegarder: boolean;
};

/** Les envois d'une période, sans autre filtre : c'est sur eux que se font
    les comptes, pour qu'un filtre de type ne fasse pas mentir le total. */
export function envoisDeLaPeriode<T extends EnvoiLu>(envois: readonly T[], jour: FiltreDuJournal['jour'], aujourdhui: string): T[] {
  const depuis = jour === 'semaine' ? jourDecale(aujourdhui, -6) : jour === 'hier' ? jourDecale(aujourdhui, -1) : aujourdhui;
  const jusqua = jour === 'hier' ? jourDecale(aujourdhui, -1) : aujourdhui;
  return envois.filter((e) => {
    const j = jourDuSalon(e.quand);
    return !!j && j >= depuis && j <= jusqua;
  });
}

/** LES LIGNES MONTRÉES : la période, le type, les échecs si on le demande.
    Du plus récent au plus ancien. */
export function lignesDuJournal<T extends EnvoiLu>(envois: readonly T[], f: FiltreDuJournal, aujourdhui: string): T[] {
  return envoisDeLaPeriode(envois, f.jour, aujourdhui)
    .filter((e) => f.type === 'tout' || e.type === f.type)
    .filter((e) => !f.seulementARegarder || estARegarder(devenuDe(e)))
    .sort((a, b) => b.quand.localeCompare(a.quand));
}

export type CompteDuJournal = { partis: number; remis: number; lus: number; enRoute: number; aRegarder: number };

/** CE QU'UNE PÉRIODE COMPTE. « Partis » : ce que Meta a accepté, ou ce qui
    est parti à la main. Un message sans personne à joindre n'est pas parti. */
export function compteDuJournal(envois: readonly EnvoiLu[]): CompteDuJournal {
  const c: CompteDuJournal = { partis: 0, remis: 0, lus: 0, enRoute: 0, aRegarder: 0 };
  for (const e of envois) {
    const d = devenuDe(e);
    if (d === 'lu' || d === 'remis' || d === 'en-route' || d === 'non-remis' || d === 'a-la-main') c.partis += 1;
    if (d === 'lu' || d === 'remis') c.remis += 1;
    if (d === 'lu') c.lus += 1;
    if (d === 'en-route') c.enRoute += 1;
    if (estARegarder(d)) c.aRegarder += 1;
  }
  return c;
}

/* ── LE MESSAGE AUTOMATIQUE DANS LE FIL ──────────────────────────────────
   Les rappels s'y écrivent depuis le 11 septembre avec la signature « la
   Maison, automatiquement », les confirmations et les accusés depuis le 18
   avec « Le Trône ». Les deux se lisent de la même façon. */
export const estEnvoiAutomatique = (parQui?: string): boolean =>
  parQui === 'Le Trône' || /automatiquement/i.test(parQui ?? '');

/** Le nom d'un modèle Meta, dit en français dans le fil. */
const MODELE_DIT: Record<string, string> = {
  rappel_rdv: 'rappel de la veille',
  confirmation_rdv: 'confirmation',
  demande_recue: 'accusé de demande',
  avis_google: 'demande d’avis',
  bulletin_du_mois: 'bulletin de paie',
};
export const modeleDit = (nom: string): string => MODELE_DIT[nom] ?? nom;
