// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function — demande-submit
//
// LA SEULE PORTE PAR LAQUELLE LE SITE PUBLIC DÉPOSE UNE DEMANDE — 17 septembre 2026.
//
// Le site révélateur ne connaît personne : une visiteuse laisse un prénom et
// un numéro, sans compte. La relecture de l'audit a fixé la règle : plus
// aucun dépôt anonyme direct en base (0106 avait rouvert ce que 0007 avait
// fermé). Cette fonction, avec le service role :
//   1. applique la limite de débit de 0007 (`edge_rate_limits`, par IP) ;
//   2. normalise le téléphone en E.164 et refuse ce qui n'en est pas un ;
//   3. refuse un doublon (même numéro, même place, ou même besoin dans les
//      24 h) en renvoyant l'identifiant déjà connu, sans rien réécrire ;
//   4. génère l'identifiant elle-même, résout la branche dans `branches`
//      (la Maison phare par défaut : jamais un identifiant écrit en dur) ;
//   5. écrit la ligne dans `demandes`, puis alerte le personnel.
// Le navigateur ne choisit ni l'identifiant, ni le statut, ni la date.
//
// ══ ET, DEPUIS LE 17 SEPTEMBRE, ELLE POSE LE RENDEZ-VOUS ══════════════
// « Est-ce possible de tomber directement sur les consultations et réserver
// directement, sans passer par un message WhatsApp ? Même chose pour les
// entretiens et les soins » (Yéman). Quand la demande porte une place
// (`serviceIds`, `date`, `time`), on REVÉRIFIE tout ici avant d'écrire :
// le jour est-il ouvert, l'heure tient-elle dans la fenêtre, le maître
// est-il libre, un mur barre-t-il la plage, le plafond du jour est-il
// atteint. L'écran propose ; le serveur dispose. Depuis le 29 septembre,
// le rendez-vous naît « confirmé » : « Tout de suite » (Yéman, maquette
// « La réservation en 30 secondes »). Une place que le serveur a revérifiée
// libre est une place tenue ; la Maison attribue le maître, jamais la
// cliente, et peut toujours déplacer depuis Le Trône.
//
// LE CALCUL EST RECOPIÉ, PAS IMPORTÉ : une fonction Edge ne lit rien du
// dépôt. Sa source de vérité est `src/shared/agenda-pur.ts`, éprouvé par
// `scripts/verifie-agenda-pur.mjs` — les deux doivent changer ensemble.
//
// ══ LA RÈGLE RENFORCÉE, ET LE VERROU — 9 octobre 2026 ═══════════════
// La Maison répond désormais sur WhatsApp et y pose des rendez-vous
// (`whatsapp-automate`) : deux portes posent une place sans qu'une main la
// voie. Le relevé du jour a montré que ce juge-ci était plus lâche que
// l'écran du site : il ne comptait pas les fauteuils, laissait réserver une
// création d'un appel direct, prenait le premier maître sans regarder,
// comptait le jour sur l'horloge UTC, et ignorait la durée figée des
// rendez-vous déjà posés. Désormais :
//   · LE JUGE EST `laPlaceTient` de `src/shared/place-du-serveur.ts`,
//     recopié tel quel entre ses repères avec ceux dont il dépend
//     (⟨agenda-pur⟩, ⟨catalogue-pur⟩, ⟨qualification⟩). La règle R8 de
//     `verifie-les-douze-lunes` confronte chaque copie caractère pour
//     caractère, `verifie-la-place-du-serveur` les fait tourner. Les
//     anciennes copies partielles du calendrier sont parties ;
//   · une création, une restauration, un devis ou une prestation marquée
//     « consultation avant » répond 409 `consultation_requise` ; un geste
//     qui ne se réserve pas en ligne, 409 `prestation_retiree` ;
//   · le jour se compte à Cotonou (UTC+1) : entre minuit et une heure, le
//     jour même ne passe plus ;
//   · les créneaux occupés se lisent par `creneaux_occupes` (qui lit
//     `dureeMin` d'abord depuis 0125), le catalogue et ses familles PAR
//     PAGES, les blocages du jour et de la branche seulement. Une lecture en
//     panne refuse (503 `agenda_illisible`) au lieu de croire la journée
//     vide ;
//   · LE RENDEZ-VOUS SE POSE SOUS VERROU (`pose_si_libre`, 0125) : une pose
//     à la fois par maison et par jour ; le plafond, les fauteuils et le
//     premier maître encore libre rejoués sous le verrou ; la durée figée
//     (`dureeMin`) sur le rendez-vous. Le site et WhatsApp ne peuvent plus
//     prendre la même place au même instant. Un refus du verrou se traite
//     comme l'échec d'écriture d'avant : la demande vit, la Maison rappelle ;
//   · le maître que l'écran envoie n'est plus lu : la Maison attribue.
// LA MIGRATION 0125 SE PASSE AVANT DE COLLER CE FICHIER : sans
// `pose_si_libre`, aucune place ne se pose (la demande vit quand même).
//
// ══ ET, DEPUIS LE 24 SEPTEMBRE, ELLE RÉSOUT LE CODE DE L'OFFRE ═══════
// « Le −10 % de la vitrine ne réduit rien » (Yéman). La carte écrit un code
// (RENTREE10), le lien l'emporte, la réservation le montre rempli et barre
// les lignes couvertes. Mais LE NAVIGATEUR N'ENVOIE QUE LE CODE, jamais le
// pourcentage : un navigateur à qui l'on demanderait sa propre remise
// répondrait 90 le jour où quelqu'un s'en amuserait. C'est ici que le code
// se résout contre `mnd_offers` : l'offre doit être active et dans sa
// saison, couvrir la prestation, et la prestation avoir un prix ferme.
//
// LA REMISE S'ÉCRIT PAR LIGNE (`remisesLignes`, parallèle à `serviceIds`),
// JAMAIS EN `discountPct` : celui-ci porte sur TOUT le rendez-vous, Gamme
// comprise, c'est la remise de la cliente (un compte famille à −15 % est à
// −15 % partout, arbitrage du 5 septembre). Une offre sur les lavages ne
// remise que les lavages, et Le Trône retrouve au franc près ce que la
// cliente a vu sur le site (le-trone-35, 24 septembre).
//
// LE CODE SE COMPTE : il s'écrit sur la demande et sur le rendez-vous, même
// quand il ne retire rien (cadeau, prix au salon), parce qu'une remise
// silencieuse s'applique et disparaît, alors qu'un code dit ce que l'offre
// a fait venir. Un code inconnu ou hors saison s'écrit aussi, sans offre.
//
// ══ UNE FOIS PAR PERSONNE, ET JAMAIS CUMULÉ ════════════════════════
// « Le code est utilisable une fois par personne. Non cumulable » (Yéman,
// 24 septembre 2026). Le non-cumul se tient tout seul : un seul code voyage,
// rien ne s'empile. L'usage unique ne peut se tenir QU'ICI : le site ne sait
// pas qui est la visiteuse avant son numéro, et ce qu'un navigateur
// affirmerait de ses venues passées ne vaudrait rien.
//
// CE QUI COMPTE POUR UN USAGE, c'est un rendez-vous qui a REÇU la remise, et
// non un code écrit quelque part : `codeApplique` ne se pose qu'après que le
// rendez-vous a été inscrit avec ses `remisesLignes`. Un code tapé sur une
// demande sans place, un code hors saison, un code qui ne mord sur aucun
// geste ne consomment rien, et la fois suivante reste due.
//
// DEUX REFUS QUI COÛTERAIENT PLUS QUE LA REMISE, et qu'on ne fait donc pas.
// On ne refuse JAMAIS la réservation : on ne perd pas une venue pour une
// remise déjà prise. Et on n'écarte pas le code en silence : la demande, le
// rendez-vous et la réponse portent sa raison, pour que l'accueil la lise
// avant la cliente, et que la page puisse la dire au moment du clic.
//
// Sa source de vérité est `src/shared/offres-pur.ts` (`codeNormalise`,
// `offreDuCode`, `lignesDuCode`), éprouvé par `verifie-le-code-de-l-offre` ;
// la COPIE ci-dessous est confrontée à l'original par
// `scripts/verifie-le-code-au-serveur.mjs`, qui la lit entre ses deux
// repères et la fait tourner sur les mêmes cas. Deux calculs d'argent
// finissent toujours par diverger ; c'est au comptoir qu'on l'apprend.
//
// LE PARRAINAGE — 28 septembre 2026. Deux gestes de plus :
//   · `{ parrainage: true, data: { prenom, telephone, consentement } }` rend
//     le code de marraine de ce numéro (PRENOM-XXX), le crée s'il n'existe
//     pas, et rend les deux cadeaux écrits au Trône (`mnd_parrainage`). La
//     marraine est une demande `prospect`, profil « Marraine ».
//   · À la réservation, un code qu'aucune offre ne reconnaît est cherché
//     parmi les codes de marraine. Il ne vaut que pour une NOUVELLE cliente
//     (aucune fiche à ce numéro), jamais pour la marraine, et une seule fois
//     par numéro. La raison `parrainage` et le cadeau de la filleule
//     s'écrivent sur la demande et dans la note du rendez-vous ; l'accueil
//     l'applique, le calcul ne retire rien.
//
// LA CARTE DE MARRAINE DE CHAQUE CLIENTE — 28 septembre 2026. Toute fiche du
// Trône porte désormais son code (`codeParrain`, posé par le Trône). La
// marraine se cherche donc D'ABORD parmi les fiches, puis parmi les demandes
// du site ; une cliente qui demande son code sur le site reçoit celui de sa
// fiche. `{ parrainage: 'qui', code }` rend le seul PRÉNOM de la marraine,
// pour que la page de l'amie dise « Adjoa vous offre la Maison ». À la
// réservation d'une amie, la marraine est prévenue sur WhatsApp si le modèle
// est posé (secret WA_TEMPLATE_PARRAINAGE_RESERVE, variables : son prénom,
// celui de l'amie).
//
// DE MAIN EN MAIN — 9 octobre 2026. Les deux paragraphes ci-dessus disent
// l'histoire, plus ce que fait la fonction. La carte ne se donne plus à
// toutes : elle se GAGNE à la Maison. À sa Nᵉ visite honorée, le Trône pose
// sur la fiche une Graine (`graine: { code, … }`), et c'est désormais le SEUL
// code qui ouvre quelque chose :
//   · la marraine d'un code est l'unique fiche dont `data->graine->>code`
//     vaut ce code, jugée par `codeActifDe` (recopiée telle quelle de
//     `src/shared/douze-lunes-pur.ts`, entre les repères « code-actif »). Les
//     anciens `codeParrain` et les codes des demandes « Marraine » du site
//     sont éteints : plus aucune marraine ne se cherche dans `demandes` ;
//   · le site ne crée plus de code : `{ parrainage: true }` répond 409
//     `parrainage_ferme` ;
//   · « qui » a son propre seau de débit (`parrainage_qui`, 30 par 10 min),
//     compté AVANT celui des dépôts : ouvrir le lien d'une amie ne mange plus
//     le quota des réservations ;
//   · les fiches d'un numéro se lisent PAR PAGES (copie de
//     `src/shared/lecture-entiere.ts`) : au-delà de mille fiches, une cliente
//     connue passait pour nouvelle ;
//   · le code d'une amie arrive dans `codeAmie` (que l'ancienne version de
//     cette fonction ignore : un site publié avant elle n'honore aucun ancien
//     code), et se résout aussi sur une demande de RAPPEL, sans place ni
//     remise : la demande garde `parrainDe`, le Trône la voit dans la lignée.
// La fonction ne décide jamais qui est Graine : elle n'a besoin ni de N ni de
// la date du lancement. Un code éteint rend `inconnu` à la réservation, et
// `{ ok: false }` à « qui ».
//
// Déployez via le tableau de bord (Edge Functions → New function → coller ce
// fichier EN ENTIER). Secrets : SERVICE_KEY (comme push-notify) ; pour
// l'alerte, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (les mêmes).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
/* La clé service : CLE_SERVICE (la famille sb_secret, depuis la rotation du
   7 septembre), sinon SERVICE_KEY comme push-notify, sinon celle de la plateforme. */
