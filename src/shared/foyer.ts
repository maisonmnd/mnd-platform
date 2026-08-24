import { createStore, uid, useStore } from './store';
import { bindCollection } from './sync';
import { coffreStore, type CoffreMovement } from './finance';
import type { Receipt } from './receipts';

/* ═══════ SALON & FOYER — la séparation entreprise / foyer ═══════

   Le problème que ce module corrige : 100 % des revenus du salon partaient
   dans les dépenses du foyer, rien ne se mettait de côté. Deux principes :

   ① LA RÈGLE DU PARTAGE — les charges du salon se paient d'abord, à leur
      montant RÉEL ; ce qui RESTE (le bénéfice) se répartit en trois selon
      des pourcentages configurés (total = 100) : Réinvestissement · Réserve
      fiscale & imprévus · Prélèvement Associés. (Jusqu'au 11 août 2026 le
      partage portait sur l'encaissé, avec une quatrième enveloppe de
      charges qui n'était qu'un budget — voir plus bas.)

   ② LE PRÉLÈVEMENT N'EST PAS UNE CHARGE — c'est une distribution de
      bénéfice, tenue dans une ANNEXE, jamais mélangée aux dépenses
      d'exploitation. Bénéfice réel du salon = revenu − charges salon.

   Ce que le module RÉUTILISE, sans rien ressaisir :
   - le revenu du mois se lit au registre des ENCAISSEMENTS (receipts.ts) —
     la trésorerie réelle, datée par le journal des versements — HORS
     pourboires : ils transitent par le tiroir mais appartiennent aux
     maîtres, pas à la Maison (voir `revenuPartageDuMois`) ;
   - les charges salon SONT le registre Dépenses existant (finance.ts) —
     un second registre de dépenses aurait fini par diverger.

   RIEN NE S'ÉCRIT TOUT SEUL. Le Partage CALCULE et PROPOSE (enveloppes du
   mois, dotation des réserves, conversion d'un dépassement en prêt) ; le
   souverain INSCRIT. Les identifiants déterministes (`dotationId`,
   `pretDepassementId`) rendent l'inscription idempotente — deux clics ne
   font qu'une ligne, comme la marque `seuil:<regle>:<mois>` des primes.

   ACCÈS : réservé au SOUVERAIN — décision du 10 août 2026. La vraie
   barrière est la RLS (`is_souverain()`, migration 0038) ; l'écran n'est
   qu'une garde. Pour tout autre compte, l'hydratation rend zéro ligne en
   silence et les magasins restent vides.

   Les caisses Succession et Devises sont des MONDES ÉTANCHES : leurs
   tables ne sont lues par AUCUN autre écran — ni revenu, ni charges, ni
   bénéfice, ni totaux. L'étanchéité est structurelle (personne ne les
   importe), pas un filtre d'affichage. */

/* ---------- La règle du Partage ---------- */

export type PartageConfig = {
  id: string; // `pc-<branchId>` — une règle par branche
  branchId: string;
  /** Pourcentages ENTIERS ; leur somme doit faire 100. */
  pctCharges: number;
  pctReinvest: number;
  pctReserve: number;
  pctPrelevement: number;
  /** Ce que chaque enveloppe recouvre, dans les mots de la Maison. Une clé
      absente ou vide retombe sur la phrase de départ (`PARTAGE_DITS`). */
  dits?: Partial<Record<CleEnveloppe, string>>;
};

/** Défauts de départ — à ajuster aux vrais chiffres après quelques mois.
    `pctCharges` n'est plus une enveloppe (voir ci-dessous) : c'est le REPÈRE
    de charges, la part du revenu que la Maison vise à ne pas dépasser. */
export const PARTAGE_DEFAUT = { pctCharges: 45, pctReinvest: 20, pctReserve: 20, pctPrelevement: 60 } as const;

/* ═══ LE PARTAGE SE FAIT SUR LE BÉNÉFICE, PAS SUR L'ENCAISSÉ ═══
   (décision de Yéman, 11 août 2026)

   Le premier modèle répartissait le REVENU en quatre enveloppes, dont une
   « Charges Salon » qui n'était qu'un BUDGET : on partageait un argent dont
   une partie était déjà partie payer le loyer et les salaires. Quand les
   charges réelles dépassaient leur enveloppe — 230 000 F pour un repère de
   75 000 F en août — le foyer se voyait promettre un budget que le salon
   n'avait pas.

   Désormais : les charges se paient d'abord, à leur montant RÉEL, et c'est
   ce qui RESTE qui se partage en trois — Réinvestissement, Réserve fiscale,
   Prélèvement. La somme de ces trois-là doit faire 100.

   BÉNÉFICE NUL OU NÉGATIF : les trois enveloppes valent ZÉRO, jamais un
   nombre négatif. On ne partage pas une perte — on la constate, et tout
   retrait du foyer ce mois-là est un PRÊT, ce que l'écran dit en toutes
   lettres.

   `pctCharges` survit comme REPÈRE : il ne prend plus part au partage, il
   sert à dire « vos charges pèsent 123 % du revenu, votre repère est 40 % ».
   Le garder évite de perdre l'objectif que la Maison s'était fixé. */

