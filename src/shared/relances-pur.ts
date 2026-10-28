/* ══ LES RELANCES D'UNE FACTURE À RÉGLER — 18 octobre 2026 ══════════════
   « Comment je fais des messages de relance tant que la cliente n'a pas
   payé ? » (Yéman). Maquette « Les relances » (public/maquette-les-
   relances.html), validée le 18 octobre 2026, ses choix lus en base
   `maquette/relances` :
     · cadence J+1, J+3, J+7, J+14 (quatre relances), à 10 h ;
     · toute facture qui reste à régler ;
     · les factures du lancement et après, plus celles des trente jours
       d'avant, une fois la liste validée ;
     · elle répond : tout s'arrête, la conversation passe à l'équipe ;
     · elles partent seules ; après la dernière, « Appeler » dans À faire ;
     · ton doux, sans PDF, un bouton « Régler » (Tap & Go) ;
     · toute personne qui encaisse peut mettre en pause.

   LA DATE QUI JUGE EST CELLE DE LA FACTURE (une date métier), jamais une
   écriture. Une facture rattrapée compte ses relances depuis le jour où la
   liste a été validée : comptées depuis sa date, ses quatre relances, toutes
   « en retard », partiraient quatre jours de suite.

   Ce bloc est RECOPIÉ dans supabase/functions/relances-factures (une fonction
   Edge ne lit rien du dépôt) ; scripts/verifie-les-relances tient les deux
   textes ensemble. */

// ── DEBUT relances (copie dans supabase/functions/relances-factures, éprouvée par scripts/verifie-les-relances)
export type ReglagesRelances = {
  /** Allumées par la direction (Paramètres › Relances). */
  actives?: boolean;
  /** Le jour du lancement : les factures datées de ce jour ou après se relancent d'office. */
  depuis?: string;
  /** Les trente jours d'avant le lancement, validés une fois, facture par facture. */
  rattrapage?: { valideLe: string; par?: string; ids: string[] };
  /** LES RYTHMES — 28 octobre 2026, « comment je réajuste les dates de relances
      pour les particuliers, les comptes famille » (Yéman) : les jours des
      relances, comptés depuis le départ, réglés dans Paramètres. Absents ou
      malformés, ceux d'origine. */
  rythmes?: { seule?: number[]; famille?: number[] };
  /** Ce que « Vérifier » a vu : le modèle du rappel du point est nommé au
      serveur. Le Trône le lit pour dire juste ; le serveur, lui, lit son secret. */
  modelePoint?: boolean;
};

/** J+1, J+3, J+7, J+14 : les jours des quatre relances d'une cliente seule, comptés depuis le départ. */
export const CADENCE_DES_RELANCES: readonly number[] = [1, 3, 7, 14];
/** Le rythme d'un compte famille, son choix au sélecteur le 28 octobre 2026 :
    une semaine, deux semaines, un mois. Trois relances. */
export const CADENCE_DES_FAMILLES: readonly number[] = [7, 14, 30];
/** Au plus six relances, la dernière au plus quatre-vingt-dix jours après le départ. */
export const RELANCES_AU_PLUS = 6;
export const JOURS_AU_PLUS = 90;
/** Ce que le rattrapage peut reprendre avant le lancement. */
export const JOURS_DE_RATTRAPAGE = 30;

/** Un rythme sain : des jours entiers, croissants, de 1 à 90, six au plus ; sinon `null`. */
export function rythmeValide(xs: unknown): number[] | null {
  if (!Array.isArray(xs) || xs.length === 0 || xs.length > RELANCES_AU_PLUS) return null;
  let avant = 0;
  for (const x of xs) {
    if (typeof x !== 'number' || !Number.isInteger(x) || x <= avant || x > JOURS_AU_PLUS) return null;
    avant = x;
  }
  return [...xs] as number[];
}

/** LE RYTHME D'UNE RELANCE : celui des comptes famille quand elle part à une
    fiche d'un compte famille, sinon celui des clientes seules. */
