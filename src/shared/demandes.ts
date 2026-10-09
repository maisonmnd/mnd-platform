import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import type { Client } from './clients';
import { CIVILITES, ficheAvecCivilite, type Civilite } from './civilite';

/* ══ LES DEMANDES VENUES DU SITE · 17 septembre 2026 ═══════════════════
   Le site révélateur dépose des DEMANDES sans compte : un prospect qui
   laisse son prénom et son numéro, une demande de rendez-vous. Elles
   tombent dans la table `demandes`, écrite par UNE fonction Edge avec le
   service role (le navigateur n'y écrit jamais : une file publique qu'on
   peut écrire est une file qu'on peut lire), lue par le personnel seul.

   CE FICHIER EST PUR, SAUF LA LIAISON. Il normalise un numéro, dit un
   besoin, trie, reconnaît un doublon, écrit le message de rappel et fait
   une fiche cliente d'une demande. Le magasin et sa liaison Supabase
   vivent en bas, comme pour les appels WhatsApp (`appels-wa.ts`) : le
   serveur écrit pendant que trois postes lisent, une table ne perd rien.

   LA DEVISE N'EST JAMAIS TAPÉE ICI. `messageDeRappel` rend le texte nu ;
   c'est l'écran qui le signe par `signeLeMessage` (`shared/identite`) au
   moment de l'envoyer. Une devise recopiée finit toujours par diverger. */

export const TABLE_DEMANDES = 'demandes';

/** LE GENRE, TEL QUE LA TABLE L'EXIGE — 24 septembre 2026.

    `demandes.genre` est `not null` avec `check (genre in ('prospect','rdv'))`
    et sans défaut. Le Trône ne le fournissait pas : la table refusait toute
    écriture, et « Synchro en échec · demandes » restait allumé sans qu'on
    sache que marquer une demande « rappelée » ne se gardait pas.

    LE REPLI N'EST PAS DE LA POLITESSE. Une demande dont le `data` ne porte
    pas de genre, ou un genre inconnu, repasserait NULL ou ferait sauter le
    `check` : la table se rebloquerait ENTIÈREMENT pour une seule ligne mal
    formée. On préfère ranger l'inconnu en `prospect`, qui est le genre le
    moins engageant, plutôt que de tout arrêter. */
export const genreEnBase = (d: { genre?: unknown }): GenreDeDemande =>
  (d.genre === 'rdv' ? 'rdv' : 'prospect');

export type GenreDeDemande = 'prospect' | 'rdv';
export type BesoinDeLaDemande = 'creation' | 'reparation' | 'entretien' | 'enfant' | 'formation' | 'inconnu';
/* « traitee » — 4 octobre 2026 : « quand les demandes de site sont traitées,
   je veux les faire disparaître » (Yéman). Elle quitte la file « À traiter ». */
export type StatutDeLaDemande = 'nouvelle' | 'rappelee' | 'traitee' | 'convertie' | 'ecartee';

export type Demande = {
  id: string;                 // posé par le serveur
  genre: GenreDeDemande;
  createdAt: string;          // ISO
  branchId: string;
  prenom: string;
  telephone: string;          // E.164, posé par le serveur (+229…)
  email?: string;
  besoin: BesoinDeLaDemande;
  profil?: string;            // « Je n'ai pas encore de locks », « J'ai des locks créées ailleurs »…
  mot?: string;               // le message libre
  /* 'whatsapp' · 9 octobre 2026 : une inconnue a réservé sur WhatsApp
     (`shared/automate-wa`) et a choisi sa civilité. La fiche née au
     rattachement l'emporte, avec sa provenance (`ficheDepuisLaDemande`). */
  source: 'site' | 'whatsapp';
  civilite?: Civilite;
  page?: string;              // le chemin de la page d'où elle vient (/premiere-couronne/)
  campagne?: string;          // utm_campaign s'il y en a une
  consentementLe: string;     // ISO, la case cochée
  statut: StatutDeLaDemande;
  rappeleeLe?: string;
  clientId?: string;          // la fiche cliente créée à la conversion
  note?: string;              // note du personnel
  /* ── LA PLACE DEMANDÉE — 17 septembre 2026 ────────────────────────
     « Est-ce possible de réserver directement sans passer par WhatsApp ? »
     (Yéman). Le site montre les vraies heures libres, la visiteuse en prend
     une, et la fonction Edge POSE le rendez-vous en attente après avoir
     revérifié le créneau. Ces champs disent laquelle, et lequel. */
  serviceIds?: string[];
  date?: string;              // AAAA-MM-JJ
  time?: string;              // HH:mm
  master?: string;
  /** Le rendez-vous posé par le serveur, à confirmer au Trône. */
  apptId?: string;
  /** LE CALIBRE ANNONCÉ SUR LE SITE — 28 septembre 2026 : la tranche choisie
      par la visiteuse (son représentant en locks, et son nom). La fiche créée
      à la conversion le porte, pour que le Trône tarife comme le site. */
  lockCount?: number;
  calibre?: string;
  /** ARCHIVÉE — 4 octobre 2026. Rangée hors de toutes les listes, sauf
      « Archivées » ; son statut reste ce qu'il était. */
  archiveeLe?: string;
};

