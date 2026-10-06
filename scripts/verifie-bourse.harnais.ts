/* LE HARNAIS DU DOSSIER DE BOURSE, 6 octobre 2026.

   Ce qu'il tient :
     · la liste des rubriques est celle de l'Ambassade : 22 numéros uniques,
       dans l'ordre, chacun avec un rythme ;
     · l'expiration prévient trois mois avant et dit « expirée » après ;
     · la collecte se fait le 5 pour le mois précédent, se tait quand elle
       est faite, et le rappel ne parle qu'une fois par mois ;
     · le rétro-planning monte jusqu'au dépôt et finit par lui ;
     · les rubriques sans objet suivent la fiche : pas d'indépendant, pas de
       bilan ; jamais résidé en France, pas de CAF ;
     · les lettres se rédigent depuis la fiche et laissent les champs vides
       entre crochets, pour qu'un oubli se voie ;
     · l'assemblage suit l'ordre des rubriques, le bordereau en tête ;
     · LE CODE NE PORTE AUCUN NOM DE FAMILLE : le dépôt est public.

   Lancer : node scripts/verifie-bourse.mjs */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  FICHE_VIDE, RUBRIQUES, champsVides, collecteDuMois, dateEnLettres, etatDExpiration, etatDuDossier,
  lettreDuDossier, moisACollecter, moisAttendus, moisEnLettres, nomDeFichier, ordreDAssemblage, piecesAExpirer,
  rappelDu, retroPlanning, rubriquesSansObjet, texteLettreDeDemande, campagneSuivante,
  type Campagne, type Fiche, type Piece,
} from '../src/shared/bourse';

let rates = 0;
const dit = (quoi: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) rates++;
  console.log(`${ok ? 'OK   ' : 'RATE '} ${quoi} -> ${JSON.stringify(obtenu)}${ok ? '' : ` (attendu ${JSON.stringify(attendu)})`}`);
};
const vrai = (quoi: string, condition: boolean, detail = '') => {
  if (!condition) rates++;
  console.log(`${condition ? 'OK   ' : 'RATE '} ${quoi}${condition || !detail ? '' : ` -> ${detail}`}`);
};

/* ── 1. La liste ─────────────────────────────────────────────────────── */
dit('vingt-deux rubriques', 22, RUBRIQUES.length);
vrai('les numéros sont uniques et dans l’ordre', RUBRIQUES.every((r, i) => r.n === String(i + 1).padStart(2, '0')));
vrai('chaque rubrique a un rythme et une note', RUBRIQUES.every((r) => r.rythme && r.note.length > 10));
dit('cinq rubriques mensuelles', 5, RUBRIQUES.filter((r) => r.rythme === 'mensuel').length);

/* ── 2. Les dates ────────────────────────────────────────────────────── */
dit('18 mars 2014', '18 mars 2014', dateEnLettres('2014-03-18'));
dit('le premier s’écrit 1er', '1er novembre 2026', dateEnLettres('2026-11-01'));
dit('novembre 2026', 'novembre 2026', moisEnLettres('2026-11'));
dit('une date vide reste vide', '', dateEnLettres(''));

/* ── 3. L'expiration ─────────────────────────────────────────────────── */
dit('sans date : sans', 'sans', etatDExpiration(undefined, '2026-10-06'));
dit('dans un an : valide', 'valide', etatDExpiration('2027-10-06', '2026-10-06'));
dit('dans deux mois : bientôt', 'bientot', etatDExpiration('2026-12-01', '2026-10-06'));
dit('hier : expirée', 'expiree', etatDExpiration('2026-10-05', '2026-10-06'));
const passeport: Piece = { id: 'p', rubrique: '04', nom: '04-passeport.jpg', chemin: 'x', type: 'image/jpeg', taille: 1, deposeLe: '2026-10-06', expireLe: '2027-01-10' };
dit('un passeport qui expire avant le dépôt demande un geste', ['p'], piecesAExpirer([passeport], '2026-10-06', '2027-02-26').map((p) => p.id));
dit('un passeport valide dix ans ne demande rien', [], piecesAExpirer([{ ...passeport, expireLe: '2036-01-10' }], '2026-10-06', '2027-02-26').map((p) => p.id));

