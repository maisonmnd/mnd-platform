import { invoiceReglements, type Invoice, type Payment as OnlinePayment, type CreditMovement } from './finance';
import type { Appointment, ApptPayment } from './agenda';

/* Le registre des encaissements — TOUT ce que la Maison reçoit, d'où que ça vienne.
 *
 * DÉRIVÉ, jamais écrit. Aucun magasin ne le stocke : il se recalcule à partir des
 * six portes par lesquelles l'argent entre. Un compteur écrit dériverait de la
 * réalité au premier écran oublié — même règle que le suivi des abonnements.
 *
 * LA RÈGLE QUI ÉVITE DE COMPTER DEUX FOIS : chaque ligne représente un MOMENT où
 * de l'argent est entré, jamais une créance ni un chiffre d'affaires. Un acompte
 * entre le jour où il est reçu ; la facture qui le solde n'encaisse alors que le
 * RESTE (`invoiceTotal − avoir − acompte déjà reçu`). Les deux lignes se
 * complètent sans se recouvrir, et leur somme est ce qui est réellement rentré.
 *
 * LE POURBOIRE A SA PROPRE LIGNE (11 août) : il entrait dans le montant de la
 * facture et gonflait sa caisse — une cliente remet 45 000 F, la Caisse Principale
 * s'inscrivait 45 000 alors que 40 000 y entrent et que 5 000 vont dans la
 * caisse pourboire de l'équipe. Désormais la facture encaisse SON total, et le
 * pourboire paraît à part, crédité à la caisse « Pourboires » — l'argent des
 * mains, pas celui de la Maison.
 *
 * Ce que le registre n'est PAS : la Synthèse. Elle mesure le chiffre d'affaires
 * (ce que la Maison a GAGNÉ, avoir compris, pourboire exclu). Ici on mesure la
 * TRÉSORERIE (ce qui est ENTRÉ, pourboire compris — sur sa ligne à lui —, avoir
 * exclu). Les deux totaux diffèrent légitimement — ne jamais les faire coïncider. */

export type ReceiptKind = 'facture' | 'acompte' | 'formation' | 'abonnement' | 'avoir' | 'pourboire';

/** LE BOCAL DES POURBOIRES — un nom, à UN seul endroit. Ce n'est pas une
    caisse déclarée (aucun solde d'ouverture, aucun relevé) : c'est l'argent
    des mains, que le registre trace sans le compter à la Maison. */
export const CAISSE_POURBOIRES = 'Pourboires';

export type Receipt = {
  /** Stable et dérivé de la source : rejouer le calcul redonne le même id. */
  id: string;
  kind: ReceiptKind;
  /** Jour de l'ENTRÉE d'argent (ISO), pas celui de la prestation. */
  date: string;
  clientId?: string;
  clientName: string;
  /** Ce qui est entré ce jour-là, en XOF. Toujours > 0 (sinon pas de ligne). */
  amountXof: number;
  /** Moyen déclaré (Espèces, MTN MoMo, KkiaPay…). */
  method: string;
  /** Caisse créditée — absente quand l'argent n'a pas de tiroir (avoir). */
  cashbox?: string;
  /** Preuve : numéro de facture, référence de transaction… */
  ref?: string;
  /** Ce qui a été réglé, en clair. */
  label: string;
  invoiceId?: string;
  apptId?: string;
};

const LABEL_KIND: Record<ReceiptKind, string> = {
  facture: 'Facture',
  acompte: 'Acompte',
  formation: 'Formation',
  abonnement: 'Abonnement',
  avoir: 'Dépôt d’avoir',
  pourboire: 'Pourboire',
};
export const receiptKindLabel = (k: ReceiptKind): string => LABEL_KIND[k];

/** jj/mm/aaaa (saisies Académie) ou ISO → ISO. */
const toISO = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : d.slice(0, 10);
};

export type ReceiptSources = {
  branchId: string;
  invoices: Invoice[];
  online: OnlinePayment[];
  appointments: Appointment[];
  credits: CreditMovement[];
  /** Règlements de formation — les apprenants ne sont pas rattachés à une branche. */
  formation: { id: string; name: string; payments?: { id: string; amountXof: number; date: string; method?: string }[] }[];
  /** Règlements d'abonnement. */
  abonnements: { id: string; clientId?: string; name?: string; payments?: { id: string; amountXof: number; date: string; method?: string }[] }[];
  /** Nom d'une cliente à partir de son identifiant. */
  nameOf: (clientId?: string) => string;
  /** Libellé des prestations d'un rituel. */
  apptLabel: (a: Appointment) => string;
};

