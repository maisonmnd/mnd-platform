/* LA SAISIE EN SÉRIE, ÉPROUVÉE — le lecteur de dates avant tout.
   Lancé par `node scripts/verifie-serie.mjs`.

   C'est LE LECTEUR qui décide si la reprise d'une année est une bénédiction ou
   un désastre : une date mal lue ne se voit pas, elle se découvre en fin
   d'exercice quand les chiffres ne tombent plus. */
import {
  litUneLigne, litLesLignes, datesDeLaCadence, apercuDeLaSerie, caisseDeLaReprise,
} from '../src/shared/serie';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const iso = (t: string) => litUneLigne(t, 2025).iso;

/* ── ① CE QUI SE LIT SANS EFFORT ──────────────────────────────────
   La Maison a un cahier sous les yeux et tape ce qu'elle y lit. Exiger un
   format, c'est demander de traduire cinquante fois — et c'est en traduisant
   qu'on se trompe. */
dit('14/02/2025', '2025-02-14', iso('14/02/2025'));
dit('14-02-2025', '2025-02-14', iso('14-02-2025'));
dit('14.02.2025', '2025-02-14', iso('14.02.2025'));
dit('« 25 » veut dire 2025', '2025-02-14', iso('14-02-25'));
dit('sans année, celle qu’on saisit', '2025-05-19', iso('19/05'));
dit('un seul chiffre au jour', '2025-03-07', iso('7/3/2025'));
dit('le mois en toutes lettres', '2025-03-07', iso('7 mars 2025'));
dit('… abrégé', '2025-02-14', iso('14 févr. 2025'));
dit('… sans accent', '2025-02-14', iso('14 fevrier'));
dit('… en majuscules', '2025-09-04', iso('4 Septembre 2025'));
dit('… et sans année', '2025-06-23', iso('23 juin'));

/* ── ② L'HEURE, DANS TOUTES SES ÉCRITURES ────────────────────────── */
dit('09:00', '09:00', litUneLigne('14/02/2025 09:00', 2025).heure);
dit('9h', '09:00', litUneLigne('23 juin 9h', 2025).heure);
dit('9h30', '09:30', litUneLigne('23 juin 9h30', 2025).heure);
dit('14:30 sur une date à tirets', '14:30', litUneLigne('02-04-25 14:30', 2025).heure);
dit('sans heure, rien d’inventé', undefined, litUneLigne('19/05', 2025).heure);
/* UNE HEURE IMPOSSIBLE N'EST PAS UNE HEURE : 99h ne se corrige pas en 09h. */
dit('une heure impossible est ignorée', undefined, litUneLigne('19/05 99h', 2025).heure);

/* ── ③ CE QU'ON NE DEVINE JAMAIS ──────────────────────────────────
   Choisir à la place de quelqu'un décale une année entière d'un mois, et
   personne ne le voit avant les chiffres de fin d'année. */
dit('03/04 reste jour/mois', '2025-04-03', iso('03/04'));
/* LE 31 FÉVRIER N'EST PAS UNE FAUTE DE FRAPPE QU'ON CORRIGE, c'est une ligne à
   relire. La rendre au 28 écrirait un rituel un jour où il n'a pas eu lieu. */
dit('le 31 février ne se lit pas', undefined, iso('31/02/2025'));
dit('… ni le 32 du mois', undefined, iso('32/01/2025'));
dit('… ni le mois 13', undefined, iso('01/13/2025'));
dit('un mot qui n’est pas un mois', undefined, iso('14 janvir'));
dit('une ligne sans date', undefined, iso('Stephanie est venue'));
dit('une ligne vide', undefined, iso('   '));

/* LE TEXTE TAPÉ EST TOUJOURS RENDU : la ligne rouge doit dire CE QU'ON A ÉCRIT,
   pas un message générique. */
dit('la ligne illisible garde son texte', '31/02/2025', litUneLigne('31/02/2025', 2025).brut);

/* ── ④ CE QUI RESTE APRÈS LA DATE ─────────────────────────────────
   Un nom sur la ligne sert au mode « plusieurs têtes pour un mois ». */
dit('le nom survit à la date', 'Stephanie', litUneLigne('14/02 09:00 Stephanie', 2025).reste);
dit('… avant comme après', 'Stephanie', litUneLigne('Stephanie 14 février', 2025).reste);

