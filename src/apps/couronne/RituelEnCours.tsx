import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../shared/auth';
import { useAppointments, type Appointment } from '../../shared/agenda';
import { useBranch } from '../../shared/branches';
import { useInvoices } from '../../shared/finance';
import { laPieceDuRdv, lignesDites, resteDeLaPiece, type PieceLue } from '../../shared/regler-la-seance-pur';
import { carteDuRituelEnCours, resteConnuDeLaFin } from '../../shared/terminer-et-regler-pur';
import { pageDuReglement, refusDeLaFin, termineMonRituel } from '../../shared/terminer-et-regler-serveur';
import { prenomDUsage } from '../../shared/civilite';
import { useClient, useClientId } from './lib';
import { prix, t } from './i18n';

/* ══ « TERMINER MON RITUEL » — 6 novembre 2026 (Terminer et régler, la
   porte de Ma Couronne) ══════════════════════════════════════════════════
   « Lui donner la possibilité de terminer son rendez-vous toute seule une
   fois qu'elle finit à la Maison MND et de pouvoir passer régler son RDV
   dans la Couronne » (Yéman). Maquette « Terminer et régler, par trois
   portes », écran Ma Couronne.

   La carte paraît sur l'accueil à l'heure du rituel, le jour même, jusqu'à
   minuit (la règle : shared/terminer-et-regler-pur.ts, `carteDuRituelEnCours`) :
   · en cours : « Terminer mon rituel ». La fonction terminer-et-regler juge
     la porte, pose le lien, prévient l'équipe ; la page « Régler » s'ouvre ;
   · terminé : son règlement l'attend, « Régler mon rituel » ;
   · réglé : « Vous pouvez partir : la Maison est prévenue », et son reçu.
   Rien ne paraît pour une fiche « Passe au comptoir ». Le montant montré ici
   n'est qu'une lecture : celui de sa pièce, sinon celui du prix figé ; celui
   qu'elle règle est relu au serveur par la page « Régler ». */

export default function RituelEnCours({ nomDuRituel }: { nomDuRituel: (a: Appointment) => string }) {
  const { session } = useAuth();
  const { currency } = useBranch();
  const client = useClient();
  const monId = useClientId();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [enCours, setEnCours] = useState(false);
  const [souci, setSouci] = useState('');

  /* L'heure avance : la carte paraît à l'heure du rituel, sans rouvrir l'app. */
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const pieces = invoices as unknown as PieceLue[];
  const carte = useMemo(() => carteDuRituelEnCours({
    rdvs: appts.filter((a) => a.clientId === monId),
    maintenantMs: maintenant,
    passeAuComptoir: client?.passeAuComptoir === true,
    resteDeLaPiece: (rdvId) => { const p = laPieceDuRdv(pieces, rdvId); return p ? resteDeLaPiece(p) : null; },
  }), [appts, monId, maintenant, client?.passeAuComptoir, pieces]);
  if (!carte) return null;

  const rdv = carte.rdv;
  const piece = laPieceDuRdv(pieces, rdv.id);
  const reste = piece ? resteDeLaPiece(piece) : resteConnuDeLaFin(rdv);
  const nom = nomDuRituel(rdv) || t('Votre rituel');
  /* Tout le prénom composé (7 novembre 2026) : « Anne Marie ». */
  const brut = prenomDUsage(client);
  const prenom = brut && !/[0-9@_.]/.test(brut) ? brut : '';

  const termine = async () => {
    if (enCours) return;
    setEnCours(true);
    setSouci('');
    const r = await termineMonRituel(rdv.id, session?.access_token ?? '');
    if (r.ok && r.etat === 'a-regler' && r.jeton) { window.location.assign(pageDuReglement(r.jeton)); return; }
    setEnCours(false);
    setSouci(refusDeLaFin(r));
  };

  if (carte.etat === 'regle') {
    const dernier = piece?.reglementsEnLigne?.[piece.reglementsEnLigne.length - 1];
    const regle = dernier ? dernier.montantXof + (dernier.pourboireXof ?? 0) : 0;
    return (
      <div className="mc-nextrdv mc-rituel" aria-live="polite">
        <div className="mc-nextrdv__row">
          <span className="mc-nextrdv__label">{t('Votre rituel · réglé')}</span>
        </div>
        <div className="mc-nextrdv__service">{prenom ? t('Merci, {prenom}.', { prenom }) : t('Merci.')}</div>
        <p className="mc-nextrdv__when mc-rituel__texte">{t('Vous pouvez partir : la Maison est prévenue.')}</p>
        {piece && (
          <details className="mc-rituel__recu">
            <summary className="mc-nextrdv__when">{t('Votre reçu')}</summary>
            {lignesDites(piece).map((l, i) => (
              <div className="mc-rituel__ligne mc-nextrdv__when" key={i}><span>{l.label}</span><span>{prix(l.montantXof, currency)}</span></div>
            ))}
            {dernier && (
              <div className="mc-rituel__ligne mc-nextrdv__when">
                <span>{dernier.moyen ? t('Réglé par {moyen}', { moyen: dernier.moyen }) : t('Réglé')}</span><span>{prix(regle, currency)}</span>
              </div>
            )}
            {dernier && (dernier.pourboireXof ?? 0) > 0 && (
              <p className="mc-nextrdv__when">{t('dont {montant} de merci pour l’équipe', { montant: prix(dernier.pourboireXof, currency) })}</p>
            )}
            <p className="mc-nextrdv__when">{t('Votre reçu arrive aussi sur WhatsApp, la facture jointe.')}</p>
          </details>
        )}
      </div>
    );
  }

  const aTermine = carte.etat === 'termine';
  return (
    <div className="mc-nextrdv mc-rituel">
      <div className="mc-nextrdv__row">
        <span className="mc-nextrdv__label">{aTermine ? t('Votre rituel · terminé') : t('Votre rituel · en cours')}</span>
        {reste !== null && reste > 0 && <span className="mc-nextrdv__status">{prix(reste, currency)}</span>}
      </div>
      <div className="mc-nextrdv__service">{nom}</div>
      <div className="mc-nextrdv__when">{rdv.time}</div>
      <p className="mc-nextrdv__when mc-rituel__texte">
        {aTermine
          ? t('L’équipe est prévenue. Votre règlement vous attend.')
          : t('Quand l’équipe a fini, terminez ici : vous réglez depuis votre téléphone et vous partez sans passer au comptoir.')}
      </p>
      <button type="button" className="mc-cta mc-cta--copper" disabled={enCours} onClick={() => { void termine(); }}>
        {enCours ? t('Un instant…') : aTermine ? t('Régler mon rituel') : t('Terminer mon rituel')}
      </button>
      {souci && <p className="mc-nextrdv__when mc-rituel__texte" role="alert">{t(souci)}</p>}
      {!aTermine && <p className="mc-nextrdv__when mc-rituel__texte">{t('Si l’équipe ajoute une prestation pendant le rituel, votre montant se met à jour tout seul.')}</p>}
    </div>
  );
}
