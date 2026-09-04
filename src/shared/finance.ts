import { useMemo } from 'react';
import { createStore, useStore, uid } from './store';
import { sameName } from './text';

/* Finances — factures/devis, dépenses, caisses. Montants stockés en XOF. */

/** Un moyen de paiement — la liste est désormais gérable (usePaymentMethods), donc libre. */
export type PaymentMethod = string;

/** Moyens de paiement par défaut — la liste est éditable (paymentMethodsStore). */
export const PAYMENT_METHODS_DEFAULT: string[] = [
  'MTN MoMo', 'Moov', 'Celtis', 'Wave', 'Espèces', 'Carte', 'Virement bancaire', 'PayPal', 'Chèque', 'Lien WhatsApp',
];
/** Alias rétro-compatible (liste par défaut). Préférer `usePaymentMethods()`. */
export const PAYMENT_METHODS = PAYMENT_METHODS_DEFAULT;

/** UN RÈGLEMENT PORTÉ PAR LA PIÈCE — 17 août 2026.

    « Hermine D. devrait avoir tous ces règlements sur une même facture avec
    différentes dates de paiement ou différents moyens de paiement. Pas besoin
    de deux factures différentes le même jour. » (Yéman)

    Un rituel réglé en deux fois produisait DEUX pièces, et chacune se réduisait
    à une ligne « Règlement · A + B + C ». Le bloc n'était pas un caprice : une
    pièce qui ne vaut que 30 000 F sur un rituel de 81 000 ne peut pas détailler
    les prestations sans les proratiser — donc sans mentir. Le bloc était la
    CONSÉQUENCE du découpage.

    Une pièce par rituel, détaillée, et les versements inscrits ici : le détail
    redevient vrai, et chaque règlement garde SA date, SON moyen et SA caisse —
    c'est la date du versement qui range l'argent dans le bon mois, jamais celle
    de la pièce. */
export type InvoicePayment = {
  id: string;
  /** Le jour où l'argent est entré — pas celui de la pièce. */
  date: string;
  amountXof: number;
  method: PaymentMethod;
  /** Caisse créditée. Absente sur les versements repris de l'ancien modèle. */
  cashbox?: string;
  /** Heure d'encaissement HH:mm — journal de caisse. */
  time?: string;
  note?: string;
  /** REÇU EN DEVISE — 18 août 2026, les 100 € de Stevie A. La devise vivait
      sur la PIÈCE seule (`Invoice.fx`) ; or un second versement s'inscrit sur
      une pièce existante sans la réécrire, et l'information se perdait : le
      tiroir EUR restait vide, le PDF taisait les euros. Avec plusieurs
      règlements, seule LE VERSEMENT sait quel argent était étranger.
      `amount` = les billets réellement tendus (pourboire compris — on ne
      découpe pas un billet) ; `amountXof` reste la seule base comptable. */
  fx?: { code: string; rate: number; amount: number };
};

export type InvoiceLine = {
  id: string;
  label: string;
  qty: number;
  unitXof: number;
  discountPct: number; // remise par ligne 5/10/15/20 %
  /** REMISE DE LIGNE EN FRANCS — 17 août 2026. Le pourcentage ne dit pas tout :
      « 5 000 F de moins sur la couleur » est un geste qu'on annonce en francs,
      et le traduire en pourcentage donnerait un nombre à virgule que personne
      ne relit. Elle s'applique APRÈS le pourcentage, comme au rendez-vous.
      Absente sur toutes les pièces d'avant — donc zéro, donc rien ne change. */
  discountXof?: number;
  /** LE PRODUIT DE LA GAMME QUE CETTE LIGNE VEND — 31 août 2026.

      Une ligne de facture ne portait qu'un libellé : rien ne distinguait
      « L'Huile de Nuit » d'une prestation, ni ne disait quelle fiche de stock
      décrémenter. Deux conséquences, l'une visible et l'autre pas :

      · la Gamme ne pouvait pas entrer dans l'encaissement d'un rituel, faute
        de savoir quoi sortir de la réserve ;
      · la commission produit sautait TOUTE facture liée à un rendez-vous, car
        elle ne savait pas isoler les produits du reste. Un shampooing vendu
        avec le rituel ne rapportait donc rien, le même vendu au comptoir si.

      Absent = ligne de prestation, comme toutes celles d'avant. */
  produitId?: string;
  /** CE QUE LA LIGNE CONTIENT, SANS PRIX — 1er septembre 2026.

      « Pour les factures des abonnements, j'aimerais que ça montre les
      prestations qui sont incluses dans l'abonnement sur la facture » (Yéman).

      UNE LIGNE À 168 000 F QUI NE DIT QUE « LA JUSTE CADENCE » NE SE VÉRIFIE
      PAS. La cliente garde ce papier des mois ; c'est lui qu'elle ressort quand
      elle vient réclamer son cinquième resserrage, et il ne portait aucune
      trace de ce qu'elle avait acheté. La Maison non plus : changer le contenu
      d'une formule réécrivait rétroactivement ce que toutes les anciennes
      factures étaient censées avoir vendu.

      SANS PRIX EN FACE, VOLONTAIREMENT. Chiffrer chaque prestation incluse
      ferait une somme qui ne tomberait pas sur le total — c'est tout le
      principe d'un abonnement — et la pièce se contredirait elle-même.

      Absent sur toutes les pièces d'avant. */
  detail?: string[];
};

export type Invoice = {
  id: string;
  branchId: string;
  kind: 'facture' | 'devis';
  number: string;
  clientId: string;
  date: string;
  lines: InvoiceLine[];
  globalDiscountPct: number;
  /** Remise manuelle en CFA, retranchée APRÈS la remise globale en %. */
  globalDiscountXof?: number;
  /** Le NOM de la remise quand elle en porte un — « Remise famille » pour
      l'avantage du compte famille. La pièce le stipule à la place du libellé
      générique ; le calcul, lui, ne change pas. */
  discountLabel?: string;
  /** Encaissé en devise étrangère. Trace de ce qui a été REÇU au comptoir ; le
      total de la facture reste en XOF, seule base de la maison.
      `rate` = 1 unité de `code` en XOF, au taux du jour saisi par le maître. */
  fx?: { code: string; rate: number; amount: number };
  theme: 'Rose' | 'Arbre' | 'Oiseau' | 'Voyage' | 'Aube' | 'Souffle';
  status: 'brouillon' | 'envoyée' | 'payée' | 'acceptée';
  payment?: PaymentMethod;
  /** LE JOURNAL DES RÈGLEMENTS — plusieurs versements sur UNE pièce, chacun
      avec sa date, son moyen et sa caisse. Absent sur les pièces d'avant le
      17 août : `invoiceReglements` leur en fabrique un d'une entrée.
      `payment`, `cashbox` et `time` restent le reflet du PREMIER versement,
      pour que les écrans qui ne lisent qu'un moyen continuent de dire vrai. */
  payments?: InvoicePayment[];
  /** Caisse créditée à l’encaissement (POS multi-caisses). */
  cashbox?: string;
  /** Heure d’encaissement HH:mm — journal de caisse. */
  time?: string;
  /** Nom libre quand la cliente n’est pas au CRM (walk-in). */
  clientName?: string;
  /** Le mot du Maître — imprimé sur le document. */
  note?: string;
  /** Maître qui a officié. */
  master?: string;
  /** RDV créé automatiquement à l’acceptation d’un devis (évite les doublons). */
  apptId?: string;
  /** Pourboire encaissé dans la caisse (traçabilité POS) — HORS chiffre d'affaires,
      reversé au maître. Ne compte jamais dans invoiceTotal. */
  tipXof?: number;
  /** Part de la facture réglée par AVOIR (crédit prépayé du compte). C'est du
      revenu (compte dans invoiceTotal / le CA) mais PAS de l'argent physique :
      la Synthèse la route vers le poste « Avoir (crédit) », jamais une caisse. */
  avoirXof?: number;
  /** Part de cette facture DÉJÀ REÇUE avant le comptoir : l'acompte confirmé
      (envoyé en ligne ou remis à l'avance). C'est du revenu, et c'est de
      l'argent réel — mais il est entré un autre jour, dans une autre caisse.
      Sans ce champ, la caisse du comptoir est créditée du total et l'acompte
      est compté DEUX fois : une fois le jour où il arrive, une fois au solde.
      Même raison d'être que `avoirXof`, autre nature. */
  depositCreditXof?: number;
  /** Cliente réellement SOIGNÉE quand le payeur (clientId) est le parent d'un
      compte famille — mentionnée sur la facture. */
  forClientId?: string;
};

/** Ligne d'une dépense — plusieurs articles peuvent être imputés à un même achat. */
/** Un article d'une dépense. `amountXof` est TOUJOURS le total de la ligne —
    c'est lui que tous les écrans somment. Quantité et prix unitaire (19 août :
    « ajouter quantité et montant pour avoir le total ») ne sont que sa
    provenance : quand ils sont posés, amountXof = qty × unitXof, écrit à la
    saisie — jamais recalculé à la lecture, pour que les articles d'avant
    (montant seul) restent exacts tels quels. */
export type ExpenseItem = { id: string; label: string; amountXof: number; qty?: number; unitXof?: number };

/* ── L'ARGENT A UN NOM — 21 août 2026 ────────────────────────────────
   « Dans dépenses je veux voir le revenu de quelle cliente je suis en train
   de dépenser. Quand j'ai entamé un autre revenu le savoir aussi. »

   Une dépense désigne le ou les revenus qui la paient. Le lien est ÉCRIT,
   jamais déduit : deviner une provenance ferait lire une histoire fausse en
   croyant lire la vraie.

   `nom` et `date` sont FIGÉS à l'enregistrement, comme le prix d'un rituel
   (`Appointment.priceXof`) : le registre des encaissements vit — une fiche se
   renomme, une facture s'annule — et l'histoire d'une dépense ne doit pas se
   réécrire dans son dos. `ref` reste le lien vivant (l'identifiant du registre,
   `Receipt.id`) pour retrouver la pièce quand elle existe encore. */
export type DepenseSource = {
  /** L'identifiant du revenu dans le registre des encaissements (`Receipt.id`). */
  ref: string;
  /** Le nom porté par le revenu AU MOMENT du lien — figé. */
  nom: string;
  /** Le jour où cet argent est entré — figé. */
  date: string;
  /** La part prise sur ce revenu, en XOF. */
  xof: number;
  /** La fiche cliente, quand le revenu en nomme une — pour le lien de lecture. */
  clientId?: string;
};

export type Expense = {
  id: string;
  branchId: string;
  label: string;
  amountXof: number;
  date: string;
  cashbox: string; // caisses multiples
  /** CE QUI EST SORTI DU TIROIR quand la caisse tient une autre devise —
      22 août 2026. `amountXof` reste la charge de la Maison ; `fx.amount` est
      ce que le tiroir a réellement perdu. Voir `surLeTiroir`. */
  fx?: { code: string; rate: number; amount: number };
  /* ── QUI A FAIT CET ACHAT — 23 août 2026 ────────────────────────
     « Il y a des personnes à qui je remets tout le temps de l’argent pour
     effectuer des dépenses. »

     À NE PAS CONFONDRE AVEC LE BÉNÉFICIAIRE. Le bénéficiaire est celui qui
     REÇOIT l’argent — le fournisseur, le bailleur. Le porteur est celui qui
     l’a DÉPENSÉ pour la Maison, avec l’argent qu’on lui a confié. « Dada
     Sandrine · courses au marché » : le marché reçoit, Sandrine porte. Les
     mêler donnerait un « à qui je paie le plus » qui répond à côté. */
  porteur?: string;
  /** IL A AVANCÉ DE SA POCHE — 31 août 2026.

      `porteur` seul suppose que la Maison lui avait DÉJÀ remis l'argent : la
      caisse se vide, personne ne doit rien. Ce drapeau dit l'inverse — il a
      payé de sa poche, et c'est la Maison qui lui doit.

      LA CHARGE EST LA MÊME, LA TRÉSORERIE NON : la dépense compte au résultat
      du mois (la Maison a bien consommé), mais AUCUN TIROIR NE BOUGE le jour
      de l'achat. Il bougera au remboursement, qui est un geste à part.
      Voir `shared/avances.ts`. */
  avancee?: boolean;
  /** LA PREUVE : reçu, bordereau, capture. Voir `PieceJointe`. */
  fichier?: PieceJointe;
  /** LES REVENUS QUI PAIENT CETTE DÉPENSE — voir `DepenseSource`. Absent sur
      tout l'historique : une dépense sans `sources` reste muette, elle ne se
      remplit pas toute seule. */
  sources?: DepenseSource[];
  category: string;
  subcategory?: string;
  recurring?: 'mensuel' | 'hebdomadaire' | null;
  flagged?: boolean; // flag/stop d'une dépense
  stopped?: boolean;
  /** Récurrence suspendue (pause) sans être annulée. */
  paused?: boolean;
  /** Articles imputés au même achat ; `amountXof` = somme des lignes. */
  items?: ExpenseItem[];
  /** QUI a écrit cette ligne en dernier — seulement pour les charges de
      salaire, écrites par DEUX chemins (le run de Paie et « Confirmer le
      règlement » de Personnel). 'run' verrouille la resynchronisation
      automatique de Personnel : un run marqué payé ne se fait plus réécrire
      sans geste ; seul un clic explicite reprend la main. */
  source?: 'run' | 'confirm';
  /** ── ELLE ATTEND UN OUI — 31 août 2026 ──────────────────────────
      « À chaque fois qu'un employé émet une dépense il doit recevoir un bouton
      valider d'un souverain pour valider toute la transaction. Sinon tout le
      monde marquerait ce qu'il a envie de marquer » (Yéman).

      ABSENT VEUT DIRE ACQUISE. Tout ce qui a été saisi avant cette règle, et
      tout ce qu'un souverain ou un gérant saisit lui-même, n'a pas de
      validation à attendre : le champ ne paraît que sur ce qui en demande une.
      Sans cette convention, la mise en ligne aurait suspendu d'un coup
      l'histoire entière des dépenses de la Maison. */
  /** ── LA MAISON CHEZ QUI L'ON A ACHETÉ — 1er septembre 2026 ─────
      Posé quand le libellé saisi correspond exactement à un fournisseur connu.
      ABSENT N'EST PAS UN PROBLÈME : le répertoire retrouve la maison par le
      libellé, et c'est ce qui lui donne tout l'historique d'avant cette règle.
      Voir `fournisseurDeLaDepense`. */
  fournisseurId?: string;
  validation?: ValidationDepense;
};

