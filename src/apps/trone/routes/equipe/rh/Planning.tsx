import { useState } from 'react';
import { Button, toast } from '../../../../../ds/components';
import { useBranch } from '../../../../../shared/branches';
import {
  JOURS_COURTS, STATUTS, ajouteJours, dateDite, estPartie, lundiDe, semaineDe,
  type Planning, type Semaine, type Statut,
} from '../../../../../shared/rh-pur';
import { planningStore, usePlanning } from '../../../../../shared/rh';
import { ordonneEquipe, useStaff } from '../data';
import { aujourdhuiRh } from './_ui';

/* ══ LE PLANNING DE LA SEMAINE — 14 octobre 2026 ═══════════════════════
   Qui est au fauteuil, à l'accueil, en repos, en congé, chaque jour. Une
   semaine type par personne, et les semaines qui s'en écartent. L'agenda le
   lit : un rendez-vous posé sur une main en repos se signale. Un congé
   accordé s'y pose seul. Le souverain l'écrit, toute l'équipe le lit (0130). */

const ORDRE: (Statut | '')[] = ['', 'fauteuil', 'accueil', 'travail', 'academie', 'repos', 'conge'];

export default function RhPlanning() {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const [planning] = usePlanning();
  const jour = aujourdhuiRh();
  const [lundi, setLundi] = useState(lundiDe(jour));
  const [modele, setModele] = useState(false);
  const equipe = ordonneEquipe(staff.filter((m) => m.branchId === branch.id && !estPartie(m, jour)));
  const p: Planning = planning ?? {};

  const ecris = (staffId: string, i: number, s: Statut | '') => {
    planningStore.set((prev) => {
      const base = prev ?? {};
      if (modele) {
        const sem: Semaine = [...(base.modele?.[staffId] ?? Array(7).fill(''))];
        sem[i] = s;
        return { ...base, modele: { ...(base.modele ?? {}), [staffId]: sem } };
      }
      const sem = semaineDe(base, staffId, lundi);
      sem[i] = s;
      return { ...base, semaines: { ...(base.semaines ?? {}), [lundi]: { ...(base.semaines?.[lundi] ?? {}), [staffId]: sem } } };
    });
  };
  const copieLaPrecedente = () => {
    const avant = ajouteJours(lundi, -7);
    planningStore.set((prev) => {
      const base = prev ?? {};
      const copie: Record<string, Semaine> = {};
      for (const m of equipe) copie[m.id] = semaineDe(base, m.id, avant);
      return { ...base, semaines: { ...(base.semaines ?? {}), [lundi]: copie } };
    });
    toast(`Semaine du ${dateDite(avant)} recopiée.`);
  };

  return (
    <div className="sad-onglet">
      <div className="sad-outils">
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!modele && <Button size="sm" variant="ghost" onClick={() => setLundi(ajouteJours(lundi, -7))} aria-label="Semaine précédente">←</Button>}
          <b>{modele ? 'La semaine type de chacune' : `Semaine du ${dateDite(lundi)} au ${dateDite(ajouteJours(lundi, 5))}`}</b>
          {!modele && <Button size="sm" variant="ghost" onClick={() => setLundi(ajouteJours(lundi, 7))} aria-label="Semaine suivante">→</Button>}
        </span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!modele && <Button size="sm" variant="ghost" onClick={copieLaPrecedente}>Copier la semaine précédente</Button>}
          <Button size="sm" variant={modele ? 'copper' : 'ghost'} onClick={() => setModele(!modele)}>{modele ? 'Revenir aux semaines' : 'Régler la semaine type'}</Button>
        </span>
      </div>
      <div className="rh-cadre">
        <table className="rh-grille rh-planning">
          <thead><tr><th>Personne</th>{JOURS_COURTS.map((j, i) => <th key={j}>{j}{modele ? '' : ` ${Number(ajouteJours(lundi, i).slice(8))}`}</th>)}</tr></thead>
          <tbody>
            {equipe.map((m) => {
              const sem = modele ? (p.modele?.[m.id] ?? Array(7).fill('')) : semaineDe(p, m.id, lundi);
              return (
                <tr key={m.id}>
                  <td className="qui">{m.name}</td>
                  {sem.map((s, i) => (
                    <td key={i} className={`jour${s ? ` s-${s}` : ''}`}>
                      <select value={s} onChange={(e) => ecris(m.id, i, e.target.value as Statut | '')} aria-label={`${m.name}, ${JOURS_COURTS[i]}`}>
                        {ORDRE.map((o) => <option key={o} value={o}>{o ? STATUTS[o] : '·'}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              );
            })}
            {equipe.length === 0 && <tr><td colSpan={8} className="sad-doux">Personne à planifier.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="sad-doux">Un congé accordé dans « Congés et absences » se pose seul au planning. L’agenda signale un rendez-vous posé sur une main en repos ou en congé ; il ne le refuse pas.</p>
    </div>
  );
}
