/* LE « OUI » DE PERLE QUI RÉSERVE, ÉPROUVÉ — `node scripts/verifie-le-oui-de-perle.mjs`.

   18 novembre 2026, l'agent des rendez-vous, lot 3 (choix de Yéman : « un
   toucher, rien à choisir »). Trois temps :
     ① PERLE ÉCRIT SA PROPOSITION sur la ligne de ses messages « avant » et
        « place » : son rituel habituel (jamais une création), le jour de sa
        cadence et son heure, ou les deux places dites dans le message ;
     ② L'AUTOMATE la relit sans confiance et choisit les places à essayer :
        jamais aujourd'hui, dans l'ordre du message, ou le jour dit et les six
        suivants, l'heure la plus proche de la sienne d'abord (la VRAIE
        fonction whatsapp-automate, ses imports `npm:` simulés) ;
     ③ LE BRANCHEMENT : le webhook confie le « Oui » (hors « garder ») d'une
        ligne qui porte une proposition, le numéro déjà vérifié, Ma Couronne en
        secours ; l'automate pose sous verrou, sur sa ligne et une seule fois,
        confirmé, par Perle, avec la clé du numéro, jamais le jour même.
   Tout est inventé. Sortie ASCII. */
import { propositionDesPlaces, propositionDuJour, ligneWhatsApp, type Situation, type PropositionDePerle } from '../src/shared/gerard-pur';
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
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const entre = (t: string, debut: string, fin: string): string => {
  const a = t.indexOf(debut);
  const b = a >= 0 ? t.indexOf(fin, a) : -1;
  return a >= 0 && b > a ? t.slice(a, b) : '';
};

const AUJ = '2026-11-18';

/* ── ① PERLE ÉCRIT SA PROPOSITION ─────────────────────────────────────── */
const fiche = { rituel: { serviceIds: ['sv-sinsin'], dureeMin: 120, heure: '10:00' } };
dit('« avant » : son rituel, le jour de sa cadence, son heure',
  { proposition: { serviceIds: ['sv-sinsin'], dureeMin: 120, places: [], jour: '2026-11-24', heure: '10:00' } }, propositionDuJour(fiche, '2026-11-24'));
dit('... sans heure habituelle : le jour seul',
  { proposition: { serviceIds: ['sv-sinsin'], dureeMin: 120, places: [], jour: '2026-11-24' } }, propositionDuJour({ rituel: { ...fiche.rituel, heure: null } }, '2026-11-24'));
dit('... sans rituel connu : rien a reserver', [{}, {}], [propositionDuJour({}, '2026-11-24'), propositionDuJour({ rituel: { serviceIds: [], dureeMin: 60, heure: null } }, '2026-11-24')]);
const troisPlaces = [{ iso: '2026-11-20', heure: '09:00' }, { iso: '2026-11-21', heure: '09:00' }, { iso: '2026-11-22', heure: '10:00' }];
dit('« place » : les deux places dites, dans l ordre du message',
  { proposition: { serviceIds: ['sv-sinsin'], dureeMin: 120, places: troisPlaces.slice(0, 2) } }, propositionDesPlaces(fiche, troisPlaces));
dit('... sans place (« cette semaine ») : rien a reserver', {}, propositionDesPlaces(fiche, []));

const proposition: PropositionDePerle = { serviceIds: ['sv-sinsin'], dureeMin: 120, places: troisPlaces.slice(0, 2) };
const s: Situation = { clientId: 'c1', genre: 'retard', canal: 'whatsapp', modele: 'place', variables: ['Mme T.', 'reprise des racines', 'x'], texte: 't', pourquoi: [], priorite: 1, proposition };
const ligne = ligneWhatsApp(s, { branchId: 'b1', aujourdhui: AUJ, maintenantIso: `${AUJ}T08:00:00.000Z`, prenom: 'T', numero: '2290100000000', partA: `${AUJ}T09:00:00.000Z`, calme: false });
dit('la ligne WhatsApp porte la proposition', proposition, ligne.proposition);
dit('... et son bouton « Oui » porte la ligne', true,
  ligne.colis?.genre === 'whatsapp' && ligne.colis.composants.some((c) => c.type === 'button' && c.parameters[0].payload === `GERARD:${ligne.id}:OUI`));

