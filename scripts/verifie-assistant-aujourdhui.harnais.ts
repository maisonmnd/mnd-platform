/* AUJOURD'HUI, LA VUE D'ENTRÉE DE L'ASSISTANT MAISON, ÉPROUVÉE · 26 octobre 2026.
   `node scripts/verifie-assistant-aujourdhui.mjs` (et `--prouve`).

   Le pur `shared/assistant-aujourdhui-pur` sur des situations, des envois,
   des fils, des soucis, des demandes et des appels fabriqués dont on connaît
   la réponse : la fusion du plan et de la salle, les tuiles, la portée, les
   francs en calibre et fourchette, ce qui est parti, ce qui attend un humain ;
   puis la lettre du fichier. Les clientes sont des initiales. */
import { readFileSync } from 'node:fs';
import {
  FIL_SANS_REPONSE_H, MARGE_DES_FRANCS_PCT, appelWaManque, attendUnHumain, attendUnOui, codeDeLaLigne, demandeATraiter, devenuDit, dureeDite,
  estJoignable, fourchetteDesFrancs, fourchetteDite, francsEnJeu, fusionnePlanEtSalle, heureDuSalonDite, partiAujourdhui, portee, porteeParCanal,
  remiseDite, sommeDesFrancs, tuilesDuJour,
  type AppelWaLu, type DemandeLue, type EnvoiDuJour, type FilLu, type FrancsEnJeu, type SignalementLu,
} from '../src/shared/assistant-aujourdhui-pur';
import { REMISES_PAR_SEMAINE, idDeLaLigne, type FicheDeGerard, type Situation } from '../src/shared/gerard-pur';
import { DEVENU_DIT, typeDit } from '../src/shared/envois';
import { dansLeFiltre, type Demande, type FiltreDesDemandes } from '../src/shared/demandes';
import { meriteUnRappel, type AppelWa } from '../src/shared/appels-wa';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const A = '2026-10-26';
const H = 3_600_000;

/* ── 1. Les francs en jeu : un calibre, une fourchette ── */
dit('32 450 F : calibre 32 000, de 28 000 à 36 000 (dix pour cent, arrondis au millier)', { calibre: 32000, de: 28000, a: 36000 }, fourchetteDesFrancs(32450));
dit('15 000 F : de 13 000 à 17 000 ; 35 000 F : de 31 000 à 39 000', [{ calibre: 15000, de: 13000, a: 17000 }, { calibre: 35000, de: 31000, a: 39000 }],
  [fourchetteDesFrancs(15000), fourchetteDesFrancs(35000)]);
dit('un petit montant garde un millier de marge au moins ; un montant illisible vaut zéro', [{ calibre: 2000, de: 1000, a: 3000 }, { calibre: 0, de: 0, a: 1000 }],
  [fourchetteDesFrancs(1800), fourchetteDesFrancs(Number.NaN)]);
dit('jamais le compte exact : la borne basse est sous le calibre, la haute au-dessus, pour tout montant', true,
  [1800, 15000, 32450, 35000, 120000, 1_250_000].every((x) => { const f = fourchetteDesFrancs(x); return f.de < f.calibre && f.calibre < f.a; }));
dit('la marge est de dix pour cent', 10, MARGE_DES_FRANCS_PCT);
dit('la source : le RDV posé d’abord, sinon le dernier rituel honoré, sinon le tarif de la tête ; sans rien, pas de chiffre', ['rdv-pose', 'dernier-rituel', 'tarif-de-la-tete', null, null],
  [francsEnJeu({ rdvPoseXof: 35000, dernierRituelXof: 30000, tarifDeLaTeteXof: 28000 })?.source, francsEnJeu({ dernierRituelXof: 30000, tarifDeLaTeteXof: 28000 })?.source,
    francsEnJeu({ rdvPoseXof: 0, dernierRituelXof: null, tarifDeLaTeteXof: 28000 })?.source, francsEnJeu({}), francsEnJeu({ rdvPoseXof: 0, dernierRituelXof: Number.NaN })]);
