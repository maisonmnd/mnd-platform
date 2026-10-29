/* LES HEURES DES RAPPELS, EPROUVEES — `node scripts/verifie-les-heures-des-rappels.mjs`.

   « Redonne-moi la ou je dois aller pour regler les parametres des relances
   de rendez-vous » (Yeman, 29 octobre 2026). Les heures du rappel de la
   veille se reglent au Marketing, vivent dans `mnd_auto_config`, et
   `rappels-j1`, reveillee chaque heure, ne passe qu'a elles.

   Ce harnais tient la regle (bornes, defaut, second passage), verifie que la
   fonction Edge porte la MEME regle que le depot (elle ne peut rien
   importer) et qu'elle se tait aux autres heures avant de rien envoyer, que
   le SQL remplace les deux anciens jobs par un job horaire, et que l'ecran
   enregistre les deux heures, pour la Direction seule. Puis il plante des
   pannes dans les textes et verifie que chacune est criee. */
import { readFileSync } from 'node:fs';
import {
  HEURES_DES_RAPPELS_PAR_DEFAUT, heuresDesRappels, passageDeLHeure, heuresDites, quandDuRappelDeLaVeille,
  heuresDuPremierEnvoi, heuresDuSecondPassage, heureDeDepartDite, ceQueRecoitLaCliente,
} from '../src/shared/heures-des-rappels-pur';
import { AUTOMATISATIONS_REELLES } from '../src/shared/automatisations-reelles-pur';

let ko = 0;
let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── 1. La regle ── */
dit('sans reglage : 18 h, puis 19 h avant les heures calmes', { premier: 18, second: 19 }, heuresDesRappels(undefined));
dit('le defaut est celui de la regle', HEURES_DES_RAPPELS_PAR_DEFAUT, heuresDesRappels({}));
dit('un reglage pose est suivi', { premier: 17, second: 19 }, heuresDesRappels({ rappelPremier: 17, rappelSecond: 19 }));
dit('ecrit en texte, il est suivi aussi', { premier: 15, second: 18 }, heuresDesRappels({ rappelPremier: '15', rappelSecond: '18' }));
dit('second passage a 0 : aucun', { premier: 18, second: null }, heuresDesRappels({ rappelPremier: 18, rappelSecond: 0 }));
dit('21 h pour le second passage : refuse (heures calmes)', { premier: 18, second: null }, heuresDesRappels({ rappelPremier: 18, rappelSecond: 21 }));
dit('21 h pour le premier envoi : le defaut', { premier: 18, second: 19 }, heuresDesRappels({ rappelPremier: 21 }));
dit('8 h pour le premier envoi : le defaut', 18, heuresDesRappels({ rappelPremier: 8 }).premier);
dit('une demi-heure : le defaut', 18, heuresDesRappels({ rappelPremier: 17.5 }).premier);
dit('du texte vide ou absurde : le defaut', [18, 18], [heuresDesRappels({ rappelPremier: '' }).premier, heuresDesRappels({ rappelPremier: 'x' }).premier]);
dit('un second passage avant le premier n existe pas', { premier: 18, second: null }, heuresDesRappels({ rappelPremier: 18, rappelSecond: 12 }));
dit('premier envoi a 19 h : pas de second passage par defaut', { premier: 19, second: null }, heuresDesRappels({ rappelPremier: 19 }));
dit('les heures proposees : 9 h a 19 h', [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], heuresDuPremierEnvoi());
dit('le second passage apres 17 h : 18 h et 19 h', [18, 19], heuresDuSecondPassage(17));
dit('apres 19 h : aucun second passage possible', [], heuresDuSecondPassage(19));

/* ── 2. Le passage de chaque heure ── */
{
  const h = { premier: 17, second: 19 };
  dit('a 17 h : le premier', 'premier', passageDeLHeure(17, h));
  dit('a 19 h : le second', 'second', passageDeLHeure(19, h));
  dit('a 18 h et 21 h : rien', [null, null], [passageDeLHeure(18, h), passageDeLHeure(21, h)]);
  dit('sans second passage, 19 h ne passe pas', null, passageDeLHeure(19, { premier: 17, second: null }));
}