/* LES QUATRE ENVELOPPES SE NOMMENT ET SE DÉFINISSENT.

   Ces phrases étaient écrites en dur : le poste « Divers » d'une maison n'est
   pas celui d'une autre, et une enveloppe dont personne n'a écrit le contenu
   finit par tout accueillir. Elles se modifient donc à l'écran, par branche,
   et vivent avec la règle qu'elles expliquent. Vider le champ rend la phrase
   de départ — on ne peut pas se retrouver avec une définition muette. */

export type CleEnveloppe = 'charges' | 'reinvest' | 'reserve' | 'prelevement';

export const ENVELOPPE_LABELS: Record<CleEnveloppe, string> = {
  charges: 'Charges Salon',
  reinvest: 'Réinvestissement',
  reserve: 'Réserve fiscale & imprévus',
  prelevement: 'Prélèvement Associés',
};

export const PARTAGE_DITS: Record<CleEnveloppe, string> = {
  charges: 'loyer, produits, salaires employés, eau & électricité, banque, payées avant tout partage',
  reinvest: 'épargne de croissance : matériel, expansion, formation, intouchable',
  reserve: 'impôts, mois creux, pannes, urgences',
  prelevement: 'le budget maison du foyer, il vit là-dessus, pas plus',
};

export const CLES_ENVELOPPES: CleEnveloppe[] = ['charges', 'reinvest', 'reserve', 'prelevement'];

/** Ce que dit une enveloppe : les mots de la Maison, sinon ceux du départ. */
export const ditEnveloppe = (c: PartageConfig, k: CleEnveloppe): string =>
  (c.dits?.[k] ?? '').trim() || PARTAGE_DITS[k];

export const partageConfigStore = createStore<PartageConfig[]>('mnd_partage_config', []);
export const usePartageConfigs = () => useStore(partageConfigStore);

/** La règle de la branche — les défauts tant que rien n'est configuré. */
export const partageDe = (configs: PartageConfig[], branchId: string): PartageConfig =>
  configs.find((c) => c.branchId === branchId)
  ?? { id: `pc-${branchId}`, branchId, ...PARTAGE_DEFAUT };

/** Les TROIS enveloppes du bénéfice doivent faire 100. Le repère de charges
    n'en fait pas partie : il ne consomme rien. */
export type TroisParts = Pick<PartageConfig, 'pctReinvest' | 'pctReserve' | 'pctPrelevement'>;

export const partageValide = (c: TroisParts): boolean =>
  [c.pctReinvest, c.pctReserve, c.pctPrelevement].every((p) => Number.isFinite(p) && p >= 0)
  && c.pctReinvest + c.pctReserve + c.pctPrelevement === 100;

/** Les trois parts RAMENÉES À 100, en gardant leurs proportions.
    Les règles écrites avant le 11 août portaient quatre parts dont une de
    charges (40 · 15 · 10 · 35) : leurs trois parts restantes ne font que 60.
    Les lire telles quelles amputerait le partage d'un tiers en silence — on
    les renormalise donc, ce qui préserve exactement l'intention. */
export const partageNormalise = (c: TroisParts): { reinvest: number; reserve: number; prelevement: number } => {
  const total = c.pctReinvest + c.pctReserve + c.pctPrelevement;
  if (total === 100) return { reinvest: c.pctReinvest, reserve: c.pctReserve, prelevement: c.pctPrelevement };
  /* Une règle vide ne peut pas rendre NaN : tout au prélèvement, qui est le
     poste par défaut du foyer. */
  if (!(total > 0)) return { reinvest: 0, reserve: 0, prelevement: 100 };
  const reinvest = Math.round((c.pctReinvest * 100) / total);
  const reserve = Math.round((c.pctReserve * 100) / total);
  return { reinvest, reserve, prelevement: 100 - reinvest - reserve };
};

/** Le bénéfice réel du salon : ce qui reste une fois les charges RÉELLES
    payées. C'est lui, et lui seul, qui se partage. */
export const beneficeReel = (revenuXof: number, chargesXof: number): number => revenuXof - chargesXof;

/** Les trois enveloppes du BÉNÉFICE, en XOF entiers. Les deux premières
    s'arrondissent, la dernière prend LE RESTE : la somme vaut toujours
    exactement le bénéfice — pas un franc perdu aux arrondis.
    Un bénéfice nul ou négatif ne se partage pas : trois zéros. */
export const enveloppesDuMois = (beneficeXof: number, c: PartageConfig) => {
  if (!(beneficeXof > 0)) return { reinvest: 0, reserve: 0, prelevement: 0 };
  const parts = partageNormalise(c);
  const reinvest = Math.round((beneficeXof * parts.reinvest) / 100);
  const reserve = Math.round((beneficeXof * parts.reserve) / 100);
  return { reinvest, reserve, prelevement: beneficeXof - reinvest - reserve };
};

/** Le poids réel des charges dans le revenu — à comparer au repère.
    Sans revenu, la question n'a pas de sens : on rend `null` plutôt qu'un
    infini ou un zéro trompeur. */
export const poidsDesCharges = (revenuXof: number, chargesXof: number): number | null =>
  revenuXof > 0 ? Math.round((chargesXof / revenuXof) * 100) : null;

/* ---------- Le revenu que le Partage répartit ---------- */

