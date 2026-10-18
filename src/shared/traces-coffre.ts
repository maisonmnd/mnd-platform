import { supabase } from './supabase';
import { uid } from './store';
import { cheminDeLaPhoto } from './trace-du-moyen-pur';

/* ══ LA PHOTO D'UN CHÈQUE OU D'UN TICKET — 18 octobre 2026 ═════════════
   Compartiment PRIVÉ `traces-privees` (migration 0134) : un chèque porte un
   numéro de compte. Le chemin porte le compte qui a pris la photo ; la base
   ne donne une adresse signée qu'à la direction et à ce compte-là.

   LA PHOTO SE RÉDUIT AVANT DE PARTIR : 1 600 pixels au plus, JPEG. Un
   chèque se lit très bien ainsi, et le téléphone du comptoir n'envoie pas
   six mégaoctets sur un réseau qui hésite.

   JAMAIS D'EXCEPTION : un dépôt raté se dit, et l'encaissement reste
   possible par la banque et le numéro. */
export const COFFRE_DES_TRACES = 'traces-privees';

async function reduite(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return b ?? f;
  } catch {
    return f;
  }
}

export async function deposeLaPhoto(branchId: string, f: File, par?: string): Promise<{ ok: true; photo: { chemin: string; le: string; par?: string } } | { ok: false; erreur: string }> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison : notez la banque et le numéro.' };
  const { data } = await supabase.auth.getSession();
  const compte = data.session?.user?.id;
  if (!compte) return { ok: false, erreur: 'Session fermée : reconnectez-vous, ou notez la banque et le numéro.' };
  const chemin = cheminDeLaPhoto(branchId, compte, uid());
  const corps = await reduite(f);
  const { error } = await supabase.storage.from(COFFRE_DES_TRACES).upload(chemin, corps, { contentType: 'image/jpeg', upsert: false });
  if (error) {
    const absent = /bucket|not found|introuvable/i.test(error.message);
    return { ok: false, erreur: absent
      ? 'Le coffre des photos n’est pas encore posé (migration 0134) : notez la banque et le numéro.'
      : `La photo n’est pas partie (${error.message}) : notez la banque et le numéro, ou réessayez.` };
  }
  return { ok: true, photo: { chemin, le: new Date().toISOString(), ...(par ? { par } : {}) } };
}

/** Une adresse signée, une heure. La base la refuse à qui n'a pas le droit. */
export async function adresseDeLaPhoto(chemin: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(COFFRE_DES_TRACES).createSignedUrl(chemin, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Le compte connecté (pour savoir si la photo est la sienne). */
export async function monCompte(): Promise<string | undefined> {
  if (!supabase) return undefined;
  return (await supabase.auth.getSession()).data.session?.user?.id;
}
