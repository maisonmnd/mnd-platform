import { useMemo, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useSubscribers, usePlans, prixVenduXof, type Subscriber } from '../../../../shared/abonnements';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useInvoices, quiEncaisse } from '../../../../shared/finance';
import { useServices } from '../../../../shared/catalog';
import { releveDeLAbonnee, contratDeLaSeance, jourDitAvecLAnnee } from '../../../../shared/abonnee-pur';
import { jourDeCotonou } from '../../../../shared/ia-faits-pur';
import {
  effetDeMarquerFaite, effetDeMarquerAbsente, effetDeRendre, marqueAbsente, rendLaSeance, ditLaSeance, type Effet,
} from './gestes-de-l-abonnement';
import './abonnement.css';

/* ══ LA SÉANCE DE LA FORMULE, DANS LA FICHE DU RENDEZ-VOUS — 20 octobre 2026 ══
   Maquette « Le parcours de l'abonnée » (validée). Une séance couverte se lit
   « Incluse · séance 3 sur 6 », avec ce qu'il reste à la formule, et porte
   les trois gestes qui font bouger le compteur : Marquer faite, Absente
   (marquer manquée), Rendre la séance. Chacun dit son effet avant d'agir.

   UNE ANNULÉE NE DIT JAMAIS « séance 0 sur 6 » : elle ne prend aucun crédit,
   et le bloc le dit en clair (la séance revient à la formule).

   Le compte vient du juge unique, sur le contrat que nomme le `subId` du
   rendez-vous (sinon celui qui la porte ce jour-là). */

type Geste = 'faite' | 'absente' | 'rendre';

/** La séance commence dans moins de 24 h (heure de Cotonou). */
const moinsDe24h = (a: Pick<Appointment, 'date' | 'time'>): boolean => {
  const h = (Date.parse(`${a.date}T${(a.time || '00:00').padStart(5, '0')}:00+01:00`) - Date.now()) / 3_600_000;
  return h > 0 && h < 24;
};

const MOTIFS = ['Maladie', 'Voyage', 'Empêchement de la Maison', 'Geste de la Maison', 'Autre'];

