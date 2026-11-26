import { build, transform } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BLOCS_DE_L_ATTENTE, blocDe } from './attente-copie-serveur.mjs';

/* REMPLIR LA SEMAINE ET LES FINS D APRES-MIDI, EPROUVE (26 novembre 2026).

   Audit du Trone, point B3, valide par Yeman (« construis ») : l occupation
   reelle des fauteuils jour par heure, le chiffre par heure de fauteuil, la
   liste d attente d un jour plein, et la mesure de l offre de semaine.

   Trois parties :
     1. les regles (src/shared/occupation-pur.ts, src/shared/liste-d-attente-pur.ts),
        rejouees sur des cas ;
     2. la porte (demande-submit) : le bloc recopie a l identique, la demande
        relue, un jour ferme refuse, trois jours au plus, la table seule ecrite ;
        la table (0252) : le personnel seul, aucune politique pour anon ;
     3. les ecrans : le site, Ma Couronne, le Calendrier du Trone, la page de
        l occupation et sa place dans la barre.

   `--prouve` casse chaque regle (dans le source, recompile en memoire) et
   chaque texte (en memoire) et attend que son controle la voie. Rien n est
   ecrit sur le disque. */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
const prouve = process.argv.includes('--prouve');
let echecs = 0;
const dit = (nom, ok, detail = '') => {
  if (!ok) echecs++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok || !detail ? '' : `\n       ${detail}`}`);
};

const OCC = 'src/shared/occupation-pur.ts';
const ATT = 'src/shared/liste-d-attente-pur.ts';
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-remplir-la-semaine-'));
let numero = 0;
/** Le module pur, compile depuis son texte (change ou non) : rien sur le disque du depot. */
async function charge(fichier, texte) {
  const sortie = path.join(dossier, `pur-${numero++}.mjs`);
  await build({
    stdin: { contents: texte ?? lis(fichier), resolveDir: path.dirname(path.join(racine, fichier)), loader: 'ts', sourcefile: fichier },
    bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', write: true,
  });
  return import(pathToFileURL(sortie).href);
}

/* ── 1. LES REGLES ── */
function lesRegles(o, a) {
  const res = [];
  const egal = (nom, attendu, obtenu) => res.push({ nom, ok: JSON.stringify(attendu) === JSON.stringify(obtenu), detail: `attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}` });
  const vrai = (nom, ok, detail = '') => res.push({ nom, ok: !!ok, detail });

  /* L'OCCUPATION */
  egal('la periode : les semaines finies hier, ou aujourd hui et celles qui viennent',
    [{ du: '2026-10-29', au: '2026-11-25' }, { du: '2026-11-26', au: '2026-12-23' }],
    [o.periodeDeLOccupation('fait', 4, '2026-11-26'), o.periodeDeLOccupation('pris', 4, '2026-11-26')]);
  egal('ce qui compte : fait = honore ; pris = confirme, en attente, honore ; jamais annule',
    [true, false, false, true, true, true, false],
    [o.compteDansLaVue('honoré', 'fait'), o.compteDansLaVue('confirmé', 'fait'), o.compteDansLaVue('annulé', 'fait'),
      o.compteDansLaVue('confirmé', 'pris'), o.compteDansLaVue('en attente', 'pris'), o.compteDansLaVue('honoré', 'pris'), o.compteDansLaVue('annulé', 'pris')]);
  egal('la fenetre qui recoit : jamais avant 08:30, fermee = rien', [{ debut: 510, fin: 1230 }, { debut: 540, fin: 1200 }, null],
    [o.fenetreQuiRecoit({ closed: false, openMin: 480, closeMin: 1230 }), o.fenetreQuiRecoit({ closed: false, openMin: 540, closeMin: 1200 }), o.fenetreQuiRecoit({ closed: true, openMin: 0, closeMin: 0 })]);
  /* La semaine du 17 novembre 2026 : mardi au vendredi 8 h - 20 h 30, samedi 9 h - 20 h,
     lundi et dimanche fermes, et le jeudi 19 ferme a la main (une journee exceptionnelle). */
  const ouvertureDe = (j) => {
    const rang = o.rangDuJour(j);
    if (j === '2026-11-19' || rang === 0 || rang === 6) return { closed: true, openMin: 0, closeMin: 0 };
    return rang === 5 ? { closed: false, openMin: 540, closeMin: 1200 } : { closed: false, openMin: 480, closeMin: 1230 };
  };
  const rdvs = [
    { date: '2026-11-17', time: '09:00', dureeMin: 120, status: 'honoré', encaisseXof: 5000 },
    { date: '2026-11-17', time: '09:00', dureeMin: 60, status: 'honoré', encaisseXof: 2000 },
    { date: '2026-11-17', time: '10:00', dureeMin: 90, status: 'confirmé', encaisseXof: 0 },
    { date: '2026-11-17', time: '13:00', dureeMin: 60, status: 'annulé', encaisseXof: 0 },
    { date: '2026-11-18', time: '08:00', dureeMin: 60, status: 'honoré', encaisseXof: 3000 },
    { date: '2026-11-19', time: '10:00', dureeMin: 60, status: 'honoré', encaisseXof: 9000 },
    { date: '2026-11-20', time: '10:00', dureeMin: 60, status: 'honoré' },
    { date: '2026-11-20', time: '10:00', dureeMin: 60, status: 'honoré' },
    { date: '2026-11-20', time: '10:00', dureeMin: 60, status: 'honoré' },
    { date: '2026-11-21', time: '14:00', dureeMin: 60, status: 'honoré', encaisseXof: 10000 },
    { date: '2026-11-21', time: '19:30', dureeMin: 60, status: 'honoré', encaisseXof: 0 },
    { date: '2026-11-24', time: '10:00', dureeMin: 60, status: 'honoré', encaisseXof: 7777 },
  ];
  const occ = o.occupationDesFauteuils({ rdvs, du: '2026-11-17', au: '2026-11-23', vue: 'fait', sieges: 2, ouvertureDe });
  const c = (jour, heure) => occ.cases.find((x) => x.jour === jour && x.heure === heure);
  egal('la carte va de 8 h a 20 h (08:30 a 20:30)', [8, 20], [occ.premiereHeure, occ.derniereHeure]);
  egal('mardi 8 h : la demi-heure de 08:30 seulement, deux fauteuils', [60, 0], [c(1, 8).capaciteMin, c(1, 8).occupeMin]);
  egal('mardi 9 h : deux rituels, deux fauteuils, plein', [120, 120, 1], [c(1, 9).capaciteMin, c(1, 9).occupeMin, c(1, 9).taux]);
  egal('mardi 10 h : le confirme ne compte pas dans ce qui s est fait, l annule jamais', [60, 0.5, 0], [c(1, 10).occupeMin, c(1, 10).taux, c(1, 13).occupeMin]);
  egal('mercredi 8 h : un rituel pose a 08:00 ne compte que depuis 08:30', [30, 0.5], [c(2, 8).occupeMin, c(2, 8).taux]);
  egal('jeudi ferme a la main : aucune capacite, et son rituel hors du compte', [0, null, 1], [c(3, 10).capaciteMin, c(3, 10).taux, occ.surFerme]);
  egal('vendredi 10 h : trois tetes pour deux fauteuils ne font pas 150 %', [120, 1], [c(4, 10).occupeMin, c(4, 10).taux]);
  egal('samedi : 9 h ouvre a 9 h, 20 h n offre rien, un rituel de 19 h 30 ne compte que jusqu a la fermeture (20 h)', [120, null, 30],
    [c(5, 9).capaciteMin, c(5, 20).taux, c(5, 19).occupeMin]);
  egal('le dimanche et le lundi ferment : aucune capacite', [0, 0], [occ.jours[6].capaciteMin, occ.jours[0].capaciteMin]);
  egal('la ligne du mardi : 1 jour ouvert, 2 rituels, 24 h de fauteuil, 7 000 F, 292 F l heure', [1, 2, 1440, 7000, 292],
    [occ.jours[1].joursOuverts, occ.jours[1].rdv, occ.jours[1].capaciteMin, occ.jours[1].encaisseXof, occ.jours[1].xofParHeure]);
  egal('la ligne du samedi : 22 h de fauteuil, 10 000 F, 455 F l heure', [1320, 10000, 455], [occ.jours[5].capaciteMin, occ.jours[5].encaisseXof, occ.jours[5].xofParHeure]);
  egal('le total : huit rituels honores dans la periode (ni le jeudi ferme, ni le 24), 20 000 F', [8, 20000], [occ.total.rdv, occ.total.encaisseXof]);
  vrai('le total de l occupation est la somme des lignes', occ.total.occupeMin === occ.jours.reduce((s, l) => s + l.occupeMin, 0) && occ.total.capaciteMin === occ.jours.reduce((s, l) => s + l.capaciteMin, 0));
  const pris = o.occupationDesFauteuils({ rdvs, du: '2026-11-17', au: '2026-11-23', vue: 'pris', sieges: 2, ouvertureDe });
  egal('ce qui est pris compte le confirme du mardi 10 h', [120, 1], [pris.cases.find((x) => x.jour === 1 && x.heure === 10).occupeMin, pris.cases.find((x) => x.jour === 1 && x.heure === 10).taux]);
  const vides = o.heuresLesPlusVides(occ);
  egal('les cinq heures les plus vides : a vide egal, la plus grande capacite, puis l ordre de la semaine',
    [[1, 11], [1, 12], [1, 13], [1, 14], [1, 15]], vides.map((x) => [x.jour, x.heure]));
  vrai('... la phrase les dit en toutes lettres', o.phraseDesHeuresVides(vides).startsWith('mardi 11 h (0 %), mardi 12 h (0 %)'), o.phraseDesHeuresVides(vides));
  egal('les marches de la carte', [-1, 0, 1, 2, 3, 4], [o.marcheDuTaux(null), o.marcheDuTaux(0), o.marcheDuTaux(0.15), o.marcheDuTaux(0.5), o.marcheDuTaux(0.6), o.marcheDuTaux(0.8)]);
  egal('le jour de la semaine se lit a midi UTC : le mercredi 25 novembre 2026 reste un mercredi', [2, 5], [o.rangDuJour('2026-11-25'), o.rangDuJour('2026-11-28')]);

  /* L'OFFRE DE SEMAINE, MESUREE */
  const offre = { id: 'of-1', title: 'Places limitées', code: 'PLACES15', active: true, joursDeLaVenue: ['Mar', 'Mer'], du: '2026-11-10' };
  const rdvsOffre = [
    { date: '2026-11-10', time: '10:00', dureeMin: 60, status: 'honoré', encaisseXof: 5000, codeOffre: 'places15' },
    { date: '2026-11-11', time: '16:00', dureeMin: 60, status: 'honoré', encaisseXof: 3000 },
    { date: '2026-11-12', time: '10:00', dureeMin: 60, status: 'honoré', encaisseXof: 9000 },
    { date: '2026-11-17', time: '10:00', dureeMin: 60, status: 'confirmé', encaisseXof: 0 },
    { date: '2026-11-24', time: '10:00', dureeMin: 60, status: 'honoré', encaisseXof: 9000 },
    { date: '2026-11-03', time: '09:00', dureeMin: 60, status: 'honoré', encaisseXof: 4000 },
    { date: '2026-10-27', time: '17:00', dureeMin: 60, status: 'honoré', encaisseXof: 1000, offreId: 'of-1' },
    { date: '2026-10-26', time: '17:00', dureeMin: 60, status: 'honoré', encaisseXof: 8000 },
  ];
  const m = o.mesureDeLOffre({ offre, rdvs: rdvsOffre, aujourdhui: '2026-11-24' });
  egal('la mesure : pendant du premier jour a hier, avant autant de jours juste avant',
    ['mesuree', '2026-11-10', '2026-11-23', '2026-10-27', '2026-11-09', 14],
    [m.etat, m.pendant?.du, m.pendant?.au, m.avant?.du, m.avant?.au, m.pendant?.jours]);
  egal('... ses seuls jours de venue, les seuls honores, en nombre, en francs, avec son code (son code ou son id)',
    [{ rdv: 2, xof: 8000, code: 1 }, { rdv: 2, xof: 5000, code: 1 }, 0, 3000],
    [{ rdv: m.pendant?.rdv, xof: m.pendant?.encaisseXof, code: m.pendant?.avecLeCode }, { rdv: m.avant?.rdv, xof: m.avant?.encaisseXof, code: m.avant?.avecLeCode }, m.ecartRdv, m.ecartXof]);
  const m15 = o.mesureDeLOffre({ offre, rdvs: rdvsOffre, aujourdhui: '2026-11-24', apresMin: 900 });
  egal('« apres 15 h » ne compte que les rituels qui commencent a 15 h ou apres', [1, 1, 900], [m15.pendant?.rdv, m15.avant?.rdv, m15.apresMin]);
  const passee = o.mesureDeLOffre({ offre: { ...offre, au: '2026-11-16' }, rdvs: rdvsOffre, aujourdhui: '2026-11-24' });
  egal('une offre finie se mesure jusqu a son dernier jour', ['2026-11-16', '2026-11-03', 7], [passee.pendant?.au, passee.avant?.du, passee.pendant?.jours]);
  egal('sans jours, sans premier jour, pas commencee : pas de mesure inventee', ['sans-jours', 'sans-debut', 'pas-commencee'], [
    o.mesureDeLOffre({ offre: { ...offre, joursDeLaVenue: [] }, rdvs: rdvsOffre, aujourdhui: '2026-11-24' }).etat,
    o.mesureDeLOffre({ offre: { ...offre, du: undefined }, rdvs: rdvsOffre, aujourdhui: '2026-11-24' }).etat,
    o.mesureDeLOffre({ offre: { ...offre, du: '2026-11-24' }, rdvs: rdvsOffre, aujourdhui: '2026-11-24' }).etat,
  ]);
  egal('les offres de semaine : celles qui disent leurs jours, de la branche, en ligne d abord, la plus recente ensuite',
    ['b', 'a', 'c'],
    o.offresDeSemaine([
      { id: 'a', active: true, joursDeLaVenue: ['Mer'], du: '2026-11-04', branchId: 'br' },
      { id: 'b', active: true, joursDeLaVenue: ['Mar'], du: '2026-11-05', branchId: 'br' },
      { id: 'c', active: false, joursDeLaVenue: ['Mar'], du: '2026-12-01', branchId: 'br' },
      { id: 'd', active: true, du: '2026-11-05', branchId: 'br' },
      { id: 'e', active: true, joursDeLaVenue: ['Mar'], du: '2026-11-05', branchId: 'autre' },
    ], 'br').map((x) => x.id));

  /* LA LISTE D'ATTENTE */
  egal('une demande relue : le jour, le prenom propre, les gestes, la duree bornee, la tete',
    { ok: true, jour: '2026-11-28', prenom: 'Awa script', serviceIds: ['s1', 's2'], dureeMin: 720, lourde: true },
    a.demandeDAttenteLue({ jour: '2026-11-28', prenom: '  Awa <script> ', serviceIds: ['s1', '', 's2'], dureeMin: 9000, lourde: true }, '2026-11-26'));
  egal('les refus : un jour qui n existe pas, passe, trop loin, sans prenom, sans geste',
    ['jour', 'passe', 'loin', 'prenom', 'gestes'], [
      a.demandeDAttenteLue({ jour: '2026-02-30', prenom: 'Awa', serviceIds: ['s'] }, '2026-01-10').raison,
      a.demandeDAttenteLue({ jour: '2026-11-25', prenom: 'Awa', serviceIds: ['s'] }, '2026-11-26').raison,
      a.demandeDAttenteLue({ jour: '2027-04-01', prenom: 'Awa', serviceIds: ['s'] }, '2026-11-26').raison,
      a.demandeDAttenteLue({ jour: '2026-11-28', prenom: 'A', serviceIds: ['s'] }, '2026-11-26').raison,
      a.demandeDAttenteLue({ jour: '2026-11-28', prenom: 'Awa', serviceIds: [] }, '2026-11-26').raison,
    ]);
  egal('Ma Couronne : le prenom se lit sur sa fiche, la page n a pas a le dire ; le jour meme passe ; la tete lourde seulement si vrai',
    [true, true, false], [
      a.demandeDAttenteLue({ jour: '2026-11-28', serviceIds: ['s'] }, '2026-11-26', false).ok,
      a.demandeDAttenteLue({ jour: '2026-11-26', prenom: 'Awa', serviceIds: ['s'] }, '2026-11-26').ok,
      a.demandeDAttenteLue({ jour: '2026-11-28', prenom: 'Awa', serviceIds: ['s'], lourde: 'oui' }, '2026-11-26').lourde,
    ]);
  egal('l horizon : 124 jours', [true, false], [
    a.demandeDAttenteLue({ jour: '2027-03-30', prenom: 'Awa', serviceIds: ['s'] }, '2026-11-26').ok,
    a.demandeDAttenteLue({ jour: '2027-03-31', prenom: 'Awa', serviceIds: ['s'] }, '2026-11-26').ok,
  ]);
  egal('une demande vit : dans la file ou proposee, jusqu a son jour compris', [true, true, true, false, false, false], [
    a.attenteVivante({ statut: 'attend', jour: '2026-11-28' }, '2026-11-26'), a.attenteVivante({ statut: 'proposee', jour: '2026-11-28' }, '2026-11-26'),
    a.attenteVivante({ statut: 'attend', jour: '2026-11-26' }, '2026-11-26'), a.attenteVivante({ statut: 'attend', jour: '2026-11-25' }, '2026-11-26'),
    a.attenteVivante({ statut: 'prise', jour: '2026-11-28' }, '2026-11-26'), a.attenteVivante({ statut: 'sans-reponse', jour: '2026-11-28' }, '2026-11-26'),
  ]);
  const base = { branchId: 'br', source: 'site', telephone: '+2290100000000', serviceIds: ['s'] };
  const file = [
    { ...base, id: 'z', jour: '2026-11-28', prenom: 'Cyr', creeLe: '2026-11-25T10:00:00Z', statut: 'attend' },
    { ...base, id: 'y', jour: '2026-11-28', prenom: 'Awa', creeLe: '2026-11-24T10:00:00Z', statut: 'attend' },
    { ...base, id: 'x', jour: '2026-11-28', prenom: 'Bea', creeLe: '2026-11-24T11:00:00Z', statut: 'sans-reponse' },
    { ...base, id: 'w', jour: '2026-12-02', prenom: 'Dan', creeLe: '2026-11-20T10:00:00Z', statut: 'proposee' },
    { ...base, id: 'v', jour: '2026-11-20', prenom: 'Eve', creeLe: '2026-11-10T10:00:00Z', statut: 'attend' },
    { ...base, id: 'u', jour: '2026-11-28', prenom: 'Fon', creeLe: '2026-11-01T10:00:00Z', statut: 'attend', branchId: 'autre' },
  ];
  egal('la file d un jour : les vivantes de la branche, la plus ancienne d abord', ['Awa', 'Cyr'], a.fileDuJour(file, '2026-11-28', '2026-11-26', 'br').map((x) => x.prenom));
  egal('les jours qui attendent, dans l ordre ; un jour passe ne se montre plus', [['2026-11-28', 2], ['2026-12-02', 1]],
    a.joursQuiAttendent(file, '2026-11-26', 'br').map((j) => [j.jour, j.file.length]));
  egal('la place a offrir : la premiere heure libre, sinon rien', ['14:00', null], [a.laPlaceAOffrir(['14:00', '15:00']), a.laPlaceAOffrir([])]);
  const mot = a.messageDeLaPlaceLiberee({ prenom: 'Awa', jour: '2026-11-28' }, '14:00');
  egal('le message : son prenom, le jour et l heure exacts, la question', 'Bonjour Awa, vous nous aviez demandé de vous prévenir : une place s’est libérée le samedi 28 novembre à 14 h à la Maison MND. Souhaitez-vous que nous vous la gardions ?', mot);
  vrai('... sans point d exclamation, sans la devise (l ecran la pose)', !/!/.test(mot) && !/ɖɛkpɛ/.test(mot));
  egal('les jours dits : le 1er, les demi-heures', ['mardi 1er décembre', '14 h 30', '9 h'], [a.jourDitDeLAttente('2026-12-01'), a.heureDiteDeLAttente('14:30'), a.heureDiteDeLAttente('09:00')]);
  egal('la phrase de la file', ['Une cliente attend une place le samedi 28 novembre.', '2 clientes attendent une place le samedi 28 novembre.'], [a.phraseDeLaFile(1, '2026-11-28'), a.phraseDeLaFile(2, '2026-11-28')]);
  const proposee = a.apresLeGeste(file[1], { k: 'proposer', heure: '14:00' }, 'Brice', '2026-11-26T09:00:00Z');
  const prise = a.apresLeGeste(proposee, { k: 'prise' }, 'Brice', '2026-11-26T10:00:00Z');
  egal('les gestes : proposer garde dans la file ; une reponse la close et signe', ['proposee', '14:00', 'Brice', 'prise', '2026-11-26T10:00:00Z', 'Brice'],
    [proposee.statut, proposee.proposee?.heure, proposee.proposee?.par, prise.statut, prise.closeLe, prise.closePar]);
  egal('... la suivante devient la premiere apres « pas de reponse »', ['Cyr'],
    a.fileDuJour([a.apresLeGeste(file[1], { k: 'sans-reponse' }, 'B', 'x'), file[0]], '2026-11-28', '2026-11-26', 'br').map((x) => x.prenom));
  egal('les jours complets proposes : ni libres, ni passes, sans doublon, dans l ordre, bornes',
    ['2026-11-27', '2026-11-28'],
    a.joursCompletsAProposer([{ iso: '2026-11-28', complet: true }, { iso: '2026-11-25', complet: true }, { iso: '2026-11-29', complet: false }, { iso: '2026-11-27', complet: true }, { iso: '2026-11-28', complet: true }, { iso: null, complet: true }], '2026-11-26'));
  egal('... au plus le nombre demande', 1, a.joursCompletsAProposer([{ iso: '2026-11-28', complet: true }, { iso: '2026-11-27', complet: true }], '2026-11-26', 1).length);
  egal('la reponse dite : noté, deja, un numero, trois jours, une panne', [true, true, false, false, false], [
    a.reponseDeLAttenteDite({ ok: true }).ok && /C’est noté/.test(a.reponseDeLAttenteDite({ ok: true }).texte),
    /déjà sur la liste/.test(a.reponseDeLAttenteDite({ ok: true, deja: true }).texte),
    a.reponseDeLAttenteDite({ error: 'telephone' }).ok,
    /trois jours/.test(a.reponseDeLAttenteDite({ error: 'trop' }).texte) ? false : true,
    a.reponseDeLAttenteDite(null).ok,
  ]);
  egal('trois demandes vivantes au plus par numero, sur l horizon de la reservation', [3, 124], [a.ATTENTES_PAR_NUMERO, a.HORIZON_DE_L_ATTENTE_JOURS]);
  return res;
}

try {
  const [o, a] = await Promise.all([charge(OCC), charge(ATT)]);
  for (const r of lesRegles(o, a)) if (!prouve) dit(r.nom, r.ok, r.detail);

  /* ── 2 et 3. LES TEXTES ── */
  const FICHIERS = {
    fonction: 'supabase/functions/demande-submit/index.ts',
    migration: 'supabase/migrations/0252_la_liste_d_attente.sql',
    magasin: 'src/shared/liste-d-attente.ts',
    occPur: OCC,
    attPur: ATT,
    site: 'src/apps/revelateur/ilots/PrevenezMoi.tsx',
    reserver: 'src/apps/revelateur/ilots/Reserver.tsx',
    couronne: 'src/apps/couronne/PrevenezMoi.tsx',
    booking: 'src/apps/couronne/Booking.tsx',
    anglais: 'src/apps/couronne/i18n/en.ts',
    calendrier: 'src/apps/trone/routes/clients/Calendrier.tsx',
    attente: 'src/apps/trone/routes/clients/ListeDAttente.tsx',
    page: 'src/apps/trone/routes/pilotage/Occupation.tsx',
    routes: 'src/apps/trone/routes/index.tsx',
    lunes: 'scripts/verifie-les-douze-lunes.harnais.ts',
  };
  const sources = Object.fromEntries(Object.entries(FICHIERS).map(([k, f]) => [k, existsSync(path.join(racine, f)) ? lis(f) : '']));
  const originaux = Object.fromEntries(BLOCS_DE_L_ATTENTE.map(([nom, src]) => [nom, blocDe(lis(src), nom)]));
  const remplace = (texte, avant, apres) => texte.split(avant).join(apres);
  const corpsDe = (texte, nom) => {
    const d = texte.indexOf(`async function ${nom}(`);
    if (d < 0) return '';
    const k = texte.indexOf('\nasync function ', d + 10);
    const f = texte.indexOf('\nDeno.serve(', d + 10);
    const fin = [k, f].filter((x) => x > 0).sort((x, y) => x - y)[0] ?? texte.length;
    return texte.slice(d, fin);
  };
  const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const controles = [
    ...BLOCS_DE_L_ATTENTE.map(([nom, src]) => ({
      dit: `demande-submit porte le bloc ⟨${nom}⟩ de ${src}, caractere pour caractere`,
      ok: (s) => !!originaux[nom] && blocDe(s.fonction, nom) === originaux[nom],
      casse: (s) => ({ ...s, fonction: remplace(s.fonction, 'export const ATTENTES_PAR_NUMERO = 3;', 'export const ATTENTES_PAR_NUMERO = 30;') }),
    })),
    {
      dit: 'le bloc ne tire rien : ni import, ni magasin, ni base',
      ok: (s) => { const b = blocDe(s.attPur, 'liste-d-attente') ?? ''; return b.length > 500 && !/\bimport\b|supabase|Store|fetch\(/.test(b); },
      casse: (s) => ({ ...s, attPur: remplace(s.attPur, "export const TABLE_DE_L_ATTENTE = 'liste_d_attente';", "export const TABLE_DE_L_ATTENTE = 'liste_d_attente'; import { x } from './store';") }),
    },
    {
      dit: 'la fonction dit sa nouvelle version (2026-11-26-a, la liste d attente)',
      ok: (s) => /const VERSION = '2026-11-26-a · la liste d attente/.test(s.fonction),
      casse: (s) => ({ ...s, fonction: remplace(s.fonction, "const VERSION = '2026-11-26-a · la liste d attente d un jour plein ({ prevenir: place }, du site et de Ma Couronne, table liste_d_attente 0252, bloc ⟨liste-d-attente⟩) ; ", "const VERSION = '") }),
    },
    {
      dit: 'la porte « prevenir » passe avant le seau des depots et avant la reservation de Ma Couronne',
      ok: (s) => {
        const p = s.fonction.indexOf("if (body.prevenir === 'place') {");
        return p > 0 && p < s.fonction.indexOf("if (body.couronne === 'reserver') {") && p < s.fonction.indexOf('if (!(await allowRate(ip))) return');
      },
      casse: (s) => ({ ...s, fonction: remplace(s.fonction, "if (body.prevenir === 'place') {", "if (body.prevenir === 'jamais') {") }),
    },
    {
      dit: 'la porte a son seau, par adresse, et par compte pour Ma Couronne',
      ok: (s) => /if \(!\(await allowRate\(ip, 'prevenir_place', 10\)\)\) return json\(\{ ok: false, error: 'rate_limited' \}, 429\);/.test(corpsDe(s.fonction, 'prevenirDUnePlace'))
        && /allowRate\(uid, 'prevenir_place_compte', 10, 60\)/.test(corpsDe(s.fonction, 'prevenirDUnePlace')),
      casse: (s) => ({ ...s, fonction: remplace(s.fonction, "if (!(await allowRate(ip, 'prevenir_place', 10))) return json({ ok: false, error: 'rate_limited' }, 429);", '') }),
    },
    {
      dit: 'Ma Couronne : sa session, SA fiche ; prenom et numero lus sur la fiche, jamais sur l appareil',
      ok: (s) => {
        const c = corpsDe(s.fonction, 'prevenirDUnePlace');
        return /await admin\.auth\.getUser\(session\)/.test(c) && /!\(pour === uid \|\| String\(fiche\.authUserId \?\? ''\) === uid\)\) return json\(\{ ok: false, error: 'tete' \}, 403\);/.test(c)
          && /prenom = prenomDUsage\(fiche\);/.test(c) && /telephone = telephoneNormalise\(String\(fiche\.phone \?\? ''\)\);/.test(c);
      },
      casse: (s) => ({ ...s, fonction: remplace(s.fonction, "!(pour === uid || String(fiche.authUserId ?? '') === uid)) return json({ ok: false, error: 'tete' }, 403);", "false) return json({ ok: false, error: 'tete' }, 403);") }),
    },
    {
      dit: 'la demande se relit par le bloc ; le prenom n est exige que du site',
      ok: (s) => /const lue = demandeDAttenteLue\(d, aujourdhui, !deLaCouronne\);\s*if \(!lue\.ok\) return json\(\{ ok: false, error: lue\.raison \}, 400\);/.test(corpsDe(s.fonction, 'prevenirDUnePlace')),
      casse: (s) => ({ ...s, fonction: remplace(s.fonction, 'if (!lue.ok) return json({ ok: false, error: lue.raison }, 400);', '') }),
    },
    {
      dit: 'un jour ferme (la semaine, une journee exceptionnelle) ne s attend pas',
      ok: (s) => /if \(ouvertureDuJour\(lue\.jour, semaine, exceptions\)\.closed\) return json\(\{ ok: false, error: 'ferme' \}, 409\);/.test(corpsDe(s.fonction, 'prevenirDUnePlace'))
        && /\.in\('key', \['mnd_settings', 'mnd_horaires_exceptions'\]\)/.test(corpsDe(s.fonction, 'prevenirDUnePlace')),
      casse: (s) => ({ ...s, fonction: remplace(s.fonction, "if (ouvertureDuJour(lue.jour, semaine, exceptions).closed) return json({ ok: false, error: 'ferme' }, 409);", '') }),
    },
    {
      dit: 'le meme jour deja attendu repond « deja » ; trois jours au plus, par la cle du numero',
      ok: (s) => {
        const c = corpsDe(s.fonction, 'prevenirDUnePlace');
        return /\.in\('data->>telephone', numerosDeLaMemePersonne\(telephone\)\)/.test(c) && /if \(vivantes\.some\(\(a\) => a\.jour === lue\.jour\)\) return json\(\{ ok: true, deja: true \}\);/.test(c)
          && /if \(vivantes\.length >= ATTENTES_PAR_NUMERO\) return json\(\{ ok: false, error: 'trop' \}, 409\);/.test(c);
      },
      casse: (s) => ({ ...s, fonction: remplace(s.fonction, "if (vivantes.length >= ATTENTES_PAR_NUMERO) return json({ ok: false, error: 'trop' }, 409);", '') }),
    },
    {
      dit: 'la porte n ecrit que la liste d attente : ni rendez-vous, ni fiche, ni message',
      ok: (s) => {
        const c = corpsDe(s.fonction, 'prevenirDUnePlace');
        return /await admin\.from\(TABLE_DE_L_ATTENTE\)\.insert\(\{ id, branch_id: branche\.id, data: demande \}\)/.test(c)
          && !/from\('(appointments|clients|demandes|envois|fils_wa)'\)\.(insert|update|upsert|delete)/.test(c) && !/graph\.facebook|envoieWa|whatsapp/i.test(c)
          && /statut: 'attend',/.test(c);
      },
      casse: (s) => ({ ...s, fonction: remplace(s.fonction, '  return json({ ok: true });\n}\n\nDeno.serve(', "  await admin.from('appointments').insert({ id });\n  return json({ ok: true });\n}\n\nDeno.serve(") }),
    },
    {
      dit: 'la table (0252) : forme de la Maison, RLS, le personnel seul, aucune politique pour anon, relue a la fin',
      ok: (s) => /create table if not exists public\.liste_d_attente \(\s*id\s+text primary key,\s*branch_id\s+text,\s*data\s+jsonb not null,\s*updated_at timestamptz not null default now\(\)\s*\);/.test(s.migration)
        && /alter table public\.liste_d_attente enable row level security;/.test(s.migration)
        && /create policy liste_d_attente_maison on public\.liste_d_attente for all to authenticated\s*using \(public\.is_staff\(\)\) with check \(public\.is_staff\(\)\);/.test(s.migration)
        && !/to anon/.test(sansCommentaires(s.migration)) && /-- ── RELECTURE/.test(s.migration) && !/drop table/i.test(s.migration),
      casse: (s) => ({ ...s, migration: remplace(s.migration, 'for all to authenticated\n  using (public.is_staff()) with check (public.is_staff());', 'for all to anon, authenticated\n  using (true) with check (true);') }),
    },
    {
      dit: 'le magasin du Trone suit la table liste_d_attente',
      ok: (s) => /bindCollection\(listeDAttenteStore, TABLE_DE_L_ATTENTE\);/.test(s.magasin) && /export const TABLE_DE_L_ATTENTE = 'liste_d_attente';/.test(s.attPur),
      casse: (s) => ({ ...s, magasin: remplace(s.magasin, 'bindCollection(listeDAttenteStore, TABLE_DE_L_ATTENTE);', '') }),
    },
    {
      dit: 'l occupation ne tire que la regle des places : ni magasin, ni base, ni horloge du poste',
      ok: (s) => {
        const imports = [...s.occPur.matchAll(/^import .* from '(.+)';$/gm)].map((x) => x[1]);
        return JSON.stringify(imports) === JSON.stringify(['./agenda-pur']) && !/new Date\(\)|Date\.now\(\)|getHours|getDay\(\)/.test(sansCommentaires(s.occPur));
      },
      casse: (s) => ({ ...s, occPur: remplace(s.occPur, 'export const plusJours', "export const maintenant = () => new Date();\nexport const plusJours") }),
    },
    {
      dit: 'le site : « Prevenez-moi » pose sous le mois par une ligne, seulement quand les places sont lues',
      ok: (s) => /import PrevenezMoi from '\.\/PrevenezMoi';/.test(s.reserver)
        && /<PrevenezMoi pret=\{etatDesPlaces === 'pret'\} agenda=\{agenda\} horizon=\{horizon\} heuresParJour=\{heuresParJour\} serviceIds=\{serviceIds\} dureeMin=\{dureeTotale\} lourde=\{teteLourde\(lockCountAnnonce\)\} aujourdhui=\{jourDeCotonou\(minute \* 60_000\)\} \/>/.test(s.reserver)
        && /if \(!pret \|\| !agenda \|\| serviceIds\.length === 0\) return \[\];/.test(s.site),
      casse: (s) => ({ ...s, site: remplace(s.site, 'if (!pret || !agenda || serviceIds.length === 0) return [];', 'if (!agenda || serviceIds.length === 0) return [];') }),
    },
    {
      dit: 'le site : un jour ferme n est jamais propose, et la demande part a demande-submit',
      ok: (s) => /complet: !jourFermeALaMaison\(agenda, iso\) && \(heuresParJour\.get\(iso\) \?\? 0\) === 0/.test(s.site)
        && /supabase\.functions\.invoke\('demande-submit', \{\s*body: \{ prevenir: 'place', data: \{ jour, prenom, telephone: numero,/.test(s.site),
      casse: (s) => ({ ...s, site: remplace(s.site, 'complet: !jourFermeALaMaison(agenda, iso) && ', 'complet: ') }),
    },
    {
      dit: 'Ma Couronne : sa ligne dans la reservation, une seance seule, sa tete seule (pas un enfant), les murs lus',
      ok: (s) => /import PrevenezMoi from '\.\/PrevenezMoi';/.test(s.booking)
        && /<PrevenezMoi actif=\{totalSessions === 1 && occupesCharges\} cellules=\{calCells\} pour=\{beneficiaire \? null : clientId\} branchId=\{branch\.id\} serviceIds=\{selectedIds\} dureeMin=\{totalDuration\} lourde=\{teteDeLaCible\} \/>/.test(s.booking),
      casse: (s) => ({ ...s, booking: remplace(s.booking, 'pour={beneficiaire ? null : clientId}', 'pour={clientId}') }),
    },
    {
      dit: 'Ma Couronne : sa session parle, jamais un prenom ni un numero tapes ; les jours fermes et passes ecartes',
      ok: (s) => /body: \{ prevenir: 'place', couronne: true, data: \{ jour, pour, branchId, serviceIds, dureeMin, lourde \} \}/.test(s.couronne)
        && /complet: !!c\.iso && !c\.free && !openingForIso\(c\.iso\)\.closed/.test(s.couronne) && /momentDuSalon\(\)\.jour/.test(s.couronne),
      casse: (s) => ({ ...s, couronne: remplace(s.couronne, ' && !openingForIso(c.iso).closed', '') }),
    },
    {
      dit: 'Ma Couronne : ses phrases ont leur anglais (EN_ATTENTE)',
      ok: (s) => /import \{ EN_ATTENTE \} from '\.\/en-attente';/.test(s.anglais) && /\.\.\.EN_ATTENTE,/.test(s.anglais),
      casse: (s) => ({ ...s, anglais: remplace(s.anglais, '  ...EN_ATTENTE,\n', '') }),
    },
    {
      dit: 'le Calendrier montre la liste d attente par une ligne, sans les prix pour un maitre',
      ok: (s) => /import \{ ListeDAttente \} from '\.\/ListeDAttente';/.test(s.calendrier) && /<ListeDAttente sansPrix=\{estMaitre\} \/>/.test(s.calendrier),
      casse: (s) => ({ ...s, calendrier: remplace(s.calendrier, '<ListeDAttente sansPrix={estMaitre} />', '') }),
    },
    {
      dit: 'la place libre se constate par la regle des places du Trone, a l heure de Cotonou',
      ok: (s) => /const places = placesDuJour\(\{\s*iso: jour, aujourdhui, maintenantMin, ouverture: openingForIso\(jour\), durationMin: duree,\s*occupes, bloques: plagesBloquees\(blocages, branch\.id, jour, ''\), sieges: Math\.max\(0, branch\.seats \?\? 0\),/.test(s.attente)
        && /const \{ jour: aujourdhui, minutes: maintenantMin \} = momentDuSalon\(\);/.test(s.attente) && !/todayISO|getHours/.test(sansCommentaires(s.attente))
        && /\.filter\(\(a\) => a\.date === jour && a\.status !== 'annulé'\)/.test(s.attente),
      casse: (s) => ({ ...s, attente: remplace(s.attente, ".filter((a) => a.date === jour && a.status !== 'annulé')", '.filter((a) => a.date === jour)') }),
    },
    {
      dit: 'le message part par la main, signe de la devise, la premiere de la file d abord',
      ok: (s) => /signeLeMessage\(messageDeLaPlaceLiberee\(premiere, heureProposee\)\)/.test(s.attente) && /const premiere = file\[0\];/.test(s.attente)
        && /cheminDeLaConversation\(premiere\.telephone, texte\)/.test(s.attente) && !/envoieWa|functions\.invoke|whatsapp-envoi/.test(s.attente),
      casse: (s) => ({ ...s, attente: remplace(s.attente, 'signeLeMessage(messageDeLaPlaceLiberee(premiere, heureProposee))', 'messageDeLaPlaceLiberee(premiere, heureProposee)') }),
    },
    {
      dit: 'les trois reponses : « Elle l a prise » ouvre la fenetre du rendez-vous, « Pas interessee », « Pas de reponse, a la suivante »',
      ok: (s) => /note\(premiere, \{ k: 'prise' \}\);\s*setAPoser\(\{/.test(s.attente) && /note\(premiere, \{ k: 'pas-interessee' \}\)/.test(s.attente) && /note\(premiere, \{ k: 'sans-reponse' \}\)/.test(s.attente)
        && /Pas de réponse, à la suivante/.test(s.attente),
      casse: (s) => ({ ...s, attente: remplace(s.attente, "note(premiere, { k: 'sans-reponse' })", "note(premiere, { k: 'proposer', heure: '' })") }),
    },
    {
      dit: 'la page : en Direction, onglet des previsions (aucune rubrique de plus), nommee parmi les ecrans nes apres',
      ok: (s) => /\{ path: '\/occupation', label: 'L’occupation', icon: CalendarClock, Component: lazy\(\(\) => import\('\.\/pilotage\/Occupation'\)\) \}/.test(s.routes)
        && /\{ hote: '\/previsions', titre: 'Les prévisions', onglets: \[\{ path: '\/previsions', label: 'Les prévisions' \}, \{ path: '\/occupation', label: 'L’occupation' \}\] \}/.test(s.routes)
        && /ECRANS_NES_APRES_LES_DEPARTEMENTS: readonly string\[\] = \[[^\]]*'\/occupation'/.test(s.routes),
      casse: (s) => ({ ...s, routes: remplace(s.routes, ", '/demander', '/occupation'];", ", '/demander'];") }),
    },
    {
      dit: 'la page lit l heure de Cotonou, l encaisse de la Maison, ses murs ; aucune librairie de graphiques',
      ok: (s) => /const aujourdhui = momentDuSalon\(\)\.jour;/.test(s.page) && /encaisseXof: apptPaidXof\(a\)/.test(s.page) && /ouvertureDe: openingForIso/.test(s.page)
        && !/todayISO|getHours|recharts|chart\.js|d3|victory|nivo/.test(sansCommentaires(s.page)) && /fmtMoney\(/.test(s.page),
      casse: (s) => ({ ...s, page: remplace(s.page, 'encaisseXof: apptPaidXof(a)', 'encaisseXof: a.paidXof') }),
    },
    {
      dit: 'la page dit l ecart de l offre de semaine et sa limite (l heure ne se regle pas dans une offre)',
      ok: (s) => /mesureDeLOffre\(\{ offre, rdvs: lus, aujourdhui, apresMin: heures === 'toutes' \? null : Number\(heures\) \}\)/.test(s.page)
        && /L’heure de la venue ne se règle pas encore dans une offre/.test(s.page),
      casse: (s) => ({ ...s, page: remplace(s.page, "apresMin: heures === 'toutes' ? null : Number(heures)", 'apresMin: null') }),
    },
    {
      dit: 'les douze lunes connaissent l original de la copie (R8)',
      ok: (s) => /'liste-d-attente': \{ fichier: 'src\/shared\/liste-d-attente-pur\.ts', extrait: \(s\) => entre\(s, 'liste-d-attente'\) \},/.test(s.lunes),
      casse: (s) => ({ ...s, lunes: remplace(s.lunes, "'liste-d-attente': { fichier", "'liste-d-attente-x': { fichier") }),
    },
  ];

  if (!prouve) {
    for (const c of controles) dit(c.dit, c.ok(sources));
    /* La fonction se lit encore : esbuild la transpile sans erreur. */
    let lisible = true;
    try { await transform(sources.fonction, { loader: 'ts' }); } catch { lisible = false; }
    dit('demande-submit se transpile (aucune syntaxe cassee)', lisible);
  } else {
    /* Les regles, cassees dans leur source et recompilees en memoire. */
    const PANNES_DES_REGLES = [
      ['les jours fermes comptent', OCC, 'const fenetres = new Map(jours.map((j) => [j, fenetreQuiRecoit(o.ouvertureDe(j))]));', "const fenetres = new Map(jours.map((j) => [j, fenetreQuiRecoit({ closed: false, openMin: 480, closeMin: 1230 })]));"],
      ['le premier rendez-vous de 08:30 oublie', OCC, 'const debut = Math.max(o.openMin, PREMIER_RENDEZ_VOUS_MIN);', 'const debut = o.openMin;'],
      ['plus de tetes que de fauteuils depassent 100 %', OCC, 'const occupe = Math.min(capacite, pris);', 'const occupe = pris;'],
      ['le confirme compte dans ce qui s est fait', OCC, "vue === 'fait' ? status === 'honoré'", "vue === 'fait' ? status !== 'annulé'"],
      ['un rituel compte hors des heures qui recoivent', OCC, 'pris += chevauche(debut, debut + duree, Math.max(h * 60, f.debut), Math.min(h * 60 + 60, f.fin));', 'pris += chevauche(debut, debut + duree, h * 60, h * 60 + 60);'],
      ['le chiffre par heure divise par les rituels', OCC, 'l.xofParHeure = l.capaciteMin > 0 ? Math.round(l.encaisseXof / (l.capaciteMin / 60)) : null;', 'l.xofParHeure = l.rdv > 0 ? Math.round(l.encaisseXof / l.rdv) : null;'],
      ['les heures vides ne se rangent pas par capacite', OCC, '|| b.capaciteMin - a.capaciteMin ', ''],
      ['la mesure compte tous les jours de la semaine', OCC, "|| !rangs.has(rangDuJour(j))) continue;", ') continue;'],
      ['la mesure compte les confirmes', OCC, "r.status !== 'honoré' || !rangs", "r.status === 'annulé' || !rangs"],
      ['la fenetre d avant n a pas la meme longueur', OCC, 'const avantDu = plusJours(o.offre.du, -longueur);', 'const avantDu = plusJours(o.offre.du, -7);'],
      ['la mesure devine un debut', OCC, "if (!o.offre.du || !JOUR_ISO.test(o.offre.du)) return { etat: 'sans-debut' };", ''],
      ['« apres 15 h » ignore', OCC, 'if (apres !== null && !(minutesDe(r.time) >= apres)) continue;', ''],
      ['une demande d un jour passe passe', ATT, "if (jour < aujourdhui) return { ok: false, raison: 'passe' };", ''],
      ['l horizon ne borne plus', ATT, "if (ecartDeLAttente(aujourdhui, jour) > HORIZON_DE_L_ATTENTE_JOURS) return { ok: false, raison: 'loin' };", ''],
      ['le site passe sans prenom', ATT, "if (prenomExige && prenom.length < 2) return { ok: false, raison: 'prenom' };", ''],
      ['une demande sans geste passe', ATT, "if (serviceIds.length === 0) return { ok: false, raison: 'gestes' };", ''],
      ['une demande close reste vivante', ATT, "(a.statut === 'attend' || a.statut === 'proposee') && ", ''],
      ['la file se range a l envers', ATT, 'String(a.creeLe).localeCompare(String(b.creeLe))', 'String(b.creeLe).localeCompare(String(a.creeLe))'],
      ['la file melange les branches', ATT, "attenteVivante(a, aujourdhui) && (!branchId || a.branchId === branchId))\n    .sort", 'attenteVivante(a, aujourdhui))\n    .sort'],
      ['un jour passe reste propose aux clientes', ATT, '&& (c.iso as string) >= aujourdhui', ''],
      ['« pas de reponse » garde la demande dans la file', ATT, "return { ...a, statut: g.k, closeLe: le, ...(par ? { closePar: par } : {}) };", "return { ...a, closeLe: le };"],
    ];
    let muettes = 0;
    for (const [nom, fichier, avant, apres] of PANNES_DES_REGLES) {
      const texte = lis(fichier);
      if (!texte.includes(avant)) { console.log(`INTROUVABLE (regle) ${nom}`); muettes++; continue; }
      const casse = texte.split(avant).join(apres);
      const [o2, a2] = await Promise.all([fichier === OCC ? charge(OCC, casse) : Promise.resolve(o), fichier === ATT ? charge(ATT, casse) : Promise.resolve(a)]);
      let tombees = 0;
      try { tombees = lesRegles(o2, a2).filter((r) => !r.ok).length; } catch { tombees = 1; }
      console.log(`${tombees > 0 ? 'CRIE ' : 'MUETTE'} (regle) ${nom}${tombees > 0 ? ` (${tombees})` : ''}`);
      if (tombees === 0) muettes++;
    }
    for (const c of controles) {
      const ok = c.ok(c.casse(sources));
      console.log(`${ok ? 'MUETTE' : 'CRIE '} ${c.dit}`);
      if (ok) muettes++;
    }
    const intacts = controles.every((c) => c.ok(sources)) && lesRegles(o, a).every((r) => r.ok);
    const total = PANNES_DES_REGLES.length + controles.length;
    console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${total} pannes, le banc crie a chacune.` : `\n${muettes} panne(s) sans cri${intacts ? '' : ', et le banc n est pas vert sans panne'}.`);
    if (muettes > 0 || !intacts) process.exitCode = 1;
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

if (!prouve) {
  console.log(echecs === 0 ? '\nTout tient.' : `\n${echecs} echec(s).`);
  if (echecs > 0) process.exitCode = 1;
}
