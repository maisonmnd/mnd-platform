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
// atteint. L'écran propose ; le serveur dispose. Le rendez-vous naît
// « en attente » : la Maison le confirme depuis Le Trône.
//
// LE CALCUL EST RECOPIÉ, PAS IMPORTÉ : une fonction Edge ne lit rien du
// dépôt. Sa source de vérité est `src/shared/agenda-pur.ts`, éprouvé par
// `scripts/verifie-agenda-pur.mjs` — les deux doivent changer ensemble.
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

async function allowRate(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
  const { count, error } = await admin
    .from('edge_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('bucket', RATE_BUCKET).eq('ip', ip).gte('at', since);
  if (error) return true; // table absente : ne pas bloquer
  if ((count ?? 0) >= RATE_MAX) return false;
  await admin.from('edge_rate_limits').insert({ bucket: RATE_BUCKET, ip });
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

async function brancheParDefaut(voulue: string): Promise<{ id: string; maitres: string[] }> {
  const { data: rows } = await admin.from('branches').select('id, data');
  const branches = (rows ?? []) as { id: string; data?: { flagship?: boolean; status?: string; masters?: string[] } }[];
  const choisie = (voulue && branches.find((b) => b.id === voulue))
    || branches.find((b) => b.data?.flagship && b.data?.status !== 'paused')
    || branches[0];
  return { id: choisie?.id ?? 'maison', maitres: (choisie?.data?.masters ?? []).filter(Boolean) };
}

/* ══ LE CALENDRIER, RECOPIÉ DE `shared/agenda-pur.ts` ═══════════════ */

const hourToMin = (h: string): number => {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(String(h ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 9 * 60;
};
const minutesDeHhmm = (hhmm: string): number => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

type Fenetre = { closed: boolean; openMin: number; closeMin: number };
type HeureSemaine = { key: string; open: string; close: string; closed: boolean };
type Exception = { date: string; staffId?: string; open?: string; close?: string; closed?: boolean };

function ouvertureDuJour(dateIso: string, semaine: HeureSemaine[], exceptions: Exception[]): Fenetre {
  const FERME: Fenetre = { closed: true, openMin: 0, closeMin: 0 };
  const dow = new Date(`${dateIso}T00:00:00`).getDay();
  const jour = semaine.find((h) => h.key === JOURS[dow]);
  if (!jour || jour.closed) return FERME;
  const base: Fenetre = { closed: false, openMin: hourToMin(jour.open), closeMin: hourToMin(jour.close) };
  const ex = exceptions.find((e) => e.date === dateIso && !e.staffId);
  if (!ex) return base;
  if (ex.closed) return FERME;
  return {
    closed: false,
    openMin: ex.open?.trim() ? hourToMin(ex.open) : base.openMin,
    closeMin: ex.close?.trim() ? hourToMin(ex.close) : base.closeMin,
  };
}

/* ══ CE QUE LA MAISON A DÉCOCHÉ POUR LE SITE ═══════════════════════
   « Il y a des services que je ne voudrais pas sur le site » (Yéman,
   17 septembre 2026). La Maison décoche depuis la régie de la Vitrine,
   onglet « Sur le site public » ; la liste vit dans
   `mnd_vitrine_config.siteMasques`, À PART de `hiddenServices` et
   `hiddenCategories`, qui règlent le comptoir et Ma Couronne.

   SANS CE REFUS, DÉCOCHER NE SERAIT QU'UN DÉCOR : l'écran cesserait de
   proposer, mais un appel direct à cette fonction réserverait encore, et le
   rendez-vous naîtrait dans le carnet. L'écran propose, le serveur dispose.

   RECOPIÉ DE `src/shared/catalogue-pur.ts` (`masquePourLeSite`), éprouvé par
   `scripts/verifie-qualification.mjs` : les deux changent ensemble. */
type MasquesDuSite = { services?: string[]; categories?: string[] };

function masquePourLeSite(
  s: { id: string; categoryId: string },
  masques: MasquesDuSite | undefined,
  cats: { id: string; parentId?: string }[],
): boolean {
  if (!masques) return false;
  if ((masques.services ?? []).includes(s.id)) return true;
  const caches = masques.categories ?? [];
  if (caches.length === 0) return false;
  let cur: string | undefined = s.categoryId;
  for (let i = 0; cur && i < 8; i += 1) {
    if (caches.includes(cur)) return true;
    cur = cats.find((c) => c.id === cur)?.parentId;
  }
  return false;
}

/* ══ LA PLACE DEMANDÉE, REVÉRIFIÉE ICI ═════════════════════════════
   Rend l'erreur à dire, ou la durée et le maître si la place tient. L'écran
   a déjà jugé, mais un écran vieux d'une minute, un retour en arrière du
   navigateur ou un appel direct à cette fonction ne jugent rien du tout. */
async function laPlaceTient(o: {
  branchId: string;
  maitres: string[];
  serviceIds: string[];
  date: string;
  time: string;
  master: string;
}): Promise<{ erreur: string } | { dureeMin: number; master: string; catalogue: ServiceEnBase[]; offres: any[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !/^\d{2}:\d{2}$/.test(o.time)) return { erreur: 'creneau_invalide' };

  /* Jamais le jour même ni le passé : la Maison prépare la venue. Jamais
     au-delà de trois mois : un carnet ne se remplit pas à l'aveugle. */
  const jour = new Date(`${o.date}T00:00:00`);
  const aujourdHui = new Date();
  aujourdHui.setHours(0, 0, 0, 0);
  const joursDEcart = Math.round((jour.getTime() - aujourdHui.getTime()) / 86_400_000);
  if (!(joursDEcart >= 1 && joursDEcart <= 90)) return { erreur: 'creneau_hors_fenetre' };

  const [docs, services, categories, blocages, rdvs] = await Promise.all([
    admin.from('documents').select('key, data').in('key', ['mnd_settings', 'mnd_horaires_exceptions', 'mnd_vitrine_config', 'mnd_offers']),
    admin.from('catalog_services').select('id, data'),
    admin.from('catalog_categories').select('id, data'),
    admin.from('blocages').select('id, data'),
    admin.from('appointments').select('id, data').eq('data->>branchId', o.branchId).eq('data->>date', o.date),
  ]);

  const reglages = ((docs.data ?? []) as { key: string; data?: any }[]).find((d) => d.key === 'mnd_settings')?.data ?? {};
  const exceptions = (((docs.data ?? []) as { key: string; data?: any }[]).find((d) => d.key === 'mnd_horaires_exceptions')?.data ?? []) as Exception[];
  const semaine = (Array.isArray(reglages.hours) ? reglages.hours : []) as HeureSemaine[];

  /* Sans horaires en base, on refuse : ouvrir un jour que la Maison ferme
     est pire que de demander un rappel (la leçon du lundi 12 octobre). */
  const fenetre = ouvertureDuJour(o.date, semaine, exceptions);
  if (fenetre.closed) return { erreur: 'creneau_ferme' };

  const catalogue = ((services.data ?? []) as ServiceEnBase[]);
  /* Les offres de la Maison, pour résoudre un code : lues ici, avec le reste,
     pour ne pas rouvrir la base une seconde fois. */
  const offresBrutes = ((docs.data ?? []) as { key: string; data?: any }[]).find((d) => d.key === 'mnd_offers')?.data;
  const offres = (Array.isArray(offresBrutes) ? offresBrutes : []) as any[];
  const connus = o.serviceIds.filter((id) => catalogue.some((s) => s.id === id && s.data?.enabled !== false && !s.data?.archived));
  if (connus.length === 0) return { erreur: 'prestation_inconnue' };

  /* CE QUE LA MAISON A DÉCOCHÉ NE SE RÉSERVE PAS, même par un appel direct. */
  const masques = (((docs.data ?? []) as { key: string; data?: any }[])
    .find((d) => d.key === 'mnd_vitrine_config')?.data?.siteMasques ?? {}) as MasquesDuSite;
  const arbre = ((categories.data ?? []) as { id: string; data?: { parentId?: string } }[])
    .map((c) => ({ id: c.id, parentId: c.data?.parentId }));
  const retiree = connus.some((id) => masquePourLeSite(
    { id, categoryId: catalogue.find((x) => x.id === id)?.data?.categoryId ?? '' }, masques, arbre));
  if (retiree) return { erreur: 'prestation_retiree' };
  const dureeMin = Math.max(60, connus.reduce((s, id) =>
    s + Number(catalogue.find((x) => x.id === id)?.data?.durationMin ?? 60), 0));

  const debut = minutesDeHhmm(o.time);
  if (debut < fenetre.openMin || debut + dureeMin > fenetre.closeMin) return { erreur: 'creneau_hors_ouverture' };

  /* Le maître : celui que l'écran a retenu s'il est de la Maison, sinon le
     premier. Un maître inventé ne doit pas ouvrir un agenda parallèle. */
  const master = o.maitres.includes(o.master) ? o.master : (o.maitres[0] ?? '');

  const poses = ((rdvs.data ?? []) as { id: string; data?: any }[])
    .map((r) => r.data)
    .filter((a) => a && String(a.status ?? '') !== 'annulé' && String(a.time ?? '') !== '');
  const dureeDe = (a: any): number => Math.max(60, (Array.isArray(a.serviceIds) ? a.serviceIds : [])
    .reduce((s: number, id: string) => s + Number(catalogue.find((x) => x.id === id)?.data?.durationMin ?? 60), 0));

  const capMaison = Number(reglages.maxRdvParJourMaison ?? 0);
  const capMaitre = Number(reglages.maxRdvParJourMaitre ?? 0);
  if (capMaison > 0 && poses.length >= capMaison) return { erreur: 'creneau_plafond' };
  const duMaitre = poses.filter((a) => String(a.master ?? '') === master);
  if (capMaitre > 0 && duMaitre.length >= capMaitre) return { erreur: 'creneau_plafond' };

  const murs = ((blocages.data ?? []) as { id: string; data?: any }[])
    .map((b) => b.data)
    .filter((b) => b && b.branchId === o.branchId && b.date === o.date && (!b.master || b.master === master))
    .map((b) => [b.debut?.trim() ? hourToMin(b.debut) : 0, b.fin?.trim() ? hourToMin(b.fin) : 24 * 60] as [number, number])
    .filter(([s, e]) => e > s);

  const occupe: [number, number][] = duMaitre.map((a) => {
    const d = minutesDeHhmm(String(a.time));
    return [d, d + dureeDe(a)];
  });
  const chevauche = [...occupe, ...murs].some(([s, e]) => debut < e && debut + dureeMin > s);
  if (chevauche) return { erreur: 'creneau_pris' };

  return { dureeMin, master, catalogue, offres };
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
  /** Le parrainage : le prénom de la marraine, l'id de sa demande, le cadeau dit. */
  marraine?: string;
  marraineId?: string;
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
   (FORME_DU_CODE, SIGNES_DU_CODE) ; `verifie-le-parrainage` les confronte. */
const SIGNES_DU_CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const FORME_DU_CODE = /^[A-Z]{1,6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/;
const racineDuCode = (prenom: string): string =>
  prenom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'MND';
function codeDeMarraine(prenom: string): string {
  const octets = crypto.getRandomValues(new Uint8Array(3));
  return `${racineDuCode(prenom)}-${[...octets].map((o) => SIGNES_DU_CODE[o % SIGNES_DU_CODE.length]).join('')}`;
}

type ReglageParrainage = { actif?: boolean; cadeauFilleule?: string; cadeauMarraine?: string };
async function reglageDuParrainage(): Promise<ReglageParrainage> {
  const { data } = await admin.from('documents').select('data').eq('key', 'mnd_parrainage').maybeSingle();
  return ((data as { data?: ReglageParrainage } | null)?.data) ?? { actif: true };
}

/** Les huit derniers chiffres : un numéro de fiche s'écrit de dix façons
    (+229, espaces, 01 ou pas), ses huit derniers chiffres ne changent pas. */
const huitDerniers = (t: string): string => String(t ?? '').replace(/\D/g, '').slice(-8);

/** A-T-ELLE DÉJÀ UNE FICHE ? En cas d'erreur de lecture, on la dit nouvelle :
    un cadeau de bienvenue donné à tort se rattrape au comptoir, qui voit la
    fiche ; un cadeau refusé à tort se vit devant elle. */
async function dejaCliente(telephone: string): Promise<boolean> {
  const fin = huitDerniers(telephone);
  if (fin.length < 8) return false;
  const { data, error } = await admin.from('clients').select('id, phone:data->>phone, phone2:data->>phone2');
  if (error) { console.error('demande-submit: fiches illisibles', error.message); return false; }
  return (data ?? []).some((c: { phone?: string; phone2?: string }) => huitDerniers(c.phone ?? '') === fin || huitDerniers(c.phone2 ?? '') === fin);
}

/** LE CODE D'UNE MARRAINE, lu à la réservation quand aucune offre ne le
    reconnaît. Rend `null` si ce n'est pas un code de marraine. */
async function verdictDuParrainage(code: string, telephone: string): Promise<VerdictDuCode | null> {
  if (!FORME_DU_CODE.test(code)) return null;
  const { data: m } = await admin.from('demandes').select('id, data').eq('data->>codeParrain', code).limit(1);
  const marraine = (m ?? [])[0] as { id: string; data: Record<string, unknown> } | undefined;
  if (!marraine) return null;
  const reglage = await reglageDuParrainage();
  if (reglage.actif === false) return { code, raison: 'inconnu' };
  const base = { code, marraine: String(marraine.data.prenom ?? ''), marraineId: marraine.id };
  if (huitDerniers(String(marraine.data.telephone ?? '')) === huitDerniers(telephone)) return { ...base, raison: 'parrainage-soi-meme' };
  const { data: deja } = await admin.from('demandes').select('id')
    .eq('data->>telephone', telephone).eq('data->>codeRaison', 'parrainage').limit(1);
  if ((deja ?? []).length > 0) return { ...base, raison: 'parrainage-deja-utilise' };
  if (await dejaCliente(telephone)) return { ...base, raison: 'parrainage-deja-cliente' };
  return { ...base, raison: 'parrainage', cadeau: texte(reglage.cadeauFilleule, 160) };
}

/** LE MODE `parrainage` : le code de ce numéro, créé s'il le faut. */
async function codePourLaMarraine(body: Record<string, unknown>): Promise<Response> {
  const d = (body.data ?? {}) as Record<string, unknown>;
  if (d.consentement !== true) return json({ error: 'consentement' }, 400);
  const telephone = telephoneNormalise(String(d.telephone ?? ''), String(d.dial ?? '+229'));
  if (!telephone) return json({ error: 'telephone' }, 400);
  const prenom = texte(d.prenom, 60);
  if (!prenom) return json({ error: 'prenom' }, 400);
  const reglage = await reglageDuParrainage();
  if (reglage.actif === false) return json({ error: 'parrainage_ferme' }, 409);
  const cadeaux = { filleule: texte(reglage.cadeauFilleule, 160), marraine: texte(reglage.cadeauMarraine, 160) };

  const { data: siens } = await admin.from('demandes').select('id, data')
    .eq('data->>telephone', telephone).not('data->>codeParrain', 'is', null).limit(1);
  const connu = (siens ?? [])[0] as { data: Record<string, unknown> } | undefined;
  if (connu?.data?.codeParrain) return json({ ok: true, code: connu.data.codeParrain, cadeaux, deja: true });

  let code = '';
  for (let i = 0; i < 6 && !code; i++) {
    const essai = codeDeMarraine(prenom);
    const { data: pris } = await admin.from('demandes').select('id').eq('data->>codeParrain', essai).limit(1);
    if ((pris ?? []).length === 0) code = essai;
  }
  if (!code) return json({ error: 'generation_impossible' }, 500);

  const id = `dem-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const branche = await brancheParDefaut(String(d.branchId ?? ''));
  const demande = {
    id, genre: 'prospect', createdAt: now, branchId: branche.id, prenom, telephone,
    besoin: 'inconnu', profil: 'Marraine', source: 'site', page: texte(d.page, 120) || '/parrainage/',
    codeParrain: code, consentementLe: now, statut: 'nouvelle',
  };
  const { error } = await admin.from('demandes').insert({ id, genre: 'prospect', branch_id: branche.id, data: demande });
  if (error) return json({ error: 'insert_failed' }, 500);
  await alerteLePersonnel('Nouvelle marraine', `${prenom} · code ${code}`, '/trone/#/parrainages').catch(() => 0);
  return json({ ok: true, code, cadeaux });
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

/** « vendredi 20 septembre ». Recopiée de confirmation-rdv. */
const jourEnClair = (iso: string): string => {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
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
async function envoieLAccuse(o: {
  apptId?: string; demandeId: string; branchId: string; prenom: string; telephone: string;
  quand: string; date?: string; time?: string;
}): Promise<string> {
  const WA_TOKEN = Deno.env.get('WA_TOKEN');
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');
  const MODELE_RDV = Deno.env.get('WA_TEMPLATE_ACCUSE') ?? 'demande_recue';
  const MODELE = o.apptId ? MODELE_RDV : (Deno.env.get('WA_TEMPLATE_ACCUSE_SIMPLE') ?? MODELE_RDV);
  if (!WA_TOKEN || !WA_PHONE_ID) return 'sans-cles';
  /* Meta veut le numéro international sans « + » ; le serveur l'a déjà mis
     en E.164 (telephoneNormalise). */
  const tel = o.telephone.replace(/\D/g, '');
  if (!tel) return 'sans-numero';
  const prenom = o.prenom || 'Madame';
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

  const id = `acc-${o.apptId ?? o.demandeId}-whatsapp`;
  const maintenant = new Date().toISOString();
  await admin.from('envois').upsert({
    id,
    branch_id: o.branchId,
    data: {
      id, branchId: o.branchId, type: 'accuse', canal: 'whatsapp',
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
          ? `Bonjour ${prenom}, la Maison MND a bien reçu votre demande de rendez-vous pour ${quand}. Nous vous confirmons très vite, sur ce numéro.`
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
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await allowRate(ipOf(req)))) return json({ error: 'rate_limited' }, 429);

  const corps = await req.text();
  if (corps.length > 5_000) return json({ error: 'too_large' }, 400);
  let body: Record<string, unknown>;
  try { body = JSON.parse(corps); } catch { return json({ error: 'bad_request' }, 400); }

  if (body.parrainage === true) return await codePourLaMarraine(body);

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
  let master = '';
  /* Le code, résolu ICI : le navigateur ne dit que le code. */
  let duCode: VerdictDuCode = { code: '' };
  let nomsDesGestes: string[] = [];
  if (avecPlace) {
    const verdict = await laPlaceTient({
      branchId, maitres: branche.maitres, serviceIds, date, time, master: texte(d.master, 60),
    });
    if ('erreur' in verdict) return json({ error: verdict.erreur }, 409);
    master = verdict.master;
    nomsDesGestes = serviceIds.map((sid: string) => verdict.catalogue.find((x) => x.id === sid)?.data?.name ?? sid);
    duCode = remiseDuCode({ code: d.code, serviceIds, branchId, catalogue: verdict.catalogue, offres: verdict.offres });
    /* Une fois par personne : la remise tombe, la réservation tient. */
    if (duCode.remisesLignes && await codeDejaUtilise(duCode.code, telephone)) {
      duCode = { code: duCode.code, offreId: duCode.offreId, raison: 'deja-utilise' };
    }
    /* Aucune offre ne le connaît : est-ce le code d'une marraine ? */
    if (duCode.raison === 'inconnu') {
      duCode = (await verdictDuParrainage(duCode.code, telephone).catch(() => null)) ?? duCode;
    }
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
    ...(duCode.raison === 'parrainage' ? { parrainDe: duCode.code, marraineId: duCode.marraineId, ...(duCode.cadeau ? { cadeauFilleule: duCode.cadeau } : {}) } : {}),
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

  /* ── LE RENDEZ-VOUS, POSÉ EN ATTENTE ───────────────────────────────
     `clientId` reste VIDE : personne n'a de fiche, et en inventer une à
     chaque dépôt polluerait le carnet. Le Trône la crée quand la Maison
     confirme (« En faire une cliente »), et rattache alors ce rendez-vous.
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
      status: 'en attente',
      source: 'site',
      creeLe: now,
      note,
      /* Le code se compte ; la remise, par ligne, n'existe que si le code a mordu. */
      ...(duCode.code ? { codeOffre: duCode.code } : {}),
      ...(duCode.offreId ? { offreId: duCode.offreId } : {}),
      ...(duCode.raison ? { codeRaison: duCode.raison } : {}),
      ...(duCode.remisesLignes ? { remisesLignes: duCode.remisesLignes } : {}),
    };
    const { error: errRdv } = await admin.from('appointments').insert({ id: candidat, branch_id: branchId, data: appt });
    if (!errRdv) {
      apptId = candidat;
      /* L'USAGE SE POSE ICI, ET NULLE PART AILLEURS : le code n'est consommé
         qu'une fois le rendez-vous réellement inscrit avec sa remise. Un
         rendez-vous que la base refuse ne prend pas la fois de la cliente. */
      const applique = duCode.remisesLignes ? { codeApplique: true } : {};
      await admin.from('demandes').update({ data: { ...demande, apptId, ...applique } }).eq('id', id);
    }
    /* Si l'écriture échoue, la demande vit quand même et la Maison
       rappellera : on ne perd jamais une visiteuse pour une ligne. */
  }

  /* L'ACCUSÉ — pour une place réellement posée, jamais pour une question.
     Un échec ne défait rien : la place est prise, le journal le dira. */
  const accuse = await envoieLAccuse({
    apptId, demandeId: id, branchId, prenom, telephone,
    quand: apptId ? `${jourEnClair(date)} à ${heureLisible(time)}` : quandDeLaDemande(genre, texte(d.profil, 80)),
    ...(apptId ? { date, time } : {}),
  }).catch((e) => { console.error('demande-submit: accusé', String(e)); return 'échec'; });

  const quand = avecPlace ? ` · ${date} à ${time}` : '';
  const sent = await alerteLePersonnel(
    avecPlace ? 'Place demandée depuis le site' : (genre === 'rdv' ? 'Demande de rendez-vous depuis le site' : 'Nouvelle demande depuis le site'),
    `${prenom || 'Une visiteuse'} · ${besoin}${quand}`,
    avecPlace ? '/trone/#/calendrier' : '/trone/#/demandes',
  ).catch(() => 0);
  /* LA RAISON REMONTE À LA PAGE : « déjà utilisé » se dit au clic, pas au
     comptoir. `codeApplique` dit si la remise a réellement porté. */
  return json({
    ok: true, id, apptId, sent, accuse,
    ...(duCode.code ? { code: duCode.code, codeApplique: !!duCode.remisesLignes } : {}),
    ...(duCode.raison ? { codeRaison: duCode.raison } : {}),
    ...(duCode.raison === 'parrainage' ? { marraine: duCode.marraine, cadeau: duCode.cadeau ?? '' } : {}),
  });
});
