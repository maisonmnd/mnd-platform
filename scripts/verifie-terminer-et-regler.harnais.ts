/* TERMINER ET RÉGLER, ÉPROUVÉ · 6 novembre 2026.
   `node scripts/verifie-terminer-et-regler.mjs` (et `--prouve`).

   La règle tranchée par Yéman le 6 novembre 2026 (maquette « Terminer et
   régler, par trois portes ») : la porte s'ouvre à l'heure du rituel, le jour
   même, jusqu'à minuit à Cotonou ; jamais pour un rendez-vous annulé, déjà
   réglé ou couvert sans reste ; « Passe au comptoir » l'éteint ; le code seul
   n'ouvre rien, il faut aussi les 4 derniers chiffres du numéro ; la
   recherche est bornée, répond pareil à un code inconnu et à des chiffres
   faux, et se freine ; « j'ai terminé » se reconnaît en phrase libre ; le
   rendez-vous passe honoré QUAND ELLE A RÉGLÉ.

   Chaque attente est écrite à la main, d'après la règle, jamais tirée du
   code éprouvé. Têtes et numéros INVENTÉS. Sortie ASCII : la console de
   Windows. */
import { readFileSync } from 'node:fs';
import {
  honneurAuReglement, jourDeLaFin, instantDuRituel, prixFigeDeLaFin, argentRecuDeLaFin, resteConnuDeLaFin,
  resteDeLaPieceDeLaFin, pieceDuRdvDeLaFin, porteDeLaFin, finValable, SIGNES_DU_CODE_DE_LA_FIN, codeLu, quatreChiffresLus,
  finDuNumero, fenetreDeLaRecherche, retrouveLeRdv, FREIN_DE_LA_RECHERCHE, freinDeLaRecherche, billetDeLaFin,
  SIGNES_DU_JETON_DE_LA_FIN, LONGUEUR_DU_JETON_DE_LA_FIN, jetonDeLaFin, estUnJetonDeLaFin, adresseDuReglementDeLaFin,
  lienDeLaFin, notificationDeLaFin, ditQuElleATermine, ditAutreChoseQueLaFin, nommeSonRendezVous, codeDansLeMessage, motDeLaMaisonALaFin, PAGE_POUR_RETROUVER_SON_RDV,
  aPeineCommence, ATTENTE_DE_LA_PORTE_WHATSAPP_MS, acompteAVerifier, notificationDeLAcompteAVerifier,
  marqueDeLaFinAuCarnet, pieceAPreparer, suitesAFaire, carteDuRituelEnCours, versementsDejaRecus,
  type RdvDeLaFin, type PieceDeLaFin,
} from '../src/shared/terminer-et-regler-pur';
import { ALPHABET_DE_LA_REFERENCE, referenceDuRendezVous, FORME_DU_JETON_DU_RDV, apptIdDuJeton } from '../src/shared/lien-du-rdv-pur';
// @ts-expect-error module .mjs sans types
import { ecartsDesCopies } from './terminer-copie-serveur.mjs';
import {
  ALPHABET_DU_JETON, LONGUEUR_DU_JETON, jetonDe, estUnJeton, parametreDuLien, resteDeLaPiece, laPieceDuRdv, type PieceLue,
} from '../src/shared/regler-la-seance-pur';
import { prixFigeLu } from '../src/shared/cloture-du-jour-pur';
import { LIEN_TAPGO } from '../src/shared/mnd-pay-pur';
import { attenteDeLaPiece, pageDuReglement, refusDeLaFin, retourAMaCouronne } from '../src/shared/terminer-et-regler-serveur';
import { EN } from '../src/apps/couronne/i18n/en';
import {
  CHEMIN_POUR_RETROUVER, MOTS_DE_LA_RECHERCHE, billetDeLaPageLu, billetLu, codeDeLAdresse, finLue, rechercheLue, refusDit, reglementDuBillet, saisieARevoir,
} from '../src/apps/revelateur/billet-du-rdv-pur';

let ko = 0; let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* Cotonou est a UTC+1 : 8 h a Cotonou, c'est 7 h UTC. */
const aCotonou = (jour: string, heure: string): number => Date.parse(`${jour}T${heure}:00+01:00`);
const JOUR = '2026-11-06';
const rdv = (plus: Partial<RdvDeLaFin> = {}): RdvDeLaFin => ({ id: 'rdv-1', date: JOUR, time: '08:00', status: 'confirmé', clientId: 'c1', priceXof: 12000, ...plus });
const porte = (plus: Partial<RdvDeLaFin>, quand: number, o: { comptoir?: boolean; piece?: number | null } = {}) =>
  porteDeLaFin({ rdv: rdv(plus), maintenantMs: quand, passeAuComptoir: o.comptoir, piece: o.piece === undefined || o.piece === null ? null : { resteXof: o.piece } }).raison;
const A_10H = aCotonou(JOUR, '10:00');

/* ── 1. L'heure de Cotonou ─────────────────────────────────────────────── */
dit('le rituel de 8 h a Cotonou commence a 7 h UTC ; 23 h 30 UTC est deja le lendemain a Cotonou',
  [Date.UTC(2026, 10, 6, 7, 0), '2026-11-07', '2026-11-06'],
  [instantDuRituel(JOUR, '08:00'), jourDeLaFin(Date.UTC(2026, 10, 6, 23, 30)), jourDeLaFin(Date.UTC(2026, 10, 6, 22, 59))]);
dit('une date ou une heure illisible ne donne aucun instant', [true, true], [Number.isNaN(instantDuRituel('', '08:00')), Number.isNaN(instantDuRituel(JOUR, 'matin'))]);

/* ── 2. La porte : des l'heure du rituel, le jour meme, jusqu'a minuit ──── */
dit('une minute avant l heure : fermee ; a l heure : ouverte ; a 23 h 59 : ouverte ; a minuit : le jour est passe',
  ['avant-l-heure', 'ouverte', 'ouverte', 'jour-passe'],
  [porte({}, aCotonou(JOUR, '07:59')), porte({}, aCotonou(JOUR, '08:00')), porte({}, aCotonou(JOUR, '23:59')), porte({}, aCotonou('2026-11-07', '00:00'))]);
dit('la veille au soir : pas encore le jour', 'pas-encore-le-jour', porte({}, aCotonou('2026-11-05', '20:00')));
dit('un rendez-vous annule n ouvre jamais, meme a l heure', 'annule', porte({ status: 'annulé' }, A_10H));
dit('deja regle (le prix fige est couvert par ses versements) : fermee, et dit', 'deja-regle', porte({ payments: [{ amountXof: 12000 }] }, A_10H));
dit('couvert par une formule, sans reste : rien a regler, que le prix soit fige ou non', ['rien-a-regler', 'rien-a-regler', 'rien-a-regler'],
  [porte({ coveredBySub: true, priceXof: 0 }, A_10H), porte({ coveredBySub: true, priceXof: undefined }, A_10H), porte({ coveredBySub: true, priceXof: 25000 }, A_10H)]);
dit('... mais couvert avec un supplement facture par l equipe (une piece qui doit) : la porte s ouvre', 'ouverte', porte({ coveredBySub: true, priceXof: 0 }, A_10H, { piece: 5000 }));
dit('un rituel offert (prix fige a zero, aucun argent) : rien a regler', 'rien-a-regler', porte({ priceXof: 0 }, A_10H));
dit('« Passe au comptoir » sur la fiche eteint la porte', ['comptoir', 'ouverte'], [porte({}, A_10H, { comptoir: true }), porte({}, A_10H, { comptoir: false })]);
/* UN ACOMPTE DEMANDE, PAS ENCORE VERIFIE (relecture du 6 novembre 2026) : le juste reste ne se connait pas. */
dit('un acompte demande que la Maison n a pas verifie ferme la porte en « comptoir » ; verifie, elle s ouvre ; avant l heure et deja regle se disent d abord',
  ['comptoir', 'ouverte', 'ouverte', 'avant-l-heure', 'deja-regle', [5000, 0, 0, 0]],
  [porte({ depositXof: 5000 }, A_10H), porte({ depositXof: 5000, depositConfirmed: true }, A_10H), porte({ depositXof: 0 }, A_10H), porte({ depositXof: 5000 }, aCotonou(JOUR, '07:00')), porte({ depositXof: 5000 }, A_10H, { piece: 0 }),
    [acompteAVerifier({ depositXof: 5000 }), acompteAVerifier({ depositXof: 5000, depositConfirmed: true }), acompteAVerifier({}), acompteAVerifier(null)]]);
dit('... et le personnel l apprend : le prenom, l heure, le montant, le comptoir ; aucun pronom',
  { titre: 'Awa a terminé son rituel', corps: 'Rendez-vous de 8 h. Acompte de 5 000 F demandé, pas encore vérifié : le règlement se fait au comptoir.', url: '/trone/#/carnet' },
  notificationDeLAcompteAVerifier({ prenom: 'Awa', heure: '08:00', acompteXof: 5000 }));
dit('... et Ma Couronne n allume pas sa carte pour un acompte a verifier (elle regle au comptoir)', [null, 'en-cours'],
  [carteDuRituelEnCours({ rdvs: [rdv({ depositXof: 5000 })], maintenantMs: A_10H }), carteDuRituelEnCours({ rdvs: [rdv({ depositXof: 5000, depositConfirmed: true })], maintenantMs: A_10H })?.etat ?? null]);
dit('... mais l heure et le reglement se disent avant le comptoir', ['avant-l-heure', 'deja-regle'],
  [porte({}, aCotonou(JOUR, '07:00'), { comptoir: true }), porte({ payments: [{ amountXof: 12000 }] }, A_10H, { comptoir: true })]);
dit('un rendez-vous en attente n est pas confirme : la porte reste fermee', 'pas-confirme', porte({ status: 'en attente' }, A_10H));
dit('honore sans piece ouverte : clos au comptoir ; honore avec une piece qui doit encore : ouverte', ['clos', 'ouverte'],
  [porte({ status: 'honoré' }, A_10H), porte({ status: 'honoré' }, A_10H, { piece: 5000 })]);
dit('la piece fait foi : soldee, la porte se ferme meme si le prix fige dit qu il reste', 'deja-regle', porte({}, A_10H, { piece: 0 }));
dit('sans prix fige ni piece, le reste est inconnu : la porte s ouvre, le Trone preparera la piece', ['ouverte', null],
  [porte({ priceXof: undefined }, A_10H), resteConnuDeLaFin(rdv({ priceXof: undefined }))]);
dit('une heure illisible ne s ouvre pas', 'avant-l-heure', porte({ time: '' }, A_10H));
dit('un rendez-vous introuvable', 'introuvable', porteDeLaFin({ rdv: null, maintenantMs: A_10H }).raison);

/* ── 3. Le reste connu : prix fige, moins l'argent, moins l'acompte RECONNU ── */
dit('l acompte reconnu se deduit, l acompte seulement demande non', [7000, 12000],
  [resteConnuDeLaFin(rdv({ depositXof: 5000, depositConfirmed: true })), resteConnuDeLaFin(rdv({ depositXof: 5000 }))]);
dit('le journal des versements fait foi sur paidXof ; la remise du rendez-vous se retranche (pourcentage puis francs)', [3000, 9800],
  [argentRecuDeLaFin({ payments: [{ amountXof: 1000 }, { amountXof: 2000 }], paidXof: 99 }), prixFigeDeLaFin({ priceXof: 12000, discountPct: 10, discountXof: 1000 })]);
const ECHANTILLONS = [
  { priceXof: 12000 }, { priceXof: 12000, discountPct: 15 }, { priceXof: 40000, discountXof: 6000 }, { priceXof: 12000, seriesIndex: 2 },
  { priceXof: 12000, forfait: { totalXof: 60000 } }, {}, { priceXof: 0 }, { priceXof: 9999, discountPct: 33, discountXof: 12 },
];
dit('le prix fige se lit comme a la cloture de Grenat (prixFigeLu), cas par cas', ECHANTILLONS.map((e) => prixFigeLu(e) ?? null), ECHANTILLONS.map((e) => prixFigeDeLaFin(e) ?? null));

/* ── 4. La piece : les calculs de regler-la-seance-pur, cote a cote ─────── */
const PIECES: (PieceDeLaFin & PieceLue)[] = [
  { id: 'p1', apptId: 'rdv-1', date: '2026-11-06', status: 'envoyée', lines: [{ qty: 1, unitXof: 12000, discountPct: 0 }] },
  { id: 'p2', apptId: 'rdv-1', date: '2026-11-06', status: 'payée', lines: [{ qty: 1, unitXof: 12000, discountPct: 0 }] },
  { id: 'p3', apptId: 'rdv-1', date: '2026-11-05', status: 'envoyée', lines: [{ qty: 2, unitXof: 7000, discountPct: 10, discountXof: 600 }], globalDiscountPct: 5, globalDiscountXof: 300, payments: [{ id: 'v', amountXof: 4000 }] as never },
  { id: 'p4', apptId: 'rdv-1', date: '2026-11-07', status: 'annulée', lines: [{ qty: 1, unitXof: 5000 }] },
  { id: 'p5', apptId: 'rdv-2', date: '2026-11-06', kind: 'devis', status: 'envoyée', lines: [{ qty: 1, unitXof: 5000 }] },
];
dit('le reste d une piece se lit comme sur la page « Regler » (resteDeLaPiece), piece par piece', PIECES.map((p) => resteDeLaPiece(p)), PIECES.map((p) => resteDeLaPieceDeLaFin(p)));
dit('la piece du rendez-vous est la meme que celle de la page « Regler » : celle qui doit encore, jamais une annulee ni un devis',
  [laPieceDuRdv(PIECES, 'rdv-1')?.id, 'p1', null], [pieceDuRdvDeLaFin(PIECES, 'rdv-1')?.id, pieceDuRdvDeLaFin(PIECES, 'rdv-1')?.id, pieceDuRdvDeLaFin(PIECES, 'rdv-2')]);

/* ── 5. Le code et les quatre chiffres ─────────────────────────────────── */
dit('le code se lit comme elle le tape : minuscules, espace, tiret, ou les quatre signes seuls', ['MND-7K3Q', 'MND-7K3Q', 'MND-7K3Q', 'MND-7K3Q', 'MND-MNDK'],
  [codeLu('MND-7K3Q'), codeLu('mnd 7k3q'), codeLu(' 7k3q '), codeLu('Mnd7K3q'), codeLu('mnd-mndk')]);
dit('ce qui n est pas un code : trop court, trop long, un signe hors de l alphabet (0, O, 1, I)', [null, null, null, null, null],
  [codeLu('7K3'), codeLu('MND-7K3QX'), codeLu('MND-7K0Q'), codeLu('MND-7KIQ'), codeLu('')]);
