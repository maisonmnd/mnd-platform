/* LA SALLE D'ATTENTE DES ENVOIS, EPROUVEE — `node scripts/verifie-la-salle-des-envois.mjs`.

   « Est-ce possible d'intercepter un message qui part vers chez un client ?
   D'arreter l'envoi a cause de l'heure tardive ou autre raison, erreur... »
   (Yeman, 2 octobre 2026). Dix minutes de salle, heures calmes de 20 h a 8 h,
   une main peut retenir, et le facteur relit avant de porter.

   Ce harnais tient la regle (les heures, les gestes, la relecture), verifie
   que les fonctions Edge portent le MEME calcul que le depot (elles ne
   peuvent rien importer), et que chaque garde-fou est bien branche. */
import { readFileSync } from 'node:fs';
import {
  REGLES_PAR_DEFAUT, reglesDepuis, heureDuSalon, dansLesHeuresCalmes, finDesHeuresCalmes, heureDeDepart,
  facteurVivant, FACTEUR_VIVANT_MS, peutPartir, retiens, relache, envoieMaintenant, ecarte, resumeDeLaSalle,
  quandIlPart, pourquoiIlNePartPlus, attendEncore, EN_ATTENTE, RETENU, ECARTE, PERIME, EN_ENVOI,
} from '../src/shared/salle-des-envois';
import { envoisDeLaPeriode, compteDuJournal, devenuDe, DEVENU_DIT } from '../src/shared/envois';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
/** Un instant, dit a l'heure du salon (Cotonou, UTC + 1). */
const salon = (jour: string, heure: string): number => Date.parse(`${jour}T${heure}:00+01:00`);
const iso = (ms: number) => new Date(ms).toISOString();
const R = REGLES_PAR_DEFAUT;

/* ── 1. Les arbitrages de Yeman sont les reglages par defaut ── */
dit('dix minutes de salle, heures calmes de 20 h a 8 h', { salleMin: 10, calmeDe: 20, calmeA: 8 }, R);
dit('un reglage absurde retombe sur le defaut', R, reglesDepuis({ salleMin: -3, calmeDe: 99, calmeA: 'x' }));
dit('un reglage pose est suivi', { salleMin: 5, calmeDe: 21, calmeA: 7 }, reglesDepuis({ salleMin: 5, calmeDe: 21, calmeA: 7 }));
dit('sans reglage du tout, le defaut', R, reglesDepuis(undefined));

/* ── 2. L'heure du salon, et les heures calmes ── */
dit('14 h UTC, c est 15 h au salon', 15, heureDuSalon(Date.parse('2026-10-02T14:00:00Z')));
dit('15 h : les messages partent', false, dansLesHeuresCalmes(salon('2026-10-02', '15:00'), R));
dit('19 h 59 : encore', false, dansLesHeuresCalmes(salon('2026-10-02', '19:59'), R));
dit('20 h pile : les heures calmes commencent', true, dansLesHeuresCalmes(salon('2026-10-02', '20:00'), R));
dit('minuit six : heures calmes', true, dansLesHeuresCalmes(salon('2026-10-02', '00:06'), R));
dit('7 h 59 : encore calme', true, dansLesHeuresCalmes(salon('2026-10-02', '07:59'), R));
dit('8 h pile : la fenetre s ouvre', false, dansLesHeuresCalmes(salon('2026-10-02', '08:00'), R));
dit('sans heures calmes (debut = fin), jamais calme', false, dansLesHeuresCalmes(salon('2026-10-02', '02:00'), { salleMin: 10, calmeDe: 8, calmeA: 8 }));
dit('une fenetre de jour (13 h a 15 h) se lit aussi', [false, true, false],
  ['12:59', '14:00', '15:00'].map((h) => dansLesHeuresCalmes(salon('2026-10-02', h), { salleMin: 10, calmeDe: 13, calmeA: 15 })));
dit('la nuit du 2, les heures calmes finissent le 2 a 8 h', iso(salon('2026-10-02', '08:00')), iso(finDesHeuresCalmes(salon('2026-10-02', '00:06'), R)));
dit('le soir du 2, elles finissent le 3 a 8 h', iso(salon('2026-10-03', '08:00')), iso(finDesHeuresCalmes(salon('2026-10-02', '21:30'), R)));

