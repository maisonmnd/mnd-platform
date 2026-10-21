import { pourClaude, type Personne } from './ia-anonymise-pur';

/* LA RECHERCHE DEPUIS LE TRÔNE — 13 octobre 2026.

   « Intégrer Claude.ai et ChatGPT au Trône pour faire mes recherches sans
   changer d'écran » (Yéman, 13 octobre 2026), avec une condition : aucune
   dépense en plus de ses abonnements. Un appel direct aux modèles depuis le
   Trône se facturerait à part : on n'en fait AUCUN. Le Trône compose la
   question, et l'ouvre dans claude.ai ou chatgpt.com, où l'abonnement de la
   personne répond. Le bouton « Avec cet écran » joint ce que l'écran montre,
   passé par les deux barrières de la Maison : les noms deviennent prénom et
   initiale, les numéros et adresses disparaissent.

   L'historique reste sur le poste, trente jours, pour chacun.

   MODULE PUR. */

export type Moteur = 'claude' | 'chatgpt';

/* Les liens de pré-remplissage publiés par chaque service : la question est
   déjà écrite à l'arrivée, l'abonnement de la personne fait le reste.

   LES CONVERSATIONS QUI NE SE GARDENT PAS — 21 octobre 2026. « Les
   conversations doivent s'effacer aussi » (Yéman, au sélecteur : dans le
   Trône ET chez les deux services). ChatGPT ouvre une conversation
   temporaire par son lien (`temporary-chat=true`, rapporté par ses usagers,
   pas documenté par OpenAI) : elle ne va pas dans l'historique. Claude n'a
   pas de lien pour cela : ses conversations incognito s'ouvrent au fantôme,
   en haut à droite ; le panneau le rappelle. */
export const MOTEURS: Record<Moteur, { nom: string; origine: string; lien: (q: string, temporaire?: boolean) => string; seGardePas: { parLien: boolean; dit: string } }> = {
  claude: {
    nom: 'Claude', origine: 'https://claude.ai', lien: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`,
    seGardePas: { parLien: false, dit: 'Dans Claude, touchez le fantôme en haut à droite avant d’envoyer : la conversation ne se gardera pas.' },
  },
  chatgpt: {
    nom: 'ChatGPT', origine: 'https://chatgpt.com',
    lien: (q, temporaire) => `https://chatgpt.com/?${temporaire ? 'temporary-chat=true&' : ''}q=${encodeURIComponent(q)}`,
    seGardePas: { parLien: true, dit: 'Conversation temporaire : ChatGPT ne la garde pas dans votre historique.' },
  },
};
export const IDS_DES_MOTEURS = Object.keys(MOTEURS) as Moteur[];

/* LES MODÈLES DE QUESTION — 21 octobre 2026. Yéman colle un avis Google et
   écrit « répond a cet avis google » : la règle de la Maison n'y était pas, il
   fallait la redire à chaque fois. Un modèle porte la consigne et les règles
   (vous, jamais de prix, pas de tiret cadratin, la devise en signature, aucune
   civilité supposée) ; elle ne colle plus que le texte. */
export const DEVISE_DE_LA_MAISON = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

export type ModeleDeQuestion = { id: string; nom: string; invite: string; gabarit: (texte: string) => string };

export const MODELES_DE_QUESTION: readonly ModeleDeQuestion[] = [
  {
    id: 'avis-google', nom: 'Répondre à un avis Google', invite: 'Collez l’avis tel qu’il est écrit sur Google.',
    gabarit: (t) => `Écris la réponse publique de la Maison MND à cet avis Google. En français, au vouvoiement, chaleureuse et sobre, trois à cinq phrases. Remercie par le prénom tel qu’il est écrit dans l’avis, sans supposer Madame ou Monsieur. Pas de prix, pas de promesse de résultat, pas de tiret cadratin. Termine par la devise de la Maison : « ${DEVISE_DE_LA_MAISON} ».\n\nL’avis :\n« ${t} »`,
  },
  {
    id: 'message-cliente', nom: 'Écrire à une cliente', invite: 'Ce que le message doit lui dire.',
    gabarit: (t) => `Écris un message WhatsApp de la Maison MND à une cliente. Quatre phrases au plus, au vouvoiement, chaleureux, sans tiret cadratin. Appelle-la par sa civilité et son prénom si je les donne, sinon par son prénom seul. Aucun numéro de facture ni de reçu. Signe « Maison MND ».\n\nCe que le message doit dire :\n${t}`,
  },
  {
    id: 'publication', nom: 'Écrire une publication', invite: 'Le sujet, et le réseau (Instagram, Facebook…).',
    gabarit: (t) => `Écris une publication pour les réseaux de la Maison MND (@maison.mnd). La voix de la Maison : française, élégante et simple, sans jargon, sans superlatif, sans promesse de résultat. Pas de prix, pas de tiret cadratin. Propose trois accroches au choix, puis le texte, puis cinq mots-dièse.\n\nLe sujet :\n${t}`,
  },
  {
    id: 'traduire', nom: 'Traduire en anglais', invite: 'Le texte à traduire.',
    gabarit: (t) => `Traduis ce texte de la Maison MND en anglais, pour une cliente de la diaspora. Garde le ton (poli et chaleureux), les noms tels quels, « Maison MND » tel quel, et la devise « ${DEVISE_DE_LA_MAISON} » sans la traduire.\n\nLe texte :\n${t}`,
  },
];

