/* LES DIX GESTES D'UNE CONVERSATION, ÉPROUVÉS —
   `node scripts/verifie-gestes-conversation.mjs`.

   « Comment avoir les boutons de l'automatisation, rappels de RDV, factures,
   itinéraires, codes QR, paiements… Comment aussi joindre des fichiers ? »
   (Yéman, 14 septembre 2026).

   Un bouton qui choisit la mauvaise pièce envoie la facture d'une autre. Un
   bouton qui reste allumé sans rien derrière fait perdre le comptoir. Un
   relevé de foyer qui oublie l'avoir réclame de l'argent déjà versé. Les
   trois fautes se lisent ici. */
import type { Appointment } from '../src/shared/agenda';
import type { Family } from '../src/shared/clients';
import {
  jourDit, jourEtHeureDits, prenomDe, ilYA,
  prochainRendezVous, saDerniereFacture, sonResteDu, sonDevisEnAttente, seanceSansBilan,
  releveDuFoyer, phraseDuFoyer, phraseDeLAbonnement, lesGestes, gesteDit,
  type PieceDuGeste, type TeteDuGeste, type ContexteDesGestes, type SuiviDAbonnement,
} from '../src/shared/gestes-conversation';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const AUJ = '2026-09-14';
const francs = (x: number) => `${x.toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;

const rdv = (o: Partial<Appointment> & { id: string; clientId: string; date: string }): Appointment => ({
  branchId: 'b1', serviceIds: ['s1'], time: '10:00', master: 'm1', status: 'confirmé', ...o,
} as Appointment);

const piece = (o: Partial<PieceDuGeste> & { id: string; number: string; clientId: string; date: string }): PieceDuGeste => ({
  branchId: 'b1', kind: 'facture', status: 'envoyée', totalXof: 0, resteXof: 0, ...o,
} as PieceDuGeste);

/* ── LES MOTS DU COMPTOIR ────────────────────────────────────────── */
dit('un jour se dit sans son année', 'dimanche 6 septembre', jourDit('2026-09-06'));
dit('une heure ronde se dit courte', 'dimanche 6 septembre à 10 h', jourEtHeureDits('2026-09-06', '10:00'));
dit('une heure pleine garde ses minutes', 'dimanche 6 septembre à 10 h 30', jourEtHeureDits('2026-09-06', '10:30'));
dit('sans heure, le jour seul', 'dimanche 6 septembre', jourEtHeureDits('2026-09-06', undefined));
dit('une date illisible se rend telle quelle', '', jourDit(''));
dit('on s’adresse par le prénom', 'Akouavi', prenomDe('Akouavi Kossou'));
dit('un nom vide ne fabrique rien', '', prenomDe(undefined));
dit('trente jours en arrière', '2026-08-15', ilYA(AUJ, 30));

/* ── SON PROCHAIN RENDEZ-VOUS ────────────────────────────────────
   UN RITUEL DE CE MATIN N'EST PAS « À VENIR » À QUINZE HEURES, et
   l'annoncer comme tel est humiliant. */
const carnet = [
  rdv({ id: 'a1', clientId: 'c1', date: '2026-09-14', time: '09:00' }),
  rdv({ id: 'a2', clientId: 'c1', date: '2026-09-14', time: '17:00' }),
  rdv({ id: 'a3', clientId: 'c1', date: '2026-09-19', time: '10:00' }),
  rdv({ id: 'a4', clientId: 'c1', date: '2026-09-16', time: '10:00', status: 'annulé' }),
  rdv({ id: 'a5', clientId: 'c2', date: '2026-09-15', time: '10:00' }),
];
dit('le matin, celui de ce matin', 'a1', prochainRendezVous(carnet, 'c1', AUJ, '08:00')?.id);
dit('l’après-midi, celui du soir', 'a2', prochainRendezVous(carnet, 'c1', AUJ, '15:00')?.id);
dit('un rituel annulé ne s’annonce jamais', 'a3', prochainRendezVous(carnet, 'c1', AUJ, '18:00')?.id);
dit('une autre tête a le sien', 'a5', prochainRendezVous(carnet, 'c2', AUJ, '08:00')?.id);
dit('sans rien devant, rien', undefined, prochainRendezVous(carnet, 'c9', AUJ, '08:00')?.id);

/* ── LA BONNE PIÈCE ──────────────────────────────────────────────── */
const pieces = [
  piece({ id: 'i1', number: 'FA-2026-0409', clientId: 'c1', date: '2026-08-30', totalXof: 22000, resteXof: 22000 }),
  piece({ id: 'i2', number: 'FA-2026-0412', clientId: 'c1', date: '2026-09-06', totalXof: 17000, resteXof: 15000 }),
  piece({ id: 'i3', number: 'FA-2026-0500', clientId: 'c1', date: '2026-09-10', totalXof: 9000, resteXof: 9000, status: 'brouillon' }),
  piece({ id: 'd1', number: 'DV-2026-0088', clientId: 'c1', date: '2026-09-12', kind: 'devis', totalXof: 45000 }),
  piece({ id: 'd2', number: 'DV-2026-0070', clientId: 'c1', date: '2026-09-01', kind: 'devis', status: 'acceptée', totalXof: 30000 }),
];
dit('sa facture, c’est la plus récente', 'FA-2026-0412', saDerniereFacture(pieces, 'c1')?.number);
dit('un brouillon n’est pas une facture', true, saDerniereFacture(pieces, 'c1')?.id !== 'i3');
dit('ce qu’elle doit, toutes pièces confondues', 37000, sonResteDu(pieces, 'c1'));
dit('un brouillon ne fait pas une dette', 37000, sonResteDu(pieces, 'c1'));
dit('son devis en attente', 'DV-2026-0088', sonDevisEnAttente(pieces, 'c1')?.number);
/* UN DEVIS ACCEPTÉ N'ATTEND PLUS RIEN : le renvoyer rouvrirait une
   négociation close. */
dit('un devis accepté n’attend plus', undefined,
  sonDevisEnAttente(pieces.filter((p) => p.id !== 'd1'), 'c1')?.number);

/* ── LA SÉANCE QUI ATTEND SON BILAN ──────────────────────────────── */
const honores = [
  rdv({ id: 'h1', clientId: 'c1', date: '2026-09-06', status: 'honoré' }),
  rdv({ id: 'h2', clientId: 'c1', date: '2026-08-30', status: 'honoré' }),
  rdv({ id: 'h3', clientId: 'c1', date: '2026-07-01', status: 'honoré' }),
];
dit('la plus fraîche des séances sans bilan', 'h1',
  seanceSansBilan(honores, [], 'c1', ilYA(AUJ, 30), AUJ)?.id);
dit('celle dont le bilan est remis ne compte plus', 'h2',
  seanceSansBilan(honores, [{ apptId: 'h1' }], 'c1', ilYA(AUJ, 30), AUJ)?.id);
/* AU-DELÀ DE TRENTE JOURS, LA PAROLE N'EST PLUS DUE : un bilan de juillet
   envoyé en septembre ne rassure personne. */
dit('les vieilles séances sortent de la fenêtre', undefined,
  seanceSansBilan(honores, [{ apptId: 'h1' }, { apptId: 'h2' }], 'c1', ilYA(AUJ, 30), AUJ)?.id);

/* ══ LE RELEVÉ DU FOYER ═════════════════════════════════════════════ */
const famille: Family = { id: 'f1', branchId: 'b1', name: 'Famille A.', payerClientId: 'c1' };
const tetes: TeteDuGeste[] = [
  { id: 'c1', name: 'A. K.', familyId: 'f1', birthday: '1988-04-02' },
  { id: 'c2', name: 'L. K.', familyId: 'f1', birthday: '2014-01-10' },
  { id: 'c3', name: 'S. K.', familyId: 'f1', birthday: '2017-06-20' },
  { id: 'c4', name: 'M. K.', familyId: 'f1', birthday: '2005-03-15' },
  { id: 'c5', name: 'Partie', familyId: 'f1', birthday: '2012-01-01', archived: true },
];
const estMineure = (c: TeteDuGeste, auj: string): boolean => {
  if (!c.birthday) return false;
  const [a, m, j] = c.birthday.split('-').map(Number);
  const [A, M, J] = auj.split('-').map(Number);
  let age = A - a;
  if (M < m || (M === m && J < j)) age -= 1;
  return age < 18;
};
const piecesDuFoyer = [
  piece({ id: 'f-i1', number: 'FA-2026-0412', clientId: 'c1', date: '2026-09-06', totalXof: 17000, resteXof: 15000 }),
  piece({ id: 'f-i2', number: 'FA-2026-0409', clientId: 'c2', date: '2026-08-30', totalXof: 22000, resteXof: 22000, apptId: 'ba2' }),
  piece({ id: 'f-i3', number: 'FA-2026-0415', clientId: 'c4', date: '2026-09-06', totalXof: 8000, resteXof: 8000 }),
  piece({ id: 'f-i4', number: 'FA-2026-0300', clientId: 'c3', date: '2026-08-01', totalXof: 5000, resteXof: 0 }),
];
const apptsDuFoyer = [
  /* Trois nomment leur facture, la quatrième est nommée PAR la sienne : les
     deux sens comptent, et aucun des quatre n'est « non facturé ». */
  rdv({ id: 'ba1', clientId: 'c1', date: '2026-09-06', status: 'honoré', invoiceId: 'f-i1' }),
  rdv({ id: 'ba2', clientId: 'c2', date: '2026-09-06', status: 'honoré' }),
  rdv({ id: 'ba3', clientId: 'c3', date: '2026-08-30', status: 'honoré', invoiceId: 'f-i4' }),
  rdv({ id: 'ba4', clientId: 'c4', date: '2026-09-06', status: 'honoré', invoiceId: 'f-i3' }),
];
const releve = releveDuFoyer({
  famille, clients: tetes, pieces: piecesDuFoyer, appts: apptsDuFoyer, bilans: [],
  avoirXof: 30000, aujourdhui: AUJ, estMineure,
});

dit('le foyer nomme sa payeuse', 'A. K.', releve.payeuse?.name);
dit('une tête archivée ne compte pas', 4, releve.lignes.length);
dit('les impayés de toutes les têtes', 45000, releve.impayesXof);
dit('l’avoir du compte', 30000, releve.avoirXof);
/* L'AVOIR SE DÉDUIT AVANT D'ANNONCER QUOI QUE CE SOIT : réclamer 45 000 F à
   un foyer qui en a déposé 30 000 est la faute la plus sûre. */
dit('ce qui est réellement dû', 15000, releve.netXof);
dit('la payeuse n’est jamais « une tête qu’elle porte »', false,
  releve.lignes.find((l) => l.clientId === 'c1')?.mineure);
dit('les mineures sont reconnues', [true, true],
  ['c2', 'c3'].map((id) => releve.lignes.find((l) => l.clientId === id)?.mineure));
dit('l’adulte du foyer n’est pas portée', false,
  releve.lignes.find((l) => l.clientId === 'c4')?.mineure);

/* LE SOIN D'UNE ADULTE EST À ELLE SEULE : son bilan ne voyage pas dans le
   message de sa mère, même si sa facture, elle, y figure. */
dit('les bilans du foyer : la payeuse et ses mineures', ['ba1', 'ba2', 'ba3'], releve.apptsDesBilans.sort());
dit('… mais la facture de l’adulte compte dans l’argent', 8000,
  releve.lignes.find((l) => l.clientId === 'c4')?.resteXof);

/* UN RITUEL HONORÉ MAIS PAS FACTURÉ N'ENTRE PAS DANS LE TOTAL. */
const avecSeanceNue = releveDuFoyer({
  famille, clients: tetes, pieces: piecesDuFoyer, aujourdhui: AUJ, estMineure, avoirXof: 0, bilans: [],
  appts: [...apptsDuFoyer, rdv({ id: 'ba5', clientId: 'c1', date: '2026-09-12', status: 'honoré' })],
});
dit('aucun rituel non facturé quand le lien existe', 0, releve.rituelsNonFactures);
dit('un rituel honoré sans pièce se signale', 1, avecSeanceNue.rituelsNonFactures);
dit('… et n’entre pas dans le total', 45000, avecSeanceNue.impayesXof);

/* UN AVOIR PLUS GRAND QUE LA DETTE RESTE UN AVOIR. */
const large = releveDuFoyer({
  famille, clients: tetes, pieces: piecesDuFoyer, appts: apptsDuFoyer, bilans: [],
  avoirXof: 60000, aujourdhui: AUJ, estMineure,
});
dit('un avoir plus grand que la dette ne fait pas une dette en creux', 0, large.netXof);
dit('… et ce qu’il en reste se dit', 15000, large.avoirRestantXof);

/* ── LA PHRASE DU FOYER ──────────────────────────────────────────── */
dit('la phrase déduit l’avoir et donne le net',
  'A., voici le point sur Famille A. 3 pièces restent ouvertes, pour 45 000 F. Votre compte porte un avoir de 30 000 F, qui s’en déduit : il reste 15 000 F. Vous trouverez ci-dessous le lien pour régler.',
  phraseDuFoyer(releve, 'A.', francs));
dit('un avoir qui couvre tout ne réclame rien',
  'A., voici le point sur Famille A. 3 pièces restent ouvertes, pour 45 000 F. Votre compte porte un avoir de 60 000 F, qui les couvre entièrement : il n’y a rien à régler, et il vous reste 15 000 F d’avoir.',
  phraseDuFoyer(large, 'A.', francs));
dit('un compte à jour se dit simplement',
  'A., le compte Famille A. est entièrement à jour. Merci de votre confiance.',
  phraseDuFoyer({ ...releve, lignes: [], impayesXof: 0, avoirXof: 0, netXof: 0, avoirRestantXof: 0 }, 'A.', francs));

/* ══ LE SUIVI D'ABONNEMENT ══════════════════════════════════════════
   LES DEUX MODES NE SE DISENT PAS PAREIL, et les confondre a déjà menti :
   le pack annuel de D. D., lu à travers une fenêtre mensuelle, affichait
   0 séance sur 6 quand elle les avait toutes prises. */
const pack: SuiviDAbonnement = {
  formule: 'Année Sereine', mode: 'pack', expireLe: '2027-06-12', retardXof: 0, couvertsHorsFormule: 0,
  lignes: [{ nom: 'soins GBÈZÀ™', reste: 2, total: 6 }, { nom: 'rituels SÍNSIN™', reste: 0, total: 6 }],
};
dit('un paquet dit ce qu’il reste et jusqu’à quand',
  'A., il vous reste 2 soins GBÈZÀ™ sur votre Année Sereine, valables jusqu’au samedi 12 juin. rituels SÍNSIN™ : tout est consommé.',
  phraseDeLAbonnement(pack, 'A.', francs));

const cycle: SuiviDAbonnement = {
  formule: 'L’Essentielle', mode: 'cycle', retardXof: 0, couvertsHorsFormule: 0,
  prochaineEcheance: { date: '2026-10-01', montantXof: 35000 },
  lignes: [{ nom: 'rituels SÍNSIN™', reste: 1, total: 2 }, { nom: 'soins GBÈZÀ™', reste: 0, total: 2 }],
};
dit('un cycle dit ce qu’il reste et quand il recharge',
  'A., il vous reste 1 rituels SÍNSIN™ ce mois-ci sur L’Essentielle. Vos compteurs se rechargent le jeudi 1 octobre. soins GBÈZÀ™ : tout est consommé.',
  phraseDeLAbonnement(cycle, 'A.', francs));

/* UN RETARD NE S'ANNONCE JAMAIS COMME UN SOLDE : annoncer « il vous reste
   2 soins » à quelqu'un qui doit 35 000 F, c'est offrir ce qu'on n'a pas
   encaissé. */
dit('le retard prend le dessus sur le compteur',
  'A., une échéance de votre formule L’Essentielle reste à régler : 35 000 F. Vous trouverez le lien pour la solder ci-dessous, et vos compteurs repartent aussitôt.',
  phraseDeLAbonnement({ ...cycle, retardXof: 35000 }, 'A.', francs));

dit('un paquet entièrement consommé se dit sans reproche',
  'A., votre Année Sereine est entièrement consommée. Nous serons heureux de vous en proposer une nouvelle quand vous le souhaiterez.',
  phraseDeLAbonnement({ ...pack, lignes: [{ nom: 'soins GBÈZÀ™', reste: 0, total: 6 }] }, 'A.', francs));

/* ══ LES DIX GESTES ═════════════════════════════════════════════════ */
const ctx = (o: Partial<ContexteDesGestes> = {}): ContexteDesGestes => ({
  branchId: 'b1', maison: 'Maison MND',
  tete: { id: 'c1', name: 'Akouavi K.', familyId: 'f1' },
  fenetreOuverte: true, aujourdhui: AUJ, heure: '14:00',
  enFrancs: francs,
  lienDePaiement: (x) => `https://exemple/payer?montant=${x}`,
  itineraire: 'Rue 12.34, Suru-Léré, Cotonou',
  pieces, appts: [...carnet, ...honores], bilans: [], photos: 4,
  codesVivants: [],
  ...o,
});