/* ── 3. Quand un message part ── */
{
  const d = heureDeDepart(salon('2026-10-02', '15:00'), R);
  dit('depose a 15 h, il part a 15 h 10', { partA: iso(salon('2026-10-02', '15:10')), calme: false }, { partA: iso(d.partA), calme: d.calme });
  const nuit = heureDeDepart(salon('2026-10-02', '00:06'), R);
  dit('LE CAS DE YEMAN : pose a minuit six, il part a 8 h, pas a minuit seize', { partA: iso(salon('2026-10-02', '08:00')), calme: true }, { partA: iso(nuit.partA), calme: nuit.calme });
  const soir = heureDeDepart(salon('2026-10-02', '19:55'), R);
  dit('depose a 19 h 55, sa salle finirait a 20 h 05 : il attend 8 h le lendemain', { partA: iso(salon('2026-10-03', '08:00')), calme: true }, { partA: iso(soir.partA), calme: soir.calme });
  const juste = heureDeDepart(salon('2026-10-02', '19:49'), R);
  dit('depose a 19 h 49, il part a 19 h 59, avant les heures calmes', { partA: iso(salon('2026-10-02', '19:59')), calme: false }, { partA: iso(juste.partA), calme: juste.calme });
  const matin = heureDeDepart(salon('2026-10-02', '07:55'), R);
  dit('depose a 7 h 55, il part a 8 h 05', { partA: iso(salon('2026-10-02', '08:05')), calme: false }, { partA: iso(matin.partA), calme: matin.calme });
}

/* ── 4. Le facteur peut-il le porter ? ── */
{
  const a15h20 = salon('2026-10-02', '15:20');
  const enAttente = { id: 'e1', statut: EN_ATTENTE, partA: iso(salon('2026-10-02', '15:10')) };
  dit('en attente, heure venue, plein jour : il part', true, peutPartir(enAttente, a15h20, R));
  dit('heure pas encore venue : il attend', false, peutPartir({ ...enAttente, partA: iso(salon('2026-10-02', '15:30')) }, a15h20, R));
  dit('UN MESSAGE RETENU NE PART JAMAIS SEUL', false, peutPartir({ ...enAttente, statut: RETENU }, a15h20, R));
  dit('ecarte : jamais', false, peutPartir({ ...enAttente, statut: ECARTE }, a15h20, R));
  dit('deja pris par le facteur : pas une seconde fois', false, peutPartir({ ...enAttente, statut: EN_ENVOI }, a15h20, R));
  dit('deja envoye : pas une seconde fois', false, peutPartir({ ...enAttente, statut: 'envoyé' }, a15h20, R));
  const a23h = salon('2026-10-02', '23:00');
  dit('heure venue mais 23 h : rien ne part seul la nuit', false, peutPartir(enAttente, a23h, R));
  dit('... sauf si une main a dit « envoyer quand meme »', true, peutPartir({ ...enAttente, parLaMain: true }, a23h, R));
  dit('sans heure de depart lisible, on ne devine pas', false, peutPartir({ id: 'e2', statut: EN_ATTENTE }, a15h20, R));
}

/* ── 5. Les gestes de la main ── */
{
  const t = salon('2026-10-02', '15:03');
  const base = { id: 'e1', statut: EN_ATTENTE, partA: iso(salon('2026-10-02', '15:10')), type: 'confirmation' };
  const tenu = retiens(base, 'Yéman', iso(t));
  dit('retenir : le message ne part plus, et dit qui et quand', { statut: RETENU, retenuPar: 'Yéman', retenuLe: iso(t) },
    { statut: tenu?.statut, retenuPar: tenu?.retenuPar, retenuLe: tenu?.retenuLe });
  dit('... le reste de la ligne n a pas bouge', 'confirmation', tenu?.type);
  dit('on ne retient pas ce qui est deja parti', null, retiens({ ...base, statut: 'envoyé' }, 'Yéman', iso(t)));
  dit('... ni ce que le facteur a deja en main', null, retiens({ ...base, statut: EN_ENVOI }, 'Yéman', iso(t)));
  const relachee = relache(tenu!, salon('2026-10-02', '15:30'), R);
  dit('relacher : il reprend dix minutes de salle a partir du geste', { statut: EN_ATTENTE, partA: iso(salon('2026-10-02', '15:40')) },
    { statut: relachee?.statut, partA: relachee?.partA });
  dit('... et ne porte plus la marque de la retenue', [undefined, undefined], [relachee?.retenuPar, relachee?.retenuLe]);
  dit('relache la nuit, il attend le matin', iso(salon('2026-10-03', '08:00')), relache(tenu!, salon('2026-10-02', '22:00'), R)?.partA);
  dit('on ne relache que ce qui est retenu', null, relache(base, t, R));
  const force = envoieMaintenant(base, salon('2026-10-02', '23:00'));
  dit('envoyer maintenant : heure venue, et la main le dit', { statut: EN_ATTENTE, partA: iso(salon('2026-10-02', '23:00')), parLaMain: true },
    { statut: force?.statut, partA: force?.partA, parLaMain: force?.parLaMain });
  dit('... le facteur le portera donc, meme a 23 h', true, peutPartir(force!, salon('2026-10-02', '23:00') + 1000, R));
  dit('envoyer maintenant vaut aussi pour un message retenu', EN_ATTENTE, envoieMaintenant(tenu!, t)?.statut);
  dit('ecarter : il ne partira pas, et dit qui', { statut: ECARTE, ecartePar: 'Yéman' }, (({ statut, ecartePar }) => ({ statut, ecartePar }))(ecarte(tenu!, 'Yéman', iso(t))!));
  dit('on n ecarte pas ce qui est parti', null, ecarte({ ...base, statut: 'envoyé' }, 'Yéman', iso(t)));
}