/** Somme des encaissements du mois, HORS pourboires. Depuis le 11 août, le
    registre porte le pourboire sur SA propre ligne (`kind: 'pourboire'`,
    caisse Pourboires) : il suffit de l'écarter — c'est l'argent des maîtres,
    la Maison ne se le partage pas. (L'ancienne version soustrayait `tipXof`
    de la ligne de la facture ; la garder aurait retiré le pourboire DEUX fois.) */
export const revenuPartageDuMois = (receipts: Receipt[], mk: string): number =>
  receipts
    .filter((r) => r.date.slice(0, 7) === mk && r.kind !== 'pourboire')
    .reduce((s, r) => s + r.amountXof, 0);

/* ---------- Prélèvements associés — l'annexe du foyer ---------- */

export type Prelevement = {
  id: string;
  branchId: string;
  date: string; // ISO AAAA-MM-JJ
  beneficiaire: string; // Foyer · Brice · Yéman
  motif: string;
  /** LE DÉTAIL DU MOTIF (14 août) — « École » puis « Rentrée », comme les
      dépenses du salon ont leur sous-catégorie. */
  sousMotif?: string;
  note?: string;
  amountXof: number; // toujours positif
  /** PLUSIEURS POSTES SUR UN MÊME RETRAIT (14 août, demande de Yéman) : une
      sortie d'argent couvre souvent plusieurs achats — marché, pharmacie,
      taxi. Le modèle est celui des dépenses du salon (`ExpenseItem`) :
      `amountXof` vaut alors la SOMME des lignes, jamais autre chose. */
  items?: PosteFoyer[];
};

/** Un poste d'un retrait ou d'un mouvement de caisse — même forme que les
    articles d'une dépense du salon, pour que les deux se lisent pareil. */
export type PosteFoyer = { id: string; label: string; amountXof: number };

/** Le total d'une ligne à postes : la somme des lignes fait foi. */
export const totalPostes = (items: readonly PosteFoyer[] | undefined, defaut: number): number =>
  items && items.length ? items.reduce((s, it) => s + it.amountXof, 0) : defaut;

/** Listes du modèle — des suggestions de saisie, pas des enums : une valeur
    libre reste possible et rien ne casse si la Maison invente un motif. */
export const BENEFICIAIRES = ['Foyer', 'Brice', 'Yéman'] as const;
export const MOTIFS_PRELEVEMENT = ['Maison', 'Nourriture', 'École', 'Santé', 'Transport', 'Personnel', 'Divers'] as const;

/* ── LES MOTIFS DU FOYER SE GÈRENT (14 août, demande de Yéman) ──────────
   La liste ci-dessus était figée dans le code : ajouter « Loyer maison »
   demandait une publication. Elle devient une SEMENCE d'un registre
   éditable, de même forme que les catégories de dépenses du salon
   (nom + sous-motifs) — la Maison ajoute, renomme, retire. */
export type MotifFoyer = { id: string; name: string; subs: string[] };

export const MOTIFS_FOYER_SEED: MotifFoyer[] = [
  { id: 'mf-maison', name: 'Maison', subs: ['Loyer', 'Énergie & eau', 'Entretien', 'Meubles'] },
  { id: 'mf-nourriture', name: 'Nourriture', subs: ['Marché', 'Supermarché', 'Restaurant'] },
  { id: 'mf-ecole', name: 'École', subs: ['Scolarité', 'Fournitures', 'Transport scolaire', 'Cantine'] },
  { id: 'mf-sante', name: 'Santé', subs: ['Pharmacie', 'Consultation', 'Analyses'] },
  { id: 'mf-transport', name: 'Transport', subs: ['Carburant', 'Taxi', 'Entretien véhicule'] },
  { id: 'mf-personnel', name: 'Personnel', subs: ['Vêtements', 'Beauté', 'Loisirs'] },
  { id: 'mf-divers', name: 'Divers', subs: ['Imprévu', 'Cadeau', 'Autre'] },
];

export const motifsFoyerStore = createStore<MotifFoyer[]>('mnd_motifs_foyer', MOTIFS_FOYER_SEED);
export const useMotifsFoyer = () => useStore(motifsFoyerStore);

export const prelevementsStore = createStore<Prelevement[]>('mnd_prelevements', []);
export const usePrelevements = () => useStore(prelevementsStore);

export const prelevesDuMois = (l: Prelevement[], branchId: string, mk: string): Prelevement[] =>
  l.filter((p) => p.branchId === branchId && p.date.slice(0, 7) === mk);

/* ---------- Prêts associés — le dépassement devient une dette ---------- */

/* ── LE PRÊT S'ÉLARGIT — 22 août 2026 ───────────────────────────────
   « Comment contrôler les prêts et les remboursements ? »

   Ce registre ne connaissait que le salon et le foyer. Il s'ouvre à qui la
   Maison prête vraiment : un membre de l'équipe (avance sur salaire), une
   cliente, un tiers. Les champs ajoutés sont TOUS facultatifs — les lignes
   d'avant restent exactement ce qu'elles étaient, sans genre et sans caisse,
   et leurs soldes ne bougent pas d'un franc. */
export type GenreEmprunteur = 'foyer' | 'associe' | 'equipe' | 'cliente' | 'tiers';

