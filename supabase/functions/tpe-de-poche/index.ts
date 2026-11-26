// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ══ tpe-de-poche — LE TÉLÉPHONE D'UNE EMPLOYÉE DEVIENT UN TPE ═══════════
   25 novembre 2026. « Create a terminal of payment for the Trône, a TPE, and
   I can give the access to certain employees to activate it on their phone
   and collect payment from customers » (Yéman). Maquette
   RsVNQvgB85ZvDVjaKuMrqP ; lot 1 lancé au sélecteur.

   LA DIRECTION (sa session, `est_direction`, ou la clé de service pour un
   essai de la mise en ligne) :
     autoriser — « Peut encaisser », oui ou non, pour un membre de l'équipe ;
                 non coupe aussi son téléphone.
     preparer  — un code d'activation de huit signes, valable dix minutes,
                 rendu UNE fois en clair (le Trône le montre en QR) ; la table
                 n'en garde que l'empreinte.
     couper    — le téléphone s'arrête à l'instant ; « preparer » le rouvre.

   LE TÉLÉPHONE (aucun compte : son jeton d'appareil, gardé ici en empreinte) :
     activer   — le code contre un jeton neuf. Un nouveau téléphone remplace
                 l'ancien, qui s'éteint.
     jour      — les rendez-vous du jour de sa branche : l'heure, le prénom, la
                 prestation en clair, ce qui reste sur la pièce. Ni numéro, ni
                 nom de famille.
     ouvrir    — un rendez-vous du jour qui a sa pièce et doit encore : son
                 lien de règlement (posé s'il manque) et la marque du TPE
                 (`lienDeReglement.tpe`, qui, quand, et le montant d'alors).
                 Le téléphone ouvre alors la page « Régler » en mode TPE.

   LE LOT 2 (26 novembre 2026, « construis le lot 2 de la TPE », Yéman) :
     · les PLAFONDS (300 000 F par paiement, 1 000 000 F par jour et par
       TPE) se jugent à `ouvrir` et à `especes` ; au-delà, le comptoir ;
     · `especes` (le téléphone) — l'employée DÉCLARE les billets reçus pour
       une séance, si la direction lui a ouvert les espèces : une ligne de
       `tpe_especes` « à remettre » (0247). Rien ne s'inscrit sur la pièce ;
     · `especes-permises` (la direction) — ouvrir ou fermer les espèces à
       un membre ; `especes-traitees` — « reçue » (la direction vient de
       l'encaisser au Trône, par son écran habituel) ou « refusee » ;
     · `jour` rend en plus le total du soir du TPE et ce qui reste de son
       plafond du jour.

   AUCUN ARGENT NE BOUGE ICI. La page « Régler » encaisse ; l'argent ne
   s'écrit qu'à la confirmation de KkiaPay (`regler-la-seance`) ou de MTN
   (`collecte-mtn`), sur les comptes de la Maison, comme avant.

   Verify JWT : ÉTEINT (le téléphone n'a pas de compte ; la porte est jugée
   ici). Secrets : aucun à poser (SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_KEY
   ou CLE_SERVICE, déjà sur le projet). Table : 0246.

   Déploiement : `node scripts/mise-en-ligne.mjs fonction tpe-de-poche
   --commit <sha> --jwt non`. Vérifier : un GET rend sa version. */

const VERSION = '2026-11-26-a · le TPE de poche, lot 2 : les plafonds, les especes declarees, le total du soir';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const ANON = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
const SERVICE = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify({ version: VERSION, ...(corps as object) }), { status, headers: { ...CORS, 'content-type': 'application/json' } });

/* ⟨tpe-de-poche⟩ */
/** L'alphabet des codes d'activation : sans 0, o, 1, i ni l (lus à voix haute). */
export const ALPHABET_DU_TPE = '23456789abcdefghjkmnpqrstuvwxyz';
/** Huit signes : 31⁸ ≈ 8,5 × 10¹¹ codes, pour dix minutes de vie. */
export const LONGUEUR_DU_CODE_DU_TPE = 8;
/** Un code d'activation vit dix minutes. */
export const DUREE_DU_CODE_DU_TPE_MS = 10 * 60_000;
/** Cotonou : UTC+1 toute l'année. */
export const DECALAGE_DU_TPE_MS = 3_600_000;
/** Le téléphone se verrouille après deux minutes sans un toucher. */
export const VERROU_DU_TPE_MS = 2 * 60_000;

/** Le code tel qu'on l'a tapé ou scanné : minuscules, sans espace ni tiret. */
export const codeDuTpePropre = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[\s-]+/g, '');

/** Un code bien formé : huit signes de l'alphabet. */
export const estUnCodeDuTpe = (s: unknown): boolean =>
  typeof s === 'string' && s.length === LONGUEUR_DU_CODE_DU_TPE && [...s].every((c) => ALPHABET_DU_TPE.includes(c));

/** Le code dit à l'écran : « 4k7m-9q2x ». */
export const codeDuTpeDit = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Un code tiré de huit nombres aléatoires (crypto.getRandomValues). */
export function tireUnCodeDuTpe(aleas: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < LONGUEUR_DU_CODE_DU_TPE; i++) s += ALPHABET_DU_TPE[(Number(aleas[i]) >>> 0) % ALPHABET_DU_TPE.length];
  return s;
}

/** Le jeton d'un téléphone : 32 octets en base64url, 43 signes. */
export const estUnJetonDAppareil = (s: unknown): boolean => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);

/** Le jour de Cotonou d'un instant : « 2026-11-25 ». */
export const jourDuTpe = (ms: number): string => new Date(ms + DECALAGE_DU_TPE_MS).toISOString().slice(0, 10);

/** La clé d'une ligne : une branche, un membre de l'équipe. */
export const idDuTpe = (branchId: string, membreId: string): string => `${branchId}:${membreId}`;

/** Le nom d'un téléphone, tel qu'il se présente, court et sans balise. */
export const nomDAppareil = (s: unknown): string => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

