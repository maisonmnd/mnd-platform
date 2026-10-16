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

/* « Une image » (16 octobre 2026) : « sur cette page j'ai besoin de rajouter
   une image » (Yéman, le plan de situation d'un formulaire) ; une photo, une
   capture, ou la première page d'un PDF, posée et tirée comme un tampon. */
/* « Modifier le texte » et « Effacer une zone » (16 octobre 2026) : « je veux
   pouvoir effacer ce qui est écrit et écrire le mien, remplir comme voulu,
   comme dans Acrobat » (Yéman). Elle revient sur le « on n'efface jamais »
   de la maquette : la COPIE peut couvrir un texte imprimé (de la couleur du
   papier dessous) et en écrire un autre à sa place. L'ORIGINAL ne bouge
   toujours pas, et le journal de la copie dit ce qui a été modifié. */
export type GenreDePose = 'signature' | 'paraphe' | 'tampon' | 'recu' | 'image' | 'texte' | 'date' | 'lu' | 'coche' | 'remplace' | 'efface';
export const GENRES_IMAGES: readonly GenreDePose[] = ['signature', 'paraphe', 'tampon', 'recu', 'image'];
export const estUneImage = (g: GenreDePose): boolean => GENRES_IMAGES.includes(g);
/** Les pièces qui COUVRENT ce qui est imprimé (et se dessinent avant toutes les autres). */
export const estUnCache = (g: GenreDePose): boolean => g === 'remplace' || g === 'efface';
export type Famille = 'sans' | 'serif' | 'mono';

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
  /** La clé de l'image : 'signature', 'paraphe', 'tampon:<clé>', 'recu:<AAAA-MM-JJ>', 'image:<id>'. */
  image?: string;
  /** Le texte écrit (texte, date, « Lu et approuvé »). */
  texte?: string;
  /** La taille du texte, en points. */
  taille?: number;
  /** La hauteur, en fraction de la page vue (ce qu'on couvre). */
  hauteur?: number;
  /** La couleur du papier sous la zone couverte, et celle de l'encre d'origine (#rrggbb). */
  fond?: string;
  encre?: string;
  /** La famille de lettres du texte d'origine. */
  famille?: Famille;
  /** Le texte imprimé qu'on a remplacé (pour le journal). */
  ancien?: string;
};

/** Ce qu'on fait des pages DANS LA COPIE : des quarts de tour, des pages retirées. */
export type RetoucheDesPages = { tours: Record<number, number>; retirees: number[] };
export const retoucheVide = (): RetoucheDesPages => ({ tours: {}, retirees: [] });

/** Les largeurs de départ, en fraction de la page vue. */
export const LARGEUR_DE_DEPART: Record<GenreDePose, number> = {
  signature: 0.26, paraphe: 0.1, tampon: 0.2, recu: 0.24, image: 0.4, texte: 0, date: 0, lu: 0, coche: 0, remplace: 0, efface: 0.25,
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
  signature: ['signature', 'signatures'], paraphe: ['paraphe', 'paraphes'], tampon: ['tampon', 'tampons'], recu: ['tampon « Reçu le »', 'tampons « Reçu le »'], image: ['image', 'images'],
  texte: ['texte', 'textes'], date: ['date', 'dates'], lu: ['« Lu et approuvé »', '« Lu et approuvé »'], coche: ['coche', 'coches'],
  remplace: ['texte imprimé modifié', 'textes imprimés modifiés'], efface: ['zone effacée', 'zones effacées'],
};
/** Ce que la copie porte, en clair, pour le journal de la ligne. */
export function contenuDeLaCopie(poses: readonly PoseSurPdf[], retouche: RetoucheDesPages, nbPages: number, champsRemplis = 0): string[] {
  const restent = poses.filter((p) => !retouche.retirees.includes(p.page));
  const out: string[] = [];
  for (const g of Object.keys(DIT) as GenreDePose[]) {
    const les = restent.filter((p) => p.genre === g);
    if (!les.length) continue;
    const pages = new Set(les.map((p) => p.page)).size;
    out.push(`${les.length} ${DIT[g][les.length > 1 ? 1 : 0]}${pages > 1 ? ` sur ${pages} pages` : ''}`);
  }
  if (champsRemplis > 0) out.push(`${champsRemplis} champ${champsRemplis > 1 ? 's' : ''} du formulaire rempli${champsRemplis > 1 ? 's' : ''}`);
  const tournees = Object.values(retouche.tours).filter((q) => ((q % 4) + 4) % 4 !== 0).length;
  if (tournees) out.push(`${tournees} page${tournees > 1 ? 's' : ''} tournée${tournees > 1 ? 's' : ''}`);
  if (retouche.retirees.length) out.push(`${retouche.retirees.length} page${retouche.retirees.length > 1 ? 's' : ''} retirée${retouche.retirees.length > 1 ? 's' : ''} sur ${nbPages}`);
  return out;
}
/** TIRER LE COIN D'UNE PIÈCE (16 octobre 2026) : la nouvelle largeur d'une
    image (fraction de la page vue, jamais au-delà du bord droit), ou la
    nouvelle taille d'un texte (6 à 40 points, au demi-point). */
