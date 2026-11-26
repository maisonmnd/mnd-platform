import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../../../../shared/branches';
import { useSettings, openingForIso, useExceptionsHoraires } from '../../../../shared/settings';
import { apptPaidXof } from '../../../../shared/agenda';
import { fmtMoney } from '../../../../shared/currency';
import { momentDuSalon } from '../../../../shared/calendrier';
import { useOffers } from '../../../../shared/offers';
import { lesJoursDits } from '../../../../shared/offres-pur';
import {
  JOURS_DE_L_OCCUPATION, PERIODES_D_OCCUPATION, heureDite, heuresLesPlusVides, marcheDuTaux, mesureDeLOffre, occupationDesFauteuils,
  offresDeSemaine, periodeDeLOccupation, phraseDesHeuresVides, tauxDit,
  type CaseDOccupation, type PeriodeDOccupation, type RdvDeLOccupation, type VueDeLOccupation,
} from '../../../../shared/occupation-pur';
import { Button, Segs } from '../../../../ds/components';
import { PageHead } from '../_ui';
import { apptDurationMin, useBranchAppointments, useServicesById } from '../clients/_shared';
import './occupation.css';

/* ══ L'OCCUPATION DES FAUTEUILS — 26 novembre 2026 ═══════════════════════
   Audit du Trône, point B3 (« Remplir la semaine et les fins
   d'après-midi », validé par Yéman) : le samedi est plein quand la semaine ne
   l'est pas, et rien ne mesurait l'occupation réelle des fauteuils. Cette
   page la dit, jour par heure, sur 4, 8 ou 12 semaines : ce qui s'est fait
   (honoré) ou ce qui est déjà pris ; ce que rapporte une heure de fauteuil
   chaque jour de la semaine ; les cinq heures les plus vides ; et la mesure
   de l'offre de semaine. Les règles vivent dans `shared/occupation-pur.ts`.
   Graphiques dessinés à la main, une seule teinte (l'indigo) qui fonce avec
   l'occupation ; les chiffres en encre, jamais dans la couleur du trait. */

const LARGE_CASE = 44;
const HAUTE_CASE = 30;
const MARGE_G = 76;
const MARGE_H = 22;

const HEURES_MESUREES: { value: 'toutes' | '900' | '960'; label: string }[] = [
  { value: 'toutes', label: 'Toutes les heures' },
  { value: '900', label: 'Après 15 h' },
  { value: '960', label: 'Après 16 h' },
];

const dureeDite = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};
const jourCourtDit = (j: string): string => `${Number(j.slice(8, 10))}/${j.slice(5, 7)}`;

