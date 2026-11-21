/* ══ LE POINT FINANCIER D'UNE CLIENTE — 21 novembre 2026 ═════════════════
   « Besoin d'une page où j'ai le point d'une cliente : tous ses RDV et ses
   factures, leurs statuts, les impayés ; je puisse modifier les services du
   RDV sur la même page, faire des remises et voir le total bouger », puis
   « le point financier que nous pouvons ensuite suivre : l'état, payé ou
   réglé ; envoyé par WhatsApp ; relance (skip next) ; programmer une relance
   sur une ou plusieurs factures combinées » (Yéman). Maquette GqBogAWn…,
   « construis » avec les choix par défaut :
     1. seules partent les relances programmées depuis cette page (la tournée
        automatique reste éteinte) ;
     2. un rituel honoré sans facture reçoit la sienne quand il entre dans un
        point ou un plan ;
     3. un rituel qui a déjà reçu de l'argent garde ses prestations : une
        remise se pose sur ce qui reste ;
     4. la direction et le département Vente & Caisse ;
     5. une page ouverte par « Le point » sur la fiche.

   CE MODULE EST PUR : les filtres, le suivi WhatsApp d'une pièce, l'état d'un
   plan de relance, et l'édition des lignes d'un rendez-vous (les tableaux
   parallèles restent alignés). Les prix, eux, ne se calculent PAS ici : ils
   passent par les mêmes fonctions que le Carnet, la Caisse et la fenêtre du
   rendez-vous (`apptNetXof`, `brutDuRituel`, `alignerFacturesDuRituel`).
   Banc : `verifie-le-point`. */
import { idDeLaRelanceProgrammee, joursDuPlan, planLu, type RelanceProgrammee } from './relances-pur';

/* ── LES LIGNES ET LEURS FILTRES ────────────────────────────────────────── */

/** Où en est le règlement d'une ligne du point. */
export type EtatDuReglement = 'regle' | 'partiel' | 'du' | 'gratuit' | 'a-venir' | 'annule';
export const MOT_DU_REGLEMENT: Record<EtatDuReglement, string> = {
  regle: 'réglée', partiel: 'réglée en partie', du: 'à régler', gratuit: 'rien à régler', 'a-venir': 'à venir', annule: 'annulé',
};

/** L'état d'une ligne, à partir de ce que le Trône sait déjà (jamais un calcul à part). */
export function etatDuReglement(o: { annule?: boolean; aVenir?: boolean; totalXof: number; verseXof: number; resteXof: number }): EtatDuReglement {
  if (o.annule) return 'annule';
  if (o.aVenir) return 'a-venir';
  if (!(o.totalXof > 0)) return 'gratuit';
  if (!(o.resteXof > 0)) return 'regle';
  return o.verseXof > 0 ? 'partiel' : 'du';
}

export type FiltreDuPoint = 'tout' | 'a-regler' | 'regles' | 'a-venir' | 'factures' | 'annules';
export const FILTRES_DU_POINT: readonly { k: FiltreDuPoint; dit: string }[] = [
  { k: 'tout', dit: 'Tout' }, { k: 'a-regler', dit: 'À régler' }, { k: 'regles', dit: 'Réglés' },
  { k: 'a-venir', dit: 'À venir' }, { k: 'factures', dit: 'Avec une facture' }, { k: 'annules', dit: 'Annulés' },
];

export type LigneFiltrable = { etat: EtatDuReglement; pieces: readonly unknown[] };

export function passeLeFiltre(l: LigneFiltrable, f: FiltreDuPoint): boolean {
  if (f === 'a-regler') return l.etat === 'du' || l.etat === 'partiel';
  if (f === 'regles') return l.etat === 'regle';
  if (f === 'a-venir') return l.etat === 'a-venir';
  if (f === 'factures') return l.pieces.length > 0;
  if (f === 'annules') return l.etat === 'annule';
  return true;
}

export const comptesDesFiltres = (lignes: readonly LigneFiltrable[]): Record<FiltreDuPoint, number> =>
  Object.fromEntries(FILTRES_DU_POINT.map(({ k }) => [k, lignes.filter((l) => passeLeFiltre(l, k)).length])) as Record<FiltreDuPoint, number>;

/** Une ligne se coche pour le point : elle doit encore, et elle a eu lieu. */
export const seCoche = (l: { etat: EtatDuReglement }): boolean => l.etat === 'du' || l.etat === 'partiel';