dit('... et le chiffre choisi est arrondi', { calibre: 35000, de: 31000, a: 39000, source: 'rdv-pose' }, francsEnJeu({ rdvPoseXof: 35200, dernierRituelXof: 30000 }));
dit('la somme des fourchettes reste une fourchette ; une liste sans chiffre ne vaut rien', [{ calibre: 67000, de: 59000, a: 75000 }, null],
  [sommeDesFrancs([fourchetteDesFrancs(35000), null, fourchetteDesFrancs(32000)]), sommeDesFrancs([null, undefined])]);
dit('la fourchette dite : « de 28 000 F à 36 000 F », avec les espaces fines ; rien sans chiffre', ['de 28 000 F à 36 000 F', ''],
  [fourchetteDite({ de: 28000, a: 36000 }), fourchetteDite(null)]);

/* ── 2. Le plan fusionné avec la salle ── */
const sit = (clientId: string, canal: Situation['canal'], genre: Situation['genre'], code?: Situation['code']): Situation =>
  ({ clientId, genre, canal, modele: 'envie', variables: [], texte: 'Bonjour.\n\nMaison MND', pourquoi: [], priorite: 50, ...(code ? { code } : {}) });
const env = (o: Partial<EnvoiDuJour> & { id: string }): EnvoiDuJour =>
  ({ type: 'gerard', canal: 'push', statut: 'envoyé', quand: `${A}T07:10:00.000Z`, deposeLe: `${A}T05:00:00.000Z`, ...o });
const plan = [
  sit('fk', 'couronne', 'garder'),
  sit('md', 'couronne', 'creux', { mot: 'CREUX', pct: 15, jusquau: '2026-10-29', jour: '2026-10-29' }),
  sit('ra', 'whatsapp', 'retard'),
  sit('sb', 'whatsapp', 'anniversaire', { mot: 'ANNIV', pct: 10, jusquau: '2026-11-25' }),
  sit('lg', 'couronne', 'envie'),
  sit('tm', 'couronne', 'garder'),
  sit('pn', 'couronne', 'envie'),
];
const envois: EnvoiDuJour[] = [
  /* La ligne d'HIER de R. A. : elle ne doit jamais passer pour celle d'aujourd'hui. */
  env({ id: idDeLaLigne('2026-10-25', 'ra', 'push'), clientId: 'ra', etat: 'remis', quand: '2026-10-25T07:10:00.000Z', genre: 'envie' }),
  env({ id: idDeLaLigne(A, 'fk', 'push'), clientId: 'fk', statut: 'en-attente', partA: `${A}T07:10:00.000Z`, calme: true, genre: 'garder' }),
  env({ id: idDeLaLigne(A, 'md', 'push'), clientId: 'md', etat: 'remis', genre: 'creux', codePromo: 'CREUX15-MD1' }),
  env({ id: idDeLaLigne(A, 'sb', 'wa-main'), clientId: 'sb', canal: 'wa-main', statut: 'à-la-main', genre: 'anniversaire', codePromo: 'ANNIV10-SB1' }),
  env({ id: idDeLaLigne(A, 'lg', 'push'), clientId: 'lg', statut: 'écarté', genre: 'envie' }),
  env({ id: idDeLaLigne(A, 'tm', 'push'), clientId: 'tm', statut: 'retenu', genre: 'garder' }),
  /* Une confirmation du jour, qui n'est pas à l'Assistant. */
  env({ id: 'env-x-wa', type: 'confirmation', canal: 'whatsapp', clientId: 'fk', etat: 'lu' }),
];
const FRANCS: Record<string, number> = { fk: 35000, md: 30000, ra: 32000 };
const francsDe = (id: string): FrancsEnJeu | null => (FRANCS[id] ? francsEnJeu({ rdvPoseXof: FRANCS[id] }) : null);
/* 6 h à Cotonou : la salle part à 8 h 10. */
const matin = Date.parse(`${A}T05:00:00.000Z`);
const fusion = fusionnePlanEtSalle({ plan, envois, aujourdhui: A, maintenantMs: matin, actif: true, francsDe });
dit('chaque situation retrouve SA ligne par son identifiant déterministe : push, sinon wa-main ; la ligne d’hier n’est pas celle d’aujourd’hui',
  [['fk', 'gerard-2026-10-26-fk-push'], ['md', 'gerard-2026-10-26-md-push'], ['ra', undefined], ['sb', 'gerard-2026-10-26-sb-wa-main'], ['lg', 'gerard-2026-10-26-lg-push'], ['tm', 'gerard-2026-10-26-tm-push'], ['pn', undefined]],
  fusion.lignes.map((l) => [l.clientId, l.envoi?.id]));
