/* ── UNE FORMULE SE LIT GESTE PAR GESTE — 7 octobre 2026 ───────────────
   « Sur la page Que fait-on ? pas très clair sur les sélections. On doit
   comprendre que ces 3 choix distincts se composent d'un KLƆKLƆ et d'un
   SÍNSIN, sinon les 3 mélangés disent la même chose » (Yéman). Au sélecteur :
   « Un geste par ligne ». Chaque carte dit un titre en clair, puis chaque
   geste sur sa ligne : la famille de la Maison, son niveau (Essentiel,
   Élaboré), le geste. Sans magasin : le harnais le lit tel quel.

   Un nom du catalogue s'écrit « FAMILLE™ Niveau · Le geste ». Un nom qui ne
   suit pas cette forme reste entier, dans la colonne du geste. */

export type PartsDuGeste = { famille: string; niveau: string; geste: string };

export function lesPartsDuGeste(nom: string): PartsDuGeste {
  const i = nom.indexOf(' · ');
  if (i < 0) return { famille: '', niveau: '', geste: nom.trim() };
  const tete = nom.slice(0, i).trim();
  const geste = nom.slice(i + 3).trim();
  const j = tete.indexOf('™');
  return j >= 0
    ? { famille: tete.slice(0, j + 1).trim(), niveau: tete.slice(j + 1).trim(), geste }
    : { famille: tete, niveau: '', geste };
}

/** Le geste en mots simples : sans le nom entre guillemets, sans article.
    « Le Shampoing « Le Souffle » » → « Shampoing ». Vide si rien ne reste. */
export function leGesteEnClair(geste: string): string {
  return geste
    .replace(/«[^»]*»/g, ' ')
    .replace(/^\s*(Le|La|Les|L['’])\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Le titre de la carte : les gestes en clair, reliés par « + ».
    `repli` (le nom de la famille au catalogue) sert quand le geste ne dit
    rien une fois nettoyé. */
export function leTitreEnClair(gestes: readonly { geste: string; repli?: string }[]): string {
  const mots = gestes
    .map((g) => leGesteEnClair(g.geste) || leGesteEnClair(g.repli ?? ''))
    .filter(Boolean)
    .map((m) => m.toLocaleLowerCase('fr'));
  if (mots.length === 0) return '';
  const tout = mots.join(' + ');
  return tout.charAt(0).toLocaleUpperCase('fr') + tout.slice(1);
}
