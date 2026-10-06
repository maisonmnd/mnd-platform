import { useEffect } from 'react';
import { appointmentsStore, useAppointments } from '../../../shared/agenda';
import { useAuth } from '../../../shared/auth';
import { tablePrete } from '../../../shared/sync';
import { reprisesARendreNues } from '../../../shared/reprise-nue';
/* Un automatisme qui réécrit en boucle se tait de lui-même (voir shared/ecriture-automatique.ts). */
import { gardeLEcriture } from '../../../shared/ecriture-automatique';

/* LES REPRISES NÉES PAYÉES SE DÉSHABILLENT — 2 octobre 2026.

   Jusqu'à ce jour, une reprise posée à l'encaissement recopiait la somme
   réglée du rituel d'avant : « payé » au Carnet, comptée dans les revenus à
   venir, jamais réclamée (voir shared/reprise-nue.ts). La pose est corrigée ;
   ce hook rend nues celles qui sont déjà au carnet, et seulement elles.

   ON N'AGIT QUE SUR DU CHARGÉ, AVEC UNE SESSION : un carnet à moitié lu ne
   dirait pas la vérité sur le rituel d'avant. Idempotent : une fois nues, les
   reprises ne sont plus retenues, la passe suivante n'écrit rien. */
export function useReprisesNuesVivant(): void {
  const { session } = useAuth();
  const [rdvs] = useAppointments();
  useEffect(() => {
    if (!session || !tablePrete('appointments')) return;
    const patchs = reprisesARendreNues(rdvs);
    if (patchs.size === 0) return;
    gardeLEcriture('reprises', appointmentsStore).set((prev) => prev.map((a) => {
      const p = patchs.get(a.id);
      if (!p) return a;
      const nue = { ...a } as Record<string, unknown>;
      for (const k of Object.keys(p)) delete nue[k];
      return nue as typeof a;
    }));
  }, [session, rdvs]);
}
