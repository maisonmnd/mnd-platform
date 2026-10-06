/* ══ LA RÉSERVATION EN TRENTE SECONDES — 29 septembre 2026 ═══════════════
   « Most of the time clients want a smooth and extremely fast booking
   process, less than 30 seconds. For old and new clients. And for renewal
   appointments even faster » (Yéman), maquette « La réservation en 30
   secondes » validée. Trois questions au plus : quoi, quand, son numéro. La
   Maison choisit qui s'occupe d'elle, jamais la cliente.

   CE FICHIER EST PUR : il ne lit ni magasin ni réseau. Le Trône l'appelle
   pour écrire les formules (useFormulesRapides), le site pour choisir ses
   places, et le harnais `verifie-reservation-express` l'éprouve seul. */

import { memeContenu } from './meme-contenu';

/** UNE FORMULE RAPIDE : un ensemble de gestes que les clientes réservent
    ensemble. Le nom ne s'écrit pas ici : le site le lit dans le catalogue du
    jour, de sorte qu'une prestation renommée se dit sous son nouveau nom. */
export type FormuleRapide = { serviceIds: string[]; venues: number };

/** Le recul : six mois de venues honorées. Assez pour qu'un mois creux ne
    change pas la carte, assez court pour qu'un geste nouveau y entre. */
export const RECUL_DES_FORMULES_JOURS = 183;
/** Deux venues au moins : une combinaison vue une seule fois est un cas, pas
    une habitude. */
export const VENUES_MIN_FORMULE = 2;
/** Le document en garde six ; le site en montre quatre, les premières que
    sa porte propose. */
export const FORMULES_GARDEES = 6;

const cleDe = (ids: readonly string[]): string => [...new Set(ids)].sort().join('|');

const isoMoinsJours = (iso: string, jours: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - jours);
  return d.toISOString().slice(0, 10);
};

/** LES FORMULES DE LA MAISON, tirées de ses venues. L'ordre des gestes est
    celui de la venue la plus récente (lavage avant racines, comme au
    fauteuil) ; les gestes retirés du catalogue font tomber la formule
    entière, plutôt que de proposer une moitié de venue. */
export function formulesDesVenues(
  appts: readonly { date: string; status: string; serviceIds?: readonly string[] }[],
  servicesVivants: ReadonlySet<string>,
  aujourdhui: string,
  garde = FORMULES_GARDEES,
): FormuleRapide[] {
  const depuis = isoMoinsJours(aujourdhui, RECUL_DES_FORMULES_JOURS);
  const parCle = new Map<string, { ids: string[]; venues: number; derniere: string }>();
  for (const a of appts) {
    if (a.status !== 'honoré' || a.date <= depuis || a.date > aujourdhui) continue;
    const ids = [...new Set(a.serviceIds ?? [])];
    if (ids.length === 0 || !ids.every((id) => servicesVivants.has(id))) continue;
    const cle = cleDe(ids);
    const deja = parCle.get(cle);
    if (!deja) parCle.set(cle, { ids, venues: 1, derniere: a.date });
    else {
      deja.venues += 1;
      if (a.date > deja.derniere) { deja.derniere = a.date; deja.ids = ids; }
    }
  }
  return [...parCle.entries()]
    .filter(([, f]) => f.venues >= VENUES_MIN_FORMULE)
    .sort((x, y) => y[1].venues - x[1].venues || (x[0] < y[0] ? -1 : 1))
    .slice(0, garde)
    .map(([, f]) => ({ serviceIds: f.ids, venues: f.venues }));
}

/** Deux listes de formules disent-elles la même chose ? Le Trône n'écrit
    que ce qui change : le document public ne se réécrit pas à chaque
    ouverture. */
export const memesFormules = (a: readonly FormuleRapide[] | undefined, b: readonly FormuleRapide[]): boolean =>
  /* Le contenu, pas l'ordre des champs : le document revient du serveur rangé
     à sa façon, et le comparer par son texte le faisait réécrire à chaque
     ouverture (2 octobre 2026, voir meme-contenu). */
  memeContenu(a ?? [], b);

