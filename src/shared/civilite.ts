/* ══ MADAME NAFFI — 2 octobre 2026 ═══════════════════════════════════════
   « Comment distinguer un Mr et une Mme et ajouter un préfixe devant le
   prénom des clients ? » (Yéman). Arbitrages tranchés au sélecteur :

     · la Maison écrit « Madame Naffi » : la civilité, puis le prénom ;
     · trois civilités sur la fiche : Madame, Mademoiselle, Monsieur ;
     · une fiche qui ne dit rien est une dame, comme pour les cartes (presque
       toutes les têtes de la Maison le sont) ;
     · la civilité vit dans les messages WhatsApp automatiques et dans ceux
       qu'on écrit depuis le Trône, pas sur les factures ni dans Ma Couronne.

   LA CIVILITÉ PREND LA SUITE DE `auMasculin`, qui ne servait qu'aux cartes :
   une fiche marquée au masculin avant ce jour est « Monsieur », et poser
   « Monsieur » remarque la fiche au masculin, pour que les cartes suivent.

   Les fonctions Edge recopient `appelDe` (elles ne lisent rien du dépôt) ;
   `verifie-civilite` tient les copies à l'identique. Pur. */

export type Civilite = 'madame' | 'mademoiselle' | 'monsieur';

export const CIVILITES: readonly { cle: Civilite; dit: string }[] = [
  { cle: 'madame', dit: 'Madame' },
  { cle: 'mademoiselle', dit: 'Mademoiselle' },
  { cle: 'monsieur', dit: 'Monsieur' },
];

const DIT: Record<Civilite, string> = { madame: 'Madame', mademoiselle: 'Mademoiselle', monsieur: 'Monsieur' };
/** Devant le prénom, dans les messages. */
export const ABREGE: Record<Civilite, string> = { madame: 'Mme', mademoiselle: 'Mlle', monsieur: 'M.' };

type Porteur = { name?: string | null; prenomUsage?: string | null; civilite?: Civilite; auMasculin?: boolean } | null | undefined;

/** La civilité d'une fiche. Rien de dit : Madame. */
export const civiliteDe = (c: Porteur): Civilite =>
  (c?.civilite && DIT[c.civilite] ? c.civilite : c?.auMasculin ? 'monsieur' : 'madame');

/** Le premier mot du nom. Il reste celui de l'ÉQUIPE (maîtres, caissières,
    paie) ; une cliente s'appelle par son prénom d'usage (`prenomDUsage`). */
export const prenomSeul = (nom: string | null | undefined): string => (nom ?? '').trim().split(/\s+/)[0] ?? '';

/* ══ LE PRÉNOM COMPOSÉ — 7 novembre 2026 ═════════════════════════════════
   « Les clientes comme Anne-Marie, comme Marie Gisèle, qui ont un prénom
   composé : c'est important que, quand on leur écrit, on écrive toujours,
   dans leur rendez-vous et dans leur messagerie WhatsApp, tout le prénom
   composé » (Yéman). Au sélecteur : DEVINÉ, CORRIGEABLE. Le Trône devine le
   prénom d'usage ; le champ « Prénom d'usage » de la fiche le corrige.

   LA RÈGLE, une seule :
     1. le prénom d'usage noté sur la fiche fait foi ;
     2. sinon le nom se lit, espaces réduits, « X - Y » recollé en « X-Y » ;
     3. un mot tout en capitales après le premier est le NOM : le prénom est
        tout ce qui le précède (« Awa Reine KOSSI » donne « Awa Reine ») ;
     4. sinon, un nom de trois mots ou plus qui commence par un prénom qui se
        compose (la liste ci-dessous) : les deux premiers mots (« Marie
        claude Dossou » donne « Marie Claude ») ;
     5. sinon le premier mot, comme avant.
   Rien ne change dans le nom, ni accent ni casse : seule la capitale d'un
   second prénom écrit en minuscules est posée. Une particule (« de », « da »,
   « d' ») est au nom de famille, jamais un second prénom.

   Le bloc entre ses repères se recopie TEL QUEL dans les fonctions Edge
   (elles ne lisent rien du dépôt) : verifie-le-prenom-d-usage et le banc des
   douze lunes tiennent les copies, caractère pour caractère. Il n'a donc
   ni `import` ni `export` dedans (des bancs rejouent les fonctions par
   `new Function`) : ses trois noms s'exportent juste après lui. */
