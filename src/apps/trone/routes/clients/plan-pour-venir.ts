/* LE PLAN POUR VENIR, EN FICHIER — 19 novembre 2026.

   « At all time this map needs to be attached to the message when we send the
   link to the clients » (Yéman). L'image est celle que le Trône sert lui-même
   (`public/assets/itineraire/`), la même qu'Opale et le geste « Itinéraire »
   envoient : un envoi programmé la garde comme un fichier joint, l'écran des
   QR codes la confie au partage du téléphone ou au presse-papiers. */

export const CHEMIN_DU_PLAN = 'assets/itineraire/plan-depuis-super-u.png';
export const NOM_DU_PLAN = 'plan-pour-venir-maison-mnd.png';

/** Le plan, en fichier PNG ; `null` quand il ne se lit pas (hors ligne). */
export async function leFichierDuPlan(): Promise<File | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}${CHEMIN_DU_PLAN}`);
    if (!r.ok) return null;
    const b = await r.blob();
    return new File([b], NOM_DU_PLAN, { type: 'image/png' });
  } catch {
    return null;
  }
}

/** LE PLAN ET SON MOT, PAR LE PARTAGE DE L'APPAREIL (le téléphone, ou
    Windows) : WhatsApp reçoit l'image et le texte ensemble. Sinon, le plan
    part dans le presse-papiers et WhatsApp s'ouvre sur le mot : il reste à
    coller l'image (Ctrl+V). Rend ce qui s'est fait, pour que l'écran le dise. */
export async function partageLePlan(message: string, lienWhatsApp: string | null): Promise<'partage' | 'annule' | 'copie' | 'sans-plan' | 'sans-numero'> {
  const plan = await leFichierDuPlan();
  if (plan && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [plan], text: message })) {
    try {
      await navigator.share({ files: [plan], text: message });
      return 'partage';
    } catch {
      /* Un partage annulé n'est pas une erreur : la main a changé d'avis. */
      return 'annule';
    }
  }
  /* Sans partage et sans numéro, le mot se copie (l'écran le fait) : le
     presse-papiers ne garde qu'une chose à la fois. */
  if (!lienWhatsApp) return 'sans-numero';
  let copie = false;
  if (plan && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': plan })]);
      copie = true;
    } catch {
      copie = false;
    }
  }
  if (lienWhatsApp) {
    const w = window.open(lienWhatsApp, '_blank');
    if (w) { try { w.opener = null; } catch { /* l'onglet est ouvert */ } }
  }
  return copie ? 'copie' : 'sans-plan';
}
