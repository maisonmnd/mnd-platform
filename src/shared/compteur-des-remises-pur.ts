/* LE COMPTEUR DES REMISES · 26 octobre 2026.

   « La seule porte pour tout ce qui baisse un prix, et le seul compte de ce
   que ça rapporte » (spec Assistant Maison, §5.4 et §8 ; maquette validée,
   vue « Offres et remises »). Tout était écrit et rien n'était lu :
   `bilanDesPromos` comptait les codes nominatifs sans dire ce qu'ils avaient
   fait revenir, les offres de saison (ROSE15) se lisaient sur les factures à
   trois graphies, et personne n'additionnait.

   CE FICHIER LIT, IL N'ÉCRIT RIEN. Le registre unique des usages
   (`usages_de_code`, spec §8) n'existe pas encore : le compteur tient sans
   lui, avec ce qui est déjà en base (`codes_promo`, `mnd_offers`, `envois`,
   `invoices`, `appointments`).

   DEUX FAMILLES, DEUX JUGES DE CODE.
   · Les codes NOMINATIFS (`codes_promo` : une tête, un usage) se comparent
     par `normaliseLeCode` (accents, tirets et espaces tombent). Ceux que
     l'Assistant a fabriqués se groupent par préfixe (CREUX15, ANNIV10,
     FLASH22) ; ceux de la direction tiennent sur une seule ligne « Remise à
     son nom », quel que soit le mot choisi.
   · Les codes d'OFFRE (`mnd_offers` : un code partagé, lu par le site et par
     la Caisse) se comparent par `codeNormalise` (seuls les espaces tombent) :
     c'est le juge du site, et NOEL-2026 n'est pas NOEL2026 pour lui.
   Appliquer l'un à la place de l'autre perd des usages en silence ; le banc
   remet la faute pour voir si ça crie.

   CE QUE LES COLONNES VEULENT DIRE (spec §8, table des règles) :
   · envoyés : lignes `envois` PARTIES (lu, remis, en route, à la main) qui
     portent le code ; jamais une ligne encore en salle d'attente ; un code
     de la direction compte pour un message, dit dans la conversation à sa
     fabrication ; « public » pour une offre, qu'on ne compte pas en messages ;
   · utilisés : codes fermés par une pièce (`utiliseLe`) ; pour une offre,
     les pièces et les rendez-vous qui la nomment, UN usage par rendez-vous ;
   · venue gagnée : un rendez-vous POSÉ (`creeLe`) dans les 14 jours après la
     naissance du code, honoré, encaissé ; une par cliente et par fenêtre ; un
     rendez-vous sans `creeLe` ne compte pas, on ne devine pas ;
   · remise réelle : ce que les pièces ont réellement retiré, en francs ;
     jamais un pourcentage sur un prix supposé ;
   · rendement : encaissé ÷ remise réelle.

   LE VERDICT NE PARLE QU'À PARTIR DE 20 ENVOIS (le seuil des prévisions,
   `ENVOIS_POUR_MESURER`) ; avant, il dit « à mesurer · n sur 20 ».

   Pur, éprouvé par `verifie-le-compteur-des-remises` (huit fautes remises). */

import { estExpire, estUtilise, normaliseLeCode, type CodePromo } from './promos';
import { LIBELLE_REMISE_FAMILLE, codeNormalise } from './offres-pur';
import { devenuDe, type EnvoiLu } from './envois';
import { attendEncore } from './salle-des-envois';
import { ENVOIS_POUR_MESURER, JOURS_DE_REPONSE } from './previsions-pur';
import { jourACotonou } from './dernier-message-pur';
import { apptPaidXof, type Appointment } from './agenda';
import type { Invoice } from './finance';
import type { InstantOffer } from './offers';

/** LE `parQui` QUE L'ASSISTANT ÉCRIT sur ses codes aujourd'hui
    (`codeDeLaSituation`, assistant-lecture-pur.ts, et la fonction serveur
    assistant-maison) : « Assistant Maison », spec §11. */
export const AUTEUR_ASSISTANT = 'Assistant Maison';