dit('l alphabet du code est celui de la reference du rendez-vous', ALPHABET_DE_LA_REFERENCE, SIGNES_DU_CODE_DE_LA_FIN);
dit('quatre chiffres, ni plus ni moins ; la fin d un vrai numero seulement', ['4480', null, null, '4480', ''],
  [quatreChiffresLus('44 80'), quatreChiffresLus('448'), quatreChiffresLus('44801'), finDuNumero('+229 01 97 12 44 80'), finDuNumero('4480')]);
dit('la recherche est bornee : d hier a cent jours', { du: '2026-11-05', au: '2027-02-14' }, fenetreDeLaRecherche(A_10H));

type Tete = { id: string; date: string; time: string; status: string; numeros: string[] };
const tetes: Tete[] = [
  { id: 'rdv-aaa', date: JOUR, time: '08:00', status: 'confirmé', numeros: ['+229 01 97 12 44 80'] },
  { id: 'rdv-bbb', date: JOUR, time: '11:00', status: 'confirmé', numeros: ['+229 01 55 00 12 34', '+33 6 11 22 33 44'] },
  { id: 'rdv-loin', date: '2027-03-01', time: '09:00', status: 'confirmé', numeros: ['+229 01 97 12 44 80'] },
  { id: 'rdv-vieux', date: '2026-11-04', time: '09:00', status: 'confirmé', numeros: ['+229 01 97 12 44 80'] },
  { id: 'rdv-hier', date: '2026-11-05', time: '09:00', status: 'honoré', numeros: ['+229 01 97 12 99 99'] },
];
const cherche = (code: unknown, chiffres: unknown, liste: Tete[] = tetes, referenceDe = referenceDuRendezVous) =>
  retrouveLeRdv({ code, chiffres, rdvs: liste, referenceDe, numerosDe: (r) => r.numeros, maintenantMs: A_10H })?.id ?? null;
const codeDe = referenceDuRendezVous;
dit('le bon code ET les bons chiffres retrouvent le rendez-vous', 'rdv-aaa', cherche(codeDe('rdv-aaa'), '4480'));
dit('le code seul n ouvre rien : sans chiffres, avec des chiffres faux, avec les chiffres d une autre', [null, null, null],
  [cherche(codeDe('rdv-aaa'), ''), cherche(codeDe('rdv-aaa'), '4481'), cherche(codeDe('rdv-aaa'), '1234')]);
dit('les chiffres seuls n ouvrent rien : sans code, avec le code d une autre', [null, null], [cherche('', '4480'), cherche(codeDe('rdv-bbb'), '4480')]);
dit('un code inconnu et des chiffres faux rendent la meme chose : rien', [null, null], [cherche('MND-ZZZZ', '4480'), cherche(codeDe('rdv-aaa'), '0000')]);
dit('le second numero de la fiche (le parent qui a pris le rendez-vous) vaut aussi', 'rdv-bbb', cherche(codeDe('rdv-bbb'), '3344'));
dit('hors des rendez-vous proches, rien : dans quatre mois, il y a deux jours ; hier se retrouve encore', [null, null, 'rdv-hier'],
  [cherche(codeDe('rdv-loin'), '4480'), cherche(codeDe('rdv-vieux'), '4480'), cherche(codeDe('rdv-hier'), '9999')]);
const jumeaux: Tete[] = [
  { id: 'j-annule', date: JOUR, time: '10:00', status: 'annulé', numeros: ['+229 01 00 00 77 77'] },
  { id: 'j-decembre', date: '2026-12-11', time: '08:00', status: 'confirmé', numeros: ['+229 01 00 00 77 77'] },
  { id: 'j-jour', date: JOUR, time: '15:00', status: 'confirmé', numeros: ['+229 01 00 00 77 77'] },
];
dit('deux rendez-vous sous le meme code (il n est pas unique) : le plus proche de maintenant, un vivant avant un annule', 'j-jour',
  cherche('MND-AAAA', '7777', jumeaux, () => 'MND-AAAA'));

/* ── 6. Le frein aux essais repetes ────────────────────────────────────── */
dit('le frein : dix recherches par adresse en dix minutes, cinq echecs par code dans l heure, douze dans la journee',
  [{ parAdresse: 10, minutesDeLAdresse: 10, echecsParHeure: 5, echecsParJour: 12 }, 'libre', 'adresse', 'code', 'code', 'libre'],
  [FREIN_DE_LA_RECHERCHE,
    freinDeLaRecherche({ essaisDeLAdresse: 9, echecsDuCodeDansLHeure: 4, echecsDuCodeDuJour: 11 }),
    freinDeLaRecherche({ essaisDeLAdresse: 10, echecsDuCodeDansLHeure: 0, echecsDuCodeDuJour: 0 }),
    freinDeLaRecherche({ essaisDeLAdresse: 0, echecsDuCodeDansLHeure: 5, echecsDuCodeDuJour: 5 }),
    freinDeLaRecherche({ essaisDeLAdresse: 0, echecsDuCodeDansLHeure: 0, echecsDuCodeDuJour: 12 }),
    freinDeLaRecherche({ essaisDeLAdresse: 0, echecsDuCodeDansLHeure: 0, echecsDuCodeDuJour: 0 })]);

/* ── 7. Le billet ──────────────────────────────────────────────────────── */
const billet = (plus: Partial<RdvDeLaFin>, quand: number, piece?: number) =>
  billetDeLaFin({ rdv: rdv(plus), reference: 'MND-7K3Q', prenom: 'Awa Kossou', maintenantMs: quand, piece: piece === undefined ? null : { resteXof: piece } });
dit('le billet ne dit d elle que son prenom', 'Awa', billet({}, A_10H).prenom);
dit('la veille : confirme, a regler 12 000, porte fermee ; le jour a l heure : en cours, porte ouverte',
  [['confirme', 12000, false], ['en-cours', 12000, true]],
  [[billet({}, aCotonou('2026-11-05', '18:00')).etat, billet({}, aCotonou('2026-11-05', '18:00')).resteXof, billet({}, aCotonou('2026-11-05', '18:00')).porte.ouverte],
    [billet({}, A_10H).etat, billet({}, A_10H).resteXof, billet({}, A_10H).porte.ouverte]]);
dit('elle a termine : « termine », la porte reste ouverte tant qu elle n a pas regle ; reglee : « regle », reste zero',
  [['termine', true, true], ['regle', 0, false]],
  [[billet({ termineParElle: { le: '2026-11-06T09:02:00.000Z', par: 'site' } }, A_10H, 12000).etat, billet({ termineParElle: { le: '2026-11-06T09:02:00.000Z', par: 'site' } }, A_10H, 12000).aTermine, billet({ termineParElle: { le: '2026-11-06T09:02:00.000Z', par: 'site' } }, A_10H, 12000).porte.ouverte],
    [billet({ status: 'honoré', termineParElle: { le: '2026-11-06T09:02:00.000Z', par: 'site' } }, A_10H, 0).etat, billet({ status: 'honoré' }, A_10H, 0).resteXof, billet({ status: 'honoré' }, A_10H, 0).porte.ouverte]]);
/* UN RENDEZ-VOUS A VENIR PAYE D'AVANCE (relecture du 6 novembre 2026) : il passait « regle », et la
   page /rdv/ lui disait « vous pouvez partir » en lui retirant Deplacer, Annuler et l'agenda. */
const PAYE_D_AVANCE = { time: '08:00', payments: [{ amountXof: 12000 }] };
const duBillet = (quand: number) => { const b = billet(PAYE_D_AVANCE, quand); return [b.etat, b.porte.raison, b.resteXof]; };
dit('paye d avance : la veille et le matin avant l heure, le billet reste « confirme » (deja regle, reste zero) ; « regle » une fois le rituel commence, et le lendemain',
  [['confirme', 'deja-regle', 0], ['confirme', 'deja-regle', 0], ['regle', 'deja-regle', 0], ['regle', 'deja-regle', 0]],
  [duBillet(aCotonou('2026-11-05', '18:00')), duBillet(aCotonou(JOUR, '07:59')), duBillet(aCotonou(JOUR, '08:00')), duBillet(aCotonou('2026-11-07', '09:00'))]);
dit('annule : annule, aucun montant ; sans prix fige ni piece : le montant ne se devine pas', [['annule', null], null],
  [[billet({ status: 'annulé' }, A_10H).etat, billet({ status: 'annulé' }, A_10H).resteXof], billet({ priceXof: undefined }, A_10H).resteXof]);

/* ── 8. Le lien : celui du reglement qui existe ────────────────────────── */
const ALEAS = [5, 9, 11, 13, 17, 19, 3, 40, 7, 100, 0, 30, 31, 62];
dit('le jeton est celui de la page « Regler » : meme alphabet, meme longueur, meme tirage, et elle le reconnait',
  [ALPHABET_DU_JETON, LONGUEUR_DU_JETON, jetonDe(ALEAS), true, true],
  [SIGNES_DU_JETON_DE_LA_FIN, LONGUEUR_DU_JETON_DE_LA_FIN, jetonDeLaFin(ALEAS), estUnJeton(jetonDeLaFin(ALEAS)), estUnJetonDeLaFin(jetonDe(ALEAS))]);
