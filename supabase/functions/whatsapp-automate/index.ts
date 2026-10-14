// whatsapp-automate - la Maison repond et reserve sur WhatsApp.
//
// LA PREMIERE LIGNE EST VOLONTAIREMENT PAUVRE, comme celles de
// whatsapp-webhook et de whatsapp-envoi (14 septembre 2026) : un fichier
// qu on colle a la main dans un navigateur doit commencer par quelque chose
// qui survit a un collage de travers. Le decor vient apres.

/* ═══════════════════════════════════════════════════════════════════
   WHATSAPP-AUTOMATE · la Maison répond et réserve · 9 octobre 2026

   Maquette « Réserver sur WhatsApp », validée le 9 octobre 2026 (façon B :
   une conversation à boutons et à listes, qui propose de vraies places
   libres et pose le rendez-vous au toucher « Je confirme »).

   LES DÉCISIONS DE LA DIRECTION, 9 octobre 2026 :
     · l'automate pose un rendez-vous CONFIRMÉ, comme le site ;
     · il prend la parole quand la cliente parle de rendez-vous, et au
       premier message d'un numéro inconnu ; « merci pour hier » ne
       déclenche rien ;
     · la nuit, il répond et réserve à toute heure : elle a écrit, elle attend ;
     · des boutons, des listes et quelques mots reconnus (les jours, demain,
       matin, après-midi, annuler) ; au deuxième écart, la main passe à
       l'équipe ; PAS de modèle de langue ;
     · un interrupteur à trois positions, `mnd_auto_config.automateWa`
       (éteint, essai, ouvert), LIVRÉ EN ESSAI AVEC UNE LISTE VIDE : personne
       n'est servi tant que la direction n'a pas saisi ses numéros.

   QUI L'APPELLE : `whatsapp-webhook` seul, une fois les messages rangés,
   pour les messages NEUFS d'un numéro (jamais une seconde livraison de
   Meta), en tâche de fond. LA PORTE : `Authorization: Bearer <CLE_SERVICE>`,
   comparée à temps constant ; le même secret que le cron vers
   confirmation-rdv, aucun secret neuf. Il rend `{ pris, alerte? }` :
     · `pris: false` : ce tour n'est pas à lui, rien ne s'écrit, et le
       webhook prévient l'équipe comme d'habitude ;
     · `pris: true` : il tient le fil, et ne fait sonner que l'`alerte` (un
       rendez-vous posé, la main passée), le prénom seul, jamais le texte.

   UN TOUR, DANS L'ORDRE :
     ① le réglage : un numéro que l'interrupteur ne sert pas rend `pris: false` ;
     ② l'état du fil (`fil-<numéro>`) et la main de l'équipe (`main-<numéro>`) ;
     ③ les messages reçus et pas encore traités, d'une même rafale (deux
       messages envoyés coup sur coup font UN tour), de moins de 15 minutes ;
     ④ les fiches du numéro (`fiches_du_numero`, 0125 : sans plafond de
       mille, la maman et son enfant distinctes) ;
     ⑤ qui parle (`jugeLaParole`, shared/automate-wa), AVANT de lire l'agenda ;
     ⑥ « en train d'écrire » (le message se dit lu), puis 2,5 s d'attente :
       si un message plus récent est arrivé, c'est son tour qui répond ;
     ⑦ l'agenda du serveur : les places libres de J+1 à l'horizon, sur
       l'instantané du tour (fauteuils, plafonds, murs, maîtres) ;
     ⑧ le tour (`etapeSuivante`) ; au « Je confirme », la place rejouée sur
       un instantané frais, puis `pose_si_libre` sous verrou, puis la suite ;
     ⑨ l'état, par `avance_le_fil` : il n'écrit que si la version n'a pas
       bougé et qu'aucune main de l'équipe ne tient le fil. Sinon le tour se
       tait (la pause), ou se rejoue une fois (un autre tour est passé) ;
     ⑩ le message, envoyé à Graph, et sa trace dans le fil (`parQui: 'Le
       Trône'`, `auto: 'automate'`, l'étape, les choix) ; la ligne de
       confirmation passe à « envoyé », ou à « échec » (le modèle de
       confirmation-rdv prend alors le relais) ; un message refusé par Meta
       passe la main à l'équipe, sans un mot de plus.

   CE QU'IL ÉCRIT, ET RIEN D'AUTRE : l'état du fil (par `avance_le_fil`,
   jamais en direct), ses messages dans `messages_wa`, `luParLaMaisonLe`
   sur le message qu'il lit, et au « Je confirme » seulement, par
   `pose_si_libre` : le rendez-vous `rdv-wa-<clé du toucher>`, la demande
   d'une inconnue, la ligne d'envoi `conf-<rdv>-whatsapp`, puis le statut de
   cette ligne. Les identifiants viennent du message « Je confirme » : une
   seconde livraison ne crée rien. JAMAIS une annulation, jamais un
   rendez-vous retouché, jamais une fiche créée (le Trône la crée au
   rattachement de la demande).

   LES COPIES. Une fonction Edge ne lit rien du dépôt : chaque bloc entre
   repères ⟨…⟩ est recopié TEL QUEL de src/shared, et un harnais le
   confronte caractère pour caractère à son original. `appelDe` est la
   copie compacte que portent toutes les fonctions (verifie-civilite).

   AUCUN SECRET ICI. Tout vient de l'environnement :
     · CLE_SERVICE, SUPABASE_URL : la porte, et la base ;
     · WA_TOKEN, WA_PHONE_ID : l'API Meta, les mêmes que whatsapp-envoi.

   DÉPLOIEMENT, après la migration 0125 : Supabase → Edge Functions → New
   function « whatsapp-automate » → coller CE FICHIER ENTIER → Deploy →
   DÉCOCHER « Verify JWT » (la porte est CLE_SERVICE, jugée ici ; une clé
   sb_secret n'est pas un jeton, la passerelle refuserait le webhook).
   Puis recoller whatsapp-envoi, puis whatsapp-webhook.
   ═══════════════════════════════════════════════════════════════════ */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** LA VERSION DE CE FICHIER, dite par le contrôle de santé. Sans elle on ne
    sait pas quel code tourne vraiment. À incrémenter à chaque déploiement. */
const VERSION = '2026-10-14-b · l automate mene toujours : ni la parole de la Maison ni un rendez-vous a venir ne le font taire (la main de l equipe reste)';

/** « En train d'écrire », puis on attend : deux messages envoyés coup sur
    coup font un seul tour, celui du dernier. */
const ATTENTE_DU_TOUR_MS = 2500;
/** UNE RAFALE : les messages reçus à moins de deux minutes du sien. Un
    « je serai en retard » d'il y a dix minutes, resté sans réponse, ne
    s'ajoute pas au « je voudrais un rendez-vous » de maintenant. */
const RAFALE_MS = 2 * 60 * 1000;
/** Les créneaux pris se lisent par tranches de sept jours. */
const TRANCHE_JOURS = 7;
/** Supabase ne rend jamais plus de mille lignes : une tranche de mille pile
    est peut-être coupée, on ne s'y fie pas. */
const PLAFOND_DE_LIGNES = 1000;
/** Les réglages que lit un tour, en une requête. */
const DOCUMENTS_DU_TOUR = ['mnd_auto_config', 'mnd_settings', 'mnd_horaires_exceptions', 'mnd_vitrine_config', 'mnd_house_identity', 'mnd_reponses_maison'];

/* LE JOURNAL : des genres, des comptes, des étapes. JAMAIS un numéro,
   jamais un texte, jamais un jeton : un journal qui recopierait le message
   d'une cliente serait une fuite de plus. */
const dis = (quoi: string, o: Record<string, unknown> = {}) =>
  console.log(`whatsapp-automate · ${quoi} · ${JSON.stringify(o)}`);

/** Numéro → format Meta (chiffres, sans « + »). MÊME RÈGLE que `numeroWa`
    (shared/conversations.ts), que le webhook et que `numero_wa` (0102) : les
    clés `fil-<numéro>` et `main-<numéro>` doivent tomber sur la même ligne. */
const numeroWa = (brut: string | undefined): string => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

/* ══ LES COPIES DU DÉPÔT ═══════════════════════════════════════════════
   Entre les repères, RIEN qui ne soit dans l'original, dans cet ordre (un
   bloc s'appuie PAR LEUR NOM sur ceux qui le précèdent) :
     ⟨lecture-entiere⟩   src/shared/lecture-entiere.ts, de PAGE_DE_LECTURE à
                         la fin (l'original ne porte pas de repères) ;
     ⟨agenda-pur⟩        src/shared/agenda-pur.ts, entre ses repères ;
     ⟨catalogue-pur⟩     src/shared/catalogue-pur.ts, entre ses repères ;
     ⟨qualification⟩     src/shared/qualification.ts, entre ses repères ;
     ⟨place-du-serveur⟩  src/shared/place-du-serveur.ts, entre ses repères :
                         le juge de la place, celui de demande-submit ;
     ⟨prochaines-places⟩ src/shared/reservation-express.ts, entre ses repères
                         (de PLACES_PAR_JOUR à la fin de prochainesPlaces) ;
     ⟨automate-wa⟩       src/shared/automate-wa.ts, entre ses repères : le
                         dialogue.
   Ils changent ensemble, ou le harnais crie. */

/* ⟨lecture-entiere⟩ */
export const PAGE_DE_LECTURE = 1000;

type ErreurDeLecture = { message: string };
export type ReponseDePage<L> = { data: L[] | null; error: ErreurDeLecture | null };
/** Lit une page : les `taille` premières lignes dont l'`id` suit `apres`
    (toutes depuis le début si `apres` est nul), dans l'ordre croissant des `id`. */
export type LecteurDePage<L extends { id: string }> = (apres: string | null, taille: number) => PromiseLike<ReponseDePage<L>>;

/* Deux mille pages font deux millions de lignes : au-delà, ce n'est plus une
   table qu'on charge dans un navigateur, c'est une boucle qui ne finit pas. */
const PAGES_AU_PLUS = 2000;

export async function litToutesLesPages<L extends { id: string }>(
  page: LecteurDePage<L>,
  taille: number = PAGE_DE_LECTURE,
): Promise<ReponseDePage<L>> {
  const vues = new Map<string, L>();
  let apres: string | null = null;
  for (let tour = 0; tour < PAGES_AU_PLUS; tour += 1) {
    const { data, error } = await page(apres, taille);
    if (error) return { data: null, error };
    const lignes = data ?? [];
    for (const l of lignes) vues.set(l.id, l);
    if (lignes.length < taille) return { data: [...vues.values()], error: null };
    apres = lignes[lignes.length - 1].id;
  }
  return { data: null, error: { message: 'lecture interminable : la table ne finit pas' } };
}
/* ⟨/lecture-entiere⟩ */

/* ⟨agenda-pur⟩ */
export const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** '09h30' → minutes depuis minuit. La graphie de la Maison, au Trône. */
export const hourToMin = (h: string): number => {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(h.trim());
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 9 * 60;
};

/** '09:30' → minutes depuis minuit. La graphie d'un rendez-vous. */
export const minutesDeHhmm = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const hhmmDeMinutes = (min: number): string => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

export type FenetreDuJour = { closed: boolean; openMin: number; closeMin: number };
export type HeureDeLaSemaine = { key: string; open: string; close: string; closed: boolean };
export type ExceptionDHoraire = { date: string; staffId?: string; open?: string; close?: string; closed?: boolean };
export type MurPose = { branchId: string; date: string; master?: string; debut?: string; fin?: string };

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** La fenêtre d'ouverture d'une date, EXCEPTIONS COMPRISES : une fermeture
    exceptionnelle saisie pour la paie ferme aussi la réservation en ligne
    (celle de la Maison ; celles d'une personne restent l'affaire du
    pointage). Sans semaine connue, la journée est tenue pour FERMÉE : mieux
    vaut ne rien proposer que d'ouvrir un lundi que la Maison ferme. */
export function ouvertureDuJour(
  dateIso: string,
  semaine: readonly HeureDeLaSemaine[],
  exceptions: readonly ExceptionDHoraire[] = [],
): FenetreDuJour {
  const FERME: FenetreDuJour = { closed: true, openMin: 0, closeMin: 0 };
  const dow = new Date(`${dateIso}T00:00:00`).getDay();
  const jour = semaine.find((h) => h.key === JOURS[dow]);
  if (!jour || jour.closed) return FERME;
  const base: FenetreDuJour = { closed: false, openMin: hourToMin(jour.open), closeMin: hourToMin(jour.close) };
  const ex = exceptions.find((e) => e.date === dateIso && !e.staffId);
  if (!ex) return base;
  if (ex.closed) return FERME;
  return {
    closed: false,
    openMin: ex.open?.trim() ? hourToMin(ex.open) : base.openMin,
    closeMin: ex.close?.trim() ? hourToMin(ex.close) : base.closeMin,
  };
}

/** Les murs d'une date pour UN maître, en minutes depuis minuit. Un blocage
    sans bornes couvre la journée entière ; un blocage sans maître vaut pour
    tous. */
export function plagesBloquees(
  murs: readonly MurPose[],
  branchId: string,
  dateIso: string,
  master: string,
): Array<[number, number]> {
  return murs
    .filter((b) => b.branchId === branchId && b.date === dateIso && (!b.master || b.master === master))
    .map((b): [number, number] => [
      b.debut?.trim() ? hourToMin(b.debut) : 0,
      b.fin?.trim() ? hourToMin(b.fin) : 24 * 60,
    ])
    .filter(([s, e]) => e > s);
}

/** UN CRÉNEAU DÉJÀ PRIS, dit sans dire par qui — voir la migration 0079.
    C'est tout ce que le serveur consent à donner à une inconnue, et tout ce
    qu'un calendrier honnête demande. */
export type CreneauOccupe = { jour: string; maitre: string; debut: string; duree: number };

/** LE CŒUR DU CALCUL, SANS AUCUN MAGASIN — pour qu'il soit jugeable.

    Les murs entrent par la porte : le harnais peut poser n'importe quelle
    journée, et les trois surfaces obtiennent la même réponse. */
export function creneauxLibres(o: {
  opening: FenetreDuJour;
  durationMin: number;
  /** Tout ce qui occupe la journée, tous maîtres confondus. */
  occupes: readonly { maitre: string; debutMin: number; dureeMin: number }[];
  /** Murs posés à la main (pause, absence), déjà résolus en minutes. */
  bloques?: readonly (readonly [number, number])[];
  master: string;
  capMaison?: number;
  capMaitre?: number;
  /** LE SALON N'A QU'UN NOMBRE DE FAUTEUILS — 17 septembre 2026.
      « Pourquoi toutes les heures sont disponibles sur le site pourtant il
      n'y a pas de place la journée du samedi ? » (Yéman).

      LA CAUSE ÉTAIT L'UNION PAR MAÎTRE : le site demandait les heures libres
      de CHAQUE maître et gardait leur union. La branche porte deux libellés,
      « Team » et « Expert » ; le second ne reçoit jamais, donc toutes ses
      heures étaient libres, et un libellé inoccupé rouvrait un salon plein.

      Ce plafond compte les rituels qui SE CHEVAUCHENT, tous maîtres
      confondus : c'est la contrainte réelle d'un salon, ses fauteuils
      (`Branch.seats`). 0 ou absent = pas de limite, le comportement d'avant,
      celui que Ma Couronne garde. */
  capSimultane?: number;
  /** Minutes depuis minuit si la date est aujourd'hui ; sinon `null`. */
  maintenantMin?: number | null;
  /** Le pas de la grille. Une heure, comme au comptoir. */
  pasMin?: number;
}): string[] {
  if (o.opening.closed) return [];

  /* LE PLAFOND D'ABORD : au-delà, plus aucun créneau, même si des heures
     restent. La maison choisit son souffle ; le comptoir, lui, n'est pas
     bridé (poser un rendez-vous à la main reste un geste du personnel).
     0 = illimité. */
  const capMaison = o.capMaison ?? 0;
  const capMaitre = o.capMaitre ?? 0;
  if (capMaison > 0 && o.occupes.length >= capMaison) return [];
  const duMaitre = o.occupes.filter((a) => a.maitre === o.master);
  if (capMaitre > 0 && duMaitre.length >= capMaitre) return [];

  const busy: Array<readonly [number, number]> = duMaitre
    .map((a) => [a.debutMin, a.debutMin + a.dureeMin] as const);
  if (o.bloques) busy.push(...o.bloques);

  const pas = o.pasMin ?? 60;
  const cap = o.capSimultane ?? 0;
  const out: string[] = [];
  for (let m = o.opening.openMin; m + o.durationMin <= o.opening.closeMin; m += pas) {
    if (o.maintenantMin != null && m <= o.maintenantMin) continue;
    const overlaps = busy.some(([s, e]) => m < e && m + o.durationMin > s);
    if (overlaps) continue;
    /* LES FAUTEUILS : le maître est libre, mais la Maison peut être pleine. */
    if (cap > 0) {
      const ensemble = o.occupes
        .filter((a) => m < a.debutMin + a.dureeMin && m + o.durationMin > a.debutMin).length;
      if (ensemble >= cap) continue;
    }
    out.push(hhmmDeMinutes(m));
  }
  return out;
}

/** La durée d'un rituel : la somme de ses prestations, une heure au moins.
    Une prestation inconnue du catalogue vaut une heure, comme au comptoir. */
export function dureeDesPrestations(
  ids: readonly string[],
  services: readonly { id: string; durationMin?: number }[],
): number {
  const total = ids.reduce((s, id) => s + (services.find((x) => x.id === id)?.durationMin ?? 60), 0);
  return Math.max(60, total);
}

/** Les créneaux occupés d'un jour, mis en la forme que le calcul attend. */
export const occupesDuJour = (
  occupes: readonly CreneauOccupe[],
  dateIso: string,
): { maitre: string; debutMin: number; dureeMin: number }[] =>
  occupes
    .filter((c) => c.jour === dateIso && c.debut)
    .map((c) => ({ maitre: c.maitre, debutMin: minutesDeHhmm(c.debut), dureeMin: c.duree }));
/* ⟨/agenda-pur⟩ */

/* ⟨catalogue-pur⟩ */
export type PriceMode = 'fixe' | 'variable' | 'devis';

/* La règle reconnaît par la CATÉGORIE, jamais par le nom : « une règle qui
   reconnaît par le NOM casse en silence » (leçon du 18 août). L'atelier
   VÈKPÈ™ EST l'atelier de la Naissance ; FÍNFÍN™ celui de la Renaissance.
   Les identifiants sont ceux de la semence, stables depuis le premier jour. */
export const CATEGORIE_VEKPE = 'atl-i-vekpe';
export const CATEGORIE_FINFIN = 'atl-iv-finfin';
/* L'ATELIER DES CONSULTATIONS — corrigé le 17 septembre 2026, EN LIGNE.

   Le site public ne proposait que la catégorie `doto`, celle de la semence.
   La Maison, elle, a posé le sien : `koko` (KÒKÒ™, « Le Diagnostic »), qui
   porte ses trois consultations. Résultat, l'écran de réservation est sorti
   VIDE en production : « voilà ce qui sort » (Yéman, capture à l'appui).
   C'est exactement la faute que la relecture adversaire avait annoncée,
   reconnaître par un identifiant que la base vivante ne porte pas.

   ON EN CONNAÎT DONC LES DEUX, et on garde un dernier recours par le nom :
   une règle qui ne sait plus reconnaître ce qu'elle cherche doit se rabattre,
   jamais rendre une page vide. */
export const CATEGORIES_CONSULTATION: readonly string[] = ['doto', 'koko'];

/* CE QUE LE SITE PUBLIC NE MONTRE PAS — 17 septembre 2026. « Il y a des
   services que je ne voudrais pas sur le site. Comment je peux avoir la main
   pour les décocher ? » (Yéman). La Maison décoche depuis la régie de la
   Vitrine, onglet « Sur le site public » ; la liste vit dans
   `mnd_vitrine_config.siteMasques`.

   ELLE EST À PART DE `hiddenServices` ET `hiddenCategories`, et c'est tout
   l'enjeu : ces deux-là règlent la carte du comptoir et Ma Couronne, où la
   Maison a masqué le Diagnostic, la Création et la Renaissance. Les confondre
   viderait le site de ses consultations, on l'a vérifié.

   MASQUER, PAS SÉLECTIONNER : on liste ce qu'on RETIRE, jamais ce qu'on
   garde, sinon toute prestation née après la liste resterait invisible sans
   qu'aucun réglage ne le dise. Un atelier décoché emporte ses familles,
   comme partout ailleurs dans la Maison.

   LE MÊME JUGE SERT DEUX FOIS : l'écran du site pour ne plus proposer, et la
   fonction `demande-submit` pour REFUSER (elle le recopie, une fonction Edge
   n'importe rien du dépôt). Sans le second, décocher ne serait qu'un décor :
   un appel direct réserverait encore. */
export type MasquesDuSite = { services?: string[]; categories?: string[] };

export function masquePourLeSite(
  s: { id: string; categoryId: string },
  masques: MasquesDuSite | undefined,
  cats: readonly { id: string; parentId?: string }[] = [],
): boolean {
  if (!masques) return false;
  if ((masques.services ?? []).includes(s.id)) return true;
  const caches = masques.categories ?? [];
  if (caches.length === 0) return false;
  /* La remontée est bornée : un parent circulaire ne fige pas l'écran. */
  let cur: string | undefined = s.categoryId;
  for (let i = 0; cur && i < 8; i += 1) {
    if (caches.includes(cur)) return true;
    cur = cats.find((c) => c.id === cur)?.parentId;
  }
  return false;
}

export function estUneConsultation(
  s: { categoryId: string; name?: string },
  cats: readonly { id: string; parentId?: string }[] = [],
): boolean {
  if (CATEGORIES_CONSULTATION.includes(s.categoryId)) return true;
  const racine = racineOf(cats, s.categoryId)?.id;
  if (racine && CATEGORIES_CONSULTATION.includes(racine)) return true;
  return /consultation|diagnostic/i.test(s.name ?? '');
}

export const fondeLaCouronne = (s: { categoryId: string }): boolean => s.categoryId === CATEGORIE_VEKPE;

/** Mode de prix effectif — dérive des anciennes données (hidePrice) si non renseigné. */
export const priceModeOf = (s: { priceMode?: PriceMode; hidePrice?: boolean }): PriceMode =>
  s.priceMode ?? (s.hidePrice ? 'devis' : 'fixe');

/** LA RACINE d'une catégorie — l'atelier dont elle relève, ou elle-même si
    c'en est un. La remontée est bornée pour qu'un parent circulaire ne fige
    pas l'écran. */
