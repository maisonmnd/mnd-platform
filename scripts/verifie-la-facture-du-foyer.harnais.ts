/* LA FACTURE DU FOYER, EPROUVEE — 27 octobre 2026.
   `node scripts/verifie-la-facture-du-foyer.mjs` (et `--prouve`).

   « Comment envoyer la facture de N. et de son frere A. en un message avec
   le total des deux factures ? » (Yeman). Ses choix : une « facture du
   foyer », un PDF, un message, le total ; chaque enfant garde sa facture ;
   au « Terminer la seance » et par un bouton apres coup. Les regles :
   src/shared/facture-du-foyer-pur.ts. TOUS LES ATTENDUS SONT ECRITS A LA
   MAIN. Les tetes sont inventees. Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  memeFoyer, rdvsDuFoyerLeJour, cleDuFoyer, motDuFoyer, FACTURE_DU_FOYER_JOINTE, type RdvDuFoyer, type TeteDuFoyer,
} from '../src/shared/facture-du-foyer-pur';
import { pdfDuFoyer, paiementDeLaPiece } from '../src/apps/trone/routes/vente/pdf-de-la-piece';
import type { Invoice } from '../src/shared/finance';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 230)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 230)}`));
};
const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};
const fois = (s: string, motif: string) => s.split(motif).length - 1;

/* Deux freres inscrits chacun avec le numero du parent ; une soeur du meme
   compte famille, sans numero ; une voisine ; deux fiches sans vrai numero. */
const tetes: TeteDuFoyer[] = [
  { id: 'aine', phone: '+33 6 11 22 33 44' },
  { id: 'cadet', phone: '+33611223344' },
  { id: 'soeur', familyId: 'fam-1' },
  { id: 'mere', familyId: 'fam-1', phone: '+229 01 97 00 00 01' },
  { id: 'voisine', phone: '+229 01 97 55 55 55' },
  { id: 'vide1', phone: '' },
  { id: 'vide2', phone: '' },
  { id: 'court1', phone: '1234' },
  { id: 'court2', phone: '12 34' },
  { id: 'partie', phone: '+33 6 11 22 33 44', archived: true },
];
const tete = (id: string) => tetes.find((t) => t.id === id);

/* == #1 -- LE MEME NUMERO REUNIT, UN NUMERO VIDE OU TRONQUE NON == */
dit(1, 'memeFoyer : meme numero ecrit autrement = oui ; vide = non ; quatre chiffres = non ; voisine = non',
  [true, false, false, false, true],
  [memeFoyer(tete('aine'), tete('cadet')), memeFoyer(tete('vide1'), tete('vide2')), memeFoyer(tete('court1'), tete('court2')),
    memeFoyer(tete('aine'), tete('voisine')), memeFoyer(tete('aine'), tete('aine'))]);

/* == #2 -- LE MEME COMPTE FAMILLE REUNIT, MEME SANS NUMERO == */
dit(2, 'memeFoyer : la soeur sans numero et la mere du meme compte = oui ; une tete inconnue = non',
  [true, false], [memeFoyer(tete('soeur'), tete('mere')), memeFoyer(tete('soeur'), undefined)]);

/* == #3 -- LE FOYER D UN JOUR : meme jour, meme branche, pas annule, pas archive, dans l ordre de l heure == */
const rdvs: RdvDuFoyer[] = [
  { id: 'r-cadet', clientId: 'cadet', date: '2026-10-27', time: '14:00', status: 'confirmé', branchId: 'b1' },
  { id: 'r-aine', clientId: 'aine', date: '2026-10-27', time: '11:30', status: 'confirmé', branchId: 'b1' },
  { id: 'r-aine-veille', clientId: 'aine', date: '2026-10-26', time: '14:00', status: 'honoré', branchId: 'b1' },
  { id: 'r-cadet-annule', clientId: 'cadet', date: '2026-10-27', time: '16:00', status: 'annulé', branchId: 'b1' },
  { id: 'r-cadet-ailleurs', clientId: 'cadet', date: '2026-10-27', time: '15:00', status: 'confirmé', branchId: 'b2' },
  { id: 'r-voisine', clientId: 'voisine', date: '2026-10-27', time: '14:00', status: 'confirmé', branchId: 'b1' },
  { id: 'r-partie', clientId: 'partie', date: '2026-10-27', time: '09:00', status: 'confirmé', branchId: 'b1' },
];
const rdv = (id: string) => rdvs.find((a) => a.id === id)!;
dit(3, 'rdvsDuFoyerLeJour : l aine a 11:30 puis le cadet a 14:00 ; ni la veille, ni l annule, ni l autre branche, ni la voisine, ni l archivee',
  [['r-aine', 'r-cadet'], ['r-aine', 'r-cadet']],
  [rdvsDuFoyerLeJour(rdv('r-cadet'), rdvs, tetes).map((a) => a.id), rdvsDuFoyerLeJour(rdv('r-aine'), rdvs, tetes).map((a) => a.id)]);