/** UN CODE DE L'ASSISTANT se reconnaît à sa signature, l'actuelle ou
    l'ancienne : « Gérard » a signé les codes fabriqués avant le 26 octobre
    2026, « Assistant Maison » depuis. Relecture du 27 octobre 2026 : la
    constante seule (« Gérard ») rangeait tout code neuf sur la ligne
    « Remise à son nom · direction » et la tuile des orphelins ne voyait plus
    rien. Même juge que `estLaMainDeLAssistant` (boite-unique-pur.ts). */
export const estUnCodeDeLAssistant = (parQui?: string): boolean => /^(assistant maison|g[ée]rard)$/i.test((parQui ?? '').trim());

/** Les bornes du verdict (spec §8) : utile si un code sur dix sert ET que
    chaque franc remisé en rapporte trois ; à éteindre sous un franc rendu. */
export const TAUX_UTILE = 0.10;
export const RENDEMENT_UTILE = 3;
export const RENDEMENT_A_ETEINDRE = 1;

/** Ce qu'une ligne `envois` doit être devenue pour compter « envoyée ». Le
    « non remis » et l'échec n'ont pas atteint la cliente. */
const PARTIS: ReadonlySet<string> = new Set(['lu', 'remis', 'en-route', 'a-la-main']);

const francs = (n: unknown): number => Math.max(0, Math.round(Number(n) || 0));

/* ── LES SORTES ──────────────────────────────────────────────────────── */

export type SorteDeRemise = 'creux' | 'anniversaire' | 'flash' | 'a-son-nom' | 'saison' | 'parcours';

export const SORTE_DITE: Record<SorteDeRemise, string> = {
  creux: 'jour creux', anniversaire: 'anniversaire', flash: 'offre flash', 'a-son-nom': 'remise à son nom',
  saison: 'offre de saison', parcours: 'offre de parcours',
};

/** LE PRÉFIXE D'UN CODE NOMINATIF : ce qui précède le tiret du suffixe tiré
    au sort (`fabriqueLeCode` écrit « CREUX15-A7K »). Un code sans tiret est
    son propre préfixe. */
export const prefixeDe = (code: string): string => {
  const brut = String(code ?? '');
  return normaliseLeCode(brut.split('-')[0]) || normaliseLeCode(brut);
};

/** LA SORTE D'UN CODE NOMINATIF, et la clé de la ligne qui le compte. Un code
    de la direction (ex-« Promo flash », `PanneauDeLaPromo`) va sur la ligne
    unique « Remise à son nom » : le mot libre qu'elle a choisi (MAMAN, ECLAT)
    ne fait pas une sorte. Un code de l'Assistant se range par préfixe : le
    mot dit la sorte, le pourcentage reste dans la clé, pour qu'un CREUX10 et
    un CREUX15 ne se mélangent pas. */
export function sorteDuCode(c: Pick<CodePromo, 'code' | 'parQui'>): { cle: string; sorte: SorteDeRemise; libelle: string; quoi: string } {
  if (!estUnCodeDeLAssistant(c.parQui)) return { cle: 'nom:a-son-nom', sorte: 'a-son-nom', libelle: 'Remise à son nom', quoi: 'direction' };
  const prefixe = prefixeDe(c.code);
  const mot = prefixe.replace(/[0-9]+$/, '');
  const sorte: SorteDeRemise = mot === 'CREUX' ? 'creux' : mot === 'ANNIV' ? 'anniversaire' : mot.startsWith('FLASH') ? 'flash' : 'a-son-nom';
  return { cle: `nom:${prefixe}`, sorte, libelle: prefixe, quoi: SORTE_DITE[sorte] };
}

/* ── LE LIBELLÉ D'UNE PIÈCE ──────────────────────────────────────────── */

