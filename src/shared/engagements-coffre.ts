import { supabase } from './supabase';
import { uid } from './store';
import type { PieceJointe } from './finance';

/* ══ LE COFFRE DES ENGAGEMENTS — 15 septembre 2026 ══════════════════════

   Les pièces d'un engagement : le devis envoyé par le prestataire, la
   décharge revenue signée au stylo, les photos du chantier — et la PIÈCE
   D'IDENTITÉ.

   UN COMPARTIMENT À PART, PAS CELUI DU FIL. Le Fil ouvre ses pièces à tout
   le personnel ; une carte d'identité ne s'ouvre qu'à la direction. Deux
   règles de lecture différentes ne tiennent pas dans un même compartiment
   sans que l'une finisse par fuir dans l'autre (migration 0099).

   DEUX DOSSIERS, ET C'EST LE CHEMIN QUI PORTE LA RÈGLE :
     `<branche>/identite/<engagement>/…` — la direction seule ;
     `<branche>/pieces/<engagement>/…`   — tout le personnel.
   La base lit le deuxième segment du chemin pour décider. Poser une carte
   d'identité dans `pieces/` la rendrait lisible à tous : c'est pour cela que
   le genre est un paramètre, et jamais un nom de dossier tapé à la main.

   AUCUNE ADRESSE PUBLIQUE, JAMAIS. Un lien signé vaut une heure et se
   redemande à chaque lecture — comme au Fil. */
export const COFFRE_ENGAGEMENTS = 'engagements';

export type GenreDePiece = 'devis' | 'decharge' | 'chantier' | 'identite';

const dossierDu = (genre: GenreDePiece): 'identite' | 'pieces' =>
  (genre === 'identite' ? 'identite' : 'pieces');

/** LE CHEMIN D'UNE PIÈCE — `<branche>/<identite|pieces>/<dossier>/<jeton>-<nom>`.
    Le deuxième segment porte la règle de lecture ; le jeton rend chaque dépôt
    unique. Séparé du dépôt pour s'éprouver sans réseau (`verifie-identite-du-personnel`). */
export function cheminDeLaPiece(
  branchId: string, dossierId: string, genre: GenreDePiece, nomDuFichier: string, jeton: string,
): string {
  /* Le nom est NETTOYÉ mais gardé lisible : « devis menuiserie.pdf » se
     retrouve d'un coup d'œil, « a3f9c2.pdf » jamais. */
  const propre = nomDuFichier.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);
  return `${branchId}/${dossierDu(genre)}/${dossierId}/${jeton}-${propre}`;
}

/** DÉPOSER UNE PIÈCE. Rend la pièce, ou `null` si le dépôt a échoué —
    jamais une exception : un dossier qui casse parce qu'une photo n'est pas
    passée ferait perdre la saisie avec elle. */
export async function deposeDansLeCoffre(
  branchId: string, engagementId: string, genre: GenreDePiece, f: File,
): Promise<PieceJointe | null> {
  if (!supabase) return null;
  const chemin = cheminDeLaPiece(branchId, engagementId, genre, f.name, uid());
  const { error } = await supabase.storage.from(COFFRE_ENGAGEMENTS).upload(chemin, f, {
    contentType: f.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) { console.warn('[mnd-engagements] dépôt refusé :', error.message); return null; }
  return { chemin, nom: f.name, type: f.type, taille: f.size };
}

/** UNE ADRESSE SIGNÉE, valable une heure. La base refuse de la donner à qui
    n'a pas le droit de lire : pour une pièce d'identité, c'est ce refus-là, et
    non l'écran, qui tient la porte. */
export async function adresseDuCoffre(chemin: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(COFFRE_ENGAGEMENTS).createSignedUrl(chemin, 3600);
  if (error) { console.warn('[mnd-engagements] adresse refusée :', error.message); return null; }
  return data?.signedUrl ?? null;
}

/** UNE PHOTO DU COFFRE, PRÊTE À POSER SUR UN PAPIER — la pièce d'identité
    sur la décharge (15 septembre 2026).

    ELLE EST REDESSINÉE, PAS RECOPIÉE : ramenée à 1 400 pixels au plus grand
    côté et réécrite en JPEG sur fond blanc. Une photo de téléphone brute pèse
    plusieurs mégaoctets, et une décharge qu'on ne peut plus envoyer par
    WhatsApp ne sert à personne. Rend `null` si le fichier ne se lit pas comme
    une image (un PDF, un HEIC que le navigateur ignore, un droit refusé). */
export async function imageDuCoffre(
  chemin: string, cote = 1400,
): Promise<{ donnees: string; ratio: number } | null> {
  const url = await adresseDuCoffre(chemin);
  if (!url) return null;
  try {
    const rep = await fetch(url);
    if (!rep.ok) return null;
    const image = await createImageBitmap(await rep.blob());
    const echelle = Math.min(1, cote / Math.max(image.width, image.height));
    const l = Math.max(1, Math.round(image.width * echelle));
    const h = Math.max(1, Math.round(image.height * echelle));
    const toile = document.createElement('canvas');
    toile.width = l; toile.height = h;
    const c = toile.getContext('2d');
    if (!c) return null;
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, l, h);
    c.drawImage(image, 0, 0, l, h);
    image.close();
    return { donnees: toile.toDataURL('image/jpeg', 0.86), ratio: l / h };
  } catch (e) {
    console.warn('[mnd-engagements] image illisible :', e);
    return null;
  }
}

