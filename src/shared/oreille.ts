/* L'OREILLE DU TÉLÉPHONE — 5 novembre 2026. La même que celle de la Dictée
   MND (routes/equipe/Dictee.tsx) : Web Speech, en français, celle du micro
   du clavier. Rien n'est gardé : ni la voix, ni le texte. Le bouton
   « Dicter » de « Enregistrer une dépense, en une phrase » s'en sert pour
   écrire la phrase ; il n'appelle pas Claude (la phrase se lit sans IA). */

export type ResultatDOreille = { isFinal: boolean; 0: { transcript: string } };
export type Oreille = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ResultatDOreille> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

/** Web Speech n'est pas dans lib.dom partout ; Safari le préfixe encore. */
export const fabriqueDOreille = (): (new () => Oreille) | null => {
  const w = globalThis as unknown as { SpeechRecognition?: new () => Oreille; webkitSpeechRecognition?: new () => Oreille };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const DIT_L_ERREUR_DE_L_OREILLE: Record<string, string> = {
  'not-allowed': 'Le micro est refusé : autorisez-le pour le Trône dans les réglages du navigateur.',
  'service-not-allowed': 'La reconnaissance vocale est fermée sur cet appareil.',
  'audio-capture': 'Aucun micro trouvé sur cet appareil.',
  network: 'L’oreille du téléphone demande le réseau.',
};
