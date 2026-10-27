/* GÉRARD, ÉPROUVÉ — 26 octobre 2026.
   `node scripts/verifie-gerard.mjs` (et `--prouve`).

   Le cerveau de Gérard sur des fiches fabriquées dont on connaît la
   réponse : le fil, l'envie, garder un RDV, l'anniversaire, tout combiner,
   les jours creux, les relances, Noël, la question franche ; puis l'écran
   et la barre. Les clientes sont des initiales. */
import { readFileSync } from 'node:fs';
import {
  ANNIV_VALABLE_JOURS, ENDORMIE_FOIS_MAX, MODELES_DE_GERARD, REMISES_PAR_SEMAINE,
  choisisLEnvie, dateDeCadence, estUneQuestionFranche, familleDuNom, filDeLaCliente, heureDite, jourDit, joursCreux, planDuJour,
  plusJours, remplis, situationDuJour,
  EST_UN_SERVICE, PLAFOND_FRANCS_PAR_DEFAUT, plafondDeLaSemaine,
  reglagesLus, estSaisonDesFetes, ligneALaMain, ligneDeNotification, passageDu, servie, texteSansSignature, tracesDesEnvois,
  anniversaireDuJour, anniversairesDuJour, moisEtJourDe, partSeule, ligneWhatsApp, IMAGE_DE_LA_CARTE,
  type ContexteDeGerard, type FicheDeGerard, type RdvDeGerard,
} from '../src/shared/gerard-pur';
import { attendUneReponse, derniersMessagesHorsService, dernieresRelancesDeFacture, jourACotonou } from '../src/shared/dernier-message-pur';
import { estEnvoiAutomatique } from '../src/shared/envois';
import { codeDeLaSituation, lisLAssistant, lundiDe, type EntreesDeLAssistant } from '../src/shared/assistant-lecture-pur';
import { lignesDuPassage, lignesNeuves, remisesAFabriquer, serveurVivant } from '../src/shared/assistant-passage-pur';
import { REGLES_PAR_DEFAUT } from '../src/shared/salle-des-envois';
import { ACCUSE_DU_STOP, charge, estUnStop, GESTE_DU_LIBELLE, lisLeBoutonDeLAssistant, retourDuBouton, reponseDuGeste } from '../src/shared/assistant-reponses-pur';
import { copiesAJour } from './copie-dans-le-centre.mjs';
import { gerardSeTait } from '../src/shared/gerard-entre-deux-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const A = '2026-10-26';
const venue = (date: string, familles: RdvDeGerard['familles'] = ['resserrage'], time = '10:00'): RdvDeGerard => ({ id: `v-${date}`, date, time, status: 'honoré', familles, venu: true });
const fiche = (o: Partial<FicheDeGerard> = {}): FicheDeGerard => ({
  id: 'c1', appel: 'Madame K.', soinDit: 'resserrage des racines', accord: true, stop: false, couronne: false, telephone: true, ecartee: false,
  soucis: [], rdvs: [venue(plusJours(A, -100)), venue(plusJours(A, -30))], traces: [], cadence: { iso: plusJours(A, 26), rythmeJours: 56 }, ...o,
});
const places = [{ iso: '2026-10-28', heure: '10:00' }, { iso: '2026-10-29', heure: '14:00' }];
const ctx = (o: Partial<ContexteDeGerard> = {}): ContexteDeGerard => ({ aujourdhui: A, creux: [], remisesRestantes: REMISES_PAR_SEMAINE, placesDe: () => places, ...o });
const sit = (f: FicheDeGerard, c: ContexteDeGerard = ctx()) => situationDuJour(f, c);

/* ── 1. Les mots ── */
dit('les familles d’après le nom du catalogue', ['resserrage', 'hydratation', 'lavage', 'coiffure', 'couleur', 'autre'],
  ['SÍNSIN™ Essentiel · La Reprise', 'DÀNDÀN™ · Le Soin Hydratant', 'KLƆKLƆ™ Essentiel · « Le Souffle »', 'Coiffure Événement', 'YÈKPÈ™ Couleur', 'Droit de service · Shampoing apporté · Essentiel'].map(familleDuNom));
dit('une date de cliente porte l’année, le 1er se dit « 1er »', ['mardi 3 novembre 2026', 'mardi 1er décembre 2026', '12 h 15', '10 h'],
  [jourDit('2026-11-03'), jourDit('2026-12-01'), heureDite('12:15'), heureDite('10:00')]);
dit('un modèle se remplit variable par variable, et finit par la signature « Maison MND », jamais « Gérard »', 'Bonjour Madame K., votre resserrage des racines est mardi 3 novembre 2026 à 10 h. C’est toujours bon pour vous ?\n\nMaison MND',
  remplis(MODELES_DE_GERARD.garder.corps, ['Madame K.', 'resserrage des racines', 'mardi 3 novembre 2026 à 10 h']));
dit('chaque modèle a un nom Meta, au plus trois boutons, jamais de prix ni de pourcentage, jamais le mot « code » (Meta le rangerait en Authentification), jamais « Gérard » ni « devait revenir »', true,
  Object.values(MODELES_DE_GERARD).every((m) => /^(gerard_[a-z_]+|nouvelles_de_la_maison)$/.test(m.nom) && m.boutons.length <= 3 && !/\d\s?(F|FCFA|XOF)\b|%/.test(m.corps) && !/\bcodes?\b/i.test(m.corps)
    && !/Gérard|devait revenir|arrive vers/.test(m.corps)));
dit('sept plus un, et deux cartes (27 octobre 2026) : dix modèles, un seul utilitaire, « garder » ; un seul genre de service ; trois portent la carte en image', [10, ['gerard_garder'], ['garder'], ['anniversaire', 'carte', 'carte-foyer']],
  [Object.keys(MODELES_DE_GERARD).length, Object.values(MODELES_DE_GERARD).filter((m) => m.categorie === 'UTILITY').map((m) => m.nom),
    Object.entries(EST_UN_SERVICE).filter(([, v]) => v).map(([k]) => k), Object.entries(MODELES_DE_GERARD).filter(([, m]) => m.enTete === 'image').map(([k]) => k)]);

/* ── 2. La date de cadence et le fil ── */
const rdvPose = { id: 'p', date: '2026-12-08', time: '10:00', status: 'confirmé', familles: ['resserrage'], venu: false } as RdvDeGerard;
dit('la date de cadence : le RDV posé d’abord, sinon la Cadence', [{ iso: '2026-12-08', posee: true }, { iso: plusJours(A, 26), posee: false }],
  [dateDeCadence(fiche({ rdvs: [venue('2026-09-15'), rdvPose] }), A), dateDeCadence(fiche(), A)]);
const fil8 = filDeLaCliente(fiche({ rdvs: [venue('2026-10-06')], cadence: { iso: '2026-12-01', rythmeJours: 56 } }), A);
dit('le fil de 8 semaines : bilan, point d’après, une envie à J+30, tout combiner à J+49, la date', [[0, 'La séance'], [1, 'Le bilan de la séance'], [7, 'Le point d’après'], [30, 'Une envie'], [49, 'Tout combiner'], [56, 'Sa date de cadence']],
  fil8.map((p) => [p.jour, p.quoi]));
const fil12 = filDeLaCliente(fiche({ rdvs: [venue('2026-09-15'), rdvPose] }), A);
dit('le fil de 12 semaines, RDV posé : deux envies, le point d’avant (déjà au Trône), garder à J-2', [30, 60, 77, 82, 84],
  fil12.filter((p) => p.jour > 7).map((p) => p.jour));
dit('... le point d’avant et le RDV sont « déjà au Trône », les envies et garder sont à Gérard', [false, false, true, false, true],
  fil12.filter((p) => p.jour > 7).map((p) => p.existant));

/* ── 3. Garder un RDV ── */
const rdvDans2 = (creeLe?: string): RdvDeGerard => ({ id: 'g', date: plusJours(A, 2), time: '10:00', status: 'confirmé', familles: ['resserrage'], venu: false, creeLe });
const g = sit(fiche({ rdvs: [venue(plusJours(A, -40)), rdvDans2(`${plusJours(A, -10)}T09:00:00.000Z`)] }));
dit('garder : deux jours avant un RDV pris depuis plus d’une semaine, sur WhatsApp, modèle utilitaire', ['garder', 'whatsapp', 'garder', true],
  [g?.genre, g?.canal, g?.modele, /est mercredi 28 octobre 2026 à 10 h\. C’est toujours bon pour vous \?\n\nMaison MND$/.test(g?.texte ?? '')]);
dit('... pris il y a trois jours : on ne le garde pas', true, sit(fiche({ rdvs: [venue(plusJours(A, -40)), rdvDans2(`${plusJours(A, -3)}T09:00:00.000Z`)] }))?.genre !== 'garder');
dit('... même « stop », un RDV se garde (c’est un service)', 'garder', sit(fiche({ stop: true, accord: false, rdvs: [venue(plusJours(A, -40)), rdvDans2()] }))?.genre);

