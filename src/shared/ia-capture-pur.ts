/* ══ LA CAPTURE QUI S'ENCAISSE — 19 octobre 2026 (chantier `capture`) ═════
   Maquette NKQMiMMY… validée par Yéman (« Tout me va »), ses choix lus en
   base (maquette/chantiers) :
     « Claude lit la capture (un transfert Mobile Money reçu sur WhatsApp :
       montant, jour et heure, référence, moyen, "Vers : MAISON MND"),
       retrouve ce que la cliente doit (rituel, facture, échéance) et vous
       propose l'encaissement tout prêt, dans la caisse MTN MoMoPay. Si le
       montant ne tombe sur rien, ou sur deux choses, il vous montre ce
       qu'elle doit et vous choisissez. La même lecture marche dans
       "Encaisser", en déposant la capture. Votre règle tient : un rituel
       passé ne reçoit jamais de reçu. »
   Sa décision : « Tout seul, pour une cliente qui doit de l'argent : chaque
   image reçue d'une cliente avec un reste à payer est lue ; "Captures à
   inscrire" apparaît dans À faire. Les autres images (photos de locks) ne
   sont pas lues. »

   CE QUE CLAUDE REND EST UNE PROPOSITION. La carte « Lu par Claude · à
   vérifier » montre quatre cases cuivrées modifiables (montant, jour,
   référence, moyen), la phrase du rapprochement, et trois boutons :
   « Inscrire au Carnet » (le chemin d'encaissement du Carnet, tel qu'il
   est), « Un autre rendez-vous », « Ce n'est pas un paiement ». Rien ne
   s'inscrit sans ce « oui ».

   CHEZ CLAUDE : jamais un nom entier, jamais un numéro, jamais un numéro de
   pièce. La consigne ne porte que « la cliente doit : 15 000 F sur son rituel
   du 18/10/2026 » ; la fonction `ia-maison` compte le budget, pas le Trône.

   MODULE PUR : la consigne, le schéma, la lecture (qui ne croit rien de ce
   que Claude rend), le rapprochement, le tri des images à lire, le verrou.
   `scripts/verifie-la-capture-qui-s-encaisse` rejoue tout, pannes comprises. */

import { CAISSE_MOMOPAY_MAISON, familleDuMoyen } from './caisses-des-caissiers-pur';
import type { ChantierIa, UsageIa } from './ia-maison-pur';

export const CHANTIER_CAPTURE: ChantierIa = 'capture';
export const USAGE_CAPTURE: UsageIa = 'image';
/** Le document synchronisé qui garde les lectures, par identifiant de message. */
export const CLE_DES_CAPTURES = 'mnd_ia_captures';
/** Une image reçue depuis plus de quatorze jours ne se lit plus : un vieux
    transfert s'est déjà réglé au comptoir, ou ne se réglera pas par là. */
export const JOURS_DE_LECTURE = 14;
/** Dix lectures par passage, pas plus : le budget est à la fonction, la
    retenue au Trône. */
export const LECTURES_MAX_PAR_PASSAGE = 10;
/** Le verrou doux entre deux Trônes ouverts : trois minutes, puis périmé. */
export const VERROU_MS = 3 * 60_000;
/** Un reste « égal » au montant lu : à deux pour cent près (ses mots). */
export const TOLERANCE_PCT = 2;
/** Au-delà, ce n'est pas un transfert de cliente : une lecture abîmée. */
export const MONTANT_MAX_XOF = 50_000_000;
/** Une capture d'un transfert de plus de quatorze mois ne tient pas. */
export const JOURS_DE_PASSE_MAX = 425;

/* ── LE MOYEN, ÉNUMÉRATION FERMÉE ─────────────────────────────────────── */
export const MOYENS_LUS = ['mtn', 'moov', 'celtiis', 'virement', 'autre'] as const;
export type MoyenLu = (typeof MOYENS_LUS)[number];
export const MOYEN_DIT: Record<MoyenLu, string> = {
  mtn: 'MTN MoMo', moov: 'Moov Money', celtiis: 'Celtiis Cash', virement: 'Virement bancaire', autre: 'Autre moyen',
};

