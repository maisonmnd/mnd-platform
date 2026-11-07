import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../shared/auth';
import { useAppointments, type Appointment } from '../../shared/agenda';
import { useBranch } from '../../shared/branches';
import { useClients, useFamilies } from '../../shared/clients';
import { tetesPortees } from '../../shared/accounts';
import { useInvoices } from '../../shared/finance';
import { laPieceDuRdv, resteDeLaPiece, type PieceLue } from '../../shared/regler-la-seance-pur';
import { aReglerApres, argentVerseSurLeRdv, momentDuReglement, porteAvantApres } from '../../shared/terminer-et-regler-pur';
import { pageDuReglement, refusAvantApres, regleDepuisMaCouronne } from '../../shared/terminer-et-regler-serveur';
import { dayLabelIso, todayIso, useClientId } from './lib';
import { prix, t } from './i18n';

/* ══ RÉGLER AVANT ET APRÈS, DANS MA COURONNE — 7 novembre 2026 ═══════════
   « Pourquoi je ne peux pas faire un paiement d'un RDV sur ma couronne à
   n'importe quel moment ? » (Yéman, 7 h 45). Tranché au sélecteur : « Avant
   et après ».

   · AVANT (`ReglerDAvance`, sur la fiche d'un rendez-vous à venir, dans Mes
     rendez-vous) : « Régler d'avance » le prix connu, de la réservation
     jusqu'à l'heure du rituel. Le rendez-vous reste « confirmé ». Réglé, la
     fiche le dit ; un rendez-vous réglé d'avance ne s'annule plus d'ici
     (elle écrit à la Maison : aucun remboursement ne part tout seul).
   · APRÈS (`ARegler`, sur l'accueil) : ses rendez-vous passés qui doivent
     encore, et ceux des têtes qu'elle porte, sans limite de temps, chacun
     avec « Régler ».
   La règle est celle du serveur (shared/terminer-et-regler-pur.ts,
   `porteAvantApres`) ; le montant montré n'est qu'une lecture. Le toucher
   demande à la fonction terminer-et-regler, qui rejuge, dit le reste et rend
   le jeton de la page « Régler » (KkiaPay), la même que le jour même. */

/** L'heure avance : une fiche ou un accueil restés ouverts changent de moment sans rouvrir l'app. */
function useMaintenant(): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return maintenant;
}

/** Le toucher : la fonction juge, puis la page « Régler » s'ouvre ; sinon une phrase, jamais un code. */
function useLeToucher(quand: 'avance' | 'apres') {
  const { session } = useAuth();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [souci, setSouci] = useState('');
  const regle = async (rdvId: string) => {
    if (enCours) return;
    setEnCours(rdvId);
    setSouci('');
    const r = await regleDepuisMaCouronne(rdvId, quand, session?.access_token ?? '');
    if (r.ok && r.etat === 'a-regler' && r.jeton) { window.location.assign(pageDuReglement(r.jeton)); return; }
    setEnCours(null);
    setSouci(refusAvantApres(r));
  };
  return { enCours, souci, regle };
}

