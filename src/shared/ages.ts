import { ageDe, AGE_MND_KIDS } from './accounts';

/* ══ QUAND L'ÂGE LU CONTREDIT L'HISTOIRE — 11 septembre 2026 ════════

   « Construire un relevé des fiches dont l'âge lu contredit leur histoire »
   (Yéman), après la nuit passée à chercher pourquoi une tête de 358 locks ne
   voyait que la section enfants.

   UNE DATE DE NAISSANCE FAUSSE NE SE VOIT NULLE PART. Elle ne fait pas de
   bruit, elle ne casse rien à l'écran : elle change silencieusement le
   catalogue qu'on propose, le tarif qu'on annonce, la remise du foyer, et
   l'on cherche la panne ailleurs pendant des semaines. Le carnet, lui, SAIT :
   personne ne s'assied au fauteuil avant d'être né.

   DEUX GRADES, ET ILS NE SE MÉLANGENT PAS. Les rassembler en un seul tas
   ferait exactement le tort qu'on veut éviter : une liste où le certain et
   le douteux se ressemblent ne se lit pas deux fois.

   · UNE CERTITUDE est un fait IMPOSSIBLE. Née demain, venue avant sa
     naissance, couronnée avant d'exister. Aucun jugement là-dedans : la date
     est fausse, point. On peut la corriger sans réfléchir.

   · UN DOUTE est une invraisemblance. Trois ans au premier rituel, un foyer
     réglé de sa poche, une tête plus fournie qu'une tête d'enfant. Chacun a
     sa contre-histoire possible, et c'est la Maison qui tranche, pas moi.

   LES SEUILS SONT LES MIENS, ET LE RELEVÉ LE DIT. Personne n'a jamais décidé
   à MND qu'un enfant ne s'assied pas avant trois ans, ni au-delà de combien
   de locks une tête cesse d'être une tête d'enfant. Je les pose ici, en un
   seul endroit, pour qu'ils se discutent au lieu de se cacher. */

/** L'âge en dessous duquel une venue au fauteuil n'est pas croyable.
    MON NOMBRE, pas celui de la Maison : à trancher. */
export const AGE_MINIMAL_AU_FAUTEUIL = 3;

/** Le nombre de locks au-delà duquel une tête cesse de ressembler à une tête
    d'enfant. MON NOMBRE aussi, repris du palier haut du barème Kids : il n'a
    jamais été posé comme une limite d'âge, seulement comme un palier de prix. */
export const LOCKS_AU_DELA_DUN_ENFANT = 250;

export type RaisonDeDoute =
  /* ── Les certitudes ── */
  | 'anniversaire-futur'
  | 'venue-avant-naissance'
  | 'couronne-avant-naissance'
  /* ── Les doutes ── */
  | 'enfant-au-fauteuil'
  | 'paye-un-foyer'
  | 'tete-fournie';

export const CERTITUDES: readonly RaisonDeDoute[] = [
  'anniversaire-futur', 'venue-avant-naissance', 'couronne-avant-naissance',
];

/** CE QUE CHAQUE RAISON DIT, EN CLAIR. L'écran lit ces phrases, il n'en
    invente pas : un relevé qui nomme ses raisons se corrige, un relevé qui
    affiche « anomalie » se referme. */
export const DIT: Record<RaisonDeDoute, string> = {
  'anniversaire-futur': 'sa date de naissance est dans le futur',
  'venue-avant-naissance': 'elle s’est assise avant d’être née',
  'couronne-avant-naissance': 'sa couronne date d’avant sa naissance',
  'enfant-au-fauteuil': `elle aurait eu moins de ${AGE_MINIMAL_AU_FAUTEUIL} ans à sa première venue`,
  'paye-un-foyer': 'elle règle pour un foyer entier',
  'tete-fournie': `sa tête porte plus de ${LOCKS_AU_DELA_DUN_ENFANT} locks`,
};

export type FicheLue = {
  id: string;
  branchId: string;
  name: string;
  birthday?: string;
  lockCount?: number;
  crownSince?: string;
  archived?: boolean;
};

export type RituelLu = { clientId: string; date: string; status: string };
export type FoyerLu = { payerClientId?: string };