const SERVICE_KEY = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@maison-mnd.bj';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** La version de ce fichier : ouvrir l'adresse de la fonction la dit (405),
    pour ne jamais chercher une panne dans un fichier qui n'est pas celui
    qu'on croit déployé. */
const VERSION = '2026-10-09-a';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* ── La limite de débit, la même que le tunnel (0007) ─────────────── */
const RATE_BUCKET = 'demandes';
const RATE_MAX = 6;          // 6 dépôts…
const RATE_WINDOW_MIN = 10;  // …par 10 minutes et par IP

const ipOf = (req: Request): string =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

/* UN SEAU PAR USAGE — 9 octobre 2026. Les dépôts gardent le leur (six par
   dix minutes) ; « qui » (la page d'une amie qui s'ouvre) a le sien, plus
   large, pour qu'un lien ouvert trois fois ne refuse pas la réservation qui
   suit, surtout derrière l'adresse partagée d'un opérateur mobile. */
async function allowRate(ip: string, seau: string = RATE_BUCKET, plafond: number = RATE_MAX): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
  const { count, error } = await admin
    .from('edge_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('bucket', seau).eq('ip', ip).gte('at', since);
  if (error) return true; // table absente : ne pas bloquer
  if ((count ?? 0) >= plafond) return false;
  await admin.from('edge_rate_limits').insert({ bucket: seau, ip });
  return true;
}

/* ── Le téléphone, en E.164 ─────────────────────────────────────────
   Même règle que `shared/demandes.ts` côté Trône : les chiffres seuls ; un
   numéro déjà international garde son indicatif ; un numéro local béninois
   (8 chiffres à l'ancienne, 10 depuis 2024) reçoit +229 ; en dessous de
   8 chiffres, ce n'est pas un numéro. */
function telephoneNormalise(brut: string, dial = '+229'): string {
  const t = String(brut ?? '').trim();
  const international = t.startsWith('+') || t.startsWith('00');
  const chiffres = t.replace(/\D/g, '').replace(/^00/, '');
  if (chiffres.length < 8) return '';
  if (international) return chiffres.length >= 10 ? `+${chiffres}` : '';
  const indicatif = dial.replace(/\D/g, '');
  if (chiffres.length > 10 && chiffres.startsWith(indicatif)) return `+${chiffres}`;
  /* Huit chiffres à l'ancienne : tout numéro béninois en a dix depuis 2024,
     le 01 s'ajoute, comme le fait `numeroWa` côté Maison. */
  if (indicatif === '229' && chiffres.length === 8) return `+22901${chiffres}`;
  return `+${indicatif}${chiffres}`;
}

const GENRES = new Set(['prospect', 'rdv']);
const BESOINS = new Set(['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu']);
const BESOIN_DIT: Record<string, string> = {
  creation: 'Créer ma couronne', reparation: 'Réparer ma couronne', entretien: 'Entretenir ma couronne',
  enfant: 'Pour mon enfant', formation: 'Apprendre le métier', inconnu: 'Ne sait pas encore',
};
/* Le {{2}} de l'accusé quand il n'y a pas de place : ce que la cliente a
   demandé, en clair, dans la phrase du modèle. */
const quandDeLaDemande = (genre: string, profil: string): string =>
  profil === 'Carte cadeau' ? 'une carte cadeau'
    : profil === 'Diagnostic locks' ? 'votre routine locks'
      : genre === 'rdv' ? 'un rendez-vous' : 'un rappel de la Maison';
const texte = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* La branche rend aussi SA LIGNE (9 octobre 2026) : le juge des places y
   lit les maîtres ET les fauteuils (`seats`), que l'ancien juge ignorait. */
async function brancheParDefaut(voulue: string): Promise<{ id: string; maitres: string[]; ligne: { id: string; data?: unknown } }> {
  const { data: rows } = await admin.from('branches').select('id, data');
  const branches = (rows ?? []) as { id: string; data?: { flagship?: boolean; status?: string; masters?: string[]; seats?: number } }[];
  const choisie = (voulue && branches.find((b) => b.id === voulue))
    || branches.find((b) => b.data?.flagship && b.data?.status !== 'paused')
    || branches[0];
  const id = choisie?.id ?? 'maison';
  return { id, maitres: (choisie?.data?.masters ?? []).filter(Boolean), ligne: { id, data: choisie?.data ?? {} } };
}

/* ══ LE CALENDRIER ET LA RÈGLE DES PLACES, RECOPIÉS TELS QUELS ═════════
   9 octobre 2026. Quatre blocs, chacun entre ses repères, copiés caractère
   pour caractère de `src/shared/agenda-pur.ts`, `catalogue-pur.ts`,
   `qualification.ts` et `place-du-serveur.ts` (une fonction Edge ne lit rien
   du dépôt). R8 (`verifie-les-douze-lunes`) les confronte,
   `verifie-la-place-du-serveur` les fait tourner sur les cas de l'original.
   Les `export` qu'ils portent ne gênent pas une fonction Edge.
   NE RIEN RETOUCHER ENTRE LES REPÈRES : on corrige l'original, puis on
   recopie le bloc entier.

   CE QUE LA MAISON A DÉCOCHÉ POUR LE SITE (`siteMasques`, 17 septembre
   2026) ne se réserve toujours pas, même par un appel direct : sans ce
   refus, décocher ne serait qu'un décor. Le juge en est `masquePourLeSite`
   (catalogue-pur), lu par `reservableSurLeSite` (place-du-serveur). */
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

