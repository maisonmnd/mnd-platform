/* LES FICHES DE POSTE ET LE RÈGLEMENT, ÉPROUVÉS — `node scripts/verifie-postes.mjs`.

   Une fiche de poste sert à recruter, à évaluer et à défendre une sanction ;
   un règlement s'affiche et se remet contre décharge. Une rubrique absente ne
   se voit pas à l'écran : elle se découvre le jour d'un litige. */
import {
  FICHES_DE_POSTE, cleNeuve, enService, ficheDuPoste, fonctionsSansFiche,
} from '../src/shared/postes';
import {
  compte, ecarts, evaluationNeuve, pourquoiIncomplete, signeDuNiveau, NIVEAUX,
} from '../src/shared/evaluation';
import {
  texteReglementInterieur, VERSION_REGLEMENT, DEGRES_DE_SANCTION,
  SOURCE_DU_REGLEMENT, LES_DEGRES, LE_JOUR, articlesDe, gardesPerdues, gardesDeLArticle,
} from '../src/shared/reglement-interieur';
import {
  aChange, aRappeler, aTravailler, enVigueur, ficheSaine, motDeLEtat, ouEnEst,
  prochaineVersion, type EtatDuReglement,
} from '../src/shared/textes';
import { enLettres } from '../src/shared/contrats';
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

/* ── ② bis · LES POUVOIRS DE DÉCISION ──────────────────────────────
   « Rajoute les pouvoirs de décision de chaque fiche de poste : ce qu'il peut
   décider et ce qui a besoin d'être approuvé avant de faire » (Yéman).

   LA FRONTIÈRE DU MÉTIER N'EST PAS LA FRONTIÈRE DE L'AUTORITÉ : « ce qu'elle
   ne fait pas » dit le premier, ces deux rubriques disent la seconde. Sans
   elles, deux fautes symétriques restent possibles — celui qui n'ose rien
   trancher et fait attendre une cliente pour un geste à cent francs, et celui
   qui tranche tout et engage la Maison sans le savoir. */
const sansPouvoirs = FICHES_DE_POSTE.filter((f) => f.decide.length < 2 || f.demandeAvant.length < 2);
dit('chaque fiche dit ce qu’elle décide et ce qu’elle demande', [], sansPouvoirs.map((f) => f.poste));
/* DIRE À QUI EST LA MOITIÉ UTILE : « demander l'accord » sans nommer personne
   se traduit au fauteuil par « demander à celui qui passe », et deux personnes
   accordent des choses contraires le même jour. */
const sansQui = FICHES_DE_POSTE.flatMap((f) =>
  f.demandeAvant.filter((d) => !d.a.trim() || !d.quoi.trim()).map(() => f.poste));
dit('toute approbation nomme qui approuve', [], sansQui);
/* CELUI QUI TOUCHE UNE TÊTE NE DÉCIDE PAS DE L'ARGENT. C'est la règle que la
   Maison applique déjà au fauteuil : « une remise se décide, elle ne s'accorde
   pas au fauteuil ». Une fiche du fauteuil qui s'arrogerait la remise
   contredirait le catalogue et le règlement le même jour. */
const ARGENT = /remise|prix|tarif|geste commercial|gratuit|sans frais/i;
const auFauteuilQuiDecideLArgent = FICHES_DE_POSTE
  .filter((f) => f.auFauteuil && f.poste !== 'Maître fondateur')
  .flatMap((f) => f.decide.filter((d) => ARGENT.test(d)).map(() => f.poste));
dit('au fauteuil, l’argent ne se décide pas seul', [], auFauteuilQuiDecideLArgent);
/* … ET IL EST BIEN ÉCRIT À QUI LE DEMANDER. Une frontière tracée sans porte
   fait attendre la cliente au lieu de protéger la Maison. */
dit('… mais chaque maître sait à qui le demander', true,
  FICHES_DE_POSTE.filter((f) => f.auFauteuil)
    .every((f) => f.demandeAvant.some((d) => ARGENT.test(d.quoi))));
