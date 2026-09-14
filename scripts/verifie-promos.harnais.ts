/* LES CODES DE PROMOTION, ÉPROUVÉS — `node scripts/verifie-promos.mjs`.

   « Des promos flash avec des codes de réductions ? » (Yéman, 14 septembre).

   Un code de promotion touche à l'argent, et il se tape au comptoir devant
   la cliente. Quatre fautes coûteraient cher, et se lisent toutes ici :
   un code qui sert deux fois, un code qui vaut sur une autre tête, un code
   qui remise plus que sa base, et un refus qui ne dit pas pourquoi. */
import {
  normaliseLeCode, prefixeDuCode, expirationDe, fabriqueLeCode,
  pourquoiOnNePeutPasFabriquer, pourquoiLeCodeNeVautPas, codeDit,
  remiseDuCode, baseDuCode, avantageDuCode, honoreLeCode, estUtilise, estExpire,
  laMeilleureRemise, leCodeAServi, laMeilleureEnFrancs, bilanDesPromos, codesVivantsDe, instantDit,
  HEURES_DE_LA_PROMO, REMISE_MAX_PCT, type CodePromo,
} from '../src/shared/promos';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── LA LECTURE EST LIBÉRALE ──────────────────────────────────────
   Une cliente recopie un code à la main, sur un téléphone, parfois de
   mémoire. Refuser pour un tiret ou une capitale serait une insulte. */
dit('les capitales ne comptent pas', 'ECLAT15A7K', normaliseLeCode('eclat15-a7k'));
dit('les accents tombent', 'ECLAT15A7K', normaliseLeCode('Éclat15-A7K'));
dit('les espaces aussi', 'ECLAT15A7K', normaliseLeCode('  ECLAT 15 A7K '));
dit('les tirets aussi', 'ECLAT15A7K', normaliseLeCode('ECLAT15—A7K'));
dit('rien donne rien', '', normaliseLeCode(undefined));

/* ── L'ÉCRITURE EST STRICTE ─────────────────────────────────────── */
dit('le préfixe porte le pourcentage', 'ECLAT15', prefixeDuCode('Éclat', 15));
dit('sans pourcentage, le mot seul', 'ECLAT', prefixeDuCode('Éclat'));
dit('un mot vide retombe sur PROMO', 'PROMO', prefixeDuCode('   '));
dit('un mot trop long se coupe à dix', 'RESSERRAGE', prefixeDuCode('resserrage complet'));

/* ── LES 48 HEURES ──────────────────────────────────────────────── */
dit('quarante-huit heures par défaut', 48, HEURES_DE_LA_PROMO);
dit('une promo de mardi 14 h meurt jeudi 14 h', '2026-09-17T13:00:00.000Z',
  expirationDe('2026-09-15T13:00:00.000Z'));
dit('une durée choisie est respectée', '2026-09-15T19:00:00.000Z',
  expirationDe('2026-09-15T13:00:00.000Z', 6));

/* ── CE QUI EMPÊCHE DE FABRIQUER ────────────────────────────────── */
const base = { branchId: 'b1', clientId: 'c1', mot: 'Éclat' };
dit('sans tête, aucun code', 'Un code appartient à une tête : rattachez d’abord ce fil à une fiche.',
  pourquoiOnNePeutPasFabriquer({ ...base, clientId: '', remisePct: 15 }));
dit('les deux avantages à la fois se refusent', 'Choisissez un pourcentage OU un montant, pas les deux.',
  pourquoiOnNePeutPasFabriquer({ ...base, remisePct: 15, remiseXof: 2000 }));
dit('aucun avantage se refuse', 'Une promotion sans avantage n’est pas une promotion.',
  pourquoiOnNePeutPasFabriquer({ ...base }));
dit('au-delà du plafond, cela se décide', `Au-delà de ${REMISE_MAX_PCT} %, ce n’est plus une promotion : cela se décide, cela ne se tape pas.`,
  pourquoiOnNePeutPasFabriquer({ ...base, remisePct: 80 }));
