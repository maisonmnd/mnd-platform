import type { ReleveDeLaCandidature } from './releve-pur';
/* ══ LA DIRECTION DES RESSOURCES HUMAINES, SES RÈGLES — 14 octobre 2026 ══

   Maquette QLU1EoT6… validée (« construis »), quatre choix : la direction
   seule (le souverain, dans la base), l'espace complet de chaque employée,
   la grille des compétences qui AVERTIT l'agenda, tout en une mise en ligne.

   Pur : ni magasin, ni réseau, ni horloge. Le banc
   `verifie-la-direction-des-rh` l'éprouve.

   LE TRÔNE NE TRANCHE JAMAIS UNE RÈGLE DE DROIT. Durée d'essai, préavis,
   dates de la CNSS et de l'ITS, délais : des réglages (`ReglagesRh`), VIDES
   tant que le comptable ou un juriste ne les a pas donnés. Un réglage vide
   se dit « à confirmer », il ne se devine pas. */

/* ══ LES DATES ═══════════════════════════════════════════════════════ */

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const estDate = (iso?: string): iso is string => !!iso && /^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(iso);
/** « 14 oct. 2026 » : toujours l'année. */
export const dateDite = (iso?: string): string => {
  if (!estDate(iso)) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
};
const enUtc = (iso: string): number => {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, j);
};
const versIso = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const ajouteJours = (iso: string, n: number): string => versIso(enUtc(iso) + n * 86_400_000);
export const ecartEnJours = (de: string, a: string): number => Math.round((enUtc(a) - enUtc(de)) / 86_400_000);
export const ajouteMois = (iso: string, n: number): string => {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + n, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  return versIso(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth(), Math.min(j, dernier)));
};
/** Lundi = 0 … dimanche = 6. */
export const jourDeLaSemaine = (iso: string): number => (new Date(enUtc(iso)).getUTCDay() + 6) % 7;
export const lundiDe = (iso: string): string => ajouteJours(iso, -jourDeLaSemaine(iso));
export const JOURS_COURTS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];

/* ══ LES RÉGLAGES, À CONFIRMER ═══════════════════════════════════════ */

export type ReglagesRh = {
  /** Durée de la période d'essai, en jours, par fonction. */
  essaiJours?: Record<string, number>;
  /** Préavis, en jours, par fonction. */
  preavisJours?: Record<string, number>;
  /** Délai laissé pour répondre à une demande d'explication, en jours. */
  delaiExplicationJours?: number;
  /** Une sanction sort du dossier après tant de mois. */
  sanctionSortApresMois?: number;
  /** Une candidature non retenue s'efface après tant de mois (proposition : 6). */
  candidatureGardeeMois?: number;
  /** La Relève (15 octobre 2026) : l'allocation par année (F par mois) et le seuil de la grille sur 100. */
  releve?: { allocations?: number[]; seuil?: number };
  /** Le jour du mois des déclarations CNSS et ITS. */
  cnssJour?: number;
  itsJour?: number;
  /** Délai de la déclaration d'embauche à la CNSS, en jours. */
  declarationEmbaucheJours?: number;
  /** Délai de déclaration d'un accident du travail, en heures. */
  accidentHeures?: number;
  /** Au-delà de tant d'heures au fauteuil, une pause se note au planning. */
  seuilPauseHeures?: number;
  /** Les jours d'ouverture, lundi = 0. */
  joursOuverts?: number[];
  /** Le numéro employeur de la Maison à la CNSS. */
  cnssEmployeur?: string;
};
/** La seule durée proposée par défaut, parce qu'elle protège : les données
    des personnes qui ne travaillent pas à la Maison ne s'y gardent pas. */
export const GARDE_DES_CANDIDATURES_MOIS = 6;

/** LE SALAIRE MINIMUM — 52 000 F par mois depuis le 1er janvier 2023 (décret
    de décembre 2022). Les sources lues le 14 octobre 2026 concordent sur le
    montant ; seul le numéro du décret varie. Un salaire en dessous se dit. */
export const SMIG_MENSUEL_XOF = 52_000;
export const sousLeSmig = (baseXof: number | undefined, contrat?: string): boolean =>
  typeof baseXof === 'number' && baseXof > 0 && baseXof < SMIG_MENSUEL_XOF && contrat !== 'prestataire' && contrat !== 'apprentissage';

