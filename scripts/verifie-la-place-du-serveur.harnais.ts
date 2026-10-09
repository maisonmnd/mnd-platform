/* LA PLACE, JUGEE PAR LE SERVEUR, EPROUVEE — 9 octobre 2026.
   `node scripts/verifie-la-place-du-serveur.mjs`

   Deux portes posent un rendez-vous sans qu'une main du Trone le voie : le
   site (`demande-submit`) et WhatsApp (`whatsapp-automate`). Elles jugent la
   place par `src/shared/place-du-serveur.ts`, recopie tel quel entre ses
   reperes. Ce harnais dit, dans les deux sens :

     A. LE JUGE : les fauteuils (un samedi plein refuse meme si « Expert » est
        libre), la porte de consultation (VEKPE, FINFIN, devis, « consultation
        avant » refuses, la consultation acceptee), le maitre LIBRE et non le
        premier, le jour de Cotonou (23 h 30 UTC est deja le lendemain), la
        duree d'un rendez-vous pose lue telle qu'elle est ecrite, J+91 refuse,
        les murs, les plafonds, les horaires ;
     B. LES PLACES : `placesLibres` rend, jour par jour, les heures que le
        site montre (`heuresLibres`), et `laPlaceTient` accepte exactement
        celles-la, avec le meme premier maitre ;
     C. LE SITE N'A PAS BOUGE : `prestationsReservables` (qui lit desormais
        `reservableSurLeSite`) rend ce que rendait l'ancien predicat, fige ici ;
     D. LES COPIES : chaque fonction Edge qui porte ⟨place-du-serveur⟩ porte
        aussi ses dependances, chaque bloc est l'original caractere pour
        caractere, et la copie, executee, passe les memes cas que l'original ;
     E. LA PORTE DU SITE ET LE VERROU, sur la lettre : `demande-submit` lit,
        juge, puis pose par `pose_si_libre` (plus aucune insertion directe) ;
        la migration 0125 pose le verrou, la duree figee, et ferme le verrou
        au public ;
     F. LES PANNES : chaque faute qu'on remet (fauteuils oublies, premier
        maitre, horloge UTC, J+91, consultation ouverte, duree recalculee,
        insertion directe, verrou retire...) doit faire crier le harnais. Elles
        s'injectent EN MEMOIRE (une copie mutee, chargee depuis un dossier
        temporaire) : aucun fichier du depot n'est reecrit.

   Sortie en ASCII (la console Windows est en cp1252). */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as depot from '../src/shared/place-du-serveur';
import type { AgendaDuServeur } from '../src/shared/place-du-serveur';
import {
  ATELIERS_RESERVABLES as ATELIERS_DU_SITE, CONSULTATION_PAR_PARCOURS as CONSULTATIONS_DU_SITE,
  heuresLibres, prestationsReservables, type AgendaDeLaMaison, type PrestationPublique,
} from '../src/apps/revelateur/agenda';
import type { CreneauOccupe } from '../src/shared/agenda-pur';
import { estUneConsultation, masquePourLeSite, priceModeOf, racineOf } from '../src/shared/catalogue-pur';
import { exigeConsultation, porteDuBesoin, type Besoin } from '../src/shared/qualification';

type Lib = Pick<typeof depot,
  'agendaDepuisLesLignes' | 'laPlaceTient' | 'placesLibres' | 'reservableSurLeSite' | 'jourDeCotonou'
  | 'joursDEcart' | 'isoApresJours' | 'laPlaceEstRecevable' | 'FENETRE_DE_RESERVATION'>;

const ascii = (s: string): string => s.replace(/[«»]/g, '"').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');