/* ── 3. Ce que l ecran dit ── */
dit('les heures dites', ['18 h et 19 h', '18 h'], [heuresDites({ premier: 18, second: 19 }), heuresDites({ premier: 18, second: null })]);
dit('la ligne du Marketing', 'La veille du rendez-vous, 17 h et 19 h', quandDuRappelDeLaVeille({ premier: 17, second: 19 }));
dit('la liste des automatisations dit le defaut', quandDuRappelDeLaVeille(HEURES_DES_RAPPELS_PAR_DEFAUT), AUTOMATISATIONS_REELLES.find((a) => a.id === 'rappel-j1')?.quand);
dit('le depart apres la salle', ['18 h 10', '19 h', '9 h 05'], [heureDeDepartDite(18, 10), heureDeDepartDite(18, 60), heureDeDepartDite(9, 5)]);
dit('ce que recoit la cliente', {
  veille: 'Une cliente qui a rendez-vous demain reçoit son rappel aujourd’hui vers 17 h 10.',
  tardif: 'Un rendez-vous posé après 17 h pour le lendemain reçoit le sien au second passage, vers 19 h 10.',
}, ceQueRecoitLaCliente({ premier: 17, second: 19 }, 10));
dit('sans second passage, la phrase le dit', 'Un rendez-vous posé après 18 h pour le lendemain n’a pas de rappel : il n’y a pas de second passage.',
  ceQueRecoitLaCliente({ premier: 18, second: null }, 10).tardif);

/* ── 4. Les textes : la fonction, le SQL, l ecran ── */
type Textes = { pur: string; edge: string; sql: string; ui: string; auto: string };
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const VRAIS: Textes = {
  pur: lis('src/shared/heures-des-rappels-pur.ts'),
  edge: lis('supabase/functions/rappels-j1/index.ts'),
  sql: lis('supabase/migrations/0143_les_rappels_chaque_heure.sql'),
  ui: lis('src/apps/trone/routes/equipe/MarketingBranche.tsx'),
  auto: lis('src/shared/automatisations-reelles-pur.ts'),
};
const DEBUT = '/* ══ COPIE DANS rappels-j1 : DÉBUT ══ */';
const FIN = '/* ══ COPIE DANS rappels-j1 : FIN ══ */';
const bloc = (t: string): string => {
  const a = t.indexOf(DEBUT);
  const b = t.indexOf(FIN);
  return a < 0 || b < a ? `INTROUVABLE` : t.slice(a, b + FIN.length).replace(/^export /gm, '').replace(/\s+/g, ' ').trim();
};
const egal = (t: string) => t.replace(/\s+/g, ' ');

