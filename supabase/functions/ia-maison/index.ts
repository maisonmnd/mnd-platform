// ia-maison - la porte vers Claude pour les huit chantiers du Trone, cote serveur.
//
// LA PREMIERE LIGNE EST VOLONTAIREMENT PAUVRE, comme celles de discussion et
// de whatsapp-webhook : un fichier qu on colle a la main dans un navigateur
// doit commencer par quelque chose qui survit a un collage de travers. Le
// decor vient apres.

/* ═══════════════════════════════════════════════════════════════════════
   IA-MAISON · la porte vers Claude · 19 octobre 2026 · version 2026-10-19-a

   « Je veux construire des choses » avec les 200 $ d'API compris dans son
   abonnement (lié le 19 octobre 2026). Maquette NKQMiMMY… validée (« Tout me
   va »), ses choix lus en base (maquette/chantiers) et au sélecteur du soir.
   Huit chantiers du Trône (capture, reçu, cahier, réponse WhatsApp, avis,
   diagnostic, fiche du jour, lettre) demandent à Claude par UNE seule porte :
   celle-ci. Elle ne connaît aucun chantier : le Trône compose la consigne et
   la forme attendue (src/shared/ia-maison-pur.ts), la fonction porte.

   CE QU'ELLE FAIT, DANS L'ORDRE, pour un POST JSON (une DemandeIa) :
     1. LA PORTE : la personne est de l'équipe (son jeton de session, puis sa
        ligne `staff`) ; sinon { erreur: 'equipe' } ;
     2. la demande est recevable (`defautDeLaDemande`) ; sinon { erreur: 'format' } ;
        puis son département lui ouvre ce chantier (`peutDemander`, matrice
        `mnd_staff_access`) ; sinon { erreur: 'equipe' } ;
     3. L'ANONYMISATION DE SÛRETÉ : la consigne et chaque message repassent
        par `sansCoordonnees`, même si le Trône l'a déjà fait ;
     4. LE BUDGET : 60 $ par mois (PLAFOND_DES_HUIT_USD) pour les huit, compté
        à l'heure de Cotonou dans `documents` · mnd_ia_compteur_huit ; au
        plafond, { erreur: 'budget' } et AUCUN appel ;
     5. LES IMAGES : telles quelles en base64, ou lues dans un coffre de la
        liste blanche (jamais les papiers de la famille) ; trop lourde ou d'un
        format inconnu, refusée ;
     6. L'APPEL : le modèle fin pour une image, le rapide pour un texte, le
        remplaçant si le premier n'est pas ouvert à la clé ; avec un schéma,
        Claude répond par l'outil `reponds` et la fonction rend `data` ; sans,
        elle rend `texte` ;
     7. LE COÛT réel (les jetons rendus par l'API) s'ajoute au compteur, par
        mois et par chantier ; la réponse dit ce qu'il reste.
   Ce qu'elle rend est TOUJOURS une proposition : rien ne s'inscrit ni ne
   part d'ici. Un GET rend la version (405) : le Trône ne propose un chantier
   que si la fonction posée le sait (`saitIaMaison`).

   DÉPLOIEMENT : Supabase → Edge Functions → New function → nom « ia-maison »
   → coller CE FICHIER ENTIER → Deploy. Verify JWT ALLUMÉ : c'est la session
   de la personne qui prouve qu'elle est de l'équipe (la clé anon, qui est
   aussi un JWT, passe pour le GET de version). Secrets : ceux qui existent
   déjà, ANTHROPIC_API_KEY et CLE_SERVICE (ou SERVICE_KEY). Aucune migration,
   aucun secret nouveau. Contrôle : un GET sur l'adresse de la fonction rend
   { error: 'method', version: '2026-10-19-a' }.

   LES BLOCS RECOPIÉS : ⟨ia-maison⟩ (la règle R8 de verifie-les-douze-lunes le
   confronte à src/shared/ia-maison-pur.ts), et deux copies entières comme
   dans centre-de-commande (ia-anonymise-pur, ia-budget-pur : `copiesAJour` de
   scripts/copie-dans-le-centre.mjs les confronte dans verifie-ia-maison ;
   `node scripts/copie-dans-le-centre.mjs --fonction supabase/functions/ia-maison/index.ts`
   les rafraîchit). On corrige l'original, puis on recopie le bloc entier. */
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
/* La clé d'Anthropic ne quitte jamais ce fichier : ni dans une réponse, ni
   dans le journal. Elle vient de l'organisation liée à l'abonnement (19 octobre 2026). */
