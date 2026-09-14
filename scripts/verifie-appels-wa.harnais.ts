/* LES APPELS WHATSAPP, ÉPROUVÉS — `node scripts/verifie-appels-wa.mjs`.

   « N'oublie pas que je dois recevoir les appels WhatsApp » (Yéman,
   14 septembre 2026). Maquette `public/maquette-decrocher-dans-le-trone.html`.

   Trois fautes coûteraient cher, et se lisent toutes ici : un panneau qui
   sonne pour toujours parce que le message de fin s'est perdu, deux rappels
   posés pour un seul appel manqué, et un appel « pris » que personne n'a
   décroché. */
import {
  etatDeMeta, SONNERIE_MAX_MS, sonneEncore, appelQuiSonne, dejaPris,
  dureeDite, dureeDe, motifDuRappel, meriteUnRappel, appelsDeLaTete,
  type AppelWa,
} from '../src/shared/appels-wa';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const T0 = Date.parse('2026-09-14T14:00:00.000Z');
const ap = (o: Partial<AppelWa> & { id: string }): AppelWa => ({
  callId: o.id, numero: '22990000001', sens: 'entrant', etat: 'sonne',
  sonneLe: new Date(T0).toISOString(), ...o,
} as AppelWa);

/* ── CE QUE META DIT, TRADUIT UNE FOIS ──────────────────────────── */
dit('ça sonne', 'sonne', etatDeMeta('ringing'));
dit('on a décroché', 'pris', etatDeMeta('connect'));
dit('c’est fini', 'fini', etatDeMeta('terminate'));
dit('refusé', 'refuse', etatDeMeta('rejected'));
dit('la casse ne compte pas', 'sonne', etatDeMeta('RINGING'));
/* UN VERDICT INCONNU NE DEVIENT JAMAIS « PRIS » : mieux vaut une Maison qui
   doute qu'une Maison qui croit avoir répondu. */
dit('un mot inconnu ne devient rien', null, etatDeMeta('quelque_chose'));
dit('rien du tout ne devient rien', null, etatDeMeta(undefined));

/* ── COMBIEN DE TEMPS ÇA SONNE ──────────────────────────────────── */
dit('quarante-cinq secondes', 45000, SONNERIE_MAX_MS);
dit('il sonne encore après dix secondes', true, sonneEncore(ap({ id: 'a1' }), T0 + 10_000));
/* UN PANNEAU QUI SONNE POUR TOUJOURS EST PIRE QU'AUCUN PANNEAU : si le
   message de fin s'est perdu, l'heure tranche à la place de Meta. */
dit('il ne sonne plus après une minute', false, sonneEncore(ap({ id: 'a1' }), T0 + 60_000));
dit('un appel pris ne sonne plus', false,
  sonneEncore(ap({ id: 'a1', etat: 'pris' }), T0 + 1000));

/* ── LEQUEL FAIT SONNER LE POSTE ────────────────────────────────── */
const enCours = [
  ap({ id: 'vieux', sonneLe: new Date(T0 - 5000).toISOString() }),
  ap({ id: 'neuf', sonneLe: new Date(T0 - 1000).toISOString() }),
  ap({ id: 'fini', etat: 'fini' }),
  ap({ id: 'sortant', sens: 'sortant' }),
];
/* UN SEUL PANNEAU À LA FOIS, et c'est le plus récent : deux panneaux
   superposés ne se répondent pas, ils se gênent. */
dit('le plus récent sonne', 'neuf', appelQuiSonne(enCours, T0)?.id);
dit('un appel fini ne sonne pas', true, appelQuiSonne(enCours, T0)?.id !== 'fini');
dit('un appel qu’on passe ne sonne pas', true, appelQuiSonne(enCours, T0)?.id !== 'sortant');
dit('rien qui sonne, rien à montrer', undefined, appelQuiSonne(enCours, T0 + 120_000)?.id);
dit('une autre branche ne sonne pas ici', undefined,
  appelQuiSonne([ap({ id: 'ailleurs', branchId: 'b2' })], T0, 'b1')?.id);
dit('un appel sans branche sonne partout', 'partout',
  appelQuiSonne([ap({ id: 'partout' })], T0, 'b1')?.id);

