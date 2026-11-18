/* ══ OPALE ÉCOUTE LES VOCAUX · 18 novembre 2026 ═══════════════════════════
   « M. Candide a laissé un audio. Opale doit être en mesure d'écouter, de
   comprendre les audios et de répondre directement » (Yéman, sur une
   capture des Conversations : Opale lui demandait d'écrire son vocal). Puis
   « j'ai aussi une bulle vocale que j'utilise sur toutes mes applis : tu
   peux utiliser l'audio de VoxBubble ».

   CLAUDE N'ENTEND PAS UN SON : son API lit le texte, les images et les PDF,
   pas l'audio. Les oreilles sont celles de VoxBubble : Whisper large-v3-turbo
   chez Groq. La réception (`whatsapp-webhook`) télécharge le vocal chez Meta,
   le range dans le coffre comme avant, l'envoie au moteur, et écrit sur le
   message ce qui en revient ; Opale lit cette transcription comme un message
   écrit et répond. Le Trône l'affiche sous le vocal.

   TRANCHÉ AU SÉLECTEUR, le même jour :
     · une clé Groq À PART pour la Maison (`GROQ_API_KEY`), pas celle de
       VoxBubble : les coûts restent séparés ;
     · un vocal que la Maison n'a pas compris (le fon, le bruit, un vocal
       vide, un moteur injoignable) : Opale PASSE LA MAIN SANS RIEN DIRE ; une
       personne l'écoute et répond.

   COMPRIS veut dire : du français ou de l'anglais, des mots, pas les
   phrases que Whisper écrit sur du silence (des sous-titres appris), pas un
   segment que le moteur juge sans parole. Tout le reste est « pas compris »
   et le dit (son motif), sans texte qu'Opale pourrait croire.

   Le bloc entre les repères est RECOPIÉ tel quel dans
   `supabase/functions/whatsapp-webhook` (une fonction Edge ne lit rien du
   dépôt) ; le banc des douze lunes (R8) confronte les deux, et
   `verifie-l-ecoute-des-vocaux` éprouve la règle. On corrige ici, puis on
   recopie le bloc entier. */

/* ⟨ecoute-du-vocal⟩ */
/** Le moteur de VoxBubble : Whisper large-v3-turbo, chez Groq. */
export const MOTEUR_DU_VOCAL = 'whisper-large-v3-turbo';
export const ADRESSE_DU_MOTEUR = 'https://api.groq.com/openai/v1/audio/transcriptions';
/** Au-delà, le vocal ne part pas au moteur (25 Mo chez Groq ; un vocal
    WhatsApp d'une minute pèse une centaine de kilo-octets). */
export const OCTETS_D_UN_VOCAL_AU_PLUS = 20 * 1024 * 1024;
/** Le temps laissé au moteur : la réception l'attend avant de ranger le message. */
export const ATTENTE_DU_MOTEUR_MS = 25_000;
/** Les mots de la Maison, soufflés au moteur pour qu'il les écrive juste. */
export const MOTS_SOUFFLES = 'Maison MND, Ma Couronne, locks, resserrage, reprise, rituel, consultation, rendez-vous, Cotonou, Perle, Opale.';
/** Au-delà de ce taux moyen de « pas de parole », le moteur n'a rien entendu de net. */
export const SANS_PAROLE_AU_PLUS = 0.6;
/** Ce qu'Opale lit au plus d'une transcription. */
export const SIGNES_D_UNE_TRANSCRIPTION_AU_PLUS = 2000;

/** Les langues qu'Opale comprend : le français et l'anglais. Le fon, le
    yoruba, le mina, le goun : une personne de la Maison écoute. */
