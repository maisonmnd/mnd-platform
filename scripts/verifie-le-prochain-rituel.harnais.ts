/* SON PROCHAIN RITUEL, ÉPROUVÉ — `node scripts/verifie-le-prochain-rituel.mjs` (et `--prouve`).

   2 novembre 2026, maquette « Remplir les fauteuils », Un · La Caisse. Le cas
   de P. A. est rejoué avec ses dates et ses gestes, sans son nom : un lavage
   toutes les deux à trois semaines, le rituel complet tous les deux mois,
   dont le soin (AQUA LOCKS RITUAL™) est fermé à la vente et se lit sous
   DÀNDÀN™. Elle paie son lavage le mardi 3 novembre 2026.

   Tous les attendus sont écrits en dur, jamais tirés du code éprouvé. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  sesProchainsRituels, leRituelDOffice, sesTroisPlaces, leMaitreDuRituel, leRendezVousDuProchainRituel,
  ceQuiDemandeSaFiche, phraseDeLaPose, versDit, rythmeDit, dureeDite, laPlaceTient,
  RYTHME_PAR_DEFAUT_JOURS, PLANCHER_DU_RYTHME_JOURS, type VenueDuProchainRituel,
} from '../src/shared/prochain-rituel-pur';
import { SUCCESSEURS } from '../src/shared/bascule-de-janvier-pur';
import { placesDuJour, heureHabituelle, type Occupant } from '../src/apps/trone/routes/clients/rdv-fluide-pur';
import { appointmentsStore, poseUnRendezVous, estAConfirmer, poseApresSonHeure, confirmationEstNeuve, type Appointment } from '../src/shared/agenda';

let ko = 0;
/* La console Windows parle cp1252 : tout ce qui sort est ramené à l'ASCII. */
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};

const LAVAGE = 'sv-plt-05-ess-c';
const AQUA = 'aqua-locks-ritual';
const DANDAN = 'sv-plt-10-m';
const REPRISE = 'sv-atl-ii-e';
const SUBLIME = 'sv-gbeji-sublimation';
const KOKO = 'sv-koko-ori';
const FINFIN = 'sv-atl-iv-gbp-c';
const OFFERTS = new Set([LAVAGE, DANDAN, REPRISE, SUBLIME, KOKO, FINFIN]);
const proposable = (id: string) => OFFERTS.has(id);
const successeur = (id: string) => SUCCESSEURS[id];
const estCreation = (id: string) => id === KOKO;
const COMPLET = [LAVAGE, DANDAN, REPRISE, SUBLIME];

const pa = 'pa';
const rdv = (date: string, time: string, status: string, serviceIds: string[], master = '', clientId = pa): VenueDuProchainRituel =>
  ({ clientId, date, time, status, serviceIds, master });
/* SES VENUES, telles que le carnet les porte (lecture du 2 novembre 2026). */
const SES_RDV: VenueDuProchainRituel[] = [
  rdv('2026-06-27', '11:30', 'honoré', [KOKO, LAVAGE, REPRISE, FINFIN]),
  rdv('2026-07-25', '18:30', 'honoré', [LAVAGE]),
  rdv('2026-08-08', '12:00', 'honoré', [LAVAGE, AQUA, REPRISE, SUBLIME]),
  rdv('2026-08-22', '13:00', 'honoré', [LAVAGE], 'Team'),
  rdv('2026-09-11', '15:00', 'honoré', [LAVAGE], 'Team'),
  rdv('2026-10-10', '15:00', 'confirmé', [LAVAGE, AQUA, REPRISE, SUBLIME], 'Team'),
  rdv('2026-10-20', '10:00', 'honoré', [FINFIN], 'Expert', 'une-autre'),
];
/* Le 3 novembre 2026, son lavage pris dans Ma Couronne est réglé à la Caisse :
   il passe honoré (le rendez-vous de Ma Couronne ne porte pas de maître). */