const ANTHROPIC_API_KEY = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** La version de ce fichier : `saitIaMaison` du Trône la compare. */
const VERSION = '2026-10-19-a';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* LE CONTRAT DES HUIT, RECOPIÉ de `src/shared/ia-maison-pur.ts`. NE RIEN
   RETOUCHER ENTRE LES REPÈRES : on corrige l'original, puis on recopie le
   bloc entier ; `verifie-les-douze-lunes` (R8) confronte les deux. */
/* ⟨ia-maison⟩ */
/** Les huit chantiers, par leur clef : c'est ce que le compteur détaille. */
export const CHANTIERS_IA = ['capture', 'recu', 'cahier', 'reponse-wa', 'avis', 'diagnostic', 'fiche-du-jour', 'lettre'] as const;
export type ChantierIa = (typeof CHANTIERS_IA)[number];

/** Ce qu'on demande : lire une image (le plus fin) ou écrire un texte (le rapide). */
export type UsageIa = 'image' | 'texte';

/** Son plafond pour les huit : 60 $ par mois (sélecteur du 19 octobre 2026).
    Le Centre de commande garde le sien (10 $) ; ils ne se mélangent pas. */
export const PLAFOND_DES_HUIT_USD = 60;
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
};
export function peutDemander(role: string | undefined, chantier: ChantierIa, acces: Record<string, boolean> | undefined): boolean {
  if (!role) return false;
  if (role === 'souverain' || role === 'gerant') return true;
  return DEPARTEMENTS_PAR_CHANTIER[chantier].some((d) => acces?.[d] === true);
}

/** La version de la fonction qui sait tout ceci. Le Trône ne propose un
    chantier que si la fonction posée le sait (sinon la demande échouerait). */
export const saitIaMaison = (version: string | undefined): boolean => !!version && version >= '2026-10-19-a';
/* ⟨/ia-maison⟩ */

/* CE QUI SORT VERS CLAUDE ET LE PLAFOND, RECOPIÉS ENTIERS comme dans
   centre-de-commande : `scripts/copie-dans-le-centre.mjs --fonction …` les
   refait, `verifie-ia-maison` crie s'ils divergent. */
// ── DÉBUT DE LA COPIE : src/shared/ia-anonymise-pur.ts ──
/* CE QUI SORT DU TRÔNE VERS CLAUDE — 11 octobre 2026.

   Choix de Yéman au sélecteur : « Jamais : prénoms et initiales seulement ».
   Aucun numéro, aucune adresse e-mail, aucun nom complet de cliente ne part
   chez Anthropic. Une cliente se dit « Awa D. », jamais « Awa Dossou ».

   DEUX BARRIÈRES. Le Trône passe chaque texte ici avant l'envoi, avec la
   liste des clientes qu'il connaît (lui seul a les noms). La fonction
   `centre-de-commande` repasse ce qu'elle reçoit et ce qu'elle lit dans la
   base par `sansCoordonnees`, en copie entre ses repères : un numéro glissé
   par erreur ne part pas.

   MODULE PUR. */

/** Un numéro de téléphone : huit chiffres ou plus, avec ou sans indicatif,
    espaces, points ou tirets entre les groupes. Les montants et les dates du
    Trône (« 33 000 F », « 2026-10-11 ») ne sont pas des numéros : huit
    chiffres au moins, et pas de forme de date. */
const TELEPHONE = /(?:\+|00)?\d(?:[\s.\-]?\d){7,}/g;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const COURRIEL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

/** Les coordonnées retirées : chaque numéro devient « [numéro] », chaque
    adresse « [adresse] ». Le reste du texte ne bouge pas. */
export function sansCoordonnees(texte: string): string {
  return String(texte ?? '')
    .replace(COURRIEL, '[adresse]')
    .replace(TELEPHONE, (m) => (DATE_ISO.test(m.trim()) ? m : '[numéro]'));
}

export type Personne = { prenom?: string; nom?: string };

const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** « Awa D. » : le prénom, l'initiale du nom. Sans prénom, les initiales. */
export function prenomEtInitiale(p: Personne): string {
  const prenom = (p.prenom ?? '').trim();
  const nom = (p.nom ?? '').trim();
  const initiale = nom ? `${nom.charAt(0).toLocaleUpperCase('fr')}.` : '';
  if (prenom) return initiale ? `${prenom} ${initiale}` : prenom;
  return initiale;
}