/* ══ LA FICHE ════════════════════════════════════════════════════════ */

/** Ce que la direction des RH lit d'une fiche. */
export type FicheRh = {
  id: string;
  name: string;
  role: string;
  branchId?: string;
  email?: string;
  compteMail?: string;
  since?: string;
  auFauteuil?: boolean;
  contractType?: string;
  salaireXof?: number;
  cnssNum?: string;
  finContrat?: string;
  finEssai?: string;
  aptitude?: { apte: boolean; le: string };
  urgence?: { nom: string; telephone: string; lien?: string };
  integration?: Record<string, string>;
  depart?: Depart;
  competences?: Record<string, Competence>;
  archiveeLe?: string;
  reglement?: unknown;
};

/** UNE FICHE RELIÉE À UN COMPTE se reconnaît dans la base (est_ma_fiche,
    0090) : sans adresse, elle ne pointe pas et ne voit pas son espace. */
export const estReliee = (f: Pick<FicheRh, 'email' | 'compteMail'>): boolean =>
  !!((f.compteMail ?? '').trim() || (f.email ?? '').trim());

export const estPartie = (f: Pick<FicheRh, 'archiveeLe'>, jour: string): boolean => !!f.archiveeLe && f.archiveeLe <= jour;

/** Les pièces que la direction attend dans un dossier. */
export type PieceAttendue = 'adresse' | 'contrat' | 'aptitude' | 'urgence' | 'cnss';
export const PIECES_ATTENDUES: Record<PieceAttendue, string> = {
  adresse: 'adresse de connexion (pour pointer et voir son espace)',
  contrat: 'contrat de travail signé, rangé au dossier',
  aptitude: 'aptitude médicale (apte, avec sa date)',
  urgence: 'contact à prévenir en cas d’urgence',
  cnss: 'numéro CNSS',
};
export function piecesManquantes(f: FicheRh, piecesRangees: readonly { staffId: string; type: string }[]): PieceAttendue[] {
  const out: PieceAttendue[] = [];
  const salariee = f.contractType === 'CDI' || f.contractType === 'CDD';
  if (!estReliee(f)) out.push('adresse');
  if (salariee && !piecesRangees.some((p) => p.staffId === f.id && p.type === 'contrat')) out.push('contrat');
  if (salariee && !f.aptitude) out.push('aptitude');
  if (!f.urgence?.telephone) out.push('urgence');
  if (salariee && !(f.cnssNum ?? '').trim()) out.push('cnss');
  return out;
}

/* ══ LA GRILLE DES COMPÉTENCES ═══════════════════════════════════════ */

export type Niveau = 'formation' | 'autonome' | 'referente';
export const NIVEAUX: Record<Niveau, string> = { formation: 'en formation', autonome: 'autonome', referente: 'référente' };
export const RANG_DU_NIVEAU: Record<Niveau, number> = { formation: 0, autonome: 1, referente: 2 };
/** Un niveau garde sa date et qui l'a validé. */
export type Competence = { niveau: Niveau; le: string; par?: string };

/** LA GRILLE AVERTIT, ELLE NE BLOQUE PAS (choix du 14 octobre 2026). Comme
    l'habilitation (paliers.ts) : rien à dire si une main est autonome sur la
    famille, ni si une main n'a pas de grille posée (on ne devine pas), ni
    sans famille, ni sans main. On avertit quand TOUTES les mains ont une
    grille et qu'aucune n'est autonome sur une famille du rendez-vous. */
