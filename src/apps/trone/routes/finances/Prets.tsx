/* LES PRÊTS — leur propre écran, 23 août 2026.

   « Les prêts sont des mouvements qui n'ont rien à voir avec Foyer des
   clients, compte famille, et les avoirs. Retire-les de là et crée-leur un
   onglet à part. » Elle a raison, et le rangement était de moi : les prêts
   sont nés sous Comptes & Avoirs parce que la dette et l'avoir se ressemblent
   de loin. De près, tout les sépare. Un avoir est de l'argent que la MAISON
   DOIT à une cliente, porté par un compte client ; un prêt est de l'argent
   qu'ON DOIT À LA MAISON, et l'emprunteur n'est pas forcément une cliente —
   un membre de l'équipe, un associé, un tiers, le foyer.

   PUIS : « Crée-moi une gestion sans faille. » Maquette validée
   (`public/maquette-les-prets.html`). L'écran ne faisait que CONSTATER — ce
   qui est sorti, ce qui est rentré. Il lui manquait la seule chose qui permet
   de réclamer : QUAND l'argent doit revenir. Le calcul vit dans `foyer.ts`
   (`etatsDesEmprunteurs`), éprouvé par `verifie-foyer` ; cet écran ne fait que
   le montrer, dans l'ordre de l'urgence. */

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import {
  useCashboxes, usePaymentMethods, moyensAOffrir,
  /* Ce que la Maison doit — 11 septembre 2026. */
  useEmprunts, detteDeLaMaison, empruntSolde, echeancesDeLEmprunt, resteDuDeLEmprunt,
  poseUnEmprunt, rendUneEcheance, defaitUneEcheance, type Emprunt,
} from '../../../../shared/finance';
import { useClients } from '../../../../shared/clients';
import { signeLeMessage } from '../../../../shared/identite';
import {
  usePrets, detteEnCours, etatsDesEmprunteurs, parUrgence, joursEntre,
  retenueDeLaPart, partDeLaRetenue, partPourDuree, projectionDeLaRetenue, retenuePrevueDuMois, moisDecale,
  type EtatEmprunteur, type GenreEmprunteur, type Pret,
} from '../../../../shared/foyer';
import { useStaff } from '../equipe/data';
import { usePayrollParameters, parametersFor, computePay, plafondDeLaRetenue, periodeLisible } from '../equipe/payroll';
import { ouvreLesLettresDuPret } from './lettres-du-pret';
import { identiteDuPersonnel, imageDuCoffre } from '../../../../shared/engagements-coffre';
import { ClientPicker } from '../clients/_shared';
import {
  ContrepartieMaison, montantsDuTiroir, libelleDuMontant, nettoieLeMontant,
  useCaissesOuvertes, EcranVerrouille, ReglerLeVerrou, CLE_PRETS,
} from './tiroirs';
import { useSettings, settingsStore } from '../../../../shared/settings';
import { todayISO, fmtDay } from './_shared';
import { addDaysISO, frJourAn } from '../clients/_shared';
import { LesObjectifs } from './objectifs';
import './finances.css';
import { ChampDeDate, ChampDeMois } from '../../../../ds/dates';
import { cheminDeLaConversation } from '../../../../shared/conversations';

/** Le genre d'un emprunteur, en français — ce que l'œil lit sur la carte. */
const LIBELLE_GENRE: Record<GenreEmprunteur, string> = {
  foyer: 'foyer', associe: 'associé', equipe: 'équipe', cliente: 'cliente', tiers: 'tiers',
};

/* UNE SEULE PORTE POUR LE JOUR — 12 septembre 2026. Chaque écran des Finances
   portait sa propre mise en forme, identique à `fmtDay` à l'année près :
   quand l'année y a été ajoutée, ces copies ne l'ont pas vue, parce qu'elles
   ne lisaient pas la même fonction. Deux écritures pour une notion, la
   maladie habituelle. */
const frJour = (iso: string): string => (iso ? fmtDay(iso) : '—');

