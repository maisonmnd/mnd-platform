/* LES AUTRES PORTES, ÉPROUVÉES — `node scripts/verifie-les-autres-portes.mjs`.

   17 novembre 2026, la consultation en affiches, arbitrage D. « Il ne faut
   pas permettre d'avoir des bilans sans prendre de RDV sinon tout le monde
   nous trichera » (Yéman). Un bilan, un diagnostic ou un avis se remet avec
   un rendez-vous. Six portes suivent cette règle : l'ancien tunnel, le
   diagnostic du menu, « Un souci avec vos locks ? », l'avis sur photo par
   WhatsApp, le diagnostic photo de Ma Couronne, et les deux papeteries de
   l'équipe.

   Le banc rejoue la règle commune (un rendez-vous pris ou une séance faite),
   la porte de l'équipe, la routine rangée, et lit les écrans, le site, la
   base et les fonctions. Les attentes viennent de ses choix, écrites à la
   main. Personnes inventées. Les fonctions elles-mêmes sont rejouées par
   `verifie-opale` (l'avis sur photo) et `verifie-le-diagnostic-photo` (Ma
   Couronne), que `--prouve` appelle pour leurs pannes. */
import { existsSync, readFileSync } from 'node:fs';
import {
  CHEMIN_DE_LA_CONSULTATION, aEuUneSeance, aUnRendezVousPris, aUnRendezVousPrisOuUneSeanceFaite, aujourdhuiACotonou,
  estUnRendezVousPris, estUneSeanceFaite,
} from '../src/shared/rendez-vous-pris-pur';
import { estSuggere } from '../src/shared/rendez-vous-suggere-pur';
import { estFerme } from '../src/shared/rendez-vous-en-attente-pur';
import { ENTREE_DU_TRONE, SORTIES_DE_LA_PORTE, etatDeLaPorteDeLEquipe } from '../src/shared/porte-de-l-equipe-pur';
import { peutPoursuivreSansVerdict } from '../src/apps/consultation/acces-pur';
import {
  PORTES_DE_LA_ROUTINE, QUESTIONS_DE_LA_ROUTINE, composeLaRoutine, messageDeLaRoutine, reponsesCompletes, touche,
} from '../src/shared/routine-de-soins-pur';
import { consigneDOpale, contexteDOpale, lienDeLaConsultation, type ContexteDOpale } from '../src/shared/opale-pur';
import { consigneDeLaReception } from '../src/shared/reception-wa-pur';
import { ANCIEN_TEXTE_DE_LA_LONGUEUR, TEXTES_PROPOSES } from '../src/shared/conseil-wa';
import { MOTS_DES_REFUS, PLAFOND_PAR_CLIENTE_LIVRE } from '../src/shared/ia-diagnostic-pur';
import { LIENS_A_ENVOYER } from '../src/shared/liens-a-envoyer-pur';
import { ACCUEIL, COMMUN, PAGES } from '../src/apps/revelateur/contenu';
import { EN_ENTRE_DEUX } from '../src/apps/couronne/i18n/en-entre-deux';
import { EN_DIAGNOSTIC } from '../src/apps/couronne/i18n/en-diagnostic';
import { EN_VISIO } from '../src/apps/couronne/i18n/en-visio';