let ko = 0;
let vus = 0;
/** Un juge : `dit` compte et affiche ; en silence, il compte seulement. */
const juge = (silence: boolean) => {
  let ecarts = 0;
  const dit = (nom: string, attendu: unknown, obtenu: unknown): void => {
    const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
    if (!ok) ecarts += 1;
    if (silence) return;
    vus += 1;
    if (!ok) ko += 1;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} ${ascii(nom)}${ok ? '' : ` -> ${ascii(JSON.stringify(obtenu))}`}`);
    if (!ok) console.log(`       attendu ${ascii(JSON.stringify(attendu))}`);
  };
  return { dit, ecarts: () => ecarts };
};

/* ══ LE DECOR ══════════════════════════════════════════════════════════
   Une Maison ouverte du lundi au samedi, 9 h - 19 h, deux libelles de
   maitres (« Team », « Expert »), deux fauteuils. Mercredi 14 octobre 2026,
   11 h a Cotonou. */
const MS = Date.parse('2026-10-14T10:00:00.000Z');
const SEMAINE = [
  { key: 'dim', open: '09h00', close: '19h00', closed: true },
  ...['lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '09h00', close: '19h00', closed: false })),
];
const JEU = '2026-10-15';
const VEN = '2026-10-16';
const SAM = '2026-10-17';
const DIM = '2026-10-18';
const MAR = '2026-10-20';
const MER2 = '2026-10-21';
const JEU2 = '2026-10-22';
const VEN2 = '2026-10-23';

const CATEGORIES = [
  { id: 'atl-ii-gbeji', data: { label: 'GBEJI' } },
  { id: 'c-lav', data: { label: 'Les lavages', parentId: 'atl-ii-gbeji' } },
  { id: 'atl-iii-yekpe', data: { label: 'Coloration' } },
  { id: 'atl-i-vekpe', data: { label: 'VEKPE' } },
  { id: 'atl-iv-finfin', data: { label: 'FINFIN' } },
  { id: 'c-fin', data: { label: 'Restaurer', parentId: 'atl-iv-finfin' } },
  { id: 'koko', data: { label: 'KOKO' } },
  { id: 'atl-formation', data: { label: 'Formations' } },
];
type LigneService = { id: string; data: Record<string, unknown> };
const SERVICES: LigneService[] = [
  { id: 'lav-1', data: { name: 'Lavage', categoryId: 'c-lav', durationMin: 60, priceXof: 10000 } },
  { id: 'rep-1', data: { name: 'Reprise', categoryId: 'atl-ii-gbeji', durationMin: 120 } },
  { id: 'col-1', data: { name: 'Couleur', categoryId: 'atl-iii-yekpe', durationMin: 90, master: 'Expert' } },
  { id: 'sv-koko-ori', data: { name: 'KOKO Origine', categoryId: 'koko', durationMin: 60 } },
  { id: 'sv-koko-sui', data: { name: 'KOKO Suivi', categoryId: 'koko', durationMin: 60 } },
  { id: 'soin-avant', data: { name: 'Soin profond', categoryId: 'c-lav', durationMin: 60, consultationAvant: true } },
  { id: 'devis-1', data: { name: 'Sur mesure', categoryId: 'atl-ii-gbeji', priceMode: 'devis' } },
  { id: 'cache-1', data: { name: 'Prix cache', categoryId: 'atl-ii-gbeji', hidePrice: true, durationMin: 60 } },
  { id: 'vek-1', data: { name: 'Creation', categoryId: 'atl-i-vekpe', durationMin: 240 } },
  { id: 'fin-1', data: { name: 'Restauration', categoryId: 'c-fin', durationMin: 180 } },
  { id: 'form-1', data: { name: 'Formation', categoryId: 'atl-formation', durationMin: 60 } },
  { id: 'masque-1', data: { name: 'Masque', categoryId: 'c-lav', durationMin: 60 } },
  { id: 'eteint-1', data: { name: 'Eteint', categoryId: 'c-lav', durationMin: 60, enabled: false } },
  { id: 'range-1', data: { name: 'Range', categoryId: 'c-lav', durationMin: 60, archived: true } },
  { id: 'sans-duree', data: { name: 'Sans duree', categoryId: 'c-lav' } },
];
const VITRINE = { siteMasques: { services: ['masque-1'] }, formulesRapides: [{ serviceIds: ['lav-1', 'rep-1'], venues: 9 }, { serviceIds: [] }] };
const BRANCHE = { id: 'br', data: { masters: ['Team', 'Expert', ''], seats: '2', flagship: true } };
const occ = (jour: string, maitre: string, debut: string, duree: number): CreneauOccupe => ({ jour, maitre, debut, duree });
/* La quinzaine qui sert aux places : de quoi exercer chaque regle. */
const OCCUPES: CreneauOccupe[] = [
  occ(JEU, 'Team', '10:00', 60),
  occ(VEN, 'Team', '09:00', 180),
  occ(VEN, 'Expert', '11:00', 60),
  occ(SAM, 'Team', '09:00', 120),
  occ(SAM, '', '09:00', 120),
  occ('2026-10-24', 'Expert', '13:00', 90),
];
const BLOCAGES = [
  { id: 'b1', data: { branchId: 'br', date: JEU, master: 'Team', debut: '14h00', fin: '16h00' } },
  { id: 'b2', data: { branchId: 'br', date: VEN2, debut: '12h00', fin: '14h00' } },
  { id: 'b3', data: { branchId: 'autre', date: VEN2, debut: '09h00', fin: '19h00' } },
];
const EXCEPTIONS = [
  { date: MAR, closed: true },
  { date: MER2, open: '10h00', close: '15h00' },
  { date: JEU2, closed: true, staffId: 'p-1' },
];
const REGLAGES = { hours: SEMAINE, maxRdvParJourMaison: 0, maxRdvParJourMaitre: '0' };

const lignes = (o: {
  occupes?: CreneauOccupe[]; blocages?: typeof BLOCAGES; reglages?: Record<string, unknown>;
  exceptions?: unknown; branche?: { id: string; data?: unknown } | null; services?: LigneService[];
} = {}) => ({
  branche: o.branche === undefined ? BRANCHE : o.branche,
  reglages: o.reglages ?? REGLAGES,
  exceptions: o.exceptions ?? EXCEPTIONS,
  vitrine: VITRINE,
  services: o.services ?? SERVICES,
  categories: CATEGORIES,
  blocages: o.blocages ?? BLOCAGES,
  occupes: o.occupes ?? OCCUPES,
});

/* L'agenda du SITE, lu des memes lignes comme le site les lit
   (`agendaDeLaMaison`) : c'est contre lui que les places se comparent. */
const agendaDuSite = (o: { occupes?: CreneauOccupe[] } = {}): { agenda: AgendaDeLaMaison; occupes: CreneauOccupe[] } => ({
  agenda: {
    branchId: BRANCHE.id,
    maitres: BRANCHE.data.masters.filter(Boolean),
    services: SERVICES.map((r) => ({ id: r.id, ...r.data }) as unknown as PrestationPublique)
      .filter((s) => s.enabled !== false && !s.archived),
    categories: CATEGORIES.map((c) => ({ id: c.id, label: c.data.label, ...(c.data.parentId ? { parentId: c.data.parentId } : {}) })),
    semaine: SEMAINE,
    exceptions: EXCEPTIONS,
    murs: BLOCAGES.map((b) => b.data),
    capMaison: 0,
    capMaitre: 0,
    sieges: Math.max(0, Number(BRANCHE.data.seats ?? 0)),
    masques: VITRINE.siteMasques,
    bandes: [],
    bandSets: {},
    baremeSuspendu: false,
    formules: [],
  },
  occupes: o.occupes ?? OCCUPES,
});

const GESTES: string[][] = [['lav-1'], ['rep-1'], ['lav-1', 'rep-1'], ['col-1'], ['sv-koko-ori'], ['sans-duree']];
const GRILLE = Array.from({ length: 12 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`);

