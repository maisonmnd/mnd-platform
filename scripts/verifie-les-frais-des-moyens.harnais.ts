/* LES FRAIS DES MOYENS DE PAIEMENT, ÉPROUVÉS — `node scripts/verifie-les-frais-des-moyens.mjs`.

   22 novembre 2026 : « Je veux un espace dans mes paramètres où je corrige
   les frais de carte à 2,3 %, et tous les frais liés aux différents moyens
   de paiement MTN, KkiaPay, FedaPay » (Yéman). L'attente vient de là :
     - chaque taux a son défaut, celui d'avant, et un taux posé le remplace ;
     - un taux se lit de 0 à 10 %, « 2,3 » comme « 2.3 » ; le reste ne bouge rien ;
     - le serveur MTN lit le même taux, de la même façon (sa copie) ;
     - chaque écran qui dit ou compte des frais prend le taux réglé ;
     - KkiaPay les ajoute lui-même : le Trône ne les ajoute jamais à la pièce.
   Montants et numéros : des exemples. */
import { readFileSync } from 'node:fs';
import {
  FRAIS_PAR_DEFAUT, LIGNES_DES_FRAIS, TAUX_MAX_PCT, caseDuTaux, defautDeLaLigne, exempleDeLaLigne, reglagesApresSaisie,
  tauxDe, tauxDeLaLigne, tauxDuChoix, tauxFedapayMobile, tauxLu, tauxTapGo,
} from '../src/shared/frais-des-moyens-pur';
import {
  TAUX_AJOUTE_MTN_PCT, demandeDeReglement, entreeDesFraisGardes, fraisAjoutesMtn, fraisDeMtn, tauxDesReglages, tauxMtnDesReglages,
} from '../src/shared/collecte-mtn-pur';
import { TAUX_MOMOPAY_PCT, montantMomopayFraisCompris } from '../src/shared/momopay-de-la-maison-pur';
import { FRAIS_DE_CARTE_PCT, fraisDeCarteXof } from '../src/shared/frais-de-carte-pur';
import { fraisKkiapayDeCarteXof, fraisKkiapayXof, leChoixDuMoyen, type SanteDesMoyens } from '../src/shared/choix-du-moyen-pur';

