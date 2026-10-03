/* LE POINTAGE DU JOUR ET LA CAISSE DU SOIR, EPROUVES — `node scripts/verifie-caisse-du-soir.mjs`.

   3 octobre 2026, maquette « Le pointage du jour » validee. Les promesses :
     - le revenu du jour ne compte que l'argent RECU (ni pourboire, ni entree
       hors activite, ni rituel honore sans argent) ;
     - une ligne est pointee par KkiaPay, par le releve, a la main, ou (les
       especes) par le comptage de son tiroir ;
     - l'attendu part du COMPTE de la derniere cloture, jamais de l'attendu :
       un ecart ne se reporte pas en silence ; un encaissement saisi apres
       une cloture n'est pas perdu ; une depense en attente validee ensuite
       ne se retranche pas deux fois ;
     - un ecart ne se cloture pas sans mot ; seul le souverain le tranche,
       jamais celui qui l'a declare ;
     - la base le garde aussi (0113), la barre du tableau de bord lit la meme
       regle que sa fenetre, et le rappel de 21 h ne parle qu'a la direction. */
import { readFileSync } from 'node:fs';
import type { Receipt } from '../src/shared/receipts';
import {
  revenuDuJour, etatDuPointage, parMoyen, bilanDuPointage, attenduDuTiroir, nouvelleCloture,
  pourquoiOnNeCloturePas, pourquoiOnNeValidePas, aValider, tiroirsSansCloture, sommeDuBilletage,
  surplusAuCoffre, derniereCloture, type Cloture, type Pointage,
} from '../src/shared/caisse-du-soir-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu).slice(0, 300)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const sansCom = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');

const J = '2026-10-03';
const r = (o: Partial<Receipt> & Pick<Receipt, 'id' | 'amountXof'>): Receipt =>
  ({ kind: 'facture', date: J, clientName: 'Une cliente', method: 'Espèces', label: 'Rituel', ...o });

/* 1. Le revenu du jour. */
const registre: Receipt[] = [
  r({ id: 'r-inv-a-1', amountXof: 65000, cashbox: 'Accueil', heure: '10:42' }),
  r({ id: 'r-inv-b-1', amountXof: 38000, method: 'MTN MoMo', cashbox: 'MoMo' }),
  r({ id: 'r-pay-k1', kind: 'acompte', amountXof: 5000, method: 'KkiaPay · Mobile Money', cashbox: 'KkiaPay' }),
  r({ id: 'r-tip-a', kind: 'pourboire', amountXof: 5000, cashbox: 'Pourboires' }),
  r({ id: 'r-hors-1', kind: 'hors-activite', amountXof: 200000, cashbox: 'Accueil' }),
  r({ id: 'r-inv-c-1', amountXof: 17000, method: 'Moov', cashbox: 'MoMo', date: '2026-10-02' }),
  r({ id: 'r-cre-1', kind: 'avoir', amountXof: 10000, method: 'Espèces', cashbox: 'Accueil' }),
];
const jour = revenuDuJour(registre, J);
dit('le revenu du jour : argent recu ce jour, ni pourboire ni hors activite', ['r-inv-a-1', 'r-inv-b-1', 'r-pay-k1', 'r-cre-1'], jour.map((x) => x.id));

/* 2. L'etat du pointage. */
const pointages = new Map<string, Pointage>([['r-inv-b-1', { id: 'r-inv-b-1', branchId: 'b', date: J, montantXof: 38000, comment: 'releve', par: 'Y', le: `${J}T19:10:00Z` }]]);
dit('KkiaPay se pointe seul', 'kkiapay', etatDuPointage(registre[2], pointages, []));
dit('le releve pointe le MoMo', 'releve', etatDuPointage(registre[1], pointages, []));
dit('un MoMo sans releve est a pointer', 'a-pointer', etatDuPointage(r({ id: 'x', amountXof: 1, method: 'MTN MoMo' }), pointages, []));
dit('des especes avant cloture : au comptage', 'au-comptage', etatDuPointage(registre[0], pointages, []));
dit('... pointees par la cloture de leur tiroir', 'comptage', etatDuPointage(registre[0], pointages, [{ cashbox: 'Accueil', date: J }]));
dit('... pas par la cloture d un autre tiroir', 'au-comptage', etatDuPointage(registre[0], pointages, [{ cashbox: 'MoMo', date: J }]));
dit('... ni par une cloture de la veille', 'au-comptage', etatDuPointage(registre[0], pointages, [{ cashbox: 'Accueil', date: '2026-10-02' }]));
const bilan = bilanDuPointage(jour, (x) => etatDuPointage(x, pointages, []));
dit('les tuiles : recu, pointe, a pointer, au comptage', { recuXof: 118000, pointeXof: 43000, aPointerXof: 0, auComptageXof: 75000 }, bilan);
dit('le revenu se range par moyen, especes d abord', ['Espèces', 'MTN MoMo', 'KkiaPay, en ligne'], parMoyen(jour).map((g) => g.famille));

