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
// LES PLACES LIMITÉES — 4 novembre 2026 (maquette « Places limitées »,
// « construis », Yéman). La remise d'une offre à places (`placesParJour`) se
// pose D'ELLE-MÊME avec la place : du mardi au vendredi, un jour vide, des
// places décomptées par la base (`places_de_la_remise`, 0154), jamais pour une
// tête aux prix convenus, abonnée ou à remise famille (`une_seule_remise`),
// jamais par-dessus un autre code. Son code ne se tape plus : le site l'envoie
// pour dire qu'il montrait la remise, et si la place est partie, rien ne
// s'écrit et la réponse dit `places_limitees` (le prix ne change jamais en
// silence). La garde de la base (`PLACES_LIMITEES`) départage la dernière
// place sous verrou. `tarifDeLaMaison` : la cliente a choisi le tarif de la
// Maison après une place partie. Le Rituel Sówà™ (`sansRemise`) ne prend
// aucune remise. DANS LE DOUTE, PAS DE REMISE (4 novembre 2026, au soir) :
// si `une_seule_remise` ne se relit pas, la place ne se pose pas, et la
// réponse (`uneSeuleRemise: 'illisible'`) comme la note du rendez-vous le
// disent. Banc : `scripts/verifie-les-places-au-site.mjs --prouve`.
//
// LE RENDEZ-VOUS EN ATTENTE — 17 novembre 2026 (Yéman, arbitrage B de « La
// consultation en affiches »). Un rendez-vous pris sur le site naît EN ATTENTE : la place est
// tenue deux heures, la demande de confirmation part sur WhatsApp (« Je
// confirme », « Un autre moment »), et il ne devient ferme qu'à son oui, plus
// l'acompte réglé quand un geste en porte un dans Paramètres. Sans réponse, la
// base libère la place (0222). La règle : `rendez-vous-en-attente-pur.ts`,
// recopiée entre ses repères ; le patron : le rendez-vous suggéré.
//   · TANT QUE LE MODÈLE N'EST PAS APPROUVÉ, rien ne change : la place naît
//     confirmée comme avant. La bascule : le secret WA_TEMPLATE_ATTENTE posé
//     ET le modèle lu « APPROVED » au Trône (`mnd_modeles_meta`). Un refus du
//     modèle par Meta au moment d'envoyer confirme la place dans la seconde ;
//   · un plafond par numéro (sa clé : 229 97… et 229 01 97… sont une
//     personne) et par adresse, compté sous verrou ; un numéro ne reçoit pas
//     plus de trois modèles du site en vingt-quatre heures ;
//   · l'heure demandée doit être une heure de la grille (le refus d'avant
//     08:30 est celui du juge et du verrou de la base) ;
//   · la durée posée suit le calibre annoncé (`durCoef` du barème) ;
//   · le rituel GBÀTÀ™ (l'atelier du défaisage) se réserve en ligne, sa case
//     « consultation avant » respectée ; création et réparation, jamais ;
//   · un code « une fois par personne » se compte par la clé du numéro ;
//   · un dépôt en double ne rend la référence qu'à l'appareil qui l'a déposé ;
//   · déplacer : deux fois au plus, sous le verrou des places (0223), et la
//     remise d'un jour ne suit pas un autre jour ;
//   · `{ attente: 'reponse' }` : le webhook rend ici le bouton touché, ou un
//     « Je confirme » écrit, qui confirme toutes les places de ce numéro qui
//     attendent son oui (18 novembre 2026) ;
//   · `{ attente: 'non-remis' }` : le webhook rend ici l'accusé « failed » du
//     message de l'attente ; la place se confirme sans attente, comme quand
//     le message ne part pas (18 novembre 2026) ;
//   · `{ couronne: 'reserver' }` : Ma Couronne ne pose plus son rendez-vous
//     depuis le navigateur ; le statut, la durée, l'acompte et la remise des
//     places se décident ici.
//
// Déployez via le tableau de bord (Edge Functions → New function → coller ce
// fichier EN ENTIER). Secrets : SERVICE_KEY (comme push-notify) ; pour
// l'alerte, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (les mêmes).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

/* ⟨en-clair⟩ */
/* LA PRESTATION EN CLAIR (25 novembre 2026, shared/en-clair-pur) : quelques
   mots simples à côté du nom, « Rituel Sówà™ (traitement anti-poux) ». */
const sansAccentsEnClair = (t: string): string =>
  String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Les mots en clair d'une prestation, propres : un espace entre chaque mot,
    rien autour. Vide quand la prestation n'en porte pas. */
const enClairDe = (s: { enClair?: unknown } | null | undefined): string =>
  typeof s?.enClair === 'string' ? s.enClair.replace(/\s+/g, ' ').trim() : '';

/** Le nom, puis ses mots en clair entre parenthèses. Le nom seul quand il n'y
    en a pas, ou quand le nom les dit déjà (« … · lavage et retouche »). */
const nomEtEnClair = (nom: string, enClair?: string | null): string => {
  const n = String(nom ?? '').replace(/\s+/g, ' ').trim();
  const e = String(enClair ?? '').replace(/\s+/g, ' ').trim();
  if (!e || !n) return n;
  return sansAccentsEnClair(n).includes(sansAccentsEnClair(e)) ? n : `${n} (${e})`;
};

/** Les mots en clair de la prestation qui porte CE nom au catalogue : une
    ligne de facture ne garde que le nom écrit le jour de la pièce. Vide quand
    aucune prestation de ce nom n'en porte. */
const enClairDuLibelle = (libelle: string, services: readonly { name?: unknown; enClair?: unknown }[]): string => {
  const l = String(libelle ?? '').replace(/\s+/g, ' ').trim();
  if (!l) return '';
  const s = services.find((x) => typeof x?.name === 'string' && x.name.replace(/\s+/g, ' ').trim() === l && enClairDe(x) !== '');
  return s ? enClairDe(s) : '';
};
/* ⟨/en-clair⟩ */

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
const VERSION = '2026-11-26-a · la liste d attente d un jour plein ({ prevenir: place }, du site et de Ma Couronne, table liste_d_attente 0252, bloc ⟨liste-d-attente⟩) ; 2026-11-25-a · les prestations en clair dans rdv_a_confirmer (« Rituel Sówà™ (traitement anti-poux) ») ; 2026-11-20-b · un petit service partage UNE place avec un seul voisin (placesPrises, places_prises 0242) : plus jamais trois clientes dans deux fauteuils ; 2026-11-20-a · le petit service partage l heure : un rendez-vous d une heure ou moins se pose chez Team a cote de n importe quelle tete, et un petit service et son voisin ne prennent qu une place en ligne (petitService, partagentLaPlace, 0240) ; 2026-11-18-d · deux têtes chez Team : le juge du site, de Ma Couronne et du déplacement lit la tête (le calibre annoncé, la fiche) ; Team reçoit une seconde cliente à la même heure quand l’une des deux a moins de 150 locks, jamais deux lourdes ; le compte annoncé s’écrit sur le rendez-vous (locksAnnonces) ; 2026-11-18-c · une note de « Ses modèles chez Meta » n’éteint plus l’attente : la bascule lit la liste relue chez Meta et les notes de la direction ensemble (⟨modeles-meta⟩) ; 2026-11-18-b · Ma Couronne reconnaît la fiche que la Maison a inscrite avant son compte (la règle d’est_ma_tete : la fiche qui porte son compte, le payeur désigné par sa fiche) ; « Je confirme » écrit confirme toutes les places de ce numéro qui attendent son oui, et la réponse les dit ; un message de l’attente qui ne part pas (échec, plafond) ou que Meta dit non remis confirme la place sans attente, comme un refus du modèle ; 2026-11-18-a · la décoloration se réserve en ligne comme la coloration (son atelier, La Transformation) ; la clé du serveur comparée à temps constant (⟨cle-du-cron⟩) ; l’heure d’un rendez-vous déplacé tenue sur la grille ; le rituel GBÀTÀ™ (le défaisage) se réserve en ligne ; le rendez-vous en attente (la place tenue deux heures, « Je confirme » sur WhatsApp, l’acompte quand un geste en porte un ; tant que le modèle n’est pas approuvé, la place naît confirmée comme avant) ; un plafond par numéro et par adresse ; l’heure tenue sur la grille ; la durée au calibre annoncé ; les codes comptés par la clé du numéro ; déplacer deux fois au plus, sous le verrou des places ; Ma Couronne passe par le serveur ; 2026-11-17-a · le juge du serveur refuse lui aussi avant 08:30 (laPlaceTient, le rendez-vous déplacé) : une page en cache ou un envoi direct ne passe plus ; 2026-11-16-a · plus aucun rendez-vous avant 08:30 (PREMIER_RENDEZ_VOUS_MIN, la place du serveur le sait) ; 2026-11-12-a · le jour même sur le site (ses heures pas encore commencées à Cotonou, place-du-serveur et pose_si_libre 0203) ; 2026-11-07-a · déplacer son rendez-vous depuis le site (les places de la personne qui la reçoit, aussitôt déplacé, 24 h avant au plus tard) ; la réservation jusqu’au dernier jour du troisième mois qui suit (place-du-serveur) ; dans le doute, pas de remise ; les places limitées (jour vide, places décomptées, une seule remise) ; le second fauteuil en semaine ; la référence, la confirmation à liens, la page du rendez-vous, la cliente qui revient';

/** LE SECOND FAUTEUIL, PAS DAVANTAGE (2 novembre 2026, 0152) : la copie de
    `PLACES_EN_LIGNE_AU_PLUS` (src/shared/agenda-pur.ts), hors des repères. */
const PLACES_EN_LIGNE_AU_PLUS = 2;

/** `EdgeRuntime.waitUntil`, s'il existe (la même garde que le webhook) : ce
    qui n'a pas besoin d'être attendu continue après la réponse. Sans lui, la
    promesse court toute seule et la réponse part sans l'attendre. */
function enTacheDeFond(p: Promise<unknown>): void {
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  try { er?.waitUntil?.(p); } catch { /* sans tâche de fond */ }
  p.catch(() => { /* déjà journalisé par l'appelant */ });
}
/** Au plus `ms` : la valeur si elle vient à temps, sinon `sinon`, et la
    promesse continue en tâche de fond. */
async function auPlus<T>(p: Promise<T>, ms: number, sinon: T): Promise<T> {
  const r = await Promise.race([p, new Promise<T>((res) => setTimeout(() => res(sinon), ms))]);
  if (r === sinon) enTacheDeFond(p);
  return r;
}

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
/* COMPTÉ ET ÉCRIT SOUS UN MÊME VERROU — 17 novembre 2026 (`debit_permis`,
   0222) : la base compte et inscrit d'un seul geste. Tant qu'elle ne porte
   pas la fonction, l'ancien chemin sert. `minutes` : la fenêtre (dix
   minutes, ou un jour pour les plafonds des places). */
async function allowRate(ip: string, seau: string = RATE_BUCKET, plafond: number = RATE_MAX, minutes: number = RATE_WINDOW_MIN): Promise<boolean> {
  const { data: permis, error: errPermis } = await admin.rpc('debit_permis', { p_seau: seau, p_cle: ip, p_plafond: plafond, p_minutes: minutes });
  if (!errPermis && typeof permis === 'boolean') return permis;
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
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
  /* HORS BÉNIN, LE ZÉRO DE TÊTE TOMBE — 11 octobre 2026 : « 06 12 34 56 78 »
     avec +33 doit donner +33612345678, pas +330612345678. Au Bénin, le 01
     fait partie du numéro depuis 2024. */
  return `+${indicatif}${indicatif === '229' ? chiffres : chiffres.replace(/^0/, '')}`;
}

const GENRES = new Set(['prospect', 'rdv']);
const BESOINS = new Set(['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu']);
const BESOIN_DIT: Record<string, string> = {
  creation: 'Créer ma couronne', reparation: 'Réparer ma couronne', entretien: 'Entretenir ma couronne',
  enfant: 'Pour mon enfant', formation: 'Apprendre le métier', inconnu: 'Ne sait pas encore',
};
/* L'ACCUSÉ, SES MODÈLES ET SES MOTS — 15 octobre 2026. Bloc RECOPIÉ tel quel
   de `src/shared/accuse-du-site.ts` (pourquoi, et la règle des trois
   accusés, y sont écrits) ; `verifie-l-accuse-du-site` confronte les deux.
   NE RIEN RETOUCHER ENTRE LES REPÈRES. */
/* ⟨accuse-du-site⟩ */
/** Le {{2}} d'une demande sans place : ce qu'elle a demandé, dit à elle. */
export const POUR_LE_RAPPEL: Record<string, string> = {
  creation: 'un rappel pour créer votre couronne',
  reparation: 'un rappel pour réparer votre couronne',
  entretien: 'un rappel pour entretenir votre couronne',
  enfant: 'un rappel pour votre enfant',
  formation: 'un rappel pour apprendre le métier',
};
export const quandDeLaDemande = (profil: string, besoin: string): string =>
  profil === 'Carte cadeau' ? 'une carte cadeau'
    : profil === 'Diagnostic locks' ? 'votre routine locks'
      : profil === 'Testeuse' ? 'votre inscription comme testeuse'
        : POUR_LE_RAPPEL[besoin] ?? 'un rappel de la Maison';

export type GenreDAccuse = 'confirmation' | 'demande-de-place' | 'rappel';
export const genreDAccuse = (o: { pose: boolean; avecPlace: boolean }): GenreDAccuse =>
  o.pose ? 'confirmation' : o.avecPlace ? 'demande-de-place' : 'rappel';

/** Le modèle Meta de chaque accusé. '' : aucun modèle juste, rien ne part. */
export const modeleDeLAccuse = (
  genre: GenreDAccuse,
  secrets: { conf?: string; accuse?: string; simple?: string },
): string =>
  genre === 'confirmation' ? (secrets.conf || 'confirmation_rdv')
    : genre === 'demande-de-place' ? (secrets.accuse || 'demande_recue')
      : (secrets.simple || '');

/** Ce que le fil des Conversations montre : le texte du modèle, rempli. */
export const texteDeLAccuse = (genre: GenreDAccuse, appel: string, quand: string): string =>
  genre === 'confirmation'
    ? `Bonjour ${appel}, c'est confirmé : votre rendez-vous est retenu ${quand}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`
    : genre === 'demande-de-place'
      ? `Bonjour ${appel}, la Maison MND a bien reçu votre demande de rendez-vous pour le ${quand}. Nous vous confirmerons très prochainement votre créneau sur ce même numéro.`
      : `Bonjour ${appel}, la Maison MND a bien reçu votre demande (${quand}). Nous vous répondons très vite, sur ce numéro.`;
/* ⟨/accuse-du-site⟩ */

/* LE RENDEZ-VOUS EN ATTENTE — 17 novembre 2026. Bloc RECOPIÉ tel quel de
   `src/shared/rendez-vous-en-attente-pur.ts` (la place tenue deux heures, son
   oui, l'acompte, les plafonds, la clé du numéro, la limite des déplacements ;
   ses choix y sont écrits) ; `verifie-les-douze-lunes` confronte les copies.
   NE RIEN RETOUCHER ENTRE LES REPÈRES. */
/* ⟨rendez-vous-en-attente⟩ */
/** Deux heures : la place d'un rendez-vous pris en ligne se tient ce temps-là sans son oui. */
export const DELAI_DE_L_ATTENTE_MS = 2 * 3_600_000;
/** Son oui donné, il reste l'acompte : la place se tient encore trente minutes au moins. */
export const SURSIS_DE_L_ACOMPTE_MS = 30 * 60_000;
/** Un même numéro ne tient pas plus de trois places sans les avoir confirmées
    (une mère et deux enfants ; au-delà, c'est un Carnet qu'on remplit). */
export const EN_ATTENTE_PAR_NUMERO = 3;
/** Un même numéro ne pose pas plus de cinq places en vingt-quatre heures, confirmées ou non. */
export const POSES_PAR_NUMERO_ET_PAR_JOUR = 5;
/** Une même adresse ne pose pas plus de douze places en vingt-quatre heures
    (un opérateur mobile partage une adresse entre plusieurs téléphones). */
export const POSES_PAR_ADRESSE_ET_PAR_JOUR = 12;
/** Un même numéro ne reçoit pas plus de cinq modèles du site en vingt-quatre
    heures (autant que de places : chaque place tenue envoie le sien). */
export const MODELES_PAR_NUMERO_ET_PAR_JOUR = 5;
/** Un rendez-vous se déplace deux fois depuis le site, pas davantage. */
export const DEPLACEMENTS_AU_PLUS = 2;

/** Les marques que lit le juge. */
export type MarquesDeLAttente = {
  status?: unknown; attenduJusquAu?: unknown; confirmeeParLaClienteLe?: unknown;
  depositXof?: unknown; depositConfirmed?: unknown; placeLibereeLe?: unknown; autreMomentDemandeLe?: unknown;
  /** « Elle a dit oui », noté au comptoir (`noteSonOui`). */
  ouiNoteParLeComptoir?: unknown;
  /** Le jour et l'heure du rendez-vous, à Porto-Novo. */
  date?: unknown; time?: unknown;
};
const marqueDite = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

/** « AAAA-MM-JJ HH:MM » à Porto-Novo (UTC+1, sans heure d'été) : comme un
    rendez-vous écrit son jour et son heure, et comme la base les compare. */
export const minuteDePortoNovo = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 16).replace('T', ' ');

/** Le début du rendez-vous, « AAAA-MM-JJ HH:MM » ; `null` quand il ne se lit pas. */
export function debutDuRendezVous(a: { date?: unknown; time?: unknown } | null | undefined): string | null {
  const jour = typeof a?.date === 'string' ? a.date : '';
  const heure = typeof a?.time === 'string' ? a.time : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(jour) && /^\d{2}:\d{2}$/.test(heure) ? `${jour} ${heure}` : null;
}

/** SON OUI NOTÉ AU COMPTOIR (« Elle a dit oui », 18 novembre 2026) : la
    Maison tient la place. L'acompte reste attendu, la place ne se libère pas. */
export const ouiDuComptoir = (a: MarquesDeLAttente | null | undefined): boolean =>
  !!a && marqueDite(a.confirmeeParLaClienteLe) && a.ouiNoteParLeComptoir === true;

/** L'acompte que porte le rendez-vous, en francs ; zéro quand il n'en porte pas. */
export const acompteAttendu = (a: MarquesDeLAttente | null | undefined): number => {
  const n = Math.round(Number(a?.depositXof));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** FERME : son oui, et l'acompte reçu quand la prestation en porte un. */
export function estFerme(a: MarquesDeLAttente | null | undefined): boolean {
  if (!a || !marqueDite(a.confirmeeParLaClienteLe)) return false;
  return acompteAttendu(a) <= 0 || a.depositConfirmed === true;
}

/** EN ATTENTE : née d'une porte en ligne (`attenduJusquAu`), tenue, pas encore ferme. */
export function estEnAttente(a: MarquesDeLAttente | null | undefined): boolean {
  return !!a && a.status === 'confirmé' && marqueDite(a.attenduJusquAu) && !estFerme(a);
}

/** L'échéance est passée sans que le rendez-vous soit ferme : la place se
    libère. JAMAIS une place dont l'heure est venue (18 novembre 2026) : prise à
    13 h 30 pour 14 h, elle est au fauteuil quand ses deux heures passent. Seule
    se libère une place dont le jour et l'heure, à Porto-Novo, sont encore à
    venir ; un jour ou une heure qui ne se lisent pas la gardent. Ni une place
    dont le comptoir a noté le oui (`ouiDuComptoir`). */
export function placeALiberer(a: MarquesDeLAttente | null | undefined, maintenantMs: number): boolean {
  if (!estEnAttente(a) || ouiDuComptoir(a) || !Number.isFinite(maintenantMs)) return false;
  const debut = debutDuRendezVous(a);
  if (debut === null || debut <= minuteDePortoNovo(maintenantMs)) return false;
  const t = Date.parse(String(a?.attenduJusquAu));
  return Number.isFinite(t) && Number.isFinite(maintenantMs) && t <= maintenantMs;
}

export type EtatDeLAttente = 'sans-reponse' | 'acompte' | 'ferme' | 'liberee';
/** Où en est un rendez-vous né en attente. `null` : il n'est pas né en attente. */
export function etatDeLAttente(a: MarquesDeLAttente | null | undefined): EtatDeLAttente | null {
  if (!a || !marqueDite(a.attenduJusquAu)) return null;
  if (a.status === 'annulé') return marqueDite(a.placeLibereeLe) ? 'liberee' : null;
  if (estFerme(a)) return 'ferme';
  if (a.status !== 'confirmé') return null;
  return marqueDite(a.confirmeeParLaClienteLe) ? 'acompte' : 'sans-reponse';
}

/** « 14 h 32 » : l'heure de Cotonou d'un instant (UTC+1, sans heure d'été). */
export function heureDeCotonouDite(iso: unknown): string {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 3_600_000);
  const m = d.getUTCMinutes();
  return m > 0 ? `${d.getUTCHours()} h ${String(m).padStart(2, '0')}` : `${d.getUTCHours()} h`;
}

/** Ce que la pose écrit : la marque d'une place sans son oui, et son échéance. */
export function marquesDeLaNaissance(maintenantMs: number): { suggereLe: string; attenduJusquAu: string } {
  return { suggereLe: new Date(maintenantMs).toISOString(), attenduJusquAu: new Date(maintenantMs + DELAI_DE_L_ATTENTE_MS).toISOString() };
}

/** Ce que son oui écrit. Avec un acompte encore dû, l'échéance recule à trente
    minutes au moins : elle ne perd pas sa place pendant qu'elle paie. */
export function marquesDuOui(a: MarquesDeLAttente, maintenantMs: number): { confirmeeParLaClienteLe: string; relanceFaite: true; attenduJusquAu?: string } {
  const le = new Date(maintenantMs).toISOString();
  if (acompteAttendu(a) <= 0 || a.depositConfirmed === true) return { confirmeeParLaClienteLe: le, relanceFaite: true };
  const echeance = Date.parse(String(a.attenduJusquAu));
  const sursis = maintenantMs + SURSIS_DE_L_ACOMPTE_MS;
  return {
    confirmeeParLaClienteLe: le, relanceFaite: true,
    attenduJusquAu: new Date(Number.isFinite(echeance) && echeance > sursis ? echeance : sursis).toISOString(),
  };
}

/** Ce que la libération écrit : ni elle ni la Maison n'ont annulé, la place s'est rendue. */
export function marquesDeLaLiberation(maintenantMs: number): { status: 'annulé'; annuleeLe: string; placeLibereeLe: string } {
  const le = new Date(maintenantMs).toISOString();
  return { status: 'annulé', annuleeLe: le, placeLibereeLe: le };
}

/** LA CLÉ D'UN NUMÉRO, pour COMPARER seulement : 229 97 00 00 99 (l'ancien
    plan, celui que Meta livre) et 229 01 97 00 00 99 (le plan de 2024) sont la
    même personne. La règle de `cleWa` (webhook, automate) et de
    `cle_du_numero_wa` (0128). */
export function cleDuNumero(brut: unknown): string {
  let d = String(brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) d = d.slice(2);
  else if (!d.startsWith('229') && d.length === 10 && d.startsWith('01')) d = `229${d}`;
  else if (!d.startsWith('229') && d.length === 8) d = `22901${d}`;
  return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
}

/** Les graphies E.164 qui partagent la clé d'un numéro : au Bénin, avec et
    sans le 01 de 2024 ; ailleurs, lui seul. Pour relire ce qui a été écrit
    avant que la clé existe. */
export function formesDuNumero(telephone: unknown): string[] {
  const cle = cleDuNumero(telephone);
  if (!cle) return [];
  if (cle.length === 11 && cle.startsWith('229')) return [`+22901${cle.slice(3)}`, `+${cle}`];
  return [`+${cle}`];
}

export type RefusDuPlafond = 'trop_de_demandes' | 'trop_en_attente';
/** LE PLAFOND D'UN NUMÉRO : ses places posées depuis vingt-quatre heures, et
    celles qu'il tient encore sans les avoir confirmées. `attente` : la place
    qu'on pose naîtrait en attente. */
export function plafondDuNumero(o: { posesDuJour: number; enAttente: number; attente: boolean }): RefusDuPlafond | null {
  if (o.posesDuJour >= POSES_PAR_NUMERO_ET_PAR_JOUR) return 'trop_de_demandes';
  if (o.attente && o.enAttente >= EN_ATTENTE_PAR_NUMERO) return 'trop_en_attente';
  return null;
}

/** Combien de fois elle l'a déjà déplacé depuis le site. Un rendez-vous
    déplacé avant que le compte existe (`deplaceLe` seul) en compte un. */
export const deplacementsFaits = (a: { deplacements?: unknown; deplaceLe?: unknown; deplacePar?: unknown } | null | undefined): number => {
  const n = Math.round(Number(a?.deplacements));
  const comptes = Number.isFinite(n) && n > 0 ? n : 0;
  return Math.max(comptes, marqueDite(a?.deplaceLe) && a?.deplacePar === 'site' ? 1 : 0);
};
export const peutEncoreSeDeplacer = (a: { deplacements?: unknown; deplaceLe?: unknown; deplacePar?: unknown } | null | undefined): boolean =>
  deplacementsFaits(a) < DEPLACEMENTS_AU_PLUS;

/** LA REMISE SUIT-ELLE LE RENDEZ-VOUS À SON NOUVEAU JOUR ? Une autre heure le
    même jour ne change rien, et la remise de bienvenue d'une amie n'est
    liée à aucun jour. Un autre jour : la place limitée était celle de ce
    jour-là, elle ne suit pas ; l'offre d'un jour de la semaine (le mercredi
    de la Maison) suit quand le nouveau jour en est un ; l'offre d'une saison
    suit. Une offre qu'on ne retrouve plus : dans le doute, pas de remise. */
export function remiseGardeeAuDeplacement(o: {
  aUneRemise: boolean; memeJour: boolean; bienvenue: boolean; offreConnue: boolean; aPlaces: boolean; lieeAuJour: boolean; tombeBien: boolean;
}): boolean {
  if (!o.aUneRemise || o.memeJour || o.bienvenue) return true;
  if (!o.offreConnue || o.aPlaces) return false;
  return !o.lieeAuJour || o.tombeBien;
}

/** L'ACOMPTE D'UN PANIER : chaque geste à son taux (Paramètres ›
    Réservation et acompte, `depositPctByService`), sur le prix que le
    serveur connaît. La règle de `depositForServices` (settings.ts). */
export function acompteDesGestes(lignes: readonly { id: string; prixXof: number }[], tauxParGeste: unknown): number {
  const taux = tauxParGeste && typeof tauxParGeste === 'object' && !Array.isArray(tauxParGeste) ? tauxParGeste as Record<string, unknown> : {};
  const pct = (id: string): number => {
    const p = Number(taux[id]);
    return Number.isFinite(p) && p > 0 && p <= 100 ? p : 0;
  };
  return Math.round(lignes.reduce((n, l) => n + Math.max(0, Number(l.prixXof) || 0) * (pct(l.id) / 100), 0));
}

/** L'HEURE EST-ELLE UNE HEURE DE LA GRILLE DU JOUR ? La grille de
    `creneauxLibres` (agenda-pur) : de l'ouverture à la fermeture, au pas de la
    Maison, un point d'avant le premier rendez-vous posé au premier rendez-vous
    (08:30). L'écran ne propose que ces heures-là ; le serveur n'en accepte pas
    d'autre, quoi que dise un appel direct. */
export function heureSurLaGrille(o: { openMin: number; closeMin: number; debutMin: number; premierMin: number; pasMin?: number }): boolean {
  const pas = o.pasMin && o.pasMin > 0 ? o.pasMin : 60;
  if (!Number.isFinite(o.debutMin) || !(o.closeMin > o.openMin)) return false;
  for (let g = o.openMin; g < o.closeMin; g += pas) {
    if (Math.max(g, o.premierMin) === o.debutMin) return true;
  }
  return false;
}

/* LA DURÉE AU CALIBRE ANNONCÉ. Le barème de la Maison porte, par tranche de
   locks, un coefficient de prix ET un coefficient de durée (`durCoef`) : une
   tête Micro demande plus de temps qu'une Medium. La durée posée depuis le
   site l'ignorait : la place tenue était trop courte, et le rituel suivant
   posé dessus. La règle est celle de `personalDurationMin` (pricing.ts) pour
   une visiteuse sans fiche : la tranche de son compte de locks, dans le
   barème de l'atelier du geste s'il en a un, sinon celui de la Maison ; les
   seuls gestes qui suivent le modèle ; jamais les quatre prix fixes ; rien
   quand le barème est suspendu ; au quart d'heure, quinze minutes au moins. */
const GESTES_HORS_BAREME: readonly string[] = ['sv-gbigbi-essentiel', 'sv-rituel-mq6wbusw', 'sv-rituel-mq6zu12s', 'sv-rituel-mp2qnjwa'];
type TrancheDeDuree = { maxLocks: number | null; durCoef: number };
const tranchesLues = (v: unknown): TrancheDeDuree[] => (Array.isArray(v) ? v as { maxLocks?: unknown; durCoef?: unknown }[] : [])
  .map((b) => ({ maxLocks: b?.maxLocks === null || b?.maxLocks === undefined ? null : Number(b.maxLocks), durCoef: Number(b?.durCoef) }))
  .filter((b) => (b.maxLocks === null || Number.isFinite(b.maxLocks)) && Number.isFinite(b.durCoef) && b.durCoef > 0)
  .sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));

export type ContexteDeDuree = {
  /** Le compte de locks annoncé (le représentant de sa tranche). 0 : rien d'annoncé. */
  lockCount: number;
  /** `mnd_model_bands` : le barème de la Maison. */
  bandes: unknown;
  /** `mnd_model_band_sets` : les barèmes par atelier. */
  sets?: unknown;
  categories?: readonly { id: string; parentId?: string }[];
  /** `mnd_settings.baremeSuspendu`. */
  suspendu?: boolean;
};
type GesteADuree = { id: string; categoryId?: string; durationMin?: number; scalesWithModel?: boolean };

/** La durée d'un geste pour ce calibre ; celle du catalogue quand rien ne la change. */
export function dureeAuCalibre(s: GesteADuree, o: ContexteDeDuree): number | undefined {
  const base = s.durationMin;
  if (base === undefined || !Number.isFinite(base) || !(o.lockCount > 0) || o.suspendu === true) return base;
  if (s.scalesWithModel !== true || GESTES_HORS_BAREME.includes(s.id)) return base;
  const sets = o.sets && typeof o.sets === 'object' && !Array.isArray(o.sets) ? o.sets as Record<string, unknown> : {};
  let tranches = tranchesLues(o.bandes);
  let id: string | undefined = s.categoryId;
  for (let i = 0; id && i < 8; i += 1) {
    const propres = tranchesLues(sets[id]);
    if (propres.length) { tranches = propres; break; }
    const parent: string | undefined = o.categories?.find((c) => c.id === id)?.parentId;
    id = parent;
  }
  if (tranches.length === 0) return base;
  const tranche = tranches.find((b) => o.lockCount <= (b.maxLocks ?? Infinity)) ?? tranches[tranches.length - 1];
  return Math.max(15, Math.round((base * tranche.durCoef) / 15) * 15);
}

/** Le catalogue, chaque geste à sa durée pour ce calibre : ce que le juge des
    places et l'écran lisent à la place du catalogue nu. */
export function gestesAuCalibre<S extends GesteADuree>(gestes: readonly S[], o: ContexteDeDuree): S[] {
  return gestes.map((s) => {
    const d = dureeAuCalibre(s, o);
    return d === s.durationMin ? s : { ...s, durationMin: d };
  });
}

/* LE DÉFAISAGE SE RÉSERVE EN LIGNE — 17 novembre 2026. Yéman : sur le site,
   une cliente qui veut défaire ses locks et garder ses cheveux libres réserve
   tout de suite le rituel GBÀTÀ™, sans visio ni consultation privée. Le juge
   des places ne connaît que ses ateliers qui se réservent (l'Entretien, la
   Coloration, la décoloration). POUR LA PORTE DU SITE SEULEMENT, l'atelier du défaisage,
   quand il est un atelier à lui (sans parent : rangé sous FÍNFÍN™, il reste
   une restauration et passe par la consultation), se lit comme rangé sous un
   atelier qui se réserve. Rien d'autre ne s'ouvre, et rien du geste ne
   change : sa case « consultation avant », un prix sur devis, un geste éteint
   ou décoché pour le site le ferment toujours ; le juge les lit lui-même. */
export const ATELIERS_DU_DEFAISAGE: readonly string[] = ['cat-defaisage', 'plt-45'];
/** Les familles, telles que le juge des places du site les lit. */
export function famillesAvecLeDefaisage(
  familles: readonly { id: string; parentId?: string }[], ateliersQuiSeReservent: readonly string[],
): { id: string; parentId?: string }[] {
  const sous = ateliersQuiSeReservent.find((id) => familles.some((c) => c.id === id));
  if (!sous) return [...familles];
  const lues = familles.map((c) => (ATELIERS_DU_DEFAISAGE.includes(c.id) && !c.parentId ? { ...c, parentId: sous } : c));
  /* Un catalogue qui range ses gestes dans l'atelier sans en porter la ligne. */
  for (const id of ATELIERS_DU_DEFAISAGE) if (!familles.some((c) => c.id === id)) lues.push({ id, parentId: sous });
  return lues;
}

/** Le nom du modèle Meta de l'attente, tant que le secret n'en dit pas un autre. */
export const MODELE_DE_L_ATTENTE = 'rdv_a_confirmer';

/** Le message de la place tenue (le modèle `rdv_a_confirmer`, {{1}} l'appel,
    {{2}} le moment, {{3}} les gestes). Meta refuse un corps qui finit par une
    variable : il finit par la règle. */
export function texteDeLAttente(o: { appel: string; quand: string; gestes: string }): string {
  return `Bonjour ${o.appel}, la Maison MND tient votre place le ${o.quand} : ${o.gestes}. Répondez « Je confirme » dans les deux heures pour la garder ; sans réponse, la place se libère.`;
}

/** Les deux réponses, dans cet ordre : les boutons du rendez-vous suggéré
    (REPRISE_OK, REPRISE_AUTRE), que le webhook lit depuis le 29 septembre 2026. */
export function composantsDeLAttente(o: { appel: string; quand: string; gestes: string; apptId: string }): unknown[] {
  return [
    { type: 'body', parameters: [{ type: 'text', text: o.appel }, { type: 'text', text: o.quand }, { type: 'text', text: o.gestes }] },
    { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `REPRISE_OK:${o.apptId}` }] },
    { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `REPRISE_AUTRE:${o.apptId}` }] },
  ];
}