export const racineOf = <C extends { id: string; parentId?: string }>(cats: readonly C[], id: string | undefined): C | undefined => {
  let cur = cats.find((c) => c.id === id);
  for (let i = 0; cur?.parentId && i < 8; i += 1) {
    const parent = cats.find((c) => c.id === cur!.parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur;
};
/* ⟨/catalogue-pur⟩ */

/* ⟨qualification⟩ */
export type Porte = 'consultation' | 'directe';

export type Besoin = 'creation' | 'reparation' | 'entretien' | 'enfant' | 'formation' | 'inconnu';

type PrestationJugee = {
  categoryId: string;
  priceMode?: PriceMode;
  hidePrice?: boolean;
  /** L'exception posée au Catalogue : une prestation qui exige un regard
      avant réservation, même hors création, devis et restauration. */
  consultationAvant?: boolean;
};

/** Ce qui décide n'est pas l'état déclaré, c'est la prestation visée :
    une création (atelier VÈKPÈ™), un prix sur devis, une restauration
    (atelier FÍNFÍN™), ou le drapeau posé à la main. */
export function exigeConsultation(s: PrestationJugee, cats: { id: string; parentId?: string }[]): boolean {
  if (s.consultationAvant === true) return true;
  if (fondeLaCouronne(s)) return true;
  if (priceModeOf(s) === 'devis') return true;
  return racineOf(cats, s.categoryId)?.id === CATEGORIE_FINFIN;
}

export const porteDe = (s: PrestationJugee, cats: { id: string; parentId?: string }[]): Porte =>
  exigeConsultation(s, cats) ? 'consultation' : 'directe';

/** Le site ne connaît pas encore de prestation, seulement un besoin : la
    même règle, dite par parcours. Un enfant commence par un échange avec ses
    parents ; une formation est une demande, pas un fauteuil. « Je ne sais
    pas » mène au regard : c'est le bon défaut. */
export const porteDuBesoin = (b: Besoin): Porte =>
  b === 'entretien' || b === 'formation' ? 'directe' : 'consultation';

export const ditLaPorte = (p: Porte): string =>
  p === 'consultation' ? 'Commence par une consultation.' : 'Se réserve directement.';
/* ⟨/qualification⟩ */

/* ⟨place-du-serveur⟩ */
/* ── 1. CE QUI SE RÉSERVE EN LIGNE ──────────────────────────────────────
   Deux ateliers, et c'est délibéré : l'Entretien (lavages, soins, reprises de
   racines, sorties signature) et la Coloration. Une création et une
   restauration passent par la consultation, les formations sont des
   candidatures, les mèches et les fournitures ne sont pas des rendez-vous.
   Les masques de la Vitrine (comptoir, Ma Couronne) ne comptent pas ici :
   seuls ceux du site public (`siteMasques`). */
const ATELIERS_RESERVABLES: readonly string[] = ['atl-ii-gbeji', 'atl-iii-yekpe'];

/* LA CONSULTATION DE CHAQUE PORTE (la Maison, 17 septembre 2026) : le KÒKÒ
   Origine pour une première couronne, le KÒKÒ Suivi pour une réparation, le
   Conseil et diagnostic pour un enfant. Un identifiant disparu ne ferme
   jamais la porte : l'écran propose alors toutes les consultations. */
const CONSULTATION_PAR_PARCOURS: Readonly<Partial<Record<Besoin, string>>> = {
  creation: 'sv-koko-ori',
  reparation: 'sv-koko-sui',
  enfant: 'svc-doto-conseil',
};

/** Trois mois au plus : un carnet ne se remplit pas à l'aveugle. */
const FENETRE_DE_RESERVATION = 90;
const UN_JOUR_MS = 86_400_000;

type PrestationDuServeur = {
  id: string;
  name?: string;
  categoryId: string;
  durationMin?: number;
  priceMode?: PriceMode;
  hidePrice?: boolean;
  consultationAvant?: boolean;
  enabled?: boolean;
  archived?: boolean;
  /** Le maître que la prestation désigne, quand elle en désigne un. */
  master?: string;
};

type CategorieDuServeur = { id: string; parentId?: string };

/** UNE PRESTATION SE RÉSERVE-T-ELLE EN LIGNE ? Active, non décochée pour le
    site, et soit une consultation, soit un geste d'un atelier réservable qui
    n'exige pas de consultation et n'est pas sur devis. */
function reservableSurLeSite(
  s: {
    id: string; categoryId: string; name?: string; priceMode?: PriceMode; hidePrice?: boolean;
    consultationAvant?: boolean; enabled?: boolean; archived?: boolean;
  },
  cats: { id: string; parentId?: string }[],
  masques: MasquesDuSite | undefined,
): boolean {
  if (s.enabled === false || s.archived) return false;
  if (masquePourLeSite(s, masques, cats)) return false;
  if (estUneConsultation(s, cats)) return true;
  if (exigeConsultation(s, cats) || priceModeOf(s) === 'devis') return false;
  const racine = racineOf(cats, s.categoryId)?.id ?? s.categoryId;
  return ATELIERS_RESERVABLES.includes(racine);
}

/* ── 2. L'AGENDA DU SERVEUR ─────────────────────────────────────────────
   Tout ce que le juge lit, mis en forme depuis les lignes que la fonction
   vient de lire en base : la branche (maîtres, fauteuils), `mnd_settings`
   (semaine, plafonds), `mnd_horaires_exceptions`, `mnd_vitrine_config`
   (masques du site, formules rapides), le catalogue et ses familles, les
   blocages, et les créneaux occupés (`creneaux_occupes`). Une valeur mal
   écrite en base se lit comme vide, jamais comme une panne. */
type AgendaDuServeur = {
  branchId: string;
  maitres: string[];
  /** Les fauteuils de la Maison. 0 = sans limite. */
  sieges: number;
  capMaison: number;
  capMaitre: number;
  semaine: HeureDeLaSemaine[];
  exceptions: ExceptionDHoraire[];
  murs: MurPose[];
  occupes: CreneauOccupe[];
  /** Tout le catalogue, prestations éteintes comprises : le juge dit pourquoi. */
  services: PrestationDuServeur[];
  categories: CategorieDuServeur[];
  masques: MasquesDuSite;
  formules: { serviceIds: string[] }[];
};

type LignesDeLAgenda = {
  branche: { id: string; data?: unknown } | null | undefined;
  /** `mnd_settings.data` */
  reglages?: unknown;
  /** `mnd_horaires_exceptions.data` */
  exceptions?: unknown;
  /** `mnd_vitrine_config.data` */
  vitrine?: unknown;
  services?: readonly { id: string; data?: unknown }[] | null;
  categories?: readonly { id: string; data?: unknown }[] | null;
  blocages?: readonly { id?: string; data?: unknown }[] | null;
  /** Les lignes de `creneaux_occupes` : jour, maître, début, durée. */
  occupes?: readonly unknown[] | null;
};

function agendaDepuisLesLignes(l: LignesDeLAgenda): AgendaDuServeur | null {
  const objet = (v: unknown): Record<string, unknown> =>
    (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
  const chaine = (v: unknown): string =>
    (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const ids = (v: unknown): string[] => liste(v).filter((x): x is string => typeof x === 'string' && x !== '');
  /* Un entier écrit en nombre ou en texte, comme le lit le verrou (0125) ;
     illisible ou négatif : 0, c'est-à-dire sans limite. */
  const entier = (v: unknown): number => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d{1,4}(\.\d+)?\s*$/.test(v) ? Number(v) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const MODES: readonly string[] = ['fixe', 'variable', 'devis'];

  const brancheId = chaine(l.branche?.id);
  if (!l.branche || !brancheId) return null;
  const branche = objet(l.branche.data);
  const reglages = objet(l.reglages);
  const vitrine = objet(l.vitrine);
  const masques = objet(vitrine.siteMasques);

  const semaine: HeureDeLaSemaine[] = liste(reglages.hours).map(objet)
    .filter((h) => chaine(h.key) !== '')
    .map((h) => ({ key: chaine(h.key), open: chaine(h.open), close: chaine(h.close), closed: !!h.closed }));
  const exceptions: ExceptionDHoraire[] = liste(l.exceptions).map(objet)
    .filter((e) => chaine(e.date) !== '')
    .map((e) => ({
      date: chaine(e.date),
      ...(chaine(e.staffId) ? { staffId: chaine(e.staffId) } : {}),
      ...(chaine(e.open) ? { open: chaine(e.open) } : {}),
      ...(chaine(e.close) ? { close: chaine(e.close) } : {}),
      closed: !!e.closed,
    }));
  const murs: MurPose[] = (l.blocages ?? []).map((b) => objet(objet(b).data))
    .filter((b) => chaine(b.branchId) !== '' && chaine(b.date) !== '')
    .map((b) => ({
      branchId: chaine(b.branchId),
      date: chaine(b.date),
      ...(chaine(b.master) ? { master: chaine(b.master) } : {}),
      ...(chaine(b.debut) ? { debut: chaine(b.debut) } : {}),
      ...(chaine(b.fin) ? { fin: chaine(b.fin) } : {}),
    }));
  const occupes: CreneauOccupe[] = (l.occupes ?? []).map(objet)
    .filter((c) => chaine(c.jour) !== '' && /^\d{1,2}:\d{2}/.test(chaine(c.debut)))
    .map((c) => {
      const d = Number(c.duree);
      return { jour: chaine(c.jour), maitre: chaine(c.maitre), debut: chaine(c.debut), duree: Number.isFinite(d) && d >= 1 ? d : 60 };
    });
  const services: PrestationDuServeur[] = (l.services ?? []).map((r) => {
    const d = objet(r.data);
    const duree = Number(d.durationMin);
    const mode = chaine(d.priceMode);
    return {
      id: chaine(r.id) || chaine(d.id),
      name: chaine(d.name),
      categoryId: chaine(d.categoryId),
      ...(d.durationMin !== undefined && d.durationMin !== null && d.durationMin !== '' && Number.isFinite(duree) && duree >= 0 ? { durationMin: duree } : {}),
      ...(MODES.includes(mode) ? { priceMode: mode as PriceMode } : {}),
      ...(d.hidePrice ? { hidePrice: true } : {}),
      ...(d.consultationAvant === true ? { consultationAvant: true } : {}),
      ...(d.enabled === false ? { enabled: false } : {}),
      ...(d.archived ? { archived: true } : {}),
      ...(chaine(d.master) ? { master: chaine(d.master) } : {}),
    };
  }).filter((s) => s.id !== '');
  const categories: CategorieDuServeur[] = (l.categories ?? []).map((r) => {
    const d = objet(r.data);
    return { id: chaine(r.id), ...(chaine(d.parentId) ? { parentId: chaine(d.parentId) } : {}) };
  }).filter((c) => c.id !== '');

  return {
    branchId: brancheId,
    maitres: ids(branche.masters),
    sieges: entier(branche.seats),
    capMaison: entier(reglages.maxRdvParJourMaison),
    capMaitre: entier(reglages.maxRdvParJourMaitre),
    semaine,
    exceptions,
    murs,
    occupes,
    services,
    categories,
    masques: { services: ids(masques.services), categories: ids(masques.categories) },
    formules: liste(vitrine.formulesRapides).map(objet)
      .map((f) => ({ serviceIds: ids(f.serviceIds) }))
      .filter((f) => f.serviceIds.length > 0),
  };
}

/* ── 3. LE JOUR, À L'HEURE DE COTONOU ───────────────────────────────────
   UTC+1, toute l'année. Jamais l'horloge du serveur (UTC) : entre minuit et
   une heure à Cotonou, elle croit encore être la veille. */
const jourDeCotonou = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 10);

/** Le jour `n` jours après `iso` (AAAA-MM-JJ). Illisible : chaîne vide. */
function isoApresJours(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t + n * UN_JOUR_MS).toISOString().slice(0, 10) : '';
}

/** Combien de jours d'ici (Cotonou) à `dateIso` : 1 = demain, 0 = aujourd'hui.
    Une date qui n'existe pas (le 31 février) rend NaN. */
function joursDEcart(dateIso: string, ms: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || isoApresJours(dateIso, 0) !== dateIso) return Number.NaN;
  return Math.round((Date.parse(`${dateIso}T00:00:00Z`) - Date.parse(`${jourDeCotonou(ms)}T00:00:00Z`)) / UN_JOUR_MS);
}

/* ── 4. LE JUGE ─────────────────────────────────────────────────────────
   Les codes sont ceux que le site sait déjà dire (`creneau_*`, `prestation_*`),
   plus `consultation_requise`. */
type RefusDeLaPlace =
  | 'creneau_invalide' | 'creneau_hors_fenetre' | 'creneau_ferme'
  | 'prestation_inconnue' | 'prestation_retiree' | 'consultation_requise'
  | 'creneau_hors_ouverture' | 'creneau_plafond' | 'creneau_pris';

type DemandeDePlace = { date: string; time: string; serviceIds: readonly string[] };

/** La place tient : sa durée, et les maîtres LIBRES à cette heure, dans
    l'ordre de la Maison (le verrou prend le premier encore libre). */
type VerdictDeLaPlace =
  | { ok: true; dureeMin: number; maitres: string[] }
  | { ok: false; erreur: RefusDeLaPlace };

/** Une place proposée : un jour et une heure, jamais un maître. */
type PlaceDuServeur = { iso: string; heure: string };

/** LA FORME ET LA FENÊTRE, avant toute lecture : un appel mal formé ne coûte
    rien à la base. Jamais le jour même (la Maison prépare la venue), jamais
    au-delà de trois mois. */
function laPlaceEstRecevable(p: { date: string; time: string }, ms: number): RefusDeLaPlace | null {
  const m = /^(\d{2}):(\d{2})$/.exec(String(p.time ?? ''));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return 'creneau_invalide';
  const ecart = joursDEcart(String(p.date ?? ''), ms);
  if (Number.isNaN(ecart)) return 'creneau_invalide';
  if (ecart < 1 || ecart > FENETRE_DE_RESERVATION) return 'creneau_hors_fenetre';
  return null;
}

/** LES GESTES : tous connus et actifs, aucun qui exige une consultation
    (sauf la consultation elle-même), tous ouverts à la réservation en ligne. */
function lesGestesSeReservent(agenda: AgendaDuServeur, serviceIds: readonly string[]): RefusDeLaPlace | null {
  if (serviceIds.length === 0) return 'prestation_inconnue';
  const gestes = serviceIds.map((id) => agenda.services.find((s) => s.id === id));
  const connus = gestes.filter((s): s is PrestationDuServeur => !!s && s.enabled !== false && !s.archived);
  if (connus.length !== serviceIds.length) return 'prestation_inconnue';
  const cats = agenda.categories;
  if (connus.some((s) => !estUneConsultation(s, cats) && exigeConsultation(s, cats))) return 'consultation_requise';
  if (connus.some((s) => !reservableSurLeSite(s, cats, agenda.masques))) return 'prestation_retiree';
  return null;
}

/** LES MAÎTRES À ESSAYER, comme le site (`heuresLibres`) : celui que désigne
    une prestation s'il y en a un, sinon ceux de la Maison, sinon le libellé
    vide d'une branche qui n'en déclare aucun. */
function maitresDuRituel(agenda: AgendaDuServeur, serviceIds: readonly string[]): string[] {
  const designes = serviceIds
    .map((id) => agenda.services.find((s) => s.id === id)?.master)
    .filter((m): m is string => !!m);
  if (designes.length > 0) return [...new Set(designes)];
  return agenda.maitres.length > 0 ? [...agenda.maitres] : [''];
}

/** LA PLACE TIENT-ELLE ? Tout ce que le site montrait, revérifié sur
    l'instantané que la fonction vient de lire. Le verrou (`pose_si_libre`)
    rejoue le plafond, les fauteuils et les maîtres sous verrou. */
function laPlaceTient(agenda: AgendaDuServeur, p: DemandeDePlace, ms: number): VerdictDeLaPlace {
  const recevable = laPlaceEstRecevable(p, ms);
  if (recevable) return { ok: false, erreur: recevable };
  /* Sans semaine connue, le jour est fermé : mieux vaut un rappel qu'un
     lundi ouvert que la Maison ferme. */
  const fenetre = ouvertureDuJour(p.date, agenda.semaine, agenda.exceptions);
  if (fenetre.closed) return { ok: false, erreur: 'creneau_ferme' };
  const gestes = lesGestesSeReservent(agenda, p.serviceIds);
  if (gestes) return { ok: false, erreur: gestes };

  const dureeMin = dureeDesPrestations(p.serviceIds, agenda.services);
  const debut = minutesDeHhmm(p.time);
  const fin = debut + dureeMin;
  if (debut < fenetre.openMin || fin > fenetre.closeMin) return { ok: false, erreur: 'creneau_hors_ouverture' };

  const duJour = occupesDuJour(agenda.occupes, p.date);
  /* Le plafond de la Maison : ses rendez-vous du jour, tous maîtres confondus. */
  if (agenda.capMaison > 0 && duJour.length >= agenda.capMaison) return { ok: false, erreur: 'creneau_plafond' };
  /* LES FAUTEUILS : le maître peut être libre, la Maison pleine. */
  if (agenda.sieges > 0
    && duJour.filter((a) => debut < a.debutMin + a.dureeMin && fin > a.debutMin).length >= agenda.sieges) {
    return { ok: false, erreur: 'creneau_pris' };
  }

  /* LES MAÎTRES LIBRES, tous, dans l'ordre : jamais le premier sans regarder. */
  const candidats = maitresDuRituel(agenda, p.serviceIds);
  const libres: string[] = [];
  let plafonnes = 0;
  for (const m of candidats) {
    const siens = duJour.filter((a) => a.maitre === m);
    if (agenda.capMaitre > 0 && siens.length >= agenda.capMaitre) {
      plafonnes += 1;
      continue;
    }
    const occupe = [
      ...siens.map((a): [number, number] => [a.debutMin, a.debutMin + a.dureeMin]),
      ...plagesBloquees(agenda.murs, agenda.branchId, p.date, m),
    ].some(([s, e]) => debut < e && fin > s);
    if (!occupe) libres.push(m);
  }
  if (libres.length === 0) return { ok: false, erreur: plafonnes === candidats.length ? 'creneau_plafond' : 'creneau_pris' };
  return { ok: true, dureeMin, maitres: libres };
}

/** LES PLACES LIBRES, de demain (à Cotonou) à l'horizon, rangées dans le
    temps : les heures que le site montrerait, jour par jour (le même
    `creneauxLibres`, maître par maître, fauteuils, plafonds et murs compris).
    Des gestes qui ne se réservent pas en ligne n'ont aucune place. */
function placesLibres(
  agenda: AgendaDuServeur, serviceIds: readonly string[], ms: number, horizonJours = 14,
): PlaceDuServeur[] {
  if (lesGestesSeReservent(agenda, serviceIds)) return [];
  const voulu = Math.round(Number(horizonJours));
  const n = Math.max(1, Math.min(FENETRE_DE_RESERVATION, Number.isFinite(voulu) && voulu > 0 ? voulu : 14));
  const durationMin = dureeDesPrestations(serviceIds, agenda.services);
  const maitres = maitresDuRituel(agenda, serviceIds);
  const aujourdhui = jourDeCotonou(ms);
  const out: PlaceDuServeur[] = [];
  for (let i = 1; i <= n; i += 1) {
    const iso = isoApresJours(aujourdhui, i);
    const opening = ouvertureDuJour(iso, agenda.semaine, agenda.exceptions);
    if (opening.closed) continue;
    const occupes = occupesDuJour(agenda.occupes, iso);
    const heures = new Set<string>();
    for (const master of maitres) {
      const libres = creneauxLibres({
        opening,
        durationMin,
        occupes,
        bloques: plagesBloquees(agenda.murs, agenda.branchId, iso, master),
        master,
        capMaison: agenda.capMaison,
        capMaitre: agenda.capMaitre,
        capSimultane: agenda.sieges,
        maintenantMin: null,
      });
      for (const h of libres) heures.add(h);
    }
    for (const heure of [...heures].sort()) out.push({ iso, heure });
  }
  return out;
}
/* ⟨/place-du-serveur⟩ */

/* ⟨prochaines-places⟩ */
export const PLACES_PAR_JOUR = 2;
export function prochainesPlaces<H extends { heure: string }>(
  jours: readonly { iso: string; heures: readonly H[] }[],
  combien = 6,
): { iso: string; place: H }[] {
  const tries = [...jours].sort((x, y) => (x.iso < y.iso ? -1 : 1))
    .map((j) => ({ iso: j.iso, heures: [...j.heures].sort((x, y) => (x.heure < y.heure ? -1 : 1)) }));
  const cle = (iso: string, h: H) => `${iso} ${h.heure}`;
  const prises = new Set<string>();
  const out: { iso: string; place: H }[] = [];
  for (const j of tries) {
    if (out.length >= combien) break;
    const matin = j.heures[0];
    const apres = j.heures.find((h) => h.heure >= '13:00' && h !== matin) ?? j.heures[1];
    for (const h of [matin, apres].filter(Boolean).slice(0, PLACES_PAR_JOUR) as H[]) {
      if (out.length >= combien) break;
      out.push({ iso: j.iso, place: h });
      prises.add(cle(j.iso, h));
    }
  }
  for (const j of tries) {
    for (const h of j.heures) {
      if (out.length >= combien) break;
      if (!prises.has(cle(j.iso, h))) { out.push({ iso: j.iso, place: h }); prises.add(cle(j.iso, h)); }
    }
  }
  return out.sort((x, y) => (x.iso < y.iso ? -1 : x.iso > y.iso ? 1 : x.place.heure < y.place.heure ? -1 : 1));
}
/* ⟨/prochaines-places⟩ */

/* ══ MADAME NAFFI — 2 octobre 2026 ═════════════════════════════════════
   La Maison écrit « Madame Naffi » : la civilité de la fiche, puis le prénom.
   Une fiche qui ne dit rien est une dame ; une fiche au masculin d'avant ce
   jour est « Monsieur ». Recopié de `src/shared/civilite.ts` (une fonction
   Edge ne lit rien du dépôt) ; `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : '';
  const prenom = String(d?.name ?? repli ?? '').trim().split(/\s+/)[0] ?? '';
  /* La civilité inconnue ne se suppose plus (13 octobre 2026) : le prénom seul. */
  if (!civ) return prenom || 'Madame, Monsieur';
  const mot = civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
  return prenom ? `${mot} ${prenom}` : mot;
};

/* ⟨gestes-en-francais⟩ */
/* ── 9 bis. LES GESTES DITS EN FRANÇAIS (13 octobre 2026) ───────────────
   Les clientes ne lisent pas les marques fon : « SÍNSIN™ Essentiel » ne dit
   rien à qui ne connaît pas encore la Maison. Dans les listes, le français
   vient d'abord (« Resserrage · Essentiel »), la marque et la durée en
   dessous ; dans le récapitulatif, le français puis la marque entre
   parenthèses. Mots donnés par Yéman ; une marque absente d'ici garde son
   nom tel quel. */
const GESTES_EN_FRANCAIS: Record<string, { court: string; long: string }> = {
  'VÈKPÈ': { court: 'Création', long: 'Création de locks' },
  'SÍNSIN': { court: 'Resserrage', long: 'Resserrage des racines' },
  'FÍNFÍN': { court: 'Restauration', long: 'Restauration' },
  'YÈKPÈ': { court: 'Couleur', long: 'Couleur végétale' },
  'GBÀTÀ': { court: 'Défaisage', long: 'Défaisage' },
  'DÀNDÀN': { court: 'Hydratation', long: 'Hydratation' },
  'KLƆKLƆ': { court: 'Lavage', long: 'Lavage rituel' },
  'KÒKÒ': { court: 'Consultation', long: 'Consultation' },
  'GBÌGBÌ': { court: 'Reconstruction', long: 'Reconstruction' },
  'GBÈJÍ': { court: 'Entretien', long: 'Entretien suivi' },
  /* Les noms du catalogue, choisis par Yéman au sélecteur le 13 octobre 2026. */
  'VÍVÍVÓ': { court: 'Activateur', long: 'Activateur de pousse' },
  'WÈWÈ': { court: 'Purification', long: 'Purification' },
};

/** « SÍNSIN™ Essentiel · « Le Souffle » » : la marque « SÍNSIN », la
    variante « Essentiel » (le premier segment après la marque). Un nom sans
    niveau, « DÀNDÀN™ · Le Soin Hydratant », a pour variante son sous-titre,
    sans le point qui le précède (revue du 13 octobre 2026). */
const litLaMarqueWa = (nom: string): { marque: string; variante: string; sansNiveau: boolean } => {
  const s = String(nom ?? '').replace(/\s+/g, ' ').trim();
  const m = /^([^\s™®]+)(?:™|®)?\s*(.*)$/u.exec(s);
  const marque = (m?.[1] ?? '').normalize('NFC');
  const brutDuReste = m?.[2] ?? '';
  const reste = brutDuReste.replace(/^[·:–-]\s*/u, '');
  const variante = reste.split(' · ')[0]?.trim() ?? '';
  return { marque, variante, sansNiveau: /^[·:–-]/u.test(brutDuReste) };
};

/** Le geste en toutes lettres : « Resserrage des racines (SÍNSIN™
    Essentiel) » ; sans mot français, le nom tel quel. */
const gesteDitEnFrancaisWa = (nom: string): string => {
  const g = GESTES_EN_FRANCAIS[litLaMarqueWa(nom).marque];
  return g ? `${g.long} (${nom})` : nom;
};

/** LE NOM D'UN GESTE SUR UNE PAGE (13 octobre 2026) : « les visiteurs ne
    comprennent pas sinsin et kloklo, il faut commencer par le nom en
    français et ensuite le fon » (Yéman). `francais` d'abord, en titre :
    « Resserrage des racines · Essentiel », « Création de locks · Jumbo »,
    « Reconstruction · Cure de trois » ; `fon` dessous, le nom du catalogue
    entier. Sans mot français (une marque absente du dictionnaire, une
    combinaison « × GBÈJÍ™ »), le nom tel quel et rien dessous. */
const nomEnFrancaisWa = (nom: string): { francais: string; fon: string } => {
  const brut = String(nom ?? '').replace(/\s+/g, ' ').trim();
  const { marque } = litLaMarqueWa(brut);
  const g = GESTES_EN_FRANCAIS[marque];
  const m = /^([^\s™®]+)(?:™|®)?\s*(.*)$/u.exec(brut);
  const reste = (m?.[2] ?? '').trim();
  if (!g || /^[×+]/u.test(reste)) return { francais: brut, fon: '' };
  const sansNiveau = /^[·:–-]/u.test(reste);
  const morceaux = reste.replace(/^[·:–-]\s*/u, '').split(' · ').map((x) => x.trim()).filter(Boolean);
  const sienne = (t: string): boolean => {
    const b = t.toLowerCase();
    return b.includes(g.court.toLowerCase()) || b.includes(g.long.toLowerCase());
  };
  let francais = g.long;
  if (!sansNiveau && morceaux[0]) {
    let niveau = morceaux[0];
    /* « Création Jumbo » sous « Création de locks » : le mot du geste ne se
       redit pas, « Couleur » seul sous « Couleur végétale » non plus. */
    const court = g.court.toLowerCase();
    if (niveau.toLowerCase() === court || niveau.toLowerCase() === g.long.toLowerCase()) niveau = '';
    else if (niveau.toLowerCase().startsWith(`${court} `) && !/^[+×]/u.test(niveau.slice(court.length + 1))) niveau = niveau.slice(court.length + 1);
    if (niveau) francais = `${g.long} · ${niveau}`;
  } else if (sansNiveau && morceaux[0] && !sienne(morceaux[0])) {
    francais = `${g.long} · ${morceaux[0]}`;
  }
  return { francais, fon: brut };
};
/* ⟨/gestes-en-francais⟩ */

/* ⟨automate-wa⟩ */
/* ── 1. LE RÉGLAGE : éteint, essai, ouvert ─────────────────────────────
   Il vit dans `mnd_auto_config.automateWa`. ABSENT, il vaut REGLAGE_LIVRE :
   essai, liste vide, personne n'est servi. La base le remet en forme à
   chaque écriture (0125, `reglage_automate_net`) et le garde à la direction. */
type ModeDeLAutomate = 'eteint' | 'essai' | 'ouvert';
type ReglageDeLAutomate = {
  mode: ModeDeLAutomate;
  /** Les numéros servis en essai, réduits (chiffres, au format de Meta). */
  numerosEssai: string[];
  /** Jusqu'où vont les places proposées : de 7 à 30 jours, 14 par défaut. */
  horizonJours: number;
  /** La main de l'équipe tient le fil tant d'heures : de 1 à 72, 24 par défaut. */
  pauseHeures: number;
};
const REGLAGE_LIVRE: ReglageDeLAutomate = { mode: 'essai', numerosEssai: [], horizonJours: 14, pauseHeures: 24 };

const bornerWa = (v: unknown, min: number, max: number, defaut: number): number => {
  if (v === null || v === undefined || v === '') return defaut;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
};

function reglageDeLAutomate(brut: unknown): ReglageDeLAutomate {
  if (!brut || typeof brut !== 'object') return { ...REGLAGE_LIVRE, numerosEssai: [] };
  const r = brut as Record<string, unknown>;
  const mode: ModeDeLAutomate = r.mode === 'eteint' || r.mode === 'ouvert' || r.mode === 'essai' ? r.mode : 'essai';
  const bruts = Array.isArray(r.numerosEssai) ? r.numerosEssai : [];
  const numerosEssai = [...new Set(bruts.map((x) => String(x ?? '').replace(/\D/g, '')).filter((x) => x.length >= 8))].slice(0, 20);
  return {
    mode,
    numerosEssai,
    horizonJours: bornerWa(r.horizonJours, 7, 30, 14),
    pauseHeures: bornerWa(r.pauseHeures, 1, 72, 24),
  };
}

/** LA CLÉ D'UN NUMÉRO POUR LE COMPARER (13 octobre 2026). Meta identifie
    une Béninoise par son ancien numéro à huit chiffres (229 97 00 00 99)
    quand le Trône l'écrit au plan de 2024 (229 01 97 00 00 99) : le premier
    essai de Yéman est resté sans réponse, son numéro listé en Essai n'étant
    « pas le même ». Les deux formes se réduisent à la même clé. Rien d'autre
    ne change : les envois et les fils gardent le numéro tel que Meta le dit. */
function cleWa(brut: unknown): string {
  const d = String(brut ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('22901')) return `229${d.slice(5)}`;
  if (d.length === 10 && d.startsWith('01')) return `229${d.slice(2)}`;
  if (d.length === 8) return `229${d}`;
  return d;
}

type TiroirDuNumero = 'clientes' | 'equipe' | 'prestataires';

/** QUI EST SERVI. Éteint : personne. Essai : les numéros listés seulement,
    même rangés dans Équipe (la direction y est). Ouvert : le tiroir Clientes,
    et toujours les numéros listés. Les prestataires, jamais. */
function numeroServi(reglage: ReglageDeLAutomate, numero: string, tiroir: TiroirDuNumero | undefined): boolean {
  const n = cleWa(numero);
  if (!n || tiroir === 'prestataires' || reglage.mode === 'eteint') return false;
  if (reglage.numerosEssai.some((x) => cleWa(x) === n)) return true;
  return reglage.mode === 'ouvert' && (tiroir ?? 'clientes') === 'clientes';
}

/* ── 2. L'ÉTAT DU FIL ───────────────────────────────────────────────────
   Deux lignes par numéro dans `fils_automate`, pour que personne n'écrase
   l'autre : `fil-<numero>` (écrite par le serveur seul, `avance_le_fil`) et
   `main-<numero>` (la main de l'équipe, écrite par le Trône ou par
   `pause_le_fil`). */
type EtapeDuFil =
  | 'repos' | 'qui' | 'besoin' | 'meme' | 'rituel' | 'encore' | 'places' | 'jours'
  | 'civilite' | 'prenom' | 'recap' | 'confirme' | 'main' | 'clos'
  /* Le conseil (14 octobre 2026) : la liste des questions, puis une réponse. */
  | 'questions' | 'reponse';

type MotifDeLaMain =
  | 'demande' | 'ecarts' | 'prix' | 'media' | 'jour-meme' | 'autre-soin' | 'autre-personne'
  | 'sans-place' | 'plafond' | 'erreur' | 'envoi-refuse' | 'annulation' | 'question' | 'sante';

type CiviliteDuFil = 'madame' | 'mademoiselle' | 'monsieur';

type PlaceLibre = { iso: string; heure: string };

type PanierDuFil = {
  /** La fiche pour qui l'on réserve. Absente : une inconnue. */
  clientId?: string;
  /** Le prénom de la personne pour qui l'on réserve, quand ce n'est pas
      celle qui écrit (maman et enfant sur un même numéro). */
  pourQui?: string;
  besoin?: Besoin;
  serviceIds?: string[];
  /** Un jour de la semaine (« samedi ») ou une date (AAAA-MM-JJ, « demain »). */
  jourVoulu?: string;
  /** Le jour qu'elle écarte (« pas samedi », « samedi je ne peux pas ») :
      ses places ne sont plus proposées, tant qu'il en reste d'autres. */
  jourEvite?: string;
  moment?: 'matin' | 'apres-midi';
  /** Le jour touché dans « Un autre jour ». */
  jourChoisi?: string;
  /** Les rituels ou consultations proposés, dans l'ordre de la liste. */
  rituels?: string[][];
  /** Les rituels offerts au premier choix : « Ajouter un soin » y puise
      ceux qui restent (13 octobre 2026). */
  offerts?: string[][];
  /** Elle ajoute un soin : le prochain choix s'ajoute au panier au lieu
      de le remplacer. */
  enAjout?: boolean;
  /** Les messages de « un autre soin ? » et de sa liste : ils s'ajoutent
      au plafond, choisir trois soins ne mange pas la marge des détours. */
  horsPlafond?: number;
  /** La liste à l'écran est celle des soins (« Autre soin ») : son propre
      « Autre soin » passe la main (13 octobre 2026). */
  dansLesSoins?: boolean;
  /** Les places proposées, pour mémoire. */
  places?: PlaceLibre[];
  date?: string;
  time?: string;
  dureeMin?: number;
  civilite?: CiviliteDuFil;
  prenom?: string;
  /** L'étape du parcours où elle a posé sa question : « Continuer » l'y
      ramène (le conseil, 14 octobre 2026). */
  reprendre?: EtapeDuFil;
};

type EtatDuFil = {
  numero: string;
  /** Monte de un à chaque écriture : `avance_le_fil` n'écrit que si elle n'a
      pas bougé. Les identifiants des choix la portent. */
  version: number;
  etape: EtapeDuFil;
  /** Quand l'étape a commencé, et à quelle version : un choix d'un message
      plus ancien que l'étape est un vieux toucher. */
  depuis: string;
  versionDeLEtape: number;
  majLe: string;
  /** Quand l'automate a pris la parole (le bandeau « répond seule depuis »). */
  prisLe?: string;
  /** Les cinq derniers messages traités : une seconde livraison n'est jamais neuve. */
  traites: string[];
  dernierEntrantQuand?: string;
  panier: PanierDuFil;
  /** Les textes non compris à l'étape en cours (0, 1 ; au second, la main passe). */
  ecarts: number;
  /** Les instants des messages de l'automate, sur 24 heures glissantes. */
  envois: string[];
  rdvId?: string;
  mainPasseeLe?: string;
  motifMain?: MotifDeLaMain;
  /** L'étape où il en était quand la main est passée : « Rendre à
      l'automate » la reprend. */
  etapeAvantLaMain?: EtapeDuFil;
  versionAvantLaMain?: number;
};

