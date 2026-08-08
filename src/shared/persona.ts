import { createStore, useStore } from './store';
import type { Appointment } from './agenda';
import type { Service } from './catalog';
import type { Client, Persona } from './clients';

/* L'ARCHÉTYPE SE LIT DANS LES RENDEZ-VOUS — et la Maison règle sa lecture.

   Un persona posé à la main vieillit en silence : la cliente qui venait pour la
   couleur passe à l'entretien, celle qui découvrait devient fidèle, et la fiche
   continue de dire ce qu'elle était il y a un an. Le quiz, la Vitrine et le
   marketing s'appuient dessus — ils se trompent tous ensemble.

   Ce fichier lit donc les signaux à chaque mouvement du carnet et rend un
   VERDICT MOTIVÉ. Trois principes le gouvernent :

   ① ON NE DEVINE PAS. Chaque archétype se gagne à la pesée, sur plusieurs
     indices convergents. Sous le seuil de confiance, ou si deux archétypes se
     tiennent de trop près, on ne tranche pas — la cliente reste où elle est.

   ② ON NE RÉTROGRADE JAMAIS sur un doute. Un carnet à moitié chargé et toute la
     Maison retomberait au seuil d'accueil. Seul un verdict CONFIANT écrit.

   ③ LA MAIN L'EMPORTE TOUJOURS (`Client.personaFige`).

   ── LES RÈGLES SE MODIFIENT, ELLES NE SE RECOMPILENT PAS ────────────────
   La pesée n'est pas écrite en dur : c'est une LISTE DE RÈGLES rangée dans
   `personaReglesStore`, éditable au Trône (CRM → Les personas → La lecture).
   Un poids qui se corrige d'un champ vaut mieux qu'un poids qu'il faut
   redéployer : la Maison apprend en marchant, et le jugement doit suivre à son
   rythme. `REGLES_MAISON` n'est donc qu'un point de départ — celui qu'on
   rétablit quand on s'est perdu.

   Ce qui reste en dur, et pourquoi : la façon de LIRE les signaux (quelle
   maison du catalogue dit la lumière, ce qu'est un grand jour) et la
   subsomption entre archétypes. Ce sont des faits de structure, pas des
   curseurs — les ouvrir n'aiderait personne à mieux juger. */

export type PersonaCle =
  | 'lointaine' | 'celebree' | 'convalescente' | 'lumineuse' | 'audacieuse'
  | 'souveraine' | 'naissante' | 'constante' | 'pressee' | 'initiee';

/** LA CLÉ D'UN ARCHÉTYPE — les dix de la Maison, ou l'identifiant d'un persona
    qu'elle a DÉCOUVERT en chemin. Une règle doit pouvoir désigner un archétype
    qui n'existait pas quand ce fichier a été écrit : c'est toute la différence
    entre une liste close et une maison qui apprend. */
export type ArchetypeCle = PersonaCle | (string & {});

/** Le nom d'un archétype — celui de la Maison, sinon celui du persona créé. */
export const nomArchetype = (cle: ArchetypeCle, personas: Persona[] = []): string =>
  PERSONA_NOMS[cle as PersonaCle] ?? personas.find((p) => p.id === cle)?.name ?? String(cle);

export const PERSONA_NOMS: Record<PersonaCle, string> = {
  lointaine: 'La Lointaine',
  celebree: 'La Célébrée',
  convalescente: 'La Convalescente',
  lumineuse: 'La Lumineuse',
  audacieuse: 'L’Audacieuse',
  souveraine: 'La Souveraine',
  naissante: 'La Naissante',
  constante: 'La Constante',
  pressee: 'La Pressée',
  initiee: 'Initiée',
};

/* ---------- Les signaux qu'une règle peut lire ---------- */

export type SignalCle =
  | 'diaspora' | 'abonnee'
  | 'rituels' | 'maisons'
  | 'nLumiere' | 'nRepare' | 'nCreation' | 'nGrandJour' | 'nGrandPassage' | 'nCureSuivie'
  | 'partLumiere' | 'partRepare'
  | 'cadence' | 'regularite'
  | 'joursDepuisDernier' | 'joursDepuisPremier' | 'joursCouronne' | 'locks'
  /* Ce que la MAISON a observé d'elle, écrit à la main sur sa fiche. Le carnet
     dit ce qu'elle a pris ; l'observation dit comment elle l'a pris. */
  | 'motPrix' | 'motAisance' | 'motHate' | 'motVoyage'
  | 'motEvenement' | 'motFragilite' | 'motAudace' | 'motFidelite';