export const BESOINS: readonly BesoinDeLaDemande[] = ['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu'];
export const STATUTS: readonly StatutDeLaDemande[] = ['nouvelle', 'rappelee', 'traitee', 'convertie', 'ecartee'];

/** Le segment que porte une fiche née d'une demande. Le même mot que
    `PROSPECT_SEGMENT` (shell/useReconcileClients), qui ne s'importe pas
    d'ici : la couche partagée ne remonte pas vers le Shell. */
export const SEGMENT_PROSPECT = 'Prospect';

/* ── LE NUMÉRO, EN E.164 ─────────────────────────────────────────────
   Le site reçoit ce qu'une visiteuse tape : « 97 00 00 00 », « 0197000000 »,
   « +229 01 97… », « 00229… ». Une seule forme en base, sinon deux demandes
   d'une même personne ne se reconnaissent pas et le lien WhatsApp se casse.

   HUIT CHIFFRES REÇOIVENT « 01 » POUR LE BÉNIN. Depuis 2024 tout numéro
   béninois en a dix, et l'ancien format à huit se complète par « 01 » : c'est
   la règle de `numeroWa` (shared/conversations), et un lien wa.me sans elle
   sonnerait dans le vide. Les autres indicatifs gardent leurs chiffres. */
export function telephoneNormalise(brut: string, dial = '+229'): string {
  const t = (brut ?? '').trim();
  const chiffres = t.replace(/\D/g, '');
  const indicatif = (dial ?? '').replace(/\D/g, '') || '229';
  /* Déjà international : « + » ou « 00 » en tête. On garde son indicatif. */
  if (t.startsWith('+')) return chiffres.length >= 8 ? `+${chiffres}` : '';
  if (chiffres.startsWith('00') && chiffres.length >= 11) return `+${chiffres.slice(2)}`;
  if (chiffres.length < 8) return '';
  /* Plus long qu'un numéro local : l'indicatif a été tapé sans son plus. */
  if (chiffres.length > 10) return `+${chiffres}`;
  if (chiffres.length === 8 && indicatif === '229') return `+22901${chiffres}`;
  return `+${indicatif}${chiffres}`;
}

/** Ce que l'écran montre tant que la carte n'est pas dépliée : le Trône est
    un écran de comptoir, un numéro entier s'y lit par-dessus l'épaule. */
export function telephoneMasque(telephone: string): string {
  const chiffres = (telephone ?? '').replace(/\D/g, '');
  if (chiffres.length < 4) return '';
  const fin = chiffres.slice(-4);
  return `··· ${fin.slice(0, 2)} ${fin.slice(2)}`;
}

const BESOIN_DIT: Record<BesoinDeLaDemande, string> = {
  creation: 'Créer ma couronne',
  reparation: 'Réparer ma couronne',
  entretien: 'Entretenir ma couronne',
  enfant: 'Pour son enfant',
  formation: 'Apprendre le métier',
  inconnu: 'Ne sait pas encore',
};

export const ditLeBesoin = (b: BesoinDeLaDemande): string => BESOIN_DIT[b] ?? BESOIN_DIT.inconnu;

export const ditLeGenre = (g: GenreDeDemande): string =>
  g === 'rdv' ? 'Demande de rendez-vous' : 'Prospect';

/** NOUVELLES D'ABORD, puis les plus récentes en tête. Une file se lit par
    ce qui attend, pas par ce qui est classé. */
/** LES FILTRES DE L'ÉCRAN — 4 octobre 2026. L'archivée ne paraît que sous
    « Archivées », jamais sous « Toutes » ; la traitée quitte « À traiter ». */
export type FiltreDesDemandes = 'a-traiter' | StatutDeLaDemande | 'toutes' | 'archivees';
export const dansLeFiltre = (d: Pick<Demande, 'statut' | 'archiveeLe'>, filtre: FiltreDesDemandes): boolean => {
  if (filtre === 'archivees') return !!d.archiveeLe;
  if (d.archiveeLe) return false;
  if (filtre === 'a-traiter') return d.statut === 'nouvelle' || d.statut === 'rappelee';
  return filtre === 'toutes' || d.statut === filtre;
};

