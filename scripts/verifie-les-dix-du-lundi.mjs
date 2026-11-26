import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LES DIX DU LUNDI, EPROUVEES (26 novembre 2026).

   L'audit du Trone, point B2 (« Faire revenir celles qui ont glisse »),
   valide par Yeman : chaque lundi, dix clientes qui ont glisse, leur message
   pret, le bon soin ; le resultat en francs ; et la deuxieme visite proposee
   au fauteuil des la premiere.

   Deux parties :
     1. les regles (src/shared/les-dix-du-lundi-pur.ts et
        la-deuxieme-visite-pur.ts), rejouees sur des fiches fabriquees, et
        confrontees au cerveau de Perle (gerard-pur.ts) : le meme texte, la
        meme ligne au journal, les memes silences ;
     2. les fils : la vue de Perle, l'ecran, le magasin, la carte « Son
        prochain rituel » et « C est regle ».

   `--prouve` : chaque panne ci-dessous est injectee EN MEMOIRE (un greffon
   d esbuild remplace le texte lu, ou la source lue est cassee) et doit faire
   crier au moins une epreuve. Rien n est ecrit dans l arbre. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = 'src/shared/les-dix-du-lundi-pur.ts';
const VISITE = 'src/shared/la-deuxieme-visite-pur.ts';
const lis = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
const prouve = process.argv.includes('--prouve');
let echecs = 0;
const dit = (nom, ok, detail = '') => {
  if (!ok) echecs++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok || !detail ? '' : `\n       ${detail}`}`);
};

/* ── LE PAQUET DES REGLES, avec ou sans panne ── */
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-dix-du-lundi-'));
let rang = 0;
async function charge(panne) {
  const cible = panne ? path.normalize(path.join(racine, panne.fichier)) : null;
  let texte = null;
  if (panne) {
    texte = lis(panne.fichier);
    for (const [avant, apres] of panne.r) {
      if (!texte.includes(avant)) throw new Error(`panne introuvable : ${panne.nom} (${avant.slice(0, 70)})`);
      texte = texte.replace(avant, () => apres);
    }
  }
  const sortie = path.join(dossier, `regles-${rang++}.mjs`);
  await build({
    stdin: {
      contents: "export * as dix from './src/shared/les-dix-du-lundi-pur.ts';\nexport * as g from './src/shared/gerard-pur.ts';\nexport * as v from './src/shared/la-deuxieme-visite-pur.ts';\n",
      resolveDir: racine, loader: 'ts', sourcefile: 'harnais.ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', write: true,
    plugins: [{
      name: 'panne',
      setup(b) {
        if (!panne) return;
        b.onLoad({ filter: /\.ts$/ }, (args) => (path.normalize(args.path) === cible ? { contents: texte, loader: 'ts' } : undefined));
      },
    }],
  });
  return import(pathToFileURL(sortie).href);
}

/* ── LES EPREUVES DES REGLES : une liste de [nom, vrai ?, detail] ── */
function epreuves({ dix, g, v }) {
  const out = [];
  const egal = (nom, attendu, obtenu) => out.push([nom, JSON.stringify(attendu) === JSON.stringify(obtenu), `attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`]);
  const vrai = (nom, ok, detail = '') => out.push([nom, !!ok, detail]);
  const A = '2026-11-26'; // un jeudi, en saison des fetes : les relances de Perle a 14 jours
  const HORS_FETES = '2026-10-15';
  const moins = (j, n) => g.plusJours(j, -n);
  const venue = (date, familles = ['resserrage'], id) => ({ id: id ?? `r-${date}`, date, time: '10:00', status: 'honoré', familles, venu: true });
  const fiche = (o = {}) => ({
    id: 'c1', appel: 'Mme A.', soinDit: 'resserrage des racines', accord: false, stop: false, couronne: false, telephone: true, ecartee: false,
    soucis: [], rdvs: [venue(moins(A, 70))], traces: [], cadence: { iso: null, rythmeJours: null }, ...o,
  });
  const deux = (jours, cadenceJours = 42, aujourdhui = A) => ({
    rdvs: [venue(moins(aujourdhui, jours + cadenceJours), ['resserrage'], 'r0'), venue(moins(aujourdhui, jours), ['resserrage'], 'r1')],
    cadence: { iso: g.plusJours(moins(aujourdhui, jours), cadenceJours), rythmeJours: cadenceJours },
  });
  const cand = (f, marques = {}, apporteXof = 30000) => ({ fiche: f, marques, apporteXof });
  const juge = (c, o = {}) => { const j = dix.jugeLaCandidate(c, { aujourdhui: A, ...o }); return !j ? null : j.dans ? j.retenue.motif : `hors:${j.raison}`; };

  /* La semaine */
  egal('la semaine ISO : jeudi 26 novembre 2026 est en 2026-W48 ; le 1er janvier 2026 en W01 ; le 1er janvier 2027 en 2026-W53',
    ['2026-W48', '2026-W01', '2026-W53'], [dix.semaineIso('2026-11-26'), dix.semaineIso('2026-01-01'), dix.semaineIso('2027-01-01')]);
  egal('le lundi d un dimanche est celui d avant', ['2026-11-23', '2026-11-23'], [dix.lundiDeLaSemaine('2026-11-29'), dix.lundiDeLaSemaine('2026-11-23')]);

  /* Qui a glisse */
  egal('glissee : 60 a 365 jours, rien a venir', [null, 'une-venue', null, null], [
    juge(cand(fiche({ rdvs: [venue(moins(A, 59))] }))),
    juge(cand(fiche({ rdvs: [venue(moins(A, 60))] }))),
    juge(cand(fiche({ rdvs: [venue(moins(A, 366))] }))),
    juge(cand(fiche({ rdvs: [venue(moins(A, 80)), { id: 'f', date: g.plusJours(A, 5), time: '10:00', status: 'confirmé', familles: [], venu: false }] }))),
  ]);
  /* Le motif, dans l ordre de Perle */
  egal('le motif : une seule venue, en retard (cadence passee de dix jours), endormie a 150 jours, meme venue une fois', ['une-venue', 'retard', 'hors:pas-en-retard', 'endormie', 'endormie'], [
    juge(cand(fiche({ rdvs: [venue(moins(A, 70))] }))),
    juge(cand(fiche({ ...deux(80, 42) }))),
    juge(cand(fiche({ rdvs: deux(80, 75).rdvs, cadence: { iso: moins(A, 5), rythmeJours: 75 } }))),
    juge(cand(fiche({ ...deux(160, 42), couronne: true }))),
    juge(cand(fiche({ rdvs: [venue(moins(A, 200))], couronne: true }))),
  ]);
  /* Qui n entre jamais */
  egal('jamais : essai, archivee, diaspora, de passage pose a la main, locks defaits, enfant du foyer, a reprogrammer, STOP', [
    'hors:essai', 'hors:archivee', 'hors:diaspora', 'hors:passage-pose', 'hors:locks', 'hors:enfant', 'hors:a-reprogrammer', 'hors:stop',
  ], [
    juge(cand(fiche(), { essai: true })), juge(cand(fiche(), { archivee: true })), juge(cand(fiche(), { diaspora: true })),
    juge(cand(fiche(), { passagePose: true })), juge(cand(fiche(), { locksDefaits: true })),
    juge(cand(fiche({ enfantDuFoyer: true }))), juge(cand(fiche(), { aReprogrammer: true })), juge(cand(fiche({ stop: true }))),
  ]);
  egal('« de passage » pose par la machine (une seule venue) entre : Perle l ecarte (ecartee), la liste non', 'une-venue',
    juge(cand(fiche({ ecartee: true }), { passagePose: false })));
  /* Le canal, celui de Perle */
  egal('une seule venue sans accord : a la main sur WhatsApp ; endormie sans Ma Couronne ni accord : rien ne lui parvient ; sans numero : rien', [
    'une-venue', 'hors:sans-canal', 'endormie', 'endormie', 'hors:sans-canal',
  ], [
    juge(cand(fiche())),
    juge(cand(fiche({ ...deux(200, 42) }))),
    juge(cand(fiche({ ...deux(200, 42), couronne: true }))),
    juge(cand(fiche({ ...deux(200, 42), accord: true }))),
    juge(cand(fiche({ telephone: false }))),
  ]);
  /* Les silences et les ecarts de Perle */
  egal('silences : souci ouvert, somme due, jamais pour elle, situation eteinte', ['hors:silence', 'hors:silence', 'hors:jamais', 'hors:eteinte'], [
    juge(cand(fiche({ souciOuvert: 'a-voir' }))), juge(cand(fiche({ resteDu: 5000 }))),
    juge(cand(fiche({ jamais: ['une-venue'] }))), dix.jugeLaCandidate(cand(fiche()), { aujourdhui: A, eteintes: ['une-venue'] }).raison === 'eteinte' ? 'hors:eteinte' : 'non',
  ]);
  egal('quatorze jours sur tout ce qui est parti : une envie il y a 10 jours, un message d une autre voix il y a 13 jours', ['hors:recemment', 'hors:recemment', 'une-venue'], [
    juge(cand(fiche({ traces: [{ quand: `${moins(A, 10)}T09:00:00.000Z`, genre: 'envie', modele: 'envie' }] }))),
    juge(cand(fiche({ dernierMessageHorsService: moins(A, 13) }))),
    juge(cand(fiche({ dernierMessageHorsService: moins(A, 14) }))),
  ]);
  egal('l ecart des relances de Perle : 20 jours retient hors des fetes (28), pas pendant (14)', ['hors:recemment', 'une-venue'], [
    (() => { const j = dix.jugeLaCandidate(cand(fiche({ rdvs: [venue(moins(HORS_FETES, 90))], traces: [{ quand: `${moins(HORS_FETES, 20)}T09:00:00.000Z`, genre: 'une-venue', modele: 'place' }] })), { aujourdhui: HORS_FETES }); return j && !j.dans ? `hors:${j.raison}` : j?.retenue?.motif; })(),
    juge(cand(fiche({ traces: [{ quand: `${moins(A, 20)}T09:00:00.000Z`, genre: 'une-venue', modele: 'place' }] }))),
  ]);
  egal('la promesse des deux nouvelles par mois : deux parties en trente jours, la troisieme attend', 'hors:plafond',
    juge(cand(fiche({ traces: [{ quand: `${moins(A, 29)}T09:00:00.000Z`, genre: 'envie', modele: 'envie' }, { quand: `${moins(A, 15)}T09:00:00.000Z`, genre: 'noel', modele: 'fetes' }] }))));
  egal('l endormie : trois relances au plus, six semaines entre deux', ['hors:endormie-assez', 'hors:recemment'], [
    juge(cand(fiche({ ...deux(200, 42), couronne: true, traces: [1, 2, 3].map((k) => ({ quand: `${moins(A, 50 * k)}T09:00:00.000Z`, genre: 'endormie', modele: 'endormie' })) }))),
    juge(cand(fiche({ ...deux(200, 42), couronne: true, traces: [{ quand: `${moins(A, 30)}T09:00:00.000Z`, genre: 'endormie', modele: 'endormie' }] }))),
  ]);
  egal('les listes passees ecartent : plus tard, pas joignable', ['hors:plus-tard', 'hors:injoignable'], [
    juge(cand(fiche()), { ecartees: new Map([['c1', 'plus-tard']]) }), juge(cand(fiche()), { ecartees: new Map([['c1', 'injoignable']]) }),
  ]);

  /* Le rang, et les quatre places des une-venue */
  egal('la fraicheur : 1 a 60 jours, 0,4 a 365 ; le score', [1, 0.4, 40000], [dix.fraicheur(60), Math.round(dix.fraicheur(365) * 1000) / 1000, dix.scoreDuLundi(100000, 365)]);
  const une = Array.from({ length: 8 }, (_, k) => cand(fiche({ id: `u${k}`, rdvs: [venue(moins(A, 65 + k))] }), {}, 10000 + 5000 * k));
  const multi = Array.from({ length: 8 }, (_, k) => cand(fiche({ id: `m${k}`, ...deux(70 + k, 42) }), {}, 50000 + 1000 * k));
  const l1 = dix.choisisLesDix([...une, ...multi], { aujourdhui: A });
  egal('dix au plus ; quatre places gardees aux une-venue (les mieux rangees), six aux autres', [10, 4, 6, 16],
    [l1.lignes.length, l1.lignes.filter((x) => x.venues === 1).length, l1.lignes.filter((x) => x.venues > 1).length, l1.vivier]);
  egal('les une-venue retenues sont les quatre premieres du rang', ['u7', 'u6', 'u5', 'u4'], l1.lignes.filter((x) => x.venues === 1).map((x) => x.clientId));
  egal('la liste suit le rang : ce qu elle a regle, pondere par la fraicheur', 'm7', l1.lignes[0].clientId);
  egal('au-dela des dix : compte, jamais perdu', 6, l1.hors['hors-des-dix']);
  const l2 = dix.choisisLesDix([...une, ...multi.slice(0, 3)], { aujourdhui: A });
  egal('peu d autres : les une-venue prennent les places restantes', [10, 7], [l2.lignes.length, l2.lignes.filter((x) => x.venues === 1).length]);
  egal('les raisons de celles restees dehors se comptent', { diaspora: 1, enfant: 1 },
    dix.choisisLesDix([cand(fiche({ id: 'd' }), { diaspora: true }), cand(fiche({ id: 'e', enfantDuFoyer: true }))], { aujourdhui: A }).hors);

  /* Le message, celui de Perle mot pour mot */
  const places = [{ iso: g.plusJours(A, 2), heure: '10:00' }, { iso: g.plusJours(A, 3), heure: '14:30' }];
  const ctxPerle = { aujourdhui: A, creux: [], remisesRestantes: 0, placesDe: () => places, eteintes: [] };
  const memeQuePerle = (f, motif) => {
    const p = g.situationDuJour(f, ctxPerle);
    const s = dix.situationDuLundi(f, motif, { aujourdhui: A, placesDe: () => places });
    return !!p && !!s && p.genre === motif && p.texte === s.texte && p.modele === s.modele && p.canal === s.canal && !!p.aLaMainSeulement === !!s.aLaMainSeulement
      && JSON.stringify(p.proposition ?? null) === JSON.stringify(s.proposition ?? null);
  };
  vrai('en retard : le texte, le modele, le canal et la proposition de Perle', memeQuePerle(fiche({ ...deux(80, 42), rituel: { serviceIds: ['sv1'], dureeMin: 90, heure: '10:00' } }), 'retard'));
  vrai('une seule venue (pour une creation) : « premier resserrage des racines », comme Perle', memeQuePerle(fiche({ rdvs: [venue(moins(A, 70), ['autre'])] }), 'une-venue'));
  vrai('une seule venue deja resserree : son soin, comme Perle', memeQuePerle(fiche({ rdvs: [venue(moins(A, 70), ['resserrage'])], rituel: { serviceIds: ['sv1'], dureeMin: 60, heure: null } }), 'une-venue'));
  vrai('endormie : ses mois sans venir, sur Ma Couronne, comme Perle', memeQuePerle(fiche({ ...deux(200, 42), couronne: true }), 'endormie'));
  const sMain = dix.situationDuLundi(fiche(), 'une-venue', { aujourdhui: A, placesDe: () => places });
  vrai('sans accord des nouvelles : a la main seulement, sur WhatsApp', sMain && sMain.canal === 'whatsapp' && sMain.aLaMainSeulement === true);

  /* « Envoye » compte pour Perle */
  const ligne = g.ligneALaMain(sMain, { branchId: 'b', aujourdhui: A, maintenantIso: `${A}T09:30:00.000Z`, prenom: 'A' });
  const traces = g.tracesDesEnvois([ligne]).get('c1') ?? [];
  const apres = fiche({ traces });
  egal('« Envoye » ecrit la ligne de Perle : type gerard, a la main, son genre et son modele', ['gerard', 'wa-main', 'à-la-main', 'une-venue', 'place'], [ligne.type, ligne.canal, ligne.statut, ligne.genre, ligne.modele]);
  vrai('… elle compte : Perle se tait quatorze jours, la liste aussi, la promesse la compte',
    traces.length === 1 && g.situationDuJour(apres, { ...ctxPerle, aujourdhui: g.plusJours(A, 5) }) === null
      && dix.cequiLaTait(apres, 'une-venue', { aujourdhui: g.plusJours(A, 5) }) === 'recemment' && g.promesseDe(apres, A).deja === 1);

  /* L etat d une ligne, rejuge a l ecran */
  const lgn = { clientId: 'c1', motif: 'une-venue', derniereVenue: moins(A, 70), venues: 1, apporteXof: 0 };
  const o = { aujourdhui: A, placesDe: () => places };
  egal('l etat : a faire ; rendez-vous repris seule ; une reponse due ; ecrite entre-temps ; un geste ; plus de fiche', [
    'a-faire', 'a-repris', 'tue:repondre', 'tue:recemment', 'injoignable', 'tue:sans-fiche',
  ], [
    dix.etatDeLaLigne(lgn, fiche(), o).etat,
    dix.etatDeLaLigne(lgn, fiche({ rdvs: [venue(moins(A, 70)), { id: 'f', date: g.plusJours(A, 4), time: '10:00', status: 'confirmé', familles: [], venu: false }] }), o).etat,
    (() => { const e = dix.etatDeLaLigne(lgn, fiche({ attendUneReponse: true }), o); return `${e.etat}:${e.raison}`; })(),
    (() => { const e = dix.etatDeLaLigne(lgn, apres, { ...o, aujourdhui: g.plusJours(A, 2) }); return `${e.etat}:${e.raison}`; })(),
    dix.etatDeLaLigne({ ...lgn, geste: { quoi: 'injoignable', le: `${A}T10:00:00Z`, par: 'x' } }, fiche(), o).etat,
    (() => { const e = dix.etatDeLaLigne(lgn, undefined, o); return `${e.etat}:${e.raison}`; })(),
  ]);

  /* Le document */
  const liste = { branchId: 'b', semaine: '2026-W48', lundi: '2026-11-23', figeeLe: 'x', lignes: [lgn], vivier: 1, hors: {} };
  const d1 = dix.figeLaListe({ listes: {} }, liste);
  const d2 = dix.figeLaListe(d1, { ...liste, lignes: [] });
  egal('une liste figee ne se reecrit jamais', 1, d2.listes['b|2026-W48'].lignes.length);
  const g1 = dix.poseLeGeste(d1, 'b|2026-W48', 'c1', { quoi: 'envoye', le: `${A}T10:00:00.000Z`, par: 'x', canal: 'whatsapp', envoiId: 'e' });
  const g2 = dix.poseLeGeste(g1, 'b|2026-W48', 'c1', { quoi: 'plus-tard', le: `${A}T10:00:00.000Z`, par: 'x', jusquau: '2027-02-24' });
  const g3 = dix.retireLeGeste(g1, 'b|2026-W48', 'c1');
  egal('« Envoye » est definitif : ni un second geste, ni « Annuler »', ['envoye', 'envoye'], [g2.listes['b|2026-W48'].lignes[0].geste?.quoi, g3.listes['b|2026-W48'].lignes[0].geste?.quoi]);
  const p1 = dix.poseLeGeste(d1, 'b|2026-W48', 'c1', { quoi: 'injoignable', le: `${A}T10:00:00.000Z`, par: 'x' });
  egal('« Pas joignable » se defait', undefined, dix.retireLeGeste(p1, 'b|2026-W48', 'c1').listes['b|2026-W48'].lignes[0].geste);
  const lu = dix.documentDuLundiLu({ listes: { 'b|2026-W48': { ...liste, lignes: [lgn, lgn, { clientId: 'z', motif: 'autre' }, ...Array.from({ length: 12 }, (_, k) => ({ ...lgn, clientId: `k${k}` }))] }, abime: { semaine: 3 } } });
  egal('lu sans confiance : doublon, motif inconnu et liste abimee tombent, dix au plus', [10, ['b|2026-W48']], [lu.listes['b|2026-W48'].lignes.length, Object.keys(lu.listes)]);
  egal('« Plus tard » : 90 jours, la regle de la Maison', [90, '2027-02-24'], [dix.PLUS_TARD_JOURS,
    dix.documentDuLundiLu({ listes: { k: { ...liste, lignes: [{ ...lgn, geste: { quoi: 'plus-tard', le: `${A}T10:00:00Z`, par: 'x' } }] } } }).listes.k.lignes[0].geste.jusquau]);
  const docEcarte = { listes: {
    'b|2026-W40': { ...liste, semaine: '2026-W40', lignes: [{ ...lgn, clientId: 'p', geste: { quoi: 'plus-tard', le: '2026-10-01T10:00:00Z', par: 'x', jusquau: '2026-12-30' } }, { ...lgn, clientId: 'q', geste: { quoi: 'injoignable', le: '2026-10-01T10:00:00Z', par: 'x' } }] },
    'b|2026-W47': { ...liste, semaine: '2026-W47', lignes: [{ ...lgn, clientId: 'r', geste: { quoi: 'injoignable', le: '2026-11-17T10:00:00Z', par: 'x' } }, { ...lgn, clientId: 's', geste: { quoi: 'envoye', le: '2026-11-17T10:00:00Z', par: 'x', canal: 'whatsapp', envoiId: 'e' } }] },
    'autre|2026-W47': { ...liste, branchId: 'autre', semaine: '2026-W47', lignes: [{ ...lgn, clientId: 't', geste: { quoi: 'injoignable', le: '2026-11-17T10:00:00Z', par: 'x' } }] },
  } };
  egal('ce que les listes passees ecartent : plus tard jusqu a sa date, pas joignable quatre semaines, envoye le temps d une relance, sa branche seule',
    [['p', 'plus-tard'], ['r', 'injoignable'], ['s', 'recemment']], [...dix.ecarteesParLesListes(docEcarte, 'b', A).entries()]);

  /* Le resultat en francs */
  const contact = `${A}T10:00:00.000Z`;
  const rdv = (o2) => ({ id: 'x', clientId: 'c1', date: g.plusJours(A, 10), status: 'honoré', creeLe: `${A}T11:00:00.000Z`, encaisseXof: 25000, ...o2 });
  egal('revenue : pris apres le message, honore dans les 60 jours, ce qu elle a regle', { etat: 'revenue', date: g.plusJours(A, 10), encaisseXof: 25000, rdvId: 'x' },
    dix.retourDuContact({ contactLe: contact, rdvs: [rdv()], aujourdhui: g.plusJours(A, 20) }));
  egal('pas revenue : pris avant le message, sans date de prise, annule, au-dela de 60 jours', [null, null, null, null], [
    dix.retourDuContact({ contactLe: contact, rdvs: [rdv({ creeLe: `${A}T09:00:00.000Z` })], aujourdhui: g.plusJours(A, 20) }),
    dix.retourDuContact({ contactLe: contact, rdvs: [rdv({ creeLe: undefined })], aujourdhui: g.plusJours(A, 20) }),
    dix.retourDuContact({ contactLe: contact, rdvs: [rdv({ status: 'annulé' })], aujourdhui: g.plusJours(A, 20) }),
    dix.retourDuContact({ contactLe: contact, rdvs: [rdv({ date: g.plusJours(A, 61) })], aujourdhui: g.plusJours(A, 70) }),
  ]);
  egal('rendez-vous pris, pas encore venu', 'rdv-pris', dix.retourDuContact({ contactLe: contact, rdvs: [rdv({ status: 'confirmé' })], aujourdhui: g.plusJours(A, 3) })?.etat);
  egal('le bilan : contactees, rendez-vous pris, revenues, francs ; un geste autre qu envoye ne compte pas', { lignes: 4, contactees: 3, rdvPris: 1, revenues: 1, francs: 25000 },
    dix.bilanDuLundi([
      { geste: { quoi: 'envoye' }, retour: { etat: 'revenue', encaisseXof: 25000 } }, { geste: { quoi: 'envoye' }, retour: { etat: 'rdv-pris' } },
      { geste: { quoi: 'envoye' }, retour: null }, { geste: { quoi: 'injoignable' }, retour: { etat: 'revenue', encaisseXof: 99999 } },
    ]));
  const piece = (id, apptId, montant) => ({ id, kind: 'facture', apptId, clientId: 'c1', lines: [{ qty: 1, unitXof: montant, discountPct: 0 }], globalDiscountPct: 0, status: 'payée', date: A });
  const enc = dix.encaisseDesRdvs([
    { id: 'a', invoiceId: 'P1' }, { id: 'b', payments: [{ amountXof: 12000 }] }, { id: 'c', invoiceId: 'P2' }, { id: 'd', invoiceId: 'P2', payments: [{ amountXof: 7000 }] },
  ], [piece('P1', 'a', 30000), piece('P2', 'c', 50000)]);
  egal('ce qu un rendez-vous a rapporte : sa piece, ses versements ; une piece partagee ne compte que les versements du sien', [30000, 12000, 0, 7000],
    ['a', 'b', 'c', 'd'].map((k) => enc.get(k)));

  /* La deuxieme visite */
  const r = (id, date, status = 'honoré') => ({ id, date, status });
  egal('premiere visite : aucun autre rituel honore avant ce jour ; un annule ne compte pas ; le rituel qu on ferme non plus', [true, false, true, true], [
    v.estSaPremiereVisite({ rdvs: [r('x', A)], jour: A, rituelId: 'x' }),
    v.estSaPremiereVisite({ rdvs: [r('y', moins(A, 40)), r('x', A)], jour: A, rituelId: 'x' }),
    v.estSaPremiereVisite({ rdvs: [r('y', moins(A, 40), 'annulé'), r('x', A)], jour: A, rituelId: 'x' }),
    v.estSaPremiereVisite({ rdvs: [r('x', moins(A, 6))], jour: A, rituelId: 'x' }),
  ]);
  vrai('la phrase de la premiere visite, sans point d exclamation', !/!/.test(v.PREMIERE_VISITE_TITRE + v.PREMIERE_VISITE_DIT) && /prochain rituel/.test(v.PREMIERE_VISITE_TITRE));
  return out;
}

/* ── LES PANNES DES REGLES ── */
const PANNES = [
  { nom: 'le « de passage » de la machine ecarte', fichier: PUR, r: [["  if (m.passagePose) return non('passage-pose');", "  if (m.passagePose || f.ecartee) return non('passage-pose');"]] },
  { nom: 'la diaspora entre', fichier: PUR, r: [["  if (m.diaspora) return non('diaspora');\n", '']] },
  { nom: 'un enfant du foyer entre', fichier: PUR, r: [["  if (f.enfantDuFoyer) return non('enfant');\n", '']] },
  { nom: 'un rendez-vous a reprogrammer n arrete rien', fichier: PUR, r: [["  if (m.aReprogrammer) return non('a-reprogrammer');\n", '']] },
  { nom: 'aucune place gardee aux une-venue', fichier: PUR, r: [['export const PLACES_DES_UNE_VENUE = 4;', 'export const PLACES_DES_UNE_VENUE = 0;']] },
  { nom: 'sans fraicheur', fichier: PUR, r: [['  return 1 - (1 - FRAICHEUR_MIN) * t;', '  return 1 + 0 * t;']] },
  { nom: 'les quatorze jours oublies', fichier: PUR, r: [["  if (recemment && ecartJours(recemment, A) < ECART_MIN) return 'recemment';\n", '']] },
  { nom: 'l ecart des relances oublie', fichier: PUR, r: [["  if (relance && ecartJours(relance, A) < intervalleDesRelances(A)) return 'recemment';\n", '']] },
  { nom: 'la promesse des deux par mois oubliee', fichier: PUR, r: [["  if (!promesseDe(f, A).tenue) return 'plafond';\n", '']] },
  { nom: 'l endormie part a la main', fichier: PUR, r: [["  if (!canalDe(f, motif)) return 'sans-canal';\n  return null;", '  return null;']] },
  { nom: 'le motif hors de l ordre de Perle', fichier: PUR, r: [["  if (sansVenir >= ENDORMIE_DES_JOURS) return 'endormie';\n  return venuesDe(f) === 1 ? 'une-venue' : 'retard';", "  if (venuesDe(f) === 1) return 'une-venue';\n  return sansVenir >= ENDORMIE_DES_JOURS ? 'endormie' : 'retard';"]] },
  { nom: 'une cliente a rythme lent passe pour en retard', fichier: PUR, r: [["    if (!c0 || ecartJours(c0.iso, o.aujourdhui) < RELANCE_APRES_CADENCE) return non('pas-en-retard');\n", '']] },
  { nom: 'trois relances d endormie ne suffisent pas', fichier: PUR, r: [["    if (fois.length >= ENDORMIE_FOIS_MAX) return 'endormie-assez';\n", '']] },
  { nom: 'un rendez-vous a venir n arrete rien', fichier: PUR, r: [['  if (prochainRdv(f, aujourdhui)) return null;\n  return { derniere: s0, sansVenir };', '  return { derniere: s0, sansVenir };']] },
  { nom: 'la liste se reecrit', fichier: PUR, r: [['  if (doc.listes[cle]) return doc;\n  return { listes:', '  return { listes:']] },
  { nom: '« Envoye » se defait', fichier: PUR, r: [["  if (i < 0 || !l.lignes[i].geste || l.lignes[i].geste!.quoi === 'envoye') return doc;", '  if (i < 0 || !l.lignes[i].geste) return doc;']] },
  { nom: 'un second geste ecrase le premier', fichier: PUR, r: [['  if (i < 0 || l.lignes[i].geste) return doc;', '  if (i < 0) return doc;']] },
  { nom: 'un rendez-vous sans date de prise compte', fichier: PUR, r: [['.filter((a) => !!a.creeLe && a.creeLe >= o.contactLe &&', ".filter((a) => (a.creeLe ?? '9') >= o.contactLe &&"]] },
  { nom: 'un rendez-vous pris avant le message compte', fichier: PUR, r: [['.filter((a) => !!a.creeLe && a.creeLe >= o.contactLe &&', '.filter((a) => !!a.creeLe &&']] },
  { nom: 'le retour au-dela de 60 jours', fichier: PUR, r: [['export const RETOUR_DANS_LES_JOURS = 60;', 'export const RETOUR_DANS_LES_JOURS = 90;']] },
  { nom: 'le texte n est plus celui de Perle', fichier: PUR, r: [["dejaResserree ? f.soinDit : 'premier resserrage des racines'", "dejaResserree ? f.soinDit : 'premier resserrage'"]] },
  { nom: 'la semaine ISO decalee', fichier: PUR, r: [['Math.floor(rang / 7) + 1', 'Math.floor(rang / 7)']] },
  { nom: '« plus tard » a 30 jours', fichier: PUR, r: [['export const PLUS_TARD_JOURS = ENVIE_REFUSEE_ATTEND;', 'export const PLUS_TARD_JOURS = 30;']] },
  { nom: 'une piece partagee comptee pour chacun', fichier: PUR, r: [['piece && (partage.get(piece.id) ?? 0) <= 1 ?', 'piece ?']] },
  { nom: 'une autre branche ecarte', fichier: PUR, r: [['    if (l.branchId !== branchId) continue;\n', '']] },
  { nom: 'l etat oublie le rendez-vous repris seule', fichier: PUR, r: [["  if (r) return { etat: 'a-repris', date: r.date };\n", '']] },
  { nom: 'l etat oublie la reponse due', fichier: PUR, r: [["  if (f.attendUneReponse) return { etat: 'tue', raison: 'repondre', dit: 'Elle a écrit : lui répondre d’abord.' };\n", '']] },
  { nom: 'la premiere visite compte les annules', fichier: VISITE, r: [["a.status === 'honoré' && ", '']] },
  { nom: 'la premiere visite compte le rituel qu on ferme', fichier: VISITE, r: [['a.id !== o.rituelId && ', '']] },
];

/* ── LES FILS (texte) ── */
const sources = {
  gerard: lis('src/apps/trone/routes/clients/Gerard.tsx'),
  vue: lis('src/apps/trone/routes/clients/LesDixDuLundi.tsx'),
  magasin: lis('src/shared/les-dix-du-lundi.ts'),
  pur: lis(PUR),
  visite: lis(VISITE),
  carte: lis('src/apps/trone/routes/vente/SonProchainRituel.tsx'),
  regle: lis('src/apps/trone/routes/clients/actions.tsx'),
  css: lis('src/apps/trone/routes/clients/les-dix-du-lundi.css'),
};
const remplace = (t, avant, apres) => { if (!t.includes(avant)) throw new Error(`casse introuvable : ${avant.slice(0, 70)}`); return t.replace(avant, () => apres); };
const controles = [
  {
    dit: 'la vue de Perle : « Les dix » dans la barre, et la vue rendue',
    ok: (s) => /type Vue = 'aujourdhui' \| 'lundi' \|/.test(s.gerard) && s.gerard.includes("{ cle: 'lundi', titre: 'Les dix' },")
      && s.gerard.includes("{vue === 'lundi' && <LesDixDuLundi {...propsDesVues} />}") && s.gerard.includes("import LesDixDuLundi from './LesDixDuLundi';"),
    casse: (s) => ({ ...s, gerard: remplace(s.gerard, "{vue === 'lundi' && <LesDixDuLundi {...propsDesVues} />}", '') }),
  },
  {
    dit: 'le jour et la semaine sont ceux du salon, jamais l horloge du poste',
    ok: (s) => s.vue.includes('const jour = momentDuSalon(tick).jour;') && s.vue.includes('const semaine = semaineIso(jour);')
      && s.vue.includes('lisLAssistant({ ...entrees, aujourdhui: jour,') && !/todayISO\(|getHours\(|getDate\(\)/.test(s.vue),
    casse: (s) => ({ ...s, vue: remplace(s.vue, 'const jour = momentDuSalon(tick).jour;', "const jour = new Date().toISOString().slice(0, 10); // todayISO(") }),
  },
  {
    dit: 'la liste ne se fige que tout descendu (fiches, rendez-vous, envois, pieces, le document), une fois, sans rien reecrire',
    ok: (s) => s.vue.includes("const TABLES = ['clients', 'appointments', 'envois', 'invoices'] as const;")
      && s.vue.includes('if (!pret || !abonnementsLus || liste) return;')
      && /lesDixDuLundiStore\.set\(\(prev\) => figeLaListe\(documentDuLundiLu\(prev\), \{/.test(s.vue)
      && s.vue.includes('documentDescendu(CLE_DES_DIX_DU_LUNDI)') && s.vue.includes('aReprogrammer: (rdvsDe.get(c.id) ?? []).some((a) => estAReprogrammer(a)),'),
    casse: (s) => ({ ...s, vue: remplace(s.vue, 'if (!pret || !abonnementsLus || liste) return;', 'if (liste) return;') }),
  },
  {
    dit: '« Envoyer » ecrit la ligne de Perle au journal (a la main, ou la notification de Ma Couronne a l heure de la salle), puis le geste',
    ok: (s) => {
      const c = s.vue.slice(s.vue.indexOf('const noteLEnvoi = '), s.vue.indexOf('const lignes = liste?.lignes'));
      return c.includes('ligne = ligneALaMain(s, outils);') && c.includes('ligneDeNotification(s, { ...outils, compte: cerveau.compteDe(s.clientId),')
        && c.includes('heureDeDepart(maintenant, reglesDepuis(cfg))') && /envoisStore\.set\(\(prev\) => \(prev\.some\(\(e\) => e\.id === ligne\.id\) \? prev :/.test(c)
        && c.indexOf('envoisStore.set(') < c.indexOf("pose(l.clientId, { quoi: 'envoye'");
    },
    casse: (s) => ({ ...s, vue: remplace(s.vue, '    envoisStore.set((prev) => (prev.some((e) => e.id === ligne.id) ? prev : [...prev, ligne as unknown as (typeof prev)[number]]));\n', '') }),
  },
  {
    dit: 'le bouton WhatsApp ouvre le message de Perle suivi de la devise, et note l envoi au meme toucher',
    ok: (s) => s.vue.includes('lienWaMe(cerveau.telDe(s), `${s.texte}\\n${DEVISE_COMPLETE}`)')
      && s.vue.includes('href={lien} target="_blank" rel="noreferrer" onClick={() => noteLEnvoi(l, s)}>Envoyer</a>'),
    casse: (s) => ({ ...s, vue: remplace(s.vue, 'onClick={() => noteLEnvoi(l, s)}>Envoyer</a>', '>Envoyer</a>') }),
  },
  {
    dit: 'Perle en pause : rien ne part',
    ok: (s) => s.vue.includes('const peutEnvoyer = !!s && actif &&') && s.vue.includes('const actif = estActif(reglages);'),
    casse: (s) => ({ ...s, vue: remplace(s.vue, 'const peutEnvoyer = !!s && actif &&', 'const peutEnvoyer = !!s &&') }),
  },
  {
    dit: 'les montants passent par fmtMoney ; le prix du soin est celui de sa tete au catalogue, jamais devine',
    ok: (s) => s.vue.includes('fmtMoney(prix, currency)') && s.vue.includes('tarifDeLaTeteXof(') && s.vue.includes("' · le prix suit le comptage'")
      && !/toLocaleString\(/.test(s.vue) && !/\$\{[^}]*Xof\}\s*F/.test(s.vue),
    casse: (s) => ({ ...s, vue: remplace(s.vue, 'fmtMoney(prix, currency)', 'prix.toLocaleString(\'fr-FR\') + \' F\'') }),
  },
  {
    dit: '« Plus tard » pose 90 jours, « Pas joignable » et « Annuler » passent par la regle',
    ok: (s) => s.vue.includes("jusquau: plusJours(jour, PLUS_TARD_JOURS)") && s.vue.includes("{ quoi: 'injoignable', le: new Date().toISOString(), par }")
      && s.vue.includes('retireLeGeste(documentDuLundiLu(prev), cle, l.clientId)'),
    casse: (s) => ({ ...s, vue: remplace(s.vue, 'jusquau: plusJours(jour, PLUS_TARD_JOURS)', 'jusquau: plusJours(jour, 30)') }),
  },
  {
    dit: 'le magasin : un document, une cle en toutes lettres, la meme que la regle',
    ok: (s) => s.magasin.includes("createStore<DocumentDuLundi>('mnd_les_dix_du_lundi', DOCUMENT_DU_LUNDI_VIDE)")
      && s.magasin.includes("bindDocument(lesDixDuLundiStore, 'mnd_les_dix_du_lundi');") && s.pur.includes("export const CLE_DES_DIX_DU_LUNDI = 'mnd_les_dix_du_lundi';"),
    casse: (s) => ({ ...s, magasin: remplace(s.magasin, "bindDocument(lesDixDuLundiStore, 'mnd_les_dix_du_lundi');", '') }),
  },
  {
    dit: 'la regle est pure : ni magasin, ni reseau, ni horloge, ni React',
    ok: (s) => [s.pur, s.visite].every((t) => !/from '\.\/(store|sync|supabase)'|from 'react'|Date\.now\(|new Date\(\)/.test(t)),
    casse: (s) => ({ ...s, pur: `${s.pur}\nexport const maintenant = () => Date.now();\n` }),
  },
  {
    dit: 'la carte « Son prochain rituel » dit la premiere visite en tete, et le dit a son hote',
    ok: (s) => s.carte.includes('const premiereVisite = useMemo(() => estSaPremiereVisite({ rdvs: siens, jour, rituelId }), [siens, jour, rituelId]);')
      && /\{premiereVisite && !carte\.dejaLa && \(\s*<p className="trv-prochain__premiere" role="note"><b>\{PREMIERE_VISITE_TITRE\}<\/b><span>\{PREMIERE_VISITE_DIT\}<\/span><\/p>\s*\)\}\s*\{corps\}/.test(s.carte)
      && s.carte.includes('valider, aPoser, premiereVisite })}</>;'),
    casse: (s) => ({ ...s, carte: remplace(s.carte, '{premiereVisite && !carte.dejaLa && (', '{false && (') }),
  },
  {
    dit: '« C est regle » : a la premiere visite, l annonce le dit avant « Fermer sans prochain rendez-vous »',
    ok: (s) => s.regle.includes('libelleDuGeste, dejaLa, dejaLaDit, premiereVisite }) => (')
      && s.regle.includes("<b>{premiereVisite ? PREMIERE_VISITE_TITRE : 'Ensuite : son prochain rendez-vous'}</b>"),
    casse: (s) => ({ ...s, regle: remplace(s.regle, "<b>{premiereVisite ? PREMIERE_VISITE_TITRE : 'Ensuite : son prochain rendez-vous'}</b>", "<b>{'Ensuite : son prochain rendez-vous'}</b>") }),
  },
  {
    dit: 'la marque : rayons de 2 a 4 px, aucune obsidienne, aucun point d exclamation a l ecran',
    ok: (s) => [...s.css.matchAll(/border-radius:\s*(\d+)px/g)].every((m) => Number(m[1]) >= 2 && Number(m[1]) <= 4)
      && !/obsidi/i.test(s.css + s.vue) && !/[a-zé’]\s?!\s*['`<]/i.test(s.vue),
    casse: (s) => ({ ...s, css: `${s.css}\n.x { border-radius: 12px; }\n` }),
  },
];

