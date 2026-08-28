import { asset } from '../../../../shared/asset';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OptionsPrestations, PageHead } from '../_ui';
import { Button, Card, Eyebrow, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import {
  useClients, useSegments, addSegment, renameSegment, removeSegment, estDePassage,
} from '../../../../shared/clients';
import { useInvoices, invoiceTotal } from '../../../../shared/finance';
import { useServices } from '../../../../shared/catalog';
import { useStore, uid } from '../../../../shared/store';
import { pushBroadcastClients } from '../../../../shared/push';
import {
  AUTOMATION_CANAUX, OFFER_AUDIENCES, OFFER_DAYS, OFFER_HOURS,
  automationsActiveStore, automationsStore, autoConfigStore, segmentNotesStore, useAutomations,
  useCampaigns, useOffers, offerLiveNow,
  type Automation, type AutomationCanal, type InstantOffer, type SegmentNote,
} from './data';
import { Pill, Tabs, Toggle } from './ui';
import './equipe.css';

type Tab = 'campagnes' | 'offres' | 'auto' | 'audience';

type OfferForm = {
  title: string; tag: string; deal: string; sub: string; audience: string;
  days: string[]; heureDebut: string; heureFin: string;
  serviceId: string; discountPct: string;
};

const emptyOffer: OfferForm = {
  title: '', tag: 'Offre éclair', deal: '', sub: '', audience: 'Tous',
  // Tous les jours par défaut (un salon travaille surtout le week-end) et large plage horaire.
  days: [...OFFER_DAYS], heureDebut: '08h', heureFin: '20h',
  serviceId: '', discountPct: '',
};

const campTone = (s: string): 'ok' | 'warn' | 'muted' => (s === 'Active' ? 'ok' : s === 'Programmée' ? 'warn' : 'muted');

export default function Marketing() {
  const { branch, currency } = useBranch();
  /* ?tab=auto — permet d'arriver droit sur les automatisations depuis ailleurs
     (bouton des Paramètres). Onglet inconnu → on retombe sur les campagnes. */
  const [params] = useSearchParams();
  const asked = params.get('tab');
  const [tab, setTab] = useState<Tab>(
    asked === 'auto' || asked === 'offres' || asked === 'audience' ? asked : 'campagnes',
  );
  const [campaigns] = useCampaigns();
  const [offers, setOffers] = useOffers();
  const [clients] = useClients();
  const [invoices] = useInvoices(); // valeur moyenne réelle par segment
  const [services] = useServices();
  const [autoActive, setAutoActive] = useStore(automationsActiveStore);
  const [automations, setAutomations] = useAutomations();
  const [autoCfg, setAutoCfg] = useStore(autoConfigStore);
  /* null = fermée ; objet = édition ; 'new' = création. */
  const [autoModal, setAutoModal] = useState<Automation | 'new' | null>(null);

  /* ----- Audience : la liste des segments s'édite ici ----- */
  const [segmentList] = useSegments();
  const [segNotes, setSegNotes] = useStore(segmentNotesStore);
  const [segEdit, setSegEdit] = useState<string | null>(null);
  const [segEditVal, setSegEditVal] = useState('');
  const [newSeg, setNewSeg] = useState('');

  const addNewSeg = () => {
    addSegment(newSeg);
    setNewSeg('');
  };

  const commitSegRename = (from: string) => {
    const to = segEditVal.trim();
    /* Renomme la liste ET les fiches taguées — voir `renameSegment`. Les notes
       suivent le nouveau nom, sinon la connaissance des maîtres serait perdue. */
    if (to && to !== from) {
      renameSegment(from, to);
      setSegNotes((prev) => {
        const note = prev[from];
        if (!note) return prev;
        const { [from]: _drop, ...rest } = prev;
        return { ...rest, [to]: note };
      });
    }
    setSegEdit(null);
    setSegEditVal('');
  };

  const dropSegment = (name: string, size: number) => {
    const msg = size > 0
      ? `Retirer « ${name} » ? ${size} fiche${size > 1 ? 's' : ''} le porte${size > 1 ? 'nt' : ''} : le tag sera retiré de ces fiches.`
      : `Retirer le segment « ${name} » ?`;
    if (!window.confirm(msg)) return;
    /* Ici on retire AUSSI des fiches : la table qu'on vient de lire montre
       combien sont touchées, la maison décide en connaissance de cause. */
    removeSegment(name, true);
    setSegNotes((prev) => {
      const { [name]: _drop, ...rest } = prev;
      return rest;
    });
  };

  const setNote = (seg: string, patch: SegmentNote) =>
    setSegNotes((prev) => ({ ...prev, [seg]: { ...(prev[seg] ?? {}), ...patch } }));
  const [offerModal, setOfferModal] = useState(false);
  const [offerEditId, setOfferEditId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState<OfferForm>(emptyOffer);
  const [notifBusy, setNotifBusy] = useState<string | null>(null);

  /* Diffuse une notification push à toutes les clientes abonnées pour cette offre. */
  const notifyOffer = async (o: InstantOffer) => {
    if (!window.confirm(`Notifier toutes les clientes de l’offre « ${o.title} » sur leur téléphone ?`)) return;
    setNotifBusy(o.id);
    const body = [o.deal, o.sub].filter(Boolean).join(' · ') || 'Une offre vous attend à la Maison.';
    const n = await pushBroadcastClients(`${o.tag} · ${o.title}`, body, '/couronne/');
    setNotifBusy(null);
    window.alert(
      n > 0
        ? `Notification envoyée à ${n} cliente${n > 1 ? 's' : ''} abonnée${n > 1 ? 's' : ''}.`
        : 'Aucune cliente n’a encore activé les notifications sur Ma Couronne.',
    );
  };

  const branchCampaigns = useMemo(() => campaigns.filter((c) => c.branchId === branch.id), [campaigns, branch.id]);
  const branchOffers = useMemo(() => offers.filter((o) => o.branchId === branch.id), [offers, branch.id]);

  /* — audience : segments réels des têtes couronnées de la branche — */
  /* L'audience est pilotée par la LISTE gérable, pas seulement par les segments
     déjà portés : un segment fraîchement créé doit apparaître (taille 0) pour
     qu'on puisse le nommer et l'annoter avant la première cliente.
     Un segment orphelin (porté par des fiches mais absent de la liste) est
     montré quand même — le taire reviendrait à cacher des clientes. */
  const audienceRows = useMemo(() => {
    /* UNE AUDIENCE EST UNE LISTE DE GENS À QUI L'ON ÉCRIT. Les clientes de
       passage n'en font pas partie : leur écrire, c'est du bruit — et le bruit
       fait ignorer tous les messages suivants, y compris ceux qui comptent.
       Elles gonfleraient aussi la taille et fausseraient la valeur moyenne du
       segment. Voir `Client.dePassage`. */
    const inBranch = clients.filter((c) => c.branchId === branch.id && !c.archived && !estDePassage(c));
    const size = new Map<string, number>();
    const spend = new Map<string, number>();
    inBranch.forEach((c) => {
      const paid = invoices
        .filter((i) => i.clientId === c.id && i.kind === 'facture' && i.status === 'payée')
        .reduce((s, i) => s + invoiceTotal(i), 0);
      c.segments.forEach((s) => {
        size.set(s, (size.get(s) ?? 0) + 1);
        spend.set(s, (spend.get(s) ?? 0) + paid);
      });
    });
    const orphans = Array.from(size.keys()).filter((s) => !segmentList.includes(s));
    return [...segmentList, ...orphans]
      .map((seg) => {
        const n = size.get(seg) ?? 0;
        return {
          seg,
          size: n,
          /* Valeur moyenne réelle : factures payées des clientes du segment.
             « — » tant qu'aucune n'a payé — la maison n'invente pas un panier. */
          value: n > 0 ? Math.round((spend.get(seg) ?? 0) / n) : 0,
          orphan: !segmentList.includes(seg),
        };
      })
      .sort((a, b) => b.size - a.size || a.seg.localeCompare(b.seg));
  }, [clients, invoices, branch.id, segmentList]);

  const serviceName = (id?: string) => (id ? services.find((s) => s.id === id)?.name ?? 'Prestation retirée du catalogue' : '');

  const isOn = (id: string) => autoActive[id] !== false;
  const activeCount = automations.filter((a) => isOn(a.id)).length;
  const msgCount = automations.filter((a) => isOn(a.id)).reduce((s, a) => s + a.runs, 0);

  /** Enregistre une automatisation (création ou édition). */
  const saveAutomation = (a: Automation) => {
    setAutomations((prev) => (prev.some((x) => x.id === a.id) ? prev.map((x) => (x.id === a.id ? a : x)) : [...prev, a]));
    setAutoModal(null);
  };

  /** Retire l'automatisation ET son interrupteur — sans quoi l'état resterait
      orphelin dans `mnd_automations_active` et ressusciterait un id recréé. */
  const removeAutomation = (id: string) => {
    setAutomations((prev) => prev.filter((x) => x.id !== id));
    setAutoActive((prev) => {
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
    setAutoModal(null);
  };

  const openNewOffer = () => { setOfferEditId(null); setOfferForm(emptyOffer); setOfferModal(true); };
  const openEditOffer = (o: InstantOffer) => {
    setOfferEditId(o.id);
    setOfferForm({
      title: o.title, tag: o.tag, deal: o.deal, sub: o.sub, audience: o.audience,
      days: [...o.days], heureDebut: o.heureDebut, heureFin: o.heureFin,
      serviceId: o.serviceId ?? '', discountPct: o.discountPct != null ? String(o.discountPct) : '',
    });
    setOfferModal(true);
  };
  const saveOffer = () => {
    if (!offerForm.title.trim()) return;
    const disc = parseInt(offerForm.discountPct, 10);
    const payload = {
      title: offerForm.title.trim(), tag: offerForm.tag, deal: offerForm.deal, sub: offerForm.sub,
      audience: offerForm.audience, days: [...offerForm.days], heureDebut: offerForm.heureDebut, heureFin: offerForm.heureFin,
      serviceId: offerForm.serviceId || undefined,
      discountPct: Number.isFinite(disc) && disc > 0 ? Math.min(90, disc) : undefined,
    };
    if (offerEditId) {
      setOffers((prev) => prev.map((o) => (o.id === offerEditId ? { ...o, ...payload } : o)));
    } else {
      setOffers((prev) => [...prev, { id: `of-${uid()}`, branchId: branch.id, active: true, ...payload }]);
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
        actions={
          tab === 'offres' ? <Button variant="copper" onClick={openNewOffer}>+ Offre instantanée</Button>
          : tab === 'auto' ? <Button variant="copper" onClick={() => setAutoModal('new')}>+ Automatisation</Button>
          : undefined
        }
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
          <div className="tre-deep" style={{ marginBottom: 16 }}>
            <div>
              <div className="tre-deep__eyebrow">Intelligence, en attente de vécu</div>
              <div className="tre-deep__body">
                L’intelligence attend l’activité de la maison.
                <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 300, fontSize: 12.5, color: 'rgba(246,241,231,.7)', marginTop: 5 }}>
                  Les propositions de campagne naîtront des rendez-vous, des ventes et du Cercle, jamais d’invention.
                </div>
              </div>
            </div>
          </div>

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
              Promotions instantanées poussées dans <span style={{ color: 'var(--color-indigo)' }}>Ma Couronne</span>, vous choisissez les jours, les heures et qui les voit.
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
                      {/* Statut HONNÊTE : « En ligne » seulement si visible MAINTENANT côté
                          cliente ; « Programmée » si active mais hors de sa fenêtre jour/heure
                          (les jours/heures ci-dessous disent quand elle apparaîtra). */}
                      <Pill tone={!o.active ? 'muted' : offerLiveNow(o) ? 'ok' : 'warn'}>
                        {!o.active ? 'Hors ligne' : offerLiveNow(o) ? 'En ligne' : 'Programmée'}
                      </Pill>
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
                      <div>
                        <div className="tre-offer__meta-label">Prestation liée</div>
                        <div className="tre-offer__meta-value" style={{ color: 'var(--ink)' }}>{o.serviceId ? serviceName(o.serviceId) : '—'}</div>
                      </div>
                      <div>
                        <div className="tre-offer__meta-label">Remise appliquée</div>
                        <div className="tre-offer__meta-value" style={{ color: 'var(--copper-700)' }}>{o.discountPct ? `−${o.discountPct} %` : '—'}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none', width: 160 }}>
                    <Button size="sm" onClick={() => setOffers((prev) => prev.map((x) => (x.id === o.id ? { ...x, active: !x.active } : x)))}>
                      {o.active ? 'Mettre hors ligne' : 'Mettre en ligne'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEditOffer(o)}>Modifier</Button>
                    <Button size="sm" variant="copper" disabled={notifBusy === o.id} onClick={() => void notifyOffer(o)}>
                      {notifBusy === o.id ? 'Envoi…' : 'Notifier les clientes'}
                    </Button>
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
              <div className="mnd-stat__value" style={{ fontSize: 28 }}>{activeCount} / {automations.length}</div>
            </Card>
            <Card filet="indigo" style={{ padding: 16 }}>
              <div className="mnd-stat__label">Messages ce mois</div>
              <div className="mnd-stat__value" style={{ fontSize: 28 }}>{msgCount > 0 ? msgCount : '—'}</div>
            </Card>
            <Card filet="indigo" style={{ padding: 16 }}>
              <div className="mnd-stat__label">Taux d’action</div>
              <div className="mnd-stat__value" style={{ fontSize: 28 }}>—</div>
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {automations.length === 0 && (
              <Card style={{ padding: '22px 24px' }}>
                <p className="mnd-muted" style={{ fontSize: 12.5, margin: 0 }}>
                  Aucune automatisation. Créez-en une, la maison parlera d’une seule voix.
                </p>
              </Card>
            )}
            {automations.map((a) => (
              <Card key={a.id} style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', gap: 18, opacity: isOn(a.id) ? 1 : 0.55 }}>
                <button
                  type="button"
                  onClick={() => setAutoModal(a)}
                  title="Modifier cette automatisation"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 14, minWidth: 0,
                    flexWrap: 'wrap', background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', textAlign: 'left', font: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 12.5, background: 'var(--color-sable)', borderRadius: 2, padding: '7px 11px' }}>{a.trig}</span>
                  <span style={{ color: 'var(--color-copper)' }}>→</span>
                  <span style={{ fontSize: 12.5, color: 'var(--color-indigo)' }}>{a.act}</span>
                </button>
                <Pill tone="muted">{a.canal}</Pill>
                <span className="mnd-muted" style={{ fontSize: 11.5, flex: 'none', width: 110, textAlign: 'right' }}>{a.runs > 0 ? `${a.runs} ce mois` : '—'}</span>
                <Toggle on={isOn(a.id)} onToggle={() => setAutoActive((prev) => ({ ...prev, [a.id]: !isOn(a.id) }))} />
              </Card>
            ))}
          </div>

          <Card style={{ marginTop: 18, padding: '22px 24px' }}>
            <Eyebrow>Automatisations · informations pour l’IA</Eyebrow>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)', marginTop: 6 }}>Liens configurables.</div>
            <p className="mnd-muted" style={{ fontSize: 12, marginTop: 3, maxWidth: 640, lineHeight: 1.6 }}>
              Le lien MoMo, l’itinéraire et le lien d’avis Google sont insérés tels quels dans les messages automatiques, rappels, relances, invitations. Ils se règlent aussi dans Paramètres → Automatisations.
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
        <div>
          <Card style={{ overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table">
                <thead>
                  <tr>
                    <th>Segment</th><th>Taille</th><th>Valeur moy.</th>
                    <th>Propension à réserver</th><th>Moment idéal</th><th />
                  </tr>
                </thead>
                <tbody>
                  {audienceRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="mnd-muted" style={{ textAlign: 'center', padding: 28 }}>
                        Aucun segment, nommez le premier ci-dessous, l’audience se dessinera avec les têtes couronnées.
                      </td>
                    </tr>
                  )}
                  {audienceRows.map((a) => {
                    const note = segNotes[a.seg] ?? {};
                    return (
                      <tr key={a.seg}>
                        <td>
                          {segEdit === a.seg ? (
                            <Input
                              autoFocus
                              value={segEditVal}
                              onChange={(e) => setSegEditVal(e.target.value)}
                              onBlur={() => commitSegRename(a.seg)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitSegRename(a.seg);
                                if (e.key === 'Escape') setSegEdit(null);
                              }}
                              style={{ maxWidth: 190 }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="tre-segname"
                              title="Renommer, les fiches taguées suivent"
                              onClick={() => { setSegEdit(a.seg); setSegEditVal(a.seg); }}
                            >
                              {a.seg}
                              {a.orphan && <span className="tre-orphan" title="Porté par des fiches mais absent de la liste">hors liste</span>}
                            </button>
                          )}
                        </td>
                        <td>{a.size}</td>
                        <td className={a.value > 0 ? 'num' : 'num mnd-muted'}>
                          {a.value > 0 ? fmtMoney(a.value, currency) : '—'}
                        </td>
                        <td>
                          <Input
                            value={note.propension ?? ''}
                            placeholder="—"
                            onChange={(e) => setNote(a.seg, { propension: e.target.value })}
                            style={{ maxWidth: 180 }}
                          />
                        </td>
                        <td>
                          <Input
                            value={note.moment ?? ''}
                            placeholder="—"
                            onChange={(e) => setNote(a.seg, { moment: e.target.value })}
                            style={{ maxWidth: 180 }}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="tre-segdel" title="Retirer ce segment" onClick={() => dropSegment(a.seg, a.size)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
              <Input
                value={newSeg}
                placeholder="Nommer un segment, ex. Diaspora Paris"
                onChange={(e) => setNewSeg(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addNewSeg(); }}
                style={{ maxWidth: 260 }}
              />
              <Button variant="ghost" onClick={addNewSeg}>+ Segment</Button>
              <span className="mnd-muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
                Taille et valeur viennent du vécu · propension et moment sont la parole des maîtres.
              </span>
            </div>
          </Card>
        </div>
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
            <div className="tr-grid tr-grid--2">
              <Field label="Prestation liée · réservable en un geste">
                <Select value={offerForm.serviceId} onChange={(e) => setOfferForm({ ...offerForm, serviceId: e.target.value })}>
                  <option value="">Aucune, offre libre</option>
                  <OptionsPrestations services={services} prix devise={currency} />
                </Select>
              </Field>
              <Field label="Remise (%) · appliquée au prix">
                <Input
                  inputMode="numeric"
                  value={offerForm.discountPct}
                  placeholder="Ex. 25"
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                    setOfferForm({ ...offerForm, discountPct: raw });
                  }}
                />
              </Field>
            </div>
            <Field label="Qui peut la voir · audience">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {OFFER_AUDIENCES.map((a) => (
                  <button key={a} className={`tre-chip ${offerForm.audience === a ? 'is-on' : ''}`} onClick={() => setOfferForm({ ...offerForm, audience: a })}>{a}</button>
                ))}
              </div>
            </Field>
            <Field label="Jours d’affichage">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                <button
                  className={`tre-chip ${offerForm.days.length === OFFER_DAYS.length ? 'is-on' : ''}`}
                  onClick={() => setOfferForm((f) => ({ ...f, days: [...OFFER_DAYS] }))}
                >
                  Tous les jours
                </button>
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

      {autoModal && (
        <AutomationModal
          initial={autoModal === 'new' ? null : autoModal}
          onSave={saveAutomation}
          onRemove={removeAutomation}
          onClose={() => setAutoModal(null)}
        />
      )}
    </div>
  );
}

/* ---------- Créer / modifier une automatisation ---------- */
function AutomationModal({
  initial, onSave, onRemove, onClose,
}: {
  initial: Automation | null;
  onSave: (a: Automation) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [trig, setTrig] = useState(initial?.trig ?? '');
  const [act, setAct] = useState(initial?.act ?? '');
  const [canal, setCanal] = useState<AutomationCanal>(initial?.canal ?? 'WhatsApp');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!trig.trim()) { setError('Indiquez le déclencheur.'); return; }
    if (!act.trim()) { setError('Indiquez l’action.'); return; }
    onSave({
      id: initial?.id ?? `au-${uid()}`,
      trig: trig.trim(),
      act: act.trim(),
      canal,
      /* Le compteur d'envois appartient à l'usage, pas au formulaire. */
      runs: initial?.runs ?? 0,
    });
  };

  return (
    <Modal title={initial ? 'Modifier l’automatisation.' : 'Nouvelle automatisation.'} onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Déclencheur, quand ?">
          <Input
            value={trig}
            placeholder="Ex. Anniversaire · le jour même"
            onChange={(e) => { setTrig(e.target.value); setError(null); }}
          />
        </Field>
        <Field label="Action, quoi ?">
          <Input
            value={act}
            placeholder="Ex. Mot d’anniversaire + geste du Cercle"
            onChange={(e) => { setAct(e.target.value); setError(null); }}
          />
        </Field>
        <Field label="Canal">
          <Select value={canal} onChange={(e) => setCanal(e.target.value as AutomationCanal)}>
            {AUTOMATION_CANAUX.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>

        {error && <div className="mnd-muted" style={{ fontSize: 12, color: 'var(--copper-700)' }}>{error}</div>}

        <p className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0 }}>
          La maison consigne l’automatisation et son interrupteur. L’envoi lui-même n’est pas
          encore câblé, aucun message ne partira tant que le canal ne sera pas relié.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {initial ? (
            <Button variant="ghost" onClick={() => onRemove(initial.id)}>Retirer</Button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={onClose}>Annuler</Button>
            <Button variant="copper" onClick={submit}>{initial ? 'Enregistrer' : 'Créer'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
