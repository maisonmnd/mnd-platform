import { ATELIERS_RESERVABLES } from './place-du-serveur';

/* ══ LE RENDEZ-VOUS EN ATTENTE · 17 novembre 2026 ═══════════════════════
   Tranché au sélecteur par Yéman le 17 novembre 2026 (arbitrage B de « La
   consultation en affiches ») : un rendez-vous pris sur le site naît EN ATTENTE ; il se
   confirme par sa réponse « Je confirme » sur WhatsApp, plus l'acompte en
   ligne quand la prestation en porte un dans Paramètres ; sans réponse sous
   deux heures, la place se libère.

   LE PATRON EST LE RENDEZ-VOUS SUGGÉRÉ (15 novembre 2026,
   `rendez-vous-suggere-pur.ts`), et on ne le refait pas : la place naît
   tenue (statut « confirmé », comme une suggestion : le Carnet, les places
   du « + RDV » et les portes en ligne la voient prise), elle porte
   `suggereLe` (posée, sans son oui : les rappels se taisent, l'assistant ne
   dit jamais « votre rendez-vous est confirmé »), et son oui pose
   `confirmeeParLaClienteLe` (les boutons REPRISE_OK et REPRISE_AUTRE du
   webhook, « Elle a dit oui » au comptoir). CE QUE CE FICHIER AJOUTE :
     · `attenduJusquAu` : l'échéance de la place. Sa présence dit qu'elle
       est née en attente d'une porte en ligne ; passée sans son oui, la
       base la libère (`libere_les_places_en_attente`, 0222) ;
     · FERME n'est pas une marque de plus, c'est une DÉDUCTION : son oui, et
       l'acompte reçu quand il y en a un (`depositConfirmed`, que seuls
       kkiapay-verify et le comptoir posent). Rien ne peut donc l'oublier :
       ni le paiement en ligne, ni « Elle a dit oui », ni l'acompte contrôlé
       au comptoir n'ont à connaître ce fichier ;
     · les plafonds (par numéro, par adresse), la clé du numéro, la limite
       des déplacements et la remise qui ne suit pas un autre jour ;
     · ce que la porte du site juge en plus du juge des places : l'heure sur
       la grille, la durée au calibre annoncé, le défaisage qui se réserve.

   Pur, sans magasin ni React. Le bloc ⟨rendez-vous-en-attente⟩ est RECOPIÉ
   dans demande-submit et confirmation-rdv (une fonction Edge n'importe rien
   du dépôt) ; `verifie-les-douze-lunes` garde les copies identiques.
   `scripts/verifie-le-rendez-vous-en-attente.mjs` l'éprouve (et `--prouve`). */

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

/* ── LES FAMILLES DE LA PORTE DU SITE ─────────────────────────────────────
   18 novembre 2026. Le serveur juge une place du site sur ces familles-là
   (`demande-submit`, `laPlaceDemandee`) : le défaisage y est rangé sous un
   atelier qui se réserve. Tout ce qui, sur le site ou au Trône, dit ce que
   le site laisse réserver (la liste de /reserver/, l'aiguillage de
   /consultation/, « Vos envies ») lit les MÊMES familles : sans elles, le
   serveur posait un GBÀTÀ™ que la liste ne montrait pas, et le parcours
   l'envoyait à la visio. WhatsApp et Ma Couronne ne passent pas par ici. */
export const famillesDeLaPorteDuSite = (familles: readonly { id: string; parentId?: string }[]): { id: string; parentId?: string }[] =>
  famillesAvecLeDefaisage(familles, ATELIERS_RESERVABLES);

/* ── CE QUE LE TRÔNE EN DIT ────────────────────────────────────────────── */

/** LA TUILE DU CARNET d'un rendez-vous né en attente : « En attente de son
    oui · la place se libère à 14 h 32 », « Elle a dit oui · acompte de
    10 000 F attendu · jusqu'à 15 h 02 », « Pris en ligne, confirmé par elle
    le 17 nov. 2026 », « Place libérée le 17 nov. 2026 : pas de confirmation
    sous deux heures ». `court` : « 17 nov. 2026 » ; `francs` : « 10 000 F ». */
export function ceQueDitLAttente(
  a: MarquesDeLAttente,
  o: { court: (iso: string) => string; francs: (xof: number) => string },
): string {
  const etat = etatDeLAttente(a);
  if (!etat) return '';
  if (etat === 'liberee') {
    const le = o.court(String(a.placeLibereeLe).slice(0, 10));
    return marqueDite(a.autreMomentDemandeLe)
      ? `Place rendue le ${le} : elle a demandé un autre moment`
      : `Place libérée le ${le} : pas de confirmation sous deux heures`;
  }
  if (etat === 'ferme') return `Pris en ligne, confirmé par elle le ${o.court(String(a.confirmeeParLaClienteLe).slice(0, 10))}`;
  /* L'heure de la place ne se dit que si la place se libérera vraiment : ni
     quand le comptoir a noté son oui, ni quand le rendez-vous commence avant
     l'échéance (`placeALiberer` ne libère jamais une place dont l'heure est venue). */
  const echeance = Date.parse(String(a.attenduJusquAu));
  const debut = debutDuRendezVous(a);
  const seLibere = !ouiDuComptoir(a) && !(debut !== null && Number.isFinite(echeance) && debut <= minuteDePortoNovo(echeance));
  const jusqua = seLibere ? heureDeCotonouDite(a.attenduJusquAu) : '';
  if (etat === 'acompte') return `Elle a dit oui · acompte de ${o.francs(acompteAttendu(a))} attendu${jusqua ? ` · jusqu’à ${jusqua}` : ''}`;
  return `En attente de son oui${jusqua ? ` · la place se libère à ${jusqua}` : ''}`;
}
