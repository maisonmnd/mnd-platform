/* ══ LE PONT DES AVIS, SES RÈGLES — 25 octobre 2026 ═════════════════════
   « Je veux également répondre aux avis Google depuis ici » (Yéman). Google
   a refusé deux fois son API à la Maison ; Make.com l'a, et la Maison y a
   branché sa fiche (connexion « Google Business Profile » de Make, essai
   du 25 octobre réussi). Le pont a deux sens :

   - MAKE → LE TRÔNE. Le scénario « Avis vers le Trône » (Watch Reviews, puis
     une requête HTTP) pose chaque avis dans la fonction `avis-google-pont`,
     qui le range dans le document `mnd_avis_google_tous` : TOUS les avis,
     leur nom chez Google (accounts/…/locations/…/reviews/…) et la réponse
     déjà publiée. Le relevé des cinq avis (Places) ne porte ni l'un ni
     l'autre.
   - LE TRÔNE → GOOGLE. « Publier sur Google », après lecture : la fonction
     retrouve l'avis chez Google (`apparie`), puis demande à Make de poser la
     réponse (scénario « Répondre sur Google »). Rien ne part tout seul.

   Pur : aucun import. La fonction Edge en porte une copie entière entre ses
   repères (scripts/copie-dans-le-centre.mjs --fonction …), le banc
   `verifie-le-pont-des-avis` crie si elles divergent. */

/** Le document où la fonction range les avis reçus de Make. Lisible par
    l'équipe seulement (il n'est pas dans la liste blanche des documents
    publics) : le site public garde son relevé, `mnd_avis_google`. */
export const CLE_DES_AVIS_DE_GOOGLE = 'mnd_avis_google_tous';

/** Un avis tel que Google le tient, reçu par Make. */
export type AvisDeGoogle = {
  /** Le nom de l'avis chez Google : accounts/…/locations/…/reviews/… */
  name: string;
  auteur: string;
  /** De 1 à 5 ; 0 si Google ne l'a pas dit. */
  note: number;
  texte: string;
  creeLe?: string;
  majLe?: string;
  /** La réponse de la Maison, publiée sur Google. */
  reponse?: string;
  reponduLe?: string;
  /** Vrai quand c'est le Trône qui l'a publiée (« Publier sur Google »). */
  parLeTrone?: boolean;
  /** Quand Make l'a apporté pour la dernière fois. */
  recuLe: string;
};
export type DocumentDesAvisDeGoogle = { avis: Record<string, AvisDeGoogle>; le?: string };

/** La limite de Google pour une réponse : 4 096 octets. */
export const OCTETS_MAX_DE_LA_REPONSE = 4096;

const NOM_D_AVIS = /^accounts\/[0-9]+\/locations\/[0-9]+\/reviews\/[A-Za-z0-9_-]+$/;
/** Un nom d'avis de Google, et rien d'autre : il finit dans une adresse. */
export const nomDAvisValide = (s: unknown): s is string => typeof s === 'string' && NOM_D_AVIS.test(s.trim());

const NOTES: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
/** « FIVE » (Google), « 5 » (un formulaire) ou 5 : la note de 1 à 5, sinon 0. */
export function noteDeGoogle(v: unknown): number {
  const s = String(v ?? '').trim().toUpperCase();
  if (NOTES[s]) return NOTES[s];
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

/** Un champ texte de Make : une case laissée vide arrive en chaîne vide,
    parfois en « null » ou « undefined » écrits en toutes lettres. */
function champ(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return s === 'null' || s === 'undefined' ? '' : s;
}

/** Une date que Google a écrite (ISO), sinon rien. */
function dateDe(v: unknown): string | undefined {
  const s = champ(v);
  return s && Number.isFinite(Date.parse(s)) ? s : undefined;
}

/** CE QUE MAKE ENVOIE, lu champ par champ (formulaire ou JSON). Le nom de
    l'avis est obligatoire et vérifié ; le reste se lit tel quel. Null si ce
    n'est pas un avis.

    25 octobre 2026, au premier import : les noms des champs se lisent sans
    majuscules ni espaces autour (« Auteur », « auteur » : le même champ).
    Ils se tapent à la main dans Make, et une majuscule y avait vidé les
    299 noms. */
export function lisLAvisRecu(brut: Record<string, unknown>, maintenant: string): AvisDeGoogle | null {
  const corps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(brut ?? {})) {
    const cle = k.trim().toLowerCase();
    if (!(cle in corps) || champ(corps[cle]) === '') corps[cle] = v;
  }
  const name = champ(corps.name);
  if (!nomDAvisValide(name)) return null;
  const a: AvisDeGoogle = {
    name,
    auteur: champ(corps.auteur),
    note: noteDeGoogle(corps.note),
    texte: champ(corps.texte),
    recuLe: maintenant,
  };
  const creeLe = dateDe(corps.cree);
  const majLe = dateDe(corps.maj);
  const reponse = champ(corps.reponse);
  const reponduLe = dateDe(corps.repondule);
  if (creeLe) a.creeLe = creeLe;
  if (majLe) a.majLe = majLe;
  if (reponse) { a.reponse = reponse; if (reponduLe) a.reponduLe = reponduLe; }
  return a;
}

/** RANGER UN AVIS REÇU. Make ne dit rien d'une réponse qu'il ne voit pas
    encore : une réponse publiée par le Trône reste tant que Make n'en
    apporte pas une autre. */
