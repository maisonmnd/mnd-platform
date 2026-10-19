// diagnostic-locks - le diagnostic photo des locks, cote serveur.
//
// LA PREMIERE LIGNE EST VOLONTAIREMENT PAUVRE, comme celles de discussion
// et de whatsapp-webhook : un fichier qu on colle a la main dans un
// navigateur doit commencer par quelque chose qui survit a un collage de
// travers. Le decor vient apres.

/* ═══════════════════════════════════════════════════════════════════════
   DIAGNOSTIC-LOCKS · le diagnostic photo des locks · 19 octobre 2026

   Décisions de Yéman (14 octobre, confirmées le 19) : dans La Consultation
   (payée 15 000 F par KkiaPay) et dans Ma Couronne, la cliente envoie une à
   quatre photos de ses locks ; Claude (Sonnet, repli Haiku) les lit dans les
   mots de la Maison, sans jamais un diagnostic médical ; elle voit sa
   lecture tout de suite, « à confirmer en consultation » ; un maître (la
   direction ou l'Atelier) la relit dans la journée au Trône ; les produits
   conseillés viennent du catalogue du Trône par la table « observation →
   rituel → produit » que la direction corrige ; une peau qui inquiète =
   aucun produit, le mot du médecin, l'équipe prévenue ; les photos vivent
   dans un coffre privé et s'effacent à 90 jours. Les règles vivent dans
   `src/shared/ia-diagnostic-pur.ts`, recopiées ici entre leurs repères.

   LA PORTE N'EST PAS CELLE DU PERSONNEL (les clientes n'ont pas de compte
   du Trône, `ia-maison` ne leur sert pas) :
     · une session Ma Couronne (le jeton de la cliente dans Authorization :
       un compte qui n'est PAS du personnel, et sa fiche) ;
     · ou une consultation payée (`consultationId` + `transactionId` : la
       transaction KkiaPay inscrite au registre `payments` pour CETTE
       consultation, par `kkiapay-verify`).
   L'interrupteur `mnd_auto_config.diagnosticPhoto` ferme tout aux clientes
   tant que la direction ne l'allume pas (403 « ferme »).

   TROIS GESTES, tous en POST JSON :
     · { action: 'etat' }                                → { ouvert }
     · { action: 'lire', consultationId?, transactionId? } → { diagnostics }
     · { action: 'lire-photos', photos: [{ base64, mime }], consentement: 'oui',
         consultationId?, transactionId? }              → { id, lecture, recommandation, texte, etat, mot }
   Un GET rend la version (405) : on ne cherche pas une panne dans un
   fichier qui n'est pas celui qu'on croit déployé.

   Déployez via le tableau de bord (Edge Functions → New function, nom
   « diagnostic-locks », coller ce fichier EN ENTIER), Verify JWT ÉTEINT (La
   Consultation n'a pas de compte ; la session de Ma Couronne se vérifie
   ici). Secrets : ceux qui existent déjà (SERVICE_KEY ou CLE_SERVICE,
   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, ANTHROPIC_API_KEY), aucun de
   nouveau. Migration : 0137_les_photos_du_diagnostic.sql. */
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@maison-mnd.bj';
const ANTHROPIC_API_KEY = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const VERSION = '2026-10-19-a · le diagnostic photo des locks';

function enTacheDeFond(p: Promise<unknown>): void {
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  try { er?.waitUntil?.(p); } catch { /* sans tâche de fond */ }
  p.catch((e) => console.error('diagnostic-locks: tâche de fond', String(e)));
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

const PLAFOND_PAR_DEFAUT_USD = 10;

/** Dollars par million de jetons, entrée et sortie. Un modèle inconnu se
    compte au prix le plus haut de la table. */
const PRIX_PAR_MILLION: Record<string, { entree: number; sortie: number }> = {
  'claude-sonnet-5-5': { entree: 3, sortie: 15 },
  'claude-haiku-4-5-20251001': { entree: 1, sortie: 5 },
  'claude-opus-5-5': { entree: 15, sortie: 75 },
  'claude-opus-4-8': { entree: 15, sortie: 75 },
};

const LE_PLUS_CHER = Object.values(PRIX_PAR_MILLION).reduce(
  (m, p) => ({ entree: Math.max(m.entree, p.entree), sortie: Math.max(m.sortie, p.sortie) }),
  { entree: 0, sortie: 0 },
);

/** Le coût d'un appel, en dollars, arrondi au centième de cent supérieur. */
function coutDeLAppel(modele: string, jetonsEntree: number, jetonsSortie: number): number {
  const p = PRIX_PAR_MILLION[modele] ?? LE_PLUS_CHER;
  const brut = (Math.max(0, jetonsEntree) * p.entree + Math.max(0, jetonsSortie) * p.sortie) / 1_000_000;
  return Math.ceil(brut * 10_000) / 10_000;
}

/** « 2026-10 » : le mois à Cotonou. */
function moisACotonou(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
  } catch {
    return d.toISOString().slice(0, 7);
  }
}

type LigneDuCompteur = { usd: number; appels: number; entree: number; sortie: number };
type Compteur = Record<string, LigneDuCompteur>;

const depenseDuMois = (c: Compteur | null | undefined, mois: string): number => c?.[mois]?.usd ?? 0;

/** Un appel peut-il partir ? Le plafond se lit avant l'appel : à 10 $ pile,
    plus rien ne part. Un plafond absent ou abîmé vaut celui par défaut. */
function peutAppeler(c: Compteur | null | undefined, mois: string, plafondUsd?: number): { oui: boolean; reste: number; plafond: number } {
  const plafond = Number.isFinite(plafondUsd) && (plafondUsd as number) > 0 ? (plafondUsd as number) : PLAFOND_PAR_DEFAUT_USD;
  const depense = depenseDuMois(c, mois);
  const reste = Math.max(0, Math.round((plafond - depense) * 10_000) / 10_000);
  return { oui: depense < plafond, reste, plafond };
}

/** Le compteur après un appel : une ligne par mois, rien d'autre ne bouge. */
function compteurApres(c: Compteur | null | undefined, mois: string, modele: string, entree: number, sortie: number): Compteur {
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
function sansCoordonnees(texte: string): string {
  return String(texte ?? '')
    .replace(COURRIEL, '[adresse]')
    .replace(TELEPHONE, (m) => (DATE_ISO.test(m.trim()) ? m : '[numéro]'));
}

type Personne = { prenom?: string; nom?: string };

const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** « Awa D. » : le prénom, l'initiale du nom. Sans prénom, les initiales. */
function prenomEtInitiale(p: Personne): string {
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
function nomsEnInitiales(texte: string, personnes: readonly Personne[]): string {
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
const pourClaude = (texte: string, personnes: readonly Personne[] = []): string =>
  sansCoordonnees(nomsEnInitiales(texte, personnes));

/** Un objet entier, champ par champ (les clés ne changent pas). */
function objetPourClaude<T>(valeur: T, personnes: readonly Personne[] = []): T {
  if (typeof valeur === 'string') return pourClaude(valeur, personnes) as unknown as T;
  if (Array.isArray(valeur)) return valeur.map((v) => objetPourClaude(v, personnes)) as unknown as T;
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur as Record<string, unknown>).map(([k, v]) => [k, objetPourClaude(v, personnes)])) as T;
  }
  return valeur;
}
// ── FIN DE LA COPIE ──

