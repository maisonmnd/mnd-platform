/* LES BESOINS ET LEURS POINTS, ÉPROUVÉS — `node scripts/verifie-les-besoins.mjs`.

   13 novembre 2026 (la Consultation, lot 1). La semence, le calcul de
   qualification (pertinence, paliers, seuils, preuves), la garde médicale,
   les liens besoin ↔ prestation, et la lecture sûre d'un document venu du
   serveur. Les prix sont des exemples. Sortie ASCII : la console de Windows. */
import {
  AUCUNE_PREUVE, BESOINS_DE_DEPART, FAMILLES_DE_DEPART, POINTS_PERMIS, besoinsDe, defautsDes, palierDe, qualifie, reglagesSurs, relie,
  type ReglagesDesBesoins,
} from '../src/shared/besoins-pur';
import { readFileSync } from 'node:fs';

let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};

/* ── ① LA SEMENCE ─────────────────────────────────────────────────────── */
const r = BESOINS_DE_DEPART();
dit('104 besoins, 11 familles', [104, 11], [r.besoins.length, r.familles.length]);
dit('les identifiants des besoins sont uniques', r.besoins.length, new Set(r.besoins.map((b) => b.id)).size);
dit('chaque besoin est dans une famille connue', true, r.besoins.every((b) => FAMILLES_DE_DEPART.some((f) => f.id === b.famille)));
dit('les points sont sur l echelle 5 a 30', true, r.besoins.every((b) => (POINTS_PERMIS as readonly number[]).includes(b.points)));
dit('un seul besoin attend sa prestation (les extensions, pas encore au catalogue)', ['Je veux des locks plus longues, tout de suite'], r.besoins.filter((b) => b.prestations.length === 0).map((b) => b.mots));
dit('plaques et psoriasis portent la garde medicale', 2, r.besoins.filter((b) => b.garde === 'peau').length);
dit('aucune prestation archivee le 13 novembre dans la semence', false,
  r.besoins.some((b) => b.prestations.some((s) => ['sv-plt-50-ret-c-c', 'aqua-locks-ritual', 'sv-stu-a-van-c', 'sv-stu-a-nat-m'].includes(s))));
dit('les seuils proposes : 0, 20, 40, 70', [0, 20, 40, 70], r.seuils);
dit('la semence est neuve a chaque appel (pas de reference partagee)', false, BESOINS_DE_DEPART().besoins === BESOINS_DE_DEPART().besoins);

/* ── ② LE CALCUL ─────────────────────────────────────────────────────── */
const PRIX: Record<string, number | undefined> = {
  'sv-atl-iv-gbe-c': 40000, 'sv-atl-iv-gbp-c': 80000, 'sv-atl-iv-ala-c': 110000, 'sv-plt-40-m': 15000, 'sv-koko-sui': 10000,
  'sv-plt-20-c': 22000, 'sv-plt-10-m': 25000, 'sv-plt-10-l': 18000, 'sv-koko-bilan': 10000, 'sv-plt-05-ess-c': 8000,
  'sv-forfait-sv-plt-60-wd-c': 30000, 'sv-dds-dec': 10000, 'sv-plt-05-pre-c': 18000, 'sv-plt-05-sig-c': 12000,
};
const prixDe = (id: string) => PRIX[id];
const id = (mots: string) => r.besoins.find((b) => b.mots === mots)!.id;
const casse = id('Mes locks cassent'), ouvertes = id('Mes locks s’ouvrent ou sont creuses'), ailleurs = id('Mes locks ont été faites ailleurs et je ne suis pas satisfaite');

const q1 = qualifie(r, [casse, ouvertes, ailleurs], { ...AUCUNE_PREUVE, photo: true }, prixDe);
const ligne = (q: ReturnType<typeof qualifie>, s: string) => q.lignes.find((l) => l.serviceId === s);
dit('FINFIN Essentiel : 65 points de besoins + 10 de photo, propose', [65, 75, true], [ligne(q1, 'sv-atl-iv-gbe-c')!.pertinence, ligne(q1, 'sv-atl-iv-gbe-c')!.score, ligne(q1, 'sv-atl-iv-gbe-c')!.ok]);
dit('FINFIN Profond (palier III) : 55 points et une photo, propose', [2, 55, true], [ligne(q1, 'sv-atl-iv-gbp-c')!.palier, ligne(q1, 'sv-atl-iv-gbp-c')!.score, ligne(q1, 'sv-atl-iv-gbp-c')!.ok]);
dit('ALALA (palier IV) : il manque 40 points et la consultation privee', ['il manque 40 points', 'il faut la consultation privée'], ligne(q1, 'sv-atl-iv-ala-c')!.manques);
const q2 = qualifie(r, [casse, ouvertes], AUCUNE_PREUVE, prixDe);
dit('sans preuve, un palier III attend une photo ou une visio', true, ligne(q2, 'sv-atl-iv-gbp-c')!.manques.includes('il faut une photo ou une visio'));
const contours = id('Mes contours ne sont plus nets');
const q3 = qualifie(r, [contours], { photo: true, visio: true, privee: true }, prixDe);
dit('un besoin ne donne ses points qu a ses prestations : les contours ne touchent pas ALALA', false, q3.lignes.some((l) => l.serviceId === 'sv-atl-iv-ala-c'));

