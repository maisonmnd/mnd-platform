/* LA REVUE DU 10 OCTOBRE 2026, LOT « FICHE-DOCS », EPROUVEE.
   `node scripts/verifie-revue-fiche-docs.mjs` (et `--prouve`).

   Six constats de la relecture du code, corriges le 10 octobre 2026, et le
   releve de compte qui prend la ligne legale des factures. Le banc porte la
   REGLE de chacun, pas seulement le cas du jour :

     A. LA FICHE DIT CE QUE LA CLOTURE FERA : la reprise s'annonce par le
        meme juge que la cloture (`rythmeDeReprise`), jamais par la seule
        cadence observee ; diaspora, tete de passage et locks defaits sans
        rythme pose disent pourquoi rien ne se posera.
     B. LA CIVILITE : aucun « Bonjour » de la fiche ne s'adresse a la cliente
        par son prenom nu, toujours par `appelDe`.
     C. LE TIRET CADRATIN : aucun dans le texte affiche de la fiche, des
        Predictions ni des Parametres ; restent les cases vides « — » et les
        defauts de menu « — aucun — » (regle du 24 aout 2026).
     D. LA SERIE DU SECRETARIAT : une piece numerotee ne perd jamais ses
        signatures (elle rendrait son numero a la suivante) ; l'ecran ne le
        propose qu'a une piece en signature. Une piece numerotee se corrige,
        signee OU deja annulee (reprise du 10 octobre 2026) : la correction
        dit toujours le numero qu'elle remplace, dans l'ordre que l'on veut.
     E. « CET APPAREIL » lit le localStorage au tic, jamais dans le rendu.
     F. LE RELEVE DE COMPTE porte la ligne legale du jour du releve, par le
        meme juge que la facture (`maisonRaisonDuPdfAu`).

   Les attentes sont ecrites en dur, jamais tirees du code eprouve. Sortie en
   ASCII (la console Windows est en cp1252). */
import { readFileSync } from 'node:fs';
import { rythmeDeReprise } from '../src/shared/cadence';
import { appelDe } from '../src/shared/civilite';
import { maisonRaisonDuPdfAu } from '../src/shared/identite';
import * as SP from '../src/shared/secretariat-pur';
import type { Client } from '../src/shared/clients';
import type { Appointment } from '../src/shared/agenda';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e\n]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n      attendu ${JSON.stringify(attendu)}\n      obtenu  ${JSON.stringify(obtenu)}`}`));
};
/* Les commentaires s'effacent avant toute lecture : une phrase qui raconte
   l'ancienne faute ne doit ni faire crier ni faire passer le banc. */
const sansCommentaires = (f: string) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const compte = (texte: string, motif: string) => texte.split(motif).length - 1;
const entre = (texte: string, debut: string, fin: string) => {
  const i = texte.indexOf(debut);
  if (i < 0) return '';
  const j = texte.indexOf(fin, i + debut.length);
  return texte.slice(i, j < 0 ? undefined : j);
};

const FICHE = 'src/apps/trone/routes/clients/Customers.tsx';
const PREDICTIONS = 'src/apps/trone/routes/pilotage/Predictions.tsx';
const PARAMETRES = 'src/apps/trone/routes/systeme/Parametres.tsx';
const EDITEUR = 'src/apps/trone/routes/pilotage/secretariat/Editeur.tsx';
const fiche = sansCommentaires(FICHE);

/* ── A. LA FICHE DIT CE QUE LA CLOTURE FERA ─────────────────────────── */
/* Deux venues honorees a six semaines : une cadence se lit pour toutes. */
const venues = (id: string): Appointment[] => [
  { id: `${id}-1`, clientId: id, date: '2026-07-04', status: 'honoré', serviceIds: ['s'] },
  { id: `${id}-2`, clientId: id, date: '2026-08-15', status: 'honoré', serviceIds: ['s'] },
] as unknown as Appointment[];
const fiche_ = (id: string, plus: Record<string, unknown> = {}) =>
  ({ id, name: 'A. B.', phone: '', segments: [], ...plus } as unknown as Client);
dit('A1 le juge de la cloture : ordinaire, diaspora, passage, locks defaits, diaspora avec rythme pose',
  [{ semaines: 6, observe: true }, null, null, null, { semaines: 8, observe: false }],
  [
    rythmeDeReprise(fiche_('o'), venues('o')),
    rythmeDeReprise(fiche_('d', { diaspora: true }), venues('d')),
    rythmeDeReprise(fiche_('p', { dePassage: true }), venues('p')),
    rythmeDeReprise(fiche_('l', { locksDefaits: true }), venues('l')),
    rythmeDeReprise(fiche_('r', { diaspora: true, rythmeSemaines: 8 }), venues('r')),
  ]);
