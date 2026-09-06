/* LES FICHES DE POSTE ET LE RÈGLEMENT, ÉPROUVÉS — `node scripts/verifie-postes.mjs`.

   Une fiche de poste sert à recruter, à évaluer et à défendre une sanction ;
   un règlement s'affiche et se remet contre décharge. Une rubrique absente ne
   se voit pas à l'écran : elle se découvre le jour d'un litige. */
import { FICHES_DE_POSTE, ficheDuPoste, fonctionsSansFiche } from '../src/shared/postes';
import {
  compte, ecarts, evaluationNeuve, pourquoiIncomplete, signeDuNiveau, NIVEAUX,
} from '../src/shared/evaluation';
import {
  texteReglementInterieur, VERSION_REGLEMENT, DEGRES_DE_SANCTION,
} from '../src/shared/reglement-interieur';
import { FONCTIONS_DEFAUT, FONCTIONS_AU_FAUTEUIL } from '../src/apps/trone/routes/equipe/data';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① CHAQUE FONCTION DE LA MAISON A SA FICHE ─────────────────────
   Un poste que la Maison a créé et que personne n'a décrit se recrute à
   l'aveugle et s'évalue à l'humeur. */
dit('aucune fonction sans fiche', [], fonctionsSansFiche(FONCTIONS_DEFAUT));
dit('douze fiches', 12, FICHES_DE_POSTE.length);
/* UN POSTE, UNE FICHE, quelle que soit l'écriture : deux fiches pour un métier
   finiraient par dire deux choses du même travail. */
dit('le masculin et le féminin partagent la fiche', true,
  ficheDuPoste('Maîtresse') === ficheDuPoste('Maître'));
dit('… et le praticien aussi', true,
  ficheDuPoste('Praticienne') === ficheDuPoste('Praticien'));
dit('le point médian ne gêne pas', 'Gérant·e', ficheDuPoste('Gerante')?.poste);
dit('un poste inconnu ne rend rien', undefined, ficheDuPoste('Astronaute'));
dit('… et il se signale', ['Astronaute'], fonctionsSansFiche(['Accueil', 'Astronaute']));

/* ── ② AUCUNE FICHE CREUSE ─────────────────────────────────────────
   Les cinq rubriques sont ce qui rend les fiches comparables. */
const creuses = FICHES_DE_POSTE.filter((f) => !f.mission.trim() || f.fait.length === 0
  || f.mesure.length === 0 || f.neFaitPas.length === 0 || !f.rendCompteA.trim());
dit('aucune rubrique vide', [], creuses.map((f) => f.poste));
/* « CE QU'ELLE NE FAIT PAS » EST LA RUBRIQUE LA PLUS UTILE : les conflits
   d'atelier naissent d'une frontière que personne n'avait tracée. */
dit('chacune trace sa frontière', true, FICHES_DE_POSTE.every((f) => f.neFaitPas.length >= 1));
dit('… et dit ce qui se mesure', true, FICHES_DE_POSTE.every((f) => f.mesure.length >= 2));

/* AUCUN SALAIRE : les montants n'existent nulle part dans le logiciel, et en
   poser un serait annoncer une rémunération que personne n'a décidée. */
const tout = FICHES_DE_POSTE.map((f) => [f.mission, ...f.fait, ...f.mesure, ...f.neFaitPas].join(' ')).join(' ');
dit('aucun montant sur une fiche de poste', false, /\d{4,}|F CFA|XOF/.test(tout));

/* CELLES QUI TOUCHENT UNE TÊTE SONT CELLES QUI COMMISSIONNENT — la même liste
   que la Maison, sinon un praticien commissionnerait sans fiche pour le dire. */
const auFauteuil = FICHES_DE_POSTE.filter((f) => f.auFauteuil)
  .flatMap((f) => [f.poste, ...(f.aussi ?? [])]).sort();
dit('les fiches du fauteuil suivent la Maison', [...FONCTIONS_AU_FAUTEUIL].sort(), auFauteuil);

/* ── ③ LA GRILLE : CE QUI SE COCHE, CE QUI SE VISE ─────────────────
   « Des cases à cocher, des objectifs mesurables et atteignables » (Yéman).
   Une fiche sans grille se remet, mais ne s'évalue pas : l'entretien retombe
   sur l'humeur, ce que les cinq rubriques existaient déjà pour empêcher. */
const sansGrille = FICHES_DE_POSTE.filter((f) => f.competences.length < 4 || f.objectifs.length < 2);
dit('chaque fiche porte sa grille', [], sansGrille.map((f) => f.poste));
dit('aucun objectif sans cible', true,
  FICHES_DE_POSTE.every((f) => f.objectifs.every((ob) => ob.cible.trim().length > 0)));