export function avertissementDeLaGrille(o: {
  familles: readonly (string | undefined)[];
  mains: readonly { nom: string; competences?: Record<string, Competence> }[];
  nomDeLaFamille: (id: string) => string;
}): string | null {
  if (o.mains.length === 0) return null;
  if (o.mains.some((m) => !m.competences || Object.keys(m.competences).length === 0)) return null;
  const vues = new Set<string>();
  const manques: string[] = [];
  for (const f of o.familles) {
    if (!f || vues.has(f)) continue;
    vues.add(f);
    const capable = o.mains.some((m) => {
      const c = m.competences?.[f];
      return !!c && RANG_DU_NIVEAU[c.niveau] >= RANG_DU_NIVEAU.autonome;
    });
    if (!capable) manques.push(o.nomDeLaFamille(f));
  }
  if (manques.length === 0) return null;
  const qui = o.mains.map((m) => m.nom).join(', ');
  return manques.length === 1
    ? `${manques[0]} : ${qui} n’y ${o.mains.length > 1 ? 'sont' : 'est'} pas encore ${o.mains.length > 1 ? 'autonomes' : 'autonome'}, d’après la grille des compétences.`
    : `${manques.join(', ')} : aucune des mains (${qui}) n’y est encore autonome, d’après la grille des compétences.`;
}

/* ══ LE PLANNING ═════════════════════════════════════════════════════ */

export type Statut = 'fauteuil' | 'accueil' | 'travail' | 'academie' | 'repos' | 'conge';
export const STATUTS: Record<Statut, string> = {
  fauteuil: 'fauteuil', accueil: 'accueil', travail: 'au travail', academie: 'Académie', repos: 'repos', conge: 'congé',
};
/** Une semaine : sept cases, lundi d'abord ; vide = rien de prévu. */
export type Semaine = (Statut | '')[];
export type Planning = {
  /** La semaine type de chacune. */
  modele?: Record<string, Semaine>;
  /** Les semaines qui s'en écartent, par leur lundi. */
  semaines?: Record<string, Record<string, Semaine>>;
};
export function statutDuJour(p: Planning | undefined, staffId: string, iso: string): Statut | undefined {
  const i = jourDeLaSemaine(iso);
  const semaine = p?.semaines?.[lundiDe(iso)]?.[staffId];
  const v = semaine?.[i] || p?.modele?.[staffId]?.[i] || '';
  return v || undefined;
}
export function semaineDe(p: Planning | undefined, staffId: string, lundi: string): Semaine {
  return Array.from({ length: 7 }, (_, i) => statutDuJour(p, staffId, ajouteJours(lundi, i)) ?? '');
}
/** Pose un statut un jour donné, dans la semaine qui s'écarte du modèle. */
export function poseLeJour(p: Planning | undefined, staffId: string, iso: string, s: Statut | ''): Planning {
  const lundi = lundiDe(iso);
  const base = semaineDe(p, staffId, lundi);
  base[jourDeLaSemaine(iso)] = s;
  return { ...p, semaines: { ...(p?.semaines ?? {}), [lundi]: { ...(p?.semaines?.[lundi] ?? {}), [staffId]: base } } };
}
/** Un congé accordé se pose au planning, jour par jour. */
export function poseLeConge(p: Planning | undefined, staffId: string, debut: string, fin: string): Planning {
  let out = p ?? {};
  for (let d = debut, n = 0; d <= fin && n < 400; d = ajouteJours(d, 1), n += 1) out = poseLeJour(out, staffId, d, 'conge');
  return out;
}
/** UN RENDEZ-VOUS SUR UNE MAIN EN REPOS SE SIGNALE (maquette) ; il ne se
    refuse pas : un échange de jour se règle à la main. */
export function avertissementDuPlanning(o: { planning?: Planning; date: string; mains: readonly { id: string; nom: string }[] }): string | null {
  const absentes = o.mains.filter((m) => {
    const s = statutDuJour(o.planning, m.id, o.date);
    return s === 'repos' || s === 'conge';
  });
  if (absentes.length === 0) return null;
  return `Au planning du ${dateDite(o.date)} : ${absentes.map((m) => `${m.nom} (${STATUTS[statutDuJour(o.planning, m.id, o.date) as Statut]})`).join(', ')}.`;
}

/* ══ L'ARRIVÉE : LA LISTE DU PREMIER MOIS ═════════════════════════════ */