/* ── 6. La pastille ── */
{
  const t = salon('2026-10-02', '15:00');
  const salle = [
    { id: 'a', statut: EN_ATTENTE, partA: iso(salon('2026-10-02', '15:07')) },
    { id: 'b', statut: EN_ATTENTE, partA: iso(salon('2026-10-02', '15:04')) },
    { id: 'c', statut: RETENU },
    { id: 'd', statut: 'envoyé' },
  ];
  dit('deux attendent, un est retenu, le premier part dans 4 minutes', { attente: 2, tenus: 1, prochainDansMin: 4 }, resumeDeLaSalle(salle, t));
  dit('salle vide : rien a dire', { attente: 0, tenus: 0, prochainDansMin: null }, resumeDeLaSalle([{ id: 'd', statut: 'envoyé' }], t));
  dit('« part dans 4 min »', 'part dans 4 min', quandIlPart(salle[1], t));
  dit('« part a 8 h » pour un message de la nuit', 'part à 8 h', quandIlPart({ partA: iso(salon('2026-10-03', '08:00')), calme: true }, salon('2026-10-02', '23:00')));
  dit('« part a l instant » quand l heure est venue', 'part à l’instant', quandIlPart(salle[1], salon('2026-10-02', '15:05')));
}

/* ── 7. Relu avant de partir ── */
{
  const t = salon('2026-10-02', '15:00');
  const e = { dateRdv: '2026-10-08', heure: '10:00', type: 'confirmation' };
  dit('le rendez-vous tient : il part', null, pourquoiIlNePartPlus(e, { date: '2026-10-08', time: '10:00', status: 'confirmé' }, t));
  dit('annule pendant l attente : il ne part pas', 'le rendez-vous a été annulé', pourquoiIlNePartPlus(e, { date: '2026-10-08', time: '10:00', status: 'annulé' }, t));
  dit('deplace pendant l attente : il ne part pas', 'le rendez-vous a été déplacé', pourquoiIlNePartPlus(e, { date: '2026-10-09', time: '10:00', status: 'confirmé' }, t));
  dit('heure changee : il ne part pas', 'le rendez-vous a été déplacé', pourquoiIlNePartPlus(e, { date: '2026-10-08', time: '11:00', status: 'confirmé' }, t));
  dit('supprime : il ne part pas', 'le rendez-vous n’existe plus', pourquoiIlNePartPlus(e, null, t));
  dit('une confirmation ne part pas pour un rendez-vous repasse en attente', 'le rendez-vous n’est plus confirmé', pourquoiIlNePartPlus(e, { date: '2026-10-08', time: '10:00', status: 'en attente' }, t));
  dit('un rappel, lui, part pour un rendez-vous en attente', null, pourquoiIlNePartPlus({ ...e, type: 'rappel-j1' }, { date: '2026-10-08', time: '10:00', status: 'en attente' }, t));
  dit('retenu jusqu apres l heure du rendez-vous : on ne confirme pas le passe', 'l’heure du rendez-vous est passée',
    pourquoiIlNePartPlus(e, { date: '2026-10-08', time: '10:00', status: 'confirmé' }, salon('2026-10-08', '10:30')));
}

