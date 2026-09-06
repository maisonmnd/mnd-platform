/* LES FICHES DE POSTE ET LE RÈGLEMENT, ÉPROUVÉS — `node scripts/verifie-postes.mjs`.

   Une fiche de poste sert à recruter, à évaluer et à défendre une sanction ;
   un règlement s'affiche et se remet contre décharge. Une rubrique absente ne
   se voit pas à l'écran : elle se découvre le jour d'un litige. */
import { FICHES_DE_POSTE, ficheDuPoste, fonctionsSansFiche } from '../src/shared/postes';
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

/* ── ③ LE RÈGLEMENT ────────────────────────────────────────────────
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