/* ── ⑤ LE COLLAGE ENTIER ──────────────────────────────────────────
   Les vides disparaissent, les illisibles restent : c'est en les voyant qu'on
   les corrige. */
const collage = litLesLignes('14/02/2025 09:00\n\n7 mars 2025\n31/02/2025\n19/05', 2025);
dit('quatre lignes retenues', 4, collage.length);
dit('… trois lues', 3, collage.filter((l) => !!l.iso).length);
dit('… une rouge', 1, collage.filter((l) => !l.iso).length);

/* ── ⑥ LA CADENCE RÉTROACTIVE ────────────────────────────────────── */
const cadence = datesDeLaCadence({ departIso: '2025-01-10', semaines: 8, jusquIso: '2025-12-31' });
dit('sept venues en 2025 toutes les huit semaines',
  ['2025-01-10', '2025-03-07', '2025-05-02', '2025-06-27', '2025-08-22', '2025-10-17', '2025-12-12'], cadence);
dit('la borne est incluse', '2025-01-10',
  datesDeLaCadence({ departIso: '2025-01-10', semaines: 8, jusquIso: '2025-01-10' })[0]);
/* LE PLAFOND EXISTE POUR QUE LA BOUCLE FINISSE : « 3125 » au lieu de « 2025 »
   ne doit pas fabriquer mille rituels. */
dit('une borne absurde ne fabrique pas mille rituels', 60,
  datesDeLaCadence({ departIso: '2025-01-10', semaines: 8, jusquIso: '3125-12-31' }).length);
dit('un rythme à zéro vaut une semaine', 53,
  datesDeLaCadence({ departIso: '2025-01-01', semaines: 0, jusquIso: '2025-12-31', plafond: 999 }).length);

/* ── ⑦ LE GARDE DU DOUBLON ────────────────────────────────────────
   Relancer une saisie par prudence ne doit pas doubler une année. */
const deja = [
  { clientId: 'cl-1', date: '2025-05-02', status: 'honoré' },
  { clientId: 'cl-2', date: '2025-01-10', status: 'honoré' },
  { clientId: 'cl-1', date: '2025-03-07', status: 'annulé' },
];
const vu = apercuDeLaSerie({
  dates: cadence.map((d) => ({ iso: d })), clientId: 'cl-1', heureParDefaut: '11:00', dejaPoses: deja,
});
dit('sept lignes proposées', 7, vu.length);
dit('… celle du 2 mai est déjà au carnet', true, vu.find((l) => l.iso === '2025-05-02')?.dejaAuCarnet);
/* UN RITUEL ANNULÉ N'OCCUPE PAS LE JOUR : il n'a pas eu lieu. */
dit('… un rituel annulé ne bloque rien', false, vu.find((l) => l.iso === '2025-03-07')?.dejaAuCarnet);
/* CELUI D'UNE AUTRE TÊTE NON PLUS. */
dit('… ni celui d’une autre tête', false, vu.find((l) => l.iso === '2025-01-10')?.dejaAuCarnet);
dit('… et l’heure par défaut se pose', '11:00', vu[0].heure);

/* LE MÊME JOUR DEUX FOIS DANS LE MÊME COLLAGE : la seconde est une faute de
   frappe. On la garde, marquée, plutôt que de la manger en silence. */
const doublon = apercuDeLaSerie({
  dates: [{ iso: '2025-02-14' }, { iso: '2025-02-14', heure: '15:00' }],
  clientId: 'cl-1', heureParDefaut: '11:00', dejaPoses: [],
});
dit('le doublon du collage se voit', [false, true], doublon.map((l) => l.dejaAuCarnet));
/* L'APERÇU SE LIT DANS L'ORDRE DU TEMPS, quel que soit l'ordre de saisie. */
dit('l’aperçu est trié', ['2025-01-10', '2025-02-14'], apercuDeLaSerie({
  dates: [{ iso: '2025-02-14' }, { iso: '2025-01-10' }],
  clientId: 'cl-1', heureParDefaut: '11:00', dejaPoses: [],
}).map((l) => l.iso));

dit('la caisse de la reprise porte son année', 'Reprise 2025', caisseDeLaReprise(2025));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