export type Pret = {
  id: string;
  branchId: string;
  date: string;
  type: 'pret' | 'remboursement';
  /** Le nom de l'emprunteur — « Foyer » pour les mouvements salon ↔ foyer. */
  associe: string;
  motif: string;
  amountXof: number; // toujours positif ; le SENS vient du type
  /** QUAND CET ARGENT DOIT REVENIR — 23 août 2026. Absent = sans échéance,
      et c’est un état assumé, pas un oubli : l’écran le dit et ne relance pas.
      Ne vaut que sur une ligne de type `pret`. */
  echeance?: string;
  /** Un retour en PLUSIEURS FOIS : `nombre` versements mensuels à partir de
      `premier`. Les montants se calculent (voir `echeancesDuPret`) — les
      stocker ferait deux vérités le jour où le prêt se corrige. */
  echeancier?: { nombre: number; premier: string };
  /** LA RETENUE MENSUELLE PROPOSÉE SUR LE BULLETIN — équipe seulement. Une
      avance sur salaire se rembourse par le salaire : aucune caisse ne bouge,
      puisque l’argent n’est jamais sorti de la Maison. */
  retenueXof?: number;
  /** CE QUI EST SORTI (ou rentré dans) LE TIROIR quand la caisse tient une
      autre devise — 22 août 2026. La dette reste en francs ; le tiroir compte
      ses billets. Voir surLeTiroir dans finance.ts. */
  fx?: { code: string; rate: number; amount: number };
  /** À QUI la Maison prête. Absent sur les lignes d'avant : elles sont toutes
      des mouvements salon ↔ foyer, et se lisent comme telles. */
  genre?: GenreEmprunteur;
  /** La fiche de l'emprunteur quand il en a une — une cliente, un membre de
      l'équipe. C'est ce lien qui permet de relire le prêt depuis sa fiche. */
  personneId?: string;
  /** LA CAISSE D'OÙ L'ARGENT SORT (prêt) OU DANS LAQUELLE IL RENTRE
      (remboursement) — 22 août 2026, même leçon que le coffre le 17 et les
      avoirs le 19 : sans elle, prêter 200 000 F ne les retire d'aucun tiroir,
      et les mêmes francs vivent dans la caisse ET chez l'emprunteur.
      Absente sur tout l'historique : ces lignes ne débitent rien, leurs soldes
      sont arrêtés, et les rendre débitrices après coup ferait bouger des
      trésoreries déjà closes. */
  cashbox?: string;
  /** Espèces, Mobile Money… — par où l'argent est passé. */
  method?: string;
};

/** Ancien nom du même objet — gardé pour ne rien casser. */
export type PretAssocie = Pret;

export const pretsStore = createStore<Pret[]>('mnd_prets_associes', []);
export const usePrets = () => useStore(pretsStore);

export const pretSigneXof = (p: Pret): number =>
  p.type === 'pret' ? p.amountXof : -p.amountXof;

/** Dette en cours des associés envers le salon — jamais négative à l'écran :
    un trop-remboursé est une erreur de saisie, pas une dette du salon. */
export const detteEnCours = (l: readonly Pret[], branchId: string): number =>
  Math.max(0, l.filter((p) => p.branchId === branchId).reduce((s, p) => s + pretSigneXof(p), 0));

/** LE SOLDE DE CHAQUE EMPRUNTEUR — prêté moins remboursé, jamais négatif à
    l'écran : un trop-remboursé est une erreur de saisie, pas une dette de la
    Maison envers lui. Le regroupement se fait sur le NOM, seul repère commun
    aux lignes d'avant (sans genre) et aux nouvelles. */
export type SoldePret = {
  nom: string; genre: GenreEmprunteur; personneId?: string;
  prete: number; rembourse: number; reste: number; dernier: string;
};

export const soldesParEmprunteur = (l: readonly Pret[], branchId: string): SoldePret[] => {
  const par = new Map<string, SoldePret>();
  for (const p of l) {
    if (p.branchId !== branchId) continue;
    const nom = (p.associe || 'Sans nom').trim();
    const cle = nom.toLowerCase();
    const d = par.get(cle) ?? {
      nom, genre: p.genre ?? 'foyer', personneId: p.personneId,
      prete: 0, rembourse: 0, reste: 0, dernier: p.date,
    };
    if (p.type === 'pret') d.prete += p.amountXof; else d.rembourse += p.amountXof;
    if (p.date >= d.dernier) { d.dernier = p.date; d.genre = p.genre ?? d.genre; }
    if (p.personneId) d.personneId = p.personneId;
    par.set(cle, d);
  }
  for (const d of par.values()) d.reste = Math.max(0, d.prete - d.rembourse);
  return [...par.values()].sort((a, b) => b.reste - a.reste || b.prete - a.prete);
};

/** Ce qu'une personne doit encore — pour le dire sur sa fiche, en lecture. */
export const resteDuPar = (l: readonly Pret[], personneId: string): number => {
  let n = 0;
  for (const p of l) {
    if (p.personneId !== personneId) continue;
    n += p.type === 'pret' ? p.amountXof : -p.amountXof;
  }
  return Math.max(0, n);
};

/** Identifiant déterministe de la conversion « dépassement du mois → prêt » :
    la convertir deux fois ne crée qu'une ligne (upsert par id).
    LA BRANCHE EST DANS L'IDENTIFIANT (12 août) : l'id est la clé primaire de
    synchronisation — sans elle, deux branches en dépassement le même mois se
    seraient écrasé mutuellement le prêt (celle de B effaçait la dette de A). */
