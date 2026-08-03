/* Finances — utilitaires de dates & de mois, navigation mensuelle et export CSV,
   partagés par les trois écrans. */

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Clé mois `AAAA-MM` d'une date ISO. */
export const monthKey = (iso: string): string => iso.slice(0, 7);

/** Nom du mois en toutes lettres, ex. « juin ». */
export const monthLabel = (mk: string): string =>
  new Date(`${mk}-15T00:00:00`).toLocaleDateString('fr-FR', { month: 'long' });

/** Nom court du mois, ex. « juil. » — pour les axes de graphe. */
export const monthShort = (mk: string): string =>
  new Date(`${mk}-15T00:00:00`).toLocaleDateString('fr-FR', { month: 'short' });

/** « juillet 2026 » — titre du mois pour la navigation. */
export const monthTitle = (mk: string): string =>
  new Date(`${mk}-15T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

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

/* ---------- Export CSV ---------- */

/** Télécharge des lignes en CSV « Excel-FR » : point-virgule, BOM UTF-8, CRLF. */
export const downloadCsv = (filename: string, rows: (string | number)[][]): void => {
  const esc = (v: string | number) => {
    let s = String(v);
    /* NEUTRALISER LES FORMULES. Excel et LibreOffice exécutent toute cellule qui
       commence par = + - @ ou une tabulation. Ces exports embarquent du texte
       libre — nom de cliente, libellé de dépense, référence — donc une fiche
       nommée « =HYPERLINK(...) » s'exécutait à l'ouverture du fichier chez qui
       le recevait. L'apostrophe de tête est la convention du tableur : elle
       force le texte et ne s'affiche pas dans la cellule. */
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/* ---------- Navigation ‹ mois › ---------- */

/** Sélecteur de mois partagé — Synthèse & Dépenses. Retour rapide au mois courant. */
export function MonthNav({ month, onChange }: { month: string; onChange: (mk: string) => void }) {
  const current = monthKey(todayISO());
  return (
    <div className="trf-monthnav" role="group" aria-label="Choisir le mois">
      <button className="trf-monthnav__btn" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mois précédent">‹</button>
      <span className="trf-monthnav__label">{monthTitle(month)}</span>
      <button className="trf-monthnav__btn" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Mois suivant">›</button>
      {month !== current && (
        <button className="trf-monthnav__today" onClick={() => onChange(current)}>Ce mois</button>
      )}
    </div>
  );
}
