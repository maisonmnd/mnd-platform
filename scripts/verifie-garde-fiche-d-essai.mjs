import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA GARDE DE LA FICHE D'ESSAI (migration 0174, NON APPLIQUEE), EPROUVEE - 7 novembre 2026.
   `BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite> node scripts/verifie-garde-fiche-d-essai.mjs`
   `--prouve` : chaque faute est remise une a une dans la migration (en memoire,
   et dans son essai a blanc qui la porte a l'identique), et le banc doit crier.
   Sans PGlite, la partie SQL saute (le texte se verifie quand meme).

   La maquette est celle de verifie-terminer-et-regler (0172) : les roles, auth.uid,
   les rendez-vous et les pieces avec la garde de 0172 et ses declencheurs, plus
   les fiches `clients` avec les regles de 0027 (cli_ins, cli_upd) ; et, comme la
   vraie base (0138), la cliente n'a plus le droit d'appeler abo_num, abo_vrai,
   abo_aujourdhui, abo_maintenant, abo_etat_de_la_seance. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const lis = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0; let ko = 0;
const dit = (nom, attendu, obtenu) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${JSON.stringify(obtenu)}\n       attendu ${JSON.stringify(attendu)}`}`);
};
const nuDuSql = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, '');

const M0138 = lis('supabase/migrations/0138_le_parcours_de_l_abonnee.sql');
const M0172 = lis('supabase/migrations/0172_regler_avant_apres.sql');
const MIG = lis('supabase/migrations/0174_garde_fiche_d_essai.sql');
const ESSAI = lis('supabase/essai_0174_a_blanc.sql');
const bloc = (sql) => { const i = sql.indexOf('-- ⟨0174⟩\n'); const k = sql.indexOf('-- ⟨/0174⟩'); return i >= 0 && k > i ? sql.slice(i + '-- ⟨0174⟩\n'.length, k) : ''; };
const gardeDe = (sql) => { const i = sql.indexOf('create or replace function public.garde_argent_cliente()'); const k = sql.indexOf('end $$;', i); return sql.slice(i, k + 7); };
const garde0172 = gardeDe(M0172);
const garde0174 = gardeDe(MIG);
const BRANCHE = nuDuSql(`
  elsif tg_table_name = 'clients' then
    new.data := new.data - 'essai';
    if tg_op = 'UPDATE' and (old.data ? 'essai') then
      new.data := jsonb_set(new.data, '{essai}', old.data -> 'essai');
    end if;`);

/* ── Le texte ─────────────────────────────────────────────────────────── */
dit('0174 : la garde de 0172 mot pour mot, avec la seule branche des fiches', [true, true],
  [garde0174.length > 3000, nuDuSql(garde0174).replace(BRANCHE, '') === nuDuSql(garde0172)]);
const brancheClients = garde0174.slice(garde0174.indexOf("elsif tg_table_name = 'clients'"));
dit('0174 : la branche des fiches n appelle aucune fonction retiree aux clientes par 0138 (abo_num, abo_vrai, abo_aujourdhui, abo_maintenant, abo_etat_de_la_seance, abo_iso)', false,
  /\babo_|\bargent_verse/.test(brancheClients));
dit('0174 : le declencheur est celui de 0138, sur les fiches, a l insertion et a la modification',
  true, /drop trigger if exists garde_argent_cliente_biu on public\.clients;\s*create trigger garde_argent_cliente_biu\s*before insert or update on public\.clients\s*for each row execute function public\.garde_argent_cliente\(\);/.test(MIG));
dit('0174 : son essai a blanc rejoue la MEME migration, entre ses mesures, et finit par une exception qui annule tout (ZZ174) ; aucun commit',
  [true, true, true, true, false],
  [bloc(ESSAI) === bloc(MIG) && bloc(MIG).length > 3000, ESSAI.indexOf('do $avant$') > 0 && ESSAI.indexOf('do $avant$') < ESSAI.indexOf('-- ⟨0174⟩'),
    ESSAI.indexOf('do $essai$') > ESSAI.indexOf('-- ⟨/0174⟩'), /raise exception 'ESSAI 0174 : % \| %'[^;]*;\s*end \$essai\$;\s*$/.test(ESSAI),
    /\bcommit\b/i.test(ESSAI.replace(/--[^\n]*/g, ''))]);
