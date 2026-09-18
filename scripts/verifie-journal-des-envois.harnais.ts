/* LE JOURNAL DES ENVOIS, ÉPROUVÉ — `node scripts/verifie-journal-des-envois.mjs`.

   « Comment retrouver toutes les confirmations de RDV WhatsApp qui partent
   chez la cliente ? » (Yéman, 18 septembre 2026). Le journal lit la table
   `envois` : ce qu'un message est devenu, pourquoi un échec a échoué, ce
   qu'un jour compte. Un « lu » pris pour un échec, un motif anglais, un
   envoi de minuit rangé dans la veille : les trois fautes se lisent ici.
   Les noms sont des initiales, les numéros fictifs. */
import {
  devenuDe, estARegarder, motifEnClair, jourDuSalon, jourDecale, lignesDuJournal, envoisDeLaPeriode,
  compteDuJournal, estEnvoiAutomatique, modeleDit, typeDit, type EnvoiLu,
} from '../src/shared/envois';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── CE QUE LE MESSAGE EST DEVENU : l'accusé de Meta l'emporte ── */
dit('envoyé, sans accusé encore : en route', 'en-route', devenuDe({ statut: 'envoyé' }));
dit('envoyé puis remis', 'remis', devenuDe({ statut: 'envoyé', etat: 'remis' }));
dit('envoyé puis lu', 'lu', devenuDe({ statut: 'envoyé', etat: 'lu' }));
dit('le webhook a rendu non remis (et mis le statut en échec)', 'non-remis', devenuDe({ statut: 'échec', etat: 'non-remis' }));
dit('refusé par Meta à l’envoi', 'echec', devenuDe({ statut: 'échec' }));
dit('pas d’application pour la notification : personne à joindre', 'personne', devenuDe({ statut: 'sans-abonnement' }));
dit('pas de numéro sur la fiche : personne à joindre', 'personne', devenuDe({ statut: 'sans-numero' }));
dit('à regarder : l’échec et le non remis, rien d’autre', [true, true, false, false, false],
  (['echec', 'non-remis', 'lu', 'personne', 'en-route'] as const).map(estARegarder));

/* ── LE MOTIF, EN FRANÇAIS — le code d'abord, le texte à défaut ── */
dit('code 131026 : pas de WhatsApp', 'ce numéro n’a pas WhatsApp, ou ne peut pas recevoir ce message',
  motifEnClair({ statut: 'échec', canal: 'whatsapp', codeMeta: 131026, detail: 'Message undeliverable' }));
dit('le titre seul, sans code (accusé du webhook) : même motif', 'ce numéro n’a pas WhatsApp, ou ne peut pas recevoir ce message',
  motifEnClair({ statut: 'échec', canal: 'whatsapp', etat: 'non-remis', detail: 'Message undeliverable.' }));
dit('code 132001 : modèle pas approuvé', 'modèle pas encore approuvé chez Meta, ou nom de modèle inconnu',
  motifEnClair({ statut: 'échec', canal: 'whatsapp', codeMeta: 132001, detail: '(#132001) Template name does not exist in the translation' }));
dit('texte d’avant le 18 septembre, sans code : reconnu quand même', 'modèle pas encore approuvé chez Meta, ou nom de modèle inconnu',
  motifEnClair({ statut: 'échec', canal: 'whatsapp', detail: '(#132001) Template name does not exist in the translation' }));
dit('jeton expiré', 'jeton Meta expiré : à renouveler dans les secrets',
  motifEnClair({ statut: 'échec', canal: 'whatsapp', codeMeta: 190, detail: 'Error validating access token: Session has expired' }));
dit('coupure réseau', 'coupure réseau : retenté au prochain passage',
  motifEnClair({ statut: 'échec', canal: 'whatsapp', detail: 'TypeError: fetch failed' }));
dit('sans numéro', 'pas de numéro sur la fiche', motifEnClair({ statut: 'sans-numero', canal: 'whatsapp' }));
dit('notification sans application', 'pas d’application Ma Couronne', motifEnClair({ statut: 'sans-abonnement', canal: 'push' }));
dit('un motif inconnu se montre tel quel, jamais deviné', 'Something new happened',
  motifEnClair({ statut: 'échec', canal: 'whatsapp', detail: 'Something new happened' }));
