/* LA PERIODE DES POURBOIRES, EPROUVEE — 8 novembre 2026.
   `node scripts/verifie-la-periode-des-pourboires.mjs` (et `--prouve`).

   La regle de Y. : « Les pourboires du 6 au 4 du mois suivant sont payes le
   5. » La cle reste AAAA-MM, celle du mois ou la periode commence ; un
   pourboire du 6 au 31 est du mois, celui du 1er au 5 est du mois d'avant
   (le 5 compris, comme le disent ses exemples : 5 nov. -> '2026-10').

   Les attendus sont ecrits en dur. Les textes (les ecrans, les regroupements
   qui ne passent plus par `.slice(0, 7)`) se lisent par `lis`, qui applique
   la panne du moment en memoire (PANNE_TEXTE) : jamais dans le depot. */
import { readFileSync } from 'node:fs';
import { periodeAvant, periodeCourte, periodeDesPourboires, periodeDite, periodeTitre, payesLeDit, pourboiresDuDit } from '../src/shared/periode-des-pourboires-pur';
import { pourboiresDuMois } from '../src/shared/les-paiements-pur';
import { variablesDuMois } from '../src/apps/trone/routes/equipe/variables-du-mois';
import { mesPourboires, serieMoisParMois, tableauDeLEquipe, totauxDe, type PartDePourboire } from '../src/shared/pourboires-de-l-equipe-pur';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)?.slice(0, 300)}\n       obtenu  ${JSON.stringify(obtenu)?.slice(0, 300)}`}`));
};
const PANNE: { fichier: string; avant: string; apres: string } | null = process.env.PANNE_TEXTE ? JSON.parse(process.env.PANNE_TEXTE) : null;
const lis = (f: string): string => {
  const t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  return PANNE && PANNE.fichier === f ? t.split(PANNE.avant).join(PANNE.apres) : t;
};

/* ── 1. Les exemples de Y. ───────────────────────────────────────────── */
dit('4 nov. 2026 -> 2026-10 (paye le 5 nov.) ; 7 nov. -> 2026-11 (paye le 5 dec.)', ['2026-10', '2026-11'],
  [periodeDesPourboires('2026-11-04'), periodeDesPourboires('2026-11-07')]);
dit('les bornes de novembre : 5 nov. -> 2026-10, 6 nov. -> 2026-11', ['2026-10', '2026-11'],
  [periodeDesPourboires('2026-11-05'), periodeDesPourboires('2026-11-06')]);
dit('3 janv. 2027 -> 2026-12 (janvier retombe sur decembre de l annee d avant)', '2026-12', periodeDesPourboires('2027-01-03'));
dit('le 31 dec. et le 1er janv. : meme periode 2026-12 ; le 5 janv. aussi ; le 6 janv. ouvre 2027-01',
  ['2026-12', '2026-12', '2026-12', '2027-01'],
  [periodeDesPourboires('2026-12-31'), periodeDesPourboires('2027-01-01'), periodeDesPourboires('2027-01-05'), periodeDesPourboires('2027-01-06')]);
dit('le 1er janvier 2026 -> 2025-12', '2025-12', periodeDesPourboires('2026-01-01'));
dit('l instant complet (ISO avec heure) se range comme son jour', ['2026-10', '2026-11'],
  [periodeDesPourboires('2026-11-05T23:59:59.000Z'), periodeDesPourboires('2026-11-06T00:00:00.000Z')]);
dit('une date illisible n entre dans aucune periode', ['', '', '', ''],
  [periodeDesPourboires(''), periodeDesPourboires(undefined), periodeDesPourboires('2026-13-10'), periodeDesPourboires('hier')]);

