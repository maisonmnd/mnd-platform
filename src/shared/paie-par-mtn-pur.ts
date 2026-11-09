/* ══ LA PAIE PAR MTN · 5 novembre 2026, lot 2 ══════════════════════════
   Maquette 6bNGeh7nyABotDAXppWRoX, version 3, « construis ». Le 5 à 18 h,
   après le toucher de Yéman ou de Brice, le Trône envoie lui-même chaque net
   vers le numéro MTN de la fiche, par l'API MTN (Disbursement), depuis le
   compte de paie MTN de la Maison. MTN répond pour chaque personne : reçu,
   avec son numéro de transaction, ou refusé, avec la raison.

   Le serveur (fonction `paie-mtn`) fait les appels, par le relais de la
   Maison, seul autorisé chez MTN. Il tient le registre des envois
   (`paie_envois_mtn`, 0163) : une ligne par envoi, sa référence unique
   donnée AVANT le départ. Ici, les règles que le Trône applique avant de
   lui confier un envoi, et ce qu'il fait des réponses.

   Ses choix (5 novembre 2026, sélecteur) :
   · un test de 100 F à chacun, au début du mois, offert par la Maison
     (dépense « Essai de paie MTN »), pour l'équipe salariée ;
   · un nom différent chez MTN attend son « C'est bien son numéro » ;
   · le fichier du portail reste caché, en secours ;
   · une fiche validée en retard part au passage suivant, à 18 h.

   Claude ne déclenche jamais un envoi : seul le Trône confie les envois au
   serveur, après le toucher de la direction. */
import { RE_MSISDN, aCotonou, duMois, type CalendrierDeLaPaie, type LectureDeLaLigne } from './paie-du-5-pur';

/* ── 1. LE REGISTRE DES ENVOIS (paie_envois_mtn, 0163) ────────────────── */
export type EtatDeLEnvoi = 'programme' | 'envoi' | 'envoye' | 'sans-reponse' | 'recu' | 'refuse' | 'annule';
export type GenreDEnvoi = 'paie' | 'essai';
/** Une ligne du registre, telle que la base la rend. */
export type EnvoiMtn = {
  reference: string;
  genre: GenreDEnvoi;
  run_id: string | null;
  periode: string | null;
  essai_id: string | null;
  employee_id: string;
  nom: string;
  msisdn: string;
  montant_xof: number;
  etat: EtatDeLEnvoi;
  part_a: string;
  programme_par: string;
  programme_le: string;
  envoye_le?: string | null;
  repondu_le?: string | null;
  transaction_mtn?: string | null;
  raison?: string | null;
  remplace?: string | null;
  note?: string | null;
  tentatives?: number | null;
  /** Prévenir la personne (0164) ; le WhatsApp déposé (0165) et sa réponse. */
  prevenir?: boolean | null;
  whatsapp?: string | null;
  whatsapp_le?: string | null;
  reponse_employe?: 'bien-recu' | 'pas-encore' | null;
  reponse_employe_le?: string | null;
};

export const ETAT_DE_L_ENVOI_DIT: Record<EtatDeLEnvoi, string> = {
  programme: 'Programmé',
  envoi: 'Part',
  envoye: 'Envoyé',
  'sans-reponse': 'MTN n’a pas encore répondu',
  recu: 'Reçu',
  refuse: 'Refusé par MTN',
  annule: 'Annulé',
};
const FINAUX: ReadonlySet<EtatDeLEnvoi> = new Set(['recu', 'refuse', 'annule']);
export const estFinal = (e: EtatDeLEnvoi): boolean => FINAUX.has(e);

/** La référence que MTN attend (X-Reference-Id) : un UUID version 4. */
export const RE_REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** L'envoi qui tient encore une ligne de paie : ni refusé, ni annulé. Un
    seul par bulletin ; la base le garantit aussi (index unique, 0163). */