/* ══ LA PLACE DEMANDÉE, REVÉRIFIÉE ICI ═════════════════════════════
   Rend l'erreur à dire, ou la durée et les maîtres LIBRES si la place
   tient. L'écran a déjà jugé, mais un écran vieux d'une minute, un retour
   en arrière du navigateur ou un appel direct à cette fonction ne jugent
   rien du tout. Depuis le 9 octobre 2026, cette fonction ne fait que LIRE ;
   le juge est `laPlaceTient` (place-du-serveur, recopié ci-dessus), sur
   l'instantané qu'elle vient de lire. Le catalogue lu ici sert aussi au code
   de l'offre et à la remise de bienvenue : une seule lecture. */
type LigneDeTable = { id: string; data?: any };
const toutesLesLignes = (table: string, filtres: [string, string][] = []): Promise<ReponseDePage<LigneDeTable>> =>
  litToutesLesPages<LigneDeTable>((apres, taille) => {
    let page = admin.from(table).select('id, data');
    for (const [colonne, valeur] of filtres) page = page.eq(colonne, valeur);
    if (apres !== null) page = page.gt('id', apres);
    return page.order('id', { ascending: true }).limit(taille) as unknown as PromiseLike<ReponseDePage<LigneDeTable>>;
  });

/* Supabase ne rend jamais plus de mille lignes d'un coup : une journée qui
   en rendrait mille pile serait une TRANCHE, pas une journée. */
const PLAFOND_D_UNE_REPONSE = 1000;

async function laPlaceDemandee(o: {
  branche: { id: string; data?: unknown };
  serviceIds: string[];
  date: string;
  time: string;
}): Promise<{ erreur: string } | {
  dureeMin: number;
  /** Les maîtres libres à cette heure, dans l'ordre : le verrou prend le premier encore libre. */
  maitres: string[];
  catalogue: ServiceEnBase[];
  offres: any[];
  /** L'arbre des familles, lu ici une fois : la remise de bienvenue s'en sert. */
  familles: { id: string; parentId?: string }[];
}> {
  const maintenant = Date.now();
  /* La forme et la fenêtre d'abord : un appel mal formé ne coûte rien à la base. */
  const recevable = laPlaceEstRecevable({ date: o.date, time: o.time }, maintenant);
  if (recevable) return { erreur: recevable };

  const [docs, services, categories, blocages, occupes] = await Promise.all([
    admin.from('documents').select('key, data').in('key', ['mnd_settings', 'mnd_horaires_exceptions', 'mnd_vitrine_config', 'mnd_offers']),
    toutesLesLignes('catalog_services'),
    toutesLesLignes('catalog_categories'),
    toutesLesLignes('blocages', [['data->>branchId', o.branche.id], ['data->>date', o.date]]),
    admin.rpc('creneaux_occupes', { p_branch: o.branche.id, p_du: o.date, p_au: o.date }),
  ]);
  /* UNE LECTURE EN PANNE REFUSE : croire la journée vide, c'était poser une
     place sur un mur ou sur un rendez-vous qu'on n'a pas su lire. */
  const panne = docs.error ?? services.error ?? categories.error ?? blocages.error ?? occupes.error;
  const pris = (Array.isArray(occupes.data) ? occupes.data : []) as unknown[];
  if (panne || pris.length >= PLAFOND_D_UNE_REPONSE) {
    console.error('demande-submit: agenda illisible', panne?.message ?? 'une tranche de mille créneaux');
    return { erreur: 'agenda_illisible' };
  }
  const doc = (cle: string): any => ((docs.data ?? []) as { key: string; data?: any }[]).find((d) => d.key === cle)?.data;
  const agenda = agendaDepuisLesLignes({
    branche: o.branche,
    reglages: doc('mnd_settings'),
    exceptions: doc('mnd_horaires_exceptions'),
    vitrine: doc('mnd_vitrine_config'),
    services: services.data ?? [],
    categories: categories.data ?? [],
    blocages: blocages.data ?? [],
    occupes: pris,
  });
  if (!agenda) return { erreur: 'creneau_invalide' };
  const verdict = laPlaceTient(agenda, { date: o.date, time: o.time, serviceIds: o.serviceIds }, maintenant);
  if (!verdict.ok) return { erreur: verdict.erreur };

  /* Les offres de la Maison, pour résoudre un code : lues ici, avec le reste,
     pour ne pas rouvrir la base une seconde fois. */
  const offresBrutes = doc('mnd_offers');
  return {
    dureeMin: verdict.dureeMin,
    maitres: verdict.maitres,
    catalogue: (services.data ?? []) as ServiceEnBase[],
    offres: (Array.isArray(offresBrutes) ? offresBrutes : []) as any[],
    familles: agenda.categories,
  };
}

/* ══ LE CODE DE L'OFFRE, RECOPIÉ DE `src/shared/offres-pur.ts` ══════
   Entre les deux repères, RIEN qui ne soit dans l'original, à une différence
   près : `dansLaSaison` reçoit le jour en graphie ISO au lieu d'une Date,
   parce que le jour se calcule ici dans le fuseau de la Maison (Deno tourne
   en UTC, et une saison qui finit le 30 se terminerait à 1 h du matin). */
/* ══ COPIE DE offres-pur : DÉBUT ══ */
const CODE_MAX = 16;
const codeNormalise = (v: unknown): string =>
  String(v ?? '').replace(/\s+/g, '').toUpperCase().slice(0, CODE_MAX);
type OffreCodee = { active: boolean; du?: string; au?: string; code?: string; discountPct?: number; serviceIds?: string[] };
const dansLaSaison = (o: { du?: string; au?: string }, j: string): boolean => {
  if (o.du && j < o.du) return false;
  if (o.au && j > o.au) return false;
  return true;
};
function offreDuCode<T extends OffreCodee>(offres: readonly T[], code: unknown, j: string): T | null {
  const c = codeNormalise(code);
  if (!c) return null;
  return offres.find((o) => o.active && codeNormalise(o.code) === c && dansLaSaison(o, j)) ?? null;
}
type LigneAPrix = { id: string; prixXof: number; ferme: boolean };
type LigneRemisee = LigneAPrix & { net: number; remisee: boolean };
function lignesDuCode(lignes: readonly LigneAPrix[], offre: OffreCodee | null): LigneRemisee[] {
  const pct = Math.max(0, Math.min(90, Math.round(offre?.discountPct ?? 0)));
  const couvre = new Set(offre?.serviceIds ?? []);
  return lignes.map((l) => {
    const porte = pct > 0 && l.ferme && l.prixXof > 0 && couvre.has(l.id);
    return { ...l, net: porte ? Math.round(l.prixXof * (1 - pct / 100)) : l.prixXof, remisee: porte };
  });
}
/* ══ COPIE DE offres-pur : FIN ══ */

/* Tout ce qui suit jusqu'au repère de fin ne touche NI la base NI le réseau :
   le harnais l'extrait et le fait tourner pour de vrai, plutôt que de juger
   la résolution du code sur la lettre du fichier. */
/* ══ RÉSOLUTION DU CODE : DÉBUT ══ */

/** Le jour de la Maison, en ISO, dans SON fuseau : c'est lui qui borne une
    saison, pas l'horloge d'un serveur. */
const jourDeLaMaison = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** LE PRIX FERME D'UNE PRESTATION, ou zéro : même règle que la réservation
    du site (`prixFerme`, Reserver.tsx). Un devis, un prix caché ou absent
    valent zéro ; « variable » compte comme ferme et dit « à partir de ». */
type ServiceEnBase = { id: string; data?: { name?: string; priceXof?: number; priceMode?: string; hidePrice?: boolean; categoryId?: string; durationMin?: number; enabled?: boolean; archived?: boolean } };
const ligneAPrix = (id: string, catalogue: ServiceEnBase[]): LigneAPrix => {
  const s = catalogue.find((x) => x.id === id)?.data;
  const mode = s?.priceMode ?? (s?.hidePrice ? 'devis' : 'fixe');
  const p = Number(s?.priceXof ?? 0);
  const prix = !p || mode === 'devis' ? 0 : p;
  return { id, prixXof: prix, ferme: prix > 0 };
};

/** POURQUOI LE CODE N'A RIEN RETIRÉ, en un mot. Absent quand il a retiré.

    UN CADEAU N'EST PAS UN CODE SANS EFFET — 24 septembre 2026. Les deux ne
    retirent aucun franc, et les confondre faisait écrire à l'accueil « ne
    porte sur aucun geste choisi » sous une offre qui, elle, donne bel et
    bien quelque chose. Quatre des cinq offres de parcours sont des cadeaux
    (le-trone-35, même jour) : la confusion serait devenue le cas courant, et
    une employée aurait refusé au comptoir ce que la carte avait promis. */
type RaisonDuCode = 'inconnu' | 'cadeau' | 'sans-effet' | 'deja-utilise'
  | 'parrainage' | 'parrainage-soi-meme' | 'parrainage-deja-cliente' | 'parrainage-deja-utilise';