export const rythmeDe = (r: ReglagesRelances | undefined, famille: boolean): number[] =>
  famille ? rythmeValide(r?.rythmes?.famille) ?? [...CADENCE_DES_FAMILLES] : rythmeValide(r?.rythmes?.seule) ?? [...CADENCE_DES_RELANCES];

/** UNE RELANCE DÉCALÉE AU COMPTOIR (« il paie le 5 ») : la relance de rang
    `rang` part le jour `au`, et les suivantes gardent leurs écarts depuis elle. */
export type DecalageDesRelances = { au: string; rang: number; le: string; par?: string };

/** LE JOUR DE LA RELANCE n (1 à la longueur du rythme), décalage compris. */
export function jourDeLaRelance(depart: string, cadence: readonly number[], n: number, decalage?: DecalageDesRelances | null): string | null {
  if (!(n >= 1 && n <= cadence.length)) return null;
  const d = decalage && /^\d{4}-\d{2}-\d{2}$/.test(decalage.au) && decalage.rang >= 1 && decalage.rang <= cadence.length ? decalage : null;
  if (!d || n < d.rang) return jourPlusR(depart, cadence[n - 1]);
  return jourPlusR(d.au, cadence[n - 1] - cadence[d.rang - 1]);
}

/** Le décalage d'un rappel qui porte plusieurs factures : le plus récent posé sur l'une d'elles. */
export const decalageDe = (pieces: readonly { relancesDecalage?: DecalageDesRelances }[]): DecalageDesRelances | null =>
  pieces.map((p) => p.relancesDecalage).filter((x): x is DecalageDesRelances => !!x?.le).sort((a, b) => a.le.localeCompare(b.le)).pop() ?? null;

export const jourPlusR = (iso: string, j: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + j);
  return d.toISOString().slice(0, 10);
};

/** L'identifiant d'une relance au journal des envois : une par facture et par rang. */
export const idDeLaRelance = (factureId: string, n: number): string => `rl-${factureId}-${n}-whatsapp`;

/** Une facture (jamais un devis, jamais un brouillon). */
export const seRelance = (f: { kind?: string; status?: string }): boolean =>
  f.kind === 'facture' && f.status !== 'brouillon';

/** LE JOUR D'OÙ SE COMPTENT SES RELANCES, ou null si elle n'en a pas.
    18 OCTOBRE 2026, « ne pas faire voir mon retard aux clients » (Yéman) :
    une pièce écrite APRÈS son jour (le rituel d'hier saisi ce matin) ne se
    relance pas seule ; la cliente a peut-être payé ce jour-là, et la
    relancer ferait voir le retard. Seules se relancent seules les pièces
    écrites le jour même (ou avant, un rituel prépayé), et celles que la
    direction a cochées au rattrapage. `jourDe` rend le jour local d'un instant. */
export function departDesRelances(f: { id: string; date: string; creeeLe?: string }, r: ReglagesRelances | undefined, jourDe: (iso: string) => string): string | null {
  const depuis = r?.depuis ?? '';
  if (!r?.actives || !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) return null;
  const rt = r.rattrapage;
  if (rt && /^\d{4}-\d{2}-\d{2}$/.test(rt.valideLe) && rt.ids.includes(f.id) && f.date >= jourPlusR(depuis, -JOURS_DE_RATTRAPAGE)) {
    return rt.valideLe > f.date ? rt.valideLe : f.date;
  }
  if (f.date >= depuis && !!f.creeeLe && jourDe(f.creeeLe) <= f.date) return f.date;
  return null;
}

/** LA RELANCE À POSER AUJOURD'HUI (1 à la longueur du rythme), ou null.
    `parties` : les relances déjà déposées (un échec ne compte pas, il se
    retente) ; `derniereLe` : le jour de la dernière, pour qu'aucune cliente
    n'en reçoive deux le même jour. Sans rythme dit, celui d'une cliente seule. */