/* ── 8. Le facteur, vivant ou non ── */
{
  const t = salon('2026-10-02', '15:00');
  dit('vu il y a une minute : vivant, on depose', true, facteurVivant(iso(t - 60_000), t));
  dit('vu il y a six minutes : absent, on envoie comme avant', false, facteurVivant(iso(t - FACTEUR_VIVANT_MS - 60_000), t));
  dit('jamais vu : absent', false, facteurVivant(undefined, t));
  dit('une horloge folle (signe de vie dans le futur lointain) ne compte pas', false, facteurVivant(iso(t + 3_600_000), t));
}

/* ── 9. Le journal ne compte pas ce qui attend ── */
{
  const quand = '2026-10-02T14:00:00.000Z';
  const lignes = [
    { id: '1', type: 'confirmation', canal: 'whatsapp', statut: 'envoyé', quand },
    { id: '2', type: 'confirmation', canal: 'whatsapp', statut: EN_ATTENTE, quand },
    { id: '3', type: 'confirmation', canal: 'whatsapp', statut: RETENU, quand },
    { id: '4', type: 'confirmation', canal: 'whatsapp', statut: EN_ENVOI, quand },
    { id: '5', type: 'confirmation', canal: 'whatsapp', statut: ECARTE, quand },
    { id: '6', type: 'confirmation', canal: 'whatsapp', statut: PERIME, quand },
  ];
  dit('ce qui attend encore n est pas au journal', ['1', '5', '6'], envoisDeLaPeriode(lignes, 'aujourdhui', '2026-10-02').map((e) => e.id));
  dit('... un seul message est compte parti', 1, compteDuJournal(envoisDeLaPeriode(lignes, 'aujourdhui', '2026-10-02')).partis);
  dit('un message ecarte se dit ecarte, pas « en route »', 'écarté, pas envoyé', DEVENU_DIT[devenuDe(lignes[4])]);
  dit('un message perime se dit pas envoye', 'pas envoyé', DEVENU_DIT[devenuDe(lignes[5])]);
  dit('attendEncore : en attente, retenu, en main', [false, true, true, true, false, false], lignes.map(attendEncore));
}