const g = lesGestes(ctx());
dit('dix gestes, dans l’ordre où ils servent',
  ['paiement', 'devis', 'facture', 'bilan', 'photos', 'abonnement', 'foyer', 'rendezvous', 'itineraire', 'promo'],
  g.map((x) => x.cle));

dit('le lien de paiement porte ce qui reste dû, pas le total',
  'Akouavi, il reste 37 000 F sur votre rituel. Voici le lien pour régler par Mobile Money : https://exemple/payer?montant=37000',
  gesteDit(g, 'paiement')?.compose);
dit('le devis dit son numéro et son total',
  'Akouavi, voici le devis DV-2026-0088 du samedi 12 septembre, pour 45 000 F. Dites-nous simplement oui et nous posons le rendez-vous.',
  gesteDit(g, 'devis')?.compose);
dit('le devis attend un oui', 'attend un oui', gesteDit(g, 'devis')?.attend);
dit('la facture dit ce qui reste',
  'Akouavi, voici votre facture FA-2026-0412 du dimanche 6 septembre, pour 17 000 F. Il reste 15 000 F à régler.',
  gesteDit(g, 'facture')?.compose);
dit('la facture voyage en pièce jointe',
  { quoi: 'facture', invoiceId: 'i2', nom: 'Facture FA-2026-0412' }, gesteDit(g, 'facture')?.piece);
