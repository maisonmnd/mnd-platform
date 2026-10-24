/* ═══════════════════════════════════════════════════════════════════
   CE QUE CLAUDE LIT POUR LE TABLEAU DE BORD — 24 octobre 2026.

   Trois chantiers de la porte `ia-maison` (la direction seule) :
     · `prevision` : expliquer la prévision du mois que le Trône a CALCULÉE
       (choix du sélecteur : « le Trône calcule, Claude explique ») ;
     · `question` : répondre à « Demander à la Maison… » avec le seul
       contexte que le Trône lui donne ;
     · `processus` : traduire une phrase en processus, avec les seules
       briques que le Trône sait faire (shared/processus-pur.ts).

   CE QUI PART : des SOMMES et des COMPTES, des noms de projets, des
   prénoms de l'équipe. JAMAIS une cliente, un numéro, une pièce. La
   fonction efface encore ce qui ressemble à un numéro (sansCoordonnees).

   Ce module est PUR : il compose la demande, il ne l'envoie pas. */
import type { DemandeIa } from './ia-maison-pur';
import { AUDIENCES_DES_PROCESSUS } from './processus-pur';

const REGLES_DE_LA_MAISON = [
  'Tu écris pour Maison MND, une maison de soins des locks à Cotonou. On l’appelle « Maison MND » ou « la Maison », jamais « salon ».',
  'Français simple, phrases courtes. Jamais de tiret cadratin : une virgule à la place. Pas d’emoji.',
  'Les montants en francs CFA, écrits « 2 780 000 F ». Une date porte toujours son année.',
  'N’invente AUCUN chiffre : tu n’utilises que ceux qu’on te donne. S’il en manque un, dis-le.',
  'Tu proposes, tu ne décides pas : rien ne part, rien ne s’inscrit sans le oui de la direction.',
].join('\n');

export type PartDeLaPrevision = { cle: string; dit: string };
export type ContexteDeLaPrevision = {
  mois: string;
  aujourdhui: string;
  centrale: string;
  bas: string;
  haut: string;
  parts: readonly PartDeLaPrevision[];
  /** Les mois passés, entiers (« septembre 2026 : 3 120 000 F »). */
  moisPasses: readonly string[];
};

/** CLAUDE EXPLIQUE LA PRÉVISION : une phrase, trois raisons au plus, deux
    gestes au plus, à partir des seules parts calculées. */
export function demandeDExplication(c: ContexteDeLaPrevision): DemandeIa {
  return {
    chantier: 'prevision',
    usage: 'texte',
    systeme: `${REGLES_DE_LA_MAISON}\nOn te donne la prévision du mois calculée par le Trône et le détail de ses parts. Explique-la à la directrice en une phrase, puis donne au plus trois raisons et au plus deux gestes utiles cette semaine (relancer, poser, encaisser). Ne refais pas le calcul.`,
    messages: [{
      role: 'user',
      content: [
        `Mois : ${c.mois}. Aujourd’hui : ${c.aujourdhui}.`,
        `Prévision de fin de mois : ${c.centrale} (fourchette ${c.bas} à ${c.haut}).`,
        'Ce qui la fait :',
        ...c.parts.map((p) => `- ${p.dit}`),
        c.moisPasses.length ? `Les mois passés : ${c.moisPasses.join(' ; ')}.` : 'Pas de mois passé connu.',
      ].join('\n'),
    }],
    schema: {
      type: 'object',
      properties: {
        phrase: { type: 'string', description: 'Une phrase qui dit la prévision et sa raison principale.' },
        raisons: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        gestes: { type: 'array', items: { type: 'string' }, maxItems: 2 },
      },
      required: ['phrase', 'raisons', 'gestes'],
    },
    maxTokens: 700,
  };
}
export type ExplicationDeLaPrevision = { phrase: string; raisons: string[]; gestes: string[] };

/** Ce que la réponse doit être pour s'afficher : sinon, on le dit. */
export function explicationLisible(d: unknown): ExplicationDeLaPrevision | null {
  const x = d as Partial<ExplicationDeLaPrevision> | null;
  if (!x || typeof x.phrase !== 'string' || !x.phrase.trim()) return null;
  const propre = (s: unknown) => String(s ?? '').replace(/\s*—\s*/g, ', ').trim();
  return {
    phrase: propre(x.phrase),
    raisons: (Array.isArray(x.raisons) ? x.raisons : []).map(propre).filter(Boolean).slice(0, 3),
    gestes: (Array.isArray(x.gestes) ? x.gestes : []).map(propre).filter(Boolean).slice(0, 2),
  };
}

