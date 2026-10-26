/* ══ LE DERNIER MESSAGE HORS SERVICE — 26 octobre 2026 ═══════════════════
   Spécification de l'Assistant Maison (maquette v4, « construis ») : « 14
   jours entre deux messages hors service, comptés sur TOUT ce qui est parti
   (l'Assistant, l'offre flash, un point d'étape, un bilan, une demande
   d'avis, une carte, une fête de couronne), sauf les services
   (confirmation, rappel de la veille, accusé, reçu, relance de facture). Une
   fonction partagée, lue par le gardien, l'automate et les relances. »

   Avant ce jour, quatre juges du dernier contact se tenaient chacun dans
   leur coin : Gérard ne voyait que ses propres messages, et une cliente
   pouvait recevoir sa demande d'avis le lundi et une envie le mardi. Ici,
   un seul juge : la table `envois` entière et les WhatsApp sortants de la
   Maison (`messages_wa`, sens « sortant »).

   Pur : `scripts/verifie-gerard.mjs` le prouve. */

/** Les envois qui SERVENT la cliente (son rendez-vous, sa pièce) : ils ne
    comptent pas dans les 14 jours. « garder », chez l'Assistant, en est un. */
export const SERVICES_DES_ENVOIS: readonly string[] = [
  'confirmation', 'rappel-j1', 'accuse', 'relance-facture', 'rappel-echeance', 'fin-de-paquet', 'prix-revu',
];

/** Ce qui n'est jamais parti ne compte pas. */
const PAS_PARTI = new Set(['écarté', 'périmé', 'échec', 'retenu', 'sans-abonnement', 'sans-numero']);

/** LE JOUR À COTONOU d'un instant (UTC+1, sans heure d'été) : 23 h 30 UTC
    est déjà le lendemain au salon. Une date seule reste telle quelle. */
export const jourACotonou = (quand: string | undefined): string => {
  const q = String(quand ?? '');
  if (q.length <= 10) return q;
  const t = Date.parse(q);
  return Number.isFinite(t) ? new Date(t + 3_600_000).toISOString().slice(0, 10) : q.slice(0, 10);
};

export type EnvoiCompte = { type?: string; genre?: string; clientId?: string; statut?: string; quand?: string; deposeLe?: string };
export type MessageCompte = { sens?: string; clientId?: string; quand?: string };

/** Cet envoi est-il un service ? */
export const estUnService = (e: Pick<EnvoiCompte, 'type' | 'genre'>): boolean =>
  SERVICES_DES_ENVOIS.includes(e.type ?? '') || (e.type === 'gerard' && e.genre === 'garder');

/** LE DERNIER MESSAGE HORS SERVICE DE CHAQUE CLIENTE (AAAA-MM-JJ) : le plus
    récent des envois partis (ou en route) qui ne sont pas des services, et
    des WhatsApp sortants. */
export function derniersMessagesHorsService(envois: readonly EnvoiCompte[], messages: readonly MessageCompte[] = []): Map<string, string> {
  const m = new Map<string, string>();
  const pose = (clientId: string | undefined, quand: string | undefined) => {
    const j = jourACotonou(quand);
    if (!clientId || !/^\d{4}-\d{2}-\d{2}$/.test(j)) return;
    const avant = m.get(clientId);
    if (!avant || j > avant) m.set(clientId, j);
  };
  for (const e of envois) {
    if (estUnService(e) || PAS_PARTI.has(e.statut ?? '')) continue;
    pose(e.clientId, e.deposeLe ?? e.quand);
  }
  for (const w of messages) if (w.sens === 'sortant') pose(w.clientId, w.quand);
  return m;
}

/** ELLE ATTEND UNE RÉPONSE : son dernier message entrant a moins de 48
    heures et rien n'est parti vers elle depuis. On lui doit une réponse
    avant une sollicitation. */
export function attendUneReponse(messages: readonly MessageCompte[], maintenantMs: number): Set<string> {
  const dernier = new Map<string, { sens: string; quand: string }>();
  for (const w of messages) {
    if (!w.clientId || !w.quand || (w.sens !== 'entrant' && w.sens !== 'sortant')) continue;
    const avant = dernier.get(w.clientId);
    if (!avant || w.quand > avant.quand) dernier.set(w.clientId, { sens: w.sens, quand: w.quand });
  }
  const out = new Set<string>();
  for (const [id, d] of dernier) {
    const t = Date.parse(d.quand);
    if (d.sens === 'entrant' && Number.isFinite(t) && maintenantMs - t < 48 * 3_600_000) out.add(id);
  }
  return out;
}

/** LA DERNIÈRE RELANCE DE FACTURE DE CHAQUE CLIENTE (AAAA-MM-JJ) : silence
    commercial sept jours autour. */
export function dernieresRelancesDeFacture(envois: readonly EnvoiCompte[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of envois) {
    if (e.type !== 'relance-facture' || PAS_PARTI.has(e.statut ?? '') || !e.clientId) continue;
    const j = jourACotonou(e.deposeLe ?? e.quand);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) continue;
    const avant = m.get(e.clientId);
    if (!avant || j > avant) m.set(e.clientId, j);
  }
  return m;
}
