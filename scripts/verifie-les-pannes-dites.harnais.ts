/* LES PANNES DITES, EPROUVEES — 12 novembre 2026 (le choix du moyen, lot D).
   `node scripts/verifie-les-pannes-dites.mjs` (et `--prouve`).

   La decision (Yeman, « Oui » au lot D de la maquette DnRyTv95...) : une
   panne de MTN ou de FedaPay dite UNE SEULE FOIS a la direction, et inscrite
   dans La journee. Une ligne par episode (les echecs a moins de dix minutes
   l un de l autre), plusieurs postes ne font pas plusieurs lignes ; hors
   ligne et « ferme » ne s inscrivent jamais.

     A. la regle du poste (src/shared/pannes-dites-pur.ts) ;
     B. la migration 0204, en texte : ses gardes, ses droits, ses mots ;
     C. LA VRAIE MIGRATION, JOUEE DANS PGLITE (BANC_PGLITE=<dossier qui porte
        node_modules/@electric-sql/pglite>) contre une base simulee : rien ne
        part (`appelle_fonction_edge` note au lieu d envoyer), jamais la vraie
        base. Sans PGlite, la partie C SAUTE et le dit ;
     D. les branchements du Trone (la sante des moyens, les appels a la base).

   TOUS LES ATTENDUS SONT ECRITS EN DUR. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PANNE_RETENUE_MS, etatDuPrestataire, heureDite, type LectureDuPrestataire, type Prestataire } from '../src/shared/choix-du-moyen-pur';
import {
  EPISODE_RETENU_MS, PRESTATAIRES, SILENCE_DE_LA_DIRECTION_MS, VUES_POUR_DIRE, estConfirme, estInscriptible, notificationDeLaPanne,
  panneDeLaDemande, pannesDeLaLecture, reponseFermee, type CeQueLePosteVoit,
} from '../src/shared/pannes-dites-pur';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
let ko = 0;
let n = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n += 1;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`));
};
const vrai = (nom: string, v: boolean, detail?: unknown) => dit(nom, true, v ? true : { faux: detail ?? false });
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const lis = (f: string) => lf(readFileSync(f, 'utf8'));
const sansCommentairesSql = (s: string) => s.replace(/--[^\n]*/g, '');

/* ══ A. LA REGLE DU POSTE ═════════════════════════════════════════════ */
const T = Date.parse('2026-11-12T13:02:00Z'); // 14 h 02 a Cotonou
const L = (pret: boolean, ouvert?: boolean): LectureDuPrestataire => ({ pret, ...(ouvert === undefined ? {} : { ouvert }), le: T });
const VU: CeQueLePosteVoit = { enLigne: true, fedapayAllume: true, reponses: { mtn: L(true, true), fedapay: L(true) } };
const avec = (o: Partial<CeQueLePosteVoit>): CeQueLePosteVoit => ({ ...VU, ...o });
const lu = (mtn: LectureDuPrestataire, fedapay: LectureDuPrestataire) => ({ mtn, fedapay });

dit('la lecture : MTN muet pendant que FedaPay repond, MTN s inscrit', ['mtn'], pannesDeLaLecture(lu(null, L(true)), VU));
dit('... FedaPay muet pendant que MTN repond, FedaPay s inscrit', ['fedapay'], pannesDeLaLecture(lu(L(true, true), null), VU));
dit('... les deux muettes ensemble : le reseau du poste ou du serveur, rien', [], pannesDeLaLecture(lu(null, null), VU));
dit('... aucune muette : rien', [], pannesDeLaLecture(lu(L(true, true), L(true)), VU));
dit('... hors ligne : rien, meme une seule muette', [], pannesDeLaLecture(lu(null, L(true)), avec({ enLigne: false })));
dit('... FedaPay eteint dans Parametres : sa fonction muette ne s inscrit pas', [], pannesDeLaLecture(lu(L(true, true), null), avec({ fedapayAllume: false })));
dit('... MTN dit ferme aux clientes a sa derniere reponse : muet, il ne s inscrit pas', [], pannesDeLaLecture(lu(null, L(true)), avec({ reponses: { mtn: L(true, false), fedapay: L(true) } })));
dit('... MTN pas branche a sa derniere reponse : rien', [], pannesDeLaLecture(lu(null, L(true)), avec({ reponses: { mtn: L(false, true), fedapay: L(true) } })));
dit('... FedaPay sans sa cle a sa derniere reponse : rien', [], pannesDeLaLecture(lu(L(true, true), null), avec({ reponses: { mtn: L(true, true), fedapay: L(false) } })));
dit('... jamais lu sur ce poste (aucune reponse gardee) : muet, il s inscrit', ['mtn'], pannesDeLaLecture(lu(null, L(true)), avec({ reponses: {} })));
dit('la vraie demande sans reponse s inscrit ; ni hors ligne, ni FedaPay eteint, ni MTN ferme', [true, true, false, false, false], [
  panneDeLaDemande('mtn', VU), panneDeLaDemande('fedapay', VU), panneDeLaDemande('mtn', avec({ enLigne: false })),
  panneDeLaDemande('fedapay', avec({ fedapayAllume: false })), panneDeLaDemande('mtn', avec({ reponses: { mtn: L(true, false) } }))]);
