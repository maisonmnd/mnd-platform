/* LE DOSSIER DE BOURSE SCOLAIRE — le harnais. 7 octobre 2026.

   Ce qu'il tient, et qui ne doit jamais casser en silence :
   1. LA CAMPAGNE : dépôt en janvier pour la rentrée suivante ; dès juin,
      la campagne d'après. Le dépôt saisi l'emporte.
   2. LES CLASSES avancent seules d'un cran par rentrée.
   3. LES DATES : trois quittances finissant par le mois du dépôt (datée le
      25 quand le dépôt tombe en fin de mois), relevés des trois derniers
      mois COMPLETS.
   4. LES MONTANTS EN LETTRES, orthographe traditionnelle.
   5. RIEN NE S'INVENTE : un champ vide s'écrit entre crochets, et le
      Secrétariat refuse de signer un document entre crochets.
   6. LES TEXTES : ni tiret long, ni « salon », l'année toujours écrite,
      Mme Praxede BOYA (jamais « Praxeder »), un mandataire pour NYM SARL.
   7. LE PRIVÉ : chaque document préparé porte `prive`, M. Thomas BOYA
      aussi ; la base le garde (0122). Reprendre les documents ne touche pas
      un document signé.
   8. LES PDF du bordereau et des réponses se construisent ; l'assemblage
      marque les copies de papiers, pas les documents de la famille.
   9. L'ÉCRAN : l'onglet et le rappel sont à la direction seule. */
import { readFileSync } from 'node:fs';
import {
  aFaireMaintenant, aSaisir, calendrier, campagneDe, classeA, dateDeLaQuittance, documentsDeLaCampagne, enLettres, lis,
  moisDesQuittances, moisDesReleves, piecesDuClasseur, reponsesAuFormulaire,
} from '../src/shared/bourse-pur';
import {
  assembleLeDossierDeBourse, bordereauPdf, documentsDuDossier, prepareLesDocuments, reponsesPdf,
} from '../src/shared/bourse';
import { creeEntreprise, entreprises, secretariatStore, signeLaPiece } from '../src/shared/secretariat';
import { aCompleter as compteLesACompleter } from '../src/shared/secretariat-modeles';
import type { Papier } from '../src/shared/papiers-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sansCommentairesSql = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/--.*$/gm, '');

/* ── 1. LA CAMPAGNE ── */
const c = campagneDe('2026-10-07');
dit('octobre 2026 : campagne 2027-2028, revenus 2026, depot le 30 janvier 2027', ['2027-2028', 2026, '2027-01-30'], [c.cle, c.reference, c.depot]);
dit('mars 2027 : encore 2027-2028 ; juin 2027 : 2028-2029', ['2027-2028', '2028-2029'], [campagneDe('2027-03-01').cle, campagneDe('2027-06-01').cle]);
dit('le depot saisi l emporte', '2027-01-22', campagneDe('2026-10-07', '2027-01-22').depot);

/* ── 2. LES CLASSES ── */
dit('les classes avancent d un cran par rentree', ['CE2', 'CM1', '6e', '3e', 'études supérieures'],
  [classeA('CE2', 2027), classeA('CE2', 2028), classeA('CM2', 2028), classeA('4e', 2028), classeA('Tle', 2028)]);

/* ── 3. LES DATES ── */
dit('quittances : novembre, decembre, janvier pour un depot au 30 janvier', ['2026-11', '2026-12', '2027-01'], moisDesQuittances('2027-01-30'));
dit('quittance du mois du depot datee le 25, les autres le 5 du mois suivant', ['2026-12-05', '2027-01-05', '2027-01-25'],
  moisDesQuittances('2027-01-30').map((m) => dateDeLaQuittance(m, '2027-01-30')));
dit('un depot avant le 26 : les quittances finissent le mois d avant', ['2026-10', '2026-11', '2026-12'], moisDesQuittances('2027-01-15'));
dit('releves : les trois derniers mois complets', ['2026-10', '2026-11', '2026-12'], moisDesReleves('2027-01-30'));

/* ── 4. LES MONTANTS EN LETTRES ── */
dit('montants en lettres', ['soixante mille', 'soixante-et-onze', 'quatre-vingts', 'quatre-vingt mille', 'deux cents', 'deux cent mille', 'un million deux cent mille', 'vingt-et-un'],
  [60000, 71, 80, 80000, 200, 200000, 1200000, 21].map(enLettres));

