/* LA CAISSE DU VERSEMENT, ÉPROUVÉE — `node scripts/verifie-la-caisse-du-versement.mjs`.

   4 octobre 2026 : « Que le paiement du RDV avec la caisse principale soit
   reporté sur la facture et qu'on puisse modifier au besoin. Branche le
   tout » (Yéman). L'attente vient de cette phrase :
     - la caisse du rituel se lit sur la pièce, et se corrige ;
     - le rendez-vous dit la même chose que sa pièce, après correction ;
     - rien d'autre ne bouge (une autre pièce, un avoir, ce qui n'a pas changé) ;
     - la pièce imprimée ne nomme pas les tiroirs (« au Trône seulement »).
   Les noms et montants sont des exemples. */
import { readFileSync } from 'node:fs';
import { aligneLeRituel, corrigeLeVersement, estLieALaPiece } from '../src/shared/caisse-du-versement';
import type { Invoice } from '../src/shared/finance';
import type { Appointment } from '../src/shared/agenda';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const piece = (x: Partial<Invoice>): Invoice => ({
  id: 'inv-1', branchId: 'b1', kind: 'facture', number: 'F-0001', clientId: 'c1', date: '2026-10-03',
  lines: [{ id: 'l1', label: 'SÍNSIN Essentiel', qty: 1, unitXof: 25000, discountPct: 0 }],
  globalDiscountPct: 0, theme: 'Rose', status: 'payée', ...x,
} as Invoice);
const rdv = (x: Partial<Appointment>): Appointment => ({ id: 'ap-1', clientId: 'c1', date: '2026-10-03', ...x } as Appointment);

/* 1. Le rituel encaissé au comptoir, caisse principale : le même billet porte
      deux identifiants (la pièce, le carnet). */
const avant = piece({
  payments: [{ id: 'ip-a', date: '2026-10-03', amountXof: 25000, method: 'Espèces', cashbox: 'Caisse principale' }],
  payment: 'Espèces', cashbox: 'Caisse principale', apptId: 'ap-1',
});
const apres = corrigeLeVersement(avant, 'ip-a', { cashbox: 'Caisse MoMo' });
dit('la caisse se corrige sur le versement', 'Caisse MoMo', apres.payments?.[0].cashbox);
dit('... et sur le miroir de la piece', 'Caisse MoMo', apres.cashbox);
const r = rdv({ invoiceId: 'inv-1', payments: [{ id: 'pay-9', date: '2026-10-03', amountXof: 25000, method: 'Espèces', cashbox: 'Caisse principale', invoiceId: 'inv-1' }] } as Partial<Appointment>);
dit('le rendez-vous est lie a sa piece', true, estLieALaPiece(r, avant));
const r2 = aligneLeRituel(r, avant, apres);
dit('le carnet suit : meme caisse que la piece', 'Caisse MoMo', r2.payments?.[0].cashbox);

/* 2. Le moyen et la date suivent de même. */
const apres2 = corrigeLeVersement(apres, 'ip-a', { method: 'MTN MoMo', date: '2026-10-02' });
dit('le moyen se corrige, le miroir suit', ['MTN MoMo', 'MTN MoMo'], [apres2.payments?.[0].method, apres2.payment]);
const r3 = aligneLeRituel(r2, apres, apres2);
dit('le carnet suit le moyen et la date', ['MTN MoMo', '2026-10-02'], [r3.payments?.[0].method, r3.payments?.[0].date]);

/* 3. « Caisse non dite » : la caisse s'efface, elle ne devient pas « ». */
const sans = corrigeLeVersement(avant, 'ip-a', { cashbox: undefined });
dit('effacer la caisse retire le champ', false, 'cashbox' in (sans.payments?.[0] ?? {}));