function CarteDeChaleur({ cases, premiere, derniere, jours }: { cases: readonly CaseDOccupation[]; premiere: number; derniere: number; jours: readonly number[] }) {
  const heures = Array.from({ length: derniere - premiere + 1 }, (_, i) => premiere + i);
  const largeur = MARGE_G + heures.length * LARGE_CASE;
  const hauteur = MARGE_H + jours.length * HAUTE_CASE;
  const caseDe = (j: number, h: number) => cases.find((c) => c.jour === j && c.heure === h);
  return (
    <svg className="occ-carte" viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label="L’occupation des fauteuils, jour par heure">
      {heures.map((h, i) => (
        <text key={h} className="occ-carte__heure" x={MARGE_G + i * LARGE_CASE + LARGE_CASE / 2} y={14} textAnchor="middle">{heureDite(h)}</text>
      ))}
      {jours.map((j, r) => (
        <g key={j}>
          <text className="occ-carte__jour" x={MARGE_G - 10} y={MARGE_H + r * HAUTE_CASE + HAUTE_CASE / 2 + 4} textAnchor="end">{JOURS_DE_L_OCCUPATION[j]}</text>
          {heures.map((h, i) => {
            const c = caseDe(j, h);
            const marche = marcheDuTaux(c?.taux ?? null);
            const x = MARGE_G + i * LARGE_CASE;
            const y = MARGE_H + r * HAUTE_CASE;
            return (
              <g key={h}>
                <rect className={`occ-carte__case occ-m${marche}`} x={x + 1} y={y + 1} width={LARGE_CASE - 2} height={HAUTE_CASE - 2} rx={2}>
                  <title>
                    {c && c.capaciteMin > 0
                      ? `${JOURS_DE_L_OCCUPATION[j]} ${heureDite(h)} : ${tauxDit(c.taux)}, ${dureeDite(c.occupeMin)} occupées sur ${dureeDite(c.capaciteMin)} de fauteuil`
                      : `${JOURS_DE_L_OCCUPATION[j]} ${heureDite(h)} : la Maison ne reçoit pas`}
                  </title>
                </rect>
                {c && c.capaciteMin > 0 && (
                  <text className={`occ-carte__taux${marche >= 3 ? ' sur-fonce' : ''}`} x={x + LARGE_CASE / 2} y={y + HAUTE_CASE / 2 + 4} textAnchor="middle">
                    {Math.round((c.taux ?? 0) * 100)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

function BarresDuChiffre({ lignes, devise }: { lignes: { jour: number; xofParHeure: number | null }[]; devise: string }) {
  const max = Math.max(1, ...lignes.map((l) => l.xofParHeure ?? 0));
  const hauteur = lignes.length * 30 + 4;
  return (
    <svg className="occ-barres" viewBox={`0 0 520 ${hauteur}`} role="img" aria-label="Le chiffre par heure de fauteuil, jour par jour">
      {lignes.map((l, i) => {
        const w = Math.round(((l.xofParHeure ?? 0) / max) * 300);
        const y = i * 30 + 4;
        return (
          <g key={l.jour}>
            <text className="occ-barres__jour" x={92} y={y + 15} textAnchor="end">{JOURS_DE_L_OCCUPATION[l.jour]}</text>
            <line className="occ-barres__base" x1={100} y1={y} x2={100} y2={y + 22} />
            {w > 0 && <rect className="occ-barres__barre" x={100} y={y + 4} width={w} height={14} rx={2}><title>{`${JOURS_DE_L_OCCUPATION[l.jour]} : ${fmtMoney(l.xofParHeure ?? 0, devise)} par heure de fauteuil`}</title></rect>}
            <text className="occ-barres__valeur" x={100 + w + 8} y={y + 15}>{l.xofParHeure === null ? '—' : fmtMoney(l.xofParHeure, devise)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Occupation() {
  const { branch, currency } = useBranch();
  const navigate = useNavigate();
  const rdvs = useBranchAppointments();
  const byId = useServicesById();
  const [offres] = useOffers();
  /* Les heures et les journées exceptionnelles de la Maison : la carte se
     redessine quand elles descendent du serveur. */
  const [reglages] = useSettings();
  const [exceptions] = useExceptionsHoraires();
  const [vue, setVue] = useState<VueDeLOccupation>('fait');
  const [semaines, setSemaines] = useState<PeriodeDOccupation>(8);
  const [offreId, setOffreId] = useState<string>('');
  const [heures, setHeures] = useState<'toutes' | '900' | '960'>('toutes');
  const aujourdhui = momentDuSalon().jour;

  const lus = useMemo((): RdvDeLOccupation[] => rdvs.map((a) => ({
    id: a.id, date: a.date, time: a.time, dureeMin: apptDurationMin(a, byId), status: a.status,
    encaisseXof: apptPaidXof(a), codeOffre: a.codeOffre, offreId: a.offreId,
  })), [rdvs, byId]);

  const occ = useMemo(() => {
    const p = periodeDeLOccupation(vue, semaines, aujourdhui);
    return occupationDesFauteuils({ rdvs: lus, du: p.du, au: p.au, vue, sieges: Math.max(1, Number(branch.seats) || 1), ouvertureDe: openingForIso });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lus, vue, semaines, aujourdhui, branch.seats, reglages, exceptions]);

  const joursOuverts = occ.jours.filter((l) => l.capaciteMin > 0).map((l) => l.jour);
  const vides = heuresLesPlusVides(occ);
  const semaineOffres = useMemo(() => offresDeSemaine(offres, branch.id), [offres, branch.id]);
  const offre = semaineOffres.find((o) => o.id === offreId) ?? semaineOffres[0];
  const mesure = offre ? mesureDeLOffre({ offre, rdvs: lus, aujourdhui, apresMin: heures === 'toutes' ? null : Number(heures) }) : null;

  return (
    <div className="occ">
      <PageHead
        eyebrow="Direction · Remplir la semaine"
        title="L’occupation des fauteuils"
        sub={`${occ.sieges} fauteuil${occ.sieges > 1 ? 's' : ''}, des heures où la Maison reçoit (jamais avant 8 h 30) à la fermeture ; les jours fermés ne comptent pas.`}
        actions={<Segs options={PERIODES_D_OCCUPATION.map((n) => ({ value: String(n), label: `${n} semaines` }))} value={String(semaines)} onChange={(v) => setSemaines(Number(v) as PeriodeDOccupation)} />}
      />

      <div className="occ-vues">
        <Segs<VueDeLOccupation>
          options={[{ value: 'fait', label: 'Ce qui s’est fait' }, { value: 'pris', label: 'Ce qui est déjà pris' }]}
          value={vue}
          onChange={setVue}
        />
        <span className="occ-periode">du {jourCourtDit(occ.du)} au {jourCourtDit(occ.au)}</span>
      </div>

      <div className="occ-tuiles">
        <div className="occ-tuile"><span>Occupation</span><b>{tauxDit(occ.total.taux)}</b><small>{dureeDite(occ.total.occupeMin)} sur {dureeDite(occ.total.capaciteMin)} de fauteuil</small></div>
        <div className="occ-tuile"><span>{vue === 'fait' ? 'Rituels honorés' : 'Rituels posés'}</span><b>{occ.total.rdv}</b><small>sur {joursOuverts.length} jour{joursOuverts.length > 1 ? 's' : ''} de la semaine ouverts</small></div>
        {vue === 'fait' && (
          <div className="occ-tuile"><span>Par heure de fauteuil</span><b>{occ.total.xofParHeure === null ? '—' : fmtMoney(occ.total.xofParHeure, currency)}</b><small>{fmtMoney(occ.total.encaisseXof, currency)} encaissés</small></div>
        )}
      </div>

      <section className="occ-bloc">
        <h3>Jour par heure</h3>
        {joursOuverts.length === 0
          ? <p className="occ-aide">Aucune heure d’ouverture connue sur cette période.</p>
          : (
            <div className="occ-defile">
              <CarteDeChaleur cases={occ.cases} premiere={occ.premiereHeure} derniere={occ.derniereHeure} jours={joursOuverts} />
            </div>
          )}
        <div className="occ-legende" aria-hidden="true">
          <span>vide</span>
          {[0, 1, 2, 3, 4].map((m) => <i key={m} className={`occ-m${m}`} />)}
          <span>plein</span>
          <small>Chaque case : la part du fauteuil occupée, en pour cent.</small>
        </div>
        {vides.length > 0 && (
          <p className="occ-vides"><b>Les cinq heures les plus vides :</b> {phraseDesHeuresVides(vides)}.</p>
        )}
        {occ.surFerme > 0 && <p className="occ-aide">{occ.surFerme} rendez-vous posé{occ.surFerme > 1 ? 's' : ''} un jour fermé, hors du compte.</p>}
      </section>

      {vue === 'fait' && (
        <section className="occ-bloc">
          <h3>Ce que rapporte une heure de fauteuil</h3>
          <p className="occ-aide">Ce qui a été encaissé sur les rituels honorés, divisé par les heures de fauteuil offertes ce jour-là.</p>
          <BarresDuChiffre lignes={occ.jours.filter((l) => l.capaciteMin > 0)} devise={currency} />
          <table className="occ-table">
            <thead><tr><th>Jour</th><th>Ouverts</th><th>Rituels</th><th>Occupation</th><th>Encaissé</th><th>Par heure</th></tr></thead>
            <tbody>
              {occ.jours.filter((l) => l.capaciteMin > 0).map((l) => (
                <tr key={l.jour}>
                  <td>{JOURS_DE_L_OCCUPATION[l.jour]}</td><td>{l.joursOuverts}</td><td>{l.rdv}</td><td>{tauxDit(l.taux)}</td>
                  <td>{fmtMoney(l.encaisseXof, currency)}</td><td>{l.xofParHeure === null ? '—' : fmtMoney(l.xofParHeure, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="occ-bloc">
        <h3>L’offre de semaine, mesurée</h3>
        {!offre ? (
          <p className="occ-aide">
            Aucune offre ne porte sur des jours de venue. Une offre de semaine se règle dans les offres (« Jours de la venue », sa remise, ses places) ;
            elle naît éteinte et sans remise tant que la direction ne les a pas choisies.
          </p>
        ) : (
          <>
            <div className="occ-offre-choix">
              {semaineOffres.length > 1 && (
                <select className="occ-select" value={offre.id} onChange={(e) => setOffreId(e.target.value)} aria-label="L’offre mesurée">
                  {semaineOffres.map((o) => <option key={o.id} value={o.id}>{o.title}{o.code ? ` · ${o.code}` : ''}{o.active ? '' : ' (éteinte)'}</option>)}
                </select>
              )}
              <Segs options={HEURES_MESUREES} value={heures} onChange={setHeures} />
            </div>
            <p className="occ-aide">
              <b>{offre.title}</b>{offre.code ? ` (${offre.code})` : ''}, {offre.active ? 'en ligne' : 'éteinte'}
              {offre.discountPct ? `, −${offre.discountPct} %` : ', sans remise réglée'}, pour un rendez-vous {lesJoursDits(offre.joursDeLaVenue ?? [])}
              {offre.du ? `, depuis le ${jourCourtDit(offre.du)}` : ''}.
            </p>
            {mesure?.etat === 'mesuree' ? (
              <table className="occ-table occ-table--mesure">
                <thead><tr><th /><th>Rituels honorés</th><th>Encaissé</th><th>Avec son code</th></tr></thead>
                <tbody>
                  <tr><td>Pendant (du {jourCourtDit(mesure.pendant.du)} au {jourCourtDit(mesure.pendant.au)})</td><td>{mesure.pendant.rdv}</td><td>{fmtMoney(mesure.pendant.encaisseXof, currency)}</td><td>{mesure.pendant.avecLeCode}</td></tr>
                  <tr><td>Avant (du {jourCourtDit(mesure.avant.du)} au {jourCourtDit(mesure.avant.au)})</td><td>{mesure.avant.rdv}</td><td>{fmtMoney(mesure.avant.encaisseXof, currency)}</td><td>{mesure.avant.avecLeCode}</td></tr>
                  <tr className="occ-table__ecart"><td>Écart</td><td>{mesure.ecartRdv > 0 ? '+' : ''}{mesure.ecartRdv}</td><td>{mesure.ecartXof > 0 ? '+' : ''}{fmtMoney(mesure.ecartXof, currency)}</td><td /></tr>
                </tbody>
              </table>
            ) : (
              <p className="occ-aide">
                {mesure?.etat === 'sans-debut' ? 'Cette offre n’a pas de premier jour : sans lui, la mesure ne devine pas quand elle a commencé.'
                  : mesure?.etat === 'pas-commencee' ? 'Cette offre n’a pas encore commencé : la mesure viendra avec ses premiers jours.'
                  : 'Cette offre ne dit pas ses jours de venue.'}
              </p>
            )}
            <p className="occ-aide">
              Les mêmes jours de la semaine, sur autant de jours juste avant son premier jour. L’heure de la venue ne se règle pas encore dans une offre :
              « Après 15 h » ne filtre que la mesure, l’offre vaut pour toute la journée.
            </p>
          </>
        )}
        <div><Button size="sm" onClick={() => navigate('/marketing?tab=offres')}>Régler les offres</Button></div>
      </section>
    </div>
  );
}