export const pretDepassementId = (branchId: string, mk: string): string => `pret-dep-${branchId}-${mk}`;
/** L'ancien identifiant, sans branche — encore en base pour les mois déjà convertis. */
export const pretDepassementIdLegacy = (mk: string): string => `pret-dep-${mk}`;

/* ---------- Réserves — l'argent qui fait grandir le salon ----------

   UN SEUL REGISTRE D'ÉPARGNE, ET C'EST LE COFFRE-FORT.

   Il y en a eu deux pendant une demi-journée : le Coffre-fort (0009 — épargne
   verrouillée, seule sortie un virement bancaire) et une table de réserves
   propre au Partage, reliées par un virement en trois gestes — inscrire la
   dotation, puis la verser, puis la relire à deux endroits. Deux registres
   pour une même notion finissent toujours par dire deux chiffres, et trois
   gestes pour une seule décision finissent par ne pas être faits.

   Les deux enveloppes ne sont donc plus un registre : ce sont une ÉTIQUETTE
   sur les lignes du coffre (`origine: 'reserve'`, `enveloppe`). Mettre de
   côté, c'est déposer au coffre — une seule étape, et l'argent est à l'abri
   au moment même où on décide de l'épargner. « Les Réserves » ne sont plus
   qu'une LECTURE du coffre, par enveloppe.

   Ces lignes-là sont réservées au souverain côté serveur (0040) ; le reste du
   coffre demeure lisible par le personnel. */

export type EnveloppeReserve = NonNullable<CoffreMovement['enveloppe']>;

export const RESERVE_LABELS: Record<EnveloppeReserve, string> = {
  reinvestissement: 'Réinvestissement',
  fiscale: 'Fiscale & imprévus',
};

export const ENVELOPPES_RESERVE: EnveloppeReserve[] = ['reinvestissement', 'fiscale'];

/** Les lignes d'épargne du Partage, éventuellement d'une seule enveloppe. */
export const mvtsEnveloppe = (
  l: CoffreMovement[], branchId: string, env?: EnveloppeReserve,
): CoffreMovement[] =>
  l.filter((m) => m.branchId === branchId && m.origine === 'reserve' && (!env || m.enveloppe === env))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

/** Ce que porte une enveloppe (ou les deux) DANS le coffre. Un dépôt ajoute,
    un virement retire — le coffre n'a pas d'autre sortie. */
export const soldeEnveloppe = (
  l: CoffreMovement[], branchId: string, env?: EnveloppeReserve,
): number =>
  mvtsEnveloppe(l, branchId, env)
    .reduce((s, m) => s + (m.kind === 'depot' ? m.amountXof : -m.amountXof), 0);

/** Identifiant déterministe de la dotation mensuelle — inscrire deux fois le
    même mois ne fait qu'UNE ligne, et la réinscrire l'ajuste.
    LA BRANCHE EST DANS L'IDENTIFIANT (12 août) : le coffre est PARTAGÉ entre
    branches et l'id est la clé primaire de synchro — sans elle, la branche B
    inscrivant août effaçait la dotation d'août de la branche A. */
export const dotationId = (branchId: string, env: EnveloppeReserve, mk: string): string =>
  `dot-${branchId}-${env}-${mk}`;
/** L'ancien identifiant, sans branche — encore en base pour les mois déjà dotés. */
export const dotationIdLegacy = (env: EnveloppeReserve, mk: string): string => `dot-${env}-${mk}`;

/** La dotation d'un mois, si elle est déjà au coffre — celle de CETTE branche.
    L'ENVELOPPE EST VÉRIFIÉE, pas seulement l'identifiant, et l'ancien id sans
    branche reste reconnu (les dotations d'avant le 12 août le portent). */
export const dotationDuMois = (
  l: CoffreMovement[], branchId: string, env: EnveloppeReserve, mk: string,
): CoffreMovement | undefined =>
  l.find((m) => (m.id === dotationId(branchId, env, mk)
    || (m.id === dotationIdLegacy(env, mk) && m.branchId === branchId))
    && m.enveloppe === env);

/** Corriger une ligne d'épargne — elle vit au coffre, elle s'y modifie.
    L'ENVELOPPE D'UNE DOTATION NE SE RE-LIBELLE PAS (12 août) : son identifiant
    la porte, et la lecture (`dotationDuMois`) vérifie les deux. Re-libeller
    faisait dire « rien d'inscrit » au panneau, dont le bouton détruisait alors
    la ligne re-libellée — 100 000 F disparaissaient de l'autre enveloppe sans
    trace. Pour changer d'enveloppe : retirer la dotation, re-doter l'autre. */
export const modifieLigneEpargne = (
  id: string,
  patch: Partial<Pick<CoffreMovement, 'date' | 'enveloppe' | 'kind' | 'amountXof' | 'note'>>,
): void => {
  const sain = id.startsWith('dot-') ? (({ enveloppe: _e, ...reste }) => reste)(patch) : patch;
  coffreStore.set((prev) => prev.map((m) => (m.id === id ? { ...m, ...sain } : m)));
};

/** METTRE DE CÔTÉ — une seule étape : la dotation entre directement au coffre.
    Le remplacement ne touche que LA ligne de CETTE branche (nouvel id, ou
    ancien id si c'est elle qui l'avait écrit) — jamais celle d'une autre. */