type VerdictDuCode = {
  code: string;
  offreId?: string;
  remisesLignes?: ({ pct: number } | null)[];
  raison?: RaisonDuCode;
  /** Le parrainage : le prénom de la marraine, l'id de sa demande (ou de sa
      fiche), le cadeau dit, et son numéro pour la prévenir. */
  marraine?: string;
  marraineId?: string;
  marraineClientId?: string;
  marraineTelephone?: string;
  cadeau?: string;
};

/** LA RAISON, DITE COMME ON LA DIRAIT À L'ACCUEIL. Une ligne de note vaut
    mieux qu'un mot-clef : c'est elle qu'une employée lira en ouvrant le
    rendez-vous, sans rien connaître de nos conventions. */
const raisonEnClair = (v: VerdictDuCode): string => {
  if (!v.code) return '';
  if (v.raison === 'deja-utilise') return `code ${v.code} déjà utilisé par ce numéro`;
  if (v.raison === 'inconnu') return `code ${v.code} (aucune offre en cours)`;
  if (v.raison === 'cadeau') return `code ${v.code} (cadeau de l'offre, à appliquer à la Maison)`;
  if (v.raison === 'sans-effet') return `code ${v.code} (ne porte sur aucun geste choisi)`;
  if (v.raison === 'parrainage') return `parrainée par ${v.marraine || 'une cliente'} (code ${v.code})${v.cadeau ? ` : cadeau de bienvenue, ${v.cadeau}` : ' : cadeau de bienvenue à offrir'}`;
  if (v.raison === 'parrainage-soi-meme') return `code ${v.code} : c'est son propre code de marraine, sans cadeau`;
  if (v.raison === 'parrainage-deja-cliente') return `code ${v.code} (parrainage) : déjà cliente, sans cadeau de bienvenue`;
  if (v.raison === 'parrainage-deja-utilise') return `code ${v.code} (parrainage) : un parrainage déjà reçu par ce numéro`;
  return `code ${v.code}`;
};

/** CE QUE LE CODE FAIT AU RENDEZ-VOUS. Rend le code normalisé (toujours,
    pour qu'il se compte), l'offre trouvée s'il y en a une, et les remises
    de ligne s'il en retire au moins une. Une offre qui ne mord sur rien
    n'écrit pas de tableau : un rendez-vous sans remise n'en porte pas. */
function remiseDuCode(o: {
  code: unknown; serviceIds: string[]; branchId: string; catalogue: ServiceEnBase[]; offres: (OffreCodee & { id?: string; branchId?: string })[];
}): VerdictDuCode {
  const code = codeNormalise(o.code);
  if (!code) return { code: '' };
  /* De la branche du rendez-vous seulement ; une offre sans branche vaut partout. */
  const candidates = o.offres.filter((x) => !x.branchId || x.branchId === o.branchId);
  const offre = offreDuCode(candidates, code, jourDeLaMaison());
  if (!offre) return { code, raison: 'inconnu' };
  const lignes = lignesDuCode(o.serviceIds.map((id) => ligneAPrix(id, o.catalogue)), offre);
  const pct = Math.max(0, Math.min(90, Math.round(offre.discountPct ?? 0)));
  const remisesLignes = lignes.some((l) => l.remisee) ? lignes.map((l) => (l.remisee ? { pct } : null)) : undefined;
  const base = { code, ...(offre.id ? { offreId: String(offre.id) } : {}) };
  if (remisesLignes) return { ...base, remisesLignes };
  /* Sans pourcentage, l'offre DONNE quelque chose que le calcul ne sait pas
     retirer : un styling, un soin, des heures. Avec un pourcentage, elle ne
     mord sur rien de ce qui a été choisi. Deux gestes différents au comptoir. */
  return { ...base, raison: pct > 0 ? 'sans-effet' as const : 'cadeau' as const };
}

/* ══ RÉSOLUTION DU CODE : FIN ══ */

/** CE NUMÉRO A-T-IL DÉJÀ REÇU CE CODE ? On ne regarde que les demandes dont
    le code a RÉELLEMENT retiré quelque chose (`codeApplique`), posé après
    l'écriture du rendez-vous.

    EN CAS D'ERREUR DE LECTURE, ON LAISSE PASSER LA REMISE. Le choix est
    délibéré : refuser une remise due à cause d'une panne de base se vit au
    comptoir, devant la cliente, alors qu'une remise donnée deux fois se
    rattrape sur une facture. L'erreur part au journal de la fonction. */