type MainDuFil = {
  numero?: string;
  pauseLe?: string;
  jusqua?: string;
  motif?: string;
  rendueLe?: string;
  par?: string;
};

const MINUTE_WA = 60 * 1000;
const HEURE_WA = 60 * MINUTE_WA;
const JOUR_WA = 24 * HEURE_WA;
/** Dix messages de l'automate au plus par fil et par 24 heures. */
const PLAFOND_DE_L_AUTOMATE = 10;
/** Au deuxième texte non compris, la main passe. */
const ECARTS_AVANT_LA_MAIN = 2;
/** Sept places au plus dans la liste, plus « Un autre jour » et la Maison. */
const PLACES_PROPOSEES = 7;
/** Neuf jours au plus dans « Un autre jour », plus la Maison. */
const JOURS_PROPOSES = 9;
/** Un parcours sans nouvelle depuis 24 heures est abandonné. */
const PARCOURS_PERIME_MS = JOUR_WA;
/** Un message reçu il y a plus de 15 minutes (une relivraison après une
    panne) ne fait plus parler l'automate. */
const TOUR_PERIME_MS = 15 * MINUTE_WA;
/** Le temps d'un tour : un message de moins d'une minute sur un fil tenu
    n'allume pas l'alarme. */
const TOUR_EN_COURS_MS = MINUTE_WA;
/** LA MAISON A ÉCRIT à ce numéro depuis moins d'une semaine, de sa main ou
    par un de ses envois (un rappel, une reprise, une confirmation) : c'est
    elle qui mène cette conversation, et l'automate n'en fait jamais un
    parcours neuf (relecture du 9 octobre 2026). */
const LA_MAISON_A_PARLE_MS = 7 * JOUR_WA;

const ETAPES_EN_COURS: readonly EtapeDuFil[] = ['qui', 'besoin', 'meme', 'rituel', 'encore', 'places', 'jours', 'civilite', 'prenom', 'recap', 'questions', 'reponse'];

const ETAPE_DITE: Record<EtapeDuFil, string> = {
  repos: 'au repos',
  qui: 'pour qui',
  besoin: 'le besoin',
  meme: 'la même chose ?',
  rituel: 'le rituel',
  encore: 'un autre soin ?',
  places: "choix de l'heure",
  jours: 'choix du jour',
  civilite: 'la civilité',
  prenom: 'le prénom',
  recap: 'le récapitulatif',
  questions: 'les questions',
  reponse: 'une réponse de la Maison',
  confirme: 'rendez-vous posé',
  main: 'main passée',
  clos: 'parcours arrêté',
};

const MOTIF_DIT: Record<MotifDeLaMain, string> = {
  demande: 'a demandé la Maison',
  ecarts: 'deux réponses non comprises',
  prix: 'une question de prix',
  media: 'un vocal, une photo ou une pièce',
  'jour-meme': 'pour le jour même',
  'autre-soin': 'un autre soin',
  'autre-personne': 'pour une autre personne',
  'sans-place': 'aucune place libre',
  plafond: 'dix messages en 24 heures',
  erreur: 'la réservation a échoué',
  'envoi-refuse': 'un message refusé par Meta',
  annulation: 'une annulation ou un report',
  question: 'une question à lire',
  sante: 'le cuir chevelu, à regarder',
};

const msWa = (iso: string | undefined | null): number => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? t : NaN;
};

const isoWa = (ms: number): string => new Date(ms).toISOString();

function etatNeufDuFil(numero: string, maintenant: string): EtatDuFil {
  return {
    numero, version: 0, etape: 'repos', depuis: maintenant, versionDeLEtape: 0, majLe: maintenant,
    traites: [], panier: {}, ecarts: 0, envois: [],
  };
}

/** LA PAUSE DE L'ÉQUIPE : posée, pas encore échue, pas rendue depuis. */
function pauseActive(main: MainDuFil | null | undefined, maintenantMs: number): boolean {
  if (!main) return false;
  const pose = msWa(main.pauseLe);
  const fin = msWa(main.jusqua);
  if (!Number.isFinite(pose) || !Number.isFinite(fin) || fin <= maintenantMs) return false;
  const rendue = msWa(main.rendueLe);
  return !(Number.isFinite(rendue) && rendue >= pose);
}

/** L'ÉTAPE QUI VAUT MAINTENANT. Un parcours sans nouvelle depuis 24 heures
    retombe au repos ; une main passée tient `pauseHeures`, puis retombe au
    repos ; rendue à l'automate, elle reprend l'étape où il en était. */
function etapeCourante(
  etat: EtatDuFil | null | undefined, main: MainDuFil | null | undefined, maintenantMs: number, pauseHeures: number,
): EtapeDuFil {
  if (!etat) return 'repos';
  const maj = msWa(etat.majLe);
  if (etat.etape === 'main') {
    const le = msWa(etat.mainPasseeLe ?? etat.majLe);
    const rendue = msWa(main?.rendueLe);
    if (Number.isFinite(rendue) && Number.isFinite(le) && rendue >= le) {
      const avant = etat.etapeAvantLaMain;
      return avant && ETAPES_EN_COURS.includes(avant) && maintenantMs - rendue < PARCOURS_PERIME_MS ? avant : 'repos';
    }
    return Number.isFinite(le) && maintenantMs - le < pauseHeures * HEURE_WA ? 'main' : 'repos';
  }
  if (ETAPES_EN_COURS.includes(etat.etape)) {
    return Number.isFinite(maj) && maintenantMs - maj < PARCOURS_PERIME_MS ? etat.etape : 'repos';
  }
  if (etat.etape === 'confirme') {
    /* RENDU APRÈS UN RENDEZ-VOUS POSÉ (13 octobre 2026) : l'automate laisse
       la Maison répondre `pauseHeures` après la pose (un « merci », une
       question) ; l'équipe peut le lui rendre, il reprend au repos. Le
       second essai de Yéman est tombé là, sans bouton pour le lever. */
    const rendue = msWa(main?.rendueLe);
    if (Number.isFinite(rendue) && Number.isFinite(maj) && rendue >= maj) return 'repos';
    return Number.isFinite(maj) && maintenantMs - maj < pauseHeures * HEURE_WA ? 'confirme' : 'repos';
  }
  return 'repos';
}

/* ── 3. CE QUE L'ÉCRAN EN DIT ───────────────────────────────────────────
   `tenu` : l'automate mène le fil. `pause` : l'équipe a la main. `main` :
   l'automate a passé la main (pastille rouge, l'alarme sonne). `fini` : un
   rendez-vous posé ou un parcours arrêté, dernier mot traité. */
type TenueDuFil = 'tenu' | 'pause' | 'main' | 'fini' | 'aucun';

type VueDeLAutomate = {
  tenue: TenueDuFil;
  etape?: EtapeDuFil;
  /** Depuis quand l'automate mène ce parcours. */
  depuis?: string;
  motif?: MotifDeLaMain;
  rdvId?: string;
  /** Le panier, pour « Poser ce rendez-vous » pré-rempli. */
  panier?: PanierDuFil;
};

function tenuParLAutomate(
  fil: EtatDuFil | null | undefined, main: MainDuFil | null | undefined, maintenantMs: number, pauseHeures = REGLAGE_LIVRE.pauseHeures,
): TenueDuFil {
  if (pauseActive(main, maintenantMs)) return 'pause';
  if (!fil) return 'aucun';
  const etape = etapeCourante(fil, main, maintenantMs, pauseHeures);
  if (etape === 'main') return 'main';
  if (ETAPES_EN_COURS.includes(etape)) return 'tenu';
  if (etape === 'confirme') return 'fini';
  if (fil.etape === 'clos' && maintenantMs - msWa(fil.majLe) < PARCOURS_PERIME_MS) return 'fini';
  return 'aucun';
}

function vueDeLAutomate(
  fil: EtatDuFil | null | undefined, main: MainDuFil | null | undefined, maintenantMs: number, pauseHeures = REGLAGE_LIVRE.pauseHeures,
): VueDeLAutomate {
  const tenue = tenuParLAutomate(fil, main, maintenantMs, pauseHeures);
  if (!fil || tenue === 'aucun') return { tenue };
  return {
    tenue,
    etape: etapeCourante(fil, main, maintenantMs, pauseHeures),
    ...(fil.prisLe ? { depuis: fil.prisLe } : {}),
    ...(fil.motifMain && tenue === 'main' ? { motif: fil.motifMain } : {}),
    ...(fil.rdvId ? { rdvId: fil.rdvId } : {}),
    panier: fil.panier,
  };
}

/** L'AUTOMATE RÉPOND-IL POUR ELLE ? Un fil tenu ou fini dont l'automate a
    traité le dernier message n'attend pas la Maison ; un message de moins
    d'une minute sur un fil tenu non plus (le temps d'un tour). Une main
    passée, une pause, un mot après la confirmation : l'alarme sonne. */
function silenceDeLAlarme(
  tenue: TenueDuFil, fil: EtatDuFil | null | undefined, dernierEntrantQuand: string | undefined, maintenantMs: number,
): boolean {
  if (tenue !== 'tenu' && tenue !== 'fini') return false;
  if (!dernierEntrantQuand) return true;
  const elle = msWa(dernierEntrantQuand);
  const traite = msWa(fil?.dernierEntrantQuand);
  /* RENDUE À L'AUTOMATE APRÈS UNE MAIN PASSÉE (relecture du 9 octobre
     2026) : le mot qu'il a traité EN PASSANT LA MAIN (« Parler à la Maison »,
     une question de prix, une photo) n'a toujours pas eu de réponse. Seul un
     mot d'elle traité par un nouveau tour, ou une personne qui répond, éteint
     l'alarme. */
  if (fil?.etape === 'main' && Number.isFinite(elle) && Number.isFinite(traite) && elle <= traite) return false;
  if (Number.isFinite(elle) && Number.isFinite(traite) && elle <= traite) return true;
  return tenue === 'tenu' && Number.isFinite(elle) && maintenantMs - elle < TOUR_EN_COURS_MS;
}

/* ── 4. LES MOTS RECONNUS ───────────────────────────────────────────────
   Pas de modèle de langue : les jours, demain, matin, après-midi, annuler,
   aujourd'hui (la main passe) et le prix (la main passe, sans un mot). */
const sansAccentsWa = (t: string): string =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`´]/g, "'")
    .toLowerCase().replace(/\s+/g, ' ').trim();

const JOURS_LONGS_WA = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS_WA = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MOIS_LONGS_WA = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS_WA = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** L'instant à Cotonou (UTC+1, sans heure d'été) : le jour, la minute, le
    jour de la semaine. Le serveur tourne en UTC : entre 23 h et minuit UTC,
    c'est déjà le lendemain à Cotonou. */
function instantACotonou(ms: number): { iso: string; min: number; dow: number } {
  const d = new Date(ms + HEURE_WA);
  return { iso: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() };
}

const isoPlusJoursWa = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const dowDeIsoWa = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();

type MotsDuTour = {
  /** Aujourd'hui, ce soir, tout de suite : la main passe. */
  jourMeme: boolean;
  jourVoulu?: string;
  /** Le jour qu'elle écarte : « pas samedi », « samedi je ne peux pas ». */
  jourEvite?: string;
  moment?: 'matin' | 'apres-midi';
  annuler: boolean;
  /** Décaler, reporter, déplacer, changer d'heure : jamais fait seul. */
  deplacer: boolean;
  prix: boolean;
  retard: boolean;
  parleDUnRdv: boolean;
};

/** UNE NÉGATION AUTOUR DU MOT (relecture du 9 octobre 2026) : « pas
    samedi », « je ne peux pas venir samedi », « sauf samedi », « samedi
    c'est impossible », « samedi je ne peux pas ». Sans elle, « je ne peux pas
    samedi » se lisait comme une envie de samedi, et la même liste revenait
    sans fin. La phrase s'arrête à la ponctuation : « pas de souci, samedi »
    reste un oui. */
const nieLeMotWa = (t: string, debut: number, fin: number): boolean =>
  /\b(pas|sauf|ni|plutot que|autre que|hors)\s+(?:[^\s.,;!?]+\s+){0,2}$/.test(t.slice(Math.max(0, debut - 40), debut))
  || /^[^.?!,;]{0,30}?\b(impossible|pas possible|peux pas|pourrai pas|pourrais pas|suis pas|serai pas|ne m'?arrange pas|ne me convient pas|ne convient pas|pas dispo)/.test(t.slice(fin));

function motsReconnus(texte: string, maintenantMs: number): MotsDuTour {
  const t = ` ${sansAccentsWa(texte)} `;
  const aujourdhui = instantACotonou(maintenantMs).iso;
  let jourVoulu: string | undefined;
  let jourEvite: string | undefined;
  for (const j of t.matchAll(/apres[- ]?demain|\bdemain\b|\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g)) {
    const v = j[1] ?? isoPlusJoursWa(aujourdhui, /^apres/.test(j[0]) ? 2 : 1);
    const debut = j.index ?? 0;
    if (nieLeMotWa(t, debut, debut + j[0].length)) jourEvite = jourEvite ?? v;
    else jourVoulu = jourVoulu ?? v;
  }
  if (jourEvite && jourEvite === jourVoulu) jourEvite = undefined;
  const ditAujourdhui = /aujourd ?'? ?hui|\bce soir\b|tout de suite|\bce matin\b|\bcet apres[- ]?midi\b|tout a l'heure|\btantot\b/.test(t);
  let moment: 'matin' | 'apres-midi' | undefined;
  let momentEvite: 'matin' | 'apres-midi' | undefined;
  for (const m of t.matchAll(/apres[- ]?midi|\baprem\b|\bsoir(?:ee)?\b|\bmatin(?:ee)?\b/g)) {
    const v = /matin/.test(m[0]) ? 'matin' : 'apres-midi';
    const debut = m.index ?? 0;
    if (nieLeMotWa(t, debut, debut + m[0].length)) momentEvite = momentEvite ?? v;
    else moment = moment ?? v;
  }
  /* « Pas le matin » : l'après-midi, donc. */
  if (!moment && momentEvite) moment = momentEvite === 'matin' ? 'apres-midi' : 'matin';
  return {
    jourMeme: ditAujourdhui && !jourVoulu,
    ...(jourVoulu ? { jourVoulu } : {}),
    ...(jourEvite ? { jourEvite } : {}),
    ...(moment ? { moment } : {}),
    annuler: /\bannul/.test(t),
    deplacer: /\b(decal|report|deplac)/.test(t) || /\bchanger (de |mon |le |la |l'|d')?(rendez|rdv|heure|jour|date|creneau)/.test(t),
    prix: /\b(prix|combien|cout|coute|coutent|couter|tarif|tarifs|fcfa|cfa|montant)\b/.test(t),
    retard: /\bretard\b/.test(t),
    parleDUnRdv: /rendez[- ]?vous|\brdv\b/.test(t),
  };
}

/** UNE INTENTION DE RÉSERVER : prendre rendez-vous, réserver, une place, un
    créneau, « je voudrais passer samedi »… Jamais quand elle parle
    d'annuler, de décaler ou d'un retard : ce n'est pas réserver. */
function intentionDeReserver(texte: string): boolean {
  const t = sansAccentsWa(texte);
  if (!t) return false;
  if (/\b(annul|decal|report|deplac|retard)/.test(t)) return false;
  if (/rendez[- ]?vous|\brdv\b|\breserv|\bune place\b|\bdes places\b|\bcreneau|\bdisponib|\bdispo\b/.test(t)) return true;
  if (/\bje (voudrais|veux|souhaite|souhaiterais|aimerais|peux|pourrais|compte) (passer|venir)\b/.test(t)) return true;
  if (/\best[- ]ce que je (peux|pourrais) (passer|venir)\b/.test(t)) return true;
  if (/\bprendre (un |une )?(rendez|rdv|place|creneau)/.test(t)) return true;
  return /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain)\b/.test(t)
    && /\b(passer|venir|libre|possible)\b/.test(t);
}

/** ELLE PARLE D'UN RENDEZ-VOUS QU'ELLE A DÉJÀ (relecture du 9 octobre
    2026) : « je confirme mon rendez-vous de samedi », « j'ai réservé sur le
    site », « merci pour le rendez-vous d'hier », « je suis devant la porte »,
    « à quelle heure est mon rdv ? », « c'est bien noté ? », la réponse à un
    rappel. Le mot « rendez-vous » n'y est pas une envie de réserver : la
    Maison répond elle-même (« Mon rendez-vous » viendra en v2). */
function renvoieAUnRdv(texte: string): boolean {
  const t = sansAccentsWa(texte);
  if (!t) return false;
  return /\b(mon|ma|mes|notre|nos|son|sa|ses|ce|cet|cette|le|du|au) (prochain |dernier |premier )?(rendez[- ]?vous|rdv|reservation|resa)\b/.test(t)
    || /\bj'?ai (deja )?(reserve|pris)\b/.test(t)
    || /\bconfirm/.test(t)
    || /\bhier\b|\bdevant\b|\ben route\b|\bsur place\b|\bje suis (la|arrivee?)\b|\bj'?arrive\b/.test(t)
    || /\ba quelle heure\b|\btoujours\b|\bbien note\b|\bc'?est note\b|\brappel/.test(t);
}

/** UNE QUESTION QUI N'EST PAS DE RÉSERVER (relecture du 9 octobre 2026) :
    « je dois venir les cheveux lavés ? », « vous vendez le sérum ? ». Une
    question sur le jour ou le moment (« vous êtes ouverts samedi ? ») reste
    de la réservation. Celle-là demande une personne : l'automate ne l'avale
    jamais (au repos il se tait, en plein parcours la main passe). */
function uneQuestionAutre(texte: string, maintenantMs: number): boolean {
  const morceaux = String(texte ?? '').split('?');
  for (let i = 0; i < morceaux.length - 1; i += 1) {
    const phrase = morceaux[i].split(/[.!\n]/).pop() ?? '';
    if (!phrase.trim()) continue;
    const m = motsReconnus(phrase, maintenantMs);
    if (!intentionDeReserver(phrase) && !m.jourVoulu && !m.jourEvite && !m.moment && !m.jourMeme) return true;
  }
  return false;
}

/* ── 5. LE TOUR DE LA CLIENTE ───────────────────────────────────────────
   Les messages reçus et pas encore traités, joints : deux messages envoyés
   coup sur coup font UN tour. Un toucher d'un message de l'automate porte
   un identifiant « MND:<version>:<geste>[:<argument>] ». Les boutons des
   autres parcours (la reprise du J-3, le versement) et les formulaires ne
   sont pas à lui : ils n'entrent pas dans le tour. */
type MessageEntrantDuTour = {
  waId?: string;
  quand: string;
  texte?: string;
  type?: string;
  sens?: string;
  canal?: string;
  bouton?: { id?: string; texte?: string } | null;
  formulaire?: unknown;
};

type ChoixDuTour = { id: string; titre: string; waId: string };

type TourDeLaCliente = {
  waIds: string[];
  quand: string;
  texte: string;
  choix?: ChoixDuTour;
  media: boolean;
};

const MEDIAS_WA = ['image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts'];

function tourDeLaCliente(messages: readonly MessageEntrantDuTour[], traites: readonly string[] = []): TourDeLaCliente {
  const deja = new Set(traites);
  const quandDe = (m: MessageEntrantDuTour): number => { const q = msWa(m.quand); return Number.isFinite(q) ? q : 0; };
  const neufs = messages
    .filter((m) => (m.sens ?? 'entrant') === 'entrant' && m.canal !== 'site' && !!m.waId && !deja.has(m.waId))
    .filter((m) => !m.formulaire && !(m.bouton?.id && !m.bouton.id.startsWith('MND:')))
    .sort((a, b) => quandDe(a) - quandDe(b));
  let choix: ChoixDuTour | undefined;
  const textes: string[] = [];
  for (const m of neufs) {
    const id = m.bouton?.id;
    if (id) { choix = { id, titre: String(m.bouton?.texte ?? m.texte ?? ''), waId: String(m.waId) }; continue; }
    if (MEDIAS_WA.includes(m.type ?? '')) continue;
    const t = String(m.texte ?? '').trim();
    if (t) textes.push(t);
  }
  return {
    waIds: neufs.map((m) => String(m.waId)),
    quand: neufs.length > 0 ? neufs[neufs.length - 1].quand : '',
    texte: textes.join('\n'),
    ...(choix ? { choix } : {}),
    media: neufs.some((m) => MEDIAS_WA.includes(m.type ?? '')),
  };
}

const idDeChoix = (version: number, geste: string, argument?: string): string =>
  `MND:${version}:${geste}${argument ? `:${argument}` : ''}`;

function lisLeChoix(id: string | undefined): { version: number; geste: string; argument?: string } | null {
  const m = /^MND:(\d+):([a-z-]+)(?::(.+))?$/.exec(id ?? '');
  if (!m) return null;
  return { version: Number(m[1]), geste: m[2], ...(m[3] ? { argument: m[3] } : {}) };
}

/* ── 6. LES DATES, TOUJOURS AVEC L'ANNÉE ──────────────────────────────── */
function heureDite(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  const minutes = Number(m[2]);
  return minutes > 0 ? `${Number(m[1])} h ${m[2]}` : `${Number(m[1])} h`;
}

/** « samedi 17 octobre 2026 », « dimanche 1er novembre 2026 ». */
function jourDitAvecAnnee(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  const n = d.getUTCDate();
  return `${JOURS_LONGS_WA[d.getUTCDay()]} ${n === 1 ? '1er' : n} ${MOIS_LONGS_WA[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** LE TITRE D'UNE PLACE, 24 signes au plus (la limite de Meta), l'année
    dedans : « Sam. 17 oct. 2026 · 9 h », sinon « Sam. 17/10/2026 · 9 h 30 »,
    sinon « Sam. 17/10/2026 · 14h30 ». */
function titreDePlace(iso: string, hhmm: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return `${iso} ${hhmm}`.slice(0, 24);
  const j = JOURS_COURTS_WA[d.getUTCDay()];
  const n = d.getUTCDate();
  const a = `${j} ${n === 1 ? '1er' : n} ${MOIS_COURTS_WA[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${heureDite(hhmm)}`;
  if (a.length <= 24) return a;
  const date = `${String(n).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  const b = `${j} ${date} · ${heureDite(hhmm)}`;
  if (b.length <= 24) return b;
  return `${j} ${date} · ${hhmm.replace(':', 'h')}`;
}

/** « Samedi 17 oct. 2026 » : le titre d'un jour dans « Un autre jour ». */
function titreDuJour(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  const jour = JOURS_LONGS_WA[d.getUTCDay()];
  const n = d.getUTCDate();
  return `${jour.charAt(0).toUpperCase()}${jour.slice(1)} ${n === 1 ? '1er' : n} ${MOIS_COURTS_WA[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Hors du Bénin, l'heure se dit « heure de Cotonou ». */
const heureDeCotonouSiBesoin = (numero: string): string =>
  (String(numero ?? '').replace(/\D/g, '').startsWith('229') ? '' : ' (heure de Cotonou)');

/** QUAND LA MAISON RÉPOND ELLE-MÊME : `null` si elle est ouverte en ce
    moment, sinon « demain dès 9 h », « aujourd'hui dès 9 h » ou « lundi 12
    octobre 2026 dès 9 h ». Les heures sont celles de `mnd_settings.hours`,
    exceptions comprises. Sans semaine connue, on la dit ouverte : mieux vaut
    promettre une personne que d'inventer une heure. */
function prochaineOuvertureDite(
  maintenantMs: number, semaine: readonly HeureDeLaSemaine[], exceptions: readonly ExceptionDHoraire[],
): string | null {
  if (semaine.length === 0) return null;
  const ici = instantACotonou(maintenantMs);
  const ce = ouvertureDuJour(ici.iso, semaine, exceptions);
  if (!ce.closed && ici.min >= ce.openMin && ici.min < ce.closeMin) return null;
  for (let i = 0; i <= 14; i += 1) {
    const iso = isoPlusJoursWa(ici.iso, i);
    const f = ouvertureDuJour(iso, semaine, exceptions);
    if (f.closed) continue;
    if (i === 0 && ici.min >= f.openMin) continue;
    const h = heureDite(`${String(Math.floor(f.openMin / 60)).padStart(2, '0')}:${String(f.openMin % 60).padStart(2, '0')}`);
    const quand = i === 0 ? "aujourd'hui" : i === 1 ? 'demain' : jourDitAvecAnnee(iso);
    return `${quand} dès ${h}`;
  }
  return 'dès sa réouverture';
}

/* ── 7. CE QUE L'AUTOMATE ENVOIE ────────────────────────────────────────
   Trois formes, aux limites de Meta : un texte ; trois boutons au plus
   (titre de 20 signes) ; une liste de dix lignes au plus (titre de 24
   signes, description de 72, bouton de 20). Chaque message à choix porte
   « Parler à la Maison », la sortie que Meta exige, et le pied. */
const PIED = 'Réponse automatique · Parler à la Maison à tout moment';
/** La devise de la Maison, telle qu'elle s'écrit (DEVISE_COMPLETE,
    shared/identite) : elle signe la confirmation, et elle seule. */
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

type FormeDuMessage = 'texte' | 'boutons' | 'liste';

type MessageSortant = {
  forme: FormeDuMessage;
  /** L'étape que ce message ouvre ou rappelle : le fil du Trône la dit. */
  etape: EtapeDuFil;
  corps: string;
  pied?: string;
  boutons?: { id: string; titre: string }[];
  bouton?: string;
  lignes?: { id: string; titre: string; description?: string }[];
  /** Une réponse de la Maison (le conseil) : son identifiant, pour la trace
      et les compteurs du Trône. */
  reponseId?: string;
  /** Ses prix viennent du catalogue du jour, par jetons : le juge de la
      Maison les laisse passer, et eux seuls. */
  prixDuCatalogue?: boolean;
};

const coupeWa = (t: string, n: number): string => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
};

const prenomDuNomWa = (nom: string | undefined): string => String(nom ?? '').trim().split(/\s+/)[0] ?? '';

/** Les choix du message, tels qu'elle les lit : le fil du Trône les montre. */
function choixDuMessage(m: MessageSortant): string[] {
  if (m.forme === 'boutons') return (m.boutons ?? []).map((b) => b.titre);
  if (m.forme === 'liste') return (m.lignes ?? []).map((l) => l.titre);
  return [];
}

/** LA CHARGE POUR GRAPH, telle que Meta l'attend. */
function chargeGraph(m: MessageSortant, numero: string): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: numero };
  if (m.forme === 'texte') {
    return { ...base, type: 'text', text: { body: m.corps, preview_url: /https?:\/\//.test(m.corps) } };
  }
  const pied = m.pied ? { footer: { text: m.pied } } : {};
  if (m.forme === 'boutons') {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button', body: { text: m.corps }, ...pied,
        action: { buttons: (m.boutons ?? []).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titre } })) },
      },
    };
  }
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'list', body: { text: m.corps }, ...pied,
      action: {
        button: m.bouton ?? 'Choisir',
        sections: [{
          rows: (m.lignes ?? []).map((l) => ({ id: l.id, title: l.titre, ...(l.description ? { description: l.description } : {}) })),
        }],
      },
    },
  };
}

/** CE QUE META REFUSERAIT, avant de l'envoyer : une liste vide = conforme. */
function respecteMeta(m: MessageSortant): string[] {
  const fautes: string[] = [];
  const corpsMax = m.forme === 'boutons' ? 1024 : 4096;
  if (!m.corps.trim()) fautes.push('corps vide');
  if (m.corps.length > corpsMax) fautes.push(`corps de ${m.corps.length} signes (${corpsMax} au plus)`);
  if (m.pied && m.pied.length > 60) fautes.push(`pied de ${m.pied.length} signes (60 au plus)`);
  if (m.forme === 'boutons') {
    const b = m.boutons ?? [];
    if (b.length < 1 || b.length > 3) fautes.push(`${b.length} boutons (de 1 à 3)`);
    for (const x of b) {
      if (!x.titre || x.titre.length > 20) fautes.push(`bouton « ${x.titre} » : titre de 1 à 20 signes`);
      if (!x.id || x.id.length > 256) fautes.push(`bouton « ${x.titre} » : identifiant de 1 à 256 signes`);
    }
    if (new Set(b.map((x) => x.titre)).size !== b.length) fautes.push('deux boutons au même titre');
    if (new Set(b.map((x) => x.id)).size !== b.length) fautes.push('deux boutons au même identifiant');
    if (!b.some((x) => lisLeChoix(x.id)?.geste === 'maison')) fautes.push('pas de sortie « Parler à la Maison »');
  }
  if (m.forme === 'liste') {
    const l = m.lignes ?? [];
    if (l.length < 1 || l.length > 10) fautes.push(`${l.length} lignes (de 1 à 10)`);
    if (!m.bouton || m.bouton.length > 20) fautes.push('bouton de la liste : de 1 à 20 signes');
    for (const x of l) {
      if (!x.titre || x.titre.length > 24) fautes.push(`ligne « ${x.titre} » : titre de 1 à 24 signes`);
      if (x.description && x.description.length > 72) fautes.push(`ligne « ${x.titre} » : description de ${x.description.length} signes (72 au plus)`);
      if (!x.id || x.id.length > 200) fautes.push(`ligne « ${x.titre} » : identifiant de 1 à 200 signes`);
    }
    if (new Set(l.map((x) => x.id)).size !== l.length) fautes.push('deux lignes au même identifiant');
    if (!l.some((x) => lisLeChoix(x.id)?.geste === 'maison')) fautes.push('pas de sortie « Parler à la Maison »');
  }
  return fautes;
}

