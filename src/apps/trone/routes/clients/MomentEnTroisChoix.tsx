import { Select } from '../../../../ds/components';
import { DetailDuMoment } from './DetailDuMoment';
import type { DetailDuService } from '../../../../shared/le-moment-detail-pur';
import { ChampDeDate } from '../../../../ds/dates';
import { enNVenues, francsDuTiers, jourDuTiers, type MomentEnTrois } from '../../../../shared/le-moment-en-trois-pur';

/* ══ LE MOMENT EN PLUSIEURS VENUES, AU COMPTOIR — 7 novembre 2026 ═══════════
   « Le Moment se paie en 3 fois, il faut diviser le paiement en 3 venues »
   (Yéman). Maquette « Le Moment en trois venues », écran 1 : à la réservation
   du Moment, « Comment le règle-t-elle ? » et, pour « N venues », les dates
   des autres venues : la première est celle du Moment (le calendrier habituel
   du nouveau rendez-vous, juste au-dessus), les autres sont les venues
   suivantes, mêmes places, même maître.

   « Quand je prends Le Moment pour un client, ça doit automatiquement
   programmer les séances à venir » (Yéman, même jour) : LES DATES SE PROPOSENT
   D'OFFICE (la venue 1 + le délai du catalogue, même jour, même heure, sinon le
   jour libre le plus proche, avec sa raison) et LE CHOIX DE PAIEMENT NE
   CONDITIONNE PLUS LA PROGRAMMATION : « Comptant » pose lui aussi toutes les
   venues, à 0 F. Les dates restent modifiables.

   Rien ne s'écrit ici : le choix et les dates remontent à la fenêtre du
   rendez-vous, qui pose tous les rendez-vous d'un seul geste. Sobre : peu de
   mots, comme les fiches voisines. */

export type VenueChoisie = { date: string; time: string };

export function MomentEnTroisChoix({ mode, onMode, total, tiers, n, appel, dateDuMoment, heureDuMoment, venues, onVenue, entretien, memeMoment, details, heuresLibres, raisons, propositions, joursFermes }: {
  mode: 'comptant' | 'trois';
  onMode: (m: 'comptant' | 'trois') => void;
  total: number;
  /** Les parts du plan payé en plusieurs venues ; `null` quand le total ne se découpe pas (« Comptant » seul). */
  tiers: number[] | null;
  /** Le nombre de venues du plan (le Moment compris). */
  n: number;
  /** « Mme Awa » : comment la Maison s'adresse à elle (appelDe). */
  appel: string;
  dateDuMoment: string;
  heureDuMoment: string;
  /** Les venues suivantes : rang 2 à N, proposées d'office, modifiables. */
  venues: VenueChoisie[];
  onVenue: (index: number, patch: Partial<VenueChoisie>) => void;
  entretien: string;
  /** Les venues suivantes sont aussi Le Moment (cuir chevelu) et non des venues d'entretien. */
  memeMoment?: boolean;
  /** Ce que chaque venue consomme (venue 1 à N), lu de `includes` du catalogue. */
  details?: DetailDuService[];
  /** Les heures libres de chaque venue, lues sur les places de la Maison. */
  heuresLibres: (index: number) => string[];
  /** Pourquoi une heure ne se pose pas, ou null. */
  raisons: (index: number) => string | null;
  /** Ce que la proposition d'office dit de chaque venue : pourquoi sa date a bougé, ou pourquoi elle ne se pose pas. */
  propositions?: { raison?: string; passee?: boolean }[];
  joursFermes?: Parameters<typeof ChampDeDate>[0]['joursFermes'];
}) {
  const trois = mode === 'trois' && !!tiers;
  return (
    <div className="trc-rdv3__autre" style={{ marginTop: 12 }} aria-label="Le Moment en plusieurs venues">
      {tiers ? (
        <>
          <span className="trc-rdv3__petit">Comment le règle-t-elle ? Total du Moment : {francsDuTiers(total)}.</span>
          <div role="group" aria-label="Comment le règle-t-elle ?" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
            {(['comptant', 'trois'] as const).map((m) => (
              <button
                key={m} type="button" aria-pressed={mode === m}
                className={`mnd-btn mnd-btn--sm ${mode === m ? 'mnd-btn--copper' : 'mnd-btn--ghost'}`}
                onClick={() => onMode(m)}
              >
                {m === 'comptant' ? 'Comptant' : `${n} venues`}
              </button>
            ))}
          </div>
        </>
      ) : (
        <span className="trc-rdv3__petit">Les séances à venir du Moment se programment d’elles-mêmes.</span>
      )}
      <div>
        <p className="trc-rdv3__note" style={{ margin: '4px 0 8px' }}>
          {trois
            ? <>Une part à chaque venue, la première comprise. Le Moment se vit en une fois, à la première venue ; {memeMoment ? 'les autres sont aussi Le Moment' : 'les autres sont des venues d’entretien'}. Aucune remise sur un Moment réglé {enNVenues(n)}.</>
            : <>Les {n - 1} séances à venir se posent à l’enregistrement, déjà réglées avec le Moment. Les dates se modifient ici.</>}
        </p>
        <Ligne n={1} titre={`${jourDuTiers(dateDuMoment)} · ${heureDuMoment}`} sous="Le Moment, au complet" droite={trois ? francsDuTiers(tiers![0]) : francsDuTiers(total)} />
        {details?.[0] && <DetailDuMoment detail={details[0]} titre="Ce que comprend cette venue" replie avecValeurs={false} />}
        {venues.map((v, i) => (
          <div key={i} style={{ marginTop: 8 }}>
            <Ligne n={i + 2} titre={v.date ? `${jourDuTiers(v.date)}${v.time ? ` · ${v.time}` : ''}` : 'Une date à choisir'} sous={entretien} droite={trois ? francsDuTiers(tiers![i + 1]) : 'Déjà réglée'} />
            {propositions?.[i]?.raison && <p className="trc-rdv3__note" role={propositions[i].passee ? 'alert' : undefined} style={{ margin: '4px 0 0' }}>{propositions[i].raison}</p>}
            {details?.[i + 1] && <DetailDuMoment detail={details[i + 1]} titre="Ce que comprend cette venue" replie avecValeurs={false} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
              <ChampDeDate
                value={v.date}
                onChange={(d) => onVenue(i, { date: d })}
                ariaLabel={`Le jour de la venue ${i + 2}`}
                sens="avant"
                compact
                min={i === 0 ? dateDuMoment : venues[i - 1]?.date || dateDuMoment}
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
        {trois && (
          <p className="trc-rdv3__petit" style={{ margin: '8px 0 0' }}>
            À encaisser aujourd’hui, pour {appel} : {francsDuTiers(tiers![0])}. Une part non réglée met le Moment en pause : rien ne s’ajoute.
          </p>
        )}
      </div>
    </div>
  );
}

function Ligne({ n, titre, sous, droite }: { n: number; titre: string; sous: string; droite: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
      <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--copper-50)', color: 'var(--color-copper)', display: 'grid', placeItems: 'center', fontWeight: 600 }}>{n}</span>
      <span style={{ minWidth: 0 }}>
        <b style={{ display: 'block', fontWeight: 500 }}>{titre}</b>
        <small className="mnd-muted">{sous}</small>
      </span>
      <b style={{ fontWeight: 600 }}>{droite}</b>
    </div>
  );
}

export type { MomentEnTrois };