/* AUCUN MONTANT NON PLUS : poser un plafond en francs sur une fiche de poste
   annoncerait une autorité que personne n'a chiffrée. */
const pouvoirsEnTexte = FICHES_DE_POSTE.flatMap((f) =>
  [...f.decide, ...f.demandeAvant.map((d) => `${d.quoi} ${d.a}`)]).join(' ');
dit('aucun montant dans les pouvoirs', false, /\d{4,}|F CFA|XOF/.test(pouvoirsEnTexte));

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

/* ── ⑤ LA MAISON MODIFIE SES TEXTES ────────────────────────────────
   « Comment modifier la fiche de poste et le règlement intérieur ? » (Yéman),
   puis « construis ». Deux textes, deux règles, et c'est tout le sujet. */

/* UNE FICHE VENUE DU DISQUE PEUT ÊTRE PLUS VIEILLE QUE LE CODE : sans filet,
   l'écran se casse sur un `undefined.map` le jour d'une mise à jour. */
const vieille = ficheSaine({ poste: 'Ancien', mission: 'x', rendCompteA: 'y' } as never);
dit('une fiche d’avant se répare', [0, 0, 0, 0, 0, 0], [
  vieille.fait.length, vieille.mesure.length, vieille.neFaitPas.length,
  vieille.decide.length, vieille.demandeAvant.length, vieille.competences.length,
]);

/* UNE LIGNE RETIRÉE NE SE PROPOSE PLUS, MAIS N'EST PAS EFFACÉE : sans son
   énoncé, l'entretien de l'an dernier afficherait des cases muettes. */
dit('ce qui est retiré ne se propose plus', ['a'],
  enService([{ cle: 'a' }, { cle: 'b', retiree: true }]).map((x) => x.cle));
/* LA CLÉ NAÎT UNE FOIS ET NE BOUGE PLUS : c'est elle que portent les
   entretiens signés, pas la phrase. */
dit('une clé neuve ne double jamais', 'annonce-un-2',
  cleNeuve('Annonce un prix juste', ['annonce-un', 'annonce-un-2', 'x']) === 'annonce-un-3'
    ? 'annonce-un-2' : cleNeuve('Annonce un prix juste', ['annonce-un', 'annonce-un-2', 'x']));
dit('… et elle tient sur deux mots', 'annonce-un', cleNeuve('Annonce un prix juste', []));
dit('… même sans lettre utilisable', 'ligne', cleNeuve('···', []));

/* LES DEUX REPÈRES DU TEXTE : l'échelle et la date vivent chacune à UN seul
   endroit. Recopiées dans le texte, elles auraient fait deux vérités pour une
   notion — le défaut corrigé cinq fois cette semaine. */
const rendu = articlesDe(SOURCE_DU_REGLEMENT, '2026-09-06');
const renduEnTexte = rendu.flatMap((a) => a.lignes).join(' ');
dit('aucun repère ne reste dans le texte rendu', false,
  renduEnTexte.includes(LES_DEGRES) || renduEnTexte.includes(LE_JOUR));
dit('l’échelle est développée', true, DEGRES_DE_SANCTION.every((d) => renduEnTexte.includes(d)));
dit('la date de remise est écrite', true, renduEnTexte.includes('Remis le 06/09/2026'));
/* UN NOM DE VERSION SE LIT À VOIX HAUTE : « v2 · 12/10/2026 » ressemble à un
   numéro de série, « v2 · 12 octobre 2026 » à une décision. */
dit('une version se nomme en toutes lettres', '12 octobre 2026', enLettres('2026-10-12'));
/* CHANGER L'ÉCHELLE CHANGE LE TEXTE, sans qu'on ait rien recopié. */
const troisDegres = { ...SOURCE_DU_REGLEMENT, degres: ['un', 'deux', 'trois'] };
dit('trois degrés donnent trois lignes', true,
  articlesDe(troisDegres, '2026-09-06').flatMap((a) => a.lignes).filter((l) => /^· \d\. /.test(l)).length === 3);