export type FicheContredite = {
  clientId: string;
  nom: string;
  birthday: string;
  /** L'âge que la fiche fait lire aujourd'hui. Négatif si elle naît demain. */
  age: number;
  raisons: RaisonDeDoute[];
  /** Au moins une raison est un fait impossible : la date est fausse, sans discussion. */
  certain: boolean;
  /** ELLE EST EN PLUS LUE MND KIDS — son catalogue est réduit AUJOURD'HUI, au
      comptoir comme sur Ma Couronne. Ce sont celles-là qu'il faut corriger
      d'abord : les autres portent une date fausse sans conséquence visible. */
  bloqueLeCatalogue: boolean;
};

/** LE RELEVÉ — pur, et éprouvé par `verifie-ages`.

    UNE FICHE SANS DATE N'EST PAS UNE FICHE FAUSSE : elle est muette, et la
    Maison a déjà une liste pour ce qui manque. Ici on ne juge QUE ce qui est
    écrit. Confondre l'absence et l'erreur remplirait le relevé de cent fiches
    vides, et les vraies fautes s'y perdraient. */
export function contradictionsDeLAge(
  clients: readonly FicheLue[],
  rituels: readonly RituelLu[],
  foyers: readonly FoyerLu[],
  aujourdhui: string,
  branchId?: string,
): FicheContredite[] {
  /* La première venue honorée de chaque tête, en une passe. */
  const premiere = new Map<string, string>();
  for (const r of rituels) {
    if (r.status !== 'honoré' || !r.clientId) continue;
    const d = premiere.get(r.clientId);
    if (!d || r.date < d) premiere.set(r.clientId, r.date);
  }
  const payeurs = new Set(foyers.map((f) => f.payerClientId).filter(Boolean) as string[]);

  const sortie: FicheContredite[] = [];
  for (const c of clients) {
    if (c.archived) continue;
    if (branchId && c.branchId !== branchId) continue;
    if (!c.birthday) continue;                       // muette, pas fausse
    const age = ageDe(c.birthday, aujourdhui);
    if (age === undefined) continue;                 // date illisible : ce n'est pas un âge

    const raisons: RaisonDeDoute[] = [];
    if (c.birthday > aujourdhui) raisons.push('anniversaire-futur');

    const d1 = premiere.get(c.id);
    if (d1 && d1 < c.birthday) raisons.push('venue-avant-naissance');
    else if (d1) {
      /* SEULEMENT SI ELLE EST NÉE AVANT : autrement la venue avant naissance
         est déjà dite, et répéter la même faute sous deux noms ferait croire
         à deux problèmes. */
      const aLaPremiere = ageDe(c.birthday, d1);
      if (aLaPremiere !== undefined && aLaPremiere < AGE_MINIMAL_AU_FAUTEUIL) {
        raisons.push('enfant-au-fauteuil');
      }
    }

    if (c.crownSince && c.crownSince < c.birthday) raisons.push('couronne-avant-naissance');
    /* CES DEUX-LÀ NE SE DISENT QUE D'UNE TÊTE LUE ENFANT. Une adulte qui paie
       pour son foyer ou qui porte 300 locks ne contredit rien du tout : c'est
       une cliente ordinaire, et la lister serait du bruit pur. */
    const lueEnfant = age <= AGE_MND_KIDS;
    if (lueEnfant && payeurs.has(c.id)) raisons.push('paye-un-foyer');
    if (lueEnfant && (c.lockCount ?? 0) > LOCKS_AU_DELA_DUN_ENFANT) raisons.push('tete-fournie');

    if (raisons.length === 0) continue;
    sortie.push({
      clientId: c.id,
      nom: c.name,
      birthday: c.birthday,
      age,
      raisons,
      certain: raisons.some((r) => CERTITUDES.includes(r)),
      bloqueLeCatalogue: lueEnfant,
    });
  }

  /* L'ORDRE EST UNE PRIORITÉ, PAS UN TRI. Celles dont le catalogue est réduit
     aujourd'hui d'abord : ce sont les seules qui empêchent de travailler.
     Les certitudes ensuite, elles se corrigent sans réfléchir. Puis le nombre
     de raisons, puis le nom, pour que la liste ne bouge pas d'une passe à
     l'autre — un relevé qui se réordonne tout seul ne se relit jamais. */
  return sortie.sort((a, b) =>
    Number(b.bloqueLeCatalogue) - Number(a.bloqueLeCatalogue)
    || Number(b.certain) - Number(a.certain)
    || b.raisons.length - a.raisons.length
    || a.nom.localeCompare(b.nom, 'fr'));
}