const casDeLecture: LectureDuPrestataire[] = [L(true, true), L(true, false), L(false, true), L(false, false), L(true), L(false)];
dit('reponseFermee = « pas ouvert » d etatDuPrestataire (le lot A), pour chaque lecture et chaque prestataire',
  PRESTATAIRES.flatMap((p) => casDeLecture.map((l) => !etatDuPrestataire(p, { enLigne: true, allume: true, lecture: l, maintenantMs: T }).ouvert)),
  PRESTATAIRES.flatMap((p) => casDeLecture.map((l) => reponseFermee(p, l))));
dit('estInscriptible : hors ligne jamais, ferme jamais', [true, false, false, false], [
  estInscriptible('mtn', VU), estInscriptible('mtn', avec({ enLigne: false })), estInscriptible('fedapay', avec({ fedapayAllume: false })),
  estInscriptible('fedapay', avec({ reponses: { fedapay: L(false) } }))]);
dit('l episode : dix minutes, la mesure de la fenetre Encaisser (PANNE_RETENUE_MS)', [600_000, 600_000], [EPISODE_RETENU_MS, PANNE_RETENUE_MS]);
dit('une lecture muette se dit a sa deuxieme vue ; une vraie demande aussitot', [2, false, true, true], [
  VUES_POUR_DIRE, estConfirme({ parDemande: false, vues: 1 }), estConfirme({ parDemande: false, vues: 2 }), estConfirme({ parDemande: true, vues: 1 })]);
dit('une panne revenue moins d une heure apres la derniere notification ne se redit pas', 3_600_000, SILENCE_DE_LA_DIRECTION_MS);
const NOTE_MTN = notificationDeLaPanne('mtn', T);
dit('la notification, en francais, l heure de Cotonou',
  { titre: 'MTN ne répond pas', corps: 'Depuis 14 h 02, le Trône propose un autre moyen à la caisse. La fin de la panne s’inscrira dans La journée.' }, NOTE_MTN);
dit('... FedaPay a la sienne', 'FedaPay ne répond pas', notificationDeLaPanne('fedapay', T).titre);
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
vrai('... sans emoji, sans tiret « — »', ![NOTE_MTN.titre, NOTE_MTN.corps].some((s) => EMOJI.test(s) || s.includes('—')));

/* ══ B. LA MIGRATION 0204, EN TEXTE ═══════════════════════════════════ */
const migrations = readdirSync('supabase/migrations').filter((f) => /^0204_/.test(f));
dit('une seule migration 0204', ['0204_les_pannes_dites.sql'], migrations);
const SQL = migrations.length ? lis(`supabase/migrations/${migrations[0]}`) : '';
const code = sansCommentairesSql(SQL);
const DESTRUCTIF = ((): RegExp | null => {
  const m = /const DESTRUCTIF = (\/.+\/[a-z]*);/.exec(lis('scripts/mise-en-ligne.mjs'));
  return m ? (new Function(`return ${m[1]};`)() as RegExp) : null;
})();
vrai('l outil de mise en ligne la passe sans --destructif (aucun de ses mots, commentaires compris)', !!DESTRUCTIF && !DESTRUCTIF.test(SQL), DESTRUCTIF ? SQL.match(DESTRUCTIF)?.[0] : 'regle introuvable');
vrai('les episodes sous RLS, lus par le personnel, jamais ecrits par lui',
  code.includes('alter table public.pannes_des_moyens enable row level security;')
  && /create policy pannes_des_moyens_lire on public\.pannes_des_moyens for select to authenticated\s+using \(public\.is_staff\(\)\);/.test(code)
  && code.includes('revoke all on public.pannes_des_moyens from anon, authenticated;')
  && code.includes('grant select on public.pannes_des_moyens to authenticated;')
  && !/grant (insert|update|delete|all)[^;]*on public\.pannes_(des_moyens|prevenues)/i.test(code));
vrai('le journal sous RLS, lu par la direction seule',
  code.includes('alter table public.pannes_prevenues enable row level security;')
  && /create policy pannes_prevenues_lire on public\.pannes_prevenues for select to authenticated\s+using \(public\.est_direction\(\)\);/.test(code)
  && code.includes('revoke all on public.pannes_prevenues from anon, authenticated;'));