/* ── 4. L'anniversaire ── */
const an = sit(fiche({ birthday: '1990-10-26' }));
dit('l’anniversaire, le jour même : son code de 10 %, trente jours', ['anniversaire', 'ANNIV', 10, plusJours(A, ANNIV_VALABLE_JOURS)], [an?.genre, an?.code?.mot, an?.code?.pct, an?.code?.jusquau]);
dit('l’anniversaire se rattrape le lendemain (dit « rattrapage »), pas le surlendemain ; déjà souhaité hier : rien', ['anniversaire', true, true, true],
  [sit(fiche({ birthday: `1990-${plusJours(A, -1).slice(5)}` }))?.genre, !!sit(fiche({ birthday: `1990-${plusJours(A, -1).slice(5)}` }))?.pourquoi.some(([k]) => k === 'Rattrapage'),
    sit(fiche({ birthday: `1990-${plusJours(A, -2).slice(5)}` }))?.genre !== 'anniversaire',
    sit(fiche({ birthday: `1990-${plusJours(A, -1).slice(5)}`, traces: [{ quand: `${plusJours(A, -1)}T09:00:00Z`, genre: 'anniversaire' }] }))?.genre !== 'anniversaire']);
dit('... séance anniversaire déjà offerte cette année, ou sans accord ni Ma Couronne : SA CARTE QUAND MÊME, sans attention ni remise', [['anniversaire', 'carte', false], ['anniversaire', 'carte', false]],
  [sit(fiche({ birthday: '1990-10-26', birthdayGiftAt: '2026-10-26T08:00:00Z' })), sit(fiche({ birthday: '1990-10-26', accord: false }))].map((s) => [s?.genre, s?.modele, !!s?.code]));

/* ── 5. Le fil : l'envie, tout combiner ── */
const e1 = sit(fiche());
dit('une envie par mois : à J+30, avant que la cadence approche', ['envie', 'couronne-ou-whatsapp'], [e1?.genre, e1 ? 'couronne-ou-whatsapp' : '']);
dit('... « cheveux secs » au point d’après : le soin hydratant, dit dans le modèle de l’envie', ['hydratation', 'envie', true],
  [sit(fiche({ soucis: ['seches'] }))?.envie, sit(fiche({ soucis: ['seches'] }))?.modele, /la Maison vous propose un soin hydratant de 45 minutes, pour vos cheveux secs\. Je vous trouve une place \?/.test(sit(fiche({ soucis: ['seches'] }))?.texte ?? '')]);
dit('... une envie il y a vingt jours : pas encore', null, sit(fiche({ traces: [{ quand: `${plusJours(A, -20)}T09:00:00Z`, genre: 'envie', envie: 'lavage' }] })));
dit('... la cadence à 15 jours : pas d’envie, « tout combiner » arrive', null, sit(fiche({ cadence: { iso: plusJours(A, 15), rythmeJours: 45 } })));
const comb = sit(fiche({ rdvs: [venue(plusJours(A, -100)), venue(plusJours(A, -49))], cadence: { iso: plusJours(A, 7), rythmeJours: 56 } }));
dit('tout combiner, sept jours avant une date de cadence sans RDV : le modèle « avant », la coiffure offerte avec un soin', ['combiner', 'avant', true],
  [comb?.genre, comb?.modele, /^Bonjour Madame K\., votre prochain resserrage des racines approche : il est prévu vers le lundi 2 novembre 2026\. Je vous réserve votre place \? Avec un soin ajouté le même jour, votre coiffure de sortie est offerte\.\n\nMaison MND$/.test(comb?.texte ?? '')]);
const combA = (j: number) => fiche({ rdvs: [venue(plusJours(A, -100)), venue(plusJours(A, -56 + j))], cadence: { iso: plusJours(A, j), rythmeJours: 56 } });
dit('« avant sa date » se rattrape jusqu’à J-4, avec la date prévue ; à J-3, plus rien ; une fois écrit, il ne revient pas', ['combiner', true, 'combiner', null, null],
  [sit(combA(5))?.genre, !!sit(combA(5))?.pourquoi.some(([k, v]) => k === 'Rattrapage' && /prévu le samedi 24 octobre 2026/.test(v)), sit(combA(4))?.genre, sit(combA(3)),
    sit({ ...combA(5), traces: [{ quand: `${plusJours(A, -2)}T09:00:00Z`, genre: 'combiner' }] })]);
dit('... RDV posé à sept jours : le point d’avant du Trône s’en charge, Gérard se tait', null,
  sit(fiche({ rdvs: [venue(plusJours(A, -50)), { ...rdvPose, date: plusJours(A, 7) }] })));
dit('sans accord ni Ma Couronne, une envie ne part pas ; avec Ma Couronne, elle part en notification', [null, 'couronne'],
  [sit(fiche({ accord: false })), sit(fiche({ accord: false, couronne: true }))?.canal]);
dit('une cliente écartée (passage, diaspora, locks défaits) : rien, sauf sa carte d’anniversaire, sans attention', [null, 'carte', false],
  [sit(fiche({ ecartee: true })), sit(fiche({ ecartee: true, birthday: '1990-10-26' }))?.modele, !!sit(fiche({ ecartee: true, birthday: '1990-10-26' }))?.code]);

/* ── 5 bis. LA CARTE D'ANNIVERSAIRE, À TOUTES (27 octobre 2026) ──
   « Reconnaître tous les anniversaires, envoyer toutes les cartes par
   WhatsApp ; pour un enfant, au numéro du parent payeur » (Yéman). */
const AJ = `1990-${A.slice(5)}`;
const payeurP = { id: 'p1', appel: 'Madame P.', telephone: true, couronne: false, stop: false };
const enfant = (o: Partial<FicheDeGerard> = {}) => fiche({ id: 'e1', appel: 'Awa', accord: false, telephone: false, enfantDuFoyer: true, payeur: payeurP, birthday: '2016-10-26', ...o });
const ce = sit(enfant());
dit('l’enfant du foyer : sa carte part au parent payeur, au modèle du foyer, sans remise, et le texte la nomme', ['anniversaire', 'carte-foyer', 'whatsapp', 'p1', ['Madame P.', 'Awa'], false],
  [ce?.genre, ce?.modele, ce?.canal, ce?.pourId, ce?.variables, !!ce?.code]);
dit('... le texte, tel qu’il part', 'Bonjour Madame P., joyeux anniversaire à Awa ! Toute la Maison lui souhaite une très belle journée, et une année douce et lumineuse.\n\nMaison MND', ce?.texte);
dit('... sans parent payeur noté : rien, et l’anniversaire est reconnu « sans payeur » ; le parent a dit « stop » : rien ; le parent sans numéro mais sur Ma Couronne : sa notification', [null, 'sans-payeur', null, 'stop', 'couronne', 'p1'],
  [sit(enfant({ payeur: undefined })), anniversaireDuJour(enfant({ payeur: undefined }), ctx())?.etat,
    sit(enfant({ payeur: { ...payeurP, stop: true } })), anniversaireDuJour(enfant({ payeur: { ...payeurP, stop: true } }), ctx())?.etat,
    sit(enfant({ payeur: { ...payeurP, telephone: false, couronne: true } }))?.canal, sit(enfant({ payeur: { ...payeurP, telephone: false, couronne: true } }))?.pourId]);
dit('... un membre adulte du foyer à son propre numéro reçoit chez lui ; sans numéro ni Ma Couronne, chez le payeur', [undefined, 'carte', 'p1', 'carte-foyer'],
  [sit(fiche({ birthday: AJ, accord: false, payeur: payeurP }))?.pourId, sit(fiche({ birthday: AJ, accord: false, payeur: payeurP }))?.modele,
    sit(fiche({ birthday: AJ, telephone: false, payeur: payeurP }))?.pourId, sit(fiche({ birthday: AJ, telephone: false, payeur: payeurP }))?.modele]);
dit('sans accord des nouvelles, la carte part quand même par WhatsApp, et seule chez Meta une fois son modèle approuvé', ['carte', 'whatsapp', true, false],
  [sit(fiche({ birthday: AJ, accord: false }))?.modele, sit(fiche({ birthday: AJ, accord: false }))?.canal,
    partSeule(sit(fiche({ birthday: AJ, accord: false }))!, { mode: 'ouvert', approuves: ['gerard_carte_anniversaire'] }),
    partSeule(sit(fiche({ birthday: AJ, accord: false }))!, { mode: 'ouvert', approuves: [] })]);
dit('avec l’accord, l’attention l’accompagne (10 %, trente jours), au modèle « anniversaire »', ['anniversaire', 'ANNIV', 10], [an?.modele, an?.code?.mot, an?.code?.pct]);
dit('ce qui la fait taire : « stop », « jamais pour elle », les anniversaires éteints, archivée, ni numéro ni Ma Couronne ; et chacun est reconnu', [[null, 'stop'], [null, 'jamais'], [null, 'eteinte'], [null, null], [null, 'sans-numero']],
  [[fiche({ birthday: AJ, stop: true }), ctx()], [fiche({ birthday: AJ, jamais: ['anniversaire'] }), ctx()], [fiche({ birthday: AJ }), ctx({ eteintes: ['anniversaire'] })],
    [fiche({ birthday: AJ, archivee: true }), ctx()], [fiche({ birthday: AJ, telephone: false }), ctx()]]
    .map(([fi, c]) => [sit(fi as FicheDeGerard, c as ContexteDeGerard)?.genre === 'anniversaire' ? 'carte' : null, anniversaireDuJour(fi as FicheDeGerard, c as ContexteDeGerard)?.etat ?? null]));