/** Le moyen de SA liste (Paramètres) qui porte ce moyen lu : la famille
    `momo` pour MTN ; pour les autres, un nom qui se ressemble, sinon le nom
    par défaut de la Maison. */
export function methodeDuMoyenLu(moyen: MoyenLu, methods: readonly string[]): string {
  const plat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (moyen === 'mtn') return methods.find((m) => familleDuMoyen(m) === 'momo') ?? 'MTN MoMo';
  if (moyen === 'moov') return methods.find((m) => /moov/.test(plat(m))) ?? 'Moov';
  if (moyen === 'celtiis') return methods.find((m) => /celti/.test(plat(m))) ?? 'Celtis';
  if (moyen === 'virement') return methods.find((m) => /virement/.test(plat(m))) ?? 'Virement bancaire';
  return methods.find((m) => familleDuMoyen(m) === 'autre') ?? 'Autre';
}

/** LA CAISSE QUE SA DÉCISION IMPOSE : MTN MoMoPay va au compte MoMoPay de la
    Maison (code 909099). Moov, Celtiis, un virement : rien ne s'impose, on
    choisit (la règle des caissiers du 17-19 octobre 2026). */
export const caisseImposee = (moyen: MoyenLu): string | undefined =>
  (moyen === 'mtn' ? CAISSE_MOMOPAY_MAISON : undefined);

/* ── CE QU'ELLE DOIT ──────────────────────────────────────────────────── */
export type GenreDeDette = 'rituel' | 'facture' | 'echeance';
export type Dette = {
  genre: GenreDeDette;
  /** L'identifiant du rendez-vous, de la pièce, ou `abonnement#rang`. */
  id: string;
  resteXof: number;
  /** Le jour du rituel, de la pièce, de l'échéance (ISO). */
  jour: string;
  /** Un rendez-vous ou une échéance encore à venir : elle peut le régler
      d'avance, mais il ne fait pas d'elle une cliente « qui doit ». */
  aVenir: boolean;
};

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;
const jourValide = (iso: string): boolean => {
  if (!JOUR_ISO.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};
const joursEntre = (deIso: string, aIso: string): number =>
  Math.round((Date.parse(`${aIso}T12:00:00Z`) - Date.parse(`${deIso}T12:00:00Z`)) / 86_400_000);
const entier = (x: unknown): number | null => {
  const n = typeof x === 'string' ? Number(x.replace(/[\s ]/g, '')) : x;
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) ? n : null;
};

/** CE QUE LA CLIENTE DOIT, en trois genres. Les rendez-vous annulés ne
    doivent rien ; une pièce qui atteste un rituel déjà listé ne compte pas
    deux fois ; d'un échéancier, seule la prochaine échéance non soldée. */
