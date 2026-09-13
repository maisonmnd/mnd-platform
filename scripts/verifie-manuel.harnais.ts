/* LE MANUEL DES FORMATRICES, ÉPROUVÉ — `node scripts/verifie-manuel.mjs`.

   AUCUNE LIGNE DU VRAI MANUEL ICI : le dépôt est public. Les séances de ce
   harnais sont fabriquées pour l'épreuve, et ne disent rien de la méthode. */
import {
  lisLeManuel, planDeLaSeance, manuelDeLaFormation, noteDesCriteres, squeletteDuManuel, peutEcrireLeManuel,
} from '../src/shared/manuel';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const JOUR = '2026-09-13';
const seance = (n: number, module: number, nomModule: string) => ({
  n, module, nomModule, titre: `Séance d’épreuve ${n}`, duree: '1 h', objectif: 'Un objectif d’épreuve.',
  preparer: ['un poste'], deroule: [['60 min', 'une étape']], vu: ['un point'], pratique: ['un geste'],
  mesure: [['un critère', '/5']], erreurs: ['une erreur'], ensuite: 'une consigne',
});

/* ── ① UN FICHIER SE LIT COMME UNE SAISIE ─────────────────────────── */
dit('un fichier vide n’est pas un manuel', ['Ce fichier n’est pas un manuel de l’Académie.'], lisLeManuel(null, JOUR).erreurs);
dit('un tableau non plus', 1, lisLeManuel([1, 2], JOUR).erreurs.length);
dit('une formation inconnue est refusée', ['« atelier » n’est pas une formation de l’Académie.'],
  lisLeManuel({ formations: { atelier: { seances: [] } } }, JOUR).erreurs);
dit('aucune formation, rien à importer', ['Ce fichier ne contient aucune formation.'],
  lisLeManuel({ formations: {} }, JOUR).erreurs);

const deux = lisLeManuel({ formations: { fondation: {
  meta: '  une ligne  ', intro: 'intro', materiel: ['a', 3, '', ' b '],
  seances: [seance(2, 2, 'Purifier'), seance(1, 1, 'L’accueil et la lecture de la tête')],
} } }, JOUR);
dit('une formation lisible passe', 1, deux.manuels.length);
dit('sans erreur', [], deux.erreurs);
dit('les séances se rangent par numéro', [1, 2], deux.manuels[0].seances.map((s) => s.n));
dit('les textes se nettoient, le reste tombe', ['a', 'b'], deux.manuels[0].materiel);
dit('le jour d’import est gardé', JOUR, deux.manuels[0].importeLe);
/* UN MANUEL EN AVANCE SUR LE PROGRAMME s'annonce, il ne se bloque pas. */
dit('un nombre de séances différent s’annonce', ['Fondation : 2 séances dans le manuel, 6 au programme.'], deux.alertes);

const illisible = lisLeManuel({ formations: { fondation: { seances: [{ ...seance(1, 1, ''), objectif: '' }] } } }, JOUR);
dit('une séance sans objectif est une erreur', 1, illisible.erreurs.length);
dit('… et ne s’écrit pas', 0, illisible.manuels[0].seances.length);
dit('deux fois le même numéro est une erreur', true,
  lisLeManuel({ formations: { fondation: { seances: [seance(1, 1, ''), seance(1, 1, '')] } } }, JOUR)
    .erreurs.some((e) => e.includes('même numéro')));
dit('un module mal nommé s’annonce', true,
  lisLeManuel({ formations: { fondation: { seances: [seance(1, 1, 'Autre chose')] } } }, JOUR)
    .alertes.some((a) => a.includes('nom du programme')));

/* ── ② RETROUVER LE PLAN D'UNE SÉANCE ─────────────────────────────── */
const lu = lisLeManuel({ formations: {
  fondation: { seances: [seance(1, 1, ''), seance(2, 2, '')] },
  oeuvre: { seances: [seance(1, 1, '')] },
} }, JOUR).manuels;
dit('la séance se retrouve par le nom et le numéro', 'Séance d’épreuve 2', planDeLaSeance(lu, 'Fondation', 2)?.titre);
dit('la casse ne trompe pas', 'Séance d’épreuve 1', planDeLaSeance(lu, 'FONDATION', 1)?.titre);
dit('la ligature non plus : L’Oeuvre est L’Œuvre', 'oeuvre', manuelDeLaFormation(lu, "L'Oeuvre")?.id);
dit('une séance absente ne rend rien', undefined, planDeLaSeance(lu, 'Fondation', 9));
dit('une formation de la Maison sans parcours ne rend rien', undefined, planDeLaSeance(lu, 'Atelier du samedi', 1));
dit('un manuel pas encore importé ne rend rien', undefined, planDeLaSeance(lu, 'Praticien MND', 1));

/* ── ③ LA NOTE SUR 20 ─────────────────────────────────────────────── */
dit('quatre critères font la note', 17, noteDesCriteres([5, 4, 3, 5], 4));
dit('un critère manquant, pas de note', undefined, noteDesCriteres([5, 4, null, 5], 4));
dit('trop peu de critères, pas de note', undefined, noteDesCriteres([5, 4], 4));
dit('un critère au-delà de 5 se borne', 20, noteDesCriteres([7, 5, 5, 5], 4));
dit('un critère négatif se borne à zéro', 15, noteDesCriteres([-2, 5, 5, 5], 4));
dit('cinq critères se ramènent sur 20', 16, noteDesCriteres([4, 4, 4, 4, 4], 5));
dit('aucun critère attendu, pas de note', undefined, noteDesCriteres([], 0));

/* ── ④ CORRIGER DANS LE TRÔNE ────────────────────────────────────── */
const squelette = squeletteDuManuel('affirmation');
dit('le squelette suit le programme', 10, squelette?.seances.length);
dit('ses séances sont numérotées', [1, 2, 3], squelette?.seances.slice(0, 3).map((s) => s.n));
dit('ses modules portent les noms du programme', ['Le diagnostic KÒKÒ™', 'Le diagnostic KÒKÒ™', 'SÍNSIN™, le resserrage'],
  squelette?.seances.slice(0, 3).map((s) => s.nomModule));
const squeletteLu = lisLeManuel({ formations: { affirmation: squelette } }, JOUR);
dit('un squelette vide ne s’enregistre pas', 10, squeletteLu.erreurs.length);
dit('l’erreur dit la séance et ce qui manque', 'Affirmation, séance 1 : il manque le titre et l’objectif.', squeletteLu.erreurs[0]);
dit('une formation inconnue n’a pas de squelette', undefined, squeletteDuManuel('atelier'));
dit('la direction écrit, le personnel lit', [true, true, false, false],
  ['souverain', 'gerant', 'maitre', undefined].map((r) => peutEcrireLeManuel(r)));
dit('la date de correction se garde', '2026-09-14',
  lisLeManuel({ formations: { fondation: { seances: [seance(1, 1, '')], modifieLe: '2026-09-14' } } }, JOUR).manuels[0].modifieLe);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} épreuve(s) en échec.`);
