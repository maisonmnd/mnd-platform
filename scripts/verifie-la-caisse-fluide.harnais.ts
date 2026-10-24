/* LA CAISSE DU COMPTOIR, FLUIDE, EPROUVEE — 24 octobre 2026.
   `node scripts/verifie-la-caisse-fluide.mjs` (et `--prouve`).

   « Tu n'as pas construit la page du paiement. Elle doit etre smooth et
   intelligente » (Yeman) ; maquette EUoSyHQd..., ses quatre arbitrages : en
   tete ce qui est a encaisser maintenant, le moyen habituel choisi d'avance,
   la monnaie rendue, un ecran de reussite. Et trois defauts releves par
   l'inventaire du jour.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires des arbitrages, jamais du code
   eprouve. Le cablage de la Caisse se lit dans la source, commentaires effaces. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aEncaisserMaintenant, billetsRonds, moyenHabituel, offreAProposer, renduDeMonnaie } from '../src/apps/trone/routes/vente/caisse-fluide-pur';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 220)}`));
};
const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};
const caisse = source('src/apps/trone/routes/vente/Caisse.tsx');

/* ══ #1 — A ENCAISSER MAINTENANT : du jour, au fauteuil ou fini, pas regle ══ */
{
  type R = { id: string; date: string; time: string; status: 'confirmé' | 'en attente' | 'honoré' | 'annulé'; clientId: string; invoiceId?: string; du: number; piece?: boolean };
  const rdvs: R[] = [
    { id: 'fini', date: '2026-10-24', time: '10:00', status: 'honoré', clientId: 'c1', du: 40_000 },
    { id: 'plus-tard', date: '2026-10-24', time: '15:00', status: 'confirmé', clientId: 'c2', du: 20_000 },
    { id: 'au-fauteuil', date: '2026-10-24', time: '12:50', status: 'confirmé', clientId: 'c3', du: 5_000 },
    { id: 'hier', date: '2026-10-23', time: '09:00', status: 'confirmé', clientId: 'c4', du: 10_000 },
    { id: 'annule', date: '2026-10-24', time: '09:30', status: 'annulé', clientId: 'c5', du: 10_000 },
    { id: 'facture', date: '2026-10-24', time: '09:00', status: 'honoré', clientId: 'c6', invoiceId: 'inv-1', du: 10_000 },
    { id: 'regle', date: '2026-10-24', time: '08:30', status: 'honoré', clientId: 'c7', du: 0 },
    { id: 'sans-cliente', date: '2026-10-24', time: '09:15', status: 'confirmé', clientId: '', du: 10_000 },
    { id: 'piece-ailleurs', date: '2026-10-24', time: '09:45', status: 'honoré', clientId: 'c8', du: 10_000, piece: true },
    { id: 'tot', date: '2026-10-24', time: '08:00', status: 'en attente', clientId: 'c9', du: 15_000 },
  ];
  const vus = aEncaisserMaintenant(rdvs, { aujourdhui: '2026-10-24', maintenantMin: 13 * 60 + 25, dejaSaPiece: (a) => !!a.piece, duXof: (a) => a.du });
  dit(1, 'a 13 h 25 : le plus ancien en premier, ni plus tard, ni hier, ni annule, ni facture, ni regle, ni sans cliente', ['tot', 'fini', 'au-fauteuil'], vus.map((a) => a.id));
}

/* ══ #2 — SON MOYEN HABITUEL : ses derniers versements, sans l'acompte ni l'avoir ══ */
{
  const piece = (date: string, ...m: string[]) => ({ clientId: 'c1', kind: 'facture' as const, date, payment: m[0], payments: m.map((x) => ({ method: x, date, amountXof: 1000 })) });
  const pieces = [
    piece('2026-10-01', 'Espèces'), piece('2026-10-05', 'MTN MoMo'), piece('2026-10-09', 'MTN MoMo', 'Acompte'),
    piece('2026-10-12', 'Avoir', 'Avoir', 'Avoir'), piece('2026-10-15', 'MTN MoMo'),
    { ...piece('2026-10-20', 'Carte'), clientId: 'c2' },
  ];
  const possibles = ['Espèces', 'MTN MoMo', 'Carte', 'Chèque'];
  dit(2, 'trois MTN contre une espece, l avoir et l acompte ne comptent pas, une autre cliente non plus', 'MTN MoMo', moyenHabituel(pieces as never, 'c1', possibles));
  dit(2, 'a egalite, le plus recent ; un moyen que la Caisse ne propose plus ne compte pas ; sans venue, rien', ['Carte', 'Espèces', null],
    [moyenHabituel([piece('2026-10-01', 'Espèces'), piece('2026-10-03', 'Carte')] as never, 'c1', possibles) ?? null,
      moyenHabituel([piece('2026-10-01', 'Espèces'), piece('2026-10-03', 'Wave'), piece('2026-10-04', 'Wave')] as never, 'c1', possibles) ?? null,
      moyenHabituel([] as never, 'c1', possibles) ?? null]);
}

