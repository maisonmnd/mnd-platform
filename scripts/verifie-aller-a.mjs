import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* DANS TROIS SEMAINES, ÉPROUVÉ — 14 novembre 2026.
   « Jump to a date from today et se retrouver facilement » (Yéman). Ce banc
   éprouve la règle pure (`routes/clients/aller-a-pur.ts`) : le lecteur des
   phrases d'une cliente, la distance dite, les sauts rapides, la garde de
   Trouver, le remplissage des fauteuils et le fil des seize semaines. Puis il
   lit le branchement : le Calendrier, le « + RDV » et Trouver.
   `--prouve` plante des pannes dans une COPIE du module (dossier temporaire,
   aucun fichier du dépôt touché) et exige que chacune fasse crier le banc.
   Lance : node scripts/verifie-aller-a.mjs [--prouve]
   Aujourd'hui y est figé au samedi 14 novembre 2026. */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const SOURCE = 'src/apps/trone/routes/clients/aller-a-pur.ts';
const d = mkdtempSync(path.join(tmpdir(), 'aller-a-'));

async function charge(source, nom) {
  const ts = path.join(d, `${nom}.ts`);
  const out = path.join(d, `${nom}.mjs`);
  writeFileSync(ts, source);
  await build({ entryPoints: [ts], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
}

const AUJ = '2026-11-14'; // un samedi

function eprouve(m) {
  const fautes = [];
  const egal = (nom, obtenu, attendu) => {
    const a = JSON.stringify(obtenu); const b = JSON.stringify(attendu);
    if (a !== b) fautes.push(`${nom} : obtenu ${a}, attendu ${b}`);
  };
  const vrai = (nom, cond) => { if (!cond) fautes.push(nom); };
  const iso = (t) => m.lisLeSaut(t, AUJ)?.iso ?? null;

  /* Le lecteur, phrase par phrase. */
  const PHRASES = [
    ['3s', '2026-12-05'], ['dans 3 semaines', '2026-12-05'], ['3 sem', '2026-12-05'], ['+10j', '2026-11-24'],
    ['3 jours', '2026-11-17'], ['2 mois', '2027-01-14'], ['dans 1 mois', '2026-12-14'],
    ['aujourd’hui', AUJ], ["aujourd'hui", AUJ], ['demain', '2026-11-15'], ['après-demain', '2026-11-16'],
    ['samedi', '2026-11-21'], ['samedi prochain', '2026-11-21'], ['lundi', '2026-11-16'], ['Mardi', '2026-11-17'],
    ['samedi en huit', '2026-11-28'], ['jeudi en quinze', '2026-12-03'],
    ['jeudi dans 3 semaines', '2026-12-03'], ['dans 3 semaines jeudi', '2026-12-03'],
    ['le 12', '2026-12-12'], ['14', AUJ], ['31', '2026-12-31'],
    ['12/12', '2026-12-12'], ['12-12-26', '2026-12-12'], ['12/12/2026', '2026-12-12'], ['1/1', '2027-01-01'],
    ['13/11', '2027-11-13'], ['15 janv', '2027-01-15'], ['15 janvier 2027', '2027-01-15'], ['3 mars', '2027-03-03'],
    ['2 sept', '2027-09-02'], ['12 déc.', '2026-12-12'],
    ['mi-décembre', '2026-12-15'], ['fin janvier', '2027-01-25'], ['début décembre', '2026-12-01'],
    ['fin de janvier', '2027-01-25'], ['fin du mois', '2026-11-25'], ['fin novembre', '2026-11-25'], ['janvier', '2027-01-01'], ['semaine prochaine', '2026-11-16'],
    ['samedi 12', '2026-12-12'], ['samedi 12/12', '2026-12-12'],
  ];
  for (const [t, attendu] of PHRASES) egal(`« ${t} »`, iso(t), attendu);
  for (const t of ['', '   ', 'Mariette', 'blabla', '45', '31/02', '29/02', '0/12', 'dans trois semaines']) egal(`« ${t} » ne se lit pas`, iso(t), null);

  /* Le jour tapé est relu contre la date. */
  const faux = m.lisLeSaut('vendredi 12 décembre', AUJ);
  egal('« vendredi 12 décembre » ouvre le 12', faux?.iso, '2026-12-12');
  vrai('« vendredi 12 décembre » est signalé : le 12 est un samedi', /samedi, pas un vendredi/.test(faux?.avertit ?? ''));
  egal('« samedi 12/12 » ne se signale pas', m.lisLeSaut('samedi 12/12', AUJ)?.avertit ?? null, null);

  /* La distance dite. */
  const DIST = [
    [AUJ, 'aujourd’hui'], ['2026-11-15', 'demain'], ['2026-11-16', 'après-demain'], ['2026-11-13', 'hier'],
    ['2026-11-24', 'dans 10 jours'], ['2026-12-05', 'dans 3 semaines'], ['2026-12-03', 'dans 2 semaines et 5 jours'],
    ['2027-01-09', 'dans 8 semaines'], ['2027-01-14', 'dans 2 mois'], ['2027-01-25', 'dans 2 mois et demi'],
    ['2027-02-14', 'dans 3 mois'], ['2026-11-11', 'il y a 3 jours'], ['2026-10-17', 'il y a 4 semaines'],
  ];
  for (const [j, attendu] of DIST) egal(`distance de ${j}`, m.distanceDite(j, AUJ), attendu);
  egal('semaine en cours', m.distanceDeLaSemaine('2026-11-10', AUJ), 'cette semaine');
  egal('semaine prochaine', m.distanceDeLaSemaine('2026-11-22', AUJ), 'la semaine prochaine');
  egal('semaine du 7 décembre', m.distanceDeLaSemaine('2026-12-10', AUJ), 'dans 4 semaines');
  egal('semaine dernière', m.distanceDeLaSemaine('2026-11-03', AUJ), 'la semaine dernière');
  egal('mois en cours', m.distanceDuMois('2026-11-30', AUJ), 'ce mois-ci');
  egal('mois prochain', m.distanceDuMois('2026-12-01', AUJ), 'le mois prochain');
  egal('février', m.distanceDuMois('2027-02-10', AUJ), 'dans 3 mois');
  egal('date dite', m.dateDite('2026-12-12'), 'samedi 12 décembre 2026');
  egal('date dite du 1er', m.dateDite('2027-01-01'), 'vendredi 1er janvier 2027');
  egal('date courte', m.dateCourte('2026-12-12'), 'sam. 12 déc.');

  /* Les sauts partent d'aujourd'hui (arbitrage 2). */
  egal('les sauts rapides', m.sautsRapides(AUJ).map((s) => `${s.libelle}=${s.iso}`), [
    `Aujourd’hui=${AUJ}`, '+1 sem=2026-11-21', '+2 sem=2026-11-28', '+3 sem=2026-12-05', '+4 sem=2026-12-12',
    '+6 sem=2026-12-26', '+8 sem=2027-01-09', '+3 mois=2027-02-14',
  ]);
  egal('+1 mois au 31 janvier tombe le 28 février', m.ajouteMois('2027-01-31', 1), '2027-02-28');

  /* Trouver ne confond pas une cliente et une date (arbitrage 3). */
  for (const t of ['mar', 'Mariette', 'jeu', 'sam', 'fin', 'Samedi Adjovi']) egal(`Trouver « ${t} » n'est pas une date`, m.estUneDateSure(t, AUJ), null);
  for (const t of ['mardi', 'dans 3 semaines', '12/12', '3s', 'fin janvier', 'mi-decembre', 'samedi en huit', 'demain', 'le 12']) {
    vrai(`Trouver « ${t} » est une date`, !!m.estUneDateSure(t, AUJ));
  }

  /* Le remplissage des fauteuils. */
  const ouvert = { closed: false, openMin: 540, closeMin: 1140 };
  egal('3 h sur 2 fauteuils × 10 h', m.remplissageDuJour({ ouverture: ouvert, occupes: [{ debutMin: 540, dureeMin: 180 }], sieges: 2 }), 0.15);
  egal('ce qui déborde la fermeture ne compte pas', m.remplissageDuJour({ ouverture: ouvert, occupes: [{ debutMin: 1080, dureeMin: 180 }], sieges: 1 }), 0.1);
  egal('jamais plus que plein', m.remplissageDuJour({ ouverture: ouvert, occupes: [{ debutMin: 540, dureeMin: 600 }, { debutMin: 540, dureeMin: 600 }], sieges: 1 }), 1);
  egal('fermé : rien', m.remplissageDuJour({ ouverture: { ...ouvert, closed: true }, occupes: [], sieges: 2 }), null);
  egal('sans fauteuils dits : on ne devine pas', m.remplissageDuJour({ ouverture: ouvert, occupes: [], sieges: 0 }), null);

  /* Le fil des semaines (arbitrages 1 et 4). */
  const jour = (j) => {
    const r = m.rangDuJour(j);
    return {
      ferme: r === 6 || j === '2026-12-25',
      passe: j < AUJ,
      libres: j < AUJ ? 99 : 2,
      remplissage: j >= '2026-12-14' && j <= '2026-12-24' ? 0.9 : 0.4,
      note: j === '2026-12-25' ? 'Noël' : null,
    };
  };
  const fil = m.filDesSemaines({ aujourdhui: AUJ, jour, saDate: '2026-12-12' });
  egal('seize semaines', fil.length, 16);
  egal('le fil commence au lundi de cette semaine', fil[0].lundi, '2026-11-09');
  egal('les rangs', fil.slice(0, 3).map((s) => s.rang), [0, 1, 2]);
  egal('les jours passés ne comptent pas leurs places', fil[0].libres, 0 + 2 * 0 + 2); // seul le samedi 14 reste, le dimanche est fermé
  egal('une semaine pleine de places', fil[1].libres, 12);
  egal('le mois se lit sur le jeudi', fil.slice(0, 5).map((s) => s.mois), ['nov.', null, null, 'déc.', null]);
  vrai('la semaine du 14 décembre est presque pleine', fil.find((s) => s.lundi === '2026-12-14')?.presquePlein === true);
  vrai('la semaine du 16 novembre ne l’est pas', fil[1].presquePlein === false);
  egal('Noël se dit sur sa semaine', fil.find((s) => s.lundi === '2026-12-21')?.note, 'Noël');
  egal('sa date tombe dans une seule semaine', fil.filter((s) => s.sienne).map((s) => s.lundi), ['2026-12-07']);
  egal('le fil s’allonge jusqu’au saut', m.filDesSemaines({ aujourdhui: AUJ, jour, jusqua: '2027-06-01' }).length, 31);
  egal('et jamais au-delà de soixante', m.filDesSemaines({ aujourdhui: AUJ, jour, jusqua: '2031-01-01' }).length, 60);
  egal('sans fauteuils, pas de remplissage', m.filDesSemaines({ aujourdhui: AUJ, jour: (j) => ({ ...jour(j), remplissage: null }) })[1].remplissage, null);
  return fautes;
}

function branchement() {
  const fautes = [];
  const exige = (fichier, motif, nom) => { if (!motif.test(lis(fichier))) fautes.push(`${fichier} : ${nom}`); };
  const CAL = 'src/apps/trone/routes/clients/Calendrier.tsx';
  exige(CAL, /import \{ BarreDeSaut \} from '\.\/AllerA'/, 'la barre « Aller à » est importée');
  exige(CAL, /<BarreDeSaut[\s\S]*?id="calendrier-aller-a"/, 'la barre vit sous le haut du Calendrier');
  exige(CAL, /className="tr-distance">\{distance\}/, 'la distance se dit sous la date');
  exige(CAL, /!surAujourdhui && \([\s\S]{0,120}Aujourd’hui/, '« Aujourd’hui » paraît dès qu’on s’en éloigne');
  exige(CAL, /useEffect\(\(\) => \{\s*if \(!jourDemande\) return;\s*setAnchor\(jourDemande\)/, 'le jour demandé suit l’adresse');
  const RDV = 'src/apps/trone/routes/clients/_shared.tsx';
  exige(RDV, /<BarreDeSaut\s+id="rdv-aller-a"/, 'la barre vit dans « + RDV » › Quand');
  exige(RDV, /<FilDesSemaines\s+semaines=\{filDuRdv\}/, 'le fil vit dans « + RDV » › Quand');
  exige(RDV, /filDesSemaines\(\{[\s\S]{0,400}const p = placesDe\(iso\)/, 'le fil compte les places du même juge que la semaine');
  exige(RDV, /remplissageDuJour\(\{ ouverture: openingForIso\(iso\), occupes: occupesDe\(iso\), sieges \}\)/, 'le remplissage lit les fauteuils et l’ouverture');
  exige(RDV, /e\.date === iso && !e\.staffId && e\.note/, 'les fêtes viennent des exceptions d’horaires de la Maison');
  exige(RDV, /distanceDeLaSemaine\(debutSemaine, aujourdhui\)/, 'la semaine des places dit sa distance');
  exige(RDV, /saDate=\{!appt && reprise\?\.iso/, 'sa date vient du juge de sa fiche, à la création seulement');
  exige(RDV, /const ancre = ancreDeLaSemaine\(/, 'la semaine s’ouvre toujours sur aujourd’hui (24 octobre)');
  const TROUVER = 'src/apps/trone/shell/Trouver.tsx';
  exige(TROUVER, /peutVoir\(role, '\/calendrier', mesDomaines\)[\s\S]{0,200}estUneDateSure\(needle/, 'Trouver comprend les dates, derrière l’accès au Calendrier');
  exige(TROUVER, /navigate\(`\/calendrier\?jour=\$\{lu\.iso\}`\)/, 'Trouver ouvre le Calendrier sur ce jour');
  const BARRE = 'src/apps/trone/routes/clients/AllerA.tsx';
  exige(BARRE, /e\.key === 'Enter'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\)/, 'Entrée ne soumet jamais la fenêtre du rendez-vous');
  exige('public/maquette-dans-trois-semaines.html', /Quatre arbitrages, tranchés/, 'la maquette dit ses arbitrages tranchés');
  return fautes;
}

/* LES PANNES : chacune doit faire crier le banc. */
const PANNES = [
  ['« samedi » ouvre aujourd’hui quand on est samedi', 'for (let i = 1; i <= 7; i += 1) { const s = ajoute(apres, i);', 'for (let i = 0; i <= 7; i += 1) { const s = ajoute(apres, i);'],
  ['l’année ne passe plus à la suivante', 'if (cette && cette >= aujourdhui) return { iso: cette };', 'if (cette) return { iso: cette };'],
  ['la distance compte en semaines jusqu’à douze', 'if (a < 56 || (a < 63 && a % 7 === 0)) {', 'if (a < 84) {'],
  ['Trouver prend « mar » pour mardi', "return t.split(/\\s+/).every((mot) => MOTS_DU_CALENDRIER.has(mot)) ? r : null;", 'return r;'],
  ['le remplissage dépasse le plein', 'return Math.min(1, pris / (sieges * (closeMin - openMin)));', 'return pris / (sieges * (closeMin - openMin));'],
  ['les jours passés comptent leurs places', 'if (j.ferme || j.passe) continue;', 'if (j.ferme) continue;'],
  ['le jour tapé n’est plus relu', 'if (rangDuJour(r.iso) !== j) {', 'if (false) {'],
  ['le fil voit douze semaines', 'export const FIL_SEMAINES = 16;', 'export const FIL_SEMAINES = 12;'],
  ['les semaines sautent le mois', "const n = Number(m[1]); const u = (m[2] ?? '')[0];", "const n = Number(m[1]); const u = (m[2] ?? '')[0] === 's' ? 'm' : (m[2] ?? '')[0];"],
];

try {
  const source = lis(SOURCE);
  const m = await charge(source, 'vrai');
  const fautes = [...eprouve(m), ...branchement()];
  if (fautes.length) {
    console.log(`ALLER À · ${fautes.length} faute(s) :`);
    for (const f of fautes) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log('ALLER À · le lecteur, la distance, les sauts, Trouver, le remplissage, le fil et le branchement tiennent.');
  }
  if (process.argv.includes('--prouve')) {
    let prises = 0;
    for (const [i, [nom, avant, apres]] of PANNES.entries()) {
      if (!source.includes(avant)) { console.log(`  ? panne introuvable : ${nom}`); process.exitCode = 1; continue; }
      const p = await charge(source.replace(avant, apres), `panne-${i}`);
      const cris = eprouve(p);
      if (cris.length) prises += 1; else { console.log(`  ✗ panne silencieuse : ${nom}`); process.exitCode = 1; }
    }
    console.log(`--prouve : ${prises}/${PANNES.length} pannes font crier le banc.`);
  }
} finally {
  rmSync(d, { recursive: true, force: true });
}
