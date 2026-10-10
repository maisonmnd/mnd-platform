/* ══ LES RETOUCHES DU SITE — 4 octobre 2026 ═══════════════════════════
   « L'éditeur des textes et photos du site » (Yéman), maquette validée,
   réponses au sélecteur : un clic dans le Trône publie ; les textes et photos
   des pages EXISTANTES ; Brice et Yéman seuls ; « Notre histoire » protégée.

   CE MODULE EST PUR, et lu des deux rives : le Trône (l'éditeur, l'aperçu)
   et le générateur du site (`scripts/genere-revelateur.mjs`), qui applique
   les retouches PUBLIÉES au contenu avant d'écrire les pages. Le site reste
   donc fait de vraies pages, textes compris, pour Google comme pour le
   téléphone.

   UNE RETOUCHE, C'EST UN CHEMIN ET UN TEXTE : « h1 », « cta.texte »,
   « faq.2.1 » (la réponse à la troisième question). Le contenu d'origine
   reste dans `contenu.ts` ; retirer une retouche rend le texte d'origine. */

/** Les retouches d'une page : chemin du champ → nouveau texte (ou adresse de photo). */
export type RetouchesDePage = Record<string, string>;
/** Une photo publiée sur le site : son adresse, sa page, l'accord donné. */
export type LigneDuRegistre = { photo: string; page: string; accordLe: string; par?: string };
export type Retouches = {
  pages: Record<string, RetouchesDePage>;
  registre?: LigneDuRegistre[];
  le?: string;
  par?: string;
};

export const PAGE_PROTEGEE = '/notre-histoire/';
export const PAGE_ACCUEIL = '/';

/** Ce qui n'est pas un texte à lire : des liens, des repères, des codes. */
const TECHNIQUES = new Set(['chemin', 'besoin', 'jsonld', 'vers', 'mono', 'type', 'id', 'enAttente', 'parcours', 'ancre', 'icone', 'cle', 'teinte', 'message']);

export type Genre = 'court' | 'long' | 'photo';
export type Champ = { cle: string; libelle: string; valeur: string; genre: Genre; max?: number };

const NOMS: Record<string, [string, Genre, number?]> = {
  titre: ['Titre dans Google', 'court', 60],
  description: ['Description dans Google', 'long', 160],
  h1: ['Grand titre', 'court', 80],
  sur: ['Petite ligne au-dessus', 'court'],
  ligne: ['Phrase d’accueil', 'long'],
  'cta.texte': ['Le bouton', 'court'],
  'cta.note': ['Sous le bouton', 'court'],
  geste: ['Le geste', 'long'],
  rassure: ['La phrase qui rassure', 'long'],
  court: ['Nom court (menus)', 'court'],
  image: ['La photo de la page', 'photo'],
  'pas.sur': ['Les pas · petite ligne', 'court'],
  'pas.titre': ['Les pas · titre', 'court'],
};

/** Le nom lisible d'un chemin de champ. */
export function libelleDe(cle: string): [string, Genre, number?] {
  if (NOMS[cle]) return NOMS[cle];
  let m = cle.match(/^pas\.items\.(\d+)\.(0|1)$/);
  if (m) return [`Pas ${Number(m[1]) + 1} · ${m[2] === '0' ? 'nom' : 'phrase'}`, m[2] === '0' ? 'court' : 'long'];
  m = cle.match(/^faq\.(\d+)\.(0|1)$/);
  if (m) return [`${m[2] === '0' ? 'Question' : 'Réponse'} ${Number(m[1]) + 1}`, m[2] === '0' ? 'court' : 'long'];
  const morceaux = cle.split('.').map((p) => (/^\d+$/.test(p) ? `n° ${Number(p) + 1}` : p));
  const dernier = cle.split('.').pop() ?? '';
  return [morceaux.join(' · '), /image|photo/i.test(dernier) && !/alt/i.test(dernier) ? 'photo' : 'long'];
}

