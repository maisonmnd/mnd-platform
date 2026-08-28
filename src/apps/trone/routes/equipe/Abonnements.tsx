import { useEffect, useMemo, useState } from 'react';
import { OptionsPrestations, PageHead, WaLien } from '../_ui';
import { Button, Card, Eyebrow, Field, Input, Modal, Select, Textarea, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { usePaymentMethods } from '../../../../shared/finance';
import {
  shortDate, anciennete, usePlans, useSubscribers, ensureStarterPlans, ensureStarterPlanIncluded,
  subCycleAmountXof, subMonthlyXof, subPaid, cycleDays, cycleLabel,
  subServiceUsage, cycleWindow, poseLesFormulesMarketing, formulesMarketingAbsentes, FAMILLES_FORMULES,
  type Plan, type Subscriber, type Payment, type SubCycle, type PlanIncluded, type FamilleFormule,
} from './data';
import { useServices } from '../../../../shared/catalog';
import { useAppointments } from '../../../../shared/agenda';
 import { DECOUPES, SEUIL_ECHELONNEMENT_XOF, construitEcheancier, etatDesEcheances, enRetardXof, peutEtreEchelonne, prochaineEcheance, resteDeLEcheancier, type Decoupe } from '../../../../shared/echeancier';
import { REMISE_OPTION_PCT, RYTHMES, VOIES, libelleCouleur, partMensuelleXof, reprisesDeCouleur, supplementCouleurXof, supplementSansRemiseXof, voieDe, type RythmeCouleur, type VoieCouleur } from '../../../../shared/couleur';
import { ClientPicker, useBranchClients } from '../clients/_shared';
import { Bar, DeepNote, Pill, Tabs } from './ui';
import './equipe.css';

type Tab = 'moteur' | 'formules' | 'membres';

type PlanForm = { name: string; tag: string; price: string; line: string; perks: string; included: PlanIncluded[]; popular: boolean; famille: FamilleFormule | '' };
type SubForm = { clientId: string; planId: string; slot: string; cycle: SubCycle; parts: Decoupe | null; voie: VoieCouleur | ''; rythme: RythmeCouleur; couleurServiceId: string };
const CYCLES: SubCycle[] = ['mensuel', 'semestriel', 'annuel'];
type PayForm = { amount: string; date: string; method: string };
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
/** J+`days` depuis une date ISO donnée (midi local — insensible aux fuseaux). */
const addDaysFromISO = (iso: string, days: number) =>
  new Date(new Date(`${iso}T12:00:00`).getTime() + days * 86400000).toISOString().slice(0, 10);

export default function Abonnements() {
  const { branch, currency } = useBranch();
  const [plans, setPlans] = usePlans();
  const [subs, setSubs] = useSubscribers();
  const clients = useBranchClients();
  const [tab, setTab] = useState<Tab>('moteur');
  const [cycle, setCycle] = useState<SubCycle>('mensuel');
  const [planModal, setPlanModal] = useState(false);
  const [planEditId, setPlanEditId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>({ name: '', tag: '', price: '', line: '', perks: '', included: [], popular: false, famille: '' });
  const [services] = useServices();
  const [allAppts] = useAppointments();
  const [suiviFor, setSuiviFor] = useState<Subscriber | null>(null);
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? 'Prestation retirée';
  const [subModal, setSubModal] = useState(false);
  const [subForm, setSubForm] = useState<SubForm>({ clientId: '', planId: plans[0]?.id ?? '', slot: '', cycle: 'mensuel', parts: null, voie: '', rythme: 'reguliere', couleurServiceId: '' });
  const [methods] = usePaymentMethods();
  const [payFor, setPayFor] = useState<Subscriber | null>(null);
  const [payForm, setPayForm] = useState<PayForm>({ amount: '', date: '', method: '' });

  /* Pose les 6 formules signées de départ si la Maison n'en a aucune, puis dote
     ces formules de leurs prestations incluses (une fois, sans écraser les
     choix faits à l'écran). L'hydratation peut arriver après le 1er rendu :
     on repasse quand les formules changent tant que le marqueur n'est pas posé. */
  useEffect(() => { ensureStarterPlans(); ensureStarterPlanIncluded(); }, [plans]);

  const branchSubs = useMemo(() => subs.filter((m) => m.branchId === branch.id), [subs, branch.id]);
  const members = useMemo(() => branchSubs.filter((m) => m.status !== 'churn'), [branchSubs]);

  /* ── LES PARTIS, RETROUVABLES — 28 août ─────────────────────────────
     « Peux-tu retrouver les abonnements que j'avais auparavant ? » (Yéman).
     Ils étaient là, et l'écran ne les montrait plus.

     « Résilier » basculait le statut à `churn` d'un seul clic, SANS
     confirmation, et la ligne disparaissait pour toujours : le tableau ne
     lisait que les non-résiliés, et le nombre de partis ne vivait qu'en
     chiffre au fond de la carte Rétention. Rien n'était perdu en base, mais
     plus rien n'était atteignable depuis la Maison — ce qui revient au même
     pour qui tient le comptoir.

     Deux réparations, et la seconde est la vraie : le geste demande désormais
     confirmation, et LES PARTIS ONT LEUR LISTE, d'où l'on réabonne. Une
     résiliation est une décision, pas une suppression : la tête a payé, son
     histoire appartient à la Maison. */
  const partis = useMemo(() => branchSubs.filter((m) => m.status === 'churn'), [branchSubs]);
  const churned = partis.length;
  const [voirPartis, setVoirPartis] = useState(false);
  const [aResilier, setAResilier] = useState<Subscriber | null>(null);

  const resilier = (m: Subscriber) => {
    setSubs((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'churn' as const } : x)));
    setAResilier(null);
    setVoirPartis(true);
    toast('Abonnement résilié. Il reste dans « Les partis », vous pouvez le reprendre.');
  };
  /* On rend le statut « actif », jamais « nouveau » : elle n'est pas une
     nouvelle tête, elle revient. Le MRR repart avec elle. */
  const reprendre = (m: Subscriber) => {
    setSubs((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'active' as const } : x)));
    toast('Abonnement repris, la tête retrouve sa formule.');
  };
  const retention = branchSubs.length > 0 ? Math.round((members.length / branchSubs.length) * 100) : null;
  const mrr = members.reduce((a, m) => a + m.mrrXof, 0);
  const planOf = (id: string) => plans.find((p) => p.id === id);

  const split = plans.map((p) => {
    const list = members.filter((m) => m.planId === p.id);
    return { plan: p, count: list.length, mrr: list.reduce((a, m) => a + m.mrrXof, 0) };
  });
  const splitMax = Math.max(1, ...split.map((s) => s.count));

  /* Les formules marketing du 28 août : posées d'un geste, jamais réécrites. */
  const marketingAbsentes = formulesMarketingAbsentes(plans);
  const poserLesFormules = () => {
    const n = poseLesFormulesMarketing(new Set(services.map((s) => s.id)));
    toast(n > 0
      ? `${n} formule${n > 1 ? 's' : ''} posée${n > 1 ? 's' : ''}. Ajustez les prix et rattachez les prestations incluses.`
      : 'Elles sont déjà toutes là.');
  };

  const openPlanNew = () => {
    setPlanEditId(null);
    setPlanForm({ name: '', tag: '', price: '', line: '', perks: '', included: [], popular: false, famille: '' });
    setPlanModal(true);
  };
  const openPlanEdit = (p: Plan) => {
    setPlanEditId(p.id);
    setPlanForm({ name: p.name, tag: p.tag, price: String(p.priceXof), line: p.line, perks: p.perks.join(' · '), included: p.included ? p.included.map((i) => ({ ...i })) : [], popular: !!p.popular, famille: p.famille ?? '' });
    setPlanModal(true);
  };
  const savePlan = () => {
    const priceXof = parseInt(planForm.price, 10) || 0;
    if (!planForm.name.trim() || priceXof <= 0) return;
    const perks = planForm.perks.split('·').map((s) => s.trim()).filter(Boolean);
    const included = planForm.included.filter((i) => i.serviceId);
    const featured = planForm.popular;
    /* Une SEULE formule vedette à la fois : l'activer retire la mise en avant des
       autres (la carte indigo perd son sens s'il y en a plusieurs). */
    if (planEditId) {
      setPlans((prev) => prev.map((p) =>
        p.id === planEditId
          ? { ...p, name: planForm.name.trim(), tag: planForm.tag, priceXof, line: planForm.line, perks, included, popular: featured, famille: planForm.famille || undefined }
          : (featured ? { ...p, popular: false } : p)));
    } else {
      setPlans((prev) => [
        ...(featured ? prev.map((p) => ({ ...p, popular: false })) : prev),
        { id: `pl-${uid()}`, name: planForm.name.trim(), tag: planForm.tag || 'Nouvelle formule', priceXof, line: planForm.line, perks, popular: featured, included, famille: planForm.famille || undefined },
      ]);
    }
    setPlanModal(false);
  };

  /* Prestations incluses — édition dans le formulaire de formule. */
  const addIncluded = (serviceId: string) => {
    if (!serviceId || planForm.included.some((i) => i.serviceId === serviceId)) return;
    setPlanForm((f) => ({ ...f, included: [...f.included, { serviceId, qty: 1 }] }));
  };
  const setIncludedQty = (serviceId: string, qty: number | null) =>
    setPlanForm((f) => ({ ...f, included: f.included.map((i) => (i.serviceId === serviceId ? { ...i, qty } : i)) }));
  const removeIncluded = (serviceId: string) =>
    setPlanForm((f) => ({ ...f, included: f.included.filter((i) => i.serviceId !== serviceId) }));

  /* Réordonner les formules — l'ordre du tableau EST l'ordre d'affichage. On
     échange une formule avec sa voisine pour la lire dans l'ordre voulu. */
  /* LE PARCOURS — les familles dans leur ordre, puis les orphelines. Une
     section vide ne s'affiche pas : un titre sans rien dessous fait croire à
     un chargement qui n'arrive jamais. */
  const parFamille = useMemo(() => {
    const groupes = FAMILLES_FORMULES
      .map((f) => ({ ...f, liste: plans.filter((p) => p.famille === f.k) }))
      .filter((g) => g.liste.length > 0);
    const orphelines = plans.filter((p) => !p.famille || !FAMILLES_FORMULES.some((f) => f.k === p.famille));
    return orphelines.length > 0
      ? [...groupes, {
        k: 'autres' as const, titre: 'Les autres formules', quand: 'les vôtres',
        sous: 'Rangez-les dans un moment du parcours en les modifiant, elles remonteront d’elles-mêmes.',
        liste: orphelines,
      }]
      : groupes;
  }, [plans]);

  const movePlan = (id: string, dir: -1 | 1) => {
    setPlans((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  /* ── L'OPTION COULEUR, ACCROCHÉE À LA FORMULE ───────────────────────
     « J'ai de plus en plus de jeunes dames dans la quarantaine, cinquantaine,
     qui bataillent avec leurs cheveux blancs » (Yéman, 28 août).

     LA COULEUR SUIT LE RESSERRAGE, jamais le lavage : on reprend les racines
     quand on reprend les racines. Le nombre de reprises se compte donc sur le
     quota de l'atelier d'ENTRETIEN (GBÈJÍ™), pas sur le plus gros quota de la
     formule — L'Année Fraîche porte douze lavages et six resserrages, elle
     donne six reprises et non douze. */
  const ATELIER_ENTRETIEN = 'atl-ii-gbeji';
  const ATELIER_COULEUR = 'atl-iii-yekpe';
  const svcDe = (id: string) => services.find((s) => s.id === id);

  const venuesDeLaFormule = (p: Plan): number => {
    const inc = p.included ?? [];
    const entretien = inc.filter((i) => svcDe(i.serviceId)?.categoryId === ATELIER_ENTRETIEN);
    const source = entretien.length > 0 ? entretien : inc;
    const q = source.reduce((m, i) => Math.max(m, i.qty ?? 0), 0);
    /* Sans prestation rattachée, un cycle porte au moins UNE venue ; un pack,
       lui, ne se devine pas — il faut savoir combien de crédits il donne. */
    return q > 0 ? q : (p.mode === 'pack' ? 0 : 1);
  };
  /* Les mois que couvre un règlement, pour ramener l'option au MRR. */
  const moisCouverts = (p: Plan, c: SubCycle): number =>
    (p.mode === 'pack' ? Math.max(1, Math.round((p.validityDays ?? 365) / 30))
      : c === 'annuel' ? 12 : c === 'semestriel' ? 6 : 1);

  /* Les prestations de l'atelier couleur — celles qu'on peut rattacher à une voie. */
  const servicesCouleur = useMemo(
    () => services.filter((s) => s.categoryId === ATELIER_COULEUR),
    [services],
  );
  /* La prestation retenue pour la voie choisie : celle demandée, sinon celle
     que la voie attend, sinon la première de l'atelier. Jamais rien d'inventé. */
  const serviceDeLaVoie = (voie: VoieCouleur | ''): string => {
    if (!voie) return '';
    if (subForm.couleurServiceId && svcDe(subForm.couleurServiceId)) return subForm.couleurServiceId;
    const attendu = voieDe(voie).serviceIdDefaut;
    return svcDe(attendu) ? attendu : (servicesCouleur[0]?.id ?? '');
  };

  /* Ce que l'option coûterait, à l'instant où on le lit — jamais un prix figé. */
  const chiffreLOption = (p: Plan | undefined, c: SubCycle) => {
    if (!p || !subForm.voie) return null;
    const serviceId = serviceDeLaVoie(subForm.voie);
    const prix = svcDe(serviceId)?.priceXof ?? 0;
    const venues = venuesDeLaFormule(p);
    const reprises = reprisesDeCouleur(venues, subForm.rythme);
    return {
      serviceId, prix, venues, reprises,
      supplement: supplementCouleurXof(reprises, prix),
      plein: supplementSansRemiseXof(reprises, prix),
      mois: moisCouverts(p, c),
    };
  };

  const saveSub = () => {
    const plan = planOf(subForm.planId);
    const client = clients.find((c) => c.id === subForm.clientId);
    if (!client || !plan) return;
    const cycle = subForm.cycle;
    const opt = chiffreLOption(plan, cycle);
    /* Le total À DÉCOUPER inclut l'option : elle se paie avec l'abonnement,
       pas à côté. La découper séparément ferait deux échéanciers à suivre. */
    const totalXof = subCycleAmountXof(plan.priceXof, cycle) + (opt?.supplement ?? 0);
    const nm: Subscriber = {
      id: `ab-${uid()}`, branchId: branch.id, clientId: client.id, name: client.name, planId: plan.id,
      cycle,
      slot: subForm.slot.trim() || 'Créneau à réserver',
      nextIso: addDaysISO(cycleDays(cycle)),
      sinceIso: todayISO(), since: 'ce mois', status: 'new', payments: [],
      /* Le MRR porte l'option, ramenée au mois : un supplément annuel non
         normalisé gonflerait le revenu récurrent du mois de la signature,
         puis disparaîtrait des mois suivants. */
      mrrXof: subMonthlyXof(plan.priceXof, cycle) + (opt ? partMensuelleXof(opt.supplement, opt.mois) : 0),
      ...(opt && opt.supplement > 0
        ? { couleur: { voie: subForm.voie as VoieCouleur, rythme: subForm.rythme, serviceId: opt.serviceId, supplementXof: opt.supplement } }
        : {}),
      /* L'ÉCHÉANCIER S'ÉCRIT ICI, une seule fois. Au-delà de 100 000 F, la tête
         a pu choisir de payer en 2 ou 4 fois : la découpe est figée à la
         signature, comme une parole donnée. Elle ne se recalcule jamais. */
      ...(subForm.parts && peutEtreEchelonne(totalXof)
        ? { echeances: construitEcheancier(totalXof, subForm.parts, todayISO()) }
        : {}),
    };
    setSubs((prev) => [...prev, nm]);
    setSubModal(false);
    setSubForm({ clientId: '', planId: plans[0]?.id ?? '', slot: '', cycle: 'mensuel', parts: null, voie: '', rythme: 'reguliere', couleurServiceId: '' });
    if (nm.echeances) toast(`Abonnement signé, réglable en ${nm.echeances.length} fois.`);
  };

  /* Règlement d'un abonnement : paiement daté, échéance avancée, abonnée réactivée. */
  const openPay = (m: Subscriber) => {
    const plan = planOf(m.planId);
    /* Avec un échéancier, le montant proposé est celui de la PROCHAINE
       échéance, pas le cycle entier : c'est ce qu'on lui réclame aujourd'hui. */
    const suivante = m.echeances?.length
      ? prochaineEcheance(etatDesEcheances(m.echeances, subPaid(m), todayISO()))
      : undefined;
    const due = suivante ? suivante.resteXof
      : plan ? subCycleAmountXof(plan.priceXof, m.cycle ?? 'mensuel') : 0;
    setPayForm({ amount: String(due), date: todayISO(), method: methods[0] ?? '' });
    setPayFor(m);
  };

  /* L'état de paiement d'une abonnée, pour le tableau — dérivé, jamais stocké. */
  const etatPaiement = (m: Subscriber) => {
    if (!m.echeances?.length) return null;
    const etats = etatDesEcheances(m.echeances, subPaid(m), todayISO());
    const retard = enRetardXof(etats);
    const soldees = etats.filter((e) => e.soldee).length;
    return { retard, soldees, total: etats.length, reste: resteDeLEcheancier(etats) };
  };
  const savePay = () => {
    if (!payFor) return;
    const amount = parseInt(payForm.amount.replace(/[^0-9]/g, ''), 10) || 0;
    if (amount <= 0) return;
    const pmt: Payment = { id: `pay-${uid()}`, amountXof: amount, date: payForm.date || todayISO(), method: payForm.method || undefined };
    const cycle = payFor.cycle ?? 'mensuel';
    /* Échéance d'ANNIVERSAIRE : on avance depuis l'échéance précédente — payer en
       avance ne raccourcit plus le cycle, payer un peu en retard ne le décale plus.
       Très en retard (la nouvelle échéance serait déjà passée) : on repart
       d'aujourd'hui plutôt que de créer une échéance déjà échue. */
    const days = cycleDays(cycle);
    const base = /^\d{4}-\d{2}-\d{2}$/.test(payFor.nextIso) ? payFor.nextIso : todayISO();
    let next = addDaysFromISO(base, days);
    if (next <= todayISO()) next = addDaysISO(days);
    setSubs((prev) => prev.map((s) => (s.id === payFor.id
      ? { ...s, payments: [...(s.payments ?? []), pmt], status: s.status === 'churn' ? s.status : 'active', nextIso: next }
      : s)));
    setPayFor(null);
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
              ? <>{fmtMoney(mrr, currency)} sont déjà encaissés ce mois, <span className="accent">le salon classique vend une fois ; la Maison perçoit chaque lune.</span></>
              : <>Aucun abonnement encore, <span className="accent">le salon classique vend une fois ; la Maison percevra chaque lune.</span></>}
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
                {/* Le nombre de partis ne se contente plus d'être un chiffre :
                    il ouvre leur liste. */}
                {retention == null ? 'se mesurera avec l’usage' : churned === 0 ? 'aucune résiliation' : (
                  <button
                    type="button"
                    className="tre-link-btn"
                    onClick={() => { setVoirPartis(true); document.getElementById('trab-partis')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                  >
                    {churned} résiliation{churned > 1 ? 's' : ''} · les revoir
                  </button>
                )}
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
                  L’évolution du revenu récurrent se dessinera lune après lune, inscrivez la première abonnée, la courbe naîtra d’elle.
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
                  Un revenu qui revient seul vaut plus qu’un revenu qu’il faut reconquérir. Chaque abonné est une trésorerie prévisible, et un fauteuil déjà rempli.
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
              Offrez-vous le rituel. <span className="mnd-muted" style={{ fontStyle: 'normal', fontSize: 13, fontFamily: 'var(--font-sans)' }}>, pour vous, ou pour quelqu’un que vous aimez.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* LES FORMULES MARKETING, POSÉES D'UN GESTE — 28 août. Cinq
                  formulaires à remplir à la main, c'est cinq occasions de se
                  tromper de prix. Le bouton disparaît quand elles sont là :
                  une action qui ne fait plus rien ne doit plus s'offrir. */}
              {marketingAbsentes > 0 && (
                <Button size="sm" variant="ghost" onClick={poserLesFormules}>
                  Poser les {marketingAbsentes} formules marketing
                </Button>
              )}
              <Button size="sm" onClick={openPlanNew}>+ Nouvelle formule</Button>
              <div style={{ display: 'flex', background: 'var(--hover-veil)', borderRadius: 999, padding: 3 }}>
                {CYCLES.map((c) => (
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
                    {cycleLabel(c)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── LE PARCOURS, SECTION PAR SECTION (28 août) ──────────────
              Onze formules à plat dans une grille, c'était le mal des sept
              carrés de la page QR : rien ne disait laquelle sert quand. Les
              familles sont des MOMENTS DU PARCOURS, dans l'ordre où une tête
              les rencontre : elle entre par la porte, elle prolonge, elle
              amène son foyer, et le jour où elle fait confiance elle prend son
              année. Les formules sans famille ne disparaissent pas — elles se
              rangent en fin d'écran, sous « Les autres formules ». */}
          {parFamille.map((groupe) => (
            <section key={groupe.k} style={{ marginTop: 26 }}>
              <div className="tre-parcours">
                <h3 className="tre-parcours__titre">{groupe.titre}</h3>
                <span className="tre-parcours__quand">{groupe.quand}</span>
                <span className="tre-parcours__rule" />
              </div>
              <p className="tre-parcours__sous">{groupe.sous}</p>

              <div className="tr-grid tr-grid--3" style={{ alignItems: 'start' }}>
                {groupe.liste.map((p) => {
              const idx = plans.findIndex((x) => x.id === p.id);
              const price = subCycleAmountXof(p.priceXof, cycle);
              const period = cycle === 'annuel' ? '/an' : cycle === 'semestriel' ? '/6 mois' : '/mois';
              const offered = cycle === 'annuel' ? '2 mois offerts' : cycle === 'semestriel' ? '1 mois offert' : '';
              return (
                <Card key={p.id} className={`tre-plan ${p.popular ? 'tre-plan--popular' : ''}`}>
                  <div className="tre-reorder" role="group" aria-label="Réordonner la formule">
                    <button type="button" className="tre-reorder__btn" disabled={idx === 0} onClick={() => movePlan(p.id, -1)} title="Remonter" aria-label="Remonter la formule">▲</button>
                    <button type="button" className="tre-reorder__btn" disabled={idx === plans.length - 1} onClick={() => movePlan(p.id, 1)} title="Descendre" aria-label="Descendre la formule">▼</button>
                  </div>
                  {p.popular
                    ? <span className="tre-plan__tagpop">{p.tag}</span>
                    : <div className="mnd-eyebrow" style={{ fontSize: 9.5, color: 'var(--copper-700)' }}>{p.tag}</div>}
                  <div className="tre-plan__name" style={{ marginTop: p.popular ? 6 : 8 }}>{p.name}</div>
                  <div className="tre-plan__line">{p.line}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '10px 0 4px' }}>
                    <span className="tre-plan__price">{fmtMoney(price, currency)}</span>
                    <span style={{ fontSize: 12, color: p.popular ? 'rgba(246,241,231,.7)' : 'var(--ink-soft)' }}>{period}</span>
                  </div>
                  <div style={{ fontSize: 11, minHeight: 16, color: p.popular ? 'var(--copper-300)' : 'var(--copper-700)' }}>
                    {offered ? `soit ${fmtMoney(subMonthlyXof(p.priceXof, cycle), currency)}/mois · ${offered}` : ''}
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
            </section>
          ))}

          {/* L'OPTION COULEUR N'EST PAS UNE FORMULE : elle s'ajoute à
              n'importe laquelle. Lui donner sa propre carte l'aurait mise en
              concurrence avec les autres, alors qu'elle les accompagne. */}
          <div style={{
            marginTop: 26, padding: '16px 20px', borderRadius: 3,
            background: 'var(--copper-50)', border: '1px solid var(--copper-300)',
          }}>
            <div className="tre-parcours__quand" style={{ color: 'var(--copper-700)', fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', fontSize: 10 }}>
              Sur toutes les formules
            </div>
            <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-indigo)', margin: '5px 0 8px' }}>
              L’option couleur.
            </p>
            <div className="tr-grid tr-grid--2" style={{ gap: 14 }}>
              {VOIES.map((v) => (
                <div key={v.k}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{v.nom}</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-soft)' }}>{v.promesse}</div>
                  <div className="mnd-muted" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.55 }}>{v.dit}</div>
                </div>
              ))}
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 11, lineHeight: 1.6 }}>
              Deux rythmes au choix, à chaque venue ou une sur deux. Le supplément se calcule sur le prix du
              catalogue et se remise de {REMISE_OPTION_PCT} %. Elle se choisit à l’inscription d’une abonnée.
            </div>
          </div>

          <div className="mnd-muted" style={{ textAlign: 'center', fontSize: 11.5, marginTop: 22 }}>
            Chaque formule réserve un créneau <span style={{ color: 'var(--copper-700)' }}>rien qu’à vous</span>, prélèvement Mobile Money, sans paperasse, résiliable à tout moment.
          </div>
        </div>
      )}

      {tab === 'membres' && (
        <div>
          <div className="tre-actions-row">
            <div className="mnd-muted" style={{ fontSize: 13 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}>{members.length}</span> abonnés actifs · chacun avec son créneau réservé
            </div>
            <Button variant="copper" onClick={() => { setSubForm({ clientId: '', planId: plans[0]?.id ?? '', slot: '', cycle: 'mensuel', parts: null, voie: '', rythme: 'reguliere', couleurServiceId: '' }); setSubModal(true); }}>+ Nouvel abonné</Button>
          </div>

          <Card style={{ overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table tre-table--cards">
                <thead>
                  <tr><th>Tête couronnée</th><th>Formule · cycle</th><th>Son créneau · rien qu’à elle</th><th>Prochaine échéance</th><th style={{ textAlign: 'right' }}>MRR</th><th></th></tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const plan = planOf(m.planId);
                    const paid = subPaid(m);
                    return (
                    <tr key={m.id}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot(m.status), flex: 'none' }} />
                          <span>
                            <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{m.name}</span>
                            <span className="mnd-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, flexWrap: 'wrap' }}>
                              <span>abonnée depuis {m.sinceIso ? anciennete(m.sinceIso) : m.since}</span>
                              {(() => {
                                const cli = clients.find((c) => c.id === m.clientId);
                                return cli?.phone
                                  ? <WaLien phone={cli.phone} message={`Bonjour ${m.name.split(' ')[0]}, la Maison MND pense à vous au sujet de votre abonnement${plan ? ` « ${plan.name} »` : ''}.`} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--copper-700)' }} />
                                  : null;
                              })()}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td data-label="Formule">
                        <Pill tone={plan?.popular ? 'copper' : 'muted'}>{plan?.name ?? '—'}</Pill>
                        <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                          {cycleLabel(m.cycle ?? 'mensuel').split(' · ')[0]}
                          {(plan?.included?.length ?? 0) > 0 ? ` · ${plan!.included!.length} prestation${plan!.included!.length > 1 ? 's' : ''} incluse${plan!.included!.length > 1 ? 's' : ''}` : ''}
                        </div>
                        {/* L'OPTION COULEUR SE VOIT DANS LE TABLEAU : c'est
                            elle qui dit au maître ce qu'il doit préparer avant
                            que la dame s'asseye. */}
                        {m.couleur && (
                          <div style={{ fontSize: 10.5, marginTop: 3, color: 'var(--copper-700)', fontWeight: 500 }}>
                            {libelleCouleur(m.couleur)}
                            {m.couleur.supplementXof ? ` · + ${fmtMoney(m.couleur.supplementXof, currency)}` : ''}
                          </div>
                        )}
                      </td>
                      <td data-label="Son créneau" style={{ fontSize: 12.5 }}>{m.slot}</td>
                      <td data-label="Prochaine échéance">
                        <span style={{ fontSize: 12.5, color: m.status === 'risk' ? '#8f3b30' : undefined }}>{shortDate(m.nextIso)}</span>
                        <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 2 }}>réglé {fmtMoney(paid, currency)}</div>
                        {/* L'ÉTAT DE L'ÉCHÉANCIER SE LIT DANS LE TABLEAU, pas
                            seulement dans la modale : un retard qu'il faut
                            ouvrir une fiche pour voir n'est pas un retard vu. */}
                        {(() => {
                          const ep = etatPaiement(m);
                          if (!ep) return null;
                          return (
                            <div style={{
                              fontSize: 10.5, marginTop: 3, fontWeight: 500,
                              color: ep.retard > 0 ? 'var(--color-brique, #96412E)'
                                : ep.reste === 0 ? 'var(--color-vert, #2E6B4F)' : 'var(--copper-700)',
                            }}>
                              {ep.retard > 0
                                ? `${fmtMoney(ep.retard, currency)} en retard · ${ep.soldees}/${ep.total} échéances`
                                : ep.reste === 0
                                  ? `échéancier soldé · ${ep.total} fois`
                                  : `${ep.soldees}/${ep.total} échéances réglées`}
                            </div>
                          );
                        })()}
                        {m.note && <div style={{ fontSize: 10.5, color: '#8f3b30', marginTop: 2 }}>{m.note}</div>}
                      </td>
                      <td className="num" data-label="MRR" style={{ textAlign: 'right' }}>{fmtMoney(m.mrrXof, currency)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {(plan?.included?.length ?? 0) > 0 && (
                          <button className="tre-link-btn" style={{ marginRight: 10 }} onClick={() => setSuiviFor(m)}>Suivi</button>
                        )}
                        <button className="tre-link-btn" onClick={() => openPay(m)}>Régler</button>
                        <button
                          className="tre-link-btn tre-link-btn--danger"
                          style={{ marginLeft: 10 }}
                          onClick={() => setAResilier(m)}
                        >
                          Résilier
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                  {members.length === 0 && (
                    <tr><td colSpan={6} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucun abonné dans cette branche, le moteur attend sa première lune.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* LES PARTIS — la liste qui manquait. Un abonnement résilié n'est pas
              un abonnement effacé : la tête a payé, son histoire appartient à
              la Maison, et elle peut revenir. */}
          {partis.length > 0 && (
            <div style={{ marginTop: 18 }} id="trab-partis">
              <button
                type="button"
                onClick={() => setVoirPartis((v) => !v)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 500,
                  letterSpacing: '.04em', color: 'var(--copper-700)',
                }}
              >
                {voirPartis ? '▾' : '▸'} Les partis · {partis.length} abonnement{partis.length > 1 ? 's' : ''} résilié{partis.length > 1 ? 's' : ''}
              </button>

              {voirPartis && (
                <Card style={{ overflow: 'hidden', marginTop: 12 }}>
                  <div className="mnd-scroll-x">
                    <table className="tre-table tre-table--cards">
                      <thead>
                        <tr><th>Tête couronnée</th><th>Formule</th><th>Abonnée depuis</th><th style={{ textAlign: 'right' }}>MRR d’alors</th><th></th></tr>
                      </thead>
                      <tbody>
                        {partis.map((m) => (
                          <tr key={m.id}>
                            <td data-label="Tête couronnée">{m.name}</td>
                            <td data-label="Formule" className="mnd-muted">{planOf(m.planId)?.name ?? 'Formule retirée'}</td>
                            <td data-label="Depuis" className="mnd-muted">{m.sinceIso ? shortDate(m.sinceIso) : m.since}</td>
                            <td data-label="MRR" className="num" style={{ textAlign: 'right' }}>{fmtMoney(m.mrrXof, currency)}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button className="tre-link-btn" onClick={() => reprendre(m)}>Reprendre l’abonnement</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* LE GARDE-FOU. « Résilier » était un clic sec et sans retour : la ligne
          disparaissait, et rien dans l'écran ne disait où elle était allée. */}
      {aResilier && (
        <Modal title="Résilier cet abonnement ?" onClose={() => setAResilier(null)} width={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
              <b style={{ fontWeight: 500 }}>{aResilier.name}</b> quitte la formule
              {' '}{planOf(aResilier.planId)?.name ?? 'retirée'}. La Maison perd
              {' '}{fmtMoney(aResilier.mrrXof, currency)} de revenu mensuel.
            </p>
            <p className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.65, margin: 0 }}>
              Rien n’est effacé : l’abonnement rejoint « Les partis », sous le tableau, d’où vous
              pouvez le reprendre quand elle revient.
            </p>
            <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setAResilier(null)}>Garder l’abonnement</Button>
              <Button variant="copper" onClick={() => resilier(aResilier)}>Résilier</Button>
            </div>
          </div>
        </Modal>
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

            <Field label="Prestations incluses · suivi de consommation">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {planForm.included.length === 0 && (
                  <div className="mnd-muted" style={{ fontSize: 11.5 }}>
                    Aucune prestation liée. Ajoutez-en pour que l’abonnée puisse la consommer sans payer, avec un suivi par cycle.
                  </div>
                )}
                {planForm.included.map((i) => {
                  const unlimited = i.qty === null;
                  return (
                    <div key={i.serviceId} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 10px', background: 'var(--surface-card)' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--color-indigo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{serviceName(i.serviceId)}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>par {cycleLabel(cycle).split(' · ')[0].toLowerCase()}</span>
                      <Input
                        inputMode="numeric"
                        value={unlimited ? '' : String(i.qty)}
                        placeholder="∞"
                        disabled={unlimited}
                        onChange={(e) => setIncludedQty(i.serviceId, Math.max(1, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 1))}
                        style={{ width: 64, textAlign: 'center', flex: 'none' }}
                      />
                      <button
                        type="button"
                        className={`tre-chip ${unlimited ? 'is-on' : ''}`}
                        onClick={() => setIncludedQty(i.serviceId, unlimited ? 1 : null)}
                        title="Illimité sur le cycle"
                        style={{ flex: 'none' }}
                      >
                        ∞ illimité
                      </button>
                      <button onClick={() => removeIncluded(i.serviceId)} aria-label="Retirer" style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 13, flex: 'none' }}>✕</button>
                    </div>
                  );
                })}
                <Select
                  value=""
                  onChange={(e) => { addIncluded(e.target.value); e.currentTarget.value = ''; }}
                  style={{ borderStyle: 'dashed', color: 'var(--copper-600)' }}
                >
                  <option value="" disabled>+ Ajouter une prestation du catalogue…</option>
                  <OptionsPrestations
                    services={services}
                    exclure={(s) => planForm.included.some((i) => i.serviceId === s.id)}
                  />
                </Select>
                <div className="mnd-muted" style={{ fontSize: 10.5 }}>
                  Le compteur de consommation se lit sur le cycle en cours et se remet à zéro à chaque échéance.
                </div>
              </div>
            </Field>

            {/* LE MOMENT DU PARCOURS — pour que les formules de la Maison
                puissent rejoindre les sections au lieu de rester en fin
                d'écran. Le champ dit à quel instant on la propose, pas à
                quel rayon elle appartient. */}
            <Field label="Le moment du parcours">
              <Select
                value={planForm.famille}
                onChange={(e) => setPlanForm({ ...planForm, famille: e.target.value as FamilleFormule | '' })}
              >
                <option value="">Aucun, elle se range à part</option>
                {FAMILLES_FORMULES.map((f) => (
                  <option key={f.k} value={f.k}>{f.titre} · {f.quand}</option>
                ))}
              </Select>
            </Field>

            <Field label="Mise en avant">
              <button
                type="button"
                className={`tre-chip ${planForm.popular ? 'is-on' : ''}`}
                onClick={() => setPlanForm({ ...planForm, popular: !planForm.popular })}
              >
                {planForm.popular ? '★ Formule vedette' : '☆ Mettre en vedette'}
              </button>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                La formule vedette s’affiche sur une carte indigo mise en avant. Une seule à la fois : l’activer retire la mise en avant des autres.
              </div>
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

      {suiviFor && (() => {
        const plan = planOf(suiviFor.planId);
        const usage = subServiceUsage(suiviFor, plan, allAppts);
        const { start, end } = cycleWindow(suiviFor);
        return (
          <Modal title={`Suivi · ${suiviFor.name}`} onClose={() => setSuiviFor(null)} width={520}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="mnd-muted" style={{ fontSize: 12.5 }}>
                {plan?.name ?? '—'} · cycle en cours du {shortDate(start)} au {shortDate(end)}, le compteur repart à l’échéance.
              </div>
              {usage.length === 0 && (
                <div className="mnd-muted" style={{ fontSize: 12.5 }}>Cette formule n’inclut aucune prestation à suivre.</div>
              )}
              {usage.map((u) => {
                const unlimited = u.qty === null;
                const pct = unlimited ? 0 : Math.min(100, Math.round((u.used / Math.max(1, u.qty!)) * 100));
                const exhausted = !unlimited && (u.remaining ?? 0) <= 0;
                return (
                  <div key={u.serviceId} style={{ border: '1px solid var(--hairline)', borderRadius: 4, padding: '12px 14px', background: 'var(--surface-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 14, color: 'var(--color-indigo)' }}>{serviceName(u.serviceId)}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: exhausted ? '#8f3b30' : 'var(--copper-700)' }}>
                        {unlimited ? `${u.used} · illimité` : `${u.used} / ${u.qty} utilisée${u.qty! > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    {!unlimited && (
                      <>
                        <div className="tre-bar" style={{ marginTop: 8, height: 6, background: 'var(--hover-veil)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: exhausted ? '#8f3b30' : 'var(--color-copper)' }} />
                        </div>
                        <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5 }}>
                          {exhausted ? 'Allocation épuisée pour ce cycle' : `Reste ${u.remaining} sur ce cycle`}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              <div style={{ display: 'flex', marginTop: 4 }}>
                <Button variant="ghost" style={{ flex: 1 }} onClick={() => setSuiviFor(null)}>Fermer</Button>
              </div>
            </div>
          </Modal>
        );
      })()}

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
            <Field label="Cycle de facturation">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CYCLES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`tre-chip ${subForm.cycle === c ? 'is-on' : ''}`}
                    onClick={() => setSubForm({ ...subForm, cycle: c })}
                  >
                    {cycleLabel(c)}
                  </button>
                ))}
              </div>
              {planOf(subForm.planId) && (
                <div className="mnd-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {subForm.cycle === 'mensuel'
                    ? `${fmtMoney(planOf(subForm.planId)!.priceXof, currency)} / mois`
                    : `${fmtMoney(subCycleAmountXof(planOf(subForm.planId)!.priceXof, subForm.cycle), currency)} / ${subForm.cycle === 'annuel' ? 'an' : '6 mois'}, soit ${fmtMoney(subMonthlyXof(planOf(subForm.planId)!.priceXof, subForm.cycle), currency)} / mois`}
                </div>
              )}
            </Field>
            <Field label="Son créneau réservé">
              <Input value={subForm.slot} placeholder="Ex. Jeu · 14h00 · Yéman" onChange={(e) => setSubForm({ ...subForm, slot: e.target.value })} />
            </Field>

            {/* ── L'OPTION COULEUR, SUR TOUTES LES FORMULES ─────────────
                Deux voies parce que ces dames ne veulent pas la même chose :
                l'une veut que les blancs disparaissent, l'autre veut que son
                gris devienne beau. Deux rythmes parce que les blancs ne
                reviennent pas à la même vitesse chez toutes — c'est elle qui
                sait, pas la Maison. */}
            {(() => {
              const plan = planOf(subForm.planId);
              if (!plan) return null;
              const opt = chiffreLOption(plan, subForm.cycle);
              const venues = venuesDeLaFormule(plan);
              return (
                <Field label="L’option couleur · les cheveux blancs">
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`tre-chip ${subForm.voie === '' ? 'is-on' : ''}`}
                      onClick={() => setSubForm({ ...subForm, voie: '' })}
                    >
                      Aucune
                    </button>
                    {VOIES.map((v) => (
                      <button
                        key={v.k}
                        type="button"
                        className={`tre-chip ${subForm.voie === v.k ? 'is-on' : ''}`}
                        onClick={() => setSubForm({ ...subForm, voie: v.k })}
                        title={v.promesse}
                      >
                        {v.nom}
                      </button>
                    ))}
                  </div>

                  {subForm.voie && (
                    <>
                      <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-indigo)', margin: '11px 0 3px' }}>
                        {voieDe(subForm.voie).promesse}
                      </p>
                      <p className="mnd-muted" style={{ fontSize: 12, margin: '0 0 11px', lineHeight: 1.55 }}>
                        {voieDe(subForm.voie).dit}
                      </p>

                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {RYTHMES.map((r) => (
                          <button
                            key={r.k}
                            type="button"
                            className={`tre-chip ${subForm.rythme === r.k ? 'is-on' : ''}`}
                            onClick={() => setSubForm({ ...subForm, rythme: r.k })}
                          >
                            {r.nom} · {r.dit}
                          </button>
                        ))}
                      </div>

                      {/* LA PRESTATION SE CHOISIT, elle ne se suppose pas : le
                          catalogue de la Maison renomme et déplace, et une
                          option accrochée à une prestation disparue se
                          facturerait zéro sans rien dire. */}
                      <div style={{ marginTop: 10 }}>
                        <Select
                          value={serviceDeLaVoie(subForm.voie)}
                          onChange={(e) => setSubForm({ ...subForm, couleurServiceId: e.target.value })}
                          aria-label="La prestation qui sert cette voie"
                        >
                          {servicesCouleur.length === 0 && <option value="">Aucune prestation dans l’atelier couleur</option>}
                          <OptionsPrestations services={servicesCouleur} prix devise={currency} />
                        </Select>
                      </div>

                      <div style={{
                        marginTop: 11, padding: '11px 13px', borderRadius: 3,
                        background: 'var(--copper-50)', border: '1px solid var(--copper-300)',
                        fontSize: 12.5, lineHeight: 1.65,
                      }}>
                        {venues === 0 ? (
                          <span style={{ color: 'var(--color-brique, #96412E)' }}>
                            Cette formule ne dit pas combien de venues elle porte. Rattachez-lui ses prestations
                            incluses, l’option saura alors se chiffrer.
                          </span>
                        ) : opt && opt.supplement > 0 ? (
                          <>
                            <b style={{ fontWeight: 600 }}>
                              + {fmtMoney(opt.supplement, currency)}
                              {plan.mode === 'pack' ? ' pour l’année' : subForm.cycle === 'mensuel' ? ' par mois' : ' par cycle'}
                            </b>
                            {' · '}{opt.reprises} reprise{opt.reprises > 1 ? 's' : ''} sur {venues} venue{venues > 1 ? 's' : ''}
                            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                              {fmtMoney(opt.plein, currency)} à la carte, elle gagne {fmtMoney(opt.plein - opt.supplement, currency)}.
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--color-brique, #96412E)' }}>
                            Cette prestation n’a pas de prix au catalogue, l’option ne peut pas se chiffrer.
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </Field>
              );
            })()}

            {/* PAYER EN PLUSIEURS FOIS — la porte ne s'ouvre qu'au-delà de
                100 000 F. En dessous, quatre échéances coûtent plus cher à
                suivre qu'elles ne rapportent, et elles habituent la Maison à
                courir après des miettes. L'option couleur entre dans le total
                à découper : elle se paie AVEC l'abonnement, pas à côté. */}
            {(() => {
              const plan = planOf(subForm.planId);
              const supp = chiffreLOption(plan, subForm.cycle)?.supplement ?? 0;
              const total = (plan ? subCycleAmountXof(plan.priceXof, subForm.cycle) : 0) + supp;
              if (!peutEtreEchelonne(total)) return null;
              const apercu = subForm.parts ? construitEcheancier(total, subForm.parts, todayISO()) : [];
              return (
                <Field label={`Règlement · ${fmtMoney(total, currency)} à encaisser`}>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`tre-chip ${subForm.parts === null ? 'is-on' : ''}`}
                      onClick={() => setSubForm({ ...subForm, parts: null })}
                    >
                      En une fois
                    </button>
                    {DECOUPES.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`tre-chip ${subForm.parts === n ? 'is-on' : ''}`}
                        onClick={() => setSubForm({ ...subForm, parts: n })}
                      >
                        En {n} fois
                      </button>
                    ))}
                  </div>
                  {apercu.length > 0 ? (
                    <div style={{ marginTop: 10, border: '1px solid var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
                      {apercu.map((e) => (
                        <div key={e.numero} style={{
                          display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5,
                          padding: '8px 12px', borderTop: e.numero === 1 ? 'none' : '1px solid var(--hairline)',
                        }}>
                          <span className="mnd-muted">
                            {e.numero === 1 ? 'Aujourd’hui, à la signature' : `${e.numero}ᵉ · ${shortDate(e.dueIso)}`}
                          </span>
                          <b style={{ fontWeight: 500 }}>{fmtMoney(e.amountXof, currency)}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 7, lineHeight: 1.6 }}>
                      Au-delà de {fmtMoney(SEUIL_ECHELONNEMENT_XOF, currency)}, la Maison peut découper.
                      La première échéance tombe le jour même : on n’accorde pas un crédit qui commence par un délai.
                    </div>
                  )}
                </Field>
              );
            })()}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setSubModal(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveSub} disabled={!subForm.clientId}>Inscrire l’abonné</Button>
            </div>
          </div>
        </Modal>
      )}

      {payFor && (
        <Modal title={`Règlement · ${payFor.name}`} onClose={() => setPayFor(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              {planOf(payFor.planId)?.name ?? '—'} · {cycleLabel(payFor.cycle ?? 'mensuel').split(' · ')[0].toLowerCase()}
              {planOf(payFor.planId) ? ` · échéance ${fmtMoney(subCycleAmountXof(planOf(payFor.planId)!.priceXof, payFor.cycle ?? 'mensuel'), currency)}` : ''}
            </div>
            {/* L'ÉCHÉANCIER, DÉRIVÉ DES RÈGLEMENTS. Les versements s'imputent
                dans l'ordre, la plus vieille échéance d'abord : c'est la seule
                règle qui permette de dire « deux échéances de retard » sans se
                tromper. Voir `shared/echeancier.ts`, 31 vérifications. */}
            {payFor.echeances && payFor.echeances.length > 0 && (() => {
              const etats = etatDesEcheances(payFor.echeances, subPaid(payFor), todayISO());
              const retard = enRetardXof(etats);
              const suivante = prochaineEcheance(etats);
              return (
                <div>
                  <div className="tre-sec-label" style={{ marginBottom: 8 }}>
                    Réglable en {payFor.echeances.length} fois
                    {retard > 0 && <span style={{ color: 'var(--color-brique, #96412E)' }}> · {fmtMoney(retard, currency)} en retard</span>}
                  </div>
                  <div style={{ border: '1px solid var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
                    {etats.map((e) => (
                      <div key={e.numero} style={{
                        display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'baseline',
                        padding: '9px 12px', fontSize: 12.5,
                        borderTop: e.numero === 1 ? 'none' : '1px solid var(--hairline)',
                        background: e.enRetard ? 'rgba(150,65,46,.06)' : undefined,
                      }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flex: 'none',
                          background: e.soldee ? 'var(--color-vert, #2E6B4F)' : e.enRetard ? 'var(--color-brique, #96412E)' : 'var(--color-argile)',
                        }} />
                        <span className="mnd-muted">
                          {e.numero}ᵉ · {shortDate(e.dueIso)}
                          {e.soldee ? ' · soldée'
                            : e.enRetard ? ` · en retard de ${e.retardJours} jour${e.retardJours > 1 ? 's' : ''}`
                              : e.regleXof > 0 ? ` · ${fmtMoney(e.regleXof, currency)} versés` : ' · à venir'}
                        </span>
                        <b style={{ fontWeight: 500, whiteSpace: 'nowrap', textDecoration: e.soldee ? 'line-through' : undefined, color: e.soldee ? 'var(--ink-soft)' : undefined }}>
                          {fmtMoney(e.amountXof, currency)}
                        </b>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 12.5 }}>
                    <span className="mnd-muted">
                      {suivante ? `Prochaine échéance · ${fmtMoney(suivante.resteXof, currency)}` : 'Échéancier soldé'}
                    </span>
                    {suivante && (
                      <button
                        type="button"
                        className="tre-link-btn"
                        onClick={() => setPayForm({ ...payForm, amount: String(suivante.resteXof) })}
                      >
                        Encaisser ce montant
                      </button>
                    )}
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
                    Reste {fmtMoney(resteDeLEcheancier(etats), currency)} sur l’échéancier. Un versement qui déborde
                    coule sur l’échéance suivante.
                  </div>
                </div>
              );
            })()}

            <div className="tr-grid tr-grid--2">
              <Field label={`Montant (${currency})`}>
                <Input inputMode="numeric" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value.replace(/[^0-9]/g, '') })} placeholder="0" />
              </Field>
              <Field label="Date du règlement">
                <Input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Moyen de paiement">
              <Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                {methods.length === 0 && <option value="">—</option>}
                {methods.map((mth) => <option key={mth} value={mth}>{mth}</option>)}
              </Select>
            </Field>

            {(payFor.payments ?? []).length > 0 && (
              <div>
                <div className="tre-sec-label" style={{ marginBottom: 8 }}>Règlements enregistrés</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 170, overflowY: 'auto' }}>
                  {[...(payFor.payments ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map((p) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, borderBottom: '1px solid var(--hairline)', paddingBottom: 5 }}>
                      <span className="mnd-muted">{shortDate(p.date)}{p.method ? ` · ${p.method}` : ''}</span>
                      <span>{fmtMoney(p.amountXof, currency)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13 }}>
                  <span className="mnd-muted">Total réglé</span>
                  <b style={{ color: 'var(--color-indigo)' }}>{fmtMoney(subPaid(payFor), currency)}</b>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setPayFor(null)}>Fermer</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={savePay} disabled={!(parseInt(payForm.amount, 10) > 0)}>Enregistrer le règlement</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