/** Son oui, sans acompte : c'est confirmé, avec sa référence et le lien de son rendez-vous. */
export function texteDuOui(o: { appel: string; quand: string; reference: string; lien: string }): string {
  return `C’est confirmé, ${o.appel} : ${o.quand}. Référence ${o.reference}.${o.lien ? ` Pour déplacer ou annuler : ${o.lien}` : ''}\nLa Maison vous attend.`;
}

/** « JE CONFIRME », ÉCRIT, POUR TOUTES SES PLACES (18 novembre 2026) : une
    mère tient trois places (elle et ses deux enfants) et écrit « Je
    confirme » ; toutes celles qui attendaient son oui se confirment, et la
    phrase dit combien, et lesquelles, une ligne chacune. Une place dont
    l'acompte reste dû le dit sur sa ligne. */
export function texteDesOuis(o: {
  appel: string;
  places: readonly { quand: string; reference: string; lien: string; acompte?: string; jusqua?: string }[];
}): string {
  const NOMBRES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six'];
  const combien = NOMBRES[o.places.length] ?? String(o.places.length);
  const toutes = o.places.every((p) => !p.acompte);
  const lignes = o.places.map((p) => (p.acompte
    ? `· ${p.quand} : il reste l’acompte de ${p.acompte}${p.lien ? ` (${p.lien})` : ''}${p.jusqua ? `, place tenue jusqu’à ${p.jusqua}` : ''}.`
    : `· ${p.quand} : confirmé, référence ${p.reference}.${p.lien ? ` Pour déplacer ou annuler : ${p.lien}` : ''}`));
  return `${toutes ? `C’est confirmé, ${o.appel} : vos ${combien} rendez-vous.` : `Merci ${o.appel}, votre oui est noté pour vos ${combien} rendez-vous.`}\n${lignes.join('\n')}\nLa Maison vous attend.`;
}

/** Son oui, avec un acompte : il reste à le régler, et jusqu'à quand. */
export function texteDeLAcompte(o: { appel: string; quand: string; acompte: string; jusqua: string; lien: string }): string {
  return `Merci ${o.appel}. Il reste l’acompte de ${o.acompte} pour confirmer votre rendez-vous du ${o.quand}${o.lien ? ` : ${o.lien}` : '.'}\nVotre place est tenue jusqu’à ${o.jusqua}.`;
}

/** Elle répond après l'échéance : la place s'est libérée, voici où en reprendre une. */
export function texteDeLaPlaceLiberee(o: { appel: string; quand: string; lien: string }): string {
  return `${o.appel}, votre place du ${o.quand} n’a pas été confirmée dans les deux heures : elle s’est libérée.${o.lien ? `\nChoisissez un nouveau moment ici : ${o.lien}` : ''}`;
}

/** « Un autre moment » : la place est rendue tout de suite, elle en choisit une autre. */
export function texteDeLAutreMoment(o: { appel: string; lien: string }): string {
  return `Bien sûr, ${o.appel}. La place est rendue.${o.lien ? `\nChoisissez votre nouveau moment ici : ${o.lien}` : ''}`;
}
/* ⟨/rendez-vous-en-attente⟩ */

/* LE LIEN DU RENDEZ-VOUS — 3 novembre 2026. Bloc RECOPIÉ tel quel de
   `src/shared/lien-du-rdv-pur.ts` (la référence lisible, les jetons signés,
   la confirmation à liens, le retour d'une cliente ; ses choix y sont
   écrits) ; `verifie-les-douze-lunes` confronte les copies. NE RIEN
   RETOUCHER ENTRE LES REPÈRES. */
/* ⟨lien-du-rdv⟩ */
/** Les adresses fixes des deux boutons du modèle `confirmation_rdv_liens`. */
export const URL_DU_RDV = 'https://maisonmnd.com/rdv/?v=';
export const URL_DE_L_AGENDA = 'https://maisonmnd.com/rdv/agenda/?v=';

/** La référence dite à la cliente : « MND-7K3Q ». Quatre signes tirés d'un
    alphabet sans 0, O, 1 ni I ; la même pour un même rendez-vous, partout
    (l'écran du site, le modèle, la page du rendez-vous, le Trône). */
export const ALPHABET_DE_LA_REFERENCE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PREFIXE_DE_LA_REFERENCE = 'MND-';
export const FORME_DE_LA_REFERENCE = /^MND-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
export function referenceDuRendezVous(apptId: string): string {
  /* FNV-1a sur 32 bits : stable, sans dépendance, suffisant pour une
     référence lue par une personne (le jour et l'heure l'accompagnent). */
  let h = 0x811c9dc5;
  for (const c of String(apptId ?? '')) {
    h ^= c.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let s = '';
  for (let i = 0; i < 4; i++) { s += ALPHABET_DE_LA_REFERENCE[h % 32]; h = Math.floor(h / 32); }
  return `${PREFIXE_DE_LA_REFERENCE}${s}`;
}

/** Le jeton : `<id du rendez-vous>.<22 signes de signature>`. L'identifiant
    ne porte jamais de point ; la signature est HMAC-SHA-256 de « rdv: » +
    identifiant, en base64url, coupée à 22 signes (132 bits). Un seul mot
    de [A-Za-z0-9._-] : c'est ce qu'un bouton de modèle Meta accepte. */
export const FORME_DU_JETON_DU_RDV = /^[A-Za-z0-9_-]{1,120}\.[A-Za-z0-9_-]{22}$/;
const base64url = (octets: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(octets))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function signe(secret: string, texte: string): Promise<string> {
  const enc = new TextEncoder();
  const cle = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', cle, enc.encode(texte))).slice(0, 22);
}
export async function jetonDuRendezVous(secret: string, apptId: string): Promise<string> {
  if (!secret || !/^[A-Za-z0-9_-]{1,120}$/.test(apptId)) throw new Error('jeton du rendez-vous : identifiant ou secret impossible');
  return `${apptId}.${await signe(secret, `rdv:${apptId}`)}`;
}
/** L'identifiant du rendez-vous que le jeton désigne, ou null s'il est
    faux, forgé ou mal formé. La comparaison ne s'arrête pas à la première
    différence. */
export async function apptIdDuJeton(secret: string, jeton: unknown): Promise<string | null> {
  const j = String(jeton ?? '');
  if (!secret || !FORME_DU_JETON_DU_RDV.test(j)) return null;
  const i = j.lastIndexOf('.');
  const apptId = j.slice(0, i);
  const attendu = await signe(secret, `rdv:${apptId}`);
  const donne = j.slice(i + 1);
  let diff = attendu.length ^ donne.length;
  for (let k = 0; k < attendu.length; k++) diff |= attendu.charCodeAt(k) ^ donne.charCodeAt(k);
  return diff === 0 ? apptId : null;
}

/* LE MODÈLE DE LA CONFIRMATION, AVEC OU SANS LIENS. `confirmation_rdv`
   (approuvé) : « Bonjour {{1}}, c'est confirmé : votre rendez-vous est
   retenu {{2}}. Nous vous attendons. Merci de nous prévenir en cas
   d'empêchement. » `confirmation_rdv_liens` (à faire approuver, secret
   WA_TEMPLATE_CONF_LIENS) : « Bonjour {{1}}, c'est confirmé : votre
   rendez-vous est retenu {{2}}. Votre référence : {{3}}. Nous vous
   attendons. Pour déplacer ou annuler, touchez le bouton ci-dessous. »,
   puis deux boutons à URL dynamique, « Déplacer ou annuler » et « Ajouter à
   mon agenda », chacun avec le jeton. Tant que le secret n'est pas posé,
   ou si Meta refuse le modèle neuf (#132xxx), l'ancien part. */
export type ConfirmationAEnvoyer = { avecLiens: boolean; prenom: string; quand: string; reference: string; jeton: string };
export function composantsDeLaConfirmation(o: ConfirmationAEnvoyer): unknown[] {
  const corps = [{ type: 'text', text: o.prenom }, { type: 'text', text: o.quand }];
  if (!o.avecLiens) return [{ type: 'body', parameters: corps }];
  return [
    { type: 'body', parameters: [...corps, { type: 'text', text: o.reference }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: o.jeton }] },
    { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: o.jeton }] },
  ];
}
/** Ce que le fil de la Maison montre de la confirmation partie. */
export function texteDeLaConfirmation(o: Pick<ConfirmationAEnvoyer, 'avecLiens' | 'prenom' | 'quand' | 'reference'>): string {
  return o.avecLiens
    ? `Bonjour ${o.prenom}, c'est confirmé : votre rendez-vous est retenu ${o.quand}. Votre référence : ${o.reference}. Nous vous attendons. Pour déplacer ou annuler, touchez le bouton ci-dessous.`
    : `Bonjour ${o.prenom}, c'est confirmé : votre rendez-vous est retenu ${o.quand}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`;
}

/** Les mots que la cliente envoie au WhatsApp de la Maison depuis la page
    du rendez-vous : la réception les comprend (déplacer, annuler). */
export const motPourDeplacer = (quand: string, reference: string): string =>
  `Bonjour, je souhaite déplacer mon rendez-vous du ${quand} (réf. ${reference}). Quelles places avez-vous ?`;
export const motPourAnnuler = (quand: string, reference: string): string =>
  `Bonjour, je dois annuler mon rendez-vous du ${quand} (réf. ${reference}). Merci de votre compréhension.`;

/** LE FICHIER .ICS, à l'heure de Cotonou (UTC+1 toute l'année), sans rien
    de plus que ce que l'écran dit. Le site le construit (l'écran Réservé, la
    page /rdv/agenda/) ; le banc le tient. */
export function ficheAgendaICS(o: { apptId: string; date: string; heure: string; dureeMin: number; titre: string; note: string; lieu?: string }): string {
  const [h, m] = o.heure.split(':').map(Number);
  const debut = new Date(Date.UTC(Number(o.date.slice(0, 4)), Number(o.date.slice(5, 7)) - 1, Number(o.date.slice(8, 10)), h, m));
  const fin = new Date(debut.getTime() + Math.max(60, o.dureeMin || 60) * 60_000);
  const t = (d: Date) => `${d.toISOString().slice(0, 10).replace(/-/g, '')}T${d.toISOString().slice(11, 16).replace(':', '')}00`;
  const texte = (s: string) => String(s ?? '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Maison MND//site//FR', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${o.apptId}@maisonmnd.com`,
    `DTSTAMP:${t(new Date(Date.UTC(Number(o.date.slice(0, 4)), Number(o.date.slice(5, 7)) - 1, Number(o.date.slice(8, 10)))))}Z`,
    `DTSTART;TZID=Africa/Porto-Novo:${t(debut)}`, `DTEND;TZID=Africa/Porto-Novo:${t(fin)}`,
    `SUMMARY:${texte(o.titre)}`, `LOCATION:${texte(o.lieu ?? 'Maison MND · Cotonou')}`, `DESCRIPTION:${texte(o.note)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
/* LE RETOUR D'UNE CLIENTE, EN UN TOUCHER — 3 novembre 2026 (le septième
   changement). Sur le site, « Déjà cliente ? » demande son numéro ; le
   serveur ne dit JAMAIS si le numéro est connu (rien ne se lit en tapant le
   numéro d'une autre) : si la Maison la connaît, le modèle approuvé
   `reservation_preparee` part sur CE WhatsApp, avec ses derniers gestes
   cochés et ce jeton d'identité en quatrième segment du lien `?r=`. La page
   le rend au serveur, qui remplit prénom, nom, civilité et numéro. Sept
   jours, puis le jeton ne vaut plus. */
export const FORME_DU_JETON_D_IDENTITE = /^[A-Za-z0-9_-]{1,80}~\d{8}~[A-Za-z0-9_-]{22}$/;
export const JOURS_DU_JETON_D_IDENTITE = 7;
export const jourCompact = (iso: string): string => String(iso ?? '').slice(0, 10).replace(/-/g, '');
export async function jetonDIdentite(secret: string, clientId: string, valableJusquAuISO: string): Promise<string> {
  const jour = jourCompact(valableJusquAuISO);
  if (!secret || !/^[A-Za-z0-9_-]{1,80}$/.test(clientId) || !/^\d{8}$/.test(jour)) throw new Error('jeton d identité : impossible');
  return `${clientId}~${jour}~${await signe(secret, `identite:${clientId}:${jour}`)}`;
}
/** La fiche que le jeton désigne, ou null : faux, forgé, mal formé, ou passé. */
export async function clientIdDuJetonDIdentite(secret: string, jeton: unknown, aujourdhuiISO: string): Promise<string | null> {
  const j = String(jeton ?? '');
  if (!secret || !FORME_DU_JETON_D_IDENTITE.test(j)) return null;
  const [clientId, jour, donne] = j.split('~');
  if (jour < jourCompact(aujourdhuiISO)) return null;
  const attendu = await signe(secret, `identite:${clientId}:${jour}`);
  let diff = attendu.length ^ donne.length;
  for (let k = 0; k < attendu.length; k++) diff |= attendu.charCodeAt(k) ^ donne.charCodeAt(k);
  return diff === 0 ? clientId : null;
}
/* LE SECRET QUI SIGNE LES DEUX JETONS : celui que la plateforme pose dans
   CHAQUE fonction, le même partout. Les clés de la Maison (CLE_SERVICE,
   SERVICE_KEY) ne se lisent pas dans le même ordre d'une fonction à l'autre ;
   un jeton signé par l'une ne se relirait pas dans l'autre. Le site n'en
   connaît que le nom. */
export const NOM_DU_SECRET_DES_LIENS = 'SUPABASE_SERVICE_ROLE_KEY';

/** Meta refuse le MODÈLE, pas la cliente : pas encore approuvé, en pause,
    désactivé, ou des variables qui ne tombent pas juste (#132000 à #132999).
    Alors l'ancienne confirmation part, le jour même. */
export const refusDuModele = (code: unknown): boolean => {
  const n = Number(code);
  return Number.isInteger(n) && n >= 132000 && n < 133000;
};
/** Ce qu'une confirmation à liens déposée en salle emporte pour le cas où
    Meta refuserait le modèle neuf : l'ancien, ses variables, ses mots. */
export type RepliDuModele = { modele: string; composants: unknown[]; texteAuFil: string };

/** Ce que la page du rendez-vous dit de lui : à venir, passé, annulé. Un
    rendez-vous honoré est passé, même le jour même. */
export type EtatDuRdv = 'a-venir' | 'passe' | 'annule';
export function etatDuRendezVous(r: { date?: string; status?: string }, aujourdhuiISO: string): EtatDuRdv {
  if (r.status === 'annulé') return 'annule';
  if (r.status === 'honoré') return 'passe';
  return String(r.date ?? '') < String(aujourdhuiISO ?? '').slice(0, 10) ? 'passe' : 'a-venir';
}

/** LES COORDONNÉES D'UNE FICHE, POUR LE FORMULAIRE DU SITE : le prénom (le
    premier mot du nom), le reste du nom, la civilité si la fiche la dit
    (jamais supposée), et le numéro coupé en indicatif et chiffres. Un
    numéro d'un pays que la liste ne connaît pas garde tout son « + » et un
    indicatif vide : le formulaire le prend tel quel. */
export const INDICATIFS_DU_RETOUR = ['+229', '+225', '+228', '+226', '+227', '+221', '+237', '+234', '+233', '+241', '+242', '+243', '+33', '+32', '+41', '+44', '+49', '+39', '+34', '+1'];
export function coordonneesDeLaFiche(f: { name?: unknown; civilite?: unknown; auMasculin?: unknown; phone?: unknown }): { prenom: string; nom: string; civilite: string; numero: string; dial: string } {
  const mots = String(f.name ?? '').trim().split(/\s+/).filter(Boolean);
  /* « Au masculin » est l'ancienne marque d'un Monsieur (avant le 2 octobre
     2026) : elle dit la civilité, elle ne la suppose pas. */
  const civilite = f.civilite === 'madame' || f.civilite === 'mademoiselle' || f.civilite === 'monsieur' ? String(f.civilite)
    : f.auMasculin === true ? 'monsieur' : '';
  const brut = String(f.phone ?? '').replace(/[^\d+]/g, '');
  const e164 = brut.startsWith('+') ? brut : brut.startsWith('00') ? `+${brut.slice(2)}` : '';
  const dial = e164 ? (INDICATIFS_DU_RETOUR.find((d) => e164.startsWith(d) && e164.length > d.length + 6) ?? '') : '';
  return {
    prenom: mots[0] ?? '', nom: mots.slice(1).join(' '), civilite,
    numero: dial ? e164.slice(dial.length) : e164 || brut.replace(/\D/g, ''), dial: dial || (e164 ? '' : '+229'),
  };
}

/** LES GESTES DU DERNIER RITUEL, cochés d'avance dans la réservation
    préparée : ceux du rendez-vous honoré ou confirmé le plus récent déjà
    passé (aujourd'hui compris), sinon du prochain. Jamais un annulé ; six au
    plus, comme le formulaire. */
export function gestesDuDernierRituel(rdvs: { date?: string; status?: string; serviceIds?: unknown }[], aujourdhuiISO: string): string[] {
  const jour = String(aujourdhuiISO ?? '').slice(0, 10);
  const vivants = rdvs.filter((r) => r.status !== 'annulé' && Array.isArray(r.serviceIds) && (r.serviceIds as unknown[]).length > 0 && !!r.date);
  const passes = vivants.filter((r) => String(r.date) <= jour).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const avenir = vivants.filter((r) => String(r.date) > jour).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const choisi = passes[0] ?? avenir[0];
  if (!choisi) return [];
  return [...new Set((choisi.serviceIds as unknown[]).map(String).filter((g) => /^[A-Za-z0-9_-]{1,80}$/.test(g)))].slice(0, 6);
}
/** Le mot du bouton de `reservation_preparee` pour une cliente qui revient :
    le même format que `jetonDuLien` (src/shared/lien-reservation.ts), le
    parcours de l'entretien, le calibre vide, le jeton d'identité en quatrième
    segment. Le banc le relit avec `lienLu`. */
export const jetonDuLienDuRetour = (gestes: string[], identite: string): string =>
  ['entretien', gestes.filter((g) => /^[A-Za-z0-9_-]{1,80}$/.test(g)).join('~'), '', identite].join('.');
/** Le {{2}} du modèle : les gestes dits, ou la venue quand il n'y en a pas. */
export const gestesDitsDuRetour = (noms: string[]): string => noms.filter(Boolean).join(' et ') || 'votre prochaine venue';
/* ⟨/lien-du-rdv⟩ */
/** Le secret des deux jetons, le même dans chaque fonction (voir le bloc). */
const SECRET_DES_LIENS = (Deno.env.get(NOM_DU_SECRET_DES_LIENS) ?? '').trim();
/** Le jour de Cotonou (UTC+1 toute l'année). */
const aujourdhuiACotonou = (): string => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const texte = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* LE MESSAGE VOCAL DU SITE — 19 octobre 2026. Bloc RECOPIÉ tel quel de
   `src/shared/message-vocal-pur.ts` (ses choix y sont écrits) ;
   `verifie-le-message-vocal` confronte les deux. NE RIEN RETOUCHER ENTRE
   LES REPÈRES. */
/* ⟨message-vocal⟩ */
/** Deux minutes au plus (sa décision). L'enregistreur s'arrête seul. */
export const DUREE_MAX_DE_LA_VOIX_S = 120;
/** Ce qu'un message de deux minutes ne dépasse jamais, même enregistré sans
    compression par un vieux téléphone : au-delà, c'est autre chose. */
export const OCTETS_MAX_DE_LA_VOIX = 3_500_000;
/** En dessous, c'est un clic par erreur, pas un message. */
export const OCTETS_MIN_DE_LA_VOIX = 1_000;
/** 90 jours (sa décision), puis la voix s'efface ; la demande reste. */
export const GARDE_DES_VOIX_JOURS = 90;
export const COFFRE_DES_VOIX = 'voix-du-site';
export const PROFIL_DU_VOCAL = 'Message vocal';

/** Le format reçu, ramené à ce que le coffre accepte, et son extension.
    `null` : ce n'est pas un son qu'on sait garder. Chrome et Android
    enregistrent en webm (parfois dit « video/webm »), Safari et l'iPhone en
    mp4 (AAC). */
export function formatDeLaVoix(type: string): { mime: string; ext: string } | null {
  const t = String(type ?? '').toLowerCase().split(';')[0].trim();
  if (t === 'audio/webm' || t === 'video/webm') return { mime: 'audio/webm', ext: 'webm' };
  if (t === 'audio/ogg') return { mime: 'audio/ogg', ext: 'ogg' };
  if (t === 'audio/mp4' || t === 'audio/aac' || t === 'audio/x-m4a' || t === 'audio/m4a' || t === 'video/mp4') return { mime: 'audio/mp4', ext: 'm4a' };
  if (t === 'audio/mpeg' || t === 'audio/mp3') return { mime: 'audio/mpeg', ext: 'mp3' };
  if (t === 'audio/wav' || t === 'audio/x-wav' || t === 'audio/wave') return { mime: 'audio/wav', ext: 'wav' };
  return null;
}

/** Où la voix vit dans le coffre : la branche, puis la demande. */
export const cheminDeLaVoix = (branchId: string, demandeId: string, ext: string): string =>
  `${branchId}/${demandeId}.${ext}`;

/** La durée annoncée par le navigateur, bornée : jamais crue au-delà du plafond. */
export const dureeBornee = (s: unknown): number =>
  Math.max(0, Math.min(DUREE_MAX_DE_LA_VOIX_S + 5, Math.round(Number(s) || 0)));

/** « 0:42 ». */
export const dureeDite = (s: number): string => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

/** L'instant avant lequel une voix doit être effacée. */
export const limiteDeGarde = (maintenantMs: number): number => maintenantMs - GARDE_DES_VOIX_JOURS * 86_400_000;

/** Les voix à effacer : déposées avant la limite, pas encore effacées. */
export function voixAEffacer<T extends { id: string; createdAt?: string; voix?: { chemin?: string; effaceeLe?: string } }>(
  demandes: readonly T[], maintenantMs: number,
): T[] {
  const limite = limiteDeGarde(maintenantMs);
  return demandes.filter((d) => !!d.voix?.chemin && !d.voix.effaceeLe
    && Number.isFinite(Date.parse(d.createdAt ?? '')) && Date.parse(d.createdAt!) < limite);
}
/* ⟨/message-vocal⟩ */

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

/** LE PREMIER RENDEZ-VOUS DU JOUR, 08:30 — 16 novembre 2026.
    « Sur le Trône, Ma Couronne et le site, ne pas mettre de RDV avant 8h30.
    Plus de RDV à 8h » (Yéman). La Maison ouvre à 08:00 du mardi au vendredi
    (`mnd_settings.hours`), et l'ouverture reste 08:00 : elle sert aussi au
    pointage et à la fiche publique. Seul le premier rendez-vous recule. La
    grille garde son pas : à l'heure, 08:00 devient 08:30, puis 09:00, 10:00… */
export const PREMIER_RENDEZ_VOUS_MIN = 8 * 60 + 30;

/** UN CRÉNEAU DÉJÀ PRIS, dit sans dire par qui — voir la migration 0079.
    C'est tout ce que le serveur consent à donner à une inconnue, et tout ce
    qu'un calendrier honnête demande. */
export type CreneauOccupe = { jour: string; maitre: string; debut: string; duree: number; lourde?: boolean };

/** DEUX TÊTES CHEZ TEAM — 18 novembre 2026. « On peut mettre deux personnes
    aux mêmes horaires… tant qu'une personne a moins de 150 locks et l'autre
    a 400 locks. Mais on ne peut pas prendre deux personnes qui ont 400 locks
    simultanément » (Yéman). Au sélecteur, le même jour : l'une des deux sous
    150 locks ; une fiche sans nombre de locks compte comme une PETITE tête ;
    tous les rituels de Team ; deux au plus en même temps (les fauteuils).
    Un autre maître (une personne) ne reçoit toujours qu'une cliente à la
    fois. La base (`creneaux_occupes`) ne dit d'un créneau pris que « lourde »
    (150 locks ou plus), jamais le nombre ; le verrou (`pose_si_libre`,
    `deplace_si_libre`) et le garde (`une_place_en_ligne`) tiennent la même
    règle. */
export const MAITRE_QUI_PARTAGE = 'Team';
export const SEUIL_TETE_LOURDE = 150;
export const DEUX_TETES_AU_PLUS = 2;
/** Une tête lourde : 150 locks ou plus. Un nombre inconnu n'en fait pas une.
    Le texte se lit comme la base (`locks_lourds`, 0238) : des chiffres, un
    point décimal au plus, rien d'autre. */
export const teteLourde = (locks: unknown): boolean => {
  const n = typeof locks === 'number' ? locks
    : typeof locks === 'string' && /^\d+(\.\d+)?$/.test(locks.trim()) ? Number(locks.trim()) : Number.NaN;
  return Number.isFinite(n) && n >= SEUIL_TETE_LOURDE;
};
/** LE PETIT SERVICE PARTAGE L'HEURE — 20 novembre 2026. « Si valider deux
    rendez-vous à la même heure est possible il faut le faire, tant que c'est
    un petit service » (Yéman). Opale venait de refuser 16 h à une cliente en
    retard (un lavage et une reprise, 30 000 F) : un lavage et une coiffure
    d'une heure, à 17 h, fermaient l'heure, deux têtes lourdes et une seule
    place en ligne ce jour-là.

    Un rendez-vous d'UNE HEURE OU MOINS est un petit service (une durée n'est
    jamais sous une heure : `dureeDesPrestations`, `duree_du_rdv`). Chez Team,
    il partage l'heure avec n'importe quelle tête, lourde ou non ; et l'un à
    côté de l'autre, ils ne prennent qu'une place en ligne (les fauteuils).
    Deux au plus chez Team en même temps, toujours (`DEUX_TETES_AU_PLUS`).
    Un autre maître, une cliente à la fois, comme avant. La base tient la
    même règle (0240 : `pose_si_libre`, `deplace_si_libre`,
    `reprend_si_libre`, le garde `une_place_en_ligne`). Une durée inconnue
    n'en fait pas un petit service. */
export const PETIT_SERVICE_MIN = 60;
export const petitService = (dureeMin: unknown): boolean =>
  typeof dureeMin === 'number' && Number.isFinite(dureeMin) && dureeMin >= 1 && dureeMin <= PETIT_SERVICE_MIN;
/** Deux rendez-vous qui se chevauchent tiennent-ils dans la même place en
    ligne ? Oui quand l'un des deux est un petit service. */
export const partagentLaPlace = (dureeA: unknown, dureeB: unknown): boolean => petitService(dureeA) || petitService(dureeB);
/** LES PLACES QUE PRENNENT ENSEMBLE une venue et les rendez-vous qui la
    chevauchent (20 novembre 2026, second passage) : chacun la sienne, sauf
    qu'un petit service en partage UNE avec un seul voisin. Une paire par
    petit service, chacun dans une paire au plus. Avant, un petit service ne
    comptait pour aucune place, et trois clientes passaient dans deux
    fauteuils (le banc du prochain rituel l'a vu). La base tient le même
    compte (`places_prises`, 0242). */
export function placesPrises(venueDureeMin: unknown, voisins: readonly { dureeMin?: number }[]): number {
  const n = voisins.length + 1;
  const petits = voisins.filter((a) => petitService(a.dureeMin)).length + (petitService(venueDureeMin) ? 1 : 0);
  return n - Math.min(petits, Math.floor(n / 2));
}
/** Ce rendez-vous déjà pris chez ce maître empêche-t-il une nouvelle venue à la
    même heure ? Toujours, sauf chez Team quand l'une des deux têtes est petite,
    ou que l'un des deux est un petit service (`nouvelleDureeMin` : la durée de
    la venue ; absente, elle n'en est pas un). */
export const bloqueLaVenue = (maitre: string, nouvelleLourde: boolean | undefined, deja: { lourde?: boolean; dureeMin?: number }, nouvelleDureeMin?: number): boolean =>
  maitre !== MAITRE_QUI_PARTAGE || (!!nouvelleLourde && !!deja.lourde && !partagentLaPlace(nouvelleDureeMin, deja.dureeMin));

/** LE CŒUR DU CALCUL, SANS AUCUN MAGASIN — pour qu'il soit jugeable.

    Les murs entrent par la porte : le harnais peut poser n'importe quelle
    journée, et les trois surfaces obtiennent la même réponse. */
export function creneauxLibres(o: {
  opening: FenetreDuJour;
  durationMin: number;
  /** Tout ce qui occupe la journée, tous maîtres confondus. */
  occupes: readonly { maitre: string; debutMin: number; dureeMin: number; lourde?: boolean }[];
  /** La tête de la nouvelle venue : 150 locks ou plus (deux têtes chez Team,
      18 novembre 2026). Absent : une petite tête. */
  lourde?: boolean;
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

  /* Chez Team, un rendez-vous qu'une petite tête, ou un petit service, rend
     partageable ne bloque pas l'heure ; deux au plus chez lui en même temps
     (plus bas). */
  const busy: Array<readonly [number, number]> = duMaitre
    .filter((a) => bloqueLaVenue(o.master, o.lourde, a, o.durationMin))
    .map((a) => [a.debutMin, a.debutMin + a.dureeMin] as const);
  if (o.bloques) busy.push(...o.bloques);

  const pas = o.pasMin ?? 60;
  const cap = o.capSimultane ?? 0;
  const out: string[] = [];
  /* Un point de la grille avant 08:30 se pose à 08:30, une seule fois. */
  let dernier = -1;
  for (let g = o.opening.openMin; g < o.opening.closeMin; g += pas) {
    const m = Math.max(g, PREMIER_RENDEZ_VOUS_MIN);
    if (m + o.durationMin > o.opening.closeMin) break;
    if (m <= dernier) continue;
    dernier = m;
    if (o.maintenantMin != null && m <= o.maintenantMin) continue;
    const overlaps = busy.some(([s, e]) => m < e && m + o.durationMin > s);
    if (overlaps) continue;
    if (duMaitre.filter((a) => m < a.debutMin + a.dureeMin && m + o.durationMin > a.debutMin).length >= DEUX_TETES_AU_PLUS) continue;
    /* LES FAUTEUILS : le maître est libre, mais la Maison peut être pleine.
       Un petit service et un seul voisin ne prennent qu'une place. */
    if (cap > 0) {
      const voisins = o.occupes.filter((a) => m < a.debutMin + a.dureeMin && m + o.durationMin > a.debutMin);
      if (placesPrises(o.durationMin, voisins) > cap) continue;
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
): { maitre: string; debutMin: number; dureeMin: number; lourde?: boolean }[] =>
  occupes
    .filter((c) => c.jour === dateIso && c.debut)
    .map((c) => ({ maitre: c.maitre, debutMin: minutesDeHhmm(c.debut), dureeMin: c.duree, ...(c.lourde ? { lourde: true } : {}) }));

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

/* ══ LA FENÊTRE APRÈS LA DERNIÈRE VENUE — 7 novembre 2026 ═════════════════
   « Fidélité n'est disponible pour un client uniquement entre 4 et 6 semaines
   de sa dernière venue. Mais au-delà des 6 semaines ce service n'est plus
   disponible. » (Yéman.) Un pack qui porte `fenetreApresVenue` ne se pose que
   si l'écart entre la DERNIÈRE VENUE de la cliente (un rendez-vous « honoré »,
   le plus récent AVANT le rendez-vous qu'on pose) et ce rendez-vous va de
   4 à 6 semaines : de 28 jours inclus à 42 jours inclus. Avant : pas encore.
   Après : plus du tout. Sans aucune venue honorée : jamais.

   LA FENÊTRE SE JUGE À LA DATE DU RENDEZ-VOUS CHOISI, pas à aujourd'hui : une
   cliente qui réserve pour dans cinq semaines doit pouvoir le prendre. Les
   jours se comptent en jours calendaires sur des dates AAAA-MM-JJ (le jour
   de Cotonou, UTC+1, est déjà celui qu'écrit le rendez-vous) : aucune heure,
   donc aucun fuseau à deviner. Un rendez-vous à venir, non honoré, ne compte
   pas comme une venue ; un honoré postérieur au rendez-vous jugé est ignoré.
   Sans le champ, aucune règle : tout se passe comme avant. */
export type FenetreApresVenue = { deSemaines: number; aSemaines: number };

/** Les jours calendaires de `depuisIso` à `versIso` (AAAA-MM-JJ) ; NaN si l'un est illisible. */
export function joursEntreDates(depuisIso: string, versIso: string): number {
  const lit = (s: string): number => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  return Math.round((lit(versIso) - lit(depuisIso)) / 86_400_000);
}

/** La fenêtre en jours, ou `null` quand le champ est absent ou illisible. */
export function fenetreEnJours(f: FenetreApresVenue | null | undefined): { min: number; max: number } | null {
  const de = Number(f?.deSemaines);
  const a = Number(f?.aSemaines);
  if (!f || !Number.isFinite(de) || !Number.isFinite(a) || de < 0 || a < de) return null;
  return { min: Math.round(de * 7), max: Math.round(a * 7) };
}

/** LA DERNIÈRE VENUE de cette cliente avant `avantIso` : le jour du rendez-vous
    « honoré » le plus récent, strictement antérieur. `null` s'il n'y en a pas. */
export function derniereVenueAvant(
  rdvs: readonly { clientId?: unknown; date?: unknown; status?: unknown }[],
  clientId: string,
  avantIso: string,
): string | null {
  if (!clientId) return null;
  let meilleure: string | null = null;
  for (const r of rdvs) {
    if (r.status !== 'honoré' || r.clientId !== clientId) continue;
    const j = String(r.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j) || j >= avantIso) continue;
    if (meilleure === null || j > meilleure) meilleure = j;
  }
  return meilleure;
}

/** LE PACK SE POSE-T-IL CE JOUR-LÀ ? Sans fenêtre : toujours. Avec : seulement
    si la dernière venue existe et que l'écart va de `min` à `max` jours inclus. */
export function dansLaFenetreDeVenue(
  f: FenetreApresVenue | null | undefined,
  dateRdv: string | null | undefined,
  derniereVenue: string | null | undefined,
): boolean {
  if (!f) return true;
  const w = fenetreEnJours(f);
  if (!w || !dateRdv || !derniereVenue) return false;
  const ecart = joursEntreDates(derniereVenue, dateRdv);
  return Number.isFinite(ecart) && ecart >= w.min && ecart <= w.max;
}

/** LA FENÊTRE EST-ELLE ENCORE À VENIR ? Tant qu'aucune date n'est choisie, on
    propose le pack si un jour d'`aujourdhui` en avant peut encore tomber dedans :
    la dernière venue existe et son dernier jour de fenêtre n'est pas passé. */
export function fenetreEncoreAtteignable(
  f: FenetreApresVenue | null | undefined,
  aujourdhui: string | null | undefined,
  derniereVenue: string | null | undefined,
): boolean {
  if (!f) return true;
  const w = fenetreEnJours(f);
  if (!w || !derniereVenue) return false;
  if (!aujourdhui) return true;
  const ecart = joursEntreDates(derniereVenue, aujourdhui);
  return Number.isFinite(ecart) && ecart <= w.max;
}

/** La phrase dite à la cliente (Ma Couronne, le site, WhatsApp). */
export function phraseDeLaFenetre(f: FenetreApresVenue): string {
  return `Disponible entre ${f.deSemaines} et ${f.aSemaines} semaines après votre dernière venue`;
}
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
   Trois ateliers, et c'est délibéré : l'Entretien (lavages, soins, reprises
   de racines, sorties signature), la Coloration, et La Transformation, la
   décoloration, rangée dans un atelier à elle depuis la nouvelle grille du
   10 octobre 2026 (« la décoloration fait partie du process de la
   coloration, ça se réserve directement », Yéman, 17 novembre 2026). Une
   création et une restauration passent par la consultation, les formations
   sont des candidatures, les mèches et les fournitures ne sont pas des
   rendez-vous. Les masques de la Vitrine (comptoir, Ma Couronne) ne comptent
   pas ici : seuls ceux du site public (`siteMasques`). */
const ATELIERS_RESERVABLES: readonly string[] = ['atl-ii-gbeji', 'atl-iii-yekpe', 'cat-transformation'];

/* LA CONSULTATION DE CHAQUE PORTE (la Maison, 17 septembre 2026) : le KÒKÒ
   Origine pour une première couronne, le KÒKÒ Suivi pour une réparation, le
   Conseil et diagnostic pour un enfant. Un identifiant disparu ne ferme
   jamais la porte : l'écran propose alors toutes les consultations. */
const CONSULTATION_PAR_PARCOURS: Readonly<Partial<Record<Besoin, string>>> = {
  creation: 'sv-koko-ori',
  reparation: 'sv-koko-sui',
  enfant: 'svc-doto-conseil',
};

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
  /** LA FENÊTRE APRÈS LA DERNIÈRE VENUE (7 novembre 2026) : GBÈJÍ™ Fidélité,
      de 4 à 6 semaines. Absent = aucune règle. */
  fenetreApresVenue?: FenetreApresVenue;
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
  /** LES PLACES DE CHAQUE JOUR (18 novembre 2026), quand la fonction les a
      lues (`places_en_ligne_du`) : un jour absent garde `sieges`. */
  siegesDuJour?: Readonly<Record<string, number>>;
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
  /** Les lignes de `creneaux_occupes` : jour, maître, début, durée, lourde. */
  occupes?: readonly unknown[] | null;
  /** Les lignes de `places_en_ligne_du` (jour, places), quand la fonction
      les lit (WhatsApp, 18 novembre 2026). Absentes : `PLACES_EN_LIGNE`. */
  places?: readonly unknown[] | null;
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
      /* « lourde » : 150 locks ou plus (creneaux_occupes, deux têtes chez Team). */
      return { jour: chaine(c.jour), maitre: chaine(c.maitre), debut: chaine(c.debut), duree: Number.isFinite(d) && d >= 1 ? d : 60, ...(c.lourde === true ? { lourde: true } : {}) };
    });
  /* LES PLACES DE CHAQUE JOUR (18 novembre 2026) : un jour ISO et un entier
     d'au moins 1, rien d'autre ; la base (`places_en_ligne`) les borne déjà
     aux fauteuils, et son verrou relit les mêmes. */
  const siegesDuJour: Record<string, number> = {};
  for (const r of (l.places ?? []).map(objet)) {
    const n = Number(r.places);
    if (/^\d{4}-\d{2}-\d{2}$/.test(chaine(r.jour)) && Number.isInteger(n) && n >= 1) siegesDuJour[chaine(r.jour)] = n;
  }
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
      ...(fenetreEnJours(objet(d.fenetreApresVenue) as FenetreApresVenue)
        ? { fenetreApresVenue: { deSemaines: Number(objet(d.fenetreApresVenue).deSemaines), aSemaines: Number(objet(d.fenetreApresVenue).aSemaines) } }
        : {}),
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
    ...(Object.keys(siegesDuJour).length > 0 ? { siegesDuJour } : {}),
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

/* LA BORNE DE LA RÉSERVATION — 6 novembre 2026 (« Le calendrier du site »,
   maquette validée, « construis »). Elle était de quatre-vingt-dix jours
   glissants : le 6 novembre, février restait hors d'atteinte. Elle est
   désormais LE DERNIER JOUR DU TROISIÈME MOIS QUI SUIT le mois de Cotonou :
   ce mois et les trois suivants, la borne de Ma Couronne. Le 6 novembre 2026,
   le 28 février 2027 ; le 1er décembre, le 31 mars ; elle avance seule chaque
   mois. Le site la lit pour dessiner son calendrier, ce juge pour refuser, et
   `pose_si_libre` (0168) porte la même, comptée à Porto-Novo. */
/** Le dernier jour qui se réserve, vu d'`aujourdhuiIso` (le jour de Cotonou,
    AAAA-MM-JJ). Illisible : chaîne vide. */
function finDeLaReservation(aujourdhuiIso: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(aujourdhuiIso ?? ''));
  if (!m) return '';
  /* Le jour zéro du quatrième mois qui suit est le dernier du troisième. */
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + 4, 0)).toISOString().slice(0, 10);
}