const PAYE_LE = '2026-11-03';
const HONORE_CE_JOUR = [...SES_RDV, rdv(PAYE_LE, '13:00', 'honoré', [LAVAGE])];
const siens = (o: Partial<Parameters<typeof sesProchainsRituels>[0]> = {}) => sesProchainsRituels({
  rdvs: HONORE_CE_JOUR, clientId: pa, aujourdhui: PAYE_LE, proposable, successeur, estCreation,
  payeAujourdhui: { date: PAYE_LE, serviceIds: [LAVAGE] }, cadenceJours: 21, ...o,
});
const jourDit = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const NOMS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/* ══ LE CAS DE P. A. : SES DEUX RITUELS, SON RYTHME ══ */
const r = siens();
dit('deux puces : son lavage du jour, puis son rituel complet (le soin lu sous DÀNDÀN™)',
  [[LAVAGE], COMPLET], r.map((x) => x.ids));
dit('le lavage se lit sur toutes ses venues qui le portent, rituels complets compris (création écartée)',
  { occurrences: 6, rythmeJours: 20, source: 'rituel', derniere: '2026-11-03' },
  { occurrences: r[0].occurrences, rythmeJours: r[0].rythmeJours, source: r[0].source, derniere: r[0].derniere });
dit('... donc vers le lundi 23 novembre 2026, trois semaines après aujourd hui', '2026-11-23', r[0].vers);
dit('le rituel complet se lit sur ses deux rituels complets : 63 jours', { occurrences: 2, rythmeJours: 63, source: 'rituel', derniere: '2026-10-10' },
  { occurrences: r[1].occurrences, rythmeJours: r[1].rythmeJours, source: r[1].source, derniere: r[1].derniere });
dit('... donc vers le samedi 12 décembre 2026', '2026-12-12', r[1].vers);
dit('le lavage revient le plus tôt : il est choisi d office', 0, leRituelDOffice(r));
dit('son maître : le dernier nommé (Team), pas le vide de Ma Couronne', ['Team', 'Team'], r.map((x) => x.maitre));
dit('la même chose quand la vente ne soldait pas son rendez-vous (resté confirmé ce jour)',
  [['2026-11-23', 20], ['2026-12-12', 63]],
  siens({ rdvs: [...SES_RDV, rdv(PAYE_LE, '13:00', 'confirmé', [LAVAGE])] }).map((x) => [x.vers, x.rythmeJours]));
dit('les dits de son rythme', ['toutes les 3 semaines', 'tous les 2 mois'], r.map((x) => rythmeDit(x.rythmeJours)));
dit('la phrase de la date visée dit l année et ne porte aucun tiret long',
  'Vers le lundi 23 novembre 2026, 3 semaines après aujourd’hui : son rythme pour ce rituel, lu sur 6 venues.',
  versDit(r[0], PAYE_LE, jourDit));

/* ══ SES TROIS PLACES, VRAIES ══
   Deux fauteuils ; mardi au vendredi 8 h à 20 h 30, samedi 9 h à 20 h,
   fermé dimanche et lundi ; le mercredi 9 décembre 2026 fermé par exception.
   Le mardi 24 novembre 2026, les deux fauteuils sont pris de 12 h 30 à 14 h ;
   le samedi 21 novembre 2026, un mur est posé pour Team de 12 h à 15 h. */
const ouverture = (iso: string) => {
  const j = new Date(`${iso}T12:00:00`).getDay();
  if (iso === '2026-12-09' || j === 0 || j === 1) return { closed: true, openMin: 0, closeMin: 0 };
  return j === 6 ? { closed: false, openMin: 9 * 60, closeMin: 20 * 60 } : { closed: false, openMin: 8 * 60, closeMin: 20 * 60 + 30 };
};
const OCCUPES: Record<string, Occupant[]> = {
  '2026-11-24': [{ maitre: 'Team', debutMin: 12 * 60 + 30, dureeMin: 90 }, { maitre: 'Expert', debutMin: 12 * 60 + 30, dureeMin: 90 }],
};
const MURS: Record<string, [number, number][]> = { '2026-11-21': [[12 * 60, 15 * 60]] };
const placesDe = (dureeMin: number) => (iso: string) => {
  const p = placesDuJour({ iso, aujourdhui: PAYE_LE, maintenantMin: 15 * 60, ouverture: ouverture(iso), durationMin: dureeMin, occupes: OCCUPES[iso] ?? [], bloques: MURS[iso] ?? [], sieges: 2 });
  return { ferme: p.ferme, heures: p.heures };
};
const sonHeure = heureHabituelle(HONORE_CE_JOUR.filter((a) => a.clientId === pa && a.status === 'honoré'));
dit('son heure habituelle, celle de la fenêtre du rendez-vous', '13:00', sonHeure);
const placesDuLavage = sesTroisPlaces({ vers: r[0].vers, aujourdhui: PAYE_LE, placesDe: placesDe(30), heureHabituelle: sonHeure, jourHabituel: 6, jourDit, nomDuJour: (j) => NOMS[j] });
dit('le lavage : un peu avant, son samedi (le mur de Team écarté), puis la place suivante de sa date (lundi fermé, 13 h pleine)',
  [['2026-11-20', '08:00', 'Un peu avant'], ['2026-11-21', '11:30', 'Son samedi'], ['2026-11-24', '12:00', 'À sa date']],
  placesDuLavage.map((p) => [p.iso, p.heure, p.titre]));
