import { asset } from '../../../../shared/asset';
import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Eyebrow, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useStore, uid } from '../../../../shared/store';
import {
  AUTOMATIONS, OFFER_AUDIENCES, OFFER_DAYS, OFFER_HOURS,
  automationsActiveStore, autoConfigStore, useCampaigns, useOffers,
  type InstantOffer,
} from './data';
import { Bar, DeepNote, Pill, Tabs, Toggle } from './ui';
import './equipe.css';

type Tab = 'campagnes' | 'offres' | 'auto' | 'audience';

const AUDIENCE_ROWS = [
  { seg: 'VIP · têtes couronnées', size: '46', valeur: '1,2 M F', prop: 88, moment: 'dim. 18h' },
  { seg: 'En cycle de resserrage', size: '128', valeur: '74 000 F', prop: 76, moment: 'jeu. 12h' },
  { seg: 'Cercle · transmetteuses', size: '88', valeur: '415 000 F', prop: 64, moment: 'sam. 10h' },
  { seg: 'Dormantes réveillables', size: '60', valeur: '295 000 F', prop: 38, moment: 'mar. 19h' },
];

type OfferForm = {
  title: string; tag: string; deal: string; sub: string; audience: string;
  days: string[]; heureDebut: string; heureFin: string;
};

const emptyOffer: OfferForm = {
  title: '', tag: 'Offre éclair', deal: '', sub: '', audience: 'Tous',
  days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'], heureDebut: '09h', heureFin: '18h',
};

const campTone = (s: string): 'ok' | 'warn' | 'muted' => (s === 'Active' ? 'ok' : s === 'Programmée' ? 'warn' : 'muted');

