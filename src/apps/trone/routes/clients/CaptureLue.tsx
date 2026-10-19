import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { useClients } from '../../../../shared/clients';
import { useAppointments } from '../../../../shared/agenda';
import { useSaitIaMaison } from '../../../../shared/ia-maison';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import { prenomEtInitiale } from '../../../../shared/ia-anonymise-pur';
import {
  CHANTIER_CAPTURE, MOYENS_LUS, MOYEN_DIT, phraseDuRapprochement,
  type CaptureLue as Capture, type Dette, type LectureDeLaCapture, type MoyenLu,
} from '../../../../shared/ia-capture-pur';
import { corrigeLaCapture, ecarteLaCapture, enLecture, marqueInscrite, reprendsLaCapture, useCapturesLues } from '../../../../shared/ia-capture';
import type { MessageWa } from '../../../../shared/conversations';
import { staffAccessStore } from '../equipe/data';
import { PayAppointmentModal } from './actions';
import { useDettesDeLaCliente } from './dettes-de-la-cliente';
import { frJourAn } from './_shared';
import './capture-lue.css';

/* ══ « LU PAR CLAUDE · À VÉRIFIER » — 19 octobre 2026 (chantier `capture`) ═
   Sous une image reçue d'une cliente qui doit de l'argent, la carte de la
   maquette validée : quatre cases cuivrées modifiables (montant, jour,
   référence, moyen), la phrase du rapprochement (« C'est le rituel de
   Clarisse D. du 18 octobre 2026 : reste 15 000 F »), et trois boutons.

   « INSCRIRE AU CARNET » N'INVENTE RIEN : il ouvre l'écran d'encaissement du
   Carnet (`PayAppointmentModal`), prérempli du montant lu, du moyen lu (la
   caisse MoMoPay de la Maison se propose pour MTN, par `caisseProposee`) et
   du jour du transfert comme jour du versement. C'est cet écran qui écrit,
   émet la pièce, et décide du reçu : un rituel passé n'en reçoit jamais
   (`envoi-de-la-piece`). Tant que la modale n'a pas encaissé, la capture
   reste « à vérifier ». */

const nomDit = (nom: string | undefined): string => {
  const mots = (nom ?? '').trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return 'cette cliente';
  return prenomEtInitiale({ prenom: mots[0], nom: mots.slice(1).join(' ') });
};

const detteDite = (d: Dette, argent: (x: number) => string): string =>
  `${d.genre === 'rituel' ? 'Rituel' : d.genre === 'facture' ? 'Facture' : 'Échéance'} du ${frJourAn(d.jour)} · reste ${argent(d.resteXof)}${d.aVenir ? ' · à venir' : ''}`;