dit('... et sa date dit pourquoi elle a glissé',
  'Son rythme tombe le lundi 23 novembre 2026, jour de fermeture : la place suivante.',
  placesDuLavage.find((p) => p.cle === 'date')?.pourquoi);
dit('chaque place proposée est libre ce jour-là', [true, true, true], placesDuLavage.map((p) => laPlaceTient(placesDe(30)(p.iso), p.heure)));
const placesDuComplet = sesTroisPlaces({ vers: r[1].vers, aujourdhui: PAYE_LE, placesDe: placesDe(300), heureHabituelle: sonHeure, jourHabituel: 6, jourDit, nomDuJour: (j) => NOMS[j] });
dit('le rituel complet (5 h) : le jeudi (le mercredi fermé par exception), sa date un samedi, le samedi suivant',
  [['2026-12-10', '08:00', 'Un peu avant'], ['2026-12-12', '13:00', 'À sa date'], ['2026-12-19', '13:00', 'Son samedi']],
  placesDuComplet.map((p) => [p.iso, p.heure, p.titre]));
dit('une date visée demain : rien aujourd hui, rien avant demain', true,
  sesTroisPlaces({ vers: '2026-11-04', aujourdhui: PAYE_LE, placesDe: placesDe(30), heureHabituelle: '13:00', jourHabituel: null, jourDit, nomDuJour: (j) => NOMS[j] })
    .every((p) => p.iso >= '2026-11-04'));
dit('une place prise entre-temps ne tient plus', false, laPlaceTient({ heures: ['12:00', '14:00'] }, '13:00'));

/* ══ LES RÈGLES, UNE À UNE ══ */
const seul = (dates: string[], o: Partial<Parameters<typeof sesProchainsRituels>[0]> = {}) => sesProchainsRituels({
  rdvs: dates.map((d) => rdv(d, '10:00', 'honoré', [REPRISE])), clientId: pa, aujourdhui: '2026-11-02', proposable, ...o,
})[0];
dit('le rythme est la MÉDIANE des écarts, pas leur moyenne (15, 14, 60 jours)', 15,
  seul(['2026-06-01', '2026-06-16', '2026-06-30', '2026-08-29']).rythmeJours);
dit('jamais moins de deux semaines (écarts de 7 jours)', PLANCHER_DU_RYTHME_JOURS, seul(['2026-10-12', '2026-10-19', '2026-10-26']).rythmeJours);
dit('une seule venue : sa cadence générale', { rythmeJours: 35, source: 'cadence' },
  (({ rythmeJours, source }) => ({ rythmeJours, source }))(seul(['2026-10-10'], { cadenceJours: 35 })));
dit('ni rythme ni cadence : vingt-huit jours', { rythmeJours: RYTHME_PAR_DEFAUT_JOURS, source: 'defaut', vers: '2026-11-07' },
  (({ rythmeJours, source, vers }) => ({ rythmeJours, source, vers }))(seul(['2026-10-10'], { cadenceJours: null })));
