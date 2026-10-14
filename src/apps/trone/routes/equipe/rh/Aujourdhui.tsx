import { useMemo, useState } from 'react';
import { useBranch } from '../../../../../shared/branches';
import { ceQuiAttendLaDirection, dateDite, estPartie, type FicheRh, type OngletRh } from '../../../../../shared/rh-pur';
import { useModelesDArrivee, useRegistreRh, useReglagesRh } from '../../../../../shared/rh';
import { useStaff } from '../data';
import { useLeave } from '../payroll';
import { Compteurs, Repliee, aujourdhuiRh, rappelRh } from './_ui';

/* ══ AUJOURD'HUI — 14 octobre 2026 ═══════════════════════════════════
   Le matin de la direction : qui est attendu, ce qui expire, ce qui attend
   une décision. Chaque ligne mène à son onglet ; la même liste nourrit
   « À faire » (RappelDesRh). */

export function useCeQuiAttend() {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const [conges] = useLeave();
  const registre = useRegistreRh();
  const [reglages] = useReglagesRh();
  const [modeles] = useModelesDArrivee();
  const jour = aujourdhuiRh();
  return useMemo(() => {
    const fiches = staff.filter((m) => m.branchId === branch.id) as unknown as FicheRh[];
    const ids = new Set(fiches.map((f) => f.id));
    return ceQuiAttendLaDirection({
      fiches, conges: conges.filter((c) => ids.has(c.employeeId)),
      registre: registre.filter((l) => !l.staffId || ids.has(l.staffId)),
      reglages, modelesDArrivee: modeles, jour,
    });
  }, [staff, conges, registre, reglages, modeles, branch.id, jour]);
}

export default function RhAujourdhui({ va }: { va: (o: OngletRh) => void }) {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const items = useCeQuiAttend();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const jour = aujourdhuiRh();
  const actives = staff.filter((m) => m.branchId === branch.id && !estPartie(m, jour));
  const compte = (o: OngletRh) => items.filter((i) => i.onglet === o).length;
  return (
    <div className="sad-onglet">
      <Compteurs items={[
        { n: actives.length, dit: 'personnes à la Maison', surClic: () => va('personnel') },
        { n: compte('entretiens'), dit: 'entretiens à préparer', alerte: compte('entretiens') > 0, surClic: () => va('entretiens') },
        { n: compte('temps'), dit: 'congés à décider', alerte: compte('temps') > 0, surClic: () => va('temps') },
        { n: items.filter((i) => i.cle.startsWith('pieces:')).length, dit: 'dossiers incomplets', surClic: () => va('personnel') },
        { n: compte('arrivees'), dit: 'arrivées et départs en cours', surClic: () => va('arrivees') },
        { n: compte('discipline') + compte('obligations'), dit: 'procédures et obligations', surClic: () => va('obligations') },
      ]} />
      {items.length === 0 ? (
        <div className="sec-vide">Rien n’attend la direction aujourd’hui. Les fins d’essai, les CDD, les congés demandés, les dossiers incomplets et les obligations du mois paraîtront ici.</div>
      ) : (
        <div className="sad-liste">
          {items.map((i) => {
            const r = rappelRh(i.date, jour);
            return (
              <Repliee
                key={i.cle} ouverte={ouvert === i.cle} surBascule={() => setOuvert(ouvert === i.cle ? null : i.cle)}
                num={i.date ? dateDite(i.date) : i.quoi}
                titre={`${i.date ? `${i.quoi} · ` : ''}${i.titre}`}
                sous={i.sous}
                badge={r.badge ?? (i.urgent ? 'à faire' : undefined)} urgent={r.urgent ?? i.urgent}
              >
                <div className="sec-actions"><button type="button" className="sad-lien" onClick={() => va(i.onglet)}>Ouvrir</button></div>
              </Repliee>
            );
          })}
        </div>
      )}
    </div>
  );
}