/** « RÉGLER D'AVANCE » : sur la fiche d'un rendez-vous à venir. Rien après l'heure du rituel. */
export function ReglerDAvance({ rdv }: { rdv: Appointment }) {
  const { currency } = useBranch();
  const [invoices] = useInvoices();
  const [clients] = useClients();
  const maintenant = useMaintenant();
  const { enCours, souci, regle } = useLeToucher('avance');
  if (rdv.status === 'annulé' || momentDuReglement(rdv, maintenant) !== 'avance') return null;
  const piece = laPieceDuRdv(invoices as unknown as PieceLue[], rdv.id);
  const porte = porteAvantApres({
    quand: 'avance', rdv, maintenantMs: maintenant,
    passeAuComptoir: clients.find((c) => c.id === rdv.clientId)?.passeAuComptoir === true,
    piece: piece ? { resteXof: resteDeLaPiece(piece) } : null,
  });
  const verse = Math.round(argentVerseSurLeRdv(rdv));
  if (!porte.ouverte) {
    if (verse <= 0) return null;
    return (
      <div className="mc-recapcard" style={{ textAlign: 'left' }}>
        <div className="mc-recapcard__line"><span>{t('Réglé d’avance')}</span><span>{prix(verse, currency)}</span></div>
        <div className="mc-footnote" style={{ textAlign: 'left' }}>{t('Le rendez-vous reste confirmé. Si l’équipe ajoute un soin pendant la séance, il se règle en plus le jour même.')}</div>
      </div>
    );
  }
  return (
    <div className="mc-stack" style={{ gap: 8 }}>
      {verse > 0 && <div className="mc-recapcard__line"><span>{t('Déjà réglé d’avance')}</span><span>{prix(verse, currency)}</span></div>}
      <button type="button" className="mc-cta mc-cta--copper" disabled={enCours !== null} onClick={() => { void regle(rdv.id); }}>
        {enCours ? t('Un instant…') : t('Régler d’avance · {montant}', { montant: prix(porte.resteXof ?? 0, currency) })}
      </button>
      <div className="mc-footnote" style={{ textAlign: 'left' }}>{t('Le rendez-vous reste confirmé. Si l’équipe ajoute un soin pendant la séance, il se règle en plus le jour même.')}</div>
      {souci && <div className="mc-footnote" role="alert" style={{ textAlign: 'left' }}>{t(souci)}</div>}
    </div>
  );
}

/** « À RÉGLER » : sur l'accueil, ses rituels passés qui doivent encore (et ceux des têtes qu'elle porte). */
export default function ARegler({ nomDuRituel }: { nomDuRituel: (a: Appointment) => string }) {
  const { currency } = useBranch();
  const monId = useClientId();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const [tousClients] = useClients();
  const [familles] = useFamilies();
  const maintenant = useMaintenant();
  const { enCours, souci, regle } = useLeToucher('apres');

  const moi = tousClients.find((c) => c.id === monId);
  const tetes = useMemo(() => (moi ? tetesPortees(moi, tousClients, familles, todayIso()) : []), [moi, tousClients, familles]);
  const dus = useMemo(() => {
    const miens = new Set([monId, ...tetes.map((x) => x.id)]);
    const pieces = invoices as unknown as PieceLue[];
    return aReglerApres({
      rdvs: appts.filter((a) => miens.has(a.clientId)),
      maintenantMs: maintenant,
      passeAuComptoirDe: (id) => tousClients.find((c) => c.id === id)?.passeAuComptoir === true,
      resteDeLaPiece: (rdvId) => { const p = laPieceDuRdv(pieces, rdvId); return p ? resteDeLaPiece(p) : null; },
    });
  }, [appts, invoices, monId, tetes, tousClients, maintenant]);
  if (dus.length === 0) return null;

  const total = dus.reduce((s, d) => s + d.resteXof, 0);
  return (
    <div className="mc-nextrdv mc-rituel" style={{ marginTop: 12 }}>
      <div className="mc-nextrdv__row">
        <span className="mc-nextrdv__label">{t('À régler')}</span>
        <span className="mc-nextrdv__status">{prix(total, currency)}</span>
      </div>
      {dus.map(({ rdv, resteXof }) => {
        const tete = rdv.clientId !== monId ? tetes.find((x) => x.id === rdv.clientId) : undefined;
        const nom = nomDuRituel(rdv) || t('Votre rituel');
        return (
          <div key={rdv.id} style={{ marginTop: 12 }}>
            <div className="mc-nextrdv__service">{tete ? t('{rituel}, pour {prenom}', { rituel: nom, prenom: tete.name.split(' ')[0] }) : nom}</div>
            <div className="mc-nextrdv__when">{dayLabelIso(rdv.date)} · {rdv.time}</div>
            <button type="button" className="mc-cta mc-cta--copper" style={{ marginTop: 8 }} disabled={enCours !== null} onClick={() => { void regle(rdv.id); }}>
              {enCours === rdv.id ? t('Un instant…') : t('Régler {montant}', { montant: prix(resteXof, currency) })}
            </button>
          </div>
        );
      })}
      <p className="mc-nextrdv__when mc-rituel__texte">{t('Un rituel passé qui doit encore se règle ici, quand vous voulez.')}</p>
      {souci && <p className="mc-nextrdv__when mc-rituel__texte" role="alert">{t(souci)}</p>}
    </div>
  );
}
