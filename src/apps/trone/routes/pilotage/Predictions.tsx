import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useSettings, openingForIso } from '../../../../shared/settings';
import {
  apptNetXof, cadenceLabel, frShort, predictNextVisit, todayISO,
  useBranchAppointments, useBranchClients, useServicesById, type Cadence,
} from '../clients/_shared';
import './pilotage.css';

/* ═══ LA CADENCE — la salle où la Maison lit ce qu'elle attend ═════
   16 août 2026, demande de Yéman : « j'aimerais voir le module de
   l'intelligence, la salle qui gère les prédictions des RDV à venir, les
   graphes liés à l'analyse, les calculs, et avoir la possibilité d'aller plus
   loin ».

   Le juge existait (`shared/cadence.ts`) mais il ne parlait qu'à l'oreille
   d'UNE fiche : « ≈ vendredi 28 août ». Personne ne voyait jamais l'ensemble —
   combien de têtes la semaine prochaine, qui a glissé, à quelle régularité
   revient la Maison, et ce que tout cela pèse.

   LA RÈGLE DE CETTE SALLE : elle ne prédit rien de plus que le juge. Elle
   MONTRE ce qu'il calcule déjà, elle en dit la méthode et ses limites, et elle
   ouvre la fiche pour agir. Une salle de pilotage qui invente un chiffre est
   pire qu'une salle vide. */

const SEMAINE_MS = 7 * 86400000;
const pad2 = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromISO = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const lundiDe = (iso: string): string => {
  const d = fromISO(iso);
  const decal = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - decal);
  return toISO(d);
};

type Ligne = {
  clientId: string;
  nom: string;
  cadence: Cadence;
  /** Ce que vaut son dernier rituel — la mesure la plus honnête de ce que sa
      prochaine venue rapportera. */
  valeurXof: number;
};