dit('le bilan de la séance la plus fraîche', 'à remettre', gesteDit(g, 'bilan')?.attend);
dit('l’itinéraire est le même pour tout le monde',
  'Akouavi, voici comment nous rejoindre : Rue 12.34, Suru-Léré, Cotonou',
  gesteDit(g, 'itineraire')?.compose);
dit('le rendez-vous du soir, pas celui de ce matin',
  'Akouavi, nous vous attendons lundi 14 septembre à 17 h.', gesteDit(g, 'rendezvous')?.compose);

/* ── UN BOUTON ÉTEINT DIT POURQUOI ───────────────────────────────── */
const muet = lesGestes(ctx({ tete: undefined, pieces: [], appts: [], photos: 0 }));
dit('sans fiche, le devis le dit', 'Ce fil n’est rattaché à aucune fiche.', gesteDit(muet, 'devis')?.eteint);
dit('sans fiche, la promotion le dit autrement',
  'Un code appartient à une tête : rattachez d’abord ce fil à une fiche.', gesteDit(muet, 'promo')?.eteint);

const sansRien = lesGestes(ctx({ pieces: [], appts: [], photos: 0 }));
dit('aucun devis en attente', 'Aucun devis n’attend de réponse.', gesteDit(sansRien, 'devis')?.eteint);
dit('aucune facture', 'Aucune facture à son nom.', gesteDit(sansRien, 'facture')?.eteint);
dit('aucun bilan dû', 'Aucun bilan n’attend d’être remis.', gesteDit(sansRien, 'bilan')?.eteint);
dit('aucune photo', 'Aucune photo d’elle dans la Maison.', gesteDit(sansRien, 'photos')?.eteint);
dit('aucun rendez-vous', 'Aucun rendez-vous à venir.', gesteDit(sansRien, 'rendezvous')?.eteint);
dit('pas abonnée', 'Elle n’est pas abonnée.', gesteDit(sansRien, 'abonnement')?.eteint);
dit('aucun foyer', 'Elle n’appartient à aucun compte de famille.', gesteDit(sansRien, 'foyer')?.eteint);
dit('pas d’itinéraire réglé', 'Le chemin du salon n’est pas écrit dans les Paramètres.',
  gesteDit(lesGestes(ctx({ itineraire: '  ' })), 'itineraire')?.eteint);