dit('une promotion honnête passe', null, pourquoiOnNePeutPasFabriquer({ ...base, remisePct: 15 }));
dit('un montant en francs passe aussi', null, pourquoiOnNePeutPasFabriquer({ ...base, remiseXof: 2000 }));

/* ── LA FABRICATION ─────────────────────────────────────────────── */
const neuf = fabriqueLeCode({ ...base, remisePct: 15, maintenant: '2026-09-14T13:00:00.000Z' });
dit('le code porte le préfixe de la Maison', true, /^ECLAT15-[A-Z2-9]{3}$/.test(neuf.code));
dit('il naît vivant', false, estUtilise(neuf));
dit('il meurt dans 48 heures', '2026-09-16T13:00:00.000Z', neuf.expireLe);
dit('il nomme sa tête', 'c1', neuf.clientId);

/* DEUX CODES IDENTIQUES RENDRAIENT « il appartient à une autre cliente »
   incompréhensible : la fabrication évite ceux déjà posés. */
const occupes: CodePromo[] = Array.from({ length: 40 }, (_, i) => ({
  id: `x${i}`, branchId: 'b1', clientId: 'autre', code: `ECLAT15-A${i}`,
  creeLe: '2026-09-14T13:00:00.000Z', expireLe: '2026-09-16T13:00:00.000Z',
}));
const evite = fabriqueLeCode({ ...base, remisePct: 15, maintenant: '2026-09-14T13:00:00.000Z' }, occupes);
dit('il ne reprend jamais un code déjà posé', false,
  occupes.some((c) => normaliseLeCode(c.code) === normaliseLeCode(evite.code)));

/* ── LE JUGE DES TROIS PORTES ───────────────────────────────────── */
const vivant: CodePromo = {
  id: 'p1', branchId: 'b1', clientId: 'c1', clientNom: 'A. K.', code: 'ECLAT15-A7K',
  remisePct: 15, creeLe: '2026-09-14T13:00:00.000Z', expireLe: '2026-09-16T13:00:00.000Z',
};
const consomme: CodePromo = { ...vivant, id: 'p2', code: 'SOIN10-D4R', remisePct: 10, utiliseLe: '2026-09-15T10:00:00.000Z' };
const perime: CodePromo = { ...vivant, id: 'p3', code: 'NUIT20-M2P', remisePct: 20, expireLe: '2026-09-13T13:00:00.000Z' };
const codes = [vivant, consomme, perime];
const juge = (tape: string, clientId?: string) => pourquoiLeCodeNeVautPas({
  tape, codes, clientId, branchId: 'b1', maintenant: '2026-09-15T14:00:00.000Z',
});

dit('un code vivant, à elle, ne dit rien', null, juge('eclat15-a7k', 'c1'));
dit('un code inconnu le dit', 'Ce code n’existe pas dans la Maison.', juge('XXXX-000', 'c1'));
dit('un code sans tête nommée le dit', 'Nommez la cliente : un code de promotion appartient à une tête.', juge('ECLAT15-A7K'));
dit('un code d’une autre le dit', 'Ce code appartient à une autre cliente.', juge('ECLAT15-A7K', 'c9'));
dit('un code déjà servi dit QUAND', 'Ce code a déjà été utilisé mardi 15 septembre à 11 h.', juge('SOIN10-D4R', 'c1'));
dit('un code périmé dit QUAND', 'Ce code a expiré dimanche 13 septembre à 14 h.', juge('NUIT20-M2P', 'c1'));
dit('rien de tapé n’est pas un refus', null, juge('', 'c1'));

/* L'ORDRE DES REFUS EST VOULU : dire « expiré » à qui a tapé le code de sa
   voisine l'enverrait chercher au mauvais endroit. */