/* 4. Une pièce d'avant le journal reçoit son versement, avec la caisse. */
const ancienne = piece({ id: 'inv-old', payment: 'Espèces' });
const corrigee = corrigeLeVersement(ancienne, 'ip-inv-old', { cashbox: 'Caisse principale' });
dit('une piece d avant le journal garde la correction', [1, 25000, 'Caisse principale'],
  [corrigee.payments?.length, corrigee.payments?.[0].amountXof, corrigee.payments?.[0].cashbox]);

/* 5. Rien d'autre ne bouge. */
const autre = rdv({ payments: [{ id: 'pay-x', date: '2026-10-03', amountXof: 25000, method: 'Espèces', cashbox: 'Caisse principale', invoiceId: 'inv-2' }] } as Partial<Appointment>);
dit('le versement d une AUTRE piece reste tel quel', 'Caisse principale', aligneLeRituel(autre, avant, apres).payments?.[0].cashbox);
dit('sans changement, le rendez-vous n est pas reecrit', true, aligneLeRituel(r, avant, avant) === r);
const avecAvoir = piece({ payments: [
  { id: 'ip-av', date: '2026-10-03', amountXof: 10000, method: 'Avoir' },
  { id: 'ip-c', date: '2026-10-03', amountXof: 10000, method: 'Espèces', cashbox: 'Caisse principale' },
] });
const avoirCorrige = corrigeLeVersement(avecAvoir, 'ip-c', { cashbox: 'Caisse MoMo' });
const rAvoir = rdv({ payments: [{ id: 'pay-c', date: '2026-10-03', amountXof: 10000, method: 'Espèces', cashbox: 'Caisse principale', invoiceId: 'inv-1' }] } as Partial<Appointment>);
dit('le comptant se reconnait, jamais l avoir du meme montant', 'Caisse MoMo', aligneLeRituel(rAvoir, avecAvoir, avoirCorrige).payments?.[0].cashbox);

/* 6. Deux versements du même montant : chacun le sien, par sa date. */
const deux = piece({ payments: [
  { id: 'ip-1', date: '2026-09-20', amountXof: 12500, method: 'Espèces', cashbox: 'Caisse principale' },
  { id: 'ip-2', date: '2026-10-03', amountXof: 12500, method: 'Espèces', cashbox: 'Caisse principale' },
] });
const deuxCorr = corrigeLeVersement(deux, 'ip-2', { cashbox: 'Caisse MoMo' });
const rDeux = rdv({ payments: [
  { id: 'pay-1', date: '2026-09-20', amountXof: 12500, method: 'Espèces', cashbox: 'Caisse principale', invoiceId: 'inv-1' },
  { id: 'pay-2', date: '2026-10-03', amountXof: 12500, method: 'Espèces', cashbox: 'Caisse principale', invoiceId: 'inv-1' },
] } as Partial<Appointment>);
dit('deux versements egaux : seul celui corrige bouge', ['Caisse principale', 'Caisse MoMo'], aligneLeRituel(rDeux, deux, deuxCorr).payments?.map((p) => p.cashbox));

/* 7. Le câblage. */
const src = readFileSync('src/apps/trone/routes/vente/Factures.tsx', 'utf8');
dit('l editeur corrige le versement lui-meme', true, /corrigeLeVersement\(e\.draft, id, c\)/.test(src));
dit('l enregistrement realigne le rendez-vous', true, /estLieALaPiece\(a, avant\) \? aligneLeRituel\(a, avant, d\)/.test(src));
const imprime = src.slice(src.indexOf("{journal.length > 1 ? 'Règlements' : 'Réglé par'}"), src.indexOf('Reste dû ·'));
dit('la piece imprimee ne nomme pas les caisses', true, imprime.length > 200 && !/cashbox/.test(imprime));
dit('le detail du Trone les nomme', true, /trv-caisses-du-doc[\s\S]{0,900}p\.cashbox/.test(src));

console.log(ko === 0 ? '\nLa caisse du versement se corrige, et le rendez-vous suit.' : `\n${ko} controle(s) en echec.`);
