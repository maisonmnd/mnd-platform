import { EST_ACTIVITE, CAISSE_POURBOIRES, type Receipt } from './receipts';

/* ══ LE POINTAGE DU JOUR ET LA CAISSE DU SOIR — 3 octobre 2026 ══════════
   « Comment pointer les revenus du jour ? et faciliter le contrôle des
   caisses ? » (Yéman). Maquette « Le pointage du jour », validée.

   Ce module ne touche ni écran ni base : il dit les RÈGLES, et le harnais
   `verifie-caisse-du-soir` les éprouve. Les arbitrages du 3 octobre :
     - le revenu du jour ne compte que l'ARGENT REÇU ce jour-là ;
     - chaque tiroir se compte chaque soir par son porteur ;
     - le Mobile Money se pointe par le relevé MTN gardé, ou à la main ;
     - un écart n'est jamais bloquant, mais ne se clôture pas sans être
       expliqué, et seule la direction (souverain) l'accepte ou le reprend ;
     - un écart qui est une dépense de la Maison s'écrit comme une dépense,
       et l'attendu se refait ;
     - un fond fixe reste dans le tiroir, le surplus est proposé au coffre. */

/** LA FAÇON DONT UNE LIGNE A ÉTÉ POINTÉE À LA MAIN OU PAR LE RELEVÉ. Les deux
    autres (KkiaPay, comptage du tiroir) se déduisent : on ne les écrit pas. */
export type FaconDePointer = 'releve' | 'main';

/** UN POINTAGE : une ligne du registre reconnue comme réellement reçue.
    Son identifiant EST celui de la ligne (`Receipt.id`, stable) : pointer
    deux fois la même ligne réécrit le même document, jamais un second. */
export type Pointage = {
  id: string;
  branchId: string;
  /** Le jour de la ligne pointée. */
  date: string;
  montantXof: number;
  comment: FaconDePointer;
  /** Qui a pointé, et quand (ISO). */
  par: string;
  le: string;
  /** La référence lue au relevé (n° de transaction MTN). */
  ref?: string;
};

export const TABLE_POINTAGES = 'pointages';
export const TABLE_CLOTURES = 'clotures_caisse';

/** LA CLÔTURE D'UN TIROIR, UN SOIR. Rien ne l'efface : une reprise est une
    clôture de plus, qui nomme celle qu'elle reprend. */
export type Cloture = {
  id: string;
  branchId: string;
  cashbox: string;
  /** Le jour clôturé (ISO). */
  date: string;
  /** Ce que le Trône attendait dans le tiroir. */
  attenduXof: number;
  /** Ce que la main a compté. */
  compteXof: number;
  /** compté − attendu : négatif = il manque, positif = il y a trop. */
  ecartXof: number;
  /** Le billetage, quand il a servi : { '10000': 9, …, pieces: 750 }. */
  billets?: Record<string, number>;
  /** Pourquoi l'écart. Obligatoire dès qu'il y en a un. */
  note?: string;
  /** Les dépenses écrites PENDANT la clôture (« c'était une dépense »). */
  depenses?: string[];
  /** Le fond fixe qui reste dans le tiroir. */
  fondXof: number;
  /** Ce qui est parti au coffre à la clôture. */
  verseAuCoffreXof: number;
  /** Ce qui reste dans le tiroir après la clôture : compté − versé. */
  laisseXof: number;
  /** Le solde du LIVRE au moment de la clôture, versement au coffre fait.
      C'est lui qui permet au prochain soir de ne compter que ce qui a bougé
      depuis — un encaissement saisi après la clôture n'est jamais perdu. */
  livreXof: number;
  /** Le livre de cette clôture compte les mouvements hors activité du tiroir
      (prêt reçu, échéance, prélèvement…). Posé sur toute clôture depuis le
      10 octobre 2026 ; absent avant. Voir `livreDeLaCloture`. */
  livreAvecHorsActivite?: boolean;
  par: string;
  le: string;
  /** La clôture que celle-ci reprend, quand la direction l'a rouverte. */
  reprend?: string;
  validation?: ValidationDeCloture;
};

export type ValidationDeCloture = {
  verdict: 'accepte' | 'repris';
  par: string;
  le: string;
  /** Le mot de la direction quand elle reprend. */
  mot?: string;
};