let ko = 0;
let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu);
  const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK     ${nom}`);
  else { ko++; console.log(`ECHEC  ${nom} -> attendu ${a}, obtenu ${String(o)}`); }
};
const sansCommentaires = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const compte = (t: string, s: string): number => t.split(s).length - 1;

/* ── Les défauts : ceux d'avant ── */
dit('les defauts : carte 2,3, MTN ajoutes 1,6, MTN retenus 1,2, KkiaPay carte 2,3, KkiaPay mobile 1,5',
  { carteTerminalPct: 2.3, mtnAjoutePct: 1.6, mtnRetenuPct: 1.2, kkiapayCartePct: 2.3, kkiapayMobilePct: 1.5 }, FRAIS_PAR_DEFAUT);
dit('... ce sont les constantes des modules (une seule source) ; MoMoPay et la collecte, un meme contrat MTN',
  [FRAIS_DE_CARTE_PCT, TAUX_AJOUTE_MTN_PCT, TAUX_MOMOPAY_PCT], [FRAIS_PAR_DEFAUT.carteTerminalPct, FRAIS_PAR_DEFAUT.mtnAjoutePct, FRAIS_PAR_DEFAUT.mtnRetenuPct]);
dit('FedaPay mobile 1,8 et Tap & Go 1,6 par defaut, le taux pose sinon', [1.8, 1.6, 2, 1.7],
  [tauxFedapayMobile(undefined), tauxTapGo(undefined), tauxFedapayMobile({ tauxMobilePct: 2 }), tauxTapGo({ tapgo: { tauxPct: 1.7 } })]);

/* ── La lecture d'un taux ── */
dit('un taux se lit : « 2,3 », « 2.3 », 4, 0 et 10 ; vide, lettres, negatif et plus de 10 % ne se lisent pas',
  [2.3, 2.3, 4, 0, 10, 1.23, null, null, null, null, null],
  [tauxLu('2,3'), tauxLu(' 2.3 '), tauxLu(4), tauxLu(0), tauxLu(TAUX_MAX_PCT), tauxLu('1,234'), tauxLu(''), tauxLu('abc'), tauxLu(-1), tauxLu(10.5), tauxLu(null)].map((x) => x ?? null));
dit('le taux en vigueur : pose, ou celui d avant', [3, 2.3, 2.3], [tauxDe({ carteTerminalPct: 3 }, 'carteTerminalPct'), tauxDe({}, 'carteTerminalPct'), tauxDe({ carteTerminalPct: 'x' as unknown as number }, 'carteTerminalPct')]);
const essais: unknown[] = ['2,3', '2.3', 2.3, 0, 10, 10.01, -0.1, '', '  ', 'abc', null, undefined, '1,234', 7];
dit('le serveur MTN lit un taux comme le Trone (sa copie, tauxDesReglages)', essais.map((v) => tauxLu(v) ?? 9.99), essais.map((v) => tauxDesReglages(v, 9.99)));
dit('les deux taux MTN au serveur : poses, absents, illisibles, trop hauts', [
  { ajoutePct: 2, retenuPct: 1 }, { ajoutePct: 1.6, retenuPct: 1.2 }, { ajoutePct: 1.6, retenuPct: 1.2 }, { ajoutePct: 1.6, retenuPct: 1.4 },
], [
  tauxMtnDesReglages({ frais: { mtnAjoutePct: 2, mtnRetenuPct: 1 } }), tauxMtnDesReglages(null),
  tauxMtnDesReglages({ frais: { mtnAjoutePct: 'abc' } }), tauxMtnDesReglages({ frais: { mtnAjoutePct: 50, mtnRetenuPct: '1,4' } }),
]);

/* ── Les comptes, au taux réglé ── */
dit('MTN : 1,6 % par defaut (30 000 F : 480 F), 2 % pose (600 F), 0 % : rien', [480, 600, 0], [fraisAjoutesMtn(30_000), fraisAjoutesMtn(30_000, 2), fraisAjoutesMtn(30_000, 0)]);
const ref = '6f0e8e2a-3d6b-4c1e-9a7b-2c4d5e6f7a8b';
const dem = (taux?: number) => demandeDeReglement({ reference: ref, origine: 'lien', rdvId: 'r1', pieceId: 'p1', branchId: 'b1', msisdn: '0162000000', resteXof: 30_000, pourboireXof: 1_000, ...(taux === undefined ? {} : { tauxAjoutePct: taux }) });
dit('la demande MTN porte le taux lu au serveur : 31 000 F a 2 % : 620 F, 31 620 F demandes ; sans taux : 496 F',
  [620, 31_620, 496], [(dem(2) as { frais_ajoutes_xof: number }).frais_ajoutes_xof, (dem(2) as { montant_xof: number }).montant_xof, (dem() as { frais_ajoutes_xof: number }).frais_ajoutes_xof]);
dit('ce que MTN retient : 1,2 % par defaut (10 000 F : 120 F), 1,5 % pose (150 F)', [120, 150], [fraisDeMtn(10_000), fraisDeMtn(10_000, 1.5)]);
const note = (o: { ajoutePct?: number; retenuPct?: number }) => entreeDesFraisGardes({ reference: ref, branchId: 'b1', gardesXof: 100, jour: '2026-11-22', ...o }).note;
dit('la note des frais gardes dit les taux du jour', [true, true], [note({}).startsWith('Les 1,6 % payés par la cliente, moins les 1,2 % retenus par MTN'), note({ ajoutePct: 2, retenuPct: 1 }).startsWith('Les 2 % payés par la cliente, moins les 1 % retenus par MTN')]);
dit('MoMoPay : 20 000 F → 20 250 F a 1,2 %, 20 450 F a 2 %', [20_250, 20_450], [montantMomopayFraisCompris(20_000), montantMomopayFraisCompris(20_000, 2)]);
dit('carte au terminal : 28 000 F a 2,3 % : 644 F ; a 4 % : 1 120 F', [644, 1_120], [fraisDeCarteXof(28_000, 2.3), fraisDeCarteXof(28_000, 4)]);
dit('KkiaPay : le recu du 21 novembre (64 480 F : 1 484 F), et 1,5 % sur 10 000 F : 150 F', [1_484, 1_484, 150, 0], [fraisKkiapayDeCarteXof(64_480), fraisKkiapayXof(64_480, 2.3), fraisKkiapayXof(10_000, 1.5), fraisKkiapayXof(10_000, 0)]);

/* ── La carte des Paramètres : la saisie ── */
const s0 = { frais: { mtnAjoutePct: 2 }, mndPay: { actif: true, tauxMobilePct: 1.8, tapgo: { code: '51166' } } };
dit('une saisie pose le taux, l autre reglage intact', [{ mtnAjoutePct: 2, carteTerminalPct: 3 }, s0.mndPay], [reglagesApresSaisie('carteTerminalPct', '3', s0)?.frais, reglagesApresSaisie('carteTerminalPct', '3', s0)?.mndPay]);
dit('une case videe rend le taux d avant ; une saisie illisible ou trop haute ne bouge rien', [{}, null, null],
  [reglagesApresSaisie('mtnAjoutePct', '', s0)?.frais, reglagesApresSaisie('mtnAjoutePct', 'deux', s0), reglagesApresSaisie('mtnAjoutePct', '12', s0)]);
dit('FedaPay et Tap & Go s ecrivent dans mndPay, a leur place, le code marchand garde', [2, { code: '51166', tauxPct: 1.8 }, { mtnAjoutePct: 2 }],
  [reglagesApresSaisie('fedapayMobile', '2', s0)?.mndPay?.tauxMobilePct, reglagesApresSaisie('tapgo', '1,8', s0)?.mndPay?.tapgo, reglagesApresSaisie('tapgo', '1,8', s0)?.frais]);
dit('la case montre le taux pose, vide sinon (le defaut en filigrane)', ['2', '', '1,8', '1,6'], [caseDuTaux('mtnAjoutePct', s0), caseDuTaux('carteTerminalPct', s0), caseDuTaux('fedapayMobile', s0), String(defautDeLaLigne('tapgo')).replace('.', ',')]);
dit('chaque ligne a son taux et son exemple ; sept lignes, dans trois groupes', [7, 3, true],
  [LIGNES_DES_FRAIS.length, new Set(LIGNES_DES_FRAIS.map((l) => l.groupe)).size, LIGNES_DES_FRAIS.every((l) => tauxDeLaLigne(l.id, {}) >= 0 && /^Sur |^Par MoMoPay/.test(exempleDeLaLigne(l.id, {})))]);
dit('les exemples, sur 10 000 F', [
  'Sur 10 000 F : + 230 F, à passer au terminal 10 230 F.', 'Sur 10 000 F : + 200 F, la demande part à 10 200 F.', 'Par MoMoPay, 10 000 F : le code de la facture porte 10 150 F.',
], [exempleDeLaLigne('carteTerminalPct', {}), exempleDeLaLigne('mtnAjoutePct', s0), exempleDeLaLigne('mtnRetenuPct', {})]);

/* ── Les phrases du choix du moyen ── */
const sante: SanteDesMoyens = { mtn: { ouvert: true, repond: true }, fedapay: { ouvert: true, repond: true } };
const choix = (o: Partial<Parameters<typeof leChoixDuMoyen>[0]>) => leChoixDuMoyen({ voie: 'mobile', montantXof: 10_000, sante, tapGoOuvert: true, ...o });
dit('les phrases disent le taux regle : MTN 2 %, KkiaPay mobile 1,5 %, TPE KkiaPay 2,5 %', [true, true, true], [
  choix({ telephone: '0162000000', taux: tauxDuChoix({ mtnAjoutePct: 2 }) }).pourquoi.includes('frais de 2 % ajoutés'),
  choix({ telephone: '0195000000', taux: tauxDuChoix({}) }).pourquoi.includes('Ses frais (1,5 %)'),
  choix({ voie: 'carte', taux: tauxDuChoix({ kkiapayCartePct: 2.5 }) }).pourquoi.includes('ses 2,5 % pour elle'),
]);
dit('... et sans taux, ceux d avant', [true, true], [choix({ telephone: '0162000000' }).pourquoi.includes('frais de 1,6 % ajoutés'), choix({ voie: 'carte' }).pourquoi.includes('ses 2,3 % pour elle')]);

/* ── Le câblage ── */
const enc = sansCommentaires('src/apps/trone/routes/clients/actions.tsx');
dit('Encaisser : la carte, sa ligne, le TPE KkiaPay et les phrases prennent les taux regles', [true, true, true, true, 2, false], [
  enc.includes("const tauxCarte = tauxDe(settings.frais, 'carteTerminalPct');"),
  enc.includes("(pt.tuile === 'carte' && !pt.sansFrais && !fxOn ? fraisDeCarteXof(montantDe(pt), tauxCarte) : 0);"),
  enc.includes('[ligneDesFraisDeCarte(totalFrais, `il-frais-${uid()}`, tauxCarte)]'),
  enc.includes('fraisKkiapayDeCarteXof(x, tauxKkiaCarte)'),
  compte(enc, 'kkiapay: etatKkiapay, taux: tauxDesPhrases,'),
  /FRAIS_DE_CARTE_DIT|FRAIS_KKIAPAY_CARTE_PCT/.test(enc),
]);
dit('... KkiaPay n ajoute toujours rien a la piece : seuls les frais du terminal y entrent', true,
  /const fraisDeLaPart = \(pt: PartEnc\): number =>\s*\n\s*\(pt\.tuile === 'carte' && /.test(enc));
const mtnTrone = sansCommentaires('src/apps/trone/routes/clients/PayerParMtnAuTrone.tsx');
dit('Payer par MTN au Trone : le taux regle, dit et compte', [true, true], [mtnTrone.includes('fraisAjoutesMtn(resteXof + Math.max(0, pourboireXof), tauxMtn)'), mtnTrone.includes('frais MTN de {tauxDit(tauxMtn)} % compris')]);
const page = sansCommentaires('src/apps/regler/Mtn.tsx');
dit('la page Regler : le taux vient du serveur, plus aucun « 1,6 % » ecrit en dur', [true, true, true, false], [
  page.includes('laCollecteEtSesFrais()'), page.includes('fraisAjoutesMtn(totalXof, tauxMtn)'), page.includes('fraisAjoutesMtn(avantFrais, tauxMtn)'), /1,6 %/.test(page)]);
dit('la page Regler ne promet plus de taux KkiaPay ecrit en dur', false, /1,9 %|4 % carte/.test(sansCommentaires('src/apps/regler/App.tsx')));
dit('le QR du comptoir et son affiche disent le taux regle', [false, 2], [/Frais MTN de 1,6 %|frais MTN de 1,6 %/.test(sansCommentaires('src/apps/trone/routes/clients/QrCodes.tsx')),
  compte(sansCommentaires('src/apps/trone/routes/clients/QrCodes.tsx'), "tauxDit(tauxDe(reglagesMaison.frais, 'mtnAjoutePct'))")]);
const srv = sansCommentaires('supabase/functions/collecte-mtn/index.ts');
dit('le serveur MTN lit les taux dans mnd_settings, a la demande, a la pose, et les rend au GET', [true, true, true, true, true, 2], [
  srv.includes("tauxMtnDesReglages(premiere(await base('documents?key=eq.mnd_settings&select=data&limit=1'))?.data)"),
  srv.includes('    tauxAjoutePct: (await lesTaux()).ajoutePct,'),
  srv.includes('const frais = fraisDeMtn(c.montant_xof, taux.retenuPct);'),
  srv.includes("frais_xof: fraisDeMtn(c.montant_xof, (await lesTaux()).retenuPct)"),
  srv.includes("const VERSION = '2026-11-22-a';"),
  compte(srv, 'fraisAjoutesPct: (await lesTaux()).ajoutePct }'),
]);
const fed = sansCommentaires('src/apps/trone/routes/systeme/CarteMndPay.tsx');
const prm = sansCommentaires('src/apps/trone/routes/systeme/Parametres.tsx');
dit('un taux a un seul endroit : la carte FedaPay n ecrit plus ses taux, la carte des frais vient avant elle', [false, false, true], [
  fed.includes('pose({ tauxMobilePct'), fed.includes('poseTapGo({ tauxPct'), prm.indexOf('<CarteDesFrais />') > 0 && prm.indexOf('<CarteDesFrais />') < prm.indexOf('<CarteMndPay />')]);
const carte = sansCommentaires('src/apps/trone/routes/systeme/CarteDesFrais.tsx');
dit('la direction seule ecrit un taux ; une saisie illisible ne s ecrit pas', [true, true], [
  carte.includes("if (!estDirection) { toast('Ce réglage appartient à la direction.');"), carte.includes("if (!reglagesApresSaisie(l.id, saisie, s)) { toast('Un taux de 0 à 10 %, par exemple 2,3.');")]);
const pdf = sansCommentaires('src/apps/trone/routes/vente/pdf-de-la-piece.ts');
dit('le code MoMoPay du foyer au taux regle, partout ou le papier se fait', [true, 2, true], [
  pdf.includes('montantMomopayFraisCompris(resteXof, o.momopayPct)'),
  compte(sansCommentaires('src/apps/trone/routes/vente/envoi-de-la-piece.ts'), "momopayPct: tauxDe(settings.frais, 'mtnRetenuPct'),"),
  sansCommentaires('src/apps/trone/routes/vente/FenetreDuPoint.tsx').includes('reglages: reglagesMnd, momopayPct,')]);

/* ── KkiaPay : le numéro tapé, tous réseaux, et la fenêtre vide ── */
const kk = sansCommentaires('src/apps/trone/routes/clients/KkiapayAuTrone.tsx');
dit('KkiaPay au Trone : son numero se tape (tous reseaux), la fenetre s ouvre avec lui, ou vide', [true, true, true, true, false], [
  kk.includes('const [numero, setNumero] = useState(() => numeroDeDepart(telephone));'),
  kk.includes('onClick={() => { void ouvre(lu); }}') && kk.includes('disabled={!lu}'),
  kk.includes('onClick={() => { void ouvre(null); }}'),
  kk.includes('...(numeroLu ? { phone: numeroLu.slice(3) } : {})'),
  kk.includes('estUnNumeroMtn(m)) return'),
]);
dit('... ses frais dits au taux regle (1,5 %), jamais ajoutes par le Trone', [true, true], [
  kk.includes("const tauxKkia = tauxDe(reglages.frais, 'kkiapayMobilePct');"), kk.includes('amountXof: montant, partnerId: prep.page.reference')]);

console.log(ko ? `\n${ko} ECHEC(S) sur ${n}.` : `\n${n}/${n} epreuves : les frais des moyens de paiement.`);
if (ko) process.exitCode = 1;
