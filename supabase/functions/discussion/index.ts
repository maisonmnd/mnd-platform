// discussion - le chat du site maisonmnd.com, cote serveur.
//
// LA PREMIERE LIGNE EST VOLONTAIREMENT PAUVRE, comme celles de
// whatsapp-webhook et de whatsapp-automate : un fichier qu on colle a la
// main dans un navigateur doit commencer par quelque chose qui survit a un
// collage de travers. Le decor vient apres.

/* ═══════════════════════════════════════════════════════════════════════
   DISCUSSION · le chat du site · 19 octobre 2026

   Maquette BPWmpyyw… validée (« construis »). La visiteuse écrit dans la
   bulle du site ; l'équipe répond depuis le Trône (écran Discussions) ;
   quand personne n'a pris la permanence, Claude répond seul (adresse,
   heures, réserver en ligne ; jamais un prix ni une place promise) et dit
   que l'équipe reprendra sur WhatsApp. Les règles vivent dans
   `src/shared/chat-du-site-pur.ts`, recopiées ici entre leurs repères.

   CINQ GESTES, tous en POST JSON :
     · { action: 'etat' }                       → { enLigne }
     · { action: 'ouvrir', civilite, prenom, nom, telephone, page }
                                                → { id, jeton, appel, enLigne }
     · { action: 'ecrire', id, jeton, texte, apres }
                                                → { messages, enLigne }
     · { action: 'lire', id, jeton, apres }     → { messages, enLigne, etat }
   Le JETON est la seule clé d'une discussion : la fonction le donne une
   fois, n'en garde que l'empreinte, et refuse tout geste qui ne le porte
   pas. Une adresse GET rend la version (405), pour ne jamais chercher une
   panne dans un fichier qui n'est pas celui qu'on croit déployé.

   Déployez via le tableau de bord (Edge Functions → New function, nom
   « discussion », coller ce fichier EN ENTIER), Verify JWT ÉTEINT (le site
   n'a pas de compte). Secrets : ceux qui existent déjà (SERVICE_KEY ou
   CLE_SERVICE, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT,
   ANTHROPIC_API_KEY). Migration : 0136_les_discussions_du_site.sql. */
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@maison-mnd.bj';
const ANTHROPIC_API_KEY = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();
/* Claude d'abord dans sa version rapide et sûre ; le petit modèle prend le
   relais si le premier n'est pas ouvert à la clé. */
const MODELES = ['claude-sonnet-5-5', 'claude-haiku-5-5'];

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const VERSION = '2026-10-28-a · M. et Mme devant le prénom';

function enTacheDeFond(p: Promise<unknown>): void {
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  try { er?.waitUntil?.(p); } catch { /* sans tâche de fond */ }
  p.catch((e) => console.error('discussion: tâche de fond', String(e)));
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ipOf = (req: Request): string =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

/* La limite de débit, la même table que les demandes du site (0007), un
   seau par geste. Dix minutes de fenêtre. */
async function allowRate(ip: string, seau: string, plafond: number): Promise<boolean> {
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error } = await admin
    .from('edge_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('bucket', seau).eq('ip', ip).gte('at', since);
  if (error) return true; // table absente : ne pas bloquer
  if ((count ?? 0) >= plafond) return false;
  await admin.from('edge_rate_limits').insert({ bucket: seau, ip });
  return true;
}

/* Le téléphone, en E.164 : la même règle que demande-submit et le Trône. */
function telephoneNormalise(brut: string, dial = '+229'): string {
  const t = String(brut ?? '').trim();
  const international = t.startsWith('+') || t.startsWith('00');
  const chiffres = t.replace(/\D/g, '').replace(/^00/, '');
  if (chiffres.length < 8) return '';
  if (international) return chiffres.length >= 10 ? `+${chiffres}` : '';
  const indicatif = dial.replace(/\D/g, '');
  if (chiffres.length > 10 && chiffres.startsWith(indicatif)) return `+${chiffres}`;
  if (indicatif === '229' && chiffres.length === 8) return `+22901${chiffres}`;
  return `+${indicatif}${indicatif === '229' ? chiffres : chiffres.replace(/^0/, '')}`;
}

/* COMMENT LA MAISON S'ADRESSE À ELLE : « Madame Naffi ». Recopié de
   `src/shared/civilite.ts` (une fonction Edge ne lit rien du dépôt) ;
   `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : '';
  const prenom = String(d?.name ?? repli ?? '').trim().split(/\s+/)[0] ?? '';
  /* La civilité inconnue ne se suppose plus (13 octobre 2026) : le prénom seul. */
  if (!civ) return prenom || 'Madame, Monsieur';
  /* Abrégée devant le prénom (28 octobre 2026) : « M. Jean-Luc », « Mme Shadé » ; seule, en entier. */
  if (prenom) return `${civ === 'monsieur' ? 'M.' : civ === 'mademoiselle' ? 'Mlle' : 'Mme'} ${prenom}`;
  return civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
};