export function demandesTriees(liste: readonly Demande[]): Demande[] {
  const rang = (d: Demande) => (d.statut === 'nouvelle' ? 0 : 1);
  return [...liste].sort((a, b) => (rang(a) - rang(b)) || b.createdAt.localeCompare(a.createdAt));
}

/** LE DOUBLON : même numéro (normalisé) et même besoin, déposé depuis
    `depuisIso`. Une visiteuse qui recharge la page ne doit pas peupler la
    file trois fois ; une visiteuse qui revient trois mois plus tard pour
    autre chose n'est pas un doublon. */
export function doublonDe(
  liste: readonly Demande[], telephone: string, besoin: BesoinDeLaDemande, depuisIso: string,
): Demande | undefined {
  const numero = telephoneNormalise(telephone);
  if (!numero) return undefined;
  const depuis = Date.parse(depuisIso);
  return liste.find((d) =>
    d.besoin === besoin
    && telephoneNormalise(d.telephone) === numero
    && (Number.isNaN(depuis) || Date.parse(d.createdAt) >= depuis));
}

/* Le besoin, dit à ELLE : les libellés du site sont écrits à la première
   personne (« Créer ma couronne », ce qu'elle a cliqué) ; dans la bouche de
   la Maison, « pour créer ma couronne » serait la couronne de la Maison. */
const BESOIN_DANS_LA_PHRASE: Record<BesoinDeLaDemande, string> = {
  creation: 'créer votre couronne',
  reparation: 'réparer votre couronne',
  entretien: 'entretenir votre couronne',
  enfant: 'votre enfant',
  formation: 'apprendre le métier',
  inconnu: '',
};

/** LE MESSAGE DE RAPPEL, NU. Sans devise : l'écran la pose par
    `signeLeMessage`, et elle ne se tape jamais à la main. */
export function messageDeRappel(d: Pick<Demande, 'prenom' | 'besoin'>): string {
  const prenom = d.prenom.trim() || 'Madame';
  const pour = BESOIN_DANS_LA_PHRASE[d.besoin] ?? '';
  const ecrit = pour
    ? `Vous nous avez écrit depuis notre site pour ${pour}.`
    : 'Vous nous avez écrit depuis notre site.';
  return `Bonjour ${prenom}, ici la Maison MND. ${ecrit} Quand pouvons-nous vous appeler ?`;
}

/** « IL Y A 2 H » : l'âge d'une demande, en mots. Une file se lit à l'âge
    de ce qui attend, pas à la date. */