export function relanceDuJour(o: {
  depart: string | null; parties: number; derniereLe?: string; aujourdhui: string;
  resteXof: number; enPause: boolean; aRepondu: boolean;
  cadence?: readonly number[]; decalage?: DecalageDesRelances | null;
}): number | null {
  const cadence = o.cadence ?? CADENCE_DES_RELANCES;
  if (!o.depart || !(o.resteXof > 0) || o.enPause || o.aRepondu) return null;
  if (o.parties >= cadence.length) return null;
  if (o.derniereLe && o.derniereLe >= o.aujourdhui) return null;
  const jour = jourDeLaRelance(o.depart, cadence, o.parties + 1, o.decalage);
  return jour !== null && jour <= o.aujourdhui ? o.parties + 1 : null;
}

/** Elle a écrit à la Maison depuis la première relance : tout s'arrête. */
export const aReponduDepuis = (messages: readonly { sens?: string; quand?: string }[], depuisIso: string | undefined): boolean =>
  !!depuisIso && messages.some((m) => m.sens === 'entrant' && (m.quand ?? '') > depuisIso);

/** Les verdicts du journal qui ne comptent pas comme une relance partie. */
export const RELANCE_A_RETENTER = new Set(['échec', 'périmé']);

export type LigneDeRelance = { id: string; statut?: string; quand?: string; numero?: string; invoiceIds?: readonly string[] };

/** LES RELANCES DÉJÀ PARTIES D'UN CYCLE — 28 octobre 2026. Celles de ses
    factures (leurs suites à elles, et les rappels groupés qui les portent),
    parties depuis son départ À CE NUMÉRO. Passer d'une facture seule à un
    rappel groupé, ou l'inverse, ne recommence jamais la suite : sinon un
    payeur dont les relances étaient faites en recevrait une par jour, quatre
    jours de suite (le trou vu par le-trone-15 au lot 3). Une relance partie
    à quelqu'un d'autre (l'enfant, avant que la règle du parent ne tienne) ne
    compte pas pour le payeur. Un échec ne compte pas, il se retente. */
export function partiesDuCycle(o: {
  factureIds: readonly string[]; depart: string; journal: readonly LigneDeRelance[]; jourDe: (iso: string) => string; numero?: string | null;
}): { parties: number; derniereLe?: string; premiereQuand?: string } {
  const chiffres = (t?: string | null) => (t ?? '').replace(/\D/g, '');
  const leNumero = chiffres(o.numero);
  const portees = new Set(o.factureIds);
  const siennes = new Set(o.factureIds.flatMap((id) => Array.from({ length: RELANCES_AU_PLUS }, (_, k) => idDeLaRelance(id, k + 1))));
  const vues = new Set<string>();
  let derniereLe: string | undefined;
  let premiereQuand: string | undefined;
  for (const l of o.journal) {
    if (vues.has(l.id) || !l.quand || RELANCE_A_RETENTER.has(l.statut ?? '')) continue;
    if (!siennes.has(l.id) && !(l.id.startsWith('rl-pt-') && (l.invoiceIds ?? []).some((x) => portees.has(x)))) continue;
    if (leNumero && l.numero && chiffres(l.numero) !== leNumero) continue;
    const jour = o.jourDe(l.quand);
    if (!jour || jour < o.depart) continue;
    vues.add(l.id);
    if (!derniereLe || jour > derniereLe) derniereLe = jour;
    if (!premiereQuand || l.quand < premiereQuand) premiereQuand = l.quand;
  }
  return { parties: vues.size, ...(derniereLe ? { derniereLe } : {}), ...(premiereQuand ? { premiereQuand } : {}) };
}

/** Numéro béninois → format international sans « + » (copie de numeroIntl des fonctions). */
export const numeroDeRelance = (brut: string | null | undefined): string | null => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

export type TeteDeRelance = { id: string; name?: string; phone?: string; familyId?: string; archived?: boolean };

/** LES COMPTES FAMILLE PAR NUMÉRO : deux frères inscrits au numéro du parent,
    l'un dans le compte famille, l'autre pas encore. Un numéro qui désigne
    deux comptes ne désigne personne. */
