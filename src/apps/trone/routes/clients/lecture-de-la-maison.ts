import { useEffect } from 'react';
import { useStore } from '../../../../shared/store';
import { consultationsQueueStore } from '../../../../shared/bridges';
import { useBesoins } from '../../../../shared/besoins';
import { useCategories, useServices } from '../../../../shared/catalog';
import { useModelBands } from '../../../../shared/pricing';
import { documentDescendu, tablePrete } from '../../../../shared/sync';
import { gardeDeLaPeau, lectureDeLaMaison, type LectureDeLaMaison } from '../../../../shared/lecture-de-la-maison-pur';
import type { PrestationBrute } from '../../../../shared/estimation-pur';

/* ══ LA LECTURE SE FAIT AU TRÔNE — 17 novembre 2026 ═════════════════════════
   Une consultation déposée sur le site n'apporte ni prestations, ni
   fourchettes, ni estimation (`push-notify`, `depotPropre`). Le premier
   poste du Trône qui ouvre Consultations les calcule sur son catalogue,
   depuis ce qu'elle a coché et dit de sa couronne, et les écrit sur la
   consultation : les files A, B et C, le devis et la mesure lisent
   `estimation`, les nombres de la Maison.

   RIEN AVANT D'AVOIR LU : ni la file, ni le catalogue, ni les réglages des
   besoins ne se lisent à moitié (une lecture faite sur la semence serait
   fausse, et elle ne se refait pas). Une consultation déjà lue ne se relit
   pas : ce que la Maison a écrit reste. */
export function useLectureDeLaMaison(): void {
  const [file] = useStore(consultationsQueueStore);
  const [reglages] = useBesoins();
  const [services] = useServices();
  const [categories] = useCategories();
  const [calibres] = useModelBands();

  useEffect(() => {
    if (!tablePrete('consultations_queue') || !tablePrete('catalog_services') || !documentDescendu('mnd_besoins')) return;
    if (services.length === 0) return;
    const aLire = file.filter((o) => o.modalite === 'auto' && o.status !== 'fermée' && !o.estimation && (o.besoins?.length ?? 0) > 0);
    if (aLire.length === 0) return;
    const fermees = new Set(categories.filter((c) => (c as { enabled?: boolean }).enabled === false).map((c) => c.id));
    const lues = new Map<string, { lecture: LectureDeLaMaison; peau: boolean }>();
    for (const o of aLire) {
      const lecture = lectureDeLaMaison(o, reglages, services as unknown as PrestationBrute[], calibres, fermees);
      if (lecture) lues.set(o.id, { lecture, peau: gardeDeLaPeau(o, reglages) });
    }
    if (lues.size === 0) return;
    consultationsQueueStore.set((prev) => prev.map((o) => {
      const l = lues.get(o.id);
      return l && !o.estimation ? { ...o, estimation: l.lecture, ...(l.peau ? { garde: 'peau' as const } : {}) } : o;
    }));
  }, [file, reglages, services, categories, calibres]);
}
