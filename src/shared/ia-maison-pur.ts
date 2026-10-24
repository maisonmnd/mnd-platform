/* ══ LA PORTE VERS CLAUDE, POUR LES HUIT CHANTIERS — 19 octobre 2026 ═════
   « Je veux construire des choses » avec les 200 $ d'API compris dans son
   abonnement (lié le 19 octobre). Maquette NKQMiMMY… validée (« Tout me
   va »), ses choix lus en base (maquette/chantiers) et au sélecteur du soir :
     · UNE seule porte côté serveur (`supabase/functions/ia-maison`) : elle
       vérifie que la personne est de l'équipe, retire ce qui ressemble à un
       numéro, compte ce qui est dépensé dans le mois et s'arrête à 60 $
       (son plafond pour les huit ; 120 $ depuis le 24 octobre 2026, avec
       le Tableau de bord intelligent) ; ce qu'elle rend est toujours une
       proposition, rien ne s'inscrit ni ne part sans un « oui » au Trône ;
     · le modèle le plus fin pour les photos, le rapide pour les textes
       (« fin-photos ») ;
     · prénom et initiale chez Claude, jamais un numéro, jamais les papiers
       de la famille ;
     · la direction voit tout ; le département Clientèle a la fiche du jour
       et les réponses WhatsApp ; l'Atelier relit les diagnostics.

   LE TRÔNE COMPOSE, LA FONCTION PORTE. Chaque chantier écrit sa consigne et
   la forme qu'il attend (un schéma JSON) dans son propre module pur, et les
   confie à `demandeAClaude` (ia-maison.ts). La fonction ne connaît aucun
   chantier : elle est la même pour les huit, et se colle une fois.

   Le bloc entre les repères est RECOPIÉ tel quel dans la fonction (une
   fonction Edge ne lit rien du dépôt) ; `verifie-les-douze-lunes` (R8)
   confronte les deux. On corrige ici, puis on recopie le bloc entier. */

/* ⟨ia-maison⟩ */
/** Les huit chantiers, par leur clef : c'est ce que le compteur détaille. */
export const CHANTIERS_IA = ['capture', 'recu', 'cahier', 'reponse-wa', 'avis', 'diagnostic', 'fiche-du-jour', 'lettre', 'prevision', 'question', 'processus'] as const;
export type ChantierIa = (typeof CHANTIERS_IA)[number];

/** Ce qu'on demande : lire une image (le plus fin) ou écrire un texte (le rapide). */
export type UsageIa = 'image' | 'texte';

/** Son plafond : 60 $ par mois pour les huit (sélecteur du 19 octobre 2026),
    porté à 120 $ le 24 octobre 2026 quand le Tableau de bord intelligent y
    est entré (« jusqu'à 120 $ », au sélecteur), toujours dans les 200 $
    compris dans l'abonnement. Le Centre de commande garde le sien (10 $) ;
    ils ne se mélangent pas. Le nom reste : c'est la clé que tout lit. */
export const PLAFOND_DES_HUIT_USD = 120;
/** Le compteur des huit, dans `documents` : la fonction seule l'écrit. */
export const CLE_DU_COMPTEUR_DES_HUIT = 'mnd_ia_compteur_huit';

/** LE MODÈLE PAR USAGE (« fin-photos »), et son remplaçant si le premier
    n'est pas ouvert à la clé. */
export const MODELES_PAR_USAGE: Record<UsageIa, readonly string[]> = {
  image: ['claude-opus-5-5', 'claude-sonnet-5-5'],
  texte: ['claude-haiku-5-5', 'claude-sonnet-5-5'],
};

/** Une image ne dépasse pas 4 Mo en clair (le Trône la réduit avant), et
    une demande n'en porte pas plus de six (le diagnostic en prend quatre). */
export const OCTETS_MAX_PAR_IMAGE = 4_000_000;
export const IMAGES_MAX_PAR_DEMANDE = 6;
/** Une consigne et un fil ne dépassent pas cette taille : au-delà, le Trône
    a oublié de résumer. */
export const SIGNES_MAX_PAR_DEMANDE = 40_000;
/** La réponse de Claude, au plus. Une proposition tient en peu de mots. */
export const JETONS_MAX_PAR_DEFAUT = 1500;
export const JETONS_MAX_PLAFOND = 4000;

export type ImageIa = { base64: string; mime: string } | { coffre: string; chemin: string };
export type MessageIa = { role: 'user' | 'assistant'; content: string };

/** CE QUE LE TRÔNE ENVOIE. `schema` : la forme attendue (JSON Schema) ; la
    fonction la donne à Claude comme un outil à appeler, et rend l'objet. Sans
    schéma, elle rend le texte. */
export type DemandeIa = {
  chantier: ChantierIa;
  usage: UsageIa;
  systeme: string;
  messages: MessageIa[];
  images?: ImageIa[];
  schema?: Record<string, unknown>;
  maxTokens?: number;
};

export type ReponseIa<T = unknown> =
  | { ok: true; data: T; texte: string; modele: string; coutUsd: number; resteUsd: number }
  | { ok: false; erreur: 'budget' | 'equipe' | 'format' | 'trop-gros' | 'claude' | 'hors-ligne' | 'reseau' | 'version'; message: string; resteUsd?: number };

/** Les formats d'image qu'on sait montrer à Claude. */
export function mimeDImagePermis(mime: string): boolean {
  const m = String(mime ?? '').toLowerCase().split(';')[0].trim();
  return m === 'image/jpeg' || m === 'image/png' || m === 'image/webp' || m === 'image/gif';
}