/** Les controles des textes : la liste de ceux qui tombent. */
function controles(t: Textes): string[] {
  const tombes: string[] = [];
  const exige = (nom: string, ok: boolean) => { if (!ok) tombes.push(nom); };
  const e = egal(t.edge);
  /* La fonction porte la regle a l identique. */
  exige('la fonction porte la regle du depot, a l identique', bloc(t.pur) !== 'INTROUVABLE' && bloc(t.pur) === bloc(t.edge));
  /* Elle lit les heures dans les reglages de la Maison, a l heure du salon. */
  exige('la fonction lit les heures dans mnd_auto_config', /from\('documents'\)\.select\('data'\)\.eq\('key', 'mnd_auto_config'\)\.maybeSingle\(\);/.test(e)
    && /const heures = heuresDesRappels\(reglage\?\.data/.test(e));
  exige('la fonction compte a l heure du salon', /const heureDeCePassage = Math\.floor\(heureDuSalon\(Date\.now\(\)\)\);/.test(e)
    && /const passage = passageDeLHeure\(heureDeCePassage, heures\);/.test(e));
  exige('hors de ses heures, la fonction s arrete', /if \(!passage\) \{ return new Response\(JSON\.stringify\(\{ version: VERSION, passage: null,/.test(e));
  /* La porte des heures vient apres la cle, et avant tout ce qui ecrit ou envoie. */
  const porte = e.indexOf('const passage = passageDeLHeure(');
  const cle = e.indexOf("erreur: 'réservé au cron'");
  const premiersGestes = ['proposeLesReprises(sb', 'poseLesPointsDEtape(sb', ".from('appointments')", 'fetch('].map((m) => {
    const appel = e.indexOf(m, e.indexOf('Deno.serve('));
    return appel;
  });
  exige('la porte des heures vient apres la cle du cron', cle >= 0 && porte > cle);
  exige('aucune reprise, aucun point, aucun rendez-vous lu, aucun envoi avant la porte', porte > 0 && premiersGestes.every((i) => i < 0 || i > porte));
  exige('la version dit le 29 octobre', /const VERSION = '2026-10-29-[a-z] · les heures des rappels/.test(e));
  /* Le SQL : un job horaire, les anciens retires, la fonction d abord. */
  const s = egal(t.sql);
  exige('le SQL retire les anciens jobs du rappel', /select cron\.unschedule\(jobid\) from cron\.job where command ilike '%rappels_j1%' or command ilike '%rappels-j1%';/.test(s));
  exige('le SQL pose un job chaque heure pile', /select cron\.schedule\('rappels-j1-chaque-heure', '0 \* \* \* \*', \$\$select public\.rappels_j1_soir_sql\(\);\$\$\);/.test(s));
  exige('le SQL dit de coller la fonction d abord', /APRÈS la fonction rappels-j1 du 29 octobre 2026/.test(s) && /JAMAIS avant/.test(s));
  /* L ecran : la ligne dit les heures en place, le panneau enregistre les deux, pour la Direction seule. */
  const u = egal(t.ui);
  exige('la ligne du Marketing dit les heures en place', /a\.id === 'rappel-j1' \? quandDuRappelDeLaVeille\(heuresEnPlace\) : a\.quand/.test(u)
    && /const heuresEnPlace = heuresDesRappels\(autoCfg\);/.test(u));
  exige('le panneau enregistre les deux heures', /setAutoCfg\(\{ \.\.\.autoCfg, rappelPremier: brouillon\.premier, rappelSecond: brouillon\.second \?\? 0 \}\);/.test(u));
  exige('seule la Direction change les heures', (u.match(/disabled=\{!direction\}/g) ?? []).length === 2
    && /\{direction \? \( <> <Button onClick=\{enregistre\}/.test(u) && /const direction = useEstDirection\(\);/.test(u));
  exige('le panneau s ouvre sous la ligne du rappel de la veille', /\{a\.id === 'rappel-j1' && heuresOuvertes && \( <ReglageDesHeuresDesRappels/.test(u));
  exige('la liste des automatisations ne dit plus 21 h', !/18 h et 21 h/.test(t.auto));
  return tombes;
}

dit('les vrais textes passent tous les controles', [], controles(VRAIS));

/* ── 5. Les pannes plantees : chacune doit etre criee ── */
const PANNES: [string, keyof Textes, string, string][] = [
  ['la copie du serveur accepte 21 h', 'edge', 'const DERNIERE_HEURE_DES_RAPPELS = 19;', 'const DERNIERE_HEURE_DES_RAPPELS = 21;'],
  ['la copie du serveur garde 21 h par defaut', 'edge', '{ premier: 18, second: 19 }', '{ premier: 18, second: 21 }'],
  ['le serveur passe a toute heure', 'edge', 'if (!passage) {', 'if (false) {'],
  ['le serveur compte en heure UTC', 'edge', 'Math.floor(heureDuSalon(Date.now()))', 'new Date().getUTCHours()'],
  ['les reprises partent avant la porte', 'edge', "  const { data: reglage } = await sb.from('documents')", "  await proposeLesReprises(sb, false, REGLES_PAR_DEFAUT);\n  const { data: reglage } = await sb.from('documents')"],
  ['le serveur ne lit pas le reglage', 'edge', "heuresDesRappels(reglage?.data", 'heuresDesRappels(undefined'],
  ['la version n a pas bouge', 'edge', "const VERSION = '2026-10-29-a", "const VERSION = '2026-10-28-a"],
  ['le SQL garde le job de 21 h', 'sql', "'0 * * * *'", "'0 20 * * *'"],
  ['le SQL laisse les anciens jobs', 'sql', 'select cron.unschedule(jobid)', 'select jobid'],
  ['le SQL oublie de dire la fonction d abord', 'sql', 'JAMAIS avant', 'peu importe l ordre'],
  ['l ecran n enregistre pas le second passage', 'ui', ', rappelSecond: brouillon.second ?? 0 }', ' }'],
  ['tout le monde regle les heures', 'ui', 'disabled={!direction}', 'disabled={false}'],
  ['la ligne du Marketing garde son texte fige', 'ui', "a.id === 'rappel-j1' ? quandDuRappelDeLaVeille(heuresEnPlace) : a.quand", 'a.quand'],
  ['le panneau ne s ouvre jamais', 'ui', "{a.id === 'rappel-j1' && heuresOuvertes && (", '{false && ('],
  ['la liste dit encore 21 h', 'auto', "quand: 'La veille du rendez-vous, 18 h et 19 h'", "quand: 'La veille du rendez-vous, 18 h et 21 h'"],
];
let criees = 0;
for (const [nom, ou, de, vers] of PANNES) {
  const t = { ...VRAIS };
  if (!t[ou].includes(de)) { dit(`panne « ${nom} » : le texte a planter existe`, true, false); continue; }
  t[ou] = t[ou].replace(de, vers);
  const tombes = controles(t);
  if (tombes.length > 0) criees++;
  dit(`panne « ${nom} » criee`, true, tombes.length > 0);
}

console.log(`\n${n} controles, ${ko} en echec ; ${criees} pannes criees sur ${PANNES.length}.`);
if (ko > 0) process.exitCode = 1;