export function CaptureLue({ message, clientId }: { message: MessageWa; clientId?: string }) {
  /* Les crochets d'abord, tous, avant le moindre retour (React n° 300). */
  const [captures] = useCapturesLues();
  const [clients] = useClients();
  const [rdvs] = useAppointments();
  const staff = useStaff();
  const [acces] = useStore(staffAccessStore);
  const sait = useSaitIaMaison();
  const { currency } = useBranch();
  const navigate = useNavigate();
  const laCliente = clientId ?? captures[message.id]?.clientId;
  const dettes = useDettesDeLaCliente(laCliente);
  const [choixOuvert, setChoixOuvert] = useState(false);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [aEncaisser, setAEncaisser] = useState<string | null>(null);

  const capture: Capture | undefined = captures[message.id];
  if (!capture) return null;
  if (!sait || !peutDemander(staff?.role, CHANTIER_CAPTURE, staff ? acces[staff.user_id] : undefined)) return null;
  const argent = (x: number) => fmtMoney(x, currency);
  const client = clients.find((c) => c.id === capture.clientId);
  const qui = nomDit(client?.name);

  if (capture.statut === 'en-cours') {
    return enLecture(capture) ? <span className="trc-capture__etat">Claude lit cette capture…</span> : null;
  }
  if (capture.statut === 'inscrite') {
    return <span className="trc-capture__etat">Inscrite au Carnet{capture.inscriteLe ? ` le ${frJourAn(capture.inscriteLe.slice(0, 10))}` : ''}.</span>;
  }
  if (capture.statut === 'ecartee') {
    const mot = capture.motif === 'pas-un-paiement' ? 'Claude n’y a pas vu un paiement.'
      : capture.motif === 'illisible' ? 'Claude n’a pas su lire cette capture.'
        : capture.motif === 'claude' ? `Claude n’a pas répondu${capture.detail ? ` : ${capture.detail}` : ''}.`
          : 'Écartée : ce n’est pas un paiement.';
    return (
      <span className="trc-capture__etat">
        {mot}{' '}
        {capture.lecture?.estUnPaiement && <button type="button" onClick={() => reprendsLaCapture(capture.id, dettes)}>Finalement, c’est un paiement</button>}
      </span>
    );
  }

  const lecture = capture.lecture;
  if (!lecture?.estUnPaiement) return null;
  const corrige = (patch: Partial<Extract<LectureDeLaCapture, { estUnPaiement: true }>>) =>
    corrigeLaCapture(capture.id, { ...lecture, ...patch }, dettes);
  const r = capture.rapprochement;
  const detteUnique = r?.verdict === 'un' ? r.dette : undefined;
  const detteChoisie = choisie ? dettes.find((d) => d.id === choisie) : undefined;
  const cible = detteChoisie ?? detteUnique;
  const rdvCible = cible?.genre === 'rituel' ? rdvs.find((a) => a.id === cible.id) : undefined;
  const beneficiaireDouteux = !!lecture.beneficiaire && !/mnd|909099/i.test(lecture.beneficiaire);
  const aChoisir = choixOuvert ? dettes : r?.verdict === 'plusieurs' ? r.dettes : [];

  return (
    <div className="trc-capture" onClick={(e) => e.stopPropagation()}>
      <div className="trc-capture__t">
        <span>Lu par Claude · à vérifier</span>
        {lecture.confiance < 0.6 && <small>lecture peu sûre</small>}
      </div>
      <div className="trc-capture__cases">
        <label className="trc-capture__case">
          <span>Montant</span>
          <input type="number" inputMode="numeric" min={0} value={lecture.montantXof}
            onChange={(e) => corrige({ montantXof: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </label>
        <label className="trc-capture__case">
          <span>Jour</span>
          <input type="date" value={lecture.jour} onChange={(e) => { if (e.target.value) corrige({ jour: e.target.value }); }} />
        </label>
        <label className="trc-capture__case">
          <span>Référence</span>
          <input type="text" value={lecture.reference ?? ''} placeholder="aucune lue"
            onChange={(e) => corrige({ reference: e.target.value.trim() || undefined })} />
        </label>
        <label className="trc-capture__case">
          <span>Moyen</span>
          <select value={lecture.moyen} onChange={(e) => corrige({ moyen: e.target.value as MoyenLu })}>
            {MOYENS_LUS.map((m) => <option key={m} value={m}>{MOYEN_DIT[m]}</option>)}
          </select>
        </label>
      </div>
      {lecture.beneficiaire && (
        <span className={`trc-capture__benef${beneficiaireDouteux ? ' est-douteux' : ''}`}>
          Vers : {lecture.beneficiaire}{beneficiaireDouteux ? ' · ce n’est pas le compte de la Maison, vérifiez' : ''}{lecture.heure ? ` · ${lecture.heure}` : ''}
        </span>
      )}
      <div className="trc-capture__phrase">
        {detteChoisie
          ? <>Vous avez choisi : <b>{detteDite(detteChoisie, argent)}</b>.</>
          : r ? phraseDuRapprochement(r, { qui, argent, jour: frJourAn }) : null}
      </div>
      {aChoisir.length > 0 && !detteChoisie && (
        <div className="trc-capture__choix" role="radiogroup" aria-label="Ce qu’elle doit">
          {aChoisir.map((d) => (
            <label key={d.id} className={d.aVenir ? 'est-a-venir' : ''}>
              <input type="radio" name={`capture-${capture.id}`} checked={choisie === d.id} onChange={() => setChoisie(d.id)} />
              <span>{detteDite(d, argent)}</span>
            </label>
          ))}
          {aChoisir.length === 0 && <span className="trc-capture__etat">Rien de dû connu.</span>}
        </div>
      )}
      <div className="trc-capture__boutons">
        {cible?.genre === 'rituel' && rdvCible && (
          <Button size="sm" onClick={() => setAEncaisser(rdvCible.id)}>Inscrire au Carnet</Button>
        )}
        {cible?.genre === 'facture' && (
          <Button size="sm" onClick={() => navigate(`/factures?id=${cible.id}`)}>Ouvrir la facture</Button>
        )}
        {cible?.genre === 'echeance' && (
          <Button size="sm" onClick={() => navigate('/abonnements')}>Ouvrir l’abonnement</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => { setChoixOuvert((v) => !v); setChoisie(null); }}>
          {choixOuvert ? 'Replier' : 'Un autre rendez-vous'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ecarteLaCapture(capture.id)}>Ce n’est pas un paiement</Button>
      </div>
      {aEncaisser && rdvCible && (
        <PayAppointmentModal
          appt={rdvCible}
          initial={{ montantXof: lecture.montantXof, moyen: lecture.moyen, jourDuPaiement: lecture.jour, reference: lecture.reference }}
          onEncaisse={() => marqueInscrite(capture.id, rdvCible.id)}
          onClose={() => setAEncaisser(null)}
        />
      )}
    </div>
  );
}

export default CaptureLue;