/* LES RÈGLES DU CHAT, RECOPIÉES de `src/shared/chat-du-site-pur.ts`.
   NE RIEN RETOUCHER ENTRE LES REPÈRES : on corrige l'original, puis on
   recopie le bloc entier ; `verifie-les-douze-lunes` (R8) confronte les deux. */
/* ⟨chat-du-site⟩ */
/** 90 jours (sa décision), comptés depuis le dernier message. */
export const GARDE_DES_DISCUSSIONS_JOURS = 90;
/** Personne ne répond en 3 minutes (sa décision) : le chat le dit. */
export const ATTENTE_AVANT_WHATSAPP_MIN = 3;
/** Un message, pas une lettre. */
export const LONGUEUR_MAX_DU_MESSAGE = 1000;
/** Claude répond au plus quatre fois dans une discussion ; ensuite, la main
    est à l'équipe. Une conversation qui tourne en rond avec un automate
    agace plus qu'un « on vous répond sur WhatsApp ». */
export const REPONSES_AUTO_MAX = 4;
/** La permanence prise au Trône dure une journée de travail, au plus, et
    jamais au-delà de 20 h à Cotonou : les heures calmes de la Maison (les
    envois se taisent de 20 h à 8 h). Sans cette borne, prise à 16 h, elle
    disait « En ligne » jusqu'à minuit. */
export const PERMANENCE_HEURES = 8;
export const FIN_DE_JOURNEE_H = 20;
/** Les demandes de lecture d'une visiteuse : le cadran le plus court. */
export const LECTURE_RAPIDE_MS = 4000;
export const LECTURE_LENTE_MS = 12000;

export type AuteurDuMessage = 'visiteuse' | 'maison' | 'auto' | 'systeme';
export type MessageDuChat = { id: number; de: AuteurDuMessage; texte: string; cree_le: string; genre?: string };
export type Permanence = { user_id: string; jusqua: string };

/** Le texte d'un message : sans blancs en trop, borné. Vide : rien à envoyer. */
export function texteDuMessage(brut: unknown): string {
  const t = String(brut ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t.slice(0, LONGUEUR_MAX_DU_MESSAGE);
}

/** Le numéro tel qu'on le dit : « 01 97 00 00 00 » pour un numéro du Bénin,
    l'indicatif gardé pour un numéro d'ailleurs. */
export function numeroDit(e164: string): string {
  const c = String(e164 ?? '').replace(/\D/g, '');
  if (c.startsWith('229') && c.length === 13) return c.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ');
  return c ? `+${c}` : '';
}

/** Qui est de permanence, maintenant. */
export const enPermanence = (rangs: readonly Permanence[], maintenantMs: number): Permanence[] =>
  rangs.filter((p) => Number.isFinite(Date.parse(p.jusqua)) && Date.parse(p.jusqua) > maintenantMs);

/** La fin d'une permanence prise maintenant : huit heures, bornées à 20 h
    (Cotonou, UTC+1, sans heure d'été). Prise hors de la journée (avant 8 h,
    ou après 19 h 30), elle dure deux heures : qui la prend la nuit le fait
    exprès, mais ne la tient pas jusqu'au matin. */
export function finDePermanence(maintenantMs: number): string {
  const decalage = 3_600_000;
  const local = new Date(maintenantMs + decalage);
  const vingtHeures = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), FIN_DE_JOURNEE_H) - decalage;
  const fin = Math.min(maintenantMs + PERMANENCE_HEURES * 3_600_000, vingtHeures);
  const deNuit = local.getUTCHours() < 8 || fin - maintenantMs < 30 * 60_000;
  return new Date(deNuit ? maintenantMs + 2 * 3_600_000 : fin).toISOString();
}