export function SeanceDeLaFormule({ appt, onFait }: { appt: Appointment; onFait?: () => void }) {
  const [subs] = useSubscribers();
  const [plans] = usePlans();
  const [tous] = useAppointments();
  const [invoices] = useInvoices();
  const [services] = useServices();
  const byId = useMemo(() => new Map(services.map((x) => [x.id, x])), [services]);
  const [geste, setGeste] = useState<Geste | null>(null);
  const [motif, setMotif] = useState(MOTIFS[0]);
  const jour = jourDeCotonou();

  const lu = useMemo(() => {
    if (!appt.clientId) return null;
    const frais = tous.find((a) => a.id === appt.id) ?? appt;
    const siens = subs.filter((s) => s.clientId === appt.clientId);
    const sub = contratDeLaSeance(frais, siens, plans);
    if (!sub) return null;
    const r = releveDeLAbonnee({
      jour, clientId: appt.clientId, subs: siens, plans, appts: tous.filter((a) => a.clientId === appt.clientId), invoices,
      prixDuContrat: (s, p) => prixVenduXof(s as Subscriber, p, s.cycle ?? 'mensuel'),
    });
    const c = [...r.contrats, ...r.anciens].find((x) => x.sub.id === sub.id);
    const s = c?.attribuees.find((x) => x.id === appt.id);
    return c && s ? { c, s, frais } : null;
  }, [appt, tous, subs, plans, invoices, jour]);

  if (!lu || !appt.coveredBySub && lu.s.etat !== 'manquee') return null;
  const { c, s, frais } = lu;
  const passee = frais.date <= jour;
  const vivante = s.compte && (s.etat === 'a-confirmer' || s.etat === 'confirmee' || s.etat === 'proposee' || s.etat === 'a-cloturer');
  const { titre, resteDit } = ditLaSeance(c, s, frais);

  const effet: Effet | null = geste === 'faite' ? effetDeMarquerFaite(c, s)
    : geste === 'absente' ? effetDeMarquerAbsente(c, s)
    : geste === 'rendre' ? effetDeRendre(c, s) : null;

  const agit = async () => {
    if (geste === 'faite') {
      /* LE MÊME HONNEUR QUE PARTOUT : points, recette, reprise. Une séance
         couverte ne doit rien : aucune pièce ne s'émet. Import à la demande :
         `actions` lit ce module-ci pour ses écrans. */
      const { honoreSansEncaisser } = await import('./actions');
      const r = honoreSansEncaisser(frais, byId);
      if (!r.honore) return;
    } else if (geste === 'absente') {
      marqueAbsente(frais.id, quiEncaisse(), jour);
      toast('Séance marquée manquée : elle compte sur la formule.');
    } else if (geste === 'rendre') {
      rendLaSeance(frais.id, motif, quiEncaisse(), jour);
      toast('Séance rendue : elle revient à la formule.');
    }
    setGeste(null);
    onFait?.();
  };

  return (
    <div className={`trc-seance-formule ${s.etat === 'annulee' ? 'is-annulee' : s.etat === 'manquee' && !s.rendue ? 'is-manquee' : ''}`}>
      <span className="trc-seance-formule__t">{titre}</span>
      {vivante && moinsDe24h(frais) && (
        <span className="trc-seance-formule__s">
          À moins de 24 h, elle ne peut plus la déplacer en ligne : la Maison décide, la déplacer sans la compter, ou la marquer manquée.
        </span>
      )}
      <span className="trc-seance-formule__s">
        {c.nom} · {resteDit}
        {c.finIso ? ` · valable jusqu’au ${jourDitAvecLAnnee(c.finIso)}` : ''}
        {frais.couvertureRetiree ? ` · couverture retirée le ${jourDitAvecLAnnee(frais.couvertureRetiree.le)} (${frais.couvertureRetiree.motif})` : ''}
      </span>
      <div className="trc-abo__gestes">
        <button type="button" className="trc-abo__btn" aria-pressed={geste === 'faite'} disabled={!vivante || !passee} title={passee ? undefined : 'Elle se marque faite le jour venu.'} onClick={() => setGeste(geste === 'faite' ? null : 'faite')}>
          Marquer faite
        </button>
        <button type="button" className="trc-abo__btn is-sensible" aria-pressed={geste === 'absente'} disabled={!vivante || !passee} title={passee ? undefined : 'Une absence se marque le jour de la séance.'} onClick={() => setGeste(geste === 'absente' ? null : 'absente')}>
          Absente : marquer manquée
        </button>
        <button type="button" className="trc-abo__btn is-sensible" aria-pressed={geste === 'rendre'} disabled={s.etat !== 'manquee' || s.rendue} onClick={() => setGeste(geste === 'rendre' ? null : 'rendre')}>
          Rendre la séance
        </button>
      </div>
      {effet && (
        <div className={`trc-abo__effet ${geste !== 'faite' ? 'is-sensible' : ''}`}>
          <ul>
            {effet.lignes.map((x) => <li key={x}>{x}</li>)}
            {effet.laClienteLit && <li>La cliente lit dans Ma Couronne : « {effet.laClienteLit} »</li>}
          </ul>
          {geste === 'rendre' && (
            <div className="trc-abo__champs">
              <label>Motif<select value={motif} onChange={(e) => setMotif(e.target.value)}>{MOTIFS.map((m) => <option key={m}>{m}</option>)}</select></label>
            </div>
          )}
          <div>
            <Button variant="copper" size="sm" onClick={() => void agit()}>
              {geste === 'faite' ? 'Marquer faite' : geste === 'absente' ? 'Marquer manquée' : 'Rendre la séance'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