export function envoiActif(envois: readonly EnvoiMtn[], runId: string, employeeId: string): EnvoiMtn | undefined {
  return envois.find((e) => e.genre === 'paie' && e.run_id === runId && e.employee_id === employeeId && e.etat !== 'refuse' && e.etat !== 'annule');
}
/** Le dernier envoi d'une ligne, quel qu'il soit (pour dire un refus). */
export function dernierEnvoi(envois: readonly EnvoiMtn[], runId: string, employeeId: string): EnvoiMtn | undefined {
  return envois
    .filter((e) => e.genre === 'paie' && e.run_id === runId && e.employee_id === employeeId)
    .sort((a, b) => (b.programme_le ?? '').localeCompare(a.programme_le ?? ''))[0];
}

/* ── 2. CE QUE MTN DIT D'UN REFUS, EN CLAIR ───────────────────────────── */
const RAISONS: Record<string, string> = {
  PAYEE_NOT_FOUND: 'ce numéro n’a pas de compte MoMo',
  PAYEE_NOT_ALLOWED_TO_RECEIVE: 'ce numéro ne peut pas recevoir',
  PAYER_NOT_FOUND: 'le compte de paie MTN est introuvable',
  NOT_ENOUGH_FUNDS: 'le solde du compte de paie MTN ne suffit pas',
  PAYER_LIMIT_REACHED: 'le compte de paie MTN a atteint sa limite',
  PAYEE_LIMIT_REACHED: 'le compte qui reçoit a atteint sa limite',
  NOT_ALLOWED: 'MTN n’autorise pas cet envoi',
  NOT_ALLOWED_TARGET_ENVIRONMENT: 'MTN n’a pas encore ouvert les envois sur ce compte (profil Disbursement)',
  INVALID_CURRENCY: 'MTN refuse la monnaie',
  INVALID_AMOUNT: 'MTN refuse ce montant',
  AMOUNT_TOO_LOW: 'le montant est trop petit pour MTN',
  COULD_NOT_PERFORM_TRANSACTION: 'MTN n’a pas pu faire l’envoi',
  TRANSACTION_CANCELED: 'l’envoi a été annulé chez MTN',
  EXPIRED: 'l’envoi a expiré chez MTN',
  SERVICE_UNAVAILABLE: 'le service MTN était indisponible',
  INTERNAL_PROCESSING_ERROR: 'MTN a eu une erreur interne',
  ACCES_REFUSE: 'MTN a refusé l’accès (clés ou adresse du serveur)',
  INCONNU_CHEZ_MTN: 'MTN ne connaît pas cet envoi : rien n’est parti',
};
export function raisonDite(code?: string | null): string {
  const c = (code ?? '').trim();
  if (!c) return 'MTN n’a pas dit pourquoi';
  return RAISONS[c.toUpperCase()] ?? `MTN dit ${c}`;
}

/* ── 3. LE NOM CHEZ MTN ───────────────────────────────────────────────
   Avant le toucher, le Trône demande à MTN le nom du titulaire de chaque
   numéro. Un nom qui diffère de la fiche attend « C'est bien son numéro » ;
   un nom que MTN ne donne pas ne bloque rien (il se dit). Les mots d'une
   lettre (les initiales) ne comptent pas. */