dit('A2 la fiche annonce la reprise par ce juge, jamais par la seule cadence observee', [true, true, false], [
  fiche.includes('const rythme = useMemo(() => rythmeDeReprise(client, appts), [client, appts]);'),
  fiche.includes('const repriseActive = !client.sansRepriseAuto && !!rythme;'),
  /repriseActive\s*=[^;]*cadenceObs/.test(fiche),
]);
dit('A3 les semaines annoncees sont celles que la cloture posera', [true, false], [
  fiche.includes('<b>{rythme.semaines} semaines</b> après le rituel honoré'),
  /cadenceObs!?\.semaines\} semaines<\/b> après le rituel honoré/.test(fiche),
]);
dit('A4 diaspora, passage et locks defaits disent pourquoi rien ne se posera', [true, true, true, true, true], [
  /: estDePassage\(client\) \? \{ court: 'tête de passage', dit: '[^']+' \}/.test(fiche),
  /: estDiaspora\(client\) \? \{ court: 'diaspora', dit: '[^']+' \}/.test(fiche),
  /: aDefaitSesLocks\(client\) \? \{ court: 'locks défaits', dit: '[^']+' \}/.test(fiche),
  fiche.includes('<>Aucune reprise ne se posera : {sansRepriseCar.dit}.'),
  fiche.includes("sansRepriseCar ? `aucune · ${sansRepriseCar.court}`"),
]);

/* ── B. LA CIVILITE ─────────────────────────────────────────────────── */
dit('B0 sans nom, la civilite seule, jamais « Elle »', ['Madame', 'Madame Naffi'], [appelDe({ name: '' }), appelDe({ name: 'Naffi K.' })]);
dit('B1 aucun « Bonjour » de la fiche ne nomme la cliente sans appelDe', [],
  fiche.match(/Bonjour \$\{(?!appelDe\()[^}]*\}/g) ?? []);
dit('B2 le studio et la relance d impaye disent sa civilite', [1, 1], [
  compte(fiche, '`Bonjour ${appelDe(c)},\\n\\n`'),
  compte(fiche, 'message={`Bonjour ${appelDe(client)}, la Maison MND revient vers vous :'),
]);

/* ── C. LE TIRET CADRATIN ───────────────────────────────────────────── */
/* Ce qui reste permis : la case vide (« — » seul dans sa chaine, ou seul
   entre une balise OUVRANTE et SA fermante), le code a quatre cases du
   jour, le defaut d'un menu (dans une option, nulle part ailleurs).
   Reprise du 10 octobre 2026 : l'ancien permis (un « — » entre deux
   chevrons quelconques) effacait aussi une vraie incise posee entre deux
   balises, « <b>Ces montants</b> — <i>comptent ailleurs</i> », et le banc
   disait « tient » avec le tiret affiche. */