/** La ligne de la table `tpe_de_poche`, telle que la base la rend. */
export type LigneDuTpe = {
  id: string; branch_id: string; membre_id: string; nom: string; autorise: boolean;
  appareil_empreinte?: string | null; appareil_nom?: string | null; active_le?: string | null; coupe_le?: string | null;
  activation_empreinte?: string | null; activation_expire_le?: string | null; derniere_vue_le?: string | null;
  /** Le lot 2 : la direction lui ouvre les espèces (fermées par défaut). */
  especes?: boolean | null;
};

/** Où en est le TPE d'un membre :
    `sans` (pas autorisé), `pret` (autorisé, aucun téléphone), `code` (un code
    attend d'être scanné), `actif` (un téléphone encaisse), `coupe` (la
    direction l'a arrêté ; « Activer » le rouvre). */
export type EtatDuTpe = 'sans' | 'pret' | 'code' | 'actif' | 'coupe';
export function etatDuTpe(l: Pick<LigneDuTpe, 'autorise' | 'appareil_empreinte' | 'activation_empreinte' | 'activation_expire_le' | 'coupe_le'> | null | undefined, maintenantMs: number): EtatDuTpe {
  if (!l || !l.autorise) return 'sans';
  if (l.appareil_empreinte) return 'actif';
  if (l.activation_empreinte && Date.parse(String(l.activation_expire_le ?? '')) > maintenantMs) return 'code';
  if (l.coupe_le) return 'coupe';
  return 'pret';
}

/** Un code d'activation encore bon pour cette ligne. */
export const codeEncoreBon = (l: Pick<LigneDuTpe, 'autorise' | 'activation_expire_le'> | null | undefined, maintenantMs: number): boolean =>
  !!l && l.autorise === true && Date.parse(String(l.activation_expire_le ?? '')) > maintenantMs;

/** La marque qu'un TPE pose sur le lien de règlement du rendez-vous qu'il
    ouvre : qui, et quand. Le Trône en tire son journal du jour. */
export type MarqueDuTpe = { nom: string; membreId: string; le: string; /** Le reste à l'ouverture : le plafond du jour s'y lit (lot 2). */ montantXof?: number };

/** Le rendez-vous tel que le TPE le lit. */
export type RdvDuTpe = {
  id: string; date?: string; time?: string; status?: string; clientId?: string; clientName?: string;
  serviceIds?: string[];
  lienDeReglement?: { jeton?: string; payeLe?: string; tpe?: MarqueDuTpe } | null;
  payments?: { amountXof?: number }[];
};

/** Les rendez-vous d'un jour qu'un TPE montre : ce jour-là, jamais un
    annulé, dans l'ordre de l'heure. */
export function rdvsDuJourAuTpe<R extends RdvDuTpe>(rdvs: readonly R[], jour: string): R[] {
  return rdvs
    .filter((r) => r && String(r.date ?? '').slice(0, 10) === jour && r.status !== 'annulé')
    .sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')) || String(a.id).localeCompare(String(b.id)));
}

/** Ce qu'un rendez-vous permet au TPE : encaisser (il a sa pièce et doit
    encore), rien (réglé), attendre que le Trône termine la séance, ou
    rien encore (des espèces sont déclarées, à remettre le soir). */
export type EtatAuTpe = 'a-encaisser' | 'reglee' | 'pas-terminee' | 'especes';
export function etatAuTpe(aUnePiece: boolean, resteXof: number | null, especesDeclarees = false): EtatAuTpe {
  if (!aUnePiece) return 'pas-terminee';
  if (especesDeclarees) return 'especes';
  return resteXof !== null && resteXof <= 0 ? 'reglee' : 'a-encaisser';
}

/** Ce que le téléphone reçoit d'un rendez-vous : rien d'autre que ce qu'il
    affiche. Ni numéro, ni nom de famille. */
export type LigneDuJourAuTpe = {
  id: string; heure: string; prenom: string; prestations: string; etat: EtatAuTpe; resteXof: number | null; essai: boolean;
};

/** Le téléphone se verrouille-t-il ? Deux minutes sans un toucher. */
export const tpeAVerrouiller = (dernierToucherMs: number, maintenantMs: number): boolean =>
  !(dernierToucherMs > 0) || maintenantMs - dernierToucherMs >= VERROU_DU_TPE_MS;

/** Un code à quatre chiffres. */
export const estUnCodeSecretDuTpe = (s: unknown): boolean => typeof s === 'string' && /^\d{4}$/.test(s);

/* ── LE LOT 2 (26 novembre 2026, « construis le lot 2 de la TPE », Yéman) ──
   Les plafonds et les espèces de la maquette, retenus tels qu'elle les
   proposait. L'attribution sur le paiement lui-même et « Autre montant »
   suivent (2b) : ils touchent aux fonctions qui inscrivent l'argent. */

/** Les plafonds : un paiement, et une journée, par TPE. Au-delà, la séance se
    règle au comptoir. */
export const PLAFOND_PAR_PAIEMENT_XOF = 300_000;
export const PLAFOND_PAR_JOUR_XOF = 1_000_000;

/** Ce qu'un TPE a engagé aujourd'hui. Une séance compte UNE fois, au plus
    haut de ses montants (rouverte, ou ouverte puis payée en espèces), et
    une séance ouverte mais pas encore payée compte déjà : le plafond se juge
    à l'ouverture, jamais après coup. */
export type EngagementDuTpe = { rdvId: string; montantXof: number };
export function engageDuJour(engagements: readonly EngagementDuTpe[], saufRdvId = ''): number {
  const parRdv = new Map<string, number>();
  for (const e of engagements) {
    if (!e || !e.rdvId || e.rdvId === saufRdvId) continue;
    const m = Math.max(0, Math.round(Number(e.montantXof) || 0));
    parRdv.set(e.rdvId, Math.max(parRdv.get(e.rdvId) ?? 0, m));
  }
  let total = 0;
  for (const m of parRdv.values()) total += m;
  return total;
}

