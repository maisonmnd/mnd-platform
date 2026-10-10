import { lienWaMe } from './conversations';

/* OUVRIR L'APPLICATION WHATSAPP AVEC LE PDF — 6 octobre 2026.
   « Permettre d'ouvrir WhatsApp app depuis ici » (Yéman, sur un document
   signé du secrétariat). L'envoi par la Maison (l'API) reste ; ceci est
   l'autre porte : SON application, son compte.

   UN LIEN wa.me NE PORTE QUE DU TEXTE, jamais un fichier. La feuille de
   partage du téléphone (et de Windows), elle, porte le PDF : on choisit
   WhatsApp, le document est déjà joint. Là où elle n'existe pas, le PDF se
   télécharge et WhatsApp s'ouvre sur le numéro, avec le message : il ne
   reste qu'à joindre le fichier.

   Ce qui part par l'application n'entre pas dans le fil de la Maison :
   WhatsApp ne raconte à personne ce qu'on y fait. */
export type PartageParLApp = 'partage' | 'telecharge-et-ouvre' | 'annule' | 'relance' | 'bloque';

export async function ouvreWhatsAppAvecLePdf(o: { fichier: File; texte: string; numero?: string }): Promise<PartageParLApp> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.canShare?.({ files: [o.fichier] })) {
    try {
      await nav.share({ files: [o.fichier], text: o.texte });
      return 'partage';
    } catch (e) {
      /* Un partage annulé n'est pas une panne : la main a changé d'avis. */
      if (e instanceof DOMException && e.name === 'AbortError') return 'annule';
      /* LE NAVIGATEUR VEUT UN TOUCHER TOUT FRAIS (Safari surtout) : préparer
         le PDF a pris une seconde de trop. Le fichier est prêt ; un second
         toucher partagera aussitôt. */
      if (e instanceof DOMException && e.name === 'NotAllowedError') return 'relance';
    }
  }
  const url = URL.createObjectURL(o.fichier);
  const a = document.createElement('a');
  a.href = url; a.download = o.fichier.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  const lien = lienWaMe(o.numero, o.texte) ?? `https://wa.me/?text=${encodeURIComponent(o.texte)}`;
  /* SANS 'noopener' DANS L'APPEL (10 octobre 2026, revue) : avec lui, la norme
     veut que `window.open` rende `null` même quand l'onglet s'ouvre, et
     l'écran annonçait toujours « le navigateur a bloqué ». On coupe le lien
     vers notre page à la main : même protection, et le vrai blocage se lit. */
  const w = window.open(lien, '_blank');
  if (w) { try { w.opener = null; } catch { /* rien : l'onglet est ouvert */ } }
  return w ? 'telecharge-et-ouvre' : 'bloque';
}

/** Ce que l'écran dit après le geste. */
export const ditLePartage = (r: PartageParLApp): string | null =>
  r === 'partage' || r === 'annule' ? null
    : r === 'relance' ? 'Le PDF est prêt : touchez encore « WhatsApp · l’app » pour l’envoyer.'
      : r === 'bloque' ? 'Le PDF est téléchargé. Le navigateur a bloqué l’ouverture de WhatsApp : ouvrez WhatsApp et joignez le fichier.'
        : 'Le PDF est téléchargé et WhatsApp s’ouvre : joignez le fichier avec le trombone.';