/** Les jours d'ici (Cotonou) à la borne : de 89 à 122 selon le mois. */
function joursDeLaFenetre(ms: number): number {
  const n = joursDEcart(finDeLaReservation(jourDeCotonou(ms)), ms);
  return Number.isFinite(n) ? n : 0;
}

/* ── 4. LE JUGE ─────────────────────────────────────────────────────────
   Les codes sont ceux que le site sait déjà dire (`creneau_*`, `prestation_*`),
   plus `consultation_requise`. */
type RefusDeLaPlace =
  | 'creneau_invalide' | 'creneau_hors_fenetre' | 'creneau_ferme'
  | 'prestation_inconnue' | 'prestation_retiree' | 'consultation_requise'
  | 'creneau_hors_ouverture' | 'creneau_plafond' | 'creneau_pris'
  | 'prestation_hors_fenetre';

/** `derniereVenue` : le jour du rendez-vous honoré le plus récent de la cliente
    avant `date` (`derniereVenueAvant`), `null` si elle n'en a aucun. LE JUGE NE
    LA LIT PAS : l'appelant la lit en base. Un geste à fenêtre
    (`fenetreApresVenue`) sans cette valeur est refusé : une cliente qu'on ne
    sait pas situer n'a pas de venue à compter. */
/** Les places en ligne d'un jour : celles lues pour ce jour, sinon celles de l'agenda. */
function siegesDe(agenda: AgendaDuServeur, iso: string): number {
  const lu = agenda.siegesDuJour?.[iso];
  return typeof lu === 'number' && Number.isInteger(lu) && lu >= 0 ? lu : agenda.sieges;
}

/** `lourde` : la tête de la nouvelle venue, 150 locks ou plus (deux têtes chez Team, 18 novembre 2026). Absent : une petite tête. */
type DemandeDePlace = { date: string; time: string; serviceIds: readonly string[]; derniereVenue?: string | null; lourde?: boolean };

/** La place tient : sa durée, et les maîtres LIBRES à cette heure, dans
    l'ordre de la Maison (le verrou prend le premier encore libre). */
type VerdictDeLaPlace =
  | { ok: true; dureeMin: number; maitres: string[] }
  | { ok: false; erreur: RefusDeLaPlace };

/** Une place proposée : un jour et une heure, jamais un maître. */
type PlaceDuServeur = { iso: string; heure: string };

/** Les minutes écoulées depuis minuit, à Cotonou (UTC+1, sans heure d'été). */
const minutesDeCotonou = (ms: number): number => Math.floor((((ms + 3_600_000) % UN_JOUR_MS) + UN_JOUR_MS) % UN_JOUR_MS / 60_000);

/** LA FORME ET LA FENÊTRE, avant toute lecture : un appel mal formé ne coûte
    rien à la base. Jamais après la borne (`finDeLaReservation`).

    LE JOUR MÊME, SUR LE SITE SEULEMENT (12 novembre 2026, Yéman au
    sélecteur : « Ouvrir le jour même », « Aucun délai ») : le site propose
    aujourd'hui les heures pas encore commencées à Cotonou, et `jourMeme` les
    laisse passer. Sans lui (WhatsApp, l'Assistant Maison), jamais le jour
    même : la Maison prépare la venue. */
function laPlaceEstRecevable(p: { date: string; time: string }, ms: number, jourMeme = false): RefusDeLaPlace | null {
  const m = /^(\d{2}):(\d{2})$/.exec(String(p.time ?? ''));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return 'creneau_invalide';
  const ecart = joursDEcart(String(p.date ?? ''), ms);
  if (Number.isNaN(ecart)) return 'creneau_invalide';
  const aujourdhuiPasEncoreCommence = jourMeme && ecart === 0 && Number(m[1]) * 60 + Number(m[2]) > minutesDeCotonou(ms);
  if ((ecart < 1 && !aujourdhuiPasEncoreCommence) || ecart > joursDeLaFenetre(ms)) return 'creneau_hors_fenetre';
  return null;
}

/** LES GESTES : tous connus et actifs, aucun qui exige une consultation
    (sauf la consultation elle-même), tous ouverts à la réservation en ligne. */
function lesGestesSeReservent(
  agenda: AgendaDuServeur, serviceIds: readonly string[],
  /* LA FENÊTRE (7 novembre 2026) : le jour du rendez-vous et la dernière venue
     de la cliente. Sans eux, un geste à fenêtre ne se réserve pas. */
  quand?: { date?: string; derniereVenue?: string | null },
): RefusDeLaPlace | null {
  if (serviceIds.length === 0) return 'prestation_inconnue';
  const gestes = serviceIds.map((id) => agenda.services.find((s) => s.id === id));
  const connus = gestes.filter((s): s is PrestationDuServeur => !!s && s.enabled !== false && !s.archived);
  if (connus.length !== serviceIds.length) return 'prestation_inconnue';
  const cats = agenda.categories;
  if (connus.some((s) => !estUneConsultation(s, cats) && exigeConsultation(s, cats))) return 'consultation_requise';
  if (connus.some((s) => !reservableSurLeSite(s, cats, agenda.masques))) return 'prestation_retiree';
  if (connus.some((s) => s.fenetreApresVenue && !dansLaFenetreDeVenue(s.fenetreApresVenue, quand?.date, quand?.derniereVenue))) return 'prestation_hors_fenetre';
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
    rejoue le plafond, les fauteuils et les maîtres sous verrou. `jourMeme` :
    le site seul (`laPlaceEstRecevable`). */
function laPlaceTient(agenda: AgendaDuServeur, p: DemandeDePlace, ms: number, jourMeme = false): VerdictDeLaPlace {
  const recevable = laPlaceEstRecevable(p, ms, jourMeme);
  if (recevable) return { ok: false, erreur: recevable };
  /* Sans semaine connue, le jour est fermé : mieux vaut un rappel qu'un
     lundi ouvert que la Maison ferme. */
  const fenetre = ouvertureDuJour(p.date, agenda.semaine, agenda.exceptions);
  if (fenetre.closed) return { ok: false, erreur: 'creneau_ferme' };
  const gestes = lesGestesSeReservent(agenda, p.serviceIds, { date: p.date, derniereVenue: p.derniereVenue });
  if (gestes) return { ok: false, erreur: gestes };

  const dureeMin = dureeDesPrestations(p.serviceIds, agenda.services);
  const debut = minutesDeHhmm(p.time);
  const fin = debut + dureeMin;
  /* LE PREMIER RENDEZ-VOUS, 08:30 (17 novembre 2026) : la liste des heures
     (`creneauxLibres`) commençait déjà à 08:30, mais ce juge, lui, acceptait
     encore 08:00 un jour ouvert à 08:00. Une page du site restée en cache,
     Ma Couronne installée ou un envoi direct passait donc. La règle se juge
     ICI, là où le rendez-vous est accepté. */
  if (debut < Math.max(fenetre.openMin, PREMIER_RENDEZ_VOUS_MIN) || fin > fenetre.closeMin) return { ok: false, erreur: 'creneau_hors_ouverture' };

  const duJour = occupesDuJour(agenda.occupes, p.date);
  /* Le plafond de la Maison : ses rendez-vous du jour, tous maîtres confondus. */
  if (agenda.capMaison > 0 && duJour.length >= agenda.capMaison) return { ok: false, erreur: 'creneau_plafond' };
  /* LES FAUTEUILS : le maître peut être libre, la Maison pleine. Un petit
     service et un seul voisin ne prennent qu'une place (20 novembre 2026). */
  const sieges = siegesDe(agenda, p.date);
  if (sieges > 0
    && placesPrises(dureeMin, duJour.filter((a) => debut < a.debutMin + a.dureeMin && fin > a.debutMin)) > sieges) {
    return { ok: false, erreur: 'creneau_pris' };
  }

  /* LES MAÎTRES LIBRES, tous, dans l'ordre : jamais le premier sans regarder. */
  const candidats = maitresDuRituel(agenda, p.serviceIds);
  const libres: string[] = [];
  /* Un maître seul à cette heure passe avant Team qui partage. */
  const partages: string[] = [];
  let plafonnes = 0;
  for (const m of candidats) {
    const siens = duJour.filter((a) => a.maitre === m);
    if (agenda.capMaitre > 0 && siens.length >= agenda.capMaitre) {
      plafonnes += 1;
      continue;
    }
    /* DEUX TÊTES CHEZ TEAM (18 novembre 2026) : un rendez-vous de Team que
       l'une des deux petites têtes rend partageable ne bloque pas ; deux au
       plus chez lui à la même heure. Un autre maître, une cliente à la fois.
       Un petit service partage aussi l'heure (20 novembre 2026). */
    const chevauchent = siens.filter((a) => debut < a.debutMin + a.dureeMin && fin > a.debutMin);
    const occupe = chevauchent.some((a) => bloqueLaVenue(m, p.lourde, a, dureeMin))
      || chevauchent.length >= DEUX_TETES_AU_PLUS
      || plagesBloquees(agenda.murs, agenda.branchId, p.date, m).some(([s, e]) => debut < e && fin > s);
    if (!occupe) (chevauchent.length === 0 ? libres : partages).push(m);
  }
  if (libres.length + partages.length === 0) return { ok: false, erreur: plafonnes === candidats.length ? 'creneau_plafond' : 'creneau_pris' };
  return { ok: true, dureeMin, maitres: [...libres, ...partages] };
}

/** LES PLACES LIBRES, de demain (à Cotonou) à l'horizon, rangées dans le
    temps : les heures que le site montrerait, jour par jour (le même
    `creneauxLibres`, maître par maître, fauteuils, plafonds et murs compris).
    Des gestes qui ne se réservent pas en ligne n'ont aucune place. */
function placesLibres(
  agenda: AgendaDuServeur, serviceIds: readonly string[], ms: number, horizonJours = 14,
  /* La dernière venue de la cliente (7 novembre 2026) : un geste à fenêtre ne
     propose que les jours qui tombent dedans. */
  derniereVenue?: string | null,
  /* Sa tête : 150 locks ou plus (deux têtes chez Team, 18 novembre 2026). */
  lourde?: boolean,
): PlaceDuServeur[] {
  const sansFenetre = lesGestesSeReservent(agenda, serviceIds, { derniereVenue, date: 'avant' });
  if (sansFenetre && sansFenetre !== 'prestation_hors_fenetre') return [];
  const voulu = Math.round(Number(horizonJours));
  const n = Math.max(1, Math.min(joursDeLaFenetre(ms), Number.isFinite(voulu) && voulu > 0 ? voulu : 14));
  const durationMin = dureeDesPrestations(serviceIds, agenda.services);
  const maitres = maitresDuRituel(agenda, serviceIds);
  const aujourdhui = jourDeCotonou(ms);
  const out: PlaceDuServeur[] = [];
  for (let i = 1; i <= n; i += 1) {
    const iso = isoApresJours(aujourdhui, i);
    if (lesGestesSeReservent(agenda, serviceIds, { date: iso, derniereVenue })) continue;
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
        capSimultane: siegesDe(agenda, iso),
        maintenantMin: null,
        ...(lourde ? { lourde: true } : {}),
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
  /** Le numéro de la cliente (E.164) : sa dernière venue juge un pack à fenêtre. */
  telephone?: string;
  /** Le compte de locks qu'elle annonce (17 novembre 2026) : la durée posée suit son calibre. */
  lockCount?: number;
}): Promise<{ erreur: string } | {
  dureeMin: number;
  /** `mnd_settings`, lu ici une fois : l'acompte par geste s'y lit. */
  reglages: any;
  /** Les maîtres libres à cette heure, dans l'ordre : le verrou prend le premier encore libre. */
  maitres: string[];
  catalogue: ServiceEnBase[];
  offres: any[];
  /** L'arbre des familles, lu ici une fois : la remise de bienvenue s'en sert. */
  familles: { id: string; parentId?: string }[];
  /** LES PLACES DE LA REMISE CE JOUR-LÀ (`places_de_la_remise`, 0154) ;
      `null` quand la base n'a pas su les dire : aucune place, alors. */
  placesDeLaRemise: LigneDesPlaces[] | null;
}> {
  const maintenant = Date.now();
  /* La forme et la fenêtre d'abord : un appel mal formé ne coûte rien à la base.
     LE JOUR MÊME (12 novembre 2026) : le site le propose, ses heures pas
     encore commencées à Cotonou ; `true` le laisse passer, ici seulement. */
  const recevable = laPlaceEstRecevable({ date: o.date, time: o.time }, maintenant, true);
  if (recevable) return { erreur: recevable };

  const [docs, services, categories, blocages, occupes, placesDuJour, placesDeLaRemise] = await Promise.all([
    admin.from('documents').select('key, data').in('key', ['mnd_settings', 'mnd_horaires_exceptions', 'mnd_vitrine_config', 'mnd_offers', 'mnd_model_bands', 'mnd_model_band_sets']),
    toutesLesLignes('catalog_services'),
    toutesLesLignes('catalog_categories'),
    toutesLesLignes('blocages', [['data->>branchId', o.branche.id], ['data->>date', o.date]]),
    admin.rpc('creneaux_occupes', { p_branch: o.branche.id, p_du: o.date, p_au: o.date }),
    admin.rpc('places_en_ligne', { p_branch: o.branche.id, p_date: o.date }),
    /* LES PLACES LIMITÉES — 4 novembre 2026 : lues avec le reste, la même
       règle que le site (0154). Une panne ne refuse pas la place : elle
       retire seulement la remise, qu'on ne pose jamais sur un jour non compté. */
    admin.rpc('places_de_la_remise', { p_branch: o.branche.id, p_debut: o.date, p_fin: o.date }),
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
  /* LE SECOND FAUTEUIL EN LIGNE — 2 novembre 2026. Du mardi au vendredi,
     quand le planning met deux personnes au fauteuil, le site propose aussi
     le second fauteuil (heuresLibres) ; ce juge le reçoit donc du jour même,
     de la base (`places_en_ligne`, 0152), au lieu de la place unique de
     l'agenda du serveur. Une panne, ou la fonction pas encore posée : UNE
     place, la règle du 24 octobre 2026 ; et jamais plus que le second
     fauteuil. Le verrou (`pose_si_libre`) relit les mêmes places sous verrou.
     Hors des repères ⟨place-du-serveur⟩, et c'est voulu : WhatsApp garde ses
     propositions à une place. */
  const lues = Number(placesDuJour.data);
  const places = !placesDuJour.error && Number.isInteger(lues) && lues >= PLACES_EN_LIGNE
    ? Math.min(lues, PLACES_EN_LIGNE_AU_PLUS) : PLACES_EN_LIGNE;
  if (placesDuJour.error) console.error('demande-submit: places du jour illisibles, une place', placesDuJour.error.message);
  /* LA FENÊTRE APRÈS LA DERNIÈRE VENUE — 7 novembre 2026. Un pack à fenêtre
     (GBÈJÍ™ Fidélité : de 4 à 6 semaines) se juge sur la dernière venue
     honorée du numéro, lue ici seulement quand un geste choisi la demande. Le
     site ne reconnaît pas la cliente : plusieurs fiches sur un même numéro
     (une mère et ses filles), c'est la venue la plus récente qui compte. Une
     lecture en panne refuse, comme le reste. */
  const aFenetre = o.serviceIds.some((id) => !!agenda.services.find((x) => x.id === id)?.fenetreApresVenue);
  let derniereVenue: string | null = null;
  if (aFenetre) {
    const lue = await derniereVenueDuNumero(o.telephone ?? '', o.date);
    if (!lue.ok) return { erreur: 'agenda_illisible' };
    derniereVenue = lue.jour;
  }
  /* LA DURÉE AU CALIBRE ANNONCÉ — 17 novembre 2026. Le juge additionne les
     durées du catalogue qu'on lui donne : on lui donne celles de SON calibre
     (`gestesAuCalibre`, le `durCoef` du barème), et la place tenue est celle
     que le rituel prendra vraiment. Sans calibre annoncé, le catalogue nu. */
  const brutes = new Map(((services.data ?? []) as LigneDeTable[]).map((r) => [r.id, r.data ?? {}]));
  const auCalibre = gestesAuCalibre(
    agenda.services.map((s) => ({ ...s, scalesWithModel: brutes.get(s.id)?.scalesWithModel === true })),
    {
      lockCount: Math.max(0, Math.round(Number(o.lockCount) || 0)), bandes: doc('mnd_model_bands'), sets: doc('mnd_model_band_sets'),
      categories: agenda.categories, suspendu: doc('mnd_settings')?.baremeSuspendu === true,
    },
  );
  /* LE DÉFAISAGE SE RÉSERVE EN LIGNE — 17 novembre 2026 (le rituel GBÀTÀ™,
     Yéman). Pour cette porte seulement, le juge lit l'atelier du défaisage
     sous un atelier qui se réserve (`famillesAvecLeDefaisage`). La case
     « consultation avant » du geste, un devis, un geste éteint ou décoché
     pour le site le ferment toujours : le juge les lit lui-même. Création et
     réparation passent toujours par la consultation. Hors des repères
     ⟨place-du-serveur⟩ : WhatsApp garde ses ateliers, sans le défaisage. */
  const famillesDuSite = famillesAvecLeDefaisage(agenda.categories, ATELIERS_RESERVABLES);
  /* DEUX TÊTES CHEZ TEAM (18 novembre 2026) : la tête qu'elle annonce, lourde à
     150 locks ou plus ; écrite sur le rendez-vous (`locksAnnonces`), le verrou
     (0238) la relit. Sans compte annoncé, une petite tête. */
  const lourde = teteLourde(Math.round(Number(o.lockCount) || 0));
  const verdict = laPlaceTient({ ...agenda, sieges: places, services: auCalibre, categories: famillesDuSite }, { date: o.date, time: o.time, serviceIds: o.serviceIds, derniereVenue, ...(lourde ? { lourde: true } : {}) }, maintenant, true);
  if (!verdict.ok) return { erreur: verdict.erreur };
  /* L'HEURE EST UNE HEURE DE LA GRILLE — 17 novembre 2026. Le serveur
     n'accepte que les heures que l'écran propose : la grille du jour (08:30,
     puis l'heure). LE REFUS D'AVANT 08:30 N'EST PAS ICI : il appartient au
     juge (`laPlaceTient`) et au verrou de la base (`pose_si_libre`, 0222) ;
     ici, seulement ce que ce refus ne dit pas. Hors des repères
     ⟨place-du-serveur⟩ : WhatsApp ne propose que ses propres places. */
  const ouverture = ouvertureDuJour(o.date, agenda.semaine, agenda.exceptions);
  const debutDemande = minutesDeHhmm(o.time);
  if (debutDemande >= PREMIER_RENDEZ_VOUS_MIN
    && !heureSurLaGrille({ openMin: ouverture.openMin, closeMin: ouverture.closeMin, debutMin: debutDemande, premierMin: PREMIER_RENDEZ_VOUS_MIN })) {
    return { erreur: 'creneau_hors_ouverture' };
  }

  /* Les offres de la Maison, pour résoudre un code : lues ici, avec le reste,
     pour ne pas rouvrir la base une seconde fois. */
  const offresBrutes = doc('mnd_offers');
  if (placesDeLaRemise.error) console.error('demande-submit: places de la remise illisibles, aucune', placesDeLaRemise.error.message);
  return {
    dureeMin: verdict.dureeMin,
    reglages: doc('mnd_settings') ?? {},
    maitres: verdict.maitres,
    catalogue: (services.data ?? []) as ServiceEnBase[],
    offres: (Array.isArray(offresBrutes) ? offresBrutes : []) as any[],
    familles: agenda.categories,
    placesDeLaRemise: placesDeLaRemise.error ? null
      : (Array.isArray(placesDeLaRemise.data) ? placesDeLaRemise.data : []) as LigneDesPlaces[],
  };
}

/* ══ LE CODE DE L'OFFRE, RECOPIÉ DE `src/shared/offres-pur.ts` ══════
   Entre les deux repères, RIEN qui ne soit dans l'original, à une différence
   près : `dansLaSaison` reçoit le jour en graphie ISO au lieu d'une Date,
   parce que le jour se calcule ici dans le fuseau de la Maison (Deno tourne
   en UTC, et une saison qui finit le 30 se terminerait à 1 h du matin).
   `courtPourLaVenue` aussi, pour la même raison (2 novembre 2026 : le jour
   de la venue, « Le mercredi de la Maison »).
   LES PLACES LIMITÉES (4 novembre 2026) : `estAPlaces`, `placesRestantes`,
   `gesteSansRemise` et `offreDuJourDeLaVenue`, tels quels. Ici, le jour de
   Cotonou leur est toujours passé (`aujourdhui`), et les places viennent de
   la base (`placesConnues`, 0154) : `isoDuJour` n'est là que parce que
   l'original le nomme. */
/* ══ COPIE DE offres-pur : DÉBUT ══ */
const isoDuJour = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function joursEntre(depuisIso: string, versIso: string): number {
  const a = new Date(`${depuisIso}T00:00:00`).getTime();
  const b = new Date(`${versIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}
const CODE_MAX = 16;
const codeNormalise = (v: unknown): string =>
  String(v ?? '').replace(/\s+/g, '').toUpperCase().slice(0, CODE_MAX);
type OffreCodee = {
  id?: string; active: boolean; du?: string; au?: string; code?: string; discountPct?: number; serviceIds?: string[]; joursDeLaVenue?: string[];
  placesParJour?: number; jourVideSeulement?: boolean; horizonJours?: number;
};
const dansLaSaison = (o: { du?: string; au?: string }, j: string): boolean => {
  if (o.du && j < o.du) return false;
  if (o.au && j > o.au) return false;
  return true;
};
const JOURS_DES_OFFRES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
function jourDeLaSemaine(dateIso: unknown): string | null {
  const s = String(dateIso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return JOURS_DES_OFFRES[(d.getUTCDay() + 6) % 7];
}
const porteSurLeJourDeLaVenue = (o: { joursDeLaVenue?: readonly string[] } | null | undefined): boolean =>
  (o?.joursDeLaVenue?.length ?? 0) > 0;
function laVenueTombeBien(
  o: { joursDeLaVenue?: readonly string[]; du?: string; au?: string },
  dateIso: string | null | undefined,
): boolean {
  if (!porteSurLeJourDeLaVenue(o)) return true;
  const jour = jourDeLaSemaine(dateIso);
  if (!jour || !o.joursDeLaVenue!.includes(jour)) return false;
  const j = String(dateIso).slice(0, 10);
  if (o.du && j < o.du) return false;
  if (o.au && j > o.au) return false;
  return true;
}
function courtPourLaVenue(
  o: { joursDeLaVenue?: readonly string[]; du?: string; au?: string },
  j: string,
  venueIso?: string | null,
): boolean {
  if (!porteSurLeJourDeLaVenue(o)) return dansLaSaison(o, j);
  return laVenueTombeBien(o, venueIso === undefined ? j : venueIso);
}
function offreDuCode<T extends OffreCodee>(offres: readonly T[], code: unknown, j: string, venueIso?: string | null): T | null {
  const c = codeNormalise(code);
  if (!c) return null;
  return offres.find((o) => o.active && codeNormalise(o.code) === c && courtPourLaVenue(o, j, venueIso)) ?? null;
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
const estAPlaces = (o: { placesParJour?: number } | null | undefined): boolean =>
  Math.floor(o?.placesParJour ?? 0) > 0;
type OccupationDuJour = { prises: number; autres: number };
function placesRestantes(
  o: OffreCodee,
  dateIso: string | null | undefined,
  occ: OccupationDuJour | null | undefined,
  aujourdhui: string,
): number | null {
  if (!o?.active || !estAPlaces(o) || !occ || !dateIso) return null;
  const j = String(dateIso).slice(0, 10);
  if (!laVenueTombeBien(o, j) || j < aujourdhui) return null;
  const horizon = Math.floor(o.horizonJours ?? 0);
  if (horizon > 0 && joursEntre(aujourdhui, j) > horizon) return null;
  if (o.jourVideSeulement && occ.autres > 0) return 0;
  return Math.max(0, Math.floor(o.placesParJour as number) - occ.prises);
}
const gesteSansRemise = (s: { sansRemise?: boolean } | null | undefined): boolean => !!s?.sansRemise;
type VenueAJuger = {
  branchId?: string;
  dateIso: string | null | undefined;
  serviceIds: readonly string[];
  dejaUnCode?: boolean;
  couvertParAbonnement?: boolean;
  forfait?: boolean;
  ecartee?: boolean;
  occupation?: OccupationDuJour;
  aujourdhui?: string;
  prixConvenus?: boolean;
  autreRemise?: boolean;
  offreTenue?: string;
  placesConnues?: number | null;
};
function offreDuJourDeLaVenue<T extends OffreCodee & { branchId?: string }>(
  offres: readonly T[],
  v: VenueAJuger,
): T | null {
  if (v.dejaUnCode || v.couvertParAbonnement || v.forfait || v.ecartee || !v.dateIso) return null;
  const gestes = new Set(v.serviceIds);
  let mieux: T | null = null;
  for (const o of offres) {
    if (!o || !o.active || !codeNormalise(o.code) || !porteSurLeJourDeLaVenue(o)) continue;
    if (o.branchId && v.branchId && o.branchId !== v.branchId) continue;
    if (!laVenueTombeBien(o, v.dateIso)) continue;
    if (!(o.serviceIds ?? []).some((id) => gestes.has(id))) continue;
    if (estAPlaces(o)) {
      if (v.prixConvenus || v.autreRemise) continue;
      const tenue = !!o.id && v.offreTenue === o.id;
      const restantes = v.placesConnues !== undefined
        ? v.placesConnues
        : placesRestantes(o, v.dateIso, v.occupation, v.aujourdhui ?? isoDuJour(new Date()));
      if (!tenue && !((restantes ?? 0) > 0)) continue;
    }
    if (!mieux || (o.discountPct ?? 0) > (mieux.discountPct ?? 0)) mieux = o;
  }
  return mieux;
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
type ServiceEnBase = { id: string; data?: { name?: string; enClair?: string; priceXof?: number; priceMode?: string; hidePrice?: boolean; categoryId?: string; durationMin?: number; enabled?: boolean; archived?: boolean; sansRemise?: boolean } };
/* UN GESTE SANS REMISE N'EN PREND AUCUNE — 4 novembre 2026 (le Rituel Sówà™,
   `sansRemise` au catalogue, Yéman) : son prix ne s'engage pour aucun code,
   aucune place, aucun parrainage. Il garde son prix ; la ligne ne mord pas. */
const ligneAPrix = (id: string, catalogue: ServiceEnBase[]): LigneAPrix => {
  const s = catalogue.find((x) => x.id === id)?.data;
  const mode = s?.priceMode ?? (s?.hidePrice ? 'devis' : 'fixe');
  const p = Number(s?.priceXof ?? 0);
  const prix = !p || mode === 'devis' ? 0 : p;
  return { id, prixXof: prix, ferme: prix > 0 && !gesteSansRemise(s) };
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
  /** L'offre porte sur le jour de la venue (2 novembre 2026) : elle vaut à
      chaque venue ces jours-là, pas une seule fois par personne. */
  chaqueVenue?: boolean;
  /** LA PLACE LIMITÉE (4 novembre 2026) : la remise s'est posée d'elle-même
      avec la place, sans code tapé. */
  placeLimitee?: boolean;
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
  if (v.placeLimitee) return `place limitée, remise posée avec la place (${v.code})`;
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
  /** Le jour du rendez-vous (2 novembre 2026). Sans lui, une offre du jour
      de la venue ne court pour personne : on ne la juge pas sur aujourd'hui. */
  date?: string;
}): VerdictDuCode {
  const code = codeNormalise(o.code);
  if (!code) return { code: '' };
  /* De la branche du rendez-vous seulement ; une offre sans branche vaut partout. */
  const candidates = o.offres.filter((x) => !x.branchId || x.branchId === o.branchId);
  /* LE MERCREDI SE JUGE SUR LA VENUE — 2 novembre 2026. MERCREDI15 tapé pour
     un mardi ne court pas : c'est le jour du rendez-vous qui décide, pas
     celui où la page s'ouvre. Les autres offres restent jugées sur
     aujourd'hui, comme avant. */
  const offre = offreDuCode(candidates, code, jourDeLaMaison(), o.date ?? null);
  if (!offre) return { code, raison: 'inconnu' };
  const lignes = lignesDuCode(o.serviceIds.map((id) => ligneAPrix(id, o.catalogue)), offre);
  const pct = Math.max(0, Math.min(90, Math.round(offre.discountPct ?? 0)));
  const remisesLignes = lignes.some((l) => l.remisee) ? lignes.map((l) => (l.remisee ? { pct } : null)) : undefined;
  const base = {
    code, ...(offre.id ? { offreId: String(offre.id) } : {}),
    ...(porteSurLeJourDeLaVenue(offre) ? { chaqueVenue: true } : {}),
  };
  if (remisesLignes) return { ...base, remisesLignes };
  /* Sans pourcentage, l'offre DONNE quelque chose que le calcul ne sait pas
     retirer : un styling, un soin, des heures. Avec un pourcentage, elle ne
     mord sur rien de ce qui a été choisi. Deux gestes différents au comptoir. */
  return { ...base, raison: pct > 0 ? 'sans-effet' as const : 'cadeau' as const };
}

/* ══ LES PLACES LIMITÉES — 4 novembre 2026 ═════════════════════════════
   La décision de Yéman (maquette « Places limitées », « construis ») : la
   remise se pose D'ELLE-MÊME avec la place, plus aucun code à taper ; du mardi
   au vendredi, un jour vide, des places décomptées, une seule remise. Tout ce
   qui juge vit ici, sans base ni réseau : les places du jour viennent de la
   base (`places_de_la_remise`, 0154) et ce que porte le numéro aussi
   (`une_seule_remise`), lus par le serveur et passés en données. La base
   garde la dernière place sous verrou (`PLACES_LIMITEES`). */

/** Une ligne de `places_de_la_remise` : un jour, une offre, ses places. */
type LigneDesPlaces = { jour?: unknown; offre?: unknown; places?: unknown };

/** LES PLACES LUES POUR CETTE OFFRE CE JOUR-LÀ. `null` quand la base n'a rien
    dit (panne, jour non concerné) : jamais de remise sur un jour non compté. */
function placesLuesPour(lignes: readonly LigneDesPlaces[] | null | undefined, offreId: string | undefined, jour: string): number | null {
  if (!lignes || !offreId) return null;
  const l = lignes.find((x) => String(x?.offre ?? '') === offreId && String(x?.jour ?? '').slice(0, 10) === jour);
  const n = Number(l?.places);
  return l && Number.isInteger(n) && n >= 0 ? n : null;
}

/** CE CODE EST-IL CELUI D'UNE OFFRE À PLACES ? Il ne se tape plus : le site
    l'envoie pour dire « j'ai montré la remise de ce jour », et le serveur
    juge la place lui-même, jamais le code. */
function estUnCodeDesPlaces(offres: readonly OffreCodee[], code: unknown): boolean {
  const c = codeNormalise(code);
  return !!c && offres.some((o) => estAPlaces(o) && codeNormalise(o.code) === c);
}

/** Ce que les fiches du numéro portent déjà (`une_seule_remise`, 0154). */
type TeteLue = { prixConvenus?: boolean; abonnee?: boolean; famille?: boolean };
/** `illisible` : ce que porte le numéro n'a pas pu se relire. Dans le doute,
    pas de remise (Yéman, 4 novembre 2026). */
type RaisonDUneSeuleRemise = 'prix-convenus' | 'abonnee' | 'famille' | 'illisible';
type PlaceCandidate = { offre: OffreCodee & { branchId?: string }; remisesLignes: ({ pct: number } | null)[] };

/** LA PLACE QUE CE RENDEZ-VOUS PRENDRAIT, avant de savoir qui le prend : une
    offre à places de cette maison, dont un jour de la venue est ce jour, qui
    couvre un geste choisi, avec au moins une place lue. À plusieurs, la plus
    forte remise (`offreDuJourDeLaVenue`). `null` : aucune place pour cette
    venue. `'sans-effet'` : la place existe, mais aucun geste choisi n'a de
    prix ferme à remiser (un prix à la Maison, un geste sans remise) ; rien ne
    se pose, et ce n'est pas une place partie. */
function laPlaceCandidate(o: {
  offres: readonly (OffreCodee & { branchId?: string })[];
  places: readonly LigneDesPlaces[] | null;
  date: string; serviceIds: string[]; branchId: string; catalogue: ServiceEnBase[]; aujourdhui: string;
}): PlaceCandidate | 'sans-effet' | null {
  let mieux: (OffreCodee & { branchId?: string }) | null = null;
  for (const x of o.offres) {
    if (!estAPlaces(x)) continue;
    const r = offreDuJourDeLaVenue([x], {
      branchId: o.branchId, dateIso: o.date, serviceIds: o.serviceIds, aujourdhui: o.aujourdhui,
      placesConnues: placesLuesPour(o.places, x.id, o.date),
    });
    if (r && (!mieux || (r.discountPct ?? 0) > (mieux.discountPct ?? 0))) mieux = r;
  }
  if (!mieux) return null;
  const lignes = lignesDuCode(o.serviceIds.map((id) => ligneAPrix(id, o.catalogue)), mieux);
  if (!lignes.some((l) => l.remisee)) return 'sans-effet';
  const pct = Math.max(0, Math.min(90, Math.round(mieux.discountPct ?? 0)));
  return { offre: mieux, remisesLignes: lignes.map((l) => (l.remisee ? { pct } : null)) };
}

/** UNE SEULE REMISE : la place se pose, ou la raison qui l'écarte. Une tête
    aux prix convenus, abonnée, ou dont le compte famille porte une remise ne
    prend jamais de place (Yéman, 4 novembre 2026).

    DANS LE DOUTE, PAS DE REMISE (Yéman, au sélecteur, le même soir) : `null`
    (le numéro n'a pas pu se relire, ou la base a rendu une erreur) ne pose
    pas la place. Le rendez-vous tient au tarif de la Maison ; la réponse et
    la note le disent, jamais un prix changé en silence. L'usage d'un code
    (`codeDejaUtilise`) garde, lui, sa règle d'avant. */
function laPlaceTranchee(c: PlaceCandidate, tete: TeteLue | null): { raison: RaisonDUneSeuleRemise } | { verdict: VerdictDuCode } {
  if (!tete) return { raison: 'illisible' };
  if (tete?.prixConvenus) return { raison: 'prix-convenus' };
  if (tete?.abonnee) return { raison: 'abonnee' };
  if (tete?.famille) return { raison: 'famille' };
  return {
    verdict: {
      code: codeNormalise(c.offre.code), ...(c.offre.id ? { offreId: String(c.offre.id) } : {}),
      chaqueVenue: true, placeLimitee: true, remisesLignes: c.remisesLignes,
    },
  };
}

/** La raison, dite comme on la dirait à l'accueil, sur la note du rendez-vous. */
const uneSeuleRemiseEnClair = (r: RaisonDUneSeuleRemise | ''): string =>
  r === 'prix-convenus' ? 'une seule remise : ses prix convenus, sans place limitée'
    : r === 'abonnee' ? 'une seule remise : son abonnement, sans place limitée'
      : r === 'famille' ? 'une seule remise : sa remise famille, sans place limitée'
        : r === 'illisible' ? 'dans le doute, sans place limitée : ce que porte son numéro n’a pas pu se relire' : '';

/* ══ RÉSOLUTION DU CODE : FIN ══ */

/** Les graphies sous lesquelles un même numéro a pu s'écrire en base (sa clé,
    `formesDuNumero`), la sienne comprise. */
const numerosDeLaMemePersonne = (telephone: string): string[] => [...new Set([telephone, ...formesDuNumero(telephone)])];

/** CE NUMÉRO A-T-IL DÉJÀ REÇU CE CODE ? On ne regarde que les demandes dont
    le code a RÉELLEMENT retiré quelque chose (`codeApplique`), posé après
    l'écriture du rendez-vous.

    EN CAS D'ERREUR DE LECTURE, ON LAISSE PASSER LA REMISE. Le choix est
    délibéré : refuser une remise due à cause d'une panne de base se vit au
    comptoir, devant la cliente, alors qu'une remise donnée deux fois se
    rattrape sur une facture. L'erreur part au journal de la fonction. */
async function codeDejaUtilise(code: string, telephone: string): Promise<boolean> {
  if (!code || !telephone) return false;
  /* PAR LA CLÉ DU NUMÉRO — 17 novembre 2026 : « +229 97 00 00 01 » et
     « 01 97 00 00 01 » sont une personne ; toutes ses graphies se cherchent. */
  const { data, error } = await admin.from('demandes').select('id')
    .in('data->>telephone', numerosDeLaMemePersonne(telephone))
    .eq('data->>code', code)
    .eq('data->>codeApplique', 'true')
    .limit(1);
  if (error) {
    console.error('demande-submit: usage du code illisible', error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/** CE QUE LE NUMÉRO PORTE DÉJÀ — 4 novembre 2026 (`une_seule_remise`, 0154) :
    prix convenus, abonnement vivant au jour de la venue, remise famille. Trois
    oui/non, rien d'autre. Une lecture en panne rend `null` : dans le doute,
    la place ne se pose pas (voir `laPlaceTranchee`) ; l'erreur part au journal. */
async function remisesDuNumero(telephone: string, date: string): Promise<TeteLue | null> {
  const { data, error } = await admin.rpc('une_seule_remise', { p_numero: telephone, p_date: date });
  if (error || !data || typeof data !== 'object') {
    console.error('demande-submit: une seule remise illisible', error?.message ?? 'réponse vide');
    return null;
  }
  const d = data as Record<string, unknown>;
  /* Une réponse qui ne dit pas ses trois oui/non ne dit rien : dans le doute. */
  if (typeof d.prixConvenus !== 'boolean' || typeof d.abonnee !== 'boolean' || typeof d.famille !== 'boolean') {
    console.error('demande-submit: une seule remise incomplète');
    return null;
  }
  return { prixConvenus: d.prixConvenus === true, abonnee: d.abonnee === true, famille: d.famille === true };
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
/** LA DERNIÈRE VENUE DU NUMÉRO avant `dateIso` : le jour du rendez-vous honoré
    le plus récent de ses fiches (`derniereVenueAvant`, catalogue-pur). `jour`
    est `null` quand elle n'a aucune venue honorée ; `ok: false` quand une
    lecture a échoué (on ne devine pas). */
async function derniereVenueDuNumero(telephone: string, dateIso: string): Promise<{ ok: true; jour: string | null } | { ok: false }> {
  const fiches = await fichesDuNumero(telephone);
  if (!fiches) return { ok: false };
  if (fiches.length === 0) return { ok: true, jour: null };
  const ids = fiches.map((f) => f.id);
  const { data, error } = await admin.from('appointments').select('data')
    .in('data->>clientId', ids).eq('data->>status', 'honoré').limit(PLAFOND_D_UNE_REPONSE);
  if (error) { console.error('demande-submit: venues illisibles', error.message); return { ok: false }; }
  const rdvs = ((data ?? []) as { data?: { clientId?: unknown; date?: unknown; status?: unknown } }[]).map((r) => r.data ?? {});
  let jour: string | null = null;
  for (const id of ids) {
    const j = derniereVenueAvant(rdvs, id, dateIso);
    if (j && (jour === null || j > jour)) jour = j;
  }
  return { ok: true, jour };
}
async function dejaCliente(telephone: string): Promise<boolean> {
  const fiches = await fichesDuNumero(telephone);
  return !!fiches && fiches.length > 0;
}

/* ══ LE PRÉNOM COMPOSÉ — 7 novembre 2026 ══════════════════════════════════
   « Quand on leur écrit, on écrive toujours, dans leur rendez-vous et dans
   leur messagerie WhatsApp, tout le prénom composé » (Yéman) : le prénom
   d'usage de la fiche, sinon celui que le Trône devine du nom. Recopié de
   `src/shared/civilite.ts` entre ses repères ; verifie-le-prenom-d-usage
   et le banc des douze lunes tiennent la copie. */
/* ⟨prenom-d-usage⟩ */
/** LES PRÉNOMS QUI SE COMPOSENT (liste du 7 novembre 2026) : en tête d'un nom
    de trois mots ou plus sans NOM en capitales, ils prennent le mot suivant. */
const PRENOMS_QUI_SE_COMPOSENT: readonly string[] = ['Marie', 'Anne', 'Jean', 'Paul', 'Pierre', 'Louis'];
/** Les particules d'un nom de famille : « de », « da », « d'Agbo »… */
const PARTICULE_DU_NOM = /^(?:de|da|do|dos|das|du|des|di|del|della|van|von|le|la|d['’]\S*)$/i;
/** Un mot tout en capitales : au moins deux lettres, accents compris, l'apostrophe et le trait d'union admis. */
const motEnCapitales = (m: string): boolean => /^[\p{Lu}'’-]+$/u.test(m) && (m.match(/\p{Lu}/gu) ?? []).length >= 2;
/** La capitale d'un second prénom écrit en minuscules ; rien d'autre ne bouge. */
const capitaleDuSecond = (m: string): string => (/^\p{Ll}/u.test(m) ? `${m.charAt(0).toUpperCase()}${m.slice(1)}` : m);

/** LE PRÉNOM QUE LE TRÔNE DEVINE d'un nom complet (les règles 2 à 5). Le
    trait d'union se recolle dans le prénom, jamais vers un NOM en capitales
    (« Awa - KOSSI » reste deux mots). */
const prenomDevine = (nom: unknown): string => {
  const mots = String(nom ?? '').trim().replace(/\s+/g, ' ')
    .replace(/(\S+) ?- ?(?=(\S+))/g, (tout: string, g: string, d: string) => (motEnCapitales(g) || motEnCapitales(d) ? tout : `${g}-`))
    .split(' ').filter(Boolean);
  if (mots.length === 0) return '';
  const nomDeFamille = mots.findIndex((m, i) => i > 0 && motEnCapitales(m));
  if (nomDeFamille > 0) {
    const fin = mots.findIndex((m, i) => i > 0 && (i >= nomDeFamille || !/^\p{L}/u.test(m)));
    const prenoms = mots.slice(0, fin);
    while (prenoms.length > 1 && PARTICULE_DU_NOM.test(prenoms[prenoms.length - 1])) prenoms.pop();
    return prenoms.map((m, i) => (i > 0 && !PARTICULE_DU_NOM.test(m) ? capitaleDuSecond(m) : m)).join(' ');
  }
  const premier = mots[0].toLowerCase();
  const second = mots[1] ?? '';
  if (mots.length >= 3 && PRENOMS_QUI_SE_COMPOSENT.some((p) => p.toLowerCase() === premier) && /^\p{L}/u.test(second) && !PARTICULE_DU_NOM.test(second)) {
    return `${mots[0]} ${capitaleDuSecond(second)}`;
  }
  return mots[0];
};

/** LE PRÉNOM D'USAGE d'une cliente : celui de sa fiche, sinon celui que le
    Trône devine de son nom. `repli` sert quand la fiche manque mais qu'un nom
    est connu ailleurs (le rendez-vous, la demande du site). */
const prenomDUsage = (c: { name?: unknown; prenomUsage?: unknown } | null | undefined, repli?: unknown): string => {
  const note = String(c?.prenomUsage ?? '').trim().replace(/\s+/g, ' ');
  return note || prenomDevine(c?.name ?? repli);
};
/* ⟨/prenom-d-usage⟩ */
/* ══ MADAME NAFFI — 2 octobre 2026 ═════════════════════════════════════
   La Maison écrit « Madame Naffi » : la civilité de la fiche, puis le prénom.
   Une fiche qui ne dit rien est une dame ; une fiche au masculin d'avant ce
   jour est « Monsieur ». Recopié de `src/shared/civilite.ts` (une fonction
   Edge ne lit rien du dépôt) ; `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; prenomUsage?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : '';
  /* Tout le prénom composé (7 novembre 2026) : « Mme Anne Marie », jamais « Mme Anne ». */
  const prenom = prenomDUsage(d, repli);
  /* La civilité inconnue ne se suppose plus (13 octobre 2026) : le prénom seul. */
  if (!civ) return prenom || 'Madame, Monsieur';
  /* Abrégée devant le prénom (28 octobre 2026) : « M. Jean-Luc », « Mme Shadé » ; seule, en entier. */
  if (prenom) return `${civ === 'monsieur' ? 'M.' : civ === 'mademoiselle' ? 'Mlle' : 'Mme'} ${prenom}`;
  return civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
};

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
  return { id: fiche.id, prenom: prenomDUsage(fiche.data), telephone: String(fiche.data.phone ?? ''), clientId: fiche.id };
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
    .in('data->>telephone', numerosDeLaMemePersonne(telephone)).eq('data->>codeRaison', 'parrainage').limit(1);
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
  const prenom = appelDe({ ...(ficheMarraine ?? {}), prenomUsage: o.prenomMarraine || ficheMarraine?.prenomUsage });
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
   est posé et approuvé. Le « à défaut, le même modèle » de ce jour-là
   écrivait « pour le un rendez-vous » : depuis le 15 octobre, à défaut,
   rien ne part (accuse-du-site). */
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
  /** Une place était demandée (posée ou non) : 15 octobre 2026. */
  avecPlace: boolean;
  /** La civilité qu'elle a choisie sur le site (13 octobre 2026). */
  civilite?: string;
}): Promise<string> {
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  /* LE MODÈLE DE CE QU'ELLE A DEMANDÉ — 15 octobre 2026 (accuse-du-site) :
     une demande sans place ne prend plus jamais le modèle d'une place. */
  const genreAccuse = genreDAccuse({ pose: !!o.apptId, avecPlace: o.avecPlace });
  const MODELE = modeleDeLAccuse(genreAccuse, {
    conf: Deno.env.get('WA_TEMPLATE_CONF'),
    accuse: Deno.env.get('WA_TEMPLATE_ACCUSE'),
    simple: Deno.env.get('WA_TEMPLATE_ACCUSE_SIMPLE'),
  });
  if (!MODELE) {
    console.log('demande-submit: accusé retenu, WA_TEMPLATE_ACCUSE_SIMPLE n est pas posé');
    return 'sans-modele';
  }
  if (!WA_TOKEN || !WA_PHONE_ID) return 'sans-cles';
  /* Meta veut le numéro international sans « + » ; le serveur l'a déjà mis
     en E.164 (telephoneNormalise). */
  const tel = o.telephone.replace(/\D/g, '');
  if (!tel) return 'sans-numero';
  /* UN NUMÉRO NE REÇOIT PAS PLUS DE CINQ MODÈLES DU SITE PAR JOUR — 17 novembre
     2026. Au-delà, rien ne part ; la demande, elle, est écrite. */
  if (!(await modelePermisAuNumero(o.telephone))) return 'plafond';
  /* LA CIVILITÉ QU'ELLE A CHOISIE (13 octobre 2026) : « ce n'est pas une
     Madame, c'est un Monsieur » (Yéman). Rien de choisi (une ancienne
     page) : Madame, comme toute fiche muette. */
  const prenom = appelDe(o.civilite ? { civilite: o.civilite } : null, o.prenom);
  const quand = o.quand;

  /* LA CONFIRMATION À LIENS — 3 novembre 2026. Une place posée part avec sa
     référence et deux boutons (« Déplacer ou annuler », « Ajouter à mon
     agenda ») dès que le modèle `confirmation_rdv_liens` est approuvé et son
     nom posé dans WA_TEMPLATE_CONF_LIENS. Si Meta refuse le modèle neuf
     (#132xxx), l'ancienne confirmation part dans la même seconde : la place
     ne reste jamais sans son message. Les deux autres accusés ne changent pas. */
  const LIENS = genreAccuse === 'confirmation' && o.apptId ? (Deno.env.get('WA_TEMPLATE_CONF_LIENS') ?? '').trim() : '';
  const reference = o.apptId ? referenceDuRendezVous(o.apptId) : '';
  const jeton = LIENS && SECRET_DES_LIENS && o.apptId ? await jetonDuRendezVous(SECRET_DES_LIENS, o.apptId).catch(() => '') : '';

  let statut = 'échec';
  let detail: string | undefined;
  let codeMeta: number | undefined;
  let waId = '';
  let avecLiens = false;
  let repliDuModele: number | undefined;
  try {
    for (const liens of jeton ? [true, false] : [false]) {
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
            name: liens ? LIENS : MODELE,
            language: { code: 'fr' },
            components: composantsDeLaConfirmation({ avecLiens: liens, prenom, quand, reference, jeton }),
          },
        }),
        signal: garde.signal,
      });
      clearTimeout(minuterie);
      const rep = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
      waId = String(rep?.messages?.[0]?.id ?? '');
      avecLiens = liens;
      if (r.ok) {
        statut = 'envoyé';
        detail = waId ? undefined : 'accepté sans identifiant Meta';
        codeMeta = undefined;
        break;
      }
      codeMeta = Number(rep?.error?.code) || undefined;
      detail = String(rep?.error?.message ?? `HTTP ${r.status}`);
      /* Seul un refus DU MODÈLE fait partir l'ancien ; un numéro hors
         WhatsApp le refuserait aussi. */
      if (!liens || !refusDuModele(codeMeta)) break;
      repliDuModele = codeMeta;
    }
  } catch (e) {
    detail = String(e);
  }
  const modeleParti = avecLiens ? LIENS : MODELE;

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
      modele: modeleParti,
      ...(reference ? { reference } : {}),
      ...(repliDuModele ? { repliDuModele } : {}),
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
        texte: genreAccuse === 'confirmation' ? texteDeLaConfirmation({ avecLiens, prenom, quand, reference }) : texteDeLAccuse(genreAccuse, prenom, quand),
        type: 'text', quand: maintenant, etat: 'en-route', modele: modeleParti, parQui: 'Le Trône',
      },
    }, { onConflict: 'id' });
    if (error) console.error('demande-submit: fil', error.message);
  }
  return statut;
}

