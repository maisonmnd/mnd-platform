/* SES RENDEZ-VOUS, DEPUIS SON RENDEZ-VOUS — 24 octobre 2026.

   « Comment voir la liste des RDV d'une cliente depuis son RDV sans retourner
   dans le Carnet. Je veux accéder à ses anciens RDV et pouvoir les modifier
   à tout moment sans changer d'écran » (Yéman). La fenêtre du rendez-vous
   gagne un onglet « Ses rendez-vous » ; chaque ligne rouvre le sien PAR-
   DESSUS, et le fermer ramène où l'on était, sans rien perdre de la saisie.

   Ici, l'ordre et les comptes, sans aucun magasin : à venir d'abord (le plus
   proche en tête), puis le passé (le plus récent en tête) ; et les totaux,
   en chiffres (« des chiffres, pas des phrases », même soir). */

export type RdvDeLaListe = { id: string; date: string; time: string; status: string };

const minutes = (hhmm: string): number => {
  const [h, m] = (hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** À VENIR : un jour à venir, ou aujourd'hui tant qu'il n'est pas honoré.
    Le reste est passé. Un annulé reste à sa place dans le temps. */
export function rangeSesRendezVous<T extends RdvDeLaListe>(rdvs: readonly T[], aujourdhui: string): { aVenir: T[]; passes: T[] } {
  const aVenir = rdvs.filter((a) => a.date > aujourdhui || (a.date === aujourdhui && a.status !== 'honoré'))
    .sort((a, b) => a.date.localeCompare(b.date) || minutes(a.time) - minutes(b.time));
  const passes = rdvs.filter((a) => !aVenir.includes(a))
    .sort((a, b) => b.date.localeCompare(a.date) || minutes(b.time) - minutes(a.time));
  return { aVenir, passes };
}

/** LES TOTAUX : combien, combien d'honorés et d'annulés, ce que valent les
    honorés, et ce qui reste à régler sur tous ceux qui ne sont pas annulés. */
export function totauxDeSesRendezVous<T extends RdvDeLaListe>(
  rdvs: readonly T[],
  netDe: (a: T) => number,
  resteDe: (a: T) => number,
): { nombre: number; honores: number; annules: number; honoresXof: number; resteXof: number } {
  const honores = rdvs.filter((a) => a.status === 'honoré');
  return {
    nombre: rdvs.length,
    honores: honores.length,
    annules: rdvs.filter((a) => a.status === 'annulé').length,
    honoresXof: honores.reduce((s, a) => s + Math.max(0, netDe(a)), 0),
    resteXof: rdvs.filter((a) => a.status !== 'annulé').reduce((s, a) => s + Math.max(0, resteDe(a)), 0),
  };
}
