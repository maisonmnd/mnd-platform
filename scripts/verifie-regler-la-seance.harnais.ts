/* RÉGLER SA SÉANCE, ÉPROUVÉ — `node scripts/verifie-regler-la-seance.mjs`.

   Les règles tranchées le 25 octobre 2026 (maquette, vues 9 à 11) : un lien
   par rendez-vous, qui dit le juste reste calculé au serveur comme finance.ts ;
   ce qui dépasse le reste est le pourboire de l'équipe, jamais dans la pièce ;
   une transaction ne règle qu'un rendez-vous et ne se pose qu'une fois ; un
   argent qui ne couvre pas reste au registre, à rapprocher ; le reçu ne part
   que pour l'argent du jour ; payer.html mène à la page ; le registre des
   encaissements ne compte l'argent qu'une fois. Et la fonction porte la MÊME
   règle, mot pour mot, rejouée ici contre une base et un KkiaPay simulés.
   Chaque épreuve dit la règle. Sortie ASCII : la console de Windows. */
import {
  ALPHABET_DU_JETON, LONGUEUR_DU_JETON, jetonDe, estUnJeton, parametreDuLien, jetonDuParametre, referenceDuRdv,
  totalDeLaPiece, regleDeLaPiece, resteDeLaPiece, laPieceDuRdv, etatDuLien, partageDuPaiement, versementEnLigne,
  pieceReglee, rdvRegle, pageDuLien, moyenDit, dejaInscrit,
  type PieceLue, type RdvLu, type ReglementEnLigne,
} from '../src/shared/regler-la-seance-pur';
import { reglementsATraiter, partsDuReglement, marqueLeReglement, aAnnoncer, idDeLaPart } from '../src/shared/reglements-en-ligne-pur';
import { invoiceTotal, invoiceRegleXof, invoiceResteXof, type Invoice } from '../src/shared/finance';
import { repartirPourboire } from '../src/shared/tips';
import { buildReceipts } from '../src/shared/receipts';
import { motDeLaFacture } from '../src/shared/facture-whatsapp';
import { DEVISE_COMPLETE } from '../src/shared/identite';
// @ts-expect-error module .mjs sans types
import { copieAttendue, copieDuServeur } from './regler-copie-serveur.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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
const racine = process.cwd();
const lis = (p: string): string => readFileSync(path.join(racine, p), 'utf8');
const sansCommentaires = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── 1. Le jeton et le paramètre du bouton ─────────────────────────────── */
const j = jetonDe([3, 40, 7, 100, 0, 30, 31, 62, 5, 9, 11, 13, 17, 19]);
dit('un jeton a quatorze signes de l alphabet sans ambiguite', [LONGUEUR_DU_JETON, true], [j.length, [...j].every((c) => ALPHABET_DU_JETON.includes(c))]);
dit('... ni 0, ni o, ni 1, ni l, ni i dans l alphabet', [false, false, false, false, false], ['0', 'o', '1', 'l', 'i'].map((c) => ALPHABET_DU_JETON.includes(c)));
dit('le parametre du bouton est r-<jeton>, et se relit', [`r-${j}`, j], [parametreDuLien(j), jetonDuParametre(parametreDuLien(j))]);
dit('un parametre Tap & Go (51166-2032) n est pas un lien de seance', null, jetonDuParametre('51166-2032'));
dit('un jeton tronque ou etranger ne se lit pas', [null, null, false], [jetonDuParametre(`r-${j.slice(0, 13)}`), jetonDuParametre('r-ABCDEFGHJKMNPQ'), estUnJeton('0'.repeat(14))]);
dit('la reference KkiaPay n est jamais l identifiant nu du rendez-vous (le filet y confirmerait un acompte)', 'reg-rdv-1', referenceDuRdv('rdv-1'));