dit('une fois l’an : partie, ou « pas maintenant » cette année, elle ne revient pas ; l’an passé ne compte pas', [null, 'deja', 'anniversaire'],
  [sit(fiche({ birthday: AJ, traces: [{ quand: `${A}T07:00:00Z`, genre: 'anniversaire', reponse: 'non' }] })),
    anniversaireDuJour(fiche({ birthday: AJ, traces: [{ quand: `${A}T07:00:00Z`, genre: 'anniversaire' }] }), ctx())?.etat,
    sit(fiche({ birthday: AJ, traces: [{ quand: '2025-10-26T07:00:00Z', genre: 'anniversaire' }] }))?.genre]);
dit('toutes les formes de la date : AAAA-MM-JJ, avec son heure, JJ/MM/AAAA, JJ.MM.AAAA ; une date fausse ne se reconnaît pas', ['10-26', '10-26', '10-26', '03-07', undefined, undefined],
  [moisEtJourDe('1990-10-26'), moisEtJourDe('1990-10-26T00:00:00.000Z'), moisEtJourDe('26/10/1990'), moisEtJourDe('7.3.1988'), moisEtJourDe('1990-13-02'), moisEtJourDe('bientôt')]);
dit('le 29 février se fête le 28 les années communes, le 29 les années bissextiles, jamais deux fois', ['anniversaire', 'anniversaire', false, true],
  [sit(fiche({ birthday: '2000-02-29' }), ctx({ aujourdhui: '2027-02-28' }))?.genre, sit(fiche({ birthday: '2000-02-29' }), ctx({ aujourdhui: '2028-02-29' }))?.genre,
    sit(fiche({ birthday: '2000-02-29' }), ctx({ aujourdhui: '2028-02-28' }))?.genre === 'anniversaire',
    !!sit(fiche({ birthday: '2000-02-29' }), ctx({ aujourdhui: '2027-03-01' }))?.pourquoi.some(([k]) => k === 'Rattrapage')]);
dit('une date à la française est fêtée comme les autres', 'anniversaire', sit(fiche({ birthday: `${A.slice(8, 10)}/${A.slice(5, 7)}/1990` }))?.genre);
const deuxAnniv = planDuJour([fiche({ id: 'a1', birthday: AJ }), fiche({ id: 'a2', birthday: AJ })], ctx({ remisesRestantes: 1 }));
dit('le plafond à une remise : la première a son attention, la seconde sa carte seule, personne n’est oubliée', [['a1', 'anniversaire', true], ['a2', 'carte', false]],
  deuxAnniv.map((s) => [s.clientId, s.modele, !!s.code]));
dit('les anniversaires du jour : toutes les fiches reconnues, avec ce qu’il en advient', [['a1', 'carte'], ['e1', 'carte'], ['s1', 'stop'], ['n1', 'sans-numero']],
  anniversairesDuJour([fiche({ id: 'a1', birthday: AJ }), enfant(), fiche({ id: 's1', birthday: AJ, stop: true }), fiche({ id: 'n1', birthday: AJ, telephone: false }), fiche({ id: 'x1' })], ctx())
    .map((x) => [x.clientId, x.etat]));
const ligneCarte = ligneWhatsApp(ce!, { branchId: 'b', aujourdhui: A, maintenantIso: `${A}T08:00:00Z`, prenom: 'Awa', numero: '22901510000', partA: `${A}T08:10:00Z`, calme: false });
dit('la ligne déposée : la carte en en-tête image, le prénom de l’enfant en variable, le numéro du parent, la fiche qui reçoit notée', [['header', 'body', 'button'], IMAGE_DE_LA_CARTE, ['Madame P.', 'Awa'], '22901510000', 'p1', 'gerard_carte_foyer'],
  [ligneCarte.colis?.genre === 'whatsapp' ? ligneCarte.colis.composants.map((k) => k.type) : [],
    ligneCarte.colis?.genre === 'whatsapp' ? (ligneCarte.colis.composants[0] as { parameters: { image?: { link: string } }[] }).parameters[0]?.image?.link : '',
    ligneCarte.colis?.genre === 'whatsapp' ? (ligneCarte.colis.composants[1] as { parameters: { text?: string }[] }).parameters.map((p) => p.text) : [],
    ligneCarte.colis?.genre === 'whatsapp' ? ligneCarte.colis.numero : '', ligneCarte.pourId, ligneCarte.colis?.genre === 'whatsapp' ? ligneCarte.colis.modele : '']);
dit('... un modèle sans image n’en porte pas (Meta refuserait l’en-tête)', false,
  JSON.stringify(ligneWhatsApp(sit(fiche())!, { branchId: 'b', aujourdhui: A, maintenantIso: `${A}T08:00:00Z`, prenom: 'K', numero: '229', partA: A, calme: false }).colis).includes('"header"'));
dit('l’image de la carte est servie par le Trône, en PNG, et ne nomme personne', true, /^https:\/\/maisonmnd\.com\/trone\/assets\/cartes\/carte-anniversaire\.png$/.test(IMAGE_DE_LA_CARTE));
dit('garder un RDV le jour de son anniversaire : garder d’abord, la carte le lendemain en rattrapage', ['garder', 'anniversaire'],
  [sit(fiche({ birthday: AJ, rdvs: [venue(plusJours(A, -40)), { id: 'g', date: plusJours(A, 2), time: '10:00', status: 'confirmé', familles: ['resserrage'], venu: false }] }))?.genre,
    sit(fiche({ birthday: AJ, rdvs: [venue(plusJours(A, -40)), { id: 'g', date: plusJours(A, 2), time: '10:00', status: 'confirmé', familles: ['resserrage'], venu: false }], traces: [{ quand: `${A}T07:00:00Z`, genre: 'garder' }] }), ctx({ aujourdhui: plusJours(A, 1) }))?.genre]);

/* ── 6. Le choix de l'envie ── */
const avecCouleur = fiche({ rdvs: [venue('2026-06-10', ['couleur']), venue(plusJours(A, -30))] });
dit('l’envie : sa couleur a plus de 90 jours, une retouche ; jamais la même deux fois ; une refusée attend trois mois (en octobre, pas encore la coiffure des fêtes)', ['couleur', 'lavage', 'hydratation'],
  [choisisLEnvie(avecCouleur, A),
    choisisLEnvie({ ...avecCouleur, traces: [{ quand: '2026-09-20T09:00:00Z', genre: 'envie', envie: 'couleur' }] }, A),
    choisisLEnvie({ ...avecCouleur, traces: [{ quand: '2026-08-20T09:00:00Z', genre: 'envie', envie: 'couleur', reponse: 'non' }, { quand: '2026-09-20T09:00:00Z', genre: 'envie', envie: 'lavage' }] }, A)]);
const aMidi = fiche({ rdvs: ['2026-08-04', '2026-08-25', '2026-09-15', plusJours(A, -30)].map((d) => venue(d, ['resserrage'], '12:30')) });
dit('... elle vient en semaine entre 11 h et 14 h : midi et deux', 'midi-deux', choisisLEnvie({ ...aMidi, cadence: { iso: plusJours(A, 26), rythmeJours: 30 } }, '2026-10-26'));

/* ── 7. Les jours creux ── */
const parJour = new Map([['2026-10-29', 2], ['2026-10-30', 5], ['2026-10-31', 1], ['2026-11-02', 0]]);
const creux = joursCreux({ aujourdhui: A, parJour, ordinaireDe: () => 5, ouvertLe: (j) => j !== '2026-11-01' && j !== '2026-11-02', remisesRestantes: 6 });
dit('les jours creux de 3 à 7 jours : le manque sous l’ordinaire, la semaine plafonne les remises', [['2026-10-29', 3, 3], ['2026-10-31', 4, 3]],
  creux.map((j) => [j.iso, j.manque, j.remises]));
const viaCreux = sit(fiche(), ctx({ creux: [{ iso: '2026-10-29', poses: 2, ordinaire: 5, manque: 3, remises: 3 }], placesDe: (_id, jour) => (jour ? [{ iso: jour, heure: '11:00' }, { iso: jour, heure: '15:00' }] : places) }));
dit('un jour creux change l’envie en place remisée, notée à son nom pour un jour ; le message ne dit ni montant ni code', ['creux', 'nouvelles', 'CREUX', 15, '2026-10-29', true, false],
  [viaCreux?.genre, viaCreux?.modele, viaCreux?.code?.mot, viaCreux?.code?.pct, viaCreux?.code?.jour,
    /une place s’est libérée jeudi 29 octobre 2026 à 11 h ou à 15 h, et ce jour-là la Maison vous fait une remise sur votre resserrage des racines\./.test(viaCreux?.texte ?? ''), /%|\bcode/.test(viaCreux?.texte ?? '')]);