/** La demande est-elle recevable, avant de dépenser quoi que ce soit ?
    `null` : oui ; sinon, pourquoi pas. */
export function defautDeLaDemande(d: Partial<DemandeIa> | null | undefined): string | null {
  if (!d || typeof d !== 'object') return 'demande vide';
  if (!CHANTIERS_IA.includes(d.chantier as ChantierIa)) return 'chantier inconnu';
  if (d.usage !== 'image' && d.usage !== 'texte') return 'usage inconnu';
  if (typeof d.systeme !== 'string' || !d.systeme.trim()) return 'consigne vide';
  if (!Array.isArray(d.messages) || !d.messages.length) return 'aucun message';
  if (d.messages.some((m) => (m?.role !== 'user' && m?.role !== 'assistant') || typeof m?.content !== 'string')) return 'message mal formé';
  if (d.messages[0].role !== 'user') return 'le premier message est celui de la Maison';
  const signes = d.systeme.length + d.messages.reduce((n, m) => n + m.content.length, 0);
  if (signes > SIGNES_MAX_PAR_DEMANDE) return 'demande trop longue';
  const images = d.images ?? [];
  if (!Array.isArray(images)) return 'images mal formées';
  if (images.length > IMAGES_MAX_PAR_DEMANDE) return 'trop d’images';
  if (d.usage === 'image' && !images.length) return 'une lecture d’image sans image';
  if (d.usage === 'texte' && images.length) return 'un texte n’emporte pas d’image';
  for (const im of images) {
    /* Une image nulle ou en chaîne ferait lancer le test qui suit
       (`'base64' in null`) : elle se refuse d'abord (19 octobre 2026, au soir). */
    if (!im || typeof im !== 'object' || Array.isArray(im)) return 'image mal formée';
    if ('base64' in im) {
      if (!mimeDImagePermis(im.mime)) return 'format d’image refusé';
      if (typeof im.base64 !== 'string' || im.base64.length < 100) return 'image vide';
      if (im.base64.length > OCTETS_MAX_PAR_IMAGE * 1.37) return 'image trop lourde';
    } else if (!('coffre' in im) || typeof im.coffre !== 'string' || typeof im.chemin !== 'string' || !im.coffre || !im.chemin || im.chemin.includes('..')) {
      return 'image introuvable';
    }
  }
  if (d.schema !== undefined && (typeof d.schema !== 'object' || d.schema === null || Array.isArray(d.schema))) return 'schéma mal formé';
  if (d.maxTokens !== undefined && (!Number.isFinite(d.maxTokens) || d.maxTokens < 50)) return 'maxTokens mal formé';
  return null;
}

/** Les jetons de sortie accordés : ce que le chantier demande, borné. */
export const jetonsAccordes = (voulus: number | undefined): number =>
  Math.min(JETONS_MAX_PLAFOND, Math.max(50, Math.round(voulus ?? JETONS_MAX_PAR_DEFAUT)));

/** LE PERSONNEL SEUL, ET SES DÉPARTEMENTS (sélecteur du 19 octobre) : la
    direction a tout ; un maître a ce que son département lui ouvre. */
export const DEPARTEMENTS_PAR_CHANTIER: Record<ChantierIa, readonly string[]> = {
  capture: ['dept-clientele', 'dept-vente-caisse', 'dept-finances'],
  recu: ['dept-vente-caisse', 'dept-finances', 'dept-atelier', 'dept-clientele', 'dept-equipe', 'dept-marketing', 'dept-academie', 'dept-systeme'],
  cahier: ['dept-clientele', 'dept-finances'],
  'reponse-wa': ['dept-clientele'],
  avis: ['dept-clientele', 'dept-marketing'],
  diagnostic: ['dept-atelier', 'dept-clientele'],
  'fiche-du-jour': ['dept-clientele', 'dept-atelier'],
  lettre: [],
  /* LE TABLEAU DE BORD INTELLIGENT (24 octobre 2026) : la direction seule.
     Claude explique la prévision, répond à « Demander à la Maison » et
     propose un processus ; il ne voit que des sommes, jamais une cliente. */
  prevision: [],
  question: [],
  processus: [],
};
export function peutDemander(role: string | undefined, chantier: ChantierIa, acces: Record<string, boolean> | undefined): boolean {
  if (!role) return false;
  if (role === 'souverain' || role === 'gerant') return true;
  return DEPARTEMENTS_PAR_CHANTIER[chantier].some((d) => acces?.[d] === true);
}

/** La version de la fonction qui sait tout ceci. Le Trône ne propose un
    chantier que si la fonction posée le sait (sinon la demande échouerait). */
export const saitIaMaison = (version: string | undefined): boolean => !!version && version >= '2026-10-19-a';
/** La fonction qui connaît les trois chantiers du Tableau de bord et les 120 $. */
export const saitLeTableauIntelligent = (version: string | undefined): boolean => !!version && version >= '2026-10-24-a';
/* ⟨/ia-maison⟩ */

/** « 12 $ », « 0,40 $ » : ce que coûte un appel, dit au Trône. */
export const dollarsDits = (usd: number): string => {
  const n = Math.max(0, Number(usd) || 0);
  return n >= 1 ? `${n.toFixed(2).replace('.', ',')} $` : `${(n * 100).toFixed(1).replace('.', ',')} ¢`;
};
