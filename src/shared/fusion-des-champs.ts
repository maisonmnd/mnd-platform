/* ══ DEUX POSTES SUR LA MÊME FICHE — 20 novembre 2026 ══════════════════════
   « Corrige le problème des deux postes » (Yéman).

   CE QUI S'EST PASSÉ. Le 20 novembre, de 14 h 18 à 14 h 21, Yéman corrige
   sur son téléphone le nom et l'anniversaire d'une cliente ; sur le Mac du
   comptoir, le Trône porte encore la fiche d'avant, et Brice y fait signer
   l'autorisation de droit à l'image. Le Mac renvoie la fiche ENTIÈRE, sa
   copie d'avant : le nom et l'anniversaire reculent, puis reviennent, puis
   reculent encore, cinq écritures en deux minutes. L'état final était juste
   par chance.

   LA CAUSE. La synchronisation pesait la ligne entière : « le dernier geste
   gagne », et il gagnait TOUT, y compris les champs qu'il n'avait pas
   touchés. Une signature effaçait un nom.

   LA RÈGLE, À TROIS VOIES. Pour chaque champ (premier niveau de `data`), on
   compare trois versions : la BASE (ce que le poste savait du serveur quand
   il a fait son geste), la NÔTRE (le poste après son geste), la LEUR (le
   serveur maintenant).
     · le champ que nous avons changé prend notre valeur ;
     · celui que nous n'avons pas touché prend la leur ;
     · touché des deux côtés vers deux valeurs différentes, c'est une DISPUTE :
       le geste le plus récent la gagne, et le perdant est gardé en conflit,
       comme avant — mais pour ce champ seulement.
   Deux postes qui touchent deux champs différents de la même fiche ne se
   marchent donc plus dessus. Ce module est pur : `verifie-les-deux-postes`
   l'éprouve, et la synchronisation l'appelle. */

type Objet = Record<string, unknown>;

const estObjet = (x: unknown): x is Objet => !!x && typeof x === 'object' && !Array.isArray(x);

/** Une valeur comparable : les clés rangées, à toute profondeur — jsonb rend
    les champs dans un autre ordre que le téléphone. `undefined` = absent. */
const canonique = (v: unknown): string => (v === undefined ? '\u0000absent' : JSON.stringify(v, (_k, x) =>
  (estObjet(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x)));

export type FusionDesChamps<T> = {
  /** La ligne fusionnée. */
  ligne: T;
  /** Les champs touchés des deux côtés, vers deux valeurs différentes. */
  disputes: string[];
  /** Parmi eux, ceux où NOTRE valeur a perdu (gardée en conflit par l'appelant). */
  perdus: string[];
};

/**
 * Fusionne champ par champ ce que NOUS avons changé depuis `base` sur ce que
 * le serveur porte (`leur`). Sans base ou sans leur ligne (ligne neuve,
 * supprimée ailleurs, forme inattendue), rien ne se fusionne : notre ligne
 * part telle quelle, comme avant.
 * `leurGagneLesDisputes` : leur écriture est plus récente que notre geste.
 */
export function fusionneLesChamps<T>(base: unknown, notre: T, leur: unknown, leurGagneLesDisputes = false): FusionDesChamps<T> {
  if (!estObjet(base) || !estObjet(notre) || !estObjet(leur)) return { ligne: notre, disputes: [], perdus: [] };
  const cles = new Set([...Object.keys(base), ...Object.keys(notre), ...Object.keys(leur)]);
  const ligne: Objet = {};
  const disputes: string[] = [];
  const perdus: string[] = [];
  for (const k of cles) {
    const b = canonique(base[k]);
    const n = canonique(notre[k]);
    const l = canonique(leur[k]);
    const nousAvonsChange = n !== b;
    const ilsOntChange = l !== b;
    let prend: 'notre' | 'leur';
    if (nousAvonsChange && ilsOntChange && n !== l) {
      disputes.push(k);
      prend = leurGagneLesDisputes ? 'leur' : 'notre';
      if (leurGagneLesDisputes) perdus.push(k);
    } else {
      prend = nousAvonsChange ? 'notre' : 'leur';
    }
    const v = prend === 'notre' ? notre[k] : leur[k];
    if (v !== undefined) ligne[k] = v;
  }
  /* L'ordre des champs suit le nôtre, puis les nouveaux : l'écran ne
     redessine pas une fiche pour un ordre. */
  const rangee: Objet = {};
  for (const k of Object.keys(notre)) if (k in ligne) rangee[k] = ligne[k];
  for (const k of Object.keys(ligne)) if (!(k in rangee)) rangee[k] = ligne[k];
  return { ligne: rangee as T, disputes: disputes.sort(), perdus: perdus.sort() };
}

/** La ligne `ligne` portant NOS valeurs sur `cles` : ce qu'on garde en conflit
    quand une dispute est perdue, pour que le panneau ne montre que ces champs. */
export function avecNosChamps<T>(ligne: T, notre: T, cles: readonly string[]): T {
  if (!estObjet(ligne) || !estObjet(notre)) return notre;
  const r: Objet = { ...ligne };
  for (const k of cles) {
    if (notre[k] === undefined) delete r[k];
    else r[k] = notre[k];
  }
  return r as T;
}

/** Deux lignes portent le même contenu, champs rangés autrement. */
export const memeLigne = (a: unknown, b: unknown): boolean => canonique(a) === canonique(b);
