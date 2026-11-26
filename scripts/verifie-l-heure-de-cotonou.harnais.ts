/* L'HEURE DE COTONOU PARTOUT OÙ L'ON RÉSERVE, ÉPROUVÉE — 26 novembre 2026.
   `node scripts/verifie-l-heure-de-cotonou.mjs` ; `--prouve` remet chaque panne.

   « La diaspora, avant les fêtes » (audit du Trône, validé par Yéman) : Ma
   Couronne et le site lisaient l'heure du téléphone. Depuis l'Amérique, ou
   l'Europe en été, une cliente voyait des places déjà passées à Cotonou ;
   depuis l'Asie, des places encore libres lui étaient cachées.

   CE HARNAIS TOURNE CINQ FOIS, sous cinq fuseaux (le banc pose `TZ`) :
   Porto-Novo, Toronto, Shanghai, Paris, Los Angeles. L'horloge est FIGÉE
   (bannière du banc : `new Date()` et `Date.now()` rendent l'instant choisi)
   pour que chaque épreuve tombe au même instant à Cotonou :
     A. Ma Couronne : `todayIso`, `freeSlots`, `grilleDuJour` (aucune place
        passée offerte, aucune place à venir cachée), les mois du salon ;
     B. le site : l'horizon, les jours, les heures libres, « ouvert / fermé » ;
     C. « heures de Cotonou » : dit quand le téléphone vit ailleurs, tu sinon ;
     D. le câblage : chaque écran où une cliente choisit une place lit le
        salon, et le dit. Sortie en ASCII. */
import { readFileSync } from 'node:fs';
import { horlogeAilleurs, jourDuSalonPlus, momentDuSalon, moisDuSalon } from '../src/shared/calendrier';
import { creneauxLibres } from '../src/shared/agenda-pur';
import { settingsStore, exceptionsHorairesStore } from '../src/shared/settings';
import { freeSlots, grilleDuJour, todayIso } from '../src/apps/couronne/lib';
import { heuresLibres, horizonDuSite, prochainsJours, type AgendaDeLaMaison } from '../src/apps/revelateur/agenda';
import { etatDeLaMaison, semaineDite } from '../src/apps/revelateur/heures';

declare const __figeLHorloge: (ms: number) => void;