/* ── 2. Le reste se calcule comme finance.ts ──────────────────────────── */
const L = (unitXof: number, qty = 1, discountPct = 0, discountXof?: number) => ({ id: 'l', label: 'Ligne', qty, unitXof, discountPct, ...(discountXof ? { discountXof } : {}) });
const pieces: PieceLue[] = [
  { id: 'p1', status: 'envoyée', lines: [L(25000)], globalDiscountPct: 0 },
  { id: 'p2', status: 'envoyée', lines: [L(25000), L(6000, 1, 10)], globalDiscountPct: 5, globalDiscountXof: 500, payments: [{ id: 'v1', amountXof: 7500, date: '2026-10-22', method: 'Acompte' }] },
  { id: 'p3', status: 'payée', lines: [L(30000)], globalDiscountPct: 0 },
  { id: 'p4', status: 'envoyée', lines: [L(10000, 3, 0, 2000)], globalDiscountPct: 12.5, payments: [{ id: 'v2', amountXof: 40000, date: '2026-10-25' }] },
  { id: 'p5', status: 'envoyée', lines: [L(18333, 1, 33)], globalDiscountPct: 0 },
];
dit('total, recu et reste : les memes chiffres que invoiceTotal, invoiceRegleXof, invoiceResteXof',
  pieces.map((p) => [invoiceTotal(p as unknown as Invoice), invoiceRegleXof(p as unknown as Invoice), invoiceResteXof(p as unknown as Invoice)]),
  pieces.map((p) => [totalDeLaPiece(p), regleDeLaPiece(p), resteDeLaPiece(p)]));

/* ── 3. La pièce du rendez-vous, l'état du lien ───────────────────────── */
const rdv: RdvLu = { id: 'rdv-1', clientId: 'c1', clientName: 'Awa Kossou', date: '2026-10-27', master: 'Aimée Dossou', status: 'honoré', lienDeReglement: { jeton: j, creeLe: '2026-10-27T11:30:00.000Z' } };
const facture: PieceLue = { id: 'f1', kind: 'facture', status: 'envoyée', apptId: 'rdv-1', date: '2026-10-27', lines: [{ label: 'SÍNSIN Essentiel', qty: 1, unitXof: 25000, discountPct: 0 }, { label: 'Huile Signature', qty: 1, unitXof: 6000, discountPct: 0 }], globalDiscountPct: 0, payments: [{ id: 'ac', amountXof: 7500, date: '2026-10-22', method: 'Acompte' }] };
dit('la piece du rendez-vous : sa facture qui doit encore, jamais un devis, une annulee ou celle d un autre',
  'f1', laPieceDuRdv([{ ...facture, id: 'd', kind: 'devis' }, { ...facture, id: 'x', status: 'annulée' }, { ...facture, id: 'o', apptId: 'rdv-2' }, { ...facture, id: 'f0', status: 'payée', payments: undefined, date: '2026-10-28' }, facture], 'rdv-1')?.id);
dit('sans piece, le lien dit sans-piece ; annule, il ne prend rien ; introuvable, rien',
  ['sans-piece', 'annule', 'introuvable'], [etatDuLien(rdv, null).etat, etatDuLien({ ...rdv, status: 'annulé' }, facture).etat, etatDuLien(null, null).etat]);
dit('avec sa facture : 31 000 dus, 7 500 recus, 23 500 a regler', { etat: 'a-regler', totalXof: 31000, recuXof: 7500, resteXof: 23500 }, etatDuLien(rdv, facture));
dit('reglee au comptoir entre-temps : le lien dit reglee', 'reglee', etatDuLien(rdv, { ...facture, payments: [...(facture.payments ?? []), { id: 'esp', amountXof: 23500, date: '2026-10-27', method: 'Espèces' }] }).etat);

/* ── 4. Le partage de l'argent reçu ───────────────────────────────────── */
dit('le reste juste : tout sur la piece, pas de pourboire', { ok: true, versementXof: 23500, pourboireXof: 0 }, partageDuPaiement(23500, 23500));
dit('ce qui depasse le reste est le pourboire de l equipe', { ok: true, versementXof: 23500, pourboireXof: 1000 }, partageDuPaiement(24500, 23500));
dit('un franc d arrondi est absorbe, la piece se solde', { ok: true, versementXof: 23500, pourboireXof: 0 }, partageDuPaiement(23499, 23500));
dit('un argent qui ne couvre pas ne regle rien ; une piece soldee ne prend plus rien', [{ ok: false, raison: 'montant' }, { ok: false, raison: 'deja_reglee' }], [partageDuPaiement(20000, 23500), partageDuPaiement(5000, 0)]);