/** Est-ce le nom d'une photo (ou l'adresse d'une photo retouchée) ? */
export const estUnePhoto = (cle: string, v: string): boolean =>
  /(^|\.)image$/.test(cle) || /\.(jpe?g|png|webp)$/i.test(v) || /^https?:\/\/.+\/storage\/v1\/object\/public\//.test(v);

/** Tous les champs modifiables d'une page, dans l'ordre où ils s'écrivent. */
export function champsDeLaPage(page: unknown): Champ[] {
  const out: Champ[] = [];
  const marche = (v: unknown, chemin: string[]) => {
    if (typeof v === 'string') {
      const cle = chemin.join('.');
      if (!cle || !v.trim()) return;
      const [libelle, genreDuNom, max] = libelleDe(cle);
      const genre: Genre = estUnePhoto(cle, v) ? 'photo' : genreDuNom === 'photo' ? 'long' : genreDuNom;
      out.push({ cle, libelle, valeur: v, genre, ...(max ? { max } : {}) });
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => marche(x, [...chemin, String(i)])); return; }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (TECHNIQUES.has(k)) continue;
        marche(x, [...chemin, k]);
      }
    }
  };
  marche(page, []);
  return out;
}

/** Pose une valeur au bout d'un chemin, sans toucher l'original. */
function pose(objet: unknown, morceaux: string[], valeur: string): unknown {
  if (morceaux.length === 0) return valeur;
  const [tete, ...reste] = morceaux;
  if (Array.isArray(objet)) {
    const i = Number(tete);
    if (!Number.isInteger(i) || i < 0 || i >= objet.length) return objet;
    const copie = [...objet];
    copie[i] = pose(copie[i], reste, valeur);
    return copie;
  }
  if (objet && typeof objet === 'object') {
    const o = objet as Record<string, unknown>;
    if (!(tete in o)) return objet;
    return { ...o, [tete]: pose(o[tete], reste, valeur) };
  }
  return objet;
}

/** Une page, retouchée. Un chemin qui n'existe plus (le contenu a changé
    depuis) est ignoré : jamais un champ inventé dans une page. */
export function retouchee<T>(page: T, retouches: RetouchesDePage | undefined): T {
  if (!retouches) return page;
  let p: unknown = page;
  for (const [cle, v] of Object.entries(retouches)) {
    if (typeof v !== 'string' || TECHNIQUES.has(cle.split('.')[0])) continue;
    p = pose(p, cle.split('.'), v);
  }
  return p as T;
}

/** Pour le générateur : applique les retouches publiées aux pages, sur place
    (le générateur garde ses références à PAGES et ACCUEIL). */
export function appliqueLesRetouches(
  pages: { chemin: string }[],
  accueil: Record<string, unknown> | undefined,
  doc: Retouches | null | undefined,
): number {
  if (!doc?.pages) return 0;
  let n = 0;
  pages.forEach((p, i) => {
    const r = doc.pages[p.chemin];
    if (r && Object.keys(r).length) { pages[i] = retouchee(p, r); n += Object.keys(r).length; }
  });
  const ra = doc.pages[PAGE_ACCUEIL];
  if (accueil && ra) {
    const nouveau = retouchee(accueil, ra) as Record<string, unknown>;
    for (const k of Object.keys(nouveau)) accueil[k] = nouveau[k];
    n += Object.keys(ra).length;
  }
  return n;
}

/* ── LES RÈGLES DE LA MAISON, À L'ÉCRITURE ───────────────────────────── */
export type Garde = { niveau: 'bloque' | 'signale'; dit: string };

/** Ce que l'éditeur dit d'un texte avant de le publier. */
export function gardesDuTexte(texte: string, page: string, champ?: Pick<Champ, 'max' | 'genre'>): Garde[] {
  const g: Garde[] = [];
  if (champ?.genre === 'photo') return g;
  if (/—/.test(texte)) g.push({ niveau: 'signale', dit: 'Un tiret long « — » : une virgule le remplace.' });
  if (/\bsalons?\b/i.test(texte)) g.push({ niveau: 'signale', dit: 'Le mot « salon » : la Maison dit « la Maison ».' });
  if (/\d[\d\s.]*\s?(F|FCFA|CFA|francs)\b/i.test(texte)) g.push({ niveau: 'signale', dit: 'Un montant : pas de prix dans une page d’offre ou de campagne.' });
  if (/kol[ée]tan/i.test(texte) && page !== PAGE_PROTEGEE) g.push({ niveau: 'bloque', dit: 'Kolétan n’apparaît que dans « Notre histoire ».' });
  if (champ?.max && texte.length > champ.max) g.push({ niveau: 'signale', dit: `${texte.length} signes : au-delà de ${champ.max}, Google le coupe.` });
  return g;
}