const PERMIS = [
  /'— — — —'/g,
  /(['"`])—\1/g,
  /<([A-Za-z][\w.]*)(?:\s[^<>]*)?>\s*—\s*<\/\1>/g,
  /<option\b[^<>]*>— [^<>{}—]+ —<\/option>/g,
];
const resteUnTiret = (s: string) => {
  let r = s;
  for (const p of PERMIS) r = r.replace(p, '');
  return r.includes('—');
};
const tirets = (f: string) => {
  let r = sansCommentaires(f);
  for (const p of PERMIS) r = r.replace(p, '');
  return r.split('\n').filter((l) => l.includes('—')).map((l) => `${f.split('/').pop()}: ${l.trim().slice(0, 90)}`);
};
dit('C1 aucune incise au tiret cadratin dans la fiche, les Predictions et les Parametres', [],
  [FICHE, PREDICTIONS, PARAMETRES].flatMap(tirets));
/* Les temoins s'ecrivent en String.raw : un motif dans un gabarit sans
   String.raw perd ses barres obliques, et le controle meurt en silence. */
dit('C2 le scan voit bien une incise (temoins), et laisse les cases vides',
  [true, true, true, true, false, false, false],
  [
    resteUnTiret('title={`${a} — ne plus prédire`}'),
    resteUnTiret(String.raw`<b>Ces montants</b> — <i>comptent ailleurs</i>`),
    resteUnTiret(String.raw`<b>Ces montants</b>— comptent ailleurs —<i>x</i>`),
    resteUnTiret(String.raw`<span>Total <b>12</b> — </span>`),
    resteUnTiret(String.raw`<option value="">— aucun —</option>{x ?? '—'}`),
    resteUnTiret(String.raw`<span className="trc-sub">—</span>`),
    resteUnTiret(String.raw`<td> — </td>`),
  ]);

/* ── D. LA SERIE DU SECRETARIAT ─────────────────────────────────────── */
const signaturesRetirables: (p: Any) => boolean = (SP as Any).signaturesRetirables ?? (() => 'ABSENT');
dit('D1 seule une piece en signature, sans numero, perd ses signatures',
  [false, true, false, false, false],
  [
    signaturesRetirables({ etat: 'signe', numero: 'MND-DOC-2026-005' }),
    signaturesRetirables({ etat: 'a-signer' }),
    signaturesRetirables({ etat: 'a-signer', numero: 'MND-DOC-2026-005' }),
    signaturesRetirables({ etat: 'brouillon' }),
    signaturesRetirables({ etat: 'annule', numero: 'MND-DOC-2026-004' }),
  ]);
/* Le recit de la relecture : A signe 005 garde son numero, B prend 006. */
dit('D1 la serie ne redonne jamais un numero garde', 'MND-DOC-2026-006',
  SP.prochainNumero('MND-DOC', 2026, ['MND-DOC-2026-004', 'MND-DOC-2026-005']));
const editeur = sansCommentaires(EDITEUR);
dit('D2 l ecran ne propose « Annuler les signatures » qu a une piece retirable', [true, 1, false], [
  /\{direction && signaturesRetirables\(p\) && <Button variant="ghost" onClick=\{\(\) => \{ annuleLesSignatures\(p\);[^}]*\}\}>Annuler les signatures<\/Button>\}/.test(editeur),
  compte(editeur, 'annuleLesSignatures(p)'),
  /p\.etat === 'signe'\) && <Button variant="ghost" onClick=\{\(\) => \{ annuleLesSignatures/.test(editeur),
]);
const corrigeable: (p: Any) => boolean = (SP as Any).corrigeable ?? (() => 'ABSENT');
dit('D3 se corrige toute piece numerotee, signee ou annulee ; jamais un brouillon ni une piece en signature',
  [true, true, false, false, false],
  [
    corrigeable({ etat: 'signe', numero: 'MND-DOC-2026-005' }),
    corrigeable({ etat: 'annule', numero: 'MND-DOC-2026-004' }),
    corrigeable({ etat: 'annule' }),
    corrigeable({ etat: 'a-signer' }),
    corrigeable({ etat: 'brouillon' }),
  ]);
dit('D4 l ecran offre « Corriger » par ce juge, et la correction dit le numero remplace', [true, false], [
  /\{corrigeable\(p\) && <Button variant="ghost" onClick=\{\(\) => surOuvre\(duplique\(p, \{ auteurId: moi, remplace: true \}\)\.id\)\}>Corriger \(nouveau numéro\)<\/Button>\}/.test(editeur),
  /p\.etat === 'signe' && <Button variant="ghost" onClick=\{\(\) => surOuvre\(duplique\(p, \{ auteurId: moi, remplace: true/.test(editeur),
]);

/* ── E. « CET APPAREIL » LIT LA MEMOIRE AU TIC ──────────────────────── */
const parametres = sansCommentaires(PARAMETRES);
const debutDuPanneau = parametres.indexOf('function CetAppareil() {');
const corps = entre(parametres, 'function CetAppareil() {', '\n  return (');
const avantLeGeste = entre(corps, 'function CetAppareil() {', 'const repartirDuServeur');
dit('E1 la memoire se lit a l ouverture et au tic de 5 s, jamais dans le corps du rendu', [true, true, true, 1, 0], [
  parametres.indexOf('const litLaMemoire = () => {') >= 0 && parametres.indexOf('const litLaMemoire = () => {') < debutDuPanneau,
  avantLeGeste.includes('const [memoire, setMemoire] = useState(litLaMemoire);'),
  /window\.setInterval\(\(\) => setMemoire\(litLaMemoire\(\)\), 5000\)/.test(avantLeGeste),
  compte(avantLeGeste, 'litLaMemoire()'),
  compte(avantLeGeste, 'Object.keys(localStorage)'),
]);

/* ── F. LE RELEVE DE COMPTE PORTE LA LIGNE LEGALE ───────────────────── */
dit('F0 le juge : rien avant la bascule, le registre de la Maison depuis', [true, true], [
  maisonRaisonDuPdfAu('2026-10-09') === undefined,
  /RB\/COT\/26 A 120676/.test(maisonRaisonDuPdfAu('2026-10-10') ?? ''),
]);
const releve = entre(fiche, 'const releveDeCompte = async () => {', 'const myPoints');
dit('F1 le releve pose la ligne legale du jour du releve, un seul jour lu', [true, true, true, 1, 1], [
  releve.includes("kind: 'releve',"),
  releve.includes('date: jour,'),
  releve.includes('legal: maisonRaisonDuPdfAu(jour),'),
  compte(releve, 'const jour = todayISO();'),
  compte(releve, 'todayISO()'),
]);

console.log(ko === 0 ? '\nLe lot fiche-docs tient.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
