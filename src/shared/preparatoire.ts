import { supabase } from './supabase';
import { uid } from './store';
import { ANNEE, TABLE_DE_LA_PREPARATOIRE, inscriptionNettoyee, type InscriptionPreparatoire } from './preparatoire-pur';

/* ══ LE DÉPÔT D'UNE INSCRIPTION À L'ANNÉE PRÉPARATOIRE — 15 octobre 2026 ══
   Comme La Relève : le site écrit UNE ligne et ne relit rien (0131). Ce
   sont des mineures : la boîte ne se lit que par la direction. `true` si la
   ligne est écrite, jamais d'exception. */
export async function deposeLInscription(i: InscriptionPreparatoire, o: { branchId?: string } = {}): Promise<boolean> {
  if (!supabase) return false;
  const propre = inscriptionNettoyee(i);
  if (!propre) return false;
  const { error } = await supabase.from(TABLE_DE_LA_PREPARATOIRE).insert({
    id: `prep-${uid()}`,
    branch_id: o.branchId || null,
    data: { ...propre, annee: ANNEE.cle, quand: new Date().toISOString() },
  });
  if (error) { console.warn('[annee-preparatoire] dépôt refusé :', error.message); return false; }
  return true;
}
