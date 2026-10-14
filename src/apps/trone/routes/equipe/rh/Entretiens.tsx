import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Modal, Select, Textarea, toast } from '../../../../../ds/components';
import { useBranch } from '../../../../../shared/branches';
import {
  DECISIONS_D_ESSAI, TYPES_D_ENTRETIEN, dateDite, estPartie,
  type DecisionDEssai, type Entretien, type TypeDEntretien,
} from '../../../../../shared/rh-pur';
import { effaceLaLigneRh, nouvelleLigneRh, retoucheRh, useRegistreRh } from '../../../../../shared/rh';
import { ordonneEquipe, staffStore, useStaff, type StaffMember } from '../data';
import { EvaluationModal } from '../Evaluation';
import { Repliee, aujourdhuiRh, rappelRh, useQuiEcrit } from './_ui';
import { prepareLaLettre } from './lettres';

/* ══ LES ENTRETIENS — 14 octobre 2026 ═════════════════════════════════
   Le point à 30 jours, la fin de période d'essai (et sa décision signée),
   l'entretien annuel (déjà en place : fiche de poste et entretien, signature
   au doigt), le retour après une longue absence, le départ. Trois questions,
   deux colonnes : ce qu'elle dit, ce que la Maison dit. Signé, l'entretien se
   partage avec elle (elle le lit dans son espace). Les jauges « Rétention et
   bien-être », jamais tenues, cèdent la place à ses propres mots. */

export default function RhEntretiens() {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const registre = useRegistreRh();
  const jour = aujourdhuiRh();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [neuf, setNeuf] = useState(false);
  const [annuelPour, setAnnuelPour] = useState<StaffMember | null>(null);
  const equipe = ordonneEquipe(staff.filter((m) => m.branchId === branch.id && !estPartie(m, jour)));
  const entretiens = registre
    .filter((l): l is Entretien => l.genre === 'entretien' && l.branchId === branch.id)
    .sort((a, b) => Number(!!a.faitLe) - Number(!!b.faitLe) || (a.faitLe ? b.prevuLe.localeCompare(a.prevuLe) : a.prevuLe.localeCompare(b.prevuLe)));
  const nomDe = (id: string) => staff.find((m) => m.id === id)?.name ?? 'une fiche';

  return (
    <div className="sad-onglet">
      <div className="sad-outils">
        <span className="sad-doux">{entretiens.filter((e) => !e.faitLe).length} à venir · {entretiens.filter((e) => e.faitLe).length} faits</span>
        <Button variant="copper" onClick={() => setNeuf(true)}>+ Poser un entretien</Button>
      </div>
      {entretiens.length === 0 && <div className="sec-vide">Aucun entretien au calendrier. Le point à 30 jours et la fin d’essai se posent depuis « Arrivées et départs ».</div>}
      <div className="sad-liste">
        {entretiens.map((e) => {
          const r = e.faitLe ? {} : rappelRh(e.prevuLe, jour);
          return (
            <Repliee key={e.id} ouverte={ouvert === e.id} surBascule={() => setOuvert(ouvert === e.id ? null : e.id)}
              num={dateDite(e.faitLe ?? e.prevuLe)} titre={`${TYPES_D_ENTRETIEN[e.type]} · ${nomDe(e.staffId)}`}
              sous={e.avec ? `avec ${e.avec}` : undefined}
              badge={e.faitLe ? (e.decision ? DECISIONS_D_ESSAI[e.decision] : e.partage ? 'fait, partagé' : 'fait') : r.badge} urgent={r.urgent} fait={!!e.faitLe}>
              <CorpsDeLEntretien e={e} fiche={staff.find((m) => m.id === e.staffId)} onFerme={() => setOuvert(null)} />
            </Repliee>
          );
        })}
      </div>

      <p className="sad-mois">Les entretiens annuels</p>
      <div className="sad-liste">
        {equipe.map((m) => {
          const dernier = [...(m.evaluations ?? [])].sort((a, b) => b.at.localeCompare(a.at))[0];
          return (
            <div key={m.id} className="sad-ligne">
              <button type="button" className="sad-ligne__tete" onClick={() => setAnnuelPour(m)}>
                <span className="sad-ligne__num">{dernier ? dateDite(dernier.at) : 'jamais'}</span>
                <span className="sad-ligne__quoi"><b>{m.name}</b><small>{m.role} · fiche de poste et entretien</small></span>
                <span className="sad-badge">{(m.evaluations ?? []).length} entretien{(m.evaluations ?? []).length > 1 ? 's' : ''}</span>
              </button>
            </div>
          );
        })}
      </div>
      {neuf && <PoserUnEntretien equipe={equipe} branchId={branch.id} onClose={() => setNeuf(false)} />}
      {annuelPour && (
        <EvaluationModal
          membre={annuelPour}
          onEnregistre={(ev) => staffStore.set((prev) => prev.map((x) => (x.id === annuelPour.id
            ? { ...x, evaluations: [...(x.evaluations ?? []).filter((v) => v.at !== ev.at), ev] }
            : x)))}
          onClose={() => setAnnuelPour(null)}
        />
      )}
    </div>
  );
}