/* ── 5. La pièce et le rendez-vous après le règlement ─────────────────── */
const quand = new Date('2026-10-27T11:34:00.000Z');
const v = versementEnLigne({ transactionId: 'tx1', montantXof: 23500, source: 'MTN_BENIN', quand });
dit('le versement : kkia-<transaction>, caisse et moyen KkiaPay, jour et heure de Cotonou', { id: 'kkia-tx1', date: '2026-10-27', time: '12:34', method: 'KkiaPay', cashbox: 'KkiaPay' }, { id: v.id, date: v.date, time: v.time, method: v.method, cashbox: v.cashbox });
const trace: ReglementEnLigne = { id: v.id, transactionId: 'tx1', payeLe: quand.toISOString(), montantXof: 23500, pourboireXof: 1000, fraisXof: 447, moyen: 'MTN' };
const apres = pieceReglee(facture, v, 1000, trace);
dit('la piece se solde, le pourboire va a tipXof (hors chiffre), la trace suit', ['payée', 0, 1000, 1, 31000], [apres.status, resteDeLaPiece(apres), apres.tipXof, apres.reglementsEnLigne?.length, totalDeLaPiece(apres)]);
dit('... un reglement partiel garde le statut', 'envoyée', pieceReglee(facture, { ...v, amountXof: 10000 }, 0, trace).status);
dit('... la trace ne se double pas sur un rejeu', 1, pieceReglee(apres, v, 0, trace).reglementsEnLigne?.length);
dit('dejaInscrit reconnait la transaction posee', [true, false], [dejaInscrit(apres, 'tx1'), dejaInscrit(apres, 'tx2')]);
const rdvApres = rdvRegle({ ...rdv, payments: [{ id: 'ac', amountXof: 7500, date: '2026-10-22' }] }, v, 'f1');
dit('le rendez-vous recoit le meme versement, avec sa piece, et le paye suit le journal', [['ac', 'kkia-tx1'], 31000, 'f1'], [rdvApres.payments?.map((x) => x.id), rdvApres.paidXof, rdvApres.payments?.[1]?.invoiceId]);
dit('... une seule fois', 2, rdvRegle(rdvApres, v, 'f1').payments?.length);

/* ── 6. Ce que la page reçoit ─────────────────────────────────────────── */
const page = pageDuLien({ rdv, piece: facture, nomDeLaCliente: 'Awa Kossou', branchId: 'b1', maintenant: quand });
dit('la page : le prenom seul, le maitre en prenom, le reste, la reference, rien de plus',
  { etat: 'a-regler', prenom: 'Awa', maitre: 'Aimée', resteXof: 23500, reference: 'reg-rdv-1', pourboire: true },
  { etat: page.etat, prenom: page.prenom, maitre: page.maitre, resteXof: page.resteXof, reference: page.reference, pourboire: page.pourboire });
dit('... ni numero ni nom de famille dans ce qu elle recoit', [false, false], [/Kossou|Dossou/.test(JSON.stringify(page)), /\+?229|\d{8}/.test(JSON.stringify({ ...page, lignes: [], totalXof: 0, recuXof: 0, resteXof: 0 }))]);
dit('... le calendrier commun (Team) ne se dit pas comme un maitre', '', pageDuLien({ rdv: { ...rdv, master: 'Team' }, piece: facture, maintenant: quand }).maitre);
dit('... un pourboire deja recu ne se repropose pas', false, pageDuLien({ rdv, piece: { ...facture, tipXof: 500 }, maintenant: quand }).pourboire);
const avecTapGo = { ...rdv, lienDeReglement: { ...rdv.lienDeReglement!, tapgo: { resteXof: 23500, parametre: '51166-23876', totalXof: 23876 } } };
dit('Tap & Go a cote, seulement tant que le reste n a pas bouge', [true, false],
  [!!pageDuLien({ rdv: avecTapGo, piece: facture, maintenant: quand }).tapgo, !!pageDuLien({ rdv: avecTapGo, piece: { ...facture, payments: [...(facture.payments ?? []), { id: 'e', amountXof: 3500, date: '2026-10-27' }] }, maintenant: quand }).tapgo]);