/* ── 4. La collecte et le rappel ─────────────────────────────────────── */
dit('le 5 novembre, on range octobre', '2026-10', moisACollecter('2026-11-05'));
dit('le 2 janvier aussi, on vise décembre', '2026-12', moisACollecter('2027-01-02'));
const campagne: Campagne = { id: 'c', anneeScolaire: '2027-2028', anneeReference: 2026, dateDepot: '2027-02-26', collecte: {} };
const releve: Piece = { id: 'r', rubrique: '16', nom: '16-releve-2026-10.pdf', chemin: 'x', type: 'application/pdf', taille: 1, deposeLe: '2026-11-05', mois: '2026-10' };
const c1 = collecteDuMois(campagne, [releve], '2026-10', '2026-11-05');
dit('la collecte liste les rubriques mensuelles', 5, c1.lignes.length);
vrai('le relevé d’octobre compte comme fourni', c1.lignes.find((l) => l.rubrique.n === '16')!.fournie);
vrai('la collecte n’est pas faite tant qu’il manque une rubrique', !c1.faite);
vrai('le 5, elle est en retard', c1.enRetard);
vrai('le 4, elle ne l’est pas encore', !collecteDuMois(campagne, [releve], '2026-10', '2026-11-04').enRetard);
vrai('marquée faite à la main, elle est faite', collecteDuMois({ collecte: { '2026-10': { faite: true } } }, [], '2026-10', '2026-11-05').faite);
dit('le rappel se tait avant le 5', null, rappelDu(campagne, '2026-11-04'));
vrai('le 5, le rappel nomme le mois', (rappelDu(campagne, '2026-11-05')?.message ?? '').includes('octobre 2026'));
dit('vu ce mois-ci, il se tait', null, rappelDu({ ...campagne, rappelVu: '2026-10' }, '2026-11-05'));
dit('collecte faite, il se tait', null, rappelDu({ ...campagne, collecte: { '2026-10': { faite: true } } }, '2026-11-05'));
dit('après le dépôt, il se tait', null, rappelDu(campagne, '2027-03-05'));
dit('les trois mois attendus avant un dépôt en février', ['2026-11', '2026-12', '2027-01'], moisAttendus('2026-10-06', '2027-02-26'));

/* ── 5. Le rétro-planning ────────────────────────────────────────────── */
const plan = retroPlanning('2026-10-06', '2027-02-26');
vrai('le planning commence aujourd’hui', plan[0].date === '2026-10-06');
vrai('il finit par le dépôt', plan[plan.length - 1].date === '2027-02-26' && plan[plan.length - 1].quoi.includes('limite'));
vrai('il est trié', plan.every((e, i) => i === 0 || plan[i - 1].date <= e.date));
vrai('il compte les collectes de novembre à février', plan.filter((e) => e.quoi.startsWith('Collecte')).length === 4);
vrai('sans date de dépôt, il vise fin février', retroPlanning('2026-10-06').some((e) => e.date === '2027-02-26'));

/* ── 6. Sans objet, d'après la fiche ─────────────────────────────────── */
const fiche: Fiche = {
  ...FICHE_VIDE, situation: 'marie', jamaisResideEnFrance: true,
  parent1: { nom: 'NOM', prenom: 'Prénom', naissance: '1981-04-13', lieu: 'Cotonou', nationalite: '', numic: '' },
  parent2: { nom: 'NOM', prenom: 'Second', naissance: '1981-02-22', lieu: '', nationalite: '', numic: '' },
  adresse: 'Rue Test, Quartier, Cotonou',
  enfants: [{ prenom: 'A', nom: 'NOM', naissance: '2014-03-18', etablissement: 'École française', classe: '4e', immatriculation: '', sexe: '' }],
  logement: { statut: 'heberge', adresse: '', loyer: '', charges: '60 000', valeurLocative: '', superficie: '', pieces: '', hebergeant: { nom: 'Hôte TEST', naissance: '', lieu: '', adresse: 'Adresse hôte', telephone: '', depuis: '' } },
  emplois: [{ parent: 1, statut: 'salarie', employeur: 'Société TEST', estLaMaison: false, poste: 'poste', depuis: '', salaireBrut: '', salaireNet: '', participeAuxFrais: false, signataire: 'Gérante TEST', qualite: 'gérante', lienFamilial: '', rccm: 'RB/COT/00 B 0000', ifu: '', siege: '', telephone: '', sansEmploiDepuis: '' }],
};
const so = rubriquesSansObjet(fiche);
vrai('jamais résidé en France : la CAF est sans objet', so.has('07'));
vrai('pas d’indépendant : pas de bilan ni de statuts', so.has('13') && so.has('14') && so.has('15'));
vrai('marié : pas d’attestation de non-concubinage ni de jugement', so.has('12') && so.has('11'));
vrai('salarié : les bulletins restent', !so.has('18'));
vrai('un indépendant ramène le bilan', !rubriquesSansObjet({ ...fiche, emplois: [{ ...fiche.emplois[0], statut: 'independant' }] }).has('15'));

const etat = etatDuDossier([releve, passeport], fiche, '2026-11-05', '2027-02-26');
dit('la lettre de demande se rédige', 'a-rediger', etat.find((l) => l.rubrique.n === '01')!.etat);
dit('le passeport qui expire avant le dépôt est signalé', 'expiree', etatDuDossier([{ ...passeport, expireLe: '2026-11-01' }], fiche, '2026-11-05', '2027-02-26').find((l) => l.rubrique.n === '04')!.etat);
dit('un seul relevé sur trois : il manque', 'manquante', etat.find((l) => l.rubrique.n === '16')!.etat);
dit('le livret sans pièce manque', 'manquante', etat.find((l) => l.rubrique.n === '03')!.etat);

