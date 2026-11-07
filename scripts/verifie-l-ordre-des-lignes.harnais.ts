/* MONTER OU DESCENDRE UNE LIGNE DU FORFAIT, EPROUVE : `node scripts/verifie-l-ordre-des-lignes.mjs`.
   7 novembre 2026 : « mets-moi des onglets up and down » (Y.). */
import { readFileSync } from 'node:fs';
import { deplaceLaLigne } from '../src/shared/ordre-des-lignes-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const L = ['a', 'b', 'c', 'd'];
dit('monter la deuxieme ligne', ['b', 'a', 'c', 'd'], deplaceLaLigne(L, 1, -1));
dit('descendre la deuxieme ligne', ['a', 'c', 'b', 'd'], deplaceLaLigne(L, 1, 1));
dit('monter la derniere ligne', ['a', 'b', 'd', 'c'], deplaceLaLigne(L, 3, -1));
dit('descendre la premiere ligne', ['b', 'a', 'c', 'd'], deplaceLaLigne(L, 0, 1));
dit('la premiere ne monte pas', ['a', 'b', 'c', 'd'], deplaceLaLigne(L, 0, -1));
dit('la derniere ne descend pas', ['a', 'b', 'c', 'd'], deplaceLaLigne(L, 3, 1));
dit('une ligne qui n existe pas ne change rien', ['a', 'b', 'c', 'd'], deplaceLaLigne(L, 9, -1));
dit('un indice negatif ne change rien', ['a', 'b', 'c', 'd'], deplaceLaLigne(L, -1, 1));
dit('une liste vide reste vide', [], deplaceLaLigne([], 0, 1));
dit('une seule ligne ne bouge pas', ['a'], deplaceLaLigne(['a'], 0, 1));
const source = ['a', 'b', 'c'];
const rendue = deplaceLaLigne(source, 0, 1);
dit('la liste passee n est jamais modifiee', ['a', 'b', 'c'], source);
dit('la liste rendue est une autre liste', false, rendue === source);
const lignes = [{ serviceId: 'x', afterWeeks: 4 }, { serviceId: 'y' }, { serviceId: 'z', afterWeeks: 8 }];
dit('une ligne garde ses semaines en bougeant', [{ serviceId: 'y' }, { serviceId: 'x', afterWeeks: 4 }, { serviceId: 'z', afterWeeks: 8 }], deplaceLaLigne(lignes, 0, 1));

const cat = lis('src/apps/trone/routes/vente/Catalogue.tsx');
dit('le Catalogue importe la regle', true, cat.includes("from '../../../../shared/ordre-des-lignes-pur'"));
dit('une fleche du haut, une du bas, par ligne', [true, true], [cat.includes('deplaceLaLigne(svcForm.includes, i, -1)'), cat.includes('deplaceLaLigne(svcForm.includes, i, 1)')]);
dit('la premiere ligne n a pas de fleche du haut', true, cat.includes('disabled={i === 0}'));
dit('la derniere ligne n a pas de fleche du bas', true, cat.includes('disabled={i === svcForm.includes.length - 1}'));
dit('la colonne des fleches existe dans l entete et dans la ligne', 2, cat.split("gridTemplateColumns: 'minmax(0,1fr) 84px 52px 26px'").length - 1);

console.log(ko === 0 ? '\nMonter ou descendre une ligne du forfait : tout tient.' : `\n${ko} controle(s) en echec.`);
process.exitCode = ko === 0 ? 0 : 1;
