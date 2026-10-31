/* LA BARRE RÉUNIE, ÉPROUVÉE — 14 octobre 2026.

   « Il y a certaines rubriques dans la barre qui peuvent être fusionnées »
   (Yéman). Analyse 7tZF49MT…, choix cochés : quatorze fusions sur quinze
   (les vitrines et les QR codes restent séparés), les prêts au personnel aux
   Ressources humaines (la direction et les Finances y gardent l'accès), et
   les accès tenus ONGLET PAR ONGLET.

   LA BARRE À VINGT-HUIT, 27 octobre 2026 (lot 3 de l'Assistant Maison, spec
   §3, maquette validée) : seize rubriques quittent la barre et gardent leur
   adresse, trois réunions grandissent (Synthèse, Ressources humaines,
   Clientes), l'Audience naît en onglet des Clientes. Les promesses du 14
   octobre se réécrivent le même jour, avec la même intention, jamais
   supprimées.

   Les promesses sont écrites ici à la main, jamais déduites de REUNIONS :
   le nombre de rubriques, qui voit quel onglet, ce que la barre montre. */
import { readFileSync } from 'node:fs';
import { DEPARTEMENTS, ECRANS_NES_APRES_LES_DEPARTEMENTS, NAV, REUNIONS, RETIRES_DE_LA_BARRE, cheminOuvert, ecranDAvant, peutVoir, premierEcranVisible, reunionDe } from '../src/apps/trone/routes/index';

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
/* 43 depuis le même jour : « Les prévisions » (maquette 1opRHqoV…, choix du
   sélecteur : en Direction, sous le Centre de commande). */
/* 44 depuis le même jour : « Gérard » (maquette 4bPVFik1…), en Clientèle,
   sous « Clientes ». */
/* 28 depuis le 27 octobre 2026 : seize rubriques quittent la barre (audit du
   26 octobre : 13 mort-nées, 17 dormantes ; spec de l'Assistant Maison §3),
   l'Audience entre en onglet des Clientes, pas en rubrique. Le groupe
   Marketing & Fidélité reste, à deux rubriques (maquette validée). */
/* 29 depuis le 31 octobre 2026 : « Les assistants » (maquette TtHPKpjC…,
   Opale et Onyx reliés par le Trône), en Direction, sous Les agents ; les
   souverains seuls. */
dit('la barre montre 29 rubriques', 29, dansLaBarre.length);
dit('... par département : Direction 6, Clientèle 4, Atelier 2, Vente & Caisse 4, Finances 4, Marketing & Fidélité 2, Équipe 3, Académie 1, Système 3',
  { Direction: 6, 'Clientèle': 4, Atelier: 2, 'Vente & Caisse': 4, Finances: 4, 'Marketing & Fidélité': 2, 'Équipe': 3, 'Académie': 1, 'Système': 3 },
  Object.fromEntries(NAV.map((g) => [g.group, g.items.filter((it) => !it.horsMenu).length])));
dit('... dont Les prévisions, en Direction', ['Direction', false], [item('/previsions')?.groupe, !!item('/previsions')?.horsMenu]);
dit('... dont l Assistant Maison, en Clientèle, juste sous Clientes', ['Clientèle', false, 'Assistant Maison', true],
  [item('/gerard')?.groupe, !!item('/gerard')?.horsMenu, item('/gerard')?.label,
    dansLaBarre.findIndex((it) => it.path === '/gerard') === dansLaBarre.findIndex((it) => it.path === '/customers') + 1]);
/* 27 octobre 2026 : Les avis Google et Entre deux séances sont des vues de
   l'Assistant ; la rubrique s'efface, l'adresse et le groupe restent. */
dit('... Les avis Google ont quitté la barre (vue de l Assistant), sous Les vitrines par l adresse', ['Marketing & Fidélité', true], [item('/avis-google')?.groupe, !!item('/avis-google')?.horsMenu]);
dit('... Entre deux séances a quitté la barre (filtre des conversations), l adresse reste en Clientèle', ['Clientèle', true], [item('/entre-deux')?.groupe, !!item('/entre-deux')?.horsMenu]);
dit('... dont Les projets, sous Direction ; Mes taches reste un onglet du Fil', ['Direction', false, true],
  [item('/projets')?.groupe, !!item('/projets')?.horsMenu, item('/mes-taches')?.horsMenu === true]);