export function depuisQuand(iso: string, maintenantMs = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const min = Math.max(0, Math.round((maintenantMs - t) / 60000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j === 1) return 'hier';
  if (j < 30) return `il y a ${j} j`;
  const mois = Math.round(j / 30);
  return `il y a ${mois} mois`;
}

/** LA FICHE QU'ON OUVRE D'UNE DEMANDE. Le même geste que le Trône fait déjà
    pour chaque consultation en ligne (`useReconcileClients`) : segment
    Prospect, persona d'accueil, `since` au jour du dépôt. Et la PROVENANCE,
    que la consultation n'avait pas : sans elle, la Maison ne saurait jamais
    ce qui l'a menée à elle. L'identifiant est posé depuis celui de la
    demande : deux clics ne font pas deux fiches. */
export function ficheDepuisLaDemande(d: Demande, persona: string): Client {
  const fiche: Client = {
    id: `prospect-${d.id}`,
    branchId: d.branchId,
    name: d.prenom.trim(),
    phone: d.telephone,
    city: '',
    persona,
    since: (d.createdAt || new Date().toISOString()).slice(0, 10),
    segments: [SEGMENT_PROSPECT],
    priceCoef: 1,
    loyaltyPoints: 0,
    /* La provenance de la DEMANDE (9 octobre 2026) : une fiche née d'une
       réservation WhatsApp ne se dit pas venue du site. */
    source: d.source === 'whatsapp' ? 'whatsapp' : 'site',
    consentementLe: d.consentementLe,
  };
  /* LA CIVILITÉ QU'ELLE A CHOISIE (WhatsApp, 9 octobre 2026) passe sur sa
     fiche, par le même geste qu'au Trône : « Monsieur » marque aussi la fiche
     au masculin, pour les cartes. Rien de dit : rien d'écrit, elle reste une
     dame comme toute fiche muette. */
  if (d.civilite && CIVILITES.some((c) => c.cle === d.civilite)) {
    const civ = ficheAvecCivilite(d.civilite);
    fiche.civilite = civ.civilite;
    if (civ.auMasculin) fiche.auMasculin = true;
  }
  if (d.email?.trim()) fiche.email = d.email.trim();
  if (d.lockCount && d.lockCount > 0) fiche.lockCount = Math.round(d.lockCount);
  if (d.page) fiche.pageOrigine = d.page;
  if (d.campagne) fiche.campagne = d.campagne;
  return fiche;
}

/* ══ LA RÉSERVATION DU SITE, CONFIRMÉE SANS FICHE — 18 septembre 2026 ══
   Arbitrage de Yéman : valider depuis le calendrier une réservation du site
   crée sa fiche toute seule, au segment Prospect, exactement comme « En faire
   une cliente ». Sans fiche, pas de numéro, donc pas de confirmation : la
   cliente attendait en silence une place que la Maison avait acceptée.

   UN SEUL JUGE POUR SEPT CHEMINS. Un rendez-vous passe à « confirmé » depuis
   le calendrier, le carnet, le tableau de bord, À faire… Brancher la fiche
   sur chacun, c'est sept occasions d'en oublier un. Ce juge regarde le
   résultat, d'où qu'il vienne : un rendez-vous confirmé, sans fiche, que
   porte une demande du site.

   LA FICHE QUI A DÉJÀ CE NUMÉRO L'EMPORTE : deux fiches pour une tête, ce
   sont deux histoires qui ne se retrouvent plus. Pur ; éprouvé par
   `verifie-demandes`.

   LE PREMIER NUMÉRO SEUL — relecture du 9 octobre 2026. Le second numéro
   (`phone2`) est un recours, celui d'un mari ou d'une sœur : une visiteuse
   du site qui réserve avec le numéro de sa sœur ne devient pas sa sœur (sa
   confirmation, sa venue, ses points partiraient chez l'autre). Une cliente
   qui écrit sur WhatsApp depuis ce second numéro, l'automate la reconnaît
   déjà par `fiches_du_numero` : il ne crée pas de demande pour elle.

   SUR WHATSAPP, LE PRÉNOM AUSSI : sur un numéro qui porte la fiche d'une
   enfant, la maman qui réserve « Pour moi » laisse une demande à SON
   prénom. La fiche du numéro ne l'emporte que si elle porte ce prénom-là ;
   sinon une fiche naît pour elle. */
export type Rattachement = {
  apptId: string;
  demande: Demande;
  /** La fiche qui porte déjà ce numéro ; absente, on la crée. */
  ficheExistante?: Pick<Client, 'id' | 'name'>;
};

/** Le même prénom, sans accents ni majuscules : « Grâce » est « grace ». */
const memePrenom = (nom: string | undefined, prenom: string | undefined): boolean => {
  const premier = (s: string | undefined) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const a = premier(nom);
  return a !== '' && a === premier(prenom);
};

export function rattachementsAFaire(
  appts: readonly { id: string; status: string; clientId?: string }[],
  demandes: readonly Demande[],
  clients: readonly (Pick<Client, 'id' | 'name' | 'phone' | 'archived'> & Partial<Pick<Client, 'phone2'>>)[],
): Rattachement[] {
  const parRdv = new Map<string, Demande>();
  for (const d of demandes) if (d.apptId) parRdv.set(d.apptId, d);
  const out: Rattachement[] = [];
  for (const a of appts) {
    if (a.status !== 'confirmé' || a.clientId) continue;
    const demande = parRdv.get(a.id);
    if (!demande) continue;
    const numero = telephoneNormalise(demande.telephone);
    const ficheExistante = numero
      ? clients.find((c) => !c.archived && telephoneNormalise(c.phone ?? '') === numero
        && (demande.source !== 'whatsapp' || memePrenom(c.name, demande.prenom)))
      : undefined;
    out.push({ apptId: a.id, demande, ...(ficheExistante ? { ficheExistante: { id: ficheExistante.id, name: ficheExistante.name } } : {}) });
  }
  return out;
}

/* ── LE MAGASIN ET SA LIAISON ────────────────────────────────────────── */
export const demandesStore = createStore<Demande[]>('mnd_demandes', []);
export const useDemandes = () => useStore(demandesStore);

let liee = false;
/** Relie le magasin à la table. Idempotent : le module la pose une fois au
    chargement, un écran peut la rappeler sans rien doubler. */
export function lieLesDemandes(): void {
  if (liee) return;
  liee = true;
  bindCollection(demandesStore, TABLE_DEMANDES, { colonnes: (d) => ({ genre: genreEnBase(d) }) });
}

lieLesDemandes();