/* LES RÈGLES DU DIAGNOSTIC, RECOPIÉES de `src/shared/ia-diagnostic-pur.ts`.
   NE RIEN RETOUCHER ENTRE LES REPÈRES : on corrige l'original, puis on
   recopie le bloc entier ; `verifie-les-douze-lunes` (R8) confronte les deux. */
/* ⟨diagnostic-locks⟩ */
export const VERSION_DU_DIAGNOSTIC = '2026-10-19-a';
/** Une à quatre photos de la même couronne (sa décision). */
export const PHOTOS_MIN = 1;
export const PHOTOS_MAX = 4;
/** 4 Mo par photo en clair : le téléphone réduit avant d'envoyer. */
export const OCTETS_MAX_PAR_PHOTO = 4_000_000;
/** 90 jours (sa décision), puis les photos s'effacent ; la lecture reste. */
export const GARDE_DES_PHOTOS_JOURS = 90;
export const COFFRE_DES_PHOTOS_DU_DIAGNOSTIC = 'photos-du-diagnostic';
export const TABLE_DES_DIAGNOSTICS = 'diagnostics';
/** La table « observation → rituel → produit » corrigée par la direction. */
export const CLE_DE_LA_TABLE_DU_DIAGNOSTIC = 'mnd_diagnostic_table';
/** Le compteur du diagnostic, à part de ceux des agents et des huit. */
export const CLE_DU_COMPTEUR_DU_DIAGNOSTIC = 'mnd_ia_compteur_diagnostic';
export const PLAFOND_DU_DIAGNOSTIC_USD = 20;
/** Sonnet lit les photos ; Haiku prend le relais si Sonnet n'est pas ouvert à la clé. */
export const MODELES_DU_DIAGNOSTIC: readonly string[] = ['claude-sonnet-5-5', 'claude-haiku-5-5'];
/** Cinq lectures par dix minutes et par adresse. */
export const SEAU_DU_DIAGNOSTIC = 5;
/** Au plus trois rituels et deux produits : une lecture propose, elle ne vend pas. */
export const RITUELS_MAX = 3;
export const PRODUITS_MAX = 2;

/* ── LES ÉNUMÉRATIONS FERMÉES ──────────────────────────────────────────
   Claude ne choisit que dans ces listes ; ce qui n'y est pas se refuse. */
export const OBSERVATIONS = [
  { cle: 'secheresse', dit: 'Sécheresse' },
  { cle: 'frisottis', dit: 'Frisottis et repousse' },
  { cle: 'racines-laches', dit: 'Racines lâches' },
  { cle: 'amincissement', dit: 'Amincissement' },
  { cle: 'pellicules', dit: 'Pellicules visibles' },
  { cle: 'residus', dit: 'Résidus' },
  { cle: 'pointes-abimees', dit: 'Pointes abîmées' },
  { cle: 'casse', dit: 'Casse' },
] as const;
export type Observation = (typeof OBSERVATIONS)[number]['cle'];
export const ZONES = [
  { cle: 'racines', dit: 'les racines' },
  { cle: 'longueurs', dit: 'les longueurs' },
  { cle: 'pointes', dit: 'les pointes' },
  { cle: 'cuir-chevelu', dit: 'le cuir chevelu' },
] as const;
export type Zone = (typeof ZONES)[number]['cle'];
export const INTENSITES = [
  { cle: 'legere', dit: 'légère', poids: 1 },
  { cle: 'marquee', dit: 'marquée', poids: 2 },
  { cle: 'forte', dit: 'forte', poids: 3 },
] as const;
export type Intensite = (typeof INTENSITES)[number]['cle'];
/** Le calibre ESTIMÉ d'après la photo : jamais le compte exact, qui se fait à la Maison. */
export const CALIBRES_ESTIMES = [
  { cle: 'micro', dit: 'micro' }, { cle: 'fin', dit: 'fin' }, { cle: 'moyen', dit: 'moyen' },
  { cle: 'epais', dit: 'épais' }, { cle: 'incertain', dit: 'à constater à la Maison' },
] as const;
export type CalibreEstime = (typeof CALIBRES_ESTIMES)[number]['cle'];
/** Les trois longueurs du catalogue, et le doute. */
export const LONGUEURS_ESTIMEES = [
  { cle: 'court', dit: 'court' }, { cle: 'mi-long', dit: 'mi-long' }, { cle: 'long', dit: 'long' },
  { cle: 'incertain', dit: 'à constater à la Maison' },
] as const;
export type LongueurEstimee = (typeof LONGUEURS_ESTIMEES)[number]['cle'];
/** LA PEAU QUI INQUIÈTE (sa décision) : un drapeau, jamais un mot de plus. */
export const DRAPEAUX_PEAU = [
  { cle: 'rougeur', dit: 'une rougeur' },
  { cle: 'plaie', dit: 'une plaie' },
  { cle: 'croutes', dit: 'des croûtes' },
  { cle: 'chute-en-plaques', dit: 'une chute en plaques' },
] as const;
export type DrapeauPeau = (typeof DRAPEAUX_PEAU)[number]['cle'];
export const QUALITES_DE_PHOTO = ['bonne', 'moyenne', 'insuffisante'] as const;
export type QualiteDePhoto = (typeof QUALITES_DE_PHOTO)[number];

export type ObservationLue = { cle: Observation; zone: Zone; intensite: Intensite };
export type Lecture = {
  observations: ObservationLue[];
  calibre: CalibreEstime;
  longueur: LongueurEstimee;
  peau: DrapeauPeau[];
  qualite: QualiteDePhoto;
  /** Trois phrases de Claude, repassées par `texteSansPromesse` avant d'être montrées. */
  resume: string;
};

/* ── LA TABLE PAR DÉFAUT : observation → rituel → produit ──────────────
   Écrite ici le 19 octobre 2026, « à valider » par la direction au Trône.
   Un rituel se reconnaît par des MOTS dans son nom ou dans celui de son
   atelier (le catalogue vivant a ses propres noms) ; un produit par les
   quatre mots que le Trône connaît : huile, shampoing, beurre, sérum. Une
   observation sans mot de produit ne propose aucun produit, et c'est voulu
   (une repousse se reprend au fauteuil, elle ne s'achète pas). */