dit('l adresse du reglement est payer.html?tg=r-<jeton>, comme le bouton « Regler » du message', `${LIEN_TAPGO}${parametreDuLien(jetonDe(ALEAS))}`, adresseDuReglementDeLaFin(jetonDe(ALEAS)));
const J1 = jetonDe(ALEAS); const J2 = jetonDe([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
dit('un rendez-vous : son jeton est garde s il existe, tire sinon', [{ genre: 'seul', jeton: J2, neuf: false, apptIds: ['a'] }, { genre: 'seul', jeton: J1, neuf: true, apptIds: ['a'] }],
  [lienDeLaFin({ rdvs: [{ id: 'a', lienDeReglement: { jeton: J2 } }], aleas: ALEAS }), lienDeLaFin({ rdvs: [{ id: 'a', lienDeReglement: { jeton: 'abc' } }], aleas: ALEAS })]);
dit('un foyer : un seul lien pour tous, garde si la liste est la meme, neuf si elle change ; jamais de lien pour personne',
  [{ genre: 'foyer', jeton: J1, neuf: true, apptIds: ['a', 'b'] }, { genre: 'foyer', jeton: J2, neuf: false, apptIds: ['a', 'b'] }, { genre: 'foyer', jeton: J1, neuf: true, apptIds: ['a', 'b'] }, null],
  [lienDeLaFin({ rdvs: [{ id: 'b' }, { id: 'a' }], aleas: ALEAS }),
    lienDeLaFin({ rdvs: [{ id: 'a', lienDuFoyer: { jeton: J2, apptIds: ['b', 'a'] } }, { id: 'b', lienDuFoyer: { jeton: J2, apptIds: ['a', 'b'] } }], aleas: ALEAS }),
    lienDeLaFin({ rdvs: [{ id: 'a', lienDuFoyer: { jeton: J2, apptIds: ['a', 'b', 'c'] } }, { id: 'b', lienDuFoyer: { jeton: J2, apptIds: ['a', 'b', 'c'] } }], aleas: ALEAS }),
    lienDeLaFin({ rdvs: [], aleas: ALEAS })]);

/* ── 9. Honore QUAND ELLE A REGLE ──────────────────────────────────────── */
const declare = { le: '2026-11-06T09:02:00.000Z', par: 'couronne' as const };
const honneur = (r: Parameters<typeof honneurAuReglement>[0]['rdv'], reste: number, quand = A_10H) => !!honneurAuReglement({ rdv: r, resteXof: reste, maintenantMs: quand });
dit('elle a declare, tout est regle, le jour meme : le rendez-vous passe honore, a l instant du reglement', { le: new Date(A_10H).toISOString() },
  honneurAuReglement({ rdv: { status: 'confirmé', date: JOUR, termineParElle: declare }, resteXof: 0, maintenantMs: A_10H }));
dit('pas a sa declaration : tant qu il reste un franc, rien', [false, false], [honneur({ status: 'confirmé', date: JOUR, termineParElle: declare }, 12000), honneur({ status: 'confirmé', date: JOUR, termineParElle: declare }, 1)]);
dit('sans declaration, le chemin d avant ne bouge pas : un reglement n honore rien', false, honneur({ status: 'confirmé', date: JOUR }, 0));
dit('jamais un rituel a venir, un annule, un deja honore, ni sur un reste illisible', [false, false, false, false],
  [honneur({ status: 'confirmé', date: '2026-11-07', termineParElle: declare }, 0), honneur({ status: 'annulé', date: JOUR, termineParElle: declare }, 0),
    honneur({ status: 'honoré', date: JOUR, termineParElle: declare }, 0), honneur({ status: 'confirmé', date: JOUR, termineParElle: declare }, Number.NaN)]);
dit('une declaration tient si elle date du jour du rituel, a partir de son heure', [true, false, false, false],
  [finValable(rdv({ termineParElle: { le: new Date(aCotonou(JOUR, '08:05')).toISOString(), par: 'site' } })),
    finValable(rdv({ termineParElle: { le: new Date(aCotonou(JOUR, '07:00')).toISOString(), par: 'site' } })),
    finValable(rdv({ termineParElle: { le: new Date(aCotonou('2026-11-07', '00:10')).toISOString(), par: 'site' } })),
    finValable(rdv({ status: 'annulé', termineParElle: { le: new Date(aCotonou(JOUR, '08:05')).toISOString(), par: 'site' } }))]);

/* ── 10. L'equipe est prevenue des sa declaration ──────────────────────── */
dit('la notification du personnel : le prenom, l heure, la porte, le reste ; aucun pronom',
  { titre: 'Awa a terminé son rituel', corps: 'Rendez-vous de 8 h. Règlement en cours depuis son téléphone, par Ma Couronne. Reste 12 000 F. Un poste du Trône ouvert prépare sa pièce.', url: '/trone/#/carnet' },
  notificationDeLaFin({ prenoms: ['Awa'], heure: '08:00', porte: 'couronne', resteXof: 12000 }));
dit('... un foyer se dit au pluriel, et un reste inconnu ne se dit pas',
  { titre: 'Koffi et Sena ont terminé leur rituel', corps: 'Rendez-vous de 14 h 30. Règlement en cours depuis son téléphone, par WhatsApp. Un poste du Trône ouvert prépare sa pièce.', url: '/trone/#/carnet' },
  notificationDeLaFin({ prenoms: ['Koffi', 'Sena', 'Koffi'], heure: '14:30', porte: 'whatsapp', resteXof: null }));

/* ── 11. « J'ai termine », en phrase libre : le message ENTIER, et rien d'autre ──
   Relecture du 6 novembre 2026 : la premiere regle cherchait « j'ai fini »
   quelque part dans la phrase, et une cliente en retard (« J'ai fini mon
   travail, j'arrive »), son rendez-vous deja commence, aurait recu un lien de
   reglement. Chaque liste rend les phrases MAL classees : vide, elle tient. */
/* Les treize phrases d'une cliente qui a termine : elles doivent rester reconnues. */
const RECONNUES = [
  'J’ai terminé mon RDV', 'j’ai fini', 'J’ai terminé', 'C’est fini merci', 'terminé', 'rdv terminé', 'Je veux régler', 'je voudrais payer',
  'On a terminé', 'ça y est j’ai fini', 'J’ai fini ma séance, merci', 'j ai termine mon rendez-vous', 'Bonjour, j’ai terminé ma séance',
];
/* Les onze phrases d'une cliente qui dit tout autre chose, que la premiere regle prenait pour une declaration. */
const AUTRE_CHOSE = [
  'J’ai fini mon travail, j’arrive', 'j’ai terminé le boulot je suis en route', 'J’ai fini de manger j’arrive dans 10 min', 'On a fini la réunion, je me mets en route',
  'c’est fini la pluie, je viens', 'j’ai fini mes courses', 'J’ai terminé mes locks à la maison', 'j’ai fini ?', 'Bonjour j’ai fini le shampoing que vous m’avez vendu',
  'J’ai fini à la banque, j’arrive', 'nous avons terminé le déménagement',
];
dit('les treize phrases d une cliente qui a termine sont reconnues', [], RECONNUES.filter((p) => !ditQuElleATermine(p)));
dit('les onze phrases d une cliente qui dit autre chose (un retard, un trajet, ses courses) ne sont JAMAIS une declaration', [], AUTRE_CHOSE.filter(ditQuElleATermine));
const AUSSI = [
  'J\'AI FINI', 'jai fini', 'J’ai terminé !', 'c’est fini', 'C\'est terminé, merci', 'Nous avons terminé', 'fini', 'Séance terminée', 'ma séance est terminée',
  'Je souhaite régler ma séance', 'Je veux payer ma séance d’aujourd’hui', 'je veux régler mon rendez-vous',
  'le lien de paiement svp', 'J’ai terminé ma coiffure', 'On a fini notre soin', 'ça y est terminé',
  'Coucou, c’est terminé, merci beaucoup, bonne journée', 'Bonsoir Madame, j’ai fini, à bientôt',
  /* Deux formes a la suite restent une declaration. */
  'J’ai terminé, je veux régler', 'Bonjour, j’ai terminé mon rendez-vous, je voudrais régler s’il vous plaît',
  /* Son code de confirmation, ecrit avec sa declaration, ne la change pas. */
  'J’ai fini MND-7K3Q',
];
dit('... la casse, les accents, la ponctuation, les saluts et la politesse ne comptent pas ; deux formes a la suite et son code ecrit avec restent une declaration', [], AUSSI.filter((p) => !ditQuElleATermine(p)));
/* Elargi a la seconde relecture, toujours le message ENTIER : « mes », « d'aujourd'hui » apres ce
   qu'elle a fini, un mot de liaison en tete, l'adresse a la Maison, « je viens de terminer ». */
const ELARGIES = [
  'J’ai fini mes soins', 'j’ai terminé mes locks', 'J’ai terminé mon rendez-vous d’aujourd’hui', 'on a fini la séance d’aujourd’hui',
  'Voilà, j’ai terminé', 'Oui j’ai fini', 'Ok terminé', 'c’est bon j’ai fini', 'Bien, j’ai terminé', 'Oui, c’est bon, c’est fini',
  'Bonjour Maison MND, j’ai terminé', 'Bonsoir la Maison MND, c’est terminé, merci',
  'Je viens de terminer', 'je viens de finir ma séance', 'On vient de terminer', 'Nous venons de finir notre rituel',
];
dit('reconnues aussi : « mes », « d aujourd hui », un mot de liaison en tete, « Maison MND » en adresse, « je viens de terminer »', [], ELARGIES.filter((p) => !ditQuElleATermine(p)));
/* « Je paie », « je vais payer », « je peux payer » tout nus repondent aussi bien a une relance ou a une question : jamais une declaration. */
const NUES = ['Je vais payer', 'Je paie', 'Je peux payer', 'je paye', 'je règle', 'je peux régler', 'je vais régler', 'Bonjour, je vais payer, merci'];
dit('les formes nues « je paie / je vais payer / je peux payer / je regle » ne sont plus une declaration ; suivies de ce qu elle regle, elles le restent', [[], [true, true, true]],
  [NUES.filter(ditQuElleATermine), [ditQuElleATermine('je paie ma séance'), ditQuElleATermine('Je vais payer mon rendez-vous d’aujourd’hui'), ditQuElleATermine('je peux régler mon rituel')]]);
dit('... le complement vient d une liste fermee (la reprise, nos locks, ma tete, mes soins) ; « le shampoing » n y est plus (un flacon vide), ni rien hors de la liste', [true, true, true, true, false, false, false],
  [ditQuElleATermine('on a terminé la reprise'), ditQuElleATermine('nous avons fini nos locks'), ditQuElleATermine('j’ai fini ma tête'), ditQuElleATermine('J’ai fini mes soins'),
    ditQuElleATermine('j’ai fini le shampoing'), ditQuElleATermine('j’ai fini mon travail'), ditQuElleATermine('j’ai fini mes courses')]);
/* ELLE NOMME SON RENDEZ-VOUS, OU NON : sans rendez-vous du jour a son numero, la Maison ne demande le code qu'a celle qui le nomme. */
dit('elle nomme son rendez-vous : le rendez-vous, la seance, le rituel, le lien de paiement, son code', [],
  ['J’ai terminé mon RDV', 'rdv terminé', 'J’ai fini ma séance, merci', 'j ai termine mon rendez-vous', 'mon rituel est terminé', 'le lien de paiement svp', 'J’ai fini MND-7K3Q'].filter((p) => !nommeSonRendezVous(p)));
dit('... « c est fini », « fini », « j ai fini », « je veux regler », « on a termine », « j ai termine ma coiffure » ne le nomment pas', [],
  ['C’est fini', 'Fini', 'J’ai fini', 'Je veux régler', 'terminé', 'On a terminé', 'J’ai terminé ma coiffure', 'Bonjour Maison MND, j’ai terminé'].filter(nommeSonRendezVous));
/* SUR WHATSAPP, LES VINGT PREMIERES MINUTES : le rituel commence a peine. */
const a8h = aCotonou(JOUR, '08:00');
dit('a peine commence : de l heure du rendez-vous a vingt minutes apres (exclu) ; ni avant l heure, ni sans heure lisible', [1200000, true, true, false, false, false],
  [ATTENTE_DE_LA_PORTE_WHATSAPP_MS, aPeineCommence({ date: JOUR, time: '08:00' }, a8h), aPeineCommence({ date: JOUR, time: '08:00' }, a8h + 20 * 60_000 - 1),
    aPeineCommence({ date: JOUR, time: '08:00' }, a8h + 20 * 60_000), aPeineCommence({ date: JOUR, time: '08:00' }, a8h - 1), aPeineCommence({ date: JOUR, time: '' }, a8h)]);
const JAMAIS = [
  'Je n’ai pas terminé', 'J’ai pas fini', 'c’est pas terminé', 'pas encore fini', 'Quand est-ce que ce sera terminé ?', 'j’ai presque fini', 'Bonjour', 'Merci', 'Bonjour, merci beaucoup', 'Je veux réserver',
  'Je veux régler mon abonnement', 'je voudrais payer ma commande', 'Comment régler ?', 'Combien je dois ?', 'Est-ce que je peux régler en ligne ?',
  'J’ai terminé le travail hier', 'si j’ai fini avant 15 h je passe', 'Je veux payer un acompte', 'J’ai terminé, j’arrive', 'Le travail, c’est fini',
  'Bonjour, j’ai terminé ma journée de travail un peu tard et je me demandais si vous aviez encore une place pour moi ce soir',
  'Bonjour à toute l’équipe de la Maison, j’ai terminé mon rendez-vous de ce matin avec vous, merci beaucoup pour tout',
  '', 'j’ai faim', 'Pas fini',
];
dit('une negation, une question, un autre achat, un mot de plus, la politesse seule : ce n est pas une declaration', [], JAMAIS.filter(ditQuElleATermine));
/* Dans le doute, pas une declaration : ces phrases-la restent a la conversation ordinaire. */
const DANS_LE_DOUTE = [
  'envoyez-moi le lien de paiement', 'J ai bien fini', 'C’est terminé pour moi', 'J’ai terminé, je peux payer ?', 'j’ai fini, mon code est MND-7K3Q',
  /* Un mot de liaison seul, ou ailleurs qu'en tete ; l'adresse a la Maison seule. */
  'c’est bon', 'Oui', 'Ok, bien', 'j’ai terminé oui', 'Maison MND', 'Bonjour Maison MND', 'j’ai fini ce soin',
  /* « Je viens de terminer » autre chose, ou en route. */
  'Je viens de terminer le travail', 'je viens de finir mon travail, j’arrive', 'je viens de finir, je viens',
  /* Elle le dit DE la Maison : un lieu, pas une adresse. */
  'J’ai terminé à la Maison MND',
];
dit('dans le doute, pas une declaration : un adverbe, un mot de liaison seul ou ailleurs qu en tete, une tournure hors des formes', [], DANS_LE_DOUTE.filter(ditQuElleATermine));
dit('un point d interrogation dans son texte n est jamais une declaration', [false, false, false, true],
  [ditQuElleATermine('j’ai fini ?'), ditQuElleATermine('Terminé ?'), ditQuElleATermine('je veux régler ?'), ditQuElleATermine('je veux régler')]);
const TRAJETS = ['j’arrive', 'je vais arriver', 'je suis en route', 'sur le chemin', 'je viens', 'je vais venir', 'j’ai du retard', 'bientôt là', 'dans 10 minutes', 'attends-moi', 'je suis à la maison', 'chez moi', 'je suis à la Maison MND'];
dit('un mot de mouvement ou d attente, « a la maison », « chez moi » : elle parle d autre chose', [], TRAJETS.filter((p) => !ditAutreChoseQueLaFin(p)));
dit('... « a bientot » est une politesse, pas une attente ; une declaration n est pas un trajet, « je viens de terminer » non plus', [false, false, false],
  [ditAutreChoseQueLaFin('J’ai terminé, à bientôt'), ditAutreChoseQueLaFin('j’ai terminé mon rdv'), ditAutreChoseQueLaFin('Je viens de terminer')]);
dit('... et la regle interroge ce garde, puis exige le message entier (l adresse a la Maison retiree apres le garde)', true,
  /if \(MOUVEMENT_OU_ATTENTE_DE_LA_FIN\.test\(t\)\) return false;\s*return UNE_DECLARATION_DE_FIN\.test\(t\.replace\(ADRESSE_A_LA_MAISON_DE_LA_FIN, ' '\)\.replace\(\/ \+\/g, ' '\)\.trim\(\)\);/.test(lis('src/shared/terminer-et-regler-pur.ts')));
dit('un code de confirmation se lit dans un message ; un mot apres « MND » n en est pas un', ['MND-7K3Q', 'MND-7K3Q', 'MND-UVGM', null, null, null],
  [codeDansLeMessage('mon code : mnd 7k3q'), codeDansLeMessage('MND-7K3Q'), codeDansLeMessage('c est mnd-uvgm'), codeDansLeMessage('Bonjour MND'), codeDansLeMessage('MND-7K0Q'),
    codeDansLeMessage('je suis à la Maison MND dans dix minutes')]);

/* ── 12. Les mots de la Maison sur WhatsApp ────────────────────────────── */
const ADRESSE = adresseDuReglementDeLaFin(J1);
dit('avec le montant : merci, le rituel, le montant, le lien, l equipe prevenue',
  `Merci Mme Awa, c'est noté. Votre rituel d'aujourd'hui : La Reprise, 12 000 F. Réglez depuis votre téléphone, en un toucher :\n${ADRESSE}\nL'équipe est prévenue.`,
  motDeLaMaisonALaFin({ appel: 'Mme Awa', etat: 'a-regler', resteXof: 12000, adresse: ADRESSE, rituel: 'La Reprise' }));
dit('sans montant connu : il l attend sur la page, jamais un chiffre invente',
  `Merci Awa, c'est noté. Votre montant se prépare à la Maison : il vous attend sur la page. Réglez depuis votre téléphone, en un toucher :\n${ADRESSE}\nL'équipe est prévenue.`,
  motDeLaMaisonALaFin({ appel: 'Awa', etat: 'a-regler', resteXof: null, adresse: ADRESSE }));
dit('deja regle : la Maison le dit, sans lien', `Awa, votre rituel d'aujourd'hui est déjà réglé. Merci, et à très bientôt à la Maison MND.`, motDeLaMaisonALaFin({ appel: 'Awa', etat: 'deja-regle' }));
dit('trop tot : l heure du rituel, sans lien', `Awa, votre rituel est prévu aujourd'hui à 14 h 30. Quand l'équipe aura fini, écrivez-nous « J'ai terminé » : votre lien de règlement arrivera aussitôt.`,
  motDeLaMaisonALaFin({ appel: 'Awa', etat: 'avant-l-heure', heure: '14:30' }));
dit('passe au comptoir : le comptoir, sans lien', `Merci, c'est noté. Pour votre règlement, l'équipe vous attend au comptoir.`, motDeLaMaisonALaFin({ etat: 'comptoir' }));
const sansRdv = motDeLaMaisonALaFin({ etat: 'sans-rdv' });
dit('sans rendez-vous du jour a ce numero : la Maison demande le code et ses quatre chiffres, et AUCUN lien de reglement ne part',
  [true, true, false, true],
  [sansRdv.includes('code de confirmation'), sansRdv.includes(PAGE_POUR_RETROUVER_SON_RDV), /payer\.html|tg=r-/.test(sansRdv), motDeLaMaisonALaFin({ etat: 'sans-rdv', code: 'MND-7K3Q' }).includes(`${PAGE_POUR_RETROUVER_SON_RDV}?code=MND-7K3Q`)]);
const TOUS_LES_MOTS = [
  motDeLaMaisonALaFin({ appel: 'Awa', etat: 'a-regler', resteXof: 12000, adresse: ADRESSE, rituel: 'La Reprise' }), motDeLaMaisonALaFin({ etat: 'a-regler', resteXof: null, adresse: ADRESSE }),
  motDeLaMaisonALaFin({ etat: 'deja-regle' }), motDeLaMaisonALaFin({ etat: 'rien-a-regler' }), motDeLaMaisonALaFin({ etat: 'clos' }), motDeLaMaisonALaFin({ etat: 'comptoir' }),
  motDeLaMaisonALaFin({ etat: 'avant-l-heure' }), sansRdv,
];
dit('la voix de la Maison : vous, ni tiret long, ni « salon », ni numero de piece, ni « maitre » ; seuls les liens de reglement portent un lien de reglement',
  [false, false, false, false, [true, true, false, false, false, false, false, false]],
  [TOUS_LES_MOTS.some((m) => /—|–/.test(m)), TOUS_LES_MOTS.some((m) => /salon/i.test(m)), TOUS_LES_MOTS.some((m) => /\b(F|MND)-\d{4}-\d+/.test(m)), TOUS_LES_MOTS.some((m) => /ma[iî]tre/i.test(m) || /\b(tu|ton|ta|tes)\b/i.test(m)),
    TOUS_LES_MOTS.map((m) => m.includes('payer.html?tg=r-'))]);

/* ── 13. Au Trone et dans Ma Couronne ──────────────────────────────────── */
dit('le Carnet : rien sans declaration ; « A termine · reglement en cours » ; puis « Reglee en ligne · Depart sans caisse »',
  [null, 'A terminé · règlement en cours', 'Réglée en ligne · Départ sans caisse', 'Réglée en ligne · Départ sans caisse', null],
  [marqueDeLaFinAuCarnet({ status: 'confirmé' }, 12000), marqueDeLaFinAuCarnet({ status: 'confirmé', termineParElle: declare }, 12000)?.dit,
    marqueDeLaFinAuCarnet({ status: 'honoré', termineParElle: declare, honoreAuReglement: { le: 'x' } }, 0)?.dit, marqueDeLaFinAuCarnet({ status: 'confirmé', termineParElle: declare }, 0)?.dit,
    marqueDeLaFinAuCarnet({ status: 'annulé', termineParElle: declare }, 12000)]);
const valable = { le: new Date(aCotonou(JOUR, '09:30')).toISOString(), par: 'couronne' as const };
dit('la piece a preparer au Trone : une declaration qui tient, un rendez-vous confirme, pas encore de piece', [true, false, false, false, false],
  [pieceAPreparer(rdv({ termineParElle: valable }), false), pieceAPreparer(rdv({ termineParElle: valable }), true), pieceAPreparer(rdv({}), false),
    pieceAPreparer(rdv({ status: 'honoré', termineParElle: valable }), false), pieceAPreparer(rdv({ termineParElle: { le: new Date(aCotonou(JOUR, '06:00')).toISOString(), par: 'couronne' } }), false)]);
dit('les suites d un honneur pose au reglement : une fois, tant que personne ne les a reservees', [true, false, false, false],
  [suitesAFaire({ status: 'honoré', honoreAuReglement: { le: 'x' } }), suitesAFaire({ status: 'honoré', honoreAuReglement: { le: 'x', suitesLe: 'y' } }),
    suitesAFaire({ status: 'honoré', pointsAwarded: true, honoreAuReglement: { le: 'x' } }), suitesAFaire({ status: 'honoré' })]);
const carte = (liste: RdvDeLaFin[], quand: number, o: { comptoir?: boolean; reste?: number | null } = {}) => {
  const c = carteDuRituelEnCours({ rdvs: liste, maintenantMs: quand, passeAuComptoir: o.comptoir, resteDeLaPiece: () => o.reste ?? null });
  return c ? [c.rdv.id, c.etat] : null;
};
dit('la carte de Ma Couronne : rien avant l heure, « en cours » a l heure, rien le lendemain, rien si « Passe au comptoir »', [null, ['rdv-1', 'en-cours'], null, null],
  [carte([rdv()], aCotonou(JOUR, '07:30')), carte([rdv()], A_10H), carte([rdv()], aCotonou('2026-11-07', '09:00')), carte([rdv()], A_10H, { comptoir: true })]);
dit('... deux rituels le meme jour : celui qui a commence, jamais celui de l apres-midi avant son heure ; jamais celui d un autre jour', [['rdv-1', 'en-cours'], null],
  [carte([rdv({ id: 'rdv-15h', time: '15:00' }), rdv()], A_10H), carte([rdv({ date: '2026-11-05', termineParElle: valable })], A_10H, { reste: 12000 })]);
dit('... « termine » quand elle a declare, « regle » quand elle a paye (vous pouvez partir), jamais un annule', [['rdv-1', 'termine'], ['rdv-1', 'regle'], null],
  [carte([rdv({ termineParElle: valable })], A_10H, { reste: 12000 }), carte([rdv({ status: 'honoré', termineParElle: valable, honoreAuReglement: { le: 'x' } })], A_10H, { reste: 0 }),
    carte([rdv({ status: 'annulé' })], A_10H)]);

/* ── 14. Les copies : chaque bloc entre ses reperes ────────────────────── */
const pur = lis('src/shared/terminer-et-regler-pur.ts');
dit('le fichier pur porte ses trois blocs, chacun entre ses reperes, et n importe rien', [true, true, true, false],
  [pur.includes('/* ⟨honneur-au-reglement⟩ */\n') && pur.includes('\n/* ⟨/honneur-au-reglement⟩ */'), pur.includes('/* ⟨terminer-et-regler⟩ */\n') && pur.includes('\n/* ⟨/terminer-et-regler⟩ */'),
    pur.includes('/* ⟨j-ai-termine⟩ */\n') && pur.includes('\n/* ⟨/j-ai-termine⟩ */'), /^import /m.test(pur)]);

dit('chaque fonction porte la copie EXACTE de ses blocs (terminer-copie-serveur les reecrit)', [], ecartsDesCopies(process.cwd()));

/* ══ 15. LE SERVEUR, REJOUE : les VRAIES fonctions terminer-et-regler et
   regler-la-seance, contre une base, un KkiaPay, une notification et une
   horloge simules. Il est 10 h a Cotonou, le vendredi 6 novembre 2026. ═══ */
type Row = { id?: string; branch_id?: string; data?: any; updated_at?: string; [k: string]: any };
const db: Record<string, Row[]> = {};
let tic = 0;
let maintenant = A_10H;
/** Une ecriture du Trone qui passe ENTRE la lecture et l'ecriture du serveur (une seule fois). */
let entreDeux: (() => void) | null = null;
const litCol = (r: Row, col: string): unknown => {
  if (!col.startsWith('data')) return r[col];
  let x: any = r.data;
  for (const p of col.replace(/^data/, '').split(/->>?/).filter(Boolean)) x = x?.[p];
  return x;
};
/** Une panne de la base : une table, un geste (le compte ou l'ecriture), pour l'epreuve du frein illisible. */
let panneDeLaBase: { table: string; geste: 'compte' | 'insert' } | null = null;
/** Le journal des lectures : la table, les colonnes demandees, les lignes rendues. */
const lecturesFaites: { table: string; colonnes: string; lignes: number }[] = [];
/** L'identite des lignes du frein (`id bigint generated always as identity`, 0007). */
let identite = 0;
class Requete {
  filtres: ((r: Row) => boolean)[] = [];
  mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  valeur: any = null; lim = Infinity; seul = false; compte = false; rend = false; plage: [number, number] | null = null; tri = ''; colonnes = '*';
  constructor(public table: string) {}
  select(c?: string, o?: { count?: string; head?: boolean }) { if (this.mode !== 'select') this.rend = true; else this.colonnes = c ?? '*'; if (o?.count) this.compte = true; return this; }
  delete() { this.mode = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filtres.push((r) => String(litCol(r, c) ?? '') === String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((r) => String(litCol(r, c) ?? '') >= String(v)); return this; }
  lte(c: string, v: unknown) { this.filtres.push((r) => String(litCol(r, c) ?? '') <= String(v)); return this; }
  order(c: string) { this.tri = c; return this; }
  range(a: number, b: number) { this.plage = [a, b]; return this; }
  limit(k: number) { this.lim = k; return this; }
  maybeSingle() { this.seul = true; return this; }
  insert(row: Row) { this.mode = 'insert'; this.valeur = row; return this; }
  update(o: any) { this.mode = 'update'; this.valeur = o; return this; }
  then(ok: (x: any) => any, kko?: (e: any) => any) { return Promise.resolve(this.fais()).then(ok, kko); }
  fais(): any {
    const t = (db[this.table] ??= []);
    if (this.mode === 'insert') {
      if (panneDeLaBase?.table === this.table && panneDeLaBase.geste === 'insert') return { data: null, error: { message: 'panne de la base' } };
      const row = { ...structuredClone(this.valeur), at: this.valeur.at ?? new Date(maintenant).toISOString(), updated_at: `t${++tic}` };
      if (row.id === undefined && this.table === 'edge_rate_limits') row.id = ++identite;
      if (row.id && t.some((r) => r.id === row.id)) return { error: { code: '23505', message: 'duplicate key' } };
      t.push(row);
      return { data: this.rend ? [{ id: row.id }] : null, error: null };
    }
    if (this.mode === 'update' && this.table === 'appointments' && entreDeux) { const f = entreDeux; entreDeux = null; f(); }
    const lus = t.filter((r) => this.filtres.every((f) => f(r)));
    if (this.mode === 'delete') {
      for (const r of lus) t.splice(t.indexOf(r), 1);
      return { data: null, error: null };
    }
    if (this.mode === 'update') {
      for (const r of lus) { Object.assign(r, structuredClone(this.valeur)); r.updated_at = `t${++tic}`; }
      return { data: this.rend ? lus.map((r) => ({ id: r.id })) : null, error: null };
    }
    if (this.compte) return panneDeLaBase?.table === this.table && panneDeLaBase.geste === 'compte' ? { count: null, error: { message: 'panne de la base' } } : { count: lus.length, error: null };
    let rendus = this.tri ? [...lus].sort((a, b) => String(litCol(a, this.tri) ?? '').localeCompare(String(litCol(b, this.tri) ?? ''))) : lus;
    if (this.plage) rendus = rendus.slice(this.plage[0], this.plage[1] + 1);
    /* Les colonnes demandees sont les seules rendues quand on ne demande que l'identifiant. */
    const data = structuredClone(rendus.slice(0, this.lim)).map((r) => (this.colonnes === 'id' ? { id: r.id } : r));
    lecturesFaites.push({ table: this.table, colonnes: this.colonnes, lignes: data.length });
    return { data: this.seul ? (data[0] ?? null) : data, error: null };
  }
}
/* Les comptes de Ma Couronne : un jeton en trois morceaux, comme un vrai. */
const COMPTES: Record<string, string> = { 'jeton.de.awa': 'c1', 'jeton.de.sena': 'c2', 'jeton.d.adoptee': 'uid-9' };
const admin = { from: (t: string) => new Requete(t), auth: { getUser: async (j: string) => ({ data: { user: COMPTES[j] ? { id: COMPTES[j] } : null } }) } };
const transactions: Record<string, { status: string; amount: number; fees: number; source: string }> = {};
const notifications: { titre: string; corps: string; url: string; mode: string; cle: string }[] = [];
const fauxFetch = async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
  if (String(url).includes('/functions/v1/push-notify')) {
    const c = JSON.parse(init?.body ?? '{}');
    notifications.push({ titre: c.title, corps: c.body, url: c.url, mode: c.mode, cle: String(init?.headers?.authorization ?? '') });
    return new Response(JSON.stringify({ sent: 3 }), { status: 200 });
  }
  if (String(url).includes('/api/v1/transactions/status')) {
    const tx = transactions[JSON.parse(init?.body ?? '{}').transactionId];
    return tx ? new Response(JSON.stringify(tx), { status: 200 }) : new Response('{}', { status: 404 });
  }
  return new Response('', { status: 404 });
};
const env: Record<string, string> = {
  SUPABASE_URL: 'http://base', SERVICE_KEY: 'cle-de-service', SUPABASE_SERVICE_ROLE_KEY: 'cle-de-la-plateforme',
  KKIAPAY_PUBLIC_KEY: 'pk', KKIAPAY_PRIVATE_KEY: 'pv', KKIAPAY_SECRET_KEY: 'sk',
};
/* L'horloge du serveur : `new Date()` et `Date.now()` disent l'heure du banc. */
const Horloge = class extends Date {
  constructor(...a: any[]) { if (a.length === 0) super(maintenant); else super(...(a as [any])); }
  static now() { return maintenant; }
};
const charge = (fichier: string): ((req: Request) => Promise<Response>) => {
  let handler: ((req: Request) => Promise<Response>) | null = null;
  const module = { exports: {} as Record<string, unknown> };
  new Function('createClient', 'Deno', 'fetch', 'module', 'exports', 'Date', readFileSync(fichier, 'utf8'))(
    () => admin, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } }, fauxFetch, module, module.exports, Horloge,
  );
  return handler!;
};
const finir = charge(process.env.TER_FONCTION as string);
const regler = charge(process.env.REG_FONCTION as string);
const appelle = async (f: typeof finir, corps?: Record<string, unknown>, o: { cle?: string; ip?: string } = {}) => {
  const headers: Record<string, string> = { 'x-forwarded-for': o.ip ?? '1.2.3.4', ...(o.cle ? { Authorization: `Bearer ${o.cle}` } : {}) };
  const r = await f(new Request('http://f/fonction', corps ? { method: 'POST', body: JSON.stringify(corps), headers } : { method: 'GET' }));
  return { status: r.status, corps: await r.json() as any };
};
const rdvDe = (id: string) => db.appointments.find((a) => a.id === id)!.data;
const remplis = () => {
  db.clients = [
    { id: 'c1', branch_id: 'b1', data: { name: 'Awa Kossou', phone: '+229 01 97 12 44 80' } },
    { id: 'c2', branch_id: 'b1', data: { name: 'Sena Dossou', phone: '+229 01 55 00 12 34', passeAuComptoir: true } },
    { id: 'ca', branch_id: 'b1', data: { name: 'Koffi Agbo', phone: '+229 01 60 00 00 01', phoneNom: 'Maman' } },
    { id: 'cb', branch_id: 'b1', data: { name: 'Fifa Agbo', phone: '+229 01 60 00 00 01', phoneNom: 'Maman' } },
    { id: 'fiche-9', branch_id: 'b1', data: { name: 'Mahu Tossou', phone: '+229 01 61 00 00 09', authUserId: 'uid-9' } },
  ];
  const a = (id: string, clientId: string, plus: Record<string, unknown> = {}) =>
    ({ id, branch_id: 'b1', updated_at: `t${++tic}`, data: { id, branchId: 'b1', clientId, clientName: 'X', date: JOUR, time: '08:00', status: 'confirmé', priceXof: 12000, ...plus } });
  db.appointments = [
    a('rdv-jour', 'c1'), a('rdv-demain', 'c1', { date: '2026-11-07', time: '09:00' }), a('rdv-comptoir', 'c2', { time: '08:30' }),
    a('rdv-na', 'ca', { time: '09:00', priceXof: 7000 }), a('rdv-fi', 'cb', { time: '09:30', priceXof: 5000 }),
    a('rdv-annule', 'c1', { status: 'annulé', time: '07:00' }), a('rdv-9', 'fiche-9', { time: '09:00', priceXof: undefined }),
    a('rdv-parent', 'ca', { date: '2026-11-10', time: '10:00', numeroAPrevenir: '+229 01 62 22 33 44' }),
  ];
  db.invoices = []; db.payments = []; db.edge_rate_limits = [];
  notifications.length = 0; maintenant = A_10H;
};
const SERVICE = 'cle-de-service';

