/* ══ LE CHAT DE LA MAISON — 19 octobre 2026 ═════════════════════════════
   « Je veux construire ceci sur notre site maisonmnd.com » (Yéman, devant la
   fenêtre d'aide de FedaPay : « We are here to help you! Call or chat »).
   Au sélecteur : la bulle « Appeler ou écrire » ET un vrai chat en direct.
   Maquette BPWmpyyw… puis « construis » ; ses choix lus en base
   (maquette/chat) :
     · la bulle façon FedaPay : en-tête indigo, le monogramme, « Nous sommes
       là pour vous », quatre ronds (Discuter, Appeler, WhatsApp, Vocal) ;
     · « En ligne » quand quelqu'un a pris la permanence au Trône ;
     · la direction et le département Clientèle répondent ;
     · avant d'écrire : civilité, nom et numéro WhatsApp ;
     · personne ne répond en 3 minutes : le chat le dit, la suite se fait sur
       WhatsApp ;
     · CLAUDE RÉPOND SEUL QUAND PERSONNE N'EST LÀ : adresse, heures,
       réserver en ligne ; jamais un prix, jamais une place promise ; il dit
       qu'il est une réponse automatique et passe la main ;
     · une discussion se garde 90 jours, puis s'efface.

   La visiteuse n'a pas de compte : le site parle à la fonction
   `discussion`, qui écrit en base avec la clé de service et rend à la
   visiteuse un jeton secret, seule clé de SA discussion. L'équipe lit et
   répond depuis le Trône (écran Discussions), en direct.

   Tout ce qui se décide sans écran ni serveur vit ici. Le bloc entre les
   repères est RECOPIÉ tel quel dans `supabase/functions/discussion` (une
   fonction Edge ne lit rien du dépôt) ; `verifie-les-douze-lunes` (R8)
   confronte les deux. On corrige ici, puis on recopie le bloc entier. */

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

/** Où en est une discussion, pour la liste du Trône. */
export type EtatDeLaDiscussion = 'a-repondre' | 'repondue' | 'close';
export const etatDeLaDiscussion = (d: { etat?: string; dernier_de?: string | null }): EtatDeLaDiscussion =>
  (d.etat === 'close' ? 'close' : d.dernier_de === 'visiteuse' ? 'a-repondre' : 'repondue');

/** Ce que la visiteuse garde sur son téléphone pour retrouver sa discussion. */
export const CLE_DU_CHAT = 'mnd_chat_du_site';
export type ChatGarde = { id: string; jeton: string; appel: string; telephone: string; dernier: number };

/** Le prochain délai de lecture : rapide tant qu'elle attend une réponse
    (son dernier message est le plus récent, il y a moins de dix minutes),
    lent sinon. */
export function prochaineLecture(messages: readonly Pick<MessageDuChat, 'de' | 'cree_le'>[], maintenantMs: number): number {
  const dernier = messages[messages.length - 1];
  if (!dernier) return LECTURE_LENTE_MS;
  const t = Date.parse(dernier.cree_le);
  return dernier.de === 'visiteuse' && Number.isFinite(t) && maintenantMs - t < 10 * 60_000 ? LECTURE_RAPIDE_MS : LECTURE_LENTE_MS;
}
