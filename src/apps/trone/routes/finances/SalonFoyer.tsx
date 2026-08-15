import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, fmtIn } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { useStaff } from '../../../../shared/auth';
import { useAppointments } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import {
  useInvoices, usePayments, useCredits, useExpenses, useCoffre, coffreBalance,
  expenseOccurrences, expenseTotal,
} from '../../../../shared/finance';
import { useApprenants, useSubscribers } from '../equipe/data';
import { buildReceipts } from '../../../../shared/receipts';
import { apptLabel, useServicesById } from '../clients/_shared';
import {
  usePartageConfigs, usePrelevements, usePrets, useCaissesIndep, useMouvementsCaisse,
  partageDe, partageValide, partageNormalise, enveloppesDuMois, revenuPartageDuMois,
  beneficeReel, poidsDesCharges,
  prelevesDuMois, detteEnCours, pretSigneXof, pretDepassementId, pretDepassementIdLegacy,
  caissesDe, deviseDeCaisse, soldeCaisse, mouvementsDe,
  soldeEnveloppe, mvtsEnveloppe, dotationDuMois, doterAuCoffre,
  verserDansEnveloppe, retirerDeEnveloppe, supprimeLigneEpargne, modifieLigneEpargne, ENVELOPPES_RESERVE,
  BENEFICIAIRES, MOTIFS_PRELEVEMENT, DEVISES_CAISSE, RESERVE_LABELS, PARTAGE_DEFAUT,
  useMotifsFoyer, motifsFoyerStore, totalPostes, type PosteFoyer,
  CLES_ENVELOPPES, ENVELOPPE_LABELS, PARTAGE_DITS, ditEnveloppe,
  type EnveloppeReserve, type PartageConfig, type CleEnveloppe, type CaisseIndep,
  type MouvementCaisseIndep,
} from '../../../../shared/foyer';
import { todayISO, monthKey, monthTitle, MonthNav } from './_shared';
import './finances.css';

/* Salon & Foyer — la séparation entreprise / foyer (voir shared/foyer.ts).

   L'écran CALCULE et PROPOSE, le souverain INSCRIT : les enveloppes du mois se
   lisent, la dotation des réserves et la conversion d'un dépassement en prêt
   sont des GESTES — jamais des écritures automatiques. Les identifiants
   déterministes rendent chaque geste idempotent.

   RÉSERVÉ AU SOUVERAIN. Ceci n'est qu'une garde d'écran ; la vraie barrière
   est la RLS de la migration 0038 (`is_souverain()`), comme pour la paie. */

/* QUATRE ONGLETS, PLUS SIX (14 août, maquette validée par Yéman). Quatre
   registres, un monde étanche et un réglage s'alignaient comme s'ils servaient
   à la même chose et à la même fréquence — et il fallait deviner lequel
   abritait « j'ai pris 45 000 F pour le marché » avant de pouvoir l'écrire.
   Les trois registres du salon se rangent sous UN journal ; les caisses
   indépendantes gardent leur onglet (leur monnaie et leur taux en font un
   vrai monde à part) ; la règle du Partage reste, mais on l'atteint aussi
   par un lien qui affiche déjà ses trois nombres. */
type Tab = 'mois' | 'journal' | 'caisses' | 'regle';

const TABS: { k: Tab; l: string }[] = [
  { k: 'mois', l: 'Le mois' },
  { k: 'journal', l: 'Le journal' },
  { k: 'caisses', l: 'Caisses indépendantes' },
  { k: 'regle', l: 'La règle du Partage' },
];

/** LES CINQ GESTES — ce qui s'est passé, dans les mots de la maison. C'est la
    réponse qui choisit le registre : on raconte, on ne range plus. */
type Geste = 'foyer' | 'cote' | 'emprunt' | 'rembourse' | 'caisse';
const GESTES: { k: Geste; t: string; s: string; pt: string; couleur: string }[] = [
  { k: 'foyer', t: 'J’ai pris de l’argent pour le foyer', s: 'Marché, école, maison — sur le budget du mois.', pt: 'Retrait du foyer', couleur: 'var(--color-copper)' },
  { k: 'cote', t: 'J’ai mis de côté', s: 'Réinvestissement ou réserve fiscale — l’argent part au coffre-fort.', pt: 'Mise de côté', couleur: 'var(--trf-success, #4A6B4F)' },
  { k: 'emprunt', t: 'Le foyer a emprunté au salon', s: 'Une avance à rembourser — elle crée une dette.', pt: 'Emprunt', couleur: 'var(--trf-error, #A03D2E)' },
  { k: 'rembourse', t: 'Le foyer rembourse le salon', s: 'Réduit la dette en cours.', pt: 'Remboursement', couleur: 'var(--indigo-400, #4E5790)' },
  { k: 'caisse', t: 'Mouvement sur une caisse à part', s: 'Wells Fargo, Mes Euros… — sans lien avec le salon.', pt: 'Caisse à part', couleur: 'var(--color-argile)' },
];

/** Une pastille de choix — le geste, le motif, l'enveloppe. Un point de
    couleur quand le choix en porte une, comme les catégories de Dépenses. */
function Pastille({ actif, point, onClick, children }: {
  actif: boolean; point?: string; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      style={{
        cursor: 'pointer', font: 'inherit', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 7,
        border: `1px solid ${actif ? 'var(--color-copper)' : 'var(--hairline)'}`,
        background: actif ? 'var(--copper-50)' : 'var(--surface-card)',
        color: actif ? 'var(--copper-700)' : 'var(--ink)',
        fontWeight: actif ? 600 : 400,
        borderRadius: 'var(--radius-pill, 999px)', padding: '7px 14px',
      }}
    >
      {point && <span style={{ width: 7, height: 7, borderRadius: '50%', background: point, flex: 'none' }} />}
      {children}
    </button>
  );
}