vrai('un seul episode ouvert par prestataire et par maison (index unique partiel)',
  code.includes('create unique index if not exists pannes_des_moyens_une_ouverte on public.pannes_des_moyens (prestataire, branch_id) where fin is null;'));
const fonctions = ['le_moyen_est_ferme', 'vois_une_panne', 'une_demande_repasse', 'previens_de_la_panne'];
vrai('chaque fonction : security definer, search_path fixe', fonctions.every((f) => new RegExp(`create or replace function public\\.${f}\\([^)]*\\)[\\s\\S]{0,80}?language plpgsql (stable )?security definer set search_path = public as \\$\\$`).test(code)),
  fonctions.filter((f) => !new RegExp(`create or replace function public\\.${f}\\([^)]*\\)[\\s\\S]{0,80}?language plpgsql (stable )?security definer set search_path = public as \\$\\$`).test(code)));
const corpsDe = (f: string) => { const i = code.indexOf(`create or replace function public.${f}(`); return i < 0 ? '' : code.slice(i, code.indexOf('$$;', i)); };
vrai('vois_une_panne et une_demande_repasse : le personnel seul (42501), la garde en premier', ['vois_une_panne', 'une_demande_repasse'].every((f) => {
  const c = corpsDe(f);
  return /begin\s+if not public\.is_staff\(\) then\s+raise exception 'RESERVE_AU_PERSONNEL' using errcode = '42501';/.test(c);
}));
vrai('... le prestataire, la source et la maison relus (22023)', /p_prestataire not in \('mtn', 'fedapay'\)/.test(corpsDe('vois_une_panne')) && /p_source not in \('lecture', 'demande'\)/.test(corpsDe('vois_une_panne'))
  && ['vois_une_panne', 'une_demande_repasse'].every((f) => corpsDe(f).includes('not exists (select 1 from public.branches b where b.id = p_branche)')));
vrai('... un moyen ferme ne s inscrit pas (la base le relit elle-meme)', /if public\.le_moyen_est_ferme\(p_prestataire\) then\s+return jsonb_build_object\('ok', false, 'motif', 'ferme'\);/.test(corpsDe('vois_une_panne')));
vrai('... un verrou par prestataire et par maison, l heure du serveur prise apres lui', ['vois_une_panne', 'une_demande_repasse'].every((f) =>
  /perform pg_advisory_xact_lock\(hashtext\('pannes_des_moyens\|' \|\| p_prestataire \|\| '\|' \|\| p_branche\)\);\s+v_maintenant := clock_timestamp\(\);/.test(corpsDe(f))));
const minutes = [...code.matchAll(/interval '(\d+) minutes'/g)].map((m) => Number(m[1]));
dit('les intervalles de la base = ceux du Trone (10 minutes l episode, 60 le silence de la direction)',
  [EPISODE_RETENU_MS / 60_000, EPISODE_RETENU_MS / 60_000, SILENCE_DE_LA_DIRECTION_MS / 60_000], minutes);
vrai('les droits : les deux gestes au personnel, ni a anon ni au public ; le reste a personne',
  code.includes('revoke execute on function public.vois_une_panne(text, text, text) from public, anon;')
  && code.includes('grant execute on function public.vois_une_panne(text, text, text) to authenticated;')
  && code.includes('revoke execute on function public.une_demande_repasse(text, text) from public, anon;')
  && code.includes('grant execute on function public.une_demande_repasse(text, text) to authenticated;')
  && code.includes('revoke execute on function public.le_moyen_est_ferme(text) from public, anon, authenticated;')
  && code.includes('revoke execute on function public.previens_de_la_panne() from public, anon, authenticated;'));
const prev = corpsDe('previens_de_la_panne');
vrai('la notification : confirmee seulement (une demande, ou VUES_POUR_DIRE vues), une fois par episode (le journal d abord)',
  prev.includes(`if not (new.par_demande or new.vues >= ${VUES_POUR_DIRE}) or new.fin is not null then`)
  && /insert into public\.pannes_prevenues \(episode\) values \(new\.id\)\s+on conflict \(episode\) do nothing;\s+if not found then\s+return new;\s+end if;/.test(prev));
vrai('... a chaque souverain et chaque gerant, par push-notify to-staff, vers La journee',
  prev.includes("for compte in select s.user_id from public.staff s where s.role in ('souverain', 'gerant') loop")
  && prev.includes("perform public.appelle_fonction_edge('push-notify', jsonb_build_object(") && prev.includes("'mode', 'to-staff',")
  && prev.includes("'url', '/trone/#/la-journee',"));
