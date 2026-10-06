import { supabase } from './supabase';
import { createStore, uid, useStore } from './store';
import { bindDocument } from './sync';
import { COFFRE_ENGAGEMENTS, adresseDuCoffre, deposeDansLeCoffre, imageDuCoffre, retireDuCoffre } from './engagements-coffre';
import {
  COFFRE_VIDE, DOSSIER_VIDE, type Campagne, type ContenuDuCoffre, type DossierDeBourse, type Fiche, type Piece,
  campagneSuivante, jourIso, nomDeFichier, rappelDu,
} from './bourse';

/* ══ LE COFFRE DU DOSSIER DE BOURSE — 6 octobre 2026 ═════════════════════

   MÊME COFFRE, MÊME RÈGLE, AUCUNE MIGRATION. Le chemin
   `bourse/identite/<campagne>/…` porte `identite` en deuxième segment : la
   base ne l'ouvre qu'à la direction (0099), comme la carte d'identité d'un
   prestataire, celle du personnel (18 septembre) ou les lettres d'un prêt
   (20 septembre). Un dossier de bourse dit une famille, des enfants, des
   salaires : il ne se lit pas au comptoir.

   LE COFFRE TIENT LES NOMS, LE MAGASIN NE TIENT QUE LE CALENDRIER. La table
   `documents` se lit par tout le personnel : on n'y range que la campagne,
   sa date de dépôt et l'état de la collecte, ce qu'il faut pour sonner le
   rappel au démarrage du Trône. La fiche et la liste des pièces vivent dans
   UN fichier JSON au coffre, `dossier.json`, et dans un cache local sur le
   poste de la direction, pour relire hors ligne ce qu'on a déjà ouvert. */

const DOSSIER_BOURSE = 'bourse';
export const dossierDeLaCampagne = (campagneId: string): string => `${DOSSIER_BOURSE}/identite/${campagneId}`;
const cheminDuJson = (campagneId: string): string => `${dossierDeLaCampagne(campagneId)}/dossier.json`;

/* ── Le magasin partagé : les campagnes et leur calendrier ─────────────── */
export const bourseStore = createStore<DossierDeBourse>('mnd_bourse', DOSSIER_VIDE);
bindDocument(bourseStore, 'mnd_bourse');
export const useBourse = () => useStore(bourseStore);

/** La campagne courante, créée si le magasin est vide : celle du prochain dépôt. */
export function campagneCourante(aujourdhui = jourIso(new Date())): Campagne {
  const d = bourseStore.get();
  const c = d.campagnes.find((x) => x.id === d.courante) ?? d.campagnes[d.campagnes.length - 1];
  if (c) return c;
  const s = campagneSuivante(aujourdhui);
  const neuve: Campagne = { id: uid(), anneeScolaire: s.anneeScolaire, anneeReference: s.anneeReference, collecte: {} };
  bourseStore.set({ campagnes: [neuve], courante: neuve.id });
  return neuve;
}