export default function Marketing() {
  const { branch } = useBranch();
  const [tab, setTab] = useState<Tab>('campagnes');
  const [campaigns] = useCampaigns();
  const [offers, setOffers] = useOffers();
  const [autoActive, setAutoActive] = useStore(automationsActiveStore);
  const [autoCfg, setAutoCfg] = useStore(autoConfigStore);
  const [offerModal, setOfferModal] = useState(false);
  const [offerEditId, setOfferEditId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState<OfferForm>(emptyOffer);
  const [campNote, setCampNote] = useState<string | null>(null);

  const branchCampaigns = useMemo(() => campaigns.filter((c) => c.branchId === branch.id), [campaigns, branch.id]);
  const branchOffers = useMemo(() => offers.filter((o) => o.branchId === branch.id), [offers, branch.id]);

  const isOn = (id: string) => autoActive[id] !== false;
  const activeCount = AUTOMATIONS.filter((a) => isOn(a.id)).length;
  const msgCount = AUTOMATIONS.filter((a) => isOn(a.id)).reduce((s, a) => s + a.runs, 0);

  const openNewOffer = () => { setOfferEditId(null); setOfferForm(emptyOffer); setOfferModal(true); };
  const openEditOffer = (o: InstantOffer) => {
    setOfferEditId(o.id);
    setOfferForm({ title: o.title, tag: o.tag, deal: o.deal, sub: o.sub, audience: o.audience, days: [...o.days], heureDebut: o.heureDebut, heureFin: o.heureFin });
    setOfferModal(true);
  };
  const saveOffer = () => {
    if (!offerForm.title.trim()) return;
    if (offerEditId) {
      setOffers((prev) => prev.map((o) => (o.id === offerEditId ? { ...o, ...offerForm, title: offerForm.title.trim() } : o)));
    } else {
      setOffers((prev) => [...prev, { id: `of-${uid()}`, branchId: branch.id, active: true, ...offerForm, title: offerForm.title.trim() }]);
    }
    setOfferModal(false);
  };
  const toggleDay = (d: string) =>
    setOfferForm((f) => ({
      ...f,
      days: f.days.includes(d)
        ? f.days.filter((x) => x !== d)
        : OFFER_DAYS.filter((x) => f.days.includes(x) || x === d),
    }));

  const daysLabel = (o: InstantOffer) =>
    o.days.length === 0 ? 'Aucun jour' : o.days.length === 7 ? 'Tous les jours' : o.days.join(' · ');

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Intelligence · Marketing & IA"
        title="L’intelligence."
        sub="Campagnes mesurées, offres instantanées poussées dans Ma Couronne, automatisations qui parlent d’une seule voix."
        actions={tab === 'offres' ? <Button variant="copper" onClick={openNewOffer}>+ Offre instantanée</Button> : undefined}
      />

      <Tabs<Tab>
        tabs={[
          { k: 'campagnes', l: 'Campagnes' },
          { k: 'offres', l: 'Offres instantanées' },
          { k: 'auto', l: 'Automatisations' },
          { k: 'audience', l: 'Audience' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'campagnes' && (
        <div>
          <DeepNote
            eyebrow="Intelligence — l’IA propose une campagne"
            actions={
              <>
                <Button variant="copper" onClick={() => setCampNote('Campagne « Couronnement » programmée · dimanche 18h.')}>Lancer</Button>
                <Button variant="ghost-invert" onClick={() => setCampNote('Brouillon de campagne ouvert — ajustez la cible et le moment.')}>Ajuster</Button>
              </>
            }
          >
            Inviter VIP &amp; Cercle au Couronnement
            <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 300, fontSize: 12.5, color: 'rgba(246,241,231,.7)', marginTop: 5 }}>
              88 têtes ciblées · moment idéal prédit : dimanche 18h · lift estimé <span className="accent">+31 %</span> de présence.
            </div>
          </DeepNote>
          {campNote && (
            <div className="tre-inline-note" style={{ marginBottom: 16 }}>
              <span className="mark">✦</span><span>{campNote}</span>
            </div>
          )}

          <Card style={{ overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table">
                <thead>
                  <tr><th>Campagne</th><th>Segment</th><th>Canal</th><th>Statut</th><th>Portée</th><th>Lift</th></tr>
                </thead>
                <tbody>
                  {branchCampaigns.map((c) => (
                    <tr key={c.id}>
                      <td><span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{c.name}</span></td>
                      <td className="mnd-muted">{c.segment}</td>
                      <td><Pill tone="muted">{c.canal}</Pill></td>
                      <td><Pill tone={campTone(c.statut)}>{c.statut}</Pill></td>
                      <td>{c.reach}</td>
                      <td className="num" style={{ color: c.lift.startsWith('+') ? 'var(--copper-700)' : undefined }}>{c.lift}</td>
                    </tr>
                  ))}
                  {branchCampaigns.length === 0 && (
                    <tr><td colSpan={6} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucune campagne pour cette branche.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'offres' && (
        <div>
          <div className="tre-actions-row">
            <div className="mnd-muted" style={{ fontSize: 13, fontWeight: 300, maxWidth: '60%' }}>
              Promotions instantanées poussées dans <span style={{ color: 'var(--color-indigo)' }}>Ma Couronne</span> — vous choisissez les jours, les heures et qui les voit.
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5 }}>
              {branchOffers.filter((o) => o.active).length} en ligne · {branchOffers.length} offres
            </div>
          </div>

          {branchOffers.length === 0 && (
            <Card className="tre-empty">
              <img src={asset("/assets/monograms/mono-indigo.png")} alt="" style={{ width: 36, opacity: 0.4 }} />
              <div className="tre-empty__title">Aucune offre en cours.</div>
              <div className="tre-empty__sub">Créez une offre instantanée pour la faire apparaître dans l’app cliente.</div>
            </Card>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {branchOffers.map((o) => (
              <Card key={o.id} className={`tre-offer ${o.active ? '' : 'is-off'}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span className="tre-pill tre-pill--copper">{o.tag}</span>
                      <span className="tre-offer__deal">{o.deal}</span>
                      <Pill tone={o.active ? 'ok' : 'muted'}>{o.active ? 'En ligne' : 'Hors ligne'}</Pill>
                    </div>
                    <div className="tre-offer__title">{o.title}</div>
                    <div className="mnd-muted" style={{ fontSize: 12.5, fontWeight: 300, marginTop: 2 }}>{o.sub}</div>
                    <div className="tre-offer__meta">
                      <div>
                        <div className="tre-offer__meta-label">Qui la voit</div>
                        <div className="tre-offer__meta-value">{o.audience}</div>
                      </div>
                      <div>
                        <div className="tre-offer__meta-label">Jours</div>
                        <div className="tre-offer__meta-value" style={{ color: 'var(--ink)' }}>{daysLabel(o)}</div>
                      </div>
                      <div>
                        <div className="tre-offer__meta-label">Heures</div>
                        <div className="tre-offer__meta-value" style={{ color: 'var(--ink)' }}>{o.heureDebut} – {o.heureFin}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none', width: 160 }}>
                    <Button size="sm" onClick={() => setOffers((prev) => prev.map((x) => (x.id === o.id ? { ...x, active: !x.active } : x)))}>
                      {o.active ? 'Mettre hors ligne' : 'Mettre en ligne'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEditOffer(o)}>Modifier</Button>
                    <button className="tre-link-btn" style={{ color: 'var(--ink-soft)' }} onClick={() => setOffers((prev) => prev.filter((x) => x.id !== o.id))}>
                      Retirer
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'auto' && (
        <div>
          <div className="tr-grid tr-grid--3" style={{ marginBottom: 16 }}>
            <Card filet="copper" style={{ padding: 16 }}>
              <div className="mnd-stat__label">Automatisations actives</div>
              <div className="mnd-stat__value" style={{ fontSize: 28 }}>{activeCount} / {AUTOMATIONS.length}</div>
            </Card>
            <Card filet="indigo" style={{ padding: 16 }}>
              <div className="mnd-stat__label">Messages ce mois</div>
              <div className="mnd-stat__value" style={{ fontSize: 28 }}>{msgCount}</div>
            </Card>
            <Card filet="indigo" style={{ padding: 16 }}>
              <div className="mnd-stat__label">Taux d’action</div>
              <div className="mnd-stat__value" style={{ fontSize: 28 }}>31 %</div>
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {AUTOMATIONS.map((a) => (
              <Card key={a.id} style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', gap: 18, opacity: isOn(a.id) ? 1 : 0.55 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, background: 'var(--color-sable)', borderRadius: 2, padding: '7px 11px' }}>{a.trig}</span>
                  <span style={{ color: 'var(--color-copper)' }}>→</span>
                  <span style={{ fontSize: 12.5, color: 'var(--color-indigo)' }}>{a.act}</span>
                </div>
                <Pill tone="muted">{a.canal}</Pill>
                <span className="mnd-muted" style={{ fontSize: 11.5, flex: 'none', width: 110, textAlign: 'right' }}>{a.runs} ce mois</span>
                <Toggle on={isOn(a.id)} onToggle={() => setAutoActive((prev) => ({ ...prev, [a.id]: !isOn(a.id) }))} />
              </Card>
            ))}
          </div>

          <Card style={{ marginTop: 18, padding: '22px 24px' }}>
            <Eyebrow>Automatisations · informations pour l’IA</Eyebrow>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)', marginTop: 6 }}>Liens configurables.</div>
            <p className="mnd-muted" style={{ fontSize: 12, marginTop: 3, maxWidth: 640, lineHeight: 1.6 }}>
              Le lien MoMo, l’itinéraire et le lien d’avis Google sont insérés tels quels dans les messages automatiques — rappels, relances, invitations. Ils se règlent aussi dans Paramètres → Automatisations.
            </p>
            <div className="tr-grid tr-grid--2" style={{ marginTop: 16 }}>
              <Field label="Lien de paiement MoMo">
                <Input value={autoCfg.momoLink} placeholder="https://momo.example/pay/salon" onChange={(e) => setAutoCfg({ ...autoCfg, momoLink: e.target.value })} />
              </Field>
              <Field label="Lien Google Maps · itinéraire">
                <Input value={autoCfg.mapsLink} placeholder="https://maps.google.com/?q=…" onChange={(e) => setAutoCfg({ ...autoCfg, mapsLink: e.target.value })} />
              </Field>
              <Field label="Lien Google Avis">
                <Input value={autoCfg.reviewLink} placeholder="https://g.page/r/…/review" onChange={(e) => setAutoCfg({ ...autoCfg, reviewLink: e.target.value })} />
              </Field>
              <Field label="Itinéraire · texte libre">
                <Textarea
                  rows={2}
                  value={autoCfg.itineraire}
                  placeholder="Ex. En face de la pharmacie Fifadji, portail vert, 2ᵉ étage."
                  onChange={(e) => setAutoCfg({ ...autoCfg, itineraire: e.target.value })}
                />
              </Field>
            </div>
          </Card>
        </div>
      )}

      {tab === 'audience' && (
        <Card style={{ overflow: 'hidden' }}>
          <div className="mnd-scroll-x">
            <table className="tre-table">
              <thead>
                <tr><th>Segment prédictif</th><th>Taille</th><th>Valeur moy.</th><th>Propension à réserver</th><th>Moment idéal</th></tr>
              </thead>
              <tbody>
                {AUDIENCE_ROWS.map((a) => (
                  <tr key={a.seg}>
                    <td><span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{a.seg}</span></td>
                    <td>{a.size}</td>
                    <td className="num">{a.valeur}</td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Bar pct={a.prop} fill={a.prop >= 75 ? 'var(--color-copper)' : 'var(--indigo-400, #5B5F94)'} />
                        <span className="mnd-muted" style={{ fontSize: 11.5 }}>{a.prop} %</span>
                      </span>
                    </td>
                    <td className="mnd-copper" style={{ fontSize: 12 }}>{a.moment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {offerModal && (
        <Modal title={offerEditId ? 'Modifier l’offre instantanée.' : 'Nouvelle offre instantanée.'} onClose={() => setOfferModal(false)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Prestation / offre">
              <Input value={offerForm.title} placeholder="Ex. Resserrage racines" onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })} />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Accroche">
                <Input value={offerForm.tag} placeholder="Ex. Offre éclair" onChange={(e) => setOfferForm({ ...offerForm, tag: e.target.value })} />
              </Field>
              <Field label="Avantage · remise">
                <Input value={offerForm.deal} placeholder="Ex. −25%" onChange={(e) => setOfferForm({ ...offerForm, deal: e.target.value })} />
              </Field>
            </div>
            <Field label="Détail">
              <Input value={offerForm.sub} placeholder="Ex. Sérum Densité offert" onChange={(e) => setOfferForm({ ...offerForm, sub: e.target.value })} />
            </Field>
            <Field label="Qui peut la voir · audience">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {OFFER_AUDIENCES.map((a) => (
                  <button key={a} className={`tre-chip ${offerForm.audience === a ? 'is-on' : ''}`} onClick={() => setOfferForm({ ...offerForm, audience: a })}>{a}</button>
                ))}
              </div>
            </Field>
            <Field label="Jours d’affichage">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {OFFER_DAYS.map((d) => (
                  <button key={d} className={`tre-chip ${offerForm.days.includes(d) ? 'is-on' : ''}`} onClick={() => toggleDay(d)}>{d}</button>
                ))}
              </div>
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Visible dès">
                <Select value={offerForm.heureDebut} onChange={(e) => setOfferForm({ ...offerForm, heureDebut: e.target.value })}>
                  {OFFER_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
              <Field label="Jusqu’à">
                <Select value={offerForm.heureFin} onChange={(e) => setOfferForm({ ...offerForm, heureFin: e.target.value })}>
                  {OFFER_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setOfferModal(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveOffer} disabled={!offerForm.title.trim()}>
                {offerEditId ? 'Enregistrer l’offre' : 'Publier l’offre'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