dit('le moyen que KkiaPay dit, en clair', ['MTN', 'Moov', 'carte', 'Mobile Money', ''], ['MTN_BENIN', 'MOOV_BJ', 'CARD', 'WAVE', undefined].map(moyenDit));

/* ── 7. Le Trône : pourboire de l'équipe, reçu, annonce ───────────────── */
const piecesT = [{ id: 'f1', reglementsEnLigne: [trace] }, { id: 'f2', reglementsEnLigne: [{ ...trace, id: 'kkia-tx9', payeLe: '2026-10-26T15:00:00.000Z', pourboireXof: 0 }] }];
const aFaire = reglementsATraiter(piecesT, '2026-10-27');
dit('a faire : le pourboire et le recu du jour ; hier, ni recu (pas de rattrapage) ni pourboire nul', [{ pieceId: 'f1', parts: true, recu: true }], aFaire.map((t) => ({ pieceId: t.pieceId, parts: t.parts, recu: t.recu })));
const membres = [{ id: 's1', part: 1 }, { id: 's2', part: 1 }, { id: 's3', part: 0.5 }, { id: 's4', part: 0.5 }];
const lignes = partsDuReglement(trace, repartirPourboire(1000, membres), 'f1', 'Awa K.');
dit('les parts : toute l equipe selon ses parts, la somme exacte, des identifiants tires du reglement',
  [1000, ['tp-kkia-tx1-s1', 'tp-kkia-tx1-s2', 'tp-kkia-tx1-s3', 'tp-kkia-tx1-s4'], 'f1', '2026-10-27'],
  [lignes.reduce((s, l) => s + l.amountXof, 0), lignes.map((l) => l.id).sort(), lignes[0]?.invoiceId, lignes[0]?.date]);
dit('... deux postes ecrivent les memes lignes', JSON.stringify(lignes), JSON.stringify(partsDuReglement(trace, repartirPourboire(1000, membres), 'f1', 'Awa K.')));
dit('... l identifiant d une part ne doit rien au hasard', 'tp-kkia-tx1-s2', idDeLaPart('kkia-tx1', 's2'));
const marquee = marqueLeReglement(piecesT[0], 'kkia-tx1', 'recuLe', '2026-10-27T11:35:00.000Z');
dit('marquer le recu ferme le geste, et ne se refait pas', [false, '2026-10-27T11:35:00.000Z'], [reglementsATraiter([marquee], '2026-10-27').some((t) => t.recu), marqueLeReglement(marquee, 'kkia-tx1', 'recuLe', 'plus-tard').reglementsEnLigne?.[0]?.recuLe]);
const t0 = Date.parse(trace.payeLe);
dit('l annonce : un reglement de moins de quinze minutes, une fois par poste', [true, false, false], [aAnnoncer(trace, t0 + 60_000, new Set()), aAnnoncer(trace, t0 + 16 * 60_000, new Set()), aAnnoncer(trace, t0 + 60_000, new Set(['kkia-tx1']))]);

/* ── 8. Le registre des encaissements compte l'argent une fois ─────────── */
const sources = (avecVersement: boolean) => buildReceipts({
  branchId: 'b1',
  invoices: [{ ...facture, branchId: 'b1', number: 'MND-2026-0900', clientId: 'c1', payments: avecVersement ? [...(facture.payments ?? []), v] : facture.payments } as unknown as Invoice],
  online: [{ id: 'tx1', branchId: 'b1', provider: 'kkiapay', amountXof: 24500, partnerId: 'reg-rdv-1', status: 'success', at: '2026-10-27T11:34:00.000Z' } as never],
  appointments: [{ ...rdv, branchId: 'b1', time: '10:00', serviceIds: [] } as never], credits: [], formation: [], abonnements: [],
  nameOf: () => 'Awa K.', apptLabel: () => 'SÍNSIN',
});
const kkia = (rs: ReturnType<typeof buildReceipts>) => rs.filter((r) => r.cashbox === 'KkiaPay').map((r) => [r.id, r.amountXof]);
dit('pose sur la piece : la transaction ne se compte pas une seconde fois', [['r-inv-f1-kkia-tx1', 23500]], kkia(sources(true)));
dit('pas encore sur la piece : elle reste au registre, a rapprocher, au bon rendez-vous',
  [['r-pay-tx1', 24500, true, 'rdv-1']], sources(false).filter((r) => r.cashbox === 'KkiaPay').map((r) => [r.id, r.amountXof, /rapprocher/.test(r.label), r.apptId]));