/** L'ÉTAT D'UNE DÉPENSE SOUMISE, et la trace de la décision.

    ON N'EFFACE PAS UN REFUS : la ligne reste, barrée, avec le motif, chez
    celui qui l'a saisie. Ce qui a été demandé et refusé doit pouvoir se
    relire, sinon la même dépense revient le lendemain à l'identique. */
export type ValidationDepense = {
  etat: 'attente' | 'validee' | 'refusee';
  /** Horodatage de la soumission — c'est de lui que courent les 72 heures. */
  soumisLe: string;
  /** Le nom de qui a saisi, tel qu'il s'écrit sur sa fiche. */
  soumisPar: string;
  decidePar?: string;
  decideLe?: string;
  /** Obligatoire au refus. Un non sans raison se rejoue le lendemain. */
  motif?: string;
};

/* ══ LA VALIDATION DES DÉPENSES ═══════════════════════════════════════════
   Les règles tiennent ici, en fonctions pures, et nulle part ailleurs. Chaque
   écran qui compte de l'argent les interroge ; aucun ne rejuge pour son compte.

   LE DÉLAI NE DÉCIDE RIEN, IL CHANGE LE TON. Passé 72 heures la dépense n'est
   ni acquise ni perdue : elle remonte en tête et se dit « en retard ». Le
   silence n'accorde rien, et ne refuse rien non plus. C'est le choix de la
   Maison (31 août), et il a une vertu technique : le compteur se lit sur
   l'heure de soumission, sans tâche de nuit, donc rien ne peut tomber en panne
   pendant que personne ne regarde. */
export const DELAI_VALIDATION_H = 72;

export const estEnAttente = (e: Pick<Expense, 'validation'>): boolean =>
  e.validation?.etat === 'attente';
export const estRefusee = (e: Pick<Expense, 'validation'>): boolean =>
  e.validation?.etat === 'refusee';

/** LA SEULE QUESTION QUE POSENT LES CHIFFRES : est-ce que ça existe ?

    « Non, elle n'existe qu'une fois validée » (Yéman). Total du mois, budgets,
    solde de caisse, bénéficiaires, ratio du revenu, avances dues, export :
    tout passe par ici. Filtrer à la source est la seule façon de n'oublier
    aucun écran, car les chiffres se dérivent les uns des autres. */
export const compteDansLesChiffres = (e: Pick<Expense, 'validation'>): boolean =>
  !e.validation || e.validation.etat === 'validee';

export const depensesComptees = <T extends Pick<Expense, 'validation'>>(l: readonly T[]): T[] =>
  l.filter(compteDansLesChiffres);

const HEURE = 3_600_000;

/** Heures écoulées depuis la soumission. `null` si la dépense n'attend rien. */
export const heuresDattente = (e: Pick<Expense, 'validation'>, maintenant: number): number | null => {
  if (!estEnAttente(e)) return null;
  const t = Date.parse(e.validation!.soumisLe);
  if (Number.isNaN(t)) return null;
  /* UNE DATE DANS LE FUTUR NE CRÉE PAS D'HEURES NÉGATIVES : horloge de
     téléphone déréglée, fuseau mal posé. On la lit comme « à l'instant ». */
  return Math.max(0, (maintenant - t) / HEURE);
};

export const enRetard = (e: Pick<Expense, 'validation'>, maintenant: number): boolean => {
  const h = heuresDattente(e, maintenant);
  return h !== null && h >= DELAI_VALIDATION_H;
};

/** Ce qu'il reste avant le retard, en heures pleines. 0 quand le délai est passé. */
export const heuresRestantes = (e: Pick<Expense, 'validation'>, maintenant: number): number => {
  const h = heuresDattente(e, maintenant);
  return h === null ? 0 : Math.max(0, Math.ceil(DELAI_VALIDATION_H - h));
};

/** LA FILE, LA PLUS ANCIENNE D'ABORD — donc les retards en tête, d'eux-mêmes. */
export const aValider = <T extends Pick<Expense, 'validation' | 'branchId'>>(
  l: readonly T[], branchId: string,
): T[] => l
  .filter((e) => e.branchId === branchId && estEnAttente(e))
  .sort((a, b) => (a.validation!.soumisLe < b.validation!.soumisLe ? -1 : 1));

/** QUI PEUT DIRE OUI — « souverain ou gérant » (Yéman, 31 août).

    JAMAIS SES PROPRES DÉPENSES, quel que soit le rôle. Un gérant qui saisit
    attend le oui d'un autre ; sans cette règle le contrôle serait une
    formalité qu'on se donne à soi-même, et il ne contrôlerait rien. */
export const peutValider = (
  role: string | undefined,
  monNom: string | undefined,
  e: Pick<Expense, 'validation'>,
): boolean => {
  if (role !== 'souverain' && role !== 'gerant') return false;
  if (!estEnAttente(e)) return false;
  return !sameName(e.validation!.soumisPar, monNom);
};

/** UNE DÉPENSE DOIT-ELLE ÊTRE SOUMISE ? Le rôle tranche, pas l'écran. */
export const doitEtreValidee = (role: string | undefined): boolean => role === 'maitre';

/** UNE FOIS TRANCHÉE, ELLE NE BOUGE PLUS DE SES MAINS — 31 août 2026.

    « Une fois que j'ai validé un montant pour Kabirou il ne peut plus modifier.
    Ni supprimer » (Yéman).

    SANS CELA LE CONTRÔLE NE CONTRÔLAIT RIEN : on soumettait 5 000 F, on
    attendait le oui, puis on rouvrait la ligne et on écrivait 50 000 F. La
    validation aurait porté sur un montant qui n'existe plus, et la signature du
    souverain aurait couvert une somme qu'il n'a jamais vue. Effacer était pire
    encore : la dépense validée disparaissait des comptes sans laisser de trace,
    et le tiroir cessait de correspondre aux livres.

    LE REFUS FIGE AUSSI. Une ligne refusée ne se retouche pas pour revenir par
    la porte de derrière ; s'il conteste, il en saisit une nouvelle, et le refus
    reste à sa date pour que la conversation ait une trace.

    LE SOUVERAIN SEUL Y TOUCHE ENSUITE — « ce n'est que le souverain qui peut
    toucher une dépense déjà effectuée » (Yéman, 31 août). Un gérant VALIDE,
    mais il ne rouvre pas ce qui est tranché : le pouvoir de dire oui et celui
    de réécrire après coup ne sont pas le même pouvoir, et les réunir dans une
    seule main referait le trou qu'on vient de boucher.

    CE QUI N'A JAMAIS RIEN DEMANDÉ RESTE LIBRE : tout l'historique d'avant la
    règle, et ce qu'un souverain ou un gérant saisit lui-même. Le champ absent
    veut dire acquise, et une dépense acquise se corrige comme avant. */
export const figeePour = (
  role: string | undefined,
  e: Pick<Expense, 'validation'>,
): boolean => role !== 'souverain' && !!e.validation && e.validation.etat !== 'attente';

export const soumission = (nom: string, quandISO: string): ValidationDepense =>
  ({ etat: 'attente', soumisLe: quandISO, soumisPar: nom });

export const validee = (v: ValidationDepense, parQui: string, quandISO: string): ValidationDepense =>
  ({ ...v, etat: 'validee', decidePar: parQui, decideLe: quandISO, motif: undefined });

export const refusee = (v: ValidationDepense, parQui: string, quandISO: string, motif: string): ValidationDepense =>
  ({ ...v, etat: 'refusee', decidePar: parQui, decideLe: quandISO, motif: motif.trim() });

/** Ce que la Maison n'a pas encore tranché, en francs. */
export const totalEnAttenteXof = (l: readonly Expense[], branchId: string): number =>
  aValider(l, branchId).reduce((n, e) => n + expenseTotal(e), 0);

/** Ce qui attend SUR UN TIROIR : l'argent en est sorti, le solde ne le dit pas
    encore. On l'annonce sous le solde plutôt que de laisser le trou se
    découvrir tout seul au comptage. */
export const enAttenteSurLaCaisse = (l: readonly Expense[], branchId: string, caisse: string): number =>
  aValider(l, branchId)
    .filter((e) => e.cashbox === caisse && !e.avancee)
    .reduce((n, e) => n + expenseTotal(e), 0);

/** Total d'une dépense — somme des lignes si présentes, sinon le montant simple. */
/** COMBIEN DE FOIS une dépense pèse sur le mois `mk` (« aaaa-mm »).

    Le champ `recurring` était décoratif : rien ne reportait l'engagement d'un
    mois sur le suivant, si bien qu'un loyer de 300 000 F saisi en janvier
    laissait février à décembre trop beaux d'autant — alors que l'onglet
    Engagements l'affichait « actif ». Une récurrente court désormais sur
    chaque mois, de sa saisie jusqu'à son arrêt.

    `stopped` et `paused` la ramènent à son seul mois de saisie : arrêtée, elle
    ne court plus ; en pause, elle ne pèse pas non plus (le champ n'existait
    que pour l'affichage, et une dépense en pause était comptée en entier).

    L'hebdomadaire compte autant de fois que son jour de semaine tombe dans le
    mois — quatre ou cinq selon les mois, jamais un chiffre arbitraire. */
export const expenseOccurrences = (e: Expense, mk: string): number => {
  const debut = (e.date ?? '').slice(0, 7);
  if (!e.recurring || e.stopped || e.paused) return debut === mk ? 1 : 0;
  if (debut > mk) return 0;
  if (e.recurring === 'mensuel') return 1;
  const [y, m] = mk.split('-').map(Number);
  if (!y || !m) return 0;
  const jour = new Date(`${e.date}T12:00:00`).getDay();
  const fin = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= fin; d += 1) if (new Date(y, m - 1, d).getDay() === jour) n += 1;
  return n;
};

export const expenseTotal = (e: Expense): number =>
  e.items && e.items.length ? e.items.reduce((s, it) => s + it.amountXof, 0) : e.amountXof;

/** CE QUE LE MOIS `mk` A COÛTÉ — une seule porte pour tous les écrans.

    La Synthèse et l'onglet Dépenses comptaient déjà une récurrente autant de
    fois qu'elle traverse le mois (`expenseTotal × expenseOccurrences`) ; le
    Dashboard, lui, ne la comptait qu'à son mois de saisie — un loyer de
    300 000 F rendait le « Résultat net » du mois trop beau d'autant face à la
    Synthèse. Le calcul vit donc ici, appelé des deux côtés : deux additions qui
    divergent disent deux résultats pour le même mois.

    `cut` (aaaa-mm-jj) sert la comparaison mois-à-date des KPI : une dépense
    PONCTUELLE ne compte que si elle est engagée au plus tard ce jour ; une
    récurrente est un engagement du mois entier et compte dès que le mois court,
    pour que le mois précédent se lise au même point que le mois en cours. */
export const depensesDuMois = (
  expenses: readonly Expense[], branchId: string, mk: string, cut?: string,
): number =>
  expenses
    .filter((e) => e.branchId === branchId && !e.stopped)
    .reduce((s, e) => {
      const occ = expenseOccurrences(e, mk);
      if (occ === 0) return s;
      const ponctuelle = !e.recurring || e.paused;
      if (cut && ponctuelle && (e.date ?? '') > cut) return s;
      return s + expenseTotal(e) * occ;
    }, 0);