dit('0174 : aucun tiret long dans les messages de l essai', false, /—/.test(ESSAI.replace(/--[^\n]*/g, '')));

/* ── Le vrai SQL, dans PGlite ─────────────────────────────────────────── */
const chargePGlite = async () => {
  const dossier = process.env.BANC_PGLITE;
  if (!dossier) return null;
  try { const m = await import(pathToFileURL(path.join(dossier, 'node_modules/@electric-sql/pglite/dist/index.js')).href); return m?.PGlite ?? null; } catch { return null; }
};
const PGlite = await chargePGlite();

const MAQUETTE = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to current_user;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.staff (user_id uuid primary key, role text, created_at timestamptz default now());
  create table public.clients (id text primary key, branch_id text, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
  create table public.appointments (id text primary key, branch_id text, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
  create table public.invoices (id text primary key, branch_id text, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
  create function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.staff where user_id = auth.uid()) $$;
  create function public.mon_dossier() returns text language sql stable security definer set search_path = public as $$ select id from public.clients where data ->> 'authUserId' = (auth.uid())::text limit 1 $$;
  create function public.abo_iso(t timestamptz) returns text language sql immutable as $$ select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;
  create function public.abo_aujourdhui() returns date language sql stable as $$ select current_date $$;
  create function public.abo_maintenant() returns timestamptz language sql stable as $$ select now() $$;
  create function public.abo_num(x jsonb) returns numeric language sql immutable as $$ select 0::numeric $$;
  create function public.abo_vrai(x jsonb) returns boolean language sql immutable as $$ select false $$;
  create function public.abo_etat_de_la_seance(a jsonb, jour date) returns text language sql stable as $$ select 'a-venir'::text $$;
  ${M0138.slice(M0138.indexOf('create or replace function public.ecriture_de_la_maison()'), M0138.indexOf("-- UNE CLIENTE N'ÉCRIT JAMAIS UN CONTRAT"))}
  ${M0172.slice(M0172.indexOf('create or replace function public.argent_verse_sur_le_rdv'), M0172.indexOf('-- ③'))}
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  -- COMME LA VRAIE BASE (0138 retire ces fonctions a la cliente) : la garde tourne avec ses droits, elle ne peut pas les appeler.
  revoke all on function public.abo_num(jsonb), public.abo_vrai(jsonb), public.abo_aujourdhui(), public.abo_maintenant(), public.abo_etat_de_la_seance(jsonb, date) from public, anon, authenticated;
  alter table public.clients enable row level security;
  create policy cli_sel on public.clients for select to authenticated using (is_staff() or id = (auth.uid())::text or id = public.mon_dossier());
  create policy cli_ins on public.clients for insert to authenticated with check (is_staff() or id = (auth.uid())::text);
  create policy cli_upd on public.clients for update to authenticated using (is_staff() or id = (auth.uid())::text or id = public.mon_dossier()) with check (is_staff() or id = (auth.uid())::text or id = public.mon_dossier());
  insert into public.staff (user_id, role) values (gen_random_uuid(), 'equipe');
  insert into public.clients (id, branch_id, data) values ('fiche-de-la-maquette', 'b1', '{"name":"Maquette"}');`;

const joue = async (sql, dabord = '') => {
  const base = new PGlite();
  await base.exec(MAQUETTE);
  if (dabord) await base.exec(dabord);
  let message = '(aucun verdict)';
  try { await base.exec(sql); } catch (e) { message = String(e?.message ?? e); }
  const reste = (await base.query("select count(*)::int as n from public.clients where id like 'essai-0174-%' or data->>'name' like 'Essai 0174%'")).rows[0].n;
  const trigger = (await base.query("select count(*)::int as n from pg_trigger where tgrelid = 'public.clients'::regclass and tgname = 'garde_argent_cliente_biu'")).rows[0].n;
  await base.close();
  return { message, reste, trigger };
};
const casse = (a, b) => (ESSAI.includes(a) ? ESSAI.replace(a, () => b) : '');

const PANNES = [
  ['la creation par la cliente garde la marque', () => casse("    new.data := new.data - 'essai';\n    if tg_op", "    if tg_op")],
  ['la modification ne rend plus la valeur d avant', () => casse("    if tg_op = 'UPDATE' and (old.data ? 'essai') then\n      new.data := jsonb_set(new.data, '{essai}', old.data -> 'essai');\n    end if;\n", '')],
  ['pas de declencheur sur les fiches', () => casse('create trigger garde_argent_cliente_biu\n  before insert or update on public.clients\n  for each row execute function public.garde_argent_cliente();', 'select 1;')],
  ['declencheur a la modification seulement', () => casse('before insert or update on public.clients', 'before update on public.clients')],
  ['la Maison est gardee comme une cliente', () => casse('  if public.ecriture_de_la_maison() then\n    return new;                       -- comptoir, serveur, fonction du serveur : plein droit\n  end if;\n', '')],
  ['la branche des fiches appelle une fonction retiree aux clientes', () => casse("    new.data := new.data - 'essai';\n    if tg_op", "    perform public.abo_num('{}'::jsonb);\n    new.data := new.data - 'essai';\n    if tg_op")],
];

if (!PGlite) {
  console.log('SAUTE l essai a blanc de 0174 ne se joue pas ici, PGlite absent (BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>)');
} else {
  const avant = await joue(ESSAI);
  const apres = await joue(ESSAI, MIG);
  if (process.env.BANC_DIT) console.log(`[avant] ${avant.message}\n[apres] ${apres.message}`);
  dit('0174 joue dans PGlite : avant, la cliente pose et retire `essai` sur sa fiche et en cree une qui le porte ; apres, jamais, et le reste de sa fiche s ecrit ; TIENT, rien ne reste',
    [true, true, true, true, true, 0, 0],
    [/^ESSAI 0174 : TIENT \|/.test(avant.message),
      /poser avant \[1 ligne, marque posee, le reste ecrit\] apres \[1 ligne, marque refusee, le reste ecrit\]/.test(avant.message),
      /retirer avant \[1 ligne, marque retiree, le reste ecrit\] apres \[1 ligne, marque gardee, le reste ecrit\]/.test(avant.message),
      /creer avant \[1 ligne, marque posee\] apres \[1 ligne, marque refusee\]/.test(avant.message),
      /reste apres \[1 ligne, note essai0174, essai true\]/.test(avant.message), avant.reste, avant.trigger]);
  dit('... l equipe et le serveur ecrivent comme avant (poser, retirer) ; rejoue APRES 0174, il tient encore', [true, true, true, 0, 1],
    [/equipe : poser avant \[1 ligne, marque posee, le reste ecrit\] apres \[1 ligne, marque posee, le reste ecrit\] ; retirer apres \[1 ligne, marque retiree, le reste ecrit\]/.test(avant.message),
      /serveur : poser apres \[1 ligne, marque posee, le reste ecrit\] ; retirer apres \[1 ligne, marque retiree, le reste ecrit\]/.test(avant.message),
      /^ESSAI 0174 : TIENT \|/.test(apres.message), apres.reste, apres.trigger]);
  dit('... aucun refus de droit (42501) : la maquette retire abo_num et ses soeurs a la cliente comme 0138', false, /42501/.test(avant.message));
  /* Ce que 0172 gardait reste garde : la cliente ne forge toujours pas un versement. */
  {
    const base = new PGlite();
    await base.exec(MAQUETTE); await base.exec(MIG);
    const uid = '11111111-1111-4111-8111-111111111111';
    await base.exec(`insert into public.appointments (id, branch_id, data) values ('r1', 'b1', '{"clientId":"${uid}","status":"confirmé"}');
      set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true), set_config('request.jwt.claims', '{"role":"authenticated"}', true);
      update public.appointments set data = data || '{"payments":[{"id":"kkia-faux","amountXof":9}]}'::jsonb where id = 'r1';`);
    const r = (await base.query("select data ? 'payments' as p from public.appointments where id = 'r1'")).rows[0].p;
    await base.close();
    dit('0174 : ce que 0172 gardait reste garde (la cliente ne forge pas un versement)', false, r);
  }
  if (prouve) {
    let muettes = 0;
    for (const [nom, f] of PANNES) {
      const sql = f();
      if (!sql) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const r = await joue(sql, MIG === '' ? '' : '');
      const crie = !/^ESSAI 0174 : TIENT \|/.test(r.message);
      console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${nom}`);
      if (!crie) muettes++;
    }
    console.log(muettes === 0 ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
    if (muettes) process.exitCode = 1;
  }
}
console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nTout tient (${n} controles).`);