/* Les bornes de chaque mois de 2026 : le 5 est du mois d'avant, le 6 du mois. */
const MOIS12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const avant = (a: number, m: number) => (m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`);
dit('chaque mois de 2026 : le 5 est de la periode d avant, le 6 de la sienne, le 1er aussi d avant, le 28 de la sienne',
  true, MOIS12.every((mm, i) => {
    const m = i + 1; const mois = `2026-${mm}`;
    return periodeDesPourboires(`${mois}-05`) === avant(2026, m) && periodeDesPourboires(`${mois}-06`) === mois
      && periodeDesPourboires(`${mois}-01`) === avant(2026, m) && periodeDesPourboires(`${mois}-28`) === mois;
  }));

/* ── 2. Rien perdu, rien compte deux fois ────────────────────────────── */
const jours: string[] = [];
for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2027, 2, 31); t += 86_400_000) jours.push(new Date(t).toISOString().slice(0, 10));
const TIPS: PartDePourboire[] = [];
jours.forEach((d, i) => {
  TIPS.push({ id: `a-${i}`, staffId: 'st-a', amountXof: 100 + (i * 37) % 900, date: d });
  if (i % 3 === 0) TIPS.push({ id: `b-${i}`, staffId: 'st-b', amountXof: 50 + (i * 11) % 400, date: d });
});
const TOTAL = TIPS.reduce((n, t) => n + t.amountXof, 0);
const parPeriode = new Map<string, number>();
for (const t of TIPS) { const p = periodeDesPourboires(t.date); parPeriode.set(p, (parPeriode.get(p) ?? 0) + t.amountXof); }
const lesPeriodes = [...parPeriode.keys()].sort();
dit('la somme sur toutes les periodes = la somme de tous les pourboires (455 jours, deux personnes)', TOTAL,
  [...parPeriode.values()].reduce((a, b) => a + b, 0));
dit('16 periodes, de 2025-12 a 2027-03', ['2025-12', 16, '2027-03'], [lesPeriodes[0], lesPeriodes.length, lesPeriodes[lesPeriodes.length - 1]]);
dit('les periodes se suivent sans trou ni doublon', true, lesPeriodes.every((p, i, l) => i === 0 || periodeAvant(p) === l[i - 1]));
dit('pourboiresDuMois, additionne sur les periodes, redonne le total de chaque personne',
  [TIPS.filter((t) => t.staffId === 'st-a').reduce((n, t) => n + t.amountXof, 0), TIPS.filter((t) => t.staffId === 'st-b').reduce((n, t) => n + t.amountXof, 0)],
  ['st-a', 'st-b'].map((s) => lesPeriodes.reduce((n, p) => n + pourboiresDuMois(TIPS, s, p), 0)));
dit('totauxDe au 4 nov. : la periode en cours (2026-10) et celle d avant (2026-09)', true, (() => {
  const t = totauxDe(TIPS.filter((x) => x.staffId === 'st-a'), '2026-11-04');
  const att = (p: string) => TIPS.filter((x) => x.staffId === 'st-a' && periodeDesPourboires(x.date) === p).reduce((n, x) => n + x.amountXof, 0);
  return t.mois === att('2026-10') && t.moisPrecedent === att('2026-09');
})());
const dernieres12 = TIPS.filter((t) => periodeDesPourboires(t.date) >= '2026-04');
dit('la serie periode par periode : douze periodes, somme = les pourboires de ces periodes', [12, dernieres12.reduce((n, t) => n + t.amountXof, 0)],
  (() => { const s = serieMoisParMois(dernieres12, '2027-03-20'); return [s.length, s.reduce((n, x) => n + x.total, 0)]; })());
dit('le tableau de l equipe : la somme des colonnes (six periodes) = ce que ces periodes contiennent', true, (() => {
  const t = tableauDeLEquipe(TIPS, [{ id: 'st-a', name: 'A', partPourboire: 1 }, { id: 'st-b', name: 'B', partPourboire: 1 }], '2027-03-20', { moisMax: 6 });
  const somme = t.total.parMois.reduce((a, b) => a + b, 0);
  return t.colonnes.length === 6 && somme === TIPS.filter((x) => t.colonnes.includes(periodeDesPourboires(x.date))).reduce((n, x) => n + x.amountXof, 0);
})());

/* ── 3. La paie et la page des paiements disent la meme chose ────────── */
const primes = {}; const retenues = {};
dit('variablesDuMois et pourboiresDuMois : le meme total, pour chaque periode et chaque personne', true,
  lesPeriodes.every((p) => ['st-a', 'st-b'].every((s) => {
    const v = variablesDuMois({ staffId: s, period: p, primes, retenues, tips: TIPS });
    return v.pourboires === pourboiresDuMois(TIPS, s, p);
  })));
dit('... et la somme des totaux de variablesDuMois sur toutes les periodes = tous les pourboires', TOTAL,
  ['st-a', 'st-b'].reduce((n, s) => n + lesPeriodes.reduce((m, p) => m + variablesDuMois({ staffId: s, period: p, primes, retenues, tips: TIPS }).pourboires, 0), 0));
dit('le bulletin de 2026-10 (paye le 5 nov.) porte 575 F, celui de 2026-11 porte 1 000 F', [575, 1000], (() => {
  const t: PartDePourboire[] = [
    { id: '1', staffId: 'st-a', amountXof: 375, date: '2026-11-04' }, { id: '2', staffId: 'st-a', amountXof: 200, date: '2026-10-07' },
    { id: '4', staffId: 'st-a', amountXof: 1000, date: '2026-11-07' },
  ];
  return ['2026-10', '2026-11'].map((p) => variablesDuMois({ staffId: 'st-a', period: p, primes, retenues, tips: t }).pourboires);
})());
dit('les pourboires du 4 nov. 2026 (375 F et 500 F) tombent dans 2026-10, jamais dans 2026-11', [[375, 500], [0, 0]], (() => {
  const t: PartDePourboire[] = [{ id: 'x', staffId: 'anne', amountXof: 375, date: '2026-11-04' }, { id: 'y', staffId: 'ranti', amountXof: 500, date: '2026-11-04' }];
  return [[pourboiresDuMois(t, 'anne', '2026-10'), pourboiresDuMois(t, 'ranti', '2026-10')], [pourboiresDuMois(t, 'anne', '2026-11'), pourboiresDuMois(t, 'ranti', '2026-11')]];
})());
dit('une prime et une retenue restent au mois civil de leur date (seuls les pourboires changent)', [100, 40], (() => {
  const v = variablesDuMois({
    staffId: 'st-a', period: '2026-11', tips: [],
    primes: { 'st-a': [{ id: 'p', type: 'autre', amountXof: 100, date: '2026-11-03' } as never] },
    retenues: { 'st-a': [{ id: 'r', type: 'autre', amountXof: 40, date: '2026-11-03' } as never] },
  });
  return [v.prime, v.retenues];
})());

/* ── 4. Les mots ─────────────────────────────────────────────────────── */
dit('les libelles de 2026-11 : du 6 nov. au 4 dec. ; payes le 5 dec.', ['6 nov. au 4 déc.', 'du 6 nov. au 4 déc.', 'Pourboires du 6 nov. au 4 déc.', 'payés le 5 déc.', '6 nov.'],
  [periodeTitre('2026-11'), periodeDite('2026-11'), pourboiresDuDit('2026-11'), payesLeDit('2026-11'), periodeCourte('2026-11')]);
dit('decembre passe a janvier : du 6 dec. au 4 janv., payes le 5 janv.', ['du 6 déc. au 4 janv.', 'payés le 5 janv.'], [periodeDite('2026-12'), payesLeDit('2026-12')]);
dit('2026-10 : du 6 oct. au 4 nov., payes le 5 nov.', ['du 6 oct. au 4 nov.', 'payés le 5 nov.'], [periodeDite('2026-10'), payesLeDit('2026-10')]);
dit('aucun tiret long dans les libelles', false, [periodeTitre('2026-11'), pourboiresDuDit('2026-12'), payesLeDit('2026-01')].some((s) => s.includes('—')));
dit('la periode d avant : janvier 2027 -> decembre 2026 ; trois avant decembre -> septembre', ['2026-12', '2026-09'], [periodeAvant('2027-01'), periodeAvant('2026-12', 3)]);

/* ── 5. Plus aucun regroupement de pourboires par mois civil ─────────── */
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PAIEMENTS = sansCommentaires(lis('src/shared/les-paiements-pur.ts'));
const VARIABLES = sansCommentaires(lis('src/apps/trone/routes/equipe/variables-du-mois.ts'));
const PERSONNEL = sansCommentaires(lis('src/apps/trone/routes/equipe/Personnel.tsx'));
const EQUIPE = sansCommentaires(lis('src/shared/pourboires-de-l-equipe-pur.ts'));
dit('pourboiresDuMois range par la periode', true, PAIEMENTS.includes('periodeDesPourboires(p.date) === periode'));
dit('variablesDuMois range les pourboires par la periode', true, VARIABLES.includes('periodeDesPourboires(t.date) === o.period'));
dit('Personnel (variables, bulletin PDF, detail annuel) range par la periode', true, PERSONNEL.includes('t.staffId === id && periodeDesPourboires(t.date) === month'));
dit('la regle des pourboires de l equipe (totaux, tableau, serie, fil) passe par le meme juge', [true, true],
  [EQUIPE.includes('export const moisDe = (d: string | undefined): string => periodeDesPourboires(d);'), (EQUIPE.match(/moisDe\(/g) ?? []).length >= 5]);
dit('totauxDe : la periode en cours et celle d avant viennent du juge', true, /const mois = moisDe\(aujourdhui\);\n  const avant = moisAvant\(mois\);/.test(EQUIPE));
dit('Mon mois au 4 nov. : la periode en cours est 2026-10, celle d avant 2026-09', ['2026-10', '2026-09'], (() => { const m = mesPourboires(TIPS, 'st-a', '2026-11-04'); return [m.mois, m.moisPrecedent]; })());
dit('... et au 6 nov. : 2026-11 et 2026-10', ['2026-11', '2026-10'], (() => { const m = mesPourboires(TIPS, 'st-a', '2026-11-06'); return [m.mois, m.moisPrecedent]; })());

/* ── 6. Les ecrans disent la periode, plus « novembre 2026 » ─────────── */
const MES = sansCommentaires(lis('src/apps/trone/routes/equipe/MesPourboires.tsx'));
const PAGE = sansCommentaires(lis('src/apps/trone/routes/equipe/Pourboires.tsx'));
const DASH = sansCommentaires(lis('src/apps/trone/routes/pilotage/Dashboard.tsx'));
const LP = sansCommentaires(lis('src/apps/trone/routes/equipe/LesPaiements.tsx'));
dit('Mes pourboires : « du 6 nov. au 4 dec., payes le 5 dec. », la case d avant dit sa periode', [true, true, false],
  [MES.includes('Mes pourboires · {periodeDite(mes.mois)}, {payesLeDit(mes.mois)}'), MES.includes('<span>{pourboiresDuDit(mes.moisPrecedent)}</span>'), /moisDit\(|moisTitre\(/.test(MES)]);
dit('Aujourd hui et Cette semaine restent inchangees', [true, true], [MES.includes('<span>Aujourd’hui</span>'), MES.includes('<span>Cette semaine</span>')]);
dit('Les pourboires (direction) : colonnes, barres, detail et fil disent la periode', [true, false], [
  PAGE.includes('>{periodeTitre(c)}</button>') && PAGE.includes('pourboiresDuDit(s.mois)') && PAGE.includes('${pourboiresDuDit(moisChoisi)}, ${payesLeDit(moisChoisi)}'),
  /moisDit\(|moisTitre\(|moisCourt\(/.test(PAGE)]);
dit('le Tableau de bord dit la periode (carte de l equipe et ligne de la direction)', [true, true, false], [
  DASH.includes('l: pourboiresDuDit(periodeDesPourboires(today))'), DASH.includes('{pourboiresDuDit(periodeDesPourboires(today))} (équipe)'), DASH.includes('Pourboires ${nomDuMois(today.slice(0, 7))}')]);
dit('Les paiements disent la periode et le jour du paiement', [true, true], [
  LP.includes('{pourboiresDuDit(periode)} · espèces, {payesLeDit(periode)}'), LP.includes('{payesLeDit(periode)} · {c.pourboiresRemis}')]);

console.log(ko === 0 ? '\nLa periode des pourboires tient.' : `\n${ko} controle(s) en echec.`);