const seches = id('Mes locks sont sèches');
const q4 = qualifie(r, [seches], AUCUNE_PREUVE, prixDe);
dit('locks seches : DANDAN et DANDAN Leger proposes sans preuve (prestations courantes, sans seuil)', [true, true], [ligne(q4, 'sv-plt-10-m')!.ok, ligne(q4, 'sv-plt-10-l')!.ok]);
const sansLibre: ReglagesDesBesoins = { ...r, sansSeuil: [] };
dit('sans la liste des prestations courantes, DANDAN (palier II, 20 points) attendrait 10 points', ['il manque 10 points'], ligne(qualifie(sansLibre, [seches], AUCUNE_PREUVE, prixDe), 'sv-plt-10-m')!.manques);

/* ── ③ LA GARDE MÉDICALE ─────────────────────────────────────────────── */
const psoriasis = id('J’ai du psoriasis'), residus = id('Mes locks ont des résidus de produits');
const q5 = qualifie(r, [psoriasis, residus], { photo: true, visio: true, privee: true }, prixDe);
dit('psoriasis : la garde est levee', true, q5.peau);
dit('psoriasis : WEWE ecarte, quels que soient les points', [false, true], [ligne(q5, 'sv-plt-20-c')!.ok, ligne(q5, 'sv-plt-20-c')!.manques.includes('écartée tant que la Maison n’a pas vu le cuir chevelu')]);
dit('psoriasis : la lecture KOKO Bilan et le lavage doux restent proposes', [true, true], [ligne(q5, 'sv-koko-bilan')!.ok, ligne(q5, 'sv-plt-05-ess-c')!.ok]);
dit('sans la garde, les residus font proposer WEWE', true, ligne(qualifie(r, [residus], AUCUNE_PREUVE, prixDe), 'sv-plt-20-c')!.ok);

/* ── ④ LES PALIERS ───────────────────────────────────────────────────── */
dit('paliers par le prix : 15 000 / 15 001 / 40 001 / 100 001', [0, 1, 2, 3], [15000, 15001, 40001, 100001].map((p) => palierDe(r, 'x', p)));
dit('un prix inconnu se range au palier le plus haut', 3, palierDe(r, 'x', undefined));
dit('un palier pose a la main l emporte sur le prix', 2, palierDe(r, 'sv-atl-i-med', undefined));

/* ── ⑤ LES LIENS ET LA SANTÉ ──────────────────────────────────────────── */
const lie = relie(r, contours, 'svc-extension', true);
dit('relier : la prestation apparait dans le besoin, une seule fois', 1, besoinsDe(relie(lie, contours, 'svc-extension', true), 'svc-extension').length);
dit('delier : elle disparait', 0, besoinsDe(relie(lie, contours, 'svc-extension', false), 'svc-extension').length);
dit('relier ne touche pas le document d origine', 0, besoinsDe(r, 'svc-extension').length);
const defauts = defautsDes(r, (s) => (s === 'sv-plt-20-c' ? 'archivee' : 'vendue'));
dit('la sante dit le besoin sans prestation et les prestations archivees', [true, true],
  [defauts.some((d) => /aucune prestation/.test(d.dit)), defauts.some((d) => /archiv/.test(d.dit))]);

/* ── ⑥ LA LECTURE SÛRE ───────────────────────────────────────────────── */
dit('un document vide ou casse reprend la semence', [104, 104], [reglagesSurs(null).besoins.length, reglagesSurs('texte').besoins.length]);
const partiel = reglagesSurs({ besoins: [{ id: 'b1', famille: 'lavage', mots: 'Test', points: 'x', prestations: ['a', 3] }], seuils: [0, 1, 2] });
dit('un document partiel garde ses besoins, repare ses champs', [1, 10, ['a'], [0, 20, 40, 70]], [partiel.besoins.length, partiel.besoins[0].points, partiel.besoins[0].prestations, partiel.seuils]);

/* ── ⑦ LES BRANCHEMENTS ──────────────────────────────────────────────── */
const lf = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const routes = lf('src/apps/trone/routes/index.tsx');
dit('l ecran est au menu Systeme et nomme parmi les ecrans nes apres', [true, true],
  [/path: '\/besoins', label: 'Besoins et règles'/.test(routes), /'\/besoins'\]/.test(routes)]);
dit('le document se synchronise sous sa cle', true, /createStore<ReglagesDesBesoins>\('mnd_besoins'/.test(lf('src/shared/besoins.ts')) && /bindDocument\(besoinsStore, 'mnd_besoins'\)/.test(lf('src/shared/besoins.ts')));
const cat = lf('src/apps/trone/routes/vente/Catalogue.tsx');
dit('la fiche technique est une rubrique du Catalogue et s ecrit a l enregistrement', [true, true],
  [/\{ k: 'fiche', t: 'Fiche technique' \}/.test(cat), /fiche: ficheAEcrire\(svcForm\.fiche\)/.test(cat)]);
const fac = lf('src/apps/trone/routes/vente/Factures.tsx');
dit('le rendez-vous nait a confirme, et se cherche dans les deux sens avant d etre cree', [true, true, true],
  [/const ouvreLeRendezVous = \(s: Invoice\['status'\]\): boolean => s === 'confirmé';/.test(fac), /a\.devisId === devis\.id/.test(fac), /devisId: devis\.id,/.test(fac)]);

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : les besoins ne tiennent pas leurs promesses.');
else console.log('TOUT VA BIEN : les besoins tiennent leurs promesses.');