/* ══ A, B : LES CAS, joues sur une bibliotheque (l'original, ou une copie) ══ */
function suite(lib: Lib, silence: boolean): number {
  const { dit, ecarts } = juge(silence);
  const ag = (o?: Parameters<typeof lignes>[0]): AgendaDuServeur => {
    const a = lib.agendaDepuisLesLignes(lignes(o));
    if (!a) throw new Error('agenda nul');
    return a;
  };
  const AG = ag();
  const tient = (a: AgendaDuServeur, date: string, time: string, serviceIds: string[], ms = MS) =>
    lib.laPlaceTient(a, { date, time, serviceIds }, ms);
  const erreur = (v: ReturnType<Lib['laPlaceTient']>): string => (v.ok ? 'ok' : v.erreur);

  /* ── L'agenda se lit sans se casser ── */
  dit('A1 sans branche, pas d agenda', null, lib.agendaDepuisLesLignes(lignes({ branche: null })));
  dit('A2 les fauteuils ecrits en texte se lisent, les libelles vides tombent', [2, ['Team', 'Expert']], [AG.sieges, AG.maitres]);
  dit('A3 un plafond ecrit en texte « 0 » vaut sans limite', [0, 0], [AG.capMaison, AG.capMaitre]);
  dit('A4 une valeur mal ecrite en base ne casse rien', true, (() => {
    const a = lib.agendaDepuisLesLignes({
      branche: { id: 'br', data: { masters: 'Team', seats: -3 } },
      reglages: { hours: [{ key: 'lun' }, null, 7], maxRdvParJourMaison: 'beaucoup' },
      exceptions: { pas: 'une liste' },
      vitrine: null,
      services: [{ id: 'x', data: null }, { id: '', data: { name: 'sans id' } }],
      categories: [{ id: 'c', data: 4 }],
      blocages: [{ data: { branchId: 'br', date: JEU, debut: 9, fin: null } }, null as never],
      occupes: [{ jour: JEU, maitre: 'Team', debut: '10:00', duree: 'long' }, { jour: JEU, debut: '' }],
    });
    return !!a && a.sieges === 0 && a.maitres.length === 0 && a.capMaison === 0 && a.services.length === 1
      && a.occupes.length === 1 && a.occupes[0].duree === 60 && lib.laPlaceTient(a, { date: JEU, time: '10:00', serviceIds: ['x'] }, MS).ok === false;
  })());
  dit('A5 les formules vides tombent, les masques du site se lisent', [1, ['masque-1']], [AG.formules.length, AG.masques.services]);

  /* ── La forme et la fenetre ── */
  dit('A6 une date qui n existe pas, une heure mal formee : creneau_invalide',
    ['creneau_invalide', 'creneau_invalide', 'creneau_invalide', 'creneau_invalide'],
    [erreur(tient(AG, '2026-02-31', '10:00', ['lav-1'])), erreur(tient(AG, JEU, '09:75', ['lav-1'])),
      erreur(tient(AG, JEU, '9:00', ['lav-1'])), erreur(tient(AG, '15/10/2026', '10:00', ['lav-1']))]);
  dit('A7 jamais le jour meme, jamais le passe', ['creneau_hors_fenetre', 'creneau_hors_fenetre'],
    [erreur(tient(AG, '2026-10-14', '15:00', ['lav-1'])), erreur(tient(AG, '2026-10-13', '15:00', ['lav-1']))]);
  dit('A8 J+90 se reserve, J+91 non', ['ok', 'creneau_hors_fenetre'],
    [erreur(tient(AG, '2027-01-12', '10:00', ['lav-1'])), erreur(tient(AG, '2027-01-13', '10:00', ['lav-1']))]);
  /* 23 h 30 UTC le 14 : il est 0 h 30 le 15 a Cotonou. Le 15 est le jour meme. */
  const NUIT = Date.parse('2026-10-14T23:30:00.000Z');
  const VEILLE = Date.parse('2026-10-14T22:30:00.000Z');
  dit('A9 a 23 h 30 UTC, le lendemain de Cotonou est deja aujourd hui', ['creneau_hors_fenetre', 'ok'],
    [erreur(tient(AG, JEU, '11:00', ['lav-1'], NUIT)), erreur(tient(AG, VEN, '15:00', ['lav-1'], NUIT))]);
  dit('A10 ... et a 22 h 30 UTC (23 h 30 a Cotonou), le 15 est encore demain', 'ok', erreur(tient(AG, JEU, '11:00', ['lav-1'], VEILLE)));
  dit('A11 le jour de Cotonou et l ecart en jours', ['2026-10-15', 1, 0, Number.NaN].map(String),
    [lib.jourDeCotonou(NUIT), lib.joursDEcart(VEN, NUIT), lib.joursDEcart(JEU, NUIT), lib.joursDEcart('2026-02-30', NUIT)].map(String));

  /* ── Les jours et les heures d'ouverture ── */
  dit('A12 un dimanche, une fermeture exceptionnelle : creneau_ferme', ['creneau_ferme', 'creneau_ferme'],
    [erreur(tient(AG, DIM, '10:00', ['lav-1'])), erreur(tient(AG, MAR, '10:00', ['lav-1']))]);
  dit('A13 l exception d UNE personne ne ferme pas la Maison', 'ok', erreur(tient(AG, JEU2, '10:00', ['lav-1'])));
  dit('A14 une journee raccourcie se respecte', ['creneau_hors_ouverture', 'ok', 'creneau_hors_ouverture'],
    [erreur(tient(AG, MER2, '09:00', ['lav-1'])), erreur(tient(AG, MER2, '14:00', ['lav-1'])), erreur(tient(AG, MER2, '14:00', ['rep-1']))]);
  dit('A15 le rituel doit finir avant la fermeture', ['ok', 'creneau_hors_ouverture', 'creneau_hors_ouverture', 'creneau_hors_ouverture'],
    [erreur(tient(AG, JEU2, '18:00', ['lav-1'])), erreur(tient(AG, JEU2, '18:30', ['lav-1'])),
      erreur(tient(AG, JEU2, '08:00', ['lav-1'])), erreur(tient(AG, JEU2, '17:30', ['rep-1']))]);

  /* ── La porte de consultation, et ce qui se reserve en ligne ── */
  dit('A16 une creation VEKPE, une restauration FINFIN, un devis, un prix cache, « consultation avant » : consultation_requise',
    ['consultation_requise', 'consultation_requise', 'consultation_requise', 'consultation_requise', 'consultation_requise'],
    ['vek-1', 'fin-1', 'devis-1', 'cache-1', 'soin-avant'].map((id) => erreur(tient(AG, JEU2, '09:00', [id]))));
  dit('A17 la consultation elle-meme se reserve', ['ok', 'ok'],
    [erreur(tient(AG, JEU2, '09:00', ['sv-koko-ori'])), erreur(tient(AG, JEU2, '09:00', ['sv-koko-sui']))]);
  dit('A18 une creation glissee parmi des lavages ferme toute la venue', 'consultation_requise',
    erreur(tient(AG, JEU2, '09:00', ['lav-1', 'vek-1'])));
  dit('A19 une formation, un geste decoche pour le site : prestation_retiree', ['prestation_retiree', 'prestation_retiree'],
    [erreur(tient(AG, JEU2, '09:00', ['form-1'])), erreur(tient(AG, JEU2, '09:00', ['masque-1']))]);
  dit('A20 eteint, range, inconnu, ou rien : prestation_inconnue',
    ['prestation_inconnue', 'prestation_inconnue', 'prestation_inconnue', 'prestation_inconnue', 'prestation_inconnue'],
    [erreur(tient(AG, JEU2, '09:00', ['eteint-1'])), erreur(tient(AG, JEU2, '09:00', ['range-1'])),
      erreur(tient(AG, JEU2, '09:00', ['inconnu-x'])), erreur(tient(AG, JEU2, '09:00', [])),
      erreur(tient(AG, JEU2, '09:00', ['lav-1', 'inconnu-x']))]);

  /* ── La duree ── */
  const duree = (ids: string[]): number | string => { const v = tient(AG, JEU2, '09:00', ids); return v.ok ? v.dureeMin : v.erreur; };
  dit('A21 la duree : la somme du catalogue, une heure au moins', [60, 180, 60, 120],
    [duree(['lav-1']), duree(['lav-1', 'rep-1']), duree(['sans-duree']), duree(['sans-duree', 'lav-1'])]);

  /* ── Les fauteuils ── */
  dit('A22 un samedi plein refuse meme si « Expert » est libre', 'creneau_pris', erreur(tient(AG, SAM, '10:00', ['lav-1'])));
  const onze = tient(AG, SAM, '11:00', ['lav-1']);
  dit('A23 ... et rouvre quand un fauteuil se libere, avec les deux maitres', ['Team', 'Expert'], onze.ok ? onze.maitres : onze.erreur);
  const sansFauteuils = ag({ branche: { id: 'br', data: { masters: ['Team', 'Expert'] } } });
  const s10 = tient(sansFauteuils, SAM, '10:00', ['lav-1']);
  dit('A24 sans fauteuils declares, la Maison n a pas de limite (Expert prend)', ['Expert'], s10.ok ? s10.maitres : s10.erreur);

  /* ── Le maitre libre, jamais le premier sans regarder ── */
  const j10 = tient(AG, JEU, '10:00', ['lav-1']);
  dit('A25 Team est pris a 10 h : la place tient, avec Expert seul', ['Expert'], j10.ok ? j10.maitres : j10.erreur);
  const j9 = tient(AG, JEU, '09:00', ['lav-1']);
  dit('A26 libres tous les deux : l ordre de la Maison', ['Team', 'Expert'], j9.ok ? j9.maitres : j9.erreur);
  const j9long = tient(AG, JEU, '09:00', ['rep-1']);
  dit('A27 un rituel de deux heures qui deborde sur le rendez-vous de Team', ['Expert'], j9long.ok ? j9long.maitres : j9long.erreur);
  const colAg = ag({ occupes: [occ(JEU, 'Expert', '10:00', 60)] });
  dit('A28 un geste qui designe son maitre n en prend pas d autre', ['creneau_pris', 'ok'],
    [erreur(tient(colAg, JEU, '10:00', ['col-1'])), erreur(tient(colAg, JEU, '10:00', ['lav-1']))]);
  const sansMaitre = ag({ branche: { id: 'br', data: { masters: [] } } });
  const sm = tient(sansMaitre, JEU2, '09:00', ['lav-1']);
  dit('A29 une branche sans maitre declare : le libelle vide', [''], sm.ok ? sm.maitres : sm.erreur);

  /* ── La duree d'un rendez-vous deja pose : telle qu'elle est ecrite ── */
  const v11 = tient(AG, VEN, '11:00', ['lav-1']);
  dit('A30 Team pris de 9 h a 12 h (180 min ecrites), Expert a 11 h : creneau_pris', 'creneau_pris', erreur(v11));
  const v12 = tient(AG, VEN, '12:00', ['lav-1']);
  dit('A31 ... a midi, les deux sont libres', ['Team', 'Expert'], v12.ok ? v12.maitres : v12.erreur);
  const v10 = tient(ag({ occupes: [occ(VEN, 'Team', '09:00', 180)] }), VEN, '11:00', ['lav-1']);
  dit('A32 la duree ecrite (180) tient Team jusqu a midi, meme pour un geste d une heure', ['Expert'], v10.ok ? v10.maitres : v10.erreur);

  /* ── Les murs ── */
  const j14 = tient(AG, JEU, '14:00', ['lav-1']);
  dit('A33 le mur de Team (14 h - 16 h) le retire, Expert reste', ['Expert'], j14.ok ? j14.maitres : j14.erreur);
  dit('A34 un mur sans maitre ferme l heure a tous', ['creneau_pris', 'ok'],
    [erreur(tient(AG, VEN2, '12:00', ['lav-1'])), erreur(tient(AG, VEN2, '14:00', ['lav-1']))]);
  dit('A35 le mur d une autre branche ne bloque rien ici', 'ok', erreur(tient(AG, VEN2, '09:00', ['lav-1'])));

  /* ── Les plafonds ── */
  const capM = ag({ reglages: { ...REGLAGES, maxRdvParJourMaison: 2 }, occupes: [occ(JEU2, 'Team', '09:00', 60), occ(JEU2, 'Expert', '15:00', 60)] });
  dit('A36 le plafond de la Maison atteint : creneau_plafond, meme a une heure libre', 'creneau_plafond', erreur(tient(capM, JEU2, '12:00', ['lav-1'])));
  const capT = ag({ reglages: { ...REGLAGES, maxRdvParJourMaitre: '1' }, occupes: [occ(JEU2, 'Team', '15:00', 60)] });
  const ct = tient(capT, JEU2, '10:00', ['lav-1']);
  dit('A37 le plafond d un maitre l ecarte, l autre prend', ['Expert'], ct.ok ? ct.maitres : ct.erreur);
  const capTous = ag({ reglages: { ...REGLAGES, maxRdvParJourMaitre: 1 }, occupes: [occ(JEU2, 'Team', '15:00', 60), occ(JEU2, 'Expert', '17:00', 60)] });
  dit('A38 tous les maitres a leur plafond : creneau_plafond', 'creneau_plafond', erreur(tient(capTous, JEU2, '10:00', ['lav-1'])));

  /* ══ B. LES PLACES ══════════════════════════════════════════════════ */
  const site = agendaDuSite();
  for (const ids of GESTES) {
    const places = lib.placesLibres(AG, ids, MS, 14);
    const jours = [...new Set(places.map((p) => p.iso))];
    const attendues: string[] = [];
    const tenues: string[] = [];
    const premiers: string[] = [];
    const premiersDuSite: string[] = [];
    for (let i = 1; i <= 14; i += 1) {
      const iso = lib.isoApresJours('2026-10-14', i);
      const duSite = heuresLibres({ agenda: site.agenda, dateIso: iso, serviceIds: ids, occupes: site.occupes, maintenant: new Date(MS) });
      for (const h of duSite) { attendues.push(`${iso} ${h.heure}`); premiersDuSite.push(`${iso} ${h.heure} ${h.maitre}`); }
      for (const h of GRILLE) {
        const v = tient(AG, iso, h, ids);
        if (v.ok) { tenues.push(`${iso} ${h}`); premiers.push(`${iso} ${h} ${v.maitres[0]}`); }
      }
    }
    dit(`B1 [${ids.join('+')}] placesLibres rend les heures du site, jour par jour`, attendues, places.map((p) => `${p.iso} ${p.heure}`));
    dit(`B2 [${ids.join('+')}] laPlaceTient accepte exactement ces heures (grille de l heure)`, attendues, tenues);
    dit(`B3 [${ids.join('+')}] ... avec le premier maitre que le site aurait envoye`, premiersDuSite, premiers);
    dit(`B4 [${ids.join('+')}] il y a des places a juger (sinon le controle est mort)`, true, places.length > 20 && jours.length >= 8);
  }
  dit('B5 le samedi plein n a pas de place a 9 h ni a 10 h', [false, false, true],
    ['09:00', '10:00', '11:00'].map((h) => lib.placesLibres(AG, ['lav-1'], MS, 14).some((p) => p.iso === SAM && p.heure === h)));
  dit('B6 des gestes qui ne se reservent pas en ligne n ont aucune place', [0, 0, 0, 0],
    [['vek-1'], ['form-1'], ['eteint-1'], []].map((ids) => lib.placesLibres(AG, ids, MS, 14).length));
  const nuit = lib.placesLibres(AG, ['lav-1'], NUIT, 3);
  dit('B7 les places commencent au lendemain de Cotonou, et s arretent a l horizon', [VEN, SAM], [...new Set(nuit.map((p) => p.iso))]);
  const toutes = lib.placesLibres(AG, ['lav-1'], MS, 200);
  dit('B8 l horizon ne passe jamais trois mois, et les places sont rangees dans le temps', [true, true],
    [toutes.every((p) => lib.joursDEcart(p.iso, MS) >= 1 && lib.joursDEcart(p.iso, MS) <= lib.FENETRE_DE_RESERVATION),
      toutes.every((p, i) => i === 0 || `${toutes[i - 1].iso} ${toutes[i - 1].heure}` < `${p.iso} ${p.heure}`)]);
  dit('B9 jamais un maitre dans une place proposee', true, toutes.every((p) => Object.keys(p).join(',') === 'iso,heure'));

  return ecarts();
}

