/* LES FACTURES D'UN COMPTE FAMILLE, EPROUVEES — 26 octobre 2026.
   `node scripts/verifie-les-factures-du-compte.mjs` (et `--prouve`).

   « Le compte enfant doit avoir juste la facture qui le concerne ; tous les
   rendez-vous du compte se voient sur le compte parent » (Yeman). La regle :
   src/apps/trone/routes/clients/factures-du-compte-pur.ts. Tout est invente,
   TOUS LES ATTENDUS SONT ECRITS A LA MAIN. Sortie ASCII. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { facturesDuCompte, pourQui } from '../src/apps/trone/routes/clients/factures-du-compte-pur';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 200)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 200)}`));
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};

/* Une famille : la mere M, qui regle ; deux enfants K et L. */
const PIECES = [
  { id: 'f1', clientId: 'M', date: '2026-08-28', forClientId: 'K' },
  { id: 'f2', clientId: 'M', date: '2026-08-12', apptId: 'rK' },
  { id: 'f3', clientId: 'M', date: '2026-08-12', apptId: 'rM' },
  { id: 'f4', clientId: 'M', date: '2026-07-01', forClientId: 'L' },
  { id: 'f5', clientId: 'K', date: '2026-06-10' },
  { id: 'f6', clientId: 'L', date: '2026-09-02' },
];
const RDV = new Map([['rK', 'K'], ['rM', 'M']]);
const ids = (l: { id: string }[]) => l.map((x) => x.id);

/* == #1 -- L ENFANT NE VOIT QUE CE QUI LA CONCERNE == */
dit(1, 'K (enfant) : sa piece nommee soignee et celle de son rituel ; ni la piece de sa mere pour elle-meme, ni celle de sa soeur', ['f1', 'f2'],
  ids(facturesDuCompte(PIECES, { moi: 'K', autresMembres: ['M', 'L'], estLePayeur: false, clienteDuRdv: RDV })));
dit(1, 'L (enfant) : la sienne seulement', ['f4'],
  ids(facturesDuCompte(PIECES, { moi: 'L', autresMembres: ['M', 'K'], estLePayeur: false, clienteDuRdv: RDV })));

/* == #2 -- LE PAYEUR VOIT TOUTES LES PIECES DES AUTRES MEMBRES, la plus recente d abord == */
dit(2, 'M (payeur) : les pieces au nom de ses enfants, toutes', ['f6', 'f5'],
  ids(facturesDuCompte(PIECES, { moi: 'M', autresMembres: ['K', 'L'], estLePayeur: true, clienteDuRdv: RDV })));

/* == #3 -- POUR QUI EST UNE PIECE == */
dit(3, 'pour qui : la soignee nommee, sinon la tete du rituel, sinon la destinataire', ['K', 'K', 'M', 'K'],
  [pourQui(PIECES[0], RDV), pourQui(PIECES[1], RDV), pourQui(PIECES[2], RDV), pourQui(PIECES[4], RDV)]);

/* == #4 -- LE CABLAGE : la fiche lit cette regle et le dit == */
{
  const fiche = source('src/apps/trone/routes/clients/Customers.tsx');
  dit(4, 'la fiche passe par facturesDuCompte avec estLePayeur ; l enfant lit « Reglees par le compte » ; « pour » se dit', [true, true, true, true], [
    /facturesDuCompte\(invoices, \{\s*moi: client\.id, autresMembres: membresDuCompte\.map\(\(m\) => m\.id\), estLePayeur, clienteDuRdv,\s*\}\)/.test(fiche),
    !/invoices\s*\.filter\(\(i\) => ids\.has\(i\.clientId\)\)/.test(fiche),
    fiche.includes("{estLePayeur ? 'Factures du compte' : 'Réglées par le compte'}"),
    fiche.includes('pourUneAutre(o) ? ` · pour ${pourUneAutre(o)}` :'),
  ]);
}

console.log(ko === 0 ? 'Chacune ses factures, le payeur toutes.' : `${ko} constat(s) en echec.`);
