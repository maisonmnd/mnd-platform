/* LE FIL ET LE TABLEAU, ÉPROUVÉS — `node scripts/verifie-fil.mjs`.

   Ce harnais existe parce que la visibilité a fui DEUX FOIS le 18 août :
   d'abord les tête-à-tête seuls étaient fermés (les demandes publiques
   restaient lisibles de tous), puis `argent` était écrit mais jamais lu (un
   maître sans prix voyait « 81 000 F » dans le fil). Deux règles écrites en
   commentaire, aucune éprouvée — un contrôle qui ne peut pas échouer ne
   contrôle rien. Celui-ci peut. */
import {
  messageVisible, canalVisible, messagesDuCanal, mesDemandes, demandeOuverte,
  puisJeClore, puisJeReprendre, puisJeDeplacer, puisJeEffacer, demandesDuTableau,
  poidsPriorite,
  estAPrendre, A_PRENDRE, enRetard, faiteRecemment, messageExpire,
  canalDM, canalNotes, CANAL_MAISON,
  fusionnerComptages, totalDuComptage, comptageComplet,
  type FilMessage,
} from '../src/shared/fil';
import type { Invoice } from '../src/shared/finance';
import { serieDesComptages } from '../src/shared/comptages';
import type { Client } from '../src/shared/clients';

const BR = 'br';
let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const YEMAN = 'yeman@mnd';
const BRICE = 'brice@mnd';
const GERARD = 'gerard@mnd';

let n = 0;
const msg = (m: Partial<FilMessage>): FilMessage => ({
  id: `f-${++n}`,
  branchId: BR,
  canal: CANAL_MAISON,
  auteurMail: YEMAN,
  auteurNom: 'Yéman',
  texte: 'x',
  at: '2026-08-18T10:00',
  ...m,
});

/* ── LA FUITE DU MATIN, REJOUÉE — une demande de Brice à Yéman, posée EN
   PUBLIC. C'est exactement ce que Gérard voyait. Il ne doit plus. ── */
const bossAboss = msg({ auteurMail: BRICE, auteurNom: 'Brice', demandePour: YEMAN, demandePourNom: 'Yéman' });
dit('Gérard ne voit pas la demande de Brice à Yéman, même en public', false, messageVisible(bossAboss, GERARD));
dit('Yéman, destinataire, la voit', true, messageVisible(bossAboss, YEMAN));
dit('Brice, auteur, la voit', true, messageVisible(bossAboss, BRICE));
dit('un message SANS demande reste public', true, messageVisible(msg({}), GERARD));

/* ── LA SECONDE FUITE, REJOUÉE — `argent` écrit, jamais lu. ── */
const parleArgent = msg({ argent: true });
dit('sans-prix : un message d’argent ne se montre pas', false, messageVisible(parleArgent, GERARD, true));
dit('avec prix : il se montre', true, messageVisible(parleArgent, GERARD, false));
dit('le fil filtré ne porte pas le message d’argent', 0,
  messagesDuCanal([parleArgent], BR, CANAL_MAISON, GERARD, true).length);

/* ── LES CANAUX PRIVÉS — notes et tête-à-tête. ── */
dit('mes notes ne sont qu’à moi', false, canalVisible(canalNotes(YEMAN), GERARD));
dit('le tête-à-tête n’est qu’aux deux', false, canalVisible(canalDM(YEMAN, BRICE), GERARD));
dit('l’ordre d’ouverture ne fait qu’un seul fil', canalDM(YEMAN, BRICE), canalDM(BRICE, YEMAN));

/* ── À PRENDRE — une demande sans destinataire regarde tout le monde. ── */
const aPrendre = msg({ demandePour: A_PRENDRE, demandePourNom: 'À prendre' });
dit('une carte à prendre se voit de tous', true, messageVisible(aPrendre, GERARD));
dit('elle est bien « à prendre »', true, estAPrendre(aPrendre));
dit('la sentinelle ne tombe dans le « à traiter » de personne', 0,
  mesDemandes([aPrendre], BR, GERARD, []).length);
dit('seul son auteur peut la clore', false, puisJeClore(aPrendre, GERARD));
dit('… et l’auteur le peut', true, puisJeClore(aPrendre, YEMAN));