export function tailleApresLeCoin(pose: Pick<PoseSurPdf, 'genre' | 'x' | 'largeur' | 'taille'>, facteur: number): Pick<PoseSurPdf, 'largeur'> | Pick<PoseSurPdf, 'taille'> {
  if (estUneImage(pose.genre)) return { largeur: Math.min(0.95, 1 - pose.x, Math.max(0.04, pose.largeur * facteur)) };
  return { taille: Math.min(40, Math.max(6, Math.round((pose.taille ?? TAILLE_DU_TEXTE) * facteur * 2) / 2)) };
}
/** Tirer le coin d'une zone effacée : largeur et hauteur suivent le doigt
    chacune de son côté (fractions de la page), sans sortir de la page. */
export function cadreApresLeCoin(pose: Pick<PoseSurPdf, 'x' | 'y' | 'largeur' | 'hauteur'>, dx: number, dy: number): Pick<PoseSurPdf, 'largeur' | 'hauteur'> {
  return {
    largeur: Math.min(1 - pose.x, Math.max(0.01, pose.largeur + dx)),
    hauteur: Math.min(1 - pose.y, Math.max(0.005, (pose.hauteur ?? 0.03) + dy)),
  };
}
/** Ce que la poignée affiche en tirant : « 150 % » d'une image, « 14 pt » d'un texte. */
export const tailleDite = (pose: Pick<PoseSurPdf, 'genre' | 'largeur' | 'taille' | 'hauteur'>): string =>
  pose.genre === 'efface' ? `${Math.round(pose.largeur * 100)} × ${Math.round((pose.hauteur ?? 0) * 100)} % de la page`
    : estUneImage(pose.genre) ? `${Math.round((pose.largeur / (LARGEUR_DE_DEPART[pose.genre] || 1)) * 100)} %` : `${pose.taille ?? TAILLE_DU_TEXTE} pt`;

/* ── LES CHAMPS D'UN FORMULAIRE (16 octobre 2026) ──
   « Je veux remplir le document et compléter le formulaire » (Yéman). Un PDF
   remplissable porte des champs (texte, case, bouton radio, liste) que
   pdf.js décrit comme des annotations « Widget » ; on en garde ce qu'il faut
   pour les montrer sur la page et les remplir. Lecture seule, cachés,
   boutons-poussoirs : laissés tels quels. */
