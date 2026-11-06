/* ══ TERMINER ET RÉGLER — 6 novembre 2026 ════════════════════════════════
   « Une cliente qui a pris rendez-vous toute seule sur le logiciel hier,
   j'aimerais lui donner la possibilité de terminer son rendez-vous toute
   seule une fois qu'elle finit à la Maison MND et de pouvoir passer régler
   son RDV dans la Couronne » (Yéman). Maquette « Terminer et régler, par
   trois portes », validée le 6 novembre 2026 (« construis terminer et
   regler »).

   TROIS PORTES, UN SEUL RÈGLEMENT. Ma Couronne (« Terminer mon rituel »),
   maisonmnd.com (« Retrouver mon rendez-vous » : son code de confirmation ET
   les 4 derniers chiffres du numéro auquel la Maison a confirmé), le
   WhatsApp de la Maison (« J'ai terminé mon RDV »). Les trois mènent au
   règlement qui existe : la page « Régler », KkiaPay, le merci facultatif
   pour l'équipe (regler-la-seance-pur.ts).

   CE QUI EST TRANCHÉ (6 novembre 2026, au sélecteur) :
   · la porte s'ouvre à l'heure du rituel, le jour même, jusqu'à minuit à
     Cotonou ; jamais avant, jamais pour un rendez-vous annulé, déjà réglé,
     ou couvert par une formule sans reste ;
   · toute cliente y a droit ; « Passe au comptoir » sur sa fiche l'éteint ;
   · le code seul n'ouvre rien : quatre signes se devinent. La recherche est
     bornée aux rendez-vous proches, répond la même chose à un code inconnu
     et à des chiffres faux, et se freine aux essais répétés ;
   · le rendez-vous passe « honoré » QUAND ELLE A RÉGLÉ, pas à sa
     déclaration ; l'équipe est prévenue dès qu'elle déclare avoir terminé ;
   · le montant vient toujours du serveur. La pièce, elle, ne s'écrit qu'au
     Trône, qui seul lit le tarif de sa tête (comme la main de Grenat) : un
     poste ouvert l'écrit dès la déclaration, et la page « Régler » la relit.

   Ce fichier est PUR : ni Supabase, ni DOM. Trois blocs sont recopiés à
   l'identique dans les fonctions Edge, qui n'importent rien du dépôt :
   ⟨honneur-au-reglement⟩ dans regler-la-seance et terminer-et-regler,
   ⟨terminer-et-regler⟩ dans terminer-et-regler, ⟨j-ai-termine⟩ dans
   whatsapp-automate. Le banc des douze lunes compare les copies ; le banc
   verifie-terminer-et-regler tient la règle. Les noms portent « DeLaFin »
   pour ne heurter aucun autre bloc d'une même fonction. */

/* ⟨honneur-au-reglement⟩ */
/** Par quelle porte elle a déclaré avoir terminé. */
export type PorteDeLaFin = 'couronne' | 'site' | 'whatsapp';
/** La marque posée sur le rendez-vous à sa déclaration (le serveur seul l'écrit). */
export type MarqueDeLaFin = { le: string; par: PorteDeLaFin };
/** La marque posée au règlement : le serveur passe « honoré », un poste du
    Trône réserve les suites (`suitesLe`) et les fait, comme au comptoir. */
export type MarqueDeLHonneur = { le: string; suitesLe?: string };
/** Cotonou : UTC+1 toute l'année. */
export const DECALAGE_DE_LA_FIN_MS = 3_600_000;
export const jourDeLaFin = (ms: number): string => new Date(ms + DECALAGE_DE_LA_FIN_MS).toISOString().slice(0, 10);

/** HONORÉ QUAND ELLE A RÉGLÉ. Rend la marque à poser, ou null : elle n'a
    rien déclaré (le chemin d'avant ne bouge pas), le rendez-vous n'est plus
    « confirmé », il reste à régler, ou le rituel est à venir. Un reste
    illisible n'honore jamais. */
