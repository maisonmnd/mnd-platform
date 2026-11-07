/* LA FENETRE DE GBEJI FIDELITE, EPROUVEE — 7 novembre 2026.
   `node scripts/verifie-fenetre-de-fidelite.mjs` (et `--prouve`).

   « Fidelite n'est disponible pour un client uniquement entre 4 et 6 semaines
   de sa derniere venue. Mais au-dela des 6 semaines ce service n'est plus
   disponible. » (Yeman.) Le pack `sv-forfait-gbeji-fidelite` porte
   `fenetreApresVenue: { deSemaines: 4, aSemaines: 6 }` (migration 0183).

   Ce harnais dit, dans les deux sens :
     A. LE JUGE PUR (catalogue-pur) : 27 jours non, 28 oui, 35 oui, 42 oui,
        43 non ; aucune venue non ; une venue posterieure au rendez-vous
        ignoree ; un rendez-vous a venir non honore ne compte pas ; la fenetre
        se juge a la date du RENDEZ-VOUS, pas a aujourd'hui ; sans champ,
        aucune regle ;
     B. LE CAS REEL (Marie-Gisele, MND-J5AK) : venue honoree le 7 nov. 2026,
        Fidelite le 5 dec. (28 jours) oui, le 4 dec. non ; venue le 5 dec.,
        Fidelite le 9 janv. 2027 (35 jours) oui ;
     C. LA CLIENTE : `estProposable` avec sa fenetre (Ma Couronne) ; le
        serveur (`laPlaceTient`, `placesLibres`) refuse hors fenetre ; le site
        public ne le propose pas ; WhatsApp non plus ;
     D. LE TRONE avertit, n'interdit pas ;
     E. LES COPIES Edge (catalogue-pur, place-du-serveur) sont l'original, et
        chaque porte (demande-submit, whatsapp-automate, Ma Couronne, Trone)
        appelle le juge a la lettre ;
     F. LA DONNEE : la migration 0183 ; l'anglais de Ma Couronne ; aucun
        tiret long dans les phrases dites.
   Sortie en ASCII. Les pannes (`--prouve`) se remettent dans les vrais
   fichiers, une a une, depuis le .mjs. */
import { readFileSync } from 'node:fs';
import {
  dansLaFenetreDeVenue, derniereVenueAvant, fenetreEncoreAtteignable, joursEntreDates, phraseDeLaFenetre,
  type FenetreApresVenue,
} from '../src/shared/catalogue-pur';
import { avertissementDeFenetre, estProposable } from '../src/shared/pricing';
import type { Service } from '../src/shared/catalog';
import { agendaDepuisLesLignes, laPlaceTient, placesLibres } from '../src/shared/place-du-serveur';
import { elagueLaPrestation } from '../src/apps/revelateur/agenda-assemble';
import { prestationsReservables, type AgendaDeLaMaison, type PrestationPublique } from '../src/apps/revelateur/agenda';