export type QuandDansLArrivee = 'avant' | 'jour1' | 'semaine1' | 'mois1';
export const QUAND_DANS_L_ARRIVEE: Record<QuandDansLArrivee, string> = {
  avant: 'Avant le premier jour', jour1: 'Le premier jour', semaine1: 'La première semaine', mois1: 'Le premier mois',
};
export type EtapeDArrivee = { cle: string; quand: QuandDansLArrivee; texte: string; fauteuilSeulement?: boolean };
export const ARRIVEE_DEFAUT: EtapeDArrivee[] = [
  { cle: 'place', quand: 'avant', texte: 'Place préparée dans le Trône' },
  { cle: 'contrat', quand: 'avant', texte: 'Contrat rédigé au Secrétariat' },
  { cle: 'tenue', quand: 'avant', texte: 'Tenue et tablier à sa taille' },
  { cle: 'planning', quand: 'avant', texte: 'Planning de sa première semaine' },
  { cle: 'signature', quand: 'jour1', texte: 'Contrat signé, un exemplaire pour elle' },
  { cle: 'reglement', quand: 'jour1', texte: 'Règlement intérieur remis contre décharge' },
  { cle: 'fiche', quand: 'jour1', texte: 'Fiche de poste remise' },
  { cle: 'visite', quand: 'jour1', texte: 'Visite, casier, hygiène des outils' },
  { cle: 'binome', quand: 'jour1', texte: 'Une maîtresse qui l’accompagne le premier mois', fauteuilSeulement: true },
  { cle: 'cnss', quand: 'semaine1', texte: 'Déclaration d’embauche à la CNSS' },
  { cle: 'protocoles', quand: 'semaine1', texte: 'Protocoles du manuel des formatrices lus', fauteuilSeulement: true },
  { cle: 'aptitude', quand: 'semaine1', texte: 'Aptitude médicale' },
  { cle: 'trente', quand: 'mois1', texte: 'Point à 30 jours' },
  { cle: 'finessai', quand: 'mois1', texte: 'Entretien de fin d’essai, décision signée' },
];
/** La liste d'une fonction : son modèle s'il est réglé (des clés), sinon la
    liste par défaut, sans les étapes du fauteuil pour qui n'y est pas. */
export function etapesDArrivee(fonction: string, auFauteuil: boolean, modeles?: Record<string, string[]>): EtapeDArrivee[] {
  const choisies = modeles?.[fonction];
  if (choisies && choisies.length) return ARRIVEE_DEFAUT.filter((e) => choisies.includes(e.cle));
  return ARRIVEE_DEFAUT.filter((e) => auFauteuil || !e.fauteuilSeulement);
}
export function avancementDeLArrivee(f: Pick<FicheRh, 'role' | 'auFauteuil' | 'integration'>, modeles?: Record<string, string[]>): { faites: number; total: number } {
  const etapes = etapesDArrivee(f.role, !!f.auFauteuil, modeles);
  return { faites: etapes.filter((e) => !!f.integration?.[e.cle]).length, total: etapes.length };
}

/* ══ LE DÉPART : UNE ARCHIVE, PLUS UN EFFACEMENT ══════════════════════ */

export type TypeDeDepart = 'demission' | 'fin-cdd' | 'rupture-essai' | 'licenciement' | 'retraite' | 'autre';
export const TYPES_DE_DEPART: Record<TypeDeDepart, string> = {
  demission: 'Démission', 'fin-cdd': 'Fin de CDD', 'rupture-essai': 'Rupture de la période d’essai',
  licenciement: 'Licenciement', retraite: 'Retraite', autre: 'Autre',
};
export type Depart = {
  type: TypeDeDepart;
  annonceLe: string;
  dernierJour: string;
  /** Le numéro du courrier au Secrétariat (A- ou D-). */
  courrier?: string;
  /** Étape → jour où elle a été faite. */
  etapes: Record<string, string>;
  /** Ses mots, gardés tels quels, lus par la direction seule. */
  entretien?: string;
};
export const ETAPES_DU_DEPART: { cle: string; texte: string }[] = [
  { cle: 'lettre', texte: 'Lettre reçue ou remise, enregistrée au courrier' },
  { cle: 'preavis', texte: 'Préavis posé selon la fonction et l’ancienneté' },
  { cle: 'solde', texte: 'Solde de tout compte préparé' },
  { cle: 'certificat', texte: 'Certificat de travail remis' },
  { cle: 'materiel', texte: 'Tenue, clés et matériel rendus' },
  { cle: 'acces', texte: 'Accès au Trône coupé le dernier jour, à la fermeture' },
  { cle: 'entretien', texte: 'Entretien de départ' },
];
/** Le dernier jour proposé : l'annonce plus le préavis réglé ; sans
    réglage, rien n'est proposé (on ne devine pas une durée légale). */
