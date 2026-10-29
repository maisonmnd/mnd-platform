/* ══ LE TRI DES DÉMARCHEURS — 29 octobre 2026 ════════════════════════════
   « Comment automatiquement bloquer ce genre de message ? Je ne veux pas
   qu'ils aient accès à notre messagerie si ça ne parle pas de cheveux, et
   qu'ils fassent leur publicité » (Yéman, sur le message d'un « créateur
   digital » qui propose affiches, vidéos et sites web). Maquette
   Re299vtpySbSGEmPtBtwuA validée (« construis »), sept choix au sélecteur :

     · le premier message d'un numéro INCONNU est lu par Claude, avant que
       l'automate ou l'assistant WhatsApp ne réponde ;
     · une publicité qui ne parle pas de cheveux : le numéro est BLOQUÉ chez
       WhatsApp, son fil va dans « Bloqués », personne ne lui répond ;
     · une proposition qui parle de cheveux (un fournisseur, une formation,
       une coiffeuse qui cherche du travail) : rangée dans « Propositions »,
       pas bloquée, et la direction est prévenue ;
     · tout le reste, et le doute : « À traiter », comme avant ;
     · débloqué ou rendu à « À traiter » par la direction : plus jamais jugé.

   JAMAIS JUGÉ : un numéro qui a une fiche, un numéro à qui la Maison a déjà
   écrit, l'équipe et les prestataires (le serveur et l'automate le vérifient).

   Le registre vit dans un seul document, `mnd_tri_des_messages`, que seul le
   serveur écrit (la fonction `tri-des-messages`) : le Trône le lit et passe
   par la fonction pour chaque geste. Pur : ni base, ni réseau. */

export const CLE_DU_TRI = 'mnd_tri_des_messages';

export type VerdictDuTri = 'cliente' | 'demarchage' | 'proposition' | 'doute';
export const VERDICTS_DU_TRI: readonly VerdictDuTri[] = ['cliente', 'demarchage', 'proposition', 'doute'];

/** Un numéro rangé : quand, pourquoi, ce qu'il a écrit, et qui l'a rangé. */
export type EntreeDuTri = {
  numero: string;
  quand: string;
  motif: string;
  /** Les premiers mots de son message, pour le reconnaître. */
  extrait: string;
  /** Le nom que WhatsApp annonce. */
  nom?: string;
  /** Claude, ou la direction (« Bloquer ce numéro »). */
  par: 'claude' | 'direction';
  /** Ce que WhatsApp a répondu au blocage : posé, ou refusé (le fil reste rangé). */
  meta?: 'bloque' | 'echec';
};

export type TriDesMessages = {
  bloques: Record<string, EntreeDuTri>;
  propositions: Record<string, EntreeDuTri>;
  /** Débloqués ou rendus par la direction : plus jamais jugés. */
  blancs: Record<string, string>;
  /** Jugés « cliente » ou « doute » : on ne repose pas la question à Claude. */
  juges: Record<string, { verdict: VerdictDuTri; quand: string }>;
};

export const TRI_VIDE: TriDesMessages = { bloques: {}, propositions: {}, blancs: {}, juges: {} };

/** LA CLÉ D'UN NUMÉRO : ses chiffres, et l'ancien plan béninois ramené au
    nouveau (229 01 97… et 229 97… sont la même personne). MÊME RÈGLE que
    `cleDuNumeroWa` (shared/conversations), que le banc compare. */
export const cleDuTri = (numero: string | undefined | null): string => {
  const d = String(numero ?? '').replace(/\D/g, '');
  return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
};

const objet = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});

/** Le document tel qu'on le lit : jamais une case absente. */
export function triLu(brut: unknown): TriDesMessages {
  const o = objet(brut);
  return {
    bloques: objet(o.bloques) as Record<string, EntreeDuTri>,
    propositions: objet(o.propositions) as Record<string, EntreeDuTri>,
    blancs: objet(o.blancs) as Record<string, string>,
    juges: objet(o.juges) as Record<string, { verdict: VerdictDuTri; quand: string }>,
  };
}

export type EtatDuNumero = 'bloque' | 'proposition' | 'blanc' | 'juge' | 'inconnu';

/** Où en est ce numéro dans le tri. */
export function etatDuNumero(tri: TriDesMessages, numero: string | undefined | null): EtatDuNumero {
  const k = cleDuTri(numero);
  if (!k) return 'inconnu';
  if (tri.blancs[k]) return 'blanc';
  if (tri.bloques[k]) return 'bloque';
  if (tri.propositions[k]) return 'proposition';
  if (tri.juges[k]) return 'juge';
  return 'inconnu';
}