/* LES CLÉS SONT LES IDENTIFIANTS D'UNE ÉVALUATION SIGNÉE : deux lignes de même
   clé dans une fiche écraseraient silencieusement l'avis porté sur l'une. */
const cléDouble = FICHES_DE_POSTE.filter((f) => {
  const c = f.competences.map((x) => x.cle);
  const o = f.objectifs.map((x) => x.cle);
  return new Set(c).size !== c.length || new Set(o).size !== o.length;
});
dit('aucune clé en double dans une fiche', [], cléDouble.map((f) => f.poste));
/* DES GESTES OBSERVABLES, JAMAIS DES QUALITÉS. « Ponctuel » ne se coche pas :
   ça se discute ; « prévient d'un retard avant le jour même » se coche, et les
   deux regards peuvent en convenir.

   CE QU'ON TRAQUE EST LA TOURNURE, PAS LE MOT. « Rend un praticien autonome »
   est un acte dont le résultat s'observe au fauteuil ; « est autonome » est un
   jugement sur la personne. Chercher le seul mot « autonome » condamnerait le
   premier avec le second — un juge qui se trompe de cible finit désarmé, parce
   qu'on lui retire ses mots un par un. */
const ETAT = /^(Est|Reste|Se montre|Fait preuve|Doit être|Sait être|A l’esprit|A le sens)\b/;
const QUALITE_SEULE = /^(ponctuel|sérieux|motivé|dynamique|rigoureux|autonome|souriant|honnête|aimable)(le)?s?\.?$/i;
const jugements = FICHES_DE_POSTE.flatMap((f) =>
  f.competences.filter((c) => ETAT.test(c.mot.trim()) || QUALITE_SEULE.test(c.mot.trim())));
dit('aucune qualité déguisée en compétence', [], jugements.map((c) => c.mot));
/* ET CHACUNE SE LIT COMME UNE ACTION : un fragment de trois mots ne se coche
   pas non plus, faute de dire ce qu'on aurait dû voir. */
dit('chaque compétence décrit un geste', true,
  FICHES_DE_POSTE.every((f) => f.competences.every((c) => c.mot.trim().split(/\s+/).length >= 4)));
/* AUCUN MONTANT NON PLUS DANS LA GRILLE : un objectif chiffré en francs sur une
   fiche de poste annoncerait une prime que personne n'a décidée. */
const grilleEnTexte = FICHES_DE_POSTE.flatMap((f) =>
  [...f.competences.map((c) => c.mot), ...f.objectifs.map((o) => `${o.mot} ${o.cible}`)]).join(' ');
dit('aucun montant dans la grille', false, /\d{4,}|F CFA|XOF/.test(grilleEnTexte));

/* ── ③ bis · LES DEUX REGARDS ──────────────────────────────────────
   « Les deux · elle se note, la gérance note aussi » (arbitrage de Yéman).
   L'ÉCART EST TOUT L'INTÉRÊT DU DOCUMENT : c'est là que se trouve le sujet de
   l'entretien, et une colonne unique ne le montrerait jamais. */
const fMaitre = ficheDuPoste('Maître')!;
const ev = evaluationNeuve(fMaitre, '2026-09-06');
dit('une évaluation neuve part du standard du poste',
  fMaitre.objectifs.map((o) => o.cible), fMaitre.objectifs.map((o) => ev.cibles[o.cle]));
dit('… et elle garde le poste tel qu’il était', 'Maître', ev.poste);

const c0 = fMaitre.competences[0].cle;
const c1 = fMaitre.competences[1].cle;
ev.parElle[c0] = 'acquis'; ev.parLaMaison[c0] = 'acquis';       // d'accord
ev.parElle[c1] = 'non'; ev.parLaMaison[c1] = 'acquis';          // la Maison la voit plus loin
dit('un accord n’est pas un écart', 1, ecarts(fMaitre, ev).length);
dit('… et le sens est dit', 'maison-plus-haut', ecarts(fMaitre, ev)[0].sens);
ev.parElle[c1] = 'acquis'; ev.parLaMaison[c1] = 'encours';
dit('… dans l’autre sens aussi', 'elle-plus-haut', ecarts(fMaitre, ev)[0].sens);
/* UN AVIS MANQUANT N'EST PAS UN DÉSACCORD : ce serait chercher un conflit qui
   n'existe pas, sur une case qu'on n'a simplement pas remplie. */
delete ev.parElle[c1];
dit('une case vide ne fait pas un désaccord', 0, ecarts(fMaitre, ev).length);

