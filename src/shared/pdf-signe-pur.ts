/* ══ SIGNER UN PDF — 15 octobre 2026 ══════════════════════════════════
   « Ouvrir les PDF téléchargés depuis le secrétariat, éditer le document,
   et mettre les signatures et les tampons sur autant de pages nécessaires »
   (Yéman). Maquette UrJJzwSH… validée, choix cochés : depuis chaque PDF du
   Secrétariat et depuis l'ordinateur ; une COPIE signée à côté de
   l'original, jamais à sa place ; on AJOUTE (texte, date, « Lu et
   approuvé », coche), on n'efface jamais ; chacun dépose son paraphe comme
   sa signature ; cette page, toutes, ou une sélection ; tourner et retirer
   une page dans la copie ; le téléphone aussi.

   CE FICHIER EST PUR : l'atelier et le banc lisent les mêmes règles. Une
   pièce posée se dit dans le repère de la page TELLE QU'ON LA VOIT (après
   ses tours), en fractions de sa largeur et de sa hauteur, depuis le coin
   haut-gauche ; `versLaPage` la ramène dans le repère du PDF. */

export type GenreDePose = 'signature' | 'paraphe' | 'tampon' | 'recu' | 'texte' | 'date' | 'lu' | 'coche';
export const GENRES_IMAGES: readonly GenreDePose[] = ['signature', 'paraphe', 'tampon', 'recu'];
export const estUneImage = (g: GenreDePose): boolean => GENRES_IMAGES.includes(g);

export type PoseSurPdf = {
  id: string;
  /** La page, comptée depuis 0 dans le document d'origine. */
  page: number;
  genre: GenreDePose;
  /** Le coin haut-gauche, en fractions de la page vue. */
  x: number;
  y: number;
  /** La largeur, en fraction de la page vue (images). */
  largeur: number;
  /** La clé de l'image : 'signature', 'paraphe', 'tampon:<clé>', 'recu:<AAAA-MM-JJ>'. */
  image?: string;
  /** Le texte écrit (texte, date, « Lu et approuvé »). */
  texte?: string;
  /** La taille du texte, en points. */
  taille?: number;
};

/** Ce qu'on fait des pages DANS LA COPIE : des quarts de tour, des pages retirées. */
export type RetoucheDesPages = { tours: Record<number, number>; retirees: number[] };
export const retoucheVide = (): RetoucheDesPages => ({ tours: {}, retirees: [] });

/** Les largeurs de départ, en fraction de la page vue. */
export const LARGEUR_DE_DEPART: Record<GenreDePose, number> = {
  signature: 0.26, paraphe: 0.1, tampon: 0.2, recu: 0.24, texte: 0, date: 0, lu: 0, coche: 0,
};
export const TAILLE_DU_TEXTE = 11;

