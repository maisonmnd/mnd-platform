import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CRITERES_PROPOSES, classeLaCliente, criteresEnVigueur, ficheDuClassement, lieuDeLaVille, regionDuNumero, villeADeduire,
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

console.log(echecs ? `\n${echecs} épreuve(s) en échec.` : '\nLe classement tient.');
process.exit(echecs ? 1 : 0);
