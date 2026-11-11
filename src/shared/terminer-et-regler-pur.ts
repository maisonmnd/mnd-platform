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

   RÉGLER AVANT ET APRÈS, DANS MA COURONNE — 7 novembre 2026, 7 h 45.
   « Pourquoi je ne peux pas faire un paiement d'un RDV sur ma couronne à
   n'importe quel moment ? » (Yéman). Tranché au sélecteur : « Avant et
   après ». AVANT : « Régler d'avance » le prix connu, de la réservation
   jusqu'à l'heure du rituel ; le rendez-vous reste « confirmé » (honoré
   seulement quand elle vient) ; un soin ajouté pendant la séance se règle
   en plus le jour même. APRÈS : un rendez-vous passé qui doit encore reste
   payable dans Ma Couronne, sans limite de temps. Le jour même, dès
   l'heure, la porte de la fin ne change pas. Voir ⟨regler-avant-apres⟩.

   Ce fichier est PUR : ni Supabase, ni DOM. Cinq blocs sont recopiés à
   l'identique dans les fonctions Edge, qui n'importent rien du dépôt :
   ⟨honneur-au-reglement⟩, ⟨reste-du-rdv⟩ et ⟨regler-avant-apres⟩ dans
   regler-la-seance et terminer-et-regler, ⟨terminer-et-regler⟩ dans
   terminer-et-regler, ⟨j-ai-termine⟩ dans whatsapp-automate. Le banc des
   douze lunes compare les copies ; le banc verifie-terminer-et-regler tient
   la règle. Les noms portent « DeLaFin » (ou « AvantApres ») pour ne heurter
   aucun autre bloc d'une même fonction. */

/* ⟨honneur-au-reglement⟩ */
/** Par quelle porte elle a déclaré avoir terminé. */
export type PorteDeLaFin = 'couronne' | 'site' | 'whatsapp';
/** La marque posée sur le rendez-vous à sa déclaration (le serveur seul
    l'écrit). `pieceLe` : un poste du Trône a réservé l'écriture de sa pièce
    (une écriture conditionnelle, un seul poste la fait). */
export type MarqueDeLaFin = { le: string; par: PorteDeLaFin; pieceLe?: string };
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

/* ⟨terminer-et-regler⟩ */
/** Pourquoi la porte est ouverte, ou fermée. */
export type RaisonDeLaPorte =
  | 'ouverte' | 'introuvable' | 'annule' | 'deja-regle' | 'rien-a-regler' | 'clos' | 'pas-confirme'
  | 'pas-encore-le-jour' | 'jour-passe' | 'avant-l-heure' | 'comptoir';

/** LA PORTE : dès l'heure du rituel, le jour même, jusqu'à minuit à Cotonou.
    `piece` : le reste de SA pièce quand elle existe (elle fait foi) ; sans
    pièce, le reste ne se connaît que si le prix est figé. Un rendez-vous
    honoré sans pièce ouverte a été clos au comptoir. Ce qui est dit d'abord :
    annulé, déjà réglé ; puis le jour et l'heure ; puis « Passe au comptoir »
    (la case de la fiche, ou un acompte demandé que la Maison n'a pas vérifié). */
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
  /* Un acompte demandé, pas encore vérifié : le juste reste ne se connaît pas, elle règle au comptoir. */
  if (acompteAVerifier(r) > 0) return ferme('comptoir');
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

/** SUR LA PORTE WHATSAPP SEULEMENT : pendant les vingt premières minutes
    après l'heure du rendez-vous, une phrase libre (« c'est fini », « fini »)
    n'est pas reçue comme une déclaration. Le rituel commence à peine : aucune
    marque ne se pose, et la conversation suit son cours ordinaire. Ma Couronne
    et le site portent un bouton, pas une phrase : elles gardent l'heure du rituel. */