dit('où elle en est : en salle, partie, à son toucher, à la main, écartée, retenue, pas encore déposée',
  ['en-salle', 'partie', 'a-son-toucher', 'a-la-main', 'ecartee', 'retenue', 'pas-encore'], fusion.lignes.map((l) => l.etat));
dit('le Départ : l’heure de la salle, le devenu, « à son toucher » pour un WhatsApp pas touché',
  ['part à 8 h 10', 'remis', 'à son toucher', DEVENU_DIT['a-la-main'], DEVENU_DIT.ecarte, 'retenue à la main', 'pas encore en salle'], fusion.lignes.map((l) => l.depart));
dit('la Remise : le mot et le pour cent de la situation ; le code réel, lu sur la ligne envois seule', [[undefined, undefined], ['CREUX 15 %', 'CREUX15-MD1'], [undefined, undefined], ['ANNIV 10 %', 'ANNIV10-SB1']],
  fusion.lignes.slice(0, 4).map((l) => [l.remise, l.codePromo]));
dit('... remiseDite ne dit rien sans code', undefined, remiseDite({}));
dit('les francs de la ligne : la fourchette de la cliente, ou rien', [{ calibre: 35000, de: 31000, a: 39000, source: 'rdv-pose' }, null], [fusion.lignes[0].francs, fusion.lignes[4].francs]);
dit('la ligne résumé : 7 lignes, 5 Couronne, 2 WhatsApp, 2 remises, 2 en salle, 2 parties, 1 à son toucher, 1 écartée, et une fourchette de francs',
  { lignes: 7, couronne: 5, whatsapp: 2, remises: 2, enSalle: 2, parties: 2, aSonToucher: 1, ecartees: 1, francs: { calibre: 97000, de: 86000, a: 108000 } }, fusion.resume);
const enPause = fusionnePlanEtSalle({ plan, envois, aujourdhui: A, maintenantMs: matin, actif: false });
dit('en pause : ce qui n’a pas de ligne dort (« en pause »), ce qui est en salle ou parti garde son état', [['ra', 'en-pause', 'en pause'], ['pn', 'en-pause', 'en pause'], ['fk', 'en-salle', 'part à 8 h 10']],
  [enPause.lignes[2], enPause.lignes[6], enPause.lignes[0]].map((l) => [l.clientId, l.etat, l.depart]));
dit('... et sans francsDe, pas de francs', [null, null], [enPause.lignes[0].francs, enPause.resume.francs]);
const dans40 = fusionnePlanEtSalle({ plan: [plan[0]], envois, aujourdhui: A, maintenantMs: Date.parse(`${A}T06:30:00.000Z`), actif: true });
dit('à 7 h 30, la ligne de 8 h 10 « part dans 40 min »', 'part dans 40 min', dans40.lignes[0].depart);

/* ── 2 bis. Le modèle parti seul par le facteur (lot 2 : approuvé chez Meta, ligne `-whatsapp`) ── */
const creux = { mot: 'CREUX' as const, pct: 15, jusquau: '2026-10-29', jour: '2026-10-29' };
const planWa = [sit('ra', 'whatsapp', 'retard'), sit('sb', 'whatsapp', 'anniversaire', { mot: 'ANNIV', pct: 10, jusquau: '2026-11-25' }), sit('zz', 'whatsapp', 'envie'), sit('yy', 'whatsapp', 'envie')];
const envoisWa: EnvoiDuJour[] = [
  env({ id: idDeLaLigne(A, 'ra', 'whatsapp'), clientId: 'ra', canal: 'whatsapp', statut: 'en-attente', partA: `${A}T07:10:00.000Z`, genre: 'retard' }),
  env({ id: idDeLaLigne(A, 'sb', 'whatsapp'), clientId: 'sb', canal: 'whatsapp', etat: 'lu', genre: 'anniversaire', codePromo: 'ANNIV10-SB2' }),
  env({ id: idDeLaLigne(A, 'zz', 'whatsapp'), clientId: 'zz', canal: 'whatsapp', statut: 'retenu', genre: 'envie' }),
];
const fusionWa = fusionnePlanEtSalle({ plan: planWa, envois: envoisWa, aujourdhui: A, maintenantMs: matin, actif: true, partSeule: () => true });
dit('le modèle parti seul par le facteur (ligne « whatsapp ») : retrouvé par son identifiant ; en salle, il « part seul au passage du matin » ; parti, le devenu et son code ; retenu, à la main ; pas encore déposé, il attend le passage, pas un toucher',
  [['gerard-2026-10-26-ra-whatsapp', 'en-salle', 'part seul au passage du matin', undefined], ['gerard-2026-10-26-sb-whatsapp', 'partie', 'lu', 'ANNIV10-SB2'],
    ['gerard-2026-10-26-zz-whatsapp', 'retenue', 'retenue à la main', undefined], [undefined, 'pas-encore', 'pas encore en salle', undefined]],
  fusionWa.lignes.map((l) => [l.envoi?.id, l.etat, l.depart, l.codePromo]));