const LANGUES_COMPRISES: Readonly<Record<string, 'fr' | 'en'>> = {
  fr: 'fr', fra: 'fr', french: 'fr', francais: 'fr', 'français': 'fr',
  en: 'en', eng: 'en', english: 'en', anglais: 'en',
};
/** Ce que Whisper écrit sur du silence ou du bruit : des sous-titres appris. */
const PHRASES_DU_SILENCE: readonly RegExp[] = [
  /sous-titr/i, /amara\.org/i, /merci d['’]avoir regard/i, /abonnez-vous/i, /thank you for watching/i, /subtitles? by/i, /transcribed by/i,
];

export type MotifDuVocalPasCompris = 'langue' | 'vide' | 'bruit' | 'illisible' | 'trop-lourd' | 'moteur';

/** Ce que la réception écrit sur le message (`messages_wa.data.transcription`). */
export type TranscriptionDuVocal = {
  compris: boolean;
  /** Le texte, vide quand le vocal n'est pas compris : rien de faux à lire. */
  texte: string;
  /** « fr » ou « en » quand il est compris ; sinon la langue que le moteur a cru entendre. */
  langue?: string;
  motif?: MotifDuVocalPasCompris;
  moteur: string;
  le: string;
};

/** Un vocal que la Maison n'a pas compris, et pourquoi. */
export const vocalPasCompris = (motif: MotifDuVocalPasCompris, le: string, langue?: string): TranscriptionDuVocal => ({
  compris: false, texte: '', motif, moteur: MOTEUR_DU_VOCAL, le, ...(langue ? { langue } : {}),
});

/** Le nom que le moteur reçoit : il juge le format à l'extension. Un vocal
    WhatsApp est de l'ogg (opus), parfois sans extension dans son nom. */
export function nomPourLeMoteur(nom: string, type: string): string {
  const n = String(nom ?? '').trim();
  if (/\.(ogg|oga|mp3|m4a|mp4|mpeg|mpga|wav|webm|flac)$/i.test(n)) return n;
  const t = String(type ?? '').toLowerCase().split(';')[0].trim();
  const ext = t === 'audio/mpeg' ? 'mp3' : t === 'audio/mp4' || t === 'audio/aac' ? 'm4a' : t === 'audio/wav' || t === 'audio/x-wav' ? 'wav' : t === 'audio/webm' ? 'webm' : 'ogg';
  return `${n || 'vocal'}.${ext}`;
}

/** LA RÉPONSE DU MOTEUR, JUGÉE (`response_format: verbose_json`) : sa
    langue, son texte, ses segments. Compris seulement en français ou en
    anglais, avec des mots, et pas sur du silence. */
export function lisLaTranscription(reponse: unknown, le: string): TranscriptionDuVocal {
  if (!reponse || typeof reponse !== 'object') return vocalPasCompris('illisible', le);
  const r = reponse as { text?: unknown; language?: unknown; segments?: unknown };
  const texte = String(r.text ?? '').replace(/\s+/g, ' ').trim();
  const langueBrute = String(r.language ?? '').toLowerCase().trim();
  const langue = LANGUES_COMPRISES[langueBrute];
  if (texte.replace(/[\s.,;:!?'’"«»…-]+/g, '').length < 2) return vocalPasCompris('vide', le, langue ?? (langueBrute || undefined));
  if (!langue) return vocalPasCompris('langue', le, langueBrute || undefined);
  const segments = Array.isArray(r.segments) ? r.segments as { no_speech_prob?: unknown }[] : [];
  const sansParole = segments.map((s) => Number(s?.no_speech_prob)).filter((x) => Number.isFinite(x));
  if (sansParole.length > 0 && sansParole.reduce((a, b) => a + b, 0) / sansParole.length > SANS_PAROLE_AU_PLUS) return vocalPasCompris('bruit', le, langue);
  if (texte.length <= 160 && PHRASES_DU_SILENCE.some((p) => p.test(texte))) return vocalPasCompris('bruit', le, langue);
  return { compris: true, texte: texte.slice(0, SIGNES_D_UNE_TRANSCRIPTION_AU_PLUS), langue, moteur: MOTEUR_DU_VOCAL, le };
}

/** Ce qu'un message porte de sa transcription, lu d'une ligne de la base :
    le texte compris, ou rien (pas de transcription, ou pas compris). */
export function texteDuVocal(transcription: unknown): string {
  if (!transcription || typeof transcription !== 'object') return '';
  const t = transcription as { compris?: unknown; texte?: unknown };
  return t.compris === true && typeof t.texte === 'string' ? t.texte.trim().slice(0, SIGNES_D_UNE_TRANSCRIPTION_AU_PLUS) : '';
}
/* ⟨/ecoute-du-vocal⟩ */

/** Le motif dit au Trône, sous un vocal qu'Opale a laissé à une personne. */
export const MOTIF_DU_VOCAL_DIT: Readonly<Record<MotifDuVocalPasCompris, string>> = {
  langue: 'une langue qu’Opale ne comprend pas (fon, yoruba…)',
  vide: 'aucun mot entendu',
  bruit: 'trop de bruit, rien de net',
  illisible: 'la réponse du moteur était illisible',
  'trop-lourd': 'un vocal trop long pour être transcrit',
  moteur: 'le moteur de transcription n’a pas répondu',
};
