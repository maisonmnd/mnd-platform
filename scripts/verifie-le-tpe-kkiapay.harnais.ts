/* LE TPE KKIAPAY, ÉPROUVÉ — `node scripts/verifie-le-tpe-kkiapay.mjs`.

   22 novembre 2026 : « Il faut un meilleur moyen pour valider un paiement sur
   la TPE de KkiaPay. On ne peut pas saisir un numéro de ticket et 4 derniers
   chiffres. Comment faciliter ? » puis « les deux voies » (Yéman).
     - « Carte · KkiaPay » a sa trace : ni ticket, ni n° d'autorisation ;
     - voie 1 : les paiements signalés par KkiaPay (registre, sans cible), le
       bon montant en tête, jamais celui qu'une pièce porte déjà ;
     - voie 2 : la référence tapée, que KkiaPay confirme (kkiapay-tpe) ;
     - une référence inconnue, échouée, ou qui couvre moins que la part ne
       laisse pas encaisser ; KkiaPay muet : gardée, à pointer le soir.
   Les références et montants sont des exemples. */
import { readFileSync } from 'node:fs';
import {
  familleDeTrace, traceSuffit, traceAEcrire, traceDite, ditCeQuiManque, kkiapayCouvre, refKkiapayPlausible,
} from '../src/shared/trace-du-moyen-pur';
import { recuDuRegistre, recusAProposer, refsDejaPrises, heureDuRecu, ditLeVerdict, laReferenceSeGarde, identifiantsPossibles, PREFIXE_DE_L_AUTRE_DU_TPE } from '../src/shared/tpe-kkiapay-pur';
import { PREFIXE_DE_L_AUTRE_MONTANT } from '../src/shared/tpe-de-poche-pur';

import { MOYEN_CARTE_KKIAPAY } from '../src/shared/choix-du-moyen-pur';

let ko = 0;
let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* ── 1. LA FAMILLE ─────────────────────────────────────────────────────── */
dit('« Carte · KkiaPay » a sa trace, la carte de la banque et le chèque gardent la leur', ['kkiapay', 'carte', 'carte', 'cheque', null],
  [familleDeTrace(MOYEN_CARTE_KKIAPAY), familleDeTrace('Carte'), familleDeTrace('Carte bancaire'), familleDeTrace('Chèque'), familleDeTrace('KkiaPay')]);
dit('le TPE ne demande plus de n° d autorisation : un numéro de ticket seul ne suffit pas', false,
  traceSuffit('kkiapay', { autorisation: 'AB12CD', quatre: '1234' }, 62000));

/* ── 2. LA RÈGLE ───────────────────────────────────────────────────────── */
const verifiee = (montantXof: number) => ({ kkiapay: { ref: 'TxAb12Cd34', montantXof, fraisXof: 1426, verifieeLe: '2026-11-22T06:05:00.000Z' } });
dit('une référence confirmée par KkiaPay qui couvre la part : on encaisse', true, traceSuffit('kkiapay', verifiee(62000), 62000));
dit('un franc d arrondi passe, mille de moins non', [true, false], [traceSuffit('kkiapay', verifiee(61999), 62000), traceSuffit('kkiapay', verifiee(61000), 62000)]);
dit('le montant de la part inconnu (Caisse, Factures) : la confirmation suffit', true, traceSuffit('kkiapay', verifiee(50000)));
dit('une référence tapée mais pas encore vérifiée ne suffit pas', false, traceSuffit('kkiapay', { kkiapay: { ref: 'TxAb12Cd34' } }, 62000));
dit('KkiaPay muet : la référence est gardée et suffit', true, traceSuffit('kkiapay', { kkiapay: { ref: 'TxAb12Cd34', injoignable: true } }, 62000));
dit('une référence trop courte ne vaut rien, même « confirmée »', false, traceSuffit('kkiapay', { kkiapay: { ref: 'ab1', verifieeLe: '2026-11-22T06:05:00.000Z', montantXof: 62000 } }, 62000));
dit('la photo de l écran du TPE suffit toujours', true, traceSuffit('kkiapay', { photo: { chemin: 'maison/u1/x.jpg', le: '2026-11-22' } }, 62000));
dit('une référence plausible : six signes au moins, sans espaces', [true, true, false, false], [refKkiapayPlausible('TxAb12'), refKkiapayPlausible(' Tx Ab 12 Cd '), refKkiapayPlausible('Tx1'), refKkiapayPlausible('Tx#12345')]);
dit('ce que KkiaPay a reçu couvre-t-il la part ? (rien dit : null)', [true, false, null],
  [kkiapayCouvre(verifiee(62000).kkiapay, 62000), kkiapayCouvre(verifiee(40000).kkiapay, 62000), kkiapayCouvre({ ref: 'TxAb12Cd34' }, 62000)]);