/** LE CONTEXTE DE LA MAISON, EN LIGNES : des sommes, des comptes, des noms
    de projets ; jamais une cliente. */
export type ContexteDeLaMaison = {
  aujourdhui: string;
  prevision?: string[];
  jour?: string;
  creances?: string;
  projets?: string[];
  agents?: string[];
  cadence?: string;
};
export function contexteEnTexte(c: ContexteDeLaMaison): string {
  return [
    `Aujourd’hui : ${c.aujourdhui}.`,
    c.jour ? `La journée : ${c.jour}` : '',
    c.prevision?.length ? `La prévision du mois :\n${c.prevision.map((l) => `- ${l}`).join('\n')}` : '',
    c.creances ? `Les créances : ${c.creances}` : '',
    c.cadence ? `La Cadence : ${c.cadence}` : '',
    c.projets?.length ? `Les projets :\n${c.projets.map((l) => `- ${l}`).join('\n')}` : '',
    c.agents?.length ? `Les agents :\n${c.agents.map((l) => `- ${l}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

/** « DEMANDER À LA MAISON » : une question, le contexte du jour, et les
    tours d'avant (au plus quatre). */
export function demandeDeQuestion(question: string, contexte: ContexteDeLaMaison, avant: readonly { role: 'user' | 'assistant'; content: string }[] = []): DemandeIa {
  const fil = avant.slice(-4);
  return {
    chantier: 'question',
    usage: 'texte',
    systeme: `${REGLES_DE_LA_MAISON}\nTu es l’assistant du Trône, l’outil de gestion de la Maison. Tu réponds à la direction en cinq phrases au plus, avec les seuls chiffres du contexte ci-dessous. Si la réponse n’y est pas, dis-le et nomme l’écran du Trône où la trouver (le Carnet, La Cadence, les Créances, Les projets, Les agents). Si on te demande de faire quelque chose chaque semaine ou chaque jour, propose de le construire dans « Les agents › Construire un processus ».\n\nLE CONTEXTE DU JOUR\n${contexteEnTexte(contexte)}`,
    messages: [...fil, { role: 'user', content: question.trim().slice(0, 1200) }],
    maxTokens: 600,
  };
}

/** « CONSTRUIRE UN PROCESSUS » : la phrase devient un processus, avec les
    seules audiences que le Trône sait calculer. La réponse repasse par
    `nettoieLeProcessus` (processus-pur.ts) avant de s'afficher. */
export function demandeDeProcessus(phrase: string): DemandeIa {
  const audiences = AUDIENCES_DES_PROCESSUS.map((a) => `« ${a.cle} » : ${a.nom.toLowerCase()} (${a.dit.replace('{n}', 'N')})`).join(' ; ');
  return {
    chantier: 'processus',
    usage: 'texte',
    systeme: `${REGLES_DE_LA_MAISON}\nLa direction décrit une tâche qui revient. Traduis-la en processus du Trône. Un processus a : des jours de la semaine (0 = dimanche … 6 = samedi), une heure entre 08:00 et 19:59, UNE audience parmi celles-ci et aucune autre : ${audiences} ; un délai en jours N quand l’audience en a un ; avec ou sans deux places libres proposées ; un message court (deux phrases) qui commence par « Bonjour {appel}, » et met {places} là où les places doivent apparaître. Jamais de prix dans le message, jamais de date passée, jamais « salon ». Si la demande ne rentre dans aucune audience, choisis la plus proche et dis-le dans « aClarifier ». Pose dans « aClarifier » la question qui manque, s’il en manque une.`,
    messages: [{ role: 'user', content: phrase.trim().slice(0, 800) }],
    schema: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Un nom court, « Les reprises du lundi ».' },
        jours: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
        heure: { type: 'string', description: 'HH:MM' },
        audience: { type: 'string', enum: AUDIENCES_DES_PROCESSUS.map((a) => a.cle) },
        delaiJours: { type: 'integer' },
        avecPlaces: { type: 'boolean' },
        message: { type: 'string' },
        aClarifier: { type: 'string' },
      },
      required: ['nom', 'jours', 'heure', 'audience', 'avecPlaces', 'message'],
    },
    maxTokens: 700,
  };
}