/* ── LA FENÊTRE FERMÉE ÉTEINT TOUT ───────────────────────────────── */
const ferme = lesGestes(ctx({ fenetreOuverte: false }));
dit('fenêtre fermée, tous les gestes le disent', 10,
  ferme.filter((x) => x.eteint === 'La fenêtre de 24 heures est fermée : seul un modèle approuvé passe.').length);

/* ── LE FOYER DANS LA BARRE ──────────────────────────────────────── */
const avecFoyer = lesGestes(ctx({ foyer: releve, tete: { id: 'c1', name: 'Akouavi K.', familyId: 'f1' } }));
dit('la payeuse reçoit le relevé', null, gesteDit(avecFoyer, 'foyer')?.eteint);
dit('la pastille porte le net, pas le brut', '15 000 F dus', gesteDit(avecFoyer, 'foyer')?.attend);
/* LE RELEVÉ NE PART QU'À LA PAYEUSE : l'envoyer au numéro d'une fille lui
   mettrait les finances de la maison entre les mains. */
const uneFille = lesGestes(ctx({ foyer: releve, tete: { id: 'c2', name: 'L. K.', familyId: 'f1' } }));
dit('une autre tête du foyer ne le reçoit pas',
  'Le relevé part à la payeuse du compte.', gesteDit(uneFille, 'foyer')?.eteint);
dit('les bilans du foyer voyagent avec le relevé',
  'bilans-du-foyer', gesteDit(avecFoyer, 'foyer')?.piece?.quoi);

const avecSeanceNueDansLaBarre = lesGestes(ctx({ foyer: avecSeanceNue }));
dit('le relevé avertit d’un rituel non facturé',
  '1 rituel honoré n’est pas encore facturé : ils n’entrent pas dans ce total.',
  gesteDit(avecSeanceNueDansLaBarre, 'foyer')?.avertit);

/* ── UN COMPTEUR CONTESTABLE S'ANNONCE AVANT L'ENVOI ─────────────── */
const douteux = lesGestes(ctx({ abonnement: { ...pack, couvertsHorsFormule: 2 } }));
dit('le suivi avertit avant d’envoyer un compteur douteux',
  '2 rituels couverts ne décomptent aucun jeton. Corrigez-les avant d’envoyer ce compteur.',
  gesteDit(douteux, 'abonnement')?.avertit);
dit('un compteur sain n’avertit de rien', undefined,
  gesteDit(lesGestes(ctx({ abonnement: pack })), 'abonnement')?.avertit);

if (ko) {
  console.error(`\n${ko} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nLes dix gestes de la conversation tiennent.');
