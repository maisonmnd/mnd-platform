/* ══ LES FORMULES FERMÉES À LA VENTE — 10 octobre 2026 ══════════════════
   La genèse des prix (synthèse du 10 octobre, correction 4, décidée au
   sélecteur par Yéman : « Fermer aujourd'hui »). Six formules étaient
   vendables au comptoir à 0 F : KÚNDO™ Annuel aurait donné vingt-huit gestes
   pour rien. Le masque de la vitrine les cachait à Ma Couronne, mais le
   comptoir, lui, les proposait toutes, sans filtre.

   UNE FORMULE FERMÉE N'EST PAS UNE FORMULE EFFACÉE. Elle ne se propose plus
   à une nouvelle abonnée (comptoir, Ma Couronne, carte de la Maison), mais
   ses contrats en cours la lisent toujours : prix, contenu, quotas. Elle se
   rouvre d'un geste, au Trône.

   LA FERMETURE D'OFFICE NE TOUCHE QUE LES SIX, ET SEULEMENT TELLES QU'ELLES
   SONT : à 0 F, sans prix par calibre, jamais fermées ni rouvertes. Une
   formule qui a reçu un prix entre-temps reste ouverte ; une formule rouverte
   à la main (`fermee: false` écrit) ne se referme jamais toute seule, sur
   aucun poste.

   Pur : aucun magasin, aucun réseau. Le Trône, Ma Couronne et la carte
   l'importent tels quels ; le harnais aussi. */

export type FormuleALaVente = {
  id: string;
  priceXof: number;
  prixParCalibre?: Record<string, number>;
  /** `true` : fermée à la vente. `false` écrit : rouverte à la main.
      Absent : jamais touchée, ouverte. */
  fermee?: boolean;
  /** Le jour où elle a été fermée (AAAA-MM-JJ), pour le dire à l'écran. */
  fermeeLe?: string;
};

/** Les six formules à 0 F du 10 octobre 2026 (catalogue vivant relu le même
    jour). Aucune autre ne se ferme d'office. */
export const FORMULES_A_ZERO_DU_10_OCTOBRE: readonly string[] = [
  '8NNx7ntL2qkzlybI3X76', // Abonnement VÈKPÈ™ · Les 2 Premiers Entretiens
  '1YGn657fDvaW2IKUt1v4', // GBÈTÒ™ 6 Mois · Pack Essentiel
  'mlaZXBKRR4to793TZ47U', // KÚNDO™ Annuel · Pack Prestige
  'eiuyJirEWGr1sjpxg2mi', // KÚNDO™ 6 Séances · Pack Prestige
  'DaKUkEMhDbPF5C7DRgtl', // Pack personnalisé
  'UEQdE224xMJBJ1aGwG39', // AZÃN™
];

/** Ouverte à la vente : tout ce qui n'est pas fermé explicitement. */
export const estOuverteALaVente = (p: { fermee?: boolean }): boolean => p.fermee !== true;

/** Les formules qu'on peut proposer à une nouvelle abonnée. */
export const ouvertesALaVente = <T extends { fermee?: boolean }>(plans: readonly T[]): T[] =>
  plans.filter(estOuverteALaVente);

/** La première formule ouverte : le choix par défaut d'une nouvelle vente. */
export const premiereOuverte = <T extends { fermee?: boolean }>(plans: readonly T[]): T | undefined =>
  plans.find(estOuverteALaVente);

/** LA LISTE D'UN MENU DE VENTE : les formules ouvertes, et celle déjà
    choisie même si elle est fermée (un contrat qu'on corrige, une demande
    venue de Ma Couronne avant la fermeture). Une formule fermée qu'on n'a
    pas choisie ne s'y glisse jamais. */
export const choixDeVente = <T extends { id: string; fermee?: boolean }>(
  plans: readonly T[], choisie: string | undefined | null,
): T[] => plans.filter((p) => estOuverteALaVente(p) || p.id === choisie);

/** Fermer ou rouvrir à la main. Rouvrir écrit `false` : la fermeture
    d'office ne la refermera pas. */
export const basculeLaVente = <T extends FormuleALaVente>(p: T, jourIso: string): T =>
  estOuverteALaVente(p)
    ? { ...p, fermee: true, fermeeLe: jourIso }
    : { ...p, fermee: false, fermeeLe: undefined };

const sansPrix = (p: FormuleALaVente): boolean =>
  !(Number(p.priceXof) > 0)
  && !Object.values(p.prixParCalibre ?? {}).some((v) => Number(v) > 0);

/** LA FERMETURE D'OFFICE : les six, encore à 0 F, jamais touchées. Rend la
    liste mise à jour et les ids fermés, ou `null` s'il n'y a rien à faire
    (la migration peut donc tourner sur chaque poste sans rien répéter). */
export function fermeLesFormulesAZero<T extends FormuleALaVente>(
  plans: readonly T[], jourIso: string,
): { plans: T[]; fermees: string[] } | null {
  const six = new Set(FORMULES_A_ZERO_DU_10_OCTOBRE);
  const fermees: string[] = [];
  const suite = plans.map((p) => {
    if (!six.has(p.id) || p.fermee !== undefined || !sansPrix(p)) return p;
    fermees.push(p.id);
    return { ...p, fermee: true, fermeeLe: jourIso };
  });
  return fermees.length > 0 ? { plans: suite, fermees } : null;
}