/* ══ LA PAGE DU RENDEZ-VOUS — 3 novembre 2026 ═══════════════════════════
   `/rdv/?v=<jeton>` et `/rdv/agenda/?v=<jeton>`, ouvertes par les deux
   boutons de la confirmation. Le jeton signé désigne le rendez-vous ; la
   réponse ne dit que ce que la confirmation disait déjà : le jour, l'heure,
   la durée, les gestes, l'appel et la référence. Jamais le numéro, ni le
   nom entier, ni le prix. Un jeton faux ou forgé ne lit rien. */
async function litLeRendezVous(v: unknown): Promise<Response> {
  const apptId = await apptIdDuJeton(SECRET_DES_LIENS, v);
  if (!apptId) return json({ ok: false, error: 'lien' });
  const rdv = await rdvPourLaPage(apptId);
  return rdv ? json({ ok: true, rdv }) : json({ ok: false, error: 'introuvable' });
}

/** Le rendez-vous tel que la page le lit : la lecture de `{ rdv: 'lire' }`,
    et la même que rend `{ rdv: 'deplacer' }` (7 novembre 2026) pour que
    l'écran « Rendez-vous déplacé » dise ce que la page dira ensuite. `null` :
    illisible ou introuvable. */
async function rdvPourLaPage(apptId: string): Promise<{
  reference: string; date: string; heure: string; dureeMin: number; gestes: string[]; appel: string; statut: EtatDuRdv;
  /** L'ATTENTE (17 novembre 2026) : où en est une place née en attente, son échéance, son acompte. */
  attente?: EtatDeLAttente; attenduJusquAu?: string; acompteXof?: number; branchId?: string;
  /** Combien de fois elle peut encore le déplacer depuis le site. */
  deplacementsRestants: number;
} | null> {
  const { data: row, error } = await admin.from('appointments').select('id, data').eq('id', apptId).maybeSingle();
  if (error) { console.error('demande-submit: rendez-vous illisible', error.message); return null; }
  const a = (row?.data ?? null) as {
    date?: string; time?: string; dureeMin?: number; serviceIds?: unknown; status?: string; clientId?: string; clientName?: string;
    attenduJusquAu?: string; confirmeeParLaClienteLe?: string; depositXof?: number; depositConfirmed?: boolean; placeLibereeLe?: string; branchId?: string;
    deplacements?: number; deplaceLe?: string; deplacePar?: string;
  } | null;
  if (!a || !a.date || !a.time) return null;
  const attente = etatDeLAttente(a);
  const ids = Array.isArray(a.serviceIds) ? (a.serviceIds as unknown[]).map(String).slice(0, 6) : [];
  const [{ data: sv }, { data: fiche }, { data: dem }] = await Promise.all([
    ids.length ? admin.from('services').select('id, data').in('id', ids) : Promise.resolve({ data: [] as { id: string; data: { name?: string } }[] }),
    a.clientId ? admin.from('clients').select('data').eq('id', a.clientId).maybeSingle() : Promise.resolve({ data: null }),
    /* Une réservation du site pas encore rattachée à sa fiche : la civilité
       qu'elle a choisie vit dans sa demande. */
    a.clientId ? Promise.resolve({ data: [] as { data: { prenom?: string; civilite?: string } }[] }) : admin.from('demandes').select('data').eq('data->>apptId', apptId).limit(1),
  ]);
  const noms = new Map(((sv ?? []) as { id: string; data?: { name?: string } }[]).map((s) => [s.id, String(s.data?.name ?? '').trim()]));
  const laDemande = ((dem ?? []) as { data?: { prenom?: string; civilite?: string } }[])[0]?.data;
  const appel = fiche?.data
    ? appelDe(fiche.data as { name?: unknown; civilite?: unknown; auMasculin?: unknown }, a.clientName)
    : appelDe(laDemande?.civilite ? { civilite: laDemande.civilite } : null, laDemande?.prenom ?? a.clientName);
  return {
    reference: referenceDuRendezVous(apptId), date: a.date, heure: a.time,
    dureeMin: Math.max(15, Math.round(Number(a.dureeMin) || 60)),
    gestes: ids.map((id) => noms.get(id) ?? '').filter(Boolean),
    appel, statut: etatDuRendezVous(a, aujourdhuiACotonou()),
    /* La page n'apprend l'attente que tant qu'elle dure : son oui, ou son acompte. */
    ...(attente === 'sans-reponse' || attente === 'acompte' ? {
      attente, attenduJusquAu: String(a.attenduJusquAu),
      /* L'ACOMPTE SE RÈGLE SUR LA PAGE (17 novembre 2026) : son montant, et la
         maison qui l'encaisse (KkiaPay la porte, kkiapay-verify l'exige). */
      ...(attente === 'acompte' ? { acompteXof: acompteAttendu(a), ...(a.branchId ? { branchId: String(a.branchId) } : {}) } : {}),
    } : {}),
    deplacementsRestants: Math.max(0, DEPLACEMENTS_AU_PLUS - deplacementsFaits(a)),
  };
}

/* ══ DÉPLACER SON RENDEZ-VOUS DEPUIS LE SITE — 7 novembre 2026 ═══════════
   « DÉPLACER son RDV depuis le site, ouvrir le calendrier et changer de
   date » (Yéman). La page /rdv/?v= (le jeton signé) demande les places libres
   (`{ rdv: 'places', v }`) puis déplace (`{ rdv: 'deplacer', v, date, time }`).
   Elles vivent ICI, avec le juge des places et le verrou, pas dans
   `terminer-et-regler` : c'est cette fonction qui lit l'agenda de la Maison.

   LES MÊMES GARANTIES QUE LA PORTE WHATSAPP (`deplaceSousVerrou`,
   whatsapp-automate, 2 novembre 2026) : la place est rejugée pour SON maître,
   pour la même durée, sur un instantané frais du jour, son propre créneau
   rendu libre ; puis l'écriture se fait SOUS CONDITION (`updated_at`
   inchangé : une ligne que le Trône a bougée entre-temps se relit et se
   rejuge, trois essais au plus). Jamais un statut changé, jamais un nouveau
   rendez-vous, jamais un autre maître, jamais une autre durée, jamais un
   autre soin, jamais un autre prix : le rendez-vous garde son identifiant,
   donc sa référence MND-XXXX et son jeton. LES 24 HEURES (⟨deplacer-du-site⟩) :
   l'heure d'origine ET la place d'arrivée doivent être à plus de 24 h.

   LE PRIX NE BOUGE PAS. Déplacer n'applique aucune remise du jour et n'en
   retire aucune : la page ne montre donc pas les remises, et le rendez-vous
   garde son prix figé (jamais deux remises, jamais d'argent déplacé).

   APRÈS L'ÉCRITURE, une fois : le journal du Trône, le WhatsApp de
   confirmation (le modèle de la confirmation, la nouvelle date ; sa ligne
   `depl-<rdv>-<jour><heure>-site` se RÉSERVE avant l'envoi, un double
   toucher ou un rejeu ne le double jamais), l'équipe prévenue. Un rendez-vous
   « en attente » n'est pas dit confirmé : sa confirmation, à venir, portera
   la nouvelle date. `deplaceLe` fait aussi retenir par le facteur ce que la
   salle d'attente tenait pour l'ancienne heure.

   TROIS RÈGLES DE PLUS — 17 novembre 2026 (Yéman, « La consultation en
   affiches ») :
     · DEUX FOIS AU PLUS (`DEPLACEMENTS_AU_PLUS`) : au-delà, la page le dit
       et propose d'écrire à la Maison ;
     · SOUS LE VERROU DES PLACES (`deplace_si_libre`, 0223) : celui des
       poses ; la base rejoue les places, le plafond et SON maître sous ce
       verrou, sur la ligne relue ;
     · LA REMISE D'UN JOUR NE SUIT PAS UN AUTRE JOUR
       (`remiseGardeeAuDeplacement`) : la place limitée d'un jour, le
       mercredi de la Maison déplacé à un samedi. Depuis le site, un
       rendez-vous qui porte une telle remise ne se déplace que vers un jour
       où elle vaut encore : les autres jours ne sont pas proposés, et un
       appel direct est refusé (`remise_perdue`). Pour un autre jour, elle
       écrit à la Maison, qui décide du prix : il ne change jamais en silence,
       et la remise ne se garde jamais à tort. */
/* ⟨deplacer-du-site⟩ */
/** Vingt-quatre heures : le délai pour déplacer, dans les deux sens. */
export const DELAI_POUR_DEPLACER_MS = 24 * 3_600_000;

/** L'instant d'un rendez-vous (date et heure de Cotonou), ou NaN si l'un
    des deux ne se lit pas. */
export function instantDuRdvDuSite(date: unknown, time: unknown): number {
  const d = String(date ?? '').slice(0, 10);
  const h = String(time ?? '').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(h)) return Number.NaN;
  return Date.parse(`${d}T${h}:00+01:00`);
}

/** Ce que la règle dit d'un rendez-vous qu'on voudrait déplacer. */
export type VerdictDuDeplacement = 'permis' | 'annule' | 'passe' | 'trop-tard' | 'illisible';

/** SE DÉPLACE-T-IL ? Seul un rendez-vous « confirmé » ou « en attente » se
    déplace ; annulé se dit annulé ; honoré ou clos se dit passé ; une heure
    déjà venue aussi ; à 24 h ou moins, c'est « trop tard » ; plus de 24 h,
    c'est permis. */
export function deplacementPermis(r: { status?: unknown; date?: unknown; time?: unknown } | null | undefined, maintenantMs: number): VerdictDuDeplacement {
  if (!r) return 'illisible';
  if (r.status === 'annulé') return 'annule';
  if (r.status !== 'confirmé' && r.status !== 'en attente') return 'passe';
  const debut = instantDuRdvDuSite(r.date, r.time);
  if (!Number.isFinite(debut) || !Number.isFinite(maintenantMs)) return 'illisible';
  if (debut <= maintenantMs) return 'passe';
  return debut - maintenantMs > DELAI_POUR_DEPLACER_MS ? 'permis' : 'trop-tard';
}

/** LA PLACE D'ARRIVÉE, avant toute lecture : à plus de 24 h d'ici aussi.
    `creneau_trop_proche` est le code que le serveur rend ; le jour même, la
    fenêtre et l'ouverture se jugent ailleurs (`laPlaceEstRecevable`). */
export function arriveeRecevable(p: { date: unknown; time: unknown }, maintenantMs: number): 'creneau_invalide' | 'creneau_trop_proche' | null {
  const debut = instantDuRdvDuSite(p.date, p.time);
  if (!Number.isFinite(debut) || !Number.isFinite(maintenantMs)) return 'creneau_invalide';
  return debut - maintenantMs > DELAI_POUR_DEPLACER_MS ? null : 'creneau_trop_proche';
}
/* ⟨/deplacer-du-site⟩ */

/** Un rendez-vous relu frais, avec de quoi écrire sous condition. */
type RdvDuSite = { id: string; branchId: string; updatedAt: string; data: any };
async function leRdvDuSite(apptId: string): Promise<RdvDuSite | null> {
  const { data, error } = await admin.from('appointments').select('id, branch_id, data, updated_at').eq('id', apptId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.data) return null;
  return { id: String(data.id), branchId: String(data.branch_id ?? data.data?.branchId ?? ''), updatedAt: String(data.updated_at ?? ''), data: data.data };
}

/** L'agenda de la Maison, jour par jour, de `du` à `au` : ce que le juge lit
    (la branche, les réglages, les murs, le catalogue, les créneaux pris),
    lu à neuf. `null` quand une lecture manque ou qu'une tranche de mille
    créneaux pourrait cacher un rendez-vous : mieux vaut refuser. */
async function lisLAgendaDuSite(brancheId: string, du: string, au: string): Promise<AgendaDuServeur | null> {
  const branche = (await brancheParDefaut(brancheId)).ligne;
  const [docs, services, categories, blocages, occupes] = await Promise.all([
    admin.from('documents').select('key, data').in('key', ['mnd_settings', 'mnd_horaires_exceptions', 'mnd_vitrine_config']),
    toutesLesLignes('catalog_services'),
    toutesLesLignes('catalog_categories'),
    litToutesLesPages<LigneDeTable>((apres, taille) => {
      let page = admin.from('blocages').select('id, data').eq('data->>branchId', branche.id).gte('data->>date', du).lte('data->>date', au);
      if (apres !== null) page = page.gt('id', apres);
      return page.order('id', { ascending: true }).limit(taille) as unknown as PromiseLike<ReponseDePage<LigneDeTable>>;
    }),
    admin.rpc('creneaux_occupes', { p_branch: branche.id, p_du: du, p_au: au }),
  ]);
  const lectureManquee = docs.error ?? services.error ?? categories.error ?? blocages.error ?? occupes.error;
  const pris = (Array.isArray(occupes.data) ? occupes.data : []) as unknown[];
  if (lectureManquee || pris.length >= PLAFOND_D_UNE_REPONSE) {
    console.error('demande-submit: agenda du deplacement illisible', lectureManquee?.message ?? 'une tranche de mille créneaux');
    return null;
  }
  const doc = (cle: string): any => ((docs.data ?? []) as { key: string; data?: any }[]).find((d) => d.key === cle)?.data;
  return agendaDepuisLesLignes({
    branche, reglages: doc('mnd_settings'), exceptions: doc('mnd_horaires_exceptions'), vitrine: doc('mnd_vitrine_config'),
    services: services.data ?? [], categories: categories.data ?? [], blocages: blocages.data ?? [], occupes: pris,
  });
}

/** LE RENDEZ-VOUS QU'ON DÉPLACE, rendu libre : son créneau (ce maître, ce
    jour, cette heure) retiré une fois de l'agenda. */
/** Sa tête, lue sur son propre créneau (`creneaux_occupes`, 0238) : lourde à
    150 locks ou plus. Deux têtes chez Team, 18 novembre 2026. */
function lourdeDuRdvDuSite(agenda: AgendaDuServeur, maitre: string, sauf: { date: string; time: string }): boolean {
  const debut = minutesDeHhmm(sauf.time);
  return !!agenda.occupes.find((c) => c.jour === sauf.date && (c.maitre ?? '') === maitre && minutesDeHhmm(c.debut) === debut)?.lourde;
}