/* ── 9. Les textes et les portes ──────────────────────────────────────── */
const mot = motDeLaFacture({ id: 'c1', name: 'Awa Kossou', phone: '+22901000000' } as never, '2026-10-27', '23 500 F', 'https://maisonmnd.com/trone/payer.html?tg=r-' + j, true);
dit('le mot de la facture en ligne : la page, les reseaux, aucun numero de piece, l annee', [true, false, false, true],
  [/MTN, Moov, Celtiis ou carte/.test(mot), /compose le numéro/.test(mot), /MND-\d{4}-\d{4}/.test(mot), /27 octobre 2026/.test(mot)]);
const payer = lis('public/payer.html');
const reg = /\/\^r-\(\[([a-z0-9]+)\]\{(\d+)\}\)\$\//.exec(payer);
dit('payer.html mene r-<jeton> a regler.html, avec le meme alphabet et la meme longueur', [ALPHABET_DU_JETON, String(LONGUEUR_DU_JETON), true], [reg?.[1], reg?.[2], /location\.replace\('regler\.html\?r=' \+ rj\[1\]\)/.test(payer)]);
dit('... et un lien Tap & Go d avant compose toujours', true, /if \(p\.has\('tg'\) && !rj\)/.test(payer) && /\^\(\\d\{3,8\}\)-\(\\d\{1,9\}\)\$/.test(payer));
const envoi = sansCommentaires(lis('src/apps/trone/routes/vente/envoi-de-la-piece.ts'));
dit('« Terminer la seance » : le lien seulement quand la fonction repond, le rituel du jour seulement',
  [true, true, true], [/saitRegler\(await versionDuReglement\(\)\)/.test(envoi), /if \(!o\?\.memePasse && jourDuRituel !== aujourdhui\(\)\) return;\s*const p = await preparer/.test(envoi), /enLigne: !!lien/.test(envoi)]);
/* UN RENDEZ-VOUS PASSÉ A DEUX GESTES — 26 octobre 2026 (sa décision) : « envoyer la facture » part
   exprès (memePasse), « Honorer sans prévenir » ne dit rien ; aucun autre bouton n'envoie pour un RDV passé. */
