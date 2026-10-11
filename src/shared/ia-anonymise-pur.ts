/* CE QUI SORT DU TRÔNE VERS CLAUDE — 11 octobre 2026.

   Choix de Yéman au sélecteur : « Jamais : prénoms et initiales seulement ».
   Aucun numéro, aucune adresse e-mail, aucun nom complet de cliente ne part
   chez Anthropic. Une cliente se dit « Awa D. », jamais « Awa Dossou ».

   DEUX BARRIÈRES. Le Trône passe chaque texte ici avant l'envoi, avec la
   liste des clientes qu'il connaît (lui seul a les noms). La fonction
   `centre-de-commande` repasse ce qu'elle reçoit et ce qu'elle lit dans la
   base par `sansCoordonnees`, en copie entre ses repères : un numéro glissé
   par erreur ne part pas.

   MODULE PUR. */

/** Un numéro de téléphone : huit chiffres ou plus, avec ou sans indicatif,
    espaces, points ou tirets entre les groupes. Les montants et les dates du
    Trône (« 33 000 F », « 2026-10-11 ») ne sont pas des numéros : huit
    chiffres au moins, et pas de forme de date. */
const TELEPHONE = /(?:\+|00)?\d(?:[\s.\-]?\d){7,}/g;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const COURRIEL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

/** Les coordonnées retirées : chaque numéro devient « [numéro] », chaque
    adresse « [adresse] ». Le reste du texte ne bouge pas. */
export function sansCoordonnees(texte: string): string {
  return String(texte ?? '')
    .replace(COURRIEL, '[adresse]')
    .replace(TELEPHONE, (m) => (DATE_ISO.test(m.trim()) ? m : '[numéro]'));
}

export type Personne = { prenom?: string; nom?: string };

const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** « Awa D. » : le prénom, l'initiale du nom. Sans prénom, les initiales. */
export function prenomEtInitiale(p: Personne): string {
  const prenom = (p.prenom ?? '').trim();
  const nom = (p.nom ?? '').trim();
  const initiale = nom ? `${nom.charAt(0).toLocaleUpperCase('fr')}.` : '';
  if (prenom) return initiale ? `${prenom} ${initiale}` : prenom;
  return initiale;
}

/** Chaque nom complet connu devient prénom et initiale, dans les deux ordres
    où on l'écrit (« Awa Dossou », « DOSSOU Awa »), sans tenir compte de la
    casse. Les noms les plus longs passent d'abord, pour qu'un nom composé ne
    soit pas coupé par un plus court. */
export function nomsEnInitiales(texte: string, personnes: readonly Personne[]): string {
  let t = String(texte ?? '');
  const formes = personnes
    .filter((p) => (p.nom ?? '').trim().length > 1)
    .flatMap((p) => {
      const prenom = (p.prenom ?? '').trim();
      const nom = (p.nom ?? '').trim();
      const court = prenomEtInitiale(p);
      return prenom
        ? [{ motif: `${prenom} ${nom}`, court }, { motif: `${nom} ${prenom}`, court }]
        : [{ motif: nom, court }];
    })
    .sort((a, b) => b.motif.length - a.motif.length);
  for (const f of formes) {
    t = t.replace(new RegExp(`(^|[^\\p{L}])${echappe(f.motif)}(?=$|[^\\p{L}])`, 'giu'), (_m, avant: string) => `${avant}${f.court}`);
  }
  return t;
}

/** Les deux barrières à la fois, dans l'ordre : les noms, puis les numéros. */
export const pourClaude = (texte: string, personnes: readonly Personne[] = []): string =>
  sansCoordonnees(nomsEnInitiales(texte, personnes));

/** Un objet entier, champ par champ (les clés ne changent pas). */
export function objetPourClaude<T>(valeur: T, personnes: readonly Personne[] = []): T {
  if (typeof valeur === 'string') return pourClaude(valeur, personnes) as unknown as T;
  if (Array.isArray(valeur)) return valeur.map((v) => objetPourClaude(v, personnes)) as unknown as T;
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur as Record<string, unknown>).map(([k, v]) => [k, objetPourClaude(v, personnes)])) as T;
  }
  return valeur;
}
