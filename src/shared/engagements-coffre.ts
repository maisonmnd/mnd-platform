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

/** DÉPOSER UNE PIÈCE. Rend la pièce, ou `null` si le dépôt a échoué —
    jamais une exception : un dossier qui casse parce qu'une photo n'est pas
    passée ferait perdre la saisie avec elle. */
export async function deposeDansLeCoffre(
  branchId: string, engagementId: string, genre: GenreDePiece, f: File,
): Promise<PieceJointe | null> {
  if (!supabase) return null;
  /* Le nom est NETTOYÉ mais gardé lisible : « devis menuiserie.pdf » se
     retrouve d'un coup d'œil, « a3f9c2.pdf » jamais. */
  const propre = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);
  const chemin = `${branchId}/${dossierDu(genre)}/${engagementId}/${uid()}-${propre}`;
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
