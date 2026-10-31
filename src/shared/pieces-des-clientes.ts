import { supabase } from './supabase';
import type { PieceEnvoyee } from './avant-le-fauteuil-pur';

/* ══ LE COFFRE DES PIÈCES DES CLIENTES · 31 octobre 2026 ═════════════════
   « Avant le fauteuil », choix 5, tranché au sélecteur : une photo ou une
   vidéo qu'une cliente envoie pour sa séance (le modèle de coiffure, la
   boîte de sa teinte) est enregistrée ici et attachée à son rendez-vous ;
   un lien Facebook, TikTok ou Instagram est gardé comme lien, avec son
   titre, et la vidéo du lien n'est jamais copiée.

   UN DOSSIER PAR TÊTE, UN SOUS-DOSSIER PAR RENDEZ-VOUS :
     `<clientId>/<apptId>/<id>.<ext>`
   Un rendez-vous pas encore enregistré range sous `nouveau-<id>` : la pièce
   doit exister avant que la fenêtre se ferme, et le rendez-vous n'a pas
   encore de numéro. Jamais d'écrasement (`upsert: false`) : deux pièces du
   même nom sont deux pièces.

   AUCUNE ADRESSE PUBLIQUE, JAMAIS. Un lien signé vaut une heure et se
   redemande à chaque lecture, comme au coffre des certificats. Hors ligne,
   le coffre dit « hors-ligne » et la fenêtre le dit à son tour ; rien ne se
   fait passer pour déposé. Le type `PieceEnvoyee` vit dans le juge pur
   (`avant-le-fauteuil-pur.ts`), qui n'importe rien d'ici. */
export const COFFRE_PIECES = 'pieces-des-clientes';

/** Au-delà, le téléphone de la Maison n'en ferait rien : on refuse en clair. */
export const PIECE_MAX_OCTETS = 60 * 1024 * 1024;

export type SortDuDepot = 'ok' | 'hors-ligne' | 'refuse' | 'trop-lourd';

/* ── LES PETITES MAINS, PURES ────────────────────────────────────────── */
/** « Photo », « Vidéo », « Lien ». */
export const nomDuGenre = (kind: PieceEnvoyee['kind']): string =>
  kind === 'photo' ? 'photo' : kind === 'video' ? 'vidéo' : 'lien';

/** D'où la pièce vient, à voix haute. */
export const origineDite = (origine: PieceEnvoyee['origine']): string =>
  origine === 'whatsapp' ? 'WhatsApp' : origine === 'conversations' ? 'Conversations' : 'posée à la main';

/** L'adresse telle qu'on la garde : `https://` devant si rien ne l'annonce,
    vide si ce n'est pas une adresse. */
export const adresseNette = (brut: string): string => {
  const t = brut.trim();
  if (!t) return '';
  const avec = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(avec);
    return u.hostname.includes('.') ? u.toString() : '';
  } catch {
    return '';
  }
};

/** LE TITRE PAR DÉFAUT D'UN LIEN : son domaine, sans « www. » (« facebook.com »). */
export const titreDuLien = (url: string): string => {
  const net = adresseNette(url);
  if (!net) return '';
  try {
    return new URL(net).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
};

/** « photo-de-la-teinte.JPG » → « jpg » ; sans extension lisible, « bin ». */
export const extensionDe = (nom: string): string => {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nom.trim());
  return m ? m[1].toLowerCase() : 'bin';
};

/* ── CE QUE LE COFFRE ACCEPTE (0147, relecture du 31 octobre 2026) ──────
   Le compartiment refuse tout autre type à sa porte. On juge donc ICI, avec
   la même liste, pour dire en clair « ce fichier ne se garde pas » plutôt
   qu'un « réessayez » qui ne servirait à rien. Un GIF, un WebM ne passent
   pas : la Maison reçoit des photos de téléphone et des vidéos WhatsApp. */
const TYPE_PAR_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime',
};
const TYPES_DU_COFFRE = new Set(Object.values(TYPE_PAR_EXTENSION));