/** LES PROCHAINES PLACES : les premières heures libres, dans l'ordre du
    temps, DEUX PAR JOUR AU PLUS d'abord (la première du matin, la première
    de l'après-midi quand il y en a une) : six pastilles « Demain » ne
    laissent pas de choix. S'il manque des jours, on complète dans l'ordre.
    La cliente pressée touche la première ; « Un autre jour » ouvre tout. */
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

/* ── CE QUE LE TÉLÉPHONE RETIENT D'ELLE ──────────────────────────────────
   Sur le site, le même appareil la reconnaît : « Bon retour, Awa ». Rien ne
   part au serveur ; « Ce n'est pas moi » l'efface. On ne garde que ce qu'il
   faut pour refaire la même venue, et JAMAIS le maître : c'est la Maison qui
   attribue. */
export const CLE_MEMOIRE_DU_SITE = 'mnd_site_moi';

export type MemoireDuSite = {
  prenom: string;
  numero: string;
  serviceIds: string[];
  calibreId: string;
  besoin: string;
};

/** Lit la mémoire, et la rejette entière si elle a été abîmée : mieux vaut
    reposer trois questions que préremplir un faux numéro. */
export function memoireLue(brut: string | null | undefined): MemoireDuSite | null {
  if (!brut) return null;
  try {
    const m = JSON.parse(brut) as Partial<MemoireDuSite>;
    const numero = String(m.numero ?? '');
    const ids = Array.isArray(m.serviceIds) ? m.serviceIds.filter((x) => typeof x === 'string' && x) : [];
    if (numero.replace(/\D/g, '').length < 8 || ids.length === 0) return null;
    return {
      prenom: String(m.prenom ?? '').slice(0, 60),
      numero: numero.slice(0, 30),
      serviceIds: ids.slice(0, 6),
      calibreId: String(m.calibreId ?? ''),
      besoin: String(m.besoin ?? 'entretien'),
    };
  } catch { return null; }
}

/** Ce qui s'écrit, et seulement cela : pas de maître, pas de code, pas de mot. */
export const memoireAEcrire = (m: MemoireDuSite): string => JSON.stringify({
  prenom: m.prenom.trim().slice(0, 60),
  numero: m.numero.trim().slice(0, 30),
  serviceIds: m.serviceIds.slice(0, 6),
  calibreId: m.calibreId,
  besoin: m.besoin,
});

/* ── LE RENOUVELLEMENT EN UNE TOUCHE ─────────────────────────────────────
   À la caisse, la Maison pose d'office le rendez-vous suivant (poseLaReprise,
   `repriseDe`). Trois jours avant, WhatsApp le propose : « Je confirme » ou
   « Un autre moment ». Ce juge dit lesquels ; `rappels-j1` le RECOPIE (une
   fonction Edge n'importe rien du dépôt) : les deux changent ensemble. */
export const JOURS_AVANT_LA_REPRISE = 3;

export type RepriseProposable = {
  id: string; date: string; status: string; clientId?: string;
  repriseDe?: string; confirmeeParLaClienteLe?: string; autreMomentDemandeLe?: string;
};

/** Les reprises à proposer le jour `dansTroisJours` : posées d'office par la
    Maison, toujours confirmées, rattachées à une fiche, et auxquelles la
    cliente n'a pas encore répondu. Un rendez-vous qu'elle a pris elle-même
    n'est pas une reprise : elle sait déjà qu'elle vient. */
export const reprisesAProposer = <T extends RepriseProposable>(appts: readonly T[], dansTroisJours: string): T[] =>
  appts.filter((a) => a.date === dansTroisJours && a.status === 'confirmé' && !!a.clientId && !!a.repriseDe
    && !a.confirmeeParLaClienteLe && !a.autreMomentDemandeLe);

/** Ce que le bouton porte : « REPRISE_OK:<rdv> » ou « REPRISE_AUTRE:<rdv> ».
    Le webhook le relit ; rien d'autre n'a cette forme. */
export const payloadDeLaReprise = (geste: 'OK' | 'AUTRE', apptId: string): string => `REPRISE_${geste}:${apptId}`;
export const repriseDuPayload = (p: string): { geste: 'OK' | 'AUTRE'; apptId: string } | null => {
  const m = /^REPRISE_(OK|AUTRE):(.+)$/.exec(p);
  return m ? { geste: m[1] as 'OK' | 'AUTRE', apptId: m[2] } : null;
};