/** QUI PEUT RÉPONDRE (sa décision : la direction et le département
    Clientèle). La même porte que la barre du Trône pour l'écran
    Discussions : un rôle qui n'est pas « maître » voit tout ; un maître,
    s'il a le département Clientèle ou l'écran lui-même. */
export const peutRepondre = (role: string | undefined, acces: Record<string, boolean> | undefined): boolean =>
  !!role && (role !== 'maitre' || acces?.['dept-clientele'] === true || acces?.['/discussions'] === true);

/** Le mot quand personne n'est de permanence et que Claude ne répond pas. */
export const motHorsPermanence = (telephone: string): string =>
  `Message reçu. Personne n'est disponible à l'instant : nous vous répondons sur WhatsApp${numeroDit(telephone) ? ` au ${numeroDit(telephone)}` : ''} dès que possible.`;

/** Le mot quand la permanence n'a pas répondu à temps. */
export const motDAttente = (telephone: string): string =>
  `Personne n'a pu vous répondre tout de suite : nous vous répondons sur WhatsApp${numeroDit(telephone) ? ` au ${numeroDit(telephone)}` : ''} dès que possible.`;

/** LE SILENCE A-T-IL DURÉ ? Le dernier message de la visiteuse attend
    depuis plus de 3 minutes, et rien ne lui a répondu depuis : ni la
    Maison, ni Claude, ni un mot du chat. */
export function attenteDepassee(messages: readonly Pick<MessageDuChat, 'de' | 'cree_le'>[], maintenantMs: number): boolean {
  const dernier = messages[messages.length - 1];
  if (!dernier || dernier.de !== 'visiteuse') return false;
  const t = Date.parse(dernier.cree_le);
  return Number.isFinite(t) && maintenantMs - t >= ATTENTE_AVANT_WHATSAPP_MIN * 60_000;
}

/** Combien de fois Claude a déjà répondu dans cette discussion. */
export const reponsesAuto = (messages: readonly Pick<MessageDuChat, 'de'>[]): number =>
  messages.filter((m) => m.de === 'auto').length;

/** L'instant avant lequel une discussion s'efface. */
export const limiteDesDiscussions = (maintenantMs: number): number =>
  maintenantMs - GARDE_DES_DISCUSSIONS_JOURS * 86_400_000;

/* ── CE QUE CLAUDE SAIT, ET CE QU'IL NE DIT JAMAIS ─────────────────────── */
type JourDeLaSemaine = { key?: string; open?: string; close?: string; closed?: boolean };
const NOMS_DES_JOURS: Record<string, string> = {
  lun: 'lundi', mar: 'mardi', mer: 'mercredi', jeu: 'jeudi', ven: 'vendredi', sam: 'samedi', dim: 'dimanche',
};
const ORDRE_DES_JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const heureDite = (h: string): string => {
  const m = /^(\d{1,2})\s*[h:]\s*(\d{2})?$/i.exec(String(h ?? '').trim());
  return m ? `${m[1].padStart(2, '0')}h${m[2] ?? '00'}` : '';
};

/** LES HEURES DE LA MAISON, en lignes (la semaine réglée au Trône,
    `mnd_settings.hours`). Les jours qui se suivent avec la même fenêtre se
    disent ensemble. Semaine inconnue : rien, et Claude n'invente pas. */
export function heuresPourClaude(semaine: unknown): string[] {
  if (!Array.isArray(semaine) || !semaine.length) return [];
  const fenetre = (clef: string): string => {
    const j = (semaine as JourDeLaSemaine[]).find((h) => h?.key === clef);
    const o = heureDite(j?.open ?? '');
    const f = heureDite(j?.close ?? '');
    return !j || j.closed || !o || !f ? 'fermé' : `${o} à ${f}`;
  };
  const groupes: { de: string; a: string; texte: string }[] = [];
  for (const clef of ORDRE_DES_JOURS) {
    const texte = fenetre(clef);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.texte === texte) dernier.a = clef;
    else groupes.push({ de: clef, a: clef, texte });
  }
  return groupes.map((g) => `${g.de === g.a ? NOMS_DES_JOURS[g.de] : `du ${NOMS_DES_JOURS[g.de]} au ${NOMS_DES_JOURS[g.a]}`} : ${g.texte}`);
}

