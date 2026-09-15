import { supabase } from './supabase';
import { numeroWa, type PieceRecue } from './conversations';
import type { PieceRendue } from './pdf';

/* ══ ÉCRIRE SUR WHATSAPP DEPUIS N'IMPORTE QUEL ÉCRAN — 15 septembre 2026 ═

   Jusqu'ici seules les Conversations savaient parler : `partir` vivait dans
   l'écran. La Paie envoie désormais les bulletins, Temps & absences la
   décision d'un congé, les Engagements l'annonce d'un versement — trois
   écrans qui ne doivent pas recopier l'appel, ni le motif d'un refus.

   TOUT PASSE PAR LA FONCTION `whatsapp-envoi`, JAMAIS PAR LE NAVIGATEUR : le
   jeton Meta ne quitte pas le serveur. Et c'est la fonction qui écrit la
   ligne dans `messages_wa` : ce qu'un écran envoie paraît dans le fil, avec
   la trace de qui l'a envoyé. */

/** Le compartiment des pièces reçues (0102). */
export const COFFRE_WHATSAPP = 'whatsapp';

export type EnvoiWhatsApp = {
  numero: string;
  texte?: string;
  /** Un modèle approuvé, pour écrire hors fenêtre. */
  modele?: string;
  variables?: string[];
  /** Un modèle dont l'en-tête est un document (le bulletin) : la pièce
      voyage avec, c'est la seule façon qu'un fichier passe hors fenêtre. */
  enTete?: 'document';
  piece?: PieceRendue;
  /** Jusqu'à trois boutons de réponse : `id` est ce que le webhook lira,
      `titre` ce qu'elle verra (vingt signes au plus). */
  boutons?: { id: string; titre: string }[];
  clientId?: string;
  branchId?: string;
  parQui?: string;
  citeWaId?: string;
};

export type ResultatDEnvoi =
  | { ok: true; id: string; waId?: string; quand?: string }
  | { ok: false; erreur: string };

/** POURQUOI LA FONCTION A REFUSÉ, dans ses mots à elle.

    `supabase-js` emballe un refus dans une `FunctionsHttpError` dont le
    message est toujours identique ; la vraie phrase est dans le corps de la
    réponse, qu'il porte sous `context`. On va l'y chercher, et l'on retombe
    sur le message générique seulement si le corps est illisible — un refus
    sans motif est la panne la plus longue à nommer. */
export async function motifDuRefus(e: unknown): Promise<string> {
  const generique = (e as { message?: string })?.message ?? String(e);
  const rep = (e as { context?: Response })?.context;
  if (!rep || typeof rep.json !== 'function') return generique;
  try {
    const corps = await rep.json();
    const dit = (corps as { erreur?: string; error?: string })?.erreur
      ?? (corps as { error?: string })?.error;
    return dit ? String(dit) : generique;
  } catch {
    return generique;
  }
}

/** ENVOYER, ET DIRE CE QUI S'EST PASSÉ. Jamais une exception : un écran qui
    envoie sept bulletins d'affilée doit pouvoir continuer après un refus,
    et dire lequel a été refusé. */
export async function envoieSurWhatsApp(e: EnvoiWhatsApp): Promise<ResultatDEnvoi> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison : le message n’est pas parti.' };
  const numero = numeroWa(e.numero);
  if (!numero) return { ok: false, erreur: 'Ce numéro n’est pas lisible.' };
  const corps = {
    numero,
    texte: e.texte ?? '',
    modele: e.modele ?? '',
    variables: e.variables ?? [],
    ...(e.enTete ? { enTete: e.enTete } : {}),
    ...(e.piece ? { piece: e.piece } : {}),
    ...(e.boutons?.length ? { boutons: e.boutons } : {}),
    clientId: e.clientId,
    branchId: e.branchId,
    parQui: e.parQui,
    ...(e.citeWaId ? { citeWaId: e.citeWaId } : {}),
  };
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-envoi', { body: corps });
    if (error) throw error;
    const d = (data ?? {}) as { id?: string; waId?: string; quand?: string };
    return { ok: true, id: d.id ?? '', waId: d.waId, quand: d.quand };
  } catch (err) {
    return { ok: false, erreur: await motifDuRefus(err) };
  }
}

/** UNE ADRESSE SIGNÉE POUR UNE PIÈCE REÇUE, valable une heure. La base
    refuse de la donner à qui n'a pas le droit de lire (0102) : pour un fil
    réservé, c'est ce refus-là, et non l'écran, qui tient la porte. */
export async function adresseDeLaPieceRecue(p: PieceRecue): Promise<string | null> {
  if (!supabase || !p.chemin) return null;
  const { data, error } = await supabase.storage.from(p.coffre ?? COFFRE_WHATSAPP).createSignedUrl(p.chemin, 3600);
  if (error) { console.warn('[mnd-whatsapp] adresse refusée :', error.message); return null; }
  return data?.signedUrl ?? null;
}

/** LA PIÈCE REÇUE, RELUE EN FICHIER — pour la déposer ailleurs (un devis
    photographié qu'on range dans son dossier). `null` si la lecture échoue. */
export async function fichierDeLaPieceRecue(p: PieceRecue): Promise<File | null> {
  const url = await adresseDeLaPieceRecue(p);
  if (!url) return null;
  try {
    const rep = await fetch(url);
    if (!rep.ok) return null;
    const blob = await rep.blob();
    return new File([blob], p.nom, { type: p.type || blob.type });
  } catch {
    return null;
  }
}

/** « 3 novembre » — le jour d'une date ISO, tel qu'on l'écrit dans un
    message. Sans l'année : elle est rarement utile dans une phrase. */
export const jourDit = (iso: string | undefined): string => {
  const [a, m, j] = (iso ?? '').slice(0, 10).split('-').map(Number);
  if (!a || !m || !j) return iso ?? '';
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${j} ${MOIS[m - 1]}`;
};

/** « octobre 2026 » — un mois « AAAA-MM », tel qu'on le dit. */
export const moisDit = (periode: string): string => {
  const m = periode.match(/^(\d{4})-(\d{2})$/);
  if (!m) return periode;
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${MOIS[Number(m[2]) - 1]} ${m[1]}`;
};
