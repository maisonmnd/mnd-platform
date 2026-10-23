/* UN POURBOIRE PAR RITUEL, ÉPROUVÉ — `node scripts/verifie-un-pourboire-par-rituel.mjs`.

   « Refuse de donner les pourboires plusieurs fois sur un même rituel »
   (Yéman, 23 octobre 2026) : un second poste avait inscrit un second
   pourboire sur un rituel déjà réglé avec le sien. La règle
   (src/shared/pourboire-du-rituel.ts) et l'écran qui la porte. Chaque
   épreuve dit la règle. Tout est inventé. Sortie ASCII : la console de
   Windows. */
import { pourboireDejaRecu, piecesAvecPourboire } from '../src/shared/pourboire-du-rituel';
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
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');

/* ── La règle ─────────────────────────────────────────────────────────── */
const rdv = { id: 'r1', invoiceId: 'inv-a', payments: [{ invoiceId: 'inv-a' }, { invoiceId: 'inv-b' }] };
dit('un rituel sans piece n a pas de pourboire', null, pourboireDejaRecu(rdv, []));
dit('sa piece sans pourboire : pas de pourboire', null, pourboireDejaRecu(rdv, [{ id: 'inv-a', kind: 'facture' }]));
dit('sa piece porte 2 000 F : il a deja son pourboire', { montantXof: 2000, date: '2026-10-23', numero: 'F-2026-0800' },
  pourboireDejaRecu(rdv, [{ id: 'inv-a', kind: 'facture', tipXof: 2000, date: '2026-10-23', number: 'F-2026-0800' }]));
dit('le pourboire d une piece de versement compte aussi', 1500,
  pourboireDejaRecu(rdv, [{ id: 'inv-a', kind: 'facture' }, { id: 'inv-b', kind: 'facture', tipXof: 1500 }])?.montantXof);
dit('la piece de pourboire seul d un rituel solde compte (pourboireDe)', 1000,
  pourboireDejaRecu({ id: 'r2' }, [{ id: 'inv-p', kind: 'facture', tipXof: 1000, pourboireDe: 'r2' }])?.montantXof);
dit('la piece d un AUTRE rituel ne compte pas', null,
  pourboireDejaRecu({ id: 'r3' }, [{ id: 'inv-p', kind: 'facture', tipXof: 1000, pourboireDe: 'r2' }, { id: 'inv-x', kind: 'facture', tipXof: 500, apptId: 'r9' }]));
dit('un devis ne porte pas de pourboire encaisse', null, pourboireDejaRecu({ id: 'r4' }, [{ id: 'd1', kind: 'devis', tipXof: 1000, apptId: 'r4' }]));
dit('deux pieces a pourboire (le cas de N. M.) : le total se dit, la plus ancienne date aussi', { montantXof: 4000, date: '2026-10-22' },
  pourboireDejaRecu({ id: 'r5', invoiceId: 'inv-1' }, [
    { id: 'inv-2', kind: 'facture', tipXof: 2000, pourboireDe: 'r5', date: '2026-10-23' },
    { id: 'inv-1', kind: 'facture', tipXof: 2000, date: '2026-10-22' },
  ]));
dit('les pieces relues sont celles du rituel', ['inv-a'], piecesAvecPourboire(rdv, [{ id: 'inv-a', kind: 'facture', tipXof: 1 }, { id: 'inv-z', kind: 'facture', tipXof: 1 }]).map((p) => p.id));

/* ── L'écran d'encaissement ───────────────────────────────────────────── */
const ecran = sansCommentaires('src/apps/trone/routes/clients/actions.tsx');
dit('l encaissement lit le pourboire deja recu sur ce rituel', true, ecran.includes('const pourboireDeja = pourboireDejaRecu(appt, piecesDuPourboire);'));
dit('un rituel qui a son pourboire n en ecrit plus aucun (le montant tombe a zero)', true,
  ecran.includes('const tip = pourboireDeja ? 0 : Math.max(0, Math.round(Number(tipStr) || 0));'));
dit('le champ laisse la place a ce qui a ete recu', true,
  ecran.includes('{pourboireDeja ? (') && ecran.includes('Pourboire déjà reçu sur ce rituel'));
dit('la piece de pourboire seul est reliee a son rituel, et les parts a leur piece', true,
  ecran.includes('pourboireDe: appt.id,') && ecran.includes('idPieceEncaissee = inv.id; invoicesStore.set((prev) => [inv, ...prev]);'));
dit('la piece de pourboire seul ne prend PAS apptId (reserve a la piece du rituel)', false,
  /lines: \[ligneFacture\(`Pourboire · \$\{appt\.master\}`, 0\)\][^}]*apptId/.test(ecran));

console.log(`\n${n - ko}/${n} epreuves : un rituel ne recoit qu un pourboire.`);
if (ko) console.log(`${ko} ECHEC(S).`);