for (const [fichier, nom] of [['src/apps/trone/routes/clients/actions.tsx', 'l encaissement'], ['src/apps/trone/routes/clients/Carnet.tsx', 'le Carnet']] as const) {
  const t = sansCommentaires(lis(fichier));
  dit(`${nom} : un RDV passe a deux gestes, l envoi expres et le silence`, [true, true, true, true],
    [/Terminer la séance · envoyer la facture/.test(t), /Honorer sans prévenir/.test(t),
      /if \(envoyer && h\.facture && !h\.deja\) void envoiDeLaPiece\.aRegler\(h\.facture\.id, \w+\.date, \{ memePasse: true \}\);/.test(t),
      /onClick=\{\(\) => termine\(false\)\}>Honorer sans prévenir/.test(t)]);
}
/* LE RENVOI D'UN RITUEL HONORÉ QUI DOIT ENCORE — 26 octobre 2026 (« Oui, un bouton d'envoi »). */
for (const [fichier, nom] of [['src/apps/trone/routes/clients/actions.tsx', 'l encaissement'], ['src/apps/trone/routes/clients/Carnet.tsx', 'le Carnet']] as const) {
  const t = sansCommentaires(lis(fichier));
  dit(`${nom} : « Envoyer la facture sur son WhatsApp » sur un rituel honore qui doit encore, en renvoi`, [true, true],
    [/status === 'honoré' && apptDueXof\(\w+, byId\) > 0 && \(/.test(t), /envoiDeLaPiece\.aRegler\(r\.inv\.id, \w+\.date, \{ memePasse: true, renvoi: true \}\);/.test(t)]);
}
dit('le renvoi change de cle a chaque minute : une facture deja partie repart, un double toucher non', true,
  /cle: o\?\.renvoi \? `\$\{p\.piece\.id\}-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 16\)\}` : p\.piece\.id,/.test(envoi));
dit('... et nul autre chemin n envoie la facture d un RDV passe', 4,
  ['src/apps/trone/routes/clients/actions.tsx', 'src/apps/trone/routes/clients/Carnet.tsx', 'src/apps/trone/routes/pilotage/Dashboard.tsx']
    .map((f) => (sansCommentaires(lis(f)).match(/memePasse: true/g) ?? []).length).reduce((a, b) => a + b, 0));
dit('le Trone monte le guetteur des reglements en ligne', true, /useReglementsEnLigne\(\);/.test(sansCommentaires(lis('src/apps/trone/shell/Shell.tsx'))));
dit('la page est construite avec le Trone (vite et build-sites)', [true, true], [/regler: resolve\(__dirname, 'regler\.html'\)/.test(lis('vite.config.ts')), /apps: 'trone,[^']*\bregler\b/.test(lis('scripts/build-sites.mjs'))]);
dit('la page dit la devise de la Maison, mot pour mot, sans emporter l ERP', [DEVISE_COMPLETE, false],
  [/const DEVISE = '([^']+)';/.exec(lis('src/apps/regler/App.tsx'))?.[1], /shared\/(identite|sync|supabase|finance)'/.test(lis('src/apps/regler/App.tsx'))]);
const appTexte = lis('src/apps/regler/App.tsx');
dit('les montants du merci : 500, 1 000, 2 000, 5 000, 10 000, puis Autre (sa liste du 25 octobre 2026)', ['500, 1000, 2000, 5000, 10000', true],
  [/const POURBOIRES = \[([^\]]+)\];/.exec(appTexte)?.[1], />\s*Autre\s*</.test(appTexte)]);
const elision = new RegExp(/const deLaCliente = [^?]+\? '' : \/(\^\[[^\]]+\])\/i/.exec(appTexte)?.[1] ?? '^$', 'i');
dit('« la seance d Awa », mais « de Yeman » : l elision devant une voyelle seulement', ['d', 'd', 'de', 'de', 'de'],
  ['Awa', 'Inès', 'Yéman', 'Sena', 'Hélène'].map((p) => (elision.test(p) ? 'd' : 'de')));
dit('plus de Tap & Go sur la page : un seul bouton de paiement, et « Quelqu un regle pour moi » explique (25 octobre 2026)', [false, true],
  [/Tap &amp; Go|payer\.html\?tg=/.test(sansCommentaires(appTexte)), /la personne voit la séance et le montant, jamais votre numéro/.test(appTexte)]);
dit('la page ne decide d aucun montant : elle lit le reste au serveur', [true, false], [/p\.resteXof \+ \(p\.pourboire \? pourboire : 0\)/.test(lis('src/apps/regler/App.tsx')), /resteXof\s*=/.test(sansCommentaires(lis('src/apps/regler/App.tsx')))]);

/* ── 10. La fonction porte la même règle, et se rejoue ─────────────────── */
dit('la fonction regler-la-seance porte la copie EXACTE de regler-la-seance-pur.ts', copieAttendue(racine), copieDuServeur(racine));