const gerard = lis('src/shared/gerard-pur.ts');
dit('« avant », « place » en retard et « place » apres un resserrage portent la proposition ; jamais le « premier resserrage » d une creation', [true, true, true],
  [/fait\('combiner', 'avant', \[f\.appel, f\.soinDit, `vers le \$\{jourDit\(c\.iso\)\}`\], \[\.\.\.pourquoiDuFil, \.\.\.rattrape\], propositionDuJour\(f, c\.iso\)\);/.test(gerard),
    /\['Retard', `\$\{ecartJours\(c\.iso, A\)\} jours`\]\], propositionDesPlaces\(f, places\)\);/.test(gerard),
    /\['Première venue', jourDit\(s0\)\]\], dejaResserree \? propositionDesPlaces\(f, places\) : \{\}\);/.test(gerard)]);
const lecture = lis('src/shared/assistant-lecture-pur.ts');
dit('son rituel : sa derniere venue honoree, jamais une creation, son heure habituelle', [true, true],
  [/!gestesDeLaDerniere\.some\(\(id\) => byId\.get\(id\)\?\.categoryId === CATEGORIE_VEKPE\)/.test(lecture), /heure: heureHabituelle\(siens\.filter\(\(a\) => a\.status === 'honoré'\)\)/.test(lecture)]);
const am = lis('supabase/functions/assistant-maison/index.ts');
dit('la fonction de Perle est refaite depuis le depot, et dit 2026-11-18-a', [true, true],
  [am.includes('propositionDuJour') && am.includes('proposition: s.proposition'), /var VERSION = "2026-11-18-a"/.test(am)]);

/* ── ② L'AUTOMATE RELIT ET CHOISIT ────────────────────────────────────── */
(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => '' }, serve: () => undefined };
console.error = () => undefined;
const auto = await import('../supabase/functions/whatsapp-automate/index.ts');
const lue = auto.propositionDePerleLue;
const places = auto.placesDuOuiDePerle;
dit('une proposition illisible ne pose rien', [null, null, null, null, null],
  [lue(null), lue([]), lue({ serviceIds: [], jour: '2026-11-24' }), lue({ serviceIds: ['sv'], places: [] }), lue({ serviceIds: ['sv'], jour: '24/11/2026' })]);
dit('elle se relit sans confiance : identifiants propres et uniques, places bien formees, duree bornee',
  { serviceIds: ['sv-a', 'sv-b'], dureeMin: 0, places: [{ iso: '2026-11-20', heure: '09:00' }] },
  lue({ serviceIds: ['sv-a', 'sv-a', 'x y', 'sv-b'], places: [{ iso: '2026-11-20', heure: '09:00' }, { iso: '2026-11-1', heure: '09:00' }, { iso: '2026-11-21', heure: '25:00' }], dureeMin: 9999 }));
dit('les places dites : jamais aujourd hui, dans l ordre du message',
  [{ iso: '2026-11-20', heure: '09:00' }, { iso: '2026-11-19', heure: '10:00' }],
  places(lue({ serviceIds: ['sv'], places: [{ iso: AUJ, heure: '15:00' }, { iso: '2026-11-20', heure: '09:00' }, { iso: '2026-11-19', heure: '10:00' }] })!, [], AUJ));
const LIBRES = [
  { iso: '2026-11-23', heure: '10:00' }, { iso: '2026-11-24', heure: '08:30' }, { iso: '2026-11-24', heure: '11:00' },
  { iso: '2026-11-24', heure: '09:30' }, { iso: '2026-11-25', heure: '10:00' }, { iso: '2026-12-01', heure: '10:00' },
];
dit('le jour dit : ce jour et les six suivants, l heure la plus proche de la sienne d abord',
  [{ iso: '2026-11-24', heure: '09:30' }, { iso: '2026-11-24', heure: '11:00' }, { iso: '2026-11-24', heure: '08:30' }, { iso: '2026-11-25', heure: '10:00' }],
  places(lue({ serviceIds: ['sv'], jour: '2026-11-24', heure: '10:00' })!, LIBRES, AUJ));
dit('... sans heure : la premiere du jour d abord', [{ iso: '2026-11-24', heure: '08:30' }, { iso: '2026-11-24', heure: '09:30' }],
  places(lue({ serviceIds: ['sv'], jour: '2026-11-24' })!, LIBRES, AUJ).slice(0, 2));
dit('un jour deja passe se reporte a demain, jamais aujourd hui', [{ iso: '2026-11-19', heure: '10:00' }],
  places(lue({ serviceIds: ['sv'], jour: '2026-11-10' })!, [{ iso: AUJ, heure: '10:00' }, { iso: '2026-11-19', heure: '10:00' }], AUJ));