/** Chaque nom complet connu devient prénom et initiale, dans les deux ordres
    où on l'écrit (« Awa Dossou », « DOSSOU Awa »), sans tenir compte de la
    casse. Les noms les plus longs passent d'abord, pour qu'un nom composé ne
    soit pas coupé par un plus court. */
export function nomsEnInitiales(texte: string, personnes: readonly Personne[]): string {
  let t = String(texte ?? '');
  const formes = personnes
    .filter((p) => (p.nom ?? '').trim().length > 1)
    .flatMap((p) => {
      const prenom = (p.prenom ?? '').trim();
      const nom = (p.nom ?? '').trim();
      const court = prenomEtInitiale(p);
      return prenom
        ? [{ motif: `${prenom} ${nom}`, court }, { motif: `${nom} ${prenom}`, court }]
        : [{ motif: nom, court }];
    })
    .sort((a, b) => b.motif.length - a.motif.length);
  for (const f of formes) {
    t = t.replace(new RegExp(`(^|[^\\p{L}])${echappe(f.motif)}(?=$|[^\\p{L}])`, 'giu'), (_m, avant: string) => `${avant}${f.court}`);
  }
  return t;
}

/** Les deux barrières à la fois, dans l'ordre : les noms, puis les numéros. */
export const pourClaude = (texte: string, personnes: readonly Personne[] = []): string =>
  sansCoordonnees(nomsEnInitiales(texte, personnes));

/** Un objet entier, champ par champ (les clés ne changent pas). */
export function objetPourClaude<T>(valeur: T, personnes: readonly Personne[] = []): T {
  if (typeof valeur === 'string') return pourClaude(valeur, personnes) as unknown as T;
  if (Array.isArray(valeur)) return valeur.map((v) => objetPourClaude(v, personnes)) as unknown as T;
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur as Record<string, unknown>).map(([k, v]) => [k, objetPourClaude(v, personnes)])) as T;
  }
  return valeur;
}
// ── FIN DE LA COPIE ──

// ── DÉBUT DE LA COPIE : src/shared/ia-budget-pur.ts ──
/* LE PLAFOND DES AGENTS — 11 octobre 2026.

   Choix de Yéman au sélecteur : les agents appellent Claude d'eux-mêmes
   (briefing du matin, lundi, vendredi, rapport du mois), « avec un plafond
   mensuel », 10 $ par mois. Au-delà, ils s'arrêtent et le disent.

   UNE ESTIMATION PRUDENTE. Le coût se calcule ici à partir des jetons que
   Claude rend à chaque appel, avec des prix RELEVÉS VERS LE HAUT : le
   compteur atteint le plafond avant la vraie facture, jamais après. La
   facture réelle se lit dans la console d'Anthropic.

   Le mois se compte à l'heure de Cotonou. MODULE PUR, copié entre repères
   dans la fonction `centre-de-commande`. */

export const PLAFOND_PAR_DEFAUT_USD = 10;

/** Dollars par million de jetons, entrée et sortie. Un modèle inconnu se
    compte au prix le plus haut de la table. */
export const PRIX_PAR_MILLION: Record<string, { entree: number; sortie: number }> = {
  'claude-sonnet-5-5': { entree: 3, sortie: 15 },
  'claude-haiku-4-5-20251001': { entree: 1, sortie: 5 },
  /* Le rapide des huit chantiers (ia-maison, 19 octobre 2026), au prix du
     haiku 4.5 : sans cette ligne, il se compterait au prix le plus haut. */
  'claude-haiku-5-5': { entree: 1, sortie: 5 },
  'claude-opus-5-5': { entree: 15, sortie: 75 },
  'claude-opus-4-8': { entree: 15, sortie: 75 },
};

const LE_PLUS_CHER = Object.values(PRIX_PAR_MILLION).reduce(
  (m, p) => ({ entree: Math.max(m.entree, p.entree), sortie: Math.max(m.sortie, p.sortie) }),
  { entree: 0, sortie: 0 },
);

/** Le coût d'un appel, en dollars, arrondi au centième de cent supérieur. */
export function coutDeLAppel(modele: string, jetonsEntree: number, jetonsSortie: number): number {
  const p = PRIX_PAR_MILLION[modele] ?? LE_PLUS_CHER;
  const brut = (Math.max(0, jetonsEntree) * p.entree + Math.max(0, jetonsSortie) * p.sortie) / 1_000_000;
  return Math.ceil(brut * 10_000) / 10_000;
}

