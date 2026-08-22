/* LE RAPPORT DE CAISSE, ÉPROUVÉ. Une feuille qu'on emporte à la banque ne se
   vérifie pas à l'œil une fois sur deux : on l'imprime ici pour de vrai, et on
   relit le PDF produit. Lancé par `node scripts/verifie-rapport.mjs`. */
import { jsPDF } from 'jspdf';
import { cashbookPdf, type CashLedger } from '../src/shared/pdf';

/* `save()` écrit un fichier dans un navigateur, et cherche `fs` sous Node. Ici
   on le remplace par une prise : c'est le document qu'on veut, pas le fichier.
   Le prototype se prend sur une instance — le nom de la classe change au
   paquetage, l'objet derrière ne change pas. */
let capture: any = null;
(jsPDF as any).API.save = function (this: any) { capture = this; return this; };

let echecs = 0;
const dit = (ok: boolean, quoi: string) => {
  if (!ok) { echecs++; console.log(`  ÉCHEC — ${quoi}`); }
};

const mouvements = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    date: `${String((i % 28) + 1).padStart(2, '0')} août`,
    label: i % 3 === 0 ? 'Assetina S.' : i % 3 === 1 ? 'Approvisionnement mèches' : 'Versé au coffre',
    detail: i % 3 === 0 ? `F-2026-00${10 + i}` : 'Produits · Mèches',
    inn: i % 3 === 0 ? '275 000 F' : undefined,
    out: i % 3 === 0 ? undefined : '96 000 F',
    balance: `${400 + i} 000 F`,
  }));

const livre = (nom: string, n: number): CashLedger => ({
  name: nom,
  sub: `${n} mouvements`,
  openLabel: 'Solde au 01 août',
  opening: '412 000 F',
  closeLabel: 'Solde au 31 août',
  closing: '451 000 F',
  totalIn: '700 000 F',
  totalOut: '661 000 F',
  moves: mouvements(n),
});

const editer = (o: Partial<Parameters<typeof cashbookPdf>[0]>) => cashbookPdf({
  houseName: 'Maison MND',
  eyebrow: 'Rapport de caisse',
  title: 'Le Comptoir',
  meta: ['Cotonou · XOF', 'Période du 1er au 31 août 2026'],
  groups: [{ ledgers: [livre('Le Comptoir', 9)] }],
  footer: 'Maison MND · mi nyɔ́ ɖɛkpɛ',
  filename: 'rapport.pdf',
  ...o,
});

/* ① Une caisse, un rapport lisible. */
const nomFichier = await editer({});
dit(nomFichier === 'rapport.pdf', 'le nom du fichier revient à l’appelant');
dit(capture !== null, 'le document est bien produit');
const texte: string = capture.output();
dit(texte.startsWith('%PDF'), 'le fichier est un PDF');
dit(texte.includes('Le Comptoir'), 'le nom de la caisse est écrit');
dit(texte.includes('Solde au 01 ao'), 'le solde d’ouverture ouvre le livre');

/* ② LA DEVISE PASSE LE PAPIER. WinAnsi ne sait pas tracer ɖ ni ɛ, et jsPDF ne
   dégrade pas un caractère mais LA LIGNE : sans translittération, le pied de
   page sortait en charabia (le mal du 11 août). */
dit(texte.includes('mi ny') && texte.includes('dekpe'), 'la devise s’imprime translittérée');
dit(!texte.includes('?ekpe'), 'aucun point d’interrogation à la place du fon');

/* ③ Un long livre passe à la page suivante — et l’en-tête revient avec lui,
   sinon les colonnes de la page 2 ne diraient plus ce qu’elles portent. */
capture = null;
await editer({ groups: [{ ledgers: [livre('Le Comptoir', 90)] }] });
const pages = capture.getNumberOfPages();
dit(pages > 1, `un livre de 90 lignes tient sur plusieurs pages (${pages})`);
const long: string = capture.output();
dit((long.match(/SOLDE/g) ?? []).length >= 2, 'l’en-tête des colonnes revient à chaque page');
dit(long.includes('1 / ' + String(pages)), 'les pages sont numérotées');

/* ④ Toutes les caisses : chaque monnaie tient sa rangée, et le hors bilan la
   sienne. Deux monnaies dans un même total ne voudraient rien dire. */
capture = null;
await editer({
  eyebrow: 'Rapport des caisses',
  title: 'Les caisses de Cotonou',
  groups: [
    { heading: 'XOF · 2 caisses · 792 000 F', ledgers: [livre('Le Comptoir', 6), livre('Mobile Money', 4)] },
    { heading: 'EUR · 1 caisse · 1 240 €', ledgers: [livre('Enveloppe Paris', 2)] },
  ],
  aside: {
    heading: 'Hors bilan',
    note: 'Elles n’entrent dans aucun total de la Maison.',
    groups: [{ heading: 'XOF · 1 caisse · 85 000 F', ledgers: [livre('Caisse de Maman', 1)] }],
  },
  refus: ['Une caisse est absente de ce rapport : Le Secret — caisse discrète refermée.'],
});
const tout: string = capture.output();
dit(tout.includes('Mobile Money') && tout.includes('Enveloppe Paris'), 'chaque caisse a sa section');
dit(tout.includes('EUR') && tout.includes('XOF'), 'chaque monnaie garde sa rangée');
dit(tout.includes('HORS BILAN') || tout.includes('Hors bilan'), 'le hors bilan a son propre rangement');

/* ⑤ CE QUI MANQUE SE DIT. Une caisse absente en silence ferait lire un total
   amputé comme un total complet. */
dit(tout.includes('Le Secret'), 'la caisse refusée est nommée dans le document');

/* ⑥ Un livre vide s’imprime quand même — mais EN UNE LIGNE. Deux soldes
   identiques encadrant le vide se lisaient comme un tableau cassé. */
capture = null;
await editer({ groups: [{ ledgers: [{ ...livre('Le Comptoir', 0), moves: [] }] }] });
const vide: string = capture.output();
dit(vide.includes('Le Comptoir'), 'une caisse sans mouvement s’imprime quand même');
dit(vide.includes('aucun mouvement'), 'elle le dit en toutes lettres');
dit(!vide.includes('ENTR'), 'et ne dresse pas un tableau vide');

/* ⑦ LE NOM ET SON COMPTE NE SE CHEVAUCHENT PLUS. Le compte se calait sur une
   largeur mesurée à droite du nom : « Caisse Principale11 mouvements » se
   lisait en un seul mot. Il passe dessous — donc à la MÊME abscisse que le
   nom, quelle que soit sa longueur. */
capture = null;
await editer({ groups: [{ ledgers: [livre('Une caisse au nom vraiment très long', 3)] }] });
const longNom: string = capture.output();
dit(longNom.includes('Une caisse au nom vraiment'), 'un nom long s’imprime en entier');
dit(longNom.includes('3 mouvements'), 'son compte reste lisible à côté');

console.log(echecs === 0 ? 'Tout passe.' : `${echecs} échec(s).`);
if (echecs > 0) process.exit(1);
