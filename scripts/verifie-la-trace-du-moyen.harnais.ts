/* LA TRACE DU CHÈQUE ET DE LA CARTE, ÉPROUVÉE — `node scripts/verifie-la-trace-du-moyen.mjs`.

   Maquette « Chèque et carte » validée le 18 octobre 2026 (choix en base
   maquette/cheque-carte) : chèque = banque ET numéro, OU photo ; carte =
   n° d'autorisation du ticket, OU photo ; partout (rituel, Caisse, Marquer
   payée) ; photo privée (direction et qui l'a prise) ; « Chèques à
   déposer » ; la facture de la cliente dit « Chèque », sans plus. Les
   attentes viennent de ses choix, jamais du code. */
import { readFileSync } from 'node:fs';
import {
  AUTRE_BANQUE, BANQUES_DU_BENIN, chequesADeposer, cheminDeLaPhoto, familleDeTrace, peutVoirLaPhoto, traceAEcrire, traceDite, traceSuffit, virementDuDepot,
} from '../src/shared/trace-du-moyen-pur';
/* La caisse des chèques porte le nom du paiement depuis le 21 octobre 2026 (« Chèque »). */
import { CAISSE_CHEQUE as CAISSE_CHEQUES } from '../src/shared/caisses-des-caissiers-pur';
import { soldeDeLaPiece, versementsDuTicket } from '../src/apps/trone/routes/vente/encaissement-pur';
import { versementsDesParts } from '../src/shared/mnd-pay-pur';
import type { Invoice } from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── 1. LA RÈGLE ── */
dit('les moyens qui demandent une trace : le chèque et la carte, rien d autre', ['cheque', 'cheque', 'carte', 'carte', null, null, null],
  ['Chèque', 'cheque', 'Carte', 'Carte bancaire', 'Espèces', 'MTN MoMo', undefined].map(familleDeTrace));
const photo = { chemin: 'maison/u1/j.jpg', le: '2026-10-18T10:00:00Z' };
dit('chèque : banque ET numéro, ou une photo ; « Autre banque » sans son nom ne suffit pas ; un numéro court non plus', [true, false, false, true, false, true, false],
  [traceSuffit('cheque', { banque: 'BOA Bénin', numero: '1234567' }), traceSuffit('cheque', { banque: 'BOA Bénin' }), traceSuffit('cheque', { numero: '1234567' }),
    traceSuffit('cheque', { photo }), traceSuffit('cheque', { banque: AUTRE_BANQUE, numero: '1234567' }), traceSuffit('cheque', { banque: 'Banque Rurale', numero: '123 4567' }),
    traceSuffit('cheque', { banque: 'BOA Bénin', numero: '1234' })]);
dit('carte : le n° d autorisation du ticket, ou une photo', [true, false, true, false], [traceSuffit('carte', { autorisation: '4F7A21' }), traceSuffit('carte', {}), traceSuffit('carte', { photo }), traceSuffit('carte', { autorisation: 'ab' })]);
dit('les autres moyens ne demandent rien', true, traceSuffit(null, undefined));
dit('la liste des banques finit par « Autre banque » (proposée à part)', [true, false], [BANQUES_DU_BENIN.length >= 8, BANQUES_DU_BENIN.includes(AUTRE_BANQUE)]);
dit('la Société Générale est dans la liste (18 octobre 2026, sa demande)', true, BANQUES_DU_BENIN.includes('Société Générale Bénin'));
dit('la trace se nettoie avant de s écrire (espaces, majuscules, rien de vide)', [{ banque: 'BOA Bénin', numero: '1234567' }, { autorisation: '4F7A21', quatre: '1234' }, undefined],
  [traceAEcrire('cheque', { banque: ' BOA  Bénin ', numero: '123 4567', auNomDe: ' ' }), traceAEcrire('carte', { autorisation: '4f7a21', quatre: '1234' }), traceAEcrire('cheque', {})]);