/** La consigne de Claude. Il parle AU NOM de la Maison, dit qu'il est une
    réponse automatique, et ne fait que ce qu'on peut faire sans l'équipe.
    Son numéro ne lui est JAMAIS donné (la page Confidentialité le promet) :
    il sait seulement comment la Maison l'appelle. */
export function consigneDeClaude(o: { appel: string; heures: readonly string[]; maintenant: string }): string {
  const heures = o.heures.length ? o.heures.map((h) => `- ${h}`).join('\n') : '- (non communiquées : ne donne aucune heure)';
  return [
    'Tu es la réponse automatique de la Maison MND, une maison de soin des locks à Cotonou (Bénin), sur le chat de son site maisonmnd.com.',
    'Personne de l’équipe n’est disponible en ce moment. Tu réponds à la place, brièvement, puis tu passes la main.',
    '',
    `La personne qui écrit : ${o.appel}. Adresse-toi à elle ainsi, sans inventer de nom ni de civilité.`,
    `Instant présent à Cotonou : ${o.maintenant}.`,
    '',
    'Ce que tu sais, et rien d’autre :',
    '- La Maison MND crée, entretient et répare les locks (dreadlocks, microlocks), avec des soins du cuir chevelu ; l’Académie MND forme au métier.',
    '- Adresse : Ilot 130-F, Maison 88, Portail Marron, quartier Suru-Léré, Cotonou.',
    '- Téléphone et WhatsApp : 01 51 99 77 99.',
    '- Réserver en ligne, en trois pas : https://maisonmnd.com/reserver/ (une création ou une réparation commence par une consultation).',
    '- Heures d’ouverture :',
    heures,
    '',
    'Règles absolues :',
    '- Ne donne JAMAIS de prix, de tarif ni de montant, même approximatif. Dis que l’équipe le précise selon ses cheveux, ou renvoie à la réservation en ligne.',
    '- Ne promets JAMAIS une place, une heure ni une disponibilité. Renvoie à la réservation en ligne, qui montre les vraies places.',
    '- Ne donne aucun avis médical ni aucun diagnostic de cheveux à distance.',
    '- N’invente rien. Ce que tu ne sais pas, dis-le simplement, et passe la main.',
    '- Termine en disant qu’une personne de l’équipe lui répondra sur WhatsApp, au numéro qu’elle a donné, dès son retour.',
    '- Dans ta toute première réponse, dis que tu es la réponse automatique de la Maison.',
    '- Réponds en français (ou dans la langue de la personne), en trois phrases courtes au plus, sans liste, sans titre, sans émoji, sans tiret long.',
    '- N’emploie jamais le mot « salon » : on dit « la Maison ».',
  ].join('\n');
}

/** Les messages pour Claude : la visiteuse parle (`user`), la Maison et la
    réponse automatique répondent (`assistant`) ; les mots du chat ne
    comptent pas. Deux tours de suite du même côté se fondent en un, et le
    premier tour est toujours celui de la visiteuse. */
export function messagesPourClaude(messages: readonly Pick<MessageDuChat, 'de' | 'texte'>[]): { role: 'user' | 'assistant'; content: string }[] {
  const tours: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages) {
    if (m.de === 'systeme') continue;
    const role = m.de === 'visiteuse' ? 'user' : 'assistant';
    const dernier = tours[tours.length - 1];
    if (dernier && dernier.role === role) dernier.content += `\n${m.texte}`;
    else tours.push({ role, content: m.texte });
  }
  while (tours.length && tours[0].role !== 'user') tours.shift();
  return tours.slice(-12);
}

/** CE QUE CLAUDE A ÉCRIT, AVANT QU'ELLE LE LISE. Un montant (« 15 000 F »,
    « 20000 francs », « 10 000 FCFA ») ou le mot « salon » : la réponse ne
    part pas, le mot du chat la remplace. Le tiret long devient une virgule
    (la Maison ne l'écrit pas). Vide : rien de sûr à envoyer. */
