/* LE CALENDRIER DIT L'IMPAYÉ — `node scripts/verifie-le-calendrier-dit-l-impaye.mjs`.

   25 octobre 2026, Yéman : « je ne retrouve pas le RDV du client Brice dans
   calendrier, il a pourtant un impayé ». Le Calendrier pâlissait tout rituel
   honoré et lui retirait « Encaisser » : honoré mais pas réglé, il devenait
   presque invisible. La règle : un rituel honoré ne pâlit que s'il ne doit
   plus rien ; sinon il se marque en cuivre, dit son reste et garde son
   bouton, dans les quatre vues (jour, téléphone, semaine, mois). Le juge est
   celui du Carnet (apptPayState). Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const brut = readFileSync(path.join(racine, 'src/apps/trone/routes/clients/Calendrier.tsx'), 'utf8');
const css = readFileSync(path.join(racine, 'src/apps/trone/routes/clients/clients.css'), 'utf8');
const code = brut.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let ko = 0;
let n = 0;
const dit = (nom, attendu, obtenu) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${JSON.stringify(obtenu)} (attendu ${JSON.stringify(attendu)})`}`);
};

dit('le juge : impaye ou partiel, celui du Carnet', true,
  /const doitEncore = \(a: Appointment\) => \{ const e = apptPayState\(a, byId\); return e === 'impayé' \|\| e === 'partiel'; \};/.test(code));
dit('un rituel honore ne palit que s il ne doit plus rien', true,
  /const estEfface = \(a: Appointment\) => a\.status === 'honoré' && !doitEncore\(a\);/.test(code));
dit('... et plus aucune vue ne palit un rituel sur son seul statut', 0,
  (code.match(/a\.status === 'honoré' \? '(is-muted|trc-cal__appt--muted)'/g) ?? []).length);
dit('les quatre vues palissent par estEfface et marquent le du en cuivre', [true, true, true, true],
  [/estEfface\(a\) \? 'is-muted' : ''\} \$\{honoreDu\(a\) \? 'is-du' : ''\}`\}\s*onClick=\{\(\) => setEditAppt/.test(code),
    /estEfface\(a\) \? 'trc-cal__appt--muted' : honoreDu\(a\) \? 'trc-cal__appt--du'/.test(code),
    /honoreDu\(a\) \? 'trc-week__chip--du' : ''/.test(code),
    /trc-month__chip trc-month__chip--drag \$\{estEfface\(a\) \? 'is-muted' : ''\} \$\{honoreDu\(a\) \? 'is-du' : ''\}/.test(code)]);
dit('le reste se dit au jour et au telephone, sans prix pour qui ne les voit pas', [2, true],
  [(code.match(/\{honoreDu\(a\) && <span className="trc-cal__reste">\{resteDit\(a\)\}<\/span>\}/g) ?? []).length,
    /const resteDit = \(a: Appointment\) => \(estMaitre \? 'à encaisser' : `reste \$\{fmtMoney\(apptDueXof\(a, byId\), currency\)\}`\);/.test(code)]);
dit('Encaisser reste sur un rituel honore qui doit encore, au jour et au telephone', [2, 0, true],
  [(code.match(/\{aEncaisser\(a\) && \(/g) ?? []).length,
    (code.match(/a\.status !== 'honoré' && apptPayState\(a, byId\) !== 'payé'/g) ?? []).length,
    /const aEncaisser = \(a: Appointment\) => \(a\.status === 'honoré' \? doitEncore\(a\) : apptPayState\(a, byId\) !== 'payé'\);/.test(code)]);
dit('le cuivre existe dans la feuille, et il ne palit pas', [true, true, true, true, false],
  ['.trc-cal__appt--du', '.trc-month__chip.is-du', '.trc-agenda__row.is-du', '.trc-week__chip--du'].map((c) => css.includes(c))
    .concat(/\.trc-cal__appt--du \{[^}]*opacity/.test(css)));

console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nLe calendrier dit l impaye (${n} controles).`);