/* ── LE TABLEAU SUIT LE RANG — décision du 18 août. ── */
const versGerard = msg({ auteurMail: BRICE, auteurNom: 'Brice', demandePour: GERARD, demandePourNom: 'Gérard' });
const toutes = [bossAboss, versGerard, aPrendre];
dit('le souverain voit les trois cartes', 3, demandesDuTableau(toutes, BR, YEMAN, true).length);
dit('Gérard ne voit que la sienne et l’à-prendre', 2, demandesDuTableau(toutes, BR, GERARD, false).length);
dit('la demande boss-à-boss n’existe pas chez Gérard', false,
  demandesDuTableau(toutes, BR, GERARD, false).some((m) => m.id === bossAboss.id));
dit('sans-prix : une carte d’argent sort du tableau de Gérard', 1,
  demandesDuTableau([versGerard, msg({ demandePour: GERARD, argent: true })], BR, GERARD, false, true).length);
dit('… mais PAS de celui du souverain qui voit les prix', 2,
  demandesDuTableau([versGerard, msg({ demandePour: GERARD, argent: true })], BR, YEMAN, true, false).length);

/* ── QUI DÉPLACE UNE CARTE — décision ③ : auteur, destinataire, souverain. ── */
dit('Gérard ne déplace pas la carte boss-à-boss', false, puisJeDeplacer(bossAboss, GERARD, false));
dit('le destinataire déplace la sienne', true, puisJeDeplacer(versGerard, GERARD, false));
dit('l’auteur déplace ce qu’il a demandé', true, puisJeDeplacer(versGerard, BRICE, false));
dit('le souverain déplace tout', true, puisJeDeplacer(bossAboss, GERARD, true));
dit('une carte à prendre se laisse prendre par n’importe qui', true, puisJeDeplacer(aPrendre, GERARD, false));

/* ── GÉRARD NE CLÔT PAS LE TRAVAIL D'UN AUTRE — la règle qui a manqué. ── */
dit('Gérard ne clôt pas une demande pour Yéman', false, puisJeClore(bossAboss, GERARD));
dit('Yéman clôt la sienne', true, puisJeClore(bossAboss, YEMAN));
dit('on ne reprend que sa propre phrase', false, puisJeReprendre(bossAboss, GERARD));

/* ── EFFACER — « supprimer les tâches terminées », 18 août. ── */
const faite = { ...versGerard, faitAt: '2026-08-18T15:00', faitPar: 'Gérard' };
dit('une demande OUVERTE ne s’efface que par son auteur', false, puisJeEffacer(versGerard, GERARD, false));
dit('… et l’auteur le peut', true, puisJeEffacer(versGerard, BRICE, false));
dit('TERMINÉE, son destinataire peut l’effacer', true, puisJeEffacer(faite, GERARD, false));
dit('terminée, le souverain aussi', true, puisJeEffacer(faite, YEMAN, true));
dit('terminée, un tiers non souverain, jamais', false, puisJeEffacer(faite, YEMAN, false));
dit('éteinte par sa facture (sans faitAt), l’état vrai passe en paramètre', true,
  puisJeEffacer(versGerard, GERARD, false, true));
dit('un message ordinaire s’efface par son auteur seul', false, puisJeEffacer(msg({}), GERARD));

/* ── LA DEMANDE S'ÉTEINT AVEC SA FACTURE — le cœur du Fil. ── */
const facture = (regle: number): Invoice => ({
  id: 'inv-1', branchId: BR, kind: 'facture', number: 'MND-1', clientId: 'c1',
  date: '2026-08-12', status: 'envoyée',
  /* Les remises à ZÉRO explicitement : `1 - undefined / 100` fait NaN, et un
     total NaN n'est jamais soldé — la première mouture de cette facture
     d'essai a fait échouer le contrôle pour cette seule raison. */
  lines: [{ id: 'l1', label: 'Rituel', qty: 1, unitXof: 55000, discountPct: 0 }],
  globalDiscountPct: 0,
  payments: regle > 0 ? [{ id: 'p1', date: '2026-08-15', amountXof: regle, method: 'especes' }] : [],
} as unknown as Invoice);
const porteFacture = msg({ demandePour: BRICE, piece: { kind: 'facture', id: 'inv-1', label: 'MND-1' } });
dit('facture à moitié réglée : la demande reste ouverte', true, demandeOuverte(porteFacture, [facture(30000)]));
dit('facture soldée : la demande s’éteint d’elle-même', false, demandeOuverte(porteFacture, [facture(55000)]));
dit('pièce introuvable : la demande reste ouverte — c’est une question', true, demandeOuverte(porteFacture, []));
dit('cochée à la main, elle est close quoi qu’il arrive', false,
  demandeOuverte({ ...porteFacture, faitAt: '2026-08-18T11:00' }, [facture(0)]));