/** LE CODE QUE PORTE UNE PIÈCE, lu dans son libellé de remise. Trois graphies
    se sont succédé à la Caisse : « ROSE15 · 15 % hors gamme, arrondi au
    millier » (depuis le 23 octobre 2026, `libelleDuCode`), « Offre Octobre
    Rose · ROSE15 » (l'offre nommée, le code après le dernier point médian), et
    « Promotion ROSE15 » (les premières pièces). « Remise famille » n'est pas
    un code (`LIBELLE_REMISE_FAMILLE`) : rien n'est rendu. Tout autre libellé
    (« Remise manuelle », un mot libre) ne nomme aucun code : on ne devine pas.
    Le code rendu est brut : c'est l'appelant qui choisit son juge. */
export function codeDuLibelle(libelle: string | undefined): string | null {
  const l = String(libelle ?? '').trim();
  if (!l || l === LIBELLE_REMISE_FAMILLE) return null;
  if (/^Promotion\s+/i.test(l)) return l.replace(/^Promotion\s+/i, '').trim() || null;
  const morceaux = l.split(' · ').map((m) => m.trim()).filter(Boolean);
  if (morceaux.length < 2) return null;
  if (/^Offre\s/i.test(morceaux[0])) return morceaux[morceaux.length - 1];
  return morceaux[0];
}

/* ── CE QUE LE COMPTEUR LIT ──────────────────────────────────────────── */

export type EnvoiDuCompteur = EnvoiLu & { genre?: string; codePromo?: string };
export type PieceLue = Pick<Invoice, 'id' | 'number' | 'date' | 'clientId' | 'apptId' | 'discountLabel' | 'globalDiscountXof' | 'payments' | 'kind' | 'status'>;
export type RdvLu = Pick<Appointment, 'id' | 'clientId' | 'status' | 'creeLe' | 'date' | 'codeOffre' | 'remisesLignes' | 'payments' | 'paidXof'>;
/** Une offre DATÉE (`du`/`au`) est une saison (ROSE15, NOEL) ; une offre sans
    dates est une offre de parcours, permanente sur le site (`vitrine`). Le
    champ `parcours` ne les distingue pas : les saisons le portent aussi. */
export type OffreLue = Pick<InstantOffer, 'id' | 'title' | 'code' | 'discountPct' | 'du' | 'au' | 'active' | 'vitrine'>;
/** `code` et `codeApplique` sont écrits par `demande-submit` sans être
    déclarés sur `Demande` : l'écran les lit par un cast. Ici la demande ne
    sert qu'à dire d'où vient un rendez-vous (le site). */
export type DemandeLue = { apptId?: string; code?: string; codeApplique?: string };

export type SourceDUsage = 'caisse' | 'site' | 'couronne';

export type UsageDUnCode = {
  /** Le jour, à l'heure de Cotonou (AAAA-MM-JJ) : l'écran y met l'année. */
  jour: string;
  /** Le code tel qu'il s'écrit (le code entier pour un nominatif). */
  code: string;
  clientId?: string;
  /** Le numéro de la pièce qui l'a honoré, pour « Ouvrir la pièce ». */
  piece?: string;
  rdvId?: string;
  remiseXof: number;
  source: SourceDUsage;
};

export type EtatDuVerdict = 'a-mesurer' | 'utile' | 'a-eteindre' | 'a-regarder' | 'public';
export type Verdict = { etat: EtatDuVerdict; dit: string };

export type CompteDesCodes = {
  fabriques: number;
  /** Ni utilisés ni périmés à `maintenant`. */
  vivants: number;
  /** Morts sans servir : la part des codes morts se lit sur `fabriques`. */
  perimes: number;
  /** Fenêtres de 14 jours encore ouvertes : leurs venues peuvent arriver. */
  enCours: number;
};

export type LigneDuCompteur = {
  cle: string;
  /** « CREUX15 », « ROSE15 », « Remise à son nom ». */
  libelle: string;
  /** Le titre de l'offre, quand c'en est une. */
  titre?: string;
  /** « jour creux », « offre de saison », « direction ». */
  quoi: string;
  sorte: SorteDeRemise;
  envoyes: number | 'public';
  utilises: number;
  /** utilisés ÷ envoyés ; absent sans envoi compté. */
  taux: number | null;
  venuesGagnees: number;
  remiseReelleXof: number;
  caEncaisseXof: number;
  /** encaissé ÷ remise réelle ; absent quand rien n'a été remisé. */
  rendement: number | null;
  verdict: Verdict;
  /** Du plus récent au plus ancien. */
  usages: UsageDUnCode[];
  /** Les codes nominatifs seuls. */
  codes?: CompteDesCodes;
};

