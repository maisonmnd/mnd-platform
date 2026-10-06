import { createStore, useStore, uid } from './store';
import { supabase } from './supabase';
import { asset } from './asset';
import {
  APPELS, clotures, enTeteDe, prefixeDeSerie, prochainNumero, rangeDansLeCadre, retireLesSignatures, signe, modifiable,
  type Entite, type Entreprise, type LigneSecretariat, type Piece, type Profil, type Signataire,
} from './secretariat-pur';
import { modeleDe, remplis } from './secretariat-modeles';
import { dateSurLeRecu, TAMPON_A_DATER, tamponAutoSvg, tamponParCle, tamponParDefaut, svgEnPng } from './secretariat-tampons';

/* LE SECRÉTARIAT, CÔTÉ TRÔNE — 6 octobre 2026.

   Une table (`secretariat`, 0116), quatre genres de lignes : les documents,
   les entreprises créées à l'instant, les fiches des signataires, les
   coordonnées personnelles. La base garde la porte (0116) : une ligne
   personnelle n'est lue que par la direction ; un document signé ne bouge
   plus, sauf pour la direction qui l'annule.

   LES SIGNATURES vivent dans un compartiment privé, `signatures/<compte>/`,
   que seul leur titulaire lit : chacun ne pose que la sienne (choix du
   6 octobre). Au moment de signer, l'image est copiée DANS le document
   signé : il se réimprime ainsi à l'identique, comme une page signée. */

export const secretariatStore = createStore<LigneSecretariat[]>('mnd_secretariat', []);
export const useSecretariat = () => useStore(secretariatStore);

export const pieces = (l: readonly LigneSecretariat[]): Piece[] => l.filter((x): x is Piece => x.genre === 'piece');
export const entreprises = (l: readonly LigneSecretariat[]): Entreprise[] => l.filter((x): x is Entreprise => x.genre === 'entreprise');
export const signatairesDe = (l: readonly LigneSecretariat[]): Signataire[] => l.filter((x): x is Signataire => x.genre === 'signataire');
export const profils = (l: readonly LigneSecretariat[]): Profil[] => l.filter((x): x is Profil => x.genre === 'profil');

const ecris = (ligne: LigneSecretariat): void =>
  secretariatStore.set((prev) => (prev.some((x) => x.id === ligne.id) ? prev.map((x) => (x.id === ligne.id ? ligne : x)) : [...prev, ligne]));

const maintenant = (): string => new Date().toISOString();
const aujourdhui = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ══ LES DOCUMENTS ═══════════════════════════════════════════════════ */

export function nouvellePiece(o: { branchId: string; entite: Entite; entrepriseId?: string; modele: string; auteurId: string; signataires: Piece['signataires'] }): Piece {
  const m = modeleDe(o.modele);
  const appel = m.appel >= 0 ? APPELS[m.appel] : '';
  const p: Piece = {
    id: `doc-${uid()}`, genre: 'piece', branchId: o.branchId, entite: o.entite, entrepriseId: o.entrepriseId,
    auteurId: o.auteurId, modele: m.cle, titre: m.titre, lieu: 'Cotonou', date: aujourdhui(),
    destinataire: m.destinataire, objet: m.objet, appel,
    corps: m.corps, cloture: m.cloture >= 0 ? clotures(appel || 'Madame, Monsieur,', o.entite)[m.cloture] : '',
    signataires: o.signataires, poses: [], tampon: tamponParDefaut(o.entite), cadre: 'droite',
    etat: 'brouillon', aRelire: m.aRelire, creeLe: maintenant(),
  };
  p.poses = rangeDansLeCadre('droite', [...p.signataires.map((s) => `sig:${s.userId}`), ...(p.tampon ? ['tampon'] : [])]);
  ecris(p);
  return p;
}

/** Une modification du texte n'est permise qu'au brouillon ; les poses
    (glisser une signature, choisir un tampon) aussi. */
export function metsAJour(p: Piece, patch: Partial<Piece>): Piece {
  if (!modifiable(p)) return p;
  const suite = { ...p, ...patch };
  ecris(suite);
  return suite;
}

