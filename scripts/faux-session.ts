/* LA SESSION D'UN ONGLET (`sessionStorage`) et son rechargement — pour le
   banc de l'onglet unique (20 novembre 2026). À importer AVANT tout module de
   la Maison : `onglet-actif.ts` lit la pause au chargement.
   `FAUX_PAUSE=1` : l'onglet démarre déjà en pause (rechargé en pause). */
const m = new Map<string, string>(process.env.FAUX_PAUSE === '1' ? [['trone::mnd_onglet_en_pause', '1']] : []);
const g = globalThis as Record<string, unknown>;
g.sessionStorage = {
  getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
  setItem: (k: string, v: string) => { m.set(k, String(v)); },
  removeItem: (k: string) => { m.delete(k); },
};
export const rechargements = { n: 0 };
export const laSession = m;
const w = g.window as { location: Record<string, unknown> } | undefined;
if (w) w.location.reload = () => { rechargements.n += 1; };
