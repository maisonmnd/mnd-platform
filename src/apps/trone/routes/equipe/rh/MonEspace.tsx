import { useState } from 'react';
import { Button, Field, Input, Select, Textarea, toast } from '../../../../../ds/components';
import { asset } from '../../../../../shared/asset';
import { useBranch } from '../../../../../shared/branches';
import { fmtMoney } from '../../../../../shared/currency';
import { resteDuPar, usePrets } from '../../../../../shared/foyer';
import { uid } from '../../../../../shared/store';
import {
  DECISIONS_DISCIPLINAIRES, JOURS_COURTS, STATUTS, TYPES_D_ENTRETIEN,
  ajouteJours, dateDite, lundiDe, statutDuJour,
  type Entretien, type PieceDuDossier, type Sanction,
} from '../../../../../shared/rh-pur';
import { lienDeLaPiece, useBulletins, usePlanning, useRegistreRh } from '../../../../../shared/rh';
import type { StaffMember } from '../data';
import {
  LEAVE_STATUS_LABEL, congeBalance, daysInclusive, leaveStore, ouvreLeBulletin, parametersFor, useLeave,
  type BulletinLink, type LeaveType,
} from '../payroll';
import { aujourdhuiRh } from './_ui';

/* ══ MON ESPACE — 14 octobre 2026 (choix : l'espace complet) ════════════
   Ce que l'employée voit d'elle, et rien d'autre : son solde de congés et sa
   demande, sa semaine, ses bulletins, ses documents signés, son prêt, ses
   entretiens. La base le tient (0130, est_ma_fiche) : il faut que sa fiche
   porte l'adresse de son compte. Sans elle, l'écran le dit. */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisDit = (p: string) => { const m = /^(\d{4})-(\d{2})$/.exec(p); return m ? `${MOIS[Number(m[2]) - 1]} ${m[1]}` : p; };