/* ── 5. RIEN NE S'INVENTE ── */
dit('un champ vide s ecrit entre crochets, les sigles gardes', ['[n° d’inscription au registre des Français (NUMIC)]', '[votre poste chez NYM SARL]'], [lis({}, 'numic'), lis({}, 'poste')]);
dit('un defaut connu se reprend tel quel', 'BOYA épouse AHOUANSOU Yéman', lis({}, 'demandeur'));
dit('ce qui reste a saisir ignore les champs a defaut', false, aSaisir({}).some((x) => x.cle === 'demandeur'));
const docsVides = documentsDeLaCampagne({}, c, '[nom du mandataire]');
dit('six documents par campagne', ['03', '04', '05', '06', '07', '08'], docsVides.map((d) => d.cle));
dit('sans les donnees, l attestation NYM SARL garde ses crochets (elle ne se signera pas)', true, compteLesACompleter(docsVides[1].corps) > 0);
const v = {
  poste: 'assistante de direction', entree: '2015-03-01', brut: '4800000', net: '4200000', valeurLocative: '150000', thomasDepuis: '2012',
  naissanceDemandeur: '1990-06-15', p2Naissance: '1989-02-02', logement: 'au lot 12, Cotonou', thomasAdresse: 'au lot 3, Cotonou',
  e1Prenom: 'Aïna', e1Naissance: '2019-05-02', e2Prenom: 'Élie', e2Naissance: '2017-08-14', e3Prenom: 'Noa', e3Naissance: '2014-01-20',
};
const pleins = documentsDeLaCampagne(v, c, 'M. X');
dit('avec les donnees : plus aucun crochet dans l attestation NYM SARL', 0, compteLesACompleter(pleins[1].corps));
dit('l attestation dit le brut en lettres et en chiffres', true, pleins[1].corps.includes('quatre millions huit cent mille'));
dit('la quittance dit soixante mille', true, pleins[3].corps.includes('soixante mille'));
dit('l adresse garde son « au » dans la phrase, le perd sur l enveloppe', [true, true], [pleins[3].corps.includes('situé au lot 12'), pleins[3].destinataire.includes('\nlot 12, Cotonou\n')]);
dit('l hebergement dit la valeur locative annuelle', true, pleins[2].corps.includes('1 800 000'));

/* ── 6. LES TEXTES ── */
const tousLesTextes = [
  ...pleins.flatMap((d) => [d.titre, d.objet, d.destinataire, d.corps, d.cloture]),
  ...reponsesAuFormulaire(v, c).flatMap((b) => [b.page, ...b.lignes.flat()]),
  ...calendrier(c, [], {}, v).map((r) => r.titre),
].join('\n');
dit('ni tiret long ni « salon »', [false, false], [tousLesTextes.includes('—'), /\bsalon\b/i.test(tousLesTextes)]);
/* LE DÉPÔT EST PUBLIC : ni date de naissance ni adresse de la famille
   dans le code (elles vivent dans le dossier privé). */
const sources = ['src/shared/bourse-pur.ts', 'src/shared/bourse.ts', 'src/apps/trone/routes/pilotage/secretariat/Bourse.tsx'].map((f) => readFileSync(f, 'utf8')).join('\n');
dit('aucune date de naissance ni adresse de la famille dans le code', [false, false], [/\b19[5-9]\d-\d{2}-\d{2}\b/.test(sources), /\bQIP\b/.test(sources)]);
dit('Mme Praxede BOYA, jamais Praxeder', [true, false], [tousLesTextes.includes('Praxede BOYA'), tousLesTextes.includes('Praxeder')]);
dit('l attestation NYM SARL est signee par un mandataire, sans « ma fille »', [true, false], [pleins[1].corps.includes('agissant pour le compte de la société NYM SARL'), pleins[1].corps.includes('ma fille')]);
dit('la lettre nomme la campagne et les classes de la rentree', [true, true], [pleins[0].objet.includes('2027-2028'), pleins[0].corps.includes('en CE2')]);
dit('les quittances avant le depot', true, pleins.slice(3).every((d) => d.date < c.depot));
dit('les dates sont ecrites avec l annee', true, /\d{1,2}(er)? [a-zéû]+ \d{4}/.test(pleins[1].corps));

/* ── 7. LE PRIVÉ, avec le vrai magasin ── */
const branchId = 'br-essai';
creeEntreprise({ branchId, nom: 'NYM SARL', mentions: 'RCCM RB/COT/09 B 4639 · IFU 3200700011313 · Cotonou, Bénin', telephone: '', signataire: 'M. X, mandataire' });
const r1 = prepareLesDocuments({ branchId, moi: 'u-yeman', c, v });
dit('premiere preparation : six documents crees', [6, 0, 0], [r1.crees, r1.repris, r1.laisses]);
const prepares = documentsDuDossier(secretariatStore.get(), c);
dit('chaque document prepare est prive et rattache a la campagne', [6, true, true],
  [prepares.length, prepares.every((p) => p.prive === true), prepares.every((p) => p.dossier?.startsWith('bourse:2027-2028:'))]);