/** Le numéro de la série, donné quand le document est complet. */
function numerote(p: Piece, toutes: readonly LigneSecretariat[]): Piece {
  if (p.numero || p.etat !== 'signe') return p;
  const entreprise = entreprises(toutes).find((e) => e.id === p.entrepriseId);
  const auteur = profils(toutes).find((x) => x.userId === p.auteurId) ?? signatairesDe(toutes).find((s) => s.userId === p.auteurId);
  const prefixe = prefixeDeSerie(p, { entreprise, auteurNom: auteur?.nom });
  const annee = parseInt(p.date.slice(0, 4), 10) || new Date().getFullYear();
  return { ...p, numero: prochainNumero(prefixe, annee, pieces(toutes).map((x) => x.numero)) };
}

/** SIGNER : la signature de CE compte seulement (`signe` le vérifie). */
export function signeLaPiece(p: Piece, userId: string, image: string): Piece {
  const suite = numerote(signe(p, userId, image, maintenant()), secretariatStore.get());
  if (suite !== p) ecris(suite);
  return suite;
}

/** Une note sans signataire se finalise d'un geste. */
export function finalise(p: Piece): Piece {
  if (p.etat !== 'brouillon' || p.signataires.length > 0) return p;
  const suite = numerote({ ...p, etat: 'signe', signeLe: maintenant() }, secretariatStore.get());
  ecris(suite);
  return suite;
}

/** La direction annule les signatures : le document redevient un brouillon. */
export function annuleLesSignatures(p: Piece): Piece {
  const suite = retireLesSignatures(p);
  ecris(suite);
  return suite;
}

/** Dupliquer : un brouillon neuf, sans signature ni numéro. `remplace` pour
    une correction d'un document signé. */
export function duplique(p: Piece, o: { remplace?: boolean; auteurId: string }): Piece {
  const copie: Piece = {
    ...retireLesSignatures(p), id: `doc-${uid()}`, auteurId: o.auteurId, creeLe: maintenant(), date: aujourdhui(),
    remplace: o.remplace ? p.numero : undefined,
  };
  ecris(copie);
  return copie;
}

export function effaceLaPiece(p: Piece): void {
  secretariatStore.set((prev) => prev.filter((x) => x.id !== p.id));
}

/* ══ LES ENTREPRISES, LES SIGNATAIRES, LES PROFILS ═══════════════════ */

export function creeEntreprise(o: { branchId: string; nom: string; mentions: string; telephone: string; signataire: string; signature?: string }): Entreprise {
  const e: Entreprise = { id: `ent-${uid()}`, genre: 'entreprise', entite: 'autre', creeLe: maintenant(), ...o };
  ecris(e);
  return e;
}
export const majEntreprise = (e: Entreprise, patch: Partial<Entreprise>): void => ecris({ ...e, ...patch });

export function enregistreMonSignataire(o: { branchId: string; userId: string; nom: string; qualite: string; aSaSignature: boolean }): void {
  ecris({ id: `sig-${o.userId}`, genre: 'signataire', entite: 'mnd', ...o });
}

export function enregistreMonProfil(o: { branchId: string; userId: string; nom: string; adresse: string; telephone: string }): void {
  ecris({ id: `prof-${o.userId}`, genre: 'profil', entite: 'perso', ...o });
}

/* ══ MA SIGNATURE : le compartiment privé ════════════════════════════ */

const cheminDeMaSignature = (userId: string) => `${userId}/signature.png`;

/** Ma signature, en data URL, ou `null` si je n'en ai pas encore. */
export async function chargeMaSignature(userId: string): Promise<string | null> {
  if (!supabase || !userId) return null;
  /* Sans réseau, la lecture pouvait ne jamais répondre : la fenêtre restait
     sur « Lecture… ». Au-delà de 8 secondes, on fait comme si rien n'était
     gardé ; signer redemandera la signature au moment voulu. */
  const lecture = supabase.storage.from('signatures').download(cheminDeMaSignature(userId));
  const delai = new Promise<{ data: null; error: Error }>((ok) => setTimeout(() => ok({ data: null, error: new Error('délai') }), 8000));
  const { data, error } = await Promise.race([lecture, delai]);
  if (error || !data) return null;
  return await new Promise<string | null>((ok) => {
    const r = new FileReader();
    r.onloadend = () => ok(typeof r.result === 'string' ? r.result : null);
    r.onerror = () => ok(null);
    r.readAsDataURL(data);
  });
}