/** CE QUE LA MAISON N'ÉCRIT JAMAIS À UNE CLIENTE : le mot qu'elle a banni
    (la Maison, jamais le « s-a-l-o-n »), le tiret cadratin, un prix. Une
    liste vide = sain. Les deux premiers s'écrivent ici sans leur forme
    littérale, pour qu'une recherche dans les textes du bloc ne trouve que
    les vraies fautes. */
function texteSain(t: string, prixPermis = false): string[] {
  const fautes: string[] = [];
  const s = String(t ?? '');
  if (/sal(?:on)/i.test(s)) fautes.push('le mot banni (s-a-l-o-n)');
  if (s.includes(String.fromCharCode(0x2014))) fautes.push('un tiret cadratin');
  /* L'UNITÉ ENTIÈRE, suivie d'autre chose qu'une lettre (relecture du 9
     octobre 2026) : sans le drapeau u, « \b » passait entre le f et le é, et
     « 5 février 2026 » se lisait comme un prix. */
  if (!prixPermis && /\d[\d\s.,]*\s?(fcfa|cfa|xof|francs?|f)(?![\p{L}])/iu.test(s)) fautes.push('un prix');
  return fautes;
}

/* ── 7 bis. LE CONSEIL : LES RÉPONSES DE LA MAISON · 14 octobre 2026 ────
   Maquette « Prendre RDV & Conseil Locks » (MwRLSQ3e…), cinq choix de la
   direction : sans modèle de langue ; les prix comme le site, plus un
   « à partir de » pour une création ; les photos du registre (plus tard) ;
   des brouillons préparés, validés par la direction ; un onglet des
   Conversations.

   CE QUE L'AUTOMATE ENVOIE EST LE TEXTE VALIDÉ, MOT POUR MOT. Il ne
   rédige rien : il reconnaît une question à ses mots, et envoie la réponse
   que la direction a validée. Un brouillon ne part jamais.

   LES PRIX S'ÉCRIVENT EN JETONS, « {prix:sv-koko-ori} » : l'automate les
   remplace par le prix du catalogue du jour. Un prix tapé à la main
   vieillirait le jour où la carte change (le 1er janvier 2027) : le juge le
   refuse. Un jeton introuvable (une prestation retirée, un prix masqué, un
   devis) retient la réponse, et la Maison répond elle-même.

   LE CUIR CHEVELU NE SE SOIGNE PAS À DISTANCE : une démangeaison, une
   plaque, une chute par endroits, et la Maison le dit, propose la
   consultation, nomme le médecin, et passe la main. Aucun produit.

   SANS RÉPONSE VALIDÉE, RIEN NE CHANGE : l'automate se conduit comme avant
   le conseil, mot pour mot (le banc le rejoue). */
type EtatDeLaReponse = 'brouillon' | 'validee';
type ReponseDeLaMaison = {
  id: string;
  /** Le titre de la ligne dans la liste de WhatsApp : 24 signes au plus. */
  titre: string;
  /** La ligne grise sous le titre : 72 signes au plus. */
  description?: string;
  /** Les mots qui la reconnaissent, sans accents ni majuscules. */
  mots: string[];
  /** Ce que la Maison répond, 900 signes au plus, prix en jetons. */
  texte: string;
  etat: EtatDeLaReponse;
  /** Où mène « Réserver » sous la réponse : un parcours, ou le menu. */
  mene?: Besoin;
  ordre: number;
  valideeLe?: string;
  valideePar?: string;
};
type ConseilDeLaMaison = { reponses: ReponseDeLaMaison[]; motsSante: string[] };

/** LES MOTS DU CUIR CHEVELU, quand la direction n'en a pas écrit d'autres. */
const MOTS_SANTE_LIVRES: readonly string[] = [
  'gratte', 'grattent', 'demange', 'demangent', 'demangeaison', 'plaque', 'plaie', 'croute', 'rougeur',
  'chute', 'tombent', 'perds mes cheveux', 'trou', 'teigne', 'saigne', 'douleur', 'douloureux', 'brule',
  'brulure', 'infection', 'pus', 'irrite', 'irritation',
];
const TEXTE_DE_REPONSE_MAX = 900;
const BESOINS_DU_CONSEIL: readonly Besoin[] = ['entretien', 'creation', 'reparation', 'enfant'];
const JETON_DE_PRIX = /\{prix:([^}]{1,80})\}/g;

const echappeWa = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** LE CONSEIL TEL QUE LA BASE LE REND, remis en forme : une réponse sans
    identifiant propre ou en double tombe ; les mots se lisent sans accents. */
function conseilDeLaMaison(brut: unknown): ConseilDeLaMaison {
  const b = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const reponses: ReponseDeLaMaison[] = [];
  const vus = new Set<string>();
  for (const x of Array.isArray(b.reponses) ? b.reponses : []) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const id = String(r.id ?? '').trim();
    if (!/^[a-z0-9-]{1,60}$/.test(id) || vus.has(id)) continue;
    vus.add(id);
    const description = String(r.description ?? '').trim();
    const mene = BESOINS_DU_CONSEIL.includes(r.mene as Besoin) ? (r.mene as Besoin) : undefined;
    const ordre = Number(r.ordre);
    reponses.push({
      id,
      titre: String(r.titre ?? '').trim(),
      ...(description ? { description } : {}),
      mots: [...new Set((Array.isArray(r.mots) ? r.mots : []).map((m) => sansAccentsWa(String(m ?? ''))).filter((m) => m.length >= 2))].slice(0, 40),
      texte: String(r.texte ?? '').trim(),
      etat: r.etat === 'validee' ? 'validee' : 'brouillon',
      ...(mene ? { mene } : {}),
      ordre: Number.isFinite(ordre) ? ordre : 999,
      ...(typeof r.valideeLe === 'string' ? { valideeLe: r.valideeLe } : {}),
      ...(typeof r.valideePar === 'string' ? { valideePar: r.valideePar } : {}),
    });
  }
  const sante = [...new Set((Array.isArray(b.motsSante) ? b.motsSante : []).map((m) => sansAccentsWa(String(m ?? ''))).filter((m) => m.length >= 3))];
  return { reponses, motsSante: sante.length > 0 ? sante : [...MOTS_SANTE_LIVRES] };
}

/** LE CONSEIL PARLE dès qu'une réponse est validée. Sans elle, l'automate
    se conduit exactement comme avant le conseil. */
const conseilActif = (c: ConseilDeLaMaison | undefined): boolean => !!c && c.reponses.some((r) => r.etat === 'validee');

/** LES PRIX DU CATALOGUE DU JOUR, par identifiant et par code : un prix
    positif, ni masqué, ni sur devis. Les lignes telles que la base les rend. */
function prixDuCatalogue(lignes: readonly { id: string; data?: Record<string, unknown> | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lignes) {
    const d = (l?.data ?? {}) as Record<string, unknown>;
    const p = Math.round(Number(d.priceXof));
    if (!Number.isFinite(p) || p <= 0 || d.hidePrice === true || d.priceMode === 'devis' || d.archived === true) continue;
    out[l.id] = p;
    if (typeof d.code === 'string' && d.code.trim()) out[d.code.trim()] = p;
  }
  return out;
}

/** « 135 000 F » : une espace simple entre les milliers, partout pareil. */
const prixDitWa = (n: number): string => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

/** CE QUI EMPÊCHE UNE RÉPONSE DE PARTIR. Une liste vide = elle peut partir
    (si elle est validée). Sans `prix`, les jetons ne se vérifient pas. */
function fautesDeLaReponse(r: ReponseDeLaMaison, prix?: Readonly<Record<string, number>>): string[] {
  const f: string[] = [];
  if (!r.titre || r.titre.length > 24) f.push('un titre de 1 à 24 signes');
  if (r.description && r.description.length > 72) f.push('une ligne grise de 72 signes au plus');
  if (!r.texte) f.push('le texte de la réponse');
  if (r.texte.length > TEXTE_DE_REPONSE_MAX) f.push(`un texte de ${TEXTE_DE_REPONSE_MAX} signes au plus`);
  if (r.mots.length === 0) f.push('au moins un mot pour la reconnaître');
  const sansJetons = r.texte.replace(JETON_DE_PRIX, '');
  for (const x of texteSain(sansJetons)) f.push(x === 'un prix' ? 'un prix écrit à la main (insérez-le depuis le catalogue)' : x);
  if (/[{}]/.test(sansJetons)) f.push('une accolade qui n’est pas un prix');
  if (prix) {
    for (const m of r.texte.matchAll(JETON_DE_PRIX)) {
      const ref = m[1].trim();
      if (!((prix[ref] ?? 0) > 0)) f.push(`un prix introuvable au catalogue (${ref})`);
    }
  }
  return f;
}

/** LE TEXTE QUI PART : validée, sans faute, chaque jeton remplacé par le prix
    du jour. `null` sinon : elle ne part pas. */
function texteDeLaReponse(r: ReponseDeLaMaison, prix?: Readonly<Record<string, number>>): string | null {
  if (r.etat !== 'validee') return null;
  const aDesJetons = /\{prix:/.test(r.texte);
  if (aDesJetons && !prix) return null;
  if (fautesDeLaReponse(r, prix).length > 0) return null;
  return r.texte.replace(JETON_DE_PRIX, (_t, ref: string) => prixDitWa((prix ?? {})[ref.trim()] ?? 0));
}

/** LES RÉPONSES QUI PEUVENT PARTIR, dans l'ordre de la direction. */
function reponsesEnvoyables(
  conseil: ConseilDeLaMaison | undefined, prix: Readonly<Record<string, number>> | undefined,
): { r: ReponseDeLaMaison; texte: string }[] {
  const out: { r: ReponseDeLaMaison; texte: string }[] = [];
  for (const r of conseil?.reponses ?? []) {
    const texte = texteDeLaReponse(r, prix);
    if (texte) out.push({ r, texte });
  }
  return out.sort((a, b) => a.r.ordre - b.r.ordre || a.r.titre.localeCompare(b.r.titre, 'fr'));
}

/** CE QUE LE CONSEIL LIT DANS UN TEXTE : le cuir chevelu, et les réponses
    validées dont elle a dit le plus de mots (toutes, à égalité). Un mot se
    lit entier, au pluriel aussi (« plaques », « cheveux »). */
function lisLeConseil(texte: string, conseil: ConseilDeLaMaison | undefined): { sante: boolean; ids: string[] } {
  if (!conseilActif(conseil)) return { sante: false, ids: [] };
  const t = ` ${sansAccentsWa(texte).replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ')} `;
  const dit = (mot: string): boolean => new RegExp(`(^|[^a-z0-9])${echappeWa(mot)}(s|x)?(?=[^a-z0-9]|$)`).test(t);
  const sante = conseil!.motsSante.some(dit);
  const scores = conseil!.reponses
    .filter((r) => r.etat === 'validee')
    .map((r) => ({ id: r.id, n: r.mots.filter(dit).length }))
    .filter((x) => x.n > 0);
  const max = scores.reduce((m, x) => Math.max(m, x.n), 0);
  return { sante, ids: max > 0 ? scores.filter((x) => x.n === max).map((x) => x.id) : [] };
}

/** LE CONSEIL A-T-IL QUELQUE CHOSE À DIRE à ce texte ? */
const leConseilParle = (texte: string, conseil: ConseilDeLaMaison | undefined): boolean => {
  const lu = lisLeConseil(texte, conseil);
  return lu.sante || lu.ids.length > 0;
};

/* ── 8. LA PORTE DU TOUR ────────────────────────────────────────────────── */
type FicheDuNumero = {
  id: string;
  nom: string;
  civilite?: CiviliteDuFil;
  auMasculin?: boolean;
  branchId?: string;
  familyId?: string;
  naissance?: string;
  /** Trouvée par son premier numéro : c'est elle qui écrit, d'ordinaire. */
  parPhone: boolean;
  /** Trouvée par sa famille, sans numéro à elle (un enfant). */
  parFamille?: boolean;
  numeros?: string[];
  /** Sa dernière venue honorée (fiches_du_numero, 0125). */
  derniereVenue?: { date: string; serviceIds: string[] };
  /** Son prochain rendez-vous, confirmé ou en attente, d'aujourd'hui ou
      plus tard (fiches_du_numero, 0125) : elle en a déjà un, la Maison
      répond elle-même. */
  prochainRdv?: { date: string; time?: string };
};

type PrestationDuTour = {
  id: string;
  name: string;
  categoryId: string;
  priceMode?: PriceMode;
  hidePrice?: boolean;
  consultationAvant?: boolean;
  durationMin?: number;
  /** Ouverte à la réservation en ligne, au jugement du serveur (la règle du
      site : non masquée, et une consultation ou un atelier réservable). */
  reservable: boolean;
};

type AgendaDuTour = {
  branchId: string;
  prestations: readonly PrestationDuTour[];
  categories: { id: string; parentId?: string }[];
  /** Les formules rapides de la Maison (`mnd_vitrine_config.formulesRapides`). */
  formules: readonly { serviceIds: readonly string[] }[];
  /** La consultation de chaque parcours (creation, reparation, enfant). */
  consultationParParcours?: Partial<Record<Besoin, string>>;
  semaine: readonly HeureDeLaSemaine[];
  exceptions: readonly ExceptionDHoraire[];
  /** LES PLACES LIBRES de J+1 à l'horizon pour ces gestes, rangées dans le
      temps, calculées par le serveur sur l'instantané du tour (fauteuils,
      plafonds, murs et maîtres compris). Ni l'écran ni la cliente ne les
      calculent. */
  places: (serviceIds: readonly string[]) => readonly PlaceLibre[];
};

type ContexteLeger = {
  maintenantMs: number;
  /** Le numéro réduit, au format de Meta. */
  numero: string;
  tiroir?: TiroirDuNumero;
  reglage: ReglageDeLAutomate;
  fiches: readonly FicheDuNumero[];
  /** Aucun message de ce numéro avant ce tour. */
  premierMessage: boolean;
  main?: MainDuFil | null;
  /** L'instant du dernier message que la Maison a écrit à ce numéro, de sa
      main ou par un de ses envois (jamais un message de l'automate). */
  derniereParoleDeLaMaison?: string;
  /** Les réponses de la Maison (`mnd_reponses_maison`, le conseil). */
  conseil?: ConseilDeLaMaison;
};

type ContexteDuTour = ContexteLeger & {
  /** `carte` : le lien Google Maps de la branche ou des Paramètres. */
  maison: { nom: string; itineraire?: string; carte?: string };
  agenda?: AgendaDuTour;
  /** Les prix du catalogue du jour (`prixDuCatalogue`), pour les jetons du conseil. */
  prix?: Readonly<Record<string, number>>;
};

type ParoleDuTour = 'silence' | 'main-silencieuse' | 'parle';

/** MINEURE, d'après sa date de naissance (AAAA-MM-JJ) : moins de dix-huit
    ans ce jour-là. Sans date lisible, on ne présume rien. */
function mineureWa(naissance: string | undefined, aujourdhuiIso: string): boolean {
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(naissance ?? '');
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(aujourdhuiIso ?? '');
  if (!n || !a) return false;
  const age = Number(a[1]) - Number(n[1]) - (`${a[2]}-${a[3]}` < `${n[2]}-${n[3]}` ? 1 : 0);
  return age < 18;
}

/** LES FICHES QUE L'AUTOMATE PEUT SERVIR (relecture du 9 octobre 2026). En
    ESSAI, seules celles dont ce numéro est le PREMIER (`phone`) : le numéro
    d'essai de la direction, rangé en second numéro d'une proche ou trouvé
    par sa famille, ne doit jamais faire poser un rendez-vous d'essai
    CONFIRMÉ sur la fiche d'une vraie cliente (sa confirmation, son rappel). */
function fichesServies(ctx: Pick<ContexteLeger, 'reglage' | 'fiches'>): readonly FicheDuNumero[] {
  return ctx.reglage.mode === 'essai' ? ctx.fiches.filter((f) => f.parPhone) : ctx.fiches;
}

/** CELLE QUI ÉCRIT, quand on la sait : la seule fiche ADULTE dont ce numéro
    est le premier (relecture du 9 octobre 2026). Trouvée par son second
    numéro (un mari, une sœur), mineure (le numéro de sa maman), ou à
    plusieurs sur le même premier numéro : on ne sait pas qui écrit. On le
    lui demande (« Pour qui ? »), et rien de personne, ni son nom dans le
    salut ni sa dernière venue, n'est dit avant son choix. */
function titulaireDuNumero(fiches: readonly FicheDuNumero[], aujourdhuiIso: string): FicheDuNumero | undefined {
  const adultes = fiches.filter((f) => f.parPhone && !mineureWa(f.naissance, aujourdhuiIso));
  return adultes.length === 1 ? adultes[0] : undefined;
}

/** LA MAISON MÈNE DÉJÀ CETTE CONVERSATION : elle a écrit à ce numéro depuis
    moins d'une semaine (`LA_MAISON_A_PARLE_MS`), et personne ne l'a rendue à
    l'automate depuis. */
function laMaisonAParle(ctx: Pick<ContexteLeger, 'maintenantMs' | 'main' | 'derniereParoleDeLaMaison'>): boolean {
  const le = msWa(ctx.derniereParoleDeLaMaison);
  if (!Number.isFinite(le) || ctx.maintenantMs - le >= LA_MAISON_A_PARLE_MS) return false;
  const rendue = msWa(ctx.main?.rendueLe);
  return !(Number.isFinite(rendue) && rendue >= le);
}

/** LE TOUCHER « JE CONFIRME » DU RÉCAPITULATIF EN COURS (relecture du 9
    octobre 2026) : il pose le rendez-vous même au-delà du plafond. Elle a
    confirmé : elle ne doit jamais rester sans rien. */
function confirmeValide(etat: EtatDuFil | null | undefined, tour: TourDeLaCliente, courante: EtapeDuFil): boolean {
  const ch = lisLeChoix(tour.choix?.id);
  if (!etat || courante !== 'recap' || ch?.geste !== 'oui') return false;
  const depuis = etat.etape === courante ? etat.versionDeLEtape : (etat.versionAvantLaMain ?? etat.versionDeLEtape);
  return ch.version >= (depuis ?? 0) && ch.version <= etat.version;
}

/** QUI PARLE, AVANT DE LIRE L'AGENDA. `silence` : l'automate ne dit rien et
    n'écrit rien, l'équipe répond comme aujourd'hui. `main-silencieuse` : il
    passe la main sans un mot (un prix, un vocal, une photo, le plafond).
    `parle` : il répond. */
/** LES MESSAGES QUI COMPTENT POUR LE PLAFOND : ceux des dernières 24
    heures, depuis que l'équipe a rendu le fil (13 octobre 2026). Sans quoi
    un fil rendu après un plafond ou après une pose se taisait aussitôt. */
function envoisQuiComptent(envois: readonly string[], main: MainDuFil | null | undefined, ms: number): number {
  const rendue = msWa(main?.rendueLe);
  return envois.filter((e) => {
    const t = msWa(e);
    return ms - t < JOUR_WA && !(Number.isFinite(rendue) && t <= rendue);
  }).length;
}

/** LE PLAFOND DU FIL : dix messages, plus ceux de « un autre soin ? », de
    sa liste et de la liste des soins (six au plus, 13 octobre 2026). */
function plafondDuFil(etat: EtatDuFil | null | undefined): number {
  return PLAFOND_DE_L_AUTOMATE + Math.min(6, Math.max(0, etat?.panier?.horsPlafond ?? 0));
}

function jugeLaParole(
  etat: EtatDuFil | null | undefined, tour: TourDeLaCliente, ctx: ContexteLeger,
): { parole: ParoleDuTour; motif?: MotifDeLaMain } {
  const ms = ctx.maintenantMs;
  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir)) return { parole: 'silence' };
  if (pauseActive(ctx.main, ms)) return { parole: 'silence' };
  if (tour.waIds.length === 0) return { parole: 'silence' };
  const quand = msWa(tour.quand);
  if (Number.isFinite(quand) && ms - quand > TOUR_PERIME_MS) return { parole: 'silence' };
  const courante = etapeCourante(etat, ctx.main, ms, ctx.reglage.pauseHeures);
  if (courante === 'main' || courante === 'confirme') return { parole: 'silence' };
  const mots = motsReconnus(tour.texte, ms);
  const fiches = fichesServies(ctx);
  let parle = false;
  if (ETAPES_EN_COURS.includes(courante)) {
    if (tour.media) return { parole: 'main-silencieuse', motif: 'media' };
    /* Une question de prix en plein parcours : la réponse validée si le
       conseil en a une, sinon la main passe, comme avant (14 octobre 2026). */
    if (mots.prix && !leConseilParle(tour.texte, ctx.conseil)) return { parole: 'main-silencieuse', motif: 'prix' };
    parle = true;
  } else if (tour.choix && lisLeChoix(tour.choix.id)) {
    parle = true;
  } else if (tour.media || mots.retard) {
    parle = false;
    /* LA RÈGLE DES SEPT JOURS EST LEVÉE · 14 octobre 2026, décision de la
       direction : « I need the automation to take the lead all the time ».
       Un rappel, une reprise, une confirmation ou un message de l'équipe ne
       font plus taire l'automate une semaine. Ce qui reste : la main de
       l'équipe quand une personne écrit (la pause, `pauseHeures`), un
       rendez-vous qu'elle a déjà, et les questions qu'il ne sait pas. */
  } else if (mots.deplacer || mots.annuler) {
    /* Un prix dans la même phrase : la Maison le lit elle-même, comme avant. */
    parle = !mots.prix;
  } else if (renvoieAUnRdv(tour.texte)) {
    /* ELLE PARLE D'UN RENDEZ-VOUS QU'ELLE A DÉJÀ (« je confirme », « à quelle
       heure ? ») : l'automate ne sait ni le confirmer ni le déplacer, la
       Maison répond elle-même. Depuis le 14 octobre 2026 (« le faire
       répondre »), il répond si le conseil reconnaît une question dans son
       message ; et un rendez-vous à venir sur sa fiche ne le fait plus
       taire : elle peut en réserver un autre. */
    parle = leConseilParle(tour.texte, ctx.conseil);
  } else if (leConseilParle(tour.texte, ctx.conseil)) {
    /* LE CONSEIL (14 octobre 2026) : une question qu'une réponse validée
       reconnaît, ou le cuir chevelu qui inquiète. */
    parle = true;
  } else if (mots.prix) {
    parle = false;
  } else if (uneQuestionAutre(tour.texte, ms)) {
    /* Une question que la Maison n'a pas écrite : avec le conseil, la nuit,
       un accusé (« la Maison vous répond demain dès 9 h ») ; le jour, la
       Maison la lit elle-même, comme avant. */
    parle = conseilActif(ctx.conseil);
  } else if (intentionDeReserver(tour.texte)) {
    parle = true;
  } else if (ctx.premierMessage && fiches.length === 0) {
    parle = true;
  }
  if (!parle) return { parole: 'silence' };
  const envois = envoisQuiComptent(etat?.envois ?? [], ctx.main, ms);
  if (envois >= plafondDuFil(etat) && !confirmeValide(etat, tour, courante)) return { parole: 'main-silencieuse', motif: 'plafond' };
  return { parole: 'parle' };
}

const quiParle = (etat: EtatDuFil | null | undefined, tour: TourDeLaCliente, ctx: ContexteLeger): ParoleDuTour =>
  jugeLaParole(etat, tour, ctx).parole;

/* ── 9. CE QUE LE TOUR ÉCRIT ────────────────────────────────────────────
   Au « Je confirme » seulement : le rendez-vous, la demande (une inconnue)
   et la ligne d'envoi, posés ensemble par `pose_si_libre` sous verrou.
   Leurs identifiants viennent du message « Je confirme » : une seconde
   livraison ne crée rien. */
type RdvAPoser = {
  id: string;
  branchId: string;
  clientId: string;
  clientName: string;
  serviceIds: string[];
  date: string;
  time: string;
  dureeMin: number;
  status: 'confirmé';
  source: 'whatsapp';
  creeLe: string;
  note: string;
};

type DemandeAPoser = {
  id: string;
  genre: 'rdv';
  createdAt: string;
  branchId: string;
  prenom: string;
  civilite: CiviliteDuFil;
  telephone: string;
  besoin: Besoin;
  source: 'whatsapp';
  serviceIds: string[];
  date: string;
  time: string;
  apptId: string;
  consentementLe: string;
  statut: 'nouvelle';
};

type EnvoiAPoser = {
  id: string;
  branchId: string;
  type: 'confirmation';
  canal: 'whatsapp';
  apptId: string;
  clientId?: string;
  prenom: string;
  numero: string;
  dateRdv: string;
  heure: string;
  moment: string;
  statut: 'en cours';
  detail: string;
  quand: string;
};

type EcritureDuTour = { genre: 'pose'; rdv: RdvAPoser; demande?: DemandeAPoser; envoi: EnvoiAPoser };

type AlerteDeLAutomate = { titre: string; corps: string; url: string };

type SortieDuTour = {
  messages: MessageSortant[];
  etat: EtatDuFil;
  ecritures: EcritureDuTour[];
  /** L'automate a pris ce tour : le webhook n'envoie pas sa notification
      habituelle (l'automate rend la sienne, `alerte`). */
  pris: boolean;
  alerte?: AlerteDeLAutomate;
};

/** Le verdict de `pose_si_libre` (0125). */
type VerdictDeLaPose =
  | { ok: true; id: string; verdict?: 'pose' | 'deja' | 'deja_pose' }
  | { ok: false; raison: string };

/** L'ALERTE AU PERSONNEL : le prénom seul, jamais le texte qu'elle a écrit. */
function alerteDeLAutomate(o: {
  genre: 'pose' | 'main'; prenom: string; numero: string; date?: string; time?: string; motif?: MotifDeLaMain;
}): AlerteDeLAutomate {
  const qui = o.prenom || 'Une cliente';
  if (o.genre === 'pose') {
    return {
      titre: 'Nouveau rendez-vous par WhatsApp',
      corps: `${qui}, ${jourDitAvecAnnee(o.date ?? '')} à ${heureDite(o.time ?? '')}`,
      url: '/trone/#/calendrier',
    };
  }
  return {
    titre: 'WhatsApp · la main passe',
    corps: `${qui} · ${MOTIF_DIT[o.motif ?? 'demande']}`,
    url: `/trone/#/conversations?n=${o.numero}`,
  };
}

/** UNE CLÉ COURTE ET STABLE tirée d'un identifiant Meta : deux empreintes
    FNV-1a de 32 bits, en base 36. Le même message donne toujours la même
    clé ; deux messages, deux clés. */
function cleCourte(brut: string): string {
  const s = String(brut ?? '');
  let a = 0x811c9dc5;
  let b = 0x050c5d1f;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
  }
  return `${a.toString(36).padStart(7, '0')}${b.toString(36).padStart(7, '0')}`;
}

