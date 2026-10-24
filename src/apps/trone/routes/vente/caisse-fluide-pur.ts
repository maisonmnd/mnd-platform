/* ══ LA CAISSE DU COMPTOIR, FLUIDE — 24 octobre 2026 ═════════════════
   « Tu n'as pas construit la page du paiement. Elle doit être smooth et
   intelligente » (Yéman) ; au sélecteur : l'encaissement à la Caisse.
   Maquette https://claude.ai/artifact/EUoSyHQdaTM5q7sc9SBK45
   (`public/maquette-encaisser-au-comptoir.html`), ses quatre arbitrages :

   1. EN TÊTE, CE QUI EST À ENCAISSER MAINTENANT : les rendez-vous du jour au
      fauteuil ou finis, pas encore réglés, le plus ancien en premier.
   2. LE MOYEN HABITUEL CHOISI D'AVANCE, celui de ses dernières venues ; une
      nouvelle cliente n'a rien de choisi.
   3. LA MONNAIE RENDUE À L'ÉCRAN pour les espèces, les billets ronds en un geste.
   4. UN ÉCRAN DE RÉUSSITE après l'encaissement.

   Les règles d'argent ne changent pas : le ticket reste celui de `leTicket`,
   la caisse celle de `caisseProposee`. Ici, seulement ce qui se PROPOSE.
   Sans magasin ni React : `scripts/verifie-la-caisse-fluide` les éprouve. */

import type { Appointment } from '../../../../shared/agenda';
import type { Invoice, PaymentMethod } from '../../../../shared/finance';
import { offreDuCode, remiseDeLOffreSurLeTicket, type OffreCodee } from '../../../../shared/offres-pur';

const minutesDe = (hhmm: string | undefined): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
};

/** À ENCAISSER MAINTENANT. Du jour, avec une cliente, ni annulé ni déjà
    réglé (sans pièce, et quelque chose de dû), commencé à l'heure qu'il est :
    au fauteuil ou fini. Le plus ancien en premier : c'est celui qui attend
    au comptoir depuis le plus longtemps. */
export function aEncaisserMaintenant<A extends Pick<Appointment, 'id' | 'date' | 'time' | 'status' | 'clientId' | 'invoiceId'>>(
  rdvs: readonly A[],
  e: { aujourdhui: string; maintenantMin: number; dejaSaPiece: (a: A) => boolean; duXof: (a: A) => number },
): A[] {
  return rdvs
    .filter((a) => a.date === e.aujourdhui && !!a.clientId && a.status !== 'annulé' && !a.invoiceId
      && minutesDe(a.time) <= e.maintenantMin && !e.dejaSaPiece(a) && e.duXof(a) > 0)
    .sort((a, b) => minutesDe(a.time) - minutesDe(b.time));
}

/** SON MOYEN HABITUEL : le plus fréquent de ses six derniers versements
    (l'acompte et l'avoir ne disent pas comment elle paie), à égalité le plus
    récent ; seulement parmi les moyens que la Caisse propose aujourd'hui.
    Une cliente sans versement n'en a pas. */
export function moyenHabituel(
  pieces: readonly Pick<Invoice, 'clientId' | 'date' | 'payments' | 'payment' | 'kind'>[],
  clientId: string,
  possibles: readonly PaymentMethod[],
): PaymentMethod | undefined {
  if (!clientId) return undefined;
  const ok = new Set(possibles);
  const vus: { m: PaymentMethod; date: string }[] = [];
  for (const i of pieces) {
    if (i.clientId !== clientId || i.kind !== 'facture') continue;
    const versements = i.payments?.length ? i.payments : (i.payment ? [{ method: i.payment, date: i.date }] : []);
    for (const p of versements) {
      if (!p.method || p.method === 'Acompte' || p.method === 'Avoir' || !ok.has(p.method)) continue;
      vus.push({ m: p.method, date: p.date ?? i.date });
    }
  }
  const derniers = vus.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 6);
  if (!derniers.length) return undefined;
  const compte = new Map<PaymentMethod, { n: number; rang: number }>();
  derniers.forEach((v, rang) => {
    const c = compte.get(v.m);
    compte.set(v.m, c ? { n: c.n + 1, rang: c.rang } : { n: 1, rang });
  });
  return [...compte.entries()].sort((a, b) => b[1].n - a[1].n || a[1].rang - b[1].rang)[0][0];
}

/** LES BILLETS RONDS AU-DESSUS DU DÛ : le compte exact, puis le prochain
    multiple de 5 000, de 10 000, et 10 000 de plus. Jamais sous le dû. */
export function billetsRonds(duXof: number): number[] {
  const du = Math.max(0, Math.round(duXof));
  if (du === 0) return [];
  const dix = Math.ceil(du / 10_000) * 10_000;
  return [...new Set([du, Math.ceil(du / 5_000) * 5_000, dix, dix + 10_000])].filter((x) => x >= du).slice(0, 4);
}

/** LA MONNAIE : ce qu'on rend, ou ce qui manque. Rien de tapé, rien à dire. */
export function renduDeMonnaie(duXof: number, donneXof: number): { renduXof: number; manqueXof: number } {
  const du = Math.max(0, Math.round(duXof));
  const donne = Math.max(0, Math.round(donneXof));
  if (!donne) return { renduXof: 0, manqueXof: 0 };
  return donne >= du ? { renduXof: donne - du, manqueXof: 0 } : { renduXof: 0, manqueXof: du - donne };
}

/** L'OFFRE QUI COURT ET MORD SUR CE TICKET : celle qui retire le plus sur
    ses prestations, à proposer d'un geste (rien n'est appliqué en silence).
    Rien quand un code est déjà tapé : la caissière a déjà choisi. */
export function offreAProposer<T extends OffreCodee & { title?: string }>(
  offres: readonly T[],
  lignes: readonly { serviceId: string; montantXof: number }[],
  e: { codeTape: string; maintenant?: Date },
): { offre: T; retireXof: number } | null {
  if (e.codeTape.trim() || !lignes.length) return null;
  let mieux: { offre: T; retireXof: number } | null = null;
  for (const o of offres) {
    if (!o.code) continue;
    const vive = offreDuCode([o], o.code, e.maintenant ?? new Date());
    if (!vive) continue;
    const retire = remiseDeLOffreSurLeTicket(vive, lignes).retire;
    if (retire > 0 && (!mieux || retire > mieux.retireXof)) mieux = { offre: vive, retireXof: retire };
  }
  return mieux;
}
