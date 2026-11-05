import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES POURBOIRES DE L'EQUIPE, EPROUVES (5 novembre 2026).
   `node scripts/verifie-les-pourboires-de-l-equipe.mjs` lance le harnais sur
   les vrais chiffres (aout 31 000 F, septembre 4 000 F, octobre 2 000 F,
   7 000 F au 4 novembre 2026) ; `--prouve` le relance sur chaque panne
   ci-dessous, et chaque panne doit le faire crier.

   LES PANNES VIVENT EN MEMOIRE, jamais dans le depot : la regle pure est
   remplacee dans le paquet (un greffon d'esbuild), les textes que le harnais
   lit (la migration 0157, les ecrans) le sont par `lis`, qui recoit la panne
   par la variable PANNE_TEXTE. L'empreinte de chaque fichier est comparee
   avant et apres ; une panne dont le texte ne se trouve plus exactement une
   fois fait echouer la preuve. */

const racine = path.resolve(import.meta.dirname, '..');
const P = 'src/shared/pourboires-de-l-equipe-pur.ts';
const S = 'supabase/migrations/0157_les_pourboires_de_l_equipe.sql';
const E = 'src/apps/trone/routes/equipe/';

const PANNES = [
  /* Son choix du 5 novembre 2026 : la direction n'est pas prevenue. */
  { nom: 'la direction est prevenue', fichier: 'supabase/migrations/0157_les_pourboires_de_l_equipe.sql', avant: "s.user_id = compte and s.role = 'souverain'", apres: "s.user_id = compte and s.role = 'jamais'" },
  /* La regle. */
  { nom: 'la semaine commence le dimanche', fichier: P,
    avant: 'return ajouteJours(jour, -((d.getUTCDay() + 6) % 7));', apres: 'return ajouteJours(jour, -(d.getUTCDay() % 7));' },
  { nom: 'le nom entier dit a l equipe', fichier: P,
    avant: 'prenom: prenomDeLaCliente(p.note), amountXof: montantDe(p) }))', apres: "prenom: String(p.note ?? ''), amountXof: montantDe(p) }))" },
  { nom: 'la civilite devient le prenom', fichier: P,
    avant: 'while (mots.length > 1 && CIVILITES.test(mots[0])) mots.shift();\n  const p = mots[0] ?? \'\';', apres: 'const p = mots[0] ?? \'\';' },
  { nom: 'un numero passe pour un prenom', fichier: P, avant: 'PAS_UN_PRENOM.test(p) || ', apres: '' },
  { nom: 'le mois precedent oublie', fichier: P, avant: '    if (moisDe(j) === avant) t.moisPrecedent += n;\n', apres: '' },
  { nom: 'un repartage d aout sonne a l instant', fichier: P, avant: 'if (!n || j < hier || j > aujourdhui) continue;', apres: 'if (!n) continue;' },
  { nom: 'la fraicheur sans limite', fichier: P, avant: 'if (depuis < -60_000 || depuis > FRAICHEUR_MS) continue;', apres: 'if (depuis < -60_000) continue;' },
  { nom: 'l arrivee vue a l ecran ignoree', fichier: P,
    avant: 'const a = Number.isFinite(inscrit) ? inscrit : vuesArriver.get(p.id);', apres: 'const a = Number.isFinite(inscrit) ? inscrit : undefined;' },
  { nom: 'l heure de Paris au lieu de Cotonou', fichier: P, avant: "timeZone: 'Africa/Porto-Novo'", apres: "timeZone: 'UTC'" },
  { nom: 'les parts egales ne disent plus « chacun »', fichier: P, avant: "${noms.length > 1 ? ' chacun' : ''}", apres: '' },
  { nom: 'le total oublie la fiche retiree', fichier: P,
    avant: "  if (retirees?.length) lignes.push(ligneDe(FICHE_RETIREE, 'Fiche retirée', 0, retirees));\n", apres: '' },
  { nom: 'une autre maison se compte', fichier: P, avant: 'ici.has(p.staffId) || !connues.has(p.staffId)', apres: 'true' },
  { nom: 'une fiche effacee disparait', fichier: P, avant: 'ici.has(p.staffId) || !connues.has(p.staffId)', apres: 'ici.has(p.staffId)' },
  { nom: 'un mois vide disparait', fichier: P,
    avant: '  return mois.map((m) => {\n    const du = valables.filter((p) => moisDe(p.date) === m);',
    apres: '  return mois.filter((m) => valables.some((p) => moisDe(p.date) === m)).map((m) => {\n    const du = valables.filter((p) => moisDe(p.date) === m);' },
  { nom: 'la notification perd le prenom', fichier: P, avant: "de pourboire${prenom ? ` · ${prenom}` : ''}`", apres: 'de pourboire`' },
  { nom: 'l annee manque au mois', fichier: P, avant: '`${MOIS_DITS[m - 1]} ${mois.slice(0, 4)}`', apres: '`${MOIS_DITS[m - 1]}`' },
  { nom: 'les parts a zero comptent dans le total des parts', fichier: P,
    avant: 'part: membres.filter(enActivite).reduce((n, m) => n + partDe(m), 0),', apres: 'part: membres.filter(enActivite).length,' },
  { nom: 'un membre sans part ni pourboire prend une ligne', fichier: P,
    avant: 'if (siennes.length || (enActivite(m) && part > 0))', apres: 'if (siennes.length || enActivite(m))' },
  { nom: 'une fiche partie compte encore dans les parts', fichier: P,
    avant: 'const enActivite = (m: MembreDuPartage): boolean => !m.archiveeLe || m.archiveeLe > aujourdhui;', apres: 'const enActivite = (_m: MembreDuPartage): boolean => true;' },
  { nom: 'le fil melange les jours', fichier: P,
    avant: 'return fil.sort((a, b) => b.jour.localeCompare(a.jour) ||', apres: 'return fil.sort((a, b) => a.jour.localeCompare(b.jour) ||' },
  /* La base (0157). */
  { nom: 'la base dit le nom entier', fichier: S,
    avant: "prenom := public.prenom_de_la_cliente(new.data ->> 'note');", apres: "prenom := new.data ->> 'note';" },
  { nom: 'une panne de notification refuse le pourboire', fichier: S,
    avant: "    raise warning 'pourboire % : la notification ne part pas (%)', new.id, sqlerrm;", apres: '    raise;' },
  { nom: 'le refus de la fonction remonte', fichier: S,
    avant: "    exception when others then\n      update public.pourboires_prevenus set issue = 'refuse : ' || left(sqlerrm, 120) where tip_id = new.id;\n    end;",
    apres: '    end;' },
  { nom: 'une part sonne deux fois', fichier: S,
    avant: '      on conflict (tip_id) do nothing;\n    if not found then\n      return new;\n    end if;', apres: '      on conflict (tip_id) do nothing;' },
  { nom: 'un repartage d aout sonne', fichier: S, avant: 'if jour < aujourdhui - 2 or jour > aujourdhui + 1 then', apres: 'if false then' },
  { nom: 'pas de plafond', fichier: S, avant: ">= 5 then", apres: '>= 5000 then' },
  { nom: 'la civilite de la base differe', fichier: S, avant: '|monsieur|dr\\.?)$', apres: '|monsieur)$' },
  { nom: 'les mois de la base sans accent', fichier: S, avant: "'janvier', 'février',", apres: "'janvier', 'fevrier'," },
  { nom: 'le declencheur sonne aussi a chaque mise a jour', fichier: S, avant: 'after insert on public.tips', apres: 'after insert or update on public.tips' },
  { nom: 'le journal sans RLS', fichier: S, avant: 'alter table public.pourboires_prevenus enable row level security;\n', apres: '' },
  { nom: 'la base ecrit le montant sans espace fine', fichier: S, avant: "',', chr(8239))", apres: "',', ' ')" },
  { nom: 'la base pousse a toute l equipe', fichier: S, avant: "'mode', 'to-staff',", apres: "'mode', 'staff'," },
  { nom: 'la base prend n importe quel compte', fichier: S,
    avant: 'if compte is null or not exists (select 1 from public.staff s where s.user_id = compte) then', apres: 'if compte is null then' },
  /* Les ecrans. */
  { nom: 'la page s ouvre a tout le personnel', fichier: 'src/apps/trone/routes/index.tsx',
    avant: "export const ROUTES_DIRECTION = ['/journal', '/pourboires'];", apres: "export const ROUTES_DIRECTION = ['/journal'];" },
  { nom: 'un crochet apres la garde de la page', fichier: `${E}Pourboires.tsx`,
    avant: '  const jourDuMois = Number(aujourdhui.slice(8, 10));', apres: '  const jourDuMois = useMemo(() => Number(aujourdhui.slice(8, 10)), [aujourdhui]);' },
  { nom: 'un crochet apres la garde du bloc', fichier: `${E}MesPourboires.tsx`,
    avant: '  const liste = tout ? mes.duMois : mes.duMois.slice(0, LISTE_COURTE);',
    apres: '  const liste = useMemo(() => (tout ? mes.duMois : mes.duMois.slice(0, LISTE_COURTE)), [tout, mes]);' },
  { nom: 'le bloc dit la note entiere', fichier: `${E}MesPourboires.tsx`,
    avant: "<span>{l.jourDit}{l.prenom ? ` · ${l.prenom}` : ''}</span>", apres: '<span>{l.jourDit} · {(l as unknown as { note: string }).note}</span>' },
  { nom: 'la lecture du matin passe pour quarante arrivees', fichier: `${E}MesPourboires.tsx`,
    avant: "      if (!tablePrete('tips')) return;\n", apres: '' },
  { nom: 'Mon mois perd son bloc', fichier: `${E}MonMois.tsx`, avant: '      <MesPourboiresEnDirect moi={moi} />\n', apres: '' },
  { nom: 'Mon mois remontre le nom entier', fichier: `${E}MonMois.tsx`,
    avant: '      {/* ── LES TÊTES À COMPLÉTER', apres: '      {moi && <span>{[].map((t: { note?: string }) => t.note?.trim())}</span>}\n      {/* ── LES TÊTES À COMPLÉTER' },
  { nom: 'le Tableau de bord perd le bloc', fichier: 'src/apps/trone/routes/pilotage/Dashboard.tsx', avant: '      <MesPourboiresEnDirect moi={maFiche} />\n', apres: '' },
  { nom: 'la Caisse perd son lien', fichier: 'src/apps/trone/routes/vente/Caisse.tsx', avant: "onClick={() => navigate('/pourboires')}", apres: "onClick={() => navigate('/encaissements')}" },
  { nom: 'Encaissements perd son lien', fichier: 'src/apps/trone/routes/finances/Encaissements.tsx',
    avant: "{kind === 'pourboire' && voitLesPourboires && (", apres: "{kind === 'tout' && voitLesPourboires && (" },
  { nom: 'la part s inscrit sans son instant', fichier: 'src/shared/tips.ts', avant: '    inscritLe,\n  }));', apres: '  }));' },
  { nom: 'le reglement en ligne sans instant', fichier: 'src/apps/trone/shell/useReglementsEnLigne.ts', avant: '.map((l) => ({ ...l, inscritLe: quand }))', apres: '' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-pourboires-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-pourboires-de-l-equipe.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: panne ? [{
        name: 'panne',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== panne.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(panne.avant).join(panne.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
    });
    const env = { ...process.env, ...(panne ? { PANNE_TEXTE: JSON.stringify({ fichier: panne.fichier, avant: panne.avant, apres: panne.apres }) } : {}) };
    if (!panne) delete env.PANNE_TEXTE;
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const texte = readFileSync(path.join(racine, p.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(p.avant).length - 1;
    const avant = md5(p.fichier);
    let verdict;
    if (fois !== 1) verdict = `INTROUVABLE (${fois} fois)`;
    else {
      const r = await lance(p);
      verdict = r.status !== 0 ? 'CRIE ' : 'MUETTE';
    }
    if (md5(p.fichier) !== avant) verdict = `LE FICHIER A CHANGE (${verdict})`;
    if (verdict !== 'CRIE ') muettes++;
    console.log(`${verdict} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) ou introuvable(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
