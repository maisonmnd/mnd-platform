import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES AUTRES PORTES, EPROUVEES - 17 novembre 2026 (sur le modele de verifie-le-rendez-vous-suggere).
   `node scripts/verifie-les-autres-portes.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et un banc
   doit crier a chacune : celui-ci, ou, pour les deux fonctions rejouees
   ailleurs, `verifie-le-diagnostic-photo` (Ma Couronne) et `verifie-opale`
   (l'avis sur photo), nommes dans la panne. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-les-autres-portes');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-autres-portes.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } catch (e) {
    return { status: 1, stdout: '', stderr: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}
/** Un autre banc du depot, pour les fonctions qu'il rejoue. */
const lanceUnAutre = (script) => spawnSync(process.execPath, [path.join(racine, 'scripts', script)], { cwd: racine, encoding: 'utf8' });

const PUR = 'src/shared/rendez-vous-pris-pur.ts';
const PORTE = 'src/shared/porte-de-l-equipe-pur.ts';
const PORTE_ECRAN = 'src/shared/porte-de-l-equipe.tsx';
const TUNNEL = 'src/apps/consultation/main.tsx';
const TUNNEL_APP = 'src/apps/consultation/App.tsx';
const ACCES = 'src/apps/consultation/acces-pur.ts';
const ROUTINE = 'src/shared/routine-de-soins-pur.ts';
const CONTENU = 'src/apps/revelateur/contenu.ts';
const GENERATEUR = 'scripts/genere-revelateur.mjs';
const ENTRE_DEUX = 'src/apps/couronne/EntreDeux.tsx';
const SQL = 'supabase/migrations/0226_un_souci_apres_une_seance.sql';
const OPALE = 'src/shared/opale-pur.ts';
const RECEPTION = 'src/shared/reception-wa-pur.ts';
const CONSEIL = 'src/shared/conseil-wa.ts';
const AUTOMATE = 'supabase/functions/whatsapp-automate/index.ts';
const DIAGNOSTIC = 'supabase/functions/diagnostic-locks/index.ts';
const DIAGNOSTIC_PUR = 'src/shared/ia-diagnostic-pur.ts';
const MA_PHOTO = 'src/apps/couronne/MonDiagnosticPhoto.tsx';
/* Les deux bancs qui rejouent les fonctions. */
const BANC_DIAGNOSTIC = 'verifie-le-diagnostic-photo.mjs';

/** [nom, fichier, avant, apres, autre banc ?] */
const PANNES = [
  /* La regle. */
  ['un rendez-vous en attente compte comme pris', PUR, "  if (!a || a.status !== 'confirmé' || jour === '' || jour < aujourdhui) return false;", "  if (!a || (a.status !== 'confirmé' && a.status !== 'en attente') || jour === '' || jour < aujourdhui) return false;"],
  ['une suggestion sans son oui compte comme prise', PUR, '  if (marqueDuRendezVous(a.suggereLe) && !marqueDuRendezVous(a.confirmeeParLaClienteLe)) return false;\n', ''],
  ['son oui ne la rend plus prise', PUR, '  if (marqueDuRendezVous(a.suggereLe) && !marqueDuRendezVous(a.confirmeeParLaClienteLe)) return false;', '  if (marqueDuRendezVous(a.suggereLe)) return false;'],
  ['une place du site qui attend son acompte compte comme prise', PUR, "  return !(marqueDuRendezVous(a.attenduJusquAu) && Number.isFinite(acompte) && acompte > 0 && a.depositConfirmed !== true);", '  return true;'],
  ['une place du site ferme ne compte plus', PUR, "  return !(marqueDuRendezVous(a.attenduJusquAu) && Number.isFinite(acompte) && acompte > 0 && a.depositConfirmed !== true);", '  return !marqueDuRendezVous(a.attenduJusquAu);'],
  ['un rendez-vous confirme reste dans le passe compte encore', PUR, " || jour === '' || jour < aujourdhui) return false;", " || jour === '') return false;"],
  ['une seance a venir passe pour faite', PUR, "  return !!a && a.status === 'honoré' && jour !== '' && jour <= aujourdhui;", "  return !!a && a.status === 'honoré' && jour !== '';"],
  ['un rendez-vous confirme passe pour une seance faite', PUR, "  return !!a && a.status === 'honoré' && jour !== '' && jour <= aujourdhui;", "  return !!a && (a.status === 'honoré' || a.status === 'confirmé') && jour !== '' && jour <= aujourdhui;"],
  ['une date illisible compte', PUR, "(typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}/.test(v) ? v.slice(0, 10) : '')", "(typeof v === 'string' ? v.slice(0, 10) : '9999')"],
  ['« Un souci ? » se contente d un rendez-vous pris', PUR, '  rdvs.some((a) => estUneSeanceFaite(a, aujourdhui));', '  rdvs.some((a) => estUneSeanceFaite(a, aujourdhui) || estUnRendezVousPris(a, aujourdhui));'],
  ['la regle oublie la seance faite', PUR, '  rdvs.some((a) => estUneSeanceFaite(a, aujourdhui) || estUnRendezVousPris(a, aujourdhui));', '  rdvs.some((a) => estUnRendezVousPris(a, aujourdhui));'],
  ['le jour se lit a Londres', PUR, '  new Date(maintenantMs + 3_600_000).toISOString().slice(0, 10);', '  new Date(maintenantMs).toISOString().slice(0, 10);'],
  ['le chemin de la consultation porte un domaine', PUR, "export const CHEMIN_DE_LA_CONSULTATION = '/consultation/';", "export const CHEMIN_DE_LA_CONSULTATION = 'https://maisonmnd.com/consultation/';"],
  ['la copie de la regle derive dans whatsapp-automate', AUTOMATE, "  return !!a && a.status === 'honoré' && jour !== '' && jour <= aujourdhui;", "  return !!a && a.status === 'honoré' && jour !== '';"],
  ['la copie de la regle derive dans diagnostic-locks', DIAGNOSTIC, "  return !!a && a.status === 'honoré' && jour !== '' && jour <= aujourdhui;", "  return !!a && a.status === 'honoré' && jour !== '';"],
  /* La porte de l'equipe. */
  ['une cliente connectee entre dans les outils de l equipe', PORTE, "  return o.personnel ? 'equipe' : 'dehors';", "  return 'equipe';"],
  ['une visiteuse sans session entre', PORTE, "  if (!o.session) return 'dehors';", "  if (!o.session) return 'equipe';"],
  ['la fiche pas encore lue ouvre la porte', PORTE, "  if (!o.pret) return 'attente';", "  if (!o.pret) return 'equipe';"],
  ['la session pas encore lue met dehors', PORTE, "  if (o.chargement) return 'attente';", "  if (o.chargement) return 'dehors';"],
  ['le tunnel ne mene plus a la consultation', PORTE, "vers: '/consultation/', mene: true }", "vers: '/consultation/', mene: false }"],
  ['la sortie du bilan explique la porte', PORTE, "ligne: 'Votre bilan se lit dans Ma Couronne.'", "ligne: 'Cette page est réservée à l’équipe.'"],
  ['la porte rend l outil a tout le monde', PORTE_ECRAN, "  if (etat === 'equipe') return <>{children}</>;", '  if (true) return <>{children}</>;'],
  ['la porte ne lit plus la fiche du personnel', PORTE_ECRAN, 'pret, personnel: !!tete })', 'pret, personnel: true })'],
  ['le tunnel sort de derriere la porte', TUNNEL, '    <PorteDeLEquipe page="tunnel">\n      <Suspense fallback={null}>\n        <Tunnel />\n      </Suspense>\n    </PorteDeLEquipe>', '    <Suspense fallback={null}>\n      <Tunnel />\n    </Suspense>'],
  ['la papeterie du bilan sort de derriere la porte', 'src/apps/bilan/main.tsx', '    <PorteDeLEquipe page="bilan">\n      <App />\n    </PorteDeLEquipe>', '    <App />'],
  ['le certificat sort de derriere la porte', 'src/apps/certificat/main.tsx', '    <PorteDeLEquipe page="certificat">\n      <App />\n    </PorteDeLEquipe>', '    <App />'],
  ['le peage se passe sans l equipe', ACCES, 'export const peutPoursuivreSansVerdict = (equipe: boolean): boolean => equipe === true;', 'export const peutPoursuivreSansVerdict = (_equipe: boolean): boolean => true;'],
  ['« j ai regle moi-meme » revient pour tout le monde', TUNNEL_APP, '                  {sansVerdictPermis && (\n                    <button type="button" className="lc-back" style={{ marginTop: 12 }}', '                  {true && (\n                    <button type="button" className="lc-back" style={{ marginTop: 12 }}'],
  ['« je regle a la Maison » revient pour tout le monde', TUNNEL_APP, '                  ) : sansVerdictPermis ? (', '                  ) : true ? ('],
  ['le geste du peage ne se refuse plus', TUNNEL_APP, '    if (!sansVerdictPermis) return;\n', ''],
  /* Le diagnostic du menu, et sa routine. */
  ['le menu ramene au diagnostic', CONTENU, "    { texte: 'Consultation', vers: '/consultation/' },", "    { texte: 'Diagnostic', vers: '/mon-parcours/' },"],
  ['la carte de l accueil mene ailleurs', CONTENU, "    bouton: { texte: 'Ma consultation', vers: '/consultation/' },\n  },", "    bouton: { texte: 'Ma consultation', vers: '/reserver/' },\n  },"],
  ['l ancienne adresse ne mene plus a la consultation', GENERATEUR, "location.replace(${JSON.stringify(VERS_LA_CONSULTATION)});</script>`,", '</script>`,'],
  ['l ancienne adresse entre au plan du site', GENERATEUR, "}).replace('<link rel=\"canonical\"', `<meta name=\"robots\" content=\"noindex\" /><meta http-equiv=\"refresh\" content=\"0; url=${attr(VERS_LA_CONSULTATION)}\" /><link rel=\"canonical\"`));", "}).replace('<link rel=\"canonical\"', `<meta http-equiv=\"refresh\" content=\"0; url=${attr(VERS_LA_CONSULTATION)}\" /><link rel=\"canonical\"`));\npagesEcrites.push('/mon-parcours/');"],
  ['la page introuvable ramene au diagnostic', GENERATEUR, "href=\"${lien('/consultation/')}\">Ma consultation</a></div></div></div></section>`,", "href=\"${lien('/mon-parcours/')}\">Ma consultation</a></div></div></div></section>`,"],
  ['la routine perd le geste du satin', ROUTINE, "  semaine.push('Dormez sous un foulard ou une taie en satin : c’est la moitié de l’hydratation.');\n", ''],
  ['un enfant passe par la creation', ROUTINE, "  if (r.etat === 'enfant') porte = 'kids';\n  else if (r.etat === 'aucune') porte = 'creation';", "  if (r.etat === 'aucune' || r.etat === 'enfant') porte = 'creation';"],
  ['la casse ne passe plus par la reparation', ROUTINE, "  else if (s.has('casse') || s.has('changement') ||", "  else if (s.has('changement') ||"],
  ['« rien de tout ca » ne s efface plus', ROUTINE, '  if (q.exclusif) choisis.delete(q.exclusif);\n', ''],
  ['la routine se compose sans le cuir chevelu', ROUTINE, " && (r.cuir ?? []).length > 0 && (r.soucis ?? []).length > 0 && !!r.rythme;", " && (r.soucis ?? []).length > 0 && !!r.rythme;"],
  ['le message suppose un « Madame »', ROUTINE, "  return [\n    `Bonjour${a ? ` ${a}` : ''}, voici votre routine, en trois temps.`,", "  return [\n    `Bonjour ${a || 'Madame'}, voici votre routine, en trois temps.`,"],
  ['la routine part sans la devise', 'src/apps/trone/routes/clients/LaRoutineDeSoins.tsx', "  const texte = routine ? signeLeMessage(messageDeLaRoutine(routine, salut)) : '';", "  const texte = routine ? messageDeLaRoutine(routine, salut) : '';"],
  /* « Un souci avec vos locks ? ». */
  ['le souci s offre sans seance', ENTRE_DEUX, '  const dejaVenue = aEuUneSeance(appts, aujourdhui());', '  const dejaVenue = true || aEuUneSeance(appts, aujourdhui());'],
  ['le depot du souci part sans seance', ENTRE_DEUX, "    if (etat === 'envoi' || !dejaVenue) return;", "    if (etat === 'envoi') return;"],
  ['celle qui n est jamais venue n est plus menee a la consultation', ENTRE_DEUX, '<a className="mc-ed-lien" href={CHEMIN_DE_LA_CONSULTATION}>{t(\'Ma consultation\')}</a>', "<span>{t('Ma consultation')}</span>"],
  ['un texte de Ma Couronne perd son anglais', 'src/apps/couronne/i18n/en-entre-deux.ts', "  'Un souci avec vos locks ?': 'A concern with your locks?',\n", ''],
  ['la base accepte le souci sans seance', SQL, "    and public.a_eu_une_seance(d->>'clientId')\n", ''],
  ['la base lit une seance a venir', SQL, "          and left(a.data->>'date', 10) <= to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD')\n", ''],
  ['la base dit a tous qui est venue', SQL, "  select (public.is_staff() or public.est_ma_tete(cible))\n     and exists (", '  select exists ('],
  ['la base compte un rendez-vous confirme pour une seance', SQL, "          and a.data->>'status' = 'honoré'", "          and a.data->>'status' in ('honoré', 'confirmé')"],
  /* L'avis sur photo. */
  ['la consigne redemande une photo', OPALE, ' Ne demande jamais de photo, à personne.', ''],
  ['le contexte dit la porte ouverte a tout le monde', OPALE, '  l.push(c.suivie\n', '  l.push(true\n'],
  ['le lien de la consultation est ecrit en dur dans la fonction', AUTOMATE, '  const lienConsultation = lienDeLaConsultation(LIENS_D_OPALE.catalogue);', "  const lienConsultation = 'https://maisonmnd.com/consultation/';"],
  ['la fonction ne lit plus les rendez-vous confirmes seuls', AUTOMATE, "    .eq('data->>status', 'confirmé').gte('data->>date', aujourdhui).limit(40);", "    .gte('data->>date', aujourdhui).limit(40);"],
  ['la reception redemande une photo', RECEPTION, 'ne demande aucune photo ; dis en une ligne que la Maison le regarde avec elle au rendez-vous, la consultation d’abord ; suite "creation".', 'demande-lui une photo de ses cheveux, qu’une personne de la Maison regardera ; suite "equipe".'],
  ['le Trone repropose la photo pour la longueur', CONSEIL, "  'r-longueur': 'La longueur se regarde avec vous, au rendez-vous : la consultation est le premier pas, elle se réserve ci-dessous.',", "  'r-longueur': 'Envoyez-nous une photo de vos cheveux, de face et de dos.',"],
  /* Le diagnostic photo de Ma Couronne : la fonction, rejouee par son banc. */
  ['un compte suffit pour le diagnostic photo', DIAGNOSTIC, "  const suivie = aUnRendezVousPrisOuUneSeanceFaite(await o.base.rdvs(porte.clientId), jourACotonou(maintenant));", '  const suivie = true;', BANC_DIAGNOSTIC],
  ['le plafond par cliente ne tient plus', DIAGNOSTIC, "  if (!laPorte.ouverte) {\n    return laPorte.raison === 'rendez-vous' ? [403, { error: 'rendez-vous' }] : [429, { error: 'plafond', prochaineLe: laPorte.prochaineLe }];\n  }", "  if (!laPorte.ouverte && laPorte.raison === 'rendez-vous') {\n    return [403, { error: 'rendez-vous' }];\n  }", BANC_DIAGNOSTIC],
  ['une consultation reglee ouvre des lectures sans fin', DIAGNOSTIC, "  if (porte.source !== 'couronne') return porteDeMaCouronne({ suivie: true, lignes: miens, maintenantMs: maintenant, plafond });", "  if (porte.source !== 'couronne') return { ouverte: true, reste: 1 };", BANC_DIAGNOSTIC],
  ['les lectures restent lisibles sans rendez-vous', DIAGNOSTIC, "  const visibles = !laPorte.ouverte && laPorte.raison === 'rendez-vous' ? [] : miens;", '  const visibles = miens;', BANC_DIAGNOSTIC],
  ['la porte ne se juge plus avant le coffre', DIAGNOSTIC, "  const laPorte = await porteDeLaCliente(o, porte, await o.base.miens(porte));\n  if (!laPorte.ouverte) {\n    return laPorte.raison === 'rendez-vous' ? [403, { error: 'rendez-vous' }] : [429, { error: 'plafond', prochaineLe: laPorte.prochaineLe }];\n  }\n  const body = r.body;", '  const body = r.body;', BANC_DIAGNOSTIC],
  ['la fonction lit les rendez-vous en attente', DIAGNOSTIC, "      .in('data->>status', ['confirmé', 'honoré'])", "      .in('data->>status', ['confirmé', 'honoré', 'en attente'])\n      .eq('data->>status', 'honoré')", BANC_DIAGNOSTIC],
  ['le plafond compte sur une fenetre sans fin', DIAGNOSTIC_PUR, '    .filter((t) => Number.isFinite(t) && t <= o.maintenantMs && o.maintenantMs - t < fenetre)', '    .filter((t) => Number.isFinite(t) && t <= o.maintenantMs)', BANC_DIAGNOSTIC],
  ['le plafond d origine passe a dix', DIAGNOSTIC_PUR, 'export const PLAFOND_PAR_CLIENTE_LIVRE: PlafondParCliente = { lectures: 2, jours: 30 };', 'export const PLAFOND_PAR_CLIENTE_LIVRE: PlafondParCliente = { lectures: 10, jours: 30 };'],
  ['un reglage hors bornes est suivi', DIAGNOSTIC_PUR, '    return n >= bornes[0] && n <= bornes[1] ? n : defaut;', '    return Number.isFinite(n) ? n : defaut;', BANC_DIAGNOSTIC],
  ['Ma Couronne montre le diagnostic avant la reponse de la fonction', MA_PHOTO, '  if (!ouvert || porte === null) return null;', '  if (!ouvert) return null;', BANC_DIAGNOSTIC],
  ['Ma Couronne ne mene plus a la consultation', MA_PHOTO, "          <a className=\"mc-ed-lien\" href={CHEMIN_DE_LA_CONSULTATION}>{t('Ma consultation')}</a>", "          <span>{t('Ma consultation')}</span>", BANC_DIAGNOSTIC],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');