const thomas = entreprises(secretariatStore.get()).find((e) => e.nom === 'M. Thomas BOYA');
dit('M. Thomas BOYA est cree, prive, signe P/O par defaut', [true, 'P/O M. Thomas BOYA'], [thomas?.prive === true, thomas?.signataire]);
const nymDoc = prepares.find((p) => p.dossier?.endsWith(':04'))!;
dit('l attestation NYM SARL porte le cachet commercial et le signataire de l entreprise', ['auto-cachet', 'entreprise'], [nymDoc.tampon, nymDoc.signataires[0]?.userId]);
signeLaPiece(nymDoc, 'entreprise', 'data:image/png;base64,AAA');
const r2 = prepareLesDocuments({ branchId, moi: 'u-yeman', c, v: { ...v, brut: '5000000' } });
dit('reprendre : cinq repris, le signe laisse tel quel', [0, 5, 1], [r2.crees, r2.repris, r2.laisses]);
const signe = documentsDuDossier(secretariatStore.get(), c).find((p) => p.dossier?.endsWith(':04'))!;
dit('le document signe n a pas bouge', true, signe.corps.includes('quatre millions huit cent mille'));
dit('la base garde le prive (0122)', [true, true], [
  /coalesce\(data->>'prive', ''\) <> 'true'/.test(sansCommentairesSql('supabase/migrations/0122_le_secretariat_prive.sql')),
  (sansCommentairesSql('supabase/migrations/0122_le_secretariat_prive.sql').match(/<> 'true'/g) ?? []).length >= 4,
]);

/* ── 8. LES PIÈCES DU CLASSEUR ── */
const pap = (titulaire: string, type: string, delivreLe = '', expireLe = ''): Papier => ({
  id: `p-${type}-${delivreLe}`, genre: 'papier', branchId, titulaire, type, numero: '', delivreLe, expireLe, original: '', note: '',
  pages: [{ chemin: `x/${type}`, nom: `${type}.png`, type: 'image/png', taille: 1 }], versions: [], deposeLe: '', deposePar: '', journal: [],
});
const membres = { yeman: 'y', brice: 'b', e1: 'a', e2: 'e', e3: 'n', thomas: 't' };
const pp = [
  pap('pers:y', 'passeport', '2020-01-01', '2026-12-31'), pap('pers:b', 'passeport', '', '2030-01-01'),
  ...Array.from({ length: 9 }, (_, i) => pap('pers:y', 'bulletin', `2026-${String(i + 1).padStart(2, '0')}-28`)),
];
const lignes = piecesDuClasseur(pp, membres, c, '2026-10-07');
const ligne = (n: string) => lignes.find((l) => l.n === n)!;
dit('un passeport qui expire avant le depot est signale', 'alerte', ligne('4').etat);
dit('9 bulletins sur 12 en octobre : rien de manque, ils arrivent', ['9 sur 12', 'attente'], [ligne('10').dit, ligne('10').etat]);
dit('le livret de famille manque', 'manque', ligne('3').etat);
const rs = calendrier(c, pp, membres, v);
dit('les bulletins deja ranges comptent comme faits', true, rs.find((r) => r.titre.startsWith('Ranger les bulletins de salaire de janvier'))?.fait);
dit('a faire maintenant : rien dans trois semaines', false, aFaireMaintenant(rs, '2026-10-07').some((r) => r.quand > '2026-10-10'));

/* ── 8 bis. LES PDF ── */
const bord = await bordereauPdf(v, c);
const rep = await reponsesPdf(v, c);
dit('le bordereau et les reponses sont des PDF', ['%PDF', '%PDF'], [String.fromCharCode(...bord.slice(0, 4)), String.fromCharCode(...rep.slice(0, 4))]);
const png1x1 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const { octets, manquants } = await assembleLeDossierDeBourse({
  morceaux: [{ genre: 'pdf', titre: 'Bordereau', octets: bord }, { genre: 'papier', titre: 'Yéman', papier: pap('pers:y', 'livret'), titulaireNom: 'Yéman' }],
  jour: '25 janvier 2027', lisUnePage: async () => png1x1,
});
const { PDFDocument } = await import('pdf-lib');
const assemble = await PDFDocument.load(octets);
const pagesBord = (await PDFDocument.load(bord)).getPageCount();
dit('l assemblage met le bordereau puis la copie, rien de perdu', [pagesBord + 1, 0], [assemble.getPageCount(), manquants.length]);
const marques = sansCommentaires('src/shared/bourse.ts');
dit('la marque ne tombe que sur les pages des papiers', true, /for \(let i = avant; i < doc\.getPageCount\(\); i\+\+\)/.test(marques));

/* ── 9. L'ÉCRAN ── */
const page = sansCommentaires('src/apps/trone/routes/pilotage/Secretariat.tsx');
dit('l onglet Bourse est a la direction seule', [true, true], [
  page.includes("const vueDeLaBourse = onglet === 'bourse' && direction;"),
  /vueDeLaBourse \? \(\s*<LeDossierDeBourse/.test(page),
]);
dit('le rappel dans « A faire » est a la direction seule', true, sansCommentaires('src/apps/trone/routes/pilotage/AFaire.tsx').includes('{estDirection && <RappelDeLaBourse />}'));

console.log(ko === 0 ? '\nLe dossier de bourse tient ses regles.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