export function honneurAuReglement(o: {
  rdv: { status?: string; date?: string; termineParElle?: MarqueDeLaFin | null } | null;
  resteXof: number;
  maintenantMs: number;
}): MarqueDeLHonneur | null {
  const r = o.rdv;
  if (!r || !r.termineParElle || !r.termineParElle.le) return null;
  if (r.status !== 'confirmé') return null;
  const reste = Number(o.resteXof);
  if (!Number.isFinite(reste) || Math.round(reste) > 0) return null;
  const jour = String(r.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || jour > jourDeLaFin(o.maintenantMs)) return null;
  return { le: new Date(o.maintenantMs).toISOString() };
}
/* ⟨/honneur-au-reglement⟩ */

/* ⟨terminer-et-regler⟩ */
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

/** Pourquoi la porte est ouverte, ou fermée. */
export type RaisonDeLaPorte =
  | 'ouverte' | 'introuvable' | 'annule' | 'deja-regle' | 'rien-a-regler' | 'clos' | 'pas-confirme'
  | 'pas-encore-le-jour' | 'jour-passe' | 'avant-l-heure' | 'comptoir';

/** LA PORTE : dès l'heure du rituel, le jour même, jusqu'à minuit à Cotonou.
    `piece` : le reste de SA pièce quand elle existe (elle fait foi) ; sans
    pièce, le reste ne se connaît que si le prix est figé. Un rendez-vous
    honoré sans pièce ouverte a été clos au comptoir. Ce qui est dit d'abord :
    annulé, déjà réglé ; puis le jour et l'heure ; puis « Passe au comptoir ». */
export function porteDeLaFin(o: {
  rdv: RdvDeLaFin | null;
  maintenantMs: number;
  passeAuComptoir?: boolean;
  piece?: { resteXof: number } | null;
}): { ouverte: boolean; raison: RaisonDeLaPorte } {
  const ferme = (raison: RaisonDeLaPorte) => ({ ouverte: false, raison });
  const r = o.rdv;
  if (!r) return ferme('introuvable');
  if (r.status === 'annulé') return ferme('annule');
  if (o.piece) {
    const reste = Number(o.piece.resteXof);
    if (!Number.isFinite(reste)) return ferme('clos');
    if (Math.round(reste) <= 0) return ferme('deja-regle');
  } else if (r.status === 'honoré') {
    return ferme('clos');
  } else if (r.coveredBySub) {
    return ferme('rien-a-regler');
  } else {
    const connu = resteConnuDeLaFin(r);
    if (connu !== null && connu <= 0) return ferme(argentRecuDeLaFin(r) > 0 ? 'deja-regle' : 'rien-a-regler');
  }
  if (r.status !== 'confirmé' && r.status !== 'honoré') return ferme('pas-confirme');
  const jour = String(r.date ?? '').slice(0, 10);
  const aujourdhui = jourDeLaFin(o.maintenantMs);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return ferme('introuvable');
  if (jour > aujourdhui) return ferme('pas-encore-le-jour');
  if (jour < aujourdhui) return ferme('jour-passe');
  const debut = instantDuRituel(jour, r.time);
  if (!Number.isFinite(debut) || o.maintenantMs < debut) return ferme('avant-l-heure');
  if (o.passeAuComptoir === true) return ferme('comptoir');
  return { ouverte: true, raison: 'ouverte' };
}

/** UNE DÉCLARATION QUI TIENT : la marque date du jour du rituel, à partir de
    son heure. Le Trône la relit avant d'écrire une pièce : une marque posée
    hors de la porte (une écriture qui ne vient pas du serveur) ne vaut rien. */
export function finValable(r: Pick<RdvDeLaFin, 'date' | 'time' | 'status' | 'termineParElle'> | null): boolean {
  const le = Date.parse(String(r?.termineParElle?.le ?? ''));
  if (!r || !Number.isFinite(le) || r.status === 'annulé') return false;
  const debut = instantDuRituel(r.date, r.time);
  return Number.isFinite(debut) && le >= debut && jourDeLaFin(le) === String(r.date ?? '').slice(0, 10);
}