/* ── 7. Les lettres ──────────────────────────────────────────────────── */
const maison = { nom: 'Maison TEST', raison: 'RAISON TEST', ville: 'Cotonou' };
const demande = texteLettreDeDemande(fiche, campagne);
vrai('la lettre nomme l’enfant, sa classe et la campagne', demande.paragraphes.join(' ').includes('A NOM, né(e) le 18 mars 2014, qui entrera en classe de 4e') && demande.objet!.includes('2027-2028'));
vrai('elle compte le foyer : deux parents, un enfant', demande.paragraphes.some((p) => p.includes('Notre foyer compte 3 personnes')));
vrai('les champs vides sortent entre crochets', champsVides(demande).includes('[téléphone]') && champsVides(demande).includes('[NUMIC]'));
const employeur = lettreDuDossier('employeur', fiche, campagne, maison)!;
vrai('l’attestation de l’employeur porte le RCCM et la non-participation', employeur.paragraphes.join(' ').includes('RB/COT/00 B 0000') && employeur.paragraphes.join(' ').includes('ne participe à aucune dépense'));
vrai('elle n’est pas de la Maison', !employeur.deLaMaison);
const parLaMaison = lettreDuDossier('employeur', fiche, campagne, maison, { emploi: { ...fiche.emplois[0], estLaMaison: true, employeur: '' } })!;
vrai('employeur Maison : l’identité de la Maison signe, avec sa raison', parLaMaison.deLaMaison === true && parLaMaison.entete[0] === 'Maison TEST' && parLaMaison.paragraphes[0].includes('RAISON TEST'));
vrai('hébergé : l’attestation d’hébergement existe', !!lettreDuDossier('hebergement', fiche, campagne, maison));
dit('propriétaire : pas d’attestation d’hébergement', null, lettreDuDossier('hebergement', { ...fiche, logement: { ...fiche.logement, statut: 'proprietaire' } }, campagne, maison));
const quittance = lettreDuDossier('quittance', fiche, campagne, maison, { mois: '2026-11' })!;
vrai('la quittance couvre le mois entier', quittance.paragraphes[0].includes('du 1er novembre 2026 au 30 novembre 2026') && quittance.paragraphes[0].includes('60 000 francs'));
dit('la date du dépôt se pose quand on la donne', 'Cotonou, le 26 février 2027', texteLettreDeDemande(fiche, campagne, '2027-02-26').lieuDate);

/* ── 8. L'assemblage ─────────────────────────────────────────────────── */
const ordre = ordreDAssemblage([releve, passeport], fiche, '2026-11-05', '2027-02-26');
dit('le bordereau ouvre', 'bordereau', ordre[0].genre);
dit('puis la lettre de demande', JSON.stringify({ genre: 'lettre', lettre: 'demande', rubrique: '01' }), JSON.stringify(ordre[1]));
vrai('hébergé : l’attestation puis trois quittances pour les mois attendus', ordre.filter((e) => e.genre === 'lettre' && e.lettre === 'quittance').length === 3 && ordre.some((e) => e.genre === 'lettre' && e.lettre === 'hebergement'));
vrai('une attestation d’employeur par parent salarié', ordre.filter((e) => e.genre === 'lettre' && e.lettre === 'employeur').length === 1);
vrai('les rubriques sans objet ne laissent rien', !ordre.some((e) => e.genre === 'lettre' && e.lettre === 'honneur'));
const iPasseport = ordre.findIndex((e) => e.genre === 'piece' && e.piece.id === 'p');
const iReleve = ordre.findIndex((e) => e.genre === 'piece' && e.piece.id === 'r');
vrai('le passeport (04) précède le relevé (16)', iPasseport > 0 && iPasseport < iReleve);

/* ── 9. Le nommage et la campagne ────────────────────────────────────── */
dit('le nom range le classeur', '05-facture-sbee-2026-10.jpg', nomDeFichier('05', 'Facture SBEE.JPG', '2026-10'));
dit('sans mois, sans suffixe', '03-livret-de-famille.pdf', nomDeFichier('03', 'Livret de famille.pdf'));
dit('en octobre 2026, la prochaine campagne est 2027-2028 sur les revenus 2026', { anneeScolaire: '2027-2028', anneeReference: 2026 }, campagneSuivante('2026-10-06'));
dit('en janvier 2027, c’est encore 2027-2028', { anneeScolaire: '2027-2028', anneeReference: 2026 }, campagneSuivante('2027-01-10'));

/* ── 10. Aucun nom de famille dans le code ───────────────────────────── */
const sources = ['src/shared/bourse.ts', 'src/shared/bourse-coffre.ts', 'src/shared/bourse-pdf.ts', 'src/apps/trone/routes/pilotage/secretariat/DossierBourse.tsx'];
const interdits = /ahouansou|boya|houinsou|nym\b|n\.y\.m|kiade|kèliji|kanonsa|komakan|praxède|sètondji|suru-léré|tokplégbé|rb\/cot\/09/i;
for (const f of sources) {
  const texte = readFileSync(path.join(process.cwd(), f), 'utf8');
  vrai(`${f} ne porte aucun nom de la famille`, !interdits.test(texte), (texte.match(interdits) ?? [''])[0]);
}

console.log(rates === 0 ? '\nTOUT TIENT.' : `\n${rates} vérification(s) ratée(s).`);
if (rates > 0) process.exit(1);