export function foyersParNumero(fiches: Iterable<TeteDeRelance>): Map<string, string> {
  const vus = new Map<string, string | null>();
  for (const f of fiches) {
    const n = numeroDeRelance(f.phone);
    if (!n || n.length < 8 || !f.familyId) continue;
    const avant = vus.get(n);
    vus.set(n, avant === undefined || avant === f.familyId ? f.familyId : null);
  }
  const m = new Map<string, string>();
  for (const [n, foyer] of vus) if (foyer) m.set(n, foyer);
  return m;
}

/** Le compte famille d'une fiche : le sien, sinon celui de son numéro. */
export const foyerDeLaFiche = (f: TeteDeRelance | undefined, parNumero: ReadonlyMap<string, string>): string | undefined =>
  f?.familyId ?? parNumero.get(numeroDeRelance(f?.phone) ?? '');

/** À QUI VA UNE RELANCE — 28 octobre 2026, « les messages de relance doivent
    partir au parent » (Yéman, après un rappel parti à l'enfant). Au payeur du
    compte famille de l'une de ses fiches, s'il a un numéro ; sinon la première
    de ses fiches qui a un numéro ; sinon la dernière. `ids` : la payeuse de la
    pièce, puis celle qu'elle concerne. `famille` : l'une d'elles est d'un
    compte famille qui a son payeur (le rythme des familles s'applique). */
export function destinataireDeLaRelance(
  ids: readonly (string | undefined)[], fiches: ReadonlyMap<string, TeteDeRelance>,
  payeurDuFoyer: ReadonlyMap<string, string>, parNumero: ReadonlyMap<string, string>,
): { fiche?: TeteDeRelance; famille: boolean } {
  const connues = ids.filter((x): x is string => !!x).map((id) => fiches.get(id)).filter((x): x is TeteDeRelance => !!x);
  let famille = false;
  for (const f of connues) {
    const payeurId = payeurDuFoyer.get(foyerDeLaFiche(f, parNumero) ?? '');
    if (!payeurId) continue;
    famille = true;
    const payeur = fiches.get(payeurId);
    if (payeur && numeroDeRelance(payeur.phone)) return { fiche: payeur, famille };
  }
  return { fiche: connues.find((f) => !!numeroDeRelance(f.phone)) ?? connues[connues.length - 1], famille };
}

/** UN RAPPEL POUR PLUSIEURS FACTURES D'UN MÊME PAYEUR (28 octobre 2026, son
    choix au sélecteur) : avec le modèle du point, toujours ; sans lui,
    seulement si toutes sont du même jour, avec le modèle déjà approuvé
    (« votre facture du 27 octobre 2026 attend encore son règlement, reste
    40 000 F ») ; des jours différents attendent le modèle du point. */
export const formeDuRappel = (jours: readonly string[], modelePoint: boolean): 'point' | 'jour' | 'attend' =>
  modelePoint ? 'point' : new Set(jours).size === 1 ? 'jour' : 'attend';

/** LE RAPPEL DU POINT — 28 octobre 2026, « un seul rappel par payeur »
    (maquette du point du compte VZ7F7MNJ…) : les factures ordinaires d'un
    même payeur se rappellent ensemble dès deux, en un message et un total.
    Leur suite J+1, J+3, J+7, J+14 se compte depuis la plus récente : une
    nouvelle visite relance le cycle, sous un identifiant neuf. */
export const idDuRappelDuPoint = (payeurId: string, depart: string, n: number): string => `rl-pt-${payeurId}-${depart}-${n}-whatsapp`;
/** Le départ du rappel du point : celui de sa facture la plus récente. */
export const departDuPoint = (departs: readonly (string | null)[]): string | null =>
  departs.filter((d): d is string => !!d).sort().pop() ?? null;
// ── FIN relances

/* ══ LES RELANCES D'UNE ÉCHÉANCE DE FORMULE — 20 octobre 2026 ══════════════
   La pièce d'une formule se relance ÉCHÉANCE PAR ÉCHÉANCE (la fonction
   relances-factures écrit `rl-<pièce>-e<k>-<n>`). Hors du bloc copié au
   serveur, qui garde son texte : on relit la suite de la plus récente
   échéance relancée comme une suite ordinaire, puis le même juge parle. */