export type LigneDeLaTable = { observation: Observation; rituel: string[]; produits: string[] };
export const MOTS_DE_PRODUIT: readonly string[] = ['huile', 'shampoing', 'beurre', 'sérum'];
/* « soin » seul reconnaissait aussi les soins annexes et la reconstruction
   (reprise du 19 octobre) : la sécheresse et les pointes appellent le soin
   HYDRATANT, DÀNDÀN™. */
export const TABLE_PAR_DEFAUT: readonly LigneDeLaTable[] = [
  { observation: 'secheresse', rituel: ['hydratant', 'dandan'], produits: ['huile', 'beurre'] },
  { observation: 'frisottis', rituel: ['reprise', 'resserrage', 'sinsin', 'racines'], produits: [] },
  { observation: 'racines-laches', rituel: ['reprise', 'resserrage', 'sinsin'], produits: [] },
  { observation: 'amincissement', rituel: ['reconstruction', 'gbigbi', 'renfor'], produits: ['sérum'] },
  { observation: 'pellicules', rituel: ['purification', 'wewe', 'lavage', 'kloklo'], produits: ['shampoing'] },
  { observation: 'residus', rituel: ['purification', 'wewe', 'lavage', 'kloklo'], produits: ['shampoing'] },
  { observation: 'pointes-abimees', rituel: ['hydratant', 'dandan', 'pointes'], produits: ['huile', 'beurre'] },
  { observation: 'casse', rituel: ['reconstruction', 'gbigbi', 'restauration', 'finfin'], produits: ['sérum', 'huile'] },
];
/** Ce qu'un diagnostic ne propose jamais comme rituel : une consultation
    (la lecture y renvoie déjà), le défaisage, l'Académie (`aca-…`) ; et,
    depuis la reprise du 19 octobre, le Studio (`stu-…`, il ne touche jamais
    aux locks), le droit de service et les suppléments, qui ne sont pas des
    rituels. */
const CATEGORIES_HORS_RITUEL: readonly string[] = ['doto', 'koko', 'plt-45', 'cat-defaisage', 'dds', 'sup'];
const PREFIXES_HORS_RITUEL: readonly string[] = ['aca-', 'stu-'];

export const MOT_A_CONFIRMER = 'À confirmer en consultation.';
export const MOT_RELU = 'Relu par la Maison.';
export const MOT_SANS_LECTURE = 'La Maison relit vos photos et vous répond dans la journée.';
export const MOT_PEAU = 'Ce que montrent vos photos mérite d’abord l’avis d’un médecin ou d’un dermatologue. La Maison ne propose aucun produit ici ; l’équipe est prévenue et vous rappelle.';
export const MOT_DES_PRODUITS = 'mis de côté pour votre prochain passage';

const estParmi = <T extends string>(liste: readonly { cle: T }[], v: unknown): v is T => liste.some((x) => x.cle === v);
const estUne = <T extends string>(liste: readonly T[], v: unknown): v is T => (liste as readonly unknown[]).includes(v);
const ditDe = (liste: readonly { cle: string; dit: string }[], cle: string): string =>
  liste.find((x) => x.cle === cle)?.dit ?? cle;
/** Sans accents ni majuscules, pour reconnaître un mot dans un nom. Les
    lettres du fon se lisent aussi (« KLƆKLƆ » se reconnaît par « kloklo »). */
export const motSimple = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ɔ/g, 'o').replace(/ɛ/g, 'e').replace(/ɖ/g, 'd').trim();
const motsPropres = (brut: unknown, max: number): string[] =>
  (Array.isArray(brut) ? brut : typeof brut === 'string' ? brut.split(/[,;]/) : [])
    .map((m) => String(m ?? '').trim().slice(0, 40)).filter((m) => m.length >= 3).slice(0, max);

/** LA TABLE, TELLE QU'ON PEUT S'Y FIER. Le document de la direction peut
    être absent, une liste, ou `{ lignes }` ; une observation qu'il ne porte
    pas garde sa ligne par défaut ; une ligne qu'il porte la remplace, mots
    nettoyés et bornés. Une table abîmée retombe entièrement sur le défaut. */
export function tableValide(brut: unknown): LigneDeLaTable[] {
  const lignes = Array.isArray(brut) ? brut : (brut && typeof brut === 'object' && Array.isArray((brut as { lignes?: unknown }).lignes))
    ? (brut as { lignes: unknown[] }).lignes : [];
  const siennes = new Map<Observation, LigneDeLaTable>();
  for (const l of lignes) {
    const o = (l as { observation?: unknown })?.observation;
    if (!estParmi(OBSERVATIONS, o)) continue;
    siennes.set(o, { observation: o, rituel: motsPropres((l as { rituel?: unknown }).rituel, 8), produits: motsPropres((l as { produits?: unknown }).produits, 4) });
  }
  return TABLE_PAR_DEFAUT.map((d) => siennes.get(d.observation) ?? { observation: d.observation, rituel: [...d.rituel], produits: [...d.produits] });
}

/** CE QUE CLAUDE A RENDU, AVANT QU'ON Y CROIE. Ni objet : rien. Une liste
    d'observations qui n'est pas une liste : rien. Une observation hors des
    listes se laisse tomber ; un calibre ou une longueur inconnus deviennent
    « incertain » (c'est ce qu'ils sont) ; un drapeau inventé ne compte pas ;
    un résumé qui n'est pas un texte devient vide. */
export function lectureDuDiagnostic(brut: unknown): Lecture | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const b = brut as Record<string, unknown>;
  if (!Array.isArray(b.observations)) return null;
  const vues = new Set<string>();
  const observations: ObservationLue[] = [];
  for (const o of b.observations.slice(0, 16)) {
    const x = o as { cle?: unknown; zone?: unknown; intensite?: unknown } | null;
    if (!x || !estParmi(OBSERVATIONS, x.cle) || !estParmi(ZONES, x.zone) || !estParmi(INTENSITES, x.intensite)) continue;
    const k = `${x.cle}|${x.zone}`;
    if (vues.has(k)) continue;
    vues.add(k);
    observations.push({ cle: x.cle, zone: x.zone, intensite: x.intensite });
    if (observations.length >= 8) break;
  }
  const peau = Array.isArray(b.peau) ? [...new Set(b.peau.filter((p): p is DrapeauPeau => estParmi(DRAPEAUX_PEAU, p)))] : [];
  return {
    observations,
    calibre: estParmi(CALIBRES_ESTIMES, b.calibre) ? b.calibre : 'incertain',
    longueur: estParmi(LONGUEURS_ESTIMEES, b.longueur) ? b.longueur : 'incertain',
    peau,
    qualite: estUne(QUALITES_DE_PHOTO, b.qualite) ? b.qualite : 'moyenne',
    resume: typeof b.resume === 'string' ? b.resume.slice(0, 1200) : '',
  };
}

