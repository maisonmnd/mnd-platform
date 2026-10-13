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
   déjà écrite à l'arrivée, l'abonnement de la personne fait le reste. */
export const MOTEURS: Record<Moteur, { nom: string; origine: string; lien: (q: string) => string }> = {
  claude: { nom: 'Claude', origine: 'https://claude.ai', lien: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  chatgpt: { nom: 'ChatGPT', origine: 'https://chatgpt.com', lien: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
};
export const IDS_DES_MOTEURS = Object.keys(MOTEURS) as Moteur[];

export const JOURS_D_HISTORIQUE = 30;
export const RECHERCHES_AU_PLUS = 100;
/* Ce qu'un navigateur passe sans broncher dans une adresse. */
export const LONGUEUR_MAX_DU_LIEN = 6000;
export const EXTRAIT_MAX = 600;

export type Ecran = { titre: string; texte: string };
export type Recherche = { id: string; le: string; moteur: Moteur; question: string; ecran?: string };

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
export function lienDeRecherche(moteur: Moteur, question: string, ecran: Ecran | null, personnes: readonly Personne[]): string {
  let max = EXTRAIT_MAX;
  let lien = MOTEURS[moteur].lien(questionComposee(question, ecran, personnes));
  while (lien.length > LONGUEUR_MAX_DU_LIEN && ecran && max > 40) {
    max = Math.floor(max / 2);
    lien = MOTEURS[moteur].lien(questionComposee(question, extraitDeLEcran(ecran, max), personnes));
  }
  if (lien.length > LONGUEUR_MAX_DU_LIEN) lien = MOTEURS[moteur].lien(questionComposee(question, null, personnes));
  return lien;
}

/** Un lien n'ouvre jamais autre chose que l'un des deux services. */
export const lienPermis = (lien: string): boolean => IDS_DES_MOTEURS.some((m) => lien.startsWith(`${MOTEURS[m].origine}/`));

/** L'historique vivant : trente jours, cent entrées au plus, le plus récent d'abord. */
export function historiqueVivant(liste: readonly Recherche[], maintenant: string): Recherche[] {
  const limite = new Date(new Date(maintenant).getTime() - JOURS_D_HISTORIQUE * 86_400_000).toISOString();
  return [...liste].filter((r) => r.le >= limite).sort((a, b) => b.le.localeCompare(a.le)).slice(0, RECHERCHES_AU_PLUS);
}

export function ajouteALHistorique(liste: readonly Recherche[], r: Recherche, maintenant: string): Recherche[] {
  return historiqueVivant([r, ...liste.filter((x) => x.id !== r.id)], maintenant);
}