dit('... rien n’attend un toucher : 2 en salle, 1 partie ; sans le juge partSeule, le modèle non déposé attend son toucher', [{ enSalle: 2, parties: 1, aSonToucher: 0 }, 'a-son-toucher'],
  [{ enSalle: fusionWa.resume.enSalle, parties: fusionWa.resume.parties, aSonToucher: fusionWa.resume.aSonToucher },
    fusionnePlanEtSalle({ plan: [planWa[3]], envois: envoisWa, aujourdhui: A, maintenantMs: matin, actif: true }).lignes[0].etat]);
dit('la colonne Code : le code né ; sinon ce que la fabrication a dit ; sinon « à fabriquer au départ » pour une ligne partie avec sa remise à faire ; rien sans remise, rien pour une ligne écartée',
  ['CREUX15-MD1', 'jour passé, pas de remise', 'à fabriquer au départ', '', ''],
  [codeDeLaLigne({ statut: 'envoyé', codePromo: 'CREUX15-MD1', codeAFaire: creux }), codeDeLaLigne({ statut: 'envoyé', codePromo: '', detailRemise: 'jour passé, pas de remise', codeAFaire: creux }),
    codeDeLaLigne({ statut: 'envoyé', codeAFaire: creux }), codeDeLaLigne({ statut: 'envoyé' }), codeDeLaLigne({ statut: 'écarté', codeAFaire: creux })]);

/* ── 3. Les cinq tuiles ── */
const plafondPlein = { faites: 3, francs: 60000, restantes: 0, remisesParSemaine: REMISES_PAR_SEMAINE, plafondFrancs: 60000 };
const humain = { total: 3, sante: 1 };
const tuiles = tuilesDuJour({ fusion, actif: true, plafond: plafondPlein, humain, oui: { bilans: 2, avis: 1 } });
dit('prêts aujourd’hui : le plan entier quand l’Assistant est actif, Couronne et WhatsApp comptés', { total: 7, couronne: 5, whatsapp: 2, enPause: 0 }, tuiles.prets);
dit('attendent un oui : une carte pour les WhatsApp à un toucher (avec leurs francs), une par bilan et par réponse d’avis ; aucune offre flash n’existe',
  { total: 4, whatsapp: { n: 1, clientIds: ['ra'], francs: { calibre: 32000, de: 28000, a: 36000 } }, offresFlash: 0, bilans: 2, avis: 1, remises: 0 }, tuiles.oui);
dit('attendent un humain : repris tels quels, dont Santé', { total: 3, sante: 1 }, tuiles.humain);
dit('remises de la semaine : les FAITES sur le nombre permis (3 / 8, pas « 8 moins ce qui reste »), les francs sur le plafond', { faites: 3, sur: 8, francs: 60000, plafondFrancs: 60000, pct: 38, pctFrancs: 100 }, tuiles.remises);
dit('francs en jeu : la fourchette du jour', { calibre: 97000, de: 86000, a: 108000 }, tuiles.francs);
const tuilesPause = tuilesDuJour({ fusion: enPause, actif: false, plafond: { ...plafondPlein, francs: 5500, restantes: 5 }, humain: { total: 0, sante: 0 } });
dit('en pause : rien de prêt, 7 qui dorment, aucun WhatsApp à un toucher, et le pour cent des francs suit', [{ total: 0, couronne: 0, whatsapp: 0, enPause: 7 }, 0, 0, 9],
  [tuilesPause.prets, tuilesPause.oui.whatsapp.n, tuilesPause.oui.total, tuilesPause.remises.pctFrancs]);
