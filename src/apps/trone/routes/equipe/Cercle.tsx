import { asset } from '../../../../shared/asset';
import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, clientsStore, type Client } from '../../../../shared/clients';
import { useServices } from '../../../../shared/catalog';
import { useStore, uid } from '../../../../shared/store';
import {
  pointsHistoryStore, pointsRateStore, useTiers,
  type PointsEvent, type RewardTier,
} from './data';
import { Bar, Pill, Tabs } from './ui';
import './equipe.css';

type Tab = 'points' | 'membres' | 'offrandes';

const ROMANS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ'];

type TierForm = { pts: string; serviceId: string; desc: string };

export default function Cercle() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [services] = useServices();
  const [tiers, setTiers] = useTiers();
  const [rate, setRate] = useStore(pointsRateStore);
  const [history, setHistory] = useStore(pointsHistoryStore);
  const [tab, setTab] = useState<Tab>('points');
  const [tierModal, setTierModal] = useState(false);
  const [tierEditId, setTierEditId] = useState<string | null>(null);
  const [tierForm, setTierForm] = useState<TierForm>({ pts: '', serviceId: services[0]?.id ?? '', desc: '' });
  const [adjust, setAdjust] = useState<Record<string, string>>({});

  const members = useMemo(
    () => clients.filter((c) => c.branchId === branch.id && !c.archived).sort((a, b) => b.loyaltyPoints - a.loyaltyPoints),
    [clients, branch.id],
  );
  const sortedTiers = useMemo(() => [...tiers].sort((a, b) => a.pts - b.pts), [tiers]);

  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? 'Prestation retirée du catalogue';
  const servicePrice = (id: string) => services.find((s) => s.id === id)?.priceXof ?? 0;

  const nextTierFor = (pts: number) => sortedTiers.find((t) => t.pts > pts) ?? null;
  const bestTierFor = (pts: number) => {
    const eligible = sortedTiers.filter((t) => t.pts <= pts);
    return eligible.length ? eligible[eligible.length - 1] : null;
  };

  const openTierNew = () => {
    setTierEditId(null);
    setTierForm({ pts: '', serviceId: services[0]?.id ?? '', desc: '' });
    setTierModal(true);
  };
  const openTierEdit = (t: RewardTier) => {
    setTierEditId(t.id);
    setTierForm({ pts: String(t.pts), serviceId: t.serviceId, desc: t.desc });
    setTierModal(true);
  };
  const saveTier = () => {
    const pts = parseInt(tierForm.pts, 10);
    if (!pts || pts <= 0 || !tierForm.serviceId) return;
    if (tierEditId) {
      setTiers((prev) => prev.map((t) => (t.id === tierEditId ? { ...t, pts, serviceId: tierForm.serviceId, desc: tierForm.desc } : t)));
    } else {
      setTiers((prev) => [...prev, { id: `tier-${uid()}`, pts, serviceId: tierForm.serviceId, desc: tierForm.desc, g: '' }]);
    }
    setTierModal(false);
  };

  const redeem = (c: Client, t: RewardTier) => {
    clientsStore.set((prev) => prev.map((x) => (x.id === c.id ? { ...x, loyaltyPoints: Math.max(0, x.loyaltyPoints - t.pts) } : x)));
    const evt: PointsEvent = {
      id: `pe-${uid()}`, clientId: c.id, clientName: c.name,
      label: `« ${serviceName(t.serviceId)} » offert`, pts: -t.pts, at: new Date().toISOString(),
    };
    setHistory((prev) => [evt, ...prev]);
  };

  const applyAdjust = (c: Client, sign: 1 | -1) => {
    const raw = parseInt(adjust[c.id] ?? '', 10);
    if (!raw || raw <= 0) return;
    const delta = raw * sign;
    clientsStore.set((prev) => prev.map((x) => (x.id === c.id ? { ...x, loyaltyPoints: Math.max(0, x.loyaltyPoints + delta) } : x)));
    const evt: PointsEvent = {
      id: `pe-${uid()}`, clientId: c.id, clientName: c.name,
      label: delta > 0 ? 'Ajustement manuel · points accordés' : 'Ajustement manuel · points retirés',
      pts: delta, at: new Date().toISOString(),
    };
    setHistory((prev) => [evt, ...prev]);
    setAdjust((prev) => ({ ...prev, [c.id]: '' }));
  };

  const totalPoints = members.reduce((a, c) => a + c.loyaltyPoints, 0);

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Le Cercle MND · transmission & lignée"
        title="Le Cercle."
        sub={`${branch.name} — les points témoignent d’une fidélité ; la maison les rend en offrant ce qu’elle sait faire de mieux : un soin.`}
        actions={<Button variant="copper" onClick={openTierNew}>+ Nouveau palier</Button>}
      />

      <div className="tr-grid tr-grid--4" style={{ marginBottom: 22 }}>
        <Card filet="copper" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Têtes dans le Cercle</div>
          <div className="mnd-stat__value" style={{ fontSize: 32 }}>{members.length}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>membres de la branche</div>
        </Card>
        <Card filet="indigo" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Points en circulation</div>
          <div className="mnd-stat__value" style={{ fontSize: 32 }}>{totalPoints.toLocaleString('fr-FR')}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>jamais de date d’expiration</div>
        </Card>
        <Card filet="indigo" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Paliers de récompense</div>
          <div className="mnd-stat__value" style={{ fontSize: 32 }}>{sortedTiers.length}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>points → services offerts</div>
        </Card>
        <Card filet="copper" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Prêtes à être honorées</div>
          <div className="mnd-stat__value" style={{ fontSize: 32 }}>{members.filter((c) => bestTierFor(c.loyaltyPoints)).length}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>un seuil est déjà franchi</div>
        </Card>
      </div>

      <Tabs<Tab>
        tabs={[{ k: 'points', l: 'Les paliers' }, { k: 'membres', l: 'Registre des soldes' }, { k: 'offrandes', l: 'Registre des offrandes' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'points' && (
        <div>
          <Card style={{ padding: '20px 22px', marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)' }}>Comment se méritent les points</div>
                <div className="mnd-muted" style={{ fontSize: 12.5, fontWeight: 300, marginTop: 4 }}>
                  Chaque dépense élève la couronne — jamais de date d’expiration, jamais de petits caractères.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 12px' }}>
                <span className="mnd-muted" style={{ fontSize: 10 }}>1 point /</span>
                <Input
                  type="number"
                  min={1}
                  value={rate}
                  onChange={(e) => { const n = parseInt(e.target.value, 10); setRate(n > 0 ? n : 1); }}
                  style={{ width: 72, textAlign: 'center', padding: '5px 7px' }}
                />
                <span className="mnd-muted" style={{ fontSize: 10 }}>F dépensés</span>
              </div>
            </div>
          </Card>

          <div className="tr-grid tr-grid--3">
            {sortedTiers.map((t, i) => (
              <Card key={t.id} className="tre-tier" filet="copper">
                <span className="tre-tier__seal">{ROMANS[i] ?? '✦'}</span>
                <div className="tre-tier__pts">{t.pts.toLocaleString('fr-FR')} pts</div>
                <div style={{ fontWeight: 500, fontSize: 12, marginTop: 6 }}>« {serviceName(t.serviceId)} » offert</div>
                <div className="mnd-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                  {t.desc || `Valeur ${fmtMoney(servicePrice(t.serviceId), currency)} — offerte, sans frais.`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="tre-chip" style={{ flex: 1, borderRadius: 2 }} onClick={() => openTierEdit(t)}>Modifier</button>
                  <button className="tre-chip" style={{ flex: 1, borderRadius: 2, color: '#8f3b30' }} onClick={() => setTiers((prev) => prev.filter((x) => x.id !== t.id))}>Retirer</button>
                </div>
              </Card>
            ))}
          </div>

          <div className="tre-quote" style={{ marginTop: 18 }}>
            « Le point ne s’achète pas au sens d’un solde bancaire — il témoigne d’une fidélité. La Maison le rend en offrant ce qu’elle sait faire de mieux : un soin. »
          </div>
        </div>
      )}

      {tab === 'membres' && (
        <div className="tr-grid tr-grid--2">
          {members.map((c) => {
            const next = nextTierFor(c.loyaltyPoints);
            const best = bestTierFor(c.loyaltyPoints);
            const progressPct = next ? Math.round((c.loyaltyPoints / next.pts) * 100) : 100;
            return (
              <Card key={c.id} style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="tre-avatar">{c.name.slice(0, 1)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{c.name}</div>
                    <div className="mnd-muted" style={{ fontSize: 10.5 }}>{c.segments.join(' · ') || c.city}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}>{c.loyaltyPoints.toLocaleString('fr-FR')}</div>
                    <div className="mnd-muted" style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase' }}>points</div>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Bar pct={progressPct} />
                  <span className="mnd-muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                    {next
                      ? `${(next.pts - c.loyaltyPoints).toLocaleString('fr-FR')} pts avant « ${serviceName(next.serviceId)} »`
                      : 'Tous les honneurs de points sont mérités.'}
                  </span>
                </div>

                {best && (
                  <Button size="sm" variant="copper" style={{ width: '100%', marginTop: 12 }} onClick={() => redeem(c, best)}>
                    Offrir « {serviceName(best.serviceId)} » · −{best.pts.toLocaleString('fr-FR')} pts
                  </Button>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
                  <span className="mnd-muted" style={{ fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', flex: 'none' }}>Ajustement</span>
                  <Input
                    inputMode="numeric"
                    placeholder="pts"
                    value={adjust[c.id] ?? ''}
                    onChange={(e) => setAdjust((prev) => ({ ...prev, [c.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                    style={{ width: 82, padding: '6px 9px', fontSize: 12 }}
                  />
                  <button className="tre-chip" onClick={() => applyAdjust(c, 1)}>+ Accorder</button>
                  <button className="tre-chip" onClick={() => applyAdjust(c, -1)}>− Retirer</button>
                </div>
              </Card>
            );
          })}
          {members.length === 0 && (
            <Card className="tre-empty" style={{ gridColumn: '1 / -1' }}>
              <img src={asset("/assets/monograms/mono-indigo.png")} alt="" style={{ width: 36, opacity: 0.4 }} />
              <div className="tre-empty__title">Aucune tête couronnée ici.</div>
              <div className="tre-empty__sub">Le Cercle de cette branche attend ses premières fidèles.</div>
            </Card>
          )}
        </div>
      )}

      {tab === 'offrandes' && (
        <div>
          {history.length === 0 && (
            <Card className="tre-empty">
              <img src={asset("/assets/monograms/mono-indigo.png")} alt="" style={{ width: 36, opacity: 0.4 }} />
              <div className="tre-empty__title">Aucune récompense encore offerte.</div>
              <div className="tre-empty__sub">Les soins offerts et les ajustements de points s’inscrivent ici.</div>
            </Card>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h) => (
              <Card key={h.id} style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12.5 }}>{h.clientName}</div>
                  <div className="mnd-muted" style={{ fontSize: 10.5 }}>
                    {h.label} · {new Date(h.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  </div>
                </div>
                <Pill tone={h.pts < 0 ? 'copper' : 'ok'}>{h.pts > 0 ? '+' : '−'}{Math.abs(h.pts).toLocaleString('fr-FR')} pts</Pill>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tierModal && (
        <Modal title={tierEditId ? 'Modifier le palier.' : 'Nouveau palier de récompense.'} onClose={() => setTierModal(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Points requis · seuil">
              <Input inputMode="numeric" value={tierForm.pts} placeholder="Ex. 3000" onChange={(e) => setTierForm({ ...tierForm, pts: e.target.value.replace(/[^0-9]/g, '') })} />
            </Field>
            <Field label="Prestation offerte · tirée du catalogue">
              <Select value={tierForm.serviceId} onChange={(e) => setTierForm({ ...tierForm, serviceId: e.target.value })}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {fmtMoney(s.priceXof, currency)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Description · une phrase">
              <Input value={tierForm.desc} placeholder="Ex. Un soin signature, sans frais." onChange={(e) => setTierForm({ ...tierForm, desc: e.target.value })} />
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setTierModal(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveTier} disabled={!tierForm.pts || !tierForm.serviceId}>
                {tierEditId ? 'Enregistrer le palier' : 'Créer le palier'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