export function doterAuCoffre(p: {
  branchId: string; enveloppe: EnveloppeReserve; mois: string; amountXof: number; date: string;
}): void {
  const montant = Math.round(p.amountXof);
  if (!(montant > 0)) return;
  const id = dotationId(p.branchId, p.enveloppe, p.mois);
  const legacy = dotationIdLegacy(p.enveloppe, p.mois);
  coffreStore.set((prev) => [...prev.filter((m) => !(m.id === id || (m.id === legacy && m.branchId === p.branchId))), {
    id, branchId: p.branchId, kind: 'depot', amountXof: montant, date: p.date,
    note: `Réserve · ${RESERVE_LABELS[p.enveloppe]} · dotation du mois`,
    origine: 'reserve', enveloppe: p.enveloppe,
  }]);
}

/** ANNULER LA DOTATION D'UN MOIS (15 août) — elle sort du coffre comme elle y
    est entrée : d'un seul geste, sans laisser de ligne de retrait. Ce n'est
    pas un virement (l'argent n'a pas quitté la maison), c'est une décision
    reprise — et sans ce chemin, la seule issue était d'aller chercher la
    ligne dans le registre de l'épargne pour la supprimer à la croix.

    Ne touche QUE la ligne de dotation de cette branche pour ce mois, par son
    identifiant — l'ancien sans branche compris, comme `doterAuCoffre`. Les
    versements libres et les virements restent intacts. */
export function annuleDotation(p: { branchId: string; enveloppe: EnveloppeReserve; mois: string }): void {
  const id = dotationId(p.branchId, p.enveloppe, p.mois);
  const legacy = dotationIdLegacy(p.enveloppe, p.mois);
  coffreStore.set((prev) => prev.filter((m) => !(
    (m.id === id || (m.id === legacy && m.branchId === p.branchId)) && m.enveloppe === p.enveloppe
  )));
}

/** Un versement libre dans une enveloppe — hors dotation mensuelle. */
export function verserDansEnveloppe(p: {
  branchId: string; enveloppe: EnveloppeReserve; amountXof: number; date: string; note?: string;
}): void {
  const montant = Math.round(p.amountXof);
  if (!(montant > 0)) return;
  coffreStore.set((prev) => [...prev, {
    id: `cof-res-${uid()}`, branchId: p.branchId, kind: 'depot', amountXof: montant, date: p.date,
    note: p.note?.trim() || `Réserve · ${RESERVE_LABELS[p.enveloppe]}`,
    origine: 'reserve', enveloppe: p.enveloppe,
  }]);
}

/** SORTIR de l'épargne — un virement, la seule sortie que le coffre autorise.
    On ne retire jamais plus que l'enveloppe ne porte. */
export function retirerDeEnveloppe(p: {
  branchId: string; enveloppe: EnveloppeReserve; amountXof: number; date: string;
  destination?: string; note?: string;
}): { ok: true } | { ok: false; erreur: string } {
  const montant = Math.round(p.amountXof);
  if (!(montant > 0)) return { ok: false, erreur: 'Un retrait porte sur un montant positif.' };
  const dispo = soldeEnveloppe(coffreStore.get(), p.branchId, p.enveloppe);
  if (montant > dispo) {
    return {
      ok: false,
      erreur: `L'enveloppe ${RESERVE_LABELS[p.enveloppe]} ne porte que ${dispo}, on ne retire pas ce qu'on n'a pas mis de côté.`,
    };
  }
  coffreStore.set((prev) => [...prev, {
    id: `cof-res-${uid()}`, branchId: p.branchId, kind: 'virement', amountXof: montant, date: p.date,
    bank: p.destination?.trim() || undefined,
    note: p.note?.trim() || `Réserve · ${RESERVE_LABELS[p.enveloppe]} · retrait`,
    origine: 'reserve', enveloppe: p.enveloppe,
  }]);
  return { ok: true };
}

/** Retirer une ligne d'épargne — elle vit dans le coffre, elle s'en retire. */
export const supprimeLigneEpargne = (id: string): void =>
  coffreStore.set((prev) => prev.filter((m) => m.id !== id));

/* ---------- Les caisses indépendantes — autant de mondes étanches ----------

   Il n'y en avait que DEUX, écrites en dur : Succession et Devises. Une
   limite arbitraire — une maison peut tenir une caisse par héritage, par
   projet, par personne, et rien ne justifiait de choisir à sa place. Une
   caisse se crée donc, se nomme, et emporte son registre.

   CE QUI NE CHANGE PAS, ET NE DOIT JAMAIS CHANGER : ces caisses ne
   participent à AUCUN calcul MND — ni revenu, ni charges, ni bénéfice, ni
   totaux. L'étanchéité est structurelle : aucun autre écran n'importe ces
   deux magasins. */

export type CaisseIndep = {
  id: string;
  branchId: string;
  nom: string;
  /** Devise physiquement détenue. Absente = la devise de la maison. Une caisse
      en devise garde des billets étrangers : son solde se compte dans SA
      devise et ne se reconvertit jamais — sinon le compte ne tomberait plus
      juste avec le tiroir. Même règle que les caisses du comptoir
      (`Cashbox.currency`), et elle se FIGE dès le premier mouvement. */
  devise?: string;
  /** À quoi elle sert, dans les mots de la Maison. */
  dit?: string;
  ordre?: number;
};