dit('vingt-huit, et non trente', 28, RYTHME_PAR_DEFAUT_JOURS);
const enRetard = seul(['2026-04-01', '2026-05-01']);
dit('une date dépassée se propose dès demain, l attendue reste dite', { attendu: '2026-05-31', vers: '2026-11-03' },
  { attendu: enRetard.attendu, vers: enRetard.vers });
dit('... et la phrase le dit', 'Dès demain : son rythme (4 semaines) l’attendait le dimanche 31 mai 2026.', versDit(enRetard, '2026-11-02', jourDit));
dit('la date visée part de la DERNIÈRE venue', '2026-11-16', seul(['2026-09-14', '2026-10-05', '2026-10-26']).vers);
dit('une séance de suite ne compte pas comme une venue', 21, sesProchainsRituels({
  rdvs: [rdv('2026-09-14', '10:00', 'honoré', [REPRISE]), { ...rdv('2026-09-21', '10:00', 'honoré', [REPRISE]), seriesIndex: 2 }, rdv('2026-10-05', '10:00', 'honoré', [REPRISE])],
  clientId: pa, aujourdhui: '2026-11-02', proposable,
})[0].rythmeJours);
dit('un annulé et un rendez-vous à venir ne comptent pas', 21, sesProchainsRituels({
  rdvs: [rdv('2026-09-14', '10:00', 'honoré', [REPRISE]), rdv('2026-09-20', '10:00', 'annulé', [REPRISE]), rdv('2026-10-05', '10:00', 'honoré', [REPRISE]), rdv('2026-11-20', '10:00', 'confirmé', [REPRISE])],
  clientId: pa, aujourdhui: '2026-11-02', proposable,
})[0].rythmeJours);
dit('le plus tôt d office ; à égalité, le premier', [1, 0], [
  leRituelDOffice([{ ...r[0], vers: '2026-12-01' }, { ...r[1], vers: '2026-11-20' }]),
  leRituelDOffice([{ ...r[0], vers: '2026-11-20' }, { ...r[1], vers: '2026-11-20' }]),
]);
dit('rien à proposer : aucun choisi', -1, leRituelDOffice([]));
dit('un soin venu une fois, « dès demain » par sa cadence, ne passe pas devant le lavage mesuré', 1,
  leRituelDOffice([{ ...r[1], source: 'cadence', vers: '2026-11-04' }, { ...r[0], vers: '2026-11-23' }]));
dit('... sauf quand aucun rituel n est mesuré : le plus tôt', 0,
  leRituelDOffice([{ ...r[1], source: 'cadence', vers: '2026-11-04' }, { ...r[0], source: 'defaut', vers: '2026-11-23' }]));
dit('les durées dites', ['10 jours', '3 semaines', '2 mois'], [dureeDite(10), dureeDite(20), dureeDite(63)]);

/* ── SON MAÎTRE ── */
const maitres = ['Team', 'Expert'];
dit('un SÍNSIN va chez Team, même si elle venait chez Expert', 'Team',
  leMaitreDuRituel({ habituel: 'Expert', noms: ['SÍNSIN™ Essentiel · La Reprise'], maitres, parDefaut: 'Expert' }));
dit('sinon son maître habituel', 'Expert', leMaitreDuRituel({ habituel: 'Expert', noms: ['KLƆKLƆ™ Essentiel'], maitres, parDefaut: 'Team' }));
dit('un maître que la branche ne porte plus : celui qu elle désigne', 'Team',
  leMaitreDuRituel({ habituel: 'Ancienne', noms: ['KLƆKLƆ™ Essentiel'], maitres, parDefaut: 'Team' }));
dit('aucun maître habituel : celui que la branche désigne', 'Expert', leMaitreDuRituel({ habituel: '', noms: ['KLƆKLƆ™ Essentiel'], maitres, parDefaut: 'Expert' }));

/* ── CE QUI DEMANDE SA FICHE ── */
dit('chaque geste de la fenêtre renvoie à sa fiche', [true, true, true, true, true, true, false], [
  ceQuiDemandeSaFiche({ formule: true }), ceQuiDemandeSaFiche({ remiseFamillePct: 15 }), ceQuiDemandeSaFiche({ prixLibre: true }),
  ceQuiDemandeSaFiche({ seancesIncluses: true }), ceQuiDemandeSaFiche({ salonPrive: true }), ceQuiDemandeSaFiche({ paliersStricts: true }),
  ceQuiDemandeSaFiche({ remiseFamillePct: 0 }),
].map((x) => x !== null));