dit('la trace se dit au Trône', ['BOA Bénin · n° 1234567 · au nom de K. Agossou', 'autorisation 4F7A21 · •••• 1234 · photo jointe'],
  [traceDite({ banque: 'BOA Bénin', numero: '1234567', auNomDe: 'K. Agossou' }), traceDite({ autorisation: '4F7A21', quatre: '1234', photo })]);
dit('la photo vit sous le compte qui l a prise ; la direction la voit, qui l a prise aussi, personne d autre', ['maison/u1/j1.jpg', true, true, false],
  [cheminDeLaPhoto('maison', 'u1', 'j1'), peutVoirLaPhoto('maison/u1/j1.jpg', { estDirection: true }), peutVoirLaPhoto('maison/u1/j1.jpg', { estDirection: false, compte: 'u1' }),
    peutVoirLaPhoto('maison/u1/j1.jpg', { estDirection: false, compte: 'u2' })]);
{
  const pieces = [
    { id: 'i1', branchId: 'b', clientId: 'c1', payments: [
      { id: 'p1', date: '2026-10-18', amountXof: 30000, method: 'Chèque', trace: { banque: 'BOA Bénin', numero: '1234567' } },
      { id: 'p2', date: '2026-10-18', amountXof: 5000, method: 'Espèces' }] },
    { id: 'i2', branchId: 'b', clientId: 'c2', payments: [{ id: 'p3', date: '2026-10-17', amountXof: 15000, method: 'Chèque', trace: { numero: '98211', banque: 'Ecobank Bénin', deposeLe: '2026-10-18' } }] },
    { id: 'i3', branchId: 'b', clientId: 'c3', payments: [{ id: 'p4', date: '2026-09-02', amountXof: 9000, method: 'Chèque' }] },
    { id: 'i4', branchId: 'autre', clientId: 'c4', payments: [{ id: 'p5', date: '2026-10-18', amountXof: 7000, method: 'Chèque', trace: { photo } }] },
  ];
  dit('chèques à déposer : ceux de la branche, avec leur trace, pas encore déposés (les chèques d avant la trace n y sont pas)', ['p1'],
    chequesADeposer(pieces, 'b', () => 'X').map((c) => c.paymentId));
}

/* ── 1 bis. LE DÉPÔT VIRE LA CAISSE DES CHÈQUES (18 octobre 2026, sa décision :
   « Une caisse « Chèques à déposer » » ; « Marquer déposés » vire au compte choisi) ── */
{
  const pieces = [
    { id: 'i1', branchId: 'b', clientId: 'c1', payments: [
      { id: 'p1', date: '2026-10-18', amountXof: 30000, method: 'Chèque', cashbox: CAISSE_CHEQUES, trace: { banque: 'BOA Bénin', numero: '1234567' } },
      { id: 'p2', date: '2026-10-18', amountXof: 12000, method: 'Chèque', cashbox: CAISSE_CHEQUES, trace: { photo } }] },
    /* encaissé à La Banque avant la caisse des chèques : il se marque déposé, il ne se vire pas */
    { id: 'i2', branchId: 'b', clientId: 'c2', payments: [{ id: 'p3', date: '2026-10-18', amountXof: 8000, method: 'Chèque', cashbox: 'La Banque', trace: { banque: 'Ecobank Bénin', numero: '98211' } }] },
  ];
  const liste = chequesADeposer(pieces, 'b', () => 'X');
  dit('la liste dit dans quelle caisse chaque chèque attend', [CAISSE_CHEQUES, CAISSE_CHEQUES, 'La Banque'], liste.map((c) => c.cashbox));
  const v = virementDuDepot({ cheques: liste, caisseDesCheques: CAISSE_CHEQUES, vers: 'La Banque', jour: '2026-10-19', branchId: 'b', id: 'trf-1' });
  dit('le dépôt vire le total des chèques de « Chèques à déposer » au compte choisi, en une ligne, ce jour-là',
    { id: 'trf-1', branchId: 'b', date: '2026-10-19', de: CAISSE_CHEQUES, vers: 'La Banque', amountXof: 42000, note: 'Dépôt de 2 chèques à la banque' }, v);
  dit('rien à virer : sans compte, vers elle-même, ou seulement des chèques d ailleurs', [null, null, null], [
    virementDuDepot({ cheques: liste, caisseDesCheques: CAISSE_CHEQUES, vers: '', jour: '2026-10-19', branchId: 'b', id: 't' }),
    virementDuDepot({ cheques: liste, caisseDesCheques: CAISSE_CHEQUES, vers: CAISSE_CHEQUES, jour: '2026-10-19', branchId: 'b', id: 't' }),
    virementDuDepot({ cheques: liste.slice(2), caisseDesCheques: CAISSE_CHEQUES, vers: 'La Banque', jour: '2026-10-19', branchId: 'b', id: 't' })]);
}

