/* LA GAMME PAYÉE À LA CAISSE, ÉPROUVÉE — `node scripts/verifie-la-gamme-payee-a-la-caisse.mjs`.

   24 octobre 2026 : « Elle a payé 76 000 F hier ; quand j'ouvre son
   rendez-vous, il reste à encaisser 9 000 F pour la Gamme. Ça ne reconnaît
   pas le paiement des 9 000 F inclus dans le total » (Yéman, A. S.). La
   Caisse du comptoir encaissait la Gamme du rendez-vous sans la graver
   « réglée ». La règle (shared/gamme : `piecesDuRendezVous`,
   `gammePayeeSurSesPieces`), la Caisse, « Encaisser le rituel », le Carnet et
   la regravure. Tout est inventé. Sortie ASCII : la console de Windows. */
import { gammePayeeSurSesPieces, piecesDuRendezVous, lignesARegler, type LigneGamme, type PieceDeLaGamme } from '../src/shared/gamme';
import { readFileSync } from 'node:fs';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

/* ── Le cas du samedi ─────────────────────────────────────────────────── */
const NOMS: Record<string, string> = { 'p-huile': 'L’Huile de Nuit', 'p-brume': 'La Brume Sacrée' };
const nom = (id: string) => NOMS[id];
const GAMME: LigneGamme[] = [{ id: 'p-huile', qty: 1, prixXof: 9000 }];
const RDV = { id: 'rdv-as', invoiceId: 'MND-2026-0412', payments: [{ invoiceId: 'MND-2026-0412' }] };
const TICKET: PieceDeLaGamme = {
  id: 'MND-2026-0412', kind: 'facture', status: 'payée', date: '2026-10-23',
  lines: [{ label: 'SÍNSIN™ Signature · La Reprise Longue Durée', qty: 1 }, { label: 'L’Huile de Nuit', qty: 1 }],
};
const regravee = gammePayeeSurSesPieces(GAMME, piecesDuRendezVous(RDV, [TICKET]), nom);
dit('le ticket de la Caisse (76 000 F, flacon compris) regrave la Gamme au jour du ticket', [{ id: 'p-huile', qty: 1, prixXof: 9000, regleeAt: '2026-10-23' }], regravee);
dit('... et l ecran du rituel ne redemande plus rien', 0, lignesARegler(regravee).length);

/* ── La règle, dans les deux sens ─────────────────────────────────────── */
dit('les pieces du rendez-vous : la sienne, celles de ses versements, celle qui le designe ; jamais une autre', ['a', 'b', 'c'],
  piecesDuRendezVous({ id: 'r', invoiceId: 'a', payments: [{ invoiceId: 'b' }] },
    [{ id: 'a', date: '' }, { id: 'b', date: '' }, { id: 'c', date: '', apptId: 'r' }, { id: 'z', date: '' }]).map((p) => p.id));
dit('rien a regraver : le meme tableau rendu (l appelant n ecrit rien)', [true, true], [
  gammePayeeSurSesPieces(GAMME, [], nom) === GAMME,
  gammePayeeSurSesPieces([{ ...GAMME[0], regleeAt: '2026-10-01' }], [TICKET], nom)?.[0].regleeAt === '2026-10-01']);
dit('une piece pas encore payee (envoyee) ne regrave rien', [undefined],
  (gammePayeeSurSesPieces(GAMME, [{ ...TICKET, status: 'envoyée' }], nom) ?? []).map((l) => l.regleeAt));
dit('deux flacons promis, un seul au ticket : la ligne reste ouverte', [undefined],
  (gammePayeeSurSesPieces([{ id: 'p-huile', qty: 2, prixXof: 9000 }], [TICKET], nom) ?? []).map((l) => l.regleeAt));
dit('la ligne de l ecran du rituel porte son produit : elle se reconnait par lui', ['2026-10-22'],
  (gammePayeeSurSesPieces([{ id: 'p-brume', qty: 1, prixXof: 7000 }],
    [{ id: 'F-1', kind: 'facture', status: 'payée', date: '2026-10-22', lines: [{ label: 'Brume', qty: 1, produitId: 'p-brume' }] }], nom) ?? []).map((l) => l.regleeAt));
dit('le nom se lit sans accents ni majuscules ; un autre produit ne compte pas', ['2026-10-23', undefined],
  (gammePayeeSurSesPieces([{ id: 'p-huile', qty: 1, prixXof: 9000 }, { id: 'p-brume', qty: 1, prixXof: 7000 }],
    [{ ...TICKET, lines: [{ label: "l'huile de nuit", qty: 1 }] }], (id) => (id === 'p-huile' ? 'L’Huile de Nuit'.replace('’', "'") : NOMS[id])) ?? []).map((l) => l.regleeAt));
dit('un devis n est pas une piece payee', [undefined],
  (gammePayeeSurSesPieces(GAMME, [{ ...TICKET, kind: 'devis' }], nom) ?? []).map((l) => l.regleeAt));

/* ── Les écrans ──────────────────────────────────────────────────────── */
const caisse = sansCommentaires('src/apps/trone/routes/vente/Caisse.tsx');
dit('la Caisse grave la Gamme du rendez-vous qu elle encaisse, au jour de la vente', [true, true], [
  caisse.includes("if (l.kind === 'product') panierDuTicket[l.key.slice(2)] = (panierDuTicket[l.key.slice(2)] ?? 0) + l.qty;"),
  caisse.includes('...((a.gamme?.length ?? 0) > 0 ? { gamme: graveLesLignesReglees(a.gamme, panierDuTicket, dateVente) } : {}),')]);
const rituel = sansCommentaires('src/apps/trone/routes/clients/actions.tsx');
dit('Encaisser le rituel relit la Gamme sur les pieces du rendez-vous, et regrave', [true, true], [
  rituel.includes('const gammePromise = gammePayeeSurSesPieces( appt.gamme, piecesDuRendezVous(appt, piecesDeLaGamme),'),
  rituel.includes('useLaGammePayeeRegravee();')]);
dit('le Carnet regrave des l ouverture (sa pastille « + Gamme » dit vrai)', true,
  sansCommentaires('src/apps/trone/routes/clients/Carnet.tsx').includes('export default function Carnet() { useLaGammePayeeRegravee();'));
const regrave = sansCommentaires('src/apps/trone/routes/clients/gamme-payee.ts');
dit('la regravure attend les trois tables, une fois par seance, et ne touche que la Gamme', [true, true, true], [
  regrave.includes("const tables = ['appointments', 'invoices', 'catalog_products'];") && regrave.includes('quandTablePrete(t, uneDePlus)'),
  regrave.includes('if (restantes > 0 || faite) return; faite = true;'),
  regrave.includes('return g ? { ...a, gamme: g } : a;')]);

console.log(`\n${n - ko}/${n} epreuves : la Gamme payee a la Caisse est reconnue.`);
if (ko) console.log(`${ko} ECHEC(S).`);