/* ── LE RENDEZ-VOUS, CONSTRUIT EN UN SEUL ENDROIT ── */
const construit = leRendezVousDuProchainRituel({
  id: 'r1', branchId: 'b1', clientId: pa, serviceIds: [LAVAGE], place: { iso: '2026-11-24', heure: '12:00' }, master: 'Team',
  longueur: 'mi-long', dureeMin: 30, priceXof: 10000, depositServiceIds: [], depositXof: 0,
});
dit('posé confirmé, au Trône, à la place touchée, à son prix', {
  status: 'confirmé', source: 'trone', date: '2026-11-24', time: '12:00', master: 'Team', priceXof: 10000, dureeMin: 30, longueur: 'mi-long',
}, {
  status: construit.status, source: construit.source, date: construit.date, time: construit.time, master: construit.master,
  priceXof: construit.priceXof, dureeMin: construit.dureeMin, longueur: construit.longueur,
});
dit('... sans « sans confirmation », sans code ni remise (l offre du mercredi se branchera ici)', [false, false, false, false, false],
  ['sansConfirmation', 'codeOffre', 'remisesLignes', 'discountPct', 'discountXof'].map((k) => k in construit));
dit('la phrase entière, avec l année, sans tiret long', 'Posé, confirmé : mardi 17 novembre 2026 à 13 h.', phraseDeLaPose('2026-11-17', '13:00'));
dit('... et une demi-heure', 'Posé, confirmé : mardi 24 novembre 2026 à 12 h 30.', phraseDeLaPose('2026-11-24', '12:30'));

/* ── LE GESTE D'ÉCRITURE, LE MÊME QUE LA FENÊTRE ──
   Une date lointaine : le banc ne vieillit pas avec le calendrier. */
const maintenant = Date.now();
appointmentsStore.set([]);
const aVenir: Appointment = { ...construit, date: '2099-01-06', time: '13:00' };
const pose = poseUnRendezVous(aVenir, { suites: [{ ...aVenir, id: 'r2', date: '2099-02-03' }] });
const carnet = appointmentsStore.get();
dit('la pose s écrit au carnet, estampillée, avec ses séances incluses', [2, true, true],
  [carnet.length, !!carnet.find((x) => x.id === 'r1')?.creeLe, !!carnet.find((x) => x.id === 'r2')?.creeLe]);
dit('le rendez-vous rendu est celui du carnet', carnet.find((x) => x.id === 'r1'), pose);
dit('la confirmation-rdv le balaie : confirmé, à venir, posé avant son heure, neuf', [true, false, true],
  [estAConfirmer(pose, maintenant), poseApresSonHeure(pose), confirmationEstNeuve(pose, undefined, maintenant, 2 * 60 * 60 * 1000)]);
appointmentsStore.set([]);
poseUnRendezVous(aVenir, { attache: (l) => l.map((x) => (x.id === 'r1' ? { ...x, seriesId: 's1' } : x)) });
dit('la série se rattache après l écriture, quand on le demande', 's1', appointmentsStore.get().find((x) => x.id === 'r1')?.seriesId);

