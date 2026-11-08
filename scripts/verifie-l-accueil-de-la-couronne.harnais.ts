/* L'ACCUEIL DE MA COURONNE RÉORGANISÉ, ÉPROUVÉ · 8 novembre 2026.
   `node scripts/verifie-l-accueil-de-la-couronne.mjs` (et `--prouve`).
   Maquette validée par « construis » le 8 novembre 2026 (« Il faut réorganiser
   un peu la première page de Ma Couronne. Il y a trop d'informations, trop
   condensées. Il faut faire une meilleure interface avec un meilleur UI »,
   Yéman) : plus de grande photo, une carte qui parle en premier (la prochaine
   séance, avec la pastille du rituel qui approche), deux gestes côte à côte,
   la formule, les offres lisibles, le reste en liste. Le chemin de sceaux et
   le pli de l'attention (Abonnee.tsx) ne bougent pas d'un octet. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { EN } from '../src/apps/couronne/i18n/en';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const TABS = 'src/apps/couronne/Tabs.tsx';
const ABO = 'src/apps/couronne/Abonnee.tsx';
const CSS = 'src/apps/couronne/couronne.css';
const tabs = lis(TABS);
const abonnee = lis(ABO);
const css = lis(CSS);
const home = sansCommentaires(tabs.slice(tabs.indexOf('export function HomeTab('), tabs.indexOf('export function HomeEnfant(')));
const ou = (s: string) => home.indexOf(s);

/* ── 1. Plus de grande photo : un en-tête compact ── */
dit('plus de photo, de voile ni de sceau en haut de l accueil', false, /mc-homehero__(photo|veil|seal)|model-microlocks/.test(home));
dit('l en-tête compact : « Votre couronne », le bonjour, la cloche avec son compte', [true, true, true, true],
  [home.includes('<div className="mc-homehead">'), /mc-homehead__greet">\{prenom \? t\('Bonjour, \{prenom\}\.', \{ prenom \}\) : t\('Bonjour\.'\)\}/.test(home),
    /className="mc-bell" aria-label=\{t\('Notifications'\)\} onClick=\{onOpenNotif\}/.test(home), /notifCount > 0 && <span className="mc-bell__count">/.test(home)]);