export default function MonEspace({ moi, relie }: { moi: StaffMember | null; relie: boolean }) {
  const { branch, currency } = useBranch();
  const [conges] = useLeave();
  const bulletins = useBulletins();
  const [planning] = usePlanning();
  const registre = useRegistreRh();
  const [prets] = usePrets();
  const jour = aujourdhuiRh();
  const [demande, setDemande] = useState(false);
  const [debut, setDebut] = useState(jour);
  const [fin, setFin] = useState(jour);
  const [type, setType] = useState<LeaveType>('conge');
  const [motif, setMotif] = useState('');

  if (!moi) return null;
  if (!relie) {
    return (
      <section className="rh-espace" aria-label="Mon espace">
        <p className="sad-mois">Mon espace</p>
        <div className="rh-garde">Votre fiche n’est pas encore reliée à votre compte : la direction doit y poser l’adresse avec laquelle vous vous connectez. D’ici là, votre pointage ne s’enregistre pas et votre espace reste fermé.</div>
      </section>
    );
  }

  const p = parametersFor(jour.slice(0, 7));
  const mesConges = conges.filter((c) => c.employeeId === moi.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const solde = moi.since ? congeBalance(moi.since, conges, moi.id, p.congesJoursParMois).solde : 0;
  const mesBulletins = bulletins.filter((b) => b.employeeId === moi.id).sort((a, b) => b.period.localeCompare(a.period));
  const lundi = lundiDe(jour);
  const pieces = registre.filter((l): l is PieceDuDossier => l.genre === 'piece' && l.staffId === moi.id && !!l.partage);
  const entretiens = registre.filter((l): l is Entretien => l.genre === 'entretien' && l.staffId === moi.id && !!l.partage);
  const sanctions = registre.filter((l): l is Sanction => l.genre === 'sanction' && l.staffId === moi.id && !!l.partage);
  const reste = resteDuPar(Array.isArray(prets) ? prets : [], moi.id);

  const envoie = () => {
    if (!debut || !fin || fin < debut) { toast('Les dates ne vont pas : la fin vient après le début.'); return; }
    leaveStore.set((prev) => [...prev, {
      id: `lv-${uid()}`, employeeId: moi.id, type, startDate: debut, endDate: fin, days: daysInclusive(debut, fin),
      reason: motif.trim() || undefined, status: 'demande', branchId: moi.branchId || branch.id,
    }]);
    toast('Demande envoyée à la direction.');
    setDemande(false); setMotif('');
  };
  const ouvre = async (chemin?: string) => {
    if (!chemin) return;
    const url = await lienDeLaPiece(chemin);
    if (url) window.open(url, '_blank', 'noopener'); else toast('Ce document ne s’ouvre qu’en ligne.');
  };

  return (
    <section className="rh-espace" aria-label="Mon espace">
      <p className="sad-mois">Mon espace</p>
      <div className="rh-tuile">
        <span>Congés qui me restent</span>
        <b>{Math.round(solde * 10) / 10} jour{solde > 1 ? 's' : ''}</b>
        {mesConges.slice(0, 3).map((c) => <span key={c.id}>du {dateDite(c.startDate)} au {dateDite(c.endDate)} · {LEAVE_STATUS_LABEL[c.status]}{c.status === 'demande' ? <> · <button type="button" className="sad-lien" onClick={() => leaveStore.set((prev) => prev.filter((x) => x.id !== c.id))}>retirer</button></> : null}</span>)}
      </div>
      {!demande ? <Button variant="copper" onClick={() => setDemande(true)}>Demander un congé</Button> : (
        <div className="rh-tuile">
          <div className="tr-grid tr-grid--3" style={{ gap: 10 }}>
            <Field label="Du"><Input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></Field>
            <Field label="Au"><Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></Field>
            <Field label="Pour"><Select value={type} onChange={(e) => setType(e.target.value as LeaveType)}><option value="conge">Congé</option><option value="maladie">Maladie</option></Select></Field>
          </div>
          <Field label="Un mot (facultatif)"><Textarea rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} /></Field>
          <div className="sec-actions"><Button variant="ghost" onClick={() => setDemande(false)}>Annuler</Button><Button variant="copper" onClick={envoie}>Envoyer la demande</Button></div>
        </div>
      )}
      <div className="rh-tuile">
        <span>Ma semaine</span>
        <span style={{ color: 'var(--color-indigo)' }}>
          {JOURS_COURTS.slice(0, 6).map((j, i) => {
            const s = statutDuJour(planning, moi.id, ajouteJours(lundi, i));
            return `${j} ${s ? STATUTS[s] : '·'}`;
          }).join(' · ')}
        </span>
      </div>
      <div className="rh-tuile">
        <span>Mes bulletins</span>
        {mesBulletins.length === 0 ? <span>Aucun bulletin publié pour l’instant.</span> : mesBulletins.slice(0, 12).map((b) => (
          <span key={b.id}><button type="button" className="sad-lien" onClick={() => ouvreLeBulletin(asset('/bulletin.html'), b.lien as unknown as BulletinLink)}>{moisDit(b.period)}</button> · {fmtMoney(b.netXof, currency)} net</span>
        ))}
      </div>
      <div className="rh-tuile">
        <span>Mes documents signés</span>
        {moi.reglement ? <span>Règlement intérieur, signé{moi.reglement && typeof moi.reglement === 'object' && 'at' in moi.reglement ? ` le ${dateDite(String((moi.reglement as { at: string }).at))}` : ''}</span> : null}
        {pieces.map((pc) => <span key={pc.id}><button type="button" className="sad-lien" onClick={() => void ouvre(pc.fichier?.chemin)}>{pc.titre}</button> · {dateDite(pc.le)}</span>)}
        {!moi.reglement && pieces.length === 0 && <span>Aucun document partagé pour l’instant.</span>}
      </div>
      {reste > 0 && (
        <div className="rh-tuile"><span>Mon prêt</span><b>{fmtMoney(reste, currency)}</b><span>restent à rembourser</span></div>
      )}
      {(entretiens.length > 0 || (moi.evaluations?.length ?? 0) > 0 || sanctions.length > 0) && (
        <div className="rh-tuile">
          <span>Mes entretiens</span>
          {(moi.evaluations ?? []).slice(-3).map((e) => <span key={e.at}>Entretien annuel · {dateDite(e.at)}</span>)}
          {entretiens.map((e) => <span key={e.id}>{TYPES_D_ENTRETIEN[e.type]} · {dateDite(e.faitLe ?? e.prevuLe)}</span>)}
          {sanctions.map((s) => <span key={s.id}>{s.decision ? DECISIONS_DISCIPLINAIRES[s.decision] : 'Procédure'} · {dateDite(s.decideeLe ?? s.faitsLe)}</span>)}
        </div>
      )}
    </section>
  );
}
