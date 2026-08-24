import { asset } from '../../../../shared/asset';
import { useMemo } from 'react';
import { PageHead } from '../_ui';
import { Button, Card } from '../../../../ds/components';
import { RECOS, RECO_ACCENT, useRecoState } from './data';
import { Pill } from './ui';
import './equipe.css';

/* Recommandations IA — suggestions de croissance remontées des données.
   Propositions sobres, jamais d'injonction : l'humain décide (accepter / ignorer).
   Chaque décision est persistée (recoStateStore) — la carte quitte alors la file. */

export default function Recommandations() {
  const [state, setState] = useRecoState();

  const pending = useMemo(() => RECOS.filter((r) => !state[r.k]), [state]);
  const treated = useMemo(() => RECOS.filter((r) => state[r.k]), [state]);

  const decide = (k: string, decision: 'appliquée' | 'ignorée') =>
    setState((prev) => ({ ...prev, [k]: decision }));
  const reset = () =>
    setState((prev) => {
      const next = { ...prev };
      RECOS.forEach((r) => delete next[r.k]);
      return next;
    });

  const potential = pending.length;

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Équipe & Croissance · l’intelligence"
        title="Recommandations IA."
        sub="Des signaux lus dans vos données, traduits en gestes possibles. Propositions sobres, jamais d’injonction, l’humain décide."
        actions={treated.length > 0 ? <Button variant="ghost" onClick={reset}>Rouvrir les traitées</Button> : undefined}
      />

      <div className="tr-grid tr-grid--3" style={{ marginBottom: 18 }}>
        <Card filet="copper" style={{ padding: 16 }}>
          <div className="mnd-stat__label">Signaux à votre regard</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{potential}</div>
        </Card>
        <Card filet="indigo" style={{ padding: 16 }}>
          <div className="mnd-stat__label">Suivies</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{treated.filter((r) => state[r.k] === 'appliquée').length}</div>
        </Card>
        <Card filet="indigo" style={{ padding: 16 }}>
          <div className="mnd-stat__label">Écartées</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{treated.filter((r) => state[r.k] === 'ignorée').length}</div>
        </Card>
      </div>

      {pending.length === 0 ? (
        <Card className="tre-empty">
          <img src={asset("/assets/monograms/mono-indigo.png")} alt="" style={{ width: 36, opacity: 0.4 }} />
          <div className="tre-empty__title">{RECOS.length === 0 ? 'Aucun signal pour l’instant.' : 'Tout est traité.'}</div>
          <div className="tre-empty__sub">
            {RECOS.length === 0
              ? 'Les recommandations naîtront de l’activité de la maison, rendez-vous, ventes, Cercle.'
              : 'L’IA reviendra vers vous dès qu’un signal mérite votre regard.'}
          </div>
        </Card>
      ) : (
        <div className="tr-grid tr-grid--2">
          {pending.map((r) => (
            <Card key={r.k} className="tre-reco" style={{ borderTopColor: RECO_ACCENT[r.cat] }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="tre-reco__cat" style={{ color: RECO_ACCENT[r.cat] }}>{r.cat}</span>
                <span className="mnd-muted" style={{ fontSize: 10.5 }}>{r.conf}</span>
              </div>
              <div className="tre-reco__title">{r.title}</div>
              <div className="tre-reco__why">{r.why}</div>
              <div className="tre-reco__impact">{r.impact}</div>
              <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
                <Button variant="copper" style={{ flex: 1 }} onClick={() => decide(r.k, 'appliquée')}>Accepter</Button>
                <Button variant="ghost" onClick={() => decide(r.k, 'ignorée')}>Ignorer</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {treated.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="tre-sec-label" style={{ marginBottom: 12 }}>Historique des décisions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {treated.map((r) => (
              <Card key={r.k} style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 14, opacity: 0.85 }}>
                <span className="tre-reco__cat" style={{ color: RECO_ACCENT[r.cat], flex: 'none', width: 110 }}>{r.cat}</span>
                <span style={{ flex: 1, fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{r.title}</span>
                <Pill tone={state[r.k] === 'appliquée' ? 'ok' : 'muted'}>{state[r.k] === 'appliquée' ? 'Suivie' : 'Écartée'}</Pill>
                <button className="tre-link-btn" onClick={() => setState((prev) => { const n = { ...prev }; delete n[r.k]; return n; })}>Rouvrir</button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