/* ── L'ÉCHÉANCE — le retard se CALCULE, jamais ne se coche. ── */
const J = '2026-08-18';
dit('échéance passée = en retard', true, enRetard(msg({ demandePour: BRICE, echeance: '2026-08-17' }), J));
dit('échéance du jour = pas en retard', false, enRetard(msg({ demandePour: BRICE, echeance: J }), J));
dit('sans échéance, jamais en retard', false, enRetard(msg({ demandePour: BRICE }), J));

/* ── TERMINÉ GARDE SEPT JOURS — décision ④. ── */
dit('faite avant-hier : encore au tableau', true, faiteRecemment(msg({ faitAt: '2026-08-16T09:00' }), J));
dit('faite il y a sept jours pile : encore là', true, faiteRecemment(msg({ faitAt: '2026-08-11T09:00' }), J));
dit('faite il y a huit jours : sortie du tableau', false, faiteRecemment(msg({ faitAt: '2026-08-10T09:00' }), J));
dit('jamais faite : pas dans « Terminé »', false, faiteRecemment(msg({}), J));

/* ── LA PRIORITÉ — la haute d'abord, l'ordinaire AVANT la basse. ── */
dit('haute pèse moins que moyenne', true, poidsPriorite({ priorite: 'haute' }) < poidsPriorite({ priorite: 'moyenne' }));
dit('moyenne pèse moins que l’ordinaire', true, poidsPriorite({ priorite: 'moyenne' }) < poidsPriorite({}));
dit('l’ordinaire pèse moins que la basse — « basse » veut dire « ça peut attendre »', true,
  poidsPriorite({}) < poidsPriorite({ priorite: 'basse' }));

/* ── CE QUI S'OUBLIE, CE QUI RESTE — les demandes ne s'effacent pas. ── */
dit('un bavardage de treize mois s’efface', true, messageExpire(msg({ at: '2025-07-01T10:00' }), J));
dit('une demande du même âge RESTE', false, messageExpire(msg({ at: '2025-07-01T10:00', demandePour: BRICE }), J));

/* ── LE COMPTAGE — un quart vide garde sa valeur, il ne remet pas à zéro. ── */
const fusion = fusionnerComptages({ avantG: 43, avantD: 50 }, { arriereG: 20 });
dit('le nouveau quart s’ajoute', 20, fusion.arriereG);
dit('les quarts d’avant restent', 43, fusion.avantG);
dit('93 + 20 font 113', 113, totalDuComptage(fusion));
dit('trois quarts sur quatre : partiel', false, comptageComplet(fusion));

if (ko > 0) {
  console.log(`\n${ko} contrôle(s) en échec.`);
  process.exit(1);
}
console.log('\nTout passe.');

/* ══ LA SÉRIE DES COMPTAGES — DEUX GESTES, UNE SUITE ═══════════════
   « Parfois ça change. Le client double ses locks, en perd… » puis « inclure le
   comptage de manière indépendante au fil. Parfois je compte juste le total »
   (Yéman, 5 septembre 2026).

   Le Fil compte quart par quart, la fiche prend le total. Les ranger en deux
   listes ferait deux vérités pour un seul chiffre. */
const cpt = (at: string, avG: number, avD: number, arG: number, arD: number, auteur = 'Team'): FilMessage =>
  ({
    id: `m-${at}`, branchId: 'b1', canal: 'maison', at,
    auteurMail: 'x@mnd.bj', auteurNom: auteur, texte: 'Comptage',
    piece: { kind: 'cliente', id: 'cl-1', nom: 'Une tête' },
    comptage: { avantG: avG, avantD: avD, arriereG: arG, arriereD: arD },
  } as unknown as FilMessage);
const tete = (comptages: { iso: string; locks: number; note?: string; par?: string }[] = [], lockCount?: number) =>
  ({ id: 'cl-1', comptages, lockCount } as unknown as Client);

