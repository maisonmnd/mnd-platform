import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { OptionsPrestations, PageHead, WaLien } from '../_ui';
import { Button, Card, Eyebrow, Field, Input, Modal, Select, Textarea, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import {
  usePaymentMethods, useCashboxes, caisseParDefaut, nouvelleFacture, ligneFacture,
  invoicesStore, type Invoice, type InvoicePayment,
} from '../../../../shared/finance';
import {
  shortDate, dateComplete, anciennete, usePlans, useSubscribers, ensureStarterPlans, ensureStarterPlanIncluded,
  subCycleAmountXof, subMonthlyXof, subPaid, cycleDays, cycleLabel,
  subServiceUsage, usageDetaille, rdvCouvertsDe, rdvCouvertsHorsFormule, cycleWindow, subWindow, poseLesFormulesMarketing, formulesMarketingAbsentes, FAMILLES_FORMULES,
  prixDeLaFormule, libelleFourchette, SELON_LE_CALIBRE, partMensuelleDeLaFormule, moisDuPack, valeurALaCarte, remiseSurLaCarte, type PlanMode,
  type TeteConnue,
  prixVenduXof, ecartDuPrixConvenu, inclusVendus, libellesInclus, abonnementsVivantsDe,
  comptesAbonnement, comptesRanges, moteurDesAbonnements, ETAT_LABEL,
  prochaineReferenceAbo,
  type Plan, type Subscriber, type Payment, type SubCycle, type PlanIncluded, type FamilleFormule,
} from './data';
import { useServices, LONGUEURS } from '../../../../shared/catalog';
import {
  useModelBands, useBandSets, bandsAbonnements, sortedBands, bandLabel, roundPrice,
  calibreDeLaTete,
} from '../../../../shared/pricing';
import { useAppointments, appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { proposeLaCadence, decaleLaSuite, RYTHMES_ABO, type SeanceProposee } from '../../../../shared/cadence';
import { maitreParDefaut } from '../../../../shared/branches';
 import { DECOUPES, SEUIL_ECHELONNEMENT_XOF, construitEcheancier, deplaceEcheance, etatDesEcheances, enRetardXof, peutEtreEchelonne, prochaineEcheance, resteDeLEcheancier, type Decoupe, type Echeance } from '../../../../shared/echeancier';
import { REMISE_OPTION_PCT, RYTHMES, VOIES, libelleCouleur, partMensuelleXof, reprisesDeCouleur, supplementCouleurXof, supplementSansRemiseXof, voieDe, type RythmeCouleur, type VoieCouleur } from '../../../../shared/couleur';
import { demandesFormuleStore, useDemandesFormule, type DemandeFormule } from '../../../../shared/bridges';
import { ClientPicker, RdvModal, useBranchClients } from '../clients/_shared';
import { Bar, DeepNote, Pill, Tabs } from './ui';
import './equipe.css';

type Tab = 'moteur' | 'formules' | 'membres' | 'comptes';
type FiltreCompte = 'tous' | 'en-cours' | 'a-relancer' | 'retard' | 'parties';

type PlanForm = {
  name: string; tag: string; price: string; line: string; perks: string;
  included: PlanIncluded[]; popular: boolean; famille: FamilleFormule | '';
  mode: PlanMode; moisValidite: string;
  /* ── LE PRIX SUIT LA TÊTE — 1er septembre 2026 ────────────────────
     Les cases se tiennent en TEXTE, comme partout ailleurs dans les
     formulaires de la Maison : une case vide doit rester vide, et un zéro
     saisi doit rester un zéro. Un champ numérique confondrait les deux, et
     « prends le calcul » deviendrait « c'est gratuit ». */
  suitLeCalibre: boolean;
  parCalibre: Record<string, string>;
  suppLongueur: Record<string, string>;
};
type SubForm = {
  clientId: string; planId: string; slot: string; cycle: SubCycle; parts: Decoupe | null;
  /** La première tranche, en toutes lettres. Vide = le partage égal. */
  premiere: string;
  /** ── LES DATES POSÉES À LA SIGNATURE — 1er septembre 2026 ────────
      « Modifier les dates des paiements des abonnements » (Yéman).

      TRENTE JOURS EST UNE COMMODITÉ, PAS UN ACCORD. Une cliente payée le 5 de
      chaque mois ne peut pas honorer une échéance au 1er ; l'imposer, c'est
      fabriquer un retard qu'on lui reprochera ensuite.

      ON NE GARDE QUE LES DATES TOUCHÉES, jamais l'échéancier entier : les
      MONTANTS restent dérivés du total et de la première tranche, et changer
      le prix ne laisse donc pas derrière lui un échéancier périmé. */
  dates: Record<string, string>;
  voie: VoieCouleur | ''; rythme: RythmeCouleur; couleurServiceId: string;
  /* ── CE QUI SE CONVIENT AU COMPTOIR — 28 août 2026 ──────────────
     Tous vides par défaut : sans eux, la vente se fait au prix et au contenu
     du catalogue, exactement comme avant. Personne n'a un champ de plus à
     remplir pour une vente ordinaire. */
  /** Saisi en chiffres. Vide = elle paie le prix de la formule. */
  prixConvenu: string;
  /** Pourquoi ce prix. Facultatif, jamais bloquant. */
  motif: string;
  /** `null` = le contenu de la formule, intact. Dès qu'on touche une quantité,
      la liste devient CELLE DE CETTE VENTE et cesse de suivre la formule. */
  inclus: PlanIncluded[] | null;
  /** Durée de vie du paquet, en mois. Vide = celle de la formule. */
  validiteMois: string;
};
const CYCLES: SubCycle[] = ['mensuel', 'semestriel', 'annuel'];
type PayForm = { amount: string; date: string; method: string };
/** Le jour où ce contrat a commencé d'exister — miroir local du juge partagé,
    pour l'affichage seul. */
const debutDuContratLocal = (m: Subscriber) => m.startIso ?? m.sinceIso ?? '';

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
  const [planForm, setPlanForm] = useState<PlanForm>({ name: '', tag: '', price: '', line: '', perks: '', included: [], popular: false, famille: '', mode: 'cycle', moisValidite: '12', suitLeCalibre: false, parCalibre: {}, suppLongueur: {} });
  /* ── DEUX BARÈMES, ET ILS NE SE CONFONDENT PAS — 1er sept. 2026 ───
     `bands` dit dans QUELLE tranche tombe une tête : les bornes de locks sont
     communes à toute la Maison, un seul langage de taille.
     `calibresAbo` dit ce que cette tranche COÛTE en abonnement : c'est le
     second cadran, celui qu'on ne majore pas comme une séance. */
  const [bands] = useModelBands();
  const [jeuxDeCalibres] = useBandSets();
  const calibresAbo = useMemo(
    () => bandsAbonnements(jeuxDeCalibres, bands), [jeuxDeCalibres, bands],
  );
  const calibres = useMemo(() => sortedBands(calibresAbo), [calibresAbo]);
  const [services] = useServices();
  const [allAppts] = useAppointments();
  const navigate = useNavigate();
  const [suiviFor, setSuiviFor] = useState<Subscriber | null>(null);
  /* ══ LA VALIDITÉ SE CORRIGE OÙ ELLE SE LIT — 1er septembre 2026 ═════
     « Changer la date de validité du contrat » (Yéman). La fenêtre s'annonçait
     dans le Suivi et ne se touchait nulle part : une échéance saisie de
     travers à la vente restait fausse pour la vie du paquet, et c'est elle qui
     décide de ce qui se décompte. */
  const [datesEdit, setDatesEdit] = useState<{ debut: string; fin: string } | null>(null);
  /* ══ LA CADENCE POSÉE — 1er septembre 2026 ═════════════════════════
     « Poser automatiquement les RDV à venir. » L'écran PROPOSE, il n'écrit
     rien tant qu'on n'a pas dit oui : chaque date se corrige, se retire, et
     toute la suite se décale d'un geste. */
  const [cadenceForm, setCadenceForm] = useState<
    { pas: number; depart: string; heure: string; maitre: string; suite: SeanceProposee[] } | null
  >(null);
  /* ══ UN CONTRAT SIGNÉ NE SE TOUCHAIT PLUS — 1er septembre 2026 ═════
     « Est-ce possible de modifier l'abonnement Pack personnalisé de Mylène
     Grimaud d'octobre 2025 à juin 2026, et de lui mettre plutôt un abonnement
     Juste Cadence qui couvre ses différents rendez-vous, avec la modification
     du contenu » (Yéman).

     LES QUATRE GESTES ÉTAIENT : suivre, régler, résilier, supprimer. Une vente
     mal saisie n'avait donc que deux issues, la garder fausse ou la détruire —
     et la détruire emporte ses règlements, sa pièce et son histoire. */
  /* ══ LES COMPTES — 2 septembre 2026 ════════════════════════════════
     L'onglet « Les abonnés » liste des CONTRATS ; celui-ci raconte des TÊTES.
     Les deux servent : la table pour encaisser vite, le compte pour comprendre
     une cliente avant de lui parler. */
  const [filtreCompte, setFiltreCompte] = useState<FiltreCompte>('tous');
  const [histoireOuverte, setHistoireOuverte] = useState<string[]>([]);
  const [contratEdit, setContratEdit] = useState<
    { sub: Subscriber; planId: string; inclus: PlanIncluded[] } | null
  >(null);
  /* ══ LE RITUEL S'OUVRE, PAS LA FICHE — 1er septembre 2026 ═══════════
     « Quand je clique le RDV ça ouvre le profil du client. Je veux que ça
     ouvre le RDV plutôt » (Yéman).

     La fiche obligeait à retrouver la séance dans un historique pour la
     corriger : trois écrans pour décocher une case. Le clic ouvre donc la
     fiche du RENDEZ-VOUS, celle qui porte ses prestations, ses mains, son
     statut et la case « couvert par l'abonnement » qui décompte le jeton.

     ON REVIENT AU SUIVI EN FERMANT. Deux voiles empilés ne se ferment pas
     proprement (Échap les ferme tous les deux) ; le suivi s'efface donc le
     temps du rituel et se rouvre derrière lui, sur des compteurs relus. */
  const [rdvOuvert, setRdvOuvert] = useState<{ appt: Appointment; retourA: Subscriber } | null>(null);
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? 'Prestation retirée';
  const [subModal, setSubModal] = useState(false);
  const [subForm, setSubForm] = useState<SubForm>({ clientId: '', planId: plans[0]?.id ?? '', slot: '', cycle: 'mensuel', parts: null, premiere: '', dates: {}, voie: '', rythme: 'reguliere', couleurServiceId: '', prixConvenu: '', motif: '', inclus: null, validiteMois: '' });
  const [methods] = usePaymentMethods();
  const [payFor, setPayFor] = useState<Subscriber | null>(null);
  const [payForm, setPayForm] = useState<PayForm>({ amount: '', date: '', method: '' });
  /* LA CAISSE CRÉDITÉE — sans elle, l'argent n'entre dans aucun tiroir. */
  const [cashboxes] = useCashboxes();
  const branchBoxes = useMemo(() => cashboxes.filter((c) => c.branchId === branch.id), [cashboxes, branch.id]);
  const [caisse, setCaisse] = useState('');

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
  /* SUPPRIMER POUR DE BON, ET SANS TRACE — 29 aout 2026.

     « Je ne veux pas juste resilier un abonnement mais plutot supprimer
     definitivement et sans trace » (Yeman).

     LA SUPPRESSION EST OUVERTE PARTOUT : sur les abonnements vivants comme
     sur les partis, et meme sur ceux qui ont recu des reglements. La Maison
     appartient a Yeman ; lui refuser un geste qu'il demande explicitement, ce
     serait le pousser a le faire a la main dans la base, ou rien ne previent.

     MAIS CE QUI PART SE DIT EN FRANCS. Un reglement encaisse au comptoir
     n'existe QUE sur cette fiche : `savePay` l'inscrit dans `payments[]` et ne
     cree ni mouvement de caisse ni facture. Supprimer l'abonnement efface donc
     la seule trace de cet argent. Les reglements KkiaPay survivent, eux, au
     registre `payments` — mais orphelins de ce qu'ils reglaient.

     La fenetre nomme donc la tete, la formule, et la SOMME qui disparait. On
     n'empeche pas, on ne laisse pas ignorer. */
  const [aSupprimer, setASupprimer] = useState<Subscriber | null>(null);

  /* ── DÉCOUPER APRÈS COUP — 29 août 2026 ──────────────────────────
     « Le paiement en plusieurs fois ne s'active plus quand ça vient de Ma
     Couronne » (Yéman). L'échéancier ne s'écrivait QU'À LA SIGNATURE, dans le
     formulaire « Nouvel abonné ». Un abonnement pris par la cliente elle-même
     ne passait pas par ce formulaire : il ne pouvait donc JAMAIS recevoir de
     découpe, et rien à l'écran ne disait pourquoi.

     C'EST ICI QUE VIVENT LES QUATRE FOIS. Ma Couronne n'offre que deux fois ;
     la découpe en quatre est un accord qui se donne en face, et ce bouton est
     l'endroit où la Maison le donne.

     LA DÉCOUPE RESTE UNE PAROLE DONNÉE : écrite une fois, elle ne se
     recalcule pas. On ne l'offre donc que sur un abonnement qui n'en a pas. */
  const [aDecouper, setADecouper] = useState<Subscriber | null>(null);
  const [partsDecoupe, setPartsDecoupe] = useState<Decoupe>(2);

  /** Ce qu'il y a à découper : son prix à elle, option couleur comprise. */
  const aRegler = (m: Subscriber): number =>
    prixVenduXof(m, planOf(m.planId), m.cycle ?? 'mensuel') + (m.couleur?.supplementXof ?? 0);

  const decoupe = (m: Subscriber) => {
    const total = aRegler(m);
    if (!peutEtreEchelonne(total)) { toast('Ce montant est en dessous du seuil de découpe.'); return; }
    /* La première échéance tombe LE JOUR MÊME : on n'accorde pas un crédit qui
       commence par un délai. Ce qu'elle a déjà versé s'impute dessus tout seul
       (l'état se dérive des règlements, il ne se stocke pas). */
    const suite = construitEcheancier(total, partsDecoupe, todayISO());
    setSubs((prev) => prev.map((x) => (x.id === m.id ? { ...x, echeances: suite } : x)));
    setADecouper(null);
    toast(`Abonnement réglable en ${partsDecoupe} fois.`);
  };

  const supprimer = (m: Subscriber) => {
    setSubs((prev) => prev.filter((x) => x.id !== m.id));
    setASupprimer(null);
    const verse = subPaid(m);
    toast(verse > 0
      ? `Abonnement supprimé, avec ${fmtMoney(verse, currency)} de règlements inscrits dessus.`
      : 'Abonnement supprimé. Il ne portait aucun règlement.');
  };

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
  /* ══ LE MRR EST MORT — 2 septembre 2026 ════════════════════════════
     Il valait 18 817 F pour NEUF abonnées, dont deux seulement pesaient
     quelque chose : le montant est figé à la vente dans `mrrXof`, et les têtes
     inscrites avant ce champ, ou passées par Ma Couronne, valent zéro à jamais.
     Ce qui le remplace se lit dans `moteurDesAbonnements`, et se vérifie à la
     caisse : des versements datés, des échéances nommées, des séances qui
     existent. Le champ `mrrXof` reste écrit sur les ventes neuves, aucun écran
     ne le lit plus. */
  const planOf = (id: string) => plans.find((p) => p.id === id);


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
    setPlanForm({ name: '', tag: '', price: '', line: '', perks: '', included: [], popular: false, famille: '', mode: 'cycle', moisValidite: '12', suitLeCalibre: false, parCalibre: {}, suppLongueur: {} });
    setPlanModal(true);
  };
  const openPlanEdit = (p: Plan) => {
    setPlanEditId(p.id);
    setPlanForm({ name: p.name, tag: p.tag, price: String(p.priceXof), line: p.line, perks: p.perks.join(' · '), included: p.included ? p.included.map((i) => ({ ...i })) : [], popular: !!p.popular, famille: p.famille ?? '',
      mode: p.mode ?? 'cycle', moisValidite: String(moisDuPack(p)),
      suitLeCalibre: !!p.suitLeCalibre,
      parCalibre: Object.fromEntries(Object.entries(p.prixParCalibre ?? {}).map(([k, v]) => [k, String(v)])),
      suppLongueur: Object.fromEntries(Object.entries(p.supplementLongueur ?? {}).map(([k, v]) => [k, String(v)])) });
    setPlanModal(true);
  };
  const savePlan = () => {
    /* ── UN REFUS SE DIT — 28 août 2026 ────────────────────────────────
       « Je n'arrive pas à enregistrer le moment du parcours pour le FORFAIT
       VÈKPÈ™ × GBÈJÍ™ » (Yéman). Le formulaire refusait toute formule à prix
       nul et RETOURNAIT EN SILENCE : le bouton restait cuivré, le clic ne
       faisait rien, et rien ne disait pourquoi.

       Deux fautes en une, et la seconde est la pire. D'abord un refus muet :
       un écran qui n'obéit pas doit dire pourquoi, toujours. Ensuite un refus
       DÉPLACÉ : ses forfaits tirent leur prix de leur composition et valent
       0 F dans la fiche ; leur interdire de changer de MOMENT DU PARCOURS,
       qui n'a rien à voir avec le prix, c'était le punir d'un état qu'il
       n'avait pas choisi ici.

       Seul le NOM reste obligatoire — une formule sans nom ne se vend pas. */
    const priceXof = parseInt(planForm.price, 10) || 0;
    /* UNE CASE VIDE DISPARAÎT DE LA FICHE, un zéro saisi y reste : l'absence
       veut dire « prends le calcul », le zéro veut dire « offert à ce
       calibre ». Les confondre rendrait gratuites six formules sur sept. */
    const nombres = (saisi: Record<string, string>): Record<string, number> | undefined => {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(saisi)) {
        const t = String(v).replace(/[^0-9]/g, '');
        if (t === '') continue;
        out[k] = parseInt(t, 10) || 0;
      }
      return Object.keys(out).length ? out : undefined;
    };
    const prixParCalibre = nombres(planForm.parCalibre);
    const supplementLongueur = nombres(planForm.suppLongueur) as Plan['supplementLongueur'];
    const suitLeCalibre = planForm.suitLeCalibre || undefined;
    if (!planForm.name.trim()) {
      toast('Donnez un nom à la formule pour l’enregistrer.');
      return;
    }
    const perks = planForm.perks.split('·').map((s) => s.trim()).filter(Boolean);
    const included = planForm.included.filter((i) => i.serviceId);
    const featured = planForm.popular;
    /* LE MODE ET LA DURÉE DE VIE s'enregistrent explicitement : un paquet sans
       `validityDays` ne s'épuiserait jamais, et la tête pourrait revenir cinq
       ans plus tard réclamer son sixième resserrage. */
    const mode: PlanMode = planForm.mode;
    const validityDays = mode === 'pack'
      ? Math.max(1, Math.min(60, Number(planForm.moisValidite) || 12)) * 30
      : undefined;
    /* ── UNE VEDETTE PAR MOMENT, PAS UNE POUR TOUT — 28 août 2026 ──────
       « Chaque moment du parcours doit avoir sa mise en vedette. Pas une
       seule mise en vedette pour toutes les offres » (Yéman).

       La règle d'origine était « une seule vedette dans la Maison » : mettre
       L'Éclosion en avant éteignait La Suite, et un moment entier se
       retrouvait sans carte indigo. Or la vedette ne compare pas les douze
       formules entre elles — elle dit, DANS SON MOMENT, celle qu'on propose
       en premier. Cinq moments méritent cinq réponses.

       La carte indigo garde son sens tant qu'elle est SEULE DANS SA SECTION :
       c'est là que l'œil compare. */
    const famille = planForm.famille || undefined;
    const memeMoment = (p: Plan) => (p.famille ?? undefined) === famille;

    if (planEditId) {
      setPlans((prev) => prev.map((p) =>
        p.id === planEditId
          ? { ...p, name: planForm.name.trim(), tag: planForm.tag, priceXof, line: planForm.line, perks, included, popular: featured, famille, mode, validityDays, suitLeCalibre, prixParCalibre, supplementLongueur }
          : (featured && memeMoment(p) ? { ...p, popular: false } : p)));
    } else {
      setPlans((prev) => [
        ...(featured ? prev.map((p) => (memeMoment(p) ? { ...p, popular: false } : p)) : prev),
        { id: `pl-${uid()}`, name: planForm.name.trim(), tag: planForm.tag || 'Nouvelle formule', priceXof, line: planForm.line, perks, popular: featured, included, famille, mode, validityDays, suitLeCalibre, prixParCalibre, supplementLongueur },
      ]);
    }
    setPlanModal(false);
    /* Le prix nul ne bloque plus, mais il ne passe pas inaperçu : une formule
       à 0 F s'affiche à la carte et ne rapporte rien. */
    toast(priceXof > 0
      ? 'Formule enregistrée.'
      : 'Formule enregistrée. Son prix est à 0 : elle ne rapportera rien tant qu’il n’est pas posé.');
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

  /* Les demandes venues de Ma Couronne, celles qui attendent encore. */
  const [demandes] = useDemandesFormule();
  const demandesOuvertes = useMemo(
    () => demandes.filter((d) => !d.traiteeLe && clients.some((c) => c.id === d.clientId)),
    [demandes, clients],
  );
  /* Inscrire depuis une demande : le formulaire s'ouvre DÉJÀ REMPLI de ce
     qu'elle a choisi. Il ne reste que le créneau et le règlement — le reste,
     elle l'a dit elle-même. */
  const ouvrirDepuisDemande = (d: DemandeFormule) => {
    setSubForm({
      clientId: d.clientId, planId: d.planId, slot: '', cycle: 'mensuel', premiere: '', dates: {},
      parts: null, voie: '', rythme: 'reguliere', couleurServiceId: '',
      prixConvenu: '', motif: '', inclus: null, validiteMois: '',
    });
    setSubModal(true);
  };
  /* CLASSER N'EFFACE PAS : la demande se tait, elle ne disparaît pas. La leçon
     des abonnements résiliés du 28 août au matin vaut ici aussi. */
  const classerDemande = (id: string) => {
    demandesFormuleStore.set((prev) => prev.map((d) => (d.id === id ? { ...d, traiteeLe: todayISO() } : d)));
    toast('Demande classée. Elle reste dans le registre.');
  };

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

  /* ── CE QUI SE CONVIENT AU COMPTOIR — les lectures du formulaire ──
     Un seul endroit lit les champs négociés, et tout l'écran s'y réfère : le
     prix affiché, le total à découper, la valeur à la carte et l'abonnement
     enregistré. Deux lectures différentes du même champ, c'est un écran qui
     annonce un chiffre et une caisse qui en encaisse un autre. */

  /** Le prix convenu saisi, ou `null` si le champ est vide (elle paie le catalogue). */
  const prixConvenuSaisi = (): number | null => {
    const brut = subForm.prixConvenu.replace(/[^0-9]/g, '');
    return brut === '' ? null : parseInt(brut, 10);
  };
  /** La durée convenue en JOURS, ou `null` si le champ est vide. */
  const validiteConvenue = (): number | null => {
    const brut = subForm.validiteMois.replace(/[^0-9]/g, '');
    const mois = brut === '' ? 0 : parseInt(brut, 10);
    return mois > 0 ? mois * 30 : null;
  };
  /* ══ LA TÊTE DE CELLE À QUI L'ON VEND — 1er septembre 2026 ═════════
     « L'abonnement pour une cliente qui a 350 locks ne passe toujours pas au
     prix de son calibre, je vois toujours le prix fixe » (Yéman).

     LA GRILLE ÉTAIT POSÉE ET LA VENTE NE LA LISAIT PAS. Ma Couronne avait
     appris à demander le calibre ; le comptoir, lui, continuait d'appeler
     `prixDeLaFormule` SANS TÊTE, et retombait donc sur le prix de référence à
     chaque fois. La grille était juste, personne ne l'interrogeait.

     LA MARGE EST COMPRISE, comme partout ailleurs : une faveur accordée sur sa
     fiche vaudrait sur ses rituels et pas sur son abonnement, ce qui ne
     s'expliquerait pas devant elle. */
  const teteDeLaVente = (): TeteConnue => {
    const c = clients.find((x) => x.id === subForm.clientId);
    return {
      bandId: calibreDeLaTete(c?.lockCount ?? c?.lockCountDeclare, bands, c?.margeCalibre)?.id,
      longueur: c?.longueur,
    };
  };

  /** Le contenu tel qu'il sera vendu — le sien s'il a été touché, sinon celui
      de la formule. */
  const inclusDeLaVente = (): PlanIncluded[] => subForm.inclus ?? planOf(subForm.planId)?.included ?? [];
  /** LA PREMIÈRE TRANCHE VOULUE, ou `undefined` pour le partage égal.

      UN SEUL JUGE POUR L'APERÇU ET POUR L'ÉCRITURE — 1er septembre 2026. Deux
      lectures du même montant finiraient par diverger, et l'écran annoncerait
      une somme que la fiche ne porterait pas. */
  const premiereVoulue = (): number | undefined => {
    const n = parseInt((subForm.premiere || '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  /** L'ÉCHÉANCIER DE CETTE VENTE, montants dérivés et dates posées.

      UN SEUL JUGE POUR L'APERÇU ET POUR L'ÉCRITURE : deux constructions du même
      échéancier finiraient par diverger, et la fiche ne porterait pas ce que
      l'écran a promis.

      LES DATES S'APPLIQUENT PAR `deplaceEcheance`, dans l'ordre : c'est lui qui
      garantit qu'une échéance ne remonte jamais avant celle qui la précède, et
      que les suivantes sont poussées juste ce qu'il faut. Reposer cette règle
      ici en aurait fait une seconde, qui aurait fini par contredire l'autre. */
  const echeancierDeLaVente = (totalXof: number): Echeance[] => {
    if (!subForm.parts) return [];
    let liste = construitEcheancier(totalXof, subForm.parts, todayISO(), 30, premiereVoulue());
    for (const e of liste) {
      const voulue = subForm.dates[String(e.numero)];
      if (voulue) liste = deplaceEcheance(liste, e.numero, voulue);
    }
    return liste;
  };

  /** Le prix RÉELLEMENT demandé pour cette vente, option couleur exclue. */
  const prixDeLaVente = (): number => {
    const plan = planOf(subForm.planId);
    return prixConvenuSaisi() ?? (plan ? prixDeLaFormule(plan, subForm.cycle, teteDeLaVente(), calibresAbo).montantXof : 0);
  };
  /** Les mois que couvre cette vente — la durée convenue fait foi sur un pack. */
  const moisDeLaVente = (): number => {
    const plan = planOf(subForm.planId);
    if (!plan) return 1;
    if (plan.mode === 'pack') {
      return Math.max(1, Math.round((validiteConvenue() ?? plan.validityDays ?? 365) / 30));
    }
    return prixDeLaFormule(plan, subForm.cycle, teteDeLaVente(), calibresAbo).moisCouverts;
  };

  /* Toucher une quantité FIGE la liste sur cette vente : elle cesse de suivre
     la formule, et le bouton « Revenir à la formule » paraît. */
  const poseInclus = (maj: (l: PlanIncluded[]) => PlanIncluded[]) =>
    setSubForm((f) => ({ ...f, inclus: maj(f.inclus ?? planOf(f.planId)?.included ?? []).map((i) => ({ ...i })) }));
  const qteVente = (serviceId: string, qty: number | null) =>
    poseInclus((l) => l.map((i) => (i.serviceId === serviceId ? { ...i, qty } : i)));
  const ajouteVente = (serviceId: string) => {
    if (!serviceId) return;
    poseInclus((l) => (l.some((i) => i.serviceId === serviceId) ? l : [...l, { serviceId, qty: 1 }]));
  };
  const retireVente = (serviceId: string) => poseInclus((l) => l.filter((i) => i.serviceId !== serviceId));

  const saveSub = () => {
    const plan = planOf(subForm.planId);
    const client = clients.find((c) => c.id === subForm.clientId);
    /* Un refus se dit — même leçon que `savePlan` le 28 août. */
    if (!client) { toast('Choisissez la tête couronnée à inscrire.'); return; }
    if (!plan) { toast('Choisissez une formule.'); return; }
    /* ══ UNE SEULE FORMULE À LA FOIS — 1er septembre 2026 ═══════════════
       Le serveur tient cette règle depuis la 0077 ; le comptoir, lui, ne la
       tenait pas, et l'on pouvait inscrire deux fois la même tête sans un mot.
       C'est arrivé : la fiche d'un rendez-vous lisait l'ancienne formule,
       annonçait qu'elle ne couvrait rien, et le rituel se facturait plein
       alors que la nouvelle le portait.

       ON REFUSE ET ON NOMME CE QUI BLOQUE. Un refus muet se reclique ; celui-ci
       dit quelle formule occupe déjà la place, et ce qu'il faut en faire. */
    const dejaLa = abonnementsVivantsDe(subs, client.id);
    if (dejaLa.length > 0) {
      const occupe = planOf(dejaLa[0].planId)?.name ?? 'une formule';
      toast(`${client.name} a déjà « ${occupe} » en cours. Résiliez-la d’abord, ou modifiez-la : deux abonnements ouverts font deux compteurs sur les mêmes rendez-vous.`);
      return;
    }
    const cycle = subForm.cycle;
    const opt = chiffreLOption(plan, cycle);
    /* CE QUI A ÉTÉ CONVENU AU COMPTOIR fait foi partout à partir d'ici : le
       total à découper, le revenu récurrent, la fenêtre du paquet et les
       quotas que Ma Couronne affichera. Retomber sur le catalogue à un seul
       de ces endroits ferait dire un chiffre à l'écran et un autre à la
       caisse, sans que personne sache lequel croire. */
    const convenu = prixConvenuSaisi();
    const joursVendus = validiteConvenue();
    const prixVente = prixDeLaVente();
    /* ══ CE QUI A FAIT CE PRIX, ÉCRIT SUR LA VENTE — 1er septembre 2026 ══
       Sans cela, la fiche de l'abonnée relirait `prixDeLaFormule` SANS TÊTE et
       réafficherait le prix de référence dès le lendemain : le comptoir aurait
       vendu 201 500 F et l'écran en annoncerait 168 000, sans que rien ne dise
       lequel croire. Le calibre suit la vente, comme il suit déjà la
       souscription en ligne (migration 0081). */
    const teteVendue = teteDeLaVente();
    const moisVente = moisDeLaVente();
    /* Le total À DÉCOUPER inclut l'option : elle se paie avec l'abonnement,
       pas à côté. La découper séparément ferait deux échéanciers à suivre. */
    const totalXof = prixVente + (opt?.supplement ?? 0);
    /* LA VIE DU PAQUET S'ÉCRIT À LA SIGNATURE. Sans `startIso` et
       `expiresIso`, `subWindow` ouvrait la fenêtre jusqu'en 9999 : la durée de
       vie d'un pack ne servait à rien, et une tête pouvait revenir trois ans
       plus tard réclamer son dernier resserrage. */
    const jours = joursVendus ?? plan.validityDays ?? null;
    const nm: Subscriber = {
      id: `ab-${uid()}`, branchId: branch.id, clientId: client.id, name: client.name, planId: plan.id,
      /* LE NUMÉRO DU CONTRAT, posé une fois. Il se lit dans la liste, dans le
         suivi et sur la pièce : c'est lui qui distingue la Juste Cadence de
         novembre de celle de septembre. La suite se cherche sur TOUS les
         abonnements, branches comprises, pour qu'une référence ne se répète
         jamais dans la Maison. */
      reference: prochaineReferenceAbo(subs),
      cycle,
      slot: subForm.slot.trim() || 'Créneau à réserver',
      nextIso: addDaysISO(cycleDays(cycle)),
      sinceIso: todayISO(), since: 'ce mois', status: 'new', payments: [],
      /* Le MRR porte l'option, ramenée au mois : un supplément annuel non
         normalisé gonflerait le revenu récurrent du mois de la signature,
         puis disparaîtrait des mois suivants. */
      mrrXof: (moisVente > 0 ? Math.round(prixVente / moisVente) : 0)
        + (opt ? partMensuelleXof(opt.supplement, opt.mois) : 0),
      /* — ce qui s'est convenu pour elle, et pour elle seule — */
      ...(convenu !== null ? { prixConvenuXof: convenu } : {}),
      /* LE CALIBRE ET LA LONGUEUR DE CETTE VENTE. Ils ne figent pas le prix,
         ils l'EXPLIQUENT : la fiche relira la grille avec la même tête et
         retombera au franc près sur ce que le comptoir a annoncé. */
      ...(teteVendue.bandId ? { calibreVendu: teteVendue.bandId } : {}),
      ...(teteVendue.longueur ? { longueurVendue: teteVendue.longueur } : {}),
      ...(subForm.motif.trim() ? { motifConvenu: subForm.motif.trim() } : {}),
      ...(subForm.inclus ? { inclusPropres: subForm.inclus.map((i) => ({ ...i })) } : {}),
      ...(joursVendus !== null ? { validiteJours: joursVendus } : {}),
      ...(plan.mode === 'pack'
        ? { startIso: todayISO(), expiresIso: jours === null ? null : addDaysISO(jours), priceXof: prixVente }
        : {}),
      ...(opt && opt.supplement > 0
        ? { couleur: { voie: subForm.voie as VoieCouleur, rythme: subForm.rythme, serviceId: opt.serviceId, supplementXof: opt.supplement } }
        : {}),
      /* L'ÉCHÉANCIER S'ÉCRIT ICI, une seule fois. Au-delà de 100 000 F, la tête
         a pu choisir de payer en 2 ou 4 fois : la découpe est figée à la
         signature, comme une parole donnée. Elle ne se recalcule jamais. */
      ...(subForm.parts && peutEtreEchelonne(totalXof)
        ? { echeances: echeancierDeLaVente(totalXof) }
        : {}),
    };
    setSubs((prev) => [...prev, nm]);
    setSubModal(false);
    setSubForm({ clientId: '', planId: plans[0]?.id ?? '', slot: '', cycle: 'mensuel', parts: null, premiere: '', dates: {}, voie: '', rythme: 'reguliere', couleurServiceId: '', prixConvenu: '', motif: '', inclus: null, validiteMois: '' });
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
    /* SON PRIX, PAS CELUI DU CATALOGUE. Réclamer 215 000 F à qui on en a
       convenu 190 000 est la faute qu'aucune cliente ne pardonne, et elle se
       ferait au comptoir, la caisse ouverte. */
    const due = suivante ? suivante.resteXof : prixVenduXof(m, plan, m.cycle ?? 'mensuel');
    setPayForm({ amount: String(due), date: todayISO(), method: methods[0] ?? '' });
    setCaisse(caisseParDefaut(branchBoxes, branch.id, currency)?.name ?? '');
    setPayFor(m);
  };

  /* REPOSER LA DATE D'UNE ÉCHÉANCE. Le magasin garde l'échéancier corrigé, et
     `payFor` est relu depuis lui pour que la modale suive le geste. */
  const reposerLaDate = (m: Subscriber, numero: number, iso: string) => {
    if (!m.echeances || !iso) return;
    const suite = deplaceEcheance(m.echeances, numero, iso);
    setSubs((prev) => prev.map((x) => (x.id === m.id ? { ...x, echeances: suite } : x)));
    setPayFor({ ...m, echeances: suite });
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
    if (amount <= 0) { toast('Saisissez le montant encaissé.'); return; }
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

    /* ── L'ARGENT ENTRE VRAIMENT DANS LA MAISON — 29 août 2026 ──────
       « Un règlement encaissé au comptoir ne devrait pas être QUE sur la fiche
       de l'abonnement. Il doit créer un mouvement de caisse et une facture »
       (Yéman). Le trou était réel : ce versement ne créait NI pièce NI entrée
       de caisse. Or le journal de caisse se DÉRIVE des règlements de factures
       (`InvoicePayment.cashbox`) : cet argent n'entrait donc dans aucun tiroir,
       ne paraissait dans aucun chiffre d'affaires, et disparaissait tout entier
       si l'abonnement était supprimé.

       LA PIÈCE NAÎT AU PREMIER RÈGLEMENT ET SE GARDE. Les versements suivants
       s'y ajoutent, comme une facture réglée en deux fois — c'est exactement ce
       qu'est un abonnement échelonné. */
    const boite = caisse || caisseParDefaut(branchBoxes, branch.id, currency)?.name || '';
    const versement: InvoicePayment = {
      id: pmt.id,
      date: pmt.date,
      amountXof: amount,
      method: pmt.method ?? (methods[0] ?? 'Espèces'),
      ...(boite ? { cashbox: boite } : {}),
      note: 'Abonnement',
    };
    const plan = planOf(payFor.planId);
    const nomFormule = plan?.name ?? 'Abonnement';
    const pieceExistante = payFor.invoiceId
      ? invoicesStore.get().find((i) => i.id === payFor.invoiceId)
      : undefined;

    let pieceId = payFor.invoiceId;
    if (pieceExistante) {
      invoicesStore.set((prev) => prev.map((i) => (i.id === pieceExistante.id
        ? { ...i, payments: [...(i.payments ?? []), versement] }
        : i)));
    } else {
      /* LA PIÈCE PORTE LE TOTAL DE LA FORMULE, pas le versement du jour : une
         facture qui ne vaudrait que l'acompte laisserait le reste hors des
         comptes, et la créance disparaîtrait. */
      const total = prixVenduXof(payFor, plan, cycle) + (payFor.couleur?.supplementXof ?? 0);
      const piece = nouvelleFacture({
        branchId: branch.id,
        serie: 'MND',
        status: 'envoyée',
        date: payFor.sinceIso || pmt.date,
        clientId: payFor.clientId,
        clientName: payFor.name,
        /* LA PIÈCE PORTE CE QU'ELLE VEND. Une ligne « La Juste Cadence ·
           168 000 F » ne dit pas ce que la cliente a acheté ; c'est pourtant ce
           papier qu'elle ressortira dans six mois pour réclamer son cinquième
           resserrage. Le contenu est ÉCRIT SUR LA PIÈCE, et non relu depuis la
           formule : changer une formule ne doit pas réécrire ce que les
           anciennes factures sont censées avoir vendu. */
        lines: [{ ...ligneFacture(nomFormule, total), detail: libellesInclus(payFor, plan, serviceName) }],
        theme: 'Aube',
        /* LA PIÈCE DIT QUEL CONTRAT ELLE RÈGLE. Deux Juste Cadence dans
           l'année font deux factures que rien ne distinguait. */
        note: `Abonnement · ${nomFormule}${payFor.reference ? ` · ${payFor.reference}` : ''}${payFor.echeances?.length ? ` · réglable en ${payFor.echeances.length} fois` : ''}`,
      });
      const avecVersement: Invoice = { ...piece, payments: [versement] };
      pieceId = avecVersement.id;
      invoicesStore.set((prev) => [avecVersement, ...prev]);
    }

    setSubs((prev) => prev.map((s) => (s.id === payFor.id
      ? {
        ...s,
        payments: [...(s.payments ?? []), pmt],
        status: s.status === 'churn' ? s.status : 'active',
        nextIso: next,
        ...(pieceId ? { invoiceId: pieceId } : {}),
      }
      : s)));
    setPayFor(null);
    toast(boite
      ? `${fmtMoney(amount, currency)} encaissés dans « ${boite} », la pièce est écrite.`
      : `${fmtMoney(amount, currency)} encaissés, la pièce est écrite.`);
  };

  /* ── SES DATES À ELLE, RECORRIGÉES ────────────────────────────────
     Un PAQUET porte ses bornes (`startIso`/`expiresIso`) ; un abonnement à
     CYCLE n'a qu'une échéance, et c'est elle qu'on déplace. Écrire les deux au
     même endroit ferait un paquet sans fin ou un cycle à deux dates. */
  const enregistreLesDates = () => {
    if (!suiviFor || !datesEdit) return;
    const plan = planOf(suiviFor.planId);
    const paquet = plan?.mode === 'pack';
    const { debut, fin } = datesEdit;
    if (paquet && fin && debut && fin <= debut) {
      toast('La fin doit tomber après le début, sinon le paquet ne vaut rien.');
      return;
    }
    if (!paquet && !fin) { toast('Un abonnement à cycle a besoin de sa prochaine échéance.'); return; }
    const suite: Subscriber = paquet
      ? { ...suiviFor, startIso: debut || suiviFor.startIso, expiresIso: fin || null }
      : { ...suiviFor, nextIso: fin };
    setSubs((prev) => prev.map((x) => (x.id === suite.id ? suite : x)));
    setSuiviFor(suite);
    setDatesEdit(null);
    /* ON DIT CE QUE LA CORRECTION A CHANGÉ AU DÉCOMPTE. Rétrécir la fenêtre
       fait sortir des séances déjà comptées ; le taire laisserait croire à un
       compteur cassé. */
    const avant = rdvCouvertsDe(suiviFor, plan, allAppts).length;
    const apres = rdvCouvertsDe(suite, plan, allAppts).length;
    toast(avant === apres
      ? 'Dates corrigées.'
      : `Dates corrigées, ${Math.abs(avant - apres)} séance${Math.abs(avant - apres) > 1 ? 's' : ''} ${apres < avant ? 'sortent' : 'entrent'} du décompte.`);
  };

  /* ── LA SUITE PROPOSÉE ────────────────────────────────────────────
     Le rythme se LIT sur ses venues passées avant de se proposer : celles qui
     viennent tous les deux mois ne se relancent pas comme celles qui viennent
     toutes les quatre semaines. Son heure et son jour aussi. */
  const ouvrirLaCadence = (m: Subscriber) => {
    const plan = planOf(m.planId);
    const restes = usageDetaille(m, plan, allAppts).map((u) => ({ serviceId: u.serviceId, reste: u.remaining }));
    const siennes = allAppts
      .filter((a) => a.clientId === m.clientId && a.status !== 'annulé')
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const ecarts: number[] = [];
    for (let i = 1; i < Math.min(siennes.length, 6); i += 1) {
      const d = Math.round((new Date(`${siennes[i - 1].date}T12:00:00`).getTime()
        - new Date(`${siennes[i].date}T12:00:00`).getTime()) / 86400000);
      if (d > 0) ecarts.push(d);
    }
    /* LE RYTHME PROPOSÉ EST LE PLUS PROCHE DES SIENS parmi ceux de la Maison :
       une moyenne exacte de 41 jours ne se propose pas, six semaines si. */
    const median = ecarts.length
      ? [...ecarts].sort((a, b) => a - b)[Math.floor(ecarts.length / 2)]
      : 42;
    const pas = RYTHMES_ABO
      .map((sem) => sem * 7)
      .reduce((meilleur, j) => (Math.abs(j - median) < Math.abs(meilleur - median) ? j : meilleur), 42);
    const derniere = siennes[0]?.date;
    const depart0 = derniere ? addDaysFromISO(derniere, pas) : addDaysISO(pas);
    const depart = depart0 < todayISO() ? addDaysISO(7) : depart0;
    const cli = clients.find((c) => c.id === m.clientId);
    const form = {
      pas,
      depart,
      heure: siennes[0]?.time || '10:00',
      maitre: maitreParDefaut(branch) || branch.masters[0] || '',
      suite: [] as SeanceProposee[],
    };
    form.suite = proposeLaCadence({
      restes, departIso: depart, pasJours: pas, jourPrefere: cli?.jourPrefere,
      finIso: plan?.mode === 'pack' ? m.expiresIso ?? null : null,
    });
    setCadenceForm(form);
  };

  const recalculeLaCadence = (patch: Partial<{ pas: number; depart: string }>) => {
    if (!suiviFor || !cadenceForm) return;
    const plan = planOf(suiviFor.planId);
    const restes = usageDetaille(suiviFor, plan, allAppts).map((u) => ({ serviceId: u.serviceId, reste: u.remaining }));
    const cli = clients.find((c) => c.id === suiviFor.clientId);
    const pas = patch.pas ?? cadenceForm.pas;
    const depart = patch.depart ?? cadenceForm.depart;
    setCadenceForm({
      ...cadenceForm, pas, depart,
      suite: proposeLaCadence({
        restes, departIso: depart, pasJours: pas, jourPrefere: cli?.jourPrefere,
        finIso: plan?.mode === 'pack' ? suiviFor.expiresIso ?? null : null,
      }),
    });
  };

  /* ── ON POSE, ET CE SONT DE VRAIS RENDEZ-VOUS ─────────────────────
     Confirmés, donc le fauteuil est TENU : une séance « en attente » ne
     réserve rien, et tout l'intérêt de poser sa cadence est qu'une autre tête
     ne prenne pas la place. Couverts et LIÉS au contrat (`subId`) : sans le
     lien, ils se décompteraient aussi sur un paquet voisin. */
  /* ── CHANGER LA FORMULE, ET SON CONTENU ───────────────────────────
     CE QUI A ÉTÉ PAYÉ NE SE RECHANGE PAS. Basculer un paquet de 168 000 F sur
     une formule à 140 000 F réécrirait le montant, et la pièce, l'échéancier
     et le suivi diraient alors trois chiffres différents. Le prix convenu est
     donc FIGÉ avant la bascule, à ce qu'il valait à l'instant d'avant.

     LE CONTENU DEVIENT LE SIEN (`inclusPropres`), jamais celui de la nouvelle
     formule : c'est ce contrat-là qu'on répare, pas la formule du catalogue,
     et retoucher la formule changerait le contenu de toutes les autres. */
  const enregistreLeContrat = () => {
    if (!contratEdit) return;
    const { sub, planId, inclus } = contratEdit;
    if (!planId) { toast('Choisissez une formule.'); return; }
    const ancien = planOf(sub.planId);
    const prixFige = sub.prixConvenuXof ?? prixVenduXof(sub, ancien, sub.cycle ?? 'mensuel');
    const suite: Subscriber = {
      ...sub, planId,
      inclusPropres: inclus.map((i) => ({ ...i })),
      ...(prixFige > 0 ? { prixConvenuXof: prixFige } : {}),
    };
    setSubs((prev) => prev.map((x) => (x.id === suite.id ? suite : x)));
    if (suiviFor?.id === suite.id) setSuiviFor(suite);
    setContratEdit(null);
    toast(`Contrat repris sur « ${planOf(planId)?.name ?? 'la formule'} », le prix convenu ne bouge pas.`);
  };

  const qteContrat = (serviceId: string, qty: number | null) => {
    if (!contratEdit) return;
    setContratEdit({ ...contratEdit, inclus: contratEdit.inclus.map((i) => (i.serviceId === serviceId ? { ...i, qty } : i)) });
  };

  /* Fermer le suivi referme ce qu'on y avait ouvert : rouvrir une autre
     abonnée sur un formulaire à moitié rempli poserait ses dates à elle. */
  const fermerLeSuivi = () => { setSuiviFor(null); setDatesEdit(null); setCadenceForm(null); };

  const poserLaCadence = () => {
    if (!suiviFor || !cadenceForm || cadenceForm.suite.length === 0) return;
    const neufs: Appointment[] = cadenceForm.suite.map((x) => ({
      id: `ap-${uid()}`,
      branchId: branch.id,
      clientId: suiviFor.clientId,
      clientName: suiviFor.name,
      serviceIds: x.serviceIds,
      date: x.dateIso,
      time: cadenceForm.heure,
      master: cadenceForm.maitre,
      status: 'confirmé',
      source: 'trone',
      note: `Cadence de l’abonnement${suiviFor.reference ? ` · ${suiviFor.reference}` : ''}`,
      coveredBySub: true,
      coverKind: 'abonnement',
      subId: suiviFor.id,
      priceXof: 0,
      depositServiceIds: [],
      depositXof: 0,
    } as Appointment));
    appointmentsStore.set((prev) => [...prev, ...neufs]);
    setCadenceForm(null);
    toast(`${neufs.length} rendez-vous posés, du ${dateComplete(neufs[0].date)} au ${dateComplete(neufs[neufs.length - 1].date)}.`);
  };

  /* LES COMPTES SE CALCULENT À CHAQUE RENDU, jamais à l'enregistrement : c'est
     toute la différence avec le champ `status`, écrit à la vente et presque
     jamais remis à jour. Un état qui se stocke vieillit mal. */
  const comptes = useMemo(
    () => comptesRanges(comptesAbonnement({ subs: branchSubs, plans, appts: allAppts, aujourdhui: todayISO() })),
    [branchSubs, plans, allAppts],
  );
  /* LE MOTEUR SE CALCULE SUR LES COMPTES, jamais sur un champ écrit à la vente :
     c'est ce qui l'empêche de vieillir. */
  const moteur = useMemo(() => moteurDesAbonnements({
    comptes, plans, aujourdhui: todayISO(),
    prixDuService: (id) => services.find((sv) => sv.id === id)?.priceXof,
  }), [comptes, plans, services]);
  const comptesFiltres = useMemo(() => comptes.filter((c) => {
    if (filtreCompte === 'en-cours') return c.vif?.etat === 'en-cours';
    if (filtreCompte === 'a-relancer') return c.vif?.etat === 'epuise';
    if (filtreCompte === 'retard') return c.retardXof > 0;
    /* « PARTIES » : celles qui n'ont plus rien qui vive. Un paquet arrivé au
       bout sans reprise est un départ aussi, simplement plus poli qu'une
       résiliation. */
    if (filtreCompte === 'parties') return !c.vif;
    return true;
  }), [comptes, filtreCompte]);

  /* LUI REPROPOSER : la modale de vente s'ouvre sur SA fiche. Une tête dont le
     paquet est épuisé est là, elle vient, et elle repassera au plein tarif à sa
     prochaine venue : c'est le seul moment où la formule se revend toute seule. */
  const reproposer = (clientId: string) => {
    setSubForm({
      clientId, planId: plans[0]?.id ?? '', slot: '', cycle: 'mensuel', parts: null, premiere: '',
      dates: {}, voie: '', rythme: 'reguliere', couleurServiceId: '', prixConvenu: '', motif: '',
      inclus: null, validiteMois: '',
    });
    setSubModal(true);
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
            {/* LE CHIFFRE DE TÊTE DOIT ÊTRE VRAI. « Revenu récurrent » annonçait
                une moyenne que personne n'avait versée ; celui-ci est ce qui est
                entré en caisse ce mois, versement par versement. */}
            <div className="mnd-eyebrow" style={{ fontSize: 9.5 }}>Encaissé ce mois · abonnements</div>
            <div className="tre-mrr" style={{ marginTop: 4 }}>{fmtMoney(moteur.encaisseCeMoisXof, currency)}</div>
          </div>
        }
      />

      <Tabs<Tab>
        tabs={[{ k: 'moteur', l: 'Le moteur' }, { k: 'formules', l: 'Les formules' }, { k: 'membres', l: 'Les abonnés' }, { k: 'comptes', l: 'Les comptes' }]}
        value={tab}
        onChange={setTab}
      />

      {/* ══ LE MOTEUR, EN ARGENT RÉEL — 2 septembre 2026 ═══════════════════
          « Je ne comprends pas le montant récurrent de 18 817. Ça ne me
          renseigne pas grand-chose sur les abonnements » (Yéman, deux fois).

          MRR, RÉTENTION, VALEUR À VIE : trois mesures faites pour lever des
          fonds, aucune pour ouvrir le salon lundi matin. Et le MRR était faux
          par-dessus le marché : figé à la vente, il ne comptait que deux
          abonnées sur neuf, et l'écran annonçait ce total comme « encaissé ».

          TOUT CE QUI SUIT SE VÉRIFIE À LA CAISSE : des versements datés, des
          échéances nommées, des séances qui existent. */}
      {tab === 'moteur' && (
        <div>
          <DeepNote eyebrow={moteur.encaisseCeMoisXof > 0 ? 'Ce que la Maison a reçu' : 'Le moteur attend sa première lune'}>
            {moteur.encaisseCeMoisXof > 0 || moteur.carnetXof > 0
              ? <>
                {fmtMoney(moteur.encaisseCeMoisXof, currency)} encaissés ce mois sur les abonnements, et{' '}
                {fmtMoney(moteur.carnetXof, currency)} déjà vendus qui restent à percevoir.{' '}
                <span className="accent">Le salon classique vend une fois ; la Maison perçoit chaque lune.</span>
              </>
              : <>Aucun abonnement encore, <span className="accent">le salon classique vend une fois ; la Maison percevra chaque lune.</span></>}
          </DeepNote>

          <div className="tr-grid tr-grid--4">
            <Card filet="copper" style={{ padding: 18 }}>
              <div className="mnd-stat__label">Encaissé ce mois</div>
              <div className="mnd-stat__value" style={{ fontSize: 30 }}>{fmtMoney(moteur.encaisseCeMoisXof, currency)}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>
                {(() => {
                  const d = moteur.encaisseCeMoisXof - moteur.encaisseMoisPrecedentXof;
                  if (moteur.encaisseMoisPrecedentXof === 0) return 'sur les abonnements';
                  return `${d >= 0 ? '+' : '−'} ${fmtMoney(Math.abs(d), currency)} sur le mois d’avant`;
                })()}
              </div>
            </Card>
            <Card filet={moteur.retardXof > 0 ? 'copper' : 'indigo'} style={{ padding: 18 }}>
              <div className="mnd-stat__label">En retard</div>
              <div className="mnd-stat__value" style={{ fontSize: 30, color: moteur.retardXof > 0 ? '#8f3b30' : undefined }}>
                {moteur.retardXof > 0 ? fmtMoney(moteur.retardXof, currency) : '—'}
              </div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>
                {moteur.retardXof > 0
                  ? `${moteur.retardTetes} tête${moteur.retardTetes > 1 ? 's' : ''} · la plus ancienne à ${moteur.dues[0]?.retardJours ?? 0} jours`
                  : 'personne ne doit rien en retard'}
              </div>
            </Card>
            <Card filet="indigo" style={{ padding: 18 }}>
              <div className="mnd-stat__label">À encaisser d’ici la fin du mois</div>
              <div className="mnd-stat__value" style={{ fontSize: 30 }}>
                {moteur.aEncaisserXof > 0 ? fmtMoney(moteur.aEncaisserXof, currency) : '—'}
              </div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>
                {moteur.aEncaisserNb > 0
                  ? `${moteur.aEncaisserNb} échéance${moteur.aEncaisserNb > 1 ? 's' : ''}${moteur.prochaineIso ? ` · la prochaine le ${dateComplete(moteur.prochaineIso)}` : ''}`
                  : 'rien ne tombe d’ici le 30'}
              </div>
            </Card>
            <Card filet="copper" style={{ padding: 18 }}>
              {/* LE CARNET REMPLACE LE MRR : ce que les abonnements en cours
                  doivent encore rapporter, tout compris. C'est de la trésorerie
                  déjà vendue, et il ne dépend d'aucun champ écrit à la vente. */}
              <div className="mnd-stat__label">Le carnet</div>
              <div className="mnd-stat__value" style={{ fontSize: 30 }}>{fmtMoney(moteur.carnetXof, currency)}</div>
              <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>reste dû sur les abonnements en cours</div>
            </Card>
          </div>

          <div className="tr-grid tr-grid--2" style={{ marginTop: 16, alignItems: 'start' }}>
            <Card style={{ padding: '20px 22px' }}>
              <Eyebrow>Qui paie, et quand</Eyebrow>
              <div style={{ marginTop: 12 }}>
                {moteur.dues.length === 0 && (
                  <div className="mnd-muted" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, padding: '10px 0' }}>
                    Aucune échéance ne réclame quoi que ce soit, ni maintenant ni d’ici la fin du mois.
                  </div>
                )}
                {moteur.dues.slice(0, 6).map((d) => (
                  <button
                    type="button" key={`${d.sub.id}-${d.numero}`} onClick={() => openPay(d.sub)}
                    className={`tre-du ${d.retardJours > 0 ? 'is-retard' : ''}`}
                  >
                    <span className="tre-du__q">
                      {d.nom}
                      <i>{d.formule} · échéance {d.numero} sur {d.total}</i>
                    </span>
                    <span className="tre-du__v">
                      {fmtMoney(d.montantXof, currency)}
                      <em>{d.retardJours > 0 ? `${d.retardJours} jours de retard` : `le ${dateComplete(d.dueIso)}`}</em>
                    </span>
                  </button>
                ))}
                {moteur.dues.length > 6 && (
                  <div className="mnd-muted" style={{ fontSize: 11, marginTop: 8 }}>
                    et {moteur.dues.length - 6} autre{moteur.dues.length - 6 > 1 ? 's' : ''}, dans « Les comptes ».
                  </div>
                )}
              </div>
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Card style={{ padding: '20px 22px' }}>
                {/* LA VRAIE DETTE D'UN SALON QUI VEND DES ABONNEMENTS : des
                    heures de fauteuil déjà payées. Elle ne figurait nulle part,
                    et c'est elle qui décide si la Maison peut vendre une
                    formule de plus ce mois-ci. */}
                <Eyebrow>Ce que la Maison doit encore</Eyebrow>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="tre-du" style={{ cursor: 'default' }}>
                    <span className="tre-du__q">Séances dues<i>crédits non consommés, toutes formules</i></span>
                    <span className="tre-du__v">{moteur.seancesDues}
                      <em>{moteur.seancesTenues > 0 ? `dont ${moteur.seancesTenues} à l’agenda` : 'aucune posée'}</em>
                    </span>
                  </div>
                  <div className="tre-du" style={{ cursor: 'default' }}>
                    <span className="tre-du__q">Ce qu’elles valent<i>au prix du catalogue</i></span>
                    <span className="tre-du__v">{fmtMoney(moteur.valeurDueXof, currency)}<em>de fauteuil déjà vendu</em></span>
                  </div>
                  <div className="tre-du" style={{ cursor: 'default' }}>
                    <span className="tre-du__q">Formules épuisées<i>tout consommé, rien de repris</i></span>
                    <span className="tre-du__v">{moteur.epuisees}<em>{moteur.epuisees > 0 ? 'à rappeler' : 'aucune'}</em></span>
                  </div>
                </div>
              </Card>

              <div className="tre-inline-note" style={{ alignItems: 'flex-start' }}>
                <span className="mark">✦</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.5 }}>
                  Un revenu qui revient seul vaut plus qu’un revenu qu’il faut reconquérir. Chaque abonné est une trésorerie prévisible, et un fauteuil déjà rempli.
                </span>
              </div>
            </div>
          </div>

          <div className="tr-grid tr-grid--2" style={{ marginTop: 16, alignItems: 'start' }}>
            <Card style={{ padding: '20px 22px' }}>
              <Eyebrow>Ce que chaque formule a rapporté</Eyebrow>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {moteur.parFormule.length === 0 && (
                  <div className="mnd-muted" style={{ fontSize: 12.5 }}>Aucune formule vendue pour l’instant.</div>
                )}
                {moteur.parFormule.map((f) => {
                  const total = f.encaisseXof + f.resteXof;
                  const part = total > 0 ? Math.round((f.encaisseXof / total) * 100) : 0;
                  return (
                    <div key={f.planId}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, flexWrap: 'wrap' }}>
                        <span>{f.nom} <span className="mnd-muted">· {f.tetes} tête{f.tetes > 1 ? 's' : ''}</span></span>
                        <span className="mnd-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtMoney(f.encaisseXof, currency)}
                          {f.resteXof > 0 ? ` · reste ${fmtMoney(f.resteXof, currency)}` : ' · soldé'}
                        </span>
                      </div>
                      <span className="tre-jauge" style={{ marginTop: 6 }}>
                        <i className="fait" style={{ width: `${part}%` }} />
                        <i className="tenu" style={{ width: `${100 - part}%` }} />
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 11 }}>
                Plein : encaissé. Hachuré : encore dû.
              </div>
            </Card>

            <Card style={{ padding: '20px 22px' }}>
              {/* LES ÉTATS SE COMPTENT TOUS, et la somme retombe sur le nombre
                  de contrats. L'ancien panneau montrait « Actives 4 » sous une
                  carte annonçant 9 abonnés, sans dire où étaient les cinq
                  autres. */}
              <Eyebrow>L’état des contrats, tous compris</Eyebrow>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
                {([
                  ['En cours, crédits disponibles', moteur.enCours, 'var(--color-indigo)'],
                  ['Épuisées, à leur reproposer', moteur.epuisees, 'var(--color-copper)'],
                  ['Nouvelles ce mois', moteur.nouvellesCeMois, 'var(--color-copper)'],
                  ['En retard de paiement', moteur.enRetardNb, '#8f3b30'],
                  ['Parties, rien qui vive', moteur.parties, '#8a8378'],
                ] as const).map(([label, n, fill]) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span>{label}</span>
                      <span className="mnd-muted">{n}</span>
                    </div>
                    <div style={{ marginTop: 5 }}>
                      <Bar pct={(n / Math.max(1, branchSubs.length)) * 100} fill={fill} />
                    </div>
                  </div>
                ))}
              </div>
              {/* LA RÉTENTION DEVIENT « REPRISES ». « 100 %, aucune
                  résiliation » était vrai et sans intérêt : personne n'avait
                  encore eu l'occasion de partir, et les paquets arrivés au bout
                  sans reprise ne comptaient nulle part. */}
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.55, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
                {moteur.reprises + moteur.finsSansReprise === 0
                  ? 'Aucune formule n’est encore arrivée à son terme : les reprises se mesureront à partir de la première.'
                  : <><b style={{ color: 'var(--ink)' }}>{moteur.reprises} reprise{moteur.reprises > 1 ? 's' : ''}</b> sur {moteur.reprises + moteur.finsSansReprise} formule{moteur.reprises + moteur.finsSansReprise > 1 ? 's' : ''} arrivée{moteur.reprises + moteur.finsSansReprise > 1 ? 's' : ''} à leur terme. Une fin sans reprise est un départ, simplement plus poli qu’une résiliation.</>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ══ LES COMPTES — une tête, une ligne de vie ═══════════════════════
          « Créer des comptes abonnements pour chaque client distinctif. Quand il
          entame un nouveau. Facile à suivre » (Yéman, 2 septembre 2026).

          L'onglet voisin liste des CONTRATS : une cliente y paraît deux fois à
          cinq lignes d'écart, et rien ne dit que c'est la même personne ni que
          l'un a succédé à l'autre. */}
      {tab === 'comptes' && (
        <div>
          <div className="tre-filtres">
            {([['tous', 'Toutes'], ['en-cours', 'En cours'], ['a-relancer', 'À relancer'],
               ['retard', 'En retard de paiement'], ['parties', 'Parties']] as const).map(([k, l]) => (
              <button
                key={k} type="button"
                className={`tre-filtre ${filtreCompte === k ? 'is-on' : ''}`}
                onClick={() => setFiltreCompte(k)}
              >{l}</button>
            ))}
          </div>

          {comptesFiltres.length === 0 && (
            <Card style={{ padding: '22px 24px' }}>
              <div className="mnd-muted" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15 }}>
                {comptes.length === 0
                  ? 'Aucune tête abonnée pour l’instant. Le premier compte naîtra de la première vente.'
                  : 'Aucune tête dans cette vue. Les autres sont sous « Toutes ».'}
              </div>
            </Card>
          )}

          {comptesFiltres.map((c) => {
            const fiche = clients.find((x) => x.id === c.clientId);
            const bande = calibreDeLaTete(fiche?.lockCount ?? fiche?.lockCountDeclare, bands, fiche?.margeCalibre);
            const ouverte = histoireOuverte.includes(c.clientId || c.nom);
            const passes = c.contrats.filter((x) => x !== c.vif);
            /* LE CONTRAT QUI VIT EN TÊTE, l'histoire dessous et REPLIÉE : une tête
               à un seul contrat tient sur trois lignes, et celles qui en ont eu
               cinq ne noient pas l'écran. */
            const montres = c.vif ? [c.vif, ...(ouverte ? passes : [])] : c.contrats.slice(0, ouverte ? undefined : 1);
            return (
              <div className="tre-compte" key={c.clientId || c.nom}>
                <div className="tre-compte__tete">
                  <div className="tre-compte__qui">
                    <b>{c.nom}</b>
                    <span>
                      {bande ? `${bandLabel(bande, bands)} · ` : ''}
                      {fiche?.lockCount ? `${fiche.lockCount} locks · ` : ''}
                      abonnée depuis le {dateComplete(c.depuisIso)}
                    </span>
                  </div>
                  <div className="tre-compte__kpis">
                    <div><div className="tre-kpi__l">Contrats</div><div className="tre-kpi__v">{c.contrats.length}</div></div>
                    <div><div className="tre-kpi__l">Versé en tout</div><div className="tre-kpi__v">{fmtMoney(c.verseXof, currency)}</div></div>
                    <div>
                      <div className="tre-kpi__l">Reste dû</div>
                      <div className={`tre-kpi__v ${c.retardXof > 0 ? 'is-brique' : ''}`}>{fmtMoney(c.resteXof, currency)}</div>
                    </div>
                    <div><div className="tre-kpi__l">Séances reçues</div><div className="tre-kpi__v">{c.honorees}</div></div>
                  </div>
                  {c.clientId && (
                    <button type="button" className="tre-link-btn" onClick={() => navigate(`/customers?id=${c.clientId}`)}>
                      Sa fiche
                    </button>
                  )}
                </div>

                <div className="tre-compte__corps">
                  {montres.map((x) => {
                    const vif = x === c.vif;
                    const pct = x.promis > 0 ? Math.min(100, Math.round((x.utilises / x.promis) * 100)) : 0;
                    const fait = x.promis > 0 ? Math.min(100, Math.round((x.honorees / x.promis) * 100)) : 0;
                    return (
                      <div key={x.sub.id}>
                        {/* LE SILENCE ENTRE DEUX CONTRATS EST UNE DONNÉE : deux
                            mois où la tête est revenue au plein tarif, ou n'est
                            pas revenue du tout. Rien ne le mesurait. */}
                        {x.trouJours !== null && x.trouJours > 0 && (
                          <div className="tre-trou"><i /><span>{x.trouJours} jours sans abonnement</span></div>
                        )}
                        <div className={`tre-contrat ${vif ? 'is-vif' : 'is-mort'}`}>
                          <div className="tre-contrat__h">
                            <span className="tre-contrat__nom">{x.plan?.name ?? 'Formule retirée'}</span>
                            <span className="tre-contrat__ref">{x.sub.reference ?? `du ${dateComplete(debutDuContratLocal(x.sub))}`}</span>
                            <span className={`tre-etat is-${x.retardXof > 0 ? 'retard' : x.etat}`}>
                              {x.retardXof > 0 ? `${fmtMoney(x.retardXof, currency)} en retard` : ETAT_LABEL[x.etat]}
                            </span>
                            <span className="tre-contrat__quand">
                              {x.sub.expiresIso
                                ? `du ${dateComplete(debutDuContratLocal(x.sub))} au ${dateComplete(x.sub.expiresIso)}`
                                : `${cycleLabel(x.sub.cycle ?? 'mensuel').split(' · ')[0]} · prochaine échéance le ${dateComplete(x.sub.nextIso)}`}
                            </span>
                          </div>
                          <div className="tre-contrat__bas">
                            <span className="tre-jauge">
                              <i className="fait" style={{ width: `${fait}%` }} />
                              <i className="tenu" style={{ width: `${Math.max(0, pct - fait)}%` }} />
                            </span>
                            <span className="tre-contrat__n">
                              {x.promis > 0
                                ? <><b>{x.honorees}</b> honorée{x.honorees > 1 ? 's' : ''}{x.utilises > x.honorees ? <> · <b>{x.utilises - x.honorees}</b> retenue{x.utilises - x.honorees > 1 ? 's' : ''}</> : null} sur {x.promis}</>
                                : 'aucune prestation incluse'}
                              {x.verseXof > 0 ? ` · versé ${fmtMoney(x.verseXof, currency)}` : ''}
                            </span>
                            <span className="tre-contrat__act">
                              {x.etat === 'epuise' && c.clientId && (
                                <button type="button" className="tre-mini is-cuivre" onClick={() => reproposer(c.clientId)}>Lui reproposer</button>
                              )}
                              <button type="button" className="tre-mini" onClick={() => setSuiviFor(x.sub)}>Suivi</button>
                              {x.resteXof > 0 && (
                                <button type="button" className="tre-mini" onClick={() => openPay(x.sub)}>Régler</button>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {passes.length > 0 && (
                    <button
                      type="button" className="tre-link-btn" style={{ marginTop: 4 }}
                      onClick={() => setHistoireOuverte((prev) => (ouverte
                        ? prev.filter((k) => k !== (c.clientId || c.nom))
                        : [...prev, c.clientId || c.nom]))}
                    >
                      {ouverte ? 'Replier son histoire' : `Voir son histoire · ${passes.length} contrat${passes.length > 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
              /* UN PAQUET NE SE MULTIPLIE PAS et n'a pas de cycle : le
                 sélecteur du haut ne lui fait rien. Voir `prixDeLaFormule`. */
              const aff = prixDeLaFormule(p, cycle);
              /* ══ « DE TEL MONTANT À TEL MONTANT » — 2 septembre 2026 ═════
                 « Est-ce que le prix des abonnements peut dire entre tel montant
                 à tel montant ? Le calcul récupère automatiquement les prix avec
                 les différentes tranches » (Yéman).

                 UN SEUL PRIX SUR UNE FORMULE QUI SUIT LE CALIBRE EST UN PRIX
                 FAUX POUR PRESQUE TOUT LE MONDE : la carte annonçait 140 000 F,
                 le comptoir en réclamait 201 500 à une tête Micro et 112 000 à
                 une Jumbo. La fourchette INTERROGE LE MOTEUR pour chaque calibre
                 du barème, plus le prix sans calibre : deux calculs du même prix
                 finiraient par diverger, et c'est la vitrine qui mentirait. */
              const etendue = libelleFourchette(p, cycle, calibresAbo, (x) => fmtMoney(x, currency));
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
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '10px 0 4px', flexWrap: 'wrap' }}>
                    <span className="tre-plan__price" style={etendue ? { fontSize: 25 } : undefined}>
                      {etendue ?? fmtMoney(aff.montantXof, currency)}
                    </span>
                    <span style={{ fontSize: 12, color: p.popular ? 'rgba(246,241,231,.7)' : 'var(--ink-soft)' }}>{aff.periode}</span>
                  </div>
                  <div style={{ fontSize: 11, minHeight: 16, color: p.popular ? 'var(--copper-300)' : 'var(--copper-700)' }}>
                    {/* LA FOURCHETTE DIT POURQUOI ELLE EN EST UNE, et rappelle le
                        prix de référence : c'est lui que paie une tête qu'on n'a
                        pas comptée, et il doit rester lisible quelque part. */}
                    {etendue
                      ? `${SELON_LE_CALIBRE} · référence ${fmtMoney(aff.montantXof, currency)}`
                      : p.mode === 'pack'
                        ? `paquet de crédits · soit ${fmtMoney(partMensuelleDeLaFormule(p, cycle), currency)}/mois`
                        : aff.offert ? `soit ${fmtMoney(partMensuelleDeLaFormule(p, cycle), currency)}/mois · ${aff.offert}` : ''}
                  </div>
                  <div className="tre-plan__divider" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {p.perks.map((perk) => (
                      <div key={perk} className="tre-plan__perk"><span className="mark">✦</span><span>{perk}</span></div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                    <Button size="sm" variant={p.popular ? 'copper' : 'ghost'} style={{ flex: 1 }} onClick={() => openPlanEdit(p)}>Modifier</Button>
                    {/* UN REFUS SE DIT, TOUJOURS (règle du 28 août). « Pourquoi
                        je n'arrive pas à retirer l'abonnement VÈKPÈ ? » — parce
                        que ce bouton se taisait de DEUX façons.

                        ① Une formule EN VEDETTE n'avait pas de bouton du tout :
                        `!p.popular` le faisait disparaître. La mise en vedette
                        est un choix d'affichage, pas un verrou — on ne voit
                        nulle part qu'il faut d'abord la retirer de la vedette.

                        ② Une formule portée par une abonnée avait un bouton
                        GRISÉ, sans un mot. Le blocage, lui, est juste : effacer
                        la formule laisserait ses abonnées sans prix ni contenu
                        à lire. Mais il doit se DIRE, et dire combien de têtes
                        et lesquelles — sinon on clique dix fois en croyant que
                        l'écran est cassé. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const dessus = members.filter((m) => m.planId === p.id);
                        if (dessus.length > 0) {
                          const noms = dessus.slice(0, 3).map((m) => m.name).join(', ');
                          const reste = dessus.length - Math.min(3, dessus.length);
                          toast(
                            `Impossible : ${dessus.length} abonnée${dessus.length > 1 ? 's' : ''} `
                            + `${dessus.length > 1 ? 'sont' : 'est'} sur cette formule (${noms}${reste > 0 ? `, +${reste}` : ''}). `
                            + 'Résiliez-les ou déplacez-les d’abord, sinon elles perdent leur prix et leur contenu.',
                          );
                          return;
                        }
                        setPlans((prev) => prev.filter((x) => x.id !== p.id));
                        toast(`« ${p.name} » retirée du catalogue.`);
                      }}
                    >
                      Retirer
                    </Button>
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
            <Button variant="copper" onClick={() => { setSubForm({ clientId: '', planId: plans[0]?.id ?? '', slot: '', cycle: 'mensuel', parts: null, premiere: '', dates: {}, voie: '', rythme: 'reguliere', couleurServiceId: '', prixConvenu: '', motif: '', inclus: null, validiteMois: '' }); setSubModal(true); }}>+ Nouvel abonné</Button>
          </div>

          {/* ── LES DEMANDES VENUES DE MA COURONNE — 28 août ────────────
              Le bouton de la cliente n'achète rien, il demande : c'est ici que
              la demande arrive, et c'est le geste de Yéman qui fait naître
              l'abonnement. Elles passent EN TÊTE parce qu'une demande qui
              attend est une vente qui attend. */}
          {demandesOuvertes.length > 0 && (
            <Card style={{ padding: '16px 20px', marginBottom: 14, borderColor: 'var(--copper-300)', background: 'var(--copper-50)' }}>
              <div className="tre-sec-label" style={{ marginBottom: 10 }}>
                {demandesOuvertes.length} demande{demandesOuvertes.length > 1 ? 's' : ''} venue{demandesOuvertes.length > 1 ? 's' : ''} de Ma Couronne
              </div>
              {demandesOuvertes.map((d) => (
                <div key={d.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                  flexWrap: 'wrap', padding: '9px 0', borderTop: '1px solid var(--hairline)',
                }}>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ fontWeight: 500 }}>{d.clientName}</b>
                    <span className="mnd-muted" style={{ fontSize: 12.5 }}> veut « {d.planName} »</span>
                    <div className="mnd-muted" style={{ fontSize: 11 }}>demandée le {shortDate(d.demandeeLe)}</div>
                  </span>
                  <span style={{ display: 'flex', gap: 8, flex: 'none' }}>
                    <Button size="sm" variant="copper" onClick={() => ouvrirDepuisDemande(d)}>Inscrire</Button>
                    <Button size="sm" variant="ghost" onClick={() => classerDemande(d.id)}>Classer</Button>
                  </span>
                </div>
              ))}
            </Card>
          )}

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
                              {/* DEUX FOIS LA MÊME FORMULE SE DISTINGUENT ICI.
                                  Sans référence, deux lignes identiques ne se
                                  nomment pas : ni au téléphone, ni pour dire
                                  laquelle une facture règle. Les contrats
                                  d'avant ce champ montrent leur date de
                                  départ, qui les séparait déjà. */}
                              {m.reference
                                ? <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '.04em' }}>{m.reference}</span>
                                : m.sinceIso ? <span>du {dateComplete(m.sinceIso)}</span> : null}
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
                          {(() => {
                            /* SES prestations à elle, pas celles de la formule. */
                            const n = inclusVendus(m, plan).length;
                            return n > 0 ? ` · ${n} prestation${n > 1 ? 's' : ''} incluse${n > 1 ? 's' : ''}` : '';
                          })()}
                        </div>
                        {/* CE QUI S'EST CONVENU SE VOIT DANS LE TABLEAU. Un
                            prix négocié qu'il faut ouvrir une fiche pour
                            découvrir se re-négocie une deuxième fois, et la
                            Maison ne se souvient plus de ce qu'elle a dit. */}
                        {(() => {
                          const e = ecartDuPrixConvenu(m, plan, m.cycle ?? 'mensuel');
                          if (!e) return null;
                          return (
                            <div style={{ fontSize: 10.5, marginTop: 3, color: 'var(--copper-700)', fontWeight: 500 }}>
                              Prix convenu · {fmtMoney(e.convenuXof, currency)}
                              <span className="mnd-muted" style={{ textDecoration: 'line-through', marginLeft: 5, fontWeight: 400 }}>
                                {fmtMoney(e.catalogueXof, currency)}
                              </span>
                              {m.motifConvenu ? (
                                <div className="mnd-muted" style={{ fontWeight: 400, marginTop: 2 }}>{m.motifConvenu}</div>
                              ) : null}
                            </div>
                          );
                        })()}
                        {(m.inclusPropres?.length ?? 0) > 0 && (
                          <div style={{ fontSize: 10.5, marginTop: 3, color: 'var(--copper-700)', fontWeight: 500 }}>
                            Contenu ajusté pour elle
                          </div>
                        )}
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
                        <span style={{ fontSize: 12.5, color: m.status === 'risk' ? '#8f3b30' : undefined }}>{dateComplete(m.nextIso)}</span>
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
                        {/* DÉCOUPER — n'apparaît que sur un abonnement qui n'a
                            pas encore d'échéancier et dont le montant passe le
                            seuil de la Maison. C'est ici, et nulle part
                            ailleurs, que les quatre fois se donnent. */}
                        {!m.echeances?.length && peutEtreEchelonne(aRegler(m)) && (
                          <button
                            className="tre-link-btn"
                            style={{ marginLeft: 10 }}
                            onClick={() => { setPartsDecoupe(2); setADecouper(m); }}
                          >
                            Découper
                          </button>
                        )}
                        <button
                          className="tre-link-btn tre-link-btn--danger"
                          style={{ marginLeft: 10 }}
                          onClick={() => setAResilier(m)}
                        >
                          Résilier
                        </button>
                        {/* SUPPRIMER SANS PASSER PAR LA RÉSILIATION. Elle
                            gardait l'abonnement chez « Les partis » ; ce
                            bouton-ci ne garde rien. */}
                        <button
                          className="tre-link-btn tre-link-btn--danger"
                          style={{ marginLeft: 10 }}
                          onClick={() => setASupprimer(m)}
                        >
                          Supprimer
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
                            <td data-label="Depuis" className="mnd-muted">{m.sinceIso ? dateComplete(m.sinceIso) : m.since}</td>
                            <td data-label="MRR" className="num" style={{ textAlign: 'right' }}>{fmtMoney(m.mrrXof, currency)}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button className="tre-link-btn" onClick={() => reprendre(m)}>Reprendre l’abonnement</button>
                                <button
                                  className="tre-link-btn tre-link-btn--danger"
                                  style={{ marginLeft: 10 }}
                                  onClick={() => setASupprimer(m)}
                                >
                                  Supprimer
                                </button>
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

      {aDecouper && (() => {
        const total = aRegler(aDecouper);
        const apercu = construitEcheancier(total, partsDecoupe, todayISO());
        const deja = subPaid(aDecouper);
        return (
          <Modal title="Découper le règlement" onClose={() => setADecouper(null)} width={440}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                <b style={{ color: 'var(--color-indigo)' }}>{aDecouper.name}</b>
                {' · '}{planOf(aDecouper.planId)?.name ?? 'formule retirée'}
                {' · '}<b style={{ color: 'var(--ink)' }}>{fmtMoney(total, currency)}</b> à encaisser.
              </div>

              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {DECOUPES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`tre-chip ${partsDecoupe === n ? 'is-on' : ''}`}
                    onClick={() => setPartsDecoupe(n)}
                  >
                    En {n} fois
                  </button>
                ))}
              </div>

              <div style={{ border: '1px solid var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
                {apercu.map((e) => (
                  <div key={e.numero} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5,
                    padding: '8px 12px', borderTop: e.numero === 1 ? 'none' : '1px solid var(--hairline)',
                  }}>
                    <span className="mnd-muted">
                      {e.numero === 1 ? 'Aujourd’hui' : `${e.numero}ᵉ · ${dateComplete(e.dueIso)}`}
                    </span>
                    <b style={{ fontWeight: 500 }}>{fmtMoney(e.amountXof, currency)}</b>
                  </div>
                ))}
              </div>

              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                {deja > 0
                  ? `Elle a déjà versé ${fmtMoney(deja, currency)} : cette somme s'impute d'elle-même sur les premières échéances.`
                  : 'La première échéance tombe le jour même : on n’accorde pas un crédit qui commence par un délai.'}
                {' '}Une fois écrite, la découpe ne se recalcule plus, seules ses DATES se déplacent.
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="ghost" onClick={() => setADecouper(null)}>Annuler</Button>
                <Button variant="copper" style={{ flex: 1 }} onClick={() => decoupe(aDecouper)}>
                  Découper en {partsDecoupe} fois
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* SUPPRIMER NE SE DÉFAIT PAS. Résilier se reprend, ceci non : on le dit
          avant, et on nomme la tête pour qu'on ne se trompe pas de ligne. */}
      {aSupprimer && (() => {
        const verse = subPaid(aSupprimer);
        return (
          <Modal title="Supprimer définitivement ?" onClose={() => setASupprimer(null)} width={440}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p className="mnd-muted" style={{ margin: 0, lineHeight: 1.7, fontSize: 13.5 }}>
                L’abonnement de <b style={{ color: 'var(--color-indigo)' }}>{aSupprimer.name}</b>
                {' '}({planOf(aSupprimer.planId)?.name ?? 'formule retirée'}) disparaîtra de la
                Maison, sans passer par « Les partis » et sans laisser de trace.
                <b style={{ color: 'var(--ink)' }}> Ce geste ne se défait pas.</b>
              </p>

              {/* CE QUI PART SE DIT EN FRANCS. Un règlement encaissé au comptoir
                  n'existe QUE sur cette fiche : ni mouvement de caisse, ni
                  facture. L'effacer efface la seule trace de cet argent. */}
              {verse > 0 && (
                <div style={{
                  border: '1px solid var(--color-brique, #96412E)', borderRadius: 3,
                  background: 'rgba(150,65,46,.07)', padding: '12px 14px',
                  fontSize: 13, lineHeight: 1.7, color: 'var(--ink)',
                }}>
                  Cet abonnement porte <b>{fmtMoney(verse, currency)} déjà encaissés</b>.
                  {aSupprimer.invoiceId
                    ? ' Sa facture et son entrée de caisse RESTENT : l’argent ne disparaît pas des comptes, il perd seulement l’abonnement qu’il réglait.'
                    : ' Ces règlements sont antérieurs à la facturation des abonnements : ils n’existent que sur cette fiche, et le supprimer efface leur seule trace.'}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="ghost" style={{ flex: 1 }} onClick={() => setASupprimer(null)}>
                  Le garder
                </Button>
                <Button variant="copper" onClick={() => supprimer(aSupprimer)}>
                  Supprimer définitivement
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

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
            {/* LE MODE SE CHOISIT — il ne se devinait nulle part, et une
                formule créée à l'écran était forcément un abonnement. Un
                paquet vendu comme abonnement se recharge tous les mois : la
                Maison offrirait ses crédits à vie sans s'en apercevoir. */}
            <Field label="Comment elle se vend">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`tre-chip ${planForm.mode === 'cycle' ? 'is-on' : ''}`}
                  onClick={() => setPlanForm({ ...planForm, mode: 'cycle' })}
                >
                  Abonnement · il se recharge
                </button>
                <button
                  type="button"
                  className={`tre-chip ${planForm.mode === 'pack' ? 'is-on' : ''}`}
                  onClick={() => setPlanForm({ ...planForm, mode: 'pack' })}
                >
                  Paquet de crédits · il s’épuise
                </button>
                {planForm.mode === 'pack' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
                    <Input
                      type="number" min={1} max={60}
                      value={planForm.moisValidite}
                      onChange={(e) => setPlanForm({ ...planForm, moisValidite: e.target.value })}
                      style={{ width: 72, textAlign: 'right' }}
                      aria-label="Durée de vie du paquet, en mois"
                    />
                    <span className="mnd-muted">mois de validité</span>
                  </label>
                )}
              </div>
            </Field>

            <Field label={`${planForm.mode === 'pack' ? 'Prix du paquet' : 'Prix mensuel'} · ${currency === 'XOF' ? 'F' : 'XOF'}`}>
              <Input inputMode="numeric" value={planForm.price} placeholder="45000" onChange={(e) => setPlanForm({ ...planForm, price: e.target.value.replace(/[^0-9]/g, '') })} />
            </Field>

            {/* ══ LE PRIX SUIT LA TÊTE — 1er septembre 2026 ═══════════════════
                « Les abonnements doivent se facturer au palier comme au
                catalogue. Et avoir aussi l'option de la longueur » (Yéman).

                SEPT CALIBRES PAR TROIS LONGUEURS FERAIENT VINGT ET UNE CASES
                par formule. Personne ne remplit vingt et une cases, et une
                grille à moitié remplie donne des prix qui sautent sans qu'on
                sache si un trou est un oubli ou une intention. D'où
                l'interrupteur : UN chiffre, le prix de référence, et les
                coefficients du Juste Prix font les sept autres. La colonne de
                droite ne sert qu'aux exceptions décidées. */}
            <div className="tre-plan-calibre">
              <button
                type="button"
                className={`tre-chip ${planForm.suitLeCalibre ? 'is-on' : ''}`}
                onClick={() => setPlanForm({ ...planForm, suitLeCalibre: !planForm.suitLeCalibre })}
              >
                Le prix suit le calibre
              </button>
              <span className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55, display: 'block', marginTop: 7 }}>
                {planForm.suitLeCalibre
                  ? `Le prix ci-dessus est celui du calibre de référence (coefficient 1). Les autres se calculent.`
                  : 'Sans cet interrupteur, la formule vaut son prix unique pour toutes les têtes, comme avant.'}
              </span>

              {(planForm.suitLeCalibre || Object.keys(planForm.parCalibre).length > 0) && calibres.length > 0 && (
                <div className="mnd-scroll-x" style={{ marginTop: 12 }}>
                  <table className="tre-table" style={{ minWidth: 460 }}>
                    <thead>
                      <tr>
                        <th>Calibre</th>
                        <th style={{ textAlign: 'right' }}>Coefficient</th>
                        <th style={{ textAlign: 'right' }}>Prix calculé</th>
                        <th style={{ textAlign: 'right' }}>Écrit à la main</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calibres.map((b) => {
                        const ref = parseInt(planForm.price, 10) || 0;
                        const calcule = planForm.suitLeCalibre && b.coef > 0 ? roundPrice(ref * b.coef) : ref;
                        return (
                          <tr key={b.id}>
                            <td>{bandLabel(b, calibres)}</td>
                            <td style={{ textAlign: 'right' }} className="mnd-muted">× {b.coef}</td>
                            <td style={{ textAlign: 'right', color: 'var(--color-indigo)' }}>{fmtMoney(calcule, currency)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <Input
                                inputMode="numeric"
                                style={{ maxWidth: 110, textAlign: 'right' }}
                                value={planForm.parCalibre[b.id] ?? ''}
                                placeholder="—"
                                onChange={(e) => setPlanForm({
                                  ...planForm,
                                  parCalibre: { ...planForm.parCalibre, [b.id]: e.target.value.replace(/[^0-9]/g, '') },
                                })}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* LA LONGUEUR S'AJOUTE, ELLE NE MULTIPLIE PAS : trois chiffres
                  au lieu des vingt et une cases d'une grille croisée, et le
                  supplément ne se multiplie jamais par le cycle. */}
              <div style={{ marginTop: 14 }}>
                <div className="mnd-field__label" style={{ marginBottom: 7 }}>
                  Supplément de longueur · facultatif
                </div>
                <div className="tr-cols" style={{ '--cols': '1fr 1fr 1fr', '--cols-sm': '1fr', gap: 10 } as CSSProperties}>
                  {LONGUEURS.map((l) => (
                    <Field key={l.id} label={l.label}>
                      <Input
                        inputMode="numeric"
                        value={planForm.suppLongueur[l.id] ?? ''}
                        placeholder="+ 0"
                        onChange={(e) => setPlanForm({
                          ...planForm,
                          suppLongueur: { ...planForm.suppLongueur, [l.id]: e.target.value.replace(/[^0-9]/g, '') },
                        })}
                      />
                    </Field>
                  ))}
                </div>
                <span className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55, display: 'block', marginTop: 7 }}>
                  Ajouté <b>après</b> le prix du calibre, et <b>une seule fois</b> même en annuel.
                  Une case vide n’ajoute rien.
                </span>
              </div>
            </div>
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
                {/* ── LE TOTAL À LA CARTE, EN DIRECT — 28 août ──────────
                    « J'ai besoin de voir le calcul se faire dès que je
                    choisis des services. Un total pour me situer » (Yéman).

                    Le prix d'une formule ne se décide pas dans le vide, il se
                    décide CONTRE la carte. Sans ce total sous les yeux, on
                    pose un chiffre au jugé et on découvre trois mois plus tard
                    qu'on a remisé de 40 % ou de 2 %. */}
                {planForm.included.length > 0 && (() => {
                  const v = valeurALaCarte(planForm.included, (id) => services.find((x) => x.id === id)?.priceXof);
                  const prix = parseInt(planForm.price, 10) || 0;
                  const r = remiseSurLaCarte(v.totalXof, prix);
                  const trop = prix > 0 && v.totalXof > 0 && r.gainXof < 0;
                  return (
                    <div style={{
                      marginTop: 10, padding: '11px 13px', borderRadius: 3, fontSize: 12.5, lineHeight: 1.7,
                      background: trop ? 'rgba(150,65,46,.07)' : 'var(--copper-50)',
                      border: `1px solid ${trop ? 'var(--color-brique, #96412E)' : 'var(--copper-300)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <span className="mnd-muted">À la carte</span>
                        <b style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 400 }}>
                          {fmtMoney(v.totalXof, currency)}
                        </b>
                      </div>
                      {prix > 0 && v.totalXof > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 3 }}>
                          <span className="mnd-muted">
                            {planForm.mode === 'pack' ? 'Prix du paquet' : 'Prix mensuel'}
                          </span>
                          <b style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 400 }}>
                            {fmtMoney(prix, currency)}
                          </b>
                        </div>
                      )}
                      {prix > 0 && v.totalXof > 0 && (
                        <div style={{
                          marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--hairline)',
                          color: trop ? 'var(--color-brique, #96412E)' : 'var(--color-vert, #2E6B4F)', fontWeight: 500,
                        }}>
                          {/* UNE FORMULE PLUS CHÈRE QUE LA CARTE NE SE VEND PAS.
                              L'écran le crie plutôt que de l'afficher comme une
                              remise négative, qui se lirait de travers. */}
                          {trop
                            ? `Plus chère que la carte de ${fmtMoney(-r.gainXof, currency)} : personne ne la prendra.`
                            : `Elle gagne ${fmtMoney(r.gainXof, currency)} · ${r.pct} % de remise`}
                        </div>
                      )}
                      {prix <= 0 && (
                        <div className="mnd-muted" style={{ marginTop: 4 }}>Posez le prix pour voir la remise.</div>
                      )}
                      {(v.illimitees > 0 || v.introuvables > 0) && (
                        <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
                          {v.illimitees > 0 && `${v.illimitees} prestation${v.illimitees > 1 ? 's' : ''} illimitée${v.illimitees > 1 ? 's' : ''}, hors du calcul : un quota sans borne ne se chiffre pas. `}
                          {v.introuvables > 0 && `${v.introuvables} prestation${v.introuvables > 1 ? 's' : ''} absente${v.introuvables > 1 ? 's' : ''} du catalogue.`}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 8 }}>
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
                La formule vedette s’affiche sur une carte indigo mise en avant. <b style={{ fontWeight: 500 }}>Une par moment du parcours</b> : l’activer ne retire la mise en avant que dans sa propre section, jamais dans les autres.
              </div>
            </Field>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setPlanModal(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={savePlan} disabled={!planForm.name.trim()}>
                {planEditId ? 'Enregistrer la formule' : 'Créer la formule'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {suiviFor && (() => {
        const plan = planOf(suiviFor.planId);
        /* ══ LE COMPTEUR PORTE SES PIÈCES — 1er septembre 2026 ══════════════
           « Je veux ouvrir le suivi des packs et les RDV associés » (Yéman).

           « 6 / 6 UTILISÉES » NE SE VÉRIFIE PAS. On ne pouvait ni contrôler un
           décompte que la cliente conteste, ni retrouver le rendez-vous coché
           par erreur, ni voir qu'il en manquait un. Chaque ligne porte
           désormais les séances qui l'ont consommée, et le nombre affiché EST
           la longueur de cette liste. */
        const usage = usageDetaille(suiviFor, plan, allAppts);
        const horsFormule = rdvCouvertsHorsFormule(suiviFor, plan, allAppts);
        /* LA FENÊTRE ANNONCÉE DOIT ÊTRE CELLE QUI COMPTE. L'écran lisait
           `cycleWindow` quand le moteur, lui, compte sur `subWindow` : un pack
           s'annonçait « cycle en cours du 1er sept. au 1er oct., le compteur
           repart à l'échéance » alors que ses crédits couvrent toute sa vie et
           NE SE RECHARGENT JAMAIS. La légende démentait le chiffre juste
           au-dessus. */
        const paquet = plan?.mode === 'pack';
        const { start, end } = subWindow(suiviFor, plan);
        const sansFin = paquet && !suiviFor.expiresIso;
        const jour = todayISO();
        const etatDuRdv = (a: Appointment) =>
          a.status === 'honoré' ? 'honoré' : a.date >= jour ? 'à venir' : a.status;
        const ouvrirLaFiche = () => { fermerLeSuivi(); navigate(`/customers?id=${suiviFor.clientId}`); };
        const ouvrirLeRituel = (a: Appointment) => { setRdvOuvert({ appt: a, retourA: suiviFor }); setSuiviFor(null); };
        const lignesRdv = (rdv: Appointment[]) => (
          <div style={{ marginTop: 9 }}>
            {rdv.map((a) => (
              <button
                type="button" key={a.id} onClick={() => ouvrirLeRituel(a)} title="Ouvrir le rendez-vous"
                style={{
                  display: 'flex', width: '100%', gap: 10, alignItems: 'baseline',
                  justifyContent: 'space-between', textAlign: 'left', font: 'inherit',
                  background: 'transparent', border: 0, borderTop: '1px solid var(--hairline)',
                  padding: '7px 0 6px', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 12.5, color: 'var(--color-indigo)' }}>
                  {dateComplete(a.date)} · {a.time}
                  {a.master ? <span className="mnd-muted"> · {a.master}</span> : null}
                </span>
                <span className="mnd-muted" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>{etatDuRdv(a)}</span>
              </button>
            ))}
          </div>
        );
        return (
          <Modal title={`Suivi · ${suiviFor.name}`} onClose={fermerLeSuivi} width={620}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="mnd-muted" style={{ fontSize: 12.5 }}>
                {plan?.name ?? '—'}
                {suiviFor.reference ? <> · <b style={{ letterSpacing: '.04em' }}>{suiviFor.reference}</b></> : null} ·{' '}
                {paquet
                  ? sansFin
                    ? `crédits ouverts depuis le ${dateComplete(start)}, sans échéance posée. Ils ne se rechargent pas.`
                    : `crédits valables du ${dateComplete(start)} au ${dateComplete(end)}. Ils ne se rechargent pas.`
                  : `cycle en cours du ${dateComplete(start)} au ${dateComplete(end)}, le compteur repart à l’échéance.`}
                {' '}
                <button type="button" className="tre-link-btn" onClick={() => setDatesEdit({ debut: suiviFor.startIso ?? suiviFor.sinceIso ?? todayISO(), fin: (paquet ? suiviFor.expiresIso : suiviFor.nextIso) ?? '' })}>
                  Changer les dates
                </button>
                {' · '}
                <button type="button" className="tre-link-btn" onClick={() => setContratEdit({ sub: suiviFor, planId: suiviFor.planId, inclus: inclusVendus(suiviFor, plan).map((i) => ({ ...i })) })}>
                  Modifier le contrat
                </button>
              </div>

              {/* ══ LA VALIDITÉ SE CORRIGE OÙ ELLE SE LIT ═══════════════════
                  Une échéance saisie de travers à la vente restait fausse pour
                  la vie du paquet, et c'est elle qui décide de ce qui se
                  décompte. Un PAQUET porte ses deux bornes ; un abonnement à
                  cycle n'a qu'une échéance, et c'est elle qu'on déplace. */}
              {datesEdit && (
                <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, padding: '13px 15px', background: 'var(--surface-card)' }}>
                  <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
                    {paquet && (
                      <Field label="Début des crédits">
                        <Input type="date" value={datesEdit.debut} onChange={(e) => setDatesEdit({ ...datesEdit, debut: e.target.value })} />
                      </Field>
                    )}
                    <Field label={paquet ? 'Fin des crédits' : 'Prochaine échéance'}>
                      <Input type="date" value={datesEdit.fin} onChange={(e) => setDatesEdit({ ...datesEdit, fin: e.target.value })} />
                    </Field>
                  </div>
                  {paquet && (
                    <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                      Laisser la fin vide, c’est un paquet sans échéance : ses crédits ne périment jamais.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
                    <Button variant="ghost" style={{ flex: 1 }} onClick={() => setDatesEdit(null)}>Annuler</Button>
                    <Button style={{ flex: 1 }} onClick={enregistreLesDates}>Enregistrer les dates</Button>
                  </div>
                </div>
              )}
              {usage.length === 0 && (
                <div className="mnd-muted" style={{ fontSize: 12.5 }}>Cette formule n’inclut aucune prestation à suivre.</div>
              )}
              {usage.map((u) => {
                const unlimited = u.qty === null;
                const pct = unlimited ? 0 : Math.min(100, Math.round((u.used / Math.max(1, u.qty!)) * 100));
                const exhausted = !unlimited && (u.remaining ?? 0) <= 0;
                /* `remaining` est borné à zéro pour que la barre ne recule pas ;
                   le dépassement, lui, se lit sur le brut. */
                const depassement = unlimited ? 0 : Math.max(0, u.used - (u.qty ?? 0));
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
                        {/* UN DÉPASSEMENT NE SE TAIT PAS — 1er septembre 2026.
                            « 7 / 6 utilisées » passait pour un compteur plein :
                            la barre était à fond, la phrase disait « épuisés »,
                            et la séance de trop ne se voyait nulle part. C'est
                            pourtant le signe qu'un rituel s'est décompté sur le
                            mauvais contrat, ou qu'on a servi une séance qui
                            n'était pas due. */}
                        <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, ...(depassement > 0 ? { color: '#8f3b30', fontWeight: 500 } : {}) }}>
                          {depassement > 0
                            ? `${depassement} séance${depassement > 1 ? 's' : ''} de trop : à rattacher à un autre contrat, ou offerte${depassement > 1 ? 's' : ''}`
                            : exhausted
                              ? paquet ? 'Crédits épuisés' : 'Allocation épuisée pour ce cycle'
                              : `Reste ${u.remaining}${paquet ? '' : ' sur ce cycle'}`}
                        </div>
                      </>
                    )}
                    {/* UN COMPTEUR À ZÉRO SE DIT AUSSI : sans cette ligne, on ne
                        sait pas si la séance manque ou si la case « couvert par
                        l'abonnement » a été oubliée au comptoir. */}
                    {u.rdv.length === 0
                      ? <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 8 }}>
                          Aucun rendez-vous décompté{paquet ? '' : ' sur ce cycle'}.
                        </div>
                      : lignesRdv(u.rdv)}
                  </div>
                );
              })}

              {/* UN RENDEZ-VOUS COUVERT QUI NE DÉCOMPTE RIEN ne se voyait nulle
                  part : il se règle comme s'il était offert, sans jeton en face.
                  C'est l'anomalie la plus coûteuse, et la seule que le suivi ne
                  savait pas montrer. */}
              {horsFormule.length > 0 && (
                <div className="tre-inline-note">
                  <span className="mark">!</span>
                  <span>
                    <b>{horsFormule.length} rendez-vous</b> {horsFormule.length > 1 ? 'sont marqués couverts' : 'est marqué couvert'} par
                    l’abonnement sans qu’aucune prestation de la formule n’y figure, {horsFormule.length > 1 ? 'ils ne décomptent' : 'il ne décompte'} donc
                    aucun jeton : {horsFormule.map((a) => dateComplete(a.date)).join(', ')}.
                  </span>
                </div>
              )}

              {/* ══ LA CADENCE POSÉE ═══════════════════════════════════════
                  Un abonnement vendu est une PROMESSE DE RYTHME. La Maison
                  encaissait la promesse et laissait le rythme se débrouiller :
                  six resserrages achetés, aucun fauteuil retenu, et la tête qui
                  rappelle en novembre trouve l'agenda plein.

                  L'ÉCRAN PROPOSE, IL N'ÉCRIT RIEN sans un oui : poser six
                  séances d'un geste sans pouvoir en bouger une seule ferait
                  plus de dégâts que de bien. */}
              {cadenceForm && (
                <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, padding: '14px 16px', background: 'var(--copper-50)' }}>
                  <Eyebrow>Poser ses rendez-vous</Eyebrow>

                  <div style={{ marginTop: 12 }}>
                    <div className="mnd-eyebrow" style={{ fontSize: 9.5, marginBottom: 6 }}>Son rythme</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {RYTHMES_ABO.map((sem) => (
                        <button
                          key={sem} type="button"
                          onClick={() => recalculeLaCadence({ pas: sem * 7 })}
                          style={{
                            border: `1px solid ${cadenceForm.pas === sem * 7 ? 'var(--color-copper)' : 'var(--hairline)'}`,
                            background: cadenceForm.pas === sem * 7 ? 'var(--copper-100, #F3E2D2)' : 'var(--surface-card)',
                            borderRadius: 3, padding: '7px 14px', cursor: 'pointer', font: 'inherit',
                            color: 'var(--color-indigo)', minWidth: 74,
                          }}
                        >
                          <b style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 400 }}>{sem}</b>
                          <span className="mnd-muted" style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase' }}>semaines</span>
                        </button>
                      ))}
                      <Input
                        type="number" min={1} value={String(Math.round(cadenceForm.pas / 7))}
                        onChange={(e) => recalculeLaCadence({ pas: Math.max(1, parseInt(e.target.value, 10) || 1) * 7 })}
                        style={{ width: 92 }}
                      />
                    </div>
                    <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                      Proposé d’après ses venues passées. La Maison ne devine pas, elle relit.
                    </div>
                  </div>

                  <div className="tr-grid tr-grid--3" style={{ gap: 11, marginTop: 13 }}>
                    <Field label="Première séance">
                      <Input type="date" value={cadenceForm.depart} onChange={(e) => recalculeLaCadence({ depart: e.target.value })} />
                    </Field>
                    <Field label="Heure">
                      <Input type="time" value={cadenceForm.heure} onChange={(e) => setCadenceForm({ ...cadenceForm, heure: e.target.value })} />
                    </Field>
                    <Field label="Maître">
                      <Select value={cadenceForm.maitre} onChange={(e) => setCadenceForm({ ...cadenceForm, maitre: e.target.value })}>
                        {branch.masters.map((mm) => <option key={mm} value={mm}>{mm}</option>)}
                      </Select>
                    </Field>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    {cadenceForm.suite.length === 0 && (
                      <div className="mnd-muted" style={{ fontSize: 12 }}>
                        Rien à poser : ses crédits sont consommés, ou la fenêtre du paquet se referme avant la première séance.
                      </div>
                    )}
                    {cadenceForm.suite.map((x, i) => (
                      <div key={x.rang} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
                          border: '1px solid var(--copper-300)', background: 'var(--surface-card)', fontSize: 11, color: 'var(--copper-700)',
                        }}>{x.rang}</span>
                        <Input
                          type="date" value={x.dateIso} style={{ width: 156, flex: 'none' }}
                          onChange={(e) => setCadenceForm({
                            ...cadenceForm,
                            suite: cadenceForm.suite.map((y, k) => (k === i ? { ...y, dateIso: e.target.value, glissee: false } : y)),
                          })}
                        />
                        <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: 11.5, color: 'var(--ink-soft)' }}>
                          {x.serviceIds.map((id) => serviceName(id)).join(' + ')}
                          {x.glissee && (
                            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--copper-700)' }}>
                              date portée au premier jour ouvert
                            </span>
                          )}
                        </span>
                        <button
                          type="button" className="tre-link-btn" style={{ flex: 'none' }}
                          onClick={() => setCadenceForm({ ...cadenceForm, suite: cadenceForm.suite.filter((_, k) => k !== i) })}
                        >Retirer</button>
                      </div>
                    ))}
                  </div>

                  {cadenceForm.suite.length > 0 && (
                    <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 10 }}>
                      Ces séances tiennent le fauteuil et décomptent ses crédits dès qu’elles sont posées.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 9, marginTop: 13, flexWrap: 'wrap' }}>
                    <Button variant="ghost" onClick={() => setCadenceForm(null)}>Annuler</Button>
                    {cadenceForm.suite.length > 0 && (
                      <Button variant="ghost" onClick={() => setCadenceForm({ ...cadenceForm, suite: decaleLaSuite(cadenceForm.suite, 7, clients.find((c) => c.id === suiviFor.clientId)?.jourPrefere) })}>
                        Décaler d’une semaine
                      </Button>
                    )}
                    <Button style={{ flex: 1 }} onClick={poserLaCadence} disabled={cadenceForm.suite.length === 0}>
                      Poser {cadenceForm.suite.length} rendez-vous
                    </Button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                <Button variant="ghost" style={{ flex: 1 }} onClick={fermerLeSuivi}>Fermer</Button>
                {!cadenceForm && usage.some((u) => u.remaining === null || (u.remaining ?? 0) > 0) && (
                  <Button variant="ghost" style={{ flex: 1 }} onClick={() => ouvrirLaCadence(suiviFor)}>Poser ses rendez-vous</Button>
                )}
                <Button style={{ flex: 1 }} onClick={ouvrirLaFiche}>Ouvrir sa fiche</Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* LE RITUEL OUVERT DEPUIS LE SUIVI. `appt` met la modale en modification :
          statut, mains, prestations, et la case qui décompte le jeton. En la
          fermant, le suivi revient, ses compteurs relus depuis l'agenda. */}
      {rdvOuvert && (
        <RdvModal
          appt={rdvOuvert.appt}
          onClose={() => { const retour = rdvOuvert.retourA; setRdvOuvert(null); setSuiviFor(retour); }}
        />
      )}

      {/* ══ REPRENDRE UN CONTRAT SIGNÉ ═══════════════════════════════════
          On répare CE contrat, pas la formule du catalogue : le contenu devient
          le sien, et la formule d'où il vient ne bouge pas d'un cheveu pour les
          autres têtes qui la portent. */}
      {contratEdit && (() => {
        const sub = contratEdit.sub;
        const nouveauPlan = planOf(contratEdit.planId);
        const apres: Subscriber = { ...sub, planId: contratEdit.planId, inclusPropres: contratEdit.inclus };
        const comptees = (m: Subscriber, pl: Plan | undefined) =>
          usageDetaille(m, pl, allAppts).reduce((n, u) => n + u.used, 0);
        const avant = comptees(sub, planOf(sub.planId));
        const maintenant = comptees(apres, nouveauPlan);
        const prixFige = sub.prixConvenuXof ?? prixVenduXof(sub, planOf(sub.planId), sub.cycle ?? 'mensuel');
        return (
          <Modal title={`Modifier · ${sub.name}`} onClose={() => setContratEdit(null)} width={560}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <Field label="La formule de ce contrat">
                <Select
                  value={contratEdit.planId}
                  onChange={(e) => {
                    /* CHANGER DE FORMULE PROPOSE SON CONTENU, sans l'imposer :
                       on vient justement réparer un contrat dont le contenu ne
                       correspond à aucune formule du catalogue. */
                    const pl = planOf(e.target.value);
                    setContratEdit({ ...contratEdit, planId: e.target.value, inclus: (pl?.included ?? []).map((i) => ({ ...i })) });
                  }}
                >
                  {plans.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                </Select>
              </Field>

              <Field label="Le contenu de ce contrat, à elle">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {contratEdit.inclus.length === 0 && (
                    <div className="mnd-muted" style={{ fontSize: 11.5 }}>
                      Ce contrat ne porte aucune prestation : rien ne s’y décompte.
                    </div>
                  )}
                  {contratEdit.inclus.map((i) => {
                    const illimite = i.qty === null;
                    return (
                      <div key={i.serviceId} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 10px', background: 'var(--surface-card)' }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--color-indigo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {serviceName(i.serviceId)}
                        </span>
                        <Input
                          inputMode="numeric"
                          value={illimite ? '' : String(i.qty)}
                          placeholder="∞"
                          disabled={illimite}
                          onChange={(e) => qteContrat(i.serviceId, Math.max(1, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 1))}
                          style={{ width: 64, textAlign: 'center', flex: 'none' }}
                        />
                        <button type="button" className={`tre-chip ${illimite ? 'is-on' : ''}`} title="Illimité" style={{ flex: 'none' }}
                          onClick={() => qteContrat(i.serviceId, illimite ? 1 : null)}>∞</button>
                        <button type="button" aria-label="Retirer" style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 13, flex: 'none' }}
                          onClick={() => setContratEdit({ ...contratEdit, inclus: contratEdit.inclus.filter((x) => x.serviceId !== i.serviceId) })}>✕</button>
                      </div>
                    );
                  })}
                  <Select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setContratEdit({ ...contratEdit, inclus: [...contratEdit.inclus, { serviceId: e.target.value, qty: 1 }] });
                      e.currentTarget.value = '';
                    }}
                    style={{ borderStyle: 'dashed', color: 'var(--copper-600)' }}
                  >
                    <option value="" disabled>+ Ajouter une prestation à ce contrat...</option>
                    <OptionsPrestations services={services} exclure={(sv) => contratEdit.inclus.some((i) => i.serviceId === sv.id)} />
                  </Select>
                </div>
              </Field>

              {/* CE QUE LE CHANGEMENT FAIT AUX SÉANCES DÉJÀ TENUES. Un contenu
                  qui ne correspond plus aux rituels rendus les fait sortir du
                  décompte : douze séances honorées redeviendraient dues. */}
              {maintenant !== avant && (
                <div className="tre-inline-note">
                  <span className="mark">!</span>
                  <span>
                    {maintenant < avant
                      ? <><b>{avant - maintenant} séance{avant - maintenant > 1 ? 's' : ''} déjà tenue{avant - maintenant > 1 ? 's' : ''}</b> ne se décompteront plus sur ce contrat : les prestations rendues ne sont pas celles de ce contenu.</>
                      : <><b>{maintenant - avant} séance{maintenant - avant > 1 ? 's' : ''}</b> entrent au décompte de ce contrat.</>}
                  </span>
                </div>
              )}

              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                Le prix convenu reste figé à <b>{fmtMoney(prixFige, currency)}</b> : la pièce, l’échéancier
                et le suivi doivent dire le même chiffre. Les dates se corrigent depuis le Suivi.
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="ghost" style={{ flex: 1 }} onClick={() => setContratEdit(null)}>Annuler</Button>
                <Button style={{ flex: 1 }} onClick={enregistreLeContrat}>Enregistrer le contrat</Button>
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
              {/* CHANGER DE FORMULE EFFACE CE QUI AVAIT ÉTÉ CONVENU. 190 000 F
                  posés sur L'Année Sereine ne veulent rien dire sur Le Lavage du
                  Mois, et un contenu ajusté encore moins : garder l'un ou l'autre
                  en silence vendrait un prix que personne n'a accepté. */}
              <Select
                value={subForm.planId}
                onChange={(e) => setSubForm({ ...subForm, planId: e.target.value, prixConvenu: '', motif: '', inclus: null, validiteMois: '' })}
              >
                {/* LA LISTE DE VENTE ANNONÇAIT `priceXof` BRUT, donc le prix de
                    référence : le maître lisait 140 000 F et le comptoir en
                    réclamait 201 500 à une tête Micro. Une formule qui varie dit
                    sa fourchette jusque dans un menu déroulant. */}
                {plans.map((p) => {
                  const four = libelleFourchette(p, subForm.cycle, calibresAbo, (x) => fmtMoney(x, currency));
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} · {four ? `${four} ${SELON_LE_CALIBRE}` : fmtMoney(p.priceXof, currency)}
                      {p.mode === 'pack' ? ` · ${moisDuPack(p)} mois` : ' / mois'}
                    </option>
                  );
                })}
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
              {/* LE MÊME JUGE QUE LA CARTE : un paquet dit son prix entier et
                  sa durée, jamais un « par mois » qui n'existe pas. */}
              {(() => {
                const pl = planOf(subForm.planId);
                if (!pl) return null;
                const tete = teteDeLaVente();
                const a = prixDeLaFormule(pl, subForm.cycle, tete, calibresAbo);
                const calibre = tete.bandId ? calibres.find((b) => b.id === tete.bandId) : undefined;
                return (
                  <div className="mnd-muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {fmtMoney(a.montantXof, currency)} {a.periode}
                    {/* ON DIT D'OÙ VIENT LE PRIX. Sans ce mot, deux ventes de la
                        même formule à deux montants différents ressemblent à une
                        erreur de saisie. */}
                    {calibre?.name && a.montantXof !== prixDeLaFormule(pl, subForm.cycle, undefined, calibresAbo).montantXof
                      ? ` · calibre ${calibre.name}` : ''}
                    {a.moisCouverts > 1 ? `, soit ${fmtMoney(partMensuelleDeLaFormule(pl, subForm.cycle), currency)} / mois` : ''}
                    {a.offert ? ` · ${a.offert}` : ''}
                  </div>
                );
              })()}
            </Field>
            {/* ══ SON PRIX À ELLE ======================================
                « Select a client to sell it to with its own price for each
                different client » (Yéman, 28 août).

                LE PRIX VIT SUR L'ABONNEMENT, PAS SUR LA FORMULE. Poser le prix
                négocié de cette tête sur L’Année Sereine le donnerait à toutes
                les suivantes et à la vitrine du comptoir. La formule reste la
                formule ; ce qui se négocie se pose ici.

                CHAMP VIDE = PRIX DU CATALOGUE. Une vente ordinaire ne demande
                rien de plus. */}
            {(() => {
              const plan = planOf(subForm.planId);
              if (!plan) return null;
              const catalogue = prixDeLaFormule(plan, subForm.cycle, teteDeLaVente(), calibresAbo).montantXof;
              const convenu = prixConvenuSaisi();
              const ecart = convenu === null ? 0 : convenu - catalogue;
              const pct = catalogue > 0 ? Math.round((ecart / catalogue) * 1000) / 10 : 0;
              return (
                <Field label="Son prix à elle · facultatif">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 'none' }}>
                      <div className="mnd-muted" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase' }}>Catalogue</div>
                      <div style={{
                        fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 400, lineHeight: 1.5,
                        color: convenu === null ? 'var(--color-indigo)' : 'var(--ink-soft)',
                        textDecoration: convenu === null ? 'none' : 'line-through',
                      }}>
                        {fmtMoney(catalogue, currency)}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div className="mnd-muted" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>
                        Prix convenu
                      </div>
                      <Input
                        inputMode="numeric"
                        value={subForm.prixConvenu}
                        placeholder={String(catalogue)}
                        onChange={(e) => setSubForm({ ...subForm, prixConvenu: e.target.value.replace(/[^0-9]/g, '') })}
                      />
                    </div>
                  </div>
                  {convenu !== null && ecart !== 0 && (
                    <div style={{
                      display: 'inline-block', marginTop: 8, fontSize: 11.5, letterSpacing: '.06em',
                      padding: '2px 9px', borderRadius: 2,
                      background: ecart < 0 ? 'rgba(74,107,82,.10)' : 'rgba(150,65,46,.09)',
                      border: `1px solid ${ecart < 0 ? 'rgba(74,107,82,.35)' : 'rgba(150,65,46,.35)'}`,
                      color: ecart < 0 ? 'var(--color-vert, #4A6B52)' : 'var(--color-brique, #96412E)',
                    }}>
                      {fmtMoney(Math.abs(ecart), currency)} {ecart < 0 ? 'de moins' : 'de plus'} - {Math.abs(pct)} %
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <Input
                      value={subForm.motif}
                      placeholder="Pourquoi ce prix (facultatif)"
                      onChange={(e) => setSubForm({ ...subForm, motif: e.target.value })}
                    />
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 7, lineHeight: 1.6 }}>
                    {convenu === null
                      ? 'Laissez vide et elle paie le prix du catalogue.'
                      : 'Un prix sans raison devient une discussion trois mois plus tard, quand personne ne se souvient.'}
                  </div>
                </Field>
              );
            })()}

            {/* ══ LE CONTENU, AJUSTÉ POUR ELLE =========================
                Les quantités de la formule s'affichent telles quelles. Des
                qu’on en touche une, la liste devient CELLE DE CETTE VENTE et
                cesse de suivre la formule, « Revenir à la formule » défait
                le geste. Ma Couronne comptera SES jetons à elle : lui en
                afficher six quand on lui en a vendu huit est la plus sûre
                façon de perdre sa confiance. */}
            {(() => {
              const plan = planOf(subForm.planId);
              if (!plan) return null;
              const liste = inclusDeLaVente();
              const ajuste = subForm.inclus !== null;
              const v = valeurALaCarte(liste, (id) => services.find((x) => x.id === id)?.priceXof);
              const vendu = prixDeLaVente();
              const r = remiseSurLaCarte(v.totalXof, vendu);
              return (
                <Field label="Le contenu, ajusté pour elle">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {liste.length === 0 && (
                      <div className="mnd-muted" style={{ fontSize: 11.5 }}>
                        Cette formule ne porte aucune prestation. Ajoutez-en pour qu’elle puisse la
                        consommer sans payer, avec un suivi dans Ma Couronne.
                      </div>
                    )}
                    {liste.map((i) => {
                      const illimite = i.qty === null;
                      const surLaFormule = plan.included?.find((x) => x.serviceId === i.serviceId);
                      const change = !surLaFormule || surLaFormule.qty !== i.qty;
                      return (
                        <div key={i.serviceId} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 10px', background: 'var(--surface-card)' }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--color-indigo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {serviceName(i.serviceId)}
                          </span>
                          {change && (
                            <span style={{ flex: 'none', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--copper-600)' }}>
                              {surLaFormule ? 'modifié' : 'ajouté'}
                            </span>
                          )}
                          {surLaFormule && change && (
                            <span className="mnd-muted" style={{ flex: 'none', fontSize: 11 }}>
                              au lieu de {surLaFormule.qty === null ? '∞' : surLaFormule.qty}
                            </span>
                          )}
                          <Input
                            inputMode="numeric"
                            value={illimite ? '' : String(i.qty)}
                            placeholder="∞"
                            disabled={illimite}
                            onChange={(e) => qteVente(i.serviceId, Math.max(1, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 1))}
                            style={{ width: 64, textAlign: 'center', flex: 'none' }}
                          />
                          <button
                            type="button"
                            className={`tre-chip ${illimite ? 'is-on' : ''}`}
                            onClick={() => qteVente(i.serviceId, illimite ? 1 : null)}
                            title="Illimité"
                            style={{ flex: 'none' }}
                          >
                            ∞
                          </button>
                          <button onClick={() => retireVente(i.serviceId)} aria-label="Retirer" style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 13, flex: 'none' }}>✕</button>
                        </div>
                      );
                    })}
                    <Select
                      value=""
                      onChange={(e) => { ajouteVente(e.target.value); e.currentTarget.value = ''; }}
                      style={{ borderStyle: 'dashed', color: 'var(--copper-600)' }}
                    >
                      <option value="" disabled>+ Ajouter une prestation pour elle...</option>
                      <OptionsPrestations
                        services={services}
                        exclure={(sv) => liste.some((i) => i.serviceId === sv.id)}
                      />
                    </Select>

                    {/* LA DURÉE SE NÉGOCIE AUSSI, sur un paquet seulement : un
                        abonnement à cycle ne s’épuise pas, il se recharge. */}
                    {plan.mode === 'pack' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span className="mnd-muted" style={{ fontSize: 12 }}>Valable</span>
                        <Input
                          inputMode="numeric"
                          value={subForm.validiteMois}
                          placeholder={String(moisDuPack(plan))}
                          onChange={(e) => setSubForm({ ...subForm, validiteMois: e.target.value.replace(/[^0-9]/g, '') })}
                          style={{ width: 70, textAlign: 'center', flex: 'none' }}
                        />
                        <span className="mnd-muted" style={{ fontSize: 12 }}>
                          mois{subForm.validiteMois ? `  · au lieu de ${moisDuPack(plan)}` : ''}
                        </span>
                      </div>
                    )}

                    {/* LE TOTAL SE RECALCULE SUR CE QUI EST VENDU. Une formule
                        dont on retire le soin ne vaut plus ce que dit son
                        catalogue : continuer à l’écrire serait un chiffre faux
                        tendu à une cliente. */}
                    {liste.length > 0 && (
                      <div style={{
                        marginTop: 4, padding: '11px 13px', borderRadius: 3, fontSize: 12.5, lineHeight: 1.7,
                        background: r.gainXof < 0 ? 'rgba(150,65,46,.07)' : 'var(--copper-50)',
                        border: `1px solid ${r.gainXof < 0 ? 'var(--color-brique, #96412E)' : 'var(--copper-300)'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <span className="mnd-muted">À la carte{ajuste ? ', telle qu’ajustée' : ''}</span>
                          <b style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 400 }}>
                            {fmtMoney(v.totalXof, currency)}
                          </b>
                        </div>
                        {vendu > 0 && v.totalXof > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                            <span className="mnd-muted">
                              {r.gainXof < 0 ? 'Elle paierait plus qu’à la carte' : 'Elle gagne'}
                            </span>
                            <b style={{ fontWeight: 500 }}>
                              {fmtMoney(Math.abs(r.gainXof), currency)} - {Math.abs(r.pct)} %
                            </b>
                          </div>
                        )}
                        {v.introuvables > 0 && (
                          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 5 }}>
                            {v.introuvables} prestation{v.introuvables > 1 ? 's' : ''} hors catalogue, non comptée{v.introuvables > 1 ? 's' : ''}.
                          </div>
                        )}
                        {v.illimitees > 0 && (
                          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 5 }}>
                            {v.illimitees} prestation{v.illimitees > 1 ? 's' : ''} illimitée{v.illimitees > 1 ? 's' : ''} : sans quota, sa valeur ne se chiffre pas.
                          </div>
                        )}
                      </div>
                    )}

                    {ajuste && (
                      <button
                        type="button"
                        className="tre-chip"
                        style={{ alignSelf: 'flex-start' }}
                        onClick={() => setSubForm({ ...subForm, inclus: null, validiteMois: '' })}
                      >
                        Revenir à la formule
                      </button>
                    )}
                  </div>
                </Field>
              );
            })()}

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
              /* LE SEUIL SE JUGE SUR CE QU'ELLE PAIE VRAIMENT. Une formule
                 descendue sous 100 000 F ne se découpe plus, et l'écran doit
                 le dire en refermant la porte plutôt que la laisser ouverte
                 sur un montant qu'on n'accorde pas. */
              const total = prixDeLaVente() + supp;
              if (!peutEtreEchelonne(total)) return null;
              const apercu = echeancierDeLaVente(total);
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
                  {/* ══ LA PREMIÈRE TRANCHE SE CHOISIT — 1er septembre 2026 ═══
                      « Je voudrais changer le montant de la première tranche de
                      paiement » (Yéman).

                      LE PARTAGE ÉGAL EST UNE COMMODITÉ, PAS UNE LOI. Une
                      cliente arrive avec 100 000 F en main sur un abonnement de
                      168 000 : lui imposer 84 000 aujourd'hui, c'est refuser
                      l'argent qu'elle tend et allonger ce qu'elle devra.

                      LE CHAMP RESTE VIDE PAR DÉFAUT, et vide veut dire « partage
                      égal ». On ne demande rien à qui n'a rien à négocier. */}
                  {subForm.parts && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 10, flexWrap: 'wrap' }}>
                      <span className="mnd-muted" style={{ fontSize: 11.5 }}>Aujourd’hui, elle règle</span>
                      <Input
                        inputMode="numeric"
                        style={{ maxWidth: 130, textAlign: 'right' }}
                        placeholder={String(apercu[0]?.amountXof ?? '')}
                        value={subForm.premiere}
                        onChange={(e) => setSubForm({ ...subForm, premiere: e.target.value.replace(/[^0-9]/g, '') })}
                      />
                      {subForm.premiere && (
                        <button className="tre-link-btn" onClick={() => setSubForm({ ...subForm, premiere: '' })}>
                          revenir au partage égal
                        </button>
                      )}
                    </div>
                  )}
                  {apercu.length > 0 ? (
                    <div style={{ marginTop: 10, border: '1px solid var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
                      {apercu.map((e) => (
                        <div key={e.numero} style={{
                          display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5,
                          padding: '8px 12px', borderTop: e.numero === 1 ? 'none' : '1px solid var(--hairline)',
                        }}>
                          <span className="mnd-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {e.numero === 1 ? 'À la signature' : `${e.numero}ᵉ versement`}
                            {/* CHAQUE DATE SE POSE ICI. Trente jours est une
                                commodité, pas un accord : une cliente payée le
                                5 ne peut pas honorer une échéance au 1er, et
                                l'imposer fabrique un retard qu'on lui
                                reprochera. */}
                            <Input
                              type="date"
                              style={{ maxWidth: 150, fontSize: 12 }}
                              value={e.dueIso}
                              onChange={(ev) => setSubForm({
                                ...subForm,
                                dates: { ...subForm.dates, [String(e.numero)]: ev.target.value },
                              })}
                            />
                          </span>
                          <b style={{ fontWeight: 500 }}>{fmtMoney(e.amountXof, currency)}</b>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {/* ON DIT QUAND LE MONTANT A ÉTÉ RAMENÉ : chaque échéance garde
                      au moins un franc, et une tranche bornée sans un mot passe
                      pour une faute de saisie. */}
                  {apercu.length > 0 && premiereVoulue() !== undefined
                    && apercu[0].amountXof !== premiereVoulue() && (
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, color: 'var(--copper-700)' }}>
                      Ramenée à {fmtMoney(apercu[0].amountXof, currency)} : chaque échéance suivante
                      garde au moins un franc.
                    </div>
                  )}
                  {apercu.length > 0 && Object.keys(subForm.dates).length > 0 && (
                    <button
                      className="tre-link-btn"
                      style={{ marginTop: 7 }}
                      onClick={() => setSubForm({ ...subForm, dates: {} })}
                    >
                      revenir au rythme de trente jours
                    </button>
                  )}
                  {apercu.length === 0 && (
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
              {planOf(payFor.planId) ? ` · ${fmtMoney(prixVenduXof(payFor, planOf(payFor.planId), payFor.cycle ?? 'mensuel'), currency)}` : ''}
              {(() => {
                const e = ecartDuPrixConvenu(payFor, planOf(payFor.planId), payFor.cycle ?? 'mensuel');
                return e ? (
                  <span className="mnd-muted" style={{ textDecoration: 'line-through', marginLeft: 6 }}>
                    {fmtMoney(e.catalogueXof, currency)}
                  </span>
                ) : null;
              })()}
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
                        <span className="mnd-muted" style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <b style={{ fontWeight: 500 }}>{e.numero}ᵉ</b>
                          {/* LA DATE S'ÉDITE — la vie ne suit pas le calendrier :
                              un salaire qui tombe le 5, un voyage, un mois
                              difficile. Une date qu'on ne peut pas déplacer se
                              contourne en ne payant pas, et c'est la Maison qui
                              perd la trace. Déplacer POUSSE les suivantes :
                              l'imputation se fait dans l'ordre, l'ordre tient. */}
                          <input
                            type="date"
                            className="mnd-input"
                            value={e.dueIso}
                            onChange={(ev) => reposerLaDate(payFor, e.numero, ev.target.value)}
                            aria-label={`Date de la ${e.numero}ᵉ échéance`}
                            style={{ padding: '3px 6px', fontSize: 11.5, width: 132 }}
                          />
                          {e.soldee ? 'soldée'
                            : e.enRetard ? `en retard de ${e.retardJours} jour${e.retardJours > 1 ? 's' : ''}`
                              : e.regleXof > 0 ? `${fmtMoney(e.regleXof, currency)} versés` : 'à venir'}
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
            {/* LA CAISSE CRÉDITÉE — 29 août 2026. Sans elle, l'argent n'entre
                dans aucun tiroir : le journal de caisse se dérive du champ
                `cashbox` des règlements de factures, et rien d'autre. */}
            <div className="tr-grid tr-grid--2">
              <Field label="Caisse créditée">
                <Select value={caisse} onChange={(e) => setCaisse(e.target.value)}>
                  {branchBoxes.length === 0 && <option value="">Aucune caisse</option>}
                  {branchBoxes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Moyen de paiement">
                <Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                  {methods.length === 0 && <option value="">—</option>}
                  {methods.map((mth) => <option key={mth} value={mth}>{mth}</option>)}
                </Select>
              </Field>
            </div>

            {(payFor.payments ?? []).length > 0 && (
              <div>
                <div className="tre-sec-label" style={{ marginBottom: 8 }}>Règlements enregistrés</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 170, overflowY: 'auto' }}>
                  {[...(payFor.payments ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map((p) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, borderBottom: '1px solid var(--hairline)', paddingBottom: 5 }}>
                      <span className="mnd-muted">{dateComplete(p.date)}{p.method ? ` · ${p.method}` : ''}</span>
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