const absorbes = ['/tableau', '/recommandations', '/bilan-mensuel', '/consultations', '/marque', '/cadence', '/coffre', '/cartes-cadeaux', '/personas', '/fournisseurs', '/compte-courant', '/appels', '/atelier-des-contenus', '/branches'];
dit('les quatorze ecrans absorbes ont quitte la barre', absorbes, absorbes.filter((p) => item(p)?.horsMenu === true));
/* Les seize du 27 octobre 2026 (spec §3, tableau « Quitte la barre »). */
const retiresLe27 = ['/centre-de-commande', '/analytics', '/a-faire', '/juste-prix', '/conversations', '/entre-deux', '/demandes', '/laboratoire', '/encaissements', '/creances', '/chiffre-des-prestations', '/salon-foyer', '/marketing', '/cercle', '/avis-google', '/prestataires'];
dit('les seize rubriques retirees le 27 octobre 2026 ont quitte la barre', retiresLe27, retiresLe27.filter((p) => item(p)?.horsMenu === true));
dit('... RETIRES_DE_LA_BARRE les nomme toutes, avec les Recommandations : dix-sept', [17, true],
  [RETIRES_DE_LA_BARRE.length, retiresLe27.every((p) => RETIRES_DE_LA_BARRE.includes(p)) && RETIRES_DE_LA_BARRE.includes('/recommandations')]);
const horsBarre = [...absorbes, ...retiresLe27.filter((p) => !absorbes.includes(p))];
dit('... et les trente restent joignables : chacun garde son adresse', 30, horsBarre.filter((p) => !!item(p)).length);
const titres: Record<string, string> = {
  '/fil': 'Le Fil', '/synthese': 'Synthèse & bilan', '/parametres': 'Paramètres',
  '/caisses': 'Caisses & coffre', '/comptes': 'Avoirs & cartes cadeaux',
  '/home-rituals': 'Stock & Achats', '/prets': 'Prêts & compte courant',
  '/personnel': 'Ressources humaines', '/customers': 'Clientes',
};
dit('chaque rubrique reunie porte son titre et reste dans la barre', titres,
  Object.fromEntries(Object.keys(titres).map((p) => [p, item(p)?.horsMenu ? 'HORS BARRE' : item(p)?.label])));
/* Cinq hôtes de réunion ont quitté la barre le 27 octobre 2026 : ils gardent
   la réunion (la barre d'onglets) et leur titre, joignables par l'adresse. */
const hotesRetires: Record<string, string> = {
  '/centre-de-commande': 'HORS BARRE', '/analytics': 'HORS BARRE', '/conversations': 'HORS BARRE', '/demandes': 'HORS BARRE', '/marketing': 'HORS BARRE',
};
dit('les cinq hotes retires sont hors barre, et gardent leur reunion et son titre', [hotesRetires, true],
  [Object.fromEntries(Object.keys(hotesRetires).map((p) => [p, item(p)?.horsMenu ? 'HORS BARRE' : item(p)?.label])),
    Object.keys(hotesRetires).every((p) => reunionDe(p)?.hote === p && item(p)?.label === reunionDe(p)?.titre)]);
dit('les vitrines et les QR codes restent separes (choix du 14 octobre), seuls visibles dans Marketing & Fidelite', [false, false, undefined, ['/vitrine', '/qr-codes']],
  [!!item('/vitrine')?.horsMenu, !!item('/qr-codes')?.horsMenu, reunionDe('/qr-codes')?.hote,
    NAV.find((g) => g.group === 'Marketing & Fidélité')?.items.filter((it) => !it.horsMenu).map((it) => it.path)]);
dit('les libelles du 27 octobre 2026 : « QR de la Maison », « Assistant Maison », et le Foyer sans le mot banni', ['QR de la Maison', 'Assistant Maison', false],
  [item('/qr-codes')?.label, item('/gerard')?.label, /salon/i.test(item('/salon-foyer')?.label ?? '')]);
dit('les Recommandations quittent la barre sans reunion', [true, true, undefined],
  [RETIRES_DE_LA_BARRE.includes('/recommandations'), item('/recommandations')?.horsMenu === true, reunionDe('/recommandations')]);
/* LA PANNE DU 27 OCTOBRE 2026 : le retrait jugé avant la réunion rendait un
   hôte retiré sans écran réuni, et ses onglets sans écran d'avant. */
dit('chaque onglet montre l ecran d avant, et l ecran d avant existe (les hotes retires aussi)', true,
  REUNIONS.every((r) => r.onglets.every((o) => !!item(o.path) && !!ecranDAvant(o.path))));
dit('un onglet n appartient qu a une reunion', true,
  REUNIONS.flatMap((r) => r.onglets.map((o) => o.path)).every((p, i, t) => t.indexOf(p) === i));
/* Les trois réunions qui grandissent le 27 octobre 2026. */
dit('Clientes : les clientes, l Audience, les Ambassadrices', ['/customers', '/audience', '/parrainages'], REUNIONS.find((r) => r.hote === '/customers')?.onglets.map((o) => o.path));
dit('Synthese & bilan : le resultat, le mois, les prestations', ['/synthese', '/bilan-mensuel', '/chiffre-des-prestations'], REUNIONS.find((r) => r.hote === '/synthese')?.onglets.map((o) => o.path));
dit('Ressources humaines : le personnel, les prets au personnel, les prestataires', ['/personnel', '/prets-personnel', '/prestataires'], REUNIONS.find((r) => r.hote === '/personnel')?.onglets.map((o) => o.path));
dit('l Audience : nee le 27 octobre 2026 en Clientele, hors barre (onglet), nommee parmi les ecrans nes apres', ['Clientèle', true, true],
  [item('/audience')?.groupe, item('/audience')?.horsMenu === true, ECRANS_NES_APRES_LES_DEPARTEMENTS.includes('/audience')]);
