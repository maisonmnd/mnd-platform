import { asset } from '../../../../shared/asset';
import { useMemo, useRef, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select, Textarea, toast } from '../../../../ds/components';
import { fmtMoney } from '../../../../shared/currency';
import { usePaymentMethods, type PaymentMethod } from '../../../../shared/finance';
import { useBranch } from '../../../../shared/branches';
import { uid } from '../../../../shared/store';
import {
  FORMATION_NIVEAUX,
  refTempsStore, refPaliersStore, refLexiqueStore,
  useRefTemps, useRefPaliers, useRefLexique,
  REF_TEMPS_SEED, REF_PALIERS_SEED, REF_LEXIQUE_SEED,
  useFormations, useApprenants, useCertifs,
  apprPaid, apprDue, apprHasFinance, apprPayStatus,
  type Formation, type Apprenant, type Certification, type Payment, type RefEntry,
} from './data';
import type { Store } from '../../../../shared/store';
import { Bar, Pill, Tabs } from './ui';
import AcademieSuivi from './AcademieSuivi';
import './equipe.css';
import './equipe.css';
import { frShortAn } from '../clients/_shared';
import { parcoursAPoser, completeLaFiche, PUBLIC_LABEL, PARCOURS_MND, dureeDite, competencesDesModules, type PublicDeFormation } from '../../../../shared/parcours';
import { useManuel, manuelStore, lisLeManuel, peutEcrireLeManuel } from '../../../../shared/manuel';
import ManuelEditeur from './ManuelEditeur';
import { useStaff as useMonProfil } from '../../../../shared/auth';
import { useEnrollments, depositAmountFor, realigneLesModules } from './academy';
import { sameName } from '../../../../shared/text';
import CopieAuDossier from './CopieAuDossier';
import { ChampDeDate } from '../../../../ds/dates';

/* Académie — Formations / Apprenants / Certifications / Référentiel « les quatre temps ».
   Inscription d'apprenants, suivi d'avancement, certificats scellés MND (le rendu du
   certificat lui-même vit dans l'app `certificat` — ici on le déclenche, on ne le rebâtit pas). */

type Tab = 'formations' | 'suivi' | 'apprenants' | 'certifications' | 'referentiel';

const payTone = (p: Apprenant['pay']): 'ok' | 'warn' | 'error' => (p === 'À jour' ? 'ok' : p === 'Échéance' ? 'warn' : 'error');

/* Parcours par défaut d'une nouvelle formation — « les quatre temps » du
   référentiel, désormais éditable : le défaut se lit donc au moment de la création
   (dans le composant), non plus à l'import de ce module. */
/* UN MODULE, TEL QU'ON LE SAISIT (13 septembre 2026) : son nom, que le Suivi
   évalue, ses séances et ce qu'on y apprend. */
type ModuleForm = { nom: string; seances: string; contenu: string };
type FormationForm = {
  name: string; niveau: string; description: string; sessions: string; demarrage: string; places: string;
  price: string; duree: string; deposit: string; modules: ModuleForm[]; featured: boolean;
  /* L'acompte se fixe en pourcentage (`deposit`) ou en francs (`depositXof`). */
  depositMode: 'pct' | 'xof'; depositXof: string;
  /* Le public ne se présélectionne pas : il se choisit. */
  public: '' | PublicDeFormation; accroche: string; pourQui: string; pourEntrer: string;
  /** Un savoir par ligne. */
  sait: string; tetesReelles: string;
};
const BASE_FORMATION: Omit<FormationForm, 'modules'> = {
  name: '', niveau: FORMATION_NIVEAUX[0], description: '', sessions: '6', demarrage: 'sur dossier', places: '4 places',
  price: '', duree: '6', deposit: '40', featured: false, depositMode: 'pct', depositXof: '',
  public: '', accroche: '', pourQui: '', pourEntrer: '', sait: '', tetesReelles: '',
};
const moduleVide = (nom = ''): ModuleForm => ({ nom, seances: '', contenu: '' });
const ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/* Inscription : identité + formation (montant convenu) + un règlement à saisir
   — intégral (tout, à une date) ou partiel (un acompte). `payments` porte les
   règlements déjà enregistrés (édition d'un·e apprenant·e existant·e). */
type PayMode = 'integral' | 'partiel' | 'aucun';
type ApprenantForm = {
  name: string;
  formationId: string;
  priceInput: string;   // montant brut de la formation
  remiseInput: string;  // remise accordée (F CFA)
  payMode: PayMode;
  amountInput: string;
  payDate: string;      // ISO yyyy-mm-dd (calendrier)
  payMethod: PaymentMethod;
  payments: Payment[];
};
type CertifForm = { name: string; parcours: string; date: string; statut: Certification['statut'] };