/* ── LE SUIVI WHATSAPP D'UNE PIÈCE ──────────────────────────────────────── */

/** Une ligne du journal des envois, telle que la page la lit (la tournée y écrit `invoiceIds`, `point`, `programmee`). */
export type EnvoiLu = {
  id: string; type?: string; statut?: string; etat?: string; quand?: string; accuseLe?: string;
  invoiceId?: string; invoiceIds?: readonly string[]; programmee?: string; point?: boolean;
};
/** La marque d'une pièce partie (`whatsapp.partieLe`, une pièce un message). */
export type PieceSuivie = { id: string; number?: string; partieLe?: string; modele?: string };

export type EtatDuMessage = 'en-attente' | 'envoye' | 'remis' | 'lu' | 'non-remis' | 'echec' | 'ecarte';
export type PasDuSuivi = {
  /** `piece` : la facture ou le point partis au comptoir ; `relance` : la tournée ; `programmee` : un jour du plan. */
  genre: 'piece' | 'relance' | 'programmee';
  quand: string; etat: EtatDuMessage; pieceIds: string[]; envoiId?: string; luLe?: string;
};

const SANS_DEPART = new Set(['échec', 'sans-abonnement', 'sans-numero', 'périmé']);

/** L'état d'une ligne du journal, dit simplement : l'accusé de Meta l'emporte sur le statut de la requête. */
export function etatDeLEnvoi(e: Pick<EnvoiLu, 'statut' | 'etat'>): EtatDuMessage {
  if (e.etat === 'lu') return 'lu';
  if (e.etat === 'remis') return 'remis';
  if (e.etat === 'non-remis') return 'non-remis';
  if (e.statut === 'écarté') return 'ecarte';
  if (SANS_DEPART.has(e.statut ?? '')) return 'echec';
  if (e.statut === 'envoyé' || e.etat === 'en-route') return 'envoye';
  return 'en-attente';
}

/** LE SUIVI DES PIÈCES D'UN COMPTE, le plus récent d'abord : chaque papier parti
    (la marque de la pièce, une seule fois pour un point de plusieurs factures),
    et chaque relance de la tournée qui les porte. */
export function suiviDesPieces(pieces: readonly PieceSuivie[], journal: readonly EnvoiLu[]): PasDuSuivi[] {
  const ids = new Set(pieces.map((p) => p.id));
  const out: PasDuSuivi[] = [];
  /* Un point part en une fois : ses pièces portent la même marque, au même instant. */
  const parDepart = new Map<string, string[]>();
  for (const p of pieces) {
    if (!p.partieLe) continue;
    const cle = `${p.partieLe}|${p.modele ?? ''}`;
    parDepart.set(cle, [...(parDepart.get(cle) ?? []), p.id]);
  }
  for (const [cle, pieceIds] of parDepart) out.push({ genre: 'piece', quand: cle.split('|')[0], etat: 'envoye', pieceIds });
  for (const e of journal) {
    if (e.type !== 'relance-facture' || !e.quand) continue;
    const siennes = [...new Set([...(e.invoiceIds ?? []), ...(e.invoiceId ? [e.invoiceId] : [])])].filter((x) => ids.has(x));
    if (!siennes.length) continue;
    out.push({
      genre: e.programmee ? 'programmee' : 'relance', quand: e.quand, etat: etatDeLEnvoi(e), pieceIds: siennes, envoiId: e.id,
      ...(e.etat === 'lu' && e.accuseLe ? { luLe: e.accuseLe } : {}),
    });
  }
  return out.sort((a, b) => b.quand.localeCompare(a.quand));
}

/** Le dernier mot du suivi d'une pièce, pour sa ligne (« Envoyée le 14 nov. · lue »), ou null. */
export function dernierPasDeLaPiece(pieceId: string, suivi: readonly PasDuSuivi[]): PasDuSuivi | null {
  return suivi.find((s) => s.pieceIds.includes(pieceId)) ?? null;
}

/* ── LES PLANS DE RELANCE ───────────────────────────────────────────────── */

/** UN PLAN NEUF : son identifiant (court, sans donnée de cliente), ses jours. Rien si le jour n'est pas un jour. */
export function nouveauPlan(o: { id: string; debut: string; pas: number; le: string; par?: string }): RelanceProgrammee | null {
  const jours = joursDuPlan(o.debut, o.pas);
  if (!jours.length || !/^[a-z0-9-]{4,40}$/.test(o.id)) return null;
  return { plan: o.id, jours, le: o.le, ...(o.par ? { par: o.par } : {}) };
}