/** LES REVENUS D'UNE DÉPENSE, BORNÉS PAR CE QU'ELLE A COÛTÉ.

    UNE DÉPENSE NE PEUT PAS CONSOMMER PLUS QU'ELLE N'A DÉPENSÉ. L'invariant
    paraît évident ; il ne l'était pas. Le 21 août, cocher un revenu AVANT de
    saisir le montant lui prenait tout son reste (le sélecteur retombait sur
    « prends tout » quand rien ne manquait encore) : une dépense de 3 000 F
    déclarait 40 000 F pris, et le revenu de la cliente s'affichait « épuisé »
    partout ailleurs.

    Le geste est réparé à la saisie, mais la borne vit ICI — au plus près de la
    lecture. Une écriture douteuse, d'où qu'elle vienne, ne peut plus fausser
    le reste d'un revenu ni la ligne de provenance : ce qui dépasse est ignoré,
    en cascade, dans l'ordre où les revenus ont été désignés. */
export const sourcesDe = (e: Expense): DepenseSource[] => {
  const sources = e.sources ?? [];
  if (sources.length === 0) return sources;
  let reste = expenseTotal(e);
  const bornees: DepenseSource[] = [];
  for (const s of sources) {
    const part = Math.min(s.xof, Math.max(0, reste));
    reste -= part;
    if (part > 0) bornees.push(part === s.xof ? s : { ...s, xof: part });
  }
  return bornees;
};

/** CE QUE LES DÉPENSES ONT DÉJÀ PRIS, revenu par revenu. Une seule passe pour
    tout l'écran : le sélecteur pose la question pour chaque revenu de la
    caisse, et interroger la liste des dépenses à chaque ligne la relirait
    autant de fois qu'il y a de revenus.

    `sauf` exclut une dépense du décompte — celle qu'on est en train de
    modifier, sans quoi elle se verrait refuser sa propre part. */
export const partsPrisesParRevenu = (
  expenses: readonly Expense[], sauf?: string,
): Map<string, number> => {
  const pris = new Map<string, number>();
  for (const e of expenses) {
    if (e.id === sauf || !e.sources) continue;
    for (const s of sourcesDe(e)) pris.set(s.ref, (pris.get(s.ref) ?? 0) + s.xof);
  }
  return pris;
};

/** La part d'une dépense qui n'est rattachée à aucun revenu — jamais négative.
    Ce n'est pas une faute : une dépense peut dépasser ce que la caisse sait
    nommer, et le dire vaut mieux que l'inventer. */
export const partNonNommee = (e: Expense): number =>
  Math.max(0, expenseTotal(e) - sourcesDe(e).reduce((s, x) => s + x.xof, 0));

/** L'ÉTAT D'UN REVENU — 21 août 2026, « où retrouver le bilan des revenus
    entamés et terminés ». Trois états, et un seul juge : ce qui a été pris.

    INTACT  · rien n'y a encore été puisé — l'argent dort entier en caisse.
    ENTAMÉ  · une dépense au moins y a puisé, il en reste.
    ÉPUISÉ  · tout a servi.

    La comparaison est en « au moins » (`>=`) et non en égalité : une écriture
    douteuse pourrait déclarer plus que le revenu n'a apporté, et un tel cas
    doit se lire « épuisé », jamais retomber dans « entamé » par accident.
    (`sourcesDe` borne déjà ce dépassement en amont ; ceci est la ceinture.) */
export type EtatRevenu = 'intact' | 'entame' | 'epuise';

export const etatDuRevenu = (montantXof: number, prisXof: number): EtatRevenu => {
  if (prisXof <= 0) return 'intact';
  return prisXof >= montantXof ? 'epuise' : 'entame';
};

export const LIBELLE_ETAT: Record<EtatRevenu, string> = {
  intact: 'Intact', entame: 'Entamé', epuise: 'Épuisé',
};

/** LE REVENU EST-IL ENTAMÉ PAR CETTE DÉPENSE-LÀ ? Vrai quand aucune dépense
    ANTÉRIEURE n'y a puisé — c'est la question de Yéman : « quand j'ai entamé
    un autre revenu, le savoir ». L'ordre est celui de la date de dépense, puis
    de l'identifiant : deux dépenses du même jour doivent trancher pareil quel
    que soit l'ordre de lecture, sinon la pastille sauterait d'une ligne à
    l'autre au gré des synchronisations. */
export const entameLeRevenu = (
  expenses: readonly Expense[], dep: Expense, ref: string,
): boolean => !expenses.some((e) => e.id !== dep.id
  && sourcesDe(e).some((s) => s.ref === ref)
  && (e.date < dep.date || (e.date === dep.date && e.id < dep.id)));

export type Budget = { id: string; branchId: string; category: string; monthlyXof: number };

/** Caisse — chaque branche tient plusieurs caisses. */
export type Cashbox = {
  id: string;
  branchId: string;
  name: string;
  sub: string; // type / référence
  glyph: string;
  /** Solde d'ouverture du mois, DANS LA DEVISE DE LA CAISSE (voir `currency`).
      Le nom du champ est historique : avant les caisses en devise, tout était
      en XOF. Renommer casserait les données déjà enregistrées. */
  openingXof: number;
  /** Devise physiquement détenue. Absente = la devise de la maison.
      Une caisse en devise garde des billets étrangers : elle ne reçoit que des
      règlements dans SA devise, et son solde se compte dans cette devise —
      jamais reconverti, sinon le compte ne tomberait plus juste avec le tiroir. */
  currency?: string;
  /** ── OUVERTE À L'ÉQUIPE — 31 août 2026 ────────────────────────
      « Pour les employés une seule caisse est disponible pour eux. La caisse
      indépendante. Toutes les autres ne sont pas visibles » (Yéman).

      Le nom des tiroirs de la Maison dit déjà beaucoup : Wells Fargo,
      Scotiabank, Real Money, un tiroir en euros. Les montrer à qui n'a que ses
      propres dépenses à saisir, c'est lui dire où dort l'argent.

      ABSENT = FERMÉ AUX MAÎTRES, MAIS SEULEMENT SI UNE AUTRE EST OUVERTE. Tant
      qu'aucune caisse ne porte ce drapeau, elles restent toutes visibles :
      sinon la mise en ligne aurait retiré à tout le monde la possibilité de
      saisir une dépense, faute d'un tiroir où l'imputer. */
  equipe?: boolean;

  /** ── UNE CAISSE DISCRÈTE — 22 août 2026 ────────────────────────
      « Je veux masquer son solde et le démasquer avec un mot de passe. »

      L'EMPREINTE DU CODE, JAMAIS LE CODE. Une application web ne met rien en
      coffre-fort : ce qu'elle sait, la base le sait aussi, et la sauvegarde
      avec elle. On n'écrit donc que l'empreinte SHA-256 du code, salée par
      l'identifiant de la caisse — le code lui-même ne quitte jamais le clavier.

      CE QUE CELA PROTÈGE : un regard par-dessus l'épaule au comptoir, un écran
      resté ouvert, une main qui passe. CE QUE CELA NE PROTÈGE PAS : quiconque
      a accès à la base ou au fichier de sauvegarde. Le dire vaut mieux que de
      laisser croire à un coffre. */
  /* ── UNE CAISSE TENUE PAR QUELQU’UN — 23 août 2026 ──────────────
     « Des personnes à qui je remets tout le temps de l’argent. » Ce qu’on
     leur confie n’est ni une dépense ni un prêt : c’est de l’argent de la
     Maison, dans d’autres mains. C’est donc UNE CAISSE — et le nom du porteur
     la distingue d’un tiroir du comptoir.

     CE QUE ÇA REND POSSIBLE, ET QUE RIEN D AUTRE NE RENDAIT : savoir ce qui
     RESTE dans ses mains. Remis moins dépensé — c’est le solde, et le relevé
     le dit ligne à ligne. */
  porteur?: string;
  codeHash?: string;
  /** ── HORS BILAN — 22 août 2026 ──────────────────────────────────
      « J'aimerais exclure des caisses du total dans mes bilans. »

      Une caisse peut ne pas être celle de la Maison : une épargne
      personnelle, un tiroir tenu pour quelqu'un d'autre. Ce qui y entre n'est
      pas un revenu de la Maison, ce qui en sort n'est pas une de ses
      dépenses, et son solde ne fait pas partie de sa trésorerie.

      L'EXCLUSION SE DIT TOUJOURS À L'ÉCRAN. Un total amputé en silence est
      pire qu'un total complet : on le croirait faux sans savoir pourquoi. */
  horsBilan?: boolean;
};

/** Les NOMS des caisses écartées des bilans — c'est le nom qui sert de clé
    partout (`Expense.cashbox`, `InvoicePayment.cashbox`). */
/* ── LES CAISSES EN DEVISE, ÉCARTÉES MAIS NOMMÉES — 22 août 2026 ────
   « Pourquoi je ne vois pas les caisses USD ? » Parce que quatre formulaires
   — prêt, avoir, prestataire, versement au coffre — saisissent un montant en
   monnaie de la Maison, et qu’inscrire des francs dans un tiroir en dollars
   fausserait son solde : le tiroir compte SES billets. Le filtre est juste.

   CE QUI NE L’ÉTAIT PAS, C’EST LE SILENCE. La liste omettait ces caisses sans
   un mot, et une absence sans raison se lit comme une panne. Elles sont
   désormais nommées sous le champ — même règle que les caisses discrètes
   exclues de la trésorerie, et que les caisses hors bilan du rapport. */
/* ── CE QU’UNE ÉCRITURE FAIT À SON TIROIR — 22 août 2026 ────────────
   « Ok pour multi-devise. » Un tiroir compte SES billets : une caisse en
   dollars ne connaît que des dollars. Toute écriture qui nomme une caisse
   porte donc DEUX montants — `amountXof`, la seule base comptable de la
   Maison (dette, avoir, charge, coffre), et `fx.amount`, ce qui a réellement
   quitté ou rejoint le tiroir. Même contrat que `InvoicePayment.fx`, posé le
   11 août : on ne convertit jamais après coup, on inscrit ce qui a bougé.

   UNE ÉCRITURE SANS `fx` SUR UN TIROIR EN DEVISE NE PÈSE RIEN. On ne sait pas
   combien de dollars sont sortis, et deviner à un taux du jour ferait bouger
   des soldes déjà arrêtés. Elle vaut zéro pour le tiroir, et les écrans le
   DISENT ligne à ligne — c’est réparable d’un clic, l’inventer ne l’est pas. */
export type EcritureDeTiroir = { amountXof: number; fx?: { code: string; rate: number; amount: number } };
export const surLeTiroir = (e: EcritureDeTiroir, deviseDuTiroir: string, maison: string): number =>
  (deviseDuTiroir === maison
    ? e.amountXof
    : (e.fx && e.fx.code === deviseDuTiroir ? e.fx.amount : 0));

/** L’écriture nomme un tiroir en devise mais ne dit pas combien il en est
    sorti — la ligne existe, le tiroir ne peut pas la compter. */
export const montantMuet = (e: EcritureDeTiroir, deviseDuTiroir: string, maison: string): boolean =>
  deviseDuTiroir !== maison && !(e.fx && e.fx.code === deviseDuTiroir);
/* ── LA PIÈCE JOINTE D’UNE ÉCRITURE — 23 août 2026 ─────────────────
   « Après note, j’aimerais attacher un fichier ou une photo. » Un reçu, un
   bordereau, la capture d’un virement : la preuve de ce qui est écrit.

   SEULE L’ADRESSE EST ENREGISTRÉE, jamais le fichier. Les magasins du Trône
   vivent dans le localStorage du navigateur et passent en entier à la
   synchronisation : y glisser une photo saturerait l’un et gonflerait
   l’autre — c’est exactement ce qui avait vidé les fiches du MacBook le
   21 août. Le fichier dort dans le compartiment privé, la ligne n’en garde
   que le chemin. */
export type PieceJointe = { chemin: string; nom: string; type: string; taille: number };
/* ── CEUX QUI ACHÈTENT POUR LA MAISON — 23 août 2026 ───────────────
   Une liste tenue par la Maison, comme les fonctions de l’équipe : une faute
   de frappe ne doit pas fabriquer un second porteur, et le résumé de l’année
   ne doit pas se casser sur « Sandrine » contre « sandrine ». */
