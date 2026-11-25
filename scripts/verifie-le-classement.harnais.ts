import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CRITERES_PROPOSES, ETAPES, GROUPES_DE_LIEU, LIEUX, MARQUES, RYTHMES, carteDeLaVue, classeLaCliente, criteresEnVigueur, definitionDeLaVue,
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

/* L'étape */
vaut('l abonnée passe avant l annulée', 'abonnee', classe({ visites: 4, derniere: avant(40), rythme: 28, annulations: [avant(5)], abonnements: [{ statut: 'active', formule: 'Chaque Lune', fin: apres(200) }] }).etape);
vaut('une abonnée sans rendez-vous porte la marque', true, classe({ visites: 4, derniere: avant(40), rythme: 28, abonnements: [{ statut: 'active', formule: 'Chaque Lune', fin: apres(200) }] }).marques.includes('abonnee-sans-rdv'));
vaut('une formule échue n est plus active', 'ancienne-abonnee', classe({ visites: 4, derniere: avant(20), rythme: 28, abonnements: [{ statut: 'active', formule: 'Chaque Lune', fin: avant(3) }] }).marques.find((m) => m === 'ancienne-abonnee'));
vaut('une annulation récente sans date : l Annulée', 'annulee', classe({ visites: 2, derniere: avant(80), rythme: 40, annulations: [avant(10)] }).etape);
vaut('une annulation avec un rendez-vous à venir n est plus l Annulée', 'couronne', classe({ visites: 2, derniere: avant(30), rythme: 40, annulations: [avant(10)], prochain: apres(5) }).etape);
vaut('un rendez-vous resté confirmé compte comme absence', 'annulee', classe({ visites: 2, derniere: avant(80), rythme: 40, absences: [avant(10)] }).etape);
vaut('sauf si la case est décochée', 'glisse', classe({ visites: 2, derniere: avant(80), rythme: 40, absences: [avant(10)] }, { annulee_absences: false }).etape);
vaut('aucune visite et un rendez-vous : la Réservée', 'reservee', classe({ prochain: apres(3) }).etape);
vaut('aucune visite, fiche récente : la Curieuse', 'curieuse', classe({ ficheDepuis: avant(100) }).etape);
vaut('aucune visite, fiche ancienne : le contact ancien', 'ancien-contact', classe({ ficheDepuis: avant(400) }).etape);
vaut('une visite il y a 30 jours : la Première', 'premiere', classe({ visites: 1, premiere: avant(30), derniere: avant(30) }).etape);
vaut('une visite il y a 90 jours : la Disparue', 'disparue', classe({ visites: 1, premiere: avant(90), derniere: avant(90) }).etape);
vaut('de passage laissée hors parcours si on le règle', 'hors', classe({ visites: 1, premiere: avant(90), derniere: avant(90), dePassage: true }, { de_passage: 'hors' }).etape);
vaut('dans son rythme : la Couronne', 'couronne', classe({ visites: 3, derniere: avant(35), rythme: 30 }).etape);
vaut('au-delà de son rythme : elle glisse', 'glisse', classe({ visites: 3, derniere: avant(60), rythme: 30 }).etape);
vaut('au-delà de 120 jours : la Dormante', 'dormante', classe({ visites: 3, derniere: avant(200), rythme: 30 }).etape);
vaut('un rythme annuel n est pas une dormante', 'annuelle', classe({ visites: 3, derniere: avant(320), rythme: 300 }).etape);
vaut('au-delà de son rythme annuel : la Dormante', 'dormante', classe({ visites: 3, derniere: avant(400), rythme: 300 }).etape);
vaut('« une fois par an » choisi, une visite il y a 200 jours : l Annuelle', 'annuelle', classe({ visites: 1, premiere: avant(200), derniere: avant(200), choix: { rythme: 'une-par-an' } }).etape);
vaut('STOP : hors parcours', 'hors', classe({ visites: 3, derniere: avant(20), rythme: 30, accord: 'stop' }).etape);
vaut('locks défaits : hors parcours', 'hors', classe({ visites: 3, derniere: avant(20), rythme: 30, locksDefaits: true }).etape);
vaut('le choix de la Maison passe avant les critères', 'premiere', classe({ visites: 3, derniere: avant(200), rythme: 30, choix: { etape: 'premiere' } }).etape);