/* ── 2. LES VERSEMENTS PORTENT LA TRACE ── */
{
  const trace = { banque: 'BOA Bénin', numero: '1234567' };
  const piece = { id: 'f', kind: 'facture', date: '2026-10-18', clientId: 'c', status: 'envoyée', lines: [{ id: 'l', label: 'x', qty: 1, unitXof: 30000, discountPct: 0 }], globalDiscountPct: 0, payments: [] } as unknown as Invoice;
  const solde = soldeDeLaPiece(piece, { id: 'ip-1', jour: '2026-10-18', moyen: 'Chèque', caisse: 'La Banque', trace });
  const ticket = versementsDuTicket({ nouvelId: (() => { let n = 0; return () => `ip-${++n}`; })(), date: '2026-10-18', comptantXof: 30000, moyen: 'Chèque', caisse: 'La Banque', trace, avoirXof: 0, acompteXof: 0 });
  const parts = versementsDesParts([{ id: 'ip-p', methode: 'Carte', montantXof: 10000, trace: { autorisation: '4F7A21' } }], { date: '2026-10-18', demandes: [] });
  dit('Marquer payée, la Caisse et une part du ticket écrivent la trace sur leur versement', [trace, trace, { autorisation: '4F7A21' }],
    [solde.payments?.[0]?.trace, ticket[0]?.trace, parts[0]?.trace]);
}