/** Ce montant peut-il s'encaisser sur ce TPE ? */
export type VerdictDuPlafond = { ok: true } | { ok: false; raison: 'plafond-paiement' | 'plafond-jour'; resteDuJourXof: number };
export function plafondDuTpe(montantXof: number, dejaEngageXof: number): VerdictDuPlafond {
  const m = Math.max(0, Math.round(Number(montantXof) || 0));
  const deja = Math.max(0, Math.round(Number(dejaEngageXof) || 0));
  const resteDuJourXof = Math.max(0, PLAFOND_PAR_JOUR_XOF - deja);
  if (m > PLAFOND_PAR_PAIEMENT_XOF) return { ok: false, raison: 'plafond-paiement', resteDuJourXof };
  if (m > resteDuJourXof) return { ok: false, raison: 'plafond-jour', resteDuJourXof };
  return { ok: true };
}

/** LES ESPÈCES. Fermées par défaut, ouvertes par la direction, membre par
    membre. L'employée DÉCLARE les billets reçus pour une séance : ce n'est
    pas encore l'argent de la Maison, rien ne s'inscrit sur la pièce. Elle
    les remet le soir ; la direction les reçoit au Trône et les encaisse par
    son écran d'encaissement habituel (« Reçu »), ou dit « Pas reçu ». */
export type StatutDesEspeces = 'a-remettre' | 'recue' | 'refusee';
export type LigneDesEspeces = {
  id: string; branch_id: string; membre_id: string; nom: string; rdv_id: string; piece_id: string; montant_xof: number;
  prenom?: string | null; prestations?: string | null; declare_le: string; statut: StatutDesEspeces;
  traite_le?: string | null; traite_par?: string | null; encaissement_id?: string | null;
};
/** L'identifiant d'une déclaration : la séance, et l'instant. */
export const idDesEspeces = (rdvId: string, ms: number): string => `esp-${rdvId}-${Math.max(0, Math.floor(ms)).toString(36)}`;
/** Un statut que la direction peut donner : reçue, ou refusée. */
export const estUnStatutTraite = (s: unknown): s is 'recue' | 'refusee' => s === 'recue' || s === 'refusee';

/** Les espèces déclarées aujourd'hui par un TPE, pas refusées, en engagements. */
export function engagementsDesEspeces(lignes: readonly Pick<LigneDesEspeces, 'rdv_id' | 'montant_xof' | 'membre_id' | 'declare_le' | 'statut'>[], membreId: string, jour: string): EngagementDuTpe[] {
  return lignes
    .filter((l) => l && l.membre_id === membreId && l.statut !== 'refusee' && jourDuTpe(Date.parse(l.declare_le)) === jour)
    .map((l) => ({ rdvId: l.rdv_id, montantXof: l.montant_xof }));
}

/** Les séances qu'un TPE a ouvertes aujourd'hui, en engagements (au montant de leur ouverture). */
export function engagementsDesOuvertures(rdvs: readonly RdvDuTpe[], membreId: string, jour: string): EngagementDuTpe[] {
  return rdvs
    .filter((r) => r?.lienDeReglement?.tpe?.membreId === membreId && jourDuTpe(Date.parse(String(r.lienDeReglement.tpe.le))) === jour)
    .map((r) => ({ rdvId: r.id, montantXof: Number(r.lienDeReglement?.tpe?.montantXof) || 0 }));
}

/** LE TOTAL DU SOIR d'un TPE : ce que KkiaPay ou MTN ont confirmé sur les
    séances qu'il a ouvertes (le dernier paiement, venu après l'ouverture), et
    les espèces déclarées (à remettre ou reçues). */
export type TotalDuSoir = { encaisseXof: number; especesXof: number; especesARemettreXof: number; seances: number };
export function totalDuSoir(
  rdvs: readonly RdvDuTpe[],
  especes: readonly Pick<LigneDesEspeces, 'montant_xof' | 'membre_id' | 'declare_le' | 'statut'>[],
  membreId: string, jour: string,
): TotalDuSoir {
  let encaisseXof = 0; let especesXof = 0; let especesARemettreXof = 0; let seances = 0;
  for (const r of rdvs) {
    const t = r?.lienDeReglement?.tpe;
    if (!t || t.membreId !== membreId || jourDuTpe(Date.parse(String(t.le))) !== jour) continue;
    const paye = r.lienDeReglement?.payeLe;
    if (!paye || Date.parse(paye) < Date.parse(t.le) - 60_000) continue;
    const liste = Array.isArray(r.payments) ? r.payments : [];
    const dernier = liste[liste.length - 1];
    encaisseXof += Math.max(0, Math.round(Number(dernier?.amountXof) || 0));
    seances += 1;
  }
  for (const e of especes) {
    if (!e || e.membre_id !== membreId || e.statut === 'refusee' || jourDuTpe(Date.parse(e.declare_le)) !== jour) continue;
    const m = Math.max(0, Math.round(Number(e.montant_xof) || 0));
    especesXof += m;
    if (e.statut === 'a-remettre') especesARemettreXof += m;
    seances += 1;
  }
  return { encaisseXof, especesXof, especesARemettreXof, seances };
}
/* ⟨/tpe-de-poche⟩ */

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

/* Ce que ⟨reste-du-rdv⟩ lit autour de lui (terminer-et-regler-pur.ts). */
type PorteDeLaFin = string;
type MarqueDeLaFin = { le: string; par: PorteDeLaFin; pieceLe?: string };
type MarqueDeLHonneur = { le: string; suitesLe?: string };
const DECALAGE_DE_LA_FIN_MS = 3_600_000;

/* ⟨reste-du-rdv⟩ */
/* CE QUE LE RENDEZ-VOUS ET SA PIÈCE DISENT DE L'ARGENT. Sorti de
   ⟨terminer-et-regler⟩ le 7 novembre 2026, mot pour mot, pour servir aussi à
   ⟨regler-avant-apres⟩ : régler d'avance ou après coup se juge sur le même
   reste que la porte de la fin. Recopié dans terminer-et-regler et dans
   regler-la-seance. */

