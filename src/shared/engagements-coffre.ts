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