/** Les gestes, dits comme on parle : « A », « A et B », « A, B et C ». */
const gestesDitsWa = (noms: readonly string[]): string =>
  (noms.length <= 1 ? (noms[0] ?? '') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`);

/* ── 9 bis. LES GESTES DITS EN FRANÇAIS : le dictionnaire, la marque et le
   geste en toutes lettres vivent dans `gestes-en-francais.ts` (13 octobre
   2026), partagés avec le site. */
/** Le titre d'une ligne de liste, dans `place` signes (24, ou moins devant
    « + 1 ») : « Resserrage · Essentiel », sinon « Resserrage Essentiel »,
    sinon le geste seul, « Hydratation ». Jamais de mot coupé quand le geste
    tient. Sans mot français, le nom du catalogue. */
const titreEnFrancaisWa = (nom: string, place = 24): string => {
  const { marque, variante, sansNiveau } = litLaMarqueWa(nom);
  const g = GESTES_EN_FRANCAIS[marque];
  if (!g) return coupeWa(nom, place);
  const v = variante.toLowerCase();
  const repete = !v || v === g.court.toLowerCase() || v === g.long.toLowerCase()
    || (sansNiveau && (v.includes(g.court.toLowerCase()) || v.includes(g.long.toLowerCase())));
  /* Un sous-titre (« VÍVÍVÓ™ · Le Vivifiant ») ne se colle pas au geste
     sans point : « Activateur Le Vivifiant » ne se lit pas. */
  const essais = repete ? [g.long, g.court]
    : sansNiveau ? [`${g.court} · ${variante}`, g.long, g.court]
      : [`${g.court} · ${variante}`, `${g.court} ${variante}`, g.long, g.court];
  return essais.find((x) => x.length <= place) ?? coupeWa(g.court, place);
};

const gestesDitsEnFrancaisWa = (noms: readonly string[]): string => gestesDitsWa(noms.map(gesteDitEnFrancaisWa));

/** LE LIEN GOOGLE MAPS DE LA MAISON (13 octobre 2026) : « rajoute le lien de
    Google Maps sur l'itinéraire qu'on envoie aux clients » (Yéman). Le
    premier lien valable des candidats : celui de la branche (Système ›
    Branches, `mapsUrl`), puis celui des Paramètres (`mapsLink`). Seul un lien
    https de Google Maps passe ; le paramètre de partage `g_st` est ôté, rien
    d'autre n'est réécrit. Aucun : chaîne vide. */
function lienMapsWa(...candidats: unknown[]): string {
  const google = /^https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.(?:com|[a-z]{2}|com?\.[a-z]{2})\/maps|maps\.google\.(?:com|[a-z]{2}|com?\.[a-z]{2}))(?:[/?#]|$)/i;
  for (const c of candidats) {
    const brut = String(c ?? '').trim();
    if (!google.test(brut)) continue;
    try {
      const u = new URL(brut);
      if (!u.searchParams.has('g_st')) return brut;
      u.searchParams.delete('g_st');
      return u.toString();
    } catch { continue; }
  }
  return '';
}

/** UN APPEL VIDE NE LAISSE PAS DE TRACE (13 octobre 2026). */
const sansAppelVide = (t: string): string => t
  .replace(/ +,/g, ',')
  .replace(/,(?:\s*,)+/g, ',')
  .replace(/,[ \t]*([?!:;])/g, ' $1')
  .replace(/,[ \t]*\./g, '.')
  .replace(/ {2,}/g, ' ');

/** La ligne du lien, telle que la cliente la lit. */
const ligneGoogleMapsWa = (lien: string): string => (lien ? `Itinéraire sur Google Maps : ${lien}` : '');

/** La consultation nommée dans une phrase : « la consultation Origine
    (KÒKÒ™ Origine) » ; sans mot français, « le Conseil et diagnostic ». */
const laConsultationDiteWa = (nom: string): string => {
  const { marque, variante } = litLaMarqueWa(nom);
  const g = GESTES_EN_FRANCAIS[marque];
  return g ? `la ${g.long.toLowerCase()}${variante ? ` ${variante}` : ''} (${nom})` : `le ${nom}`;
};

/** La durée, dite : 45 → « 45 min », 60 → « 1 h », 105 → « 1 h 45 ». */
const dureeDiteWa = (min: number): string => {
  const n = Math.max(0, Math.round(Number(min) || 0));
  if (!n) return '';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
};

/** PLUSIEURS SOINS LE MÊME JOUR (13 octobre 2026) : après un rituel
    choisi, « Souhaitez-vous ajouter un autre soin ? », trois soins au plus
    dans un rendez-vous. */
const SOINS_PAR_RENDEZ_VOUS = 3;

/** Les marques des soins du cheveu, dans l'ordre où la liste les montre. */
const MARQUES_DES_SOINS: readonly string[] = ['DÀNDÀN', 'VÍVÍVÓ', 'WÈWÈ', 'GBÌGBÌ'];

/* ── 10. L'ATELIER DU TOUR ──────────────────────────────────────────────
   Toutes les étapes se fabriquent ici, autour d'un état de travail `base`.
   `etapeSuivante` y joue un tour ; `suiteDeLaPose` y dit le verdict du
   verrou, sans faire monter la version (une seule écriture par tour). */
function atelierDuTour(ancien: EtatDuFil | null | undefined, tour: TourDeLaCliente | null, ctx: ContexteDuTour, memeVersion: boolean, reprise = false) {
  const ms = ctx.maintenantMs;
  const maintenant = isoWa(ms);
  const pauseH = ctx.reglage.pauseHeures;
  const aujourdhui = instantACotonou(ms).iso;
  const courante = tour || reprise ? etapeCourante(ancien, ctx.main, ms, pauseH) : (ancien?.etape ?? 'repos');
  const version = (ancien?.version ?? 0) + (memeVersion ? 0 : 1);

  const base: EtatDuFil = ancien
    ? { ...ancien, panier: { ...ancien.panier }, traites: [...ancien.traites], envois: [...ancien.envois] }
    : etatNeufDuFil(ctx.numero, maintenant);
  base.numero = ctx.numero;
  base.version = version;
  base.majLe = maintenant;
  base.envois = base.envois.filter((e) => ms - msWa(e) < JOUR_WA);
  if (tour) {
    base.traites = [...new Set([...base.traites, ...tour.waIds])].slice(-5);
    base.dernierEntrantQuand = tour.quand || maintenant;
  }
  if (courante !== base.etape) {
    if (ETAPES_EN_COURS.includes(courante)) {
      /* Rendue à l'automate : il reprend l'étape où il en était. */
      base.etape = courante;
      base.versionDeLEtape = base.versionAvantLaMain ?? base.versionDeLEtape;
      base.mainPasseeLe = undefined;
      base.motifMain = undefined;
      base.etapeAvantLaMain = undefined;
      base.versionAvantLaMain = undefined;
    } else {
      base.etape = courante;
    }
    base.ecarts = 0;
  }

  const agenda = ctx.agenda;
  const cats = agenda?.categories ?? [];
  const prestation = (id: string): PrestationDuTour | undefined => agenda?.prestations.find((s) => s.id === id);
  /** Réservable par l'automate : ouverte en ligne, et une consultation, ou
      un geste qui n'exige ni consultation ni devis. La règle du serveur
      (`reservable`) ET celle de la Maison (qualification) : une création ne
      passe jamais, même si le site l'avait laissée ouverte par erreur. */
  const reservableWa = (s: PrestationDuTour | undefined): boolean =>
    !!s && s.reservable && (estUneConsultation(s, cats) || (!exigeConsultation(s, cats) && priceModeOf(s) !== 'devis'));
  const directe = (s: PrestationDuTour | undefined): boolean => reservableWa(s) && !estUneConsultation(s!, cats);
  const nomsDe = (ids: readonly string[]): string[] => ids.map((id) => prestation(id)?.name ?? '').filter(Boolean);

  /* ── Qui écrit, et comment on l'appelle ── */
  const fiches = fichesServies(ctx);
  const titulaire: FicheDuNumero | undefined = titulaireDuNumero(fiches, aujourdhui);
  /** Aucune adulte ne porte ce numéro en premier : celle qui écrit n'a
      peut-être pas de fiche. « Pour moi » la mène au parcours d'une inconnue
      (sa civilité, son prénom, sa demande). */
  const pourMoiPossible = !fiches.some((f) => f.parPhone && !mineureWa(f.naissance, aujourdhui));
  const appel = (): string => {
    if (titulaire) return appelDe({ name: titulaire.nom, civilite: titulaire.civilite, auMasculin: titulaire.auMasculin });
    if (base.panier.civilite) return appelDe({ name: base.panier.prenom ?? '', civilite: base.panier.civilite });
    /* PERSONNE DE CONNU (13 octobre 2026) : ni fiche ni civilité choisie. On
       ne suppose plus Madame : la phrase se dit sans appel (`sansAppelVide`). */
    return '';
  };
  const ficheChoisie = (): FicheDuNumero | undefined => fiches.find((f) => f.id === base.panier.clientId);
  const prenomPourAlerte = (): string =>
    prenomDuNomWa(ficheChoisie()?.nom) || base.panier.prenom || prenomDuNomWa(titulaire?.nom) || '';
  const salut = (): string => {
    const min = instantACotonou(ms).min;
    return min >= 18 * 60 || min < 5 * 60 ? 'Bonsoir' : 'Bonjour';
  };
  const cotonou = heureDeCotonouSiBesoin(ctx.numero);
  const maisonNomWa = String(ctx.maison.nom || 'Maison MND').trim();

  /* ── Les briques des messages ── */
  const choix = (geste: string, argument?: string): string => idDeChoix(version, geste, argument);
  const sortieMaison = { id: choix('maison'), titre: 'Parler à la Maison' };
  /** Sans appel, la phrase ne garde pas de trace : « Quel rituel souhaitez-vous,
      ? » devient « Quel rituel souhaitez-vous ? », « Bonjour , bienvenue »
      devient « Bonjour, bienvenue ». Une phrase avec un appel ne change pas. */
  const propre = (corps: string): string => (appel() ? corps : sansAppelVide(corps));
  const texte = (etape: EtapeDuFil, corps: string): MessageSortant => ({ forme: 'texte', etape, corps: propre(corps) });
  const boutons = (etape: EtapeDuFil, corps: string, liste: { id: string; titre: string }[]): MessageSortant =>
    ({ forme: 'boutons', etape, corps: propre(corps), pied: PIED, boutons: [...liste, sortieMaison].slice(0, 3) });
  const liste = (etape: EtapeDuFil, corps: string, bouton: string, lignes: { id: string; titre: string; description?: string }[]): MessageSortant =>
    ({ forme: 'liste', etape, corps: propre(corps), pied: PIED, bouton, lignes: [...lignes.slice(0, 9), sortieMaison] });
  const relanceDite = (): string => `Touchez l'un des choix ci-dessous, ${appel()}, ou Parler à la Maison.`;

  const passe = (etape: EtapeDuFil): void => {
    if (base.etape !== etape) {
      base.etape = etape;
      base.depuis = maintenant;
      base.versionDeLEtape = version;
      base.ecarts = 0;
    }
  };

  const sortie = (messages: MessageSortant[], alerte?: AlerteDeLAutomate): SortieDuTour => {
    for (let i = 0; i < messages.length; i += 1) base.envois.push(maintenant);
    return { messages, etat: base, ecritures: [], pris: true, ...(alerte ? { alerte } : {}) };
  };

  /** LA MAIN PASSE. Le jour : « Une personne de la Maison vous répond ici ».
      La nuit ou un jour fermé : « La Maison vous répond demain dès 9 h ». */
  const laMainDite = (): string => {
    const quand = prochaineOuvertureDite(ms, agenda?.semaine ?? [], agenda?.exceptions ?? []);
    return quand === null
      ? `Une personne de la Maison vous répond ici, ${appel()}.`
      : `La Maison vous répond ${quand}, ${appel()}.`;
  };
  const laMain = (motif: MotifDeLaMain, dire: boolean, corps?: string): SortieDuTour => {
    if (ETAPES_EN_COURS.includes(base.etape)) {
      base.etapeAvantLaMain = base.etape;
      base.versionAvantLaMain = base.versionDeLEtape;
    } else {
      base.etapeAvantLaMain = undefined;
      base.versionAvantLaMain = undefined;
    }
    passe('main');
    base.mainPasseeLe = maintenant;
    base.motifMain = motif;
    const messages = dire ? [texte('main', corps ?? laMainDite())] : [];
    return sortie(messages, alerteDeLAutomate({ genre: 'main', prenom: prenomPourAlerte(), numero: ctx.numero, motif }));
  };
  const dire = (m: MessageSortant | null, motifSiRien: MotifDeLaMain = 'sans-place'): SortieDuTour =>
    (m ? sortie([m]) : laMain(motifSiRien, true));
  /** Ce tour n'est pas pour lui : rien ne s'écrit, la Maison le lit. */
  const silence = (): SortieDuTour => ({ messages: [], etat: ancien ?? base, ecritures: [], pris: false });

  /* ── Le conseil (14 octobre 2026) ── */
  const envoyables = (): { r: ReponseDeLaMaison; texte: string }[] => reponsesEnvoyables(ctx.conseil, ctx.prix);
  /** L'étape où « Continuer » la ramène : un parcours commencé, jamais le
      menu (de là, « Réserver » suit la réponse), ni le conseil lui-même. */
  const retiensOuReprendre = (): void => {
    if (base.etape === 'questions' || base.etape === 'reponse') return;
    base.panier.reprendre = ETAPES_EN_COURS.includes(base.etape) && base.etape !== 'besoin' ? base.etape : undefined;
  };
  const salutDuConseil = (avecSalut: boolean): string =>
    (avecSalut ? `${salut()} ${appel()}, bienvenue à la ${maisonNomWa}.\n\n` : '');
  const msgQuestions = (page: number, choisies?: readonly { r: ReponseDeLaMaison; texte: string }[], avecSalut = false): MessageSortant | null => {
    const toutes = choisies ?? envoyables();
    if (toutes.length === 0) return null;
    retiensOuReprendre();
    passe('questions');
    const par = toutes.length > 9 ? 8 : 9;
    const p = Math.max(0, Math.floor(page) || 0);
    const debut = p * par < toutes.length ? p * par : 0;
    const tranche = toutes.slice(debut, debut + par);
    const plus = !choisies && debut + par < toutes.length;
    const corps = choisies
      ? `Votre message touche plusieurs sujets, ${appel()}. Lequel voulez-vous lire ?`
      : `Voici les questions qu'on nous pose le plus, ${appel()}. Touchez la vôtre.`;
    return liste('questions', `${salutDuConseil(avecSalut)}${corps}`, 'Les questions', [
      ...tranche.map((e) => ({ id: choix('reponse', e.r.id), titre: e.r.titre, ...(e.r.description ? { description: e.r.description } : {}) })),
      ...(plus ? [{ id: choix('plus', String(p + 1)), titre: 'Plus de questions' }] : []),
    ]);
  };
  const msgReponse = (e: { r: ReponseDeLaMaison; texte: string }, avecSalut: boolean): MessageSortant => {
    retiensOuReprendre();
    passe('reponse');
    const suite = base.panier.reprendre
      ? [{ id: choix('reprendre'), titre: 'Continuer' }, { id: choix('questions'), titre: 'Une autre question' }]
      : [{ id: choix('reserver', e.r.mene), titre: 'Réserver' }, { id: choix('questions'), titre: 'Une autre question' }];
    return { ...boutons('reponse', `${salutDuConseil(avecSalut)}${e.texte}`, suite), reponseId: e.r.id, prixDuCatalogue: true };
  };
  /** LE CONSEIL RÉPOND À SON TEXTE, ou `null` s'il n'a rien à dire. */
  const questionDuTour = (texteDuTour: string, avecSalut: boolean): SortieDuTour | null => {
    const lu = lisLeConseil(texteDuTour, ctx.conseil);
    if (lu.sante) {
      const quand = prochaineOuvertureDite(ms, agenda?.semaine ?? [], agenda?.exceptions ?? []);
      const qui = quand === null ? 'Une personne de la Maison vous répond ici.' : `La Maison vous répond ${quand}.`;
      return laMain('sante', true, `Merci de nous le dire, ${appel()}. Ce que vous décrivez se regarde de près : la Maison ne conseille pas de soin à distance. ${qui} Si la gêne est forte ou s'étend, un médecin ou un dermatologue saura vous examiner.`);
    }
    if (lu.ids.length === 0) return null;
    const trouvees = envoyables().filter((e) => lu.ids.includes(e.r.id));
    if (trouvees.length === 1) return dire(msgReponse(trouvees[0], avecSalut));
    if (trouvees.length > 1) return dire(msgQuestions(0, trouvees, avecSalut), 'question');
    /* Reconnue, mais elle ne peut pas partir (un prix introuvable au
       catalogue du jour) : la Maison répond elle-même. */
    return laMain('question', true);
  };

  /* ── Les places ── */
  const tempsDe = (p: PlaceLibre): number => msWa(`${p.iso}T${p.heure}:00Z`);
  const chrono = (a: PlaceLibre, b: PlaceLibre): number => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.heure < b.heure ? -1 : a.heure > b.heure ? 1 : 0);
  const parJours = (places: readonly PlaceLibre[], combien: number): PlaceLibre[] => {
    if (combien <= 0) return [];
    const jours = new Map<string, { heure: string }[]>();
    for (const p of places) jours.set(p.iso, [...(jours.get(p.iso) ?? []), { heure: p.heure }]);
    return prochainesPlaces([...jours.entries()].map(([iso, heures]) => ({ iso, heures })), combien)
      .map((x) => ({ iso: x.iso, heure: x.place.heure }));
  };
  /** Deux places par jour au plus, sans compléter : le jour voulu passe en
      tête sans prendre toute la liste (la maquette : deux samedis, puis les
      autres jours). */
  const deuxParJour = (places: readonly PlaceLibre[], plafond: number): PlaceLibre[] => {
    const parJour = new Map<string, number>();
    for (const p of places) parJour.set(p.iso, (parJour.get(p.iso) ?? 0) + 1);
    const sansCompleter = [...parJour.values()].reduce((s, n) => s + Math.min(2, n), 0);
    return parJours(places, Math.min(plafond, sansCompleter));
  };
  const placesLibresDuPanier = (): PlaceLibre[] => {
    const ids = base.panier.serviceIds ?? [];
    if (!agenda || ids.length === 0) return [];
    return [...agenda.places(ids)].filter((p) => p.iso > aujourdhui).sort(chrono);
  };
  const convient = (p: PlaceLibre): boolean => {
    const j = base.panier.jourVoulu;
    const okJour = !j || (/^\d{4}-\d{2}-\d{2}$/.test(j) ? p.iso === j : JOURS_LONGS_WA[dowDeIsoWa(p.iso)] === j);
    const m = base.panier.moment;
    const okMoment = !m || (m === 'matin' ? p.heure < '13:00' : p.heure >= '13:00');
    return okJour && okMoment;
  };
  /** Le jour qu'elle écarte (« pas samedi ») : ses places ne reviennent pas. */
  const evitee = (p: PlaceLibre): boolean => {
    const j = base.panier.jourEvite;
    return !!j && (/^\d{4}-\d{2}-\d{2}$/.test(j) ? p.iso === j : JOURS_LONGS_WA[dowDeIsoWa(p.iso)] === j);
  };
  const preferenceDite = (): string => {
    const j = base.panier.jourVoulu;
    const m = base.panier.moment;
    const jour = !j ? '' : /^\d{4}-\d{2}-\d{2}$/.test(j)
      ? (j === isoPlusJoursWa(aujourdhui, 1) ? 'demain' : `le ${jourDitAvecAnnee(j)}`)
      : `le ${j}`;
    if (jour && m) return `${jour} ${m === 'matin' ? 'matin' : 'après-midi'}`;
    if (jour) return jour;
    return m === 'matin' ? 'le matin' : "l'après-midi";
  };

  const lignesDesPlaces = (sel: readonly PlaceLibre[]) => sel.map((p) => ({
    id: choix('place', `${p.iso.replace(/-/g, '')}-${p.heure.replace(':', '')}`),
    titre: titreDePlace(p.iso, p.heure),
    description: coupeWa(`${jourDitAvecAnnee(p.iso)} à ${heureDite(p.heure)}${cotonou}`, 72),
  }));

  const msgPlaces = (o: { intro?: string; relance?: boolean; proche?: PlaceLibre; exclure?: PlaceLibre } = {}): MessageSortant | null => {
    const toutes = placesLibresDuPanier()
      .filter((p) => !(o.exclure && p.iso === o.exclure.iso && p.heure === o.exclure.heure));
    if (toutes.length === 0) return null;
    /* Le jour qu'elle écarte ne revient pas, tant qu'il reste d'autres places. */
    const horsEvite = toutes.filter((p) => !evitee(p));
    const offertes = horsEvite.length > 0 ? horsEvite : toutes;
    let sel: PlaceLibre[];
    let intro = o.intro;
    if (o.proche) {
      const t0 = tempsDe(o.proche);
      sel = [...offertes].sort((a, b) => Math.abs(tempsDe(a) - t0) - Math.abs(tempsDe(b) - t0) || chrono(a, b))
        .slice(0, PLACES_PROPOSEES).sort(chrono);
    } else {
      const jour = base.panier.jourChoisi;
      const duJour = jour ? offertes.filter((p) => p.iso === jour) : [];
      if (jour && duJour.length > 0) {
        sel = parJours(duJour, PLACES_PROPOSEES);
        intro = intro ?? `Voici les places du ${jourDitAvecAnnee(jour)}, ${appel()}.`;
      } else {
        base.panier.jourChoisi = undefined;
        const voulues = offertes.filter(convient);
        const autres = offertes.filter((p) => !convient(p));
        const d = deuxParJour(voulues, PLACES_PROPOSEES);
        const a = deuxParJour(autres, PLACES_PROPOSEES - d.length);
        sel = [...d, ...a];
        /* Moins de sept : on complète, le jour voulu d'abord, dans l'ordre du temps. */
        const cle = (p: PlaceLibre): string => `${p.iso} ${p.heure}`;
        const pris = new Set(sel.map(cle));
        for (const p of [...voulues, ...autres]) {
          if (sel.length >= PLACES_PROPOSEES) break;
          if (!pris.has(cle(p))) { sel.push(p); pris.add(cle(p)); }
        }
        if ((base.panier.jourVoulu || base.panier.moment) && voulues.length === 0) {
          intro = intro ?? `Nous n'avons plus de place ${preferenceDite()} dans les ${ctx.reglage.horizonJours} prochains jours, ${appel()}. Voici les prochaines places.`;
        }
      }
    }
    base.panier.places = sel;
    passe('places');
    const corps = o.relance ? relanceDite() : (intro ?? `Voici les prochaines places, ${appel()}.`);
    return liste('places', corps, 'Voir les places', [
      ...lignesDesPlaces(sel),
      { id: choix('autre-jour'), titre: 'Un autre jour', description: 'les prochains jours ouverts' },
    ]);
  };

  const msgJours = (relance = false): MessageSortant | null => {
    const libres = placesLibresDuPanier();
    const horsEvite = libres.filter((p) => !evitee(p));
    const toutes = horsEvite.length > 0 ? horsEvite : libres;
    const compte = new Map<string, number>();
    for (const p of toutes) compte.set(p.iso, (compte.get(p.iso) ?? 0) + 1);
    const jours = [...compte.keys()].sort().slice(0, JOURS_PROPOSES);
    if (jours.length === 0) return null;
    base.panier.jourChoisi = undefined;
    passe('jours');
    return liste('jours', relance ? relanceDite() : `Quel jour vous conviendrait, ${appel()} ?`, 'Choisir un jour', jours.map((iso) => {
      const n = compte.get(iso) ?? 0;
      return { id: choix('jour', iso.replace(/-/g, '')), titre: titreDuJour(iso), description: `${n} ${n > 1 ? 'heures libres' : 'heure libre'}` };
    }));
  };

  /* ── Les étapes ── */
  const msgQui = (relance: boolean, avecSalut: boolean): MessageSortant => {
    passe('qui');
    const lignes = fiches.slice(0, pourMoiPossible ? 7 : 8).map((f) => ({
      id: choix('qui', f.id),
      titre: coupeWa(f === titulaire ? `Pour moi, ${prenomDuNomWa(f.nom)}` : `Pour ${prenomDuNomWa(f.nom)}`, 24),
    }));
    const corps = relance ? relanceDite()
      : avecSalut ? `${salut()} ${appel()}, merci de votre message. Pour qui est ce rendez-vous ?`
        : `Pour qui est ce rendez-vous, ${appel()} ?`;
    return liste('qui', corps, 'Choisir', [
      ...lignes,
      ...(pourMoiPossible ? [{ id: choix('moi'), titre: 'Pour moi' }] : []),
      { id: choix('autre-personne'), titre: 'Une autre personne' },
    ]);
  };

  const msgBesoin = (relance: boolean, avecSalut: boolean): MessageSortant => {
    passe('besoin');
    const pourQui = base.panier.pourQui;
    let corps: string;
    if (relance) corps = relanceDite();
    else if (pourQui) corps = `Comment pouvons-nous prendre soin de la couronne de ${pourQui}, ${appel()} ?`;
    else if (avecSalut && fiches.length === 0) corps = `${salut()} ${appel()}, bienvenue à la ${maisonNomWa}. Comment pouvons-nous prendre soin de votre couronne ?`;
    else if (avecSalut) corps = `${salut()} ${appel()}, merci de votre message. Comment pouvons-nous prendre soin de votre couronne ?`;
    else corps = `Comment pouvons-nous prendre soin de votre couronne, ${appel()} ?`;
    const ses = pourQui ? 'ses' : 'mes';
    return liste('besoin', corps, 'Choisir', [
      { id: choix('besoin', 'entretien'), titre: `Entretenir ${ses} locks` },
      { id: choix('besoin', 'creation'), titre: `Créer ${ses} locks` },
      { id: choix('besoin', 'reparation'), titre: `Réparer ${ses} locks` },
      ...(pourQui ? [] : [{ id: choix('besoin', 'enfant'), titre: 'Pour mon enfant' }]),
      ...(envoyables().length > 0 ? [{ id: choix('questions'), titre: 'Une question ?' }] : []),
    ]);
  };

  const venueReprenable = (f: FicheDuNumero | undefined): { date: string; serviceIds: string[] } | null => {
    const v = f?.derniereVenue;
    if (!v || !Array.isArray(v.serviceIds) || v.serviceIds.length === 0 || v.serviceIds.length > 6) return null;
    return v.serviceIds.every((id) => directe(prestation(id))) ? v : null;
  };

  const msgMeme = (relance: boolean, avecSalut: boolean): MessageSortant | null => {
    const v = venueReprenable(ficheChoisie());
    if (!v) return null;
    passe('meme');
    const gestes = gestesDitsEnFrancaisWa(nomsDe(v.serviceIds));
    const quand = jourDitAvecAnnee(v.date);
    const pourQui = base.panier.pourQui;
    const corps = relance ? relanceDite()
      : pourQui ? `La dernière venue de ${pourQui}, ${appel()} : ${gestes}, le ${quand}. Souhaitez-vous la même chose ?`
        : avecSalut ? `${salut()} ${appel()}, merci de votre message. Votre dernière venue : ${gestes}, le ${quand}. Souhaitez-vous la même chose ?`
          : `Votre dernière venue, ${appel()} : ${gestes}, le ${quand}. Souhaitez-vous la même chose ?`;
    return boutons('meme', corps, [
      { id: choix('meme'), titre: 'La même chose' },
      { id: choix('autre'), titre: 'Autre chose' },
    ]);
  };

  const titreDesGestes = (ids: readonly string[]): string => {
    const noms = nomsDe(ids);
    if (noms.length <= 1) return titreEnFrancaisWa(noms[0] ?? '');
    const suite = ` + ${noms.length - 1}`;
    return `${titreEnFrancaisWa(noms[0], 24 - suite.length)}${suite}`;
  };
  /** Sous le titre : la marque fon et la durée RÉSERVÉE (une heure au
      moins, comme l'agenda), « SÍNSIN™ Essentiel · 1 h ». Les noms se
      coupent, la durée reste (revue du 13 octobre 2026). */
  const descriptionDesGestes = (ids: readonly string[]): string => {
    const duree = dureeDiteWa(dureeDesPrestations(ids, agenda?.prestations ?? []));
    const suite = duree ? ` · ${duree}` : '';
    return `${coupeWa(gestesDitsWa(nomsDe(ids)), 72 - suite.length)}${suite}`;
  };

  /** LES SOINS DU CHEVEU (13 octobre 2026) : « dans Autre soin j'aimerais
      les soins DÀNDÀN, VÍVÍVÓ… » (Yéman). Ceux qui se réservent ici,
      reconnus à leur marque, sans les versions Kids ni « avec votre
      produit » ; en ajout, jamais un soin déjà pris ni au-delà de trois. */
  const soinsDuCheveu = (): string[][] => {
    const pris = base.panier.enAjout ? (base.panier.serviceIds ?? []) : [];
    if (pris.length >= SOINS_PAR_RENDEZ_VOUS) return [];
    const rang = (s: PrestationDuTour): number => MARQUES_DES_SOINS.indexOf(litLaMarqueWa(s.name).marque);
    return (agenda?.prestations ?? [])
      .filter((s) => directe(s) && rang(s) >= 0 && !pris.includes(s.id) && !/\bkids\b|avec votre produit/i.test(s.name))
      .sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'fr'))
      .slice(0, 8).map((s) => [s.id]);
  };
  /** LA CONSULTATION DE RÉPARATION, à ajouter le même jour (13 octobre
      2026, « entretenir ET réparer ») : celle que la Maison a désignée
      pour la réparation, jamais une autre devinée. */
  const reparationAAjouter = (): string | null => {
    const id = agenda?.consultationParParcours?.reparation;
    const pris = base.panier.serviceIds ?? [];
    if (!id || pris.includes(id) || pris.length >= SOINS_PAR_RENDEZ_VOUS) return null;
    return reservableWa(prestation(id)) ? id : null;
  };

  const sontDesConsultations = (offres: readonly string[][]): boolean =>
    offres.length > 0 && offres.every((ids) => ids.length === 1 && !!prestation(ids[0]) && estUneConsultation(prestation(ids[0])!, cats));

  const msgRituel = (relance: boolean, offres: string[][], ajout = false, soins = false): MessageSortant | null => {
    const valables = offres.filter((ids) => ids.length > 0 && ids.every((id) => reservableWa(prestation(id)))).slice(0, 8);
    if (valables.length === 0) return null;
    passe('rituel');
    base.panier.rituels = valables.map((ids) => [...ids]);
    if (!ajout && !soins) base.panier.offerts = valables.map((ids) => [...ids]);
    base.panier.enAjout = ajout;
    base.panier.dansLesSoins = soins;
    if ((ajout || soins) && !relance) base.panier.horsPlafond = (base.panier.horsPlafond ?? 0) + 1;
    const consultations = sontDesConsultations(valables);
    const corps = relance ? relanceDite()
      : ajout ? `Quel soin ajouter, ${appel()} ?`
        : soins ? `Quel soin souhaitez-vous, ${appel()} ?`
          : consultations ? `Quelle consultation souhaitez-vous, ${appel()} ?` : `Quel rituel souhaitez-vous, ${appel()} ?`;
    const reparation = agenda?.consultationParParcours?.reparation;
    /* « Autre soin » ouvre la liste des soins, s'il y en a et qu'on n'y est
       pas déjà ; sinon il passe la main, comme avant. */
    const desSoins = !soins && soinsDuCheveu().length > 0;
    const quels = [...new Set(soinsDuCheveu().map((ids) => GESTES_EN_FRANCAIS[litLaMarqueWa(prestation(ids[0])?.name ?? '').marque]?.long ?? '').filter(Boolean))];
    return liste('rituel', corps, 'Choisir', [
      ...valables.map((ids, i) => (ids.length === 1 && ids[0] === reparation && ajout
        ? { id: choix('rituel', String(i)), titre: 'Réparer mes locks', description: coupeWa(`consultation d'abord · ${descriptionDesGestes(ids)}`, 72) }
        : { id: choix('rituel', String(i)), titre: titreDesGestes(ids), description: descriptionDesGestes(ids) })),
      ...(consultations ? [] : [{ id: choix('autre-soin'), titre: 'Autre soin',
        description: desSoins ? coupeWa(gestesDitsWa(quels), 72) : 'une personne de la Maison vous répond' }]),
    ]);
  };

  /** LES SOINS QU'ELLE PEUT ENCORE AJOUTER : les offres du premier choix,
      moins ce qu'elle a déjà pris (une formule dont elle a pris un geste
      offre le reste), sans dépasser trois soins, sans doublon. */
  const soinsAAjouter = (): string[][] => {
    const pris = base.panier.serviceIds ?? [];
    const vus = new Set<string>();
    return (base.panier.offerts ?? [])
      .map((ids) => ids.filter((id) => !pris.includes(id)))
      .filter((ids) => ids.length > 0 && pris.length + ids.length <= SOINS_PAR_RENDEZ_VOUS && ids.every((id) => directe(prestation(id))))
      .filter((ids) => { const cle = [...ids].sort().join('+'); if (vus.has(cle)) return false; vus.add(cle); return true; });
  };

  const msgEncore = (relance: boolean): MessageSortant => {
    passe('encore');
    if (!relance) base.panier.horsPlafond = (base.panier.horsPlafond ?? 0) + 1;
    return boutons('encore', relance ? relanceDite() : `Souhaitez-vous ajouter un autre soin le même jour, ${appel()} ?`, [
      { id: choix('encore'), titre: 'Ajouter un soin' },
      { id: choix('suffit'), titre: "Non, c'est tout" },
    ]);
  };

  /** Un rituel choisi : un autre soin ? Trois soins, ou plus rien à
      ajouter : droit aux places. */
  const apresLeRituel = (): SortieDuTour =>
    ((base.panier.serviceIds ?? []).length >= SOINS_PAR_RENDEZ_VOUS || aAjouter().length === 0 ? dire(msgPlaces({})) : dire(msgEncore(false)));

  /** CE QU'ELLE PEUT AJOUTER : les formules qui restent, puis la consultation
      de réparation ; à défaut, les soins du cheveu (13 octobre 2026). */
  const aAjouter = (): string[][] => {
    const r = reparationAAjouter();
    const liste = [...soinsAAjouter(), ...(r ? [[r]] : [])];
    return liste.length > 0 ? liste : soinsDuCheveu();
  };

  /** « Ajouter un soin » : la liste de ce qui reste ; plus rien, les places. */
  const ajouteUnSoin = (relance: boolean): SortieDuTour =>
    dire(msgRituel(relance, aAjouter(), true) ?? msgPlaces({}));

  const msgCivilite = (relance: boolean): MessageSortant => {
    passe('civilite');
    return liste('civilite', relance ? relanceDite() : 'Pour inscrire votre rendez-vous, comment devons-nous vous appeler ?', 'Choisir', [
      { id: choix('civ', 'madame'), titre: 'Madame' },
      { id: choix('civ', 'mademoiselle'), titre: 'Mademoiselle' },
      { id: choix('civ', 'monsieur'), titre: 'Monsieur' },
    ]);
  };

  const msgPrenom = (relance: boolean): MessageSortant => {
    passe('prenom');
    const civ = appelDe({ civilite: base.panier.civilite });
    return boutons('prenom', relance
      ? `Écrivez simplement votre prénom, ${civ}, ou touchez Parler à la Maison.`
      : `Et votre prénom, ${civ} ? Écrivez-le simplement dans un message, en réponse.`, []);
  };

  const quandDuPanier = (): string =>
    `${jourDitAvecAnnee(base.panier.date ?? '')} à ${heureDite(base.panier.time ?? '')}${cotonou}`;

  const msgRecap = (relance: boolean): MessageSortant | null => {
    const p = base.panier;
    if (!p.date || !p.time || !p.serviceIds?.length) return null;
    passe('recap');
    const gestes = gestesDitsEnFrancaisWa(nomsDe(p.serviceIds));
    const de = p.pourQui ? `le rendez-vous de ${p.pourQui}` : 'votre rendez-vous';
    const corps = relance ? relanceDite()
      : `Voici ${de}, ${appel()} : ${gestes}, ${quandDuPanier()}, à la ${maisonNomWa}. Nous le posons ?`;
    return boutons('recap', corps, [
      { id: choix('oui'), titre: 'Je confirme' },
      { id: choix('autre-heure'), titre: 'Une autre heure' },
    ]);
  };

  const renvoie = (etape: EtapeDuFil, relance: boolean): SortieDuTour => {
    switch (etape) {
      case 'qui': return dire(msgQui(relance, false));
      case 'besoin': return dire(msgBesoin(relance, false));
      case 'meme': return dire(msgMeme(relance, false) ?? msgBesoin(relance, false));
      case 'rituel': return base.panier.dansLesSoins
        ? dire(msgRituel(relance, soinsDuCheveu(), !!base.panier.enAjout, true) ?? msgPlaces({}))
        : base.panier.enAjout
        ? ajouteUnSoin(relance)
        : dire(msgRituel(relance, base.panier.rituels ?? []), 'autre-soin');
      case 'encore': return dire(msgEncore(relance));
      case 'places': return dire(msgPlaces({ relance }));
      case 'jours': return dire(msgJours(relance));
      case 'civilite': return dire(msgCivilite(relance));
      case 'prenom': return dire(msgPrenom(relance));
      case 'recap': return dire(msgRecap(relance) ?? msgPlaces({}));
      case 'questions':
      case 'reponse': return dire(msgQuestions(0), 'question');
      default: return laMain('erreur', true);
    }
  };

  const ecart = (): SortieDuTour => {
    base.ecarts = (base.ecarts ?? 0) + 1;
    if (base.ecarts >= ECARTS_AVANT_LA_MAIN) return laMain('ecarts', true);
    return renvoie(base.etape, true);
  };

  /* ── Les gestes ── */
  const pourLaFiche = (f: FicheDuNumero, avecSalut: boolean): SortieDuTour => {
    base.panier.clientId = f.id;
    /* Sans titulaire, celle qui écrit n'est pas cette fiche : on parle
       « de Kemi », jamais « de votre » dernière venue. */
    base.panier.pourQui = f.id !== titulaire?.id ? prenomDuNomWa(f.nom) : undefined;
    return dire(msgMeme(false, avecSalut) ?? msgBesoin(false, avecSalut));
  };

  const accueil = (mots: MotsDuTour): SortieDuTour => {
    base.panier = {
      ...(mots.jourVoulu ? { jourVoulu: mots.jourVoulu } : {}),
      ...(mots.jourEvite ? { jourEvite: mots.jourEvite } : {}),
      ...(mots.moment ? { moment: mots.moment } : {}),
    };
    base.prisLe = maintenant;
    base.rdvId = undefined;
    base.mainPasseeLe = undefined;
    base.motifMain = undefined;
    base.etapeAvantLaMain = undefined;
    base.versionAvantLaMain = undefined;
    if (fiches.length === 0) return dire(msgBesoin(false, true));
    if (fiches.length === 1 && titulaire) return pourLaFiche(titulaire, true);
    return dire(msgQui(false, true));
  };

  const introDeLaConsultation = (b: Besoin, nom: string): string => {
    if (base.panier.pourQui) return `Cela commence toujours par une consultation, ${appel()} : ${laConsultationDiteWa(nom)}. Voici les prochaines places.`;
    if (b === 'creation') return `Une première couronne commence toujours par une consultation, ${appel()} : ${laConsultationDiteWa(nom)}. Nous y étudions votre texture et votre cuir chevelu, et choisissons ensemble votre calibre. Voici les prochaines places.`;
    if (b === 'reparation') return `Une réparation commence toujours par une consultation, ${appel()} : ${laConsultationDiteWa(nom)}. Nous y regardons vos locks et décidons ensemble du soin. Voici les prochaines places.`;
    return `Pour un enfant, tout commence par un échange avec ses parents, ${appel()} : ${laConsultationDiteWa(nom)}. Voici les prochaines places.`;
  };

  /** La consultation du parcours si elle existe encore, sinon toutes : on
      ne ferme jamais la porte sur un identifiant qui a changé de nom. */
  const consultationsPour = (b: Besoin): PrestationDuTour[] => {
    const toutes = (agenda?.prestations ?? []).filter((s) => reservableWa(s) && estUneConsultation(s, cats));
    const sienne = agenda?.consultationParParcours?.[b];
    const laSienne = sienne ? toutes.filter((s) => s.id === sienne) : [];
    return laSienne.length > 0 ? laSienne : toutes;
  };

  const formulesOffertes = (): string[][] => {
    const formules = (agenda?.formules ?? [])
      .map((f) => [...f.serviceIds])
      .filter((ids) => ids.length > 0 && ids.length <= 6 && ids.every((id) => directe(prestation(id))));
    if (formules.length > 0) return formules.slice(0, 8);
    return (agenda?.prestations ?? []).filter((s) => directe(s))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')).slice(0, 8).map((s) => [s.id]);
  };

  const choisisLeBesoin = (b: Besoin): SortieDuTour => {
    base.panier.besoin = b;
    if (b === 'entretien') return dire(msgRituel(false, formulesOffertes()), 'autre-soin');
    const consult = consultationsPour(b);
    if (consult.length === 0) return laMain('sans-place', true);
    if (consult.length > 1) return dire(msgRituel(false, consult.map((s) => [s.id])), 'sans-place');
    base.panier.serviceIds = [consult[0].id];
    return dire(msgPlaces({ intro: introDeLaConsultation(b, consult[0].name) }));
  };

  const placePrise = (p: PlaceLibre): SortieDuTour =>
    dire(msgPlaces({ intro: `Cette heure vient d'être prise, ${appel()}. Voici les places les plus proches.`, proche: p, exclure: p }));

  const choisisLaPlace = (p: PlaceLibre): SortieDuTour => {
    const libre = p.iso > aujourdhui && placesLibresDuPanier().some((x) => x.iso === p.iso && x.heure === p.heure);
    if (!libre) return placePrise(p);
    base.panier.date = p.iso;
    base.panier.time = p.heure;
    base.panier.dureeMin = dureeDesPrestations(base.panier.serviceIds ?? [], agenda?.prestations ?? []);
    if (!base.panier.clientId) {
      if (!base.panier.civilite) return dire(msgCivilite(false));
      if (!base.panier.prenom) return dire(msgPrenom(false));
    }
    return dire(msgRecap(false) ?? msgPlaces({}));
  };

  /** « JE CONFIRME » : la place est rejouée sur l'instantané du tour, puis
      l'écriture part au verrou. Aucun message ici : la confirmation, ou la
      place prise, vient avec le verdict (`suiteDeLaPose`). */
  const poseLeRendezVous = (): SortieDuTour => {
    const p = base.panier;
    if (!p.date || !p.time || !p.serviceIds?.length || !agenda) return dire(msgPlaces({}));
    const place = { iso: p.date, heure: p.time };
    const libre = p.date > aujourdhui && placesLibresDuPanier().some((x) => x.iso === place.iso && x.heure === place.heure);
    if (!libre) return placePrise(place);
    if (!p.clientId && (!p.civilite || !p.prenom)) return dire(msgCivilite(false));
    const waId = tour?.choix?.waId;
    if (!waId) return laMain('erreur', true);
    const cle = cleCourte(waId);
    const fiche = ficheChoisie();
    const rdvId = `rdv-wa-${cle}`;
    const quand = `${jourDitAvecAnnee(p.date)} à ${heureDite(p.time)}`;
    const dureeMin = p.dureeMin ?? dureeDesPrestations(p.serviceIds, agenda.prestations);
    const rdv: RdvAPoser = {
      id: rdvId,
      branchId: agenda.branchId,
      clientId: fiche?.id ?? '',
      clientName: fiche?.nom || p.prenom || 'Réservation WhatsApp',
      serviceIds: [...p.serviceIds],
      date: p.date,
      time: p.time,
      dureeMin,
      status: 'confirmé',
      source: 'whatsapp',
      creeLe: maintenant,
      note: `Pris sur WhatsApp · réponse automatique${ctx.reglage.mode === 'essai' ? ' · essai' : ''}`,
    };
    const demande: DemandeAPoser | undefined = fiche ? undefined : {
      id: `dem-wa-${cle}`,
      genre: 'rdv',
      createdAt: maintenant,
      branchId: agenda.branchId,
      prenom: p.prenom ?? '',
      civilite: p.civilite ?? 'madame',
      telephone: `+${ctx.numero}`,
      besoin: p.besoin ?? 'entretien',
      source: 'whatsapp',
      serviceIds: [...p.serviceIds],
      date: p.date,
      time: p.time,
      apptId: rdvId,
      consentementLe: tour?.quand || maintenant,
      statut: 'nouvelle',
    };
    const envoi: EnvoiAPoser = {
      id: `conf-${rdvId}-whatsapp`,
      branchId: agenda.branchId,
      type: 'confirmation',
      canal: 'whatsapp',
      apptId: rdvId,
      ...(fiche ? { clientId: fiche.id } : {}),
      prenom: appel(),
      numero: `+${ctx.numero}`,
      dateRdv: p.date,
      heure: p.time,
      moment: quand,
      statut: 'en cours',
      detail: 'dit dans la conversation',
      quand: maintenant,
    };
    return { messages: [], etat: base, ecritures: [{ genre: 'pose', rdv, ...(demande ? { demande } : {}), envoi }], pris: true };
  };

  /** LE VERDICT DU VERROU. Posé : la confirmation, signée de la devise.
      L'heure prise entre-temps : les places les plus proches, rien n'est
      posé. Autre chose : la main passe. */
  const ditLeVerdict = (verdict: VerdictDeLaPose): SortieDuTour => {
    const p = base.panier;
    if (verdict.ok) {
      base.rdvId = verdict.id;
      passe('confirme');
      const de = p.pourQui ? `le rendez-vous de ${p.pourQui}` : 'votre rendez-vous';
      const itineraire = String(ctx.maison.itineraire ?? '').trim();
      const corps = [
        `C'est confirmé, ${appel()} : ${de} est retenu le ${quandDuPanier()}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`,
        itineraire && texteSain(itineraire).length === 0 ? coupeWa(itineraire, 600) : '',
        ligneGoogleMapsWa(lienMapsWa(ctx.maison.carte)),
        DEVISE,
      ].filter(Boolean).join('\n\n');
      return sortie([texte('confirme', corps)], alerteDeLAutomate({
        genre: 'pose', prenom: prenomPourAlerte(), numero: ctx.numero, date: p.date, time: p.time,
      }));
    }
    if (['creneau_pris', 'creneau_plafond', 'creneau_complet', 'creneau_hors_ouverture', 'creneau_ferme'].includes(verdict.raison) && p.date && p.time) {
      return placePrise({ iso: p.date, heure: p.time });
    }
    return laMain('erreur', true);
  };

  /* ── LE TOUR ── */
  const joue = (t: TourDeLaCliente): SortieDuTour => {
    const mots = motsReconnus(t.texte, ms);
    const enCours = ETAPES_EN_COURS.includes(base.etape);
    const ch = lisLeChoix(t.choix?.id);

    /* « Je confirme » du récapitulatif en cours passe même au-delà du
       plafond : elle a confirmé, elle reçoit sa confirmation. */
    const confirme = base.etape === 'recap' && ch?.geste === 'oui' && ch.version >= base.versionDeLEtape && ch.version < version;
    if (envoisQuiComptent(base.envois, ctx.main, ms) >= plafondDuFil(base) && !confirme) return laMain('plafond', false);
    if (enCours && t.media) return laMain('media', false);
    if (enCours && mots.prix && !ch) {
      /* Le conseil a peut-être la réponse (14 octobre 2026). */
      const q = questionDuTour(t.texte, false);
      if (q) return q;
      return laMain('prix', false);
    }
    if (ch?.geste === 'maison') return laMain('demande', true);
    /* LE JOUR MÊME ne se réserve jamais ici : la Maison répond elle-même
       (la nuit, elle dit quand). */
    if (mots.jourMeme) {
      return laMain('jour-meme', true, prochaineOuvertureDite(ms, agenda?.semaine ?? [], agenda?.exceptions ?? []) === null
        ? `Pour aujourd'hui, une personne de la Maison vous répond ici, ${appel()}.`
        : laMainDite());
    }
    if (mots.deplacer || (mots.annuler && (!enCours || mots.parleDUnRdv))) {
      return laMain('annulation', true, `Nous transmettons votre demande, ${appel()}. La Maison vous répond ici.`);
    }
    if (mots.annuler && enCours) {
      passe('clos');
      return sortie([texte('clos', `C'est noté, ${appel()} : rien n'est réservé. Écrivez-nous quand vous le souhaitez.`)]);
    }
    if (!enCours) {
      /* LE CONSEIL AU REPOS (14 octobre 2026) : une question qu'il reconnaît,
         le cuir chevelu, ou, la nuit, une question qu'il ne sait pas. */
      if (!ch && conseilActif(ctx.conseil)) {
        const neuve = ctx.premierMessage && fiches.length === 0;
        const q = questionDuTour(t.texte, neuve);
        if (q) {
          /* Un parcours neuf : rien de l'ancien panier ne suit la réponse. */
          base.panier = {};
          base.prisLe = maintenant;
          base.rdvId = undefined;
          return q;
        }
        if (uneQuestionAutre(t.texte, ms) && !intentionDeReserver(t.texte)) {
          const quand = prochaineOuvertureDite(ms, agenda?.semaine ?? [], agenda?.exceptions ?? []);
          if (quand === null) return silence();
          base.prisLe = maintenant;
          return laMain('question', true);
        }
      }
      return accueil(mots);
    }
    if (!agenda) return laMain('erreur', true);

    if (ch) {
      const valide = ch.version >= base.versionDeLEtape && ch.version < version;
      /* UN VIEUX TOUCHER renvoie l'étape où l'on est : ce n'est pas un écart. */
      if (!valide) return renvoie(base.etape, false);
      const g = ch.geste;
      const arg = ch.argument ?? '';
      switch (base.etape) {
        case 'qui': {
          const f = g === 'qui' ? fiches.find((x) => x.id === arg) : undefined;
          if (f) return pourLaFiche(f, false);
          if (g === 'moi' && pourMoiPossible) {
            base.panier.clientId = undefined;
            base.panier.pourQui = undefined;
            return dire(msgBesoin(false, false));
          }
          if (g === 'autre-personne') return laMain('autre-personne', true);
          break;
        }
        case 'besoin':
          if (g === 'besoin' && (arg === 'entretien' || arg === 'creation' || arg === 'reparation' || arg === 'enfant')) {
            return choisisLeBesoin(arg);
          }
          if (g === 'questions') return dire(msgQuestions(0), 'question');
          break;
        case 'questions': {
          if (g === 'reponse') {
            const e = envoyables().find((x) => x.r.id === arg);
            if (e) return dire(msgReponse(e, false));
            return laMain('question', true);
          }
          if (g === 'plus') return dire(msgQuestions(Number(arg) || 0), 'question');
          break;
        }
        case 'reponse': {
          if (g === 'questions') return dire(msgQuestions(0), 'question');
          if (g === 'reserver') {
            base.panier.reprendre = undefined;
            if (arg === 'entretien' || arg === 'creation' || arg === 'reparation' || arg === 'enfant') return choisisLeBesoin(arg);
            return dire(msgBesoin(false, false));
          }
          if (g === 'reprendre') {
            const e = base.panier.reprendre;
            base.panier.reprendre = undefined;
            if (e && ETAPES_EN_COURS.includes(e) && e !== 'questions' && e !== 'reponse') {
              passe(e);
              return renvoie(e, false);
            }
            return dire(msgBesoin(false, false));
          }
          break;
        }
        case 'meme': {
          if (g === 'meme') {
            const v = venueReprenable(ficheChoisie());
            if (!v) return dire(msgBesoin(false, false));
            base.panier.besoin = 'entretien';
            base.panier.serviceIds = [...v.serviceIds];
            return dire(msgPlaces({}));
          }
          if (g === 'autre') return dire(msgBesoin(false, false));
          break;
        }
        case 'rituel': {
          if (g === 'rituel') {
            const ids = base.panier.rituels?.[Number(arg)];
            if (!ids || !ids.every((id) => reservableWa(prestation(id)))) return renvoie('rituel', false);
            const deja = base.panier.enAjout ? (base.panier.serviceIds ?? []) : [];
            base.panier.serviceIds = [...deja, ...ids.filter((id) => !deja.includes(id))];
            const ajoutee = !!base.panier.enAjout;
            base.panier.enAjout = false;
            base.panier.dansLesSoins = false;
            const unique = ids.length === 1 ? prestation(ids[0]) : undefined;
            const consultation = unique && estUneConsultation(unique, cats);
            if (consultation && !ajoutee) return dire(msgPlaces(base.panier.besoin ? { intro: introDeLaConsultation(base.panier.besoin, unique.name) } : {}));
            return apresLeRituel();
          }
          if (g === 'autre-soin') {
            /* Depuis une liste de rituels : les soins du cheveu ; depuis la
               liste des soins elle-même : une personne de la Maison. */
            if (!base.panier.dansLesSoins && soinsDuCheveu().length > 0) return dire(msgRituel(false, soinsDuCheveu(), !!base.panier.enAjout, true) ?? msgPlaces({}));
            return laMain('autre-soin', true);
          }
          break;
        }
        case 'encore': {
          if (g === 'encore') return ajouteUnSoin(false);
          if (g === 'suffit') return dire(msgPlaces({}));
          break;
        }
        case 'places': {
          if (g === 'place') {
            const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(arg);
            if (m) return choisisLaPlace({ iso: `${m[1]}-${m[2]}-${m[3]}`, heure: `${m[4]}:${m[5]}` });
          }
          if (g === 'autre-jour') return dire(msgJours(false));
          if (g === 'revoir') return dire(msgPlaces({}));
          break;
        }
        case 'jours': {
          const m = g === 'jour' ? /^(\d{4})(\d{2})(\d{2})$/.exec(arg) : null;
          if (m) {
            base.panier.jourChoisi = `${m[1]}-${m[2]}-${m[3]}`;
            return dire(msgPlaces({}));
          }
          break;
        }
        case 'civilite':
          if (g === 'civ' && (arg === 'madame' || arg === 'mademoiselle' || arg === 'monsieur')) {
            base.panier.civilite = arg;
            return dire(base.panier.prenom ? (msgRecap(false) ?? msgPlaces({})) : msgPrenom(false));
          }
          break;
        case 'recap':
          if (g === 'oui') return poseLeRendezVous();
          if (g === 'autre-heure') {
            base.panier.date = undefined;
            base.panier.time = undefined;
            base.panier.jourChoisi = undefined;
            return dire(msgPlaces({}));
          }
          break;
        default:
          break;
      }
      return renvoie(base.etape, false);
    }

    /* LE CONSEIL D'ABORD (14 octobre 2026) : une question qu'une réponse
       validée reconnaît, ou le cuir chevelu, en plein parcours aussi. */
    const qDuTour = questionDuTour(t.texte, false);
    if (qDuTour) return qDuTour;
    /* Après une réponse, ou devant la liste : une envie de réserver ouvre le
       parcours ; le reste (« merci », une autre phrase), la Maison le lit. */
    if (base.etape === 'questions' || base.etape === 'reponse') {
      if (intentionDeReserver(t.texte) || mots.jourVoulu || mots.moment) return accueil(mots);
      return silence();
    }
    /* UNE QUESTION QUI N'EST PAS DE RÉSERVER ne s'avale jamais : la main
       passe, dite, et l'équipe la lit (relecture du 9 octobre 2026). */
    if (uneQuestionAutre(t.texte, ms)) return laMain('question', true);
    /* Un texte : les mots reconnus d'abord, puis la civilité et le prénom,
       sinon un écart. Des mots qui ne changent rien à ce qu'elle veut (le
       même « samedi », encore) sont un écart : la même liste ne revient pas
       sans fin. */
    const desMots = !!(mots.jourVoulu || mots.moment || mots.jourEvite);
    const retiensLesMots = (): boolean => {
      const p = base.panier;
      const avant = [p.jourVoulu, p.moment, p.jourEvite].join('|');
      const jourVoulu = mots.jourVoulu ?? (mots.jourEvite && p.jourVoulu === mots.jourEvite ? undefined : p.jourVoulu);
      const jourEvite = mots.jourEvite ?? (mots.jourVoulu && p.jourEvite === mots.jourVoulu ? undefined : p.jourEvite);
      const moment = mots.moment ?? p.moment;
      if ([jourVoulu, moment, jourEvite].join('|') === avant) return false;
      p.jourVoulu = jourVoulu;
      p.moment = moment;
      p.jourEvite = jourEvite;
      p.jourChoisi = undefined;
      return true;
    };
    switch (base.etape) {
      case 'places':
      case 'jours':
        if (desMots) return retiensLesMots() ? dire(msgPlaces({})) : ecart();
        if (base.etape === 'places' && base.panier.besoin === 'creation' && /\bcrea|\bcreer\b/.test(sansAccentsWa(t.texte))) {
          return sortie([boutons('places', `La création se décide après la consultation, ${appel()}. Une personne de la Maison peut vous en dire plus.`, [
            { id: choix('revoir'), titre: 'Voir les places' },
          ])]);
        }
        break;
      case 'recap':
        if (desMots) {
          if (!retiensLesMots()) return ecart();
          base.panier.date = undefined;
          base.panier.time = undefined;
          return dire(msgPlaces({}));
        }
        break;
      case 'civilite': {
        /* ÉCRITE AU LIEU D'ÊTRE TOUCHÉE (relecture du 9 octobre 2026) :
           « Madame », « Mme Grace », « Monsieur Koffi ». */
        const c = civiliteLue(t.texte);
        if (c) {
          base.panier.civilite = c.civilite;
          if (c.prenom) base.panier.prenom = c.prenom;
          return dire(base.panier.prenom ? (msgRecap(false) ?? msgPlaces({})) : msgPrenom(false));
        }
        if (desMots) return retiensLesMots() ? renvoie(base.etape, false) : ecart();
        break;
      }
      case 'encore': {
        /* ÉCRIT AU LIEU D'ÊTRE TOUCHÉ (13 octobre 2026) : « Merci, c'est
           tout », « Non merci, plutôt samedi matin » (le jour se garde),
           « Oui », « Je voudrais aussi un resserrage ». */
        const mot = sansAccentsWa(t.texte);
        if (/\b(non|nan)\b|c'est tout|c'est bon|ca suffit|ca ira|rien d'autre|pas d'autre|pas besoin|\bsuffit\b/.test(mot)) {
          if (desMots) retiensLesMots();
          return dire(msgPlaces({}));
        }
        if (/^(oui|ouais)\b|\b(ajout\w*|rajout\w*|aussi|encore|un autre|une autre|un deuxieme|un second|en plus)\b/.test(mot)) return ajouteUnSoin(false);
        if (desMots) return retiensLesMots() ? renvoie(base.etape, false) : ecart();
        break;
      }
      case 'prenom': {
        /* « Mme Grace » : la civilité se corrige, le prénom se garde. */
        const c = civiliteLue(t.texte);
        const change = !!c && c.civilite !== base.panier.civilite;
        if (c) base.panier.civilite = c.civilite;
        const prenom = c ? (c.prenom ?? null) : prenomLu(t.texte);
        if (prenom) {
          base.panier.prenom = prenom;
          return dire(msgRecap(false) ?? msgPlaces({}));
        }
        if (change) return dire(msgPrenom(false));
        break;
      }
      default:
        if (desMots) return retiensLesMots() ? renvoie(base.etape, false) : ecart();
        break;
    }
    return ecart();
  };

  /** La reprise : l'étape où il en était, dite à neuf (pas la relance). */
  const reprend = (): SortieDuTour => renvoie(base.etape, false);

  return { base, joue, laMain, ditLeVerdict, reprend };
}