let ko = 0;
let vus = 0;
const ascii = (s: string): string => s.replace(/[«»]/g, '"').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
const dit = (nom: string, attendu: unknown, obtenu: unknown): void => {
  vus += 1;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${ascii(nom)}${ok ? '' : ` -> ${ascii(JSON.stringify(obtenu))}`}`);
  if (!ok) console.log(`       attendu ${ascii(JSON.stringify(attendu))}`);
};
const lit = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const FEN: FenetreApresVenue = { deSemaines: 4, aSemaines: 6 };
const plus = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const rdv = (clientId: string, date: string, status: string) => ({ clientId, date, status });

/* ══ A. LE JUGE PUR ═════════════════════════════════════════════════════ */
const D = '2026-12-08';
const verdictPour = (jours: number | null): boolean =>
  dansLaFenetreDeVenue(FEN, D, jours === null ? null : derniereVenueAvant([rdv('c', plus(D, -jours), 'honoré')], 'c', D));
dit('A1 venue il y a 27 jours : non', false, verdictPour(27));
dit('A2 venue il y a 28 jours : oui', true, verdictPour(28));
dit('A3 venue il y a 35 jours : oui', true, verdictPour(35));
dit('A4 venue il y a 42 jours : oui', true, verdictPour(42));
dit('A5 venue il y a 43 jours : non', false, verdictPour(43));
dit('A6 aucune venue : non', false, verdictPour(null));
dit('A7 la venue du jour meme ne compte pas (0 jour)', false, verdictPour(0));
dit('A8 un honore PLUS RECENT que le rendez-vous est ignore', true,
  dansLaFenetreDeVenue(FEN, D, derniereVenueAvant([rdv('c', plus(D, -30), 'honoré'), rdv('c', plus(D, 10), 'honoré')], 'c', D)));
dit('A9 seul un honore posterieur : aucune venue, non', false,
  dansLaFenetreDeVenue(FEN, D, derniereVenueAvant([rdv('c', plus(D, 10), 'honoré')], 'c', D)));
dit('A10 un rendez-vous a venir non honore ne compte pas comme venue', true,
  dansLaFenetreDeVenue(FEN, D, derniereVenueAvant([rdv('c', plus(D, -35), 'honoré'), rdv('c', plus(D, -10), 'confirmé')], 'c', D)));
dit('A11 un seul rendez-vous non honore : aucune venue, non', false,
  dansLaFenetreDeVenue(FEN, D, derniereVenueAvant([rdv('c', plus(D, -35), 'confirmé'), rdv('c', plus(D, -35), 'annulé')], 'c', D)));
dit('A12 la derniere venue est la plus recente avant D (pas la premiere)', plus(D, -30),
  derniereVenueAvant([rdv('c', plus(D, -90), 'honoré'), rdv('c', plus(D, -30), 'honoré'), rdv('c', plus(D, -60), 'honoré')], 'c', D));
dit('A13 la venue d une autre cliente ne compte pas', null, derniereVenueAvant([rdv('autre', plus(D, -35), 'honoré')], 'c', D));
dit('A14 la fenetre se juge a la date du RDV : venue aujourd hui (7 nov.), RDV dans 5 semaines (12 dec.) : oui', true,
  dansLaFenetreDeVenue(FEN, '2026-12-12', derniereVenueAvant([rdv('c', '2026-11-07', 'honoré')], 'c', '2026-12-12')));
dit('A15 meme venue, RDV demain (8 nov.) : non (pas encore)', false,
  dansLaFenetreDeVenue(FEN, '2026-11-08', derniereVenueAvant([rdv('c', '2026-11-07', 'honoré')], 'c', '2026-11-08')));
dit('A16 meme venue, RDV dans 8 semaines : non (plus du tout)', false,
  dansLaFenetreDeVenue(FEN, '2027-01-02', derniereVenueAvant([rdv('c', '2026-11-07', 'honoré')], 'c', '2027-01-02')));
dit('A17 sans champ, aucune regle (meme sans venue)', true, dansLaFenetreDeVenue(undefined, D, null));
dit('A18 les jours se comptent en jours calendaires, mois et annee compris', [28, 35, 365], [
  joursEntreDates('2026-11-07', '2026-12-05'), joursEntreDates('2026-12-05', '2027-01-09'), joursEntreDates('2026-01-01', '2027-01-01')]);
dit('A19 une fenetre mal ecrite ferme (jamais ouverte par erreur)', [false, false], [
  dansLaFenetreDeVenue({ deSemaines: 6, aSemaines: 4 }, D, plus(D, -35)), dansLaFenetreDeVenue({ deSemaines: Number.NaN, aSemaines: 6 }, D, plus(D, -35))]);
dit('A20 tant que la date n est pas choisie : encore a venir jusqu au 42e jour (7 nov. + 42 = 19 dec.)', [true, true, false, false], [
  fenetreEncoreAtteignable(FEN, '2026-11-08', '2026-11-07'), fenetreEncoreAtteignable(FEN, '2026-12-19', '2026-11-07'),
  fenetreEncoreAtteignable(FEN, '2026-12-20', '2026-11-07'), fenetreEncoreAtteignable(FEN, '2026-11-08', null)]);
dit('A21 la phrase dite a la cliente', 'Disponible entre 4 et 6 semaines apres votre derniere venue', ascii(phraseDeLaFenetre(FEN)));

/* ══ B. LE CAS REEL : MARIE-GISELE (MND-J5AK) ═══════════════════════════ */
const MG = 'MND-J5AK';
const A_NOV = [rdv(MG, '2026-11-07', 'honoré')];
const jugeLe = (rdvs: ReturnType<typeof rdv>[], jour: string): boolean => dansLaFenetreDeVenue(FEN, jour, derniereVenueAvant(rdvs, MG, jour));
dit('B1 venue honoree le 7 nov. : Fidelite le 5 dec. (28 jours) oui', true, jugeLe(A_NOV, '2026-12-05'));
dit('B2 venue honoree le 7 nov. : Fidelite le 4 dec. (27 jours) non', false, jugeLe(A_NOV, '2026-12-04'));
const A_DEC = [...A_NOV, rdv(MG, '2026-12-05', 'honoré')];
dit('B3 venue honoree le 5 dec. : Fidelite le 9 janv. 2027 (35 jours) oui', true, jugeLe(A_DEC, '2027-01-09'));
dit('B4 avec les deux venues, le 4 dec. se juge encore sur le 7 nov. (la venue du 5 dec. est posterieure)', false, jugeLe(A_DEC, '2026-12-04'));
dit('B5 le 9 janv. n est plus dans la fenetre de la venue du 7 nov. : c est celle du 5 dec. qui compte', 63, joursEntreDates('2026-11-07', '2027-01-09'));

/* ══ C. LA CLIENTE : estProposable, le serveur, le site ═════════════════ */
const fid = { id: 'sv-forfait-gbeji-fidelite', name: 'GBEJI Fidelite', categoryId: 'cat-venue', priceXof: 0, fenetreApresVenue: FEN } as unknown as Service;
const sansFenetre = { ...fid, id: 'sv-autre', fenetreApresVenue: undefined } as unknown as Service;
const pricing = {} as Parameters<typeof estProposable>[1];
const prop = (sv: Service, fen?: Parameters<typeof estProposable>[5]) => estProposable(sv, pricing, 5, false, 'inconnu', fen);
dit('C1 Ma Couronne : le pack se propose a 35 jours de la venue', true, prop(fid, { derniereVenue: plus(D, -35), dateRdv: D }));
dit('C2 Ma Couronne : pas a 27 jours', false, prop(fid, { derniereVenue: plus(D, -27), dateRdv: D }));
dit('C3 Ma Couronne : pas a 43 jours', false, prop(fid, { derniereVenue: plus(D, -43), dateRdv: D }));
dit('C4 Ma Couronne : jamais sans venue', false, prop(fid, { derniereVenue: null, dateRdv: D }));
dit('C5 Ma Couronne, date pas encore choisie : propose tant que la fenetre est a venir', [true, false], [
  prop(fid, { derniereVenue: '2026-11-07', aujourdhui: '2026-11-10' }), prop(fid, { derniereVenue: '2026-11-07', aujourdhui: '2027-01-10' })]);
dit('C6 un pack sans champ est toujours propose, venue ou pas', [true, true], [
  prop(sansFenetre, { derniereVenue: null, dateRdv: D }), prop(sansFenetre)]);

const LIGNES = (fenetre: boolean) => ({
  branche: { id: 'br', data: { masters: ['Team'], seats: 1 } },
  reglages: { hours: [
    { key: 'dim', open: '09h00', close: '19h00', closed: true },
    ...['lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '09h00', close: '19h00', closed: false })),
  ], maxRdvParJourMaison: 0, maxRdvParJourMaitre: '0' },
  exceptions: [],
  vitrine: {},
  services: [
    { id: 'sv-forfait-gbeji-fidelite', data: { name: 'GBEJI Fidelite', categoryId: 'cat-venue', durationMin: 170, ...(fenetre ? { fenetreApresVenue: { deSemaines: 4, aSemaines: 6 } } : {}) } },
    { id: 'sv-simple', data: { name: 'Lavage', categoryId: 'cat-venue', durationMin: 60 } },
  ],
  categories: [{ id: 'atl-ii-gbeji', data: {} }, { id: 'cat-venue', data: { parentId: 'atl-ii-gbeji' } }],
  blocages: [],
  occupes: [],
});
const MS = Date.parse('2026-11-07T10:00:00.000Z');
const AG = agendaDepuisLesLignes(LIGNES(true));
const AG0 = agendaDepuisLesLignes(LIGNES(false));
if (!AG || !AG0) throw new Error('agenda nul');
const serveur = (jours: number | null | undefined, ids = ['sv-forfait-gbeji-fidelite'], ag = AG): string => {
  const v = laPlaceTient(ag, { date: D, time: '10:00', serviceIds: ids,
    ...(jours === undefined ? {} : { derniereVenue: jours === null ? null : plus(D, -jours) }) }, MS);
  return v.ok ? 'ok' : v.erreur;
};
dit('C7 le serveur lit la fenetre dans la ligne du catalogue', FEN, AG.services.find((s) => s.id === 'sv-forfait-gbeji-fidelite')?.fenetreApresVenue);
dit('C8 le serveur refuse a 27 jours', 'prestation_hors_fenetre', serveur(27));
dit('C9 le serveur accepte a 28, 35 et 42 jours', ['ok', 'ok', 'ok'], [serveur(28), serveur(35), serveur(42)]);
dit('C10 le serveur refuse a 43 jours', 'prestation_hors_fenetre', serveur(43));
dit('C11 le serveur refuse sans aucune venue', 'prestation_hors_fenetre', serveur(null));
dit('C12 le serveur refuse quand la venue n a pas ete lue (appelant qui oublie)', 'prestation_hors_fenetre', serveur(undefined));
dit('C13 un geste sans fenetre passe toujours, avec ou sans venue', ['ok', 'ok'], [serveur(null, ['sv-simple']), serveur(undefined, ['sv-simple'])]);
dit('C14 le pack SANS le champ en base : aucune regle, comme avant', ['ok', 'ok'], [serveur(null, ['sv-forfait-gbeji-fidelite'], AG0), serveur(undefined, ['sv-forfait-gbeji-fidelite'], AG0)]);
dit('C15 pack et lavage ensemble : le pack juge toute la venue', 'prestation_hors_fenetre', serveur(27, ['sv-simple', 'sv-forfait-gbeji-fidelite']));
const lesJours = (venue: string | null | undefined): string[] =>
  [...new Set(placesLibres(AG, ['sv-forfait-gbeji-fidelite'], MS, 90, venue).map((p) => p.iso))];
const jours = lesJours('2026-11-07');
dit('C16 les places du pack ne tombent que dans la fenetre (5 au 19 dec. 2026, sans dimanche)',
  ['2026-12-05', '2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-12', '2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18', '2026-12-19'], jours);
dit('C17 sans venue, aucune place pour le pack', [], lesJours(null));
dit('C18 sans venue lue, aucune place pour le pack', [], lesJours(undefined));
dit('C19 un geste sans fenetre garde toutes ses places (hors dimanche)', true,
  new Set(placesLibres(AG, ['sv-simple'], MS, 14).map((p) => p.iso)).size === 12);

/* Le site public ne propose pas un pack a fenetre (il ne connait pas la visiteuse). */
const publique = (fenetre: boolean): AgendaDeLaMaison => ({
  branchId: 'br', maitres: ['Team'],
  services: [
    { id: 'sv-forfait-gbeji-fidelite', name: 'GBEJI Fidelite', categoryId: 'cat-venue', durationMin: 170, ...(fenetre ? { fenetreApresVenue: FEN } : {}) },
    { id: 'sv-simple', name: 'Lavage', categoryId: 'cat-venue', durationMin: 60 },
  ] as PrestationPublique[],
  categories: [{ id: 'atl-ii-gbeji', label: 'GBEJI' }, { id: 'cat-venue', label: 'Venue', parentId: 'atl-ii-gbeji' }],
  semaine: [], exceptions: [], murs: [], capMaison: 0, capMaitre: 0, sieges: 1, masques: {}, bandes: [], bandSets: {}, baremeSuspendu: false, formules: [],
} as unknown as AgendaDeLaMaison);
dit('C20 le site public ne propose pas le pack a fenetre', ['sv-simple'], prestationsReservables(publique(true), 'entretien').map((s) => s.id));
dit('C21 le site public propose le meme pack s il n a pas de fenetre (comme avant)', ['sv-forfait-gbeji-fidelite', 'sv-simple'], prestationsReservables(publique(false), 'entretien').map((s) => s.id));
dit('C22 la page du site garde le champ (elagage), pour pouvoir le cacher', FEN,
  elagueLaPrestation({ id: 'x', name: 'x', categoryId: 'c', fenetreApresVenue: FEN } as PrestationPublique).fenetreApresVenue);

/* ══ D. LE TRONE AVERTIT, N'INTERDIT PAS ════════════════════════════════ */
dit('D1 le Trone voit le pack hors fenetre (aucune fenetre passee a estProposable)', true, prop(fid));
const aver = avertissementDeFenetre(fid, D, plus(D, -50));
dit('D2 hors fenetre : un avertissement avec la derniere venue', 'GBEJI Fidelite : hors de la fenetre de 4 a 6 semaines, derniere venue le 19/10/2026.', ascii(aver ?? ''));
dit('D3 sans venue : l avertissement le dit', 'GBEJI Fidelite : hors de la fenetre de 4 a 6 semaines, aucune venue honoree avant ce rendez-vous.', ascii(avertissementDeFenetre(fid, D, null) ?? ''));
dit('D4 dans la fenetre : aucun avertissement', null, avertissementDeFenetre(fid, D, plus(D, -35)));
dit('D5 sans champ : aucun avertissement', null, avertissementDeFenetre(sansFenetre, D, null));

/* ══ E. LES COPIES ET LES PORTES, A LA LETTRE ═══════════════════════════ */
const entre = (src: string, nom: string): string => {
  const a = src.indexOf(`/* ⟨${nom}⟩ */`);
  const b = src.indexOf(`/* ⟨/${nom}⟩ */`);
  return a < 0 || b < a ? '' : src.slice(a, b);
};
const DS = lit('supabase/functions/demande-submit/index.ts');
const WA = lit('supabase/functions/whatsapp-automate/index.ts');
for (const nom of ['catalogue-pur', 'place-du-serveur']) {
  const original = entre(lit(`src/shared/${nom}.ts`), nom);
  dit(`E1 ${nom} : demande-submit porte l original, caractere pour caractere`, true, original.length > 0 && entre(DS, nom) === original);
  dit(`E2 ${nom} : whatsapp-automate porte l original, caractere pour caractere`, true, original.length > 0 && entre(WA, nom) === original);
}
dit('E3 demande-submit lit la derniere venue du numero avant de juger, et la donne au juge', true,
  /const lue = await derniereVenueDuNumero\(o\.telephone \?\? '', o\.date\);\s*if \(!lue\.ok\) return \{ erreur: 'agenda_illisible' \};\s*derniereVenue = lue\.jour;/.test(DS)
  && /laPlaceTient\(\{ \.\.\.agenda, sieges: places \}, \{ date: o\.date, time: o\.time, serviceIds: o\.serviceIds, derniereVenue \}, maintenant\)/.test(DS)
  && /laPlaceDemandee\(\{ branche: branche\.ligne, serviceIds, date, time, telephone \}\)/.test(DS));
dit('E4 demande-submit : le refus du juge part en 409 (la fenetre comprise)', true, /json\(\{ error: verdict\.erreur \}, verdict\.erreur === 'agenda_illisible' \? 503 : 409\)/.test(DS));
dit('E5 whatsapp-automate : la pose sous verrou lit la derniere venue de la fiche et la donne au juge', true,
  /\.eq\('data->>clientId', rdv\.clientId\)\.eq\('data->>status', 'honoré'\)/.test(WA)
  && /laPlaceTient\(neuf, \{ date: rdv\.date, time: rdv\.time, serviceIds: rdv\.serviceIds, derniereVenue \}, Date\.now\(\)\)/.test(WA));
dit('E6 whatsapp-automate : le dialogue ne propose pas un pack a fenetre', true,
  /reservable: reservableSurLeSite\(s, a\.categories, a\.masques\) && !s\.fenetreApresVenue,/.test(WA));
const BK = lit('src/apps/couronne/Booking.tsx');
dit('E7 Ma Couronne (reservation) : estProposable recoit la fenetre, jugee a la date de la venue choisie', true,
  /estProposable\(s, pricing, venuesTete, !!familleDeLaTete, verdictKids,\s*\{ derniereVenue: derniereVenueTete, dateRdv: jourDeLaVenue, aujourdhui: todayIso\(\) \}\)/.test(BK)
  && /derniereVenueAvant\(appts, cible\.id, jourDeLaVenue \?\? '9999-12-31'\)/.test(BK));
dit('E8 Ma Couronne (reservation) : le dernier mot avant d ecrire refuse hors fenetre, seance par seance', true,
  /sessionDates\.some\(\(sd\) => !dansLaFenetreDeVenue\(sv\.fenetreApresVenue, sd\.iso, derniereVenueAvant\(appts, cibleId, sd\.iso\)\)\)/.test(BK)
  && /if \(horsFenetre\?\.fenetreApresVenue\) \{\s*setPaying\(false\);\s*toast\(t\('Disponible entre \{de\} et \{a\} semaines après votre dernière venue'/.test(BK));
dit('E9 Ma Couronne (accueil, forfaits) : la fenetre est passee aux deux autres juges', true,
  /\{ derniereVenue, aujourdhui: todayIso\(\) \}\)\);/.test(lit('src/apps/couronne/Tabs.tsx'))
  && /\{ derniereVenue, aujourdhui: new Date\(\)\.toISOString\(\)\.slice\(0, 10\) \}\)\),/.test(lit('src/apps/couronne/Compose.tsx')));
const SH = lit('src/apps/trone/routes/clients/_shared.tsx');
dit('E10 le Trone (nouveau RDV, Changer la prestation) : estProposable SANS fenetre, et l avertissement affiche', true,
  /\.filter\(\(sv\) => estProposable\(sv, pricing, venuesTete, !!familleDuCompte, verdictKids\)\);/.test(SH)
  && /avertissementDeFenetre\(sv, date, derniereVenueAvant\(tousLesRdv, clientId, date\)\)/.test(SH)
  && /\{avertissementsDeFenetre\.map\(\(m\) => \(/.test(SH));
dit('E11 la Caisse du Trone ne passe aucune fenetre (la Maison peut toujours poser)', true,
  /estProposable\(sv, pricing, venuesTete\)\)/.test(lit('src/apps/trone/routes/vente/Caisse.tsx')));
dit('E12 Ma Couronne n importe jamais shared/attentions (seulement le pur, en type)', true,
  ['Booking', 'Tabs', 'Compose'].every((f) => !/from '\.\.\/\.\.\/shared\/attentions'/.test(lit(`src/apps/couronne/${f}.tsx`))));

/* ══ F. LA DONNEE, LES MOTS ═════════════════════════════════════════════ */
const MIG = lit('supabase/migrations/0183_fidelite_fenetre.sql');
dit('F1 la migration 0183 : une seule ligne, un seul champ, rejouable', true,
  /update public\.catalog_services\s+set data = data \|\| '\{"fenetreApresVenue": \{"deSemaines": 4, "aSemaines": 6\}\}'::jsonb\s+where id = 'sv-forfait-gbeji-fidelite';/.test(MIG)
  && (MIG.match(/^update /gm) ?? []).length === 1 && !/\bdelete\b|\bdrop\b|\btruncate\b/i.test(MIG.replace(/^--.*$/gm, '')));
const EN = lit('src/apps/couronne/i18n/en-booking.ts');
dit('F2 l anglais de la phrase est dans en-booking.ts', true,
  /'Disponible entre \{de\} et \{a\} semaines après votre dernière venue': 'Available between \{de\} and \{a\} weeks after your last visit'/.test(EN));
dit('F3 aucun tiret long dans ce qui est dit a la cliente ou a la Maison', true,
  ![phraseDeLaFenetre(FEN), aver ?? '', avertissementDeFenetre(fid, D, null) ?? '', EN.match(/'Disponible entre[^\n]*/)?.[0] ?? ''].some((s) => s.includes('—')));
const NG = lit('src/shared/nouvelle-grille-pur.ts');
dit('F4 la grille de janvier n archive plus le pack (meme identifiant que le nouveau Fidelite)', false,
  NG.includes("ARCHIVE('sv-forfait-gbeji-fidelite'"));
const CAT = lit('src/shared/catalog.ts');
dit('F5 le champ vit sur le type Service, a cote de desVenue', true,
  /desVenue\?: number;[\s\S]{0,1400}fenetreApresVenue\?: FenetreApresVenue;/.test(CAT));

console.log(`\n${ko === 0 ? 'Tout tient' : `${ko} controle(s) en echec`} sur ${vus}.`);
process.exitCode = ko === 0 ? 0 : 1;
