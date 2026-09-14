-- ═══════════════════════════════════════════════════════════════════
-- 0098 — LES APPELS WHATSAPP · 14 septembre 2026
--
-- « N'oublie pas que je dois recevoir les appels WhatsApp » (Yéman).
-- Maquette `public/maquette-decrocher-dans-le-trone.html`, validée.
--
-- LE CARNET EXISTANT NE DISPARAÎT PAS. « Les Appels » reste ce qu'il est :
-- un carnet qu'on remplit à la main quand une cliente appelle sur le
-- téléphone du salon. Le code y dit même, depuis le 25 août, qu'un navigateur
-- ne peut pas détecter un appel. C'était vrai — pour les appels du réseau. Un
-- appel WHATSAPP passe par Meta, et Meta nous le dit. Deux mondes, un seul
-- endroit où les lire.
--
-- POURQUOI UNE TABLE ET NON UN DOCUMENT. Le carnet à la main vit dans un
-- document (`mnd_appels`), écrit par un poste à la fois. Un appel WhatsApp est
-- écrit par LE SERVEUR pendant que trois postes lisent, et deux postes peuvent
-- décrocher à la même seconde. Un document entier réécrit à chaque geste
-- perdrait l'un des deux ; une table ne perd rien.
--
-- ══ LE PREMIER QUI DÉCROCHE GAGNE, ET C'EST LA BASE QUI L'ARBITRE ═══
--
-- Tous les postes sonnent. Deux mains peuvent tomber sur le bouton dans la
-- même seconde, et à cette échelle-là l'écran ne peut RIEN garantir : il n'a
-- pas vu l'autre poste, il ne le verra qu'après. Si les deux écrivent, le
-- dernier écrase le premier, et deux personnes croient avoir l'appel.
--
-- LE DÉCLENCHEUR TRANCHE : une fois `prisPar` posé, il ne se réécrit plus.
-- Le second poste retrouve donc le nom du premier, comprend que l'appel est
-- pris, et se tait. C'est la même leçon que la grille de paie (0091) et que
-- les codes promo (0093) : ce qui touche à un arbitrage se garde en base, pas
-- à l'écran.
--
-- IL RESTAURE PLUTÔT QU'IL NE REFUSE — un refus ferait échouer toute la
-- synchronisation de la ligne et laisserait l'écran en rouge sans que
-- personne comprenne.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.appels_wa (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.appels_wa enable row level security;

create index if not exists appels_wa_quand on public.appels_wa ((data->>'sonneLe'));
create index if not exists appels_wa_tete  on public.appels_wa ((data->>'clientId'));

drop policy if exists appel_lu       on public.appels_wa;
drop policy if exists appel_ecrit    on public.appels_wa;
drop policy if exists appel_efface   on public.appels_wa;

-- LE TRÔNE EST LE TÉLÉPHONE DE LA MAISON : tout le personnel lit et décroche.
-- Une cliente ne voit jamais cette table — un journal d'appels dit qui a
-- appelé qui, et à quelle heure.
create policy appel_lu on public.appels_wa for select to authenticated
  using (public.is_staff());

create policy appel_ecrit on public.appels_wa for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy appel_efface on public.appels_wa for delete to authenticated
  using (public.est_direction());

create or replace function public.appel_wa_garde_qui_a_decroche() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fige text;
begin
  -- ① QUI A DÉCROCHÉ NE SE RÉÉCRIT PAS. Le premier nom posé est le bon.
  if nullif(old.data->>'prisPar', '') is not null then
    foreach fige in array array['prisPar', 'prisLe'] loop
      if (old.data ? fige) then
        new.data := jsonb_set(new.data, array[fige], old.data -> fige, true);
      end if;
    end loop;
  end if;

  -- ② L'HEURE OÙ IL A COMMENCÉ À SONNER EST UN FAIT, pas un réglage : Meta
  --    la donne une fois, et la déplacer fausserait toutes les durées.
  if (old.data ? 'sonneLe') then
    new.data := jsonb_set(new.data, array['sonneLe'], old.data -> 'sonneLe', true);
  end if;

  -- ③ UN RAPPEL DÉJÀ POSÉ NE SE REPOSE PAS. Meta répète volontiers ses
  --    événements ; sans cela, une cliente serait rappelée deux fois.
  if nullif(old.data->>'rappelId', '') is not null then
    new.data := jsonb_set(new.data, array['rappelId'], old.data -> 'rappelId', true);
  end if;

  return new;
end;
$$;

drop trigger if exists appels_wa_garde on public.appels_wa;

create trigger appels_wa_garde before update on public.appels_wa
  for each row execute function public.appel_wa_garde_qui_a_decroche();

drop trigger if exists appels_wa_touch on public.appels_wa;

create trigger appels_wa_touch before update on public.appels_wa
  for each row execute function public.touch_updated_at();

-- LE DIRECT — il ne s'agit plus de confort : un appel qui sonne doit paraître
-- sur TOUS les postes dans la seconde, et se taire sur tous dès qu'un seul
-- décroche. Sans le direct, la fonction entière n'a pas de sens.
do $$
begin
  alter publication supabase_realtime add table public.appels_wa;
exception when duplicate_object then null;
end $$;

-- LA TRACE (0092) : qui a décroché, qui n'a pas décroché, et à quelle heure.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'trace_le_geste') then
    execute 'drop trigger if exists trace_le_geste on public.appels_wa';
    execute 'create trigger trace_le_geste after insert or update or delete '
         || 'on public.appels_wa for each row execute function public.trace_le_geste()';
  end if;
end $$;

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select 'appels_wa' as table_creee, count(*) as lignes from public.appels_wa;

select tgname as declencheur
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relname = 'appels_wa'
order by tgname;