export const ATTENTE_DE_LA_PORTE_WHATSAPP_MS = 20 * 60_000;
export function aPeineCommence(r: Pick<RdvDeLaFin, 'date' | 'time'>, maintenantMs: number): boolean {
  const debut = instantDuRituel(r.date, r.time);
  return Number.isFinite(debut) && maintenantMs >= debut && maintenantMs < debut + ATTENTE_DE_LA_PORTE_WHATSAPP_MS;
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

/** LES RENDEZ-VOUS PROCHES : de douze mois en arrière à l'horizon de la
    réservation. Un code à quatre signes n'est ni secret ni unique : on ne
    cherche jamais plus loin. Douze mois et non plus la veille (choix de
    Yéman, 7 novembre 2026) : « Mes RDV » rend aussi un rituel passé, pour
    qu'une cliente y reprenne sa facture. Le code ET les quatre chiffres,
    et le frein, tiennent la recherche comme avant. */
export const JOURS_AVANT_DE_LA_RECHERCHE = 365;
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
  /** Son prénom d'usage (la fiche, sinon le prénom deviné, composé compris :
      « Anne-Marie », « Marie Gisèle ») et rien d'autre d'elle. Le serveur
      le tire de sa fiche ; le billet ne le coupe plus (11 novembre 2026). */
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
  const dejaRegle = porte.raison === 'deja-regle';
  /* « RÉGLÉ, VOUS POUVEZ PARTIR » NE SE DIT QU'UNE FOIS LE RITUEL COMMENCÉ
     (relecture du 6 novembre 2026). Un rendez-vous À VENIR payé d'avance
     passait « réglé » : la page /rdv/ lui disait de partir et lui retirait
     Déplacer, Annuler et l'agenda. Réglé d'avance, il reste « confirmé »
     (son reste vaut zéro) jusqu'à l'heure de son rituel. */
  const commence = jour < aujourdhui || (jour === aujourdhui && Number.isFinite(debut) && o.maintenantMs >= debut);
  const regle = dejaRegle && commence;
  const etat: EtatDuBillet = r.status === 'annulé' ? 'annule'
    : regle ? 'regle'
      : (aTermine || (r.status === 'honoré' && porte.ouverte)) && jour === aujourdhui ? 'termine'
        : jour < aujourdhui || r.status === 'honoré' ? 'passe'
          : jour === aujourdhui && Number.isFinite(debut) && o.maintenantMs >= debut ? 'en-cours'
            : 'confirme';
  const reste = o.piece ? Math.max(0, Math.round(Number(o.piece.resteXof) || 0)) : r.status === 'annulé' || r.coveredBySub ? null : resteConnuDeLaFin(r);
  return {
    reference: o.reference,
    prenom: String(o.prenom ?? '').trim().replace(/\s+/g, ' '),
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
/** La notification du personnel quand la porte reste fermée pour un acompte
    à vérifier : la cliente a dit avoir terminé, son règlement se fait au
    comptoir. Aucun pronom, comme plus haut. */
export function notificationDeLAcompteAVerifier(o: { prenom: string; heure?: string; acompteXof: number }): { titre: string; corps: string; url: string } {
  const nom = String(o.prenom ?? '').trim() || 'Une cliente';
  const heure = heureDiteDeLaFin(o.heure);
  return {
    titre: `${nom} a terminé son rituel`,
    corps: `${heure ? `Rendez-vous de ${heure}. ` : ''}Acompte de ${francsDeLaFin(o.acompteXof)} demandé, pas encore vérifié : le règlement se fait au comptoir.`,
    url: '/trone/#/carnet',
  };
}
/* ⟨/terminer-et-regler⟩ */

/* ⟨regler-avant-apres⟩ */
/* RÉGLER AVANT ET APRÈS, DANS MA COURONNE — 7 novembre 2026.
   « Pourquoi je ne peux pas faire un paiement d'un RDV sur ma couronne à
   n'importe quel moment ? » (Yéman, 7 h 45). Tranché au sélecteur : « Avant
   et après ».

   TROIS MOMENTS, SANS CHEVAUCHEMENT (`momentDuReglement`) :
   · D'AVANCE, de sa réservation jusqu'à l'heure du rituel : « Régler
     d'avance » le prix connu. Le rendez-vous reste « confirmé » : il n'est
     honoré que quand elle vient. Un soin ajouté pendant la séance se règle
     en plus le jour même (la porte de la fin relit le reste).
   · LE JOUR MÊME, dès l'heure : la porte de la fin (⟨terminer-et-regler⟩),
     qui ne change pas.
   · APRÈS, dès le lendemain : un rendez-vous passé qui doit encore reste
     payable, sans limite de temps. Régler après ne pose JAMAIS « honoré » :
     on règle la pièce (ou, sans pièce, le rendez-vous) ; l'honneur reste au
     comptoir, ou à la règle de la fin quand elle avait déclaré avoir terminé.

   LE MONTANT VIENT TOUJOURS DU SERVEUR : le reste de SA pièce quand elle
   existe (elle fait foi), sinon le prix figé moins l'argent déjà reçu
   (⟨reste-du-rdv⟩). Sans pièce, le versement s'inscrit sur le rendez-vous
   (kkia-…, comme tout versement en ligne), sans nommer de pièce : la pièce du
   jour venu le reprend en « Acompte », à sa date, comme la Caisse le fait
   pour l'argent reçu au Carnet. Les noms portent « AvantApres ». */

/** Le moment du règlement : d'avance (avant l'heure du rituel), le jour même
    (dès l'heure, jusqu'à minuit à Cotonou), ou après (un jour d'après). Rien
    quand la date ou l'heure ne se lisent pas. */
export type MomentDuReglement = 'avance' | 'jour-meme' | 'apres';
export function momentDuReglement(r: Pick<RdvDeLaFin, 'date' | 'time'>, maintenantMs: number): MomentDuReglement | null {
  const jour = String(r.date ?? '').slice(0, 10);
  const debut = instantDuRituel(jour, r.time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !Number.isFinite(debut)) return null;
  if (maintenantMs < debut) return 'avance';
  return jour < jourDeLaFin(maintenantMs) ? 'apres' : 'jour-meme';
}

/** Pourquoi « Régler d'avance » ou « Régler » (après) est ouvert, ou fermé. */
export type RaisonAvantApres =
  | 'ouverte' | 'introuvable' | 'annule' | 'pas-le-moment' | 'couvert' | 'absente' | 'comptoir'
  | 'pas-confirme' | 'clos' | 'en-preparation' | 'sans-prix' | 'deja-regle' | 'rien-a-regler';
/** `resteXof` : ce qu'elle réglera, quand la porte est ouverte (zéro quand
    tout est réglé) ; `surLaPiece` : il se règle sur sa pièce, sinon sur le
    rendez-vous. */
export type PorteAvantApres = { ouverte: boolean; raison: RaisonAvantApres; resteXof: number | null; surLaPiece: boolean };

/** LA PORTE D'AVANT ET D'APRÈS. Fermée, dans cet ordre : un annulé ; hors de
    son moment ; couvert par une formule ; absente ; « Passe au comptoir » sur
    sa fiche, ou un acompte demandé que la Maison n'a pas vérifié (le juste
    reste ne se connaît pas). Avec une pièce : son reste fait foi (soldée,
    « déjà réglé ») ; le rendez-vous doit être confirmé ou honoré. Sans pièce :
    seulement un rendez-vous « confirmé » (un honoré sans pièce a été clos au
    comptoir), dont elle n'a pas déclaré la fin (sa pièce se prépare au
    Trône), au prix FIGÉ ; sans prix figé, rien ne se devine. */
export function porteAvantApres(o: {
  quand: 'avance' | 'apres';
  rdv: RdvDeLaFin | null;
  maintenantMs: number;
  passeAuComptoir?: boolean;
  piece?: { resteXof: number } | null;
}): PorteAvantApres {
  const ferme = (raison: RaisonAvantApres, resteXof: number | null = null): PorteAvantApres => ({ ouverte: false, raison, resteXof, surLaPiece: false });
  const r = o.rdv;
  if (!r) return ferme('introuvable');
  if (r.status === 'annulé') return ferme('annule');
  if (momentDuReglement(r, o.maintenantMs) !== o.quand) return ferme('pas-le-moment');
  if (r.coveredBySub) return ferme('couvert');
  if (r.absente) return ferme('absente');
  if (o.passeAuComptoir === true || acompteAVerifier(r) > 0) return ferme('comptoir');
  if (o.piece) {
    const reste = Number(o.piece.resteXof);
    if (!Number.isFinite(reste)) return ferme('clos');
    if (Math.round(reste) <= 0) return ferme('deja-regle', 0);
    if (r.status !== 'confirmé' && r.status !== 'honoré') return ferme('pas-confirme');
    return { ouverte: true, raison: 'ouverte', resteXof: Math.round(reste), surLaPiece: true };
  }
  if (r.status === 'honoré') return ferme('clos');
  if (r.status !== 'confirmé') return ferme('pas-confirme');
  if (r.termineParElle?.le) return ferme('en-preparation');
  const reste = resteConnuDeLaFin(r);
  if (reste === null) return ferme('sans-prix');
  if (Math.round(reste) <= 0) return ferme(argentRecuDeLaFin(r) > 0 ? 'deja-regle' : 'rien-a-regler', 0);
  return { ouverte: true, raison: 'ouverte', resteXof: Math.round(reste), surLaPiece: false };
}

/** SANS PIÈCE, SEULEMENT CE QUE MA COURONNE A OUVERT. La page « Régler » ne
    règle un rendez-vous sans pièce (sur lui-même) que si son lien a été
    ouvert depuis Ma Couronne (`depuisLaCouronne`, posé par la fonction
    terminer-et-regler, que la base garde, 0172). Un lien posé au Trône
    (« Terminer la séance », « Envoyer le lien ») attend sa pièce comme avant :
    une cliente qui l'ouvre dans les secondes où la pièce voyage encore ne
    règle pas deux fois. */
export const ouvertDepuisLaCouronne = (r: { lienDeReglement?: { depuisLaCouronne?: { le?: string } | null } | null } | null): boolean =>
  !!r?.lienDeReglement?.depuisLaCouronne?.le;

/** L'ARGENT VERSÉ SUR LE RENDEZ-VOUS LUI-MÊME : son journal, sinon `paidXof`,
    sans l'acompte (la lecture d'`argentRecuDeLaFin`, l'acompte en moins). La
    base porte la même lecture (`argent_verse_sur_le_rdv`, 0172). */
export const argentVerseSurLeRdv = (a: Pick<RdvDeLaFin, 'payments' | 'paidXof'>): number =>
  (a.payments && a.payments.length > 0 ? a.payments.reduce((s, p) => s + (Number(p.amountXof) || 0), 0) : Number(a.paidXof) || 0);

/** RÉGLÉ D'AVANCE, IL NE S'ANNULE PAS PAR ELLE (7 novembre 2026). Un
    rendez-vous qui porte de l'argent versé (en ligne ou au Carnet) ne
    s'annule pas depuis Ma Couronne : aucun remboursement ne part tout seul.
    Elle écrit à la Maison, qui annule au Trône et décide. L'acompte seul ne
    change rien (il reste acquis, comme avant). Déplacer, lui, reste permis :
    le versement suit le rendez-vous. */
export const annulationParElle = (r: Pick<RdvDeLaFin, 'payments' | 'paidXof'> | null): 'permise' | 'ecrire-a-la-maison' =>
  (r && Math.round(argentVerseSurLeRdv(r)) > 0 ? 'ecrire-a-la-maison' : 'permise');

/** UNE TÊTE DE SON FOYER : la fiche d'un mineur de la famille dont elle est
    la payeuse, jamais archivée. La règle de la base (`est_ma_tete`, 0036),
    qui ouvre déjà ces rendez-vous dans Ma Couronne : moins de dix-huit ans
    révolus, une date de naissance lisible (la minorité ne se présume pas). */
export function teteDuCompte(o: {
  parents: readonly string[];
  tete: { familyId?: unknown; birthday?: unknown; archived?: unknown } | null;
  payeur: unknown;
  aujourdhui: string;
}): boolean {
  const t = o.tete;
  const payeur = String(o.payeur ?? '');
  const naissance = String(t?.birthday ?? '').slice(0, 10);
  const jour = /^(\d{4})-(\d{2}-\d{2})$/.exec(String(o.aujourdhui ?? '').slice(0, 10));
  if (!t || !String(t.familyId ?? '') || t.archived === true || t.archived === 'true') return false;
  if (!payeur || !o.parents.includes(payeur) || !jour || !/^\d{4}-\d{2}-\d{2}$/.test(naissance)) return false;
  return naissance > `${Number(jour[1]) - 18}-${jour[2]}`;
}

/** LE VERSEMENT POSÉ SUR LE RENDEZ-VOUS, quand il n'a pas de pièce : celui de
    la transaction vérifiée chez KkiaPay (kkia-…), à sa date, sans nommer de
    pièce (la pièce du jour venu le reprend en « Acompte » ; un versement qui
    nommerait une pièce ferait croire au Trône qu'elle existe), `paidXof` à
    jour, et le lien qui dit quand il a servi. Un rejeu ne double rien. */
export function versementSurLeRdv<R extends Pick<RdvDeLaFin, 'payments' | 'paidXof' | 'lienDeReglement'>>(
  r: R,
  v: { id: string; amountXof: number; date: string; time?: string; method?: string; cashbox?: string; note?: string },
  quand: 'avance' | 'apres',
): R {
  if ((r.payments ?? []).some((x) => (x as { id?: string }).id === v.id)) return r;
  const montant = Math.round(Number(v.amountXof) || 0);
  const dit = quand === 'avance' ? 'D’avance' : 'Après le rituel';
  return {
    ...r,
    paidXof: Math.round(argentVerseSurLeRdv(r)) + montant,
    payments: [...(r.payments ?? []), { id: v.id, amountXof: montant, date: v.date, method: v.method, cashbox: v.cashbox, note: v.note ? `${dit} · ${v.note}` : dit }],
    ...(r.lienDeReglement ? { lienDeReglement: { ...r.lienDeReglement, payeLe: `${v.date}T${v.time ?? '00:00'}` } } : {}),
  } as R;
}

/** La date d'une page ou d'une notification : « 12 novembre 2026 », l'année toujours. */
const MOIS_AVANT_APRES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function jourDitAvantApres(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  return `${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${MOIS_AVANT_APRES[Number(m[2]) - 1]} ${m[1]}`;
}
const francsAvantApres = (xof: number): string => `${String(Math.round(xof)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

/** LA PAGE « RÉGLER » D'UN RENDEZ-VOUS SANS PIÈCE (d'avance, ou passé au prix
    figé) : la forme de la page qui existe, le total annoncé, ce qui est déjà
    reçu, le reste. Aucun merci pour l'équipe ici : il se donne le jour du
    rituel, sur sa pièce. Aucun nom de maître : la Maison choisit qui
    s'occupe d'elle. Tout réglé : « réglée ». */
export function pageSansPiece(o: {
  rdv: RdvDeLaFin; porte: PorteAvantApres; quand: 'avance' | 'apres';
  prenom: string; reference: string; branchId?: string;
}) {
  const prix = prixFigeDeLaFin(o.rdv) ?? 0;
  const reste = o.porte.ouverte ? Math.max(0, Math.round(o.porte.resteXof ?? 0)) : 0;
  return {
    etat: (o.porte.ouverte && reste > 0 ? 'a-regler' : 'reglee') as 'a-regler' | 'reglee',
    prenom: String(o.prenom ?? '').trim().replace(/\s+/g, ' '),
    maitre: '',
    jour: String(o.rdv.date ?? '').slice(0, 10),
    lignes: [{ label: 'Total annoncé', montantXof: prix }],
    totalXof: prix,
    recuXof: Math.round(argentRecuDeLaFin(o.rdv)),
    resteXof: reste,
    pourboire: false,
    reference: o.reference,
    branchId: o.branchId ?? '',
    sansPiece: o.quand,
  };
}

/** LE PERSONNEL L'APPREND, une fois par versement : le prénom, le rituel, le
    montant ; et ce qui dépasse le reste, gardé au registre, à rapprocher.
    Aucun pronom : la civilité ne se suppose pas. */
export function notificationAvantApres(o: { prenom: string; quand: 'avance' | 'apres'; jour: string; heure?: string; montantXof: number; enPlusXof: number }): { titre: string; corps: string; url: string } {
  const nom = String(o.prenom ?? '').trim() || 'Une cliente';
  const h = /^(\d{1,2}):(\d{2})/.exec(String(o.heure ?? ''));
  const heure = h ? (h[2] === '00' ? ` à ${Number(h[1])} h` : ` à ${Number(h[1])} h ${h[2]}`) : '';
  const plus = o.enPlusXof > 0 ? ` ${francsAvantApres(o.enPlusXof)} de plus, gardés au registre : à rapprocher.` : '';
  return {
    titre: o.quand === 'avance' ? `${nom} a réglé d’avance` : `${nom} a réglé un rituel passé`,
    corps: `Rituel du ${jourDitAvantApres(o.jour)}${heure} : ${francsAvantApres(o.montantXof)} en ligne, inscrits sur le rendez-vous.`
      + (o.quand === 'avance' ? ' Le rendez-vous reste confirmé ; le jour venu, ce versement compte à sa pièce.' : ' La pièce se fait au Trône, le versement y compte.')
      + plus,
    url: '/trone/#/carnet',
  };
}
/* ⟨/regler-avant-apres⟩ */

/* ⟨j-ai-termine⟩ */
/* LA PORTE DU WHATSAPP DE LA MAISON : « J'ai terminé mon RDV », en phrase
   libre. La Maison reconnaît la phrase, retrouve le rituel du jour par le
   numéro (la voix du numéro, jamais une fiche d'enfant) et répond avec le
   montant et le lien de règlement. Sans rendez-vous du jour à ce numéro,
   aucun lien de règlement ne part : si le message NOMME le rendez-vous (la
   séance, le rituel, le lien de paiement, son code), elle demande le code ;
   sinon (« c'est fini », « fini », « je veux régler ») ce n'est pas à elle de
   répondre, et la conversation suit son cours ordinaire. */

const motsDuMessageDeFin = (texte: unknown): string =>
  String(texte ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/* LE MESSAGE ENTIER, ET RIEN D'AUTRE — 6 novembre 2026, relecture. La première
   règle cherchait « j'ai fini » QUELQUE PART dans la phrase : « J'ai fini mon
   travail, j'arrive », « c'est fini la pluie, je viens », « j'ai fini mes
   courses » passaient pour une déclaration, et une cliente en retard, son
   rendez-vous déjà commencé, aurait reçu un lien de règlement. Une
   déclaration, c'est le message ENTIER, saluts et politesse retirés, qui
   tient dans une forme FERMÉE. Dans le doute : ce n'en est pas une, et la
   conversation suit son cours ordinaire. */

/** Les saluts et la politesse : retirés avant de juger, où qu'ils soient. */
const POLITESSE_DU_MESSAGE_DE_FIN = /\b(?:merci beaucoup|s il vous plait|bonne journee|bonne soiree|a bientot|bonjour|bonsoir|coucou|salut|cc|merci|svp|stp|madame|mme)\b/g;
/** L'adresse à la Maison (« Bonjour Maison MND, j'ai terminé ») : retirée elle
    aussi, mais APRÈS le garde du trajet (« je suis à la Maison MND » reste un trajet). */
const ADRESSE_A_LA_MAISON_DE_LA_FIN = /\b(?:la )?maison mnd\b/g;
/** Un mot de mouvement ou d'attente, « à la maison », « chez moi » : elle
    parle d'un trajet, d'un retard, d'autre chose. Jamais une déclaration. */
const MOUVEMENT_OU_ATTENTE_DE_LA_FIN = /\b(?:arrive|arrives|arrivee|arriver|arrivons|route|chemin|viens|vient|venir|venons|viendrai|retard|bientot|minute|minutes|min|attends|attend|attendez|a la maison|chez moi)\b/;
/** Ce qu'elle a fini, dans une liste fermée : « mon rdv », « ma séance », « le
    soin », « mes locks ». Pas « le shampoing » : « j'ai fini le shampoing »,
    c'est un flacon vide. */
const COMPLEMENT_DE_LA_FIN = '(?:mon|ma|mes|le|la|notre|nos) (?:rdv|rendez vous|seance|rituel|coiffure|soin|soins|tete|locks|reprise|resserrage)';
/** (a) Elle a fini : « j'ai terminé », « on a fini », « c'est fini », « ça y est j'ai fini », avec ou sans ce complément (« d'aujourd'hui »). */
const ELLE_A_FINI = `(?:j ai|jai|on a|nous avons|c est|cest|ca y est(?: j ai| jai)?) (?:termine|terminee|termines|terminees|fini|finie|finis|finies)(?: ${COMPLEMENT_DE_LA_FIN}(?: d aujourd hui)?)?`;
/** (b) En peu de mots : « terminé », « rdv terminé », « séance finie ». */
const FIN_EN_PEU_DE_MOTS = '(?:(?:(?:mon|ma|le|la|notre) )?(?:rdv|rendez vous|seance|rituel|coiffure|soin) )?(?:est )?(?:termine|terminee|fini|finie)';
/** (c) Elle veut régler : « je veux régler », « je voudrais payer », « le lien
    de paiement », avec ou sans ce complément (« d'aujourd'hui »). « Je paie »,
    « je vais payer », « je peux payer », « je règle » ne valent QUE suivis de
    ce complément (« je paie ma séance ») : nus, ils répondent aussi bien à une
    relance, à une question, à tout autre chose. */
const ELLE_VEUT_REGLER = `(?:(?:je (?:veux|voudrais|souhaite) (?:regler|payer)|(?:le )?lien de paiement)(?: ${COMPLEMENT_DE_LA_FIN}(?: d aujourd hui)?)?|(?:je (?:peux|vais) (?:regler|payer)|je regle|je paie|je paye) ${COMPLEMENT_DE_LA_FIN}(?: d aujourd hui)?)`;
/** Un mot de liaison, en tête seulement : « oui », « voilà », « ok », « c'est bon », « bien ». */
const LIAISON_EN_TETE_DE_LA_FIN = '(?:oui|voila|ok|c est bon|cest bon|bien)';
/** Une de ces formes, ou deux ou trois à la suite (« j'ai terminé, je veux régler »), du premier mot au dernier. */
const UNE_DECLARATION_DE_FIN = new RegExp(`^(?:${LIAISON_EN_TETE_DE_LA_FIN} ){0,2}(?:${ELLE_A_FINI}|${FIN_EN_PEU_DE_MOTS}|${ELLE_VEUT_REGLER})(?: (?:${ELLE_A_FINI}|${FIN_EN_PEU_DE_MOTS}|${ELLE_VEUT_REGLER})){0,2}$`);

/** « Je viens de terminer », « on vient de finir » : la même chose que « j'ai
    terminé » (et « viens » n'y dit aucun trajet). */
const vientDeFinirDeLaFin = (t: string): string => t
  .replace(/\bje viens de (terminer|finir)\b/g, (_m, v: string) => `j ai ${v === 'finir' ? 'fini' : 'termine'}`)
  .replace(/\bon vient de (terminer|finir)\b/g, (_m, v: string) => `on a ${v === 'finir' ? 'fini' : 'termine'}`)
  .replace(/\bnous venons de (terminer|finir)\b/g, (_m, v: string) => `nous avons ${v === 'finir' ? 'fini' : 'termine'}`);

/** Le message, saluts et politesse retirés, et le code de confirmation qu'elle a pu y écrire. */
function coeurDuMessageDeFin(texte: unknown): string {
  let t = motsDuMessageDeFin(texte);
  const code = codeDansLeMessage(texte);
  if (code) t = ` ${t} `.replace(` mnd ${code.slice(4).toLowerCase()} `, ' ').replace(` mnd${code.slice(4).toLowerCase()} `, ' ');
  return vientDeFinirDeLaFin(t.replace(POLITESSE_DU_MESSAGE_DE_FIN, ' ').replace(/ +/g, ' ').trim());
}

/** Elle parle d'autre chose que de la fin de son rituel : un trajet, un retard, sa maison. */
export const ditAutreChoseQueLaFin = (texte: unknown): boolean => MOUVEMENT_OU_ATTENTE_DE_LA_FIN.test(coeurDuMessageDeFin(texte));

/** « J'AI TERMINÉ », EN PHRASE LIBRE : la casse, les accents et la
    ponctuation ne comptent pas. Jamais une question (un « ? » dans son
    texte), jamais un message qui parle de venir ou d'attendre, jamais une
    phrase qui dit autre chose en plus : le message entier tient dans une
    forme fermée, ou ce n'est pas une déclaration. */
export function ditQuElleATermine(texte: unknown): boolean {
  const brut = String(texte ?? '');
  if (/[?？]/.test(brut)) return false;
  const t = coeurDuMessageDeFin(brut);
  if (!t) return false;
  if (MOUVEMENT_OU_ATTENTE_DE_LA_FIN.test(t)) return false;
  return UNE_DECLARATION_DE_FIN.test(t.replace(ADRESSE_A_LA_MAISON_DE_LA_FIN, ' ').replace(/ +/g, ' ').trim());
}

/** ELLE NOMME SON RENDEZ-VOUS : le rendez-vous, la séance, le rituel, le lien
    de paiement, ou son code de confirmation. Sans rendez-vous du jour à ce
    numéro, c'est la seule déclaration à laquelle la Maison répond elle-même
    (elle demande le code) ; « c'est fini », « fini », « j'ai fini » tout
    courts peuvent parler de n'importe quoi, et restent à la conversation. */
const NOM_DU_RENDEZ_VOUS_DE_LA_FIN = /\b(?:rdv|rendez vous|seance|rituel|lien de paiement)\b/;
export const nommeSonRendezVous = (texte: unknown): boolean =>
  NOM_DU_RENDEZ_VOUS_DE_LA_FIN.test(motsDuMessageDeFin(texte)) || codeDansLeMessage(texte) !== null;

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

/** SA PIÈCE EST SOLDÉE PAR UN VERSEMENT EN LIGNE (relecture du 6 novembre
    2026) : plus rien à régler, ET au moins un versement posé par la fonction
    `regler-la-seance` (son identifiant commence par « kkia- », celui de la
    transaction vérifiée chez KkiaPay). C'est la SEULE chose qui dit « Réglée
    en ligne · Départ sans caisse » au Trône. Les marques du rendez-vous
    (`termineParElle`, `honoreAuReglement`) ne le disent jamais à elles
    seules : une marque se pose et se retire sans qu'un franc soit entré, et
    une pièce soldée au comptoir n'est pas « réglée en ligne ». */
export const PREFIXE_DU_VERSEMENT_EN_LIGNE = 'kkia-';
export type PieceAuCarnet = { resteXof: number; versements: readonly { id?: string }[] };
export function soldeeEnLigne(p: PieceAuCarnet | null | undefined): boolean {
  return !!p && Number.isFinite(p.resteXof) && Math.round(p.resteXof) <= 0
    && p.versements.some((v) => String(v?.id ?? '').startsWith(PREFIXE_DU_VERSEMENT_EN_LIGNE));
}

/** LA MARQUE DU CARNET : « A terminé · règlement en cours », puis « Réglée
    en ligne · Départ sans caisse » quand SA PIÈCE est soldée par un versement
    en ligne. Rien pour un rendez-vous qu'elle n'a pas terminé elle-même ;
    rien non plus quand sa pièce est soldée autrement (au comptoir : le Carnet
    le dit déjà). `piece` : sa pièce, null tant qu'elle n'est pas écrite. */
export type MarqueAuCarnet = { etat: 'a-termine' | 'reglee-en-ligne'; dit: string; sous: string };
export function marqueDeLaFinAuCarnet(r: Pick<RdvDeLaFin, 'status' | 'termineParElle'>, piece: PieceAuCarnet | null): MarqueAuCarnet | null {
  if (!r.termineParElle?.le || r.status === 'annulé') return null;
  if (soldeeEnLigne(piece)) {
    return { etat: 'reglee-en-ligne', dit: 'Réglée en ligne · Départ sans caisse', sous: 'Rien à encaisser : le fauteuil est libre.' };
  }
  if (piece && Number.isFinite(piece.resteXof) && Math.round(piece.resteXof) <= 0) return null;
  return {
    etat: 'a-termine', dit: 'A terminé · règlement en cours',
    sous: piece === null ? 'Sa pièce se prépare : elle règle depuis son téléphone.' : 'Elle règle depuis son téléphone. Encaisser au comptoir reste possible.',
  };
}

/** LA PIÈCE À PRÉPARER AU TRÔNE : elle a déclaré avoir terminé (une
    déclaration qui tient), le rendez-vous vit, et aucune pièce ne porte
    encore son rendez-vous. Le Trône l'écrit au tarif de sa tête, sans honorer. */
export function pieceAPreparer(r: Pick<RdvDeLaFin, 'id' | 'date' | 'time' | 'status' | 'termineParElle'>, aDejaSaPiece: boolean): boolean {
  return !aDejaSaPiece && r.status === 'confirmé' && finValable(r);
}

/** UNE RÉSERVATION QUI N'ABOUTIT PAS NE BLOQUE PLUS LA PIÈCE (relecture du 6
    novembre 2026). Un poste réserve la pièce (`pieceLe`) avant de l'écrire ;
    s'il se ferme, perd le réseau ou échoue juste après, la réservation
    restait, et aucun poste n'écrivait plus jamais la pièce. Ce qu'un poste
    fait d'une déclaration toujours sans pièce : la réserver quand rien ne
    l'est ; attendre une réservation qu'il VOIT depuis moins de 90 secondes ;
    la reprendre ensuite. Le délai se compte sur l'horloge de CE poste,
    depuis qu'il a vu la réservation : jamais une heure d'un poste comparée
    à celle d'un autre. */
export const ATTENTE_D_UNE_RESERVATION_MS = 90_000;
export function gesteDeLaPiece(o: { pieceLe?: string | null; vueDepuisMs: number | null; maintenantMs: number }): 'reserver' | 'attendre' | 'reprendre' {
  if (!o.pieceLe) return 'reserver';
  if (o.vueDepuisMs === null || !Number.isFinite(o.vueDepuisMs)) return 'attendre';
  return o.maintenantMs - o.vueDepuisMs >= ATTENTE_D_UNE_RESERVATION_MS ? 'reprendre' : 'attendre';
}

/** L'ARGENT DÉJÀ REÇU MONTE SUR SA PIÈCE : l'acompte reconnu et les
    versements d'avant, chacun à SA date, comme le ticket de la Caisse les
    écrit (« Acompte », sans caisse : ils sont entrés un autre jour, aucun
    tiroir d'aujourd'hui ne les reçoit). Sans eux, la page « Régler »
    redemanderait le prix entier à une cliente qui a versé un acompte. Jamais
    plus que le total de la pièce ; des identifiants tirés du rendez-vous,
    pour que deux postes écrivent les mêmes lignes. */
export function versementsDejaRecus(o: {
  rdvId: string; totalXof: number;
  dejaRecu: readonly { date: string; amountXof: number; note: string }[];
}): { id: string; date: string; amountXof: number; method: 'Acompte'; note: string }[] {
  const out: { id: string; date: string; amountXof: number; method: 'Acompte'; note: string }[] = [];
  let reste = Math.max(0, Math.round(Number(o.totalXof) || 0));
  o.dejaRecu.forEach((d, k) => {
    const m = Math.min(reste, Math.max(0, Math.round(Number(d.amountXof) || 0)));
    if (m <= 0) return;
    out.push({ id: `deja-${o.rdvId}-${k}`, date: d.date, amountXof: m, method: 'Acompte', note: d.note });
    reste -= m;
  });
  return out;
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
    /* UN RESTE SUR SA PIÈCE ROUVRE LA CARTE (7 novembre 2026, cas réel : réglé
       100 F, honoré au règlement, puis l'équipe ajoute « La sortie soignée »
       2 000 F). « Honoré » et « payé une fois » ne ferment pas la porte tant
       que sa pièce doit encore : `porte.ouverte` juge d'abord le reste. */
    if (rdv.termineParElle?.le && !porte.ouverte && (rdv.honoreAuReglement?.le || porte.raison === 'deja-regle')) return { rdv, etat: 'regle', porte };
    if (rdv.termineParElle?.le && (rdv.status === 'confirmé' || porte.ouverte)) return { rdv, etat: 'termine', porte };
    if (porte.ouverte) return { rdv, etat: 'en-cours', porte };
  }
  return null;
}

/** CE QUE LA BASE CONFIRME (hotfix du 7 novembre 2026). Ma Couronne juge sur
    la COPIE de ses rendez-vous gardée dans le téléphone, qui peut être
    périmée : une vraie cliente a vu « À régler 34 000 F » sur un rendez-vous
    annulé et « 40 000 F » sur un passé couvert par sa formule. L'écran ne
    montre donc QUE ce que la fonction (la base, la même règle) a rendu : un
    rendez-vous que le serveur ne cite pas ne paraît pas, et le montant est le
    sien. Sans réponse du serveur (null : panne, hors ligne, pas encore lu),
    rien ne paraît : mieux vaut un rituel dû qu'on ne montre pas qu'un montant
    faux qu'on montre. */
export type DuDuServeur = { rdvId: string; resteXof: number; surLaPiece: boolean };
export function duConfirmeParLeServeur<T extends { rdv: { id: string } }>(locaux: readonly (T & { resteXof: number; surLaPiece: boolean })[], serveur: readonly DuDuServeur[] | null): (T & { resteXof: number; surLaPiece: boolean })[] {
  if (!serveur) return [];
  const parId = new Map(serveur.map((d) => [d.rdvId, d]));
  return locaux.filter((d) => parId.has(d.rdv.id)).map((d) => ({ ...d, resteXof: Math.round(parId.get(d.rdv.id)!.resteXof), surLaPiece: parId.get(d.rdv.id)!.surLaPiece }));
}
/** Le reste d'avance que le serveur confirme pour ce rendez-vous, ou null. */
export function resteDAvanceConfirme(rdvId: string, serveur: readonly DuDuServeur[] | null): number | null {
  const d = serveur?.find((x) => x.rdvId === rdvId);
  return d && Number.isFinite(d.resteXof) && d.resteXof > 0 ? Math.round(d.resteXof) : null;
}

/** « À RÉGLER », DANS MA COURONNE (7 novembre 2026) : ses rendez-vous PASSÉS
    qui doivent encore (et ceux des têtes qu'elle porte), sans limite de
    temps, le plus récent d'abord. La règle est `porteAvantApres` (« après ») :
    la pièce qui doit encore, sinon le prix figé d'un rendez-vous confirmé ;
    jamais un annulé, un couvert par une formule, une pièce soldée. Le montant
    montré n'est qu'une lecture : celui qu'elle règle est relu au serveur. */
export type DuApres<T> = { rdv: T; resteXof: number; surLaPiece: boolean };
export function aReglerApres<T extends RdvDeLaFin>(o: {
  rdvs: readonly T[]; maintenantMs: number;
  passeAuComptoirDe?: (clientId: string) => boolean;
  resteDeLaPiece?: (rdvId: string) => number | null;
}): DuApres<T>[] {
  const dus: DuApres<T>[] = [];
  for (const rdv of o.rdvs) {
    const reste = o.resteDeLaPiece ? o.resteDeLaPiece(rdv.id) : null;
    const p = porteAvantApres({
      quand: 'apres', rdv, maintenantMs: o.maintenantMs,
      passeAuComptoir: o.passeAuComptoirDe ? o.passeAuComptoirDe(String(rdv.clientId ?? '')) === true : false,
      piece: reste === null ? null : { resteXof: reste },
    });
    if (p.ouverte && p.resteXof !== null && p.resteXof > 0) dus.push({ rdv, resteXof: p.resteXof, surLaPiece: p.surLaPiece });
  }
  return dus.sort((a, b) => `${b.rdv.date ?? ''} ${b.rdv.time ?? ''} ${b.rdv.id}`.localeCompare(`${a.rdv.date ?? ''} ${a.rdv.time ?? ''} ${a.rdv.id}`));
}