export default function Academie() {
  const { currency } = useBranch();
  const [payMethods] = usePaymentMethods();
  const [tab, setTab] = useState<Tab>('formations');
  const [showArchived, setShowArchived] = useState(false);
  /* DÉBUTANTES OU PROFESSIONNELLES — 13 septembre 2026. « Je veux une
     distinction entre les professionnels et les débutants » (Yéman). */
  const [filtrePublic, setFiltrePublic] = useState<'toutes' | PublicDeFormation>('toutes');

  const [formations, setFormations] = useFormations();
  const [apprenants, setApprenants] = useApprenants();
  const [certifs, setCertifs] = useCertifs();

  /* Le référentiel — éditable. Les « quatre temps » servent aussi de parcours par
     défaut à toute nouvelle formation, d'où leur lecture ici. */
  const [refTemps] = useRefTemps();
  const [refPaliers] = useRefPaliers();
  const [refLexique] = useRefLexique();
  const defaultModules = useMemo(() => refTemps.map((t) => t.n.trim()).filter(Boolean), [refTemps]);

  const [foForm, setFoForm] = useState<FormationForm | null>(null);
  /* La fiche entière d'une formation, en lecture. */
  const [ficheId, setFicheId] = useState<string | null>(null);

  /* CE QU'IL RESTE À POSER — le juge est pur (`parcoursAPoser`), il compare les
     noms aplatis pour qu'« L'Oeuvre » et « L'Œuvre » restent un seul parcours. */
  const aPoser = useMemo(() => parcoursAPoser(formations), [formations]);
  const poseLesParcours = () => {
    /* LES PRIX ET LE CONTENU SE POSENT AVEC LA FORMATION depuis le
       13 septembre 2026 : la Maison les a demandés et validés (voir
       `shared/parcours`). Ils se corrigent dans « Modifier ». */
    setFormations((prev) => [
      ...prev,
      ...aPoser.map((p) => ({
        id: `fo-${p.id}`,
        name: p.titre,
        niveau: p.niveau,
        sessions: p.seances,
        demarrage: 'sur dossier',
        places: 'à définir',
        priceXof: p.prixXof,
        dureeSemaines: p.semaines,
        archived: false,
        description: p.competences,
        public: p.public,
        accroche: p.accroche,
        pourQui: p.pourQui,
        pourEntrer: p.pourEntrer,
        sait: [...p.sait],
        tetesReelles: p.tetesReelles,
        modules: p.programme.map((m) => m.nom),
        programme: p.programme.map(({ seances, contenu }) => ({ seances, contenu })),
      })),
    ]);
  };
  /* ══ COMPLÉTER LES FICHES DE LA MAISON — 13 septembre 2026 ═══════════
     Les neuf formations sont déjà posées, avec une ligne de description et les
     quatre temps pour programme. Ce geste leur apporte le contenu validé SANS
     RIEN ÉCRASER : le juge est pur (`completeLaFiche`) et éprouvé
     (`verifie-parcours`). Une rubrique ne se remplit que vide, un prix que s'il
     est à zéro, et le programme d'une formation qui a des inscrites ne change
     pas : leurs modules validés se retrouvent par leur nom.

     À LA MAIN, COMME « POSER LES PARCOURS » : un contenu qui arriverait tout
     seul sur une formation que la Maison a peut-être réécrite serait une
     surprise, et la confirmation dit ce qui va bouger. */
  const [enrollments, setEnrollments] = useEnrollments();
  const aCompleter = useMemo(() => formations
    .map((f) => ({
      f,
      c: completeLaFiche(f, {
        modulesParDefaut: defaultModules,
        inscrites: apprenants.filter((a) => a.formationId === f.id).length
          + enrollments.filter((e) => e.formationId === f.id).length,
      }),
    }))
    .filter((x) => x.c.rubriques.length > 0), [formations, apprenants, enrollments, defaultModules]);
  const completeLesFiches = () => {
    const n = aCompleter.length;
    const prix = aCompleter.filter((x) => x.c.rubriques.includes('prix')).length;
    if (!window.confirm(
      `Compléter ${n} formation${n > 1 ? 's' : ''} avec le contenu validé de l’Académie ?\n\n`
      + 'Seules les rubriques vides se remplissent : rien de ce qui a été écrit à la main n’est repris.'
      + (prix > 0 ? `\nLe prix proposé se pose sur ${prix} formation${prix > 1 ? 's' : ''} encore sans prix ; un prix déjà écrit reste.` : '')
      + '\nLe programme d’une formation qui a déjà des inscrites ne change pas.',
    )) return;
    const parId = new Map(aCompleter.map((x) => [x.f.id, x.c.fiche]));
    setFormations((prev) => prev.map((f) => parId.get(f.id) ?? f));
    toast(`${n} fiche${n > 1 ? 's' : ''} complétée${n > 1 ? 's' : ''}.`);
  };
  const [foEditId, setFoEditId] = useState<string | null>(null);

  const [apForm, setApForm] = useState<ApprenantForm | null>(null);
  const [apEditId, setApEditId] = useState<string | null>(null);
  const [apDetail, setApDetail] = useState<string | null>(null);

  const [ceForm, setCeForm] = useState<CertifForm | null>(null);
  const [ceEditId, setCeEditId] = useState<string | null>(null);

  const [note, setNote] = useState<string | null>(null);

  const activeFormations = formations.filter((f) => f.archived === showArchived
    && (filtrePublic === 'toutes' || f.public === filtrePublic));
  const comptePublic = (k: 'toutes' | PublicDeFormation) =>
    formations.filter((f) => f.archived === showArchived && (k === 'toutes' || f.public === k)).length;
  const formationName = (id: string) => formations.find((f) => f.id === id)?.name ?? '—';
  const formationPrice = (id: string) => formations.find((f) => f.id === id)?.priceXof ?? 0;
  /* Les modules du parcours de la formation. `undefined` = fiche héritée d'avant la
     fonctionnalité → repli sur « les quatre temps ». `[]` = parcours volontairement
     vidé → on le respecte (aucun module). */
  const formationModules = (id: string): string[] => {
    const m = formations.find((f) => f.id === id)?.modules;
    return m === undefined ? defaultModules : m;
  };
  /* Avancement = modules faits / modules de LA formation. On ne compte que dans la
     limite des modules actuels (si la formation en a perdu, on ne dépasse pas 100 %). */
  const avancementOf = (a: Apprenant) => {
    const total = formationModules(a.formationId).length;
    const done = a.modulesDone.slice(0, total).filter(Boolean).length;
    return total ? Math.round((done / total) * 100) : 0;
  };
  const digits = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
  /* Date du jour au format calendrier (yyyy-mm-dd, local). */
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  /* yyyy-mm-dd → jj/mm/aaaa (lisible), sans décalage de fuseau. */
  const frDate = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  };
  /* Statut affiché : déduit des règlements réels si suivi financier, sinon champ historique. */
  const payStatusOf = (a: Apprenant) => (apprHasFinance(a) ? apprPayStatus(a) : a.pay);

  const stats = useMemo(() => ({
    formations: formations.filter((f) => !f.archived).length,
    apprenants: apprenants.length,
    certifs: certifs.filter((c) => c.statut === 'Délivrée').length,
  }), [formations, apprenants, certifs]);

  /* — formations — */
  const openFoNew = () => { setFoEditId(null); setFoForm({ ...BASE_FORMATION, modules: defaultModules.map((m) => moduleVide(m)) }); };
  const majModule = (i: number, patch: Partial<ModuleForm>) =>
    setFoForm((prev) => (prev ? { ...prev, modules: prev.modules.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : prev));
  /* MONTER, DESCENDRE — 16 septembre 2026. « Ajoute des toggles up and down
     pour modifier les positions des titres » (Yéman). Le module emporte son
     nombre de séances et son contenu : on déplace une ligne, pas un titre. */
  const deplaceModule = (i: number, sens: -1 | 1) =>
    setFoForm((prev) => {
      if (!prev) return prev;
      const j = i + sens;
      if (j < 0 || j >= prev.modules.length) return prev;
      const modules = [...prev.modules];
      [modules[i], modules[j]] = [modules[j], modules[i]];
      return { ...prev, modules };
    });
  const openFoEdit = (f: Formation) => {
    setFoEditId(f.id);
    const noms = f.modules && f.modules.length ? f.modules : defaultModules;
    setFoForm({
      name: f.name, niveau: f.niveau, description: f.description ?? '', sessions: String(f.sessions), demarrage: f.demarrage,
      places: f.places, price: String(f.priceXof), duree: String(f.dureeSemaines), deposit: String(f.depositPct ?? 40),
      depositMode: (f.depositXof ?? 0) > 0 ? 'xof' : 'pct', depositXof: (f.depositXof ?? 0) > 0 ? String(f.depositXof) : '',
      modules: noms.map((nom, i) => {
        const ligne = f.modules && f.modules.length ? f.programme?.[i] : undefined;
        return { nom, seances: ligne?.seances ? String(ligne.seances) : '', contenu: ligne?.contenu ?? '' };
      }),
      featured: !!f.featured,
      public: f.public ?? '', accroche: f.accroche ?? '', pourQui: f.pourQui ?? '', pourEntrer: f.pourEntrer ?? '',
      sait: (f.sait ?? []).join('\n'), tetesReelles: f.tetesReelles ?? '',
    });
  };
  const saveFo = () => {
    if (!foForm || !foForm.name.trim() || !foForm.public) return;
    const sessions = parseInt(foForm.sessions, 10) || 1;
    const priceXof = parseInt(foForm.price.replace(/[^0-9]/g, ''), 10) || 0;
    const dureeSemaines = parseInt(foForm.duree, 10) || 1;
    const depositPct = Math.max(0, Math.min(100, parseInt(foForm.deposit.replace(/[^0-9]/g, ''), 10) || 0));
    /* En francs, l'acompte l'emporte ; vide ou à zéro, on retombe sur le pourcentage. */
    const acompteFixe = foForm.depositMode === 'xof'
      ? (parseInt(foForm.depositXof.replace(/[^0-9]/g, ''), 10) || 0) || undefined
      : undefined;
    /* Une ligne sans nom tombe, et sa séance et son contenu avec elle : le
       programme reste aligné sur les modules, index pour index. */
    const lignes = foForm.modules
      .map((m) => ({ nom: m.nom.trim(), seances: parseInt(m.seances.replace(/[^0-9]/g, ''), 10) || 0, contenu: m.contenu.trim() }))
      .filter((m) => m.nom);
    const modules = lignes.map((m) => m.nom);
    const contenu = {
      public: foForm.public || undefined,
      accroche: foForm.accroche.trim() || undefined,
      pourQui: foForm.pourQui.trim() || undefined,
      pourEntrer: foForm.pourEntrer.trim() || undefined,
      sait: foForm.sait.split('\n').map((l) => l.trim().replace(/\s*[;.]$/, '')).filter(Boolean),
      tetesReelles: foForm.tetesReelles.trim() || undefined,
      programme: lignes.map((m) => ({ seances: m.seances || undefined, contenu: m.contenu || undefined })),
    };
    const featured = foForm.featured;
    if (foEditId) {
      const oldNames = formationModules(foEditId); // parcours AVANT modification (état courant)
      /* Une SEULE formation vedette à la fois — l'activer retire la vedette des autres. */
      setFormations((prev) => prev.map((f) => (f.id === foEditId
        ? { ...f, name: foForm.name.trim(), niveau: foForm.niveau, description: foForm.description.trim() || undefined, sessions, demarrage: foForm.demarrage.trim(), places: foForm.places.trim(), priceXof, dureeSemaines, depositPct, depositXof: acompteFixe, modules, featured, ...contenu }
        : (featured ? { ...f, featured: false } : f))));
      /* Réaligne la progression des apprenant·e·s inscrit·e·s par NOM de module : ajout,
         retrait ou réordonnancement ne décalent plus les cases cochées (un renommage
         repart de zéro pour ce module). */
      const modulesChanged = oldNames.length !== modules.length || oldNames.some((nm, i) => nm !== modules[i]);
      if (modulesChanged) {
        setApprenants((prev) => prev.map((a) => {
          if (a.formationId !== foEditId) return a;
          const done = new Map(oldNames.map((nm, i) => [nm, !!a.modulesDone[i]]));
          return { ...a, modulesDone: modules.map((nm) => done.get(nm) ?? false) };
        }));
        /* ET LES DOSSIERS DE SÉANCES SUIVENT AUSSI, par le nom du module :
           une séance ou une note ne doit pas glisser vers le module d'à côté
           parce qu'on en a déplacé un (voir `realigneLesModules`). */
        setEnrollments((prev) => prev.map((e) => (e.formationId === foEditId ? realigneLesModules(e, oldNames, modules) : e)));
      }
    } else {
      setFormations((prev) => [
        ...(featured ? prev.map((f) => ({ ...f, featured: false })) : prev),
        { id: `fo-${uid()}`, name: foForm.name.trim(), niveau: foForm.niveau, description: foForm.description.trim() || undefined, sessions, demarrage: foForm.demarrage.trim(), places: foForm.places.trim(), priceXof, dureeSemaines, depositPct, depositXof: acompteFixe, archived: false, modules, featured, ...contenu },
      ]);
    }
    setFoForm(null);
  };
  const toggleArchive = (f: Formation) => setFormations((prev) => prev.map((x) => (x.id === f.id ? { ...x, archived: !x.archived } : x)));

  /* Réordonner les formations — on échange avec la voisine VISIBLE (même filtre
     actives/archivées), quels que soient les éléments archivés intercalés dans
     le tableau complet, pour les lire dans l'ordre voulu. */
  const moveFo = (id: string, dir: -1 | 1) => {
    const vi = activeFormations.findIndex((f) => f.id === id);
    const vj = vi + dir;
    if (vi < 0 || vj < 0 || vj >= activeFormations.length) return;
    const otherId = activeFormations[vj].id;
    setFormations((prev) => {
      const i = prev.findIndex((f) => f.id === id);
      const j = prev.findIndex((f) => f.id === otherId);
      if (i < 0 || j < 0) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const removeFo = (f: Formation) => {
    const enrolled = apprenants.filter((a) => a.formationId === f.id).length;
    const warn = enrolled > 0
      ? `\n\nAttention : ${enrolled} apprenant·e${enrolled > 1 ? 's' : ''} y ${enrolled > 1 ? 'sont inscrit·e·s' : 'est inscrit·e'}. Leur suivi restera sans formation rattachée.`
      : '';
    if (!window.confirm(`Supprimer la formation « ${f.name} » ?${warn}`)) return;
    setFormations((prev) => prev.filter((x) => x.id !== f.id));
  };

  /* — apprenants — */
  const openApNew = () => {
    setApEditId(null);
    const fId = formations.find((f) => !f.archived)?.id ?? formations[0]?.id ?? '';
    const price = formationPrice(fId);
    /* Défaut « Plus tard » : aucun règlement n'est enregistré tant qu'on ne le choisit pas
       explicitement — on ne marque jamais « soldé » par accident. */
    setApForm({ name: '', formationId: fId, priceInput: price ? String(price) : '', remiseInput: '', payMode: 'aucun', amountInput: '', payDate: todayISO(), payMethod: 'MTN MoMo', payments: [] });
  };
  const openApEdit = (a: Apprenant) => {
    setApEditId(a.id);
    /* Fiche déjà financée → on rappelle son montant brut (net + remise) et sa remise.
       Fiche héritée (sans suivi) → champs vides : un simple correctif ne la bascule pas
       sur le suivi de paiement ni ne la fait paraître débitrice. */
    const remise = a.remiseXof ?? 0;
    const gross = apprHasFinance(a) ? (a.priceXof ?? 0) + remise : 0;
    setApForm({ name: a.name, formationId: a.formationId, priceInput: gross ? String(gross) : '', remiseInput: remise ? String(remise) : '', payMode: 'aucun', amountInput: '', payDate: todayISO(), payMethod: 'MTN MoMo', payments: a.payments ?? [] });
  };
  const saveAp = () => {
    if (!apForm || !apForm.name.trim()) return;
    const gross = digits(apForm.priceInput);
    const remise = Math.min(gross, digits(apForm.remiseInput)); // la remise ne dépasse pas le prix
    const price = Math.max(0, gross - remise);                  // net dû = prix − remise
    const already = apForm.payments.reduce((s, p) => s + p.amountXof, 0);
    /* Le règlement saisi : intégral solde le reste (net − déjà réglé), partiel prend le montant saisi. */
    let newPayment: Payment | null = null;
    if (apForm.payMode !== 'aucun') {
      const amount = apForm.payMode === 'integral' ? Math.max(0, price - already) : digits(apForm.amountInput);
      if (amount > 0) newPayment = { id: `pay-${uid()}`, amountXof: amount, date: frDate(apForm.payDate || todayISO()), method: apForm.payMethod };
    }
    const payments = newPayment ? [...apForm.payments, newPayment] : apForm.payments;
    const paid = payments.reduce((s, p) => s + p.amountXof, 0);
    /* Soldé → « À jour », toute somme restant due → « Échéance ». */
    const derived: Apprenant['pay'] = paid >= price ? 'À jour' : 'Échéance';
    /* « Financé » = un montant, une remise ou au moins un règlement. Sinon (fiche héritée
       laissée telle quelle) on préserve son statut d'origine — pas de bascule fortuite. */
    const financed = price > 0 || remise > 0 || payments.length > 0;
    if (apEditId) {
      setApprenants((prev) => prev.map((a) => {
        if (a.id !== apEditId) return a;
        /* Changement de formation → on réaligne la progression sur le NOUVEAU parcours,
           en conservant les modules dont le nom coïncide (les autres repartent à zéro). */
        let modulesDone = a.modulesDone;
        if (a.formationId !== apForm.formationId) {
          const oldNames = formationModules(a.formationId);
          const done = new Map(oldNames.map((nm, i) => [nm, !!a.modulesDone[i]]));
          modulesDone = formationModules(apForm.formationId).map((nm) => done.get(nm) ?? false);
        }
        return { ...a, name: apForm.name.trim(), formationId: apForm.formationId, priceXof: price, remiseXof: remise || undefined, payments, pay: financed ? derived : a.pay, modulesDone };
      }));
    } else {
      const mods = formationModules(apForm.formationId);
      setApprenants((prev) => [...prev, { id: `ap-${uid()}`, name: apForm.name.trim(), formationId: apForm.formationId, pay: derived, modulesDone: mods.map(() => false), priceXof: price, remiseXof: remise || undefined, payments }]);
      const reste = Math.max(0, price - paid);
      setNote(
        `${apForm.name.trim()} inscrit·e sur « ${formationName(apForm.formationId)} »`
        + (price > 0 ? ` · ${fmtMoney(paid, currency)} réglé${reste > 0 ? ` · reste ${fmtMoney(reste, currency)}` : ' · soldé'}.` : '.'),
      );
    }
    setApForm(null);
  };
  const removeAp = (id: string) => setApprenants((prev) => prev.filter((a) => a.id !== id));
  const toggleModule = (aid: string, idx: number) =>
    setApprenants((prev) => prev.map((a) => {
      if (a.id !== aid) return a;
      const arr = [...a.modulesDone];
      while (arr.length <= idx) arr.push(false); // aligne si la formation a gagné des modules
      arr[idx] = !arr[idx];
      return { ...a, modulesDone: arr };
    }));

  /* — certifications — */
  const openCeNew = () => { setCeEditId(null); setCeForm({ name: '', parcours: formations[0]?.name ?? '', date: '', statut: 'En cours' }); };
  const openCeEdit = (c: Certification) => { setCeEditId(c.id); setCeForm({ name: c.name, parcours: c.parcours, date: c.date, statut: c.statut }); };
  const saveCe = () => {
    if (!ceForm || !ceForm.name.trim()) return;
    if (ceEditId) {
      setCertifs((prev) => prev.map((c) => (c.id === ceEditId ? { ...c, name: ceForm.name.trim(), parcours: ceForm.parcours, date: ceForm.date.trim() || '—', statut: ceForm.statut } : c)));
    } else {
      setCertifs((prev) => [...prev, { id: `ce-${uid()}`, name: ceForm.name.trim(), parcours: ceForm.parcours, date: ceForm.date.trim() || '—', statut: ceForm.statut }]);
    }
    setCeForm(null);
  };
  const removeCe = (id: string) => setCertifs((prev) => prev.filter((c) => c.id !== id));

  /** Sceller un certificat MND — le rendu A4 vit dans l'app Certificat. */
  const sealCertificate = (name: string, parcours: string) => {
    setCertifs((prev) => prev.some((c) => c.name === name && c.parcours === parcours)
      ? prev.map((c) => (c.name === name && c.parcours === parcours ? { ...c, statut: 'Délivrée', date: 'aujourd’hui' } : c))
      : [...prev, { id: `ce-${uid()}`, name, parcours, date: 'aujourd’hui', statut: 'Délivrée' }]);
    setNote(`Certificat scellé pour ${name}, ouvrez l’app Certificat pour l’imprimer / l’envoyer.`);
    setApDetail(null);
    setTab('certifications');
  };

  const detail = apDetail ? apprenants.find((a) => a.id === apDetail) : null;

  /* Lien vers l'app Certificat, pré-remplie du nom et du parcours. L'app lit
     `?apprenant=`, `?parcours=` — et, si la formation existe au catalogue de la
     maison, son niveau et sa durée réels, pour que le certificat porte les vrais
     chiffres plutôt qu'un générique. */
  /* LE DOSSIER OÙ LA VERSION ENREGISTRÉE SE DÉPOSE — 16 septembre 2026.
     « Quand j'enregistre le certificat, je veux que cette dernière version
     soit sur la page de certification » (Yéman). Le lien porte `dossier` :
     l'inscription du Suivi quand la certification en a une (même
     apprenante, même formation), et alors aussi son numéro, sa date et sa
     mention ; sinon la certification elle-même. La copie déposée sous ce
     dossier se relit ici, sous la ligne. */
  type Inscription = { id: string; certificate?: { number: string; mention: 'certifie' | 'excellence'; issuedAt: string } };
  const certHref = (name: string, parcours: string, dossier?: string, inscription?: Inscription) => {
    const p = new URLSearchParams({ apprenant: name, parcours });
    if (dossier) p.set('dossier', dossier);
    if (inscription?.certificate) {
      p.set('numero', inscription.certificate.number);
      p.set('date', inscription.certificate.issuedAt.slice(0, 10));
      p.set('mention', inscription.certificate.mention === 'excellence' ? 'Excellence' : 'Honorable');
    }
    const fo = formations.find((f) => f.name === parcours);
    if (fo) {
      /* L'ACADÉMIE FAIT FOI — 16 septembre 2026. Le certificat imprime la
         durée en lettres et les modules de la formation VIVANTE, pas ceux
         de la semence : une formation retouchée ici se retrouve telle quelle
         sur le papier. */
      p.set('niveau', fo.niveau);
      p.set('duree', dureeDite(fo.dureeSemaines, fo.sessions));
      const competences = competencesDesModules(formationModules(fo.id));
      if (competences) p.set('competences', competences);
    }
    return `${asset('/certificat.html')}?${p.toString()}`;
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Académie · Transmission"
        title="L’Académie."
        sub="Former, suivre, sceller."
        actions={
          <a
            href={asset('/certificat.html')}
            target="_blank"
            rel="noreferrer"
            className="mnd-btn mnd-btn--ghost"
            style={{ textDecoration: 'none' }}
          >
            Ouvrir le Certificat →
          </a>
        }
      />

      <Tabs<Tab>
        tabs={[
          { k: 'formations', l: 'Formations' },
          { k: 'suivi', l: 'Suivi & certification' },
          { k: 'apprenants', l: 'Apprenants' },
          { k: 'certifications', l: 'Certifications' },
          { k: 'referentiel', l: 'Référentiel méthode' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {note && (
        <div className="tre-inline-note" style={{ marginBottom: 16 }}>
          <span className="mark">✦</span><span>{note}</span>
          <button className="tre-link-btn" style={{ marginLeft: 'auto', color: 'var(--ink-soft)' }} onClick={() => setNote(null)}>fermer</button>
        </div>
      )}

      <div className="tr-grid tr-grid--3" style={{ marginBottom: 18 }}>
        <Card filet="copper" style={{ padding: 16 }}><div className="mnd-stat__label">Formations actives</div><div className="mnd-stat__value" style={{ fontSize: 28 }}>{stats.formations}</div></Card>
        <Card filet="indigo" style={{ padding: 16 }}><div className="mnd-stat__label">Apprenants suivis</div><div className="mnd-stat__value" style={{ fontSize: 28 }}>{stats.apprenants}</div></Card>
        <Card filet="indigo" style={{ padding: 16 }}><div className="mnd-stat__label">Certificats délivrés</div><div className="mnd-stat__value" style={{ fontSize: 28 }}>{stats.certifs}</div></Card>
      </div>

      {/* ===== SUIVI & CERTIFICATION ===== */}
      {tab === 'suivi' && <AcademieSuivi />}

      {/* ===== FORMATIONS ===== */}
      {tab === 'formations' && (
        <div>
          <div className="tre-actions-row">
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--hairline)', borderRadius: 2, overflow: 'hidden' }}>
              <button className={`trv-tab-seg ${!showArchived ? 'is-on' : ''}`} style={segStyle(!showArchived)} onClick={() => setShowArchived(false)}>Actives</button>
              <button className={`trv-tab-seg ${showArchived ? 'is-on' : ''}`} style={segStyle(showArchived)} onClick={() => setShowArchived(true)}>Terminées · Archives</button>
            </div>
            {/* DÉBUTANTES OU PROFESSIONNELLES — une candidate se range au premier
                coup d'œil, avant même le prix. */}
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--hairline)', borderRadius: 2, overflow: 'hidden' }}>
              {(['toutes', 'debutante', 'professionnelle'] as const).map((k) => (
                <button key={k} className={`trv-tab-seg ${filtrePublic === k ? 'is-on' : ''}`} style={segStyle(filtrePublic === k)} onClick={() => setFiltrePublic(k)}>
                  {k === 'toutes' ? 'Toutes' : k === 'debutante' ? 'Débutantes' : 'Professionnelles'} · {comptePublic(k)}
                </button>
              ))}
            </div>
            {/* ══ POSER LES NEUF PARCOURS — 6 septembre 2026 ═══════════════
                « Pourrions-nous retrouver toutes les formations de l'Académie
                et les remettre dans le logiciel ? » (Yéman).

                Elles n'étaient pas perdues : elles vivaient EN DUR dans l'app
                du certificat, et ce magasin-ci n'a jamais été rempli — sa
                graine est vide par doctrine, « Maison neuve, coquille vierge ».

                LE GESTE EST À LA MAIN, ET IL LE RESTE. Une graine qui se
                remplirait toute seule poserait neuf formations dans une maison
                qui n'en veut peut-être que trois, et il faudrait les effacer
                une par une. Il ne pose QUE ce qui manque : reposer les neuf sur
                une Académie qui en porte trois en ferait douze. */}
            {aPoser.length > 0 && (
              <Button variant="ghost" onClick={poseLesParcours}>
                Poser les {aPoser.length} parcours de la Maison
              </Button>
            )}
            {aCompleter.length > 0 && (
              <Button variant="ghost" onClick={completeLesFiches}>
                Compléter les fiches de la Maison ({aCompleter.length})
              </Button>
            )}
            <Button variant="copper" onClick={openFoNew}>+ Nouvelle formation</Button>
          </div>

          {activeFormations.length === 0 && (
            <Card className="tre-empty">
              <div className="tre-empty__title">Aucune formation ici.</div>
              <div className="tre-empty__sub">
                {showArchived
                  ? 'Les formations terminées s’archivent ici.'
                  : 'Sans formation, on ne peut inscrire personne : le bouton du Suivi reste fermé. '
                    + 'Posez les parcours de la Maison, ou créez la vôtre.'}
              </div>
            </Card>
          )}

          <div className="tr-grid tr-grid--3" style={{ alignItems: 'start' }}>
            {activeFormations.map((f, idx) => {
              const mods = f.modules && f.modules.length ? f.modules : [];
              return (
                <Card key={f.id} className={`tre-plan ${f.featured ? 'tre-plan--popular' : ''}`}>
                  <div className="tre-reorder" role="group" aria-label="Réordonner la formation">
                    <button type="button" className="tre-reorder__btn" disabled={idx === 0} onClick={() => moveFo(f.id, -1)} title="Remonter" aria-label="Remonter la formation">▲</button>
                    <button type="button" className="tre-reorder__btn" disabled={idx === activeFormations.length - 1} onClick={() => moveFo(f.id, 1)} title="Descendre" aria-label="Descendre la formation">▼</button>
                  </div>
                  {f.public && <PastillePublic pub={f.public} surIndigo={!!f.featured} />}
                  {f.featured
                    ? <span className="tre-plan__tagpop">{f.niveau}</span>
                    : <div className="mnd-eyebrow" style={{ fontSize: 9.5, color: 'var(--copper-700)' }}>{f.niveau}</div>}
                  <div className="tre-plan__name" style={{ marginTop: f.featured ? 6 : 8 }}>{f.name}</div>
                  <div className="tre-plan__line">
                    {f.sessions} séance{f.sessions > 1 ? 's' : ''} · {f.dureeSemaines} semaine{f.dureeSemaines > 1 ? 's' : ''} · {f.demarrage}
                  </div>
                  {/* L'ACCROCHE PASSE DEVANT : elle donne envie, la description dit
                      ce qu'elle apprend, et la fiche dit tout. */}
                  {(f.accroche || f.description) && (
                    <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 8 }}>
                      {f.accroche || f.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '10px 0 4px' }}>
                    {/* UN PRIX À ZÉRO N'EST PAS UN PRIX, c'est un prix qui
                        manque. L'écrire « 0 F » ferait croire à une formation
                        offerte, et quelqu'un finirait par l'annoncer. */}
                    {f.priceXof > 0
                      ? <span className="tre-plan__price">{fmtMoney(f.priceXof, currency)}</span>
                      : <span className="tre-plan__price" style={{ color: 'var(--copper-700)', fontSize: 20 }}>Prix à poser</span>}
                  </div>
                  {f.priceXof > 0 && (
                    <div className="mnd-muted" style={{ fontSize: 11, marginTop: -2 }}>
                      acompte à l’inscription {fmtMoney(depositAmountFor(f.priceXof, f), currency)}
                    </div>
                  )}
                  <div style={{ minHeight: 16, marginTop: 2 }}>
                    <Pill tone={f.places === 'complet' ? 'muted' : 'copper'}>{f.places}</Pill>
                  </div>
                  <div className="tre-plan__divider" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {mods.length > 0
                      ? mods.map((m, i) => {
                          const seances = f.programme?.[i]?.seances;
                          return (
                            <div key={m} className="tre-plan__perk">
                              <span className="mark">✦</span>
                              <span style={{ flex: 1, minWidth: 0 }}>{m}</span>
                              {seances ? (
                                <span style={{ fontSize: 11, opacity: 0.72, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                  {seances} séance{seances > 1 ? 's' : ''}
                                </span>
                              ) : null}
                            </div>
                          );
                        })
                      : <div className="mnd-muted" style={{ fontSize: 12.5, fontStyle: 'italic' }}>Parcours à détailler dans « Modifier ».</div>}
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: 20 }}>
                    <Button size="sm" variant="ghost" style={{ width: '100%', marginBottom: 8 }} onClick={() => setFicheId(f.id)}>Voir le programme</Button>
                    <Button size="sm" variant={f.featured ? 'copper' : 'ghost'} style={{ width: '100%' }} onClick={() => openFoEdit(f)}>Modifier</Button>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10 }}>
                      <button className="tre-link-btn" style={{ color: f.featured ? 'var(--copper-300)' : 'var(--copper-700)' }} onClick={() => toggleArchive(f)}>{f.archived ? 'Réactiver' : 'Archiver'}</button>
                      <button className="tre-link-btn tre-link-btn--danger" onClick={() => removeFo(f)}>Supprimer</button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== APPRENANTS ===== */}
      {tab === 'apprenants' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <Button variant="copper" onClick={openApNew}>+ Nouvel apprenant</Button>
          </div>
          <Card style={{ overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table">
                <thead>
                  <tr><th>Apprenant</th><th>Cursus</th><th>Progression</th><th>Paiement</th><th></th></tr>
                </thead>
                <tbody>
                  {apprenants.map((a) => {
                    const pct = avancementOf(a);
                    return (
                      <tr key={a.id}>
                        <td>
                          <button className="tre-link-btn" onClick={() => setApDetail(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                            <span className="tre-avatar">{a.name.slice(0, 1)}</span>
                            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{a.name}</span>
                          </button>
                        </td>
                        <td className="mnd-muted">{formationName(a.formationId)}</td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Bar pct={pct} />
                            <span className="mnd-muted" style={{ fontSize: 11.5 }}>{pct} %</span>
                          </span>
                        </td>
                        <td>
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                            <Pill tone={payTone(payStatusOf(a))}>{payStatusOf(a)}</Pill>
                            {apprHasFinance(a) && (
                              <span className="mnd-muted" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>
                                {apprDue(a) > 0 ? `reste ${fmtMoney(apprDue(a), currency)}` : `soldé · ${fmtMoney(a.priceXof ?? 0, currency)}`}
                              </span>
                            )}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button className="tre-link-btn" onClick={() => setApDetail(a.id)}>Suivi</button>
                          <button className="tre-link-btn" style={{ marginLeft: 12 }} onClick={() => openApEdit(a)}>Modifier</button>
                          <button className="tre-link-btn tre-link-btn--danger" style={{ marginLeft: 12 }} onClick={() => removeAp(a.id)}>Retirer</button>
                        </td>
                      </tr>
                    );
                  })}
                  {apprenants.length === 0 && (
                    <tr><td colSpan={5} className="mnd-muted" style={{ textAlign: 'center', padding: 32 }}>Aucun apprenant inscrit.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ===== CERTIFICATIONS ===== */}
      {tab === 'certifications' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <Button variant="copper" onClick={openCeNew}>+ Délivrer une certification</Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {certifs.map((c) => {
              const inscription = enrollments.find((e) =>
                sameName(e.learnerName, c.name) && formations.find((f) => f.id === e.formationId)?.name === c.parcours);
              const dossier = inscription?.id ?? `cert-${c.id}`;
              return (
              <Card key={c.id} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 18 }}>
                <span style={{ width: 44, height: 44, borderRadius: 999, flex: 'none', background: c.statut === 'Délivrée' ? 'var(--copper-50)' : 'var(--paper-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={asset("/assets/monograms/mono-copper.png")} alt="" style={{ width: 20, opacity: c.statut === 'Délivrée' ? 1 : 0.4 }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>{c.name}</div>
                  <div className="mnd-muted" style={{ fontSize: 12 }}>{c.parcours}</div>
                  <CopieAuDossier dossier={dossier} compact />
                </div>
                <span className="mnd-muted" style={{ fontSize: 12 }}>{c.date}</span>
                <Pill tone={c.statut === 'Délivrée' ? 'ok' : 'warn'}>{c.statut}</Pill>
                <div style={{ display: 'flex', gap: 12, flex: 'none', alignItems: 'center' }}>
                  <a
                    href={certHref(c.name, c.parcours, dossier, inscription)}
                    target="_blank"
                    rel="noreferrer"
                    className="mnd-btn mnd-btn--indigo mnd-btn--sm"
                    style={{ textDecoration: 'none' }}
                  >
                    Voir / Envoyer
                  </a>
                  <button className="tre-link-btn" onClick={() => openCeEdit(c)}>Modifier</button>
                  <button className="tre-link-btn tre-link-btn--danger" onClick={() => removeCe(c.id)}>Retirer</button>
                </div>
              </Card>
              );
            })}
            {certifs.length === 0 && (
              <Card className="tre-empty"><div className="tre-empty__title">Aucune certification.</div><div className="tre-empty__sub">Délivrez un certificat scellé MND à un parcours achevé.</div></Card>
            )}
          </div>
        </div>
      )}

      {/* ===== RÉFÉRENTIEL ===== */}
      {tab === 'referentiel' && (
        <div>
          <div className="tre-deep" style={{ marginBottom: 18 }}>
            <div>
              <div className="tre-deep__eyebrow">Standard verrouillé · actif transmissible</div>
              <div className="tre-deep__body">Le référentiel méthode garantit le « powered by MND ».</div>
            </div>
          </div>
          <ManuelDesFormatrices />
          <div className="tr-grid tr-grid--2" style={{ alignItems: 'start' }}>
            <RefEditor
              title="Les quatre temps"
              note="Le geste du rituel, et le parcours par défaut de toute nouvelle formation."
              rows={refTemps}
              store={refTempsStore}
              seed={REF_TEMPS_SEED}
              numbered
              namePlaceholder="Nom du temps (ex. Purifier)"
              glossPlaceholder="Le geste en une phrase"
              addLabel="+ Ajouter un temps"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <RefEditor
                title="La logique de palier"
                rows={refPaliers}
                store={refPaliersStore}
                seed={REF_PALIERS_SEED}
                namePlaceholder="Nom du palier"
                glossPlaceholder="Ce qu’il promet"
                addLabel="+ Ajouter un palier"
              />
              <RefEditor
                title="Le lexique ™"
                rows={refLexique}
                store={refLexiqueStore}
                seed={REF_LEXIQUE_SEED}
                namePlaceholder="Terme (ex. VÈKPÈ™)"
                glossPlaceholder="Ce qu’il désigne"
                addLabel="+ Ajouter un terme"
              />
            </div>
          </div>
        </div>
      )}

      {/* ===== SUIVI D'APPRENANT · drawer ===== */}
      {detail && (
        <Modal title={`Suivi · ${detail.name}`} onClose={() => setApDetail(null)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="mnd-muted" style={{ fontSize: 11.5 }}>{formationName(detail.formationId)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <Bar pct={avancementOf(detail)} />
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)', flex: 'none' }}>{avancementOf(detail)} %</span>
            </div>

            {apprHasFinance(detail) && (
              <div className="tre-pay-summary">
                <div className="tre-sec-label" style={{ marginBottom: 10 }}>Formation</div>
                {(detail.remiseXof ?? 0) > 0 && (
                  <div className="tre-pay-recap__line"><span className="mnd-muted">Remise accordée</span><span>− {fmtMoney(detail.remiseXof ?? 0, currency)}</span></div>
                )}
                <div className="tre-pay-recap__line"><span className="mnd-muted">Montant convenu</span><span>{fmtMoney(detail.priceXof ?? 0, currency)}</span></div>
                <div className="tre-pay-recap__line"><span className="mnd-muted">Réglé</span><span>{fmtMoney(apprPaid(detail), currency)}</span></div>
                <div className="tre-pay-recap__line tre-pay-recap__reste"><span>Reste à payer</span><span>{fmtMoney(apprDue(detail), currency)}</span></div>
                {(detail.payments ?? []).length > 0 && (
                  <div className="tre-pay-summary__list">
                    {(detail.payments ?? []).map((p) => (
                      <div key={p.id} className="tre-pay-summary__pay"><span className="mnd-muted">{frShortAn(p.date)}{p.method ? ` · ${p.method}` : ''}</span><span>{fmtMoney(p.amountXof, currency)}</span></div>
                    ))}
                  </div>
                )}
                {apprDue(detail) > 0 && (
                  <Button size="sm" variant="ghost" style={{ marginTop: 12 }} onClick={() => { openApEdit(detail); setApDetail(null); }}>Enregistrer un règlement</Button>
                )}
              </div>
            )}

            <div className="tre-sec-label" style={{ margin: '18px 0 10px' }}>Modules du parcours</div>
            {formationModules(detail.formationId).length === 0 && (
              <div className="mnd-muted" style={{ fontSize: 12, fontStyle: 'italic' }}>Aucun module défini pour cette formation, ajoutez-en dans la fiche formation.</div>
            )}
            {formationModules(detail.formationId).map((name, i) => {
              const done = !!detail.modulesDone[i];
              return (
                <button
                  key={i}
                  onClick={() => toggleModule(detail.id, i)}
                  style={{ cursor: 'pointer', textAlign: 'left', background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, width: '100%' }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: 999, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, background: done ? 'var(--color-copper)' : 'transparent', border: '2px solid var(--color-indigo)', color: 'var(--color-ivoire)' }}>{done ? '✓' : ''}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{String(i + 1).padStart(2, '0')} · {name}</div>
                  </div>
                </button>
              );
            })}
            {(() => { const mods = formationModules(detail.formationId); return mods.length > 0 && mods.every((_, i) => !!detail.modulesDone[i]); })() && (
              <div style={{ marginTop: 12, background: 'var(--color-indigo)', borderRadius: 4, padding: '18px 20px' }}>
                <div className="tre-deep__eyebrow">Parcours achevé · prêt à sceller</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-ivoire)', marginTop: 6 }}>La couronne peut être transmise.</div>
                <Button variant="copper" style={{ marginTop: 16, width: '100%' }} onClick={() => sealCertificate(detail.name, formationName(detail.formationId))}>
                  Délivrer la certification · sceau MND
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ===== MODALES CRUD ===== */}
      {/* ══ LA FICHE DE LA FORMATION — 13 septembre 2026 ═══════════════════
          C'est elle qu'on lit à une candidate au téléphone : pour qui, pour
          entrer, ce qu'elle saura, le programme, la pratique et le prix. Une
          rubrique vide le dit, au lieu de laisser un blanc qu'on prendrait
          pour « rien ». */}
      {ficheId && (() => {
        const f = formations.find((x) => x.id === ficheId);
        if (!f) return null;
        const mods = f.modules ?? [];
        const total = (f.programme ?? []).reduce((n, m) => n + (m.seances ?? 0), 0);
        const manque = <span className="mnd-muted" style={{ fontStyle: 'italic' }}>À écrire dans « Modifier ».</span>;
        const titre = (t: string) => (
          <div className="mnd-eyebrow" style={{ fontSize: 9.5, color: 'var(--copper-700)', marginBottom: 6 }}>{t}</div>
        );
        return (
          <Modal title={`${f.name}.`} onClose={() => setFicheId(null)} width={640}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {f.public && <PastillePublic pub={f.public} />}
                <span className="mnd-muted" style={{ fontSize: 12 }}>
                  {f.niveau} · {f.sessions} séance{f.sessions > 1 ? 's' : ''} · {f.dureeSemaines} semaine{f.dureeSemaines > 1 ? 's' : ''} · {f.demarrage}
                </span>
              </div>
              {f.accroche && (
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 21, lineHeight: 1.35, color: 'var(--color-indigo)' }}>{f.accroche}</div>
              )}
              <div className="tr-grid tr-grid--2" style={{ gap: 16 }}>
                <div>{titre('Pour qui')}<div style={{ fontSize: 13, lineHeight: 1.55 }}>{f.pourQui || manque}</div></div>
                <div>{titre('Pour entrer')}<div style={{ fontSize: 13, lineHeight: 1.55 }}>{f.pourEntrer || manque}</div></div>
              </div>
              <div>
                {titre('À la sortie, elle sait')}
                {f.sait && f.sait.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, lineHeight: 1.55 }}>
                    {f.sait.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                ) : <div style={{ fontSize: 13 }}>{manque}</div>}
              </div>
              <div>
                {titre('Le programme')}
                {mods.length === 0 ? <div style={{ fontSize: 13 }}>{manque}</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {mods.map((m, i) => {
                      const ligne = f.programme?.[i];
                      return (
                        <div key={m} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: '3px 10px', padding: '10px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
                          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-copper)' }}>{ROMAINS[i] ?? i + 1}</span>
                          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)', lineHeight: 1.3 }}>{m}</span>
                          <span className="mnd-muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {ligne?.seances ? `${ligne.seances} séance${ligne.seances > 1 ? 's' : ''}` : ''}
                          </span>
                          {ligne?.contenu && <div style={{ gridColumn: '2 / 4', fontSize: 12.5, lineHeight: 1.55 }}>{ligne.contenu}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {total > 0 && total !== f.sessions && (
                  <div style={{ fontSize: 11.5, color: 'var(--copper-700)', marginTop: 6 }}>
                    Les modules comptent {total} séance{total > 1 ? 's' : ''}, la formation en annonce {f.sessions}.
                  </div>
                )}
              </div>
              <div className="tr-grid tr-grid--2" style={{ gap: 16 }}>
                <div>{titre('Sur têtes réelles')}<div style={{ fontSize: 13, lineHeight: 1.55 }}>{f.tetesReelles || manque}</div></div>
                <div>
                  {titre('Le prix')}
                  <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                    {f.priceXof > 0
                      ? `${fmtMoney(f.priceXof, currency)}, dont ${fmtMoney(depositAmountFor(f.priceXof, f), currency)} d’acompte à l’inscription`
                      : manque}
                  </div>
                </div>
              </div>
              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.6, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
                Chaque module se valide à 70 sur 100, avec un rattrapage. Jury : pratique sur tête 40, oral 30, dossier 30.
                Certifiée à 70, mention Excellence à 85.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="ghost" onClick={() => setFicheId(null)}>Fermer</Button>
                <Button variant="copper" style={{ flex: 1 }} onClick={() => { setFicheId(null); openFoEdit(f); }}>Modifier</Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {foForm && (
        <Modal title={foEditId ? 'La formation.' : 'Nouvelle formation.'} onClose={() => setFoForm(null)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Intitulé de la formation">
              <Input value={foForm.name} onChange={(e) => setFoForm({ ...foForm, name: e.target.value })} placeholder="Ex. Fondations du Lock" />
            </Field>
            <Field label="Pour quel public">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {(['debutante', 'professionnelle'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`tre-chip ${foForm.public === k ? 'is-on' : ''}`}
                    onClick={() => setFoForm((prev) => (prev ? { ...prev, public: k } : prev))}
                  >
                    {k === 'debutante' ? 'Débutante · aucune expérience du métier' : 'Professionnelle · déjà en activité'}
                  </button>
                ))}
              </div>
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Niveau">
                <Select value={foForm.niveau} onChange={(e) => setFoForm({ ...foForm, niveau: e.target.value })}>
                  {FORMATION_NIVEAUX.map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <Field label="Prix (F CFA)">
                <Input inputMode="numeric" value={foForm.price} onChange={(e) => setFoForm({ ...foForm, price: e.target.value })} placeholder="250 000" />
              </Field>
              {/* CE QU'ELLE APPREND, en une phrase. Elle se lit sur la carte,
                  et c'est elle qui fait choisir un parcours plutot qu'un autre :
                  un niveau et un prix ne disent pas ce qu'on y apprend. */}
              <Field label="Ce qu’elle apprend">
                <Input
                  value={foForm.description}
                  onChange={(e) => setFoForm({ ...foForm, description: e.target.value })}
                  placeholder="la reprise de racines, le resserrage de precision…"
                />
              </Field>
            </div>
            {/* ══ L'ACOMPTE, EN FRANCS OU EN POURCENTAGE — 13 septembre 2026 ═══
                « J'aimerais avoir la main pour corriger l'acompte des
                formations » (Yéman). Le pourcentage seul obligeait à calculer
                pour tomber sur un montant rond : 40 % de 450 000 font 180 000,
                mais 50 000 F d'acompte n'avaient pas de pourcentage juste. Le
                montant se relit sous le champ, contre le prix. */}
            <Field label="Acompte à l’inscription">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', border: '1px solid var(--hairline)', borderRadius: 2, overflow: 'hidden' }}>
                  {(['pct', 'xof'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`trv-tab-seg ${foForm.depositMode === k ? 'is-on' : ''}`}
                      style={segStyle(foForm.depositMode === k)}
                      onClick={() => setFoForm((prev) => (prev ? { ...prev, depositMode: k } : prev))}
                    >
                      {k === 'pct' ? 'En pourcentage' : 'En francs'}
                    </button>
                  ))}
                </div>
                {foForm.depositMode === 'pct' ? (
                  <Input inputMode="numeric" value={foForm.deposit} onChange={(e) => setFoForm({ ...foForm, deposit: e.target.value })} placeholder="40" style={{ width: 90 }} aria-label="Acompte en pourcentage" />
                ) : (
                  <Input inputMode="numeric" value={foForm.depositXof} onChange={(e) => setFoForm({ ...foForm, depositXof: e.target.value })} placeholder="60 000" style={{ width: 140 }} aria-label="Acompte en francs" />
                )}
              </div>
              {(() => {
                const prix = parseInt(foForm.price.replace(/[^0-9]/g, ''), 10) || 0;
                const fixe = parseInt(foForm.depositXof.replace(/[^0-9]/g, ''), 10) || 0;
                const pct = Math.max(0, Math.min(100, parseInt(foForm.deposit.replace(/[^0-9]/g, ''), 10) || 0));
                const enFrancs = foForm.depositMode === 'xof' && fixe > 0;
                const montant = depositAmountFor(prix, { depositPct: pct, depositXof: enFrancs ? fixe : undefined } as Formation);
                return (
                  <div className="mnd-muted" style={{ fontSize: 11, marginTop: 5 }}>
                    {prix <= 0
                      ? (enFrancs ? `Acompte de ${fmtMoney(fixe, currency)}, dès que le prix sera posé.` : 'Le montant se calculera quand le prix sera posé.')
                      : `Soit ${fmtMoney(montant, currency)} sur ${fmtMoney(prix, currency)}${enFrancs && fixe > prix ? ', plafonné au prix' : ''}${foForm.depositMode === 'xof' && !enFrancs ? ' (sans montant, le pourcentage s’applique)' : ''}.`}
                  </div>
                );
              })()}
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Nombre de séances">
                <Input inputMode="numeric" value={foForm.sessions} onChange={(e) => setFoForm({ ...foForm, sessions: e.target.value })} />
              </Field>
              <Field label="Durée (semaines)">
                <Input inputMode="numeric" value={foForm.duree} onChange={(e) => setFoForm({ ...foForm, duree: e.target.value })} />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Démarrage">
                <Input value={foForm.demarrage} onChange={(e) => setFoForm({ ...foForm, demarrage: e.target.value })} placeholder="démarre 8 juil" />
              </Field>
              <Field label="Places">
                <Input value={foForm.places} onChange={(e) => setFoForm({ ...foForm, places: e.target.value })} placeholder="4 places / complet" />
              </Field>
            </div>
            <Field label="L’accroche · une phrase pour la carte">
              <Input value={foForm.accroche} onChange={(e) => setFoForm({ ...foForm, accroche: e.target.value })} placeholder="Poser les gestes justes avant d’aller vite…" />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Pour qui">
                <Textarea value={foForm.pourQui} onChange={(e) => setFoForm({ ...foForm, pourQui: e.target.value })} rows={3} />
              </Field>
              <Field label="Pour entrer">
                <Textarea value={foForm.pourEntrer} onChange={(e) => setFoForm({ ...foForm, pourEntrer: e.target.value })} rows={3} />
              </Field>
            </div>
            <Field label="À la sortie, elle sait · un savoir par ligne">
              <Textarea value={foForm.sait} onChange={(e) => setFoForm({ ...foForm, sait: e.target.value })} rows={4} />
            </Field>
            <Field label="Modules du parcours">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {foForm.modules.map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) 78px auto auto', gap: 8, alignItems: 'center' }}>
                    <span className="mnd-muted" style={{ fontSize: 12, textAlign: 'right' }}>{i + 1}</span>
                    <Input
                      value={m.nom}
                      onChange={(e) => majModule(i, { nom: e.target.value })}
                      placeholder="Nom du module (ex. Purifier)"
                    />
                    <Input
                      inputMode="numeric"
                      value={m.seances}
                      onChange={(e) => majModule(i, { seances: e.target.value.replace(/[^0-9]/g, '') })}
                      placeholder="séances"
                      aria-label={`Séances du module ${i + 1}`}
                      style={{ textAlign: 'right' }}
                    />
                    <span style={{ display: 'flex', gap: 3 }}>
                      <button type="button" className="tre-reorder__btn" disabled={i === 0} onClick={() => deplaceModule(i, -1)} title="Monter" aria-label={`Monter le module ${i + 1}`}>▲</button>
                      <button type="button" className="tre-reorder__btn" disabled={i === foForm.modules.length - 1} onClick={() => deplaceModule(i, 1)} title="Descendre" aria-label={`Descendre le module ${i + 1}`}>▼</button>
                    </span>
                    <button
                      type="button"
                      aria-label="Retirer le module"
                      className="tre-link-btn tre-link-btn--danger"
                      style={{ flex: 'none' }}
                      onClick={() => setFoForm((prev) => (prev ? { ...prev, modules: prev.modules.filter((_, j) => j !== i) } : prev))}
                    >
                      ✕
                    </button>
                    <Textarea
                      value={m.contenu}
                      onChange={(e) => majModule(i, { contenu: e.target.value })}
                      placeholder="Ce qu’on y apprend, ce qu’on y pratique"
                      rows={2}
                      style={{ gridColumn: '2 / 6', minHeight: 56 }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="tre-chip"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => setFoForm((prev) => (prev ? { ...prev, modules: [...prev.modules, moduleVide()] } : prev))}
                >
                  + Ajouter un module
                </button>
                <span className="mnd-muted" style={{ fontSize: 11, fontStyle: 'italic' }}>
                  Chaque formation a ses propres étapes, l'avancement des apprenant·e·s s'y aligne.
                </span>
                {(() => {
                  const somme = foForm.modules.reduce((n, x) => n + (parseInt(x.seances, 10) || 0), 0);
                  const annonce = parseInt(foForm.sessions, 10) || 0;
                  return somme > 0 ? (
                    <span style={{ fontSize: 11, color: somme === annonce ? 'var(--ink-soft)' : 'var(--copper-700)' }}>
                      Les modules comptent {somme} séance{somme > 1 ? 's' : ''} sur {annonce} annoncée{annonce > 1 ? 's' : ''}.
                    </span>
                  ) : null;
                })()}
              </div>
            </Field>
            <Field label="Sur têtes réelles">
              <Input value={foForm.tetesReelles} onChange={(e) => setFoForm({ ...foForm, tetesReelles: e.target.value })} placeholder="trois rituels d’entretien au salon, en observation puis assistée" />
            </Field>
            <Field label="Mise en avant">
              <button
                type="button"
                className={`tre-chip ${foForm.featured ? 'is-on' : ''}`}
                onClick={() => setFoForm((prev) => (prev ? { ...prev, featured: !prev.featured } : prev))}
              >
                {foForm.featured ? '★ Formation vedette' : '☆ Mettre en vedette'}
              </button>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                La formation vedette s’affiche sur une carte indigo mise en avant. Une seule à la fois : l’activer retire la mise en avant des autres.
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setFoForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveFo} disabled={!foForm.name.trim() || !foForm.public}>{foEditId ? 'Enregistrer' : 'Créer la formation'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {apForm && ((f: ApprenantForm) => {
        const apGross = digits(f.priceInput);
        const apRemise = Math.min(apGross, digits(f.remiseInput));
        const apNet = Math.max(0, apGross - apRemise);
        const apAlready = f.payments.reduce((s, p) => s + p.amountXof, 0);
        const apThis = f.payMode === 'integral' ? Math.max(0, apNet - apAlready) : f.payMode === 'partiel' ? digits(f.amountInput) : 0;
        const apReste = Math.max(0, apNet - (apAlready + apThis));
        return (
        <Modal title={apEditId ? 'L’apprenant·e.' : 'Nouvel apprenant.'} onClose={() => setApForm(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom de l’apprenant·e">
              <Input value={f.name} onChange={(e) => setApForm({ ...f, name: e.target.value })} placeholder="Prénom Nom" />
            </Field>
            <Field label="Formation">
              <Select
                value={f.formationId}
                onChange={(e) => {
                  const fid = e.target.value;
                  setApForm({ ...f, formationId: fid, ...(apEditId ? {} : { priceInput: formationPrice(fid) ? String(formationPrice(fid)) : '' }) });
                }}
              >
                {formations.map((fo) => <option key={fo.id} value={fo.id}>{fo.name}{fo.archived ? ' · archivée' : ''}</option>)}
              </Select>
            </Field>

            <div className="tr-grid tr-grid--2">
              <Field label="Montant de la formation (F CFA)">
                <Input inputMode="numeric" value={f.priceInput} onChange={(e) => setApForm({ ...f, priceInput: e.target.value })} placeholder="Ex. 250 000" />
              </Field>
              <Field label="Remise accordée (F CFA)">
                <Input inputMode="numeric" value={f.remiseInput} onChange={(e) => setApForm({ ...f, remiseInput: e.target.value })} placeholder="0" />
              </Field>
            </div>

            {f.payments.length > 0 && (
              <div className="mnd-muted" style={{ fontSize: 12, marginTop: -6 }}>
                Déjà réglé : {fmtMoney(apAlready, currency)}{apNet > 0 && <> · reste {fmtMoney(Math.max(0, apNet - apAlready), currency)}</>}
              </div>
            )}

            <Field label={f.payments.length > 0 ? 'Enregistrer un règlement' : 'Règlement à l’inscription'}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([['integral', 'Intégral'], ['partiel', 'Partiel'], ['aucun', f.payments.length > 0 ? 'Aucun ajout' : 'Plus tard']] as [PayMode, string][]).map(([m, label]) => (
                  <button key={m} type="button" className={`tre-chip ${f.payMode === m ? 'is-on' : ''}`} onClick={() => setApForm({ ...f, payMode: m })}>{label}</button>
                ))}
              </div>
            </Field>

            {f.payMode === 'partiel' && (
              <div className="tr-grid tr-grid--2">
                <Field label="Montant réglé (F CFA)">
                  <Input inputMode="numeric" value={f.amountInput} onChange={(e) => setApForm({ ...f, amountInput: e.target.value })} placeholder="Ex. 100 000" />
                </Field>
                <Field label="Date du règlement">
                  <ChampDeDate compact sens="arriere" value={f.payDate} onChange={(iso) => setApForm({ ...f, payDate: iso })} />
                </Field>
                <Field label="Mode de paiement">
                  <Select value={f.payMethod} onChange={(e) => setApForm({ ...f, payMethod: e.target.value as PaymentMethod })}>
                    {payMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
              </div>
            )}
            {f.payMode === 'integral' && (
              <div className="tr-grid tr-grid--2">
                <Field label="Montant réglé">
                  <Input value={fmtMoney(apThis, currency)} readOnly disabled />
                </Field>
                <Field label="Date du règlement">
                  <ChampDeDate compact sens="arriere" value={f.payDate} onChange={(iso) => setApForm({ ...f, payDate: iso })} />
                </Field>
                <Field label="Mode de paiement">
                  <Select value={f.payMethod} onChange={(e) => setApForm({ ...f, payMethod: e.target.value as PaymentMethod })}>
                    {payMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
              </div>
            )}

            {apGross > 0 && (
              <div className="tre-pay-recap">
                <div className="tre-pay-recap__line"><span className="mnd-muted">Formation</span><span>{fmtMoney(apGross, currency)}</span></div>
                {apRemise > 0 && (
                  <div className="tre-pay-recap__line"><span className="mnd-muted">Remise</span><span>− {fmtMoney(apRemise, currency)}</span></div>
                )}
                {f.payMode !== 'aucun' && apThis > 0 && (
                  <div className="tre-pay-recap__line"><span className="mnd-muted">Ce règlement</span><span>{fmtMoney(apThis, currency)}</span></div>
                )}
                <div className="tre-pay-recap__line tre-pay-recap__reste"><span>Reste à payer</span><span>{fmtMoney(apReste, currency)}</span></div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setApForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveAp} disabled={!f.name.trim()}>{apEditId ? 'Enregistrer' : 'Inscrire l’apprenant·e'}</Button>
            </div>
          </div>
        </Modal>
        );
      })(apForm)}

      {ceForm && (
        <Modal title={ceEditId ? 'La certification.' : 'Délivrer une certification.'} onClose={() => setCeForm(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom du·de la certifié·e">
              <Input value={ceForm.name} onChange={(e) => setCeForm({ ...ceForm, name: e.target.value })} placeholder="Prénom Nom" />
            </Field>
            <Field label="Parcours">
              <Select value={ceForm.parcours} onChange={(e) => setCeForm({ ...ceForm, parcours: e.target.value })}>
                {formations.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </Select>
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Date · jury">
                <Input value={ceForm.date} onChange={(e) => setCeForm({ ...ceForm, date: e.target.value })} placeholder="12 mars 2026" />
              </Field>
              <Field label="Statut">
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['Délivrée', 'En cours'] as Certification['statut'][]).map((s) => (
                    <button key={s} className={`tre-chip ${ceForm.statut === s ? 'is-on' : ''}`} onClick={() => setCeForm({ ...ceForm, statut: s })}>{s}</button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5, fontStyle: 'italic' }}>Le certificat A4 (sceau MND, PDF, WhatsApp / email) se compose dans l’app Certificat.</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setCeForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveCe} disabled={!ceForm.name.trim()}>{ceEditId ? 'Enregistrer' : 'Délivrer, sceau MND'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Éditeur d'une section du référentiel ----------
   Trois sections, une même forme (nom + glose) : un seul éditeur les gère toutes.
   La numérotation des « quatre temps » se lit de la position (`numbered`) — ajouter,
   retirer ou réordonner ne renumérote donc jamais à la main. */
function RefEditor({
  title, note, rows, store, seed, numbered, namePlaceholder, glossPlaceholder, addLabel,
}: {
  title: string;
  note?: string;
  rows: RefEntry[];
  store: Store<RefEntry[]>;
  seed: RefEntry[];
  numbered?: boolean;
  namePlaceholder: string;
  glossPlaceholder: string;
  addLabel: string;
}) {
  const setField = (i: number, field: keyof RefEntry, v: string) =>
    store.set((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: v } : r)));
  const move = (i: number, dir: -1 | 1) =>
    store.set((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const del = (i: number) => store.set((prev) => prev.filter((_, j) => j !== i));
  const add = () => store.set((prev) => [...prev, { n: '', g: '' }]);
  const reset = () => {
    if (window.confirm(`Rétablir « ${title} » au standard MND ? Vos modifications de cette section seront remplacées.`)) {
      store.set(() => seed.map((r) => ({ ...r })));
    }
  };

  return (
    <Card style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: note ? 4 : 14 }}>
        <div className="tre-sec-label" style={{ margin: 0 }}>{title}</div>
        <button className="tre-link-btn" style={{ color: 'var(--copper-700)' }} onClick={reset} title="Rétablir le standard MND">Rétablir</button>
      </div>
      {note && <div className="mnd-muted" style={{ fontSize: 11.5, fontStyle: 'italic', marginBottom: 14 }}>{note}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r, i) => (
          <div key={i} className="tre-ref-row">
            {numbered && <span className="tre-ref-no">{String(i + 1).padStart(2, '0')}</span>}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <Input value={r.n} onChange={(e) => setField(i, 'n', e.target.value)} placeholder={namePlaceholder} style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }} />
              <Input value={r.g} onChange={(e) => setField(i, 'g', e.target.value)} placeholder={glossPlaceholder} style={{ fontSize: 12 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 'none' }}>
              <button className="tre-ref-ctl" disabled={i === 0} onClick={() => move(i, -1)} title="Monter" aria-label="Monter">▲</button>
              <button className="tre-ref-ctl" disabled={i === rows.length - 1} onClick={() => move(i, 1)} title="Descendre" aria-label="Descendre">▼</button>
              <button className="tre-ref-ctl tre-ref-ctl--danger" onClick={() => del(i)} title="Retirer" aria-label="Retirer">✕</button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="mnd-muted" style={{ fontSize: 12, fontStyle: 'italic' }}>Section vide, ajoutez une première entrée.</div>}
      </div>
      <button className="tre-chip" style={{ marginTop: 12 }} onClick={add}>{addLabel}</button>
    </Card>
  );
}

/* ══ LE MANUEL DES FORMATRICES — 13 septembre 2026 ═════════════════════
   « Ranger ce contenu dans la base privée de Supabase, pas dans le code »
   (Yéman). Le manuel entre ici par un FICHIER que la Maison garde, et part
   dans la table `manuel_formatrices` (migration 0088), personnel seulement.
   Rien de son contenu n'est écrit dans le code, qui est public.

   L'IMPORT EST RÉSERVÉ À LA DIRECTION (souverain, gérant) : il remplace le
   manuel d'une formation pour toutes les formatrices à la fois. Il se lit
   d'abord (`lisLeManuel`) : un fichier illisible n'écrit rien, et ce qui ne
   colle pas au programme s'annonce avant la confirmation. */
function ManuelDesFormatrices() {
  const [manuels] = useManuel();
  const moi = useMonProfil();
  const peutImporter = peutEcrireLeManuel(moi?.role);
  const peutEcrire = peutImporter;
  const fichier = useRef<HTMLInputElement>(null);
  /* La formation dont le manuel est ouvert, en correction ou en lecture. */
  const [ouvert, setOuvert] = useState<string | null>(null);

  /* UNE COPIE DE SAUVEGARDE, À LA DEMANDE. Le manuel vit dans la base ; cette
     copie est pour la Maison, qui la garde où elle veut. Elle se réimporte
     telle quelle. */
  const exporte = () => {
    const d = new Date();
    const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const formations: Record<string, Omit<typeof manuels[number], 'id'>> = {};
    for (const { id, ...reste } of manuels) formations[id] = reste;
    const blob = new Blob([JSON.stringify({
      version: 1, exporteLe: jour,
      avertissement: 'Confidentiel · manuel des formatrices de l’Académie MND. Ne pas diffuser.',
      formations,
    }, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manuel-formatrices-mnd-${jour}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importe = async (f: File) => {
    let brut: unknown;
    try {
      brut = JSON.parse(await f.text());
    } catch {
      window.alert('Ce fichier ne se lit pas : ce n’est pas un manuel au format attendu (.json).');
      return;
    }
    const d = new Date();
    const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const lu = lisLeManuel(brut, jour);
    if (lu.erreurs.length) {
      window.alert(`Le manuel n’a pas été importé :\n\n${lu.erreurs.join('\n')}`);
      return;
    }
    const seances = lu.manuels.reduce((n, m) => n + m.seances.length, 0);
    const remplaces = lu.manuels.filter((m) => manuels.some((x) => x.id === m.id)).length;
    const lignes = [
      `Importer le manuel : ${lu.manuels.length} formation${lu.manuels.length > 1 ? 's' : ''}, ${seances} séances ?`,
      remplaces > 0 ? `${remplaces} manuel${remplaces > 1 ? 's' : ''} déjà présent${remplaces > 1 ? 's' : ''} ser${remplaces > 1 ? 'ont' : 'a'} remplacé${remplaces > 1 ? 's' : ''}.` : '',
      'Il sera rangé dans la base privée, visible du personnel seulement.',
    ].filter(Boolean);
    if (lu.alertes.length) lignes.push('', 'À savoir :', ...lu.alertes);
    if (!window.confirm(lignes.join('\n'))) return;
    manuelStore.set((prev) => [...prev.filter((x) => !lu.manuels.some((m) => m.id === x.id)), ...lu.manuels]);
    toast(`Manuel importé : ${lu.manuels.length} formation${lu.manuels.length > 1 ? 's' : ''}, ${seances} séances.`);
  };

  return (
    <Card style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <div className="mnd-eyebrow" style={{ fontSize: 9.5, color: 'var(--copper-700)' }}>Confidentiel · personnel seulement</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)', marginTop: 4 }}>Le manuel des formatrices</div>
          <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 6, maxWidth: '64ch' }}>
            Le plan de chaque séance, affiché dans la fiche de séance du Suivi. Il vit dans la base privée de la Maison, jamais dans le code du Trône.
            La direction le corrige ici, séance par séance ; le personnel le lit. Un fichier s’importe, ou s’exporte pour la sauvegarde.
          </div>
        </div>
        {peutImporter && (
          <>
            <input
              ref={fichier}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                ev.target.value = '';
                if (f) void importe(f);
              }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="ghost" onClick={() => fichier.current?.click()}>Importer un fichier</Button>
              {manuels.length > 0 && <Button variant="ghost" onClick={exporte}>Exporter une copie</Button>}
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
        {PARCOURS_MND.map((p, i) => {
          const m = manuels.find((x) => x.id === p.id);
          const n = m?.seances.length ?? 0;
          return (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--hairline)' : 'none', fontSize: 13 }}>
              <span>{p.titre} <span className="mnd-muted" style={{ fontSize: 11.5 }}>· {PUBLIC_LABEL[p.public]}</span></span>
              <span style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: !m ? 'var(--copper-700)' : n === p.seances ? 'var(--ink-soft)' : 'var(--copper-700)' }}>
                  {m
                    ? `${n} / ${p.seances} séances${m.modifieLe ? ` · corrigé le ${frShortAn(m.modifieLe)}` : m.importeLe ? ` · importé le ${frShortAn(m.importeLe)}` : ''}`
                    : 'pas encore écrit'}
                </span>
                {(peutEcrire || m) && (
                  <button type="button" className="tre-link-btn" onClick={() => setOuvert(p.id)}>
                    {peutEcrire ? (m ? 'Corriger' : 'Écrire') : 'Lire'}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {ouvert && <ManuelEditeur key={ouvert} id={ouvert} lectureSeule={!peutEcrire} onClose={() => setOuvert(null)} />}
    </Card>
  );
}

/* LA PASTILLE DU PUBLIC — 13 septembre 2026. Le cuivre pour la débutante, qui
   entre dans le métier ; l'indigo pour la professionnelle, déjà en place. Sur la
   carte vedette, déjà indigo, elle passe au trait cuivre pour rester lisible. */
function PastillePublic({ pub, surIndigo = false }: { pub: PublicDeFormation; surIndigo?: boolean }) {
  const pro = pub === 'professionnelle';
  const style: React.CSSProperties = {
    display: 'inline-block', alignSelf: 'flex-start', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase',
    fontWeight: 500, borderRadius: 3, padding: '3px 8px', lineHeight: 1.4, marginBottom: 6,
    border: `1px solid ${pro && !surIndigo ? 'var(--color-indigo)' : 'var(--copper-300)'}`,
    background: pro && !surIndigo ? 'var(--color-indigo)' : 'transparent',
    color: pro && !surIndigo ? 'var(--color-ivoire)' : surIndigo ? 'var(--copper-300)' : 'var(--copper-700)',
  };
  return <span style={style}>{PUBLIC_LABEL[pub]}</span>;
}

function segStyle(on: boolean): React.CSSProperties {
  return {
    cursor: 'pointer', background: 'none', border: 'none', borderBottom: `2px solid ${on ? 'var(--color-copper)' : 'transparent'}`,
    padding: '9px 14px', fontFamily: 'var(--font-sans)', fontSize: 11, color: on ? 'var(--color-indigo)' : 'var(--ink-soft)',
  };
}