/** Le rendez-vous tel que la règle le lit. */
export type RdvDeLaFin = {
  id: string; date?: string; time?: string; status?: string; clientId?: string; numeroAPrevenir?: string;
  priceXof?: unknown; seriesIndex?: number; forfait?: { totalXof?: number } | null;
  discountPct?: number; discountXof?: number;
  payments?: { amountXof?: number }[]; paidXof?: number;
  depositXof?: number; depositConfirmed?: boolean; coveredBySub?: boolean;
  termineParElle?: MarqueDeLaFin | null; honoreAuReglement?: MarqueDeLHonneur | null;
  lienDeReglement?: { jeton?: string; creeLe?: string } | null;
  lienDuFoyer?: { jeton?: string; apptIds?: string[]; creeLe?: string } | null;
  /** Elle n'est pas venue (le Trône le marque) : rien ne se règle après coup. */
  absente?: unknown;
};

/** L'instant du rituel, à l'heure de Cotonou ; NaN si la date ou l'heure ne se lisent pas. */
export function instantDuRituel(date: unknown, time: unknown): number {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''));
  const h = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  if (!d || !h) return NaN;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(h[1]), Number(h[2])) - DECALAGE_DE_LA_FIN_MS;
}

/** Le prix net d'un rendez-vous au prix FIGÉ, la lecture d'`apptNetXof` :
    séance de suite à zéro, forfait, prix moins la remise du rendez-vous.
    Sans prix figé : `undefined`. Le serveur ne devine pas le tarif d'une tête. */
export function prixFigeDeLaFin(a: Pick<RdvDeLaFin, 'priceXof' | 'seriesIndex' | 'forfait' | 'discountPct' | 'discountXof'>): number | undefined {
  if (a.seriesIndex && a.seriesIndex > 1) return 0;
  if (a.forfait) return Math.max(0, Math.round(Number(a.forfait.totalXof) || 0));
  if (typeof a.priceXof !== 'number' || !Number.isFinite(a.priceXof)) return undefined;
  return Math.max(0, Math.round(a.priceXof * (1 - (Number(a.discountPct) || 0) / 100)) - (Number(a.discountXof) || 0));
}

/** L'argent déjà reçu sur le rendez-vous : le journal des versements, sinon
    `paidXof`, et l'acompte seulement s'il est reconnu reçu. */
export const argentRecuDeLaFin = (a: Pick<RdvDeLaFin, 'payments' | 'paidXof' | 'depositXof' | 'depositConfirmed'>): number =>
  (a.payments && a.payments.length > 0 ? a.payments.reduce((s, p) => s + (Number(p.amountXof) || 0), 0) : Number(a.paidXof) || 0)
  + (a.depositConfirmed ? Math.max(0, Number(a.depositXof) || 0) : 0);

/** L'ACOMPTE DEMANDÉ QUE LA MAISON N'A PAS ENCORE VÉRIFIÉ (relecture du 6
    novembre 2026) : son montant, ou zéro. Tant que l'équipe ne l'a pas
    reconnu reçu, le serveur ne sait pas ce qu'elle doit vraiment (elle l'a
    peut-être versé) : la porte reste fermée, son règlement se fait au
    comptoir, et le personnel l'apprend. */
export const acompteAVerifier = (r: Pick<RdvDeLaFin, 'depositXof' | 'depositConfirmed'> | null): number =>
  (r && !r.depositConfirmed ? Math.max(0, Math.round(Number(r.depositXof) || 0)) : 0);

/** Ce qui reste dû, quand le prix est figé ; null sinon. */
export function resteConnuDeLaFin(a: RdvDeLaFin): number | null {
  const prix = prixFigeDeLaFin(a);
  return prix === undefined ? null : Math.max(0, prix - argentRecuDeLaFin(a));
}

/* LA PIÈCE, telle que la fonction la relit : les calculs de finance.ts, que
   regler-la-seance-pur.ts porte déjà (le banc les rejoue côte à côte). */
export type PieceDeLaFin = {
  id: string; kind?: string; status?: string; date?: string; apptId?: string;
  lines?: { qty?: number; unitXof?: number; discountPct?: number; discountXof?: number }[];
  globalDiscountPct?: number; globalDiscountXof?: number; payments?: { amountXof?: number }[];
};
const nombreDeLaFin = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);
export function resteDeLaPieceDeLaFin(p: PieceDeLaFin): number {
  const sous = (p.lines ?? []).reduce((s, l) => s + Math.max(0, nombreDeLaFin(l.qty) * nombreDeLaFin(l.unitXof) * (1 - nombreDeLaFin(l.discountPct) / 100) - nombreDeLaFin(l.discountXof)), 0);
  const total = Math.max(0, Math.round(sous * (1 - nombreDeLaFin(p.globalDiscountPct) / 100)) - nombreDeLaFin(p.globalDiscountXof));
  const regle = p.payments && p.payments.length > 0 ? p.payments.reduce((s, v) => s + nombreDeLaFin(v.amountXof), 0) : p.status === 'payée' ? total : 0;
  return Math.max(0, total - regle);
}
/** La pièce du rendez-vous : une facture qui porte son identifiant, jamais
    annulée ; celle qui doit encore d'abord, puis la plus récente. */
export function pieceDuRdvDeLaFin<P extends PieceDeLaFin>(pieces: readonly P[], rdvId: string): P | null {
  const siennes = pieces.filter((p) => p && p.apptId === rdvId && (p.kind ?? 'facture') === 'facture' && p.status !== 'annulée');
  if (!siennes.length) return null;
  return [...siennes].sort((a, b) => (resteDeLaPieceDeLaFin(b) > 0 ? 1 : 0) - (resteDeLaPieceDeLaFin(a) > 0 ? 1 : 0) || String(b.date ?? '').localeCompare(String(a.date ?? '')))[0];
}
/* ⟨/reste-du-rdv⟩ */

/* LE JETON DU LIEN DE RÈGLEMENT, celui de regler-la-seance-pur.ts : quatorze
   signes du même alphabet. Le TPE en pose un quand le rendez-vous n'en porte
   pas, exactement comme le Trône. */
const ALPHABET_DU_LIEN = '23456789abcdefghjkmnpqrstuvwxyz';
const LONGUEUR_DU_LIEN = 14;
const estUnJetonDuLien = (s: unknown): s is string =>
  typeof s === 'string' && s.length === LONGUEUR_DU_LIEN && [...s].every((c) => ALPHABET_DU_LIEN.includes(c));
