import { cleDeLAvis, type UnAvisGoogle } from './avis-google-pur';
import { sansCoordonnees } from './ia-anonymise-pur';

/* ══ LA RÉPONSE AUX AVIS GOOGLE — 19 octobre 2026 ═══════════════════════
   Chantier 5 des huit chantiers Claude (maquette NKQMiMMY… validée par
   Yéman, « Tout me va ») : « Les avis Google (N sans réponse). Pour un avis
   sans réponse : "Réponse proposée" (dans sa langue), boutons Copier /
   Ouvrir l'avis sur Google / Une autre. Google exige que la réponse soit
   publiée par vous : on copie, on colle. » Sa décision : la réponse est
   signée « L'équipe de la Maison MND ». Coût : moins de 1 $ par mois (le
   modèle rapide, cinq avis au plus par ouverture de l'écran).

   CE QUE LE RELEVÉ PORTE. `avis-google-releve` pose dans `mnd_avis_google`
   les cinq avis « les plus pertinents » que Google renvoie : auteur, note,
   texte, quand, photo. L'API Places (nouvelle) ne rend PAS la réponse du
   propriétaire : aucun champ `reply` ni `ownerResponse` n'arrive au relevé.
   Un avis est donc « sans réponse » tant que le relevé n'en porte pas une
   (on lit les quatre noms qu'un relevé futur pourrait employer) et que la
   Maison n'a pas dit, dans le Trône, « j'ai collé la réponse ». La fonction
   n'est pas touchée : une seule fonction à coller pour elle, la porte
   `ia-maison`.

   RIEN NE PART SEUL. Le Trône ne publie jamais sur Google (Google l'interdit
   à un tiers) : le brouillon se copie, elle le colle sur sa fiche. Ce que
   Claude rend est une PROPOSITION, relue ici (`lectureDeLaReponse`) avant
   d'être montrée, modifiable, et écartable.

   PUR : aucun écran, aucun réseau, aucun magasin. */

/** Sa décision : la signature, toujours en français, seule sur sa ligne. */
export const SIGNATURE_DES_AVIS = 'L’équipe de la Maison MND';
/** Trois phrases au plus avant la signature ; la relecture en tolère une de
    plus, et refuse au-delà. */
export const PHRASES_MAX = 3;
export const PHRASES_TOLEREES = PHRASES_MAX + 1;
/** Une réponse d'avis tient en peu de signes : au-delà, Claude s'est égaré. */
export const SIGNES_MAX_REPONSE = 700;
/** Cinq brouillons par ouverture de l'écran, un appel à la fois. */
export const BROUILLONS_PAR_OUVERTURE = 5;
/** Le verrou doux d'un brouillon en cours : deux minutes, puis il tombe. */
export const VERROU_DU_BROUILLON_MS = 2 * 60_000;
/** Après un échec (budget, panne, relecture), on laisse l'avis une heure. */
export const REPIT_APRES_ECHEC_MS = 60 * 60_000;
/** Le document des brouillons, dans `documents` : le Trône seul l'écrit. */
export const CLE_DES_BROUILLONS = 'mnd_ia_avis_brouillons';
/** La fiche « M Natural Dreadlocks » (mémoire google-places-avis-mnd), quand
    le relevé ne porte ni le lien de l'avis ni celui de la fiche. */
export const LIEN_DE_LA_FICHE_DEFAUT = 'https://www.google.com/maps/place/?q=place_id:ChIJbwIfV9hVIxARgS3WzgGq9kM';
/** Les jetons accordés à Claude : trois phrases et une signature. */
export const JETONS_DE_LA_REPONSE = 400;

