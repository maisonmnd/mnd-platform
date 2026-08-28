import { apptDueXof, apptPaidXof, type Appointment } from './agenda';
import { creditSignedXof, invoiceReglements, invoiceResteXof, invoiceTotal, type CreditMovement, type Invoice } from './finance';
import type { Client, Family } from './clients';
import { payerClientIdOf } from './accounts';

/* ── LE COMPTE D'UNE CLIENTE — débit, crédit, solde (26 août) ─────────
   « Un vrai compte client pour mieux suivre les crédits » (Yéman).

   Ce que la Maison savait déjà faire, éparpillé : les impayés (reste dû par
   rituel), les versements datés, les avoirs. Ce qu'elle ne savait pas : les
   dire SUR UNE SEULE LIGNE DE VIE, avec un solde qui descend sous zéro. Le
   solde d'avoir, lui, s'arrête à zéro par construction — la dette vivait donc
   ailleurs, et personne ne pouvait répondre « elle doit combien, en tout ? ».

   RIEN N'EST STOCKÉ. Tout se dérive des rituels, des factures et des
   mouvements d'avoir. Un solde écrit à côté de ses écritures finit toujours
   par les contredire ; celui-ci ne peut pas mentir, il se recalcule.

   LE DOUBLE COMPTAGE EST LE PIÈGE DE CET ÉCRAN, et la Maison a déjà tranché :
   le RITUEL fait foi. Une facture ATTACHÉE à un rituel ne réécrit donc rien —
   elle ne fait que mettre en pièce ce que le rituel porte déjà. Seules les
   factures LIBRES (vente de produits, caisse) entrent à leur tour. */

export type SourceEcriture = 'rituel' | 'facture' | 'reglement' | 'avoir';

export type EcritureCompte = {
  id: string;
  date: string;              // ISO — l'ordre du relevé
  libelle: string;
  detail?: string;
  debitXof: number;          // ce que la Maison a livré
  creditXof: number;         // ce que la cliente a versé
  source: SourceEcriture;
  /** Jours écoulés depuis une livraison NON soldée — l'âge de la créance. */
  impayeDepuisJours?: number;
  impayeXof?: number;
};

