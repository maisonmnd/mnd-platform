/* L'OPTION COULEUR, ÉPROUVÉE — voies, rythmes, reprises, supplément.
   Lancé par `node scripts/verifie-couleur.mjs`.

   L'option se vend au comptoir, sur une dame qui vient de dire son âge à voix
   haute. Le chiffre annoncé doit être juste du premier coup : le corriger
   ensuite, c'est revenir sur une parole donnée à quelqu'un qui n'attendait
   pas qu'on le fasse. */
import {
  VOIES, RYTHMES, REMISE_OPTION_PCT, reprisesDeCouleur, supplementCouleurXof,
  supplementSansRemiseXof, partMensuelleXof, libelleCouleur, voieDe, rythmeDe,
} from '../src/shared/couleur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Les prix du catalogue au 28 août — YÈKPÈ™ Ébène et YÈKPÈ™ Lumière. */
const EBENE = 5_000;
const ARGENT = 25_000;

/* ── ① DEUX VOIES, DEUX RYTHMES, ET RIEN D'AUTRE ───────────────────
   Une troisième voie qui apparaîtrait sans son prix se vendrait à zéro. */
dit('deux voies', ['ebene', 'argent'], VOIES.map((v) => v.k));
dit('deux rythmes', ['legere', 'reguliere'], RYTHMES.map((r) => r.k));
dit('chaque voie porte son nom et sa promesse', [],
  VOIES.filter((v) => !v.nom.trim() || !v.promesse.trim() || !v.dit.trim()).map((v) => v.k));
dit('chaque voie sait quelle prestation elle sert', [],
  VOIES.filter((v) => !v.serviceIdDefaut.trim()).map((v) => v.k));

/* ── ② LES REPRISES SUIVENT LE RESSERRAGE ──────────────────────────
   En rythme léger, une venue sur deux, ARRONDI VERS LE HAUT : sur cinq venues
   elle en a trois, jamais deux. La Maison donne le passage de trop. */
dit('régulière : autant de reprises que de venues', 6, reprisesDeCouleur(6, 'reguliere'));
dit('légère : une venue sur deux', 3, reprisesDeCouleur(6, 'legere'));
dit('… arrondie vers le HAUT sur un nombre impair', 3, reprisesDeCouleur(5, 'legere'));
dit('… et sur une seule venue, elle en a une', 1, reprisesDeCouleur(1, 'legere'));
dit('huit venues, quatre reprises en léger', 4, reprisesDeCouleur(8, 'legere'));
dit('aucune venue, aucune reprise', 0, reprisesDeCouleur(0, 'reguliere'));
dit('un quota négatif ne crée pas de reprise', 0, reprisesDeCouleur(-3, 'reguliere'));

/* ── ③ LE SUPPLÉMENT, SUR LE PRIX DU CATALOGUE ─────────────────────
   Aucun tarif n'est écrit dans le code : il se lit au catalogue à l'instant
   du calcul. Un prix recopié aurait vieilli le jour d'un changement, et la
   cliente aurait payé l'ancien. */
dit('la remise d’abonnement vaut 15 %', 15, REMISE_OPTION_PCT);
dit('L’Ébène régulière sur six venues', 25_500, supplementCouleurXof(6, EBENE));
dit('L’Ébène légère sur six venues', 13_000, supplementCouleurXof(3, EBENE));
dit('L’Ébène régulière sur huit venues', 34_000, supplementCouleurXof(8, EBENE));
dit('L’Argent régulière sur six venues', 127_500, supplementCouleurXof(6, ARGENT));
dit('L’Argent légère sur six venues', 64_000, supplementCouleurXof(3, ARGENT));

/* Le prix plein, pour dire à la cliente ce qu'elle gagne. */
dit('au prix plein, six Ébène', 30_000, supplementSansRemiseXof(6, EBENE));
dit('… elle gagne donc', 4_500, supplementSansRemiseXof(6, EBENE) - supplementCouleurXof(6, EBENE));

/* ── ④ LES PRIX SE DISENT EN BILLETS ───────────────────────────────
   Un supplément à 12 749 F ne se prononce pas au comptoir. Tout tombe sur le
   demi-millier le plus proche. */
dit('tout supplément tombe sur un demi-millier', [true, true, true, true],
  [supplementCouleurXof(3, EBENE), supplementCouleurXof(6, EBENE),
    supplementCouleurXof(3, ARGENT), supplementCouleurXof(7, ARGENT)].map((x) => x % 500 === 0));

/* ── ⑤ LES BORNES — une option qui ne peut pas se facturer ─────────
   Sans prestation rattachée au catalogue, l'option ne se facture pas : elle
   se signale. Rendre un prix inventé serait pire que rendre zéro. */
dit('sans prestation, aucun supplément', 0, supplementCouleurXof(6, 0));
dit('sans reprise, aucun supplément', 0, supplementCouleurXof(0, EBENE));
dit('une remise de 100 % rend zéro', 0, supplementCouleurXof(6, EBENE, 100));
/* Une remise NÉGATIVE ne remise rien — elle ne majore surtout pas : un
   supplément plus cher que la carte serait un piège, pas une offre. */
dit('une remise négative ne remise rien', 30_000, supplementCouleurXof(6, EBENE, -40));

/* ── ⑥ LA PART MENSUELLE — pour que le MRR reste vrai ──────────────
   Un supplément annuel non normalisé gonflerait le revenu récurrent du mois
   de la signature, puis disparaîtrait des mois suivants. */
dit('un supplément annuel se ramène au mois', 2_125, partMensuelleXof(25_500, 12));
dit('un supplément mensuel reste lui-même', 4_250, partMensuelleXof(4_250, 1));
dit('zéro mois ne divise rien', 0, partMensuelleXof(25_500, 0));

/* ── ⑦ CE QUI SE LIT DANS UN TABLEAU ───────────────────────────────── */
dit('le libellé dit la voie et le rythme', 'L’Ébène · à chaque venue',
  libelleCouleur({ voie: 'ebene', rythme: 'reguliere' }));
dit('… et pour l’autre voie', 'L’Argent · une venue sur deux',
  libelleCouleur({ voie: 'argent', rythme: 'legere' }));
dit('chaque voie se retrouve par sa clé', 'L’Argent', voieDe('argent').nom);
dit('chaque rythme aussi', 'Légère', rythmeDe('legere').nom);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