/* ── 3. LES ÉCRANS ── */
{
  const act = sansCommentaires(lis('src/apps/trone/routes/clients/actions.tsx'));
  dit('l encaissement du rituel : la trace retient le bouton et la ceinture, se dit, s écrit, et ses champs paraissent', [true, true, true, true, true],
    [/const empecheTout = horsCarnet > 0 \|\| !!traceQuiManque \|\|/.test(act),
      /\|\| horsCarnet > 0 \|\| traceQuiManque\) return;/.test(act),
      /: traceQuiManque\s*\? ditCeQuiManque\(traceQuiManque\)/.test(act),
      /const trace = famTrace \? traceAEcrire\(famTrace, pt\.trace\) : undefined;[\s\S]{0,400}\.\.\.\(trace \? \{ trace \} : \{\}\),/.test(act),
      /<ChampsDeLaTrace\s+famille=\{familleDeTrace\(c\.methode\)!\}/.test(act)]);
  const caisse = sansCommentaires(lis('src/apps/trone/routes/vente/Caisse.tsx'));
  dit('la Caisse : ni part ni reste sans trace, et la trace s écrit', [true, true, true, true, true],
    [/const partPossible = [^;]*&& traceDuMoyenOk;/.test(caisse),
      /if \(!mndPay && resteApresParts > 0 && !traceDuMoyenOk\) return;/.test(caisse),
      /\|\| \(resteApresParts > 0 && !traceDuMoyenOk\)\}/.test(caisse),
      /\.\.\.\(!mndPay && famPay \? \{ trace: traceAEcrire\(famPay, traceCaisse\) \} : \{\}\),/.test(caisse),
      /<ChampsDeLaTrace famille=\{famPay\} valeur=\{traceCaisse\}/.test(caisse)]);
  const fac = sansCommentaires(lis('src/apps/trone/routes/vente/Factures.tsx'));
  dit('Factures : « Marquer payée » attend la trace et l écrit ; le détail du Trône la montre', [true, true, true, true],
    [/disabled=\{caisseManquante\(caisseDuSolde, boxesBranche\.length\) \|\| \(!!famSolde && !traceSuffit\(famSolde, traceSolde\)\)( \|\| \(!!deviseSolde && !fxSolde\))?\}/.test(fac),
      /\.\.\.\(trace \? \{ trace \} : \{\}\),\s*(\.\.\.\(fxSolde \? \{ fx: fxSolde \} : \{\}\),\s*)?\}\)\);/.test(fac),
      /<ChampsDeLaTrace famille=\{famSolde\}/.test(fac),
      /\{p\.trace && traceDite\(p\.trace\) && <> · \{traceDite\(p\.trace\)\}<\/>\}/.test(fac)]);
  /* La trace d'un versement ne descend jamais dans le document de la cliente
     (la signature manuscrite s'appelle aussi « trace » : on vise ses champs). */
  const versLaPiece = sansCommentaires(lis('src/shared/pdf.ts')) + sansCommentaires(lis('src/apps/trone/routes/vente/pdf-de-la-piece.ts'));
  dit('la facture remise à la cliente ne dit ni banque ni numéro (sa décision)', false, /traceDite|trace\??\.(banque|numero|autorisation|quatre|auNomDe)/.test(versLaPiece));
  const caisses = lis('src/apps/trone/routes/finances/Caisses.tsx');
  dit('Caisses montre les chèques à déposer', true, /<ChequesADeposer \/>/.test(caisses));
  const depot = sansCommentaires(lis('src/apps/trone/routes/finances/ChequesADeposer.tsx'));
  /* La BIIC est hors bilan et « épargne » (le tri du 19 octobre 2026) : c'est
     pourtant là que le chèque se dépose. Le choix ne l'écarte pas. */
  dit('« Marquer déposés » écrit le virement, attend le compte, exclut caissiers, devises, années passées et MND PAY, et garde la BIIC (hors bilan)', [true, true, true, true, false],
    [/if \(virement\) transfertsStore\.set\(\(prev\) => \[\.\.\.prev, virement\]\);/.test(depot),
      /disabled=\{choisis\.length === 0 \|\| \(aVirer && !virement\)\}/.test(depot),
      /!c\.caissierId[\s\S]{0,80}\(!c\.currency \|\| c\.currency === currency\)/.test(depot),
      /!\[CAISSE_CHEQUES, CAISSE_ANNEES_PASSEES, CAISSE_MND_PAY\]\.includes\(c\.name\)/.test(depot),
      /const comptes = caisses\.filter\([^;]*(horsBilan|horsEncaissement)/.test(depot)]);
  /* Depuis le 21 octobre 2026 la règle est générale : chaque paiement a sa
     caisse, qui naît au premier argent (le chèque comme les autres). */
  dit('la caisse des chèques naît au premier chèque : au rituel, à la Caisse ; Marquer payée la prend d office', [true, true, true],
    [/c\.proposee\.aCreer/.test(act) && /poseLaCaisse\(prev, neuve\)/.test(act),
      /caisseANaitre = activeCashbox && activeCashbox === proposeePos\.caisse \? proposeePos\.aCreer/.test(caisse) && /poseLaCaisse\(prev, caisseANaitre\)/.test(caisse),
      /caisseProposee\(\{\s*methode: payChoice/.test(fac) && /caisse: caisseDuSolde \|\| undefined/.test(fac)]);
  const sql = lis('supabase/migrations/0134_la_trace_des_cheques.sql');
  dit('le coffre des photos est privé ; on n y dépose que dans son dossier ; la direction et qui a pris la photo la lisent', [true, true, true, true],
    [/'traces-privees', 'traces-privees', false,/.test(sql),
      /for insert to authenticated[\s\S]{0,200}public\.is_staff\(\)\s*and \(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/.test(sql),
      /for select to authenticated[\s\S]{0,200}public\.est_direction\(\)\s*or \(public\.is_staff\(\) and \(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text\)/.test(sql),
      !/for (select|insert) to (anon|public)/.test(sql)]);
}

if (ko) { console.error(`\n${ko} controle(s) en echec.`); process.exit(1); }
console.log('\nLa trace du cheque et de la carte tient.');
