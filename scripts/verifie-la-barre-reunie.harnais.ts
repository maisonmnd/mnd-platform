/* LA BARRE RÉUNIE, ÉPROUVÉE — 14 octobre 2026.

   « Il y a certaines rubriques dans la barre qui peuvent être fusionnées »
   (Yéman). Analyse 7tZF49MT…, choix cochés : quatorze fusions sur quinze
   (les vitrines et les QR codes restent séparés), les prêts au personnel aux
   Ressources humaines (la direction et les Finances y gardent l'accès), et
   les accès tenus ONGLET PAR ONGLET.

   Les promesses sont écrites ici à la main, jamais déduites de REUNIONS :
   le nombre de rubriques, qui voit quel onglet, ce que la barre montre. */
import { readFileSync } from 'node:fs';
import { NAV, REUNIONS, RETIRES_DE_LA_BARRE, cheminOuvert, ecranDAvant, peutVoir, premierEcranVisible, reunionDe } from '../src/apps/trone/routes/index';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (f: string) => lis(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const items = NAV.flatMap((g) => g.items.map((it) => ({ ...it, groupe: g.group })));
const item = (p: string) => items.find((it) => it.path === p);
const dansLaBarre = items.filter((it) => !it.horsMenu);

/* ── 1. CE QUE LA BARRE MONTRE ── */
/* 40 depuis le 15 octobre 2026 : « Entre deux séances » (maquette EfhgzxjA…
   validée) s'ajoute à la Clientèle ; les quatorze réunions ne bougent pas. */
/* 41 depuis le 24 octobre 2026 : « Les projets » (maquette VJ5PJEGU…,
   choix du sélecteur : rangés sous Direction) prennent une rubrique ; « Mes
   tâches », né le même soir, est un onglet du Fil et n'en prend aucune. */
/* 42 depuis le 26 octobre 2026 : « Les avis Google » (maquette YaWfiqou…,
   « Tout me va ») prennent une rubrique à Marketing & fidélité, sous « Les
   vitrines ». */
dit('la barre montre 42 rubriques', 42, dansLaBarre.length);
dit('... dont Les avis Google, sous Les vitrines', ['Marketing & Fidélité', false], [item('/avis-google')?.groupe, !!item('/avis-google')?.horsMenu]);
dit('... dont Entre deux seances, dans la Clientele', ['Clientèle', false], [item('/entre-deux')?.groupe, !!item('/entre-deux')?.horsMenu]);
dit('... dont Les projets, sous Direction ; Mes taches reste un onglet du Fil', ['Direction', false, true],
  [item('/projets')?.groupe, !!item('/projets')?.horsMenu, item('/mes-taches')?.horsMenu === true]);
const absorbes = ['/tableau', '/recommandations', '/bilan-mensuel', '/consultations', '/marque', '/cadence', '/coffre', '/cartes-cadeaux', '/personas', '/fournisseurs', '/compte-courant', '/appels', '/atelier-des-contenus', '/branches'];
dit('les quatorze ecrans absorbes ont quitte la barre', absorbes, absorbes.filter((p) => item(p)?.horsMenu === true));
dit('... et restent joignables : chacun garde son adresse', absorbes.length, absorbes.filter((p) => !!item(p)).length);
const titres: Record<string, string> = {
  '/fil': 'Le Fil', '/synthese': 'Synthèse & bilan', '/demandes': 'Demandes & consultations', '/parametres': 'Paramètres',
  '/analytics': 'Les tendances', '/caisses': 'Caisses & coffre', '/comptes': 'Avoirs & cartes cadeaux', '/marketing': 'Marketing',
  '/home-rituals': 'Stock & Achats', '/prets': 'Prêts & compte courant', '/conversations': 'Conversations',
  '/centre-de-commande': 'Centre de commande', '/personnel': 'Ressources humaines',
};
dit('chaque rubrique reunie porte son titre et reste dans la barre', titres,
  Object.fromEntries(Object.keys(titres).map((p) => [p, item(p)?.horsMenu ? 'HORS BARRE' : item(p)?.label])));
dit('les vitrines et les QR codes restent separes (choix du 14 octobre)', [false, false, undefined],
  [!!item('/vitrine')?.horsMenu, !!item('/qr-codes')?.horsMenu, reunionDe('/qr-codes')?.hote]);
dit('les Recommandations quittent la barre sans reunion', [true, true, undefined],
  [RETIRES_DE_LA_BARRE.includes('/recommandations'), item('/recommandations')?.horsMenu === true, reunionDe('/recommandations')]);
dit('chaque onglet montre l ecran d avant, et l ecran d avant existe', true,
  REUNIONS.every((r) => r.onglets.every((o) => !!item(o.path) && !!ecranDAvant(o.path))));
dit('un onglet n appartient qu a une reunion', true,
  REUNIONS.flatMap((r) => r.onglets.map((o) => o.path)).every((p, i, t) => t.indexOf(p) === i));

/* ── 2. ONGLET PAR ONGLET : chacun garde exactement ce qu'il voyait ── */
const maitre = (acces: Record<string, boolean>) => ({ role: 'maitre', acces });
const ouvre = (who: { role: string; acces: Record<string, boolean> }, p: string) => cheminOuvert(who.role, p, who.acces);
dit('la direction ouvre chaque rubrique sur son premier onglet', Object.keys(titres).filter((p) => p !== '/centre-de-commande').map((p) => p),
  Object.keys(titres).filter((p) => p !== '/centre-de-commande').map((p) => ouvre({ role: 'gerant', acces: {} }, p)));
const consult = maitre({ '/consultations': true });
dit('qui ne voyait que Consultations voit la rubrique, ouverte sur les consultations', ['/consultations', false, true],
  [ouvre(consult, '/demandes'), peutVoir('maitre', '/demandes', consult.acces), peutVoir('maitre', '/consultations', consult.acces)]);
dit('qui ne voyait rien de la reunion ne voit pas la rubrique', null, ouvre(maitre({}), '/comptes'));
dit('un maitre sans refus garde le fil et le tableau (ouverts sauf refus)', ['/fil', true], [ouvre(maitre({}), '/fil'), peutVoir('maitre', '/tableau', {})]);
dit('un tableau refuse reste refuse dans la reunion', [false, true], [peutVoir('maitre', '/tableau', { '/tableau': false }), peutVoir('maitre', '/fil', { '/tableau': false })]);

/* ── 3. LES PRÊTS SE COUPENT EN DEUX ── */
const finances = maitre({ 'dept-finances': true });
const equipe = maitre({ 'dept-equipe': true });
dit('les Finances voient les prets au personnel, sans le reste des RH', [true, false, '/prets-personnel'],
  [peutVoir('maitre', '/prets-personnel', finances.acces), peutVoir('maitre', '/personnel', finances.acces), ouvre(finances, '/personnel')]);
dit('le departement Equipe seul ne les voit pas (la direction et les Finances, seulement)', false, peutVoir('maitre', '/prets-personnel', equipe.acces));
dit('la direction les voit', [true, true], [peutVoir('souverain', '/prets-personnel', {}), peutVoir('gerant', '/prets-personnel', {})]);
dit('les prets au personnel vivent aux Ressources humaines', ['Équipe', '/personnel'], [item('/prets-personnel')?.groupe, reunionDe('/prets-personnel')?.hote]);
const prets = sansCommentaires('src/apps/trone/routes/finances/Prets.tsx');
dit('l ecran des prets se lit pour l equipe seule a cette adresse, pour le reste aux Finances', true,
  prets.includes("const duPersonnel = useLocation().pathname === '/prets-personnel';")
  && prets.includes("return prets.filter((p) => estDuPersonnel(p) === duPersonnel);")
  && prets.includes("etatsDesEmprunteurs(lesMiens, branch.id")
  && prets.includes('const dette = detteEnCours(lesMiens, branch.id);'));
dit('aux RH, on ne pose qu un pret a l equipe ; aux Finances, jamais', true,
  prets.includes("((duPersonnel ? ['equipe'] : ['cliente', 'tiers', 'associe', 'foyer']) as GenreEmprunteur[])"));
dit('ce que la Maison doit et les objectifs restent aux Finances', true,
  prets.includes("{!duPersonnel && registre === 'doit' ? <CeQueLaMaisonDoit /> : !duPersonnel && registre === 'objectifs' ? <LesObjectifs /> : ("));

/* ── 4. LA BARRE ET L'ÉCRAN RÉUNI ── */
const shell = sansCommentaires('src/apps/trone/shell/Shell.tsx');
dit('la barre montre une rubrique des qu un de ses onglets s ouvre, et y mene', true,
  shell.includes('g.items.filter((it) => !it.horsMenu && cheminOuvert(role, it.path, mesDomaines) !== null)')
  && shell.includes('to={cheminOuvert(role, it.path, mesDomaines) ?? it.path}'));
dit('un ecran absorbe range au quotidien suit sa rubrique', true, shell.includes('quotidienPerso.map((p) => reunionDe(p)?.hote ?? p)'));
const reuni = sansCommentaires('src/apps/trone/routes/_reuni.tsx');
dit('l ecran reuni ne montre que les onglets que la personne peut ouvrir', true,
  reuni.includes('.filter((o) => peutVoir(tete?.role, o.path, mesDomaines))') && reuni.includes('navigate(o.path)'));
const seulementConsultations = { '/consultations': true, '/mon-mois': false, '/calendrier': false, '/fil': false, '/tableau': false };
dit('le premier ecran ouvert d un maitre tient compte des reunions (un onglet absorbe)', '/consultations', premierEcranVisible('maitre', seulementConsultations));

console.log(ko ? `\n${ko} ECHEC.` : '\nLa barre reunie tient ses promesses.');
if (ko) process.exitCode = 1;