/** L'identifiant d'une relance d'ÉCHÉANCE de formule : une suite par échéance. */
export const idDeLaRelanceDEcheance = (factureId: string, numero: number, n: number): string =>
  `rl-${factureId}-e${numero}-${n}-whatsapp`;

/** LA PLUS RÉCENTE ÉCHÉANCE RELANCÉE de cette pièce, ou `null` (pièce ordinaire). */
export function derniereEcheanceRelancee(factureId: string, journal: readonly { id: string }[]): number | null {
  const tete = `rl-${factureId}-e`;
  let k: number | null = null;
  for (const l of journal) {
    if (!l.id.startsWith(tete)) continue;
    const m = /^(\d+)-\d+-whatsapp$/.exec(l.id.slice(tete.length));
    if (m) k = Math.max(k ?? 0, Number(m[1]));
  }
  return k;
}

/** L'identifiant d'une relance du RESTE DE RÉSILIATION (le consommé au-delà
    du réglé, dû à la date de résiliation). */
export const idDeLaRelanceDeResiliation = (factureId: string, n: number): string =>
  `rl-${factureId}-r-${n}-whatsapp`;

/** CE QUE L'ÉCRAN DIT DES RELANCES D'UNE PIÈCE, la pièce d'une formule
    comprise : la suite du reste de résiliation s'il est relancé (il vient en
    dernier), sinon celle de sa plus récente échéance relancée, sinon la sienne. */
export function etatDesRelancesDeLaPiece(o: Parameters<typeof etatDesRelances>[0]): ReturnType<typeof etatDesRelances> & { point?: true } {
  /* Rappelée avec ses autres factures (le rappel du point, 28 octobre 2026) : la suite du point fait foi. */
  const pt = rappelDuPointDeLaPiece(o.factureId, o.journal);
  if (pt) return { ...etatDesRelances({ ...o, depart: pt.depart, journal: pt.lignes }), point: true };
  const resiliation = o.journal.some((x) => x.id.startsWith(`rl-${o.factureId}-r-`));
  const k = resiliation ? null : derniereEcheanceRelancee(o.factureId, o.journal);
  if (!resiliation && k === null) return etatDesRelances(o);
  const journal: LigneDeRelance[] = [];
  for (let n = 1; n <= RELANCES_AU_PLUS; n++) {
    const id = resiliation ? idDeLaRelanceDeResiliation(o.factureId, n) : idDeLaRelanceDEcheance(o.factureId, k as number, n);
    const l = o.journal.find((x) => x.id === id);
    if (l) journal.push({ ...l, id: idDeLaRelance(o.factureId, n) });
  }
  return etatDesRelances({ ...o, journal });
}

/** Une pause posée au comptoir (« elle passe régler samedi »). */
export type PauseDesRelances = { le: string; par?: string };

/** LE RAPPEL DU POINT D'UNE PIÈCE — 28 octobre 2026 : la suite la plus récente
    d'un rappel du point qui la porte (`invoiceIds`), relue comme une suite
    ordinaire de la pièce ; `null` si aucun rappel du point ne la porte. */
export function rappelDuPointDeLaPiece(factureId: string, journal: readonly LigneDeRelance[]): { depart: string; lignes: LigneDeRelance[] } | null {
  let tete: { depart: string; prefixe: string } | null = null;
  for (const l of journal) {
    if (!l.invoiceIds?.includes(factureId)) continue;
    const m = /^(rl-pt-.+-(\d{4}-\d{2}-\d{2}))-\d+-whatsapp$/.exec(l.id);
    if (m && (!tete || m[2] > tete.depart)) tete = { depart: m[2], prefixe: m[1] };
  }
  if (!tete) return null;
  const lignes: LigneDeRelance[] = [];
  for (let n = 1; n <= RELANCES_AU_PLUS; n++) {
    const l = journal.find((x) => x.id === `${tete.prefixe}-${n}-whatsapp`);
    if (l) lignes.push({ ...l, id: idDeLaRelance(factureId, n) });
  }
  return { depart: tete.depart, lignes };
}

