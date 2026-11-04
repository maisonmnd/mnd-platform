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
import Anthropic from 'npm:@anthropic-ai/sdk';

/** LA VERSION DE CE FICHIER, dite par le contrôle de santé. Sans elle on ne
    sait pas quel code tourne vraiment. À incrémenter à chaque déploiement. */
const VERSION = '2026-11-04-e · Opale repond sur le WhatsApp de la Maison (mnd_opale), l automate en reserve ; une fiche sans date de naissance sous un payeur ne parle pas sur son numero : le payeur parle ; une fiche d enfant n est jamais la voix du numero (Opale parle au parent, la trace porte l adulte ou le payeur) ; places jusqu au jour demande, la Maison MND, confirme et jamais deplace, reprise apres un relais ; aucune offre ni remise annoncee';

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
const DOCUMENTS_DU_TOUR = ['mnd_auto_config', 'mnd_settings', 'mnd_horaires_exceptions', 'mnd_vitrine_config', 'mnd_house_identity', 'mnd_reponses_maison', 'mnd_assistant_wa', 'mnd_tri_des_messages', 'mnd_model_bands', 'mnd_model_band_sets', 'mnd_opale', 'mnd_offers', 'mnd_payment_methods'];

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
                         dialogue ;
     ⟨opale⟩             src/shared/opale-pur.ts, entre ses repères : la
                         consigne d'Opale, ses outils, ses juges (4 novembre 2026) ;
     ⟨age-de⟩            src/shared/clients-pur.ts, ⟨prenom-de⟩ src/shared/foyer-pur.ts,
     ⟨voix-du-numero⟩    src/shared/voix-du-numero-pur.ts, ⟨voix-du-fil⟩
                         src/shared/voix-du-fil-pur.ts, entre leurs repères : la
                         voix du numéro, jamais une fiche d'enfant (4 novembre 2026).
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

/** UNE SEULE RÉSERVATION EN LIGNE À LA FOIS — 24 octobre 2026.

    Deux têtes de 500 locks posées à 14 h le même samedi (P. L. au Trône,
    C. O. depuis Ma Couronne) : Ma Couronne ne comptait que les rituels de
    SON maître (« Team » d'un côté, aucun de l'autre), et pas les fauteuils.
    Au sélecteur, Yéman : en ligne (Ma Couronne, le site, WhatsApp), un
    rituel ne chevauche JAMAIS un rituel déjà inscrit, quel qu'en soit le
    maître. Le second fauteuil reste au comptoir, posé à la main.

    C'est le plafond des rituels simultanés de `creneauxLibres`
    (`capSimultane`) pour toute porte en ligne ; la base tient la même règle
    (migration 0140 : `pose_si_libre` et le garde `une_place_en_ligne`). */
export const PLACES_EN_LIGNE = 1;

/** LES SÍNSIN CHEZ TEAM — 24 octobre 2026.

    « La couronne doit toujours proposer un seul maître Team pour les SÍNSIN.
    L'expert n'est proposé que pour les autres services » (Yéman), et au
    sélecteur : PARTOUT (le Trône, Ma Couronne, le site, WhatsApp). Les trois
    SÍNSIN du catalogue (Kids, Essentiel, Signature) n'avaient aucun maître :
    le Trône reprenait celui de ses habitudes (« Expert »). Un rendez-vous qui
    contient un SÍNSIN va chez Team ; les autres prestations gardent tous les
    maîtres de la branche. Un SÍNSIN se reconnaît à son nom. */
export const MAITRE_DES_SINSIN = 'Team';
export const estUnSinsin = (nom: string | null | undefined): boolean =>
  (nom ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes('sinsin');
/** Les maîtres qu'un rituel peut recevoir : avec un SÍNSIN, Team seul (si la
    branche le porte) ; sinon ceux de la branche, tels quels. */
export function maitresPermis(noms: readonly (string | null | undefined)[], maitres: readonly string[]): string[] {
  return noms.some(estUnSinsin) && maitres.includes(MAITRE_DES_SINSIN) ? [MAITRE_DES_SINSIN] : [...maitres];
}
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
    /* LES PLACES EN LIGNE, PAS LES FAUTEUILS — 24 octobre 2026 : cet agenda
       ne juge que les portes en ligne (le site, WhatsApp), et en ligne un
       rituel ne chevauche jamais un autre (`PLACES_EN_LIGNE`). Les fauteuils
       de la branche restent au comptoir. */
    sieges: PLACES_EN_LIGNE,
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
  /* LES SÍNSIN CHEZ TEAM (24 octobre 2026) : un SÍNSIN dans la venue, et
     c'est Team, seul. */
  if (serviceIds.some((id) => estUnSinsin(agenda.services.find((s) => s.id === id)?.name))) return [MAITRE_DES_SINSIN];
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
  /* Abrégée devant le prénom (28 octobre 2026) : « M. Jean-Luc », « Mme Shadé » ; seule, en entier. */
  if (prenom) return `${civ === 'monsieur' ? 'M.' : civ === 'mademoiselle' ? 'Mlle' : 'Mme'} ${prenom}`;
  return civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
};

/* ⟨gestes-en-francais⟩ */
/* ── 9 bis. LES GESTES DITS EN FRANÇAIS (13 octobre 2026) ───────────────
   Les clientes ne lisent pas les marques fon : « SÍNSIN™ Essentiel » ne dit
   rien à qui ne connaît pas encore la Maison. Dans les listes, le français
   vient d'abord (« Racines · Essentiel »), la marque et la durée en
   dessous ; dans le récapitulatif, le français puis la marque entre
   parenthèses. Mots donnés par Yéman ; une marque absente d'ici garde son
   nom tel quel. Le SÍNSIN™ se dit « Reprise des racines » (« Racines »
   dans un titre de liste) depuis le 30 octobre 2026, sur WhatsApp et sur
   le site : son mot, et celui des clientes (« faire mes racines »). */