dit('attendUnOui ne compte pas en dessous de zéro', 0, attendUnOui({ fusion: enPause, actif: false, bilans: -3 }).total);

/* ── 4. La portée ── */
const fiche = (o: Partial<FicheDeGerard> = {}): FicheDeGerard => ({
  id: 'c', appel: 'Madame K.', soinDit: 'resserrage des racines', accord: true, stop: false, couronne: false, telephone: true, ecartee: false,
  soucis: [], rdvs: [], traces: [], cadence: { iso: null, rythmeJours: null }, ...o,
});
const fiches = [
  fiche({ id: 'wa' }),
  fiche({ id: 'cou', couronne: true, accord: false }),
  fiche({ id: 'ecartee', ecartee: true, couronne: true }),
  fiche({ id: 'enfant', enfantDuFoyer: true, couronne: true }),
  fiche({ id: 'stop', stop: true }),
  fiche({ id: 'sans-accord', accord: false }),
  fiche({ id: 'sans-numero', telephone: false }),
];
dit('joignable : un canal pour une sollicitation, ni écartée ni enfant du foyer ; « stop », sans accord ou sans numéro ne le sont pas',
  [true, true, false, false, false, false, false], fiches.map(estJoignable));
dit('la portée du jour : 2 clientes joignables, 1 par Ma Couronne, 1 par WhatsApp', [2, { joignables: 2, couronne: 1, whatsapp: 1 }], [portee(fiches), porteeParCanal(fiches)]);

/* ── 5. Parti aujourd'hui ── */
/* 23 h 30 UTC le 26 : il est 0 h 30 le 27 à Cotonou. */
const nuit = Date.parse('2026-10-26T23:30:00.000Z');
const j = (o: Partial<EnvoiDuJour> & { id: string; quand: string }): EnvoiDuJour => ({ type: 'confirmation', canal: 'whatsapp', statut: 'envoyé', ...o });
const journal: EnvoiDuJour[] = [
  j({ id: 'a', quand: '2026-10-26T10:00:00.000Z', etat: 'lu' }),
  j({ id: 'b', quand: '2026-10-26T23:10:00.000Z', type: 'gerard', canal: 'push', etat: 'remis', genre: 'garder', codePromo: 'CREUX15-B1' }),
  j({ id: 'b2', quand: '2026-10-26T23:10:30.000Z', type: 'gerard', canal: 'push', etat: 'remis', genre: 'envie', codeAFaire: creux }),
  j({ id: 'c', quand: '2026-10-26T23:15:00.000Z', etat: 'lu' }),
  j({ id: 'c2', quand: '2026-10-26T23:18:00.000Z', etat: 'remis' }),
  j({ id: 'd', quand: '2026-10-26T23:20:00.000Z', type: 'rappel-j1', statut: 'échec', codeMeta: 131026, detail: 'Message undeliverable' }),
  j({ id: 'e', quand: '2026-10-26T23:12:00.000Z', type: 'gerard', canal: 'push', statut: 'écarté', genre: 'creux', codeAFaire: creux }),
  j({ id: 'f', quand: '2026-10-26T23:25:00.000Z', type: 'gerard', canal: 'push', statut: 'en-attente', partA: '2026-10-27T07:10:00.000Z' }),
];
const parti = partiAujourdhui(journal, nuit);
dit('le jour se lit à l’heure de Cotonou : à 0 h 30 à Cotonou, on est le 27 ; l’envoi de 10 h UTC du 26 n’en est pas, ce qui attend en salle non plus', ['2026-10-27', 6], [parti.jour, parti.lignes]);
dit('« partis » exclut l’écarté et ce que Meta a refusé à l’envoi : 4 partis sur 6 lignes, 4 remis, 1 lu, 1 à regarder', { partis: 4, remis: 4, lus: 1, enRoute: 0, aRegarder: 1 }, parti.compte);
/* `push` se dit « Ma Couronne » (CANAL_DIT, envois.ts) : le même mot qu'Aujourd'hui pour le même canal. */
dit('groupé par type et canal, dans l’ordre des heures de Cotonou', [['gerard|push', 'Ma Couronne', '0 h 10 à 0 h 12', 3], ['confirmation|whatsapp', 'WhatsApp', '0 h 15 à 0 h 18', 2], ['rappel-j1|whatsapp', 'WhatsApp', '0 h 20', 1]],
  parti.rangees.map((r) => [r.cle, r.parOu, r.heure, r.lignes]));
