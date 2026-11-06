/* LE CALENDRIER DU SITE, EPROUVE — 6 novembre 2026 (maquette
   maquette-calendrier-du-site.html, validee par Yeman : « construis »).
   `node scripts/verifie-le-calendrier-du-site.mjs` (et `--prouve`).

   Vingt et un jours en bande, derriere « Un autre jour », deviennent le mois
   en grille, comme Ma Couronne : ce mois et les trois suivants. Ce harnais dit :
     A. LA BORNE : le dernier jour du troisieme mois qui suit, compte a Cotonou
        (6 nov. -> 28 fevr., 31 janv. -> 30 avr., 1er dec. -> 31 mars, une
        annee bissextile, 23 h 30 UTC deja le lendemain), et l'horizon du site
        qui la suit, de demain a elle, jour par jour ;
     B. LE JUGE : le jour meme refuse, la borne acceptee, son lendemain refuse,
        dans l'original ET dans chaque copie Edge (demande-submit,
        whatsapp-automate), chaque copie executee ;
     C. LES ETATS D'UN JOUR : libre, offre (la remise du jour, la vraie regle),
        peu de places, complet, ferme (dimanche, lundi, journee fermee des
        Parametres), hors de l'horizon ; et leurs mots pour un lecteur d'ecran ;
     D. LA GRILLE : lundi d'abord, le decalage du 1er, 28 a 31 jours ; les
        fleches grisees aux bornes ; le mois montre d'abord ; le glisse ;
     E. LA MEME BORNE PARTOUT : main.ts et l'ilot lisent `horizonDuSite`, plus
        de « Un autre jour » ni de JOURS_PROPOSES, la grille visible tout de
        suite sous les six places, ses heures juste dessous, la borne dite ;
        la feuille du site (indigo pale, cuivre, focus, mouvement reduit) ; ce
        que la session e6 a pose (le bandeau de la fermeture) reste ;
     F. LA MIGRATION 0168 : la borne neuve a Porto-Novo, plus de 90 jours, et
        le reste identique a 0152 (lui-meme identique a la base, relue le
        6 novembre 2026) ; les versions des deux fonctions a deployer.
   Sortie en ASCII (la console Windows est en cp1252). */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as place from '../src/shared/place-du-serveur';
import { horizonDuSite, jourFermeALaMaison } from '../src/apps/revelateur/agenda';
import {
  dateDite, etatDuJour, flechesDuMois, grilleDuMois, LETTRES_DE_LA_SEMAINE, libelleDuJour, moisAMontrer, moisApres,
  moisDeLHorizon, PEU_DE_PLACES, sensDuGlisse, titreDuMois,
} from '../src/apps/revelateur/calendrier-du-site-pur';
import { offreDuJourDuSite } from '../src/apps/revelateur/places-du-site-pur';