dit('la mauvaise tête passe avant la péremption', 'Ce code appartient à une autre cliente.', juge('NUIT20-M2P', 'c9'));

dit('on retrouve le code tapé sans sa ponctuation', 'p1', codeDit('eclat 15 a7k', codes, 'b1')?.id);
dit('une autre branche ne le voit pas', undefined, codeDit('ECLAT15-A7K', codes, 'b2')?.id);

/* ── CE QU'IL RETIRE ────────────────────────────────────────────── */
const lignes = [
  { serviceId: 's-sinsin', montantXof: 17000 },
  { serviceId: 's-gbeza', montantXof: 8000 },
];
dit('sans prestation nommée, il mord sur tout', 25000, baseDuCode(vivant, lignes));
dit('… et retire quinze pour cent de tout', 3750, remiseDuCode(vivant, lignes));

const cible: CodePromo = { ...vivant, serviceId: 's-gbeza' };
dit('une prestation nommée réduit la base', 8000, baseDuCode(cible, lignes));
dit('… et la remise avec elle', 1200, remiseDuCode(cible, lignes));
dit('une prestation absente du rituel ne remise rien', 0,
  remiseDuCode({ ...vivant, serviceId: 's-absent' }, lignes));

/* UN BON DE 5 000 F SUR UNE PRESTATION DE 3 000 F ne rend pas la monnaie :
   c'est une promotion, pas un crédit. */
const bon: CodePromo = { ...vivant, remisePct: undefined, remiseXof: 5000, serviceId: 's-gbeza' };
dit('un bon plus grand que sa base s’arrête à sa base', 3000,
  remiseDuCode(bon, [{ serviceId: 's-gbeza', montantXof: 3000 }]));
dit('le pourcentage prime si les deux traînent', { pct: 15, xof: 0 },
  avantageDuCode({ ...vivant, remiseXof: 9000 }));
dit('un rituel offert ne se remise pas', 0, remiseDuCode(vivant, []));

/* ── LE CUMUL — on garde la plus avantageuse, et on NOMME l’écartée ─ */
dit('le code l’emporte sur une remise famille plus faible',
  { pct: 15, source: 'le code ECLAT15-A7K', ecartee: 'la remise famille de 10 %' },
  laMeilleureRemise(10, 15, 'ECLAT15-A7K'));
dit('la remise famille l’emporte sur un code plus faible',
  { pct: 15, source: 'la remise famille', ecartee: 'le code SOIN10-D4R (10 %)' },
  laMeilleureRemise(15, 10, 'SOIN10-D4R'));
dit('sans remise famille, le code s’applique seul',
  { pct: 15, source: 'le code ECLAT15-A7K' }, laMeilleureRemise(0, 15, 'ECLAT15-A7K'));
dit('sans rien, rien', { pct: 0, source: '' }, laMeilleureRemise(0, 0, 'X'));
/* À ÉGALITÉ LE CODE RESTE ENTIER : le consommer sans qu'il apporte rien
   reviendrait à le voler à la cliente. */
dit('à égalité, la remise famille l’emporte',
  { pct: 15, source: 'la remise famille', ecartee: 'le code ECLAT15-A7K, qui vaut autant et reste utilisable' },
  laMeilleureRemise(15, 15, 'ECLAT15-A7K'));
dit('… et le code n’est pas consommé', false,
  leCodeAServi(laMeilleureRemise(15, 15, 'ECLAT15-A7K'), 'ECLAT15-A7K'));
dit('quand il gagne, il est consommé', true,
  leCodeAServi(laMeilleureRemise(10, 15, 'ECLAT15-A7K'), 'ECLAT15-A7K'));

/* ── LA MÊME RÈGLE AU COMPTOIR, EN FRANCS ───────────────────────
   Une remise posée à la main n'est pas un pourcentage : c'est ce qui sort
   du tiroir. On compare donc des francs, pas des parts. */