/* ── LE REVENU DU JOUR : L'ARGENT REÇU, ET RIEN D'AUTRE ─────────────────
   Le registre (`buildReceipts`) mesure déjà la trésorerie : un usage d'avoir
   n'y entre pas (il consomme un argent déjà reçu), un acompte entre le jour
   où il est reçu. On n'en retire que ce qui n'est pas un gain de la Maison :
   le pourboire (l'argent des mains) et l'entrée hors activité (apport,
   prêt). Un rituel honoré SANS argent reçu n'y est donc pas : il va dans
   « À facturer », à part. */
export function revenuDuJour(registre: readonly Receipt[], iso: string): Receipt[] {
  return registre.filter((r) => r.date === iso && EST_ACTIVITE[r.kind] && r.amountXof > 0);
}

/** KkiaPay : vérifié par le serveur, pointé de lui-même. */
export const estEnLigne = (r: Pick<Receipt, 'method' | 'cashbox'>): boolean =>
  r.cashbox === 'KkiaPay' || /^kkiapay/i.test(r.method ?? '');

/** Les espèces se pointent au comptage du tiroir, jamais une à une. */
export const estEnEspeces = (r: Pick<Receipt, 'method'>): boolean => /esp[eè]ces|cash|liquide/i.test(r.method ?? '');

/** La famille d'un moyen, pour ranger le revenu : « MTN MoMo », « Moov »… */
export function familleDuMoyen(r: Pick<Receipt, 'method' | 'cashbox'>): string {
  if (estEnLigne(r)) return 'KkiaPay, en ligne';
  if (estEnEspeces(r)) return 'Espèces';
  const m = (r.method ?? '').trim();
  if (/mtn|momo/i.test(m)) return 'MTN MoMo';
  if (/moov/i.test(m)) return 'Moov Money';
  if (/^mobile money$/i.test(m)) return 'Mobile Money';
  return m || 'Autre';
}
const ORDRE_DES_FAMILLES = ['Espèces', 'MTN MoMo', 'Moov Money', 'Mobile Money', 'Carte', 'Virement bancaire', 'KkiaPay, en ligne'];

export type EtatDuPointage =
  | 'kkiapay'      // vérifié par le serveur
  | 'releve'       // retrouvé au relevé MTN
  | 'main'         // pointé à la main
  | 'comptage'     // espèces d'un tiroir clôturé
  | 'au-comptage'  // espèces d'un tiroir pas encore clôturé
  | 'a-pointer';

export const ETAT_POINTE: Record<EtatDuPointage, boolean> = {
  kkiapay: true, releve: true, main: true, comptage: true, 'au-comptage': false, 'a-pointer': false,
};

/** Ce que l'écran sait des clôtures : « ce tiroir a été clôturé ce jour-là
    ou après ». Une espèce entrée après une clôture passe au comptage suivant. */
export const cleDeComptage = (cashbox: string, date: string): string => `${cashbox}|${date}`;

export function etatDuPointage(
  r: Receipt,
  pointages: ReadonlyMap<string, Pointage>,
  clotures: readonly Pick<Cloture, 'cashbox' | 'date'>[],
): EtatDuPointage {
  if (estEnLigne(r)) return 'kkiapay';
  const p = pointages.get(r.id);
  if (p) return p.comment;
  if (estEnEspeces(r)) {
    const compte = !!r.cashbox && clotures.some((c) => c.cashbox === r.cashbox && c.date >= r.date);
    return compte ? 'comptage' : 'au-comptage';
  }
  return 'a-pointer';
}

export type GroupeDeMoyen = { famille: string; lignes: Receipt[]; totalXof: number };

/** Le revenu rangé par moyen, dans l'ordre du comptoir, les lignes par heure. */
export function parMoyen(lignes: readonly Receipt[]): GroupeDeMoyen[] {
  const m = new Map<string, Receipt[]>();
  for (const r of lignes) {
    const f = familleDuMoyen(r);
    m.set(f, [...(m.get(f) ?? []), r]);
  }
  const rang = (f: string) => { const i = ORDRE_DES_FAMILLES.indexOf(f); return i < 0 ? 50 : i; };
  return [...m.entries()]
    .sort(([a], [b]) => rang(a) - rang(b) || a.localeCompare(b, 'fr'))
    .map(([famille, ls]) => ({
      famille,
      lignes: [...ls].sort((a, b) => (a.heure ?? '99').localeCompare(b.heure ?? '99')),
      totalXof: ls.reduce((s, r) => s + r.amountXof, 0),
    }));
}