dit('l’Assistant dit ses genres ; le devenu de chaque rangée ; le motif Meta en français de ce qui n’est pas arrivé',
  [[`${typeDit('gerard')} · garder, envie, creux`, `remis 2, ${DEVENU_DIT.ecarte} 1`, []], ['Confirmation', 'remis 2, lu 1', []], ['Rappel de la veille', 'échec 1', ['ce numéro n’a pas WhatsApp, ou ne peut pas recevoir ce message']]],
  parti.rangees.map((r) => [r.quoi, r.devenu, r.motifs]));
dit('... la rangée écartée ne compte pas parmi les partis', { partis: 2, remis: 2, lus: 0, enRoute: 0, aRegarder: 0 }, parti.rangees[0].compte);
dit('... la colonne Code de la rangée : le code né, « à fabriquer au départ » pour la ligne partie, rien pour l’écartée ; aucune pour une confirmation', [['CREUX15-B1', 'à fabriquer au départ'], []],
  [parti.rangees[0].codes, parti.rangees[1].codes]);
dit('« 8 h 10 », « 0 h », « 14 h 05 » à l’heure de Cotonou', ['8 h 10', '0 h', '14 h 05'],
  [heureDuSalonDite(Date.parse('2026-10-26T07:10:00Z')), heureDuSalonDite(Date.parse('2026-10-26T23:00:00Z')), heureDuSalonDite(Date.parse('2026-10-26T13:05:30Z'))]);
dit('un journal vide : rien', { jour: '2026-10-27', rangees: [], lignes: 0, compte: { partis: 0, remis: 0, lus: 0, enRoute: 0, aRegarder: 0 } }, partiAujourdhui([], nuit));
dit('devenuDit : « remis 4, lu 3, non remis 1 »', 'remis 4, lu 3, non remis 1',
  devenuDit([{ statut: 'envoyé', etat: 'lu' }, { statut: 'envoyé', etat: 'lu' }, { statut: 'envoyé', etat: 'lu' }, { statut: 'envoyé', etat: 'remis' }, { statut: 'échec', etat: 'non-remis' }].map((o, i) => ({ id: String(i), type: 'confirmation', canal: 'whatsapp', quand: '', ...o }))));

/* ── 6. Attend un humain ── */
const midi = Date.parse('2026-10-26T12:00:00.000Z');
const ilYA = (ms: number) => new Date(midi - ms).toISOString();
const signalements: SignalementLu[] = [
  { id: 's1', clientId: 'kt', soucis: ['gratte'], etat: 'ouvert', quand: ilYA(108 * 60_000), texte: 'ça gratte depuis deux jours', canal: 'couronne' },
  { id: 's2', clientId: 'av', soucis: ['cassantes'], etat: 'ouvert', quand: ilYA(72 * H), canal: 'whatsapp' },
  { id: 's3', clientId: 'co', soucis: ['seches'], etat: 'ouvert', quand: ilYA(2 * H), canal: 'couronne' },
  { id: 's4', clientId: 'tr', soucis: ['chute'], etat: 'traite', quand: ilYA(2 * H), canal: 'couronne' },
  { id: 's5', clientId: 'ok', soucis: [], etat: 'ouvert', bien: true, quand: ilYA(2 * H), canal: 'couronne' },
];
const fil = (o: Partial<FilLu> & { numero: string; quand: string; texte: string }): FilLu =>
  ({ nom: o.numero, attendUneReponse: true, ...o, dernierQuiCompte: { quand: o.quand, texte: o.texte, sens: 'entrant' } });