/* ══ C. LE SITE N'A PAS BOUGE ══════════════════════════════════════════
   L'ancien predicat du site, FIGE ICI tel qu'il etait avant le 9 octobre
   2026 : `prestationsReservables` lit desormais `reservableSurLeSite`, et
   doit rendre exactement la meme chose, porte par porte. */
function ancienPrestationsReservables(agenda: AgendaDeLaMaison, besoin: Besoin): PrestationPublique[] {
  const cats = agenda.categories;
  const offert = (s: PrestationPublique) => !masquePourLeSite(s, agenda.masques, cats);
  if (porteDuBesoin(besoin) === 'consultation') {
    const consultations = agenda.services.filter((s) => estUneConsultation(s, cats) && offert(s));
    const sienne = ({ creation: 'sv-koko-ori', reparation: 'sv-koko-sui', enfant: 'svc-doto-conseil' } as Partial<Record<Besoin, string>>)[besoin];
    const laSienne = sienne ? consultations.filter((s) => s.id === sienne) : [];
    return laSienne.length > 0 ? laSienne : consultations;
  }
  return agenda.services.filter((s) => {
    if (!offert(s)) return false;
    if (estUneConsultation(s, cats)) return false;
    if (exigeConsultation(s, cats)) return false;
    if (priceModeOf(s) === 'devis') return false;
    const racine = racineOf(cats, s.categoryId)?.id ?? s.categoryId;
    return ['atl-ii-gbeji', 'atl-iii-yekpe'].includes(racine);
  });
}
{
  const { dit } = juge(false);
  const { agenda } = agendaDuSite();
  for (const b of ['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu'] as Besoin[]) {
    dit(`C1 la porte « ${b} » propose ce qu'elle proposait`, ancienPrestationsReservables(agenda, b).map((s) => s.id), prestationsReservables(agenda, b).map((s) => s.id));
  }
  dit('C2 la porte entretien a de quoi etre jugee', true, prestationsReservables(agenda, 'entretien').length >= 3);
  dit('C3 le site re-exporte LES constantes du serveur (les memes objets)', [true, true],
    [ATELIERS_DU_SITE === depot.ATELIERS_RESERVABLES, CONSULTATIONS_DU_SITE === depot.CONSULTATION_PAR_PARCOURS]);
  const src = readFileSync('src/apps/revelateur/agenda.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit('C4 le site ne tient plus sa propre liste d ateliers', false, /\[\s*'atl-ii-gbeji'/.test(src));
}

/* ══ A et B sur l'original ═════════════════════════════════════════════ */
suite(depot, false);

/* ══ D. LES COPIES DES FONCTIONS EDGE ══════════════════════════════════ */
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const entre = (src: string, nom: string): string | null => {
  const ouvre = `/* ⟨${nom}⟩ */\n`;
  const i = src.indexOf(ouvre);
  const k = src.indexOf(`\n/* ⟨/${nom}⟩ */`, i);
  return i < 0 || k < 0 ? null : src.slice(i + ouvre.length, k);
};
const ORIGINAUX: [string, string][] = [
  ['agenda-pur', 'src/shared/agenda-pur.ts'],
  ['catalogue-pur', 'src/shared/catalogue-pur.ts'],
  ['qualification', 'src/shared/qualification.ts'],
  ['place-du-serveur', 'src/shared/place-du-serveur.ts'],
];
const EXPORTS = '\nexport { ATELIERS_RESERVABLES, CONSULTATION_PAR_PARCOURS, FENETRE_DE_RESERVATION, reservableSurLeSite, agendaDepuisLesLignes, jourDeCotonou, isoApresJours, joursDEcart, laPlaceEstRecevable, lesGestesSeReservent, maitresDuRituel, laPlaceTient, placesLibres };\n';
const { transform } = await import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href) as typeof import('esbuild');
async function charge(blocs: string[]): Promise<Lib> {
  const { code } = await transform(blocs.join('\n') + EXPORTS, { loader: 'ts', format: 'esm' });
  const banc = mkdtempSync(path.join(os.tmpdir(), 'place-du-serveur-'));
  try {
    writeFileSync(path.join(banc, 'copie.mjs'), code);
    return await import(pathToFileURL(path.join(banc, 'copie.mjs')).href) as Lib;
  } finally {
    rmSync(banc, { recursive: true, force: true });
  }
}
const originaux = ORIGINAUX.map(([nom, f]) => entre(lf(readFileSync(f, 'utf8')), nom) ?? '');
{
  const { dit } = juge(false);
  dit('D1 chaque original porte ses reperes', [true, true, true, true], originaux.map((o) => o.length > 100));
  dit('D2 le bloc du serveur n importe ni n exporte rien (il vit dans une fonction Edge)', [false, false],
    [/^\s*import\s/m.test(originaux[3]), /^\s*export\s/m.test(originaux[3])]);
  const fonctions: string[] = [];
  const marche = (d: string) => { for (const n of readdirSync(d)) { const p = `${d}/${n}`; if (statSync(p).isDirectory()) marche(p); else if (/\.(ts|js)$/.test(n)) fonctions.push(p); } };
  marche('supabase/functions');
  const porteurs = fonctions.filter((f) => lf(readFileSync(f, 'utf8')).includes('/* ⟨place-du-serveur⟩ */\n'));
  dit('D3 la porte du site porte le juge du serveur', true, porteurs.includes('supabase/functions/demande-submit/index.ts'));
  for (const f of porteurs) {
    const src = lf(readFileSync(f, 'utf8'));
    const copies = ORIGINAUX.map(([nom]) => entre(src, nom));
    dit(`D4 ${f} : les quatre blocs, chacun l original caractere pour caractere`, [true, true, true, true],
      copies.map((c, i) => c !== null && c.trimEnd() === originaux[i]));
    if (copies.some((c) => c === null)) continue;
    const copie = await charge(copies as string[]);
    const fautes = suite(copie, true);
    dit(`D5 ${f} : la copie, executee, passe tous les cas de l original`, 0, fautes);
  }
}