/* ── 10. Les fonctions Edge portent le MEME calcul que le depot ── */
{
  const source = readFileSync('src/shared/salle-des-envois.ts', 'utf8');
  /** Le texte d'une fonction du depot, sans son `export`, espaces egalises. */
  const duDepot = (nom: string): string => {
    const debut = source.search(new RegExp(`export (?:function|const) ${nom}\\b`));
    if (debut < 0) return `INTROUVABLE:${nom}`;
    const reste = source.slice(debut);
    const fin = reste.search(/\n\}\n|\n\};\n/);
    return reste.slice(0, fin + (reste.slice(fin, fin + 4) === '\n};\n' ? 3 : 2)).replace(/^export /, '').replace(/\s+/g, ' ').trim();
  };
  const egalise = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\s+/g, ' ');
  const DEPOSENT = ['reglesDepuis', 'heureDuSalon', 'dansLesHeuresCalmes', 'finDesHeuresCalmes', 'heureDeDepart', 'facteurVivant'];
  for (const f of ['confirmation-rdv', 'rappels-j1', 'avis-google']) {
    const texte = egalise(`supabase/functions/${f}/index.ts`);
    dit(`${f} porte le calcul du depot, a l identique`, [], DEPOSENT.filter((n) => !texte.includes(duDepot(n))));
    dit(`${f} ne depose que si la salle est ouverte, et envoie comme avant sinon`, true, /salleOuverte/.test(texte) && /facteurVivant\(\(docs\?\.find\(\(d\) => d\.key === 'mnd_facteur'\)/.test(texte));
  }
  /* CHAQUE CANAL DEPOSE « en-attente », ET RIEN D'AUTRE. Le premier controle ne
     regardait que la presence du mot : un rappel depose « envoye » (donc
     jamais porte, et dit parti) lui echappait. On nomme chaque depot, et l'on
     verifie qu'entre le depot et la sortie de sa branche rien n'est envoye. */
  const DEPOTS: Record<string, RegExp[]> = {
    'confirmation-rdv': [/consigne\('push', a, 'en-attente', undefined, undefined, undefined, depot\(/, /consigne\('whatsapp', a, 'en-attente', undefined, undefined, undefined, depot\(/],
    'rappels-j1': [/consigne\('whatsapp', a, 'en-attente', undefined, undefined, depot\(/, /consigne\('sms', a, 'en-attente', undefined, undefined, depot\(/, /statut: 'en-attente', quand: maintenant, \.\.\.depot\(/],
    'avis-google': [/consigne\(p, 'en-attente', undefined, depot\(/],
  };
  for (const [f, motifs] of Object.entries(DEPOTS)) {
    const texte = egalise(`supabase/functions/${f}/index.ts`);
    dit(`${f} depose chaque canal « en-attente », avec son colis`, [], motifs.filter((m) => !m.test(texte)).map((m) => m.source.slice(0, 40)));
    const branches = [...texte.matchAll(/if \(salleOuverte[^{]*\{(.*?)(?:\} else if \(|continue; \})/g), ...texte.matchAll(/if \(enSalle[^{]*\{(.*?)(?:\} else if \(|continue; \})/g)].map((m) => m[1]);
    dit(`${f} : ses branches de salle existent`, true, branches.length >= motifs.length);
    dit(`${f} : dans une branche de salle, rien ne part vers la cliente`, [], branches.filter((b) => /fetch\(/.test(b)).map((b) => b.slice(0, 60)));
  }
  const facteur = egalise('supabase/functions/envois-partent/index.ts');
  dit('le facteur porte le calcul du depot, a l identique', [], ['reglesDepuis', 'heureDuSalon', 'dansLesHeuresCalmes', 'pourquoiIlNePartPlus'].filter((n) => !facteur.includes(duDepot(n))));
  dit('le facteur dit qu il est vivant', true, /upsert\(\{ key: 'mnd_facteur', data: \{ vuLe: maintenant/.test(facteur));
  dit('le facteur ne lit que ce qui est « en-attente » : un message retenu lui est invisible', true, /\.eq\('data->>statut', 'en-attente'\)\.limit\(300\)/.test(facteur));
  dit('le facteur prend en main par une ecriture conditionnelle', true, /statut: 'en-envoi' \} \}\) \.eq\('id', l\.id\)\.eq\('data->>statut', 'en-attente'\)\.select\('id'\)/.test(facteur));
  dit('le facteur ne porte rien pendant les heures calmes, sauf a la main', true, /partAde\(l\) <= maintenantMs && \(!calme \|\| l\.data\.parLaMain === true\)/.test(facteur));
  dit('le facteur relit le rendez-vous avant de porter', true, /pourquoiIlNePartPlus\(l\.data, \(rdvRow\?\.data \?\? null\)/.test(facteur) && /statut: 'périmé', detail: motif/.test(facteur));
  const confirmation = egalise('supabase/functions/confirmation-rdv/index.ts');
  dit('celle qui reserve elle-meme (Ma Couronne) recoit sa confirmation tout de suite', true, /const enSalle = salleOuverte && a\.source !== 'couronne';/.test(confirmation));
  dit('un message perime peut se redeposer, un message retenu verrouille', true, /const SE_RETENTE = new Set\(\['échec', 'périmé'\]\);/.test(confirmation));
  const push = egalise('supabase/functions/push-notify/index.ts');
  dit('le facteur peut notifier une cliente et le personnel avec la cle service', true, /if \(!parLeService\(req\)\) \{ const jwt/.test(push) && /if \(!parLeService\(req\) && !\(await allowRate\(ipOf\(req\)\)\)\)/.test(push));
}

/* ── 11. L'ecran ecrit sous condition, et pas dans le magasin ── */
{
  const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  const ecran = sansCommentaires('src/apps/trone/routes/clients/SalleDesEnvois.tsx');
  dit('le geste ne passe que si la ligne est encore dans l etat montre', true, /\.update\(\{ data: apres \}\)\.eq\('id', id\)\.eq\('data->>statut', ligne\.statut\)\.select\('id'\)/.test(ecran));
  dit('avec un serveur, l ecran n ecrit pas dans le magasin (sa poussee pourrait remettre en attente un message parti)', 1, (ecran.match(/envoisStore\.set\(/g) ?? []).length);
  dit('... et cette seule ecriture est celle du poste sans serveur', true, /if \(!supabase\) \{ envoisStore\.set\(/.test(ecran));
  const barre = sansCommentaires('src/apps/trone/shell/Shell.tsx');
  dit('la pastille de la salle vit dans la barre du Trone', true, /<SyncDot \/> <PastilleDeLaSalle \/>/.test(barre));
  const pastille = sansCommentaires('src/apps/trone/shell/PastilleDeLaSalle.tsx');
  dit('elle sonne pour ce qui entre, pas pour ce qui etait deja la', true, /if \(avant === null\) return;/.test(pastille) && /sonne\(\)/.test(pastille));
}

console.log(ko === 0 ? '\nLa salle tient : rien ne part la nuit, rien de retenu ne part seul.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
