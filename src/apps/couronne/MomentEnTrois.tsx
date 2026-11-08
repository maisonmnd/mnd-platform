import { useMemo } from 'react';
import { useAppointments } from '../../shared/agenda';
import { useBranch } from '../../shared/branches';
import { enNVenues, lisLesPlansDeLaCliente, jourDuTiers } from '../../shared/le-moment-en-trois-pur';
import { momentDuReglement, resteDAvanceConfirme } from '../../shared/terminer-et-regler-pur';
import { useDusDuServeur, useLeToucher, useMaintenant } from './ReglerAvantApres';
import { prix, t } from './i18n';
import { useServices } from '../../shared/catalog';
import { detailDuService, dureeDite } from '../../shared/le-moment-detail-pur';

/* ══ « VOTRE MOMENT · EN TROIS VENUES » — 7 novembre 2026 ════════════════════
   « Le Moment se paie en 3 fois, il faut diviser le paiement en 3 venues »
   (Yéman). Maquette « Le Moment en trois venues », écran 3 : trois lignes
   (jour, état, tiers) et « Régler le tiers du <jour> ».

   LE MONTANT QU'ELLE RÈGLE N'EST JAMAIS CELUI DE CET ÉCRAN. Le toucher passe
   par le règlement en ligne qui existe déjà (`regleDepuisMaCouronne`, la page
   « Régler », le même lien que pour le reste d'un rendez-vous) : la fonction
   terminer-et-regler rejuge et relit le reste au SERVEUR. Le bouton n'existe
   que si la base confirme ce reste (`mesDusDuServeur`), et il porte le
   montant de la base : le tiers de cette venue, jamais le total du Moment.
   Le jour de la venue, « Terminer et régler » (la carte du rituel en cours)
   règle le tiers du jour : chaque venue est un rendez-vous dont le prix figé
   EST son tiers. Un tiers non réglé met le Moment en pause : rien ne
   s'ajoute, et la cliente n'est jamais présentée en retard. */
export default function MomentEnTrois({ clientId, nomDuRituel }: { clientId: string; nomDuRituel?: string }) {
  const { currency } = useBranch();
  const [appts] = useAppointments();
  const [services] = useServices();
  const catalogue = useMemo(() => new Map(services.map((s) => [s.id, s] as const)), [services]);
  const maintenant = useMaintenant();
  const duServeur = useDusDuServeur();
  const { enCours, souci, regle } = useLeToucher('avance');
  const lePasse = useLeToucher('apres');
  const aujourdhui = new Date(maintenant + 3_600_000).toISOString().slice(0, 10);
  const plans = useMemo(
    () => lisLesPlansDeLaCliente(appts, clientId, aujourdhui).filter((p) => p.lecture.resteXof > 0),
    [appts, clientId, aujourdhui],
  );
  if (plans.length === 0) return null;
  return (
    <div className="mc-stack" style={{ gap: 12, marginBottom: 12 }}>
      {plans.map(({ planId, lecture }) => {
        const cible = lecture.lignes.find((l) => l.resteXof > 0 && (l.etat === 'prochaine' || l.etat === 'en-pause'));
        const rdv = cible?.rdvId ? appts.find((a) => a.id === cible.rdvId) : undefined;
        const quand = rdv ? momentDuReglement(rdv, maintenant) : null;
        /* La base confirme, au montant de la base : jamais le montant d'ici. */
        const duBase = rdv && quand && quand !== 'jour-meme'
          ? resteDAvanceConfirme(rdv.id, (quand === 'avance' ? duServeur?.avance : duServeur?.apres) ?? null) : null;
        const toucher = quand === 'apres' ? lePasse : { enCours, souci, regle };
        return (
          <div key={planId} className="mc-nextrdv mc-rituel">
            <div className="mc-nextrdv__row">
              <span className="mc-nextrdv__label">{t('Votre Moment · {venues}', { venues: t(enNVenues(lecture.lignes.length)) })}</span>
            </div>
            {nomDuRituel && <div className="mc-nextrdv__service">{nomDuRituel}</div>}
            {lecture.lignes.map((l) => {
              /* CE QUE CHAQUE VENUE COMPREND : le nom du catalogue, « Offert » quand il l'est, jamais un code. */
              const rdvDeLaVenue = l.rdvId ? appts.find((a) => a.id === l.rdvId) : undefined;
              const detail = detailDuService(rdvDeLaVenue ? catalogue.get(rdvDeLaVenue.serviceIds[0]) : undefined, catalogue, {}, l.rang);
              return (
              <div key={l.rang}>
              <div className="mc-rituel__ligne mc-nextrdv__when">
                <span>
                  {l.rang}. {jourDuTiers(l.dateIso)}
                  {' · '}
                  {l.etat === 'regle' ? t('Réglé') : l.etat === 'prochaine' ? t('Prochaine venue') : l.etat === 'en-pause' ? t('En pause') : t('À venir')}
                </span>
                <span>{prix(l.montantXof, currency)}</span>
              </div>
              {detail.lignes.length > 0 && (
                <details className="mc-nextrdv__when">
                  <summary>{t('Ce que comprend cette venue')}</summary>
                  {detail.lignes.map((d, k) => (
                    <div key={`${d.serviceId}-${k}`}>
                      {d.retire ? t('Un geste de la Maison') : d.nom}
                      {d.offert ? ` · ${t('Offert')}` : ''}
                      {d.dureeMin ? ` · ${dureeDite(d.dureeMin)}` : ''}
                    </div>
                  ))}
                </details>
              )}
              </div>
              );
            })}
            <p className="mc-nextrdv__when mc-rituel__texte">
              {t('Le jour de votre venue, « Terminer et régler » règle la part du jour. Vous pouvez aussi la régler à l’avance.')}
            </p>
            {cible && rdv && duBase !== null && (
              <button
                type="button" className="mc-cta mc-cta--copper" disabled={toucher.enCours !== null}
                onClick={() => { void toucher.regle(rdv.id); }}
              >
                {toucher.enCours === rdv.id ? t('Un instant…') : t('Régler la part du {jour} · {montant}', { jour: jourDuTiers(cible.dateIso), montant: prix(duBase, currency) })}
              </button>
            )}
            {toucher.souci && <p className="mc-nextrdv__when mc-rituel__texte" role="alert">{t(toucher.souci)}</p>}
          </div>
        );
      })}
    </div>
  );
}