remplis();
const sante = await appelle(finir);
dit('GET : la version et les secrets en booleens, sans valeur', ['2026-11-06-b', 'terminer-et-regler', { service: true, liens: true }], [sante.corps.version, sante.corps.fonction, sante.corps.secrets]);

/* ── retrouver : le code ET les quatre chiffres ── */
const CODE = referenceDuRendezVous('rdv-jour');
const trouve = await appelle(finir, { action: 'retrouver', code: CODE.toLowerCase().replace('-', ' '), chiffres: '4480' });
dit('retrouver : le bon code et les bons chiffres rendent le billet (reference, prenom, jour, heure, en cours, 12 000 a regler, porte ouverte)',
  [200, true, { reference: CODE, prenom: 'Awa', jour: JOUR, heure: '08:00', etat: 'en-cours', resteXof: 12000, porte: { ouverte: true, raison: 'ouverte' }, aTermine: false }],
  [trouve.status, trouve.corps.ok, trouve.corps.billet]);
dit('... et le jeton signe de la page /rdv/, qui ne vaut que pour ce rendez-vous (signe par la cle de la plateforme, comme demande-submit)',
  [true, 'rdv-jour', null], [FORME_DU_JETON_DU_RDV.test(trouve.corps.v), await apptIdDuJeton('cle-de-la-plateforme', trouve.corps.v), await apptIdDuJeton('une-autre-cle', trouve.corps.v)]);