/* 3. L'attendu du tiroir, de soir en soir. */
dit('sans cloture precedente, le livre fait foi', 113500, attenduDuTiroir({ livreMaintenantXof: 113500 }));
const soir1 = nouvelleCloture({
  id: 'c1', branchId: 'b', cashbox: 'Accueil', date: J, attenduXof: 113500, compteXof: 111500,
  note: 'monnaie rendue en trop', fondXof: 20000, verseAuCoffreXof: surplusAuCoffre(111500, 20000),
  livreAvantCoffreXof: 113500, par: 'Accueil', le: `${J}T20:12:00Z`,
});
dit('la cloture : ecart, laisse, livre apres le coffre', { ecartXof: -2000, verseAuCoffreXof: 91500, laisseXof: 20000, livreXof: 22000 },
  { ecartXof: soir1.ecartXof, verseAuCoffreXof: soir1.verseAuCoffreXof, laisseXof: soir1.laisseXof, livreXof: soir1.livreXof });
dit('le lendemain part du COMPTE : l ecart ne se reporte pas', 70000, attenduDuTiroir({ livreMaintenantXof: 22000 + 50000, derniere: soir1 }));
dit('un encaissement saisi apres la cloture compte le soir suivant', 75000, attenduDuTiroir({ livreMaintenantXof: 22000 + 5000 + 50000, derniere: soir1 }));
/* Une depense de 3 000 F en attente au soir 1 : le livre retenu la retranche ;
   validee le lendemain, le livre du tiroir baisse et l'attente tombe d'autant. */
const livreSoir1 = 116500 - 3000;
const c = nouvelleCloture({ id: 'c2', branchId: 'b', cashbox: 'X', date: J, attenduXof: livreSoir1, compteXof: livreSoir1, fondXof: 0, verseAuCoffreXof: 0, livreAvantCoffreXof: livreSoir1, par: 'A', le: 'z' });
dit('une depense en attente, validee ensuite, ne se retranche pas deux fois', 113500, attenduDuTiroir({ livreMaintenantXof: 113500 - 0, derniere: c }));
dit('le billetage se compte', 111500, sommeDuBilletage({ 10000: 9, 5000: 3, 2000: 3, 1000: 0, 500: 1, pieces: 0 }));
dit('la derniere cloture est la plus recente', 'c1', derniereCloture([soir1, { ...soir1, id: 'c0', le: `${J}T08:00:00Z` }], 'b', 'Accueil')?.id);

/* 4. Ce qui empeche de cloturer, et de trancher. */
dit('on compte avant de cloturer', true, !!pourquoiOnNeCloturePas({ compteXof: null, ecartXof: 0, note: '', verseAuCoffreXof: 0 }));
dit('un ecart sans mot ne se cloture pas', true, !!pourquoiOnNeCloturePas({ compteXof: 100, ecartXof: -5, note: '  ', verseAuCoffreXof: 0 }));
dit('... avec son mot, oui', null, pourquoiOnNeCloturePas({ compteXof: 100, ecartXof: -5, note: 'eau', verseAuCoffreXof: 0 }));
dit('un compte juste se cloture sans mot', null, pourquoiOnNeCloturePas({ compteXof: 100, ecartXof: 0, note: '', verseAuCoffreXof: 0 }));
dit('le gerant ne tranche pas un ecart', true, !!pourquoiOnNeValidePas({ estSouverain: false, moi: 'G', cloture: soir1 }));
dit('celui qui a declare l ecart ne l accepte pas', true, !!pourquoiOnNeValidePas({ estSouverain: true, moi: 'Accueil', cloture: soir1 }));
dit('l autre souverain, oui', null, pourquoiOnNeValidePas({ estSouverain: true, moi: 'B', cloture: soir1 }));
const tranchee: Cloture = { ...soir1, id: 'c3', validation: { verdict: 'accepte', par: 'B', le: 'x' } };
const juste: Cloture = { ...soir1, id: 'c4', ecartXof: 0 };
const reprise: Cloture = { ...soir1, id: 'c5', reprend: 'c1', le: `${J}T21:00:00Z` };
dit('a valider : les ecarts sans decision, la reprise remplace la reprise', ['c5'], aValider([soir1, tranchee, juste, reprise], 'b').map((x) => x.id));