export function buildReceipts(s: ReceiptSources): Receipt[] {
  const out: Receipt[] = [];

  /* LA DATE D'UN RÈGLEMENT DE RITUEL SE LIT AU JOURNAL, jamais sur la pièce.
     Une facture porte le jour du RITUEL — c'est la prestation qu'elle décrit ;
     l'argent, lui, entre le jour où il est remis. Une cliente qui verse
     100 000 F le 23 avril puis 300 000 F le 30 avril pour un rituel du 2 mai a
     payé 400 000 F EN AVRIL : datées par leur facture, ces entrées basculaient
     sur mai et faussaient deux mois d'un coup — mai enflé d'un argent qui n'y
     est jamais entré, avril vidé d'autant.

     Deux lectures, dans cet ordre : le versement qui porte l'identifiant de
     cette pièce ; à défaut (journaux d'avant ce lien), le DERNIER versement du
     rituel que cette facture a soldé — c'est elle qui l'a écrit. Puis, en
     dernier recours, la date de la pièce : les rituels sans journal n'ont
     jamais su dire autre chose, et les ignorer effacerait leur règlement. */
  const versementDeFacture = new Map<string, ApptPayment>();
  const dernierVersementDeFacture = new Map<string, ApptPayment>();
  for (const a of s.appointments) {
    const journal = a.payments ?? [];
    for (const p of journal) if (p.invoiceId) versementDeFacture.set(p.invoiceId, p);
    if (a.invoiceId && journal.length) dernierVersementDeFacture.set(a.invoiceId, journal[journal.length - 1]);
  }

  /* ① Factures payées — ce qui est entré AU COMPTOIR ce jour-là : le total, moins
     l'avoir (pas des billets) et moins l'acompte déjà reçu (entré un autre jour).
     Le pourboire ne crédite PLUS la caisse de la facture : il sort en ①bis. */
  for (const i of s.invoices) {
    if (i.branchId !== s.branchId) continue;
    const versement = versementDeFacture.get(i.id) ?? dernierVersementDeFacture.get(i.id);
    /* UNE PREUVE PAR VERSEMENT — 17 août 2026. Une pièce peut désormais être
       réglée en plusieurs fois, à des dates et par des moyens différents : une
       seule ligne par facture les aurait fondus en un montant sans date vraie.
       Le filtre sur `payée` tombe avec eux — une pièce à moitié réglée a bel et
       bien fait entrer de l'argent.

       L'avoir et l'acompte n'entrent pas ici : le premier est un crédit
       consommé (pas des billets), le second est entré un autre jour et se
       présente à sa propre section. */
    const enBillets = invoiceReglements(i).filter((p) => p.method !== 'Avoir' && p.method !== 'Acompte');
    for (const p of enBillets) {
      if (p.amountXof <= 0) continue;
      out.push({
        id: `r-inv-${i.id}-${p.id}`,
        kind: 'facture',
        date: p.date || versement?.date || i.date,
        clientId: i.clientId,
        clientName: i.clientName ?? s.nameOf(i.clientId),
        amountXof: p.amountXof,
        method: p.method || 'Espèces',
        cashbox: p.cashbox,
        ref: i.number,
        label: i.lines.map((l) => l.label).join(' + ') || 'Règlement',
        invoiceId: i.id,
      });
    }
    /* ①bis Le pourboire, sur SA ligne — même jour, même preuve, mais caisse
       « Pourboires » : c'est l'argent des mains, il ne doit ni gonfler la
       caisse de la Maison ni disparaître du registre. Il paraît même quand la
       facture est entièrement couverte par un avoir — le billet, lui, est là.
       RÈGLEMENT EN DEVISE : le billet étranger reste ENTIER dans son tiroir
       (`fx.amount` l'inclut, et le relevé de Dépenses ne le découpe pas —
       doctrine du 11 août) ; la ligne se met donc au TIROIR DEVISE, pas au
       bocal — sinon le même billet vivait dans deux caisses à la fois et le
       tiroir paraissait chroniquement court du pourboire (12 août). */
    if ((i.tipXof ?? 0) > 0) {
      out.push({
        id: `r-tip-${i.id}`,
        kind: 'pourboire',
        date: versement?.date ?? i.date,
        clientId: i.clientId,
        clientName: i.clientName ?? s.nameOf(i.clientId),
        amountXof: i.tipXof!,
        method: i.payment ?? 'Espèces',
        cashbox: i.fx ? i.cashbox : CAISSE_POURBOIRES,
        ref: i.number,
        label: i.fx ? 'Pourboire — dans le tiroir devise' : 'Pourboire — merci des mains',
        invoiceId: i.id,
      });
    }
  }

  /* ② Acomptes réglés EN LIGNE — la preuve est la transaction elle-même. */
  const onlineByAppt = new Set<string>();
  for (const p of s.online) {
    if (p.branchId !== s.branchId || p.status !== 'success') continue;
    if (p.partnerId) onlineByAppt.add(p.partnerId);
    const appt = s.appointments.find((a) => a.id === p.partnerId);
    out.push({
      id: `r-pay-${p.id}`,
      kind: 'acompte',
      date: (p.at ?? '').slice(0, 10),
      clientId: p.clientId ?? appt?.clientId,
      clientName: appt?.clientName ?? s.nameOf(p.clientId ?? appt?.clientId),
      amountXof: p.amountXof,
      method: `KkiaPay${p.method ? ` · ${p.method === 'CARD' ? 'carte' : 'Mobile Money'}` : ''}`,
      cashbox: 'KkiaPay',
      ref: p.id,
      label: appt ? `Acompte · ${s.apptLabel(appt)}` : 'Acompte en ligne',
      apptId: p.partnerId,
    });
  }

  /* ③ Acomptes remis à la Maison puis RECONNUS reçus au comptoir. On saute ceux
     déjà couverts par une transaction en ligne (même argent, une seule ligne). */
  for (const a of s.appointments) {
    if (a.branchId !== s.branchId) continue;
    if (!a.depositConfirmed || !(a.depositXof ?? 0)) continue;
    if (onlineByAppt.has(a.id)) continue;
    out.push({
      id: `r-dep-${a.id}`,
      kind: 'acompte',
      /* Date de reconnaissance ; à défaut (acomptes d'avant ce champ), le jour du rituel. */
      date: a.depositConfirmedAt ?? a.date,
      clientId: a.clientId,
      clientName: a.clientName ?? s.nameOf(a.clientId),
      amountXof: a.depositXof ?? 0,
      method: 'Mobile Money',
      ref: undefined,
      label: `Acompte · ${s.apptLabel(a)}`,
      apptId: a.id,
    });
  }

  /* ④ Formations de l'Académie — hors branche par nature (la Maison encaisse). */
  for (const ap of s.formation) {
    for (const p of ap.payments ?? []) {
      if (!(p.amountXof > 0)) continue;
      out.push({
        id: `r-for-${p.id}`,
        kind: 'formation',
        date: toISO(p.date),
        clientName: ap.name,
        amountXof: p.amountXof,
        method: p.method ?? 'Espèces',
        label: 'Formation · Académie',
      });
    }
  }

  /* ⑤ Règlements d'abonnement. */
  for (const sub of s.abonnements) {
    for (const p of sub.payments ?? []) {
      if (!(p.amountXof > 0)) continue;
      out.push({
        id: `r-abo-${p.id}`,
        kind: 'abonnement',
        date: toISO(p.date),
        clientId: sub.clientId,
        clientName: sub.name ?? s.nameOf(sub.clientId),
        amountXof: p.amountXof,
        method: p.method ?? 'Espèces',
        label: 'Règlement d’abonnement',
      });
    }
  }

  /* ⑥ Dépôts d'avoir — de l'argent remis à la Maison d'avance, sur un compte.
     (Un USAGE d'avoir n'est pas une entrée : il consomme ce qui est déjà là.) */
  for (const m of s.credits) {
    if (m.branchId !== s.branchId || m.kind !== 'depot') continue;
    out.push({
      id: `r-cre-${m.id}`,
      kind: 'avoir',
      date: m.date.slice(0, 10),
      clientId: m.holderType === 'client' ? m.holderId : undefined,
      clientName: m.holderType === 'client' ? s.nameOf(m.holderId) : 'Compte famille',
      amountXof: m.amountXof,
      /* LA CAISSE ET LE MOYEN VIENNENT DU MOUVEMENT — 21 août 2026. Ils étaient
         jetés ici : « Espèces », sans caisse, codés en dur. Dépenses créditait
         pourtant la caisse nommée (`avoirsDeCaisse`), si bien que les deux
         écrans se contredisaient sur la même écriture — l'un la rangeait dans
         son tiroir, l'autre l'affichait « Hors caisse ». Les mouvements d'avant
         le 19 août ne portent ni l'un ni l'autre : ils retombent sur le
         comportement d'origine, qui était le leur. */
      method: m.method || 'Espèces',
      cashbox: m.cashbox,
      label: m.note || 'Dépôt sur le compte',
    });
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Totaux par clé (moyen, caisse, nature…) — pour les cartes de tête. */
export function totalBy(list: Receipt[], key: (r: Receipt) => string): { k: string; total: number; n: number }[] {
  const m = new Map<string, { total: number; n: number }>();
  for (const r of list) {
    const k = key(r) || '—';
    const cur = m.get(k) ?? { total: 0, n: 0 };
    m.set(k, { total: cur.total + r.amountXof, n: cur.n + 1 });
  }
  return [...m.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.total - a.total);
}