export type Catalogue = {
  services: readonly { id: string; name: string; categoryId?: string; archived?: boolean }[];
  categories: readonly { id: string; fon?: string; label?: string; parentId?: string }[];
  products: readonly { id: string; name: string; priceXof: number; stock: number }[];
};
export type Recommandation = {
  rituels: { id: string; nom: string }[];
  produits: { id: string; nom: string; prixXof: number }[];
  peauInquiete: boolean;
  mot: string;
};

/** LA RECOMMANDATION, DEPUIS LA LECTURE, LA TABLE ET LE CATALOGUE VIVANT.
    Les observations les plus fortes passent d'abord ; chaque ligne de la
    table cherche ses mots dans le nom des rituels (et de leur atelier) et
    des produits du Trône ; trois rituels et deux produits au plus, chacun
    une fois ; un produit sans stock ne se met pas de côté. UNE PEAU QUI
    INQUIÈTE (sa décision) : aucun produit, aucun rituel, le mot du médecin. */
export function recommande(lecture: Lecture, table: readonly LigneDeLaTable[], catalogue: Catalogue): Recommandation {
  if (lecture.peau.length > 0) return { rituels: [], produits: [], peauInquiete: true, mot: MOT_PEAU };
  const poids = (i: Intensite): number => INTENSITES.find((x) => x.cle === i)?.poids ?? 0;
  const ordre = [...lecture.observations].sort((a, b) => poids(b.intensite) - poids(a.intensite));
  const nomDeLAtelier = (categoryId?: string): string => {
    let cur = catalogue.categories.find((c) => c.id === categoryId);
    const bouts: string[] = [];
    for (let i = 0; cur && i < 8; i += 1) { bouts.push(cur.fon ?? '', cur.label ?? ''); cur = catalogue.categories.find((c) => c.id === cur!.parentId); }
    return bouts.join(' ');
  };
  const horsRituel = (categoryId?: string): boolean => {
    let cur = catalogue.categories.find((c) => c.id === categoryId);
    if (CATEGORIES_HORS_RITUEL.includes(categoryId ?? '') || PREFIXES_HORS_RITUEL.some((p) => (categoryId ?? '').startsWith(p))) return true;
    for (let i = 0; cur && i < 8; i += 1) { if (CATEGORIES_HORS_RITUEL.includes(cur.id) || PREFIXES_HORS_RITUEL.some((p) => cur!.id.startsWith(p))) return true; cur = catalogue.categories.find((c) => c.id === cur!.parentId); }
    return false;
  };
  const rituels: Recommandation['rituels'] = [];
  const produits: Recommandation['produits'] = [];
  for (const o of ordre) {
    const ligne = table.find((l) => l.observation === o.cle);
    if (!ligne) continue;
    const motsR = ligne.rituel.map(motSimple).filter(Boolean);
    const motsP = ligne.produits.map(motSimple).filter(Boolean);
    for (const s of catalogue.services) {
      if (rituels.length >= RITUELS_MAX) break;
      if (s.archived || horsRituel(s.categoryId) || rituels.some((r) => r.id === s.id)) continue;
      const texte = motSimple(`${s.name} ${nomDeLAtelier(s.categoryId)}`);
      if (motsR.some((m) => texte.includes(m))) rituels.push({ id: s.id, nom: s.name });
    }
    for (const p of catalogue.products) {
      if (produits.length >= PRODUITS_MAX) break;
      if (!(p.stock > 0) || produits.some((x) => x.id === p.id)) continue;
      const nom = motSimple(p.name);
      if (motsP.some((m) => nom.includes(m))) produits.push({ id: p.id, nom: p.name, prixXof: Math.max(0, Math.round(Number(p.priceXof) || 0)) });
    }
  }
  return { rituels, produits, peauInquiete: false, mot: MOT_A_CONFIRMER };
}

/** CE QUE LA CLIENTE LIT, SANS PROMESSE. Un montant (« 15 000 F »), le mot
    « salon », le nom d'une maladie ou un mot de traitement : rien ne part,
    le résumé composé prend la place. Une phrase qui garantit, promet, parle
    de porosité ou de résultat tombe ; le tiret long devient une virgule ;
    « À confirmer en consultation. » clôt toujours. */
