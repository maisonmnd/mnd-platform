/* ══ LE DÉPÔT D'UNE CONSULTATION, GARDÉ PAR LE SERVEUR — 17 novembre 2026 ═════
   « La consultation en affiches », lot 2 : « Il ne faut pas permettre d'avoir
   des bilans sans prendre de RDV » (Yéman). Le bilan (lecture, prix, devis)
   se remet au rendez-vous, par la Maison : le dépôt d'une consultation ne
   porte donc que ce qu'elle a dit.

   CE QUE LE SERVEUR GARDE D'UN DÉPÔT PUBLIC : ce qu'elle a DIT (qui elle est,
   ses réponses, ses envies, ses besoins, sa couronne, le moment voulu). CE
   QU'IL NE GARDE JAMAIS : ce que la Maison calcule (prestations proposées,
   fourchettes, estimation, points, palier, diagnostic), ni ce que le serveur
   seul écrit (l'identifiant, la date, l'état, le règlement, la visio, le
   rendez-vous). La lecture se refait au Trône, sur son catalogue
   (`lecture-de-la-maison-pur`), et ne repart vers elle qu'au rendez-vous tenu.

   L'IDENTIFIANT EST FAIT PAR LE SERVEUR, et un dépôt s'INSÈRE : il ne peut
   pas écraser une consultation déjà là. Seule une session de l'équipe (le
   tunnel de la Maison, qui règle avant de déposer) garde l'identifiant
   qu'elle présente, et ses champs de diagnostic.

   Le bloc entre les repères est recopié tel quel dans `push-notify` (une
   fonction Edge n'importe rien) ; `verifie-les-douze-lunes` (R8) compare les
   deux copies, `verifie-le-bilan-sous-cle` éprouve la règle. MODULE PUR. */

/* ⟨depot-de-la-consultation⟩ */
/** Ce que le serveur seul écrit sur une consultation : jamais lu dans un dépôt. */
export const CLES_DU_SERVEUR: readonly string[] = [
  'id', 'createdAt', 'status', 'paidXof', 'transactionId', 'payeLe', 'reglement',
  'visio', 'rdvId', 'rdv', 'momentFixe', 'momentVoulu', 'momentRefuse', 'temoins', 'devisId',
];
/** Ce que la Maison calcule : retiré d'un dépôt public à toute profondeur. */
export const CLES_DE_LA_MAISON: readonly string[] = [
  'estimation', 'fourchette', 'fourchettes', 'lecture', 'diagnostic', 'bilan', 'resume', 'devis', 'suite',
  'points', 'palier', 'paliers', 'score', 'scores', 'prix', 'prixXof', 'priceXof', 'priceToXof', 'estimationXof',
  'valeurPrestationXof', 'prescription', 'aChiffrer', 'aConfirmer',
];
/** La taille d'un dépôt, en caractères de JSON. */
export const DEPOT_AU_PLUS = 20_000;
export const FORME_DE_L_ID_DE_CONSULTATION = /^[A-Za-z0-9_-]{1,80}$/;

/** Un identifiant de consultation, fait par le serveur : `cg-` et vingt signes tirés au sort. */
export function idDeConsultation(hasard: (n: number) => Uint8Array): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return `cg-${[...hasard(20)].map((b) => alphabet[b % alphabet.length]).join('')}`;
}

/** Une valeur du dépôt, sans ce que la Maison calcule, à toute profondeur. */
function sansLesCalculs(v: unknown, profondeur = 0): unknown {
  if (profondeur > 8) return undefined;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => sansLesCalculs(x, profondeur + 1)).filter((x) => x !== undefined);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (CLES_DE_LA_MAISON.includes(k)) continue;
      const propre = sansLesCalculs(x, profondeur + 1);
      if (propre !== undefined) o[k] = propre;
    }
    return o;
  }
  if (typeof v === 'string') return v.slice(0, 2000);
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean' || v === null) return v;
  return undefined;
}

export type DepotPropre =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; erreur: 'bad request' | 'too large' | 'incomplet' };

/** LE DÉPÔT, RENDU PROPRE. `parLEquipe` : une session du personnel (le tunnel
    de la Maison) garde ses champs de diagnostic ; ce que le serveur écrit
    lui-même est retiré pour tous. Ce qui en sort n'a ni identifiant, ni date,
    ni état, ni règlement : l'appelant les pose. */
export function depotPropre(brut: unknown, o: { parLEquipe: boolean }): DepotPropre {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { ok: false, erreur: 'bad request' };
  let taille = 0;
  try { taille = JSON.stringify(brut).length; } catch { return { ok: false, erreur: 'bad request' }; }
  if (taille > DEPOT_AU_PLUS) return { ok: false, erreur: 'too large' };
  const source = brut as Record<string, unknown>;
  const sansServeur: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) if (!CLES_DU_SERVEUR.includes(k)) sansServeur[k] = v;
  const data = (o.parLEquipe ? sansServeur : sansLesCalculs(sansServeur)) as Record<string, unknown>;

  /* Qui elle est : un numéro au moins, sinon la Maison ne peut rien lui remettre. */
  const c = (data.client && typeof data.client === 'object' ? data.client : {}) as Record<string, unknown>;
  const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const phone = texte(c.phone, 30);
  if (phone.replace(/\D/g, '').length < 8) return { ok: false, erreur: 'incomplet' };
  data.client = { name: texte(c.name, 80), phone, city: texte(c.city, 80), currency: texte(c.currency, 8) || 'XOF' };

  if (!o.parLEquipe) {
    data.parcours = data.parcours === 'creation' ? 'creation' : 'sos';
    data.modalite = 'auto';
  }
  if (typeof data.branchId !== 'string' || !FORME_DE_L_ID_DE_CONSULTATION.test(data.branchId)) delete data.branchId;

  /* Le moment voulu pour la consultation privée (`moment: { jour, heure }`) : gardé comme un vœu, posé au Carnet au paiement. */
  const m = (source.moment && typeof source.moment === 'object' ? source.moment : {}) as Record<string, unknown>;
  delete data.moment;
  if (typeof m.jour === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.jour) && typeof m.heure === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(m.heure)) {
    data.momentVoulu = { jour: m.jour, heure: m.heure };
  }
  return { ok: true, data };
}

/** Ce que l'équipe lit sur son téléphone à un dépôt public : écrit par le serveur, jamais par le navigateur. */
export function annonceDuDepot(data: Record<string, unknown>): { title: string; body: string } {
  const client = (data.client ?? {}) as { name?: string };
  const prenom = String(client.name ?? '').trim().split(/\s+/)[0] ?? '';
  const n = Array.isArray(data.besoins) ? data.besoins.length : 0;
  return {
    title: `Consultation en ligne${prenom ? ` · ${prenom}` : ''}`,
    body: n > 0 ? `${n} besoin${n > 1 ? 's' : ''} · à relire au Trône` : 'À relire au Trône',
  };
}
/* ⟨/depot-de-la-consultation⟩ */