dit('ce qui manque se dit pour le TPE, sans ticket ni autorisation', true,
  /paiement reçu de KkiaPay/.test(ditCeQuiManque('kkiapay')) && !/autorisation|ticket/.test(ditCeQuiManque('kkiapay')));

/* ── 3. CE QUI S'ÉCRIT SUR LE VERSEMENT ─────────────────────────────────── */
dit('la trace écrite garde la référence nettoyée et ce que KkiaPay a dit', {
  kkiapay: { ref: 'TxAb12Cd34', montantXof: 62000, fraisXof: 1426, source: 'CARD', verifieeLe: '2026-11-22T06:05:00.000Z', choisi: true },
}, traceAEcrire('kkiapay', { autorisation: 'PERDU', kkiapay: { ref: ' TxAb12 Cd34 ', montantXof: 62000, fraisXof: 1426, source: 'CARD', verifieeLe: '2026-11-22T06:05:00.000Z', choisi: true } }));
dit('« injoignable » ne s écrit que sans confirmation', { kkiapay: { ref: 'TxAb12Cd34', injoignable: true } },
  traceAEcrire('kkiapay', { kkiapay: { ref: 'TxAb12Cd34', injoignable: true } }));
dit('la facture dit la référence et son état', ['KkiaPay TxAb12Cd34 · vérifiée', 'KkiaPay TxAb12Cd34 · à pointer'],
  [traceDite(verifiee(62000)), traceDite({ kkiapay: { ref: 'TxAb12Cd34', injoignable: true } })]);

/* ── 4. VOIE 1 : LES PAIEMENTS REÇUS ────────────────────────────────────── */
const ligne = (id: string, at: string, amountXof: number, plus: Record<string, unknown> = {}) =>
  ({ id, branch_id: null, data: { id, provider: 'kkiapay', amountXof, feesXof: Math.ceil(amountXof * 0.023), method: 'CARD', partnerId: '', status: 'success', at, ...plus } });
