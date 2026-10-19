-- ═══════════════════════════════════════════════════════════════════
-- 0136 · LES DISCUSSIONS DU SITE — 19 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc,
-- rejouable sans dommage.
--
-- Maquette BPWmpyyw… validée (« construis ») : la bulle du site ouvre un
-- vrai chat ; l'équipe répond depuis le Trône (écran Discussions).
--
--   · `discussions` : une ligne par discussion. Elle naît dans la fonction
--     `discussion` (clé de service), qui seule connaît le jeton de la
--     visiteuse (on n'en garde que l'empreinte). Le personnel la lit, la
--     clôt, la relie à une fiche ; la direction l'efface.
--   · `discussion_messages` : les messages. La visiteuse et Claude écrivent
--     par la fonction ; le personnel écrit SES réponses depuis le Trône, et
--     seulement des réponses « maison » signées de son compte.
--   · `discussion_permanence` : qui a pris la permanence, et jusqu'à quand.
--     Chacun ne pose ou ne retire que la sienne.
--   · Realtime : le message d'une visiteuse arrive au Trône à l'instant.
--
-- Le site n'a AUCUN droit sur ces tables : une table publique qu'on peut
-- écrire est une table qu'on peut remplir. `is_staff()` (0003) et
-- `est_direction()` (0089) existent déjà.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'is_staff') then
    raise exception 'is_staff() est absente : passez d’abord 0003_auth.sql';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'est_direction') then
    raise exception 'est_direction() est absente : passez d’abord 0089';
  end if;
end $$;

-- ── ① LES DISCUSSIONS ───────────────────────────────────────────────
create table if not exists public.discussions (
  id          text primary key,                       -- « disc-… », donné par la fonction
  branch_id   text,
  jeton_hash  text not null,                          -- l'empreinte du jeton de la visiteuse
  civilite    text,
  prenom      text,
  nom         text,
  telephone   text,                                   -- E.164
  page        text,                                   -- la page d'où elle écrit
  etat        text not null default 'ouverte' check (etat in ('ouverte', 'close')),
  dernier_de  text check (dernier_de in ('visiteuse', 'maison')),  -- qui, de la visiteuse ou de l'équipe, a parlé en dernier
  derniere_le timestamptz not null default now(),
  alerte_le   timestamptz,                            -- la dernière alerte envoyée à l'équipe
  client_id   text,                                   -- la fiche reliée au Trône
  cree_le     timestamptz not null default now()
);
create index if not exists discussions_derniere_idx on public.discussions (derniere_le desc);

-- ── ② LES MESSAGES ──────────────────────────────────────────────────
create table if not exists public.discussion_messages (
  id            bigint generated always as identity primary key,
  discussion_id text not null references public.discussions(id) on delete cascade,
  de            text not null check (de in ('visiteuse', 'maison', 'auto', 'systeme')),
  texte         text not null check (char_length(texte) between 1 and 2000),
  genre         text,                                 -- « attente », « hors-permanence »… pour les mots du chat
  par           uuid,                                 -- le compte qui a répondu (jamais montré à la visiteuse)
  cree_le       timestamptz not null default now()
);
create index if not exists discussion_messages_fil_idx on public.discussion_messages (discussion_id, id);

-- ── ③ LA PERMANENCE ─────────────────────────────────────────────────
create table if not exists public.discussion_permanence (
  user_id uuid primary key default auth.uid(),
  nom     text,
  jusqua  timestamptz not null
);

-- ── ④ LES DROITS ────────────────────────────────────────────────────
alter table public.discussions enable row level security;
alter table public.discussion_messages enable row level security;
alter table public.discussion_permanence enable row level security;

drop policy if exists discussions_lire on public.discussions;
drop policy if exists discussions_tenir on public.discussions;
drop policy if exists discussions_effacer on public.discussions;
create policy discussions_lire on public.discussions for select to authenticated
  using (public.is_staff());
create policy discussions_tenir on public.discussions for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy discussions_effacer on public.discussions for delete to authenticated
  using (public.est_direction());

drop policy if exists messages_lire on public.discussion_messages;
drop policy if exists messages_repondre on public.discussion_messages;
create policy messages_lire on public.discussion_messages for select to authenticated
  using (public.is_staff());
-- Le personnel n'écrit que des réponses « maison », signées de son compte.
create policy messages_repondre on public.discussion_messages for insert to authenticated
  with check (public.is_staff() and de = 'maison' and par = auth.uid());

drop policy if exists permanence_lire on public.discussion_permanence;
drop policy if exists permanence_prendre on public.discussion_permanence;
drop policy if exists permanence_changer on public.discussion_permanence;
drop policy if exists permanence_rendre on public.discussion_permanence;
create policy permanence_lire on public.discussion_permanence for select to authenticated
  using (public.is_staff());
create policy permanence_prendre on public.discussion_permanence for insert to authenticated
  with check (public.is_staff() and user_id = auth.uid());
create policy permanence_changer on public.discussion_permanence for update to authenticated
  using (user_id = auth.uid()) with check (public.is_staff() and user_id = auth.uid());
create policy permanence_rendre on public.discussion_permanence for delete to authenticated
  using (user_id = auth.uid());

-- Chaque message tient la discussion à jour, sans qu'on puisse l'oublier
-- côté écran. « Qui a parlé en dernier » ne compte que la visiteuse et
-- l'équipe : une réponse de Claude ou un mot du chat ne disent pas qu'un
-- humain a répondu, la discussion reste « à répondre » au Trône.
create or replace function public.discussion_suit_sa_reponse() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.discussions
     set derniere_le = new.cree_le,
         dernier_de = case when new.de in ('visiteuse', 'maison') then new.de else dernier_de end
   where id = new.discussion_id;
  return new;
end $$;
drop trigger if exists discussion_suit_sa_reponse on public.discussion_messages;
create trigger discussion_suit_sa_reponse after insert on public.discussion_messages
  for each row execute function public.discussion_suit_sa_reponse();

-- ── ⑤ REALTIME ──────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['discussions', 'discussion_messages', 'discussion_permanence'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── CONTRÔLE ────────────────────────────────────────────────────────
-- Doit rendre trois lignes : rls true, realtime true ;
-- politiques 3 (discussions), 2 (messages), 4 (permanence).
select
  c.relname                                                                  as table_,
  c.relrowsecurity                                                           as rls,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politiques,
  exists (select 1 from pg_publication_tables r
          where r.pubname = 'supabase_realtime' and r.schemaname = 'public' and r.tablename = c.relname) as realtime
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname in ('discussions', 'discussion_messages', 'discussion_permanence')
order by c.relname;