/** Les premiers mots, sur une ligne. */
export const extraitDe = (textes: readonly string[]): string =>
  textes.map((t) => String(t ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ').slice(0, 180);

/* ── LES GESTES SUR LE REGISTRE ──────────────────────────────────────────── */

const sans = <T>(r: Record<string, T>, k: string): Record<string, T> => {
  const { [k]: _, ...reste } = r;
  return reste;
};

/** Bloqué : il quitte les propositions et les jugés. */
export function avecUnBloque(tri: TriDesMessages, e: EntreeDuTri): TriDesMessages {
  const k = cleDuTri(e.numero);
  return { ...tri, bloques: { ...tri.bloques, [k]: e }, propositions: sans(tri.propositions, k), juges: sans(tri.juges, k), blancs: sans(tri.blancs, k) };
}

/** Rangé dans les propositions. */
export function avecUneProposition(tri: TriDesMessages, e: EntreeDuTri): TriDesMessages {
  const k = cleDuTri(e.numero);
  return { ...tri, propositions: { ...tri.propositions, [k]: e }, juges: sans(tri.juges, k) };
}

/** Jugé cliente ou doute : on ne reposera pas la question. */
export function avecUnJugement(tri: TriDesMessages, numero: string, verdict: VerdictDuTri, quand: string): TriDesMessages {
  return { ...tri, juges: { ...tri.juges, [cleDuTri(numero)]: { verdict, quand } } };
}

/** DÉBLOQUÉ, OU RENDU À « À TRAITER » : il sort de tout, et n'est plus jamais jugé. */
export function rendu(tri: TriDesMessages, numero: string, quand: string): TriDesMessages {
  const k = cleDuTri(numero);
  return { bloques: sans(tri.bloques, k), propositions: sans(tri.propositions, k), juges: sans(tri.juges, k), blancs: { ...tri.blancs, [k]: quand } };
}

/* ── CE QUE CLAUDE LIT, ET CE QU'IL RÉPOND ─────────────────────────────── */

export function consigneDuTri(): string {
  return [
    'Tu tries le PREMIER message qu’un numéro inconnu envoie au WhatsApp de la Maison MND, une maison de soin et de création de locks (dreadlocks) à Cotonou.',
    'Tu ne réponds pas à la personne : tu dis seulement dans quelle boîte son message va.',
    '',
    'Les verdicts :',
    '- "cliente" : la personne veut un service de la Maison, pour elle ou pour un proche : un rendez-vous, un prix, une question sur ses cheveux ou ses locks, une commande, une information pratique, une réclamation. Aussi un simple bonjour, un message vide, une photo de ses cheveux, ou un message que tu ne comprends pas.',
    '- "demarchage" : la personne VEND ou PROPOSE quelque chose à la Maison qui ne concerne pas les cheveux ni le métier : publicité, marketing, réseaux sociaux, abonnés, affiches, vidéos, sites web, applications, référencement, prêts, assurances, placements, cryptomonnaie, loterie, chaîne de messages.',
    '- "proposition" : la personne propose à la Maison quelque chose qui concerne les cheveux ou le métier : produits capillaires, huiles, matériel, formation, partenariat, collaboration autour des cheveux, ou une coiffeuse qui cherche du travail.',
    '- "doute" : tu n’es pas sûr.',
    '',
    'Les règles :',
    '- Dans le doute, "doute" : un message bloqué à tort fait perdre une cliente.',
    '- Quelqu’un qui demande un service pour lui-même est "cliente", même avec un lien ou une photo.',
    '- Un lien seul ne suffit pas : il faut que la personne vende quelque chose à la Maison.',
    '- Le motif : une phrase courte en français, sans nom propre ni numéro (par exemple « services numériques : affiches, vidéos, sites web »).',
    '',
    'Réponds uniquement par l’outil demandé.',
  ].join('\n');
}

export const SCHEMA_DU_TRI: Record<string, unknown> = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: [...VERDICTS_DU_TRI], description: 'La boîte du message.' },
    motif: { type: 'string', description: 'Pourquoi, en une phrase courte, sans nom propre ni numéro.' },
  },
  required: ['verdict', 'motif'],
  additionalProperties: false,
};

/** Ce que Claude lit : le nom annoncé et le message, rien d'autre. */
export function contexteDuTri(o: { textes: readonly string[]; nomProfil?: string }): string {
  const lignes = o.textes.map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 3).map((t) => t.slice(0, 1200));
  return [
    `Le nom que WhatsApp annonce : ${String(o.nomProfil ?? '').trim().slice(0, 80) || 'aucun'}.`,
    '',
    'Son message :',
    ...lignes.map((t) => `« ${t} »`),
  ].join('\n');
}

/** CE QUI SORT DE CLAUDE, relu : un verdict connu, un motif propre ; sinon rien. */
export function lectureDuTri(entree: unknown): { verdict: VerdictDuTri; motif: string } | null {
  const o = objet(entree);
  const verdict = o.verdict;
  if (typeof verdict !== 'string' || !(VERDICTS_DU_TRI as readonly string[]).includes(verdict)) return null;
  const motif = String(o.motif ?? '').replace(/\s+/g, ' ').replace(/\s*—\s*/g, ', ').replace(/\d{6,}/g, '').trim().slice(0, 140);
  return { verdict: verdict as VerdictDuTri, motif: motif || (verdict === 'demarchage' ? 'démarchage' : verdict === 'proposition' ? 'proposition' : '') };
}

/** Le motif dit à la direction, sur la ligne. */
export const motifDit = (e: Pick<EntreeDuTri, 'motif' | 'par'>, genre: 'bloque' | 'proposition'): string =>
  e.par === 'direction' ? 'bloqué à la main' : `${genre === 'bloque' ? 'Démarchage' : 'Proposition'} : ${e.motif}`;
