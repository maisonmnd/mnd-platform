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
import { lienDeLaPiece, repondsAuBulletin, useBulletins, useConfirmationsDePaie, usePlanning, useRegistreRh, type BulletinPublie } from '../../../../../shared/rh';
import { LIBELLE_DES_ESPECES, duMois, jourDit, momentDit, quandDit } from '../../../../../shared/paie-du-5-pur';
import type { CongeLu } from '../../../../../shared/vacances-pur';
import { ficheDeLAnnee, telechargeLaFiche } from './fiche-de-conges';
import '../paie-du-5.css';
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
  /* « Mes bulletins » : les publiés (run payé). Le bulletin DÉPOSÉ pour la
     paie du 5, pas encore publié, a son propre bloc au-dessus. */
  const mesBulletins = bulletins.filter((b) => b.employeeId === moi.id && !!b.publieLe).sort((a, b) => b.period.localeCompare(a.period));
  const aConfirmer = bulletins.filter((b) => b.employeeId === moi.id && !!b.depot && !b.publieLe).sort((a, b) => b.period.localeCompare(a.period))[0];
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
      {/* SA FICHE DE CONGÉS (6 novembre 2026) : ses congés et vacances de l'année, en PDF. */}
      {moi && mesConges.some((c) => c.status === 'approuve' && (c.type === 'conge' || c.type === 'vacances')) && (
        <Button variant="ghost" onClick={() => {
          const annee = new Date().getMonth() >= 9 ? new Date().getFullYear() + 1 : new Date().getFullYear();
          const { fiche, nom } = ficheDeLAnnee({ m: moi, annee, conges: conges as unknown as CongeLu[], joursParMois: p.congesJoursParMois });
          void telechargeLaFiche(fiche, nom);
        }}>Ma fiche de congés</Button>
      )}
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
      {aConfirmer && <MonBulletinDuMois b={aConfirmer} />}
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

/* ══ MON BULLETIN DU MOIS — la paie du 5, 5 novembre 2026 (lot 1) ══════
   Maquette VomoheW35…, « Dans Mon espace » : le net, le détail (la ligne
   des frais d'envoi MoMo comprise), puis deux gestes seulement. « Je
   confirme mon bulletin » : la fiche passe dans la liste à valider. « Je
   signale une erreur », avec un mot : il part aux ressources humaines, qui
   corrigent ; le bulletin revient ici, à confirmer. La réponse porte la clé
   du bulletin lu : corrigé depuis, il redemande une confirmation. Rien ne
   part sur WhatsApp (son choix du 5 novembre 2026). */