dit('la pastille de la couronne (7 novembre 2026) est sous le bonjour, et ouvre toujours la carte du statut', [true, true, true],
  [/mc-homehead__greet[\s\S]{0,900}className="mc-crownpill"/.test(home), /aria-controls="mc-statut-couronne" onClick=\{\(\) => setStatutOuvert\(\(v\) => !v\)\}/.test(home),
    /\{statutOuvert && \(\s*<div id="mc-statut-couronne">/.test(home)]);
dit('le CSS mort du hero est parti de la feuille', false, /mc-homehero/.test(css));

/* ── 2. L'ordre : fermeture, séance, gestes, formule, marche, offres, liste ── */
const ordre = ['<FermetureAnnoncee />', '{carteProchaine}', '{lesGestes}', '{LE_TABLEAU_DE_BORD}', '<ProchaineMarche appts={clientAppts} onOpenBooking={onOpenBooking} goFormule={goFormule} />', '{lesOffres}', '{laListe}'];
dit('chaque bloc de l accueil est posé une fois', ordre.map(() => 1), ordre.map((s) => home.split(s).length - 1));
dit('... dans cet ordre : fermeture, séance, gestes, formule, prochaine marche, offres, liste', true,
  ordre.every((s, i) => i === 0 || ou(ordre[i - 1]) < ou(s)));

/* ── 3. Une seule carte parle en premier : la prochaine séance ── */
dit('la carte garde sa racine (RituelEnCours au-dessus, ARegler dessous, Mes rendez-vous en dernier)', [true, true],
  [/<RituelEnCours nomDuRituel=\{\(a\) => serviceNames\(a, services\)\} \/>\s*\{\}\s*<div className="mc-nextrdv">/.test(home),
    /\{t\('Mes rendez-vous'\)\}\s*<\/button>\s*<\/div>\s*<ARegler nomDuRituel=\{\(a\) => serviceNames\(a, services\)\} \/>/.test(home)]);
dit('la date et l heure en grand, les gestes et la durée dessous, la séance s ouvre d un toucher et par « Ouvrir »', [true, true, true, true],
  [/<div className="mc-nextrdv__service">\{jourDit\(next\.date\)\} · \{heureDite\(next\.time\)\}<\/div>/.test(home),
    /\{serviceNames\(next, services\) \|\| t\('Rituel de la maison'\)\} · \{fmtDuration\(dureeDuRendezVous\(next, dureesParPrestation\)\)\}/.test(home),
    /className="mc-nextrdv__ouvrir" onClick=\{\(\) => onOpenRdv\(next\.id\)\}/.test(home),
    /className="mc-nextrdv__cta" onClick=\{\(\) => onOpenRdv\(next\.id\)\}>\{t\('Ouvrir'\)\}/.test(home)]);
dit('les trois cas d hier : la séance prise, la séance prédite (≈ et sa réservation en une touche), aucune (Réserver)', [true, true, true, true],
  [/\{next \? \(/.test(home), /≈ \{jourDit\(predite\.iso!\)\}/.test(home) && /time: predite\.template!\.time, express: true/.test(home),
    /t\('Aucun rituel à venir'\)[\s\S]{0,200}t\('La maison vous attend\.'\)/.test(home),
    /className="mc-nextrdv__cta" onClick=\{\(\) => onOpenBooking\(\)\}>\{t\('Réserver'\)\}/.test(home)]);
dit('le bandeau « Votre rituel approche » a quitté l accueil : la pastille le remplace, dans la carte', [false, true, true],
  [/mc-remindbanner/.test(home), /<span className="mc-nextrdv__pastille">\{dansCombienDit\(soon\.date\)\}<\/span>/.test(home),
    /<div className="mc-nextrdv__row">[\s\S]{0,400}\{pastilleQuiApproche\}/.test(home)]);
dit('... une seule alerte pour une abonnée : la pastille se tait quand le relevé porte la sienne', true, tabs.includes('        {soon && !(abonneeA && releveA?.alerte) && ('));
dit('... la pastille dit Aujourd’hui, Demain, Dans {n} jours', [true, true, true],
  ["t('Aujourd’hui')", "t('Demain')", "t('Dans {n} jours', { n })"].map((s) => tabs.includes(s)));
dit('... et la notification locale du rituel qui approche reste', true, /notifyLocal\(t\('Votre rituel approche'\)/.test(home));
dit('la durée se lit comme au Trône (shared/agenda-pur), l heure comme la Maison l écrit', [true, true],
  [/import \{ dureeDuRendezVous \} from '\.\.\/\.\.\/shared\/agenda-pur';/.test(tabs), /const heureDite = \(hhmm: string\): string =>/.test(tabs)]);

/* ── 4. Deux gestes côte à côte ── */
dit('« Réserver un rituel » plein cuivre et « Sur-mesure » bord cuivre, en grille, juste sous la séance', [true, true, true, true],
  [/<div className=\{`mc-gestes\$\{reserveIci && composeIci \? '' : ' mc-gestes--seul'\}`\}>/.test(home),
    /className="mc-cta mc-cta--copper" onClick=\{\(\) => onOpenBooking\(\)\}>\s*\{t\('Réserver un rituel'\)\}/.test(home),
    /className="mc-cta mc-cta--outline" onClick=\{onOpenCompose\}>\s*\{t\('Sur-mesure'\)\}/.test(home),
    /\.mc-gestes \{ display: grid; grid-template-columns: 1\.25fr 1fr;/.test(css)]);
dit('... une abonnée réserve depuis sa formule : le premier geste ne se répète pas pour elle', true, home.includes("const reserveIci = !moduleHidden(client, 'reserver') && !abonneeA;"));
dit('... les anciens boutons du bas de page ont disparu', false, /style=\{\{ marginTop: 16 \}\} onClick=\{\(\) => onOpenBooking\(\)\}|t\('✦ Rituel sur-mesure'\)/.test(home));

/* ── 5. La formule tient sur une carte : le tableau de bord, intact ── */
dit('le tableau de bord de l abonnée est posé entier (ses huit gestes), sans plus glisser la séance dedans', [true, false],
  [/const LE_TABLEAU_DE_BORD = abonnee && releveA && abonneeA \? \(\s*<div className="ab-pile">\s*<TableauDeBord\s*releve=\{releveA\}\s*onFormule=\{abonnee\.onFormule\}\s*onRegler=\{abonnee\.onRegler\}\s*onRenoncer=\{abonnee\.onRenoncer\}\s*onSolde=\{abonnee\.onSolde\}\s*onOpenRdv=\{\(id\) => onOpenRdv\(id\)\}\s*onReserverIncluse=\{abonnee\.onReserverIncluse\}\s*onAcheter=\{abonnee\.onAcheter\}\s*\/>/.test(home),
    /avantLeSolde=/.test(home)]);
dit('... avec ses deux boutons', true, /<BoutonsDeLAccueil\s*releve=\{releveA\}\s*peutAcheter=\{abonnee\.peutAcheter\}\s*onReserverIncluse=\{abonnee\.onReserverIncluse\}\s*onReserverAutre=\{\(\) => onOpenBooking\(\)\}\s*onAcheter=\{abonnee\.onAcheter\}\s*onRegler=\{abonnee\.onRegler\}/.test(home));
dit('Abonnee.tsx porte toujours le pli de l attention et le chemin de sceaux dans le tableau de bord', [true, true],
  [abonnee.includes('      <PliDeLAttention teteId={releve.clientId} prenom={prenom} />'), abonnee.includes('<Chemin pas={cheminDeLaLigne(c, l, perdue)} voile={voile} />')]);
/* Le fichier de l'autre session, à l'octet près : son empreinte est celle d'origin/main
   (à défaut, celle de HEAD), fins de ligne ramenées à LF. */
const empreinte = (s: string) => createHash('md5').update(s.replace(/\r\n/g, '\n')).digest('hex');
let reference = '';
let source = '';
for (const ref of ['origin/main', 'HEAD']) {
  try { reference = execFileSync('git', ['show', `${ref}:${ABO}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); source = ref; break; } catch { /* la référence suivante */ }
}
dit(`Abonnee.tsx n a pas bougé d un octet (empreinte identique à ${source || 'la référence'})`, true, !!reference && empreinte(reference) === empreinte(abonnee));

/* ── 6. Les offres lisibles ── */
dit('l en-tête des offres : « Offres de saison » à gauche, « Expire dans » à droite, le rail dessous, rien sans offre', [true, true, true, true],
  [/const lesOffres = offers\.length > 0 && !moduleHidden\(client, 'offres'\) \? \(/.test(home),
    /<div className="mc-offershead">\s*<span className="mc-offershead__label">\{t\('Offres de saison'\)\}<\/span>\s*\{countdown && <span className="mc-offershead__timer">\{t\('Expire dans \{temps\}', \{ temps: countdown \}\)\}<\/span>\}/.test(home),
    /<div className="mc-scroll mc-offersrail">/.test(home), /\.mc-offer \{[^}]*flex: 0 0 84%;/.test(css)]);
dit('... le texte d une offre cuivre reste ivoire plein (7 novembre 2026)', true, css.includes('.mc-offer--copper .mc-offer__sub { color: var(--color-ivoire); opacity: 0.94; }'));

/* ── 7. Le reste en liste « Pour vous » ── */
const titres = ['Votre dernier bilan', 'La Maison vous recommande', 'Du Carnet de Suivi', 'Ma formule', 'Les produits', 'Le Cercle'];
dit('la liste « Pour vous » : une ligne par rubrique, chacune sous son titre', [true, titres.map(() => true), true],
  [/<div className="mc-sectionlabel">\{t\('Pour vous'\)\}<\/div>\s*<div className="mc-liste">\{rangs\}<\/div>/.test(home),
    titres.map((s) => home.includes(`<div className="mc-liste__t">{t('${s}')}</div>`)), home.includes(`<div className="mc-liste__t">{maCarte ? t('De main en main · {rang}'`)]);
dit('... chaque ligne ne paraît que si sa donnée existe', [true, true, true, true, true, true, true],
  ['monBilan && (', 'onOpenCarte && (', 'recoPresta && (', 'chosenReco && (', '!abonneeA && abonnee?.peutAcheter && (', 'abonnee?.goGamme && (', 'abonnee?.goCercle && ('].map((s) => home.includes(s)));
dit('... et chaque geste d hier répond encore', [true, true, true, true, true, true, true, true],
  ["onClick={() => setLireBilan(true)}", 'onClick={onOpenCarte}', "onClick={peutReserver ? () => onOpenBooking({ serviceId: recoPresta.service.id }) : undefined}", 'onClick={goGamme}',
    'onClick={abonnee.onAcheter}', 'onClick={abonnee.goGamme}', 'onClick={abonnee.goCercle}', '<BilanLecteur bilan={monBilan} porteuse={client} onClose={() => setLireBilan(false)}'].map((s) => home.includes(s)));
dit('... le sous-titre de De main en main : le soin qui attend d abord, puis la Graine ou le rang', true,
  /\{soinQuiAttend \|\| \(maCarte \? t\('Offrez la Maison à une amie\.'\) : maGraine\.reste > 0 \? graineDansDite\(maGraine\.reste\) : t\('Votre carte se prépare à la Maison\.'\)\)\}/.test(home)
  && /\{maCarte \? t\('De main en main · \{rang\}', \{ rang: t\(nomDuRang\(maCarte\.rang\)\) \}\) : t\('De main en main'\)\}/.test(home));
dit('... la ligne sans geste se lit mais ne se touche pas', true, /function Rang\(\{ icone, onClick, children \}[\s\S]{0,700}return onClick\s*\? <button type="button" className="mc-liste__rang" onClick=\{onClick\}>\{corps\}<\/button>\s*: <div className="mc-liste__rang">\{corps\}<\/div>;/.test(sansCommentaires(tabs)));
dit('plus de carte de recommandation, de carte de marraine ni de mini-cartes à l accueil', false, /mc-recocard|<CarteDeMarraine|ab-mini|mc-productvisual/.test(home));

/* ── 8. Le style : jetons, soir, 16 px, rien de fixe au-delà du téléphone ── */
const bloc = css.slice(css.indexOf("/* ══ L'ACCUEIL RÉORGANISÉ"), css.indexOf('/* ══ fin de l\'accueil réorganisé ══ */'));
dit('le bloc de l accueil réorganisé est dans la feuille, borné', true, bloc.length > 500);
dit('aucune couleur écrite en dur dans ce bloc : le soir suit les jetons', [], bloc.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/g) ?? []);
dit('16 px de gouttière, le rail des offres au bord', [true, true],
  [bloc.includes('.mc-pagepad--accueil { padding: 14px 16px 0; }'), bloc.includes('.mc-pagepad--accueil .mc-offersrail { margin: 0 -16px; padding: 0 16px 4px; }')]);
dit('text-wrap: balance sur le serif (le bonjour, la date de la séance)', [true, true],
  [/\.mc-homehead__greet \{[^}]*text-wrap: balance;/.test(css), /\.mc-nextrdv__service \{[^}]*text-wrap: balance;/.test(css)]);
dit('la cloche vit dans l en-tête, plus en absolu sur une photo', true, /\.mc-bell \{\s*position: relative;/.test(bloc));
const largeursFixes = (s: string) => (s.match(/\b(?:min-|max-)?width:\s*(\d{3,})px/g) ?? []).filter((m) => Number(/(\d+)px/.exec(m)![1]) > 390);
dit('aucune largeur fixe au-delà de 390 px, ni dans le bloc ni dans l accueil', [[], []], [largeursFixes(bloc), largeursFixes(home)]);
dit('la pastille de la couronne vit sur le papier (jetons), plus sur la photo', [true, false],
  [/\.mc-crownpill \{[\s\S]{0,400}background: var\(--copper-50\); border: 1px solid var\(--copper-300\);/.test(css), /\.mc-crownpill \{[\s\S]{0,400}backdrop-filter/.test(css)]);
dit('« Ouvrir » plein cuivre et « Mes rendez-vous » en lien, sur la même ligne', [true, true, true],
  [/\.mc-nextrdv__cta \{[\s\S]{0,600}background: var\(--accent\);/.test(css), /\.mc-nextrdv__manage \{[\s\S]{0,700}text-decoration: underline;/.test(css),
    css.includes('.mc-nextrdv__cta + .mc-nextrdv__manage, .mc-nextrdv__manage + .mc-nextrdv__manage { margin-left: 16px; }')]);

/* ── 9. Les mots : chaque phrase a son anglais, la voix de la Maison ── */
const lireLitteral = (q: string, corps: string): string => new Function(`return ${q}${corps}${q};`)() as string;
const phrases = [...new Set([...home.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => lireLitteral(m[1], m[2])))];
dit('l accueil passe ses phrases par t() (au moins quarante)', true, phrases.length >= 40);
dit('chaque phrase de l accueil a son anglais', [], phrases.filter((p) => !(p in EN)));
dit('les phrases neuves du 8 novembre ont le leur', ['Tomorrow', 'In {n} days', 'Bespoke', 'The Maison recommends'],
  ['Demain', 'Dans {n} jours', 'Sur-mesure', 'La Maison vous recommande'].map((k) => EN[k]));
dit('ni « — », ni « salon », ni maître/maîtresse dans ce que la cliente lit à l accueil', [], phrases.filter((p) => /—|\bsalons?\b|\bma[iî]tre(sse)?s?\b/i.test(p)));
dit('l anglais dit « the Maison » et « visit », jamais « salon »', [],
  ['Demain', 'Dans {n} jours', 'Sur-mesure', 'La Maison vous recommande', 'Votre Graine dans {n} visites'].map((k) => [k, EN[k] ?? ''] as const)
    .filter(([k, en]) => /\bsalons?\b/i.test(en) || (/\bMaison\b/.test(k) && !/the Maison/i.test(en)) || (/visites/.test(k) && !/visits/.test(en))).map(([k]) => k));

console.log(ko === 0 ? '\nL’accueil de Ma Couronne tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