export async function deposeMaSignature(userId: string, png: string): Promise<boolean> {
  if (!supabase || !userId) return false;
  const blob = await (await fetch(png)).blob();
  const { error } = await supabase.storage.from('signatures').upload(cheminDeMaSignature(userId), blob, { contentType: 'image/png', upsert: true });
  if (error) { console.warn('[mnd-secretariat] signature refusée :', error.message); return false; }
  return true;
}

/** LA PHOTO D'UNE SIGNATURE, NETTOYÉE : l'encre reste, le papier devient
    transparent, l'image est recadrée sur le trait. Une signature sur papier
    blanc, au stylo foncé, photographiée de jour, suffit. */
export function nettoieLaSignature(src: CanvasImageSource & { width: number; height: number }): string | null {
  const max = 1000;
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k));
  const h = Math.max(1, Math.round(src.height * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  /* Le seuil suit la page : la luminance moyenne du papier, moins une marge. */
  let somme = 0;
  for (let i = 0; i < d.length; i += 4) somme += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const papier = somme / (d.length / 4);
  const seuil = papier - 40;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (d[i + 3] === 0 || lum >= seuil) { d[i + 3] = 0; continue; }
      /* Plus le trait est foncé, plus il est opaque : les bords restent doux. */
      const a = Math.min(255, ((seuil - lum) / Math.max(1, seuil)) * 255 * 2.5 + 40);
      d[i] = Math.min(d[i], 60); d[i + 1] = Math.min(d[i + 1], 60); d[i + 2] = Math.min(d[i + 2], 90);
      d[i + 3] = a;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  ctx.putImageData(img, 0, 0);
  const marge = 8;
  const cx = Math.max(0, x0 - marge), cy = Math.max(0, y0 - marge);
  const cw = Math.min(w - cx, x1 - x0 + 2 * marge), ch = Math.min(h - cy, y1 - y0 + 2 * marge);
  const sortie = document.createElement('canvas');
  sortie.width = cw; sortie.height = ch;
  sortie.getContext('2d')?.drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch);
  return sortie.toDataURL('image/png');
}

/* ══ CE QUE LE PDF REÇOIT, TOUT RÉSOLU ═══════════════════════════════ */

const IMAGES = new Map<string, Promise<string | null>>();
/** Une image chargée une fois par séance : l'aperçu se redessine à chaque
    lettre tapée, il ne doit pas recharger le tampon à chaque fois. */
const enCache = (cle: string, f: () => Promise<string | null>): Promise<string | null> => {
  if (!IMAGES.has(cle)) IMAGES.set(cle, f().then((r) => { if (r === null) IMAGES.delete(cle); return r; }));
  return IMAGES.get(cle) as Promise<string | null>;
};
const enDataUrl = async (url: string): Promise<string | null> => enCache(url, async () => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise<string | null>((ok) => { const f = new FileReader(); f.onloadend = () => ok(typeof f.result === 'string' ? f.result : null); f.onerror = () => ok(null); f.readAsDataURL(b); });
  } catch { return null; }
});

export type DocumentResolu = {
  piece: Piece;
  enTete: ReturnType<typeof enTeteDe>;
  texte: { destinataire: string; objet: string; appel: string; corps: string; cloture: string };
  tampon?: { image: string; ratio: number };
  noms: { nom: string; qualite: string }[];
};

/** Résout un document pour l'écran et le PDF : en-tête de l'entité, jetons
    remplis, image du tampon, noms des signataires. */