/** Un avis du relevé, avec les champs qu'un relevé futur pourrait ajouter
    (la réponse du propriétaire, le lien direct de l'avis, le texte d'origine).

    LA LANGUE DE L'AVIS (19 octobre 2026, reprise). Le relevé demande les
    avis à Google en français (`languageCode=fr`) et garde `text`, que Google
    TRADUIT ; l'original est dans `originalText`, que le relevé ne garde pas.
    Un avis écrit en anglais arrive donc ici en français, et Claude répondrait
    en français. Le jour où le relevé ajoute `texteOriginal` et
    `langueOriginale` (sans toucher `texte`, qui fait la clé du choix du
    site), Claude lit l'original et répond dans sa langue : rien d'autre à
    changer côté Trône. */
export type AvisAvecReponse = UnAvisGoogle & {
  reponse?: unknown;
  reply?: unknown;
  ownerResponse?: unknown;
  ownerReply?: unknown;
  lien?: string;
  googleMapsUri?: string;
  texteOriginal?: string;
  langueOriginale?: string;
};

/** Ce que le Trône garde par avis : la proposition, sa langue, quand et par
    quel modèle ; « écartée » si la Maison ne veut pas répondre ; « collée »
    quand elle dit l'avoir publiée ; le verrou doux ; le dernier échec. */
export type BrouillonDAvis = {
  reponse?: string;
  langue?: string;
  le?: string;
  modele?: string;
  ecarte?: boolean;
  publieeLe?: string;
  enCours?: string;
  echoueLe?: string;
};
export type BrouillonsDAvis = Record<string, BrouillonDAvis>;

/** L'identifiant d'un avis : la clé du choix du site (stable d'un relevé à
    l'autre, calculée sur l'auteur et le texte). Un seul identifiant pour les
    deux écrans. */
export const idDeLAvis = (a: Pick<UnAvisGoogle, 'auteur' | 'texte'>): string => cleDeLAvis(a);

/** Le prénom seul, tel qu'il paraît sur Google : le premier mot du nom
    affiché. « Awa Dossou » : Awa ; « A. D. » : A. ; rien : rien. */
export function prenomDeLAuteur(auteur: string | undefined | null): string {
  const mots = String(auteur ?? '').trim().split(/\s+/).filter(Boolean);
  return mots[0] ?? '';
}

const porteUnTexte = (v: unknown): boolean => {
  if (typeof v === 'string') return v.trim().length > 0;
  if (v && typeof v === 'object') {
    const t = (v as { text?: unknown; texte?: unknown }).text ?? (v as { texte?: unknown }).texte;
    return typeof t === 'string' ? t.trim().length > 0 : Object.keys(v as object).length > 0;
  }
  return false;
}

/** Le relevé porte-t-il déjà la réponse de la Maison ? (Aujourd'hui jamais :
    Places ne la rend pas. On lit quand même les quatre noms possibles.) */
export function aUneReponseChezGoogle(a: AvisAvecReponse | null | undefined): boolean {
  if (!a) return false;
  return porteUnTexte(a.reponse) || porteUnTexte(a.reply) || porteUnTexte(a.ownerResponse) || porteUnTexte(a.ownerReply);
}

/** « Sans réponse » : rien chez Google, et la Maison n'a pas dit « collée ». */
export function estSansReponse(a: AvisAvecReponse, b: BrouillonDAvis | undefined): boolean {
  return !aUneReponseChezGoogle(a) && !b?.publieeLe;
}

export const compteSansReponse = (avis: readonly AvisAvecReponse[], brouillons: BrouillonsDAvis): number =>
  avis.filter((a) => estSansReponse(a, brouillons[idDeLAvis(a)])).length;

const dateValide = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** Le verrou tient tant qu'il a moins de deux minutes ; une date illisible
    ne tient rien. */
export function verrouTenu(b: BrouillonDAvis | undefined, maintenant: number): boolean {
  const t = dateValide(b?.enCours);
  return t !== null && maintenant - t >= 0 && maintenant - t < VERROU_DU_BROUILLON_MS;
}

export function enRepit(b: BrouillonDAvis | undefined, maintenant: number): boolean {
  const t = dateValide(b?.echoueLe);
  return t !== null && maintenant - t >= 0 && maintenant - t < REPIT_APRES_ECHEC_MS;
}