const FUSEAU = process.env.TZ ?? '(poste)';
const ascii = (s: string): string => s.replace(/[«»]/g, '"').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
let ko = 0;
let vus = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown): void => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  vus += 1;
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} [${FUSEAU}] ${ascii(nom)}${ok ? '' : ` -> ${ascii(JSON.stringify(obtenu))}`}`);
  if (!ok) console.log(`       attendu ${ascii(JSON.stringify(attendu))}`);
};
const lis = (rel: string): string => {
  const copie = process.env.HEURE_PANNE_FICHIER === rel ? process.env.HEURE_PANNE_COPIE : undefined;
  return readFileSync(copie ?? rel, 'utf8').replace(/\r\n/g, '\n');
};

/** Un instant à Cotonou (UTC+1 toute l'année). */
const cotonou = (a: number, mo: number, j: number, h: number, m = 0): number => Date.UTC(a, mo - 1, j, h - 1, m);
const avant = (h: string, min: number): boolean => { const [x, y] = h.split(':').map(Number); return x * 60 + y <= min; };

/* La Maison, ouverte tous les jours de 08h00 à 19h00 : les épreuves ne
   dépendent pas d'un jour de fermeture. */
const SEMAINE = (['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const).map((key) => ({ key, label: key, open: '08h00', close: '19h00', closed: false }));
settingsStore.set((prev) => ({ ...prev, hours: SEMAINE, maxRdvParJourMaison: 0, maxRdvParJourMaitre: 0 }));
exceptionsHorairesStore.set([]);
const FENETRE = { closed: false, openMin: 8 * 60, closeMin: 19 * 60 };
/** Ce que la grille de la Maison rend à cette minute du salon : la règle pure, sans horloge. */
const attendues = (min: number | null): string[] => creneauxLibres({ opening: FENETRE, durationMin: 60, occupes: [], master: '', maintenantMin: min });

/* ══ A. MA COURONNE ══════════════════════════════════════════════════ */
/* 15 h 10 à Cotonou, le samedi 12 décembre 2026 : Toronto lit 9 h 10, Shanghai 22 h 10. */
__figeLHorloge(cotonou(2026, 12, 12, 15, 10));
dit('A1 15 h 10 a Cotonou : aujourd hui est le 12 decembre, quel que soit le telephone', '2026-12-12', todayIso());
const a2 = freeSlots('2026-12-12', '', 60, [], [], 'br-essai', []);
dit('A2 aucune place deja commencee a Cotonou (rien avant 15 h 10)', [], a2.filter((h) => avant(h, 15 * 60 + 10)));
dit('A3 les places a venir du jour, toutes (16 h, 17 h, 18 h)', attendues(15 * 60 + 10), a2);
dit('A4 la grille du jour a la meme minute', attendues(15 * 60 + 10), grilleDuJour('2026-12-12', 60));
dit('A5 demain garde toutes ses heures', attendues(null), freeSlots('2026-12-13', '', 60, [], [], 'br-essai', []));

/* 0 h 30 à Cotonou le 13 : Toronto croit encore être le 12 à 18 h 30. */
__figeLHorloge(cotonou(2026, 12, 13, 0, 30));
dit('A6 minuit passe a Cotonou : aujourd hui est le 13', '2026-12-13', todayIso());
dit('A7 la veille n offre plus rien (Toronto la croit encore ouverte)', [], freeSlots('2026-12-12', '', 60, [], [], 'br-essai', []));
dit('A8 le 13 offre toute sa journee', attendues(30), freeSlots('2026-12-13', '', 60, [], [], 'br-essai', []));

/* 17 h 30 à Cotonou le 12 : Shanghai est déjà le 13 à 0 h 30. */
__figeLHorloge(cotonou(2026, 12, 12, 17, 30));
dit('A9 17 h 30 a Cotonou : toujours le 12 (Shanghai dit le 13)', '2026-12-12', todayIso());
dit('A10 la place de 18 h reste offerte (Shanghai la cachait)', attendues(17 * 60 + 30), freeSlots('2026-12-12', '', 60, [], [], 'br-essai', []));

/* Les mois du calendrier : le 31 décembre à 23 h 30 à Cotonou, Shanghai est en janvier. */
__figeLHorloge(cotonou(2026, 12, 31, 23, 30));
dit('A11 les quatre mois commencent en decembre, le mois du salon', [{ y: 2026, m: 11 }, { y: 2027, m: 0 }, { y: 2027, m: 1 }, { y: 2027, m: 2 }], moisDuSalon(4));
dit('A12 le jour d apres se compte au calendrier (fin d annee, passage a l heure d ete)', ['2027-01-01', '2026-03-29', '2026-10-25', '2026-12-30'],
  [jourDuSalonPlus('2026-12-31', 1), jourDuSalonPlus('2026-03-28', 1), jourDuSalonPlus('2026-10-24', 1), jourDuSalonPlus('2026-12-31', -1)]);

/* ══ B. LE SITE ══════════════════════════════════════════════════════ */
const AGENDA: AgendaDeLaMaison = {
  branchId: 'br-essai', maitres: ['Team'],
  services: [{ id: 's1', name: 'Lavage', categoryId: 'c1', durationMin: 60, master: 'Team' }],
  categories: [], semaine: SEMAINE, exceptions: [], murs: [], capMaison: 0, capMaitre: 0, sieges: 2,
  masques: {} as AgendaDeLaMaison['masques'], bandes: [], bandSets: {}, baremeSuspendu: false,
};
__figeLHorloge(cotonou(2026, 12, 12, 15, 10));
const h1 = heuresLibres({ agenda: AGENDA, dateIso: '2026-12-12', serviceIds: ['s1'], occupes: [] }).map((x) => x.heure);
dit('B1 le site : aucune heure deja commencee a Cotonou', [], h1.filter((h) => avant(h, 15 * 60 + 10)));
dit('B2 le site : les heures a venir du jour, toutes', attendues(15 * 60 + 10), h1);
dit('B3 l horizon du site commence aujourd hui a Cotonou', '2026-12-12', horizonDuSite().du);
dit('B4 les prochains jours partent de demain a Cotonou', '2026-12-13', prochainsJours(3)[0]);
__figeLHorloge(cotonou(2026, 12, 13, 0, 30));
dit('B5 minuit passe : l horizon commence le 13 (Toronto dit le 12)', '2026-12-13', horizonDuSite().du);
__figeLHorloge(cotonou(2026, 12, 12, 17, 30));
dit('B6 17 h 30 : l horizon garde le 12 (Shanghai dit le 13), la place de 18 h aussi', ['2026-12-12', true],
  [horizonDuSite().du, heuresLibres({ agenda: AGENDA, dateIso: '2026-12-12', serviceIds: ['s1'], occupes: [] }).some((x) => x.heure === '18:00')]);

/* « Ouvert jusqu'à 19h00 » : la page contact et la bulle lisent le salon. */
const HEURES_PAGE = SEMAINE.map((h) => (h.key === 'dim' ? { ...h, closed: true } : h));
__figeLHorloge(cotonou(2026, 12, 12, 15, 10));
dit('B7 15 h 10 a Cotonou, un samedi : ouvert jusqu a 19h00', { ouvert: true, texte: 'Ouvert jusqu’à 19h00' }, etatDeLaMaison(HEURES_PAGE, [], new Date()));
dit('B8 la ligne du jour est le samedi', 'sam', semaineDite(HEURES_PAGE, [], new Date()).find((j) => j.aujourdhui)?.clef);
__figeLHorloge(cotonou(2026, 12, 12, 19, 30));
dit('B9 19 h 30 le samedi : ferme, et le dimanche ferme aussi, il rouvre lundi', { ouvert: false, texte: 'Fermé, ouvre lundi à 08h00' }, etatDeLaMaison(HEURES_PAGE, [], new Date()));
__figeLHorloge(cotonou(2026, 12, 14, 7, 30));
dit('B10 7 h 30 le lundi a Cotonou : pas encore ouvert, ouvre a 08h00', { ouvert: false, texte: 'Fermé, ouvre à 08h00' }, etatDeLaMaison(HEURES_PAGE, [], new Date()));

/* ══ C. « HEURES DE COTONOU », DIT QUAND IL LE FAUT ═════════════════ */
const ICI = ['Africa/Porto-Novo', 'Africa/Lagos'].includes(FUSEAU);
const hiver = cotonou(2026, 12, 12, 15, 10);
const ete = cotonou(2026, 7, 15, 15, 10);
const attenduHiver = !ICI && FUSEAU !== 'Europe/Paris';
const attenduEte = !ICI;
dit('C1 en decembre : dit hors de Cotonou (Paris en hiver est a la meme heure)', attenduHiver, horlogeAilleurs(hiver));
dit('C2 en juillet : dit hors de Cotonou (Paris en ete a une heure de plus)', attenduEte, horlogeAilleurs(ete));
dit('C3 le moment du salon ne depend pas du fuseau', { jour: '2026-12-12', minutes: 910 }, momentDuSalon(hiver));

/* ══ D. LE CÂBLAGE ═══════════════════════════════════════════════════ */
const LIB = lis('src/apps/couronne/lib.ts');
dit('D1 Ma Couronne : aujourd hui est le jour du salon', true, LIB.includes('export const todayIso = () => momentDuSalon().jour;'));
dit('D2 Ma Couronne : les places du jour lisent la minute du salon (freeSlots, grilleDuJour), plus getHours', [2, false],
  [(LIB.match(/maintenantMin: dateIso === salon\.jour \? salon\.minutes : null/g) ?? []).length, /maintenantMin:[^\n]*getHours\(\)/.test(LIB)]);
dit('D3 Ma Couronne : un jour passe a Cotonou n a plus de place', true, LIB.includes('if (dateIso < salon.jour) return [];'));
const BK = lis('src/apps/couronne/Booking.tsx');
dit('D4 la reservation : les mois et les six places partent du salon, la phrase lue aussi', [true, true, true, false],
  [BK.includes('const months = useMemo(() => moisDuSalon(4), []);'), BK.includes('const iso = jourDuSalonPlus(d0, k);'),
    BK.includes('aujourdhui: salon.jour,\n      minutes: salon.minutes,'), /getHours\(\)/.test(BK)]);
dit('D5 la reservation dit « heures de Cotonou » sous les places et sous les heures', 2, (BK.match(/<HeuresDeCotonou \/>/g) ?? []).length);
const MRV = lis('src/apps/couronne/MesRendezVous.tsx');
dit('D6 deplacer dans Ma Couronne : les mois et « a venir » du salon, et la ligne dite', [true, true, false, true],
  [MRV.includes('moisDuSalon(4)'), MRV.includes('const salon = momentDuSalon();'), /getHours\(\)/.test(MRV), MRV.includes('<HeuresDeCotonou />')]);
dit('D7 le cycle et l accueil de Ma Couronne lisent le salon', [true, false, true],
  [lis('src/apps/couronne/Cycle.tsx').includes('return { du: todayIso(), au: isoOf(fin) };'), /getHours\(\)/.test(lis('src/apps/couronne/Tabs.tsx')), lis('src/apps/couronne/Tabs.tsx').includes('momentDuSalon().minutes')]);
const RES = lis('src/apps/revelateur/ilots/Reserver.tsx');
dit('D8 le site : la phrase lue est celle du salon, plus du telephone', [true, false],
  [RES.includes('aujourdhui: aCotonou.jour,\n      minutes: aCotonou.minutes,'), RES.includes('aujourdhui: isoDuJour(m)')]);
dit('D9 le site dit « Heures de Cotonou » sous les six places et sous les heures du jour', [true, true],
  [RES.includes("{aLEtranger() && <p className=\"legende\" style={{ marginTop: 8 }}>Heures de Cotonou.</p>}"), RES.includes("{aLEtranger() ? ' Heure de Cotonou.' : ''}")]);
dit('D10 deplacer sur le site, la consultation, Regler : la ligne dite quand le telephone vit ailleurs', [true, true, true],
  ['src/apps/revelateur/ilots/DeplacerLeRendezVous.tsx', 'src/apps/revelateur/ilots/PortesDeLaConsultation.tsx', 'src/apps/regler/App.tsx']
    .map((f) => lis(f).includes('horlogeAilleurs() &&') && lis(f).includes('Heures de Cotonou.')));
const HEU = lis('src/apps/revelateur/heures.ts');
dit('D11 la page contact : ouvert ou ferme se juge au salon (plus getHours ni getDay)', [false, false, true],
  [/getHours\(\)/.test(HEU), /getDay\(\)/.test(HEU), HEU.includes('momentDuSalon(d.getTime())')]);

console.log(ko === 0 ? `\n[${FUSEAU}] ${vus} epreuves, toutes tiennent.` : `\n[${FUSEAU}] ${ko} epreuve(s) en echec sur ${vus}.`);
if (ko) process.exitCode = 1;