/* Le lieu et la diaspora */
vaut('la ville de la fiche passe avant le numéro', 'cotonou', classe({ regionNumero: 'France', ville: 'Cotonou', lieuSaisi: 'cotonou' }).lieu);
vaut('le lieu choisi passe avant la ville', 'bohicon', classe({ ville: 'Cotonou', lieuSaisi: 'cotonou', choix: { lieu: 'bohicon' } }).lieu);
vaut('un +33 seul : la diaspora France', 'dia-france', classe({ regionNumero: 'France' }).lieu);
vaut('sans le numéro qui suffit, il est à préciser', 'benin-a-preciser', classe({ regionNumero: 'France' }, { numero_suffit: false }).lieu);
vaut('une dormante de la diaspora devient la Diaspora', 'diaspora', classe({ regionNumero: 'France', visites: 3, derniere: avant(200), rythme: 30 }).etape);
vaut('sauf si la case est décochée', 'dormante', classe({ regionNumero: 'France', visites: 3, derniere: avant(200), rythme: 30 }, { diaspora_remplace: false }).etape);

/* Les marques */
vaut('3 annulations sur 12 mois : annule souvent', true, classe({ visites: 4, derniere: avant(20), rythme: 30, annulations: [avant(300), avant(200), avant(100)] }).marques.includes('annule-souvent'));
vaut('2 annulations ne suffisent pas', false, classe({ visites: 4, derniere: avant(20), rythme: 30, annulations: [avant(200), avant(100)] }).marques.includes('annule-souvent'));

