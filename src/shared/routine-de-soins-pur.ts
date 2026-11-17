/* ══ LA ROUTINE EN TROIS TEMPS, RANGÉE À LA MAISON · 17 novembre 2026 ═════
   Le 27 septembre 2026, le site posait cinq questions (où en sont les locks,
   le cheveu, le cuir chevelu, ce qui préoccupe, le rythme) et rendait une
   porte et une routine de soins, chaque semaine, chaque mois, chaque saison
   (« on peut avoir une forme de quiz pour notre style de cheveux, et faire
   des recommandations et une routine de soins », Yéman).

   Le 17 novembre 2026 : « Il ne faut pas permettre d'avoir des bilans sans
   prendre de RDV sinon tout le monde nous trichera. » Le diagnostic du menu
   ferme (arbitrage D) ; le menu mène à la consultation, et LA ROUTINE SE
   REMET AVEC LE RENDEZ-VOUS. Elle n'est pas détruite : ses questions et sa
   composition vivent ici, mot pour mot, et le Trône la donne depuis la fiche
   d'une cliente (« Sa routine », `LaRoutineDeSoins`).

   LES CONSEILS SONT DES GESTES, PAS DES PRODUITS : aucune phrase ne nomme un
   prix ni une marque, et un conseil de geste reste juste quel que soit le
   flacon.

   Pur, sans import. `scripts/verifie-les-autres-portes.mjs` l'éprouve. */

export type CleDeLaRoutine = 'etat' | 'cheveu' | 'cuir' | 'soucis' | 'rythme';
/** Le cuir chevelu et les préoccupations acceptent plusieurs réponses ;
    chacune a une réponse « rien de tout ça » (`exclusif`) qui efface les
    autres, et que toute autre efface (28 septembre 2026). */
export type QuestionDeLaRoutine = { cle: CleDeLaRoutine; titre: string; multi?: boolean; exclusif?: string; reponses: [string, string][] };
export type ReponsesDeLaRoutine = { etat?: string; cheveu?: string; cuir?: string[]; soucis?: string[]; rythme?: string };

/** Les cinq questions, telles que le site les posait. Au Trône, la Maison
    les pose à la cliente, ou y répond d'après ce qu'elle a vu au fauteuil. */
export const QUESTIONS_DE_LA_ROUTINE: readonly QuestionDeLaRoutine[] = [
  { cle: 'etat', titre: 'Où en êtes-vous ?', reponses: [
    ['aucune', 'Pas encore de locks'], ['jeunes', 'Des locks de moins d’un an'], ['mures', 'Des locks de un à cinq ans'],
    ['anciennes', 'Des locks de plus de cinq ans'], ['enfant', 'C’est pour mon enfant'],
  ] },
  { cle: 'cheveu', titre: 'Votre cheveu, au naturel', reponses: [
    ['fin', 'Fin et souple'], ['epais', 'Dense et épais'], ['moyen', 'Entre les deux'], ['inconnu', 'Je ne sais pas'],
  ] },
  { cle: 'cuir', titre: 'Votre cuir chevelu', multi: true, exclusif: 'ok', reponses: [
    ['sec', 'Il tiraille, il est sec'], ['gras', 'Il regraisse vite, il démange'], ['ok', 'Il est plutôt tranquille'],
    ['sensible', 'Il est sensible : pellicules, irritations'],
  ] },
  { cle: 'soucis', titre: 'Ce qui vous préoccupe', multi: true, exclusif: 'rien', reponses: [
    ['casse', 'Casse ou amincissement'], ['racines', 'Racines à reprendre'], ['secheresse', 'Sécheresse des longueurs'],
    ['residus', 'Résidus ou odeur après le lavage'], ['changement', 'Envie de changement : couleur, forme'], ['rien', 'Rien, je veux garder le cap'],
  ] },
  { cle: 'rythme', titre: 'Votre rythme', reponses: [
    ['mensuel', 'Je peux venir chaque mois'], ['six', 'Toutes les six à huit semaines'], ['voyage', 'Je voyage, difficile de prévoir'],
    ['apprendre', 'Je veux apprendre à faire moi-même'],
  ] },
];

/** La porte que les réponses désignent : sans locks on crée, un enfant va
    chez MND Kids, qui veut apprendre va à l'Académie, une casse ou un
    changement passent par le regard de la réparation, le reste est de
    l'entretien. */
export type PorteDeLaRoutine = 'creation' | 'kids' | 'formation' | 'reparation' | 'entretien';
export const PORTES_DE_LA_ROUTINE: Readonly<Record<PorteDeLaRoutine, string>> = {
  creation: 'Première Couronne', kids: 'MND Kids', formation: 'Académie MND', reparation: 'Réparation', entretien: 'Entretien',
};

export type RoutineDeSoins = { porte: PorteDeLaRoutine; semaine: string[]; mois: string[]; saison: string[]; maison: string };

/* LA ROUTINE SE COMPOSE D'APRÈS LES RÉPONSES. Chaque phrase est un geste
   qu'on peut faire chez soi ou demander à la Maison. */