export type MouvementCaisseIndep = {
  id: string;
  branchId: string;
  caisseId: string;
  date: string;
  sens: 'entree' | 'sortie';
  label: string;
  /** LE MÊME MODÈLE QUE LES DÉPENSES (14 août) : une caisse à part tient de
      vraies dépenses — elles méritent leur motif, son détail, et plusieurs
      postes sur un même mouvement. `montant` vaut alors la somme des lignes. */
  motif?: string;
  sousMotif?: string;
  items?: PosteFoyer[];
  /** Montant DANS LA DEVISE DE LA CAISSE, toujours positif (décimales
      permises) ; le SENS porte le signe. */
  montant: number;
  /** 1 unité de la devise en monnaie de la maison, au taux saisi CE JOUR-LÀ.
      La contre-valeur est INDICATIVE : elle n'entre dans aucun total MND et
      ne se recalcule jamais à un taux du jour. Absent quand la caisse tient
      la devise de la maison. */
  taux?: number;
};

/** Devises proposées à la création — la saisie reste libre. */
export const DEVISES_CAISSE = ['EUR', 'USD', 'GBP', 'CAD'] as const;

export const caissesIndepStore = createStore<CaisseIndep[]>('mnd_caisses_indep', []);
export const useCaissesIndep = () => useStore(caissesIndepStore);

export const mouvementsCaisseStore = createStore<MouvementCaisseIndep[]>('mnd_caisses_indep_mvts', []);
export const useMouvementsCaisse = () => useStore(mouvementsCaisseStore);

/** Les caisses d'une branche, dans l'ordre voulu puis alphabétique. */
export const caissesDe = (l: CaisseIndep[], branchId: string): CaisseIndep[] =>
  l.filter((c) => c.branchId === branchId)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom, 'fr'));

/** La devise d'une caisse — celle de la maison par défaut. */
export const deviseDeCaisse = (c: CaisseIndep, deviseMaison: string): string => c.devise || deviseMaison;

/** Solde d'une caisse, DANS SA DEVISE. Arrondi à 2 décimales : une caisse en
    euros compte des centimes, et 0.1 + 0.2 ne doit pas rendre 0.30000000000004. */
export const soldeCaisse = (l: MouvementCaisseIndep[], caisseId: string): number =>
  Math.round(
    l.filter((m) => m.caisseId === caisseId)
      .reduce((s, m) => s + (m.sens === 'entree' ? m.montant : -m.montant), 0) * 100,
  ) / 100;