/** LE PRÉNOM QU'ELLE ÉCRIT : « Awa », « je m'appelle Awa », « moi c'est
    Awa ». Pas de chiffre, trois mots au plus, des lettres. */
function prenomLu(brut: string): string | null {
  let t = String(brut ?? '').trim().replace(/\s+/g, ' ');
  const m = /^(?:je m(?:'|’|\s)?appelle|moi c'?est|moi c’est|c'?est|c’est|je suis|mon pr[ée]nom (?:est|c'?est|c’est))\s+(.+)$/i.exec(t);
  if (m) t = m[1];
  t = t.replace(/[.!,;:]+$/, '').trim();
  if (!t || t.length > 40 || /\d/.test(t)) return null;
  if (!/^\p{L}[\p{L}'’\- ]*$/u.test(t)) return null;
  const mots = t.split(' ');
  if (mots.length > 3) return null;
  if (/^(bonjour|bonsoir|oui|non|merci|ok|okay|salut|madame|mademoiselle|monsieur|mme|mlle|melle|mr|svp|stp)$/.test(sansAccentsWa(mots[0]))) return null;
  return mots.map((w) => w.split('-').map((p) => (p ? `${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}` : p)).join('-')).join(' ');
}

/** LA CIVILITÉ QU'ELLE ÉCRIT au lieu de la toucher (relecture du 9 octobre
    2026) : « Madame », « Mme Grace », « mademoiselle », « Mlle Awa »,
    « Monsieur Koffi », « M. Koffi ». Le prénom qui suit, s'il se lit, est
    retenu. Rien d'autre : `null`. */
function civiliteLue(brut: string): { civilite: CiviliteDuFil; prenom?: string } | null {
  const t = String(brut ?? '').trim().replace(/\s+/g, ' ');
  const m = /^(madame|mme|mademoiselle|mlle|melle|monsieur|mr|m(?=\.))\.?(?:\s+(.+?))?[.!,;:]*$/i.exec(t);
  if (!m) return null;
  const mot = sansAccentsWa(m[1]);
  const civilite: CiviliteDuFil = mot === 'mademoiselle' || mot === 'mlle' || mot === 'melle' ? 'mademoiselle'
    : mot === 'monsieur' || mot === 'mr' || mot === 'm' ? 'monsieur' : 'madame';
  const prenom = m[2] ? prenomLu(m[2]) : null;
  return { civilite, ...(prenom ? { prenom } : {}) };
}

/** UN TOUR DE LA CONVERSATION. Rend les messages à envoyer (un au plus),
    l'état à écrire (`avance_le_fil`), les écritures (le rendez-vous, au
    « Je confirme » seulement), et l'alerte au personnel. `pris: false` : ce
    tour n'est pas à lui, rien ne s'écrit et le webhook prévient comme
    d'habitude. */
/** LA REPRISE TOUT DE SUITE (13 octobre 2026) : « quand je débloque en
    rendant à l'automate, pourquoi ne prend-il pas immédiatement la
    relève ? » (Yéman). L'équipe vient de lui rendre le fil : il renvoie
    l'étape où il s'était arrêté, sans attendre un message d'elle. Rien ne
    part si rien n'est en cours (repos, rendez-vous posé, parcours
    périmé), si la main de l'équipe tient encore, ou si le numéro n'est pas
    servi. La fenêtre de 24 heures se juge dans la fonction. */
function repriseDuFil(ancien: EtatDuFil | null | undefined, ctx: ContexteDuTour): SortieDuTour {
  const rien = (etat: EtatDuFil): SortieDuTour => ({ messages: [], etat, ecritures: [], pris: false });
  if (!ancien) return rien(etatNeufDuFil(ctx.numero, isoWa(ctx.maintenantMs)));
  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir) || pauseActive(ctx.main, ctx.maintenantMs)) return rien(ancien);
  if (!ETAPES_EN_COURS.includes(etapeCourante(ancien, ctx.main, ctx.maintenantMs, ctx.reglage.pauseHeures))) return rien(ancien);
  return atelierDuTour(ancien, null, ctx, false, true).reprend();
}