function MonBulletinDuMois({ b }: { b: BulletinPublie }) {
  const { currency } = useBranch();
  const reponses = useConfirmationsDePaie();
  const [mot, setMot] = useState<string | null>(null);
  const d = b.depot;
  if (!d) return null;
  const F = (n: number) => fmtMoney(n, currency);
  const reponse = reponses.find((r) => r.id === b.id && r.employeeId === b.employeeId);
  const pourCeBulletin = reponse && reponse.cle === d.cle ? reponse : undefined;
  const corrige = !!reponse && !pourCeBulletin;
  /* Les moments du dépôt sont à l'heure de Cotonou (UTC+1, toute l'année). */
  const passe = (local?: string) => !!local && Date.now() > Date.parse(`${local}:00+01:00`);
  const apresLaPaie = passe(d.paieLe);
  const apresMidi = passe(d.confirmerAvant);
  const repond = (etat: 'confirme' | 'erreur', texte?: string) => {
    repondsAuBulletin({
      id: b.id, branchId: b.branchId, runId: b.runId, period: b.period, employeeId: b.employeeId,
      etat, le: new Date().toISOString(), cle: d.cle, ...(texte ? { mot: texte } : {}),
    });
    setMot(null);
    toast(etat === 'confirme' ? 'Bulletin confirmé.' : 'Envoyé aux ressources humaines.');
  };
  const envoieLeMot = () => {
    const t = (mot ?? '').trim();
    if (!t) { toast('Écris ce qui ne va pas, en quelques mots.'); return; }
    repond('erreur', t.slice(0, 500));
  };
  const etat = b.payeLe
    ? { ton: 'fait', dit: `Payé le ${jourDit(b.payeLe, false)} : ${F(d.envoyeXof)} envoyés sur ton numéro${d.voie ? ` ${d.voie}` : ''}.${b.transactionMtn ? ` Transaction MTN ${b.transactionMtn}.` : ''}` }
    : pourCeBulletin?.etat === 'confirme'
      ? { ton: 'fait', dit: `Confirmé le ${quandDit(pourCeBulletin.le)}. ${apresLaPaie || !d.paieLe ? 'Ton net part dès que la Maison l’a validé.' : `Ton net part le ${momentDit(d.paieLe)}, après la validation de la Maison.`}` }
      : pourCeBulletin?.etat === 'erreur'
        ? { ton: 'alerte', dit: `Erreur signalée${pourCeBulletin.mot ? ` : « ${pourCeBulletin.mot} »` : ''}. Les ressources humaines corrigent ton bulletin ; il revient ici, à confirmer.` }
        : corrige
          ? { ton: 'attente', dit: 'Ton bulletin a été corrigé : relis-le, puis confirme-le.' }
          : { ton: 'attente', dit: d.confirmerAvant && !apresMidi
            ? `À confirmer avant le ${momentDit(d.confirmerAvant)}.`
            : 'Tu peux encore le confirmer : il partira dès que la Maison l’aura validé.' };
  return (
    <div className="rh-tuile p5-tel" aria-label={`Mon bulletin ${duMois(b.period)}`}>
      <span className="p5-tel__barre">Mon bulletin {duMois(b.period)}</span>
      <b className="p5-tel__net">{F(d.netXof)}</b>
      <div className="p5-tel__lignes">
        {d.lignes.map((x, i) => <div key={i}><span>{x.libelle}</span><span>{x.retenue ? '− ' : ''}{F(x.montantXof)}</span></div>)}
        <div className="p5-tel__total"><span>Net</span><span>{F(d.netXof)}</span></div>
        {d.fraisXof > 0 && <div><span>{d.libelleDesFrais}</span><span>− {F(d.fraisXof)}</span></div>}
        {(d.especesXof ?? 0) > 0 && <div><span>{LIBELLE_DES_ESPECES}</span><span>− {F(d.especesXof ?? 0)}</span></div>}
        <div className="p5-tel__envoye"><span>Envoyé sur ton numéro{d.voie ? ` ${d.voie}` : ''}</span><span>{F(d.envoyeXof)}</span></div>
      </div>
      {d.fraisXof > 0 && <span>La Maison ne prend pas en charge les frais d’envoi : ils sont retirés du montant envoyé.</span>}
      <span className={`p5-tel__etat p5-tel__etat--${etat.ton}`} role="status">{etat.dit}</span>
      {!b.payeLe && mot === null && (
        <div className="p5-tel__gestes">
          {pourCeBulletin?.etat !== 'confirme' && <Button variant="copper" onClick={() => repond('confirme')}>Je confirme mon bulletin</Button>}
          {pourCeBulletin?.etat !== 'erreur' && <Button variant="ghost" onClick={() => setMot('')}>Je signale une erreur</Button>}
        </div>
      )}
      {!b.payeLe && mot !== null && (
        <div className="p5-tel__gestes">
          <Field label="Ce qui ne va pas"><Textarea rows={3} value={mot} maxLength={500} onChange={(e) => setMot(e.target.value)} /></Field>
          <Button variant="copper" onClick={envoieLeMot}>Envoyer aux ressources humaines</Button>
          <Button variant="ghost" onClick={() => setMot(null)}>Ne rien envoyer</Button>
        </div>
      )}
    </div>
  );
}