/* ── LES PAGES ── */
/** « 1, 3-5 » → [0, 2, 3, 4] ; ce qui ne se lit pas, ou sort du document, est ignoré. */
export function pagesDeLaSelection(texte: string, nbPages: number): number[] {
  const out = new Set<number>();
  for (const morceau of String(texte ?? '').split(/[,;\s]+/).map((m) => m.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(morceau);
    if (!m) continue;
    const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a;
    for (let p = Math.min(a, b); p <= Math.max(a, b); p += 1) if (p >= 1 && p <= nbPages) out.add(p - 1);
  }
  return [...out].sort((x, y) => x - y);
}
/** La même pièce, au même endroit, sur d'autres pages (sans doubler une pièce déjà là). */
export function repeteSurLesPages(pose: PoseSurPdf, pages: readonly number[], deja: readonly PoseSurPdf[], nouvelId: () => string): PoseSurPdf[] {
  const meme = (q: PoseSurPdf, p: number) => q.page === p && q.genre === pose.genre && q.image === pose.image && Math.abs(q.x - pose.x) < 0.02 && Math.abs(q.y - pose.y) < 0.02;
  return pages.filter((p) => p !== pose.page && !deja.some((q) => meme(q, p))).map((p) => ({ ...pose, id: nouvelId(), page: p }));
}
/** Le tour final d'une page : son tour d'origine, plus les quarts de tour donnés ici. */
export const tourFinal = (origine: number, quarts: number | undefined): number => (((origine + (quarts ?? 0) * 90) % 360) + 360) % 360;

/* ── DU REPÈRE VU AU REPÈRE DU PDF ── */
/** La page vue : ses côtés échangés par un quart de tour. */
export const dimensionsVues = (l: number, h: number, tour: number): { l: number; h: number } =>
  tour === 90 || tour === 270 ? { l: h, h: l } : { l, h };
/** Un point vu (u, v : depuis le coin BAS-gauche de la page vue) dans le repère
    de la page non tournée (l × h). Le PDF affiche sa page tournée dans le sens
    des aiguilles d'une montre de `tour` degrés. */
export function versLaPage(u: number, v: number, l: number, h: number, tour: number): { x: number; y: number } {
  if (tour === 90) return { x: l - v, y: u };
  if (tour === 180) return { x: l - u, y: h - v };
  if (tour === 270) return { x: v, y: h - u };
  return { x: u, y: v };
}
/** Où dessiner une pièce dans le repère du PDF : le coin d'ancrage (bas-gauche
    de la pièce telle qu'on la voit), sa taille, et l'angle (sens inverse des
    aiguilles d'une montre) qui la redresse à l'écran. `cadre` : la boîte
    visible de la page (sa CropBox), en points. */
export function placeSurLaPage(
  pose: Pick<PoseSurPdf, 'x' | 'y'>, hauteurPt: number,
  cadre: { x: number; y: number; largeur: number; hauteur: number }, tour: number,
): { x: number; y: number; angle: number } {
  const vue = dimensionsVues(cadre.largeur, cadre.hauteur, tour);
  const u = pose.x * vue.l;
  const v = vue.h - pose.y * vue.h - hauteurPt;
  const p = versLaPage(u, v, cadre.largeur, cadre.hauteur, tour);
  return { x: cadre.x + p.x, y: cadre.y + p.y, angle: tour };
}

/* ── LA COPIE ── */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const dateLongueDuJour = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])}${m[3] === '01' ? 'er' : ''} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : iso;
};
/** « Contrat de bail · signé le 15 octobre 2026.pdf » : l'année toujours. */
export function nomDeLaCopie(nom: string, iso: string): string {
  const base = String(nom ?? 'Document').replace(/\.pdf$/i, '').replace(/ · signé le .*$/, '').trim() || 'Document';
  return `${base} · signé le ${dateLongueDuJour(iso)}.pdf`;
}
const DIT: Record<GenreDePose, [string, string]> = {
  signature: ['signature', 'signatures'], paraphe: ['paraphe', 'paraphes'], tampon: ['tampon', 'tampons'], recu: ['tampon « Reçu le »', 'tampons « Reçu le »'],
  texte: ['texte', 'textes'], date: ['date', 'dates'], lu: ['« Lu et approuvé »', '« Lu et approuvé »'], coche: ['coche', 'coches'],
};
/** Ce que la copie porte, en clair, pour le journal de la ligne. */
export function contenuDeLaCopie(poses: readonly PoseSurPdf[], retouche: RetoucheDesPages, nbPages: number): string[] {
  const restent = poses.filter((p) => !retouche.retirees.includes(p.page));
  const out: string[] = [];
  for (const g of Object.keys(DIT) as GenreDePose[]) {
    const les = restent.filter((p) => p.genre === g);
    if (!les.length) continue;
    const pages = new Set(les.map((p) => p.page)).size;
    out.push(`${les.length} ${DIT[g][les.length > 1 ? 1 : 0]}${pages > 1 ? ` sur ${pages} pages` : ''}`);
  }
  const tournees = Object.values(retouche.tours).filter((q) => ((q % 4) + 4) % 4 !== 0).length;
  if (tournees) out.push(`${tournees} page${tournees > 1 ? 's' : ''} tournée${tournees > 1 ? 's' : ''}`);
  if (retouche.retirees.length) out.push(`${retouche.retirees.length} page${retouche.retirees.length > 1 ? 's' : ''} retirée${retouche.retirees.length > 1 ? 's' : ''} sur ${nbPages}`);
  return out;
}
/** On ne garde pas une copie vide de pages. */
export const resteDesPages = (retouche: RetoucheDesPages, nbPages: number): number => nbPages - new Set(retouche.retirees.filter((p) => p >= 0 && p < nbPages)).size;
/** PNG ou JPEG, lu dans les premiers octets : le type annoncé par le stockage peut mentir. */
export function genreDeLImage(o: Uint8Array): 'png' | 'jpg' | null {
  if (o.length > 8 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return 'png';
  if (o.length > 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'jpg';
  return null;
}