const ascii = (s: string): string => s.replace(/[«»]/g, '"').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
let ko = 0;
let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown): void => {
  n += 1;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${ascii(nom)}${ok ? '' : ` -> ${ascii(JSON.stringify(obtenu))}`}`);
  if (!ok) console.log(`       attendu ${ascii(JSON.stringify(attendu))}`);
};
const lis = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ══ A. LA BORNE ═══════════════════════════════════════════════════════ */
const ms = (iso: string): number => Date.parse(iso);
const SIX_NOV = ms('2026-11-06T10:00:00Z');
dit('A1 la borne : 6 nov. 2026 -> 28 fevr. 2027', '2027-02-28', place.finDeLaReservation('2026-11-06'));
dit('A2 ... 31 janv. -> 30 avr., 1er dec. -> 31 mars, 30 nov. -> 28 fevr.', ['2027-04-30', '2027-03-31', '2027-02-28'],
  ['2027-01-31', '2026-12-01', '2026-11-30'].map((j) => place.finDeLaReservation(j)));
dit('A3 ... une annee bissextile : 15 nov. 2027 -> 29 fevr. 2028, 31 janv. 2028 -> 30 avr. 2028, 1er dec. 2027 -> 31 mars 2028',
  ['2028-02-29', '2028-04-30', '2028-03-31'], ['2027-11-15', '2028-01-31', '2027-12-01'].map((j) => place.finDeLaReservation(j)));
dit('A4 ... une date illisible ne borne rien', ['', ''], ['', '06/11/2026'].map((j) => place.finDeLaReservation(j)));
const h6 = horizonDuSite(new Date(SIX_NOV));
dit('A5 l horizon du site le 6 nov. : de demain au 28 fevr., jour par jour (114 jours)', ['2026-11-07', '2027-02-28', 114, '2026-11-07', '2027-02-28'],
  [h6.du, h6.au, h6.jours.length, h6.jours[0], h6.jours.at(-1)]);
dit('A6 ... sans trou ni doublon', true, h6.jours.every((j, i) => i === 0 || place.joursDEcart(j, SIX_NOV) === place.joursDEcart(h6.jours[i - 1], SIX_NOV) + 1));
/* 23 h 30 UTC le 30 novembre : il est 0 h 30 le 1er decembre a Cotonou. */
const NUIT = ms('2026-11-30T23:30:00Z');
const VEILLE = ms('2026-11-30T22:30:00Z');
const hNuit = horizonDuSite(new Date(NUIT));
const hVeille = horizonDuSite(new Date(VEILLE));
dit('A7 Cotonou a 23 h 30 UTC le 30 nov. : deja le 1er dec., l horizon va du 2 dec. au 31 mars', ['2026-12-02', '2027-03-31'], [hNuit.du, hNuit.au]);
dit('A8 ... et a 22 h 30 UTC (23 h 30 a Cotonou), encore le 30 nov. : du 1er dec. au 28 fevr.', ['2026-12-01', '2027-02-28'], [hVeille.du, hVeille.au]);
dit('A9 l horizon du site suit la borne du serveur, mois apres mois', true,
  ['2026-01-15T09:00:00Z', '2026-02-28T12:00:00Z', '2026-06-30T23:30:00Z', '2027-12-31T22:59:00Z'].every((t) => {
    const h = horizonDuSite(new Date(t));
    return h.au === place.finDeLaReservation(place.jourDeCotonou(ms(t))) && place.joursDEcart(h.du, ms(t)) === 1
      && h.jours.length === place.joursDeLaFenetre(ms(t));
  }));
dit('A10 les jours d ici a la borne : 114 le 6 nov., 89 le 31 janv. 2027 (le moins), 92 le 30 juin, 122 le 1er juillet (le plus)', [114, 89, 92, 122],
  [place.joursDeLaFenetre(SIX_NOV), place.joursDeLaFenetre(ms('2027-01-31T10:00:00Z')), place.joursDeLaFenetre(ms('2027-06-30T10:00:00Z')),
    place.joursDeLaFenetre(ms('2027-07-01T10:00:00Z'))]);

/* ══ B. LE JUGE, DANS L'ORIGINAL ET DANS CHAQUE COPIE ══════════════════ */
type Juge = Pick<typeof place, 'finDeLaReservation' | 'joursDeLaFenetre' | 'laPlaceEstRecevable' | 'jourDeCotonou'>;
const casDuJuge = (j: Juge): unknown[] => [
  j.laPlaceEstRecevable({ date: '2026-11-06', time: '10:00' }, SIX_NOV),
  j.laPlaceEstRecevable({ date: '2026-11-07', time: '10:00' }, SIX_NOV),
  j.laPlaceEstRecevable({ date: '2027-02-28', time: '10:00' }, SIX_NOV),
  j.laPlaceEstRecevable({ date: '2027-03-01', time: '10:00' }, SIX_NOV),
  j.laPlaceEstRecevable({ date: '2026-12-01', time: '10:00' }, NUIT),
  j.laPlaceEstRecevable({ date: '2027-03-31', time: '10:00' }, NUIT),
  j.laPlaceEstRecevable({ date: '2027-04-01', time: '10:00' }, NUIT),
  j.finDeLaReservation('2027-11-15'),
];
const ATTENDU_DU_JUGE = ['creneau_hors_fenetre', null, null, 'creneau_hors_fenetre', 'creneau_hors_fenetre', null, 'creneau_hors_fenetre', '2028-02-29'];
dit('B1 l original : le jour meme refuse, demain et la borne acceptes, le lendemain de la borne refuse ; a 23 h 30 UTC, le jour de Cotonou',
  ATTENDU_DU_JUGE, casDuJuge(place));
const entre = (src: string, nom: string): string | null => {
  const ouvre = `/* ⟨${nom}⟩ */\n`;
  const i = src.indexOf(ouvre);
  const k = src.indexOf(`\n/* ⟨/${nom}⟩ */`, i);
  return i < 0 || k < 0 ? null : src.slice(i + ouvre.length, k);
};
const BLOCS = ['agenda-pur', 'catalogue-pur', 'qualification', 'place-du-serveur'];
const { transform } = await import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href) as typeof import('esbuild');
for (const f of ['supabase/functions/demande-submit/index.ts', 'supabase/functions/whatsapp-automate/index.ts']) {
  const src = lis(f);
  const blocs = BLOCS.map((b) => entre(src, b));
  if (blocs.some((b) => b === null)) { dit(`B2 ${f} : les quatre blocs sont la`, true, false); continue; }
  dit(`B2 ${f} : le bloc du juge est l original caractere pour caractere`, true, blocs[3]!.trimEnd() === entre(lis('src/shared/place-du-serveur.ts'), 'place-du-serveur'));
  const { code } = await transform(`${blocs.join('\n')}\nexport { finDeLaReservation, joursDeLaFenetre, laPlaceEstRecevable, jourDeCotonou };\n`, { loader: 'ts', format: 'esm' });
  const banc = mkdtempSync(path.join(os.tmpdir(), 'calendrier-du-site-'));
  let copie: Juge;
  try {
    writeFileSync(path.join(banc, 'copie.mjs'), code);
    copie = await import(pathToFileURL(path.join(banc, 'copie.mjs')).href) as Juge;
  } finally {
    rmSync(banc, { recursive: true, force: true });
  }
  dit(`B3 ${f} : la copie, executee, juge la fenetre comme l original`, ATTENDU_DU_JUGE, casDuJuge(copie));
}
{
  const wa = sansCommentaires(lis('supabase/functions/whatsapp-automate/index.ts'));
  dit('B4 whatsapp-automate : les places d un maitre s arretent a la meme borne', [true, false],
    [wa.includes('const n = Math.max(1, Math.min(joursDeLaFenetre(ms), Number.isFinite(voulu) && voulu > 0 ? voulu : 14));\n  const duree = Math.max(1, Math.round(Number(sauf.dureeMin) || 60));'),
      /FENETRE_DE_RESERVATION/.test(wa)]);
  /* Opale cherche ses places jusqu'a la meme borne : plus de « 90 au plus » (6 nov. 2026). */
  dit('B5 whatsapp-automate : Opale cherche ses places jusqu a la borne du site, plus jusqu a 90 jours', [true, false],
    [wa.includes('const horizonPour = (jour?: string): number => Math.min(joursDeLaFenetre(ms), Math.max(reglage.horizonJours, 30, jour ? joursJusqua(jour) + 7 : 0));'),
      /Math\.min\(90,/.test(wa)]);
}

/* ══ C. LES ETATS D'UN JOUR ════════════════════════════════════════════ */
const DU = '2026-11-07';
const AU = '2027-02-28';
const etat = (iso: string, ferme: boolean, heures: number) => etatDuJour({ iso, du: DU, au: AU, ferme, heures });
dit('C1 libre : des heures, un jour ouvert', { etat: 'libre', peu: false, heures: 4 }, etat('2026-11-10', false, 4));
dit('C2 peu de places : deux heures ou moins, un point cuivre', [PEU_DE_PLACES, true, true, false],
  [PEU_DE_PLACES, etat('2026-11-10', false, 2).peu, etat('2026-11-10', false, 1).peu, etat('2026-11-10', false, 3).peu]);
dit('C3 complet : un jour ouvert sans heure qui tienne le rituel', { etat: 'complet', peu: false, heures: 0 }, etat('2026-11-12', false, 0));
dit('C4 ferme : le jour ferme l emporte, meme avec des heures', { etat: 'ferme', peu: false, heures: 0 }, etat('2026-11-08', true, 5));
dit('C5 hors : le jour meme, la veille, et apres la borne', ['hors', 'hors', 'hors', 'libre'],
  [etat('2026-11-06', false, 5).etat, etat('2026-11-01', false, 5).etat, etat('2027-03-01', false, 5).etat, etat(AU, false, 5).etat]);
const SEMAINE = [
  { key: 'dim', open: '09h00', close: '19h00', closed: true },
  { key: 'lun', open: '09h00', close: '19h00', closed: true },
  ...['mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '09h00', close: '19h00', closed: false })),
];
const EXCEPTIONS = [{ date: '2026-12-24', closed: true }, { date: '2026-12-23', closed: true, staffId: 'p-1' }];
const agenda = { semaine: SEMAINE, exceptions: EXCEPTIONS };
dit('C6 ferme a la Maison : dimanche, lundi, la journee fermee des Parametres ; pas la journee d une seule personne ; un mardi ouvert',
  [true, true, true, false, false],
  ['2026-11-08', '2026-11-09', '2026-12-24', '2026-12-23', '2026-11-10'].map((j) => jourFermeALaMaison(agenda, j)));
/* L'offre : la vraie regle du site (offreDuJourDuSite), le mercredi de la Maison. */
const MERCREDI = {
  id: 'of-mercredi15', branchId: 'br', title: 'Le mercredi de la Maison', active: true,
  code: 'MERCREDI15', discountPct: 15, du: '2026-11-04', au: '2026-12-31', joursDeLaVenue: ['Mer'],
  days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], serviceIds: ['lavage'],
};
const offre = (iso: string) => offreDuJourDuSite([MERCREDI], {}, { branchId: 'br', dateIso: iso, serviceIds: ['lavage'], dejaUnCode: false });
dit('C7 offre : un mercredi porte la remise du jour, le jeudi non', ['of-mercredi15', 15, null], [offre('2026-11-11')?.id ?? null, offre('2026-11-11')?.discountPct ?? null, offre('2026-11-12')?.id ?? null]);
const libre = etat('2026-11-11', false, 2);
dit('C8 les mots d un jour libre : ses heures, peu de places, sa remise, ses places limitees',
  'mercredi 11 novembre 2026, 2 heures libres, peu de places, Le mercredi de la Maison, −15 %, il reste 3 places',
  libelleDuJour({ iso: '2026-11-11', du: DU, jour: libre, remise: { titre: 'Le mercredi de la Maison', pct: 15 }, places: 'il reste 3 places' }));
dit('C9 ... complet, ferme, le jour meme, la veille, une heure seule',
  ['jeudi 12 novembre 2026, complet', 'dimanche 8 novembre 2026, fermé', 'vendredi 6 novembre 2026, aujourd’hui : pas de réservation le jour même',
    'lundi 2 novembre 2026, passé', 'mardi 10 novembre 2026, 1 heure libre, peu de places'],
  [libelleDuJour({ iso: '2026-11-12', du: DU, jour: etat('2026-11-12', false, 0) }),
    libelleDuJour({ iso: '2026-11-08', du: DU, jour: etat('2026-11-08', true, 0) }),
    libelleDuJour({ iso: '2026-11-06', du: DU, jour: etat('2026-11-06', false, 0) }),
    libelleDuJour({ iso: '2026-11-02', du: DU, jour: etat('2026-11-02', false, 0) }),
    libelleDuJour({ iso: '2026-11-10', du: DU, jour: etat('2026-11-10', false, 1) })]);

/* ══ D. LA GRILLE, LES FLECHES, LE MOIS MONTRE, LE GLISSE ═════════════ */
const g = (m: string) => { const x = grilleDuMois(m); return [x.decalage, x.nbJours, x.cases.length, x.cases[x.decalage], x.cases.at(-1)]; };
dit('D1 l en-tete, lundi d abord', ['L', 'M', 'M', 'J', 'V', 'S', 'D'], [...LETTRES_DE_LA_SEMAINE]);
dit('D2 novembre 2026 commence un dimanche : six cases vides, trente jours', [6, 30, 36, '2026-11-01', '2026-11-30'], g('2026-11'));
dit('D3 fevrier 2027 commence un lundi : aucune case vide, vingt-huit jours', [0, 28, 28, '2027-02-01', '2027-02-28'], g('2027-02'));
dit('D4 fevrier 2028 (bissextile) commence un mardi : une case vide, vingt-neuf jours', [1, 29, 30, '2028-02-01', '2028-02-29'], g('2028-02'));
dit('D5 decembre 2026 (mardi, 31 jours) et janvier 2027 (vendredi, 31 jours)', [[1, 31], [4, 31]],
  ['2026-12', '2027-01'].map((m) => { const x = grilleDuMois(m); return [x.decalage, x.nbJours]; }));
dit('D6 les mois de l horizon du 6 nov. : novembre a fevrier ; le 30 nov. a minuit passe, decembre a mars',
  [['2026-11', '2026-12', '2027-01', '2027-02'], ['2026-12', '2027-01', '2027-02', '2027-03']],
  [moisDeLHorizon(h6.du, h6.au), moisDeLHorizon(hNuit.du, hNuit.au)]);
dit('D7 tourner les pages, par-dessus l an neuf', ['2027-01', '2026-12', '2027-02'], [moisApres('2026-12', 1), moisApres('2027-01', -1), moisApres('2026-11', 3)]);
dit('D8 les fleches : grisees aux bornes, vivantes entre', [
  { precedent: false, suivant: true }, { precedent: true, suivant: true }, { precedent: true, suivant: false },
], ['2026-11', '2026-12', '2027-02'].map((m) => flechesDuMois(m, '2026-11', '2027-02')));
const montre = (o: { vu?: string | null; jour?: string | null; premierePlace?: string | null }) => moisAMontrer({ ...o, premier: '2026-11', dernier: '2027-02' });
dit('D9 le mois montre : la premiere place, sinon le jour choisi ; celui qu elle a tourne l emporte ; toujours dans l horizon',
  ['2026-12', '2027-01', '2027-02', '2026-11', '2027-02', '2026-11'],
  [montre({ premierePlace: '2026-12-02' }), montre({ jour: '2027-01-15', premierePlace: '2026-12-02' }),
    montre({ vu: '2027-02', jour: '2027-01-15', premierePlace: '2026-12-02' }), montre({}), montre({ vu: '2027-06' }), montre({ vu: '2026-01' })]);
dit('D10 le doigt : a gauche le mois suivant, a droite le precedent ; un toucher ou un defilement ne tournent rien',
  [1, -1, 0, 0, 0], [sensDuGlisse(-80, 10), sensDuGlisse(80, 10), sensDuGlisse(30, 0), sensDuGlisse(-80, 70), sensDuGlisse(Number.NaN, 0)]);
dit('D11 le titre et la borne dite', ['Novembre 2026', 'Février 2027', '28 février 2027', '1er mars 2027'],
  [titreDuMois('2026-11'), titreDuMois('2027-02'), dateDite('2027-02-28'), dateDite('2027-03-01')]);

/* ══ E. LA MEME BORNE PARTOUT, ET L'ECRAN ═══════════════════════════════ */
const main = sansCommentaires(lis('src/apps/revelateur/main.ts'));
const agendaTs = sansCommentaires(lis('src/apps/revelateur/agenda.ts'));
const r = sansCommentaires(lis('src/apps/revelateur/ilots/Reserver.tsx'));
dit('E1 main.ts precharge sur horizonDuSite, et rien d autre', [true, true, true, false],
  [main.includes('const { du, au } = horizonDuSite();'), main.includes('prechargeLesOccupes(brancheDeLaPage, du, au)'),
    main.includes('calendrierDuSite(du, au, brancheDeLaPage)'), /prochainsJours|JOURS_DU_CALENDRIER|JOURS_DU_SITE/.test(main)]);
dit('E2 l ilot lit le meme horizon, pour charger, pour ses jours et pour relire apres un refus', [true, true, true, 2],
  [r.includes('const [horizon] = useState(() => horizonDuSite());'), r.includes('void calendrierDuSite(horizon.du, horizon.au, initiales?.branchId)'),
    r.includes('return horizon.jours\n      .map((iso) => ({ iso, heures: heuresLibres({ agenda, dateIso: iso, serviceIds, occupes, places: placesParJour }) }))'),
    (r.match(/const suite = \[horizon\.du, horizon\.au\];/g) ?? []).length]);
dit('E3 agenda.ts : l horizon tient la borne du serveur, compte a Cotonou ; plus de vingt et un jours', [true, true, true, false],
  [agendaTs.includes("import { ATELIERS_RESERVABLES, CONSULTATION_PAR_PARCOURS, finDeLaReservation, reservableSurLeSite } from '../../shared/place-du-serveur';"),
    agendaTs.includes('const aujourdhui = jourDeCotonou(maintenant.getTime());\n  const au = finDeLaReservation(aujourdhui);'),
    agendaTs.includes('ouvertureDuJour(iso, agenda.semaine, agenda.exceptions).closed'), /JOURS_DU_SITE|JOURS_DU_CALENDRIER/.test(agendaTs)]);
dit('E4 plus de « Un autre jour », ni de JOURS_PROPOSES, ni de bande de jours, ni de « trois prochaines semaines »', [false, false, false, false, false],
  [r.includes('Un autre jour'), r.includes('JOURS_PROPOSES'), /autreJour/.test(r), r.includes('className="jours"'), r.includes('trois prochaines semaines')]);
const iPlaces = r.indexOf('<div className="places">');
const iMois = r.indexOf('className="mois-du-site"');
const iHeures = r.indexOf('<div className="heures venir" id="heures-du-jour">');
dit('E5 les six places en haut, le mois tout de suite dessous, ses heures juste apres', [true, true, true, true],
  [iPlaces > 0, iMois > iPlaces, iHeures > iMois, r.includes('const places = useMemo(() => prochainesPlaces(jours, 6), [jours]);')]);
dit('E6 le mois montre d abord : la premiere place libre, ou le jour choisi', true,
  r.includes('const moisMontre = moisAMontrer({ vu: moisVu, jour, premierePlace: places[0]?.iso ?? null, premier: premierMois, dernier: dernierMois });'));
dit('E7 chaque jour : son etat, ferme ou complet sans toucher, son libelle, aria-pressed, la remise en cuivre', [true, true, true, true, true, true],
  [r.includes('const leJour = etatDuJour({ iso, du: horizon.du, au: horizon.au, ferme: jourFermeALaMaison(agenda, iso), heures: heuresParJour.get(iso) ?? 0 });'),
    r.includes('disabled={!libre}'), r.includes('aria-pressed={libre ? jour === iso : undefined}'), r.includes('aria-label={libelleDuJour({ iso, du: horizon.du, jour: leJour,'),
    r.includes('const duJour = libre ? remiseDuJourDe(iso) : null;'),
    r.includes("className={`mois-du-site__jour est-${leJour.etat}${duJour ? ' est-offre' : ''}${leJour.peu ? ' est-peu' : ''}${jour === iso ? ' est-choisi' : ''}`}")]);
dit('E8 les fleches grisees aux bornes, le doigt et le clavier tournent les mois', [true, true, true, true, true],
  [r.includes('aria-label="Mois précédent" disabled={!fleches.precedent}'), r.includes('aria-label="Mois suivant" disabled={!fleches.suivant}'),
    r.includes('const k = sensDuGlisse(t.clientX - d.x, t.clientY - d.y);\n                    if (k) tourneLeMois(k);'),
    r.includes("if (e.key === 'PageDown') { e.preventDefault(); tourneLeMois(1); }"), r.includes('if (!cible || cible < premierMois || cible > dernierMois) return;')]);
dit('E9 la legende, la borne dite sous la grille, les heures et « Ces heures tiennent compte de »', [true, true, true, true],
  [r.includes('<p className="mois-du-site__legende">'), r.includes('<p className="mois-du-site__horizon">Réservations ouvertes jusqu’au {dateDite(horizon.au)}.</p>'),
    r.includes('{heuresDuJour.map((h) => ('), r.includes('`Ces heures tiennent compte de ${dit(dureeTotale)} sur place.`')]);
dit('E10 rien ne change de ce qui tient : les places limitees dites, le repli WhatsApp, le chargeur, la Maison attribue la main', [true, true, true, true],
  [r.includes('{ditLesPlaces(placesDuChoix)} · {bandeauDesPlaces(offreDuJour)}'), r.includes('`Aucune heure libre d’ici au ${dateDite(horizon.au)}. Écrivez-nous, nous trouverons ensemble.`'),
    r.includes("? <Chargeur texte=\"Les places se chargent.\" />"), r.includes('serviceIds, date: jour, time: heure.heure, master: heure.maitre,')]);
{
  /* Les mots que voit la cliente, dans le bloc neuf et dans le module pur. */
  const debut = r.indexOf('className="mois-du-site"');
  const bloc = r.slice(debut, r.indexOf('{jour && (', debut));
  const pur = sansCommentaires(lis('src/apps/revelateur/calendrier-du-site-pur.ts'));
  const chaines = (s: string) => (s.match(/'[^'\n]*'|`[^`\n]*`|>[^<>{}\n]+</g) ?? []).join(' ');
  dit('E11 ni tiret long, ni « salon », ni « maitre/maitresse » dans ce que voit la cliente', [false, false, false],
    [/—/.test(chaines(bloc) + chaines(pur)), /salon/i.test(chaines(bloc) + chaines(pur)), /ma[iî]tre|ma[iî]tresse/i.test(chaines(bloc) + chaines(pur))]);
}
{
  const css = lis('src/apps/revelateur/revelateur.css');
  const i = css.indexOf('/* LE MOIS EN GRILLE');
  const bloc = i < 0 ? '' : css.slice(i, css.indexOf('.heures {', i));
  dit('E12 la feuille : libre en indigo pale, offre et point en cuivre, complet barre, ferme grise', [true, true, true, true, true],
    [bloc.includes('.mois-du-site__jour.est-libre { cursor: pointer; color: var(--titre); background: var(--indigo-pale); }'),
      bloc.includes('.mois-du-site__jour.est-offre { color: var(--accent-profond); background: var(--accent-clair); box-shadow: inset 0 0 0 1px var(--accent); }'),
      bloc.includes(".mois-du-site__jour.est-peu::before { content: ''; position: absolute; top: 5px; right: 5px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }"),
      bloc.includes('.mois-du-site__jour.est-complet b { text-decoration: line-through;'), bloc.includes('.mois-du-site__jour.est-ferme { background: var(--fond-2); }')]);
  dit('E13 ... le focus visible, le mouvement reduit, plus large sur ordinateur', [true, true, true],
    [bloc.includes('.mois-du-site__jour:focus-visible, .mois-du-site__fleche:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }'),
      /@media \(prefers-reduced-motion: reduce\) \{ \.mois-du-site__grille\.vient-de-droite, \.mois-du-site__grille\.vient-de-gauche \{ animation: none; \} \}/.test(bloc),
      /@media \(min-width: 720px\) \{[\s\S]*\.mois-du-site__jour, \.mois-du-site__vide \{ aspect-ratio: auto; height: 54px; \}/.test(bloc)]);
  dit('E14 ... aucune couleur ecrite en dur hors de l indigo de la Maison (ni vert, ni rouge, ni jaune)', [],
    (bloc.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\((?!30, 33, 80)[^)]*\)/g) ?? []));
  dit('E15 ce que la session e6 a pose reste : le bandeau de la fermeture en tete de la colonne, et ses regles', [true, true],
    [lis('scripts/genere-revelateur.mjs').includes('\'<div data-ilot="fermeture" data-genre="reserver"></div>\''), css.includes('.reserver .bandeau-fermeture { border-radius: 14px; margin-bottom: 18px; }')]);
}