export const modeleDeQuestion = (id?: string): ModeleDeQuestion | undefined => MODELES_DE_QUESTION.find((m) => m.id === id);

/** Ce que la personne a écrit, mis dans son modèle s'il y en a un. */
export const questionDuModele = (texte: string, modele?: string): string => {
  const m = modeleDeQuestion(modele);
  return m ? m.gabarit(String(texte ?? '').trim()) : String(texte ?? '').trim();
};

export const JOURS_D_HISTORIQUE = 30;
export const RECHERCHES_AU_PLUS = 100;
/* Ce qu'un navigateur passe sans broncher dans une adresse. */
export const LONGUEUR_MAX_DU_LIEN = 6000;
export const EXTRAIT_MAX = 600;

export type Ecran = { titre: string; texte: string };
/** `question` : ce que la personne a écrit, jamais le modèle déplié ; `modele`
    le redit. `moteurs` : tous ceux où cette question est partie. */
export type Recherche = { id: string; le: string; moteur: Moteur; question: string; ecran?: string; modele?: string; moteurs?: Moteur[] };

/** Seuls Yéman et Brice (rôle souverain), comme le Centre de commande. */
export const peutRechercher = (role: string | undefined): boolean => role === 'souverain';

/** Ce que l'écran montre, ramené à une ligne courte et propre. */
export function extraitDeLEcran(e: Ecran, max = EXTRAIT_MAX): Ecran {
  const propre = (t: string) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const texte = propre(e.texte);
  return { titre: propre(e.titre).slice(0, 120), texte: texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte };
}

/** La question telle qu'elle part : la question, puis l'écran si on le joint,
    tous deux passés par les barrières (prénom et initiale, sans numéro). */
export function questionComposee(question: string, ecran: Ecran | null, personnes: readonly Personne[]): string {
  const q = pourClaude(String(question ?? '').trim(), personnes);
  if (!ecran) return q;
  const e = extraitDeLEcran(ecran);
  const contexte = pourClaude([e.titre ? `Écran « ${e.titre} »` : '', e.texte].filter(Boolean).join(' : '), personnes);
  return contexte ? `${q}\n\nContexte, depuis le Trône de la Maison MND. ${contexte}` : q;
}

/** Le lien à ouvrir. Un contexte trop long est raccourci jusqu'à ce que le
    lien tienne ; la question elle-même ne se coupe jamais. */
export function lienDeRecherche(
  moteur: Moteur, question: string, ecran: Ecran | null, personnes: readonly Personne[], o: { temporaire?: boolean } = {},
): string {
  const lienDu = (q: string) => MOTEURS[moteur].lien(q, o.temporaire);
  let max = EXTRAIT_MAX;
  let lien = lienDu(questionComposee(question, ecran, personnes));
  while (lien.length > LONGUEUR_MAX_DU_LIEN && ecran && max > 40) {
    max = Math.floor(max / 2);
    lien = lienDu(questionComposee(question, extraitDeLEcran(ecran, max), personnes));
  }
  if (lien.length > LONGUEUR_MAX_DU_LIEN) lien = lienDu(questionComposee(question, null, personnes));
  return lien;
}

/** Un lien n'ouvre jamais autre chose que l'un des deux services. */
export const lienPermis = (lien: string): boolean => IDS_DES_MOTEURS.some((m) => lien.startsWith(`${MOTEURS[m].origine}/`));

/** UNE QUESTION, UNE LIGNE (21 octobre 2026) : la même question posée deux
    fois, à Claude puis à ChatGPT, se lisait deux fois. Elle se reconnaît à
    son texte (casse et espaces mis de côté) et à son modèle. */
export const cleDeLaRecherche = (r: Pick<Recherche, 'question' | 'modele'>): string =>
  `${r.modele ?? ''}|${String(r.question ?? '').replace(/\s+/g, ' ').trim().toLowerCase()}`;

/** L'historique vivant : trente jours, une ligne par question (la plus
    récente, avec tous les moteurs où elle est partie), cent au plus. */
export function historiqueVivant(liste: readonly Recherche[], maintenant: string): Recherche[] {
  const limite = new Date(new Date(maintenant).getTime() - JOURS_D_HISTORIQUE * 86_400_000).toISOString();
  const tries = [...liste].filter((r) => r && r.le >= limite).sort((a, b) => b.le.localeCompare(a.le));
  const parCle = new Map<string, Recherche>();
  for (const r of tries) {
    const cle = cleDeLaRecherche(r);
    const vue = parCle.get(cle);
    const ceux = [r.moteur, ...(r.moteurs ?? [])];
    if (!vue) parCle.set(cle, { ...r, moteurs: [...new Set(ceux)] });
    else vue.moteurs = [...new Set([...(vue.moteurs ?? [vue.moteur]), ...ceux])];
  }
  return [...parCle.values()].slice(0, RECHERCHES_AU_PLUS);
}

export function ajouteALHistorique(liste: readonly Recherche[], r: Recherche, maintenant: string): Recherche[] {
  return historiqueVivant([r, ...liste.filter((x) => x.id !== r.id)], maintenant);
}

/** EFFACER (21 octobre 2026, « les conversations doivent s'effacer ») : la
    question s'en va, tous ses exemplaires avec elle. */
export const effaceLaRecherche = (liste: readonly Recherche[], r: Pick<Recherche, 'question' | 'modele'>): Recherche[] =>
  liste.filter((x) => cleDeLaRecherche(x) !== cleDeLaRecherche(r));