/* ══ E. LA PORTE DU SITE ET LE VERROU, SUR LA LETTRE ═══════════════════ */
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function jugeLaPorte(brut: string): string[] {
  const s = sansCommentaires(brut);
  const fautes: string[] = [];
  const exige = (nom: string, ok: boolean) => { if (!ok) fautes.push(nom); };
  exige('plus aucune insertion directe d un rendez-vous', !/from\('appointments'\)\s*\.insert\(/.test(s) && !/from\('appointments'\)\.upsert\(/.test(s));
  exige('la pose passe par le verrou, avec les maitres libres', /await admin\.rpc\('pose_si_libre', \{ p_rdv: appt, p_maitres: maitresLibres \}\)/.test(s));
  exige('la place n est retenue que si le verrou a pose CE rendez-vous', /posee\?\.ok === true && posee\.id === candidat/.test(s));
  exige('le rendez-vous porte sa duree figee', /master,\s*dureeMin,\s*status: 'confirmé',\s*source: 'site'/.test(s));
  exige('les creneaux occupes se lisent par creneaux_occupes, pour le jour', /admin\.rpc\('creneaux_occupes', \{ p_branch: o\.branche\.id, p_du: o\.date, p_au: o\.date \}\)/.test(s));
  exige('plus aucune lecture directe des rendez-vous pour juger', !/from\('appointments'\)\.select\(/.test(s));
  exige('le catalogue, ses familles et les murs se lisent par pages', /toutesLesLignes\('catalog_services'\)/.test(s)
    && /toutesLesLignes\('catalog_categories'\)/.test(s) && /toutesLesLignes\('blocages', \[\['data->>branchId', o\.branche\.id\], \['data->>date', o\.date\]\]\)/.test(s));
  exige('le juge est celui du serveur', /laPlaceTient\(agenda, \{ date: o\.date, time: o\.time, serviceIds: o\.serviceIds \}, maintenant\)/.test(s));
  exige('la forme et la fenetre se jugent avant toute lecture', s.indexOf('laPlaceEstRecevable({ date: o.date, time: o.time }, maintenant)') > -1
    && s.indexOf('laPlaceEstRecevable({ date: o.date, time: o.time }, maintenant)') < s.indexOf("toutesLesLignes('catalog_services')"));
  exige('une lecture en panne refuse', /if \(panne \|\| pris\.length >= PLAFOND_D_UNE_REPONSE\)/.test(s) && /return \{ erreur: 'agenda_illisible' \}/.test(s));
  exige('le refus du juge part en 409, la panne en 503', /json\(\{ error: verdict\.erreur \}, verdict\.erreur === 'agenda_illisible' \? 503 : 409\)/.test(s));
  exige('jamais le premier maitre de la branche sans regarder', !/\b(?:o|branche)\.maitres\[0\]/.test(s));
  exige('le jour ne se compte plus sur l horloge du serveur', !/setHours\(0, 0, 0, 0\)/.test(s));
  exige('la branche porte sa ligne (les fauteuils)', /ligne: \{ id, data: choisie\?\.data \?\? \{\} \}/.test(s) && /laPlaceDemandee\(\{ branche: branche\.ligne, serviceIds, date, time \}\)/.test(s));
  exige('plus aucune vieille copie du calendrier hors des reperes', (s.match(/function ouvertureDuJour\(/g) ?? []).length === 1
    && (s.match(/function masquePourLeSite\(/g) ?? []).length === 1);
  return fautes;
}
function jugeLeVerrou(brut: string): string[] {
  const s = brut.replace(/--[^\n]*/g, '');
  const fautes: string[] = [];
  const exige = (nom: string, ok: boolean) => { if (!ok) fautes.push(nom); };
  const corps = (debut: string): string => { const i = s.indexOf(debut); if (i < 0) return ''; const k = s.indexOf('$$;', s.indexOf('$$', i) + 2); return s.slice(i, k); };
  const pose = corps('create or replace function public.pose_si_libre(');
  const duree = corps('create or replace function public.duree_du_rdv(');
  const occupes = corps('create or replace function public.creneaux_occupes(');
  exige('pose_si_libre existe', pose.length > 500);
  exige('... sous un verrou par maison et par jour', /perform pg_advisory_xact_lock\(hashtext\('pose'\), hashtext\(branche \|\| ':' \|\| jour\)\);/.test(pose));
  exige('... le verrou est pris AVANT de relire la journee', pose.indexOf('pg_advisory_xact_lock') > -1 && pose.indexOf('pg_advisory_xact_lock') < pose.indexOf('insert into public.appointments'));
  exige('... jamais le jour meme, compte a Cotonou', /'Africa\/Porto-Novo'/.test(pose) && /if jour <= aujourdhui or jour > dans90 then/.test(pose));
  exige('... les fauteuils', /if sieges > 0 and \(/.test(pose));
  exige('... le premier maitre ENCORE libre, dans l ordre donne', /foreach m in array maitres loop/.test(pose) && /choisi := m;/.test(pose));
  exige('... la duree figee sur le rendez-vous', /'dureeMin', duree/.test(pose) && /duree := public\.duree_du_rdv\(p_rdv\);/.test(pose));
  exige('... jamais un statut annule', !/'annulé'\s*\)/.test(pose.replace(/<> 'annulé'/g, '')));
  exige('... reservee au serveur', /revoke all on function public\.pose_si_libre\(jsonb, text\[\], jsonb, jsonb\) from public, anon, authenticated;/.test(s)
    && /grant execute on function public\.pose_si_libre\(jsonb, text\[\], jsonb, jsonb\) to service_role;/.test(s));
  exige('duree_du_rdv lit dureeMin AVANT le catalogue', duree.indexOf("a->>'dureeMin'") > -1 && duree.indexOf("a->>'dureeMin'") < duree.indexOf('catalog_services'));
  exige('creneaux_occupes lit la duree figee, meme signature que 0079', /public\.duree_du_rdv\(a\.data\)\s+as duree/.test(occupes)
    && /returns table \(jour text, maitre text, debut text, duree int\)/.test(occupes));
  exige('les fiches d un numero : reservees au serveur', /revoke all on function public\.fiches_du_numero\(text\) from public, anon, authenticated;/.test(s));
  return fautes;
}
const PORTE = 'supabase/functions/demande-submit/index.ts';
const MIGRATION = 'supabase/migrations/0125_la_maison_repond_sur_whatsapp.sql';
const porte = lf(readFileSync(PORTE, 'utf8'));
const migration = lf(readFileSync(MIGRATION, 'utf8'));
{
  const { dit } = juge(false);
  dit('E1 demande-submit : lit, juge, pose sous verrou', [], jugeLaPorte(porte));
  dit('E2 0125 : le verrou, la duree figee, le serveur seul', [], jugeLeVerrou(migration));
  const conf = sansCommentaires(lf(readFileSync('supabase/functions/confirmation-rdv/index.ts', 'utf8')));
  dit('E3 confirmation-rdv : WhatsApp comme le site, et hors de la salle d attente', [true, true], [
    conf.includes("if (a.source === 'site' || a.source === 'whatsapp') return true;"),
    conf.includes("const enSalle = salleOuverte && a.source !== 'couronne' && a.source !== 'whatsapp';"),
  ]);
}

/* ══ F. LES PANNES : chaque faute remise doit faire crier ═══════════════
   Une mutation introuvable fait echouer le harnais : une panne qui ne
   s'applique plus ne prouve rien. */
type Panne = { nom: string; avant: string; apres: string };
const PANNES_DU_JUGE: Panne[] = [
  { nom: 'les fauteuils oublies par le juge', avant: 'if (agenda.sieges > 0\n    && duJour.filter', apres: 'if (false\n    && duJour.filter' },
  { nom: 'le premier maitre, libre ou non', avant: 'return { ok: true, dureeMin, maitres: libres };', apres: 'return { ok: true, dureeMin, maitres: candidats };' },
  { nom: 'le jour compte sur l horloge UTC', avant: 'new Date(ms + 3_600_000)', apres: 'new Date(ms)' },
  { nom: 'J+91 accepte', avant: 'const FENETRE_DE_RESERVATION = 90;', apres: 'const FENETRE_DE_RESERVATION = 91;' },
  { nom: 'la porte de consultation ouverte', avant: "if (connus.some((s) => !estUneConsultation(s, cats) && exigeConsultation(s, cats))) return 'consultation_requise';", apres: '' },
  { nom: 'tous les ateliers ouverts en ligne', avant: 'return ATELIERS_RESERVABLES.includes(racine);', apres: 'return true;' },
  { nom: 'la duree ecrite d un rendez-vous pose ignoree', avant: 'duree: Number.isFinite(d) && d >= 1 ? d : 60', apres: 'duree: 60' },
  { nom: 'les places sans les fauteuils', avant: 'capSimultane: agenda.sieges,', apres: 'capSimultane: 0,' },
  { nom: 'les murs oublies par le juge', avant: '      ...plagesBloquees(agenda.murs, agenda.branchId, p.date, m),\n', apres: '' },
  { nom: 'une prestation eteinte acceptee', avant: "(s): s is PrestationDuServeur => !!s && s.enabled !== false && !s.archived", apres: '(s): s is PrestationDuServeur => !!s' },
];
const PANNES_DE_LA_PORTE: Panne[] = [
  { nom: 'la porte insere le rendez-vous sans verrou', avant: "await admin.rpc('pose_si_libre', { p_rdv: appt, p_maitres: maitresLibres })", apres: "await admin.from('appointments').insert({ id: candidat, branch_id: branchId, data: appt })" },
  { nom: 'la porte prend le premier maitre de la branche', avant: 'master = verdict.maitres[0] ?? \'\';', apres: "master = branche.maitres[0] ?? '';" },
  { nom: 'la porte croit une journee illisible vide', avant: 'if (panne || pris.length >= PLAFOND_D_UNE_REPONSE) {', apres: 'if (false) {' },
  { nom: 'la porte relit les rendez-vous d un seul select', avant: "admin.rpc('creneaux_occupes', { p_branch: o.branche.id, p_du: o.date, p_au: o.date })", apres: "admin.from('appointments').select('id, data').eq('data->>date', o.date)" },
  { nom: 'la porte oublie la duree figee', avant: "      dureeMin,\n      status: 'confirmé',\n      source: 'site',", apres: "      status: 'confirmé',\n      source: 'site'," },
];
const PANNES_DU_VERROU: Panne[] = [
  { nom: 'le verrou retire', avant: "  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || jour));\n", apres: '' },
  { nom: 'le verrou ouvert au public', avant: 'revoke all on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) from public, anon, authenticated;', apres: 'revoke all on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) from public;' },
  { nom: 'la duree recalculee depuis le catalogue', avant: "  ecrite text := btrim(coalesce(a->>'dureeMin', ''));", apres: "  ecrite text := '';" },
  { nom: 'les fauteuils oublies par le verrou', avant: '  if sieges > 0 and (', apres: '  if false and (' },
];
const mute = (texte: string, p: Panne): string | null => {
  const i = texte.indexOf(p.avant);
  if (i < 0 || texte.indexOf(p.avant, i + 1) >= 0) return null;
  return texte.slice(0, i) + p.apres + texte.slice(i + p.avant.length);
};
{
  const { dit } = juge(false);
  for (const p of PANNES_DU_JUGE) {
    const mutee = mute(originaux[3], p);
    if (mutee === null) { dit(`F panne « ${p.nom} » : introuvable dans le juge`, true, false); continue; }
    const lib = await charge([originaux[0], originaux[1], originaux[2], mutee]);
    const fautes = suite(lib, true);
    dit(`F panne « ${p.nom} » : le harnais crie (${fautes} cas)`, true, fautes > 0);
  }
  for (const p of PANNES_DE_LA_PORTE) {
    const mutee = mute(porte, p);
    if (mutee === null) { dit(`F panne « ${p.nom} » : introuvable dans la porte`, true, false); continue; }
    dit(`F panne « ${p.nom} » : le harnais crie`, true, jugeLaPorte(mutee).length > 0);
  }
  for (const p of PANNES_DU_VERROU) {
    const mutee = mute(migration, p);
    if (mutee === null) { dit(`F panne « ${p.nom} » : introuvable dans 0125`, true, false); continue; }
    dit(`F panne « ${p.nom} » : le harnais crie`, true, jugeLeVerrou(mutee).length > 0);
  }
  /* Et la copie : un seul caractere change dans le bloc d'une fonction Edge. */
  const copieAbimee = mute(porte, { nom: 'copie', avant: 'const FENETRE_DE_RESERVATION = 90;', apres: 'const FENETRE_DE_RESERVATION = 91;' });
  dit('F panne « un caractere change dans la copie de la porte » : la confrontation crie', true,
    copieAbimee !== null && entre(copieAbimee, 'place-du-serveur')?.trimEnd() !== originaux[3]);
}

console.log(ko === 0 ? `\nLa place du serveur tient (${vus} controles).` : `\n${ko} controle(s) en echec sur ${vus}.`);
/* exitCode plutot qu'exit : le lanceur efface encore son dossier temporaire. */
process.exitCode = ko === 0 ? 0 : 1;