/** Un avis a besoin d'un brouillon s'il est sans réponse, sans proposition,
    non écarté, sans verrou qui tient et sans échec récent. */
export function aBesoinDUnBrouillon(a: AvisAvecReponse, b: BrouillonDAvis | undefined, maintenant: number): boolean {
  if (!estSansReponse(a, b)) return false;
  if (b?.reponse || b?.ecarte) return false;
  if (verrouTenu(b, maintenant) || enRepit(b, maintenant)) return false;
  return true;
}

/** LES PROCHAINS À FAIRE, à l'ouverture de l'écran : les identifiants des
    avis qui ont besoin d'un brouillon, dans l'ordre de Google, sans doublon,
    cinq au plus. Le Trône les demande UN à la fois. */
export function prochainsAFaire(
  avis: readonly AvisAvecReponse[],
  brouillons: BrouillonsDAvis,
  maintenant: number,
  max: number = BROUILLONS_PAR_OUVERTURE,
): string[] {
  const vus = new Set<string>();
  const ids: string[] = [];
  for (const a of avis) {
    if (ids.length >= max) break;
    const id = idDeLAvis(a);
    if (vus.has(id)) continue;
    vus.add(id);
    if (aBesoinDUnBrouillon(a, brouillons[id], maintenant)) ids.push(id);
  }
  return ids;
}

/* ── LA SÉRIE DE L'OUVERTURE — 19 octobre 2026 (reprise) ─────────────────
   Le déroulé de « cinq par ouverture, un à la fois, jamais deux fois », mis
   ici pour être ÉPROUVÉ en vrai (le banc lui donne un faux Claude et compte
   les appels en vol). Il ne connaît ni l'écran, ni le réseau, ni le
   magasin : on lui passe de quoi lire les brouillons et de quoi proposer. */

/** Ce que rend une proposition : réussie, ou pourquoi pas. */
export type IssueDeProposition = { ok: true } | { ok: false; erreur: string };

/** Les échecs qui ne valent que pour CET avis (Claude a mal répondu, la
    relecture a refusé) : on passe au suivant. Tout autre refus (budget,
    porte absente, réseau, équipe, document pas encore descendu) vaut pour
    tous les avis : la série s'arrête. */
export const ECHECS_D_UN_SEUL_AVIS: readonly string[] = ['lecture', 'claude'];

export async function prepareUneSerie(o: {
  avis: readonly AvisAvecReponse[];
  /** Les brouillons tels qu'ils sont MAINTENANT (relus avant chaque appel). */
  lis: () => BrouillonsDAvis;
  propose: (a: AvisAvecReponse) => Promise<IssueDeProposition>;
  maintenant: () => number;
  /** Ce qui reste de l'ouverture (cinq, moins ce qui est déjà fait). */
  max: number;
  /** Les identifiants déjà demandés depuis le chargement de la page. */
  dejaDemandes: Set<string>;
  /** Faux quand l'écran se ferme : la série s'arrête avant l'appel suivant. */
  continuer: () => boolean;
}): Promise<number> {
  const max = Math.max(0, Math.floor(Number(o.max) || 0));
  const candidats = prochainsAFaire(o.avis, o.lis(), o.maintenant(), o.avis.length);
  let faits = 0;
  for (const id of candidats) {
    if (faits >= max || !o.continuer()) break;
    if (o.dejaDemandes.has(id)) continue;
    const a = o.avis.find((x) => idDeLAvis(x) === id);
    if (!a) continue;
    /* Relu juste avant l'appel : un autre poste a pu le prendre pendant
       qu'on attendait le précédent. */
    if (!aBesoinDUnBrouillon(a, o.lis()[id], o.maintenant())) continue;
    o.dejaDemandes.add(id);
    faits += 1;
    const r = await o.propose(a);
    if (!r.ok && !ECHECS_D_UN_SEUL_AVIS.includes(r.erreur)) break;
  }
  return faits;
}