export function texteSansPromesse(texte: unknown): string {
  let t = String(texte ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (/\d[\d\s.,]*\s*(f\b|f\.|fcfa|cfa|xof|francs?\b|€|\$)/i.test(t)) return '';
  if (/\bsalons?\b/i.test(t)) return '';
  if (/ecz[ée]ma|psoriasis|teigne|mycose|alop[ée]cie|infection|dermatite|champignon|bact[ée]ri|allergi|traitement|m[ée]dicament|ordonnance|cortico|antifongique|antibiot/i.test(t)) return '';
  const phrases = t.split(/(?<=[.!?])\s+/).filter((p) => !/garant|promet|r[ée]sultat|porosit|en \d+ (jours|semaines|mois)|dispara[iî]t/i.test(p));
  t = phrases.join(' ').trim();
  if (!t) return '';
  if (t.length > 600) t = `${t.slice(0, 600).replace(/\s+\S*$/, '')}…`;
  if (!/[.!?…]$/.test(t)) t = `${t}.`;
  return /confirmer en consultation/i.test(t) ? t : `${t} ${MOT_A_CONFIRMER}`;
}

/** LE RÉSUMÉ COMPOSÉ DEPUIS LES LISTES FERMÉES : ce qu'on montre quand le
    texte de Claude ne passe pas, et ce que le Trône relit à côté. */
export function resumeDepuisLesObservations(lecture: Lecture): string {
  if (lecture.peau.length > 0) return MOT_PEAU;
  const parts: string[] = [];
  if (lecture.qualite === 'insuffisante') parts.push('Vos photos ne permettent pas une lecture sûre : reprenez-les à la lumière du jour, de près.');
  if (lecture.observations.length) {
    const dits = lecture.observations.map((o) => `${ditDe(OBSERVATIONS, o.cle).toLowerCase()} ${ditDe(INTENSITES, o.intensite)} sur ${ditDe(ZONES, o.zone)}`);
    parts.push(`Vos photos montrent : ${dits.join(', ')}.`);
  } else if (lecture.qualite !== 'insuffisante') {
    parts.push('Vos photos ne montrent rien qui appelle un geste particulier.');
  }
  parts.push(`Calibre estimé : ${ditDe(CALIBRES_ESTIMES, lecture.calibre)}. Longueur estimée : ${ditDe(LONGUEURS_ESTIMEES, lecture.longueur)}.`);
  parts.push(MOT_A_CONFIRMER);
  return parts.join(' ');
}

/** La consigne de Claude : lire, dans les mots de la Maison, sans jamais
    soigner. Le prénom et l'initiale, rien d'autre d'elle. */
export function consigneDuDiagnostic(o: { appel: string; nbPhotos: number }): string {
  return [
    'Tu lis des photos de locks pour la Maison MND, une maison de soin des locks à Cotonou (Bénin). Tu rends UNE lecture, dans la forme demandée, et rien d’autre.',
    `La personne : ${o.appel || 'la cliente'}. Tu ne connais que ce prénom ; n’invente ni nom ni civilité.`,
    `Tu reçois ${o.nbPhotos} photo(s) de la même couronne.`,
    '',
    'Ce que tu lis, et seulement cela :',
    '- l’état par zone (racines, longueurs, pointes, cuir chevelu), parmi les observations fermées : sécheresse, frisottis et repousse, racines lâches, amincissement, pellicules visibles, résidus, pointes abîmées, casse ; chacune avec son intensité (légère, marquée, forte) ;',
    '- le calibre estimé des locks (micro, fin, moyen, épais), « incertain » si la photo ne le montre pas ;',
    '- la longueur estimée (court : jusqu’aux épaules ; mi-long : des épaules aux omoplates ; long : au-delà), « incertain » sinon ;',
    '- la qualité des photos (bonne, moyenne, insuffisante).',
    '',
    'Règles absolues :',
    '- Tu ne poses JAMAIS de diagnostic médical : tu ne nommes aucune maladie, tu ne donnes aucun conseil médical, aucun traitement, aucun produit.',
    '- Si tu vois une rougeur, une plaie, des croûtes ou une chute en plaques, tu le signales SEULEMENT par le drapeau prévu, sans un mot de plus dans le résumé : la personne sera invitée à consulter un médecin ou un dermatologue.',
    '- Une photo ne mesure pas la porosité : n’en parle jamais.',
    '- Tu ne donnes JAMAIS de prix, de garantie de résultat, ni de délai de repousse.',
    '- Tu dis ce que tu VOIS, au conditionnel quand tu doutes ; ce que la photo ne montre pas reste « incertain ».',
    '- Tu parles dans les mots de la Maison : « locks », « couronne », « racines », « longueurs », « pointes », « cuir chevelu », « rituel » ; jamais « salon », jamais « dreads ».',
    '- Le résumé : trois phrases courtes au plus, en français, qui s’adressent à la personne (« vos locks »), sans liste, sans titre, sans émoji, sans tiret long.',
  ].join('\n');
}

/** La forme que Claude doit rendre : un outil à appeler, jamais du texte libre. */
export const SCHEMA_DE_LA_LECTURE: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['observations', 'calibre', 'longueur', 'peau', 'qualite', 'resume'],
  properties: {
    observations: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false, required: ['cle', 'zone', 'intensite'],
        properties: {
          cle: { type: 'string', enum: OBSERVATIONS.map((o) => o.cle) },
          zone: { type: 'string', enum: ZONES.map((z) => z.cle) },
          intensite: { type: 'string', enum: INTENSITES.map((i) => i.cle) },
        },
      },
    },
    calibre: { type: 'string', enum: CALIBRES_ESTIMES.map((c) => c.cle) },
    longueur: { type: 'string', enum: LONGUEURS_ESTIMEES.map((l) => l.cle) },
    peau: { type: 'array', maxItems: 4, items: { type: 'string', enum: DRAPEAUX_PEAU.map((d) => d.cle) } },
    qualite: { type: 'string', enum: [...QUALITES_DE_PHOTO] },
    resume: { type: 'string', maxLength: 900 },
  },
};

/** QUI RELIT (sa décision : la direction et le département Atelier), et
    personne d'autre : un maître de la Clientèle voit l'écran des
    consultations, il ne relit pas une lecture de photos. */
export const peutRelire = (role: string | undefined, acces: Record<string, boolean> | undefined): boolean =>
  role === 'souverain' || role === 'gerant' || (role === 'maitre' && acces?.['dept-atelier'] === true);

/** Où une photo vit dans le coffre : la branche, le diagnostic, son rang. */
export const cheminDeLaPhotoDuDiagnostic = (branchId: string, diagnosticId: string, n: number): string =>
  `${branchId || 'maison'}/${diagnosticId}/${n}.jpg`;

/** Les formats qu'on sait garder et montrer à Claude. */
export function formatDePhotoPermis(mime: unknown): boolean {
  const m = String(mime ?? '').toLowerCase().split(';')[0].trim();
  return m === 'image/jpeg' || m === 'image/png' || m === 'image/webp';
}

/** L'instant avant lequel les photos d'un diagnostic doivent être effacées. */
export const limiteDeGardeDesPhotos = (maintenantMs: number): number => maintenantMs - GARDE_DES_PHOTOS_JOURS * 86_400_000;

/** Les diagnostics dont les photos partent : créés avant la limite, photos
    encore là, pas encore effacées. */
export function diagnosticsAuxPhotosAEffacer<T extends { id: string; cree_le?: string; data?: { photos?: unknown; photosEffaceesLe?: unknown } }>(
  lignes: readonly T[], maintenantMs: number,
): T[] {
  const limite = limiteDeGardeDesPhotos(maintenantMs);
  return lignes.filter((d) => Array.isArray(d.data?.photos) && d.data!.photos.length > 0 && !d.data?.photosEffaceesLe
    && Number.isFinite(Date.parse(d.cree_le ?? '')) && Date.parse(d.cree_le!) < limite);
}

export type EtatDuDiagnostic = 'a-relire' | 'relu' | 'ferme';
export const ETATS_DU_DIAGNOSTIC: readonly EtatDuDiagnostic[] = ['a-relire', 'relu', 'ferme'];
/** Ce que la cliente lit sous sa lecture, selon l'état. */
export const motDeLEtat = (etat: string | undefined, peauInquiete = false): string =>
  (peauInquiete ? MOT_PEAU : etat === 'relu' ? MOT_RELU : MOT_A_CONFIRMER);
/* ⟨/diagnostic-locks⟩ */

/* ══ LE DIAGNOSTIC, SANS BASE NI RÉSEAU ═════════════════════════════════
   Tout ce qui suit jusqu'au repère de fin reçoit ses outils (la base, la
   montre, la porte, Claude, l'alerte) au lieu de les prendre :
   `verifie-le-diagnostic-photo` le rejoue sur une fausse base. */