/** La caisse tenue par un porteur, s’il en a une. */
/* ── LA CAISSE QUI S’OFFRE D’ABORD — 24 août 2026 ──────────────────
   « Je ne veux pas que ce soit la caisse Euro la première à apparaître. »
   Le formulaire prenait la PREMIÈRE caisse venue — celle du haut de la liste,
   c’est-à-dire la plus anciennement créée. Un tiroir en euros se proposait
   ainsi pour payer un achat en francs : le montant s’annonçait en EUR et il
   fallait le corriger à chaque fois.

   LA MONNAIE DE LA MAISON PASSE D’ABORD. Parmi ses caisses, c’est l’ordre
   voulu par la Souveraine qui tranche (« Ranger les caisses ») — donc elle
   décide, sans qu’on ait à coder un nom en dur. Aucune caisse dans la monnaie
   de la Maison ? On retombe sur la première venue : mieux vaut un tiroir en
   devise que pas de tiroir du tout. */
export const caisseParDefaut = (
  boxes: readonly Cashbox[], branchId: string, maison: string,
): Cashbox | undefined => {
  const siennes = boxes.filter((c) => c.branchId === branchId);
  return siennes.find((c) => cashboxCurrency(c) === maison) ?? siennes[0];
};

/** LES CAISSES QU'UN COMPTE RESTREINT PEUT VOIR — 31 août 2026.

    LA RÈGLE ÉCHOUE OUVERT, ET C'EST VOULU : tant que la Maison n'a désigné
    AUCUNE caisse d'équipe, elles restent toutes visibles. Un employé sans
    aucun tiroir ne pourrait plus rien saisir, et il chercherait la panne au
    lieu de comprendre le réglage. */
export const caissesPourLEquipe = <T extends { equipe?: boolean }>(
  boxes: readonly T[], voitTout: boolean,
): T[] => {
  if (voitTout) return boxes.slice();
  const ouvertes = boxes.filter((c) => c.equipe === true);
  return ouvertes.length > 0 ? ouvertes : boxes.slice();
};

export const caisseDuPorteur = (
  boxes: readonly Cashbox[], branchId: string, nom: string,
): Cashbox | undefined => boxes.find((c) => c.branchId === branchId
  && (c.porteur ?? '').trim().toLowerCase() === nom.trim().toLowerCase());

export const porteursStore = createStore<string[]>('mnd_porteurs', []);
export const usePorteurs = () => useStore(porteursStore);
export const ajouteUnPorteur = (nom: string): void => {
  const propre = nom.trim();
  if (!propre) return;
  porteursStore.set((prev) => (prev.some((x) => x.toLowerCase() === propre.toLowerCase())
    ? prev
    : [...prev, propre]));
};

/** Ce que chacun a acheté sur une période — le résumé, en une fonction. */
export type AchatsDUnPorteur = { nom: string; total: number; n: number; dernier: string };
export const achatsParPorteur = (liste: readonly Expense[]): AchatsDUnPorteur[] => {
  const par = new Map<string, AchatsDUnPorteur>();
  for (const e of liste) {
    const nom = (e.porteur ?? '').trim();
    if (!nom) continue;
    const cle = nom.toLowerCase();
    const d = par.get(cle);
    if (d) {
      d.total += expenseTotal(e); d.n += 1;
      if (e.date > d.dernier) { d.dernier = e.date; d.nom = nom; }
    } else {
      par.set(cle, { nom, total: expenseTotal(e), n: 1, dernier: e.date });
    }
  }
  return [...par.values()].sort((a, b) => b.total - a.total);
};

export const caissesEnDevise = (boxes: readonly Cashbox[], branchId: string, maison: string): Cashbox[] =>
  boxes.filter((b) => b.branchId === branchId && cashboxCurrency(b) !== maison);

/** La phrase à poser sous le champ — `null` quand il n’y a rien à dire. */
export const motDesCaissesEnDevise = (ecartees: readonly Cashbox[], maison: string): string | null => {
  if (ecartees.length === 0) return null;
  const noms = ecartees.map((b) => `${b.name} (${cashboxCurrency(b)})`).join(
);
  return `${noms} ${ecartees.length > 1 ? "n’apparaissent" : "n’apparaît"} pas ici : ce montant se saisit en ${maison}, `
    + `et l’inscrire dans un tiroir en devise fausserait son solde, un tiroir compte SES billets.`;
};
export const caissesHorsBilan = (boxes: readonly Cashbox[], branchId: string): Set<string> =>
  new Set(boxes.filter((c) => c.branchId === branchId && c.horsBilan).map((c) => c.name));

/** CE QUI EST ENTRÉ SUR UNE PIÈCE, LES CAISSES ÉCARTÉES EN MOINS. Même règle
    que `invoiceRegleAu` — versement par versement, chacun à son mois — mais
    les versements tombés dans une caisse hors bilan n'y comptent pas. */
export const invoiceRegleAuSauf = (
  inv: Invoice, prefixeIso: string, exclues: ReadonlySet<string>,
): number =>
  invoiceReglements(inv)
    .filter((p) => (p.date ?? '').startsWith(prefixeIso))
    .filter((p) => !exclues.has(p.cashbox ?? ''))
    .reduce((s, p) => s + p.amountXof, 0);

/** L'EMPREINTE D'UN CODE — salée par l'identifiant de la caisse, pour que deux
    caisses au même code n'aient pas la même empreinte. Le navigateur seul fait
    le calcul ; le code ne part nulle part. */