export function dettesDeLaCliente<A extends { id: string; clientId: string; date: string; status: string; offertPar?: string },
  P extends { id: string; kind: string; status: string; clientId: string; forClientId?: string; apptId?: string; date: string },
  S extends { id: string; clientId?: string }>(o: {
  clientId: string;
  rdvs: readonly A[];
  resteDuRdv: (a: A) => number;
  pieces: readonly P[];
  resteDeLaPiece: (p: P) => number;
  abonnements: readonly S[];
  echeancesDe: (s: S) => { numero: number; dueIso: string; resteXof: number; soldee: boolean }[];
  aujourdhui: string;
}): Dette[] {
  const out: Dette[] = [];
  const rituels = new Set<string>();
  for (const a of o.rdvs) {
    if (a.status === 'annulé') continue;
    if (a.clientId !== o.clientId && a.offertPar !== o.clientId) continue;
    const reste = Math.max(0, Math.round(o.resteDuRdv(a)));
    if (reste <= 0) continue;
    rituels.add(a.id);
    out.push({ genre: 'rituel', id: a.id, resteXof: reste, jour: a.date, aVenir: a.date > o.aujourdhui });
  }
  for (const p of o.pieces) {
    if (p.kind !== 'facture' || p.status === 'payée') continue;
    if (p.clientId !== o.clientId && p.forClientId !== o.clientId) continue;
    if (p.apptId && rituels.has(p.apptId)) continue;
    const reste = Math.max(0, Math.round(o.resteDeLaPiece(p)));
    if (reste <= 0) continue;
    out.push({ genre: 'facture', id: p.id, resteXof: reste, jour: p.date, aVenir: false });
  }
  for (const s of o.abonnements) {
    if (s.clientId !== o.clientId) continue;
    const prochaine = o.echeancesDe(s).find((e) => !e.soldee && e.resteXof > 0);
    if (!prochaine) continue;
    out.push({ genre: 'echeance', id: `${s.id}#${prochaine.numero}`, resteXof: Math.round(prochaine.resteXof), jour: prochaine.dueIso, aVenir: prochaine.dueIso > o.aujourdhui });
  }
  /* Le passé d'abord, le plus récent en tête ; l'avenir ensuite. */
  return out.sort((x, y) => Number(x.aVenir) - Number(y.aVenir) || (x.aVenir ? x.jour.localeCompare(y.jour) : y.jour.localeCompare(x.jour)));
}

/** Une cliente « qui doit » : au moins une dette qui n'est pas à venir. */
export const aUnResteDu = (dettes: readonly Dette[]): boolean => dettes.some((d) => !d.aVenir && d.resteXof > 0);

