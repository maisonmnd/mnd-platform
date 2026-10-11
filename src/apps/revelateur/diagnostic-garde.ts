/* ══ LE DIAGNOSTIC SUIT JUSQU'À LA RÉSERVATION — 11 octobre 2026 ═════════
   La visiteuse répondait à cinq questions, recevait sa porte et sa routine,
   touchait « Réserver ce parcours »… et le calendrier ne savait rien d'elle.
   La Maison découvrait sa situation au fauteuil.

   Désormais le diagnostic laisse un résumé court dans la session du
   navigateur (jamais au-delà : rien ne part sans qu'elle réserve), et la
   réservation le pose dans « Un mot », à la vue de la visiteuse, qui peut le
   retirer d'un geste. Il n'accompagne que la porte que le diagnostic a
   donnée, et seulement quelques heures. */

export type DiagnosticGarde = { besoin: string; resume: string; le: number };

const CLE = 'mnd_site_diagnostic';
/** Trois heures : le temps d'hésiter, pas celui d'oublier d'où l'on vient. */
export const DUREE_DU_DIAGNOSTIC_MS = 3 * 3600_000;

export function gardeLeDiagnostic(besoin: string, resume: string, maintenant: number = Date.now()): void {
  try { sessionStorage.setItem(CLE, JSON.stringify({ besoin, resume, le: maintenant })); } catch { /* sans stockage, rien ne suit */ }
}

/** Le diagnostic gardé pour cette porte, ou `null` (absent, ancien, autre porte, illisible). */
export function diagnosticGarde(besoin: string | undefined, maintenant: number = Date.now()): DiagnosticGarde | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(CLE) ?? 'null') as Partial<DiagnosticGarde> | null;
    if (!d || typeof d.resume !== 'string' || !d.resume.trim() || typeof d.le !== 'number') return null;
    if (maintenant - d.le > DUREE_DU_DIAGNOSTIC_MS || d.le > maintenant + 60_000) return null;
    if (!besoin || d.besoin !== besoin) return null;
    return { besoin: d.besoin, resume: d.resume, le: d.le };
  } catch {
    return null;
  }
}

export function oublieLeDiagnostic(): void {
  try { sessionStorage.removeItem(CLE); } catch { /* rien */ }
}