try {
  if (!prouve) {
    const t = await charge(null);
    for (const [nom, ok, detail] of epreuves(t)) dit(nom, ok, detail);
    for (const c of controles) dit(c.dit, c.ok(sources));
  } else {
    const net = await charge(null);
    const sains = epreuves(net).filter(([, ok]) => !ok);
    dit('prouve : les regles saines passent', sains.length === 0, sains.map(([n]) => n).join(' ; '));
    for (const p of PANNES) {
      const t = await charge(p);
      /* Une panne qui fait tomber une epreuve (une exception) crie aussi. */
      let crie;
      try { crie = epreuves(t).filter(([, ok]) => !ok).map(([n]) => n); } catch (e) { crie = [`exception : ${String(e?.message ?? e).slice(0, 80)}`]; }
      dit(`prouve : ${p.nom}`, crie.length > 0, 'la panne passe inapercue');
    }
    for (const c of controles) {
      const ok = c.ok(sources);
      const vu = !c.ok(c.casse(sources));
      dit(`prouve : ${c.dit}`, ok && vu, ok ? 'la panne passe inapercue' : 'le controle echoue deja sans panne');
    }
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

console.log(`\n${echecs ? `${echecs} ECHEC(S)` : 'TOUT EST VERT'}${prouve ? ' (preuve)' : ''}`);
process.exit(echecs ? 1 : 0);