function agendaSansLeRdvDuSite(agenda: AgendaDuServeur, maitre: string, sauf: { date: string; time: string }): AgendaDuServeur {
  let retire = false;
  const debut = minutesDeHhmm(sauf.time);
  const occupes = agenda.occupes.filter((c) => {
    if (retire) return true;
    if (c.jour === sauf.date && (c.maitre ?? '') === maitre && minutesDeHhmm(c.debut) === debut) { retire = true; return false; }
    return true;
  });
  return { ...agenda, occupes };
}

/** LES PLACES D'UN SEUL MAÎTRE, pour cette durée, de demain à la borne de la
    réservation : fauteuils, plafonds et murs compris, sa propre place rendue
    libre, la place d'origine écartée, et jamais une arrivée à moins de 24 h.
    Les jours fermés se disent à part (la grille les grise). */
function placesDeLaMaisonPourDeplacer(
  agenda: AgendaDuServeur, maitre: string, sauf: { date: string; time: string; dureeMin: number }, ms: number,
): { jours: Record<string, string[]>; fermes: string[] } {
  const duree = Math.max(1, Math.round(Number(sauf.dureeMin) || 60));
  const lourde = lourdeDuRdvDuSite(agenda, maitre, sauf);
  const sans = agendaSansLeRdvDuSite(agenda, maitre, sauf);
  const aujourdhui = jourDeCotonou(ms);
  const jours: Record<string, string[]> = {};
  const fermes: string[] = [];
  for (let i = 1; i <= joursDeLaFenetre(ms); i += 1) {
    const iso = isoApresJours(aujourdhui, i);
    const opening = ouvertureDuJour(iso, sans.semaine, sans.exceptions);
    if (opening.closed) { fermes.push(iso); continue; }
    const libres = creneauxLibres({
      opening, durationMin: duree, occupes: occupesDuJour(sans.occupes, iso),
      bloques: plagesBloquees(sans.murs, sans.branchId, iso, maitre), master: maitre,
      capMaison: sans.capMaison, capMaitre: sans.capMaitre, capSimultane: sans.sieges, maintenantMin: null,
      ...(lourde ? { lourde: true } : {}),
    });
    const heures = [...libres].sort()
      .filter((h) => arriveeRecevable({ date: iso, time: h }, ms) === null && !(iso === sauf.date && h === sauf.time));
    if (heures.length > 0) jours[iso] = heures;
  }
  return { jours, fermes };
}

/** LA PLACE TIENT-ELLE POUR CE MAÎTRE ? La forme et la fenêtre, l'ouverture,
    le plafond de la Maison, les places en ligne, puis le maître lui-même (son
    plafond, ses rendez-vous, ses murs), le rendez-vous déplacé rendu libre. Un
    autre maître libre à cette heure ne compte pas. LES 24 HEURES de l'arrivée
    et « la même place » se jugent avant, une fois (`deplaceDepuisLeSite`) :
    ici, seulement ce que l'agenda dit. */
function laPlaceTientPourDeplacer(
  agenda: AgendaDuServeur, maitre: string, p: { date: string; time: string; dureeMin: number }, sauf: { date: string; time: string }, ms: number,
): { ok: true } | { ok: false; erreur: RefusDeLaPlace } {
  const recevable = laPlaceEstRecevable(p, ms);
  if (recevable) return { ok: false, erreur: recevable };
  const fenetre = ouvertureDuJour(p.date, agenda.semaine, agenda.exceptions);
  if (fenetre.closed) return { ok: false, erreur: 'creneau_ferme' };
  const debut = minutesDeHhmm(p.time);
  const fin = debut + Math.max(1, Math.round(Number(p.dureeMin) || 60));
  /* Jamais avant 08:30, même pour un rendez-vous déplacé (17 novembre 2026). */
  if (debut < Math.max(fenetre.openMin, PREMIER_RENDEZ_VOUS_MIN) || fin > fenetre.closeMin) return { ok: false, erreur: 'creneau_hors_ouverture' };
  const lourde = lourdeDuRdvDuSite(agenda, maitre, sauf);
  const sans = agendaSansLeRdvDuSite(agenda, maitre, sauf);
  const duJour = occupesDuJour(sans.occupes, p.date);
  if (sans.capMaison > 0 && duJour.length >= sans.capMaison) return { ok: false, erreur: 'creneau_plafond' };
  const chevauche = (s: number, e: number): boolean => debut < e && fin > s;
  if (sans.sieges > 0 && duJour.filter((a) => chevauche(a.debutMin, a.debutMin + a.dureeMin)).length >= sans.sieges) return { ok: false, erreur: 'creneau_pris' };
  const siens = duJour.filter((a) => a.maitre === maitre);
  if (sans.capMaitre > 0 && siens.length >= sans.capMaitre) return { ok: false, erreur: 'creneau_plafond' };
  /* DEUX TÊTES CHEZ TEAM (18 novembre 2026) : la règle du juge (`laPlaceTient`). */
  const chevauchent = siens.filter((a) => chevauche(a.debutMin, a.debutMin + a.dureeMin));
  const occupe = chevauchent.some((a) => bloqueLaVenue(maitre, lourde, a))
    || chevauchent.length >= DEUX_TETES_AU_PLUS
    || plagesBloquees(sans.murs, sans.branchId, p.date, maitre).some(([s, e]) => chevauche(s, e));
  return occupe ? { ok: false, erreur: 'creneau_pris' } : { ok: true };
}

/** Son maître, sa durée figée et ses soins : ce que le rendez-vous porte déjà. */
function enteteDuRdvDuSite(a: any, agenda: AgendaDuServeur): { maitre: string; dureeMin: number; serviceIds: string[] } {
  const serviceIds = Array.isArray(a.serviceIds) ? (a.serviceIds as unknown[]).map(String).filter(Boolean) : [];
  const e = Number(a.dureeMin);
  return {
    maitre: String(a.master ?? ''), serviceIds,
    dureeMin: Number.isFinite(e) && e >= 1 ? Math.round(e) : dureeDesPrestations(serviceIds, agenda.services),
  };
}

/** Pourquoi un rendez-vous ne se déplace pas (la règle des 24 heures), en code. */
const refusDuDeplacement = (v: 'annule' | 'passe' | 'trop-tard' | 'illisible'): string =>
  v === 'trop-tard' ? 'trop_tard' : v === 'illisible' ? 'introuvable' : v;

/** LA REMISE DE CE RENDEZ-VOUS SUIT-ELLE À TEL JOUR ? Les offres de la Maison
    se lisent une fois ; le juge est `remiseGardeeAuDeplacement`. Une lecture
    en panne : dans le doute, la remise ne suit pas un autre jour. */
async function jugeDeLaRemise(a: any): Promise<(vers: string) => boolean> {
  const aUneRemise = Array.isArray(a?.remisesLignes) && (a.remisesLignes as unknown[]).some((l) => !!l);
  if (!aUneRemise) return () => true;
  const bienvenue = a.codeRaison === 'parrainage';
  const { data, error } = await admin.from('documents').select('data').eq('key', 'mnd_offers').maybeSingle();
  if (error) console.error('demande-submit: offres illisibles pour le deplacement', error.message);
  const offres = (!error && Array.isArray(data?.data) ? data.data : []) as (OffreCodee & { id?: string })[];
  const offre = offres.find((o) => !!o?.id && o.id === a.offreId)
    ?? offres.find((o) => !!codeNormalise(o?.code) && codeNormalise(o.code) === codeNormalise(a.codeOffre))
    ?? null;
  return (vers: string): boolean => remiseGardeeAuDeplacement({
    aUneRemise, memeJour: String(a.date) === vers, bienvenue, offreConnue: !!offre,
    aPlaces: estAPlaces(offre), lieeAuJour: porteSurLeJourDeLaVenue(offre), tombeBien: !!offre && laVenueTombeBien(offre, vers),
  });
}

/** { rdv: 'places', v } : les places libres de SON maître, pour SA durée. */
async function placesPourDeplacer(ip: string, v: unknown): Promise<Response> {
  /* Le frein de l'adresse d'abord : un jeton qu'on invente ne coûte rien à la base. */
  if (!(await allowRate(ip, 'rdv_places', 30))) return json({ error: 'rate_limited' }, 429);
  const apptId = await apptIdDuJeton(SECRET_DES_LIENS, v);
  if (!apptId) return json({ ok: false, error: 'lien' });
  if (!(await allowRate(apptId, 'rdv_places_jeton', 40))) return json({ error: 'rate_limited' }, 429);
  const ligne = await leRdvDuSite(apptId);
  if (!ligne) return json({ ok: false, error: 'introuvable' });
  const ms = Date.now();
  const verdict = deplacementPermis(ligne.data, ms);
  if (verdict !== 'permis') return json({ ok: true, deplacable: false, raison: refusDuDeplacement(verdict) });
  const a = ligne.data;
  /* DEUX FOIS AU PLUS (17 novembre 2026) : la page le dit, et mène à la Maison. */
  if (!peutEncoreSeDeplacer(a)) return json({ ok: true, deplacable: false, raison: 'trop_de_deplacements' });
  const horizon = finDeLaReservation(jourDeCotonou(ms));
  const agenda = await lisLAgendaDuSite(ligne.branchId, isoApresJours(jourDeCotonou(ms), 1), horizon);
  if (!agenda) return json({ ok: false, error: 'agenda_illisible' });
  const { maitre, dureeMin } = enteteDuRdvDuSite(a, agenda);
  const { jours, fermes } = placesDeLaMaisonPourDeplacer(agenda, maitre, { date: String(a.date), time: String(a.time), dureeMin }, ms);
  /* LES JOURS OÙ SA REMISE NE SUIVRAIT PAS ne sont pas proposés (17 novembre 2026). */
  const suit = await jugeDeLaRemise(a);
  for (const iso of Object.keys(jours)) if (!suit(iso)) delete jours[iso];
  return json({
    ok: true, deplacable: true, du: isoApresJours(jourDeCotonou(ms), 1), au: horizon, dureeMin,
    actuel: { date: String(a.date), heure: String(a.time) }, jours, fermes,
    restants: Math.max(0, DEPLACEMENTS_AU_PLUS - deplacementsFaits(a)),
  });
}

/** Le numéro et l'appel de la cliente, pour son message : celui à prévenir
    (le parent qui a pris le rendez-vous), sinon sa fiche, sinon la demande du
    site qui l'a posé. */
async function coordonneesPourLeDeplacement(a: any, apptId: string): Promise<{ appel: string; numero: string }> {
  const [{ data: fiche }, { data: dem }] = await Promise.all([
    a.clientId ? admin.from('clients').select('data').eq('id', String(a.clientId)).maybeSingle() : Promise.resolve({ data: null }),
    a.clientId ? Promise.resolve({ data: [] as { data: { prenom?: string; civilite?: string; telephone?: string } }[] })
      : admin.from('demandes').select('data').eq('data->>apptId', apptId).limit(1),
  ]);
  const laDemande = ((dem ?? []) as { data?: { prenom?: string; civilite?: string; telephone?: string } }[])[0]?.data;
  const appel = fiche?.data
    ? appelDe(fiche.data as { name?: unknown; prenomUsage?: unknown; civilite?: unknown; auMasculin?: unknown }, a.clientName)
    : appelDe(laDemande?.civilite ? { civilite: laDemande.civilite } : null, laDemande?.prenom ?? a.clientName);
  const numero = String(a.numeroAPrevenir ?? '').trim() || String(fiche?.data?.phone ?? '').trim() || String(laDemande?.telephone ?? '').trim();
  return { appel, numero: numero.replace(/\D/g, '') };
}

/** LE WHATSAPP DE CONFIRMATION D'UN DÉPLACEMENT, une fois. La ligne
    `depl-<rdv>-<jour><heure>-site` se réserve AVANT l'envoi (une insertion
    qui ne remplace rien) : qui la perd ne l'envoie pas. Le modèle de la
    confirmation, avec ses liens quand ils sont posés, le même jeton (la même
    page, la même référence) ; un refus du modèle neuf renvoie l'ancien.
    Rend le statut : envoyé, échec, deja, sans-modele, sans-cles, sans-numero. */
async function confirmeLeDeplacement(o: {
  apptId: string; branchId: string; clientId: string; appel: string; numero: string; date: string; time: string; de: { date: string; time: string };
}): Promise<string> {
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const MODELE = modeleDeLAccuse('confirmation', { conf: Deno.env.get('WA_TEMPLATE_CONF') });
  if (!WA_TOKEN || !WA_PHONE_ID) return 'sans-cles';
  if (!o.numero) return 'sans-numero';
  const id = `depl-${o.apptId}-${o.date.replace(/-/g, '')}${o.time.replace(':', '')}-site`;
  const maintenant = new Date().toISOString();
  const quand = `${jourEnClair(o.date)} à ${heureLisible(o.time)}`;
  const reference = referenceDuRendezVous(o.apptId);
  /* RÉSERVER LA LIGNE : une ligne qui existe déjà (un double toucher, un
     rejeu) se garde telle quelle, et rien ne repart. */
  const { data: reservee, error: errReserve } = await admin.from('envois').upsert({
    id, branch_id: o.branchId || null,
    data: {
      id, ...(o.branchId ? { branchId: o.branchId } : {}), type: 'confirmation', canal: 'whatsapp', apptId: o.apptId,
      ...(o.clientId ? { clientId: o.clientId } : {}), prenom: o.appel, numero: `+${o.numero}`, dateRdv: o.date, heure: o.time,
      moment: quand, deplacement: { de: o.de, par: 'site' }, statut: 'en cours', detail: 'le déplacement, dit depuis la page du rendez-vous', reference, quand: maintenant,
    },
  }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if (errReserve) { console.error('demande-submit: ligne du deplacement', errReserve.message); return 'échec'; }
  if (!Array.isArray(reservee) || reservee.length === 0) return 'deja';

  const LIENS = (Deno.env.get('WA_TEMPLATE_CONF_LIENS') ?? '').trim();
  const jeton = LIENS && SECRET_DES_LIENS ? await jetonDuRendezVous(SECRET_DES_LIENS, o.apptId).catch(() => '') : '';
  let statut = 'échec';
  let detail: string | undefined;
  let codeMeta: number | undefined;
  let waId = '';
  let avecLiens = false;
  let repliDuModele: number | undefined;
  try {
    for (const liens of jeton ? [true, false] : [false]) {
      const garde = new AbortController();
      const minuterie = setTimeout(() => garde.abort(), 8000);
      const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: o.numero, type: 'template',
          template: { name: liens ? LIENS : MODELE, language: { code: 'fr' }, components: composantsDeLaConfirmation({ avecLiens: liens, prenom: o.appel, quand, reference, jeton }) },
        }),
        signal: garde.signal,
      });
      clearTimeout(minuterie);
      const rep = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
      waId = String(rep?.messages?.[0]?.id ?? '');
      avecLiens = liens;
      if (r.ok) { statut = 'envoyé'; detail = waId ? undefined : 'accepté sans identifiant Meta'; codeMeta = undefined; break; }
      codeMeta = Number(rep?.error?.code) || undefined;
      detail = String(rep?.error?.message ?? `HTTP ${r.status}`);
      if (!liens || !refusDuModele(codeMeta)) break;
      repliDuModele = codeMeta;
    }
  } catch (e) {
    detail = String(e);
  }
  const modeleParti = avecLiens ? LIENS : MODELE;
  /* Le verdict s'écrit sur SA ligne, réservée plus haut : elle ne se réécrit qu'une fois. */
  await admin.from('envois').update({
    data: {
      id, ...(o.branchId ? { branchId: o.branchId } : {}), type: 'confirmation', canal: 'whatsapp', apptId: o.apptId,
      ...(o.clientId ? { clientId: o.clientId } : {}), prenom: o.appel, numero: `+${o.numero}`, dateRdv: o.date, heure: o.time,
      moment: quand, deplacement: { de: o.de, par: 'site' }, statut, ...(detail ? { detail: detail.slice(0, 300) } : {}),
      ...(codeMeta ? { codeMeta } : {}), ...(waId ? { waMessageId: waId } : {}), modele: modeleParti, reference,
      ...(repliDuModele ? { repliDuModele } : {}), quand: new Date().toISOString(),
    },
  }).eq('id', id).eq('data->>statut', 'en cours');
  if (waId) {
    const idFil = `wa-${waId}`;
    const { error } = await admin.from('messages_wa').upsert({
      id: idFil, branch_id: o.branchId || null,
      data: {
        id: idFil, waId, ...(o.branchId ? { branchId: o.branchId } : {}), sens: 'sortant', numero: o.numero, clientId: o.clientId,
        texte: texteDeLaConfirmation({ avecLiens, prenom: o.appel, quand, reference }),
        type: 'text', quand: new Date().toISOString(), etat: 'en-route', modele: modeleParti, parQui: 'Le Trône',
      },
    }, { onConflict: 'id' });
    if (error) console.error('demande-submit: fil du deplacement', error.message);
  }
  return statut;
}

/** { rdv: 'deplacer', v, date, time } : le rendez-vous change de place, AUSSITÔT. */
async function deplaceDepuisLeSite(ip: string, body: Record<string, unknown>): Promise<Response> {
  if (!(await allowRate(ip, 'rdv_deplacer', 10))) return json({ error: 'rate_limited' }, 429);
  const apptId = await apptIdDuJeton(SECRET_DES_LIENS, body.v);
  if (!apptId) return json({ ok: false, error: 'lien' });
  if (!(await allowRate(apptId, 'rdv_deplacer_jeton', 8))) return json({ error: 'rate_limited' }, 429);
  const date = texte(body.date, 10);
  const time = texte(body.time, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return json({ ok: false, error: 'creneau_invalide' });

  for (let essai = 0; essai < 3; essai += 1) {
    const ligne = await leRdvDuSite(apptId);
    if (!ligne) return json({ ok: false, error: 'introuvable' });
    const a = ligne.data;
    /* REJOUÉ APRÈS COUP : déjà à sa nouvelle place, par le site. Rien ne se
       réécrit et rien ne repart (la ligne du message est réservée). */
    if (a.date === date && a.time === time && a.deplacePar === 'site') {
      return json({ ok: true, verdict: 'deja', rdv: await rdvPourLaPage(apptId), confirmation: 'deja' });
    }
    const ms = Date.now();
    const permis = deplacementPermis(a, ms);
    if (permis !== 'permis') return json({ ok: false, error: refusDuDeplacement(permis) });
    /* DEUX FOIS AU PLUS (17 novembre 2026) ; le verrou le rejoue. */
    if (!peutEncoreSeDeplacer(a)) return json({ ok: false, error: 'trop_de_deplacements' });
    const avant = { date: String(a.date), time: String(a.time) };
    /* La forme, la fenêtre et les 24 heures d'abord : un appel mal formé ne coûte rien à la base. */
    const recevable = laPlaceEstRecevable({ date, time }, ms) ?? arriveeRecevable({ date, time }, ms);
    if (recevable) return json({ ok: false, error: recevable });
    if (date === avant.date && time === avant.time) return json({ ok: false, error: 'meme_place' });
    const agenda = await lisLAgendaDuSite(ligne.branchId, date, date);
    if (!agenda) return json({ ok: false, error: 'agenda_illisible' });
    const { maitre, dureeMin } = enteteDuRdvDuSite(a, agenda);
    const place = laPlaceTientPourDeplacer(agenda, maitre, { date, time, dureeMin }, avant, ms);
    if (!place.ok) return json({ ok: false, error: place.erreur });
    /* L'HEURE EST UNE HEURE DE LA GRILLE, au déplacement comme à la pose
       (18 novembre 2026) : la page ne propose que la grille (08:30, puis
       l'heure) ; un appel direct à 10:07 est refusé, rien ne bouge. */
    const grille = ouvertureDuJour(date, agenda.semaine, agenda.exceptions);
    if (!heureSurLaGrille({ openMin: grille.openMin, closeMin: grille.closeMin, debutMin: minutesDeHhmm(time), premierMin: PREMIER_RENDEZ_VOUS_MIN })) {
      return json({ ok: false, error: 'creneau_hors_ouverture' });
    }

    /* LA REMISE D'UN JOUR NE SUIT PAS UN AUTRE JOUR (17 novembre 2026) : ce
       jour-là n'était pas proposé ; un appel direct est refusé, rien ne bouge. */
    if (!(await jugeDeLaRemise(a))(date)) return json({ ok: false, error: 'remise_perdue' });

    const le = new Date(ms).toISOString();
    /* SOUS LE VERROU DES PLACES (`deplace_si_libre`, 0223) : la base relit la
       ligne (inchangée depuis notre lecture, sinon on relit et on rejuge),
       rejoue la limite, 08:30, les places en ligne, le plafond et SON maître,
       puis écrit. Tant que la base ne porte pas la fonction, l'ancienne
       écriture sous condition sert (la mise en ligne passe le SQL d'abord). */
    const { data: sousVerrou, error: errVerrou } = await admin.rpc('deplace_si_libre', {
      p_id: apptId, p_date: date, p_time: time, p_vu: ligne.updatedAt, p_sans_remise: false,
    });
    const fonctionAbsente = !!errVerrou && /PGRST202|deplace_si_libre/.test(`${(errVerrou as { code?: string }).code ?? ''} ${errVerrou.message ?? ''}`);
    if (errVerrou && !fonctionAbsente) { console.error('demande-submit: deplacement refuse par la base', errVerrou.message); return json({ ok: false, error: 'panne' }, 500); }
    if (!fonctionAbsente) {
      const rendu = (sousVerrou ?? null) as { ok?: boolean; raison?: string } | null;
      /* La ligne a bougé entre la lecture et l'écriture : on relit et on rejuge. */
      if (rendu?.ok !== true && rendu?.raison === 'modifie') continue;
      if (rendu?.ok !== true) return json({ ok: false, error: rendu?.raison ?? 'panne' });
    } else {
      const { autreMomentDemandeLe: _marque, ...reste } = a;
      const apres = { ...reste, date, time, deplaceLe: le, deplacePar: 'site', deplaceDe: { date: avant.date, time: avant.time }, deplacements: deplacementsFaits(a) + 1 };
      const { data: ecrit, error: errEcrit } = await admin.from('appointments').update({ data: apres })
        .eq('id', apptId).eq('updated_at', ligne.updatedAt).select('id');
      if (errEcrit) { console.error('demande-submit: deplacement refuse par la base', errEcrit.message); return json({ ok: false, error: 'panne' }, 500); }
      if (!Array.isArray(ecrit) || ecrit.length === 0) continue;
    }

    /* ── Après l'écriture : le journal, le WhatsApp, l'équipe. Un échec ici ne défait rien : le rendez-vous est à sa place. ── */
    const gesteId = `geste-site-depl-${apptId}-${date.replace(/-/g, '')}${time.replace(':', '')}`;
    const { error: errJ } = await admin.from('journal_gestes').upsert({
      id: gesteId, branch_id: ligne.branchId || null,
      data: {
        id: gesteId, ...(ligne.branchId ? { branchId: ligne.branchId } : {}), quand: le, parNom: 'La cliente', porte: 'consultation',
        verbe: 'modifie', table: 'appointments', ecran: 'Page du rendez-vous (maisonmnd.com)', pieceId: apptId,
        piece: `Rendez-vous déplacé depuis le site, ${jourEnClair(date)} à ${heureLisible(time)}`,
        champs: [{ champ: 'Date', avant: avant.date, apres: date }, { champ: 'Heure', avant: avant.time, apres: time }],
      },
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (errJ) console.error('demande-submit: journal du deplacement', errJ.message);

    const { appel, numero } = await coordonneesPourLeDeplacement(a, apptId).catch(() => ({ appel: '', numero: '' }));
    /* « En attente » n'est pas dit confirmé : sa confirmation, à venir, portera la nouvelle date. */
    const envoi = a.status === 'confirmé' && !estEnAttente(a)
      ? confirmeLeDeplacement({ apptId, branchId: ligne.branchId, clientId: String(a.clientId ?? ''), appel, numero, date, time, de: { date: avant.date, time: avant.time } })
        .catch((e) => { console.error('demande-submit: confirmation du deplacement', String(e)); return 'échec'; })
      : Promise.resolve('plus-tard');
    const confirmation = await auPlus(envoi, 2500, 'en-cours');
    await auPlus(alerteLePersonnel(
      'Rendez-vous déplacé depuis le site',
      `${appel || 'Une cliente'}, du ${jourEnClair(avant.date)} à ${heureLisible(avant.time)} au ${jourEnClair(date)} à ${heureLisible(time)}`,
      '/trone/#/calendrier',
    ).catch(() => 0), 1500, 0);
    return json({ ok: true, verdict: 'deplace', rdv: await rdvPourLaPage(apptId), confirmation });
  }
  return json({ ok: false, error: 'modifie' });
}

/* ══ LA CLIENTE QUI REVIENT — 3 novembre 2026 ═════════════════════════════
   « Déjà venue à la Maison ? » sur le site : elle tape son numéro. La
   réponse est TOUJOURS la même, et tout de suite, connue ou pas : rien ne
   se lit en tapant le numéro d'une autre, pas même au temps de réponse.
   Si une fiche porte ce numéro, la réservation préparée part sur CE
   WhatsApp (modèle approuvé `reservation_preparee`), avec les gestes de son
   dernier rituel et un jeton d'identité de sept jours : le lien ouvre le
   formulaire déjà rempli. Une fois par jour et par fiche, au plus. */
function prepareLeRetour(body: Record<string, unknown>): Response {
  const telephone = telephoneNormalise(String(body.telephone ?? ''), String(body.dial ?? '+229'));
  if (!telephone) return json({ ok: false, error: 'telephone' });
  enTacheDeFond(envoieLeRetour(telephone).catch((e) => console.error('demande-submit: retour', String(e))));
  return json({ ok: true });
}

async function envoieLeRetour(telephone: string): Promise<void> {
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  if (!WA_TOKEN || !WA_PHONE_ID || !SECRET_DES_LIENS) return;
  const fiches = await fichesDuNumero(telephone);
  if (!fiches || fiches.length === 0) return;
  /* Le numéro PRINCIPAL d'une fiche d'abord (le parent avant l'enfant dont
     il est le second numéro) ; puis celle qui est venue le plus récemment. */
  const fin = huitDerniers(telephone);
  const principales = fiches.filter((f) => huitDerniers(f.phone ?? '') === fin);
  const candidates = (principales.length ? principales : fiches).slice(0, 4);
  const jour = aujourdhuiACotonou();
  let choisie: { id: string; rdvs: { date?: string; status?: string; serviceIds?: unknown }[]; derniere: string } | null = null;
  for (const f of candidates) {
    const { data } = await admin.from('appointments').select('data').eq('data->>clientId', f.id).limit(500);
    const rdvs = ((data ?? []) as { data: { date?: string; status?: string; serviceIds?: unknown } }[]).map((r) => r.data);
    const derniere = rdvs.filter((r) => r.status !== 'annulé' && (r.date ?? '') <= jour).map((r) => r.date ?? '').sort().pop() ?? '';
    if (!choisie || derniere > choisie.derniere) choisie = { id: f.id, rdvs, derniere };
  }
  if (!choisie || !/^[A-Za-z0-9_-]{1,80}$/.test(choisie.id)) return;
  const { data: ficheRow } = await admin.from('clients').select('id, branch_id, data').eq('id', choisie.id).maybeSingle();
  const fiche = (ficheRow?.data ?? null) as { name?: string; civilite?: string; auMasculin?: boolean; branchId?: string } | null;
  if (!fiche) return;

  /* UNE FOIS PAR JOUR : la ligne du journal se prend AVANT l'envoi ; deux
     demandes à la même seconde n'en écrivent qu'une, et une seule part. */
  const id = `retour-${choisie.id}-${jour.replace(/-/g, '')}`;
  const branchId = fiche.branchId ?? (ficheRow as { branch_id?: string } | null)?.branch_id ?? null;
  const { data: pris, error: errPris } = await admin.from('envois')
    .upsert({ id, branch_id: branchId, data: { id, branchId, type: 'retour', canal: 'whatsapp', clientId: choisie.id, statut: 'en-envoi', quand: new Date().toISOString() } }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (errPris || (pris ?? []).length === 0) return;

  const gestes = gestesDuDernierRituel(choisie.rdvs, jour);
  const { data: sv } = gestes.length ? await admin.from('services').select('id, data').in('id', gestes) : { data: [] };
  const nomDe = new Map(((sv ?? []) as { id: string; data?: { name?: string } }[]).map((s) => [s.id, String(s.data?.name ?? '').trim()]));
  const gestesDits = gestesDitsDuRetour(gestes.map((g) => nomDe.get(g) ?? ''));
  const valable = new Date(Date.parse(`${jour}T12:00:00Z`) + JOURS_DU_JETON_D_IDENTITE * 86_400_000).toISOString().slice(0, 10);
  const identite = await jetonDIdentite(SECRET_DES_LIENS, choisie.id, valable);
  const mot = jetonDuLienDuRetour(gestes, identite);
  const appel = appelDe(fiche, fiche.name);
  const tel = telephone.replace(/\D/g, '');
  const MODELE = (Deno.env.get('WA_TEMPLATE_RESA_PREPAREE') ?? '').trim() || 'reservation_preparee';

  let statut = 'échec';
  let detail: string | undefined;
  let codeMeta: number | undefined;
  let waId = '';
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: tel, type: 'template',
        template: {
          name: MODELE, language: { code: 'fr' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: appel }, { type: 'text', text: gestesDits }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: mot }] },
          ],
        },
      }),
    });
    const rep = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
    waId = String(rep?.messages?.[0]?.id ?? '');
    if (r.ok) { statut = 'envoyé'; if (!waId) detail = 'accepté sans identifiant Meta'; }
    else { codeMeta = Number(rep?.error?.code) || undefined; detail = String(rep?.error?.message ?? `HTTP ${r.status}`); }
  } catch (e) {
    detail = String(e);
  }
  const maintenant = new Date().toISOString();
  await admin.from('envois').update({
    data: {
      id, branchId, type: 'retour', canal: 'whatsapp', clientId: choisie.id, prenom: appel, numero: `+${tel}`, statut, modele: MODELE,
      ...(detail ? { detail: detail.slice(0, 300) } : {}), ...(codeMeta ? { codeMeta } : {}), ...(waId ? { waMessageId: waId } : {}),
      quand: maintenant,
    },
  }).eq('id', id);
  if (waId) {
    /* Le fil dit ce qu'elle a reçu, sans le jeton : le lien est le sien. */
    const idFil = `wa-${waId}`;
    const { error } = await admin.from('messages_wa').upsert({
      id: idFil, branch_id: branchId,
      data: {
        id: idFil, waId, branchId, sens: 'sortant', numero: `+${tel}`, clientId: choisie.id,
        texte: `Bonjour ${appel}, la Maison MND a préparé votre réservation : ${gestesDits}. Il ne vous reste qu'à choisir votre jour et votre heure. [Choisir mon heure, demandé depuis le site]`,
        type: 'text', quand: maintenant, etat: 'en-route', modele: MODELE, parQui: 'Le site',
      },
    }, { onConflict: 'id' });
    if (error) console.error('demande-submit: fil du retour', error.message);
  }
}

/** Le jeton d'identité rendu par la page : les coordonnées de SA fiche, pour
    remplir le formulaire. Faux, forgé ou passé : rien. */
async function litLaCliente(identite: unknown): Promise<Response> {
  const clientId = await clientIdDuJetonDIdentite(SECRET_DES_LIENS, identite, aujourdhuiACotonou());
  if (!clientId) return json({ ok: false, error: 'lien' });
  const { data: row, error } = await admin.from('clients').select('data').eq('id', clientId).maybeSingle();
  if (error) console.error('demande-submit: fiche du retour illisible', error.message);
  const f = (row?.data ?? null) as { name?: unknown; civilite?: unknown; auMasculin?: unknown; phone?: unknown; prixFixes?: unknown } | null;
  if (!f) return json({ ok: false, error: 'lien' });
  /* SES PRIX CONVENUS, DITS AVANT LA CONFIRMATION — 4 novembre 2026 (une
     seule remise) : la page, qui la reconnaît par son lien signé, retire la
     place limitée et écrit « Vos tarifs convenus s'appliquent. » Rien d'autre
     de sa fiche ne sort, et seulement quand c'est vrai (la règle de
     `comptePrixConvenus` : un montant de plus de zéro franc). */
  const convenus = !!f.prixFixes && typeof f.prixFixes === 'object'
    && Object.values(f.prixFixes as Record<string, unknown>).some((v) => typeof v === 'number' && v > 0);
  return json({ ok: true, cliente: coordonneesDeLaFiche(f), ...(convenus ? { prixConvenus: true } : {}) });
}

/* ══ LE MESSAGE VOCAL — 19 octobre 2026 ══════════════════════════════════
   La visiteuse s'enregistre sur la page Contact ou « Être rappelée » ; la
   voix arrive ici en multipart. Même porte que les demandes écrites : un
   seau de débit à elle, le numéro en E.164, la case cochée. La voix va dans
   le coffre privé `voix-du-site` (0135), la demande « Message vocal » dans
   Les demandes, le fil des Conversations le dit, l'accusé de rappel part
   (sa décision), l'équipe est prévenue. Rien de tout cela ne lit le son :
   on l'écoute au Trône. */
// ── DEBUT messageVocal
const RATE_MAX_VOCAL = 4;  // quatre messages par dix minutes et par adresse