function CorpsDeLEntretien({ e, fiche, onFerme }: { e: Entretien; fiche?: StaffMember; onFerme: () => void }) {
  const { branch } = useBranch();
  const { moi } = useQuiEcrit();
  const navigate = useNavigate();
  const jour = aujourdhuiRh();
  const [elle, setElle] = useState(e.elle ?? '');
  const [maison, setMaison] = useState(e.maison ?? '');
  const [suite, setSuite] = useState(e.suite ?? '');
  const [decision, setDecision] = useState<DecisionDEssai | ''>(e.decision ?? '');
  const garde = (patch?: Partial<Entretien>) => retoucheRh(e, { elle: elle.trim() || undefined, maison: maison.trim() || undefined, suite: suite.trim() || undefined, decision: decision || undefined, ...patch });
  return (
    <>
      <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
        <Field label="Ce qu’elle dit"><Textarea rows={4} value={elle} onChange={(x) => setElle(x.target.value)} /></Field>
        <Field label="Ce que la Maison dit"><Textarea rows={4} value={maison} onChange={(x) => setMaison(x.target.value)} /></Field>
      </div>
      <Field label="La suite"><Textarea rows={2} value={suite} onChange={(x) => setSuite(x.target.value)} placeholder="Une formation, un objectif daté, un prochain point…" /></Field>
      {e.type === 'fin-essai' && (
        <Field label="La décision">
          <Select value={decision} onChange={(x) => setDecision(x.target.value as DecisionDEssai | '')}>
            <option value="">Pas encore</option>
            {(Object.keys(DECISIONS_D_ESSAI) as DecisionDEssai[]).map((d) => <option key={d} value={d}>{DECISIONS_D_ESSAI[d]}</option>)}
          </Select>
        </Field>
      )}
      {e.type === 'fin-essai' && decision === 'renouvele' && <p className="sad-doux">Un renouvellement n’est possible que si le contrat le prévoit, une seule fois : <span className="rh-a-confirmer">à confirmer</span>.</p>}
      <div className="sec-actions">
        <Button size="sm" variant="ghost" onClick={() => { garde(); toast('Gardé.'); }}>Garder</Button>
        {!e.faitLe && <Button size="sm" variant="copper" onClick={() => { garde({ faitLe: jour }); toast('Entretien fait.'); onFerme(); }}>C’est fait</Button>}
        {e.faitLe && <Button size="sm" variant="ghost" onClick={() => { garde({ partage: !e.partage }); toast(e.partage ? 'Il ne se lit plus dans son espace.' : 'Elle le lit dans son espace.'); }}>{e.partage ? 'Ne plus le partager' : 'Signé : le partager avec elle'}</Button>}
        {fiche && !e.faitLe && <Button size="sm" variant="ghost" onClick={() => { const id = prepareLaLettre({ modele: 'convocation-entretien', fiche, branchId: branch.id, moi }); navigate('/secretariat', { state: { onglet: 'documents', ouvre: id } }); }}>Convocation</Button>}
        {!e.faitLe && <Button size="sm" variant="ghost" onClick={() => { effaceLaLigneRh(e); toast('Entretien retiré.'); }}>Retirer</Button>}
      </div>
    </>
  );
}

function PoserUnEntretien({ equipe, branchId, onClose }: { equipe: StaffMember[]; branchId: string; onClose: () => void }) {
  const { moi } = useQuiEcrit();
  const [staffId, setStaffId] = useState(equipe[0]?.id ?? '');
  const [type, setType] = useState<TypeDEntretien>('retour');
  const [prevuLe, setPrevuLe] = useState(aujourdhuiRh());
  const [avec, setAvec] = useState('');
  return createPortal(
    <Modal title="Poser un entretien" onClose={onClose} width={520}>
      <div className="sad-form">
        <Field label="Avec qui"><Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>{equipe.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Entretien"><Select value={type} onChange={(e) => setType(e.target.value as TypeDEntretien)}>{(Object.keys(TYPES_D_ENTRETIEN) as TypeDEntretien[]).filter((t) => t !== 'annuel').map((t) => <option key={t} value={t}>{TYPES_D_ENTRETIEN[t]}</option>)}</Select></Field>
          <Field label="Le"><Input type="date" value={prevuLe} onChange={(e) => setPrevuLe(e.target.value)} /></Field>
        </div>
        <Field label="Mené par (facultatif)"><Input value={avec} onChange={(e) => setAvec(e.target.value)} /></Field>
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="copper" disabled={!staffId || !prevuLe} onClick={() => { nouvelleLigneRh<Entretien>({ genre: 'entretien', branchId, staffId, type, prevuLe, avec: avec.trim() || undefined, par: moi }); onClose(); }}>Poser</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