// ── DEBUT diagnostic
type Porte = { source: 'consultation' | 'couronne'; branchId: string; clientId: string | null; consultationId: string | null; appel: string };
type DonneesDuDiagnostic = {
  appel: string; consultationId: string | null; consentementLe: string; photos: string[];
  lecture: Lecture | null; recommandation: Recommandation | null; texte: string; sansLecture: boolean;
  modele: string | null; coutUsd: number; correction?: string; photosEffaceesLe?: string;
};
type LigneDiagnostic = {
  id: string; branch_id: string | null; client_id: string | null; source: 'consultation' | 'couronne';
  data: DonneesDuDiagnostic; etat: string; cree_le: string; relu_le?: string | null;
};
type Photo = { base64: string; mime: string };
type BaseDuDiagnostic = {
  interrupteur(): Promise<boolean>;
  table(): Promise<unknown>;
  catalogue(): Promise<Catalogue>;
  compteur(): Promise<Compteur>;
  ecrisLeCompteur(c: Compteur): Promise<void>;
  depose(chemin: string, octets: Uint8Array, mime: string): Promise<boolean>;
  retire(chemins: string[]): Promise<boolean>;
  cree(l: LigneDiagnostic): Promise<boolean>;
  touche(id: string, champs: Record<string, unknown>): Promise<void>;
  miens(porte: Porte): Promise<LigneDiagnostic[]>;
  vieux(limiteIso: string): Promise<LigneDiagnostic[]>;
};
type RequeteDuDiagnostic = { jwt: string; body: Record<string, unknown> };
type OutilsDuDiagnostic = {
  base: BaseDuDiagnostic;
  maintenant: () => number;
  nouvelId: () => string;
  porte: (r: RequeteDuDiagnostic) => Promise<Porte | null | 'personnel'>;
  claude: (consigne: string, photos: Photo[], schema: unknown) => Promise<{ brut: unknown; modele: string; entree: number; sortie: number } | null>;
  alerte: (o: { titre: string; corps: string; diagnosticId: string; urgent: boolean }) => Promise<number>;
  fond: (p: Promise<unknown>) => void;
};
type Reponse = [number, Record<string, unknown>];

const isoDe = (ms: number): string => new Date(ms).toISOString();
const octetsDe = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Ce que la cliente relit d'un diagnostic : jamais qui l'a relu. */
const pourLaCliente = (l: LigneDiagnostic) => ({
  id: l.id, cree_le: l.cree_le, etat: l.etat,
  lecture: l.data.lecture ?? null, recommandation: l.data.recommandation ?? null, texte: l.data.texte ?? '',
  correction: l.data.correction ?? null, relu_le: l.relu_le ?? null, photosEffaceesLe: l.data.photosEffaceesLe ?? null,
  mot: l.data.sansLecture && l.etat !== 'relu' ? MOT_SANS_LECTURE : motDeLEtat(l.etat, l.data.recommandation?.peauInquiete === true),
});

async function etatDuDiagnostic(o: OutilsDuDiagnostic): Promise<Reponse> {
  return [200, { ok: true, ouvert: await o.base.interrupteur(), version: VERSION_DU_DIAGNOSTIC }];
}

async function lire(o: OutilsDuDiagnostic, r: RequeteDuDiagnostic): Promise<Reponse> {
  const porte = await o.porte(r);
  if (porte === 'personnel') return [403, { error: 'personnel' }];
  if (!porte) return [403, { error: 'porte' }];
  const miens = await o.base.miens(porte);
  return [200, { ok: true, diagnostics: miens.slice(0, 20).map(pourLaCliente) }];
}

/** LES PHOTOS DE PLUS DE 90 JOURS S'EFFACENT (sa décision) ; la lecture reste
    et dit quand ses photos sont parties. Cinquante à la fois, en passant. */
async function effaceLesVieillesPhotos(o: OutilsDuDiagnostic, maintenantMs: number): Promise<void> {
  const vieux = await o.base.vieux(isoDe(limiteDeGardeDesPhotos(maintenantMs)));
  const aEffacer = diagnosticsAuxPhotosAEffacer(vieux, maintenantMs);
  if (!aEffacer.length) return;
  const chemins = aEffacer.flatMap((d) => d.data.photos);
  if (chemins.length && !(await o.base.retire(chemins))) return;
  const le = isoDe(o.maintenant());
  for (const d of aEffacer) await o.base.touche(d.id, { data: { ...d.data, photos: [], photosEffaceesLe: le } });
}

async function lirePhotos(o: OutilsDuDiagnostic, r: RequeteDuDiagnostic): Promise<Reponse> {
  /* FERMÉ TANT QUE LA DIRECTION NE L'ALLUME PAS (sa décision du 19 octobre). */
  if (!(await o.base.interrupteur())) return [403, { error: 'ferme' }];
  const porte = await o.porte(r);
  if (porte === 'personnel') return [403, { error: 'personnel' }];
  if (!porte) return [403, { error: 'porte' }];
  const body = r.body;
  /* L'ACCORD EXPLICITE : « j'accepte que la Maison garde ces photos 90 jours ». */
  if (body.consentement !== 'oui') return [400, { error: 'consentement' }];
  const brutes = Array.isArray(body.photos) ? body.photos : [];
  if (brutes.length < PHOTOS_MIN || brutes.length > PHOTOS_MAX) return [400, { error: 'photos' }];
  const photos: Photo[] = [];
  for (const p of brutes as { base64?: unknown; mime?: unknown }[]) {
    const mime = String(p?.mime ?? '').toLowerCase().split(';')[0].trim();
    const b64 = typeof p?.base64 === 'string' ? p.base64.replace(/^data:[^,]*,/, '').trim() : '';
    if (!formatDePhotoPermis(mime)) return [415, { error: 'format' }];
    if (b64.length < 100) return [400, { error: 'photos' }];
    if (b64.length > OCTETS_MAX_PAR_PHOTO * 1.37) return [413, { error: 'too_large' }];
    photos.push({ base64: b64, mime });
  }
  /* LE PLAFOND, LU AVANT L'APPEL : 20 $ par mois pour le diagnostic, à part. */
  const maintenant = o.maintenant();
  const mois = moisACotonou(new Date(maintenant));
  const permis = peutAppeler(await o.base.compteur(), mois, PLAFOND_DU_DIAGNOSTIC_USD);
  if (!permis.oui) return [429, { error: 'budget' }];

  /* LES PHOTOS AU COFFRE D'ABORD : si Claude se tait, la Maison les relit quand même. */
  const id = o.nouvelId();
  const chemins: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const chemin = cheminDeLaPhotoDuDiagnostic(porte.branchId, id, i + 1);
    if (!(await o.base.depose(chemin, octetsDe(photos[i].base64), photos[i].mime))) {
      await o.base.retire(chemins);
      return [500, { error: 'coffre' }];
    }
    chemins.push(chemin);
  }

  /* CLAUDE LIT. Le coût se compte même si la réponse est inutilisable : il est dû. */
  const consigne = consigneDuDiagnostic({ appel: sansCoordonnees(porte.appel), nbPhotos: photos.length });
  const r2 = await o.claude(consigne, photos, SCHEMA_DE_LA_LECTURE).catch(() => null);
  if (r2) await o.base.ecrisLeCompteur(compteurApres(await o.base.compteur(), mois, r2.modele, r2.entree, r2.sortie));
  const lecture = r2 ? lectureDuDiagnostic(r2.brut) : null;
  const [table, catalogue] = await Promise.all([o.base.table(), o.base.catalogue()]);
  const recommandation = lecture ? recommande(lecture, tableValide(table), catalogue) : null;
  const texte = lecture ? (texteSansPromesse(lecture.resume) || resumeDepuisLesObservations(lecture)) : '';

  const ligne: LigneDiagnostic = {
    id, branch_id: porte.branchId || null, client_id: porte.clientId, source: porte.source, etat: 'a-relire', cree_le: isoDe(maintenant),
    data: {
      appel: porte.appel, consultationId: porte.consultationId, consentementLe: isoDe(maintenant), photos: chemins,
      lecture, recommandation, texte, sansLecture: !lecture,
      modele: r2?.modele ?? null, coutUsd: r2 ? coutDeLAppel(r2.modele, r2.entree, r2.sortie) : 0,
    },
  };
  if (!(await o.base.cree(ligne))) {
    await o.base.retire(chemins);
    return [500, { error: 'insert_failed' }];
  }
  /* L'ÉQUIPE L'APPREND : la direction et l'Atelier relisent dans la journée ;
     une peau qui inquiète sonne autrement (sa décision). */
  const urgent = recommandation?.peauInquiete === true;
  o.fond(o.alerte({
    titre: urgent ? 'Diagnostic photo · une peau à regarder' : 'Diagnostic photo à relire',
    corps: `${porte.appel || 'Une cliente'} · ${photos.length} photo${photos.length > 1 ? 's' : ''}${lecture ? '' : ' · Claude n’a pas lu, à lire à la main'}`,
    diagnosticId: id, urgent,
  }));
  /* 90 jours (sa décision) : les vieilles photos partent, en passant. */
  o.fond(effaceLesVieillesPhotos(o, maintenant));
  return [200, {
    ok: true, id, etat: 'a-relire', lecture, recommandation, texte,
    mot: lecture ? (urgent ? MOT_PEAU : MOT_A_CONFIRMER) : MOT_SANS_LECTURE,
  }];
}
// ── FIN diagnostic