export function reponseSure(texte: unknown): string {
  let t = String(texte ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\*\*/g, '').trim();
  if (!t) return '';
  if (/\d[\d\s.,]*\s*(f\b|f\.|fcfa|cfa|xof|francs?\b)/i.test(t)) return '';
  if (/\bsalons?\b/i.test(t)) return '';
  if (t.length > 700) t = `${t.slice(0, 700).replace(/\s+\S*$/, '')}…`;
  return t;
}
/* ⟨/chat-du-site⟩ */

/* ══ LE CHAT, SANS BASE NI RÉSEAU ═══════════════════════════════════════
   Tout ce qui suit jusqu'au repère de fin reçoit ses outils (la base, la
   montre, Claude, l'alerte) au lieu de les prendre : `verifie-le-chat-du-
   site` le rejoue sur une fausse base. */
// ── DEBUT discussion
type LigneDiscussion = {
  id: string; branch_id?: string | null; jeton_hash: string; civilite?: string | null; prenom?: string | null; nom?: string | null;
  telephone?: string | null; page?: string | null; etat: string; dernier_de?: string | null; derniere_le?: string; alerte_le?: string | null; cree_le?: string;
};
type BaseDuChat = {
  permanences(): Promise<Permanence[]>;
  creeDiscussion(d: LigneDiscussion): Promise<boolean>;
  discussion(id: string): Promise<LigneDiscussion | null>;
  messages(id: string, apres: number): Promise<MessageDuChat[]>;
  derniersMessages(id: string, n: number): Promise<MessageDuChat[]>;
  ecris(id: string, de: AuteurDuMessage, texte: string, genre?: string): Promise<MessageDuChat | null>;
  touche(id: string, champs: Record<string, unknown>): Promise<void>;
  heures(): Promise<unknown>;
  efface(limiteIso: string): Promise<void>;
};
type OutilsDuChat = {
  base: BaseDuChat;
  maintenant: () => number;
  empreinte: (jeton: string) => Promise<string>;
  jeton: () => string;
  nouvelId: () => string;
  alerte: (o: { titre: string; corps: string; discussionId: string; seulement?: string[] }) => Promise<number>;
  claude: (systeme: string, messages: { role: 'user' | 'assistant'; content: string }[]) => Promise<string>;
  fond: (p: Promise<unknown>) => void;
};
type Reponse = [number, Record<string, unknown>];

const isoDe = (ms: number): string => new Date(ms).toISOString();
const court = (v: unknown, n: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const entier = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));
const extrait = (t: string): string => (t.length > 80 ? `${t.slice(0, 80)}…` : t);
const CIVILITES_DU_CHAT = ['madame', 'mademoiselle', 'monsieur'];

/** Comparer deux empreintes sans dire, par le temps mis, où elles diffèrent. */
function egalesATempsConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

/** Comment la Maison l'appelle, d'après ce qu'elle a donné. */
const appelDuChat = (d: Pick<LigneDiscussion, 'civilite' | 'prenom' | 'nom'>): string =>
  appelDe(d.civilite ? { name: d.prenom || d.nom || '', civilite: d.civilite } : null, d.prenom || d.nom || '');

/** Un mot du chat de ce genre a-t-il déjà été dit depuis la dernière
    réponse de l'équipe ? On ne le répète pas. */
const dejaDit = (fil: readonly MessageDuChat[], genre: string): boolean => {
  let i = fil.length - 1;
  while (i >= 0 && fil[i].de !== 'maison') i -= 1;
  return fil.slice(i + 1).some((m) => m.de === 'systeme' && m.genre === genre);
};

/** L'instant présent, dit à Cotonou. */
const ditMaintenant = (ms: number): string => {
  try {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Porto-Novo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
  } catch { return isoDe(ms); }
};

async function etatDuChat(o: OutilsDuChat): Promise<Reponse> {
  return [200, { ok: true, enLigne: enPermanence(await o.base.permanences(), o.maintenant()).length > 0 }];
}