/* ══ #3 — LA MONNAIE : les billets ronds, ce qu'on rend, ce qui manque ══ */
{
  dit(3, 'les billets ronds au-dessus du du, jamais en dessous', [[33_000, 35_000, 40_000, 50_000], [40_000, 50_000], []], [billetsRonds(33_000), billetsRonds(40_000), billetsRonds(0)]);
  dit(3, '33 000 F du : elle donne 40 000 F, on rend 7 000 F ; 30 000 F, il manque 3 000 F ; rien tape, rien a dire', [{ renduXof: 7_000, manqueXof: 0 }, { renduXof: 0, manqueXof: 3_000 }, { renduXof: 0, manqueXof: 0 }],
    [renduDeMonnaie(33_000, 40_000), renduDeMonnaie(33_000, 30_000), renduDeMonnaie(33_000, 0)]);
}

/* ══ #4 — L'OFFRE QUI COURT SE PROPOSE, jamais quand un code est deja tape ══ */
{
  const rose = { active: true, du: '2026-10-01', au: '2026-10-31', code: 'ROSE15', discountPct: 15, serviceIds: ['retwist'], title: 'Octobre Rose' };
  const lignes = [{ serviceId: 'retwist', montantXof: 55_000 }];
  const le24 = new Date('2026-10-24T12:00:00');
  const p = offreAProposer([rose], lignes, { codeTape: '', maintenant: le24 });
  dit(4, 'ROSE15 court et retirerait 8 250 F sur la prestation', [rose.code, 8_250], [p?.offre.code ?? null, p?.retireXof ?? null]);
  dit(4, 'un code deja tape, une offre eteinte, ou rien a remiser : rien a proposer', [null, null, null], [
    offreAProposer([rose], lignes, { codeTape: 'MAMAN-A7K', maintenant: le24 }),
    offreAProposer([{ ...rose, active: false }], lignes, { codeTape: '', maintenant: le24 }),
    offreAProposer([rose], [{ serviceId: 'shampoing', montantXof: 5_000 }], { codeTape: '', maintenant: le24 }),
  ]);
}

/* ══ #5 — LE CABLAGE DE LA CAISSE ══ */
{
  const fin = caisse.lastIndexOf('</TempsDeLaCaisse>');
  dit(5, 'les trois temps, la recherche, a encaisser maintenant, l offre proposee, la monnaie, la reussite', [true, true, true, true, true, true, true, true], [
    /<TempsDeLaCaisse titre="Le ticket"/.test(caisse) && /<TempsDeLaCaisse titre="Les remises"/.test(caisse) && /<TempsDeLaCaisse titre="Comment elle paie"/.test(caisse),
    /aEncaisserMaintenant\(carnet, \{ aujourdhui: todayIso\(\), maintenantMin,/.test(caisse),
    /const offreProposee = offreAProposer\(offresDeLaBranche, lignesRemisables, \{ codeTape \}\);/.test(caisse) && /onClick=\{\(\) => setCodeTape\(offreProposee\.offre\.code \?\? ''\)\}/.test(caisse),
    /const habituel = moyenHabituel\(invoices, clientId, moyensDeLaCaisse\);/.test(caisse) && /if \(!payTouche\.current\) setPay\(habituel \?\? ''\);/.test(caisse),
    /const \[pay, setPay\] = useState<PaymentMethod>\(''\);/.test(caisse),
    /const monnaie = renduDeMonnaie\(duEnEspeces, donne\);/.test(caisse) && /billetsRonds\(duEnEspeces\)\.map/.test(caisse),
    /setReussite\(\{/.test(caisse) && /onClick=\{ticketSuivant\}/.test(caisse) && /<RdvModal title="Son prochain rendez-vous"/.test(caisse),
    fin > 0 && caisse.indexOf('{pay === MND && (\n                <PanneauMndPay', fin) > fin,
  ]);
  dit(5, 'on n encaisse pas sans moyen, ni des especes qui ne couvrent pas le du', [true, true], [
    /if \(!mndPay && resteApresParts > 0 && \(!pay \|\| especesCourtes\)\) return;/.test(caisse),
    /disabled=\{\(resteApresParts > 0 && \(!pay \|\| especesCourtes\)\) \|\| lines\.length === 0/.test(caisse),
  ]);
}

/* ══ #6 — LES TROIS DEFAUTS DE L'INVENTAIRE ══ */
dit(6, 'la barre du pouce garde la trace ; le stock se date de la vente ; l alerte de devise lit le bon reglage', [true, true, true], [
  /\|\| \(pay !== MND && resteApresParts > 0 && !traceDuMoyenOk\)\}/.test(caisse),
  /venteGamme\(l\.key\.slice\(2\), l\.qty, inv\.number, dateVente, branch\.id\)/.test(caisse),
  /\{fxOnEff\n\s*\? `Aucune caisse en \$\{payCurrency\}/.test(caisse),
]);

console.log(ko === 0 ? 'Tout tient.' : `${ko} constat(s) en echec.`);