function etapeSuivante(ancien: EtatDuFil | null, tour: TourDeLaCliente, ctx: ContexteDuTour): SortieDuTour {
  const juge = jugeLaParole(ancien, tour, ctx);
  if (juge.parole === 'silence') {
    return { messages: [], etat: ancien ?? etatNeufDuFil(ctx.numero, isoWa(ctx.maintenantMs)), ecritures: [], pris: false };
  }
  const atelier = atelierDuTour(ancien, tour, ctx, false);
  if (juge.parole === 'main-silencieuse') return atelier.laMain(juge.motif ?? 'erreur', false);
  return atelier.joue(tour);
}

/** APRÈS LE VERROU : `etat` est celui que `etapeSuivante` vient de rendre
    avec l'écriture `pose` ; la version ne monte pas (une écriture par tour). */
function suiteDeLaPose(etat: EtatDuFil, verdict: VerdictDeLaPose, ctx: ContexteDuTour): SortieDuTour {
  return atelierDuTour(etat, null, ctx, true).ditLeVerdict(verdict);
}

/** APRÈS COUP : META A REFUSÉ LE MESSAGE DU TOUR (fenêtre fermée, compte
    sans moyen de paiement, numéro injoignable), ou le message ne passait
    pas les juges de la Maison. `etat` est celui que le tour vient d'écrire.
    La main passe SANS UN MOT de plus (un second message ne partirait pas
    mieux) : sans cela le fil se dirait tenu, l'alarme se tairait, et elle
    attendrait une réponse qui n'est jamais partie. C'est une seconde
    écriture du tour : la version monte. */
function mainApresCoup(etat: EtatDuFil, motif: MotifDeLaMain, ctx: ContexteDuTour): SortieDuTour {
  return atelierDuTour(etat, null, ctx, false).laMain(motif, false);
}
/* ⟨/automate-wa⟩ */

/* ══ CE QUE LE DIALOGUE VOIT DE L'AGENDA ═══════════════════════════════
   Ni l'écran ni la cliente ne calculent une place : ce serveur la calcule
   sur l'instantané qu'il vient de lire, par le juge recopié ci-dessus
   (⟨place-du-serveur⟩, le même que demande-submit) : `placesLibres` pour la
   liste, `laPlaceTient` au « Je confirme », `reservableSurLeSite` pour dire
   au dialogue ce qui se réserve en ligne, `CONSULTATION_PAR_PARCOURS` pour
   la consultation de chaque parcours. Les places se calculent à la demande
   et se gardent le temps du tour ; `oublie` les efface quand un instantané
   plus frais des créneaux pris est arrivé. */
type AgendaLu = { lignes: LignesDeLAgenda; agenda: AgendaDuServeur };

function agendaDuTourWa(lu: AgendaLu, ms: number, horizon: number): { agenda: AgendaDuTour; oublie: () => void } {
  const gardees = new Map<string, PlaceLibre[]>();
  const a = lu.agenda;
  const agenda: AgendaDuTour = {
    branchId: a.branchId,
    prestations: a.services.map((s): PrestationDuTour => ({
      id: s.id,
      name: s.name ?? '',
      categoryId: s.categoryId,
      ...(s.priceMode ? { priceMode: s.priceMode } : {}),
      ...(s.hidePrice ? { hidePrice: true } : {}),
      ...(s.consultationAvant ? { consultationAvant: true } : {}),
      ...(s.durationMin !== undefined ? { durationMin: s.durationMin } : {}),
      reservable: reservableSurLeSite(s, a.categories, a.masques),
    })),
    categories: a.categories,
    formules: a.formules,
    consultationParParcours: CONSULTATION_PAR_PARCOURS,
    semaine: a.semaine,
    exceptions: a.exceptions,
    /* `lu.agenda` se lit à chaque appel : après un instantané frais, les
       places le savent. */
    places: (ids) => {
      const cle = ids.join('|');
      const deja = gardees.get(cle);
      if (deja) return deja;
      const p = placesLibres(lu.agenda, ids, ms, horizon);
      gardees.set(cle, p);
      return p;
    },
  };
  return { agenda, oublie: () => gardees.clear() };
}

/* ══ LA BASE ═══════════════════════════════════════════════════════════ */
type Sb = SupabaseClient;
// deno-lint-ignore no-explicit-any
type Ligne = { id: string; data?: Record<string, any> | null };

/** Les réglages du tour, en une lecture. `null` : la base ne répond pas. */
// deno-lint-ignore no-explicit-any
async function litLesDocuments(sb: Sb): Promise<Map<string, any> | null> {
  const { data, error } = await sb.from('documents').select('key, data').in('key', DOCUMENTS_DU_TOUR);
  if (error) { dis('documents illisibles', { motif: error.message.slice(0, 120) }); return null; }
  // deno-lint-ignore no-explicit-any
  return new Map(((data ?? []) as { key: string; data: any }[]).map((d) => [d.key, d.data]));
}

/** UNE TABLE, PAGE PAR PAGE, à la suite du dernier id lu (le plafond de
    mille lignes de Supabase ne coupe rien en silence). `null` : une page a
    manqué, et une table à moitié lue ne passe pas pour entière. */
// deno-lint-ignore no-explicit-any
async function litParPages(sb: Sb, table: string, filtre: (q: any) => any = (q) => q): Promise<Ligne[] | null> {
  const { data, error } = await litToutesLesPages<Ligne>((apres, taille) => {
    let page = filtre(sb.from(table).select('id, data'));
    if (apres !== null) page = page.gt('id', apres);
    return page.order('id', { ascending: true }).limit(taille) as unknown as PromiseLike<ReponseDePage<Ligne>>;
  });
  if (error) { dis('lecture par pages refusee', { table, motif: error.message.slice(0, 120) }); return null; }
  return data ?? [];
}

/** LES CRÉNEAUX PRIS (`creneaux_occupes`, 0079 redéfinie en 0125 : la durée
    figée à la pose d'abord), par tranches de sept jours, tels que la base
    les rend (le juge les met en forme). Une tranche de mille lignes pile
    est une erreur : elle est peut-être coupée. */
async function litLesCreneaux(sb: Sb, branchId: string, du: string, au: string): Promise<Record<string, unknown>[] | null> {
  const out: Record<string, unknown>[] = [];
  for (let debut = du; debut <= au; debut = isoPlusJoursWa(debut, TRANCHE_JOURS)) {
    const finDeTranche = isoPlusJoursWa(debut, TRANCHE_JOURS - 1);
    const fin = finDeTranche < au ? finDeTranche : au;
    const { data, error } = await sb.rpc('creneaux_occupes', { p_branch: branchId, p_du: debut, p_au: fin });
    if (error) { dis('creneaux illisibles', { motif: error.message.slice(0, 120) }); return null; }
    const lignes = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    if (lignes.length >= PLAFOND_DE_LIGNES) { dis('creneaux · tranche de mille lignes pile, on ne s y fie pas'); return null; }
    out.push(...lignes);
  }
  return out;
}

const texteOu = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

/** L'AGENDA DU TOUR : la branche (celle de la fiche, sinon la vedette
    active, sinon la première), le catalogue et ses familles (par pages),
    les murs et les créneaux pris de J+1 à l'horizon, et les réglages déjà
    lus ; mis en forme par le juge (`agendaDepuisLesLignes`). Les lignes se
    gardent : au « Je confirme », celles du jour se relisent fraîches. `null`
    si une seule lecture manque : sans agenda sûr, aucune place. */
// deno-lint-ignore no-explicit-any
async function litLAgenda(sb: Sb, docs: Map<string, any>, voulue: string | undefined, aujourdhui: string, horizon: number): Promise<AgendaLu | null> {
  const du = isoPlusJoursWa(aujourdhui, 1);
  const au = isoPlusJoursWa(aujourdhui, horizon);
  const { data: lignesBranches, error: errBranches } = await sb.from('branches').select('id, data');
  if (errBranches) { dis('branches illisibles', { motif: errBranches.message.slice(0, 120) }); return null; }
  const branches = (lignesBranches ?? []) as Ligne[];
  const branche = (voulue && branches.find((b) => b.id === voulue))
    || branches.find((b) => b.data?.flagship && b.data?.status !== 'paused')
    || branches[0];
  if (!branche) { dis('aucune branche'); return null; }
  const [services, categories, blocages, occupes] = await Promise.all([
    litParPages(sb, 'catalog_services'),
    litParPages(sb, 'catalog_categories'),
    litParPages(sb, 'blocages', (q) => q.eq('data->>branchId', branche.id).gte('data->>date', du).lte('data->>date', au)),
    litLesCreneaux(sb, branche.id, du, au),
  ]);
  if (!services || !categories || !blocages || !occupes) return null;
  const lignes: LignesDeLAgenda = {
    branche,
    reglages: docs.get('mnd_settings'),
    exceptions: docs.get('mnd_horaires_exceptions'),
    vitrine: docs.get('mnd_vitrine_config'),
    services,
    categories,
    blocages,
    occupes,
  };
  const agenda = agendaDepuisLesLignes(lignes);
  if (!agenda) { dis('agenda illisible'); return null; }
  return { lignes, agenda };
}

/** LES MESSAGES REÇUS DE CE NUMÉRO, des 15 dernières minutes. */
async function litLesEntrants(sb: Sb, numero: string, ms: number): Promise<MessageEntrantDuTour[] | null> {
  const depuis = new Date(ms - TOUR_PERIME_MS).toISOString();
  const { data, error } = await sb.from('messages_wa').select('id, data')
    .eq('data->>numero', numero).eq('data->>sens', 'entrant').gte('data->>quand', depuis)
    .order('data->>quand', { ascending: false }).limit(40);
  if (error) { dis('messages illisibles', { motif: error.message.slice(0, 120) }); return null; }
  return ((data ?? []) as Ligne[]).map((l) => l.data ?? {}).filter((d) => d.waId && d.quand).map((d) => ({
    waId: String(d.waId),
    quand: String(d.quand),
    ...(typeof d.texte === 'string' ? { texte: d.texte } : {}),
    ...(typeof d.type === 'string' ? { type: d.type } : {}),
    sens: String(d.sens ?? 'entrant'),
    ...(typeof d.canal === 'string' ? { canal: d.canal } : {}),
    ...(d.bouton && typeof d.bouton === 'object' ? { bouton: { id: texteOu(d.bouton.id), texte: texteOu(d.bouton.texte) } } : {}),
    ...(d.formulaire ? { formulaire: d.formulaire } : {}),
  }));
}

/** LE TOUR DE CE NUMÉRO, tel que cet appel le voit :
      · `traite` : ses messages sont déjà dans un tour écrit (un autre appel
        les a pris) ;
      · `pas-a-lui` : ses messages ne font pas de tour (trop vieux, déjà
        dépassés, un bouton d'un autre parcours) ;
      · `un-autre` : un message plus récent de la même rafale existe, c'est
        l'appel de celui-là qui répond ;
      · sinon, le tour : les messages neufs de la rafale, joints.
    Les ex aequo se rangent par identifiant : deux appels de la même rafale
    voient le même dernier message, et un seul répond. */
async function leTourDuNumero(
  sb: Sb, numero: string, waIds: readonly string[], fil: EtatDuFil | null, ms: number,
): Promise<TourDeLaCliente | 'traite' | 'pas-a-lui' | 'un-autre' | null> {
  const entrants = await litLesEntrants(sb, numero, ms);
  if (!entrants) return null;
  const traites = new Set(Array.isArray(fil?.traites) ? fil!.traites : []);
  if (waIds.length > 0 && waIds.every((w) => traites.has(w))) return 'traite';
  const depuisLeDernier = String(fil?.dernierEntrantQuand ?? '');
  const neufs = entrants
    .filter((m) => !!m.waId && !traites.has(m.waId) && Number.isFinite(msWa(m.quand)))
    .filter((m) => !depuisLeDernier || m.quand >= depuisLeDernier)
    .sort((a, b) => msWa(a.quand) - msWa(b.quand) || (String(a.waId) < String(b.waId) ? -1 : String(a.waId) > String(b.waId) ? 1 : 0));
  const siens = neufs.filter((m) => waIds.includes(String(m.waId)));
  if (siens.length === 0) return 'pas-a-lui';
  const ancre = Math.max(...siens.map((m) => msWa(m.quand)));
  const rafale = neufs.filter((m) => msWa(m.quand) >= ancre - RAFALE_MS);
  const tour = tourDeLaCliente(rafale, [...traites]);
  if (tour.waIds.length === 0) return 'pas-a-lui';
  if (!waIds.includes(tour.waIds[tour.waIds.length - 1])) return 'un-autre';
  return tour;
}

/** LES FICHES DU NUMÉRO (0125), telles que le dialogue les lit. `null` :
    la base ne répond pas, et l'automate laisse la Maison répondre. */
async function lesFichesDuNumero(sb: Sb, numero: string): Promise<FicheDuNumero[] | null> {
  const { data, error } = await sb.rpc('fiches_du_numero', { n: numero });
  if (error || !Array.isArray(data)) {
    dis('fiches_du_numero illisible', { motif: String(error?.message ?? 'reponse illisible').slice(0, 120) });
    return null;
  }
  return (data as Record<string, unknown>[]).filter((f) => f && typeof f.id === 'string' && f.id).map((f): FicheDuNumero => {
    const civ = f.civilite === 'madame' || f.civilite === 'mademoiselle' || f.civilite === 'monsieur' ? f.civilite : undefined;
    const v = f.derniereVenue as { date?: unknown; serviceIds?: unknown } | null | undefined;
    const venue = v && typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && Array.isArray(v.serviceIds)
      ? { date: v.date, serviceIds: (v.serviceIds as unknown[]).map((x) => String(x ?? '')).filter(Boolean) }
      : undefined;
    const p = f.prochainRdv as { date?: unknown; time?: unknown } | null | undefined;
    const prochain = p && typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date)
      ? { date: p.date, ...(typeof p.time === 'string' && p.time ? { time: p.time } : {}) }
      : undefined;
    return {
      id: String(f.id),
      nom: String(f.nom ?? ''),
      ...(civ ? { civilite: civ } : {}),
      ...(f.auMasculin === true ? { auMasculin: true } : {}),
      ...(texteOu(f.branchId) ? { branchId: String(f.branchId) } : {}),
      ...(texteOu(f.familyId) ? { familyId: String(f.familyId) } : {}),
      ...(texteOu(f.naissance) ? { naissance: String(f.naissance) } : {}),
      parPhone: f.parPhone === true,
      ...(f.parFamille === true ? { parFamille: true } : {}),
      numeros: Array.isArray(f.numeros) ? (f.numeros as unknown[]).map((x) => String(x ?? '')).filter(Boolean) : [],
      ...(venue ? { derniereVenue: venue } : {}),
      ...(prochain ? { prochainRdv: prochain } : {}),
    };
  });
}

/** A-T-ELLE DÉJÀ ÉCRIT, OU LA MAISON LUI A-T-ELLE DÉJÀ ÉCRIT ? Aucun message
    de ce numéro hors de ce tour : c'est un premier message. `null` : la
    base ne répond pas. */
async function estUnPremierMessage(sb: Sb, numero: string, tour: TourDeLaCliente): Promise<boolean | null> {
  const ids = new Set(tour.waIds.map((w) => `wa-${w}`));
  const { data, error } = await sb.from('messages_wa').select('id').eq('data->>numero', numero).limit(ids.size + 1);
  if (error) { dis('historique illisible', { motif: error.message.slice(0, 120) }); return null; }
  return ((data ?? []) as { id: string }[]).every((r) => ids.has(r.id));
}

/** LA MAIN DE L'ÉQUIPE TIENT-ELLE, À CET INSTANT ? */
async function laMainTient(sb: Sb, numero: string): Promise<boolean> {
  const { data, error } = await sb.from('fils_automate').select('id, data').eq('id', `main-${numero}`).limit(1);
  if (error) return true;
  return pauseActive(((data ?? [])[0] as Ligne | undefined)?.data as MainDuFil | undefined, Date.now());
}

/** UN ÉTAT LU EN BASE, tenu pour ce qu'il dit être. Abîmé (une main y a
    touché), il repart à neuf, à la version de la ligne. */
function etatLuWa(brut: unknown, numero: string, ms: number): EtatDuFil | null {
  if (!brut || typeof brut !== 'object') return null;
  const e = brut as Partial<EtatDuFil>;
  const version = Number(e.version ?? 0) || 0;
  const sain = typeof e.etape === 'string' && Array.isArray(e.traites) && Array.isArray(e.envois)
    && !!e.panier && typeof e.panier === 'object' && typeof e.majLe === 'string';
  if (sain) return { ...(e as EtatDuFil), version };
  return { ...etatNeufDuFil(numero, isoWa(ms)), version };
}

/* ══ META ══════════════════════════════════════════════════════════════ */
type Rendu = { waId?: string; detail?: string; code?: number };

/** META A DIX SECONDES (relecture du 9 octobre 2026) : un appel qui pend
    jusqu'à la limite du runtime laisserait un rendez-vous posé sans sa
    confirmation, et sa ligne « en cours ». Passé ce délai, c'est un raté :
    la ligne passe à « échec », le modèle de confirmation-rdv prend le relais. */
const DELAI_DE_META_MS = 10_000;

/** UN MESSAGE À GRAPH. Ne lève jamais : un refus rend sa raison (tronquée
    à 300 signes) et le code de Meta. */
async function envoieAGraph(jeton: string, phoneId: string, charge: Record<string, unknown>): Promise<Rendu> {
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
      body: JSON.stringify(charge),
      signal: AbortSignal.timeout(DELAI_DE_META_MS),
    });
    const rep = await r.json().catch(() => ({}));
    if (r.ok && rep?.messages?.[0]?.id) return { waId: String(rep.messages[0].id) };
    const code = Number(rep?.error?.code);
    return {
      detail: String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300),
      ...(Number.isFinite(code) && code > 0 ? { code } : {}),
    };
  } catch (e) {
    return { detail: String(e).slice(0, 300) };
  }
}

/** « EN TRAIN D'ÉCRIRE ». Meta l'affiche 25 s au plus, ou jusqu'à la
    réponse, et dit le message lu : on l'inscrit sur sa ligne, comme
    whatsapp-envoi le fait quand l'équipe ouvre le fil. Ne lève jamais. */
async function enTrainDEcrire(sb: Sb, jeton: string, phoneId: string, waId: string): Promise<void> {
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: waId, typing_indicator: { type: 'text' } }),
      signal: AbortSignal.timeout(DELAI_DE_META_MS),
    });
    await r.body?.cancel().catch(() => {});
    if (!r.ok) { dis('en train d ecrire · refus de Meta', { statut: r.status }); return; }
    const id = `wa-${waId}`;
    const { data } = await sb.from('messages_wa').select('id, data').eq('id', id).limit(1);
    const ligne = ((data ?? []) as Ligne[])[0];
    if (!ligne) return;
    const maintenant = new Date().toISOString();
    await sb.from('messages_wa').update({
      data: { ...(ligne.data ?? {}), luParLaMaisonLe: maintenant },
      updated_at: maintenant,
    }).eq('id', id);
  } catch (e) {
    dis('en train d ecrire · echec', { motif: String(e).slice(0, 120) });
  }
}

/** Tout ce que la cliente lira de ce message : les juges de la Maison
    passent dessus avant qu'il parte. */
const toutLeTexteWa = (m: MessageSortant): string => [
  m.corps, m.pied ?? '', m.bouton ?? '',
  ...(m.boutons ?? []).map((b) => b.titre),
  ...(m.lignes ?? []).flatMap((l) => [l.titre, l.description ?? '']),
].join('\n');

/** LA TRACE DANS LE FIL, comme tout ce que la Maison envoie, même un raté :
    l'identifiant se déduit de celui de Meta, pour que l'accusé du webhook
    retrouve sa ligne. L'étape et les choix, tels qu'elle les a lus : le fil
    du Trône les montre au lieu de « Parti tout seul ». */
async function laisseLaTrace(
  sb: Sb, o: { numero: string; m: MessageSortant; rendu: Rendu; branchId?: string; clientId?: string },
): Promise<void> {
  const id = o.rendu.waId ? `wa-${o.rendu.waId}` : `wa-local-${crypto.randomUUID()}`;
  const { error } = await sb.from('messages_wa').upsert({
    id,
    branch_id: o.branchId ?? null,
    data: {
      id,
      ...(o.rendu.waId ? { waId: o.rendu.waId } : {}),
      ...(o.branchId ? { branchId: o.branchId } : {}),
      sens: 'sortant',
      numero: o.numero,
      ...(o.clientId ? { clientId: o.clientId } : {}),
      texte: o.m.corps,
      type: o.m.forme === 'texte' ? 'text' : 'interactive',
      quand: new Date().toISOString(),
      etat: o.rendu.waId ? 'en-route' : 'non-remis',
      ...(o.rendu.detail ? { detail: o.rendu.detail } : {}),
      parQui: 'Le Trône',
      auto: 'automate',
      etape: o.m.etape,
      choix: choixDuMessage(o.m),
      /* La réponse de la Maison envoyée (le conseil) : les compteurs du Trône la lisent. */
      ...(o.m.reponseId ? { reponse: o.m.reponseId } : {}),
    },
  }, { onConflict: 'id' });
  if (error) dis('trace refusee', { motif: error.message.slice(0, 120) });
}

/** LA LIGNE DE CONFIRMATION (`conf-<rdv>-whatsapp`), posée « en cours » par
    `pose_si_libre` : elle verrouille confirmation-rdv. Partie dans la
    conversation : « envoyé », avec l'identifiant de Meta (l'accusé du
    webhook la suivra). Pas partie : « échec », et le modèle de
    confirmation-rdv prend le relais. Elle ne bouge que si elle est encore
    « en cours » : un verdict déjà tombé ne se réécrit pas. */
async function ditLaConfirmation(sb: Sb, rdvId: string, rendu: Rendu): Promise<void> {
  const id = `conf-${rdvId}-whatsapp`;
  const { data, error } = await sb.from('envois').select('id, data').eq('id', id).limit(1);
  if (error) { dis('ligne de confirmation illisible', { motif: error.message.slice(0, 120) }); return; }
  const ligne = ((data ?? []) as Ligne[])[0];
  if (!ligne || ligne.data?.statut !== 'en cours') return;
  const maintenant = new Date().toISOString();
  const neuf = rendu.waId
    ? { ...ligne.data, statut: 'envoyé', waMessageId: rendu.waId, etat: 'en-route', detail: 'dit dans la conversation', quand: maintenant }
    : {
      ...ligne.data,
      statut: 'échec',
      detail: String(rendu.detail ?? 'la confirmation n est pas partie dans la conversation').slice(0, 300),
      ...(rendu.code ? { codeMeta: rendu.code } : {}),
      quand: maintenant,
    };
  const { error: errEcrit } = await sb.from('envois').update({ data: neuf, updated_at: maintenant })
    .eq('id', id).eq('data->>statut', 'en cours');
  if (errEcrit) dis('ligne de confirmation refusee', { motif: errEcrit.message.slice(0, 120) });
}

/** « JE CONFIRME » : la place rejouée par le juge (`laPlaceTient`) sur un
    instantané FRAIS des créneaux pris du jour, puis le verrou
    (`pose_si_libre`, 0125), qui recontrôle sous le verrou de la Maison et
    du jour le plafond, les fauteuils et les maîtres, prend le premier maître
    encore libre de la liste que le juge a rendue, et écrit ensemble le
    rendez-vous, la demande et la ligne d'envoi. L'instantané frais remplace
    l'ancien pour ce jour : si l'heure est prise, les places proposées à la
    place le savent. */