/* UN FICHIER TENU UN INSTANT PAR UN AUTRE PROGRAMME (la copie vit sous
   OneDrive : le 17 novembre 2026, une ecriture a ete refusee en pleine
   preuve, `UNKNOWN: open`). On reessaie, dix fois, un quart de seconde
   entre deux : une panne plantee ne doit jamais rester dans un vrai fichier
   parce que sa restauration a ete refusee une fois. */
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function ecris(fichier, contenu) {
  for (let essai = 0; ; essai += 1) {
    try { writeFileSync(path.join(racine, fichier), contenu); return; } catch (e) {
      if (essai >= 9) throw e;
      pause(250);
    }
  }
}

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  for (const autre of [...new Set(PANNES.map((p) => p[4]).filter(Boolean))]) {
    const r = lanceUnAutre(autre);
    if (r.status !== 0) { console.log(`${autre} ne passe pas sur le code propre :`); console.log(r.stdout); console.log(r.stderr); process.exit(1); }
  }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b, autre] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      const fois = texte.split(a).length - 1;
      if (fois !== 1) { console.log(`INTROUVABLE (${fois} fois) ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, () => b);
      try {
        ecris(fichier, crlf ? casse.replace(/\n/g, '\r\n') : casse);
        const r = autre ? lanceUnAutre(autre) : await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}${autre ? ` (${autre.replace(/\.mjs$/, '')})` : ''}`);
      } finally {
        ecris(fichier, gardes[fichier]);
      }
    }
  } finally {
    /* Chaque fichier est rendu, meme si l'un d'eux resiste : le premier refus ne prive pas les suivants. */
    let refus = null;
    for (const f of fichiers) { try { ecris(f, gardes[f]); } catch (e) { refus ??= e; console.log(`NON RENDU ${f}`); } }
    if (refus) throw refus;
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