export const mouvementsDe = (l: MouvementCaisseIndep[], caisseId: string): MouvementCaisseIndep[] =>
  l.filter((m) => m.caisseId === caisseId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

/* ---------- Synchronisation — tables sous `is_souverain()` (0038, 0039) ---------- */

bindCollection(partageConfigStore, 'partage_config');
/* Les motifs du foyer suivent les autres registres : ils se synchronisent,
   donc la liste est la même au comptoir et sur le téléphone. */
bindCollection(motifsFoyerStore, 'motifs_foyer');
bindCollection(prelevementsStore, 'prelevements');
bindCollection(pretsStore, 'prets_associes');
/* `reserves_mouvements` (0038) n'est PLUS liée : l'épargne vit au coffre
   depuis 0041, qui a repris ses lignes. La table reste en base comme retour
   en arrière — c'est le patron des `repli_0023_`. */
bindCollection(caissesIndepStore, 'caisses_indep');
bindCollection(mouvementsCaisseStore, 'caisses_indep_mouvements');

/* ── L'ÉCHÉANCE D'UN PRÊT — 23 août 2026 ────────────────────────────
   « Crée-moi une gestion sans faille des prêts. » Maquette validée
   (`public/maquette-les-prets.html`).

   CE QUI MANQUAIT N'ÉTAIT PAS UN ÉCRAN, C'ÉTAIT UNE DATE. Le Trône savait
   combien la Maison avait prêté et combien était rentré ; il ne savait pas
   QUAND l'argent devait revenir. Un prêt sans date de retour ne se réclame
   pas : il s'oublie. Tout le reste — l'alerte, la relance, le tri par urgence
   — en découle.

   L'ÉCHÉANCE VIT SUR LA LIGNE DE PRÊT, jamais sur l'emprunteur : une même
   personne peut devoir deux prêts, contractés à deux dates, à rendre à deux
   moments. L'écran les regroupe pour la lecture ; le modèle, lui, ne mélange
   pas.

   LES ÉCHÉANCES ATTENDUES NE SONT PAS DES ÉCRITURES. Elles se calculent, elles
   ne se stockent pas : le jour où le montant d'un prêt se corrige, elles
   suivent. Et surtout, rien ne bouge dans une caisse tant que l'argent n'est
   pas revenu pour de bon — une attente qui débiterait un tiroir ferait mentir
   la trésorerie. */

/** Un versement attendu — calculé, jamais inscrit. */
export type EcheanceAttendue = {
  /** La ligne de prêt dont il découle. */
  pretId: string;
  date: string;
  montantXof: number;
  /** « le 2ᵉ sur 4 » — pour le dire à l'écran. */
  rang: number;
  sur: number;
};

/** Décale une date de `n` mois, en repliant sur le dernier jour du mois visé :
    le 31 janvier plus un mois tombe au 28 (ou 29), jamais au 3 mars. */
export const moisPlus = (iso: string, n: number): string => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const cible = new Date(Date.UTC(y, m - 1 + n, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  const jour = Math.min(d, dernier);
  return `${cible.getUTCFullYear()}-${String(cible.getUTCMonth() + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
};

/** Le nombre de jours entre deux dates ISO — positif si `b` est après `a`. */
export const joursEntre = (a: string, b: string): number =>
  Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000);

/** Ce qu'une ligne de prêt attend — une échéance, plusieurs, ou aucune. */
export const echeancesDuPret = (p: Pret): EcheanceAttendue[] => {
  if (p.type !== 'pret') return [];
  if (p.echeancier && p.echeancier.nombre > 1) {
    const n = Math.min(p.echeancier.nombre, 60);
    /* La part se calcule, ne se stocke pas : corriger le montant du prêt doit
       corriger les versements, pas laisser deux vérités face à face. Le dernier
       porte l'arrondi — sinon la somme des parts ne ferait pas le prêt. */
    const part = Math.round(p.amountXof / n);
    return Array.from({ length: n }, (_, i) => ({
      pretId: p.id,
      date: moisPlus(p.echeancier!.premier, i),
      montantXof: i === n - 1 ? p.amountXof - part * (n - 1) : part,
      rang: i + 1,
      sur: n,
    }));
  }
  if (p.echeance) {
    return [{ pretId: p.id, date: p.echeance, montantXof: p.amountXof, rang: 1, sur: 1 }];
  }
  return [];
};

/** L'état d'un emprunteur : son solde, ce qu'il doit encore et quand. */
export type EtatEmprunteur = SoldePret & {
  /** Ce qui reste attendu, du plus ancien au plus récent — arriérés en tête. */
  attendus: EcheanceAttendue[];
  /** La plus ancienne échéance non couverte, passée ou à venir. */
  prochaine?: EcheanceAttendue;
  /** Jours de retard sur la plus ancienne échéance dépassée. 0 = à jour. */
  retardJours: number;
  /** La retenue mensuelle proposée sur le bulletin, s'il y en a une. */
  retenueXof: number;
  /** Aucune de ses lignes de prêt ne porte de date de retour. */
  sansEcheance: boolean;
};

/* CE QUI EST REMBOURSÉ COUVRE LES ÉCHÉANCES LES PLUS ANCIENNES D'ABORD. C'est
   la règle du comptoir : on solde ce qui traîne avant ce qui vient. L'imputer
   autrement ferait apparaître un retard là où l'emprunteur a payé. */
export const etatsDesEmprunteurs = (
  lignes: readonly Pret[],
  branchId: string,
  aujourdhui: string,
): EtatEmprunteur[] => {
  const soldes = soldesParEmprunteur(lignes, branchId);
  return soldes.map((s) => {
    const siennes = lignes.filter((p) => p.branchId === branchId
      && (p.associe || 'Sans nom').trim().toLowerCase() === s.nom.toLowerCase());
    const prets = siennes.filter((p) => p.type === 'pret');
    const calendrier = prets.flatMap(echeancesDuPret).sort((a, b) => a.date.localeCompare(b.date));

    let couvre = s.rembourse;
    const attendus: EcheanceAttendue[] = [];
    for (const e of calendrier) {
      if (couvre >= e.montantXof) { couvre -= e.montantXof; continue; }
      attendus.push({ ...e, montantXof: e.montantXof - couvre });
      couvre = 0;
    }
    const enSouffrance = attendus.filter((e) => e.date < aujourdhui.slice(0, 10));
    return {
      ...s,
      attendus,
      prochaine: attendus[0],
      retardJours: enSouffrance.length > 0 ? joursEntre(enSouffrance[0].date, aujourdhui) : 0,
      retenueXof: prets.reduce((n, p) => n + (s.reste > 0 ? (p.retenueXof ?? 0) : 0), 0),
      sansEcheance: prets.length > 0 && calendrier.length === 0,
    };
  });
};

/* L'ORDRE DE LECTURE EST L'ORDRE DE L'URGENCE. Trié par date de saisie, le
   plus RÉCENT montait en tête — c'est-à-dire le moins pressant. Ici : le
   retard d'abord, du plus vieux au plus frais, puis ce qui arrive, puis le
   reste dû. Les soldés tombent en fin de liste. */
export const parUrgence = (a: EtatEmprunteur, b: EtatEmprunteur): number => {
  if ((a.reste > 0) !== (b.reste > 0)) return a.reste > 0 ? -1 : 1;
  if (a.retardJours !== b.retardJours) return b.retardJours - a.retardJours;
  if (a.prochaine && b.prochaine && a.prochaine.date !== b.prochaine.date) {
    return a.prochaine.date.localeCompare(b.prochaine.date);
  }
  if (!!a.prochaine !== !!b.prochaine) return a.prochaine ? -1 : 1;
  return b.reste - a.reste;
};

/** Ce que la Maison doit surveiller aujourd'hui — pour le Tableau de bord. */
export const pretsASurveiller = (
  lignes: readonly Pret[],
  branchId: string,
  aujourdhui: string,
  fenetreJours = 7,
): EtatEmprunteur[] =>
  etatsDesEmprunteurs(lignes, branchId, aujourdhui)
    .filter((e) => e.reste > 0 && e.prochaine
      && joursEntre(aujourdhui, e.prochaine.date) <= fenetreJours)
    .sort(parUrgence);