/** Les quatre chiffres du haut : reçu, pointé, à pointer, au comptage. */
export function bilanDuPointage(lignes: readonly Receipt[], etat: (r: Receipt) => EtatDuPointage) {
  let recuXof = 0, pointeXof = 0, aPointerXof = 0, auComptageXof = 0;
  for (const r of lignes) {
    const e = etat(r);
    recuXof += r.amountXof;
    if (ETAT_POINTE[e]) pointeXof += r.amountXof;
    else if (e === 'au-comptage') auComptageXof += r.amountXof;
    else aPointerXof += r.amountXof;
  }
  return { recuXof, pointeXof, aPointerXof, auComptageXof };
}

/* ── LE TIROIR DU SOIR ────────────────────────────────────────────────── */

/** Les coupures du franc CFA qu'on compte une à une ; les pièces se
    comptent en un total. */
export const COUPURES = [10000, 5000, 2000, 1000, 500] as const;

export function sommeDuBilletage(b: Readonly<Record<string, number>>): number {
  let s = 0;
  for (const c of COUPURES) s += Math.max(0, Math.floor(Number(b[String(c)]) || 0)) * c;
  s += Math.max(0, Math.round(Number(b.pieces) || 0));
  return s;
}

/** La dernière clôture d'un tiroir : par jour clôturé, puis par heure. Avec
    `auPlusTard`, la dernière d'un jour égal ou antérieur (le comptage d'un
    jour choisi part de la clôture d'avant). */
export function derniereCloture(clotures: readonly Cloture[], branchId: string, cashbox: string, auPlusTard?: string): Cloture | undefined {
  let d: Cloture | undefined;
  for (const c of clotures) {
    if (c.branchId !== branchId || c.cashbox !== cashbox) continue;
    if (auPlusTard && c.date > auPlusTard) continue;
    if (!d || c.date > d.date || (c.date === d.date && c.le > d.le)) d = c;
  }
  return d;
}

/** LE JOUR QU'ON CLÔTURE SE CHOISIT — 4 octobre 2026. « Choisir la date pour
    clôturer la caisse » (Yéman, à 1 h 40 du matin : c'est la veille qu'on
    compte). Deux bornes : pas un jour à venir, et pas un jour d'avant une
    clôture déjà faite sur ce tiroir — la suite des comptages se casserait
    (chaque soir part de ce que le précédent a laissé). `null` quand on peut. */
export function pourquoiPasCeJour(o: {
  clotures: readonly Pick<Cloture, 'branchId' | 'cashbox' | 'date'>[];
  branchId: string; cashbox: string; jour: string; aujourdhui: string;
}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.jour)) return 'Choisissez le jour à clôturer.';
  if (o.jour > o.aujourdhui) return 'On ne clôture pas un jour qui n’est pas encore là.';
  const apres = o.clotures
    .filter((c) => c.branchId === o.branchId && c.cashbox === o.cashbox && c.date > o.jour)
    .map((c) => c.date).sort().at(-1);
  if (apres) return `Ce tiroir a déjà été clôturé le ${apres} : on ne clôture pas un jour d’avant.`;
  return null;
}