const GESTES_EN_FRANCAIS: Record<string, { court: string; long: string }> = {
  'VÈKPÈ': { court: 'Création', long: 'Création de locks' },
  'SÍNSIN': { court: 'Racines', long: 'Reprise des racines' },
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
  | 'questions' | 'reponse'
  /* Le prix (30 octobre 2026) : son nombre de locks, puis sa longueur, quand
     sa fiche ne les dit pas. */
  | 'locks' | 'longueur';

/** LA LONGUEUR, comme le catalogue la nomme (`LongueurId`). */
type LongueurWa = 'court' | 'mi-long' | 'long';

/** CE QUE LA MAISON SAIT DE SA TÊTE POUR LE PRIX (30 octobre 2026) : lu sur
    sa fiche (son numéro), ou dit par elle dans le parcours. */
type TeteDuPrix = {
  /** Son nombre de locks (compté, ou le représentant du palier qu'elle a touché). */
  locks?: number;
  longueur?: LongueurWa;
  /** La marge de calibre accordée par la Maison (`Client.margeCalibre`). */
  marge?: boolean;
  /** Son Juste Prix (`Client.priceCoef`), sur les gestes de l'Atelier. */
  coef?: number;
};

type MotifDeLaMain =
  | 'demande' | 'ecarts' | 'prix' | 'media' | 'jour-meme' | 'autre-soin' | 'autre-personne'
  | 'sans-place' | 'plafond' | 'erreur' | 'envoi-refuse' | 'annulation' | 'question' | 'sante';

type CiviliteDuFil = 'madame' | 'mademoiselle' | 'monsieur';

type PlaceLibre = { iso: string; heure: string };

/** Ce que le fil garde du rendez-vous qu'elle déplace : son identifiant, son
    `updated_at` lu (le verrou optimiste), sa place d'avant, son maître et sa
    durée. Jamais un nom. */
type DeplacementDuFil = { rdvId: string; updatedAt: string; date: string; time: string; maitre: string; dureeMin: number };

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
  /** L'heure qu'elle a dite (HH:MM) : les places proposées l'entourent. */
  heureVoulue?: string;
  /** Les gestes du catalogue qu'elle a nommés dans son premier message
      (« un shampoing ») : ils passent avant « la même chose ». */
  dits?: string[][];
  /** Elle déplace un rendez-vous (30 octobre 2026) : la date de celui-ci,
      vide si on ne la sait pas. La place touchée passe à l'équipe. C'est le
      repli quand la fonction n'a pas lu le rendez-vous (`deplacement`). */
  deplace?: string;
  /** LE DÉPLACEMENT SOUS VERROU (2 novembre 2026, lot 3 de Perle, choix de
      Yéman au sélecteur : « Seule, sous verrou ») : le rendez-vous qu'elle
      déplace, tel que la fonction l'a lu. Les places sont celles de son
      maître, pour la même durée ; la place touchée le déplace (la sortie
      porte `deplacement`), rien de neuf n'est posé. */
  deplacement?: DeplacementDuFil;
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
  /** La liste de l'entretien, en rubriques (30 octobre 2026) : elle revient
      telle quelle à la relance. */
  rubriques?: boolean;
  /** Ce qu'elle a dit de sa tête pour le prix : un nombre de locks, une
      longueur, ou qu'elle ne sait pas son nombre de locks. */
  tete?: { locks?: number; longueur?: LongueurWa; locksInconnus?: boolean };
  /** Après le prix : « un autre soin ? » (`rituel`) ou les places (`places`). */
  apresLePrix?: 'rituel' | 'places';
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
  /** La main passée par la réception (Claude ou son secours), pas par une
      personne : une envie de réserver la reprend (28 octobre 2026). */
  mainDeLaReception?: boolean;
  /** L'étape où il en était quand la main est passée : « Rendre à
      l'automate » la reprend. */
  etapeAvantLaMain?: EtapeDuFil;
  versionAvantLaMain?: number;
  /** Quand le plan pour venir est parti vers ce numéro (31 octobre 2026) :
      il ne repart plus d'office, seulement quand elle demande le chemin. */
  planEnvoyeLe?: string;
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

const ETAPES_EN_COURS: readonly EtapeDuFil[] = ['qui', 'besoin', 'meme', 'rituel', 'locks', 'longueur', 'encore', 'places', 'jours', 'civilite', 'prenom', 'recap', 'questions', 'reponse'];

const ETAPE_DITE: Record<EtapeDuFil, string> = {
  repos: 'au repos',
  qui: 'pour qui',
  besoin: 'le besoin',
  meme: 'la même chose ?',
  rituel: 'le rituel',
  locks: 'son nombre de locks',
  longueur: 'sa longueur',
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
  /** L'heure qu'elle dit (« demain 8h30 ») : HH:MM. */
  heure?: string;
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
  /* UNE DATE ÉCRITE (30 octobre 2026) : « le 30 octobre 2026 », « mardi 13
     octobre », « le 1er novembre ». Elle passe avant le jour de la semaine ;
     sans année, la prochaine ; jamais une date passée ni impossible. */
  const MOIS = MOIS_LONGS_WA.map(sansAccentsWa);
  for (const d of t.matchAll(/\b(1er|[0-3]?\d) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?: (20\d\d))?\b/g)) {
    const jour = d[1] === '1er' ? 1 : Number(d[1]);
    const mois = MOIS.indexOf(d[2]) + 1;
    const an0 = d[3] ? Number(d[3]) : Number(aujourdhui.slice(0, 4));
    const isoDe = (an: number): string => `${an}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
    const iso = !d[3] && isoDe(an0) < aujourdhui ? isoDe(an0 + 1) : isoDe(an0);
    const vraie = new Date(`${iso}T12:00:00Z`);
    if (jour < 1 || Number.isNaN(vraie.getTime()) || vraie.toISOString().slice(0, 10) !== iso || iso < aujourdhui) continue;
    const debut = d.index ?? 0;
    if (nieLeMotWa(t, debut, debut + d[0].length)) { jourEvite = jourEvite ?? iso; continue; }
    jourVoulu = iso;
    break;
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
  /* L'HEURE QU'ELLE DIT (30 octobre 2026) : « demain 8h30 », « à 15 h ».
     Hors des heures d'une journée (une durée, « 48h ») : rien. */
  let heure: string | undefined;
  for (const h of t.matchAll(/(?<![\d:])([01]?\d|2[0-3]) ?h(?:eures?)? ?([0-5]\d)?(?!\d)/g)) {
    const n = Number(h[1]);
    const debut = h.index ?? 0;
    if (n < 7 || n > 21 || nieLeMotWa(t, debut, debut + h[0].length)) continue;
    heure = `${String(n).padStart(2, '0')}:${h[2] ?? '00'}`;
    break;
  }
  return {
    jourMeme: ditAujourdhui && !jourVoulu,
    ...(jourVoulu ? { jourVoulu } : {}),
    ...(jourEvite ? { jourEvite } : {}),
    ...(moment ? { moment } : {}),
    ...(heure ? { heure } : {}),
    annuler: /\bannul/.test(t),
    deplacer: /\b(decal|report|deplac|reprogramm)/.test(t) || /\bchanger (de |mon |le |la |l'|d')?(rendez|rdv|heure|jour|date|creneau)/.test(t),
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
  if (/\b(annul|decal|report|deplac|reprogramm|retard)/.test(t)) return false;
  if (/rendez[- ]?vous|\brdv\b|\breserv|\bune place\b|\bdes places\b|\bcreneau|\bdisponib|\bdispo\b/.test(t)) return true;
  if (/\bje (voudrais|veux|souhaite|souhaiterais|aimerais|peux|pourrais|compte) (passer|venir)\b/.test(t)) return true;
  if (/\best[- ]ce que je (peux|pourrais) (passer|venir)\b/.test(t)) return true;
  if (/\bprendre (un |une )?(rendez|rdv|place|creneau)/.test(t)) return true;
  /* « Lundi prochain m'arrangerait », « samedi me conviendrait » (30 octobre
     2026, un vrai message du 6 octobre resté sans parcours). */
  return /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain)\b/.test(t)
    && /\b(passer|venir|libre|possible|m'?arrangerait|m'?arrange|me conviendrait|me convient|m'?irait|me va)\b/.test(t);
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
  /** Le parcours ouvert par la réception : son mot a déjà salué. */
  deLaReception?: boolean;
  /** Ses mots à elle, quand la réception a ouvert le parcours : le jour,
      l'heure et la prestation qu'elle a nommés s'y lisent encore. */
  texteDOrigine?: string;
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

type FormeDuMessage = 'texte' | 'boutons' | 'liste' | 'image';

type MessageSortant = {
  forme: FormeDuMessage;
  /** L'étape que ce message ouvre ou rappelle : le fil du Trône la dit. */
  etape: EtapeDuFil;
  corps: string;
  pied?: string;
  boutons?: { id: string; titre: string }[];
  bouton?: string;
  /** `section` : la rubrique de la ligne (« Lavage seul »), 24 signes au
      plus ; les lignes d'une même rubrique se suivent (30 octobre 2026). */
  lignes?: { id: string; titre: string; description?: string; section?: string }[];
  /** Une réponse de la Maison (le conseil) : son identifiant, pour la trace
      et les compteurs du Trône. */
  reponseId?: string;
  /** Ses prix viennent du catalogue du jour, par jetons : le juge de la
      Maison les laisse passer, et eux seuls. */
  prixDuCatalogue?: boolean;
  /** Écrit par la réception (Claude, 27 octobre 2026) : la trace dit
      « Assistant Maison », et les compteurs de la réception la lisent. */
  deLaReception?: boolean;
  /** UNE IMAGE (29 octobre 2026, le plan pour venir) : son adresse publique,
      que Meta va chercher ; `corps` en est alors la légende, vide permis. */
  image?: string;
  /** UN MESSAGE QUI ACCOMPAGNE : refusé par Meta, il ne fait pas passer la
      main, la confirmation est déjà partie (le plan, le lien pour venir). */
  accessoire?: boolean;
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
  if (m.forme === 'image') {
    return { ...base, type: 'image', image: { link: m.image ?? '', ...(m.corps.trim() ? { caption: m.corps } : {}) } };
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
  /* LES RUBRIQUES (30 octobre 2026) : une section par rubrique, dans l'ordre
     des lignes ; sans rubrique, une seule section sans titre, comme avant. */
  const rangee = (l: NonNullable<MessageSortant['lignes']>[number]) => ({ id: l.id, title: l.titre, ...(l.description ? { description: l.description } : {}) });
  const lignes = m.lignes ?? [];
  const sections: { title?: string; rows: ReturnType<typeof rangee>[] }[] = [];
  if (lignes.some((l) => l.section)) {
    for (const l of lignes) {
      const titre = l.section ?? '';
      const derniere = sections[sections.length - 1];
      if (derniere && derniere.title === titre) derniere.rows.push(rangee(l));
      else sections.push({ title: titre, rows: [rangee(l)] });
    }
  } else sections.push({ rows: lignes.map(rangee) });
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'list', body: { text: m.corps }, ...pied,
      action: { button: m.bouton ?? 'Choisir', sections },
    },
  };
}

/** CE QUE META REFUSERAIT, avant de l'envoyer : une liste vide = conforme. */
function respecteMeta(m: MessageSortant): string[] {
  const fautes: string[] = [];
  const corpsMax = m.forme === 'boutons' || m.forme === 'image' ? 1024 : 4096;
  if (m.forme === 'image') {
    if (!/^https:\/\/\S+$/.test(m.image ?? '')) fautes.push('image sans adresse publique');
  } else if (!m.corps.trim()) fautes.push('corps vide');
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
    /* Des rubriques : toutes les lignes en portent une, de 1 à 24 signes, et
       une rubrique ne revient pas après une autre (Meta en ferait deux). */
    if (l.some((x) => x.section)) {
      if (l.some((x) => !x.section || x.section.length > 24)) fautes.push('rubrique : de 1 à 24 signes, sur chaque ligne');
      const vues: string[] = [];
      for (const x of l) if (vues[vues.length - 1] !== x.section) vues.push(x.section ?? '');
      if (new Set(vues).size !== vues.length) fautes.push('une rubrique coupée en deux');
      if (new Set(l.map((x) => x.titre)).size !== l.length) fautes.push('deux lignes au même titre');
    }
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
  /** SA TÊTE POUR LE PRIX (30 octobre 2026, Yéman : « si c'est un ancien
      client, le système reconnaît son nombre de locks grâce au numéro ») :
      son comptage, sa longueur, sa marge, son Juste Prix (`clients`). */
  tete?: TeteDuPrix;
  /** Ses prix fermes (`Client.prixFixes`) : ils passent avant tout calcul. */
  prixFixes?: Readonly<Record<string, number>>;
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
  /** Son prix dépend de la longueur (`prixParLongueur`) ou du nombre de
      locks (calibre, tarif au lock, marches) : il faut le savoir pour le dire. */
  prixALaLongueur?: boolean;
  prixAuxLocks?: boolean;
};

/** UN PALIER DE LOCKS, comme la réservation du site le nomme : « jusqu’à 80
    locks », le calibre (« Jumbo ») et le nombre qui le représente. */
type PalierDuTour = { palier: string; nom: string; locks: number };

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
  /** LE PRIX DU CATALOGUE pour cette tête (30 octobre 2026), calculé par le
      serveur comme la réservation du site (calibre, longueur, Juste Prix sur
      l'Atelier). `undefined` : pas de prix à dire. Absent : l'automate ne dit
      aucun prix, comme avant. */
  prixDe?: (serviceId: string, tete: TeteDuPrix) => number | undefined;
  /** Les paliers de locks de la Maison, du plus petit au plus grand. */
  paliers?: readonly PalierDuTour[];
  /** LES PLACES D'UN SEUL MAÎTRE, son propre créneau rendu libre (le
      déplacement, 2 novembre 2026) : calculées par le serveur comme `places`,
      pour ce maître seul et la durée du rendez-vous. Absent : pas de
      déplacement seul, la place touchée passe à l'équipe comme avant. */
  placesDuMaitre?: (serviceIds: readonly string[], maitre: string, sauf: { date: string; time: string; dureeMin: number }) => readonly PlaceLibre[];
};

/** LE RENDEZ-VOUS QU'ELLE PEUT DÉPLACER (2 novembre 2026), lu frais par la
    fonction pour ce tour : celui que désigne le bouton « Changer l'heure » ou
    la réception (`deplacerDemande`), sinon le prochain de sa fiche. */
type RdvADeplacer = {
  id: string; updatedAt: string; clientId: string; date: string; time: string;
  maitre: string; serviceIds: string[]; dureeMin: number; status: string;
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
  /** Le rendez-vous qu'elle peut déplacer seule (2 novembre 2026). */
  deplacement?: RdvADeplacer;
  /** Le déplacement est DEMANDÉ (le bouton « Changer l'heure » d'un message de
      Perle, ou la réception qui a compris « une autre heure ») : il s'ouvre
      même en plein parcours. */
  deplacerDemande?: boolean;
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

/** LES NUMÉROS D'ESSAI N'ONT PAS DE PLAFOND (30 octobre 2026, choix de
    Yéman : ses essais de la nuit coupés au dixième message, sans un mot).
    Le plafond garde les clientes d'une boucle avec un autre robot ; les
    numéros d'essai sont ceux de la direction. */
const sansPlafondWa = (reglage: ReglageDeLAutomate, numero: string): boolean =>
  reglage.numerosEssai.some((n) => cleWa(n) === cleWa(numero));

/** L'ÉTAPE DU TOUR (28 octobre 2026). Sur un « bonjour », la réception
    avait passé la main à l'équipe, la Maison fermée ; « Je veux un RDV » puis
    « Pour le jeudi à 9h » sont restés sans réponse (essai de Yéman, 0 h 42).
    Une main passée par la réception n'arrête pas une réservation : une envie
    de réserver rouvre le parcours (l'atelier, hors parcours, la reçoit comme
    au repos). Celle qu'une personne a prise (la pause) tient toujours, et
    celle de l'automate aussi. */
function etapeDuTour(
  etat: EtatDuFil | null | undefined, tour: TourDeLaCliente | null, main: MainDuFil | null | undefined, maintenantMs: number, pauseHeures: number,
): EtapeDuFil {
  const courante = etapeCourante(etat, main, maintenantMs, pauseHeures);
  if (courante === 'main' && etat?.mainDeLaReception && tour && intentionDeReserver(tour.texte)) return 'repos';
  return courante;
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
  const courante = etapeDuTour(etat, tour, ctx.main, ms, ctx.reglage.pauseHeures);
  if (courante === 'main' || courante === 'confirme') return { parole: 'silence' };
  const mots = motsReconnus(tour.texte, ms);
  const fiches = fichesServies(ctx);
  let parle = false;
  if (ETAPES_EN_COURS.includes(courante)) {
    if (tour.media) return { parole: 'main-silencieuse', motif: 'media' };
    /* Une question de prix en plein parcours : la réponse validée si le
       conseil en a une, sinon la main passe, comme avant (14 octobre 2026).
       Le prix d'une famille nommée ouvre sa liste, comme au repos (31 octobre
       2026, essai de Yéman : « Combien coûte une coloration ? » au
       récapitulatif passait la main en silence, et le fil se taisait). */
    if (mots.prix && !leConseilParle(tour.texte, ctx.conseil) && !familleNommeeWa(tour.texte)) return { parole: 'main-silencieuse', motif: 'prix' };
    parle = true;
  } else if (tour.choix && lisLeChoix(tour.choix.id)) {
    /* Un calibre touché dans la liste de la réception (27 octobre 2026) :
       c'est à elle de répondre, avec le prix de ce calibre. */
    parle = lisLeChoix(tour.choix.id)?.geste !== 'calibre';
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
  } else if (mots.prix && familleNommeeWa(tour.texte)) {
    /* LE PRIX D'UNE FAMILLE NOMMÉE (30 octobre 2026) : « une coloration,
       c'est combien ? » ouvre la liste de ces gestes, et le prix se dit au
       choix. Avant le conseil : ses mots de prix (« combien », « prix »)
       menaient au prix d'une création. */
    parle = true;
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
  if (envois >= plafondDuFil(etat) && !confirmeValide(etat, tour, courante) && !sansPlafondWa(ctx.reglage, ctx.numero)) return { parole: 'main-silencieuse', motif: 'plafond' };
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

/** LE DÉPLACEMENT À ÉCRIRE (2 novembre 2026) : la fonction relit le
    rendez-vous, vérifie qu'il n'a pas bougé (`updatedAt`), que la place est
    libre pour SON maître sur un instantané frais, puis le déplace sous
    condition. Jamais un statut changé, jamais un nouveau rendez-vous. */
type DeplacementAPoser = {
  rdvId: string; updatedAt: string; branchId: string; clientId: string; maitre: string;
  serviceIds: string[]; dureeMin: number; avant: { date: string; time: string };
  date: string; time: string; prenom: string; numero: string;
};

/** Le verdict du déplacement : `deplace` (ou `deja`, rejoué), sinon une
    raison : la place prise (`creneau_*`), `modifie-entre-temps` (le verrou),
    `rdv-inconnu`, `rdv-clos` (annulé ou honoré entre-temps), `erreur`. */
type VerdictDuDeplacement =
  | { ok: true; verdict: 'deplace' | 'deja' }
  | { ok: false; raison: string };

type SortieDuTour = {
  messages: MessageSortant[];
  etat: EtatDuFil;
  ecritures: EcritureDuTour[];
  /** L'automate a pris ce tour : le webhook n'envoie pas sa notification
      habituelle (l'automate rend la sienne, `alerte`). */
  pris: boolean;
  alerte?: AlerteDeLAutomate;
  /** Un déplacement à écrire sous verrou (la place touchée, 2 novembre 2026). */
  deplacement?: DeplacementAPoser;
};

/** Le verdict de `pose_si_libre` (0125). */
type VerdictDeLaPose =
  | { ok: true; id: string; verdict?: 'pose' | 'deja' | 'deja_pose' }
  | { ok: false; raison: string };

/** L'ALERTE AU PERSONNEL : le prénom seul, jamais le texte qu'elle a écrit. */
function alerteDeLAutomate(o: {
  genre: 'pose' | 'main' | 'deplace'; prenom: string; numero: string; date?: string; time?: string; motif?: MotifDeLaMain;
}): AlerteDeLAutomate {
  const qui = o.prenom || 'Une cliente';
  if (o.genre === 'deplace') {
    return {
      titre: 'Rendez-vous déplacé par WhatsApp',
      corps: `${qui}, ${jourDitAvecAnnee(o.date ?? '')} à ${heureDite(o.time ?? '')}`,
      url: '/trone/#/calendrier',
    };
  }
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
    « + 1 ») : « Racines · Essentiel », sinon « Racines Essentiel »,
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

/* VENIR À LA MAISON (29 octobre 2026, Yéman : « il y a cette photo moche de
   Google Maps qui va avec ») : le lien envoyé est celui du site, dont la carte
   est la Maison et qui ouvre aussitôt Google Maps sur la porte (le lien de la
   branche, lu à la construction du site). Le plan, dessiné par la Maison, part
   en image ; le long texte de l'itinéraire ne part plus, le plan le dit. */
const LIEN_POUR_VENIR = 'https://maisonmnd.com/venir/';
const PLAN_POUR_VENIR = 'https://maisonmnd.com/assets/itineraire/plan-depuis-super-u.png';

/** La ligne du lien, telle que la cliente la lit : la Maison sur Google Maps,
    par le site, seulement quand la Maison a donné son lien. */
const ligneGoogleMapsWa = (lien: string): string => (lien ? `Maison MND sur Google Maps : ${LIEN_POUR_VENIR}` : '');

/** Le mot sans la phrase qui annonce le plan (« Le plan pour venir suit ce
    message. »), quand le plan déjà reçu ne repart pas (31 octobre 2026).
    Vide si le mot n'était que cette phrase. */
const sansLAnnonceDuPlanWa = (texte: string): string =>
  texte.replace(/[^.!?\n]*\bplan\b[^.!?\n]*\bsui(?:t|vra|vent)\b[^.!?\n]*[.!?]?[ \t]*/giu, '').replace(/\n{3,}/g, '\n\n').trim();

/** ELLE DEMANDE LE CHEMIN (30 octobre 2026, Yéman : « comment venir chez
    vous », « envoie-moi la localisation ») : l'adresse, la localisation, un
    itinéraire, « vous êtes où ». Une adresse e-mail n'est pas un chemin.
    Les bords sont ceux des lettres (« où » finit sur une lettre accentuée,
    que `\b` ne voit pas). */
function demandeLeCheminWa(texte: string): boolean {
  const t = String(texte ?? '').toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ');
  return [
    /(?<!\p{L})(?:localisation|localiser|g[ée]olocalisation|itin[ée]raire|google ?maps|plan d'acc[èe]s)(?!\p{L})/u,
    /(?<!\p{L})comment (?:venir|arriver|vous (?:trouver|rejoindre)|on (?:vient|arrive)|faire pour (?:venir|arriver|vous trouver))(?!\p{L})/u,
    /(?<!\p{L})o[uù] (?:[êe]tes[- ]vous|vous (?:trouvez|situez|[êe]tes)|se (?:trouve|situe) (?:la maison|votre)|est (?:la maison|situ[ée]e))(?!\p{L})/u,
    /(?<!\p{L})(?:vous [êe]tes|c'est|la maison est|se trouve)(?: situ[ée]e?s?)? o[uù](?!\p{L})/u,
    /(?<!\p{L})(?:votre|l'|ton|son) ?adresse(?!\p{L})(?! ?(?:e-?mail|mail|courriel|[ée]lectronique))/u,
    /(?<!\p{L})(?:envoie|envoyez|partage|partagez|donne|donnez)(?:[- ]?(?:moi|nous))? (?:la |votre |ta )?(?:loc|position)(?!\p{L})/u,
  ].some((r) => r.test(t));
}

/** ELLE EST EN ROUTE (30 octobre 2026, choix de Yéman sur « Je suis en
    route pour le shampooing » : « Bien noté », et le plan) : en route, en
    chemin, j'arrive, je quitte. Arrivée, devant la porte : pas de plan. */
function enRouteWa(texte: string): boolean {
  const t = String(texte ?? '').toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ');
  return /(?<!\p{L})(?:en route|en chemin|j'arrive|je quitte|je me mets? en route|je me mettais en route)(?!\p{L})/u.test(t);
}

/** LES GESTES QU'ELLE NOMME (30 octobre 2026, Yéman : « Je veux un
    shampoing », et l'automate lui proposait sa coiffure de la dernière
    fois ; « il faut absolument qu'il puisse lire et reconnaître les services
    du catalogue et comprendre le besoin du client »). Ses mots désignent une
    famille du catalogue par sa marque (un shampoing : KLƆKLƆ), ou un mot que
    le nom porte (coiffure, tresses, nattes, vanilles, manucure, pédicure).
    Rien de reconnu : aucun. */
const MOTS_DES_GESTES_WA: Readonly<Record<string, RegExp>> = {
  'KLƆKLƆ': /(?<!\p{L})(?:(?:sh|ch)ampo+ings?|shampoo|lavages?|laver|kloklo)(?!\p{L})/u,
  'SÍNSIN': /(?<!\p{L})(?:res+errages?|res+errer|retwists?|racines?|sinsin)(?!\p{L})/u,
  'DÀNDÀN': /(?<!\p{L})(?:hydratation|hydrater|dandan)(?!\p{L})/u,
  'WÈWÈ': /(?<!\p{L})(?:purification|detox|wewe)(?!\p{L})/u,
  'VÍVÍVÓ': /(?<!\p{L})(?:activateur|vivivo)(?!\p{L})/u,
  'GBÌGBÌ': /(?<!\p{L})(?:reconstruction|renfort|gbigbi)(?!\p{L})/u,
  /* « des colorations », « teinture », « henné » (30 octobre 2026). */
  'YÈKPÈ': /(?<!\p{L})(?:couleurs?|colorations?|colorer|teintures?|teindre|henne|yekpe)(?!\p{L})/u,
};
const MOTS_DANS_LE_NOM_WA: readonly string[] = ['coiffure', 'tresse', 'natte', 'vanille', 'manucure', 'pedicure'];

/** UNE FAMILLE NOMMÉE, aux mots seuls (30 octobre 2026, Yéman : « quand un
    client veut faire une coloration et veut connaître les prix, le
    catalogue de la coloration ne s'ouvre pas ») : le juge parle avant toute
    lecture de l'agenda, il ne lit que les marques des familles. */
const familleNommeeWa = (texte: string): boolean => {
  const t = sansAccentsWa(texte);
  return !!t && Object.values(MOTS_DES_GESTES_WA).some((re) => re.test(t));
};

function prestationsDitesWa(texte: string, prestations: readonly { id: string; name: string }[]): string[] {
  const t = sansAccentsWa(texte);
  if (!t) return [];
  const marques = new Set(Object.keys(MOTS_DES_GESTES_WA).filter((m) => MOTS_DES_GESTES_WA[m].test(t)));
  const mots = MOTS_DANS_LE_NOM_WA.filter((m) => new RegExp(`(?<!\\p{L})${m}s?(?!\\p{L})`, 'u').test(t));
  if (marques.size === 0 && mots.length === 0) return [];
  return prestations.filter((s) => marques.has(litLaMarqueWa(s.name).marque)
    || mots.some((m) => new RegExp(`(?<!\\p{L})${m}`, 'u').test(sansAccentsWa(s.name)))).map((s) => s.id);
}

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

/* ── LA LISTE DE L'ENTRETIEN, EN RUBRIQUES (30 octobre 2026) ────────────
   Yéman, sur la liste de son téléphone : « des noms qui ne sont pas
   facilement compréhensibles, le nom fon vient en fin ; il y a trois lavage
   essentiel, le client ne saura pas quoi choisir ». Maquette S6XZotKV…,
   ses choix : une liste en rubriques (Lavage et racines, Lavage seul,
   Racines seules, Autre chose), les titres par la gamme, la ligne du
   dessous dit ce que fait le geste, sa durée, puis le nom fon EN DERNIER.
   Jamais « express » : « ça dévalorise le service ». */
const RUBRIQUES_WA = { venues: 'Lavage et racines', lavages: 'Lavage seul', racines: 'Racines seules', autre: 'Autre chose' } as const;
/** Ce que fait chaque gamme, en mots simples (marque et gamme). */
const PROMESSES_WA: Readonly<Record<string, string>> = {
  'KLƆKLƆ Essentiel': 'Cuir chevelu et longueurs, rinçage soigné',
  'KLƆKLƆ Signature': 'Double shampoing, massage, huile de finition',
  'KLƆKLƆ Prestige': 'Bain d’huile, masque sous chaleur, styling',
  'SÍNSIN Essentiel': 'Lock par lock, coiffure de sortie',
  'SÍNSIN Signature': 'Tenue prolongée, visites espacées',
  /* Les soins, sans gamme : la marque seule. */
  'DÀNDÀN': 'Masque aux sept huiles végétales',
  'WÈWÈ': 'Détox du cuir chevelu et de la fibre',
  'VÍVÍVÓ': 'Massage crânien, plantes qui stimulent la pousse',
  'GBÌGBÌ': 'Renfort de la fibre',
  /* La couleur (30 octobre 2026), d'après les fiches du catalogue. */
  'YÈKPÈ Couleur': 'Henné, indigo et plantes, sans ammoniaque',
  'YÈKPÈ Éclat': 'Ravive une couleur déjà posée',
  'YÈKPÈ Lumière': 'Effet miroir, protéines de soie',
};
/** LES TITRES DE LA COULEUR (30 octobre 2026) : ses gestes ne sont pas des
    gammes ; « Couleur · Couleur » ne se lit pas. */
const TITRES_WA: Readonly<Record<string, string>> = {
  'YÈKPÈ Couleur': 'Couleur végétale',
  'YÈKPÈ Éclat': 'Raviver la couleur',
  'YÈKPÈ Lumière': 'Brillance des locks',
};
/** La famille de la couleur, dans la liste de l'entretien. */
const MARQUE_DE_LA_COULEUR = 'YÈKPÈ';
/** L'ordre des gestes de la couleur. */
const GESTES_DE_LA_COULEUR: readonly string[] = ['Couleur', 'Éclat', 'Lumière'];
/** L'ordre des gammes dans une rubrique. */
const GAMMES_WA: readonly string[] = ['Essentiel', 'Signature', 'Prestige'];
/** La longueur, telle qu'elle se touche et se lit. */
const LONGUEURS_WA: readonly { id: LongueurWa; titre: string; dite: string; indice: string }[] = [
  { id: 'court', titre: 'Court', dite: 'court', indice: 'Jusqu’aux épaules' },
  { id: 'mi-long', titre: 'Mi-long', dite: 'mi-long', indice: 'Des épaules aux omoplates' },
  { id: 'long', titre: 'Long', dite: 'long', indice: 'Au-delà des omoplates' },
];

/** « KLƆKLƆ™ Essentiel · Le Souffle » : la gamme « Essentiel » et le nom de
    la Maison « Le Souffle » (le premier segment après le point). */
const gammeEtNomWa = (nom: string): { marque: string; gamme: string; nomMaison: string } => {
  const { marque, variante, sansNiveau } = litLaMarqueWa(nom);
  const morceaux = String(nom ?? '').split(' · ').map((x) => x.trim());
  return { marque, gamme: sansNiveau ? '' : variante, nomMaison: (morceaux[1] ?? '').replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim() };
};

/** Le nom fon, en dernier : « KLƆKLƆ™ · Le Souffle », ou la marque seule. */
const fonEnDernierWa = (nom: string): string => {
  const { marque, nomMaison } = gammeEtNomWa(nom);
  return nomMaison ? `${marque}™ · ${nomMaison}` : `${marque}™`;
};

/** UN NOMBRE DE LOCKS ÉCRIT (« environ 120 », « 200 locks ») : de 10 à 3 000. */
function locksEcritsWa(texte: string): number | null {
  const m = /(?<!\d)(\d{2,4})(?!\d)/.exec(String(texte ?? '').replace(/(\d)[\s.](\d{3})(?!\d)/g, '$1$2'));
  const n = m ? Number(m[1]) : Number.NaN;
  return Number.isFinite(n) && n >= 10 && n <= 3000 ? n : null;
}

/** UNE LONGUEUR ÉCRITE : « courtes », « mi-longues », « longues ». */
function longueurEcriteWa(texte: string): LongueurWa | null {
  const t = sansAccentsWa(texte);
  if (/\bmi[\s-]?longs?(ues?)?\b|\bmoyen(ne)?s?\b|\bomoplates?\b/.test(t)) return 'mi-long';
  if (/\bcourt(e|es|s)?\b|\bepaules?\b/.test(t)) return 'court';
  if (/\blong(ue|ues|s)?\b|\btres longs?\b/.test(t)) return 'long';
  return null;
}

/** « Je ne sais pas », « aucune idée », « pas compté ». */
const neSaitPasWa = (texte: string): boolean =>
  /\b(je ne sais pas|je sais pas|sais pas|aucune idee|pas d'idee|jamais compte|pas compte|je ne connais pas)\b/.test(sansAccentsWa(texte));

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
  /** CE QU'ELLE A NOMMÉ (30 octobre 2026) : les gestes du catalogue que ses
      mots désignent, réservables ici, sans les versions Kids ni « avec votre
      produit » ; huit au plus, comme une liste. */
  const ditsDuTexte = (texte: string): string[][] =>
    prestationsDitesWa(texte, (agenda?.prestations ?? []).filter((s) => directe(s) && !/\bkids\b|avec votre (?:produit|couleur)/i.test(s.name)))
      .slice(0, 8).map((id) => [id]);

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
  const laMain = (motif: MotifDeLaMain, dire: boolean, corps?: string, parLaReception = false): SortieDuTour => {
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
    base.mainDeLaReception = parLaReception || undefined;
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
    /* UN DÉPLACEMENT (2 novembre 2026) : les places de son maître seul, sa
       propre place rendue libre, et sa place d'avant jamais reproposée. */
    const d = base.panier.deplacement;
    if (d && agenda.placesDuMaitre) {
      return [...agenda.placesDuMaitre(ids, d.maitre, { date: d.date, time: d.time, dureeMin: d.dureeMin })]
        .filter((p) => p.iso > aujourdhui && !(p.iso === d.date && p.heure === d.time)).sort(chrono);
    }
    return [...agenda.places(ids)].filter((p) => p.iso > aujourdhui).sort(chrono);
  };
  /** LE JOUR VOULU OÙ LA MAISON EST FERMÉE (30 octobre 2026, « lundi
      prochain m'arrangerait dans l'après-midi ») : il ne trie plus les
      places, le moment reste. Son nom (« lundi »), ou rien. */
  const jourFermeVoulu = (): string | null => {
    const j = base.panier.jourVoulu;
    if (!j) return null;
    const dow = /^\d{4}-\d{2}-\d{2}$/.test(j) ? dowDeIsoWa(j) : JOURS_LONGS_WA.indexOf(j);
    const h = (agenda?.semaine ?? []).find((x) => x.key === ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][dow]);
    return h?.closed ? JOURS_LONGS_WA[dow] : null;
  };
  const convient = (p: PlaceLibre): boolean => {
    const j = jourFermeVoulu() ? undefined : base.panier.jourVoulu;
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
  /** Le jour et l'heure qu'elle a dits, quand les deux se lisent : un jour
      de la semaine se cherche parmi les places offertes. */
  const placeVoulue = (offertes: readonly PlaceLibre[]): PlaceLibre | null => {
    const h = base.panier.heureVoulue;
    const j = base.panier.jourVoulu;
    if (!h || !j || base.panier.jourChoisi) return null;
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(j) ? j : offertes.find((p) => JOURS_LONGS_WA[dowDeIsoWa(p.iso)] === j)?.iso;
    return iso ? { iso, heure: h } : null;
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
    /* L'HEURE QU'ELLE A DITE (30 octobre 2026, « demain 8h30 ») : les places
       qui l'entourent, tant qu'elle n'a pas choisi un autre jour. */
    const voulue = o.proche ? null : placeVoulue(offertes);
    if (o.proche || voulue) {
      const t0 = tempsDe(o.proche ?? voulue!);
      sel = [...offertes].sort((a, b) => Math.abs(tempsDe(a) - t0) - Math.abs(tempsDe(b) - t0) || chrono(a, b))
        .slice(0, PLACES_PROPOSEES).sort(chrono);
      if (voulue) {
        const jour = voulue.iso === isoPlusJoursWa(aujourdhui, 1) ? 'demain' : `le ${jourDitAvecAnnee(voulue.iso)}`;
        intro = intro ?? `Voici les places les plus proches de ${jour} à ${heureDite(voulue.heure)}, ${appel()}.`;
      }
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
        const ferme = jourFermeVoulu();
        if (ferme) {
          const m = base.panier.moment;
          intro = intro ?? `La Maison est fermée le ${ferme}, ${appel()}. Voici les places les plus proches${m ? (m === 'matin' ? ', le matin' : ", l'après-midi") : ''}.`;
        } else if ((base.panier.jourVoulu || base.panier.moment) && voulues.length === 0) {
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

  /* ── La liste de l'entretien, en rubriques (30 octobre 2026) ── */
  /** Les gestes d'une famille qui se réservent ici, sans Kids ni « avec votre
      produit », rangés par gamme (Essentiel, Signature, Prestige). */
  const gestesDeLaFamille = (marque: string, max: number): PrestationDuTour[] => {
    const rang = (s: PrestationDuTour): number => {
      const i = GAMMES_WA.indexOf(gammeEtNomWa(s.name).gamme);
      return i < 0 ? GAMMES_WA.length : i;
    };
    return (agenda?.prestations ?? [])
      .filter((s) => directe(s) && litLaMarqueWa(s.name).marque === marque && !/\bkids\b|avec votre produit/i.test(s.name))
      .sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'fr'))
      .slice(0, max);
  };
  /** LES GESTES DE LA COULEUR (30 octobre 2026) : Couleur, Éclat, Lumière ;
      celui que la Maison a nommé passe avant l'ancien du même geste. */
  const gestesDeLaCouleur = (): PrestationDuTour[] => {
    const rang = (s: PrestationDuTour): number => {
      const i = GESTES_DE_LA_COULEUR.indexOf(gammeEtNomWa(s.name).gamme);
      return i < 0 ? GESTES_DE_LA_COULEUR.length : i;
    };
    const sansNom = (s: PrestationDuTour): number => (gammeEtNomWa(s.name).nomMaison ? 0 : 1);
    return (agenda?.prestations ?? [])
      .filter((s) => directe(s) && litLaMarqueWa(s.name).marque === MARQUE_DE_LA_COULEUR && !/\bkids\b|avec votre (?:produit|couleur)/i.test(s.name))
      .sort((a, b) => rang(a) - rang(b) || sansNom(a) - sansNom(b) || a.name.localeCompare(b.name, 'fr'))
      .slice(0, 8);
  };
  /** La ligne du dessous : ce que fait le geste, la durée, le nom fon en dernier. */
  const dessousDuGeste = (s: PrestationDuTour): string => {
    const { marque, gamme } = gammeEtNomWa(s.name);
    const promesse = gamme ? PROMESSES_WA[`${marque} ${gamme}`] : PROMESSES_WA[marque];
    const duree = dureeDiteWa(dureeDesPrestations([s.id], agenda?.prestations ?? []));
    if (!promesse) return descriptionDesGestes([s.id]);
    /* Trop long : le nom de la Maison tombe d'abord, la phrase reste entière. */
    for (const fon of [fonEnDernierWa(s.name), `${marque}™`]) {
      const fin = [duree, fon].filter(Boolean).join(' · ');
      if (promesse.length + 3 + fin.length <= 72) return `${promesse} · ${fin}`;
    }
    const fin = [duree, `${marque}™`].filter(Boolean).join(' · ');
    return `${coupeWa(promesse, 72 - fin.length - 3)} · ${fin}`;
  };
  /** « Lavage · Essentiel », « Racines · Signature » ; sans gamme, le geste. */
  const titreDuGeste = (s: PrestationDuTour): string => {
    const { marque, gamme } = gammeEtNomWa(s.name);
    const propre = TITRES_WA[`${marque} ${gamme}`];
    if (propre) return propre;
    const g = GESTES_EN_FRANCAIS[marque];
    if (!g || !gamme) return titreEnFrancaisWa(s.name);
    return [`${g.court} · ${gamme}`, `${g.court} ${gamme}`].find((x) => x.length <= 24) ?? titreEnFrancaisWa(s.name);
  };
  /** DEUX LIGNES NE PORTENT JAMAIS LE MÊME TITRE : la seconde prend le nom de
      la Maison (« Lavage · Le Souffle »), sinon ses gestes, sinon son nom. */
  const titreDistinct = (titre: string, ids: readonly string[], vus: Set<string>): string => {
    if (!vus.has(titre)) return titre;
    const s = ids.length === 1 ? prestation(ids[0]) : undefined;
    const { marque, nomMaison } = gammeEtNomWa(s?.name ?? '');
    const g = GESTES_EN_FRANCAIS[marque];
    const essais = [...(g && nomMaison ? [`${g.court} · ${nomMaison}`] : []), titreDesGestes(ids), coupeWa(s?.name ?? titre, 24)];
    return essais.find((x) => x.length <= 24 && !vus.has(x)) ?? titre;
  };
  /** UNE VENUE LAVAGE ET RACINES (les formules de la Maison) : « Entretien ·
      Essentiel », la gamme de la reprise ; dessous « Lavage Le Souffle et
      reprise des racines · 2 h 20 · KLƆKLƆ™ + SÍNSIN™ ». Une autre formule
      garde le titre de ses gestes. */
  const ligneDeLaVenue = (ids: readonly string[]): { titre: string; description: string } => {
    const ps = ids.map((id) => prestation(id)).filter((s): s is PrestationDuTour => !!s);
    const lavage = ps.find((s) => litLaMarqueWa(s.name).marque === 'KLƆKLƆ');
    const racines = ps.find((s) => litLaMarqueWa(s.name).marque === 'SÍNSIN');
    if (ps.length !== 2 || !lavage || !racines) return { titre: titreDesGestes(ids), description: descriptionDesGestes(ids) };
    const r = gammeEtNomWa(racines.name);
    const l = gammeEtNomWa(lavage.name);
    const reprise = !r.nomMaison || /^la reprise$/i.test(r.nomMaison) ? 'reprise des racines' : r.nomMaison.replace(/^(la|le|l’|l')\s*/i, '').toLowerCase();
    const duree = dureeDiteWa(dureeDesPrestations(ids, agenda?.prestations ?? []));
    const fin = [duree, 'KLƆKLƆ™ + SÍNSIN™'].filter(Boolean).join(' · ');
    const debut = `Lavage${l.nomMaison ? ` ${l.nomMaison}` : ''} et ${reprise}`;
    return { titre: r.gamme ? `Entretien · ${r.gamme}` : titreDesGestes(ids), description: `${coupeWa(debut, 72 - fin.length - 3)} · ${fin}` };
  };

  /** LA LISTE EN RUBRIQUES : les deux venues que les clientes prennent le
      plus (les formules de la Maison), chaque lavage, chaque reprise, un
      soin, la Maison. `null` quand le catalogue n'a ni lavage ni reprise ici :
      la liste d'avant reprend. */
  const msgEntretien = (relance: boolean): MessageSortant | null => {
    const lavages = gestesDeLaFamille('KLƆKLƆ', 3);
    const racines = gestesDeLaFamille('SÍNSIN', 3);
    if (lavages.length === 0 && racines.length === 0) return null;
    const venues = (agenda?.formules ?? []).map((f) => [...f.serviceIds])
      .filter((ids) => ids.length >= 2 && ids.length <= 6 && ids.every((id) => directe(prestation(id))))
      .slice(0, 2);
    const desSoins = soinsDuCheveu().length > 0;
    /* La couleur a sa ligne, à côté d'un soin (30 octobre 2026) : sans elle,
       une cliente venue pour sa couleur ne la trouvait nulle part. */
    const couleurs = gestesDeLaCouleur();
    /* Dix lignes au plus avec la Maison : les reprises cèdent d'abord. */
    const place = 10 - venues.length - lavages.length - (desSoins ? 1 : 0) - (couleurs.length > 0 ? 1 : 0) - 1;
    const rangees: { ids: string[]; section: string; titre: string; description: string }[] = [
      ...venues.map((ids) => ({ ids, section: RUBRIQUES_WA.venues, ...ligneDeLaVenue(ids) })),
      ...lavages.map((s) => ({ ids: [s.id], section: RUBRIQUES_WA.lavages, titre: titreDuGeste(s), description: dessousDuGeste(s) })),
      ...racines.slice(0, Math.max(0, place)).map((s) => ({ ids: [s.id], section: RUBRIQUES_WA.racines, titre: titreDuGeste(s), description: dessousDuGeste(s) })),
    ];
    const vus = new Set<string>();
    for (const r of rangees) {
      r.titre = titreDistinct(r.titre, r.ids, vus);
      vus.add(r.titre);
    }
    passe('rituel');
    base.panier.rituels = rangees.map((r) => [...r.ids]);
    base.panier.offerts = rangees.map((r) => [...r.ids]);
    base.panier.enAjout = false;
    base.panier.dansLesSoins = false;
    base.panier.rubriques = true;
    const quels = [...new Set(soinsDuCheveu().map((ids) => GESTES_EN_FRANCAIS[litLaMarqueWa(prestation(ids[0])?.name ?? '').marque]?.long ?? '').filter(Boolean))];
    const lignes = [
      ...rangees.map((r, i) => ({ id: choix('rituel', String(i)), titre: r.titre, description: r.description, section: r.section })),
      ...(desSoins ? [{ id: choix('autre-soin'), titre: 'Un soin', description: coupeWa(gestesDitsWa(quels.map((q, i) => (i === 0 ? q : q.toLowerCase()))), 72), section: RUBRIQUES_WA.autre }] : []),
      ...(couleurs.length > 0 ? [{ id: choix('couleur'), titre: 'Une couleur', description: coupeWa(gestesDitsWa([...new Set(couleurs.map(titreDuGeste))].map((q, i) => (i === 0 ? q : q.toLowerCase()))), 72), section: RUBRIQUES_WA.autre }] : []),
    ];
    return {
      forme: 'liste', etape: 'rituel', pied: PIED, bouton: 'Choisir',
      corps: propre(relance ? relanceDite() : `Quel entretien souhaitez-vous, ${appel()} ?`),
      lignes: [...lignes.slice(0, 9), { ...sortieMaison, description: 'Une personne de la Maison vous répond', section: RUBRIQUES_WA.autre }],
    };
  };

  /* ── Le prix, dès le choix (30 octobre 2026) ──
     « Rajoute le prix une fois le client sélectionné » ; « si c'est un ancien
     client, le système reconnaît son nombre de locks grâce au numéro ; si
     c'est un nouveau client, demander le nombre de locks avant de finaliser
     le RDV » (Yéman). Sa fiche d'abord, puis ce qu'elle a dit ; la longueur
     n'est demandée que si un geste choisi se paie à la longueur. */
  const teteConnue = (): TeteDuPrix & { inconnus?: boolean } => {
    const f = ficheChoisie()?.tete;
    const dit = base.panier.tete ?? {};
    const locks = f?.locks && f.locks > 0 ? f.locks : dit.locks;
    const longueur = f?.longueur ?? dit.longueur;
    return {
      ...(locks ? { locks } : {}),
      ...(longueur ? { longueur } : {}),
      ...(f?.marge ? { marge: true } : {}),
      ...(f?.coef && f.coef > 0 && f.coef !== 1 ? { coef: f.coef } : {}),
      ...(dit.locksInconnus && !locks ? { inconnus: true } : {}),
    };
  };
  /** Les gestes du panier dont on dit le prix : aucun si une consultation,
      un devis ou un prix masqué s'y trouve (la consultation d'abord). */
  const gestesAuPrix = (): PrestationDuTour[] => {
    const ps = (base.panier.serviceIds ?? []).map((id) => prestation(id));
    if (!agenda?.prixDe || ps.length === 0 || ps.some((s) => !s || estUneConsultation(s, cats) || s.hidePrice || priceModeOf(s) === 'devis')) return [];
    return ps as PrestationDuTour[];
  };
  const prixFixeDuGeste = (id: string): number | undefined => {
    const v = ficheChoisie()?.prixFixes?.[id];
    return typeof v === 'number' && v > 0 ? Math.round(v) : undefined;
  };
  /** CE QU'IL MANQUE pour dire le prix : son nombre de locks, sa longueur, rien. */
  const ilManque = (): 'locks' | 'longueur' | null => {
    const tete = teteConnue();
    const ps = gestesAuPrix().filter((s) => prixFixeDuGeste(s.id) === undefined);
    if (ps.some((s) => s.prixAuxLocks) && !tete.locks && !tete.inconnus) return 'locks';
    if (ps.some((s) => s.prixALaLongueur) && !tete.longueur) return 'longueur';
    return null;
  };
  /** Le prix de chaque geste, [bas, haut] : égaux quand la tête est connue ;
      son nombre de locks ignoré, du plus petit palier au plus grand. */
  const prixDesGestes = (): { s: PrestationDuTour; prix: [number, number] }[] | null => {
    const tete = teteConnue();
    const paliers = agenda?.paliers ?? [];
    const out: { s: PrestationDuTour; prix: [number, number] }[] = [];
    for (const s of gestesAuPrix()) {
      const ferme = prixFixeDuGeste(s.id);
      if (ferme !== undefined) { out.push({ s, prix: [ferme, ferme] }); continue; }
      const { inconnus, ...pour } = tete;
      const essais = s.prixAuxLocks && !pour.locks
        ? paliers.map((p) => agenda!.prixDe!(s.id, { ...pour, locks: p.locks }))
        : [agenda!.prixDe!(s.id, pour)];
      const lus = essais.filter((x): x is number => typeof x === 'number' && x > 0);
      if (lus.length === 0) return null;
      out.push({ s, prix: [Math.min(...lus), Math.max(...lus)] });
    }
    return out.length > 0 ? out : null;
  };
  const prixDuPanierDit = (): string | null => {
    const p = prixDesGestes();
    if (!p) return null;
    const bas = p.reduce((n, x) => n + x.prix[0], 0);
    const haut = p.reduce((n, x) => n + x.prix[1], 0);
    return bas === haut ? prixDitWa(bas) : `de ${prixDitWa(bas).replace(/ F$/, '')} à ${prixDitWa(haut)}`;
  };
  const msgPrix = (): MessageSortant | null => {
    const p = prixDesGestes();
    const total = prixDuPanierDit();
    if (!p || !total) return null;
    const tete = teteConnue();
    const dit = (x: [number, number]): string => (x[0] === x[1] ? prixDitWa(x[0]) : `de ${prixDitWa(x[0]).replace(/ F$/, '')} à ${prixDitWa(x[1])}`);
    /* Ce que sa fiche a donné, et seulement ce qui a servi au prix. */
    const f = ficheChoisie()?.tete;
    const calcules = p.filter((x) => prixFixeDuGeste(x.s.id) === undefined);
    const deLaFiche = [
      calcules.some((x) => x.s.prixAuxLocks) && f?.locks ? `environ ${f.locks} locks` : '',
      calcules.some((x) => x.s.prixALaLongueur) && f?.longueur ? LONGUEURS_WA.find((l) => l.id === f.longueur)?.dite ?? '' : '',
    ].filter(Boolean).join(', ');
    const sa = base.panier.pourQui ? `la fiche de ${base.panier.pourQui}` : 'votre fiche';
    const selon = deLaFiche ? `, d’après ${sa} (${deLaFiche})` : '';
    const lignes = [
      p.length === 1 ? `${titreDuGeste(p[0].s)} : ${total}${selon}.` : `Votre rendez-vous : ${total}${selon}.`,
      ...(p.length > 1 ? [p.map((x) => `${titreDuGeste(x.s).replace(' · ', ' ')} ${dit(x.prix)}`).join(' · ')] : []),
      ...(tete.inconnus && p.some((x) => x.prix[0] !== x.prix[1]) ? ['Selon votre nombre de locks : nous les compterons ensemble à la Maison.'] : []),
    ];
    base.panier.horsPlafond = (base.panier.horsPlafond ?? 0) + 1;
    return { forme: 'texte', etape: base.etape, corps: lignes.join('\n'), prixDuCatalogue: true };
  };
  /** SON NOMBRE DE LOCKS, quand la fiche ne le dit pas : les paliers du site,
      et « Je ne sais pas ». */
  const msgLocks = (relance: boolean): MessageSortant | null => {
    const paliers = (agenda?.paliers ?? []).slice(0, 7);
    if (paliers.length === 0) return null;
    passe('locks');
    if (!relance) base.panier.horsPlafond = (base.panier.horsPlafond ?? 0) + 1;
    const pour = base.panier.pourQui ? `les locks de ${base.panier.pourQui}` : 'vos locks';
    return liste('locks', relance ? relanceDite() : `Pour vous donner le prix juste, ${appel()} : combien de locks environ ? Comptez ${pour} à peu près, ou touchez « Je ne sais pas ».`, 'Choisir', [
      ...paliers.map((p) => ({ id: choix('locks', String(p.locks)), titre: coupeWa(p.palier.charAt(0).toUpperCase() + p.palier.slice(1), 24), description: `Calibre ${p.nom}` })),
      { id: choix('locks', 'inconnu'), titre: 'Je ne sais pas', description: 'Nous les compterons ensemble à la Maison' },
    ]);
  };
  const msgLongueur = (relance: boolean): MessageSortant => {
    passe('longueur');
    if (!relance) base.panier.horsPlafond = (base.panier.horsPlafond ?? 0) + 1;
    const deja = !!(base.panier.tete?.locks || base.panier.tete?.locksInconnus);
    const question = deja ? `Et leur longueur, ${appel()} ?` : `Pour vous donner le prix juste, ${appel()} : quelle est la longueur de vos locks ?`;
    return liste('longueur', relance ? relanceDite() : question, 'Choisir',
      LONGUEURS_WA.map((l) => ({ id: choix('longueur', l.id), titre: l.titre, description: l.indice })));
  };
  /** APRÈS LE CHOIX : ce qu'il manque se demande ; sinon le prix, puis la
      suite (« un autre soin ? » ou les places). */
  const apresLeChoix = (suite: 'rituel' | 'places'): SortieDuTour => {
    base.panier.apresLePrix = suite;
    const manque = ilManque();
    if (manque === 'locks') { const m = msgLocks(false); if (m) return dire(m); }
    if (manque === 'longueur') return dire(msgLongueur(false));
    return avecLePrix(suite);
  };
  const avecLePrix = (suite: 'rituel' | 'places'): SortieDuTour => {
    base.panier.apresLePrix = undefined;
    const prix = msgPrix();
    const apres = suite === 'places' ? dire(msgPlaces({})) : apresLeRituel();
    if (!prix || apres.messages.length === 0) return apres;
    base.envois.push(maintenant);
    return { ...apres, messages: [prix, ...apres.messages] };
  };
  /** Sa réponse sur sa tête : la question suivante, ou le prix et la suite. */
  const teteDite = (dit: { locks?: number; longueur?: LongueurWa; locksInconnus?: boolean }): SortieDuTour => {
    base.panier.tete = { ...(base.panier.tete ?? {}), ...dit };
    return apresLeChoix(base.panier.apresLePrix ?? 'rituel');
  };

  const sontDesConsultations = (offres: readonly string[][]): boolean =>
    offres.length > 0 && offres.every((ids) => ids.length === 1 && !!prestation(ids[0]) && estUneConsultation(prestation(ids[0])!, cats));

  const msgRituel = (relance: boolean, offres: string[][], ajout = false, soins = false): MessageSortant | null => {
    const valables = offres.filter((ids) => ids.length > 0 && ids.every((id) => reservableWa(prestation(id)))).slice(0, 8);
    if (valables.length === 0) return null;
    passe('rituel');
    base.panier.rituels = valables.map((ids) => [...ids]);
    if (!ajout && !soins) base.panier.offerts = valables.map((ids) => [...ids]);
    if (!ajout && !soins) base.panier.rubriques = undefined;
    base.panier.enAjout = ajout;
    base.panier.dansLesSoins = soins;
    if ((ajout || soins) && !relance) base.panier.horsPlafond = (base.panier.horsPlafond ?? 0) + 1;
    const consultations = sontDesConsultations(valables);
    const corps = relance ? relanceDite()
      : ajout ? `Quel soin ajouter, ${appel()} ?`
        : soins ? `Quel soin souhaitez-vous, ${appel()} ?`
          : consultations ? `Quelle consultation souhaitez-vous, ${appel()} ?` : `Quel rituel souhaitez-vous, ${appel()} ?`;
    const reparation = agenda?.consultationParParcours?.reparation;
    /* « Autre soin » ouvre la liste des soins, s'il y en a, qu'on n'y est
       pas déjà et qu'elle n'est pas déjà toute là ; sinon il passe la main,
       comme avant. */
    const dejaLa = (ids: string[]): boolean => valables.some((v) => v.length === ids.length && v.every((x, k) => x === ids[k]));
    const desSoins = !soins && soinsDuCheveu().some((ids) => !dejaLa(ids));
    const quels = [...new Set(soinsDuCheveu().map((ids) => GESTES_EN_FRANCAIS[litLaMarqueWa(prestation(ids[0])?.name ?? '').marque]?.long ?? '').filter(Boolean))];
    /* Le nom fon en dernier (30 octobre 2026) : un geste dit ce qu'il fait,
       une venue lavage et racines se nomme comme dans la liste en rubriques. */
    const ligneDe = (ids: string[]): { titre: string; description: string } => {
      const s = ids.length === 1 ? prestation(ids[0]) : undefined;
      if (s && !estUneConsultation(s, cats)) return { titre: titreDuGeste(s), description: dessousDuGeste(s) };
      return ids.length > 1 ? ligneDeLaVenue(ids) : { titre: titreDesGestes(ids), description: descriptionDesGestes(ids) };
    };
    const vus = new Set<string>();
    const rangees = valables.map((ids, i) => {
      const r = ids.length === 1 && ids[0] === reparation && ajout
        ? { id: choix('rituel', String(i)), titre: 'Réparer mes locks', description: coupeWa(`consultation d'abord · ${descriptionDesGestes(ids)}`, 72) }
        : { id: choix('rituel', String(i)), ...ligneDe(ids) };
      r.titre = titreDistinct(r.titre, ids, vus);
      vus.add(r.titre);
      return r;
    });
    return liste('rituel', corps, 'Choisir', [
      ...rangees,
      ...(consultations ? [] : [{ id: choix('autre-soin'), titre: 'Autre soin',
        description: desSoins ? coupeWa(gestesDitsWa(quels), 72) : 'une personne de la Maison vous répond' }]),
    ]);
  };

  /** LES SOINS QU'ELLE PEUT ENCORE AJOUTER : les offres du premier choix,
      moins ce qu'elle a déjà pris (une formule dont elle a pris un geste
      offre le reste), sans dépasser trois soins, sans doublon. Jamais un
      second geste d'une famille déjà prise (30 octobre 2026 : la liste en
      rubriques offre trois lavages, un seul se prend). */
  const soinsAAjouter = (): string[][] => {
    const pris = base.panier.serviceIds ?? [];
    const marqueDe = (id: string): string => litLaMarqueWa(prestation(id)?.name ?? '').marque;
    const prises = new Set(pris.map(marqueDe).filter((m) => !!GESTES_EN_FRANCAIS[m]));
    const vus = new Set<string>();
    return (base.panier.offerts ?? [])
      .map((ids) => ids.filter((id) => !pris.includes(id) && !prises.has(marqueDe(id))))
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
    const restes = soinsAAjouter();
    /* La liste en rubriques ne porte pas les soins (30 octobre 2026) : le
       lavage et les racines pris, les soins du cheveu viennent d'eux-mêmes. */
    const pris = base.panier.serviceIds ?? [];
    const soins = restes.length > 0 ? [] : soinsDuCheveu().filter((ids) => !ids.some((id) => pris.includes(id)));
    const liste = [...restes, ...soins, ...(r ? [[r]] : [])];
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
    /* Le prix dit au choix se redit ici (30 octobre 2026). */
    const prix = prixDuPanierDit();
    const corps = relance ? relanceDite()
      : `Voici ${de}, ${appel()} : ${gestes}${prix ? `, ${prix}` : ''}, ${quandDuPanier()}, à la ${maisonNomWa}. Nous le posons ?`;
    return { ...boutons('recap', corps, [
      { id: choix('oui'), titre: 'Je confirme' },
      { id: choix('autre-heure'), titre: 'Une autre heure' },
    ]), ...(prix ? { prixDuCatalogue: true } : {}) };
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
        : base.panier.rubriques
        ? dire(msgEntretien(relance) ?? msgRituel(relance, base.panier.rituels ?? []), 'autre-soin')
        : dire(msgRituel(relance, base.panier.rituels ?? []), 'autre-soin');
      case 'locks': {
        const m = msgLocks(relance);
        return m ? dire(m) : avecLePrix(base.panier.apresLePrix ?? 'rituel');
      }
      case 'longueur': return dire(msgLongueur(relance));
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
  /** CE QU'ELLE A NOMMÉ PASSE AVANT « LA MÊME CHOSE » (30 octobre 2026) :
      la liste de ces gestes-là (« Pour votre lavage, quel rituel
      souhaitez-vous ? »). Ajouter un soin puise ensuite dans les soins du
      cheveu, jamais un second lavage. */
  const msgDits = (avecSalut: boolean): MessageSortant | null => {
    const couleur = gestesDeLaCouleur().map((s) => s.id);
    const dits = (base.panier.dits ?? []).filter((ids) => ids.every((id) => directe(prestation(id))))
      /* La couleur dans son ordre : Couleur, Éclat, Lumière. */
      .sort((a, b) => (couleur.includes(a[0]) && couleur.includes(b[0]) ? couleur.indexOf(a[0]) - couleur.indexOf(b[0]) : 0));
    base.panier.dits = undefined;
    if (dits.length === 0) return null;
    /* Elle demande le prix (30 octobre 2026) : la liste, même si le geste
       était dans sa dernière venue, et le prix vient au choix. */
    const auPrix = motsReconnus(tour?.texteDOrigine ?? tour?.texte ?? '', ms).prix;
    const prixAuChoix = auPrix && !!agenda?.prixDe
      && dits.every((ids) => ids.every((id) => { const s = prestation(id); return !!s && !s.hidePrice && priceModeOf(s) !== 'devis'; }));
    /* Ce qu'elle nomme était dans sa dernière venue (« pour mes racines »,
       après un resserrage) : « la même chose » reste la bonne question. */
    const v = auPrix ? null : venueReprenable(ficheChoisie());
    const marqueDe = (id: string): string => litLaMarqueWa(prestation(id)?.name ?? '').marque;
    const siennes = new Set((v?.serviceIds ?? []).map(marqueDe).filter((x) => !!GESTES_EN_FRANCAIS[x]));
    const marques = [...new Set(dits.map(([id]) => marqueDe(id)).filter((x) => !!GESTES_EN_FRANCAIS[x]))];
    const sansMarque = dits.filter(([id]) => !GESTES_EN_FRANCAIS[marqueDe(id)]);
    const dansSaVenue = marques.every((x) => siennes.has(x)) && (sansMarque.length === 0 || sansMarque.some(([id]) => !!v?.serviceIds.includes(id)));
    if (v && dansSaVenue) return null;
    /* DEUX GESTES NOMMÉS ENSEMBLE (30 octobre 2026, « Shampooing et
       reserrage ») : les formules qui les réunissent, en un seul choix ;
       sans formule, les gestes un à un, et « Ajouter un soin » repropose
       les autres. */
    const ensemble = marques.length > 1
      ? (agenda?.formules ?? []).map((f) => [...f.serviceIds])
        .filter((ids) => ids.length > 0 && ids.length <= SOINS_PAR_RENDEZ_VOUS && ids.every((id) => directe(prestation(id)))
          && marques.every((x) => ids.some((id) => marqueDe(id) === x)))
        .slice(0, 8)
      : [];
    const m = msgRituel(false, ensemble.length > 0 ? ensemble : dits);
    if (!m) return null;
    base.panier.besoin = 'entretien';
    base.panier.offerts = ensemble.length === 0 && marques.length > 1 ? dits : [];
    /* « votre lavage », « vos racines » (le pluriel du 30 octobre 2026). */
    const noms = sansMarque.length === 0 ? marques.map((x) => GESTES_EN_FRANCAIS[x].court.toLowerCase()).map((n) => (/s$/.test(n) ? `vos ${n}` : `votre ${n}`)) : [];
    const question = noms.length > 0 ? `Pour ${noms.join(' et ')}, quel rituel souhaitez-vous` : 'Quel rituel souhaitez-vous';
    const prixDit = prixAuChoix ? ' Choisissez-en un : nous vous donnons son prix.' : '';
    return { ...m, corps: propre(avecSalut ? `${salut()} ${appel()}, merci de votre message. ${question} ?${prixDit}` : `${question}, ${appel()} ?${prixDit}`) };
  };

  const pourLaFiche = (f: FicheDuNumero, avecSalut: boolean): SortieDuTour => {
    base.panier.clientId = f.id;
    /* Sans titulaire, celle qui écrit n'est pas cette fiche : on parle
       « de Kemi », jamais « de votre » dernière venue. */
    base.panier.pourQui = f.id !== titulaire?.id ? prenomDuNomWa(f.nom) : undefined;
    return dire(msgDits(avecSalut) ?? msgMeme(false, avecSalut) ?? msgBesoin(false, avecSalut));
  };

  /** DÉCALER (30 octobre 2026, choix de Yéman : « proposer de nouvelles
      places ») : les places de sa dernière venue, à toucher ; la place
      touchée passe à l'équipe, qui déplace le rendez-vous. L'automate ne
      déplace jamais seul. Sans titulaire, sans venue ou sans place : rien
      ici, la main passe comme avant. */
  const deplaceLeRendezVous = (mots: MotsDuTour): SortieDuTour | null => {
    /* SEULE, SOUS VERROU (2 novembre 2026, choix de Yéman) : le rendez-vous
       lu par la fonction, les places de son maître ; la place touchée le
       déplace. Sans lui, le repli d'avant : la place touchée passe à
       l'équipe. */
    const r = ctx.deplacement;
    const sienne = r ? fiches.find((f) => f.id === r.clientId) : undefined;
    if (r && sienne && agenda?.placesDuMaitre && ['confirmé', 'en attente'].includes(r.status) && r.date >= aujourdhui) {
      const pourQui = sienne.id !== titulaire?.id ? prenomDuNomWa(sienne.nom) : undefined;
      /* « Décaler mon rendez-vous de samedi 10 h » : ce jour et cette heure
         nomment le rendez-vous, pas la place voulue. */
      const leSien = (j: string): boolean => j === r.date || (!/^\d{4}-\d{2}-\d{2}$/.test(j) && JOURS_LONGS_WA[dowDeIsoWa(r.date)] === j);
      const lu = tour?.texteDOrigine ? motsReconnus(tour.texteDOrigine, ms) : mots;
      base.panier = {
        clientId: sienne.id, besoin: 'entretien', serviceIds: [...r.serviceIds],
        deplacement: { rdvId: r.id, updatedAt: r.updatedAt, date: r.date, time: r.time, maitre: r.maitre, dureeMin: r.dureeMin },
        ...(pourQui ? { pourQui } : {}),
        ...(lu.jourVoulu && !leSien(lu.jourVoulu) ? { jourVoulu: lu.jourVoulu } : {}),
        ...(lu.jourEvite ? { jourEvite: lu.jourEvite } : {}),
        ...(lu.moment ? { moment: lu.moment } : {}),
        ...(lu.heure && lu.heure !== r.time ? { heureVoulue: lu.heure } : {}),
      };
      const de = pourQui ? `le rendez-vous de ${pourQui}` : 'votre rendez-vous';
      const m = msgPlaces({ intro: `Pour déplacer ${de} du ${jourDitAvecAnnee(r.date)} à ${heureDite(r.time)}${cotonou}, voici les prochaines places, ${appel()}. Touchez celle qui vous convient : le rendez-vous y est déplacé aussitôt, avec les mêmes soins.` });
      if (!m) { base.panier = {}; return null; }
      base.prisLe = maintenant;
      base.rdvId = undefined;
      base.mainPasseeLe = undefined;
      base.motifMain = undefined;
      base.mainDeLaReception = undefined;
      base.etapeAvantLaMain = undefined;
      base.versionAvantLaMain = undefined;
      return dire(m);
    }
    const f = titulaire;
    const v = venueReprenable(f);
    if (!f || !v || !agenda) return null;
    base.panier = {
      clientId: f.id, besoin: 'entretien', serviceIds: [...v.serviceIds], deplace: f.prochainRdv?.date ?? '',
      ...(mots.jourVoulu ? { jourVoulu: mots.jourVoulu } : {}),
      ...(mots.jourEvite ? { jourEvite: mots.jourEvite } : {}),
      ...(mots.moment ? { moment: mots.moment } : {}),
      ...(mots.heure ? { heureVoulue: mots.heure } : {}),
    };
    const rdv = f.prochainRdv?.date;
    const m = msgPlaces({ intro: `Pour déplacer votre rendez-vous${rdv ? ` du ${jourDitAvecAnnee(rdv)}` : ''}, voici les prochaines places, ${appel()}. Touchez celle qui vous convient : une personne de la Maison déplace le rendez-vous.` });
    if (!m) { base.panier = {}; return null; }
    base.prisLe = maintenant;
    base.rdvId = undefined;
    base.mainPasseeLe = undefined;
    base.motifMain = undefined;
    base.mainDeLaReception = undefined;
    base.etapeAvantLaMain = undefined;
    base.versionAvantLaMain = undefined;
    return dire(m);
  };

  const accueil = (mots: MotsDuTour): SortieDuTour => {
    /* Le parcours ouvert par la réception garde ses mots à elle : le jour,
       l'heure et la prestation qu'elle a nommés (30 octobre 2026). */
    const lu = tour?.texteDOrigine ? motsReconnus(tour.texteDOrigine, ms) : mots;
    const dits = ditsDuTexte(tour?.texteDOrigine ?? tour?.texte ?? '');
    base.panier = {
      ...(lu.jourVoulu ? { jourVoulu: lu.jourVoulu } : {}),
      ...(lu.jourEvite ? { jourEvite: lu.jourEvite } : {}),
      ...(lu.moment ? { moment: lu.moment } : {}),
      ...(lu.heure ? { heureVoulue: lu.heure } : {}),
      ...(dits.length > 0 ? { dits } : {}),
    };
    base.prisLe = maintenant;
    base.rdvId = undefined;
    base.mainPasseeLe = undefined;
    base.motifMain = undefined;
    base.mainDeLaReception = undefined;
    base.etapeAvantLaMain = undefined;
    base.versionAvantLaMain = undefined;
    /* Ouvert par la réception, dont le mot précède : il a déjà salué. */
    const salue = !tour?.deLaReception;
    if (fiches.length === 0) return dire(msgDits(salue) ?? msgBesoin(false, salue));
    if (fiches.length === 1 && titulaire) return pourLaFiche(titulaire, salue);
    return dire(msgQui(false, salue));
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
    if (b === 'entretien') return dire(msgEntretien(false) ?? msgRituel(false, formulesOffertes()), 'autre-soin');
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
    /* UN DÉPLACEMENT SOUS VERROU (2 novembre 2026) : la place touchée le
       déplace. Aucun message ici : la confirmation, ou la place prise, vient
       avec le verdict (`suiteDuDeplacement`). */
    const d = base.panier.deplacement;
    if (d) {
      base.panier.date = p.iso;
      base.panier.time = p.heure;
      return {
        messages: [], etat: base, ecritures: [], pris: true,
        deplacement: {
          rdvId: d.rdvId, updatedAt: d.updatedAt, branchId: agenda?.branchId ?? '', clientId: base.panier.clientId ?? '',
          maitre: d.maitre, serviceIds: [...(base.panier.serviceIds ?? [])], dureeMin: d.dureeMin,
          avant: { date: d.date, time: d.time }, date: p.iso, time: p.heure, prenom: prenomPourAlerte(), numero: ctx.numero,
        },
      };
    }
    /* Un déplacement : la place touchée passe à l'équipe, rien n'est posé. */
    if (base.panier.deplace !== undefined) {
      return laMain('annulation', true, `Bien noté, ${appel()} : vous souhaitez venir le ${jourDitAvecAnnee(p.iso)} à ${heureDite(p.heure)}${cotonou}. Une personne de la Maison déplace votre rendez-vous et vous le confirme ici.`);
    }
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
  /** LE PLAN UNE FOIS (31 octobre 2026, Yéman : « si le map a déjà été
      envoyé à une adresse ne pas le renvoyer à chaque fois sinon ça devient
      ennuyant ») : le plan et la Maison sur Google Maps partent une fois par
      numéro, puis seulement quand elle demande le chemin. « Je suis en
      route » ne le renvoie plus : elle l'a déjà. `force` : le mot qui
      précède ne tient que par lui. Ce qui est rendu est vide quand ils ne
      repartent pas. */
  const lePlan = (etape: EtapeDuFil, habille: (m: MessageSortant) => MessageSortant = (m) => m, force = false): MessageSortant[] => {
    /* JAMAIS À UNE CLIENTE DÉJÀ VENUE (1er novembre 2026, Yéman : « l'itinéraire
       ne s'envoie qu'une fois pour les nouvelles clientes, jamais pour une
       ancienne cliente, elle connaît le lieu ») : une cliente venue la veille
       a reçu l'adresse et le plan en réponse à « un peu en retard ». Une tête
       qui a déjà une venue ne reçoit le plan que si elle demande le chemin. */
    if (titulaire?.derniereVenue && !(tour && demandeLeCheminWa(tour.texte))) return [];
    if (base.planEnvoyeLe && !force && !(tour && demandeLeCheminWa(tour.texte))) return [];
    base.planEnvoyeLe = maintenant;
    const lien = ligneGoogleMapsWa(lienMapsWa(ctx.maison.carte));
    return [
      habille({ forme: 'image', etape, corps: '', image: PLAN_POUR_VENIR, accessoire: true }),
      ...(lien ? [habille({ forme: 'texte', etape, corps: lien, accessoire: true })] : []),
    ];
  };

  const ditLeVerdict = (verdict: VerdictDeLaPose): SortieDuTour => {
    const p = base.panier;
    if (verdict.ok) {
      base.rdvId = verdict.id;
      passe('confirme');
      const de = p.pourQui ? `le rendez-vous de ${p.pourQui}` : 'votre rendez-vous';
      /* TROIS BULLES (29 octobre 2026, choix de Yéman) : la confirmation,
         courte ; le plan, en image ; enfin la Maison sur Google Maps, dont la
         carte de lien est celle de la Maison. Le plan déjà reçu ne repart
         pas, et la confirmation ne l'annonce plus (31 octobre 2026). */
      const plan = lePlan('confirme');
      const corps = [
        `C'est confirmé, ${appel()} : ${de} est retenu le ${quandDuPanier()}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`,
        ...(plan.length > 0 ? ['Le plan pour venir à la Maison suit ce message.'] : []),
        DEVISE,
      ].join('\n\n');
      return sortie([
        texte('confirme', corps),
        ...plan,
      ], alerteDeLAutomate({
        genre: 'pose', prenom: prenomPourAlerte(), numero: ctx.numero, date: p.date, time: p.time,
      }));
    }
    if (['creneau_pris', 'creneau_plafond', 'creneau_complet', 'creneau_hors_ouverture', 'creneau_ferme'].includes(verdict.raison) && p.date && p.time) {
      return placePrise({ iso: p.date, heure: p.time });
    }
    return laMain('erreur', true);
  };

  /** LE VERDICT DU DÉPLACEMENT (2 novembre 2026). Déplacé : « C'est fait »,
      le jour avec son année, la devise ; l'équipe est prévenue. La place prise
      entre-temps : les places les plus proches, sans elle. Le rendez-vous
      modifié entre-temps (le verrou) : la main passe, rien n'est écrit. */
  const ditLeDeplacement = (verdict: VerdictDuDeplacement): SortieDuTour => {
    const p = base.panier;
    const d = p.deplacement;
    if (verdict.ok && d && p.date && p.time) {
      base.rdvId = d.rdvId;
      passe('confirme');
      const de = p.pourQui ? `le rendez-vous de ${p.pourQui}` : 'votre rendez-vous';
      const corps = [
        `C'est fait, ${appel()} : ${de} est déplacé au ${jourDitAvecAnnee(p.date)} à ${heureDite(p.time)}${cotonou}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`,
        DEVISE,
      ].join('\n\n');
      return sortie([texte('confirme', corps)], alerteDeLAutomate({ genre: 'deplace', prenom: prenomPourAlerte(), numero: ctx.numero, date: p.date, time: p.time }));
    }
    if (!verdict.ok && /^creneau_/.test(verdict.raison) && d && p.date && p.time) {
      return placePrise({ iso: p.date, heure: p.time });
    }
    if (!verdict.ok && verdict.raison === 'modifie-entre-temps') {
      return laMain('annulation', true, `Votre rendez-vous vient d'être modifié de notre côté, ${appel()}. Une personne de la Maison vous répond ici.`);
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
    if (envoisQuiComptent(base.envois, ctx.main, ms) >= plafondDuFil(base) && !confirme && !sansPlafondWa(ctx.reglage, ctx.numero)) return laMain('plafond', false);
    if (enCours && t.media) return laMain('media', false);
    if (enCours && mots.prix && !ch) {
      /* Le conseil a peut-être la réponse (14 octobre 2026). */
      const q = questionDuTour(t.texte, false);
      if (q) return q;
      /* Sinon, le prix d'une famille qu'elle nomme : sa liste, comme au
         repos, plutôt que la main en silence ; le panier en cours est
         laissé, rien n'était posé (31 octobre 2026). Le cuir chevelu passe
         toujours devant. */
      if (ditsDuTexte(t.texte).length > 0 && !lisLeConseil(t.texte, ctx.conseil).sante) return accueil(mots);
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
    if (mots.deplacer && !mots.annuler && (!enCours || ctx.deplacerDemande)) {
      const d = deplaceLeRendezVous(mots);
      if (d) return d;
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
      /* Le prix d'un geste qu'elle nomme et qui se réserve ici : sa liste,
         avant les réponses du conseil (30 octobre 2026, « une coloration,
         c'est combien ? »). Le cuir chevelu passe toujours devant. */
      const dits = ditsDuTexte(t.texte);
      const auPrixDUnGeste = mots.prix && dits.length > 0 && !lisLeConseil(t.texte, ctx.conseil).sante;
      if (!ch && conseilActif(ctx.conseil) && !auPrixDUnGeste) {
        const neuve = ctx.premierMessage && fiches.length === 0;
        const q = questionDuTour(t.texte, neuve);
        if (q) {
          /* Un parcours neuf : rien de l'ancien panier ne suit la réponse,
             sauf les gestes qu'elle a nommés : « Réserver » les propose. */
          base.panier = dits.length > 0 ? { dits } : {};
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
            return dire(msgDits(false) ?? msgBesoin(false, false));
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
            /* La réponse parlait d'un geste qu'elle a nommé (la couleur) : sa liste. */
            return dire(msgDits(false) ?? msgBesoin(false, false));
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
            return apresLeChoix('places');
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
            return apresLeChoix('rituel');
          }
          if (g === 'autre-soin') {
            /* Depuis une liste de rituels : les soins du cheveu ; depuis la
               liste des soins elle-même : une personne de la Maison. */
            const montres = base.panier.rituels ?? [];
            const dejaLa = (ids: string[]): boolean => montres.some((v) => v.length === ids.length && v.every((x, k) => x === ids[k]));
            if (!base.panier.dansLesSoins && soinsDuCheveu().some((ids) => !dejaLa(ids))) return dire(msgRituel(false, soinsDuCheveu(), !!base.panier.enAjout, true) ?? msgPlaces({}));
            return laMain('autre-soin', true);
          }
          if (g === 'couleur') {
            /* « Une couleur », dans la liste de l'entretien (30 octobre 2026) :
               ses gestes, le prix au choix. */
            const m = msgRituel(false, gestesDeLaCouleur().map((s) => [s.id]));
            return dire(m ? { ...m, corps: propre(`Pour votre couleur, quel rituel souhaitez-vous, ${appel()} ?`) } : null, 'autre-soin');
          }
          break;
        }
        case 'locks': {
          if (g === 'locks' && arg === 'inconnu') return teteDite({ locksInconnus: true });
          const n = g === 'locks' ? Number(arg) : Number.NaN;
          if (Number.isFinite(n) && n > 0) return teteDite({ locks: n, locksInconnus: undefined });
          break;
        }
        case 'longueur': {
          const l = LONGUEURS_WA.find((x) => x.id === arg);
          if (g === 'longueur' && l) return teteDite({ longueur: l.id });
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
      case 'locks': {
        /* ÉCRIT AU LIEU D'ÊTRE TOUCHÉ (30 octobre 2026) : « environ 120 »,
           « je ne sais pas » ; une longueur dite en même temps se garde. */
        const l = longueurEcriteWa(t.texte);
        if (neSaitPasWa(t.texte)) return teteDite({ locksInconnus: true, ...(l ? { longueur: l } : {}) });
        const n = locksEcritsWa(t.texte);
        if (n) return teteDite({ locks: n, locksInconnus: undefined, ...(l ? { longueur: l } : {}) });
        break;
      }
      case 'longueur': {
        const l = longueurEcriteWa(t.texte);
        if (l) return teteDite({ longueur: l });
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

  /* LA RÉCEPTION (27 octobre 2026) : Claude a répondu là où l'automate se
     taisait. Son message part tel qu'il l'a écrit (la fonction de réception
     l'a jugé : la voix, les seuls montants du catalogue, ni numéro ni le mot
     banni) ; le fil se dit « clos », répondu : l'alarme se tait, et le mot
     suivant repasse par le juge. « equipe » : la main passe, l'équipe est
     prévenue, et son message dit qui prend le relais. */
  const laReception = (r: ReponseDeLaReception): SortieDuTour => {
    const signe = (m: MessageSortant): MessageSortant => ({ ...m, deLaReception: true, prixDuCatalogue: true });
    if (r.suite === 'equipe') {
      const s = laMain('question', true, r.texte, true);
      return { ...s, messages: s.messages.map((m) => signe({ ...m, corps: r.texte })) };
    }
    passe('clos');
    /* LE CHEMIN (30 octobre 2026) : son mot dit l'adresse, puis le plan et
       la Maison sur Google Maps, comme après une confirmation. Claude dit
       « rien » à une question de chemin : le plan part quand même. */
    if (r.suite === 'venir' || (r.suite === 'rien' && !!tour && (demandeLeCheminWa(tour.texte) || enRouteWa(tour.texte)))) {
      /* Le plan déjà reçu ne repart pas d'office (31 octobre 2026), ni jamais
         à une cliente déjà venue sauf si elle demande le chemin (1er novembre
         2026, voir `lePlan`) ; son mot perd la phrase qui l'annonce : jamais
         un « le plan suit » sans le plan. Un mot qui n'était que cette phrase
         garde le plan, ou devient le mot bref quand le plan ne part pas. */
      const sansLAnnonce = sansLAnnonceDuPlanWa(r.texte);
      const plan = lePlan('clos', signe, !sansLAnnonce);
      return sortie([
        signe({ forme: 'texte', etape: 'clos', corps: plan.length > 0 ? r.texte : sansLAnnonce || 'Bien noté, nous vous attendons.' }),
        ...plan,
      ]);
    }
    if (r.suite === 'calibre' && r.lignes && r.lignes.length > 0) {
      /* Les calibres portent un identifiant de la Maison (« MND:… »), sans quoi leur toucher n'arriverait pas jusqu'ici. */
      const lignes = r.lignes.slice(0, 9).map((l) => ({ ...l, id: l.id.startsWith('calibre:') ? choix('calibre', l.id.slice('calibre:'.length)) : l.id }));
      return sortie([signe({ forme: 'liste', etape: 'clos', corps: r.texte, pied: PIED, bouton: 'Choisir mon calibre', lignes: [...lignes, sortieMaison] })]);
    }
    /* L'ACCORD DES NOUVELLES (2 novembre 2026) : la question suit son mot,
       en second message, avec ses deux boutons (lus par le webhook) et la
       sortie de la Maison. Seulement les boutons de l'accord ; refusée par
       Meta, elle n'empêche rien (accessoire). */
    const lesBoutons = (r.ensuite?.boutons ?? []).filter((b) => /^NOUVELLES:(oui|non)$/.test(b.id) && !!b.titre && b.titre.length <= 20).slice(0, 2);
    const ensuite: MessageSortant[] = r.ensuite && r.ensuite.texte.trim() && lesBoutons.length === 2
      ? [signe({ forme: 'boutons', etape: 'clos', corps: r.ensuite.texte.trim(), pied: PIED, boutons: [...lesBoutons, sortieMaison], accessoire: true })]
      : [];
    return sortie([signe({ forme: 'texte', etape: 'clos', corps: r.texte }), ...ensuite]);
  };

  return { base, joue, laMain, ditLeVerdict, ditLeDeplacement, reprend, laReception };
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

/* ── 11. LA RÉCEPTION : L'ASSISTANT QUI RÉPOND · 27 octobre 2026 ────────
   « Est-ce que mon assistant répond aux messages WhatsApp de cette façon même
   quand je dors ? » (Yéman, sur une vidéo de démonstration). Là où le juge
   se tait (une question, un prix, un merci, un mot qu'il ne reconnaît pas),
   la fonction `reception-wa` fait répondre Claude avec la voix et les règles
   de « Proposer une réponse » (shared/reception-wa-pur), et dit la suite.
   Le réglage vit à part (`mnd_assistant_wa`) : la base remet en forme celui
   de l'automate et n'y garderait pas un champ neuf. Livrée en ESSAI. */
type ModeDeLaReception = 'non' | 'essai' | 'tous';
type ReglageDeLaReception = { mode: ModeDeLaReception };
const CLE_DE_LA_RECEPTION = 'mnd_assistant_wa';
const RECEPTION_LIVREE: ReglageDeLaReception = { mode: 'essai' };

function reglageDeLaReception(brut: unknown): ReglageDeLaReception {
  const m = brut && typeof brut === 'object' ? (brut as { mode?: unknown }).mode : undefined;
  return { mode: m === 'non' || m === 'essai' || m === 'tous' ? m : RECEPTION_LIVREE.mode };
}

/** QUI ELLE SERT : personne, les numéros d'essai de l'automate, ou tout le
    monde. Jamais l'équipe ni les prestataires. */
function laReceptionSert(r: ReglageDeLaReception, numero: string, numerosEssai: readonly string[], tiroir: TiroirDuNumero | undefined): boolean {
  if (tiroir === 'equipe' || tiroir === 'prestataires') return false;
  if (r.mode === 'tous') return true;
  if (r.mode === 'essai') return numerosEssai.some((n) => cleWa(n) === cleWa(numero));
  return false;
}

/* « deplacer » (2 novembre 2026, lot 3 de Perle) : elle demande une autre
   heure pour un rendez-vous qu'elle a ; la réception rend son `rdvId`, et le
   déplacement s'ouvre (`tourPourDeplacer`). */
type SuiteDeLaReception = 'rien' | 'reserver' | 'creation' | 'reparation' | 'calibre' | 'equipe' | 'venir' | 'deplacer';
/** `ensuite` (2 novembre 2026, maquette « Nouvelles par WhatsApp ») : la
    question de l'accord des nouvelles, après un « oui je viens » écrit ; la
    réception a déjà marqué la fiche, l'automate l'envoie après son mot. */
type EnsuiteDeLaReceptionWa = { texte: string; boutons: { id: string; titre: string }[] };
type ReponseDeLaReception = {
  texte: string; suite: SuiteDeLaReception; lignes?: { id: string; titre: string; description?: string }[]; rdvId?: string;
  ensuite?: EnsuiteDeLaReceptionWa;
};
/** Ce que l'automate dit savoir faire à la réception (`sait`) : envoyer la
    question de l'accord après son mot. Sans cela, elle ne la pose pas. */
const CE_QUE_L_AUTOMATE_SAIT: readonly string[] = ['accord'];
/** Les suites qui ouvrent le parcours de l'automate : sa liste des
    prestations, ou les places d'un déplacement. */
const SUITES_DU_PARCOURS: readonly SuiteDeLaReception[] = ['reserver', 'creation', 'reparation', 'deplacer'];

/** PEUT-ELLE PARLER ? Le juge s'est tu, et ce n'est pas un silence voulu :
    le numéro servi par l'automate ET par la réception, aucune main de
    l'équipe, un tour neuf, et l'automate n'a pas passé la main. */
function laReceptionPeutParler(
  etat: EtatDuFil | null | undefined, tour: TourDeLaCliente, ctx: ContexteLeger, r: ReglageDeLaReception,
): boolean {
  const ms = ctx.maintenantMs;
  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir)) return false;
  if (!laReceptionSert(r, ctx.numero, ctx.reglage.numerosEssai, ctx.tiroir)) return false;
  if (pauseActive(ctx.main, ms)) return false;
  if (tour.waIds.length === 0) return false;
  const quand = msWa(tour.quand);
  if (Number.isFinite(quand) && ms - quand > TOUR_PERIME_MS) return false;
  return etapeCourante(etat, ctx.main, ms, ctx.reglage.pauseHeures) !== 'main';
}

/* ── LE MERCI SANS QUESTION (le Trône, 27 octobre 2026 ; l'automate, 31) ──
   Les mots d'un message qui clôt sans rien demander. « oui » n'en est pas :
   il répond souvent à une question qui attend une suite. Le Trône les range
   dans « Un merci, sans question » (a-traiter-pur, qui les lit ici). */
const MOTS_DU_MERCI = new Set([
  'merci', 'mercii', 'merciii', 'thanks', 'thank', 'you', 'amen', 'beaucoup', 'bcp', 'infiniment', 'mille', 'fois', 'encore',
  'ok', 'okay', 'oki', 'okk', 'dac', 'daccord', 'd', 'accord', 'super', 'parfait', 'top', 'cool', 'genial', 'tres', 'bien',
  'recu', 'note', 'entendu', 'ca', 'marche', 'je', 'confirme', 'pour', 'a', 'demain', 'bientot', 'tout', 'l', 'heure', 'tantot',
  'vous', 'aussi', 'de', 'meme', 'bonne', 'journee', 'soiree', 'nuit', 'fin', 'semaine', 'et', 'inchallah', 'inchaalla', 'inchalla',
  'insha', 'allah', 'dieu', 'benisse', 'vous', 'madame', 'maman', 'tata', 'ma', 'chere', 'c', 'est', 'gentil', 'vraiment',
]);
/** Ce qui fait d'un message un merci (au moins un de ces mots, ou un pouce, des mains jointes, un cœur). */
const MARQUES_DU_MERCI = new Set(['merci', 'mercii', 'merciii', 'thanks', 'amen', 'ok', 'okay', 'oki', 'okk', 'dac', 'daccord', 'super', 'parfait', 'top', 'cool', 'recu', 'note', 'entendu', 'marche', 'confirme']);
const EMOJI_DU_MERCI = /[\u{1F44D}\u{1F64F}\u{2764}\u{1F49B}\u{1F49C}\u{1F49A}\u{1F499}\u{1F60A}\u{1F970}\u{1F44C}\u{1F917}\u{2665}]/u;

/** UN MERCI, SANS QUESTION : court (80 signes au plus), sans « ? », fait
    seulement de mots qui remercient ou acquiescent, avec au moins une marque
    (merci, ok, d'accord, parfait…) ou un emoji de remerciement seul. */
function estUnMerci(texte: string | undefined): boolean {
  const brut = (texte ?? '').trim();
  if (!brut || brut.length > 80 || brut.includes('?')) return false;
  const plat = brut.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mots = plat.replace(/[’']/g, ' ').split(/[^a-z]+/).filter(Boolean);
  if (mots.length === 0) return EMOJI_DU_MERCI.test(brut);
  return mots.every((m) => MOTS_DU_MERCI.has(m)) && mots.some((m) => MARQUES_DU_MERCI.has(m));
}

/** Le dernier message parti de la Maison vers ce numéro, tel que la base le garde. */
type DernierMotDeLaMaison = { texte: string; quand: string } | null;

/** RIEN À RÉPONDRE (31 octobre 2026). « Ok » de W. N. après la confirmation
    de son rendez-vous : la réception a écrit trois phrases, dont un vieux
    vocal. Un merci qui suit un mot de la Maison sans question n'attend rien :
    l'automate se tait (avant même « en train d'écrire »), la notification
    habituelle part, le Trône le range dans « Un merci, sans question ».
    Après une question de la Maison, « ok » est un oui : la réception parle. */
function unMerciSansSuite(tour: TourDeLaCliente, dernier: DernierMotDeLaMaison): boolean {
  if (tour.media || tour.choix || !dernier) return false;
  return estUnMerci(tour.texte) && !dernier.texte.includes('?');
}

/** Le tour qui ouvre le parcours après la réception : son intention dite
    simplement (ses mots à elle passeraient de nouveau par le juge, qui s'est
    tu), sans le choix d'une ancienne liste. */
const INTENTION_DE_LA_RECEPTION = 'Je voudrais prendre rendez-vous.';
const tourPourLeParcours = (tour: TourDeLaCliente): TourDeLaCliente => ({ waIds: tour.waIds, quand: tour.quand, texte: INTENTION_DE_LA_RECEPTION, texteDOrigine: tour.texte, media: false, deLaReception: true });
/** LE DÉPLACEMENT DEMANDÉ (2 novembre 2026) : le bouton « Changer l'heure »
    d'un message de Perle, ou la réception qui rend « deplacer ». Le tour se
    lit comme une demande de déplacer ; le jour et l'heure qu'elle a écrits
    restent dans `texteDOrigine`. */
const INTENTION_DE_DEPLACER = 'Je voudrais déplacer mon rendez-vous.';
const tourPourDeplacer = (tour: TourDeLaCliente, deLaReception = false): TourDeLaCliente =>
  ({ waIds: tour.waIds, quand: tour.quand, texte: INTENTION_DE_DEPLACER, texteDOrigine: tour.texte, media: false, ...(deLaReception ? { deLaReception: true } : {}) });

/** LE TOUR D'UN BOUTON « CHANGER L'HEURE » DE PERLE (2 novembre 2026) : ce
    bouton n'est pas un choix de l'automate (`tourDeLaCliente` l'écarte), le
    webhook le confie avec `deplacer`. Le tour est ce toucher seul, lu comme
    une demande de déplacer. Déjà traité : `null`, rien de plus. */
function tourDuBoutonDeDeplacer(messages: readonly MessageEntrantDuTour[], waIds: readonly string[], traites: readonly string[] = []): TourDeLaCliente | null {
  const deja = new Set(traites);
  const siens = messages
    .filter((m) => (m.sens ?? 'entrant') === 'entrant' && !!m.waId && waIds.includes(String(m.waId)) && !deja.has(String(m.waId)))
    .sort((a, b) => msWa(a.quand) - msWa(b.quand));
  if (siens.length === 0) return null;
  const dernier = siens[siens.length - 1];
  return { waIds: siens.map((m) => String(m.waId)), quand: dernier.quand, texte: INTENTION_DE_DEPLACER, texteDOrigine: String(dernier.texte ?? dernier.bouton?.texte ?? ''), media: false };
}

/** Le mot de la réception qui précède la liste du parcours. */
const prefaceDeLaReception = (texte: string, etape: EtapeDuFil): MessageSortant =>
  ({ forme: 'texte', etape, corps: texte, deLaReception: true, prixDuCatalogue: true });

/** LE MOT DE SECOURS : Claude absent, en retard ou fautif, jamais un silence. */
function secoursDeLaReception(maintenantMs: number, semaine: readonly HeureDeLaSemaine[], exceptions: readonly ExceptionDHoraire[]): ReponseDeLaReception {
  const quand = prochaineOuvertureDite(maintenantMs, semaine, exceptions);
  return {
    texte: quand === null
      ? 'Merci pour votre message. Une personne de la Maison vous répond dans un instant.'
      : `Merci pour votre message. La Maison vous répond ${quand}.`,
    suite: 'equipe',
  };
}

function reponseDeLaReception(ancien: EtatDuFil | null, tour: TourDeLaCliente, ctx: ContexteDuTour, r: ReponseDeLaReception): SortieDuTour {
  return atelierDuTour(ancien, tour, ctx, false).laReception(r);
}

/** APRÈS LE VERROU : `etat` est celui que `etapeSuivante` vient de rendre
    avec l'écriture `pose` ; la version ne monte pas (une écriture par tour). */
function suiteDeLaPose(etat: EtatDuFil, verdict: VerdictDeLaPose, ctx: ContexteDuTour): SortieDuTour {
  return atelierDuTour(etat, null, ctx, true).ditLeVerdict(verdict);
}

/** APRÈS LE DÉPLACEMENT SOUS VERROU (2 novembre 2026) : comme la pose, une
    seule écriture par tour, la version ne monte pas. */
function suiteDuDeplacement(etat: EtatDuFil, verdict: VerdictDuDeplacement, ctx: ContexteDuTour): SortieDuTour {
  return atelierDuTour(etat, null, ctx, true).ditLeDeplacement(verdict);
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

/* LE BARÈME DU SITE, recopié de src/apps/revelateur/prix-calibre.ts entre ses
   repères (30 octobre 2026) : le prix dit dès le choix est celui du site. */
/* ⟨prix-calibre⟩ */
export type Bande ={ id: string; name: string; maxLocks: number | null; coef: number; durCoef: number };

export type PrestationTarifee = {
  id: string;
  categoryId: string;
  priceXof?: number;
  priceMode?: 'fixe' | 'variable' | 'devis';
  scalesWithModel?: boolean;
  priceFloors?: Record<string, number>;
  bandId?: string;
  bandIds?: string[];
  ratePerLock?: number;
  tarifMode?: 'lock' | 'calibre';
  prixParLongueur?: Partial<Record<string, number>>;
  paliersDeLocks?: { auDela: number; prixXof: number }[];
};

export type ContexteDuCalibre = {
  bande?: Bande;
  lockCount?: number;
  sets?: Record<string, Bande[]>;
  cats?: { id: string; parentId?: string }[];
  baremeSuspendu?: boolean;
};

/* Les mêmes exemptions que `shared/pricing` (FIXED_PRICE_SERVICE_IDS) : ces
   quatre-là ne bougent ni au calibre ni au coefficient, par identifiant. */
const PRIX_FIXES = new Set(['sv-gbigbi-essentiel', 'sv-rituel-mq6wbusw', 'sv-rituel-mq6zu12s', 'sv-rituel-mp2qnjwa']);

export const bandesTriees = (bandes: readonly Bande[]): Bande[] =>
  [...bandes].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));

/** « ≤ 80 locks », « 81 – 150 locks », « > 550 locks » : la définition de la tranche. */
export function etendueDeLaBande(bande: Bande, bandes: readonly Bande[]): string {
  const tri = bandesTriees(bandes);
  const i = tri.findIndex((b) => b.id === bande.id);
  const avant = i > 0 ? tri[i - 1].maxLocks ?? 0 : 0;
  if (bande.maxLocks == null) return `plus de ${avant} locks`;
  return avant === 0 ? `jusqu’à ${bande.maxLocks} locks` : `${avant + 1} à ${bande.maxLocks} locks`;
}

/** Le nombre de locks qui représente la tranche : son plafond, ou cent de
    plus que la tranche d'en dessous pour la dernière, sans plafond. */
export function representantDeLaBande(bande: Bande, bandes: readonly Bande[]): number {
  if (bande.maxLocks != null) return bande.maxLocks;
  const tri = bandesTriees(bandes);
  const i = tri.findIndex((b) => b.id === bande.id);
  return (i > 0 ? tri[i - 1].maxLocks ?? 0 : 0) + 100;
}

const bandeDuCompte = (lockCount: number | undefined, bandes: readonly Bande[]): Bande | undefined => {
  if (!lockCount || lockCount <= 0 || bandes.length === 0) return undefined;
  const tri = bandesTriees(bandes);
  return tri.find((b) => lockCount <= (b.maxLocks ?? Infinity)) ?? tri[tri.length - 1];
};

/* `bandForService` : la famille hérite du barème de son atelier, en remontant
   les parents ; sans barème propre, la tranche de la tête. */
const bandeDeLaPrestation = (s: PrestationTarifee, ctx: ContexteDuCalibre): Bande | undefined => {
  let id: string | undefined = s.categoryId;
  for (let i = 0; id && i < 8; i += 1) {
    const propre = ctx.sets?.[id];
    if (propre?.length) return bandeDuCompte(ctx.lockCount, propre);
    id = ctx.cats?.find((c) => c.id === id)?.parentId;
  }
  return ctx.bande;
};

const sertLaBande = (s: PrestationTarifee, bande: Bande | undefined): boolean => {
  if (s.bandIds?.length) return !!bande && s.bandIds.includes(bande.id);
  if (!bande) return true;
  if (s.bandId) return s.bandId === bande.id;
  const cles = Object.keys(s.priceFloors ?? {});
  return cles.length === 0 || cles.includes(bande.id);
};

const modeDuTarif = (s: PrestationTarifee): 'lock' | 'calibre' => s.tarifMode ?? (s.ratePerLock ? 'lock' : 'calibre');

const arrondi = (x: number): number => {
  const r = Math.round(x / 500) * 500;
  return r === 0 && x > 0 ? Math.round(x) : r;
};

const prixSelonLesLocks = (s: PrestationTarifee, lockCount: number | undefined): number | undefined => {
  if (!s.paliersDeLocks?.length || !lockCount || lockCount <= 0) return undefined;
  let gagnant: { auDela: number; prixXof: number } | undefined;
  for (const pal of s.paliersDeLocks) {
    if (lockCount > pal.auDela && (!gagnant || pal.auDela > gagnant.auDela)) gagnant = pal;
  }
  return gagnant?.prixXof;
};

const suitLeModele = (s: PrestationTarifee, ctx: ContexteDuCalibre): boolean =>
  !PRIX_FIXES.has(s.id) && !ctx.baremeSuspendu && s.scalesWithModel === true;

/** Le prix de la prestation pour ce calibre, au franc près comme au Trône.
    `undefined` quand la prestation n'a aucun prix ; sinon le nombre. */
export function prixSelonLeCalibre(s: PrestationTarifee, ctx: ContexteDuCalibre): number | undefined {
  const base = Number(s.priceXof ?? 0);
  if (PRIX_FIXES.has(s.id)) return base || undefined;
  const bande = bandeDeLaPrestation(s, ctx);
  const deBase = prixSelonLesLocks(s, ctx.lockCount) ?? base;
  if (!sertLaBande(s, bande)) return deBase || undefined;
  if (modeDuTarif(s) === 'calibre' && bande && s.priceFloors?.[bande.id] !== undefined) return s.priceFloors[bande.id];
  const auLock = modeDuTarif(s) === 'lock'
    ? (ctx.lockCount && ctx.lockCount > 0 && s.ratePerLock ? ctx.lockCount * s.ratePerLock : undefined)
    : (s.ratePerLock && ctx.lockCount && ctx.lockCount > 0
      ? Math.max(ctx.lockCount * s.ratePerLock, bande ? s.priceFloors?.[bande.id] ?? 0 : 0)
      : undefined);
  if (auLock !== undefined) return auLock;
  const grilleLongueur = !!s.prixParLongueur && Object.keys(s.prixParLongueur).length > 0;
  const coef = !grilleLongueur && suitLeModele(s, ctx) && bande ? bande.coef : 1;
  const prix = arrondi(deBase * coef);
  return prix || undefined;
}

/** Vrai quand le prix dépend du compte exact de locks, que le site ne
    connaît pas : on dit alors « à partir de ». */
export const seCompteAuLock = (s: PrestationTarifee): boolean =>
  !PRIX_FIXES.has(s.id) && (modeDuTarif(s) === 'lock' || !!s.paliersDeLocks?.length);
/* ⟨/prix-calibre⟩ */

/* OPALE (4 novembre 2026), recopiée de src/shared/opale-pur.ts entre ses
   repères : la consigne, les outils, le contexte, les juges, l'état du fil. */
/* ⟨opale⟩ */
/** Le nom qu'elle porte au Trône : la trace de ses messages (`parQui`), le
    bandeau des Conversations, le journal. Jamais dans un message. */
export const OPALE = 'Opale';
/** Le modèle (la consigne de l'API : le plus capable, par défaut). */
export const MODELE_D_OPALE = 'claude-opus-5-5';
/** Les prix du modèle, en dollars par million de jetons : entrée, sortie,
    cache lu, cache écrit (5 minutes, 1,25 fois l'entrée). */
export const TARIF_D_OPALE = { entree: 4, sortie: 20, cacheLu: 0.2, cacheEcrit: 5 } as const;
/** Six allers et retours d'outils au plus dans un tour, puis la main passe. */
export const TOURS_D_OUTILS_AU_PLUS = 6;
/** Le temps d'un tour, l'attente comprise : passé ce délai, son secours part. */
export const DUREE_D_UN_TOUR_D_OPALE_MS = 85_000;
/** Quarante messages d'Opale au plus par numéro et par 24 heures. */
export const MESSAGES_D_OPALE_PAR_JOUR = 40;
/** Son message : 700 signes au plus, jamais vide. */
export const SIGNES_D_OPALE_AU_PLUS = 700;
/** Le fil qu'elle lit : les 48 dernières heures, trente messages au plus. */
export const FIL_D_OPALE_MS = 48 * 3_600_000;
export const MESSAGES_DU_FIL_D_OPALE = 30;
/** Une proposition tenue deux heures au plus : passé ce délai, `confirmer`
    la refuse, et il faut reproposer une place. */
export const PROPOSITION_TENUE_MS = 2 * 3_600_000;
/** Six places dites au plus, comme sur le site. */
export const PLACES_D_OPALE = 6;
/** L'adresse de la Maison, quand la branche n'en dit pas (reception-wa-pur). */
export const ADRESSE_D_OPALE = 'Ilot 130-F, Maison 88, Portail Marron, quartier Suru-Léré, Cotonou';
/** Le lieu déjà dit dans ce fil : l'adresse, ou le lien du plan. */
export const LIEU_DEJA_DIT = /ilot 130-f|maisonmnd\.com\/venir/i;

/* ── LE RÉGLAGE ─────────────────────────────────────────────────────────
   Système › Paramètres › « Qui répond sur WhatsApp » : Opale, ou l'ancien
   automate (gardé en réserve). Document `mnd_opale`. Absent ou illisible :
   l'automate, comme avant ; le réglage du 4 novembre 2026 le pose à Opale. */
export const CLE_D_OPALE = 'mnd_opale';
export type QuiRepondWa = 'opale' | 'automate';
export type ReglageDOpale = { qui: QuiRepondWa };
export const REGLAGE_D_OPALE_LIVRE: ReglageDOpale = { qui: 'automate' };
export function reglageDOpale(brut: unknown): ReglageDOpale {
  const q = (brut as { qui?: unknown } | null | undefined)?.qui;
  return { qui: q === 'opale' ? 'opale' : 'automate' };
}

/** QUI ELLE SERT : toutes les clientes ; l'équipe, seulement les numéros
    d'essai de l'automate (pour que la direction l'essaie depuis son
    téléphone) ; jamais un prestataire ni un fournisseur. */
export function opaleSert(o: { tiroir: string; numero: string; numerosEssai: readonly string[]; cle: (n: string) => string }): boolean {
  if (o.tiroir === 'clientes') return true;
  if (o.tiroir !== 'equipe') return false;
  const k = o.cle(o.numero);
  return o.numerosEssai.some((n) => o.cle(n) === k);
}

/* ── POURQUOI LA MAIN PASSE ────────────────────────────────────────────
   Les motifs de l'automate (le Trône les dit déjà), ceux qu'Opale emploie. */
export const MOTIFS_D_OPALE = ['annulation', 'sante', 'media', 'question', 'demande', 'autre-personne'] as const;
export type MotifDOpale = typeof MOTIFS_D_OPALE[number];
const MOTIF_D_OPALE_DIT: Record<MotifDOpale, string> = {
  annulation: 'elle annule son rendez-vous',
  sante: 'son cuir chevelu, une gêne, une douleur, une chute : une personne doit regarder',
  media: 'une photo ou un vocal que tu ne peux pas lire',
  question: 'une plainte, un remboursement, un règlement, une question d’argent, ou ce que tu ne sais pas',
  demande: 'elle demande à parler à une personne',
  'autre-personne': 'une demande qui ne concerne pas la Maison (un démarchage, une sortie, une adresse ailleurs)',
};
export const motifDOpale = (m: unknown): MotifDOpale | null =>
  (MOTIFS_D_OPALE as readonly string[]).includes(String(m)) ? (m as MotifDOpale) : null;
/** Le motif tel que le fil le garde (le Trône le dit sous la conversation). */
export const motifDuFilDOpale = (m: MotifDOpale): MotifDeLaMain => m;

/* ── CE QUI PART SEUL ───────────────────────────────────────────────────
   Les messages que la Maison envoie d'elle-même, par ses modèles Meta. Opale
   les connaît : elle ne les double pas, ne les promet pas autrement, et
   sait qu'un rendez-vous qu'elle confirme dans la conversation n'en reçoit
   pas d'autre confirmation. La porte des modèles (même chantier) veille à
   ce qu'aucun ne parte deux fois. */
export const CE_QUI_PART_SEUL: readonly string[] = [
  'La confirmation d’un rendez-vous posé ailleurs que dans cette conversation (le site, Ma Couronne, le comptoir). Celui que tu poses ici, tu le confirmes toi-même : aucun autre message de confirmation ne suit.',
  'Le rappel de la veille, en fin d’après-midi, pour chaque rendez-vous confirmé.',
  'Trois jours avant un rendez-vous, une question pour le garder (« Oui, je viens » ou « Changer l’heure »).',
  'Après la visite : le reçu quand elle règle, puis un mot pour son avis, et des nouvelles une semaine plus tard.',
  'Le jour de son anniversaire, un mot de la Maison.',
];

/* ── LA CONSIGNE ────────────────────────────────────────────────────────
   Les règles validées par Yéman pour la réception (27 octobre au 2 novembre
   2026 : la voix, les prix, la consultation d'abord, les calibres, la
   civilité, l'adresse une fois), plus ce qui fait d'Opale une seule
   conversation menée de bout en bout. */
export function consigneDOpale(): string {
  return [
    'Tu réponds, au nom de la Maison MND, maison de soin et de création de locks à Cotonou, aux messages WhatsApp que ses clientes envoient à son numéro, à toute heure. Ton message part tel quel, sans relecture : chaque mot compte.',
    '',
    'LA VOIX DE LA MAISON',
    'Celle d’une maison d’exception : élégante, posée, attentionnée. Jamais familière, jamais commerciale, jamais pressante. Des phrases complètes et soignées, courtes : une à quatre phrases.',
    'Le vouvoiement, toujours. On dit « la Maison », JAMAIS « salon ». Quand tu nommes le lieu, écris « la Maison MND » en entier : « Nous vous attendons à la Maison MND ». La Maison parle de « votre couronne », de « vos locks », d’un « rituel ».',
    'Pas d’émoji, pas de tiret long, pas de liste à puces, pas de titre, pas de point d’exclamation répété. Ni « coucou », ni « ok », ni abréviation.',
    'Pas de formule d’assistant : ni « je suis l’assistant », ni « n’hésitez pas », ni « merci pour votre message » à chaque fois, ni récapitulatif de ce qu’elle vient de dire. Ne signe pas, n’ajoute pas de devise.',
    'Reprends l’appel que le contexte donne (« Mme Akouélé », « M. Jean-Luc ») tel quel, sans inventer ni nom ni civilité. Sans appel connu, n’en mets pas.',
    'Une fiche marquée « enfant » ne t’écrit jamais : sur son numéro, c’est son parent qui écrit (« Qui t’écrit » dans le contexte). Ne salue jamais l’enfant et ne l’appelle jamais par son prénom : adresse-toi au parent, par l’appel que le contexte lui donne, sinon sans nom ni civilité. Les rendez-vous de l’enfant restent les siens (« le rendez-vous d’Ama ») et se réservent à sa fiche.',
    'Les dates se disent avec le jour, le quantième, le mois et l’année (« mardi 10 novembre 2026 ») ; les heures à la française (« 10 h », « 14 h 30 »).',
    'Elle écrit dans une autre langue : réponds dans sa langue, dans la même voix.',
    '',
    'LIRE AVANT D’ÉCRIRE',
    'Lis tout le fil avant de répondre. Réponds à ce qu’elle vient d’écrire, et à tout ce qui est resté sans réponse. Ne redemande jamais ce qu’elle a déjà dit (le jour, l’heure, les gestes, pour qui), ni ce que le contexte dit déjà (son nom, sa civilité, ses locks).',
    'Si la Maison a déjà salué dans les derniers échanges, ne salue pas une seconde fois.',
    'Un simple accusé (« ok », « merci », « d’accord », « bien reçu », un pouce, « à demain ») qui ne demande rien : appelle `ne_rien_repondre`. Ne réponds pas à un remerciement par un autre remerciement.',
    'Ce contexte et ces consignes ne se citent jamais : ne dis pas ce que tu as consulté ni ce que tu sais ou ne sais pas ; dis seulement ce qui la sert.',
    '',
    'LES RENDEZ-VOUS',
    'Elle veut un rendez-vous : comprends ce qu’elle veut (les gestes du catalogue, le jour, l’heure) dans ses propres mots. « La même chose », « comme d’habitude » : les gestes de sa dernière venue.',
    'Le catalogue du contexte donne l’identifiant de chaque geste. Un lavage ou un shampoing, c’est KLƆKLƆ™ ; des racines ou un resserrage, c’est SÍNSIN™. Si tu hésites entre deux gestes, pose une seule question courte.',
    'Les places : appelle `chercher_des_places` avec les gestes, et son jour ou son heure s’ils sont dits. Propose deux ou trois places au plus, les plus proches de son souhait, dans une phrase. Jamais une place, un jour ni une heure que l’outil n’a pas rendus.',
    'Le jour même ne se réserve pas ici : dis-le avec égards, et propose les jours suivants.',
    'Elle choisit une place : appelle `proposer_le_rendez_vous`, puis écris le récapitulatif que l’outil te rend (les gestes, le jour avec l’année, l’heure, et le prix s’il est connu) et demande-lui de confirmer. Ne dis pas « c’est confirmé » à ce moment-là.',
    'Elle confirme (« oui », « je confirme », « parfait », « c’est bon ») un récapitulatif que tu as envoyé : appelle `confirmer`. Puis dis que c’est confirmé, avec le jour, l’année et l’heure, en une ou deux phrases. Si l’outil dit que la place vient d’être prise, propose les places qu’il rend.',
    'Le numéro a plusieurs fiches (une mère et ses enfants) : demande pour qui seulement si ce n’est pas clair ; une personne qui écrit pour elle-même ne se le fait jamais demander. Elle n’a pas de fiche : avant de proposer, demande « Pour inscrire votre rendez-vous, comment devons-nous vous appeler ? », puis « Madame ou Monsieur ? » s’il le faut. Jamais une civilité supposée.',
    'Elle veut changer l’heure ou le jour d’un rendez-vous qu’elle a : `chercher_des_places` pour les mêmes gestes, puis `proposer_le_deplacement`, puis `confirmer` à son oui. La même personne de la Maison la reçoit. Une fois fait, dis seulement que son rendez-vous est confirmé pour le nouveau jour et la nouvelle heure (« Votre rendez-vous est confirmé pour le vendredi 6 novembre 2026 à 10 h. ») : ne dis jamais qu’il a été déplacé.',
    'Elle annule : remercie-la de prévenir, dis que la Maison s’en occupe, et appelle `passer_la_main` (motif « annulation »). Tu n’annules rien toi-même.',
    'Elle demande si un rendez-vous tient (« c’est confirmé pour 15 h ? ») : réponds d’après ses rendez-vous du contexte, avec le jour, l’année et l’heure. S’il n’y figure pas, dis-le simplement et propose de le poser.',
    'Elle est en route, en retard, ou arrive : un mot bref (« Bien noté, nous vous attendons. »).',
    '',
    'LES PRIX, COMME SUR MAISONMND.COM',
    'Une création de locks ou une réparation commence TOUJOURS par une consultation : n’en donne aucun prix, ni « à partir de », ni estimation ; la Maison remet son devis écrit après la consultation. Propose de réserver la consultation.',
    'Les extensions de locks se décident à la consultation (la teinte, le calibre, le nombre) : aucun prix.',
    'Les soins, entretiens, reprises, coiffures : le prix du catalogue, ou celui que l’outil `prix` rend pour elle. Un prix qui dépend de ses locks : il te faut son nombre de locks (approximatif) ; s’il n’est ni dans le contexte ni dans le fil, demande-le avec délicatesse, sans citer de montant. Un prix qui dépend de la longueur : demande sa longueur (court, mi-long, long).',
    'Aucun autre montant ni estimation que le contexte ou un outil ne donne pas. Ne parle d’aucune remise, d’aucun code ni d’aucune offre : la Maison MND les applique elle-même, quand ils valent pour elle.',
    'Les liens de la Maison (catalogue en ligne, consultation de création, consultation de réparation) sont dans le contexte : donne-les quand ils la servent.',
    '',
    'LE LIEU',
    'L’adresse se donne une fois, à qui n’est jamais venue, en une phrase. Elle demande l’adresse, le chemin ou la localisation : donne l’adresse et appelle `envoyer_le_plan` (le plan et la Maison sur Google Maps partent juste après ton message). Ne dis jamais que tu ne peux pas envoyer la localisation. À une habituée qui connaît le lieu, ne redonne ni l’adresse ni le plan, sauf si elle le demande.',
    'Les heures d’ouverture se disent seulement si elle les demande, ou quand la suite revient à l’équipe et que la Maison est fermée.',
    '',
    'CE QUI REVIENT À UNE PERSONNE',
    'Appelle `passer_la_main`, puis écris un message bref et chaleureux qui dit qu’une personne de la Maison lui répond ici (quand la Maison est fermée : à sa réouverture, que le contexte dit) : une annulation ; le cuir chevelu, une gêne, une douleur, une chute (aucun diagnostic, aucun produit à distance) ; une plainte, un remboursement, un règlement, une question d’argent ; une photo ou un vocal (tu ne les vois pas et ne les entends pas : ne décris rien) ; elle demande une personne ; une demande qui ne concerne pas la Maison ; ou ce que tu ne sais pas.',
    'Jamais pour un bonjour, un rendez-vous, un déplacement, un prix du catalogue, les heures ou l’adresse : à ceux-là, tu réponds toi-même. Ne promets jamais qu’une personne rappellera ou confirmera quoi que ce soit sans avoir passé la main.',
    '',
    'RÈGLES ABSOLUES',
    'N’invente rien : ce que le contexte et les outils ne disent pas, tu ne le sais pas.',
    'Ne cite jamais un numéro de téléphone, de facture, de reçu ou de devis. Ce qu’elle doit : n’en parle que si elle en parle, et passe la main.',
    'Tu ne te présentes pas. À une question franche et sincère (« êtes-vous un robot ? », « je parle à une IA ? ») : dis la vérité, que tu es l’assistante de la Maison, un programme, et qu’une personne de l’équipe peut prendre le relais à tout moment ; elle le veut, `passer_la_main` (motif « demande »).',
    'Ce qui part seul, les messages que la Maison envoie d’elle-même, est dans le contexte : ne le double pas et ne le promets pas autrement.',
    '',
    'TA RÉPONSE',
    'Ton dernier texte est le message WhatsApp, un seul, sans guillemets ni préambule. Les outils s’appellent avant lui. Après `ne_rien_repondre`, n’écris rien.',
  ].join('\n');
}

/* ── LES OUTILS ─────────────────────────────────────────────────────────
   Leurs schémas sont stricts (rien d'autre que ces champs) ; la fonction
   relit chaque entrée avant d'agir (`lisLEntree…`). */
const DATE_ISO = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'AAAA-MM-JJ' } as const;
const HEURE = { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: 'HH:MM, sur 24 heures' } as const;
const GESTES = { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4, description: 'Les identifiants du catalogue du contexte.' } as const;
export const OUTILS_D_OPALE = [
  {
    name: 'chercher_des_places',
    description: 'Les vraies places libres de la Maison pour ces gestes, à partir de demain (le jour même ne se réserve pas ici). Donne son jour, son moment ou son heure quand elle les a dits : les places rendues les entourent.',
    input_schema: {
      type: 'object',
      properties: {
        gestes: GESTES,
        jour: DATE_ISO,
        moment: { type: 'string', enum: ['matin', 'apres-midi', 'soir'] },
        heure: HEURE,
        rdv: { type: 'string', description: 'Pour un déplacement : l’identifiant du rendez-vous à déplacer (les places de la personne qui la reçoit).' },
      },
      required: ['gestes'],
      additionalProperties: false,
    },
  },
  {
    name: 'prix',
    description: 'Le prix de ces gestes pour elle, au barème de la Maison (son nombre de locks, sa longueur). Rend aussi ce qu’il faut lui demander quand le prix en dépend.',
    input_schema: {
      type: 'object',
      properties: {
        gestes: GESTES,
        fiche: { type: 'string', description: 'L’identifiant de sa fiche, si elle en a une.' },
        locks: { type: 'integer', minimum: 1, maximum: 3000, description: 'Le nombre de locks qu’elle a dit, s’il n’est pas sur sa fiche.' },
        longueur: { type: 'string', enum: ['court', 'mi-long', 'long'] },
      },
      required: ['gestes'],
      additionalProperties: false,
    },
  },
  {
    name: 'proposer_le_rendez_vous',
    description: 'Tient une place choisie par elle et rend le récapitulatif à lui écrire. Rien n’est posé : il faudra son oui, puis `confirmer`.',
    input_schema: {
      type: 'object',
      properties: {
        pour: { type: 'string', description: 'L’identifiant de la fiche pour qui l’on réserve, ou « nouvelle » quand elle n’a pas de fiche.' },
        prenom: { type: 'string', description: 'Pour une nouvelle : le prénom qu’elle a donné.' },
        civilite: { type: 'string', enum: ['madame', 'mademoiselle', 'monsieur'], description: 'Pour une nouvelle : la civilité qu’elle a dite.' },
        gestes: GESTES,
        date: DATE_ISO,
        heure: HEURE,
      },
      required: ['pour', 'gestes', 'date', 'heure'],
      additionalProperties: false,
    },
  },
  {
    name: 'proposer_le_deplacement',
    description: 'Tient la nouvelle place d’un rendez-vous qu’elle a déjà, avec la même personne de la Maison, pour les mêmes gestes, et rend le récapitulatif. Rien ne bouge avant son oui et `confirmer`.',
    input_schema: {
      type: 'object',
      properties: { rdv: { type: 'string' }, date: DATE_ISO, heure: HEURE },
      required: ['rdv', 'date', 'heure'],
      additionalProperties: false,
    },
  },
  {
    name: 'confirmer',
    description: 'Elle a dit oui au récapitulatif que tu lui as envoyé : pose le rendez-vous proposé, ou déplace celui qui l’était. Seulement après son oui, jamais dans le tour où tu proposes.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'envoyer_le_plan',
    description: 'Le plan pour venir à la Maison et son lien Google Maps partent juste après ton message.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'passer_la_main',
    description: 'Une personne de la Maison reprend la conversation, et tu te tais jusqu’à ce qu’on te la rende. L’équipe est prévenue.',
    input_schema: {
      type: 'object',
      properties: {
        motif: { type: 'string', enum: [...MOTIFS_D_OPALE] },
        pourquoi: { type: 'string', maxLength: 100, description: 'Pour l’équipe, en quelques mots, sans nom ni numéro.' },
      },
      required: ['motif', 'pourquoi'],
      additionalProperties: false,
    },
  },
  {
    name: 'ne_rien_repondre',
    description: 'Son message n’appelle pas de réponse (un accusé, un merci sans question). Aucun message ne part.',
    input_schema: {
      type: 'object',
      properties: { pourquoi: { type: 'string', maxLength: 100 } },
      required: ['pourquoi'],
      additionalProperties: false,
    },
  },
] as const;
export type NomDOutil = typeof OUTILS_D_OPALE[number]['name'];
export const NOMS_D_OUTILS = OUTILS_D_OPALE.map((o) => o.name) as readonly NomDOutil[];
export const estUnOutilDOpale = (n: unknown): n is NomDOutil => (NOMS_D_OUTILS as readonly string[]).includes(String(n));

/* ── LES ENTRÉES DES OUTILS, RELUES ─────────────────────────────────────
   Le schéma strict de l'API les garantit ; la fonction les relit quand même,
   et un identifiant inconnu ne fait rien. */
const estIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T12:00:00Z`));
const estHeure = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Les gestes qu'elle peut réserver ici : connus du catalogue, sans doublon. */
export function gestesLus(brut: unknown, connus: ReadonlySet<string>): { ids: string[]; inconnus: string[] } {
  const liste = Array.isArray(brut) ? brut.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  const ids: string[] = [];
  const inconnus: string[] = [];
  for (const id of liste) {
    if (ids.includes(id) || inconnus.includes(id)) continue;
    (connus.has(id) ? ids : inconnus).push(id);
  }
  return { ids: ids.slice(0, 4), inconnus };
}

export type EntreeDesPlaces = { gestes: unknown; jour?: unknown; moment?: unknown; heure?: unknown; rdv?: unknown };
export type SouhaitDePlace = { jour?: string; moment?: 'matin' | 'apres-midi' | 'soir'; heure?: string };
export function souhaitLu(e: EntreeDesPlaces): SouhaitDePlace {
  return {
    ...(estIso(e.jour) ? { jour: e.jour } : {}),
    ...(e.moment === 'matin' || e.moment === 'apres-midi' || e.moment === 'soir' ? { moment: e.moment } : {}),
    ...(estHeure(e.heure) ? { heure: e.heure } : {}),
  };
}

const minutesDe = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/** LES PLACES DITES : celles de son jour d'abord (sinon les jours qui le
    suivent), dans son moment, les plus proches de son heure ; deux par jour
    au plus quand elle n'a rien dit, pour lui laisser le choix des jours. */
export function placesDites<P extends { iso: string; heure: string }>(places: readonly P[], s: SouhaitDePlace, au = PLACES_D_OPALE): P[] {
  const dansLeMoment = (p: P): boolean => {
    const m = minutesDe(p.heure);
    if (s.moment === 'matin') return m < 12 * 60;
    if (s.moment === 'apres-midi') return m >= 12 * 60 && m < 17 * 60;
    if (s.moment === 'soir') return m >= 17 * 60;
    return true;
  };
  let choix = places.filter(dansLeMoment);
  if (choix.length === 0) choix = [...places];
  if (s.jour) {
    const ce = choix.filter((p) => p.iso === s.jour);
    choix = ce.length > 0 ? ce : choix.filter((p) => p.iso > s.jour!);
    if (choix.length === 0) choix = places.filter((p) => p.iso >= s.jour!);
  }
  if (s.heure) {
    const cible = minutesDe(s.heure);
    const parJour = new Map<string, P[]>();
    for (const p of choix) parJour.set(p.iso, [...(parJour.get(p.iso) ?? []), p]);
    const jours = [...parJour.keys()].sort();
    const rangees: P[] = [];
    for (const j of jours) {
      rangees.push(...[...parJour.get(j)!].sort((a, b) => Math.abs(minutesDe(a.heure) - cible) - Math.abs(minutesDe(b.heure) - cible)).slice(0, 3));
    }
    return rangees.slice(0, au);
  }
  if (!s.jour) {
    const vus = new Map<string, number>();
    const etales: P[] = [];
    for (const p of choix) {
      const n = vus.get(p.iso) ?? 0;
      if (n >= 2) continue;
      vus.set(p.iso, n + 1);
      etales.push(p);
    }
    return etales.slice(0, au);
  }
  return choix.slice(0, au);
}

/** « mardi 10 novembre 2026 à 10 h » : la place telle qu'Opale la dit. */
export const placeDite = (p: { iso: string; heure: string }): string => `${jourDitAvecAnnee(p.iso)} à ${heureDite(p.heure)}`;

export type EntreeDeLaProposition = { pour?: unknown; prenom?: unknown; civilite?: unknown; gestes?: unknown; date?: unknown; heure?: unknown };
export type PropositionLue =
  | { ok: true; pour: string | 'nouvelle'; prenom?: string; civilite?: CiviliteDuFil; gestes: string[]; date: string; heure: string }
  | { ok: false; pourquoi: string };
/** La proposition relue : la fiche parmi celles du numéro, ou une nouvelle
    qui a dit son prénom et sa civilité ; des gestes connus ; une date après
    aujourd'hui ; une heure. */
export function propositionLue(e: EntreeDeLaProposition, o: { fiches: readonly string[]; connus: ReadonlySet<string>; aujourdhui: string }): PropositionLue {
  const pour = String(e.pour ?? '').trim();
  const nouvelle = pour === 'nouvelle';
  if (!nouvelle && !o.fiches.includes(pour)) return { ok: false, pourquoi: 'Cette fiche n’est pas l’une des fiches de ce numéro (contexte). Pour une personne sans fiche, « nouvelle ».' };
  const prenom = typeof e.prenom === 'string' ? e.prenom.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
  const civilite = e.civilite === 'madame' || e.civilite === 'mademoiselle' || e.civilite === 'monsieur' ? e.civilite : undefined;
  if (nouvelle && (!prenom || !civilite)) return { ok: false, pourquoi: 'Pour une nouvelle, il faut le prénom qu’elle a donné et sa civilité : demande-les-lui d’abord.' };
  const g = gestesLus(e.gestes, o.connus);
  if (g.ids.length === 0) return { ok: false, pourquoi: 'Aucun de ces gestes n’est réservable ici : reprends les identifiants du catalogue.' };
  if (!estIso(e.date) || !estHeure(e.heure)) return { ok: false, pourquoi: 'La date (AAAA-MM-JJ) ou l’heure (HH:MM) est illisible.' };
  if (e.date <= o.aujourdhui) return { ok: false, pourquoi: 'Le jour même ne se réserve pas ici : propose les jours suivants.' };
  return { ok: true, pour: nouvelle ? 'nouvelle' : pour, ...(nouvelle ? { prenom, civilite } : {}), gestes: g.ids, date: e.date, heure: e.heure };
}

/* ── CE QUI ATTEND SON OUI ──────────────────────────────────────────────
   Gardé dans le fil (`EtatDuFil.opale`) : `confirmer` ne pose que cela, et
   seulement si la proposition est partie AVANT les messages du tour (elle y
   répond) et qu'elle n'a pas plus de deux heures. */
export type EnAttenteDOpale =
  | { genre: 'pose'; pour: string; prenom?: string; civilite?: CiviliteDuFil; gestes: string[]; date: string; heure: string; dureeMin: number; proposeLe: string }
  | { genre: 'deplacement'; rdvId: string; updatedAt: string; maitre: string; clientId: string; gestes: string[]; dureeMin: number; avant: { date: string; time: string }; date: string; heure: string; proposeLe: string };

export type EtatDOpale = { enAttente?: EnAttenteDOpale; dernierTourLe?: string };

/** `confirmer` est-il permis ? Une proposition tenue, partie avant le
    premier message du tour, de moins de deux heures. */
export function confirmationPermise(e: EnAttenteDOpale | undefined, premierMessageDuTour: string, maintenantMs: number): { ok: true } | { ok: false; pourquoi: string } {
  if (!e) return { ok: false, pourquoi: 'Aucune proposition n’attend son oui : propose d’abord une place (proposer_le_rendez_vous ou proposer_le_deplacement).' };
  const le = Date.parse(e.proposeLe);
  if (!Number.isFinite(le) || maintenantMs - le > PROPOSITION_TENUE_MS) return { ok: false, pourquoi: 'La proposition a plus de deux heures : cherche à nouveau les places et propose-les.' };
  const premier = Date.parse(premierMessageDuTour);
  if (Number.isFinite(premier) && premier < le) return { ok: false, pourquoi: 'Elle n’a pas encore lu ce récapitulatif : envoie-le d’abord et attends son oui.' };
  return { ok: true };
}

/* ── LE CONTEXTE ────────────────────────────────────────────────────────
   Tout ce qu'elle sait, en mots : jamais un numéro de téléphone. */
export type MessageDuFilDOpale = {
  sens: 'entrant' | 'sortant'; texte: string; quand: string;
  /** Pour un message de la Maison : qui l'a écrit, tel que le Trône le note. */
  qui?: 'opale' | 'equipe' | 'automatique' | 'automate';
  type?: string;
};
export type RdvDOpale = { id: string; date: string; time?: string; gestes: string[]; statut: string; pour: string };
export type FicheDOpale = {
  id: string;
  /** L'appel, déjà écrit par la civilité (« Mme Akouélé ») ; vide si inconnue. */
  appel: string;
  prenom: string;
  civiliteConnue: boolean;
  parPhone: boolean;
  parFamille?: boolean;
  mineure?: boolean;
  /** Elle porte ce numéro sans y parler (4 novembre 2026) : une enfant, ou
      une fiche qui le nomme « Maman », « Papa ». Ce n'est jamais elle qui écrit. */
  numeroDuParent?: boolean;
  locks?: number;
  longueur?: string;
  derniereVenue?: { date: string; gestes: string[] };
};
export type ContexteDOpale = {
  maintenantMs: number;
  aujourdhui: string;
  heureDuJour: string;
  /** `null` : la Maison est ouverte ; sinon « demain dès 9 h ». */
  reouverture: string | null;
  heures: readonly string[];
  fiches: readonly FicheDOpale[];
  /** QUI ÉCRIT SUR UN NUMÉRO D'ENFANT (4 novembre 2026) : le parent qui règle
      leur compte famille (sa fiche, son appel), sinon un parent sans fiche,
      que la fiche des enfants nomme peut-être (« Maman d'A. »). */
  parent?: { ficheId?: string; appel?: string; prenom?: string; nom?: string };
  nomProfil?: string;
  rdvs: readonly RdvDOpale[];
  connaitLeLieu: boolean;
  adresse: string;
  liens: { catalogue: string; creation: string; reparation: string };
  paiements: readonly string[];
  offres: readonly string[];
  catalogue: readonly string[];
  enAttente?: EnAttenteDOpale;
  /** Le dernier mot de Perle (« garder », « avant »…) et le rendez-vous qu'il visait. */
  perle?: string;
  fil: readonly MessageDuFilDOpale[];
  /** Les messages du tour, ceux auxquels elle répond maintenant. */
  nouveaux: readonly MessageDuFilDOpale[];
  /** Les noms des gestes, pour dire les rendez-vous en mots. */
  nomDe: (id: string) => string;
};

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
/** « mar. 4 nov. 14 h 05 » à Cotonou (UTC+1), pour le fil. */
export function quandDitDOpale(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + 3_600_000);
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][d.getUTCMonth()];
  return `${JOURS_COURTS[d.getUTCDay()]} ${d.getUTCDate()} ${mois} ${heureDite(`${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`)}`;
}

const quiDit = (m: MessageDuFilDOpale): string => {
  if (m.sens === 'entrant') return 'Elle';
  if (m.qui === 'opale') return 'Toi (Opale)';
  if (m.qui === 'equipe') return 'La Maison (une personne de l’équipe)';
  if (m.qui === 'automate') return 'La Maison (l’ancien automate)';
  return 'La Maison (message automatique)';
};
const ligneDuFil = (m: MessageDuFilDOpale): string => {
  const t = String(m.texte ?? '').replace(/\s+/g, ' ').trim().slice(0, 600) || (m.type === 'audio' ? '[un message vocal]' : m.type === 'image' ? '[une photo]' : '[un message sans texte]');
  return `[${quandDitDOpale(m.quand)}] ${quiDit(m)} : ${t}`;
};

const rdvDit = (r: RdvDOpale, nomDe: (id: string) => string): string =>
  `[${r.id}] ${jourDitAvecAnnee(r.date)}${r.time ? ` à ${heureDite(r.time)}` : ''}, ${r.gestes.map(nomDe).join(' et ') || 'gestes non dits'} (${r.statut})`;

export function contexteDOpale(c: ContexteDOpale): string {
  const l: string[] = [];
  l.push(`Aujourd’hui : ${jourDitAvecAnnee(c.aujourdhui)}, ${c.heureDuJour} à Cotonou. ${c.reouverture ? `La Maison est fermée en ce moment ; une personne de l’équipe répond ${c.reouverture}.` : 'La Maison est ouverte en ce moment.'}`);
  if (c.heures.length > 0) l.push(`Les heures de la Maison : ${c.heures.join(' ; ')}.`);
  l.push('');
  l.push('QUI ÉCRIT');
  if (c.fiches.length === 0) {
    l.push(`Aucune fiche à ce numéro : une nouvelle cliente, ou une personne que la Maison ne connaît pas encore.${c.nomProfil ? ` Son nom sur WhatsApp : « ${c.nomProfil.slice(0, 40)} » (ce n’est ni un appel ni une civilité).` : ''}`);
  }
  for (const f of c.fiches) {
    const traits = [
      f.appel ? `on l’appelle « ${f.appel} »` : `son prénom : ${f.prenom || 'inconnu'}, civilité inconnue`,
      f.numeroDuParent ? 'ce numéro est celui de son parent : ce n’est jamais elle qui écrit' : f.parPhone ? 'ce numéro est le sien' : f.parFamille ? 'rattachée à ce numéro par sa famille' : 'ce numéro est l’un des siens',
      ...(f.mineure || f.numeroDuParent ? ['enfant'] : []),
      ...(f.locks ? [`environ ${f.locks} locks`] : []),
      ...(f.longueur ? [`longueur ${f.longueur}`] : []),
      ...(f.derniereVenue ? [`dernière venue : ${jourDitAvecAnnee(f.derniereVenue.date)} (${f.derniereVenue.gestes.map(c.nomDe).join(' et ')})`] : ['jamais venue']),
    ];
    l.push(`- fiche [${f.id}] : ${traits.join(' ; ')}.`);
  }
  if (c.parent) {
    const p = c.parent;
    const qui = p.appel ? `on l’appelle « ${p.appel} »` : p.prenom ? `son prénom : ${p.prenom}, civilité inconnue`
      : p.nom ? `la fiche des enfants le nomme « ${p.nom} » (ce n’est ni un appel ni une civilité)` : 'ni son nom ni sa civilité ne sont connus';
    l.push(`Qui t’écrit : le parent des enfants, ${p.ficheId ? `fiche [${p.ficheId}]` : 'sans fiche à ce numéro'} ; ${qui}. Ce ne sont jamais les enfants qui écrivent.`);
  }
  if (c.rdvs.length > 0) {
    l.push('Ses rendez-vous à venir :');
    for (const r of c.rdvs) l.push(`- ${rdvDit(r, c.nomDe)}, pour la fiche [${r.pour}]`);
  } else l.push('Aucun rendez-vous à venir.');
  l.push(c.connaitLeLieu ? 'Le lieu : elle connaît déjà la Maison ; ne redonne ni l’adresse ni le plan, sauf si elle les demande.' : `Le lieu : elle n’est jamais venue. L’adresse : ${c.adresse}.`);
  l.push('');
  l.push(`Les liens de la Maison : le catalogue en ligne ${c.liens.catalogue} ; la consultation de création ${c.liens.creation} ; la consultation de réparation ${c.liens.reparation}.`);
  if (c.paiements.length > 0) l.push(`Les moyens de paiement : ${c.paiements.join(', ')}.`);
  if (c.offres.length > 0) l.push(`L’offre du moment : ${c.offres.join(' ')}`);
  l.push('');
  l.push('CE QUI PART SEUL (ne le double pas, ne le promets pas autrement)');
  for (const x of CE_QUI_PART_SEUL) l.push(`- ${x}`);
  if (c.perle) { l.push(''); l.push(`Le dernier message automatique de la Maison à ce numéro : ${c.perle}`); }
  if (c.enAttente) {
    l.push('');
    const e = c.enAttente;
    l.push(e.genre === 'pose'
      ? `EN ATTENTE DE SON OUI : le rendez-vous proposé ${quandDitDOpale(e.proposeLe)}, ${e.gestes.map(c.nomDe).join(' et ')}, ${placeDite({ iso: e.date, heure: e.heure })}. Elle dit oui : appelle « confirmer ».`
      : `EN ATTENTE DE SON OUI : le déplacement proposé ${quandDitDOpale(e.proposeLe)}, de ${placeDite({ iso: e.avant.date, heure: e.avant.time })} à ${placeDite({ iso: e.date, heure: e.heure })}. Elle dit oui : appelle « confirmer ».`);
  }
  l.push('');
  l.push('LE CATALOGUE (identifiant · geste · durée · prix)');
  for (const x of c.catalogue) l.push(x);
  l.push('');
  l.push('LE FIL (les 48 dernières heures, du plus ancien au plus récent)');
  const vus = new Set(c.nouveaux.map((m) => `${m.quand}|${m.texte}`));
  for (const m of c.fil) if (!vus.has(`${m.quand}|${m.texte}`)) l.push(ligneDuFil(m));
  l.push('');
  l.push('SES NOUVEAUX MESSAGES, AUXQUELS TU RÉPONDS MAINTENANT');
  for (const m of c.nouveaux) l.push(ligneDuFil(m));
  return l.join('\n');
}

/* ── LES JUGES DU TEXTE ─────────────────────────────────────────────────
   Ceux de la Maison (le mot banni, le tiret cadratin), plus les siens : un
   montant que ni le catalogue ni un outil n'a dit, un émoji, une formule
   d'assistant, un message vide ou trop long. Une liste vide = il part. */
const EMOJI = /\p{Extended_Pictographic}/u;
const FORMULES_D_ASSISTANT = /(je suis l[’']assistant|en tant qu[’']assistant|n[’']h[ée]sitez pas|intelligence artificielle|\bchatbot\b)/i;
export function montantsDuTexte(t: string): number[] {
  const s = String(t ?? '');
  const r: number[] = [];
  for (const m of s.matchAll(/(\d{1,3}(?:[\s  .]\d{3})+|\d+)\s?(?:fcfa|cfa|xof|francs?|f)(?![\p{L}])/giu)) {
    const n = Number(m[1].replace(/[\s  .]/g, ''));
    if (Number.isFinite(n)) r.push(n);
  }
  return r;
}
/** LE SALUT D'UN ENFANT (4 novembre 2026) : « Bonjour Ama », « Merci, Mlle Ama »
    sur le numéro de son parent. C'est le parent qui écrit. */
export const salueLEnfant = (texte: string, prenom: string): boolean => {
  const p = String(prenom ?? '').trim();
  if (p.length < 2) return false;
  const nom = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}])(?:bonjour|bonsoir|bienvenue|merci|avec plaisir|ch[èe]re?|salut)\\s*,?\\s+(?:(?:mme|mlle|m\\.|madame|mademoiselle|monsieur)\\s+)?${nom}(?![\\p{L}])`, 'iu').test(String(texte ?? ''));
};

export function fautesDOpale(texte: string, o: { montantsPermis: ReadonlySet<number>; questionFranche: boolean; enfants?: readonly string[] }): string[] {
  const t = String(texte ?? '').trim();
  const fautes: string[] = [];
  if (!t) fautes.push('un message vide');
  if (t.length > SIGNES_D_OPALE_AU_PLUS) fautes.push(`un message de ${t.length} signes (${SIGNES_D_OPALE_AU_PLUS} au plus)`);
  fautes.push(...texteSain(t, true));
  if (EMOJI.test(t)) fautes.push('un émoji');
  if (!o.questionFranche && FORMULES_D_ASSISTANT.test(t)) fautes.push('une formule d’assistant');
  for (const p of o.enfants ?? []) if (salueLEnfant(t, p)) fautes.push(`le prénom de l’enfant (« ${p} ») dans le salut : c’est son parent qui écrit, adresse-toi au parent`);
  for (const n of montantsDuTexte(t)) if (!o.montantsPermis.has(n)) fautes.push(`un montant que ni le catalogue ni un outil n’a dit (${n} F)`);
  if (/\+?\d[\d\s]{7,}\d/.test(t.replace(/\d{1,3}(?:[\s  .]\d{3})+\s?(?:fcfa|cfa|xof|francs?|f)(?![\p{L}])/giu, ''))) fautes.push('un numéro');
  return fautes;
}

/** UNE QUESTION FRANCHE : « êtes-vous un robot ? », « c'est une IA ? ». */
export const estUneQuestionFrancheDOpale = (t: string): boolean =>
  /\b(robot|bot|ia|intelligence artificielle|programme|machine|automatique|humain|une vraie personne)\b/i.test(String(t ?? ''))
  && /\?|\b(es[- ]tu|êtes[- ]vous|etes[- ]vous|c[’']est)\b/i.test(String(t ?? ''));

/* ── L'ÉTAT DU FIL APRÈS SON TOUR ───────────────────────────────────────
   Le fil garde la forme de l'automate (`EtatDuFil`), pour que le Trône
   (le bandeau, l'alarme, « gérée par ») la lise sans rien changer :
   `besoin` = elle mène la conversation ; `confirme` = un rendez-vous posé ;
   `main` = la main passée, son motif ; le reste se garde dans `opale`. */
export type IssueDuTourDOpale =
  | { genre: 'parle'; enAttente?: EnAttenteDOpale | null }
  | { genre: 'pose'; rdvId: string }
  | { genre: 'deplace'; rdvId: string }
  | { genre: 'main'; motif: MotifDeLaMain }
  | { genre: 'rien' };

export function etatApresOpale(
  avant: EtatDuFil, o: { issue: IssueDuTourDOpale; waIds: readonly string[]; dernierEntrantQuand?: string; envois: number; planEnvoye: boolean; maintenantMs: number },
): EtatDuFil & { opale: EtatDOpale } {
  const maintenant = new Date(o.maintenantMs).toISOString();
  const traites = [...(avant.traites ?? []), ...o.waIds.filter((w) => !(avant.traites ?? []).includes(w))].slice(-20);
  const envois = [...(avant.envois ?? []).filter((x) => o.maintenantMs - Date.parse(x) < 86_400_000), ...Array.from({ length: o.envois }, () => maintenant)];
  const ancienne = ((avant as EtatDuFil & { opale?: EtatDOpale }).opale ?? {}) as EtatDOpale;
  const garde = o.issue.genre === 'parle'
    ? (o.issue.enAttente === null ? undefined : o.issue.enAttente ?? ancienne.enAttente)
    : o.issue.genre === 'rien' || o.issue.genre === 'main' ? ancienne.enAttente : undefined;
  const opale: EtatDOpale = { ...(garde ? { enAttente: garde } : {}), dernierTourLe: maintenant };
  const base = {
    ...avant,
    traites,
    envois,
    majLe: maintenant,
    ...(o.dernierEntrantQuand ? { dernierEntrantQuand: o.dernierEntrantQuand } : {}),
    ...(avant.prisLe ? {} : { prisLe: maintenant }),
    ...(o.planEnvoye ? { planEnvoyeLe: maintenant } : {}),
    ecarts: 0,
    opale,
  };
  const passe = (etape: EtatDuFil['etape']) => (avant.etape === etape ? {} : { etape, depuis: maintenant, versionDeLEtape: avant.version });
  if (o.issue.genre === 'pose' || o.issue.genre === 'deplace') return { ...base, ...passe('confirme'), rdvId: o.issue.rdvId };
  if (o.issue.genre === 'main') {
    return {
      ...base, ...passe('main'), mainPasseeLe: maintenant, motifMain: o.issue.motif,
      etapeAvantLaMain: 'besoin', versionAvantLaMain: avant.version, mainDeLaReception: true,
    };
  }
  return { ...base, ...passe('besoin') };
}

/** LES HEURES DE LA SEMAINE, en mots : « mardi de 8 h à 20 h 30 »,
    « lundi fermé ». `open`/`close` s'écrivent « 08h00 » au Trône. */
const JOURS_DE_LA_SEMAINE: Record<string, string> = { lun: 'lundi', mar: 'mardi', mer: 'mercredi', jeu: 'jeudi', ven: 'vendredi', sam: 'samedi', dim: 'dimanche' };
const heureDuTrone = (s: unknown): string => {
  const m = /^(\d{1,2})\s*h\s*(\d{2})?$/i.exec(String(s ?? '').trim()) ?? /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  return m ? heureDite(`${m[1].padStart(2, '0')}:${m[2] ?? '00'}`) : '';
};
export function heuresDites(semaine: readonly { key: string; open: string; close: string; closed: boolean }[]): string[] {
  const ordre = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  return ordre.map((k) => semaine.find((h) => h.key === k)).filter((h): h is NonNullable<typeof h> => !!h).map((h) => {
    const nom = JOURS_DE_LA_SEMAINE[h.key] ?? h.key;
    const de = heureDuTrone(h.open);
    const a = heureDuTrone(h.close);
    return h.closed || !de || !a ? `${nom} fermé` : `${nom} de ${de} à ${a}`;
  });
}

/** LE COMPTE DU MOIS, en dollars, aux prix du modèle. */
export function coutDOpale(u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null | undefined): number {
  if (!u) return 0;
  const n = (x: number | null | undefined) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  return (n(u.input_tokens) * TARIF_D_OPALE.entree + n(u.output_tokens) * TARIF_D_OPALE.sortie
    + n(u.cache_read_input_tokens) * TARIF_D_OPALE.cacheLu + n(u.cache_creation_input_tokens) * TARIF_D_OPALE.cacheEcrit) / 1_000_000;
}
/* ⟨/opale⟩ */

/* ══ LA VOIX DU NUMÉRO, JAMAIS UNE FICHE D'ENFANT · 4 novembre 2026 ═══
   « Une fiche d'enfant ne doit jamais être la voix d'un numéro WhatsApp »
   (Yéman). Recopiés tels quels, dans cet ordre : l'âge (clients-pur), le
   prénom (foyer-pur), la règle du Trône (voix-du-numero-pur), puis ce que
   le serveur en fait pour un fil (voix-du-fil-pur). Opale parle au parent ;
   la trace porte l'adulte, le payeur, ou personne. */
/* ⟨age-de⟩ */
/** L'âge en années révolues, ou `undefined` si la date de naissance manque. */
export function ageDe(birthday: string | undefined, aujourdhui: string): number | undefined {
  if (!birthday) return undefined;
  const n = new Date(`${birthday}T00:00:00`);
  const j = new Date(`${aujourdhui}T00:00:00`);
  if (Number.isNaN(n.getTime()) || Number.isNaN(j.getTime())) return undefined;
  let a = j.getFullYear() - n.getFullYear();
  const m = j.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && j.getDate() < n.getDate())) a -= 1;
  return a;
}

/** Est-elle mineure ? SANS DATE DE NAISSANCE, LA RÉPONSE EST NON — et c'est
    voulu : la minorité ouvre l'accès du parent à ses données, elle ne se
    présume pas. La règle échoue fermée, ce qui oblige à renseigner la date. */
export const estMineur = (client: { birthday?: string }, aujourdhui: string): boolean => {
  const a = ageDe(client.birthday, aujourdhui);
  return a !== undefined && a < 18;
};
/* ⟨/age-de⟩ */

/* ⟨prenom-de⟩ */
const CIVILITES = /^(m\.?|mr\.?|mme\.?|mlle\.?|madame|mademoiselle|monsieur|dr\.?)$/i;

/** LE PRÉNOM SEUL, le premier mot du nom : jamais le nom de famille, et
    jamais une civilité (la Maison ne la suppose pas ; une civilité écrite
    en tête du nom se saute). Sans nom : une chaîne vide. */
export const prenomDe = (nom?: string | null): string => {
  const mots = String(nom ?? '').trim().split(/\s+/).filter(Boolean);
  while (mots.length > 1 && CIVILITES.test(mots[0])) mots.shift();
  return mots[0] ?? '';
};

/** « A. et B. », « A., B. et C. » : les prénoms du foyer, dits ensemble. */
export const prenomsDits = (prenoms: readonly string[]): string => {
  const p = prenoms.filter(Boolean);
  return p.length > 1 ? `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}` : (p[0] ?? '');
};
/* ⟨/prenom-de⟩ */

/* ⟨voix-du-numero⟩ */
/** La clé de comparaison d'un numéro (229 01 97… et 229 97… sont le même). */
const cleDuNumero = (brut: string | undefined): string => {
  const d = numeroWa(brut);
  return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
};

/** Le nom qu'une fiche donne à l'un de ses numéros, quand c'est celui d'un parent. */
export const LIBELLE_PARENTAL = /^\s*(maman|papa|m[èe]re|p[èe]re|parents?|tuteur|tutrice)\b/i;

export type FicheParlante = {
  id: string;
  name: string;
  branchId: string;
  phone?: string;
  phone2?: string;
  phoneNom?: string;
  phone2Nom?: string;
  birthday?: string;
  familyId?: string;
  archived?: boolean;
};
export type FamillePayeuse = { id: string; payerClientId?: string };

/** LA FICHE PARLE-T-ELLE SUR CE NUMÉRO ? Non si elle est mineure, ou si elle
    nomme ce numéro comme celui d'un parent. */
export function parleSurCeNumero(f: FicheParlante, champ: 'phone' | 'phone2', aujourdhui: string): boolean {
  if (estMineur(f, aujourdhui)) return false;
  const nom = champ === 'phone' ? f.phoneNom : f.phone2Nom;
  return !LIBELLE_PARENTAL.test(nom ?? '');
}

/** SANS DATE DE NAISSANCE, SOUS UN PAYEUR : la fiche ne parle pas sur le
    numéro du parent qui règle son compte famille, ni sur aucun numéro quand
    ce parent n'en a pas. `fiches` : celles qu'on connaît (le payeur parmi
    elles, sinon on ne juge pas). */
export function muetteSousSonPayeur(
  f: FicheParlante, champ: 'phone' | 'phone2', fiches: readonly FicheParlante[],
  familles: readonly FamillePayeuse[] | undefined, aujourdhui: string,
): boolean {
  if (ageDe(f.birthday, aujourdhui) !== undefined || !f.familyId) return false;
  const payeurId = (familles ?? []).find((fa) => fa.id === f.familyId)?.payerClientId;
  if (!payeurId || payeurId === f.id) return false;
  const payeur = fiches.find((x) => x.id === payeurId && !x.archived);
  if (!payeur) return false;
  const k = cleDuNumero(f[champ]);
  const p1 = cleDuNumero(payeur.phone);
  const p2 = cleDuNumero(payeur.phone2);
  return (!p1 && !p2) || (!!k && (p1 === k || p2 === k));
}

export type VoixDuNumero =
  /** Une fiche adulte parle sur ce numéro (elle le porte, ou elle règle le compte des enfants qui le portent). */
  | { genre: 'fiche'; numero: string; fiche: FicheParlante; enfants: string[] }
  /** Personne n'a de fiche pour ce numéro : la voix porte le nom que les enfants lui donnent. */
  | { genre: 'sans-fiche'; numero: string; nom: string; branchId: string; enfants: string[] };

/** LES VOIX DES NUMÉROS QUE SEULS DES ENFANTS PORTENT (clé du numéro → voix),
    et, pour chaque fiche, les numéros sur lesquels elle parle. Un numéro porté
    par un adulte n'a pas d'entrée ici : il parle déjà par sa fiche. */
export function voixDesNumeros(o: {
  fiches: readonly FicheParlante[];
  familles?: readonly FamillePayeuse[];
  aujourdhui: string;
}): { voix: Map<string, VoixDuNumero>; parle: (f: FicheParlante, champ: 'phone' | 'phone2') => boolean } {
  const vivantes = o.fiches.filter((f) => !f.archived);
  const parle = (f: FicheParlante, champ: 'phone' | 'phone2') =>
    parleSurCeNumero(f, champ, o.aujourdhui) && !muetteSousSonPayeur(f, champ, vivantes, o.familles, o.aujourdhui);
  const adultes = new Set<string>();
  const enfants = new Map<string, { brut: string; fiche: FicheParlante; libelle?: string }[]>();
  for (const f of vivantes) {
    for (const champ of ['phone', 'phone2'] as const) {
      const brut = f[champ];
      const k = cleDuNumero(brut);
      if (!k || !brut) continue;
      if (parle(f, champ)) { adultes.add(k); continue; }
      const liste = enfants.get(k) ?? [];
      if (!liste.some((x) => x.fiche.id === f.id)) liste.push({ brut, fiche: f, libelle: champ === 'phone' ? f.phoneNom : f.phone2Nom });
      enfants.set(k, liste);
    }
  }
  const voix = new Map<string, VoixDuNumero>();
  for (const [k, liste] of enfants) {
    if (adultes.has(k)) continue;
    const ids = liste.map((x) => x.fiche.id);
    const famille = (o.familles ?? []).find((fa) => liste.some((x) => x.fiche.familyId && x.fiche.familyId === fa.id));
    const payeur = famille?.payerClientId ? vivantes.find((f) => f.id === famille.payerClientId) : undefined;
    /* Le payeur parle sur ce numéro s'il n'en a pas à lui : la mère qui règle
       le compte de ses filles écrit du téléphone que portent les filles. */
    const payeurSansNumero = !!payeur && !cleDuNumero(payeur.phone) && !cleDuNumero(payeur.phone2);
    if (payeur && payeurSansNumero && !ids.includes(payeur.id)) {
      voix.set(k, { genre: 'fiche', numero: liste[0].brut, fiche: payeur, enfants: ids });
      continue;
    }
    const libelle = (liste.find((x) => LIBELLE_PARENTAL.test(x.libelle ?? ''))?.libelle ?? '').trim();
    const qui = libelle ? `${libelle[0].toUpperCase()}${libelle.slice(1).toLowerCase()}` : 'Parent';
    const prenoms = prenomsDits([...new Set(liste.map((x) => prenomDe(x.fiche.name)).filter(Boolean))]);
    /* « Maman d'A. », « Parent de J. » : l'élision devant une voyelle. */
    const de = /^[aeiouyàâäéèêëîïôöûüh]/i.test(prenoms) ? 'd’' : 'de ';
    voix.set(k, { genre: 'sans-fiche', numero: liste[0].brut, nom: `${qui} ${de}${prenoms}`, branchId: liste[0].fiche.branchId, enfants: ids });
  }
  return { voix, parle };
}
/* ⟨/voix-du-numero⟩ */

/* ⟨voix-du-fil⟩ */
/** Une ligne de la base telle qu'on la lit : `clients` ou `families`. */
export type LigneDeLaVoix = { id: string; data?: Record<string, unknown> | null };
/** Lit des lignes par leurs identifiants ; `null` : la base ne répond pas. */
export type LecteurDeLaVoix = (table: 'clients' | 'families', ids: readonly string[]) => Promise<readonly LigneDeLaVoix[] | null>;
/** La fiche qui parle, telle qu'un message la porte et qu'on l'appelle. */
export type FicheDeLaVoix = { id: string; name: string; branchId: string; civilite?: 'madame' | 'mademoiselle' | 'monsieur'; auMasculin?: boolean };
export type VoixDuFil = {
  /** L'adulte qui porte ce numéro, sinon le parent qui règle le compte des enfants. */
  fiche?: FicheDeLaVoix;
  /** La fiche qui parle est celle du parent payeur : elle ne porte pas ce numéro. */
  payeur?: boolean;
  /** Personne n'a de fiche : le nom que la fiche des enfants lui donne (« Maman d'A. »). */
  nom?: string;
  /** Les fiches qui portent ce numéro sans y parler : les enfants. */
  muettes: string[];
};

const texteDeLaVoix = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const ficheParlanteDe = (l: LigneDeLaVoix): FicheParlante => ({
  id: String(l.id),
  name: texteDeLaVoix(l.data?.name) ?? '',
  branchId: texteDeLaVoix(l.data?.branchId) ?? '',
  phone: texteDeLaVoix(l.data?.phone),
  phone2: texteDeLaVoix(l.data?.phone2),
  phoneNom: texteDeLaVoix(l.data?.phoneNom),
  phone2Nom: texteDeLaVoix(l.data?.phone2Nom),
  birthday: texteDeLaVoix(l.data?.birthday),
  familyId: texteDeLaVoix(l.data?.familyId),
  archived: l.data?.archived === true,
});
const ficheDeLaVoix = (f: FicheParlante, l: LigneDeLaVoix | undefined): FicheDeLaVoix => {
  const c = l?.data?.civilite;
  return {
    id: f.id, name: f.name, branchId: f.branchId,
    ...(c === 'madame' || c === 'mademoiselle' || c === 'monsieur' ? { civilite: c } : {}),
    ...(l?.data?.auMasculin === true ? { auMasculin: true } : {}),
  };
};

/** QUI PARLE SUR CE NUMÉRO, pour un fil du serveur. `ids` : les fiches que la
    base rattache au numéro (celles qui le portent, et leur famille). `null` :
    la base ne répond pas, et le fil n'est rattaché à personne. */
export async function laVoixDuFil(numero: string, ids: readonly string[], lis: LecteurDeLaVoix, aujourdhui: string): Promise<VoixDuFil | null> {
  const cle = (brut: string | undefined): string => {
    const d = numeroWa(brut);
    return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
  };
  const k = cle(numero);
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!k || uniques.length === 0) return { muettes: [] };
  const lues = await lis('clients', uniques);
  if (!lues) return null;
  const lignes = new Map(lues.map((l) => [String(l.id), l]));
  const fiches = lues.map(ficheParlanteDe).filter((f) => !f.archived);
  const porte = (f: FicheParlante, champ: 'phone' | 'phone2'): boolean => cle(f[champ]) === k;
  const portent = fiches.filter((f) => porte(f, 'phone') || porte(f, 'phone2'));
  if (portent.length === 0) return { muettes: [] };
  /* Les comptes famille de celles qui le portent, et leurs payeurs : un
     enfant SANS DATE DE NAISSANCE se juge par eux (`muetteSousSonPayeur`). */
  const foyers = [...new Set(portent.map((f) => f.familyId).filter((x): x is string => !!x))];
  const familles: FamillePayeuse[] = foyers.length === 0 ? [] : ((await lis('families', foyers)) ?? [])
    .map((l) => ({ id: String(l.id), payerClientId: texteDeLaVoix(l.data?.payerClientId) }));
  const absents = [...new Set(familles.map((f) => f.payerClientId).filter((x): x is string => !!x && !lignes.has(x)))];
  const payeurs = absents.length === 0 ? [] : ((await lis('clients', absents)) ?? []);
  for (const l of payeurs) lignes.set(String(l.id), l);
  const connues = [...fiches, ...payeurs.map(ficheParlanteDe).filter((f) => !f.archived)];
  const parleIci = (f: FicheParlante): boolean => (['phone', 'phone2'] as const)
    .some((c) => porte(f, c) && parleSurCeNumero(f, c, aujourdhui) && !muetteSousSonPayeur(f, c, connues, familles, aujourdhui));
  const muettes = portent.filter((f) => !parleIci(f)).map((f) => f.id);
  const adulte = portent.find(parleIci);
  if (adulte) return { fiche: ficheDeLaVoix(adulte, lignes.get(adulte.id)), muettes };
  /* Seuls des enfants le portent : le parent qui règle leur compte famille. */
  const { voix } = voixDesNumeros({ fiches: connues, familles, aujourdhui });
  const v = voix.get(k);
  if (v?.genre === 'fiche') return { fiche: ficheDeLaVoix(v.fiche, lignes.get(v.fiche.id)), payeur: true, muettes };
  if (v?.genre === 'sans-fiche') return { nom: v.nom, muettes };
  return { muettes };
}
/* ⟨/voix-du-fil⟩ */

/** LE LECTEUR DE LA VOIX : les lignes entières, par leurs identifiants ;
    `null` si la base ne répond pas (le fil n'est alors rattaché à personne). */
function lecteurDeLaVoix(sb: SupabaseClient): LecteurDeLaVoix {
  return async (t, ids) => {
    try {
      const { data, error } = await sb.from(t).select('id, data').in('id', [...ids]);
      if (error) { dis('voix · lecture impossible', { table: t, motif: error.message.slice(0, 120) }); return null; }
      return (data ?? []) as LigneDeLaVoix[];
    } catch (e) {
      dis('voix · lecture impossible', { table: t, motif: String(e).slice(0, 120) });
      return null;
    }
  };
}

/** QUI SIGNE LA TRACE D'UN MESSAGE DE L'AUTOMATE (4 novembre 2026) : celle
    qu'elle a dit être (« Pour moi »), si elle parle sur ce numéro ; sinon
    la voix du numéro ; jamais une fiche d'enfant. */
async function ficheDeLaTrace(sb: SupabaseClient, numero: string, fiches: readonly FicheDuNumero[], choisieId: string | undefined, ms: number): Promise<string | undefined> {
  const iso = instantACotonou(ms).iso;
  const voix = await laVoixDuFil(numero, fiches.map((f) => f.id), lecteurDeLaVoix(sb), iso);
  const choisie = fiches.find((f) => f.id === choisieId);
  if (choisie && !choisie.parFamille && !mineureWa(choisie.naissance, iso) && !(voix?.muettes ?? []).includes(choisie.id)) return choisie.id;
  return voix ? voix.fiche?.id : titulaireDuNumero(fiches, iso)?.id;
}

/* ══ CE QUE LE DIALOGUE VOIT DE L'AGENDA ═══════════════════════════════
   Ni l'écran ni la cliente ne calculent une place : ce serveur la calcule
   sur l'instantané qu'il vient de lire, par le juge recopié ci-dessus
   (⟨place-du-serveur⟩, le même que demande-submit) : `placesLibres` pour la
   liste, `laPlaceTient` au « Je confirme », `reservableSurLeSite` pour dire
   au dialogue ce qui se réserve en ligne, `CONSULTATION_PAR_PARCOURS` pour
   la consultation de chaque parcours. Les places se calculent à la demande
   et se gardent le temps du tour ; `oublie` les efface quand un instantané
   plus frais des créneaux pris est arrivé. */
type AgendaLu = { lignes: LignesDeLAgenda; agenda: AgendaDuServeur; tarif?: TarifDuTour };

/* ══ LE PRIX DU CATALOGUE POUR UNE TÊTE · 30 octobre 2026 ═════════════
   « Rajoute le prix une fois le client sélectionné » (Yéman). Le barème de
   la réservation du site (⟨prix-calibre⟩, recopié plus bas, celui que
   `verifie-prix` confronte au Trône) : le calibre de la tête, marge
   comprise si la Maison l'a accordée ; la longueur passe avant tout, comme
   `prixDeBase` ; puis son Juste Prix sur les seuls gestes de l'Atelier,
   arrondi au 500 F, comme `personalPriceXof`. Ses prix fermes passent
   avant, dans le dialogue. Sans barème lu : aucun prix, jamais un faux. */
type TarifDuTour = { bandes: Bande[]; sets: Record<string, Bande[]>; baremeSuspendu: boolean };

// deno-lint-ignore no-explicit-any
function tarifDesDocuments(docs: Map<string, any>): TarifDuTour {
  const bande = (b: unknown): b is Bande => !!b && typeof b === 'object' && typeof (b as Bande).id === 'string';
  const bandes = Array.isArray(docs.get('mnd_model_bands')) ? (docs.get('mnd_model_bands') as unknown[]).filter(bande) : [];
  const brut = docs.get('mnd_model_band_sets');
  const sets: Record<string, Bande[]> = {};
  if (brut && typeof brut === 'object' && !Array.isArray(brut)) {
    for (const [k, v] of Object.entries(brut as Record<string, unknown>)) if (Array.isArray(v)) sets[k] = v.filter(bande);
  }
  return { bandes, sets, baremeSuspendu: docs.get('mnd_settings')?.baremeSuspendu === true };
}

/** La marge de calibre (`MARGE_CALIBRE_LOCKS`, shared/pricing) : quinze locks. */
const MARGE_CALIBRE_WA = 15;

/** Le calibre de la tête, marge comprise (`calibreDeLaTete`) : un cran au plus. */
function calibreDeLaTeteWa(locks: number | undefined, bandes: readonly Bande[], marge: boolean | undefined): Bande | undefined {
  if (!locks || locks <= 0 || bandes.length === 0) return undefined;
  const tri = bandesTriees(bandes);
  const k = tri.findIndex((b) => locks <= (b.maxLocks ?? Infinity));
  const brut = k < 0 ? tri.length - 1 : k;
  if (!marge || brut <= 0) return tri[brut];
  const dessous = tri[brut - 1];
  if (dessous.maxLocks == null) return tri[brut];
  return locks - dessous.maxLocks <= MARGE_CALIBRE_WA ? dessous : tri[brut];
}

/** L'Atelier, par la maison de la racine (`mondeDeCat`). */
function deLAtelierWa(categoryId: string, cats: readonly { id: string; data?: Record<string, unknown> | null }[]): boolean {
  let cur = cats.find((c) => c.id === categoryId);
  for (let i = 0; cur && typeof cur.data?.parentId === 'string' && cur.data.parentId && i < 8; i += 1) {
    const p = cats.find((c) => c.id === cur!.data!.parentId);
    if (!p) break;
    cur = p;
  }
  return cur?.data?.maison === 'atelier';
}

function prixPourLaTeteWa(
  ligne: { id: string; data?: Record<string, unknown> | null }, tete: TeteDuPrix, tarif: TarifDuTour,
  cats: { id: string; parentId?: string }[], catsBrutes: readonly { id: string; data?: Record<string, unknown> | null }[],
): number | undefined {
  const d = (ligne.data ?? {}) as Record<string, unknown>;
  if (d.hidePrice || d.priceMode === 'devis') return undefined;
  /* Une grille par longueur sans la sienne : pas de prix, plutôt qu'un prix
     d'une autre longueur (31 octobre 2026). */
  const grille = d.prixParLongueur as Record<string, unknown> | undefined;
  if (tete.longueur && grille && Object.keys(grille).length > 0 && !(Number(grille[tete.longueur]) > 0)) return undefined;
  const s = { ...d, id: ligne.id } as unknown as PrestationTarifee;
  const parLongueur = tete.longueur ? Number((d.prixParLongueur as Record<string, unknown> | undefined)?.[tete.longueur]) : Number.NaN;
  const bande = calibreDeLaTeteWa(tete.locks, tarif.bandes, tete.marge);
  const prix = prixSelonLeCalibre(Number.isFinite(parLongueur) && parLongueur > 0 ? { ...s, priceXof: parLongueur } : s,
    { bande, lockCount: tete.locks, sets: tarif.sets, cats, baremeSuspendu: tarif.baremeSuspendu });
  if (!prix || prix <= 0) return undefined;
  const coef = tete.coef && tete.coef > 0 && tete.coef !== 1 && !PRIX_FIXES.has(ligne.id) && deLAtelierWa(String(d.categoryId ?? ''), catsBrutes) ? tete.coef : 1;
  return coef === 1 ? prix : arrondi(prix * coef);
}

function agendaDuTourWa(lu: AgendaLu, ms: number, horizon: number): { agenda: AgendaDuTour; oublie: () => void } {
  const gardees = new Map<string, PlaceLibre[]>();
  const a = lu.agenda;
  const tarif = lu.tarif;
  const brutes = new Map((lu.lignes.services ?? []).map((l) => [String(l.id), l as { id: string; data?: Record<string, unknown> | null }]));
  const catsBrutes = (lu.lignes.categories ?? []) as { id: string; data?: Record<string, unknown> | null }[];
  const paliers = tarif ? bandesTriees(tarif.bandes).map((b) => ({ palier: etendueDeLaBande(b, tarif.bandes), nom: String(b.name ?? ''), locks: representantDeLaBande(b, tarif.bandes) })) : [];
  const prixDe = tarif && paliers.length > 0
    ? (id: string, tete: TeteDuPrix): number | undefined => {
      const l = brutes.get(id);
      return l ? prixPourLaTeteWa(l, tete, tarif, a.categories, catsBrutes) : undefined;
    }
    : undefined;
  /* Ce dont son prix dépend : il change d'un bout à l'autre des paliers, ou
     d'une longueur à l'autre. Les trois longueurs, pas seulement le court et
     le long (31 octobre 2026, essai réel : la Révélation Végétale n'a de prix
     qu'en court et mi-long, le long retombait sur le prix du court, et la
     longueur n'était jamais demandée, ni le prix dit). */
  const depend = (id: string): { prixALaLongueur?: boolean; prixAuxLocks?: boolean } => {
    if (!prixDe) return {};
    const premier = paliers[0].locks;
    const dernier = paliers[paliers.length - 1].locks;
    const aux = prixDe(id, { locks: premier, longueur: 'mi-long' }) !== prixDe(id, { locks: dernier, longueur: 'mi-long' });
    const lon = new Set((['court', 'mi-long', 'long'] as const).map((longueur) => prixDe(id, { locks: premier, longueur }))).size > 1;
    return { ...(aux ? { prixAuxLocks: true } : {}), ...(lon ? { prixALaLongueur: true } : {}) };
  };
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
      ...depend(s.id),
    })),
    categories: a.categories,
    formules: a.formules,
    consultationParParcours: CONSULTATION_PAR_PARCOURS,
    semaine: a.semaine,
    exceptions: a.exceptions,
    ...(prixDe ? { prixDe, paliers } : {}),
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
    /* LE DÉPLACEMENT (2 novembre 2026) : les places de SON maître, pour la
       durée du rendez-vous, sa propre place rendue libre. */
    placesDuMaitre: (_ids, maitre, sauf) => placesDuMaitreWa(lu.agenda, maitre, sauf, ms, horizon),
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
  return { lignes, agenda, tarif: tarifDesDocuments(docs) };
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

/** LE DERNIER MOT DE LA MAISON (31 octobre 2026) : le dernier message parti
    vers ce numéro et remis (un refus de Meta n'a rien dit). `null` : aucun,
    ou la base ne répond pas ; la réception parle alors comme avant. */
async function leDernierMotDeLaMaison(sb: Sb, numero: string): Promise<DernierMotDeLaMaison> {
  const { data, error } = await sb.from('messages_wa').select('data')
    .eq('data->>numero', numero).eq('data->>sens', 'sortant')
    .order('data->>quand', { ascending: false }).limit(5);
  if (error) { dis('dernier mot illisible', { motif: error.message.slice(0, 120) }); return null; }
  const d = ((data ?? []) as Ligne[]).map((l) => l.data ?? {}).find((x) => x.etat !== 'non-remis' && typeof x.quand === 'string');
  return d ? { texte: String(d.texte ?? ''), quand: String(d.quand) } : null;
}

/** LES FICHES DU NUMÉRO (0125), telles que le dialogue les lit. `null` :
    la base ne répond pas, et l'automate laisse la Maison répondre. */
async function lesFichesDuNumero(sb: Sb, numero: string): Promise<FicheDuNumero[] | null> {
  const { data, error } = await sb.rpc('fiches_du_numero', { n: numero });
  if (error || !Array.isArray(data)) {
    dis('fiches_du_numero illisible', { motif: String(error?.message ?? 'reponse illisible').slice(0, 120) });
    return null;
  }
  /* SA TÊTE POUR LE PRIX (30 octobre 2026) : « si c'est un ancien client, le
     système reconnaît son nombre de locks grâce au numéro » (Yéman). Lue sur
     ses fiches seules ; illisible, le prix se demande comme à une nouvelle. */
  const ids = (data as Record<string, unknown>[]).map((f) => String(f?.id ?? '')).filter(Boolean);
  const tetes = new Map<string, { tete?: TeteDuPrix; prixFixes?: Record<string, number> }>();
  if (ids.length > 0) {
    const { data: lignes, error: err } = await sb.from('clients')
      .select('id, locks:data->lockCount, longueur:data->>longueur, marge:data->margeCalibre, coef:data->priceCoef, fixes:data->prixFixes')
      .in('id', ids);
    if (err) dis('tetes illisibles', { motif: err.message.slice(0, 120) });
    for (const l of (lignes ?? []) as Record<string, unknown>[]) {
      const locks = Number(l.locks);
      const longueur = l.longueur === 'court' || l.longueur === 'mi-long' || l.longueur === 'long' ? l.longueur : undefined;
      const coef = Number(l.coef);
      const fixes: Record<string, number> = {};
      if (l.fixes && typeof l.fixes === 'object' && !Array.isArray(l.fixes)) {
        for (const [k, v] of Object.entries(l.fixes as Record<string, unknown>)) if (typeof v === 'number' && v > 0) fixes[k] = v;
      }
      const tete: TeteDuPrix = {
        ...(Number.isFinite(locks) && locks > 0 ? { locks: Math.round(locks) } : {}),
        ...(longueur ? { longueur } : {}),
        ...(l.marge === true ? { marge: true } : {}),
        ...(Number.isFinite(coef) && coef > 0 && coef !== 1 ? { coef } : {}),
      };
      tetes.set(String(l.id), {
        ...(Object.keys(tete).length > 0 ? { tete } : {}),
        ...(Object.keys(fixes).length > 0 ? { prixFixes: fixes } : {}),
      });
    }
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
      ...(tetes.get(String(f.id)) ?? {}),
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
  sb: Sb, o: { numero: string; m: MessageSortant; rendu: Rendu; branchId?: string; clientId?: string; parQui?: string },
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
      /* Le plan part en image, sans légende : le fil du Trône le dit en mots. */
      texte: o.m.corps || (o.m.forme === 'image' ? 'Le plan pour venir à la Maison (image)' : ''),
      type: o.m.forme === 'texte' ? 'text' : o.m.forme === 'image' ? 'image' : 'interactive',
      ...(o.m.image ? { lienImage: o.m.image } : {}),
      quand: new Date().toISOString(),
      etat: o.rendu.waId ? 'en-route' : 'non-remis',
      ...(o.rendu.detail ? { detail: o.rendu.detail } : {}),
      /* La réception signe « Assistant Maison » (27 octobre 2026) : le Trône
         la lit comme une main qui n'est pas humaine, et le plafond la compte. */
      /* Opale signe les siens (4 novembre 2026) : le Trône dit « Opale ». */
      parQui: o.parQui ?? (o.m.deLaReception ? 'Assistant Maison' : 'Le Trône'),
      auto: 'automate',
      ...(o.m.deLaReception ? { reception: true } : {}),
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

/* ══ LE RENDEZ-VOUS SE DÉPLACE SEUL, SOUS VERROU · 2 novembre 2026 ══════
   Lot 3 de Perle, choix de Yéman au sélecteur : « Seule, sous verrou ».
   Quand une cliente demande une autre heure (par écrit, par le bouton
   « Changer l'heure » d'un message de Perle, ou par la réception), la Maison
   lui propose les places de SON maître, pour la même durée et les mêmes
   soins, et la place touchée DÉPLACE le rendez-vous existant : relu frais,
   il ne doit pas avoir bougé (`updated_at`, sa place, son maître, sa fiche),
   la place est rejugée pour ce maître sur un instantané frais du jour, puis
   l'écriture se fait sous condition (`updated_at` inchangé). Jamais un statut
   changé, jamais un nouveau rendez-vous, jamais un autre maître. Annuler
   reste transmis à l'équipe. */

/** Un rendez-vous de l'agenda rendu libre : le créneau occupé de ce maître,
    ce jour, à cette heure, retiré une fois. */
function agendaSansLeRdvWa(agenda: AgendaDuServeur, maitre: string, sauf: { date: string; time: string }): AgendaDuServeur {
  let retire = false;
  const debut = minutesDeHhmm(sauf.time);
  const occupes = agenda.occupes.filter((c) => {
    if (retire) return true;
    if (c.jour === sauf.date && (c.maitre ?? '') === maitre && minutesDeHhmm(c.debut) === debut) { retire = true; return false; }
    return true;
  });
  return { ...agenda, occupes };
}

/** LES PLACES D'UN SEUL MAÎTRE : les heures que `placesLibres` montrerait,
    pour ce maître seul et cette durée, de demain à l'horizon, fauteuils,
    plafonds et murs compris, sa propre place rendue libre. Les gestes ne se
    rejugent pas (le rendez-vous existe déjà : un geste archivé depuis ne
    l'empêche pas de bouger). */
function placesDuMaitreWa(
  agenda: AgendaDuServeur, maitre: string, sauf: { date: string; time: string; dureeMin: number }, ms: number, horizonJours: number,
): PlaceDuServeur[] {
  const voulu = Math.round(Number(horizonJours));
  const n = Math.max(1, Math.min(FENETRE_DE_RESERVATION, Number.isFinite(voulu) && voulu > 0 ? voulu : 14));
  const duree = Math.max(1, Math.round(Number(sauf.dureeMin) || 60));
  const sans = agendaSansLeRdvWa(agenda, maitre, sauf);
  const aujourdhui = jourDeCotonou(ms);
  const out: PlaceDuServeur[] = [];
  for (let i = 1; i <= n; i += 1) {
    const iso = isoApresJours(aujourdhui, i);
    const opening = ouvertureDuJour(iso, sans.semaine, sans.exceptions);
    if (opening.closed) continue;
    const libres = creneauxLibres({
      opening,
      durationMin: duree,
      occupes: occupesDuJour(sans.occupes, iso),
      bloques: plagesBloquees(sans.murs, sans.branchId, iso, maitre),
      master: maitre,
      capMaison: sans.capMaison,
      capMaitre: sans.capMaitre,
      capSimultane: sans.sieges,
      maintenantMin: null,
    });
    for (const heure of [...libres].sort()) out.push({ iso, heure });
  }
  return out;
}

/** LA PLACE TIENT-ELLE POUR CE MAÎTRE ? La forme et la fenêtre, l'ouverture,
    le plafond de la Maison, les places en ligne, puis le maître lui-même
    (son plafond, ses rendez-vous, ses murs), le rendez-vous déplacé rendu
    libre. Un autre maître libre à cette heure ne compte pas. */
function laPlaceTientPourLeMaitreWa(
  agenda: AgendaDuServeur, maitre: string, p: { date: string; time: string; dureeMin: number }, sauf: { date: string; time: string }, ms: number,
): { ok: true } | { ok: false; erreur: RefusDeLaPlace } {
  const recevable = laPlaceEstRecevable(p, ms);
  if (recevable) return { ok: false, erreur: recevable };
  const fenetre = ouvertureDuJour(p.date, agenda.semaine, agenda.exceptions);
  if (fenetre.closed) return { ok: false, erreur: 'creneau_ferme' };
  const debut = minutesDeHhmm(p.time);
  const fin = debut + Math.max(1, Math.round(Number(p.dureeMin) || 60));
  if (debut < fenetre.openMin || fin > fenetre.closeMin) return { ok: false, erreur: 'creneau_hors_ouverture' };
  const sans = agendaSansLeRdvWa(agenda, maitre, sauf);
  const duJour = occupesDuJour(sans.occupes, p.date);
  if (sans.capMaison > 0 && duJour.length >= sans.capMaison) return { ok: false, erreur: 'creneau_plafond' };
  const chevauche = (s: number, e: number): boolean => debut < e && fin > s;
  if (sans.sieges > 0 && duJour.filter((a) => chevauche(a.debutMin, a.debutMin + a.dureeMin)).length >= sans.sieges) return { ok: false, erreur: 'creneau_pris' };
  const siens = duJour.filter((a) => a.maitre === maitre);
  if (sans.capMaitre > 0 && siens.length >= sans.capMaitre) return { ok: false, erreur: 'creneau_plafond' };
  const occupe = [
    ...siens.map((a): [number, number] => [a.debutMin, a.debutMin + a.dureeMin]),
    ...plagesBloquees(sans.murs, sans.branchId, p.date, maitre),
  ].some(([s, e]) => chevauche(s, e));
  return occupe ? { ok: false, erreur: 'creneau_pris' } : { ok: true };
}

/** LE RENDEZ-VOUS QU'ELLE PEUT DÉPLACER, lu frais : celui que le bouton ou la
    réception désigne (`rdvId`), sinon le prochain de la titulaire du numéro
    (la date et l'heure de `fiches_du_numero`). Il doit être à une fiche du
    numéro, confirmé ou en attente, d'aujourd'hui ou plus tard. `null` : rien
    à déplacer seule, le repli d'avant (la place touchée passe à l'équipe). */
async function leRdvADeplacer(
  sb: Sb, o: { rdvId: string | null; fiches: readonly FicheDuNumero[]; aujourdhui: string; agenda: AgendaDuServeur | null },
): Promise<RdvADeplacer | null> {
  const ids = new Set(o.fiches.map((f) => f.id));
  let lignes: (Ligne & { updated_at?: string })[] = [];
  if (o.rdvId) {
    const { data, error } = await sb.from('appointments').select('id, data, updated_at').eq('id', o.rdvId).limit(1);
    if (error) { dis('rendez-vous a deplacer illisible', { motif: error.message.slice(0, 120) }); return null; }
    lignes = (data ?? []) as (Ligne & { updated_at?: string })[];
  } else {
    const titulaire = titulaireDuNumero(o.fiches, o.aujourdhui);
    const prochain = titulaire?.prochainRdv;
    if (!titulaire || !prochain?.date) return null;
    const { data, error } = await sb.from('appointments').select('id, data, updated_at')
      .eq('data->>clientId', titulaire.id).eq('data->>date', prochain.date).limit(20);
    if (error) { dis('rendez-vous a deplacer illisible', { motif: error.message.slice(0, 120) }); return null; }
    lignes = ((data ?? []) as (Ligne & { updated_at?: string })[])
      .filter((l) => !prochain.time || String(l.data?.time ?? '') === prochain.time);
  }
  const l = lignes.find((x) => x.data && ids.has(String(x.data.clientId ?? ''))
    && ['confirmé', 'en attente'].includes(String(x.data.status ?? '')) && String(x.data.date ?? '') >= o.aujourdhui
    && /^\d{2}:\d{2}$/.test(String(x.data.time ?? '')) && typeof x.updated_at === 'string');
  if (!l?.data) return null;
  const d = l.data;
  const serviceIds = Array.isArray(d.serviceIds) ? (d.serviceIds as unknown[]).map(String).filter(Boolean) : [];
  if (serviceIds.length === 0) return null;
  const e = Number(d.dureeMin);
  const dureeMin = Number.isFinite(e) && e >= 1 ? Math.round(e) : dureeDesPrestations(serviceIds, o.agenda?.services ?? []);
  return {
    id: l.id, updatedAt: String(l.updated_at), clientId: String(d.clientId), date: String(d.date), time: String(d.time),
    maitre: String(d.master ?? ''), serviceIds, dureeMin, status: String(d.status),
  };
}

/** LA PLACE TOUCHÉE DÉPLACE LE RENDEZ-VOUS : relu frais (rien n'a bougé), la
    place rejugée pour son maître sur un instantané frais du jour, puis
    l'écriture SOUS CONDITION (`updated_at` inchangé). La marque « autre
    moment demandé » posée par le bouton de Perle s'efface ; le déplacement se
    signe (`deplaceLe`, `deplacePar`, `deplaceDe`) et s'écrit au journal. */
async function deplaceSousVerrou(sb: Sb, lu: AgendaLu, d: DeplacementAPoser, oublie: () => void, ms: number, parNom = 'Perle'): Promise<VerdictDuDeplacement> {
  const { data, error } = await sb.from('appointments').select('id, branch_id, data, updated_at').eq('id', d.rdvId).limit(1);
  if (error) { dis('deplacement : rendez-vous illisible', { motif: error.message.slice(0, 120) }); return { ok: false, raison: 'erreur' }; }
  const ligne = ((data ?? []) as (Ligne & { branch_id?: string | null; updated_at?: string })[])[0];
  if (!ligne?.data) return { ok: false, raison: 'rdv-inconnu' };
  const a = ligne.data;
  /* Rejoué après coup : déjà à sa nouvelle place, par WhatsApp. */
  if (a.date === d.date && a.time === d.time && a.deplacePar === 'whatsapp' && String(a.deplaceDe?.date ?? '') === d.avant.date) return { ok: true, verdict: 'deja' };
  if (Date.parse(String(ligne.updated_at ?? '')) !== Date.parse(d.updatedAt) || a.date !== d.avant.date || String(a.time ?? '') !== d.avant.time
    || String(a.master ?? '') !== d.maitre || String(a.clientId ?? '') !== d.clientId) {
    return { ok: false, raison: 'modifie-entre-temps' };
  }
  if (!['confirmé', 'en attente'].includes(String(a.status ?? ''))) return { ok: false, raison: 'rdv-clos' };
  const frais = await litLesCreneaux(sb, lu.agenda.branchId, d.date, d.date);
  if (!frais) return { ok: false, raison: 'agenda_illisible' };
  const autresJours = (lu.lignes.occupes ?? []).filter((c) => String((c as { jour?: unknown } | null)?.jour ?? '') !== d.date);
  const lignes: LignesDeLAgenda = { ...lu.lignes, occupes: [...autresJours, ...frais] };
  const neuf = agendaDepuisLesLignes(lignes);
  if (!neuf) return { ok: false, raison: 'agenda_illisible' };
  lu.lignes = lignes;
  lu.agenda = neuf;
  oublie();
  const place = laPlaceTientPourLeMaitreWa(neuf, d.maitre, { date: d.date, time: d.time, dureeMin: d.dureeMin }, d.avant, ms);
  if (!place.ok) return { ok: false, raison: place.erreur };
  const maintenant = new Date(ms).toISOString();
  const { autreMomentDemandeLe: _marque, ...reste } = a;
  const apres = { ...reste, date: d.date, time: d.time, deplaceLe: maintenant, deplacePar: 'whatsapp', deplaceDe: { date: d.avant.date, time: d.avant.time } };
  const { data: ecrit, error: errE } = await sb.from('appointments').update({ data: apres })
    .eq('id', d.rdvId).eq('updated_at', String(ligne.updated_at)).select('id, updated_at');
  if (errE) { dis('deplacement refuse par la base', { motif: errE.message.slice(0, 120) }); return { ok: false, raison: 'erreur' }; }
  if (!Array.isArray(ecrit) || ecrit.length === 0) return { ok: false, raison: 'modifie-entre-temps' };
  const gesteId = `geste-wa-depl-${d.rdvId}-${d.date.replace(/-/g, '')}${d.time.replace(':', '')}`;
  const { error: errJ } = await sb.from('journal_gestes').upsert({
    id: gesteId, branch_id: ligne.branch_id ?? d.branchId ?? null,
    data: {
      id: gesteId, ...(d.branchId ? { branchId: d.branchId } : {}), quand: maintenant, parNom, porte: 'assistant',
      verbe: 'modifie', table: 'appointments', ecran: 'WhatsApp de la Maison', pieceId: d.rdvId,
      piece: `Rendez-vous déplacé par WhatsApp, ${jourDitAvecAnnee(d.date)} à ${heureDite(d.time)}`,
      champs: [{ champ: 'Date', avant: d.avant.date, apres: d.date }, { champ: 'Heure', avant: d.avant.time, apres: d.time }],
    },
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (errJ) dis('deplacement : journal refuse', { motif: errJ.message.slice(0, 120) });
  return { ok: true, verdict: 'deplace' };
}

/** LA CONFIRMATION DU DÉPLACEMENT AU JOURNAL DES ENVOIS : une ligne par
    déplacement (`depl-<rdv>-<jour><heure>-whatsapp`), « envoyé » avec
    l'identifiant de Meta, ou « échec » avec son motif. Le modèle de
    confirmation-rdv ne repart pas pour un déplacement : la conversation l'a dit. */
async function ditLeDeplacementAuxEnvois(sb: Sb, d: DeplacementAPoser, rendu: Rendu, branchId: string | null): Promise<void> {
  const id = `depl-${d.rdvId}-${d.date.replace(/-/g, '')}${d.time.replace(':', '')}-whatsapp`;
  const maintenant = new Date().toISOString();
  const { error } = await sb.from('envois').upsert({
    id, branch_id: branchId ?? d.branchId ?? null,
    data: {
      id, ...(d.branchId ? { branchId: d.branchId } : {}), type: 'confirmation', canal: 'whatsapp', apptId: d.rdvId,
      ...(d.clientId ? { clientId: d.clientId } : {}), prenom: d.prenom, numero: `+${d.numero}`, dateRdv: d.date, heure: d.time,
      deplacement: { de: d.avant, par: 'whatsapp' }, quand: maintenant,
      ...(rendu.waId
        ? { statut: 'envoyé', waMessageId: rendu.waId, etat: 'en-route', detail: 'déplacement dit dans la conversation' }
        : { statut: 'échec', detail: String(rendu.detail ?? 'le déplacement n est pas dit dans la conversation').slice(0, 300), ...(rendu.code ? { codeMeta: rendu.code } : {}) }),
    },
  }, { onConflict: 'id' });
  if (error) dis('ligne du deplacement refusee', { motif: error.message.slice(0, 120) });
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

/* ══ LA RÉCEPTION, DEMANDÉE · 27 octobre 2026 ══════════════════════════
   La fonction `reception-wa` (regroupée depuis le dépôt) fait écrire Claude.
   Vingt-cinq secondes au plus ; sans réponse sûre, le mot de secours, et la
   main passe à l'équipe. La porte : la même clé service que le webhook. */
const SUITES_CONNUES = ['rien', 'reserver', 'creation', 'reparation', 'calibre', 'equipe', 'venir', 'deplacer'];
async function demandeALaReception(
  // deno-lint-ignore no-explicit-any
  o: Appel, x: { tour: TourDeLaCliente; fiches: FicheDuNumero[]; docs: Map<string, any>; ms: number },
): Promise<ReponseDeLaReception> {
  const reglages = x.docs.get('mnd_settings') ?? {};
  const fermetures = x.docs.get('mnd_horaires_exceptions');
  const secours = () => secoursDeLaReception(x.ms, Array.isArray(reglages.hours) ? reglages.hours : [], Array.isArray(fermetures) ? fermetures : []);
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const cle = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  if (!base || !cle) return secours();
  const titulaire = titulaireDuNumero(x.fiches, instantACotonou(x.ms).iso);
  const corps = {
    numero: o.numero,
    ...(titulaire ? {
      clientId: titulaire.id,
      fiche: { name: titulaire.nom, ...(titulaire.civilite ? { civilite: titulaire.civilite } : {}), ...(titulaire.auMasculin ? { auMasculin: true } : {}) },
      ...(titulaire.prochainRdv ? { prochainRdv: titulaire.prochainRdv } : {}),
      ...(titulaire.derniereVenue ? { derniereVenue: { date: titulaire.derniereVenue.date } } : {}),
    } : {}),
    ...(x.tour.choix?.id ? { choixId: x.tour.choix.id } : {}),
    /* Ce que l'automate sait faire (2 novembre 2026) : envoyer la question de
       l'accord des nouvelles après le mot de la réception. */
    sait: [...CE_QUE_L_AUTOMATE_SAIT],
  };
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), 25_000);
  try {
    const res = await fetch(`${base}/functions/v1/reception-wa`, {
      method: 'POST', signal: arret.signal,
      headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    // deno-lint-ignore no-explicit-any
    const r: any = await res.json().catch(() => null);
    if (!r || r.ok !== true || typeof r.texte !== 'string' || !r.texte.trim()) {
      dis('la reception ne repond pas : le secours part', { motif: String(r?.motif ?? res.status).slice(0, 40) });
      return secours();
    }
    const suite = SUITES_CONNUES.includes(r.suite) ? r.suite : 'rien';
    const lignes = Array.isArray(r.lignes)
      ? (r.lignes as { id?: unknown; titre?: unknown; description?: unknown }[])
        .filter((l) => typeof l?.id === 'string' && typeof l?.titre === 'string')
        .map((l) => ({ id: String(l.id).slice(0, 200), titre: String(l.titre).slice(0, 24), ...(typeof l.description === 'string' ? { description: l.description.slice(0, 72) } : {}) }))
      : [];
    /* « deplacer » (2 novembre 2026) : le rendez-vous qu'elle veut déplacer. */
    const rdvId = suite === 'deplacer' && typeof r.rdvId === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(r.rdvId) ? r.rdvId : '';
    /* `ensuite` : la question de l'accord des nouvelles, à envoyer après le mot. */
    const e = r.ensuite && typeof r.ensuite === 'object' ? r.ensuite : null;
    const ensuite = e && typeof e.texte === 'string' && Array.isArray(e.boutons)
      ? {
        texte: String(e.texte).slice(0, 1000),
        boutons: (e.boutons as { id?: unknown; titre?: unknown }[])
          .filter((b) => typeof b?.id === 'string' && typeof b?.titre === 'string')
          .map((b) => ({ id: String(b.id).slice(0, 60), titre: String(b.titre).slice(0, 20) })).slice(0, 2),
      }
      : null;
    return { texte: r.texte.trim(), suite, ...(lignes.length ? { lignes } : {}), ...(rdvId ? { rdvId } : {}), ...(ensuite ? { ensuite } : {}) };
  } catch (e) {
    dis('la reception ne repond pas : le secours part', { motif: arret.signal.aborted ? 'delai' : String((e as Error)?.message ?? e).slice(0, 60) });
    return secours();
  } finally {
    clearTimeout(minuterie);
  }
}

/* ══ UN NUMÉRO, UN TOUR ════════════════════════════════════════════════ */
/** `deplacer` (2 novembre 2026) : le rendez-vous que le bouton « Changer
    l'heure » d'un message de Perle désigne (le webhook le confie). */
type Appel = { numero: string; tiroir: TiroirDuNumero; waIds: string[]; jeton: string; phoneId: string; deplacer?: string; reprise?: boolean };
type Reponse = { pris: boolean; alerte?: AlerteDeLAutomate };

/** LA CLÉ DU TRI : la même règle que `cleDuTri` (shared/tri-des-messages-pur). */
const cleDuTriWa = (numero: string): string => {
  const d = String(numero ?? '').replace(/\D/g, '');
  return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
};

/** LE TRI DES DÉMARCHEURS : vrai quand le numéro est bloqué ou rangé dans
    les propositions (personne ne lui répond). Rien n'est appelé pour un
    numéro déjà jugé, rendu par la direction, ou qui a une fiche. */
// deno-lint-ignore no-explicit-any
async function estRangeParLeTri(sb: Sb, o: Appel, brut: any): Promise<boolean> {
  const tri = brut && typeof brut === 'object' ? brut : {};
  const k = cleDuTriWa(o.numero);
  if (!k || tri.blancs?.[k] || tri.juges?.[k]) return false;
  if (tri.bloques?.[k] || tri.propositions?.[k]) { dis('tri : deja range'); return true; }
  const fiches = await lesFichesDuNumero(sb, o.numero);
  if (!fiches || fiches.length > 0) return false;
  const { data: lus } = await sb.from('messages_wa').select('data').in('id', o.waIds.map((w) => `wa-${w}`));
  // deno-lint-ignore no-explicit-any
  const siens = ((lus ?? []) as { data: any }[]).map((l) => l.data).filter((x) => x?.sens === 'entrant');
  const textes = siens.map((x) => String(x?.texte ?? '').trim()).filter(Boolean).slice(0, 3);
  if (textes.length === 0) return false;
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const cle = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  if (!base || !cle) return false;
  try {
    const res = await fetch(`${base}/functions/v1/tri-des-messages`, {
      method: 'POST', signal: AbortSignal.timeout(25_000),
      headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
      body: JSON.stringify({ numero: o.numero, textes, nomProfil: siens.find((x) => x?.nomProfil)?.nomProfil ?? '' }),
    });
    // deno-lint-ignore no-explicit-any
    const r: any = await res.json().catch(() => null);
    const verdict = String(r?.verdict ?? '');
    dis('tri', { verdict: verdict || `illisible ${res.status}` });
    return verdict === 'bloque' || verdict === 'proposition';
  } catch (e) {
    dis('tri injoignable : comme avant', { motif: String((e as Error)?.message ?? e).slice(0, 60) });
    return false;
  }
}

/* ══ OPALE RÉPOND · 4 novembre 2026 ═════════════════════════════════════
   « Que ce soit Opale qui gère les conversations du Trône et qu'on remplace
   l'automate » (Yéman). Système › Paramètres › « Qui répond sur WhatsApp »
   (`mnd_opale.qui`) : `opale`, et ce tour remplace celui de l'automate ;
   `automate`, rien ne change. Le bloc ⟨opale⟩ dit la consigne, les outils,
   le contexte et les juges ; ici, la base, l'agenda, Claude et Meta.

   LE TOUR. Les mêmes gardes que l'automate : la main de l'équipe tient,
   personne ne parle ; la main passée par Opale n'est pas rendue, elle se
   tait ; une rafale de messages ne fait qu'un tour (`leTourDuNumero`) ;
   « en train d'écrire », puis l'attente. Puis Claude lit tout, appelle ses
   outils (ils agissent ici, sous les verrous de l'automate), et écrit son
   message. L'état du fil s'écrit À CONDITION (`avance_le_fil`) avant tout
   message : si une personne a pris la main pendant le tour, rien ne part.

   SANS RÉPONSE SÛRE, JAMAIS UN SILENCE : Claude injoignable, un refus, un
   tour trop long, un message que les juges retiennent deux fois, et le mot
   de secours part (la Maison vous répond…), la main passe à l'équipe. */
// deno-lint-ignore no-explicit-any
type ClaudeDOpale = { messages: { create: (corps: Record<string, any>) => Promise<any> } };
let claudeDOpaleGarde: ClaudeDOpale | null = null;
function claudeDOpale(): ClaudeDOpale | null {
  const cle = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();
  if (!cle) return null;
  if (!claudeDOpaleGarde) claudeDOpaleGarde = new Anthropic({ apiKey: cle, timeout: 45_000, maxRetries: 1 }) as unknown as ClaudeDOpale;
  return claudeDOpaleGarde;
}

/** Qui a écrit ce message de la Maison, tel que le fil d'Opale le dit. */
// deno-lint-ignore no-explicit-any
function quiDuMessageWa(d: Record<string, any>): MessageDuFilDOpale['qui'] {
  if (d.sens === 'entrant') return undefined;
  if (d.parQui === OPALE) return 'opale';
  if (typeof d.modele === 'string' && d.modele) return 'automatique';
  if (d.auto === 'automate') return 'automate';
  if (d.auto || ['Le Trône', 'Assistant Maison', 'Gérard', 'la Maison, automatiquement'].includes(String(d.parQui ?? ''))) return 'automatique';
  return 'equipe';
}

/** LE FIL QU'ELLE LIT : 48 heures, trente messages au plus, du plus ancien au plus récent. */
async function leFilDOpale(sb: Sb, numero: string, ms: number): Promise<MessageDuFilDOpale[] | null> {
  const depuis = new Date(ms - FIL_D_OPALE_MS).toISOString();
  const { data, error } = await sb.from('messages_wa').select('data').eq('data->>numero', numero)
    .gte('data->>quand', depuis).order('data->>quand', { ascending: false }).limit(MESSAGES_DU_FIL_D_OPALE);
  if (error) { dis('opale · fil illisible', { motif: error.message.slice(0, 120) }); return null; }
  return ((data ?? []) as Ligne[]).map((l) => l.data ?? {}).filter((d) => (d.sens === 'entrant' || d.sens === 'sortant') && typeof d.quand === 'string')
    .reverse().map((d) => ({
      sens: d.sens as 'entrant' | 'sortant', texte: String(d.texte ?? ''), quand: String(d.quand),
      ...(quiDuMessageWa(d) ? { qui: quiDuMessageWa(d) } : {}), ...(typeof d.type === 'string' ? { type: d.type } : {}),
    }));
}

/** SES RENDEZ-VOUS À VENIR, confirmés ou en attente, pour les fiches du numéro. */
async function lesRdvDOpale(sb: Sb, fiches: readonly FicheDuNumero[], aujourdhui: string): Promise<RdvDOpale[]> {
  const ids = fiches.map((f) => f.id);
  if (ids.length === 0) return [];
  const { data, error } = await sb.from('appointments').select('id, data').in('data->>clientId', ids).gte('data->>date', aujourdhui).limit(30);
  if (error) { dis('opale · rendez-vous illisibles', { motif: error.message.slice(0, 120) }); return []; }
  return ((data ?? []) as Ligne[]).filter((l) => l.data && ['confirmé', 'en attente'].includes(String(l.data.status ?? '')))
    .map((l) => ({
      id: l.id, date: String(l.data!.date), ...(typeof l.data!.time === 'string' && l.data!.time ? { time: String(l.data!.time) } : {}),
      gestes: Array.isArray(l.data!.serviceIds) ? (l.data!.serviceIds as unknown[]).map(String) : [],
      statut: String(l.data!.status), pour: String(l.data!.clientId ?? ''),
    }))
    .sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`)).slice(0, 8);
}

/** LE CATALOGUE DIT À OPALE : ce qui se réserve en ligne, en français d'abord,
    sa durée, et son prix comme le site le dit (un prix, ou de… à… selon les
    locks ou la longueur ; la consultation d'abord pour une création ou une
    réparation). Chaque montant dit entre dans les montants permis. */
function catalogueDOpale(vue: AgendaDuTour, permis: Set<number>): string[] {
  const lignes: string[] = [];
  const longueurs = ['court', 'mi-long', 'long'] as const;
  for (const p of vue.prestations) {
    if (!p.reservable) continue;
    let prix = 'prix à la Maison';
    if (p.consultationAvant) prix = 'la consultation d’abord, puis un devis écrit';
    else if (!p.hidePrice && p.priceMode !== 'devis' && vue.prixDe && (vue.paliers ?? []).length > 0) {
      const vals: number[] = [];
      for (const pa of vue.paliers ?? []) for (const longueur of longueurs) {
        const v = vue.prixDe(p.id, { locks: pa.locks, longueur });
        if (v && v > 0) vals.push(v);
      }
      if (vals.length > 0) {
        for (const v of vals) permis.add(v);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const selon = [p.prixAuxLocks ? 'le nombre de locks' : '', p.prixALaLongueur ? 'la longueur' : ''].filter(Boolean).join(' et ');
        prix = min === max ? `${p.priceMode === 'variable' ? 'à partir de ' : ''}${prixDitWa(min)}` : `de ${prixDitWa(min)} à ${prixDitWa(max)}${selon ? ` selon ${selon}` : ''}`;
      }
    }
    const duree = p.durationMin && p.durationMin > 0 ? dureeDiteWa(p.durationMin) : '';
    lignes.push(`${p.id} · ${gesteDitEnFrancaisWa(p.name)}${duree ? ` · ${duree}` : ''} · ${prix}`);
  }
  return lignes;
}

/** L'OFFRE DU MOMENT, telle que la Maison l'a écrite (son titre, sa phrase,
    ses conditions), seulement celles qui courent aujourd'hui. */
// deno-lint-ignore no-explicit-any
function offresDOpale(brut: any, aujourdhui: string): string[] {
  if (!Array.isArray(brut)) return [];
  // deno-lint-ignore no-explicit-any
  return brut.filter((o: any) => o && o.active && (!o.du || o.du <= aujourdhui) && (!o.au || o.au >= aujourdhui) && o.code)
    // deno-lint-ignore no-explicit-any
    .slice(0, 3).map((o: any) => `${String(o.title ?? '').slice(0, 60)} (code ${String(o.code).slice(0, 20)}) : ${String(o.sub ?? '').slice(0, 160)} ${String(o.conditions ?? '').slice(0, 300)}`.trim());
}

/** LE COMPTE DU MOIS (`mnd_opale_compte`) : appels, jetons, dollars. Une
    tentative ; un compte manqué n'arrête rien. */
// deno-lint-ignore no-explicit-any
async function compteDOpale(sb: Sb, usages: any[], ms: number): Promise<void> {
  if (usages.length === 0) return;
  try {
    const mois = instantACotonou(ms).iso.slice(0, 7);
    const { data } = await sb.from('documents').select('data').eq('key', 'mnd_opale_compte').maybeSingle();
    // deno-lint-ignore no-explicit-any
    const tout = ((data as any)?.data && typeof (data as any).data === 'object' ? (data as any).data : {}) as Record<string, any>;
    const m = tout[mois] ?? { appels: 0, entree: 0, sortie: 0, cacheLu: 0, usd: 0 };
    for (const u of usages) {
      m.appels += 1;
      m.entree += Number(u?.input_tokens ?? 0) || 0;
      m.sortie += Number(u?.output_tokens ?? 0) || 0;
      m.cacheLu += Number(u?.cache_read_input_tokens ?? 0) || 0;
      m.usd = Math.round((Number(m.usd) + coutDOpale(u)) * 10_000) / 10_000;
    }
    await sb.from('documents').upsert({ key: 'mnd_opale_compte', data: { ...tout, [mois]: m }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  } catch (e) {
    dis('opale · compte non ecrit', { motif: String(e).slice(0, 120) });
  }
}

type IssueDOpale = { texte: string; silence: boolean; issue: IssueDuTourDOpale; plan: boolean; alerte?: AlerteDeLAutomate; posee?: string; deplace?: DeplacementAPoser };

async function unTourDOpale(
  // deno-lint-ignore no-explicit-any
  sb: Sb, o: Appel, docs: Map<string, any>, reglage: ReglageDeLAutomate, maison: { nom: string; itineraire: string; carte: string }, essai: number,
): Promise<Reponse | 'rejoue'> {
  const debut = Date.now();
  const ms = debut;

  /* ① L'ÉTAT DU FIL ET LA MAIN DE L'ÉQUIPE. */
  const { data: lignesDuFil, error: errFil } = await sb.from('fils_automate').select('id, data')
    .in('id', [`fil-${o.numero}`, `main-${o.numero}`]);
  if (errFil) { dis('opale · fils_automate illisible', { motif: errFil.message.slice(0, 120) }); return { pris: false }; }
  const brutDuFil = ((lignesDuFil ?? []) as Ligne[]).find((l) => l.id === `fil-${o.numero}`)?.data;
  const fil = etatLuWa(brutDuFil, o.numero, ms);
  const versionLue = Number(brutDuFil?.version ?? 0) || 0;
  const main = (((lignesDuFil ?? []) as Ligne[]).find((l) => l.id === `main-${o.numero}`)?.data ?? null) as MainDuFil | null;
  if (pauseActive(main, ms)) { dis('opale · l equipe a la main'); return { pris: false }; }
  if (fil && etapeCourante(fil, main, ms, reglage.pauseHeures) === 'main' && !o.reprise) { dis('opale · la main est passee, pas encore rendue'); return { pris: false }; }

  /* ② LE TOUR : une rafale, un seul tour ; le bouton « Changer l'heure » de
     Perle fait le sien ; une reprise prend ce qui attend depuis le dernier mot de la Maison. */
  let tour: TourDeLaCliente;
  let entrants: MessageEntrantDuTour[] = [];
  if (o.reprise) {
    entrants = (await litLesEntrants(sb, o.numero, ms - JOUR_WA + TOUR_PERIME_MS)) ?? [];
    const siens = entrants.filter((m) => o.waIds.includes(String(m.waId)));
    tour = tourDeLaCliente(siens, []);
    if (tour.waIds.length === 0) tour = { waIds: o.waIds, quand: siens[siens.length - 1]?.quand ?? new Date(ms).toISOString(), texte: '', media: true };
  } else {
    let lu = await leTourDuNumero(sb, o.numero, o.waIds, fil, ms);
    if (lu === 'pas-a-lui' && o.deplacer) {
      const e = await litLesEntrants(sb, o.numero, ms);
      lu = e ? tourDuBoutonDeDeplacer(e, o.waIds, fil?.traites ?? []) ?? 'pas-a-lui' : null;
    }
    if (lu === null || lu === 'pas-a-lui') return { pris: false };
    if (lu === 'traite' || lu === 'un-autre') { dis('opale · tour laisse a un autre appel', { pourquoi: lu }); return { pris: true }; }
    tour = lu;
    entrants = (await litLesEntrants(sb, o.numero, ms)) ?? [];
  }

  /* ③ LES FICHES, SON PLAFOND. */
  const fiches = await lesFichesDuNumero(sb, o.numero);
  if (!fiches) return { pris: false };
  const depuis24 = new Date(ms - JOUR_WA).toISOString();
  const { count: dits } = await sb.from('messages_wa').select('id', { count: 'exact', head: true })
    .eq('data->>numero', o.numero).eq('data->>parQui', OPALE).gte('data->>quand', depuis24);
  const titulaire = titulaireDuNumero(fiches, instantACotonou(ms).iso) ?? fiches.find((f) => f.parPhone) ?? fiches[0];
  /* LA VOIX DU NUMÉRO (4 novembre 2026) : jamais une fiche d'enfant. Elle
     signe la trace, nomme l'alerte, et Opale parle au parent. Illisible :
     l'adulte seul (`titulaireDuNumero`), sinon personne. */
  const voixDuNumero = await laVoixDuFil(o.numero, fiches.map((f) => f.id), lecteurDeLaVoix(sb), instantACotonou(ms).iso);
  const adulteDuNumero = titulaireDuNumero(fiches, instantACotonou(ms).iso);
  const ficheQuiParle = voixDuNumero ? voixDuNumero.fiche : adulteDuNumero ? { id: adulteDuNumero.id, name: adulteDuNumero.nom } : undefined;
  const prenomPourAlerte = prenomDuNomWa(ficheQuiParle?.name) || '';
  if ((dits ?? 0) >= MESSAGES_D_OPALE_PAR_JOUR) {
    dis('opale · plafond du numero');
    return { pris: false };
  }

  /* ④ « EN TRAIN D'ÉCRIRE », l'attente de la rafale, et l'agenda pendant ce temps. */
  const aujourdhui = instantACotonou(ms).iso;
  const lecture = litLAgenda(sb, docs, titulaire?.branchId, aujourdhui, reglage.horizonJours);
  if (!o.reprise && essai === 0 && tour.waIds.length > 0) {
    await enTrainDEcrire(sb, o.jeton, o.phoneId, tour.waIds[tour.waIds.length - 1]);
    await attends(ATTENTE_DU_TOUR_MS);
    const apres = await leTourDuNumero(sb, o.numero, o.waIds, fil, Date.now());
    if (apres === 'un-autre' || apres === 'traite') { await lecture.catch(() => null); dis('opale · un message plus recent repondra', { pourquoi: apres }); return { pris: true }; }
    if (apres === null || (apres === 'pas-a-lui' && !o.deplacer)) { await lecture.catch(() => null); return { pris: false }; }
  }
  const agenda = await lecture;
  const vue = agenda ? agendaDuTourWa(agenda, ms, reglage.horizonJours) : null;
  const carte = lienMapsWa(agenda?.lignes.branche.data?.mapsUrl, maison.carte);

  /* ⑤ LE CONTEXTE. */
  const filLu = (await leFilDOpale(sb, o.numero, ms)) ?? [];
  const rdvs = await lesRdvDOpale(sb, fiches, aujourdhui);
  const permis = new Set<number>();
  const catalogue = vue ? catalogueDOpale(vue.agenda, permis) : [];
  const connus = new Set((vue?.agenda.prestations ?? []).filter((p) => p.reservable).map((p) => p.id));
  const nomsDesGestes = new Map((vue?.agenda.prestations ?? []).map((p) => [p.id, gesteDitEnFrancaisWa(p.name)]));
  const nomDe = (id: string): string => nomsDesGestes.get(id) ?? 'un geste';
  const semaine = (docs.get('mnd_settings')?.hours ?? []) as HeureDeLaSemaine[];
  const exceptions = (docs.get('mnd_horaires_exceptions') ?? []) as ExceptionDHoraire[];
  const reouverture = prochaineOuvertureDite(ms, Array.isArray(semaine) ? semaine : [], Array.isArray(exceptions) ? exceptions : []);
  const connaitLeLieu = fiches.some((f) => !!f.derniereVenue) || !!fil?.planEnvoyeLe || filLu.some((m) => m.sens === 'sortant' && LIEU_DEJA_DIT.test(m.texte));
  const etatDOpale = ((fil as (EtatDuFil & { opale?: EtatDOpale }) | null)?.opale ?? {}) as EtatDOpale;
  const nouveaux: MessageDuFilDOpale[] = entrants.filter((m) => tour.waIds.includes(String(m.waId)))
    .sort((a, b) => String(a.quand).localeCompare(String(b.quand)))
    .map((m) => ({ sens: 'entrant', texte: m.bouton?.texte ? `[elle touche « ${m.bouton.texte} »] ${m.texte ?? ''}`.trim() : String(m.texte ?? ''), quand: m.quand, ...(m.type ? { type: m.type } : {}) }));
  if (o.deplacer) nouveaux.push({ sens: 'entrant', texte: `[elle a touché « Changer l’heure » pour le rendez-vous [${o.deplacer}]]`, quand: tour.quand });
  const aujourdhuiIso = aujourdhui;
  const fichesDOpale: FicheDOpale[] = fiches.map((f) => ({
    id: f.id,
    appel: f.civilite ? appelDe({ name: f.nom, civilite: f.civilite, auMasculin: f.auMasculin }) : '',
    prenom: prenomDuNomWa(f.nom),
    civiliteConnue: !!f.civilite,
    parPhone: f.parPhone,
    ...(f.parFamille ? { parFamille: true } : {}),
    ...(mineureWa(f.naissance, aujourdhuiIso) ? { mineure: true } : {}),
    ...(voixDuNumero?.muettes.includes(f.id) ? { numeroDuParent: true } : {}),
    ...(f.tete?.locks ? { locks: f.tete.locks } : {}),
    ...(f.tete?.longueur ? { longueur: f.tete.longueur } : {}),
    ...(f.derniereVenue ? { derniereVenue: { date: f.derniereVenue.date, gestes: f.derniereVenue.serviceIds } } : {}),
  }));
  /* QUI ÉCRIT SUR UN NUMÉRO D'ENFANT : le parent qui règle leur compte, sinon
     un parent sans fiche. Le juge refuse le prénom d'un enfant dans le salut. */
  const voixFiche = voixDuNumero?.fiche;
  const parentDOpale: ContexteDOpale['parent'] = voixDuNumero && voixDuNumero.muettes.length > 0 && (!voixFiche || voixDuNumero.payeur)
    ? voixFiche
      ? { ficheId: voixFiche.id, appel: voixFiche.civilite ? appelDe({ name: voixFiche.name, civilite: voixFiche.civilite, auMasculin: voixFiche.auMasculin }) : '', prenom: prenomDuNomWa(voixFiche.name) }
      : { ...(voixDuNumero.nom ? { nom: voixDuNumero.nom } : {}) }
    : undefined;
  const prenomDuParent = prenomDuNomWa(ficheQuiParle?.name);
  const prenomsDesEnfants = [...new Set(fiches.filter((f) => voixDuNumero?.muettes.includes(f.id) || mineureWa(f.naissance, aujourdhuiIso))
    .map((f) => prenomDuNomWa(f.nom)).filter((p) => p && p !== prenomDuParent))];
  const paiements = Array.isArray(docs.get('mnd_payment_methods'))
    ? (docs.get('mnd_payment_methods') as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length < 40).slice(0, 12)
    : [];
  const contexte = contexteDOpale({
    maintenantMs: ms, aujourdhui, heureDuJour: heureDite(`${String(Math.floor(instantACotonou(ms).min / 60)).padStart(2, '0')}:${String(instantACotonou(ms).min % 60).padStart(2, '0')}`),
    reouverture, heures: heuresDites(Array.isArray(semaine) ? semaine : []),
    fiches: fichesDOpale, ...(parentDOpale ? { parent: parentDOpale } : {}), rdvs, connaitLeLieu,
    adresse: String(agenda?.lignes.branche.data?.address ?? '').trim() || ADRESSE_D_OPALE,
    liens: { catalogue: 'https://maisonmnd.com/reserver/?besoin=entretien', creation: 'https://maisonmnd.com/reserver/?besoin=creation', reparation: 'https://maisonmnd.com/reserver/?besoin=reparation' },
    /* AUCUNE OFFRE ANNONCÉE (4 novembre 2026) : « jamais deux remises » et
       MERCREDI15 le jour même seulement (le-trone-67, sur la règle de Yéman) ;
       Opale ne réserve jamais le jour même. La Maison les applique au comptoir. */
    paiements, offres: [], catalogue,
    ...(etatDOpale.enAttente ? { enAttente: etatDOpale.enAttente } : {}),
    fil: filLu, nouveaux, nomDe,
  });

  /* ⑥ LES OUTILS, exécutés ici. Chacun rend des mots à Claude, jamais une
     écriture qu'elle n'a pas demandée. */
  const issue: IssueDOpale = { texte: '', silence: false, issue: { genre: 'parle' }, plan: false };
  let enAttente: EnAttenteDOpale | null | undefined = undefined;
  const premierDuTour = nouveaux[0]?.quand ?? tour.quand;
  const fichesIds = fiches.map((f) => f.id);
  /* LA FENÊTRE DES PLACES (4 novembre 2026) : « je serai là le samedi 28
     novembre » ne se juge pas sur les quatorze jours des listes de
     l'automate. Trente jours d'office, jusqu'au jour qu'elle demande et une
     semaine de plus, quatre-vingt-dix au plus (la fenêtre du site). */
  const joursJusqua = (iso: string): number => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${aujourdhui}T12:00:00Z`)) / JOUR_WA);
  const horizonPour = (jour?: string): number => Math.min(90, Math.max(reglage.horizonJours, 30, jour ? joursJusqua(jour) + 7 : 0));
  const ficheDe = (id: string): FicheDuNumero | undefined => fiches.find((f) => f.id === id);
  // deno-lint-ignore no-explicit-any
  const prixPour = (ids: string[], tete: TeteDuPrix, fixes?: Record<string, number>): { lignes: string[]; total?: number } => {
    const lignes: string[] = [];
    let total = 0;
    let complet = true;
    for (const id of ids) {
      const p = vue?.agenda.prestations.find((x) => x.id === id);
      if (!p) continue;
      const fixe = fixes?.[id];
      if (fixe && fixe > 0) { permis.add(fixe); total += fixe; lignes.push(`${nomDe(id)} : ${prixDitWa(fixe)} (son prix convenu)`); continue; }
      if (p.consultationAvant) { complet = false; lignes.push(`${nomDe(id)} : la consultation d’abord, puis un devis écrit`); continue; }
      if (p.hidePrice || p.priceMode === 'devis' || !vue?.agenda.prixDe) { complet = false; lignes.push(`${nomDe(id)} : prix à la Maison`); continue; }
      if (p.prixAuxLocks && !tete.locks) { complet = false; lignes.push(`${nomDe(id)} : il faut son nombre de locks (approximatif) pour le prix`); continue; }
      if (p.prixALaLongueur && !tete.longueur) { complet = false; lignes.push(`${nomDe(id)} : il faut sa longueur (court, mi-long, long) pour le prix`); continue; }
      const v = vue.agenda.prixDe(id, tete);
      if (!v || v <= 0) { complet = false; lignes.push(`${nomDe(id)} : prix à la Maison`); continue; }
      permis.add(v);
      total += v;
      lignes.push(`${nomDe(id)} : ${p.priceMode === 'variable' ? 'à partir de ' : ''}${prixDitWa(v)}`);
    }
    if (complet && total > 0 && ids.length > 1) permis.add(total);
    return { lignes, ...(complet && total > 0 ? { total } : {}) };
  };
  // deno-lint-ignore no-explicit-any
  const outil = async (nom: string, e: any): Promise<string> => {
    if (!vue || !agenda) {
      if (['chercher_des_places', 'proposer_le_rendez_vous', 'proposer_le_deplacement', 'confirmer', 'prix'].includes(nom)) return 'L’agenda de la Maison ne répond pas en ce moment : passe la main (motif « question »).';
    }
    if (nom === 'chercher_des_places') {
      const g = gestesLus(e?.gestes, connus);
      if (g.ids.length === 0) return 'Aucun de ces gestes ne se réserve ici. Reprends les identifiants du catalogue.';
      let places: readonly PlaceLibre[];
      if (typeof e?.rdv === 'string' && e.rdv) {
        const r = await leRdvADeplacer(sb, { rdvId: e.rdv, fiches, aujourdhui, agenda: agenda!.agenda });
        if (!r) return 'Ce rendez-vous ne se déplace pas ici (il n’est pas à ce numéro, ou il est passé ou clos) : passe la main (motif « question »).';
        places = placesDuMaitreWa(agenda!.agenda, r.maitre, { date: r.date, time: r.time, dureeMin: r.dureeMin }, ms, horizonPour(souhaitLu(e ?? {}).jour));
      } else places = placesLibres(agenda!.agenda, g.ids, ms, horizonPour(souhaitLu(e ?? {}).jour));
      const dites = placesDites(places, souhaitLu(e ?? {}));
      if (dites.length === 0) return `Aucune place libre d’ici ${horizonPour(souhaitLu(e ?? {}).jour)} jours pour ces gestes. Dis-le avec égards et passe la main (motif « question »).`;
      return `Places libres (${g.ids.map(nomDe).join(' et ')}) :\n${dites.map((p) => `- ${p.iso} ${p.heure} : ${placeDite(p)}`).join('\n')}${g.inconnus.length ? `\n(ignorés, inconnus : ${g.inconnus.join(', ')})` : ''}`;
    }
    if (nom === 'prix') {
      const g = gestesLus(e?.gestes, connus);
      if (g.ids.length === 0) return 'Aucun de ces gestes n’est au catalogue.';
      const f = typeof e?.fiche === 'string' ? ficheDe(e.fiche) : undefined;
      const locks = Number(e?.locks) > 0 ? Math.round(Number(e.locks)) : f?.tete?.locks;
      const longueur = e?.longueur === 'court' || e?.longueur === 'mi-long' || e?.longueur === 'long' ? e.longueur : f?.tete?.longueur;
      const r = prixPour(g.ids, { ...(f?.tete ?? {}), ...(locks ? { locks } : {}), ...(longueur ? { longueur } : {}) }, f?.prixFixes);
      return `${r.lignes.join('\n')}${r.total && g.ids.length > 1 ? `\nEnsemble : ${prixDitWa(r.total)}` : ''}`;
    }
    if (nom === 'proposer_le_rendez_vous') {
      const p = propositionLue(e ?? {}, { fiches: fichesIds, connus, aujourdhui });
      if (!p.ok) return p.pourquoi;
      const libre = laPlaceTient(agenda!.agenda, { date: p.date, time: p.heure, serviceIds: p.gestes }, ms).ok;
      if (!libre) {
        const proches = placesDites(placesLibres(agenda!.agenda, p.gestes, ms, horizonPour(p.date)), { jour: p.date, heure: p.heure }, 3);
        return `Cette place n’est pas libre.${proches.length ? ` Les plus proches :\n${proches.map((x) => `- ${x.iso} ${x.heure} : ${placeDite(x)}`).join('\n')}` : ''}`;
      }
      const dureeMin = dureeDesPrestations(p.gestes, agenda!.agenda.services);
      const f = p.pour === 'nouvelle' ? undefined : ficheDe(p.pour);
      const prix = prixPour(p.gestes, f?.tete ?? {}, f?.prixFixes);
      enAttente = { genre: 'pose', pour: p.pour, ...(p.prenom ? { prenom: p.prenom } : {}), ...(p.civilite ? { civilite: p.civilite } : {}), gestes: p.gestes, date: p.date, heure: p.heure, dureeMin, proposeLe: new Date().toISOString() };
      const qui = f ? (f.civilite ? appelDe({ name: f.nom, civilite: f.civilite, auMasculin: f.auMasculin }) : prenomDuNomWa(f.nom)) : appelDe({ name: p.prenom ?? '', civilite: p.civilite });
      return [
        'Place tenue. Écris-lui le récapitulatif, puis demande-lui de confirmer :',
        `- pour : ${qui}`,
        `- gestes : ${p.gestes.map(nomDe).join(' et ')}`,
        `- quand : ${placeDite({ iso: p.date, heure: p.heure })}`,
        `- durée : ${dureeDiteWa(dureeMin)}`,
        `- prix : ${prix.total ? prixDitWa(prix.total) : prix.lignes.join(' ; ') || 'à la Maison'}`,
      ].join('\n');
    }
    if (nom === 'proposer_le_deplacement') {
      const r = typeof e?.rdv === 'string' ? await leRdvADeplacer(sb, { rdvId: e.rdv, fiches, aujourdhui, agenda: agenda!.agenda }) : null;
      if (!r) return 'Ce rendez-vous ne se déplace pas ici (il n’est pas à ce numéro, ou il est passé ou clos) : passe la main (motif « question »).';
      const date = String(e?.date ?? '');
      const heure = String(e?.heure ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure) || date <= aujourdhui) return 'La date ou l’heure est illisible, ou c’est aujourd’hui : propose les jours suivants.';
      const tient = laPlaceTientPourLeMaitreWa(agenda!.agenda, r.maitre, { date, time: heure, dureeMin: r.dureeMin }, { date: r.date, time: r.time }, ms);
      if (!tient.ok) return 'Cette place n’est pas libre pour la personne qui la reçoit. Cherche les places avec le rendez-vous (chercher_des_places, champ « rdv »).';
      enAttente = { genre: 'deplacement', rdvId: r.id, updatedAt: r.updatedAt, maitre: r.maitre, clientId: r.clientId, gestes: r.serviceIds, dureeMin: r.dureeMin, avant: { date: r.date, time: r.time }, date, heure, proposeLe: new Date().toISOString() };
      return `Place tenue. Écris-lui le récapitulatif (de ${placeDite({ iso: r.date, heure: r.time })} à ${placeDite({ iso: date, heure })}, ${r.serviceIds.map(nomDe).join(' et ')}), puis demande-lui de confirmer.`;
    }
    if (nom === 'confirmer') {
      const attente = enAttente ?? etatDOpale.enAttente;
      const permisDe = confirmationPermise(attente ?? undefined, premierDuTour, ms);
      if (!permisDe.ok) return permisDe.pourquoi;
      const a = attente!;
      if (a.genre === 'pose') {
        const f = a.pour === 'nouvelle' ? undefined : ficheDe(a.pour);
        const cle = cleCourte(`${tour.waIds[tour.waIds.length - 1] ?? ''}|${a.date}|${a.heure}`);
        const rdvId = `rdv-wa-${cle}`;
        const maintenant = new Date().toISOString();
        const appelDuRdv = f ? (f.civilite ? appelDe({ name: f.nom, civilite: f.civilite, auMasculin: f.auMasculin }) : prenomDuNomWa(f.nom)) : appelDe({ name: a.prenom ?? '', civilite: a.civilite });
        const ecriture: EcritureDuTour = {
          genre: 'pose',
          rdv: {
            id: rdvId, branchId: agenda!.agenda.branchId, clientId: f?.id ?? '', clientName: f?.nom || a.prenom || 'Réservation WhatsApp',
            serviceIds: [...a.gestes], date: a.date, time: a.heure, dureeMin: a.dureeMin, status: 'confirmé', source: 'whatsapp',
            creeLe: maintenant, note: 'Pris sur WhatsApp · Opale', poseePar: OPALE,
          } as RdvAPoser,
          ...(f ? {} : {
            demande: {
              id: `dem-wa-${cle}`, genre: 'rdv', createdAt: maintenant, branchId: agenda!.agenda.branchId, prenom: a.prenom ?? '',
              civilite: a.civilite ?? 'madame', telephone: `+${o.numero}`, besoin: 'entretien', source: 'whatsapp',
              serviceIds: [...a.gestes], date: a.date, time: a.heure, apptId: rdvId, consentementLe: tour.quand || maintenant, statut: 'nouvelle',
            } as DemandeAPoser,
          }),
          envoi: {
            id: `conf-${rdvId}-whatsapp`, branchId: agenda!.agenda.branchId, type: 'confirmation', canal: 'whatsapp', apptId: rdvId,
            ...(f ? { clientId: f.id } : {}), prenom: appelDuRdv, numero: `+${o.numero}`, dateRdv: a.date, heure: a.heure,
            moment: placeDite({ iso: a.date, heure: a.heure }), statut: 'en cours', detail: 'dit dans la conversation, par Opale', quand: maintenant,
          } as EnvoiAPoser,
        };
        const verdict = await poseSousVerrou(sb, agenda!, ecriture, vue!.oublie);
        dis('opale · pose', { verdict: verdict.ok ? (verdict.verdict ?? 'pose') : verdict.raison });
        if (verdict.ok) {
          issue.issue = { genre: 'pose', rdvId: verdict.id };
          issue.posee = verdict.id;
          issue.alerte = alerteDeLAutomate({ genre: 'pose', prenom: prenomDuNomWa(f?.nom) || a.prenom || prenomPourAlerte, numero: o.numero, date: a.date, time: a.heure });
          enAttente = null;
          return `C’est posé : ${a.gestes.map(nomDe).join(' et ')}, ${placeDite({ iso: a.date, heure: a.heure })}. Confirme-le-lui en une ou deux phrases (le jour avec l’année, l’heure). Aucun autre message de confirmation ne partira.`;
        }
        enAttente = null;
        if (['creneau_pris', 'creneau_plafond', 'creneau_complet', 'creneau_hors_ouverture', 'creneau_ferme'].includes(verdict.raison)) {
          const proches = placesDites(placesLibres(agenda!.agenda, a.gestes, ms, horizonPour(a.date)), { jour: a.date, heure: a.heure }, 3);
          return `Cette place vient d’être prise.${proches.length ? ` Propose-lui les plus proches :\n${proches.map((x) => `- ${x.iso} ${x.heure} : ${placeDite(x)}`).join('\n')}` : ' Passe la main (motif « question »).'}`;
        }
        return 'Le rendez-vous n’a pas pu être posé. Passe la main (motif « question »).';
      }
      const d: DeplacementAPoser = {
        rdvId: a.rdvId, updatedAt: a.updatedAt, branchId: agenda!.agenda.branchId, clientId: a.clientId, maitre: a.maitre,
        serviceIds: a.gestes, dureeMin: a.dureeMin, avant: a.avant, date: a.date, time: a.heure,
        prenom: prenomDuNomWa(ficheDe(a.clientId)?.nom) || prenomPourAlerte, numero: o.numero,
      };
      const verdict = await deplaceSousVerrou(sb, agenda!, d, vue!.oublie, Date.now(), OPALE);
      dis('opale · deplacement', { verdict: verdict.ok ? verdict.verdict : verdict.raison });
      enAttente = null;
      if (verdict.ok) {
        issue.issue = { genre: 'deplace', rdvId: a.rdvId };
        issue.deplace = d;
        issue.alerte = alerteDeLAutomate({ genre: 'deplace', prenom: d.prenom, numero: o.numero, date: a.date, time: a.heure });
        return `C’est fait. Dis-lui seulement que son rendez-vous est confirmé pour le ${placeDite({ iso: a.date, heure: a.heure })}, en une ou deux phrases ; jamais « déplacé ».`;
      }
      return verdict.raison === 'creneau_pris' || verdict.raison === 'creneau_plafond'
        ? 'Cette place vient d’être prise. Cherche à nouveau les places (chercher_des_places, champ « rdv »).'
        : 'Le rendez-vous n’a pas pu être déplacé (il a changé entre-temps). Passe la main (motif « question »).';
    }
    if (nom === 'envoyer_le_plan') {
      const demande = demandeLeCheminWa(nouveaux.map((m) => m.texte).join(' '));
      if (connaitLeLieu && !demande) return 'Elle connaît déjà la Maison : le plan ne part pas. Ne le promets pas.';
      issue.plan = true;
      return 'Le plan et la Maison sur Google Maps partent juste après ton message. Ne les décris pas.';
    }
    if (nom === 'passer_la_main') {
      const motif = motifDOpale(e?.motif) ?? 'question';
      issue.issue = { genre: 'main', motif: motifDuFilDOpale(motif) };
      issue.alerte = alerteDeLAutomate({ genre: 'main', prenom: prenomPourAlerte, numero: o.numero, motif: motifDuFilDOpale(motif) });
      return `La main passe à l’équipe. Écris un message bref : une personne de la Maison lui répond ici${reouverture ? `, ${reouverture}` : ', dans un instant'}.`;
    }
    if (nom === 'ne_rien_repondre') {
      issue.silence = true;
      return 'Aucun message ne part. N’écris rien.';
    }
    return 'Outil inconnu.';
  };

  /* ⑦ CLAUDE, ses outils, puis son message. */
  const claude = claudeDOpale();
  const usages: unknown[] = [];
  const questionFranche = estUneQuestionFrancheDOpale(nouveaux.map((m) => m.texte).join(' '));
  let secours = !claude;
  if (claude) {
    // deno-lint-ignore no-explicit-any
    const messages: any[] = [{ role: 'user', content: contexte }];
    let relu = false;
    try {
      for (let i = 0; i <= TOURS_D_OUTILS_AU_PLUS + 1; i += 1) {
        if (Date.now() - debut > DUREE_D_UN_TOUR_D_OPALE_MS || i > TOURS_D_OUTILS_AU_PLUS) { dis('opale · tour trop long'); secours = true; break; }
        const r = await claude.messages.create({
          model: MODELE_D_OPALE, max_tokens: 4000,
          system: [{ type: 'text', text: consigneDOpale(), cache_control: { type: 'ephemeral' } }],
          tools: OUTILS_D_OPALE, messages,
        });
        usages.push(r?.usage);
        if (r?.stop_reason === 'refusal') { dis('opale · refus du modele'); secours = true; break; }
        // deno-lint-ignore no-explicit-any
        const appels = ((r?.content ?? []) as any[]).filter((b) => b?.type === 'tool_use');
        if (r?.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: r.content }); continue; }
        if (appels.length > 0 && r?.stop_reason === 'tool_use') {
          messages.push({ role: 'assistant', content: r.content });
          const resultats = [];
          for (const a of appels) {
            const texte = estUnOutilDOpale(a.name) ? await outil(a.name, a.input) : 'Outil inconnu.';
            resultats.push({ type: 'tool_result', tool_use_id: a.id, content: texte });
          }
          messages.push({ role: 'user', content: resultats });
          continue;
        }
        // deno-lint-ignore no-explicit-any
        const texte = ((r?.content ?? []) as any[]).filter((b) => b?.type === 'text').map((b) => String(b.text ?? '')).join('\n').trim();
        if (issue.silence) break;
        const fautes = fautesDOpale(texte, { montantsPermis: permis, questionFranche, enfants: prenomsDesEnfants });
        if (fautes.length === 0) { issue.texte = texte; break; }
        dis('opale · message retenu par les juges', { fautes: fautes.length, relu });
        if (relu) { secours = true; break; }
        relu = true;
        messages.push({ role: 'assistant', content: r.content });
        messages.push({ role: 'user', content: `Ce message ne peut pas partir : ${fautes.join(' ; ')}. Réécris-le, sans rien d’autre que le message.` });
      }
    } catch (e) {
      dis('opale · claude injoignable', { motif: String((e as Error)?.message ?? e).slice(0, 120) });
      secours = true;
    }
  }
  await compteDOpale(sb, usages, ms);
  if (secours && !issue.silence) {
    const s = secoursDeLaReception(ms, Array.isArray(semaine) ? semaine : [], Array.isArray(exceptions) ? exceptions : []);
    /* Un rendez-vous déjà posé ou déplacé reste : seul son mot manque, le
       secours le dit, et la confirmation officielle prend le relais. */
    issue.texte = s.texte;
    issue.plan = false;
    if (issue.issue.genre !== 'pose' && issue.issue.genre !== 'deplace') {
      issue.issue = { genre: 'main', motif: 'erreur' };
      issue.alerte = alerteDeLAutomate({ genre: 'main', prenom: prenomPourAlerte, numero: o.numero, motif: 'erreur' });
    }
  }
  if (!issue.silence && !issue.texte.trim()) {
    issue.texte = secoursDeLaReception(ms, Array.isArray(semaine) ? semaine : [], Array.isArray(exceptions) ? exceptions : []).texte;
    if (issue.issue.genre === 'parle') {
      issue.issue = { genre: 'main', motif: 'erreur' };
      issue.alerte = alerteDeLAutomate({ genre: 'main', prenom: prenomPourAlerte, numero: o.numero, motif: 'erreur' });
    }
  }
  if (issue.issue.genre === 'parle' && enAttente !== undefined) issue.issue = { genre: 'parle', enAttente };

  /* ⑧ LES MESSAGES, et l'état du fil, À CONDITION, avant qu'ils partent. */
  const sortants: MessageSortant[] = [];
  if (!issue.silence) sortants.push({ forme: 'texte', etape: issue.issue.genre === 'main' ? 'main' : issue.issue.genre === 'parle' ? 'besoin' : 'confirme', corps: issue.texte.trim() });
  if (!issue.silence && issue.plan) {
    const lien = ligneGoogleMapsWa(carte);
    sortants.push({ forme: 'image', etape: 'besoin', corps: '', image: PLAN_POUR_VENIR, accessoire: true });
    if (lien) sortants.push({ forme: 'texte', etape: 'besoin', corps: lien, accessoire: true });
  }
  const base = fil ?? etatNeufDuFil(o.numero, new Date(ms).toISOString());
  const etat = etatApresOpale({ ...base, version: versionLue }, {
    issue: issue.issue, waIds: tour.waIds, dernierEntrantQuand: tour.quand, envois: sortants.length, planEnvoye: issue.plan, maintenantMs: Date.now(),
  });
  const branchId = agenda?.agenda.branchId ?? titulaire?.branchId ?? null;
  const { data: version, error: errAvance } = await sb.rpc('avance_le_fil', {
    p_numero: o.numero, p_version: versionLue, p_data: etat, p_branch: branchId,
  });
  if (errAvance || typeof version !== 'number') {
    if (errAvance) dis('opale · avance_le_fil refuse', { motif: errAvance.message.slice(0, 120) });
    const tient = errAvance ? true : await laMainTient(sb, o.numero);
    if (!tient && essai === 0 && !issue.posee && !issue.deplace) { dis('opale · le fil a bouge pendant le tour : on rejoue'); return 'rejoue'; }
    dis('opale · le tour se tait', { pourquoi: errAvance ? 'ecriture refusee' : tient ? 'main de l equipe' : 'fil en mouvement', pose: !!issue.posee });
    if (issue.posee) {
      await ditLaConfirmation(sb, issue.posee, { detail: 'la conversation a change de main pendant la pose : le modele de confirmation prend le relais' });
      if (!tient) await rattacheLaPose(sb, o.numero, issue.posee, branchId);
      return { pris: true, ...(issue.alerte ? { alerte: issue.alerte } : {}) };
    }
    if (issue.deplace) {
      await ditLeDeplacementAuxEnvois(sb, issue.deplace, { detail: 'la conversation a change de main pendant le deplacement' }, branchId);
      return { pris: true, ...(issue.alerte ? { alerte: issue.alerte } : {}) };
    }
    return { pris: false };
  }

  /* ⑨ À META, puis la trace, signée Opale. */
  /* La trace porte la voix du numéro : l'adulte, le payeur, ou personne (4 novembre 2026). */
  const clientIdDuFil = ficheQuiParle?.id;
  let refus: MotifDeLaMain | null = null;
  let premier: Rendu | null = null;
  for (const m of sortants) {
    const fautes = respecteMeta(m);
    if (fautes.length > 0) { dis('opale · message retenu par Meta d avance', { fautes: fautes.length }); refus = 'erreur'; break; }
    const rendu = await envoieAGraph(o.jeton, o.phoneId, chargeGraph(m, o.numero));
    await laisseLaTrace(sb, { numero: o.numero, m, rendu, parQui: OPALE, ...(branchId ? { branchId } : {}), ...(clientIdDuFil ? { clientId: clientIdDuFil } : {}) });
    if (!premier) premier = rendu;
    if (!rendu.waId && m.accessoire) continue;
    if (!rendu.waId) { dis('opale · Meta refuse le message', { code: rendu.code ?? null }); refus = 'envoi-refuse'; break; }
  }
  if (issue.posee) await ditLaConfirmation(sb, issue.posee, premier ?? { detail: 'la confirmation n est pas partie dans la conversation' });
  if (issue.deplace) await ditLeDeplacementAuxEnvois(sb, issue.deplace, premier ?? { detail: 'le deplacement n est pas dit dans la conversation' }, branchId);
  let alerte = issue.alerte;
  if (refus) {
    const apres = etatApresOpale({ ...etat, version }, { issue: { genre: 'main', motif: refus }, waIds: [], envois: 0, planEnvoye: false, maintenantMs: Date.now() });
    const { data: v2, error: e2 } = await sb.rpc('avance_le_fil', { p_numero: o.numero, p_version: version, p_data: apres, p_branch: branchId });
    if (e2 || typeof v2 !== 'number') { dis('opale · la main n a pas pu passer apres le refus'); return { pris: false }; }
    alerte = alerteDeLAutomate({ genre: 'main', prenom: prenomPourAlerte, numero: o.numero, motif: refus });
  }
  dis('opale · tour', {
    issue: refus ? 'main' : issue.issue.genre, messages: sortants.length, silence: issue.silence, secours, appels: usages.length, ms: Date.now() - debut,
  });
  return { pris: true, ...(alerte ? { alerte } : {}) };
}