/* ── 8. Les relances ── */
const retard = fiche({ rdvs: [venue(plusJours(A, -90)), venue(plusJours(A, -55))], cadence: { iso: plusJours(A, -20), rythmeJours: 35 } });
dit('en retard : dix jours après la date attendue, deux places, le modèle « place »', ['retard', 'place', true],
  [sit(retard)?.genre, sit(retard)?.modele, /^Bonjour Madame K\., il est temps de votre resserrage des racines : nous avons de la place mercredi 28 octobre 2026 à 10 h ou jeudi 29 octobre 2026 à 14 h\. Je vous en garde une \?/.test(sit(retard)?.texte ?? '')]);
dit('... une relance n’est plus un service : sans accord, elle part À LA MAIN seulement ; « stop » la fait taire', [['whatsapp', true], null, [true, undefined]],
  [[sit({ ...retard, accord: false })?.canal, sit({ ...retard, accord: false })?.aLaMainSeulement], sit({ ...retard, stop: true, couronne: true, accord: false }),
    [!!sit({ ...retard, accord: false })?.pourquoi.some(([k]) => k === 'Accord des nouvelles'), sit(retard)?.aLaMainSeulement]]);
dit('... relancée il y a trois semaines : pas avant quatre', null, sit({ ...retard, traces: [{ quand: `${plusJours(A, -21)}T09:00:00Z`, genre: 'retard' }] }));
const unique = fiche({ rdvs: [venue(plusJours(A, -70), ['autre'])], cadence: { iso: plusJours(A, -40), rythmeJours: 30 } });
dit('une seule venue : jamais « en retard », son premier resserrage', ['une-venue', 'place', true], [sit(unique)?.genre, sit(unique)?.modele, /votre premier resserrage des racines :/.test(sit(unique)?.texte ?? '')]);
const dort = fiche({ rdvs: [venue('2026-01-10'), venue('2026-03-20')], cadence: { iso: null, rythmeJours: 70 } });
dit('endormie (5 mois et plus) : trois fois au plus, six semaines d’écart', ['endormie', null, null],
  [sit(dort)?.genre,
    sit({ ...dort, traces: Array.from({ length: ENDORMIE_FOIS_MAX }, (_, i) => ({ quand: `${plusJours(A, -60 - 50 * i)}T09:00:00Z`, genre: 'endormie' as const })) }),
    sit({ ...dort, traces: [{ quand: `${plusJours(A, -35)}T09:00:00Z`, genre: 'endormie' }] })]);
dit('... à la main seulement : en retard, une seule venue, avant sa date ; jamais une envie, une remise ou une endormie', [true, true, true, null, null, null],
  [sit({ ...retard, accord: false })?.aLaMainSeulement, sit({ ...unique, accord: false })?.aLaMainSeulement,
    sit({ ...combA(7), accord: false })?.aLaMainSeulement, sit(fiche({ accord: false })), sit({ ...dort, accord: false }),
    sit(fiche({ accord: false }), ctx({ creux: [{ iso: '2026-10-29', poses: 2, ordinaire: 5, manque: 3, remises: 3 }], placesDe: (_id, jour) => (jour ? [{ iso: jour, heure: '11:00' }] : places) }))]);

/* ── 9. Noël ── */
const decembre = fiche({ rdvs: [venue('2026-10-20'), venue('2026-11-20')], cadence: { iso: '2027-01-10', rythmeJours: 51 } });
dit('du 1er au 15 décembre, dans le fil : les places des fêtes et la carte cadeau, sans code', ['noel', 'fetes', undefined],
  [situationDuJour(decembre, ctx({ aujourdhui: '2026-12-03' }))?.genre, situationDuJour(decembre, ctx({ aujourdhui: '2026-12-03' }))?.modele, situationDuJour(decembre, ctx({ aujourdhui: '2026-12-03' }))?.code]);
dit('... une carte cadeau vit déjà sur sa fiche : pas de message de Noël', true,
  situationDuJour({ ...decembre, carteVivante: true }, ctx({ aujourdhui: '2026-12-03' }))?.genre !== 'noel');

/* ── 10. Le plan du jour ── */
const fiches = [
  fiche({ id: 'a', rdvs: [venue(plusJours(A, -40)), rdvDans2()] }),
  fiche({ id: 'b' }),
  fiche({ id: 'c' }),
  fiche({ id: 'd', ecartee: true }),
];
const plan = planDuJour(fiches, ctx({ creux: [{ iso: '2026-10-29', poses: 4, ordinaire: 5, manque: 1, remises: 1 }], remisesRestantes: 1, placesDe: (_id, jour) => (jour ? [{ iso: jour, heure: '11:00' }] : places) }));
dit('le plan : une chose par cliente, garder d’abord, le jour creux à qui reste une remise, l’autre reçoit son envie', [['a', 'garder'], ['b', 'creux'], ['c', 'envie']],
  plan.map((s) => [s.clientId, s.genre]));
const planAnniv = planDuJour([fiche({ id: 'n', birthday: `1990-${A.slice(5)}` }), fiche({ id: 'm' })],
  ctx({ creux: [{ iso: '2026-10-29', poses: 4, ordinaire: 5, manque: 1, remises: 1 }], remisesRestantes: 1, placesDe: (_id, jour) => (jour ? [{ iso: jour, heure: '11:00' }] : places) }));
dit('... l’anniversaire entre dans le plafond, avant le jour creux : la dernière remise est pour elle', [['n', 'anniversaire'], ['m', 'envie']],
  planAnniv.map((s) => [s.clientId, s.genre]));
dit('... plafond atteint : pas de remise d’anniversaire, la carte seule', ['carte', false], [sit(fiche({ birthday: `1990-${A.slice(5)}` }), ctx({ remisesRestantes: 0 }))?.modele, !!sit(fiche({ birthday: `1990-${A.slice(5)}` }), ctx({ remisesRestantes: 0 }))?.code]);

/* ── 11. La question franche ── */
dit('la question franche se reconnaît', [true, true, true, true, false, false, false],
  ['Je parle à Gérard ou c’est un robot ?', 'je parle à qui là', 'C’est bien Gérard ?', 'vous êtes un humain ?', 'Mardi 10h svp', 'Je veux le programme de pousse', 'je viens avec une personne'].map(estUneQuestionFranche));

/* ── 12. Les réglages ── */
dit('les réglages livrés : en pause, 8 remises et 60 000 F par semaine ; un plafond illisible garde sa valeur', ['eteint', 8, 60000, 8, 60000, 3, 45000],
  [reglagesLus(undefined).mode, reglagesLus(undefined).remisesParSemaine, reglagesLus(undefined).plafondFrancs,
    reglagesLus({ remisesParSemaine: -2 as number }).remisesParSemaine, reglagesLus({ plafondFrancs: Number.NaN }).plafondFrancs,
    reglagesLus({ remisesParSemaine: 3 }).remisesParSemaine, reglagesLus({ plafondFrancs: 45000 }).plafondFrancs]);
dit('... le plafond par défaut est celui de la maquette', 60000, PLAFOND_FRANCS_PAR_DEFAUT);

/* ── 13. La saison des fêtes ── */
dit('la saison des fêtes : du 1er novembre au 24 décembre', [false, true, true, false], ['2026-10-31', '2026-11-01', '2026-12-24', '2026-12-25'].map(estSaisonDesFetes));
const AF = '2026-11-10';
const enFetes = (o: Partial<FicheDeGerard> = {}) => fiche({ rdvs: [venue(plusJours(AF, -100)), venue(plusJours(AF, -22))], cadence: { iso: plusJours(AF, 40), rythmeJours: 62 }, ...o });
dit('en fêtes, la première envie à trois semaines (pas un mois)', ['envie', null],
  [situationDuJour(enFetes(), ctx({ aujourdhui: AF }))?.genre, situationDuJour(fiche({ rdvs: [venue(plusJours(A, -100)), venue(plusJours(A, -22))], cadence: { iso: plusJours(A, 40), rythmeJours: 62 } }), ctx())]);
dit('... puis une envie toutes les trois semaines', ['envie', null],
  [situationDuJour(enFetes({ traces: [{ quand: `${plusJours(AF, -21)}T09:00:00Z`, genre: 'envie', envie: 'lavage' }] }), ctx({ aujourdhui: AF }))?.genre,
    situationDuJour(enFetes({ traces: [{ quand: `${plusJours(AF, -20)}T09:00:00Z`, genre: 'envie', envie: 'lavage' }] }), ctx({ aujourdhui: AF }))]);
const retardF = fiche({ rdvs: [venue(plusJours(AF, -90)), venue(plusJours(AF, -55))], cadence: { iso: plusJours(AF, -20), rythmeJours: 35 } });
dit('... les relances toutes les deux semaines (pas quatre)', ['retard', null],
  [situationDuJour({ ...retardF, traces: [{ quand: `${plusJours(AF, -15)}T09:00:00Z`, genre: 'retard' }] }, ctx({ aujourdhui: AF }))?.genre,
    situationDuJour({ ...retardF, traces: [{ quand: `${plusJours(AF, -13)}T09:00:00Z`, genre: 'retard' }] }, ctx({ aujourdhui: AF }))]);
