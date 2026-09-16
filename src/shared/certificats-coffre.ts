import { supabase } from './supabase';

/* ══ LE COFFRE DES CERTIFICATS — 16 septembre 2026 ═══════════════════════

   « Me permettre de sauvegarder le certificat » (Yéman). Deux gestes en un :
   le PDF se télécharge sur le poste, et la MÊME copie se dépose ici, au
   dossier de l'apprenant, où le Suivi de l'Académie la retrouve.

   UN DOSSIER PAR INSCRIPTION, UN FICHIER PAR NUMÉRO :
     `<inscription>/<numéro>.pdf`
   Le certificat rouvert pour corriger une faute REMPLACE le précédent : c'est
   le même papier, sous le même numéro, et deux copies qui se contredisent ne
   prouveraient rien (migration 0103). Le personnel dépose et relit ; la
   direction seule efface.

   AUCUNE ADRESSE PUBLIQUE, JAMAIS. Un lien signé vaut une heure et se
   redemande à chaque lecture, comme au Fil et aux Engagements. */
export const COFFRE_CERTIFICATS = 'certificats';

const sansAccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** « MND-AC-2026-0001 » reste tel quel ; un numéro vide ou fantaisiste
    devient un nom de fichier qui se lit quand même. */
export const numeroPropre = (numero: string): string => {
  const p = sansAccent(numero.trim()).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return p || 'sans-numero';
};

/** « Vioutou Raimath Bonou » → « Vioutou-Raimath-Bonou ». */
export const nomPropre = (nom: string): string => {
  const p = sansAccent(nom.trim()).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return p || 'apprenant';
};

/** L'identifiant d'inscription, borné à ce qu'un chemin de coffre accepte. */
export const dossierPropre = (dossier: string): string => dossier.trim().replace(/[^A-Za-z0-9_-]/g, '');

/** Le nom du fichier téléchargé : le nom, puis le numéro, pour qu'un dossier
    de téléchargements se trie de lui-même. */
export const nomDuFichierCertificat = (apprenant: string, numero: string): string =>
  `Certificat-MND-${nomPropre(apprenant)}-${numeroPropre(numero)}.pdf`;

export const cheminDuCertificat = (dossier: string, numero: string): string =>
  `${dossierPropre(dossier)}/${numeroPropre(numero)}.pdf`;

export type CopieDeCertificat = { chemin: string; nom: string; deposeLe: string; taille: number };

type FichierDuCoffre = {
  name: string;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: { size?: number } | null;
};

/** CE QUE LE COFFRE RANGE POUR UN DOSSIER, la plus récente d'abord. Les
    sous-dossiers et ce qui n'est pas un PDF ne comptent pas. */
export function copiesTriees(dossier: string, fichiers: readonly FichierDuCoffre[]): CopieDeCertificat[] {
  const d = dossierPropre(dossier);
  return fichiers
    .filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    .map((f) => ({
      chemin: `${d}/${f.name}`,
      nom: f.name,
      deposeLe: f.updated_at || f.created_at || '',
      taille: f.metadata?.size ?? 0,
    }))
    .sort((a, b) => b.deposeLe.localeCompare(a.deposeLe) || a.nom.localeCompare(b.nom));
}

/** DÉPOSER LE CERTIFICAT. Rend son chemin, ou `null` si le dépôt a échoué
    (hors ligne, personne de connecté sur ce poste, droit refusé) : jamais
    une exception, le PDF est déjà sur le poste, c'est la copie qui manque. */
export async function deposeLeCertificat(dossier: string, numero: string, pdf: Blob): Promise<string | null> {
  if (!supabase || !dossierPropre(dossier)) return null;
  const chemin = cheminDuCertificat(dossier, numero);
  const { error } = await supabase.storage.from(COFFRE_CERTIFICATS).upload(chemin, pdf, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) { console.warn('[mnd-certificats] dépôt refusé :', error.message); return null; }
  return chemin;
}

/** LES COPIES AU DOSSIER D'UNE INSCRIPTION. Vide si rien n'y est, ou si le
    coffre ne répond pas. */
export async function copiesAuDossier(dossier: string): Promise<CopieDeCertificat[]> {
  const d = dossierPropre(dossier);
  if (!supabase || !d) return [];
  const { data, error } = await supabase.storage.from(COFFRE_CERTIFICATS).list(d, { limit: 50 });
  if (error) { console.warn('[mnd-certificats] lecture refusée :', error.message); return []; }
  return copiesTriees(d, (data ?? []) as FichierDuCoffre[]);
}

/** UNE ADRESSE SIGNÉE, valable une heure. */
export async function adresseDuCertificat(chemin: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(COFFRE_CERTIFICATS).createSignedUrl(chemin, 3600);
  if (error) { console.warn('[mnd-certificats] adresse refusée :', error.message); return null; }
  return data?.signedUrl ?? null;
}
