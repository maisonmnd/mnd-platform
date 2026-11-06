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
  lienDeLaFin, notificationDeLaFin, ditQuElleATermine, codeDansLeMessage, motDeLaMaisonALaFin, PAGE_POUR_RETROUVER_SON_RDV,
  marqueDeLaFinAuCarnet, pieceAPreparer, suitesAFaire, carteDuRituelEnCours,
  type RdvDeLaFin, type PieceDeLaFin,
} from '../src/shared/terminer-et-regler-pur';
import { ALPHABET_DE_LA_REFERENCE, referenceDuRendezVous } from '../src/shared/lien-du-rdv-pur';
import {
  ALPHABET_DU_JETON, LONGUEUR_DU_JETON, jetonDe, estUnJeton, parametreDuLien, resteDeLaPiece, laPieceDuRdv, type PieceLue,
} from '../src/shared/regler-la-seance-pur';
import { prixFigeLu } from '../src/shared/cloture-du-jour-pur';
import { LIEN_TAPGO } from '../src/shared/mnd-pay-pur';

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
  { titre: 'Nael et Sena ont terminé leur rituel', corps: 'Rendez-vous de 14 h 30. Règlement en cours depuis son téléphone, par WhatsApp. Un poste du Trône ouvert prépare sa pièce.', url: '/trone/#/carnet' },
  notificationDeLaFin({ prenoms: ['Nael', 'Sena', 'Nael'], heure: '14:30', porte: 'whatsapp', resteXof: null }));

/* ── 11. « J'ai termine », en phrase libre ─────────────────────────────── */
const OUI = [
  'J’ai terminé mon RDV', 'j ai termine', 'J\'AI FINI', 'jai fini', 'J’ai terminé !', 'Bonjour, j’ai terminé mon rendez-vous', 'c’est fini', 'C\'est terminé, merci',
  'on a fini', 'Nous avons terminé', 'Terminé', 'fini', 'rdv terminé', 'Séance terminée', 'Je veux régler', 'je voudrais payer', 'Je souhaite régler ma séance',
  'envoyez-moi le lien de paiement', 'ça y est j’ai fini', 'J ai bien fini', 'je peux régler',
  /* Quatorze mots : la plus longue phrase qui reste une declaration. */
  'Bonjour, j’ai terminé mon rendez-vous, je voudrais régler s’il vous plaît',
];
const NON = [
  'Je n’ai pas terminé', 'J’ai pas fini', 'c’est pas terminé', 'pas encore fini', 'Quand est-ce que ce sera terminé ?', 'j’ai presque fini', 'Bonjour', 'Merci', 'Je veux réserver',
  'Je veux régler mon abonnement', 'je voudrais payer ma commande', 'Comment régler ?', 'Combien je dois ?', 'Est-ce que je peux régler en ligne ?',
  'J’ai terminé le travail hier', 'si j’ai fini avant 15 h je passe', 'Je veux payer un acompte',
  'Bonjour, j’ai terminé ma journée de travail un peu tard et je me demandais si vous aviez encore une place pour moi ce soir',
  /* Vingt-trois mots, sans aucun mot d ecart : trop longue pour etre jugee ici, la conversation suit son cours. */
  'Bonjour à toute l’équipe de la Maison, j’ai terminé mon rendez-vous de ce matin avec vous, merci beaucoup pour tout',
  '', 'j’ai faim',
];
dit('« j ai termine » se reconnait en phrase libre, casse, accents et ponctuation indifferents', OUI.map(() => true), OUI.map(ditQuElleATermine));
dit('une negation, une question, un autre achat, un autre jour, une longue phrase : ce n est pas une declaration', NON.map(() => false), NON.map(ditQuElleATermine));
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

console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nTout tient (${n} controles).`);
if (ko) process.exit(1);