export function dernierJourPropose(annonceLe: string, fonction: string, r: ReglagesRh | undefined): string | undefined {
  const j = r?.preavisJours?.[fonction];
  return typeof j === 'number' && j >= 0 ? ajouteJours(annonceLe, j) : undefined;
}
/** LE SOLDE DE TOUT COMPTE, SES ÉLÉMENTS. L'indemnité de congés est une
    ESTIMATION (base ÷ 26 jours ouvrables × jours restants), à faire
    confirmer par le comptable ; le reste du prêt suit l'engagement signé. */
export function soldeDeToutCompte(o: { baseXof?: number; congesRestants: number; resteDuPretXof: number }): {
  congesJours: number; indemniteCongesEstimeeXof: number; resteDuPretXof: number;
} {
  const jours = Math.max(0, Math.round(o.congesRestants * 10) / 10);
  const parJour = (o.baseXof ?? 0) / 26;
  return { congesJours: jours, indemniteCongesEstimeeXof: Math.round(parJour * jours), resteDuPretXof: Math.max(0, o.resteDuPretXof) };
}

/* ══ LE REGISTRE DES RH (table `rh`, 0130) ═══════════════════════════ */

type Base = { id: string; branchId: string; creeLe: string; creePar: string; majLe?: string; staffId?: string; partage?: boolean };

export type EtapeDeCandidature = 'recue' | 'appel' | 'essai' | 'decision' | 'retenue' | 'non-retenue';
export const ETAPES_DE_CANDIDATURE: Record<EtapeDeCandidature, string> = {
  recue: 'Reçue', appel: 'Appel', essai: 'Essai pratique', decision: 'Décision', retenue: 'Retenue', 'non-retenue': 'Non retenue',
};
export const COLONNES_DU_RECRUTEMENT: EtapeDeCandidature[] = ['recue', 'appel', 'essai', 'decision'];
export type SourceDeCandidature = 'whatsapp' | 'academie' | 'recommandation' | 'site' | 'autre';
export const SOURCES: Record<SourceDeCandidature, string> = {
  whatsapp: 'WhatsApp', academie: 'Académie MND', recommandation: 'Recommandation', site: 'Le site', autre: 'Autre',
};
export type Poste = Base & { genre: 'poste'; titre: string; fonction: string; contrat?: string; ouvertLe: string; fermeLe?: string; annonce?: string; fourchette?: string;
  /** La promotion de La Relève que ce poste reçoit (15 octobre 2026), ex. « 2027-04 ». */
  releve?: string };