type Row = { id: string; branch_id?: string; data?: any; [k: string]: any };
const db: Record<string, Row[]> = {};
const lit = (r: Row, col: string): unknown => {
  if (!col.startsWith('data')) return r[col];
  const parts = col.replace(/^data/, '').split(/->>?/).filter(Boolean);
  let x: any = r.data;
  for (const p of parts) x = x?.[p];
  return x;
};
class Requete {
  filtres: ((r: Row) => boolean)[] = [];
  mode: 'select' | 'insert' | 'update' = 'select';
  valeur: any = null; lim = Infinity; seul = false; compte = false; tete = false;
  constructor(public table: string) {}
  select(_c?: string, o?: { count?: string; head?: boolean }) { if (o?.count) this.compte = true; if (o?.head) this.tete = true; return this; }
  eq(c: string, v: unknown) { this.filtres.push((r) => String(lit(r, c) ?? '') === String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((r) => String(lit(r, c) ?? '') >= String(v)); return this; }
  limit(k: number) { this.lim = k; return this; }
  maybeSingle() { this.seul = true; return this; }
  insert(row: Row) { this.mode = 'insert'; this.valeur = row; return this; }
  update(o: any) { this.mode = 'update'; this.valeur = o; return this; }
  then(ok: (x: any) => any, ko?: (e: any) => any) { return Promise.resolve(this.fais()).then(ok, ko); }
  fais(): any {
    const t = (db[this.table] ??= []);
    if (this.mode === 'insert') {
      const row = { ...(structuredClone(this.valeur)), at: this.valeur.at ?? new Date().toISOString() };
      if (row.id && t.some((r) => r.id === row.id)) return { error: { code: '23505', message: 'duplicate key' } };
      t.push(row);
      return { error: null };
    }
    const lus = t.filter((r) => this.filtres.every((f) => f(r)));
    if (this.mode === 'update') { for (const r of lus) Object.assign(r, structuredClone(this.valeur)); return { error: null }; }
    if (this.compte) return { count: lus.length, error: null };
    const data = structuredClone(lus.slice(0, this.lim));
    return { data: this.seul ? (data[0] ?? null) : data, error: null };
  }
}
const admin = { from: (t: string) => new Requete(t) };
const transactions: Record<string, { status: string; amount: number; fees: number; source: string }> = {};
let handler: ((req: Request) => Promise<Response>) | null = null;
const env: Record<string, string> = { SUPABASE_URL: 'http://base', SERVICE_KEY: 'service', KKIAPAY_PUBLIC_KEY: 'pk', KKIAPAY_PRIVATE_KEY: 'pv', KKIAPAY_SECRET_KEY: 'sk' };
const fauxFetch = async (url: string, init?: { body?: string }) => {
  if (!String(url).includes('/api/v1/transactions/status')) return new Response('', { status: 404 });
  const id = JSON.parse(init?.body ?? '{}').transactionId;
  const tx = transactions[id];
  return tx ? new Response(JSON.stringify(tx), { status: 200 }) : new Response('{}', { status: 404 });
};
const module = { exports: {} as Record<string, unknown> };
new Function('createClient', 'Deno', 'fetch', 'module', 'exports', readFileSync(process.env.REGLER_FONCTION as string, 'utf8'))(
  () => admin, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } }, fauxFetch, module, module.exports,
);
const appelle = async (corps?: Record<string, unknown>) => {
  const r = await handler!(new Request('http://f/regler-la-seance', corps ? { method: 'POST', body: JSON.stringify(corps), headers: { 'x-forwarded-for': '1.2.3.4' } } : { method: 'GET' }));
  return { status: r.status, corps: await r.json() as any };
};
const remplis = () => {
  db.appointments = [{ id: 'rdv-1', branch_id: 'b1', data: structuredClone({ ...rdv, branchId: 'b1', payments: [{ id: 'ac', amountXof: 7500, date: '2026-10-22' }] }) }];
  db.invoices = [{ id: 'f1', branch_id: 'b1', data: structuredClone({ ...facture, branchId: 'b1', number: 'MND-2026-0900', clientId: 'c1' }) }];
  db.clients = [{ id: 'c1', branch_id: 'b1', data: { name: 'Awa Kossou', phone: '+22901000000' } }];
  db.payments = [];
  db.edge_rate_limits = [];
};
remplis();
const sante = await appelle();
dit('GET : la version et les secrets en booleens, sans valeur', ['2026-10-25-a', { public: true, private: true, secret: true, service: true }], [sante.corps.version, sante.corps.secrets]);
const lu = await appelle({ action: 'lire', jeton: j });
dit('lire : le juste reste et le prenom, et la premiere ouverture se note sur le rendez-vous',
  [200, 'a-regler', 23500, 'Awa', true], [lu.status, lu.corps.page?.etat, lu.corps.page?.resteXof, lu.corps.page?.prenom, !!db.appointments[0].data.lienDeReglement.ouvertLe]);