/** « 2026-10 » : le mois à Cotonou. */
export function moisACotonou(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
  } catch {
    return d.toISOString().slice(0, 7);
  }
}

export type LigneDuCompteur = { usd: number; appels: number; entree: number; sortie: number };
export type Compteur = Record<string, LigneDuCompteur>;

export const depenseDuMois = (c: Compteur | null | undefined, mois: string): number => c?.[mois]?.usd ?? 0;

/** Un appel peut-il partir ? Le plafond se lit avant l'appel : à 10 $ pile,
    plus rien ne part. Un plafond absent ou abîmé vaut celui par défaut. */
export function peutAppeler(c: Compteur | null | undefined, mois: string, plafondUsd?: number): { oui: boolean; reste: number; plafond: number } {
  const plafond = Number.isFinite(plafondUsd) && (plafondUsd as number) > 0 ? (plafondUsd as number) : PLAFOND_PAR_DEFAUT_USD;
  const depense = depenseDuMois(c, mois);
  const reste = Math.max(0, Math.round((plafond - depense) * 10_000) / 10_000);
  return { oui: depense < plafond, reste, plafond };
}

/** Le compteur après un appel : une ligne par mois, rien d'autre ne bouge. */
export function compteurApres(c: Compteur | null | undefined, mois: string, modele: string, entree: number, sortie: number): Compteur {
  const avant = c?.[mois] ?? { usd: 0, appels: 0, entree: 0, sortie: 0 };
  return {
    ...(c ?? {}),
    [mois]: {
      usd: Math.round((avant.usd + coutDeLAppel(modele, entree, sortie)) * 10_000) / 10_000,
      appels: avant.appels + 1,
      entree: avant.entree + Math.max(0, entree),
      sortie: avant.sortie + Math.max(0, sortie),
    },
  };
}
// ── FIN DE LA COPIE ──

/* ══ LA PORTE, SANS BASE NI RÉSEAU ═════════════════════════════════════
   Tout ce qui suit jusqu'au repère de fin reçoit ses outils (la base, le
   téléchargeur, l'appel à Anthropic, la montre) au lieu de les prendre :
   `verifie-ia-maison` le rejoue sur de faux outils, sans jamais appeler la
   vraie fonction ni Anthropic. */
// ── DEBUT iaMaison
/** LES COFFRES QUE CLAUDE PEUT LIRE (liste blanche, 19 octobre 2026). Les
    compartiments d'IMAGES de la Maison, relevés dans supabase/migrations :
      · whatsapp     les pièces reçues sur WhatsApp (whatsapp-webhook les range
                     sous `<numéro>/<clé>-<nom>`, migration 0102) : photos de
                     locks, captures envoyées par les clientes ;
      · entre-deux   les photos entre deux séances (0132) ;
      · fil          les pièces jointes du fil (0059) ;
      · engagements  les devis et pièces des fournisseurs (0099) ;
      · site         les photos du site public (0114, ouvert au public).
    JAMAIS : papiers (les papiers officiels, 0117), secretariat (0129, la
    bourse scolaire y vit), rh (0130, contrats et paie), traces-privees (0134,
    les chèques : un numéro de compte s'y lit), signatures (0116),
    certificats (0103), sauvegardes (0064), voix-du-site (0135, des sons).
    Sa règle : les papiers de la famille ne vont jamais chez Claude. */
const COFFRES_D_IMAGES: readonly string[] = ['whatsapp', 'entre-deux', 'fil', 'engagements', 'site'];

type LigneStaff = { user_id: string; role: string };
type Matrice = Record<string, Record<string, boolean>>;
/** Le détail par chantier : parChantier[mois][chantier] = { usd, appels }. */
type DetailParChantier = Record<string, Record<string, { usd: number; appels: number }>>;
/** Le document du compteur : les lignes du mois (la forme `Compteur` de
    ia-budget-pur, une clé par mois) et, à côté, sous `parChantier`, le détail. */