function jetonDuLienNeuf(): string {
  const a = crypto.getRandomValues(new Uint32Array(LONGUEUR_DU_LIEN));
  let s = '';
  for (let i = 0; i < LONGUEUR_DU_LIEN; i++) s += ALPHABET_DU_LIEN[a[i] % ALPHABET_DU_LIEN.length];
  return s;
}

/* ── Les empreintes et les jetons ── */
async function empreinte(texte: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((o) => o.toString(16).padStart(2, '0')).join('');
}
function jetonDAppareilNeuf(): string {
  const o = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const idPropre = (s: unknown): string | null => {
  const t = String(s ?? '').trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(t) ? t : null;
};
const nomPropre = (s: unknown): string => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

/* ── LA PORTE DE LA DIRECTION ── */
const memeCle = (a: string, b: string): boolean => {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
async function laDirection(req: Request): Promise<string | null> {
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return null;
  const cles = [Deno.env.get('CLE_SERVICE'), Deno.env.get('SERVICE_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .map((c) => String(c ?? '').trim()).filter(Boolean);
  if (cles.some((c) => memeCle(bearer, c))) return 'service';
  if (!ANON) return null;
  const commeAppelant = createClient(SUPABASE_URL, ANON, { global: { headers: { authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } });
  const { data: direction, error } = await commeAppelant.rpc('est_direction');
  if (error || direction !== true) return null;
  const { data: qui } = await commeAppelant.auth.getUser();
  return qui?.user?.id ?? 'direction';
}

async function laLigne(id: string): Promise<LigneDuTpe | null> {
  const { data, error } = await admin.from('tpe_de_poche').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LigneDuTpe | null) ?? null;
}

async function autoriser(b: any, qui: string) {
  const branchId = idPropre(b.branchId); const membreId = idPropre(b.membreId); const nom = nomPropre(b.nom);
  if (!branchId || !membreId || !nom) return json({ ok: false, raison: 'mal-forme' }, 400);
  const oui = b.autorise === true;
  const id = idDuTpe(branchId, membreId);
  const avant = await laLigne(id);
  const maintenant = new Date().toISOString();
  const ligne: Record<string, unknown> = { id, branch_id: branchId, membre_id: membreId, nom, autorise: oui, modifie_le: maintenant, modifie_par: qui };
  /* Non : le téléphone s'arrête, le code en attente s'efface. */
  if (!oui) {
    Object.assign(ligne, { appareil_empreinte: null, appareil_nom: null, activation_empreinte: null, activation_expire_le: null });
    if (avant?.appareil_empreinte) ligne.coupe_le = maintenant;
  }
  const { error } = await admin.from('tpe_de_poche').upsert(ligne, { onConflict: 'id' });
  if (error) throw new Error(error.message);
  return json({ ok: true, etat: etatDuTpe({ ...(avant ?? {}), ...ligne } as LigneDuTpe, Date.now()) });
}

async function preparer(b: any, qui: string) {
  const branchId = idPropre(b.branchId); const membreId = idPropre(b.membreId);
  if (!branchId || !membreId) return json({ ok: false, raison: 'mal-forme' }, 400);
  const ligne = await laLigne(idDuTpe(branchId, membreId));
  if (!ligne || !ligne.autorise) return json({ ok: false, raison: 'pas-autorise' }, 403);
  const code = tireUnCodeDuTpe(crypto.getRandomValues(new Uint32Array(LONGUEUR_DU_CODE_DU_TPE)));
  const expire = new Date(Date.now() + DUREE_DU_CODE_DU_TPE_MS).toISOString();
  const { error } = await admin.from('tpe_de_poche').update({
    activation_empreinte: await empreinte(code), activation_expire_le: expire, modifie_le: new Date().toISOString(), modifie_par: qui,
  }).eq('id', ligne.id);
  if (error) throw new Error(error.message);
  return json({ ok: true, code, expireLe: expire });
}

async function couper(b: any, qui: string) {
  const branchId = idPropre(b.branchId); const membreId = idPropre(b.membreId);
  if (!branchId || !membreId) return json({ ok: false, raison: 'mal-forme' }, 400);
  const ligne = await laLigne(idDuTpe(branchId, membreId));
  if (!ligne) return json({ ok: true, etat: 'sans' });
  const maintenant = new Date().toISOString();
  const { error } = await admin.from('tpe_de_poche').update({
    appareil_empreinte: null, appareil_nom: null, activation_empreinte: null, activation_expire_le: null,
    coupe_le: maintenant, modifie_le: maintenant, modifie_par: qui,
  }).eq('id', ligne.id);
  if (error) throw new Error(error.message);
  return json({ ok: true, etat: ligne.autorise ? 'coupe' : 'sans' });
}

/* ── LE TÉLÉPHONE ── */
async function activer(b: any) {
  const code = codeDuTpePropre(b.code);
  if (!estUnCodeDuTpe(code)) return json({ ok: false, raison: 'code' }, 400);
  const { data, error } = await admin.from('tpe_de_poche').select('*').eq('activation_empreinte', await empreinte(code)).maybeSingle();
  if (error) throw new Error(error.message);
  const ligne = (data as LigneDuTpe | null) ?? null;
  /* Un code inconnu et un code passé reçoivent la même réponse. */
  if (!ligne || !codeEncoreBon(ligne, Date.now())) return json({ ok: false, raison: 'code' });
  const jeton = jetonDAppareilNeuf();
  const maintenant = new Date().toISOString();
  const { data: pris, error: e2 } = await admin.from('tpe_de_poche').update({
    appareil_empreinte: await empreinte(jeton), appareil_nom: nomDAppareil(b.appareil) || 'Téléphone', active_le: maintenant, coupe_le: null,
    activation_empreinte: null, activation_expire_le: null, derniere_vue_le: maintenant, modifie_le: maintenant, modifie_par: 'activation',
  }).eq('id', ligne.id).eq('activation_empreinte', ligne.activation_empreinte ?? '').select('id');
  if (e2) throw new Error(e2.message);
  /* Deux téléphones sur le même code : le premier l'a pris. */
  if (!pris || pris.length === 0) return json({ ok: false, raison: 'code' });
  return json({ ok: true, jeton, nom: ligne.nom, membreId: ligne.membre_id, branchId: ligne.branch_id });
}

/** Le TPE d'un jeton, s'il encaisse encore ; null sinon (coupé, inconnu, plus autorisé). */
async function leTpeDuJeton(jeton: unknown): Promise<LigneDuTpe | null> {
  if (!estUnJetonDAppareil(jeton)) return null;
  const { data, error } = await admin.from('tpe_de_poche').select('*').eq('appareil_empreinte', await empreinte(String(jeton))).maybeSingle();
  if (error) throw new Error(error.message);
  const l = (data as LigneDuTpe | null) ?? null;
  return l && l.autorise ? l : null;
}

type Ligne = { id: string; branch_id: string | null; data: any; updated_at?: string };

async function jour(b: any) {
  const tpe = await leTpeDuJeton(b.jeton);
  if (!tpe) return json({ ok: false, raison: 'coupe' }, 401);
  const maintenant = Date.now();
  const leJour = jourDuTpe(maintenant);
  /* La dernière vue : une fois par minute au plus. */
  if (!tpe.derniere_vue_le || maintenant - Date.parse(tpe.derniere_vue_le) > 60_000) {
    await admin.from('tpe_de_poche').update({ derniere_vue_le: new Date(maintenant).toISOString() }).eq('id', tpe.id);
  }
  const { data: lignes, error } = await admin.from('appointments').select('id,branch_id,data').eq('branch_id', tpe.branch_id).eq('data->>date', leJour).limit(500);
  if (error) throw new Error(error.message);
  const rdvs = rdvsDuJourAuTpe(((lignes ?? []) as Ligne[]).map((l) => ({ ...(l.data ?? {}), id: l.id }) as RdvDuTpe), leJour);
  /* LE LOT 2 : les espèces déclarées aujourd'hui, le total du soir, et ce qui reste du plafond du jour. */
  const lesEspeces = await lesEspecesDuJour(String(tpe.branch_id), leJour);
  const enAttente = new Set(lesEspeces.filter((e) => e.statut === 'a-remettre').map((e) => e.rdv_id));
  const total = totalDuSoir(rdvs, lesEspeces, tpe.membre_id, leJour);
  const engage = engageDuJour([...engagementsDesOuvertures(rdvs, tpe.membre_id, leJour), ...engagementsDesEspeces(lesEspeces, tpe.membre_id, leJour)]);
  const enPlus = { especes: tpe.especes === true, total, resteDuJourXof: Math.max(0, PLAFOND_PAR_JOUR_XOF - engage), plafondParPaiementXof: PLAFOND_PAR_PAIEMENT_XOF };
  if (rdvs.length === 0) return json({ ok: true, nom: tpe.nom, jour: leJour, lignes: [], ...enPlus });
  const ids = rdvs.map((r) => r.id);
  const clientIds = [...new Set(rdvs.map((r) => String(r.clientId ?? '')).filter(Boolean))];
  const serviceIds = [...new Set(rdvs.flatMap((r) => (Array.isArray(r.serviceIds) ? r.serviceIds.map(String) : [])))];
  const [pieces, fiches, services] = await Promise.all([
    admin.from('invoices').select('id,data').in('data->>apptId', ids).limit(1000),
    clientIds.length ? admin.from('clients').select('id,data').in('id', clientIds) : Promise.resolve({ data: [], error: null }),
    serviceIds.length ? admin.from('catalog_services').select('id,data').in('id', serviceIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [pieces, fiches, services]) if ((r as any).error) throw new Error((r as any).error.message);
  const lesPieces = (((pieces as any).data ?? []) as { id: string; data: any }[]).map((l) => ({ ...(l.data ?? {}), id: l.id })) as PieceDeLaFin[];
  const lesFiches = new Map((((fiches as any).data ?? []) as { id: string; data: any }[]).map((l) => [l.id, l.data ?? {}]));
  const lesServices = new Map((((services as any).data ?? []) as { id: string; data: any }[]).map((l) => [l.id, l.data ?? {}]));
  const sortie: LigneDuJourAuTpe[] = rdvs.map((r) => {
    const piece = pieceDuRdvDeLaFin(lesPieces, r.id);
    const reste = piece ? resteDeLaPieceDeLaFin(piece) : null;
    const fiche = lesFiches.get(String(r.clientId ?? '')) ?? null;
    const prestations = (Array.isArray(r.serviceIds) ? r.serviceIds : [])
      .map((id) => { const s = lesServices.get(String(id)); return s?.name ? nomEtEnClair(String(s.name), s.enClair) : ''; })
      .filter(Boolean).join(' · ');
    return {
      id: r.id, heure: String(r.time ?? '').slice(0, 5), prenom: prenomDUsage(fiche, r.clientName) || 'Cliente',
      prestations, etat: etatAuTpe(!!piece, reste, enAttente.has(r.id)), resteXof: reste, essai: fiche?.essai === true,
    };
  });
  return json({ ok: true, nom: tpe.nom, jour: leJour, lignes: sortie, ...enPlus });
}

/** Les espèces déclarées aujourd'hui dans une branche, et celles d'avant encore à remettre. */
async function lesEspecesDuJour(branchId: string, leJour: string): Promise<LigneDesEspeces[]> {
  const { data, error } = await admin.from('tpe_especes').select('*').eq('branch_id', branchId)
    .or(`statut.eq.a-remettre,declare_le.gte.${leJour}T00:00:00+01:00`).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as LigneDesEspeces[];
}

/** Ce qu'un TPE a engagé aujourd'hui (séances ouvertes, espèces déclarées), une séance mise à part. */
async function engageAujourdhui(tpe: LigneDuTpe, leJour: string, saufRdvId: string): Promise<number> {
  const [{ data: lignes, error }, lesEspeces] = await Promise.all([
    admin.from('appointments').select('id,data').eq('branch_id', tpe.branch_id).eq('data->>date', leJour).limit(500),
    lesEspecesDuJour(String(tpe.branch_id), leJour),
  ]);
  if (error) throw new Error(error.message);
  const rdvs = ((lignes ?? []) as { id: string; data: any }[]).map((l) => ({ ...(l.data ?? {}), id: l.id }) as RdvDuTpe);
  return engageDuJour([...engagementsDesOuvertures(rdvs, tpe.membre_id, leJour), ...engagementsDesEspeces(lesEspeces, tpe.membre_id, leJour)], saufRdvId);
}

/** Le rendez-vous du jour qu'un TPE peut toucher, sa pièce et son reste ; ou la raison du refus. */
async function laSeanceDuTpe(tpe: LigneDuTpe, rdvIdBrut: unknown): Promise<
  { ok: true; ligne: Ligne; piece: PieceDeLaFin; reste: number; leJour: string } | { ok: false; raison: string; status: number }
> {
  const rdvId = idPropre(rdvIdBrut);
  if (!rdvId) return { ok: false, raison: 'mal-forme', status: 400 };
  const { data: l, error } = await admin.from('appointments').select('id,branch_id,data').eq('id', rdvId).maybeSingle();
  if (error) throw new Error(error.message);
  const ligne = l as Ligne | null;
  const leJour = jourDuTpe(Date.now());
  if (!ligne || ligne.branch_id !== tpe.branch_id || rdvsDuJourAuTpe([{ ...(ligne.data ?? {}), id: ligne.id } as RdvDuTpe], leJour).length === 0) {
    return { ok: false, raison: 'introuvable', status: 404 };
  }
  const { data: pl, error: ep } = await admin.from('invoices').select('id,data').eq('data->>apptId', rdvId).limit(20);
  if (ep) throw new Error(ep.message);
  const piece = pieceDuRdvDeLaFin(((pl ?? []) as { id: string; data: any }[]).map((x) => ({ ...(x.data ?? {}), id: x.id })) as PieceDeLaFin[], rdvId);
  if (!piece) return { ok: false, raison: 'pas-terminee', status: 200 };
  const reste = resteDeLaPieceDeLaFin(piece);
  if (reste <= 0) return { ok: false, raison: 'reglee', status: 200 };
  return { ok: true, ligne, piece, reste, leJour };
}

/** ÉCRIRE SUR UNE LIGNE FRAÎCHE, SOUS CONDITION (comme terminer-et-regler) :
    jamais sur une donnée qui a bougé, le Trône écrit les mêmes lignes. */
async function ecrisLeRdv(id: string, change: (data: any) => any | null): Promise<any | null> {
  for (let essai = 0; essai < 3; essai++) {
    const { data: frais, error } = await admin.from('appointments').select('id,branch_id,data,updated_at').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!frais) return null;
    const neuf = change((frais as Ligne).data ?? {});
    if (neuf === null) return (frais as Ligne).data;
    let q = admin.from('appointments').update({ data: neuf }).eq('id', id);
    if ((frais as Ligne).updated_at) q = q.eq('updated_at', (frais as Ligne).updated_at);
    const { data, error: e2 } = await q.select('id');
    if (e2) throw new Error(e2.message);
    if ((data ?? []).length > 0) return neuf;
  }
  return null;
}

async function ouvrir(b: any) {
  const tpe = await leTpeDuJeton(b.jeton);
  if (!tpe) return json({ ok: false, raison: 'coupe' }, 401);
  const rdvId = idPropre(b.rdvId);
  if (!rdvId) return json({ ok: false, raison: 'mal-forme' }, 400);
  const { data: l, error } = await admin.from('appointments').select('id,branch_id,data').eq('id', rdvId).maybeSingle();
  if (error) throw new Error(error.message);
  const ligne = l as Ligne | null;
  const leJour = jourDuTpe(Date.now());
  /* Un rendez-vous d'une autre branche, d'un autre jour, ou annulé : introuvable. */
  if (!ligne || ligne.branch_id !== tpe.branch_id || rdvsDuJourAuTpe([{ ...(ligne.data ?? {}), id: ligne.id } as RdvDuTpe], leJour).length === 0) {
    return json({ ok: false, raison: 'introuvable' }, 404);
  }
  const { data: pl, error: ep } = await admin.from('invoices').select('id,data').eq('data->>apptId', rdvId).limit(20);
  if (ep) throw new Error(ep.message);
  const piece = pieceDuRdvDeLaFin(((pl ?? []) as { id: string; data: any }[]).map((x) => ({ ...(x.data ?? {}), id: x.id })) as PieceDeLaFin[], rdvId);
  if (!piece) return json({ ok: false, raison: 'pas-terminee' });
  const reste = resteDeLaPieceDeLaFin(piece);
  if (reste <= 0) return json({ ok: false, raison: 'reglee' });
  /* Des espèces déjà déclarées pour elle : la direction les attend ce soir. */
  const { data: declarees, error: ed } = await admin.from('tpe_especes').select('id').eq('rdv_id', rdvId).eq('statut', 'a-remettre').limit(1);
  if (ed) throw new Error(ed.message);
  if ((declarees ?? []).length > 0) return json({ ok: false, raison: 'especes' });
  /* LES PLAFONDS (lot 2) : un paiement, et la journée de ce TPE. */
  const verdict = plafondDuTpe(reste, await engageAujourdhui(tpe, leJour, rdvId));
  if (!verdict.ok) return json({ ok: false, raison: verdict.raison, resteDuJourXof: verdict.resteDuJourXof });
  const marque: MarqueDuTpe = { nom: tpe.nom, membreId: tpe.membre_id, le: new Date().toISOString(), montantXof: reste };
  const ecrit = await ecrisLeRdv(rdvId, (d) => {
    const garde = estUnJetonDuLien(d.lienDeReglement?.jeton);
    return {
      ...d,
      lienDeReglement: { ...(d.lienDeReglement ?? {}), ...(garde ? {} : { jeton: jetonDuLienNeuf(), creeLe: marque.le }), tpe: marque },
    };
  });
  if (ecrit === null) return json({ ok: false, raison: 'ecriture' }, 409);
  const jetonDuLien = String(ecrit.lienDeReglement?.jeton ?? '');
  if (!estUnJetonDuLien(jetonDuLien)) return json({ ok: false, raison: 'lien' }, 500);
  return json({ ok: true, jetonDuLien, resteXof: reste });
}

/* ── LES ESPÈCES (lot 2) ── */
/** Le téléphone déclare les billets reçus pour une séance : une ligne « à remettre », rien sur la pièce. */
async function especes(b: any) {
  const tpe = await leTpeDuJeton(b.jeton);
  if (!tpe) return json({ ok: false, raison: 'coupe' }, 401);
  if (tpe.especes !== true) return json({ ok: false, raison: 'especes-fermees' }, 403);
  const s = await laSeanceDuTpe(tpe, b.rdvId);
  if (!s.ok) return json({ ok: false, raison: s.raison }, s.status);
  const rdvId = s.ligne.id;
  const { data: deja, error: ed } = await admin.from('tpe_especes').select('id,montant_xof').eq('rdv_id', rdvId).eq('statut', 'a-remettre').limit(1);
  if (ed) throw new Error(ed.message);
  if ((deja ?? []).length > 0) return json({ ok: true, deja: true, montantXof: Number((deja as any[])[0].montant_xof) || 0 });
  const verdict = plafondDuTpe(s.reste, await engageAujourdhui(tpe, s.leJour, rdvId));
  if (!verdict.ok) return json({ ok: false, raison: verdict.raison, resteDuJourXof: verdict.resteDuJourXof });
  /* Ce que la direction lira ce soir : le prénom d'usage et la prestation en clair, rien d'autre. */
  const r = { ...(s.ligne.data ?? {}), id: rdvId } as RdvDuTpe;
  const serviceIds = Array.isArray(r.serviceIds) ? r.serviceIds.map(String) : [];
  const [fiche, services] = await Promise.all([
    r.clientId ? admin.from('clients').select('data').eq('id', String(r.clientId)).maybeSingle() : Promise.resolve({ data: null, error: null }),
    serviceIds.length ? admin.from('catalog_services').select('id,data').in('id', serviceIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const q of [fiche, services]) if ((q as any).error) throw new Error((q as any).error.message);
  const lesServices = new Map((((services as any).data ?? []) as { id: string; data: any }[]).map((x) => [x.id, x.data ?? {}]));
  const prestations = serviceIds.map((id) => { const sv = lesServices.get(id); return sv?.name ? nomEtEnClair(String(sv.name), sv.enClair) : ''; }).filter(Boolean).join(' · ');
  const maintenant = Date.now();
  const { error: ei } = await admin.from('tpe_especes').insert({
    id: idDesEspeces(rdvId, maintenant), branch_id: tpe.branch_id, membre_id: tpe.membre_id, nom: tpe.nom, rdv_id: rdvId,
    piece_id: String(s.piece.id ?? ''), montant_xof: s.reste, prenom: prenomDUsage(((fiche as any).data?.data) ?? null, r.clientName) || 'Cliente',
    prestations, declare_le: new Date(maintenant).toISOString(), statut: 'a-remettre',
  });
  if (ei) {
    /* Deux touchers au même instant : la première déclaration tient. */
    if (ei.code === '23505') return json({ ok: true, deja: true, montantXof: s.reste });
    throw new Error(ei.message);
  }
  return json({ ok: true, montantXof: s.reste });
}

/** La direction ouvre ou ferme les espèces à un membre qui a un TPE. */
async function especesPermises(b: any, qui: string) {
  const branchId = idPropre(b.branchId); const membreId = idPropre(b.membreId);
  if (!branchId || !membreId) return json({ ok: false, raison: 'mal-forme' }, 400);
  const ligne = await laLigne(idDuTpe(branchId, membreId));
  if (!ligne || !ligne.autorise) return json({ ok: false, raison: 'pas-autorise' }, 403);
  const oui = b.oui === true;
  const { error } = await admin.from('tpe_de_poche').update({ especes: oui, modifie_le: new Date().toISOString(), modifie_par: qui }).eq('id', ligne.id);
  if (error) throw new Error(error.message);
  return json({ ok: true, especes: oui });
}

/** La direction a reçu les espèces (et vient de les encaisser au Trône), ou ne les a pas reçues. */
async function especesTraitees(b: any, qui: string) {
  const id = idPropre(b.id);
  if (!id || !estUnStatutTraite(b.statut)) return json({ ok: false, raison: 'mal-forme' }, 400);
  const { data, error } = await admin.from('tpe_especes').update({
    statut: b.statut, traite_le: new Date().toISOString(), traite_par: qui, encaissement_id: idPropre(b.encaissementId),
  }).eq('id', id).eq('statut', 'a-remettre').select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return json({ ok: false, raison: 'deja-traitee' });
  return json({ ok: true, statut: b.statut });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ fonction: 'tpe-de-poche', ok: true, service: SERVICE.length > 0 });
  if (req.method !== 'POST') return json({ ok: false, raison: 'mal-forme' }, 405);
  let b: any = {};
  try { b = await req.json(); } catch { /* corps illisible */ }
  const action = String(b?.action ?? '');
  try {
    if (action === 'activer') return await activer(b);
    if (action === 'jour') return await jour(b);
    if (action === 'ouvrir') return await ouvrir(b);
    if (action === 'especes') return await especes(b);
    if (action === 'especes-permises' || action === 'especes-traitees') {
      const qui = await laDirection(req);
      if (!qui) return json({ ok: false, raison: 'refusee' }, 403);
      return action === 'especes-permises' ? await especesPermises(b, qui) : await especesTraitees(b, qui);
    }
    if (action === 'autoriser' || action === 'preparer' || action === 'couper') {
      const qui = await laDirection(req);
      if (!qui) return json({ ok: false, raison: 'refusee' }, 403);
      if (action === 'autoriser') return await autoriser(b, qui);
      if (action === 'preparer') return await preparer(b, qui);
      return await couper(b, qui);
    }
    return json({ ok: false, raison: 'action' }, 400);
  } catch (e) {
    console.error('tpe-de-poche', action, String((e as Error)?.message ?? e).slice(0, 200));
    return json({ ok: false, raison: 'panne' }, 500);
  }
});