async function messageVocal(req: Request, ip: string): Promise<Response> {
  if (!(await allowRate(ip, 'vocal', RATE_MAX_VOCAL))) return json({ error: 'rate_limited' }, 429);
  const longueur = Number(req.headers.get('content-length') ?? 0);
  if (longueur > OCTETS_MAX_DE_LA_VOIX + 64_000) return json({ error: 'too_large' }, 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: 'bad_request' }, 400); }
  const champ = (k: string): string => { const v = form.get(k); return typeof v === 'string' ? v : ''; };
  if (champ('consentement') !== 'oui') return json({ error: 'consentement' }, 400);
  const telephone = telephoneNormalise(champ('telephone'), champ('dial') || '+229');
  if (!telephone) return json({ error: 'telephone' }, 400);
  const voix = form.get('voix');
  if (!(voix instanceof Blob)) return json({ error: 'voix' }, 400);
  const format = formatDeLaVoix(voix.type);
  if (!format) return json({ error: 'format' }, 415);
  if (voix.size < OCTETS_MIN_DE_LA_VOIX) return json({ error: 'trop_court' }, 400);
  if (voix.size > OCTETS_MAX_DE_LA_VOIX) return json({ error: 'too_large' }, 413);
  const prenom = texte(champ('prenom'), 60);
  const nom = texte(champ('nom'), 60);
  const nomEntier = [prenom, nom].filter(Boolean).join(' ');
  const c = champ('civilite');
  const civilite = c === 'madame' || c === 'mademoiselle' || c === 'monsieur' ? c : '';
  const dureeS = dureeBornee(champ('duree'));

  /* Le même numéro, un message il y a moins de deux minutes : le même envoi
     touché deux fois. On rend le premier, la Maison n'a qu'une ligne. */
  const depuis = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: memes } = await admin.from('demandes').select('id')
    .eq('data->>telephone', telephone).eq('data->>profil', PROFIL_DU_VOCAL).gte('updated_at', depuis).limit(1);
  const meme = ((memes ?? []) as { id: string }[])[0];
  if (meme) return json({ ok: true, id: meme.id, deja: true });

  const id = `dem-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const branchId = (await brancheParDefaut(champ('branchId'))).id;
  const chemin = cheminDeLaVoix(branchId, id, format.ext);
  const octets = new Uint8Array(await voix.arrayBuffer());
  const { error: errVoix } = await admin.storage.from(COFFRE_DES_VOIX).upload(chemin, octets, { contentType: format.mime, upsert: false });
  if (errVoix) { console.error('demande-submit: voix', errVoix.message); return json({ error: 'voix_refusee' }, 500); }

  const page = texte(champ('page'), 120);
  const demande = {
    id, genre: 'prospect', createdAt: now, branchId, prenom,
    ...(civilite ? { civilite } : {}),
    ...(nom ? { nom } : {}),
    telephone, besoin: 'inconnu', profil: PROFIL_DU_VOCAL,
    voix: { chemin, mime: format.mime, octets: voix.size, dureeS },
    source: 'site',
    ...(page ? { page } : {}),
    consentementLe: now,
    statut: 'nouvelle',
  } as Record<string, unknown>;
  const { error } = await admin.from('demandes').insert({ id, genre: 'prospect', branch_id: branchId, data: demande });
  if (error) {
    /* Une voix sans demande ne se retrouverait jamais : elle repart. */
    await admin.storage.from(COFFRE_DES_VOIX).remove([chemin]).catch(() => undefined);
    return json({ error: 'insert_failed' }, 500);
  }

  /* Le fil des Conversations le dit, comme pour une demande écrite. */
  {
    const tel = telephone.replace(/\D/g, '');
    const idFil = `site-${id}`;
    const { error: errFil } = await admin.from('messages_wa').upsert({
      id: idFil,
      branch_id: branchId,
      data: {
        id: idFil, branchId, sens: 'entrant', canal: 'site', numero: tel, clientId: '',
        ...(nomEntier ? { nomProfil: nomEntier } : {}),
        texte: `Message vocal depuis le site (${dureeDite(dureeS)}) : à écouter dans Les demandes`,
        type: 'text', quand: now, demandeId: id,
      },
    }, { onConflict: 'id' });
    if (errFil) console.error('demande-submit: fil du vocal', errFil.message);
  }

  /* L'accusé d'une demande de rappel (sa décision), et l'équipe prévenue. */
  const accuse = await auPlus(envoieLAccuse({
    demandeId: id, branchId, prenom, telephone, ...(civilite ? { civilite } : {}),
    avecPlace: false, quand: 'votre message vocal',
  }).catch((e) => { console.error('demande-submit: accusé du vocal', String(e)); return 'échec'; }), 2500, 'en-cours');
  const sent = await auPlus(alerteLePersonnel(
    'Message vocal depuis le site',
    `${nomEntier || 'Une visiteuse'} · ${dureeDite(dureeS)}`,
    '/trone/#/demandes',
  ).catch(() => 0), 1500, 0);
  enTacheDeFond(effaceLesVieillesVoix(branchId));
  return json({ ok: true, id, sent, accuse });
}

/** LES VOIX DE PLUS DE 90 JOURS S'EFFACENT (sa décision) ; la demande reste
    et dit quand sa voix est partie. Le Trône fait la même chose quand la
    direction ouvre Les demandes. */
async function effaceLesVieillesVoix(branchId: string): Promise<void> {
  const limite = new Date(limiteDeGarde(Date.now())).toISOString();
  const { data: lignes } = await admin.from('demandes').select('id, data')
    .eq('branch_id', branchId).eq('data->>profil', PROFIL_DU_VOCAL).lt('data->>createdAt', limite).limit(50);
  const rangees = (lignes ?? []) as { id: string; data: Record<string, unknown> & { voix?: { chemin?: string; effaceeLe?: string } } }[];
  const vieilles = voixAEffacer(rangees.map((l) => ({ ...l.data, id: l.id })), Date.now());
  if (!vieilles.length) return;
  const { error } = await admin.storage.from(COFFRE_DES_VOIX).remove(vieilles.map((d) => d.voix!.chemin!));
  if (error) { console.error('demande-submit: voix à effacer', error.message); return; }
  const le = new Date().toISOString();
  for (const d of vieilles) {
    const ligne = rangees.find((l) => l.id === d.id);
    if (!ligne) continue;
    await admin.from('demandes').update({ data: { ...ligne.data, voix: { ...(ligne.data.voix ?? {}), effaceeLe: le } } }).eq('id', d.id);
  }
}

// ── FIN messageVocal

/* ══ LE RENDEZ-VOUS EN ATTENTE, AU SERVEUR — 17 novembre 2026 ═══════════
   La règle est entre les repères ⟨rendez-vous-en-attente⟩ ; ici, ce qui lit
   la base et parle à Meta.

   LA BASCULE. Le secret WA_TEMPLATE_ATTENTE nomme le modèle ; il ne suffit
   pas : le Trône doit l'avoir lu « APPROVED » chez Meta (`mnd_modeles_meta`,
   écrit par « Les modèles chez Meta »). Dans le doute (secret absent, modèle
   pas encore approuvé, lecture en panne), RIEN NE CHANGE : la place naît
   confirmée, comme depuis le 29 septembre 2026. Aucun rendez-vous ne se perd
   en attendant Meta.

   LES DEUX FORMES ENSEMBLE (18 novembre 2026) : la liste relue chez Meta et
   les notes de la direction vivent dans le même document ; une note ne
   remplace plus la liste, et la bascule lit l'une et l'autre (la plus
   récente dit vrai). Copie du bloc de src/shared/modeles-meta-pur.ts
   (scripts/terminer-copie-serveur.mjs, verifie-les-douze-lunes R8). */
/* ⟨modeles-meta⟩ */
/** L'état d'un modèle dans les mots de la Maison. « À déposer » : rien n'en est su. */
export type EtatDuModeleMeta = 'a-deposer' | 'depose' | 'approuve' | 'refuse';
export const ETATS_DU_MODELE: readonly EtatDuModeleMeta[] = ['a-deposer', 'depose', 'approuve', 'refuse'];
/** Une note de la direction, le jour où elle a lu l'état chez Meta. */
export type NoteDuModele = { etat: EtatDuModeleMeta; le?: string; parQui?: string };
/** Un modèle tel que Meta le rend à « Relire chez Meta ». `etat` : le statut de Meta, en capitales. */
export type ModeleLuChezMeta = { id?: string; nom: string; etat: string; categorie?: string; langue?: string; qualite?: string; motifDuRefus?: string };
/** Le document tel qu'il s'écrit désormais : la liste de Meta ET les notes. */
export type DocumentDesModelesMeta = {
  modeles?: ModeleLuChezMeta[]; lusLe?: string; version?: string;
  notes?: Record<string, NoteDuModele>; parQui?: string; le?: string;
};
/** Le document lu, quelle que soit sa forme. */
export type ModelesMetaLus = {
  liste: ModeleLuChezMeta[]; lusLe?: string; version?: string;
  notes: Record<string, NoteDuModele>; parQui?: string; le?: string;
};

const NOM_DE_MODELE_META = /^[a-z0-9_]{1,512}$/;
const estUnEtatNote = (x: unknown): x is EtatDuModeleMeta => typeof x === 'string' && (ETATS_DU_MODELE as readonly string[]).includes(x);

/** Des notes, lues sans confiance : un nom qui n'est pas un nom Meta, ou un état inconnu, tombent. */
function notesLues(brut: unknown): Record<string, NoteDuModele> {
  const out: Record<string, NoteDuModele> = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return out;
  for (const [nom, n] of Object.entries(brut as Record<string, unknown>)) {
    if (!NOM_DE_MODELE_META.test(nom) || !n || typeof n !== 'object') continue;
    const note = n as Record<string, unknown>;
    if (!estUnEtatNote(note.etat) || note.etat === 'a-deposer') continue;
    out[nom] = {
      etat: note.etat,
      ...(typeof note.le === 'string' ? { le: note.le } : {}),
      ...(typeof note.parQui === 'string' ? { parQui: note.parQui } : {}),
    };
  }
  return out;
}

/** La liste de Meta, lue sans confiance : chaque ligne garde ce qu'elle porte, son nom et son statut relus. */
function listeLue(brut: unknown): ModeleLuChezMeta[] {
  if (!Array.isArray(brut)) return [];
  const out: ModeleLuChezMeta[] = [];
  for (const m of brut) {
    if (!m || typeof m !== 'object') continue;
    const x = m as Record<string, unknown>;
    const nom = typeof x.nom === 'string' ? x.nom.trim() : '';
    if (nom) out.push({ ...(x as Partial<ModeleLuChezMeta>), nom, etat: String(x.etat ?? '').toUpperCase() });
  }
  return out;
}

/** LES TROIS FORMES, LUES ENSEMBLE : `modeles` en tableau (la liste de Meta),
    `notes` (les notes), et `modeles` en objet (le registre d'avant le 18
    novembre 2026, qui compte comme des notes). */
export function modelesMetaLus(brut: unknown): ModelesMetaLus {
  const r = brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
  return {
    liste: listeLue(r.modeles),
    ...(typeof r.lusLe === 'string' ? { lusLe: r.lusLe } : {}),
    ...(typeof r.version === 'string' ? { version: r.version } : {}),
    notes: { ...notesLues(r.modeles), ...notesLues(r.notes) },
    ...(typeof r.parQui === 'string' ? { parQui: r.parQui } : {}),
    ...(typeof r.le === 'string' ? { le: r.le } : {}),
  };
}

/** Le statut de Meta dit par la Maison. En pause, en revue, en appel : il ne
    part pas encore (ou plus), c'est « déposé ». */
export function etatDitParMeta(statut: string): EtatDuModeleMeta {
  const s = String(statut).toUpperCase();
  if (s === 'APPROVED') return 'approuve';
  if (s === 'REJECTED' || s === 'DISABLED' || s === 'DELETED' || s === 'PENDING_DELETION' || s === 'ARCHIVED') return 'refuse';
  return 'depose';
}

/** L'ÉTAT D'UN MODÈLE : ce que Meta a dit à la dernière relecture, ou ce que
    la direction a noté ; les deux connus, le plus récent dit vrai (une note
    sans date cède à la liste). Ni l'un ni l'autre : « à déposer ». Un nom
    rendu dans plusieurs langues est approuvé si l'une l'est. */
export function etatDuModeleMeta(lu: ModelesMetaLus, nom: string): EtatDuModeleMeta {
  const chezMeta = lu.liste.filter((m) => m.nom === nom).map((m) => etatDitParMeta(m.etat));
  const deMeta: EtatDuModeleMeta | null = chezMeta.length === 0 ? null
    : chezMeta.includes('approuve') ? 'approuve' : chezMeta.includes('depose') ? 'depose' : 'refuse';
  const note = lu.notes[nom];
  if (!deMeta) return note?.etat ?? 'a-deposer';
  if (!note) return deMeta;
  const noteLe = Date.parse(note.le ?? '');
  const luLe = Date.parse(lu.lusLe ?? '');
  return Number.isFinite(noteLe) && (!Number.isFinite(luLe) || noteLe > luLe) ? note.etat : deMeta;
}

/** Le modèle peut-il partir ? Le document brut, tel que la base le rend. */
export const estApprouveChezMeta = (brut: unknown, nom: string): boolean =>
  etatDuModeleMeta(modelesMetaLus(brut), nom) === 'approuve';

/** Chaque modèle connu (de la liste ou des notes) et son état ; « à déposer » n'y figure pas. */
export function etatsConnus(lu: ModelesMetaLus): Partial<Record<string, 'depose' | 'approuve' | 'refuse'>> {
  const out: Partial<Record<string, 'depose' | 'approuve' | 'refuse'>> = {};
  for (const nom of new Set([...lu.liste.map((m) => m.nom), ...Object.keys(lu.notes)])) {
    const e = etatDuModeleMeta(lu, nom);
    if (e !== 'a-deposer') out[nom] = e;
  }
  return out;
}

/** LA RELECTURE CHEZ META S'AJOUTE AU DOCUMENT : la liste neuve, les notes gardées. */
export function avecLaListe(brut: unknown, liste: readonly ModeleLuChezMeta[], lusLe: string, version: string): DocumentDesModelesMeta {
  const lu = modelesMetaLus(brut);
  return {
    modeles: [...liste], lusLe, version,
    notes: lu.notes,
    ...(lu.parQui ? { parQui: lu.parQui } : {}),
    ...(lu.le ? { le: lu.le } : {}),
  };
}

/** UNE NOTE S'AJOUTE AU DOCUMENT : la liste de Meta gardée, les autres notes
    aussi. « À déposer » retire la note de ce modèle, et rien d'autre. */
export function avecLaNote(brut: unknown, nom: string, etat: EtatDuModeleMeta, parQui: string, le: string): DocumentDesModelesMeta {
  const lu = modelesMetaLus(brut);
  const notes = { ...lu.notes };
  if (etat === 'a-deposer') delete notes[nom];
  else notes[nom] = { etat, le, parQui };
  return {
    ...(lu.liste.length > 0 ? { modeles: lu.liste } : {}),
    ...(lu.lusLe ? { lusLe: lu.lusLe } : {}),
    ...(lu.version ? { version: lu.version } : {}),
    notes, parQui, le,
  };
}
/* ⟨/modeles-meta⟩ */

async function modeleDeLAttenteOuvert(): Promise<string> {
  const nom = (Deno.env.get('WA_TEMPLATE_ATTENTE') ?? '').trim();
  if (!nom || !Deno.env.get('WA_TOKEN') || !Deno.env.get('WA_PHONE_ID')) return '';
  const { data, error } = await admin.from('documents').select('data').eq('key', 'mnd_modeles_meta').maybeSingle();
  if (error) { console.error('demande-submit: modeles illisibles, la place nait confirmee', error.message); return ''; }
  return estApprouveChezMeta(data?.data, nom) ? nom : '';
}

/** Ce numéro a-t-il encore droit à un modèle du site aujourd'hui ? Compté par
    sa clé, sous verrou (`debit_permis`). */
const modelePermisAuNumero = (telephone: string): Promise<boolean> =>
  allowRate(cleDuNumero(telephone), 'modeles_du_site', MODELES_PAR_NUMERO_ET_PAR_JOUR, 24 * 60);

/** Le site de la Maison, sans nom de domaine de plus : celui des liens du
    rendez-vous (⟨lien-du-rdv⟩). */
const SITE_DE_LA_MAISON = URL_DU_RDV.replace(/rdv\/\?v=$/, '');
const LIEN_POUR_RESERVER = `${SITE_DE_LA_MAISON}reserver/`;
/** « 12 000 F », en espaces simples : WhatsApp casse les insécables. */
const francsDits = (xof: number): string => `${Math.round(xof).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} F`;

/** LA PLACE TENUE SE DIT SUR WHATSAPP : le modèle de l'attente et ses deux
    boutons (« Je confirme », « Un autre moment »). Sa ligne au journal est
    `att-<rdv>-whatsapp`, du genre « proposition » que le Trône sait déjà
    lire ; `conf-<rdv>-whatsapp` reste libre pour la confirmation, qui ne se
    dit qu'après son oui. Rend : envoyé, refus-du-modele (Meta ne connaît pas
    ou refuse le modèle : la place se confirmera comme avant), échec, plafond,
    sans-numero. */
async function envoieLAttente(o: {
  apptId: string; demandeId: string; branchId: string; modele: string; prenom: string; civilite?: string; telephone: string;
  quand: string; gestes: string; date: string; time: string;
}): Promise<string> {
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  if (!WA_TOKEN || !WA_PHONE_ID) return 'refus-du-modele';
  const tel = o.telephone.replace(/\D/g, '');
  if (!tel) return 'sans-numero';
  if (!(await modelePermisAuNumero(o.telephone))) return 'plafond';
  const appel = appelDe(o.civilite ? { civilite: o.civilite } : null, o.prenom);
  const gestes = o.gestes || 'votre rituel';
  let statut = 'échec';
  let detail: string | undefined;
  let codeMeta: number | undefined;
  let waId = '';
  try {
    const garde = new AbortController();
    const minuterie = setTimeout(() => garde.abort(), 8000);
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: tel, type: 'template',
        template: { name: o.modele, language: { code: 'fr' }, components: composantsDeLAttente({ appel, quand: o.quand, gestes, apptId: o.apptId }) },
      }),
      signal: garde.signal,
    });
    clearTimeout(minuterie);
    const rep = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
    waId = String(rep?.messages?.[0]?.id ?? '');
    if (r.ok) {
      statut = 'envoyé';
      detail = waId ? undefined : 'accepté sans identifiant Meta';
    } else {
      codeMeta = Number(rep?.error?.code) || undefined;
      detail = String(rep?.error?.message ?? `HTTP ${r.status}`);
    }
  } catch (e) {
    detail = String(e);
  }
  const id = `att-${o.apptId}-whatsapp`;
  const maintenant = new Date().toISOString();
  await admin.from('envois').upsert({
    id, branch_id: o.branchId,
    data: {
      id, branchId: o.branchId, type: 'proposition', canal: 'whatsapp', apptId: o.apptId, demandeId: o.demandeId,
      prenom: appel, numero: `+${tel}`, dateRdv: o.date, heure: o.time, moment: o.quand, statut,
      ...(detail ? { detail: detail.slice(0, 300) } : {}),
      ...(codeMeta ? { codeMeta } : {}),
      ...(waId ? { waMessageId: waId } : {}),
      modele: o.modele, reference: referenceDuRendezVous(o.apptId), attente: true, quand: maintenant,
    },
  }, { onConflict: 'id' });
  if (waId) {
    const idFil = `wa-${waId}`;
    const { error } = await admin.from('messages_wa').upsert({
      id: idFil, branch_id: o.branchId,
      data: {
        id: idFil, waId, branchId: o.branchId, sens: 'sortant', numero: tel, clientId: '',
        texte: texteDeLAttente({ appel, quand: o.quand, gestes }),
        type: 'text', quand: maintenant, etat: 'en-route', modele: o.modele, parQui: 'Le Trône',
      },
    }, { onConflict: 'id' });
    if (error) console.error('demande-submit: fil de l attente', error.message);
  }
  return statut !== 'envoyé' && refusDuModele(codeMeta) ? 'refus-du-modele' : statut;
}

/** LE MESSAGE DE L'ATTENTE NE PART PAS, OU N'ARRIVE PAS : la place se
    confirme dans la seconde, comme avant le 17 novembre 2026 (ses marques
    d'attente tombent, l'acompte demandé avec elles : le comptoir fait comme il
    a toujours fait). Meta refuse le modèle, l'envoi échoue, le plafond des
    modèles est atteint, ou Meta dit plus tard le message non remis (un numéro
    hors de WhatsApp) : elle ne peut pas répondre « Je confirme », et sa place
    ne se perd pas pour un message (18 novembre 2026). Seule une place qui
    attend encore son oui se confirme ici : un oui déjà donné, une place rendue
    ou libérée ne bougent pas. Écrite sous condition (`updated_at`), trois
    essais au plus. Vrai : la place est confirmée par cet appel. */
async function confirmeSansAttente(apptId: string): Promise<boolean> {
  for (let essai = 0; essai < 3; essai += 1) {
    const ligne = await leRdvDuSite(apptId).catch(() => null);
    if (!ligne || etatDeLAttente(ligne.data) !== 'sans-reponse') return false;
    const { suggereLe: _pose, attenduJusquAu: _echeance, depositXof: _acompte, ...reste } = ligne.data;
    const { data: ecrit, error } = await admin.from('appointments').update({ data: reste })
      .eq('id', apptId).eq('updated_at', ligne.updatedAt).select('id');
    if (error) { console.error('demande-submit: la place n a pas pu se confirmer sans attente', error.message); return false; }
    if (Array.isArray(ecrit) && ecrit.length > 0) return true;
  }
  return false;
}

/** L'ENVOI DE L'ATTENTE EST-IL PARTI ? `envoyé` : elle peut répondre.
    `en-cours` : on ne le sait pas encore (la suite le dira). Tout le reste
    (refus du modèle, échec, plafond, sans numéro) : rien n'est parti. */
const attenteNonPartie = (partie: string): boolean => partie !== 'envoyé' && partie !== 'en-cours';

/** La place confirmée sans attente reçoit l'ancienne confirmation, comme
    avant ce jour : de sa demande, son prénom, sa civilité et son numéro. */
async function confirmeCommeAvant(apptId: string): Promise<string> {
  const ligne = await leRdvDuSite(apptId).catch(() => null);
  if (!ligne) return 'échec';
  const { data: dems } = await admin.from('demandes').select('id, data').eq('data->>apptId', apptId).limit(1);
  const dem = ((dems ?? []) as { id: string; data?: { prenom?: unknown; telephone?: unknown; civilite?: unknown } }[])[0];
  const telephone = String(dem?.data?.telephone ?? '');
  if (!dem || !telephone) return 'sans-numero';
  const civilite = String(dem.data?.civilite ?? '');
  const date = String(ligne.data.date ?? '');
  const time = String(ligne.data.time ?? '');
  return envoieLAccuse({
    apptId, demandeId: dem.id, branchId: ligne.branchId, prenom: String(dem.data?.prenom ?? ''), telephone,
    ...(civilite ? { civilite } : {}), avecPlace: true, quand: `${jourEnClair(date)} à ${heureLisible(time)}`, date, time,
  }).catch((e) => { console.error('demande-submit: accusé', String(e)); return 'échec'; });
}

/** { attente: 'non-remis', rdv } : META DIT LE MESSAGE DE L'ATTENTE NON REMIS
    (le webhook, la clé service seule). La place qui attend encore son oui se
    confirme sans attente, l'ancienne confirmation part, et le comptoir le
    sait : elle n'a rien reçu. `pris: false` : rien à faire (pas une place en
    attente, ou elle a déjà répondu). */
async function attenteNonRemise(req: Request, body: Record<string, unknown>): Promise<Response> {
  if (!appelDuServeur(req)) return json({ error: 'reserve' }, 401);
  const apptId = typeof body.rdv === 'string' && /^rdv-[A-Za-z0-9_-]{6,80}$/.test(body.rdv) ? body.rdv : '';
  if (!apptId || !(await confirmeSansAttente(apptId))) return json({ pris: false });
  const accuse = await confirmeCommeAvant(apptId);
  const ligne = await leRdvDuSite(apptId).catch(() => null);
  const quand = ligne ? `${jourEnClair(String(ligne.data.date))} à ${heureLisible(String(ligne.data.time))}` : '';
  await auPlus(alerteLePersonnel('Réservé depuis le site', `${String(ligne?.data?.clientName ?? '') || 'Une visiteuse'}${quand ? ` · ${quand}` : ''} · son WhatsApp n’a pas reçu le message : la place est confirmée, appelez-la`, '/trone/#/calendrier').catch(() => 0), 1500, 0);
  return json({ pris: true, etat: 'confirme', accuse });
}

/** UNE PHRASE SUR WHATSAPP, dans la fenêtre qu'elle vient d'ouvrir en
    répondant (un bouton touché, un mot écrit) : aucun modèle, rien de payant.
    Elle s'écrit au fil des Conversations comme tout ce que la Maison dit. */
async function ditSurWhatsApp(o: { numero: string; texte: string; branchId: string; clientId?: string; auto: string }): Promise<{ statut: string; waId: string }> {
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  if (!WA_TOKEN || !WA_PHONE_ID || !o.numero) return { statut: 'sans-cles', waId: '' };
  let statut = 'échec';
  let waId = '';
  let detail: string | undefined;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: o.numero, type: 'text', text: { body: o.texte } }),
      signal: AbortSignal.timeout(8000),
    });
    const rep = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { message?: string } };
    waId = String(rep?.messages?.[0]?.id ?? '');
    if (r.ok) statut = 'envoyé'; else detail = String(rep?.error?.message ?? `HTTP ${r.status}`);
  } catch (e) {
    detail = String(e);
  }
  const maintenant = new Date().toISOString();
  const idFil = waId ? `wa-${waId}` : `wa-attente-${crypto.randomUUID()}`;
  const { error } = await admin.from('messages_wa').upsert({
    id: idFil, branch_id: o.branchId || null,
    data: {
      id: idFil, ...(waId ? { waId } : {}), ...(o.branchId ? { branchId: o.branchId } : {}), sens: 'sortant', numero: o.numero,
      clientId: o.clientId ?? '', texte: o.texte, type: 'text', quand: maintenant,
      etat: statut === 'envoyé' ? 'en-route' : 'echec', ...(detail ? { detail: detail.slice(0, 300) } : {}),
      parQui: 'Le Trône', auto: o.auto,
    },
  }, { onConflict: 'id' });
  if (error) console.error('demande-submit: fil de la reponse', error.message);
  return { statut, waId };
}

/* LA PORTE DE LA CLÉ (18 novembre 2026, avec la session qui la pose dans
   seize fonctions) : RECOPIÉ de src/shared/cle-du-cron-pur.ts entre ses
   repères (scripts/terminer-copie-serveur.mjs, verifie-la-cle-du-cron). */
/* ⟨cle-du-cron⟩ */
/** Deux clés sont-elles la même ? À TEMPS CONSTANT : `===` s'arrête au
    premier caractère qui diffère, et ce temps-là se mesure de l'extérieur,
    caractère après caractère. Une clé vide ne vaut jamais : un secret qui
    n'est pas posé n'ouvre rien. */
const memeCle = (a: string, b: string): boolean => {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0 && x.length > 0;
};

/** Une clé refusée se dit AU JOURNAL de la fonction, en longueurs seules
    (sb_secret ≈ 40 à 50 signes · legacy eyJ… ≈ 200 et plus · 0 = rien de
    posé de ce côté-là) : elles suffisent à situer la panne. Jamais dans la
    réponse : celui qui frappe sans la clé n'a pas à les lire. */
const noteLeRefus = (porte: string, attendue: string, recue: string): void => {
  console.error(`${porte} : clé refusée`, { attendueLg: attendue.length, recueLg: recue.length });
};
/* ⟨/cle-du-cron⟩ */

/** L'appel vient-il d'une fonction de la Maison ? La clé service, rien d'autre,
    comparée à temps constant (`memeCle`) ; un refus se note au journal, en
    longueurs seules (`noteLeRefus`). */
const appelDuServeur = (req: Request): boolean => {
  const cle = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!cle) return false;
  const attendues = [Deno.env.get('CLE_SERVICE'), Deno.env.get('SERVICE_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .map((k) => (k ?? '').trim()).filter((k) => k !== '');
  if (attendues.some((k) => memeCle(cle, k))) return true;
  noteLeRefus('demande-submit', attendues[0] ?? '', cle);
  return false;
};

/** SES PLACES EN ATTENTE, quand elle écrit « Je confirme » au lieu de toucher
    le bouton : la référence qu'elle cite (cette place-là, seule) ; sinon
    TOUTES les places qu'elle tient sans les avoir confirmées (18 novembre
    2026 : une mère tient trois places, elle et ses deux enfants, et écrit
    « Je confirme » ; avant ce jour, personne ne devinait laquelle et les
    trois se libéraient) ; sinon la seule qui s'est libérée depuis moins d'un
    jour (pour le lui dire). Aucune : le webhook garde la main. */
async function sesAttentes(cle: string, texteRecu: string): Promise<RdvDuSite[]> {
  const { data, error } = await admin.from('appointments').select('id, branch_id, data, updated_at')
    .eq('data->>cleDuNumero', cle).order('updated_at', { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  const lignes: RdvDuSite[] = ((data ?? []) as { id: string; branch_id?: string; updated_at?: string; data?: any }[])
    .filter((r) => !!r.data && etatDeLAttente(r.data) !== null)
    .map((r) => ({ id: String(r.id), branchId: String(r.branch_id ?? r.data?.branchId ?? ''), updatedAt: String(r.updated_at ?? ''), data: r.data }));
  const reference = /MND-[A-Z2-9]{4}/.exec(texteRecu.toUpperCase())?.[0];
  if (reference) {
    const citee = lignes.find((x) => referenceDuRendezVous(x.id) === reference);
    if (citee) return [citee];
  }
  const tenues = lignes.filter((x) => etatDeLAttente(x.data) === 'sans-reponse')
    .sort((x, y) => `${x.data.date} ${x.data.time}`.localeCompare(`${y.data.date} ${y.data.time}`));
  if (tenues.length > 0) return tenues;
  const hier = Date.now() - 86_400_000;
  const liberees = lignes.filter((x) => etatDeLAttente(x.data) === 'liberee' && Date.parse(String(x.data.placeLibereeLe)) > hier);
  return liberees.length === 1 ? [liberees[0]] : [];
}

/** LA CONFIRMATION EST DITE : sa ligne `conf-<rdv>-whatsapp` l'inscrit, le
    balayage de confirmation-rdv ne la redira pas. Un échec s'écrit « échec »,
    qu'il retente avec le modèle quand la fiche est rattachée, comme les siens. */
async function inscritLaConfirmation(ligne: RdvDuSite, o: { numero: string; appel: string; quand: string; statut: string; waId: string }): Promise<void> {
  const a = ligne.data;
  const apptId = ligne.id;
  const idConf = `conf-${apptId}-whatsapp`;
  await admin.from('envois').upsert({
    id: idConf, branch_id: ligne.branchId || null,
    data: {
      id: idConf, ...(ligne.branchId ? { branchId: ligne.branchId } : {}), type: 'confirmation', canal: 'whatsapp', apptId,
      ...(a.clientId ? { clientId: String(a.clientId) } : {}), prenom: o.appel, numero: `+${o.numero}`, dateRdv: String(a.date), heure: String(a.time),
      moment: o.quand, statut: o.statut === 'envoyé' ? 'envoyé' : 'échec',
      detail: 'la confirmation, dite après son « Je confirme »', ...(o.waId ? { waMessageId: o.waId } : {}),
      reference: referenceDuRendezVous(apptId), quand: new Date().toISOString(),
    },
  }, { onConflict: 'id' });
}

/** « JE CONFIRME », ÉCRIT, POUR PLUSIEURS PLACES (18 novembre 2026) : chacune
    de celles qui attendaient son oui le reçoit, sous condition (`updated_at`),
    trois essais au plus ; une place qui a bougé entre-temps (rendue, libérée,
    confirmée par son bouton) reste comme elle est. UNE phrase les dit toutes :
    combien, et lesquelles. Le bouton touché, lui, reste lié à SA place. */
async function confirmeSesPlaces(numero: string, places: RdvDuSite[]): Promise<Response> {
  const ms = Date.now();
  const ditesOui: { ligne: RdvDuSite; apres: Record<string, unknown> }[] = [];
  for (const place of places) {
    let ligne: RdvDuSite | null = place;
    for (let essai = 0; essai < 3 && ligne; essai += 1) {
      const a = ligne.data;
      if (etatDeLAttente(a) !== 'sans-reponse') break;
      const { autreMomentDemandeLe: _autre, ...sansAutre } = a;
      const apres = { ...sansAutre, ...marquesDuOui(a, ms) };
      const { data: ecrit, error: errEcrit } = await admin.from('appointments').update({ data: apres })
        .eq('id', ligne.id).eq('updated_at', ligne.updatedAt).select('id');
      if (errEcrit) { console.error('demande-submit: oui non ecrit', errEcrit.message); break; }
      if (Array.isArray(ecrit) && ecrit.length > 0) { ditesOui.push({ ligne, apres }); break; }
      ligne = await leRdvDuSite(ligne.id).catch(() => null);
    }
  }
  if (ditesOui.length === 0) return json({ pris: false, error: 'modifie' });

  const premiere = ditesOui[0].ligne;
  const { appel } = await coordonneesPourLeDeplacement(premiere.data, premiere.id).catch(() => ({ appel: '', numero: '' }));
  const lues = await Promise.all(ditesOui.map(async ({ ligne, apres }) => {
    const jeton = SECRET_DES_LIENS ? await jetonDuRendezVous(SECRET_DES_LIENS, ligne.id).catch(() => '') : '';
    return {
      ligne, apres, ferme: estFerme(apres),
      quand: `${jourEnClair(String(apres.date))} à ${heureLisible(String(apres.time))}`,
      lien: jeton ? `${URL_DU_RDV}${jeton}` : '',
    };
  }));
  const toutes = lues.every((p) => p.ferme);
  const texteDit = lues.length === 1
    ? (lues[0].ferme
      ? texteDuOui({ appel, quand: lues[0].quand, reference: referenceDuRendezVous(lues[0].ligne.id), lien: lues[0].lien })
      : texteDeLAcompte({ appel, quand: lues[0].quand, acompte: francsDits(acompteAttendu(lues[0].apres)), jusqua: heureDeCotonouDite(lues[0].apres.attenduJusquAu), lien: lues[0].lien }))
    : texteDesOuis({
      appel,
      places: lues.map((p) => ({
        quand: p.quand, reference: referenceDuRendezVous(p.ligne.id), lien: p.lien,
        ...(p.ferme ? {} : { acompte: francsDits(acompteAttendu(p.apres)), jusqua: heureDeCotonouDite(p.apres.attenduJusquAu) }),
      })),
    });
  const dit = await ditSurWhatsApp({
    numero, texte: texteDit, branchId: premiere.branchId, clientId: String(premiere.data.clientId ?? ''), auto: toutes ? 'attente-ok' : 'attente-acompte',
  });
  for (const p of lues) {
    if (!p.ferme) continue;
    await inscritLaConfirmation(p.ligne, { numero, appel, quand: p.quand, statut: dit.statut, waId: dit.waId });
    enTacheDeFond(previensLaMarraineDuRdv(p.ligne.id, p.ligne.branchId).catch((e) => console.error('demande-submit: marraine', String(e))));
  }
  await auPlus(alerteLePersonnel(
    toutes ? 'Confirmé par la cliente' : 'Elle a dit oui, acompte attendu',
    `${appel || 'Une cliente'} · ${lues.map((p) => p.quand).join(', ')} · ${lues.length > 1 ? `${lues.length} rendez-vous réservés` : 'réservé'} depuis le site`,
    '/trone/#/calendrier',
  ).catch(() => 0), 1500, 0);
  return json({ pris: true, etat: toutes ? 'ferme' : 'acompte', places: lues.length });
}

/** La marraine d'une amie n'est prévenue que d'une place FERME : au oui de
    son amie, plus à la pose. */
async function previensLaMarraineDuRdv(apptId: string, branchId: string): Promise<void> {
  const { data } = await admin.from('demandes').select('id, data').eq('data->>apptId', apptId).limit(1);
  const dem = ((data ?? []) as { id: string; data?: { parrainDe?: string; codeRaison?: string; prenom?: string } }[])[0];
  if (!dem?.data?.parrainDe || dem.data.codeRaison !== 'parrainage') return;
  const marraine = await marraineDuCode(String(dem.data.parrainDe));
  if (!marraine?.telephone) return;
  await previensLaMarraine({
    demandeId: dem.id, branchId, prenomMarraine: marraine.prenom, prenomAmie: prenomDevine(dem.data.prenom),
    telephone: marraine.telephone, clientId: marraine.clientId,
  });
}

/** { attente: 'reponse', rdv?, geste, numero, texte? } : CE QUE SA RÉPONSE FAIT.
    Le webhook rend ici le bouton touché sous le message de la place tenue
    (REPRISE_OK, REPRISE_AUTRE, avec le rendez-vous), ou un « Je confirme »
    écrit (sans rendez-vous : on cherche les siens, et toutes les places qui
    attendent son oui se confirment, `confirmeSesPlaces`). La clé service seule.
    `pris: false` : ce n'est pas une place en attente, le webhook garde la main.

    SEUL SON NUMÉRO RÉPOND : celui qui a pris la place, comparé par sa clé.
      · « Je confirme », sans acompte : le rendez-vous est ferme. Elle reçoit
        sa référence et le lien de son rendez-vous ; la ligne
        `conf-<rdv>-whatsapp` l'inscrit, le balayage ne le redit pas ;
      · « Je confirme », avec un acompte : son oui est noté, l'échéance recule
        à trente minutes au moins, elle reçoit le lien où le régler ;
      · « Un autre moment » : la place est rendue tout de suite, elle reçoit
        le lien pour en choisir une autre ;
      · après l'échéance : on lui dit que la place s'est libérée, et où en
        reprendre une.
    L'écriture se fait sous condition (`updated_at`), trois essais au plus. */
async function reponseALAttente(req: Request, body: Record<string, unknown>): Promise<Response> {
  if (!appelDuServeur(req)) return json({ error: 'reserve' }, 401);
  const numero = String(body.numero ?? '').replace(/\D/g, '');
  const cle = cleDuNumero(numero);
  if (!cle) return json({ pris: false });
  const geste = body.geste === 'autre' ? 'autre' : 'ok';
  /* Le bouton touché porte SA place ; « Je confirme » écrit les cherche toutes. */
  let rdvId = typeof body.rdv === 'string' ? body.rdv : '';
  if (!rdvId) {
    const siennes = await sesAttentes(cle, String(body.texte ?? ''));
    if (siennes.length === 0) return json({ pris: false });
    if (siennes.length > 1) return geste === 'ok' ? await confirmeSesPlaces(numero, siennes) : json({ pris: false });
    rdvId = siennes[0].id;
  }
  for (let essai = 0; essai < 3; essai += 1) {
    const ligne = await leRdvDuSite(rdvId);
    if (!ligne) return json({ pris: false });
    const a = ligne.data;
    /* Pas née en attente (une vraie suggestion de la Maison) : le webhook fait comme avant. */
    if (typeof a.attenduJusquAu !== 'string' || !a.attenduJusquAu.trim()) return json({ pris: false });
    if (String(a.cleDuNumero ?? '') !== cle) return json({ pris: true, etat: 'numero-etranger' });
    const apptId = ligne.id;
    const etat = etatDeLAttente(a);
    const quand = `${jourEnClair(String(a.date))} à ${heureLisible(String(a.time))}`;
    const { appel } = await coordonneesPourLeDeplacement(a, apptId).catch(() => ({ appel: '', numero: '' }));
    const dis = (texteDit: string, auto: string) =>
      ditSurWhatsApp({ numero, texte: texteDit, branchId: ligne.branchId, clientId: String(a.clientId ?? ''), auto });
    if (etat === null) return json({ pris: true, etat: 'clos' });
    if (etat === 'liberee') {
      await dis(geste === 'ok'
        ? texteDeLaPlaceLiberee({ appel, quand, lien: LIEN_POUR_RESERVER })
        : texteDeLAutreMoment({ appel, lien: LIEN_POUR_RESERVER }), 'attente-liberee');
      return json({ pris: true, etat });
    }
    const jeton = SECRET_DES_LIENS ? await jetonDuRendezVous(SECRET_DES_LIENS, apptId).catch(() => '') : '';
    const lienDuRdv = jeton ? `${URL_DU_RDV}${jeton}` : '';
    if (etat === 'ferme') {
      /* Déjà ferme : un second « Je confirme » ne dit rien de plus ; « Un autre
         moment » la mène à son rendez-vous, où il se déplace. */
      if (geste === 'autre') {
        await dis(`Votre rendez-vous du ${quand} est confirmé, ${appel}.${lienDuRdv ? ` Pour le déplacer : ${lienDuRdv}` : ' Écrivez-nous le jour qui vous va.'}`, 'attente-autre');
      }
      return json({ pris: true, etat });
    }

    if (etat === 'acompte' && geste === 'ok') {
      /* Son oui est déjà noté : un second « Je confirme » redit l'acompte et
         son lien, sans rien réécrire (l'échéance ne recule qu'une fois). */
      await dis(texteDeLAcompte({
        appel, quand, acompte: francsDits(acompteAttendu(a)), jusqua: heureDeCotonouDite(a.attenduJusquAu), lien: lienDuRdv,
      }), 'attente-acompte');
      return json({ pris: true, etat: 'acompte' });
    }
    const ms = Date.now();
    if (geste === 'autre') {
      const apres = {
        ...a, ...marquesDeLaLiberation(ms), annuleePar: 'cliente', autreMomentDemandeLe: new Date(ms).toISOString(),
        note: [a.note, 'Place rendue : elle a demandé un autre moment'].filter(Boolean).join(' · '),
      };
      const { data: ecrit, error: errEcrit } = await admin.from('appointments').update({ data: apres })
        .eq('id', apptId).eq('updated_at', ligne.updatedAt).select('id');
      if (errEcrit) { console.error('demande-submit: place non rendue', errEcrit.message); return json({ pris: false, error: 'panne' }, 500); }
      if (!Array.isArray(ecrit) || ecrit.length === 0) continue;
      /* Le code d'une offre qu'elle portait ne compte pas pour une fois. */
      const { data: dems } = await admin.from('demandes').select('id, data').eq('data->>apptId', apptId).limit(1);
      const dem = ((dems ?? []) as { id: string; data?: Record<string, unknown> }[])[0];
      if (dem?.data?.codeApplique) {
        const { codeApplique: _usage, ...sansUsage } = dem.data;
        await admin.from('demandes').update({ data: sansUsage }).eq('id', dem.id);
      }
      await dis(texteDeLAutreMoment({ appel, lien: LIEN_POUR_RESERVER }), 'attente-autre');
      await auPlus(alerteLePersonnel('Place rendue sur WhatsApp', `${appel || 'Une cliente'} · ${quand} · elle choisit un autre moment`, '/trone/#/calendrier').catch(() => 0), 1500, 0);
      return json({ pris: true, etat: 'liberee' });
    }

    const { autreMomentDemandeLe: _autre, ...sansAutre } = a;
    const apres = { ...sansAutre, ...marquesDuOui(a, ms) };
    const { data: ecrit, error: errEcrit } = await admin.from('appointments').update({ data: apres })
      .eq('id', apptId).eq('updated_at', ligne.updatedAt).select('id');
    if (errEcrit) { console.error('demande-submit: oui non ecrit', errEcrit.message); return json({ pris: false, error: 'panne' }, 500); }
    if (!Array.isArray(ecrit) || ecrit.length === 0) continue;

    if (!estFerme(apres)) {
      await dis(texteDeLAcompte({
        appel, quand, acompte: francsDits(acompteAttendu(apres)), jusqua: heureDeCotonouDite(apres.attenduJusquAu), lien: lienDuRdv,
      }), 'attente-acompte');
      await auPlus(alerteLePersonnel('Elle a dit oui, acompte attendu', `${appel || 'Une cliente'} · ${quand} · acompte de ${francsDits(acompteAttendu(apres))}, réglable sur la page de son rendez-vous`, '/trone/#/calendrier').catch(() => 0), 1500, 0);
      return json({ pris: true, etat: 'acompte' });
    }
    const reference = referenceDuRendezVous(apptId);
    const dit = await dis(texteDuOui({ appel, quand, reference, lien: lienDuRdv }), 'attente-ok');
    await inscritLaConfirmation(ligne, { numero, appel, quand, statut: dit.statut, waId: dit.waId });
    enTacheDeFond(previensLaMarraineDuRdv(apptId, ligne.branchId).catch((e) => console.error('demande-submit: marraine', String(e))));
    await auPlus(alerteLePersonnel('Confirmé par la cliente', `${appel || 'Une cliente'} · ${quand} · réservé depuis le site`, '/trone/#/calendrier').catch(() => 0), 1500, 0);
    return json({ pris: true, etat: 'ferme' });
  }
  return json({ pris: false, error: 'modifie' });
}

/* ══ MA COURONNE PASSE PAR LE SERVEUR — 17 novembre 2026 ════════════════
   `{ couronne: 'reserver', data }`, avec la session de la cliente. Ma Couronne
   ne pose plus son rendez-vous elle-même. Elle n'envoie plus que ce qu'elle VEUT (la tête, les
   gestes, les séances, le maître souhaité) ; ICI se décident :
     · LA TÊTE : la sienne (son compte, ou la fiche adoptée qui le porte), ou
       un mineur de sa famille dont elle est le parent payeur (la règle
       d'`est_ma_tete`, 0076) ;
     · LA DURÉE : celle du catalogue, à la longueur et au calibre de SA fiche
       (`gestesAuCalibre`). Ce que l'écran a compté ne l'allonge que jusqu'au
       double, jamais ne la raccourcit ;
     · LA PLACE : le jour ouvert, l'heure sur la grille, le maître libre, sur
       l'agenda du serveur ; puis la pose SOUS VERROU (`pose_si_libre`), comme
       le site. Une série se pose entière, ou pas du tout ;
     · LE STATUT : « confirmé » quand la place tient, qu'aucun geste n'exige un
       regard de la Maison (création, restauration, devis, « consultation
       avant ») et qu'aucun acompte n'est dû ou qu'il est AU REGISTRE des
       paiements pour ce rendez-vous ; sinon « en attente » : la Maison regarde ;
     · L'ACOMPTE : les taux de Paramètres sur les prix du catalogue ;
     · LA REMISE DES PLACES LIMITÉES : résolue comme pour le site.
   LE PRIX NE SE FIGE PLUS DEPUIS LE NAVIGATEUR, comme pour le site : le
   comptoir compte, avec sa fiche. Ce qu'elle a vu (son total, sa remise)
   s'écrit dans la note, pour que le comptoir le lise ; ce n'est pas un prix. */
function laPlaceTientPourLaCouronne(agenda: AgendaDuServeur, maitre: string, p: { date: string; time: string; dureeMin: number; lourde?: boolean }): boolean {
  const fenetre = ouvertureDuJour(p.date, agenda.semaine, agenda.exceptions);
  if (fenetre.closed) return false;
  const debut = minutesDeHhmm(p.time);
  const fin = debut + p.dureeMin;
  /* Jamais avant 08:30, depuis Ma Couronne non plus : le juge le dit lui-même, comme la grille. */
  if (debut < Math.max(fenetre.openMin, PREMIER_RENDEZ_VOUS_MIN) || fin > fenetre.closeMin) return false;
  const duJour = occupesDuJour(agenda.occupes, p.date);
  if (agenda.capMaison > 0 && duJour.length >= agenda.capMaison) return false;
  const chevauche = (s: number, e: number): boolean => debut < e && fin > s;
  if (agenda.sieges > 0 && duJour.filter((a) => chevauche(a.debutMin, a.debutMin + a.dureeMin)).length >= agenda.sieges) return false;
  const siens = duJour.filter((a) => a.maitre === maitre);
  if (agenda.capMaitre > 0 && siens.length >= agenda.capMaitre) return false;
  /* DEUX TÊTES CHEZ TEAM (18 novembre 2026) : la règle du juge (`laPlaceTient`). */
  const chevauchent = siens.filter((a) => chevauche(a.debutMin, a.debutMin + a.dureeMin));
  return !(chevauchent.some((a) => bloqueLaVenue(maitre, p.lourde, a))
    || chevauchent.length >= DEUX_TETES_AU_PLUS
    || plagesBloquees(agenda.murs, agenda.branchId, p.date, maitre).some(([s, e]) => chevauche(s, e)));
}

async function reserveDepuisLaCouronne(req: Request, ip: string, body: Record<string, unknown>): Promise<Response> {
  if (!(await allowRate(ip, 'couronne_reserver', 30))) return json({ ok: false, error: 'rate_limited' }, 429);
  const session = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const { data: qui, error: errQui } = session ? await admin.auth.getUser(session) : { data: null, error: { message: 'sans session' } };
  const uid = String((qui as { user?: { id?: string } } | null)?.user?.id ?? '');
  if (errQui || !uid) return json({ ok: false, error: 'session' }, 401);
  if (!(await allowRate(uid, 'couronne_reserver_compte', 12, 60))) return json({ ok: false, error: 'rate_limited' }, 429);

  const d = (body.data ?? {}) as Record<string, unknown>;
  const pour = texte(d.pour, 80) || uid;
  const { data: ficheLue, error: errFiche } = await admin.from('clients').select('id, branch_id, data').eq('id', pour).maybeSingle();
  if (errFiche) { console.error('demande-submit: fiche de la couronne illisible', errFiche.message); return json({ ok: false, error: 'agenda_illisible' }, 503); }
  const fiche = ((ficheLue?.data ?? null) as Record<string, any> | null);
  /* SA FICHE, LA RÈGLE D'`est_ma_tete` (0076), 18 novembre 2026 : l'identifiant
     de son compte, OU la fiche qui porte son compte (`authUserId`). La Maison
     inscrit ses clientes bien avant leur compte : la fiche adoptée garde son
     identifiant, et Ma Couronne envoie celui-là (`useClientId`). */
  const laSienne = pour === uid || (!!fiche && String(fiche.authUserId ?? '') === uid);
  if (!laSienne) {
    /* UN ENFANT DE SA FAMILLE, mineur, dont elle est le parent payeur : par
       l'identifiant de son compte, ou par la fiche qui porte son compte. Rien d'autre. */
    const { data: famille } = fiche?.familyId
      ? await admin.from('families').select('data').eq('id', String(fiche.familyId)).maybeSingle()
      : { data: null };
    const naissance = Date.parse(String(fiche?.birthday ?? ''));
    const mineur = Number.isFinite(naissance) && naissance > Date.now() - 18 * 365.25 * 86_400_000;
    const payeur = String((famille as { data?: { payerClientId?: string } } | null)?.data?.payerClientId ?? '');
    let payeParElle = payeur !== '' && payeur === uid;
    if (!payeParElle && payeur !== '' && fiche && fiche.archived !== true && mineur) {
      const { data: ficheDuPayeur, error: errPayeur } = await admin.from('clients').select('data').eq('id', payeur).maybeSingle();
      if (errPayeur) { console.error('demande-submit: fiche du payeur illisible', errPayeur.message); return json({ ok: false, error: 'agenda_illisible' }, 503); }
      payeParElle = String((ficheDuPayeur?.data as { authUserId?: unknown } | null | undefined)?.authUserId ?? '') === uid;
    }
    if (!fiche || fiche.archived === true || !mineur || !payeParElle) {
      return json({ ok: false, error: 'tete' }, 403);
    }
  }

  const serviceIds = Array.isArray(d.serviceIds) ? (d.serviceIds as unknown[]).slice(0, 12).map((x) => texte(x, 60)).filter(Boolean) : [];
  const seances = (Array.isArray(d.seances) ? d.seances as { date?: unknown; time?: unknown; id?: unknown }[] : []).slice(0, 12)
    .map((s) => ({ date: texte(s?.date, 10), time: texte(s?.time, 5), id: texte(s?.id, 90) }))
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && /^\d{2}:\d{2}$/.test(s.time));
  if (serviceIds.length === 0 || seances.length === 0) return json({ ok: false, error: 'creneau_invalide' }, 400);

  const branche = await brancheParDefaut(String(d.branchId ?? ficheLue?.branch_id ?? fiche?.branchId ?? ''));
  const jours = seances.map((s) => s.date).sort();
  const ms = Date.now();
  const [agenda, docs, catalogue] = await Promise.all([
    lisLAgendaDuSite(branche.id, jours[0], jours[jours.length - 1]),
    admin.from('documents').select('key, data').in('key', ['mnd_settings', 'mnd_offers', 'mnd_model_bands', 'mnd_model_band_sets']),
    toutesLesLignes('catalog_services'),
  ]);
  if (!agenda || docs.error || catalogue.error) return json({ ok: false, error: 'agenda_illisible' }, 503);
  const doc = (cle: string): any => ((docs.data ?? []) as { key: string; data?: any }[]).find((x) => x.key === cle)?.data;
  const lignes = (catalogue.data ?? []) as ServiceEnBase[];
  const brutes = new Map(lignes.map((r) => [r.id, (r.data ?? {}) as Record<string, any>]));

  /* LES GESTES : connus et actifs. Ce que Ma Couronne propose à CETTE tête
     (ses venues, sa famille) reste jugé par l'écran ; ce qui exige un regard
     de la Maison ne naît pas confirmé (plus bas). */
  const gestes = serviceIds.map((id) => agenda.services.find((s) => s.id === id));
  if (gestes.some((s) => !s || s.enabled === false || s.archived)) return json({ ok: false, error: 'prestation_inconnue' }, 409);
  const connus = gestes as PrestationDuServeur[];
  if (connus.some((s) => !!s.fenetreApresVenue)) {
    const { data: venues, error: errVenues } = await admin.from('appointments').select('data')
      .eq('data->>clientId', pour).eq('data->>status', 'honoré').limit(PLAFOND_D_UNE_REPONSE);
    if (errVenues) return json({ ok: false, error: 'agenda_illisible' }, 503);
    const rdvs = ((venues ?? []) as { data?: { clientId?: unknown; date?: unknown; status?: unknown } }[]).map((r) => r.data ?? {});
    for (const s of seances) {
      const derniere = derniereVenueAvant(rdvs, pour, s.date);
      if (connus.some((g) => g.fenetreApresVenue && !dansLaFenetreDeVenue(g.fenetreApresVenue, s.date, derniere))) {
        return json({ ok: false, error: 'prestation_hors_fenetre' }, 409);
      }
    }
  }

  /* LA DURÉE, AU SERVEUR : la longueur et le calibre de SA fiche. */
  const longueur = texte(fiche?.longueur, 30);
  const lockCount = Math.max(0, Math.round(Number(fiche?.lockCount) || Number(fiche?.lockCountDeclare) || 0));
  const auCalibre = gestesAuCalibre(agenda.services.map((s) => {
    const b = brutes.get(s.id) ?? {};
    const parLongueur = longueur ? Number(b.dureeParLongueur?.[longueur]) : Number.NaN;
    return { ...s, ...(Number.isFinite(parLongueur) && parLongueur > 0 ? { durationMin: parLongueur } : {}), scalesWithModel: b.scalesWithModel === true };
  }), {
    lockCount, bandes: doc('mnd_model_bands'), sets: doc('mnd_model_band_sets'), categories: agenda.categories,
    suspendu: doc('mnd_settings')?.baremeSuspendu === true,
  });
  const dureeDuServeur = dureeDesPrestations(serviceIds, auCalibre);
  const vu = (d.vu ?? {}) as { totalXof?: unknown; remiseXof?: unknown; dureeMin?: unknown };
  const dureeVue = Math.round(Number(vu.dureeMin) || 0);
  const dureeMin = Math.max(dureeDuServeur, Math.min(dureeVue, dureeDuServeur * 2));

  /* LA PLACE DE CHAQUE SÉANCE, sur l'agenda du serveur. */
  const candidats = maitresDuRituel(agenda, serviceIds);
  const voulu = texte(d.maitre, 60);
  const ordre = voulu && candidats.includes(voulu) ? [voulu, ...candidats.filter((m) => m !== voulu)] : candidats;
  const libresPar: string[][] = [];
  for (const s of seances) {
    const recevable = laPlaceEstRecevable({ date: s.date, time: s.time }, ms, true);
    if (recevable) return json({ ok: false, error: recevable }, 409);
    const ouverture = ouvertureDuJour(s.date, agenda.semaine, agenda.exceptions);
    if (ouverture.closed) return json({ ok: false, error: 'creneau_ferme' }, 409);
    if (!heureSurLaGrille({ openMin: ouverture.openMin, closeMin: ouverture.closeMin, debutMin: minutesDeHhmm(s.time), premierMin: PREMIER_RENDEZ_VOUS_MIN })) {
      return json({ ok: false, error: 'creneau_hors_ouverture' }, 409);
    }
    const { data: lues, error: errPlaces } = await admin.rpc('places_en_ligne', { p_branch: branche.id, p_date: s.date });
    const n = Number(lues);
    const places = !errPlaces && Number.isInteger(n) && n >= PLACES_EN_LIGNE ? Math.min(n, PLACES_EN_LIGNE_AU_PLUS) : PLACES_EN_LIGNE;
    const libres = ordre.filter((m) => laPlaceTientPourLaCouronne({ ...agenda, sieges: places }, m, { date: s.date, time: s.time, dureeMin, lourde: teteLourde(lockCount) }));
    if (libres.length === 0) return json({ ok: false, error: 'creneau_pris' }, 409);
    libresPar.push(libres);
  }

  /* L'ACOMPTE, ET S'IL EST AU REGISTRE POUR CE RENDEZ-VOUS. */
  const acompteXof = acompteDesGestes(serviceIds.map((sid) => ({ id: sid, prixXof: ligneAPrix(sid, lignes).prixXof })), doc('mnd_settings')?.depositPctByService);
  const idPaye = /^rdv-[A-Za-z0-9_-]{6,80}$/.test(seances[0].id) ? seances[0].id : '';
  const transactionId = texte(d.transactionId, 120);
  /* L'ARGENT REÇU EST DE L'ARGENT REÇU : un paiement que kkiapay-verify a
     inscrit au registre pour CE rendez-vous (son identifiant en `partnerId`)
     se pose sur la séance, au montant reçu. Le rendez-vous n'est ferme que
     s'il couvre l'acompte du serveur (au prix du catalogue) ; en dessous, la
     Maison regarde, l'argent est là. */
  let acompteRecu = false;
  let verseXof = 0;
  if (transactionId && idPaye) {
    const { data: paie } = await admin.from('payments').select('data').eq('id', transactionId).maybeSingle();
    const p = (paie?.data ?? null) as { status?: string; partnerId?: string; amountXof?: number } | null;
    if (p && p.status === 'success' && String(p.partnerId ?? '') === idPaye) verseXof = Math.max(0, Math.round(Number(p.amountXof) || 0));
    acompteRecu = verseXof > 0 && verseXof >= acompteXof;
  }

  /* LA REMISE DES PLACES LIMITÉES, comme pour le site : sur la première séance. */
  let duCode: VerdictDuCode = { code: '' };
  let uneSeuleRemise: RaisonDUneSeuleRemise | '' = '';
  if (d.tarifDeLaMaison !== true) {
    const offres = (Array.isArray(doc('mnd_offers')) ? doc('mnd_offers') : []) as any[];
    const { data: placesLues, error: errPlacesRemise } = await admin.rpc('places_de_la_remise', { p_branch: branche.id, p_debut: seances[0].date, p_fin: seances[0].date });
    const candidate = laPlaceCandidate({
      offres, places: errPlacesRemise ? null : (Array.isArray(placesLues) ? placesLues : []) as LigneDesPlaces[],
      date: seances[0].date, serviceIds, branchId: branche.id, catalogue: lignes, aujourdhui: jourDeLaMaison(),
    });
    if (!candidate) {
      if (d.placeAttendue === true) return json({ ok: false, error: 'places_limitees' }, 409);
    } else if (candidate !== 'sans-effet') {
      const tranchee = laPlaceTranchee(candidate, await remisesDuNumero(String(fiche?.phone ?? ''), seances[0].date));
      if ('raison' in tranchee) uneSeuleRemise = tranchee.raison;
      else duCode = tranchee.verdict;
    }
  }

  /* LE STATUT. */
  const regard = connus.some((s) => !estUneConsultation(s, agenda.categories) && exigeConsultation(s, agenda.categories));
  const ferme = !regard && (acompteXof <= 0 || acompteRecu);

  const francs = (v: unknown): string => {
    const x = Math.round(Number(v) || 0);
    return x > 0 ? francsDits(x) : '';
  };
  const note = [
    ...(Array.isArray(d.notes) ? (d.notes as unknown[]).slice(0, 8).map((x) => texte(x, 200)).filter(Boolean) : []),
    francs(vu.totalXof) ? `Vu dans Ma Couronne : ${francs(vu.totalXof)}${francs(vu.remiseXof) ? `, dont ${francs(vu.remiseXof)} de remise` : ''} (à compter au comptoir)` : '',
    regard ? 'La Maison regarde avant de confirmer' : '',
    raisonEnClair(duCode),
    uneSeuleRemiseEnClair(uneSeuleRemise),
  ].filter(Boolean).join(' · ');
  const nom = texte(fiche?.name, 80) || texte(d.nom, 80) || 'Cliente Ma Couronne';
  const creeLe = new Date(ms).toISOString();
  const seriesId = seances.length > 1 ? `serie-${crypto.randomUUID()}` : '';
  const poses: Record<string, unknown>[] = [];
  const defais = async (): Promise<void> => {
    const ids = poses.map((x) => String(x.id));
    if (ids.length > 0) await admin.from('appointments').delete().in('id', ids);
  };
  for (let i = 0; i < seances.length; i += 1) {
    const s = seances[i];
    const id = i === 0 && idPaye ? idPaye : `rdv-${crypto.randomUUID()}`;
    const appt: Record<string, unknown> = {
      id, branchId: branche.id, clientId: pour, clientName: nom, serviceIds, date: s.date, time: s.time,
      master: libresPar[i][0], dureeMin, status: ferme ? 'confirmé' : 'en attente', source: 'couronne', creeLe,
      ...(i === 0 && verseXof > 0 ? { depositXof: verseXof, depositConfirmed: true, depositConfirmedAt: jourDeLaMaison() }
        : i === 0 && acompteXof > 0 ? { depositXof: acompteXof } : {}),
      ...(i === 0 && duCode.code ? { codeOffre: duCode.code } : {}),
      ...(i === 0 && duCode.offreId ? { offreId: duCode.offreId } : {}),
      ...(i === 0 && duCode.remisesLignes ? { remisesLignes: duCode.remisesLignes } : {}),
      ...(longueur ? { longueur } : {}),
      /* Le compte qu'elle a déclaré, quand sa fiche n'en porte pas : le verrou
         (0238) le relit pour la règle des deux têtes chez Team. */
      ...(!(Number(fiche?.lockCount) > 0) && lockCount > 0 ? { locksAnnonces: lockCount } : {}),
      ...(note ? { note: seances.length > 1 ? `${note} · Séance ${i + 1}/${seances.length}` : note } : {}),
      ...(seriesId ? { seriesId, seriesIndex: i + 1, seriesTotal: seances.length } : {}),
    };
    const { data: pose, error: errPose } = await admin.rpc('pose_si_libre', { p_rdv: appt, p_maitres: libresPar[i] });
    const posee = (pose ?? null) as { ok?: boolean; verdict?: string; id?: string; master?: string; raison?: string } | null;
    if (!errPose && posee?.ok === true && posee.verdict === 'deja_pose') continue;
    if (!errPose && posee?.ok === true && posee.id === id) {
      poses.push({ ...appt, master: posee.master ?? appt.master });
      continue;
    }
    /* UNE SÉRIE SE POSE ENTIÈRE, OU PAS DU TOUT. */
    await defais();
    if (duCode.placeLimitee && /PLACES_LIMITEES/.test(errPose?.message ?? '')) return json({ ok: false, error: 'places_limitees' }, 409);
    if (errPose) { console.error('demande-submit: place de la couronne non posée', errPose.message); return json({ ok: false, error: 'panne' }, 500); }
    return json({ ok: false, error: posee?.raison ?? 'creneau_pris' }, 409);
  }
  return json({
    ok: true, etat: ferme ? 'confirme' : 'en-attente', rdvs: poses,
    ...(regard ? { regard: true } : {}),
    ...(acompteXof > 0 ? { acompteXof, acompteRecu } : {}),
    ...(duCode.placeLimitee ? { placeLimitee: true } : {}),
    ...(uneSeuleRemise ? { uneSeuleRemise } : {}),
  });
}

/* ══ LA LISTE D'ATTENTE D'UN JOUR PLEIN — 26 novembre 2026 (audit B3) ═════
   « Prévenez-moi si une place se libère ce jour-là », sur le site et dans Ma
   Couronne. Le bloc ⟨liste-d-attente⟩ est recopié de
   `src/shared/liste-d-attente-pur.ts` (douze lunes R8,
   verifie-remplir-la-semaine) ; cette fonction seule écrit la table
   `liste_d_attente` (0252). Rien ne part à la cliente : l'équipe la prévient
   par la main, depuis le Calendrier du Trône, quand une place se libère. */
/* ⟨liste-d-attente⟩ */
/** La table, écrite par `demande-submit` seule (0252). */
export const TABLE_DE_L_ATTENTE = 'liste_d_attente';
/** Jusqu'où l'on peut attendre : l'horizon de la réservation en ligne (ce mois et les trois suivants). */
export const HORIZON_DE_L_ATTENTE_JOURS = 124;
/** Les demandes encore vivantes d'un même numéro, au plus. */
export const ATTENTES_PAR_NUMERO = 3;

export type SourceDeLAttente = 'site' | 'couronne';
/** attend : dans la file ; proposee : la place lui a été proposée, on attend
    sa réponse ; les trois autres closent sa demande. */
export type StatutDeLAttente = 'attend' | 'proposee' | 'prise' | 'pas-interessee' | 'sans-reponse';

export type DemandeDAttente = {
  id: string;
  branchId: string;
  /** Le jour plein qu'elle attend (AAAA-MM-JJ, jour de Cotonou). */
  jour: string;
  /** Le dépôt (ISO) : il fait son rang dans la file. */
  creeLe: string;
  source: SourceDeLAttente;
  prenom: string;
  /** E.164, posé par le serveur. */
  telephone: string;
  /** Sa fiche, quand elle vient de Ma Couronne. */
  clientId?: string;
  /** Ce qu'elle voulait réserver ce jour-là. */
  serviceIds: string[];
  /** La durée que la page lui montrait, en minutes. */
  dureeMin?: number;
  /** Une tête de 150 locks ou plus (la règle des deux têtes). */
  lourde?: boolean;
  statut: StatutDeLAttente;
  /** L'heure proposée, quand, par qui. */
  proposee?: { heure: string; le: string; par?: string };
  /** Quand sa demande s'est close, et par qui. */
  closeLe?: string;
  closePar?: string;
};

const JOUR_DE_L_ATTENTE = /^\d{4}-\d{2}-\d{2}$/;
const midiDeLAttente = (j: string): number => Date.UTC(Number(j.slice(0, 4)), Number(j.slice(5, 7)) - 1, Number(j.slice(8, 10)), 12);
/** Les jours de `du` à `au` (négatif si `au` est avant). */
export const ecartDeLAttente = (du: string, au: string): number => Math.round((midiDeLAttente(au) - midiDeLAttente(du)) / 86_400_000);
const propreDeLAttente = (v: unknown, max: number): string => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export type AttenteLue =
  | { ok: true; jour: string; prenom: string; serviceIds: string[]; dureeMin: number; lourde: boolean }
  | { ok: false; raison: 'jour' | 'passe' | 'loin' | 'prenom' | 'gestes' };

/** CE QUE LA PORTE REÇOIT, RELU. Un jour réel, d'aujourd'hui (Cotonou) à
    l'horizon ; un prénom quand la page doit le dire (le site) ; les gestes
    voulus (un au moins, six au plus) ; une durée bornée à douze heures. */
export function demandeDAttenteLue(d: unknown, aujourdhui: string, prenomExige = true): AttenteLue {
  const x = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
  const jour = String(x.jour ?? '').slice(0, 10);
  if (!JOUR_DE_L_ATTENTE.test(jour) || Number.isNaN(midiDeLAttente(jour)) || new Date(midiDeLAttente(jour)).toISOString().slice(0, 10) !== jour) return { ok: false, raison: 'jour' };
  if (jour < aujourdhui) return { ok: false, raison: 'passe' };
  if (ecartDeLAttente(aujourdhui, jour) > HORIZON_DE_L_ATTENTE_JOURS) return { ok: false, raison: 'loin' };
  const prenom = propreDeLAttente(x.prenom, 60);
  if (prenomExige && prenom.length < 2) return { ok: false, raison: 'prenom' };
  const serviceIds = (Array.isArray(x.serviceIds) ? x.serviceIds : []).slice(0, 6).map((s) => propreDeLAttente(s, 60)).filter(Boolean);
  if (serviceIds.length === 0) return { ok: false, raison: 'gestes' };
  const duree = Math.round(Number(x.dureeMin) || 0);
  return { ok: true, jour, prenom, serviceIds, dureeMin: Math.max(0, Math.min(720, duree)), lourde: x.lourde === true };
}

/** Une demande vit-elle encore ? Dans la file ou proposée, et son jour pas passé. */
export const attenteVivante = (a: Pick<DemandeDAttente, 'statut' | 'jour'>, aujourdhui: string): boolean =>
  (a.statut === 'attend' || a.statut === 'proposee') && String(a.jour ?? '') >= aujourdhui;
/* ⟨/liste-d-attente⟩ */

async function prevenirDUnePlace(req: Request, ip: string, body: Record<string, unknown>): Promise<Response> {
  if (!(await allowRate(ip, 'prevenir_place', 10))) return json({ ok: false, error: 'rate_limited' }, 429);
  const d = (body.data ?? {}) as Record<string, unknown>;
  const aujourdhui = jourDeLaMaison();
  const deLaCouronne = body.couronne === true;
  let prenom = '';
  let telephone = '';
  let clientId = '';
  let brancheVoulue = texte(d.branchId, 80);
  if (deLaCouronne) {
    /* MA COURONNE : sa session, SA fiche (la règle d'`est_ma_tete`, comme la
       réservation) ; son prénom et son numéro se lisent sur la fiche, jamais
       sur ce que l'appareil envoie. */
    const session = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const { data: qui, error: errQui } = session ? await admin.auth.getUser(session) : { data: null, error: { message: 'sans session' } };
    const uid = String((qui as { user?: { id?: string } } | null)?.user?.id ?? '');
    if (errQui || !uid) return json({ ok: false, error: 'session' }, 401);
    if (!(await allowRate(uid, 'prevenir_place_compte', 10, 60))) return json({ ok: false, error: 'rate_limited' }, 429);
    const pour = texte(d.pour, 80) || uid;
    const { data: ficheLue, error: errFiche } = await admin.from('clients').select('id, branch_id, data').eq('id', pour).maybeSingle();
    if (errFiche) return json({ ok: false, error: 'panne' }, 503);
    const fiche = ((ficheLue?.data ?? null) as Record<string, any> | null);
    if (!fiche || fiche.archived === true || !(pour === uid || String(fiche.authUserId ?? '') === uid)) return json({ ok: false, error: 'tete' }, 403);
    prenom = prenomDUsage(fiche);
    telephone = telephoneNormalise(String(fiche.phone ?? ''));
    if (!telephone) return json({ ok: false, error: 'telephone' }, 400);
    clientId = pour;
    brancheVoulue = brancheVoulue || String(ficheLue?.branch_id ?? fiche.branchId ?? '');
  }
  const lue = demandeDAttenteLue(d, aujourdhui, !deLaCouronne);
  if (!lue.ok) return json({ ok: false, error: lue.raison }, 400);
  if (!deLaCouronne) {
    prenom = lue.prenom;
    telephone = telephoneNormalise(String(d.telephone ?? ''), String(d.dial ?? '+229'));
    if (!telephone) return json({ ok: false, error: 'telephone' }, 400);
  }
  const branche = await brancheParDefaut(brancheVoulue);

  /* UN JOUR FERMÉ NE S'ATTEND PAS : la semaine et les journées exceptionnelles
     de la Maison, les mêmes murs que la réservation. */
  const { data: docs, error: errDocs } = await admin.from('documents').select('key, data').in('key', ['mnd_settings', 'mnd_horaires_exceptions']);
  if (errDocs) return json({ ok: false, error: 'panne' }, 503);
  const doc = (cle: string): any => ((docs ?? []) as { key: string; data?: any }[]).find((x) => x.key === cle)?.data;
  const semaine: HeureDeLaSemaine[] = (Array.isArray(doc('mnd_settings')?.hours) ? doc('mnd_settings').hours : [])
    .filter((h: any) => !!h && typeof h.key === 'string')
    .map((h: any) => ({ key: String(h.key), open: String(h.open ?? ''), close: String(h.close ?? ''), closed: !!h.closed }));
  const exceptions: ExceptionDHoraire[] = (Array.isArray(doc('mnd_horaires_exceptions')) ? doc('mnd_horaires_exceptions') : [])
    .filter((e: any) => !!e && typeof e.date === 'string')
    .map((e: any) => ({ date: String(e.date), ...(e.staffId ? { staffId: String(e.staffId) } : {}), ...(e.open ? { open: String(e.open) } : {}), ...(e.close ? { close: String(e.close) } : {}), closed: !!e.closed }));
  if (ouvertureDuJour(lue.jour, semaine, exceptions).closed) return json({ ok: false, error: 'ferme' }, 409);

  /* LES SIENNES, PAR LA CLÉ DU NUMÉRO : le même jour déjà attendu répond
     « déjà sur la liste » ; trois jours attendus au plus. */
  const { data: siennes, error: errSiennes } = await admin.from(TABLE_DE_L_ATTENTE).select('id, data')
    .in('data->>telephone', numerosDeLaMemePersonne(telephone)).gte('data->>jour', aujourdhui).limit(50);
  if (errSiennes) return json({ ok: false, error: 'panne' }, 503);
  const vivantes = ((siennes ?? []) as { data?: DemandeDAttente }[]).map((r) => r.data).filter((a): a is DemandeDAttente => !!a && attenteVivante(a, aujourdhui));
  if (vivantes.some((a) => a.jour === lue.jour)) return json({ ok: true, deja: true });
  if (vivantes.length >= ATTENTES_PAR_NUMERO) return json({ ok: false, error: 'trop' }, 409);

  const id = `att-${crypto.randomUUID()}`;
  const demande: DemandeDAttente = {
    id, branchId: branche.id, jour: lue.jour, creeLe: new Date().toISOString(),
    source: deLaCouronne ? 'couronne' : 'site', prenom, telephone,
    ...(clientId ? { clientId } : {}),
    serviceIds: lue.serviceIds,
    ...(lue.dureeMin > 0 ? { dureeMin: lue.dureeMin } : {}),
    ...(lue.lourde ? { lourde: true } : {}),
    statut: 'attend',
  };
  const { error } = await admin.from(TABLE_DE_L_ATTENTE).insert({ id, branch_id: branche.id, data: demande });
  if (error) {
    console.error('demande-submit: liste d attente', error.message);
    return json({ ok: false, error: 'panne' }, 503);
  }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method', version: VERSION }, 405);
  const ip = ipOf(req);
  /* LA VOIX ARRIVE EN MULTIPART (19 octobre 2026) : elle passe avant la
     lecture JSON, plafonnée à 5 000 caractères pour les demandes écrites. */
  if ((req.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) return await messageVocal(req, ip);

  const corps = await req.text();
  if (corps.length > 5_000) return json({ error: 'too_large' }, 400);
  let body: Record<string, unknown>;
  try { body = JSON.parse(corps); } catch { return json({ error: 'bad_request' }, 400); }

  /* « QUI » PASSE AVANT LE SEAU DES DÉPÔTS — 9 octobre 2026, avec le sien :
     chaque ouverture de `/reserver/?code=` en fait un ou deux, et trois
     ouvertures suffisaient à refuser la réservation qui suivait. */
  /* SA RÉPONSE À LA PLACE TENUE — 17 novembre 2026 : le webhook rend ici le
     bouton touché ou le « Je confirme » écrit. La clé service seule, sans seau. */
  if (body.attente === 'reponse') {
    try {
      return await reponseALAttente(req, body);
    } catch (e) {
      console.error('demande-submit: reponse a l attente', String((e as Error)?.message ?? e).slice(0, 200));
      return json({ pris: false, error: 'panne' }, 500);
    }
  }
  /* LE MESSAGE DE L'ATTENTE NON REMIS — 18 novembre 2026 : le webhook rend ici
     l'accusé « failed » de Meta. La clé service seule, sans seau. */
  if (body.attente === 'non-remis') {
    try {
      return await attenteNonRemise(req, body);
    } catch (e) {
      console.error('demande-submit: attente non remise', String((e as Error)?.message ?? e).slice(0, 200));
      return json({ pris: false, error: 'panne' }, 500);
    }
  }
  if (body.parrainage === 'qui') {
    if (!(await allowRate(ip, 'parrainage_qui', 30))) return json({ error: 'rate_limited' }, 429);
    return await quiOffre(body);
  }
  /* Le site ne crée plus de code (De main en main) : réponse sans base. */
  if (body.parrainage === true) return json({ error: 'parrainage_ferme' }, 409);
  /* LA PAGE DU RENDEZ-VOUS ET LA CLIENTE QUI REVIENT — 3 novembre 2026,
     chacune son seau : lire son rendez-vous, ou demander sa réservation
     préparée, n'est pas déposer une demande, et ne doit pas refuser celle
     qui suit. */
  if (body.rdv === 'lire') {
    if (!(await allowRate(ip, 'rdv_lire', 30))) return json({ error: 'rate_limited' }, 429);
    return await litLeRendezVous(body.v);
  }
  /* DÉPLACER DEPUIS LE SITE — 7 novembre 2026 : les places libres de SON
     maître, puis le déplacement aussitôt. Chacun son seau, par adresse et par
     jeton ; un appel qui tombe en panne se dit en une ligne, jamais en trace. */
  if (body.rdv === 'places' || body.rdv === 'deplacer') {
    try {
      return body.rdv === 'places' ? await placesPourDeplacer(ip, body.v) : await deplaceDepuisLeSite(ip, body);
    } catch (e) {
      console.error('demande-submit: deplacer', String((e as Error)?.message ?? e).slice(0, 200));
      return json({ ok: false, error: 'panne' }, 500);
    }
  }
  /* MA COURONNE PASSE PAR LE SERVEUR — 17 novembre 2026 : la session de la
     cliente, son seau, et le serveur décide du statut, de la durée, de la
     remise et de l'acompte. */
  /* LA LISTE D'ATTENTE D'UN JOUR PLEIN — 26 novembre 2026 : son seau à elle. */
  if (body.prevenir === 'place') {
    try {
      return await prevenirDUnePlace(req, ip, body);
    } catch (e) {
      console.error('demande-submit: prevenir', String((e as Error)?.message ?? e).slice(0, 200));
      return json({ ok: false, error: 'panne' }, 500);
    }
  }
  if (body.couronne === 'reserver') {
    try {
      return await reserveDepuisLaCouronne(req, ip, body);
    } catch (e) {
      console.error('demande-submit: couronne', String((e as Error)?.message ?? e).slice(0, 200));
      return json({ ok: false, error: 'panne' }, 500);
    }
  }
  if (body.cliente === 'retour') {
    if (!(await allowRate(ip, 'cliente_retour', 5))) return json({ error: 'rate_limited' }, 429);
    return prepareLeRetour(body);
  }
  if (body.cliente === 'lire') {
    if (!(await allowRate(ip, 'cliente_lire', 20))) return json({ error: 'rate_limited' }, 429);
    return await litLaCliente(body.identite);
  }
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
  /* LE NOM, DANS SA CASE — 15 octobre 2026 : « créer des cases séparées pour
     le nom et le prénom lors de la prise de RDV » (Yéman). Le prénom reste
     celui des messages ; le nom entier va au rendez-vous, au fil, à la fiche. */
  const nom = texte(d.nom, 60);
  const nomEntier = [prenom, nom].filter(Boolean).join(' ');
  /* LA CIVILITÉ CHOISIE SUR LE SITE — 13 octobre 2026. Trois valeurs, rien
     d'autre ; une ancienne page qui ne l'envoie pas : rien, Madame. */
  const civilite = d.civilite === 'madame' || d.civilite === 'mademoiselle' || d.civilite === 'monsieur' ? String(d.civilite) : '';
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
  /* POUR QUI — 11 octobre 2026 (maquette de la réservation validée) : « moi »,
     « enfant » ou « autre ». Deux têtes du même numéro à la même heure (une
     mère et sa fille) sont deux demandes ; la même personne deux fois, un
     doublon. Une valeur inconnue vaut « moi ». */
  const pourQui = (['moi', 'enfant', 'autre'] as const).find((q) => q === String(d.pourQui ?? 'moi')) ?? 'moi';
  const depuis = new Date(Date.now() - 24 * 3_600_000).toISOString();
  /* PAR LA CLÉ DU NUMÉRO (17 novembre 2026) : toutes les graphies du même numéro. */
  const deja = admin.from('demandes').select('id, data').in('data->>telephone', numerosDeLaMemePersonne(telephone)).limit(8);
  const { data: memes } = avecPlace
    ? await deja.eq('data->>date', date).eq('data->>time', time)
    : await deja.eq('data->>besoin', besoin).gte('updated_at', depuis);
  type DemandeConnue = { id: string; data?: { pourQui?: string; apptId?: string; cleDuDepot?: string } };
  const connues = ((memes ?? []) as DemandeConnue[]).filter((m) => (m.data?.pourQui ?? 'moi') === pourQui);
  /* UNE PLACE LIBÉRÉE N'EST PLUS UN DOUBLON — 17 novembre 2026. Le rendez-vous
     de la demande connue se relit : annulé (sa place s'est libérée faute de
     confirmation, ou la Maison l'a annulé), il ne tient plus rien, et la même
     place se repose. */
  const rdvsConnus = new Map<string, any>();
  const idsConnus = connues.map((m) => m.data?.apptId).filter((x): x is string => !!x);
  if (avecPlace && idsConnus.length > 0) {
    const { data: lus } = await admin.from('appointments').select('id, data').in('id', idsConnus);
    for (const r of (lus ?? []) as { id: string; data?: any }[]) if (r.data && r.data.status !== 'annulé') rdvsConnus.set(r.id, r.data);
  }
  const meme = avecPlace
    ? connues.find((m) => !!m.data?.apptId && rdvsConnus.has(m.data.apptId))
    : connues[0];
  /* LA CLÉ DU DÉPÔT — 17 novembre 2026. Un mot que la page tire au hasard et
     garde le temps de sa visite : il dit qu'un second envoi vient du MÊME
     appareil (elle avait fermé pendant l'attente, puis recommencé). */
  const cleDuDepot = /^[A-Za-z0-9_-]{16,80}$/.test(String(d.cle ?? '')) ? String(d.cle) : '';
  /* UN DOUBLON D'UNE PLACE DÉJÀ TENUE RÉPOND « C'EST RÉSERVÉ » — 11 octobre
     2026. Il répondait « demandée », sans apptId ni confirme, pour une place
     que la cliente tenait depuis son premier envoi (elle avait fermé pendant
     l'attente, puis recommencé) ; et si cette première pose avait été refusée
     par le verrou, la seconde tentative n'était jamais rejouée. Désormais :
     une demande connue AVEC rendez-vous répond le rendez-vous ; une demande
     connue SANS rendez-vous laisse la pose se retenter. Sans place, la règle
     des 24 h ne change pas. */
  /* LA RÉFÉRENCE NE SE REND QU'À L'APPAREIL QUI A DÉPOSÉ — 17 novembre 2026.
     Un second envoi de la même page (la clé de son premier dépôt) retrouve son
     rendez-vous, sa référence et l'état de sa place ; tout autre envoi des
     mêmes numéro, jour et heure apprend seulement que c'est déjà enregistré. */
  if (meme) {
    const sien = !!cleDuDepot && meme.data?.cleDuDepot === cleDuDepot;
    const tenu = avecPlace && meme.data?.apptId ? rdvsConnus.get(meme.data.apptId) : null;
    if (!sien) return json({ ok: true, deja: true, ...(tenu ? { accuse: 'deja' } : {}) });
    if (!tenu || !meme.data?.apptId) return json({ ok: true, id: meme.id, deja: true });
    const attend = estEnAttente(tenu);
    return json({
      ok: true, id: meme.id, deja: true, apptId: meme.data.apptId, accuse: 'deja',
      etat: attend ? 'en-attente' : 'confirme',
      ...(attend ? { attenduJusquAu: String(tenu.attenduJusquAu) } : { confirme: true }),
      reference: referenceDuRendezVous(meme.data.apptId),
    });
  }

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
  /** UNE SEULE REMISE (4 novembre 2026) : la raison qui a écarté la place
      limitée de ce rendez-vous, dite à la note et à la page. */
  let uneSeuleRemise: RaisonDUneSeuleRemise | '' = '';
  let nomsDesGestes: string[] = [];
  /** LE MODÈLE DE L'ATTENTE (17 novembre 2026) : nommé et approuvé, la place
      naît en attente ; vide, elle naît confirmée comme avant. */
  let modeleAttente = '';
  let reglagesDeLaMaison: any = {};
  let catalogueLu: ServiceEnBase[] = [];
  if (avecPlace) {
    const verdict = await laPlaceDemandee({ branche: branche.ligne, serviceIds, date, time, telephone, lockCount });
    if ('erreur' in verdict) return json({ error: verdict.erreur }, verdict.erreur === 'agenda_illisible' ? 503 : 409);
    /* LES PLAFONDS, AVANT D'ÉCRIRE QUOI QUE CE SOIT — 17 novembre 2026. Une
       adresse ne pose pas plus de douze places en vingt-quatre heures ; un
       numéro, pas plus de cinq, ni plus de trois qu'il n'a pas confirmées.
       Refusée ici, la demande ne laisse ni ligne, ni fil, ni sonnerie au
       Trône ; le verrou (`pose_si_libre`, 0222) rejoue le plafond du numéro. */
    modeleAttente = await modeleDeLAttenteOuvert();
    if (!(await allowRate(ip, 'places_du_jour', POSES_PAR_ADRESSE_ET_PAR_JOUR, 24 * 60))) return json({ error: 'trop_de_demandes' }, 429);
    {
      const { data: compte, error: errCompte } = await admin.rpc('plafond_des_poses', { p_cle: cleDuNumero(telephone) });
      const c = (compte ?? null) as { posesDuJour?: unknown; enAttente?: unknown } | null;
      const refus = errCompte || !c ? null
        : plafondDuNumero({ posesDuJour: Number(c.posesDuJour) || 0, enAttente: Number(c.enAttente) || 0, attente: !!modeleAttente });
      if (refus) return json({ error: refus }, 429);
    }
    reglagesDeLaMaison = verdict.reglages;
    catalogueLu = verdict.catalogue;
    maitresLibres = verdict.maitres;
    dureeMin = verdict.dureeMin;
    master = verdict.maitres[0] ?? '';
    /* LA PRESTATION EN CLAIR (25 novembre 2026) : le modèle rdv_a_confirmer
       dit « Rituel Sówà™ (traitement anti-poux) », elle sait ce qu'elle a demandé. */
    nomsDesGestes = serviceIds.map((sid: string) => {
      const s = verdict.catalogue.find((x) => x.id === sid)?.data;
      return s?.name ? nomEtEnClair(s.name, s.enClair) : sid;
    });
    duCode = remiseDuCode({ code: codeEcrit, serviceIds, branchId, catalogue: verdict.catalogue, offres: verdict.offres, date });
    /* LA PLACE LIMITÉE NE SE TAPE PAS — 4 novembre 2026. Le code d'une offre à
       places arrive quand la page a MONTRÉ la remise de ce jour ; il ne vaut
       rien par lui-même (tapé un samedi, ou sur un jour plein, il ouvrirait
       la remise sans place). On l'oublie, et la place se juge plus bas. */
    const placeAttendue = estUnCodeDesPlaces(verdict.offres, codeEcrit);
    if (placeAttendue) duCode = { code: '' };
    /* Une fois par personne : la remise tombe, la réservation tient.
       SAUF UNE OFFRE DU JOUR DE LA VENUE (2 novembre 2026) : « −15 % sur le
       rituel posé un mercredi » vaut à chaque mercredi, comme au comptoir du
       Trône qui la pose sur chaque rendez-vous de ce jour. La borner à une
       fois ici aurait fait dire au site « déjà utilisé » à une cliente que la
       Caisse remise quand même. */
    if (duCode.remisesLignes && !duCode.chaqueVenue && await codeDejaUtilise(duCode.code, telephone)) {
      duCode = { code: duCode.code, offreId: duCode.offreId, raison: 'deja-utilise' };
    }
    /* Aucune offre ne le connaît : est-ce le code d'une marraine ? */
    if (duCode.raison === 'inconnu') {
      duCode = (await verdictDuParrainage(duCode.code, telephone, {
        serviceIds, catalogue: verdict.catalogue, familles: verdict.familles,
      }).catch(() => null)) ?? duCode;
    }
    /* LA PLACE SE POSE D'ELLE-MÊME — 4 novembre 2026. Jamais par-dessus un
       autre code (un code inconnu n'en est pas un, comme sur la page), jamais
       quand la cliente a choisi le tarif de la Maison après qu'une place est
       partie. Plus de place ce jour-là alors que la page la montrait : rien ne
       s'écrit, la page le dit (« La dernière place vient de partir ») et la
       cliente choisit ; le prix ne change jamais en silence. Une tête qui a
       déjà une remise garde la sienne : la place n'est pas prise, la page dit
       pourquoi. */
    const unAutreCode = !!duCode.code && duCode.raison !== 'inconnu';
    if (!unAutreCode && d.tarifDeLaMaison !== true) {
      const candidate = laPlaceCandidate({
        offres: verdict.offres, places: verdict.placesDeLaRemise, date, serviceIds, branchId,
        catalogue: verdict.catalogue, aujourdhui: jourDeLaMaison(),
      });
      if (!candidate) {
        if (placeAttendue) return json({ error: 'places_limitees' }, 409);
      } else if (candidate !== 'sans-effet') {
        const tranchee = laPlaceTranchee(candidate, await remisesDuNumero(telephone, date));
        if ('raison' in tranchee) uneSeuleRemise = tranchee.raison;
        else duCode = tranchee.verdict;
      }
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
    ...(civilite ? { civilite } : {}),
    ...(nom ? { nom } : {}),
    telephone,
    ...(email ? { email } : {}),
    besoin,
    ...(pourQui !== 'moi' ? { pourQui } : {}),
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
    ...(duCode.placeLimitee ? { placeLimitee: true } : {}),
    ...(uneSeuleRemise ? { uneSeuleRemise } : {}),
    ...(duCode.raison === 'parrainage' ? {
      parrainDe: duCode.code, marraineId: duCode.marraineId,
      ...(duCode.marraineClientId ? { marraineClientId: duCode.marraineClientId } : {}),
      ...(duCode.cadeau ? { cadeauFilleule: duCode.cadeau } : {}),
    } : {}),
    cleDuNumero: cleDuNumero(telephone),
    ...(cleDuDepot ? { cleDuDepot } : {}),
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
      pourQui === 'enfant' ? 'Pour son enfant' : pourQui === 'autre' ? 'Pour quelqu’un d’autre' : '',
      lockCount ? `Calibre annoncé : ${calibre || `${lockCount} locks`}` : '',
      avecPlace ? `${nomsDesGestes.join(', ')} · le ${jourEnClair(date)} à ${heureLisible(time)}` : '',
      d.mot ? `« ${texte(d.mot, 1000)} »` : '',
    ].filter(Boolean).join('\n');
    const { error: errFil } = await admin.from('messages_wa').upsert({
      id: idFil,
      branch_id: branchId,
      data: {
        id: idFil, branchId, sens: 'entrant', canal: 'site', numero: tel, clientId: '',
        ...(nomEntier ? { nomProfil: nomEntier } : {}), texte: texteDuFil, type: 'text', quand: now, demandeId: id,
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
  /* La place que cette personne tenait déjà à cette heure (verdict du verrou). */
  let dejaPosee = false;
  /* EN ATTENTE DE SON OUI (17 novembre 2026) : ce que la pose a écrit, et
     l'acompte que portent ses gestes (Paramètres › Réservation et acompte). */
  let attenduJusquAu = '';
  let acompteXof = 0;
  if (avecPlace) {
    const candidat = `rdv-${crypto.randomUUID()}`;
    const naissance = modeleAttente ? marquesDeLaNaissance(Date.now()) : null;
    if (naissance) {
      acompteXof = acompteDesGestes(serviceIds.map((sid, i) => {
        const pct = Math.max(0, Math.min(100, Number(duCode.remisesLignes?.[i]?.pct) || 0));
        return { id: sid, prixXof: ligneAPrix(sid, catalogueLu).prixXof * (1 - pct / 100) };
      }), reglagesDeLaMaison?.depositPctByService);
    }
    /* LE MOT ENTIER — 11 octobre 2026 : coupé à 300, le diagnostic joint par
       la cliente arrivait tronqué au calendrier du Trône ; la demande et le
       fil le gardaient à 1 000. Même mesure partout. */
    const note = [
      'Réservé depuis le site',
      pourQui === 'enfant' ? 'Pour son enfant' : pourQui === 'autre' ? 'Pour quelqu’un d’autre' : '',
      lockCount ? `Calibre annoncé : ${calibre || `${lockCount} locks`}` : '',
      raisonEnClair(duCode),
      uneSeuleRemiseEnClair(uneSeuleRemise),
      d.mot ? texte(d.mot, 1000) : '',
    ].filter(Boolean).join(' · ');
    const appt = {
      id: candidat,
      branchId,
      clientId: '',
      clientName: nomEntier || 'Demande du site',
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
      /* Sa tête annoncée (deux têtes chez Team, 18 novembre 2026) : le verrou la relit. */
      ...(lockCount > 0 ? { locksAnnonces: lockCount } : {}),
      /* LE STATUT RESTE « CONFIRMÉ » (17 novembre 2026) : la place est tenue
         partout (le Carnet, les places du « + RDV », les autres portes), comme
         une suggestion. Ce qui la dit EN ATTENTE, ce sont ses marques :
         `suggereLe` (posée, sans son oui : aucun rappel) et `attenduJusquAu`
         (son échéance). */
      creeLe: now,
      cleDuNumero: cleDuNumero(telephone),
      ...(naissance ? { ...naissance, ...(acompteXof > 0 ? { depositXof: acompteXof } : {}) } : {}),
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
    /* « DEJA_POSE » EST UNE PLACE POSÉE — 11 octobre 2026. Le verrou rend ok
       avec l'identifiant du rendez-vous que cette personne tient déjà à cette
       heure ; on le prenait pour une non-pose : demande en doublon, accusé
       « demande reçue », écran « demandée ». La place est tenue, on le dit, et
       aucun accusé ne repart. */
    if (!errPose && posee?.ok === true && posee.verdict === 'deja_pose' && posee.id) {
      apptId = posee.id;
      dejaPosee = true;
      await admin.from('demandes').update({ data: { ...demande, apptId, master: posee.master ?? master, dejaPosee: true } }).eq('id', id);
    } else if (!errPose && posee?.ok === true && posee.id === candidat) {
      apptId = candidat;
      attenduJusquAu = naissance?.attenduJusquAu ?? '';
      /* L'USAGE SE POSE ICI, ET NULLE PART AILLEURS : le code n'est consommé
         qu'une fois le rendez-vous réellement inscrit avec sa remise. Un
         rendez-vous que la base refuse ne prend pas la fois de la cliente. */
      const applique = duCode.remisesLignes ? { codeApplique: true } : {};
      await admin.from('demandes').update({ data: { ...demande, apptId, master: posee.master ?? master, ...applique } }).eq('id', id);
    } else if (duCode.placeLimitee && /PLACES_LIMITEES/.test(errPose?.message ?? '')) {
      /* LA DERNIÈRE PLACE EST PARTIE ENTRE LA LECTURE ET LA POSE — 4 novembre
         2026 : la garde de la base (0154) a départagé, sous verrou, deux
         clientes sur la même dernière place. Rien n'est posé ; la demande et
         sa ligne au fil, écrites par cet appel il y a un instant, s'effacent :
         la page dit « La dernière place vient de partir », et la cliente
         confirme au tarif de la Maison si elle le veut. Le prix ne change
         jamais en silence. */
      await admin.from('messages_wa').delete().eq('id', `site-${id}`);
      await admin.from('demandes').delete().eq('id', id);
      return json({ error: 'places_limitees' }, 409);
    } else if (!errPose && (posee?.raison === 'trop_de_demandes' || posee?.raison === 'trop_en_attente')) {
      /* LE PLAFOND DU NUMÉRO, REJOUÉ SOUS VERROU — 17 novembre 2026 : deux
         dépôts au même instant ont passé la lecture d'avant. Rien n'est posé,
         et la demande écrite il y a un instant s'efface avec sa ligne au fil. */
      await admin.from('messages_wa').delete().eq('id', `site-${id}`);
      await admin.from('demandes').delete().eq('id', id);
      return json({ error: posee.raison }, 429);
    } else {
      console.error('demande-submit: place non posée', errPose?.message ?? posee?.raison ?? 'réponse vide');
    }
    /* Si le verrou refuse ou se tait, la demande vit quand même et la Maison
       rappellera : on ne perd jamais une visiteuse pour une ligne. */
  }

  /* L'ACCUSÉ — pour une place réellement posée, jamais pour une question.
     Un échec ne défait rien : la place est prise, le journal le dira. */
  /* LA RÉPONSE N'ATTEND PLUS META — 11 octobre 2026. La place est posée, et
     la visiteuse attendait jusqu'à 8 s de plus que l'accusé parte avant de
     lire « c'est réservé ». On lui laisse 2,5 s : si l'accusé est parti,
     la page le dit ; sinon il continue en tâche de fond, et la page dit
     « votre place est tenue, la Maison vous écrit », avec le bouton WhatsApp
     devant. Une place déjà tenue (deja_pose) ne reçoit pas de second accusé. */
  /* UNE PLACE NON POSÉE SE DIT AVEC SON JOUR, UNE DEMANDE SANS PLACE AVEC CE
     QU'ELLE A DEMANDÉ (15 octobre 2026, accuse-du-site). */
  const accuseDAvant = (): Promise<string> => envoieLAccuse({
    apptId, demandeId: id, branchId, prenom, telephone, ...(civilite ? { civilite } : {}),
    avecPlace,
    quand: avecPlace ? `${jourEnClair(date)} à ${heureLisible(time)}` : quandDeLaDemande(texte(d.profil, 80), besoin),
    ...(avecPlace ? { date, time } : {}),
  }).catch((e) => { console.error('demande-submit: accusé', String(e)); return 'échec'; });
  /* LA PLACE EN ATTENTE REÇOIT SA DEMANDE DE CONFIRMATION — 17 novembre 2026 :
     le modèle de l'attente et ses deux boutons, à la place de « c'est
     confirmé ». On l'attend six secondes. UN MESSAGE QUI NE PART PAS NE LAISSE
     PAS LA PLACE EN ATTENTE (18 novembre 2026) : Meta refuse le modèle,
     l'envoi échoue (un numéro hors de WhatsApp), le plafond des modèles est
     atteint ; elle ne pourrait pas répondre « Je confirme » et sa place
     partirait au bout de deux heures. La place se confirme dans la seconde et
     l'ancienne confirmation part, comme avant ce jour. Un envoi qui dépasse
     les six secondes est suivi jusqu'au bout, en tâche de fond ; un message
     que Meta dit plus tard non remis passe par le webhook (`non-remis`). */
  let enAttente = !!apptId && !dejaPosee && !!attenduJusquAu;
  let accuse: string;
  if (enAttente && apptId) {
    const posee = apptId;
    const envoi = envoieLAttente({
      apptId, demandeId: id, branchId, modele: modeleAttente, prenom, telephone, ...(civilite ? { civilite } : {}),
      quand: `${jourEnClair(date)} à ${heureLisible(time)}`, gestes: nomsDesGestes.join(', '), date, time,
    }).catch((e) => { console.error('demande-submit: attente', String(e)); return 'échec'; });
    const partie = await auPlus(envoi, 6000, 'en-cours');
    if (attenteNonPartie(partie)) {
      await confirmeSansAttente(posee);
      enAttente = false;
      attenduJusquAu = '';
      acompteXof = 0;
      accuse = await auPlus(accuseDAvant(), 2500, 'en-cours');
    } else {
      accuse = partie;
      if (partie === 'en-cours') {
        enTacheDeFond(envoi.then(async (fin) => {
          if (!attenteNonPartie(fin) || !(await confirmeSansAttente(posee))) return;
          await accuseDAvant();
          await alerteLePersonnel('Réservé depuis le site', `${nomEntier || 'Une visiteuse'} · ${date} à ${time} · le message de l’attente n’est pas parti : la place est confirmée`, '/trone/#/calendrier').catch(() => 0);
        }).catch((e) => console.error('demande-submit: suite de l attente', String(e))));
      }
    }
  } else {
    accuse = await auPlus(dejaPosee ? Promise.resolve('deja') : accuseDAvant(), 2500, 'en-cours');
  }

  /* La marraine n'est prévenue que d'une place FERME : en attente, à son oui. */
  if (apptId && !dejaPosee && !enAttente && duCode.raison === 'parrainage' && duCode.marraineTelephone) {
    enTacheDeFond(previensLaMarraine({
      demandeId: id, branchId, prenomMarraine: duCode.marraine ?? '', prenomAmie: prenomDevine(prenom),
      telephone: duCode.marraineTelephone, clientId: duCode.marraineClientId,
    }).catch((err) => { console.error('demande-submit: marraine', String(err)); return 'échec'; }));
  }

  const quand = avecPlace ? ` · ${date} à ${time}` : '';
  const sent = dejaPosee ? 0 : await auPlus(alerteLePersonnel(
    apptId ? (enAttente ? 'Place tenue depuis le site, en attente de son oui' : 'Réservé depuis le site')
      : (genre === 'rdv' ? 'Demande de rendez-vous depuis le site' : 'Nouvelle demande depuis le site'),
    `${nomEntier || 'Une visiteuse'} · ${besoin}${quand}`,
    apptId ? '/trone/#/calendrier' : '/trone/#/demandes',
  ).catch(() => 0), 1500, 0);
  /* LA RAISON REMONTE À LA PAGE : « déjà utilisé » se dit au clic, pas au
     comptoir. `codeApplique` dit si la remise a réellement porté. */
  /* L'ÉTAT DE LA PLACE (17 novembre 2026) : « en-attente » (la page dit
     « Répondez Je confirme sur WhatsApp », jusqu'à quelle heure, et l'acompte
     s'il y en a un) ou « confirme ». `confirme: true` ne part plus que d'une
     place ferme : une page d'avant ce jour dit alors « Votre place est
     demandée, la Maison vous confirme sur WhatsApp », ce qui est juste. Une
     place qu'une autre demande tenait déjà (`deja_pose`) ne rend ni son
     identifiant ni sa référence. */
  const rendue = !!apptId && !dejaPosee;
  /* La place qu'elle tenait déjà (`deja_pose`) dit son état à elle : en
     attente de son oui, ou confirmée. Jamais son identifiant ni sa référence. */
  const dejaEnAttente = dejaPosee && !!apptId && estEnAttente((await leRdvDuSite(apptId).catch(() => null))?.data);
  return json({
    ok: true, id, ...(rendue ? { apptId } : {}), sent, accuse,
    ...(apptId ? (enAttente
      ? { etat: 'en-attente', attenduJusquAu, reference: referenceDuRendezVous(apptId), ...(acompteXof > 0 ? { acompteXof } : {}) }
      : dejaEnAttente ? { etat: 'en-attente' }
        : { etat: 'confirme', confirme: true, ...(rendue ? { reference: referenceDuRendezVous(apptId) } : {}) }) : {}),
    ...(duCode.code ? { code: duCode.code, codeApplique: !!duCode.remisesLignes } : {}),
    ...(duCode.raison ? { codeRaison: duCode.raison } : {}),
    ...(duCode.raison === 'parrainage' ? { marraine: duCode.marraine, cadeau: duCode.cadeau ?? '' } : {}),
    /* LA PLACE LIMITÉE, ET CE QUI L'A ÉCARTÉE (4 novembre 2026) : la page dit
       le prix de la confirmation d'après ce que le serveur a vraiment posé. */
    ...(duCode.placeLimitee ? { placeLimitee: true, offreId: duCode.offreId } : {}),
    ...(uneSeuleRemise ? { uneSeuleRemise } : {}),
  });
});
