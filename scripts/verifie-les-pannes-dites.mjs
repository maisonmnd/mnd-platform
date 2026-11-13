import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES PANNES DITES, EPROUVEES (12 novembre 2026, le choix du moyen, lot D).
   `node scripts/verifie-les-pannes-dites.mjs` lance le harnais ;
   `--prouve` le relance sur chaque faute ci-dessous, et chaque faute doit le
   faire crier. Il EXIGE PGlite (BANC_PGLITE=<dossier qui porte
   node_modules/@electric-sql/pglite>) : les fautes de la migration se
   prouvent en la jouant. Les fautes de la regle vivent dans la memoire du
   bundle (un greffon d'esbuild remplace le texte lu) ; celles de la
   migration et des fichiers du Trone, lus par le harnais, vivent dans une
   copie du depot ecrite dans un dossier temporaire, jamais dans le depot :
   l'empreinte de chaque fichier est comparee avant et apres. Une faute dont
   le texte ne se trouve plus fait echouer la preuve. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = 'src/shared/pannes-dites-pur.ts';
const SQL = 'supabase/migrations/0204_les_pannes_dites.sql';
const SANTE = 'src/apps/trone/routes/clients/sante-des-moyens.ts';
const BASE = 'src/shared/pannes-des-moyens.ts';
const ACTIONS = 'src/apps/trone/routes/clients/actions.tsx';
const OUTIL = 'scripts/mise-en-ligne.mjs';
/* Tout ce que le harnais LIT (readFileSync) : le depot fantome d'une faute
   « disque » les porte tous. */
const LUS = [SQL, SANTE, BASE, ACTIONS, OUTIL];

const FAUTES = [
  /* La regle du poste. */
  { nom: 'hors ligne, une panne s inscrit (lecture ou demande)', fichier: PUR, avant: "  if (!o.enLigne) return false;\n  if (p === 'fedapay'", apres: "  if (p === 'fedapay'" },
  { nom: 'les deux fonctions muettes ensemble s inscrivent', fichier: PUR, avant: 'if (muettes.length === 0 || muettes.length === PRESTATAIRES.length) return [];', apres: 'if (muettes.length === 0) return [];' },
  { nom: 'FedaPay eteint s inscrit', fichier: PUR, avant: "  if (p === 'fedapay' && !o.fedapayAllume) return false;\n", apres: '' },
  { nom: 'un moyen dit ferme s inscrit', fichier: PUR, avant: '  return !reponseFermee(p, o.reponses[p] ?? undefined);', apres: '  return true;' },
  { nom: 'MTN ferme aux clientes passe pour ouvert', fichier: PUR, avant: "(p === 'mtn' && l.ouvert === false)", apres: 'false' },
  { nom: 'une lecture d une minute se dit a la direction', fichier: PUR, avant: 'export const VUES_POUR_DIRE = 2;', apres: 'export const VUES_POUR_DIRE = 1;' },
  { nom: 'l episode ne dure plus dix minutes', fichier: PUR, avant: 'export const EPISODE_RETENU_MS = PANNE_RETENUE_MS;', apres: 'export const EPISODE_RETENU_MS = 15 * 60_000;' },
  { nom: 'le silence de la direction oublie', fichier: PUR, avant: 'export const SILENCE_DE_LA_DIRECTION_MS = 60 * 60_000;', apres: 'export const SILENCE_DE_LA_DIRECTION_MS = 0;' },
  { nom: 'le Trone et la base ne disent plus la meme chose', fichier: PUR, avant: 'le Trône propose un autre moyen à la caisse.', apres: 'le Trône bascule.' },
  /* La migration : les droits. */
  { nom: '0204 : les episodes sans RLS', fichier: SQL, avant: 'alter table public.pannes_des_moyens enable row level security;', apres: '', disque: true },
  { nom: '0204 : le personnel ecrit lui-meme les episodes', fichier: SQL, avant: 'revoke all on public.pannes_des_moyens from anon, authenticated;', apres: 'grant insert, update on public.pannes_des_moyens to authenticated;', disque: true },
  { nom: '0204 : le journal lu par toute l equipe', fichier: SQL, avant: 'using (public.est_direction());', apres: 'using (public.is_staff());', disque: true },
  { nom: '0204 : une page publique inscrit une panne', fichier: SQL, avant: 'revoke execute on function public.vois_une_panne(text, text, text) from public, anon;', apres: '', disque: true },
  { nom: '0204 : sans compte du personnel, la panne s inscrit', fichier: SQL, avant: "  if not public.is_staff() then\n    raise exception 'RESERVE_AU_PERSONNEL' using errcode = '42501';\n  end if;\n  if p_prestataire is null or p_prestataire not in ('mtn', 'fedapay') then\n    raise exception 'PRESTATAIRE_INCONNU' using errcode = '22023';\n  end if;\n  if p_source", apres: "  if p_prestataire is null or p_prestataire not in ('mtn', 'fedapay') then\n    raise exception 'PRESTATAIRE_INCONNU' using errcode = '22023';\n  end if;\n  if p_source", disque: true },
  { nom: '0204 : une maison inconnue passe', fichier: SQL, avant: "  if p_branche is null or not exists (select 1 from public.branches b where b.id = p_branche) then\n    raise exception 'MAISON_INCONNUE' using errcode = '22023';\n  end if;\n  -- Fermé", apres: '  -- Fermé', disque: true },
  /* La migration : ferme n est pas en panne. */
  { nom: '0204 : un moyen ferme s inscrit en base', fichier: SQL, avant: "  if public.le_moyen_est_ferme(p_prestataire) then\n    return jsonb_build_object('ok', false, 'motif', 'ferme');\n  end if;\n", apres: '', disque: true },
  { nom: '0204 : MTN sans la ligne de son interrupteur passe pour ouvert', fichier: SQL, avant: 'where r.id = 1), false);', apres: 'where r.id = 1), true);', disque: true },
  { nom: '0204 : FedaPay sans reglages passe pour allume', fichier: SQL, avant: "d.key = 'mnd_settings'), '') <> 'true';", apres: "d.key = 'mnd_settings'), '') = 'false';", disque: true },
  /* La migration : l episode. */
  { nom: '0204 : deux episodes ouverts a la fois (plus d index unique)', fichier: SQL, avant: 'create unique index if not exists pannes_des_moyens_une_ouverte', apres: 'create index if not exists pannes_des_moyens_une_ouverte', disque: true },
  { nom: '0204 : plus de verrou entre deux postes', fichier: SQL, avant: "perform pg_advisory_xact_lock(hashtext('pannes_des_moyens|' || p_prestataire || '|' || p_branche));", apres: '-- sans verrou', disque: true },
  { nom: '0204 : l heure d une transaction plutot que celle d apres le verrou', fichier: SQL, avant: 'v_maintenant := clock_timestamp();', apres: 'v_maintenant := now();', disque: true },
  { nom: '0204 : l episode dure vingt minutes', fichier: SQL, avant: "interval '10 minutes'", apres: "interval '20 minutes'", disque: true },
  { nom: '0204 : l episode muet ne finit jamais (pas de silence)', fichier: SQL, avant: "    update public.pannes_des_moyens set fin = derniere_vue, fin_par = 'silence' where id = v_ouverte.id;\n  end if;\n\n  insert", apres: '  end if;\n\n  insert', disque: true },
  { nom: '0204 : la demande repassee ne finit rien', fichier: SQL, avant: "update public.pannes_des_moyens set fin = greatest(v_maintenant, debut), fin_par = 'demande' where id = v_ouverte.id;", apres: 'null;', disque: true },
  { nom: '0204 : un poste compte deux fois', fichier: SQL, avant: 'case when v_uid is null or v_uid = any(vue_par) then vue_par else vue_par || v_uid end', apres: 'vue_par || v_uid', disque: true },
  /* La migration : la direction prevenue une fois. */
  { nom: '0204 : chaque echec previent (plus de journal)', fichier: SQL, avant: '    if not found then\n      return new;\n    end if;\n\n    -- Revenue', apres: '\n    -- Revenue', disque: true },
  { nom: '0204 : une lecture d une minute previent', fichier: SQL, avant: 'new.vues >= 2', apres: 'new.vues >= 1', disque: true },
  { nom: '0204 : la panne revenue dans l heure se redit', fichier: SQL, avant: "and j.issue = 'parti' and j.prevenu_le > now() - interval '60 minutes'", apres: 'and false', disque: true },
  { nom: '0204 : le gerant n est pas prevenu', fichier: SQL, avant: "where s.role in ('souverain', 'gerant') loop", apres: "where s.role in ('souverain') loop", disque: true },
  { nom: '0204 : toute l equipe est prevenue', fichier: SQL, avant: "where s.role in ('souverain', 'gerant') loop", apres: 'where s.role is not null loop', disque: true },
  { nom: '0204 : la notification en panne refuse l inscription', fichier: SQL, avant: "      exception when others then\n        update public.pannes_prevenues set issue = 'refuse : '", apres: "      exception when division_by_zero then\n        update public.pannes_prevenues set issue = 'refuse : '", disque: true },
  { nom: '0204 : la base ne dit plus la phrase du Trone', fichier: SQL, avant: "', le Trône propose un autre moyen à la caisse. La fin de la panne s’inscrira dans La journée.'", apres: "', le Trône bascule.'", disque: true },
  { nom: '0204 : l heure dite en UTC', fichier: SQL, avant: "at time zone 'Africa/Porto-Novo', 'FMHH24", apres: "at time zone 'UTC', 'FMHH24", disque: true },
  { nom: '0204 : l heure dite avec son zero (09 h 05)', fichier: SQL, avant: "'FMHH24 \"h\" MI'", apres: "'HH24 \"h\" MI'", disque: true },
  { nom: '0204 : le declencheur ne regarde que la naissance', fichier: SQL, avant: 'after insert or update of vues, par_demande on', apres: 'after insert on', disque: true },
  { nom: '0204 : un mot destructif arrete l outil de mise en ligne', fichier: SQL, avant: '-- Rejouable :', apres: '-- truncate interdit ici. Rejouable :', disque: true },
  /* Les branchements du Trone. */
  { nom: 'la demande s inscrit hors ligne ou fermee', fichier: SANTE, avant: "if (panneDeLaDemande(p, ceQueLePosteVoit())) void inscrisLaPanne(p, 'demande', brancheIci());", apres: "void inscrisLaPanne(p, 'demande', brancheIci());", disque: true },
  { nom: 'une demande qui passe ne finit plus la panne', fichier: SANTE, avant: '  if (enLigneIci()) void finisLaPanne(p, brancheIci());\n', apres: '', disque: true },
  { nom: 'seul le poste qui l a vue la finit', fichier: SANTE, avant: '  if (enLigneIci()) void finisLaPanne(p, brancheIci());\n  if (!memoire.echecs[p]) return;', apres: '  if (!memoire.echecs[p]) return;\n  if (enLigneIci()) void finisLaPanne(p, brancheIci());', disque: true },
  { nom: 'la lecture muette ne s inscrit plus', fichier: SANTE, avant: "    for (const p of pannesDeLaLecture({ mtn, fedapay }, ceQueLePosteVoit())) void inscrisLaPanne(p, 'lecture', brancheIci());", apres: '', disque: true },
  { nom: 'une lecture muette efface la derniere reponse (le ferme oublie)', fichier: SANTE, avant: 'const reponses = { ...memoire.reponses, ...(mtn ? { mtn } : {}), ...(fedapay ? { fedapay } : {}) };', apres: 'const reponses = { ...memoire.reponses, mtn, fedapay };', disque: true },
  { nom: 'FedaPay eteint oublie par la sante', fichier: SANTE, avant: '  useEffect(() => { fedapayAllumeVu = fedapayAllume; }, [fedapayAllume]);\n', apres: '', disque: true },
  { nom: 'hors ligne oublie par la sante', fichier: SANTE, avant: "const enLigneIci = (): boolean => !!supabase && (typeof navigator === 'undefined' || navigator.onLine !== false);", apres: 'const enLigneIci = (): boolean => true;', disque: true },
  { nom: 'le Trone appelle une fonction que 0204 ne pose pas', fichier: BASE, avant: "supabase.rpc('vois_une_panne',", apres: "supabase.rpc('vois_la_panne',", disque: true },
  { nom: 'les pannes d une autre maison a l ecran', fichier: BASE, avant: ".eq('branch_id', branche)", apres: '', disque: true },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const lance = async (faute) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-pannes-dites-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    let cwd = racine;
    if (faute?.disque) {
      cwd = path.join(dossier, 'depot');
      for (const rel of LUS) {
        const texte = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
        const cible = path.join(cwd, rel);
        mkdirSync(path.dirname(cible), { recursive: true });
        writeFileSync(cible, rel === faute.fichier ? texte.split(faute.avant).join(faute.apres) : texte);
      }
    }
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-pannes-dites.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      plugins: faute && !faute.disque ? [{
        name: 'faute',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== faute.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(faute.avant).join(faute.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
    });
    return spawnSync(process.execPath, [sortie], { cwd, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
};

const prouve = process.argv.includes('--prouve');
if (prouve && !process.env.BANC_PGLITE) {
  console.log('--prouve exige PGlite : BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>.');
  process.exit(1);
}
const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (prouve) {
  if (/^SAUTE /m.test(net.stdout ?? '')) { console.log('PGlite ne se charge pas : la preuve ne peut pas se faire.'); process.exit(1); }
  let muettes = 0;
  for (const f of FAUTES) {
    const texte = readFileSync(path.join(racine, f.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(f.avant).length - 1;
    const avant = md5(f.fichier);
    let verdict;
    if (fois < 1 || (fois !== 1 && !f.disque)) verdict = `INTROUVABLE (${fois} fois)`;
    else {
      const r = await lance(f);
      verdict = r.status !== 0 ? 'CRIE ' : 'MUETTE';
    }
    if (md5(f.fichier) !== avant) verdict = `LE FICHIER A CHANGE (${verdict})`;
    if (verdict !== 'CRIE ') muettes++;
    console.log(`${verdict} ${f.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} faute(s) muette(s) ou introuvable(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${FAUTES.length} fautes crient.`);
}
