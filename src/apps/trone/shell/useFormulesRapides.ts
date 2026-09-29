import { useEffect } from 'react';
import { useAppointments } from '../../../shared/agenda';
import { useServices } from '../../../shared/catalog';
import { useStore } from '../../../shared/store';
import { vitrineConfigStore } from '../../../shared/bridges';
import { useAuth } from '../../../shared/auth';
import { documentDescendu, tablePrete } from '../../../shared/sync';
import { formulesDesVenues, memesFormules } from '../../../shared/reservation-express';

/* ══ LES FORMULES RAPIDES DU SITE — 29 septembre 2026 ══════════════════════
   « La réservation en 30 secondes » (maquette validée par Yéman) : la
   nouvelle cliente ne répond plus à une question par famille, elle touche
   une grande carte, « lavage · reprise des racines · DÀNDÀN », la venue que
   les clientes de la Maison réservent le plus.

   CES CARTES VIENNENT DES VENUES, pas d'une liste écrite à la main : le
   Trône, qui seul lit les rendez-vous, compte les combinaisons honorées des
   six derniers mois et les pose dans `mnd_vitrine_config`, le document que
   le site lit sans compte. Seuls des identifiants de prestations et un
   compte y entrent, jamais une cliente.

   ON N'ÉCRIT QUE CE QUI CHANGE, et seulement une fois le document descendu :
   écrire avant écraserait les réglages de la vitrine par ceux de la graine. */
export function useFormulesRapides(): void {
  const { session } = useAuth();
  const [appts] = useAppointments();
  const [services] = useServices();
  const cfg = useStore(vitrineConfigStore)[0];

  useEffect(() => {
    if (!session) return;
    if (!tablePrete('appointments') || !tablePrete('catalog_services')) return;
    if (!documentDescendu('mnd_vitrine_config')) return;
    /* Une prestation désactivée ou archivée (drapeaux portés par la ligne,
       hors du type) fait tomber sa formule ; le site refiltre de toute façon
       selon sa porte et ses masques. */
    const vivants = new Set(services
      .filter((s) => { const x = s as { enabled?: boolean; archived?: boolean }; return x.enabled !== false && !x.archived; })
      .map((s) => s.id));
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const voulues = formulesDesVenues(appts, vivants, aujourdhui);
    if (memesFormules(cfg.formulesRapides, voulues)) return;
    vitrineConfigStore.set((prev) => ({ ...prev, formulesRapides: voulues }));
  }, [session, appts, services, cfg.formulesRapides]);
}