async function ouvrir(o: OutilsDuChat, body: Record<string, unknown>, branchId: string): Promise<Reponse> {
  const telephone = telephoneNormalise(String(body.telephone ?? ''), String(body.dial ?? '+229'));
  if (!telephone) return [400, { error: 'telephone' }];
  const prenom = court(body.prenom, 60);
  const nom = court(body.nom, 60);
  if (!prenom && !nom) return [400, { error: 'nom' }];
  const c = String(body.civilite ?? '');
  const civilite = CIVILITES_DU_CHAT.includes(c) ? c : null;
  const jeton = o.jeton();
  const id = o.nouvelId();
  const maintenant = o.maintenant();
  const ligne: LigneDiscussion = {
    id, branch_id: branchId || null, jeton_hash: await o.empreinte(jeton), civilite,
    prenom: prenom || null, nom: nom || null, telephone, page: court(body.page, 120) || null,
    etat: 'ouverte', derniere_le: isoDe(maintenant), cree_le: isoDe(maintenant),
  };
  if (!(await o.base.creeDiscussion(ligne))) return [500, { error: 'insert_failed' }];
  /* 90 jours (sa décision) : les vieilles discussions partent, en passant. */
  o.fond(o.base.efface(isoDe(limiteDesDiscussions(maintenant))));
  const presents = enPermanence(await o.base.permanences(), maintenant);
  return [200, { ok: true, id, jeton, appel: appelDuChat(ligne), enLigne: presents.length > 0 }];
}

/** La porte : la discussion, seulement avec SON jeton. */
async function ouvreLaPorte(o: OutilsDuChat, body: Record<string, unknown>): Promise<LigneDiscussion | null> {
  const id = String(body.id ?? '');
  const jeton = String(body.jeton ?? '');
  if (!/^disc-[0-9a-f-]{36}$/.test(id) || jeton.length < 20 || jeton.length > 200) return null;
  const d = await o.base.discussion(id);
  if (!d) return null;
  return egalesATempsConstant(await o.empreinte(jeton), d.jeton_hash) ? d : null;
}

async function ecrire(o: OutilsDuChat, body: Record<string, unknown>): Promise<Reponse> {
  const d = await ouvreLaPorte(o, body);
  if (!d) return [403, { error: 'discussion' }];
  const texte = texteDuMessage(body.texte);
  if (!texte) return [400, { error: 'vide' }];
  if (!(await o.base.ecris(d.id, 'visiteuse', texte))) return [500, { error: 'insert_failed' }];
  if (d.etat === 'close') await o.base.touche(d.id, { etat: 'ouverte' });
  const maintenant = o.maintenant();
  const qui = appelDuChat(d);
  const presents = enPermanence(await o.base.permanences(), maintenant);
  const depuisLAlerte = d.alerte_le ? maintenant - Date.parse(d.alerte_le) : Infinity;

  if (presents.length) {
    /* Quelqu'un est de permanence : on le fait sonner, lui seul, une fois
       par minute au plus pour une même discussion. */
    if (!(depuisLAlerte < 60_000)) {
      await o.base.touche(d.id, { alerte_le: isoDe(maintenant) });
      o.fond(o.alerte({ titre: 'Discussion du site', corps: `${qui} : « ${extrait(texte)} »`, discussionId: d.id, seulement: presents.map((p) => p.user_id) }));
    }
  } else {
    /* PERSONNE N'EST LÀ : Claude répond seul (sa décision), quatre fois au
       plus ; ce qu'il écrit passe par `reponseSure` avant de partir. Sans
       réponse sûre, le mot du chat, une fois. */
    const fil = await o.base.derniersMessages(d.id, 30);
    let repondu = false;
    if (reponsesAuto(fil) < REPONSES_AUTO_MAX) {
      const consigne = consigneDeClaude({ appel: qui, heures: heuresPourClaude(await o.base.heures()), maintenant: ditMaintenant(maintenant) });
      const brut = await o.claude(consigne, messagesPourClaude(fil)).catch(() => '');
      const sure = reponseSure(brut);
      if (sure) repondu = !!(await o.base.ecris(d.id, 'auto', sure));
    }
    if (!repondu && !dejaDit(fil, 'hors-permanence')) await o.base.ecris(d.id, 'systeme', motHorsPermanence(d.telephone ?? ''), 'hors-permanence');
    /* L'équipe l'apprend, une fois par demi-heure de silence. */
    if (!(depuisLAlerte < 30 * 60_000)) {
      await o.base.touche(d.id, { alerte_le: isoDe(maintenant) });
      o.fond(o.alerte({ titre: 'Discussion du site · personne de permanence', corps: `${qui} : « ${extrait(texte)} »`, discussionId: d.id }));
    }
  }
  return [200, { ok: true, messages: await o.base.messages(d.id, entier(body.apres)), enLigne: presents.length > 0 }];
}