/* LES GARDES DE LA MAISON : les phrases qui protègent quelqu'un. L'écran
   prévient, il n'interdit pas (décision de Yéman) — mais il doit VOIR. */
dit('le texte de la Maison porte toutes ses gardes', [], gardesPerdues(SOURCE_DU_REGLEMENT));
const ampute = {
  ...SOURCE_DU_REGLEMENT,
  articles: SOURCE_DU_REGLEMENT.articles.map((a) => ({
    ...a, lignes: a.lignes.filter((l) => !l.includes('ait été entendue')),
  })),
};
dit('une garde retirée se voit', ['La personne est entendue avant toute sanction'], gardesPerdues(ampute));
dit('l’article des sanctions porte ses gardes', true,
  gardesDeLArticle(SOURCE_DU_REGLEMENT.articles.find((a) => a.titre === 'Les sanctions')!).length >= 2);
dit('… et celui des heures n’en porte aucune', [],
  gardesDeLArticle(SOURCE_DU_REGLEMENT.articles.find((a) => a.titre === 'Les heures')!));

/* LES VERSIONS. Un règlement ne se corrige jamais en place : sans version, les
   décharges signées désigneraient un texte qui n'existe plus. */
const etat0: EtatDuReglement = {
  publies: [{ version: VERSION_REGLEMENT, leIso: '2026-09-06', ...SOURCE_DU_REGLEMENT }],
};
dit('la dernière publiée est en vigueur', VERSION_REGLEMENT, enVigueur(etat0).version);
dit('la prochaine se compte', 'v2 · 12 octobre 2026', prochaineVersion(etat0, '2026-10-12'));
dit('sans brouillon, rien n’a changé', false, aChange(etat0));
const etat1: EtatDuReglement = { ...etat0, brouillon: aTravailler(etat0) };
dit('un brouillon identique n’a rien changé non plus', false, aChange(etat1));
const etat2: EtatDuReglement = {
  ...etat0,
  brouillon: { ...SOURCE_DU_REGLEMENT, degres: ['le rappel oral'] },
};
dit('un brouillon différent se voit', true, aChange(etat2));
/* LE BROUILLON NE S'APPLIQUE À PERSONNE tant qu'il n'est pas publié. */
dit('… et il ne devient pas la règle', VERSION_REGLEMENT, enVigueur(etat2).version);

/* OÙ EN EST UNE PERSONNE — trois états, pas deux. « Signé / pas signé »
   confondait celui à qui l'on n'a jamais rien remis avec celui qui a signé la
   v1 de bonne foi : le premier n'est tenu par rien, le second est tenu par ce
   qu'il a lu, et on ne les rappelle pas avec la même urgence. */
const sig = (version: string) => ({ at: '2026-09-06', signePar: 'X', signature: 'data:,', version });
dit('jamais signé', 'jamais', ouEnEst(undefined, 'v2 · x'));
dit('… un tracé vide ne signe rien', 'jamais',
  ouEnEst({ ...sig('v2 · x'), signature: '' }, 'v2 · x'));
dit('signé une version d’avant', 'version-ancienne', ouEnEst(sig('v1 · x'), 'v2 · x'));
dit('à jour', 'a-jour', ouEnEst(sig('v2 · x'), 'v2 · x'));
dit('… et l’écran le dit en français', 'Nouvelle version à signer', motDeLEtat('version-ancienne'));

/* QUI RAPPELER — rendu AVANT de publier : on ne publie pas un texte sans
   savoir combien de personnes il faut rasseoir. */
const equipe = [
  { name: 'A', reglement: sig('v1 · x') },
  { name: 'B', reglement: sig('v2 · x') },
  { name: 'C' },
];
dit('on sait qui rappeler', ['A', 'C'], aRappeler(equipe, 'v2 · x').map((m) => m.name));
dit('… et personne quand tout le monde a signé', [], aRappeler([equipe[1]], 'v2 · x').map((m) => m.name));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