export const SIGNAL_NOMS: Record<SignalCle, string> = {
  diaspora: 'fiche diaspora',
  abonnee: 'engagée sur un cycle GBÈJÍ',
  rituels: 'rituels honorés',
  maisons: 'maisons parcourues',
  nLumiere: 'passages en YÈKPÈ',
  nRepare: 'reconstructions',
  nCreation: 'créations',
  nGrandJour: 'gestes de grand jour',
  nGrandPassage: 'Grandes Renaissances',
  nCureSuivie: 'cures suivies',
  partLumiere: 'part de lumière dans ses venues',
  partRepare: 'part de reconstruction dans ses venues',
  cadence: 'jours entre deux venues',
  regularite: 'régularité (0 à 1)',
  joursDepuisDernier: 'jours depuis la dernière venue',
  joursDepuisPremier: 'jours depuis la première venue',
  joursCouronne: 'jours depuis la naissance de la couronne',
  locks: 'nombre de locks',
  motPrix: 'l’observation dit son attention au prix',
  motAisance: 'l’observation dit son indifférence au prix',
  motHate: 'l’observation dit sa hâte',
  motVoyage: 'l’observation dit ses séjours',
  motEvenement: 'l’observation dit un grand jour',
  motFragilite: 'l’observation dit une fibre fragile',
  motAudace: 'l’observation dit son audace',
  motFidelite: 'l’observation dit sa fidélité',
};

/* ---------- CE QUE LA MAISON A OBSERVÉ ----------

   Le carnet dit ce qu'elle a PRIS ; il ne dit pas comment elle l'a pris — si
   elle a demandé le prix trois fois, si elle regardait l'heure, si elle repart
   dans trois semaines. Cela, seule une personne le voit, et l'écrit sur sa
   fiche. Ce champ libre est donc lu comme les autres signaux.

   LA LECTURE EST UN LEXIQUE, PAS UNE DEVINETTE. Des mots, comptés, et une
   négation qui annule : « elle ne regarde jamais le prix » ne doit pas la
   ranger parmi les regardantes. La fenêtre de négation couvre les quelques mots
   qui précèdent le marqueur — assez pour les tournures courantes, et on
   s'arrête là : une analyse plus fine se tromperait avec plus d'assurance.

   Ce que la Maison y lit est AFFICHÉ sur la fiche. Une lecture invisible ne se
   corrige jamais ; visible, elle se corrige en réécrivant la phrase. */

export type Marqueur = { cle: SignalCle; mots: string[] };

const NEGATIONS = ['ne', "n'", 'pas', 'jamais', 'sans', 'aucun', 'aucune', 'plus', 'ni'];

/* Les tournures LONGUES d'abord : « ne regarde pas le prix » doit être lue
   comme de l'aisance, et non consommée par le mot « prix ». */
export const LEXIQUE_MAISON: Marqueur[] = [
  { cle: 'motAisance', mots: ['indifferente au prix', 'peu importe le prix', 'ne regarde pas le prix', 'sans regarder le prix', 'ne demande jamais le prix', 'le meilleur', 'haut de gamme', 'ne discute pas'] },
  { cle: 'motPrix', mots: ['prix', 'cher', 'chere', 'budget', 'negocie', 'negociation', 'remise', 'reduction', 'promo', 'combien', 'tarif', 'econome', 'moins cher'] },
  { cle: 'motHate', mots: ['pressee', 'presse', 'vite', 'rapide', 'peu de temps', 'regarde l heure', 'doit partir', 'entre deux', 'pause dejeuner', 'court'] },
  { cle: 'motVoyage', mots: ['diaspora', 'etranger', 'expatriee', 'repart', 'sejour', 'vol ', 'voyage', 'vit a l'] },
  { cle: 'motEvenement', mots: ['mariage', 'ceremonie', 'bapteme', 'shooting', 'defile', 'gala', 'grand jour'] },
  { cle: 'motFragilite', mots: ['casse', 'cassant', 'fragile', 'chute', 'alopecie', 'demangeaison', 'irritation', 'abime', 'douleur', 'tension', 'cuir sensible'] },
  { cle: 'motAudace', mots: ['ose', 'audacieuse', 'change souvent', 'nouveaute', 'experimente', 'couleur vive', 'transformation'] },
  { cle: 'motFidelite', mots: ['fidele', 'revient toujours', 'ponctuelle', 'reguliere', 'assidue', 'reprend rendez-vous', 'prochain rendez-vous'] },
];

/** Sans casse, sans accent — pour que « pressée » et « pressee » se lisent. */
const aplati = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ');