export type Candidature = Base & {
  genre: 'candidature'; posteId?: string; nom: string; telephone?: string; source: SourceDeCandidature; recommandeePar?: string;
  recueLe: string; etape: EtapeDeCandidature; prochainLe?: string;
  essai?: { le?: string; famille?: string; niveau?: Niveau; note?: string };
  reponduLe?: string; note?: string;
  /** Le dossier venu du site de l'Académie, sa grille, son contrat (La Relève, 15 octobre 2026). */
  releve?: ReleveDeLaCandidature;
};
export type TypeDEntretien = 'trente-jours' | 'fin-essai' | 'annuel' | 'retour' | 'depart';
export const TYPES_D_ENTRETIEN: Record<TypeDEntretien, string> = {
  'trente-jours': 'Point à 30 jours', 'fin-essai': 'Fin de période d’essai', annuel: 'Entretien annuel', retour: 'Entretien de retour', depart: 'Entretien de départ',
};
export type DecisionDEssai = 'confirme' | 'renouvele' | 'rompu';
export const DECISIONS_D_ESSAI: Record<DecisionDEssai, string> = { confirme: 'Confirmée', renouvele: 'Essai renouvelé une fois', rompu: 'Essai rompu' };
export type Entretien = Base & {
  genre: 'entretien'; staffId: string; type: TypeDEntretien; prevuLe: string; faitLe?: string;
  avec?: string; elle?: string; maison?: string; suite?: string; decision?: DecisionDEssai;
};
export type DecisionDisciplinaire = 'aucune' | 'rappel' | 'avertissement' | 'mise-a-pied' | 'rupture';
export const DECISIONS_DISCIPLINAIRES: Record<DecisionDisciplinaire, string> = {
  aucune: 'Pas de suite', rappel: 'Rappel', avertissement: 'Avertissement écrit', 'mise-a-pied': 'Mise à pied', rupture: 'Rupture',
};
export type Sanction = Base & {
  genre: 'sanction'; staffId: string; faits: string; faitsLe: string; vusPar?: string;
  explicationDemandeeLe?: string; explicationAvant?: string; reponseLe?: string; reponse?: string;
  decision?: DecisionDisciplinaire; decideeLe?: string; lettre?: string; sortLe?: string;
};
/** Où en est une procédure : ses étapes, dans l'ordre. */
export function etapeDeLaProcedure(s: Pick<Sanction, 'explicationDemandeeLe' | 'reponseLe' | 'decision' | 'lettre'>): 1 | 2 | 3 | 4 | 5 {
  if (s.decision === 'aucune') return 5;
  if (!s.explicationDemandeeLe) return 1;
  if (!s.reponseLe && !s.decision) return 2;
  if (!s.decision) return 3;
  if (!s.lettre) return 4;
  return 5;
}
/** Le jour où la sanction sort du dossier, quand le délai est réglé. */
export const sortieDeLaSanction = (decideeLe: string | undefined, r: ReglagesRh | undefined): string | undefined =>
  decideeLe && typeof r?.sanctionSortApresMois === 'number' && r.sanctionSortApresMois > 0 ? ajouteMois(decideeLe, r.sanctionSortApresMois) : undefined;

export type TypeDePiece = 'contrat' | 'reglement' | 'fiche-de-poste' | 'aptitude' | 'cnss' | 'identite' | 'diplome' | 'avenant' | 'autre';
export const TYPES_DE_PIECE: Record<TypeDePiece, string> = {
  contrat: 'Contrat de travail', reglement: 'Règlement intérieur signé', 'fiche-de-poste': 'Fiche de poste', aptitude: 'Aptitude médicale',
  cnss: 'Attestation CNSS', identite: 'Pièce d’identité', diplome: 'Diplôme ou certificat', avenant: 'Avenant', autre: 'Autre pièce',
};
/** Ce qui se partage avec elle d'office : ce qu'elle a signé. */
export const PARTAGEE_D_OFFICE: Record<TypeDePiece, boolean> = {
  contrat: true, reglement: true, 'fiche-de-poste': true, avenant: true, aptitude: false, cnss: true, identite: false, diplome: true, autre: false,
};
export type Fichier = { chemin: string; nom: string; type: string; taille: number };
export type PieceDuDossier = Base & { genre: 'piece'; staffId: string; type: TypeDePiece; titre: string; le: string; fichier?: Fichier };
export type Accident = Base & { genre: 'accident'; staffId: string; le: string; quoi: string; declareLe?: string };
export type Formation = Base & {
  genre: 'formation'; staffId: string; famille?: string; titre: string;
  /** Qui l'accompagne (pas qui l'a écrite : `creePar`). */
  avec?: string;
  objectif?: Niveau; objectifLe?: string; seances: { le: string; avec?: string; faite?: boolean }[];
};
export type LigneRh = Poste | Candidature | Entretien | Sanction | PieceDuDossier | Accident | Formation;

/** Une candidature qui a assez attendu : non retenue, répondue, plus vieille
    que la garde réglée. On la PROPOSE à l'effacement, rien ne part seul. */
export function candidaturesAEffacer(l: readonly Candidature[], r: ReglagesRh | undefined, jour: string): Candidature[] {
  const mois = r?.candidatureGardeeMois ?? GARDE_DES_CANDIDATURES_MOIS;
  return l.filter((c) => c.etape === 'non-retenue' && ajouteMois(c.reponduLe ?? c.recueLe, mois) <= jour);
}

/* ══ LES OBLIGATIONS ═════════════════════════════════════════════════ */