/** LA REPRISE PAR OPALE : « Rendre à Opale » au Trône. Ce qu'elle a écrit
    depuis le dernier mot de la Maison, dans la fenêtre de 24 heures, fait un
    tour ; rien n'attend, elle tient le fil sans un mot. */
async function reprendAvecOpale(
  // deno-lint-ignore no-explicit-any
  sb: Sb, o: { numero: string; tiroir: TiroirDuNumero; jeton: string; phoneId: string }, docs: Map<string, any>, reglage: ReglageDeLAutomate,
): Promise<{ repris: boolean; raison?: string; etape?: string }> {
  const ms = Date.now();
  const { data, error } = await sb.from('messages_wa').select('data').eq('data->>numero', o.numero)
    .gte('data->>quand', new Date(ms - JOUR_WA).toISOString()).order('data->>quand', { ascending: false }).limit(20);
  if (error) return { repris: false, raison: 'messages illisibles' };
  const recents = ((data ?? []) as Ligne[]).map((l) => l.data ?? {});
  const attente: string[] = [];
  /* Le mot qui passait la main (« une personne de la Maison vous répond »,
     d'Opale ou de l'automate) n'a rien répondu (4 novembre 2026, M. R. :
     rendue à Opale, elle ne voyait rien qui attende). */
  for (const d of recents) {
    if (d.sens === 'sortant' && d.etat !== 'non-remis' && d.etape !== 'main') break;
    if (d.sens === 'entrant' && d.waId) attente.unshift(String(d.waId));
  }
  if (attente.length === 0) return { repris: true, etape: 'besoin' };
  const cfg = docs.get('mnd_auto_config') ?? {};
  const maison = {
    nom: String(docs.get('mnd_house_identity')?.nom ?? '').trim() || 'Maison MND',
    itineraire: typeof cfg?.itineraire === 'string' ? cfg.itineraire : '',
    carte: typeof cfg?.mapsLink === 'string' ? cfg.mapsLink : '',
  };
  const r = await unTourDOpale(sb, { ...o, waIds: attente, reprise: true }, docs, reglage, maison, 1);
  if (r === 'rejoue') return { repris: false, raison: 'fil en mouvement' };
  return r.pris ? { repris: true, etape: 'besoin' } : { repris: false, raison: 'rien a reprendre' };
}

