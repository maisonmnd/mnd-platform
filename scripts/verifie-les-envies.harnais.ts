/* VOS ENVIES ET LE PARCOURS EN AFFICHES, ÉPROUVÉS — `node scripts/verifie-les-envies.mjs`.

   17 novembre 2026 (la consultation en affiches). Le document `mnd_envies`
   (semence, lecture sûre, gestes du Trône), l'aiguillage du site (quelles
   affiches pour quelles réponses), le prix au barème, ce qui se réserve en
   ligne (la règle du serveur), les écrans et les mots du parcours, ce que le
   site dépose, et les branchements : l'îlot, « Votre moment », l'écran du
   Trône, la migration 0231. Les prix sont des exemples. Sortie ASCII : la
   console de Windows.

   17 novembre 2026, au soir : « la decoloration fait partie du process de la
   coloration, ca se reserve directement » (Yeman). La section 6 bis tient la
   semence des besoins (plus de seuil ni de garde « peau » pour elle seule),
   l'aiguillage (Couleur, decoloration comprise, mene au rituel), ce que le
   juge du serveur en dit, et le fichier de reglage a passer en ligne. */
import {
  ENVIES_DE_DEPART, ENVIES_MAX, GESTES_MAX, NOM_MAX, REPONSES_DU_DEBUT,
  affichesADefaire, affichesDesEnvies, affichesDuModele, ajouteUnEcart, ajouteUneEnvie, ajouteUnePaire, auDelaDUneJournee, basculeUnGroupe, basculeUnRendezVous,
  basculeUneEnvie, compteurs, dureeAuCompte, enviesAffichees, enviesSures, etatEnLigne, insecable, interditePar, nomRefuse, parcoursDe, poseLesRituels,
  rangeLesChoisies, renommeUneEnvie, retireUnEcart, retireUneEnvie, retireUnePaire, seTouche, tarifDesNaturels, tientDansUneJournee,
  type Contexte, type ReglagesDesEnvies,
} from '../src/shared/envies-pur';
import { AUCUNE_PREUVE, BESOINS_DE_DEPART, FAMILLES_DE_DEPART, qualifie } from '../src/shared/besoins-pur';
import { ATELIERS_RESERVABLES, lesGestesSeReservent, type AgendaDuServeur } from '../src/shared/place-du-serveur';
import { famillesDeLaPorteDuSite } from '../src/shared/rendez-vous-en-attente-pur';
import {
  AVEC, BESOINS_D_ABORD, LONGUEURS_DITES, REPONSES_VIDES,
  apresLaReponseDuDebut, besoinsAMontrer, comptesDesTranches, prixAPartirDe, besoinsDuSite, consultationADeposer, ecarteesParLaPeau, ecranPrecedent, ecranSuivant, ecranTenu, ecransDe,
  epaisseursDe, ficheADefaire, ficheDuModele, heureEnMots, ilYAPlusDeDates, jourEnPuce, jourEnToutesLettres, joursDeLaVisio, joursDesMoments, joursDuCarnet, moisDesJours,
  motDuRituel, motsDuRendezVous, nomDuModele, nombreTape, numeroDe, numeroEntier, numeroLisible, pasFaits, plageDeLEpaisseur, plageDite, pucesDesJours,
  trancheDuNombre, tranchesDe,
  type Reponses,
} from '../src/apps/revelateur/parcours-en-affiches-pur';
import type { Bande } from '../src/apps/revelateur/prix-calibre';
import { readFileSync } from 'node:fs';

let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};

/* ── ① LA SEMENCE ET LA LECTURE SÛRE ─────────────────────────────────── */
const S = ENVIES_DE_DEPART();
const groupesDe = (r: ReglagesDesEnvies, id: string) => r.envies.find((e) => e.id === id)?.groupes;
dit('onze envies, celles des onze familles des besoins, dans le meme ordre', FAMILLES_DE_DEPART.map((f) => f.id), S.envies.map((e) => e.id));
dit('des noms d affiche : un ou deux mots, vingt-quatre signes au plus', [], S.envies.filter((e) => e.nom.split(' ').length > 2 || e.nom.length > NOM_MAX).map((e) => e.nom));
dit('les groupes de depart : Creer en privee, Reparer en visio et privee, Volume et Structure en visio', [['privee'], ['visio', 'privee'], ['visio'], ['visio']],
  ['creer', 'reparer', 'volume', 'structure'].map((id) => groupesDe(S, id)));
dit('les sept autres en Rituel', ['finition', 'entretien', 'hydratation', 'lavage', 'couleur', 'grands-jours', 'enfants'],
  S.envies.filter((e) => e.groupes.join() === 'rituel').map((e) => e.id));
dit('les trois compteurs de la semence : sept, trois, deux', { rituel: 7, visio: 3, privee: 2 }, compteurs(S));
dit('une seule restriction : Creer et Reparer ; aucune reponse n ecarte rien', [[['creer', 'reparer']], []], [S.paires, S.ecarts]);
dit('le modele : les deux rendez-vous, 25 000 F les 75 locks', { rdv: ['visio', 'privee'], naturels: { prixXof: 25000, lot: 75 } }, S.modele);
dit('a defaire : le rituel de Cheveux libres, et les deux rendez-vous', { rituel: 'sv-plt-45-std', rdv: ['visio', 'privee'] }, S.defaire);
/* Chaque rituel de la semence est celui que `mnd_besoins` propose deja sans point ni preuve, dans la famille de l'envie. */
const B = BESOINS_DE_DEPART();
const PRIX_LUS: Record<string, number> = { 'sv-retouches-post-reprise': 4000, 'sv-atl-ii-e': 20000, 'sv-plt-10-m': 25000, 'sv-plt-05-sig-c': 12000, 'sv-atl-iii-cou-c': 15000 };
const directe = (famille: string, serviceId: string): boolean => {
  const b = B.besoins.find((x) => x.famille === famille && x.prestations.includes(serviceId));
  return !!b && qualifie(B, [b.id], AUCUNE_PREUVE, (id) => PRIX_LUS[id]).lignes.find((l) => l.serviceId === serviceId)?.ok === true;
};
dit('chaque rituel de la semence est propose sans point ni preuve par un besoin de sa famille', [],
  S.envies.flatMap((e) => e.rituels.filter((s) => !directe(e.id, s)).map((s) => `${e.id}:${s}`)));
dit('la couleur vegetale n est pas dans la liste sans seuil : son palier ne demande aucun point', [false, true],
  [B.sansSeuil.includes('sv-atl-iii-cou-c'), directe('couleur', 'sv-atl-iii-cou-c')]);
dit('le rituel du Lavage n est pas de ceux que la garde peau ecarte', false, B.ecartesParLaPeau.includes('sv-plt-05-sig-c'));
dit('Grands jours et Enfants naissent sans rituel : rien d evident', [[], []], ['grands-jours', 'enfants'].map((id) => S.envies.find((e) => e.id === id)?.rituels));

dit('un document vide, casse ou une liste reprend la semence', [11, 11, 11], [enviesSures(null).envies.length, enviesSures('texte').envies.length, enviesSures([1]).envies.length]);
const partiel = enviesSures({
  envies: [
    { id: 'a', nom: '  Un   nom bien trop long pour une affiche  ', groupes: ['rituel', 'visio'], rituels: ['x', 'x', 3, ''] },
    { id: 'b', nom: 'B', groupes: ['privee', 'visio'] },
    { id: 'c', nom: 'C', groupes: [] },
    { id: 'a', nom: 'double' }, { nom: 'sans identifiant' }, 'texte',
  ],
  paires: [['a', 'b'], ['b', 'a'], ['a', 'a'], ['a', 'zz'], 'x'],
  ecarts: [{ reponse: 'maison', envie: 'b' }, { reponse: 'maison', envie: 'b' }, { reponse: 'aucune', envie: 'b' }, { reponse: 'ailleurs', envie: 'zz' }],
  modele: { rdv: [], naturels: { prixXof: -3, lot: 'x' } },
  defaire: { rituel: '', rdv: ['privee', 'autre'] },
});
dit('un document partiel garde ses envies, sans double ni envie sans identifiant', ['a', 'b', 'c'], partiel.envies.map((e) => e.id));
dit('Rituel est seul ; Visio et privee se rangent ; sans groupe lisible, Rituel', [['rituel'], ['visio', 'privee'], ['rituel']], partiel.envies.map((e) => e.groupes));
dit('un nom se coupe a vingt-quatre signes, ses blancs ranges ; les rituels sans double', ['Un nom bien trop long po', ['x']], [partiel.envies[0].nom, partiel.envies[0].rituels]);
dit('les restrictions sans objet tombent, les doubles aussi', [[['a', 'b']], [{ reponse: 'maison', envie: 'b' }]], [partiel.paires, partiel.ecarts]);
dit('un rendez-vous vide reprend les deux ; un tarif illisible reprend la semence', [['visio', 'privee'], { prixXof: 25000, lot: 75 }, ['privee']],
  [partiel.modele.rdv, partiel.modele.naturels, partiel.defaire.rdv]);
dit('un rituel de Cheveux libres retire reste retire', '', partiel.defaire.rituel);

/* ── ② LES GESTES DU TRÔNE ───────────────────────────────────────────── */
const neuve = ajouteUneEnvie(S, '  Tresses  ', 'ev-1');
dit('une envie neuve nait en Rituel, sans rituel', { id: 'ev-1', nom: 'Tresses', groupes: ['rituel'], rituels: [] }, neuve.envies[neuve.envies.length - 1]);
dit('un nom vide ou deja pris (aux accents et a la casse pres) est refuse, rien ne s ecrit', ['vide', 'pris', true, true],
  [nomRefuse(S, '   '), nomRefuse(S, 'CREER'), ajouteUneEnvie(S, 'créer', 'ev-2') === S, ajouteUneEnvie(S, 'Neuve', 'creer') === S]);
dit('renommer : le nom change, l identifiant reste', ['creer', 'Naissance'], (() => { const e = renommeUneEnvie(S, 'creer', 'Naissance').envies[0]; return [e.id, e.nom]; })());
dit('renommer vers un nom pris ne change rien ; garder son propre nom se peut', [true, null], [renommeUneEnvie(S, 'creer', 'Réparer') === S, nomRefuse(S, 'Créer', 'creer')]);
dit('retirer une envie retire ses restrictions avec elle', [10, []], (() => { const x = retireUneEnvie(S, 'reparer'); return [x.envies.length, x.paires]; })());
dit('Rituel prend l envie pour lui seul', ['rituel'], groupesDe(basculeUnGroupe(S, 'reparer', 'rituel'), 'reparer'));
dit('Visio sort une envie du Rituel ; la privee s y ajoute, dans l ordre', [['visio'], ['visio', 'privee']],
  [groupesDe(basculeUnGroupe(S, 'entretien', 'visio'), 'entretien'), groupesDe(basculeUnGroupe(basculeUnGroupe(S, 'entretien', 'privee'), 'entretien', 'visio'), 'entretien')]);