export type AccordDuNom = 'concorde' | 'differe' | 'inconnu';
const motsDe = (nom: string | null | undefined): string[] =>
  (nom ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .split(/[^A-Z]+/).filter((m) => m.length >= 2);
export function nomConcorde(nomFiche: string, nomMtn: string | null | undefined): AccordDuNom {
  const mtn = new Set(motsDe(nomMtn));
  if (mtn.size === 0) return 'inconnu';
  const fiche = [...new Set(motsDe(nomFiche))];
  const communs = fiche.filter((m) => mtn.has(m)).length;
  if (communs >= 2) return 'concorde';
  if (communs >= 1 && communs === fiche.length) return 'concorde';
  return 'differe';
}

/** Ce que le serveur a lu chez MTN, gardé sur la paie du mois. */
export type LectureMtn = {
  le: string;
  /** Le solde du compte de paie MTN ; `null` quand MTN ne l'a pas donné. */
  soldeXof: number | null;
  numeros: Record<string, { actif: boolean | null; nom: string | null }>;
  erreur?: string;
};
/** « C'est bien son numéro » : pour ce numéro-là, et ce nom-là. */
export type NomMtnVu = { par: string; le: string; msisdn: string; nomMtn: string };

/* ── 4. LE DÉPART ─────────────────────────────────────────────────────
   Avant l'heure de paie : l'heure de paie (le 5, ou le lundi 6, à 18 h).
   Après : le prochain 18 h de Cotonou (« le passage suivant »). */
const HEURE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * HEURE_MS;
export function heureDeDepart(cal: CalendrierDeLaPaie | null, maintenantMs: number): string {
  if (cal && maintenantMs < cal.paie.ms) return new Date(cal.paie.ms).toISOString();
  /* Cotonou = UTC+1, sans heure d'été : 18 h locales = 17 h UTC. */
  const minuitLocal = Math.floor((maintenantMs + HEURE_MS) / JOUR_MS) * JOUR_MS - HEURE_MS;
  let depart = minuitLocal + 18 * HEURE_MS;
  if (depart <= maintenantMs) depart += JOUR_MS;
  return new Date(depart).toISOString();
}

/* ── 5. CE QUI PART ───────────────────────────────────────────────────
   Une ligne part par l'API quand elle est validée pour ce bulletin
   (« payable »), sur un numéro MTN lisible, avec un montant, sans envoi
   déjà en cours, et que MTN n'a pas dit « numéro inactif » ni donné un nom
   différent non vérifié. */
export type ItemAEnvoyer = { employeeId: string; nom: string; msisdn: string; montantXof: number };
export type Attente = ItemAEnvoyer & { pourquoi: 'nom' | 'inactif' | 'deja' | 'montant' | 'numero'; nomMtn?: string | null };
export function triDesEnvois(o: {
  runId: string;
  items: readonly ItemAEnvoyer[];
  envois: readonly EnvoiMtn[];
  lecture?: LectureMtn;
  vus: (employeeId: string) => NomMtnVu | undefined;
}): { partent: ItemAEnvoyer[]; attendent: Attente[] } {
  const partent: ItemAEnvoyer[] = [];
  const attendent: Attente[] = [];
  for (const it of o.items) {
    if (!RE_MSISDN.test(it.msisdn)) { attendent.push({ ...it, pourquoi: 'numero' }); continue; }
    if (!(Number.isInteger(it.montantXof) && it.montantXof > 0)) { attendent.push({ ...it, pourquoi: 'montant' }); continue; }
    if (envoiActif(o.envois, o.runId, it.employeeId)) { attendent.push({ ...it, pourquoi: 'deja' }); continue; }
    const lu = o.lecture?.numeros?.[it.msisdn];
    if (lu?.actif === false) { attendent.push({ ...it, pourquoi: 'inactif', nomMtn: lu.nom }); continue; }
    if (lu && nomConcorde(it.nom, lu.nom) === 'differe') {
      const vu = o.vus(it.employeeId);
      if (!vu || vu.msisdn !== it.msisdn || vu.nomMtn !== lu.nom) { attendent.push({ ...it, pourquoi: 'nom', nomMtn: lu.nom }); continue; }
    }
    partent.push(it);
  }
  return { partent, attendent };
}
/** Les lignes d'un run qui pourraient partir par l'API : validées, MTN. */
export function itemsDuRun(lues: readonly { ligne: { employeeId: string; name: string; prestataire?: boolean; payeLe?: string }; lecture: LectureDeLaLigne }[]): ItemAEnvoyer[] {
  return lues
    .filter(({ ligne, lecture }) => !ligne.prestataire && !ligne.payeLe && lecture.etat === 'payable' && lecture.voie === 'MTN' && !!lecture.msisdn)
    .map(({ ligne, lecture }) => ({ employeeId: ligne.employeeId, nom: ligne.name, msisdn: lecture.msisdn as string, montantXof: lecture.envoyeXof }));
}
export const totalDe = (items: readonly { montantXof: number }[]): number => items.reduce((s, x) => s + x.montantXof, 0);
/** Le solde couvre-t-il l'envoi ? Un solde inconnu ne couvre rien. */
export const ceQuiManque = (soldeXof: number | null | undefined, totalXof: number): number | null =>
  soldeXof == null || !Number.isFinite(soldeXof) ? null : Math.max(0, totalXof - soldeXof);

/* ── 6. LES RÉPONSES SUR LA PAIE ──────────────────────────────────────
   Un envoi reçu paie sa ligne : le jour de la réponse (à Cotonou), « MTN »,
   le montant parti, la transaction MTN. Une ligne déjà payée ne bouge pas. */
export type LignePayable = { employeeId: string; payeLe?: string; payeMoyen?: string; envoyeXof?: number; transactionMtn?: string; referenceMtn?: string };
export function appliqueLesRecus<L extends LignePayable>(lignes: readonly L[], runId: string, envois: readonly EnvoiMtn[]): { lignes: L[]; payees: string[] } {
  const payees: string[] = [];
  const sortie = lignes.map((l) => {
    if (l.payeLe) return l;
    const e = envois.find((x) => x.genre === 'paie' && x.run_id === runId && x.employee_id === l.employeeId && x.etat === 'recu');
    if (!e) return l;
    payees.push(l.employeeId);
    const jour = aCotonou(Date.parse(e.repondu_le ?? e.envoye_le ?? e.programme_le)).slice(0, 10);
    return { ...l, payeLe: jour, payeMoyen: 'MTN', envoyeXof: e.montant_xof, ...(e.transaction_mtn ? { transactionMtn: e.transaction_mtn } : {}), referenceMtn: e.reference };
  });
  return { lignes: sortie, payees };
}

/* ── 6 bis. PRÉVENIR CHACUN (0164) ────────────────────────────────────
   « Prévenir chacun · notification du Trône quand son argent part »
   (maquette Les paiements, choix 3). La base écrit la notification quand
   MTN dit reçu, pour un envoi de l'équipe (`prevenir`) ; ici, le même texte,
   au mot près, que le banc compare au déclencheur. */
export const francsDits = (n: number): string =>
  `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F')} F`;
export const notificationDeLaPaie = (periode: string, montantXof: number): string =>
  `Ta paie ${duMois(periode)} est partie : ${francsDits(montantXof)}.`;

/* ── 7. LE TEST DE 100 F ──────────────────────────────────────────────
   Un bouton dans La paie, avant le 5 : 100 F vers le numéro MTN de chaque
   fiche de l'équipe salariée (pas les prestataires, pas les fiches
   archivées). Offerts par la Maison : une dépense « Essai de paie MTN »,
   les bulletins ne bougent pas. Jamais plus de 500 F par personne.

   TOUTES LES FICHES SE DISENT — 9 novembre 2026. Une fiche dont le numéro
   est chez Moov n'était ni comptée ni nommée : elle disparaissait du
   décompte sans un mot, et l'écran pouvait dire « 0 fiche avec un numéro
   MTN » sans jamais dire qui manquait ni pourquoi. Elle a désormais sa
   liste (`pasMtn`), à côté des sans-numéro. Et le bouton ne s'éteint plus
   devant une équipe vide : un bouton éteint ne dit rien, alors que la
   raison, elle, est écrite (`pourquoiPasLEssai`). */
export const MONTANT_ESSAI = 100;
export const MONTANT_ESSAI_MAX = 500;
export type FichePourLEssai = { id: string; name: string; contractType?: string; archiveeLe?: string; mobileMoney?: { numero: string; operateur: string } };
export function equipeDeLEssai(
  fiches: readonly FichePourLEssai[], montantXof: number,
): { partent: ItemAEnvoyer[]; sansNumero: string[]; pasMtn: { nom: string; operateur: string }[] } {
  const partent: ItemAEnvoyer[] = [];
  const sansNumero: string[] = [];
  const pasMtn: { nom: string; operateur: string }[] = [];
  for (const f of fiches) {
    if (f.contractType === 'prestataire' || f.archiveeLe) continue;
    const mm = f.mobileMoney;
    if (mm?.operateur === 'MTN' && RE_MSISDN.test(mm.numero)) { partent.push({ employeeId: f.id, nom: f.name, msisdn: mm.numero, montantXof }); continue; }
    if (!mm || mm.operateur === 'MTN') { sansNumero.push(f.name); continue; }
    /* Un numéro chez Moov, ou chez un opérateur que la paie MTN ne connaît
       pas : rien ne part, mais la fiche se nomme. */
    pasMtn.push({ nom: f.name, operateur: mm.operateur });
  }
  return { partent, sansNumero, pasMtn };
}
export function pourquoiPasLEssai(montantXof: number, nombre: number): string | null {
  if (!Number.isInteger(montantXof) || montantXof < 1) return 'Le montant du test est un nombre entier de francs.';
  if (montantXof > MONTANT_ESSAI_MAX) return `Le test ne dépasse pas ${MONTANT_ESSAI_MAX} F par personne.`;
  if (nombre === 0) return 'Aucune fiche de l’équipe n’a de numéro MTN : tapez-le sur leur fiche, avec l’opérateur MTN.';
  return null;
}
/** L'identifiant d'un test : son heure de départ à Cotonou. */
export const idDeLEssai = (maintenantMs: number): string => `essai-${aCotonou(maintenantMs).replace(/[-:T]/g, '').slice(0, 12)}`;
export type BilanDeLEssai = { nombre: number; recus: number; refuses: number; enCours: number; recuXof: number; fini: boolean };
export function bilanDeLEssai(envois: readonly EnvoiMtn[]): BilanDeLEssai {
  const recus = envois.filter((e) => e.etat === 'recu');
  const refuses = envois.filter((e) => e.etat === 'refuse' || e.etat === 'annule').length;
  const enCours = envois.length - recus.length - refuses;
  return { nombre: envois.length, recus: recus.length, refuses, enCours, recuXof: recus.reduce((s, e) => s + e.montant_xof, 0), fini: envois.length > 0 && enCours === 0 };
}
/** La dépense du test, une seule par test, écrite quand tout a répondu. */
export const depenseDeLEssaiId = (essaiId: string): string => `exp-${essaiId}-mtn`;
export function depenseDeLEssai(o: { essaiId: string; branchId: string; bilan: BilanDeLEssai; jour: string }) {
  if (!o.bilan.fini || o.bilan.recuXof <= 0) return null;
  return {
    id: depenseDeLEssaiId(o.essaiId),
    branchId: o.branchId,
    label: `Essai de paie MTN · ${o.bilan.recus} envoi${o.bilan.recus > 1 ? 's' : ''}`,
    amountXof: o.bilan.recuXof,
    date: o.jour,
    cashbox: '',
    category: 'Salaires',
    laMaisonAPaye: true,
  };
}

/* ── 7 bis. CLORE UN TEST QUE MTN LAISSE SANS RÉPONSE — 9 novembre 2026 ──
   Un envoi que MTN ne prend pas (relais muet, erreur 5xx) reste
   « sans-réponse », et aucune règle ne le clôt : le bilan du test le compte
   comme « en cours » pour toujours. Or l'écran interdit un nouveau test
   tant qu'un envoi est en cours — un premier test muet condamnait donc le
   bloc, et le second (500 F, après un refus à 100 F) ne partait jamais.
   La direction peut désormais clore le test, d'un geste et à son nom : ce
   que cela veut dire est écrit ici, une seule fois, pour les deux écrans. */
export const envoisEnSouffrance = (envois: readonly EnvoiMtn[]): EnvoiMtn[] =>
  envois.filter((e) => !estFinal(e.etat));
/** Le plus ancien envoi sans réponse finale : depuis quand MTN se tait. */
export const lePlusEnSouffrance = (envois: readonly EnvoiMtn[]): EnvoiMtn | undefined =>
  envoisEnSouffrance(envois).sort((a, b) => (a.programme_le ?? '').localeCompare(b.programme_le ?? ''))[0];
export const CE_QUE_CLORE_UN_TEST =
  'Les envois sans réponse finale seront marqués « annulé », au nom de qui clôt, avec la date. '
  + 'Si MTN a versé l’argent malgré tout, il ne comptera pas dans la dépense « Essai de paie MTN » : '
  + 'regardez le solde du compte MTN avant de clore.';