/* ── LE PREMIER QUI DÉCROCHE GAGNE ──────────────────────────────── */
dit('personne ne l’a pris', null, dejaPris(ap({ id: 'a1' })));
dit('Rita l’a pris', 'rita@mnd.bj', dejaPris(ap({ id: 'a1', prisPar: 'rita@mnd.bj' })));
dit('sans appel, personne', null, dejaPris(undefined));

/* ── CE QUI RESTE D'UN APPEL ────────────────────────────────────── */
dit('moins d’une minute se dit en secondes', '40 s', dureeDite(40));
dit('une minute ronde', '3 min', dureeDite(180));
dit('une minute et des secondes', '3 min 20', dureeDite(200));
dit('rien ne fait zéro seconde', '0 s', dureeDite(undefined));

dit('la durée se calcule des deux bornes', 200, dureeDe(ap({
  id: 'a1', prisLe: new Date(T0).toISOString(), finiLe: new Date(T0 + 200_000).toISOString(),
})));
/* SANS L'UNE DES DEUX BORNES, ON NE DEVINE PAS : une durée inventée
   finirait dans un décompte. */
dit('sans début, aucune durée', undefined, dureeDe(ap({ id: 'a1', finiLe: new Date(T0).toISOString() })));
dit('sans fin, aucune durée', undefined, dureeDe(ap({ id: 'a1', prisLe: new Date(T0).toISOString() })));

/* ── LE RAPPEL D'UN APPEL MANQUÉ ────────────────────────────────── */
dit('un manqué mérite un rappel', true, meriteUnRappel(ap({ id: 'a1', etat: 'manque' })));
dit('un refusé aussi', true, meriteUnRappel(ap({ id: 'a1', etat: 'refuse' })));
/* UN APPEL « FINI » QUE PERSONNE N'A PRIS est un manqué qui ne dit pas son
   nom : Meta annonce parfois la fin sans jamais dire « manqué ». */
dit('un fini que personne n’a pris aussi', true, meriteUnRappel(ap({ id: 'a1', etat: 'fini' })));
dit('un appel pris n’en mérite pas', false,
  meriteUnRappel(ap({ id: 'a1', etat: 'fini', prisPar: 'rita@mnd.bj' })));
/* META RÉPÈTE VOLONTIERS SES ÉVÉNEMENTS : deux rappels pour un appel
   feraient rappeler deux fois la même cliente. */
dit('un rappel déjà posé n’en pose pas un second', false,
  meriteUnRappel(ap({ id: 'a1', etat: 'manque', rappelId: 'ap-1' })));
dit('un appel qui sonne encore n’en mérite pas', false, meriteUnRappel(ap({ id: 'a1' })));
dit('un appel qu’on passe n’en mérite pas', false,
  meriteUnRappel(ap({ id: 'a1', sens: 'sortant', etat: 'manque' })));

dit('le motif dit ce qu’on sait, et rien de plus',
  true, motifDuRappel(ap({ id: 'a1' })).startsWith('Appel WhatsApp manqué de '));
dit('… et il ne devine pas ce qu’elle voulait',
  true, motifDuRappel(ap({ id: 'a1' })).includes('On ne sait pas encore'));

/* ── SES APPELS À ELLE ──────────────────────────────────────────── */
const tous = [
  ap({ id: 'p1', clientId: 'c1', sonneLe: new Date(T0).toISOString() }),
  ap({ id: 'p2', numero: '22990000002', sonneLe: new Date(T0 + 1000).toISOString() }),
  ap({ id: 'p3', numero: '22990000009' }),
];
/* LE RAPPROCHEMENT SE FAIT PAR NUMÉRO AUTANT QUE PAR FICHE : Meta ne connaît
   que le numéro, et la fiche peut être rattachée après coup. */
dit('ses appels, par fiche et par numéro, du plus récent au plus ancien',
  ['p2', 'p1'], appelsDeLaTete(tous, 'c1', ['+229 90 00 00 02']).map((a) => a.id));
dit('le numéro d’une autre ne compte pas', ['p1'],
  appelsDeLaTete(tous, 'c1', []).map((a) => a.id));

if (ko) {
  console.error(`\n${ko} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nLes appels WhatsApp tiennent.');