async function poseSousVerrou(sb: Sb, lu: AgendaLu, e: EcritureDuTour, oublie: () => void): Promise<VerdictDeLaPose> {
  const { rdv } = e;
  const frais = await litLesCreneaux(sb, lu.agenda.branchId, rdv.date, rdv.date);
  if (!frais) return { ok: false, raison: 'agenda_illisible' };
  const autresJours = (lu.lignes.occupes ?? []).filter((c) => String((c as { jour?: unknown } | null)?.jour ?? '') !== rdv.date);
  const lignes: LignesDeLAgenda = { ...lu.lignes, occupes: [...autresJours, ...frais] };
  const neuf = agendaDepuisLesLignes(lignes);
  if (!neuf) return { ok: false, raison: 'agenda_illisible' };
  lu.lignes = lignes;
  lu.agenda = neuf;
  oublie();
  const place = laPlaceTient(neuf, { date: rdv.date, time: rdv.time, serviceIds: rdv.serviceIds }, Date.now());
  if (!place.ok) return { ok: false, raison: place.erreur };
  const { data, error } = await sb.rpc('pose_si_libre', {
    p_rdv: rdv,
    p_maitres: place.maitres,
    p_demande: e.demande ?? null,
    p_envoi: e.envoi,
  });
  if (error) { dis('pose · refus de la base', { motif: error.message.slice(0, 120) }); return { ok: false, raison: 'erreur' }; }
  const v = (data ?? {}) as { ok?: unknown; verdict?: unknown; id?: unknown; raison?: unknown };
  if (v.ok === true && typeof v.id === 'string' && v.id) {
    return { ok: true, id: v.id, verdict: v.verdict === 'deja' || v.verdict === 'deja_pose' ? v.verdict : 'pose' };
  }
  return { ok: false, raison: String(v.raison ?? 'erreur') };
}

/** LE RENDEZ-VOUS POSÉ REJOINT LE FIL quand un autre appel l'a avancé
    pendant la pose (relecture du 9 octobre 2026) : le bandeau du Trône le
    connaît, et « Poser ce rendez-vous » ne le double pas. L'étape de l'autre
    appel (la main passée) reste. Une tentative, jamais d'erreur. */
async function rattacheLaPose(sb: Sb, numero: string, rdvId: string, branchId: string | null): Promise<void> {
  try {
    const { data } = await sb.from('fils_automate').select('id, data').eq('id', `fil-${numero}`).limit(1);
    const brut = ((data ?? []) as Ligne[])[0]?.data;
    if (!brut || typeof brut !== 'object') return;
    const { data: v, error } = await sb.rpc('avance_le_fil', {
      p_numero: numero, p_version: Number(brut.version ?? 0) || 0, p_data: { ...brut, rdvId }, p_branch: branchId,
    });
    if (error || typeof v !== 'number') dis('le rendez-vous pose n a pas rejoint le fil');
  } catch (e) {
    dis('le rendez-vous pose n a pas rejoint le fil', { motif: String(e).slice(0, 120) });
  }
}

const attends = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ══ UN NUMÉRO, UN TOUR ════════════════════════════════════════════════ */
type Appel = { numero: string; tiroir: TiroirDuNumero; waIds: string[]; jeton: string; phoneId: string };
type Reponse = { pris: boolean; alerte?: AlerteDeLAutomate };

async function servirLeNumero(sb: Sb, o: Appel): Promise<Reponse> {
  const docs = await litLesDocuments(sb);
  if (!docs) return { pris: false };
  const cfg = docs.get('mnd_auto_config') ?? {};
  const reglage = reglageDeLAutomate(cfg?.automateWa);
  /* ① L'INTERRUPTEUR, avant toute autre lecture : éteint, personne ; en
     essai, les numéros listés seulement ; ouvert, les clientes. */
  if (!numeroServi(reglage, o.numero, o.tiroir)) {
    dis('numero non servi', { mode: reglage.mode, tiroir: o.tiroir, essais: reglage.numerosEssai.length });
    return { pris: false };
  }
  if (!o.jeton || !o.phoneId) { dis('cles Meta absentes : la Maison repond elle-meme'); return { pris: false }; }
  const maison = {
    nom: String(docs.get('mnd_house_identity')?.nom ?? '').trim() || 'Maison MND',
    itineraire: typeof cfg?.itineraire === 'string' ? cfg.itineraire : '',
    /* Le lien des Paramètres ; celui de la branche passe devant au tour. */
    carte: typeof cfg?.mapsLink === 'string' ? cfg.mapsLink : '',
  };
  for (let essai = 0; essai < 2; essai += 1) {
    const r = await unTour(sb, o, docs, reglage, maison, essai);
    if (r !== 'rejoue') return r;
  }
  dis('le fil a bouge deux fois pendant le tour : la Maison repond elle-meme');
  return { pris: false };
}

async function unTour(
  // deno-lint-ignore no-explicit-any
  sb: Sb, o: Appel, docs: Map<string, any>, reglage: ReglageDeLAutomate, maison: { nom: string; itineraire: string; carte: string }, essai: number,
): Promise<Reponse | 'rejoue'> {
  const debut = Date.now();
  const ms = debut;

  /* ② L'ÉTAT DU FIL ET LA MAIN DE L'ÉQUIPE. */
  const { data: lignesDuFil, error: errFil } = await sb.from('fils_automate').select('id, data')
    .in('id', [`fil-${o.numero}`, `main-${o.numero}`]);
  if (errFil) { dis('fils_automate illisible (0125 posee ?)', { motif: errFil.message.slice(0, 120) }); return { pris: false }; }
  const brutDuFil = ((lignesDuFil ?? []) as Ligne[]).find((l) => l.id === `fil-${o.numero}`)?.data;
  const fil = etatLuWa(brutDuFil, o.numero, ms);
  const versionLue = Number(brutDuFil?.version ?? 0) || 0;
  const main = (((lignesDuFil ?? []) as Ligne[]).find((l) => l.id === `main-${o.numero}`)?.data ?? null) as MainDuFil | null;

  /* ③ LE TOUR. */
  const lu = await leTourDuNumero(sb, o.numero, o.waIds, fil, ms);
  if (lu === null || lu === 'pas-a-lui') return { pris: false };
  if (lu === 'traite' || lu === 'un-autre') { dis('tour laisse a un autre appel', { pourquoi: lu }); return { pris: true }; }
  const tour = lu;

  /* ④ LES FICHES, ET LE PREMIER MESSAGE. */
  const fiches = await lesFichesDuNumero(sb, o.numero);
  if (!fiches) return { pris: false };
  const premierMessage = await estUnPremierMessage(sb, o.numero, tour);
  if (premierMessage === null) return { pris: false };
  /* La parole de la Maison ne se lit plus : la règle des sept jours est
     levée (14 octobre 2026), l'automate mène toujours. */

  /* ⑤ QUI PARLE, avant toute lecture de l'agenda. */
  const ctxLeger: ContexteLeger = {
    maintenantMs: ms, numero: o.numero, tiroir: o.tiroir, reglage, fiches, premierMessage, main,
    /* Les réponses de la Maison (le conseil, 14 octobre 2026). */
    conseil: conseilDeLaMaison(docs.get('mnd_reponses_maison')),
  };
  const juge = jugeLaParole(fil, tour, ctxLeger);
  if (juge.parole === 'silence') return { pris: false };

  /* ⑥ ⑦ « EN TRAIN D'ÉCRIRE », l'attente, et l'agenda pendant ce temps. */
  const aujourdhui = instantACotonou(ms).iso;
  let agenda: AgendaLu | null = null;
  if (juge.parole === 'parle') {
    const titulaire = fiches.find((f) => f.parPhone) ?? fiches[0];
    const lecture = litLAgenda(sb, docs, titulaire?.branchId, aujourdhui, reglage.horizonJours);
    if (essai === 0) {
      await enTrainDEcrire(sb, o.jeton, o.phoneId, tour.waIds[tour.waIds.length - 1]);
      await attends(ATTENTE_DU_TOUR_MS);
      const apres = await leTourDuNumero(sb, o.numero, o.waIds, fil, Date.now());
      if (apres === 'un-autre' || apres === 'traite') {
        await lecture.catch(() => null);
        dis('un message plus recent repondra', { pourquoi: apres });
        return { pris: true };
      }
      if (apres === null || apres === 'pas-a-lui') { await lecture.catch(() => null); return { pris: false }; }
    }
    agenda = await lecture;
  }

  /* ⑧ LE TOUR, puis la pose s'il y en a une. */
  const vue = agenda ? agendaDuTourWa(agenda, ms, reglage.horizonJours) : null;
  /* Le lien Google Maps de la branche du tour, sinon celui des Paramètres (13 octobre 2026). */
  const carte = lienMapsWa(agenda?.lignes.branche.data?.mapsUrl, maison.carte);
  const ctx: ContexteDuTour = {
    ...ctxLeger, maison: { ...maison, carte }, ...(vue ? { agenda: vue.agenda } : {}),
    /* Les prix du catalogue du jour, pour les jetons du conseil. */
    ...(agenda ? { prix: prixDuCatalogue(agenda.lignes.services) } : {}),
  };
  let sortie = etapeSuivante(fil, tour, ctx);
  if (!sortie.pris) return { pris: false };
  let posee: string | null = null;
  const pose = sortie.ecritures.find((e) => e.genre === 'pose');
  if (pose) {
    const verdict: VerdictDeLaPose = agenda && vue
      ? await poseSousVerrou(sb, agenda, pose, vue.oublie)
      : { ok: false, raison: 'agenda_illisible' };
    sortie = suiteDeLaPose(sortie.etat, verdict, ctx);
    if (verdict.ok) posee = verdict.id;
    dis('pose', { verdict: verdict.ok ? (verdict.verdict ?? 'pose') : verdict.raison, essai: reglage.mode === 'essai' });
  }

  /* ⑨ L'ÉTAT, À CONDITION. `null` : la main de l'équipe tient le fil
     (le tour se tait), ou un autre tour est passé (on rejoue, une fois ;
     une pose rejouée ne se refait pas, `pose_si_libre` la reconnaît). */
  const branchId = agenda?.agenda.branchId ?? (fiches.find((f) => f.parPhone) ?? fiches[0])?.branchId ?? null;
  const { data: version, error: errAvance } = await sb.rpc('avance_le_fil', {
    p_numero: o.numero, p_version: versionLue, p_data: sortie.etat, p_branch: branchId,
  });
  if (errAvance || typeof version !== 'number') {
    if (errAvance) dis('avance_le_fil refuse', { motif: errAvance.message.slice(0, 120) });
    const tient = errAvance ? true : await laMainTient(sb, o.numero);
    /* UN RENDEZ-VOUS POSÉ NE SE REJOUE JAMAIS (relecture du 9 octobre 2026) :
       le rejeu trouverait ses messages déjà traités par l'appel qui a avancé
       le fil (une question de prix juste après « Je confirme »), rendrait
       « traité », et la pose serait perdue : au carnet, mais ni confirmée à
       la cliente ni annoncée à l'équipe, et sa ligne « en cours » bloquerait
       le modèle de confirmation-rdv. */
    if (!tient && essai === 0 && !posee) { dis('le fil a bouge pendant le tour : on rejoue'); return 'rejoue'; }
    dis('le tour se tait', { pourquoi: errAvance ? 'ecriture refusee' : tient ? 'main de l equipe' : 'fil en mouvement', pose: !!posee });
    /* UN RENDEZ-VOUS POSÉ N'ATTEND PAS : sans la confirmation dans la
       conversation, la ligne passe à « échec » et le modèle de
       confirmation-rdv prend le relais ; l'équipe est prévenue. */
    if (posee) {
      await ditLaConfirmation(sb, posee, { detail: 'la conversation a change de main pendant la pose : le modele de confirmation prend le relais' });
      if (!tient) await rattacheLaPose(sb, o.numero, posee, branchId);
      return { pris: true, ...(sortie.alerte ? { alerte: sortie.alerte } : {}) };
    }
    return { pris: false };
  }

  /* ⑩ LE MESSAGE, à Graph, puis sa trace. Les juges de la Maison passent
     d'abord : un message qu'elle n'écrirait pas ne part pas. */
  const clientIdDuFil = sortie.etat.panier.clientId
    ?? (fiches.find((f) => (f.numeros ?? []).some((x) => cleWa(x) === cleWa(o.numero))) ?? fiches.find((f) => f.parPhone))?.id;
  let refus: MotifDeLaMain | null = null;
  let laConfirmation: Rendu | null = null;
  for (const m of sortie.messages) {
    const fautes = [...respecteMeta(m), ...texteSain(toutLeTexteWa(m), m.prixDuCatalogue === true)];
    if (fautes.length > 0) {
      dis('message retenu par les juges de la Maison', { etape: m.etape, fautes: fautes.length });
      if (m.etape === 'confirme') laConfirmation = { detail: 'message retenu par les juges de la Maison' };
      refus = 'erreur';
      break;
    }
    const rendu = await envoieAGraph(o.jeton, o.phoneId, chargeGraph(m, o.numero));
    await laisseLaTrace(sb, { numero: o.numero, m, rendu, ...(branchId ? { branchId } : {}), ...(clientIdDuFil ? { clientId: clientIdDuFil } : {}) });
    if (m.etape === 'confirme') laConfirmation = rendu;
    if (!rendu.waId) {
      dis('Meta refuse le message', { etape: m.etape, code: rendu.code ?? null });
      refus = 'envoi-refuse';
      break;
    }
  }
  if (posee) await ditLaConfirmation(sb, posee, laConfirmation ?? { detail: 'la confirmation n est pas partie dans la conversation' });

  /* UN MESSAGE QUI N'EST PAS PARTI : la main passe, sans un mot de plus.
     Sans cela le fil se dirait tenu, l'alarme se tairait, et elle
     attendrait une réponse qui n'est jamais partie. */
  let alerte = sortie.alerte;
  if (refus) {
    const apres = mainApresCoup({ ...sortie.etat, version }, refus, ctx);
    const { data: v2, error: e2 } = await sb.rpc('avance_le_fil', {
      p_numero: o.numero, p_version: version, p_data: apres.etat, p_branch: branchId,
    });
    if (e2 || typeof v2 !== 'number') {
      dis('la main n a pas pu passer apres le refus', { motif: String(e2?.message ?? 'fil en mouvement').slice(0, 120) });
      return { pris: false };
    }
    alerte = apres.alerte;
  }

  dis('tour', {
    etape: (refus ? 'main' : sortie.etat.etape), messages: sortie.messages.length, pose: !!posee,
    refus: refus ?? null, mode: reglage.mode, ms: Date.now() - debut,
  });
  return { pris: true, ...(alerte ? { alerte } : {}) };
}

/* ══ META A REFUSÉ APRÈS COUP · relecture du 9 octobre 2026 ═════════════
   Un message de l'automate accepté à l'envoi peut revenir « failed » par
   l'accusé (un téléphone qui ne lit pas les listes, un numéro devenu
   injoignable). Le webhook le confie ici (`apresCoup: 'envoi-refuse'`) :
   un parcours EN COURS passe la main, sans un mot de plus (un second
   message ne partirait pas mieux), et l'équipe est prévenue. Un fil qui
   n'est plus en parcours ne bouge pas, et rien ne sonne de plus : l'alarme
   du Trône sait déjà qu'une réponse non remise ne répond à rien. */
async function rattrapeLeRefus(sb: Sb, numero: string, tiroir: TiroirDuNumero): Promise<Reponse> {
  const docs = await litLesDocuments(sb);
  if (!docs) return { pris: false };
  const cfg = docs.get('mnd_auto_config') ?? {};
  const reglage = reglageDeLAutomate(cfg?.automateWa);
  const ms = Date.now();
  const { data: lignes, error } = await sb.from('fils_automate').select('id, data')
    .in('id', [`fil-${numero}`, `main-${numero}`]);
  if (error) { dis('fils_automate illisible', { motif: error.message.slice(0, 120) }); return { pris: false }; }
  const brut = ((lignes ?? []) as Ligne[]).find((l) => l.id === `fil-${numero}`)?.data;
  const main = (((lignes ?? []) as Ligne[]).find((l) => l.id === `main-${numero}`)?.data ?? null) as MainDuFil | null;
  const fil = etatLuWa(brut, numero, ms);
  if (!fil || !ETAPES_EN_COURS.includes(etapeCourante(fil, main, ms, reglage.pauseHeures))) {
    dis('refus apres coup : le fil n est pas en parcours');
    return { pris: false };
  }
  const fiches = (await lesFichesDuNumero(sb, numero)) ?? [];
  const ctx: ContexteDuTour = {
    maintenantMs: ms, numero, tiroir, reglage, fiches, premierMessage: false, main,
    maison: { nom: String(docs.get('mnd_house_identity')?.nom ?? '').trim() || 'Maison MND' },
    conseil: conseilDeLaMaison(docs.get('mnd_reponses_maison')),
  };
  const apres = mainApresCoup(fil, 'envoi-refuse', ctx);
  const branchId = (fiches.find((f) => f.parPhone) ?? fiches[0])?.branchId ?? null;
  const { data: v, error: e2 } = await sb.rpc('avance_le_fil', {
    p_numero: numero, p_version: Number(brut?.version ?? 0) || 0, p_data: apres.etat, p_branch: branchId,
  });
  if (e2 || typeof v !== 'number') {
    dis('refus apres coup : la main n a pas pu passer', { motif: String(e2?.message ?? 'fil en mouvement').slice(0, 120) });
    return { pris: false };
  }
  dis('refus apres coup : la main passe');
  return { pris: true, ...(apres.alerte ? { alerte: apres.alerte } : {}) };
}

/* ══ LA REPRISE DEMANDÉE PAR LE TRÔNE · 13 octobre 2026 ═════════════════
   « Rendre à l'automate » : le Trône écrit la main rendue, puis demande la
   reprise. La main rendue arrive à la base un instant après : on l'attend,
   huit secondes au plus. Puis la fenêtre de WhatsApp : sans message d'elle
   depuis 24 heures, un message libre ne part pas, il attendra le sien. */
async function reprendLeFil(
  sb: Sb, o: { numero: string; tiroir: TiroirDuNumero; rendueLe: string; jeton: string; phoneId: string },
): Promise<{ repris: boolean; raison?: string; etape?: string }> {
  const docs = await litLesDocuments(sb);
  if (!docs) return { repris: false, raison: 'base illisible' };
  const cfg = docs.get('mnd_auto_config') ?? {};
  const reglage = reglageDeLAutomate(cfg?.automateWa);
  if (!numeroServi(reglage, o.numero, o.tiroir)) return { repris: false, raison: 'numero non servi' };
  if (!o.jeton || !o.phoneId) return { repris: false, raison: 'cles Meta absentes' };

  const voulue = msWa(o.rendueLe);
  let lignes: Ligne[] = [];
  for (let essai = 0; essai < 9; essai += 1) {
    const { data, error } = await sb.from('fils_automate').select('id, data').in('id', [`fil-${o.numero}`, `main-${o.numero}`]);
    if (error) return { repris: false, raison: 'fils illisibles' };
    lignes = (data ?? []) as Ligne[];
    const rendue = msWa(lignes.find((l) => l.id === `main-${o.numero}`)?.data?.rendueLe);
    if (Number.isFinite(voulue) && Number.isFinite(rendue) && rendue >= voulue) break;
    if (essai === 8) return { repris: false, raison: 'main pas encore rendue' };
    await attends(1000);
  }
  const ms = Date.now();
  const brutDuFil = lignes.find((l) => l.id === `fil-${o.numero}`)?.data;
  const fil = etatLuWa(brutDuFil, o.numero, ms);
  const versionLue = Number(brutDuFil?.version ?? 0) || 0;
  const main = (lignes.find((l) => l.id === `main-${o.numero}`)?.data ?? null) as MainDuFil | null;

  /* LA FENÊTRE DE 24 HEURES, depuis son dernier message. */
  const { data: derniers, error: errDernier } = await sb.from('messages_wa').select('data')
    .eq('data->>numero', o.numero).eq('data->>sens', 'entrant').order('data->>quand', { ascending: false }).limit(1);
  if (errDernier) return { repris: false, raison: 'messages illisibles' };
  const quand = msWa(((derniers ?? []) as Ligne[])[0]?.data?.quand);
  if (!Number.isFinite(quand) || ms - quand >= JOUR_WA) return { repris: false, raison: 'fenetre' };

  const fiches = (await lesFichesDuNumero(sb, o.numero)) ?? [];
  const titulaire = fiches.find((f) => f.parPhone) ?? fiches[0];
  const agenda = await litLAgenda(sb, docs, titulaire?.branchId, instantACotonou(ms).iso, reglage.horizonJours);
  const vue = agenda ? agendaDuTourWa(agenda, ms, reglage.horizonJours) : null;
  const maison = {
    nom: String(docs.get('mnd_house_identity')?.nom ?? '').trim() || 'Maison MND',
    itineraire: typeof cfg?.itineraire === 'string' ? cfg.itineraire : '',
    carte: lienMapsWa(agenda?.lignes.branche.data?.mapsUrl, typeof cfg?.mapsLink === 'string' ? cfg.mapsLink : ''),
  };
  const ctx: ContexteDuTour = {
    maintenantMs: ms, numero: o.numero, tiroir: o.tiroir, reglage, fiches, premierMessage: false, main, maison,
    ...(vue ? { agenda: vue.agenda } : {}),
    conseil: conseilDeLaMaison(docs.get('mnd_reponses_maison')),
    ...(agenda ? { prix: prixDuCatalogue(agenda.lignes.services) } : {}),
  };
  const sortie = repriseDuFil(fil, ctx);
  if (!sortie.pris || sortie.messages.length === 0) return { repris: false, raison: 'rien a reprendre' };

  const branchId = agenda?.agenda.branchId ?? titulaire?.branchId ?? null;
  const { data: version, error: errAvance } = await sb.rpc('avance_le_fil', {
    p_numero: o.numero, p_version: versionLue, p_data: sortie.etat, p_branch: branchId,
  });
  if (errAvance || typeof version !== 'number') return { repris: false, raison: 'fil en mouvement' };

  const clientId = sortie.etat.panier.clientId ?? titulaire?.id;
  for (const m of sortie.messages) {
    if ([...respecteMeta(m), ...texteSain(toutLeTexteWa(m), m.prixDuCatalogue === true)].length > 0) return { repris: false, raison: 'message retenu par les juges' };
    const rendu = await envoieAGraph(o.jeton, o.phoneId, chargeGraph(m, o.numero));
    await laisseLaTrace(sb, { numero: o.numero, m, rendu, ...(branchId ? { branchId } : {}), ...(clientId ? { clientId } : {}) });
    if (!rendu.waId) {
      const apres = mainApresCoup({ ...sortie.etat, version }, 'envoi-refuse', ctx);
      await sb.rpc('avance_le_fil', { p_numero: o.numero, p_version: version, p_data: apres.etat, p_branch: branchId });
      return { repris: false, raison: 'Meta refuse' };
    }
  }
  return { repris: true, etape: sortie.etat.etape };
}

/* Le Trône appelle depuis le navigateur : chaque réponse porte de quoi
   être lue (voir whatsapp-envoi, 14 septembre 2026). */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const jsonCors = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'content-type': 'application/json' } });

/* ══ LA PORTE ══════════════════════════════════════════════════════════
   Comparaison à temps constant : comparer deux secrets avec `===` laisse
   fuir, caractère par caractère, où l'on s'est arrêté. */
const memeCle = (a: string, b: string): boolean => {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0 && x.length > 0;
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  /* ── LE CONTRÔLE DE SANTÉ : la version et les secrets, EN LONGUEURS
     SEULES (0 = absent). Il n'envoie rien et ne lit rien. */
  if (req.method === 'GET') {
    const lg = (n: string) => (Deno.env.get(n) ?? '').trim().length;
    return json({
      fonction: 'whatsapp-automate',
      version: VERSION,
      secrets: {
        CLE_SERVICE: lg('CLE_SERVICE') || 'ABSENT',
        SUPABASE_URL: lg('SUPABASE_URL') || 'ABSENT',
        WA_TOKEN: lg('WA_TOKEN') || 'ABSENT : la Maison répond elle-même',
        WA_PHONE_ID: lg('WA_PHONE_ID') || 'ABSENT : la Maison répond elle-même',
      },
      porte: 'POST : Bearer <CLE_SERVICE> (le webhook), ou une session du personnel pour la reprise (le Trône)',
      reglageLivre: 'essai, aucun numéro : personne n est servi tant que la direction n a pas saisi ses numéros',
      jwt: 'décoché, sinon vous ne liriez pas ceci',
    });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erreur: 'POST seulement' }, 405);

  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  const recue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || !memeCle(recue, service)) {
    /* LA REPRISE DEMANDÉE PAR LE TRÔNE (13 octobre 2026) : une session du
       personnel, et rien d'autre. On ne se fie pas au jeton présenté : on
       demande à la base ce qu'elle en pense (`is_staff`). */
    // deno-lint-ignore no-explicit-any
    let demande: Record<string, any> = {};
    try { demande = await req.json(); } catch { /* pas une reprise */ }
    const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
    if (demande?.reprise && service && urlBase && anon && recue) {
      const commeAppelant = createClient(urlBase, anon, { global: { headers: { authorization: `Bearer ${recue}` } } });
      const { data: estPersonnel, error: errStaff } = await commeAppelant.rpc('is_staff');
      if (errStaff || estPersonnel !== true) return jsonCors({ repris: false, erreur: 'réservé au personnel' }, 403);
      const numero = numeroWa(String(demande.reprise.numero ?? ''));
      if (numero.length < 8) return jsonCors({ repris: false, erreur: 'numéro' }, 400);
      const t = demande.reprise.tiroir;
      const tiroir: TiroirDuNumero = t === 'equipe' ? 'equipe' : t === 'prestataires' ? 'prestataires' : 'clientes';
      try {
        const r = await reprendLeFil(createClient(urlBase, service), {
          numero, tiroir, rendueLe: String(demande.reprise.rendueLe ?? ''),
          jeton: (Deno.env.get('WA_TOKEN') ?? '').trim(), phoneId: (Deno.env.get('WA_PHONE_ID') ?? '').trim(),
        });
        dis('reprise', r);
        return jsonCors({ ...r, version: VERSION });
      } catch (e) {
        dis('echec de la reprise', { motif: String(e).slice(0, 160) });
        return jsonCors({ repris: false, raison: 'erreur', version: VERSION });
      }
    }
    /* LES LONGUEURS SEULES, JAMAIS LES VALEURS. */
    return jsonCors({ erreur: 'réservé au webhook', attendueLg: service.length, recueLg: recue.length }, 401);
  }
  if (!urlBase) return json({ pris: false, erreur: 'SUPABASE_URL manque' }, 500);

  // deno-lint-ignore no-explicit-any
  let corps: Record<string, any> = {};
  try { corps = await req.json(); } catch { return json({ pris: false, erreur: 'corps illisible' }, 400); }
  const numero = numeroWa(String(corps.numero ?? ''));
  const tiroir: TiroirDuNumero = corps.tiroir === 'equipe' ? 'equipe' : corps.tiroir === 'prestataires' ? 'prestataires' : 'clientes';
  const waIds: string[] = Array.isArray(corps.waIds)
    ? [...new Set((corps.waIds as unknown[]).map((w) => String(w ?? '')).filter(Boolean))].slice(0, 20)
    : [];
  /* UN MESSAGE DE L'AUTOMATE REVENU « FAILED » (le webhook, après coup). */
  if (corps.apresCoup === 'envoi-refuse') {
    if (numero.length < 8) return json({ pris: false });
    try {
      const r = await rattrapeLeRefus(createClient(urlBase, service), numero, tiroir);
      return json({ pris: r.pris, ...(r.alerte ? { alerte: r.alerte } : {}), version: VERSION });
    } catch (e) {
      dis('echec du rattrapage', { motif: String(e).slice(0, 160) });
      return json({ pris: false, version: VERSION });
    }
  }
  if (numero.length < 8 || waIds.length === 0) return json({ pris: false });

  const sb = createClient(urlBase, service);
  try {
    const r = await servirLeNumero(sb, {
      numero, tiroir, waIds,
      jeton: (Deno.env.get('WA_TOKEN') ?? '').trim(),
      phoneId: (Deno.env.get('WA_PHONE_ID') ?? '').trim(),
    });
    return json({ pris: r.pris, ...(r.alerte ? { alerte: r.alerte } : {}), version: VERSION });
  } catch (e) {
    /* AU MOINDRE DOUTE, LA MAISON RÉPOND ELLE-MÊME : `pris: false`, le
       webhook prévient l'équipe comme d'habitude. */
    dis('echec du tour', { motif: String(e).slice(0, 160) });
    return json({ pris: false, version: VERSION });
  }
});