async function lire(o: OutilsDuChat, body: Record<string, unknown>): Promise<Reponse> {
  const d = await ouvreLaPorte(o, body);
  if (!d) return [403, { error: 'discussion' }];
  const maintenant = o.maintenant();
  const presents = enPermanence(await o.base.permanences(), maintenant);
  /* TROIS MINUTES SANS RÉPONSE (sa décision) : le chat le dit une fois, et
     toute l'équipe qui peut répondre l'apprend. */
  if (d.etat !== 'close' && d.dernier_de === 'visiteuse') {
    const fil = await o.base.derniersMessages(d.id, 10);
    if (attenteDepassee(fil, maintenant) && !dejaDit(fil, 'attente') && !dejaDit(fil, 'hors-permanence')) {
      await o.base.ecris(d.id, 'systeme', motDAttente(d.telephone ?? ''), 'attente');
      o.fond(o.alerte({ titre: 'Discussion sans réponse', corps: `${appelDuChat(d)} attend depuis ${ATTENTE_AVANT_WHATSAPP_MIN} minutes : répondez sur WhatsApp`, discussionId: d.id }));
    }
  }
  return [200, { ok: true, messages: await o.base.messages(d.id, entier(body.apres)), enLigne: presents.length > 0, etat: d.etat }];
}
// ── FIN discussion

/* ══ LES VRAIS OUTILS ═══════════════════════════════════════════════════ */
const base: BaseDuChat = {
  async permanences() {
    const { data, error } = await admin.from('discussion_permanence').select('user_id, jusqua').gt('jusqua', new Date().toISOString());
    if (error) console.error('discussion: permanence', error.message);
    return (data ?? []) as Permanence[];
  },
  async creeDiscussion(d) {
    const { error } = await admin.from('discussions').insert(d);
    if (error) console.error('discussion: création', error.message);
    return !error;
  },
  async discussion(id) {
    const { data } = await admin.from('discussions').select('*').eq('id', id).maybeSingle();
    return (data ?? null) as LigneDiscussion | null;
  },
  async messages(id, apres) {
    const { data } = await admin.from('discussion_messages').select('id, de, texte, cree_le, genre')
      .eq('discussion_id', id).gt('id', apres).order('id', { ascending: true }).limit(200);
    return (data ?? []) as MessageDuChat[];
  },
  async derniersMessages(id, n) {
    const { data } = await admin.from('discussion_messages').select('id, de, texte, cree_le, genre')
      .eq('discussion_id', id).order('id', { ascending: false }).limit(n);
    return ((data ?? []) as MessageDuChat[]).reverse();
  },
  async ecris(id, de, texte, genre) {
    const { data, error } = await admin.from('discussion_messages')
      .insert({ discussion_id: id, de, texte, ...(genre ? { genre } : {}) })
      .select('id, de, texte, cree_le, genre').single();
    if (error) console.error('discussion: message', error.message);
    return (data ?? null) as MessageDuChat | null;
  },
  async touche(id, champs) {
    const { error } = await admin.from('discussions').update(champs).eq('id', id);
    if (error) console.error('discussion: mise à jour', error.message);
  },
  async heures() {
    const { data } = await admin.from('documents').select('data').eq('key', 'mnd_settings').maybeSingle();
    return (data?.data as { hours?: unknown } | undefined)?.hours ?? [];
  },
  async efface(limiteIso) {
    const { error } = await admin.from('discussions').delete().lt('derniere_le', limiteIso);
    if (error) console.error('discussion: effacement', error.message);
  },
};