/* ══ F. LA MIGRATION 0168, ET LES VERSIONS A DEPLOYER ══════════════════ */
{
  const m0168 = lis('supabase/migrations/0168_la_reservation_jusqu_a_trois_mois_pleins.sql');
  const m0152 = lis('supabase/migrations/0152_le_second_fauteuil_en_ligne.sql');
  const fonction = (s: string): string => {
    const i = s.indexOf('create or replace function public.pose_si_libre(');
    const fin = 'grant execute on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) to service_role;';
    const k = s.indexOf(fin, i);
    return i < 0 || k < 0 ? '' : s.slice(i, k + fin.length);
  };
  const neuve = fonction(m0168);
  const sansCom = (s: string) => s.replace(/--[^\n]*/g, '');
  dit('F1 0168 : la borne neuve, le dernier jour du troisieme mois qui suit, a Porto-Novo', [true, true],
    [neuve.includes("  borne      text := to_char(date_trunc('month', now() at time zone 'Africa/Porto-Novo') + interval '4 months' - interval '1 day', 'YYYY-MM-DD');"),
      neuve.includes('  if jour <= aujourdhui or jour > borne then\n    return jsonb_build_object(\'ok\', false, \'raison\', \'creneau_hors_fenetre\');')]);
  dit('F2 ... plus de quatre-vingt-dix jours, plus de dans90', [false, false], [/interval '90 days'/.test(sansCom(m0168)), /dans90/.test(sansCom(m0168))]);
  /* Le reste, mot pour mot : 0152 avec la seule borne changee doit rendre 0168. */
  const attendue = fonction(m0152)
    .replace("  dans90     text := to_char((now() at time zone 'Africa/Porto-Novo') + interval '90 days', 'YYYY-MM-DD');",
      "  borne      text := to_char(date_trunc('month', now() at time zone 'Africa/Porto-Novo') + interval '4 months' - interval '1 day', 'YYYY-MM-DD');")
    .replace('  -- Jamais le jour même, jamais au-delà de 90 jours, comptés à Cotonou.',
      '  -- Jamais le jour même, jamais après le dernier jour du troisième mois qui\n  -- suit (ce mois et les trois suivants), comptés à Cotonou.')
    .replace('  if jour <= aujourdhui or jour > dans90 then', '  if jour <= aujourdhui or jour > borne then');
  dit('F3 ... et tout le reste identique a 0152 (la definition en base), les droits compris', true, neuve.length > 5000 && neuve === attendue);
  const horsDeLaFonction = sansCom(m0168.replace(neuve, ''));
  dit('F4 ... rien d autre : une seule fonction, aucun declencheur, aucune ecriture hors du verrou', [1, false, false],
    [(sansCom(m0168).match(/create or replace function/g) ?? []).length, /create trigger|drop trigger|pas_avant_l_ouverture/.test(sansCom(m0168)),
      /\b(insert into|update public\.|delete from|alter |drop )/i.test(horsDeLaFonction)]);
  const ds = lis('supabase/functions/demande-submit/index.ts');
  const wa = lis('supabase/functions/whatsapp-automate/index.ts');
  dit('F5 les deux fonctions a deployer portent la version du 6 novembre 2026', [true, true],
    [/const VERSION = '2026-11-06-a · la réservation jusqu’au dernier jour du troisième mois qui suit/.test(ds),
      /const VERSION = '2026-11-06-b · la place jugee jusqu au dernier jour du troisieme mois qui suit/.test(wa)]);
}

console.log(ko === 0 ? `\nLe calendrier du site tient (${n} controles).` : `\n${ko} controle(s) en echec sur ${n}.`);
process.exitCode = ko === 0 ? 0 : 1;