const jours = (deIso: string, aIso: string): number => {
  const a = new Date(`${deIso}T12:00:00`).getTime();
  const b = new Date(`${aIso}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
};

/** LES TÊTES DONT LE COMPTE PARLE — une tête rattachée à un foyer voit le
    compte DU FOYER : c'est la payeuse qui doit, et l'avoir est porté par le
    compte, pas par elle. Une tête sans famille ne voit qu'elle-même. */
export function tetesDuCompte(client: Client, clients: readonly Client[], families: readonly Family[]): string[] {
  const fam = client.familyId ? families.find((f) => f.id === client.familyId) : undefined;
  if (!fam) return [client.id];
  return clients.filter((c) => c.familyId === fam.id && !c.archived).map((c) => c.id);
}

/** Une facture est-elle ATTACHÉE à un rituel ? Alors elle ne compte pas à part. */
const facturesLiees = (appts: readonly Appointment[]): Set<string> => {
  const s = new Set<string>();
  for (const a of appts) if (a.invoiceId) s.add(a.invoiceId);
  return s;
};

export type CompteArgs = {
  ids: readonly string[];              // les têtes du compte
  /** LES PORTEURS D'AVOIR de ce compte — la famille quand il y en a une, la
      tête sinon (règle de `holderOf`). OBLIGATOIRE : sans lui, les avoirs de
      toute la Maison retombaient sur chaque fiche. */
  porteurs: readonly { type: 'client' | 'family'; id: string }[];
  appts: readonly Appointment[];
  invoices: readonly Invoice[];
  credits: readonly CreditMovement[];
  netDuRituel: (a: Appointment) => number;
  dûDuRituel: (a: Appointment) => number;
  aujourdhui: string;
};

/** LE RELEVÉ, dans l'ordre où la vie l'a écrit. */
export function ecrituresDuCompte(o: CompteArgs): EcritureCompte[] {
  const ids = new Set(o.ids);
  const liees = facturesLiees(o.appts.filter((a) => ids.has(a.clientId)));
  const out: EcritureCompte[] = [];

  /* ① LES RITUELS LIVRÉS — honorés seulement : on ne doit pas ce qu'on n'a pas
     reçu, et un rendez-vous à venir n'est pas une dette. */
  for (const a of o.appts) {
    if (!ids.has(a.clientId) || a.status !== 'honoré') continue;
    const net = o.netDuRituel(a);
    const dû = o.dûDuRituel(a);
    if (net > 0) {
      out.push({
        id: `r-${a.id}`, date: a.date, source: 'rituel',
        libelle: a.clientName ? `Rituel · ${a.clientName}` : 'Rituel honoré',
        debitXof: net, creditXof: 0,
        ...(dû > 0 ? { impayeXof: dû, impayeDepuisJours: jours(a.date, o.aujourdhui) } : {}),
      });
    }
    /* Ce qui a été versé sur ce rituel, à SA date quand le journal la porte. */
    const verse = apptPaidXof(a);
    if (verse > 0) {
      for (const p of a.payments ?? []) {
        if (p.amountXof > 0) {
          out.push({
            id: `p-${p.id}`, date: p.date || a.date, source: 'reglement',
            libelle: p.method || 'Règlement', debitXof: 0, creditXof: p.amountXof,
          });
        }
      }
      if (!a.payments?.length) {
        out.push({
          id: `p-${a.id}`, date: a.date, source: 'reglement',
          libelle: 'Règlement', debitXof: 0, creditXof: verse,
        });
      }
    }
  }

  /* ② LES FACTURES LIBRES — produits, caisse : ce que le rituel ne porte pas. */
  for (const i of o.invoices) {
    const pour = i.clientId;
    if (!ids.has(pour) || i.kind !== 'facture' || liees.has(i.id)) continue;
    const total = invoiceTotal(i);
    if (total > 0) {
      const reste = invoiceResteXof(i);
      out.push({
        id: `f-${i.id}`, date: i.date, source: 'facture',
        libelle: `Facture ${i.number}`, debitXof: total, creditXof: 0,
        ...(reste > 0 ? { impayeXof: reste, impayeDepuisJours: jours(i.date, o.aujourdhui) } : {}),
      });
    }
    for (const p of invoiceReglements(i)) {
      if (p.amountXof > 0) {
        out.push({
          id: `fp-${p.id}`, date: p.date || i.date, source: 'reglement',
          libelle: p.method || 'Règlement', detail: `Facture ${i.number}`,
          debitXof: 0, creditXof: p.amountXof,
        });
      }
    }
  }

  /* ③ LES AVOIRS — un dépôt crédite, un usage crédite aussi (il solde une
     prestation déjà portée au débit), un remboursement débite : l'argent sort.

     ILS SE FILTRENT PAR PORTEUR, et ce filtre manquait (corrigé le 28 août,
     signalé par Yéman : « pourquoi la Maison doit à toutes ces clientes ?
     pourquoi elles ont les mêmes mouvements ? »). Les rituels étaient filtrés
     par tête, les factures aussi — les avoirs ne l'étaient PAS. Chaque compte
     affichait donc les avoirs de la Maison ENTIÈRE : le même solde et les
     mêmes lignes sur toutes les fiches, et une Maison qui semblait devoir
     346 000 F à chacune.

     C'est pourquoi `porteurs` est OBLIGATOIRE et non facultatif : un champ
     qu'on peut oublier se réoublie. Un avoir appartient à UN porteur — la
     famille quand il y en a une, la tête sinon (règle de `holderOf`). */
  const porteurs = new Set(o.porteurs.map((h) => `${h.type}:${h.id}`));
  for (const m of o.credits) {
    if (!porteurs.has(`${m.holderType}:${m.holderId}`)) continue;
    const signe = creditSignedXof(m);
    const libelle = m.kind === 'depot' ? 'Avoir déposé'
      : m.kind === 'usage' ? 'Réglé par avoir'
        : 'Avoir remboursé';
    /* SEUL LE DÉPÔT CRÉDITE. L'usage et le remboursement SORTENT de l'avoir,
       donc débitent — corrigé le 28 août avec le filtre des porteurs.

       L'usage créditait, et c'était un second double comptage : quand un
       rituel se règle par avoir, l'encaissement inscrit DÉJÀ la somme entière
       dans les versements du rendez-vous (`settleTotal`, avoir compris). Le
       mouvement d'usage la recomptait, et le solde enflait de la valeur de
       l'avoir à chaque consommation.

       Le compte juste se lit ainsi : le dépôt crédite (+40 000), le rituel
       débite (−30 000), son versement crédite (+30 000), l'usage débite le
       même montant (−30 000) parce que l'avoir a bien été dépensé. Reste
       10 000, ce qui est vrai. */
    out.push({
      id: `a-${m.id}`, date: m.date, source: 'avoir', libelle,
      detail: m.kind === 'usage' ? 'le compte se consomme, aucun billet ne bouge' : m.method,
      debitXof: signe < 0 ? Math.abs(signe) : 0,
      creditXof: signe > 0 ? signe : 0,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** LE SOLDE — négatif : elle doit à la Maison ; positif : la Maison lui doit. */
export const soldeDuCompte = (ecritures: readonly EcritureCompte[]): number =>
  ecritures.reduce((s, e) => s + e.creditXof - e.debitXof, 0);

/* ── CE QUI RESTE DÛ, LIGNE PAR LIGNE (26 août) ───────────────────────
   Le relevé complet répond à « que s'est-il passé ». Il ne répond pas à
   « qu'est-ce que je fais maintenant » : il faut le lire, trier les versements
   des prestations, et additionner de tête. C'est ce reproche-là qui a fait
   refaire l'écran.

   Cette liste ne garde que les livraisons NON SOLDÉES, chacune avec son âge et
   ce qui a déjà été versé dessus — de quoi encaisser ou relancer sans lire une
   seule autre ligne. Elle se dérive du même relevé : deux lectures d'une seule
   vérité, jamais deux calculs. */

export type LigneImpayee = {
  /** L'identifiant du rituel ou de la facture — pour rouvrir l'encaissement. */
  refId: string;
  kind: 'rituel' | 'facture';
  date: string;
  libelle: string;
  totalXof: number;
  verseXof: number;
  resteXof: number;
  depuisJours: number;
};

/** Les livraisons non soldées, la plus vieille d'abord : c'est elle qui presse. */
export function lignesImpayees(ecritures: readonly EcritureCompte[]): LigneImpayee[] {
  return ecritures
    .filter((e) => (e.impayeXof ?? 0) > 0 && (e.source === 'rituel' || e.source === 'facture'))
    .map((e) => ({
      /* `r-<id>` / `f-<id>` : on rend l'identifiant nu à l'appelant. */
      refId: e.id.slice(2),
      kind: e.source === 'rituel' ? ('rituel' as const) : ('facture' as const),
      date: e.date,
      libelle: e.libelle,
      totalXof: e.debitXof,
      verseXof: Math.max(0, e.debitXof - (e.impayeXof ?? 0)),
      resteXof: e.impayeXof ?? 0,
      depuisJours: e.impayeDepuisJours ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type Creance = {
  clientId: string;
  duXof: number;
  /** L'âge de la PLUS VIEILLE dette — celle qui donne son ton au dossier. */
  depuisJours: number;
  plusVieilleDate: string;
};

/** CE QUE LA MAISON ATTEND, tête par tête. La date qui fait foi est celle du
    RITUEL (ou de la facture), jamais celle de la dernière relance : une créance
    ne rajeunit pas parce qu'on en a reparlé. */
export function creancesDeLaMaison(o: {
  appts: readonly Appointment[];
  dûDuRituel: (a: Appointment) => number;
  aujourdhui: string;
}): Creance[] {
  const par = new Map<string, Creance>();
  for (const a of o.appts) {
    if (a.status === 'annulé') continue;
    const dû = o.dûDuRituel(a);
    if (dû <= 0) continue;
    const cur = par.get(a.clientId);
    if (!cur) {
      par.set(a.clientId, { clientId: a.clientId, duXof: dû, depuisJours: jours(a.date, o.aujourdhui), plusVieilleDate: a.date });
    } else {
      cur.duXof += dû;
      if (a.date < cur.plusVieilleDate) {
        cur.plusVieilleDate = a.date;
        cur.depuisJours = jours(a.date, o.aujourdhui);
      }
    }
  }
  return [...par.values()].sort((x, y) => y.depuisJours - x.depuisJours);
}

export type Tranche = '0-30' | '30-60' | '60-90' | '90+';
export const TRANCHES: { k: Tranche; label: string; sous: string }[] = [
  { k: '0-30', label: 'Moins de 30 jours', sous: 'la dette du mois' },
  { k: '30-60', label: '30 à 60 jours', sous: 'elle traîne' },
  { k: '60-90', label: '60 à 90 jours', sous: 'à relancer' },
  { k: '90+', label: 'Plus de 90 jours', sous: 'créance douteuse' },
];

export const trancheDe = (depuisJours: number): Tranche =>
  depuisJours < 30 ? '0-30' : depuisJours < 60 ? '30-60' : depuisJours < 90 ? '60-90' : '90+';

/* ── LE PLAFOND DE CRÉDIT (26 août) ───────────────────────────────────
   « Autoriser nommément certaines têtes à partir sans payer, jusqu'à un
   montant. » Le plafond vit sur la fiche (`plafondCreditXof`). Sans plafond,
   la Maison n'autorise rien — et c'est le bon défaut : le crédit s'accorde,
   il ne se suppose pas. */

export type VerdictCredit = {
  autorise: boolean;
  plafond: number;
  dejaDu: number;
  apres: number;
  depassementXof: number;
};

/** Peut-elle partir en devant `montantXof` de plus ? */
export function peutPartirDevant(plafond: number | undefined, dejaDu: number, montantXof: number): VerdictCredit {
  const p = Math.max(0, plafond ?? 0);
  const apres = Math.max(0, dejaDu) + Math.max(0, montantXof);
  return {
    autorise: apres <= p,
    plafond: p,
    dejaDu: Math.max(0, dejaDu),
    apres,
    depassementXof: Math.max(0, apres - p),
  };
}

/** Le dû d'une tête, du même juge que le Carnet — pour l'alerte au fauteuil. */
export const duDeLaTete = (
  appts: readonly Appointment[], clientId: string, dûDuRituel: (a: Appointment) => number,
): number => appts.reduce((s, a) => (a.clientId === clientId && a.status !== 'annulé' ? s + dûDuRituel(a) : s), 0);

/** LE DÛ DU COMPTE ENTIER — car dans un foyer la dette naît souvent sur le
    rituel de l'enfant tandis que le plafond est posé sur la payeuse. Comparer
    le plafond de l'une au seul dû de l'autre laisserait un foyer partir
    indéfiniment en devant. */
export const duDuCompte = (
  appts: readonly Appointment[], ids: readonly string[], dûDuRituel: (a: Appointment) => number,
): number => {
  const set = new Set(ids);
  return appts.reduce((s, a) => (set.has(a.clientId) && a.status !== 'annulé' ? s + dûDuRituel(a) : s), 0);
};

/* Réexports pour les appelants : un seul juge du dû et du net. */
export { apptDueXof, payerClientIdOf };