/* ══ LES VRAIS OUTILS ═══════════════════════════════════════════════════ */
async function lisLeDocument<T>(cle: string, defaut: T): Promise<T> {
  const { data } = await admin.from('documents').select('data').eq('key', cle).maybeSingle();
  const v = (data as { data?: unknown } | null)?.data;
  return (v === null || v === undefined ? defaut : v) as T;
}
async function ecrisLeDocument(cle: string, valeur: unknown): Promise<void> {
  const { error } = await admin.from('documents').upsert({ key: cle, data: valeur });
  if (error) console.error('diagnostic-locks: document', cle, error.message);
}
const lignesDe = <T>(rows: unknown): T[] => ((rows ?? []) as { id: string; data?: Record<string, unknown> }[])
  .map((r) => ({ id: r.id, ...(r.data ?? {}) }) as unknown as T);

const base: BaseDuDiagnostic = {
  async interrupteur() {
    const cfg = await lisLeDocument<{ diagnosticPhoto?: unknown }>('mnd_auto_config', {});
    return cfg?.diagnosticPhoto === true;
  },
  async table() { return await lisLeDocument<unknown>(CLE_DE_LA_TABLE_DU_DIAGNOSTIC, null); },
  async catalogue() {
    const [s, c, p] = await Promise.all([
      admin.from('catalog_services').select('id, data').limit(1000),
      admin.from('catalog_categories').select('id, data').limit(1000),
      admin.from('catalog_products').select('id, data').limit(1000),
    ]);
    return { services: lignesDe(s.data), categories: lignesDe(c.data), products: lignesDe(p.data) };
  },
  async compteur() { return await lisLeDocument<Compteur>(CLE_DU_COMPTEUR_DU_DIAGNOSTIC, {}); },
  async ecrisLeCompteur(c) { await ecrisLeDocument(CLE_DU_COMPTEUR_DU_DIAGNOSTIC, c); },
  async depose(chemin, octets, mime) {
    const { error } = await admin.storage.from(COFFRE_DES_PHOTOS_DU_DIAGNOSTIC).upload(chemin, octets, { contentType: mime, upsert: false });
    if (error) console.error('diagnostic-locks: coffre', error.message);
    return !error;
  },
  async retire(chemins) {
    if (!chemins.length) return true;
    const { error } = await admin.storage.from(COFFRE_DES_PHOTOS_DU_DIAGNOSTIC).remove(chemins);
    if (error) console.error('diagnostic-locks: retrait', error.message);
    return !error;
  },
  async cree(l) {
    const { error } = await admin.from(TABLE_DES_DIAGNOSTICS).insert(l);
    if (error) console.error('diagnostic-locks: création', error.message);
    return !error;
  },
  async touche(id, champs) {
    const { error } = await admin.from(TABLE_DES_DIAGNOSTICS).update(champs).eq('id', id);
    if (error) console.error('diagnostic-locks: mise à jour', error.message);
  },
  async miens(porte) {
    const q = admin.from(TABLE_DES_DIAGNOSTICS).select('*').order('cree_le', { ascending: false }).limit(20);
    const { data } = porte.source === 'couronne' && porte.clientId
      ? await q.eq('client_id', porte.clientId)
      : await q.eq('data->>consultationId', porte.consultationId ?? '');
    return (data ?? []) as LigneDiagnostic[];
  },
  async vieux(limiteIso) {
    const { data } = await admin.from(TABLE_DES_DIAGNOSTICS).select('*').lt('cree_le', limiteIso).is('data->>photosEffaceesLe', null).limit(50);
    return (data ?? []) as LigneDiagnostic[];
  },
};

/** « Awa D. » : le prénom et l'initiale, rien d'autre d'elle chez Claude. */
const appelPourClaude = (nom: unknown): string => {
  const mots = String(nom ?? '').trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return '';
  return prenomEtInitiale({ prenom: mots[0], nom: mots.slice(1).join(' ') });
};

/** LA PORTE : une session Ma Couronne (une cliente, jamais le personnel), ou
    une consultation dont la transaction KkiaPay est au registre. La
    Consultation envoie la clé publique, jamais une session : un jeton qui
    n'est pas une session, ou une session sans fiche, laisse sa chance à la
    consultation payée (reprise du 19 octobre 2026). */
