/* LE REGISTRE DE LA MAISON — 10 octobre 2026.

   L'établissement « MAISON MND » est immatriculé le 9 octobre 2026 au greffe
   du tribunal de commerce de Cotonou (entreprise individuelle) ; « Maison
   MND » y est à la fois l'enseigne et le nom commercial. Le 10, feu vert de
   la direction pour que les documents de la Maison portent CE registre, puis
   la précision : « juste Maison MND ». La Maison se nomme donc SEULE : ni
   « ETS de … », ni exploitant, ni prénom. Aucun texte d'IDENTITÉ de la
   Maison (raison, en-têtes, cachet, factures, mentions légales, fiche
   JSON-LD qui porterait le registre) ne nomme une personne ; le récit de la
   marque, lui, nomme ses fondateurs, et ces deux textes ne se croisent pas
   (relecture du 10 octobre : la fiche JSON-LD ne porte donc ni RCCM ni IFU,
   elle qui nomme les fondateurs).

   ACIA 1 reste un AUTRE établissement, qui existe toujours : il demeure
   l'employeur de l'équipe tant que le comptable n'a rien décidé, et l'entité
   ACIA 1 du Secrétariat. Ses numéros ne bougent pas.

   Module PUR (ni magasin, ni synchro) : le site, le Secrétariat, l'identité
   du Trône et les harnais le lisent tous. Une seule source. */

export const REGISTRE_MAISON_MND = {
  nom: 'Maison MND',
  forme: 'entreprise individuelle',
  rccm: 'RB/COT/26 A 120676',
  ifu: '1 2010 0097 2809',
  greffe: 'Cotonou',
} as const;

/** La ligne légale des documents de la Maison depuis la bascule. */
export const RAISON_MAISON_MND = 'Maison MND · RCCM RB/COT/26 A 120676 · IFU 1 2010 0097 2809';

/** L'ancienne raison, figée : celle de l'employeur, et celle des documents
    datés d'avant la bascule. */
export const RAISON_ACIA_1 = 'ACIA 1 · RCCM RB/COT/12 A 14509';

/** Premier jour où les documents de la Maison portent son propre registre.
    Une facture ou un accord daté d'AVANT se réimprime avec ACIA 1, comme le
    jour où il a été remis. À reporter au jour de la mise en ligne si elle
    tombe plus tard (point à trancher du 10 octobre). */
export const BASCULE_DE_L_IDENTITE = '2026-10-10';

/** « Maison MND · RCCM … · IFU … » → { nom: 'Maison MND', legales: 'RCCM … · IFU …' }.
    Le premier morceau est le nom ; le reste, tel quel, fait la ligne légale. */
export function morceauxDeLaRaison(raison: string): { nom: string; legales: string } {
  const morceaux = (raison ?? '').split('·').map((m) => m.trim()).filter(Boolean);
  return { nom: morceaux[0] ?? '', legales: morceaux.slice(1).join(' · ') };
}

/** La ligne légale posée SOUS une ligne qui nomme déjà la Maison (le pied
    d'une facture PDF : « Maison MND · <devise> » juste dessous). Quand la
    raison commence par ce nom, il ne se répète pas : « RCCM … · IFU … ».
    Une raison qui nomme un autre établissement s'écrit entière (relecture du
    10 octobre 2026 : deux lignes de suite commençaient par « Maison MND · »). */
export function ligneLegaleSousLeNom(raison: string, nom: string): string {
  const r = (raison ?? '').trim();
  const { nom: premier, legales } = morceauxDeLaRaison(r);
  return premier.toLowerCase() === (nom ?? '').trim().toLowerCase() && legales ? legales : r;
}

/** « Entre <ceci>, ci-après « la Maison » » : le nom, puis la raison entre
    parenthèses. Quand la raison COMMENCE par le nom (« Maison MND · RCCM … »),
    le nom ne se répète pas : « Maison MND (RCCM … · IFU …) ». Une raison qui
    nomme un autre établissement (« ACIA 1 · RCCM … ») s'écrit entière, comme
    avant le 10 octobre. */
export function laMaisonEtSaRaison(maison: string, raison: string | undefined): string {
  const r = (raison ?? '').trim();
  if (!r) return maison;
  const { nom, legales } = morceauxDeLaRaison(r);
  if (nom.toLowerCase() === maison.trim().toLowerCase()) return legales ? `${maison} (${legales})` : maison;
  return `${maison} (${r})`;
}