export function modifieLaCampagne(id: string, patch: Partial<Campagne>): void {
  const d = bourseStore.get();
  bourseStore.set({ ...d, campagnes: d.campagnes.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
}

export function ouvreUneCampagne(anneeScolaire: string, anneeReference: number): Campagne {
  const d = bourseStore.get();
  const neuve: Campagne = { id: uid(), anneeScolaire, anneeReference, collecte: {} };
  bourseStore.set({ campagnes: [...d.campagnes, neuve], courante: neuve.id });
  return neuve;
}

/* ── Le cache local du contenu du coffre ───────────────────────────────────
   Local seulement : jamais relié à la synchro. Il vit sur le poste de la
   direction et entre dans sa sauvegarde, comme tout ce qui est `mnd_`. */
export const coffreCacheStore = createStore<Record<string, ContenuDuCoffre>>('mnd_bourse_coffre', {});
export const useCoffreCache = () => useStore(coffreCacheStore);

export const contenuEnCache = (campagneId: string): ContenuDuCoffre => coffreCacheStore.get()[campagneId] ?? COFFRE_VIDE;

function poseEnCache(campagneId: string, contenu: ContenuDuCoffre): void {
  coffreCacheStore.set({ ...coffreCacheStore.get(), [campagneId]: contenu });
}

/* ── Lire et écrire le JSON du coffre ──────────────────────────────────── */
/** LIRE le dossier au coffre. `null` : hors ligne, droit refusé ou rien
    d'écrit encore ; l'écran retombe alors sur le cache. */
export async function litLeCoffre(campagneId: string): Promise<ContenuDuCoffre | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(COFFRE_ENGAGEMENTS).download(cheminDuJson(campagneId));
  if (error || !data) return null;
  try {
    const brut = JSON.parse(await data.text()) as Partial<ContenuDuCoffre>;
    const contenu: ContenuDuCoffre = {
      fiche: { ...COFFRE_VIDE.fiche, ...(brut.fiche ?? {}) },
      pieces: Array.isArray(brut.pieces) ? brut.pieces : [],
      modifieLe: brut.modifieLe ?? '',
    };
    poseEnCache(campagneId, contenu);
    return contenu;
  } catch (e) {
    console.warn('[mnd-bourse] dossier.json illisible :', e);
    return null;
  }
}

/** ÉCRIRE le dossier : le cache d'abord, le coffre ensuite. Rend faux quand
    le coffre n'a pas pris, et l'écran le dit ; la saisie, elle, est gardée. */
export async function ecritLeCoffre(campagneId: string, contenu: ContenuDuCoffre): Promise<boolean> {
  const date = { ...contenu, modifieLe: new Date().toISOString() };
  poseEnCache(campagneId, date);
  if (!supabase) return false;
  const blob = new Blob([JSON.stringify(date)], { type: 'application/json' });
  const { error } = await supabase.storage.from(COFFRE_ENGAGEMENTS).upload(cheminDuJson(campagneId), blob, {
    contentType: 'application/json', upsert: true,
  });
  if (error) { console.warn('[mnd-bourse] écriture refusée :', error.message); return false; }
  return true;
}

/* ── Les pièces ─────────────────────────────────────────────────────────── */
/** DÉPOSER une pièce : le fichier au coffre sous son nom rangé, puis la
    ligne dans le dossier. Rend la pièce, ou `null` si le coffre a refusé. */
export async function deposeUnePiece(
  campagneId: string, contenu: ContenuDuCoffre, f: File, o: { rubrique: string; mois?: string; expireLe?: string; note?: string },
): Promise<{ piece: Piece; contenu: ContenuDuCoffre } | null> {
  const nom = nomDeFichier(o.rubrique, f.name, o.mois);
  const range = new File([f], nom, { type: f.type });
  const depose = await deposeDansLeCoffre(DOSSIER_BOURSE, campagneId, 'identite', range);
  if (!depose) return null;
  const piece: Piece = {
    id: uid(), rubrique: o.rubrique, nom, chemin: depose.chemin, type: f.type, taille: f.size,
    deposeLe: jourIso(new Date()), mois: o.mois, expireLe: o.expireLe, note: o.note,
  };
  const suivant = { ...contenu, pieces: [...contenu.pieces, piece] };
  await ecritLeCoffre(campagneId, suivant);
  return { piece, contenu: suivant };
}

/** RETIRER une pièce : le fichier d'abord, la ligne ensuite. Une ligne sans
    fichier vaudrait un dossier qui croit tenir ce qu'il n'a plus. */
export async function retireUnePiece(campagneId: string, contenu: ContenuDuCoffre, pieceId: string): Promise<ContenuDuCoffre | null> {
  const p = contenu.pieces.find((x) => x.id === pieceId);
  if (!p) return contenu;
  if (p.chemin && !(await retireDuCoffre([p.chemin]))) return null;
  const suivant = { ...contenu, pieces: contenu.pieces.filter((x) => x.id !== pieceId) };
  await ecritLeCoffre(campagneId, suivant);
  return suivant;
}

/** Corriger une ligne (mois, expiration, note) sans toucher au fichier. */
export async function corrigeUnePiece(campagneId: string, contenu: ContenuDuCoffre, pieceId: string, patch: Partial<Pick<Piece, 'mois' | 'expireLe' | 'note' | 'rubrique'>>): Promise<ContenuDuCoffre> {
  const suivant = { ...contenu, pieces: contenu.pieces.map((x) => (x.id === pieceId ? { ...x, ...patch } : x)) };
  await ecritLeCoffre(campagneId, suivant);
  return suivant;
}

export async function ecritLaFiche(campagneId: string, contenu: ContenuDuCoffre, fiche: Fiche): Promise<ContenuDuCoffre> {
  const suivant = { ...contenu, fiche: { ...fiche, modifieeLe: new Date().toISOString() } };
  await ecritLeCoffre(campagneId, suivant);
  return suivant;
}

/* ── Lire une pièce pour l'assemblage ──────────────────────────────────── */
export type PieceChargee = { type: 'pdf'; octets: ArrayBuffer } | { type: 'image'; donnees: string; ratio: number } | null;

/** CHARGER une pièce depuis le coffre : un PDF tel quel, une image redessinée
    en JPEG (via `imageDuCoffre`, qui la ramène à 1 400 px). `null` si le
    coffre refuse ou si le fichier n'est ni l'un ni l'autre. */
export async function chargeLaPiece(p: Piece): Promise<PieceChargee> {
  if (!p.chemin) return null;
  const estPdf = p.type === 'application/pdf' || p.nom.toLowerCase().endsWith('.pdf');
  if (estPdf) {
    const url = await adresseDuCoffre(p.chemin);
    if (!url) return null;
    try {
      const rep = await fetch(url);
      if (!rep.ok) return null;
      return { type: 'pdf', octets: await rep.arrayBuffer() };
    } catch (e) { console.warn('[mnd-bourse] pièce illisible :', e); return null; }
  }
  const image = await imageDuCoffre(p.chemin, 1600);
  return image ? { type: 'image', ...image } : null;
}

/* ── Le rappel au démarrage ────────────────────────────────────────────────
   Appelé par le Shell quand le rôle est connu, pour la direction seule : le
   magasin partagé suffit à savoir si la collecte du mois est faite. */
export function rappelDeCollecte(aujourdhui = jourIso(new Date())): { mois: string; message: string } | null {
  const d = bourseStore.get();
  const c = d.campagnes.find((x) => x.id === d.courante) ?? d.campagnes[d.campagnes.length - 1];
  if (!c) return null;
  const r = rappelDu(c, aujourdhui);
  if (r) modifieLaCampagne(c.id, { rappelVu: r.mois });
  return r;
}
