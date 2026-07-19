import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Eyebrow, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { shortDate, usePlans, useSubscribers, ensureStarterPlans, type Plan, type Subscriber } from './data';
import { ClientPicker, useBranchClients } from '../clients/_shared';
import { Bar, DeepNote, Pill, Tabs } from './ui';
import './equipe.css';

type Tab = 'moteur' | 'formules' | 'membres';

type PlanForm = { name: string; tag: string; price: string; line: string; perks: string };
type SubForm = { clientId: string; planId: string; slot: string };

export default function Abonnements() {
  const { branch, currency } = useBranch();
  const [plans, setPlans] = usePlans();
  const [subs, setSubs] = useSubscribers();
  const clients = useBranchClients();
  const [tab, setTab] = useState<Tab>('moteur');
  const [cycle, setCycle] = useState<'mensuel' | 'annuel'>('mensuel');
  const [planModal, setPlanModal] = useState(false);
  const [planEditId, setPlanEditId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>({ name: '', tag: '', price: '', line: '', perks: '' });
  const [subModal, setSubModal] = useState(false);
  const [subForm, setSubForm] = useState<SubForm>({ clientId: '', planId: plans[0]?.id ?? '', slot: '' });

  /* Pose les 6 formules signées de départ si la Maison n'en a aucune. */
  useEffect(() => { ensureStarterPlans(); }, []);

  const branchSubs = useMemo(() => subs.filter((m) => m.branchId === branch.id), [subs, branch.id]);
  const members = useMemo(() => branchSubs.filter((m) => m.status !== 'churn'), [branchSubs]);
  const churned = branchSubs.length - members.length;
  const retention = branchSubs.length > 0 ? Math.round((members.length / branchSubs.length) * 100) : null;
  const mrr = members.reduce((a, m) => a + m.mrrXof, 0);
  const planOf = (id: string) => plans.find((p) => p.id === id);

  const split = plans.map((p) => {
    const list = members.filter((m) => m.planId === p.id);
    return { plan: p, count: list.length, mrr: list.reduce((a, m) => a + m.mrrXof, 0) };
  });
  const splitMax = Math.max(1, ...split.map((s) => s.count));

  const openPlanNew = () => {
    setPlanEditId(null);
    setPlanForm({ name: '', tag: '', price: '', line: '', perks: '' });
    setPlanModal(true);
  };
  const openPlanEdit = (p: Plan) => {
    setPlanEditId(p.id);
    setPlanForm({ name: p.name, tag: p.tag, price: String(p.priceXof), line: p.line, perks: p.perks.join(' · ') });
    setPlanModal(true);
  };
  const savePlan = () => {
    const priceXof = parseInt(planForm.price, 10) || 0;
    if (!planForm.name.trim() || priceXof <= 0) return;
    const perks = planForm.perks.split('·').map((s) => s.trim()).filter(Boolean);
    if (planEditId) {
      setPlans((prev) => prev.map((p) => (p.id === planEditId ? { ...p, name: planForm.name.trim(), tag: planForm.tag, priceXof, line: planForm.line, perks } : p)));
    } else {
      setPlans((prev) => [...prev, { id: `pl-${uid()}`, name: planForm.name.trim(), tag: planForm.tag || 'Nouvelle formule', priceXof, line: planForm.line, perks, popular: false }]);
    }
    setPlanModal(false);
  };

  const saveSub = () => {
    const plan = planOf(subForm.planId);
    const client = clients.find((c) => c.id === subForm.clientId);
    if (!client || !plan) return;
    const nm: Subscriber = {
      id: `ab-${uid()}`, branchId: branch.id, name: client.name, planId: plan.id,
      slot: subForm.slot.trim() || 'Créneau à réserver',
      nextIso: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      since: 'ce mois', status: 'new', mrrXof: plan.priceXof,
    };
    setSubs((prev) => [...prev, nm]);
    setSubModal(false);
    setSubForm({ clientId: '', planId: plans[0]?.id ?? '', slot: '' });
  };

  const statusDot = (s: Subscriber['status']) =>
    s === 'risk' ? '#8f3b30' : s === 'new' ? 'var(--color-copper)' : '#6e7c5c';

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Croissance · le cœur du cash"
        title="Abonnements."
        sub="Le salon classique vend une fois ; la Maison perçoit chaque lune."
        actions={
          <div className="tre-mrr-head">
            <div className="mnd-eyebrow" style={{ fontSize: 9.5 }}>Revenu récurrent · ce mois</div>
            <div className="tre-mrr" style={{ marginTop: 4 }}>{fmtMoney(mrr, currency)}</div>
          </div>
        }
      />

      <Tabs<Tab>
        tabs={[{ k: 'moteur', l: 'Le moteur' }, { k: 'formules', l: 'Les formules' }, { k: 'membres', l: 'Les abonnés' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'moteur' && (
        <div>
          <DeepNote eyebrow={mrr > 0 ? 'Avant même d’ouvrir les portes' : 'Le moteur attend sa première lune'}>
            {mrr > 0
              ? <>{fmtMoney(mrr, currency)} sont déjà encaissés ce mois — <span className="accent">le salon classique vend une fois ; la Maison perçoit chaque lune.</span></>
              : <>Aucun abonnement encore — <span className="accent">le salon classique vend une fois ; la Maison percevra chaque lune.</span></>}
          </DeepNote>

          <div className="tr-grid tr-grid--4">
            <Card filet="copper" style={{ padding: 18 }}>
              <div className="mnd-stat__label">MRR · revenu récurrent</div>
              <div className="mnd-stat__value" style={{ fontSize: 30 }}>{mrr > 0 ? fmtMoney(mrr, currency) : '—'}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>revenu des abonnements actifs</div>
            </Card>
            <Card filet="indigo" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Abonnés actifs</div>
              <div className="mnd-stat__value" style={{ fontSize: 30 }}>{members.length}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>
                {members.length > 0 ? `+ ${members.filter((m) => m.status === 'new').length} ce mois` : 'la première lune reste à inscrire'}
              </div>
            </Card>
            <Card filet="indigo" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Rétention</div>
              <div className="mnd-stat__value" style={{ fontSize: 30 }}>{retention != null ? `${retention} %` : '—'}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>
                {retention != null ? `${churned} résiliation${churned > 1 ? 's' : ''}` : 'se mesurera avec l’usage'}
              </div>
            </Card>
            <Card filet="copper" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Valeur à vie · LTV</div>
              <div className="mnd-stat__value" style={{ fontSize: 30 }}>—</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>se calculera avec l’historique</div>
            </Card>
          </div>

          <div className="tr-grid tr-grid--2" style={{ marginTop: 16, alignItems: 'start' }}>
            <Card style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <Eyebrow>Le moteur · ce mois</Eyebrow>
              </div>
              {members.length === 0 ? (
                <div className="mnd-muted" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.6, padding: '14px 0' }}>
                  L’évolution du revenu récurrent se dessinera lune après lune — inscrivez la première abonnée, la courbe naîtra d’elle.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {([['new', 'Nouvelles ce mois'], ['active', 'Actives'], ['risk', 'À veiller']] as const).map(([st, label]) => {
                    const n = members.filter((m) => m.status === st).length;
                    return (
                      <div key={st}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span>{label}</span>
                          <span className="mnd-muted">{n} abonné{n > 1 ? 's' : ''}</span>
                        </div>
                        <div style={{ marginTop: 5 }}>
                          <Bar pct={(n / Math.max(1, members.length)) * 100} fill={st === 'risk' ? '#8f3b30' : st === 'new' ? 'var(--color-copper)' : 'var(--color-indigo)'} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="tre-inline-note" style={{ alignItems: 'flex-start' }}>
                <span className="mark">✦</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.5 }}>
                  Un revenu qui revient seul vaut plus qu’un revenu qu’il faut reconquérir. Chaque abonné est une trésorerie prévisible — et un fauteuil déjà rempli.
                </span>
              </div>
              <Card style={{ padding: '18px 20px' }}>
                <Eyebrow>Répartition des abonnés</Eyebrow>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {split.map((s) => (
                    <div key={s.plan.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span>{s.plan.name}</span>
                        <span className="mnd-muted">{s.count} abonné{s.count > 1 ? 's' : ''} · {fmtMoney(s.mrr, currency)}</span>
                      </div>
                      <div style={{ marginTop: 5 }}>
                        <Bar pct={(s.count / splitMax) * 100} fill={s.plan.popular ? 'var(--color-copper)' : 'var(--color-indigo)'} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {tab === 'formules' && (
        <div>
          <div className="tre-actions-row">
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--color-indigo)' }}>
              Offrez-vous le rituel. <span className="mnd-muted" style={{ fontStyle: 'normal', fontSize: 13, fontFamily: 'var(--font-sans)' }}>— pour vous, ou pour quelqu’un que vous aimez.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Button size="sm" onClick={openPlanNew}>+ Nouvelle formule</Button>
              <div style={{ display: 'flex', background: 'var(--hover-veil)', borderRadius: 999, padding: 3 }}>
                {(['mensuel', 'annuel'] as const).map((c) => (
                  <button
                    key={c}
                    className="tre-chip"
                    style={{
                      border: 'none',
                      background: cycle === c ? 'var(--color-ivoire)' : 'transparent',
                      color: cycle === c ? 'var(--color-indigo)' : 'var(--ink-soft)',
                    }}
                    onClick={() => setCycle(c)}
                  >
                    {c === 'mensuel' ? 'Mensuel' : 'Annuel · 2 mois offerts'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="tr-grid tr-grid--3" style={{ alignItems: 'start', marginTop: 8 }}>
            {plans.map((p) => {
              const annual = cycle === 'annuel';
              const price = annual ? p.priceXof * 10 : p.priceXof;
              return (
                <Card key={p.id} className={`tre-plan ${p.popular ? 'tre-plan--popular' : ''}`}>
                  {p.popular
                    ? <span className="tre-plan__tagpop">{p.tag}</span>
                    : <div className="mnd-eyebrow" style={{ fontSize: 9.5, color: 'var(--copper-700)' }}>{p.tag}</div>}
                  <div className="tre-plan__name" style={{ marginTop: p.popular ? 6 : 8 }}>{p.name}</div>
                  <div className="tre-plan__line">{p.line}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '10px 0 4px' }}>
                    <span className="tre-plan__price">{fmtMoney(price, currency)}</span>
                    <span style={{ fontSize: 12, color: p.popular ? 'rgba(246,241,231,.7)' : 'var(--ink-soft)' }}>{annual ? '/an' : '/mois'}</span>
                  </div>
                  <div style={{ fontSize: 11, minHeight: 16, color: p.popular ? 'var(--copper-300)' : 'var(--copper-700)' }}>
                    {annual ? `soit ${fmtMoney(Math.round((p.priceXof * 10) / 12), currency)}/mois · 2 mois offerts` : ''}
                  </div>
                  <div className="tre-plan__divider" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {p.perks.map((perk) => (
                      <div key={perk} className="tre-plan__perk"><span className="mark">✦</span><span>{perk}</span></div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                    <Button size="sm" variant={p.popular ? 'copper' : 'ghost'} style={{ flex: 1 }} onClick={() => openPlanEdit(p)}>Modifier</Button>
                    {!p.popular && (
                      <Button size="sm" variant="ghost" onClick={() => setPlans((prev) => prev.filter((x) => x.id !== p.id))} disabled={members.some((m) => m.planId === p.id)}>
                        Retirer
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          <div className="mnd-muted" style={{ textAlign: 'center', fontSize: 11.5, marginTop: 18 }}>
            Chaque formule réserve un créneau <span style={{ color: 'var(--copper-700)' }}>rien qu’à vous</span> — prélèvement Mobile Money, sans paperasse, résiliable à tout moment.
          </div>
        </div>
      )}

      {tab === 'membres' && (
        <div>
          <div className="tre-actions-row">
            <div className="mnd-muted" style={{ fontSize: 13 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}>{members.length}</span> abonnés actifs · chacun avec son créneau réservé
            </div>
            <Button variant="copper" onClick={() => { setSubForm({ clientId: '', planId: plans[0]?.id ?? '', slot: '' }); setSubModal(true); }}>+ Nouvel abonné</Button>
          </div>

          <Card style={{ overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table tre-table--cards">
                <thead>
                  <tr><th>Tête couronnée</th><th>Formule</th><th>Son créneau · rien qu’à elle</th><th>Prochain prélèvement</th><th style={{ textAlign: 'right' }}>MRR</th><th></th></tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot(m.status), flex: 'none' }} />
                          <span>
                            <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{m.name}</span>
                            <span className="mnd-muted" style={{ display: 'block', fontSize: 10.5 }}>abonnée depuis {m.since}</span>
                          </span>
                        </span>
                      </td>
                      <td data-label="Formule"><Pill tone={planOf(m.planId)?.popular ? 'copper' : 'muted'}>{planOf(m.planId)?.name ?? '—'}</Pill></td>
                      <td data-label="Son créneau" style={{ fontSize: 12.5 }}>{m.slot}</td>
                      <td data-label="Prochain prélèvement">
                        <span style={{ fontSize: 12.5, color: m.status === 'risk' ? '#8f3b30' : undefined }}>{shortDate(m.nextIso)}</span>
                        {m.note && <div style={{ fontSize: 10.5, color: '#8f3b30', marginTop: 2 }}>{m.note}</div>}
                      </td>
                      <td className="num" data-label="MRR" style={{ textAlign: 'right' }}>{fmtMoney(m.mrrXof, currency)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="tre-link-btn tre-link-btn--danger"
                          onClick={() => setSubs((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'churn' } : x)))}
                        >
                          Résilier
                        </button>
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr><td colSpan={6} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucun abonné dans cette branche — le moteur attend sa première lune.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {planModal && (
        <Modal title={planEditId ? 'Modifier la formule.' : 'Nouvelle formule.'} onClose={() => setPlanModal(false)} width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="tr-grid tr-grid--2">
              <Field label="Nom de la formule">
                <Input value={planForm.name} placeholder="Ex. La Régente" onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
              </Field>
              <Field label="Accroche courte">
                <Input value={planForm.tag} placeholder="Ex. L’équilibre" onChange={(e) => setPlanForm({ ...planForm, tag: e.target.value })} />
              </Field>
            </div>
            <Field label={`Prix mensuel · ${currency === 'XOF' ? 'F' : 'XOF'}`}>
              <Input inputMode="numeric" value={planForm.price} placeholder="45000" onChange={(e) => setPlanForm({ ...planForm, price: e.target.value.replace(/[^0-9]/g, '') })} />
            </Field>
            <Field label="La promesse">
              <Input value={planForm.line} placeholder="Une phrase souveraine qui donne envie…" onChange={(e) => setPlanForm({ ...planForm, line: e.target.value })} />
            </Field>
            <Field label="Avantages · séparés par ·">
              <Textarea rows={3} value={planForm.perks} placeholder="1 resserrage / mois · Créneau réservé · −10 % Care & Store" onChange={(e) => setPlanForm({ ...planForm, perks: e.target.value })} />
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setPlanModal(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={savePlan} disabled={!planForm.name.trim() || !planForm.price}>
                {planEditId ? 'Enregistrer la formule' : 'Créer la formule'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {subModal && (
        <Modal title="Nouvel abonné." onClose={() => setSubModal(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Tête couronnée">
              <ClientPicker value={subForm.clientId} onChange={(id) => setSubForm({ ...subForm, clientId: id })} />
            </Field>
            <Field label="Formule">
              <Select value={subForm.planId} onChange={(e) => setSubForm({ ...subForm, planId: e.target.value })}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {fmtMoney(p.priceXof, currency)}/mois</option>)}
              </Select>
            </Field>
            <Field label="Son créneau réservé">
              <Input value={subForm.slot} placeholder="Ex. Jeu · 14h00 · Yéman" onChange={(e) => setSubForm({ ...subForm, slot: e.target.value })} />
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setSubModal(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveSub} disabled={!subForm.clientId}>Inscrire l’abonné</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