/** Y a-t-il une négation dans les quelques mots qui précèdent ? */
const nieAvant = (texte: string, pos: number): boolean => {
  const avant = texte.slice(Math.max(0, pos - 40), pos).split(/[^a-z']+/).filter(Boolean);
  return avant.slice(-5).some((m) => NEGATIONS.includes(m));
};

/** Lit l'observation et rend les signaux qu'elle porte. Aucune observation =
    aucun signal — et surtout pas des zéros : ne pas savoir ne prouve rien. */
export function litObservation(texte: string | undefined, lexique: Marqueur[] = LEXIQUE_MAISON): Partial<Record<SignalCle, number>> {
  const brut = (texte ?? '').trim();
  if (!brut) return {};
  let reste = ` ${aplati(brut)} `;
  const out: Partial<Record<SignalCle, number>> = {};
  for (const m of lexique) {
    /* Les mots les plus longs en premier : une tournure entière l'emporte sur
       le mot isolé qu'elle contient. */
    for (const mot of [...m.mots].sort((a, b) => b.length - a.length)) {
      const cible = aplati(mot);
      let i = reste.indexOf(cible);
      while (i !== -1) {
        if (!nieAvant(reste, i)) out[m.cle] = (out[m.cle] ?? 0) + 1;
        /* Consommé : ni recompté, ni relu par un marqueur plus court. */
        reste = reste.slice(0, i) + ' '.repeat(cible.length) + reste.slice(i + cible.length);
        i = reste.indexOf(cible);
      }
    }
  }
  return out;
}

/** Une règle de pesée. `parUnite` compte tant de points PAR unité du signal,
    plafonné ; `seuil` donne ses points d'un bloc dès que le signal franchit une
    valeur. Une règle peut exiger un second signal (`et`) : c'est ce qui empêche
    une couronne ancienne vue une fois de passer pour une souveraine. */
export type ReglePersona = {
  id: string;
  actif: boolean;
  pour: ArchetypeCle;
  signal: SignalCle;
  mode: 'seuil' | 'parUnite';
  /** Pour `seuil` : la valeur à atteindre (ou à ne pas dépasser si `sous`). */
  valeur?: number;
  /** Comparaison inversée : le signal doit être INFÉRIEUR OU ÉGAL à `valeur`. */
  sous?: boolean;
  poids: number;
  /** Pour `parUnite` : le maximum que cette règle peut donner. */
  plafond?: number;
  et?: { signal: SignalCle; valeur: number; sous?: boolean };
  /** Ce que la règle dit en clair — « {n} » devient la valeur lue. */
  dit: string;
};

export type ReglesConfig = {
  /** Points nécessaires pour qu'un archétype soit retenu. */
  seuil: number;
  /** Avance minimale sur l'archétype suivant — sans elle, on ne tranche pas. */
  marge: number;
  regles: ReglePersona[];
  /** Les mots que la Maison reconnaît dans une observation. Absent = ceux de
      la Maison ; la Maison peut y ajouter les siens. */
  lexique?: Marqueur[];
};

/* LES RÈGLES DE DÉPART. Pesées à la main le 8 août, puis vérifiées sur les
   185 têtes de la Maison. Elles se modifient à l'écran — ceci n'est que le
   point de retour. */
export const REGLES_MAISON: ReglePersona[] = [
  /* La Lointaine — la contrainte du séjour prime sur le goût. */
  { id: 'loin-diaspora', actif: true, pour: 'lointaine', signal: 'diaspora', mode: 'seuil', valeur: 1, poids: 6, dit: 'fiche diaspora' },
  { id: 'loin-cadence', actif: true, pour: 'lointaine', signal: 'cadence', mode: 'seuil', valeur: 150, poids: 3, et: { signal: 'rituels', valeur: 2 }, dit: 'revient tous les {n} jours' },

  /* La Célébrée — un seul grand jour ne fait pas un archétype ; deux, oui. */
  { id: 'cel-grandjour', actif: true, pour: 'celebree', signal: 'nGrandJour', mode: 'parUnite', poids: 3, plafond: 6, dit: '{n} geste(s) de grand jour' },

  /* La Convalescente — la reconstruction répétée, et la part qu'elle occupe. */
  { id: 'conv-repare', actif: true, pour: 'convalescente', signal: 'nRepare', mode: 'parUnite', poids: 2, plafond: 6, dit: '{n} reconstruction(s)' },
  { id: 'conv-cure', actif: true, pour: 'convalescente', signal: 'nCureSuivie', mode: 'parUnite', poids: 3, plafond: 6, dit: 'cure de reconstruction suivie' },
  { id: 'conv-part', actif: true, pour: 'convalescente', signal: 'partRepare', mode: 'seuil', valeur: 0.5, poids: 2, et: { signal: 'nRepare', valeur: 2 }, dit: 'la reconstruction occupe ses venues' },

  /* La Lumineuse — le nombre ET la part : deux YÈKPÈ sur deux venues disent
     mieux son territoire que deux sur quinze. */
  { id: 'lum-yekpe', actif: true, pour: 'lumineuse', signal: 'nLumiere', mode: 'parUnite', poids: 2, plafond: 6, dit: '{n} passage(s) en YÈKPÈ' },
  { id: 'lum-habitude', actif: true, pour: 'lumineuse', signal: 'nLumiere', mode: 'seuil', valeur: 3, poids: 2, dit: 'la lumière est son habitude' },
  { id: 'lum-part', actif: true, pour: 'lumineuse', signal: 'partLumiere', mode: 'seuil', valeur: 0.5, poids: 2, et: { signal: 'nLumiere', valeur: 2 }, dit: 'la lumière domine ses venues' },

  /* L'Audacieuse — le grand passage suffit à lui seul : ce n'est pas un geste
     d'entretien, c'est une décision. */
  { id: 'aud-passage', actif: true, pour: 'audacieuse', signal: 'nGrandPassage', mode: 'parUnite', poids: 5, plafond: 10, dit: 'une Grande Renaissance' },
  { id: 'aud-creation', actif: true, pour: 'audacieuse', signal: 'nCreation', mode: 'parUnite', poids: 2, plafond: 4, dit: '{n} création(s)' },
  { id: 'aud-maisons', actif: true, pour: 'audacieuse', signal: 'maisons', mode: 'seuil', valeur: 4, poids: 2, dit: '{n} maisons parcourues' },

  /* La Souveraine — l'ancienneté ET le nombre, jamais l'un sans l'autre. */
  { id: 'souv-couronne', actif: true, pour: 'souveraine', signal: 'joursCouronne', mode: 'seuil', valeur: 1095, poids: 5, et: { signal: 'rituels', valeur: 4 }, dit: 'couronne de plus de trois ans, suivie' },
  { id: 'souv-volume', actif: true, pour: 'souveraine', signal: 'rituels', mode: 'seuil', valeur: 8, poids: 4, dit: '{n} rituels honorés' },
  { id: 'souv-longue', actif: true, pour: 'souveraine', signal: 'rituels', mode: 'seuil', valeur: 12, poids: 2, dit: 'présence de longue date' },
  { id: 'souv-dense', actif: true, pour: 'souveraine', signal: 'locks', mode: 'seuil', valeur: 300, poids: 1, et: { signal: 'rituels', valeur: 5 }, dit: 'couronne dense et suivie' },

  /* La Naissante — la couronne jeune, ou la création récente. */
  { id: 'nais-couronne', actif: true, pour: 'naissante', signal: 'joursCouronne', mode: 'seuil', valeur: 240, sous: true, poids: 4, dit: 'couronne de moins de huit mois' },
  { id: 'nais-entree', actif: true, pour: 'naissante', signal: 'joursDepuisPremier', mode: 'seuil', valeur: 180, sous: true, poids: 3, et: { signal: 'rituels', valeur: 3, sous: true }, dit: 'entrée récente à la Maison' },
  { id: 'nais-creation', actif: true, pour: 'naissante', signal: 'nCreation', mode: 'seuil', valeur: 1, poids: 3, et: { signal: 'rituels', valeur: 3, sous: true }, dit: 'création récente' },

  /* La Constante — le nombre, la fraîcheur, la régularité, l'engagement. */
  { id: 'const-trois', actif: true, pour: 'constante', signal: 'rituels', mode: 'seuil', valeur: 3, poids: 2, dit: '{n} rituels honorés' },
  { id: 'const-six', actif: true, pour: 'constante', signal: 'rituels', mode: 'seuil', valeur: 6, poids: 2, dit: 'venue souvent' },
  { id: 'const-fraiche', actif: true, pour: 'constante', signal: 'joursDepuisDernier', mode: 'seuil', valeur: 90, sous: true, poids: 2, dit: 'revenue il y a moins de trois mois' },
  { id: 'const-regularite', actif: true, pour: 'constante', signal: 'regularite', mode: 'seuil', valeur: 0.6, poids: 3, et: { signal: 'rituels', valeur: 4 }, dit: 'revient à intervalle régulier' },
  { id: 'const-abo', actif: true, pour: 'constante', signal: 'abonnee', mode: 'seuil', valeur: 1, poids: 3, dit: 'engagée sur un cycle GBÈJÍ' },

  /* CE QUE LA MAISON A OBSERVÉ. Ces indices ne valent que si quelqu'un a écrit
     sa fiche — sans observation, ils ne comptent pas.

     La Pressée renaît ici : la durée des visites était un faux indice (carnet
     incomplet), mais un maître qui note « regarde l'heure, veut être partie à
     midi » sait ce qu'il écrit. Le prix et la hâte, ensemble, la désignent. */
  { id: 'obs-hate', actif: true, pour: 'pressee', signal: 'motHate', mode: 'seuil', valeur: 1, poids: 4, dit: 'l’observation dit sa hâte' },
  { id: 'obs-prix', actif: true, pour: 'pressee', signal: 'motPrix', mode: 'seuil', valeur: 1, poids: 3, dit: 'attentive au prix' },
  { id: 'obs-aisance', actif: true, pour: 'souveraine', signal: 'motAisance', mode: 'seuil', valeur: 1, poids: 2, dit: 'ne discute pas le prix' },
  { id: 'obs-voyage', actif: true, pour: 'lointaine', signal: 'motVoyage', mode: 'seuil', valeur: 1, poids: 4, dit: 'l’observation dit ses séjours' },
  { id: 'obs-evenement', actif: true, pour: 'celebree', signal: 'motEvenement', mode: 'seuil', valeur: 1, poids: 3, dit: 'un grand jour l’attend' },
  { id: 'obs-fragilite', actif: true, pour: 'convalescente', signal: 'motFragilite', mode: 'seuil', valeur: 1, poids: 3, dit: 'fibre fragile observée' },
  { id: 'obs-audace', actif: true, pour: 'audacieuse', signal: 'motAudace', mode: 'seuil', valeur: 1, poids: 3, dit: 'l’observation dit son audace' },
  { id: 'obs-fidelite', actif: true, pour: 'constante', signal: 'motFidelite', mode: 'seuil', valeur: 1, poids: 2, dit: 'l’observation dit sa fidélité' },
];

export const REGLES_DEFAUT: ReglesConfig = { seuil: 5, marge: 2, regles: REGLES_MAISON };

export const personaReglesStore = createStore<ReglesConfig>('mnd_persona_regles', REGLES_DEFAUT);
export const usePersonaRegles = () => useStore(personaReglesStore);

/* ---------- La lecture du carnet ---------- */

const CAT_LUMIERE = new Set(['atl-iii-yekpe']);
const CAT_REPARE = new Set(['atl-iv-finfin', 'plt-40']);
const CAT_CREATION = new Set(['atl-i-vekpe']);

const estGrandJour = (nom: string) => /^Sika Day|Coiffure.*Événement/i.test(nom);
const estGrandPassage = (nom: string) => /^ÀLÀLÀ/.test(nom);
const estCureSuivie = (nom: string) => /^Cure GBÌGBÌ/.test(nom);
const estAbonnement = (nom: string) => /^GBÈJÍ™ (Trimestriel|Annuel)/.test(nom);

const jours = (aIso: string, bIso: string) =>
  Math.round((new Date(`${bIso}T00:00:00`).getTime() - new Date(`${aIso}T00:00:00`).getTime()) / 86400000);

/** Ce que le carnet dit d'une cliente. Un signal ABSENT vaut `undefined` et non
    zéro : ne pas savoir ne prouve rien, et une règle posée dessus ne compte
    pas. C'est ce qui fait que `crownSince` vide n'invente aucune souveraine. */
export type Signaux = Partial<Record<SignalCle, number>> & { rituels: number };

export function litSignaux(
  client: Client,
  rdvs: Appointment[],
  parId: Map<string, Service>,
  aujourdhui: string,
  lexique?: Marqueur[],
): Signaux {
  const honores = rdvs
    .filter((a) => a.clientId === client.id && a.status === 'honoré')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const s: Signaux = {
    rituels: honores.length,
    nLumiere: 0, nRepare: 0, nCreation: 0, nGrandJour: 0, nGrandPassage: 0, nCureSuivie: 0,
    maisons: 0, abonnee: 0,
    diaspora: client.diaspora ? 1 : 0,
  };
  if (client.lockCount != null) s.locks = client.lockCount;

  const maisons = new Set<string>();
  for (const a of honores) {
    for (const id of a.serviceIds) {
      const sv = parId.get(id);
      if (!sv) continue;
      maisons.add(sv.categoryId);
      if (CAT_LUMIERE.has(sv.categoryId)) s.nLumiere! += 1;
      /* LA GRANDE RENAISSANCE N'EST PAS UNE RÉPARATION. Elle vit dans la maison
         FÍNFÍN™ comme les reconstructions, mais elle ne dit pas une fibre qui
         souffre — elle dit une femme qui recommence. La compter des deux côtés
         faisait de chaque audacieuse une convalescente. */
      if (CAT_REPARE.has(sv.categoryId) && !estGrandPassage(sv.name)) s.nRepare! += 1;
      if (CAT_CREATION.has(sv.categoryId)) s.nCreation! += 1;
      if (estGrandJour(sv.name)) s.nGrandJour! += 1;
      if (estGrandPassage(sv.name)) s.nGrandPassage! += 1;
      if (estCureSuivie(sv.name)) s.nCureSuivie! += 1;
      if (estAbonnement(sv.name)) s.abonnee = 1;
    }
    if (a.coveredBySub) s.abonnee = 1;
  }
  s.maisons = maisons.size;

  if (honores.length > 0) {
    s.joursDepuisPremier = jours(honores[0].date, aujourdhui);
    s.joursDepuisDernier = jours(honores[honores.length - 1].date, aujourdhui);
    s.partLumiere = s.nLumiere! / honores.length;
    s.partRepare = s.nRepare! / honores.length;
  }

  /* La cadence — médiane des écarts, et non moyenne : une absence de six mois
     ne doit pas effacer six venues régulières. */
  if (honores.length >= 3) {
    const ecarts: number[] = [];
    for (let i = 1; i < honores.length; i++) ecarts.push(jours(honores[i - 1].date, honores[i].date));
    const tries = ecarts.slice().sort((a, b) => a - b);
    const med = tries[Math.floor(tries.length / 2)];
    s.cadence = med;
    if (med > 0) {
      const derive = ecarts.reduce((n, e) => n + Math.abs(e - med), 0) / ecarts.length;
      s.regularite = Math.max(0, Math.min(1, 1 - derive / med));
    }
  }

  if (client.crownSince) s.joursCouronne = jours(client.crownSince, aujourdhui);

  /* CE QUE LA MAISON A ÉCRIT D'ELLE vient s'ajouter aux faits du carnet. Une
     observation absente n'ajoute rien — elle n'efface rien non plus. */
  Object.assign(s, litObservation(client.observation, lexique));
  return s;
}

/* ---------- La pesée ---------- */

export type Indice = { pour: ArchetypeCle; poids: number; dit: string };

const satisfait = (v: number | undefined, valeur: number, sous?: boolean): boolean =>
  v !== undefined && (sous ? v <= valeur : v >= valeur);

/** Applique une règle à des signaux. Rend `null` quand elle ne mord pas — ou
    quand le signal qu'elle lit est inconnu. */
export function appliqueRegle(r: ReglePersona, s: Signaux): Indice | null {
  if (!r.actif) return null;
  const v = s[r.signal];
  if (v === undefined) return null;
  if (r.et && !satisfait(s[r.et.signal], r.et.valeur, r.et.sous)) return null;

  let poids = 0;
  if (r.mode === 'seuil') {
    if (!satisfait(v, r.valeur ?? 1, r.sous)) return null;
    poids = r.poids;
  } else {
    poids = Math.min(r.plafond ?? Number.POSITIVE_INFINITY, v * r.poids);
  }
  if (poids <= 0) return null;
  const lisible = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return { pour: r.pour, poids, dit: r.dit.replace('{n}', lisible) };
}

export function pese(s: Signaux, config: ReglesConfig = REGLES_DEFAUT): Indice[] {
  const out: Indice[] = [];
  for (const r of config.regles) {
    const i = appliqueRegle(r, s);
    if (i) out.push(i);
  }
  return out;
}

export type Verdict = {
  cle: ArchetypeCle;
  confiant: boolean;
  score: number;
  marge: number;
  raisons: string[];
};

export function verdictDe(s: Signaux, config: ReglesConfig = REGLES_DEFAUT): Verdict {
  const scores = new Map<ArchetypeCle, { n: number; dits: string[] }>();
  for (const i of pese(s, config)) {
    const cur = scores.get(i.pour) ?? { n: 0, dits: [] };
    cur.n += i.poids;
    cur.dits.push(i.dit);
    scores.set(i.pour, cur);
  }

  /* CERTAINS ARCHÉTYPES EN CONTIENNENT D'AUTRES. Une souveraine est constante
     par définition ; une lointaine ne peut pas l'être. Les laisser concourir les
     faisait s'annuler : deux scores voisins, aucune marge, et la cliente la plus
     fidèle de la Maison retombait au seuil d'accueil. Le plus précis mange le
     plus général. C'est un fait de structure — il ne se règle pas à l'écran. */
  if ((scores.get('souveraine')?.n ?? 0) >= config.seuil) scores.delete('constante');
  if ((scores.get('lointaine')?.n ?? 0) >= config.seuil) scores.delete('constante');

  const classement = [...scores.entries()].sort((a, b) => b[1].n - a[1].n);
  const premier = classement[0];
  if (!premier) return { cle: 'initiee', confiant: false, score: 0, marge: 0, raisons: ['aucun signal'] };

  const second = classement[1]?.[1].n ?? 0;
  const marge = premier[1].n - second;
  const confiant = premier[1].n >= config.seuil && marge >= config.marge;
  /* LE VERDICT NOMME TOUJOURS SON MEILLEUR CANDIDAT, même quand il ne tranche
     pas — le Trône peut dire « pressentie, pas encore sûre » plutôt que de faire
     croire à un seuil d'accueil. Seul `confiant` autorise une écriture. */
  return {
    cle: premier[0],
    confiant,
    score: premier[1].n,
    marge,
    raisons: confiant
      ? premier[1].dits
      : [premier[1].n < config.seuil
          ? `signaux trop faibles (${premier[1].n}/${config.seuil})`
          : `${nomArchetype(premier[0])} et ${nomArchetype(classement[1][0])} se tiennent de trop près`],
  };
}

export function evaluePersona(
  client: Client,
  rdvs: Appointment[],
  parId: Map<string, Service>,
  aujourdhui: string,
  config: ReglesConfig = REGLES_DEFAUT,
): Verdict {
  return verdictDe(litSignaux(client, rdvs, parId, aujourdhui, config.lexique), config);
}

/* ---------- DÉCOUVRIR UN ARCHÉTYPE QUI MANQUE ----------

   Les archétypes de la Maison ont été écrits d'en haut, à partir de ce qu'on
   croyait connaître d'elle. Le reste — les têtes que la pesée n'arrive pas à
   trancher — n'est pas forcément du bruit : c'est peut-être un archétype qu'on
   n'a jamais nommé. Cent vingt et une têtes sans verdict, ce n'est pas cent
   vingt et un cas particuliers.

   ON NE FABRIQUE PAS UN ARCHÉTYPE, ON EN NOMME UN QUI EST DÉJÀ LÀ. La méthode
   ne connaît que des faits : chaque tête sans verdict reçoit une SIGNATURE
   faite de traits discrets (son rythme, sa fraîcheur, son calibre, ce que la
   Maison a observé d'elle). Les signatures identiques se regroupent. Un groupe
   assez nombreux ET assez typé devient une proposition.

   Chaque proposition arrive avec LES RÈGLES QUI LA RECONNAÎTRAIENT — sans quoi
   on créerait un persona que personne ne pourrait jamais porter. Le nom, lui,
   n'est qu'une suggestion : la machine décrit un groupe, la Maison le baptise. */

export type Facette = { code: string; dit: string; regle: Omit<ReglePersona, 'id' | 'pour'> };

const facettesDe = (s: Signaux): Facette[] => {
  const f: Facette[] = [];
  const d = s.joursDepuisDernier;
  if (d !== undefined) {
    if (d >= 240) f.push({ code: 'endormie', dit: 'absente depuis plus de huit mois', regle: { actif: true, signal: 'joursDepuisDernier', mode: 'seuil', valeur: 240, poids: 5, dit: 'absente depuis {n} jours' } });
    else if (d <= 120) f.push({ code: 'fraiche', dit: 'revenue dans les quatre mois', regle: { actif: true, signal: 'joursDepuisDernier', mode: 'seuil', valeur: 120, sous: true, poids: 2, dit: 'revenue récemment' } });
  }
  if (s.rituels === 1) f.push({ code: 'passante', dit: 'une seule venue', regle: { actif: true, signal: 'rituels', mode: 'seuil', valeur: 1, sous: true, poids: 3, dit: 'une seule venue' } });
  else if (s.rituels >= 4) f.push({ code: 'suivie', dit: 'quatre venues ou plus', regle: { actif: true, signal: 'rituels', mode: 'seuil', valeur: 4, poids: 3, dit: '{n} venues' } });
  const l = s.locks;
  if (l !== undefined) {
    if (l >= 300) f.push({ code: 'dense', dit: 'couronne dense (300 locks et plus)', regle: { actif: true, signal: 'locks', mode: 'seuil', valeur: 300, poids: 3, dit: 'couronne de {n} locks' } });
    else if (l < 150) f.push({ code: 'fine', dit: 'couronne fine (moins de 150 locks)', regle: { actif: true, signal: 'locks', mode: 'seuil', valeur: 150, sous: true, poids: 3, dit: 'couronne fine' } });
  }
  /* Ce que la Maison a observé fait toujours facette : c'est le trait le plus
     sûr dont on dispose, parce qu'une personne l'a écrit. */
  for (const cle of ['motPrix', 'motAisance', 'motHate', 'motVoyage', 'motEvenement', 'motFragilite', 'motAudace', 'motFidelite'] as SignalCle[]) {
    if ((s[cle] ?? 0) > 0) {
      f.push({ code: cle, dit: SIGNAL_NOMS[cle], regle: { actif: true, signal: cle, mode: 'seuil', valeur: 1, poids: 4, dit: SIGNAL_NOMS[cle] } });
    }
  }
  return f;
};

/* Un nom pour commencer — le trait le plus parlant donne le sien. La Maison
   corrigera : c'est elle qui baptise, pas la machine. */
const NOM_PAR_TRAIT: Record<string, { nom: string; essence: string }> = {
  endormie: { nom: 'L’Éloignée', essence: 'Elle s’est éloignée — la maison garde sa place, et sait comment la rappeler.' },
  passante: { nom: 'La Passante', essence: 'Elle est venue une fois — tout reste à écrire, et rien n’est encore promis.' },
  motPrix: { nom: 'L’Attentive', essence: 'Elle regarde le prix, et la maison le dit clairement — c’est ainsi qu’on garde sa confiance.' },
  motAisance: { nom: 'La Confiante', essence: 'Elle ne discute pas le prix — la maison lui doit de n’en jamais abuser.' },
  motVoyage: { nom: 'La Voyageuse', essence: 'Elle va et vient — tout doit tenir dans le temps qu’elle a.' },
  motFragilite: { nom: 'La Fragile', essence: 'Sa fibre demande de la douceur — on répare avant d’embellir.' },
  motAudace: { nom: 'L’Essayeuse', essence: 'Elle aime essayer — la maison la suit, et la protège.' },
  motFidelite: { nom: 'La Régulière', essence: 'Elle revient sans qu’on la rappelle — la maison lui doit la même exactitude.' },
  dense: { nom: 'La Couronne dense', essence: 'Une couronne nombreuse — le temps et la main s’y comptent autrement.' },
  fine: { nom: 'La Couronne fine', essence: 'Une couronne légère — la précision y vaut plus que la force.' },
  suivie: { nom: 'La Suivie', essence: 'Elle revient souvent — la maison connaît sa tête par cœur.' },
  fraiche: { nom: 'La Récente', essence: 'Elle est venue il y a peu — l’habitude est encore à prendre.' },
};

export type PropositionArchetype = {
  /** Stable : rejouer la découverte sur les mêmes données redonne le même. */
  id: string;
  nom: string;
  essence: string;
  traits: string[];
  membres: { id: string; nom: string }[];
  /** Les règles qui reconnaîtraient ce groupe, prêtes à être posées. */
  regles: Omit<ReglePersona, 'id' | 'pour'>[];
};

/** Cherche, parmi les têtes que la pesée ne tranche pas, les groupes assez
    nombreux et assez typés pour mériter un nom. `minimum` est le nombre de
    têtes en dessous duquel un groupe n'est qu'une coïncidence. */
export function suggereArchetypes(
  clients: Client[],
  rdvsParCliente: Map<string, Appointment[]>,
  parId: Map<string, Service>,
  aujourdhui: string,
  config: ReglesConfig = REGLES_DEFAUT,
  personas: Persona[] = [],
  minimum = 6,
): PropositionArchetype[] {
  const groupes = new Map<string, { traits: Facette[]; membres: { id: string; nom: string }[] }>();

  for (const c of clients) {
    if (c.personaFige) continue;
    const siens = rdvsParCliente.get(c.id);
    if (!siens?.length) continue;
    const s = litSignaux(c, siens, parId, aujourdhui, config.lexique);
    if (verdictDe(s, config).confiant) continue;   // déjà rangée : rien à découvrir

    const traits = facettesDe(s);
    /* UN SEUL TRAIT NE FAIT PAS UN ARCHÉTYPE. « Elle est venue deux fois » n'est
       pas un profil, c'est une absence de profil. */
    if (traits.length < 2) continue;
    const cle = traits.map((t) => t.code).sort().join('+');
    const g = groupes.get(cle) ?? { traits, membres: [] };
    g.membres.push({ id: c.id, nom: c.name });
    groupes.set(cle, g);
  }

  const nomsPris = new Set(personas.map((p) => p.name.trim().toLowerCase()));
  const out: PropositionArchetype[] = [];
  for (const [cle, g] of groupes) {
    if (g.membres.length < minimum) continue;
    /* Le trait qui donne son nom : le premier de la table qui figure au groupe. */
    const porteur = Object.keys(NOM_PAR_TRAIT).find((t) => g.traits.some((x) => x.code === t));
    const propose = porteur ? NOM_PAR_TRAIT[porteur] : undefined;
    const nom = propose?.nom ?? 'Archétype à nommer';
    /* On ne propose pas ce que la Maison a déjà. */
    if (nomsPris.has(nom.toLowerCase())) continue;
    out.push({
      id: `decouvert-${cle}`,
      nom,
      essence: propose?.essence ?? `Ce groupe partage : ${g.traits.map((t) => t.dit).join(', ')}.`,
      traits: g.traits.map((t) => t.dit),
      membres: g.membres,
      regles: g.traits.map((t) => t.regle),
    });
  }
  return out.sort((a, b) => b.membres.length - a.membres.length);
}

/** Retrouve le persona de la Maison qui porte cet archétype — par notre
    identifiant, sinon par son nom (celui d'accueil est né avant nous, et la
    Maison peut renommer les siens). */
export function personaDe(personas: Persona[], cle: ArchetypeCle): Persona | undefined {
  /* Un archétype DÉCOUVERT porte sa clé comme identifiant — on la cherche donc
     telle quelle avant les conventions de la Maison. */
  const direct = personas.find((p) => p.id === cle);
  if (direct) return direct;
  const parId = personas.find((p) => p.id === `p-${cle}`);
  if (parId) return parId;
  const nom = (PERSONA_NOMS[cle as PersonaCle] ?? '').toLowerCase();
  if (!nom) return undefined;
  const parNom = personas.find((p) => p.name.trim().toLowerCase() === nom);
  if (parNom) return parNom;
  if (cle === 'initiee') return personas.find((p) => /^\s*initi/i.test(p.name));
  return undefined;
}

import { bindDocument } from './sync';
bindDocument(personaReglesStore, 'mnd_persona_regles');