export type TotalDuCompteur = {
  lignes: number; envoyes: number; utilises: number; taux: number | null; venuesGagnees: number;
  remiseReelleXof: number; caEncaisseXof: number; rendement: number | null; fabriques: number; perimes: number;
};

export type CompteDesRemises = {
  /** Les nominatifs d'abord (du plus fabriqué au moins), puis les offres. */
  lignes: LigneDuCompteur[];
  /** La ligne de total des NOMINATIFS : les offres publiques ne s'ajoutent
      pas à des messages comptés. */
  total: TotalDuCompteur;
  /** Les offres publiques, à part. */
  publics: { lignes: number; usages: number; venuesGagnees: number; remiseReelleXof: number; caEncaisseXof: number };
};

export const rendementDe = (remiseXof: number, caXof: number): number | null => (remiseXof > 0 ? caXof / remiseXof : null);

/* ── LE VERDICT ──────────────────────────────────────────────────────── */

/** LE VERDICT D'UN CODE (spec §8). Sous vingt envois il ne juge pas : il dit
    où en est la mesure. Une offre publique ne se juge pas en messages : elle
    dit ses usages. Sans un franc remisé mais avec de l'encaissé, le rendement
    n'a pas de nombre et tient pour acquis. */
export function verdictDuCode(v: { envoyes: number | 'public'; utilises: number; venues: number; remiseXof: number; caXof: number }): Verdict {
  if (v.envoyes === 'public') return { etat: 'public', dit: `${v.utilises} usage${v.utilises > 1 ? 's' : ''}` };
  const envoyes = Math.max(0, Math.round(v.envoyes));
  if (envoyes < ENVOIS_POUR_MESURER) return { etat: 'a-mesurer', dit: `à mesurer · ${envoyes} sur ${ENVOIS_POUR_MESURER}` };
  const taux = v.utilises / envoyes;
  const rendement = rendementDe(v.remiseXof, v.caXof);
  if (v.venues <= 0 || (rendement !== null && rendement < RENDEMENT_A_ETEINDRE)) return { etat: 'a-eteindre', dit: 'à éteindre' };
  if (taux >= TAUX_UTILE && (rendement === null ? v.caXof > 0 : rendement >= RENDEMENT_UTILE)) return { etat: 'utile', dit: 'utile' };
  return { etat: 'a-regarder', dit: 'à regarder' };
}

/* ── LES LIGNES PARTIES ──────────────────────────────────────────────── */

/** LES CODES PARTIS : code normalisé → nombre de lignes `envois` qui le
    portent et sont vraiment parties. Une ligne encore en salle (en attente,
    retenue, en envoi) n'est pas partie, même si `devenuDe` la lit « en route »
    faute d'accusé : c'est `attendEncore` qui le sait. */
function codesPartis(envois: readonly EnvoiDuCompteur[]): Map<string, number> {
  const partis = new Map<string, number>();
  for (const e of envois) {
    const code = normaliseLeCode(e.codePromo);
    if (!code) continue;
    if (attendEncore(e)) continue;
    if (!PARTIS.has(devenuDe(e))) continue;
    partis.set(code, (partis.get(code) ?? 0) + 1);
  }
  return partis;
}

/** LES CODES ORPHELINS : fabriqués par l'Assistant, et aucune ligne `envois`
    portant le code n'est partie. La spec §8 veut que le code naisse au départ
    réel du message ; tant qu'il naît au dépôt, cette liste dit ce qui a été
    promis sans être dit. Cible : zéro. */
export function codesOrphelins(codes: readonly CodePromo[], envois: readonly EnvoiDuCompteur[]): CodePromo[] {
  const partis = codesPartis(envois);
  return codes.filter((c) => estUnCodeDeLAssistant(c.parQui) && !partis.has(normaliseLeCode(c.code)));
}

