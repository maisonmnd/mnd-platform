/* LA REVUE DU 10 OCTOBRE 2026, LOT « VENTE-BIS », EPROUVEE —
   `node scripts/verifie-revue-vente-bis.mjs` (et `--prouve`).

   Sept constats de la revue de code, chacun rejoue ici sur le VRAI code :
   #47 la signature des lettres du pret a l'ecran (Prets), #50 le code de
   promotion qui s'empilait sur la remise deja posee (Caisse, CRITIQUE),
   #51 le rituel repris au ticket sans sa remise ni son acompte, #52 changer
   de cliente au comptoir, #53 la part avoir comptee comme des billets,
   #55 « Marquer payee » sans versement du jour, #56 l'annee sur les dates
   envoyees a la payeuse du foyer.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de la promesse (le recit du
   constat), jamais du code eprouve. Une garde d'ecran ou un texte se lit
   dans la source, commentaires effaces.

   REPRISE DU 10 OCTOBRE 2026, apres relecture : le cablage de l'argent de
   la Caisse (#51, #53) se lit argument par argument, l'argent deja recu
   garde ses dates et un rituel qui a encore sa piece ne se reprend pas
   (#51), changer de tete remet l'avoir tape a zero (#52), et l'annee se
   juge par une REGLE sur toute la fenetre du foyer (#56). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  leTicket, versementsDuTicket, ceQueLeRendezVousRecoit, soldeDeLaPiece, caisseManquante,
  lArgentDejaRecu, aDejaSaPiece,
} from '../src/apps/trone/routes/vente/encaissement-pur';
import { peutSignerALEcran, signatureQuiSurvit } from '../src/apps/trone/routes/finances/lettres-du-pret';
import { apptTotalXof, apptNetXof, apptDueXof, frShortAn, frDay } from '../src/apps/trone/routes/clients/_shared';
import { remiseDuComptoirAuRendezVous } from '../src/shared/offres-pur';
import { invoiceTotal, invoiceReglements, invoiceSoldee, invoiceResteXof, invoiceRegleAu, invoiceCaisseAu, ligneFacture, type Invoice } from '../src/shared/finance';
import { sansTiroir } from '../src/shared/caisse-du-versement';
import type { Appointment } from '../src/shared/agenda';
import type { Service } from '../src/shared/catalog';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
/* La console Windows parle cp1252 : tout ce qui sort est ramene a l'ASCII. */
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 220)}`));
};

/* LA SOURCE TELLE QUE LE BANC DOIT LA LIRE : commentaires effaces (un mot
   dans un commentaire ne prouve rien), et, en preuve, la faute remise. */
const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};
const CAISSE = 'src/apps/trone/routes/vente/Caisse.tsx';
const FACTURES = 'src/apps/trone/routes/vente/Factures.tsx';
const PRETS = 'src/apps/trone/routes/finances/Prets.tsx';
const caisse = source(CAISSE);
const factures = source(FACTURES);
const prets = source(PRETS);
const a = (o: object) => o as unknown as Appointment;
const byId = new Map<string, Service>();

/* ══ #50 — LE CODE QUI GAGNE REMPLACE LA REMISE DEJA POSEE (CRITIQUE) ══
   Le recit du constat : 80 000 F de prestations, −10 % poses a la main,
   ROSE15 a 12 000 F. L'ecran dit « on garde le code, la remise deja posee
   est ecartee » : la cliente paie 68 000 F, pas 60 000 F. */
{
  const base = { sousTotalXof: 80_000, prestationsXof: 80_000, remisePct: 10, remiseXof: 0, remiseDuRendezVousXof: 0, dejaRecuXof: 0, nomDuCode: 'ROSE15' };
  const t = leTicket({ ...base, promoBrutXof: 12_000 });
  dit(50, '80 000 F, -10 %, ROSE15 a 12 000 F : net 68 000 F, le code consomme', [68_000, 12_000, true], [t.netXof, t.promoXof, t.cumul.codeConsomme]);
  dit(50, '... la remise posee est ecartee de la piece (0 %, 12 000 F)', [0, 0, 12_000], [t.remisePct, t.remiseXof, t.remisePct + t.remiseXof + t.promoXof]);
  dit(50, '... le rituel solde recoit 68 000 F', 68_000, t.partNetteXof);
  const piece = { lines: [ligneFacture('Rituel', 80_000)], globalDiscountPct: t.remisePct, globalDiscountXof: t.remiseXof + t.remiseDuRendezVousXof + t.promoXof } as unknown as Invoice;
  dit(50, '... la piece ecrite dit le meme net (invoiceTotal)', 68_000, invoiceTotal(piece));
  const manuel = leTicket({ ...base, remiseXof: 3_000, promoBrutXof: 12_000 });
  dit(50, '-10 % et 3 000 F a la main (11 000 F) contre 12 000 F : 68 000 F, jamais 57 000 F', 68_000, manuel.netXof);
  const petit = leTicket({ ...base, promoBrutXof: 5_000 });
  dit(50, 'un code plus petit (5 000 F) que la remise posee (8 000 F) : 72 000 F, code garde', [72_000, 0, false], [petit.netXof, petit.promoXof, petit.cumul.codeConsomme]);
  dit(50, 'Caisse : le net et la piece viennent de leTicket', [true, true, true, false, false], [
    /const ticket = leTicket\(\{/.test(caisse),
    /globalDiscountPct: ticket\.remisePct,/.test(caisse),
    /globalDiscountXof: \(ticket\.remiseXof \+ ticket\.remiseDuRendezVousXof \+ promoXof\) \|\| undefined,/.test(caisse),
    /\(1 - globalDisc \/ 100\)\) - globalDiscXof - promoXof/.test(caisse),
    /globalDiscountPct: globalDisc,/.test(caisse),
  ]);
}

/* ══ #51 — LE RITUEL REPRIS APPORTE SA REMISE ET SON ACOMPTE ══
   Ce que le ticket fait payer au comptoir pour un rendez-vous est ce que ce
   rendez-vous doit encore (apptDueXof) : 40 000 F, remise de 6 000 F,
   acompte verifie de 10 000 F : 24 000 F a payer, pas 40 000 F. */
{
  const rdv = a({ id: 'r1', clientId: 'c', serviceIds: ['sv'], status: 'confirmé', date: '2026-10-10', priceXof: 40_000, discountXof: 6_000, depositXof: 10_000, depositConfirmed: true });
  const entree = (x: Appointment, promo = 0) => ({
    sousTotalXof: 40_000, prestationsXof: 40_000, remisePct: 0, remiseXof: 0,
    remiseDuRendezVousXof: Math.max(0, apptTotalXof(x, byId) - apptNetXof(x, byId)),
    dejaRecuXof: Math.max(0, apptNetXof(x, byId) - apptDueXof(x, byId)),
    promoBrutXof: promo, nomDuCode: 'ROSE15',
  });
  const t = leTicket(entree(rdv));
  dit(51, 'remise 6 000 F, acompte 10 000 F : la piece vaut 34 000 F, 24 000 F au comptoir', [34_000, 10_000, 24_000], [t.netXof, t.acompteXof, t.aPayerXof]);
  dit(51, '... ce que le comptoir fait payer est ce que le rendez-vous doit', 24_000, apptDueXof(rdv, byId));
  const recu = ceQueLeRendezVousRecoit({ partNetteXof: t.partNetteXof, acompteXof: t.acompteXof, avoirXof: 0 });
  dit(51, '... le rendez-vous recoit 24 000 F, pas une deuxieme fois l acompte', { comptantXof: 24_000, avoirXof: 0 }, recu);
  const remise = remiseDuComptoirAuRendezVous({ brutDuRituelXof: 40_000, encaisseXof: t.partNetteXof, resteAvantXof: apptDueXof(rdv, byId) + t.acompteXof });
  const apres = a({ ...rdv, discountXof: 6_000 + remise, paidXof: 24_000, payments: [{ id: 'p', amountXof: 24_000, date: '2026-10-10', method: 'Espèces' }] });
  dit(51, '... et le Carnet ne lui doit plus rien, sans remise inventee', [0, 0], [remise, apptDueXof(apres, byId)]);
  /* Le code gagne contre la remise du rendez-vous : 12 000 F contre 6 000 F. */
  const c = leTicket(entree(rdv, 12_000));
  dit(51, 'ROSE15 (12 000 F) contre la remise du rendez-vous (6 000 F) : 28 000 F, 18 000 F au comptoir', [28_000, 18_000], [c.netXof, c.aPayerXof]);
  const remiseC = remiseDuComptoirAuRendezVous({ brutDuRituelXof: 40_000, encaisseXof: c.partNetteXof, resteAvantXof: apptDueXof(rdv, byId) + c.acompteXof });
  const apresC = a({ ...rdv, discountXof: 6_000 + remiseC, paidXof: 18_000, payments: [{ id: 'p', amountXof: 18_000, date: '2026-10-10', method: 'Espèces' }] });
  dit(51, '... le rendez-vous recoit 6 000 F de remise en plus et ne doit plus rien', [6_000, 0], [remiseC, apptDueXof(apresC, byId)]);
  const forfait = a({ id: 'r2', clientId: 'c', serviceIds: ['sv'], status: 'confirmé', date: '2026-10-10', priceXof: 40_000, forfait: { totalXof: 30_000, baseXof: 40_000 } });
  dit(51, 'un forfait de 30 000 F sur 40 000 F : 30 000 F au comptoir, ce qu il doit', [30_000, 30_000], [leTicket(entree(forfait)).aPayerXof, apptDueXof(forfait, byId)]);
  dit(51, 'Caisse : la remise et l acompte se lisent sur le rendez-vous, l acompte compte au reste d avant', [true, true, true], [
    /remiseDuRendezVousXof: rituelChoisi \? Math\.max\(0, apptTotalXof\(rituelChoisi, svcById\) - apptNetXof\(rituelChoisi, svcById\)\) : 0,/.test(caisse),
    /dejaRecuXof: rituelChoisi \? Math\.max\(0, apptNetXof\(rituelChoisi, svcById\) - apptDueXof\(rituelChoisi, svcById\)\) : 0,/.test(caisse),
    /resteAvantXof: apptDueXof\(\{ \.\.\.a, \.\.\.fige \}, svcById\) \+ acompteImpute,/.test(caisse),
  ]);
}

/* ══ #51 (REPRISE DU 10 OCTOBRE 2026) — L'ARGENT DEJA RECU GARDE SES DATES,
   ET UN RITUEL QUI A ENCORE SA PIECE NE SE REPREND PAS ══
   La relecture : un versement de septembre pose au Carnet, fondu en un
   « Acompte » au jour de la vente, passait en octobre au chiffre d'affaires ;
   un rituel dont une autre piece existe encore y reecrivait l'argent de
   celle-ci, compte deux fois. Rituel de 40 000 F, acompte verifie de
   10 000 F le 1er octobre, 5 000 F poses au Carnet le 20 septembre. */
{
  const rdv = a({ id: 'r5', clientId: 'c', serviceIds: ['sv'], status: 'confirmé', date: '2026-10-10', priceXof: 40_000,
    depositXof: 10_000, depositConfirmed: true, depositConfirmedAt: '2026-10-01T09:30:00.000Z',
    paidXof: 5_000, payments: [{ id: 'p1', amountXof: 5_000, date: '2026-09-20', method: 'Espèces' }] });
  const deja = lArgentDejaRecu(rdv, '2026-10-10');
  dit(51, 'l argent deja recu, chacun a son jour, le plus ancien d abord', [['2026-09-20', 5_000], ['2026-10-01', 10_000]], deja.map((d) => [d.date, d.amountXof]));
  const t = leTicket({ sousTotalXof: 40_000, prestationsXof: 40_000, remisePct: 0, remiseXof: 0, remiseDuRendezVousXof: 0,
    dejaRecuXof: Math.max(0, apptNetXof(rdv, byId) - apptDueXof(rdv, byId)), promoBrutXof: 0, nomDuCode: '' });
  dit(51, '... le ticket impute 15 000 F, 25 000 F au comptoir', [15_000, 25_000], [t.acompteXof, t.aPayerXof]);
  let k = 0;
  const v = versementsDuTicket({ nouvelId: () => `ip-${++k}`, date: '2026-10-10', comptantXof: t.aPayerXof, moyen: 'Espèces', caisse: 'Caisse principale',
    avoirXof: 0, acompteXof: t.acompteXof, acompteDate: '2026-10-01', dejaRecu: deja });
  dit(51, '... la piece les inscrit a leurs dates, sans tiroir, puis le comptant du jour', [['Acompte', 5_000, '2026-09-20', true], ['Acompte', 10_000, '2026-10-01', true], ['Espèces', 25_000, '2026-10-10', false]],
    v.map((p) => [p.method, p.amountXof, p.date, sansTiroir(p)]));
  const piece = { id: 'inv5', number: 'MND-5', date: '2026-10-10', status: 'payée', lines: [ligneFacture('Rituel', 40_000)], globalDiscountPct: 0, depositCreditXof: 15_000, payments: v } as unknown as Invoice;
  dit(51, '... septembre garde ses 5 000 F, le tiroir du 10 recoit 25 000 F, la piece est soldee', [5_000, 10_000, 25_000, 25_000, true],
    [invoiceRegleAu(piece, '2026-09'), invoiceRegleAu(piece, '2026-10-01'), invoiceRegleAu(piece, '2026-10-10'), invoiceCaisseAu(piece, '2026-10-10'), invoiceSoldee(piece)]);
  const borne = versementsDuTicket({ nouvelId: () => `ip-${++k}`, date: '2026-10-10', comptantXof: 0, moyen: 'Espèces', avoirXof: 0, acompteXof: 12_000, dejaRecu: deja });
  dit(51, 'le ticket n en impute que 12 000 F : 5 000 F du 20 septembre, 7 000 F du 1er octobre', [['2026-09-20', 5_000], ['2026-10-01', 7_000]], borne.map((p) => [p.date, p.amountXof]));
  dit(51, 'un journal d avant (le seul paidXof) prend le jour de la vente ; l acompte sans date, celui du rituel', [['2026-10-10', 8_000]],
    lArgentDejaRecu(a({ id: 'r6', date: '2026-10-08', paidXof: 8_000 }), '2026-10-10').map((d) => [d.date, d.amountXof]));
  dit(51, '... acompte verifie sans jour de verification : le jour du rituel', [['2026-10-08', 6_000]],
    lArgentDejaRecu(a({ id: 'r7', date: '2026-10-08', depositXof: 6_000, depositConfirmed: true }), '2026-10-10').map((d) => [d.date, d.amountXof]));
  dit(51, 'un acompte demande mais non verifie n est pas de l argent recu', 0, lArgentDejaRecu(a({ id: 'r8', date: '2026-10-08', depositXof: 6_000 }), '2026-10-10').length);
  /* Apres la suppression de la derniere de deux pieces : le rituel n'a plus
     d'invoiceId, mais son premier versement nomme la piece qui existe. */
  const apresRetour = a({ id: 'r9', clientId: 'c', payments: [{ id: 'p', amountXof: 20_000, date: '2026-09-05', invoiceId: 'f1' }] });
  dit(51, 'un rituel dont une piece existe encore (par son versement, par apptId, par invoiceId) a deja sa piece', [true, true, true], [
    aDejaSaPiece(apresRetour, [{ id: 'f1', kind: 'facture' }]),
    aDejaSaPiece(a({ id: 'r9' }), [{ id: 'f2', kind: 'facture', apptId: 'r9' }]),
    aDejaSaPiece(a({ id: 'r9', invoiceId: 'f3' }), [{ id: 'f3', kind: 'facture' }]),
  ]);
  dit(51, '... sa piece supprimee, un devis, une piece d une autre : il ne l a pas', [false, false, false], [
    aDejaSaPiece(apresRetour, []),
    aDejaSaPiece(a({ id: 'r9' }), [{ id: 'd1', kind: 'devis', apptId: 'r9' }]),
    aDejaSaPiece(a({ id: 'r9' }), [{ id: 'f4', kind: 'facture' }, { id: 'f5', kind: 'facture', apptId: 'r10' }]),
  ]);
  dit(51, 'Caisse : le choix des rituels ecarte celui qui a sa piece, la piece porte l argent a ses dates', [true, true], [
    /carnet\.filter\(\(a\) => [^\n]*!a\.invoiceId[^\n]*&& !aDejaSaPiece\(a, invoices\)\),\s*\[carnet, clientId, invoices\],/.test(caisse),
    /dejaRecu: rituelChoisi \? lArgentDejaRecu\(rituelChoisi, dateVente\) : undefined,/.test(caisse),
  ]);
}

/* ══ #51 ET #53 — LE CABLAGE DE L'ARGENT ENCAISSE A LA CAISSE ══
   La relecture a remis six pannes que les motifs d'avant ne voyaient pas :
   le comptoir qui refait payer l'acompte, le Carnet qui le compte deux fois,
   la piece privee de son acompte ou de sa part avoir. Chaque argument de
   l'argent se lit ici, a sa place exacte. */
{
  const i = caisse.indexOf('const versements = versementsDuTicket({');
  const appel = i < 0 ? '' : caisse.slice(i, caisse.indexOf('\n    });', i));
  dit(51, 'Caisse : le comptoir fait payer le reste apres l acompte, la piece et le Carnet le comptent une fois', [true, true, true, true, true, true], [
    /const posCashDue = Math\.max\(0, aPayerXof - posAvoir\);/.test(caisse),
    /\n\s*acompteXof: ticket\.acompteXof,\n/.test(appel),
    /depositCreditXof: ticket\.acompteXof > 0 \? ticket\.acompteXof : undefined,/.test(caisse),
    /const partNette = ticket\.partNetteXof;\s*const acompteImpute = ticket\.acompteXof;/.test(caisse),
    /paidXof: \(a\.paidXof \?\? 0\) \+ recu\.comptantXof \+ recu\.avoirXof,/.test(caisse),
    appel.length > 100,
  ]);
  dit(53, 'Caisse : le comptant au tiroir du jour, l avoir sur son versement, sur la piece, au Carnet et au compte', [true, true, true, true, true, true, true, true], [
    /\n\s*comptantXof: posCashDue,\n/.test(appel),
    /\n\s*avoirXof: posAvoir,\n/.test(appel),
    /\n\s*moyen: pay,\n/.test(appel) && /\n\s*caisse: activeCashbox \|\| undefined,\n/.test(appel) && /\n\s*date: dateVente,\n/.test(appel),
    /const posAvoir = Math\.max\(0, Math\.min\(Math\.min\(posAvoirBal, aPayerXof\), Math\.round\(Number\(avoirStr\) \|\| 0\)\)\);/.test(caisse),
    /\n\s*avoirXof: posAvoir > 0 \? posAvoir : undefined,\n/.test(caisse),
    /const recu = ceQueLeRendezVousRecoit\(\{ partNetteXof: partNette, acompteXof: acompteImpute, avoirXof: posAvoir \}\);/.test(caisse),
    /kind: 'usage', amountXof: posAvoir,/.test(caisse),
    /payment: posCashDue > 0 \? pay : \(posAvoir > 0 \? 'Avoir' : pay\),/.test(caisse),
  ]);
}

/* ══ #52 — CHANGER DE CLIENTE REPART D'UN TICKET A ELLE ══ */
{
  const corps = (() => { const i = caisse.indexOf('const changeDeCliente = (id: string) => {'); return i < 0 ? '' : caisse.slice(i, caisse.indexOf('\n  };', i)); })();
  const ordre = ['choisirRituel(\'\');', 'retireLeSoin();', 'setClientId(id);'].map((m) => corps.indexOf(m));
  dit(52, 'changer de tete retire le rituel pose et le soin offert, PUIS change de tete', true, ordre.every((x, i) => x >= 0 && (i === 0 || x > ordre[i - 1])));
  /* La reprise : l'avoir tape pour A ne se pose pas sur le compte de B. */
  dit(52, 'changer de tete remet l avoir tape a zero, dans le meme geste', true,
    /if \(id !== clientId\) \{\s*choisirRituel\(''\);\s*retireLeSoin\(\);\s*setAvoirStr\('0'\);\s*\}\s*setClientId\(id\);/.test(corps));
  /* Et ce qu'il appelle fait bien ce qu'il promet (la relecture a vide
     `retireLeSoin` sans que le banc crie) : la ligne offerte revient a 0 %,
     le soin n'est plus pose ; le rituel retire ses lignes et son lien. */
  dit(52, 'retireLeSoin rend la ligne a 0 % et oublie le soin ; choisirRituel retire les lignes et le lien', [true, true], [
    /const retireLeSoin = \(\) => \{\s*if \(!soinPose\) return;\s*const cle = soinPose\.cle;\s*setCart\(\(c\) => \(c\[cle\] \? \{ \.\.\.c, \[cle\]: \{ \.\.\.c\[cle\], disc: 0 \} \} : c\)\);\s*setSoinPose\(null\);\s*\};/.test(caisse),
    /const choisirRituel = \(id: string\) => \{\s*if \(posesParRituel\.current\.length > 0\) \{\s*const aRetirer = new Set\(posesParRituel\.current\);\s*setCart\(\(c\) => Object\.fromEntries\(Object\.entries\(c\)\.filter\(\(\[k\]\) => !aRetirer\.has\(k\)\)\)\);\s*posesParRituel\.current = \[\];\s*\}\s*setApptToSettle\(id\);\s*if \(!id\) return;/.test(caisse),
  ]);
  dit(52, 'le selecteur de cliente passe par lui, et rien d autre ne change la tete', [true, 1], [
    /<ClientPicker value=\{clientId\} onChange=\{\(v\) => \{ changeDeCliente\(v\);/.test(caisse),
    (caisse.match(/setClientId\(/g) ?? []).length,
  ]);
}

/* ══ #53 — CHAQUE NATURE D'ARGENT A SON VERSEMENT ══
   50 000 F dont 10 000 F d'avoir : le tiroir et la cloture attendent
   40 000 F, jamais 50 000 F. */
{
  let k = 0;
  const v = versementsDuTicket({ nouvelId: () => `ip-${++k}`, date: '2026-10-10', comptantXof: 40_000, moyen: 'Espèces', caisse: 'Caisse principale', avoirXof: 10_000, acompteXof: 0 });
  const piece = { id: 'inv', number: 'MND-1', date: '2026-10-10', status: 'payée', payment: 'Espèces', cashbox: 'Caisse principale', avoirXof: 10_000,
    lines: [ligneFacture('Rituel', 50_000)], globalDiscountPct: 0, payments: v } as unknown as Invoice;
  const auTiroir = invoiceReglements(piece).filter((p) => !sansTiroir(p) && p.cashbox === 'Caisse principale').reduce((s, p) => s + p.amountXof, 0);
  dit(53, 'le tiroir recoit 40 000 F, l avoir 10 000 F hors tiroir', [40_000, 10_000], [auTiroir, invoiceReglements(piece).filter((p) => p.method === 'Avoir').reduce((s, p) => s + p.amountXof, 0)]);
  dit(53, '... l avoir ne porte pas de caisse ; la piece est soldee au franc pres', [undefined, true], [v.find((p) => p.method === 'Avoir')?.cashbox, invoiceSoldee(piece)]);
  const avecAcompte = versementsDuTicket({ nouvelId: () => `ip-${++k}`, date: '2026-10-10', comptantXof: 24_000, moyen: 'MTN MoMo', avoirXof: 0, acompteXof: 10_000, acompteDate: '2026-10-01' });
  dit(53, 'l acompte deja recu : son versement a lui, date du jour ou il est entre, sans tiroir', [['Acompte', 10_000, '2026-10-01', true], ['MTN MoMo', 24_000, '2026-10-10', false]],
    avecAcompte.map((p) => [p.method, p.amountXof, p.date, sansTiroir(p)]));
  dit(53, 'le rendez-vous : l avoir d abord sur le rituel, le comptant pour le reste', { comptantXof: 20_000, avoirXof: 10_000 },
    ceQueLeRendezVousRecoit({ partNetteXof: 30_000, acompteXof: 0, avoirXof: 10_000 }));
  dit(53, 'Caisse : la piece porte ses versements, le Carnet ventile', [true, true, true, false], [
    /const inv: Invoice = versements\.length > 0 \? \{ \.\.\.piece, payments: versements \} : piece;/.test(caisse),
    /amountXof: recu\.comptantXof,/.test(caisse),
    /amountXof: recu\.avoirXof,\s*date: dateVente,\s*method: 'Avoir' as PaymentMethod,/.test(caisse),
    /method: posCashDue > 0 \? pay : \(posAvoir > 0 \? 'Avoir' : pay\),\s*cashbox: activeCashbox/.test(caisse),
  ]);
}

/* ══ #55 — « MARQUER PAYEE » ECRIT LE VERSEMENT DU JOUR ══
   Une piece du 2 octobre 2026 de 50 000 F, 20 000 F recus le 2, soldee le
   10 : 30 000 F entrent le 10, a la caisse choisie. */
{
  const piece = { id: 'f', number: 'MND-2', date: '2026-10-02', status: 'envoyée', lines: [ligneFacture('Rituel', 50_000)], globalDiscountPct: 0,
    payments: [{ id: 'p1', date: '2026-10-02', amountXof: 20_000, method: 'Espèces', cashbox: 'Caisse principale' }] } as unknown as Invoice;
  const patch = soldeDeLaPiece(piece, { id: 'p2', jour: '2026-10-10', moyen: 'MTN MoMo', caisse: 'Caisse MoMo' });
  const apres = { ...piece, ...patch } as Invoice;
  dit(55, 'le reste (30 000 F) entre le 10, a la caisse choisie ; le versement du 2 reste', [['2026-10-02', 20_000, 'Caisse principale'], ['2026-10-10', 30_000, 'Caisse MoMo']],
    (apres.payments ?? []).map((p) => [p.date, p.amountXof, p.cashbox]));
  dit(55, '... payee, soldee, rien ne reste', ['payée', true, 0], [apres.status, invoiceSoldee(apres), invoiceResteXof(apres)]);
  const nue = { ...piece, payments: undefined } as unknown as Invoice;
  dit(55, 'une piece sans versement : un seul, du total, au jour du solde', [['2026-10-10', 50_000]],
    (soldeDeLaPiece(nue, { id: 'p3', jour: '2026-10-10', moyen: 'Espèces', caisse: 'Caisse principale' }).payments ?? []).map((p) => [p.date, p.amountXof]));
  dit(55, 'le bouton attend sa caisse quand la branche en a', [true, false, false], [caisseManquante('', 2), caisseManquante('Caisse principale', 2), caisseManquante('', 0)]);
  dit(55, 'Factures : le bouton ecrit le versement du jour, attend la caisse, la caisse se vide a chaque piece', [true, true, true, true, false], [
    /onClick=\{\(\) => patchSelected\(soldeDeLaPiece\(selected, \{\s*id: `ip-\$\{uid\(\)\}`,\s*jour: jourLocalIso\(\),\s*moyen: payChoice,\s*caisse: payCaisse \|\| undefined,/.test(factures),
    /disabled=\{caisseManquante\(payCaisse, boxesBranche\.length\)\}/.test(factures),
    /useEffect\(\(\) => \{ setPayCaisse\(''\); \}, \[selectedId\]\);/.test(factures),
    /\{boxesBranche\.length > 0 && \(\s*<Select aria-label="Caisse créditée"/.test(factures),
    /\(selected\.payments \?\? \[\]\)\.length === 0 && payCaisse \? \{ cashbox: payCaisse \}/.test(factures),
  ]);
}

/* ══ #56 — L'ANNEE SUR LES DATES ENVOYEES A LA PAYEUSE ══ */
{
  dit(56, 'la date dite porte son annee (frShortAn), frDay ne la porte pas', [true, false], [frShortAn('2026-09-12').includes('2026'), frDay('2026-09-12').includes('2026')]);
  const i = factures.indexOf('{lienFoyer && (() => {');
  const bloc = i < 0 ? '' : factures.slice(i, factures.indexOf('await summaryPdf(', i));
  dit(56, 'Factures : le message et le recapitulatif du foyer disent l annee, sans frDay', [true, true, true, false], [
    bloc.length > 500,
    /`· \$\{clientNameOf\(i\)\} · \$\{frShortAn\(i\.date\)\} · /.test(bloc),
    /heading: `\$\{clientNameOf\(i\)\} · \$\{frShortAn\(jourDuPassage\(i\)\)\} · /.test(bloc),
    /frDay\(/.test(bloc),
  ]);
  /* LA REGLE, PAS LE CAS DU JOUR (reprise du 10 octobre 2026). La relecture
     a trouve une date sans annee dans la liste a cocher de la meme fenetre,
     hors du motif d'avant. Dans TOUTE la fenetre du reglement du foyer (le
     message, le recapitulatif, la liste des pieces), une date ne se forme
     que par un formateur qui porte l'annee : tout autre formateur crie,
     qu'il s'appelle frDay, frShort ou toLocaleDateString. */
  const j = factures.indexOf('{lienFoyer && (() => {');
  const fenetre = j < 0 ? '' : factures.slice(j, factures.indexOf('\n      })()}', j));
  const AVEC_ANNEE = new Set(['frShortAn', 'frLongAn', 'frJourAn', 'jourCourtAn', 'jourAn', 'jourEnLettres']);
  const formateurs = [...fenetre.matchAll(/\b(fr[A-Z]\w*|toLocale\w*String|fmtDate\w*)\(/g)].map((m) => m[1]);
  dit(56, 'Factures : dans toute la fenetre du foyer, chaque date porte son annee', [true, true, []],
    [fenetre.length > 3000, formateurs.length >= 3, [...new Set(formateurs.filter((n) => !AVEC_ANNEE.has(n)))]]);
  dit(56, '... la liste a cocher dit l annee de chaque piece', true, /\{frShortAn\(i\.date\)\} · \{i\.number\}/.test(fenetre));
}

/* ══ #47 — LA SIGNATURE A L'ECRAN NE SIGNE QUE LE PRET ENREGISTRE ══
   Le recit : un pret enregistre de 100 000 F, retape a 150 000 F au-dela du
   plafond, ne se signe pas ; une correction qui ne touche pas ses termes
   garde la signature, une qui les change la perd. */
{
  const enregistre = { amountXof: 100_000, date: '2026-10-01', motif: 'Prêt', personneId: 'm1', retenue: { partPct: 20, premierMois: '2026-11' } };
  const plan = { trop: false, mensXof: 20_000, baseXof: 100_000 };
  const form = { ...enregistre, motif: '' };
  dit(47, 'le formulaire dit le pret enregistre : on signe', true, peutSignerALEcran(enregistre, form, plan));
  dit(47, 'retape a 150 000 F : on ne signe pas', false, peutSignerALEcran(enregistre, { ...form, amountXof: 150_000 }, plan));
  dit(47, 'au-dela du plafond : on ne signe pas', false, peutSignerALEcran(enregistre, form, { ...plan, trop: true }));
  dit(47, 'part ou premier bulletin changes : on ne signe pas', [false, false],
    [peutSignerALEcran(enregistre, { ...form, retenue: { partPct: 25, premierMois: '2026-11' } }, plan), peutSignerALEcran(enregistre, { ...form, retenue: { partPct: 20, premierMois: '2026-12' } }, plan)]);
  dit(47, 'pas encore enregistre : on ne signe pas', false, peutSignerALEcran(null, form, plan));
  const signe = { ...enregistre, signatureDesLettres: { at: '2026-10-10', signePar: 'M. T.', version: 'v' } };
  dit(47, 'enregistrer sans changer les termes garde la signature', 'M. T.', signatureQuiSurvit(signe, { ...enregistre, motif: 'Prêt' })?.signePar ?? null);
  dit(47, 'changer le montant la perd', null, signatureQuiSurvit(signe, { ...enregistre, amountXof: 120_000 }) ?? null);
  dit(47, 'Prets : la porte, la date du jour, la fiche ouverte, la ligne enregistree', [true, true, true, true, false], [
    /aSigner=\{signableALEcran \? \{/.test(prets),
    /const signee = \{ \.\.\.s, at: todayISO\(\) \};/.test(prets),
    /setPretEdite\(\(p\) => \(p && p\.id === pretEdite\.id \? \{ \.\.\.p, signatureDesLettres: signee \} : p\)\);/.test(prets),
    /const signee = signatureQuiSurvit\(pretEdite, ligne\);\s*if \(signee\) ligne\.signatureDesLettres = signee;\s*if \(pretEdite\) \{/.test(prets),
    /aSigner=\{baseDuMembre > 0 && montantsPret\.xof > 0/.test(prets),
  ]);
}

console.log(ko === 0 ? '\nLot vente-bis : les sept constats tiennent.' : `\n${ko} controle(s) en echec.`);