async function codeDejaUtilise(code: string, telephone: string): Promise<boolean> {
  if (!code || !telephone) return false;
  const { data, error } = await admin.from('demandes').select('id')
    .eq('data->>telephone', telephone)
    .eq('data->>code', code)
    .eq('data->>codeApplique', 'true')
    .limit(1);
  if (error) {
    console.error('demande-submit: usage du code illisible', error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/* ══ LE PARRAINAGE ══════════════════════════════════════════════════════
   La forme du code est le contrat avec `src/shared/parrainage.ts`
   (FORME_DU_CODE, SIGNES_DU_CODE) ; `verifie-le-parrainage` les confronte.
   Depuis De main en main (9 octobre 2026), la fonction ne fabrique plus
   aucun code : `racineDuCode` et `codeDeMarraine` sont partis avec le mode
   `parrainage: true`. Les signes restent écrits, la forme en est faite. */
const SIGNES_DU_CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const FORME_DU_CODE = /^[A-Z]{1,6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/;

/* LE CODE ACTIF — 9 octobre 2026. Recopié TEL QUEL de
   `src/shared/douze-lunes-pur.ts` (une fonction Edge ne lit rien du dépôt) ;
   le harnais confronte les deux copies, caractère pour caractère, entre
   leurs repères. Seul le code de la Graine ouvre quelque chose. */
/* ⟨code-actif⟩ */
function codeActifDe(fiche: unknown): string | null {
  if (!fiche || typeof fiche !== 'object') return null;
  const f = fiche as { archived?: unknown; graine?: { code?: unknown } | null };
  const code = f.graine && typeof f.graine === 'object' ? f.graine.code : undefined;
  return f.archived !== true && typeof code === 'string' && FORME_DU_CODE.test(code) ? code : null;
}
/* ⟨/code-actif⟩ */

type ReglageParrainage = {
  actif?: boolean; cadeauFilleule?: string; cadeauMarraine?: string;
  remiseBienvenuePct?: number; remiseBienvenueFamilles?: string[];
};

/* LA REMISE DE BIENVENUE DE L'AMIE — 7 octobre 2026. Recopiée TELLE QUELLE
   de `src/shared/parrainage-pur.ts` ; `verifie-le-parrainage` confronte les
   deux copies. La remise remplace la phrase du cadeau (choix de Yéman). */
/* ⟨bienvenue⟩ */
type FamilleDeBienvenue = { id: string; parentId?: string | null };
type PrestationDeBienvenue = {
  id: string; categoryId?: string; priceXof?: number; priceMode?: string; hidePrice?: boolean;
  enabled?: boolean; archived?: boolean; includes?: unknown[];
};
const REMISE_BIENVENUE_PCT = 20;
function prestationsDeBienvenue(
  prestations: readonly PrestationDeBienvenue[],
  familles: readonly FamilleDeBienvenue[],
  cochees: readonly string[],
): string[] {
  const coche = new Set(cochees);
  const dansUneFamilleCochee = (catId?: string): boolean => {
    let id: string | null | undefined = catId;
    for (let i = 0; id && i < 8; i++) {
      if (coche.has(id)) return true;
      const courant: string = id;
      id = familles.find((f) => f.id === courant)?.parentId;
    }
    return false;
  };
  return prestations
    .filter((s) => s.enabled !== false && !s.archived && !(Array.isArray(s.includes) && s.includes.length > 0))
    .filter((s) => !s.hidePrice && (s.priceMode ?? 'fixe') !== 'devis' && Number(s.priceXof ?? 0) > 0)
    .filter((s) => dansUneFamilleCochee(s.categoryId))
    .map((s) => s.id);
}
function remiseDeBienvenue(
  reglage: { remiseBienvenuePct?: number; remiseBienvenueFamilles?: string[] },
  prestations: readonly PrestationDeBienvenue[],
  familles: readonly FamilleDeBienvenue[],
): { pct: number; serviceIds: string[] } | null {
  const pct = Math.max(0, Math.min(90, Math.round(reglage.remiseBienvenuePct ?? REMISE_BIENVENUE_PCT)));
  const cochees = reglage.remiseBienvenueFamilles ?? [];
  if (pct <= 0 || cochees.length === 0) return null;
  const serviceIds = prestationsDeBienvenue(prestations, familles, cochees);
  return serviceIds.length > 0 ? { pct, serviceIds } : null;
}
const motDeLaRemise = (r: { pct: number }): string => `${r.pct} % sur vos soins d’entretien`;
/* ⟨/bienvenue⟩ */

/** Le catalogue tel que la règle le lit : la fiche à plat, l'arbre des familles. */
const aPlat = (catalogue: ServiceEnBase[]): PrestationDeBienvenue[] =>
  catalogue.map((x) => ({ id: x.id, ...(x.data ?? {}) } as PrestationDeBienvenue));
async function reglageDuParrainage(): Promise<ReglageParrainage> {
  const { data } = await admin.from('documents').select('data').eq('key', 'mnd_parrainage').maybeSingle();
  return ((data as { data?: ReglageParrainage } | null)?.data) ?? { actif: true };
}

/** Les huit derniers chiffres : un numéro de fiche s'écrit de dix façons
    (+229, espaces, 01 ou pas), ses huit derniers chiffres ne changent pas. */
const huitDerniers = (t: string): string => String(t ?? '').replace(/\D/g, '').slice(-8);

/* TOUTE LA TABLE, PAGE PAR PAGE — 9 octobre 2026. Supabase ne rend jamais
   plus de mille lignes par requête, et le carnet des fiches les a passées :
   lue d'un seul select, la table devenait une TRANCHE, et une cliente
   connue passait pour nouvelle (cadeau de bienvenue à tort). Recopié TEL
   QUEL de `src/shared/lecture-entiere.ts`, de `PAGE_DE_LECTURE` à la fin du
   fichier (l'original ne porte pas de repères : la copie entre les siens
   doit s'y retrouver mot pour mot). Une erreur en route rend l'erreur et
   AUCUNE ligne. */
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

/** A-T-ELLE DÉJÀ UNE FICHE ? En cas d'erreur de lecture, on la dit nouvelle :
    un cadeau de bienvenue donné à tort se rattrape au comptoir, qui voit la
    fiche ; un cadeau refusé à tort se vit devant elle. Depuis le 9 octobre,
    les fiches se lisent PAR PAGES, dans l'ordre des identifiants, à la suite
    de la dernière lue. */
type FicheLue = { id: string; phone?: string; phone2?: string };
async function fichesDuNumero(telephone: string): Promise<FicheLue[] | null> {
  const fin = huitDerniers(telephone);
  if (fin.length < 8) return [];
  const { data, error } = await litToutesLesPages<FicheLue>((apres, taille) => {
    let page = admin.from('clients').select('id, phone:data->>phone, phone2:data->>phone2');
    if (apres !== null) page = page.gt('id', apres);
    return page.order('id', { ascending: true }).limit(taille) as unknown as PromiseLike<ReponseDePage<FicheLue>>;
  });
  if (error) { console.error('demande-submit: fiches illisibles', error.message); return null; }
  return (data ?? []).filter((c) => huitDerniers(c.phone ?? '') === fin || huitDerniers(c.phone2 ?? '') === fin);
}
async function dejaCliente(telephone: string): Promise<boolean> {
  const fiches = await fichesDuNumero(telephone);
  return !!fiches && fiches.length > 0;
}

/* ══ MADAME NAFFI — 2 octobre 2026 ═════════════════════════════════════
   La Maison écrit « Madame Naffi » : la civilité de la fiche, puis le prénom.
   Une fiche qui ne dit rien est une dame ; une fiche au masculin d'avant ce
   jour est « Monsieur ». Recopié de `src/shared/civilite.ts` (une fonction
   Edge ne lit rien du dépôt) ; `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : 'madame';
  const mot = civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
  const prenom = String(d?.name ?? repli ?? '').trim().split(/\s+/)[0] ?? '';
  return prenom ? `${mot} ${prenom}` : mot;
};

const premierMot = (t: unknown): string => String(t ?? '').trim().split(/\s+/)[0] ?? '';

/** LA MARRAINE D'UN CODE — De main en main, 9 octobre 2026 : l'UNIQUE fiche
    vivante dont la Graine porte ce code. Ni `codeParrain` (l'ancien code,
    qu'un vieux poste du Trône pourrait reposer), ni les demandes du site.
    Deux fiches vivantes pour un même code ne désignent personne : on ne
    choisit pas au hasard la marraine d'une amie. Une lecture impossible
    rend `null`, comme un code inconnu : la réservation tient, sans remise. */
async function marraineDuCode(code: string): Promise<{ id: string; prenom: string; telephone: string; clientId?: string } | null> {
  if (!FORME_DU_CODE.test(code)) return null;
  const { data, error } = await admin.from('clients').select('id, data').eq('data->graine->>code', code).limit(2);
  if (error) { console.error('demande-submit: marraine illisible', error.message); return null; }
  const vivantes = ((data ?? []) as { id: string; data: Record<string, unknown> }[])
    .filter((f) => codeActifDe(f.data) === code);
  if (vivantes.length !== 1) return null;
  const fiche = vivantes[0];
  return { id: fiche.id, prenom: premierMot(fiche.data.name), telephone: String(fiche.data.phone ?? ''), clientId: fiche.id };
}

/** LE CODE D'UNE MARRAINE, lu à la réservation quand aucune offre ne le
    reconnaît. Rend `null` si ce n'est pas un code de marraine. */
async function verdictDuParrainage(
  code: string, telephone: string,
  gestes?: { serviceIds: string[]; catalogue: ServiceEnBase[]; familles: FamilleDeBienvenue[] },
): Promise<VerdictDuCode | null> {
  if (!FORME_DU_CODE.test(code)) return null;
  const marraine = await marraineDuCode(code);
  if (!marraine) return null;
  const reglage = await reglageDuParrainage();
  if (reglage.actif === false) return { code, raison: 'inconnu' };
  const base = {
    code, marraine: marraine.prenom, marraineId: marraine.id, marraineTelephone: marraine.telephone,
    ...(marraine.clientId ? { marraineClientId: marraine.clientId } : {}),
  };
  if (huitDerniers(marraine.telephone) === huitDerniers(telephone)) return { ...base, raison: 'parrainage-soi-meme' };
  const { data: deja } = await admin.from('demandes').select('id')
    .eq('data->>telephone', telephone).eq('data->>codeRaison', 'parrainage').limit(1);
  if ((deja ?? []).length > 0) return { ...base, raison: 'parrainage-deja-utilise' };
  if (await dejaCliente(telephone)) return { ...base, raison: 'parrainage-deja-cliente' };
  /* LA REMISE DE BIENVENUE s'écrit par ligne, comme celle d'un code d'offre :
     la caisse la retranche, la facture la nomme. */
  const remise = gestes ? remiseDeBienvenue(reglage, aPlat(gestes.catalogue), gestes.familles) : null;
  if (remise && gestes) {
    const lignes = lignesDuCode(gestes.serviceIds.map((id) => ligneAPrix(id, gestes.catalogue)), { active: true, discountPct: remise.pct, serviceIds: remise.serviceIds });
    const remisesLignes = lignes.some((l) => l.remisee) ? lignes.map((l) => (l.remisee ? { pct: remise.pct } : null)) : undefined;
    return { ...base, raison: 'parrainage', cadeau: motDeLaRemise(remise), ...(remisesLignes ? { remisesLignes } : {}) };
  }
  return { ...base, raison: 'parrainage', cadeau: texte(reglage.cadeauFilleule, 160) };
}

/* LE MODE `parrainage: true` EST FERMÉ — 9 octobre 2026. Il donnait un code
   à quiconque tapait un prénom et un numéro, et rendait l'ancien code d'une
   fiche à qui tapait son numéro : il contournait la Graine. La carte se
   gagne à la Maison ; l'aiguillage répond `parrainage_ferme` (409), que la
   page du site dit déjà sans reproche. Les demandes « Marraine » déjà
   écrites restent en base, leurs codes ne donnent plus rien. */

/** `{ parrainage: 'qui', code }` : le PRÉNOM de la marraine, rien d'autre.
    Depuis le 9 octobre, celui d'une Graine seulement (`marraineDuCode`) :
    un ancien code rend `{ ok: false }`, ni bannière ni prix barrés. */
async function quiOffre(body: Record<string, unknown>): Promise<Response> {
  const code = codeNormalise(body.code);
  if (!FORME_DU_CODE.test(code)) return json({ ok: false });
  const reglage = await reglageDuParrainage();
  if (reglage.actif === false) return json({ ok: false });
  const m = await marraineDuCode(code);
  if (!m?.prenom) return json({ ok: false });
  /* LA REMISE SE VOIT DÈS LE LIEN OUVERT (7 octobre 2026) : le pourcentage
     et les prestations qu'il couvre, pour que la page barre les prix ligne
     par ligne avant même qu'elle réserve. */
  const [services, categories] = await Promise.all([
    admin.from('catalog_services').select('id, data'),
    admin.from('catalog_categories').select('id, data'),
  ]);
  const familles = ((categories.data ?? []) as { id: string; data?: { parentId?: string } }[])
    .map((c) => ({ id: c.id, parentId: c.data?.parentId }));
  const remise = remiseDeBienvenue(reglage, aPlat((services.data ?? []) as ServiceEnBase[]), familles);
  return json({
    ok: true, prenom: m.prenom,
    cadeau: remise ? motDeLaRemise(remise) : texte(reglage.cadeauFilleule, 160),
    ...(remise ? { remise } : {}),
  });
}

/** LA MARRAINE EST PRÉVENUE quand une amie réserve avec son code. Seulement
    si le modèle est posé (secret WA_TEMPLATE_PARRAINAGE_RESERVE) ; un échec
    ne défait rien, il s'écrit au journal des envois. */
async function previensLaMarraine(o: {
  demandeId: string; branchId: string; prenomMarraine: string; prenomAmie: string; telephone: string; clientId?: string;
}): Promise<string> {
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const MODELE = Deno.env.get('WA_TEMPLATE_PARRAINAGE_RESERVE') ?? '';
  if (!MODELE) return 'sans-modele';
  if (!WA_TOKEN || !WA_PHONE_ID) return 'sans-cles';
  const tel = o.telephone.replace(/\D/g, '');
  if (!tel) return 'sans-numero';
  /* LA CIVILITÉ DE LA MARRAINE se lit sur sa fiche quand elle en a une. */
  let ficheMarraine: Record<string, unknown> | null = null;
  if (o.clientId) {
    const { data: f } = await admin.from('clients').select('data').eq('id', o.clientId).maybeSingle();
    ficheMarraine = (f?.data ?? null) as Record<string, unknown> | null;
  }
  const prenom = appelDe(ficheMarraine ? { ...ficheMarraine, name: o.prenomMarraine || ficheMarraine.name } : null, o.prenomMarraine);
  const amie = o.prenomAmie || 'Votre amie';
  let statut = 'échec';
  let detail: string | undefined;
  let waId = '';
  try {
    const garde = new AbortController();
    const minuterie = setTimeout(() => garde.abort(), 8000);
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: tel, type: 'template',
        template: {
          name: MODELE, language: { code: 'fr' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: prenom }, { type: 'text', text: amie }] }],
        },
      }),
      signal: garde.signal,
    });
    clearTimeout(minuterie);
    const rep = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { message?: string } };
    waId = String(rep?.messages?.[0]?.id ?? '');
    if (r.ok) statut = 'envoyé';
    else detail = String(rep?.error?.message ?? `HTTP ${r.status}`);
  } catch (err) {
    detail = String(err);
  }
  const id = `parr-${o.demandeId}-whatsapp`;
  const maintenant = new Date().toISOString();
  await admin.from('envois').upsert({
    id, branch_id: o.branchId,
    data: {
      id, branchId: o.branchId, type: 'parrainage', canal: 'whatsapp', demandeId: o.demandeId, prenom, numero: `+${tel}`,
      moment: `réservation de ${amie}`, statut, ...(detail ? { detail: detail.slice(0, 300) } : {}),
      ...(waId ? { waMessageId: waId } : {}), quand: maintenant,
    },
  }, { onConflict: 'id' });
  if (waId) {
    const idFil = `wa-${waId}`;
    await admin.from('messages_wa').upsert({
      id: idFil, branch_id: o.branchId,
      data: {
        id: idFil, waId, branchId: o.branchId, sens: 'sortant', numero: tel, clientId: o.clientId ?? '',
        texte: `Bonjour ${prenom}, ${amie} vient de réserver avec votre code. Nous vous dirons quand elle sera venue.`,
        type: 'text', quand: maintenant, etat: 'en-route', modele: MODELE, parQui: 'Le Trône · parrainage',
      },
    }, { onConflict: 'id' });
  }
  return statut;
}
/* ══ LE PARRAINAGE : FIN ══ */