export async function resous(p: Piece, toutes: readonly LigneSecretariat[], nomMaison: string): Promise<DocumentResolu> {
  const entreprise = entreprises(toutes).find((e) => e.id === p.entrepriseId);
  const profil = profils(toutes).find((x) => x.userId === p.auteurId);
  const enTete = enTeteDe(p.entite, { nomMaison, entreprise, profil });
  const premier = p.signataires[0];
  const v = {
    entreprise: p.entite === 'perso' ? (profil?.nom ?? '') : enTete.nom,
    signataire: premier?.nom ?? (p.entite === 'autre' ? entreprise?.signataire ?? '' : '[SIGNATAIRE]'),
    qualite: premier?.qualite ?? 'représentant(e) légal(e)',
    ville: enTete.ville,
  };
  const t = (s: string) => remplis(s, v);
  let tampon: DocumentResolu['tampon'];
  if (p.tampon === 'auto' && entreprise) {
    const svg = tamponAutoSvg(entreprise.nom, entreprise.mentions, entreprise.telephone);
    const png = await enCache(svg, () => svgEnPng(svg));
    if (png) tampon = { image: png, ratio: 1 };
  } else if (p.tampon) {
    const def = tamponParCle(p.tampon);
    let png = def ? await enDataUrl(asset(`/assets/tampons/${def.fichier}`)) : null;
    /* « REÇU LE » : la date s'écrit dans ses blancs. */
    if (png && p.tampon === TAMPON_A_DATER) {
      const brut = png;
      const quand = p.dateTampon || p.date;
      png = await enCache(`recu:${quand}`, () => dateSurLeRecu(brut, quand));
    }
    if (def && png) tampon = { image: png, ratio: def.ratio };
  }
  const noms = p.signataires.length
    ? p.signataires.map((s) => ({ nom: s.nom, qualite: s.qualite }))
    : [{ nom: p.entite === 'perso' ? (profil?.nom ?? '') : 'La Direction', qualite: '' }];
  return {
    piece: p, enTete, tampon, noms,
    texte: { destinataire: t(p.destinataire), objet: t(p.objet), appel: p.appel, corps: t(p.corps), cloture: p.cloture },
  };
}

/* ══ VERS LE PDF ═════════════════════════════════════════════════════ */

import type { PieceEcritePdfData } from './pdf';
import { dateDite, dimsDuTampon, nomsDansLaZone, paragraphes, SIGNATURE_MM, ZONE } from './secretariat-pur';

/** Ce que le PDF reçoit : les signatures POSÉES seulement (avec leur image),
    le tampon s'il est posé, les noms sous la zone. Un brouillon le dit. */
export function versLePdf(r: DocumentResolu): PieceEcritePdfData {
  const p = r.piece;
  const tamponPose = p.poses.find((q) => q.cle === 'tampon');
  const dims = r.tampon ? dimsDuTampon(r.tampon.ratio) : null;
  const nomFichier = (p.numero ?? `brouillon-${p.titre}`).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '-');
  return {
    enTete: r.enTete,
    numero: p.numero,
    brouillon: p.etat !== 'signe',
    remplace: p.remplace,
    lieuEtDate: `${p.lieu || r.enTete.ville}, le ${dateDite(p.date)}`,
    destinataire: r.texte.destinataire,
    objet: r.texte.objet,
    appel: r.texte.appel,
    paragraphes: paragraphes(r.texte.corps),
    cloture: r.texte.cloture,
    zone: {
      largeur: ZONE.largeur, hauteur: ZONE.hauteur,
      signatures: p.poses.filter((q) => q.cle.startsWith('sig:') && q.image)
        .map((q) => ({ x: q.x, y: q.y, image: q.image as string, largeur: SIGNATURE_MM.largeur, hauteurMax: SIGNATURE_MM.hauteur })),
      tampon: tamponPose && r.tampon && dims ? { x: tamponPose.x, y: tamponPose.y, image: r.tampon.image, l: dims.l, h: dims.h } : undefined,
      ...(() => { const n = nomsDansLaZone(p, r.noms); return { noms: n.noms, colonnes: n.colonnes, xEntite: n.xEntite }; })(),
      nomEntite: p.entite === 'perso' ? undefined : r.enTete.nom,
    },
    filename: `${r.enTete.entite === 'perso' ? 'Lettre' : r.enTete.nom.replace(/\s+/g, '-')}-${nomFichier}.pdf`,
  };
}

import { bindCollection } from './sync';
bindCollection(secretariatStore, 'secretariat');