dit('le dernier groupe ne se retire pas : une envie mene toujours quelque part', [true, ['privee']], [basculeUnGroupe(S, 'creer', 'privee') === S, groupesDe(basculeUnGroupe(S, 'reparer', 'visio'), 'reparer')]);
dit('les rituels d une envie : sans double, six au plus', [['a', 'b'], GESTES_MAX], [
  poseLesRituels(S, 'entretien', ['a', 'b', 'a']).envies.find((e) => e.id === 'entretien')?.rituels,
  poseLesRituels(S, 'entretien', ['1', '2', '3', '4', '5', '6', '7', '8']).envies.find((e) => e.id === 'entretien')?.rituels.length,
]);
const avecPaire = ajouteUnePaire(S, 'volume', 'couleur');
dit('une restriction neuve se pose ; la meme a l envers, ou avec elle-meme, ne change rien', [2, true, true, true],
  [avecPaire.paires.length, ajouteUnePaire(avecPaire, 'couleur', 'volume') === avecPaire, ajouteUnePaire(S, 'volume', 'volume') === S, ajouteUnePaire(S, 'volume', 'inconnue') === S]);
dit('une restriction se retire dans les deux sens', [], retireUnePaire(S, 'reparer', 'creer').paires);
const avecEcart = ajouteUnEcart(S, 'ailleurs', 'creer');
dit('une reponse du debut ecarte une envie, une seule fois, et se retire', [[{ reponse: 'ailleurs', envie: 'creer' }], true, []],
  [avecEcart.ecarts, ajouteUnEcart(avecEcart, 'ailleurs', 'creer') === avecEcart, retireUnEcart(avecEcart, 'ailleurs', 'creer').ecarts]);
const deux: ('visio' | 'privee')[] = ['visio', 'privee'];
const seule: ('visio' | 'privee')[] = ['visio'];
dit('le rendez-vous d un parcours a part : l un, l autre ou les deux, jamais aucun', [['privee'], ['visio', 'privee'], true],
  [basculeUnRendezVous(deux, 'visio'), basculeUnRendezVous(seule, 'privee'), basculeUnRendezVous(seule, 'visio') === seule]);

/* ── ③ CE QUE LE SITE MONTRE ─────────────────────────────────────────── */
dit('quatre reponses au debut, trois parcours', ['envies', 'envies', 'modele', 'defaire'], REPONSES_DU_DEBUT.map((x) => parcoursDe(x.id)));
dit('le libelle de la Maison est garde', 'Des locks faites à la Maison MND', REPONSES_DU_DEBUT[0].dit);
dit('une envie ecartee par la reponse ne s affiche pas ; avec l autre reponse, elle revient', [false, true],
  [enviesAffichees(avecEcart, 'ailleurs').some((e) => e.id === 'creer'), enviesAffichees(avecEcart, 'maison').some((e) => e.id === 'creer')]);
const sansNom: ReglagesDesEnvies = { ...S, envies: [...S.envies, { id: 'vide', nom: '', groupes: ['visio'], rituels: [] }] };
dit('une envie sans nom ne s affiche pas, ne se choisit pas, et ne reste pas choisie', [11, ['volume'], ['volume']],
  [enviesAffichees(sansNom, 'maison').length, basculeUneEnvie(sansNom, ['volume'], 'vide'), rangeLesChoisies(sansNom, ['vide', 'volume'], 'maison')]);
/* Une envie se reconnait a son identifiant : la renommer ne touche ni ses restrictions, ni les choix, ni les besoins. */
const renommee = renommeUneEnvie(S, 'creer', 'Naissance');
dit('renommer une envie ne touche ni ses restrictions, ni les choix deja faits, ni les autres envies', [[['creer', 'reparer']], 'creer', ['creer'], 10],
  [renommee.paires, interditePar(renommee, ['reparer'], 'creer') === 'reparer' ? 'creer' : '', rangeLesChoisies(renommee, ['creer'], 'maison'),
    renommee.envies.filter((e, i) => e.nom === S.envies[i].nom).length]);
dit('la premiere touchee grise l autre, dans les deux sens', ['creer', 'reparer', null], [interditePar(S, ['creer'], 'reparer'), interditePar(S, ['reparer'], 'creer'), interditePar(S, ['creer'], 'volume')]);
dit('Reparer ne se touche plus apres Creer ; Creer se retire toujours', [false, true, ['creer'], []],
  [seTouche(S, ['creer'], 'reparer'), seTouche(S, ['creer'], 'creer'), basculeUneEnvie(S, ['creer'], 'reparer'), basculeUneEnvie(S, ['creer'], 'creer')]);
const cinq = ['volume', 'structure', 'finition', 'entretien', 'lavage'];
dit('cinq envies au plus : la sixieme ne chasse rien, et une des cinq se retire toujours', [ENVIES_MAX, false, cinq, true, 4],
  [cinq.length, seTouche(S, cinq, 'couleur'), basculeUneEnvie(S, cinq, 'couleur'), seTouche(S, cinq, 'lavage'), basculeUneEnvie(S, cinq, 'lavage').length]);
dit('une envie inconnue ne se choisit pas', ['volume'], basculeUneEnvie(S, ['volume'], 'inconnue'));
dit('les reglages changent : la premiere choisie reste, l interdite, l ecartee et l inconnue sortent', ['creer', 'volume'],
  rangeLesChoisies(S, ['creer', 'reparer', 'volume', 'inconnue', 'creer'], 'maison'));
dit('une envie ecartee sort des choisies', ['volume'], rangeLesChoisies(avecEcart, ['creer', 'volume'], 'ailleurs'));