type EtatDesRelances = { parties: number; derniereLe?: string; prochaine?: string; fini: boolean; total: number };

/** La prochaine relance d'une suite : son jour, jamais avant demain si une est partie aujourd'hui. */
function prochaineDe(o: {
  depart: string | null; parties: number; derniereLe?: string; aujourdhui: string; resteXof: number; enPause: boolean;
  cadence: readonly number[]; decalage?: DecalageDesRelances | null;
}): string | undefined {
  if (!o.depart || o.parties >= o.cadence.length || !(o.resteXof > 0) || o.enPause) return undefined;
  const j = jourDeLaRelance(o.depart, o.cadence, o.parties + 1, o.decalage) ?? o.aujourdhui;
  const apres = o.derniereLe ? jourPlusR(o.derniereLe, 1) : o.aujourdhui;
  const plusTot = j > o.aujourdhui ? j : o.aujourdhui;
  return plusTot > apres ? plusTot : apres;
}

/** CE QUE L'ÉCRAN DIT D'UNE FACTURE : combien sont parties, la dernière, la
    prochaine, et si tout est fini. Lu du journal des envois. */
export function etatDesRelances(o: {
  factureId: string; depart: string | null; journal: readonly LigneDeRelance[];
  resteXof: number; enPause: boolean; aujourdhui: string; jourDe: (iso: string) => string;
  cadence?: readonly number[]; decalage?: DecalageDesRelances | null;
}): EtatDesRelances {
  const cadence = o.cadence ?? CADENCE_DES_RELANCES;
  let parties = 0;
  let derniereLe: string | undefined;
  for (let n = 1; n <= cadence.length; n++) {
    const l = o.journal.find((x) => x.id === idDeLaRelance(o.factureId, n));
    if (!l || RELANCE_A_RETENTER.has(l.statut ?? '')) break;
    parties = n;
    if (l.quand) derniereLe = o.jourDe(l.quand);
  }
  const fini = parties >= cadence.length;
  const prochaine = prochaineDe({ ...o, parties, derniereLe, cadence });
  return { parties, ...(derniereLe ? { derniereLe } : {}), ...(prochaine ? { prochaine } : {}), fini, total: cadence.length };
}

/** LA SUITE D'UN CYCLE (une facture ordinaire, seule ou dans un rappel
    groupé), comptée comme au serveur (`partiesDuCycle`). */
export function etatDuCycle(o: {
  factureIds: readonly string[]; depart: string | null; journal: readonly LigneDeRelance[];
  resteXof: number; enPause: boolean; aujourdhui: string; jourDe: (iso: string) => string;
  cadence: readonly number[]; decalage?: DecalageDesRelances | null; numero?: string | null;
}): EtatDesRelances {
  const c = o.depart ? partiesDuCycle({ factureIds: o.factureIds, depart: o.depart, journal: o.journal, jourDe: o.jourDe, numero: o.numero }) : { parties: 0 };
  const parties = Math.min(c.parties, o.cadence.length);
  const fini = parties >= o.cadence.length;
  const prochaine = prochaineDe({ ...o, parties, derniereLe: c.derniereLe });
  return { parties, ...(c.derniereLe ? { derniereLe: c.derniereLe } : {}), ...(prochaine ? { prochaine } : {}), fini, total: o.cadence.length };
}

/** APRÈS LA DERNIÈRE : la direction appelle, le lendemain de la dernière
    relance de son rythme, si rien n'est réglé et que personne n'a mis de pause. */
export const aAppeler = (e: { parties: number; derniereLe?: string; total?: number }, o: { resteXof: number; enPause: boolean; aujourdhui: string }): boolean =>
  e.parties >= (e.total ?? CADENCE_DES_RELANCES.length) && !!e.derniereLe && e.derniereLe < o.aujourdhui && o.resteXof > 0 && !o.enPause;

