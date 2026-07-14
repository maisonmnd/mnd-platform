import { useState, type ChangeEvent } from 'react';
import { Badge, Button, Field, Input, Select } from '../../ds/components';
import { fmtMoney } from '../../shared/currency';
import { useStore } from '../../shared/store';
import { CURRENCIES, currencyByCode } from '../../shared/geo';
import { ACCENTS, VERROUILLES, accentNom, planById, tenantsStore, type Tenant } from './data';
import { Lock, TenantMark } from './ui';

/* Espace locataire — le mini shell ERP co-marqué. Le squelette du Trône,
   la devise du locataire partout, l'accent du locataire comme seule variable. */

type Route = 'bord' | 'carnet' | 'catalogue' | 'theme';

const NAV: { groupe: string; items: { id: Route; label: string }[] }[] = [
  { groupe: 'Pilotage', items: [{ id: 'bord', label: 'Tableau de bord' }] },
  { groupe: 'Clients & agenda', items: [{ id: 'carnet', label: 'Le Carnet' }] },
  { groupe: 'Vente', items: [{ id: 'catalogue', label: 'Catalogue' }] },
  { groupe: 'Système', items: [{ id: 'theme', label: 'Marque & thème' }] },
];

const ROUTE_TITRE: Record<Route, string> = {
  bord: 'Tableau de bord',
  carnet: 'Le Carnet',
  catalogue: 'Catalogue',
  theme: 'Marque & thème',
};

/* Données de démonstration — montants stockés en XOF, affichés dans la devise du locataire. */
const KPIS = [
  { label: 'Revenus réels · juin', xof: 22480000, tendance: 'plus 21 % vs mai', ton: 'up' as const },
  { label: 'Dépenses réelles · juin', xof: 8120000, tendance: 'plus 9 % vs mai', ton: 'warn' as const },
  { label: 'Résultat net · juin', xof: 14360000, tendance: 'plus 28 % vs mai', ton: 'up' as const },
];

const CARNET = [
  { heure: '09:30', client: 'Inès R.', service: 'Resserrage racines', maitre: 'Naïssa', xof: 35000, statut: 'Confirmé' },
  { heure: '10:30', client: 'Thomas L.', service: 'Création Nano-locks', maitre: 'Koffi', xof: 180000, statut: 'En cours' },
  { heure: '13:00', client: 'Awa S.', service: 'Soin profond Couronne', maitre: 'Naïssa', xof: 28000, statut: 'Confirmé' },
  { heure: '15:30', client: 'Léa M.', service: 'Pose Microlocks', maitre: 'Koffi', xof: 140000, statut: 'Confirmé' },
  { heure: '17:00', client: 'Maya T.', service: 'Rituel des quatre temps', maitre: 'Amara', xof: 45000, statut: 'À confirmer' },
];

const SEMAINE: { jour: string; xof: number }[] = [
  { jour: 'L', xof: 148000 },
  { jour: 'M', xof: 132000 },
  { jour: 'M', xof: 186000 },
  { jour: 'J', xof: 214000 },
  { jour: 'V', xof: 256000 },
  { jour: 'S', xof: 318000 },
  { jour: 'D', xof: 118000 },
];
const SEMAINE_TOTAL = SEMAINE.reduce((s, d) => s + d.xof, 0);

const CATALOGUE = [
  { service: 'Création Nano-locks', categorie: 'VÈKPÈ™', palier: 'L’Œuvre', xof: 180000, maitre: 'Koffi' },
  { service: 'Pose Microlocks', categorie: 'VÈKPÈ™', palier: 'L’Œuvre', xof: 140000, maitre: 'Koffi' },
  { service: 'Resserrage racines', categorie: 'SÍNSIN™', palier: 'L’Affirmation', xof: 35000, maitre: 'Naïssa' },
  { service: 'Soin profond Couronne', categorie: 'FÍNFÍN™', palier: 'L’Initiation', xof: 28000, maitre: 'Naïssa' },
  { service: 'Rituel des quatre temps', categorie: 'GBÈZÀ™', palier: 'L’Affirmation', xof: 45000, maitre: 'Amara' },
  { service: 'Réparation & greffe', categorie: 'DÒDÒ™', palier: 'L’Œuvre', xof: 90000, maitre: 'Koffi' },
];