/** Un identifiant de plan : l'instant et un hasard, jamais un nom. */
export const idDuPlan = (instantMs: number, hasard: string): string =>
  `${Math.floor(instantMs / 1000).toString(36)}-${hasard.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6) || '0'}`;

export type JourDuPlan = { jour: string; etat: 'partie' | 'sautee' | 'prochaine' | 'a-venir' | 'sans-depart'; envoi?: EtatDuMessage };
export type EtatDuPlan = {
  plan: RelanceProgrammee; pieceIds: string[]; jours: JourDuPlan[];
  prochaine?: string; arrete: boolean; vivant: boolean;
};

/** LES PLANS D'UN COMPTE, lus sur ses pièces : un plan par identifiant, ses
    pièces, et chacun de ses jours dit tel qu'il est (parti selon le journal,
    sauté, à venir, ou passé sans départ : réglée, elle a répondu, modèle en
    attente). Le plus récent d'abord. */
export function plansDesPieces(
  pieces: readonly { id: string; relanceProgrammee?: unknown }[], journal: readonly EnvoiLu[], aujourdhui: string,
): EtatDuPlan[] {
  const parPlan = new Map<string, { plan: RelanceProgrammee; pieceIds: string[] }>();
  for (const p of pieces) {
    const plan = planLu(p.relanceProgrammee);
    if (!plan) continue;
    const deja = parPlan.get(plan.plan);
    /* Les pièces d'un plan portent le même objet ; un geste en retard sur l'une ne doit pas tromper : la plus récente fait foi. */
    if (!deja) parPlan.set(plan.plan, { plan, pieceIds: [p.id] });
    else { deja.pieceIds.push(p.id); if ((plan.arreteLe ?? '') > (deja.plan.arreteLe ?? '') || plan.jours.join() !== deja.plan.jours.join()) deja.plan = plusRecent(deja.plan, plan); }
  }
  const journalParId = new Map(journal.map((e) => [e.id, e]));
  /* La tournée marque chaque ligne de son plan (`programmee`) : un plan qui écrit à deux numéros a deux lignes le
     même jour, chacune avec la fiche dans son identifiant ; on la retrouve par le plan et le jour (10 h à Cotonou,
     9 h à Greenwich : le même jour). */
  const parPlanEtJour = new Map<string, EnvoiLu>();
  for (const e of journal) {
    if (!e.programmee || !e.quand) continue;
    const cle = `${e.programmee}|${e.quand.slice(0, 10)}`;
    const deja = parPlanEtJour.get(cle);
    if (!deja || etatDeLEnvoi(deja) === 'echec') parPlanEtJour.set(cle, e);
  }
  const out: EtatDuPlan[] = [];
  for (const { plan, pieceIds } of parPlan.values()) {
    const sautes = new Set(plan.sautes ?? []);
    let prochaine: string | undefined;
    const jours = plan.jours.map((jour): JourDuPlan => {
      const e = journalParId.get(idDeLaRelanceProgrammee(plan.plan, jour)) ?? parPlanEtJour.get(`${plan.plan}|${jour}`);
      if (e && etatDeLEnvoi(e) !== 'echec') return { jour, etat: 'partie', envoi: etatDeLEnvoi(e) };
      if (sautes.has(jour)) return { jour, etat: 'sautee' };
      if (jour < aujourdhui || (plan.arreteLe && jour >= aujourdhui)) return { jour, etat: 'sans-depart' };
      if (!prochaine) { prochaine = jour; return { jour, etat: 'prochaine' }; }
      return { jour, etat: 'a-venir' };
    });
    out.push({ plan, pieceIds, jours, ...(prochaine ? { prochaine } : {}), arrete: !!plan.arreteLe, vivant: !plan.arreteLe && !!prochaine });
  }
  return out.sort((a, b) => b.plan.le.localeCompare(a.plan.le));
}

/** De deux copies d'un même plan, celle qui porte le dernier geste (arrêt, saut, décalage). */
function plusRecent(a: RelanceProgrammee, b: RelanceProgrammee): RelanceProgrammee {
  if (!!a.arreteLe !== !!b.arreteLe) return a.arreteLe ? a : b;
  return (b.sautes?.length ?? 0) > (a.sautes?.length ?? 0) || b.jours.join() !== a.jours.join() ? b : a;
}

