import { useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { PageHead } from '../_ui';
import { Badge, Button, Card, Field, Input, Modal, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments, appointmentsStore } from '../../../../shared/agenda';
import { useInvoices, invoiceTotal, expensesStore, expenseCategoriesStore, useCashboxes, cashboxCurrency, usePaymentMethods, moyensAOffrir } from '../../../../shared/finance';
import { useServices, useCategories, sousArbreOf } from '../../../../shared/catalog';
import { useStaff as useMyStaff, useAuth } from '../../../../shared/auth';
import { summaryPdf, payslipPdf, type SummarySection, type PayslipRow } from '../../../../shared/pdf';
import { maisonNom } from '../../../../shared/identite';
import { apptNetXof, svcPriceForAppt, commissionDetaillee } from '../clients/_shared';
import { splitByWeights } from '../../../../shared/pricing';
import { sameName } from '../../../../shared/text';
import {
  anciennete, ancienneteYears, monthLabel, shortDate, useStaff,
  type StaffMember, type StaffRisk, ordonneEquipe, staffStore,
  useFonctions, ajouteUneFonction, FONCTIONS_AU_FAUTEUIL } from './data';
import {
  useBaremePoints, chargeSalaire, chargeAvance, chargeAvanceId, useAdvances,
  computePay, parametersFor, usePayrollParameters, useCommRates,
  type BaremePoints, type SalaryAdvance, type PayGains, type PayDeductions, type PayResult, type CommRates,
} from './payroll';
import { Bar, DeepNote, Gauge, Pill, Tabs } from './ui';
import { PaieRuns, PaieParametres, RhDashboard } from './Paie';
import TempsAbsences from './TempsAbsences';
import { createStore, uid, useStore } from '../../../../shared/store';
import { bindDocument } from '../../../../shared/sync';
import { useTips, importLegacyTips, type Tip } from '../../../../shared/tips';
import './equipe.css';

type Tab = 'equipe' | 'production' | 'temps' | 'paie' | 'parametres' | 'retention';

/* ── UN SEUL REGISTRE D AVANCES — réparé le 23 août 2026 ───────────
   « Comment régulariser les avances sur salaire avec leur contrepartie ? »

   IL Y EN AVAIT DEUX, ET ELLES NE SE PARLAIENT PAS. Cet écran écrivait dans
   `mnd_salary_advances` (un dictionnaire par employé) ; la Paie DÉDUISAIT
   depuis `mnd_payroll_advances` (une liste avec période et branche). Les clés
   avaient été séparées un jour pour qu elles cessent de s écraser l une
   l autre — mais les deux chemins ne se sont jamais rejoints. Résultat : la
   modale promettait « déduite du net à verser », et AUCUNE avance saisie ici
   n a jamais été déduite d un bulletin.

   Un seul registre désormais, celui que la Paie lit. */

/* Taux de commission par palier : `CommRates`, `commRatesStore` et `useCommRates`
   vivent désormais dans `./payroll` (partagés avec le run de Paie). */

/* Ajustements manuels des commissions par mois + maître : `${AAAA-MM}:${staffId}`. */
type PaieOverride = { commPresta?: number; commProduit?: number };
const overridesStore = createStore<Record<string, PaieOverride>>('mnd_paie_overrides', {});
bindDocument(overridesStore, 'mnd_paie_overrides');
const useOverrides = () => useStore(overridesStore);

/* Primes typées — staffId → liste. Chaque prime est datée (donc rattachée à un mois). */
type PrimeType = 'fin_annee' | 'performance' | 'nuit' | 'autre';
type Prime = { id: string; type: PrimeType; label?: string; amountXof: number; date: string; note?: string };
const primesStore = createStore<Record<string, Prime[]>>('mnd_primes', {});
bindDocument(primesStore, 'mnd_primes');
const usePrimes = () => useStore(primesStore);
const PRIME_LABEL: Record<PrimeType, string> = {
  fin_annee: 'Fin d’année', performance: 'Performance', nuit: 'Nuit', autre: 'Autre',
};
const PRIME_TYPES: [PrimeType, string][] = [
  ['performance', 'Performance'], ['nuit', 'Nuit'], ['fin_annee', 'Fin d’année'], ['autre', 'Autre'],
];

/* ── LE BARÈME DE SEUILS ────────────────────────────────────────────────
   Une prime qui récompense le VOLUME, là où la commission récompense le
   montant. Vingt-cinq shampoings dans le mois valent 5 000 F, quarante en
   valent 7 000 : le seuil se franchit, il ne se proratise pas.

   Une règle vise ce qu'elle compte — un geste précis, une famille entière,
   toutes les prestations, ou les TÊTES, c'est-à-dire les rituels. Ses paliers
   sont cumulatifs par le haut : on retient le plus élevé qui soit atteint,
   jamais leur somme, sinon franchir 40 paierait aussi les 25.

   UN GESTE PARTAGÉ VAUT UNE PART, PARTAGÉE. Deux mains sur un shampoing font
   avancer chacune d'une demi-unité — décision du 6 août. C'est ce qui rend le
   seuil comparable à la valeur produite : sans cela, travailler à deux
   doublerait le compte de la Maison sans doubler son travail. */
export type CibleSeuil =
  | { kind: 'service'; id: string }
  | { kind: 'categorie'; id: string }
  | { kind: 'tout' }
  | { kind: 'tetes' };
export type ReglePrime = {
  id: string;
  libelle: string;
  cible: CibleSeuil;
  /** Paliers triés ou non — le calcul retient le plus haut atteint. */
  paliers: { seuil: number; montantXof: number }[];
};
const seuilsStore = createStore<ReglePrime[]>('mnd_seuils_primes', []);
bindDocument(seuilsStore, 'mnd_seuils_primes');
const useSeuils = () => useStore(seuilsStore);

/** La prime due pour un compte donné : le palier le plus haut qui soit atteint. */
export const primeDeSeuil = (regle: ReglePrime, compte: number): { seuil: number; montantXof: number } | undefined =>
  [...regle.paliers].sort((a, b) => b.seuil - a.seuil).find((p) => p.seuil > 0 && compte >= p.seuil);

/* Pourboires — staffId → liste, datés (rattachés au mois). Ajoutés au net à verser.
   Le magasin est partagé (`shared/tips.ts`) afin d'être alimenté aussi à
   l'encaissement d'un RDV (pourboire pour le maître officiant). */

/* Confirmation de règlement (la « signature ») — clé `${AAAA-MM}:${staffId}`.
   Enregistre qui a confirmé le paiement et quand : preuve datée, infalsifiable côté
   usage (réservée au personnel autorisé), pour ne jamais contester un versement. */
type PayConfirm = { paidAt: string; byId: string; byName: string; method?: string; amountXof: number; expenseId?: string };
const SALAIRE_CATEGORY = 'Salaires';
const confirmStore = createStore<Record<string, PayConfirm>>('mnd_paie_confirm', {});
bindDocument(confirmStore, 'mnd_paie_confirm');
const useConfirm = () => useStore(confirmStore);

/* Retenues sur salaire — staffId → liste, datées. Diminuent le net à verser.
   Motifs : absence non rémunérée (maladie sans maintien, sabbatique, congé sans
   solde), mise à pied (conservatoire/disciplinaire), absence injustifiée
   (déduction stricte du temps non travaillé), autre. */
type RetenueType = 'absence_non_rem' | 'mise_a_pied' | 'absence_injustifiee' | 'autre';
type Retenue = { id: string; type: RetenueType; amountXof: number; date: string; days?: number; note?: string };
const retenuesStore = createStore<Record<string, Retenue[]>>('mnd_retenues', {});
bindDocument(retenuesStore, 'mnd_retenues');
const useRetenues = () => useStore(retenuesStore);
const RETENUE_LABEL: Record<RetenueType, string> = {
  absence_non_rem: 'Absence non rémunérée', mise_a_pied: 'Mise à pied', absence_injustifiee: 'Absence injustifiée', autre: 'Autre retenue',
};
const RETENUE_TYPES: [RetenueType, string][] = [
  ['absence_non_rem', 'Absence non rémunérée'], ['mise_a_pied', 'Mise à pied'], ['absence_injustifiee', 'Absence injustifiée'], ['autre', 'Autre'],
];
/** Jours ouvrables de référence pour le salaire journalier (retenue au prorata). */
const JOURS_OUVRABLES = 26;

/* LES MOYENS VIENNENT DES PARAMÈTRES — 5 septembre 2026. Cette liste-ci
   servait de repli quand aucun n'est réglé : une maison neuve doit pouvoir
   payer avant d'avoir configuré quoi que ce soit. */
const PAY_METHODS = ['Mobile Money', 'Espèces', 'Virement', 'Autre'];
/** Date+heure lisibles d'un ISO (« 14 juil. 2026, 18:32 »). */
const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Les 12 mois d'une année (AAAA-MM), de janvier à décembre. */
const yearMonths = (year: number): string[] =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
/** Libellé court d'un mois AAAA-MM (« janv. »). */
const shortMonth = (mk: string): string =>
  new Date(`${mk}-15T00:00:00`).toLocaleDateString('fr-FR', { month: 'short' });
/** « juillet 2026 » — titre de période. */
const monthTitle = (mk: string): string =>
  new Date(`${mk}-15T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mois de paie courant, clé AAAA-MM. */
const payMonth = (): string => new Date().toISOString().slice(0, 7);
const parseXof = (s: string) => Math.max(0, parseInt((s || '').replace(/[^0-9]/g, ''), 10) || 0);

/* Les fonctions vivent dans `equipe/data` depuis le 23 août 2026 : elles
   étaient écrites en dur ici, toutes tournées vers le fauteuil. Voir
   `FONCTIONS_DEFAUT` — et la Maison en ajoute quand elle veut. */

const riskTone = (r: StaffRisk): 'ok' | 'warn' | 'error' => (r === 'faible' ? 'ok' : r === 'modéré' ? 'warn' : 'error');

type StaffForm = {
  name: string;
  role: string;
  branchId: string;
  phone: string;
  email: string;
  compteMail: string;
  since: string;
  salaire: string;
  auFauteuil: boolean;
  partPourboire: string; // part dans le partage des pourboires — « 1 », « 0.5 », « 0 »
  commissionne: boolean;
  commissionTaux: string; // % negocie — vide = bareme de la Maison
  /* — Dossier paie — */
  matricule: string;
  cnssNum: string;
  ifu: string;
  contractType: string;
  atelier: string;
  commissionPct: string;
  paiement: string;
};

const emptyForm = (branchId: string): StaffForm => ({
  name: '', role: 'Maîtresse', branchId, phone: '+229 ', email: '', compteMail: '', since: new Date().toISOString().slice(0, 10), salaire: '', auFauteuil: true, partPourboire: '1', commissionne: false, commissionTaux: '',
  matricule: '', cnssNum: '', ifu: '', contractType: 'CDI', atelier: '', commissionPct: '', paiement: '',
});

const CONTRACT_TYPES = ['CDI', 'CDD', 'apprentissage', 'prestataire'] as const;

/** Prochain matricule MND-EMP-NNN (max existant + 1, sur 3 chiffres). */
const nextMatricule = (staff: StaffMember[]): string => {
  const max = staff.reduce((m, s) => {
    const n = parseInt(s.matricule?.match(/(\d+)\s*$/)?.[1] ?? '', 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `MND-EMP-${String(max + 1).padStart(3, '0')}`;
};

export default function Personnel() {
  const { branch, branches, currency } = useBranch();
  const [fonctions] = useFonctions();
  /* LES CAISSES DE LA MAISON — une avance sort d’un tiroir réel. Celles en
     devise sont écartées : le montant se saisit en monnaie de la Maison. */
  const [toutesLesCaisses] = useCashboxes();
  const caissesDeLaMaison = toutesLesCaisses.filter(
    (c) => c.branchId === branch.id && cashboxCurrency(c) === currency,
  );
  const [staff, setStaff] = useStaff();
  const [advances, setAdvances] = useAdvances();
  const [payrollParams] = usePayrollParameters();
  const [tab, setTab] = useState<Tab>('equipe');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(() => emptyForm(branch.id));
  const [paieLancee, setPaieLancee] = useState(false);
  const [avanceFor, setAvanceFor] = useState<StaffMember | null>(null);
  const [avanceForm, setAvanceForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), note: '', cashbox: '' });

  /* Commissions & primes — taux, ajustements, primes typées, sources. */
  const [rates, setRates] = useCommRates();
  const [overrides, setOverrides] = useOverrides();
  const [primes, setPrimes] = usePrimes();
  const [tips, setTips] = useTips();
  const [retenues, setRetenues] = useRetenues();
  /* Reprise de l'ancien magasin de pourboires (document unique) : idempotent par
     id, re-tourne après l'hydratation pour rattraper d'éventuelles lignes locales. */
  useEffect(() => { importLegacyTips(); }, [tips]);
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const [services] = useServices();
  const [adjustFor, setAdjustFor] = useState<StaffMember | null>(null);
  const [adjustForm, setAdjustForm] = useState({ presta: '', produit: '' });
  const [primeFor, setPrimeFor] = useState<StaffMember | null>(null);
  const [primeForm, setPrimeForm] = useState<{ type: PrimeType; amount: string; date: string; note: string }>(
    { type: 'performance', amount: '', date: new Date().toISOString().slice(0, 10), note: '' },
  );
  const [tipFor, setTipFor] = useState<StaffMember | null>(null);
  const [tipForm, setTipForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), note: '' });
  const [retenueFor, setRetenueFor] = useState<StaffMember | null>(null);
  const [retenueForm, setRetenueForm] = useState<{ type: RetenueType; amount: string; days: string; date: string; note: string }>(
    { type: 'absence_non_rem', amount: '', days: '', date: new Date().toISOString().slice(0, 10), note: '' },
  );
  const [yearFor, setYearFor] = useState<StaffMember | null>(null);
  const [confirms, setConfirms] = useConfirm();
  const [moyensPose] = usePaymentMethods();
  const [payMethod, setPayMethod] = useState<string>(PAY_METHODS[0]);
  const me = useMyStaff();
  const { session } = useAuth();
  const isSouverain = me?.role === 'souverain';
  const M = payMonth();
  const [categories] = useCategories();
  const [seuils, setSeuils] = useSeuils();
  const [bareme, setBareme] = useBaremePoints();

  const team = useMemo(() => ordonneEquipe(staff.filter((m) => m.branchId === branch.id)), [staff, branch.id]);

  /* L'ORDRE DES MEMBRES, décidé ici et respecté partout ailleurs.

     Les pastilles d'attribution sortaient dans l'ordre de création des fiches
     — c'est-à-dire dans aucun ordre. Or personne ne fait une tête seul : un
     KLOKLO se fait à deux, une reprise à deux ou trois, la coiffure par un
     troisième. On coche ces combinaisons des dizaines de fois par jour, et
     chercher un nom dans une liste rangée au hasard coûte ce temps-là.

     On renumérote TOUTE la branche à chaque déplacement plutôt que d'échanger
     deux rangs : des fiches sans rang, ou à rang égal, laisseraient l'ordre
     dépendre du tri de secours — donc bouger sans qu'on l'ait demandé. */
  const deplacer = (id: string, sens: -1 | 1) => {
    const i = team.findIndex((m) => m.id === id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= team.length) return;
    const ordonne = [...team];
    const [pris] = ordonne.splice(i, 1);
    ordonne.splice(j, 0, pris);
    const rangs = new Map(ordonne.map((m, k) => [m.id, k]));
    staffStore.set((prev) => prev.map((m) => (rangs.has(m.id) ? { ...m, ordre: rangs.get(m.id) } : m)));
  };

  /* ── L'ATTRIBUTION EN MASSE A ÉTÉ RETIRÉE le 7 août ───────────────────
     Un bouton collait les 406 rendez-vous sans maître à UNE personne choisie
     dans une liste. Il datait d'avant les mains : à l'époque un rendez-vous
     n'avait qu'un maître, et remplir ce champ valait mieux que le laisser
     vide.

     Il est faux par construction. Personne n'a fait 406 têtes seul — un
     KLOKLO se fait à deux, une reprise à deux ou trois, la coiffure par un
     troisième. Ce bouton écrivait donc une histoire qui n'a jamais eu lieu,
     et cette histoire remontait ensuite dans la production, les seuils et les
     commissions. Un chiffre faux qu'on ne peut plus distinguer d'un vrai coûte
     plus cher qu'une case vide.

     L'attribution se fait désormais là où elle se sait : sur le rendez-vous
     lui-même, prestation par prestation, avec la ligne MAINS — et dans
     « Mon mois », où chacun déclare la sienne. Les rendez-vous de l'ancien
     carnet resteront sans mains : c'est la vérité, personne ne se souvient
     de qui a fait quoi il y a deux ans. */

  /* Le registre est désormais une LISTE — celui que la Paie déduit — et non
     plus un dictionnaire par employé. Une seule vérité. */
  const advancesFor = (id: string) => advances.filter((a) => a.employeeId === id);
  const totalAdvances = (id: string) => advancesFor(id).reduce((a, x) => a + x.amountXof, 0);

  /* Commission d'un maître pour un mois donné (AAAA-MM) — réutilisable pour le
     mois courant et pour le détail annuel. Prestations = rituels honorés × taux
     du palier (remise appliquée, une série comptée une fois). Produits =
     factures produits attribuées × taux produits. */
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const linkedInv = useMemo(() => {
    const s = new Set<string>();
    for (const a of appts) if (a.invoiceId) s.add(a.invoiceId);
    return s;
  }, [appts]);
  const paletteRate = (p: string) =>
    (p === 'Fondation' ? rates.fondation : p === 'Élévation' ? rates.elevation : rates.souverainete) / 100;
  /* LE TAUX D'UNE PERSONNE. Le sien s'il est negocie — c'est le cas d'un maitre
     externe recrute pour la journee — sinon le bareme de la Maison par palier.
     Qui n'est pas commissionne ne touche rien, quel que soit le bareme : chez
     MND on ne commissionne pas les salaries, et le taux de palier existait
     pourtant deja pour tout le monde. */
  const tauxDe = (m: StaffMember, palier: string) =>
    m.commissionne === true
      ? (m.commissionTauxPct !== undefined ? m.commissionTauxPct / 100 : paletteRate(palier))
      : 0;
  /* LA PRODUCTION DU MOIS — ce que chacun a réellement exécuté.

     Le travail se lisait par le maître ASSIGNÉ du rendez-vous : une reprise
     faite à deux comptait entière pour un seul, et rien ne disait que la
     coiffure avait été faite par une troisième. On lit désormais les MAINS,
     geste par geste — à défaut, le maître assigné, pour que l'historique
     d'avant reste lisible.

     TOUT SE PARTAGE À PARTS ÉGALES : le compte du geste, sa durée, sa valeur.
     Deux mains sur une reprise d'une heure à 30 000 F, c'est une demi-unité,
     une demi-heure et 15 000 F pour chacune. Additionner sans partager
     inventerait des heures de fauteuil que personne n'a passées. */
  const production = useMemo(() => {
    type Fiche = {
      gestes: number; minutes: number; valeur: number; tetes: number;
      parService: Map<string, number>; parCategorie: Map<string, number>;
    };
    const par = new Map<string, Fiche>();
    const at = (id: string): Fiche => {
      let v = par.get(id);
      if (!v) {
        v = { gestes: 0, minutes: 0, valeur: 0, tetes: 0, parService: new Map(), parCategorie: new Map() };
        par.set(id, v);
      }
      return v;
    };
    const ajoute = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

    for (const a of appts) {
      if (a.branchId !== branch.id || a.status !== 'honoré') continue;
      if (a.date.slice(0, 7) !== M) continue;
      const net = a.seriesIndex && a.seriesIndex > 1 ? 0 : apptNetXof(a, byId);
      const poids = a.serviceIds.map((id) => { const sv = byId.get(id); return sv ? svcPriceForAppt(a, sv) : 0; });
      const parts = splitByWeights(net, poids);
      /* LA TÊTE — le rituel lui-même, compté une fois et partagé entre toutes
         les mains qui y ont touché, quel que soit le nombre de gestes. */
      const surLaTete = new Set<string>();
      a.serviceIds.forEach((id, i) => {
        const sv = byId.get(id);
        if (!sv) return;
        const mains = a.mains?.[i]?.length
          ? a.mains[i]
          : team.filter((x) => sameName(x.name, a.master)).map((x) => x.id);
        if (!mains.length) return;
        const duree = (a.longueur ? sv.dureeParLongueur?.[a.longueur] : undefined) ?? sv.durationMin;
        for (const staffId of mains) {
          const v = at(staffId);
          v.gestes += 1 / mains.length;
          v.minutes += duree / mains.length;
          v.valeur += parts[i] / mains.length;
          ajoute(v.parService, sv.id, 1 / mains.length);
          ajoute(v.parCategorie, sv.categoryId, 1 / mains.length);
          surLaTete.add(staffId);
        }
      });
      for (const staffId of surLaTete) at(staffId).tetes += 1 / surLaTete.size;
    }
    return par;
  }, [appts, branch.id, M, byId, team]);

  /* CE QUE COMPTE UNE RÈGLE, pour une personne. Une famille compte aussi ce
     qui est rangé SOUS elle : viser GBÈJÍ™ doit prendre les SÍNSIN™, sinon la
     mise en familles du 5 août aurait vidé les seuils en silence. */
  const compteRegle = (regle: ReglePrime, staffId: string): number => {
    const f = production.get(staffId);
    if (!f) return 0;
    if (regle.cible.kind === 'tetes') return f.tetes;
    if (regle.cible.kind === 'tout') return f.gestes;
    if (regle.cible.kind === 'service') return f.parService.get(regle.cible.id) ?? 0;
    const sousArbre = sousArbreOf(categories, regle.cible.id);
    let n = 0;
    for (const [catId, v] of f.parCategorie) if (sousArbre.has(catId)) n += v;
    return n;
  };
  /* Un compte se dit « 12,5 » quand un geste a été partagé — l'arrondi
     masquerait qu'il manque une demi-unité pour franchir le seuil. */
  const fmtCompte = (n: number) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');

  /* LA COMMISSION DÉTAILLÉE — désormais dans `commissionDetaillee`
     (clients/_shared), la MÊME porte que le run de Paie. */
  const computeComm = (m: StaffMember, month: string) =>
    commissionDetaillee(m, month, { appts, invoices, byId, team, branchId: branch.id, rates });

  /* Primes typées d'un maître pour un mois. */
  const primesForMonth = (id: string, month: string) => (primes[id] ?? []).filter((p) => p.date.slice(0, 7) === month);
  const primeTotalMonth = (id: string, month: string) => primesForMonth(id, month).reduce((a, p) => a + p.amountXof, 0);
  /* Pourboires d'un maître pour un mois. */
  const tipsForMonth = (id: string, month: string) => tips.filter((t) => t.staffId === id && t.date.slice(0, 7) === month);
  const tipTotalMonth = (id: string, month: string) => tipsForMonth(id, month).reduce((a, t) => a + t.amountXof, 0);
  /* Retenues d'un maître pour un mois. */
  const retenuesForMonth = (id: string, month: string) => (retenues[id] ?? []).filter((r) => r.date.slice(0, 7) === month);
  const retenueTotalMonth = (id: string, month: string) => retenuesForMonth(id, month).reduce((a, r) => a + r.amountXof, 0);
  const advancesForMonth = (id: string, month: string) => advancesFor(id).filter((a) => a.date.slice(0, 7) === month);
  const advancesTotalMonth = (id: string, month: string) => advancesForMonth(id, month).reduce((a, x) => a + x.amountXof, 0);

  const ovOf = (id: string): PaieOverride => overrides[`${M}:${id}`] ?? {};
  const commPrestaOf = (m: StaffMember) => ovOf(m.id).commPresta ?? computeComm(m, M).presta;
  const commProduitOf = (m: StaffMember) => ovOf(m.id).commProduit ?? computeComm(m, M).produit;
  const primeOf = (m: StaffMember) => primeTotalMonth(m.id, M);
  const tipOf = (m: StaffMember) => tipTotalMonth(m.id, M);
  const isAdjusted = (m: StaffMember) => {
    const o = ovOf(m.id);
    return o.commPresta != null || o.commProduit != null;
  };
  const netAVerserEff = (m: StaffMember) => m.salaireXof + commPrestaOf(m) + commProduitOf(m) + primeOf(m) + tipOf(m);

  /* LE NET D'UN MOIS — UNE SEULE FORMULE, cotisations comprises. Trois copies
     divergeaient (tableau avec overrides mais sans CNSS/ITS ; `netForMonth` sans
     overrides ; modale annuelle inline) : un net affiché différait du net
     enregistré. Tout passe désormais par `computePay` (payroll.ts) — brut −
     CNSS − ITS − avances − retenues — avec la commission détaillée de Personnel,
     overrides du mois courant compris. NOTE : le run de Paie calcule sa
     commission autrement (`commissionPct` forfaitaire) ; l'égalité Personnel =
     run par la commission reste une décision de politique de paie à trancher. */
  const paieDuMois = (m: StaffMember, month: string): PayResult => {
    const c = computeComm(m, month);
    const ov = month === M ? ovOf(m.id) : {};
    const gains: PayGains = {
      base: m.salaireXof, heuresSup: 0,
      prime: primeTotalMonth(m.id, month), pourboires: tipTotalMonth(m.id, month),
      commission: (ov.commPresta ?? c.presta) + (ov.commProduit ?? c.produit), indemnites: 0,
    };
    const ded: PayDeductions = { avance: advancesTotalMonth(m.id, month), autresRetenues: retenueTotalMonth(m.id, month) };
    return computePay(gains, ded, parametersFor(month, payrollParams));
  };
  const netApresAvances = (m: StaffMember) => paieDuMois(m, M).net;

  const setRate = (k: keyof CommRates, v: string) =>
    setRates((r) => ({ ...r, [k]: Math.max(0, Math.min(100, Math.round(Number(v) || 0))) }));

  const openAdjust = (m: StaffMember) => {
    setAdjustFor(m);
    setAdjustForm({ presta: String(commPrestaOf(m)), produit: String(commProduitOf(m)) });
  };
  const saveAdjust = () => {
    if (!adjustFor) return;
    setOverrides((prev) => ({
      ...prev,
      [`${M}:${adjustFor.id}`]: {
        commPresta: parseXof(adjustForm.presta),
        commProduit: parseXof(adjustForm.produit),
      },
    }));
    setAdjustFor(null);
  };

  /* Primes — ajout typé et retrait. */
  const openPrime = (m: StaffMember) => {
    setPrimeFor(m);
    setPrimeForm({ type: 'performance', amount: '', date: new Date().toISOString().slice(0, 10), note: '' });
  };
  const savePrime = () => {
    if (!primeFor) return;
    const amountXof = parseXof(primeForm.amount);
    if (amountXof <= 0) return;
    const p: Prime = { id: `pr-${uid()}`, type: primeForm.type, amountXof, date: primeForm.date, note: primeForm.note.trim() || undefined };
    const sid = primeFor.id;
    setPrimes((prev) => ({ ...prev, [sid]: [...(prev[sid] ?? []), p] }));
    setPrimeFor(null);
  };
  /* INSCRIRE UNE PRIME DE SEUIL. Elle porte une MARQUE — la regle et le mois —
     qui la rend reconnaissable : rouvrir l'ecran ne peut pas doubler un
     versement, et retirer la prime rend le bouton, si le seuil se defait. */
  const inscrirePrime = (m: StaffMember, regle: ReglePrime, montantXof: number, marque: string) => {
    const pr: Prime = {
      id: `pr-${uid()}`, type: 'performance', amountXof: montantXof,
      date: `${M}-01`, note: marque,
    };
    setPrimes((prev) => ({ ...prev, [m.id]: [...(prev[m.id] ?? []), pr] }));
    toast(`${regle.libelle} · ${fmtMoney(montantXof, currency)} inscrits en prime pour ${m.name}.`);
  };
  /* ── ÉDITION DU BARÈME DE SEUILS ───────────────────────────────────── */
  const cibleDepuis = (v: string): CibleSeuil =>
    v.startsWith('s:') ? { kind: 'service', id: v.slice(2) }
    : v.startsWith('c:') ? { kind: 'categorie', id: v.slice(2) }
    : v === 'tout' ? { kind: 'tout' } : { kind: 'tetes' };
  const majRegle = (id: string, patch: Partial<ReglePrime>) =>
    setSeuils((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const majPalier = (id: string, i: number, patch: Partial<{ seuil: number; montantXof: number }>) =>
    setSeuils((prev) => prev.map((r) => (r.id === id
      ? { ...r, paliers: r.paliers.map((pa, k) => (k === i ? { ...pa, ...patch } : pa)) } : r)));
  const ajouterPalier = (id: string) =>
    setSeuils((prev) => prev.map((r) => (r.id === id ? { ...r, paliers: [...r.paliers, { seuil: 0, montantXof: 0 }] } : r)));
  const retirerPalier = (id: string, i: number) =>
    setSeuils((prev) => prev.map((r) => (r.id === id ? { ...r, paliers: r.paliers.filter((_, k) => k !== i) } : r)));
  const ajouterRegle = () =>
    setSeuils((prev) => [...prev, { id: `sl-${uid()}`, libelle: '', cible: { kind: 'tetes' }, paliers: [{ seuil: 25, montantXof: 5000 }] }]);
  const retirerRegle = (id: string) => {
    if (!window.confirm('Supprimer ce barème ? Les primes déjà inscrites au mois ne bougent pas.')) return;
    setSeuils((prev) => prev.filter((r) => r.id !== id));
  };

  const removePrime = (staffId: string, primeId: string) =>
    setPrimes((prev) => ({ ...prev, [staffId]: (prev[staffId] ?? []).filter((p) => p.id !== primeId) }));

  /* Pourboires — ajout et retrait. */
  const openTip = (m: StaffMember) => {
    setTipFor(m);
    setTipForm({ amount: '', date: new Date().toISOString().slice(0, 10), note: '' });
  };
  const saveTip = () => {
    if (!tipFor) return;
    const amountXof = parseXof(tipForm.amount);
    if (amountXof <= 0) return;
    const t: Tip = { id: `tp-${uid()}`, staffId: tipFor.id, amountXof, date: tipForm.date, note: tipForm.note.trim() || undefined };
    setTips((prev) => [...prev, t]);
    setTipFor(null);
  };
  const removeTip = (_staffId: string, tipId: string) =>
    setTips((prev) => prev.filter((t) => t.id !== tipId));

  /* Retenues — ajout (montant direct ou au prorata des jours) et retrait. */
  const openRetenue = (m: StaffMember) => {
    setRetenueFor(m);
    setRetenueForm({ type: 'absence_non_rem', amount: '', days: '', date: new Date().toISOString().slice(0, 10), note: '' });
  };
  /* Saisir des jours propose une retenue = jours × salaire journalier (éditable). */
  const setRetenueDays = (m: StaffMember, daysStr: string) => {
    const days = daysStr.replace(/[^0-9.]/g, '');
    const n = parseFloat(days) || 0;
    setRetenueForm((f) => ({ ...f, days, amount: n > 0 ? String(Math.round(dailyRate(m) * n)) : f.amount }));
  };
  const saveRetenue = () => {
    if (!retenueFor) return;
    const amountXof = parseXof(retenueForm.amount);
    if (amountXof <= 0) return;
    const days = parseFloat(retenueForm.days) || undefined;
    const r: Retenue = { id: `re-${uid()}`, type: retenueForm.type, amountXof, date: retenueForm.date, days, note: retenueForm.note.trim() || undefined };
    const sid = retenueFor.id;
    setRetenues((prev) => ({ ...prev, [sid]: [...(prev[sid] ?? []), r] }));
    setRetenueFor(null);
  };
  const removeRetenue = (staffId: string, retenueId: string) =>
    setRetenues((prev) => ({ ...prev, [staffId]: (prev[staffId] ?? []).filter((r) => r.id !== retenueId) }));

  /* Net à verser d'un maître pour un mois quelconque (réutilisé partout) —
     la MÊME porte que le tableau : `paieDuMois`, cotisations comprises et
     overrides du mois courant respectés. Le resync et les bulletins l'utilisent,
     donc le net enregistré = le net affiché. */
  const netForMonth = (m: StaffMember, month: string) => paieDuMois(m, month).net;
  /** Salaire journalier de référence (base ÷ jours ouvrables). */
  const dailyRate = (m: StaffMember) => Math.round(m.salaireXof / JOURS_OUVRABLES);

  /* Confirmation de règlement — la « signature » qui protège d'un litige. */
  const confKey = (month: string, staffId: string) => `${month}:${staffId}`;
  const confirmOf = (month: string, staffId: string): PayConfirm | undefined => confirms[confKey(month, staffId)];
  const months12Paid = (staffId: string, year: number) => yearMonths(year).filter((mk) => confirmOf(mk, staffId)).length;
  const confirmPay = (m: StaffMember, month: string, amountXof: number) => {
    const method = payMethod;
    const byName = me?.name?.trim() || session?.user?.email?.split('@')[0] || 'La maison';
    if (!window.confirm(`Confirmer le règlement de ${fmtMoney(amountXof, currency)} à ${m.name} pour ${monthTitle(month)} ?\nVotre nom (${byName}) et l'horodatage seront enregistrés comme preuve, et la charge s'inscrira dans les Dépenses.`)) return;
    const paidAt = new Date().toISOString();
    /* MÊME CLÉ ET MÊME CONSTRUCTEUR QUE LE RUN DE PAIE (payroll.ts) : les deux
       chemins écrivent LA MÊME ligne — libellé, catégorie et jour LOCAL
       identiques, jamais les coordonnées de paiement en guise de caisse.
       Ce clic est un geste EXPLICITE : il reprend la main même sur une ligne
       écrite par un run (`source: 'confirm'`). */
    const charge = chargeSalaire({
      mois: month, employeeId: m.id, branchId: m.branchId,
      nom: m.name, netXof: amountXof, stamp: paidAt, source: 'confirm',
    });
    const expId = charge.id;
    expensesStore.set((prev) => (prev.some((e) => e.id === expId) ? prev.map((e) => (e.id === expId ? charge : e)) : [charge, ...prev]));
    expenseCategoriesStore.set((prev) => (prev.some((c) => c.name === SALAIRE_CATEGORY) ? prev : [...prev, { id: 'ec-salaires', name: SALAIRE_CATEGORY, subs: [] }]));
    setConfirms((prev) => ({
      ...prev,
      [confKey(month, m.id)]: { paidAt, byId: session?.user?.id ?? '', byName, method, amountXof, expenseId: expId },
    }));
  };
  const unconfirmPay = (month: string, staffId: string) => {
    if (!window.confirm('Annuler la confirmation de règlement ? La charge correspondante sera retirée des Dépenses.')) return;
    const eid = confirms[confKey(month, staffId)]?.expenseId;
    if (eid) expensesStore.set((prev) => prev.filter((e) => e.id !== eid));
    setConfirms((prev) => {
      const next = { ...prev };
      delete next[confKey(month, staffId)];
      return next;
    });
  };

  /* Resynchronisation : si le net d'un mois déjà confirmé change (prime/retenue/
     pourboire/avance ajoutés après coup), on met à jour le montant confirmé et la
     charge « Salaires » liée. Sûr : ne met à jour que sur écart réel (converge). */
  useEffect(() => {
    const confUpdates: Record<string, PayConfirm> = {};
    const expUpdates = new Map<string, number>();
    for (const [key, conf] of Object.entries(confirms)) {
      const sep = key.indexOf(':');
      const month = key.slice(0, sep);
      const staffId = key.slice(sep + 1);
      const m = team.find((s) => s.id === staffId);
      if (!m) continue;
      const net = netForMonth(m, month);
      if (net !== conf.amountXof) {
        confUpdates[key] = { ...conf, amountXof: net };
        if (conf.expenseId) expUpdates.set(conf.expenseId, net);
      }
    }
    if (Object.keys(confUpdates).length) {
      setConfirms((prev) => ({ ...prev, ...confUpdates }));
      if (expUpdates.size) {
        /* UNE LIGNE ÉCRITE PAR UN RUN NE SE FAIT PAS RÉÉCRIRE SANS GESTE
           (12 août). Les deux chemins partagent la même clé mais pas la même
           formule de net : ce resync automatique écrasait le montant d'un run
           payé — voire clôturé — à la simple OUVERTURE de cet écran, dès
           qu'une commission recalculait. `source: 'run'` la protège ; seul le
           clic explicite « Confirmer le règlement » reprend la main. */
        expensesStore.set((prev) => prev.map((e) => (expUpdates.has(e.id) && e.source !== 'run' ? { ...e, amountXof: expUpdates.get(e.id)! } : e)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirms, team, appts, invoices, services, rates, primes, tips, advances, retenues]);

  /* Montant en ASCII pur pour le PDF (jsPDF n'affiche pas les espaces fins Unicode). */
  const pdfMoney = (n: number) => {
    const neg = n < 0;
    const grouped = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${neg ? '- ' : ''}${grouped} ${currency === 'XOF' ? 'F' : currency}`;
  };

  /* Bulletin de paie mensuel (PDF) — mise en page soignée, signature & tampon. */
  const downloadMonthlyPayslip = async (m: StaffMember, month: string) => {
    const c = computeComm(m, month);
    /* La commission du bulletin suit CELLE DU NET (overrides du mois courant). */
    const ov = month === M ? ovOf(m.id) : {};
    const presta = ov.commPresta ?? c.presta;
    const produit = ov.commProduit ?? c.produit;
    const prime = primeTotalMonth(m.id, month);
    const tip = tipTotalMonth(m.id, month);
    const av = advancesTotalMonth(m.id, month);
    const reList = retenuesForMonth(m.id, month);
    const ret = retenueTotalMonth(m.id, month);
    /* Le net et les cotisations viennent de la MÊME porte que le tableau. */
    const pr = paieDuMois(m, month);
    const net = pr.net;
    const conf = confirmOf(month, m.id);
    const prList = primesForMonth(m.id, month);
    const rows: PayslipRow[] = [
      { label: 'Salaire de base', value: pdfMoney(m.salaireXof) },
      { label: 'Commission prestations', value: pdfMoney(presta) },
      { label: 'Commission produits', value: pdfMoney(produit) },
      { label: 'Primes', value: pdfMoney(prime) },
      ...prList.map((p) => ({ label: `— ${PRIME_LABEL[p.type]}${p.note ? ` · ${p.note}` : ''}`, value: pdfMoney(p.amountXof), sub: true })),
      { label: 'Pourboires', value: pdfMoney(tip) },
      ...(pr.cnssSalariale > 0 ? [{ label: 'CNSS (part salariale)', value: `- ${pdfMoney(pr.cnssSalariale)}` }] : []),
      ...(pr.its > 0 ? [{ label: 'ITS (impôt sur le salaire)', value: `- ${pdfMoney(pr.its)}` }] : []),
      { label: 'Avances déduites', value: av > 0 ? `- ${pdfMoney(av)}` : pdfMoney(0) },
      { label: 'Retenues', value: ret > 0 ? `- ${pdfMoney(ret)}` : pdfMoney(0) },
      ...reList.map((r) => ({ label: `— ${RETENUE_LABEL[r.type]}${r.days ? ` · ${r.days} j` : ''}${r.note ? ` · ${r.note}` : ''}`, value: `- ${pdfMoney(r.amountXof)}`, sub: true })),
    ];
    await payslipPdf({
      houseName: maisonNom(),
      houseSub: [branch.name, branch.city].filter(Boolean).join(' · '),
      employeeName: m.name,
      role: m.role,
      period: cap(monthTitle(month)),
      rows,
      net: pdfMoney(net),
      paid: conf ? { line: `Réglé le ${fmtStamp(conf.paidAt)}${conf.method ? ` · ${conf.method}` : ''}`, by: `Confirmé par ${conf.byName} · signature électronique enregistrée par Le Trône` } : undefined,
      gerantName: me?.name ?? undefined,
      filename: `bulletin-${m.name.replace(/\s+/g, '-')}-${month}.pdf`,
    });
  };

  /* Récapitulatif annuel (PDF) — un net par mois + statut de règlement. */
  const downloadYearlyPayslip = async (m: StaffMember, year: number) => {
    const months = yearMonths(year);
    const rows = months.map((mk) => {
      const conf = confirmOf(mk, m.id);
      return { label: `${cap(shortMonth(mk))}${conf ? `  · réglé ${fmtStamp(conf.paidAt).split(',')[0]}` : ''}`, value: pdfMoney(netForMonth(m, mk)) };
    });
    const total = months.reduce((s, mk) => s + netForMonth(m, mk), 0);
    const paid = months.filter((mk) => confirmOf(mk, m.id)).length;
    const sections: SummarySection[] = [
      { heading: `Net versé par mois · ${year}`, rows },
      { heading: 'Total', rows: [{ label: `Net total ${year}`, value: pdfMoney(total) }, { label: 'Mois réglés & confirmés', value: `${paid} / 12` }] },
    ];
    await summaryPdf({
      eyebrow: 'Récapitulatif annuel de paie',
      title: m.name,
      houseName: maisonNom(),
      meta: [`${branch.name} · ${branch.city}`, `Année · ${year} · ${m.role}`],
      sections,
      footer: `Document généré par Le Trône · ${maisonNom()}`,
      filename: `recap-annuel-${m.name.replace(/\s+/g, '-')}-${year}.pdf`,
    });
  };
  const resetAdjust = (id: string) =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[`${M}:${id}`];
      return next;
    });

  const openAvance = (m: StaffMember) => {
    setAvanceFor(m);
    setAvanceForm({ amount: '', date: new Date().toISOString().slice(0, 10), note: '', cashbox: caissesDeLaMaison[0]?.name ?? '' });
  };
  const saveAvance = () => {
    if (!avanceFor) return;
    const amountXof = Math.max(0, parseInt(avanceForm.amount, 10) || 0);
    if (amountXof <= 0) return;
    const date = avanceForm.date || new Date().toISOString().slice(0, 10);
    const adv: SalaryAdvance = {
      id: `av-${uid()}`,
      employeeId: avanceFor.id,
      /* LA PÉRIODE EST CELLE DU MOIS DE L’AVANCE : c’est le bulletin de ce
         mois-là qui la déduira. Sans elle, la Paie ne la trouvait pas. */
      period: date.slice(0, 7),
      amountXof,
      date,
      note: avanceForm.note.trim() || undefined,
      branchId: avanceFor.branchId,
      cashbox: avanceForm.cashbox || undefined,
    };
    setAdvances((prev) => [...prev, adv]);
    /* LA CONTREPARTIE, LE JOUR MÊME. Une avance, ce sont des billets qui
       quittent un tiroir : la charge s’inscrit en Salaires, et la paie
       déduira ce montant du net — la charge du jour de paie ne portera donc
       que le reste. Les deux additionnées font ce qui a été versé. */
    const charge = chargeAvance({
      avanceId: adv.id, employeeId: avanceFor.id, branchId: avanceFor.branchId,
      nom: avanceFor.name, montantXof: amountXof, date, cashbox: avanceForm.cashbox,
    });
    expensesStore.set((prev) => (prev.some((e) => e.id === charge.id) ? prev : [charge, ...prev]));
    setAvanceFor(null);
  };
  const removeAvance = (_staffId: string, advId: string) => {
    setAdvances((prev) => prev.filter((a) => a.id !== advId));
    /* Retirer l’avance retire sa charge : sinon la caisse resterait débitée
       d’un décaissement qui n’a plus lieu. */
    expensesStore.set((prev) => prev.filter((e) => e.id !== chargeAvanceId(advId)));
  };

  const stats = useMemo(() => {
    const n = team.length;
    const avgYears = n ? team.reduce((a, m) => a + ancienneteYears(m.since), 0) / n : 0;
    const avgSat = n ? team.reduce((a, m) => a + m.satisfaction, 0) / n : 0;
    const risky = team.filter((m) => m.risk === 'élevé').length;
    return { n, avgYears, avgSat, risky };
  }, [team]);

  const payrollTotal = team.reduce((a, m) => a + netApresAvances(m), 0);
  const advancesTotal = team.reduce((a, m) => a + advancesTotalMonth(m.id, M), 0);
  const retenuesTotal = team.reduce((a, m) => a + retenueTotalMonth(m.id, M), 0);

  const openNew = () => { setEditId(null); setForm({ ...emptyForm(branch.id), matricule: nextMatricule(staff), atelier: branch.city }); setModalOpen(true); };
  const openEdit = (m: StaffMember) => {
    setEditId(m.id);
    setForm({
      name: m.name, role: m.role, branchId: m.branchId, phone: m.phone, email: m.email, compteMail: m.compteMail ?? '', since: m.since,
      salaire: String(m.salaireXof), auFauteuil: m.auFauteuil,
      partPourboire: String(m.partPourboire ?? 1),
      commissionne: m.commissionne === true,
      commissionTaux: m.commissionTauxPct !== undefined ? String(m.commissionTauxPct) : '',
      matricule: m.matricule ?? '', cnssNum: m.cnssNum ?? '', ifu: m.ifu ?? '',
      contractType: m.contractType ?? 'CDI', atelier: m.atelier ?? '', commissionPct: m.commissionPct != null ? String(m.commissionPct) : '', paiement: m.paiement ?? '',
    });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    const salaireXof = Math.max(0, parseInt(form.salaire, 10) || 0);
    /* Champs du dossier paie communs à la création et à la modification. */
    const dossier = {
      matricule: form.matricule.trim() || undefined,
      cnssNum: form.cnssNum.trim() || undefined,
      ifu: form.ifu.trim() || undefined,
      contractType: (form.contractType || 'CDI') as StaffMember['contractType'],
      atelier: form.atelier.trim() || undefined,
      commissionPct: form.commissionPct.trim() === '' ? undefined : Math.max(0, Math.min(100, parseFloat(form.commissionPct) || 0)),
      paiement: form.paiement.trim() || undefined,
    };
    if (editId) {
      setStaff((prev) => prev.map((m) => m.id === editId
        ? { ...m, name: form.name.trim(), role: form.role, branchId: form.branchId, phone: form.phone.trim(), email: form.email.trim(), compteMail: form.compteMail.trim() || undefined, since: form.since, salaireXof, auFauteuil: form.auFauteuil, partPourboire: Math.max(0, Number(String(form.partPourboire).replace(',', '.')) || 0), commissionne: form.commissionne || undefined, commissionTauxPct: form.commissionne && form.commissionTaux.trim() ? Math.max(0, Math.min(100, parseInt(form.commissionTaux, 10) || 0)) : undefined, ...dossier }
        : m));
    } else {
      const nm: StaffMember = {
        id: `st-${uid()}`, branchId: form.branchId, name: form.name.trim(), role: form.role,
        phone: form.phone.trim(), email: form.email.trim(), compteMail: form.compteMail.trim() || undefined, since: form.since, auFauteuil: form.auFauteuil,
        partPourboire: Math.max(0, Number(String(form.partPourboire).replace(',', '.')) || 0),
        commissionne: form.commissionne || undefined, commissionTauxPct: form.commissionne && form.commissionTaux.trim() ? Math.max(0, Math.min(100, parseInt(form.commissionTaux, 10) || 0)) : undefined,
        salaireXof, commPrestaXof: 0, commProduitXof: 0, primeXof: 0,
        satisfaction: 0, wellbeing: 80, charge: 0, risk: 'faible',
        riskDrivers: 'Nouvelle recrue, intégration en cours.', nextStep: 'Parcours d’intégration',
        recognition: '—', statut: 'Nouveau',
        ...dossier,
      };
      setStaff((prev) => [...prev, nm]);
    }
    setModalOpen(false);
  };

  const remove = (id: string) => setStaff((prev) => prev.filter((m) => m.id !== id));

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Équipe & Croissance · les Maîtres"
        title="L’équipe."
        sub={`${branch.name}, celles et ceux qui couronnent, et la maison qui veille sur eux.`}
        actions={<Button variant="copper" onClick={openNew}>+ Ajouter un membre</Button>}
      />

      <RhDashboard />

      <Tabs<Tab>
        tabs={[{ k: 'equipe', l: 'Équipe' }, { k: 'production', l: 'Production & primes de seuil' }, { k: 'temps', l: 'Temps & absences' }, { k: 'paie', l: 'Paie' }, { k: 'parametres', l: 'Paramètres de paie' }, { k: 'retention', l: 'Rétention & bien-être' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'equipe' && (
        <div>
          <div className="tr-grid tr-grid--4">
            <Card filet="copper" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Effectif</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>{stats.n}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>{team.filter((m) => m.auFauteuil).length} au fauteuil</div>
            </Card>
            <Card filet="indigo" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Ancienneté moyenne</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>
                {stats.n === 0 ? '—' : stats.avgYears >= 1.5 ? `${Math.round(stats.avgYears)} ans` : `${Math.max(1, Math.round(stats.avgYears * 12))} mois`}
              </div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>fidélité de l’équipe</div>
            </Card>
            <Card filet="indigo" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Satisfaction clientes</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>{stats.avgSat ? stats.avgSat.toFixed(1).replace('.', ',') : '—'}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>sur 5 · retours des têtes couronnées</div>
            </Card>
            <Card filet="copper" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Risque de départ</div>
              <div className="mnd-stat__value" style={{ fontSize: 32 }}>{stats.risky}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>{stats.risky === 0 ? 'aucune alerte à suivre' : 'alerte à traiter cette semaine'}</div>
            </Card>
          </div>

          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 18, marginBottom: 8, lineHeight: 1.55 }}>
            Les flèches rangent l’équipe dans l’ordre où tu veux la voir. Cet ordre vaut partout :
            les mains d’un rendez-vous, « Mon mois », les listes d’attribution. Range-les comme on
            travaille, personne ne fait une tête seul, et les combinaisons reviennent tous les jours.
          </div>
          <Card style={{ overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table">
                <thead>
                  <tr>
                    <th style={{ width: 62 }}>Ordre</th><th>Membre</th><th>Rôle</th><th>Branche</th><th>Au fauteuil</th><th>Ancienneté</th><th>Salaire · base</th><th>Statut</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((m) => (
                    <tr
                      key={m.id}
                      className="tre-row--edit"
                      onClick={() => openEdit(m)}
                      title={`Modifier la fiche de ${m.name}`}
                    >
                      {/* LE DÉPLACEMENT NE DOIT PAS OUVRIR LA FICHE : la ligne
                          entière est cliquable, on arrête donc la propagation. */}
                      <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="tre-link-btn"
                          onClick={() => deplacer(m.id, -1)}
                          disabled={team[0]?.id === m.id}
                          title={`Remonter ${m.name}`}
                          style={{ padding: '2px 5px' }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="tre-link-btn"
                          onClick={() => deplacer(m.id, 1)}
                          disabled={team[team.length - 1]?.id === m.id}
                          title={`Descendre ${m.name}`}
                          style={{ padding: '2px 5px' }}
                        >
                          ↓
                        </button>
                      </td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span className="tre-avatar">{m.name.slice(0, 1)}</span>
                          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{m.name}</span>
                        </span>
                      </td>
                      <td className="mnd-muted">{m.role}</td>
                      <td className="mnd-muted">{branch.name}</td>
                      <td>{m.auFauteuil ? <Badge tone="copper">Au fauteuil</Badge> : <Badge>Hors fauteuil</Badge>}</td>
                      <td className="num">{anciennete(m.since)}</td>
                      <td className="num">{fmtMoney(m.salaireXof, currency)}</td>
                      <td><Pill tone={m.statut === 'Présent' ? 'ok' : 'muted'}>{m.statut}</Pill></td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button
                          className="tre-editbtn"
                          onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                          title={`Modifier ${m.name}`}
                        >
                          <Pencil size={13} /> Modifier
                        </button>
                        <button className="tre-link-btn" style={{ marginLeft: 12 }} onClick={(e) => { e.stopPropagation(); openAvance(m); }}>Avance sur salaire</button>
                        <button className="tre-link-btn tre-link-btn--danger" style={{ marginLeft: 12 }} onClick={(e) => { e.stopPropagation(); remove(m.id); }}>Retirer</button>
                      </td>
                    </tr>
                  ))}
                  {team.length === 0 && (
                    <tr><td colSpan={8} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucun membre dans cette branche, la maison attend ses Maîtres.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

        </div>
      )}

      {/* Ancien onglet « Paie & commissions » — remplacé par le module de runs
          (PaieRuns). Conservé désactivé le temps de la reprise complète. */}
      {false && tab === 'paie' && (
        <div>
          <DeepNote
            eyebrow={`Masse salariale · ${monthLabel()}`}
            actions={
              <Button variant="copper" onClick={() => setPaieLancee(true)}>
                Lancer la paie · Mobile Money
              </Button>
            }
          >
            <span style={{ fontSize: 34 }}>{fmtMoney(payrollTotal, currency)}</span>
          </DeepNote>
          {paieLancee && (
            <div className="tre-inline-note" style={{ marginBottom: 16 }}>
              <span className="mark">✦</span>
              <span>Paie de {monthLabel()} lancée, {team.length} virements Mobile Money programmés.</span>
            </div>
          )}

          <Card style={{ overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table">
                <thead>
                  <tr><th>Maître</th><th>Base</th><th>Comm. prestations</th><th>Comm. produits</th><th>Prime</th><th>Pourboires</th><th>Avances</th><th>Retenues</th><th>Net à verser</th></tr>
                </thead>
                <tbody>
                  {team.map((m) => {
                    const list = advancesForMonth(m.id, M);
                    const adv = advancesTotalMonth(m.id, M);
                    const mPrimes = primesForMonth(m.id, M);
                    const mTips = tipsForMonth(m.id, M);
                    const mRetenues = retenuesForMonth(m.id, M);
                    const retTotal = retenueTotalMonth(m.id, M);
                    return (
                    <tr key={m.id}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span className="tre-avatar">{m.name.slice(0, 1)}</span>
                          <span>
                            <span style={{ display: 'block' }}>{m.name}</span>
                            <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              <button className="tre-link-btn" onClick={() => openAdjust(m)}>
                                {isAdjusted(m) ? '● comm. ajustée' : 'Ajuster comm.'}
                              </button>
                              <button className="tre-link-btn" onClick={() => setYearFor(m)}>Détail annuel</button>
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="mnd-muted">{fmtMoney(m.salaireXof, currency)}</td>
                      <td>{fmtMoney(commPrestaOf(m), currency)}</td>
                      <td>{fmtMoney(commProduitOf(m), currency)}</td>
                      <td className="mnd-copper">
                        {mPrimes.length > 0 ? (
                          <div className="tre-adv-cell">
                            <span className="tre-adv-total" style={{ color: 'var(--color-copper)' }}>{fmtMoney(primeOf(m), currency)}</span>
                            <ul className="tre-adv-list">
                              {mPrimes.map((p) => (
                                <li key={p.id} className="tre-adv-item">
                                  <span className="tre-adv-amt" style={{ color: 'var(--color-copper)' }}>{fmtMoney(p.amountXof, currency)}</span>
                                  <span className="mnd-muted tre-adv-meta">{PRIME_LABEL[p.type]}{p.note ? ` · ${p.note}` : ''}</span>
                                  <button className="tre-link-btn tre-link-btn--danger tre-adv-rm" onClick={() => removePrime(m.id, p.id)} aria-label="Retirer la prime">×</button>
                                </li>
                              ))}
                            </ul>
                            <button className="tre-link-btn" onClick={() => openPrime(m)}>+ Prime</button>
                          </div>
                        ) : (
                          <button className="tre-link-btn" onClick={() => openPrime(m)}>+ Prime</button>
                        )}
                      </td>
                      <td>
                        {mTips.length > 0 ? (
                          <div className="tre-adv-cell">
                            <span className="tre-adv-total" style={{ color: 'var(--trv-success, #6e7c5c)' }}>{fmtMoney(tipOf(m), currency)}</span>
                            <ul className="tre-adv-list">
                              {mTips.map((t) => (
                                <li key={t.id} className="tre-adv-item">
                                  <span className="tre-adv-amt" style={{ color: 'var(--trv-success, #6e7c5c)' }}>{fmtMoney(t.amountXof, currency)}</span>
                                  <span className="mnd-muted tre-adv-meta">{shortDate(t.date)}{t.note ? ` · ${t.note}` : ''}</span>
                                  <button className="tre-link-btn tre-link-btn--danger tre-adv-rm" onClick={() => removeTip(m.id, t.id)} aria-label="Retirer le pourboire">×</button>
                                </li>
                              ))}
                            </ul>
                            <button className="tre-link-btn" onClick={() => openTip(m)}>+ Pourboire</button>
                          </div>
                        ) : (
                          <button className="tre-link-btn" onClick={() => openTip(m)}>+ Pourboire</button>
                        )}
                      </td>
                      <td>
                        {adv > 0 ? (
                          <div className="tre-adv-cell">
                            <span className="tre-adv-total">− {fmtMoney(adv, currency)}</span>
                            <ul className="tre-adv-list">
                              {list.map((a) => (
                                <li key={a.id} className="tre-adv-item">
                                  <span className="tre-adv-amt">− {fmtMoney(a.amountXof, currency)}</span>
                                  <span className="mnd-muted tre-adv-meta">{shortDate(a.date)}{a.note ? ` · ${a.note}` : ''}</span>
                                  <button className="tre-link-btn tre-link-btn--danger tre-adv-rm" onClick={() => removeAvance(m.id, a.id)} aria-label="Retirer l’avance">×</button>
                                </li>
                              ))}
                            </ul>
                            <button className="tre-link-btn" onClick={() => openAvance(m)}>+ Avance</button>
                          </div>
                        ) : (
                          <button className="tre-link-btn" onClick={() => openAvance(m)}>+ Avance sur salaire</button>
                        )}
                      </td>
                      <td>
                        {mRetenues.length > 0 ? (
                          <div className="tre-adv-cell">
                            <span className="tre-adv-total" style={{ color: 'var(--trv-error, #b0563e)' }}>− {fmtMoney(retTotal, currency)}</span>
                            <ul className="tre-adv-list">
                              {mRetenues.map((r) => (
                                <li key={r.id} className="tre-adv-item">
                                  <span className="tre-adv-amt" style={{ color: 'var(--trv-error, #b0563e)' }}>− {fmtMoney(r.amountXof, currency)}</span>
                                  <span className="mnd-muted tre-adv-meta">{RETENUE_LABEL[r.type]}{r.days ? ` · ${r.days} j` : ''}{r.note ? ` · ${r.note}` : ''}</span>
                                  <button className="tre-link-btn tre-link-btn--danger tre-adv-rm" onClick={() => removeRetenue(m.id, r.id)} aria-label="Retirer la retenue">×</button>
                                </li>
                              ))}
                            </ul>
                            <button className="tre-link-btn" onClick={() => openRetenue(m)}>+ Retenue</button>
                          </div>
                        ) : (
                          <button className="tre-link-btn" onClick={() => openRetenue(m)}>+ Retenue</button>
                        )}
                      </td>
                      <td className="num">{fmtMoney(netApresAvances(m), currency)}</td>
                    </tr>
                    );
                  })}
                  {team.length === 0 && (
                    <tr><td colSpan={9} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucun maître à payer, la paie s’ouvrira avec l’équipe.</td></tr>
                  )}
                  {team.length > 0 && (
                    <tr>
                      <td style={{ fontWeight: 500 }}>Total · {monthLabel()}</td>
                      <td className="mnd-muted">{fmtMoney(team.reduce((a, m) => a + m.salaireXof, 0), currency)}</td>
                      <td>{fmtMoney(team.reduce((a, m) => a + commPrestaOf(m), 0), currency)}</td>
                      <td>{fmtMoney(team.reduce((a, m) => a + commProduitOf(m), 0), currency)}</td>
                      <td className="mnd-copper">{fmtMoney(team.reduce((a, m) => a + primeOf(m), 0), currency)}</td>
                      <td>{fmtMoney(team.reduce((a, m) => a + tipOf(m), 0), currency)}</td>
                      <td>{advancesTotal > 0 ? <span className="tre-adv-total">− {fmtMoney(advancesTotal, currency)}</span> : '—'}</td>
                      <td>{retenuesTotal > 0 ? <span className="tre-adv-total" style={{ color: 'var(--trv-error, #b0563e)' }}>− {fmtMoney(retenuesTotal, currency)}</span> : '—'}</td>
                      <td className="num">{fmtMoney(payrollTotal, currency)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

        </div>
      )}

      {tab === 'production' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* ── LES SEUILS ─────────────────────────────────────────────
              Ce qui déclenche un versement passe avant ce qui l'explique. */}
          {seuils.length === 0 ? (
            <Card style={{ padding: '18px 20px' }}>
              <div className="tre-rates__title">Aucun barème de seuils</div>
              <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6, maxWidth: '62ch' }}>
                Une prime de seuil récompense le volume, là où la commission récompense le montant :
                vingt-cinq shampoings dans le mois valent 5 000 F, quarante en valent 7 000. Les
                barèmes se posent dans <strong style={{ fontWeight: 500 }}>Paramètres de paie</strong>.
              </div>
            </Card>
          ) : seuils.map((regle) => {
            const atteints = team
              .map((m) => ({ m, compte: compteRegle(regle, m.id) }))
              .map((x) => ({ ...x, prime: primeDeSeuil(regle, x.compte) }))
              .filter((x) => x.compte > 0)
              .sort((a, b) => b.compte - a.compte);
            const paliers = [...regle.paliers].sort((a, b) => a.seuil - b.seuil);
            return (
              <Card key={regle.id} style={{ padding: '16px 18px' }}>
                <div className="tre-rates__head">
                  <span className="tre-rates__title">{regle.libelle}</span>
                  <span className="mnd-muted" style={{ fontSize: 12 }}>
                    {paliers.map((pa) => `${pa.seuil} → ${fmtMoney(pa.montantXof, currency)}`).join('  ·  ')}
                  </span>
                </div>
                <div className="mnd-scroll-x" style={{ marginTop: 12 }}>
                  <table className="tre-table">
                    <thead>
                      <tr>
                        <th>Membre</th>
                        <th className="num">Compte</th>
                        <th>Palier</th>
                        <th className="num">Prime due</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {atteints.length === 0 && (
                        <tr><td colSpan={5} className="mnd-muted">Personne n’a encore de compte sur ce barème ce mois-ci.</td></tr>
                      )}
                      {atteints.map(({ m, compte, prime }) => {
                        /* LA MÊME PRIME NE S'INSCRIT PAS DEUX FOIS. On la
                           reconnaît à sa note, qui porte la règle et le mois :
                           rouvrir l'écran ne doit jamais doubler un versement. */
                        const marque = `seuil:${regle.id}:${M}`;
                        const deja = primesForMonth(m.id, M).find((pr) => pr.note === marque);
                        const suivant = paliers.find((pa) => compte < pa.seuil);
                        return (
                          <tr key={m.id}>
                            <td>{m.name}</td>
                            <td className="num">{fmtCompte(compte)}</td>
                            <td style={{ fontSize: 12.5 }}>
                              {prime
                                ? <span style={{ color: 'var(--copper-700)' }}>◆ seuil {prime.seuil} atteint</span>
                                : suivant
                                  ? <span className="mnd-muted">encore {fmtCompte(suivant.seuil - compte)} pour {suivant.seuil}</span>
                                  : <span className="mnd-muted">—</span>}
                            </td>
                            <td className="num">{prime ? fmtMoney(prime.montantXof, currency) : '—'}</td>
                            <td>
                              {prime && (deja
                                ? <span className="mnd-muted" style={{ fontSize: 12 }}>inscrite en prime</span>
                                : <button className="tre-link-btn" onClick={() => inscrirePrime(m, regle, prime.montantXof, marque)}>Inscrire en prime du mois</button>)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}

          {/* ── LA PRODUCTION ──────────────────────────────────────────
              La matière première des seuils : ce que chacun a exécuté. */}
          <Card style={{ padding: '16px 18px' }}>
            <div className="tre-rates__head">
              <span className="tre-rates__title">Production · {cap(monthTitle(M))}</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>
                Lue sur les <strong style={{ fontWeight: 500 }}>mains</strong> désignées à chaque prestation.
                Un geste fait à deux vaut une demi-part de chaque côté : la somme égale le mois, jamais davantage.
              </span>
            </div>
            <div className="mnd-scroll-x" style={{ marginTop: 12 }}>
              <table className="tre-table">
                <thead>
                  <tr>
                    <th>Membre</th>
                    <th className="num">Gestes</th>
                    <th className="num">Têtes</th>
                    <th className="num">Heures</th>
                    <th className="num">Valeur produite</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((m) => {
                    const f = production.get(m.id);
                    return (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td className="num">{f ? fmtCompte(f.gestes) : '—'}</td>
                        <td className="num">{f ? fmtCompte(f.tetes) : '—'}</td>
                        <td className="num">{f ? fmtCompte(f.minutes / 60) : '—'}</td>
                        <td className="num">{f ? fmtMoney(Math.round(f.valeur), currency) : '—'}</td>
                      </tr>
                    );
                  })}
                  {/* LE TOTAL DIT SI LE COMPTE EST BON : la valeur doit égaler
                      le chiffre du mois. Plus bas, des rituels n'ont ni mains
                      désignées ni maître reconnu dans l'équipe. */}
                  <tr>
                    <td style={{ fontWeight: 500 }}>Total attribué</td>
                    <td className="num">{fmtCompte([...production.values()].reduce((n, f) => n + f.gestes, 0))}</td>
                    <td className="num">{fmtCompte([...production.values()].reduce((n, f) => n + f.tetes, 0))}</td>
                    <td className="num">{fmtCompte([...production.values()].reduce((n, f) => n + f.minutes, 0) / 60)}</td>
                    <td className="num">{fmtMoney(Math.round([...production.values()].reduce((n, f) => n + f.valeur, 0)), currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'temps' && <TempsAbsences />}
      {tab === 'paie' && <PaieRuns />}
      {tab === 'parametres' && (
        <div>
          {/* LE BAREME DE COMMISSION EST UN PARAMETRE DE PAIE. Il vivait dans
              l'onglet Equipe, sous l'effectif : on ne l'y trouvait pas, parce
              que ce n'est pas la qu'on le cherche. */}
          <Card style={{ marginBottom: 14, padding: '16px 18px' }}>
            <div className="tre-rates__head">
              <span className="tre-rates__title">Commission par palier</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>
                Le barème de la Maison. Il ne s’applique qu’aux membres marqués « Commissionné », et
                seulement s’ils ne portent pas leur propre taux. 0 % = pas de commission.
              </span>
            </div>
            <div className="tre-rates">
              {([
                ['fondation', 'Fondation'],
                ['elevation', 'Élévation'],
                ['souverainete', 'Souveraineté'],
                ['produits', 'Produits'],
              ] as [keyof CommRates, string][]).map(([k, label]) => (
                <label className="tre-rate" key={k}>
                  <span className="tre-rate__label">{label}</span>
                  <span className="tre-rate__field">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={String(rates[k])}
                      onChange={(e) => setRate(k, e.target.value)}
                      style={{ width: 72, textAlign: 'right' }}
                    />
                    <span className="tre-rate__pct">%</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.55 }}>
              La commission d’une prestation va à ses <strong style={{ fontWeight: 500 }}>mains</strong>, celles
              désignées au rendez-vous, et se partage entre elles à parts égales. À défaut de mains
              désignées, elle revient au maître assigné.
            </div>
          </Card>
          {/* ── LES POINTS DU MOIS ─────────────────────────────────────
              Ce qui rend le personnel autonome : chacun pointe depuis « Mon
              mois » et voit ses points grandir. Le seuil, pas le rang :
              plusieurs peuvent toucher la prime le même mois. */}
          <Card style={{ marginBottom: 14, padding: '16px 18px' }}>
            <div className="tre-rates__head">
              <span className="tre-rates__title">Points & prime du mois</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>
                Le pointage, la ponctualité et les heures au-delà. Chacun les inscrit lui-même,
                qui ne pointe pas ne marque rien.
              </span>
            </div>
            <div className="tre-rates">
              {([
                ['toleranceMin', 'Tolérance', 'min'],
                ['ptsPointage', 'Avoir pointé', 'pts'],
                ['ptsPonctualite', 'À l’heure', 'pts'],
                ['ptsParHeureSup', 'Par heure au-delà', 'pts'],
                ['seuilPrime', 'Seuil de prime', 'pts'],
                ['primeXof', 'Montant de la prime', 'F'],
              ] as [keyof BaremePoints, string, string][]).map(([k, label, unite]) => (
                <label className="tre-rate" key={String(k)}>
                  <span className="tre-rate__label">{label}</span>
                  <span className="tre-rate__field">
                    <Input
                      type="number"
                      min={0}
                      value={String(bareme[k])}
                      onChange={(e) => setBareme({ ...bareme, [k]: Math.max(0, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0) })}
                      style={{ width: 88, textAlign: 'right' }}
                    />
                    <span className="tre-rate__pct">{unite}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.55 }}>
              La ponctualité se mesure sur l’<strong style={{ fontWeight: 500 }}>horaire du salon</strong> du jour,
              plus la tolérance. Les heures au-delà se comptent en heures entières après la fermeture :
              une demi-heure de rangement n’est pas une heure supplémentaire.
            </div>
          </Card>

          {/* ── LE BARÈME DE SEUILS ────────────────────────────────────
              Il se règle ici, à côté du barème de commission : les deux
              disent ce que la Maison verse en plus du salaire. */}
          <Card style={{ marginBottom: 14, padding: '16px 18px' }}>
            <div className="tre-rates__head">
              <span className="tre-rates__title">Primes de seuil</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>
                Le volume, là où la commission récompense le montant. Un seuil se franchit, il ne se
                proratise pas, et l’on retient le palier le plus haut atteint, jamais leur somme.
              </span>
            </div>

            {seuils.length === 0 && (
              <div className="mnd-muted" style={{ fontSize: 12.5, margin: '12px 0', lineHeight: 1.6 }}>
                Aucun barème. Exemple : « Shampoings » visant KLƆKLƆ™, avec 25 → 5 000 F et 40 → 7 000 F.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              {seuils.map((regle) => (
                <div key={regle.id} style={{ border: '1px solid var(--hairline)', borderRadius: 4, padding: '12px 14px' }}>
                  <div className="tr-grid tr-grid--2">
                    <Field label="Nom du barème">
                      <Input
                        value={regle.libelle}
                        onChange={(e) => majRegle(regle.id, { libelle: e.target.value })}
                        placeholder="Shampoings"
                      />
                    </Field>
                    <Field label="Ce qui est compté">
                      <Select
                        value={regle.cible.kind === 'service' ? `s:${regle.cible.id}`
                          : regle.cible.kind === 'categorie' ? `c:${regle.cible.id}`
                          : regle.cible.kind}
                        onChange={(e) => majRegle(regle.id, { cible: cibleDepuis(e.target.value) })}
                      >
                        <option value="tetes">Les têtes, un rituel, quel qu’il soit</option>
                        <option value="tout">Toutes les prestations</option>
                        <optgroup label="Une famille entière">
                          {categories.map((c) => (
                            <option key={c.id} value={`c:${c.id}`}>{c.fon} · {c.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Une prestation précise">
                          {[...services].sort((a, b) => a.name.localeCompare(b.name)).map((sv) => (
                            <option key={sv.id} value={`s:${sv.id}`}>{sv.name}</option>
                          ))}
                        </optgroup>
                      </Select>
                    </Field>
                  </div>

                  <div style={{ marginTop: 4 }}>
                    <span className="trc-microlabel">Paliers</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                      {regle.paliers.map((pa, i) => (
                        <div key={`${regle.id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Input
                            inputMode="numeric"
                            value={String(pa.seuil)}
                            onChange={(e) => majPalier(regle.id, i, { seuil: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0 })}
                            style={{ width: 84, textAlign: 'right' }}
                          />
                          <span className="mnd-muted" style={{ fontSize: 12 }}>atteints →</span>
                          <Input
                            inputMode="numeric"
                            value={String(pa.montantXof)}
                            onChange={(e) => majPalier(regle.id, i, { montantXof: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0 })}
                            style={{ width: 110, textAlign: 'right' }}
                          />
                          <span className="mnd-muted" style={{ fontSize: 12 }}>F</span>
                          <button className="tre-link-btn tre-link-btn--danger" onClick={() => retirerPalier(regle.id, i)}>×</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <button className="tre-link-btn" onClick={() => ajouterPalier(regle.id)}>+ Palier</button>
                      <button className="tre-link-btn tre-link-btn--danger" onClick={() => retirerRegle(regle.id)}>Supprimer ce barème</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <button className="tre-link-btn" onClick={ajouterRegle}>+ Barème</button>
            </div>

            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.55 }}>
              Un geste fait à deux compte une demi-part de chaque côté. Une famille compte aussi ce
              qui est rangé sous elle : viser GBÈJÍ™ prend les SÍNSIN™.
            </div>
          </Card>
          <PaieParametres />
        </div>
      )}

      {tab === 'retention' && (
        <div>
          <div className="tre-quote" style={{ marginBottom: 18 }}>
            « On ne retient pas un Maître par le salaire seul, mais par la charge juste, la croissance visible et la reconnaissance. La maison veille sur ceux qui couronnent. »
          </div>
          {team.length === 0 && (
            <Card className="tre-empty">
              <div className="tre-empty__title">Personne à veiller pour l’instant.</div>
              <div className="tre-empty__sub">Ajoutez un membre à l’équipe, bien-être, charge et reconnaissance se suivront ici.</div>
            </Card>
          )}
          <div className="tr-grid tr-grid--2">
            {team.map((m) => (
              <Card key={m.id} style={{ padding: '18px 20px', borderLeft: `3px solid ${m.risk === 'élevé' ? '#8f3b30' : m.risk === 'modéré' ? '#c9a227' : 'var(--color-copper)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="tre-avatar" style={{ width: 42, height: 42, fontSize: 17 }}>{m.name.slice(0, 1)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>{m.name}</div>
                    <div className="mnd-muted" style={{ fontSize: 11 }}>{anciennete(m.since)} d’ancienneté · {m.role}</div>
                  </div>
                  <Pill tone={riskTone(m.risk)}>Risque {m.risk}</Pill>
                </div>

                <div style={{ display: 'flex', gap: 18, marginTop: 16, alignItems: 'flex-start' }}>
                  <Gauge value={m.wellbeing} label="Bien-être" />
                  <Gauge value={Math.round(m.satisfaction * 20)} label={`Satisfaction ${m.satisfaction ? m.satisfaction.toFixed(1).replace('.', ',') : '—'} / 5`} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-soft)' }}>
                      <span>Charge / capacité</span><span>{m.charge} %</span>
                    </div>
                    <div style={{ marginTop: 5 }}><Bar pct={m.charge} fill={m.charge > 90 ? '#c9a227' : 'var(--color-copper)'} /></div>
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.4, fontWeight: 300 }}>{m.riskDrivers}</div>
                  </div>
                </div>

                <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-600)', flex: 'none', width: 96 }}>Croissance</span>
                    <span style={{ fontSize: 12.5 }}>{m.nextStep}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-600)', flex: 'none', width: 96 }}>Reconnaissance</span>
                    <span style={{ fontSize: 12.5 }}>{m.recognition}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <Modal title={editId ? 'Paramètres du membre.' : 'Nouveau membre.'} onClose={() => setModalOpen(false)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom du membre">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Prénom Nom" />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Téléphone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="+229 01 00 00 00 00" />
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} inputMode="email" placeholder="prenom@mnd.bj" />
              </Field>
              {/* LE LIEN FICHE ↔ COMPTE — 20 août. L'adresse avec laquelle la
                  personne SE CONNECTE au Trône, quand elle diffère du contact
                  (locksmnd@ vs la fiche « Gerard T. »). C'est elle qui fait
                  foi pour le Fil, le Tableau et « Mon mois ». Vide = l'Email
                  ci-dessus sert aux deux. */}
              <Field label="E-mail de connexion · si différent">
                <Input value={form.compteMail} onChange={(e) => setForm({ ...form, compteMail: e.target.value })} inputMode="email" placeholder="le compte avec lequel il/elle se connecte" />
              </Field>
            </div>
            <Field label="Fonction dans la Maison">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {fonctions.map((r) => (
                  <button
                    key={r}
                    className={`tre-chip ${form.role === r ? 'is-on' : ''}`}
                    /* CE QUI N’EST PAS AU FAUTEUIL NE COMMISSIONNE PAS. Un
                       jardinier n’exécute pas de prestation : sa fonction pose
                       « hors fauteuil » d’office. Défaut juste, pas serrure. */
                    onClick={() => setForm({ ...form, role: r, auFauteuil: FONCTIONS_AU_FAUTEUIL.has(r) })}
                  >
                    {r}
                  </button>
                ))}
                {/* LA LISTE N’EST PAS FERMÉE. Une maison invente ses métiers —
                    en figer sept aurait repoussé le problème d’un an. */}
                <button
                  className="tre-chip"
                  style={{ borderStyle: 'dashed' }}
                  onClick={() => {
                    const nom = window.prompt('Quelle fonction ajouter ? Elle rejoindra la liste de la Maison, sur tous les appareils.');
                    if (!nom?.trim()) return;
                    ajouteUneFonction(nom);
                    setForm({ ...form, role: nom.trim(), auFauteuil: FONCTIONS_AU_FAUTEUIL.has(nom.trim()) });
                  }}
                >
                  + Autre fonction
                </button>
              </div>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 7, lineHeight: 1.5 }}>
                Les fonctions au fauteuil (maître, maîtresse, praticienne, praticien) exécutent des
                prestations et peuvent commissionner. Les autres, accueil, entretien, sécurité,
                jardinier, chauffeur, se posent d’office « hors fauteuil ».
              </div>
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Branche">
                <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Date d’entrée">
                <Input type="date" value={form.since} onChange={(e) => setForm({ ...form, since: e.target.value })} />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label={`Salaire de base · ${currency === 'XOF' ? 'F / mois' : 'XOF / mois'}`}>
                <Input value={form.salaire} onChange={(e) => setForm({ ...form, salaire: e.target.value.replace(/[^0-9]/g, '') })} inputMode="numeric" placeholder="180000" />
              </Field>
              <Field label="Au fauteuil">
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`tre-chip ${form.auFauteuil ? 'is-on' : ''}`} onClick={() => setForm({ ...form, auFauteuil: true })}>Exécute des prestations</button>
                  <button className={`tre-chip ${!form.auFauteuil ? 'is-on' : ''}`} onClick={() => setForm({ ...form, auFauteuil: false })}>Hors fauteuil</button>
                </div>
              </Field>
              {/* LA PART DE POURBOIRE. Le pourboire se partage entre TOUS, au
                  fauteuil ou non — c'est la regle de la Maison. Une part, une
                  demi-part pour le couple fondateur qui n'en compte qu'une a
                  deux, zero pour qui n'entre pas dans le partage. */}
              {/* LA COMMISSION — un reglage, jamais un statut deduit. Chez MND
                  on ne commissionne pas les salaries : elle ne concerne que le
                  maitre recrute ponctuellement, et le praticien devenu maitre
                  le jour ou on l'a decide pour lui. */}
              <Field label="Commission sur ses prestations">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className={`tre-chip ${!form.commissionne ? 'is-on' : ''}`} onClick={() => setForm({ ...form, commissionne: false })}>Aucune</button>
                  <button className={`tre-chip ${form.commissionne ? 'is-on' : ''}`} onClick={() => setForm({ ...form, commissionne: true })}>Commissionné</button>
                </div>
                {form.commissionne && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                    <Input
                      inputMode="numeric"
                      value={form.commissionTaux}
                      onChange={(e) => setForm({ ...form, commissionTaux: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="son taux"
                      style={{ width: 96, textAlign: 'right' }}
                    />
                    <span className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                      % du montant facturé. Vide : le barème de la Maison par palier s’applique.
                    </span>
                  </div>
                )}
              </Field>
              <Field label="Part de pourboire">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['1', 'Une part'], ['0.5', 'Une demi-part'], ['0', 'Aucune']].map(([v, l]) => (
                    <button
                      key={v}
                      className={`tre-chip ${form.partPourboire === v ? 'is-on' : ''}`}
                      onClick={() => setForm({ ...form, partPourboire: v })}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                  Le partage suit ces parts, jamais un nombre fixe : trois personnes à une part et deux
                  à une demi-part font les quatre parts d’aujourd’hui.
                </div>
              </Field>
            </div>

            {/* Dossier paie — alimente les runs et le bulletin */}
            <div className="tre-sec-label" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>Dossier paie</div>
            <div className="tr-grid tr-grid--2">
              <Field label="Matricule"><Input value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} placeholder="MND-EMP-001" /></Field>
              <Field label="Type de contrat">
                <Select value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
                  {CONTRACT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="N° CNSS"><Input value={form.cnssNum} onChange={(e) => setForm({ ...form, cnssNum: e.target.value })} placeholder="—" /></Field>
              <Field label="IFU (identifiant fiscal)"><Input value={form.ifu} onChange={(e) => setForm({ ...form, ifu: e.target.value })} placeholder="—" /></Field>
              <Field label="Atelier d’affectation"><Input value={form.atelier} onChange={(e) => setForm({ ...form, atelier: e.target.value })} placeholder="Cotonou" /></Field>
              <Field label="Commission sur prestations (%)"><Input inputMode="decimal" value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} placeholder="0" /></Field>
            </div>
            <Field label="Coordonnées de paiement (Mobile Money / banque)">
              <Input value={form.paiement} onChange={(e) => setForm({ ...form, paiement: e.target.value })} placeholder="MTN MoMo · +229 …" />
            </Field>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={save} disabled={!form.name.trim()}>
                {editId ? 'Enregistrer les modifications' : 'Ajouter à l’équipe'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {avanceFor && (
        <Modal title="Avance sur salaire." onClose={() => setAvanceFor(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              Pour <strong style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{avanceFor.name}</strong> · déduite du bulletin du mois de l’avance.
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label={`Montant · ${currency === 'XOF' ? 'F' : 'XOF'}`}>
                <Input value={avanceForm.amount} onChange={(e) => setAvanceForm({ ...avanceForm, amount: e.target.value.replace(/[^0-9]/g, '') })} inputMode="numeric" placeholder="50000" />
              </Field>
              <Field label="Date de l’avance">
                <Input type="date" value={avanceForm.date} onChange={(e) => setAvanceForm({ ...avanceForm, date: e.target.value })} />
              </Field>
            </div>
            {/* LA CONTREPARTIE — 23 août 2026. « Comment régulariser les
                avances avec leur contrepartie ? » Elles n’en avaient aucune :
                les billets quittaient le tiroir sans que rien ne l’écrive. */}
            <Field label="De quelle caisse sort cet argent ?">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {caissesDeLaMaison.map((c) => (
                  <button
                    key={c.id}
                    className={`tre-chip ${avanceForm.cashbox === c.name ? 'is-on' : ''}`}
                    onClick={() => setAvanceForm({ ...avanceForm, cashbox: c.name })}
                  >
                    {c.name}
                  </button>
                ))}
                <button
                  className={`tre-chip ${!avanceForm.cashbox ? 'is-on' : ''}`}
                  onClick={() => setAvanceForm({ ...avanceForm, cashbox: '' })}
                >
                  Sans caisse
                </button>
              </div>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 7, lineHeight: 1.5 }}>
                L’avance s’inscrit aussitôt en <b>Dépenses · Salaires</b> et sort de cette caisse.
                Le bulletin du mois la déduira du net : la charge du jour de paie ne portera que
                le reste, les deux additionnées font ce qui a été versé.
              </div>
            </Field>
            <Field label="Note (facultatif)">
              <Input value={avanceForm.note} onChange={(e) => setAvanceForm({ ...avanceForm, note: e.target.value })} placeholder="Motif de l’avance…" />
            </Field>
            {advancesTotalMonth(avanceFor.id, M) > 0 && (
              <div className="tre-inline-note">
                <span className="mark">✦</span>
                <span>Déjà avancé ce mois, {fmtMoney(advancesTotalMonth(avanceFor.id, M), currency)}.</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setAvanceFor(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveAvance} disabled={!avanceForm.amount || (parseInt(avanceForm.amount, 10) || 0) <= 0}>
                Enregistrer l’avance
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {adjustFor && (
        <Modal title="Ajuster les commissions." onClose={() => setAdjustFor(null)} width={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              Pour <strong style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{adjustFor.name}</strong> · paie de {monthLabel()}. Les montants saisis remplacent le calcul automatique de ce mois. (Les primes se gèrent à part.)
            </div>
            <div className="tre-inline-note">
              <span className="mark">✦</span>
              <span>
                Calcul auto : prestations {fmtMoney(computeComm(adjustFor, M).presta, currency)} · produits {fmtMoney(computeComm(adjustFor, M).produit, currency)}.
              </span>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Comm. prestations">
                <Input value={adjustForm.presta} inputMode="numeric" onChange={(e) => setAdjustForm({ ...adjustForm, presta: e.target.value.replace(/[^0-9]/g, '') })} />
              </Field>
              <Field label="Comm. produits">
                <Input value={adjustForm.produit} inputMode="numeric" onChange={(e) => setAdjustForm({ ...adjustForm, produit: e.target.value.replace(/[^0-9]/g, '') })} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
              {isAdjusted(adjustFor) && (
                <button className="tre-link-btn" onClick={() => { resetAdjust(adjustFor.id); setAdjustFor(null); }}>
                  ↺ Revenir au calcul auto
                </button>
              )}
              <Button variant="ghost" onClick={() => setAdjustFor(null)} style={{ marginLeft: 'auto' }}>Annuler</Button>
              <Button variant="copper" onClick={saveAdjust}>Enregistrer</Button>
            </div>
          </div>
        </Modal>
      )}

      {primeFor && (
        <Modal title="Attribuer une prime." onClose={() => setPrimeFor(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              Pour <strong style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{primeFor.name}</strong> · ajoutée à la paie du mois de la date choisie.
            </div>
            <Field label="Type de prime">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {PRIME_TYPES.map(([k, label]) => (
                  <button key={k} type="button" className={`tre-chip ${primeForm.type === k ? 'is-on' : ''}`} onClick={() => setPrimeForm({ ...primeForm, type: k })}>{label}</button>
                ))}
              </div>
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label={`Montant · ${currency === 'XOF' ? 'F' : 'XOF'}`}>
                <Input value={primeForm.amount} inputMode="numeric" placeholder="25000" onChange={(e) => setPrimeForm({ ...primeForm, amount: e.target.value.replace(/[^0-9]/g, '') })} />
              </Field>
              <Field label="Date">
                <Input type="date" value={primeForm.date} onChange={(e) => setPrimeForm({ ...primeForm, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Note (facultatif)">
              <Input value={primeForm.note} onChange={(e) => setPrimeForm({ ...primeForm, note: e.target.value })} placeholder="Motif, ex. objectif de rétention atteint" />
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setPrimeFor(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={savePrime} disabled={!primeForm.amount || parseXof(primeForm.amount) <= 0}>
                Attribuer la prime
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {tipFor && (
        <Modal title="Pourboire." onClose={() => setTipFor(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              Pour <strong style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{tipFor.name}</strong> · ajouté au net à verser du mois de la date choisie.
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label={`Montant · ${currency === 'XOF' ? 'F' : 'XOF'}`}>
                <Input value={tipForm.amount} inputMode="numeric" placeholder="5000" onChange={(e) => setTipForm({ ...tipForm, amount: e.target.value.replace(/[^0-9]/g, '') })} />
              </Field>
              <Field label="Date">
                <Input type="date" value={tipForm.date} onChange={(e) => setTipForm({ ...tipForm, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Note (facultatif)">
              <Input value={tipForm.note} onChange={(e) => setTipForm({ ...tipForm, note: e.target.value })} placeholder="Ex. espèces · cliente ravie" />
            </Field>
            {tipTotalMonth(tipFor.id, M) > 0 && (
              <div className="tre-inline-note">
                <span className="mark">✦</span>
                <span>Déjà reçu ce mois, {fmtMoney(tipTotalMonth(tipFor.id, M), currency)}.</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setTipFor(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveTip} disabled={!tipForm.amount || parseXof(tipForm.amount) <= 0}>
                Enregistrer le pourboire
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {retenueFor && (
        <Modal title="Retenue sur salaire." onClose={() => setRetenueFor(null)} width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              Pour <strong style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>{retenueFor.name}</strong> · déduite du net à verser du mois de la date choisie.
            </div>
            <Field label="Motif de la retenue">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {RETENUE_TYPES.map(([k, label]) => (
                  <button key={k} type="button" className={`tre-chip ${retenueForm.type === k ? 'is-on' : ''}`} onClick={() => setRetenueForm({ ...retenueForm, type: k })}>{label}</button>
                ))}
              </div>
            </Field>
            <div className="tre-inline-note">
              <span className="mark">✦</span>
              <span>Salaire journalier de référence · {fmtMoney(dailyRate(retenueFor), currency)} (base ÷ {JOURS_OUVRABLES} j ouvrables). Saisissez des jours pour calculer, ou un montant directement.</span>
            </div>
            <div className="tr-grid tr-grid--3">
              <Field label="Jours non travaillés">
                <Input value={retenueForm.days} inputMode="decimal" placeholder="0" onChange={(e) => setRetenueDays(retenueFor, e.target.value)} />
              </Field>
              <Field label={`Montant retenu · ${currency === 'XOF' ? 'F' : 'XOF'}`}>
                <Input value={retenueForm.amount} inputMode="numeric" placeholder="0" onChange={(e) => setRetenueForm({ ...retenueForm, amount: e.target.value.replace(/[^0-9]/g, ''), days: '' })} />
              </Field>
              <Field label="Date">
                <Input type="date" value={retenueForm.date} onChange={(e) => setRetenueForm({ ...retenueForm, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Note (facultatif)">
              <Input value={retenueForm.note} onChange={(e) => setRetenueForm({ ...retenueForm, note: e.target.value })} placeholder="Précision, ex. maladie sans maintien, mise à pied disciplinaire…" />
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setRetenueFor(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveRetenue} disabled={!retenueForm.amount || parseXof(retenueForm.amount) <= 0}>
                Appliquer la retenue
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {yearFor && (() => {
        const year = new Date().getFullYear();
        const rows = yearMonths(year).map((mk) => {
          const c = computeComm(yearFor, mk);
          const ov = mk === M ? ovOf(yearFor.id) : {};
          const presta = ov.commPresta ?? c.presta;
          const produit = ov.commProduit ?? c.produit;
          const pr = primeTotalMonth(yearFor.id, mk);
          const tp = tipTotalMonth(yearFor.id, mk);
          const av = advancesTotalMonth(yearFor.id, mk);
          const re = retenueTotalMonth(yearFor.id, mk);
          const base = yearFor.salaireXof;
          /* Net et cotisations par la MÊME porte que le tableau (`paieDuMois`) :
             brut − CNSS − ITS − avances − retenues. Le détail retombe donc sur
             le net, cotisations comprises. */
          const paie = paieDuMois(yearFor, mk);
          return { mk, base, presta, produit, prime: pr, tip: tp, cnss: paie.cnssSalariale, its: paie.its, avance: av, retenue: re, net: paie.net };
        });
        const tot = rows.reduce((t, r) => ({
          base: t.base + r.base, presta: t.presta + r.presta, produit: t.produit + r.produit,
          prime: t.prime + r.prime, tip: t.tip + r.tip, cnss: t.cnss + r.cnss, its: t.its + r.its,
          avance: t.avance + r.avance, retenue: t.retenue + r.retenue, net: t.net + r.net,
        }), { base: 0, presta: 0, produit: 0, prime: 0, tip: 0, cnss: 0, its: 0, avance: 0, retenue: 0, net: 0 });
        /* Les colonnes CNSS/ITS n'apparaissent QUE si quelqu'un est déclaré : un
           personnel non concerné ne les voit pas (elles vaudraient 0 partout). */
        const montreCotis = tot.cnss > 0 || tot.its > 0;
        const staff = yearFor;
        return (
          <Modal title={`Salaire ${year} · ${staff.name}`} onClose={() => setYearFor(null)} width={980}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <div className="mnd-muted" style={{ fontSize: 12.5, maxWidth: 520 }}>
                Détail mois par mois. « Confirmer » enregistre le règlement avec votre nom et l'horodatage, une preuve datée. « Bulletin » génère le PDF à remettre.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="mnd-muted" style={{ fontSize: 11 }}>Moyen de règlement</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {moyensAOffrir(moyensPose, payMethod).map((p) => (
                    <button key={p} type="button" className={`tre-chip ${payMethod === p ? 'is-on' : ''}`} onClick={() => setPayMethod(p)}>{p}</button>
                  ))}
                </div>
                <Button variant="copper" size="sm" onClick={() => void downloadYearlyPayslip(staff, year)}>Bulletin annuel · PDF</Button>
              </div>
            </div>
            <div className="mnd-scroll-x">
              <table className="tre-table tre-year">
                <thead>
                  <tr><th>Mois</th><th>Base</th><th>Comm. presta.</th><th>Comm. prod.</th><th>Primes</th><th>Pourboires</th>{montreCotis && <><th>CNSS</th><th>ITS</th></>}<th>Avances</th><th>Retenues</th><th>Net versé</th><th>Règlement</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const conf = confirmOf(r.mk, staff.id);
                    return (
                    <tr key={r.mk}>
                      <td style={{ textTransform: 'capitalize' }}>{shortMonth(r.mk)}</td>
                      <td className="mnd-muted">{fmtMoney(r.base, currency)}</td>
                      <td>{fmtMoney(r.presta, currency)}</td>
                      <td>{fmtMoney(r.produit, currency)}</td>
                      <td className="mnd-copper">{fmtMoney(r.prime, currency)}</td>
                      <td>{fmtMoney(r.tip, currency)}</td>
                      {montreCotis && <><td>{r.cnss > 0 ? `− ${fmtMoney(r.cnss, currency)}` : '—'}</td><td>{r.its > 0 ? `− ${fmtMoney(r.its, currency)}` : '—'}</td></>}
                      <td>{r.avance > 0 ? `− ${fmtMoney(r.avance, currency)}` : '—'}</td>
                      <td>{r.retenue > 0 ? <span style={{ color: 'var(--trv-error, #b0563e)' }}>− {fmtMoney(r.retenue, currency)}</span> : '—'}</td>
                      <td className="num">{fmtMoney(r.net, currency)}</td>
                      <td>
                        <div className="tre-pay">
                          {conf ? (
                            <span className="tre-pay__ok" title={`Réglé ${fmtStamp(conf.paidAt)}${conf.method ? ` · ${conf.method}` : ''}`}>
                              ✓ {conf.byName}
                              {isSouverain && (
                                <button className="tre-link-btn tre-link-btn--danger" style={{ marginLeft: 6 }} onClick={() => unconfirmPay(r.mk, staff.id)} title="Annuler la confirmation">↺</button>
                              )}
                            </span>
                          ) : (
                            <button className="tre-link-btn" onClick={() => confirmPay(staff, r.mk, r.net)}>Confirmer</button>
                          )}
                          <button className="tre-link-btn" onClick={() => void downloadMonthlyPayslip(staff, r.mk)}>Bulletin</button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 500 }}>
                    <td>Total {year}</td>
                    <td className="mnd-muted">{fmtMoney(tot.base, currency)}</td>
                    <td>{fmtMoney(tot.presta, currency)}</td>
                    <td>{fmtMoney(tot.produit, currency)}</td>
                    <td className="mnd-copper">{fmtMoney(tot.prime, currency)}</td>
                    <td>{fmtMoney(tot.tip, currency)}</td>
                    {montreCotis && <><td>{tot.cnss > 0 ? `− ${fmtMoney(tot.cnss, currency)}` : '—'}</td><td>{tot.its > 0 ? `− ${fmtMoney(tot.its, currency)}` : '—'}</td></>}
                    <td>{tot.avance > 0 ? `− ${fmtMoney(tot.avance, currency)}` : '—'}</td>
                    <td>{tot.retenue > 0 ? <span style={{ color: 'var(--trv-error, #b0563e)' }}>− {fmtMoney(tot.retenue, currency)}</span> : '—'}</td>
                    <td className="num">{fmtMoney(tot.net, currency)}</td>
                    <td>{months12Paid(staff.id, year)} / 12 réglés</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