dit('Perle signe ses poses', 'Perle', auto.PERLE);

/* ── ③ LE BRANCHEMENT ─────────────────────────────────────────────────── */
const wa = lis('supabase/functions/whatsapp-automate/index.ts');
const reserve = entre(wa, 'async function reserveLeOuiDePerle(', '\nDeno.serve(');
dit('seulement une ligne de Perle qui a dit oui, et sa fiche au numero (reverifiee)', [true, true],
  [/if \(!ligne \|\| d\.type !== 'gerard' \|\| d\.reponse !== 'oui'\)/.test(reserve),
    /const f = fiches\?\.find\(\(x\) => x\.id === String\(d\.clientId \?\? ''\)\);\n\s*if \(!f\) \{ dis\('perle · fiche etrangere au numero'\); return \{ pris: false \}; \}/.test(reserve)]);
dit('la pose : sous le verrou, jamais le jour meme, confirmee, par Perle, avec la cle du numero et son oui date', [true, true, true],
  [/const v = await poseSousVerrou\(sb, lu, ecriture, vue\.oublie, false\);/.test(reserve),
    /status: 'confirmé', source: 'whatsapp'/.test(reserve),
    /poseePar: PERLE, cleDuNumero: cleWa\(o\.numero\), confirmeeParLaClienteLe: maintenant,/.test(reserve)]);
dit('un seul rendez-vous par ligne : un second « Oui » le redit sans en poser un autre', [true, true],
  [/const rdvId = `rdv-wa-perle-\$\{cleCourte\(o\.ligneId\)\}`;/.test(reserve), /C’est déjà réservé, \$\{appel\}/.test(reserve)]);
dit('la confirmation se dit dans la conversation et sa ligne suit (confirmation-rdv en relais)', [true, true],
  [/C’est réservé, \$\{appel\} : \$\{gestes\}, \$\{placeDite\(posee\)\}\./.test(reserve), /await ditLaConfirmation\(sb, rdvId, rendu\);/.test(reserve)]);
dit('l automate n ecrit jamais « annule »', false, wa.includes("'annulé'"));
dit('dans le fil d Opale, la confirmation de Perle est un message automatique (avant la regle de l automate)', true,
  /if \(d\.parQui === PERLE\) return 'automatique';\n\s*if \(d\.auto === 'automate'\) return 'automate';/.test(wa));
dit('le mode perle passe avant le tour ordinaire, et la version le dit', [true, true],
  [wa.indexOf('const brutPerle') > 0 && wa.indexOf('const brutPerle') < wa.indexOf('const r = await servirLeNumero(sb, {'),
    /const VERSION = '2026-11-18-[c-z] · [^']*le Oui de Perle reserve/.test(wa)]);
const wh = lis('supabase/functions/whatsapp-webhook/index.ts');
const oui = entre(wh, 'LE « OUI » QUI RÉSERVE', 'if (suite?.deplacer && rdvAGarder');
dit('le webhook confie le « Oui » d une ligne qui porte une proposition, hors « garder »', true,
  /if \(!garder && b\.geste === 'OUI' && ligne\.data\?\.proposition && service && urlBase\) \{/.test(oui));
dit('... par le mode perle, puis Ma Couronne en secours si rien ne se pose', [true, true],
  [/waIds: \[e\.waId\], perle: \{ ligneId \} \}/.test(oui), /if \(rep\.pris\) \{[\s\S]*return;\n\s*\}\n\s*if \(retour && jetonMeta && phoneIdMeta\) \{\n\s*await ditDepuisLeTrone\(/.test(oui)]);
dit('... le numero du bouton deja verifie (la fiche de la ligne), et la version le dit', [true, true],
  [wh.indexOf("dis('assistant · numéro étranger à la ligne')") > 0 && wh.indexOf("dis('assistant · numéro étranger à la ligne')") < wh.indexOf('waIds: [e.waId], perle: { ligneId } }'),
    /const VERSION = '2026-11-18-[c-z] · [^']*le Oui d un message de Perle/.test(wh)]);

console.log(`\n${n} verifications.`);
console.log(process.exitCode ? 'ECHEC : le Oui de Perle ne reserve pas comme promis.' : 'TOUT VA BIEN : le Oui de Perle reserve d un toucher.');