async function servirLeNumero(sb: Sb, o: Appel): Promise<Reponse> {
  const docs = await litLesDocuments(sb);
  if (!docs) return { pris: false };
  /* ⓪ LE TRI DES DÉMARCHEURS (29 octobre 2026, maquette Re299vtp… validée),
     AVANT l'interrupteur : un numéro inconnu est jugé même quand l'automate
     ne le sert pas. Bloqué ou rangé dans les propositions, personne ne lui
     répond. La fonction `tri-des-messages` injoignable : comme avant. */
  if (o.tiroir === 'clientes' && await estRangeParLeTri(sb, o, docs.get('mnd_tri_des_messages'))) return { pris: true };
  const cfg = docs.get('mnd_auto_config') ?? {};
  const reglage = reglageDeLAutomate(cfg?.automateWa);
  /* ⓪ bis QUI RÉPOND (4 novembre 2026) : Opale, et son tour remplace celui
     de l'automate ; elle sert toutes les clientes, et l'équipe pour ses
     numéros d'essai. L'automate reste en réserve (`mnd_opale.qui`). */
  if (reglageDOpale(docs.get(CLE_D_OPALE)).qui === 'opale') {
    if (!opaleSert({ tiroir: o.tiroir, numero: o.numero, numerosEssai: reglage.numerosEssai, cle: cleWa })) {
      dis('opale · numero non servi', { tiroir: o.tiroir });
      return { pris: false };
    }
    if (!o.jeton || !o.phoneId) { dis('cles Meta absentes : la Maison repond elle-meme'); return { pris: false }; }
    const maisonDOpale = {
      nom: String(docs.get('mnd_house_identity')?.nom ?? '').trim() || 'Maison MND',
      itineraire: typeof cfg?.itineraire === 'string' ? cfg.itineraire : '',
      carte: typeof cfg?.mapsLink === 'string' ? cfg.mapsLink : '',
    };
    for (let essai = 0; essai < 2; essai += 1) {
      const r = await unTourDOpale(sb, o, docs, reglage, maisonDOpale, essai);
      if (r !== 'rejoue') return r;
    }
    dis('opale · le fil a bouge deux fois pendant le tour : la Maison repond elle-meme');
    return { pris: false };
  }
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

  /* ③ LE TOUR. Le bouton « Changer l'heure » de Perle (2 novembre 2026)
     n'est pas un choix de l'automate : le tour ordinaire l'écarte. Confié avec
     `deplacer`, il fait son propre tour, AVANT le garde du tour vide. */
  let lu = await leTourDuNumero(sb, o.numero, o.waIds, fil, ms);
  if (lu === 'pas-a-lui' && o.deplacer) {
    const entrants = await litLesEntrants(sb, o.numero, ms);
    lu = entrants ? tourDuBoutonDeDeplacer(entrants, o.waIds, fil?.traites ?? []) ?? 'pas-a-lui' : null;
  }
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
  /* Le déplacement demandé par le bouton : le tour se lit comme une demande
     de déplacer, même en plein parcours. */
  let rdvDemande: string | null = o.deplacer ?? null;
  let juge = jugeLaParole(fil, rdvDemande ? tourPourDeplacer(tour) : tour, ctxLeger);

  /* ⑤ bis LA RÉCEPTION (27 octobre 2026). Le juge se tait, mais ce n'est
     pas un silence voulu (`laReceptionPeutParler`) : « en train d'écrire »,
     l'attente de la rafale, puis la fonction `reception-wa` fait répondre
     Claude et dit la suite. Un rendez-vous, une création, une réparation :
     son mot précède la liste du parcours, qui prend la main. Le reste part
     seul (« clos »), ou passe la main à l'équipe. Sans réponse d'elle, son
     mot de secours : jamais un silence. */
  let tourDuParcours = rdvDemande ? tourPourDeplacer(tour) : tour;
  let reception: ReponseDeLaReception | null = null;
  let dejaEcrit = false;
  if (juge.parole === 'silence') {
    if (!laReceptionPeutParler(fil, tour, ctxLeger, reglageDeLaReception(docs.get(CLE_DE_LA_RECEPTION)))) return { pris: false };
    /* Un « Ok » après un mot sans question : rien à répondre (31 octobre 2026). */
    if (unMerciSansSuite(tour, await leDernierMotDeLaMaison(sb, o.numero))) { dis('un merci sans question : rien a repondre'); return { pris: false }; }
    if (essai === 0) {
      await enTrainDEcrire(sb, o.jeton, o.phoneId, tour.waIds[tour.waIds.length - 1]);
      await attends(ATTENTE_DU_TOUR_MS);
      const apres = await leTourDuNumero(sb, o.numero, o.waIds, fil, Date.now());
      if (apres === 'un-autre' || apres === 'traite') { dis('un message plus recent repondra', { pourquoi: apres }); return { pris: true }; }
      if (apres === null || apres === 'pas-a-lui') return { pris: false };
      dejaEcrit = true;
    }
    reception = await demandeALaReception(o, { tour, fiches, docs, ms });
    if (SUITES_DU_PARCOURS.includes(reception.suite)) {
      /* « deplacer » (2 novembre 2026) : les places du rendez-vous qu'elle a. */
      if (reception.suite === 'deplacer') rdvDemande = reception.rdvId ?? null;
      tourDuParcours = reception.suite === 'deplacer' ? tourPourDeplacer(tour, true) : tourPourLeParcours(tour);
      juge = jugeLaParole(fil, tourDuParcours, ctxLeger);
      if (juge.parole === 'silence') reception = { texte: reception.texte, suite: 'rien' };
    }
  }
  const direct = !!reception && !SUITES_DU_PARCOURS.includes(reception.suite);

  /* ⑥ ⑦ « EN TRAIN D'ÉCRIRE », l'attente, et l'agenda pendant ce temps. */
  const aujourdhui = instantACotonou(ms).iso;
  let agenda: AgendaLu | null = null;
  if (juge.parole === 'parle' && !direct) {
    const titulaire = fiches.find((f) => f.parPhone) ?? fiches[0];
    const lecture = litLAgenda(sb, docs, titulaire?.branchId, aujourdhui, reglage.horizonJours);
    if (essai === 0 && !dejaEcrit) {
      await enTrainDEcrire(sb, o.jeton, o.phoneId, tour.waIds[tour.waIds.length - 1]);
      await attends(ATTENTE_DU_TOUR_MS);
      const apres = await leTourDuNumero(sb, o.numero, o.waIds, fil, Date.now());
      if (apres === 'un-autre' || apres === 'traite') {
        await lecture.catch(() => null);
        dis('un message plus recent repondra', { pourquoi: apres });
        return { pris: true };
      }
      /* Le bouton de Perle confié avec `deplacer` n'est jamais un tour
         ordinaire : relu, il reste « pas à lui », et c'est le sien. */
      if (apres === null || (apres === 'pas-a-lui' && !o.deplacer)) { await lecture.catch(() => null); return { pris: false }; }
    }
    agenda = await lecture;
  }

  /* ⑧ LE TOUR, puis la pose s'il y en a une. */
  const vue = agenda ? agendaDuTourWa(agenda, ms, reglage.horizonJours) : null;
  /* Le lien Google Maps de la branche du tour, sinon celui des Paramètres (13 octobre 2026). */
  const carte = lienMapsWa(agenda?.lignes.branche.data?.mapsUrl, maison.carte);
  /* LE RENDEZ-VOUS À DÉPLACER (2 novembre 2026), lu frais quand elle demande
     une autre heure : celui que le bouton ou la réception désigne, sinon le
     prochain de sa fiche. */
  const aDeplacer = agenda && (rdvDemande || motsReconnus(tourDuParcours.texte, ms).deplacer)
    ? await leRdvADeplacer(sb, { rdvId: rdvDemande, fiches, aujourdhui, agenda: agenda.agenda })
    : null;
  const ctx: ContexteDuTour = {
    ...ctxLeger, maison: { ...maison, carte }, ...(vue ? { agenda: vue.agenda } : {}),
    /* Les prix du catalogue du jour, pour les jetons du conseil. */
    ...(agenda ? { prix: prixDuCatalogue(agenda.lignes.services) } : {}),
    ...(aDeplacer ? { deplacement: aDeplacer } : {}),
    ...(rdvDemande ? { deplacerDemande: true } : {}),
  };
  let sortie = direct ? reponseDeLaReception(fil, tour, ctx, reception!) : etapeSuivante(fil, tourDuParcours, ctx);
  if (!sortie.pris) return { pris: false };
  /* Les juges de la Maison passent AVANT l'écriture pour la réception : un
     mot refusé ne laisse jamais la cliente sans réponse, le secours part. */
  const juge2 = (m: MessageSortant): string[] => [...respecteMeta(m), ...texteSain(toutLeTexteWa(m), m.prixDuCatalogue === true)];
  const hours = (docs.get('mnd_settings')?.hours ?? []) as HeureDeLaSemaine[];
  const fermetures = (docs.get('mnd_horaires_exceptions') ?? []) as ExceptionDHoraire[];
  if (direct && sortie.messages.some((m) => juge2(m).length > 0)) {
    dis('reponse de la reception retenue par les juges : le secours part');
    sortie = reponseDeLaReception(fil, tour, ctx, secoursDeLaReception(ms, Array.isArray(hours) ? hours : [], Array.isArray(fermetures) ? fermetures : []));
  }
  if (reception && !direct) {
    const preface = prefaceDeLaReception(reception.texte, sortie.messages[0]?.etape ?? 'besoin');
    if (juge2(preface).length === 0) {
      sortie = { ...sortie, messages: [preface, ...sortie.messages] };
      sortie.etat.envois.push(isoWa(ms));
    }
  }
  /* LA PLACE TOUCHÉE D'UN DÉPLACEMENT (2 novembre 2026) : le verrou, puis son verdict dit. */
  let deplace: DeplacementAPoser | null = null;
  if (sortie.deplacement) {
    const d = sortie.deplacement;
    const verdict: VerdictDuDeplacement = agenda && vue
      ? await deplaceSousVerrou(sb, agenda, d, vue.oublie, Date.now())
      : { ok: false, raison: 'agenda_illisible' };
    sortie = suiteDuDeplacement(sortie.etat, verdict, ctx);
    if (verdict.ok) deplace = d;
    dis('deplacement', { verdict: verdict.ok ? verdict.verdict : verdict.raison });
  }
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
    if (!tient && essai === 0 && !posee && !deplace) { dis('le fil a bouge pendant le tour : on rejoue'); return 'rejoue'; }
    dis('le tour se tait', { pourquoi: errAvance ? 'ecriture refusee' : tient ? 'main de l equipe' : 'fil en mouvement', pose: !!posee });
    /* UN RENDEZ-VOUS POSÉ N'ATTEND PAS : sans la confirmation dans la
       conversation, la ligne passe à « échec » et le modèle de
       confirmation-rdv prend le relais ; l'équipe est prévenue. */
    if (posee) {
      await ditLaConfirmation(sb, posee, { detail: 'la conversation a change de main pendant la pose : le modele de confirmation prend le relais' });
      if (!tient) await rattacheLaPose(sb, o.numero, posee, branchId);
      return { pris: true, ...(sortie.alerte ? { alerte: sortie.alerte } : {}) };
    }
    /* UN RENDEZ-VOUS DÉPLACÉ NE SE REJOUE PAS NON PLUS : il est à sa nouvelle
       place ; l'équipe est prévenue, et la ligne des envois dit l'échec. */
    if (deplace) {
      await ditLeDeplacementAuxEnvois(sb, deplace, { detail: 'la conversation a change de main pendant le deplacement' }, branchId);
      return { pris: true, ...(sortie.alerte ? { alerte: sortie.alerte } : {}) };
    }
    return { pris: false };
  }

  /* ⑩ LE MESSAGE, à Graph, puis sa trace. Les juges de la Maison passent
     d'abord : un message qu'elle n'écrirait pas ne part pas. */
  const clientIdDuFil = await ficheDeLaTrace(sb, o.numero, fiches, sortie.etat.panier.clientId, ms);
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
    /* La confirmation, c'est la première bulle : le plan et le lien qui la
       suivent ne la remplacent pas (29 octobre 2026). */
    if (m.etape === 'confirme' && !laConfirmation) laConfirmation = rendu;
    if (!rendu.waId && m.accessoire) {
      dis('Meta refuse un message qui accompagne', { etape: m.etape, forme: m.forme, code: rendu.code ?? null });
      continue;
    }
    if (!rendu.waId) {
      dis('Meta refuse le message', { etape: m.etape, code: rendu.code ?? null });
      refus = 'envoi-refuse';
      break;
    }
  }
  if (posee) await ditLaConfirmation(sb, posee, laConfirmation ?? { detail: 'la confirmation n est pas partie dans la conversation' });
  if (deplace) await ditLeDeplacementAuxEnvois(sb, deplace, laConfirmation ?? { detail: 'le deplacement n est pas dit dans la conversation' }, branchId);

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
  const avecOpale = reglageDOpale(docs.get(CLE_D_OPALE)).qui === 'opale';
  if (avecOpale ? !opaleSert({ tiroir: o.tiroir, numero: o.numero, numerosEssai: reglage.numerosEssai, cle: cleWa }) : !numeroServi(reglage, o.numero, o.tiroir)) return { repris: false, raison: 'numero non servi' };
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
  /* Rendue à Opale : ce qui attend fait son tour (4 novembre 2026). */
  if (avecOpale) return reprendAvecOpale(sb, o, docs, reglage);

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

  const clientId = await ficheDeLaTrace(sb, o.numero, fiches, sortie.etat.panier.clientId, ms);
  for (const m of sortie.messages) {
    if ([...respecteMeta(m), ...texteSain(toutLeTexteWa(m), m.prixDuCatalogue === true)].length > 0) return { repris: false, raison: 'message retenu par les juges' };
    const rendu = await envoieAGraph(o.jeton, o.phoneId, chargeGraph(m, o.numero));
    await laisseLaTrace(sb, { numero: o.numero, m, rendu, ...(branchId ? { branchId } : {}), ...(clientId ? { clientId } : {}) });
    if (!rendu.waId && m.accessoire) continue;
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
    /* LE BOUTON « CHANGER L'HEURE » DE PERLE (2 novembre 2026) : le webhook
       confie le rendez-vous qu'il désigne. */
    const brutDeplacer = corps.deplacer && typeof corps.deplacer === 'object' ? String(corps.deplacer.rdvId ?? '') : '';
    const deplacer = /^[A-Za-z0-9_.:-]{1,120}$/.test(brutDeplacer) ? brutDeplacer : '';
    const r = await servirLeNumero(sb, {
      numero, tiroir, waIds,
      jeton: (Deno.env.get('WA_TOKEN') ?? '').trim(),
      phoneId: (Deno.env.get('WA_PHONE_ID') ?? '').trim(),
      ...(deplacer ? { deplacer } : {}),
    });
    return json({ pris: r.pris, ...(r.alerte ? { alerte: r.alerte } : {}), version: VERSION });
  } catch (e) {
    /* AU MOINDRE DOUTE, LA MAISON RÉPOND ELLE-MÊME : `pris: false`, le
       webhook prévient l'équipe comme d'habitude. */
    dis('echec du tour', { motif: String(e).slice(0, 160) });
    return json({ pris: false, version: VERSION });
  }
});