dit('le registre : un paiement du TPE se lit ; un paiement en ligne (avec cible), échoué ou d un autre prestataire, non', [true, false, false, false], [
  !!recuDuRegistre(ligne('TxTpe0001', '2026-11-22T06:04:00.000Z', 62000)),
  !!recuDuRegistre(ligne('TxWeb0001', '2026-11-22T06:04:00.000Z', 25000, { partnerId: 'rdv-1' })),
  !!recuDuRegistre(ligne('TxKo00001', '2026-11-22T06:04:00.000Z', 62000, { status: 'failed' })),
  !!recuDuRegistre(ligne('TxFed0001', '2026-11-22T06:04:00.000Z', 62000, { provider: 'fedapay' })),
]);
const recus = [
  ligne('TxVieux001', '2026-11-22T02:00:00.000Z', 62000), // 4 h 05 plus tôt
  ligne('TxAutre001', '2026-11-22T05:50:00.000Z', 30000),
  ligne('TxJuste001', '2026-11-22T05:40:00.000Z', 62000),
  ligne('TxPris0001', '2026-11-22T06:00:00.000Z', 62000),
  { ...ligne('TxBranche1', '2026-11-22T06:01:00.000Z', 62000), branch_id: 'br-autre' },
].map(recuDuRegistre).filter((r): r is NonNullable<typeof r> => !!r);
const pris = refsDejaPrises([{ payments: [{ trace: { kkiapay: { ref: 'TxPris0001' } } }, { trace: {} }] }, { payments: undefined }]);
const props = recusAProposer(recus, { maintenantMs: Date.parse('2026-11-22T06:05:00.000Z'), dejaPris: pris, montantXof: 62000, branchId: 'br-maison' });
dit('proposés : trois heures, pas déjà pris, de la branche ou sans branche ; le bon montant en tête', ['TxJuste001', 'TxAutre001'], props.map((r) => r.ref));
dit('le bon montant est marqué', [true, false], props.map((r) => r.juste));
dit('les références déjà portées par une pièce', ['TxPris0001'], [...pris]);
/* « AUTRE MONTANT » DU TPE DE POCHE (lot 2b, 26 novembre 2026) : il vise `tpa-…`, aucune pièce ; il se range dans la journée. */
dit('le préfixe d un autre montant est le même des deux côtés', PREFIXE_DE_L_AUTRE_MONTANT, PREFIXE_DE_L_AUTRE_DU_TPE);
{
  const autre = recuDuRegistre(ligne('TxAutre0002', '2026-11-21T20:05:00.000Z', 15000, { partnerId: 'tpa-mif0abcd-00k3x9', motif: 'gamme', precision: 'huile', tpe: { membreId: 'm-1', nom: 'Brice' } }));
  dit('un autre montant du TPE se lit, avec son motif et l employée', { motif: 'Produit de la Gamme', precision: 'huile', nom: 'Brice' }, autre?.autre);
  dit('un paiement en ligne avec une autre cible ne se lit toujours pas', null, recuDuRegistre(ligne('TxWeb0002', '2026-11-22T06:04:00.000Z', 15000, { partnerId: 'cc-123' })));
  const vieux = recuDuRegistre(ligne('TxVieux002', '2026-11-21T20:05:00.000Z', 15000));
  const p2 = recusAProposer([autre!, vieux!], { maintenantMs: Date.parse('2026-11-22T06:05:00.000Z'), dejaPris: new Set(), montantXof: 15000 });
  dit('dix heures plus tard : l autre montant se propose encore, le paiement du TPE KkiaPay non', ['TxAutre0002'], p2.map((r) => r.ref));
  dit('un autre montant de plus d un jour ne se propose plus', [], recusAProposer([autre!], { maintenantMs: Date.parse('2026-11-22T21:00:00.000Z'), dejaPris: new Set() }).map((r) => r.ref));
}
dit('l heure se dit à Cotonou', ['7 h 05', '0 h 00'], [heureDuRecu('2026-11-22T06:05:00.000Z'), heureDuRecu('2026-11-21T23:00:00.000Z')]);
dit('chaque refus de KkiaPay se dit', [true, true, true, true],
  [/ne reconnaît pas cette référence/.test(ditLeVerdict({ ok: false, raison: 'introuvable' })), /non abouti/.test(ditLeVerdict({ ok: false, raison: 'pas-reussie', statut: 'FAILED' })),
    /déjà compté/.test(ditLeVerdict({ ok: false, raison: 'deja-en-ligne' })), /pointera le soir/.test(ditLeVerdict({ ok: false, raison: 'injoignable' }))]);
/* LE TPE INCONNU DE KKIAPAY NE BLOQUE PAS LA CAISSE — 24 novembre 2026 : un
   vrai paiement de 100 F au terminal, refusé par la route de statut, a bloqué
   un encaissement. Muet ou inconnue : la référence se garde et se pointe. */
dit('muet ou inconnue, la référence se garde ; un refus, non', [true, true, true, false, false], [
  laReferenceSeGarde({ ok: false, raison: 'injoignable' }),
  laReferenceSeGarde({ ok: false, raison: 'introuvable' }),
  traceSuffit('kkiapay', { kkiapay: { ref: '7757889838121264', injoignable: true } }, 100),
  laReferenceSeGarde({ ok: false, raison: 'pas-reussie', statut: 'FAILED' }),
  laReferenceSeGarde({ ok: false, raison: 'deja-en-ligne' }),
]);

