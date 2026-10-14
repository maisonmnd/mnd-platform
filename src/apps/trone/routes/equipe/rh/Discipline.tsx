import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Modal, Select, Textarea, demande, toast } from '../../../../../ds/components';
import { useBranch } from '../../../../../shared/branches';
import {
  DECISIONS_DISCIPLINAIRES, ajouteJours, dateDite, estPartie, etapeDeLaProcedure, sortieDeLaSanction,
  type DecisionDisciplinaire, type Sanction,
} from '../../../../../shared/rh-pur';
import { effaceLaLigneRh, nouvelleLigneRh, retoucheRh, useRegistreRh, useReglagesRh } from '../../../../../shared/rh';
import { ordonneEquipe, useStaff, type StaffMember } from '../data';
import { Repliee, aujourdhuiRh, useQuiEcrit } from './_ui';
import { prepareLaLettre, type ModeleRh } from './lettres';

/* ══ LA DISCIPLINE — 14 octobre 2026 ══════════════════════════════════
   Une procédure en étapes datées : les faits, la demande d'explication (une
   lettre, un délai), la réponse, la décision selon l'échelle du règlement
   intérieur, la lettre, le registre. Une absence ouvre une question, jamais
   une sanction toute seule. Lisible de la direction seule ; remise, la
   personne la lit dans son espace. */

const ETAPES = ['Les faits', 'La demande d’explication', 'La réponse', 'La décision', 'La lettre et le registre'];

export default function RhDiscipline() {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const registre = useRegistreRh();
  const jour = aujourdhuiRh();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [neuve, setNeuve] = useState(false);
  const equipe = ordonneEquipe(staff.filter((m) => m.branchId === branch.id && !estPartie(m, jour)));
  const sanctions = registre
    .filter((l): l is Sanction => l.genre === 'sanction' && l.branchId === branch.id)
    .sort((a, b) => (b.decideeLe ?? b.faitsLe).localeCompare(a.decideeLe ?? a.faitsLe));
  const enCours = sanctions.filter((s) => etapeDeLaProcedure(s) < 5);
  const registreDecide = sanctions.filter((s) => etapeDeLaProcedure(s) === 5);
  const nomDe = (id: string) => staff.find((m) => m.id === id)?.name ?? 'une fiche';

  return (
    <div className="sad-onglet">
      <div className="rh-indigo">« Un écart déclaré est une erreur ; un écart découvert est une faute. » <span className="sad-doux" style={{ color: 'inherit', opacity: 0.75 }}>· le règlement intérieur de la Maison</span></div>
      <div className="sad-outils">
        <span className="sad-doux">{enCours.length} procédure{enCours.length > 1 ? 's' : ''} en cours · {registreDecide.length} au registre</span>
        <Button variant="copper" onClick={() => setNeuve(true)}>+ Ouvrir une procédure</Button>
      </div>
      {sanctions.length === 0 && <div className="sec-vide">Aucune procédure. Le registre se tient ici, lisible de la direction seule.</div>}
      <div className="sad-liste">
        {sanctions.map((s) => {
          const e = etapeDeLaProcedure(s);
          return (
            <Repliee key={s.id} ouverte={ouvert === s.id} surBascule={() => setOuvert(ouvert === s.id ? null : s.id)}
              num={dateDite(s.decideeLe ?? s.faitsLe)} titre={`${nomDe(s.staffId)} · ${s.faits}`}
              sous={e < 5 ? `Étape : ${ETAPES[Math.min(e, 5) - 1]}` : `${s.decision ? DECISIONS_DISCIPLINAIRES[s.decision] : ''}${s.lettre ? ` · ${s.lettre}` : ''}${s.sortLe ? ` · sort du dossier le ${dateDite(s.sortLe)}` : ''}`}
              badge={e < 5 ? `étape ${e} sur 5` : s.partage ? 'remise' : 'au registre'} urgent={e === 2 && !!s.explicationAvant && s.explicationAvant <= jour} fait={e === 5}>
              <CorpsDeLaProcedure s={s} fiche={staff.find((m) => m.id === s.staffId)} />
            </Repliee>
          );
        })}
      </div>
      <p className="sad-doux">Le modèle d’avertissement, la convocation et la demande d’explication se préparent au Secrétariat, privés, remplis depuis la fiche. L’échelle des décisions est celle de votre règlement intérieur : <span className="rh-a-confirmer">à confirmer</span>.</p>
      {neuve && <OuvrirUneProcedure equipe={equipe} branchId={branch.id} onClose={() => setNeuve(false)} />}
    </div>
  );
}