export function composeLaRoutine(r: ReponsesDeLaRoutine): RoutineDeSoins {
  const s = new Set(r.soucis ?? []);
  let porte: PorteDeLaRoutine = 'entretien';
  if (r.etat === 'enfant') porte = 'kids';
  else if (r.etat === 'aucune') porte = 'creation';
  else if (r.rythme === 'apprendre') porte = 'formation';
  else if (s.has('casse') || s.has('changement') || (s.has('racines') && r.etat === 'anciennes')) porte = 'reparation';

  const semaine: string[] = [];
  const parCuir: Record<string, string> = {
    sec: 'Brumisez le cuir chevelu d’eau puis d’une huile légère, sans charger les longueurs.',
    gras: 'Un lavage doux par semaine, clarifiant et sans résidu, et pas d’huile sur le cuir chevelu.',
    ok: 'Un lavage doux tous les sept à dix jours, une brume d’eau les autres jours.',
    sensible: 'Un lavage apaisant, sans sulfates ni parfum, puis quelques gouttes d’un sérum calmant sur le cuir chevelu. Une irritation qui dure se montre à un dermatologue : la Maison adapte ensuite ses gestes.',
  };
  for (const k of r.cuir ?? []) if (parCuir[k]) semaine.push(parCuir[k]);
  semaine.push('Dormez sous un foulard ou une taie en satin : c’est la moitié de l’hydratation.');
  if (s.has('secheresse')) semaine.push('Sur les longueurs, un lait hydratant léger une fois par semaine, jamais de beurre épais.');
  if (s.has('residus')) semaine.push('Rincez longtemps, essorez à la serviette microfibre, séchez complètement : l’odeur vient de l’humidité qui reste.');

  const mois: string[] = [];
  const parEtat: Record<string, string> = {
    aucune: 'Avant la pose : deux ou trois lavages clarifiants et aucun produit lourd, pour que le cheveu accroche.',
    jeunes: 'Resserrage toutes les quatre à six semaines : c’est la période où la couronne se forme, on ne la laisse pas se défaire.',
    mures: 'Resserrage toutes les six à huit semaines, et un lavage profond à la Maison.',
    anciennes: 'Toutes les six à huit semaines : allègement des racines et contrôle des longueurs, qui portent leur poids.',
    enfant: 'Une séance courte toutes les six à huit semaines, sans tension sur les racines.',
  };
  if (r.etat && parEtat[r.etat]) mois.push(parEtat[r.etat]);
  if (s.has('casse')) mois.push('Une séance de réparation avant le prochain resserrage : on ne resserre pas ce qui casse.');
  if (r.cheveu === 'fin') mois.push('Cheveu fin : jamais un resserrage trop serré, des locks un peu plus larges qui tiendront des années.');

  const saison = ['Un soin profond à la vapeur, protéiné ou hydratant selon la saison, et un bilan de la couronne avec la Maison.'];
  if (s.has('changement')) saison.push('Le changement (couleur végétale, nouvelle forme) se décide au bilan, quand la couronne est saine.');

  const parRythme: Record<string, string> = {
    mensuel: 'Un rendez-vous chaque mois : la Maison vous propose l’abonnement, pour ne plus y penser.',
    six: 'Toutes les six à huit semaines : la Maison vous rappelle quand c’est le moment.',
    voyage: 'Vous voyagez : la Maison vous écrit avant vos passages à Cotonou, et vous garde la routine de voyage.',
    apprendre: 'Vous voulez faire vous-même : l’Académie MND commence par la tenue de votre propre couronne.',
  };
  return { porte, semaine, mois, saison, maison: parRythme[r.rythme ?? ''] ?? '' };
}

/** Les réponses suffisent-elles à composer ? Les cinq questions ont chacune
    une réponse (les deux à cocher : au moins une). */
export function reponsesCompletes(r: ReponsesDeLaRoutine): boolean {
  return !!r.etat && !!r.cheveu && (r.cuir ?? []).length > 0 && (r.soucis ?? []).length > 0 && !!r.rythme;
}

/** Toucher une réponse : une seule pour les questions simples ; pour les
    questions à cocher, « rien de tout ça » efface les autres et toute autre
    l'efface. */
export function touche(r: ReponsesDeLaRoutine, q: QuestionDeLaRoutine, v: string): ReponsesDeLaRoutine {
  if (!q.multi) return { ...r, [q.cle]: v };
  const choisis = new Set((r[q.cle] as string[] | undefined) ?? []);
  if (q.exclusif && v === q.exclusif) {
    const seule = choisis.has(v) && choisis.size === 1;
    return { ...r, [q.cle]: seule ? [] : [v] };
  }
  if (q.exclusif) choisis.delete(q.exclusif);
  if (choisis.has(v)) choisis.delete(v); else choisis.add(v);
  return { ...r, [q.cle]: [...choisis] };
}

/** LE MESSAGE QUE LA MAISON REMET, avec le rendez-vous : la routine en
    trois temps, chaque geste sur sa ligne. `appel` facultatif (sans lui,
    « Bonjour, », jamais un « Madame » supposé). Sans la signature : le Trône
    la pose, une seule fois, par `signeLeMessage`. */
export function messageDeLaRoutine(t: RoutineDeSoins, appel = ''): string {
  const a = appel.replace(/\s+/g, ' ').trim();
  const bloc = (titre: string, gestes: readonly string[]): string[] => (gestes.length ? [`${titre} :`, ...gestes.map((g) => `· ${g}`)] : []);
  return [
    `Bonjour${a ? ` ${a}` : ''}, voici votre routine, en trois temps.`,
    ...bloc('Chaque semaine', t.semaine),
    ...bloc('Chaque mois', t.mois),
    ...bloc('Chaque saison', t.saison),
    ...(t.maison ? [`À la Maison : ${t.maison}`] : []),
  ].join('\n');
}