dit('un code plus généreux l’emporte et se consomme',
  { xof: 3750, source: 'le code ECLAT15-A7K', ecartee: 'la remise déjà posée', codeConsomme: true },
  laMeilleureEnFrancs(2000, 3750, 'ECLAT15-A7K'));
dit('une remise déjà posée plus forte garde le code entier',
  { xof: 5000, source: 'la remise déjà posée', ecartee: 'le code ECLAT15-A7K, qui ne donnerait pas davantage et reste utilisable', codeConsomme: false },
  laMeilleureEnFrancs(5000, 3750, 'ECLAT15-A7K'));
dit('à égalité, le code reste entier', false,
  laMeilleureEnFrancs(3750, 3750, 'ECLAT15-A7K').codeConsomme);
dit('sans rien posé, le code s’applique seul',
  { xof: 3750, source: 'le code ECLAT15-A7K', codeConsomme: true },
  laMeilleureEnFrancs(0, 3750, 'ECLAT15-A7K'));
dit('sans code ni remise, rien', { xof: 0, source: '', codeConsomme: false },
  laMeilleureEnFrancs(0, 0, 'X'));

/* ── L'HONNEUR, UNE SEULE FOIS ──────────────────────────────────── */
const ferme = honoreLeCode(vivant, { parQui: 'Rita G.', surPiece: 'FA-2026-0431', remiseReelleXof: 3750, maintenant: '2026-09-15T16:00:00.000Z' });
dit('le code se ferme', true, estUtilise(ferme));
dit('il dit qui l’a accepté', 'Rita G.', ferme.utilisePar);
dit('il dit sur quelle pièce', 'FA-2026-0431', ferme.surPiece);
dit('il dit ce qu’il a coûté', 3750, ferme.remiseReelleXof);
/* DEUX CAISSES QUI CLIQUENT ENSEMBLE NE REMISENT PAS DEUX FOIS. */
const rejoue = honoreLeCode(ferme, { parQui: 'Autre', surPiece: 'FA-2026-0999', remiseReelleXof: 9999, maintenant: '2026-09-15T17:00:00.000Z' });
dit('un code déjà fermé ne se rouvre pas', 'Rita G.', rejoue.utilisePar);
dit('… ni ne se remise une seconde fois', 3750, rejoue.remiseReelleXof);

dit('un code vit jusqu’à son heure', false, estExpire(vivant, '2026-09-16T12:59:00.000Z'));
dit('… et meurt à son heure pile', true, estExpire(vivant, '2026-09-16T13:00:00.000Z'));

/* ── LE REGISTRE, LU DANS LES DEUX SENS ─────────────────────────── */
dit('le bilan des promotions',
  { envoyes: 3, honores: 1, remiseXof: 2550, perimes: 1, enCours: 1 },
  bilanDesPromos([
    { ...vivant },
    { ...consomme, remiseReelleXof: 2550 },
    { ...perime },
  ], '2026-09-15T14:00:00.000Z'));

dit('ses codes vivants, du plus pressé au plus lointain',
  ['ECLAT15-A7K', 'AUTRE-B2C'],
  codesVivantsDe([
    { ...vivant, code: 'AUTRE-B2C', id: 'p9', expireLe: '2026-09-18T13:00:00.000Z' },
    vivant, consomme, perime,
  ], 'c1', '2026-09-15T14:00:00.000Z', 'b1').map((c) => c.code));

/* L'HEURE EST CELLE DU SALON, PAS CELLE DE LA MACHINE : ce harnais tourne
   aussi bien sur un poste réglé à Cotonou que sur une machine à Paris. */
dit('l’instant se dit à l’heure du salon', 'mardi 15 septembre à 14 h 30',
  instantDit('2026-09-15T13:30:00.000Z'));
dit('une date illisible ne ment pas', 'une date inconnue', instantDit('hier'));

if (ko) {
  console.error(`\n${ko} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nLes codes de promotion tiennent.');
