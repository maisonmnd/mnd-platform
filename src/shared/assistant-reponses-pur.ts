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
/* 2 novembre 2026 : « Gérard n'existe plus » (Yéman). L'assistant des clientes
   s'appelle Perle entre nous ; devant une cliente, il reste « l'assistant de la
   Maison » et ne nomme personne. */
export const REPONSE_FRANCHE = 'Je suis l’assistant automatique de la Maison pour les rendez-vous. Si vous préférez, je préviens une personne de l’équipe, qui vous écrit dans la journée.';

/** LA PHRASE DE RETOUR à un bouton, et sa clé de réservation (une par jour et par numéro). */
export function retourDuBouton(o: {
  geste: GesteDuBouton; garder: boolean; appel: string; quand?: string; couronneUrl: string; offrirUrl: string;
}): { auto: string; texte: string } | null {
  const { appel } = o;
  if (o.geste === 'MERCI') return null;
  if (o.garder) {
    if (o.geste === 'OUI' && o.quand) return { auto: 'assistant-oui', texte: `C’est noté, ${appel} : la Maison vous attend ${o.quand}.` };
    /* « Je ne peux plus » (2 novembre 2026, lot 3 de Perle) : rien n'est
       annulé, la Maison est prévenue et reprend la conversation. */
    if (o.geste === 'NON') return { auto: 'assistant-empechee', texte: `C’est noté, ${appel} : nous prévenons la Maison, qui vous écrit ici au sujet de votre rendez-vous${o.quand ? ` ${o.quand}` : ''}.` };
    /* « Changer l'heure » : l'automate propose ses places et déplace ; cette
       phrase n'est plus que son SECOURS, quand il ne répond pas. */
    return { auto: 'assistant-autre', texte: `Bien sûr, ${appel}. Choisissez votre nouveau moment dans Ma Couronne : ${o.couronneUrl}\nOu répondez ici avec le jour qui vous va, la Maison vous propose une heure.` };
  }
  if (o.geste === 'NON') return { auto: 'assistant-non', texte: `C’est noté, ${appel}. La Maison reste là quand l’envie vous prend.` };
  if (o.geste === 'CARTE') return { auto: 'assistant-carte', texte: `Avec plaisir, ${appel} ! La carte cadeau de la Maison se commande ici : ${o.offrirUrl}` };
  const soin = o.geste === 'SOIN' ? ', nous notons le soin' : '';
  return { auto: 'assistant-oui', texte: `Avec plaisir, ${appel}${soin} ! Choisissez votre place dans Ma Couronne : ${o.couronneUrl}\nOu répondez ici avec le jour et l’heure qui vous vont, la Maison vous confirme.` };
}

/* ══ LES BOUTONS DE « GARDER » — 2 novembre 2026, lot 3 de Perle ══════════
   Spec v4 (docs/spec-assistant-maison.md, l. 391 et 400) et choix de Yéman
   du 2 novembre 2026 (le déplacement se fait seul, sous verrou) :
     · « Oui, je viens » : le rendez-vous est gardé, rien d'autre ne part ;
     · « Changer l'heure » : un autre moment demandé (À faire allume la
       ligne), et le webhook transmet le bouton à l'automate avec
       `deplacer: { rdvId }` : il propose ses places et déplace le rendez-vous
       sous verrou. S'il ne répond pas, la phrase de Ma Couronne en secours et
       l'équipe prévenue ;
     · « Je ne peux plus » : RIEN N'EST ANNULÉ. Une marque datée sur le
       rendez-vous (`empecheeDitLe` : À faire dit « ne peut plus venir »), la
       main passe à l'équipe sur ce fil (l'automate se tait : la ligne
       `main-<numéro>` de `fils_automate`, celle que pose le Trône quand une
       personne écrit), le téléphone de l'équipe sonne (le prénom, jamais un
       texte) et la cliente reçoit une phrase sobre. */
export const MOTIF_NE_PEUT_PLUS = 'ne-peut-plus';
/** La main passée à l'équipe tient vingt-quatre heures, la pause livrée de l'automate. */
export const PAUSE_NE_PEUT_PLUS_H = 24;

export type MarquesDuGarder = { confirmeeParLaClienteLe?: string; autreMomentDemandeLe?: string; empecheeDitLe?: string };
export type SuiteDuGarder = {
  /** Ce que le rendez-vous reçoit : une marque datée, jamais un statut. Une
      clé à `undefined` efface la marque d'une réponse précédente. */
  marques: MarquesDuGarder;
  /** La main passe à l'équipe sur ce fil (pause de l'automate). */
  main?: { motif: string; heures: number };
  /** Ce qui sonne chez l'équipe : le prénom et le rendez-vous, jamais le texte. */
  alerte?: { titre: string; corps: string };
  /** « Changer l'heure » : l'automate ouvre ses places en mode déplacement. */
  deplacer?: boolean;
};

/** La suite d'un bouton touché sous un message « garder ». `null` : rien sur
    le rendez-vous (un merci). */
export function suiteDuGarder(geste: GesteDuBouton, o: { quandIso: string; prenom: string; quand?: string }): SuiteDuGarder | null {
  const rdv = o.quand ? `Rendez-vous ${o.quand}` : 'Son rendez-vous';
  if (geste === 'OUI' || geste === 'SOIN') {
    return { marques: { confirmeeParLaClienteLe: o.quandIso, autreMomentDemandeLe: undefined, empecheeDitLe: undefined } };
  }
  if (geste === 'NON') {
    return {
      marques: { empecheeDitLe: o.quandIso, confirmeeParLaClienteLe: undefined, autreMomentDemandeLe: undefined },
      main: { motif: MOTIF_NE_PEUT_PLUS, heures: PAUSE_NE_PEUT_PLUS_H },
      alerte: { titre: `${o.prenom} ne peut plus venir`, corps: `${rdv} : rien n’est annulé. Écrivez-lui pour le déplacer ou l’annuler.` },
    };
  }
  if (geste === 'AUTRE') {
    return {
      marques: { autreMomentDemandeLe: o.quandIso, confirmeeParLaClienteLe: undefined, empecheeDitLe: undefined },
      alerte: { titre: `${o.prenom} veut changer l’heure`, corps: `${rdv} : proposez-lui une autre place.` },
      deplacer: true,
    };
  }
  return null;
}

/** LA MAIN À L'ÉQUIPE sur ce fil : la ligne `main-<numéro>` de
    `fils_automate`, telle que le Trône la pose (`poseLaMain`). La pause ne
    part jamais avant la dernière main rendue ; une pause d'une personne
    encore en cours est gardée telle quelle, seulement prolongée. */
export function mainPourLEquipe(
  avant: Record<string, unknown> | null | undefined, numero: string, motif: string, heures: number, maintenantMs: number,
): Record<string, unknown> {
  const ms = (v: unknown): number => { const x = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(x) ? x : 0; };
  const id = `main-${numero}`;
  const fin = (debut: number): string => new Date(Math.max(debut + heures * 3_600_000, ms(avant?.jusqua))).toISOString();
  if (avant && ms(avant.jusqua) > maintenantMs && ms(avant.pauseLe) > ms(avant.rendueLe)) {
    return { ...avant, id, numero, jusqua: fin(maintenantMs) };
  }
  const pose = Math.max(maintenantMs, ms(avant?.rendueLe) + 1);
  return { ...(avant ?? {}), id, numero, pauseLe: new Date(pose).toISOString(), jusqua: fin(pose), motif: motif.slice(0, 40), par: 'Assistant Maison' };
}