function CorpsDeLaProcedure({ s, fiche }: { s: Sanction; fiche?: StaffMember }) {
  const { branch } = useBranch();
  const { moi } = useQuiEcrit();
  const navigate = useNavigate();
  const [reglages] = useReglagesRh();
  const jour = aujourdhuiRh();
  const [avant, setAvant] = useState(s.explicationAvant ?? (typeof reglages.delaiExplicationJours === 'number' ? ajouteJours(jour, reglages.delaiExplicationJours) : ''));
  const [reponse, setReponse] = useState(s.reponse ?? '');
  const [decision, setDecision] = useState<DecisionDisciplinaire | ''>(s.decision ?? '');
  const [lettre, setLettre] = useState(s.lettre ?? '');
  const ouvreLaLettre = (modele: ModeleRh) => {
    if (!fiche) return;
    const id = prepareLaLettre({ modele, fiche, branchId: branch.id, moi });
    navigate('/secretariat', { state: { onglet: 'documents', ouvre: id } });
  };
  const e = etapeDeLaProcedure(s);
  return (
    <>
      <dl className="sad-fiche">
        <dt>Les faits</dt><dd>{dateDite(s.faitsLe)} · {s.faits}{s.vusPar ? ` (vus par ${s.vusPar})` : ''}</dd>
        {s.explicationDemandeeLe && <><dt>Explication</dt><dd>demandée le {dateDite(s.explicationDemandeeLe)}{s.explicationAvant ? `, réponse avant le ${dateDite(s.explicationAvant)}` : ''}</dd></>}
        {s.reponseLe && <><dt>Sa réponse</dt><dd>{dateDite(s.reponseLe)} · {s.reponse}</dd></>}
      </dl>
      {e === 1 && (
        <div className="sad-ajout-ligne">
          <Field label="Réponse attendue avant le"><Input type="date" value={avant} onChange={(x) => setAvant(x.target.value)} /></Field>
          <Button size="sm" variant="copper" disabled={!avant} onClick={() => { retoucheRh(s, { explicationDemandeeLe: jour, explicationAvant: avant }); ouvreLaLettre('demande-explication'); }}>Demander une explication</Button>
          <Button size="sm" variant="ghost" onClick={() => retoucheRh(s, { decision: 'aucune', decideeLe: jour })}>Classer sans suite</Button>
        </div>
      )}
      {e === 1 && typeof reglages.delaiExplicationJours !== 'number' && <p className="sad-doux">Le délai de réponse n’est pas réglé : <span className="rh-a-confirmer">à confirmer</span> (Obligations, réglages).</p>}
      {e === 2 && (
        <>
          <Field label="Sa réponse, telle quelle"><Textarea rows={3} value={reponse} onChange={(x) => setReponse(x.target.value)} /></Field>
          <div className="sec-actions">
            <Button size="sm" variant="copper" disabled={!reponse.trim()} onClick={() => retoucheRh(s, { reponseLe: jour, reponse: reponse.trim() })}>Réponse reçue</Button>
            <Button size="sm" variant="ghost" onClick={() => retoucheRh(s, { reponseLe: jour, reponse: 'Pas de réponse dans le délai.' })}>Pas de réponse</Button>
          </div>
        </>
      )}
      {(e === 3 || e === 4) && (
        <>
          <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
            <Field label="La décision"><Select value={decision} onChange={(x) => setDecision(x.target.value as DecisionDisciplinaire | '')}><option value="">À décider</option>{(Object.keys(DECISIONS_DISCIPLINAIRES) as DecisionDisciplinaire[]).map((d) => <option key={d} value={d}>{DECISIONS_DISCIPLINAIRES[d]}</option>)}</Select></Field>
            <Field label="Numéro de la lettre (départ)"><Input value={lettre} onChange={(x) => setLettre(x.target.value)} placeholder="D-2026-…" /></Field>
          </div>
          <div className="sec-actions">
            <Button size="sm" variant="copper" disabled={!decision} onClick={() => retoucheRh(s, { decision: decision || undefined, decideeLe: s.decideeLe ?? jour, sortLe: sortieDeLaSanction(s.decideeLe ?? jour, reglages), lettre: lettre.trim() || undefined })}>Décider</Button>
            {decision === 'avertissement' && <Button size="sm" variant="ghost" onClick={() => ouvreLaLettre('avertissement')}>Préparer l’avertissement</Button>}
          </div>
        </>
      )}
      {e === 5 && (
        <div className="sec-actions">
          <Button size="sm" variant="ghost" onClick={() => { retoucheRh(s, { partage: !s.partage }); toast(s.partage ? 'Elle ne la lit plus dans son espace.' : 'Remise : elle la lit dans son espace.'); }}>{s.partage ? 'Ne plus la partager' : 'Remise : la partager avec elle'}</Button>
          {s.sortLe && s.sortLe <= jour && (
            <Button size="sm" variant="ghost" onClick={async () => {
              if (!await demande({ quoi: 'Discipline', titre: 'Sortir cette sanction du dossier ?', dit: `Décidée le ${dateDite(s.decideeLe)}, elle a passé le délai réglé.`, accepter: 'La sortir', refuser: 'La garder' })) return;
              effaceLaLigneRh(s); toast('Sortie du dossier.');
            }}>Sortir du dossier</Button>
          )}
        </div>
      )}
    </>
  );
}

function OuvrirUneProcedure({ equipe, branchId, onClose }: { equipe: StaffMember[]; branchId: string; onClose: () => void }) {
  const { moi } = useQuiEcrit();
  const [staffId, setStaffId] = useState(equipe[0]?.id ?? '');
  const [faits, setFaits] = useState('');
  const [faitsLe, setFaitsLe] = useState(aujourdhuiRh());
  const [vusPar, setVusPar] = useState('');
  return createPortal(
    <Modal title="Ouvrir une procédure" onClose={onClose} width={540}>
      <div className="sad-form">
        <Field label="Qui"><Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>{equipe.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
        <Field label="Les faits, sans jugement"><Textarea rows={3} value={faits} onChange={(e) => setFaits(e.target.value)} placeholder="Ce qui s’est passé, quand, où." /></Field>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Le"><Input type="date" value={faitsLe} onChange={(e) => setFaitsLe(e.target.value)} /></Field>
          <Field label="Vus par"><Input value={vusPar} onChange={(e) => setVusPar(e.target.value)} /></Field>
        </div>
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="copper" disabled={!staffId || !faits.trim()} onClick={() => { nouvelleLigneRh<Sanction>({ genre: 'sanction', branchId, staffId, faits: faits.trim(), faitsLe, vusPar: vusPar.trim() || undefined, par: moi }); onClose(); }}>Ouvrir</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