/* Les catégories de la Maison */
const horsCotonou: CategorieDeLaMaison = { id: 'loin', nom: 'Loin', regle: '', type: 'etape', criteres: [{ champ: 'lieu', op: '=', valeur: 'grp:hors' }], ordre: 1 };
const fidele: CategorieDeLaMaison = { id: 'fidele', nom: 'Fidèle', regle: '', type: 'marque', criteres: [{ champ: 'visites', op: '>=', valeur: 5 }], ordre: 2 };
vaut('une catégorie d étape de la Maison s applique', 'loin', classe({ ville: 'Bohicon', lieuSaisi: 'bohicon', visites: 3, derniere: avant(20), rythme: 30 }, {}, [horsCotonou]).etape);
vaut('une catégorie sans critère ne prend personne', 'couronne', classe({ visites: 3, derniere: avant(20), rythme: 30 }, {}, [{ ...horsCotonou, criteres: [] }]).etape);
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
   chiffres en vigueur, et « Modifier la définition » vise sa carte. */
{
  const P = CRITERES_PROPOSES;
  const toutes = [
    ...ETAPES.map((x) => `e:${x.cle}`), ...MARQUES.map((x) => `m:${x.cle}`), ...RYTHMES.map((x) => `r:${x.cle}`),
    ...GROUPES_DE_LIEU.map((x) => `g:${x.cle}`), ...LIEUX.map((x) => `l:${x.cle}`),
  ];
  vaut('chaque catégorie de la colonne a sa définition', [], toutes.filter((v) => !definitionDeLaVue(v, P, [])));
  vaut('les vues qui ne sont pas des catégories n en ont pas', [null, null, null], ['tout', 'annulations', 'modifiees'].map((v) => definitionDeLaVue(v, P, [])));
  const regle: CriteresDuClassement = { ...P, curieuse_jours: 90, premiere_jours: 45, annulee_jours: 30, dormante_jours: 200, marge: 14, rythme_maison: 42, reguliere_max: 35, annule_nb: 4, annule_mois: 6 };
  vaut('la Curieuse dit ses jours en vigueur', true, definitionDeLaVue('e:curieuse', regle, [])!.includes('il y a 90 jours au plus'));
  vaut('le contact ancien dit le même seuil, au-delà', true, definitionDeLaVue('e:ancien-contact', regle, [])!.includes('il y a plus de 90 jours'));
  vaut('la Première et la Disparue disent le même seuil de part et d autre', [true, true], [
    definitionDeLaVue('e:premiere', regle, [])!.includes('il y a 45 jours au plus'), definitionDeLaVue('e:disparue', regle, [])!.includes('il y a plus de 45 jours')]);
  vaut('l Annulée, Elle glisse, la Couronne, la Dormante disent leurs chiffres', [true, true, true, true], [
    definitionDeLaVue('e:annulee', regle, [])!.includes('30 jours au plus'), definitionDeLaVue('e:glisse', regle, [])!.includes('14 jours de marge') && definitionDeLaVue('e:glisse', regle, [])!.includes('200 jours au plus'),
    definitionDeLaVue('e:couronne', regle, [])!.includes('plus 14 jours') && definitionDeLaVue('e:couronne', regle, [])!.includes('à défaut, 42 jours'), definitionDeLaVue('e:dormante', regle, [])!.includes('Plus de 200 jours')]);
  vaut('le rythme et la marque disent les leurs', [true, true, true], [
    definitionDeLaVue('r:reguliere', regle, [])!.includes('tous les 35 jours'), definitionDeLaVue('r:espacee', regle, [])!.includes('Plus de 35 jours'),
    definitionDeLaVue('m:annule-souvent', regle, [])!.includes('Au moins 4 annulations sur 6 mois')]);
  /* La définition dit ce que fait la règle : une fiche de 89 jours est Curieuse, une de 91 est un contact ancien. */
  const curieuse = (j: number) => classeLaCliente(fiche({ ficheDepuis: avant(j) }), regle, [], T).etape;
  vaut('la règle tient la phrase : 89 jours Curieuse, 91 jours contact ancien', ['curieuse', 'ancien-contact'], [curieuse(89), curieuse(91)]);
  const uneVisite = (j: number) => classeLaCliente(fiche({ visites: 1, premiere: avant(j), derniere: avant(j) }), regle, [], T).etape;
  vaut('la règle tient la phrase : une visite à 44 jours Première, à 46 jours Disparue', ['premiere', 'disparue'], [uneVisite(44), uneVisite(46)]);
  vaut('« de passage » se dit là où la règle le range', [true, true], [
    definitionDeLaVue('e:disparue', { ...P, de_passage: 'disparue' }, [])!.includes('y sont aussi'), definitionDeLaVue('e:hors', { ...P, de_passage: 'hors' }, [])!.includes('le Trône l’a marquée « de passage »')]);
  const sans: CategorieDeLaMaison = { id: 'retour', nom: 'Retour en Afro', regle: '', type: 'etape', criteres: [], ordre: 1 };
  const avec: CategorieDeLaMaison = { id: 'fideles', nom: 'Les fidèles', regle: 'Les plus anciennes.', type: 'marque', criteres: [{ champ: 'visites', op: '>=', valeur: 10 }, { champ: 'lieu', op: '=', valeur: 'grp:diaspora' }], ordre: 2 };
  vaut('une catégorie de la Maison sans critère le dit', true, definitionDeLaVue('e:retour', P, [sans])!.includes('sans critère : on y range une fiche à la main'));
  vaut('une catégorie de la Maison dit sa phrase et ses critères', 'Les plus anciennes. Une marque de la Maison. Elle y entre si tous ses critères tiennent : Nombre de visites : au moins 10 ; Lieu : est Groupe : La diaspora.', definitionDeLaVue('m:fideles', P, [avec]));
  vaut('« Modifier » vise la carte de chaque catégorie', ['def-e:curieuse', 'def-m:annule-souvent', 'def-r:annuelle', 'def-g:diaspora', 'def-g:hors', 'def-cat:retour', null, null], [
    carteDeLaVue('e:curieuse', []), carteDeLaVue('m:annule-souvent', []), carteDeLaVue('r:annuelle', []), carteDeLaVue('g:diaspora', []), carteDeLaVue('l:calavi', []),
    carteDeLaVue('e:retour', [sans]), carteDeLaVue('g:inconnu', []), carteDeLaVue('tout', [])]);
  /* Chaque carte visée existe dans l'écran. */
  const visees = [...new Set(toutes.map((v) => carteDeLaVue(v, [])).filter((x): x is string => !!x))];
  const presente = (id: string) => (id.startsWith('def-e:') ? CL.includes('`def-e:${e.cle}`') : CL.includes(`'${id}')}`));
  vaut('chaque carte visée porte son adresse dans « Les critères »', [], visees.filter((id) => !presente(id)));
  vaut('les cartes portent leur adresse, et celles de la Maison aussi', [true, true], [CL.includes('key={key} id={key}>'), CL.includes('id={`def-cat:${cat.id}`}')]);
  vaut('la liste dit qui y entre, et offre de modifier', [true, true, true, true], [
    CL.includes('const definition = definitionDeLaVue(vue, o.p, o.categories);'), CL.includes('{definition ? (\n          <div className="trc-cl-definition">'),
    CL.includes('<span className="trc-cl-definition__mot">Qui y entre</span>{definition}'),
    CL.includes('onClick={() => o.modifieLaDefinition(vue)}>Modifier la définition</Button>')]);
}

console.log(echecs ? `\n${echecs} épreuve(s) en échec.` : '\nLe classement tient.');
process.exit(echecs ? 1 : 0);