export default function Predictions() {
  const navigate = useNavigate();
  const { currency } = useBranch();
  const clients = useBranchClients();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [reglages] = useSettings();
  const today = todayISO();
  const [horizonChoisi, setHorizonChoisi] = useState<'8' | '12'>('8');
  const horizon = Number(horizonChoisi);

  /* ---- LE CALCUL, une fois pour toute la salle ---- */
  const lignes = useMemo<Ligne[]>(() => {
    const out: Ligne[] = [];
    for (const c of clients) {
      const cadence = predictNextVisit(appts, clients, c.id, today);
      if (!cadence.iso) continue;
      const t = cadence.template;
      out.push({
        clientId: c.id,
        nom: c.name,
        cadence,
        valeurXof: t ? apptNetXof(t, byId) : 0,
      });
    }
    return out.sort((a, b) => (a.cadence.iso ?? '').localeCompare(b.cadence.iso ?? ''));
  }, [clients, appts, byId, today]);

  const estimees = lignes.filter((l) => l.cadence.predicted);
  const prises = lignes.filter((l) => !l.cadence.predicted);
  const enRetard = estimees.filter((l) => l.cadence.overdueDays > 0)
    .sort((a, b) => b.cadence.overdueDays - a.cadence.overdueDays);
  const dans7j = lignes.filter((l) => (l.cadence.iso ?? '') <= toISO(new Date(Date.now() + 7 * 86400000)));
  const dans30j = lignes.filter((l) => (l.cadence.iso ?? '') <= toISO(new Date(Date.now() + 30 * 86400000)));
  const attendu30 = dans30j.reduce((n, l) => n + l.valeurXof, 0);

  /* ---- LES SEMAINES QUI VIENNENT — deux séries, une barre par semaine ---- */
  const semaines = useMemo(() => {
    const debut = lundiDe(today);
    const cases: { lundi: string; prises: number; estimees: number; valeur: number }[] = [];
    for (let i = 0; i < horizon; i += 1) cases.push({ lundi: toISO(new Date(fromISO(debut).getTime() + i * SEMAINE_MS)), prises: 0, estimees: 0, valeur: 0 });
    const index = new Map(cases.map((c, i) => [c.lundi, i]));
    for (const l of lignes) {
      const i = index.get(lundiDe(l.cadence.iso!));
      if (i === undefined) continue;
      if (l.cadence.predicted) cases[i].estimees += 1; else cases[i].prises += 1;
      cases[i].valeur += l.valeurXof;
    }
    return cases;
  }, [lignes, horizon, today]);
  const hautSemaine = Math.max(1, ...semaines.map((s) => s.prises + s.estimees));

  /* ---- LA CADENCE DE LA MAISON — à quel rythme les têtes reviennent ---- */
  const tranches = useMemo(() => {
    const bornes = [
      { label: '≤ 2 sem.', max: 14 },
      { label: '2–3 sem.', max: 21 },
      { label: '3–4 sem.', max: 28 },
      { label: '4–6 sem.', max: 42 },
      { label: '6–8 sem.', max: 56 },
      { label: '> 8 sem.', max: Infinity },
    ];
    const compte = bornes.map((b) => ({ ...b, n: 0 }));
    for (const l of estimees) {
      const d = l.cadence.avgDays ?? 0;
      const i = compte.findIndex((b) => d <= b.max);
      if (i >= 0) compte[i].n += 1;
    }
    return compte;
  }, [estimees]);
  const hautTranche = Math.max(1, ...tranches.map((t) => t.n));
  const medianeMaison = useMemo(() => {
    const xs = estimees.map((l) => l.cadence.avgDays ?? 0).filter((x) => x > 0).sort((a, b) => a - b);
    if (!xs.length) return null;
    const m = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[m] : Math.round((xs[m - 1] + xs[m]) / 2);
  }, [estimees]);

  /* ---- LA CONFIANCE — et ce que la salle ne sait PAS dire ---- */
  const parConfiance = {
    haute: estimees.filter((l) => l.cadence.confidence === 'haute').length,
    moyenne: estimees.filter((l) => l.cadence.confidence === 'moyenne').length,
    faible: estimees.filter((l) => l.cadence.confidence === 'faible').length,
  };
  const muettes = clients.length - lignes.length;

  const joursFermes = reglages.hours.filter((h) => h.closed).length;

  return (
    <div className="tr-page">
      <PageHead
        eyebrow="Pilotage · la cadence"
        title="Ce que la Maison attend."
        actions={
          <Segs<'8' | '12'>
            options={[{ value: '8', label: '8 semaines' }, { value: '12', label: '12 semaines' }]}
            value={horizonChoisi}
            onChange={setHorizonChoisi}
          />
        }
      />

      {/* ---- EN UN REGARD ---- */}
      <div className="tr-grid tr-grid--4">
        <div className="trp-tile">
          <div className="trp-tile__label">Têtes attendues · 7 jours</div>
          <div className="trp-tile__value">{dans7j.length}</div>
          <div className="trp-tile__cap">
            dont {dans7j.filter((l) => !l.cadence.predicted).length} déjà au carnet
          </div>
        </div>
        <div className="trp-tile">
          <div className="trp-tile__label">En retard</div>
          <div className="trp-tile__value">{enRetard.length}</div>
          <div className="trp-tile__cap">
            {enRetard.length ? `la plus ancienne · ${enRetard[0].cadence.overdueDays} j` : 'aucune tête en attente'}
          </div>
        </div>
        <div className="trp-tile">
          <div className="trp-tile__label">Attendu · 30 jours</div>
          <div className="trp-tile__value">{fmtMoney(attendu30, currency)}</div>
          <div className="trp-tile__cap">au prix de leur dernier rituel</div>
        </div>
        <div className="trp-tile">
          <div className="trp-tile__label">Cadence de la Maison</div>
          <div className="trp-tile__value">{medianeMaison ? `${medianeMaison} j` : '—'}</div>
          <div className="trp-tile__cap">
            {medianeMaison ? cadenceLabel(medianeMaison) : 'pas encore d’histoire à lire'}
          </div>
        </div>
      </div>

      {/* ---- LES SEMAINES QUI VIENNENT ---- */}
      <section className="tr-section">
        <div className="trc-microlabel">La charge qui vient · {horizon} semaines</div>
        <div className="trp-card">
          <div className="trp-hist">
            {semaines.map((s) => {
              const total = s.prises + s.estimees;
              const hPrises = (s.prises / hautSemaine) * 100;
              const hEst = (s.estimees / hautSemaine) * 100;
              return (
                <div key={s.lundi} className="trp-hist__col" title={`${frShort(s.lundi)} · ${s.prises} au carnet, ${s.estimees} estimées · ${fmtMoney(s.valeur, currency)}`}>
                  <span className="trp-hist__n">{total || ''}</span>
                  <div className="trp-hist__stack">
                    <div className="trp-hist__part trp-hist__part--est" style={{ height: `${hEst}%` }} />
                    <div className="trp-hist__part trp-hist__part--pris" style={{ height: `${hPrises}%` }} />
                  </div>
                  <span className="trp-hist__x">{frShort(s.lundi).replace(/^\w+\.\s/, '')}</span>
                </div>
              );
            })}
          </div>
          <div className="trp-legende">
            <span><i className="trp-dot trp-dot--pris" /> déjà au carnet</span>
            <span><i className="trp-dot trp-dot--est" /> estimées</span>
            <span className="mnd-muted">
              Une estimation n’est pas un rendez-vous : elle dit quand la Maison l’attend.
            </span>
          </div>
        </div>
      </section>

      {/* ---- LES RETARDS — la seule liste qui appelle un geste ---- */}
      <section className="tr-section">
        <div className="trc-microlabel">
          Celles qui ont glissé · {enRetard.length}
        </div>
        <div className="trp-card">
          {enRetard.slice(0, 12).map((l) => (
            <button
              key={l.clientId}
              type="button"
              className="trp-break__row trp-break__row--click"
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}
              onClick={() => navigate(`/customers?id=${l.clientId}`)}
            >
              <span className="trp-break__label">{l.nom}</span>
              <span className="trp-break__count">
                {l.cadence.avgDays ? cadenceLabel(l.cadence.avgDays) : 'cadence inconnue'}
                {' · '}confiance {l.cadence.confidence ?? '—'}
              </span>
              <span className="trp-break__num" style={{ color: 'var(--copper-700)' }}>
                {l.cadence.overdueDays} j
              </span>
            </button>
          ))}
          {enRetard.length === 0 && (
            <div className="trp-break__empty">Aucune tête n’a glissé — la Maison est à jour.</div>
          )}
          {enRetard.length > 12 && (
            <div className="trp-break__sub">et {enRetard.length - 12} autres — les douze plus anciennes d’abord.</div>
          )}
        </div>
      </section>

      {/* ---- LA CADENCE ET LA CONFIANCE ---- */}
      <div className="tr-cols" style={{ '--cols': '1fr 1fr' } as React.CSSProperties}>
        <section className="tr-section">
          <div className="trc-microlabel">À quel rythme elles reviennent</div>
          <div className="trp-card">
            {tranches.map((t) => (
              <div key={t.label} className="trp-bar">
                <span className="trp-bar__label">{t.label}</span>
                <div className="trp-bar__rail">
                  <div className="trp-bar__fill" style={{ width: `${(t.n / hautTranche) * 100}%` }} />
                </div>
                <span className="trp-bar__n">{t.n}</span>
              </div>
            ))}
            {medianeMaison && (
              <div className="trp-break__sub">
                Médiane de la Maison : {medianeMaison} jours — {cadenceLabel(medianeMaison)}.
              </div>
            )}
          </div>
        </section>

        <section className="tr-section">
          <div className="trc-microlabel">Ce que vaut chaque estimation</div>
          <div className="trp-card">
            {([['haute', parConfiance.haute], ['moyenne', parConfiance.moyenne], ['faible', parConfiance.faible]] as const).map(([k, n]) => (
              <div key={k} className="trp-bar">
                <span className="trp-bar__label">Confiance {k}</span>
                <div className="trp-bar__rail">
                  <div
                    className="trp-bar__fill"
                    style={{
                      width: `${(n / Math.max(1, estimees.length)) * 100}%`,
                      background: k === 'haute' ? 'var(--color-indigo)' : k === 'moyenne' ? 'var(--copper-600)' : 'var(--color-argile)',
                    }}
                  />
                </div>
                <span className="trp-bar__n">{n}</span>
              </div>
            ))}
            <div className="trp-break__sub">
              {muettes} tête{muettes > 1 ? 's' : ''} sans estimation — une seule venue, ou de passage.
              La Maison ne prédit pas le retour de qui n’a pas encore de relation.
            </div>
          </div>
        </section>
      </div>

      {/* ---- LES CALCULS, DITS EN CLAIR ---- */}
      <section className="tr-section">
        <div className="trc-microlabel">Comment la Maison calcule</div>
        <div className="trp-card">
          <ol className="trp-methode">
            <li>
              <b>Un rendez-vous déjà pris passe devant.</b> C’est un fait, pas une prédiction —
              il s’affiche tel quel. {prises.length} tête{prises.length > 1 ? 's' : ''} dans ce cas.
            </li>
            <li>
              <b>La cadence est la MÉDIANE des intervalles</b> entre ses venues honorées, jamais la
              moyenne : une visite exceptionnelle ne doit pas déplacer toute sa ligne. Plancher à
              14 jours. Une série multi-séances compte pour UNE visite.
            </li>
            <li>
              <b>La confiance mesure la régularité</b> — l’écart-type rapporté à la moyenne, pondéré
              par le nombre d’intervalles. Trois intervalles réguliers donnent « haute » ; deux
              venues seulement, « faible ».
            </li>
            <li>
              <b>Le cycle se rejoue tant qu’il tombe dans le passé</b> (16 août). C’est la prochaine
              fois qu’on attend, pas la fois manquée — mais le retard, lui, se compte toujours
              depuis la première échéance.
            </li>
            <li>
              <b>Jamais un jour fermé</b> — {joursFermes} jour{joursFermes > 1 ? 's' : ''} par semaine
              dans vos réglages, journées exceptionnelles comprises. Et si la fiche dit
              « elle ne vient que le samedi », l’estimation se pose sur son jour.
            </li>
            <li>
              <b>Le montant attendu est celui de son DERNIER rituel</b>, net de remise. La Maison
              n’invente pas un panier : elle relit ce qu’elle a vraiment facturé.
            </li>
          </ol>
          <div className="trp-break__sub">
            La limite, dite franchement : ceci lit le passé. Une cliente qui change de rythme, une
            couronne qui pousse, une saison — rien de tout cela n’est su ici. C’est une aide à la
            relance, pas une promesse.
          </div>
        </div>
      </section>

      {/* ---- ALLER PLUS LOIN : la file complète ---- */}
      <section className="tr-section">
        <div className="trc-microlabel">Toutes les têtes attendues · {lignes.length}</div>
        <div className="trp-card">
          {lignes.slice(0, 40).map((l) => {
            const ferme = openingForIso(l.cadence.iso!).closed;
            return (
              <button
                key={l.clientId}
                type="button"
                className="trp-break__row trp-break__row--click"
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }}
                onClick={() => navigate(`/customers?id=${l.clientId}`)}
              >
                <span className="trp-break__label">
                  {l.nom}
                  {!l.cadence.predicted && <span className="trp-break__count"> · au carnet</span>}
                  {ferme && <span className="trp-break__count" style={{ color: 'var(--copper-700)' }}> · jour fermé</span>}
                </span>
                <span className="trp-break__count">
                  {l.cadence.avgDays ? cadenceLabel(l.cadence.avgDays) : '—'}
                  {l.valeurXof > 0 ? ` · ${fmtMoney(l.valeurXof, currency)}` : ''}
                </span>
                <span className="trp-break__num">{frShort(l.cadence.iso!)}</span>
              </button>
            );
          })}
          {lignes.length === 0 && (
            <div className="trp-break__empty">
              Aucune tête attendue — il faut au moins deux venues honorées pour lire une cadence.
            </div>
          )}
          {lignes.length > 40 && (
            <div className="trp-break__sub">et {lignes.length - 40} autres, plus loin dans le temps.</div>
          )}
        </div>
      </section>
    </div>
  );
}