const noelTot = fiche({ rdvs: [venue('2026-09-01'), venue('2026-10-20')], cadence: { iso: '2026-12-20', rythmeJours: 56 } });
dit('... Noël dès le 15 novembre, pas avant', ['noel', 'envie'],
  [situationDuJour(noelTot, ctx({ aujourdhui: '2026-11-16' }))?.genre, situationDuJour(noelTot, ctx({ aujourdhui: '2026-11-14' }))?.genre]);
dit('le fil des fêtes : une envie toutes les trois semaines', [21, 42],
  filDeLaCliente(fiche({ rdvs: [venue('2026-11-02')], cadence: { iso: '2027-01-05', rythmeJours: 64 } }), '2026-11-03').filter((p) => p.quoi === 'Une envie').map((p) => p.jour));

/* ── 14. Le passage du jour ── */
dit('Ma Couronne d’abord, même pour un service : gratuite, elle part seule', ['couronne', 'couronne', 'whatsapp'],
  [sit(fiche({ couronne: true, rdvs: [venue(plusJours(A, -40)), rdvDans2()] }))?.canal, sit(fiche({ couronne: true, accord: false }))?.canal, sit(fiche())?.canal]);
dit('le passage est dû : actif, pas encore fait, entre 8 h et 20 h', [true, false, false, false, false],
  [passageDu({ mode: 'ouvert', essai: [] }, A, 9.5), passageDu({ mode: 'eteint', essai: [] }, A, 9.5), passageDu({ mode: 'ouvert', essai: [], dernierPassage: A }, A, 9.5),
    passageDu({ mode: 'ouvert', essai: [] }, A, 7.9), passageDu({ mode: 'ouvert', essai: [] }, A, 20)]);
dit('... Pause ou Actif : actif sert toutes les clientes (l’ancien essai aussi), la pause aucune', [true, true, false],
  [servie({ mode: 'ouvert', essai: [] }, 'x'), servie({ mode: 'essai', essai: ['y'] }, 'x'), servie({ mode: 'eteint', essai: [] }, 'x')]);
const sCou = sit(fiche({ couronne: true }))!;
const lN = ligneDeNotification(sCou, { branchId: 'b', aujourdhui: A, maintenantIso: `${A}T09:00:00.000Z`, prenom: 'Awa', compte: 'u-1', partA: `${A}T09:10:00.000Z`, calme: false });
dit('la notification déposée en salle : en attente, au compte abonné, titre « Maison MND », sans la signature en double', ['gerard-2026-10-26-c1-push', 'en-attente', 'gerard', 'u-1', 'Maison MND', false, '/couronne/'],
  [lN.id, lN.statut, lN.type, lN.colis?.clientId, lN.colis?.titre, /Maison MND$/.test(lN.colis?.corps ?? ''), lN.colis?.url]);
const lM = ligneALaMain(sit(fiche())!, { branchId: 'b', aujourdhui: A, maintenantIso: `${A}T09:00:00.000Z`, prenom: 'Awa', codePromo: 'CREUX15-ABC' });
dit('... le message envoyé à la main : noté, sans colis, avec son code', ['gerard-2026-10-26-c1-wa-main', 'à-la-main', 'wa-main', false, 'CREUX15-ABC'], [lM.id, lM.statut, lM.canal, !!lM.colis, lM.codePromo]);
dit('la signature s’ôte de la fin seulement', ['Bonjour.', 'Maison MND, merci.\n\nMaison MND x'], [texteSansSignature('Bonjour.\n\nMaison MND'), texteSansSignature('Maison MND, merci.\n\nMaison MND x')]);
const tr = tracesDesEnvois([
  { type: 'gerard', clientId: 'a', statut: 'en-attente', deposeLe: '2026-10-20T09:00:00Z', genre: 'envie', envie: 'lavage' },
  { type: 'gerard', clientId: 'a', statut: 'écarté', deposeLe: '2026-10-21T09:00:00Z', genre: 'retard' },
  { type: 'gerard', clientId: 'b', statut: 'à-la-main', deposeLe: '2026-10-22T09:00:00Z', genre: 'creux' },
  { type: 'campagne', clientId: 'a', statut: 'envoyé', deposeLe: '2026-10-22T09:00:00Z', genre: 'envie' },
  { type: 'gerard', clientId: 'b', statut: 'sans-abonnement', deposeLe: '2026-10-23T09:00:00Z', genre: 'envie' },
  { type: 'gerard', clientId: 'c', statut: 'écarté', deposeLe: '2026-10-24T09:00:00Z', genre: 'envie', envie: 'couleur', reponse: 'non' },
]);
dit('ce que Gérard a écrit se relit dans les envois ; une ligne écartée ou sans abonnement ne compte pas, sauf « Pas maintenant » (écartée avec « non »)', [[['envie', 'lavage']], [['creux', undefined]], [['envie', 'couleur', 'non']]],
  [tr.get('a')?.map((t) => [t.genre, t.envie]), tr.get('b')?.map((t) => [t.genre, t.envie]), tr.get('c')?.map((t) => [t.genre, t.envie, t.reponse])]);

/* ── 14 bis. Entre deux séances : il se tait ── */
dit('un souci Santé ou À voir encore ouvert : ni envie ni attention ; sa carte d’anniversaire part seule', [null, null, 'carte'],
  [sit(fiche({ souciOuvert: 'sante' }))?.genre ?? null, sit(fiche({ souciOuvert: 'a-voir' }))?.genre ?? null,
    sit(fiche({ souciOuvert: 'sante', birthday: `1990-${A.slice(5)}` }))?.modele ?? null]);
dit('... mais son RDV se garde quand même', 'garder', sit(fiche({ souciOuvert: 'sante', rdvs: [venue(plusJours(A, -40)), rdvDans2()] }))?.genre);
dit('... et le cerveau dit comme gerardSeTait (Entre deux séances)', [true, true, true],
  (['sante', 'a-voir', undefined] as const).map((x) => gerardSeTait({ souciOuvert: x }) === (sit(fiche({ souciOuvert: x })) === null)));

/* ── 14 ter. Les silences de la maquette v4 ── */
const avecGarder = (o: Partial<FicheDeGerard>) => fiche({ ...o, rdvs: [venue(plusJours(A, -40)), rdvDans2()] });
dit('elle doit de l’argent : ni envie ni remise, mais son RDV se garde', [null, 'garder'],
  [sit(fiche({ resteDu: 5000 })), sit(avecGarder({ resteDu: 5000 }))?.genre]);
dit('une relance de facture il y a trois jours : silence ; il y a huit jours : l’envie revient', [null, 'envie'],
  [sit(fiche({ derniereRelanceLe: plusJours(A, -3) })), sit(fiche({ derniereRelanceLe: plusJours(A, -8) }))?.genre]);
dit('elle a écrit il y a moins de 48 heures sans réponse : on lui répond d’abord ; son RDV se garde', [null, 'garder'],
  [sit(fiche({ attendUneReponse: true })), sit(avecGarder({ attendUneReponse: true }))?.genre]);
dit('enfant d’un foyer : jamais écrite, pas même pour garder un RDV (le parent reçoit)', [null, null],
  [sit(fiche({ enfantDuFoyer: true })), sit(avecGarder({ enfantDuFoyer: true }))]);
dit('quatorze jours sur toutes les voix : un message de la Maison il y a dix jours fait taire, il y a quinze jours non', [null, 'envie'],
  [sit(fiche({ dernierMessageHorsService: plusJours(A, -10) })), sit(fiche({ dernierMessageHorsService: plusJours(A, -15) }))?.genre]);
const ctxCreux = ctx({ creux: [{ iso: '2026-10-29', poses: 2, ordinaire: 5, manque: 3, remises: 3 }], placesDe: (_id, jour) => (jour ? [{ iso: jour, heure: '11:00' }] : places) });
dit('elle porte déjà une remise à son nom : pas de seconde (ni jour creux ni attention d’anniversaire), jamais de cumul ; la carte part seule', ['envie', 'carte', false],
  [sit(fiche({ codesVivants: 1 }), ctxCreux)?.genre, sit(fiche({ codesVivants: 1, birthday: `1990-${A.slice(5)}` }))?.modele, !!sit(fiche({ codesVivants: 1, birthday: `1990-${A.slice(5)}` }))?.code]);

const envoisVus = [
  { type: 'confirmation', clientId: 'a', statut: 'envoyé', quand: '2026-10-25T09:00:00Z' },
  { type: 'avis-google', clientId: 'a', statut: 'envoyé', quand: '2026-10-20T09:00:00Z' },
  { type: 'gerard', genre: 'garder', clientId: 'a', statut: 'envoyé', deposeLe: '2026-10-24T09:00:00Z' },
  { type: 'campagne', clientId: 'b', statut: 'écarté', quand: '2026-10-24T09:00:00Z' },
  { type: 'point-apres', clientId: 'b', statut: 'envoyé', quand: '2026-10-10T23:30:00Z' },
  { type: 'relance-facture', clientId: 'c', statut: 'envoyé', quand: '2026-10-22T09:00:00Z' },
];
const derniers = derniersMessagesHorsService(envoisVus, [{ sens: 'sortant', clientId: 'c', quand: '2026-10-23T10:00:00Z' }, { sens: 'entrant', clientId: 'a', quand: '2026-10-26T08:00:00Z' }]);
dit('le dernier message hors service : la demande d’avis compte, la confirmation et « garder » non, une ligne écartée non, un WhatsApp sortant oui', [['a', '2026-10-20'], ['b', '2026-10-11'], ['c', '2026-10-23']],
  [...derniers.entries()].sort());
