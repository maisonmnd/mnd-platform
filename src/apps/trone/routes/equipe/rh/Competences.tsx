import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, Select, toast } from '../../../../../ds/components';
import { useBranch } from '../../../../../shared/branches';
import { NIVEAUX, dateDite, estPartie, type Formation, type Niveau } from '../../../../../shared/rh-pur';
import { nouvelleLigneRh, retoucheRh, effaceLaLigneRh, useRegistreRh } from '../../../../../shared/rh';
import { ordonneEquipe, staffStore, useStaff, type StaffMember } from '../data';
import { aujourdhuiRh, useQuiEcrit } from './_ui';
import { useFamillesDesGestes } from './familles';
import { useStaff as useMaTete } from '../../../../../shared/auth';

/* ══ COMPÉTENCES ET FORMATION — 14 octobre 2026 ═══════════════════════
   Qui sait faire quoi, famille de gestes par famille. Choix du 14 octobre :
   la grille AVERTIT l'agenda, elle ne bloque pas. Elle ne note pas une
   personne, elle dit un geste et un niveau ; elle ne touche pas au salaire.
   Les trois paliers restent ce qu'ils sont. */

export default function RhCompetences() {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const familles = useFamillesDesGestes();
  const me = useMaTete();
  const jour = aujourdhuiRh();
  const equipe = ordonneEquipe(staff.filter((m) => m.branchId === branch.id && !estPartie(m, jour) && m.auFauteuil));
  const registre = useRegistreRh();
  const formations = registre.filter((l): l is Formation => l.genre === 'formation' && l.branchId === branch.id);
  const [neuve, setNeuve] = useState(false);

  const pose = (m: StaffMember, famille: string, v: Niveau | '') => {
    staffStore.set((prev) => prev.map((x) => {
      if (x.id !== m.id) return x;
      const c = { ...(x.competences ?? {}) };
      if (v) c[famille] = { niveau: v, le: jour, par: me?.name || undefined }; else delete c[famille];
      return { ...x, competences: c };
    }));
  };

  return (
    <div className="sad-onglet">
      {familles.length === 0 ? (
        <div className="sec-vide">Aucune famille de gestes au catalogue de l’atelier : la grille se tient par les familles du catalogue.</div>
      ) : (
        <div className="rh-cadre">
          <table className="rh-grille">
            <thead><tr><th>Personne</th>{familles.map((f) => <th key={f.id} title={f.fon}>{f.nom}</th>)}</tr></thead>
            <tbody>
              {equipe.map((m) => (
                <tr key={m.id}>
                  <td className="qui">{m.name}{m.palier ? <span className="sad-doux"> · {m.palier}</span> : null}</td>
                  {familles.map((f) => {
                    const c = m.competences?.[f.id];
                    return (
                      <td key={f.id} title={c ? `${NIVEAUX[c.niveau]} depuis le ${dateDite(c.le)}${c.par ? `, validé par ${c.par}` : ''}` : 'Pas posé'}>
                        <select value={c?.niveau ?? ''} onChange={(e) => pose(m, f.id, e.target.value as Niveau | '')} aria-label={`${m.name}, ${f.nom}`}>
                          <option value="">non</option>
                          {(Object.keys(NIVEAUX) as Niveau[]).map((n) => <option key={n} value={n}>{NIVEAUX[n]}</option>)}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {equipe.length === 0 && <tr><td colSpan={familles.length + 1} className="sad-doux">Personne au fauteuil.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="sad-doux">Un niveau garde sa date et qui l’a validé. Un certificat de l’Académie MND fait monter le palier, comme avant. Une personne sans grille posée n’avertit jamais l’agenda : on ne devine pas.</p>

      <div className="sad-outils">
        <p className="sad-mois" style={{ margin: 0 }}>Le plan de formation interne</p>
        <Button variant="copper" onClick={() => setNeuve(true)}>+ Une formation</Button>
      </div>
      {formations.length === 0 && <div className="sec-vide">Aucune formation en cours. Les protocoles se lisent dans le manuel des formatrices.</div>}
      <div className="sad-liste">
        {formations.map((f) => {
          const qui = staff.find((m) => m.id === f.staffId);
          const faites = f.seances.filter((s) => s.faite).length;
          return (
            <div key={f.id} className="sad-ligne est-ouverte">
              <div className="sad-ligne__tete" style={{ cursor: 'default' }}>
                <span className="sad-ligne__num">{f.objectifLe ? `objectif ${dateDite(f.objectifLe)}` : 'sans date'}</span>
                <span className="sad-ligne__quoi"><b>{qui?.name ?? 'une fiche'} · {f.titre}</b><small>{f.objectif ? `vers « ${NIVEAUX[f.objectif]} »` : ''}{f.avec ? ` · accompagnée par ${f.avec}` : ''}</small></span>
                <span className="sad-badge">{faites} / {f.seances.length} séance{f.seances.length > 1 ? 's' : ''}</span>
              </div>
              <div className="sad-ligne__corps">
                <div className="rh-coches">
                  {f.seances.map((s, i) => (
                    <label key={i} className="rh-coche"><input type="checkbox" checked={!!s.faite} onChange={() => retoucheRh(f, { seances: f.seances.map((x, k) => (k === i ? { ...x, faite: !x.faite } : x)) })} /><span>{dateDite(s.le)}{s.avec ? <small> · {s.avec}</small> : null}</span></label>
                  ))}
                </div>
                <div className="sad-ajout-ligne">
                  <Input type="date" aria-label="Nouvelle séance" onChange={(e) => { if (e.target.value) { retoucheRh(f, { seances: [...f.seances, { le: e.target.value, avec: f.avec }].sort((a, b) => a.le.localeCompare(b.le)) }); e.target.value = ''; } }} />
                  <button type="button" className="sad-lien" onClick={() => { effaceLaLigneRh(f); toast('Formation retirée.'); }}>retirer</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {neuve && <FicheDeFormation equipe={equipe} familles={familles} onClose={() => setNeuve(false)} branchId={branch.id} />}
    </div>
  );
}

function FicheDeFormation({ equipe, familles, onClose, branchId }: {
  equipe: StaffMember[]; familles: { id: string; nom: string }[]; onClose: () => void; branchId: string;
}) {
  const { moi } = useQuiEcrit();
  const [staffId, setStaffId] = useState(equipe[0]?.id ?? '');
  const [famille, setFamille] = useState(familles[0]?.id ?? '');
  const [titre, setTitre] = useState('');
  const [par, setPar] = useState('');
  const [objectif, setObjectif] = useState<Niveau>('autonome');
  const [objectifLe, setObjectifLe] = useState('');
  const garde = () => {
    if (!staffId) return;
    const nom = familles.find((f) => f.id === famille)?.nom ?? '';
    nouvelleLigneRh<Formation>({
      genre: 'formation', branchId, staffId, famille: famille || undefined, titre: titre.trim() || nom || 'Formation',
      avec: par.trim() || undefined, objectif, objectifLe: objectifLe || undefined, seances: [], par: moi,
    });
    onClose();
  };
  return createPortal(
    <Modal title="Une formation" onClose={onClose} width={560}>
      <div className="sad-form">
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Pour"><Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>{equipe.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
          <Field label="Geste"><Select value={famille} onChange={(e) => setFamille(e.target.value)}><option value="">Autre</option>{familles.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}</Select></Field>
        </div>
        <Field label="Intitulé (facultatif)"><Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Hygiène des outils, réparation sur modèle…" /></Field>
        <div className="tr-grid tr-grid--3" style={{ gap: 12 }}>
          <Field label="Accompagnée par"><Input value={par} onChange={(e) => setPar(e.target.value)} /></Field>
          <Field label="Objectif"><Select value={objectif} onChange={(e) => setObjectif(e.target.value as Niveau)}>{(Object.keys(NIVEAUX) as Niveau[]).map((n) => <option key={n} value={n}>{NIVEAUX[n]}</option>)}</Select></Field>
          <Field label="D’ici le"><Input type="date" value={objectifLe} onChange={(e) => setObjectifLe(e.target.value)} /></Field>
        </div>
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}><Button variant="copper" onClick={garde}>Poser la formation</Button></div>
      </div>
    </Modal>,
    document.body,
  );
}