/* « EN COURS » VAUT UNE DEMIE : rien du tout découragerait ce qui progresse,
   un point entier effacerait la différence avec ce qui est tenu. */
const cinq = { ...fMaitre, competences: fMaitre.competences.slice(0, 4) };
dit('le compte pèse l’en-cours à moitié', { acquis: 2, encours: 2, total: 4, pct: 75 },
  compte(cinq, Object.fromEntries(cinq.competences.map((c, i) =>
    [c.cle, i < 2 ? 'acquis' : 'encours'])) as Record<string, 'acquis' | 'encours'>));
dit('une grille vierge ne vaut rien', 0, compte(fMaitre, {}).pct);

/* CE QUI MANQUE POUR QUE L'ENTRETIEN SOIT TENU : un document à moitié rempli
   signé le jour même ne se relit pas l'année suivante. */
dit('un entretien incomplet se refuse', true, !!pourquoiIncomplete(fMaitre, ev));
for (const c of fMaitre.competences) ev.parLaMaison[c.cle] = 'acquis';
dit('… même noté en entier, sans points forts', true, !!pourquoiIncomplete(fMaitre, ev));
ev.pointsForts = 'Tient ses têtes difficiles sans jamais appeler à l’aide trop tard.';
dit('… complet, il passe', undefined, pourquoiIncomplete(fMaitre, ev));

dit('trois niveaux, pas deux', 3, NIVEAUX.length);
dit('un niveau absent se lit quand même', '—', signeDuNiveau(undefined));

/* ── ④ LE RÈGLEMENT ────────────────────────────────────────────────
   Les quatre sujets tranchés par la Maison, et l'échelle. */
const r = texteReglementInterieur({
  maison: 'L’atelier MND', raison: 'MND SARL', ville: 'Cotonou',
  nom: 'Kossi A.', fonction: 'Praticien', jourIso: '2026-09-06',
});
const corps = r.articles.map((a) => a.lignes.join(' ')).join(' ');
const art = (mot: string) => r.articles.find((a) => a.titre.toLowerCase().includes(mot));

dit('les pourboires sont tranchés', true, !!art('pourboire'));
/* LA RÈGLE DE LA MAISON : ils se partagent entre TOUS, pas seulement entre ceux
   qui ont officié. C'est ce que dit déjà `repartirPourboire`. */
dit('… entre tous, pas seulement au fauteuil', true, corps.includes('y compris ceux'));
dit('la clientèle personnelle est tranchée', true, corps.includes('On ne coiffe personne à son compte'));
dit('… même un proche', true, corps.includes('même un proche'));
dit('le téléphone et les réseaux', true, !!art('téléphone'));
dit('… et un différend ne se règle pas en ligne', true, corps.includes('jamais en ligne'));
dit('la caisse est tranchée', true, !!art('caisse'));
/* LA PHRASE QUI FAIT TOUT LE TRAVAIL : elle rend la déclaration plus sûre que
   le silence, ce qui est le seul moyen d'apprendre les écarts. */
dit('… un écart déclaré n’est pas une faute', true,
  corps.includes('Un écart déclaré est une erreur'));

dit('quatre degrés de sanction', 4, DEGRES_DE_SANCTION.length);
dit('… ils sont dans le texte', true, DEGRES_DE_SANCTION.every((d) => corps.includes(d)));
dit('… on ne saute un degré que sur faute grave', true, corps.includes('sauter un en cas de faute'));
/* SANS CES DEUX GARDES, L'ÉCHELLE NE PROTÈGE QUE LA MAISON. */
dit('… la personne est entendue avant', true, corps.includes('ait été entendue'));
dit('… et une sanction non écrite n’existe pas', true, corps.includes('n’existe pas'));

/* CE QUE LA MAISON DOIT EN RETOUR : un règlement qui n'engage qu'un côté se
   lit comme une liste de menaces, et ne se respecte pas. */
dit('la Maison s’engage aussi', true, !!art('en retour'));
dit('le harcèlement ne se règle pas à l’amiable', true, corps.includes('ne se règle pas à l’amiable'));
dit('… et celui qui signale est protégé', true, corps.includes('ne peut en être inquiétée'));

dit('trois parties nommées, dont le champ d’application', 3, r.entete.length);
dit('le pied porte la version', true, r.pied.includes(VERSION_REGLEMENT));
const suite = r.articles.map((a) => Number(a.n)).every((n, i) => n === i + 1);
dit('numérotation continue', true, suite);
dit('la fonction est en sous-titre', 'Praticien', r.sousTitre);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