/** Le jour proposé : avant 6 h du matin, c'est la veille qu'on clôture. */
export function jourPropose(maintenant: Date): string {
  const d = new Date(maintenant);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** CE QUI DEVRAIT ÊTRE DANS LE TIROIR. Ce que la dernière clôture y a laissé
    (le COMPTÉ, pas l'attendu : un écart ne se reporte jamais en silence),
    plus tout ce que le livre a bougé depuis. Sans clôture précédente, le
    livre seul fait foi. */
export function attenduDuTiroir(o: { livreMaintenantXof: number; derniere?: Pick<Cloture, 'laisseXof' | 'livreXof'> }): number {
  if (!o.derniere) return Math.round(o.livreMaintenantXof);
  return Math.round(o.derniere.laisseXof + (o.livreMaintenantXof - o.derniere.livreXof));
}

/** LE LIVRE D'UNE CLÔTURE D'AVANT LE 10 OCTOBRE 2026, REMIS À LA MÊME MESURE.
    Depuis ce jour, le livre d'un tiroir compte ses mouvements hors activité
    (revue, constat 42). Une clôture d'avant a retenu un livre qui les
    ignorait : comparé au livre d'aujourd'hui, l'attendu du soir suivant
    reprendrait d'un coup tout le hors activité d'avant elle, et la caisse
    déclarerait un écart déjà compté (le compté de ce soir-là l'avait
    absorbé). On ajoute donc à son livre le hors activité du tiroir jusqu'à
    son jour. Une clôture d'après porte `livreAvecHorsActivite` : rien à
    ajouter. */
export const livreDeLaCloture = (
  c: Pick<Cloture, 'livreXof' | 'livreAvecHorsActivite'>, horsActiviteJusquASonJourXof: number,
): number => (c.livreAvecHorsActivite ? c.livreXof : c.livreXof + Math.round(horsActiviteJusquASonJourXof));

/** Le surplus que le Trône propose de verser au coffre : ce qui dépasse le fond. */
export const surplusAuCoffre = (compteXof: number, fondXof: number): number =>
  Math.max(0, Math.round(compteXof) - Math.max(0, Math.round(fondXof)));

/** LE SURPLUS N'EST PROPOSÉ AU COFFRE QUE POUR DES BILLETS — 10 octobre 2026
    (revue). La case était cochée pour tout tiroir en francs : clôturer
    « Terrasse · MoMoPay société » compté à 300 000 F écrivait, sans un geste,
    un dépôt au coffre de 280 000 F. Le tiroir MoMo perdait cet argent sur le
    papier, et le coffre se croyait garni de billets toujours chez MTN. Seul un
    tiroir d'espèces (son nom ou sa référence le dit) part coché ; les autres
    restent libres de l'être à la main. */
export const versementParDefaut = (box: { name: string; sub?: string }): boolean =>
  /esp[eè]ces|cash|liquide/i.test(`${box.name} ${box.sub ?? ''}`);

/** Le fond proposé : celui de la dernière clôture du tiroir, sinon 20 000 F. */
export const FOND_PROPOSE_XOF = 20000;
export const fondPropose = (derniere?: Pick<Cloture, 'fondXof'>): number => derniere?.fondXof ?? FOND_PROPOSE_XOF;

/** POURQUOI ON NE PEUT PAS ENCORE CLÔTURER — `null` quand on peut. */
export function pourquoiOnNeCloturePas(o: { compteXof: number | null; ecartXof: number; note: string; verseAuCoffreXof: number }): string | null {
  if (o.compteXof === null || !Number.isFinite(o.compteXof) || o.compteXof < 0) return 'Comptez le tiroir d’abord.';
  if (o.verseAuCoffreXof > o.compteXof) return 'On ne verse pas au coffre plus que ce qui est compté.';
  if (o.ecartXof !== 0 && !o.note.trim()) return 'Un écart s’explique avant de clôturer : écrivez ce qui s’est passé.';
  return null;
}

/** Construit la clôture, chiffres arrêtés. */
export function nouvelleCloture(o: {
  id: string; branchId: string; cashbox: string; date: string;
  attenduXof: number; compteXof: number; billets?: Record<string, number>;
  note?: string; depenses?: string[]; fondXof: number; verseAuCoffreXof: number;
  livreAvantCoffreXof: number; par: string; le: string; reprend?: string;
}): Cloture {
  const compte = Math.round(o.compteXof);
  const verse = Math.max(0, Math.round(o.verseAuCoffreXof));
  return {
    id: o.id, branchId: o.branchId, cashbox: o.cashbox, date: o.date,
    attenduXof: Math.round(o.attenduXof), compteXof: compte, ecartXof: compte - Math.round(o.attenduXof),
    ...(o.billets ? { billets: o.billets } : {}),
    ...(o.note?.trim() ? { note: o.note.trim() } : {}),
    ...(o.depenses?.length ? { depenses: o.depenses } : {}),
    fondXof: Math.max(0, Math.round(o.fondXof)),
    verseAuCoffreXof: verse,
    laisseXof: compte - verse,
    /* Le versement au coffre s'écrit au livre AVEC la clôture : le livre
       retenu est donc celui d'après. */
    livreXof: Math.round(o.livreAvantCoffreXof) - verse,
    livreAvecHorsActivite: true,
    par: o.par, le: o.le,
    ...(o.reprend ? { reprend: o.reprend } : {}),
  };
}

/* ── LE MATIN : LA DIRECTION VALIDE ───────────────────────────────────── */

/** Seule la direction (souverain) accepte ou reprend un écart, et jamais
    celui qui l'a déclaré : un écart ne s'efface pas par sa propre main. */
export function pourquoiOnNeValidePas(o: { estSouverain: boolean; moi: string; cloture: Pick<Cloture, 'par' | 'ecartXof' | 'validation'> }): string | null {
  if (o.cloture.validation) return 'Cette clôture a déjà sa décision.';
  if (!o.estSouverain) return 'La direction seule accepte ou reprend un écart.';
  if (o.cloture.ecartXof !== 0 && o.cloture.par === o.moi) return 'Celui qui a déclaré l’écart ne l’accepte pas lui-même : l’autre souverain le fait.';
  return null;
}

/** Ce qui attend la direction : chaque clôture avec écart, sans décision,
    la plus récente de son tiroir et de son jour (une reprise remplace la
    lecture de la précédente, sans l'effacer). */
export function aValider(clotures: readonly Cloture[], branchId: string): Cloture[] {
  const reprises = new Set(clotures.map((c) => c.reprend).filter(Boolean) as string[]);
  return clotures
    .filter((c) => c.branchId === branchId && c.ecartXof !== 0 && !c.validation && !reprises.has(c.id))
    .sort((a, b) => a.le.localeCompare(b.le));
}

/** Les tiroirs qui ont BOUGÉ ce jour-là et n'ont pas été clôturés. Le bocal
    des pourboires et KkiaPay ne se comptent pas : l'un est l'argent des
    mains, l'autre vit chez le prestataire. */
export function tiroirsSansCloture(o: {
  branchId: string; date: string;
  registre: readonly Pick<Receipt, 'date' | 'cashbox'>[];
  depenses: readonly { branchId: string; date: string; cashbox?: string; avancee?: boolean; stopped?: boolean }[];
  clotures: readonly Pick<Cloture, 'branchId' | 'cashbox' | 'date'>[];
  /** Les tiroirs qui SE COMPTENT (voir `tiroirsQuiSeComptent`). Absent : tout
      tiroir nommé, comme avant le 10 octobre 2026. */
  seComptent?: ReadonlySet<string>;
  /* LES MOUVEMENTS HORS ACTIVITÉ, DANS LES DEUX SENS — 10 octobre 2026
     (reprise de la revue). Une sortie (prélèvement de l'associé, échéance
     rendue) n'entre plus au registre, qui ne garde que l'argent reçu, mais
     elle fait baisser le tiroir. Lue par le registre seul, une journée où
     l'associé n'avait prélevé que 50 000 F disait « Rien n'a bougé », et la
     veille ne signalait aucun oubli : l'attendu avait pourtant changé. Le
     solde lit ces mouvements (voir `horsActiviteDuTiroir`), le « a bougé »
     les lit donc aussi, avec la même garde (un montant, la branche, le jour). */
  horsActivite?: readonly { branchId: string; date: string; cashbox: string; amountXof: number }[];
}): string[] {
  const bouge = new Set<string>();
  for (const r of o.registre) if (r.date === o.date && r.cashbox) bouge.add(r.cashbox);
  for (const e of o.depenses) if (e.branchId === o.branchId && e.date === o.date && e.cashbox && !e.avancee && !e.stopped) bouge.add(e.cashbox);
  for (const m of o.horsActivite ?? []) if (m.branchId === o.branchId && m.date.slice(0, 10) === o.date && m.cashbox && m.amountXof > 0) bouge.add(m.cashbox);
  bouge.delete(CAISSE_POURBOIRES);
  bouge.delete('KkiaPay');
  const fermes = new Set(o.clotures.filter((c) => c.branchId === o.branchId && c.date === o.date).map((c) => c.cashbox));
  return [...bouge].filter((b) => !fermes.has(b) && (!o.seComptent || o.seComptent.has(b))).sort((a, b) => a.localeCompare(b, 'fr'));
}

/** LES TIROIRS QUI SE COMPTENT LE SOIR — 10 octobre 2026 (revue). Une seule
    règle pour la fenêtre de clôture et l'alerte de la veille : ni le bocal des
    pourboires, ni KkiaPay, ni une caisse hors bilan. L'alerte comptait encore
    « Caisse du foyer » ou « Foyer · Wells Fargo » : un oubli qu'aucune fenêtre
    ne laissait clôturer, et qui revenait chaque jour où le foyer avait bougé. */
export const tiroirsQuiSeComptent = <B extends { branchId: string; name: string; horsBilan?: boolean }>(
  caisses: readonly B[], branchId: string,
): B[] => caisses.filter((b) => b.branchId === branchId && b.name !== CAISSE_POURBOIRES && b.name !== 'KkiaPay' && !b.horsBilan);