const fils: FilLu[] = [
  fil({ numero: '22997000001', nom: 'B. N.', clientId: 'bn', quand: ilYA(26 * H), texte: 'Et pour une coloration ?' }),
  fil({ numero: '22997000003', nom: 'A. Z.', quand: ilYA(2 * H), texte: 'Mardi 10h svp' }),
  fil({ numero: '22997000004', nom: 'Q. F.', clientId: 'qf', quand: ilYA(1 * H), texte: 'je parle à qui là ?' }),
  /* L'automate a répondu : le fil n'attend plus, même si le dernier mot qui compte est le sien. */
  fil({ numero: '22997000005', nom: 'R. P.', attendUneReponse: false, quand: ilYA(30 * H), texte: 'je peux venir demain ?' }),
];
const demandes: DemandeLue[] = [
  { id: 'd1', statut: 'nouvelle', genre: 'rdv', prenom: 'P.', nom: 'H.', telephone: '+22997000002', createdAt: ilYA(25 * 60_000) },
  { id: 'd2', statut: 'rappelee', genre: 'prospect', prenom: 'L.', telephone: '+22997000006', createdAt: ilYA(3 * H), mot: 'je voudrais des infos' },
  { id: 'd3', statut: 'traitee', prenom: 'T.', telephone: '+22997000007', createdAt: ilYA(1 * H) },
  { id: 'd4', statut: 'nouvelle', archiveeLe: ilYA(H), prenom: 'A.', telephone: '+22997000008', createdAt: ilYA(5 * H) },
];
const appelsWa: AppelWaLu[] = [
  { id: 'w1', numero: '22997000009', sens: 'entrant', etat: 'manque', sonneLe: ilYA(3 * H), nomProfil: 'M. O.' },
  { id: 'w2', numero: '22997000010', sens: 'entrant', etat: 'manque', sonneLe: ilYA(4 * H), rappelId: 'ap-9' },
  { id: 'w3', numero: '22997000011', sens: 'sortant', etat: 'fini', sonneLe: ilYA(4 * H) },
  { id: 'w4', numero: '22997000012', sens: 'entrant', etat: 'fini', sonneLe: ilYA(1 * H), clientId: 'wf' },
  { id: 'w5', numero: '22997000013', sens: 'entrant', etat: 'pris', prisPar: 'N.', sonneLe: ilYA(1 * H) },
];
const appels = [
  { id: 'p1', nom: 'C. D.', motif: 'rappeler pour une place', fait: false, at: ilYA(2 * H), phone: '01 97 00 00 14' },
  { id: 'p2', nom: 'E. F.', motif: 'fait', fait: true, at: ilYA(2 * H) },
];
const nomDe = (id: string) => ({ kt: 'K. T.', av: 'A. V.', wf: 'W. F.' } as Record<string, string>)[id] ?? '';
const attente = attendUnHumain({ signalements, fils, demandes, appelsWa, appels, maintenantMs: midi, nomDe });
dit('ce qui attend un humain, dans l’ordre : Santé, À voir, la question franche, le fil de plus de 24 h, les demandes (les plus anciennes d’abord), les appels WhatsApp manqués, l’appel noté',
  [['sante', 'K. T.'], ['a-voir', 'A. V.'], ['question-franche', 'Q. F.'], ['whatsapp', 'B. N.'], ['site', 'L.'], ['site', 'P. H.'], ['appel-wa', 'M. O.'], ['appel-wa', 'W. F.'], ['appel', 'C. D.']],
  attente.lignes.map((l) => [l.genre, l.nom]));
dit('9 lignes, dont 1 Santé', [9, 1], [attente.total, attente.sante]);
dit('un conseil ouvert, un souci traité, un « tout va bien » n’attendent personne ; un fil répondu depuis 2 h non plus ; ni une demande traitée ou archivée, un appel avec son rappel, un sortant, un pris, un appel fait', false,
  attente.lignes.some((l) => ['souci-s3', 'souci-s4', 'souci-s5', 'fil-22997000003', 'demande-d3', 'demande-d4', 'appel-wa-w2', 'appel-wa-w3', 'appel-wa-w5', 'appel-p2'].includes(l.cle)));
dit('un fil WhatsApp n’a qu’un juge, Fil.attendUneReponse : le dernier mot d’elle depuis 30 h, répondu par l’automate, n’attend pas', false,
  attente.lignes.some((l) => l.cle === 'fil-22997000005'));
dit('ses mots, le temps écoulé, le retard : Santé à 1 h 48 n’est pas en retard, À voir à 3 jours l’est, le fil de 26 h l’est, la question franche d’une heure non',
  [['ça gratte depuis deux jours', '1 h 48', false], ['Cassantes, qui s’amincissent', '3 j', true], ['je parle à qui là ?', '1 h', false], ['Et pour une coloration ?', '26 h', true]],
  attente.lignes.slice(0, 4).map((l) => [l.dit, l.depuis, l.enRetard]));
