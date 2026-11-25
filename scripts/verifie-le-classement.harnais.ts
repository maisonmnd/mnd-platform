import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CATEGORIES_DE_DEPART, CRITERES_PROPOSES, ETAPES, carteDeLaVue, categoriesLues, classeLaCliente, criteresEnVigueur, definitionDeLaVue,
  ficheDuClassement, lieuDeLaVille, regionDuNumero, villeADeduire,
  type CategorieDeLaMaison, type CriteresDuClassement, type FicheDuClassement,
} from '../src/shared/classement-pur';

/* LE CLASSEMENT DES CLIENTES, ÉPROUVÉ (20 novembre 2026). Chaque règle de
   classement-pur, et les deux portes de l'écran (l'onglet, les villes). */

const racine = path.resolve(import.meta.dirname ?? '.', '..');
const lis = (rel: string) => {
  if (process.env.CLASSEMENT_PANNE_FICHIER === rel && process.env.CLASSEMENT_PANNE_COPIE) return readFileSync(process.env.CLASSEMENT_PANNE_COPIE, 'utf8');
  return readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
};
void racine;

let echecs = 0;
const vaut = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) echecs++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}${ok ? '' : ` (attendu ${JSON.stringify(attendu)})`}`);
};

const T = '2026-11-20';
const avant = (j: number) => new Date(Date.parse(`${T}T12:00:00Z`) - j * 86_400_000).toISOString().slice(0, 10);
const apres = (j: number) => new Date(Date.parse(`${T}T12:00:00Z`) + j * 86_400_000).toISOString().slice(0, 10);
const fiche = (o: Partial<FicheDuClassement>): FicheDuClassement => ({
  id: 'x', nom: 'Essai', visites: 0, premiere: null, derniere: null, prochain: null, rythme: null, rythmeDeclare: null,
  annulations: [], absences: [], regionNumero: 'Bénin', ville: '', lieuSaisi: null, villeDeduite: false, marquee: false, dePassage: false,
  passagePose: false, locksDefaits: false, persona: '', accord: 'inconnu', essai: false, ficheDepuis: avant(30), abonnements: [], choix: {}, ...o,
});
const P: CriteresDuClassement = { ...CRITERES_PROPOSES };
const classe = (o: Partial<FicheDuClassement>, p: Partial<CriteresDuClassement> = {}, cats: CategorieDeLaMaison[] = []) => classeLaCliente(fiche(o), { ...P, ...p }, cats, T);

/* Le numéro */
vaut('un +33 est la France', 'France', regionDuNumero('+33 6 12 34 56 78').region);
vaut('le +1 514 est le Canada', 'Canada', regionDuNumero('+1 514 555 0101').region);
vaut('le +1 212 est les États-Unis', 'États-Unis', regionDuNumero('+1 212 555 0101').region);
vaut('le +228 est le Togo, en Afrique', ['Afrique', 'Togo'], [regionDuNumero('+228 90 12 34 56').region, regionDuNumero('+228 90 12 34 56').pays]);
vaut('un numéro sans indicatif est du Bénin', 'Bénin', regionDuNumero('97 12 34 56').region);
vaut('le 00229 est du Bénin', 'Bénin', regionDuNumero('0022997123456').region);
vaut('rien n est sans numéro', 'Sans numéro', regionDuNumero('').region);

/* La ville */
vaut('Fidjrossè est à Cotonou', 'cotonou', lieuDeLaVille('Fidjrossè'));
vaut('Abomey-Calavi est Calavi', 'calavi', lieuDeLaVille('Abomey-Calavi'));
vaut('Porto Novo est Porto-Novo', 'porto-novo', lieuDeLaVille('Porto Novo'));
vaut('Paris est la diaspora France', 'dia-france', lieuDeLaVille('Paris'));
vaut('Montréal est la diaspora Canada', 'dia-canada', lieuDeLaVille('Montréal'));
vaut('Lomé est la diaspora Afrique', 'dia-afrique', lieuDeLaVille('Lomé'));
vaut('l atelier ne dit rien', null, lieuDeLaVille('Atelier MND'));
vaut('une ville inconnue est non reconnue', 'non-reconnue', lieuDeLaVille('Xyzville'));

/* Auto-remplis ce que tu sais */
vaut('sans ville, un +33 se remplit France', 'France', villeADeduire({ city: '', phone: '+33612345678' }));
vaut('un numéro du Bénin ne dit pas la ville', null, villeADeduire({ city: '', phone: '97123456' }));
vaut('une ville écrite ne se remplace pas', null, villeADeduire({ city: 'Cotonou', phone: '+33612345678' }));
vaut('jamais deux fois', null, villeADeduire({ city: '', phone: '+33612345678', villeDeduiteLe: '2026-11-20' }));

/* Les critères abîmés ne cassent rien */
vaut('un critère d un autre type est ignoré', [60, 'disparue'], [criteresEnVigueur({ annulee_jours: 'x', de_passage: 'n importe' } as never).annulee_jours, criteresEnVigueur({ de_passage: 'n importe' } as never).de_passage]);

/* L'étape — CINQ CATÉGORIES (25 novembre 2026) : « Je veux garder la diaspora,
   la dormante, la régulière, l'annulée, la privilégiée […] supprime les autres
   et refaire le classement » (Yéman). */
vaut('sept catégories (la Fidèle et l Abonnée le soir même), et Sans catégorie', ['privilegiee', 'fidele', 'abonnee', 'reguliere', 'annulee', 'dormante', 'diaspora', 'hors'], ETAPES.map((e) => e.cle));
vaut('une formule active : l Abonnée', 'abonnee', classe({ visites: 4, derniere: avant(40), rythme: 28, abonnements: [{ statut: 'active', formule: 'Chaque Lune', fin: apres(200) }] }).etape);
vaut('une abonnée sans rendez-vous porte la marque', true, classe({ visites: 4, derniere: avant(40), rythme: 28, abonnements: [{ statut: 'active', formule: 'Chaque Lune', fin: apres(200) }] }).marques.includes('abonnee-sans-rdv'));
vaut('une formule échue n est plus active', 'ancienne-abonnee', classe({ visites: 4, derniere: avant(20), rythme: 28, abonnements: [{ statut: 'active', formule: 'Chaque Lune', fin: avant(3) }] }).marques.find((m) => m === 'ancienne-abonnee'));
vaut('une annulation récente sans date : l Annulée', 'annulee', classe({ visites: 2, derniere: avant(80), rythme: 40, annulations: [avant(10)] }).etape);
vaut('une annulation avec un rendez-vous à venir n est plus l Annulée', 'reguliere', classe({ visites: 2, derniere: avant(30), rythme: 40, annulations: [avant(10)], prochain: apres(5) }).etape);
vaut('une annulation de plus de 60 jours n est plus l Annulée', 'reguliere', classe({ visites: 2, derniere: avant(75), rythme: 40, annulations: [avant(65)] }).etape);
vaut('un rendez-vous resté confirmé compte comme absence', 'annulee', classe({ visites: 2, derniere: avant(80), rythme: 40, absences: [avant(10)] }).etape);
vaut('sauf si la case est décochée', 'reguliere', classe({ visites: 2, derniere: avant(70), rythme: 40, absences: [avant(10)] }, { annulee_absences: false }).etape);
vaut('jamais venue, même avec un rendez-vous ou une fiche ancienne : Sans catégorie', ['hors', 'hors', 'hors'], [classe({ prochain: apres(3) }).etape, classe({ ficheDepuis: avant(400) }).etape, classe({}).etape]);
vaut('une seule visite il y a 30 jours : Régulière', 'reguliere', classe({ visites: 1, premiere: avant(30), derniere: avant(30) }).etape);
vaut('une seule visite il y a 200 jours : Dormante', 'dormante', classe({ visites: 1, premiere: avant(200), derniere: avant(200) }).etape);
vaut('la Régulière, trois mois au plus (Yéman) : 89 jours Régulière, 90 jours Dormante', [90, 'reguliere', 'dormante'], [CRITERES_PROPOSES.dormante_jours, classe({ visites: 3, derniere: avant(89), rythme: 30 }).etape, classe({ visites: 3, derniere: avant(90), rythme: 30 }).etape]);
vaut('un rythme d une fois par an ne retient plus : 320 jours sans venir, Dormante', ['dormante', 'dormante'], [classe({ visites: 3, derniere: avant(320), rythme: 300 }).etape, classe({ visites: 1, premiere: avant(200), derniere: avant(200), choix: { rythme: 'une-par-an' } }).etape]);
/* La Fidèle (25 novembre 2026, le soir) : « celle qui va à son rythme, mais qui est toujours là, depuis plusieurs années ». */
vaut('la Fidèle : depuis un an, six visites, venue dans les six mois', ['fidele', 'fidele', 'fidele'], [
  classe({ visites: 9, premiere: avant(637), derniere: avant(103) }).etape, classe({ visites: 14, premiere: avant(657), derniere: avant(42) }).etape, classe({ visites: 6, premiere: avant(365), derniere: avant(179) }).etape]);
vaut('pas encore Fidèle : moins d un an, ou cinq visites', ['reguliere', 'dormante'], [classe({ visites: 8, premiere: avant(364), derniere: avant(40) }).etape, classe({ visites: 5, premiere: avant(600), derniere: avant(103) }).etape]);
vaut('une Fidèle partie depuis six mois devient Dormante', 'dormante', classe({ visites: 9, premiere: avant(637), derniere: avant(180) }).etape);
vaut('l Abonnée passe avant l Annulée et la Fidèle ; l Annulée avant la Fidèle', ['abonnee', 'annulee'], [
  classe({ visites: 9, premiere: avant(637), derniere: avant(80), annulations: [avant(10)], abonnements: [{ statut: 'active', formule: 'Chaque Lune', fin: apres(90) }] }).etape,
  classe({ visites: 9, premiere: avant(637), derniere: avant(80), annulations: [avant(10)] }).etape]);
vaut('une Fidèle de l étranger est la Diaspora', 'diaspora', classe({ regionNumero: 'France', visites: 9, premiere: avant(637), derniere: avant(40) }).etape);
vaut('STOP, locks défaits, fiche d essai : Sans catégorie', ['hors', 'hors', 'hors'], [
  classe({ visites: 3, derniere: avant(20), rythme: 30, accord: 'stop' }).etape, classe({ visites: 3, derniere: avant(20), rythme: 30, locksDefaits: true }).etape,
  classe({ visites: 3, derniere: avant(20), rythme: 30, essai: true }).etape]);
vaut('la Privilégiée ne se devine pas', [], [
  classe({ visites: 29, derniere: avant(6), rythme: 21 }), classe({ visites: 5, derniere: avant(70), rythme: 40 }), classe({ regionNumero: 'France', visites: 19, derniere: avant(40) }),
].map((r) => r.etape).filter((x) => x === 'privilegiee'));
vaut('la Privilégiée se choisit, et passe avant tout', ['privilegiee', 'privilegiee', 'privilegiee', 'privilegiee'], [
  classe({ visites: 3, derniere: avant(200), rythme: 30, choix: { etape: 'privilegiee' } }).etape, classe({ regionNumero: 'France', visites: 3, derniere: avant(20), choix: { etape: 'privilegiee' } }).etape,
  classe({ visites: 2, derniere: avant(80), annulations: [avant(10)], choix: { etape: 'privilegiee' } }).etape, classe({ visites: 3, derniere: avant(20), accord: 'stop', choix: { etape: 'privilegiee' } }).etape]);
vaut('un choix d une catégorie partie revient aux critères', ['dormante', 'reguliere'], [
  classe({ visites: 3, derniere: avant(200), rythme: 30, choix: { etape: 'couronne' } }).etape, classe({ visites: 3, derniere: avant(20), rythme: 30, choix: { etape: 'a-definir' } }).etape]);

/* Le lieu et la diaspora */
vaut('la ville de la fiche passe avant le numéro', 'cotonou', classe({ regionNumero: 'France', ville: 'Cotonou', lieuSaisi: 'cotonou' }).lieu);
vaut('le lieu choisi passe avant la ville', 'bohicon', classe({ ville: 'Cotonou', lieuSaisi: 'cotonou', choix: { lieu: 'bohicon' } }).lieu);
vaut('un +33 seul : la diaspora France', 'dia-france', classe({ regionNumero: 'France' }).lieu);
vaut('sans le numéro qui suffit, il est à préciser', 'benin-a-preciser', classe({ regionNumero: 'France' }, { numero_suffit: false }).lieu);
vaut('elle vit à l étranger : la Diaspora, venue récemment ou non', ['diaspora', 'diaspora'], [classe({ regionNumero: 'France', visites: 3, derniere: avant(200), rythme: 30 }).etape, classe({ regionNumero: 'France', visites: 3, derniere: avant(20), rythme: 30 }).etape]);
vaut('une annulation récente passe avant la Diaspora', 'annulee', classe({ regionNumero: 'France', visites: 2, derniere: avant(80), annulations: [avant(10)] }).etape);
vaut('jamais venue, de l étranger : Sans catégorie', 'hors', classe({ regionNumero: 'France' }).etape);
vaut('sauf si la case est décochée', 'dormante', classe({ regionNumero: 'France', visites: 3, derniere: avant(200), rythme: 30 }, { diaspora_remplace: false }).etape);

/* Les marques */
vaut('3 annulations sur 12 mois : annule souvent', true, classe({ visites: 4, derniere: avant(20), rythme: 30, annulations: [avant(300), avant(200), avant(100)] }).marques.includes('annule-souvent'));
vaut('2 annulations ne suffisent pas', false, classe({ visites: 4, derniere: avant(20), rythme: 30, annulations: [avant(200), avant(100)] }).marques.includes('annule-souvent'));

/* Les catégories de la Maison */
const horsCotonou: CategorieDeLaMaison = { id: 'loin', nom: 'Loin', regle: '', type: 'etape', criteres: [{ champ: 'lieu', op: '=', valeur: 'grp:hors' }], ordre: 1 };
const fidele: CategorieDeLaMaison = { id: 'fidele', nom: 'Fidèle', regle: '', type: 'marque', criteres: [{ champ: 'visites', op: '>=', valeur: 5 }], ordre: 2 };
vaut('une catégorie d étape de la Maison s applique', 'loin', classe({ ville: 'Bohicon', lieuSaisi: 'bohicon', visites: 3, derniere: avant(20), rythme: 30 }, {}, [horsCotonou]).etape);
vaut('une catégorie sans critère ne prend personne', 'reguliere', classe({ visites: 3, derniere: avant(20), rythme: 30 }, {}, [{ ...horsCotonou, criteres: [] }]).etape);
vaut('une marque de la Maison s ajoute', true, classe({ visites: 6, derniere: avant(20), rythme: 30 }, {}, [fidele]).marques.includes('fidele'));

/* Ce que le classement lit d'une fiche */
const f = ficheDuClassement(
  { id: 'c1', name: 'Essai', phone: '+33612345678', city: '', nouvelles: { oui: false, par: 'stop' }, since: avant(500) },
  [
    { clientId: 'c1', date: avant(100), status: 'honoré' }, { clientId: 'c1', date: avant(100), status: 'honoré' },
    { clientId: 'c1', date: avant(60), status: 'honoré' }, { clientId: 'c1', date: avant(20), status: 'honoré' },
    { clientId: 'c1', date: avant(5), status: 'confirmé' }, { clientId: 'c1', date: apres(10), status: 'confirmé' },
    { clientId: 'c1', date: avant(50), status: 'annulé' }, { clientId: 'autre', date: avant(1), status: 'honoré' },
  ],
  [], () => 'formule', T,
);
vaut('les visites sont des jours distincts', 3, f.visites);
vaut('le rythme est l écart médian', 40, f.rythme);
vaut('un rendez-vous passé resté confirmé est une absence', [avant(5)], f.absences);
vaut('le prochain rendez-vous', apres(10), f.prochain);
vaut('un STOP se lit STOP', 'stop', f.accord);
vaut('un oui se lit oui', 'oui', ficheDuClassement({ id: 'c2', name: 'E', nouvelles: { oui: true, par: 'comptoir' } }, [], [], () => '', T).accord);
vaut('un non se lit non', 'non', ficheDuClassement({ id: 'c3', name: 'E', nouvelles: { oui: false, par: 'whatsapp' } }, [], [], () => '', T).accord);

/* Les portes de l'écran */
const INDEX = lis('src/apps/trone/routes/index.tsx');
vaut('le classement est un onglet des Clientes', true, INDEX.includes("{ path: '/customers', label: 'Les clientes' }, { path: '/classement', label: 'Le classement' }"));
vaut('le classement a sa route', true, INDEX.includes("path: '/classement', label: 'Le classement'") && INDEX.includes("import('./clients/Classement')"));
const CL = lis('src/apps/trone/routes/clients/Classement.tsx');
vaut('l écran remplit la ville et la date de la déduction', true, CL.includes('villeADeduire(c)') && CL.includes('villeDeduiteLe: aujourdhui'));
const CU = lis('src/apps/trone/routes/clients/Customers.tsx');
vaut('les deux champs Ville proposent la liste', 2, (CU.match(/list=\{ID_DES_VILLES\}/g) ?? []).length);

/* QUI Y ENTRE (25 novembre 2026) : « Quand je prends la Curieuse, c'est quoi
   la Curieuse ? » Chaque catégorie de la colonne dit sa définition, avec les
   chiffres en vigueur, et « Modifier la définition » vise sa carte. Depuis le
   même soir, il n'y a plus que cinq catégories. */
{
  const P = CRITERES_PROPOSES;
  const def = (v: string, p: CriteresDuClassement = P) => definitionDeLaVue(v, p, []) ?? '';
  vaut('chaque catégorie de la colonne a sa définition', [], ETAPES.map((x) => `e:${x.cle}`).filter((v) => !definitionDeLaVue(v, P, [])));
  vaut('ce qui n est plus une catégorie n a pas de définition', [null, null, null, null], ['tout', 'g:diaspora', 'r:annuelle', 'e:curieuse'].map((v) => definitionDeLaVue(v, P, [])));
  const regle: CriteresDuClassement = { ...P, annulee_jours: 30, dormante_jours: 200, annuelle_rythme: 160, annuelle_marge: 40 };
  vaut('la Régulière et la Dormante disent le même seuil, de part et d autre', [true, true], [def('e:reguliere', regle).includes('date de moins de 200 jours'), def('e:dormante', regle).includes('date de 200 jours ou plus')]);
  vaut('l Annulée dit ses jours, la Fidèle ses trois chiffres', [true, true], [
    def('e:annulee', regle).includes('il y a 30 jours au plus'),
    def('e:fidele', { ...regle, fidele_depuis_jours: 400, fidele_visites: 7, fidele_absence_jours: 150 }).includes('cliente depuis 400 jours ou plus (sa première visite), au moins 7 visites, et venue il y a moins de 150 jours')]);
  vaut('l Abonnée dit sa formule', true, def('e:abonnee').startsWith('Une formule active'));
  vaut('la Privilégiée dit les mots de la Maison, et qu elle se choisit', [true, true], [def('e:privilegiee').startsWith('Elle ne négocie pas les prix'), def('e:privilegiee').includes('la Maison l’y range depuis son dossier')]);
  vaut('Sans catégorie dit qu elle n en est pas une', true, def('e:hors').startsWith('Ce n’est pas une catégorie'));
  vaut('la Diaspora dit si le numéro suffit', [true, true], [def('e:diaspora').includes('ou un numéro étranger'), def('e:diaspora', { ...P, numero_suffit: false }).includes('ne suffit pas')]);
  /* La définition dit ce que fait la règle. */
  const venue = (j: number) => classeLaCliente(fiche({ visites: 3, derniere: avant(j), rythme: 30 }), regle, [], T).etape;
  vaut('la règle tient la phrase : venue il y a 199 jours Régulière, 200 Dormante', ['reguliere', 'dormante'], [venue(199), venue(200)]);
  const annulee = (j: number) => classeLaCliente(fiche({ visites: 2, derniere: avant(80), annulations: [avant(j)] }), regle, [], T).etape;
  vaut('la règle tient la phrase : annulé il y a 30 jours Annulée, 31 jours Régulière', ['annulee', 'reguliere'], [annulee(30), annulee(31)]);
  const sans: CategorieDeLaMaison = { id: 'retour', nom: 'Retour en Afro', regle: '', type: 'etape', criteres: [], ordre: 1 };
  const avec: CategorieDeLaMaison = { id: 'fideles', nom: 'Les fidèles', regle: 'Les plus anciennes.', type: 'marque', criteres: [{ champ: 'visites', op: '>=', valeur: 10 }, { champ: 'lieu', op: '=', valeur: 'grp:diaspora' }], ordre: 2 };
  vaut('une catégorie de la Maison sans critère le dit', true, definitionDeLaVue('e:retour', P, [sans])!.includes('après « Sans catégorie », sans critère : on y range une fiche à la main'));
  vaut('une catégorie de la Maison dit sa phrase et ses critères', 'Les plus anciennes. Une marque de la Maison. Elle y entre si tous ses critères tiennent : Nombre de visites : au moins 10 ; Lieu : est Groupe : La diaspora.', definitionDeLaVue('m:fideles', P, [avec]));
  vaut('« Modifier » vise la carte de chaque catégorie', ['def-e:reguliere', 'def-e:privilegiee', 'def-e:hors', 'def-cat:retour', null, null], [
    carteDeLaVue('e:reguliere', []), carteDeLaVue('e:privilegiee', []), carteDeLaVue('e:hors', []), carteDeLaVue('e:retour', [sans]), carteDeLaVue('g:diaspora', []), carteDeLaVue('tout', [])]);
  vaut('chaque catégorie a sa carte dans « Les critères », dans l ordre des règles', [true, true], [
    CL.includes("const REGLES = ['privilegiee', 'hors', 'abonnee', 'annulee', 'diaspora', 'fidele', 'reguliere', 'dormante'];"),
    CL.includes('{REGLES.map((cle, i) => carte(nomDans(ETAPES, cle), i + 1, phrases[cle], parEtape(cle), `def-e:${cle}`))}')]);
  vaut('« Les critères » dit la même limite que la définition', [true, true], [
    CL.includes("sa dernière visite date de moins de {n('dormante_jours', 30, 720)} jours."), CL.includes('sa dernière visite date de {p.dormante_jours} jours ou plus')]);
  const fid = classeLaCliente(fiche({ visites: 6, premiere: avant(400), derniere: avant(100) }), regle, [], T).etape;
  vaut('la règle tient la phrase de la Fidèle', 'fidele', fid);
  vaut('chaque catégorie a sa phrase dans « Les critères »', [], ETAPES.map((e) => e.cle).filter((cle) => !CL.includes(`\n    ${cle}: <`)));
  vaut('les cartes portent leur adresse, et celles de la Maison aussi', [true, true], [CL.includes('key={key} id={key}>'), CL.includes('id={`def-cat:${cat.id}`}')]);
  vaut('la liste dit qui y entre, et offre de modifier', [true, true, true, true], [
    CL.includes('const definition = definitionDeLaVue(vue, o.p, o.categories);'), CL.includes('{definition ? (\n          <div className="trc-cl-definition">'),
    CL.includes('<span className="trc-cl-definition__mot">Qui y entre</span>{definition}'),
    CL.includes('onClick={() => o.modifieLaDefinition(vue)}>Modifier la définition</Button>')]);
  vaut('la colonne ne montre plus ni lieu, ni rythme, ni marques', [false, false, false, true], [
    CL.includes('<div className="trc-cl-axe">Le lieu</div>'), CL.includes('<div className="trc-cl-axe">Le rythme</div>'), CL.includes('<div className="trc-cl-axe">Les marques</div>'),
    CL.includes('<div className="trc-cl-axe">Les catégories</div>')]);
  vaut('Sans catégorie ferme la colonne, après les catégories de la Maison', true,
    CL.includes("...ETAPES.filter((e) => e.cle !== 'hors'), ...categories.filter((c) => c.type === 'etape').map((c) => ({ cle: c.id, nom: c.nom })), ...ETAPES.filter((e) => e.cle === 'hors'),"));
  vaut('un document neuf n a aucune catégorie de la Maison', [0, 0], [CATEGORIES_DE_DEPART.length, categoriesLues(undefined).length]);
  vaut('l Annulée se lit par sa dernière annulation, absence comprise', true, CL.includes('const derniereAnnulation = (f: FicheDuClassement): string => [...f.annulations, ...f.absences].sort().pop() ?? \'\';'));
}

console.log(echecs ? `\n${echecs} épreuve(s) en échec.` : '\nLe classement tient.');
process.exit(echecs ? 1 : 0);