/* == #4 -- SEUL CE JOUR-LA, PAS DE FOYER : la liste est vide, aucun bouton == */
dit(4, 'rdvsDuFoyerLeJour : la voisine seule = [] ; l aine seul la veille = []',
  [[], []],
  [rdvsDuFoyerLeJour(rdv('r-voisine'), rdvs, tetes).map((a) => a.id), rdvsDuFoyerLeJour(rdv('r-aine-veille'), rdvs, tetes).map((a) => a.id)]);

/* == #5 -- LA CLE : un jour, un numero, en chiffres (deux ecritures du meme numero = une cle) == */
dit(5, 'cleDuFoyer : les deux ecritures du numero donnent la meme cle',
  ['foyer-2026-10-27-33611223344', true],
  [cleDuFoyer('2026-10-27', '+33 6 11 22 33 44'), cleDuFoyer('2026-10-27', '+33 6 11 22 33 44') === cleDuFoyer('2026-10-27', '+33611223344')]);

/* == #6 -- LE MOT : les deux prenoms, chacun son reste, le total ; aucun numero de piece == */
{
  const mot = motDuFoyer({
    appel: 'Madame K.', quand: 'mardi 27 octobre 2026',
    lignes: [{ prenom: 'Alpha', resteDit: '7 000 F' }, { prenom: 'Beta', resteDit: '37 000 F' }], totalDit: '44 000 F',
  });
  dit(6, 'motDuFoyer : les deux prenoms, la date avec son annee, chaque reste, le total',
    'Bonjour Madame K., merci de la visite de Alpha et Beta du mardi 27 octobre 2026. Voici votre facture du foyer ci-jointe.\nAlpha : 7 000 F\nBeta : 37 000 F\nTotal à régler : 44 000 F.',
    mot);
  const envoi = source('src/apps/trone/routes/vente/envoi-de-la-piece.ts');
  dit(6, 'les lignes du message ne portent que le prenom et le reste (le numero de piece reste au PDF)',
    1, fois(envoi, 'const lignes = ouvertes.map((p) => ({ prenom: prenomDe(p), resteDit: fmtMoney(invoiceResteXof(p), currency) }));'));
}

/* == #7 -- LES DEUX BOUTONS, AU CARNET ET A L ENCAISSEMENT ==
   « Terminer les seances » honore et envoie (terminer: true, la cle du jour) ;
   « Envoyer la facture du foyer » apres coup renvoie (terminer: false, renvoi). */
{
  const carnet = source('src/apps/trone/routes/clients/Carnet.tsx');
  const actions = source('src/apps/trone/routes/clients/actions.tsx');
  dit(7, 'Carnet : le foyer du jour, un envoi qui termine sans renvoi, un envoi apres coup en renvoi, les deux libelles',
    [1, 1, 1, 1, 1],
    [fois(carnet, 'const duJour = rdvsDuFoyerLeJour(a, appts, clients);'),
      fois(carnet, 'void envoiDeLaPiece.foyer(piecesDuFoyer(duJour, byId, tarifsDe, { terminer }), a.date, { renvoi: !terminer });'),
      fois(carnet, "if (duJour.some((x) => x.status !== 'honoré')) {"),
      fois(carnet, 'Terminer les séances de {qui} · une facture du foyer'),
      fois(carnet, 'Envoyer la facture du foyer · {qui} ·')]);
  dit(7, 'Encaissement : le foyer du jour, terminer = true sans renvoi, apres coup = false en renvoi',
    [1, 1, 1],
    [fois(actions, 'const duJour = rdvsDuFoyerLeJour(appt, tousLesRdv, clients);'),
      fois(actions, 'void envoiDeLaPiece.foyer(piecesDuFoyer(duJour, byId, tarifsDe, { terminer: true }), appt.date);'),
      fois(actions, 'void envoiDeLaPiece.foyer(piecesDuFoyer(duJour, byId, tarifsDe, { terminer: false }), appt.date, { renvoi: true });')]);
  dit(7, 'piecesDuFoyer : chaque tete a son tarif, terminer honore d abord, un rituel qui ne doit rien ne donne rien',
    [1, 1, 1],
    [fois(actions, 'const h = honoreSansEncaisser(frais, byId, tarifsDe(frais));'),
      fois(actions, 'if (!o.terminer) continue;'),
      fois(actions, 'if (apptDueXof(frais, byId) <= 0) continue;')]);
}