export async function empreinteDuCode(caisseId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`mnd:${caisseId}:${code}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Une caisse dont le solde ne se montre pas sans son code. */
export const caisseDiscrete = (c: Cashbox): boolean => !!c.codeHash;

/** Devise d'une caisse — XOF par défaut. */
export const cashboxCurrency = (b: Cashbox): string => b.currency || 'XOF';

/** Une caisse tient-elle une devise étrangère (≠ devise de la maison) ? */
export const isFxCashbox = (b: Cashbox, houseCurrency: string): boolean =>
  cashboxCurrency(b) !== houseCurrency;

/** Nomenclature des dépenses — catégories & sous-catégories créables. */
export type ExpenseCategory = { id: string; name: string; subs: string[] };

/** Total encaissable : lignes remisées, puis remise globale en %, puis remise en
    CFA. Jamais négatif. Le pourboire (`tipXof`) n'y entre JAMAIS — depuis le
    11 août il ne crédite même plus la caisse de la facture : il vit sur sa
    propre ligne du registre des encaissements, caisse « Pourboires ». */
/** Ce que vaut UNE ligne, remises de ligne comprises — pourcentage d'abord,
    francs ensuite, jamais négatif. Une seule définition : trois écrans
    recalculaient la ligne à la main, et le jour où la remise en francs est
    arrivée, ils auraient divergé un par un. */
export const ligneNetXof = (l: InvoiceLine): number =>
  Math.max(0, l.qty * l.unitXof * (1 - l.discountPct / 100) - (l.discountXof ?? 0));

export const invoiceTotal = (inv: Invoice): number => {
  const sub = inv.lines.reduce((s, l) => s + ligneNetXof(l), 0);
  return Math.max(0, Math.round(sub * (1 - inv.globalDiscountPct / 100)) - (inv.globalDiscountXof ?? 0));
};

/** CE QUI ENTRE EN BILLETS le jour du solde : le total, moins la part réglée
    par AVOIR (un crédit, pas des billets) et moins l'acompte DÉJÀ reçu (entré
    un autre jour, souvent dans une autre caisse). Trois écrans recalculaient
    cette formule chacun de leur côté — registre des encaissements, relevé de
    caisse, tableau de bord — et le retrait du pourboire a dû s'y éditer en
    parallèle (12 août) : UNE formule désormais, ici. */
export const invoiceCashXof = (inv: Invoice): number =>
  invoiceTotal(inv) - (inv.avoirXof ?? 0) - (inv.depositCreditXof ?? 0);

/** LES RÈGLEMENTS D'UNE PIÈCE — la liste, ou sa lecture rétro-compatible.

    Les pièces d'avant le 17 août ne portent pas de journal : elles ont un seul
    moyen (`payment`), une seule caisse et un statut. On leur en FABRIQUE un
    d'une entrée quand elles sont soldées, pour que tous les lecteurs — caisse,
    Synthèse, Bilan, reçus — n'aient plus qu'UNE façon de lire l'argent d'une
    facture. Sans ce repli, chaque écran aurait dû connaître les deux formes,
    et c'est ainsi qu'un chiffre finit par diverger d'un écran à l'autre. */
export const invoiceReglements = (inv: Invoice): InvoicePayment[] => {
  if (inv.payments && inv.payments.length > 0) return inv.payments;
  if (inv.status !== 'payée') return [];
  return [{
    id: `ip-${inv.id}`,
    date: inv.date,
    amountXof: invoiceTotal(inv),
    method: inv.payment ?? 'Espèces',
    cashbox: inv.cashbox,
    time: inv.time,
    /* La devise de la pièce d'avant descend sur son versement unique : les
       lectures par versement (tiroir en devise, PDF) n'ont ainsi qu'UNE forme. */
    ...(inv.fx ? { fx: inv.fx } : {}),
  }];
};

/** CE QUI A ÉTÉ RÉELLEMENT REÇU sur la pièce, tous versements confondus. */
export const invoiceRegleXof = (inv: Invoice): number =>
  invoiceReglements(inv).reduce((s, p) => s + p.amountXof, 0);

/** CE QUI RESTE DÛ. Jamais négatif : un trop-perçu est un avoir, pas une dette
    en creux — il se traite ailleurs, il ne se soustrait pas ici. */
export const invoiceResteXof = (inv: Invoice): number =>
  Math.max(0, invoiceTotal(inv) - invoiceRegleXof(inv));

/** La pièce est-elle soldée ? Le STATUT suit l'argent, il ne le décide pas. */
export const invoiceSoldee = (inv: Invoice): boolean =>
  invoiceRegleXof(inv) >= invoiceTotal(inv);

/** CE QUI EST ENTRÉ SUR CETTE PIÈCE UN JOUR DONNÉ (`YYYY-MM-DD`).

    Une pièce ne contribue plus « en bloc au jour de sa date » : elle contribue
    versement par versement, chacun au SIEN. Hermine règle 30 000 F le 12 et
    51 000 F le 28 — une seule facture, deux mois. Compter la pièce entière au
    jour de son émission rangerait 51 000 F dans un mois où ils ne sont pas
    entrés ; c'est la faute que le découpage en deux pièces masquait.

    Passer un préfixe de mois (`YYYY-MM`) donne le mois entier : la comparaison
    se fait sur le début de la chaîne ISO, jamais sur un objet Date — construire
    une date pour en extraire un mois fait basculer d'un jour selon le fuseau. */
export const invoiceRegleAu = (inv: Invoice, prefixeIso: string): number =>
  invoiceReglements(inv)
    .filter((p) => (p.date ?? '').startsWith(prefixeIso))
    .reduce((s, p) => s + p.amountXof, 0);

/** CE QUI EST ENTRÉ EN BILLETS un jour donné — l'avoir et l'acompte écartés.
    L'avoir est un crédit consommé, pas une devise ; l'acompte est déjà entré
    ailleurs, un autre jour. Même doctrine que `invoiceCashXof`, mais versement
    par versement. */
export const invoiceCaisseAu = (inv: Invoice, prefixeIso: string): number =>
  invoiceReglements(inv)
    .filter((p) => (p.date ?? '').startsWith(prefixeIso) && p.method !== 'Avoir' && p.method !== 'Acompte')
    .reduce((s, p) => s + p.amountXof, 0);

export const INVOICE_THEMES = ['Rose', 'Arbre', 'Oiseau', 'Voyage', 'Aube', 'Souffle'] as const;

/** Prochain numéro d'une SÉRIE de documents (préfixe + année) : compteur monotone
    par série et par an, PLUS vérification d'unicité avant écriture. Les anciens
    tirages (4 derniers chiffres de l'horodatage — qui se répètent toutes les 10 s
    et d'un jour à l'autre — ou max des 4 derniers chiffres toutes séries
    confondues) finissaient par produire des numéros DUPLIQUÉS sur des documents
    client : cauchemar de rapprochement comptable. On ne lit que les numéros de la
    même série (`PREFIX-ANNÉE-N`) — les numéros repris de l'ancien ERP
    (MND-V-…) n'inflatent plus le compteur. Le suffixe grandit au-delà de 4
    chiffres sans troncature. Résiduel accepté : deux appareils HORS LIGNE peuvent
    encore tirer le même numéro dans la même fenêtre de synchronisation. */
/* 'MND-D' est la serie des DEVIS. Le motif ancre en debut et en fin
   (`^MND-2026-(\d+)$`) ne confond pas les deux series : un devis
   « MND-D-2026-0007 » ne compte pas dans les factures, ni l'inverse. */
export function nextInvoiceNumber(invoices: Invoice[], prefix: 'MND' | 'MND-D' | 'F'): string {
  const year = new Date().getFullYear();
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const used = new Set<string>();
  let max = 0;
  for (const i of invoices) {
    if (!i?.number) continue;
    used.add(i.number);
    const m = re.exec(i.number);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let n = max + 1;
  let num = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
  while (used.has(num)) {
    n += 1;
    num = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
  }
  return num;
}

/* ═══════ LA PIÈCE SE CONSTRUIT ICI, ET NULLE PART AILLEURS ═══════

   Quatre écrans émettaient chacun leur facture à la main — la Caisse,
   l'encaissement d'un rituel (deux pièces), l'écran Factures et le
   Laboratoire. Quatre copies des mêmes défauts possibles : un numéro tiré
   d'une liste de rendu périmée, une heure formatée autrement, un « walkin »
   écrit tel quel dans la pièce. Le constructeur ci-dessous est le seul
   chemin ; chaque écran ne dit plus que ce qui lui est propre.

   MA COURONNE N'EMPRUNTE PAS CE CHEMIN, et c'est voulu : sous RLS une
   cliente ne voit que SES pièces — un compteur de série calculé chez elle
   répéterait les numéros des autres. Sa commande de la Gamme tire un numéro
   aléatoire dans sa propre série (CMD-…, couronne/Tabs.tsx). */

/** La série dit le circuit d'origine, et c'est un DIAGNOSTIC : `F` n'est
    émise que par l'encaissement de rituel, toujours payée — une pièce F
    « envoyée » ne peut être qu'un résidu d'annulation (9 août). `MND` vient
    du comptoir (Caisse, Factures, Laboratoire), `MND-D` des devis. */
export type SerieFacture = 'MND' | 'MND-D' | 'F';

export type FactureNeuve = {
  branchId: string;
  clientId?: string;
  /** Nom libre quand la cliente n'est pas au CRM. */
  clientName?: string;
  forClientId?: string;
  /** Défaut : le jour LOCAL — entre minuit et une heure à Cotonou,
      toISOString daterait la veille et couperait la nuit comptable en deux. */
  date?: string;
  lines?: InvoiceLine[];
  globalDiscountPct?: number;
  globalDiscountXof?: number;
  discountLabel?: string;
  fx?: Invoice['fx'];
  theme?: Invoice['theme'];
  payment?: PaymentMethod;
  cashbox?: string;
  master?: string;
  note?: string;
  tipXof?: number;
  avoirXof?: number;
  depositCreditXof?: number;
} & (
  /* La série F est TOUJOURS payée — le type l'impose, pour que la lecture
     des résidus (une F « envoyée » = un encaissement annulé) reste vraie. */
  | { serie: 'F'; status?: 'payée' }
  | { serie: 'MND' | 'MND-D'; status: Invoice['status'] }
);

const jourLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Une ligne de pièce — le même identifiant d'un circuit à l'autre. */
export const ligneFacture = (label: string, unitXof: number, qty = 1, discountPct = 0): InvoiceLine =>
  ({ id: `il-${uid()}`, label, qty, unitXof, discountPct });

/** Une ligne qui vend un PRODUIT de la Gamme. Elle porte sa fiche, pour que le
    stock sache quoi sortir et la commission sache la reconnaître. */
export const ligneProduit = (
  produitId: string, label: string, unitXof: number, qty = 1, discountPct = 0,
): InvoiceLine => ({ ...ligneFacture(label, unitXof, qty, discountPct), produitId });

/** Le total des seules lignes de PRODUIT d'une pièce, remises comprises. */
export const totalProduitsXof = (i: Pick<Invoice, 'lines'>): number =>
  (i.lines ?? []).reduce((n, l) => (l.produitId ? n + ligneNetXof(l) : n), 0);

export function nouvelleFacture(f: FactureNeuve): Invoice {
  /* LE NUMÉRO SE TIRE DU MAGASIN, jamais d'une liste de rendu : la valeur
     qu'un composant tient en main date de son dernier rendu, et un numéro
     tiré d'elle peut répéter celui qu'un autre poste vient d'écrire. Le
     magasin, lui, est à jour à l'instant du geste. Résiduel accepté : deux
     appareils HORS LIGNE peuvent encore se croiser (voir nextInvoiceNumber). */
  const number = nextInvoiceNumber(invoicesStore.get(), f.serie);
  /* LE FANTÔME NE TRAVERSE PAS : « walkin » est un marqueur d'écran, pas une
     cliente — écrit tel quel dans une pièce, il ouvrait une fiche fourre-tout
     au CRM (useReconcileClients). La traduction vaut pour tous les circuits. */
  const walkin = f.clientId === 'walkin';
  const clientId = walkin ? '' : f.clientId ?? '';
  const clientName = walkin ? f.clientName ?? 'Walk-in' : f.clientName;
  const status: Invoice['status'] = f.serie === 'F' ? 'payée' : f.status;
  return {
    id: `inv-${uid()}`,
    branchId: f.branchId,
    kind: f.serie === 'MND-D' ? 'devis' : 'facture',
    number,
    clientId,
    date: f.date ?? jourLocal(),
    lines: f.lines ?? [],
    globalDiscountPct: f.globalDiscountPct ?? 0,
    theme: f.theme ?? 'Aube',
    status,
    /* L'heure n'a de sens que sur un encaissement — c'est le journal de caisse. */
    ...(status === 'payée' ? { time: new Date().toTimeString().slice(0, 5) } : {}),
    ...(clientName ? { clientName } : {}),
    ...(f.forClientId ? { forClientId: f.forClientId } : {}),
    ...(f.globalDiscountXof ? { globalDiscountXof: f.globalDiscountXof } : {}),
    ...(f.discountLabel ? { discountLabel: f.discountLabel } : {}),
    ...(f.fx ? { fx: f.fx } : {}),
    ...(f.payment ? { payment: f.payment } : {}),
    ...(f.cashbox ? { cashbox: f.cashbox } : {}),
    ...(f.master ? { master: f.master } : {}),
    ...(f.note ? { note: f.note } : {}),
    ...(f.tipXof ? { tipXof: f.tipXof } : {}),
    ...(f.avoirXof ? { avoirXof: f.avoirXof } : {}),
    ...(f.depositCreditXof ? { depositCreditXof: f.depositCreditXof } : {}),
  };
}

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const INVOICES_SEED: Invoice[] = [];

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const EXPENSES_SEED: Expense[] = [];

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const BUDGETS_SEED: Budget[] = [];

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const CASHBOXES_SEED: Cashbox[] = [];

export const EXPENSE_CATEGORIES_SEED: ExpenseCategory[] = [
  { id: 'ec-local', name: 'Local', subs: ['Loyer', 'Énergie', 'Internet & téléphone', 'Entretien des lieux'] },
  { id: 'ec-matieres', name: 'Matières premières', subs: ['Beurres', 'Plantes & actifs', 'Contenants & packaging', 'Cristaux & poudres'] },
  { id: 'ec-salaires', name: 'Salaires', subs: ['Base fixe', 'Commissions', 'Primes', 'Charges sociales'] },
  { id: 'ec-marketing', name: 'Marketing', subs: ['Publicité réseaux', 'Shooting & contenu', 'Influence & RP', 'Le Couronnement'] },
  { id: 'ec-logistique', name: 'Logistique', subs: ['Livraisons', 'Transport équipe', 'Coursiers', 'Stockage'] },
  { id: 'ec-equipement', name: 'Équipement', subs: ['Fauteuils & miroirs', 'Outils & ciseaux', 'Informatique', 'Mobilier'] },
  { id: 'ec-frais', name: 'Frais bancaires', subs: ['Commissions Mobile Money', 'Frais de compte', 'Agios'] },
  { id: 'ec-divers', name: 'Divers', subs: ['Imprévu', 'Cadeaux clientes', 'Formation externe', 'Autre'] },
];

export const invoicesStore = createStore<Invoice[]>('mnd_invoices', INVOICES_SEED);
export const expensesStore = createStore<Expense[]>('mnd_expenses', EXPENSES_SEED);
export const budgetsStore = createStore<Budget[]>('mnd_budgets', BUDGETS_SEED);
export const cashboxesStore = createStore<Cashbox[]>('mnd_cashboxes', CASHBOXES_SEED);
export const expenseCategoriesStore = createStore<ExpenseCategory[]>('mnd_expense_categories', EXPENSE_CATEGORIES_SEED);
/** Liste gérable des moyens de paiement (Paramètres), synchronisée Supabase. */
export const paymentMethodsStore = createStore<string[]>('mnd_payment_methods', PAYMENT_METHODS_DEFAULT);

export const useInvoices = () => useStore(invoicesStore);
export const useExpenses = () => useStore(expensesStore);
/** LES DÉPENSES QUI COMPTENT — la porte normale des écrans qui font des
    chiffres. `useExpenses` donne le registre BRUT, en attente comprise : il ne
    sert qu'à écrire, et à l'écran des Dépenses qui doit montrer la file.

    ON FILTRE À LA SOURCE, jamais au moment d'afficher : les totaux, les
    budgets, les soldes et les exports se dérivent les uns des autres, et un
    seul dérivé oublié ferait entrer dans les comptes ce que personne n'a
    encore regardé. */
export const useDepensesComptees = (): Expense[] => {
  const [toutes] = useStore(expensesStore);
  return useMemo(() => depensesComptees(toutes), [toutes]);
};
export const useBudgets = () => useStore(budgetsStore);
export const useCashboxes = () => useStore(cashboxesStore);
export const useExpenseCategories = () => useStore(expenseCategoriesStore);
export const usePaymentMethods = () => useStore(paymentMethodsStore);

/* ---------- Coffre-fort — épargne verrouillée ----------
   Registre d'épargne SÉPARÉ : on y met de côté une part du chiffre DÉJÀ gagné.
   Il n'entre PAS dans le chiffre d'affaires ni dans les dépenses (aucun écran de
   finances ne le compte). Aucune dépense possible depuis le coffre : la SEULE
   sortie autorisée est un virement vers la banque. Money = collection (une ligne
   par mouvement, jamais un document LWW) pour ne jamais perdre un dépôt. */
export type CoffreMovement = {
  id: string;
  branchId: string;
  /** dépôt (entrée) · virement bancaire (sortie définitive) · retrait (retour
      dans une caisse) — 22 août 2026.

      LE COFFRE N'EST PLUS UNE IMPASSE. Il n'avait qu'une sortie : la banque.
      L'intention était bonne — une épargne qui ne s'effrite pas au fil des
      petites urgences — mais elle rendait le retour IMPOSSIBLE : reprendre
      100 000 F pour payer un fournisseur ne s'écrivait nulle part, et se
      contournait donc par une fausse écriture. Un retour proprement daté,
      nommé et rendu à une caisse fausse infiniment moins les soldes qu'un
      détour que personne ne relit.

      Ce qui reste verrouillé : on ne DÉPENSE toujours pas depuis le coffre.
      L'argent doit d'abord revenir dans un tiroir, et ce retour se voit. */
  kind: 'depot' | 'virement' | 'retrait';
  /** FLÉCHAGE INTERNE — 23 août 2026. Les deux lignes qui déplacent de
      l’argent du disponible vers un objectif, SANS rien faire entrer ni
      sortir du coffre. Le marqueur ne sert qu’à les nommer justement dans le
      registre : « Repris du coffre » mentirait, rien n’en est sorti. */
  flechage?: true;
  amountXof: number; // toujours positif ; le sens vient de `kind`
  date: string; // ISO AAAA-MM-JJ
  clientId?: string; // dépôt attribué à une cliente (source du revenu mis de côté)
  clientName?: string;
  bank?: string; // virement : banque / compte destinataire
  /** VERS QUEL OBJECTIF ce mouvement est fléché — 22 août 2026, « comment
      gérer les objectifs des économies (voyages, investissements, divers,
      scolarité…) ». Le coffre était UN SEUL TAS : il ne savait pas dire
      « ceci est pour la scolarité ». Absent = non fléché, et c'est un état
      normal, pas un oubli à corriger : cet argent-là est simplement
      disponible. Le fléchage est une LECTURE, jamais une serrure — un
      virement peut toujours partir, quel que soit l'objectif visé. */
  objectifId?: string;
  /** LES BILLETS RÉELLEMENT DÉPOSÉS quand le compartiment tient une AUTRE
      devise — 22 août 2026, « il y a des coffres qui ont différentes
      devises ». Même contrat que `InvoicePayment.fx` : `amount` est ce qui
      a été mis dans le coffre, `amountXof` reste la seule base comptable de
      la Maison. Sans ce champ, un dépôt de 200 € ne saurait dire que 200,
      et le compartiment afficherait sa contre-valeur en francs. */
  fx?: { code: string; rate: number; amount: number };
  /** LA CAISSE D'OÙ L'ARGENT SORT — 17 août 2026, décision de Yéman : « le
      coffre comme caisse ».

      Sans elle, mettre 50 000 F au coffre ne les retirait d'aucun tiroir : les
      mêmes francs vivaient dans la caisse créditée à l'encaissement ET dans le
      coffre. Chaque écran disait vrai séparément, et la trésorerie comptait
      deux fois. Un dépôt qui NOMME sa caisse la débite d'autant.

      Absente sur tous les mouvements d'avant cette date, et c'est voulu : ils
      ont été saisis sous l'autre convention, les rendre débiteurs après coup
      ferait bouger des soldes de caisse déjà arrêtés. Ils restent une mise de
      côté symbolique ; les nouveaux déplacent vraiment l'argent. */
  cashbox?: string;
  note?: string;
  /** Dépôt venu des RÉSERVES de Salon & Foyer — un virement interne, pas une
      part de chiffre mise de côté au comptoir. Ces lignes sont réservées au
      souverain côté serveur (migration 0040) : le budget du foyer et l'épargne
      du Partage sont l'affaire du couple, le reste du coffre ne bouge pas. */
  origine?: 'reserve';
  /** Laquelle des deux enveloppes du Partage a produit cette ligne. C'est le
      SEUL endroit où vit cette information : le coffre est le registre unique
      de l'épargne, les « réserves » n'en sont qu'une lecture par enveloppe. */
  enveloppe?: 'reinvestissement' | 'fiscale';
  /** Référence d'un mouvement apparié — libre, conservée pour l'historique. */
  ref?: string;
};
/** Montant signé d'un mouvement : + pour un dépôt, − pour un virement sortant. */
export const coffreSignedXof = (m: CoffreMovement): number => (m.kind === 'depot' ? m.amountXof : -m.amountXof);
/** Solde courant du coffre = dépôts − virements − retraits. Jamais négatif. */
export const coffreBalance = (moves: CoffreMovement[]): number => Math.max(0, moves.reduce((s, m) => s + coffreSignedXof(m), 0));

/* ── LES OBJECTIFS D'ÉPARGNE — 22 août 2026 ─────────────────────────
   Ce que la Maison met de côté, et POUR QUOI : une scolarité, un voyage, un
   second fauteuil. La progression ne s'écrit jamais — elle se calcule depuis
   les mouvements fléchés, comme le suivi des abonnements et le registre des
   encaissements. Un compteur écrit dériverait au premier écran oublié. */
export type ObjectifCoffre = {
  id: string;
  branchId: string;
  nom: string;
  /** LE MONTANT VISÉ — ou ZÉRO, et c'est un état à part entière : 22 août
      2026, « j'aimerais créer plusieurs coffres-forts dans le coffre-fort ».

      Un coffre dans le coffre n'est rien d'autre qu'un COMPARTIMENT : il
      contient, il ne vise pas. Ajouter une seconde façon de découper le
      coffre aurait fait deux axes, deux totaux, et le risque de compter deux
      fois les mêmes francs. Une cible facultative suffit : sans elle, la
      ligne est un compartiment — un solde, un nom, rien de plus ; avec elle,
      c'est un objectif — une jauge, un manque, et un rythme. */
  cibleXof: number;
  /** Le mois visé, « AAAA-MM ». Facultatif — et son absence a un sens : un
      objectif sans date ne peut JAMAIS être dit « en retard ». On ne reproche
      pas un retard à qui n'a pas donné de date. */
  echeance?: string;
  /** LA DEVISE TENUE PAR CE COMPARTIMENT. Absente = celle de la Maison.
      Un compartiment en euros ne s'additionne JAMAIS au solde en francs :
      c'est la règle déjà posée pour les caisses (`isFxCashbox`), et la
      confondre ferait un total qui n'existe nulle part. */
  devise?: string;
  note?: string;
  /** Atteint et refermé : il quitte la liste vivante sans effacer son histoire. */
  clos?: boolean;
  /* ── LE PLAN, ET SES JALONS — 23 août 2026 ──────────────────────
     « Un objectif doit avoir des milestones, tout comme les programmes de
     remboursement pour les prêts. » Le plan porte SON MONTANT : après trois
     versements irréguliers, cible ÷ nombre ne veut plus rien dire — ce qu’il
     faut mettre chaque mois dépend de ce qui RESTE. */
  plan?: { premier: string; nombre: number; montantXof: number };
  /** Des jalons posés à la main, nommés — ils font foi sur le rythme. */
  jalons?: { id: string; date: string; montantXof: number; nom?: string }[];
};

export const objectifsStore = createStore<ObjectifCoffre[]>('mnd_objectifs_coffre', []);
export const useObjectifs = () => useStore(objectifsStore);

/** CE QU'UN OBJECTIF A REÇU — les dépôts fléchés vers lui, moins les virements
    fléchés de même. Jamais négatif : un objectif qu'on a vidé est à zéro, il
    n'a pas de dette. */
export const recuParObjectif = (moves: readonly CoffreMovement[], objectifId: string): number =>
  Math.max(0, moves
    .filter((m) => m.objectifId === objectifId)
    .reduce((s, m) => s + coffreSignedXof(m), 0));

/** LA PART DU COFFRE QUE PERSONNE N'A FLÉCHÉE — de l'argent disponible, pas de
    l'argent perdu. Elle se déduit du solde réel : ainsi la somme des objectifs
    plus le non-fléché fait TOUJOURS le coffre, quoi qu'il arrive aux lignes. */
export const coffreNonFleche = (moves: readonly CoffreMovement[]): number =>
  Math.max(0, moves
    .filter((m) => !m.objectifId && !m.fx)
    .reduce((s, m) => s + coffreSignedXof(m), 0));

/** LA DEVISE D'UN COMPARTIMENT — celle de la Maison quand il n'en dit pas. */
export const deviseDuCompartiment = (o: ObjectifCoffre, maison: string): string => o.devise || maison;

export const compartimentEtranger = (o: ObjectifCoffre, maison: string): boolean =>
  deviseDuCompartiment(o, maison) !== maison;

/** CE QU'IL CONTIENT, DANS SA PROPRE DEVISE. Un compartiment en euros compte
    des euros : ce sont les billets qu'il tient, pas leur contre-valeur d'un
    jour. Un compartiment de la Maison compte en francs, comme avant. */
export const recuDansSaDevise = (
  moves: readonly CoffreMovement[], o: ObjectifCoffre, maison: string,
): number => {
  if (!compartimentEtranger(o, maison)) return recuParObjectif(moves, o.id);
  const devise = deviseDuCompartiment(o, maison);
  return Math.max(0, moves
    .filter((m) => m.objectifId === o.id && m.fx?.code === devise)
    .reduce((s, m) => s + (m.kind === 'depot' ? m.fx!.amount : -m.fx!.amount), 0));
};

/** LE SOLDE DU COFFRE, EN MONNAIE DE LA MAISON — les billets étrangers en
    sont EXCLUS. Additionner des euros à des francs ferait un nombre qui
    n'existe nulle part ; les compartiments en devise disent leur propre
    total, chacun chez lui. Même règle que la trésorerie des caisses. */
export const coffreBalanceMaison = (moves: readonly CoffreMovement[]): number =>
  Math.max(0, moves.filter((m) => !m.fx).reduce((s, m) => s + coffreSignedXof(m), 0));

/** CE QUE LE COFFRE A REÇU POUR DE VRAI — les vrais versements, en monnaie de la
    Maison. Les FLÉCHAGES (paires internes qui ne font rien entrer ni sortir) et
    les billets ÉTRANGERS en sont exclus, exactement comme pour le solde : sinon
    « Total versé » gonflait de chaque fléchage sans qu'un franc n'entre, et
    versé − sorti ne retombait jamais sur le solde affiché juste au-dessus.
    `mk` (« aaaa-mm ») borne au mois voulu ; absent, c'est depuis l'ouverture. */
export const coffreVerseXof = (moves: readonly CoffreMovement[], mk?: string): number =>
  moves
    .filter((m) => m.kind === 'depot' && !m.flechage && !m.fx && (!mk || m.date.slice(0, 7) === mk))
    .reduce((s, m) => s + m.amountXof, 0);

/** CE QUI EST SORTI VERS LA BANQUE — les virements seuls (la tuile le dit :
    « virements bancaires cumulés »), hors fléchage et hors devise. Un retrait
    rendu à une caisse est une autre sortie, nommée à part dans le registre. */
export const coffreSortiBanqueXof = (moves: readonly CoffreMovement[]): number =>
  moves
    .filter((m) => m.kind === 'virement' && !m.flechage && !m.fx)
    .reduce((s, m) => s + m.amountXof, 0);

/** LE RYTHME, ET CE QU'IL PROMET. Moyenne mensuelle des versements fléchés sur
    les mois où il y en a eu — pas sur le calendrier, sinon un objectif ouvert
    en janvier et nourri en août paraîtrait huit fois plus lent qu'il n'est.
    Rend `null` quand il n'y a pas encore de quoi juger. */
export const moisPourAtteindre = (
  moves: readonly CoffreMovement[], o: ObjectifCoffre,
): number | null => {
  /* UN COMPARTIMENT NE PROMET RIEN : sans cible, il n'y a pas de « quand
     est-ce atteint ». Le dire par `null` plutôt que par un zéro, qui se
     lirait « c'est fait ». */
  if (o.cibleXof <= 0) return null;
  const verses = moves.filter((m) => m.objectifId === o.id && m.kind === 'depot');
  if (verses.length === 0) return null;
  const mois = new Set(verses.map((m) => m.date.slice(0, 7)));
  const total = verses.reduce((s, m) => s + m.amountXof, 0);
  const parMois = total / Math.max(1, mois.size);
  if (parMois <= 0) return null;
  const manque = Math.max(0, o.cibleXof - recuParObjectif(moves, o.id));
  return manque === 0 ? 0 : Math.ceil(manque / parMois);
};

/* ── LE TRANSFERT ENTRE CAISSES — 22 août 2026 ──────────────────────
   « Je peux faire des transferts ? » Non, et c'était un manque : déplacer
   50 000 F de la Caisse Principale vers le Tiroir EUR n'existait pas. On ne
   pouvait le faire qu'en trichant — une fausse dépense d'un côté, un faux
   encaissement de l'autre — ce qui salit deux comptes pour un seul geste.

   UN TRANSFERT EST UNE SEULE ÉCRITURE À DEUX BOUTS : la caisse de départ
   baisse, celle d'arrivée monte, du même mouvement. Rien n'est créé, rien
   n'est détruit — c'est ce qui le distingue d'une dépense.

   ENTRE DEUX DEVISES, le montant reçu n'est pas le montant donné : `recuXof`
   dit ce qui entre réellement à l'arrivée. Convertir à la lecture, au taux
   d'un autre jour, réécrirait l'histoire — c'est la leçon du prix figé. */
export type TransfertCaisse = {
  id: string;
  branchId: string;
  date: string;
  /** Les NOMS des caisses — même clé que partout ailleurs (`Expense.cashbox`).

      UN BOUT PEUT ÊTRE VIDE — 22 août 2026, « comment faire des versements sur
      certaines caisses qui ne sont pas liés au revenu des clients ? »

      `de` vide = un APPORT : de l'argent entre dans la caisse sans venir d'un
      autre tiroir et sans être une vente. Une mise personnelle, un
      remboursement d'assurance, une avance de la souveraine.
      `vers` vide = une SORTIE hors Maison : de l'argent quitte le tiroir sans
      être une dépense de la Maison ni aller dans un autre tiroir.

      L'un et l'autre restent hors des revenus et hors des dépenses : ce n'est
      ni gagné ni dépensé, cela ne fait qu'entrer ou sortir. Les confondre
      gonflerait le chiffre d'affaires d'un argent que la Maison n'a pas
      gagné — c'est précisément ce qu'on évite ici. */
  de: string;
  vers: string;
  /** Ce qui SORT de la caisse de départ, dans la devise de cette caisse. */
  amountXof: number;
  /** Ce qui ENTRE dans la caisse d'arrivée, dans SA devise. Absent quand les
      deux caisses tiennent la même monnaie : c'est alors le même nombre. */
  recuXof?: number;
  note?: string;
  /** LA PREUVE : reçu, bordereau, capture. Voir `PieceJointe`. */
  fichier?: PieceJointe;
};

export const transfertsStore = createStore<TransfertCaisse[]>('mnd_transferts_caisse', []);
export const useTransferts = () => useStore(transfertsStore);

/** CE QU'UN TRANSFERT FAIT À UNE CAISSE — négatif au départ, positif à
    l'arrivée, zéro ailleurs. Une caisse qui s'enverrait à elle-même ne bouge
    pas : le geste est absurde, mais il ne doit pas créer d'argent. */
export const transfertSurCaisse = (t: TransfertCaisse, caisse: string): number => {
  const sort = t.de === caisse ? -t.amountXof : 0;
  const entre = t.vers === caisse ? (t.recuXof ?? t.amountXof) : 0;
  return sort + entre;
};

export const coffreStore = createStore<CoffreMovement[]>('mnd_coffre', []);
export const useCoffre = () => useStore(coffreStore);

/* ---------- Avoirs — crédit prépayé par COMPTE (famille ou cliente solo) ----------
   Un avoir est de l'argent versé d'avance sur un COMPTE, utilisable pour solder
   des prestations. Le porteur est soit un compte FAMILLE (porte-monnaie du parent
   payeur, utilisable pour tous les membres), soit une cliente sans famille.
   Money = collection (une ligne par mouvement, jamais un document LWW). */
export type CreditHolder = { type: 'family' | 'client'; id: string };
export type CreditMovement = {
  id: string;
  branchId: string;
  holderType: 'family' | 'client'; // qui porte l'avoir
  holderId: string; // family.id ou client.id
  kind: 'depot' | 'usage' | 'remboursement'; // dépôt (+) · règlement d'une presta (−) · remboursement (−)
  /** CE QUI EST ENTRÉ DANS LE TIROIR (ou en est sorti) quand la caisse tient
      une autre devise — 22 août 2026. Le compte de la cliente se crédite en
      `amountXof` ; le tiroir, lui, compte ses billets. Voir `surLeTiroir`. */
  fx?: { code: string; rate: number; amount: number };
  amountXof: number; // toujours positif ; le sens vient de `kind`
  date: string; // ISO
  forClientId?: string; // usage : la cliente réellement soignée (membre du compte)
  invoiceId?: string; // usage : facture réglée
  note?: string;
  /** LA CAISSE QUI A REÇU (dépôt) OU RENDU (remboursement) L'ARGENT — 19 août
      2026, « verser un avoir doit aller dans une caisse et être retracé ».
      L'avoir créditait le compte de la cliente et l'argent, lui, n'entrait
      nulle part : le tiroir qui tenait les billets n'en savait rien. Un dépôt
      qui nomme sa caisse y ENTRE, un remboursement en SORT ; l'USAGE ne bouge
      jamais d'argent — c'est un crédit qui se consomme, pas des billets. Les
      mouvements d'avant n'en portent pas : leurs soldes sont arrêtés, on ne
      les fait pas bouger après coup (même règle que le coffre). */
  cashbox?: string;
  /** Le moyen par lequel l'argent est arrivé — Espèces, Mobile Money… */
  method?: string;
};
/** + pour un dépôt, − pour un usage ou un remboursement. */
export const creditSignedXof = (m: CreditMovement): number => (m.kind === 'depot' ? m.amountXof : -m.amountXof);
/** Solde d'avoir d'un porteur (compte famille ou cliente). Jamais négatif. */
export const creditBalanceOf = (moves: CreditMovement[], holder: CreditHolder): number =>
  Math.max(0, moves
    .filter((m) => m.holderType === holder.type && m.holderId === holder.id)
    .reduce((s, m) => s + creditSignedXof(m), 0));

export const creditMovementsStore = createStore<CreditMovement[]>('mnd_credits', []);
export const useCredits = () => useStore(creditMovementsStore);

/* ---------- Paiements en ligne (KkiaPay) ----------
   Registre des transactions encaissées hors comptoir. ÉCRIT PAR LE SERVEUR
   UNIQUEMENT (fonctions Edge `kkiapay-verify` / `kkiapay-webhook`, clé de
   service) : une cliente ne déclare jamais elle-même qu'elle a payé. Le magasin
   ci-dessous n'est là que pour LIRE au Trône — l'hydratation échoue en silence
   côté Ma Couronne, qui n'est pas du personnel (même cas que `mnd_segments`).
   `amountXof` est le BRUT débité à la cliente, `feesXof` la commission KkiaPay
   (à la charge de la Maison : le chiffre d'affaires reste brut, la commission
   part en dépense de la caisse KkiaPay). */
export type Payment = {
  id: string; // identifiant de transaction KkiaPay — clé d'idempotence
  branchId: string;
  provider: 'kkiapay';
  amountXof: number;
  feesXof: number;
  method?: string; // MOBILE_MONEY · CARD · WALLET
  partnerId?: string; // notre référence : id du rendez-vous
  clientId?: string;
  status: 'success' | 'failed';
  at: string; // ISO
};
export const paymentsStore = createStore<Payment[]>('mnd_payments', []);
export const usePayments = () => useStore(paymentsStore);
/** Le paiement en ligne rattaché à un rendez-vous, s'il existe. */
export const paymentOfAppointment = (payments: Payment[], apptId: string): Payment | undefined =>
  payments.find((p) => p.partnerId === apptId && p.status === 'success');

import { bindCollection, bindDocument } from './sync';
/* Liaison CONDITIONNELLE : sans clé publique KkiaPay, la maison n'encaisse pas
   en ligne et la table `payments` n'existe peut-être pas encore côté serveur —
   s'y lier ferait échouer l'hydratation et virer la pastille de synchro au
   rouge sur un salon en activité, pour rien. Poser la clé au build (après avoir
   joué la migration 0012) suffit à réveiller le registre. */
if ((import.meta.env.VITE_KKIAPAY_PUBLIC_KEY as string | undefined)?.trim()) {
  bindCollection(paymentsStore, 'payments');
}
bindCollection(invoicesStore, 'invoices');
bindCollection(expensesStore, 'expenses');
bindCollection(budgetsStore, 'budgets');
bindCollection(cashboxesStore, 'cashboxes');
bindCollection(expenseCategoriesStore, 'expense_categories');
bindCollection(coffreStore, 'coffre_movements');
bindCollection(objectifsStore, 'objectifs_coffre');
bindCollection(transfertsStore, 'transferts_caisse');
bindCollection(creditMovementsStore, 'credit_movements');
bindDocument(paymentMethodsStore, 'mnd_payment_methods');
/* Les porteurs suivent la Maison : nommer Sandrine au comptoir doit la
   nommer sur le téléphone de la gérante. */
bindDocument(porteursStore, 'mnd_porteurs');

/* ═══════════════════════════════════════════════════════════
   LES CAISSES DE L'ANCIEN LOGICIEL.

   L'import de juillet 2026 a ecrit `cashbox: caisseId` — l'identifiant de la
   caisse Firebase, pas son nom. D'ou les « 9a7vogg », « uu5mhlr » et
   « ja1y92oymqfhqzu1 » qui s'affichaient tels quels dans Revenus par caisse :
   des montants justes sous une etiquette illisible. Les vrais noms sont restes
   dans Firebase, hors de portee ; plutot que d'inventer une correspondance,
   on regroupe ces identifiants sous un libelle qui dit ce qu'ils sont.

   La detection ne touche QUE ce qui ne peut pas etre un nom ecrit par une
   main : six caracteres ou plus, sans espace ni accent ni tiret, melangeant
   lettres et chiffres. « mobile-money », « especes », « Caisse principale »
   et « Autres » passent tous a travers, intacts. */
export const CAISSE_HERITEE = 'Caisse · ancien logiciel';

const semblePasUnNom = (v: string): boolean =>
  /^[a-z0-9]{6,}$/i.test(v) && /[0-9]/.test(v) && /[a-z]/i.test(v);

/** Le nom lisible d'une caisse — ou le libelle de l'heritage si c'en est un. */
export const cashboxLabel = (raw: string | undefined | null): string => {
  const v = (raw ?? '').trim();
  if (!v) return 'Autres';
  return semblePasUnNom(v) ? CAISSE_HERITEE : v;
};

/* ── FLÉCHER DE L’ARGENT DÉJÀ AU COFFRE — 23 août 2026 ─────────────
   « Pouvoir mettre à jour le montant de l’objectif. » Le coffre tenait
   14 918 000 F et les deux objectifs affichaient 0 F mis de côté : seul un
   NOUVEAU versement pouvait nommer un objectif, l’argent déjà là ne pouvait
   pas être attribué. On préparait donc sans jamais pouvoir dire ce qui était
   déjà prêt.

   DEUX LIGNES, ET LE TOTAL NE BOUGE PAS. Un dépôt fléché vers l’objectif, un
   retrait du disponible, du même montant : le coffre contient exactement
   autant qu’avant, mais une part porte désormais un nom. L’invariant tient —
   somme des objectifs plus non-fléché fait toujours le coffre.

   ON NE RÉÉCRIT PAS L’HISTOIRE. Retaguer les anciens versements aurait été
   plus court : un versement de mai serait devenu « pour les vacances », alors
   qu’il a été fait sans intention. Une écriture dit ce qui a eu lieu ;
   flécher est un geste d’aujourd’hui, il porte donc la date d’aujourd’hui. */
export const flecherVersObjectif = (o: {
  branchId: string; objectifId: string; nomObjectif: string;
  montantXof: number; date: string;
}): CoffreMovement[] => ([
  {
    id: `flch-${o.objectifId}-${o.date}-${o.montantXof}-a`,
    branchId: o.branchId, kind: 'depot', amountXof: o.montantXof, date: o.date,
    objectifId: o.objectifId, flechage: true,
    note: `Fléché vers ${o.nomObjectif}, depuis le disponible`,
  },
  {
    id: `flch-${o.objectifId}-${o.date}-${o.montantXof}-b`,
    branchId: o.branchId, kind: 'retrait', amountXof: o.montantXof, date: o.date,
    flechage: true,
    note: `Fléché vers ${o.nomObjectif}, quitte le disponible`,
  },
] as CoffreMovement[]);

/** Ce qui peut encore être fléché : le disponible, et pas un franc de plus. */
export const flechableVers = (moves: readonly CoffreMovement[], o: ObjectifCoffre): number => {
  const manque = o.cibleXof > 0 ? Math.max(0, o.cibleXof - recuParObjectif(moves, o.id)) : Infinity;
  return Math.max(0, Math.min(coffreNonFleche(moves), manque));
};

/* ── LE RYTHME SE CALCULE, ET SE LAISSE MENER — 23 août 2026 ───────
   « Le calcul du rythme régulier ne fonctionne pas, le montant est figé. » Il
   l’était : le nombre de versements se déduisait toujours de l’échéance, et le
   montant de ce nombre-là. Passer de 7 à 12 versements laissait donc le
   montant sur sa division d’origine.

   TROIS NOMBRES POUR DEUX LIBERTÉS. Le reste à trouver est fixe : poser le
   NOMBRE décide du montant, poser le MONTANT décide du nombre, et ne rien
   poser laisse l’échéance décider des deux. Ce qu’on tape mène, ce qu’on n’a
   pas tapé suit.

   IL VIVAIT DANS L’ÉCRAN — donc hors de portée d’un harnais, et c’est
   exactement pourquoi il a pu être faux sans que rien ne le dise. */
export type RythmeDuPlan = {
  premier: string; nombre: number; montantXof: number;
  /** La date du DERNIER versement — celle qui dit si le plan tient la date. */
  dernier: string;
  apresLEcheance: boolean;
};
export const rythmeDuPlan = (o: {
  reste: number;
  echeance: string;
  aujourdhui: string;
  premier?: string;
  nombreSaisi?: number;
  parMoisSaisi?: number;
}): RythmeDuPlan => {
  const premier = o.premier || moisPlusISO(`${o.aujourdhui.slice(0, 7)}-28`, 1);
  const n = o.nombreSaisi ?? 0;
  const m = o.parMoisSaisi ?? 0;
  const nombre = n > 0
    ? n
    : (m > 0
      ? Math.max(1, Math.ceil(o.reste / m))
      : Math.max(1, moisEntre(o.aujourdhui.slice(0, 7), o.echeance)));
  const montantXof = n > 0 || m === 0 ? Math.ceil(o.reste / nombre) : m;
  const dernier = moisPlusISO(premier, Math.max(0, nombre - 1));
  return { premier, nombre, montantXof, dernier, apresLEcheance: dernier.slice(0, 7) > o.echeance };
};

/* ── LE PLAN D'UN OBJECTIF, ET SES JALONS — 23 août 2026 ────────────
   « Un objectif doit être clair, avoir des milestones, tout comme les
   programmes de remboursement pour les prêts. Surtout atteindre les
   objectifs. » Maquette validée (`public/maquette-les-objectifs.html`).

   UNE CIBLE SANS CHEMIN NE S'ATTEINT QUE PAR CHANCE. L'objectif disait ce
   qu'il visait et ce qu'il manquait ; il ne disait pas COMMENT y arriver. Le
   prêt, lui, savait déjà le dire — un échéancier, des versements imputés du
   plus ancien, un retard. C'est la même figure retournée : un prêt se
   rembourse par échéances, un objectif se remplit par jalons.

   LE PLAN PORTE SON MONTANT. On aurait pu le déduire (cible ÷ nombre), mais
   après trois versements irréguliers cette division ne veut plus rien dire :
   ce qu'il faut mettre CHAQUE MOIS dépend de ce qui reste, pas de ce qui était
   visé au départ. Le montant est donc inscrit — et se réécrit le jour où la
   Souveraine choisit de rattraper.

   LES JALONS NE SONT PAS DES ÉCRITURES. Ils se calculent, ne se stockent pas,
   et aucun franc ne quitte une caisse tant qu'un versement n'a pas eu lieu. */

/** Un versement attendu vers un objectif — calculé, jamais inscrit. */
export type JalonAttendu = {
  date: string;
  montantXof: number;
  rang: number;
  sur: number;
  /** « Acompte billets », « Solde à la livraison »… sinon « 3ᵉ versement ». */
  nom?: string;
};

/** L'état d'un jalon face à ce qui a été réellement versé. */
export type EtatJalon = JalonAttendu & {
  couvert: number;
  etat: 'verse' | 'partiel' | 'attendu' | 'manque';
};

/** Ce que le plan attend, du plus proche au plus lointain. */
export const jalonsDeLObjectif = (o: ObjectifCoffre): JalonAttendu[] => {
  /* LES JALONS POSÉS À LA MAIN FONT FOI. Nommés, datés, montants choisis : la
     Souveraine sait mieux que la division ce que « acompte billets » veut
     dire. Le rythme ne sert que si elle n'a rien posé. */
  if (o.jalons && o.jalons.length > 0) {
    return [...o.jalons]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((j, i, tous) => ({
        date: j.date, montantXof: j.montantXof, nom: j.nom,
        rang: i + 1, sur: tous.length,
      }));
  }
  if (!o.plan || o.plan.nombre < 1 || !o.plan.premier) return [];
  const n = Math.min(o.plan.nombre, 120);
  return Array.from({ length: n }, (_, i) => ({
    date: moisPlusISO(o.plan!.premier, i),
    montantXof: o.plan!.montantXof,
    rang: i + 1,
    sur: n,
  }));
};

/** L'état complet d'un objectif — tout ce que la carte doit dire. */
export type EtatObjectif = {
  objectif: ObjectifCoffre;
  /** Ce qui lui a été fléché, en francs. */
  recu: number;
  manque: number;
  /** 0 à 100. Un compartiment (sans cible) rend 0 et ne se juge pas. */
  part: number;
  jalons: EtatJalon[];
  /** Le premier jalon non entièrement couvert. */
  prochain?: EtatJalon;
  /** Ce que le plan attendait à ce jour et qui n'est pas venu. */
  retardXof: number;
  jalonsManques: number;
  /** Ce qu'il faudrait mettre CHAQUE MOIS pour tenir l'échéance, retard compris. */
  effortPourTenir: number;
  /** Le mois où la cible tombe si le rythme du plan ne change pas. */
  arriveeProjetee?: string;
  /** L'échéance est-elle tenable sans changer de rythme ? */
  tientLaDate: boolean;
  /** Ni plan, ni jalons — un état assumé : il ne réclame rien. */
  sansPlan: boolean;
};

/** Ce que le plan attendait d'ici aujourd'hui — le repère sur la jauge. */
export const attenduAuJour = (o: ObjectifCoffre, aujourdhui: string): number =>
  jalonsDeLObjectif(o)
    .filter((j) => j.date <= aujourdhui.slice(0, 10))
    .reduce((s, j) => s + j.montantXof, 0);

export const etatDeLObjectif = (
  o: ObjectifCoffre,
  moves: readonly CoffreMovement[],
  aujourdhui: string,
): EtatObjectif => {
  const recu = recuParObjectif(moves, o.id);
  const manque = Math.max(0, o.cibleXof - recu);
  const calendrier = jalonsDeLObjectif(o);
  const jour = aujourdhui.slice(0, 10);

  /* CE QUI EST VERSÉ COUVRE LE JALON LE PLUS ANCIEN D'ABORD — la règle du
     comptoir, la même que pour les remboursements de prêt. L'imputer autrement
     ferait apparaître un manque là où l'argent est venu. */
  let couvre = recu;
  const jalons: EtatJalon[] = calendrier.map((j) => {
    const pris = Math.min(couvre, j.montantXof);
    couvre -= pris;
    const etat: EtatJalon['etat'] = pris >= j.montantXof
      ? 'verse'
      : j.date <= jour
        ? (pris > 0 ? 'partiel' : 'manque')
        : 'attendu';
    return { ...j, couvert: pris, etat };
  });

  const echus = jalons.filter((j) => j.date <= jour);
  const retardXof = echus.reduce((s, j) => s + (j.montantXof - j.couvert), 0);
  const prochain = jalons.find((j) => j.couvert < j.montantXof);

  /* L'EFFORT POUR TENIR : ce qui manque, réparti sur les mois qui restent
     jusqu'à l'échéance. C'est le chiffre qui décide — « 700 000 par mois au
     lieu de 500 000 ». Sans échéance, il n'y a rien à tenir. */
  const moisRestants = o.echeance ? Math.max(1, moisEntre(jour.slice(0, 7), o.echeance)) : 0;
  const effortPourTenir = o.echeance && manque > 0 ? Math.ceil(manque / moisRestants) : 0;

  /* L'ARRIVÉE PROJETÉE : au rythme du plan (et non au rythme observé — le plan
     est ce qu'on s'est promis), dans combien de mois la cible tombe-t-elle ? */
  const rythme = o.plan?.montantXof ?? 0;
  const arriveeProjetee = manque > 0 && rythme > 0
    ? moisPlusISO(`${jour.slice(0, 7)}-01`, Math.ceil(manque / rythme)).slice(0, 7)
    : (manque === 0 ? jour.slice(0, 7) : undefined);

  return {
    objectif: o,
    recu,
    manque,
    part: o.cibleXof > 0 ? Math.min(100, Math.round((recu / o.cibleXof) * 100)) : 0,
    jalons,
    prochain,
    retardXof,
    jalonsManques: echus.filter((j) => j.couvert < j.montantXof).length,
    effortPourTenir,
    arriveeProjetee,
    tientLaDate: !o.echeance || manque === 0
      || (!!arriveeProjetee && arriveeProjetee <= o.echeance),
    sansPlan: calendrier.length === 0,
  };
};

/** Le nombre de mois entre deux clés `AAAA-MM` — négatif si la seconde précède. */
export const moisEntre = (a: string, b: string): number => {
  const [ya, ma] = a.slice(0, 7).split('-').map(Number);
  const [yb, mb] = b.slice(0, 7).split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

/** Décale une date ISO de `n` mois, repliée sur le dernier jour du mois visé. */
export const moisPlusISO = (iso: string, n: number): string => {
  const [y, m, d] = `${iso.slice(0, 10)}`.split('-').map(Number);
  const cible = new Date(Date.UTC(y, (m || 1) - 1 + n, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  const jour = Math.min(d || 1, dernier);
  return `${cible.getUTCFullYear()}-${String(cible.getUTCMonth() + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
};

/* ── LES DEUX ISSUES D'UN RETARD — arbitrage de Yéman, 23 août 2026 ──
   « Les deux, et je choisis au moment du retard. » Rattraper garde la date et
   monte l'effort ; accepter garde l'effort et recule la date. Aucune des deux
   n'est meilleure dans l'absolu — c'est une décision de trésorerie, pas de
   calcul, et elle appartient à la Souveraine. */

/** RATTRAPER : réécrit le plan sur les mois qui restent, au nouvel effort. */
export const planPourTenir = (
  o: ObjectifCoffre,
  moves: readonly CoffreMovement[],
  aujourdhui: string,
): ObjectifCoffre['plan'] | null => {
  if (!o.echeance) return null;
  const { manque, effortPourTenir } = etatDeLObjectif(o, moves, aujourdhui);
  if (manque <= 0 || effortPourTenir <= 0) return null;
  const nombre = Math.max(1, moisEntre(aujourdhui.slice(0, 7), o.echeance));
  /* Le premier jalon retombe le même JOUR du mois que le plan d'origine —
     changer le jour au passage ferait glisser un rythme déjà pris. */
  const jour = o.plan?.premier?.slice(8, 10) ?? '28';
  return {
    premier: moisPlusISO(`${aujourdhui.slice(0, 7)}-${jour}`, 1),
    nombre,
    montantXof: effortPourTenir,
  };
};

/** ACCEPTER : le rythme ne bouge pas, l'échéance suit l'arrivée projetée. */
export const echeanceProjetee = (
  o: ObjectifCoffre,
  moves: readonly CoffreMovement[],
  aujourdhui: string,
): string | null => etatDeLObjectif(o, moves, aujourdhui).arriveeProjetee ?? null;

/** Ce que la Maison doit surveiller — pour le Tableau de bord, comme les prêts. */
export const objectifsASurveiller = (
  objectifs: readonly ObjectifCoffre[],
  moves: readonly CoffreMovement[],
  branchId: string,
  aujourdhui: string,
  fenetreJours = 7,
): EtatObjectif[] => objectifs
  .filter((o) => o.branchId === branchId && !o.clos && o.cibleXof > 0)
  .map((o) => etatDeLObjectif(o, moves, aujourdhui))
  .filter((e) => e.manque > 0 && e.prochain
    && joursEntreISO(aujourdhui, e.prochain.date) <= fenetreJours)
  .sort((a, b) => b.retardXof - a.retardXof
    || (a.prochain?.date ?? '').localeCompare(b.prochain?.date ?? ''));

/** Jours entre deux dates ISO — positif si `b` est après `a`. */
export const joursEntreISO = (a: string, b: string): number =>
  Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000);


/* ══ LES LIGNES D'UNE PIÈCE DE RITUEL — 4 septembre 2026 ════════════
   « Quand j'émets la facture du RDV de S. au lieu de 85 000 F je reçois une
   facture de 70 000 F avec des montants qui ne sont pas conformes au RDV »
   (Yéman).

   DEUX FAUTES, ET LA SECONDE EST LA PIRE.

   ① Les lignes étaient tarifées AU CATALOGUE quand le rendez-vous, lui,
     compte au tarif de la tête : calibre, comptage des locks, Juste Prix. Une
     reprise à 40 000 F pour une Nano de 427 locks s'écrivait 20 000 F. C'est
     la faute déjà corrigée dans `alignerFacturesDuRituel` le 12 août ; elle
     avait survécu ici.

   ② L'ÉCART DISPARAISSAIT EN SILENCE. La pièce ne connaissait qu'une remise
     globale — ce qu'il faut RETRANCHER quand les lignes valent plus que le
     rituel. Quand elles valent MOINS, il n'y avait rien : le total tombait à la
     somme des lignes et la Maison sous-facturait sans que rien ne le dise.
     15 000 F évaporés sur une seule pièce.

   LA PIÈCE VAUT LE RITUEL, TOUJOURS. C'est l'invariant, et il se juge ici :
   somme des lignes − remise globale + ajustement = le net du rendez-vous. */
export type GesteFacture = {
  nom: string;
  /** Son prix plein AU TARIF DE LA TÊTE, avant toute remise. */
  pleinXof: number;
  /** La remise posée sur CETTE ligne au rendez-vous : le % d'abord, les F ensuite. */
  remisePct?: number;
  remiseXof?: number;
};

export function lignesDuRituelPiece(o: {
  gestes: readonly GesteFacture[];
  /** Ce que le rendez-vous vaut réellement — prix figé et forfait compris. */
  netXof: number;
  /** Le libellé de la pièce quand aucune prestation n'est reconnue. */
  libelleNu: string;
  libelleAjustement?: string;
}): { lines: InvoiceLine[]; remiseGlobaleXof: number } {
  const net = Math.max(0, Math.round(o.netXof));
  if (o.gestes.length === 0) {
    return { lines: [ligneFacture(o.libelleNu, net)], remiseGlobaleXof: 0 };
  }
  /* CHAQUE LIGNE PORTE SON PRIX PLEIN ET SA REMISE, jamais un prix déjà raboté :
     « shampoing 5 000 » cache le geste, « 10 000, remise 50 % » le montre. Un
     cadeau qu'on ne voit pas n'est pas reçu. */
  const lines: InvoiceLine[] = o.gestes.map((g) => {
    const l = ligneFacture(g.nom, Math.max(0, Math.round(g.pleinXof)));
    const pct = Math.max(0, Math.min(100, Math.round(g.remisePct ?? 0)));
    const xof = Math.max(0, Math.round(g.remiseXof ?? 0));
    if (pct > 0) l.discountPct = pct;
    if (xof > 0) l.discountXof = xof;
    return l;
  });
  const netDesLignes = lines.reduce((n, l) => n + ligneNetXof(l), 0);
  /* LES LIGNES VALENT PLUS QUE LE RITUEL : l'écart est un geste global (forfait
     ponctuel, remise du rendez-vous, remise famille). Il se NOMME. */
  if (netDesLignes > net) {
    return { lines, remiseGlobaleXof: Math.round(netDesLignes - net) };
  }
  /* LES LIGNES VALENT MOINS : un prix a été consenti AU-DESSUS du barème, ou
     figé plus haut. On l'écrit en clair plutôt que de laisser la pièce
     réclamer moins que le rituel — c'est de l'argent qui n'entrerait jamais. */
  if (net > netDesLignes) {
    lines.push(ligneFacture(o.libelleAjustement ?? 'Ajustement · prix consenti ce jour-là', Math.round(net - netDesLignes)));
  }
  return { lines, remiseGlobaleXof: 0 };
}
