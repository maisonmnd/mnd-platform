import { useState } from 'react';
import { Button, Seal } from '../../ds/components';
import { fmtMoney } from '../../shared/currency';
import { ACCENTS, PLANS, VERROUILLES } from './data';
import { Lock } from './ui';

/* Vue Site — la vitrine du produit SaaS. Chrome obsidienne / ivoire,
   beaucoup d'air, et une seule variable démontrée : l'accent. */

const CONFIGURABLES = [
  'Nom du salon & logo',
  'Couleur d’accent · palette validée',
  'Devise par locataire',
  'Pays, branches & Maîtres',
  'Catalogue & tarifs',
  'Langue de l’interface',
];

export default function Site({ onStart }: { onStart: () => void }) {
  const [accent, setAccent] = useState(ACCENTS[0]);

  return (
    <div className="lk-site mnd-rise">
      {/* ---- Héros ---- */}
      <section className="lk-hero">
        <div className="lk-hero__inner">
          <Seal color="ivoire" size={52} />
          <div className="mnd-eyebrow lk-hero__eyebrow">LOKAA · SaaS white-label · Propulsé par MND</div>
          <h1 className="lk-hero__title">
            Le squelette du Trône,
            <br />
            pour toutes les maisons.
          </h1>
          <p className="lk-hero__lead">
            LOKAA installe l’OS complet de la Maison MND — agenda, caisse, carnet, catalogue,
            finances — sous la marque de votre salon. Vous apportez votre nom et votre couleur.
            La Maison garantit le reste.
          </p>
          <div className="lk-hero__cta">
            <Button variant="copper" size="lg" onClick={onStart}>
              Ouvrir votre maison
            </Button>
            <a className="lk-hero__ghost" href="#lk-plans">
              Voir les plans
            </a>
          </div>
        </div>
      </section>

      {/* ---- La variable unique ---- */}
      <section className="lk-section">
        <div className="mnd-eyebrow">Le principe</div>
        <h2 className="lk-section__title">Une seule variable, votre couleur.</h2>
        <p className="lk-section__lead">
          Chaque locataire choisit son accent dans la palette validée par la Maison. Tout le reste
          — la typographie, les rayons, la méthode — demeure le standard MND.
        </p>

        <div className="lk-demo" style={{ ['--lk-accent' as string]: accent.hex }}>
          <div className="lk-demo__swatches" role="group" aria-label="Palette d’accents">
            {ACCENTS.map((a) => (
              <button
                key={a.hex}
                type="button"
                title={a.nom}
                className={`lk-swatch ${a.hex === accent.hex ? 'is-active' : ''}`}
                style={{ background: a.hex }}
                onClick={() => setAccent(a)}
              >
                {a.hex === accent.hex ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
          </div>
          <div className="lk-demo__card">
            <span className="lk-demo__mark" aria-hidden="true">
              V
            </span>
            <div>
              <div className="lk-demo__name">Votre salon</div>
              <div className="lk-demo__sub">propulsé par MND</div>
            </div>
            <span className="lk-demo__cta">Réserver</span>
          </div>
          <div className="lk-demo__caption">
            {accent.nom} · {accent.hex} — appliqué à l’instant sur l’app cliente co-marquée.
          </div>
        </div>

        <div className="lk-split">
          <div className="lk-split__col">
            <div className="lk-split__head">
              <span className="lk-split__dot" aria-hidden="true" />
              Configurable · à votre main
            </div>
            <ul className="lk-list">
              {CONFIGURABLES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div className="lk-split__col lk-split__col--locked">
            <div className="lk-split__head lk-split__head--locked">
              <Lock size={12} />
              Verrouillé · le standard MND
            </div>
            <ul className="lk-list lk-list--locked">
              {VERROUILLES.map((v) => (
                <li key={v}>
                  <Lock size={10} /> {v}
                </li>
              ))}
            </ul>
            <div className="lk-split__quote">« La désirabilité du système est un actif MND. »</div>
          </div>
        </div>
      </section>

      {/* ---- Plans ---- */}
      <section className="lk-section" id="lk-plans">
        <div className="mnd-eyebrow">Abonnement</div>
        <h2 className="lk-section__title">Trois plans, un même squelette.</h2>
        <p className="lk-section__lead">
          Facturation mensuelle en francs CFA, prélevée par Mobile Money ou carte. La devise de
          votre exploitation reste la vôtre.
        </p>

        <div className="lk-plans">
          {PLANS.map((p, i) => (
            <article key={p.id} className={`lk-plan ${i === 1 ? 'lk-plan--star' : ''}`}>
              {i === 1 && <span className="lk-plan__flag">Le plus choisi</span>}
              <div className="lk-plan__tier">{p.nom}</div>
              <div className="lk-plan__price">{fmtMoney(p.prixXof, 'XOF')}</div>
              <div className="lk-plan__period">par mois · {p.portee}</div>
              <hr className="lk-plan__rule" />
              <ul className="lk-plan__feats">
                {p.traits.map((t) => (
                  <li key={t}>
                    <span aria-hidden="true">✦</span> {t}
                  </li>
                ))}
              </ul>
              <Button
                variant={i === 1 ? 'copper' : 'ghost'}
                className="lk-plan__cta"
                onClick={onStart}
              >
                Choisir {p.nom}
              </Button>
            </article>
          ))}
        </div>
      </section>

      {/* ---- Pied co-marqué ---- */}
      <footer className="lk-foot">
        <Seal color="obsidian" size={40} />
        <div className="lk-foot__brand">Propulsé par MND</div>
        <div className="lk-foot__sub">Maison MND · maison de soin premium des locks · Cotonou · Bénin</div>
      </footer>
    </div>
  );
}
