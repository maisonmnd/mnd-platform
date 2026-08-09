import { asset } from '../../../../shared/asset';
import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, clientsStore, estDePassage, type Client } from '../../../../shared/clients';
import { useAppointments, venuesHonorees } from '../../../../shared/agenda';
import { useServices } from '../../../../shared/catalog';
import { useStore, uid } from '../../../../shared/store';
import { cercleSeuilStore, estDuCercle } from '../../../../shared/offers';
import {
  pointsHistoryStore, pointsRateStore, pointsEnabledStore, useTiers,
  type PointsEvent, type RewardTier,
} from './data';
import { Bar, Pill, Tabs, Toggle } from './ui';
import './equipe.css';

type Tab = 'points' | 'membres' | 'offrandes';

const ROMANS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ'];

type TierForm = { pts: string; serviceId: string; desc: string };

export default function Cercle() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [appts] = useAppointments();
  const [services] = useServices();
  const [tiers, setTiers] = useTiers();
  const [rate, setRate] = useStore(pointsRateStore);
  const [pointsOn, setPointsOn] = useStore(pointsEnabledStore);
  const [history, setHistory] = useStore(pointsHistoryStore);
  const [tab, setTab] = useState<Tab>('points');
  const [tierModal, setTierModal] = useState(false);
  const [tierEditId, setTierEditId] = useState<string | null>(null);
  const [tierForm, setTierForm] = useState<TierForm>({ pts: '', serviceId: services[0]?.id ?? '', desc: '' });
  const [adjust, setAdjust] = useState<Record<string, string>>({});
  /* LE REGISTRE ÉTAIT UN MUR. Une carte par tête, deux par ligne : cinq membres
     et cent cinquante-deux têtes aux portes faisaient cinq mille pixels de
     défilement pour ajuster un solde. On cherche une tête par son nom, on ne la
     croise pas en descendant. D'où la recherche, les deux registres séparés, et
     les gestes repliés sous la ligne qui les concerne. */
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState<'membres' | 'portes'>('membres');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [montre, setMontre] = useState(20);

  /* LE CERCLE N'EST PAS LE CARNET. « Têtes dans le Cercle » comptait TOUTES les
     clientes de la branche : un registre qui dit « 186 membres » d'un programme
     où personne n'est encore entré ne récompense plus rien, il décrit le carnet.
     On y entre au 3ᵉ passage — les autres sont AUX PORTES, et se voient aussi,
     parce que c'est là que se lit ce que la fidélité est en train de gagner. */
  const [seuil, setSeuil] = useStore(cercleSeuilStore);
  const venuesDe = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) m.set(c.id, venuesHonorees(appts, c.id, true));
    return m;
  }, [clients, appts]);

  const branchClients = useMemo(
    () => clients.filter((c) => c.branchId === branch.id && !c.archived)
      .sort((a, b) => b.loyaltyPoints - a.loyaltyPoints),
    [clients, branch.id],
  );
  const members = useMemo(
    () => branchClients.filter((c) => estDuCercle(venuesDe.get(c.id) ?? 0, seuil)),
    [branchClients, venuesDe, seuil],
  );
  /* Aux portes — il leur manque une venue ou deux. Une passante n'y figure pas :
     elle n'a pas encore de relation à faire mûrir. */
  const auxPortes = useMemo(
    () => branchClients
      .filter((c) => !estDuCercle(venuesDe.get(c.id) ?? 0, seuil) && !estDePassage(c) && (venuesDe.get(c.id) ?? 0) > 0)
      .sort((a, b) => (venuesDe.get(b.id) ?? 0) - (venuesDe.get(a.id) ?? 0)),
    [branchClients, venuesDe, seuil],
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

      {/* Le programme n'attribue RIEN tant que la maison ne l'a pas lancé — pas de
          points accumulés en coulisses avant le jour officiel. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', padding: '13px 16px', marginBottom: 22 }}>
        <Toggle on={pointsOn} onToggle={() => setPointsOn(!pointsOn)} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}>
            Attribution des points : <b>{pointsOn ? 'active' : 'coupée'}</b>
          </div>
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {pointsOn
              ? 'Chaque rituel honoré attribue ses points (1 point / ' + rate + ' F).'
              : 'Aucun point n’est attribué aux encaissements ni aux rituels honorés — activez le jour du lancement du programme.'}
          </div>
        </div>
      </div>

      <div className="tr-grid tr-grid--4" style={{ marginBottom: 22 }}>
        <Card filet="copper" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Têtes dans le Cercle</div>
          <div className="mnd-stat__value" style={{ fontSize: 32 }}>{members.length}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>
            entrées au {seuil}ᵉ passage{auxPortes.length > 0 ? ` · ${auxPortes.length} aux portes` : ''}
          </div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 12px' }}>
                  <span className="mnd-muted" style={{ fontSize: 10 }}>on entre au</span>
                  <Input
                    type="number"
                    min={1}
                    value={seuil}
                    onChange={(e) => { const n = parseInt(e.target.value, 10); setSeuil(n > 0 ? n : 1); }}
                    style={{ width: 62, textAlign: 'center', padding: '5px 7px' }}
                    aria-label="Nombre de passages pour entrer au Cercle"
                  />
                  <span className="mnd-muted" style={{ fontSize: 10 }}>ᵉ passage</span>
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
            </div>
            {/* LA RÈGLE SE DIT, sinon un comptoir qui ne voit aucun point tomber
                croit à une panne et finit par en ajouter à la main. */}
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.55, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
              Un passage ne donne pas le Cercle. Les {seuil > 1 ? `${seuil - 1} premier${seuil > 2 ? 's' : ''} passage${seuil > 2 ? 's' : ''} n’attribue${seuil > 2 ? 'nt' : ''} aucun point` : 'points sont attribués dès la première venue'} —
              la reconnaissance commence au {seuil}ᵉ, et rien n’est crédité après coup pour les venues d’avant.
              Une venue = un jour où un rituel a été honoré ; deux gestes le même jour ne comptent qu’une fois.
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

      {tab === 'membres' && (() => {
        const q = recherche.trim().toLowerCase();
        /* Un numéro se tape comme on le lit — « 60 16 » doit trouver
           « +229 01 60 16 32 46 ». On compare donc les deux sans leurs espaces. */
        const qTel = q.replace(/\s/g, '');
        const cherche = (l: Client[]) => (q
          ? l.filter((c) => c.name.toLowerCase().includes(q)
            || (qTel !== '' && (c.phone ?? '').replace(/\s/g, '').includes(qTel)))
          : l);
        const mbr = cherche(members);
        const portes = cherche(auxPortes);
        /* AUX PORTES, ON N'AFFICHE PAS TOUT D'UN COUP — cent cinquante-deux
           lignes ne se lisent pas, elles se cherchent. Le reste s'ouvre à la
           demande, et le compte est dit pour qu'on sache ce qui reste dessous. */
        const visibles = vue === 'membres' ? mbr : portes.slice(0, montre);
        const caches = vue === 'portes' ? Math.max(0, portes.length - visibles.length) : 0;

        return (
          <div>
            <div className="tre-reg__barre">
              <Input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher une tête (nom, téléphone)…"
                style={{ flex: '1 1 240px', minWidth: 0 }}
              />
              {/* DEUX REGISTRES, PAS UNE PILE. Un membre et une tête aux portes
                  n'appellent pas le même geste : l'un se récompense, l'autre
                  s'attend. Les mêler obligeait à faire le tri de l'œil. */}
              <button
                className={`tre-chip ${vue === 'membres' ? 'is-on' : ''}`}
                onClick={() => { setVue('membres'); setOuvert(null); }}
              >
                Membres <span style={{ opacity: .6, marginLeft: 4 }}>{mbr.length}</span>
              </button>
              <button
                className={`tre-chip ${vue === 'portes' ? 'is-on' : ''}`}
                onClick={() => { setVue('portes'); setOuvert(null); }}
              >
                Aux portes <span style={{ opacity: .6, marginLeft: 4 }}>{portes.length}</span>
              </button>
            </div>

            {visibles.length === 0 && (
              <Card className="tre-empty">
                <img src={asset("/assets/monograms/mono-indigo.png")} alt="" style={{ width: 36, opacity: 0.4 }} />
                <div className="tre-empty__title">
                  {q ? 'Aucune tête à ce nom.' : vue === 'membres' ? 'Personne n’est encore entré.' : 'Aucune tête en approche.'}
                </div>
                <div className="tre-empty__sub">
                  {q
                    ? 'Cherchez sur une autre orthographe, ou changez de registre.'
                    : `Le Cercle s’ouvre au ${seuil}ᵉ passage${vue === 'membres' && auxPortes.length > 0 ? ` — ${auxPortes.length} tête${auxPortes.length > 1 ? 's' : ''} en approche, registre voisin.` : '.'}`}
                </div>
              </Card>
            )}

            {visibles.length > 0 && (
              <div className="tre-reg">
                {visibles.map((c) => {
                  const membre = vue === 'membres';
                  const next = membre ? nextTierFor(c.loyaltyPoints) : null;
                  const best = membre ? bestTierFor(c.loyaltyPoints) : null;
                  const v = venuesDe.get(c.id) ?? 0;
                  const reste = Math.max(1, seuil - v);
                  const pct = membre
                    ? (next ? Math.round((c.loyaltyPoints / next.pts) * 100) : 100)
                    : Math.round((v / Math.max(1, seuil)) * 100);
                  const deplie = ouvert === c.id;
                  return (
                    <div key={c.id}>
                      <div className={`tre-reg__row ${deplie ? 'is-open' : ''}`}>
                        <span className="tre-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{c.name.slice(0, 1)}</span>
                        <span className="tre-reg__ident">
                          <span className="tre-reg__nom">{c.name}</span>
                          <span className="tre-reg__meta">
                            {membre
                              ? (next
                                ? `${(next.pts - c.loyaltyPoints).toLocaleString('fr-FR')} pts avant « ${serviceName(next.serviceId)} »`
                                : 'Tous les honneurs de points sont mérités.')
                              : `${v} venue${v > 1 ? 's' : ''} · encore ${reste} avant le Cercle`}
                          </span>
                        </span>
                        <span className="tre-reg__jauge"><Bar pct={pct} /></span>
                        <span className="tre-reg__pts">
                          {membre ? c.loyaltyPoints.toLocaleString('fr-FR') : `${v}/${seuil}`}
                        </span>
                        {membre ? (
                          <button
                            className="tre-reg__plus"
                            title={deplie ? 'Replier' : 'Offrir un soin, ajuster ses points'}
                            aria-expanded={deplie}
                            onClick={() => setOuvert(deplie ? null : c.id)}
                          >
                            {deplie ? '−' : '+'}
                          </button>
                        ) : <span />}
                      </div>

                      {/* LES GESTES SOUS LA LIGNE QUI LES CONCERNE. Offrir un
                          soin et retirer des points sont des actes rares : les
                          afficher cent cinquante fois allongeait la page sans
                          rien rendre plus accessible. */}
                      {deplie && (
                        <div className="tre-reg__panel">
                          {best && (
                            <Button size="sm" variant="copper" onClick={() => redeem(c, best)}>
                              Offrir « {serviceName(best.serviceId)} » · −{best.pts.toLocaleString('fr-FR')} pts
                            </Button>
                          )}
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {caches > 0 && (
              <button className="tre-chip" style={{ marginTop: 12 }} onClick={() => setMontre((n) => n + 40)}>
                Afficher {Math.min(40, caches)} tête{Math.min(40, caches) > 1 ? 's' : ''} de plus · {caches} restante{caches > 1 ? 's' : ''}
              </button>
            )}
          </div>
        );
      })()}

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