/* ── LES VENUES GAGNÉES ──────────────────────────────────────────────── */

/** LES VENUES GAGNÉES PAR LES CODES NOMINATIFS : identifiant du code → le
    rendez-vous qu'il a fait prendre. Un rendez-vous compte s'il a été POSÉ
    (`creeLe`) entre la naissance du code et quatorze jours plus tard, pour la
    même tête, puis honoré, puis encaissé. Sans `creeLe` (les rendez-vous
    d'avant le 5 septembre 2026, les rituels saisis après coup), on ne devine
    pas la date de prise : il ne compte pas.

    UNE VENUE PAR CLIENTE ET PAR FENÊTRE : le premier rendez-vous posé dans la
    fenêtre compte, le second est sa cadence ordinaire. UN RENDEZ-VOUS POUR UN
    SEUL CODE : quand deux fenêtres se chevauchent (anniversaire puis jour
    creux), c'est le code né en dernier avant la pose qui l'a fait revenir. */
function venuesDesCodes(codes: readonly CodePromo[], rdvs: readonly RdvLu[]): Map<string, RdvLu> {
  const parCliente = new Map<string, CodePromo[]>();
  for (const c of codes) {
    const l = parCliente.get(c.clientId);
    if (l) l.push(c); else parCliente.set(c.clientId, [c]);
  }
  const gagnees = new Map<string, RdvLu>();
  const poses = rdvs
    .filter((a) => a.status === 'honoré' && apptPaidXof(a) > 0)
    .sort((x, y) => String(x.creeLe ?? '').localeCompare(String(y.creeLe ?? '')));
  for (const a of poses) {
    const pose = Date.parse(a.creeLe ?? '');
    if (!Number.isFinite(pose)) continue;
    const candidats = (parCliente.get(a.clientId) ?? []).filter((c) => {
      if (gagnees.has(c.id)) return false;
      const ne = Date.parse(c.creeLe);
      return Number.isFinite(ne) && pose >= ne && pose <= ne + JOURS_DE_REPONSE * 86_400_000;
    });
    if (candidats.length === 0) continue;
    candidats.sort((x, y) => y.creeLe.localeCompare(x.creeLe));
    gagnees.set(candidats[0].id, a);
  }
  return gagnees;
}

/** D'où vient l'honneur d'un code nominatif. Seule la Caisse ferme un code
    aujourd'hui (`honoreLeCode`, `utilisePar` = la personne) ; Ma Couronne et
    le site se reconnaîtront à leur nom quand ils l'écriront. */
const sourceDeLHonneur = (utilisePar: string | undefined): SourceDUsage => {
  const u = String(utilisePar ?? '');
  if (/couronne/i.test(u)) return 'couronne';
  if (/\bsite\b/i.test(u)) return 'site';
  return 'caisse';
};

const pieceVivante = (p: PieceLue): boolean => p.kind === 'facture' && p.status !== 'brouillon';

const parJourRecent = (a: UsageDUnCode, b: UsageDUnCode): number => b.jour.localeCompare(a.jour);

/* ── LE COMPTE ───────────────────────────────────────────────────────── */