/* ══ LE CÂBLAGE, LU DANS LES VRAIS FICHIERS ══ */
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const lis = (env: string, rel: string) => sansCommentaires(readFileSync(process.env[env] ?? path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n'));
const bloc = lis('PROCHAIN_BLOC', 'src/apps/trone/routes/vente/SonProchainRituel.tsx');
const caisse = lis('PROCHAIN_CAISSE', 'src/apps/trone/routes/vente/Caisse.tsx');
const fenetre = lis('PROCHAIN_FENETRE', 'src/apps/trone/routes/clients/_shared.tsx');

const iRelit = bloc.indexOf('if (!laPlaceTient(fraiches, p.heure)) {');
const iConstruit = bloc.indexOf('const rdv = leRendezVousDuProchainRituel({');
const iPose = bloc.indexOf('const pose = poseUnRendezVous(rdv);');
dit('le toucher relit la place sur le carnet DU MOMENT, puis construit, puis pose par le geste de la fenêtre', [true, true, true],
  [bloc.includes('const fraiches = placesDe(appointmentsStore.get(), blocagesStore.get(), tarif.dureeMin, maitre)(p.iso);'),
    iRelit > 0 && iRelit < iConstruit && iConstruit < iPose, !/appointmentsStore\.set\(/.test(bloc)]);
dit('un rituel qui demande sa fiche ouvre la fenêtre sur la place, sans rien poser', true,
  /if \(casAPart\(p\.iso\)\) \{\n\s*onALaMain\(\{ clientId, serviceIds: rituel\.ids, date: p\.iso, time: p\.heure, master: maitre \}\);\n\s*return;\n\s*\}/.test(bloc)
    && bloc.indexOf('if (casAPart(p.iso)) {') < iPose);
dit('« Pas maintenant » ne fait que fermer', true, bloc.includes('onClick={() => setFerme(true)}>Pas maintenant</Button>'));
dit('le bloc lit ses rituels comme Ma Couronne : successeurs, créations, paiement du jour, cadence', [true, true, true, true], [
  bloc.includes('successeur: (id) => SUCCESSEURS[id],'),
  bloc.includes('estCreation: (id) => { const sv = byId.get(id); return !!sv && fondeLaCouronne(sv); },'),
  bloc.includes('payeAujourdhui: { date: jour, serviceIds },'),
  bloc.includes('const c = predictNextVisit(sesVenues, clients, clientId, aujourdhui);'),
]);
dit('le prix et la durée de la fenêtre, avec la longueur du jour', [true, true, true], [
  bloc.includes('const t = tarifsDuRituel({ serviceIds: [...ids], longueur }, {'),
  bloc.includes('const prixXof = brutDuRituel({ serviceIds: [...ids] }, byId, t);'),
  bloc.includes('dureeMin: Math.max(15, t.chosen.reduce((n, sv) => n + personalDurationMin(sv, t.pricing), 0) || 60),'),
]);
dit('les places de la fenêtre : fauteuils, ouverture du jour, murs du maître, annulés écartés', [true, true, true, true], [
  /placesDuJour\(\{[\s\S]*?ouverture: openingForIso\(iso\),[\s\S]*?sieges,\n\s*\}\)/.test(bloc),
  bloc.includes('bloques: plagesBloquees(murs, branch.id, iso, qui),'),
  bloc.includes(".filter((a) => a.branchId === branch.id && a.date === iso && a.status !== 'annulé')"),
  bloc.includes('heureHabituelle: heureHabituelle(sesVenues),'),
]);
dit('aucun « sansConfirmation » à la Caisse : la confirmation habituelle part', false, /sansConfirmation/.test(bloc));
/* Les commentaires ôtés, il reste le code, ses chaînes et le texte du JSX :
   tout ce que l'écran peut dire. */
dit('aucun tiret long ni émoji dans ce que l écran dit', [false, false], [bloc.includes('—'), /\p{Extended_Pictographic}/u.test(bloc)]);
dit('la Caisse monte le bloc avec le jour de la vente et la longueur du ticket', [true, true, true], [
  /<SonProchainRituel\n\s*key=\{reussite\.invoiceId\}\n\s*clientId=\{reussite\.clientId\}\n\s*serviceIds=\{reussite\.serviceIds\}\n\s*jour=\{reussite\.jour\}\n\s*longueur=\{reussite\.longueur\}/.test(caisse),
  caisse.includes('jour: dateVente,\n      longueur,\n    });'),
  caisse.includes('<RdvModal title="Son prochain rendez-vous" initial={rdvPour}'),
]);
dit('la fenêtre du rendez-vous pose par le même geste, la confirmation décochée gardée', [true, true, false], [
  fenetre.includes('poseUnRendezVous(created, {'),
  fenetre.includes("sansConfirmation: chosenStatus === 'confirmé' && !avecConfirmation ? true : undefined,"),
  fenetre.includes('estampilleLaPose(created)'),
]);

if (ko) { console.log(`\n${ko} ECHEC(S).`); process.exit(1); }
console.log('\nTout est juste.');