dit('lire : un jeton mal forme se refuse, un jeton inconnu ne dit rien', [400, 'introuvable'], [(await appelle({ action: 'lire', jeton: 'abc' })).status, (await appelle({ action: 'lire', jeton: jetonDe(new Array(14).fill(5)) })).corps.page?.etat]);
transactions.tx1 = { status: 'SUCCESS', amount: 24500, fees: 466, source: 'MTN_BENIN' };
const r1 = await appelle({ action: 'regler', jeton: j, transactionId: 'tx1' });
const f1 = () => db.invoices[0].data;
dit('regler : 23 500 sur la piece, 1 000 de pourboire, la piece soldee, le registre a la reference du rendez-vous',
  [200, 23500, 1000, 'payée', 1000, 'reg-rdv-1'], [r1.status, r1.corps.versementXof, r1.corps.pourboireXof, f1().status, f1().tipXof, db.payments.find((p) => p.id === 'tx1')?.data?.partnerId]);
dit('... le rendez-vous recoit le meme versement et le lien dit paye', [['ac', 'kkia-tx1'], true], [db.appointments[0].data.payments.map((p: any) => p.id), !!db.appointments[0].data.lienDeReglement.payeLe]);
const r2 = await appelle({ action: 'regler', jeton: j, transactionId: 'tx1' });
dit('un rejeu ne double rien', [200, true, 2, 1000], [r2.status, r2.corps.deja, f1().payments.length, f1().tipXof]);
transactions.tx2 = { status: 'SUCCESS', amount: 23500, fees: 446, source: 'MOOV_BJ' };
const r3 = await appelle({ action: 'regler', jeton: j, transactionId: 'tx2' });
dit('une seance deja reglee ne prend plus rien ; l argent reste au registre, a rapprocher', [409, 'deja_reglee', true, 2], [r3.status, r3.corps.error, db.payments.some((p) => p.id === 'tx2'), f1().payments.length]);
dit('lire apres coup : reglee', 'reglee', (await appelle({ action: 'lire', jeton: j })).corps.page?.etat);
remplis();
db.payments.push({ id: 'txA', branch_id: 'b1', data: { id: 'txA', partnerId: 'cc-carte', amountXof: 23500, status: 'success', provider: 'kkiapay' } });
transactions.txA = { status: 'SUCCESS', amount: 23500, fees: 0, source: 'MTN_BENIN' };
dit('une transaction d une autre cible ne regle pas cette seance', [409, 'transaction_deja_utilisee', undefined], [(await appelle({ action: 'regler', jeton: j, transactionId: 'txA' })).status, (await appelle({ action: 'regler', jeton: j, transactionId: 'txA' })).corps.error, f1().tipXof]);
transactions.txB = { status: 'SUCCESS', amount: 20000, fees: 0, source: 'MTN_BENIN' };
const r4 = await appelle({ action: 'regler', jeton: j, transactionId: 'txB' });
dit('un argent qui ne couvre pas ne pose rien sur la piece', [409, 'montant', 1], [r4.status, r4.corps.error, f1().payments.length]);
transactions.txC = { status: 'FAILED', amount: 23500, fees: 0, source: 'MTN_BENIN' };
dit('une transaction echouee ne pose rien', [402, 1], [(await appelle({ action: 'regler', jeton: j, transactionId: 'txC' })).status, f1().payments.length]);
remplis();
db.payments.push({ id: 'txF', branch_id: 'b1', data: { id: 'txF', partnerId: 'reg-rdv-1', amountXof: 23500, feesXof: 446, method: 'MTN_BENIN', status: 'success', provider: 'kkiapay' } });
const filet = await appelle({ action: 'rattraper', jeton: j });
dit('le filet : un paiement que seul le webhook a vu se pose a la lecture, sans noter d ouverture',
  [1, 'reglee', true, false], [filet.corps.rattrapes, filet.corps.page?.etat, f1().payments.some((p: any) => p.id === 'kkia-txF'), !!db.appointments[0].data.lienDeReglement.ouvertLe]);

console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nTout tient (${n} controles).`);