dit('... rien d elle que son prenom : ni nom de famille, ni numero', [false, false], [JSON.stringify(trouve.corps).includes('Kossou'), /97 ?12|4480/.test(JSON.stringify(trouve.corps))]);
const fauxChiffres = await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '0000' }, { ip: '5.5.5.1' });
const codeInconnu = await appelle(finir, { action: 'retrouver', code: 'MND-ZZZZ', chiffres: '4480' }, { ip: '5.5.5.2' });
const codeSeul = await appelle(finir, { action: 'retrouver', code: CODE }, { ip: '5.5.5.3' });
dit('un code inconnu, des chiffres faux, le code seul : la MEME reponse, mot pour mot', [{ status: 200, corps: { version: '2026-11-06-b', ok: false, error: 'introuvable' } }, true, true],
  [codeInconnu, JSON.stringify(fauxChiffres) === JSON.stringify(codeInconnu), JSON.stringify(codeSeul) === JSON.stringify(codeInconnu)]);
dit('le second numero du rendez-vous (le parent qui l a pris) le retrouve aussi', [true, 'confirme', false],
  await appelle(finir, { action: 'retrouver', code: referenceDuRendezVous('rdv-parent'), chiffres: '3344' }, { ip: '5.5.5.4' }).then((r) => [r.corps.ok, r.corps.billet?.etat, r.corps.billet?.porte.ouverte]));
remplis();
for (let i = 0; i < 5; i++) await appelle(finir, { action: 'retrouver', code: CODE, chiffres: `000${i}` }, { ip: `6.6.6.${i}` });
const freine = await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' }, { ip: '6.6.6.99' });
dit('le frein par code : apres cinq echecs dans l heure, meme les bons chiffres attendent, d ou qu ils viennent ; un autre code reste libre', [429, 'trop', true],
  [freine.status, freine.corps.error, (await appelle(finir, { action: 'retrouver', code: referenceDuRendezVous('rdv-parent'), chiffres: '3344' }, { ip: '6.6.6.98' })).corps.ok]);