/* ⟨prenom-d-usage⟩ */
/** LES PRÉNOMS QUI SE COMPOSENT (liste du 7 novembre 2026) : en tête d'un nom
    de trois mots ou plus sans NOM en capitales, ils prennent le mot suivant. */
const PRENOMS_QUI_SE_COMPOSENT: readonly string[] = ['Marie', 'Anne', 'Jean', 'Paul', 'Pierre', 'Louis'];
/** Les particules d'un nom de famille : « de », « da », « d'Agbo »… */
const PARTICULE_DU_NOM = /^(?:de|da|do|dos|das|du|des|di|del|della|van|von|le|la|d['’]\S*)$/i;
/** Un mot tout en capitales : au moins deux lettres, accents compris, l'apostrophe et le trait d'union admis. */
const motEnCapitales = (m: string): boolean => /^[\p{Lu}'’-]+$/u.test(m) && (m.match(/\p{Lu}/gu) ?? []).length >= 2;
/** La capitale d'un second prénom écrit en minuscules ; rien d'autre ne bouge. */
const capitaleDuSecond = (m: string): string => (/^\p{Ll}/u.test(m) ? `${m.charAt(0).toUpperCase()}${m.slice(1)}` : m);

/** LE PRÉNOM QUE LE TRÔNE DEVINE d'un nom complet (les règles 2 à 5). Le
    trait d'union se recolle dans le prénom, jamais vers un NOM en capitales
    (« Awa - KOSSI » reste deux mots). */
const prenomDevine = (nom: unknown): string => {
  const mots = String(nom ?? '').trim().replace(/\s+/g, ' ')
    .replace(/(\S+) ?- ?(?=(\S+))/g, (tout: string, g: string, d: string) => (motEnCapitales(g) || motEnCapitales(d) ? tout : `${g}-`))
    .split(' ').filter(Boolean);
  if (mots.length === 0) return '';
  const nomDeFamille = mots.findIndex((m, i) => i > 0 && motEnCapitales(m));
  if (nomDeFamille > 0) {
    const fin = mots.findIndex((m, i) => i > 0 && (i >= nomDeFamille || !/^\p{L}/u.test(m)));
    const prenoms = mots.slice(0, fin);
    while (prenoms.length > 1 && PARTICULE_DU_NOM.test(prenoms[prenoms.length - 1])) prenoms.pop();
    return prenoms.map((m, i) => (i > 0 && !PARTICULE_DU_NOM.test(m) ? capitaleDuSecond(m) : m)).join(' ');
  }
  const premier = mots[0].toLowerCase();
  const second = mots[1] ?? '';
  if (mots.length >= 3 && PRENOMS_QUI_SE_COMPOSENT.some((p) => p.toLowerCase() === premier) && /^\p{L}/u.test(second) && !PARTICULE_DU_NOM.test(second)) {
    return `${mots[0]} ${capitaleDuSecond(second)}`;
  }
  return mots[0];
};

/** LE PRÉNOM D'USAGE d'une cliente : celui de sa fiche, sinon celui que le
    Trône devine de son nom. `repli` sert quand la fiche manque mais qu'un nom
    est connu ailleurs (le rendez-vous, la demande du site). */
const prenomDUsage = (c: { name?: unknown; prenomUsage?: unknown } | null | undefined, repli?: unknown): string => {
  const note = String(c?.prenomUsage ?? '').trim().replace(/\s+/g, ' ');
  return note || prenomDevine(c?.name ?? repli);
};
/* ⟨/prenom-d-usage⟩ */
export { PRENOMS_QUI_SE_COMPOSENT, prenomDevine, prenomDUsage };

/** COMMENT LA MAISON S'ADRESSE À ELLE : « Madame Naffi ». Sans nom, la
    civilité seule, jamais un blanc. `repli` sert quand la fiche manque mais
    qu'un nom est connu ailleurs (le rendez-vous, la demande du site).

    LA CIVILITÉ INCONNUE NE SE SUPPOSE PLUS (13 octobre 2026) : « revoir la
    dénomination des clients », un monsieur recevait « Madame » (Yéman,
    au sélecteur : le prénom seul quand la civilité est inconnue). Une
    fiche muette dit « Ola » ; rien de connu du tout, « Madame, Monsieur ».
    `civiliteDe` garde Madame pour les cartes, qui veulent un genre.

    ABRÉGÉE DEVANT LE PRÉNOM (28 octobre 2026, Yéman au sélecteur : « dire
    Mr ou Mme avant le prénom ») : « M. Jean-Luc », « Mme Shadé »,
    « Mlle Grace ». Seule, sans prénom, elle s'écrit en entier : « Bonjour
    Madame ».

    TOUT LE PRÉNOM COMPOSÉ (7 novembre 2026) : « Mme Anne Marie », jamais
    « Mme Anne » (`prenomDUsage`). */
export const appelDe = (c: Porteur, repli?: string | null): string => {
  const prenom = prenomDUsage(c, repli);
  const connue = (!!c?.civilite && !!DIT[c.civilite]) || !!c?.auMasculin;
  if (!connue) return prenom || 'Madame, Monsieur';
  const civ = civiliteDe(c);
  return prenom ? `${ABREGE[civ]} ${prenom}` : DIT[civ];
};

/** LA CIVILITÉ NOTÉE, ou rien : jamais le Madame des cartes. Ce que les
    boutons d'une fiche montrent allumé. */
export const civiliteNotee = (c: Porteur): Civilite | undefined =>
  (c?.civilite && DIT[c.civilite] ? c.civilite : c?.auMasculin ? 'monsieur' : undefined);

/** UNE FICHE MUETTE : rien de noté, ses messages disent le prénom seul. */
export const estMuette = (c: Porteur): boolean => !civiliteNotee(c);

/** LES CIVILITÉS À POSER (28 octobre 2026) : les fiches données, dans
    l'ordre du tri. Un rendez-vous à venir d'abord, le plus proche en tête
    (l'Assistant lui écrit bientôt) ; puis la venue la plus récente ; puis le
    nom. `avecNumero` : seulement celles qu'un message peut joindre. */
export function civilitesAPoser<C extends { id: string; name?: string | null; phone?: string | null }>(o: {
  fiches: readonly C[];
  prochainRdv: ReadonlyMap<string, string>;
  derniereVenue: ReadonlyMap<string, string>;
  avecNumero: boolean;
}): C[] {
  return o.fiches
    .filter((c) => !o.avecNumero || !!c.phone?.trim())
    .slice()
    .sort((a, b) => {
      const ra = o.prochainRdv.get(a.id); const rb = o.prochainRdv.get(b.id);
      if (ra && rb && ra !== rb) return ra.localeCompare(rb);
      if (!!ra !== !!rb) return ra ? -1 : 1;
      const va = o.derniereVenue.get(a.id) ?? ''; const vb = o.derniereVenue.get(b.id) ?? '';
      if (va !== vb) return vb.localeCompare(va);
      return (a.name ?? '').localeCompare(b.name ?? '', 'fr');
    });
}

/** Ce qu'on écrit sur la fiche quand la main choisit une civilité : les
    cartes, qui lisent `auMasculin`, suivent du même geste. */
export const ficheAvecCivilite = (civ: Civilite): { civilite: Civilite; auMasculin: true | undefined } =>
  ({ civilite: civ, auMasculin: civ === 'monsieur' ? true : undefined });