async function porte({ jwt, body }: RequeteDuDiagnostic): Promise<Porte | null | 'personnel'> {
  if (jwt && jwt.split('.').length === 3) {
    const { data } = await admin.auth.getUser(jwt).catch(() => ({ data: null as { user?: { id?: string } } | null }));
    const uid = data?.user?.id;
    if (uid) {
      const { data: s } = await admin.from('staff').select('user_id').eq('user_id', uid).maybeSingle();
      if (s) return 'personnel';
      type Fiche = { id: string; branch_id?: string | null; data?: { name?: string; branchId?: string; archived?: boolean } };
      const { data: parCompte } = await admin.from('clients').select('id, branch_id, data').eq('data->>authUserId', uid).limit(1);
      let fiche = ((parCompte ?? []) as Fiche[])[0];
      if (!fiche) {
        const { data: parId } = await admin.from('clients').select('id, branch_id, data').eq('id', uid).maybeSingle();
        fiche = (parId ?? undefined) as Fiche | undefined;
      }
      if (fiche && fiche.data?.archived !== true) {
        return { source: 'couronne', branchId: fiche.data?.branchId || fiche.branch_id || '', clientId: fiche.id, consultationId: null, appel: appelPourClaude(fiche.data?.name) };
      }
    }
  }
  const consultationId = String(body.consultationId ?? '').trim();
  const transactionId = String(body.transactionId ?? '').trim();
  if (!consultationId || !transactionId || consultationId.length > 80 || transactionId.length > 120) return null;
  type Paiement = { id: string; branch_id?: string | null; data?: { partnerId?: string; status?: string; clientId?: string; branchId?: string } };
  const { data: p } = await admin.from('payments').select('id, branch_id, data').eq('id', transactionId).maybeSingle();
  const paiement = p as Paiement | null;
  if (!paiement || String(paiement.data?.partnerId ?? '') !== consultationId || String(paiement.data?.status ?? '') !== 'success') return null;
  const { data: c } = await admin.from('consultations_queue').select('data').eq('id', consultationId).maybeSingle();
  const nom = (c as { data?: { client?: { name?: string } } } | null)?.data?.client?.name ?? '';
  return { source: 'consultation', branchId: paiement.branch_id || paiement.data?.branchId || '', clientId: paiement.data?.clientId ?? null, consultationId, appel: appelPourClaude(nom) };
}

/** QUI SONNE : la direction et le département Atelier (sa décision), lus
    dans la même matrice que la barre du Trône. */
async function alerte(o: { titre: string; corps: string; diagnosticId: string; urgent: boolean }): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const [{ data: staff }, { data: doc }] = await Promise.all([
    admin.from('staff').select('user_id, role'),
    admin.from('documents').select('data').eq('key', 'mnd_staff_access').maybeSingle(),
  ]);
  const acces = (doc?.data ?? {}) as Record<string, Record<string, boolean>>;
  const ids = ((staff ?? []) as { user_id: string; role: string }[])
    .filter((s) => peutRelire(s.role, acces[s.user_id]))
    .map((s) => s.user_id);
  if (!ids.length) return 0;
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth,client_id').in('client_id', ids);
  let n = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: o.titre, body: o.corps, url: `/trone/#/consultations?diagnostic=${o.diagnosticId}`, tag: `mnd-diagnostic-${o.diagnosticId}`, ...(o.urgent ? { requireInteraction: true } : {}) }),
      );
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return n;
}

/** CLAUDE LIT LES PHOTOS, par un outil forcé : il rend la forme, jamais du
    texte libre. Quarante secondes au plus ; le petit modèle prend le relais
    si le premier n'est pas ouvert à la clé. `null` : rien, et la Maison
    relit à la main. */
async function claude(consigne: string, photos: Photo[], schema: unknown): Promise<{ brut: unknown; modele: string; entree: number; sortie: number } | null> {
  if (!ANTHROPIC_API_KEY || !photos.length) return null;
  const contenu = [
    ...photos.map((p) => ({ type: 'image', source: { type: 'base64', media_type: p.mime, data: p.base64 } })),
    { type: 'text', text: 'Lis ces photos et rends la lecture par l’outil « lecture ».' },
  ];
  for (const model of MODELES_DU_DIAGNOSTIC) {
    const arret = new AbortController();
    const minuterie = setTimeout(() => arret.abort(), 40_000);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: arret.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model, max_tokens: 1200, system: consigne,
          tools: [{ name: 'lecture', description: 'La lecture des photos de locks, dans les listes fermées de la Maison.', input_schema: schema }],
          tool_choice: { type: 'tool', name: 'lecture' },
          messages: [{ role: 'user', content: contenu }],
        }),
      });
      const corps = await r.json().catch(() => ({})) as { content?: { type: string; input?: unknown }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
      if (!r.ok) {
        console.error('diagnostic-locks: Claude', model, r.status, corps.error?.message ?? '');
        if (r.status === 404 || (r.status === 400 && /model/i.test(corps.error?.message ?? ''))) continue;
        return null;
      }
      const outil = (corps.content ?? []).find((b) => b.type === 'tool_use');
      return { brut: outil?.input ?? null, modele: model, entree: corps.usage?.input_tokens ?? 0, sortie: corps.usage?.output_tokens ?? 0 };
    } catch (e) {
      console.error('diagnostic-locks: Claude', model, String(e));
      return null;
    } finally {
      clearTimeout(minuterie);
    }
  }
  return null;
}

const outils: OutilsDuDiagnostic = {
  base,
  maintenant: () => Date.now(),
  nouvelId: () => `diag-${crypto.randomUUID()}`,
  porte,
  claude,
  alerte,
  fond: enTacheDeFond,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method', version: VERSION }, 405);
  const corps = await req.text();
  /* Quatre photos réduites : bien moins ; au-delà, ce n'est pas une couronne. */
  if (corps.length > 24_000_000) return json({ error: 'too_large' }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(corps); } catch { return json({ error: 'bad_request' }, 400); }
  const ip = ipOf(req);
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  try {
    let r: Reponse;
    switch (body.action) {
      case 'etat':
        if (!(await allowRate(ip, 'diagnostic_etat', 60))) return json({ error: 'rate_limited' }, 429);
        r = await etatDuDiagnostic(outils);
        break;
      case 'lire':
        if (!(await allowRate(ip, 'diagnostic_lire', 30))) return json({ error: 'rate_limited' }, 429);
        r = await lire(outils, { jwt, body });
        break;
      case 'lire-photos':
        if (!(await allowRate(ip, 'diagnostic_photos', SEAU_DU_DIAGNOSTIC))) return json({ error: 'rate_limited' }, 429);
        r = await lirePhotos(outils, { jwt, body });
        break;
      default:
        return json({ error: 'action', version: VERSION }, 400);
    }
    return json(r[1], r[0]);
  } catch (e) {
    console.error('diagnostic-locks:', String(e));
    return json({ error: 'erreur' }, 500);
  }
});