/* == #8 -- L ENVOI : seules les pieces qui doivent ; une seule = la facture seule ; la cle du foyer == */
{
  /* Le corps de `foyer` seul : `point` (le point du compte, 28 octobre 2026) lui ressemble. */
  const tout = source('src/apps/trone/routes/vente/envoi-de-la-piece.ts');
  const envoi = tout.slice(tout.indexOf('const foyer = async'), tout.indexOf('const point = async'));
  dit(8, 'foyer : filtre les pieces soldees, une seule part seule, la cle du jour et du numero, le total des restes',
    [1, 1, 1, 1],
    [fois(envoi, "p.kind === 'facture' && invoiceResteXof(p) > 0);"),
      fois(envoi, 'if (ouvertes.length === 1) { await aRegler(ouvertes[0].id, jourDuRituel, { memePasse: true, renvoi: o?.renvoi }); return; }'),
      fois(envoi, 'cleDuFoyer(jourDuRituel, destinataire.phone)'),
      fois(envoi, 'const totalXof = ouvertes.reduce((n, p) => n + invoiceResteXof(p), 0);')]);
}

/* == #9 -- LE PAPIER ET LE MODELE : « FACTURE DU FOYER » en titre ; « du foyer ci-jointe » en {{3}} == */
{
  const pdf = source('src/shared/pdf.ts');
  const wa = source('src/shared/facture-whatsapp.ts');
  const envoi = source('src/apps/trone/routes/vente/envoi-de-la-piece.ts');
  dit(9, 'le PDF lit son titre et son nom de fichier ; la piece du foyer les donne ; le modele recoit « du foyer ci-jointe »',
    [1, 1, 1, 1, 'du foyer ci-jointe'],
    [fois(pdf, 'doc.text(d.titre ?? ('),
      fois(pdf, '${d.nomDuFichier ?? ('),
      fois(envoi, "titre: 'FACTURE DU FOYER',"),
      fois(wa, 'variables: [appelDe(o.client), dateDite(o.jourIso), FACTURE_DU_FOYER_JOINTE, o.totalDit]'),
      FACTURE_DU_FOYER_JOINTE]);
}