async function empreinte(jeton: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jeton));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function jetonNeuf(): string {
  const o = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** QUI SONNE : la direction et le département Clientèle (sa décision),
    lus dans la même matrice que la barre du Trône ; `seulement` restreint
    à ceux de permanence. */
async function alerte(o: { titre: string; corps: string; discussionId: string; seulement?: string[] }): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const [{ data: staff }, { data: doc }] = await Promise.all([
    admin.from('staff').select('user_id, role'),
    admin.from('documents').select('data').eq('key', 'mnd_staff_access').maybeSingle(),
  ]);
  const acces = (doc?.data ?? {}) as Record<string, Record<string, boolean>>;
  let ids = ((staff ?? []) as { user_id: string; role: string }[])
    .filter((s) => peutRepondre(s.role, acces[s.user_id]))
    .map((s) => s.user_id);
  if (o.seulement) ids = ids.filter((id) => o.seulement!.includes(id));
  if (!ids.length) return 0;
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth,client_id').in('client_id', ids);
  let n = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: o.titre, body: o.corps, url: `/trone/#/discussions?d=${o.discussionId}`, tag: `mnd-chat-${o.discussionId}` }),
      );
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return n;
}

/** Claude, quinze secondes au plus. Rien : chaîne vide, et le mot du chat
    prend le relais. */
async function claude(systeme: string, messages: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
  if (!ANTHROPIC_API_KEY || !messages.length) return '';
  for (const model of MODELES) {
    const arret = new AbortController();
    const minuterie = setTimeout(() => arret.abort(), 15_000);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: arret.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 400, system: systeme, messages }),
      });
      const corps = await r.json().catch(() => ({})) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
      if (!r.ok) {
        console.error('discussion: Claude', model, r.status, corps.error?.message ?? '');
        if (r.status === 404 || (r.status === 400 && /model/i.test(corps.error?.message ?? ''))) continue;
        return '';
      }
      return (corps.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
    } catch (e) {
      console.error('discussion: Claude', model, String(e));
      return '';
    } finally {
      clearTimeout(minuterie);
    }
  }
  return '';
}

/** La branche du chat : celle que le site donne, sinon la maison phare. */
async function brancheDuChat(voulue: string): Promise<string> {
  const { data } = await admin.from('branches').select('id, data');
  const lignes = (data ?? []) as { id: string; data?: { flagship?: boolean; status?: string } }[];
  const b = (voulue && lignes.find((l) => l.id === voulue))
    || lignes.find((l) => l.data?.flagship && l.data?.status !== 'paused')
    || lignes[0];
  return b?.id ?? '';
}

const outils: OutilsDuChat = {
  base,
  maintenant: () => Date.now(),
  empreinte,
  jeton: jetonNeuf,
  nouvelId: () => `disc-${crypto.randomUUID()}`,
  alerte,
  claude,
  fond: enTacheDeFond,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method', version: VERSION }, 405);
  const corps = await req.text();
  if (corps.length > 4_000) return json({ error: 'too_large' }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(corps); } catch { return json({ error: 'bad_request' }, 400); }
  const ip = ipOf(req);
  try {
    let r: Reponse;
    switch (body.action) {
      case 'etat':
        if (!(await allowRate(ip, 'chat_etat', 60))) return json({ error: 'rate_limited' }, 429);
        r = await etatDuChat(outils);
        break;
      case 'ouvrir':
        if (!(await allowRate(ip, 'chat_ouvrir', 6))) return json({ error: 'rate_limited' }, 429);
        r = await ouvrir(outils, body, await brancheDuChat(court(body.branchId, 60)));
        break;
      case 'ecrire':
        if (!(await allowRate(ip, 'chat_ecrire', 40))) return json({ error: 'rate_limited' }, 429);
        r = await ecrire(outils, body);
        break;
      /* La lecture ne passe pas par le seau : elle revient toutes les quatre
         secondes, et seul le jeton de la discussion l'ouvre. */
      case 'lire':
        r = await lire(outils, body);
        break;
      default:
        return json({ error: 'action', version: VERSION }, 400);
    }
    return json(r[1], r[0]);
  } catch (e) {
    console.error('discussion:', String(e));
    return json({ error: 'erreur' }, 500);
  }
});