/* ── RETROUVER SON RENDEZ-VOUS : LE CODE ET LES QUATRE CHIFFRES ─────────── */

/** L'alphabet de la référence « MND-7K3Q » (lien-du-rdv-pur.ts ; le banc compare). */
export const SIGNES_DU_CODE_DE_LA_FIN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Le code tel qu'elle le tape : « mnd 7k3q », « MND-7K3Q », « 7k3q ». Rend
    « MND-7K3Q », ou null si ce n'est pas un code. */
export function codeLu(saisie: unknown): string | null {
  const s = String(saisie ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const corps = s.length === 7 && s.startsWith('MND') ? s.slice(3) : s.length === 4 ? s : '';
  if (corps.length !== 4 || [...corps].some((c) => !SIGNES_DU_CODE_DE_LA_FIN.includes(c))) return null;
  return `MND-${corps}`;
}
/** Quatre chiffres, ni plus ni moins. */
export function quatreChiffresLus(saisie: unknown): string | null {
  const c = String(saisie ?? '').replace(/\D/g, '');
  return c.length === 4 ? c : null;
}
/** Les quatre derniers chiffres d'un vrai numéro (huit chiffres au moins). */
export function finDuNumero(numero: unknown): string {
  const c = String(numero ?? '').replace(/\D/g, '');
  return c.length >= 8 ? c.slice(-4) : '';
}

/** LES RENDEZ-VOUS PROCHES : d'hier à l'horizon de la réservation. Un code à
    quatre signes n'est ni secret ni unique : on ne cherche jamais plus loin. */
export const JOURS_AVANT_DE_LA_RECHERCHE = 1;
export const JOURS_APRES_DE_LA_RECHERCHE = 100;
export function fenetreDeLaRecherche(maintenantMs: number): { du: string; au: string } {
  const jour = 86_400_000;
  return { du: jourDeLaFin(maintenantMs - JOURS_AVANT_DE_LA_RECHERCHE * jour), au: jourDeLaFin(maintenantMs + JOURS_APRES_DE_LA_RECHERCHE * jour) };
}

/** LE RENDEZ-VOUS DU CODE ET DES CHIFFRES, ou null. Le code seul n'ouvre
    rien ; les chiffres seuls non plus. Chaque rendez-vous est comparé en
    entier (code ET chiffres), trouvé ou non : la réponse et le travail sont
    les mêmes pour un code inconnu et pour des chiffres faux. Plusieurs
    rendez-vous qui répondent (deux venues de la même tête) : le plus proche
    de maintenant, un rendez-vous vivant avant un annulé. */
export function retrouveLeRdv<T extends { id: string; date?: string; time?: string; status?: string }>(o: {
  code: unknown; chiffres: unknown; rdvs: readonly T[];
  referenceDe: (rdvId: string) => string;
  numerosDe: (rdv: T) => readonly (string | undefined)[];
  maintenantMs: number;
}): T | null {
  const code = codeLu(o.code);
  const chiffres = quatreChiffresLus(o.chiffres);
  const f = fenetreDeLaRecherche(o.maintenantMs);
  const trouves: T[] = [];
  for (const r of o.rdvs) {
    const jour = String(r.date ?? '').slice(0, 10);
    const proche = jour >= f.du && jour <= f.au;
    const memeCode = code !== null && o.referenceDe(r.id) === code;
    const memesChiffres = chiffres !== null && o.numerosDe(r).some((n) => finDuNumero(n) === chiffres);
    if (proche && memeCode && memesChiffres) trouves.push(r);
  }
  if (!trouves.length) return null;
  const ecart = (r: T) => {
    const t = instantDuRituel(r.date, r.time);
    return Number.isFinite(t) ? Math.abs(t - o.maintenantMs) : Number.MAX_SAFE_INTEGER;
  };
  return [...trouves].sort((a, b) => (a.status === 'annulé' ? 1 : 0) - (b.status === 'annulé' ? 1 : 0) || ecart(a) - ecart(b) || a.id.localeCompare(b.id))[0];
}

/** LE FREIN AUX ESSAIS RÉPÉTÉS. Par adresse : dix recherches en dix minutes.
    Par code : cinq échecs dans l'heure, douze dans la journée, d'où qu'ils
    viennent (dix mille combinaisons de chiffres ne s'essaient pas). */
export const FREIN_DE_LA_RECHERCHE = { parAdresse: 10, minutesDeLAdresse: 10, echecsParHeure: 5, echecsParJour: 12 } as const;
export function freinDeLaRecherche(o: { essaisDeLAdresse: number; echecsDuCodeDansLHeure: number; echecsDuCodeDuJour: number }): 'libre' | 'adresse' | 'code' {
  if (o.essaisDeLAdresse >= FREIN_DE_LA_RECHERCHE.parAdresse) return 'adresse';
  if (o.echecsDuCodeDansLHeure >= FREIN_DE_LA_RECHERCHE.echecsParHeure || o.echecsDuCodeDuJour >= FREIN_DE_LA_RECHERCHE.echecsParJour) return 'code';
  return 'libre';
}

/* ── LE BILLET : ce que la page du rendez-vous dit du règlement ─────────── */

export type EtatDuBillet = 'confirme' | 'en-cours' | 'termine' | 'regle' | 'annule' | 'passe';
export type BilletDeLaFin = {
  reference: string;
  /** Son prénom d'appel, et rien d'autre d'elle. */
  prenom: string;
  jour: string;
  heure: string;
  etat: EtatDuBillet;
  /** Le juste reste, quand le serveur le connaît (sa pièce, sinon son prix figé). */
  resteXof: number | null;
  porte: { ouverte: boolean; raison: RaisonDeLaPorte };
  /** Elle a déclaré avoir terminé : son règlement l'attend. */
  aTermine: boolean;
};
export function billetDeLaFin(o: {
  rdv: RdvDeLaFin; reference: string; prenom: string; maintenantMs: number;
  passeAuComptoir?: boolean; piece?: { resteXof: number } | null;
}): BilletDeLaFin {
  const r = o.rdv;
  const porte = porteDeLaFin({ rdv: r, maintenantMs: o.maintenantMs, passeAuComptoir: o.passeAuComptoir, piece: o.piece });
  const jour = String(r.date ?? '').slice(0, 10);
  const aujourdhui = jourDeLaFin(o.maintenantMs);
  const debut = instantDuRituel(jour, r.time);
  const aTermine = !!r.termineParElle?.le;
  const regle = porte.raison === 'deja-regle';
  const etat: EtatDuBillet = r.status === 'annulé' ? 'annule'
    : regle ? 'regle'
      : (aTermine || (r.status === 'honoré' && porte.ouverte)) && jour === aujourdhui ? 'termine'
        : jour < aujourdhui || r.status === 'honoré' ? 'passe'
          : jour === aujourdhui && Number.isFinite(debut) && o.maintenantMs >= debut ? 'en-cours'
            : 'confirme';
  const reste = o.piece ? Math.max(0, Math.round(Number(o.piece.resteXof) || 0)) : r.status === 'annulé' || r.coveredBySub ? null : resteConnuDeLaFin(r);
  return {
    reference: o.reference,
    prenom: String(o.prenom ?? '').trim().split(/\s+/)[0] ?? '',
    jour, heure: String(r.time ?? '').slice(0, 5), etat,
    resteXof: regle ? 0 : reste,
    porte, aTermine,
  };
}

/* ── LE LIEN : celui du règlement qui existe (regler-la-seance-pur.ts) ──── */

/** Le jeton du lien « Régler » : quatorze signes sans ambiguïté, les mêmes
    que `jetonDe` (le banc compare l'alphabet, la longueur et le tirage). */
export const SIGNES_DU_JETON_DE_LA_FIN = '23456789abcdefghjkmnpqrstuvwxyz';
export const LONGUEUR_DU_JETON_DE_LA_FIN = 14;
export function jetonDeLaFin(aleas: ArrayLike<number>): string {
  let t = '';
  for (let i = 0; i < LONGUEUR_DU_JETON_DE_LA_FIN; i++) t += SIGNES_DU_JETON_DE_LA_FIN[Math.abs(Math.floor(Number(aleas[i] ?? 0))) % SIGNES_DU_JETON_DE_LA_FIN.length];
  return t;
}
export const estUnJetonDeLaFin = (s: unknown): s is string =>
  typeof s === 'string' && s.length === LONGUEUR_DU_JETON_DE_LA_FIN && [...s].every((c) => SIGNES_DU_JETON_DE_LA_FIN.includes(c));
/** L'adresse du règlement : payer.html?tg=r-<jeton>, qui ouvre la page « Régler ». */
export const ADRESSE_DU_REGLEMENT_DE_LA_FIN = 'https://maisonmnd.com/trone/payer.html?tg=r-';
export const adresseDuReglementDeLaFin = (jeton: string): string => `${ADRESSE_DU_REGLEMENT_DE_LA_FIN}${jeton}`;

/** LE LIEN À POSER. Un rendez-vous : son jeton, gardé s'il existe (un second
    toucher garde le même lien). Plusieurs (un foyer, un seul numéro) : un
    jeton commun et la liste entière sur chacun, gardé si la liste est la
    même ; une autre liste en tire un neuf. Jamais de lien pour une liste vide. */
export function lienDeLaFin(o: {
  rdvs: readonly Pick<RdvDeLaFin, 'id' | 'lienDeReglement' | 'lienDuFoyer'>[];
  aleas: ArrayLike<number>;
}): { genre: 'seul' | 'foyer'; jeton: string; neuf: boolean; apptIds: string[] } | null {
  const ids = [...new Set(o.rdvs.map((r) => r.id).filter(Boolean))].sort();
  if (ids.length === 0) return null;
  if (ids.length === 1) {
    const deja = o.rdvs.find((r) => r.id === ids[0])?.lienDeReglement?.jeton;
    return estUnJetonDeLaFin(deja) ? { genre: 'seul', jeton: deja, neuf: false, apptIds: ids } : { genre: 'seul', jeton: jetonDeLaFin(o.aleas), neuf: true, apptIds: ids };
  }
  const liens = ids.map((id) => o.rdvs.find((r) => r.id === id)?.lienDuFoyer);
  const premier = liens[0]?.jeton;
  const memeLien = estUnJetonDeLaFin(premier) && liens.every((l) => !!l && l.jeton === premier && [...(l.apptIds ?? [])].sort().join('|') === ids.join('|'));
  return memeLien ? { genre: 'foyer', jeton: premier as string, neuf: false, apptIds: ids } : { genre: 'foyer', jeton: jetonDeLaFin(o.aleas), neuf: true, apptIds: ids };
}

/* ── L'ÉQUIPE EST PRÉVENUE DÈS SA DÉCLARATION ───────────────────────────── */

const francsDeLaFin = (xof: number): string => `${String(Math.round(xof)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
const heureDiteDeLaFin = (hhmm: unknown): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  return m ? (m[2] === '00' ? `${Number(m[1])} h` : `${Number(m[1])} h ${m[2]}`) : '';
};
const PORTE_DITE_DE_LA_FIN: Record<PorteDeLaFin, string> = { couronne: 'Ma Couronne', site: 'le site', whatsapp: 'WhatsApp' };
/** La notification du personnel : des prénoms, l'heure, la porte, le reste
    quand il est connu. Aucun pronom : la civilité ne se suppose pas. */
export function notificationDeLaFin(o: { prenoms: readonly string[]; heure?: string; porte: PorteDeLaFin; resteXof: number | null }): { titre: string; corps: string; url: string } {
  const qui = [...new Set(o.prenoms.map((p) => String(p ?? '').trim()).filter(Boolean))];
  const noms = qui.length === 0 ? 'Une cliente' : qui.length === 1 ? qui[0] : `${qui.slice(0, -1).join(', ')} et ${qui[qui.length - 1]}`;
  const plusieurs = qui.length > 1;
  const heure = heureDiteDeLaFin(o.heure);
  const reste = o.resteXof !== null && o.resteXof > 0 ? ` Reste ${francsDeLaFin(o.resteXof)}.` : '';
  return {
    titre: `${noms} ${plusieurs ? 'ont terminé leur rituel' : 'a terminé son rituel'}`,
    corps: `${heure ? `Rendez-vous de ${heure}. ` : ''}Règlement en cours depuis son téléphone, par ${PORTE_DITE_DE_LA_FIN[o.porte]}.${reste} Un poste du Trône ouvert prépare sa pièce.`,
    url: '/trone/#/carnet',
  };
}
/* ⟨/terminer-et-regler⟩ */

/* ⟨j-ai-termine⟩ */
/* LA PORTE DU WHATSAPP DE LA MAISON : « J'ai terminé mon RDV », en phrase
   libre. La Maison reconnaît la phrase, retrouve le rituel du jour par le
   numéro (la voix du numéro, jamais une fiche d'enfant) et répond avec le
   montant et le lien de règlement. Sans rendez-vous du jour à ce numéro,
   elle demande le code : aucun lien de règlement ne part au hasard. */

const motsDuMessageDeFin = (texte: unknown): string =>
  String(texte ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Ce qui dit autre chose : une négation, une question, un autre achat, un
    autre jour. Dans le doute, la conversation suit son cours ordinaire. */
const AUTRE_CHOSE_QUE_LA_FIN = /\b(pas|jamais|quand|combien|pourquoi|comment|est ce|bientot|presque|encore|demain|hier|si|abonnement|formule|commande|acompte|avance|boutique|produit|carte|cadeau)\b/;
/** Elle a fini : « j'ai terminé », « j'ai fini », « c'est fini », « on a terminé ». */
const ELLE_A_FINI = /\b(j ai|jai|on a|nous avons|c est|cest|ca y est|j en ai)\b(?: \w+){0,2} (termine|terminee|termines|fini|finie|finis)\b/;
/** La phrase tient en deux mots : « terminé », « rdv terminé », « séance finie ». */
const FIN_EN_PEU_DE_MOTS = /^(?:(?:mon|ma|le|la|notre) )?(?:(?:rdv|rendez vous|seance|rituel|coiffure|soin) )?(?:est )?(?:termine|terminee|fini|finie)(?: merci)?$/;
/** Elle veut régler : « je veux régler », « je voudrais payer », « le lien de paiement ». */
const ELLE_VEUT_REGLER = /\b(?:je|j) (?:veux|voudrais|souhaite|souhaiterais|peux|vais|viens|aimerais|desire) (?:bien )?(?:regler|payer)\b|\b(?:je regle|je paie|je paye)\b|\blien (?:de|du|pour) (?:paiement|reglement|payer|regler)\b/;

/** « J'AI TERMINÉ », EN PHRASE LIBRE : la casse, les accents et la
    ponctuation ne comptent pas. Une phrase longue (plus de quatorze mots),
    une négation ou une question ne sont pas une déclaration. */
export function ditQuElleATermine(texte: unknown): boolean {
  const t = motsDuMessageDeFin(texte);
  if (!t || t.split(' ').length > 14) return false;
  if (AUTRE_CHOSE_QUE_LA_FIN.test(t)) return false;
  return ELLE_A_FINI.test(t) || FIN_EN_PEU_DE_MOTS.test(t) || ELLE_VEUT_REGLER.test(t);
}

/** Un code de confirmation écrit dans un message (« MND-7K3Q », « mnd 7k3q »),
    ou null. Sans tiret, quatre lettres minuscules sans chiffre sont un mot
    (« la Maison MND dans dix minutes »), pas un code. */
export function codeDansLeMessage(texte: unknown): string | null {
  const m = /\bmnd(-| ?)([abcdefghjklmnpqrstuvwxyz23456789]{4})\b/i.exec(String(texte ?? ''));
  if (!m) return null;
  const signes = m[2];
  if (m[1] !== '-' && !/\d/.test(signes) && signes !== signes.toUpperCase()) return null;
  return `MND-${signes.toUpperCase()}`;
}

/** La page du site où le code et les quatre chiffres retrouvent le rendez-vous. */
export const PAGE_POUR_RETROUVER_SON_RDV = 'https://maisonmnd.com/mon-rendez-vous/';

/** Ce que la Maison sait au moment de répondre (rendu par la fonction terminer-et-regler). */
export type ReponseALaFin =
  | { etat: 'a-regler'; resteXof: number | null; adresse: string; rituel?: string }
  | { etat: 'deja-regle' | 'rien-a-regler' | 'clos' | 'comptoir' | 'sans-rdv' }
  | { etat: 'avant-l-heure'; heure?: string };

const francsDuMessageDeFin = (xof: number): string => `${String(Math.round(xof)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
const heureDuMessageDeFin = (hhmm: unknown): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  return m ? (m[2] === '00' ? `${Number(m[1])} h` : `${Number(m[1])} h ${m[2]}`) : '';
};

/** LES MOTS DE LA MAISON, sur WhatsApp. `appel` : la civilité de la fiche et
    le prénom quand la fiche la dit, le prénom seul sinon, rien si la Maison
    ne la connaît pas. Jamais de numéro de pièce, jamais de tiret long. */
export function motDeLaMaisonALaFin(o: { appel?: string; code?: string | null } & ReponseALaFin): string {
  const appel = String(o.appel ?? '').trim();
  const merci = appel ? `Merci ${appel}, c'est noté.` : `Merci, c'est noté.`;
  const aElle = appel ? `${appel}, ` : '';
  const debut = (s: string) => (appel ? `${aElle}${s}` : `${s.charAt(0).toUpperCase()}${s.slice(1)}`);
  if (o.etat === 'a-regler') {
    const rituel = String(o.rituel ?? '').trim();
    const montant = o.resteXof !== null && o.resteXof > 0
      ? `Votre rituel d'aujourd'hui${rituel ? ` : ${rituel}` : ''}, ${francsDuMessageDeFin(o.resteXof)}.`
      : `Votre montant se prépare à la Maison : il vous attend sur la page.`;
    return `${merci} ${montant} Réglez depuis votre téléphone, en un toucher :\n${o.adresse}\nL'équipe est prévenue.`;
  }
  if (o.etat === 'deja-regle') return debut(`votre rituel d'aujourd'hui est déjà réglé. Merci, et à très bientôt à la Maison MND.`);
  if (o.etat === 'rien-a-regler') return debut(`il n'y a rien à régler pour votre rituel d'aujourd'hui. Merci, et à très bientôt à la Maison MND.`);
  if (o.etat === 'clos') return debut(`votre rituel d'aujourd'hui est déjà clos à la Maison. Pour toute question, l'équipe vous répond ici.`);
  if (o.etat === 'comptoir') return `${merci} Pour votre règlement, l'équipe vous attend au comptoir.`;
  if (o.etat === 'avant-l-heure') {
    const heure = heureDuMessageDeFin(o.heure);
    return debut(`votre rituel est prévu aujourd'hui${heure ? ` à ${heure}` : ''}. Quand l'équipe aura fini, écrivez-nous « J'ai terminé » : votre lien de règlement arrivera aussitôt.`);
  }
  const lien = o.code ? `${PAGE_POUR_RETROUVER_SON_RDV}?code=${o.code}` : PAGE_POUR_RETROUVER_SON_RDV;
  return `Merci de votre message. Nous ne trouvons pas de rendez-vous d'aujourd'hui à ce numéro. Avec votre code de confirmation (MND suivi de quatre signes, dans le message de la Maison) et les 4 derniers chiffres du numéro auquel la Maison vous a confirmé, retrouvez votre rendez-vous ici :\n${lien}\nL'équipe est prévenue et vous répond aussi.`;
}
/* ⟨/j-ai-termine⟩ */

/* ══ AU TRÔNE ET DANS MA COURONNE (rien de ceci ne part au serveur) ══════ */

/** LA MARQUE DU CARNET : « A terminé · règlement en cours », puis « Réglée
    en ligne · Départ sans caisse ». Rien pour un rendez-vous qu'elle n'a pas
    terminé elle-même. `resteXof` : le reste de sa pièce, null sans pièce. */
export type MarqueAuCarnet = { etat: 'a-termine' | 'reglee-en-ligne'; dit: string; sous: string };
export function marqueDeLaFinAuCarnet(r: Pick<RdvDeLaFin, 'status' | 'termineParElle' | 'honoreAuReglement'>, resteXof: number | null): MarqueAuCarnet | null {
  if (!r.termineParElle?.le || r.status === 'annulé') return null;
  if (r.honoreAuReglement?.le || (resteXof !== null && resteXof <= 0)) {
    return { etat: 'reglee-en-ligne', dit: 'Réglée en ligne · Départ sans caisse', sous: 'Rien à encaisser : le fauteuil est libre.' };
  }
  return {
    etat: 'a-termine', dit: 'A terminé · règlement en cours',
    sous: resteXof === null ? 'Sa pièce se prépare : elle règle depuis son téléphone.' : 'Elle règle depuis son téléphone. Encaisser au comptoir reste possible.',
  };
}

/** LA PIÈCE À PRÉPARER AU TRÔNE : elle a déclaré avoir terminé (une
    déclaration qui tient), le rendez-vous vit, et aucune pièce ne porte
    encore son rendez-vous. Le Trône l'écrit au tarif de sa tête, sans honorer. */
export function pieceAPreparer(r: Pick<RdvDeLaFin, 'id' | 'date' | 'time' | 'status' | 'termineParElle'>, aDejaSaPiece: boolean): boolean {
  return !aDejaSaPiece && r.status === 'confirmé' && finValable(r);
}

/** LES SUITES D'UN HONNEUR POSÉ AU RÈGLEMENT : le serveur a passé le
    rendez-vous « honoré », un poste du Trône fait les points, le stock et
    la mission, une seule fois (il réserve `suitesLe` d'abord). */
export const suitesAFaire = (r: { status?: string; pointsAwarded?: boolean; honoreAuReglement?: MarqueDeLHonneur | null }): boolean =>
  r.status === 'honoré' && !r.pointsAwarded && !!r.honoreAuReglement?.le && !r.honoreAuReglement.suitesLe;

/** LA CARTE DE MA COURONNE : le rituel du jour, dès son heure. `en-cours` :
    le bouton « Terminer mon rituel » si la porte est ouverte ; `termine` :
    elle a déclaré, son règlement l'attend ; `regle` : « vous pouvez partir ». */
export type CarteDuRituel<T> = { rdv: T; etat: 'en-cours' | 'termine' | 'regle'; porte: { ouverte: boolean; raison: RaisonDeLaPorte } };
export function carteDuRituelEnCours<T extends RdvDeLaFin>(o: {
  rdvs: readonly T[]; maintenantMs: number; passeAuComptoir?: boolean;
  resteDeLaPiece?: (rdvId: string) => number | null;
}): CarteDuRituel<T> | null {
  const aujourdhui = jourDeLaFin(o.maintenantMs);
  /* La porte juge l'heure, l'annulation et le reste : ici, seulement le jour. */
  const duJour = o.rdvs
    .filter((r) => String(r.date ?? '').slice(0, 10) === aujourdhui)
    .sort((a, b) => String(b.time ?? '').localeCompare(String(a.time ?? '')));
  for (const rdv of duJour) {
    const reste = o.resteDeLaPiece ? o.resteDeLaPiece(rdv.id) : null;
    const porte = porteDeLaFin({ rdv, maintenantMs: o.maintenantMs, passeAuComptoir: o.passeAuComptoir, piece: reste === null ? null : { resteXof: reste } });
    if (rdv.termineParElle?.le && (rdv.honoreAuReglement?.le || porte.raison === 'deja-regle')) return { rdv, etat: 'regle', porte };
    if (rdv.termineParElle?.le && rdv.status === 'confirmé') return { rdv, etat: 'termine', porte };
    if (porte.ouverte) return { rdv, etat: 'en-cours', porte };
  }
  return null;
}