vrai('... jamais la panne d une notification ne refuse l inscription', /exception when others then\s+update public\.pannes_prevenues set issue = 'refuse : '/.test(prev)
  && /exception when others then\s+raise warning 'panne %/.test(prev));
vrai('le declencheur : a la naissance et a chaque vue (vues, par_demande)', code.includes('create trigger pannes_des_moyens_previent after insert or update of vues, par_demande on public.pannes_des_moyens'));
const suite = NOTE_MTN.corps.replace(/^Depuis 14 h 02/, '');
vrai('le texte de la base = notificationDeLaPanne (titre et corps, mot pour mot)', prev.includes("titre := nom || ' ne répond pas';") && NOTE_MTN.titre === 'MTN ne répond pas'
  && prev.includes(`|| '${suite}';`) && prev.includes("nom := case new.prestataire when 'mtn' then 'MTN' else 'FedaPay' end;"));
vrai('aucune emoji dans la migration', !EMOJI.test(SQL));
vrai('la migration se controle a la fin (un select de verification)', /-- ── Contrôle[\s\S]*select\s+\(select relrowsecurity from pg_class where oid = 'public\.pannes_des_moyens'::regclass\) as rls_pannes,/.test(SQL));

/* ══ C. LA VRAIE MIGRATION, JOUEE DANS PGLITE ═════════════════════════ */
const chargePGlite = async (): Promise<Any | null> => {
  const dossier = process.env.BANC_PGLITE;
  if (!dossier) return null;
  try { const m = await import(pathToFileURL(path.join(dossier, 'node_modules/@electric-sql/pglite/dist/index.js')).href); return m?.PGlite ?? null; } catch { return null; }
};
const PGlite = await chargePGlite();
if (!PGlite) {
  console.log('SAUTE la migration 0204 ne se joue pas ici, PGlite absent (BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>)');
} else {
  const bd = new PGlite();
  const UID = { souverain: '00000000-0000-0000-0000-0000000000d1', gerant: '00000000-0000-0000-0000-0000000000d2', e1: '00000000-0000-0000-0000-0000000000e1', e2: '00000000-0000-0000-0000-0000000000e2' };
  await bd.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    grant usage on schema auth to authenticated, anon;
    grant usage on schema public to authenticated, anon;
    create table public.reglage_du_banc (uid uuid);
    insert into public.reglage_du_banc values (null);
    grant select on public.reglage_du_banc to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as $$ select uid from public.reglage_du_banc limit 1 $$;
    create table public.staff (user_id uuid primary key, role text);
    create function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.staff where user_id = auth.uid()) $$;
    create function public.est_direction() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.staff where user_id = auth.uid() and role in ('souverain', 'gerant')) $$;
    create table public.branches (id text primary key, data jsonb not null default '{}'::jsonb);
    create table public.documents (key text primary key, data jsonb);
    create table public.collecte_mtn_reglage (id smallint primary key, ouverte boolean not null default false);
    create table public.envois_du_banc (n serial primary key, nom text, corps jsonb);
    create table public.panne_du_banc (casse boolean);
    insert into public.panne_du_banc values (false);
    create function public.appelle_fonction_edge(nom text, corps jsonb default '{}'::jsonb) returns bigint language plpgsql as $$
    begin
      if (select casse from public.panne_du_banc limit 1) then raise exception 'Vault : le secret manque'; end if;
      insert into public.envois_du_banc (nom, corps) values (nom, corps);
      return 1;
    end $$;
    insert into public.staff values ('${UID.souverain}', 'souverain'), ('${UID.gerant}', 'gerant'), ('${UID.e1}', 'staff'), ('${UID.e2}', 'staff');
    insert into public.branches (id) values ('maison'), ('ailleurs');
    insert into public.documents values ('mnd_settings', '{"mndPay": {"actif": true}}');
    insert into public.collecte_mtn_reglage values (1, true);
  `);
  let migrationPassee = true;
  try { await bd.exec(SQL); } catch (e) { migrationPassee = false; console.log(`la migration ne passe pas : ${(e as Error).message}`); }
  vrai('PGlite : la migration 0204 passe telle quelle', migrationPassee);
  const comme = async (uid: string | null) => { await bd.query('update public.reglage_du_banc set uid = $1', [uid]); };
  const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v) as Any;
  const vois = async (p: string, b: string, s: string) => json((await bd.query('select public.vois_une_panne($1, $2, $3) as r', [p, b, s])).rows[0].r);
  const repasse = async (p: string, b: string) => json((await bd.query('select public.une_demande_repasse($1, $2) as r', [p, b])).rows[0].r);
  const echoue = async (f: () => Promise<unknown>): Promise<string | null> => { try { await f(); return null; } catch (e) { return String((e as Any)?.code ?? (e as Error).message); } };
  const rangs = async (b = 'maison', p = 'mtn') => (await bd.query("select id, vues, fin_par, (fin is null) as ouverte, array_length(vue_par, 1) as postes, par_demande from public.pannes_des_moyens where branch_id = $1 and prestataire = $2 order by debut, id", [b, p])).rows as Any[];
  const envois = async () => (await bd.query('select corps from public.envois_du_banc order by n')).rows.map((r: Any) => json(r.corps)) as Any[];
  const issue = async (id: string) => (await bd.query('select issue, envois from public.pannes_prevenues where episode = $1', [id])).rows[0] ?? null;
  const vieillis = async (id: string, minutes: number) => bd.query(`update public.pannes_des_moyens set debut = debut - interval '${minutes} minutes', derniere_vue = derniere_vue - interval '${minutes} minutes' where id = $1`, [id]);
  const ouvertes = async () => (await bd.query('select prestataire, branch_id from public.pannes_des_moyens where fin is null order by 1, 2')).rows as Any[];

  if (migrationPassee) {
    /* 1. Qui peut inscrire. */
    await comme(null);
    dit('PGlite : sans compte du personnel, rien ne s inscrit (42501)', '42501', await echoue(() => vois('mtn', 'maison', 'lecture')));
    /* 2. Une lecture muette : une ligne, personne prevenu. */
    await comme(UID.e1);
    const r1 = await vois('mtn', 'maison', 'lecture');
    const ep1 = String(r1.episode);
    dit('PGlite : la premiere vue ouvre l episode', { ok: true, neuf: true, lignes: 1, vues: 1 }, { ok: r1.ok, neuf: r1.neuf, lignes: (await rangs()).length, vues: (await rangs())[0]?.vues });
    dit('... une lecture muette d une seule minute ne reveille personne', [0, null], [(await envois()).length, await issue(ep1)]);
    /* 3. Un autre poste la voit : la meme ligne, la direction prevenue. */
    await comme(UID.e2);
    const r2 = await vois('mtn', 'maison', 'lecture');
    dit('PGlite : un autre poste la voit, la meme ligne (deux vues, deux postes)', { neuf: false, meme: true, lignes: 1, vues: 2, postes: 2 },
      { neuf: r2.neuf, meme: String(r2.episode) === ep1, lignes: (await rangs()).length, vues: (await rangs())[0]?.vues, postes: (await rangs())[0]?.postes });
    const e3 = await envois();
    dit('... a la deuxieme vue, la direction prevenue : le souverain et le gerant, pas l equipe', [UID.souverain, UID.gerant].sort(), e3.map((c) => c.userId).sort());
    const debut1 = (await bd.query('select debut from public.pannes_des_moyens where id = $1', [ep1])).rows[0].debut as Date;
    dit('... le texte de la base = notificationDeLaPanne, a l heure de sa naissance',
      [{ mode: 'to-staff', title: notificationDeLaPanne('mtn', new Date(debut1).getTime()).titre, body: notificationDeLaPanne('mtn', new Date(debut1).getTime()).corps, url: '/trone/#/la-journee', tag: 'mnd-panne' }],
      [...new Set(e3.map((c) => JSON.stringify({ mode: c.mode, title: c.title, body: c.body, url: c.url, tag: c.tag })))].map((s) => JSON.parse(s)));
    dit('... le journal dit « parti », deux envois', { issue: 'parti', envois: 2 }, await issue(ep1));
    /* 4. Les vues suivantes ne previennent plus. */
    await comme(UID.e1);
    await vois('mtn', 'maison', 'lecture');
    await vois('mtn', 'maison', 'demande');
    dit('PGlite : les echecs suivants prolongent sans prevenir (4 vues, deux postes, deux envois en tout)', { vues: 4, postes: 2, envois: 2, demande: true },
      { vues: (await rangs())[0]?.vues, postes: (await rangs())[0]?.postes, envois: (await envois()).length, demande: (await rangs())[0]?.par_demande });
    /* 5. Une demande repasse : la fin. */
    const f1 = await repasse('mtn', 'maison');
    dit('PGlite : une demande qui repasse finit l episode (« demande »)', { fini: ep1, ouverte: false, par: 'demande' }, { fini: String(f1.fini), ouverte: (await rangs())[0]?.ouverte, par: (await rangs())[0]?.fin_par });
    dit('... et rien a finir ensuite', null, (await repasse('mtn', 'maison')).fini);
    /* 6. Revenue dans l heure : un episode neuf, deja dit. */
    const r6 = await vois('mtn', 'maison', 'demande');
    dit('PGlite : la panne qui revient apres une demande passee ouvre un episode neuf', [true, 2], [r6.neuf, (await rangs()).length]);
    dit('... confirmee aussitot (une vraie demande), mais revenue dans l heure : deja dite, personne reveille', [{ issue: 'deja-dit', envois: 0 }, 2], [await issue(String(r6.episode)), (await envois()).length]);
    /* 7. Le silence : onze minutes sans echec, l episode a fini a son dernier echec. */
    await vieillis(String(r6.episode), 11);
    const avantSilence = (await bd.query('select derniere_vue from public.pannes_des_moyens where id = $1', [String(r6.episode)])).rows[0].derniere_vue;
    const r7 = await vois('mtn', 'maison', 'lecture');
    const clos = (await bd.query('select fin, fin_par from public.pannes_des_moyens where id = $1', [String(r6.episode)])).rows[0] as Any;
    dit('PGlite : onze minutes sans echec, l episode d avant finit a son dernier echec (« silence ») ; un neuf s ouvre',
      { neuf: true, par: 'silence', aSonDernierEchec: true, ouvertes: 1 },
      { neuf: r7.neuf, par: clos.fin_par, aSonDernierEchec: new Date(clos.fin).getTime() === new Date(avantSilence).getTime(), ouvertes: (await ouvertes()).length });
    /* 8. Neuf minutes : le meme episode. */
    await vieillis(String(r7.episode), 9);
    const r8 = await vois('mtn', 'maison', 'lecture');
    dit('PGlite : neuf minutes apres le dernier echec, le meme episode (echecSuivant)', [false, String(r7.episode)], [r8.neuf, String(r8.episode)]);
    /* 9. Plus d une heure apres la derniere notification : redite. */
    await bd.query("update public.pannes_prevenues set prevenu_le = prevenu_le - interval '61 minutes'");
    await repasse('mtn', 'maison');
    const r9 = await vois('mtn', 'maison', 'demande');
    dit('PGlite : plus d une heure apres la derniere notification, la panne revenue se redit', [{ issue: 'parti', envois: 2 }, 4], [await issue(String(r9.episode)), (await envois()).length]);
    /* 10. Une maison, ses episodes. */
    const r10 = await vois('mtn', 'ailleurs', 'lecture');
    dit('PGlite : une autre maison a son propre episode', [true, 1, 1], [r10.neuf, (await rangs('ailleurs')).length, (await rangs()).filter((x) => x.ouverte).length]);
    /* 11. Ferme n est pas en panne. */
    await bd.query('update public.collecte_mtn_reglage set ouverte = false');
    await repasse('mtn', 'ailleurs');
    const avantFerme = (await rangs('ailleurs')).length;
    dit('PGlite : MTN ferme aux clientes, rien ne s inscrit (« ferme »)', [{ ok: false, motif: 'ferme' }, avantFerme], [await vois('mtn', 'ailleurs', 'demande'), (await rangs('ailleurs')).length]);
    await bd.query('update public.collecte_mtn_reglage set id = 2');
    dit('... sans la ligne de son interrupteur, MTN est ferme (comme collecte-mtn)', 'ferme', (await vois('mtn', 'ailleurs', 'demande')).motif);
    await bd.query('update public.collecte_mtn_reglage set id = 1, ouverte = true');
    await bd.query(`update public.documents set data = '{"mndPay": {"actif": false}}' where key = 'mnd_settings'`);
    dit('PGlite : FedaPay eteint dans Parametres, rien ne s inscrit', [{ ok: false, motif: 'ferme' }, 0], [await vois('fedapay', 'maison', 'demande'), (await rangs('maison', 'fedapay')).length]);
    await bd.query("update public.documents set key = 'autre' where key = 'mnd_settings'");
    dit('... sans reglages, FedaPay est ferme', 'ferme', (await vois('fedapay', 'maison', 'demande')).motif);
    await bd.query(`update public.documents set key = 'mnd_settings', data = '{"mndPay": {"actif": true}}' where key = 'autre'`);
    const r11 = await vois('fedapay', 'maison', 'lecture');
    dit('... allume, il s inscrit', [true, true], [r11.ok, r11.neuf]);
    /* 12. Les gardes des arguments. */
    dit('PGlite : un prestataire, une maison ou une source inconnus sont refuses (22023)', ['22023', '22023', '22023', '22023'], [
      await echoue(() => vois('kkiapay', 'maison', 'lecture')), await echoue(() => vois('mtn', 'nulle-part', 'lecture')),
      await echoue(() => vois('mtn', 'maison', 'rumeur')), await echoue(() => repasse('mtn', 'nulle-part'))]);
    await comme(null);
    dit('... une demande repassee sans compte du personnel : refusee (42501)', '42501', await echoue(() => repasse('mtn', 'maison')));
    await comme(UID.e1);
    /* 13. L index unique tient la porte meme sans les fonctions. */
    dit('PGlite : deux episodes ouverts pour le meme prestataire et la meme maison sont impossibles (23505)', '23505',
      await echoue(() => bd.query("insert into public.pannes_des_moyens (prestataire, branch_id, debut, derniere_vue) values ('fedapay', 'maison', now(), now())")));
    /* 14. Une notification en panne ne refuse pas l inscription. */
    await bd.query("update public.pannes_prevenues set prevenu_le = prevenu_le - interval '2 hours'");
    await bd.query('update public.panne_du_banc set casse = true');
    await repasse('fedapay', 'maison');
    let r14: Any = null;
    const e14 = await echoue(async () => { r14 = await vois('fedapay', 'maison', 'demande'); });
    const i14 = r14 ? await issue(String(r14.episode)) : null;
    dit('PGlite : push-notify injoignable, la panne s inscrit quand meme, le journal dit le refus', [null, true, true],
      [e14, !!r14?.neuf, typeof i14?.issue === 'string' && i14.issue.startsWith('refuse : ')]);
    await bd.query('update public.panne_du_banc set casse = false');
    /* 15. Sans direction : dit tel quel. */
    await bd.query("update public.staff set role = 'staff-du-banc' where role in ('souverain', 'gerant')");
    await bd.query("update public.pannes_prevenues set prevenu_le = prevenu_le - interval '2 hours'");
    await repasse('mtn', 'maison');
    const r15 = await vois('mtn', 'maison', 'demande');
    dit('PGlite : personne a la direction, le journal le dit (« sans-direction »)', { issue: 'sans-direction', envois: 0 }, await issue(String(r15.episode)));
    await bd.query(`update public.staff set role = 'souverain' where user_id = '${UID.souverain}'`);
    await bd.query(`update public.staff set role = 'gerant' where user_id = '${UID.gerant}'`);
    /* 16. La RLS et les droits, par les vrais roles. */
    const sous = async (role: string, uid: string | null, f: () => Promise<unknown>) => {
      await comme(uid);
      await bd.exec(`set role ${role}`);
      try { return await f(); } finally { await bd.exec('reset role'); }
    };
    const compte = async (t: string) => Number((await bd.query(`select count(*)::int as n from public.${t}`)).rows[0].n);
    dit('PGlite : le personnel lit les episodes ; il ne les ecrit pas lui-meme (42501)', [true, '42501', '42501'], [
      (await sous('authenticated', UID.e1, () => compte('pannes_des_moyens')) as number) > 0,
      await sous('authenticated', UID.e1, () => echoue(() => bd.query("insert into public.pannes_des_moyens (prestataire, branch_id, debut, derniere_vue) values ('mtn', 'ailleurs', now(), now())"))),
      await sous('authenticated', UID.e1, () => echoue(() => bd.query("update public.pannes_des_moyens set fin = now(), fin_par = 'demande'"))),
    ]);
    dit('PGlite : le journal, la direction seule le lit', [0, true], [
      await sous('authenticated', UID.e1, () => compte('pannes_prevenues')),
      (await sous('authenticated', UID.souverain, () => compte('pannes_prevenues')) as number) > 0,
    ]);
    dit('PGlite : le personnel appelle les deux gestes ; anon ni ne lit ni n appelle', [true, '42501', '42501'], [
      !!(await sous('authenticated', UID.e1, () => vois('fedapay', 'ailleurs', 'lecture')) as Any)?.ok,
      await sous('anon', null, () => echoue(() => compte('pannes_des_moyens'))),
      await sous('anon', null, () => echoue(() => vois('mtn', 'maison', 'lecture'))),
    ]);
    /* 17. L heure dite par la base = heureDite (UTC + 1), a toute heure. */
    const fmt = /to_char\(new\.debut at time zone '([^']+)', '([^']+)'\)/.exec(prev);
    const instants = ['2026-11-12T00:00:00Z', '2026-11-12T08:05:00Z', '2026-11-12T13:02:00Z', '2026-11-12T22:59:00Z', '2026-11-12T23:30:00Z', '2026-07-01T11:09:00Z'];
    const dites = fmt ? (await bd.query(`select to_char(t::timestamptz at time zone $1, $2) as h from unnest($3::text[]) as t`, [fmt[1], fmt[2], instants])).rows.map((r: Any) => r.h) : [];
    dit('PGlite : l heure de la notification = heureDite (Cotonou, sans zero devant l heure)', instants.map((i) => heureDite(Date.parse(i))), dites);
    /* 18. Rejouable. */
    const avantRejeu = [await compte('pannes_des_moyens'), await compte('pannes_prevenues')];
    let rejouee = true;
    try { await bd.exec(SQL); } catch (e) { rejouee = false; console.log(`rejouee : ${(e as Error).message}`); }
    dit('PGlite : rejouee, la migration passe et ne touche a rien', [true, avantRejeu], [rejouee, [await compte('pannes_des_moyens'), await compte('pannes_prevenues')]]);
  }
  await bd.close();
}

/* ══ D. LES BRANCHEMENTS DU TRONE ═════════════════════════════════════ */
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sante = sansCommentaires(lis('src/apps/trone/routes/clients/sante-des-moyens.ts'));
vrai('la sante : la vraie demande sans reponse s inscrit, sous la regle (ni hors ligne, ni fermee)',
  sante.includes("  ecris({ ...memoire, echecs: { ...memoire.echecs, [p]: echecSuivant(memoire.echecs[p], Date.now()) } });\n  if (panneDeLaDemande(p, ceQueLePosteVoit())) void inscrisLaPanne(p, 'demande', brancheIci());"));
vrai('... une demande qui passe finit l episode en base, meme vu par un autre poste (avant la memoire de ce poste)',
  sante.includes("  if (enLigneIci()) void finisLaPanne(p, brancheIci());\n  if (!memoire.echecs[p]) return;"));
vrai('... la lecture muette s inscrit sous la regle, apres avoir garde la derniere reponse',
  sante.includes('    const reponses = { ...memoire.reponses, ...(mtn ? { mtn } : {}), ...(fedapay ? { fedapay } : {}) };\n    ecris({ ...memoire, lectures: { mtn, fedapay }, reponses });\n    for (const p of pannesDeLaLecture({ mtn, fedapay }, ceQueLePosteVoit())) void inscrisLaPanne(p, \'lecture\', brancheIci());'));
vrai('... hors ligne : ni base ni reseau, rien ne s inscrit', sante.includes("const enLigneIci = (): boolean => !!supabase && (typeof navigator === 'undefined' || navigator.onLine !== false);")
  && sante.includes('const ceQueLePosteVoit = (): CeQueLePosteVoit => ({ enLigne: enLigneIci(), fedapayAllume: fedapayAllumeVu, reponses: memoire.reponses });'));
vrai('... FedaPay eteint, tel que la fenetre le dit, avant la premiere lecture',
  /useEffect\(\(\) => \{ fedapayAllumeVu = fedapayAllume; \}, \[fedapayAllume\]\);\s+useEffect\(\(\) => \{\s+if \(!actif \|\| !supabase\) return;/.test(sante));
vrai('... la memoire garde les reponses d une fenetre a l autre', sante.includes('reponses: v.reponses ?? {}'));
vrai('... la maison du poste, comme useBranch la lit', sante.includes('return (toutes.find((b) => b.id === id) ?? toutes[0])?.id ?? id;'));
const base = sansCommentaires(lis('src/shared/pannes-des-moyens.ts'));
vrai('les appels a la base portent les noms et les arguments de 0204',
  base.includes("supabase.rpc('vois_une_panne', { p_prestataire: p, p_branche: branche, p_source: source })")
  && base.includes("supabase.rpc('une_demande_repasse', { p_prestataire: p, p_branche: branche })")
  && code.includes('create or replace function public.vois_une_panne(p_prestataire text, p_branche text, p_source text')
  && code.includes('create or replace function public.une_demande_repasse(p_prestataire text, p_branche text)'));
vrai('... l ecran lit les pannes de SA maison et de SON jour, sans jamais les ecrire',
  base.includes(".eq('branch_id', branche).gte('debut', minuitACotonou(jour)).lt('debut', minuitACotonou(jour, 1))")
  && !/\.(insert|update|upsert|delete)\(/.test(base));
vrai('... rien ne se met en file pour plus tard (une panne vue hors ligne n est la panne de personne)', !/file-d-attente|localStorage/.test(base));
const actions = sansCommentaires(lis('src/apps/trone/routes/clients/actions.tsx'));
vrai('la fenetre Encaisser dit toujours ses pannes et ses reussites a la sante (lot A)',
  ["onPanne={() => signaleUnePanne('mtn')}", "onPanne={() => signaleUnePanne('fedapay')}", "onReussite={() => signaleUneReussite('mtn')}", "onReussite={() => signaleUneReussite('fedapay')}"].every((s) => actions.includes(s)));

console.log(`\n${n - ko}/${n} epreuves : les pannes dites.`);
if (ko) console.log(`${ko} ECHEC(S).`);