/** RETIRER DES PIÈCES DU COFFRE — par l'API de stockage, qui efface
    réellement le fichier. Effacer la seule ligne en base laisserait les
    octets derrière, et une carte d'identité « effacée » qui existe encore
    est pire qu'une carte gardée en connaissance de cause. */
export async function retireDuCoffre(chemins: readonly string[]): Promise<boolean> {
  if (!supabase || chemins.length === 0) return true;
  const { error } = await supabase.storage.from(COFFRE_ENGAGEMENTS).remove([...chemins]);
  if (error) { console.warn('[mnd-engagements] retrait refusé :', error.message); return false; }
  return true;
}

/* ══ LA PIÈCE D'IDENTITÉ DU PERSONNEL — 18 septembre 2026 ═══════════════

   « Je veux avoir un espace réservé dans la fiche du personnel avec sa
   carte d'identité, exactement comme quand je crée la fiche d'engagement
   pour les prestataires » (Yéman).

   LE MÊME COFFRE, LA MÊME RÈGLE, SANS MIGRATION. Le chemin
   `personnel/identite/<fiche>/…` a `identite` pour deuxième segment : la
   base ne l'ouvre qu'à la direction, comme la carte d'un prestataire (0099).

   LA FICHE NE GARDE AUCUNE TRACE DE LA PIÈCE. La table `team` se lit par
   tout le personnel et s'écrit par lui (0006, 0091) : y ranger le chemin
   montrerait à tous qu'une carte existe, et son nom de fichier, et une fiche
   renvoyée par un poste en retard l'effacerait. C'est donc le COFFRE qu'on
   lit, et lui seul : ce qui y est, est rangé. */
const DOSSIER_DU_PERSONNEL = 'personnel';

/** Le dossier où dort la pièce d'une fiche, et que la direction lit. */
export const dossierDeLIdentiteDuPersonnel = (staffId: string): string =>
  `${DOSSIER_DU_PERSONNEL}/identite/${staffId}`;

/** Une pièce d'identité rangée : son chemin, le nom lisible, le jour du dépôt. */
export type IdentiteRangee = { chemin: string; nom: string; deposeLe: string };

/** « k3f9a2mxq1-carte-recto.jpg » → « carte-recto.jpg » : le jeton de dépôt
    ne dit rien à qui lit. */
export const nomSansJeton = (fichier: string): string => {
  const i = fichier.indexOf('-');
  return i > 0 && i < fichier.length - 1 ? fichier.slice(i + 1) : fichier;
};

/** DÉPOSER la pièce d'identité d'une fiche. Rend la pièce, ou `null`. */
export function deposeLIdentiteDuPersonnel(staffId: string, f: File): Promise<PieceJointe | null> {
  return deposeDansLeCoffre(DOSSIER_DU_PERSONNEL, staffId, 'identite', f);
}

/** LIRE ce que le coffre garde pour une fiche, la plus récente d'abord.
    `null` si la lecture a échoué : « rien » et « illisible » ne se
    confondent pas. Hors direction, la base rend une liste vide ; l'écran ne
    pose donc la question qu'à la direction. */
export async function identiteDuPersonnel(staffId: string): Promise<IdentiteRangee[] | null> {
  if (!supabase) return null;
  const dossier = dossierDeLIdentiteDuPersonnel(staffId);
  const { data, error } = await supabase.storage.from(COFFRE_ENGAGEMENTS).list(dossier, {
    limit: 20, sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) { console.warn('[mnd-engagements] lecture refusée :', error.message); return null; }
  return (data ?? [])
    .filter((o) => o.id && o.name && o.name !== '.emptyFolderPlaceholder')
    .map((o) => ({ chemin: `${dossier}/${o.name}`, nom: nomSansJeton(o.name), deposeLe: (o.created_at ?? '').slice(0, 10) }));
}

/** EFFACER la pièce d'une fiche, toutes ses copies comprises. Vrai quand le
    coffre ne garde plus rien pour elle. */
export async function effaceLIdentiteDuPersonnel(staffId: string): Promise<boolean> {
  const rangees = await identiteDuPersonnel(staffId);
  if (rangees === null) return false;
  return retireDuCoffre(rangees.map((r) => r.chemin));
}