export function compteParCode(o: {
  codes: readonly CodePromo[];
  offres: readonly OffreLue[];
  envois: readonly EnvoiDuCompteur[];
  pieces: readonly PieceLue[];
  rdvs: readonly RdvLu[];
  demandes?: readonly DemandeLue[];
  /** La remise en francs qu'un rendez-vous porte sur ses lignes (le
      catalogue le sait, pas ce fichier). */
  remiseDuRdvXof: (rdvId: string) => number;
  /** L'instant, ISO : pour les codes vivants et les fenêtres ouvertes. */
  maintenant: string;
}): CompteDesRemises {
  const lignes: LigneDuCompteur[] = [];
  const maintenantMs = Date.parse(o.maintenant);

  /* ── Les nominatifs ── */
  const partis = codesPartis(o.envois);
  const venues = venuesDesCodes(o.codes, o.rdvs);
  const groupes = new Map<string, { sorte: ReturnType<typeof sorteDuCode>; codes: CodePromo[] }>();
  for (const c of o.codes) {
    const s = sorteDuCode(c);
    const g = groupes.get(s.cle);
    if (g) g.codes.push(c); else groupes.set(s.cle, { sorte: s, codes: [c] });
  }
  const nominatifs: LigneDuCompteur[] = [];
  for (const [cle, g] of groupes) {
    const direction = g.sorte.sorte === 'a-son-nom' && cle === 'nom:a-son-nom';
    let envoyes = 0; let utilises = 0; let remise = 0; let ca = 0; let venuesGagnees = 0;
    let vivants = 0; let perimes = 0; let enCours = 0;
    const usages: UsageDUnCode[] = [];
    for (const c of g.codes) {
      /* Un code de la direction est dit dans la conversation à sa fabrication :
         il compte pour un message. Un code de l'Assistant compte ses lignes parties. */
      envoyes += direction ? 1 : (partis.get(normaliseLeCode(c.code)) ?? 0);
      if (estUtilise(c)) {
        utilises += 1;
        remise += francs(c.remiseReelleXof);
        usages.push({
          jour: jourACotonou(c.utiliseLe), code: c.code, clientId: c.clientId, piece: c.surPiece || undefined,
          remiseXof: francs(c.remiseReelleXof), source: sourceDeLHonneur(c.utilisePar),
        });
      } else if (estExpire(c, o.maintenant)) perimes += 1;
      else vivants += 1;
      const ne = Date.parse(c.creeLe);
      if (Number.isFinite(ne) && Number.isFinite(maintenantMs) && ne + JOURS_DE_REPONSE * 86_400_000 > maintenantMs) enCours += 1;
      const v = venues.get(c.id);
      if (v) { venuesGagnees += 1; ca += apptPaidXof(v); }
    }
    nominatifs.push({
      cle, libelle: g.sorte.libelle, quoi: g.sorte.quoi, sorte: g.sorte.sorte,
      envoyes, utilises, taux: envoyes > 0 ? utilises / envoyes : null,
      venuesGagnees, remiseReelleXof: remise, caEncaisseXof: ca, rendement: rendementDe(remise, ca),
      verdict: verdictDuCode({ envoyes, utilises, venues: venuesGagnees, remiseXof: remise, caXof: ca }),
      usages: usages.sort(parJourRecent),
      codes: { fabriques: g.codes.length, vivants, perimes, enCours },
    });
  }
  nominatifs.sort((x, y) => (y.codes?.fabriques ?? 0) - (x.codes?.fabriques ?? 0) || x.cle.localeCompare(y.cle));
  lignes.push(...nominatifs);

  /* ── Les offres publiques ── */
  const rdvParId = new Map(o.rdvs.map((a) => [a.id, a] as const));
  const rdvDuSite = new Set((o.demandes ?? []).map((d) => d.apptId).filter((id): id is string => !!id));
  /* Toute pièce vivante par rendez-vous : elle donne le numéro et le jour,
     jamais la remise du code si elle ne le nomme pas. */
  const piecesDuRdv = new Map<string, PieceLue>();
  for (const p of o.pieces) if (pieceVivante(p) && p.apptId && !piecesDuRdv.has(p.apptId)) piecesDuRdv.set(p.apptId, p);
  const publics = { lignes: 0, usages: 0, venuesGagnees: 0, remiseReelleXof: 0, caEncaisseXof: 0 };

  for (const offre of o.offres) {
    const cle = codeNormalise(offre.code);
    if (!cle) continue;
    const entrees = new Map<string, { usage: UsageDUnCode; piece?: PieceLue; rdv?: RdvLu }>();
    /* Les pièces qui NOMMENT le code : leur remise est celle du code. Une
       pièce et un rendez-vous pour la même venue ne font qu'un usage. */
    for (const p of o.pieces) {
      if (!pieceVivante(p)) continue;
      if (codeNormalise(codeDuLibelle(p.discountLabel) ?? '') !== cle) continue;
      const cleU = p.apptId ? `rdv:${p.apptId}` : `piece:${p.id}`;
      entrees.set(cleU, {
        usage: { jour: p.date, code: offre.code ?? '', clientId: p.clientId || undefined, piece: p.number, rdvId: p.apptId, remiseXof: francs(p.globalDiscountXof), source: 'caisse' },
        piece: p, rdv: p.apptId ? rdvParId.get(p.apptId) : undefined,
      });
    }
    /* Les rendez-vous réservés avec le code (`codeOffre`, écrit par le site).
       Leur pièce, si elle existe, peut dire « Remise famille » (compte
       famille) ou rien du tout : sa remise n'est pas celle du code. Ce que le
       code a retiré vit sur les lignes du rendez-vous (`remiseDuRdvXof`). */
    for (const a of o.rdvs) {
      if (!a.codeOffre || codeNormalise(a.codeOffre) !== cle) continue;
      const cleU = `rdv:${a.id}`;
      if (entrees.has(cleU)) continue;
      const pr = piecesDuRdv.get(a.id);
      entrees.set(cleU, {
        usage: {
          jour: a.date, code: offre.code ?? '', clientId: a.clientId, piece: pr?.number, rdvId: a.id,
          remiseXof: o.remiseDuRdvXof(a.id),
          source: rdvDuSite.has(a.id) ? 'site' : 'couronne',
        },
        piece: pr, rdv: a,
      });
    }
    /* Une venue : le rendez-vous honoré et encaissé ; une pièce sans
       rendez-vous (la cliente de passage) compte ses versements. */
    let venuesGagnees = 0; let remise = 0; let ca = 0;
    for (const e of entrees.values()) {
      remise += e.usage.remiseXof;
      if (e.rdv) {
        const paye = apptPaidXof(e.rdv);
        if (e.rdv.status === 'honoré' && paye > 0) { venuesGagnees += 1; ca += paye; }
      } else if (e.piece) {
        const paye = (e.piece.payments ?? []).reduce((s, p) => s + francs(p.amountXof), 0);
        if (paye > 0) { venuesGagnees += 1; ca += paye; }
      }
    }
    const usages = [...entrees.values()].map((e) => e.usage).sort(parJourRecent);
    const sorte: SorteDeRemise = offre.du || offre.au ? 'saison' : 'parcours';
    lignes.push({
      cle: `offre:${offre.id}`, libelle: offre.code ?? '', titre: offre.title, quoi: SORTE_DITE[sorte], sorte,
      envoyes: 'public', utilises: usages.length, taux: null,
      venuesGagnees, remiseReelleXof: remise, caEncaisseXof: ca, rendement: rendementDe(remise, ca),
      verdict: verdictDuCode({ envoyes: 'public', utilises: usages.length, venues: venuesGagnees, remiseXof: remise, caXof: ca }),
      usages,
    });
    publics.lignes += 1; publics.usages += usages.length; publics.venuesGagnees += venuesGagnees;
    publics.remiseReelleXof += remise; publics.caEncaisseXof += ca;
  }

  /* ── Le total des nominatifs ── */
  const total: TotalDuCompteur = { lignes: 0, envoyes: 0, utilises: 0, taux: null, venuesGagnees: 0, remiseReelleXof: 0, caEncaisseXof: 0, rendement: null, fabriques: 0, perimes: 0 };
  for (const l of nominatifs) {
    total.lignes += 1;
    total.envoyes += typeof l.envoyes === 'number' ? l.envoyes : 0;
    total.utilises += l.utilises;
    total.venuesGagnees += l.venuesGagnees;
    total.remiseReelleXof += l.remiseReelleXof;
    total.caEncaisseXof += l.caEncaisseXof;
    total.fabriques += l.codes?.fabriques ?? 0;
    total.perimes += l.codes?.perimes ?? 0;
  }
  total.taux = total.envoyes > 0 ? total.utilises / total.envoyes : null;
  total.rendement = rendementDe(total.remiseReelleXof, total.caEncaisseXof);

  return { lignes, total, publics };
}
