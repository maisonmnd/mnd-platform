/* ══ LE REGARD DÉDUIT SOUS 30 JOURS — 10 octobre 2026 ═══════════════════
   La genèse des prix, correction 1 (décidée au sélecteur, délai de
   30 jours) : KÒKÒ™ Origine est déduit de la création qui le suit sous
   30 jours ; KÒKÒ™ Accueil, de la restauration ; KÒKÒ™ Conseil, de la
   création Kids. Le Regard devient un premier pas, pas un coût en plus.

   COMMENT : une remise en francs sur la ligne de l'acte, à hauteur de ce qui
   a été RÉGLÉ pour le Regard (rien de réglé, rien à déduire), plafonnée à son
   prix. Le Regard reste facturé à son jour ; l'acte, lui, se paie d'autant
   moins : le total de la Maison est juste, une fois. Les deux rendez-vous se
   marquent (`regardDeduit` sur l'acte, `deduitSur` sur le Regard) : un
   Regard ne se déduit qu'une fois.

   Pur : aucun magasin, aucun réseau. */

export const JOURS_DU_REGARD = 30;
export const REGARD_ORIGINE = 'sv-koko-ori';
export const REGARD_ACCUEIL = 'sv-koko-sui';
export const REGARD_CONSEIL = 'svc-doto-conseil';
export const CREATION_KIDS = 'sv-kids-vekpe';
/** Les restaurations qui reçoivent KÒKÒ™ Accueil. */
export const RESTAURATIONS: readonly string[] = ['sv-atl-iv-gbe-c', 'sv-atl-iv-gbp-c', 'sv-atl-iv-ala-c'];

type Rdv = { id: string; clientId?: string; date: string; status: string; serviceIds: readonly string[]; deduitSur?: string };

export type RegardADeduire = { kokoId: string; regardServiceId: string; date: string; index: number; xof: number };

const jours = (de: string, a: string): number =>
  Math.round((Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

/** LE REGARD À DÉDUIRE de ce rendez-vous, ou `null`. */
export function regardADeduire(o: {
  rdv: { id?: string; clientId?: string; date: string; serviceIds: readonly string[] };
  rdvs: readonly Rdv[];
  estCreation: (serviceId: string) => boolean;
  payeXof: (a: Rdv) => number;
  prixDuRegard: (serviceId: string) => number;
}): RegardADeduire | null {
  const { rdv } = o;
  if (!rdv.clientId || !rdv.date) return null;
  let index = -1;
  let regard = '';
  rdv.serviceIds.some((id, i) => {
    if (id === CREATION_KIDS) { index = i; regard = REGARD_CONSEIL; return true; }
    if (RESTAURATIONS.includes(id)) { index = i; regard = REGARD_ACCUEIL; return true; }
    if (o.estCreation(id)) { index = i; regard = REGARD_ORIGINE; return true; }
    return false;
  });
  if (index < 0) return null;
  const candidats = o.rdvs
    .filter((a) => a.clientId === rdv.clientId && a.id !== rdv.id && a.status === 'honoré'
      && a.serviceIds.includes(regard) && a.date.slice(0, 10) <= rdv.date.slice(0, 10)
      && jours(a.date, rdv.date) <= JOURS_DU_REGARD && (!a.deduitSur || a.deduitSur === rdv.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const a of candidats) {
    const xof = Math.min(Math.max(0, o.payeXof(a)), Math.max(0, o.prixDuRegard(regard)));
    if (xof > 0) return { kokoId: a.id, regardServiceId: regard, date: a.date.slice(0, 10), index, xof };
  }
  return null;
}

/** La remise de ligne, une fois le Regard déduit : les francs s'ajoutent à
    ceux qui y étaient. */
export const remiseAvecLeRegard = (
  remise: { pct?: number; xof?: number } | null | undefined, xof: number,
): { pct?: number; xof: number } => ({ ...(remise?.pct ? { pct: remise.pct } : {}), xof: (remise?.xof ?? 0) + xof });