/* ── ④ L'AIGUILLAGE : QUELLES AFFICHES POUR QUELLES RÉPONSES ─────────── */
const EN_LIGNE = new Set(['sv-atl-ii-e', 'sv-plt-10-m', 'sv-plt-05-sig-c', 'sv-atl-iii-cou-c', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
const c: Contexte = { seReserve: (id) => EN_LIGNE.has(id), visioOuverte: true };
const vaut = (ids: string[], ctx: Contexte = c, r: ReglagesDesEnvies = S) => affichesDesEnvies(r, ids, ctx);
dit('Entretien et Lavage : un seul rituel, leurs deux prestations, aucune autre affiche',
  { rituel: { prestations: ['sv-atl-ii-e', 'sv-plt-05-sig-c'], envies: ['entretien', 'lavage'] }, regard: null }, vaut(['entretien', 'lavage']));
dit('Volume (Visio) : la visio seule', { rituel: null, regard: { envies: ['volume'], visio: true, privee: false } }, vaut(['volume']));
dit('Creer (Consultation privee) : la privee seule', { rituel: null, regard: { envies: ['creer'], visio: false, privee: true } }, vaut(['creer']));
dit('Reparer (Visio et privee) : les deux affiches', { rituel: null, regard: { envies: ['reparer'], visio: true, privee: true } }, vaut(['reparer']));
dit('une envie en privee seule l emporte sur la visio : un seul rendez-vous', { visio: false, privee: true }, (({ visio, privee }) => ({ visio, privee }))(vaut(['volume', 'creer']).regard!));
dit('Volume et Reparer : les deux affiches', { visio: true, privee: true }, (({ visio, privee }) => ({ visio, privee }))(vaut(['volume', 'reparer']).regard!));
dit('Entretien et Reparer : le rituel d abord, puis ce que la Maison regarde',
  { rituel: { prestations: ['sv-atl-ii-e'], envies: ['entretien'] }, regard: { envies: ['reparer'], visio: true, privee: true } }, vaut(['entretien', 'reparer']));
dit('une envie en Rituel sans rituel se comporte comme une Visio', { rituel: null, regard: { envies: ['grands-jours'], visio: true, privee: false } }, vaut(['grands-jours']));
dit('une envie dont le rituel ne se reserve pas en ligne se comporte comme une Visio', { rituel: null, regard: { envies: ['finition'], visio: true, privee: false } }, vaut(['finition']));
const deuxRituels = poseLesRituels(S, 'entretien', ['sv-atl-ii-e', 'pas-en-ligne']);
dit('un rituel se reserve tout entier ou pas du tout', { rituel: null, regard: { envies: ['entretien'], visio: true, privee: false } }, vaut(['entretien'], c, deuxRituels));
dit('sans visio ouverte, la consultation privee prend sa place', { rituel: null, regard: { envies: ['volume'], visio: false, privee: true } }, vaut(['volume'], { ...c, visioOuverte: false }));
dit('sans visio ouverte, un rituel se reserve toujours', { prestations: ['sv-plt-10-m'], envies: ['hydratation'] }, vaut(['hydratation'], { ...c, visioOuverte: false }).rituel);
dit('la garde peau levee : un rituel qu elle ecarte attend le regard de la Maison',
  { rituel: { prestations: ['sv-atl-ii-e'], envies: ['entretien'] }, regard: { envies: ['lavage'], visio: true, privee: false } },
  vaut(['entretien', 'lavage'], { ...c, ecartees: ['sv-plt-05-sig-c'] }));
dit('la garde peau sans effet sur un rituel qu elle n ecarte pas', null, vaut(['lavage'], { ...c, ecartees: ['sv-plt-20-c'] }).regard);
let gros = S;
for (const [id, rituels] of [['finition', ['r1', 'r2']], ['entretien', ['r3', 'r4']], ['hydratation', ['r5', 'r6']], ['lavage', ['r7', 'r1']], ['couleur', ['r7']]] as [string, string[]][]) gros = poseLesRituels(gros, id, rituels);
dit('six gestes au plus dans la venue : l envie qui deborderait attend la Maison, la suivante qui tient reste',
  { rituel: { prestations: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], envies: ['finition', 'entretien', 'hydratation'] }, regard: { envies: ['lavage', 'couleur'], visio: true, privee: false } },
  vaut(['finition', 'entretien', 'hydratation', 'lavage', 'couleur'], c, gros));
dit('une prestation commune a deux envies ne se compte qu une fois', ['r3', 'r4', 'r7', 'r1'], vaut(['entretien', 'lavage', 'couleur'], c, gros).rituel?.prestations);
dit('sans envie choisie : la Maison regarde, par les deux portes', { rituel: null, regard: { envies: [], visio: true, privee: true } }, vaut([]));
dit('une envie retiree depuis, ou restee sans nom, ne compte plus', [{ rituel: null, regard: { envies: ['volume'], visio: true, privee: false } }, ['volume']],
  [vaut(['inconnue', 'volume']), vaut(['vide', 'volume'], c, sansNom).regard?.envies]);

const m = (rdv: ('visio' | 'privee')[], ctx: Contexte = c) => (({ visio, privee }) => [visio, privee])(affichesDuModele({ ...S, modele: { ...S.modele, rdv } }, ctx).regard!);
dit('le modele : le rendez-vous regle au Trone, jamais de rituel', [[true, true], [true, false], [false, true], null],
  [m(['visio', 'privee']), m(['visio']), m(['privee']), affichesDuModele(S, c).rituel]);
dit('le modele sans visio ouverte : la consultation privee', [false, true], m(['visio'], { ...c, visioOuverte: false }));

const libres: Contexte = { ...c, seReserve: (id) => id === 'sv-plt-45-std' };
dit('Cheveux libres : son rituel, reserve de suite, sans visio ni consultation privee', { rituel: { prestations: ['sv-plt-45-std'], envies: [] }, regard: null }, affichesADefaire(S, 'libres', libres));
dit('Cheveux libres, quand le serveur refuserait le rituel : le rendez-vous regle au Trone', { rituel: null, regard: { envies: [], visio: true, privee: true } }, affichesADefaire(S, 'libres', c));
dit('Nouvelles locks, Je ne sais pas, ou rien : le rendez-vous, jamais le rituel', [null, null, null],
  [affichesADefaire(S, 'nouvelles', libres).rituel, affichesADefaire(S, 'inconnu', libres).rituel, affichesADefaire(S, null, libres).rituel]);
dit('le rendez-vous de Nouvelles locks suit son reglage', { envies: [], visio: false, privee: true }, affichesADefaire({ ...S, defaire: { ...S.defaire, rdv: ['privee'] } }, 'nouvelles', libres).regard);
dit('sans rituel choisi au Trone, Cheveux libres mene au rendez-vous', null, affichesADefaire({ ...S, defaire: { ...S.defaire, rituel: '' } }, 'libres', libres).rituel);

/* ── ⑤ LES PRIX DITS ─────────────────────────────────────────────────── */
/* Le prix de Cheveux libres suit la regle du Catalogue : voir ⑤ bis, apres le bareme. */
dit('Cheveux libres, quand son rituel ne tient pas dans une journee pour sa tete : le rendez-vous regle au Trone',
  { rituel: null, regard: { envies: [], visio: true, privee: true } }, affichesADefaire(S, 'libres', { ...libres, tient: () => false }));
dit('une envie dont le rituel ne tient pas dans une journee se comporte comme une Visio', { rituel: null, regard: { envies: ['hydratation'], visio: true, privee: false } },
  vaut(['hydratation'], { ...c, tient: () => false }));
dit('une envie qui ferait deborder la venue d une journee attend la Maison, la premiere garde son rituel',
  { rituel: { prestations: ['sv-atl-ii-e'], envies: ['entretien'] }, regard: { envies: ['lavage'], visio: true, privee: false } },
  vaut(['entretien', 'lavage'], { ...c, tient: (ids) => ids.length < 2 }));
dit('le tarif des cheveux naturels se dit en une ligne', '25 000 F les 75 locks', tarifDesNaturels('25 000 F', 75));
dit('un prix ne se coupe jamais sur deux lignes : plus aucune espace secable', [false, '64\u00a0000\u00a0F', 3], (() => {
  const x = insecable(' 64 000 F ');
  return [/ /.test(x), x, insecable('1 250 000 F').split('\u00a0').length - 1];
})());

/* ── ⑥ CE QUI SE RÉSERVE EN LIGNE : LA RÈGLE DU SERVEUR ──────────────── */
const CATS = [
  { id: 'atl-ii-gbeji' }, { id: 'cat-lavages', parentId: 'atl-ii-gbeji' }, { id: 'atl-iii-yekpe' }, { id: 'cat-defaisage' },
  { id: 'koko' }, { id: 'atl-i-vekpe' }, { id: 'atl-iv-finfin' }, { id: 'stu-c' },
];
const SERVICES = [
  { id: 'lavage', categoryId: 'cat-lavages', name: 'KLOKLO' },
  { id: 'couleur', categoryId: 'atl-iii-yekpe', name: 'YEKPE' },
  { id: 'gbata', categoryId: 'cat-defaisage', name: 'GBATA', consultationAvant: true },
  { id: 'gbata-libre', categoryId: 'cat-defaisage', name: 'GBATA sans la case' },
  { id: 'masque', categoryId: 'cat-lavages', name: 'Retouche' },
  { id: 'archive', categoryId: 'cat-lavages', name: 'Ancien', archived: true },
  { id: 'eteint', categoryId: 'cat-lavages', name: 'Eteint', enabled: false },
  { id: 'koko-ori', categoryId: 'koko', name: 'KOKO Origine' },
  { id: 'creation', categoryId: 'atl-i-vekpe', name: 'VEKPE' },
  { id: 'finfin', categoryId: 'atl-iv-finfin', name: 'FINFIN' },
  { id: 'devis', categoryId: 'cat-lavages', name: 'Sur mesure', priceMode: 'devis' as const },
  { id: 'grand-jour', categoryId: 'stu-c', name: 'Celebrer' },
  { id: 'fidelite', categoryId: 'cat-lavages', name: 'Fidelite', fenetreApresVenue: { deSemaines: 4, aSemaines: 6 } },
];
const MASQUES = { services: ['masque'] };
const etat = (id: string) => etatEnLigne(SERVICES.find((s) => s.id === id), CATS, MASQUES);
dit('ce que le Trone dit de chaque prestation (le defaisage sans la case : ouvert a la porte du site)', ['ok', 'ok', 'consultation', 'ok', 'masquee', 'eteinte', 'eteinte', 'ok', 'consultation', 'consultation', 'consultation', 'hors-atelier', 'fenetre', 'inconnue'],
  [...SERVICES.map((s) => s.id), 'nulle-part'].map(etat));
/* Le juge de la porte du site lit les familles de cette porte (`famillesDeLaPorteDuSite`, demande-submit,
   laPlaceDemandee) ; WhatsApp lit les familles nues. */
const SERVEUR: AgendaDuServeur = {
  branchId: 'b', maitres: ['Team'], sieges: 1, capMaison: 0, capMaitre: 0, semaine: [], exceptions: [], murs: [], occupes: [],
  services: SERVICES, categories: famillesDeLaPorteDuSite(CATS), masques: MASQUES, formules: [],
};
dit('le site ne propose que ce que le serveur poserait : le meme verdict, prestation par prestation', [],
  SERVICES.filter((s) => (etat(s.id) === 'ok') !== (lesGestesSeReservent(SERVEUR, [s.id], { date: '2026-12-01', derniereVenue: null }) === null)).map((s) => s.id));
dit('WhatsApp garde ses ateliers : le defaisage ne s y reserve pas', false,
  lesGestesSeReservent({ ...SERVEUR, categories: CATS }, ['gbata-libre'], { date: '2026-12-01', derniereVenue: null }) === null);
dit('un defaisage range sous la restauration reste une restauration, au site comme au serveur', [false, false], [
  etatEnLigne(SERVICES.find((s) => s.id === 'gbata-libre'), CATS.map((x) => (x.id === 'cat-defaisage' ? { ...x, parentId: 'atl-iv-finfin' } : x)), MASQUES) === 'ok',
  lesGestesSeReservent({ ...SERVEUR, categories: famillesDeLaPorteDuSite(CATS.map((x) => (x.id === 'cat-defaisage' ? { ...x, parentId: 'atl-iv-finfin' } : x))) }, ['gbata-libre'], { date: '2026-12-01', derniereVenue: null }) === null,
]);

/* ── ⑥ bis LA DÉCOLORATION SE RÉSERVE DIRECTEMENT (Yéman, 17 novembre 2026) ── */
const DECO = 'sv-atl-iii-sub-c';
const DETOX = 'sv-plt-20-c';
dit('la semence des besoins : la decoloration est sans seuil, la garde peau ne l ecarte plus', [true, false], [B.sansSeuil.includes(DECO), B.ecartesParLaPeau.includes(DECO)]);
dit('la garde peau tient toujours pour les autres : le detox, le decapant, le 2 en 1, Le Moment Cuir chevelu',
  ['sv-plt-20-c', 'sv-dds-dec', 'sv-forfait-sv-plt-60-wd-c', 'sv-le-moment-cuir-chevelu'], B.ecartesParLaPeau);
const besoinDit = (mots: string): string => B.besoins.find((b) => b.mots === mots)?.id ?? '';
const blondes = besoinDit('Je veux des locks plus claires, blondes');
const prixDeLaCouleur = (id: string): number | undefined => ({ [DECO]: 25000, [DETOX]: 22000 } as Record<string, number>)[id];
const laDeco = qualifie(B, [blondes], AUCUNE_PREUVE, prixDeLaCouleur).lignes.find((l) => l.serviceId === DECO);
dit('la decoloration se propose sans point ni preuve', [true, true, []], [laDeco?.ok, laDeco?.sansSeuil, laDeco?.manques]);
const sousGarde = qualifie(B, [blondes, besoinDit('J’ai du psoriasis'), besoinDit('Mes locks ont des résidus de produits')], AUCUNE_PREUVE, prixDeLaCouleur);
dit('garde peau levee : la decoloration reste proposee, le detox reste ecarte', [true, true, false, true], [
  sousGarde.peau, sousGarde.lignes.find((l) => l.serviceId === DECO)?.ok, sousGarde.lignes.find((l) => l.serviceId === DETOX)?.ok,
  sousGarde.lignes.find((l) => l.serviceId === DETOX)?.manques.some((x) => x.startsWith('écartée')),
]);
/* Toute couleur n'est pas une decoloration : la semence garde la coloration vegetale, a son prix d'appel ; la
   direction ajoute La Transformation au rituel de l'envie, au Trone, si elle le veut. */
dit('a la semence, le rituel de Couleur reste la coloration vegetale : la decoloration ne s y pose pas d office', ['sv-atl-iii-cou-c'], S.envies.find((e) => e.id === 'couleur')?.rituels);
const couleurEtDeco = poseLesRituels(poseLesRituels(S, 'couleur', ['sv-atl-iii-cou-c', DECO]), 'lavage', [DETOX]);
const leJugeLaLit: Contexte = { seReserve: (id) => EN_LIGNE.has(id) || id === DECO || id === DETOX, visioOuverte: true };
dit('Couleur, decoloration comprise : Votre rituel, reserve de suite, sans visio ni consultation privee',
  { rituel: { prestations: ['sv-atl-iii-cou-c', DECO], envies: ['couleur'] }, regard: null }, affichesDesEnvies(couleurEtDeco, ['couleur'], leJugeLaLit));
dit('garde peau levee : la decoloration mene toujours au rituel, le detox attend toujours la Maison',
  { rituel: { prestations: ['sv-atl-iii-cou-c', DECO], envies: ['couleur'] }, regard: { envies: ['lavage'], visio: true, privee: false } },
  affichesDesEnvies(couleurEtDeco, ['couleur', 'lavage'], { ...leJugeLaLit, ecartees: B.ecartesParLaPeau }));
dit('tant que le juge du serveur la refuse, le site ne la propose pas : la visio', { rituel: null, regard: { envies: ['couleur'], visio: true, privee: false } },
  affichesDesEnvies(couleurEtDeco, ['couleur'], c));
/* Ce que le juge du serveur dit de La Transformation, telle qu'elle est au catalogue : ni consultation avant, ni
   devis, un atelier a elle (`cat-transformation`, la nouvelle grille du 10 octobre 2026). */
const LA_DECO = { id: DECO, categoryId: 'cat-transformation', name: 'La Transformation' };
const CATS_T = [...CATS, { id: 'cat-transformation' }];
dit('son atelier se reserve en ligne, comme la coloration (18 novembre 2026)', [true, true], [ATELIERS_RESERVABLES.includes('cat-transformation'), ATELIERS_RESERVABLES.includes('atl-iii-yekpe')]);
dit('la decoloration devant le juge : seule la case du site (avant le reglage) la retient', [
  'masquee', 'ok', 'ok',
], [
  etatEnLigne(LA_DECO, CATS_T, { services: [DECO] }),
  etatEnLigne(LA_DECO, CATS_T, {}),
  etatEnLigne(LA_DECO, [...CATS, { id: 'cat-transformation', parentId: 'atl-iii-yekpe' }], {}),
]);
dit('le Trone et le site disent d elle ce que le juge du serveur dit', true,
  (etatEnLigne(LA_DECO, CATS_T, {}) === 'ok') === (lesGestesSeReservent({ ...SERVEUR, services: [...SERVICES, LA_DECO], categories: CATS_T, masques: {} }, [DECO], { date: '2026-12-01', derniereVenue: null }) === null));
const reglage = readFileSync('supabase/reglage_la_decoloration_se_reserve_20261117.sql', 'utf8').replace(/\r\n/g, '\n');
const reglageNu = reglage.replace(/^\s*--.*$/gm, '');
dit('le reglage en ligne ne nomme que la decoloration, et ne touche que deux documents', [[DECO], 2, true, false], [
  [...new Set(reglageNu.match(/\bsv-[a-z0-9-]+/g) ?? [])], (reglageNu.match(/update public\.documents/g) ?? []).length,
  /\n where d\.key = 'mnd_besoins'\n   and jsonb_typeof\(d\.data->'sansSeuil'\) = 'array'\n   and jsonb_typeof\(d\.data->'ecartesParLaPeau'\) = 'array'\n/.test(reglageNu)
    && /\n where d\.key = 'mnd_vitrine_config'\n   and jsonb_typeof\(d\.data->'siteMasques'->'services'\) = 'array'\n/.test(reglageNu),
  /insert into|delete from|\bdrop\b|\balter\b|\bcreate\b|truncate|hiddenServices|hiddenCategories|'besoins'|'seuils'|'bornes'/i.test(reglageNu),
]);
dit('le reglage leve le seuil, la garde et la case du site, et se rejoue sans rien changer', [true, true, true, true, true], [
  /else d\.data->'sansSeuil' \|\| '\["sv-atl-iii-sub-c"\]'::jsonb end,/.test(reglageNu),
  /from jsonb_array_elements\(d\.data->'ecartesParLaPeau'\) with ordinality as t\(e, ord\)\n\s*where e <> '"sv-atl-iii-sub-c"'::jsonb\)/.test(reglageNu),
  /'\{siteMasques,services\}',\n\s*coalesce\(\(select jsonb_agg\(e order by ord\)\n\s*from jsonb_array_elements\(d\.data->'siteMasques'->'services'\) with ordinality as t\(e, ord\)\n\s*where e <> '"sv-atl-iii-sub-c"'::jsonb\)/.test(reglageNu),
  /and \(not \(d\.data->'sansSeuil' @> '\["sv-atl-iii-sub-c"\]'::jsonb\)\n\s*or d\.data->'ecartesParLaPeau' @> '\["sv-atl-iii-sub-c"\]'::jsonb\);/.test(reglageNu),
  /and d\.data->'siteMasques'->'services' @> '\["sv-atl-iii-sub-c"\]'::jsonb;/.test(reglageNu),
]);
const ongletsDuTrone = readFileSync('src/apps/trone/routes/systeme/BesoinsEtRegles.tsx', 'utf8');
dit('le Trone ne dit plus la decoloration ecartee par la garde : ni a l onglet, ni a la lecture d essai', [false, true, true],
  [/d[ée]coloration/i.test(ongletsDuTrone), /écarte détox et décapant tant que/.test(ongletsDuTrone), /Détox et décapant sont écartés tant qu/.test(ongletsDuTrone)]);

/* ── ⑦ LE PARCOURS : LES ÉCRANS, LES MOTS, LES JOURS ─────────────────── */
dit('une question par ecran : deux communes, trois selon la reponse, puis le rendez-vous', [
  ['pour', 'locks'], ['pour', 'locks', 'envies', 'besoins', 'couronne', 'rdv'],
  ['pour', 'locks', 'epaisseur', 'longueur', 'duree', 'rdv'], ['pour', 'locks', 'depuis', 'ses-locks', 'comment', 'rdv'],
], [ecransDe(null), ecransDe('envies'), ecransDe('modele'), ecransDe('defaire')]);
dit('les numeros : 1 sur 5 a 5 sur 5 ; l ecran du rendez-vous n en porte pas', [1, 2, 3, 4, 5, null, 3, 5, 4],
  [numeroDe('pour', null), numeroDe('locks', 'envies'), numeroDe('envies', 'envies'), numeroDe('besoins', 'envies'), numeroDe('couronne', 'envies'), numeroDe('rdv', 'envies'),
    numeroDe('epaisseur', 'modele'), numeroDe('duree', 'modele'), numeroDe('ses-locks', 'defaire')]);
dit('les traits du haut : un par question, tous au rendez-vous', [1, 3, 5, 5], [pasFaits('pour', null), pasFaits('envies', 'envies'), pasFaits('comment', 'defaire'), pasFaits('rdv', 'modele')]);
dit('avancer et revenir, d un ecran a la fois', ['locks', 'besoins', 'rdv', 'rdv', 'envies', 'pour'],
  [ecranSuivant('pour', null), ecranSuivant('envies', 'envies'), ecranSuivant('couronne', 'envies'), ecranSuivant('rdv', 'envies'), ecranPrecedent('besoins', 'envies'), ecranPrecedent('pour', 'envies')]);
dit('sans besoin a montrer, la question se saute dans les deux sens', ['couronne', 'envies'], [ecranSuivant('envies', 'envies', ['besoins']), ecranPrecedent('couronne', 'envies', ['besoins'])]);
dit('aucune impasse : plus loin sans plus aucune envie choisie, elle revient a Vos envies', ['envies', 'envies', 'envies', 'couronne', 'rdv', 'envies'], [
  ecranTenu('besoins', 'envies', { choisies: 0, montrees: 11 }), ecranTenu('couronne', 'envies', { choisies: 0, montrees: 3 }), ecranTenu('rdv', 'envies', { choisies: 0, montrees: 1 }),
  ecranTenu('couronne', 'envies', { choisies: 2, montrees: 11 }), ecranTenu('rdv', 'envies', { choisies: 0, montrees: 0 }), ecranTenu('envies', 'envies', { choisies: 0, montrees: 11 }),
]);
dit('les parcours a part n ont pas d envies a retrouver ; un ecran d un autre parcours ramene aux locks', ['rdv', 'duree', 'locks', 'pour'], [
  ecranTenu('rdv', 'modele', { choisies: 0, montrees: 11 }), ecranTenu('duree', 'modele', { choisies: 0, montrees: 11 }),
  ecranTenu('couronne', 'defaire', { choisies: 0, montrees: 11 }), ecranTenu('envies', null, { choisies: 0, montrees: 11 }),
]);
dit('les mots des affiches du rendez-vous suivent le parcours, une seule fonction les ecrit', [
  ['À la Maison, devant vos cheveux', 'de votre création'], ['À la Maison, devant vos locks', 'de votre rituel'], ['À la Maison, devant vos locks', 'de votre rituel'],
  'Un maître de la Maison répond à vos inquiétudes, en quelques minutes', ['Visio', 'Consultation privée'],
], [
  ...(['modele', 'envies', 'defaire'] as const).map((p) => [motsDuRendezVous(p).privee.ligne, motsDuRendezVous(p).privee.deduits]),
  motsDuRendezVous('modele').visio.ligne, [motsDuRendezVous('envies').visio.nom, motsDuRendezVous('envies').privee.nom],
]);

const BANDES: Bande[] = [
  { id: 'cal-medium', name: 'Medium', maxLocks: 150, coef: 0.8, durCoef: 1 }, { id: 'cal-jumbo', name: 'Jumbo', maxLocks: 80, coef: 0.8, durCoef: 0.8 },
  { id: 'cal-mini', name: 'Mini', maxLocks: 250, coef: 1, durCoef: 1.4 }, { id: 'cal-micro', name: 'Micro', maxLocks: 350, coef: 1.2, durCoef: 1.9 },
  { id: 'cal-nano', name: 'Nano', maxLocks: 450, coef: 1.4, durCoef: 2.4 }, { id: 'cal-pico', name: 'Pico', maxLocks: 550, coef: 1.6, durCoef: 2.6 },
  { id: 'cal-galaxy', name: 'Galaxy', maxLocks: 650, coef: 1.8, durCoef: 2.8 },
];
const T = tranchesDe(BANDES);
dit('sept tranches ou le nombre se lit avant le nom ; la derniere n a pas de plafond',
  ['Jusqu’à 80 · Jumbo', '81 à 150 · Medium', '151 à 250 · Mini', '251 à 350 · Micro', '351 à 450 · Nano', '451 à 550 · Pico', 'Plus de 550 · Galaxy'],
  T.map((t) => `${plageDite(t)} · ${t.nom}`));
dit('le nombre tape se traduit seul : 120, 80, 81, 700 ; zero ne se traduit pas', ['Medium', 'Jumbo', 'Medium', 'Galaxy', null],
  [120, 80, 81, 700, 0].map((x) => trancheDuNombre(x, T)?.nom ?? null));
dit('le nombre tape : des chiffres, quatre au plus', ['1234', ''], [nombreTape('12a3 45'), nombreTape('abc')]);
dit('le bareme n est pas change par la lecture', 'cal-medium', BANDES[0].id);
const E = epaisseursDe(T);
dit('cinq epaisseurs : chacune sa tranche, la derniere tient celles qui restent', [['Gros', 'Jumbo'], ['Moyens', 'Medium'], ['Fins', 'Mini'], ['Très fins', 'Micro'], ['Extra fins', 'Nano,Pico,Galaxy']],
  E.map((e) => [e.nom, e.tranches.map((t) => t.nom).join()]));
dit('le nombre se lit sous le mot', ['Jusqu’à 80', '81 à 150', 'Plus de 350'], [plageDeLEpaisseur(E[0]), plageDeLEpaisseur(E[1]), plageDeLEpaisseur(E[4])]);
dit('le nom de la Maison ne parait qu a la fin, sur la fiche', ['Medium', 'Nano, Pico ou Galaxy', 'À choisir ensemble'], [nomDuModele(E[1]), nomDuModele(E[4]), nomDuModele(null)]);
dit('un bareme plus court donne moins d epaisseurs ; sans bareme, les cinq mots sans nombre', [3, 5, ''], [epaisseursDe(T.slice(0, 3)).length, epaisseursDe([]).length, plageDeLEpaisseur(epaisseursDe([])[0])]);
/* ── ⑤ bis LE GBATA SE PAIE SELON LE NOMBRE DE LOCKS (Yeman, 17 novembre au soir) ──
   Le prix suit la regle du Catalogue (`prixSelonLeCalibre`, `scalesWithModel`), jamais une multiplication
   faite d office par le site ; la duree suit le calibre ; une tete dont le rituel ne tient plus dans une
   journee ne le reserve pas en ligne. Les chiffres sont ceux lus en ligne le 18 novembre 2026. */
const GBATA = { id: 'sv-plt-45-std', categoryId: 'cat-defaisage', priceXof: 80000, priceMode: 'variable' as const, durationMin: 300, scalesWithModel: true };
const GBATA_NU = { ...GBATA, scalesWithModel: false };
const PB = { bandes: BANDES, sets: {}, cats: CATS };
dit('le prix suit le modele, tranche par tranche : 64 000 a 144 000 F', [64000, 64000, 80000, 96000, 112000, 128000, 144000], T.map((t) => prixAPartirDe(GBATA, [t], PB)));
dit('sans « suit le modele » au Catalogue : le prix du catalogue pour toute tete, rien de multiplie', [80000, 80000, 80000], [T[0], T[3], T[6]].map((t) => prixAPartirDe(GBATA_NU, [t], PB)));
dit('une epaisseur qui tient plusieurs tranches, ou rien de dit : le plus petit prix', [112000, 64000], [prixAPartirDe(GBATA, E[4].tranches, PB), prixAPartirDe(GBATA, T, PB)]);
dit('bareme suspendu : le prix du catalogue ; sans prix au catalogue : rien', [80000, 0], [prixAPartirDe(GBATA, [T[4]], { ...PB, baremeSuspendu: true }), prixAPartirDe({ ...GBATA, priceXof: 0 }, [T[4]], PB)]);
dit('le barème propre d un atelier l emporte, comme au Trone', 160000, prixAPartirDe(GBATA, [T[2]], { ...PB, sets: { 'cat-defaisage': BANDES.map((b) => ({ ...b, coef: 2 })) } }));
const SEMAINE_MND = [
  { key: 'lun', open: '08h00', close: '19h00', closed: true }, { key: 'mar', open: '08h00', close: '20h30', closed: false },
  { key: 'mer', open: '08h00', close: '20h30', closed: false }, { key: 'jeu', open: '08h00', close: '20h30', closed: false },
  { key: 'ven', open: '08h00', close: '20h30', closed: false }, { key: 'sam', open: '09h00', close: '20h00', closed: false },
  { key: 'dim', open: '10h00', close: '16h00', closed: true },
];
const DUREE = (n: number) => ({ lockCount: n, bandes: BANDES, sets: {}, categories: CATS });
const COMPTES = comptesDesTranches(T, BANDES);
dit('les comptes de chaque tranche : son plafond, cent de plus pour la derniere', [80, 150, 250, 350, 450, 550, 650], COMPTES);
dit('la duree suit le calibre : 240 a 840 minutes', [240, 300, 420, 570, 720, 780, 840], COMPTES.map((k) => dureeAuCompte([GBATA.id], [GBATA], DUREE(k))));
dit('sans « suit le modele », la duree du catalogue ; rien de dit, la duree du catalogue', [300, 300], [dureeAuCompte([GBATA.id], [GBATA_NU], DUREE(650)), dureeAuCompte([GBATA.id], [GBATA], DUREE(0))]);
dit('une journee de la Maison : 08:30 a 20:30 du mardi au vendredi ; une semaine fermee ne prend rien', [true, true, false, false, true],
  [tientDansUneJournee(660, SEMAINE_MND), tientDansUneJournee(720, SEMAINE_MND), tientDansUneJournee(735, SEMAINE_MND), tientDansUneJournee(60, SEMAINE_MND.map((h) => ({ ...h, closed: true }))), tientDansUneJournee(0, [])]);
dit('au-dela de 450 locks le Gbata ne tient plus dans une journee ; sans « suit le modele », toute tete tient', [450, null, 0], [
  auDelaDUneJournee([GBATA.id], [GBATA], { bandes: BANDES, sets: {}, categories: CATS }, SEMAINE_MND),
  auDelaDUneJournee([GBATA.id], [GBATA_NU], { bandes: BANDES, sets: {}, categories: CATS }, SEMAINE_MND),
  auDelaDUneJournee([GBATA.id], [{ ...GBATA, durationMin: 1000 }], { bandes: BANDES, sets: {}, categories: CATS }, SEMAINE_MND),
]);
const tientPour = (comptes: number[]) => (ids: readonly string[]) => comptes.every((k) => tientDansUneJournee(dureeAuCompte(ids, [GBATA], DUREE(k)), SEMAINE_MND));
const libresGbata: Contexte = { seReserve: (id) => id === GBATA.id, visioOuverte: true };
dit('Cheveux libres, Tres fins (251 a 350) : son rituel, reserve de suite', { rituel: { prestations: [GBATA.id], envies: [] }, regard: null },
  affichesADefaire(S, 'libres', { ...libresGbata, tient: tientPour(comptesDesTranches(E[3].tranches, BANDES)) }));
dit('Cheveux libres, Extra fins (plus de 350) ou rien de dit : une tete peut ne pas tenir, la visio et la privee', [{ envies: [], visio: true, privee: true }, null], [
  affichesADefaire(S, 'libres', { ...libresGbata, tient: tientPour(comptesDesTranches(E[4].tranches, BANDES)) }).regard,
  affichesADefaire(S, 'libres', { ...libresGbata, tient: tientPour(COMPTES) }).rituel,
]);

dit('la fiche du modele : le nom de la Maison, puis ses quatre reponses', {
  nom: 'Medium', ligne: '81 à 150 locks',
  traits: [['Épaisseur', 'Moyens'], ['Longueur', 'Longues'], ['Avec', 'Cheveux naturels en option'], ['Durée', 'Long terme · plus de 2 ans']],
  pied: 'Cheveux naturels : 25 000 F les 75 locks',
}, ficheDuModele({ epaisseur: E[1], longueur: 'long', avec: 'naturels', duree: 'long', tarifDesNaturels: '25 000 F les 75 locks' }));
dit('la fiche du modele quand elle ne sait pas : la Maison conseille, sans tarif des naturels', {
  nom: 'À choisir ensemble', ligne: 'La Maison vous conseille l’épaisseur',
  traits: [['Épaisseur', 'À voir avec la Maison'], ['Longueur', 'À voir avec la Maison'], ['Avec', 'Mes cheveux, sans faux cheveux'], ['Durée', 'Court terme · 6 mois']],
}, ficheDuModele({ epaisseur: null, longueur: 'inconnue', avec: 'cheveux', duree: 'court', tarifDesNaturels: 'x' }));
dit('la fiche a defaire : la facon en grand, puis ses reponses', {
  nom: 'Démêler', ligne: 'Vous gardez votre longueur',
  traits: [['Depuis', '3 à 5 ans'], ['Épaisseur', 'Moyens · 81 à 150 locks'], ['Longueur', 'Longues'], ['Ensuite', 'Nouvelles locks']],
}, ficheADefaire({ depuis: '3-5', epaisseur: E[1], longueur: 'long', facon: 'demeler', ensuite: 'nouvelles' }));
dit('la fiche a defaire quand elle ne sait pas', ['À choisir ensemble', 'La Maison vous conseille la façon', 'À voir avec la Maison', 'À voir avec la Maison'],
  (() => { const f = ficheADefaire({ depuis: 'moins-1', epaisseur: null, longueur: 'inconnue', facon: 'inconnue', ensuite: 'inconnu' }); return [f.nom, f.ligne, f.traits[1][1], f.traits[3][1]]; })());

dit('« Je ne sais pas » ne s affiche jamais tel quel dans une fiche', [], [
  ficheDuModele({ epaisseur: null, longueur: 'inconnue', avec: null, duree: null, tarifDesNaturels: 'x' }),
  ficheADefaire({ depuis: null, epaisseur: null, longueur: 'inconnue', facon: 'inconnue', ensuite: 'inconnu' }),
  ficheADefaire({ depuis: null, epaisseur: null, longueur: null, facon: null, ensuite: null }),
].flatMap((f) => [f.nom, f.ligne, ...f.traits.map(([, v]) => v), f.pied ?? '']).filter((v) => /je ne sais pas/i.test(v)));

const lf = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const catalogue = lf('src/shared/catalog.ts');
dit('les reperes des longueurs sont ceux du Trone', [], LONGUEURS_DITES.filter((l) => l.id !== 'inconnue' && !catalogue.includes(`id: '${l.id}'`) ).map((l) => l.id)
  .concat(LONGUEURS_DITES.filter((l) => l.id !== 'inconnue' && !new RegExp(`id: '${l.id}',[^}]*hint: '${l.repere}'`).test(catalogue)).map((l) => `${l.id}:repere`)));
dit('ses cheveux, ou des cheveux naturels en option : les mots de Yeman', [['Mes cheveux', 'sans faux cheveux'], ['Cheveux naturels', 'en option']], AVEC.map((a) => [a.nom, a.dit]));

const DOC = {
  besoins: [
    { id: 'b1', famille: 'lavage', mots: ' Un ', points: 15, prestations: ['x'] }, { id: 'b2', famille: 'lavage', mots: 'Deux', points: 'x', prestations: ['x'], garde: 'peau' },
    { id: 'b3', famille: 'lavage', mots: 'Sans prestation', points: 5, prestations: [] }, { id: 'b4', famille: 'lavage', mots: '', points: 5, prestations: ['x'] },
    { id: 'b1', famille: 'lavage', mots: 'Double', points: 5, prestations: ['x'] }, 'texte',
    { id: 'b5', famille: 'lavage', mots: 'Trois', points: 5, prestations: ['x'] }, { id: 'b6', famille: 'lavage', mots: 'Quatre', points: 5, prestations: ['x'] },
    { id: 'b7', famille: 'lavage', mots: 'Cinq', points: 5, prestations: ['x'] }, { id: 'b8', famille: 'couleur', mots: 'Ailleurs', points: 5, prestations: ['x'] },
  ],
  ecartesParLaPeau: ['sv-plt-20-c', 3],
};
const BS = besoinsDuSite(DOC);
dit('le site ne garde d un besoin que ses mots, son envie, sa garde : ni prestations ni points',
  [{ id: 'b1', famille: 'lavage', mots: 'Un', garde: false }, { id: 'b2', famille: 'lavage', mots: 'Deux', garde: true }], BS.slice(0, 2));
dit('un besoin sans mots, sans prestation ou en double ne parait pas ; un document illisible n en donne aucun', [['b1', 'b2', 'b5', 'b6', 'b7', 'b8'], [], []],
  [BS.map((b) => b.id), besoinsDuSite(null), besoinsDuSite({ besoins: 'x' })]);
dit('ce que la garde peau ecarte se lit au document', [['sv-plt-20-c'], []], [ecarteesParLaPeau(DOC), ecarteesParLaPeau(null)]);
dit('quatre besoins par envie, les autres sous Tout voir', [BESOINS_D_ABORD, 1, 5, 0, 1],
  (() => { const a = besoinsAMontrer(BS, 'lavage', false); const b = besoinsAMontrer(BS, 'lavage', true); return [a.montres.length, a.reste, b.montres.length, b.reste, besoinsAMontrer(BS, 'couleur', false).montres.length]; })());

dit('une heure se dit comme a la Maison', ['8 h 30', '10 h 00', '21 h 15', 'bientot'], ['08:30', '10:00', '21:15', 'bientot'].map(heureEnMots));
const VISIO = [{ debut: '2026-11-18T09:15:00.000Z', fin: 'x' }, { debut: '2026-11-18T09:30:00.000Z', fin: 'x' }, { debut: '2026-11-19T23:30:00.000Z', fin: 'x' }];
dit('les quarts d heure de la visio se rangent par jour de Cotonou', [['2026-11-18', ['10 h 15', '10 h 30']], ['2026-11-20', ['0 h 30']]],
  joursDeLaVisio(VISIO).map((j) => [j.jour, j.heures.map((h) => h.dit)]));
dit('l heure d une visio part au serveur telle que le serveur l a donnee', '2026-11-18T09:15:00.000Z', joursDeLaVisio(VISIO)[0].heures[0].cle);
const LIBRES: Record<string, { heure: string; maitre: string }[]> = {
  '2026-11-18': [{ heure: '08:30', maitre: 'Team' }], '2026-11-20': [{ heure: '11:30', maitre: 'Expert' }, { heure: '15:00', maitre: 'Team' }],
  '2026-11-21': [{ heure: '09:00', maitre: 'Team' }], '2026-11-24': [{ heure: '09:00', maitre: 'Team' }], '2026-12-04': [{ heure: '10:00', maitre: 'Team' }],
};
const CARNET = joursDuCarnet(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-24', '2026-12-04'], (iso) => LIBRES[iso] ?? []);
dit('un jour sans heure libre ne se propose pas ; l heure garde son maitre', [['2026-11-18', '2026-11-20', '2026-11-21', '2026-11-24', '2026-12-04'], { cle: '11:30', dit: '11 h 30', maitre: 'Expert' }],
  [CARNET.map((j) => j.jour), CARNET[1].heures[0]]);
dit('les quatre prochains jours ouverts en puces ; le jour choisi au calendrier s y ajoute', [
  ['2026-11-18', '2026-11-20', '2026-11-21', '2026-11-24'], ['2026-11-18', '2026-11-20', '2026-11-21', '2026-11-24', '2026-12-04'], ['2026-11-18', '2026-11-20', '2026-11-21', '2026-11-24'],
], [pucesDesJours(CARNET, null), pucesDesJours(CARNET, '2026-12-04'), pucesDesJours(CARNET, '2026-11-19')]);
dit('les moments de la privee dits par le serveur : ranges par jour, sans double ni moment mal ecrit ; illisibles, le Carnet', [
  [['2026-11-18', ['8 h 30']], ['2026-11-20', ['9 h 00', '11 h 30']]], null, null, [],
], [
  joursDesMoments([{ jour: '2026-11-20', heure: '11:30' }, { jour: '2026-11-18', heure: '08:30' }, { jour: '2026-11-20', heure: '09:00' }, { jour: 'demain', heure: '09:00' },
    { jour: '2026-11-20', heure: '9h' }, { jour: '2026-11-20', heure: '11:30' }, 'texte'])?.map((j) => [j.jour, j.heures.map((h) => h.dit)]) ?? null,
  joursDesMoments(undefined), joursDesMoments({ moments: [] }), joursDesMoments([]),
]);
dit('Plus de dates ne se montre que s il y en a', [true, false, false], [ilYAPlusDeDates(CARNET), ilYAPlusDeDates(CARNET.slice(0, 4)), ilYAPlusDeDates([])]);
dit('le calendrier va du premier au dernier mois ouvert', [{ premier: '2026-11', dernier: '2026-12' }, null], [moisDesJours(CARNET), moisDesJours([])]);
dit('un jour en puce : sans le mois ce mois-ci, avec ensuite, avec l annee quand elle change', ['mer. 18', 'ven. 4 déc.', 'ven. 8 janv. 2027'], [jourEnPuce('2026-11-18', '2026-11-17'), jourEnPuce('2026-12-04', '2026-11-17'), jourEnPuce('2027-01-08', '2026-11-17')]);
dit('un jour en toutes lettres porte son annee', ['Mercredi 18 novembre 2026', 'Mardi 1er décembre 2026'], [jourEnToutesLettres('2026-11-18'), jourEnToutesLettres('2026-12-01')]);
dit('le numero part avec son indicatif, sauf s il le porte deja', ['+229 01 51 99 77 99', '+33 6 12 34 56 78', '0033612345678'],
  [numeroEntier('+229', ' 01 51 99 77 99 '), numeroEntier('+229', '+33 6 12 34 56 78'), numeroEntier('+229', '0033612345678')]);
dit('huit chiffres au moins', [true, false], [numeroLisible('01 51 99 77'), numeroLisible('0151')]);

/* ── ⑧ CE QUE LE SITE DÉPOSE ─────────────────────────────────────────── */
const REP: Reponses = { ...REPONSES_VIDES, pour: 'enfant', locks: 'ailleurs', envies: ['reparer', 'lavage'], besoins: ['b1', 'b2'], nombre: '120', calibre: 'cal-medium', longueur: 'mi-long' };
const depot = consultationADeposer({
  id: 'cg-1', maintenant: '2026-11-17T10:00:00.000Z', prenom: 'Awa', telephone: '+229 01 00 00 00 61', devise: 'XOF', branchId: 'br',
  parcours: 'envies', reponses: REP, envies: S.envies.filter((e) => REP.envies.includes(e.id)), besoins: BS.slice(0, 2),
  tranche: T[1], epaisseur: null, fiche: null, rendezVous: 'privee', moment: { jour: '2026-11-20', heure: '11:30' },
});
const brut = JSON.stringify(depot);
/* Ce que le serveur de 1B retire d'un depot public (CLES_DE_LA_MAISON, CLES_DU_SERVEUR « paidXof ») : le site ne l'envoie plus. */
dit('la consultation deposee ne porte ni lecture, ni estimation, ni points, ni montant', [false, false, false, false],
  ['estimation' in depot || 'paidXof' in depot, /"(min|max|prix|prixXof|priceXof|points|palier|score|aChiffrer|lignes|aConfirmer|fourchette)"/.test(brut),
    /\d{4,}\s?F\b|XOF"\s*:\s*[1-9]/.test(brut), /"(transactionId|payeLe|reglement|rdvId|momentFixe)"/.test(brut)]);
dit('elle porte ses reponses, sa couronne, la garde, et le creneau choisi', [
  { locks: 120, calibreId: 'cal-medium', calibreDit: 'Medium', longueur: 'mi-long', nees: 'ailleurs', pour: 'enfant' }, 'peau', { jour: '2026-11-20', heure: '11:30' }, 'auto', 'sos',
  [{ id: 'b1', mots: 'Un' }, { id: 'b2', mots: 'Deux' }],
], [depot.couronne, depot.garde, depot.moment, depot.modalite, depot.parcours, depot.besoins]);
dit('ses reponses se lisent en lignes, quel que soit le parcours', [
  ['Pour', 'Son enfant'], ['Ses locks', 'Des locks faites ailleurs'], ['Envies', 'Réparer, Lavage'], ['Locks', '120 · Medium'], ['Longueur', 'Mi-longues'], ['Rendez-vous demandé', 'Consultation privée'],
], (depot.answers as { fiche: unknown }).fiche);
const REP_M: Reponses = { ...REPONSES_VIDES, pour: 'moi', locks: 'aucune', epaisseur: 'extra-fins', longueur: 'long', avec: 'cheveux', duree: 'moyen' };
const fM = ficheDuModele({ epaisseur: E[4], longueur: 'long', avec: 'cheveux', duree: 'moyen', tarifDesNaturels: 'x' });
const depotM = consultationADeposer({
  id: 'cg-2', maintenant: 'x', prenom: 'B', telephone: 't', devise: 'XOF', branchId: 'br', parcours: 'modele', reponses: REP_M, envies: [], besoins: [],
  tranche: null, epaisseur: E[4], fiche: fM, rendezVous: 'visio',
});
dit('le modele depose : une creation, son calibre dit, sa fiche, sans creneau ni garde', ['creation', { calibreId: 'cal-nano', calibreDit: 'Nano, Pico ou Galaxy', longueur: 'long', nees: 'aucune', pour: 'moi' }, false, false, 'Nano, Pico ou Galaxy'],
  [depotM.parcours, depotM.couronne, 'moment' in depotM, 'garde' in depotM, ((depotM.answers as { fiche: [string, string][] }).fiche.find(([k]) => k === 'Demande') ?? [])[1]]);
const depotD = consultationADeposer({
  id: 'cg-3', maintenant: 'x', prenom: 'C', telephone: 't', devise: 'XOF', branchId: 'br', parcours: 'defaire',
  reponses: { ...REPONSES_VIDES, pour: 'moi', locks: 'defaire', depuis: '1-3', epaisseur: 'inconnue', longueur: 'inconnue', facon: 'couper', ensuite: 'nouvelles' },
  envies: [], besoins: [], tranche: null, epaisseur: null, fiche: ficheADefaire({ depuis: '1-3', epaisseur: null, longueur: 'inconnue', facon: 'couper', ensuite: 'nouvelles' }), rendezVous: 'visio',
});
dit('des locks a defaire : ni « nees » inventee, ni calibre, ni longueur qu elle n a pas dits', { pour: 'moi' }, depotD.couronne);
dit('le mot d un rituel reserve dit ses envies et ses besoins, jamais un montant', 'Consultation du site · Envies : Réparer, Lavage · Besoins : Un ; Deux · Longueur : mi-longues',
  motDuRituel({ envies: S.envies.filter((e) => REP.envies.includes(e.id)), besoins: BS.slice(0, 2), fiche: null, longueur: 'mi-long' }));
dit('changer la premiere reponse sans changer de parcours garde ses reponses', ['maison', ['reparer', 'lavage'], ['b1', 'b2'], '120', 'cal-medium', 'mi-long', true],
  (() => { const x = apresLaReponseDuDebut(REP, 'maison'); return [x.locks, x.envies, x.besoins, x.nombre, x.calibre, x.longueur, apresLaReponseDuDebut(REP, 'ailleurs') === REP]; })());
dit('elles ne repartent de zero que si le parcours change ; « pour qui » reste', [{ ...REPONSES_VIDES, pour: 'enfant', locks: 'aucune' }, { ...REPONSES_VIDES, pour: 'moi', locks: 'defaire' }],
  [apresLaReponseDuDebut(REP, 'aucune'), apresLaReponseDuDebut(REP_M, 'defaire')]);
const depotI = consultationADeposer({
  id: 'cg-4', maintenant: 'x', prenom: 'D', telephone: 't', devise: 'XOF', branchId: 'br', parcours: 'envies',
  reponses: { ...REP, nombre: '', longueur: 'inconnue' }, envies: [], besoins: [], tranche: T[1], epaisseur: null, fiche: null, rendezVous: 'visio',
});
dit('« Je ne sais pas » ne part jamais tel quel au Trone : a voir avec la Maison', [false, 'À voir avec la Maison', '81 à 150 · Medium'],
  [/je ne sais pas/i.test(JSON.stringify(depotI) + JSON.stringify(depotD)), ((depotI.answers as { fiche: [string, string][] }).fiche.find(([k]) => k === 'Longueur') ?? [])[1],
    ((depotI.answers as { fiche: [string, string][] }).fiche.find(([k]) => k === 'Locks') ?? [])[1]]);

/* ── ⑨ LES BRANCHEMENTS ──────────────────────────────────────────────── */
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ILOT = 'src/apps/revelateur/ilots/Consultation.tsx';
const PORTES = 'src/apps/revelateur/ilots/PortesDeLaConsultation.tsx';
const PUR = 'src/apps/revelateur/parcours-en-affiches-pur.ts';
const ilot = lf(ILOT);
const portes = lf(PORTES);
const pur = lf(PUR);
/* Le prix de la consultation privée vient d'`estimation-pur` : son chemin d'importation n'est pas un texte montré. */
const montre = sansCommentaires(`${ilot}\n${portes}\n${pur}`).replace(/shared\/estimation-pur/g, '');
dit('le navigateur ne calcule plus ni lecture ni estimation', [false, true, true],
  [/\b(qualifie|fourchetteDe|somme|palierDe|BESOINS_DE_DEPART|reglagesSurs|bornesDesCalibres)\b|besoins-pur/.test(montre),
    /import \{ PRIX_DE_LA_CONSULTATION_PRIVEE_XOF \} from '\.\.\/\.\.\/\.\.\/shared\/estimation-pur';/.test(ilot),
    /import \{ PRIX_DE_LA_CONSULTATION_PRIVEE_XOF \} from '\.\.\/\.\.\/\.\.\/shared\/estimation-pur';/.test(portes)]);
dit('plus de « Notre lecture », d estimation, ni de « Merci. La Maison confirme »', [], ['Notre lecture', 'estimation', 'Merci', 'La Maison confirme', 'Voir ma lecture', 'deux façons'].filter((x) => montre.toLowerCase().includes(x.toLowerCase())));
dit('aucun prix ecrit en dur : celui de la privee et celui des cheveux naturels viennent d ailleurs', false, /\b(15|25)[\s\u00a0\u202f_]?000\b/.test(montre));
dit('jamais « extensions » ; jamais de points ni de palier dits a la cliente', false, /extension|\bpoints\b(?!: )|palier/i.test(sansCommentaires(`${ilot}\n${portes}`)));
dit('le lien de la visio ne s affiche jamais, ni en texte ni en adresse : il arrive sur WhatsApp ; le billet seul mene a sa page', [false, 1, true, true], [
  /location\.origin|Ouvrir ma salle|Gardez ce lien|\{lien\}/.test(portes), (sansCommentaires(portes).match(/\br\.chemin\b/g) ?? []).length,
  portes.includes("cheminSur(r.changer) || (typeof r.billet === 'string' && !('jeton' in r) ? cheminSur(r.chemin) : '');"),
  portes.includes("? 'Le lien arrive sur votre WhatsApp.'\n"),
]);
dit('un seul depot par parcours, a l identifiant que le serveur rend', [true, true, true], [
  /if \(depot\) return depot;/.test(portes),
  /const id = typeof r\.id === 'string' && FORME_DE_LA_CONSULTATION\.test\(r\.id\) \? r\.id : propose;\n\s*surDepot\(id\);/.test(portes),
  /const \[depot, setDepot\] = useState\(''\);/.test(ilot) && /depot=\{depot\} surDepot=\{setDepot\}/.test(ilot),
]);
dit('la privee aux moments que le serveur posera, puis posee au Carnet ; sinon le Carnet et la Maison', [true, true, true, true], [
  /appelle\('visio-salle', \{ geste: 'moments-privee', branchId: agenda\.branchId, horizonJours: horizon\.jours\.length \}\)/.test(portes),
  /if \(jours\) setPrivees\(jours\); else void leCarnet\(\);/.test(portes) && /\.catch\(\(\) => \{ if \(vivant\) void leCarnet\(\); \}\);/.test(portes),
  /appelle\('visio-salle', \{ geste: 'reserver-privee', consultationId: id, moment \}\)/.test(portes),
  /etat: tenu \? 'confirme' : refusee \? 'a-fixer' : 'demande'/.test(portes) && portes.includes('Ce moment vient d’être pris : la Maison fixe le vôtre avec vous sur WhatsApp.'),
]);
dit('la visio par la fonction, son refus par limite lu, le retour vers la consultation privee', [true, true, true],
  [/appelle\('visio-salle', \{ geste: 'reserver', debut: h\.cle,/.test(portes), /String\(r\.motif \?\? r\.raison \?\? ''\)/.test(portes) && /motif === 'limite'/.test(portes) && /r\.prochaineLe/.test(portes) && /motif === 'numero'/.test(portes), /surLaPrivee=\{choix\.genre === 'visio' \? \(\) => ouvre\(laPrivee\) : undefined\}/.test(ilot)]);
dit('la privee par le paiement actuel, le creneau choisi dans `moment` : au depot et a la verification', [true, true, true], [
  /appelle\('kkiapay-verify', \{ transactionId, apptId: '', consultationId: id, expectedXof: prix, branchId: agenda\.branchId, moment \}\)/.test(portes),
  /const moment: Moment = \{ jour: iso, heure: h\.cle \};\n\s*const id = await depose\('privee', moment\);/.test(portes),
  /\.\.\.\(o\.moment \? \{ moment: o\.moment \} : \{\}\),/.test(pur),
]);
dit('le rituel par le chemin de la reservation du site ; l etat du serveur lu s il est la', [true, true, true], [
  /functions\.invoke\('demande-submit', \{\n\s*body: \{\n\s*genre: 'rdv',/.test(portes), /serviceIds: choix\.prestations, date: iso, time: h\.cle, master: h\.maitre \?\? '',/.test(portes),
  /r\.etat === 'en-attente' \? 'en-attente' : r\.etat === 'confirme' \|\| r\.confirme === true \? 'confirme' : 'demande'/.test(portes),
]);
dit('la consultation se depose par push-notify (tunnel-submit), jamais en base directe', [true, false],
  [/appelle\('push-notify', \{\n\s*mode: 'tunnel-submit',/.test(portes), /from\('(consultations_queue|appointments|visios)'\)/.test(`${ilot}\n${portes}`)]);
dit('les jours et les heures viennent du Carnet et de la visio, jamais d une liste', [true, true, true, false], [
  /const horizon = useMemo\(\(\) => horizonDuSite\(\), \[\]\);/.test(portes),
  /joursDuCarnet\(horizon\.jours, \(iso\) => heuresLibres\(\{ agenda: agendaDuChoix, dateIso: iso, serviceIds: prestations, occupes: carnet\.occupes, places: carnet\.places \}\)\)/.test(portes),
  /if \(!prestations\) return joursDeLaVisio\(vifs\);/.test(portes), /'\d{4}-\d{2}-\d{2}'|\['\d{1,2} ?h/.test(sansCommentaires(`${ilot}\n${portes}`)),
]);
dit('Plus de dates ouvre le mois, grise ce qui n est pas libre', [true, true],
  [/\{ilYAPlusDeDates\(ouverts\) && \(/.test(portes) && /calendrier \? 'Fermer le calendrier' : 'Plus de dates'/.test(portes), /disabled=\{!libres\.has\(iso\)\}/.test(portes)]);
dit('le bilan sous cle au billet d une visio ou d une privee, jamais d un rituel reserve de suite', [true, 1], [
  /\{recu\.genre !== 'rituel' && <Scelle texte="Il s’ouvre à ce rendez-vous\." \/>\}/.test(portes), (portes.match(/Il s’ouvre à ce rendez-vous/g) ?? []).length,
]);
dit('les mots des affiches Visio et Consultation privee ne s ecrivent qu a un endroit', [true, false], [
  /const dits = motsDuRendezVous\(parcours\);/.test(ilot) && /nom=\{dits\.privee\.nom\} ligne=\{dits\.privee\.ligne\}/.test(ilot) && /nom=\{dits\.visio\.nom\} ligne=\{dits\.visio\.ligne\}/.test(ilot),
  /vos cheveux|votre création|devant vos locks|de votre rituel/.test(sansCommentaires(`${ilot}\n${portes}`)),
]);
dit('tout montant passe par fmtMoney et ne se coupe pas ; le nombre d une affiche tient d un seul tenant', [true, true, true], [
  /const argent = \(xof: number\) => insecable\(fmtMoney\(xof, d\?\.devise \?\? 'XOF'\)\);/.test(ilot),
  /<span className="ca-aff__nombre">\{chiffre\}<\/span>/.test(portes) && /chiffre: insecable\(m\[1\]\)/.test(portes),
  /\.ca-aff__nombre \{ flex: none; white-space: nowrap; \}/.test(lf('src/apps/revelateur/ilots/consultation.css')),
]);
dit('son prenom et son numero sont tenus par le parcours : un jour, une heure, Plus de dates ne les effacent pas', [true, true, false, false], [
  /const \[qui, setQui\] = useState<Coordonnees>\(COORDONNEES_VIDES\);/.test(ilot) && (ilot.match(/qui=\{qui\} surQui=\{setQui\}/g) ?? []).length === 2,
  /const \{ prenom, numero, pays \} = qui;/.test(portes) && /onChange=\{\(e\) => surQui\(\{ \.\.\.qui, prenom: e\.target\.value \}\)\}/.test(portes),
  /const \[(prenom|numero|pays)\b/.test(portes),
  /(choisisLeJour|ouvreLeCalendrier|relisLeCarnet) = \([^)]*\) => \{[^}]*surQui/.test(portes),
]);
dit('Tout voir montre vraiment les besoins qui restent, et ils se cochent', [true, true], [
  /besoinsAMontrer\(d\.besoins, e\.id, toutVoir\.includes\(e\.id\)\)/.test(ilot) && /onClick=\{\(\) => setToutVoir\(\(t\) => \[\.\.\.t, e\.id\]\)\}>Tout voir</.test(ilot)
    && /setToutVoir\(\(t\) => t\.filter\(\(x\) => envies\.includes\(x\)\)\);/.test(ilot),
  /montres\.map\(\(b\) => <button type="button" key=\{b\.id\} className="ca-puce" aria-pressed=\{rep\.besoins\.includes\(b\.id\)\} onClick=\{\(\) => touche\(b\.id\)\}>\{b\.mots\}<\/button>\)/.test(ilot),
]);
dit('ses envies se relisent contre les reglages, et aucune impasse ne reste', [true, true], [
  /const envies = rangeLesChoisies\(d\.envies, repBrutes\.envies, repBrutes\.locks\);/.test(ilot),
  /const ecran = ecranTenu\(ecranVoulu, parcours, \{ choisies: d \? rep\.envies\.length : 1, montrees: montrees\.length \}\);/.test(ilot),
]);
dit('les noms tapes au Trone ne s ecrivent jamais en HTML brut', false, /dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|document\.write/.test(`${ilot}\n${portes}\n${lf('src/apps/trone/routes/systeme/VosEnvies.tsx')}`));
dit('changer l heure : le billet mene a la page de la visio, par un chemin de la Maison seulement', [true, true],
  [/\{recu\.changer\n\s*\? <a className="ca-revenir" href=\{recu\.changer\}>Changer l’heure<\/a>/.test(portes), /const cheminSur = \(x: unknown\): string => \(typeof x === 'string' && \/\^\\\/\[A-Za-z0-9#\]\/\.test\(x\) \? x : ''\);/.test(portes)]);
dit('l ilot lit les envies et les besoins au document, la semence sinon', [true, true],
  [/\.in\('key', \['mnd_envies', 'mnd_besoins'\]\)/.test(ilot), /envies: enviesSures\(doc\('mnd_envies'\)\),/.test(ilot)]);
dit('le site ne propose un rituel que si le serveur le poserait', true, /seReserve: \(id\) => etatEnLigne\(service\(id\), agenda\.categories, agenda\.masques\) === 'ok',/.test(ilot));
dit('le prix d un rituel : la regle du Catalogue (celle de la reservation du site), Cheveux libres compris ; rien de multiplie par le site', [true, true, false],
  [/\(ctx \? prixSelonLeCalibre\(s, ctx\) : Number\(s\.priceXof \?\? 0\)\)/.test(ilot),
    /return total \+ prixAPartirDe\(s, tranchesDites, \{ bandes: agenda\.bandes, sets: agenda\.bandSets, cats: agenda\.categories, baremeSuspendu: agenda\.baremeSuspendu \}\);/.test(ilot),
    /priceXof \?\? 0\) \*|\bcoefs\b|prixAuBareme/.test(ilot)]);
dit('une tete dont le rituel ne tient plus dans une journee ne le reserve pas : chaque compte qu elle peut avoir doit tenir', [true, true],
  [/tient: \(ids\) => \(comptes\.length \? comptes : \[0\]\)\.every\(\(n\) => tientDansUneJournee\(dureeAuCompte\(ids, agenda\.services, dureeDuCompte\(n\)\), agenda\.semaine\)\),/.test(ilot),
    /const comptes = parcours === 'defaire' \? comptesDesTranches\(tranchesDites, agenda\.bandes\) : \[lockCount\];/.test(ilot)]);
dit('la place tenue est celle de la plus grande tete possible ; un calibre ne se nomme que s il est seul', [true, true],
  [/const compteDuRituel = parcours === 'defaire' \? Math\.max\(0, \.\.\.comptes\) : lockCount;/.test(ilot), /\(epaisseur\?\.tranches\.length === 1 \?/.test(ilot)]);
dit('Votre moment : les heures d un rituel suivent la duree de son calibre', [true, true],
  [/gestesAuCalibre\(agenda\.services, \{ lockCount: compte, bandes: agenda\.bandes, sets: agenda\.bandSets, categories: agenda\.categories, suspendu: agenda\.baremeSuspendu === true \}\)/.test(portes),
    /heuresLibres\(\{ agenda: agendaDuChoix, dateIso: iso,/.test(portes)]);
dit('le juge du site, /reserver/ et Vos envies lisent les familles de la porte du site', [true, true],
  [/const cats = famillesDeLaPorteDuSite\(familles\);/.test(lf('src/shared/envies-pur.ts')),
    /const familles = famillesDeLaPorteDuSite\(cats\);\n  const offert = \(s: PrestationPublique\) => reservableSurLeSite\(s, familles, agenda\.masques\) && !s\.fenetreApresVenue;/.test(lf('src/apps/revelateur/agenda.ts'))]);
dit('la visio n attend aucun « Je confirme » : le billet ne le promet pas', [true, false],
  [/\? 'Le lien arrive sur votre WhatsApp\.'\n/.test(portes), /Répondez « Je confirme » : sans réponse, la place se libère/.test(portes)]);
dit('l ilot n importe ni magasin ni synchronisation', false, /from '\.\.\/\.\.\/\.\.\/shared\/(besoins|envies|sync|store|pricing|catalog|kkiapay|finance|bridges)'/.test(sansCommentaires(`${ilot}\n${portes}`)));
dit('la page et l ilot sont branches ; la page ne promet plus ni lecture ni estimation', [true, true, false], [
  /consultation: \(\) => import\('\.\/ilots\/Consultation'\)/.test(lf('src/apps/revelateur/monte.tsx')),
  /chemin: '\/consultation\/',[\s\S]{0,700}ilot: 'consultation'/.test(lf('src/apps/revelateur/contenu.ts')),
  /estimation|lecture/i.test((/chemin: '\/consultation\/',([\s\S]{0,700})ilot: 'consultation'/.exec(lf('src/apps/revelateur/contenu.ts')) ?? ['', 'estimation'])[1]),
]);
dit('six gestes : le plafond du parcours est celui de la reservation du site', String(GESTES_MAX), (/export const PLAFOND_GESTES = (\d+);/.exec(lf('src/apps/revelateur/agenda.ts')) ?? [])[1]);

const css = lf('src/apps/revelateur/ilots/consultation.css');
dit('la feuille : affiches droites, rayons de 4 px au plus, les polices de la Maison, pas d obsidienne', [false, [], false, false], [
  /rotate\(|skew\(/.test(css), [...css.matchAll(/border-radius:\s*([^;]+);/g)].flatMap((x) => x[1].split(/\s+/)).filter((v) => parseFloat(v) > 4),
  /font-family:(?!\s*var\(--(serif|sans)\))/.test(css), /obsidi/i.test(css),
]);
dit('la feuille se charge avec l ilot, et le mouvement s eteint sur demande', [true, true], [/import '\.\/consultation\.css';/.test(ilot), /prefers-reduced-motion: reduce/.test(css)]);
dit('de 320 a 412 px rien n elargit la colonne : chaque grille en minmax(0, 1fr), le nom d une affiche suit l ecran', [[], true, true], [
  css.split('\n').filter((l) => /display: grid/.test(l) && !/grid-template-columns: (repeat\(\d+, )?minmax\(0, /.test(l)).map((l) => l.slice(0, 30)),
  /\.ca-aff__nom \{[^}]*font-size: clamp\(22px, 13vw - 17px, 38px\);[^}]*min-width: 0;/.test(css),
  /\.ca \{[^}]*width: 100%; max-width: 460px; min-width: 0;/.test(css),
]);

const ecranTrone = lf('src/apps/trone/routes/systeme/VosEnvies.tsx');
const besoinsEtRegles = lf('src/apps/trone/routes/systeme/BesoinsEtRegles.tsx');
dit('Vos envies : un onglet de Besoins et regles, ferme a qui n est pas de la direction', [true, true],
  [/\{onglet === 'envies' && <VosEnvies estDirection=\{estDirection\} \/>\}/.test(besoinsEtRegles), /<fieldset disabled=\{!estDirection\} className="tev-champs">/.test(ecranTrone)]);
dit('le Trone dit « rituel a choisir » et ce qui ne se reserve pas en ligne', [true, true],
  [/\{e\.rituels\.length === 0 && <span className="tev-signal">Rituel à choisir\./.test(ecranTrone), /RAISON_HORS_LIGNE\[x\]/.test(ecranTrone) && /const etat = \(id: string\) => etatEnLigne\(parId\.get\(id\), cats, vitrine\.siteMasques\);/.test(ecranTrone)]);
dit('le Trone dit le rituel de Cheveux libres comme le Catalogue le regle, et la journee qu il ne tient plus', [true, true, true], [
  /libres\.scalesWithModel === true\n\s*\? <>/.test(ecranTrone),
  /auDelaDUneJournee\(\[libres\.id\], services, \{ bandes, sets: jeux, categories: cats, suspendu: reglages\.baremeSuspendu === true \}, reglages\.hours\)/.test(ecranTrone),
  /« suit le modèle » est éteint au Catalogue/.test(ecranTrone),
]);
const magasin = lf('src/shared/envies.ts');
dit('le document se synchronise sous sa cle, et un geste refuse ne s ecrit pas', [true, true, true], [
  /export const CLE_DES_ENVIES = 'mnd_envies';/.test(magasin) && /createStore<ReglagesDesEnvies>\('mnd_envies', ENVIES_DE_DEPART\(\)\)/.test(magasin),
  /bindDocument\(enviesStore, CLE_DES_ENVIES\);/.test(magasin), /return neuf === sur \? avant : /.test(magasin),
]);
dit('les familles des besoins sont les envies', true, /familles: enviesSures\(envies\)\.envies\.map\(\(e\) => \(\{ id: e\.id, nom: e\.nom \|\| e\.id \}\)\)/.test(lf('src/shared/besoins.ts')));
const sql = lf('supabase/migrations/0231_vos_envies.sql');
const sqlNu = sql.replace(/^\s*--.*$/gm, '');
dit('0231 : le site lit mnd_envies, la direction seule l ecrit (creer, modifier, retirer)', [true, 3, 3, false], [
  /create policy docs_envies_lire on public\.documents for select to anon, authenticated\n\s*using \(key = 'mnd_envies'\);/.test(sqlNu),
  (sqlNu.match(/as restrictive for (insert|update|delete) to anon, authenticated/g) ?? []).length,
  (sqlNu.match(/key <> 'mnd_envies' or public\.est_direction\(\)/g) ?? []).length - 1,
  /as restrictive for (all|select)/.test(sqlNu),
]);
dit('0231 ne reecrit ni la liste blanche ni les cles de la direction : rien a refermer chez les autres', false, /docs_pub_read|cles_ecrites_par_la_direction|create or replace function|insert into|update public|delete from/.test(sqlNu));

const gbata = lf('supabase/reglage_le_gbata_suit_le_nombre_de_locks_20261118.sql');
const gbataNu = gbata.replace(/^\s*--.*$/gm, '');
dit('le reglage du Gbata : la seule GBATA Essentiel, suit le modele allume, consultation avant decochee', [['sv-plt-45-int', 'sv-plt-45-std'], 1, true, true], [
  [...new Set(gbataNu.match(/\bsv-[a-z0-9-]+/g) ?? [])].sort(), (gbataNu.match(/^update public\.catalog_services$/gm) ?? []).length,
  /set data = data \|\| jsonb_build_object\('scalesWithModel', true, 'consultationAvant', false\),\n\s*updated_at = now\(\)\n where id = 'sv-plt-45-std'\n/.test(gbataNu),
  /from public\.catalog_services\n where id in \('sv-plt-45-std', 'sv-plt-45-int'\)/.test(gbataNu),
]);
dit('le reglage du Gbata se rejoue sans rien changer, sa copie de repli porte RLS, il n efface rien', [true, true, false], [
  /and \(coalesce\(\(data->>'scalesWithModel'\)::boolean, false\) = false\n\s*or coalesce\(\(data->>'consultationAvant'\)::boolean, false\) = true\);/.test(gbataNu),
  /create table if not exists public\.repli_le_gbata_suit_le_nombre_de_locks_20261118 as[\s\S]*alter table public\.repli_le_gbata_suit_le_nombre_de_locks_20261118 enable row level security;/.test(gbataNu),
  /delete from|\bdrop\b|truncate|insert into/i.test(gbataNu),
]);

const NEUFS = [ILOT, PORTES, PUR, 'src/apps/revelateur/ilots/consultation.css', 'src/shared/envies-pur.ts', 'src/shared/envies.ts', 'src/apps/trone/routes/systeme/VosEnvies.tsx', 'supabase/migrations/0231_vos_envies.sql',
  'supabase/reglage_la_decoloration_se_reserve_20261117.sql', 'supabase/reglage_le_gbata_suit_le_nombre_de_locks_20261118.sql'];
const textes = NEUFS.map(lf);
dit('aucun emoji, aucun nom de domaine, aucune cle dans les fichiers neufs', [[], []], [
  NEUFS.filter((_, i) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(textes[i])),
  NEUFS.filter((_, i) => /maisonmnd\.|supabase\.co|github\.io|sk_live|eyJhbGci/i.test(textes[i])),
]);

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : les envies ne tiennent pas leurs promesses.');
else console.log('TOUT VA BIEN : les envies et le parcours en affiches tiennent leurs promesses.');