/** « 45 000 » et « 2,5 » se lisent ; jamais négatif — le SENS vient du champ dédié. */
const litMontant = (s: string): number => {
  const n = parseFloat(s.replace(/[\s  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.abs(n) : 0;
};
const litXof = (s: string): number => Math.round(litMontant(s));

const frDay = (iso: string): string =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Date d'une écriture rattachée au mois regardé : aujourd'hui si c'est le mois
    courant, sinon le 28 — un jour qui existe dans tous les mois. */
const dateDansMois = (mk: string): string => (monthKey(todayISO()) === mk ? todayISO() : `${mk}-28`);

const Panel = ({ title, children, style }: { title?: string; children: ReactNode; style?: CSSProperties }) => (
  <div className="trf-panel" style={{ marginTop: 18, ...style }}>
    {title && <div className="trf-panel__title">{title}</div>}
    {children}
  </div>
);

const Ligne = ({ l, v, strong, color }: { l: ReactNode; v: ReactNode; strong?: boolean; color?: string }) => (
  <div className="trf-tally" style={strong ? { borderTop: '2px solid var(--color-indigo)' } : undefined}>
    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)' }}>{l}</span>
    <span style={{ fontFamily: 'var(--font-sans)', fontSize: strong ? 16 : 13.5, fontWeight: strong ? 600 : 500, color: color ?? 'var(--color-indigo)' }}>{v}</span>
  </div>
);

export default function SalonFoyer() {
  const staff = useStaff();
  const { branch, currency } = useBranch();

  /* Les six registres du module. */
  const [configs, setConfigs] = usePartageConfigs();
  const [prelevements, setPrelevements] = usePrelevements();
  const [prets, setPrets] = usePrets();
  const [caisses, setCaisses] = useCaissesIndep();
  const [mvtsCaisse, setMvtsCaisse] = useMouvementsCaisse();
  /* Le Coffre-fort n'appartient pas à ce module — on le lit pour dire où
     l'épargne est PLACÉE, et le versement l'alimente par la porte prévue. */
  const [coffre] = useCoffre();

  /* Les sources du REVENU — les mêmes que l'écran Encaissements, à l'identique :
     deux assemblages qui différeraient diraient deux revenus pour le même mois. */
  const [invoices] = useInvoices();
  const [online] = usePayments();
  const [appointments] = useAppointments();
  const [credits] = useCredits();
  const [apprenants] = useApprenants();
  const [subscribers] = useSubscribers();
  const [clients] = useClients();
  const byId = useServicesById();
  const [expenses] = useExpenses();

  const [tab, setTab] = useState<Tab>('mois');
  const [month, setMonth] = useState(monthKey(todayISO()));

  const receipts = useMemo(
    () => buildReceipts({
      branchId: branch.id,
      invoices,
      online,
      appointments,
      credits,
      formation: apprenants,
      abonnements: subscribers.map((s) => ({ id: s.id, clientId: s.clientId, name: s.name, payments: s.payments })),
      /* Une Map, pas un find par ligne : O(reçus + clientes) au lieu de
         O(reçus × clientes) à chaque changement de facture. */
      nameOf: (() => {
        const parId = new Map(clients.map((c) => [c.id, c.name]));
        return (id?: string) => (id ? parId.get(id) : undefined) ?? 'Cliente de passage';
      })(),
      apptLabel: (a) => apptLabel(a, byId),
    }),
    [branch.id, invoices, online, appointments, credits, apprenants, subscribers, clients, byId],
  );

  const cfg = partageDe(configs, branch.id);
  const parts = partageNormalise(cfg);
  const revenu = useMemo(() => revenuPartageDuMois(receipts, month), [receipts, month]);
  /* Même règle qu'à Dépenses et à la Synthèse : une récurrente active pèse sur
     chaque mois qu'elle traverse — et une dépense SUSPENDUE ne pèse sur aucun
     (12 août : le filtre `!e.stopped` manquait ici seul ; « Suspendre tout
     l'évitable » faisait diverger le bénéfice du Partage de la Synthèse, et un
     faux dépassement pouvait se convertir en prêt fantôme). */
  const chargesMois = useMemo(
    () => expenses.filter((e) => e.branchId === branch.id && !e.stopped).reduce((s, e) => s + expenseTotal(e) * expenseOccurrences(e, month), 0),
    [expenses, branch.id, month],
  );
  /* LE PARTAGE PORTE SUR LE BÉNÉFICE (11 août) : les charges se paient
     d'abord, à leur montant réel, et c'est ce qui RESTE qui se partage. */
  const benefice = beneficeReel(revenu, chargesMois);
  const env = enveloppesDuMois(benefice, cfg);
  const poidsCharges = poidsDesCharges(revenu, chargesMois);
  const duMois = prelevesDuMois(prelevements, branch.id, month).sort((a, b) => b.date.localeCompare(a.date));
  const preleve = duMois.reduce((s, p) => s + p.amountXof, 0);
  const ecart = env.prelevement - preleve; // négatif = le foyer a trop pris
  const dette = detteEnCours(prets, branch.id);

  /* ---------- Les gestes idempotents du mois ---------- */

  /* LE PRÊT DU MOIS DE CETTE BRANCHE — le nouvel id porte la branche ; l'ancien
     (sans branche) reste reconnu s'il est à nous. Sans ce cadrage, deux
     branches en dépassement le même mois s'écrasaient mutuellement le prêt. */
  const pretDuMois = prets.find((p) =>
    p.id === pretDepassementId(branch.id, month)
    || (p.id === pretDepassementIdLegacy(month) && p.branchId === branch.id));
  const convertirDepassement = () => {
    if (ecart >= 0) return;
    const montant = -ecart;
    setPrets((prev) => {
      const sans = prev.filter((p) => !(p.id === pretDepassementId(branch.id, month)
        || (p.id === pretDepassementIdLegacy(month) && p.branchId === branch.id)));
      return [...sans, {
        id: pretDepassementId(branch.id, month),
        branchId: branch.id,
        date: dateDansMois(month),
        type: 'pret' as const,
        associe: 'Foyer',
        motif: `Dépassement budget · ${monthTitle(month)}`,
        amountXof: montant,
      }];
    });
  };

  /* METTRE DE CÔTÉ EST UN SEUL GESTE : la dotation entre DIRECTEMENT au
     Coffre-fort, où la seule sortie est un virement. L'argent est à l'abri au
     moment même où on décide de l'épargner — plus de « décidé mais pas encore
     placé » qui traîne, plus de second geste à ne pas oublier. */
  /* La dotation de CETTE branche — c'était la seule lecture du coffre de cet
     écran sans filtre de branche : le panneau de la branche B affichait la
     dotation de la branche A comme la sienne. */
  const dotationInscrite = (e: EnveloppeReserve) => dotationDuMois(coffre, branch.id, e, month);
  const inscrireDotation = (e: EnveloppeReserve, montant: number) =>
    doterAuCoffre({ branchId: branch.id, enveloppe: e, mois: month, amountXof: montant, date: dateDansMois(month) });

  const epargneInscrite = mvtsEnveloppe(coffre, branch.id)
    .filter((m) => m.kind === 'depot' && m.date.slice(0, 7) === month)
    .reduce((s, m) => s + m.amountXof, 0);

  /* ---------- Formulaires ---------- */

  /* `fPre` et `fPret` sont partis avec leurs formulaires (14 août) : la
     fenêtre « Inscrire un mouvement » écrit à leur place. */
  /* Le retrait en cours de correction — un seul à la fois, édité EN PLACE. */
  const [editPrel, setEditPrel] = useState<null | { id: string; date: string; beneficiaire: string; motif: string; note: string; montant: string }>(null);
  const [fRes, setFRes] = useState({ date: todayISO(), enveloppe: 'reinvestissement' as EnveloppeReserve, sens: 'dotation' as 'dotation' | 'retrait', note: '', montant: '' });
  /* Le refus d'un retrait qui dépasse l'enveloppe se dit à côté du bouton. */
  const [vrsErr, setVrsErr] = useState<string | null>(null);
  /* Les caisses indépendantes : une caisse choisie, son registre dessous. */
  const [caisseSel, setCaisseSel] = useState<string | null>(null);
  const [fCaisse, setFCaisse] = useState<null | { nom: string; devise: string; dit: string }>(null);
  const [fEdit, setFEdit] = useState<null | { id: string; nom: string; devise: string; dit: string }>(null);
  /* UNE CAISSE À PART TIENT DE VRAIES DÉPENSES (14 août, demande de Yéman) :
     son mouvement porte donc le même modèle que le foyer — un motif, son
     détail, et plusieurs postes sur une même sortie. */
  const [fMvt, setFMvt] = useState({
    date: todayISO(), sens: 'entree' as 'entree' | 'sortie', label: '', montant: '', taux: '655',
    motif: '', sousMotif: '', postes: [] as PosteFoyer[],
  });
  const postesCaisse = fMvt.postes.filter((p) => p.label.trim() && p.amountXof > 0);
  const ajoutePosteCaisse = () => setFMvt((f) => ({ ...f, postes: [...f.postes, { id: uid(), label: '', amountXof: 0 }] }));
  const majPosteCaisse = (id: string, patch: Partial<PosteFoyer>) =>
    setFMvt((f) => ({ ...f, postes: f.postes.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const retirePosteCaisse = (id: string) =>
    setFMvt((f) => ({ ...f, postes: f.postes.filter((p) => p.id !== id) }));
  /** Le mouvement de caisse en cours de correction — un seul, édité EN PLACE. */
  const [editMvt, setEditMvt] = useState<null | { id: string; date: string; sens: 'entree' | 'sortie'; label: string; montant: string; taux: string }>(null);
  /** Une ligne du registre des prêts, et une du registre de l'épargne. */
  const [editPret, setEditPret] = useState<null | { id: string; date: string; type: 'pret' | 'remboursement'; associe: string; motif: string; montant: string }>(null);
  const [editEpa, setEditEpa] = useState<null | { id: string; date: string; enveloppe: EnveloppeReserve; sens: 'depot' | 'virement'; note: string; montant: string }>(null);
  const [fCfg, setFCfg] = useState<null | { charges: string; reinvest: string; reserve: string; prelevement: string }>(null);
  /* Les définitions se modifient à part : changer un pourcentage est un acte
     financier, renommer une enveloppe n'en est pas un. Deux gestes, deux
     boutons — et chacun préserve ce que l'autre a écrit. */
  const [fDits, setFDits] = useState<null | Record<CleEnveloppe, string>>(null);

  /* ─── Corriger un retrait déjà inscrit ───
     Une liste déroulante ne doit jamais AVALER la valeur qu'elle affiche : un
     motif venu d'ailleurs (reprise, ancien libellé) rendrait le champ vide, et
     enregistrer effacerait ce qu'on n'avait pas voulu toucher. */
  const avecCourant = (liste: readonly string[], courant: string): string[] =>
    liste.includes(courant) || !courant ? [...liste] : [courant, ...liste];

  const ouvreEditionPrel = (p: { id: string; date: string; beneficiaire: string; motif: string; note?: string; amountXof: number }) =>
    setEditPrel({
      id: p.id, date: p.date, beneficiaire: p.beneficiaire, motif: p.motif,
      note: p.note ?? '', montant: String(p.amountXof),
    });

  const sauvePrelevement = () => {
    if (!editPrel) return;
    const montant = litXof(editPrel.montant);
    if (montant <= 0) return;
    setPrelevements((prev) => prev.map((p) => (p.id === editPrel.id ? {
      ...p,
      date: editPrel.date,
      beneficiaire: editPrel.beneficiaire,
      motif: editPrel.motif,
      note: editPrel.note.trim() || undefined,
      amountXof: montant,
    } : p)));
    setEditPrel(null);
  };

  /* ─── LE MOUVEMENT UNIQUE (14 août) — une question, cinq réponses, et
     l'écriture part dans le bon registre. Le geste choisi commande les champs
     ouverts ET la table écrite ; le comptoir ne traduit plus « j'ai pris pour
     le marché » en « prélèvement associés ». ─── */
  const [mvtOuvert, setMvtOuvert] = useState(false);
  const [geste, setGeste] = useState<Geste>('foyer');
  const [fMvtUni, setFMvtUni] = useState({
    date: todayISO(), motif: 'Maison', sousMotif: '', note: '',
    enveloppe: 'reinvestissement' as EnveloppeReserve, montant: '',
    postes: [] as PosteFoyer[],
  });
  /* LES MOTIFS SE GÈRENT (14 août) — même modèle que les catégories de
     dépenses du salon : un nom, des sous-motifs, et la main qui ajoute. */
  const [motifs] = useMotifsFoyer();
  const [motifsOuvert, setMotifsOuvert] = useState(false);
  const motifCourant = motifs.find((m) => m.name === fMvtUni.motif);
  /* Le motif choisi pour le mouvement de caisse — même registre. */
  const motifCaisse = motifs.find((m) => m.name === fMvt.motif);
  /* PLUSIEURS POSTES SUR UNE MÊME SORTIE : dès qu'il y en a, LA SOMME fait
     le montant — le grand nombre du haut le dit et cesse de se saisir. */
  const postesNets = fMvtUni.postes.filter((p) => p.label.trim() && p.amountXof > 0);
  const montantUni = totalPostes(postesNets, litXof(fMvtUni.montant));

  const ajoutePoste = () => setFMvtUni((f) => ({ ...f, postes: [...f.postes, { id: uid(), label: '', amountXof: 0 }] }));
  const majPoste = (id: string, patch: Partial<PosteFoyer>) =>
    setFMvtUni((f) => ({ ...f, postes: f.postes.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const retirePoste = (id: string) =>
    setFMvtUni((f) => ({ ...f, postes: f.postes.filter((p) => p.id !== id) }));

  const inscrireMouvement = () => {
    if (montantUni <= 0) return;
    const note = fMvtUni.note.trim() || undefined;
    if (geste === 'foyer') {
      /* LE DÉPASSEMENT S'ACCEPTE ET S'INSCRIT TEL QUEL (décision de Yéman,
         14 août) : le retrait passe même s'il excède le budget du mois, et il
         ne se convertit PAS en prêt — la conséquence est dite avant le geste,
         la décision reste à la Maison. */
      setPrelevements((prev) => [...prev, {
        id: `plv-${uid()}`, branchId: branch.id, date: fMvtUni.date,
        beneficiaire: 'Foyer', motif: fMvtUni.motif,
        sousMotif: fMvtUni.sousMotif || undefined,
        note, amountXof: montantUni,
        items: postesNets.length ? postesNets : undefined,
      }]);
    } else if (geste === 'cote') {
      verserDansEnveloppe({
        branchId: branch.id, enveloppe: fMvtUni.enveloppe,
        amountXof: montantUni, date: fMvtUni.date, note,
      });
    } else {
      setPrets((prev) => [...prev, {
        id: `prt-${uid()}`, branchId: branch.id, date: fMvtUni.date,
        type: geste === 'emprunt' ? 'pret' : 'remboursement',
        associe: 'Foyer',
        motif: fMvtUni.note.trim() || (geste === 'emprunt' ? 'Prêt du salon au foyer' : 'Remboursement'),
        amountXof: montantUni,
      }]);
    }
    setFMvtUni((f) => ({ ...f, note: '', montant: '', postes: [] }));
    setMvtOuvert(false);
  };


  const sauvePret = () => {
    if (!editPret) return;
    const montant = litXof(editPret.montant);
    if (montant <= 0) return;
    setPrets((prev) => prev.map((p) => (p.id === editPret.id ? {
      ...p, date: editPret.date, type: editPret.type, associe: editPret.associe,
      motif: editPret.motif.trim() || (editPret.type === 'pret' ? 'Prêt au salon' : 'Remboursement'),
      amountXof: montant,
    } : p)));
    setEditPret(null);
  };

  const sauveEpargne = () => {
    if (!editEpa) return;
    const montant = litXof(editEpa.montant);
    if (montant <= 0) return;
    modifieLigneEpargne(editEpa.id, {
      date: editEpa.date, enveloppe: editEpa.enveloppe, kind: editEpa.sens,
      amountXof: montant, note: editEpa.note.trim() || undefined,
    });
    setEditEpa(null);
  };


  /* Un mouvement d'épargne à la main — il va au coffre comme les autres. */
  const ajouteReserve = () => {
    const montant = litXof(fRes.montant);
    if (montant <= 0) return;
    if (fRes.sens === 'dotation') {
      verserDansEnveloppe({
        branchId: branch.id, enveloppe: fRes.enveloppe, amountXof: montant,
        date: fRes.date, note: fRes.note.trim() || undefined,
      });
    } else {
      const r = retirerDeEnveloppe({
        branchId: branch.id, enveloppe: fRes.enveloppe, amountXof: montant,
        date: fRes.date, note: fRes.note.trim() || undefined,
      });
      if (!r.ok) { setVrsErr(r.erreur); return; }
    }
    setVrsErr(null);
    setFRes((f) => ({ ...f, note: '', montant: '' }));
  };

  /* ---------- Les caisses indépendantes ---------- */

  const mesCaisses = caissesDe(caisses, branch.id);
  const caisseActive = mesCaisses.find((c) => c.id === caisseSel) ?? mesCaisses[0];
  const deviseActive = caisseActive ? deviseDeCaisse(caisseActive, currency) : currency;
  const enDevise = deviseActive !== currency;
  /* UNE fois par rendu — le même filtre+tri était recomputé quatre fois
     (désactivation, note « figée », état vide, liste), à chaque frappe. */
  const mvtsActifs = useMemo(
    () => (caisseActive ? mouvementsDe(mvtsCaisse, caisseActive.id) : []),
    [mvtsCaisse, caisseActive],
  );

  /* LE POINT DU JOUR (15 août) — ce qui a bougé AUJOURD'HUI dans les caisses
     indépendantes, une ligne par caisse touchée. Calculé pour TOUTES les
     caisses, pas seulement celle affichée : le bas de page fait le point de la
     journée, pas de la pastille choisie. Aucune somme entre les lignes — une
     caisse en euros et une caisse en dollars ne s'additionnent pas. */
  const pointDuJour = useMemo(() => {
    const jour = todayISO();
    return mesCaisses
      .map((c) => {
        const duJour = mouvementsDe(mvtsCaisse, c.id).filter((m) => m.date === jour);
        const entrees = duJour.filter((m) => m.sens === 'entree').reduce((n, m) => n + m.montant, 0);
        const sorties = duJour.filter((m) => m.sens === 'sortie').reduce((n, m) => n + m.montant, 0);
        return {
          id: c.id, nom: c.nom, devise: deviseDeCaisse(c, currency), n: duJour.length,
          entrees, sorties, net: entrees - sorties, solde: soldeCaisse(mvtsCaisse, c.id),
        };
      })
      .filter((j) => j.n > 0);
  }, [mesCaisses, mvtsCaisse, currency]);

  /** Un solde se dit dans SA monnaie — jamais reconverti. Par la couche
      currency (`fmtIn`, comme les caisses de Dépenses) : deux formateurs pour
      les mêmes billets divergeaient déjà sur les décimales (12 août). */
  const fmtCaisse = (v: number, dev: string): string =>
    dev === currency ? fmtMoney(Math.round(v), currency) : fmtIn(v, dev);

  const creeCaisse = () => {
    if (!fCaisse || !fCaisse.nom.trim()) return;
    const id = `cxi-${uid()}`;
    setCaisses((prev) => [...prev, {
      id, branchId: branch.id, nom: fCaisse.nom.trim(),
      devise: fCaisse.devise === currency ? undefined : fCaisse.devise,
      dit: fCaisse.dit.trim() || undefined,
      ordre: prev.filter((c) => c.branchId === branch.id).length + 1,
    }]);
    setCaisseSel(id);
    setFCaisse(null);
  };

  const sauveEdition = () => {
    if (!fEdit || !fEdit.nom.trim()) return;
    setCaisses((prev) => prev.map((c) => (c.id === fEdit.id ? {
      ...c, nom: fEdit.nom.trim(),
      /* LA DEVISE SE FIGE AU PREMIER MOUVEMENT : la changer après coup
         relirait des billets d'une monnaie dans une autre, et le solde ne
         tomberait plus juste avec le tiroir. */
      devise: mouvementsDe(mvtsCaisse, c.id).length > 0
        ? c.devise
        : (fEdit.devise === currency ? undefined : fEdit.devise),
      dit: fEdit.dit.trim() || undefined,
    } : c)));
    setFEdit(null);
  };

  const supprimeCaisse = (c: CaisseIndep) => {
    const n = mouvementsDe(mvtsCaisse, c.id).length;
    if (n > 0) {
      window.alert(`« ${c.nom} » porte ${n} mouvement${n > 1 ? 's' : ''}. Retire-les d'abord — une caisse ne se ferme pas sur son registre.`);
      return;
    }
    if (!window.confirm(`Supprimer la caisse « ${c.nom} » ? Elle est vide, l'action est définitive.`)) return;
    setCaisses((prev) => prev.filter((x) => x.id !== c.id));
    setCaisseSel(null);
  };

  /* Corriger un mouvement de caisse — un report de solde se saisit vite et se
     relit tard : « 950 EUR » peut devoir devenir 850, ou changer de date. Le
     supprimer pour le ressaisir ferait perdre son taux et son libellé. */
  const ouvreEditionMvt = (m: MouvementCaisseIndep) =>
    setEditMvt({
      id: m.id, date: m.date, sens: m.sens, label: m.label,
      montant: String(m.montant), taux: m.taux != null ? String(m.taux) : '',
    });

  const sauveMouvement = () => {
    if (!editMvt) return;
    const montant = litMontant(editMvt.montant);
    const taux = litMontant(editMvt.taux);
    if (montant <= 0 || !editMvt.label.trim() || (enDevise && taux <= 0)) return;
    setMvtsCaisse((prev) => prev.map((m) => (m.id === editMvt.id ? {
      ...m,
      date: editMvt.date, sens: editMvt.sens, label: editMvt.label.trim(),
      montant, ...(enDevise ? { taux } : {}),
    } : m)));
    setEditMvt(null);
  };

  const ajouteMouvement = () => {
    if (!caisseActive) return;
    /* La somme des postes fait le montant, comme au foyer. */
    const montant = postesCaisse.length
      ? postesCaisse.reduce((s, p) => s + p.amountXof, 0)
      : litMontant(fMvt.montant);
    const taux = litMontant(fMvt.taux);
    if (montant <= 0 || !fMvt.label.trim() || (enDevise && taux <= 0)) return;
    setMvtsCaisse((prev) => [...prev, {
      id: `cxim-${uid()}`, branchId: branch.id, caisseId: caisseActive.id,
      date: fMvt.date, sens: fMvt.sens, label: fMvt.label.trim(),
      montant, ...(enDevise ? { taux } : {}),
      ...(fMvt.motif ? { motif: fMvt.motif } : {}),
      ...(fMvt.sousMotif ? { sousMotif: fMvt.sousMotif } : {}),
      ...(postesCaisse.length ? { items: postesCaisse } : {}),
    }]);
    setFMvt((f) => ({ ...f, label: '', montant: '', postes: [] }));
  };

  const supprime = <T extends { id: string }>(set: (fn: (prev: T[]) => T[]) => void, id: string, quoi: string) => {
    if (!window.confirm(`Supprimer ${quoi} ? Cette action est irréversible.`)) return;
    set((prev) => prev.filter((x) => x.id !== id));
  };

  /* ---------- La garde d'écran ---------- */

  if (!staff) return null;
  if (staff.role !== 'souverain') {
    return (
      <div>
        <PageHead eyebrow="Finances · entreprise & foyer" title="Salon & Foyer." sub="Réservé au souverain de la Maison." />
        <div className="trf-empty">Cet écran tient les prélèvements du foyer, la dette des associés et les caisses indépendantes — il ne s'ouvre qu'au souverain.</div>
      </div>
    );
  }

  const soldeReinvest = soldeEnveloppe(coffre, branch.id, 'reinvestissement');
  const soldeFiscale = soldeEnveloppe(coffre, branch.id, 'fiscale');
  /* Le formulaire part des parts NORMALISÉES : une règle d'avant le 11 août
     porte trois parts qui ne font que 60 (le reste était l'enveloppe de
     charges) ; les afficher telles quelles ferait croire à une erreur de
     saisie alors que le calcul, lui, les a déjà ramenées à 100. */
  const cfgForm = fCfg ?? {
    charges: String(cfg.pctCharges), reinvest: String(parts.reinvest),
    reserve: String(parts.reserve), prelevement: String(parts.prelevement),
  };
  const cfgNum = {
    pctCharges: litXof(cfgForm.charges), pctReinvest: litXof(cfgForm.reinvest),
    pctReserve: litXof(cfgForm.reserve), pctPrelevement: litXof(cfgForm.prelevement),
  };
  /* Le repère de charges ne compte PAS dans le total : il ne prend rien au
     partage, il ne fait que dire l'objectif. */
  const cfgTotal = cfgNum.pctReinvest + cfgNum.pctReserve + cfgNum.pctPrelevement;
  const sauveCfg = () => {
    if (!partageValide(cfgNum)) return;
    const ligne: PartageConfig = { id: `pc-${branch.id}`, branchId: branch.id, ...cfgNum, dits: cfg.dits };
    setConfigs((prev) => [...prev.filter((c) => c.branchId !== branch.id), ligne]);
    setFCfg(null);
  };

  const ditsForm = fDits ?? (Object.fromEntries(
    CLES_ENVELOPPES.map((k) => [k, ditEnveloppe(cfg, k)]),
  ) as Record<CleEnveloppe, string>);
  const sauveDits = () => {
    const dits = Object.fromEntries(
      CLES_ENVELOPPES.map((k) => [k, (ditsForm[k] ?? '').trim()]).filter(([, v]) => v),
    ) as Partial<Record<CleEnveloppe, string>>;
    const ligne: PartageConfig = {
      id: `pc-${branch.id}`, branchId: branch.id,
      pctCharges: cfg.pctCharges, pctReinvest: cfg.pctReinvest,
      pctReserve: cfg.pctReserve, pctPrelevement: cfg.pctPrelevement,
      dits,
    };
    setConfigs((prev) => [...prev.filter((c) => c.branchId !== branch.id), ligne]);
    setFDits(null);
  };

  const kpis = [
    { l: 'Revenu encaissé du mois', v: fmtMoney(revenu, currency), c: 'hors pourboires · registre des encaissements', a: 'var(--color-indigo)' },
    { l: 'Charges salon réelles', v: fmtMoney(chargesMois, currency), c: 'le registre Dépenses, récurrentes comprises', a: 'var(--color-copper)' },
    {
      l: 'Bénéfice réel du salon', v: fmtMoney(benefice, currency),
      c: 'revenu − charges salon. C’est ça, la santé du salon.',
      a: benefice >= 0 ? 'var(--trf-success)' : 'var(--trf-error)',
    },
  ];

  return (
    <div>
      <PageHead
        eyebrow="Finances · entreprise & foyer"
        title="Salon & Foyer."
        sub="Chaque franc encaissé se partage en quatre enveloppes ; le foyer vit sur la sienne. Le prélèvement n'est pas une charge — c'est une distribution du bénéfice."
      />

      <div className="trf-tabs">
        {TABS.map((t) => (
          <button key={t.k} className={`trf-tab ${tab === t.k ? 'is-active' : ''}`} onClick={() => setTab(t.k)}>{t.l}</button>
        ))}
      </div>

      {/* ═══ LES MOTIFS DU FOYER SE GÈRENT ICI (14 août) — la liste était
          figée dans le code : ajouter « Loyer maison » demandait une
          publication. Un motif, ses sous-motifs, et la main qui décide. ═══ */}
      {motifsOuvert && (
        <Modal title="Les motifs du foyer." onClose={() => setMotifsOuvert(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              Un motif dit à quoi l’argent a servi ; ses sous-motifs le précisent.
              Renommer un motif ne touche pas aux retraits déjà inscrits — ils gardent
              le mot sous lequel ils ont été écrits.
            </div>

            {motifs.map((m) => (
              <div key={m.id} className="mnd-bande" style={{ padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{m.name}</span>
                  <button
                    type="button"
                    className="tre-link-btn"
                    onClick={() => {
                      const n = window.prompt('Renommer ce motif', m.name);
                      if (n && n.trim()) motifsFoyerStore.set((prev) => prev.map((x) => (x.id === m.id ? { ...x, name: n.trim() } : x)));
                    }}
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    className="tre-link-btn tre-link-btn--danger"
                    onClick={() => {
                      if (!window.confirm(`Retirer le motif « ${m.name} » ? Les retraits déjà inscrits le gardent.`)) return;
                      motifsFoyerStore.set((prev) => prev.filter((x) => x.id !== m.id));
                    }}
                  >
                    Retirer
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                  {m.subs.map((s) => (
                    <span key={s} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                      border: '1px solid var(--hairline)', borderRadius: 'var(--radius-pill, 999px)',
                      padding: '4px 10px', background: 'var(--surface-card)',
                    }}>
                      {s}
                      <button
                        type="button"
                        onClick={() => motifsFoyerStore.set((prev) => prev.map((x) => (x.id === m.id ? { ...x, subs: x.subs.filter((y) => y !== s) } : x)))}
                        aria-label={`Retirer ${s}`}
                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, color: 'var(--ink-soft)', fontSize: 12 }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const s = window.prompt(`Un sous-motif de « ${m.name} »`);
                      if (s && s.trim()) motifsFoyerStore.set((prev) => prev.map((x) => (x.id === m.id && !x.subs.includes(s.trim()) ? { ...x, subs: [...x.subs, s.trim()] } : x)));
                    }}
                    style={{
                      cursor: 'pointer', font: 'inherit', fontSize: 12, color: 'var(--copper-700)',
                      border: '1px dashed var(--copper-500)', borderRadius: 'var(--radius-pill, 999px)',
                      background: 'transparent', padding: '4px 11px',
                    }}
                  >
                    + sous-motif
                  </button>
                </div>
              </div>
            ))}

            <Button
              variant="ghost"
              onClick={() => {
                const n = window.prompt('Le nom du nouveau motif');
                if (n && n.trim()) motifsFoyerStore.set((prev) => [...prev, { id: `mf-${uid()}`, name: n.trim(), subs: [] }]);
              }}
            >
              + Ajouter un motif
            </Button>
          </div>
        </Modal>
      )}

      {/* ═══ INSCRIRE UN MOUVEMENT — une question, pas six onglets ═══ */}
      {mvtOuvert && (() => {
        const resteFoyer = env.prelevement - preleve;
        const apres = resteFoyer - montantUni;
        return (
          <Modal title="Inscrire un mouvement." onClose={() => setMvtOuvert(false)} width={520}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* ═══ LE MONTANT EST LE HÉROS (14 août — modèle apporté par
                  Yéman). C'est le nombre qu'on vient écrire : il s'affiche en
                  grand, au centre, avant tout le reste. Les champs de saisie
                  alignés à la file faisaient chercher lequel portait la
                  somme. ═══ */}
              {geste !== 'caisse' && (
                <div style={{ textAlign: 'center', paddingTop: 4 }}>
                  <div className="trc-microlabel" style={{ letterSpacing: '.2em' }}>Montant</div>
                  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                    {postesNets.length > 0 ? (
                      /* LA SOMME DES POSTES FAIT LOI — on ne saisit plus deux
                         vérités pour le même retrait. */
                      <span style={{
                        width: 220, textAlign: 'right', display: 'inline-block',
                        borderBottom: '1px solid var(--copper-300)',
                        fontFamily: 'var(--font-serif)', fontSize: 42, color: 'var(--color-indigo)', padding: '2px 6px',
                      }}>
                        {montantUni.toLocaleString('fr-FR')}
                      </span>
                    ) : (
                      <input
                        value={fMvtUni.montant}
                        onChange={(e) => setFMvtUni({ ...fMvtUni, montant: e.target.value })}
                        inputMode="numeric"
                        placeholder="0"
                        autoFocus
                        aria-label={`Montant en ${currency}`}
                        style={{
                          width: 220, textAlign: 'right', background: 'transparent',
                          border: 'none', borderBottom: '1px solid var(--copper-300)',
                          fontFamily: 'var(--font-serif)', fontSize: 42, color: 'var(--color-indigo)',
                          padding: '2px 6px', outline: 'none',
                        }}
                      />
                    )}
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--copper-700)' }}>
                      {currency === 'XOF' ? 'F' : currency}
                    </span>
                  </div>
                  {postesNets.length > 0 && (
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                      somme de {postesNets.length} poste{postesNets.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="trc-microlabel" style={{ marginBottom: 9 }}>Qu’est-ce qui s’est passé ?</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {GESTES.map((g) => (
                    <Pastille key={g.k} actif={geste === g.k} point={g.couleur} onClick={() => setGeste(g.k)}>
                      {g.pt}
                    </Pastille>
                  ))}
                </div>
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 7, lineHeight: 1.5 }}>
                  {GESTES.find((g) => g.k === geste)?.s}
                </div>
              </div>

              {geste === 'caisse' ? (
                <>
                  <div className="trf-empty">
                    Les caisses à part ont leur monnaie et leur taux : leur écriture se fait dans leur
                    onglet, où le registre de chacune vit à côté de son solde.
                  </div>
                  <Button variant="copper" onClick={() => { setMvtOuvert(false); setTab('caisses'); }}>
                    Ouvrir les caisses indépendantes
                  </Button>
                </>
              ) : (
                <>
                  {geste === 'foyer' && (
                    <>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
                          <span className="trc-microlabel">Motif</span>
                          <button type="button" className="tre-link-btn" style={{ marginLeft: 'auto' }} onClick={() => setMotifsOuvert(true)}>
                            Gérer les motifs
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                          {motifs.map((m) => (
                            <Pastille
                              key={m.id}
                              actif={fMvtUni.motif === m.name}
                              onClick={() => setFMvtUni({ ...fMvtUni, motif: m.name, sousMotif: '' })}
                            >
                              {m.name}
                            </Pastille>
                          ))}
                        </div>
                      </div>

                      {/* LE SOUS-MOTIF — « École » puis « Rentrée ». Il ne paraît
                          que si le motif en porte : une rangée vide n'apprend rien. */}
                      {motifCourant && motifCourant.subs.length > 0 && (
                        <div>
                          <div className="trc-microlabel" style={{ marginBottom: 9 }}>Le détail · facultatif</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                            {motifCourant.subs.map((s) => (
                              <Pastille
                                key={s}
                                actif={fMvtUni.sousMotif === s}
                                onClick={() => setFMvtUni({ ...fMvtUni, sousMotif: fMvtUni.sousMotif === s ? '' : s })}
                              >
                                {s}
                              </Pastille>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PLUSIEURS POSTES SUR UNE MÊME SORTIE (demande de Yéman) :
                          une sortie couvre souvent plusieurs achats. Chaque ligne
                          porte son libellé et son montant ; leur somme devient LE
                          montant du retrait. */}
                      <div>
                        <div className="trc-microlabel" style={{ marginBottom: 9 }}>Détail des postes · facultatif</div>
                        {fMvtUni.postes.map((p) => (
                          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7 }}>
                            <Input
                              value={p.label}
                              onChange={(e) => majPoste(p.id, { label: e.target.value })}
                              placeholder="Ex. marché"
                              style={{ flex: 1, minWidth: 0 }}
                              aria-label="Libellé du poste"
                            />
                            <Input
                              inputMode="numeric"
                              value={p.amountXof ? String(p.amountXof) : ''}
                              onChange={(e) => majPoste(p.id, { amountXof: litXof(e.target.value) })}
                              placeholder="0"
                              style={{ width: 110, textAlign: 'right', flex: 'none' }}
                              aria-label="Montant du poste"
                            />
                            <button
                              type="button"
                              onClick={() => retirePoste(p.id)}
                              aria-label="Retirer ce poste"
                              style={{ flex: 'none', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 15, padding: '0 4px' }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={ajoutePoste}
                          style={{
                            width: '100%', cursor: 'pointer', font: 'inherit', fontSize: 13,
                            border: '1px dashed var(--copper-500)', borderRadius: 3,
                            background: 'transparent', color: 'var(--copper-700)', padding: '10px 13px',
                          }}
                        >
                          + Détailler ce retrait (optionnel)
                        </button>
                      </div>
                    </>
                  )}

                  {geste === 'cote' && (
                    <div>
                      <div className="trc-microlabel" style={{ marginBottom: 9 }}>Dans quelle enveloppe</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                        {(['reinvestissement', 'fiscale'] as EnveloppeReserve[]).map((e2) => (
                          <Pastille key={e2} actif={fMvtUni.enveloppe === e2} onClick={() => setFMvtUni({ ...fMvtUni, enveloppe: e2 })}>
                            {RESERVE_LABELS[e2]}
                          </Pastille>
                        ))}
                      </div>
                    </div>
                  )}

                  <Field label={geste === 'foyer' ? 'Note · facultatif' : 'Motif · facultatif'}>
                    <Input
                      value={fMvtUni.note}
                      onChange={(e) => setFMvtUni({ ...fMvtUni, note: e.target.value })}
                      placeholder={geste === 'foyer' ? 'Marché + supermarché…' : geste === 'cote' ? 'Achat fauteuil, acompte impôt…' : 'Retenue sur prélèvement…'}
                    />
                  </Field>

                  <Field label="Date">
                    <Input type="date" value={fMvtUni.date} onChange={(e) => setFMvtUni({ ...fMvtUni, date: e.target.value })} />
                  </Field>

                  {/* LA CONSÉQUENCE S'ANNONCE AVANT LE GESTE — et un dépassement
                      ne bloque pas : il s'inscrit tel quel, sans devenir un
                      prêt (décision de Yéman, 14 août). */}
                  {geste === 'foyer' && montantUni > 0 && (
                    <div className="mnd-bande" style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
                      padding: '10px 13px', fontSize: 13,
                      ...(apres < 0 ? { background: 'var(--copper-50)', borderColor: 'var(--copper-300)' } : {}),
                    }}>
                      <span className="mnd-muted">
                        {apres >= 0 ? 'Après ce retrait, il restera au foyer' : 'Ce retrait dépasse le budget du mois de'}
                      </span>
                      <b style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 400, color: apres >= 0 ? 'var(--color-indigo)' : 'var(--copper-700)' }}>
                        {fmtMoney(Math.abs(apres), currency)}
                        {apres < 0 ? ' — il s’inscrira quand même' : ' ce mois'}
                      </b>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
                    <Button variant="ghost" style={{ flex: 1 }} onClick={() => setMvtOuvert(false)}>Annuler</Button>
                    <Button variant="copper" style={{ flex: 1 }} onClick={inscrireMouvement} disabled={montantUni <= 0}>
                      Enregistrer
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* ═══════ LE MOIS — la vérité en un coup d'œil ═══════ */}
      {tab === 'mois' && (
        <div>
          <div className="trf-toolbar" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <MonthNav month={month} onChange={setMonth} />
            {/* LE GESTE UNIQUE — il remplace quatre formulaires jumeaux
                dispersés dans quatre onglets. */}
            <button className="trf-act trf-act--primary" onClick={() => setMvtOuvert(true)}>
              + Inscrire un mouvement
            </button>
            <button
              className="tre-link-btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => setTab('regle')}
            >
              La règle du Partage · {parts.reinvest} · {parts.reserve} · {parts.prelevement} →
            </button>
          </div>

          <div className="tr-grid tr-grid--3" style={{ marginTop: 18 }}>
            {kpis.map((k) => (
              <div className="trf-kpi" key={k.l} style={{ '--accent': k.a } as CSSProperties}>
                <div className="l">{k.l}</div>
                <div className="v">{k.v}</div>
                <div className="c">{k.c}</div>
              </div>
            ))}
          </div>

          {/* ═══ LES TROIS ENVELOPPES, VIVANTES (14 août, maquette) — le budget
              du mois, ce qui en a été pris, CE QU'IL RESTE, et une jauge. La
              seule question qu'on se pose devant cette page vivait au fond du
              deuxième onglet. ═══ */}
          {benefice > 0 && (
            <div className="tr-grid tr-grid--3" style={{ marginTop: 14, alignItems: 'start' }}>
              {([
                { k: 'foyer', t: 'Le foyer', pct: parts.prelevement, budget: env.prelevement, pris: preleve, accent: 'var(--color-copper)' },
                { k: 'reinv', t: RESERVE_LABELS.reinvestissement, pct: parts.reinvest, budget: env.reinvest, pris: dotationInscrite('reinvestissement')?.amountXof ?? 0, accent: 'var(--indigo-400, #4E5790)' },
                { k: 'fisc', t: RESERVE_LABELS.fiscale, pct: parts.reserve, budget: env.reserve, pris: dotationInscrite('fiscale')?.amountXof ?? 0, accent: 'var(--trf-success, #4A6B4F)' },
              ] as const).map((e) => {
                const reste = e.budget - e.pris;
                const part = e.budget > 0 ? Math.min(100, Math.round((e.pris / e.budget) * 100)) : 0;
                /* LA CASE DU FOYER SE CLIQUE (15 août) — elle mène à ses
                   retraits, au journal. Ses deux sœurs portent un bouton qui
                   agit ; elle n'en avait pas, et « 39 400 F pris » ne menait
                   nulle part : pour savoir QUI avait pris QUOI, il fallait
                   deviner l'onglet. Un vrai <button> — donc au clavier aussi. */
                const Case = e.k === 'foyer' ? 'button' : 'div';
                return (
                  <Case
                    key={e.k}
                    {...(e.k === 'foyer'
                      ? { type: 'button' as const, className: 'trf-envcard--go', onClick: () => setTab('journal'), title: 'Voir les retraits du foyer' }
                      : {})}
                    style={{
                      background: 'var(--surface-card)', border: '1px solid var(--hairline)',
                      borderLeft: `3px solid ${e.accent}`, borderRadius: 4, padding: '14px 15px',
                    }}
                  >
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{e.t}</div>
                    <div className="mnd-muted" style={{ fontSize: 11.5 }}>{e.pct} % du bénéfice</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--color-indigo)', marginTop: 6 }}>
                      {fmtMoney(e.budget, currency)}
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--color-sable)', margin: '9px 0 7px', overflow: 'hidden' }}>
                      <i style={{ display: 'block', height: '100%', width: `${part}%`, background: e.accent, borderRadius: 999 }} />
                    </div>
                    <div className="mnd-muted" style={{ fontSize: 12 }}>
                      {e.pris > 0
                        ? <>{fmtMoney(e.pris, currency)} {e.k === 'foyer' ? 'pris' : 'au coffre'} · <b style={{ color: reste >= 0 ? 'var(--copper-700)' : 'var(--trf-error)', fontWeight: 600 }}>
                            {reste >= 0 ? `${fmtMoney(reste, currency)} restent` : `${fmtMoney(-reste, currency)} au-delà du budget`}
                          </b></>
                        : e.k === 'foyer' ? 'rien pris ce mois' : 'rien mis au coffre ce mois'}
                    </div>
                    {e.k === 'foyer' && (
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--copper-700)', marginTop: 9 }}>
                        Voir les retraits →
                      </div>
                    )}
                    {e.k !== 'foyer' && (!dotationInscrite(e.k === 'reinv' ? 'reinvestissement' : 'fiscale') || (dotationInscrite(e.k === 'reinv' ? 'reinvestissement' : 'fiscale')?.amountXof !== e.budget)) && e.budget > 0 && (
                      <button
                        className="trf-act"
                        style={{ marginTop: 11 }}
                        onClick={() => inscrireDotation(e.k === 'reinv' ? 'reinvestissement' : 'fiscale', e.budget)}
                      >
                        {e.pris > 0 ? `Ajuster à ${fmtMoney(e.budget, currency)}` : 'Mettre au coffre'}
                      </button>
                    )}
                  </Case>
                );
              })}
            </div>
          )}

          <Panel title={`Le Partage du bénéfice · ${parts.reinvest} · ${parts.reserve} · ${parts.prelevement}`}>
            {/* LA CASCADE SE LIT DE HAUT EN BAS : ce qui est entré, ce qui est
                sorti, ce qui reste — et seulement ensuite le partage. Montrer
                les enveloppes sans leur origine laissait croire qu'elles se
                prenaient sur l'encaissé. */}
            <Ligne l="Revenu encaissé" v={fmtMoney(revenu, currency)} />
            <Ligne
              l={<span title={ditEnveloppe(cfg, 'charges')}>− Charges salon réelles{poidsCharges != null ? ` · ${poidsCharges} % du revenu (repère ${cfg.pctCharges} %)` : ''}</span>}
              v={`− ${fmtMoney(chargesMois, currency)}`}
              color="var(--color-copper)"
            />
            <Ligne
              l="= Bénéfice réel — c'est LUI qui se partage"
              v={fmtMoney(benefice, currency)}
              strong
              color={benefice > 0 ? 'var(--trf-success)' : 'var(--trf-error)'}
            />

            {benefice > 0 ? (
              (['reinvest', 'reserve', 'prelevement'] as const).map((k) => (
                <Ligne
                  key={k}
                  l={<span title={ditEnveloppe(cfg, k)}>{ENVELOPPE_LABELS[k]}{k === 'prelevement' ? ' (foyer)' : ''} · {parts[k]} % du bénéfice</span>}
                  v={fmtMoney(env[k], currency)}
                />
              ))
            ) : (
              <div className="trf-empty" style={{ marginTop: 10 }}>
                <b>Le salon n'a rien dégagé ce mois — il n'y a rien à partager.</b> Les trois enveloppes valent zéro :
                on ne répartit pas une perte. Tout retrait du foyer ce mois-ci dépasse donc un budget nul, et se
                convertit en prêt des associés envers le salon.
                {monthKey(todayISO()) === month && (
                  <> Le mois n'est pas fini : les charges déjà réglées pèsent contre un revenu encore partiel.</>
                )}
              </div>
            )}

            <div className="trf-empty" style={{ marginTop: 10 }}>
              Le prélèvement et les réserves ne sont pas des charges du salon : ce sont des distributions de ce
              qui RESTE une fois les charges payées. Le vrai coût du salon, c'est la ligne Charges seulement.
            </div>
          </Panel>

          <Panel title="Ce qui part au foyer">
            <Ligne l="Budget prélèvement (la règle)" v={fmtMoney(env.prelevement, currency)} />
            <Ligne l="Prélèvement réel du mois" v={fmtMoney(preleve, currency)} />
            <Ligne
              l={ecart < 0 ? 'DÉPASSEMENT — le foyer a trop pris ce mois' : 'Reste à prélever'}
              v={fmtMoney(Math.abs(ecart), currency)}
              strong
              color={ecart < 0 ? 'var(--trf-error)' : 'var(--trf-success)'}
            />
            {ecart < 0 && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button className="trf-act trf-act--warn" onClick={convertirDepassement}>
                  {pretDuMois
                    ? (pretDuMois.amountXof === -ecart ? 'Dépassement déjà converti en prêt' : `Ajuster le prêt du mois à ${fmtMoney(-ecart, currency)}`)
                    : `Convertir le dépassement en prêt (${fmtMoney(-ecart, currency)})`}
                </button>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                  L'écart devient une dette du foyer envers le salon — tracée, remboursable, jamais oubliée.
                </span>
              </div>
            )}
            {ecart >= 0 && pretDuMois && (
              <div className="trf-empty" style={{ marginTop: 10 }}>
                Un prêt de {fmtMoney(pretDuMois.amountXof, currency)} avait été inscrit pour ce mois — le dépassement a disparu depuis.
                S'il n'a plus lieu d'être, il se supprime dans l'onglet Prêts associés.
              </div>
            )}
          </Panel>

          <Panel title="Ce que vous mettez de côté">
            {(['reinvestissement', 'fiscale'] as EnveloppeReserve[]).map((e) => {
              const propose = e === 'reinvestissement' ? env.reinvest : env.reserve;
              const inscrite = dotationInscrite(e);
              return (
                <div key={e} className="trf-tally">
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {RESERVE_LABELS[e]} · proposé {fmtMoney(propose, currency)}
                    {inscrite && <> · <span style={{ color: 'var(--trf-success)' }}>inscrite le {frDay(inscrite.date)} — {fmtMoney(inscrite.amountXof, currency)}</span></>}
                  </span>
                  {(!inscrite || inscrite.amountXof !== propose) && propose > 0 && (
                    <button className="trf-act" onClick={() => inscrireDotation(e, propose)}>
                      {inscrite ? `Ajuster à ${fmtMoney(propose, currency)}` : 'Inscrire la dotation'}
                    </button>
                  )}
                </div>
              );
            })}
            <Ligne l="Épargne inscrite ce mois" v={fmtMoney(epargneInscrite, currency)} strong color="var(--trf-success)" />
            <div className="trf-empty" style={{ marginTop: 10 }}>
              L'argent qui n'existait pas avant. Voilà de quoi réinvestir. Rien ne s'inscrit tout seul : la dotation se propose, le souverain l'inscrit — deux clics ne font qu'une ligne.
            </div>
          </Panel>

          <Panel title="Dette des associés envers le salon">
            <Ligne
              l={dette > 0 ? 'Prêts en cours — à rembourser' : 'Prêts en cours'}
              v={dette > 0 ? fmtMoney(dette, currency) : '0 — tout est remboursé'}
              strong
              color={dette > 0 ? 'var(--trf-error)' : 'var(--trf-success)'}
            />
            {dette > 0 && (
              <div className="trf-empty" style={{ marginTop: 10 }}>
                Ce que le foyer doit rendre au salon. Remboursement conseillé : une retenue sur les prélèvements des
                mois suivants, jusqu'à extinction — elle s'inscrit dans l'onglet Prêts associés.
              </div>
            )}
          </Panel>

          <Panel title="Caisses indépendantes · hors MND — pour information" style={{ background: 'var(--grad-indigo)', border: 'none' }}>
            {mesCaisses.length === 0 && (
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--indigo-100)' }}>
                Aucune caisse indépendante — elles se créent dans l'onglet du même nom.
              </div>
            )}
            {mesCaisses.map((c) => (
              <Ligne
                key={c.id}
                l={<span style={{ color: 'var(--indigo-100)' }} title={c.dit ?? ''}>{c.nom}</span>}
                v={<span style={{ color: 'var(--color-ivoire)' }}>{fmtCaisse(soldeCaisse(mvtsCaisse, c.id), deviseDeCaisse(c, currency))}</span>}
              />
            ))}
            <div style={{ marginTop: 10, fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--indigo-100)' }}>
              Ces soldes ne s'additionnent JAMAIS aux chiffres MND ci-dessus. Mondes étanches.
            </div>
          </Panel>
        </div>
      )}

      {/* ═══════ PRÉLÈVEMENTS — l'annexe du foyer ═══════ */}
      {tab === 'journal' && (
        <div>
          <div className="trf-toolbar" style={{ marginTop: 0 }}>
            <MonthNav month={month} onChange={setMonth} />
          </div>

          <div className="tr-grid tr-grid--3" style={{ marginTop: 18 }}>
            <div className="trf-kpi" style={{ '--accent': 'var(--color-indigo)' } as CSSProperties}>
              <div className="l">Budget prélèvement du mois</div>
              <div className="v">{fmtMoney(env.prelevement, currency)}</div>
              <div className="c">défini par la règle du Partage</div>
            </div>
            <div className="trf-kpi" style={{ '--accent': 'var(--color-copper)' } as CSSProperties}>
              <div className="l">Déjà prélevé</div>
              <div className="v">{fmtMoney(preleve, currency)}</div>
              <div className="c">{duMois.length} retrait{duMois.length > 1 ? 's' : ''} ce mois</div>
            </div>
            <div className="trf-kpi" style={{ '--accent': ecart < 0 ? 'var(--trf-error)' : 'var(--trf-success)' } as CSSProperties}>
              <div className="l">{ecart < 0 ? 'Dépassement' : 'Reste à prélever'}</div>
              <div className="v">{fmtMoney(Math.abs(ecart), currency)}</div>
              <div className="c">{ecart < 0 ? 'le foyer a trop pris — réduire, ou convertir en prêt (onglet Le mois)' : 'le foyer vit là-dessus, pas plus'}</div>
            </div>
          </div>

          {/* LES TROIS FORMULAIRES JUMEAUX SONT PARTIS (14 août) : « + Inscrire
              un mouvement » les remplace tous — une question, la réponse
              choisit le registre. Les registres ci-dessous ne servent plus
              qu'à LIRE et à CORRIGER ce qui est écrit. */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="trf-act trf-act--primary" onClick={() => setMvtOuvert(true)}>
              + Inscrire un mouvement
            </button>
          </div>

          {/* CHAQUE RETRAIT SE CORRIGE EN PLACE. Une ligne fausse qu'on ne peut
              que SUPPRIMER pousse à effacer puis ressaisir — on y perd la date,
              le motif, et parfois la ligne elle-même. Les retraits repris du
              registre Dépenses (99 lignes du 11 août) portent des motifs
              DÉDUITS d'un libellé : ce sont les premiers à devoir se corriger. */}
          <Panel title={`Les retraits de ${monthTitle(month)}`}>
            {duMois.length === 0 && <div className="trf-empty">Aucun retrait ce mois — le registre est vide, pas en panne.</div>}
            {duMois.map((p) => (
              editPrel?.id === p.id ? (
                <div key={p.id} style={{ padding: '12px 0', borderTop: '1px solid var(--hairline)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                    <Field label="Date"><Input type="date" value={editPrel.date} onChange={(e) => setEditPrel({ ...editPrel, date: e.target.value })} /></Field>
                    <Field label="Bénéficiaire">
                      <Select value={editPrel.beneficiaire} onChange={(e) => setEditPrel({ ...editPrel, beneficiaire: e.target.value })}>
                        {avecCourant(BENEFICIAIRES, editPrel.beneficiaire).map((b) => <option key={b} value={b}>{b}</option>)}
                      </Select>
                    </Field>
                    <Field label="Motif">
                      <Select value={editPrel.motif} onChange={(e) => setEditPrel({ ...editPrel, motif: e.target.value })}>
                        {avecCourant(MOTIFS_PRELEVEMENT, editPrel.motif).map((m) => <option key={m} value={m}>{m}</option>)}
                      </Select>
                    </Field>
                    <Field label="Note (libre)"><Input value={editPrel.note} onChange={(e) => setEditPrel({ ...editPrel, note: e.target.value })} /></Field>
                    <Field label={`Montant (${currency})`}><Input inputMode="numeric" value={editPrel.montant} onChange={(e) => setEditPrel({ ...editPrel, montant: e.target.value })} /></Field>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button className="trf-act" onClick={sauvePrelevement} disabled={litXof(editPrel.montant) <= 0}>Enregistrer</button>
                    <button className="trf-act trf-act--ghost" onClick={() => setEditPrel(null)}>Annuler</button>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                      Changer la date pour un autre mois déplace ce retrait dans ce mois-là — et son budget.
                    </span>
                  </div>
                </div>
              ) : (
                <div key={p.id} className="trf-tally">
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {frDay(p.date)} · <strong style={{ color: 'var(--color-indigo)' }}>{p.beneficiaire}</strong> · {p.motif}{p.note ? ` — ${p.note}` : ''}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500, color: 'var(--color-indigo)' }}>{fmtMoney(p.amountXof, currency)}</span>
                    <button className="trf-act trf-act--ghost" onClick={() => ouvreEditionPrel(p)}>Modifier</button>
                    <button className="trf-iconbtn" title="Supprimer" onClick={() => supprime(setPrelevements, p.id, 'ce retrait')}>✕</button>
                  </span>
                </div>
              )
            ))}
          </Panel>
        </div>
      )}

      {/* ═══════ PRÊTS ASSOCIÉS — la dette tracée ═══════ */}
      {tab === 'journal' && (
        <div>
          <div className="tr-grid tr-grid--3" style={{ marginTop: 8 }}>
            <div className="trf-kpi" style={{ '--accent': dette > 0 ? 'var(--trf-error)' : 'var(--trf-success)' } as CSSProperties}>
              <div className="l">Dette en cours des associés envers le salon</div>
              <div className="v">{fmtMoney(dette, currency)}</div>
              <div className="c">{dette > 0 ? 'se rembourse par retenue sur les prélèvements suivants, jusqu’à extinction' : 'tout est remboursé'}</div>
            </div>
          </div>


          <Panel title="Le registre — du premier prêt à aujourd'hui">
            {prets.filter((p) => p.branchId === branch.id).length === 0 && (
              <div className="trf-empty">Aucun prêt — le foyer n'a jamais dépassé son budget, ou rien n'a encore été tracé.</div>
            )}
            {(() => {
              let cumul = 0;
              return prets
                .filter((p) => p.branchId === branch.id)
                .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
                .map((p) => {
                  cumul += pretSigneXof(p);
                  const visible = Math.max(0, cumul);
                  if (editPret?.id === p.id) {
                    return (
                      <div key={p.id} style={{ padding: '12px 0', borderTop: '1px solid var(--hairline)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                          <Field label="Date"><Input type="date" value={editPret.date} onChange={(e) => setEditPret({ ...editPret, date: e.target.value })} /></Field>
                          <Field label="Type">
                            <Select value={editPret.type} onChange={(e) => setEditPret({ ...editPret, type: e.target.value as 'pret' | 'remboursement' })}>
                              <option value="pret">Prêt — le foyer a pris au-delà du budget</option>
                              <option value="remboursement">Remboursement — retenue ou versement</option>
                            </Select>
                          </Field>
                          <Field label="Associé">
                            <Select value={editPret.associe} onChange={(e) => setEditPret({ ...editPret, associe: e.target.value })}>
                              {avecCourant(BENEFICIAIRES, editPret.associe).map((b) => <option key={b} value={b}>{b}</option>)}
                            </Select>
                          </Field>
                          <Field label="Motif"><Input value={editPret.motif} onChange={(e) => setEditPret({ ...editPret, motif: e.target.value })} /></Field>
                          <Field label={`Montant (${currency})`}><Input inputMode="numeric" value={editPret.montant} onChange={(e) => setEditPret({ ...editPret, montant: e.target.value })} /></Field>
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <button className="trf-act" onClick={sauvePret} disabled={litXof(editPret.montant) <= 0}>Enregistrer</button>
                          <button className="trf-act trf-act--ghost" onClick={() => setEditPret(null)}>Annuler</button>
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                            La dette cumulée se recalcule d'elle-même, ligne après ligne.
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={p.id} className="trf-tally">
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                        {frDay(p.date)} · <strong style={{ color: p.type === 'pret' ? 'var(--trf-error)' : 'var(--trf-success)' }}>
                          {p.type === 'pret' ? 'PRÊT' : 'REMBOURSEMENT'}
                        </strong> · {p.associe} · {p.motif}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500, color: 'var(--color-indigo)' }}>
                          {p.type === 'pret' ? '+' : '−'} {fmtMoney(p.amountXof, currency)}
                        </span>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>dette · {fmtMoney(visible, currency)}</span>
                        <button
                          className="trf-act trf-act--ghost"
                          onClick={() => setEditPret({
                            id: p.id, date: p.date, type: p.type, associe: p.associe,
                            motif: p.motif, montant: String(p.amountXof),
                          })}
                        >
                          Modifier
                        </button>
                        <button className="trf-iconbtn" title="Supprimer" onClick={() => supprime(setPrets, p.id, 'cette ligne du registre des prêts')}>✕</button>
                      </span>
                    </div>
                  );
                });
            })()}
          </Panel>
        </div>
      )}

      {/* ═══════ RÉSERVES — l'argent qui fait grandir le salon ═══════ */}
      {tab === 'journal' && (
        <div>
          <div className="tr-grid tr-grid--3" style={{ marginTop: 8 }}>
            <div className="trf-kpi" style={{ '--accent': 'var(--color-indigo)' } as CSSProperties}>
              <div className="l">Réinvestissement</div>
              <div className="v">{fmtMoney(soldeReinvest, currency)}</div>
              <div className="c">matériel, expansion, formation — intouchable</div>
            </div>
            <div className="trf-kpi" style={{ '--accent': 'var(--color-copper)' } as CSSProperties}>
              <div className="l">Fiscale & imprévus</div>
              <div className="v">{fmtMoney(soldeFiscale, currency)}</div>
              <div className="c">impôts, mois creux, pannes, urgences</div>
            </div>
            <div className="trf-kpi" style={{ '--accent': 'var(--trf-success)' } as CSSProperties}>
              <div className="l">Épargne au Coffre-fort</div>
              <div className="v">{fmtMoney(soldeReinvest + soldeFiscale, currency)}</div>
              <div className="c">
                à l'abri · le coffre entier vaut {fmtMoney(coffreBalance(coffre.filter((m) => m.branchId === branch.id)), currency)}
              </div>
            </div>
          </div>

          <div className="trf-guard" style={{ marginTop: 18 }}>
            Mettre de côté est un SEUL geste : la dotation entre directement au Coffre-fort, où la seule sortie
            autorisée est un virement. L'argent est à l'abri au moment même où vous décidez de l'épargner.
            Ces lignes-là ne sont visibles que de vous — le reste du personnel voit le coffre sans elles.
          </div>

          <Panel title={`Dotations de ${monthTitle(month)} — proposées par le Partage`}>
            {ENVELOPPES_RESERVE.map((e) => {
              const propose = e === 'reinvestissement' ? env.reinvest : env.reserve;
              const inscrite = dotationInscrite(e);
              return (
                <div key={e} className="trf-tally">
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {RESERVE_LABELS[e]} · proposé {fmtMoney(propose, currency)}
                    {inscrite && <> · <span style={{ color: 'var(--trf-success)' }}>au coffre — {fmtMoney(inscrite.amountXof, currency)}</span></>}
                  </span>
                  {(!inscrite || inscrite.amountXof !== propose) && propose > 0 && (
                    <button className="trf-act" onClick={() => inscrireDotation(e, propose)}>
                      {inscrite ? `Ajuster à ${fmtMoney(propose, currency)}` : 'Mettre au coffre'}
                    </button>
                  )}
                </div>
              );
            })}
          </Panel>

          {/* CE FORMULAIRE RESTE — il est le SEUL chemin pour RETIRER d'une
              réserve, ce que la fenêtre « Inscrire un mouvement » ne propose
              pas (on met de côté d'un geste ; on reprend au coffre à bon
              escient, et cela se pèse). */}
          <Panel title="Retirer d’une réserve — ou corriger à la main">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <Field label="Date"><Input type="date" value={fRes.date} onChange={(e) => setFRes({ ...fRes, date: e.target.value })} /></Field>
              <Field label="Enveloppe">
                <Select value={fRes.enveloppe} onChange={(e) => setFRes({ ...fRes, enveloppe: e.target.value as EnveloppeReserve })}>
                  <option value="reinvestissement">Réinvestissement</option>
                  <option value="fiscale">Fiscale & imprévus</option>
                </Select>
              </Field>
              <Field label="Sens">
                <Select value={fRes.sens} onChange={(e) => { setFRes({ ...fRes, sens: e.target.value as 'dotation' | 'retrait' }); setVrsErr(null); }}>
                  <option value="dotation">Dépôt — on met de côté</option>
                  <option value="retrait">Retrait — à bon escient</option>
                </Select>
              </Field>
              <Field label="Note"><Input value={fRes.note} onChange={(e) => setFRes({ ...fRes, note: e.target.value })} placeholder="Achat fauteuil, acompte impôts…" /></Field>
              <Field label={`Montant (${currency})`}><Input inputMode="numeric" value={fRes.montant} onChange={(e) => { setFRes({ ...fRes, montant: e.target.value }); setVrsErr(null); }} placeholder="100 000" /></Field>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="trf-act" onClick={ajouteReserve} disabled={litXof(fRes.montant) <= 0}>Inscrire</button>
              {vrsErr && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--trf-error)' }}>{vrsErr}</span>}
            </div>
          </Panel>

          <Panel title="Le registre de l'épargne — au Coffre-fort">
            {mvtsEnveloppe(coffre, branch.id).length === 0 && (
              <div className="trf-empty">Rien de côté encore — la première dotation se met au coffre d'un clic, ci-dessus.</div>
            )}
            {mvtsEnveloppe(coffre, branch.id).map((m) => (
              editEpa?.id === m.id ? (
                <div key={m.id} style={{ padding: '12px 0', borderTop: '1px solid var(--hairline)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                    <Field label="Date"><Input type="date" value={editEpa.date} onChange={(e) => setEditEpa({ ...editEpa, date: e.target.value })} /></Field>
                    <Field label="Enveloppe">
                      <Select value={editEpa.enveloppe} onChange={(e) => setEditEpa({ ...editEpa, enveloppe: e.target.value as EnveloppeReserve })}>
                        <option value="reinvestissement">Réinvestissement</option>
                        <option value="fiscale">Fiscale & imprévus</option>
                      </Select>
                    </Field>
                    <Field label="Sens">
                      <Select value={editEpa.sens} onChange={(e) => setEditEpa({ ...editEpa, sens: e.target.value as 'depot' | 'virement' })}>
                        <option value="depot">Dépôt — on met de côté</option>
                        <option value="virement">Retrait — à bon escient</option>
                      </Select>
                    </Field>
                    <Field label="Note"><Input value={editEpa.note} onChange={(e) => setEditEpa({ ...editEpa, note: e.target.value })} /></Field>
                    <Field label={`Montant (${currency})`}><Input inputMode="numeric" value={editEpa.montant} onChange={(e) => setEditEpa({ ...editEpa, montant: e.target.value })} /></Field>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button className="trf-act" onClick={sauveEpargne} disabled={litXof(editEpa.montant) <= 0}>Enregistrer</button>
                    <button className="trf-act trf-act--ghost" onClick={() => setEditEpa(null)}>Annuler</button>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                      Cette ligne vit au Coffre-fort : la corriger ici la corrige là-bas aussi.
                    </span>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="trf-tally">
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {frDay(m.date)} · <strong style={{ color: 'var(--color-indigo)' }}>{m.enveloppe ? RESERVE_LABELS[m.enveloppe] : 'Épargne'}</strong>
                    {m.note ? ` — ${m.note}` : ''}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500, color: m.kind === 'depot' ? 'var(--trf-success)' : 'var(--trf-error)' }}>
                      {m.kind === 'depot' ? '+' : '−'} {fmtMoney(m.amountXof, currency)}
                    </span>
                    <button
                      className="trf-act trf-act--ghost"
                      onClick={() => setEditEpa({
                        id: m.id, date: m.date, enveloppe: m.enveloppe ?? 'reinvestissement',
                        sens: m.kind, note: m.note ?? '', montant: String(m.amountXof),
                      })}
                    >
                      Modifier
                    </button>
                    <button
                      className="trf-iconbtn"
                      title="Supprimer"
                      onClick={() => {
                        if (!window.confirm('Retirer cette ligne du coffre ? Cette action est irréversible.')) return;
                        supprimeLigneEpargne(m.id);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              )
            ))}
          </Panel>
        </div>
      )}

      {/* ═══════ CAISSES INDÉPENDANTES — mondes étanches ═══════ */}
      {tab === 'caisses' && (
        <div>
          {/* Les caisses en pastilles — le registre de celle qu'on choisit vit dessous. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18, alignItems: 'center' }}>
            {mesCaisses.map((c) => (
              <button
                key={c.id}
                className={`trf-chip ${caisseActive?.id === c.id ? 'is-active' : ''}`}
                onClick={() => { setCaisseSel(c.id); setFEdit(null); }}
                title={c.dit ?? ''}
              >
                {c.nom} · {fmtCaisse(soldeCaisse(mvtsCaisse, c.id), deviseDeCaisse(c, currency))}
              </button>
            ))}
            <button className="trf-act" onClick={() => setFCaisse({ nom: '', devise: currency, dit: '' })}>
              ＋ Nouvelle caisse
            </button>
          </div>

          {fCaisse && (
            <Panel title="Une nouvelle caisse indépendante">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <Field label="Nom"><Input value={fCaisse.nom} onChange={(e) => setFCaisse({ ...fCaisse, nom: e.target.value })} placeholder="Succession · Projet terrain · Tontine…" /></Field>
                <Field label="Monnaie tenue">
                  <Select value={fCaisse.devise} onChange={(e) => setFCaisse({ ...fCaisse, devise: e.target.value })}>
                    <option value={currency}>{currency} — la monnaie de la maison</option>
                    {DEVISES_CAISSE.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </Field>
                <Field label="À quoi elle sert"><Input value={fCaisse.dit} onChange={(e) => setFCaisse({ ...fCaisse, dit: e.target.value })} placeholder="Ce qu'elle garde, en une ligne" /></Field>
              </div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button className="trf-act" onClick={creeCaisse} disabled={!fCaisse.nom.trim()}>Créer la caisse</button>
                <button className="trf-act trf-act--ghost" onClick={() => setFCaisse(null)}>Annuler</button>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                  La monnaie se fige au premier mouvement — un solde ne se relit pas dans une autre devise.
                </span>
              </div>
            </Panel>
          )}

          {mesCaisses.length === 0 && !fCaisse && (
            <div className="trf-empty" style={{ marginTop: 18 }}>
              Aucune caisse pour l'instant. « ＋ Nouvelle caisse » ouvre la première.
            </div>
          )}

          {caisseActive && (
            <Panel title={`${caisseActive.nom} · solde ${fmtCaisse(soldeCaisse(mvtsCaisse, caisseActive.id), deviseActive)}`}>
              {caisseActive.dit && (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 12 }}>
                  {caisseActive.dit}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <Field label="Date"><Input type="date" value={fMvt.date} onChange={(e) => setFMvt({ ...fMvt, date: e.target.value })} /></Field>
                <Field label="Sens">
                  <Select value={fMvt.sens} onChange={(e) => setFMvt({ ...fMvt, sens: e.target.value as 'entree' | 'sortie' })}>
                    <option value="entree">Entrée</option>
                    <option value="sortie">Sortie</option>
                  </Select>
                </Field>
                <Field label="Description"><Input value={fMvt.label} onChange={(e) => setFMvt({ ...fMvt, label: e.target.value })} placeholder="Report de solde, frais notaire, virement reçu…" /></Field>
                <Field label={`Montant (${deviseActive})`}><Input inputMode="decimal" value={fMvt.montant} onChange={(e) => setFMvt({ ...fMvt, montant: e.target.value })} placeholder={enDevise ? '200' : '45 000'} /></Field>
                {enDevise && (
                  <Field label={`Taux (1 ${deviseActive} en ${currency})`}>
                    <Input inputMode="decimal" value={fMvt.taux} onChange={(e) => setFMvt({ ...fMvt, taux: e.target.value })} placeholder="655" />
                  </Field>
                )}
              </div>

              {/* LE MÊME MODÈLE QU'AU FOYER (14 août) : un motif, son détail,
                  et plusieurs postes sur une même sortie. Les motifs sont les
                  mêmes registres — une seule liste à tenir pour toute la
                  maison. */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
                  <span className="trc-microlabel">Motif · facultatif</span>
                  <button type="button" className="tre-link-btn" style={{ marginLeft: 'auto' }} onClick={() => setMotifsOuvert(true)}>
                    Gérer les motifs
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {motifs.map((m) => (
                    <Pastille
                      key={m.id}
                      actif={fMvt.motif === m.name}
                      onClick={() => setFMvt({ ...fMvt, motif: fMvt.motif === m.name ? '' : m.name, sousMotif: '' })}
                    >
                      {m.name}
                    </Pastille>
                  ))}
                </div>
                {motifCaisse && motifCaisse.subs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
                    {motifCaisse.subs.map((s) => (
                      <Pastille
                        key={s}
                        actif={fMvt.sousMotif === s}
                        onClick={() => setFMvt({ ...fMvt, sousMotif: fMvt.sousMotif === s ? '' : s })}
                      >
                        {s}
                      </Pastille>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="trc-microlabel" style={{ marginBottom: 9 }}>Détail des postes · facultatif</div>
                {fMvt.postes.map((p) => (
                  <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7 }}>
                    <Input
                      value={p.label}
                      onChange={(e) => majPosteCaisse(p.id, { label: e.target.value })}
                      placeholder="Ex. frais notaire"
                      style={{ flex: 1, minWidth: 0 }}
                      aria-label="Libellé du poste"
                    />
                    <Input
                      inputMode="decimal"
                      value={p.amountXof ? String(p.amountXof) : ''}
                      onChange={(e) => majPosteCaisse(p.id, { amountXof: litMontant(e.target.value) })}
                      placeholder="0"
                      style={{ width: 110, textAlign: 'right', flex: 'none' }}
                      aria-label="Montant du poste"
                    />
                    <button
                      type="button"
                      onClick={() => retirePosteCaisse(p.id)}
                      aria-label="Retirer ce poste"
                      style={{ flex: 'none', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 15, padding: '0 4px' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={ajoutePosteCaisse}
                  style={{
                    width: '100%', cursor: 'pointer', font: 'inherit', fontSize: 13,
                    border: '1px dashed var(--copper-500)', borderRadius: 3,
                    background: 'transparent', color: 'var(--copper-700)', padding: '10px 13px',
                  }}
                >
                  + Détailler ce mouvement (optionnel)
                </button>
                {postesCaisse.length > 0 && (
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 7 }}>
                    {postesCaisse.length} poste{postesCaisse.length > 1 ? 's' : ''} · le montant vaudra{' '}
                    {fmtCaisse(postesCaisse.reduce((s, p) => s + p.amountXof, 0), deviseActive)}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  className="trf-act"
                  onClick={ajouteMouvement}
                  disabled={litMontant(fMvt.montant) <= 0 || !fMvt.label.trim() || (enDevise && litMontant(fMvt.taux) <= 0)}
                >
                  Inscrire
                </button>
                {enDevise && litMontant(fMvt.montant) > 0 && litMontant(fMvt.taux) > 0 && (
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                    Contre-valeur indicative : {fmtMoney(Math.round(litMontant(fMvt.montant) * litMontant(fMvt.taux)), currency)} — n'entre dans aucun total MND.
                  </span>
                )}
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                  <button
                    className="trf-act trf-act--ghost"
                    onClick={() => setFEdit(fEdit
                      ? null
                      : { id: caisseActive.id, nom: caisseActive.nom, devise: deviseActive, dit: caisseActive.dit ?? '' })}
                  >
                    {fEdit ? 'Fermer' : 'Modifier la caisse'}
                  </button>
                  <button className="trf-act trf-act--stop" onClick={() => supprimeCaisse(caisseActive)}>Supprimer</button>
                </span>
              </div>

              {fEdit && fEdit.id === caisseActive.id && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    <Field label="Nom"><Input value={fEdit.nom} onChange={(e) => setFEdit({ ...fEdit, nom: e.target.value })} /></Field>
                    <Field label="Monnaie tenue">
                      <Select
                        value={fEdit.devise}
                        disabled={mvtsActifs.length > 0}
                        onChange={(e) => setFEdit({ ...fEdit, devise: e.target.value })}
                      >
                        <option value={currency}>{currency} — la monnaie de la maison</option>
                        {DEVISES_CAISSE.map((d) => <option key={d} value={d}>{d}</option>)}
                      </Select>
                    </Field>
                    <Field label="À quoi elle sert"><Input value={fEdit.dit} onChange={(e) => setFEdit({ ...fEdit, dit: e.target.value })} /></Field>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button className="trf-act" onClick={sauveEdition} disabled={!fEdit.nom.trim()}>Enregistrer</button>
                    <button className="trf-act trf-act--ghost" onClick={() => setFEdit(null)}>Annuler</button>
                    {mvtsActifs.length > 0 && (
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                        La monnaie est figée : cette caisse porte déjà des mouvements.
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                {mvtsActifs.length === 0 && <div className="trf-empty">Registre vide.</div>}
                {mvtsActifs.map((m) => (
                  editMvt?.id === m.id ? (
                    <div key={m.id} style={{ padding: '12px 0', borderTop: '1px solid var(--hairline)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                        <Field label="Date"><Input type="date" value={editMvt.date} onChange={(e) => setEditMvt({ ...editMvt, date: e.target.value })} /></Field>
                        <Field label="Sens">
                          <Select value={editMvt.sens} onChange={(e) => setEditMvt({ ...editMvt, sens: e.target.value as 'entree' | 'sortie' })}>
                            <option value="entree">Entrée</option>
                            <option value="sortie">Sortie</option>
                          </Select>
                        </Field>
                        <Field label="Description"><Input value={editMvt.label} onChange={(e) => setEditMvt({ ...editMvt, label: e.target.value })} /></Field>
                        <Field label={`Montant (${deviseActive})`}><Input inputMode="decimal" value={editMvt.montant} onChange={(e) => setEditMvt({ ...editMvt, montant: e.target.value })} /></Field>
                        {enDevise && (
                          <Field label={`Taux (1 ${deviseActive} en ${currency})`}>
                            <Input inputMode="decimal" value={editMvt.taux} onChange={(e) => setEditMvt({ ...editMvt, taux: e.target.value })} />
                          </Field>
                        )}
                      </div>
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <button
                          className="trf-act"
                          onClick={sauveMouvement}
                          disabled={litMontant(editMvt.montant) <= 0 || !editMvt.label.trim() || (enDevise && litMontant(editMvt.taux) <= 0)}
                        >
                          Enregistrer
                        </button>
                        <button className="trf-act trf-act--ghost" onClick={() => setEditMvt(null)}>Annuler</button>
                        {enDevise && litMontant(editMvt.montant) > 0 && litMontant(editMvt.taux) > 0 && (
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                            Contre-valeur indicative : {fmtMoney(Math.round(litMontant(editMvt.montant) * litMontant(editMvt.taux)), currency)}.
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="trf-tally">
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                        {frDay(m.date)} · {m.label}
                        {m.taux ? ` · au taux de ${m.taux.toLocaleString('fr-FR')} (≈ ${fmtMoney(Math.round(m.montant * m.taux), currency)}, indicatif)` : ''}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500, color: m.sens === 'entree' ? 'var(--trf-success)' : 'var(--trf-error)' }}>
                          {m.sens === 'entree' ? '+' : '−'} {fmtCaisse(m.montant, deviseActive)}
                        </span>
                        <button className="trf-act trf-act--ghost" onClick={() => ouvreEditionMvt(m)}>Modifier</button>
                        <button className="trf-iconbtn" title="Supprimer" onClick={() => supprime(setMvtsCaisse, m.id, 'ce mouvement')}>✕</button>
                      </span>
                    </div>
                  )
                ))}
              </div>
            </Panel>
          )}

          {/* LE POINT DU JOUR (15 août) — ce qui est entré et sorti AUJOURD'HUI,
              caisse par caisse. Chacune tient sa propre monnaie : les lignes ne
              s'additionnent donc pas entre elles, et on ne feint pas un total
              unique qui ne voudrait rien dire. */}
          <Panel title={`Le point du jour · ${frDay(todayISO())}`}>
            {pointDuJour.length === 0 ? (
              <div className="trf-empty">Aucun mouvement inscrit aujourd'hui.</div>
            ) : (
              pointDuJour.map((j) => (
                <div key={j.id} className="trf-tally">
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    <strong style={{ color: 'var(--color-indigo)' }}>{j.nom}</strong>
                    {' · '}{j.n} mouvement{j.n > 1 ? 's' : ''}
                    {' · solde '}{fmtCaisse(j.solde, j.devise)}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--trf-success)' }}>
                      + {fmtCaisse(j.entrees, j.devise)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--trf-error)' }}>
                      − {fmtCaisse(j.sorties, j.devise)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, color: j.net < 0 ? 'var(--trf-error)' : 'var(--color-indigo)' }}>
                      {j.net < 0 ? '−' : '+'} {fmtCaisse(Math.abs(j.net), j.devise)}
                    </span>
                  </span>
                </div>
              ))
            )}
            {pointDuJour.length > 1 && (
              <div className="trf-empty" style={{ marginTop: 10 }}>
                Chaque caisse tient sa monnaie : ces lignes ne s'additionnent pas entre elles.
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ═══════ LA RÈGLE DU PARTAGE — les 4 enveloppes ═══════ */}
      {tab === 'regle' && (
        <div>
          <div className="trf-guard" style={{ marginTop: 8 }}>
            Les charges se paient d'abord, à leur montant RÉEL. C'est le <b>bénéfice</b> — ce qui reste — qui se
            partage en trois. Le repère de charges ne prend rien au partage : il sert seulement à dire si vos
            charges tiennent l'objectif que vous vous êtes fixé.
          </div>

          <Panel title="Les trois parts du bénéfice — leur somme doit faire 100 %">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <Field label="Réinvestissement (%)"><Input inputMode="numeric" value={cfgForm.reinvest} onChange={(e) => setFCfg({ ...cfgForm, reinvest: e.target.value })} /></Field>
              <Field label="Réserve fiscale & imprévus (%)"><Input inputMode="numeric" value={cfgForm.reserve} onChange={(e) => setFCfg({ ...cfgForm, reserve: e.target.value })} /></Field>
              <Field label="Prélèvement Associés (%)"><Input inputMode="numeric" value={cfgForm.prelevement} onChange={(e) => setFCfg({ ...cfgForm, prelevement: e.target.value })} /></Field>
              <Field label="Repère de charges (% du revenu)"><Input inputMode="numeric" value={cfgForm.charges} onChange={(e) => setFCfg({ ...cfgForm, charges: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: cfgTotal === 100 ? 'var(--trf-success)' : 'var(--trf-error)' }}>
                Total des trois parts · {cfgTotal} %{cfgTotal !== 100 && ' — la règle ne s’enregistre qu’à 100'}
              </span>
              <button className="trf-act" onClick={sauveCfg} disabled={cfgTotal !== 100}>Enregistrer la règle</button>
              {fCfg && <button className="trf-act trf-act--ghost" onClick={() => setFCfg(null)}>Annuler</button>}
            </div>
            <div className="trf-empty" style={{ marginTop: 12 }}>
              Départ conseillé : {PARTAGE_DEFAUT.pctReinvest} · {PARTAGE_DEFAUT.pctReserve} · {PARTAGE_DEFAUT.pctPrelevement} sur le bénéfice,
              avec un repère de charges à {PARTAGE_DEFAUT.pctCharges} % du revenu. Ce sont VOS chiffres qui
              commandent : après deux ou trois mois de saisie, relisez la part réelle des charges et ajustez.
            </div>
          </Panel>

          <Panel title="Ce que chaque enveloppe veut dire — à écrire dans vos mots">
            <div style={{ display: 'grid', gap: 12 }}>
              {CLES_ENVELOPPES.map((k) => (
                <Field key={k} label={ENVELOPPE_LABELS[k]}>
                  <Textarea
                    rows={2}
                    value={ditsForm[k]}
                    placeholder={PARTAGE_DITS[k]}
                    onChange={(e) => setFDits({ ...ditsForm, [k]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="trf-act" onClick={sauveDits} disabled={!fDits}>Enregistrer les définitions</button>
              {fDits && <button className="trf-act trf-act--ghost" onClick={() => setFDits(null)}>Annuler</button>}
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                Un champ vidé retombe sur la phrase de départ — une enveloppe ne reste jamais muette.
              </span>
            </div>
            <div className="trf-empty" style={{ marginTop: 10 }}>
              Les charges du salon se saisissent dans l'écran DÉPENSES, comme toujours — sa nomenclature couvre le modèle
              (Loyer → Local, Produits & Stock → Matières premières, Salaires employés → Salaires, Banque & frais → Frais bancaires).
              Les retraits du foyer, eux, ne s'y saisissent PLUS JAMAIS : ils vivent ici, dans l'annexe Prélèvements.
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