export type ChampDuPdf = {
  nom: string; page: number; genre: 'texte' | 'case' | 'radio' | 'liste';
  /** Le rectangle du champ dans le repère du PDF [x1, y1, x2, y2]. */
  rect: number[];
  valeur: string | boolean;
  /** La valeur « cochée » d'une case, ou celle de ce bouton radio. */
  exporte?: string;
  options?: { valeur: string; dit: string }[];
  multiLigne?: boolean;
};
export type AnnotationLue = {
  subtype?: string; fieldName?: string; fieldType?: string; rect?: number[]; fieldValue?: unknown; readOnly?: boolean; hidden?: boolean;
  checkBox?: boolean; radioButton?: boolean; pushButton?: boolean; exportValue?: string; buttonValue?: string;
  options?: { exportValue?: unknown; displayValue?: unknown }[]; multiLine?: boolean;
};
export function champDeLAnnotation(a: AnnotationLue, page: number): ChampDuPdf | null {
  if (a.subtype !== 'Widget' || !a.fieldName || a.readOnly || a.hidden || a.pushButton || !Array.isArray(a.rect) || a.rect.length !== 4) return null;
  const base = { nom: a.fieldName, page, rect: a.rect };
  if (a.fieldType === 'Tx') return { ...base, genre: 'texte', valeur: typeof a.fieldValue === 'string' ? a.fieldValue : '', multiLigne: !!a.multiLine };
  if (a.fieldType === 'Btn' && a.checkBox) {
    return { ...base, genre: 'case', valeur: typeof a.fieldValue === 'string' && a.fieldValue !== 'Off' && a.fieldValue === a.exportValue, exporte: a.exportValue };
  }
  if (a.fieldType === 'Btn' && a.radioButton) return { ...base, genre: 'radio', valeur: typeof a.fieldValue === 'string' && a.fieldValue !== 'Off' ? a.fieldValue : '', exporte: a.buttonValue };
  if (a.fieldType === 'Ch') {
    const v = Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue;
    return {
      ...base, genre: 'liste', valeur: v === undefined || v === null ? '' : String(v),
      options: (a.options ?? []).map((o) => ({ valeur: String(o.exportValue ?? o.displayValue ?? ''), dit: String(o.displayValue ?? o.exportValue ?? '') })),
    };
  }
  return null;
}
/** Combien de champs différents (un même champ peut paraître sur plusieurs pages). */
export const nombreDeChamps = (champs: readonly ChampDuPdf[]): number => new Set(champs.map((c) => c.nom)).size;
/* ── LES LIGNES IMPRIMÉES (Modifier le texte) ──
   pdf.js rend le texte d'une page en morceaux (str, transform, width) ; on
   les ramène dans le repère de la page VUE (sa viewport à l'échelle 1), on
   garde ce qui se lit droit, et l'on recoud les morceaux d'une même ligne.
   La boîte d'une ligne va de 0,9 de sa taille au-dessus de la ligne de base
   à 0,25 au-dessous : elle couvre les lettres montantes et descendantes. */
export const DESSUS = 0.9;
export const DESSOUS = 0.25;
/** Où tombe la ligne de base dans la boîte (depuis le haut). */
export const BASE_DANS_LA_BOITE = DESSUS / (DESSUS + DESSOUS);
export type MorceauDeTexte = { str: string; transform: readonly number[]; width: number; fontName?: string };
export type LigneImprimee = { texte: string; x: number; y: number; largeur: number; hauteur: number; taille: number; famille: Famille };
const multiplie = (m: readonly number[], n: readonly number[]): number[] => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export function lignesDuTexte(
  morceaux: readonly MorceauDeTexte[], vue: { transform: readonly number[]; width: number; height: number },
  familles: Readonly<Record<string, string>> = {},
): LigneImprimee[] {
  const echelle = Math.hypot(vue.transform[0], vue.transform[1]) || 1;
  type Brut = { str: string; x0: number; fin: number; base: number; fs: number; famille: Famille };
  const bruts: Brut[] = [];
  for (const it of morceaux) {
    if (!it.str || !it.str.trim()) continue;
    const m = multiplie(vue.transform, it.transform);
    const fs = Math.abs(m[3]);
    /* Droit à l'écran : de gauche à droite, ni penché ni à l'envers. */
    if (!(m[0] > 0) || !(fs > 0) || m[3] > 0 || Math.abs(m[1]) > 0.02 * m[0] || Math.abs(m[2]) > 0.02 * fs) continue;
    const f = familles[it.fontName ?? ''] ?? '';
    bruts.push({ str: it.str, x0: m[4], fin: m[4] + it.width * echelle, base: m[5], fs, famille: /serif/i.test(f) && !/sans/i.test(f) ? 'serif' : /mono/i.test(f) ? 'mono' : 'sans' });
  }
  /* Les rangées : même ligne de base (à un tiers de lettre près). */
  bruts.sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const rangees: Brut[][] = [];
  for (const b of bruts) {
    const r = rangees[rangees.length - 1];
    if (r && Math.abs(r[0].base - b.base) < 0.35 * Math.max(r[0].fs, b.fs)) r.push(b); else rangees.push([b]);
  }
  const out: LigneImprimee[] = [];
  for (const r of rangees) {
    r.sort((a, b) => a.x0 - b.x0);
    /* Les morceaux proches se recousent ; deux colonnes sur la même ligne de
       base (un grand blanc entre elles) restent deux lignes. */
    const segments: Brut[] = [];
    for (const b of r) {
      const c = segments[segments.length - 1];
      if (c && b.x0 - c.fin < 0.8 * c.fs && Math.abs(b.fs - c.fs) < 0.2 * c.fs) {
        const ecart = b.x0 - c.fin > 0.15 * c.fs && !c.str.endsWith(' ') && !b.str.startsWith(' ');
        segments[segments.length - 1] = { ...c, str: c.str + (ecart ? ' ' : '') + b.str, fin: Math.max(c.fin, b.fin) };
      } else segments.push({ ...b });
    }
    for (const c of segments) {
      const texte = c.str.replace(/\s+/g, ' ').trim();
      if (!texte) continue;
      const haut = c.base - DESSUS * c.fs, bas = c.base + DESSOUS * c.fs;
      out.push({
        texte, taille: Math.round(c.fs * 10) / 10, famille: c.famille,
        x: Math.max(0, (c.x0 - 1) / vue.width), y: Math.max(0, haut / vue.height),
        largeur: (c.fin - c.x0 + 2) / vue.width, hauteur: (bas - haut) / vue.height,
      });
    }
  }
  return out;
}

