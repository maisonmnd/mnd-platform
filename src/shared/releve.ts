import { supabase } from './supabase';
import { uid } from './store';
import { PROMOTION, TABLE_DE_LA_RELEVE, dossierNettoye, type DossierReleve } from './releve-pur';

/* ══ LE DÉPÔT D'UN DOSSIER DE LA RELÈVE — 15 octobre 2026 ═════════════
   Comme les demandes de l'Académie (0106) : le site public écrit UNE ligne
   et ne relit rien. La base (0131) refuse une ligne qui ne tient pas, et
   personne hors de la direction ne la relit : une boîte de candidatures
   qu'on pourrait relire serait un fichier de jeunes femmes offert au
   premier venu.

   `true` si la ligne est écrite ; jamais d'exception, une candidate qui a
   écrit sa lettre ne doit pas voir un écran cassé. */
export async function deposeLeDossier(d: DossierReleve, o: { branchId?: string; page?: string } = {}): Promise<boolean> {
  if (!supabase) return false;
  const propre = dossierNettoye(d);
  if (!propre) return false;
  const { error } = await supabase.from(TABLE_DE_LA_RELEVE).insert({
    id: `rel-${uid()}`,
    branch_id: o.branchId || null,
    data: { ...propre, promotion: PROMOTION.cle, quand: new Date().toISOString(), ...(o.page ? { page: o.page.slice(0, 120) } : {}) },
  });
  if (error) { console.warn('[la-releve] dépôt refusé :', error.message); return false; }
  return true;
}