dit('la demande du site dit sa place demandée ou ses mots, et porte son numéro réduit ; l’appel WhatsApp son numéro ; l’appel noté le sien',
  [['je voudrais des infos', '22997000006'], ['place demandée', '22997000002'], ['appel WhatsApp manqué', '22997000009'], ['rappeler pour une place', '0197000014']],
  [attente.lignes[4], attente.lignes[5], attente.lignes[6], attente.lignes[8]].map((l) => [l.dit, l.numero]));
dit('le seuil du fil : 24 heures', 24, FIL_SANS_REPONSE_H);
dit('les durées dites : « 25 min », « 1 h 48 », « 23 h », « 26 h », « 3 j »', ['25 min', '1 h 48', '23 h', '26 h', '3 j'],
  [25 * 60_000, 108 * 60_000, 23 * H, 26 * H, 72 * H].map(dureeDite));
dit('rien à attendre : zéro', { lignes: [], total: 0, sante: 0 }, attendUnHumain({ signalements: [], fils: [], demandes: [], appelsWa: [], appels: [], maintenantMs: midi }));

/* ── 6 bis. Les juges recopiés disent comme les vrais ── */
const statuts = ['nouvelle', 'rappelee', 'traitee', 'convertie', 'ecartee'] as const;
const cas: Pick<Demande, 'statut' | 'archiveeLe'>[] = statuts.flatMap((statut) => [{ statut }, { statut, archiveeLe: '2026-10-01T00:00:00Z' }]);
dit('« à traiter » dit exactement comme dansLeFiltre(d, « a-traiter ») de demandes.ts', cas.map((d) => dansLeFiltre(d, 'a-traiter' as FiltreDesDemandes)), cas.map(demandeATraiter));
const appelWa = (o: Partial<AppelWa>): AppelWa => ({ id: 'x', callId: 'c', numero: '22997000000', sens: 'entrant', etat: 'manque', sonneLe: '2026-10-26T10:00:00Z', ...o });
const casWa = (['entrant', 'sortant'] as const).flatMap((sens) => (['sonne', 'pris', 'manque', 'fini', 'refuse'] as const).flatMap((etat) =>
  [appelWa({ sens, etat }), appelWa({ sens, etat, prisPar: 'N.' }), appelWa({ sens, etat, rappelId: 'ap-1' })]));
dit('« manqué » dit exactement comme meriteUnRappel de appels-wa.ts, sur trente cas', casWa.map(meriteUnRappel), casWa.map(appelWaManque));

/* ── 7. La lettre du fichier ── */
const brut = readFileSync('src/shared/assistant-aujourdhui-pur.ts', 'utf8');
const pur = sansCommentaires(brut);
/* Les textes du fichier : les chaînes, sans leurs interpolations (un nom de fonction n'est pas un texte). */
const litteraux = [...pur.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ''));
dit('pas de tiret cadratin, pas même dans les commentaires ; jamais slice(0, 10) sur une date ; jamais le mot banni dans un texte', [false, false, false],
  [brut.includes(String.fromCharCode(0x2014)), /slice\(0,\s*10\)/.test(pur), litteraux.some((t) => /salon/i.test(t))]);
dit('le pur ne lit aucun magasin : ni store, ni sync, ni supabase ; conversations.ts n’entre que pour son type', [false, true],
  [/from '\.\/(store|sync|supabase)/.test(pur), pur.includes("import type { Fil } from './conversations';")]);
dit('le fil se juge par Fil.attendUneReponse, la ligne se retrouve par idDeLaLigne (push, whatsapp, wa-main), le jour par jourDuSalon, la tuile par plafond.faites', [true, true, true, true, true],
  [/if \(!f\.attendUneReponse\) continue;/.test(pur), /idDeLaLigne\(o\.aujourdhui, s\.clientId, 'push'\)/.test(pur), /idDeLaLigne\(o\.aujourdhui, s\.clientId, 'whatsapp'\)/.test(pur),
    /jourDuSalon\(new Date\(maintenantMs\)\.toISOString\(\)\)/.test(pur), /faites: o\.plafond\.faites,/.test(pur)]);

console.log(ko === 0 ? '\nAujourd’hui tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