let ko = 0;
let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${JSON.stringify(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const lit = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
/* « image/* » (un accept de fichier) n'ouvre pas un commentaire (leçon du 19 octobre 2026, verifie-le-diagnostic-photo). */
const sansCommentaires = (t: string) => t.replace(/image\/\*/g, 'image/tout').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sql = (f: string) => lit(f).replace(/--.*$/gm, '');
const entre = (src: string, nom: string): string => {
  const ouvre = `/* ⟨${nom}⟩ */\n`;
  const i = src.indexOf(ouvre);
  const k = src.indexOf(`\n/* ⟨/${nom}⟩ */`, i);
  return i < 0 || k < 0 ? 'absent' : src.slice(i + ouvre.length, k);
};

const AUJ = '2026-11-17';
const HIER = '2026-11-16';
const DEMAIN = '2026-11-18';
const POSE = '2026-11-10T09:00:00.000Z';
const OUI = '2026-11-12T08:00:00.000Z';

/* ── 1. LA RÈGLE : un rendez-vous pris, ou une séance faite ── */
{
  dit('une séance faite : honorée, aujourd’hui ou avant', [true, true, false, false, false, false], [
    estUneSeanceFaite({ status: 'honoré', date: HIER }, AUJ), estUneSeanceFaite({ status: 'honoré', date: AUJ }, AUJ),
    estUneSeanceFaite({ status: 'honoré', date: DEMAIN }, AUJ), estUneSeanceFaite({ status: 'confirmé', date: HIER }, AUJ),
    estUneSeanceFaite({ status: 'honoré' }, AUJ), estUneSeanceFaite(null, AUJ),
  ]);
  dit('un rendez-vous pris : confirmé, aujourd’hui ou plus tard', [true, true, false], [
    estUnRendezVousPris({ status: 'confirmé', date: DEMAIN }, AUJ), estUnRendezVousPris({ status: 'confirmé', date: AUJ }, AUJ),
    estUnRendezVousPris({ status: 'confirmé', date: HIER }, AUJ),
  ]);
  dit('« en attente » ne compte pas comme pris, ni annulé, ni honoré, ni un statut inconnu', [false, false, false, false, false], [
    estUnRendezVousPris({ status: 'en attente', date: DEMAIN }, AUJ), estUnRendezVousPris({ status: 'annulé', date: DEMAIN }, AUJ),
    estUnRendezVousPris({ status: 'honoré', date: DEMAIN }, AUJ), estUnRendezVousPris({ status: 'Confirmé', date: DEMAIN }, AUJ),
    estUnRendezVousPris({ date: DEMAIN }, AUJ),
  ]);
  dit('une suggestion de la Maison sans son oui ne compte pas ; avec son oui, elle compte', [false, true, false], [
    estUnRendezVousPris({ status: 'confirmé', date: DEMAIN, suggereLe: POSE }, AUJ),
    estUnRendezVousPris({ status: 'confirmé', date: DEMAIN, suggereLe: POSE, confirmeeParLaClienteLe: OUI }, AUJ),
    estUnRendezVousPris({ status: 'confirmé', date: DEMAIN, suggereLe: POSE, confirmeeParLaClienteLe: '  ' }, AUJ),
  ]);
  /* La règle recopiée dans deux fonctions ne peut pas importer `estSuggere` : elle doit dire la même chose. */
  const marques = [undefined, '', POSE];
  const statuts = ['confirmé', 'en attente', 'honoré', 'annulé'];
  const ecarts: string[] = [];
  for (const status of statuts) for (const suggereLe of marques) for (const confirmeeParLaClienteLe of [undefined, '', OUI]) {
    const a = { status, date: DEMAIN, suggereLe, confirmeeParLaClienteLe };
    const pris = estUnRendezVousPris(a, AUJ);
    const attendu = status === 'confirmé' && !estSuggere(a);
    if (pris !== attendu) ecarts.push(JSON.stringify(a));
  }
  dit('la règle et `estSuggere` (rendez-vous-suggere-pur) disent la même chose, sur toutes les marques', [], ecarts);
  /* UNE PLACE PRISE EN LIGNE QUI ATTEND (18 novembre 2026, l'assemblage) : elle compte quand elle est FERME,
     comme le dit `estFerme` (rendez-vous-en-attente-pur) : son oui, et l'acompte reçu quand il y en a un. */
  const ATT = '2026-11-18T12:00:00.000Z';
  dit('une place du site en attente ne compte pas : ni sans son oui, ni avec son oui et son acompte à recevoir ; ferme, elle compte', [false, false, true, true], [
    estUnRendezVousPris({ status: 'confirmé', date: DEMAIN, suggereLe: POSE, attenduJusquAu: ATT }, AUJ),
    estUnRendezVousPris({ status: 'confirmé', date: DEMAIN, suggereLe: POSE, attenduJusquAu: ATT, confirmeeParLaClienteLe: OUI, depositXof: 10000, depositConfirmed: false }, AUJ),
    estUnRendezVousPris({ status: 'confirmé', date: DEMAIN, suggereLe: POSE, attenduJusquAu: ATT, confirmeeParLaClienteLe: OUI, depositXof: 10000, depositConfirmed: true }, AUJ),
    estUnRendezVousPris({ status: 'confirmé', date: DEMAIN, suggereLe: POSE, attenduJusquAu: ATT, confirmeeParLaClienteLe: OUI }, AUJ),
  ]);
  const ecartsDeLAttente: string[] = [];
  for (const confirmeeParLaClienteLe of [undefined, OUI]) for (const depositXof of [undefined, 0, 10000]) for (const depositConfirmed of [undefined, false, true]) {
    const a = { status: 'confirmé', date: DEMAIN, suggereLe: POSE, attenduJusquAu: ATT, confirmeeParLaClienteLe, depositXof, depositConfirmed };
    if (estUnRendezVousPris(a, AUJ) !== estFerme(a)) ecartsDeLAttente.push(JSON.stringify(a));
  }
  dit('pour une place née en attente, la règle et `estFerme` (rendez-vous-en-attente-pur) disent la même chose', [], ecartsDeLAttente);
  dit('une date illisible ne compte jamais ; une date avec son heure se lit par son jour', [false, false, true, true], [
    estUnRendezVousPris({ status: 'confirmé', date: 'demain' }, AUJ), estUneSeanceFaite({ status: 'honoré', date: 20261116 }, AUJ),
    estUnRendezVousPris({ status: 'confirmé', date: `${DEMAIN}T10:00:00Z` }, AUJ), estUneSeanceFaite({ status: 'honoré', date: `${HIER}T10:00:00Z` }, AUJ),
  ]);
  const jamais = [{ status: 'en attente', date: DEMAIN }, { status: 'confirmé', date: HIER }, { status: 'annulé', date: DEMAIN }, { status: 'confirmé', date: DEMAIN, suggereLe: POSE }];
  dit('une cliente que la Maison ne reçoit pas : ni séance, ni rendez-vous pris', [false, false, false, false],
    [aEuUneSeance(jamais, AUJ), aUnRendezVousPris(jamais, AUJ), aUnRendezVousPrisOuUneSeanceFaite(jamais, AUJ), aUnRendezVousPrisOuUneSeanceFaite([], AUJ)]);
  dit('une séance faite suffit ; un rendez-vous pris suffit ; « Un souci ? » demande la séance', [[true, false, true], [false, true, true]], [
    [aEuUneSeance([...jamais, { status: 'honoré', date: HIER }], AUJ), aUnRendezVousPris([...jamais, { status: 'honoré', date: HIER }], AUJ), aUnRendezVousPrisOuUneSeanceFaite([...jamais, { status: 'honoré', date: HIER }], AUJ)],
    [aEuUneSeance([...jamais, { status: 'confirmé', date: DEMAIN }], AUJ), aUnRendezVousPris([...jamais, { status: 'confirmé', date: DEMAIN }], AUJ), aUnRendezVousPrisOuUneSeanceFaite([...jamais, { status: 'confirmé', date: DEMAIN }], AUJ)],
  ]);
  dit('aujourd’hui se lit à Cotonou (UTC+1) : 23 h 30 UTC, c’est déjà demain', ['2026-11-17', '2026-11-18'],
    [aujourdhuiACotonou(Date.parse('2026-11-17T10:00:00Z')), aujourdhuiACotonou(Date.parse('2026-11-17T23:30:00Z'))]);
  dit('le chemin de la consultation est relatif à l’origine, sans nom de domaine', '/consultation/', CHEMIN_DE_LA_CONSULTATION);
  const original = entre(lit('src/shared/rendez-vous-pris-pur.ts'), 'rendez-vous-pris');
  dit('la règle est recopiée, caractère pour caractère, dans whatsapp-automate et diagnostic-locks', [true, true, true], [
    original.length > 500, entre(lit('supabase/functions/whatsapp-automate/index.ts'), 'rendez-vous-pris') === original,
    entre(lit('supabase/functions/diagnostic-locks/index.ts'), 'rendez-vous-pris') === original,
  ]);
}

/* ── 2. L'ANCIEN TUNNEL, LA PAPETERIE DU BILAN, LE CERTIFICAT : l'équipe connectée seule ── */
{
  const e = (o: Partial<Parameters<typeof etatDeLaPorteDeLEquipe>[0]>) =>
    etatDeLaPorteDeLEquipe({ serveur: true, chargement: false, session: true, pret: true, personnel: true, ...o });
  dit('la porte de l’équipe : une session du personnel entre ; une visiteuse et une cliente connectée restent dehors', ['equipe', 'dehors', 'dehors'],
    [e({}), e({ session: false, personnel: false }), e({ personnel: false })]);
  dit('... tant que la session ou la fiche du personnel n’ont pas répondu, rien ne s’affiche (jamais conclure d’une panne)', ['attente', 'attente'],
    [e({ chargement: true }), e({ pret: false, personnel: false })]);
  dit('... sans session, on n’attend pas la fiche : dehors tout de suite', 'dehors', e({ session: false, pret: false, personnel: false }));
  dit('... sans serveur (un poste de développement), la porte est ouverte comme le Trône', 'equipe', e({ serveur: false, session: false, personnel: false, pret: false }));
  dit('les trois sorties : une ligne, un chemin relatif ; seul le tunnel y mène sans toucher', [
    ['La consultation se prend ici.', '/consultation/', true], ['Votre bilan se lit dans Ma Couronne.', '/couronne/', false], ['Un certificat se vérifie auprès de l’Académie MND.', '/academie/', false],
  ], (['tunnel', 'bilan', 'certificat'] as const).map((p) => [SORTIES_DE_LA_PORTE[p].ligne, SORTIES_DE_LA_PORTE[p].vers, SORTIES_DE_LA_PORTE[p].mene]));
  dit('aucune sortie n’explique la porte fermée, aucune ne porte de nom de domaine', [false, false],
    [Object.values(SORTIES_DE_LA_PORTE).some((s) => /réserv|équipe|ferm|accès|connect/i.test(s.ligne)), [...Object.values(SORTIES_DE_LA_PORTE).map((s) => s.vers), ENTREE_DU_TRONE].some((v) => !v.startsWith('/') || /\./.test(v))]);

  const porte = sansCommentaires(lit('src/shared/porte-de-l-equipe.tsx'));
  dit('la porte lit la session du Trône et la fiche du personnel, par la règle pure', [true, true],
    [/etatDeLaPorteDeLEquipe\(\{ serveur: authEnabled, chargement: loading, session: !!session, pret, personnel: !!tete \}\)/.test(porte), /const \{ tete, pret \} = useMaTete\(\);/.test(porte)]);
  dit('... l’outil ne se rend qu’à l’équipe ; dehors, la visiteuse est menée par le code', [true, true],
    [/if \(etat === 'equipe'\) return <>\{children\}<\/>;/.test(porte), /if \(etat === 'dehors' && sortie\.mene\) window\.location\.replace\(sortie\.vers\);/.test(porte)]);
  const entrees: [string, string][] = [['src/apps/consultation/main.tsx', 'tunnel'], ['src/apps/bilan/main.tsx', 'bilan'], ['src/apps/certificat/main.tsx', 'certificat']];
  dit('les trois pages sont derrière la porte', entrees.map(() => true),
    entrees.map(([f, page]) => new RegExp(`<PorteDeLEquipe page="${page}">[\\s\\S]{0,160}<\\/PorteDeLEquipe>`).test(sansCommentaires(lit(f)))));
  const tunnel = sansCommentaires(lit('src/apps/consultation/main.tsx'));
  dit('le code du tunnel ne se charge qu’après la porte (jamais importé d’emblée)', [true, false],
    [/const Tunnel = lazy\(\(\) => import\('\.\/App'\)\);/.test(tunnel), /import App from '\.\/App'/.test(tunnel)]);
  dit('le péage ne se passe plus sans paiement vérifié, sauf par l’équipe', [true, false], [peutPoursuivreSansVerdict(true), peutPoursuivreSansVerdict(false)]);
  const app = sansCommentaires(lit('src/apps/consultation/App.tsx'));
  dit('... les deux passages (« je règle à la Maison », « j’ai réglé moi-même ») ne s’offrent qu’à elle, et le geste se refuse aux autres', [true, true, true, true], [
    /const sansVerdictPermis = peutPoursuivreSansVerdict\(useEtatDeLaPorteDeLEquipe\(\) === 'equipe'\);/.test(app),
    /\) : sansVerdictPermis \? \(\s*<button type="button" className="lc-pay__btn" onClick=\{\(\) => poursuivreSansPaiement\('aucun'\)\}>/.test(app),
    /\{sansVerdictPermis && \(\s*<button type="button" className="lc-back" style=\{\{ marginTop: 12 \}\} onClick=\{\(\) => poursuivreSansPaiement\('declare'\)\}>/.test(app),
    /const poursuivreSansPaiement = \(reglement: Reglement\) => \{\s*if \(!sansVerdictPermis\) return;/.test(app),
  ]);
  dit('... chaque appel de ce geste est derrière la règle', (app.match(/poursuivreSansPaiement\('/g) ?? []).length, (app.match(/sansVerdictPermis (\?|&&) \(\s*<button [\s\S]{0,140}?poursuivreSansPaiement\('/g) ?? []).length);
  const portail = sansCommentaires(lit('src/portal/Portal.tsx'));
  /* Le lien de la carte reste celui que pose build-sites (l'adresse du tunnel) : la porte y mène la visiteuse à la consultation du site. */
  dit('le portail ne vend plus le tunnel payant : sa carte dit la consultation en ligne', [false, true],
    [/diagnostic payant|paiement à l\\'entrée/.test(portail), /who: 'La cliente · en ligne'/.test(portail)]);
}

/* ── 3. LE DIAGNOSTIC DU MENU : fermé ; sa routine, rangée à la Maison ── */
{
  dit('le menu mène à la consultation ; plus aucun lien du site ne mène à /mon-parcours/', [true, false, false], [
    COMMUN.nav.some((l) => l.texte === 'Consultation' && l.vers === '/consultation/'),
    COMMUN.nav.some((l) => /diagnostic/i.test(l.texte)),
    JSON.stringify({ COMMUN, ACCUEIL, PAGES }).includes('/mon-parcours/'),
  ]);
  dit('/mon-parcours/ n’est plus une page du plan, et plus aucune page ne monte le triage', [false, false],
    [PAGES.some((p) => p.chemin === '/mon-parcours/'), PAGES.some((p) => (p.ilot as string | undefined) === 'triage')]);
  dit('la carte de l’accueil mène à la consultation, et dit où se remet la routine', ['/consultation/', true, true],
    [ACCUEIL.diagnostic.bouton.vers, /rendez-vous/.test(ACCUEIL.diagnostic.note), ACCUEIL.diagnostic.ligne.length <= 70]);
  dit('la consultation a toujours sa page', true, PAGES.some((p) => p.chemin === '/consultation/' && p.ilot === 'consultation'));
  const gen = lit('scripts/genere-revelateur.mjs');
  const genNu = sansCommentaires(gen);
  dit('l’ancienne adresse reste : une page hors des moteurs et hors du plan, qui mène à la consultation (script, rafraîchissement, bouton)', [true, true, true, true, false], [
    /writeFileSync\(path\.join\(SORTIE, 'mon-parcours', 'index\.html'\), pageAccentuee\(\{/.test(genNu),
    /const VERS_LA_CONSULTATION = lien\('\/consultation\/'\);/.test(genNu),
    /location\.replace\(\$\{JSON\.stringify\(VERS_LA_CONSULTATION\)\}\);<\/script>/.test(genNu),
    /<meta name="robots" content="noindex" \/><meta http-equiv="refresh" content="0; url=\$\{attr\(VERS_LA_CONSULTATION\)\}" \/>/.test(genNu),
    /pagesEcrites\.push\('\/mon-parcours\/'\)/.test(genNu),
  ]);
  dit('le site n’écrit plus la première question et ne monte plus l’îlot, ni sur l’accueil ni ailleurs', [false, false, false, false, true], [
    /data-ilot="triage"/.test(genNu), /questionDuDiagnostic/.test(genNu), existsSync('src/apps/revelateur/ilots/Triage.tsx'),
    /triage:/.test(sansCommentaires(lit('src/apps/revelateur/monte.tsx'))),
    /<div class="rangee">\$\{bouton\(a\.diagnostic\.bouton, 'btn btn--plein'\)\}<\/div>/.test(genNu),
  ]);
  dit('la page introuvable mène à la consultation', [true, false], [/href="\$\{lien\('\/consultation\/'\)\}">Ma consultation<\/a>/.test(genNu), /lien\('\/mon-parcours\/'\)/.test(genNu)]);

  /* La routine, mot pour mot celle du site (27 et 28 septembre 2026). */
  dit('les cinq questions sont gardées, dans l’ordre', ['etat', 'cheveu', 'cuir', 'soucis', 'rythme'], QUESTIONS_DE_LA_ROUTINE.map((q) => q.cle));
  dit('... leurs réponses aussi (cinq, quatre, quatre, six, quatre) ; deux se cochent, avec leur « rien de tout ça »', [[5, 4, 4, 6, 4], ['ok', 'rien']],
    [QUESTIONS_DE_LA_ROUTINE.map((q) => q.reponses.length), QUESTIONS_DE_LA_ROUTINE.filter((q) => q.multi).map((q) => q.exclusif)]);
  const a = composeLaRoutine({ etat: 'aucune', cheveu: 'fin', cuir: ['sec'], soucis: ['rien'], rythme: 'mensuel' });
  dit('sans locks, cheveu fin, cuir sec : on crée ; ses gestes de la semaine, du mois, de la saison', ['creation', [
    'Brumisez le cuir chevelu d’eau puis d’une huile légère, sans charger les longueurs.',
    'Dormez sous un foulard ou une taie en satin : c’est la moitié de l’hydratation.',
  ], [
    'Avant la pose : deux ou trois lavages clarifiants et aucun produit lourd, pour que le cheveu accroche.',
    'Cheveu fin : jamais un resserrage trop serré, des locks un peu plus larges qui tiendront des années.',
  ], ['Un soin profond à la vapeur, protéiné ou hydratant selon la saison, et un bilan de la couronne avec la Maison.'],
  'Un rendez-vous chaque mois : la Maison vous propose l’abonnement, pour ne plus y penser.'], [a.porte, a.semaine, a.mois, a.saison, a.maison]);
  const b = composeLaRoutine({ etat: 'anciennes', cheveu: 'epais', cuir: ['gras', 'sensible'], soucis: ['racines', 'secheresse', 'residus'], rythme: 'six' });
  dit('des locks anciennes aux racines à reprendre passent par la réparation ; cinq gestes par semaine, dans l’ordre', ['reparation', 5,
    'Un lavage doux par semaine, clarifiant et sans résidu, et pas d’huile sur le cuir chevelu.',
    'Rincez longtemps, essorez à la serviette microfibre, séchez complètement : l’odeur vient de l’humidité qui reste.',
    ['Toutes les six à huit semaines : allègement des racines et contrôle des longueurs, qui portent leur poids.']],
  [b.porte, b.semaine.length, b.semaine[0], b.semaine[4], b.mois]);
  const c = composeLaRoutine({ etat: 'enfant', cheveu: 'moyen', cuir: ['ok'], soucis: ['casse', 'changement'], rythme: 'apprendre' });
  dit('un enfant va chez MND Kids, quoi qu’il arrive ; la casse et le changement ont leurs gestes', ['kids', 2, 2, 'On ne resserre pas ce qui casse.'],
    [c.porte, c.mois.length, c.saison.length, c.mois[1].replace(/^.*: o/, 'O')]);
  dit('les portes : apprendre, casser, changer, entretenir', ['formation', 'reparation', 'reparation', 'entretien', 'entretien'], [
    composeLaRoutine({ etat: 'mures', rythme: 'apprendre', soucis: ['casse'] }).porte, composeLaRoutine({ etat: 'jeunes', soucis: ['casse'] }).porte,
    composeLaRoutine({ etat: 'mures', soucis: ['changement'] }).porte, composeLaRoutine({ etat: 'jeunes', soucis: ['racines'] }).porte,
    composeLaRoutine({ etat: 'mures', soucis: ['rien'] }).porte,
  ]);
  dit('chaque porte a son nom', ['Première Couronne', 'MND Kids', 'Académie MND', 'Réparation', 'Entretien'],
    (['creation', 'kids', 'formation', 'reparation', 'entretien'] as const).map((p) => PORTES_DE_LA_ROUTINE[p]));
  const routine = `${JSON.stringify(a)}${JSON.stringify(b)}${JSON.stringify(c)}`;
  dit('la routine ne nomme ni prix ni marque : des gestes', false, /\d\s?(F|FCFA|XOF)\b|™|Aroma|Arganicare|Bronner|Oréal|T444Z|SheaMoisture/i.test(routine));
  const qCuir = QUESTIONS_DE_LA_ROUTINE[2];
  dit('toucher : « rien de tout ça » efface les autres, toute autre l’efface, un second toucher décoche', [['ok'], ['sec'], ['sec', 'gras'], ['gras'], []], [
    touche({ cuir: ['sec', 'gras'] }, qCuir, 'ok').cuir, touche({ cuir: ['ok'] }, qCuir, 'sec').cuir, touche({ cuir: ['sec'] }, qCuir, 'gras').cuir,
    touche({ cuir: ['sec', 'gras'] }, qCuir, 'sec').cuir, touche({ cuir: ['ok'] }, qCuir, 'ok').cuir,
  ]);
  dit('une question simple garde une seule réponse', 'mures', touche({ etat: 'jeunes' }, QUESTIONS_DE_LA_ROUTINE[0], 'mures').etat);
  dit('la routine ne se compose qu’avec les cinq réponses', [false, false, true],
    [reponsesCompletes({}), reponsesCompletes({ etat: 'mures', cheveu: 'fin', cuir: [], soucis: ['rien'], rythme: 'six' }), reponsesCompletes({ etat: 'mures', cheveu: 'fin', cuir: ['ok'], soucis: ['rien'], rythme: 'six' })]);
  const message = messageDeLaRoutine(a, ' Mme   Awa ');
  /* Dix lignes : le salut, trois titres, cinq gestes, la ligne de la Maison. */
  dit('le message de la Maison : son appel, les trois temps, chaque geste sur sa ligne, ce que fait la Maison', [true, true, true, true, 10], [
    message.startsWith('Bonjour Mme Awa, voici votre routine, en trois temps.\nChaque semaine :\n· Brumisez'),
    message.includes('\nChaque mois :\n· Avant la pose'), message.includes('\nChaque saison :\n· Un soin profond'),
    message.endsWith('À la Maison : Un rendez-vous chaque mois : la Maison vous propose l’abonnement, pour ne plus y penser.'), message.split('\n').length,
  ]);
  dit('... sans appel, « Bonjour, » ; jamais un « Madame » supposé ; ni émoji ni tiret long', [true, false, false],
    [messageDeLaRoutine(a).startsWith('Bonjour, voici votre routine'), /Madame/.test(messageDeLaRoutine(a)), /\p{Extended_Pictographic}|—/u.test(message)]);
  const fenetre = sansCommentaires(lit('src/apps/trone/routes/clients/LaRoutineDeSoins.tsx'));
  const fiche = sansCommentaires(lit('src/apps/trone/routes/clients/Customers.tsx'));
  dit('le Trône la donne depuis la fiche d’une cliente : « Sa routine », la devise posée par le code, les deux portes de WhatsApp', [true, true, true, true, true], [
    /onClick=\{\(\) => setRoutineOuverte\(true\)\}\s*>\s*Sa routine\s*<\/button>/.test(fiche),
    /\{routineOuverte && \(\s*<LaRoutineDeSoins/.test(fiche),
    /const texte = routine \? signeLeMessage\(messageDeLaRoutine\(routine, salut\)\) : '';/.test(fenetre),
    /cheminDeLaConversation\(tel, texte\)/.test(fenetre), /lienWaMe\(tel, texte\)/.test(fenetre),
  ]);
  dit('... rien ne s’écrit en base : c’est un message, pas une pièce', false, /supabase|Store\b|\.insert\(|\.upsert\(/.test(fenetre));
}

/* ── 4. « UN SOUCI AVEC VOS LOCKS ? » : après une séance ── */
{
  const ed = sansCommentaires(lit('src/apps/couronne/EntreDeux.tsx'));
  dit('Ma Couronne : la question et le souci ne s’offrent qu’après une séance faite', [true, true, true], [
    /const dejaVenue = aEuUneSeance\(appts, aujourdhui\(\)\);/.test(ed),
    /if \(etat === 'envoi' \|\| !dejaVenue\) return;/.test(ed),
    /if \(!point \|\| !dejaVenue\) return;/.test(ed),
  ]);
  dit('... jamais venue : une ligne et le chemin de la consultation ; son premier rendez-vous déjà pris : rien', [true, true, true], [
    /if \(!dejaVenue\) \{\s*if \(aUnRendezVousPris\(appts, aujourdhui\(\)\)\) return null;/.test(ed),
    /\{t\('Un souci avec vos locks \?'\)\}\{' '\}\s*<a className="mc-ed-lien" href=\{CHEMIN_DE_LA_CONSULTATION\}>\{t\('Ma consultation'\)\}<\/a>/.test(ed),
    ed.indexOf('if (!dejaVenue) {') < ed.indexOf("t('Un souci avec vos locks ? Dites-le-nous.')"),
  ]);
  dit('... ce qu’elle lit a son anglais, sans clé en double', ['A concern with your locks?', 'My consultation', false],
    [EN_ENTRE_DEUX['Un souci avec vos locks ?'], EN_VISIO['Ma consultation'], 'Ma consultation' in EN_ENTRE_DEUX || 'Ma consultation' in EN_DIAGNOSTIC]);
  const m = sql('supabase/migrations/0226_un_souci_apres_une_seance.sql');
  dit('0226 : une séance faite se lit comme la règle (honorée, aujourd’hui ou avant, au jour de Cotonou)', [true, true, true], [
    /a\.data->>'status' = 'honoré'/.test(m), /left\(a\.data->>'date', 10\) <= to_char\(now\(\) at time zone 'Africa\/Porto-Novo', 'YYYY-MM-DD'\)/.test(m),
    /a\.data->>'clientId' = cible/.test(m),
  ]);
  dit('... elle ne répond qu’au personnel et à la cliente elle-même ; rien pour le public', [true, true, true], [
    /select \(public\.is_staff\(\) or public\.est_ma_tete\(cible\)\)\s+and exists \(/.test(m),
    /revoke all on function public\.a_eu_une_seance\(text\) from public, anon;/.test(m),
    /grant execute on function public\.a_eu_une_seance\(text\) to authenticated;/.test(m),
  ]);
  const depot = (s: string) => /create or replace function public\.signalement_de_cliente_valide\(d jsonb\) returns boolean\s+language sql stable as \$\$([\s\S]*?)\$\$/.exec(s)?.[1].replace(/\s+/g, ' ').trim() ?? 'absent';
  const avant = depot(sql('supabase/migrations/0132_entre_deux_seances.sql'));
  dit('... le dépôt d’une cliente garde ses conditions de 0132, mot pour mot, et y ajoute la séance faite', [true, `${avant} and public.a_eu_une_seance(d->>'clientId')`], [avant.length > 200, depot(m)]);
  dit('... le personnel dépose toujours : la règle sig_deposer de 0132 n’est pas réécrite', [false, false], [/create policy|drop policy/.test(m), /alter table|delete from|update public/.test(m)]);
}

/* ── 5. L'AVIS SUR PHOTO PAR WHATSAPP : avec un rendez-vous ── */
{
  const consigne = consigneDOpale();
  /* 18 novembre 2026, avec « Opale ne perd aucun rendez-vous » : la photo sert au prix et à la place, jamais à un avis sans rendez-vous. */
  dit('Opale ne demande une photo que pour le prix, jamais un avis, et ne passe plus la main pour toute photo', [true, false, true], [
    consigne.includes('Ne demande une photo que pour estimer leur nombre et leur longueur.'), consigne.includes('une photo ou un vocal (tu ne les vois pas'),
    consigne.includes('ne passe pas la main. Une seule ligne, sans expliquer pourquoi'),
  ]);
  const c: ContexteDOpale = {
    maintenantMs: Date.parse('2026-11-17T10:00:00Z'), aujourdhui: AUJ, heureDuJour: '11 h', reouverture: null, heures: [], fiches: [], rdvs: [], connaitLeLieu: false,
    adresse: 'Ilot 130-F', liens: { catalogue: 'https://maisonmnd.com/reserver/?besoin=entretien', creation: 'cr', reparation: 'r' }, paiements: [], offres: [], catalogue: [],
    fil: [], nouveaux: [{ sens: 'entrant', texte: '', quand: '2026-11-17T09:59:00Z', type: 'image' }], nomDe: (x) => x,
  };
  dit('le contexte dit la porte à Opale : fermée à défaut, avec le lien de la consultation ; ouverte pour une cliente suivie', [true, true, true, false], [
    contexteDOpale(c).includes('L’avis sur photo : elle n’a ni rendez-vous pris ni séance faite à la Maison.'),
    contexteDOpale(c).includes('https://maisonmnd.com/consultation/'),
    contexteDOpale({ ...c, suivie: true }).includes('L’avis sur photo : elle a un rendez-vous pris ou une séance faite à la Maison.'),
    contexteDOpale({ ...c, suivie: true }).includes('ni rendez-vous pris ni séance faite'),
  ]);
  dit('le lien de la consultation se déduit du site, il n’est écrit nulle part à part', ['https://maisonmnd.com/consultation/', 0],
    [lienDeLaConsultation('https://maisonmnd.com/reserver/?besoin=entretien'), (sansCommentaires(lit('supabase/functions/whatsapp-automate/index.ts')).match(/['"`]https:\/\/[^'"`]*\/consultation\//g) ?? []).length]);
  const wa = sansCommentaires(lit('supabase/functions/whatsapp-automate/index.ts'));
  dit('la fonction juge par la règle recopiée, sur les fiches du numéro ; illisible, la porte reste fermée', [true, true, true], [
    /const suivie = await aUnRendezVousOuUneSeanceWa\(sb, fiches, aujourdhui\);/.test(wa),
    /\.eq\('data->>status', 'confirmé'\)\.gte\('data->>date', aujourdhui\)\.limit\(40\);\s*if \(error\) \{[\s\S]{0,140}?return false; \}/.test(wa),
    /return aUnRendezVousPrisOuUneSeanceFaite\(\(\(data \?\? \[\]\) as Ligne\[\]\)\.map\(\(l\) => \(l\.data \?\? \{\}\) as RendezVousLu\), aujourdhui\);/.test(wa),
  ]);
  dit('... la main ne passe pas, et le lien est posé par le code, jamais laissé au modèle', [true, true], [
    /if \(photoRefusee && \(motif === 'media' \|\| tourSansUnMot\(nouveaux\)\)\) \{[^}]*return refusDeLAvisSurPhoto\(lienConsultation\); \}/.test(wa),
    /* … sauf quand elle a proposé sa place (18 novembre 2026, « Opale ne perd aucun rendez-vous »). */
    /if \(photoRefusee && !finDuRituel && !issue\.silence && issue\.issue\.genre === 'parle' && !enAttente\) issue\.texte = avecLeLienDeLaConsultation\(issue\.texte, lienConsultation\);/.test(wa),
  ]);
  dit('la fonction dit sa version du jour', true, /const VERSION = '2026-11-18-b · plus d avis sur photo sans rendez-vous/.test(wa));
  const reception = consigneDeLaReception();
  dit('la réception (l’automate en réserve) ne demande plus de photo non plus', [false, true],
    [/demande-lui une photo/.test(reception), reception.includes('ne demande aucune photo ; dis en une ligne que la Maison le regarde avec elle au rendez-vous')]);
  dit('... et sa fonction porte la version du jour', true, /const VERSION = '2026-11-18-b';/.test(lit('scripts/serveur/reception-wa.ts')));
  dit('le texte proposé pour « ma longueur suffit ? » ne demande plus de photo ; l’ancien est nommé pour le réglage en base', [false, true, true], [
    /photo/i.test(TEXTES_PROPOSES['r-longueur']), /rendez-vous/.test(TEXTES_PROPOSES['r-longueur']),
    lit('supabase/reglage_plus_d_avis_sur_photo_20261117.sql').split(ANCIEN_TEXTE_DE_LA_LONGUEUR).length - 1 === 2
      && lit('supabase/reglage_plus_d_avis_sur_photo_20261117.sql').includes(`'texte', '${TEXTES_PROPOSES['r-longueur']}'`),
  ]);
}

/* ── 6. LE DIAGNOSTIC PHOTO DE MA COURONNE : la fonction tient la porte ── */
{
  const f = sansCommentaires(lit('supabase/functions/diagnostic-locks/index.ts'));
  dit('la fonction juge avant le coffre et avant Claude, par la règle recopiée', [true, true], [
    /const suivie = aUnRendezVousPrisOuUneSeanceFaite\(await o\.base\.rdvs\(porte\.clientId\), jourACotonou\(maintenant\)\);/.test(f),
    f.indexOf('if (!laPorte.ouverte) {') > 0 && f.indexOf('if (!laPorte.ouverte) {') < f.indexOf('o.base.depose(chemin'),
  ]);
  dit('... sans rendez-vous, ses lectures passées restent sous clé', true,
    /const visibles = !laPorte\.ouverte && laPorte\.raison === 'rendez-vous' \? \[\] : miens;/.test(f));
  dit('une consultation réglée n’a pas de rendez-vous à montrer, mais elle a le même plafond', true,
    /if \(porte\.source !== 'couronne'\) return porteDeMaCouronne\(\{ suivie: true, lignes: miens, maintenantMs: maintenant, plafond \}\);/.test(f));
  dit('le plafond d’origine : deux lectures par trente jours ; la direction le règle au Trône', [{ lectures: 2, jours: 30 }, true],
    [PLAFOND_PAR_CLIENTE_LIVRE, /data-diagnostic="plafond"/.test(lit('src/apps/trone/routes/systeme/CarteDiagnosticPhoto.tsx'))]);
  dit('ce que lit la cliente : une ligne, sans raison ; en deux langues', [
    'Le diagnostic photo s’ouvre avec votre rendez-vous.', 'The photo reading opens with your appointment.', 'Your next photo reading opens on {date}.',
  ], [MOTS_DES_REFUS['rendez-vous'], EN_DIAGNOSTIC['Le diagnostic photo s’ouvre avec votre rendez-vous.'], EN_DIAGNOSTIC['Votre prochaine lecture de photos s’ouvre le {date}.']]);
  dit('... chaque refus neuf a son anglais', [true, true], [MOTS_DES_REFUS['rendez-vous'] in EN_DIAGNOSTIC, MOTS_DES_REFUS.plafond in EN_DIAGNOSTIC]);
}

/* ── 7. LES LIENS DÉJÀ ENVOYÉS ET IMPRIMÉS ouvrent toujours une page ── */
{
  dit('les liens à envoyer gardent leurs adresses', ['reserver/', 'reserver/?besoin=creation', 'reserver/?besoin=reparation', 'reserver/?besoin=entretien', 'reserver/?besoin=enfant', 'venir/'],
    LIENS_A_ENVOYER.map((l) => l.chemin));
  const gen = sansCommentaires(lit('scripts/genere-revelateur.mjs'));
  dit('... et leurs pages s’écrivent toujours : la réservation, l’itinéraire, la consultation', [true, true, true], [
    PAGES.some((p) => p.chemin === '/reserver/' && p.ilot === 'reserver'), /path\.join\(SORTIE, 'venir', 'index\.html'\)/.test(gen), PAGES.some((p) => p.chemin === '/consultation/'),
  ]);
}

console.log(ko ? `\n${ko} ECHEC(S) sur ${n}.` : `\nLes autres portes tiennent (${n} controles).`);
process.exit(ko ? 1 : 0);