export type Obligation = { cle: string; titre: string; rythme: string; reglage?: keyof ReglagesRh; note: string };
export const OBLIGATIONS: Obligation[] = [
  { cle: 'cnss', titre: 'Déclaration et versement des cotisations CNSS', rythme: 'chaque mois', reglage: 'cnssJour', note: 'Le récapitulatif CNSS sort déjà du run de paie ; la déclaration se fait sur le site de la CNSS.' },
  { cle: 'its', titre: 'ITS retenu sur les salaires, à reverser', rythme: 'chaque mois', reglage: 'itsJour', note: 'Calculé par tranches dans le run ; la date vient du comptable.' },
  { cle: 'embauche', titre: 'Déclaration d’embauche à la CNSS', rythme: 'à chaque arrivée', reglage: 'declarationEmbaucheJours', note: 'Le délai se règle une fois ; chaque arrivée la rappelle.' },
  { cle: 'registre', titre: 'Registre de l’employeur', rythme: 'à jour en permanence', note: 'Tenu seul à partir des fiches ; la forme exigée par l’inspection du travail est à vérifier.' },
  { cle: 'affichage', titre: 'Affichages dans les locaux', rythme: 'en permanence', note: 'Horaires, règlement intérieur, adresse de l’inspection du travail : la liste exacte est à vérifier.' },
  { cle: 'accident', titre: 'Accident du travail déclaré à la CNSS', rythme: 'à chaque accident', reglage: 'accidentHeures', note: 'Le délai légal se règle une fois.' },
];
/** La date du mois pour une obligation mensuelle réglée par son jour. */
export function dateDuMois(jourDuMois: number | undefined, jour: string): string | undefined {
  if (typeof jourDuMois !== 'number' || jourDuMois < 1 || jourDuMois > 31) return undefined;
  const [a, m] = jour.split('-').map(Number);
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const iso = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(jourDuMois, dernier)).padStart(2, '0')}`;
  return iso >= jour ? iso : dateDuMois(jourDuMois, ajouteMois(`${a}-${String(m).padStart(2, '0')}-01`, 1));
}

/* ══ CE QUI ATTEND LA DIRECTION, CHAQUE MATIN ════════════════════════ */

export type OngletRh = 'jour' | 'personnel' | 'recrutement' | 'arrivees' | 'temps' | 'paie' | 'competences' | 'entretiens' | 'discipline' | 'obligations';
export type ARegarder = { cle: string; date?: string; quoi: string; titre: string; sous?: string; onglet: OngletRh; urgent: boolean };

export function ceQuiAttendLaDirection(o: {
  fiches: readonly FicheRh[];
  conges: readonly { id: string; employeeId: string; status: string; startDate: string; endDate: string; days?: number }[];
  registre: readonly LigneRh[];
  reglages?: ReglagesRh;
  modelesDArrivee?: Record<string, string[]>;
  jour: string;
}): ARegarder[] {
  const out: ARegarder[] = [];
  const nom = (id: string) => o.fiches.find((f) => f.id === id)?.name ?? 'une fiche';
  const actives = o.fiches.filter((f) => !estPartie(f, o.jour));
  const pieces = o.registre.filter((l): l is PieceDuDossier => l.genre === 'piece');
  for (const f of actives) {
    if (f.finEssai && ecartEnJours(o.jour, f.finEssai) <= 30 && ecartEnJours(o.jour, f.finEssai) >= -7
      /* Un entretien de fin d'essai déjà posé la porte : une seule ligne. */
      && !o.registre.some((l) => l.genre === 'entretien' && l.staffId === f.id && l.type === 'fin-essai')) {
      out.push({ cle: `essai:${f.id}`, date: f.finEssai, quoi: 'Fin de période d’essai', titre: f.name, sous: f.role, onglet: 'entretiens', urgent: ecartEnJours(o.jour, f.finEssai) <= 7 });
    }
    if (f.finContrat && f.contractType === 'CDD' && !f.depart && ecartEnJours(o.jour, f.finContrat) <= 30) {
      out.push({ cle: `cdd:${f.id}`, date: f.finContrat, quoi: 'CDD à son terme', titre: f.name, sous: 'Renouveler, passer en CDI ou ne pas renouveler', onglet: 'personnel', urgent: ecartEnJours(o.jour, f.finContrat) <= 7 });
    }
    const manque = piecesManquantes(f, pieces);
    if (manque.length) out.push({ cle: `pieces:${f.id}`, quoi: 'Dossier incomplet', titre: f.name, sous: manque.map((p) => PIECES_ATTENDUES[p]).join(' · '), onglet: 'personnel', urgent: manque.includes('adresse') });
    if (f.depart && f.depart.dernierJour >= o.jour) {
      const reste = ETAPES_DU_DEPART.filter((e) => !f.depart?.etapes[e.cle]).length;
      if (reste) out.push({ cle: `depart:${f.id}`, date: f.depart.dernierJour, quoi: `${TYPES_DE_DEPART[f.depart.type]} · dernier jour`, titre: f.name, sous: `${reste} étape${reste > 1 ? 's' : ''} du départ à faire`, onglet: 'arrivees', urgent: ecartEnJours(o.jour, f.depart.dernierJour) <= 7 });
    }
    if (f.since && ecartEnJours(f.since, o.jour) <= 45 && ecartEnJours(f.since, o.jour) >= -30) {
      const a = avancementDeLArrivee(f, o.modelesDArrivee);
      if (a.faites < a.total) out.push({ cle: `arrivee:${f.id}`, date: f.since, quoi: 'Arrivée en cours', titre: f.name, sous: `${a.faites} sur ${a.total} étapes faites`, onglet: 'arrivees', urgent: false });
    }
  }
  for (const c of o.conges) {
    if (c.status !== 'demande') continue;
    out.push({ cle: `conge:${c.id}`, date: c.startDate, quoi: 'Congé demandé', titre: nom(c.employeeId), sous: `du ${dateDite(c.startDate)} au ${dateDite(c.endDate)}`, onglet: 'temps', urgent: ecartEnJours(o.jour, c.startDate) <= 7 });
  }
  for (const l of o.registre) {
    if (l.genre === 'entretien' && !l.faitLe && ecartEnJours(o.jour, l.prevuLe) <= 14) {
      out.push({ cle: `ent:${l.id}`, date: l.prevuLe, quoi: TYPES_D_ENTRETIEN[l.type], titre: nom(l.staffId), onglet: 'entretiens', urgent: ecartEnJours(o.jour, l.prevuLe) <= 2 });
    }
    if (l.genre === 'sanction') {
      const etape = etapeDeLaProcedure(l);
      if (etape === 2 && l.explicationAvant && l.explicationAvant <= o.jour) {
        out.push({ cle: `expl:${l.id}`, date: l.explicationAvant, quoi: 'Explication attendue', titre: nom(l.staffId), sous: l.faits, onglet: 'discipline', urgent: true });
      }
      if (l.sortLe && l.sortLe <= o.jour && l.decision && l.decision !== 'aucune') {
        out.push({ cle: `sort:${l.id}`, date: l.sortLe, quoi: 'Sanction à sortir du dossier', titre: nom(l.staffId), sous: DECISIONS_DISCIPLINAIRES[l.decision], onglet: 'discipline', urgent: false });
      }
    }
  }
  const aEffacer = candidaturesAEffacer(o.registre.filter((l): l is Candidature => l.genre === 'candidature'), o.reglages, o.jour);
  if (aEffacer.length) out.push({ cle: 'candidatures', quoi: 'Candidatures à effacer', titre: `${aEffacer.length} candidature${aEffacer.length > 1 ? 's' : ''} non retenue${aEffacer.length > 1 ? 's' : ''}`, sous: 'Plus vieilles que la durée de garde', onglet: 'recrutement', urgent: false });
  for (const ob of OBLIGATIONS) {
    if (ob.reglage !== 'cnssJour' && ob.reglage !== 'itsJour') continue;
    const d = dateDuMois(o.reglages?.[ob.reglage], o.jour);
    if (d && ecartEnJours(o.jour, d) <= 10) out.push({ cle: `ob:${ob.cle}:${d}`, date: d, quoi: 'Obligation', titre: ob.titre, onglet: 'obligations', urgent: ecartEnJours(o.jour, d) <= 3 });
  }
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.titre.localeCompare(b.titre));
}
