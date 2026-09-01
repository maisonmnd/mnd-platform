/* LE BORDEREAU DE PAIE, ÉPROUVÉ — 1er septembre 2026.

   « Comment je gère les paiements de masse et je reçois juste des push à
   valider » (Yéman). Il paie ses sept salaires à la main, un par un.

   UNE ERREUR ICI NE PLANTE PAS : elle laisse quelqu'un sans salaire à la fin
   du mois, ou en fait payer un deux fois. La première se découvre devant la
   personne, la seconde ne se découvre jamais. */
import {
  ligneEstPayee, resteAVerserXof, dejaVerseXof, avancementDuRun, runEntierementVerse,
  type PayrollLine, type PayrollRun,
} from '../src/apps/trone/routes/equipe/payroll';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const ligne = (p: Partial<PayrollLine> & { net: number }): PayrollLine => ({
  employeeId: p.employeeId ?? 'e1',
  name: p.name ?? 'Quelqu’un',
  gains: {} as PayrollLine['gains'],
  deductions: {} as PayrollLine['deductions'],
  result: { net: p.net } as PayrollLine['result'],
  payeLe: p.payeLe,
  payeMoyen: p.payeMoyen,
  payeNote: p.payeNote,
} as PayrollLine);

const run = (lines: PayrollLine[]): PayrollRun => ({
  id: 'r1', period: '2026-08', status: 'valide', lines, createdAt: '2026-08-31T08:00:00Z',
} as PayrollRun);

/* ── ① LA DATE FAIT FOI, PAS UNE CASE À PART ────────────────────────
   Un booléen et une date finissent par se contredire, le jour où l'un est
   écrit sans l'autre. Alors on n'en garde qu'un, et c'est celui qui porte une
   information : quand. */
dit('sans date, pas versée', false, ligneEstPayee(ligne({ net: 100_000 })));
dit('avec une date, versée', true, ligneEstPayee(ligne({ net: 100_000, payeLe: '2026-08-31' })));
/* UNE DATE VIDE OU BLANCHE N'EST PAS UNE DATE : un champ effacé à la main
   laisse parfois une espace, et compter cette ligne comme payée priverait
   quelqu'un de son salaire sans que rien ne le dise. */
dit('une date vide ne compte pas', false, ligneEstPayee(ligne({ net: 100_000, payeLe: '' })));
dit('une date blanche non plus', false, ligneEstPayee(ligne({ net: 100_000, payeLe: '   ' })));

/* ── ② LE RESTE, ET CE QUI EST DÉJÀ PARTI ───────────────────────────
   Les deux se lisent au même endroit : c'est le chiffre qui dit où l'on en
   est quand le téléphone sonne au milieu des virements. */
const aout = run([
  ligne({ employeeId: 'a', name: 'Judith', net: 245_000, payeLe: '2026-08-31', payeMoyen: 'MTN' }),
  ligne({ employeeId: 'b', name: 'Kabirou', net: 142_000 }),
  ligne({ employeeId: 'c', name: 'Raoul', net: 128_000 }),
  ligne({ employeeId: 'd', name: 'Sandrine', net: 142_000 }),
]);
dit('ce qui reste à verser', 412_000, resteAVerserXof(aout));
dit('ce qui est déjà parti', 245_000, dejaVerseXof(aout));
dit('l’avancement se compte', { payees: 1, total: 4 }, avancementDuRun(aout));

/* LES DEUX MOITIÉS FONT LE TOUT : si elles ne se recollent pas, l'un des deux
   chiffres ment, et c'est celui qu'on ne regarde pas. */
dit('le reste et le versé font le net total', 657_000,
  resteAVerserXof(aout) + dejaVerseXof(aout));

/* ── ③ « PAYÉ » DEVIENT UN CONSTAT ──────────────────────────────────
   Aujourd'hui c'est un clic qui affirme sans vérifier. Le run ne bascule que
   lorsque la dernière ligne est cochée. */
dit('un run à moitié versé n’est pas payé', false, runEntierementVerse(aout));
const tout = run(aout.lines.map((l) => ({ ...l, payeLe: '2026-08-31' })));
dit('sept sur sept, alors oui', true, runEntierementVerse(tout));
dit('… et il ne reste rien', 0, resteAVerserXof(tout));

/* UN RUN SANS LIGNE N'EST PAS UN RUN PAYÉ. Sans cette garde, un brouillon vide
   se serait clôturé tout seul, et la Maison aurait cru avoir réglé un mois
   qu'elle n'a jamais préparé. */
dit('un run vide n’est pas payé', false, runEntierementVerse(run([])));
dit('… et il ne doit rien', 0, resteAVerserXof(run([])));

/* ── ④ CE QUI A ÉCHOUÉ RESTE VISIBLE ────────────────────────────────
   Un virement refusé se décoche AVEC un mot. Il ne disparaît pas dans un total
   qui aurait l'air juste. */
const refuse = run([
  ligne({ employeeId: 'a', name: 'Judith', net: 245_000, payeLe: '2026-08-31' }),
  ligne({ employeeId: 'b', name: 'Kabirou', net: 142_000, payeNote: 'Numéro refusé par MTN' }),
]);
dit('la ligne refusée reste à verser', 142_000, resteAVerserXof(refuse));
dit('… et le run n’est pas payé', false, runEntierementVerse(refuse));
dit('… mais son motif est gardé', 'Numéro refusé par MTN', refuse.lines[1].payeNote);

/* ── ⑤ UNE LIGNE ABÎMÉE NE FAUSSE PAS LE TOTAL ──────────────────────
   Même règle que `runTotals` : une donnée distante malformée ne doit pas
   casser le rendu ni gonfler un chiffre. Un net absent vaut zéro, il ne vaut
   pas « NaN » propagé à toute la colonne. */
dit('un net absent vaut zéro', 142_000,
  resteAVerserXof(run([
    ligne({ employeeId: 'x', name: 'Sans net', net: undefined as unknown as number }),
    ligne({ employeeId: 'b', name: 'Kabirou', net: 142_000 }),
  ])));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