/* ══ LA RELANCE D'UNE PIÈCE, AU TRÔNE — 28 octobre 2026 ══════════════════
   Ce que la tournée de 10 h fera de cette facture, jugé comme elle : à qui
   (le payeur du compte famille d'abord), avec quelles autres factures du même
   numéro, sur quel rythme, et où en est la suite. Le serveur lit en plus les
   liens payés que personne n'a encore inscrits ; le Trône, lui, les a déjà. */
export type PieceDeRelance = {
  id: string; kind?: string; status?: string; date: string; creeeLe?: string; branchId?: string;
  clientId: string; forClientId?: string; note?: string;
  relancesPause?: PauseDesRelances; relancesDecalage?: DecalageDesRelances;
};
export type RelanceDeLaPiece<P extends PieceDeRelance = PieceDeRelance> = {
  depart: string;
  /** Les factures que ce rappel porte, celle-ci comprise (une seule : un rappel à elle). */
  membres: P[];
  destinataire?: TeteDeRelance;
  famille: boolean;
  /** `seule` : sa suite à elle ; `point`, `jour` : un rappel pour toutes ; `attend` : des jours différents, le modèle du point manque. */
  forme: 'seule' | 'point' | 'jour' | 'attend';
  cadence: number[];
  decalage: DecalageDesRelances | null;
  enPause: boolean;
  resteXof: number;
  etat: EtatDesRelances;
};

export function relanceDeLaPiece<P extends PieceDeRelance>(o: {
  piece: P; pieces: readonly P[]; fiches: readonly TeteDeRelance[]; familles: readonly { id: string; payerClientId?: string }[];
  reglages: ReglagesRelances | undefined; journal: readonly LigneDeRelance[]; aujourdhui: string;
  jourDe: (iso: string) => string; resteDe: (p: P) => number; estFormule?: (p: P) => boolean;
}): RelanceDeLaPiece<P> | null {
  const r = o.reglages;
  const vivante = (p: P) => seRelance(p) && !o.estFormule?.(p) && departDesRelances(p, r, o.jourDe) !== null && o.resteDe(p) > 0;
  if (!vivante(o.piece)) return null;
  const fichesParId = new Map(o.fiches.map((f) => [f.id, f]));
  const parNumero = foyersParNumero(o.fiches);
  const payeurDuFoyer = new Map(o.familles.filter((f) => !!f.payerClientId).map((f) => [f.id, f.payerClientId as string]));
  const dest = (p: P) => destinataireDeLaRelance([p.clientId, p.forClientId ?? p.clientId], fichesParId, payeurDuFoyer, parNumero);
  const sienne = dest(o.piece);
  const tel = numeroDeRelance(sienne.fiche?.phone);
  const membres = tel && !sienne.fiche?.archived
    ? o.pieces.filter((p) => (p.id === o.piece.id || vivante(p)) && numeroDeRelance(dest(p).fiche?.phone) === tel && !dest(p).fiche?.archived)
    : [o.piece];
  const groupe = membres.length > 1;
  const departs = membres.map((p) => departDesRelances(p, r, o.jourDe));
  const depart = groupe ? departDuPoint(departs) as string : departs[0] as string;
  const forme = groupe ? formeDuRappel(membres.map((p) => p.date), !!r?.modelePoint) : 'seule';
  const famille = groupe ? membres.some((p) => dest(p).famille) : sienne.famille;
  const cadence = rythmeDe(r, famille);
  const decalage = decalageDe(membres);
  const enPause = membres.some((p) => !!p.relancesPause);
  const resteXof = membres.reduce((s, p) => s + o.resteDe(p), 0);
  const etat = etatDuCycle({
    factureIds: membres.map((p) => p.id), depart, journal: o.journal, resteXof, enPause: enPause || forme === 'attend',
    aujourdhui: o.aujourdhui, jourDe: o.jourDe, cadence, decalage, numero: tel,
  });
  return { depart, membres, ...(sienne.fiche ? { destinataire: sienne.fiche } : {}), famille, forme, cadence, decalage, enPause, resteXof, etat };
}