/** Les pièces d'un plan qui doivent encore : c'est à elles que le plan s'applique encore. */
export const piecesQuiDoivent = <P extends { id: string }>(e: EtatDuPlan, pieces: readonly P[], resteDe: (p: P) => number): P[] =>
  pieces.filter((p) => e.pieceIds.includes(p.id) && resteDe(p) > 0);

/** Le rappel groupé de factures de jours différents attend le modèle du point chez Meta. */
export const attendLeModeleDuPoint = (datesDesPieces: readonly string[], modelePoint: boolean): boolean =>
  !modelePoint && new Set(datesDesPieces).size > 1;

/* ── LA PIÈCE DU RESTE ──────────────────────────────────────────────────── */

/** LA PIÈCE QUI RÉCLAME CE QUI RESTE D'UN RITUEL DÉJÀ PAYÉ EN PARTIE —
    21 novembre 2026. `factureAEnvoyer` émet la pièce d'un rituel au net
    ENTIER : juste pour un rituel où rien n'est versé, faux pour un rituel
    dont la Caisse a déjà encaissé une part (son reçu porte ce qui est payé) :
    la relance réclamerait le prix entier. La pièce du reste porte UNE ligne
    « Règlement · … » au montant dû : c'est la forme que l'alignement des
    pièces reconnaît (il n'en touche que le libellé, jamais le total). Une
    remise posée ensuite sur le rituel la remet au nouveau reste
    (`resteAJour`). */
export const LIBELLE_DU_RESTE = (rituel: string): string => `Règlement · ${rituel}`;
export const estUnePieceDuReste = (p: { lines: readonly { label: string }[] }): boolean =>
  p.lines.length === 1 && p.lines[0].label.startsWith('Règlement ·');

/** La pièce du reste, remise au montant dû : seulement si elle n'a encore rien reçu ; rien si rien ne change. */
export function resteAJour<P extends { lines: { label: string; unitXof: number; qty: number }[]; payments?: readonly unknown[] }>(p: P, duXof: number): P | null {
  if (!estUnePieceDuReste(p) || (p.payments?.length ?? 0) > 0) return null;
  const du = Math.max(0, Math.round(duXof));
  if (p.lines[0].unitXof === du && p.lines[0].qty === 1) return null;
  return { ...p, lines: [{ ...p.lines[0], qty: 1, unitXof: du }] };
}

/* ── L'ÉDITION D'UN RENDEZ-VOUS SUR LA PAGE ─────────────────────────────── */

export type RemiseDeLigne = { pct?: number; xof?: number } | null;
/** Ce que l'éditeur touche d'un rendez-vous : trois tableaux PARALLÈLES, indexés comme `serviceIds`. */
export type LignesDuRituel = { serviceIds: string[]; remisesLignes?: RemiseDeLigne[]; mains?: string[][] };

/** Les tableaux parallèles, complétés à la longueur de `serviceIds` (une remise ou une main absente vaut « rien »). */
function alignes(a: LignesDuRituel): { serviceIds: string[]; remisesLignes: RemiseDeLigne[]; mains: string[][] } {
  const n = a.serviceIds.length;
  return {
    serviceIds: [...a.serviceIds],
    remisesLignes: Array.from({ length: n }, (_, i) => a.remisesLignes?.[i] ?? null),
    mains: Array.from({ length: n }, (_, i) => [...(a.mains?.[i] ?? [])]),
  };
}

/** Le rendu propre : pas de tableau vide ni de remise nulle écrits pour rien. */
function propres(x: { serviceIds: string[]; remisesLignes: RemiseDeLigne[]; mains: string[][] }): LignesDuRituel {
  const remises = x.remisesLignes.map((r) => (r && ((r.pct ?? 0) > 0 || (r.xof ?? 0) > 0) ? r : null));
  return {
    serviceIds: x.serviceIds,
    ...(remises.some(Boolean) ? { remisesLignes: remises } : { remisesLignes: undefined }),
    ...(x.mains.some((m) => m.length) ? { mains: x.mains } : { mains: undefined }),
  };
}

/** RETIRER LA LIGNE i : la prestation, SA remise et SES mains partent ensemble (jamais la voisine). La dernière ne se retire pas. */
export function retireLaLigne(a: LignesDuRituel, i: number): LignesDuRituel {
  const x = alignes(a);
  if (x.serviceIds.length <= 1 || i < 0 || i >= x.serviceIds.length) return propres(x);
  x.serviceIds.splice(i, 1); x.remisesLignes.splice(i, 1); x.mains.splice(i, 1);
  return propres(x);
}