/* == #10 a #12 -- LE PAPIER DU FOYER, CELUI DES FACTURES (28 octobre 2026) ==
   « La facture du recapitulatif du foyer doit etre pareil que les factures
   PDF ; le code QR a celui de Maison MND 909099 ; le tampon de la Maison, sur
   les recus aussi » (Yeman). Au selecteur : le code Tap & Go garde sous le QR,
   le sceau dentele sur les factures, PAYE sur les recus. */
{
  const piece = (pour: string, number: string, label: string, unitXof: number, deja = 0) => ({
    id: `f-${pour}`, number, clientId: 'mere', forClientId: pour, date: '2026-10-28', status: 'envoyée', kind: 'facture', globalDiscountPct: 0,
    lines: [{ id: 'l1', label, qty: 1, unitXof, discountPct: 0 }, { id: 'l2', label: 'La sortie soignée', qty: 1, unitXof: 2000, discountPct: 0 }],
    payments: deja ? [{ id: 'v1', date: '2026-10-27', amountXof: deja, method: 'Espèces' }] : [],
  }) as unknown as Invoice;
  const papier = pdfDuFoyer({
    titre: 'RÉCAPITULATIF DU FOYER', nomDuFichier: 'Recapitulatif-du-foyer',
    pieces: [piece('aine', 'MND-2026-0163', 'SÍNSIN Signature', 35000), piece('cadet', 'MND-2026-0162', 'KLƆKLƆ Essentiel', 5000, 3000)],
    jourIso: '2026-10-28', client: { name: 'Famille A', phone: '+229 01 51 22 33 44' },
    nomDe: (p) => (p.forClientId === 'aine' ? 'Aine A' : 'Cadet A'), jourDe: () => '2026-10-27',
    fmt: (n) => `${n} F`, reglages: undefined, note: '',
  });
  dit(10, 'le papier du foyer : celui des factures, une ligne par facture (le jour du rituel avec son annee, le numero), ses prestations a leur prix, le deja regle, le total des restes',
    ['releve', 'RÉCAPITULATIF DU FOYER', ['Aine A · 27 octobre 2026 · MND-2026-0163', 'Cadet A · 27 octobre 2026 · MND-2026-0162'],
      [['SÍNSIN Signature · 35000 F', 'La sortie soignée · 2000 F'], ['KLƆKLƆ Essentiel · 5000 F', 'La sortie soignée · 2000 F', 'Déjà réglé · − 3000 F']],
      ['37000 F', '4000 F'], '41000 F', '20261028-3344'],
    [papier.kind, papier.titre, papier.lines.map((l) => l.label), papier.lines.map((l) => l.detail), papier.lines.map((l) => l.total), papier.total, papier.number]);
  /* « Remets le code QR de FedaPay et enlève Maison MND du bas du QR code » (Yéman, 28 octobre 2026, épreuve en main). */
  const eteint = paiementDeLaPiece(41000, { tapgo: { actif: false } } as any);
  dit(11, 'de quoi payer : le QR Tap & Go de FedaPay, montant compris ; dessous le montant et le code Tap & Go, sans le nom de la Maison ; Tap & Go eteint, le MoMoPay 909099 sans nom',
    ['tapgo', true, null, true, true, ['909099@momopay', null, true]],
    [papier.momo?.genre ?? null, /^https:\/\//.test(papier.momo?.qr ?? ''), papier.momo?.marchand ?? null,
      /^\d[\d\s  ]* F( frais compris)?$/.test(papier.momo?.codeDit ?? ''), /^\*601\*14\*\d+\*\d+#$/.test(papier.momo?.code ?? ''),
      [eteint?.qr, eteint?.marchand ?? null, /909099/.test(eteint?.code ?? '')]]);
  const pdf = source('src/shared/pdf.ts');
  const fac = source('src/apps/trone/routes/vente/Factures.tsx');
  /* Le recapitulatif vit dans la fenetre du point du compte depuis le 28 octobre 2026. */
  const fen = source('src/apps/trone/routes/vente/FenetreDuPoint.tsx');
  dit(12, 'les tampons : le sceau dentele sur les factures, la note sous lui ; PAYE sur les recus ; la Maison seulement ; le recapitulatif (point du compte) sur ce papier',
    [1, 1, 1, 1, 1, 0],
    [fois(pdf, 'const sceau = estLaMaisonMND(d.houseName) && yDuSceau + TAILLE_DU_SCEAU < 228 ? await chargeImageDuSite(SCEAU_DES_FACTURES) : null;'),
      fois(pdf, 'if (sceau) y = Math.max(y, yDuSceau + TAILLE_DU_SCEAU + 2);'),
      fois(pdf, 'const paye = estLaMaisonMND(d.houseName) ? await chargeImageDuSite(TAMPON_PAYE.chemin) : null;'),
      fois(pdf, 'const SCEAU_DES_FACTURES = SCEAU_DES_CONTRATS;'),
      fois(fen, 'await invoicePdf(pdfDuFoyer({'),
      fois(fac, 'summaryPdf(') + fois(fen, 'summaryPdf(')]);
  /* #13 (28 octobre 2026) : « celui d'aujourd'hui mais avec le tampon à droite au lieu du gauche »,
     et « tout en bas des factures il faut écrire Maison MND Code Marchand 909099 » (Yéman). */
  dit(13, 'le sceau a droite, sous les totaux, la note sous lui ; le code marchand juste sous le RCCM, la devise dessous, sur chaque papier de la Maison',
    [true, 1, true],
    [/if \(d\.status\) row\('Statut', d\.status\);\s*const yDuSceau = y - 2;/.test(pdf),
      fois(pdf, "doc.addImage(sceau, 'PNG', rx - TAILLE_DU_SCEAU, yDuSceau, TAILLE_DU_SCEAU, TAILLE_DU_SCEAU, undefined, 'FAST');"),
      /W \/ 2, 280\.5, \{ align: 'center' \}\);\s*\}\s*if \(estLaMaisonMND\(d\.houseName\)\) \{\s*doc\.setFont\('helvetica', 'bold'\);\s*doc\.setFontSize\(8\);\s*doc\.setTextColor\(INDIGO\);\s*doc\.text\(`\$\{maisonNom\(\)\} · Code Marchand \$\{CODE_MOMOPAY\}`, W \/ 2, 285, \{ align: 'center' \}\);\s*\}\s*await pieDeLaMaison\(doc, W, 290\);/.test(pdf)]);
}

if (process.exitCode) console.log('La facture du foyer ne tient pas.');
else console.log('La facture du foyer tient : un foyer, une facture, un message, le total.');