/* ── LA CONSIGNE ET LE SCHÉMA ─────────────────────────────────────────── */
const GENRE_DIT: Record<GenreDeDette, string> = { rituel: 'son rituel', facture: 'sa facture', echeance: 'son échéance' };
/** « 18/10/2026 » : le jour dit à Claude, l'année toujours. */
export const jourPourClaude = (iso: string): string => (JOUR_ISO.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
/** « 15 000 F », sans monnaie codée ailleurs : des francs CFA. */
export const francsPourClaude = (xof: number): string => `${Math.max(0, Math.round(xof)).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;

/** CE QU'ELLE DOIT, DIT À CLAUDE : montant, genre, jour. Jamais un nom,
    jamais un numéro de pièce, jamais un numéro de téléphone. */
export const dettesDites = (dettes: readonly Dette[]): string[] =>
  dettes.map((d) => `${francsPourClaude(d.resteXof)} sur ${GENRE_DIT[d.genre]} du ${jourPourClaude(d.jour)}`);

export function consigneDeLaCapture(o: { dettes: readonly Dette[]; aujourdhui: string }): string {
  const dues = dettesDites(o.dettes);
  return [
    'Tu lis, pour la Maison MND (soins de locks, Cotonou, Bénin), la capture d’écran d’un transfert d’argent qu’une cliente a envoyée sur WhatsApp : un reçu MTN Mobile Money (MoMo, MoMoPay), Moov Money, Celtiis Cash, ou un virement bancaire.',
    'Tu rends EXACTEMENT ce que la capture montre, rien de deviné. Ce que tu ne lis pas, tu le laisses vide. Tu n’inventes jamais un montant, une date ni une référence.',
    `Aujourd’hui : ${jourPourClaude(o.aujourdhui)}.`,
    'Le montant : en francs CFA, nombre entier, sans frais ajoutés (le montant transféré, pas le total avec frais si les deux figurent).',
    'Le jour du transfert : au format AAAA-MM-JJ, AVEC l’année. Si la capture ne montre pas l’année, prends celle d’aujourd’hui, ou l’année d’avant si ce jour n’est pas encore passé cette année. Un transfert ne vient jamais du futur.',
    'L’heure : HH:MM si elle figure. La référence : l’identifiant de la transaction, tel quel, s’il figure.',
    'Le moyen : « mtn » (MTN, MoMo, MoMoPay), « moov », « celtiis », « virement » (une banque), sinon « autre ».',
    'Le bénéficiaire : le nom affiché après « Vers », « À », « Destinataire » ou « Marchand » (la Maison attend « MAISON MND » ou son code marchand), tel quel.',
    'Si l’image n’est pas un transfert d’argent (une photo de locks, un visage, une conversation, un document), dis « estUnPaiement : false » et ne remplis rien d’autre.',
    dues.length
      ? `Pour t’aider à lire le montant, la cliente doit : ${dues.join(' ; ')}. Tu ne corriges jamais le montant lu pour qu’il colle à ce qu’elle doit : tu rends ce que l’image montre.`
      : 'La Maison ne connaît aucune dette pour cette cliente : tu rends ce que l’image montre.',
    'Ta confiance, de 0 à 1, dit si l’image est nette et complète. Tu ne mentionnes jamais le mot « salon ».',
  ].join('\n');
}

/** LE MESSAGE QUI ACCOMPAGNE L'IMAGE, toujours le même. */
export const MESSAGE_DE_LA_CAPTURE = 'Voici la capture. Lis-la et remplis la fiche.';

/** LA FORME ATTENDUE : la fonction la donne à Claude comme un outil. */
export const SCHEMA_DE_LA_CAPTURE: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    estUnPaiement: { type: 'boolean', description: 'Vrai si l’image est le reçu d’un transfert d’argent.' },
    montantXof: { type: 'integer', minimum: 0, description: 'Le montant transféré, en francs CFA entiers, sans les frais.' },
    jour: { type: 'string', description: 'Le jour du transfert, AAAA-MM-JJ, avec l’année.' },
    heure: { type: 'string', description: 'L’heure, HH:MM, ou vide.' },
    reference: { type: 'string', description: 'L’identifiant de la transaction, tel quel, ou vide.' },
    moyen: { type: 'string', enum: [...MOYENS_LUS] },
    beneficiaire: { type: 'string', description: 'Le nom du bénéficiaire tel qu’il figure, ou vide.' },
    confiance: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['estUnPaiement', 'montantXof', 'jour', 'moyen', 'confiance'],
};

/* ── LA LECTURE, REVALIDÉE ────────────────────────────────────────────── */
export type LectureDeLaCapture =
  | {
    estUnPaiement: true;
    montantXof: number;
    jour: string;
    heure?: string;
    reference?: string;
    moyen: MoyenLu;
    beneficiaire?: string;
    confiance: number;
  }
  | { estUnPaiement: false; confiance: number };

const confianceDe = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const texteCourt = (x: unknown, max: number, permis: RegExp): string | undefined => {
  if (typeof x !== 'string') return undefined;
  const t = x.replace(/\s+/g, ' ').trim();
  return t && t.length <= max && permis.test(t) ? t : undefined;
};

/** ON NE CROIT RIEN DE CE QUE CLAUDE REND. `null` : la lecture ne tient pas
    (montant négatif ou non entier, jour sans année, jour à venir ou trop
    vieux, moyen hors de l'énumération). Un « pas un paiement » tient tel quel. */
export function lectureDeLaCapture(brut: unknown, aujourdhui: string): LectureDeLaCapture | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const b = brut as Record<string, unknown>;
  if (typeof b.estUnPaiement !== 'boolean') return null;
  const confiance = confianceDe(b.confiance);
  if (!b.estUnPaiement) return { estUnPaiement: false, confiance };
  const montant = entier(b.montantXof);
  if (montant === null || montant <= 0 || montant > MONTANT_MAX_XOF) return null;
  const jour = typeof b.jour === 'string' ? b.jour.trim() : '';
  if (!jourValide(jour) || !jourValide(aujourdhui)) return null;
  const ecart = joursEntre(jour, aujourdhui);
  if (ecart < 0 || ecart > JOURS_DE_PASSE_MAX) return null;
  if (!MOYENS_LUS.includes(b.moyen as MoyenLu)) return null;
  const heureBrute = typeof b.heure === 'string' ? b.heure.trim().replace(/\s*h\s*/i, ':') : '';
  const h = /^(\d{1,2}):(\d{2})$/.exec(heureBrute);
  const heure = h && Number(h[1]) < 24 && Number(h[2]) < 60 ? `${h[1].padStart(2, '0')}:${h[2]}` : undefined;
  const reference = texteCourt(b.reference, 40, /^[A-Za-z0-9 ._\-/#]+$/);
  const beneficiaire = texteCourt(b.beneficiaire, 60, /^[^\n<>{}]+$/);
  return {
    estUnPaiement: true, montantXof: montant, jour, moyen: b.moyen as MoyenLu, confiance,
    ...(heure ? { heure } : {}), ...(reference ? { reference } : {}), ...(beneficiaire ? { beneficiaire } : {}),
  };
}

/* ── LE RAPPROCHEMENT ────────────────────────────────────────────────── */
export type Rapprochement =
  | { verdict: 'un'; dette: Dette }
  | { verdict: 'plusieurs'; dettes: Dette[] }
  | { verdict: 'aucun'; dettes: Dette[] };

/** « Égal » : au franc, ou à deux pour cent du reste. */
export const resteEgal = (resteXof: number, montantXof: number, tolerancePct = TOLERANCE_PCT): boolean =>
  Math.abs(resteXof - montantXof) <= Math.max(0, Math.round((resteXof * tolerancePct) / 100));

/** UN, PLUSIEURS, AUCUN. L'égalité au franc prime sur l'approximation : un
    reste exactement égal désigne sa dette même si une autre est à deux pour
    cent. Sans candidate, toutes les dettes se montrent et on choisit. */
export function rapprochement(montantXof: number, dettes: readonly Dette[], tolerancePct = TOLERANCE_PCT): Rapprochement {
  const m = Math.max(0, Math.round(montantXof));
  if (m <= 0) return { verdict: 'aucun', dettes: [...dettes] };
  const exactes = dettes.filter((d) => d.resteXof === m);
  const proches = exactes.length ? exactes : dettes.filter((d) => resteEgal(d.resteXof, m, tolerancePct));
  if (proches.length === 1) return { verdict: 'un', dette: proches[0] };
  if (proches.length > 1) return { verdict: 'plusieurs', dettes: proches };
  return { verdict: 'aucun', dettes: [...dettes] };
}

/** « C'est le rituel de Clarisse D. du 18 octobre 2026 : reste 15 000 F ».
    `qui` : prénom et initiale ; `jour` écrit l'année (toujours). */
export function phraseDuRapprochement(r: Rapprochement, o: { qui: string; argent: (xof: number) => string; jour: (iso: string) => string }): string {
  const genre = (d: Dette) => (d.genre === 'rituel' ? 'le rituel' : d.genre === 'facture' ? 'la facture' : 'l’échéance');
  if (r.verdict === 'un') return `C’est ${genre(r.dette)} de ${o.qui} du ${o.jour(r.dette.jour)} : reste ${o.argent(r.dette.resteXof)}.`;
  if (r.verdict === 'plusieurs') return `Ce montant tombe sur ${r.dettes.length} choses que ${o.qui} doit : choisissez.`;
  return r.dettes.length
    ? `Ce montant ne tombe sur rien de ce que ${o.qui} doit (${r.dettes.length}) : choisissez, ou écartez.`
    : `${o.qui} ne doit rien que la Maison connaisse : choisissez un rendez-vous, ou écartez.`;
}

/* ── LE DOCUMENT DES CAPTURES ─────────────────────────────────────────── */
export type StatutDeCapture = 'en-cours' | 'a-verifier' | 'inscrite' | 'ecartee';
export type CaptureLue = {
  /** L'identifiant du message WhatsApp qui porte l'image. */
  id: string;
  numero: string;
  clientId: string;
  statut: StatutDeCapture;
  /** Le verrou doux : l'instant où un Trône a commencé à lire. */
  enCours?: string;
  luLe?: string;
  lecture?: LectureDeLaCapture;
  /** La lecture telle que Claude l'a rendue, avant toute correction à la main. */
  lectureBrute?: LectureDeLaCapture;
  rapprochement?: Rapprochement;
  /** Pourquoi elle est écartée : par la main, pas un paiement, illisible, Claude muet. */
  motif?: 'main' | 'pas-un-paiement' | 'illisible' | 'claude';
  detail?: string;
  inscriteLe?: string;
  ecarteeLe?: string;
  /** Le rendez-vous sur lequel l'argent a été inscrit. */
  apptId?: string;
  coutUsd?: number;
};
export type Captures = Record<string, CaptureLue>;

/** Le verrou tient tant qu'il n'a pas trois minutes. */
export const verrouTient = (c: Pick<CaptureLue, 'statut' | 'enCours'> | undefined, maintenant: number): boolean =>
  !!c && c.statut === 'en-cours' && !!c.enCours && Number.isFinite(Date.parse(c.enCours)) && maintenant - Date.parse(c.enCours) < VERROU_MS;

/** Ce que l'écran compte : les lectures qui attendent un oui. */
export const capturesAInscrire = (captures: Captures): CaptureLue[] =>
  Object.values(captures).filter((c) => c.statut === 'a-verifier');

export type MessageImage = {
  id: string;
  sens: string;
  numero: string;
  clientId?: string;
  quand: string;
  piece?: { type: string; coffre?: string; chemin?: string; tropLourde?: boolean };
};

/** LES IMAGES À LIRE, DANS L'ORDRE : entrantes, une image rangée dans un
    coffre, de moins de quatorze jours, d'une cliente connue qui doit de
    l'argent, jamais lue ni en cours de lecture ailleurs, dix au plus, les
    plus récentes d'abord. Les photos de locks d'une cliente qui ne doit rien
    ne sont jamais lues. */
export function imagesALire(o: {
  messages: readonly MessageImage[];
  captures: Captures;
  clientIdDuNumero: (numero: string) => string | undefined;
  doitDeLArgent: (clientId: string) => boolean;
  maintenant: number;
  max?: number;
}): (MessageImage & { clientId: string })[] {
  const limite = o.maintenant - JOURS_DE_LECTURE * 86_400_000;
  const out: (MessageImage & { clientId: string })[] = [];
  const tries = [...o.messages].sort((a, b) => b.quand.localeCompare(a.quand));
  for (const m of tries) {
    if (m.sens !== 'entrant' || !m.piece) continue;
    if (!m.piece.type?.startsWith('image/') || !m.piece.coffre || !m.piece.chemin || m.piece.tropLourde) continue;
    const t = Date.parse(m.quand);
    if (!Number.isFinite(t) || t < limite) continue;
    const deja = o.captures[m.id];
    if (deja && (deja.statut !== 'en-cours' || verrouTient(deja, o.maintenant))) continue;
    const clientId = m.clientId ?? o.clientIdDuNumero(m.numero);
    if (!clientId || !o.doitDeLArgent(clientId)) continue;
    out.push({ ...m, clientId });
    if (out.length >= (o.max ?? LECTURES_MAX_PAR_PASSAGE)) break;
  }
  return out;
}

/** La capture après la réponse de Claude : à vérifier si c'est un paiement
    lisible, écartée sinon (pas un paiement, illisible). */
export function captureApresLecture(
  avant: CaptureLue,
  brut: unknown,
  o: { dettes: readonly Dette[]; aujourdhui: string; maintenant: string; coutUsd?: number },
): CaptureLue {
  const lecture = lectureDeLaCapture(brut, o.aujourdhui);
  const base = { ...avant, enCours: undefined, luLe: o.maintenant, ...(o.coutUsd !== undefined ? { coutUsd: o.coutUsd } : {}) };
  if (!lecture) return { ...base, statut: 'ecartee', motif: 'illisible', ecarteeLe: o.maintenant };
  if (!lecture.estUnPaiement) return { ...base, statut: 'ecartee', motif: 'pas-un-paiement', lecture, lectureBrute: lecture, ecarteeLe: o.maintenant };
  return { ...base, statut: 'a-verifier', lecture, lectureBrute: lecture, rapprochement: rapprochement(lecture.montantXof, o.dettes) };
}
