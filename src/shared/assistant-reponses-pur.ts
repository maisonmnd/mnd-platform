/* ══ CE QUE L'ASSISTANT MAISON ENTEND — 27 octobre 2026 ══════════════════
   Maquette v4, lot 2 : « l'oreille ». Ce module ne dépend de rien : le
   webhook WhatsApp le porte en COPIE entre ses repères
   (`node scripts/copie-dans-le-centre.mjs --fonction supabase/functions/whatsapp-webhook/index.ts`),
   et `verifie-gerard` crie si la copie a pris du retard.

     · LES BOUTONS de ses modèles portent l'identifiant de leur ligne
       d'envoi (« GERARD:<ligne>:<geste> ») : la réponse s'écrit sur la
       ligne (oui, non), l'automate de réservation ne la prend pas (il ne
       lit que les boutons « MND: »), et la Maison répond d'une phrase.
     · « STOP » : plus aucune nouvelle de la Maison, les rappels de RDV
       continuent (ce sont des services).
     · LA QUESTION FRANCHE : à « c'est un robot ? », il ne ment jamais. */

/** Le geste d'un bouton, d'après son libellé. */
export type GesteDuBouton = 'OUI' | 'SOIN' | 'AUTRE' | 'NON' | 'MERCI' | 'CARTE';
export const GESTE_DU_LIBELLE: Record<string, GesteDuBouton> = {
  'Oui, je viens': 'OUI', 'Changer l’heure': 'AUTRE', 'Je ne peux plus': 'NON',
  'Oui': 'OUI', 'Avec le soin': 'SOIN', 'Pas cette fois': 'NON', 'Une autre date': 'AUTRE',
  'Merci, je réserve': 'OUI', 'Merci': 'MERCI', 'Une place': 'OUI', 'La carte cadeau': 'CARTE',
  'Prendre un RDV': 'OUI', 'Pas pour l’instant': 'NON',
};
export const PREFIXE_DU_BOUTON = 'GERARD';

/** L'identifiant qu'un bouton porte chez Meta (128 signes au plus). */
export const charge = (ligneId: string, libelle: string): string =>
  `${PREFIXE_DU_BOUTON}:${ligneId}:${GESTE_DU_LIBELLE[libelle] ?? 'OUI'}`.slice(0, 128);

/** Le bouton touché, relu : sa ligne d'envoi et son geste ; `null` si ce n'est pas un bouton de l'Assistant. */
export function lisLeBoutonDeLAssistant(id: string | undefined): { ligneId: string; geste: GesteDuBouton } | null {
  const m = /^GERARD:(gerard-\d{4}-\d{2}-\d{2}-.+-(?:whatsapp|push|wa-main)):(OUI|SOIN|AUTRE|NON|MERCI|CARTE)$/.exec(String(id ?? ''));
  return m ? { ligneId: m[1], geste: m[2] as GesteDuBouton } : null;
}

/** Ce que la ligne retient : oui (elle veut une place), non (pas maintenant), rien pour un merci. */
export const reponseDuGeste = (g: GesteDuBouton): 'oui' | 'non' | undefined =>
  g === 'NON' ? 'non' : g === 'MERCI' ? undefined : 'oui';

/** « STOP » et ses variantes, seuls dans le message. */
export const estUnStop = (texte: string): boolean =>
  /^\s*(stop|arr[eê]t(ez|er)?|d[ée]sabonne(r|z)?(-| )?(moi)?|unsubscribe|plus de messages?)\s*[.!]*\s*$/i.test(String(texte ?? ''));
export const ACCUSE_DU_STOP = 'C’est noté : la Maison ne vous enverra plus ses nouvelles. Les rappels de vos rendez-vous continuent.';

/** Une cliente qui demande franchement si elle parle à une personne. */
export const estUneQuestionFranche = (texte: string): boolean =>
  /\b(robot|chatbot|bot|ia|intelligence artificielle|machine)\b|\b(message|réponse|reponse)s? automatiques?\b|\bje parle (à|a) qui\b|\bc.est (bien |vraiment )?g[ée]rard\b|\bune vraie personne\b|\bun (être )?humain\b/i.test(String(texte ?? ''));
export const REPONSE_FRANCHE = 'Je suis l’assistant automatique de la Maison pour les rendez-vous. Si vous préférez, je préviens Gérard ou quelqu’un de l’équipe, qui vous écrit dans la journée.';

/** LA PHRASE DE RETOUR à un bouton, et sa clé de réservation (une par jour et par numéro). */
export function retourDuBouton(o: {
  geste: GesteDuBouton; garder: boolean; appel: string; quand?: string; couronneUrl: string; offrirUrl: string;
}): { auto: string; texte: string } | null {
  const { appel } = o;
  if (o.geste === 'MERCI') return null;
  if (o.garder) {
    if (o.geste === 'OUI' && o.quand) return { auto: 'assistant-oui', texte: `C’est noté, ${appel} : la Maison vous attend ${o.quand}.` };
    return { auto: 'assistant-autre', texte: `Bien sûr, ${appel}. Choisissez votre nouveau moment dans Ma Couronne : ${o.couronneUrl}\nOu répondez ici avec le jour qui vous va, la Maison vous propose une heure.` };
  }
  if (o.geste === 'NON') return { auto: 'assistant-non', texte: `C’est noté, ${appel}. La Maison reste là quand l’envie vous prend.` };
  if (o.geste === 'CARTE') return { auto: 'assistant-carte', texte: `Avec plaisir, ${appel} ! La carte cadeau de la Maison se commande ici : ${o.offrirUrl}` };
  const soin = o.geste === 'SOIN' ? ', nous notons le soin' : '';
  return { auto: 'assistant-oui', texte: `Avec plaisir, ${appel}${soin} ! Choisissez votre place dans Ma Couronne : ${o.couronneUrl}\nOu répondez ici avec le jour et l’heure qui vous vont, la Maison vous confirme.` };
}