const frLong = (iso: string): string =>
  (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

/** « dans 13 jours », « en retard de 8 jours », « aujourd'hui ». */
const delai = (aujourdhui: string, date: string): string => {
  const j = joursEntre(aujourdhui, date);
  if (j === 0) return "aujourd'hui";
  if (j > 0) return `dans ${j} jour${j > 1 ? 's' : ''}`;
  return `en retard de ${-j} jour${-j > 1 ? 's' : ''}`;
};

type Filtre = 'retard' | 'proche' | 'cours' | 'sans' | 'soldes';

/** « 20 % », « 35,7 % » : une part du salaire se lit à la décimale près. */
const pctDit = (n: number): string => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

/** Le mois du prochain bulletin : la première retenue proposée par défaut. */
const moisSuivant = (): string => moisDecale(todayISO().slice(0, 7), 1);

export default function Prets() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [staff] = useStaff();
  const aujourdhui = todayISO();

  /* ── LE VERROU DE L’ÉCRAN — 23 août 2026 ──────────────────────────
     Troisième écran à le demander, après les caisses et le coffre : ce que
     la Maison doit à la Maison ne regarde pas plus la salle que ses tiroirs.
     Même pièce partagée, aucun verrou recopié. Sans code posé, la porte reste
     ouverte — une mise à jour ne doit enfermer personne dehors. */
  const [reglages] = useSettings();
  const ouvertesIci = useCaissesOuvertes();
  const ecranVerrouille = !!reglages.codePretsHash && !ouvertesIci.has(CLE_PRETS);
  const [verrouOuvert, setVerrouOuvert] = useState(false);

  /* ── DEUX REGISTRES SUR UN MÊME ÉCRAN — 23 août 2026 ──────────────
     « Les objectifs devraient aller dans l’onglet des prêts, car il y a des
     apports et des remboursements qui se font à ce niveau. » Un prêt et un
     objectif sont la même figure : une cible, des mouvements dans le temps,
     un reste à faire. L argent, lui, ne déménage pas — un objectif flèche
     toujours ce qui dort au coffre. Seul l’endroit où on le lit a changé.

     LE COFFRE Y RENVOIE par `?onglet=objectifs` : arriver sur le bon onglet
     vaut mieux qu’arriver à côté et devoir chercher. */
  const [params, setParams] = useSearchParams();
  const [registre, setRegistre] = useState<'prets' | 'doit' | 'objectifs'>(
    params.get('onglet') === 'objectifs' ? 'objectifs' : 'prets',
  );
  const choisirLeRegistre = (k: 'prets' | 'doit' | 'objectifs') => {
    setRegistre(k);
    /* Le paramètre s’efface : recharger ne doit pas ramener un onglet qu’on
       vient de quitter. */
    if (params.get('onglet')) { const p2 = new URLSearchParams(params); p2.delete('onglet'); setParams(p2, { replace: true }); }
  };

  const [prets, setPrets] = usePrets();
  /* LE SALAIRE DE CHACUN, pour chiffrer la part retenue (18 septembre). Le
     module des prêts ne lit pas l'équipe : c'est l'écran qui la lui prête. */
  const etats = useMemo(
    () => etatsDesEmprunteurs(prets, branch.id, aujourdhui, ({ personneId, nom }) =>
      staff.find((m) => m.id === personneId || m.name.trim().toLowerCase() === nom.toLowerCase())?.salaireXof ?? 0,
    ).sort(parUrgence),
    [prets, branch.id, aujourdhui, staff],
  );
  const dette = detteEnCours(prets, branch.id);
  const [emprunts] = useEmprunts();
  const notreDette = detteDeLaMaison(emprunts, branch.id);

  /* LES QUATRE CHIFFRES. Trois informent, un seul alarme — celui du retard.
     Les mettre au même niveau, c'est n'en signaler aucun. */
  const vivants = etats.filter((e) => e.reste > 0);
  const totalPrete = vivants.reduce((n, e) => n + e.prete, 0);
  const totalRembourse = etats.reduce((n, e) => n + e.rembourse, 0);
  const enRetard = vivants.filter((e) => e.retardJours > 0);
  const montantEnRetard = enRetard.reduce(
    (n, e) => n + e.attendus.filter((a) => a.date < aujourdhui).reduce((s, a) => s + a.montantXof, 0), 0,
  );
  const proches = vivants.filter((e) => e.retardJours === 0 && e.prochaine
    && joursEntre(aujourdhui, e.prochaine.date) <= 15);
  const sansDate = vivants.filter((e) => e.sansEcheance);
  const soldes = etats.filter((e) => e.reste <= 0);

  const [filtre, setFiltre] = useState<Filtre>('cours');
  const listeDe = (f: Filtre): EtatEmprunteur[] => (
    f === 'retard' ? enRetard
      : f === 'proche' ? proches
        : f === 'sans' ? sansDate
          : f === 'soldes' ? soldes
            : vivants);
  const liste = listeDe(filtre);

  /* ── Poser, corriger, effacer une ligne ── */
  const [pretOuvert, setPretOuvert] = useState(false);
  /* LA RETENUE TAPÉE EN FRANCS, le temps de la frappe (19 septembre 2026) :
     tant qu'on tape, le champ garde ce qu'on écrit ; ensuite il redit le
     montant que la part retient. `null` = on ne tape pas. */
  const [retenueTapee, setRetenueTapee] = useState<string | null>(null);
  const [pretEdite, setPretEdite] = useState<Pret | null>(null);
  const [moyensPose] = usePaymentMethods();
  const [fPret, setFPret] = useState({
    type: 'pret' as 'pret' | 'remboursement',
    genre: 'equipe' as GenreEmprunteur,
    nom: '', personneId: '', motif: '', montant: '',
    cashbox: '', method: 'Espèces', date: todayISO(), enDevise: '',
    /* « Quand doit-il revenir ? » — le champ qui manquait. */
    retour: 'salaire' as 'sans' | 'une' | 'plusieurs' | 'salaire',
    echeance: '', nombre: '3', premier: '',
    retenue: '',
    /* LA RETENUE EN PART DU SALAIRE — 18 septembre 2026. On règle un levier,
       la part ou la durée ; le Trône calcule l'autre. */
    levier: 'part' as 'part' | 'duree', part: '20', duree: '10', premierMois: moisSuivant(),
  });

  const corrigerLePret = (p: Pret) => {
    /* Un prêt d'équipe d'avant ne porte parfois que le nom : on retrouve
       la fiche, sans quoi la part du salaire ne pourrait pas se calculer. */
    const fiche = p.personneId ?? (p.genre === 'equipe'
      ? staff.find((m) => m.branchId === branch.id && m.name.trim().toLowerCase() === p.associe.trim().toLowerCase())?.id
      : undefined);
    setFPret({
      type: p.type,
      genre: (p.genre ?? 'tiers') as GenreEmprunteur,
      nom: p.associe, personneId: fiche ?? '',
      motif: p.motif ?? '',
      cashbox: p.cashbox ?? '', method: p.method ?? 'Espèces', date: p.date.slice(0, 10),
      montant: p.fx ? String(p.fx.amount) : String(p.amountXof),
      enDevise: p.fx ? String(p.amountXof) : '',
      retour: p.retenue ? 'salaire' : p.echeancier ? 'plusieurs' : p.echeance ? 'une' : 'sans',
      echeance: p.echeance ?? '',
      nombre: String(p.echeancier?.nombre ?? 3),
      premier: p.echeancier?.premier ?? '',
      retenue: p.retenueXof ? String(p.retenueXof) : '',
      levier: 'part',
      part: p.retenue ? String(p.retenue.partPct) : '20',
      duree: '10',
      premierMois: p.retenue?.premierMois ?? moisSuivant(),
    });
    setPretEdite(p);
  };
  const effacerLePret = () => {
    if (!pretEdite) return;
    setPrets((prev) => prev.filter((x) => x.id !== pretEdite.id));
    setPretEdite(null);
  };
  /* ENCAISSER UN REMBOURSEMENT part de l'emprunteur, pré-rempli du reste dû :
     le geste le plus fréquent ne doit pas demander de retaper un nom. */
  const encaisserPour = (e: EtatEmprunteur) => {
    setFPret((f) => ({
      ...f,
      type: 'remboursement', genre: e.genre, nom: e.nom, personneId: e.personneId ?? '',
      motif: 'Remboursement', montant: String(e.prochaine?.montantXof ?? e.reste),
      enDevise: '', date: todayISO(),
      retour: 'sans', echeance: '', premier: '', retenue: '',
    }));
    setPretEdite(null);
    setPretOuvert(true);
  };

  const [toutesCaisses] = useCashboxes();
  const caissesMaison = toutesCaisses.filter((c) => c.branchId === branch.id);
  const caisseDuPret = caissesMaison.find((c) => c.name === fPret.cashbox);
  const montantsPret = montantsDuTiroir(caisseDuPret, currency, fPret.montant, fPret.enDevise);

  /* ══ LA RETENUE EN PART DU SALAIRE — 18 septembre 2026 ═══════════════
     Maquette `maquette-la-retenue-sur-salaire.html`, validée, quatre
     arbitrages. Montant prêté = retenue × nombre de mois : on règle la part
     OU la durée, le Trône calcule l'autre et montre les deux côte à côte,
     pour que chacun sache ce qu'il signe. Le plafond se juge sur le NET
     HABITUEL (salaire de base et prime, après CNSS et ITS, sans commission) :
     le même juge qu'au bulletin, sinon le formulaire laisserait passer un
     prêt que chaque bulletin réduirait ensuite. Les retenues des autres prêts
     du membre comptent dans le plafond. */
  const [versionsPaie] = usePayrollParameters();
  const equipeIci = staff.filter((m) => m.branchId === branch.id);
  const membreDuPret = fPret.genre === 'equipe' ? equipeIci.find((m) => m.id === fPret.personneId) : undefined;
  const baseDuMembre = membreDuPret?.salaireXof ?? 0;
  const planSalaire = (() => {
    const montant = montantsPret.xof;
    const partSaisie = Math.max(0, Number(fPret.part.replace(',', '.')) || 0);
    const duree = Math.max(1, parseInt(fPret.duree, 10) || 1);
    const mens = fPret.levier === 'part'
      ? retenueDeLaPart(partSaisie, baseDuMembre)
      : (montant > 0 ? Math.ceil(montant / duree) : 0);
    const partPct = fPret.levier === 'part' ? partSaisie : partPourDuree(montant, duree, baseDuMembre);
    const plan = projectionDeLaRetenue(montant, mens, fPret.premierMois);
    const bareme = parametersFor(fPret.premierMois, versionsPaie);
    const netHabituel = membreDuPret
      ? computePay(
        { base: baseDuMembre, heuresSup: 0, prime: membreDuPret.primeXof ?? 0, pourboires: 0, commission: 0, indemnites: 0 },
        { avance: 0, autresRetenues: 0 }, bareme,
      ).net
      : 0;
    const plafond = plafondDeLaRetenue(netHabituel, bareme);
    const autres = membreDuPret
      ? (retenuePrevueDuMois(prets.filter((x) => x.id !== pretEdite?.id), branch.id,
        { id: membreDuPret.id, nom: membreDuPret.name, baseXof: baseDuMembre }, fPret.premierMois)?.prevuXof ?? 0)
      : 0;
    return {
      mens, partPct, plan, plafond, autres,
      pctPlafond: bareme.plafondRetenuePretPct,
      trop: plafond != null && mens + autres > plafond,
    };
  })();
  const enPartDuSalaire = fPret.type === 'pret' && fPret.genre === 'equipe' && fPret.retour === 'salaire';
  const imprimerLesLettres = () => {
    if (!membreDuPret) return;
    const motif = fPret.motif.trim();
    /* SA PIÈCE D'IDENTITÉ, DÉJÀ SUR LA LETTRE — 19 septembre 2026. « Que la
       lettre à signer porte déjà la carte d'identité que j'ai mise sur le
       profil de l'employé » (Yéman). Celle de sa fiche, lue au coffre (la
       direction seule l'obtient) ; un PDF ou une absence laisse les cases. */
    const carte = identiteDuPersonnel(membreDuPret.id)
      .then((rangees) => (rangees && rangees[0] ? imageDuCoffre(rangees[0].chemin) : null));
    const ok = ouvreLesLettresDuPret({
      nom: membreDuPret.name,
      fonction: membreDuPret.role || undefined,
      telephone: membreDuPret.phone || undefined,
      depuis: /^\d{4}-\d{2}-\d{2}/.test(membreDuPret.since ?? '') ? membreDuPret.since : undefined,
      montantXof: montantsPret.xof,
      date: fPret.date || todayISO(),
      motif: motif && motif !== 'Prêt' ? motif : undefined,
      baseXof: baseDuMembre,
      partPct: planSalaire.partPct,
      mensXof: planSalaire.mens,
      mois: planSalaire.plan.length,
      premierMois: fPret.premierMois,
      plafondPct: planSalaire.pctPlafond,
    }, carte);
    if (!ok) toast('Le navigateur a bloqué la fenêtre des lettres : autorisez les fenêtres pour le Trône, puis recommencez.');
  };
  /* BASCULER DE LEVIER GARDE LE PRÊT TEL QU'IL EST : la durée reprend ce
     que la part donnait, et l'inverse. Rien ne saute sous les yeux. */
  const basculeLevier = (k: 'part' | 'duree') => setFPret((f) => {
    if (f.levier === k) return f;
    const m = planSalaire.mens;
    if (k === 'duree') {
      return { ...f, levier: k, duree: String(m > 0 && montantsPret.xof > 0 ? Math.min(60, Math.max(1, Math.ceil(montantsPret.xof / m))) : 10) };
    }
    return { ...f, levier: k, part: String(baseDuMembre > 0 && m > 0 ? Math.min(50, Math.max(1, Math.round((m / baseDuMembre) * 100))) : 20) };
  });

  const enregistrerPret = () => {
    const montant = montantsPret.xof;
    const nom = fPret.nom.trim();
    /* ══ UN REFUS SE DIT — 3 septembre 2026 ════════════════════════════
       « Je n'arrive pas à enregistrer de nouveaux prêts » (Yéman).

       LE GARDE RETOURNAIT EN SILENCE. Le bouton restait là, le clic ne faisait
       rien, et rien ne disait ce qui manquait : le nom, le montant, ou les
       deux. C'est la même faute que le formulaire des formules le 28 août, et
       elle coûte le même temps — on reclique, on recommence, on croit l'écran
       cassé.

       ON NOMME CE QUI BLOQUE, et rien d'autre. */
    if (!nom) {
      toast(fPret.genre === 'cliente'
        ? 'Choisissez la tête couronnée à qui la Maison prête.'
        : 'Nommez la personne : un prêt sans nom ne se réclame à personne.');
      return;
    }
    if (montantsPret.saisi <= 0 || montant <= 0) {
      toast('Portez le montant : un prêt de zéro ne déplace aucun argent.');
      return;
    }
    const estPret = fPret.type === 'pret';
    /* LA RETENUE EN PART DU SALAIRE REFUSE CE QU'ELLE NE PEUT PAS TENIR, et
       dit pourquoi (18 septembre) : sans fiche ni salaire, la part ne se
       chiffre pas ; au-delà du plafond, c'est l'arbitrage ④. */
    if (enPartDuSalaire) {
      if (!membreDuPret) {
        toast('Choisissez le membre de l’équipe : la part se calcule sur son salaire de base.');
        return;
      }
      if (!(baseDuMembre > 0)) {
        toast(`La fiche de ${membreDuPret.name} ne porte pas de salaire de base. Renseignez-le dans Équipe : sans lui, la part ne se calcule pas.`);
        return;
      }
      if (!(planSalaire.mens > 0)) {
        toast('Réglez la part du salaire ou la durée.');
        return;
      }
      if (planSalaire.trop) {
        toast(`Au-delà du plafond de la Maison, ${fmtMoney(planSalaire.plafond ?? 0, currency)} par mois : baissez la part, ou allongez la durée.`);
        return;
      }
    }
    const ligne: Pret = {
      id: pretEdite?.id ?? `prt-${uid()}`,
      branchId: branch.id,
      date: fPret.date || todayISO(),
      type: fPret.type,
      associe: nom,
      motif: fPret.motif.trim() || (estPret ? 'Prêt' : 'Remboursement'),
      amountXof: montant,
      genre: fPret.genre,
      personneId: fPret.personneId || undefined,
      cashbox: fPret.cashbox || undefined,
      method: fPret.method || undefined,
      fx: montantsPret.fx,
      /* L'ÉCHÉANCE N'A DE SENS QUE SUR UN PRÊT : un remboursement est le
         paiement d'une attente, il n'en crée pas une nouvelle. */
      echeance: estPret && fPret.retour === 'une' && fPret.echeance ? fPret.echeance : undefined,
      echeancier: estPret && fPret.retour === 'plusieurs' && fPret.premier
        ? { nombre: Math.max(2, parseInt(fPret.nombre || '2', 10) || 2), premier: fPret.premier }
        : undefined,
      /* LA PART FAIT FOI (arbitrage ②) : c'est elle qu'on garde, jamais la
         durée, qui se déduira du salaire du jour. */
      retenue: enPartDuSalaire
        ? { partPct: planSalaire.partPct, premierMois: fPret.premierMois }
        : undefined,
      /* La retenue fixe d'avant ne survit que sur un prêt qui ne passe pas
         en part du salaire. */
      retenueXof: estPret && fPret.genre === 'equipe' && !enPartDuSalaire && fPret.retenue
        ? (parseInt(fPret.retenue.replace(/[^0-9]/g, ''), 10) || 0) || undefined
        : undefined,
    };
    if (pretEdite) {
      setPrets((prev) => prev.map((x) => (x.id === pretEdite.id ? ligne : x)));
      setPretEdite(null);
      toast('Ligne corrigée.');
    } else {
      setPrets((prev) => [...prev, ligne]);
      setPretOuvert(false);
      /* UNE RÉUSSITE QUI NE DIT RIEN RESSEMBLE À UN ÉCHEC. La modale se fermait
         sans un mot ; si la nouvelle ligne tombait hors du filtre en cours, on
         ne voyait rien du tout et l'on croyait que l'enregistrement avait
         échoué. On le dit, et ON RAMÈNE L'ÉCRAN LÀ OÙ ELLE SE VOIT. */
      setFiltre('cours');
      toast(estPret
        ? `${fmtMoney(montant, currency)} prêtés à ${nom}.`
        : `${fmtMoney(montant, currency)} rendus par ${nom}.`);
    }
    setFPret((f) => ({ ...f, nom: '', personneId: '', motif: '', montant: '', enDevise: '', retenue: '' }));
  };

  /* ── La relance ── */
  const telephoneDe = (e: EtatEmprunteur): string => {
    if (e.genre === 'cliente' && e.personneId) return clients.find((c) => c.id === e.personneId)?.phone ?? '';
    if (e.genre === 'equipe') {
      const m = staff.find((x) => x.id === e.personneId || x.name.trim().toLowerCase() === e.nom.toLowerCase());
      return m?.phone ?? '';
    }
    const c = clients.find((x) => x.name.trim().toLowerCase() === e.nom.toLowerCase());
    return c?.phone ?? '';
  };
  /* UNE RELANCE COURTE SE LIT ; UNE LONGUE S'IGNORE. Le montant, la date, rien
     d'autre — et la devise de la Maison en signature, comme tout message. */
  const messageDeRelance = (e: EtatEmprunteur): string => signeLeMessage(
    `Bonjour ${e.nom.split(' ')[0]}, un petit rappel de la Maison : il reste ${fmtMoney(e.reste, currency)} `
    + (e.prochaine
      ? `sur votre prêt, dont ${fmtMoney(e.prochaine.montantXof, currency)} attendus le ${frLong(e.prochaine.date)}.`
      : 'sur votre prêt.')
    + ' Merci de nous dire ce qui vous arrange.',
  );

  /* ── LE RATTRAPAGE, UNE SEULE FOIS ─────────────────────────────────
     Les prêts d'avant aujourd'hui ne portent aucune date de retour. Le panneau
     les présente en bloc pour les dater — et disparaît dès qu'il n'y a plus
     rien à dater, sans réglage ni bouton « ne plus afficher ». */
  const [rattrapageOuvert, setRattrapageOuvert] = useState(true);
  /* ══ LE SENS AVANT LE MOT — 3 septembre 2026 ═══════════════════════
     « Tout est mélangé. Besoin de voir une différence nette entre les
     remboursements et les prêts » (Yéman).

     LE SENS NE SE LISAIT QUE DANS UN MOT. « Prêté » et « Remboursé » ouvraient
     la ligne, et le montant restait à droite, dans la même couleur, sans
     signe : l'œil ne pouvait pas trier, il devait lire chaque ligne. Sur un
     registre d'argent, une erreur de sens ne se rattrape pas à l'œil, elle se
     découvre au moment de réclamer.

     Le filtre vit PAR EMPRUNTEUR : on regarde le fil de quelqu'un, pas celui de
     la Maison, et un filtre commun se serait appliqué à des cartes qu'on
     n'était pas en train de lire. */
  const [sensVu, setSensVu] = useState<Record<string, 'tout' | 'sorti' | 'rentre'>>({});

  const carte = (e: EtatEmprunteur) => {
    const lignes = prets
      .filter((p) => p.branchId === branch.id && p.associe.trim().toLowerCase() === e.nom.toLowerCase())
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const part = e.prete > 0 ? Math.min(100, Math.round((e.rembourse / e.prete) * 100)) : 0;
    const tel = telephoneDe(e);
    return (
      <Card key={e.nom} className={`trf-pret ${e.retardJours > 0 ? 'trf-pret--retard' : ''} ${e.reste <= 0 ? 'trf-pret--solde' : ''}`}>
        <div className="trf-pret__tete">
          <span className="trf-pret__nom">{e.nom}</span>
          <span className="trf-tag">{LIBELLE_GENRE[e.genre] ?? e.genre}</span>
          {e.retardJours > 0 && <span className="trf-tag trf-tag--brique">en retard</span>}
          {(e.retenueXof > 0 || e.partPct > 0) && e.reste > 0 && <span className="trf-tag trf-tag--vert">retenu sur salaire</span>}
          {e.reste <= 0 && <span className="trf-tag trf-tag--vert">soldé</span>}
          <span className="trf-pret__reste">
            <em>{e.reste > 0 ? 'Reste dû' : 'Soldé'}</em>
            <b>{fmtMoney(e.reste, currency)}</b>
          </span>
        </div>

        <div className="trf-jauge"><i style={{ width: `${part}%` }} /></div>
        <div className="trf-jauge__mot">
          <span>prêté {fmtMoney(e.prete, currency)} · remboursé {fmtMoney(e.rembourse, currency)}</span>
          <span>{part} %</span>
        </div>

        {e.reste > 0 && !(e.partPct > 0 && !e.prochaine) && (
          e.prochaine ? (
            <div className={`trf-echeance ${e.retardJours > 0 ? 'trf-echeance--brique' : ''}`}>
              {e.prochaine.sur > 1
                ? `Échéancier · versement ${e.prochaine.rang} sur ${e.prochaine.sur}, ${fmtMoney(e.prochaine.montantXof, currency)} le ${frLong(e.prochaine.date)}, ${delai(aujourdhui, e.prochaine.date)}.`
                : `Attendu le ${frLong(e.prochaine.date)}, ${delai(aujourdhui, e.prochaine.date)}.`}
            </div>
          ) : e.retenueXof > 0 ? null : (
            <div className="trf-echeance trf-echeance--nu">
              Aucune date de retour. Un prêt sans échéance ne se réclame pas, il s’oublie.
            </div>
          )
        )}
        {/* LA PART DU SALAIRE SE DIT AVEC SA FIN (18 septembre) : la part fait
            foi, la date de fin se recalcule au salaire du jour. */}
        {e.reste > 0 && e.partPct > 0 && (
          <div className="trf-echeance trf-echeance--vert">
            {pctDit(e.partPct)} du salaire de base retenus sur chaque bulletin
            {e.retenueXof > 0 ? `, soit ${fmtMoney(e.retenueXof, currency)}` : ''}
            {e.retenueDes && e.retenueDes > aujourdhui.slice(0, 7) ? `, à partir de ${periodeLisible(e.retenueDes)}` : ''}
            {e.retenueFin ? `. Dernier bulletin prévu : ${periodeLisible(e.retenueFin)}` : ''}
            . Aucune caisse ne bouge : la retenue est déduite du salaire.
          </div>
        )}
        {e.reste > 0 && !(e.partPct > 0) && e.retenueXof > 0 && (
          <div className="trf-echeance trf-echeance--vert">
            {fmtMoney(e.retenueXof, currency)} proposés en retenue sur chaque bulletin, l’argent
            n’est jamais sorti de la Maison, aucune caisse ne bouge.
          </div>
        )}

        {e.reste > 0 && (
          <div className="trf-pret__gestes">
            <Button variant="copper" onClick={() => encaisserPour(e)}>Encaisser un remboursement</Button>
            {/* ON NE SORT PAS DU TRÔNE (14 septembre) : la relance ouvrait
                `wa.me`, donc un message écrit ailleurs dont la Maison ne
                gardait aucune trace — sur une dette, c'est exactement ce
                qu'il faut pouvoir prouver. Elle ouvre la conversation, le
                mot déjà écrit dedans. */}
            {tel && (
              <Link className="trf-act trf-act--ghost" style={{ textDecoration: 'none' }}
                to={cheminDeLaConversation(tel, messageDeRelance(e)) ?? '/conversations'}>
                Relancer sur WhatsApp
              </Link>
            )}
          </div>
        )}

        {/* ══ TROIS BLOCS, JAMAIS UN SEUL FIL ═══════════════════════════
            Ce qui est ATTENDU, ce qui est SORTI, ce qui est RENTRÉ. Les trois se
            suivaient dans une même colonne, du même côté, dans la même couleur :
            l'avenir se mêlait à l'histoire, et les deux sens de l'argent se
            ressemblaient. Une chose qui n'est pas encore arrivée n'a rien à
            faire dans un registre de ce qui s'est passé — c'est ainsi qu'on
            finit par compter deux fois. */}
        <div className="trf-pret__lignes">
          {e.attendus.length > 0 && (
            <div className="trf-pret__titre">Attendu</div>
          )}
          {e.attendus.slice(0, 3).map((a) => (
            <div className="trf-pret__ligne trf-pret__ligne--attendu" key={`${a.pretId}-${a.rang}`}>
              <span className="trf-pret__sens" aria-hidden="true">·</span>
              <span className="trf-pret__quoi">
                {frJour(a.date)}
                {a.sur > 1 ? ` · ${a.rang}ᵉ versement sur ${a.sur}` : ''}
                {a.date < aujourdhui ? ' · en souffrance' : ''}
              </span>
              <span className="trf-pret__m">{fmtMoney(a.montantXof, currency)}</span>
            </div>
          ))}

          {lignes.length > 0 && (() => {
            const vu = sensVu[e.nom] ?? 'tout';
            const montrees = lignes.filter((p) => vu === 'tout'
              || (vu === 'sorti' ? p.type === 'pret' : p.type === 'remboursement'));
            return (
              <>
                <div className="trf-pret__titre trf-pret__titre--fil">
                  <span>Ce qui s’est passé</span>
                  {/* LE FILTRE NE CACHE JAMAIS UN TOTAL, il ne trie qu'un fil :
                      le reste dû et la barre restent au-dessus, intacts. */}
                  <span className="trf-pret__filtres">
                    {([['tout', 'Tout'], ['sorti', 'Sorti'], ['rentre', 'Rentré']] as const).map(([k, mot]) => (
                      <button
                        key={k} type="button"
                        className={`trf-pret__filtre ${vu === k ? 'is-on' : ''}`}
                        onClick={() => setSensVu((prev) => ({ ...prev, [e.nom]: k }))}
                      >{mot}</button>
                    ))}
                  </span>
                </div>
                {montrees.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`trf-pret__ligne trf-pret__ligne--clic ${p.type === 'pret' ? 'is-sorti' : 'is-rentre'}`}
                    onClick={() => corrigerLePret(p)}
                    title="Corriger ou effacer cette ligne"
                  >
                    {/* TROIS INDICES POUR LA MÊME CHOSE : la flèche, la couleur,
                        le signe. Un seul se rate ; trois, non. */}
                    <span className="trf-pret__sens" aria-hidden="true">{p.type === 'pret' ? '↓' : '↑'}</span>
                    <span className="trf-pret__quoi">
                      {p.type === 'pret' ? 'Prêté' : 'Remboursé'}
                      {' · '}{frJour(p.date)}
                      {p.motif ? ` · ${p.motif}` : ''}
                      {p.cashbox ? <i> · {p.cashbox}</i> : null}
                    </span>
                    <span className="trf-pret__m">
                      {p.type === 'pret' ? '−' : '+'} {fmtMoney(p.amountXof, currency)}
                    </span>
                  </button>
                ))}
                {montrees.length === 0 && (
                  <div className="trf-pret__ligne trf-pret__ligne--attendu">
                    <span className="trf-pret__sens" aria-hidden="true">·</span>
                    <span className="trf-pret__quoi">
                      {vu === 'sorti' ? 'Rien n’est sorti pour cette personne.' : 'Rien n’est encore rentré.'}
                    </span>
                    <span className="trf-pret__m" />
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </Card>
    );
  };

  if (ecranVerrouille) {
    return <EcranVerrouille titre="Les prêts sont verrouillés." cle={CLE_PRETS} hash={reglages.codePretsHash} />;
  }

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Finances"
        title="Les prêts."
        sub="Prêté, remboursé, jamais dupliqué."
        actions={(
          <>
            <Button variant="ghost" onClick={() => setVerrouOuvert(true)}>
              {reglages.codePretsHash ? 'Code de l’écran' : 'Protéger cet écran'}
            </Button>
            <Button variant="copper" onClick={() => { setPretEdite(null); setPretOuvert(true); }}>+ Prêt ou remboursement</Button>
          </>
        )}
      />

      {/* Les deux registres — ce qu’on nous doit d’un côté, ce qu’on prépare
          de l’autre. Deux figures proches, jamais additionnées. */}
      <div style={{ display: 'flex', gap: 26, borderBottom: '1px solid var(--hairline)', margin: '0 0 18px' }}>
        {([
          ['prets' as const, 'Ce qu’on nous doit', fmtMoney(dette, currency)],
          /* CE QUE LA MAISON DOIT — 11 septembre 2026. Le miroir du premier
             onglet, sur le même écran : deux sens d'une seule notion, la
             dette. Les séparer aurait fait chercher à deux endroits ce qui se
             pense d'un seul tenant. */
          ['doit' as const, 'Ce que la Maison doit', notreDette > 0 ? fmtMoney(notreDette, currency) : ''],
          ['objectifs' as const, 'Les objectifs', ''],
        ] as ['prets' | 'doit' | 'objectifs', string, string][]).map(([k, mot, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => choisirLeRegistre(k)}
            aria-current={registre === k ? 'page' : undefined}
            style={{
              appearance: 'none', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit',
              padding: '10px 2px', display: 'inline-flex', alignItems: 'baseline', gap: 9,
              fontSize: 14.5, color: registre === k ? 'var(--color-indigo)' : 'var(--ink-soft)',
              fontWeight: registre === k ? 600 : 400,
              borderBottom: `2px solid ${registre === k ? 'var(--color-copper)' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {mot}
            {n ? <span className="mnd-muted" style={{ fontSize: 12 }}>{n}</span> : null}
          </button>
        ))}
      </div>

      {registre === 'doit' ? <CeQueLaMaisonDoit /> : registre === 'objectifs' ? <LesObjectifs /> : (
      <>
      {etats.length === 0 ? (
        <Card style={{ padding: 22 }}>
          <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>Aucun prêt enregistré.</b><br />
            Une avance sur salaire, un dépannage, un prêt au foyer : notez-le ici, avec la date à
            laquelle l’argent doit revenir. Chaque remboursement viendra s’imputer dessus, et le
            solde de chacun se tiendra tout seul.
          </div>
        </Card>
      ) : (
        <>
          <div className="trf-pret-bandeau">
            <div className="trf-pret-stat">
              <div className="trf-pret-stat__l">Prêté · en cours</div>
              <div className="trf-pret-stat__v">{fmtMoney(totalPrete, currency)}</div>
              <div className="trf-pret-stat__s">{vivants.length} emprunteur{vivants.length > 1 ? 's' : ''}</div>
            </div>
            <div className="trf-pret-stat">
              <div className="trf-pret-stat__l">Remboursé</div>
              <div className="trf-pret-stat__v trf-pret-stat__v--vert">{fmtMoney(totalRembourse, currency)}</div>
              <div className="trf-pret-stat__s">
                {totalPrete > 0 ? `${Math.round((totalRembourse / (totalPrete || 1)) * 100)} % du prêté` : '—'}
              </div>
            </div>
            <div className="trf-pret-stat">
              <div className="trf-pret-stat__l">Reste dû</div>
              <div className="trf-pret-stat__v">{fmtMoney(dette, currency)}</div>
              <div className="trf-pret-stat__s">envers la Maison</div>
            </div>
            <div className={`trf-pret-stat ${enRetard.length > 0 ? 'trf-pret-stat--alerte' : ''}`}>
              <div className="trf-pret-stat__l">En retard</div>
              <div className={`trf-pret-stat__v ${enRetard.length > 0 ? 'trf-pret-stat__v--brique' : ''}`}>
                {fmtMoney(montantEnRetard, currency)}
              </div>
              <div className="trf-pret-stat__s">
                {enRetard.length === 0 ? 'rien à réclamer' : `${enRetard.length} prêt${enRetard.length > 1 ? 's' : ''} · depuis ${enRetard[0].retardJours} jour${enRetard[0].retardJours > 1 ? 's' : ''}`}
              </div>
            </div>
          </div>

          {/* LE RATTRAPAGE — une seule fois, et il s’efface de lui-même. */}
          {rattrapageOuvert && sansDate.length > 0 && (
            <Card style={{ padding: 18, marginTop: 16, borderLeft: '3px solid var(--color-copper)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div style={{ maxWidth: '62ch' }}>
                  <div className="mnd-serif" style={{ fontSize: 19, color: 'var(--color-indigo)' }}>
                    {sansDate.length} prêt{sansDate.length > 1 ? 's' : ''} sans date de retour
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.65, marginTop: 5 }}>
                    Ils sont d’avant l’échéance. Ouvrez chacun pour lui donner une date, ou
                    laissez-les ainsi : « sans échéance » est un état assumé, il ne déclenche
                    simplement aucune relance. Ce panneau disparaîtra quand plus rien n’attendra
                    de date.
                  </div>
                </div>
                <button className="trf-act trf-act--ghost" onClick={() => setRattrapageOuvert(false)}>Plus tard</button>
              </div>
            </Card>
          )}

          <div className="trf-pret-rail">
            {([
              ['retard', `En retard · ${enRetard.length}`, enRetard.length > 0],
              ['proche', `Échéance sous 15 jours · ${proches.length}`, false],
              ['cours', `Tous les prêts en cours · ${vivants.length}`, false],
              ['sans', `Sans échéance · ${sansDate.length}`, false],
              ['soldes', `Soldés · ${soldes.length}`, false],
            ] as [Filtre, string, boolean][]).map(([k, mot, alerte]) => (
              <button
                key={k}
                type="button"
                className={`trf-pret-puce ${filtre === k ? 'is-on' : ''} ${alerte && filtre !== k ? 'trf-pret-puce--alerte' : ''}`}
                onClick={() => setFiltre(k)}
              >
                {mot}
              </button>
            ))}
          </div>

          {liste.length === 0 ? (
            <Card style={{ padding: 20 }}>
              <div className="mnd-muted" style={{ fontSize: 13 }}>
                {filtre === 'retard' ? 'Aucun retard, tout le monde est à jour.'
                  : filtre === 'proche' ? 'Aucune échéance dans les quinze jours.'
                    : filtre === 'sans' ? 'Tous les prêts en cours portent une date de retour.'
                      : filtre === 'soldes' ? 'Aucun prêt soldé pour l’instant.'
                        : 'Aucun prêt en cours.'}
              </div>
            </Card>
          ) : liste.map(carte)}
        </>
      )}
      </>
      )}

      {verrouOuvert && (
        <ReglerLeVerrou
          cle={CLE_PRETS}
          hash={reglages.codePretsHash}
          onClose={() => setVerrouOuvert(false)}
          onPose={(h) => settingsStore.set((prev) => ({ ...prev, codePretsHash: h }))}
        />
      )}

      {(pretOuvert || pretEdite) && (
        <Modal
          title={pretEdite
            ? (pretEdite.type === 'pret' ? 'Corriger ce prêt' : 'Corriger ce remboursement')
            : 'Prêt ou remboursement'}
          onClose={() => { setPretOuvert(false); setPretEdite(null); }}
          width={520}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="De quel geste s’agit-il ?">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {([['pret', 'La Maison prête'], ['remboursement', 'On lui rembourse']] as const).map(([k, mot]) => (
                  <button
                    key={k}
                    type="button"
                    className={`trc-chip ${fPret.type === k ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, type: k }))}
                  >
                    {mot}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="À qui">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 9 }}>
                {(['equipe', 'cliente', 'tiers', 'associe', 'foyer'] as GenreEmprunteur[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`trc-chip ${fPret.genre === g ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({
                      ...f, genre: g,
                      /* Le salaire n'est un chemin de retour que pour l'équipe. */
                      retour: g === 'equipe' && f.retour === 'sans' ? 'salaire'
                        : g !== 'equipe' && f.retour === 'salaire' ? 'sans' : f.retour,
                    }))}
                  >
                    {LIBELLE_GENRE[g]}
                  </button>
                ))}
              </div>
              {/* UN MEMBRE DE L'ÉQUIPE SE CHOISIT DANS L'ÉQUIPE (18 septembre) :
                  c'est sa fiche qui porte le salaire de base, sur lequel se
                  calcule la part. Un prêt d'avant dont le nom ne correspond à
                  aucune fiche garde son champ libre. */}
              {fPret.genre === 'equipe' && equipeIci.length > 0 && !(pretEdite && !fPret.personneId && fPret.nom.trim()) ? (
                <Select
                  value={fPret.personneId}
                  onChange={(e) => {
                    const m = equipeIci.find((x) => x.id === e.target.value);
                    setFPret((f) => ({ ...f, personneId: m?.id ?? '', nom: m?.name ?? '' }));
                  }}
                >
                  <option value="">Choisir le membre de l’équipe…</option>
                  {equipeIci.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}{m.role ? ` · ${m.role}` : ''}</option>
                  ))}
                </Select>
              ) : fPret.genre === 'cliente' ? (
                <ClientPicker
                  value={fPret.personneId}
                  onChange={(id) => setFPret((f) => ({
                    ...f, personneId: id,
                    nom: clients.find((c) => c.id === id)?.name ?? f.nom,
                  }))}
                  placeholder="Choisir la cliente…"
                />
              ) : (
                <Input
                  value={fPret.nom}
                  placeholder={fPret.genre === 'equipe' ? 'Nom du membre de l’équipe' : 'Nom de la personne'}
                  onChange={(e) => setFPret((f) => ({ ...f, nom: e.target.value }))}
                />
              )}
            </Field>

            <Field label={libelleDuMontant(caisseDuPret, currency)}>
              <Input
                inputMode="decimal"
                value={fPret.montant}
                placeholder="0"
                onChange={(e) => setFPret((f) => ({ ...f, montant: nettoieLeMontant(e.target.value, montantsPret.enDevise) }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </Field>

            <Field label={fPret.type === 'pret' ? 'De quelle caisse sort cet argent ?' : 'Dans quelle caisse rentre-t-il ?'}>
              <Select value={fPret.cashbox} onChange={(e) => setFPret((f) => ({ ...f, cashbox: e.target.value }))}>
                {caissesMaison.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                <option value="">Hors caisse, l’argent n’est pas passé par un tiroir</option>
              </Select>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
                {fPret.type === 'pret'
                  ? 'La caisse choisie baisse d’autant : l’argent se déplace, il ne se duplique pas.'
                  : 'La caisse choisie monte d’autant, l’argent revient dans le tiroir.'}
              </div>
            </Field>

            <ContrepartieMaison
              caisse={caisseDuPret}
              maison={currency}
              saisie={fPret.montant}
              contrepartie={fPret.enDevise}
              onChange={(v: string) => setFPret((f) => ({ ...f, enDevise: v }))}
              sortant={fPret.type === 'pret'}
            />

            {/* ── QUAND DOIT-IL REVENIR ? ─────────────────────────────
                Le champ qui manquait, et dont tout le reste découle. Il ne
                s’affiche que sur un PRÊT : un remboursement paie une attente,
                il n’en crée pas. */}
            {fPret.type === 'pret' && (
              <Field label="Quand doit-il revenir ?">
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                  {([
                    ...(fPret.genre === 'equipe' ? [['salaire', 'Retenu sur le salaire']] as const : []),
                    ['sans', 'Sans échéance'], ['une', 'En une fois'], ['plusieurs', 'En plusieurs fois'],
                  ] as const).map(([k, mot]) => (
                    <button
                      key={k}
                      type="button"
                      className={`trc-chip ${fPret.retour === k ? 'is-active' : ''}`}
                      onClick={() => setFPret((f) => ({ ...f, retour: k }))}
                    >
                      {mot}
                    </button>
                  ))}
                </div>
                {fPret.retour === 'une' && (
                  <ChampDeDate compact sens="avant" value={fPret.echeance} onChange={(iso) => setFPret((f) => ({ ...f, echeance: iso }))} />
                )}
                {fPret.retour === 'plusieurs' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
                    <label className="mnd-field">
                      <span className="mnd-field__label">Combien de versements</span>
                      <input
                        className="mnd-input" inputMode="numeric" value={fPret.nombre}
                        onChange={(e) => setFPret((f) => ({ ...f, nombre: e.target.value.replace(/[^0-9]/g, '') }))}
                      />
                    </label>
                    <label className="mnd-field">
                      <span className="mnd-field__label">À partir du</span>
                      <ChampDeDate compact sens="avant" value={fPret.premier} onChange={(iso) => setFPret((f) => ({ ...f, premier: iso }))} />
                    </label>
                  </div>
                )}
                {fPret.retour === 'salaire' && fPret.genre === 'equipe' && (
                  !membreDuPret ? (
                    <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                      Choisissez le membre de l’équipe : la part se calcule sur son salaire de base.
                    </div>
                  ) : !(baseDuMembre > 0) ? (
                    <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--copper-700)' }}>
                      La fiche de {membreDuPret.name} ne porte pas de salaire de base. Renseignez-le dans
                      Équipe : sans lui, la part ne peut pas se calculer.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                      <div className="mnd-muted" style={{ fontSize: 11.5 }}>
                        Salaire de base de {membreDuPret.name} : {fmtMoney(baseDuMembre, currency)}
                      </div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {([['part', 'Par la part du salaire'], ['duree', 'Par la durée']] as const).map(([k, mot]) => (
                          <button
                            key={k}
                            type="button"
                            className={`trc-chip ${fPret.levier === k ? 'is-active' : ''}`}
                            onClick={() => basculeLevier(k)}
                          >
                            {mot}
                          </button>
                        ))}
                      </div>
                      {fPret.levier === 'part' ? (
                        <label className="mnd-field">
                          <span className="mnd-field__label">Part du salaire de base retenue chaque mois</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <input
                              type="range" min={1} max={50} step={1}
                              value={Math.round(Number(fPret.part) || 0)}
                              onChange={(e) => { setRetenueTapee(null); setFPret((f) => ({ ...f, part: e.target.value })); }}
                              style={{ flex: 1, minWidth: 0, accentColor: 'var(--color-copper)' }}
                              aria-label="Part du salaire de base"
                            />
                            <b style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--color-indigo)', minWidth: 64, textAlign: 'right' }}>
                              {pctDit(planSalaire.partPct)}
                            </b>
                          </span>
                        </label>
                      ) : null}
                      {/* EN FRANCS AUSSI — 19 septembre 2026. « La retenue en
                          chiffre également, pas seulement en pourcentage »
                          (Yéman). Le montant tapé devient la part exacte : le
                          prêt garde une part, et le bulletin retiendra ce
                          montant au franc près (`partDeLaRetenue`). */}
                      {fPret.levier === 'part' ? (
                        <label className="mnd-field">
                          <span className="mnd-field__label">Ou retenue par bulletin, en francs</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              className="mnd-input" inputMode="numeric"
                              value={retenueTapee ?? (planSalaire.mens > 0 ? String(planSalaire.mens) : '')}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 9);
                                setRetenueTapee(v);
                                const n = parseInt(v, 10) || 0;
                                if (n > 0) setFPret((f) => ({ ...f, part: String(partDeLaRetenue(n, baseDuMembre)) }));
                              }}
                              onBlur={() => setRetenueTapee(null)}
                              aria-label="Retenue par bulletin, en francs"
                              style={{ width: 140, textAlign: 'right' }}
                            />
                            <span className="mnd-muted" style={{ fontSize: 12 }}>F par bulletin</span>
                          </span>
                        </label>
                      ) : (
                        <label className="mnd-field">
                          <span className="mnd-field__label">Remboursé en</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              type="button" className="trv-sq" aria-label="Un mois de moins"
                              onClick={() => setFPret((f) => ({ ...f, duree: String(Math.max(1, (parseInt(f.duree, 10) || 1) - 1)) }))}
                            >
                              −
                            </button>
                            <input
                              className="mnd-input" inputMode="numeric" value={fPret.duree} aria-label="Nombre de mois"
                              onChange={(e) => setFPret((f) => ({ ...f, duree: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) }))}
                              style={{ width: 64, textAlign: 'center' }}
                            />
                            <button
                              type="button" className="trv-sq" aria-label="Un mois de plus"
                              onClick={() => setFPret((f) => ({ ...f, duree: String(Math.min(60, (parseInt(f.duree, 10) || 0) + 1)) }))}
                            >
                              +
                            </button>
                            <span className="mnd-muted" style={{ fontSize: 12 }}>mois</span>
                          </span>
                        </label>
                      )}
                      <label className="mnd-field">
                        <span className="mnd-field__label">Première retenue sur le bulletin de</span>
                        <ChampDeMois
                          value={fPret.premierMois}
                          onChange={(m) => setFPret((f) => ({ ...f, premierMois: m }))}
                          ariaLabel="Premier bulletin"
                        />
                      </label>

                      {montantsPret.xof > 0 && planSalaire.mens > 0 && planSalaire.plan.length > 0 && (() => {
                        const plan = planSalaire.plan;
                        const fin = plan[plan.length - 1].mois;
                        return (
                          <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, padding: '12px 14px', background: 'var(--surface-card)' }}>
                            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)', lineHeight: 1.2 }}>
                              {fmtMoney(planSalaire.mens, currency)}
                              <span className="mnd-muted" style={{ fontFamily: 'var(--font-sans)', fontSize: 12, marginLeft: 8 }}>
                                par bulletin, soit {pctDit(planSalaire.partPct)} du salaire de base
                              </span>
                            </div>
                            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                              {fPret.levier === 'part'
                                ? <>La part fixe la durée : <b>{plan.length} mois</b>, de {periodeLisible(plan[0].mois)} à {periodeLisible(fin)}.</>
                                : <>La durée fixe la part : <b>{pctDit(planSalaire.partPct)} du salaire</b>, fin en {periodeLisible(fin)}.</>}
                            </div>
                            {planSalaire.trop ? (
                              <div style={{ marginTop: 9, padding: '8px 11px', borderLeft: '3px solid #96412E', background: '#FBF0ED', fontSize: 12, lineHeight: 1.55, color: '#2A2722' }}>
                                Au-delà du plafond de la Maison : {pctDit(planSalaire.pctPlafond ?? 0)} du net habituel, soit{' '}
                                <b>{fmtMoney(planSalaire.plafond ?? 0, currency)}</b> par mois
                                {planSalaire.autres > 0 ? `, dont ${fmtMoney(planSalaire.autres, currency)} déjà retenus pour un autre prêt` : ''}.
                                Le Trône refuse ce prêt ainsi : baissez la part, ou allongez la durée.
                              </div>
                            ) : planSalaire.plafond == null ? (
                              <div className="mnd-muted" style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.55 }}>
                                Plafond de la Maison non fixé : rien ne dit encore si cette retenue pèse trop. Il se
                                règle avec le comptable, dans les Paramètres de paie.
                              </div>
                            ) : null}
                            <div className="mnd-scroll-x" style={{ maxHeight: 200, overflowY: 'auto', marginTop: 10 }}>
                              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                                <thead>
                                  <tr className="mnd-muted" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase' }}>
                                    <th style={{ textAlign: 'left', fontWeight: 400, padding: '4px 0' }}>Bulletin</th>
                                    <th style={{ textAlign: 'right', fontWeight: 400, padding: '4px 0' }}>Retenue</th>
                                    <th style={{ textAlign: 'right', fontWeight: 400, padding: '4px 0' }}>Reste dû après</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {plan.map((l) => (
                                    <tr key={l.mois} style={{ borderTop: '1px solid var(--hairline)' }}>
                                      <td style={{ padding: '4px 0' }}>{periodeLisible(l.mois)}</td>
                                      <td style={{ textAlign: 'right', padding: '4px 0' }}>{fmtMoney(l.retenueXof, currency)}</td>
                                      <td style={{ textAlign: 'right', padding: '4px 0' }}>{l.resteApresXof > 0 ? fmtMoney(l.resteApresXof, currency) : 'soldé'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 7, lineHeight: 1.55 }}>
                              La retenue arrive seule sur chaque bulletin et se corrige au moment de la paie ; un mois
                              réduit reporte son écart à la fin. Aucune caisse ne bouge : elle est déduite du salaire.
                              Si le salaire de base change, la part reste la même et la durée suit.
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )
                )}
                {fPret.retour !== 'salaire' && (
                <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 7, lineHeight: 1.55 }}>
                  {fPret.retour === 'sans'
                    ? 'Sans date, ce prêt ne sera jamais annoncé en retard, et ne sera jamais rappelé non plus.'
                    : fPret.retour === 'plusieurs' && montantsPret.xof > 0 && fPret.nombre
                      ? `${fPret.nombre} versements d’environ ${fmtMoney(Math.round(montantsPret.xof / (parseInt(fPret.nombre, 10) || 1)), currency)}, de mois en mois. Ce sont des attentes, pas des écritures : rien ne bouge dans une caisse tant que l’argent n’est pas revenu.`
                      : 'Ce sont des attentes, pas des écritures : rien ne bouge dans une caisse tant que l’argent n’est pas revenu.'}
                </div>
                )}
              </Field>
            )}

            {/* LA RETENUE FIXE D'AVANT (23 août) ne se propose plus sur un prêt
                neuf : la part du salaire la remplace. Elle reste lisible et
                corrigeable sur les prêts qui la portent déjà, tant qu'ils ne
                passent pas en part du salaire. */}
            {fPret.type === 'pret' && fPret.genre === 'equipe' && fPret.retour !== 'salaire'
              && !!pretEdite?.retenueXof && !pretEdite.retenue && (
              <Field label="Retenue fixe d’avant · par bulletin">
                <Input
                  inputMode="numeric"
                  value={fPret.retenue}
                  placeholder="0"
                  onChange={(e) => setFPret((f) => ({ ...f, retenue: e.target.value.replace(/[^0-9]/g, '') }))}
                />
                <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.55 }}>
                  Ce montant est proposé en retenue sur chaque bulletin, jusqu’à extinction du
                  prêt. Choisissez « Retenu sur le salaire » ci-dessus pour le fixer plutôt en
                  part du salaire de base, avec son échéancier.
                </div>
              </Field>
            )}

            <Field label="Par quel moyen">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {/* LA LISTE DES PARAMÈTRES, PAS UNE COPIE — 5 septembre 2026. */}
                {moyensAOffrir(moyensPose, fPret.method).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`trc-chip ${fPret.method === m ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, method: m }))}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Motif · facultatif">
              <Input
                value={fPret.motif}
                onChange={(e) => setFPret((f) => ({ ...f, motif: e.target.value }))}
              />
            </Field>

            <Field label="Date">
              <ChampDeDate compact sens="arriere" value={fPret.date} onChange={(iso) => setFPret((f) => ({ ...f, date: iso }))} />
            </Field>

            {/* LES LETTRES À SIGNER — 18 septembre 2026. Remplies d'après ce
                formulaire, avant même l'enregistrement : la demande se signe
                avant le prêt, l'engagement le jour où l'argent est remis. Un
                prêt refusé par le plafond n'a pas de lettre à signer. */}
            {enPartDuSalaire && membreDuPret && baseDuMembre > 0 && planSalaire.mens > 0
              && montantsPret.xof > 0 && !planSalaire.trop && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
                <button type="button" className="mnd-btn mnd-btn--ghost" onClick={imprimerLesLettres}>Lettres à signer</button>
                <span className="mnd-muted" style={{ fontSize: 10.5, lineHeight: 1.5, flex: 1, minWidth: 200 }}>
                  La demande et l’engagement, remplis d’après ce formulaire, avec la place de la carte
                  d’identité et des signatures.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap' }}>
              {/* EFFACER VIT À GAUCHE, loin d’Enregistrer : un geste sans retour
                  ne voisine pas avec le geste courant. Effacer un prêt REND
                  l’argent à sa caisse — c’est bien ce qu’on veut d’une ligne
                  qui n’aurait jamais dû exister. */}
              {pretEdite ? (
                <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--copper-700)' }} onClick={effacerLePret}>
                  Effacer cette ligne
                </button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="mnd-btn mnd-btn--ghost" onClick={() => { setPretOuvert(false); setPretEdite(null); }}>Annuler</button>
                <button className="mnd-btn" onClick={enregistrerPret}>Enregistrer</button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


/* ══ CE QUE LA MAISON DOIT — 11 septembre 2026 ═══════════════════════
   Maquette `public/maquette-ce-que-la-maison-doit.html`, validée.

   RENDRE N'EST PAS DÉPENSER. La caisse perd le total d'une échéance — c'est
   l'argent réel, et rien ne le masque — mais seul le PRIX DE L'ARGENT touche
   le résultat : le principal rend ce qui n'était pas à nous. Les deux
   écritures se font d'un seul geste (`rendUneEcheance`), parce que demander
   deux saisies garantit qu'une manquera un jour. */
function CeQueLaMaisonDoit() {
  const { branch, currency } = useBranch();
  const [emprunts] = useEmprunts();
  const [cashboxes] = useCashboxes();
  const aujourdhui = todayISO();
  const caisses = cashboxes.filter((c) => c.branchId === branch.id);
  const miens = emprunts
    .filter((e) => e.branchId === branch.id)
    .slice()
    .sort((a, b) => Number(empruntSolde(a)) - Number(empruntSolde(b)) || b.date.localeCompare(a.date));

  type FormEmp = {
    preteur: string; motif: string; recu: string; aRendre: string;
    cashbox: string; nombre: string; premier: string; date: string;
  };
  const [form, setForm] = useState<FormEmp | null>(null);
  const [rendre, setRendre] = useState<{ emprunt: Emprunt; rang: number; cashbox: string; jour: string } | null>(null);

  const ouvre = () => setForm({
    preteur: '', motif: '', recu: '', aRendre: '',
    cashbox: caisses[0]?.name ?? '', nombre: '3',
    premier: addDaysISO(aujourdhui, 30), date: aujourdhui,
  });

  const enregistre = () => {
    if (!form) return;
    const n = (x: string) => parseInt(x.replace(/[^0-9]/g, '') || '0', 10);
    const recu = n(form.recu);
    const r = poseUnEmprunt({
      branchId: branch.id,
      preteur: form.preteur,
      motif: form.motif,
      date: form.date,
      recuXof: recu,
      /* À RENDRE VIDE = on rend ce qu'on a reçu. Un emprunt sans prix est le
         cas le plus fréquent entre proches : ne pas l'obliger à se répéter. */
      aRendreXof: form.aRendre.trim() ? n(form.aRendre) : recu,
      cashbox: form.cashbox,
      nombre: n(form.nombre),
      premier: form.premier,
    });
    if (!r.ok) { toast(r.erreur ?? 'Impossible.'); return; }
    setForm(null);
    toast(`Emprunt posé. ${fmtMoney(recu, currency)} sont entrés dans « ${form.cashbox} ».`);
  };

  const confirmeLeRemboursement = () => {
    if (!rendre) return;
    const r = rendUneEcheance(rendre.emprunt, rendre.rang, rendre.cashbox, rendre.jour);
    if (!r.ok) { toast(r.erreur ?? 'Impossible.'); return; }
    setRendre(null);
    toast('Échéance rendue. Seul le prix de l’argent entre au résultat.');
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <span className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 560 }}>
          Les emprunts reçus et leurs échéances. Recevoir n’est pas gagner, rendre n’est pas
          dépenser : seul le prix de l’argent touche le résultat.
        </span>
        <Button variant="copper" onClick={ouvre} disabled={caisses.length === 0}>+ Nouvel emprunt</Button>
      </div>

      {miens.length === 0 && (
        <Card style={{ padding: 22 }}>
          <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>La Maison ne doit rien.</b><br />
            Un emprunt posé ici fait deux choses d’un geste : l’argent entre dans la caisse choisie,
            et son échéancier s’écrit. Le remboursement, ensuite, se fait échéance par échéance.
          </div>
        </Card>
      )}

      {miens.map((e) => {
        const ech = echeancesDeLEmprunt(e);
        const reste = resteDuDeLEmprunt(e);
        const solde = reste <= 0;
        return (
          <Card key={e.id} style={{ padding: 0, marginBottom: 14, opacity: solde ? 0.72 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', padding: '14px 17px', borderBottom: '1px solid var(--hairline)' }}>
              <span>
                <b style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 19, color: 'var(--color-indigo)' }}>{e.preteur}</b>
                <span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>
                  {e.motif ? `${e.motif} · ` : ''}reçu le {frJourAn(e.date)} · {e.cashbox}
                  {e.aRendreXof > e.recuXof
                    ? ` · ${fmtMoney(e.recuXof, currency)} reçus, ${fmtMoney(e.aRendreXof, currency)} à rendre`
                    : ''}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <b style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 24, color: solde ? '#4A6B52' : '#96412E' }}>
                  {solde ? 'Soldé' : fmtMoney(reste, currency)}
                </b>
                {!solde && <span className="mnd-muted" style={{ display: 'block', fontSize: 10.5 }}>reste dû</span>}
              </span>
            </div>
            {ech.map((x) => {
              const enRetard = !x.regleeLe && x.dueIso < aujourdhui;
              return (
                <div
                  key={x.rang}
                  style={{
                    display: 'grid', gridTemplateColumns: '62px 1fr auto auto', gap: 12,
                    alignItems: 'center', padding: '9px 17px', borderTop: '1px solid var(--hairline)',
                  }}
                >
                  <span style={{ textAlign: 'center', border: '1px solid var(--hairline)', borderRadius: 4, background: 'var(--surface-card)', padding: '3px 2px', lineHeight: 1.15 }}>
                    <span className="mnd-muted" style={{ display: 'block', fontSize: 9, letterSpacing: '.13em', textTransform: 'uppercase' }}>
                      {frJourAn(x.dueIso).split(' ')[1]?.slice(0, 4) ?? ''}
                    </span>
                    <b style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 16, color: 'var(--color-indigo)' }}>
                      {parseInt(x.dueIso.slice(8, 10), 10)}
                    </b>
                  </span>
                  <span style={{ fontSize: 13 }}>
                    Échéance {x.rang} sur {ech.length}
                    {x.interetXof > 0 && (
                      <span className="mnd-muted" style={{ display: 'block', fontSize: 10.5 }}>
                        {fmtMoney(x.principalXof, currency)} de dette · {fmtMoney(x.interetXof, currency)} de prix
                      </span>
                    )}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{fmtMoney(x.totalXof, currency)}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {x.regleeLe ? (
                      <button className="trv-minibtn" onClick={() => defaitUneEcheance(e, x.rang)} title="Défaire ce remboursement">
                        Rendue
                      </button>
                    ) : (
                      <Button
                        size="sm"
                        variant={enRetard ? 'copper' : 'ghost'}
                        onClick={() => setRendre({ emprunt: e, rang: x.rang, cashbox: e.cashbox, jour: aujourdhui })}
                      >
                        {enRetard ? 'En retard · rendre' : 'Rembourser'}
                      </Button>
                    )}
                  </span>
                </div>
              );
            })}
          </Card>
        );
      })}

      {form && (
        <Modal title="Nouvel emprunt." onClose={() => setForm(null)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div className="tr-grid tr-grid--2">
              <Field label="Qui prête">
                <Input value={form.preteur} autoFocus onChange={(ev) => setForm({ ...form, preteur: ev.target.value })} />
              </Field>
              <Field label="Pourquoi">
                <Input value={form.motif} onChange={(ev) => setForm({ ...form, motif: ev.target.value })} />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Montant reçu">
                <Input inputMode="numeric" value={form.recu} onChange={(ev) => setForm({ ...form, recu: ev.target.value })} />
              </Field>
              <Field label="Dans quelle caisse">
                <Select value={form.cashbox} onChange={(ev) => setForm({ ...form, cashbox: ev.target.value })}>
                  {caisses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </Select>
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Total à rendre · vide = ce qui a été reçu">
                <Input inputMode="numeric" value={form.aRendre} placeholder={form.recu || '—'} onChange={(ev) => setForm({ ...form, aRendre: ev.target.value })} />
              </Field>
              <Field label="En combien de fois">
                <Input inputMode="numeric" value={form.nombre} onChange={(ev) => setForm({ ...form, nombre: ev.target.value })} />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Reçu le">
                <ChampDeDate compact sens="arriere" value={form.date} onChange={(iso) => setForm({ ...form, date: iso })} />
              </Field>
              <Field label="Première échéance">
                <ChampDeDate compact sens="avant" value={form.premier} onChange={(iso) => setForm({ ...form, premier: iso })} />
              </Field>
            </div>
            <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 3, background: 'var(--copper-50)', padding: '11px 14px', fontSize: 12.5, lineHeight: 1.6 }}>
              <b style={{ fontWeight: 600, color: 'var(--color-indigo)' }}>Le Trône écrira deux choses.</b>
              {' '}Une entrée hors activité dans la caisse choisie, qui pourra payer des dépenses dès
              aujourd’hui. Et l’échéancier. Rien à ressaisir ailleurs.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button>
              <Button variant="copper" onClick={enregistre}>Poser l’emprunt</Button>
            </div>
          </div>
        </Modal>
      )}

      {rendre && (() => {
        const x = echeancesDeLEmprunt(rendre.emprunt).find((y) => y.rang === rendre.rang);
        if (!x) return null;
        return (
          <Modal title={`Rembourser l’échéance ${rendre.rang}.`} onClose={() => setRendre(null)} width={520}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div className="tr-grid tr-grid--2">
                <Field label="D’où sort l’argent">
                  <Select value={rendre.cashbox} onChange={(ev) => setRendre({ ...rendre, cashbox: ev.target.value })}>
                    {caisses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Le jour">
                  <ChampDeDate compact sens="arriere" value={rendre.jour} onChange={(iso) => setRendre({ ...rendre, jour: iso })} />
                </Field>
              </div>
              <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', fontSize: 13 }}>
                  <span>Part de la dette rendue<span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>sortie hors activité, n’entame pas le résultat</span></span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(x.principalXof, currency)}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', fontSize: 13, borderTop: '1px solid var(--hairline)' }}>
                  <span>Prix de l’argent<span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>dépense · frais financiers</span></span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(x.interetXof, currency)}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', fontSize: 13.5, borderTop: '1px solid var(--hairline)', background: 'var(--indigo-50, #EDEEF4)' }}>
                  <span>Sorti de la caisse</span>
                  <b style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(x.totalXof, currency)}</b>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button variant="ghost" onClick={() => setRendre(null)}>Annuler</Button>
                <Button variant="copper" onClick={confirmeLeRemboursement}>Rembourser</Button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </>
  );
}
