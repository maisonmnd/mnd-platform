import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* SES PIÈCES, ANNÉE PAR ANNÉE — `node scripts/verifie-les-documents-par-annee.mjs`.

   26 octobre 2026, Yéman, sur l'onglet Documents d'une fiche : « je veux un
   détail précis sur son total de chaque année, bien distinct ». Chaque année
   dit ses factures, leur total, le réglé, le reste ; un devis se compte à
   part et n'entre dans aucun total ; la plus récente d'abord. Sortie ASCII. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules/.cache/verifie-les-documents-par-annee');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'pur.mjs');
let ko = 0;
let n = 0;
const dit = (nom, attendu, obtenu) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${JSON.stringify(obtenu)} (attendu ${JSON.stringify(attendu)})`}`);
};

try {
  await build({ entryPoints: [path.join(racine, 'src/apps/trone/routes/clients/documents-par-annee-pur.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error' });
  const { piecesParAnnee, toutesLesAnnees } = await import(pathToFileURL(sortie).href);
  const p = (id, date, total, regle, kind = 'facture') => ({ id, date, kind, total, regle });
  const pieces = [
    p('a', '2026-09-19', 8000, 8000), p('b', '2026-05-23', 25000, 10000), p('d', '2026-03-01', 40000, 0, 'devis'),
    p('c', '2025-12-19', 31500, 0), p('e', '2025-12-18', 33000, 33000), p('f', '2024-06-01', 20000, 25000),
  ];
  const annees = piecesParAnnee(pieces, (x) => x.total, (x) => x.regle);
  dit('une ligne par annee, la plus recente d abord', ['2026', '2025', '2024'], annees.map((a) => a.annee));
  dit('2026 : 2 factures, 1 devis, 33 000 dus, 18 000 regles, 15 000 a regler', [2, 1, 33000, 18000, 15000],
    [annees[0].factures, annees[0].devis, annees[0].totalXof, annees[0].regleXof, annees[0].resteXof]);
  dit('... un devis n entre dans aucun total, mais il reste dans la liste de son annee', ['a', 'b', 'd'], annees[0].pieces.map((x) => x.id));
  dit('2025 : 64 500 dus, 33 000 regles, 31 500 a regler', [64500, 33000, 31500], [annees[1].totalXof, annees[1].regleXof, annees[1].resteXof]);
  dit('un trop-percu ne fait pas un reste negatif (le regle s arrete au total)', [20000, 20000, 0], [annees[2].totalXof, annees[2].regleXof, annees[2].resteXof]);
  dit('toutes les annees : la somme exacte', { factures: 5, devis: 1, totalXof: 117500, regleXof: 71000, resteXof: 46500 }, toutesLesAnnees(annees));
  dit('aucune piece : aucune annee', [], piecesParAnnee([], () => 0, () => 0));

  const fiche = readFileSync(path.join(racine, 'src/apps/trone/routes/clients/Customers.tsx'), 'utf8');
  dit('la fiche range SES pieces par annee, avec le tableau et le total de chaque annee', [true, true, true],
    [fiche.includes('piecesParAnnee(documents, invoiceTotal, invoiceRegleXof)'), fiche.includes('<th>Année</th>'), fiche.includes('const tout = toutesLesAnnees(annees);')]);
  dit('... sans toucher a la regle des factures du compte', [true, true],
    [/facturesDuCompte\(invoices, \{\s*moi: client\.id, autresMembres:/.test(fiche), fiche.includes("{estLePayeur ? 'Factures du compte' : 'Réglées par le compte'}")]);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nSes pieces, annee par annee (${n} controles).`);