dit('... le jour se lit à Cotonou : 23 h 30 UTC est déjà le lendemain', ['2026-10-11', '2026-10-26'], [jourACotonou('2026-10-10T23:30:00Z'), jourACotonou('2026-10-26')]);
dit('... la dernière relance de facture de chacune', [['c', '2026-10-22']], [...dernieresRelancesDeFacture(envoisVus).entries()]);
const maintenant = Date.parse('2026-10-26T12:00:00Z');
dit('elle attend une réponse : son dernier mot a moins de 48 heures ; une réponse partie depuis, ou 50 heures, non', [['a'], false, false],
  [[...attendUneReponse([{ sens: 'entrant', clientId: 'a', quand: '2026-10-26T02:00:00Z' }], maintenant)],
    attendUneReponse([{ sens: 'entrant', clientId: 'a', quand: '2026-10-26T02:00:00Z' }, { sens: 'sortant', clientId: 'a', quand: '2026-10-26T03:00:00Z' }], maintenant).has('a'),
    attendUneReponse([{ sens: 'entrant', clientId: 'a', quand: '2026-10-24T10:00:00Z' }], maintenant).has('a')]);

/* ── 14 ter bis. Éteindre une situation, « jamais pour elle », sa réponse ── */
dit('une situation éteinte par la direction : il ne l’écrit à personne ; les autres continuent', [null, 'garder'],
  [sit(fiche(), ctx({ eteintes: ['envie'] })), sit(avecGarder({}), ctx({ eteintes: ['envie'] }))?.genre]);
dit('« jamais pour elle » : cette situation ne lui est plus écrite, les autres oui', [null, 'envie'],
  [sit(fiche({ jamais: ['envie'] })), sit(fiche({ jamais: ['endormie'] }))?.genre]);
const lus = reglagesLus({ eteintes: ['envie', 'envie', 'inconnue'] as never, jamais: { a: ['creux', 'faux'], b: [] } as never });
dit('les réglages lus sans confiance : une situation inconnue tombe, une cliente sans situation sort', [['envie'], { a: ['creux'] }, [], {}],
  [lus.eteintes, lus.jamais, reglagesLus(undefined).eteintes, reglagesLus(undefined).jamais]);
const trR = tracesDesEnvois([
  { type: 'gerard', clientId: 'a', statut: 'envoyé', deposeLe: '2026-10-20T09:00:00Z', genre: 'envie', envie: 'lavage', reponse: 'jamais' },
  { type: 'gerard', clientId: 'a', statut: 'envoyé', deposeLe: '2026-10-21T09:00:00Z', genre: 'envie', envie: 'couleur', reponse: 'peut-etre' },
]);
dit('la réponse se relit sur la ligne de l’envoi ; une réponse inconnue ne compte pas', ['jamais', undefined], trR.get('a')?.map((t) => t.reponse));
dit('un modèle de l’Assistant part seul : le fil ne le prend pas pour une réponse de l’équipe', [true, true, true, false],
  [estEnvoiAutomatique('Assistant Maison'), estEnvoiAutomatique('Gérard'), estEnvoiAutomatique('Le Trône'), estEnvoiAutomatique('Aimée')]);

/* ── 14 quater. Le plafond de la semaine, tout compris ── */
const pl = plafondDeLaSemaine({
  lundi: '2026-10-26', maintenantIso: '2026-10-28T12:00:00Z', ticketMoyenXof: 20000, remisesParSemaine: 8, plafondFrancs: 60000,
  codes: [
    { creeLe: '2026-10-25T09:00:00Z', expireLe: '2026-10-30T09:00:00Z', remisePct: 15 },
    { creeLe: '2026-10-26T09:00:00Z', expireLe: '2026-10-27T09:00:00Z', remisePct: 15 },
    { creeLe: '2026-10-26T10:00:00Z', expireLe: '2026-11-20T09:00:00Z', remisePct: 10, utiliseLe: '2026-10-27T10:00:00Z', remiseReelleXof: 2500 },
    { creeLe: '2026-10-27T10:00:00Z', expireLe: '2026-10-29T10:00:00Z', remisePct: 15 },
  ],
});
dit('le plafond compte toutes les remises depuis lundi ; les francs : réels si honorée, sur le ticket moyen si vivante, rien si morte', [3, 5500, 5],
  [pl.faites, pl.francs, pl.restantes]);
dit('... au plafond en francs, plus aucune remise', 0, plafondDeLaSemaine({ lundi: '2026-10-26', maintenantIso: '2026-10-28T12:00:00Z', ticketMoyenXof: 20000, remisesParSemaine: 8, plafondFrancs: 5000,
  codes: [{ creeLe: '2026-10-26T10:00:00Z', expireLe: '2026-10-29T10:00:00Z', remisePct: 15 }, { creeLe: '2026-10-26T10:00:00Z', expireLe: '2026-10-29T10:00:00Z', remisePct: 15 }] }).restantes);