/** Les retouches en attente qui ne peuvent pas partir (une règle qui bloque). */
export function bloquants(brouillon: Record<string, RetouchesDePage>): { page: string; cle: string; dit: string }[] {
  const out: { page: string; cle: string; dit: string }[] = [];
  for (const [page, r] of Object.entries(brouillon)) {
    for (const [cle, v] of Object.entries(r)) {
      for (const g of gardesDuTexte(v, page)) if (g.niveau === 'bloque') out.push({ page, cle, dit: g.dit });
    }
  }
  return out;
}

/** Une publication : le brouillon rejoint ce qui est publié ; ce qui était
    publié devient « la publication d'avant » (un seul cran de retour). */
export function publie(
  publieAvant: Retouches | undefined,
  brouillon: Record<string, RetouchesDePage>,
  le: string,
  par?: string,
  nouvellesPhotos: LigneDuRegistre[] = [],
): Retouches & { precedent?: Retouches } {
  const pages: Record<string, RetouchesDePage> = { ...(publieAvant?.pages ?? {}) };
  for (const [page, r] of Object.entries(brouillon)) {
    const fusion: RetouchesDePage = { ...(pages[page] ?? {}) };
    for (const [cle, v] of Object.entries(r)) {
      /* Une chaîne vide dans le brouillon : « revenir au texte d'origine ». */
      if (v === '') delete fusion[cle]; else fusion[cle] = v;
    }
    if (Object.keys(fusion).length) pages[page] = fusion; else delete pages[page];
  }
  const { precedent: _p, ...avant } = (publieAvant ?? { pages: {} }) as Retouches & { precedent?: Retouches };
  return {
    pages, le, ...(par ? { par } : {}),
    registre: [...(publieAvant?.registre ?? []), ...nouvellesPhotos],
    ...(publieAvant ? { precedent: avant } : {}),
  };
}

/** CE QUI RESTE AU BROUILLON APRÈS UNE PUBLICATION — 10 octobre 2026,
    relecture. Le brouillon est partagé entre les postes. Publier le remettait
    à zéro d'un bloc (`{ pages: {} }`) : une retouche arrivée d'un autre poste
    pendant la confirmation n'était ni publiée ni gardée, elle disparaissait.
    On ne retire plus que ce qui est PARTI, clé par clé et à la même valeur ;
    une clé retouchée depuis (autre valeur) reste à publier, comme une photo
    ajoutée depuis. */
export function resteDuBrouillon<B extends { pages?: Record<string, RetouchesDePage>; photos?: LigneDuRegistre[] }>(
  actuel: B,
  parti: { pages?: Record<string, RetouchesDePage>; photos?: LigneDuRegistre[] },
): { pages: Record<string, RetouchesDePage>; photos?: LigneDuRegistre[] } {
  const pages: Record<string, RetouchesDePage> = {};
  for (const [page, r] of Object.entries(actuel.pages ?? {})) {
    const envoye = parti.pages?.[page] ?? {};
    const reste: RetouchesDePage = {};
    for (const [cle, v] of Object.entries(r)) if (!(cle in envoye) || envoye[cle] !== v) reste[cle] = v;
    if (Object.keys(reste).length) pages[page] = reste;
  }
  const memePhoto = (a: LigneDuRegistre, b: LigneDuRegistre) => a.photo === b.photo && a.page === b.page && a.accordLe === b.accordLe;
  const photos = (actuel.photos ?? []).filter((p) => !(parti.photos ?? []).some((q) => memePhoto(p, q)));
  return { pages, ...(photos.length ? { photos } : {}) };
}