export function versLeDocument(doc: DocumentDesAvisDeGoogle | null | undefined, a: AvisDeGoogle): DocumentDesAvisDeGoogle {
  const avis = { ...(doc?.avis ?? {}) };
  const avant = avis[a.name];
  const garde = !a.reponse && avant?.reponse
    ? { reponse: avant.reponse, ...(avant.reponduLe ? { reponduLe: avant.reponduLe } : {}), ...(avant.parLeTrone ? { parLeTrone: true } : {}) }
    : {};
  avis[a.name] = { ...a, ...garde };
  return { avis, le: a.recuLe };
}

/** La réponse publiée par le Trône, rangée sur l'avis. */
export function avecLaReponse(doc: DocumentDesAvisDeGoogle, name: string, reponse: string, le: string): DocumentDesAvisDeGoogle {
  const a = doc.avis[name];
  if (!a) return doc;
  return { ...doc, avis: { ...doc.avis, [name]: { ...a, reponse, reponduLe: le, parLeTrone: true } } };
}

/** Le texte remis à plat pour comparer : minuscules, sans accents, sans
    ponctuation, espaces simples. */
export function aPlat(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ce que le relevé du Trône sait d'un avis (Places). 26 octobre 2026 : la
    rubrique « Les avis Google » connaît aussi son nom chez Google (`name`). */
export type AvisAApparier = { auteur: string; texte: string; texteOriginal?: string; publieLe?: string; name?: string };

/** LE TEXTE D'UN AVIS TEL QUE GOOGLE L'ÉCRIT, quand la fiche le traduit :
    « original\n\n(Translated by Google)\ntraduction », ou l'inverse,
    « (Translated by Google) traduction\n\n(Original)\noriginal ». On garde
    l'original, et la traduction à part. */
export function texteDeGoogle(brut: unknown): { original: string; traduction?: string } {
  const s = String(brut ?? '').replace(/\r\n/g, '\n').trim();
  if (!s) return { original: '' };
  const avant = /^\(Translated by Google\)\s*([\s\S]*?)\n\s*\(Original\)\s*([\s\S]*)$/i.exec(s);
  if (avant) return { original: avant[2].trim(), traduction: avant[1].trim() || undefined };
  const apres = /^([\s\S]*?)\n\s*\(Translated by Google\)\s*([\s\S]*)$/i.exec(s);
  if (apres) return { original: apres[1].trim(), traduction: apres[2].trim() || undefined };
  return { original: s };
}

/** L'écart toléré entre la date de Places et celle de Google : la même
    publication, vue par deux portes. */
const ECART_MAX_MS = 36 * 3_600_000;

/** RETROUVER CHEZ GOOGLE l'avis que le Trône montre. Le même nom affiché,
    puis la même date de publication (à 36 h près) ; sans date commune, le
    même début de texte. Deux à la même distance, ou aucun : null. On ne
    devine jamais, une réponse sous le mauvais avis serait publique.

    SANS NOM CHEZ MAKE (25 octobre 2026, le premier import est arrivé sans
    les noms) : un avis apporté sans nom se retrouve par la date (à 36 h
    près) ET le même début de texte, les deux à la fois, et seulement s'il
    est le seul. Une note sans texte ne se retrouve pas ainsi. */
export function apparie(a: AvisAApparier, tous: readonly AvisDeGoogle[]): AvisDeGoogle | null {
  const qui = aPlat(a.auteur);
  if (!qui) return null;
  const t = Date.parse(String(a.publieLe ?? ''));
  const memes = tous.filter((g) => aPlat(g.auteur) === qui);
  if (memes.length === 0) {
    const debutSeul = aPlat(a.texteOriginal || a.texte).slice(0, 40);
    if (!debutSeul || !Number.isFinite(t)) return null;
    const sansNom = tous.filter((g) => !aPlat(g.auteur)
      && Math.abs(Date.parse(String(g.creeLe ?? '')) - t) <= ECART_MAX_MS
      && aPlat(g.texte).includes(debutSeul));
    return sansNom.length === 1 ? sansNom[0] : null;
  }
  const proches = Number.isFinite(t)
    ? memes
      .map((g) => ({ g, d: Math.abs(Date.parse(String(g.creeLe ?? '')) - t) }))
      .filter((x) => Number.isFinite(x.d) && x.d <= ECART_MAX_MS)
      .sort((x, y) => x.d - y.d)
    : [];
  if (proches.length > 0) {
    if (proches.length > 1 && proches[0].d === proches[1].d) return null;
    return proches[0].g;
  }
  const debut = aPlat(a.texteOriginal || a.texte).slice(0, 40);
  const parTexte = debut ? memes.filter((g) => aPlat(g.texte).includes(debut)) : memes.filter((g) => !aPlat(g.texte));
  return parTexte.length === 1 ? parTexte[0] : null;
}

/** Le corps que Make pose tel quel dans l'appel à Google : du JSON déjà
    écrit, où guillemets et retours à la ligne sont échappés. */
export const corpsDeLaReponse = (texte: string): string => JSON.stringify({ comment: texte });

/** Ce qui empêche de publier une réponse, ou null. */
export function defautDeLaReponse(texte: unknown): string | null {
  if (typeof texte !== 'string' || !texte.trim()) return 'la réponse est vide';
  if (new TextEncoder().encode(texte.trim()).length > OCTETS_MAX_DE_LA_REPONSE) return 'la réponse dépasse la longueur que Google accepte';
  return null;
}

/** Qui publie sur Google : la direction, et les départements qui ont le
    chantier des avis au Trône (la Clientèle, le Marketing). */
export const DEPARTEMENTS_QUI_PUBLIENT: readonly string[] = ['dept-clientele', 'dept-marketing'];
export function peutPublier(role: string | undefined, acces: Record<string, boolean> | undefined): boolean {
  if (role === 'souverain' || role === 'gerant') return true;
  return DEPARTEMENTS_QUI_PUBLIENT.some((d) => acces?.[d] === true);
}
