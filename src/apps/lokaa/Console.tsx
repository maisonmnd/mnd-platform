import { Button, Seal } from '../../ds/components';
import { fmtMoney } from '../../shared/currency';
import { useStore } from '../../shared/store';
import { PLANS, STATUT_LABEL, mrrXof, planById, tenantsStore } from './data';
import { TenantMark } from './ui';

/* Console super-admin MND — supervision du réseau de locataires.
   Tous les montants SaaS sont facturés et affichés en XOF. */

export default function Console({
  notify,
  onInvite,
  onOuvrir,
}: {
  notify: (m: string) => void;
  onInvite: () => void;
  onOuvrir: (id: string) => void;
}) {
  const [tenants, setTenants] = useStore(tenantsStore);

  const actifs = tenants.filter((t) => t.statut === 'actif');
  const essais = tenants.filter((t) => t.statut === 'essai');
  const mrrTotal = tenants.reduce((s, t) => s + mrrXof(t), 0);

  const basculer = (id: string) => {
    const t = tenants.find((x) => x.id === id);
    if (!t) return;
    const nouveau = t.statut === 'actif' ? 'pause' : 'actif';
    setTenants((prev) => prev.map((x) => (x.id === id ? { ...x, statut: nouveau } : x)));
    notify(
      nouveau === 'actif'
        ? `« ${t.nom} » est activé · la facturation reprend.`
        : `« ${t.nom} » est mis en pause · facturation suspendue.`
    );
  };

  return (
    <div className="lk-page mnd-rise">
      <div className="lk-page__row">
        <div>
          <div className="mnd-eyebrow">Supervision · réservé super-admin MND</div>
          <h1 className="lk-page__title">Console des locataires.</h1>
        </div>
        <Button variant="copper" onClick={onInvite}>
          + Inviter un salon
        </Button>
      </div>

      <div className="lk-tiles lk-tiles--console">
        <div className="lk-tile">
          <span>Salons locataires</span>
          <strong>{tenants.length}</strong>
          <em>{essais.length} en essai</em>
        </div>
        <div className="lk-tile">
          <span>Salons actifs</span>
          <strong>{actifs.length}</strong>
          <em>facturés ce mois</em>
        </div>
        <div className="lk-tile">
          <span>MRR · réseau</span>
          <strong>{fmtMoney(mrrTotal, 'XOF')}</strong>
          <em>pivot XOF · taux indicatifs</em>
        </div>
        <div className="lk-tile">
          <span>Conformité standard</span>
          <strong>97 %</strong>
          <em>1 écart suivi</em>
        </div>
      </div>

      <section className="lk-card lk-card--table lk-console">
        <div className="lk-console__cols" aria-hidden="true">
          <span>Salon locataire</span>
          <span>Pays</span>
          <span>Devise</span>
          <span>Plan</span>
          <span>MRR</span>
          <span>Statut</span>
          <span />
        </div>

        {/* Maison mère — hors facturation */}
        <div className="lk-console__row lk-console__row--mere">
          <span className="lk-console__salon">
            <Seal color="copper" size={30} />
            <span>
              <span className="lk-console__nom">Maison MND</span>
              <span className="lk-console__ville">Cotonou · Flagship</span>
            </span>
          </span>
          <span>Bénin</span>
          <span>XOF</span>
          <span>Groupe</span>
          <span className="lk-console__mrr">—</span>
          <span>
            <span className="lk-chip lk-chip--plein">Maison mère</span>
          </span>
          <span />
        </div>

        {tenants.map((t) => (
          <div key={t.id} className="lk-console__row">
            <span className="lk-console__salon">
              <TenantMark tenant={t} size={30} />
              <span>
                <span className="lk-console__nom">{t.nom}</span>
                <span className="lk-console__ville">{t.ville}</span>
              </span>
            </span>
            <span>{t.pays}</span>
            <span>{t.devise}</span>
            <span>{planById(t.plan).nom}</span>
            <span className="lk-console__mrr">{mrrXof(t) ? fmtMoney(mrrXof(t), 'XOF') : '—'}</span>
            <span>
              <span
                className={`lk-chip ${
                  t.statut === 'actif' ? '' : t.statut === 'essai' ? 'lk-chip--doux' : 'lk-chip--gris'
                }`}
              >
                {STATUT_LABEL[t.statut]}
              </span>
            </span>
            <span className="lk-console__actions">
              <button type="button" className="lk-console__lien" onClick={() => onOuvrir(t.id)}>
                Ouvrir
              </button>
              <button type="button" className="lk-console__lien" onClick={() => basculer(t.id)}>
                {t.statut === 'actif' ? 'Suspendre' : 'Activer'}
              </button>
            </span>
          </div>
        ))}
      </section>

      <section className="lk-facturation">
        <div className="lk-card lk-card--indigo lk-facturation__total">
          <div className="lk-card__eyebrow">Facturation SaaS · mensuelle</div>
          <div className="lk-card__big">{fmtMoney(mrrTotal, 'XOF')}</div>
          <div className="lk-facturation__note">
            Prélèvement Mobile Money ou carte, le 1er du mois. Les essais et les salons en pause ne
            sont pas facturés.
          </div>
        </div>

        <div className="lk-card lk-facturation__plans">
          <div className="lk-card__head">
            <span>Répartition par plan</span>
            <span className="lk-card__aside">salons actifs uniquement</span>
          </div>
          {PLANS.map((p) => {
            const n = actifs.filter((t) => t.plan === p.id).length;
            return (
              <div key={p.id} className="lk-facturation__ligne">
                <span className="lk-facturation__tier">{p.nom}</span>
                <span className="lk-facturation__detail">
                  {n} salon{n > 1 ? 's' : ''} × {fmtMoney(p.prixXof, 'XOF')}
                </span>
                <span className="lk-facturation__somme">{fmtMoney(n * p.prixXof, 'XOF')}</span>
              </div>
            );
          })}
          <div className="lk-facturation__ligne lk-facturation__ligne--total">
            <span className="lk-facturation__tier">MRR réseau</span>
            <span className="lk-facturation__detail">{actifs.length} salons facturés</span>
            <span className="lk-facturation__somme">{fmtMoney(mrrTotal, 'XOF')}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