async function alerteLePersonnel(titre: string, corps: string, url: string): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const { data: staff } = await admin.from('staff').select('user_id');
  const ids = (staff ?? []).map((s: { user_id: string }) => s.user_id);
  if (ids.length === 0) return 0;
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth,client_id').in('client_id', ids);
  let n = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: titre, body: corps, url, tag: 'mnd-staff' }),
      );
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return n;
}

/* ══ L'ACCUSÉ, DANS LA SECONDE — 18 septembre 2026 ═══════════════════════
   « Accusé tout de suite, puis confirmation » (Yéman, maquette
   `maquette-le-journal-des-envois.html`). La visiteuse qui vient de réserver
   reçoit un mot sur WhatsApp avant même d'avoir fermé la page : sa demande
   est arrivée, la Maison confirme bientôt. « C'est confirmé » ne partira
   qu'au moment où la Maison validera (confirmation-rdv).

   ENVOYÉ D'ICI, PAS PAR LE BALAYAGE : c'est le seul message qu'elle attend en
   fermant la page, et dix minutes de silence après « Réserver » se lisent
   comme un échec.

   SEULEMENT POUR UNE PLACE RÉSERVÉE (arbitrage ③) : une question sans
   créneau reçoit la réponse de la Maison, à la main. Elle a coché la case
   qui autorise la Maison à la contacter au sujet de sa demande : l'accusé
   n'en dit pas plus. Modèle Meta à part, `demande_recue` (UTILITY), car une
   demande reçue n'est pas un rendez-vous confirmé.

   JAMAIS UN REFUS DE RÉSERVATION : sans clés Meta, il ne part pas, sans
   bruit ; un échec s'écrit au journal `envois` avec son motif, et la place
   reste réservée. L'identifiant Meta se garde, au journal et dans le fil :
   c'est lui qui rapproche « remis » et « lu » quand le webhook les apporte. */
const TZ = 'Africa/Porto-Novo';

/** « 10 h », « 14 h 30 » : l'heure telle qu'on la dit. Recopiée de
    confirmation-rdv (une fonction Edge n'importe rien du dépôt). */
const heureLisible = (hhmm: string | undefined): string => {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return hhmm ?? '';
  const [h, m] = (hhmm as string).split(':');
  const minutes = Number(m);
  return Number.isFinite(minutes) && minutes > 0
    ? `${Number(h)} h ${String(minutes).padStart(2, '0')}`
    : `${Number(h)} h`;
};

/** « vendredi 20 septembre 2026 ». Recopiée de confirmation-rdv. L'ANNÉE
    SE DIT (9 octobre 2026) : toute date dite à une cliente la porte, une
    réservation peut se prendre trois mois à l'avance, par-dessus l'an neuf. */
const jourEnClair = (iso: string): string => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
    });
  } catch { return iso; }
};

/* POUR TOUTE DEMANDE, PAS SEULEMENT UNE PLACE — 28 septembre 2026. « Que ce
   soit juste un modèle, mais le message vient en WhatsApp du salon » (Yéman).
   Un rappel, un diagnostic, une carte cadeau reçoivent aussi leur mot du
   salon, et la conversation existe dès lors des deux côtés. Le modèle : celui
   du rendez-vous quand il y a une place (« votre demande de rendez-vous pour
   {{2}} »), sinon `WA_TEMPLATE_ACCUSE_SIMPLE` (« votre demande ({{2}}) ») s'il
   est posé et approuvé, à défaut le même modèle avec un {{2}} qui se lit. */
/* ══ UNE PLACE POSÉE REÇOIT « C'EST CONFIRMÉ » — 29 septembre 2026 ══════
   La place naît confirmée : on n'envoie plus « nous confirmons très vite »
   pour la confirmer dix minutes plus tard. C'est le modèle de la
   confirmation (WA_TEMPLATE_CONF, le même que confirmation-rdv), consigné
   sous SON identifiant `conf-<rdv>-whatsapp` : quand le Trône aura rattaché
   la fiche, le balayage le trouvera et ne l'enverra pas une seconde fois.
   Un échec s'écrit « échec », que le balayage retente, comme les siens. */