dit('un échec sans rien : on le dit', 'motif non précisé par Meta', motifEnClair({ statut: 'échec', canal: 'whatsapp' }));
dit('un message lu n’a pas de motif', '', motifEnClair({ statut: 'envoyé', etat: 'lu', canal: 'whatsapp' }));

/* ── LE JOUR, À L'HEURE DU SALON ── */
dit('00 h 30 à Cotonou le 18, c’est 23 h 30 UTC le 17 : rangé le 18', '2026-09-18', jourDuSalon('2026-09-17T23:30:00.000Z'));
dit('la veille du 1er octobre', '2026-09-30', jourDecale('2026-10-01', -1));
dit('six jours avant le 18', '2026-09-12', jourDecale('2026-09-18', -6));

/* ── LA PÉRIODE, LE FILTRE, LES COMPTES ── */
const e = (o: Partial<EnvoiLu>): EnvoiLu => ({ id: o.id ?? 'x', type: 'confirmation', canal: 'whatsapp', statut: 'envoyé', quand: '2026-09-18T08:12:00.000Z', ...o });
const journal: EnvoiLu[] = [
  e({ id: 'c1', etat: 'lu' }),
  e({ id: 'c1p', canal: 'push', statut: 'sans-abonnement' }),
  e({ id: 'c2', etat: 'remis', quand: '2026-09-18T09:32:00.000Z' }),
  e({ id: 'a1', type: 'accuse', etat: 'lu', quand: '2026-09-18T10:05:00.000Z' }),
  e({ id: 'a2', type: 'accuse', statut: 'échec', codeMeta: 131026, quand: '2026-09-18T12:47:00.000Z' }),
  e({ id: 'r1', type: 'rappel-j1', quand: '2026-09-18T17:00:00.000Z' }),
  e({ id: 'h1', type: 'accuse', etat: 'lu', quand: '2026-09-17T20:40:00.000Z' }),
  e({ id: 'v1', type: 'rappel-j1', statut: 'échec', etat: 'non-remis', quand: '2026-09-12T17:00:00.000Z' }),
  e({ id: 'vieux', quand: '2026-09-01T10:00:00.000Z' }),
];
const auj = '2026-09-18';
dit('aujourd’hui : six lignes', 6, envoisDeLaPeriode(journal, 'aujourdhui', auj).length);
dit('hier : l’accusé de 21 h 40', ['h1'], envoisDeLaPeriode(journal, 'hier', auj).map((x) => x.id));
dit('sept jours : tout sauf le 1er septembre', 8, envoisDeLaPeriode(journal, 'semaine', auj).length);
dit('les lignes vont du plus récent au plus ancien', ['r1', 'a2', 'a1', 'c2', 'c1', 'c1p'],
  lignesDuJournal(journal, { jour: 'aujourdhui', type: 'tout', seulementARegarder: false }, auj).map((x) => x.id));
dit('filtre : les accusés du jour', ['a2', 'a1'],
  lignesDuJournal(journal, { jour: 'aujourdhui', type: 'accuse', seulementARegarder: false }, auj).map((x) => x.id));
dit('filtre : seulement ce qui est à regarder, sur la semaine', ['a2', 'v1'],
  lignesDuJournal(journal, { jour: 'semaine', type: 'tout', seulementARegarder: true }, auj).map((x) => x.id));
dit('le compte du jour', { partis: 4, remis: 3, lus: 2, enRoute: 1, aRegarder: 1 },
  compteDuJournal(envoisDeLaPeriode(journal, 'aujourdhui', auj)));

/* ── LE FIL — les deux signatures des envois automatiques se lisent pareil ── */
dit('« Le Trône » est automatique', true, estEnvoiAutomatique('Le Trône'));
dit('« la Maison, automatiquement » (les rappels) aussi', true, estEnvoiAutomatique('la Maison, automatiquement'));
dit('une personne de l’équipe, non', false, estEnvoiAutomatique('accueil@maison.bj'));
dit('le modèle se dit en français', ['confirmation', 'accusé de demande', 'rappel de la veille'],
  ['confirmation_rdv', 'demande_recue', 'rappel_rdv'].map(modeleDit));
dit('un type se dit en français', 'Accusé de demande', typeDit('accuse'));

if (ko) {
  console.log(`\n${ko} échec(s).`);
  process.exit(1);
}
console.log('\nLe journal des envois tient.');
