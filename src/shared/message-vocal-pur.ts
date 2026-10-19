/* ══ LE MESSAGE VOCAL DU SITE — 19 octobre 2026 ═════════════════════════
   « Je veux construire ce système sur le site maisonmnd.com » (Yéman, devant
   la fenêtre « Leave a voice message » de FedaPay), puis « construis » sur la
   maquette HR7V2tMu… ; ses choix lus en base (maquette/vocal) :
     · le bouton sur la page Contact et dans « Être rappelée » ;
     · deux minutes au plus ;
     · l'accusé WhatsApp habituel d'une demande de rappel ;
     · on écoute (aucune transcription : Claude n'écoute pas un son) ;
     · la voix gardée 90 jours, puis effacée seule ; la demande reste.

   La visiteuse s'enregistre dans son navigateur ; la voix part à
   `demande-submit` (multipart), qui la range dans un coffre privé et pose
   une demande « Message vocal » dans Les demandes du Trône.

   Tout ce qui se décide sans écran ni serveur vit ici. Le bloc entre les
   repères est RECOPIÉ tel quel dans `supabase/functions/demande-submit`
   (une fonction Edge ne lit rien du dépôt) ; `verifie-le-message-vocal`
   confronte les deux. On corrige ici, puis on recopie le bloc entier. */

/* ⟨message-vocal⟩ */
/** Deux minutes au plus (sa décision). L'enregistreur s'arrête seul. */
export const DUREE_MAX_DE_LA_VOIX_S = 120;
/** Ce qu'un message de deux minutes ne dépasse jamais, même enregistré sans
    compression par un vieux téléphone : au-delà, c'est autre chose. */
export const OCTETS_MAX_DE_LA_VOIX = 3_500_000;
/** En dessous, c'est un clic par erreur, pas un message. */
export const OCTETS_MIN_DE_LA_VOIX = 1_000;
/** 90 jours (sa décision), puis la voix s'efface ; la demande reste. */
export const GARDE_DES_VOIX_JOURS = 90;
export const COFFRE_DES_VOIX = 'voix-du-site';
export const PROFIL_DU_VOCAL = 'Message vocal';

/** Le format reçu, ramené à ce que le coffre accepte, et son extension.
    `null` : ce n'est pas un son qu'on sait garder. Chrome et Android
    enregistrent en webm (parfois dit « video/webm »), Safari et l'iPhone en
    mp4 (AAC). */
export function formatDeLaVoix(type: string): { mime: string; ext: string } | null {
  const t = String(type ?? '').toLowerCase().split(';')[0].trim();
  if (t === 'audio/webm' || t === 'video/webm') return { mime: 'audio/webm', ext: 'webm' };
  if (t === 'audio/ogg') return { mime: 'audio/ogg', ext: 'ogg' };
  if (t === 'audio/mp4' || t === 'audio/aac' || t === 'audio/x-m4a' || t === 'audio/m4a' || t === 'video/mp4') return { mime: 'audio/mp4', ext: 'm4a' };
  if (t === 'audio/mpeg' || t === 'audio/mp3') return { mime: 'audio/mpeg', ext: 'mp3' };
  if (t === 'audio/wav' || t === 'audio/x-wav' || t === 'audio/wave') return { mime: 'audio/wav', ext: 'wav' };
  return null;
}

/** Où la voix vit dans le coffre : la branche, puis la demande. */
export const cheminDeLaVoix = (branchId: string, demandeId: string, ext: string): string =>
  `${branchId}/${demandeId}.${ext}`;

/** La durée annoncée par le navigateur, bornée : jamais crue au-delà du plafond. */
export const dureeBornee = (s: unknown): number =>
  Math.max(0, Math.min(DUREE_MAX_DE_LA_VOIX_S + 5, Math.round(Number(s) || 0)));

/** « 0:42 ». */
export const dureeDite = (s: number): string => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

/** L'instant avant lequel une voix doit être effacée. */
export const limiteDeGarde = (maintenantMs: number): number => maintenantMs - GARDE_DES_VOIX_JOURS * 86_400_000;

/** Les voix à effacer : déposées avant la limite, pas encore effacées. */
export function voixAEffacer<T extends { id: string; createdAt?: string; voix?: { chemin?: string; effaceeLe?: string } }>(
  demandes: readonly T[], maintenantMs: number,
): T[] {
  const limite = limiteDeGarde(maintenantMs);
  return demandes.filter((d) => !!d.voix?.chemin && !d.voix.effaceeLe
    && Number.isFinite(Date.parse(d.createdAt ?? '')) && Date.parse(d.createdAt!) < limite);
}
/* ⟨/message-vocal⟩ */

/** LE FORMAT D'ENREGISTREMENT que ce navigateur sait faire, dans l'ordre :
    opus en webm (Chrome, Android, Firefox), mp4 (Safari, iPhone), ogg. Vide :
    le navigateur choisit, et le serveur dira s'il sait le garder. */
export function formatDEnregistrement(sait: (type: string) => boolean): string {
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']) {
    try { if (sait(t)) return t; } catch { /* navigateur qui ne répond pas */ }
  }
  return '';
}

/** Après l'envoi : quand la Maison rappelle. Ouverte : dans la journée ;
    fermée ou heures inconnues : dès l'ouverture. */
export const quandOnRappelle = (ouvert: boolean | null | undefined): string =>
  ouvert ? 'dans la journée' : 'dès l’ouverture';
