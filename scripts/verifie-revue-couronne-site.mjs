import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA REVUE DU 10 OCTOBRE 2026, LOT « COURONNE-SITE », EPROUVEE —
   `node scripts/verifie-revue-couronne-site.mjs` ; `--prouve` remet chaque
   faute une a une.

   Le banc tourne dans un PROCESSUS FILS, a l'heure de New York (TZ) : la
   faute du « demain » compte a l'heure de la visiteuse (constat 101) ne se
   voit pas sur une machine reglee sur Cotonou. Le client du site est
   remplace par un faux (globalThis.__faux) : aucune requete ne part.

   `--prouve` : pour chaque constat, on copie le fichier, on y remet la faute
   d'avant la correction, on rejoue le banc, et on restaure DANS UN FINALLY ;
   l'empreinte md5 du fichier doit etre identique apres. Le banc doit crier
   sur le cas de CE numero, sinon la preuve ne tient pas. Le dossier
   temporaire est efface dans un finally. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-couronne-site-'));
const sortie = path.join(dossier, 'harnais.mjs');

/* Le client du site, remplace par le faux du banc. */
const fauxClient = {
  name: 'faux-client-du-site',
  setup(b) {
    b.onResolve({ filter: /^\.\/maison$/ }, (args) => (/agenda\.ts$/.test(args.importer) ? { path: 'faux-maison', namespace: 'faux' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, () => ({
      contents: 'export const client = async () => globalThis.__faux ?? null;',
      loader: 'js',
    }));
  },
};

const banc = async () => {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-revue-couronne-site.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    plugins: [fauxClient],
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
    banner: {
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };`,
    },
  });
  return spawnSync(process.execPath, [sortie], {
    cwd: racine, encoding: 'utf8', env: { ...process.env, TZ: 'America/New_York' },
  });
};

/* La barre oblique inverse, ecrite par son code : un « \u » dans ce fichier
   serait lu comme un echappement par qui le recopie. */
const B = String.fromCharCode(92);

/* Chaque faute : le fichier, le texte corrige tel qu'il est, le texte d'avant
   la correction, et le cas qui doit crier. */
const FAUTES = [
  { n: 94, f: 'src/apps/couronne/reservation-pure.ts',
    avant: 'return !o.acompteDemande && o.mursConnus && o.seancesToujoursLibres;',
    apres: 'return !o.acompteDemande;' },
  { n: 94, f: 'src/apps/couronne/Booking.tsx',
    avant: '        mursConnus: mursFrais !== null,\n',
    apres: '        mursConnus: true,\n' },
  /* Reprise du 10 octobre : la faute que la relecture a trouvee, juger sur
     l'agenda du MONTAGE, perime des qu'une autre cliente reserve. */
  { n: 94, f: 'src/apps/couronne/Booking.tsx',
    avant: '        mursConnus: mursFrais !== null,\n',
    apres: '        mursConnus: occupesCharges,\n' },
  { n: 94, f: 'src/apps/couronne/Booking.tsx',
    avant: 'freeSlots(sd.iso, master, totalDuration, appts, tousServices, branch.id, mursFrais).includes(sd.time));',
    apres: 'freeSlots(sd.iso, master, totalDuration, appts, tousServices, branch.id, occupes).includes(sd.time));' },
  { n: 94, f: 'src/apps/couronne/reservation-pure.ts',
    avant: '    if (error) return null;\n',
    apres: '    if (error) return [];\n' },
  { n: 94, f: 'src/apps/couronne/reservation-pure.ts',
    avant: '  } catch {\n    return null;\n  }',
    apres: '  } catch {\n    return [];\n  }' },
  { n: 94, f: 'src/apps/couronne/Booking.tsx',
    avant: '    if (ecritureEnCours.current) return;\n',
    apres: '' },
  { n: 95, f: 'src/apps/couronne/reservation-pure.ts',
    avant: "return grille.includes(voulu) ? 'prise' : 'hors-grille';",
    apres: "return 'prise';" },
  { n: 95, f: 'src/apps/couronne/Booking.tsx',
    avant: "if (!pose && heureHabituelle(voulu, dayTimes, grilleDuJour(prefIso.iso, totalDuration)) === 'prise') {",
    apres: 'if (!pose && !dayTimes.includes(voulu)) {' },
  { n: 96, f: 'src/apps/couronne/MesRendezVous.tsx',
    avant: "<div className=\"mc-emptyline\">{introuvable === 'plus-au-carnet'",
    apres: "<div className=\"mc-emptyline\">{introuvable === 'jamais'" },
  /* Reprise du 10 octobre : « pret » ne veut pas dire « bien lu », et les
     miens dependent aussi des fiches et du foyer. */
  { n: 96, f: 'src/apps/couronne/fiche-pure.ts',
    avant: "  if (o.lectureEnEchec || !o.enLigne) return 'injoignable';\n",
    apres: '' },
  { n: 96, f: 'src/apps/couronne/fiche-pure.ts',
    avant: "['appointments', 'clients', 'families'] as const;",
    apres: "['appointments'] as const;" },
  { n: 96, f: 'src/apps/couronne/MesRendezVous.tsx',
    avant: '    lectureEnEchec: lectureDesRdvEnEchec(etatSync),\n',
    apres: '    lectureEnEchec: false,\n' },
  { n: 96, f: 'src/apps/couronne/MesRendezVous.tsx',
    avant: '    tablesResolues: tablesLues,\n',
    apres: "    tablesResolues: tablePrete('appointments'),\n" },
  { n: 97, f: 'src/apps/revelateur/ilots/Reserver.tsx',
    avant: '[choisies, offreAppliquee, ctx],',
    apres: '[choisies, offreAppliquee],' },
  { n: 98, f: 'src/apps/revelateur/agenda.ts',
    avant: '${MOIS_DITS[d.getMonth()]} ${d.getFullYear()}`;',
    apres: '${MOIS_DITS[d.getMonth()]}`;' },
  { n: 98, f: 'src/apps/revelateur/ilots/Reserver.tsx',
    avant: "{ day: 'numeric', month: 'long', year: 'numeric' }",
    apres: "{ day: 'numeric', month: 'long' }" },
  /* Reprise du 10 octobre : la REGLE de l'annee, sur tout le site. Une date
     sans annee ailleurs que dans les deux fonctions du jour (un autre ilot,
     un nouveau formateur) doit faire crier le banc. */
  { n: 98, f: 'src/apps/revelateur/ilots/Offrir.tsx',
    avant: "toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';",
    apres: "toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';" },
  { n: 98, f: 'src/apps/revelateur/ilots/Offres.tsx',
    avant: '  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;',
    apres: '  return `${d.getDate()} ${MOIS[d.getMonth()]}`;' },
  { n: 98, f: 'src/apps/revelateur/ilots/Triage.tsx',
    avant: "import { raisonDuRefus } from '../refus-du-serveur';\n",
    apres: "import { raisonDuRefus } from '../refus-du-serveur';\nexport const dateDuBanc = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });\n" },
  { n: 98, f: 'src/apps/revelateur/ilots/Demande.tsx',
    avant: "import { raisonDuRefus } from '../refus-du-serveur';\n",
    apres: "import { raisonDuRefus } from '../refus-du-serveur';\nconst NOMS_DU_BANC = ['janv.'];\nexport const jourDuBanc = (d: Date) => `${d.getDate()} ${NOMS_DU_BANC[d.getMonth()]}`;\n" },
  { n: 99, f: 'src/apps/revelateur/agenda.ts',
    avant: '    if (panne) throw new Error(`agenda illisible : ${panne.message}`);\n',
    apres: '' },
  { n: 99, f: 'src/apps/revelateur/ilots/Reserver.tsx',
    avant: 'setAgenda((prec) => a ?? prec ?? null);',
    apres: 'setAgenda(a);' },
  { n: 100, f: 'src/apps/revelateur/ilots/Offrir.tsx',
    avant: "      const deposee = commande ?? await deposeLaCommande('maison');\n      if (deposee && deposee !== commande) setCommande(deposee);",
    apres: "      if (!commande) await deposeLaCommande('maison');" },
  /* Reprise du 10 octobre : la commande gardee fige le geste et le modele,
     et une commande « a la Maison » ne se paie pas en ligne sous son origine. */
  { n: 100, f: 'src/apps/revelateur/ilots/Offrir.tsx',
    avant: 'onChange={() => setGeste(g)} disabled={!!commande} />',
    apres: 'onChange={() => setGeste(g)} />' },
  { n: 100, f: 'src/apps/revelateur/ilots/Offrir.tsx',
    avant: 'onChange={() => setModele(m)} disabled={!!commande} />',
    apres: 'onChange={() => setModele(m)} />' },
  { n: 100, f: 'src/apps/revelateur/ilots/Offrir.tsx',
    avant: "const c = (commande?.origine === 'en-ligne' ? commande : null) ?? await deposeLaCommande('en-ligne');",
    apres: "const c = commande ?? await deposeLaCommande('en-ligne');" },
  { n: 100, f: 'src/apps/revelateur/ilots/Offrir.tsx',
    avant: "commande?.origine === 'en-ligne' ? 'Rouvrir le paiement' : 'Régler maintenant'",
    apres: "commande ? 'Rouvrir le paiement' : 'Régler maintenant'" },
  { n: 101, f: 'src/apps/revelateur/agenda.ts',
    avant: 'const aujourdhui = jourDeCotonou(maintenant.getTime());',
    apres: 'const aujourdhui = isoDuJour(maintenant);' },
  { n: 102, f: 'src/apps/revelateur/refus-du-serveur.ts',
    avant: "if (!reponse || typeof reponse.json !== 'function') return generique;",
    apres: 'return generique;' },
  { n: 102, f: 'src/apps/revelateur/ilots/Reserver.tsx',
    avant: 'const code = await raisonDuRefus(data, error);',
    apres: "const code = r.error ?? (error?.message ?? '');" },
  { n: 103, f: 'src/apps/revelateur/agenda.ts',
    /* L'etat d'avant : un seul select, sans pages ni filtre de date. */
    avant: "      litToutesLesPages<{ id: string; data: unknown }>((apres, taille) => {\n        const q = supabase.from('blocages').select('id,data').gte('data->>date', depuis).order('id', { ascending: true }).limit(taille);\n        return apres === null ? q : q.gt('id', apres);\n      }),\n",
    apres: "      supabase.from('blocages').select('id,data'),\n" },
  { n: 105, f: 'src/apps/revelateur/statique.tsx',
    avant: `.replace(/</g, '${B}${B}u003c').replace(/${B}u2028/g, '${B}${B}u2028')`,
    apres: `.replace(/</g, '${B}u003c').replace(/${B}u2028/g, '${B}u2028')` },
  { n: 106, f: 'src/apps/revelateur/ilots/Reserver.tsx',
    avant: '<span className="au-salon">prix à la Maison</span>',
    apres: '<span className="au-salon">prix au salon</span>' },
  { n: 107, f: 'public/payer.html',
    avant: '<div class="pied">mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là</div>',
    apres: '<div class="pied">mi nyɔ́ ɖɛkpɛ — la maison veille.</div>' },
  { n: 108, f: 'src/ds/demande.tsx',
    avant: "window.addEventListener('keydown', auClavier, true);",
    apres: "window.addEventListener('keydown', auClavier);" },
  { n: 109, f: 'src/apps/consultation/App.tsx',
    avant: '      setAccess(accesApresLeWidget(access, consultationId, transactionId, new Date().toISOString()));\n',
    apres: '' },
  { n: 109, f: 'src/apps/academie/App.tsx',
    avant: "    } catch (e) {\n      setEtat('a-verifier');",
    apres: "    } catch (e) {\n      setEtat('recue');" },
  { n: 110, f: 'src/apps/consultation/App.tsx',
    avant: '    setScelle(porte);\n    setAccess(suivant);\n',
    apres: '    setScelle(porte);\n' },
  { n: 111, f: 'src/ds/CarteDeMarraine.tsx',
    avant: 'dessineLaCarteDeMarraine(horsEcran, face, donnees)',
    apres: 'dessineLaCarteDeMarraine(canvas, face, donnees)' },
  { n: 112, f: 'src/apps/consultation/App.tsx',
    avant: "Le solde de la prestation se règle {mode === 'visio' ? 'à la séance' : 'à la Maison'} :",
    apres: "Le solde de la prestation se règle {mode === 'visio' ? 'à la séance' : 'au salon'} :" },
];

const md5 = (t) => createHash('md5').update(t).digest('hex');

try {
  if (!prouve) {
    const r = await banc();
    process.stdout.write(`${r.stdout ?? ''}${r.stderr ?? ''}`);
    process.exitCode = r.status ?? 1;
  } else {
    let tenues = 0;
    const rates = [];
    for (const faute of FAUTES) {
      const chemin = path.join(racine, faute.f);
      const original = readFileSync(chemin);
      const empreinte = md5(original);
      /* Le fichier peut etre en CRLF : la faute s'y ecrit dans sa forme. */
      const texte = original.toString('utf8');
      const crlf = texte.includes('\r\n');
      const forme = (s) => (crlf ? s.replace(/\r?\n/g, '\r\n') : s);
      const avant = forme(faute.avant);
      const fois = texte.split(avant).length - 1;
      if (fois !== 1) {
        rates.push(`n${faute.n} ${faute.f} : le texte corrige y est ${fois} fois (attendu 1)`);
        continue;
      }
      let r;
      try {
        writeFileSync(chemin, texte.replace(avant, () => forme(faute.apres)));
        r = await banc();
      } finally {
        writeFileSync(chemin, original);
      }
      const apres = md5(readFileSync(chemin));
      const sortieDuFils = `${r.stdout ?? ''}${r.stderr ?? ''}`;
      const crie = r.status !== 0 && new RegExp(`ECHEC n${faute.n} `).test(sortieDuFils);
      const echecs = (sortieDuFils.match(/^ECHEC .*$/gm) ?? []).slice(0, 3).join(' | ');
      console.log(`${crie ? 'CRIE ' : 'MUET '} n${faute.n} ${faute.f} -> ${echecs || '(aucun echec)'}`);
      if (apres !== empreinte) rates.push(`n${faute.n} ${faute.f} : md5 different apres restauration`);
      else console.log(`      md5 identique apres restauration (${apres})`);
      if (crie) tenues += 1; else rates.push(`n${faute.n} ${faute.f} : le banc ne crie pas sur ce constat`);
    }
    /* Et le code corrige passe. */
    const r = await banc();
    const passe = r.status === 0;
    console.log(`\nCode corrige : ${passe ? 'le banc passe' : 'LE BANC ECHOUE'}`);
    if (!passe) process.stdout.write(`${r.stdout ?? ''}${r.stderr ?? ''}`);
    console.log(rates.length === 0 && passe
      ? `\nLa preuve tient : ${tenues} fautes remises, ${tenues} cris, fichiers restaures a l'identique.`
      : `\nLA PREUVE NE TIENT PAS :\n  ${rates.join('\n  ')}`);
    process.exitCode = rates.length === 0 && passe ? 0 : 1;
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