const filDeLaTete: FilMessage[] = [
  cpt('2025-02-19T10:00:00.000Z', 45, 45, 45, 45),
  cpt('2025-09-08T10:00:00.000Z', 107, 107, 106, 107),
];
const suite = serieDesComptages(filDeLaTete, 'b1', tete([
  { iso: '2026-02-19', locks: 445 },
  { iso: '2026-09-04', locks: 398, note: 'perdu sur les tempes', par: 'Yéman' },
]));
dit('les deux gestes font UNE suite', [398, 445, 427, 180], suite.map((c) => c.locks));
dit('… du plus récent au plus ancien', '2026-09-04', suite[0].iso);
dit('… chacun dit d’où il vient', ['fiche', 'fiche', 'fil', 'fil'], suite.map((c) => c.origine));
dit('… le dédoublement se voit', 247, suite[2].ecart);
dit('… la perte aussi', -47, suite[0].ecart);
/* LE PREMIER NE SUIT RIEN : un écart contre le néant serait une pousse
   imaginaire de 180 locks. */
dit('… et le premier ne suit rien', null, suite[3].ecart);
dit('… le fil garde ses quarts', 'devant 45 · 45, derrière 45 · 45', suite[3].enClair);
dit('… le comptoir garde son mot', 'perdu sur les tempes', suite[0].enClair);

/* UN SEUL COMPTAGE PAR JOUR AU FIL : il laisse compléter un quadrant après
   l'autre, et quatre lignes dont trois incomplètes montreraient des écarts qui
   n'ont jamais eu lieu. */
const enPlusieursFois = serieDesComptages([
  cpt('2026-09-04T09:00:00.000Z', 100, 0, 0, 0),
  cpt('2026-09-04T09:20:00.000Z', 100, 99, 0, 0),
  cpt('2026-09-04T09:40:00.000Z', 100, 99, 100, 99),
], 'b1', tete());
dit('quatre quarts au fil de la matinée font UN comptage', 1, enPlusieursFois.length);
dit('… celui du dernier message du jour', 398, enPlusieursFois[0].locks);
/* « Partiel » veut dire QU'UN QUART N'A PAS ÉTÉ POSÉ, pas qu'il vaut zéro :
   un quadrant compté à zéro est un fait, pas un oubli. */
const partiel = {
  id: 'm-p', branchId: 'b1', canal: 'maison', at: '2026-09-04T09:00:00.000Z',
  auteurMail: 'x@mnd.bj', auteurNom: 'Team', texte: 'Comptage',
  piece: { kind: 'cliente', id: 'cl-1', nom: 'Une tête' },
  comptage: { avantG: 100, avantD: 99, arriereG: 100 },
} as unknown as FilMessage;
dit('… un quart non posé se dit partiel', false, serieDesComptages([partiel], 'b1', tete())[0].complet);

/* LE COMPTOIR L'EMPORTE SUR LE MÊME JOUR : la fiche est l'endroit où l'on se
   reprend, et une correction qui ne corrige rien vaut moins que rien. */
const corrige = serieDesComptages(
  [cpt('2026-09-04T09:00:00.000Z', 100, 99, 100, 99)], 'b1', tete([{ iso: '2026-09-04', locks: 402 }]),
);
dit('la fiche corrige le fil du même jour', [402], corrige.map((c) => c.locks));
dit('… et le dit', 'fiche', corrige[0].origine);

/* LE CHIFFRE HÉRITÉ COMPTE POUR UN : dire « jamais comptée » pendant que
   l'en-tête annonce « Nano · 427 locks » serait se contredire sur le même écran. */
const herite = serieDesComptages([], 'b1', tete([], 427));
dit('le chiffre hérité fait un premier comptage', 427, herite[0]?.locks);
dit('… sans jour inventé', '', herite[0]?.iso);
dit('… et il se dit hérité', 'herite', herite[0]?.origine);
dit('un vrai comptage chasse l’hérité', 1, serieDesComptages([], 'b1', tete([{ iso: '2026-09-04', locks: 398 }], 398)).length);
dit('une tête jamais comptée n’a pas de série', 0, serieDesComptages([], 'b1', tete()).length);

/* ON NE MÊLE PAS LES TÊTES NI LES MAISONS. */
dit('le comptage d’une autre maison reste chez elle', 0, serieDesComptages(filDeLaTete, 'b2', tete()).length);
/* UN CHIFFRE ABSURDE NE FAIT PAS UN COMPTAGE : zéro lock n'est pas une tête. */
dit('zéro lock n’entre pas dans la série', 0, serieDesComptages([], 'b1', tete([{ iso: '2026-09-04', locks: 0 }])).length);