/* ── 5. LA FONCTION kkiapay-tpe ─────────────────────────────────────────── */
{
  const src = lis('supabase/functions/kkiapay-tpe/index.ts');
  const serve = src.slice(src.indexOf('Deno.serve('));
  const i = (s: string) => serve.indexOf(s);
  dit('le navigateur la lit : CORS sur chaque réponse, OPTIONS en premier', [true, true],
    [/headers: \{ \.\.\.CORS, 'content-type': 'application\/json' \}/.test(src), i("if (req.method === 'OPTIONS')") > 0 && i("if (req.method === 'OPTIONS')") < i("if (req.method === 'GET')")]);
  dit('la porte : le personnel connecté (is_staff), avant de demander quoi que ce soit à KkiaPay', true,
    i("commeAppelant.rpc('is_staff')") > 0 && i("if (errStaff || estPersonnel !== true) return json({ ok: false, raison: 'refusee'") > i("commeAppelant.rpc('is_staff')")
      && i('await demandeAKkiapay(essai)') > i("if (errStaff || estPersonnel !== true)") && i('lesIdentifiantsPossibles(ref)') > i("if (errStaff || estPersonnel !== true)"));
  dit('le montant vient de KkiaPay, jamais du corps', [true, false],
    [/const montantXof = Math\.round\(Number\(tx\.amount \?\? 0\)\);/.test(src), /corps\?\.(montant|amount)/.test(src)]);
  dit('seul un SUCCESS est rendu comme un paiement', true, /if \(statut !== 'SUCCESS'\) return json\(\{ ok: false, raison: 'pas-reussie'/.test(src));
  dit('une référence déjà inscrite avec une cible est un paiement en ligne', true,
    /if \(deja && String\(deja\.data\?\.partnerId \?\? ''\)\.trim\(\)\) return json\(\{ ok: false, raison: 'deja-en-ligne'/.test(src));
  dit('elle inscrit au registre sans cible, une fois', [true, true],
    [/partnerId: '', status: 'success'/.test(src), /if \(error && error\.code !== '23505'\)/.test(src)]);
}

/* ── 6. LES ÉCRANS ──────────────────────────────────────────────────────── */
{
  const trace = lis('src/apps/trone/routes/vente/TraceDuMoyen.tsx');
  const enc = lis('src/apps/trone/routes/clients/actions.tsx');
  dit('sous « Carte · KkiaPay », les paiements reçus et la référence, pas le n° d autorisation', [true, true, true],
    [/famille === 'kkiapay' \? \(\n\s*<ChampsDuTpe /.test(trace), /C’est son paiement/.test(trace), /placeholder="Référence KkiaPay du reçu"/.test(trace)]);
  dit('un paiement déjà pris par une pièce ne se propose plus, ni ne se revérifie', [true, true],
    [/recusAProposer\(recus, \{ maintenantMs: Date\.now\(\), dejaPris: pris, montantXof, branchId \}\)/.test(trace), /if \(pris\.has\(ref\)\)/.test(trace)]);
  dit('l encaissement juge la trace avec le montant de la part, et le donne à l écran', [true, true],
    [/return fam && m > 0 && !traceSuffit\(fam, pt\.trace, m\) \? fam : null;/.test(enc), /etiquette=\{parts\.length > 1 \? `Part \$\{i \+ 1\}` : undefined\}\n\s*montantXof=\{x\}/.test(enc)]);
}

/* ── LES DEUX NUMÉROS DU REÇU (24 novembre 2026) ──────────────────────── */
dit('le reçu du TPE porte deux numéros, on essaie les deux', ['7757889838121264', 'rcp_7757889838121264'], identifiantsPossibles('7757889838121264'));
dit('et dans l’autre sens aussi', ['rcp_7757889838121264', '7757889838121264'], identifiantsPossibles('rcp_7757889838121264'));
dit('le montant reste celui de KkiaPay, jamais celui du corps', true, /const montantXof = Math\.round\(Number\(tx\.amount \?\? 0\)\);/.test(lis('supabase/functions/kkiapay-tpe/index.ts')) && !/corps\?\.(montant|amount)/.test(lis('supabase/functions/kkiapay-tpe/index.ts')));
dit('la Maison garde la référence du reçu, pas l’identifiant d’essai', true, /return json\(\{ ok: true, ref,/.test(lis('supabase/functions/kkiapay-tpe/index.ts')) && /repondSous/.test(lis('supabase/functions/kkiapay-tpe/index.ts')));
console.log(`\n${ko ? `${ko} echec(s) sur ${n}` : `${n}/${n} epreuves : le TPE KkiaPay.`}`);
