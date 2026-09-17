/* LE RÈGLEMENT D'UNE CONSULTATION, ÉPROUVÉ — `node scripts/verifie-consultation-reglement.mjs`.

   « Brancher le vrai paiement KkiaPay » (Yéman, 17 septembre 2026). Le Trône
   ne dit « réglés » que sur un montant posé par le serveur ; tout le reste est
   « déclaré » ou « à régler à la Maison ». */
import { litLeReglement } from '../src/shared/consultation-reglement';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const base = { client: { currency: 'XOF' } };

const enLigne = litLeReglement({ ...base, paidXof: 15000, reglement: 'kkiapay', transactionId: 'tx1' });
dit('① un montant posé par le serveur = réglée', true, enLigne.regle);
dit('② le libellé porte le montant et la référence', true, /15.{0,2}000.*réglés en ligne · réf\. tx1$/.test(enLigne.libelle));
dit('③ sans référence, pas de « réf. » orpheline', true, /réglés en ligne$/.test(litLeReglement({ ...base, paidXof: 15000, reglement: 'kkiapay' }).libelle));
dit('④ déclaré par la cliente = à rapprocher, pas réglé', { regle: false, libelle: 'règlement Mobile Money déclaré, à rapprocher' }, litLeReglement({ ...base, paidXof: 0, reglement: 'declare' }));
dit('⑤ rien = à régler à la Maison', { regle: false, libelle: 'à régler à la Maison' }, litLeReglement({ ...base, paidXof: 0 }));
dit('⑥ « kkiapay » annoncé mais 0 reçu = pas réglée', false, litLeReglement({ ...base, paidXof: 0, reglement: 'kkiapay' }).regle);
dit('⑦ un montant négatif ou absent ne crédite rien', [false, false], [litLeReglement({ ...base, paidXof: -5 }).regle, litLeReglement({ ...base, paidXof: undefined as unknown as number }).regle]);
dit('⑧ la devise de la cliente est respectée', true, litLeReglement({ client: { currency: 'EUR' }, paidXof: 23, reglement: 'kkiapay' }).libelle.includes('€') || litLeReglement({ client: { currency: 'EUR' }, paidXof: 23, reglement: 'kkiapay' }).libelle.includes('EUR'));

if (ko) { console.log(`\n${ko} échec(s).`); process.exit(1); }
console.log('\nTout passe.');