/** Le type MIME que le coffre attend pour cette extension ; vide s'il ne la prend pas. */
export const typeMimeDe = (ext: string): string => TYPE_PAR_EXTENSION[ext.toLowerCase()] ?? '';

/** LE TYPE À ANNONCER AU COFFRE : celui du fichier s'il est de la liste
    (« image/jpg », que certains systèmes disent, redevient « image/jpeg »),
    sinon celui que son extension dit. Vide : le coffre le refuserait. */
export const typeDuFichier = (type: string, nom: string): string => {
  const t = (type || '').toLowerCase().replace(/^image\/jpg$/, 'image/jpeg');
  if (TYPES_DU_COFFRE.has(t)) return t;
  return typeMimeDe(extensionDe(nom));
};

/** Le genre d'un fichier choisi : une photo, une vidéo, ou rien que le coffre accepte. */
export const genreDuFichier = (type: string, nom: string): 'photo' | 'video' | null => {
  const t = typeDuFichier(type, nom);
  if (t.startsWith('image/')) return 'photo';
  if (t.startsWith('video/')) return 'video';
  return null;
};

/** Le nom du fichier sans son extension, pour servir de titre. */
export const titreDuFichier = (nom: string): string => {
  const t = nom.trim().replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_-]+/g, ' ').trim();
  return t || 'Pièce envoyée';
};

const segmentPropre = (s: string): string => s.trim().replace(/[^A-Za-z0-9_-]/g, '') || 'x';

/** `<clientId>/<apptId>/<id>.<ext>`. */
export const cheminDeLaPiece = (clientId: string, apptId: string, id: string, ext: string): string =>
  `${segmentPropre(clientId)}/${segmentPropre(apptId)}/${segmentPropre(id)}.${segmentPropre(ext)}`;

/* ── LE COFFRE ───────────────────────────────────────────────────────── */
/** DÉPOSER UNE PIÈCE. Jamais une exception : la fenêtre du rendez-vous dit
    le résultat et n'attache la pièce que sur « ok ». */
export async function deposeLaPiece(chemin: string, fichier: Blob & { type?: string; size?: number; name?: string }): Promise<SortDuDepot> {
  if (!supabase) return 'hors-ligne';
  /* Sans réseau, le coffre ne répondrait que par une erreur muette : on le
     dit avant d'essayer, comme `appels-en-attente`. */
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'hors-ligne';
  if ((fichier.size ?? 0) > PIECE_MAX_OCTETS) return 'trop-lourd';
  /* LE TYPE VOYAGE DANS LE BLOB, PAS DANS L'OPTION (relecture du 31 octobre
     2026). Pour un Blob ou un File, storage-js envoie le fichier en multipart
     et IGNORE `contentType` : le coffre lit le type du Blob lui-même. Un HEIC
     d'iPhone passé par Windows arrive souvent avec un type vide ; le
     navigateur dirait alors « application/octet-stream », que le coffre
     refuse (0147). On redonne donc au fichier le type que son extension dit. */
  const type = typeDuFichier(fichier.type ?? '', fichier.name ?? chemin);
  if (!type) return 'refuse';
  const corps = fichier.type === type ? fichier : new Blob([fichier], { type });
  const { error } = await supabase.storage.from(COFFRE_PIECES).upload(chemin, corps, {
    contentType: type,
    upsert: false,
  });
  if (error) { console.warn('[mnd-pieces] dépôt refusé :', error.message); return 'refuse'; }
  return 'ok';
}

/** UNE ADRESSE SIGNÉE, valable une heure, pour regarder la pièce. */
export async function adresseDeLaPiece(chemin: string): Promise<string | null> {
  if (!supabase || !chemin) return null;
  const { data, error } = await supabase.storage.from(COFFRE_PIECES).createSignedUrl(chemin, 3600);
  if (error) { console.warn('[mnd-pieces] adresse refusée :', error.message); return null; }
  return data?.signedUrl ?? null;
}