/* 5. Les tiroirs restes ouverts. */
dit('tiroirs sans cloture : ni pourboires, ni KkiaPay, ni avance', ['MoMo'], tiroirsSansCloture({
  branchId: 'b', date: J, registre: [...registre, r({ id: 'm', amountXof: 1, cashbox: 'MoMo' })],
  depenses: [{ branchId: 'b', date: J, cashbox: 'Petite caisse', avancee: true }],
  clotures: [{ branchId: 'b', cashbox: 'Accueil', date: J }],
}));

/* 6. Ce que le code et la base tiennent. */
const dash = sansCom(readFileSync('src/apps/trone/routes/pilotage/Dashboard.tsx', 'utf8'));
const ligneDayRev = /const dayRev = [^\n]+/.exec(dash)?.[0] ?? '';
dit('la barre du tableau de bord lit la meme regle que sa fenetre', true, /revenuDuJour\(registre, iso\)/.test(ligneDayRev) && !/realizedAppts/.test(ligneDayRev));
dit('... et la barre ouvre la fenetre du pointage', true, /<RevenuDuJour\b/.test(dash) && /setJourOuvert\(iso\)/.test(dash));
const sql = sansCom(readFileSync('supabase/migrations/0113_le_pointage_et_la_caisse_du_soir.sql', 'utf8'));
dit('0113 : RLS sur les deux tables des leur creation', 2, (sql.match(/alter table public\.(pointages|clotures_caisse) enable row level security/g) ?? []).length);
dit('... la decision au souverain seul', true, /clotures_decider[\s\S]*?for update[\s\S]*?using \(public\.is_souverain\(\)\) with check \(public\.is_souverain\(\)\)/.test(sql));
dit('... une cloture ne s efface que par le souverain', true, /clotures_effacer[\s\S]*?for delete[\s\S]*?public\.is_souverain\(\)/.test(sql));
dit('... l ecart se recalcule a l ecriture', true, /jsonb_set\(new\.data, '\{ecartXof\}', to_jsonb\(compte - attendu\)\)/.test(sql));
dit('... une decision ecrite par un autre est retiree', true, /not public\.is_souverain\(\)[\s\S]{0,80}new\.data - 'validation'/.test(sql));
const veille = sansCom(readFileSync('src/apps/trone/routes/finances/LaVeilleAValider.tsx', 'utf8'));
dit('l ecran : trancher demande le souverain, pas la direction elargie', true, /const souverain = me\?\.role === 'souverain';/.test(veille) && !/useEstDirection/.test(veille));
const reset = readFileSync('src/apps/trone/houseReset.ts', 'utf8');
const traces = readFileSync('src/shared/traces.ts', 'utf8');
dit('la remise a zero et les traces connaissent les deux tables', true,
  ['pointages', 'clotures_caisse'].every((t) => reset.includes(`'${t}'`) && traces.includes(`'${t}'`)));
const push = sansCom(readFileSync('supabase/functions/push-notify/index.ts', 'utf8'));
dit('le rappel de 21 h part avec le cron du personnel', true, /mode === 'staff-cron'\)[^\n]*rappelDesTiroirs\(\)/.test(push));
dit('... a la direction seule', true, /async function sendToDirection[\s\S]*?\.eq\('role', 'souverain'\)/.test(push) && /return await sendToDirection\(/.test(push));
dit('... une fois par jour, a 21 h', true, /getUTCHours\(\) !== 21/.test(push) && /kind: 'cloture'/.test(push));

console.log(ko === 0 ? '\nLa caisse du soir tient ses comptes.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