maintenant = A_10H + 61 * 60_000;
dit('... une heure plus tard, le code se rouvre', true, (await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' }, { ip: '6.6.6.97' })).corps.ok);
remplis();
const dix: number[] = [];
for (let i = 0; i < 11; i++) dix.push((await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' }, { ip: '7.7.7.7' })).status);
dit('le frein par adresse : dix recherches en dix minutes, la onzieme attend', [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 429], dix);

/* LE FREIN TIENT EN RAFALE (relecture du 6 novembre 2026). On comptait puis on
   notait : des requetes lancees ensemble passaient toutes avant la premiere
   note. Chaque essai s'inscrit maintenant AVANT d'etre compte. */
const duFrein = (seau: string, cle: string): number => db.edge_rate_limits.filter((l) => l.bucket === seau && l.ip === cle).length;
const CODES_INCONNUS = Array.from({ length: 15 }, (_, i) => `MND-ZZZ${'ABCDEFGHJKLMNPQ'[i]}`);
for (let i = 0; i < 6; i++) await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' }, { ip: '7.7.7.7' });
dit('... un essai refuse ne reste pas inscrit : marteler un frein ferme ne le prolonge pas (dix lignes pour l adresse, aucune pour le code qui a reussi)', [10, 0],
  [duFrein('fin-retrouver', '7.7.7.7'), duFrein('fin-echec', CODE)]);
remplis();
const rafaleDeLAdresse = await Promise.all(CODES_INCONNUS.map((code) => appelle(finir, { action: 'retrouver', code, chiffres: '4480' }, { ip: '7.7.7.8' })));
dit('quinze recherches lancees ENSEMBLE de la meme adresse : jamais plus de dix ne passent', [true, true],
  [rafaleDeLAdresse.filter((r) => r.status === 200).length <= 10, duFrein('fin-retrouver', '7.7.7.8') <= 10]);
remplis();
const rafaleDuCode = await Promise.all(Array.from({ length: 9 }, (_, i) => appelle(finir, { action: 'retrouver', code: CODE, chiffres: `111${i}` }, { ip: `7.7.8.${i}` })));
dit('neuf essais lances ENSEMBLE sur le meme code, de neuf adresses : jamais plus de cinq ne sont juges', [true, true],
  [rafaleDuCode.filter((r) => r.status === 200).length <= 5, duFrein('fin-echec', CODE) <= 5]);
remplis();
const sixReussites: unknown[] = [];
for (let i = 0; i < 6; i++) sixReussites.push((await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' }, { ip: `7.7.9.${i}` })).corps.ok);
dit('une recherche reussie ne compte pas pour un echec : six reussites de suite sur le meme code, aucune ligne d echec', [[true, true, true, true, true, true], 0],
  [sixReussites, duFrein('fin-echec', CODE)]);
/* UN COMPTE ILLISIBLE FERME LE FREIN : on ne cherche pas a l'aveugle. */
remplis();
panneDeLaBase = { table: 'edge_rate_limits', geste: 'compte' };
const compteIllisible = await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' }, { ip: '7.7.7.9' });
panneDeLaBase = { table: 'edge_rate_limits', geste: 'insert' };
const noteManquee = await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' }, { ip: '7.7.7.9' });
const billetSansNote = await appelle(finir, { action: 'billet', v: String(trouve.corps.v) }, { ip: '7.7.7.9' });
panneDeLaBase = null;
dit('le compte du frein illisible, ou l essai qui ne s inscrit pas : la recherche se ferme (« trop »), le billet aussi ; la base revenue, elle rouvre',
  [[429, 'trop'], [429, 'trop'], [429, 'trop'], true],
  [[compteIllisible.status, compteIllisible.corps.error], [noteManquee.status, noteManquee.corps.error], [billetSansNote.status, billetSansNote.corps.error],
    (await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' }, { ip: '7.7.7.9' })).corps.ok]);
/* CHAQUE ESSAI NE RELIT PLUS CENT JOURS DE RENDEZ-VOUS : les identifiants seuls, puis les candidats. */
remplis();
const lecturesDe = async (corps: Record<string, unknown>, ip: string) => {
  lecturesFaites.length = 0;
  await appelle(finir, corps, { ip });
  return lecturesFaites.filter((l) => l.table === 'appointments' || l.table === 'clients').map((l) => `${l.table}:${l.colonnes}`);
};
const travailDuFaux = await lecturesDe({ action: 'retrouver', code: CODE, chiffres: '0000' }, '7.7.6.1');
const largeur = lecturesFaites.filter((l) => l.table === 'appointments').map((l) => [l.colonnes, l.lignes]);
const travailDeLInconnu = await lecturesDe({ action: 'retrouver', code: 'MND-ZZZZ', chiffres: '4480' }, '7.7.6.2');
dit('la recherche lit d abord les seuls identifiants de la fenetre (huit ici), puis le contenu du seul candidat', [['id', 8], ['id,branch_id,data,updated_at', 1]], largeur);
dit('... et fait le meme travail, code inconnu ou chiffres faux : les identifiants, un rendez-vous, une fiche',
  [['appointments:id', 'appointments:id,branch_id,data,updated_at', 'clients:data'], true], [travailDuFaux, JSON.stringify(travailDeLInconnu) === JSON.stringify(travailDuFaux)]);
/* Une porte ordinaire (le billet : soixante en dix minutes) tient de la meme facon. */
remplis();
const soixanteEtUn: number[] = [];
for (let i = 0; i < 61; i++) soixanteEtUn.push((await appelle(finir, { action: 'billet', v: String(trouve.corps.v) }, { ip: '7.7.5.1' })).status);
const rafaleDuBillet = await Promise.all(Array.from({ length: 70 }, () => appelle(finir, { action: 'billet', v: String(trouve.corps.v) }, { ip: '7.7.5.2' })));
dit('le billet : soixante lectures par adresse en dix minutes, la 61e attend ; soixante-dix lancees ensemble, jamais plus de soixante ne passent', [60, 429, true],
  [soixanteEtUn.filter((s) => s === 200).length, soixanteEtUn[60], rafaleDuBillet.filter((r) => r.status === 200).length <= 60]);

/* ── billet : la page /rdv/ relit le reglement ── */
remplis();
const V = (await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' })).corps.v as string;
const forge = `${V.slice(0, -1)}${V.endsWith('A') ? 'B' : 'A'}`;
dit('billet : le jeton signe rend le billet ; un jeton forge ne dit rien', [['en-cours', 12000], { ok: false, error: 'lien' }],
  [await appelle(finir, { action: 'billet', v: V }).then((r) => [r.corps.billet?.etat, r.corps.billet?.resteXof]), await appelle(finir, { action: 'billet', v: forge }).then((r) => ({ ok: r.corps.ok, error: r.corps.error }))]);

/* ── terminer : elle declare avoir termine ── */
const fin = await appelle(finir, { action: 'terminer', porte: 'site', v: V });
const jeton = String(rdvDe('rdv-jour').lienDeReglement?.jeton ?? '');
dit('terminer (le site) : la marque se pose, le lien de reglement aussi, l adresse revient ; le montant est celui du prix fige, la piece n est pas encore la',
  [200, 'a-regler', true, `https://maisonmnd.com/trone/payer.html?tg=r-${jeton}`, 12000, false, { le: new Date(A_10H).toISOString(), par: 'site' }],
  [fin.status, fin.corps.etat, estUnJeton(jeton), fin.corps.adresse, fin.corps.resteXof, fin.corps.piecePrete, rdvDe('rdv-jour').termineParElle]);
dit('... le rendez-vous ne passe PAS honore a sa declaration', ['confirmé', undefined], [rdvDe('rdv-jour').status, rdvDe('rdv-jour').honoreAuReglement]);
dit('... le personnel est prevenu aussitot, par la notification existante (push-notify, mode staff, cle de service)',
  [{ titre: 'Awa a terminé son rituel', corps: 'Rendez-vous de 8 h. Règlement en cours depuis son téléphone, par le site. Reste 12 000 F. Un poste du Trône ouvert prépare sa pièce.', url: '/trone/#/carnet', mode: 'staff', cle: 'Bearer cle-de-service' }],
  notifications);
maintenant = A_10H + 5 * 60_000;
const fin2 = await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-jour'] }, { cle: SERVICE });
dit('un second toucher, par une autre porte : le meme lien, la meme marque, aucune seconde notification',
  [true, jeton, { le: new Date(A_10H).toISOString(), par: 'site' }, 1], [fin2.corps.deja, fin2.corps.jeton, rdvDe('rdv-jour').termineParElle, notifications.length]);
maintenant = A_10H;
const vDe = async (id: string, chiffres: string) => (await appelle(finir, { action: 'retrouver', code: referenceDuRendezVous(id), chiffres }, { ip: `8.8.8.${id.length}` })).corps.v as string;
const demain = await appelle(finir, { action: 'terminer', porte: 'site', v: await vDe('rdv-demain', '4480') });
dit('la veille, la porte reste fermee : ni marque, ni lien, ni notification', ['pas-encore-le-jour', undefined, undefined, 1],
  [demain.corps.etat, rdvDe('rdv-demain').termineParElle, rdvDe('rdv-demain').lienDeReglement, notifications.length]);
dit('« Passe au comptoir » sur la fiche : la porte reste fermee', ['comptoir', undefined],
  [(await appelle(finir, { action: 'terminer', porte: 'site', v: await vDe('rdv-comptoir', '1234') })).corps.etat, rdvDe('rdv-comptoir').termineParElle]);
dit('un rendez-vous annule ne se termine pas', 'annule', (await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-annule'] }, { cle: SERVICE })).corps.etat);
/* UN ACOMPTE DEMANDE, PAS ENCORE VERIFIE : la porte se ferme en « comptoir », et le personnel l'apprend, une fois. */
remplis();
rdvDe('rdv-jour').depositXof = 5000;
rdvDe('rdv-comptoir').depositXof = 3000;
const acompte1 = await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-jour'] }, { cle: SERVICE });
dit('acompte demande, pas verifie : « comptoir », ni marque ni lien ; le personnel recoit « acompte a verifier, reglement au comptoir »',
  ['comptoir', undefined, undefined, [{ titre: 'Awa a terminé son rituel', corps: 'Rendez-vous de 8 h. Acompte de 5 000 F demandé, pas encore vérifié : le règlement se fait au comptoir.', url: '/trone/#/carnet', mode: 'staff', cle: 'Bearer cle-de-service' }]],
  [acompte1.corps.etat, rdvDe('rdv-jour').termineParElle, rdvDe('rdv-jour').lienDeReglement, [...notifications]]);
await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-jour'] }, { cle: SERVICE });
await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-comptoir'] }, { cle: SERVICE });
dit('... une seule fois pour ce rendez-vous ; la case « Passe au comptoir » de la fiche, elle, ne previent personne (acompte ou non)', 1, notifications.length);
rdvDe('rdv-jour').depositConfirmed = true;
const acompte2 = await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-jour'] }, { cle: SERVICE });
dit('... l acompte verifie par l equipe, la porte s ouvre et le reste le compte : 12 000 moins 5 000', ['a-regler', 7000], [acompte2.corps.etat, acompte2.corps.resteXof]);
remplis();
/* SUR WHATSAPP, LES VINGT PREMIERES MINUTES DU RITUEL : une phrase libre n'est pas une declaration.
   Rendez-vous de 9 h 30, il est 9 h 40 : aucune marque, aucun lien, aucune notification ; le bouton
   de Ma Couronne, lui, garde l'heure du rituel. A 9 h 50, WhatsApp ouvre. */
remplis();
maintenant = aCotonou(JOUR, '09:40');
const aPeine = await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-fi'] }, { cle: SERVICE });
dit('WhatsApp, dix minutes apres l heure du rendez-vous : « a-peine-commence », ni marque, ni lien, ni notification', [{ version: '2026-11-06-b', ok: true, etat: 'a-peine-commence' }, undefined, undefined, 0],
  [aPeine.corps, rdvDe('rdv-fi').termineParElle, rdvDe('rdv-fi').lienDeReglement, notifications.length]);
const foyerAPeine = await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-na', 'rdv-fi'] }, { cle: SERVICE });
dit('... le foyer : la tete de 9 h se declare, celle de 9 h 30 qui commence a peine ne recoit aucune marque', ['a-regler', ['Koffi'], true, undefined],
  [foyerAPeine.corps.etat, foyerAPeine.corps.prenoms, !!rdvDe('rdv-na').termineParElle?.le, rdvDe('rdv-fi').termineParElle]);
dit('... avec une tete « Passe au comptoir » a cote, c est encore « a-peine-commence » qui se dit (Opale repond, pas « au comptoir »)', 'a-peine-commence',
  (await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-comptoir', 'rdv-fi'] }, { cle: SERVICE })).corps.etat);
maintenant = aCotonou(JOUR, '08:10');
dit('... le bouton de Ma Couronne garde l heure du rituel : dix minutes apres 8 h, il ouvre', 'a-regler',
  (await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-jour' }, { cle: 'jeton.de.awa' })).corps.etat);
maintenant = aCotonou(JOUR, '09:50');
dit('... vingt minutes apres l heure, WhatsApp ouvre', ['a-regler', 'whatsapp'],
  [(await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-fi'] }, { cle: SERVICE })).corps.etat, rdvDe('rdv-fi').termineParElle?.par]);
remplis();
dit('un jeton forge ne termine rien', { ok: false, error: 'lien' }, await appelle(finir, { action: 'terminer', porte: 'site', v: forge }).then((r) => ({ ok: r.corps.ok, error: r.corps.error })));
dit('la porte WhatsApp ne s ouvre qu a la cle de service ; sans rendez-vous du jour, « sans-rdv »', [403, 403, 'sans-rdv'],
  [(await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-jour'] })).status, (await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-jour'] }, { cle: 'jeton.de.awa' })).status,
    (await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: [] }, { cle: SERVICE })).corps.etat]);

/* ── Ma Couronne : son compte, sa propre fiche seulement ── */
remplis();
const mc = await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-jour' }, { cle: 'jeton.de.awa' });
dit('Ma Couronne : son compte termine SON rendez-vous', ['a-regler', 'couronne'], [mc.corps.etat, rdvDe('rdv-jour').termineParElle?.par]);
dit('... jamais celui d une autre ; jamais sans compte ; une fiche adoptee se reconnait a son compte (authUserId)', [404, 401, 401, 'a-regler', null],
  [(await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-comptoir' }, { cle: 'jeton.de.awa' })).status,
    (await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-jour' })).status,
    (await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-jour' }, { cle: 'jeton.d.inconnue' })).status,
    await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-9' }, { cle: 'jeton.d.adoptee' }).then((r) => r.corps.etat),
    await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-9' }, { cle: 'jeton.d.adoptee' }).then((r) => r.corps.resteXof)]);

/* ── Une ecriture du Trone entre la lecture et l'ecriture ── */
remplis();
entreDeux = () => { const l = db.appointments.find((x) => x.id === 'rdv-jour')!; l.data = { ...l.data, noteDuTrone: 'posee entre deux' }; l.updated_at = `t${++tic}`; };
await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-jour' }, { cle: 'jeton.de.awa' });
dit('le serveur n ecrit jamais sur une ligne qui a bouge : l ecriture du Trone survit, la marque se pose a la relecture', ['posee entre deux', 'couronne'],
  [rdvDe('rdv-jour').noteDuTrone, rdvDe('rdv-jour').termineParElle?.par]);

/* ── Le foyer : un seul numero, un seul lien ── */
remplis();
await appelle(finir, { action: 'terminer', porte: 'site', v: await vDe('rdv-na', '0001') });
const foyer = await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-fi', 'rdv-na'] }, { cle: SERVICE });
const jf = String(foyer.corps.jeton);
dit('le foyer : un seul lien pour les deux tetes, la liste entiere sur chacune, le total des deux restes ; la premiere marque reste celle du site',
  ['a-regler', 12000, { jeton: jf, apptIds: ['rdv-fi', 'rdv-na'] }, { jeton: jf, apptIds: ['rdv-fi', 'rdv-na'] }, 'site', 'whatsapp'],
  [foyer.corps.etat, foyer.corps.resteXof, { jeton: rdvDe('rdv-na').lienDuFoyer?.jeton, apptIds: rdvDe('rdv-na').lienDuFoyer?.apptIds }, { jeton: rdvDe('rdv-fi').lienDuFoyer?.jeton, apptIds: rdvDe('rdv-fi').lienDuFoyer?.apptIds },
    rdvDe('rdv-na').termineParElle?.par, rdvDe('rdv-fi').termineParElle?.par]);
dit('... et la notification nomme les deux tetes', 'Koffi et Fifa ont terminé leur rituel', notifications[notifications.length - 1]?.titre);

/* ── Honore QUAND ELLE A REGLE : la vraie fonction regler-la-seance ── */
const piece = (id: string, apptId: string, xof: number) => ({ id, branch_id: 'b1', data: { id, kind: 'facture', status: 'envoyée', apptId, date: JOUR, lines: [{ label: 'La Reprise', qty: 1, unitXof: xof, discountPct: 0 }], globalDiscountPct: 0 } });
remplis();
const d1 = await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-jour' }, { cle: 'jeton.de.awa' });
const j1 = String(d1.corps.jeton);
dit('avant la piece du Trone, la page « Regler » attend (sans-piece) ; rien ne s honore', ['sans-piece', 'confirmé'],
  [(await appelle(regler, { action: 'lire', jeton: j1 })).corps.page?.etat, rdvDe('rdv-jour').status]);
db.invoices.push(piece('f-jour', 'rdv-jour', 12000));
dit('la piece ecrite par le Trone : la page dit le juste reste, et terminer dit que la piece est prete', ['a-regler', 12000, true],
  [(await appelle(regler, { action: 'lire', jeton: j1 })).corps.page?.etat, (await appelle(regler, { action: 'lire', jeton: j1 })).corps.page?.resteXof,
    (await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-jour' }, { cle: 'jeton.de.awa' })).corps.piecePrete]);
maintenant = A_10H + 4 * 60_000;
transactions.tx1 = { status: 'SUCCESS', amount: 13000, fees: 247, source: 'MTN_BENIN' };
const paye = await appelle(regler, { action: 'regler', jeton: j1, transactionId: 'tx1' });
dit('elle regle : 12 000 sur la piece, 1 000 de merci pour l equipe, la piece soldee', [200, 12000, 1000, 'payée', 1000],
  [paye.status, paye.corps.versementXof, paye.corps.pourboireXof, db.invoices[0].data.status, db.invoices[0].data.tipXof]);
dit('... et LE RENDEZ-VOUS PASSE HONORE, a l instant du reglement, avec la marque que le Trone suivra',
  ['honoré', { le: new Date(A_10H + 4 * 60_000).toISOString() }, ['kkia-tx1']], [rdvDe('rdv-jour').status, rdvDe('rdv-jour').honoreAuReglement, rdvDe('rdv-jour').payments.map((p: any) => p.id)]);
dit('apres le reglement : terminer dit « deja regle », le billet dit « regle », sans reste', ['deja-regle', 'regle', 0],
  [(await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-jour' }, { cle: 'jeton.de.awa' })).corps.etat,
    ...(await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' }).then((r) => [r.corps.billet?.etat, r.corps.billet?.resteXof]))]);
/* Un rejeu apres un honneur qui n'aurait pas pu s'ecrire. */
Object.assign(db.appointments.find((x) => x.id === 'rdv-jour')!.data, { status: 'confirmé', honoreAuReglement: undefined });
const rejeu = await appelle(regler, { action: 'regler', jeton: j1, transactionId: 'tx1' });
dit('un rejeu ne double rien, et rattrape l honneur qui manquait', [true, 1, 'honoré'], [rejeu.corps.deja, db.invoices[0].data.payments.length, rdvDe('rdv-jour').status]);

remplis();
/* Le chemin du 25 octobre : le Trone a pose le lien, elle n'a rien declare. */
Object.assign(rdvDe('rdv-jour'), { lienDeReglement: { jeton: J2, creeLe: 'x' } });
db.invoices.push(piece('f-jour', 'rdv-jour', 12000));
transactions.tx2 = { status: 'SUCCESS', amount: 12000, fees: 228, source: 'MOOV_BJ' };
await appelle(regler, { action: 'regler', jeton: J2, transactionId: 'tx2' });
dit('sans declaration, un reglement en ligne n honore rien : le chemin d avant ne bouge pas', ['payée', 'confirmé', undefined],
  [db.invoices[0].data.status, rdvDe('rdv-jour').status, rdvDe('rdv-jour').honoreAuReglement]);

remplis();
const df = await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-na', 'rdv-fi'] }, { cle: SERVICE });
db.invoices.push(piece('f-na', 'rdv-na', 7000), piece('f-fi', 'rdv-fi', 5000));
transactions.tx3 = { status: 'SUCCESS', amount: 12000, fees: 228, source: 'MTN_BENIN' };
const pf = await appelle(regler, { action: 'regler', jeton: String(df.corps.jeton), transactionId: 'tx3' });
dit('le foyer regle d un seul paiement : chaque tete passe honoree', [200, 12000, 'honoré', 'honoré', true, true],
  [pf.status, pf.corps.versementXof, rdvDe('rdv-na').status, rdvDe('rdv-fi').status, !!rdvDe('rdv-na').honoreAuReglement?.le, !!rdvDe('rdv-fi').honoreAuReglement?.le]);

/* ══ 16. LA PORTE DU SITE : « Retrouver mon rendez-vous » et le billet ═══
   Les lectures et les mots de billet-du-rdv-pur.ts, nourris des reponses de
   la VRAIE fonction ; puis le cablage de la page, lu dans ses sources. */
remplis();
const sTrouve = await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '4480' });
const lueTrouve = rechercheLue(sTrouve.corps, sTrouve.status);
dit('le site lit la recherche : trouve, avec le jeton de /rdv/ et le billet', ['trouve', true, 12000], [lueTrouve.etat, lueTrouve.etat === 'trouve' && FORME_DU_JETON_DU_RDV.test(lueTrouve.v), lueTrouve.etat === 'trouve' ? lueTrouve.billet.resteXof : null]);
const sFaux = await appelle(finir, { action: 'retrouver', code: CODE, chiffres: '0000' }, { ip: '9.9.9.1' });
const sInconnu = await appelle(finir, { action: 'retrouver', code: 'MND-ZZZZ', chiffres: '4480' }, { ip: '9.9.9.2' });
dit('... un code inconnu et des chiffres faux se lisent pareil : « introuvable », une seule phrase pour les deux', ['introuvable', 'introuvable', 'Nous ne retrouvons pas ce rendez-vous. Vérifiez votre code et vos quatre chiffres, ou écrivez à la Maison.'],
  [rechercheLue(sFaux.corps, sFaux.status).etat, rechercheLue(sInconnu.corps, sInconnu.status).etat, MOTS_DE_LA_RECHERCHE.introuvable]);
dit('... le frein se dit « trop », une reponse abimee « panne », jamais « trouve » sans un vrai jeton', ['trop', 'trop', 'panne', 'panne', 'panne'],
  [rechercheLue({ ok: false, error: 'trop' }, 429).etat, rechercheLue(null, 429).etat, rechercheLue(null).etat, rechercheLue({ ok: true, v: 'pas-un-jeton', billet: sTrouve.corps.billet }).etat, rechercheLue({ ok: true, v: sTrouve.corps.v, billet: { reference: 'x' } }).etat]);
dit('la saisie se relit avant d appeler : le code seul ne part pas, trois chiffres non plus', ['code', 'chiffres', 'chiffres', null],
  [saisieARevoir('7K3', '4480')?.champ, saisieARevoir('MND-7K3Q', '')?.champ, saisieARevoir('mnd 7k3q', '448')?.champ, saisieARevoir('mnd 7k3q', '4480')]);
dit('le code pose dans l adresse par le WhatsApp de la Maison se relit ; un code abime ne se pose pas', ['MND-7K3Q', '', ''], [codeDeLAdresse('?code=MND-7K3Q'), codeDeLAdresse('?code=<script>'), codeDeLAdresse('')]);
dit('le lien du WhatsApp de la Maison mene a la page de la recherche', `https://maisonmnd.com/${CHEMIN_POUR_RETROUVER}`, PAGE_POUR_RETROUVER_SON_RDV);

const sBillet = await appelle(finir, { action: 'billet', v: sTrouve.corps.v });
const billetDuJour = billetDeLaPageLu(sBillet.corps)!;
dit('le billet du jour, a l heure du rituel : « Terminer et regler », le montant du serveur, plus de Deplacer ni d Annuler',
  { sur: 'Votre rituel est en cours', phrase: 'Quand l’équipe a fini, terminez ici : vous réglez depuis votre téléphone et vous partez sans passer au comptoir.', montant: '12 000 F', bouton: 'Terminer et régler', note: 'Si l’équipe ajoute un soin ou un produit, le montant se met à jour sur la page du règlement.', leJourMeme: true },
  reglementDuBillet(billetDuJour));
const sFin = await appelle(finir, { action: 'terminer', porte: 'site', v: sTrouve.corps.v });
dit('« Terminer et regler » : le site ne suit que l adresse de la page « Regler » de la Maison', ['a-regler', true, 'panne', 'panne'],
  [finLue(sFin.corps, sFin.status).etat, (finLue(sFin.corps) as { adresse?: string }).adresse === sFin.corps.adresse,
    finLue({ ok: true, etat: 'a-regler', adresse: 'https://ailleurs.example/payer.html?tg=r-23456789abcdef' }).etat, finLue({ ok: true, etat: 'a-regler' }).etat]);
dit('... apres sa declaration, le billet dit « Regler mon rituel » ; une porte fermee se dit en une phrase, sans adresse',
  ['Régler mon rituel', { etat: 'ferme', raison: 'comptoir' }, 'Pour votre règlement, l’équipe vous attend au comptoir.', 'Ce bouton s’allume à l’heure de votre rituel.'],
  [reglementDuBillet(billetDeLaPageLu((await appelle(finir, { action: 'billet', v: sTrouve.corps.v })).corps)!)?.bouton, finLue({ ok: true, etat: 'comptoir' }), refusDit('comptoir'), refusDit('avant-l-heure')]);
const billetDe = (plus: Record<string, unknown>) => billetLu({ reference: 'MND-7K3Q', prenom: 'Awa', jour: JOUR, heure: '08:00', etat: 'confirme', resteXof: 12000, porte: { ouverte: false, raison: 'pas-encore-le-jour' }, aTermine: false, ...plus })!;
dit('la veille : ce qui sera a regler, AUCUN bouton, Deplacer et Annuler restent', [undefined, '12 000 F', false, 'À régler'],
  [reglementDuBillet(billetDe({}))?.bouton, reglementDuBillet(billetDe({}))?.montant, reglementDuBillet(billetDe({}))?.leJourMeme, reglementDuBillet(billetDe({}))?.sur]);
dit('regle : « Vous pouvez partir : la Maison est prevenue », sans bouton ; un montant inconnu ne s affiche pas ; un annule ne dit rien du reglement',
  ['Merci, Awa. Vous pouvez partir : la Maison est prévenue.', undefined, undefined, null],
  [reglementDuBillet(billetDe({ etat: 'regle', resteXof: 0, porte: { ouverte: false, raison: 'deja-regle' } }))?.phrase,
    reglementDuBillet(billetDe({ etat: 'regle', resteXof: 0, porte: { ouverte: false, raison: 'deja-regle' } }))?.bouton,
    reglementDuBillet(billetDe({ etat: 'en-cours', resteXof: null, porte: { ouverte: true, raison: 'ouverte' } }))?.montant,
    reglementDuBillet(billetDe({ etat: 'annule', resteXof: null, porte: { ouverte: false, raison: 'annule' } }))]);
const dAvance = reglementDuBillet(billetDe({ etat: 'confirme', resteXof: 0, porte: { ouverte: false, raison: 'deja-regle' } }));
dit('paye d avance, a venir : « Deja regle », sans bouton ni montant, et Deplacer, Annuler et l agenda restent', ['Déjà réglé', 'Ce rendez-vous est déjà réglé. Merci.', undefined, undefined, false],
  [dAvance?.sur, dAvance?.phrase, dAvance?.bouton, dAvance?.montant, dAvance?.leJourMeme]);
rdvDe('rdv-demain').payments = [{ id: 'v-avance', amountXof: 12000, method: 'Espèces', date: JOUR }];
const billetDeDemain = (await appelle(finir, { action: 'retrouver', code: referenceDuRendezVous('rdv-demain'), chiffres: '4480' }, { ip: '9.9.9.7' })).corps.billet;
dit('... rejoue sur la vraie fonction : demain, paye d avance, le billet reste « confirme » (deja regle, reste zero) et le site garde Deplacer et Annuler',
  ['confirme', 'deja-regle', 0, false], [billetDeDemain?.etat, billetDeDemain?.porte?.raison, billetDeDemain?.resteXof, reglementDuBillet(billetLu(billetDeDemain)!)?.leJourMeme]);
dit('un billet abime ne se lit pas : sans porte, un montant negatif, un etat inconnu', [null, null, null],
  [billetLu({ reference: 'MND-7K3Q', jour: JOUR, etat: 'confirme' }), billetLu({ reference: 'MND-7K3Q', jour: JOUR, etat: 'confirme', resteXof: -5, porte: { ouverte: false, raison: 'x' } }),
    billetLu({ reference: 'MND-7K3Q', jour: JOUR, etat: 'gratuit', porte: { ouverte: true, raison: 'ouverte' } })]);
const MOTS_DU_SITE = [...Object.values(MOTS_DE_LA_RECHERCHE), refusDit('x'), refusDit('deja-regle'), reglementDuBillet(billetDuJour)!.phrase, reglementDuBillet(billetDe({}))!.phrase];
dit('la voix de la Maison sur le site : ni tiret long, ni « salon », ni « maitre », le vouvoiement', [false, false, false],
  [MOTS_DU_SITE.some((m) => /—|–/.test(m)), MOTS_DU_SITE.some((m) => /salon|ma[iî]tre/i.test(m)), MOTS_DU_SITE.some((m) => /\b(tu|ton|ta|tes)\b/i.test(m))]);

const sansCommentaires = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ilot = sansCommentaires(lis('src/apps/revelateur/ilots/MonRendezVous.tsx'));
dit('la page parle a la fonction terminer-et-regler : retrouver (code et chiffres), billet (son jeton), terminer (la porte du site, son jeton)', [true, true, true, true],
  [/supabase\.functions\.invoke\(FONCTION_DE_LA_FIN, \{ body: corps \}\)/.test(ilot), /demandeALaFin\(\{ action: 'retrouver', code, chiffres \}\)/.test(ilot),
    /demandeALaFin\(\{ action: 'billet', v: jeton \}\)/.test(ilot), /demandeALaFin\(\{ action: 'terminer', porte: 'site', v: jeton \}\)/.test(ilot)]);
dit('... trouve, elle mene au billet /rdv/?v= ; a regler, a la seule adresse relue ; elle ne decide d aucun montant', [true, true, false],
  [/location\.assign\(`\$\{import\.meta\.env\.BASE_URL\}rdv\/\?v=\$\{encodeURIComponent\(r\.v\)\}`\)/.test(ilot), /if \(r\.etat === 'a-regler'\) \{ location\.assign\(r\.adresse\); return; \}/.test(ilot), /resteXof\s*[=+*-]/.test(ilot)]);
dit('... le jour meme, Deplacer et Annuler laissent la place au reglement ; la page de l agenda ne porte pas le reglement', [true, true],
  [/const changer = aVenir && !reglement\?\.leJourMeme;/.test(ilot), /const reglement = !agendaSeul && billet \? reglementDuBillet\(billet\) : null;/.test(ilot)]);
const contenuDuSite = lis('src/apps/revelateur/contenu.ts');
const pageDuCode = /\{\s*chemin: '\/mon-rendez-vous\/',[\s\S]*?\n  \},/.exec(contenuDuSite)?.[0] ?? '';
dit('la page /mon-rendez-vous/ existe, monte l ilot du rendez-vous, et reste hors des moteurs et du plan', [true, true, true],
  [pageDuCode.length > 100, /ilot: 'rdv',/.test(pageDuCode), /horsDesMoteurs: '/.test(pageDuCode)]);
const generateur = lis('scripts/genere-revelateur.mjs');
dit('le generateur donne a cette page le genre « retrouver », et le site y mene discretement : le pied de page, la page de reservation', [true, true, true],
  [/if \(nom === 'rdv' && p\.chemin === '\/mon-rendez-vous\/'\) \{\s*return `<section class="serre"><div class="conteneur"><div data-ilot="rdv" data-genre="retrouver">/.test(generateur),/\{ texte: 'Retrouver mon rendez-vous', vers: '\/mon-rendez-vous\/' \},/.test(contenuDuSite),
    /<a href="\$\{attr\(lien\('\/mon-rendez-vous\/'\)\)\}">Déjà un rendez-vous \? Retrouvez-le avec votre code\.<\/a>/.test(generateur)]);

/* ══ 17. LA PORTE DE MA COURONNE, et la page « Regler » qui la suit ══════ */
dit('de Ma Couronne a la page « Regler » : un chemin sur la meme origine, jamais un domaine ; en ligne sous /trone/, en developpement a la racine',
  [`/trone/regler.html?r=${J1}&retour=couronne`, `/regler.html?r=${J1}&retour=couronne`], [pageDuReglement(J1, '/couronne/'), pageDuReglement(J1, '/couronne.html')]);
dit('... et le retour a Ma Couronne, une fois le reglement fait', ['/couronne/', '/couronne.html'], [retourAMaCouronne('/trone/regler.html'), retourAMaCouronne('/regler.html')]);
const REFUS = [refusDeLaFin({ ok: true, etat: 'deja-regle' }), refusDeLaFin({ ok: true, etat: 'rien-a-regler' }), refusDeLaFin({ ok: true, etat: 'comptoir' }), refusDeLaFin({ ok: true, etat: 'avant-l-heure' }), refusDeLaFin({ error: 'reseau' })];
dit('une porte restee fermee se dit en une phrase, jamais un code', [
  'Ce rituel est déjà réglé. Merci.', 'Il n’y a rien à régler pour ce rituel.', 'Pour votre règlement, l’équipe vous attend au comptoir.',
  'Le règlement en ligne n’est pas ouvert pour ce rituel. L’équipe vous répond au comptoir.', 'Le règlement ne répond pas. Réessayez dans un moment, ou passez au comptoir.',
], REFUS);
dit('... et chacune de ces phrases a son anglais dans Ma Couronne', [], REFUS.filter((p) => !EN[p]));

/* La page « Regler » attend la piece que le Trone prepare, puis dit qu'elle peut partir. */
remplis();
const m1 = await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-jour' }, { cle: 'jeton.de.awa' });
const pageEnAttente = (await appelle(regler, { action: 'lire', jeton: String(m1.corps.jeton) })).corps.page;
dit('elle a termine, sa piece n est pas encore ecrite : la page le sait et attend (« en preparation »), au lieu de renoncer', ['sans-piece', true], [pageEnAttente?.etat, pageEnAttente?.enPreparation]);
Object.assign(rdvDe('rdv-demain'), { lienDeReglement: { jeton: J2, creeLe: 'x' } });
dit('... sans declaration, une page sans piece ne promet rien', ['sans-piece', undefined],
  await appelle(regler, { action: 'lire', jeton: J2 }).then((r) => [r.corps.page?.etat, r.corps.page?.enPreparation]));
db.invoices.push(piece('f-jour', 'rdv-jour', 12000));
transactions.tx5 = { status: 'SUCCESS', amount: 12000, fees: 228, source: 'MTN_BENIN' };
const m2 = await appelle(regler, { action: 'regler', jeton: String(m1.corps.jeton), transactionId: 'tx5' });
dit('elle regle : la fonction dit que le rendez-vous est honore, la page peut dire « vous pouvez partir » ; un rejeu le redit', [true, true],
  [m2.corps.honore, (await appelle(regler, { action: 'regler', jeton: String(m1.corps.jeton), transactionId: 'tx5' })).corps.honore]);
remplis();
Object.assign(rdvDe('rdv-jour'), { lienDeReglement: { jeton: J2, creeLe: 'x' }, status: 'honoré' });
db.invoices.push(piece('f-jour', 'rdv-jour', 12000));
transactions.tx6 = { status: 'SUCCESS', amount: 12000, fees: 228, source: 'MTN_BENIN' };
dit('le chemin d avant (la seance terminee au comptoir) ne dit pas « vous pouvez partir » : rien n a ete honore ici', false,
  (await appelle(regler, { action: 'regler', jeton: J2, transactionId: 'tx6' })).corps.honore);
remplis();
const mf = await appelle(finir, { action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-na', 'rdv-fi'] }, { cle: SERVICE });
db.invoices.push(piece('f-na', 'rdv-na', 7000));
const pageDuFoyerAMoitie = (await appelle(regler, { action: 'lire', jeton: String(mf.corps.jeton) })).corps.page;
dit('le foyer : une piece ecrite, l autre pas encore ; la page attend les deux, jamais un total a moitie pret', ['sans-piece', true], [pageDuFoyerAMoitie?.etat, pageDuFoyerAMoitie?.enPreparation]);
db.invoices.push(piece('f-fi', 'rdv-fi', 5000));
dit('... les deux pieces ecrites : le total entier', ['a-regler', 12000], await appelle(regler, { action: 'lire', jeton: String(mf.corps.jeton) }).then((r) => [r.corps.page?.etat, r.corps.page?.resteXof]));

const carteMc = sansCommentaires(lis('src/apps/couronne/RituelEnCours.tsx'));
const tabsMc = sansCommentaires(lis('src/apps/couronne/Tabs.tsx'));
dit('l accueil de Ma Couronne monte la carte « Votre rituel · en cours », au-dessus de la prochaine seance', [true, true],
  [/import RituelEnCours from '\.\/RituelEnCours';/.test(tabsMc), /<RituelEnCours nomDuRituel=\{\(a\) => serviceNames\(a, services\)\} \/>\s*\{\}\s*<div className="mc-nextrdv">/.test(tabsMc)]);
dit('la carte suit la regle (ses rendez-vous a elle, « Passe au comptoir » l eteint) et passe par le serveur, avec son compte', [true, true, true, true],
  [/carteDuRituelEnCours\(\{\s*rdvs: appts\.filter\(\(a\) => a\.clientId === monId\),/.test(carteMc), /passeAuComptoir: client\?\.passeAuComptoir === true,/.test(carteMc),
    /const r = await termineMonRituel\(rdv\.id, session\?\.access_token \?\? ''\);/.test(carteMc),
    /if \(r\.ok && r\.etat === 'a-regler' && r\.jeton\) \{ window\.location\.assign\(pageDuReglement\(r\.jeton\)\); return; \}/.test(carteMc)]);
dit('... « vous pouvez partir » seulement quand la carte dit « regle » ; le bouton change de nom quand elle a termine', [true, true],
  [/if \(carte\.etat === 'regle'\) \{[\s\S]*t\('Vous pouvez partir : la Maison est prévenue\.'\)/.test(carteMc), /aTermine \? t\('Régler mon rituel'\) : t\('Terminer mon rituel'\)/.test(carteMc)]);
const pageRegler = sansCommentaires(lis('src/apps/regler/App.tsx'));
dit('la page « Regler » : elle attend la piece en preparation (trois minutes), dit « vous pouvez partir » seulement si la fonction l a honore, et ramene a Ma Couronne',
  [true, true, true, true, true],
  [/if \(p\.etat === 'sans-piece' && p\.enPreparation\) \{\s*const delai = attenteDeLaPiece\(essai\);\s*if \(delai !== null\) \{/.test(pageRegler), /window\.setTimeout\(\(\) => \{ void lis\(essai \+ 1, true\); \}, delai\);/.test(pageRegler),
    /honore: r\.honore === true \}\); return; \}/.test(pageRegler), /\{ecran\.honore && <span>Vous pouvez partir : la Maison est prévenue\.<\/span>\}/.test(pageRegler),
    /\{retourDemande\(\) && <a className="rg-autre" href=\{retourAMaCouronne\(\)\}>Revenir à Ma Couronne<\/a>\}/.test(pageRegler)]);

/* L'ATTENTE NE DOIT PAS EPUISER LE FREIN DE SA PROPRE FONCTION (relecture du 6
   novembre 2026) : 72 relectures quand la fonction en accorde 60 par adresse
   en dix minutes, et le Wi-Fi de la Maison est une seule adresse. */
const delais = Array.from({ length: 80 }, (_, i) => attenteDeLaPiece(i));
dit('l attente de la piece s espace : douze lectures a 2,5 s, puis une toutes les 10 s ; trois minutes en 27 lectures, puis elle s arrete',
  [12, 15, 180000, 27, null], [delais.filter((d) => d === 2500).length, delais.filter((d) => d === 10000).length, delais.reduce((s: number, d) => s + (d ?? 0), 0), delais.filter((d) => d !== null).length, attenteDeLaPiece(27)]);
remplis();
const attendue = await appelle(finir, { action: 'terminer', porte: 'couronne', rdvId: 'rdv-jour' }, { cle: 'jeton.de.awa' });
const lectures: number[] = [];
for (let i = 0; i < 27; i++) lectures.push((await appelle(regler, { action: 'lire', jeton: String(attendue.corps.jeton) }, { ip: '4.4.4.4' })).status);
dit('les 27 lectures d une attente entiere, de la meme adresse, passent toutes sous le frein de la fonction', [27, true], [lectures.length, lectures.every((s) => s === 200)]);
for (let i = 27; i < 60; i++) await appelle(regler, { action: 'lire', jeton: String(attendue.corps.jeton) }, { ip: '4.4.4.4' });
const laSoixanteEtUnieme = await appelle(regler, { action: 'lire', jeton: String(attendue.corps.jeton) }, { ip: '4.4.4.4' });
dit('... la 61e lecture en dix minutes est refusee pour toute l adresse (« trop ») : c est ce que 72 relectures provoquaient', [429, 'trop'], [laSoixanteEtUnieme.status, laSoixanteEtUnieme.corps.error]);
dit('la page prend ce frein pour « pas encore pret » : pendant l attente elle relit plus tard (jamais plus vite que 10 s), hors de l attente elle le dit et propose de reessayer',
  [true, true, true],
  [/if \(r\.error === 'trop'\) \{\s*const delai = attend \? attenteDeLaPiece\(essai\) : null;\s*if \(delai !== null\) \{/.test(pageRegler),
    /window\.setTimeout\(\(\) => \{ void lis\(essai \+ 1, true\); \}, Math\.max\(delai, 10_000\)\);/.test(pageRegler),
    /setEcran\(\{ k: 'erreur', dit: attend \? PAS_ENCORE_PRETE : 'Beaucoup de demandes d’un coup\. Réessayez dans un instant\.', reessayer: true \}\);/.test(pageRegler)]);

/* ══ 18. LE TRONE : la piece ecrite au tarif de sa tete, sans honorer ; les
   suites de l'honneur ; la marque du Carnet ; « Passe au comptoir » ═══════
   Le crochet React ne se rejoue pas ici : ses regles sont pures (plus haut),
   son cablage se lit dans ses sources. */
const shell = sansCommentaires(lis('src/apps/trone/shell/Shell.tsx'));
const mainDuTrone = sansCommentaires(lis('src/apps/trone/shell/useLaFinDuRituel.ts'));
const effets = mainDuTrone.split('useEffect(() => {');
dit('le Trone monte la main de la fin du rituel, a cote de celle de Grenat', [true, 4], [/useLaMainDeGrenat\(\);\s*\{?\s*useLaFinDuRituel\(\);|useLaMainDeGrenat\(\);\s*useLaFinDuRituel\(\);/.test(shell), effets.length]);
const effetPiece = effets[2] ?? '';
const effetSuites = effets[3] ?? '';
dit('sa piece : seulement pour une declaration qui tient, quand aucune piece ne porte encore le rendez-vous, tables lues',
  [true, true],
  [/pieceAPreparer\(a, invoices\.some\(\(i\) => i\.apptId === a\.id && i\.kind === 'facture'\)\)/.test(effetPiece),
    /!tablePrete\('appointments'\) \|\| !tablePrete\('invoices'\) \|\| !tablePrete\('clients'\) \|\| byId\.size === 0\) return;/.test(effetPiece)]);
dit('... un seul poste l ecrit : la reservation au serveur (ecriture conditionnelle sur pieceLe) passe avant toute ecriture',
  [true, true],
  [/\.eq\('id', a\.id\)\.is\('data->termineParElle->>pieceLe', null\)\.select\('id'\);\s*if \(!\(prise \?\? \[\]\)\.length\) return;/.test(effetPiece),
    effetPiece.indexOf("if (!(prise ?? []).length) return;") < effetPiece.indexOf('appointmentsStore.set(')]);
dit('... le prix se fige avec la reservation, la piece s ecrit au tarif de sa tete (celle de « Terminer la seance »)',
  [true, true, true],
  [/\{ \.\.\.x, \.\.\.prixAFiger\(x, byId\), termineParElle: \{ \.\.\.x\.termineParElle, pieceLe \} \}/.test(effetPiece),
    /const tarifs = tarifsDuRituel\(frais, \{\s*client: clients\.find\(\(c\) => c\.id === frais\.clientId\),\s*bands, sets, cats: categories, byId, tousServices: services, produits,\s*\}\);/.test(effetPiece),
    /const r = factureAEnvoyer\(frais, byId, frais\.branchId, tarifs\.prixPlein, tarifs\.gesteDe\);/.test(effetPiece)]);
dit('... et le rendez-vous n est JAMAIS honore a sa declaration', false, /honorAppointment|honoreSansEncaisser|honoreALEncaissement|status: 'honoré'/.test(effetPiece));
/* L'acompte et les versements d'avant montent sur la piece neuve : la page dit le juste reste. */
const ACOMPTE = [{ date: '2026-11-01', amountXof: 5000, note: 'Acompte reçu avant le comptoir' }];
dit('l acompte reconnu monte sur sa piece, a SA date, en « Acompte » (aucun tiroir d aujourd hui), sous un identifiant tire du rendez-vous',
  [{ id: 'deja-rdv-1-0', date: '2026-11-01', amountXof: 5000, method: 'Acompte', note: 'Acompte reçu avant le comptoir' }],
  versementsDejaRecus({ rdvId: 'rdv-1', totalXof: 12000, dejaRecu: ACOMPTE }));
dit('... la page « Regler » dit alors le meme reste que le billet : 12 000 moins l acompte de 5 000', [7000, 7000],
  [resteDeLaPieceDeLaFin({ id: 'p', status: 'envoyée', lines: [{ qty: 1, unitXof: 12000 }], payments: versementsDejaRecus({ rdvId: 'rdv-1', totalXof: 12000, dejaRecu: ACOMPTE }) }),
    resteConnuDeLaFin(rdv({ depositXof: 5000, depositConfirmed: true }))]);
dit('... jamais plus que le total de la piece, dans l ordre ou l argent est entre ; rien a monter, rien d ecrit', [[4000, 3000], [], []],
  [versementsDejaRecus({ rdvId: 'r', totalXof: 7000, dejaRecu: [{ date: '2026-10-01', amountXof: 4000, note: 'a' }, { date: '2026-10-20', amountXof: 5000, note: 'b' }, { date: '2026-11-01', amountXof: 1000, note: 'c' }] }).map((v) => v.amountXof),
    versementsDejaRecus({ rdvId: 'r', totalXof: 7000, dejaRecu: [] }), versementsDejaRecus({ rdvId: 'r', totalXof: 0, dejaRecu: ACOMPTE })]);
dit('... le Trone les monte sur la piece NEUVE seulement, avec ce que le rendez-vous a deja recu (la regle de la Caisse, lArgentDejaRecu)', [true, true],
  [/if \(!r\.deja\) \{\s*const deja = versementsDejaRecus\(\{ rdvId: frais\.id, totalXof: invoiceTotal\(r\.inv\), dejaRecu: lArgentDejaRecu\(frais, frais\.date\) \}\);/.test(effetPiece),
    /invoicesStore\.set\(\(prev\) => prev\.map\(\(i\) => \(i\.id === r\.inv\.id \? \{ \.\.\.i, payments: \[\.\.\.\(i\.payments \?\? \[\]\), \.\.\.deja\], depositCreditXof: \(i\.depositCreditXof \?\? 0\) \+ dejaXof \} : i\)\)\);/.test(effetPiece)]);
/* L'ACOMPTE NE S'ECRIT PAS DEUX FOIS (relecture du 6 novembre 2026) : elle declare (le Trone monte
   l'acompte sur la piece), puis regle au comptoir. L'encaissement ajoutait un second « Acompte » :
   20 000 F, acompte 5 000 F, 15 000 F en especes, et la piece portait 25 000 F recus. */
const encaissement = sansCommentaires(lis('src/apps/trone/routes/clients/actions.tsx'));
dit('au comptoir, l acompte deja monte sur la piece ouverte n est pas credite une seconde fois', [true, true],
  [/const acompteDejaSurLaPiece = !!pieceDuRituelOuverte && invoiceReglements\(pieceDuRituelOuverte\)\.some\(\(v\) => v\.method === 'Acompte'\);/.test(encaissement),
    /const depositCredit = depositReceived && alreadyPaid === 0 && !acompteDejaSurLaPiece \? deposit : 0;/.test(encaissement)]);
/* Le journal de la piece, rejoue a la main avec la regle du comptoir : l'existant, puis l'acompte credite (s'il l'est), puis le comptant. */
const journalDuComptoir = (dejaSurLaPiece: { method: string; amountXof: number }[], acompte: number, comptant: number): number => {
  const credite = dejaSurLaPiece.some((v) => v.method === 'Acompte') ? 0 : acompte;
  return [...dejaSurLaPiece, ...(credite > 0 ? [{ method: 'Acompte', amountXof: credite }] : []), { method: 'Espèces', amountXof: comptant }].reduce((s, v) => s + v.amountXof, 0);
};
dit('... 20 000 F, acompte verifie 5 000 F : declaree puis reglee au comptoir, la piece porte 20 000 F recus ; sans declaration, le comptoir credite l acompte comme avant',
  [20000, 20000], [journalDuComptoir(versementsDejaRecus({ rdvId: 'rdv-1', totalXof: 20000, dejaRecu: ACOMPTE }), 5000, 15000), journalDuComptoir([], 5000, 15000)]);
dit('les suites de l honneur pose au reglement : une fois (reservation de suitesLe), puis les points, le stock, la mission, comme au comptoir',
  [true, true, true],
  [/appts\.filter\(\(a\) => a\.branchId === branch\.id && suitesAFaire\(a\) && !fait\.has\(`suite-\$\{a\.id\}`\)\)/.test(effetSuites),
    /\.eq\('id', a\.id\)\.is\('data->honoreAuReglement->>suitesLe', null\)\.select\('id'\);\s*if \(!\(prise \?\? \[\]\)\.length\) return;\s*honorAppointment\(a, byId, \{ muet: true \}\);/.test(effetSuites),
    /if \(!d \|\| d\.pointsAwarded \|\| !d\.honoreAuReglement \|\| d\.honoreAuReglement\.suitesLe\) return;/.test(effetSuites)]);
const carnet = sansCommentaires(lis('src/apps/trone/routes/clients/Carnet.tsx'));
dit('le Carnet porte la marque : « A termine · reglement en cours », puis « Reglee en ligne · Depart sans caisse »', [true, true],
  [/const marque = a\.termineParElle \? marqueDeLaFinAuCarnet\(a, resteDeSaPiece\(a\.id\)\) : null;/.test(carnet), /title=\{marque\.sous\}\s*>\s*\{marque\.dit\}/.test(carnet)]);
const panneau = sansCommentaires(lis('src/apps/trone/routes/clients/ReglementEnDirect.tsx'));
dit('le panneau « Le reglement en direct » dit sa declaration et par ou, au lieu d un message parti', [true, true],
  [/fin\s*\? \{ nom: 'A terminé', quand: heure\(fin\.le\), detail: PORTE_DITE\[fin\.par\] \?\? 'en ligne', fait: true \}\s*: \{ nom: 'Message parti'/.test(panneau),
    /const marque = fin \? marqueDeLaFinAuCarnet\(rdv, piece \? e\.resteXof : null\) : null;/.test(panneau)]);
const guetteur = sansCommentaires(lis('src/apps/trone/shell/useReglementsEnLigne.ts'));
dit('l annonce existante dit « Depart sans caisse » quand elle avait termine elle-meme et que sa piece est soldee', [true, true],
  [/const sansCaisse = !!appts\.find\(\(a\) => a\.id === p\.apptId\)\?\.termineParElle && invoiceResteXof\(p\) <= 0;/.test(guetteur), /\$\{sansCaisse \? ' · Départ sans caisse' : ''\}/.test(guetteur)]);
const fiche = sansCommentaires(lis('src/apps/trone/routes/clients/Customers.tsx'));
dit('la fiche porte la case « Passe au comptoir », qui ecrit passeAuComptoir et se retire en la decochant', [true, true, true],
  [/checked=\{client\.passeAuComptoir === true\}/.test(fiche), /onChange=\{\(e\) => patch\(\{ passeAuComptoir: e\.target\.checked \? true : undefined \}\)\}/.test(fiche), /<span style=\{\{ fontSize: 12\.5 \}\}>Passe au comptoir<\/span>/.test(fiche)]);

console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nTout tient (${n} controles).`);
if (ko) process.exit(1);