/** Le jour d'un instant ISO, à l'heure du poste : une réponse notée à 0 h 30
    à Cotonou est de ce jour-là, pas de la veille (l'instant est en UTC). */
export function jourLocalDe(iso: string | undefined): string {
  const d = new Date(String(iso ?? ''));
  if (Number.isNaN(d.getTime())) return String(iso ?? '').slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const lienSur = (v: unknown): string | null => (typeof v === 'string' && /^https:\/\//.test(v.trim()) ? v.trim() : null);

/** Où ouvrir l'avis sur Google : le lien de l'avis si le relevé le porte,
    sinon la fiche relevée, sinon la fiche de la Maison. */
export function lienDeLAvis(a: AvisAvecReponse | null | undefined, fiche: string | undefined): string {
  return lienSur(a?.lien) ?? lienSur(a?.googleMapsUri) ?? lienSur(fiche) ?? LIEN_DE_LA_FICHE_DEFAUT;
}

/* ── LA CONSIGNE ───────────────────────────────────────────────────────── */

/** Ce qu'on dit à Claude. Chaque interdit vient de la Maison (jamais de
    prix, jamais « salon », jamais le nom entier, jamais de tiret long) ou de
    sa décision du 19 octobre 2026 (la langue de l'avis, trois phrases, la
    signature). */
export function consigneDeLaReponse(): string {
  return [
    'Tu écris, au nom de la Maison MND (Cotonou, Bénin : locks et soins du cheveu naturel), la réponse publique à un avis laissé sur sa fiche Google.',
    'Une personne de l’équipe te relira, copiera ta proposition et la collera elle-même sur Google : tu proposes, tu ne publies rien.',
    '',
    'RÈGLES, sans exception :',
    '- Réponds dans la LANGUE de l’avis (français, anglais ou autre) : la même que son auteur, jamais une autre. Dis cette langue par son code (fr, en, es, pt…) dans « langue ».',
    `- ${PHRASES_MAX} phrases au plus, puis la signature. Pas de titre, pas de liste, pas d’emoji.`,
    '- Calme et digne, même devant un avis dur ou injuste : remercie, reconnais ce qui est dit sans te justifier longuement, ne discute jamais avec l’auteur.',
    '- Invite à revenir ou, si l’avis est critique, à écrire à la Maison en privé (un message sur WhatsApp ou Instagram), sans donner de numéro ni d’adresse.',
    '- JAMAIS de prix, de montant, de remise ni de geste commercial.',
    '- Jamais de promesse : ni remboursement, ni « nous corrigerons », ni « cela n’arrivera plus ».',
    '- Jamais le mot « salon » : on dit « la Maison ».',
    '- Jamais le nom entier de l’auteur : son prénom seul, tel qu’il paraît sur Google, ou rien. Ni « Madame » ni « Monsieur » : on ne sait pas qui écrit.',
    '- Jamais de tiret long (« — ») : une virgule à la place.',
    `- Termine toujours par la signature, seule sur sa dernière ligne, en français même si l’avis ne l’est pas : « ${SIGNATURE_DES_AVIS} ».`,
    '',
    'Rends un objet { langue, reponse } : la langue de l’avis, et la réponse entière, signature comprise.',
  ].join('\n');
}

/** Ce qu'on montre à Claude de l'avis : la note, le prénom seul, quand, le
    texte sans coordonnées. Un avis Google est public, mais un numéro glissé
    dans son texte ne part pas pour autant. */
export function messagePourLAvis(a: AvisAvecReponse): string {
  const note = Math.max(0, Math.min(5, Math.round(Number(a.note) || 0)));
  const prenom = prenomDeLAuteur(a.auteur);
  /* L'original quand le relevé le porte (voir `AvisAvecReponse`), sinon le
     texte du relevé. */
  const original = typeof a.texteOriginal === 'string' ? a.texteOriginal.trim() : '';
  const texte = sansCoordonnees(String(original || a.texte || '').replace(/\s+/g, ' ').trim());
  const l = typeof a.langueOriginale === 'string' ? a.langueOriginale.trim().toLowerCase() : '';
  const langue = original && /^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(l) ? l.split('-')[0] : '';
  return [
    `Avis Google reçu par la Maison : ${note} étoile${note > 1 ? 's' : ''} sur 5${a.quand ? `, laissé ${String(a.quand).trim()}` : ''}.`,
    `Prénom de l’auteur, tel qu’il paraît sur Google : ${prenom || 'inconnu'}.`,
    ...(langue ? [`Langue de l’avis, selon Google : ${langue}.`] : []),
    texte ? `Texte de l’avis :\n« ${texte} »` : 'L’avis n’a pas de texte : une note seulement.',
    'Écris la réponse de la Maison.',
  ].join('\n');
}

/** La forme attendue : la fonction la donne à Claude comme un outil. */
export const SCHEMA_DE_LA_REPONSE: Record<string, unknown> = {
  type: 'object',
  properties: {
    langue: { type: 'string', description: 'Le code de la langue de l’avis : fr, en, es, pt…' },
    reponse: { type: 'string', description: 'La réponse entière, trois phrases au plus, signée « L’équipe de la Maison MND ».' },
  },
  required: ['langue', 'reponse'],
  additionalProperties: false,
};

/* ── LA RELECTURE ──────────────────────────────────────────────────────── */

const PRIX = /(?:\d[\d\s., ]*\s?(?:f\b|fcfa|cfa|francs?|xof|€|\$|euros?|dollars?))|(?:[€$]\s?\d)/i;
/* 19 octobre 2026 (reprise) : la remise en pour-cent est un geste commercial,
   le remboursement une promesse ; la consigne les interdit, la relecture
   aussi. */
const REMISE = /\d\s?%/;
const PROMESSE = /(?:^|[^\p{L}])(?:rembours|refund|dédommag|reembols)/iu;
/* Un numéro, un courriel (ce que `sansCoordonnees` masquerait) ou un lien :
   « sans donner de numéro ni d'adresse ». */
const LIEN = /\bhttps?:\/\/|\bwww\./i;
const SALON = /\bsalons?\b/i;
const SIGNATURE_EN_FIN = /\s*[-–—,;:]*\s*l[’']\s?équipe de la maison mnd\s*\.?\s*$/i;
const LIGNE_DE_SIGNATURE = /^\s*[-–—]*\s*l[’']\s?équipe de la maison mnd\s*\.?\s*$/gim;
/* La signature que Claude traduit parfois (« The Maison MND team ») : une
   LISTE FERMÉE de formes, seules sur leur ligne. Une phrase qui nomme la
   Maison (« See you soon at Maison MND. ») n'en est pas une. */
const SIGNATURE_TRADUITE = /^\s*[-–—]*\s*(?:(?:the\s+)?maison mnd(?:\s+team)?|(?:the\s+)?team\s+(?:of|at)\s+(?:the\s+)?maison mnd|la maison mnd|l[’']\s?équipe maison mnd|el equipo de (?:la\s+)?maison mnd|a equipe da maison mnd)\s*\.?\s*$/gim;
const CIVILITE = /\b(?:Madame|Monsieur|Mme|Mlle|Mrs?|Ms|M\.)\s+/g;
/* Une civilité restée après le nettoyage du prénom est une SUPPOSITION (on
   ne sait pas qui écrit) : la proposition est refusée. */
const CIVILITE_SUPPOSEE = [
  /(?:^|[^\p{L}])(?:madame|monsieur|mademoiselle|madam)(?=$|[^\p{L}])/iu,
  /\b(?:Mme|Mlle|Mrs?|Ms|Sir)(?=$|[\s,.])|(?:^|\s)M\.(?=\s)/u,
];

const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Combien de phrases : les fins marquées (. ! ? …) ; un texte sans point en
    fait une. */
export function comptePhrases(t: string): number {
  const corps = t.trim();
  if (!corps) return 0;
  const fins = (corps.match(/[.!?…]+(?=\s|$)/g) ?? []).length;
  return Math.max(1, fins);
}

/** LA RELECTURE DE CE QUE CLAUDE REND. `null` : refusée (vide, trop longue,
    un prix, une remise, un remboursement, un numéro, un courriel, un lien,
    « salon », une civilité supposée). Sinon la réponse nettoyée : le tiret
    long devient une virgule, le nom entier de l'auteur redevient son prénom,
    la civilité devant lui tombe, et la signature de la Maison termine
    toujours le texte, une seule fois (même traduite, elle ne se double pas).
    La langue est un code court ; sinon « fr ». */
export function lectureDeLaReponse(brut: unknown, a: Pick<UnAvisGoogle, 'auteur'>): { langue: string; reponse: string } | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as { langue?: unknown; reponse?: unknown };
  if (typeof o.reponse !== 'string') return null;

  let corps = o.reponse.replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  /* La signature, où qu'elle soit : on la retire, on la remettra à sa place. */
  corps = corps.replace(LIGNE_DE_SIGNATURE, '').replace(SIGNATURE_TRADUITE, '').replace(SIGNATURE_EN_FIN, '').trim();
  if (!corps) return null;
  if (corps.length > SIGNES_MAX_REPONSE) return null;
  if (SALON.test(corps)) return null;
  if (PRIX.test(corps) || REMISE.test(corps)) return null;
  if (PROMESSE.test(corps)) return null;
  if (LIEN.test(corps) || sansCoordonnees(corps) !== corps) return null;

  /* Le tiret long devient une virgule (le point médian reste permis). */
  corps = corps.replace(/\s*[—–]\s*/g, ', ').replace(/,\s*,/g, ',').replace(/\s+,/g, ',');

  /* Le prénom seul : le nom entier, ou le nom de famille seul, redevient le
     prénom ; « Madame » ou « Monsieur » devant lui tombe. */
  const auteur = String(a.auteur ?? '').trim();
  const mots = auteur.split(/\s+/).filter(Boolean);
  const prenom = mots[0] ?? '';
  if (mots.length >= 2) {
    corps = corps.replace(new RegExp(echappe(auteur).replace(/\\?\s+/g, '\\s+'), 'gi'), prenom);
    for (const nom of mots.slice(1)) {
      if (nom.replace(/[^\p{L}]/gu, '').length >= 3) corps = corps.replace(new RegExp(`(^|[^\\p{L}])${echappe(nom)}(?=$|[^\\p{L}])`, 'giu'), `$1${prenom}`);
    }
  }
  /* La frontière se lit en Unicode : « Madame Aimé » tombe aussi. */
  if (prenom) corps = corps.replace(new RegExp(`${CIVILITE.source}(?=${echappe(prenom)}(?=$|[^\\p{L}]))`, 'giu'), '');
  corps = corps.trim();
  if (!corps) return null;
  if (CIVILITE_SUPPOSEE.some((r) => r.test(corps))) return null;

  if (comptePhrases(corps) > PHRASES_TOLEREES) return null;

  const l = String(o.langue ?? '').trim().toLowerCase();
  const langue = /^[a-z]{2,3}$/.test(l) ? l : 'fr';
  return { langue, reponse: `${corps}\n\n${SIGNATURE_DES_AVIS}` };
}

/** « français », « anglais »… pour la ligne « Réponse proposée, en … ». */
export function langueDite(code: string | undefined): string {
  const NOMS: Record<string, string> = {
    fr: 'français', en: 'anglais', es: 'espagnol', pt: 'portugais', de: 'allemand', it: 'italien',
    nl: 'néerlandais', ar: 'arabe', yo: 'yoruba', fon: 'fon', ha: 'haoussa', sw: 'swahili', zh: 'chinois', ja: 'japonais',
  };
  const c = String(code ?? '').trim().toLowerCase();
  return NOMS[c] ?? (c ? c.toUpperCase() : 'français');
}
