/* Finances — petits utilitaires de dates & de mois partagés par les trois écrans. */

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Clé mois `AAAA-MM` d'une date ISO. */
export const monthKey = (iso: string): string => iso.slice(0, 7);

/** Nom du mois en toutes lettres, ex. « juin ». */
export const monthLabel = (mk: string): string =>
  new Date(`${mk}-15T00:00:00`).toLocaleDateString('fr-FR', { month: 'long' });

/** Décale une clé mois de `delta` mois. */
export const shiftMonth = (mk: string, delta: number): string => {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Les `n` derniers mois jusqu'à `mk` inclus, du plus ancien au plus récent. */
export const lastMonths = (mk: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => shiftMonth(mk, -(n - 1 - i)));

/** Rythme du mois × jours du mois — prévision simple, comme sur les prototypes. */
export const paceForecast = (soFar: number, dayOfMonth: number, daysInMonth: number): number =>
  Math.round((soFar / Math.max(1, dayOfMonth)) * daysInMonth);