/* ── 14 quinquies. La lecture partagée (le Trône et la fonction serveur) ── */
const LA = '2026-10-26';
const maintenantLu = Date.parse('2026-10-26T09:00:00Z');
const tete = (id: string, o: Record<string, unknown> = {}) => ({ id, branchId: 'b', name: `${id.toUpperCase()} X.`, phone: '+229 01 51 00 00 11', nouvelles: { oui: true, le: '2026-01-01', par: 'comptoir' }, segments: [], ...o });
const rituel = (id: string, clientId: string, date: string, o: Record<string, unknown> = {}) => ({ id, branchId: 'b', clientId, serviceIds: ['s1'], date, time: '10:00', status: 'honoré', master: 'Aimée', ...o });
const entrees = (o: Partial<EntreesDeLAssistant> = {}): EntreesDeLAssistant => ({
  aujourdhui: LA, maintenantMs: maintenantLu, branche: { id: 'b', seats: 2 },
  clients: [
    tete('dette'), tete('enfant', { familyId: 'f1', birthday: '2015-03-01' }), tete('parent', { familyId: 'f1' }),
    tete('carte'), tete('code'), tete('ecrit'), tete('relancee'), tete('ailleurs', { diaspora: true }), tete('jamais'),
    tete('souci'), tete('retard'),
  ] as never,
  rdvs: [rituel('r1', 'retard', '2026-07-01'), rituel('r2', 'retard', '2026-08-05')] as never,
  prestations: new Map([['s1', { name: 'SÍNSIN™ Essentiel · La Reprise', durationMin: 120 }]]) as never,
  signalements: [{ id: 'sg', branchId: 'b', clientId: 'souci', soucis: ['chute'], canal: 'couronne', quand: '2026-10-20T09:00:00Z', etat: 'ouvert' }] as never,
  abonnes: new Set(['u-carte']),
  envois: [
    { type: 'relance-facture', clientId: 'relancee', statut: 'envoyé', quand: '2026-10-23T09:00:00Z' },
    { type: 'avis-google', clientId: 'ecrit', statut: 'envoyé', quand: '2026-10-20T09:00:00Z' },
    { type: 'gerard', clientId: 'jamais', statut: 'envoyé', deposeLe: '2026-09-01T09:00:00Z', genre: 'envie', envie: 'lavage', reponse: 'non' },
  ],
  messages: [{ sens: 'entrant', clientId: 'ecrit', quand: '2026-10-26T07:00:00Z' }],
  pieces: [
    { id: 'p1', kind: 'facture', status: 'envoyée', clientId: 'dette', date: '2026-10-10', lines: [{ qty: 1, unitXof: 20000, discountPct: 0 }], globalDiscountPct: 0, payments: [{ id: 'v', date: '2026-10-10', amountXof: 15000 }] },
    { id: 'p2', kind: 'facture', status: 'payée', clientId: 'carte', date: '2026-10-12', lines: [{ qty: 1, unitXof: 30000, discountPct: 0 }], globalDiscountPct: 0 },
  ] as never,
  blocages: [],
  familles: [{ id: 'f1', payerClientId: 'parent' }],
  cartes: [{ id: 'k', branchId: 'b', clientId: 'carte', statut: 'rattachee', valableJusquau: '2027-06-01' }] as never,
  codes: [
    { id: 'c1', branchId: 'b', code: 'CREUX15-AAA', clientId: 'code', creeLe: '2026-10-26T08:00:00Z', expireLe: '2026-10-29T22:59:00Z', remisePct: 15, parQui: 'Gérard' },
    { id: 'c2', branchId: 'b', code: 'ROSE-BBB', clientId: 'autre', creeLe: '2026-10-26T08:30:00Z', expireLe: '2026-10-28T08:30:00Z', remisePct: 10, parQui: 'La direction' },
    { id: 'c3', branchId: 'autre', code: 'X-CCC', clientId: 'loin', creeLe: '2026-10-26T08:30:00Z', expireLe: '2026-10-28T08:30:00Z', remisePct: 10 },
  ] as never,
  reglagesGerard: { mode: 'ouvert', jamais: { jamais: ['envie'] }, eteintes: ['creux'], remisesParSemaine: 8, plafondFrancs: 60000 },
  ouverture: (iso) => ({ closed: [0, 1].includes(new Date(`${iso}T12:00:00Z`).getUTCDay()), openMin: 540, closeMin: 1140 }),
  ...o,
});
const lu = lisLAssistant(entrees());
const f = (id: string) => lu.fiches.find((x) => x.id === id)!;
dit('la lecture : la dette (20 000 F moins 15 000 F réglés), l’enfant du foyer (pas son parent), la carte sur sa fiche, la remise vivante', [5000, true, false, true, 1],
  [f('dette').resteDu, f('enfant').enfantDuFoyer, f('parent').enfantDuFoyer, f('carte').carteVivante, f('code').codesVivants]);
{
  /* LA CARTE DE L'ENFANT AU PARENT PAYEUR, lue sur de vraies fiches (27 octobre 2026). */
  const foyer = lisLAssistant(entrees({
    clients: [tete('enfant', { familyId: 'f1', birthday: '2016-10-26', phone: '' }), tete('parent', { familyId: 'f1', phone: '+229 01 51 22 33 44' }),
      tete('arch', { birthday: '1990-10-26', archived: true })] as never,
  }));
  const plan = planDuJour(foyer.fiches, foyer.ctx);
  const carte = plan.find((s) => s.clientId === 'enfant');
  dit('la lecture du foyer : l’enfant connaît son parent payeur (appel, numéro, Ma Couronne, stop), le parent n’en a pas au-dessus de lui ; l’archivée est notée', [{ id: 'parent', appel: 'PARENT', telephone: true, couronne: false, stop: false }, null, true],
    [foyer.fiches.find((x) => x.id === 'enfant')?.payeur, foyer.fiches.find((x) => x.id === 'parent')?.payeur ?? null, foyer.fiches.find((x) => x.id === 'arch')?.archivee]);
  dit('... le plan du jour : la carte de l’enfant, au parent ; son numéro est celui du parent, jamais celui (vide) de l’enfant ; l’archivée n’a rien', ['carte-foyer', 'parent', '+229 01 51 22 33 44', false],
    [carte?.modele, carte?.pourId, carte ? foyer.telDe(carte) : '', plan.some((s) => s.clientId === 'arch')]);
  /* Le parent sans numéro, abonné à Ma Couronne : la notification va à SON compte. */
  const surCouronne = lisLAssistant(entrees({
    clients: [tete('enfant', { familyId: 'f1', birthday: '2016-10-26', phone: '' }), tete('parent', { familyId: 'f1', phone: '' })] as never,
    abonnes: new Set(['parent']),
  }));
  const lignesC = lignesDuPassage({ cerveau: surCouronne, plan: planDuJour(surCouronne.fiches, surCouronne.ctx), reglagesGerard: { mode: 'ouvert' }, maintenantMs: maintenantLu, branchId: 'b', regles: REGLES_PAR_DEFAUT });
  dit('... le parent sans numéro mais sur Ma Couronne : la notification de la carte part à son compte, la ligne reste celle de l’enfant', [['push', 'parent', 'enfant', 'parent']],
    lignesC.map((l) => [l.canal, l.colis?.genre === 'push' ? l.colis.clientId : '', l.clientId, l.pourId]));
  /* Approuvé chez Meta : la carte part seule, au numéro du parent, l'image en tête. */
  const lignesW = lignesDuPassage({ cerveau: foyer, plan, reglagesGerard: { mode: 'ouvert', approuves: ['gerard_carte_foyer'] }, maintenantMs: maintenantLu, branchId: 'b', regles: REGLES_PAR_DEFAUT });
  const lw = lignesW.find((l) => l.clientId === 'enfant');
  dit('... approuvée chez Meta, la carte de l’enfant part seule au numéro du parent (format international), l’image en tête ; sans approbation, rien ne part seul', ['whatsapp', '22901512233' + '44', true, 0],
    [lw?.canal, lw?.colis?.genre === 'whatsapp' ? lw.colis.numero : '', lw?.colis?.genre === 'whatsapp' && lw.colis.composants[0]?.type === 'header',
      lignesDuPassage({ cerveau: foyer, plan, reglagesGerard: { mode: 'ouvert' }, maintenantMs: maintenantLu, branchId: 'b', regles: REGLES_PAR_DEFAUT }).filter((l) => l.clientId === 'enfant').length]);
}
dit('... ce qu’elle a écrit (moins de 48 heures), la relance de facture, la demande d’avis comptée, l’ailleurs écarté, « jamais pour elle »', [true, '2026-10-23', '2026-10-20', true, ['envie']],
  [f('ecrit').attendUneReponse, f('relancee').derniereRelanceLe, f('ecrit').dernierMessageHorsService, f('ailleurs').ecartee, f('jamais').jamais]);
dit('... le souci ouvert (chute = santé), sa réponse « non » relue, Ma Couronne par son compte', ['sante', 'non', true],
  [f('souci').souciOuvert, f('jamais').traces[0]?.reponse, lisLAssistant(entrees({ clients: [tete('carte', { authUserId: 'u-carte' })] as never })).fiches[0].couronne]);
dit('... la date ATTENDUE d’une cliente en retard (la date manquée, pas le cycle suivant), son rythme, son soin en français', ['2026-09-09', 35, 'resserrage'],
  [f('retard').cadence.iso, f('retard').cadence.rythmeJours, f('retard').soinDit.split(' ')[0]]);
dit('... le plafond compte toutes les remises de la branche, quel qu’en soit l’auteur ; les situations éteintes passent au contexte', [2, ['creux']],
  [lu.plafond.faites, lu.ctx.eteintes]);
dit('... deux places pour elle, jamais un jour fermé (dimanche, lundi)', true,
  lu.ctx.placesDe('retard').length === 2 && lu.ctx.placesDe('retard').every((p) => ![0, 1].includes(new Date(`${p.iso}T12:00:00Z`).getUTCDay()))
    && lu.ctx.placesDe('retard', '2026-11-01').length === 0 && lu.ctx.placesDe('retard', '2026-10-31').length > 0);
dit('le lundi de la semaine', ['2026-10-26', '2026-10-26', '2026-10-19'], [lundiDe('2026-10-26'), lundiDe('2026-11-01'), lundiDe('2026-10-25')]);
const codeFait = codeDeLaSituation({ clientId: 'retard', genre: 'creux', code: { mot: 'CREUX', pct: 15, jusquau: '2026-10-29', jour: '2026-10-29' } }, { branchId: 'b', nom: 'R. X.', maintenantMs: maintenantLu }, []);
dit('le code d’une situation : à son nom, signé « Assistant Maison », jusqu’à minuit du jour creux à Cotonou', ['retard', 'Assistant Maison', 15, '2026-10-29T23:00'],
  [codeFait?.clientId, codeFait?.parQui, codeFait?.remisePct, codeFait?.expireLe.slice(0, 16)]);

/* ── 14 sexies. Le passage du matin (le même au Trône et au serveur) ── */
const planLu = planDuJour(lu.fiches, lu.ctx);
const passe = (g: Record<string, unknown>, plan = planLu) => lignesDuPassage({ cerveau: lu, plan, reglagesGerard: g, maintenantMs: maintenantLu, branchId: 'b', regles: REGLES_PAR_DEFAUT });
const sitWa = planLu.find((x) => x.canal === 'whatsapp');
dit('le passage : rien en pause ; WhatsApp seulement si son modèle est approuvé chez Meta', [0, 0, 1],
  [passe({ mode: 'eteint', approuves: [] }, sitWa ? [{ ...sitWa, canal: 'couronne' }] : []).length, passe({ mode: 'ouvert', approuves: [] }, sitWa ? [sitWa] : []).length,
    passe({ mode: 'ouvert', approuves: ['gerard_garder', 'gerard_avant', 'gerard_envie', 'gerard_place', 'gerard_anniversaire', 'gerard_fetes', 'gerard_endormie', 'nouvelles_de_la_maison'] }, sitWa ? [sitWa] : []).length]);
const sitMain = sit({ ...retard, accord: false })!;
dit('... une relance à la main ne part JAMAIS seule, même son modèle approuvé chez Meta (accordée, elle part)', [0, 1],
  [passe({ mode: 'ouvert', approuves: ['gerard_place'] }, [{ ...sitMain, clientId: 'retard' }]).length,
    passe({ mode: 'ouvert', approuves: ['gerard_place'] }, [{ ...sitMain, clientId: 'retard', aLaMainSeulement: undefined }]).length]);