type DocumentDuCompteur = Record<string, unknown>;
type Fichier = { octets: Uint8Array; mime: string };
type BlocAnthropic = { type: string; text?: string; name?: string; input?: unknown };
type UsageAnthropic = { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
type CorpsAnthropic = { content?: BlocAnthropic[]; usage?: UsageAnthropic; stop_reason?: string; error?: { type?: string; message?: string } };
type BaseDeLaMaison = {
  /** L'identifiant de la personne derrière le jeton de session, ou null. */
  utilisateur(jwt: string): Promise<string | null>;
  staff(userId: string): Promise<LigneStaff | null>;
  /** La matrice des départements (documents · mnd_staff_access), par user_id. */
  matrice(): Promise<Matrice>;
  /** Le compteur des huit (documents · CLE_DU_COMPTEUR_DES_HUIT). */
  compteur(): Promise<DocumentDuCompteur>;
  ecrisLeCompteur(doc: DocumentDuCompteur): Promise<void>;
  /** Un fichier d'un coffre, ou null s'il n'y est pas. */
  telecharge(coffre: string, chemin: string): Promise<Fichier | null>;
};
type OutilsDeLaMaison = {
  base: BaseDeLaMaison;
  /** L'appel brut à Anthropic : le statut HTTP et le corps. Lance si le
      réseau ou le délai lâche. */
  appelleAnthropic(corps: Record<string, unknown>): Promise<{ status: number; corps: CorpsAnthropic }>;
  maintenant(): Date;
};
type Rendu = [number, Record<string, unknown>];

const refus = (status: number, erreur: string, message: string, reste: Record<string, unknown> = {}): Rendu =>
  [status, { ok: false, erreur, message, ...reste }];

/** Des octets en base64, par tranches : une photo de 4 Mo tient sans peine. */
function enBase64(octets: Uint8Array): string {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

const mimeNet = (mime: string): string => String(mime ?? '').toLowerCase().split(';')[0].trim();

/** Les lignes du mois seules, sans le détail : ce que lisent `peutAppeler`
    et `compteurApres`. */
const lignesDuCompteur = (doc: DocumentDuCompteur): Compteur =>
  Object.fromEntries(Object.entries(doc).filter(([k, v]) => k !== 'parChantier' && !!v && typeof v === 'object')) as Compteur;

/** Le document après un appel : la ligne du mois (compteurApres) et le détail
    du chantier, au même prix. */
function documentApres(doc: DocumentDuCompteur, mois: string, chantier: string, modele: string, entree: number, sortie: number): DocumentDuCompteur {
  const detail = (doc.parChantier ?? {}) as DetailParChantier;
  const avant = detail[mois]?.[chantier] ?? { usd: 0, appels: 0 };
  const cout = coutDeLAppel(modele, entree, sortie);
  return {
    ...compteurApres(lignesDuCompteur(doc), mois, modele, entree, sortie),
    parChantier: {
      ...detail,
      [mois]: { ...(detail[mois] ?? {}), [chantier]: { usd: Math.round((avant.usd + cout) * 10_000) / 10_000, appels: avant.appels + 1 } },
    },
  };
}

/** Le modèle n'est pas ouvert à la clé : on passe au remplaçant (comme `discussion`). */
const modeleInconnu = (status: number, corps: CorpsAnthropic): boolean =>
  status === 404 || (status === 400 && /model/i.test(corps.error?.message ?? ''));

async function traiteLaDemande(o: OutilsDeLaMaison, body: unknown, jwt: string): Promise<Rendu> {
  /* 1. LA PORTE : de l'équipe. Le jeton est celui de la session du Trône ;
     la ligne `staff` dit le rôle. */
  const uid = jwt ? await o.base.utilisateur(jwt) : null;
  const ligne = uid ? await o.base.staff(uid) : null;
  if (!uid || !ligne) return refus(403, 'equipe', 'Cette porte est celle de l’équipe : ouvrez une session du Trône.');

  /* 2. LA DEMANDE EST RECEVABLE, avant de dépenser quoi que ce soit. */
  const defaut = defautDeLaDemande(body as Partial<DemandeIa>);
  if (defaut) return refus(400, 'format', `La demande n’est pas recevable : ${defaut}.`);
  const d = body as DemandeIa;
  /* ... et son département lui ouvre ce chantier (la direction a tout). */
  const matrice = await o.base.matrice();
  if (!peutDemander(ligne.role, d.chantier, matrice[uid])) return refus(403, 'equipe', 'Ce chantier n’est pas ouvert à votre département.');

  /* 3. L'ANONYMISATION DE SÛRETÉ : même si le Trône a déjà fait son travail,
     un numéro ou une adresse glissés par erreur ne partent pas. Les images
     ne se touchent pas. */
  const systeme = sansCoordonnees(d.systeme);
  const messages = d.messages.map((m) => ({ role: m.role, content: sansCoordonnees(m.content) }));

  /* 4. LE BUDGET : les 60 $ du mois, à l'heure de Cotonou. */
  const mois = moisACotonou(o.maintenant());
  const permis = peutAppeler(lignesDuCompteur(await o.base.compteur()), mois, PLAFOND_DES_HUIT_USD);
  if (!permis.oui) return refus(402, 'budget', `Les ${PLAFOND_DES_HUIT_USD} $ du mois sont dépensés : Claude se tait jusqu’au 1er.`, { resteUsd: 0 });

  /* 5. LES IMAGES : en base64 telles quelles ; d'un coffre, seulement un
     coffre d'images de la Maison, pas plus lourde que la borne, d'un format
     que Claude sait lire. */
  const images: { media_type: string; data: string }[] = [];
  for (const im of d.images ?? []) {
    if ('base64' in im) { images.push({ media_type: mimeNet(im.mime), data: im.base64 }); continue; }
    if (!COFFRES_D_IMAGES.includes(im.coffre)) return refus(400, 'format', `Le coffre « ${im.coffre} » n’est pas un coffre d’images que Claude peut lire.`);
    const lu = await o.base.telecharge(im.coffre, im.chemin);
    if (!lu) return refus(400, 'format', 'L’image demandée est introuvable dans son coffre.');
    if (lu.octets.length > OCTETS_MAX_PAR_IMAGE) return refus(413, 'trop-gros', 'Cette image dépasse 4 Mo : réduisez-la avant de la montrer à Claude.');
    if (!mimeDImagePermis(lu.mime)) return refus(400, 'format', 'Ce fichier n’est pas une image que Claude sait lire (JPEG, PNG, WebP, GIF).');
    images.push({ media_type: mimeNet(lu.mime), data: enBase64(lu.octets) });
  }

  /* 6. L'APPEL. La première charge de la Maison porte les images, puis son
     texte ; avec un schéma, Claude répond par l'outil `reponds`. */
  const premier = messages[0];
  const charge = images.length
    ? [
      ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
      ...(premier.content.trim() ? [{ type: 'text', text: premier.content }] : []),
    ]
    : premier.content;
  const fil = [{ role: 'user', content: charge }, ...messages.slice(1)];
  const schema = d.schema;
  const corpsCommun: Record<string, unknown> = {
    max_tokens: jetonsAccordes(d.maxTokens),
    system: systeme,
    messages: fil,
    ...(schema
      ? { tools: [{ name: 'reponds', description: 'La réponse, dans la forme demandée.', input_schema: schema }], tool_choice: { type: 'tool', name: 'reponds' } }
      : {}),
  };
  let derniere = '';
  for (const modele of MODELES_PAR_USAGE[d.usage]) {
    let r: { status: number; corps: CorpsAnthropic };
    try {
      r = await o.appelleAnthropic({ model: modele, ...corpsCommun });
    } catch (e) {
      return refus(502, 'claude', `Claude n’a pas répondu : ${String((e as Error)?.message ?? e).slice(0, 300)}`);
    }
    if (modeleInconnu(r.status, r.corps)) { derniere = `${modele} : ${r.corps.error?.message ?? r.status}`; continue; }
    if (r.status < 200 || r.status >= 300) return refus(502, 'claude', `Claude n’a pas répondu (${r.status}) : ${r.corps.error?.message ?? 'sans détail'}`.slice(0, 400));

    /* 7. LE COÛT, DÛ MÊME SI LA RÉPONSE EST INUTILISABLE. Les jetons rendus
       par l'API ; le cache (créé ou relu) se compte au plein prix d'entrée :
       le compteur atteint le plafond avant la vraie facture, jamais après.
       Lire, additionner, écrire : UNE seule écriture par appel. Deux appels
       au même instant peuvent se marcher dessus d'un coût d'appel : le
       compteur est une estimation prudente, pas une facture (la vraie se lit
       chez Anthropic), et ce n'est pas grave. */
    const u = r.corps.usage ?? {};
    const entree = Math.max(0, Number(u.input_tokens) || 0) + Math.max(0, Number(u.cache_creation_input_tokens) || 0) + Math.max(0, Number(u.cache_read_input_tokens) || 0);
    const sortie = Math.max(0, Number(u.output_tokens) || 0);
    const cout = coutDeLAppel(modele, entree, sortie);
    const frais = documentApres(await o.base.compteur(), mois, d.chantier, modele, entree, sortie);
    await o.base.ecrisLeCompteur(frais);
    const reste = peutAppeler(lignesDuCompteur(frais), mois, PLAFOND_DES_HUIT_USD).reste;
    /* Le journal, sobre : jamais le contenu, jamais la clé. */
    console.log(`ia-maison: ${d.chantier} ${modele} entrée=${entree} sortie=${sortie} coût=${cout} $ reste=${reste} $`);

    const blocs = r.corps.content ?? [];
    if (schema) {
      const outil = blocs.find((b) => b.type === 'tool_use');
      if (!outil || !outil.input || typeof outil.input !== 'object') return refus(502, 'claude', 'Claude n’a pas répondu dans la forme demandée.', { resteUsd: reste });
      return [200, { ok: true, data: outil.input, texte: '', modele, coutUsd: cout, resteUsd: reste }];
    }
    const texte = blocs.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
    return [200, { ok: true, data: null, texte, modele, coutUsd: cout, resteUsd: reste }];
  }
  return refus(502, 'claude', derniere ? `Aucun modèle n’est ouvert à la clé (${derniere}).` : 'Aucun modèle n’est ouvert à la clé.');
}
// ── FIN iaMaison

/* ══ LES VRAIS OUTILS ═══════════════════════════════════════════════════
   La fonction ne lit que deux documents : la matrice des départements et
   son compteur. Jamais la table des clientes, jamais un autre document. */
async function lisLeDocument<T>(cle: string, defaut: T): Promise<T> {
  const { data } = await admin.from('documents').select('data').eq('key', cle).maybeSingle();
  const v = (data as { data?: unknown } | null)?.data;
  return (v === null || v === undefined ? defaut : v) as T;
}

const base: BaseDeLaMaison = {
  utilisateur: async (jwt) => {
    const { data } = await admin.auth.getUser(jwt);
    return data?.user?.id ?? null;
  },
  staff: async (uid) => {
    const { data } = await admin.from('staff').select('user_id, role').eq('user_id', uid).maybeSingle();
    return (data as LigneStaff | null) ?? null;
  },
  matrice: () => lisLeDocument<Matrice>('mnd_staff_access', {}),
  compteur: () => lisLeDocument<DocumentDuCompteur>(CLE_DU_COMPTEUR_DES_HUIT, {}),
  ecrisLeCompteur: async (doc) => {
    const { error } = await admin.from('documents').upsert({ key: CLE_DU_COMPTEUR_DES_HUIT, data: doc });
    if (error) throw new Error(`compteur : ${error.message}`);
  },
  telecharge: async (coffre, chemin) => {
    const { data, error } = await admin.storage.from(coffre).download(chemin);
    if (error || !data) return null;
    return { octets: new Uint8Array(await data.arrayBuffer()), mime: data.type || '' };
  },
};

/** Anthropic, soixante secondes au plus (une lecture de quatre photos prend
    son temps). Rend le statut et le corps ; lance si le réseau ou le délai
    lâche. La clé ne figure que dans l'en-tête de la requête. */
async function appelleAnthropic(corps: Record<string, unknown>): Promise<{ status: number; corps: CorpsAnthropic }> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manque dans les secrets de la fonction.');
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), 60_000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: arret.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(corps),
    });
    const texte = await r.text();
    let lu: CorpsAnthropic;
    try { lu = JSON.parse(texte) as CorpsAnthropic; } catch { lu = { error: { message: texte.slice(0, 200) } }; }
    return { status: r.status, corps: lu };
  } catch (e) {
    throw new Error(arret.signal.aborted ? 'soixante secondes sans réponse' : String((e as Error)?.message ?? e));
  } finally {
    clearTimeout(minuterie);
  }
}

const outils: OutilsDeLaMaison = { base, appelleAnthropic, maintenant: () => new Date() };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method', version: VERSION }, 405);
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false, erreur: 'format', message: 'La demande n’est pas du JSON.', version: VERSION }, 400); }
  try {
    const [status, corps] = await traiteLaDemande(outils, body, jwt);
    return json({ ...corps, version: VERSION }, status);
  } catch (e) {
    console.error('ia-maison:', String((e as Error)?.message ?? e));
    return json({ ok: false, erreur: 'claude', message: 'La porte a trébuché : réessayez dans un instant.', version: VERSION }, 500);
  }
});