/** AJOUTER UNE PRESTATION en dernière ligne, sans remise, faite par le maître du rendez-vous (mains vides). */
export function ajouteLaLigne(a: LignesDuRituel, serviceId: string): LignesDuRituel {
  const x = alignes(a);
  if (!serviceId) return propres(x);
  x.serviceIds.push(serviceId); x.remisesLignes.push(null); x.mains.push([]);
  return propres(x);
}

/** LA REMISE DE LA LIGNE i, en % (0 à 100) ou en francs (jamais négatifs) ; une saisie vide l'efface. */
export function poseLaRemiseDeLigne(a: LignesDuRituel, i: number, saisie: number, unite: '%' | 'F'): LignesDuRituel {
  const x = alignes(a);
  if (i < 0 || i >= x.serviceIds.length) return propres(x);
  const n = Math.max(0, Math.round(Number(saisie) || 0));
  x.remisesLignes[i] = n > 0 ? (unite === '%' ? { pct: Math.min(100, n) } : { xof: n }) : null;
  return propres(x);
}

/** La remise d'une ligne, lue pour l'écran : la saisie et son unité. */
export function remiseLue(a: LignesDuRituel, i: number): { valeur: number; unite: '%' | 'F' } {
  const r = a.remisesLignes?.[i];
  if (r?.pct) return { valeur: r.pct, unite: '%' };
  if (r?.xof) return { valeur: r.xof, unite: 'F' };
  return { valeur: 0, unite: '%' };
}

/** Les lignes ont-elles changé (prestations ou remises de ligne) ? C'est alors que le prix se relit au tarif de la tête. */
export function lignesChangees(avant: LignesDuRituel, apres: LignesDuRituel): boolean {
  const a = alignes(avant);
  const b = alignes(apres);
  const r = (x: RemiseDeLigne) => `${x?.pct ?? 0}/${x?.xof ?? 0}`;
  return a.serviceIds.join('|') !== b.serviceIds.join('|') || a.remisesLignes.map(r).join('|') !== b.remisesLignes.map(r).join('|');
}

/** UNE REMISE AJOUTÉE SUR LE RITUEL, en francs : un pourcentage se lit sur `baseXof` (ce qu'il vaut avant elle),
    arrondi au franc ; jamais plus que `plafondXof` (ce qui reste à régler, quand de l'argent est déjà reçu). */
export function remiseAjouteeXof(baseXof: number, saisie: number, unite: '%' | 'F', plafondXof: number): number {
  const n = Math.max(0, Number(saisie) || 0);
  const brute = unite === '%' ? Math.round(Math.max(0, baseXof) * Math.min(100, n) / 100) : Math.round(n);
  return Math.max(0, Math.min(brute, Math.max(0, Math.round(plafondXof))));
}

/** CE QU'ON PEUT FAIRE D'UN RENDEZ-VOUS SUR LA PAGE :
    · `tout` : un rituel passé, sans argent reçu ni remise famille : ses prestations, leurs remises, une remise en plus ;
    · `remises` : un rendez-vous à venir (sa durée et son fauteuil se règlent dans sa fenêtre) : les remises de ligne
      et une remise en plus ;
    · `ajout` : de l'argent déjà reçu (une remise sur ce qui reste), ou une remise famille (elle se recalcule dans sa
      fenêtre quand les lignes changent) : une remise en plus, rien d'autre ;
    · `fenetre` : un forfait, une formule, une séance de suite, une prestation sur devis, un annulé, ou rien à remiser. */
export type GesteDuPoint = 'tout' | 'remises' | 'ajout' | 'fenetre';
export function gesteDuPoint(o: {
  annule: boolean; aVenir: boolean; argentRecu: boolean; resteXof: number; netXof: number; remiseFamille: boolean;
  forfait: boolean; couvert: boolean; suite: boolean; prixLibre: boolean;
}): GesteDuPoint {
  if (o.annule || o.forfait || o.couvert || o.suite) return 'fenetre';
  if (o.argentRecu) return o.resteXof > 0 ? 'ajout' : 'fenetre';
  if (o.prixLibre) return 'fenetre';
  if (o.remiseFamille) return o.netXof > 0 ? 'ajout' : 'fenetre';
  if (o.aVenir) return 'remises';
  return 'tout';
}