/* ── LES COULEURS SOUS UNE ZONE ──
   Le papier : la couleur la plus fréquente sur le BORD de la zone (une bande
   jaune reste jaune). L'encre : la couleur la plus fréquente de ce qui
   tranche nettement sur ce papier. Pixels RGBA, ligne après ligne. */
const enHex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
export function couleursDeLaZone(px: ArrayLike<number>, l: number, h: number): { fond: string; encre: string } {
  const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
  const seaux = (indices: number[]) => {
    const m = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (const i of indices) {
      const a = px[i + 3];
      const r = a === 0 ? 255 : px[i], g = a === 0 ? 255 : px[i + 1], b = a === 0 ? 255 : px[i + 2];
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const s = m.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      s.n += 1; s.r += r; s.g += g; s.b += b;
      m.set(k, s);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };
  if (!(l > 0) || !(h > 0) || px.length < l * h * 4) return { fond: '#ffffff', encre: '#141414' };
  const bord: number[] = [];
  for (let x = 0; x < l; x += 1) { bord.push(x * 4, ((h - 1) * l + x) * 4); }
  for (let y = 1; y < h - 1; y += 1) { bord.push(y * l * 4, (y * l + l - 1) * 4); }
  const f = seaux(bord)[0];
  const fond = f ? [f.r / f.n, f.g / f.n, f.b / f.n] : [255, 255, 255];
  const lf = lum(fond[0], fond[1], fond[2]);
  const tout: number[] = [];
  for (let i = 0; i < l * h; i += 1) tout.push(i * 4);
  const e = seaux(tout).find((s) => Math.abs(lum(s.r / s.n, s.g / s.n, s.b / s.n) - lf) > 90);
  const encre = e ? enHex(e.r / e.n, e.g / e.n, e.b / e.n) : lf > 128 ? '#141414' : '#ffffff';
  return { fond: enHex(fond[0], fond[1], fond[2]), encre };
}
/** « #rrggbb » → [r, g, b] entre 0 et 1 (ce qui ne se lit pas : la couleur donnée). */
export function couleurLue(hex: string | undefined, sinon: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : sinon;
}

/** On ne garde pas une copie vide de pages. */
export const resteDesPages = (retouche: RetoucheDesPages, nbPages: number): number => nbPages - new Set(retouche.retirees.filter((p) => p >= 0 && p < nbPages)).size;
/** PNG ou JPEG, lu dans les premiers octets : le type annoncé par le stockage peut mentir. */
export function genreDeLImage(o: Uint8Array): 'png' | 'jpg' | null {
  if (o.length > 8 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return 'png';
  if (o.length > 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'jpg';
  return null;
}