const lAnn = passe({ mode: 'ouvert', approuves: [] }, [{ ...sitWa!, canal: 'couronne', genre: 'anniversaire', code: { mot: 'ANNIV', pct: 10, jusquau: '2026-11-25' } }])[0];
dit('... la remise n’est jamais fabriquée au dépôt : la ligne la porte « à faire »', ['ANNIV', undefined, 'en-attente'], [lAnn?.codeAFaire?.mot, lAnn?.codePromo, lAnn?.statut]);
dit('... seules les lignes neuves s’écrivent', ['b'], lignesNeuves([{ id: 'a' }, { id: 'b' }], new Set(['a'])).map((l) => l.id));
const aFaire = remisesAFabriquer([
  { id: '1', type: 'gerard', statut: 'en-attente', clientId: 'x', codeAFaire: { mot: 'ANNIV', pct: 10, jusquau: '2026-11-25' } },
  { id: '2', type: 'gerard', statut: 'envoyé', clientId: 'x', codeAFaire: { mot: 'ANNIV', pct: 10, jusquau: '2026-11-25' } },
  { id: '3', type: 'gerard', statut: 'envoyé', clientId: 'x', codeAFaire: { mot: 'CREUX', pct: 15, jusquau: '2026-10-30' }, codePromo: 'CREUX15-A' },
  { id: '4', type: 'gerard', statut: 'sans-abonnement', clientId: 'x', codeAFaire: { mot: 'CREUX', pct: 15, jusquau: '2026-10-30' } },
]);
dit('les remises à fabriquer : une ligne PARTIE, sans code encore ; ni en attente, ni sans abonnement, ni déjà servie', ['2'], aFaire.map((l) => l.id));
const ilYA = (h2: number) => ({ vuLe: new Date(maintenantLu - h2 * 3_600_000).toISOString() });
dit('la fonction serveur vit si elle a parlé depuis moins de 26 heures ; absente, elle se tait', [true, false, false],
  [serveurVivant(ilYA(25), maintenantLu), serveurVivant(ilYA(27), maintenantLu), serveurVivant(null, maintenantLu)]);

/* ── 14 septies. Ce que l'Assistant entend (le webhook en porte la copie) ── */
const idWa = 'gerard-2026-10-28-c1-whatsapp';
dit('chaque libellé de bouton de ses modèles a son geste ; la charge porte la ligne et se relit', [true, { ligneId: idWa, geste: 'NON' }, null, null],
  [Object.values(MODELES_DE_GERARD).every((m) => m.boutons.every((b) => b in GESTE_DU_LIBELLE)), lisLeBoutonDeLAssistant(charge(idWa, 'Pas cette fois')),
    lisLeBoutonDeLAssistant('MND:1:jour:2026-10-28'), lisLeBoutonDeLAssistant('GERARD:autre-chose:OUI')]);
dit('... la réponse retenue : oui, non, rien pour un merci', ['oui', 'oui', 'non', undefined, 'oui'], (['OUI', 'SOIN', 'NON', 'MERCI', 'CARTE'] as const).map(reponseDuGeste));
const lW = passe({ mode: 'ouvert', approuves: ['gerard_envie', 'gerard_avant', 'gerard_place', 'gerard_endormie'] }, sitWa ? [sitWa] : [])[0];
const boutonsW = (lW?.colis as { composants?: { type: string; parameters: { payload?: string }[] }[] } | undefined)?.composants?.filter((c) => c.type === 'button') ?? [];
dit('la ligne WhatsApp : un bouton de réponse rapide par libellé du modèle, chacun portant sa ligne', [MODELES_DE_GERARD[sitWa!.modele].boutons.length, true],
  [boutonsW.length, boutonsW.every((b) => lisLeBoutonDeLAssistant(b.parameters[0]?.payload)?.ligneId === lW?.id)]);
dit('STOP se reconnaît seul dans le message, jamais au milieu d’une phrase', [true, true, true, true, false, false],
  ['STOP', ' stop.', 'Arrêtez', 'désabonnez-moi', 'je stoppe le resserrage', 'stop ou encore ?'].map(estUnStop));
const ret = (g: Parameters<typeof retourDuBouton>[0]['geste'], garder = false, quand?: string) => retourDuBouton({ geste: g, garder, appel: 'Madame K.', quand, couronneUrl: 'C/', offrirUrl: 'O/' });
dit('le retour d’une phrase : garder confirmé avec sa date ; un autre moment par Ma Couronne ; non sans insister ; la carte cadeau ; rien pour un merci',
  ['C’est noté, Madame K. : la Maison vous attend mardi 3 novembre 2026 à 10 h.', 'assistant-autre', 'C’est noté, Madame K.. La Maison reste là quand l’envie vous prend.', true, null, true],
  [ret('OUI', true, 'mardi 3 novembre 2026 à 10 h')?.texte, ret('NON', true)?.auto, ret('NON')?.texte, /O\/$/.test(ret('CARTE')?.texte ?? ''), ret('MERCI'), /nous notons le soin/.test(ret('SOIN')?.texte ?? '')]);
dit('... aucun retour ne dit « salon », ni un tiret cadratin', true,
  (['OUI', 'SOIN', 'AUTRE', 'NON', 'CARTE'] as const).flatMap((g) => [ret(g), ret(g, true, 'x')]).every((x) => !x || !/salon|—/i.test(x.texte)) && !/salon|—/i.test(ACCUSE_DU_STOP));
const webhook = readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8');
dit('le webhook porte la copie à jour de ce que l’Assistant entend, et ses trois oreilles ne jouent que les messages neufs', [[], true, true, true],
  [copiesAJour(webhook, (p: string) => readFileSync(p, 'utf8')).ecarts, /const b = lisLeBoutonDeLAssistant\(e\.bouton\?\.id\);/.test(webhook),
    /if \(!estNeuf\(e\) \|\| e\.bouton \|\| !estUnStop\(e\.texte\) \|\| tiroirDe\(e\.numero\) !== 'clientes'\) continue;/.test(webhook),
    /if \(!e\.bouton && \(estUnStop\(e\.texte\) \|\| estUneQuestionFranche\(e\.texte\)\)\) continue;/.test(webhook)]);
dit('... STOP pose « non, par stop » sur ses fiches ; la question franche ne répond que si le dernier message est parti seul', [true, true],
  [webhook.includes("nouvelles: { oui: false, le: aujourdhui, par: 'stop' }"), /if \(!partiSeul \|\| !jetonMeta \|\| !phoneIdMeta\) continue;/.test(webhook)]);

/* ── 15. L'écran et la barre ── */
const ecran = sansCommentaires(readFileSync('src/apps/trone/routes/clients/Gerard.tsx', 'utf8'));
const donnees = sansCommentaires(readFileSync('src/apps/trone/routes/clients/gerard-donnees.ts', 'utf8'));
const lecture = sansCommentaires(readFileSync('src/shared/assistant-lecture-pur.ts', 'utf8'));
dit('l’écran : le plan par le cerveau ; la lecture : la venue du Carnet ; le Trône lit par la lecture partagée', [true, true, true],
  [/planDuJour\(fiches, ctx\)/.test(ecran), lecture.includes('encaisse: apptPaidXof(a) > 0, facture: !!a.invoiceId || factures.has(a.id)'),
    /return useMemo\(\(\) => lisLAssistant\(\{/.test(donnees)]);
dit('... le Trône ne fait le passage et les remises que si la fonction serveur se tait (dans le doute, rien)', [2, true],
  [(donnees.match(/if \(tue !== true\)/g) ?? []).length, /const lignes = lignesDuPassage\(\{ cerveau, plan, reglagesGerard: brut/.test(donnees)]);
dit('... le passage du jour au chargement, le bouton WhatsApp, le journal du jour', [true, true, true],
  [/useLePassageDeGerard\(cerveau, plan\)/.test(ecran), /lienWaMe\(cerveau\.telDe\(s\)/.test(ecran), /<h3>Aujourd’hui <span>ce qui est parti<\/span><\/h3>/.test(ecran)]);
const tableau = readFileSync('src/apps/trone/routes/pilotage/Dashboard.tsx', 'utf8');
dit('... et le tableau de bord lance le passage', true, /<PassageDeGerard \/>/.test(tableau));
dit('... le Trône garde le code au registre, fabriqué par la lecture partagée', true, /const code = codeDeLaSituation\(s, o, codesPromoStore\.get\(\)\);/.test(donnees));
dit('l’écran : Pause ou Actif, plus d’essai à cinq ; le plafond en nombre et en francs', [true, false, 2],
  [/metEnPause\(m\.pause/.test(ecran), /essai/i.test(ecran), (ecran.match(/onBlur=\{posePlafond\}/g) ?? []).length]);
dit('Entre deux séances : la fiche lit le souci ouvert, l’écran montre ce que Gérard en sait', [true, true],
  [/souciOuvert: souciOuvertDe\(sesSignalements\)/.test(lecture), /<GerardEntreDeux \/>/.test(ecran)]);
const routes = readFileSync('src/apps/trone/routes/index.tsx', 'utf8');
dit('la barre : Gérard en Clientèle, sous Clientes, et nommé parmi les écrans nés après les départements', [true, true],
  [routes.indexOf("path: '/gerard'") > routes.indexOf("path: '/customers'") && routes.indexOf("path: '/gerard'") < routes.indexOf("path: '/carnet'"),
    /ECRANS_NES_APRES_LES_DEPARTEMENTS[^\n]*'\/gerard'/.test(routes)]);
dit('pas de tiret cadratin dans ce que l’écran et le cerveau disent', [false, false],
  [/—/.test(ecran), /—/.test(sansCommentaires(readFileSync('src/shared/gerard-pur.ts', 'utf8')))]);

console.log(ko === 0 ? '\nGérard tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