dit('les Ambassadrices : la ligne garde horsMenu, et vit sous Clientes', ['Clientèle', true],
  [item('/parrainages')?.groupe, /path: '\/parrainages', horsMenu: true/.test(lis('src/apps/trone/routes/index.tsx'))]);
dit('la ligne d Entre deux seances n a pas bouge : le retrait passe par RETIRES, jamais par horsMenu dans la ligne', true,
  lis('src/apps/trone/routes/index.tsx').includes("{ path: '/entre-deux', label: 'Entre deux séances', icon: HeartPulse, Component: lazy(() => import('./clients/EntreDeuxSeances')) },"));

/* ── 2. ONGLET PAR ONGLET : chacun garde exactement ce qu'il voyait ── */
const maitre = (acces: Record<string, boolean>) => ({ role: 'maitre', acces });
const ouvre = (who: { role: string; acces: Record<string, boolean> }, p: string) => cheminOuvert(who.role, p, who.acces);
dit('la direction ouvre chaque rubrique reunie visible sur son premier onglet', Object.keys(titres),
  Object.keys(titres).map((p) => ouvre({ role: 'gerant', acces: {} }, p)));
dit('... et un hote retire mene encore a son premier onglet ouvert, par l adresse', ['/analytics', '/conversations', '/demandes', '/marketing', '/centre-de-commande'],
  [ouvre({ role: 'gerant', acces: {} }, '/analytics'), ouvre({ role: 'gerant', acces: {} }, '/conversations'), ouvre({ role: 'gerant', acces: {} }, '/demandes'),
    ouvre({ role: 'gerant', acces: {} }, '/marketing'), ouvre({ role: 'souverain', acces: {} }, '/centre-de-commande')]);
const consult = maitre({ '/consultations': true });
dit('qui ne voyait que Consultations voit la reunion, ouverte sur les consultations (par l adresse : la rubrique est hors barre)', ['/consultations', false, true],
  [ouvre(consult, '/demandes'), peutVoir('maitre', '/demandes', consult.acces), peutVoir('maitre', '/consultations', consult.acces)]);
dit('qui ne voyait rien de la reunion ne voit pas la rubrique', null, ouvre(maitre({}), '/comptes'));
dit('un maitre sans refus garde le fil et le tableau (ouverts sauf refus)', ['/fil', true], [ouvre(maitre({}), '/fil'), peutVoir('maitre', '/tableau', {})]);
dit('un tableau refuse reste refuse dans la reunion', [false, true], [peutVoir('maitre', '/tableau', { '/tableau': false }), peutVoir('maitre', '/fil', { '/tableau': false })]);
/* 27 octobre 2026 : neuf départements, neuf clefs figées ; après le retrait,
   chacune ouvre encore au moins une rubrique visible ou un onglet. */
dit('chaque departement ouvre encore au moins une rubrique visible ou un onglet a qui le recoit', DEPARTEMENTS.map((d) => d.k),
  DEPARTEMENTS.filter((d) => items.some((it) => (!it.horsMenu || !!reunionDe(it.path)) && peutVoir('maitre', it.path, { [d.k]: true }))).map((d) => d.k));
dit('la Clientele ouvre l Audience et les Ambassadrices, en onglets des Clientes', ['/customers', true, true],
  [ouvre(maitre({ 'dept-clientele': true }), '/customers'), peutVoir('maitre', '/audience', { 'dept-clientele': true }), peutVoir('maitre', '/parrainages', { 'dept-clientele': true })]);

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
/* 27 octobre 2026 : la réunion des Demandes a quitté la barre ; le premier
   écran d'un maître se lit sur une réunion encore visible (le mois, onglet
   de Synthèse). Qui n'a qu'un écran retiré n'a plus de premier écran : la
   barre ne le montre pas, l'adresse reste. */
const seulementLeMois = { '/bilan-mensuel': true, '/mon-mois': false, '/calendrier': false, '/fil': false, '/tableau': false, '/mes-taches': false };
dit('le premier ecran ouvert d un maitre tient compte des reunions (un onglet absorbe)', '/bilan-mensuel', premierEcranVisible('maitre', seulementLeMois));
const seulementConsultations = { '/consultations': true, '/mon-mois': false, '/calendrier': false, '/fil': false, '/tableau': false, '/mes-taches': false };
dit('... et qui ne voit qu un ecran retire de la barre n a pas de premier ecran (l adresse reste)', null, premierEcranVisible('maitre', seulementConsultations));

console.log(ko ? `\n${ko} ECHEC.` : '\nLa barre reunie tient ses promesses.');
if (ko) process.exitCode = 1;