async function envoieLAccuse(o: {
  apptId?: string; demandeId: string; branchId: string; prenom: string; telephone: string;
  quand: string; date?: string; time?: string;
}): Promise<string> {
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const MODELE_RDV = Deno.env.get('WA_TEMPLATE_CONF') ?? 'confirmation_rdv';
  const MODELE = o.apptId ? MODELE_RDV : (Deno.env.get('WA_TEMPLATE_ACCUSE_SIMPLE') ?? Deno.env.get('WA_TEMPLATE_ACCUSE') ?? 'demande_recue');
  if (!WA_TOKEN || !WA_PHONE_ID) return 'sans-cles';
  /* Meta veut le numéro international sans « + » ; le serveur l'a déjà mis
     en E.164 (telephoneNormalise). */
  const tel = o.telephone.replace(/\D/g, '');
  if (!tel) return 'sans-numero';
  /* Une visiteuse du site n'a pas de fiche : Madame, comme toute fiche muette. */
  const prenom = appelDe(null, o.prenom);
  const quand = o.quand;

  let statut = 'échec';
  let detail: string | undefined;
  let codeMeta: number | undefined;
  let waId = '';
  try {
    /* Huit secondes au plus : la visiteuse attend la réponse du bouton. */
    const garde = new AbortController();
    const minuterie = setTimeout(() => garde.abort(), 8000);
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: tel,
        type: 'template',
        template: {
          name: MODELE,
          language: { code: 'fr' },
          components: [{
            type: 'body',
            parameters: [{ type: 'text', text: prenom }, { type: 'text', text: quand }],
          }],
        },
      }),
      signal: garde.signal,
    });
    clearTimeout(minuterie);
    const rep = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
    waId = String(rep?.messages?.[0]?.id ?? '');
    if (r.ok) {
      statut = 'envoyé';
      if (!waId) detail = 'accepté sans identifiant Meta';
    } else {
      codeMeta = Number(rep?.error?.code) || undefined;
      detail = String(rep?.error?.message ?? `HTTP ${r.status}`);
    }
  } catch (e) {
    detail = String(e);
  }

  const id = o.apptId ? `conf-${o.apptId}-whatsapp` : `acc-${o.demandeId}-whatsapp`;
  const maintenant = new Date().toISOString();
  await admin.from('envois').upsert({
    id,
    branch_id: o.branchId,
    data: {
      id, branchId: o.branchId, type: o.apptId ? 'confirmation' : 'accuse', canal: 'whatsapp',
      ...(o.apptId ? { apptId: o.apptId } : {}), demandeId: o.demandeId, prenom, numero: `+${tel}`,
      ...(o.date ? { dateRdv: o.date } : {}), ...(o.time ? { heure: o.time } : {}), moment: o.quand, statut,
      ...(detail ? { detail: detail.slice(0, 300) } : {}),
      ...(codeMeta ? { codeMeta } : {}),
      ...(waId ? { waMessageId: waId } : {}),
      quand: maintenant,
    },
  }, { onConflict: 'id' });

  /* DANS LE FIL : la Maison voit ce que la visiteuse a reçu avant de lui
     répondre. Même forme que les rappels (rappels-j1). */
  if (waId) {
    const idFil = `wa-${waId}`;
    const { error } = await admin.from('messages_wa').upsert({
      id: idFil,
      branch_id: o.branchId,
      data: {
        id: idFil, waId, branchId: o.branchId, sens: 'sortant', numero: tel, clientId: '',
        texte: o.apptId
          ? `Bonjour ${prenom}, c'est confirmé : votre rendez-vous est retenu ${quand}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`
          : `Bonjour ${prenom}, la Maison MND a bien reçu votre demande (${quand}). Nous vous répondons très vite, sur ce numéro.`,
        type: 'text', quand: maintenant, etat: 'en-route', modele: MODELE, parQui: 'Le Trône',
      },
    }, { onConflict: 'id' });
    if (error) console.error('demande-submit: fil', error.message);
  }
  return statut;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method', version: VERSION }, 405);
  const ip = ipOf(req);

  const corps = await req.text();
  if (corps.length > 5_000) return json({ error: 'too_large' }, 400);
  let body: Record<string, unknown>;
  try { body = JSON.parse(corps); } catch { return json({ error: 'bad_request' }, 400); }

  /* « QUI » PASSE AVANT LE SEAU DES DÉPÔTS — 9 octobre 2026, avec le sien :
     chaque ouverture de `/reserver/?code=` en fait un ou deux, et trois
     ouvertures suffisaient à refuser la réservation qui suivait. */
  if (body.parrainage === 'qui') {
    if (!(await allowRate(ip, 'parrainage_qui', 30))) return json({ error: 'rate_limited' }, 429);
    return await quiOffre(body);
  }
  /* Le site ne crée plus de code (De main en main) : réponse sans base. */
  if (body.parrainage === true) return json({ error: 'parrainage_ferme' }, 409);
  if (!(await allowRate(ip))) return json({ error: 'rate_limited' }, 429);

  const genre = String(body.genre ?? 'prospect');
  const d = (body.data ?? {}) as Record<string, unknown>;
  if (!GENRES.has(genre)) return json({ error: 'genre' }, 400);
  if (d.consentement !== true) return json({ error: 'consentement' }, 400);

  const telephone = telephoneNormalise(String(d.telephone ?? ''), String(d.dial ?? '+229'));
  if (!telephone) return json({ error: 'telephone' }, 400);
  const besoin = BESOINS.has(String(d.besoin)) ? String(d.besoin) : 'inconnu';
  /* LE CALIBRE ANNONCÉ — 28 septembre 2026 : la tranche de locks que la
     visiteuse a choisie sur le site (son représentant, et son nom). Borné,
     jamais cru sur parole pour le prix : le Trône compte au fauteuil. */
  const lockCount = Math.max(0, Math.min(2000, Math.round(Number(d.lockCount) || 0)));
  const calibre = texte(d.calibre, 30);
  const prenom = texte(d.prenom, 60);
  const email = texte(d.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'email' }, 400);

  /* La place demandée, s'il y en a une. */
  const serviceIds = Array.isArray(d.serviceIds)
    ? (d.serviceIds as unknown[]).slice(0, 6).map((x) => texte(x, 60)).filter(Boolean)
    : [];
  const date = texte(d.date, 10);
  const time = texte(d.time, 5);
  const avecPlace = serviceIds.length > 0 && !!date && !!time;

  /* Le doublon : la MÊME PLACE pour le même numéro, ou le même besoin dans
     les 24 h. On rend l'identifiant connu, la Maison n'a qu'une ligne. */
  const depuis = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const deja = admin.from('demandes').select('id, data').eq('data->>telephone', telephone).limit(1);
  const { data: memes } = avecPlace
    ? await deja.eq('data->>date', date).eq('data->>time', time)
    : await deja.eq('data->>besoin', besoin).gte('updated_at', depuis);
  if (memes && memes.length > 0) return json({ ok: true, id: memes[0].id, deja: true });

  const id = `dem-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const branche = await brancheParDefaut(String(d.branchId ?? ''));
  const branchId = branche.id;

  /* ── La place, revérifiée AVANT d'écrire quoi que ce soit ───────── */
  /* Le maître ATTENDU (le premier libre) : le verrou peut en prendre un
     autre, encore libre, et la demande suit alors le rendez-vous. */
  let master = '';
  /** Les maîtres libres à cette heure, dans l'ordre de la Maison. */
  let maitresLibres: string[] = [];
  /** La durée du rituel, figée sur le rendez-vous à la pose. */
  let dureeMin = 0;
  /* Le code, résolu ICI : le navigateur ne dit que le code. Celui d'une
     amie arrive dans `codeAmie` depuis le 9 octobre au soir (le site le
     sépare du code d'une offre pour que l'ANCIENNE fonction, qui ne lit que
     `code`, n'honore pas un ancien code si le site part avant elle) ; les
     deux se résolvent ici de la même façon. */
  const codeEcrit = d.codeAmie ?? d.code;
  let duCode: VerdictDuCode = { code: '' };
  let nomsDesGestes: string[] = [];
  if (avecPlace) {
    const verdict = await laPlaceDemandee({ branche: branche.ligne, serviceIds, date, time });
    if ('erreur' in verdict) return json({ error: verdict.erreur }, verdict.erreur === 'agenda_illisible' ? 503 : 409);
    maitresLibres = verdict.maitres;
    dureeMin = verdict.dureeMin;
    master = verdict.maitres[0] ?? '';
    nomsDesGestes = serviceIds.map((sid: string) => verdict.catalogue.find((x) => x.id === sid)?.data?.name ?? sid);
    duCode = remiseDuCode({ code: codeEcrit, serviceIds, branchId, catalogue: verdict.catalogue, offres: verdict.offres });
    /* Une fois par personne : la remise tombe, la réservation tient. */
    if (duCode.remisesLignes && await codeDejaUtilise(duCode.code, telephone)) {
      duCode = { code: duCode.code, offreId: duCode.offreId, raison: 'deja-utilise' };
    }
    /* Aucune offre ne le connaît : est-ce le code d'une marraine ? */
    if (duCode.raison === 'inconnu') {
      duCode = (await verdictDuParrainage(duCode.code, telephone, {
        serviceIds, catalogue: verdict.catalogue, familles: verdict.familles,
      }).catch(() => null)) ?? duCode;
    }
  } else if (FORME_DU_CODE.test(codeNormalise(codeEcrit))) {
    /* LA DEMANDE DE RAPPEL PORTE AUSSI LE CODE D'UNE GRAINE — 9 octobre 2026
       au soir. L'amie qui veut créer sa couronne passe par une consultation,
       sans place : son code se résout comme à la réservation, sans remise
       (aucune ligne), et la demande garde `parrainDe` et `marraineId` pour
       que le Trône la voie dans la lignée de sa marraine dès qu'il la
       convertit. Aucun message de plus : la marraine n'est prévenue que d'une
       place réellement posée. */
    const code = codeNormalise(codeEcrit);
    duCode = (await verdictDuParrainage(code, telephone).catch(() => null)) ?? { code, raison: 'inconnu' };
  }

  const demande = {
    id,
    genre,
    createdAt: now,
    branchId,
    prenom,
    telephone,
    ...(email ? { email } : {}),
    besoin,
    ...(d.profil ? { profil: texte(d.profil, 80) } : {}),
    ...(d.mot ? { mot: texte(d.mot, 1000) } : {}),
    ...(lockCount ? { lockCount, ...(calibre ? { calibre } : {}) } : {}),
    source: 'site',
    ...(d.page ? { page: texte(d.page, 120) } : {}),
    ...(d.campagne ? { campagne: texte(d.campagne, 80) } : {}),
    ...(avecPlace ? { serviceIds, date, time, master } : {}),
    ...(duCode.code ? { code: duCode.code } : {}),
    ...(duCode.offreId ? { offreId: duCode.offreId } : {}),
    ...(duCode.raison ? { codeRaison: duCode.raison } : {}),
    ...(duCode.raison === 'parrainage' ? {
      parrainDe: duCode.code, marraineId: duCode.marraineId,
      ...(duCode.marraineClientId ? { marraineClientId: duCode.marraineClientId } : {}),
      ...(duCode.cadeau ? { cadeauFilleule: duCode.cadeau } : {}),
    } : {}),
    consentementLe: now,
    statut: 'nouvelle',
  } as Record<string, unknown>;

  const { error } = await admin.from('demandes').insert({ id, genre, branch_id: branchId, data: demande });
  if (error) return json({ error: 'insert_failed' }, 500);
  /* LA DEMANDE ATTERRIT DANS LES CONVERSATIONS — 28 septembre 2026. « Quand
     la cliente fait une demande sur le site, j'aimerais que son message
     atterrisse dans les Conversations » (Yéman). Elle s'écrit dans le fil de
     son numéro comme un message d'elle, marqué `canal: 'site'` : Meta ne l'a
     pas vu, il n'ouvre pas la fenêtre de 24 heures (fenetreDe), et l'écran le
     dit « Depuis le site ». Un échec ici ne défait rien : la demande est
     posée, le journal le dira. */
  {
    const tel = telephone.replace(/\D/g, '');
    const idFil = `site-${id}`;
    const texteDuFil = [
      `${genre === 'rdv' ? 'Demande de rendez-vous' : 'Demande'} depuis le site${d.page ? ` · ${texte(d.page, 120)}` : ''}`,
      `${BESOIN_DIT[besoin] ?? besoin}${d.profil ? ` · ${texte(d.profil, 80)}` : ''}`,
      lockCount ? `Calibre annoncé : ${calibre || `${lockCount} locks`}` : '',
      avecPlace ? `${nomsDesGestes.join(', ')} · le ${jourEnClair(date)} à ${heureLisible(time)}` : '',
      d.mot ? `« ${texte(d.mot, 1000)} »` : '',
    ].filter(Boolean).join('\n');
    const { error: errFil } = await admin.from('messages_wa').upsert({
      id: idFil,
      branch_id: branchId,
      data: {
        id: idFil, branchId, sens: 'entrant', canal: 'site', numero: tel, clientId: '',
        ...(prenom ? { nomProfil: prenom } : {}), texte: texteDuFil, type: 'text', quand: now, demandeId: id,
      },
    }, { onConflict: 'id' });
    if (errFil) console.error('demande-submit: fil du site', errFil.message);
  }

  /* ── LE RENDEZ-VOUS, POSÉ CONFIRMÉ (29 septembre) ─────────────────
     `clientId` reste VIDE : personne n'a de fiche, et en inventer une ici
     polluerait le carnet. Le Trône, à sa prochaine ouverture, la retrouve
     par le numéro ou la crée (useRattacheLesReservations), et rattache
     alors ce rendez-vous.
     La RLS de `appointments` (0006, `owned_by_data`) fait que cette ligne
     n'est lisible QUE par le personnel : un clientId vide n'appartient à
     aucune session. */
  let apptId: string | undefined;
  if (avecPlace) {
    const candidat = `rdv-${crypto.randomUUID()}`;
    const note = [
      'Réservé depuis le site',
      lockCount ? `Calibre annoncé : ${calibre || `${lockCount} locks`}` : '',
      raisonEnClair(duCode),
      d.mot ? texte(d.mot, 300) : '',
    ].filter(Boolean).join(' · ');
    const appt = {
      id: candidat,
      branchId,
      clientId: '',
      clientName: prenom || 'Demande du site',
      serviceIds,
      date,
      time,
      master,
      /* LA DURÉE SE FIGE À LA POSE (9 octobre 2026), comme au Trône depuis le
         1er septembre : le carnet et les créneaux occupés lisent celle-ci,
         pas le catalogue du jour où on les regarde. */
      dureeMin,
      status: 'confirmé',
      source: 'site',
      creeLe: now,
      note,
      /* Le code se compte ; la remise, par ligne, n'existe que si le code a mordu. */
      ...(duCode.code ? { codeOffre: duCode.code } : {}),
      ...(duCode.offreId ? { offreId: duCode.offreId } : {}),
      ...(duCode.raison ? { codeRaison: duCode.raison } : {}),
      ...(duCode.remisesLignes ? { remisesLignes: duCode.remisesLignes } : {}),
    };
    /* LE VERROU — 9 octobre 2026 (`pose_si_libre`, 0125). Entre la lecture
       ci-dessus et l'écriture, une autre porte (WhatsApp, un second onglet) a
       pu prendre la place : sous un verrou par maison et par jour, la base
       rejoue le plafond, les fauteuils et les maîtres, prend le premier
       encore libre, et écrit le rendez-vous avec sa durée figée. Plus jamais
       d'insertion directe : deux poses au même instant ne passent plus. */
    const { data: pose, error: errPose } = await admin.rpc('pose_si_libre', { p_rdv: appt, p_maitres: maitresLibres });
    const posee = (pose ?? null) as { ok?: boolean; verdict?: string; id?: string; master?: string; raison?: string } | null;
    if (!errPose && posee?.ok === true && posee.id === candidat) {
      apptId = candidat;
      /* L'USAGE SE POSE ICI, ET NULLE PART AILLEURS : le code n'est consommé
         qu'une fois le rendez-vous réellement inscrit avec sa remise. Un
         rendez-vous que la base refuse ne prend pas la fois de la cliente. */
      const applique = duCode.remisesLignes ? { codeApplique: true } : {};
      await admin.from('demandes').update({ data: { ...demande, apptId, master: posee.master ?? master, ...applique } }).eq('id', id);
    } else {
      console.error('demande-submit: place non posée', errPose?.message ?? posee?.raison ?? 'réponse vide');
    }
    /* Si le verrou refuse ou se tait, la demande vit quand même et la Maison
       rappellera : on ne perd jamais une visiteuse pour une ligne. */
  }

  /* L'ACCUSÉ — pour une place réellement posée, jamais pour une question.
     Un échec ne défait rien : la place est prise, le journal le dira. */
  const accuse = await envoieLAccuse({
    apptId, demandeId: id, branchId, prenom, telephone,
    quand: apptId ? `${jourEnClair(date)} à ${heureLisible(time)}` : quandDeLaDemande(genre, texte(d.profil, 80)),
    ...(apptId ? { date, time } : {}),
  }).catch((e) => { console.error('demande-submit: accusé', String(e)); return 'échec'; });

  if (apptId && duCode.raison === 'parrainage' && duCode.marraineTelephone) {
    await previensLaMarraine({
      demandeId: id, branchId, prenomMarraine: duCode.marraine ?? '', prenomAmie: premierMot(prenom),
      telephone: duCode.marraineTelephone, clientId: duCode.marraineClientId,
    }).catch((err) => { console.error('demande-submit: marraine', String(err)); return 'échec'; });
  }

  const quand = avecPlace ? ` · ${date} à ${time}` : '';
  const sent = await alerteLePersonnel(
    apptId ? 'Réservé depuis le site' : (genre === 'rdv' ? 'Demande de rendez-vous depuis le site' : 'Nouvelle demande depuis le site'),
    `${prenom || 'Une visiteuse'} · ${besoin}${quand}`,
    apptId ? '/trone/#/calendrier' : '/trone/#/demandes',
  ).catch(() => 0);
  /* LA RAISON REMONTE À LA PAGE : « déjà utilisé » se dit au clic, pas au
     comptoir. `codeApplique` dit si la remise a réellement porté. */
  return json({
    ok: true, id, apptId, sent, accuse, ...(apptId ? { confirme: true } : {}),
    ...(duCode.code ? { code: duCode.code, codeApplique: !!duCode.remisesLignes } : {}),
    ...(duCode.raison ? { codeRaison: duCode.raison } : {}),
    ...(duCode.raison === 'parrainage' ? { marraine: duCode.marraine, cadeau: duCode.cadeau ?? '' } : {}),
  });
});