/* Graphe SVG artisanal — barres de revenu sur 7 jours. */
function GrapheSemaine({ devise }: { devise: string }) {
  const W = 340;
  const H = 150;
  const pad = 6;
  const bw = (W - pad * 2) / SEMAINE.length;
  const max = Math.max(...SEMAINE.map((d) => d.xof));
  const best = SEMAINE.reduce((a, b) => (b.xof > a.xof ? b : a), SEMAINE[0]);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="lk-chart"
      role="img"
      aria-label={`Revenu des 7 derniers jours, meilleur jour ${fmtMoney(best.xof, devise)}`}
    >
      {SEMAINE.map((d, i) => {
        const h = Math.round((d.xof / max) * (H - 34));
        const x = pad + i * bw + bw * 0.18;
        const y = H - 22 - h;
        const isBest = d.xof === best.xof;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={bw * 0.64}
              height={h}
              rx={1.5}
              fill={isBest ? 'var(--color-copper)' : 'var(--indigo-400)'}
            />
            <text
              x={pad + i * bw + bw / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize="9.5"
              fill="var(--indigo-200)"
              fontFamily="var(--font-sans)"
            >
              {d.jour}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function StatutChip({ statut }: { statut: string }) {
  const cls =
    statut === 'En cours' ? 'lk-chip lk-chip--plein' : statut === 'À confirmer' ? 'lk-chip lk-chip--doux' : 'lk-chip';
  return <span className={cls}>{statut}</span>;
}

export default function Espace({
  tenantId,
  onPickTenant,
  notify,
}: {
  tenantId: string | null;
  onPickTenant: (id: string) => void;
  notify: (m: string) => void;
}) {
  const [tenants, setTenants] = useStore(tenantsStore);
  const [route, setRoute] = useState<Route>('bord');
  const tenant = tenants.find((t) => t.id === tenantId) ?? tenants[0];

  if (!tenant) {
    return (
      <div className="lk-page mnd-rise">
        <div className="mnd-eyebrow">Espace locataire</div>
        <h1 className="lk-page__title">Aucun salon installé.</h1>
        <p className="lk-page__lead">Passez par l’assistant d’installation pour créer la première instance.</p>
      </div>
    );
  }

  const maj = (patch: Partial<Tenant>) =>
    setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, ...patch } : t)));

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') maj({ logo: reader.result });
    };
    reader.readAsDataURL(file);
  };

  const devise = tenant.devise;
  const symbole = currencyByCode(devise)?.symbol ?? devise;
  const plan = planById(tenant.plan);

  return (
    <div className="lk-shell" style={{ ['--lk-accent' as string]: tenant.accent }}>
      {/* -------- Sidebar obsidienne -------- */}
      <aside className="lk-side">
        <div className="lk-side__brand">
          <TenantMark tenant={tenant} size={34} />
          <div>
            <div className="lk-side__name">{tenant.nom}</div>
            <div className="lk-side__sub">propulsé par MND</div>
          </div>
        </div>

        <label className="lk-side__picker">
          <span>Salon · aperçu</span>
          <select value={tenant.id} onChange={(e) => onPickTenant(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom} · {t.ville}
              </option>
            ))}
          </select>
        </label>

        <nav className="lk-side__nav">
          {NAV.map((g) => (
            <div key={g.groupe} className="lk-side__group">
              <div className="lk-side__label">{g.groupe}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`lk-side__item ${route === it.id ? 'is-active' : ''}`}
                  onClick={() => setRoute(it.id)}
                >
                  <span className="lk-side__tick" aria-hidden="true" />
                  {it.label}
                </button>
              ))}
            </div>
          ))}
          <div className="lk-side__group">
            <div className="lk-side__label">Hérité du Trône</div>
            {['Caisse · POS', 'Analytics', 'Finances'].map((m) => (
              <button
                key={m}
                type="button"
                className="lk-side__item lk-side__item--ghost"
                onClick={() => notify(`${m} — module hérité du Trône, identique pour tous les locataires.`)}
              >
                <span className="lk-side__tick" aria-hidden="true" />
                {m}
              </button>
            ))}
          </div>
        </nav>

        <div className="lk-side__foot">
          <div className="lk-side__owner">
            <div>{tenant.proprietaire}</div>
            <div className="lk-side__sub">
              Owner · plan {plan.nom}
            </div>
          </div>
          <div className="lk-side__seal">
            <Lock size={10} />
            <span>Propulsé par MND</span>
          </div>
        </div>
      </aside>

      {/* -------- Zone principale -------- */}
      <div className="lk-main">
        <header className="lk-top">
          <div className="lk-top__crumb">
            {tenant.nom} <span aria-hidden="true">·</span> {ROUTE_TITRE[route]}
          </div>
          <div className="lk-top__tools">
            <span className="lk-top__devise" title="Devise imposée par le locataire">
              {devise} · {symbole}
            </span>
            <span className="lk-top__date">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              className="lk-top__pos"
              onClick={() => notify('Caisse · POS — module hérité du Trône.')}
            >
              + Encaisser
            </button>
          </div>
        </header>

        <div className="lk-content">
          {route === 'bord' && (
            <div className="lk-route mnd-rise">
              <div className="mnd-eyebrow">
                {tenant.nom} · {tenant.ville} · {tenant.pays}
              </div>
              <h1 className="lk-route__title">Bonsoir, {tenant.proprietaire.split(' ')[0]}.</h1>

              <div className="lk-kpis">
                {KPIS.map((k) => (
                  <div key={k.label} className={`lk-kpi lk-kpi--${k.ton}`}>
                    <div className="lk-kpi__label">{k.label}</div>
                    <div className="lk-kpi__value">{fmtMoney(k.xof, devise)}</div>
                    <div className="lk-kpi__trend">{k.tendance}</div>
                  </div>
                ))}
              </div>

              <div className="lk-tiles">
                <div className="lk-tile">
                  <span>Revenu mois</span>
                  <strong>{fmtMoney(22480000, devise)}</strong>
                  <em>en {devise} · pivot XOF</em>
                </div>
                <div className="lk-tile">
                  <span>RDV aujourd’hui</span>
                  <strong>{CARNET.length}</strong>
                  <em>3 Maîtres en parallèle</em>
                </div>
                <div className="lk-tile">
                  <span>Customers</span>
                  <strong>1 204</strong>
                  <em>58 de plus ce mois</em>
                </div>
                <div className="lk-tile">
                  <span>Alertes stock</span>
                  <strong>1</strong>
                  <em>Huile Couronne bas</em>
                </div>
              </div>

              <div className="lk-cols">
                <section className="lk-card">
                  <div className="lk-card__head">
                    <span>Le carnet du jour · {tenant.ville}</span>
                    <span className="lk-card__aside">3 Maîtres en parallèle</span>
                  </div>
                  {CARNET.slice(0, 4).map((r) => (
                    <div key={r.heure} className="lk-rdv">
                      <span className="lk-rdv__heure">{r.heure}</span>
                      <span className="lk-rdv__qui">
                        <span>{r.client}</span>
                        <span className="lk-rdv__quoi">
                          {r.service} · {r.maitre}
                        </span>
                      </span>
                      <span className="lk-rdv__prix">{fmtMoney(r.xof, devise)}</span>
                      <StatutChip statut={r.statut} />
                    </div>
                  ))}
                </section>

                <section className="lk-card lk-card--indigo">
                  <div className="lk-card__eyebrow">Revenu · 7 jours</div>
                  <div className="lk-card__big">{fmtMoney(SEMAINE_TOTAL, devise)}</div>
                  <GrapheSemaine devise={devise} />
                  <div className="lk-card__footrow">
                    <span>Multi-devises · pivot XOF</span>
                    <span className="lk-card__best">{fmtMoney(318000, devise)}</span>
                  </div>
                </section>
              </div>
            </div>
          )}

          {route === 'carnet' && (
            <div className="lk-route mnd-rise">
              <div className="mnd-eyebrow">Clients & agenda</div>
              <h1 className="lk-route__title">Le Carnet.</h1>
              <p className="lk-route__lead">
                Le carnet multi-services du Trône, aux couleurs de {tenant.nom}. Les montants
                s’affichent en {devise}, la devise du locataire.
              </p>
              <section className="lk-card">
                {CARNET.map((r) => (
                  <div key={r.heure} className="lk-rdv">
                    <span className="lk-rdv__heure">{r.heure}</span>
                    <span className="lk-rdv__qui">
                      <span>{r.client}</span>
                      <span className="lk-rdv__quoi">
                        {r.service} · {r.maitre}
                      </span>
                    </span>
                    <span className="lk-rdv__prix">{fmtMoney(r.xof, devise)}</span>
                    <StatutChip statut={r.statut} />
                  </div>
                ))}
              </section>
            </div>
          )}

          {route === 'catalogue' && (
            <div className="lk-route mnd-rise">
              <div className="mnd-eyebrow">Vente</div>
              <h1 className="lk-route__title">Catalogue.</h1>
              <p className="lk-route__lead">
                La double nomenclature de la Maison — VÈKPÈ™, SÍNSIN™, FÍNFÍN™, GBÈZÀ™, DÒDÒ™ —
                fait partie du standard. Les tarifs, eux, appartiennent au salon.
              </p>
              <section className="lk-card lk-card--table">
                <table className="mnd-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Catégorie</th>
                      <th>Palier</th>
                      <th>Maître</th>
                      <th style={{ textAlign: 'right' }}>Prix · {devise}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATALOGUE.map((c) => (
                      <tr key={c.service}>
                        <td>{c.service}</td>
                        <td>
                          <Badge tone="copper">{c.categorie}</Badge>
                        </td>
                        <td>{c.palier}</td>
                        <td>{c.maitre}</td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {fmtMoney(c.xof, devise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          )}

          {route === 'theme' && (
            <div className="lk-route mnd-rise">
              <div className="mnd-eyebrow">Système · Pro · LOKAA</div>
              <h1 className="lk-route__title">Marque & thème.</h1>
              <p className="lk-route__lead">
                Configurez votre maison dans le cadre souverain. Ce qui vous distingue se règle
                ici ; ce qui garantit le standard MND reste verrouillé.
              </p>

              <div className="lk-cols lk-cols--theme">
                <section className="lk-card lk-card--pad">
                  <div className="lk-card__eyebrow lk-card__eyebrow--ink">Configurable</div>

                  <Field label="Nom du salon">
                    <Input value={tenant.nom} onChange={(e) => maj({ nom: e.target.value })} />
                  </Field>

                  <div className="lk-theme__row">
                    <div className="mnd-field__label">Couleur d’accent · palette validée</div>
                    <div className="lk-onb__swatches">
                      {ACCENTS.map((a) => (
                        <button
                          key={a.hex}
                          type="button"
                          title={a.nom}
                          className={`lk-swatch ${tenant.accent === a.hex ? 'is-active' : ''}`}
                          style={{ background: a.hex }}
                          onClick={() => maj({ accent: a.hex })}
                        >
                          {tenant.accent === a.hex ? <span aria-hidden="true">✓</span> : null}
                        </button>
                      ))}
                    </div>
                    <div className="lk-onb__hint">
                      {accentNom(tenant.accent)} · {tenant.accent}
                    </div>
                  </div>

                  <div className="lk-theme__row">
                    <div className="mnd-field__label">Logo</div>
                    <div className="lk-theme__logo">
                      <TenantMark tenant={tenant} size={46} />
                      <label className="lk-onb__upload">
                        <input type="file" accept="image/*" onChange={onLogo} />
                        {tenant.logo ? 'Remplacer le fichier' : 'Téléverser un fichier SVG / PNG'}
                      </label>
                      {tenant.logo && (
                        <button type="button" className="lk-onb__logoclear" onClick={() => maj({ logo: null })}>
                          Retirer
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="lk-theme__row">
                    <Field label="Devise du salon">
                      <Select value={devise} onChange={(e) => maj({ devise: e.target.value })}>
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} · {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="lk-theme__actions">
                    <Button
                      variant="copper"
                      onClick={() => notify('Thème publié sur l’app cliente et la vitrine.')}
                    >
                      Publier le thème
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        maj({ accent: ACCENTS[0].hex, logo: null });
                        notify('Thème réinitialisé sur la palette par défaut.');
                      }}
                    >
                      Réinitialiser
                    </Button>
                  </div>
                </section>

                <section className="lk-card lk-card--locked">
                  <div className="lk-card__eyebrow lk-card__eyebrow--soft">
                    <Lock size={11} /> Verrouillé · propulsé par MND
                  </div>
                  <ul className="lk-list lk-list--locked">
                    {VERROUILLES.map((v) => (
                      <li key={v}>
                        <Lock size={10} /> {v}
                      </li>
                    ))}
                  </ul>
                  <div className="lk-split__quote">
                    « La désirabilité du système est un actif MND. »
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
