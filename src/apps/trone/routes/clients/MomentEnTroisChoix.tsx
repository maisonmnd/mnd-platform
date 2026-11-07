import { Select } from '../../../../ds/components';
import { ChampDeDate } from '../../../../ds/dates';
import { francsDuTiers, jourDuTiers, type MomentEnTrois } from '../../../../shared/le-moment-en-trois-pur';

/* ══ LE MOMENT EN TROIS VENUES, AU COMPTOIR — 7 novembre 2026 ═══════════════
   « Le Moment se paie en 3 fois, il faut diviser le paiement en 3 venues »
   (Yéman). Maquette « Le Moment en trois venues », écran 1 : à la réservation
   du Moment, « Comment le règle-t-elle ? » et, pour « 3 venues », les trois
   dates choisies AU DÉPART : la première est celle du Moment (le calendrier
   habituel du nouveau rendez-vous, juste au-dessus), les deux autres sont des
   venues d'entretien, mêmes places, même maître.

   Rien ne s'écrit ici : le choix et les dates remontent à la fenêtre du
   rendez-vous, qui pose les trois rendez-vous d'un seul geste. Sobre : peu de
   mots, comme les fiches voisines. */

export type VenueChoisie = { date: string; time: string };

export function MomentEnTroisChoix({ mode, onMode, total, tiers, appel, dateDuMoment, heureDuMoment, venues, onVenue, entretien, heuresLibres, raisons, joursFermes }: {
  mode: 'comptant' | 'trois';
  onMode: (m: 'comptant' | 'trois') => void;
  total: number;
  tiers: number[];
  /** « Mme Awa » : comment la Maison s'adresse à elle (appelDe). */
  appel: string;
  dateDuMoment: string;
  heureDuMoment: string;
  /** Les deux venues d'entretien : rang 2 puis rang 3. */
  venues: VenueChoisie[];
  onVenue: (index: number, patch: Partial<VenueChoisie>) => void;
  entretien: string;
  /** Les heures libres de chaque venue, lues sur les places de la Maison. */
  heuresLibres: (index: number) => string[];
  /** Pourquoi une heure ne se pose pas, ou null. */
  raisons: (index: number) => string | null;
  joursFermes?: Parameters<typeof ChampDeDate>[0]['joursFermes'];
}) {
  const trois = mode === 'trois';
  return (
    <div className="trc-rdv3__autre" style={{ marginTop: 12 }} aria-label="Le règlement du Moment">
      <span className="trc-rdv3__petit">Comment le règle-t-elle ? Total du Moment : {francsDuTiers(total)}.</span>
      <div role="group" aria-label="Comment le règle-t-elle ?" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
        {(['comptant', 'trois'] as const).map((m) => (
          <button
            key={m} type="button" aria-pressed={mode === m}
            className={`mnd-btn mnd-btn--sm ${mode === m ? 'mnd-btn--copper' : 'mnd-btn--ghost'}`}
            onClick={() => onMode(m)}
          >
            {m === 'comptant' ? 'Comptant' : '3 venues'}
          </button>
        ))}
      </div>
      {trois && (
        <div>
          <p className="trc-rdv3__note" style={{ margin: '4px 0 8px' }}>
            Un tiers à chaque venue, la première comprise. Le Moment se vit en une fois, à la première venue ; les deux autres sont
            des venues d’entretien. Aucune remise sur un Moment réglé en trois venues.
          </p>
          <Ligne n={1} titre={`${jourDuTiers(dateDuMoment)} · ${heureDuMoment}`} sous="Le Moment, au complet" montant={tiers[0]} />
          {venues.map((v, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <Ligne n={i + 2} titre={v.date ? `${jourDuTiers(v.date)}${v.time ? ` · ${v.time}` : ''}` : 'Une date à choisir'} sous={entretien} montant={tiers[i + 1]} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                <ChampDeDate
                  value={v.date}
                  onChange={(d) => onVenue(i, { date: d })}
                  ariaLabel={`Le jour de la venue ${i + 2}`}
                  sens="avant"
                  compact
                  min={i === 0 ? dateDuMoment : venues[0]?.date || dateDuMoment}
                  joursFermes={joursFermes}
                />
                <Select
                  value={v.time}
                  onChange={(e) => onVenue(i, { time: e.target.value })}
                  aria-label={`L’heure de la venue ${i + 2}`}
                >
                  <option value="">Heure</option>
                  {heuresLibres(i).map((h) => <option key={h} value={h}>{h}</option>)}
                  {v.time && !heuresLibres(i).includes(v.time) && <option value={v.time}>{v.time}</option>}
                </Select>
              </div>
              {raisons(i) && <p className="trc-rdv3__note" role="alert" style={{ margin: '4px 0 0' }}>{raisons(i)}</p>}
            </div>
          ))}
          <p className="trc-rdv3__petit" style={{ margin: '8px 0 0' }}>
            À encaisser aujourd’hui, pour {appel} : {francsDuTiers(tiers[0])}. Un tiers non réglé met le Moment en pause : rien ne s’ajoute.
          </p>
        </div>
      )}
    </div>
  );
}

function Ligne({ n, titre, sous, montant }: { n: number; titre: string; sous: string; montant: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center' }}>
      <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--copper-50)', color: 'var(--color-copper)', display: 'grid', placeItems: 'center', fontWeight: 600 }}>{n}</span>
      <span style={{ minWidth: 0 }}>
        <b style={{ display: 'block', fontWeight: 500 }}>{titre}</b>
        <small className="mnd-muted">{sous}</small>
      </span>
      <b style={{ fontWeight: 600 }}>{francsDuTiers(montant)}</b>
    </div>
  );
}

export type { MomentEnTrois };
