-- ═══════════════════════════════════════════════════════════════════
-- 0093 — LES CODES DE PROMOTION · 14 septembre 2026
--
-- « Des promos flash avec des codes de réductions ? » (Yéman).
--
-- UN CODE PAR CLIENTE, À USAGE UNIQUE, 48 HEURES. Envoyer « −15 % avec le
-- code ECLAT15 » est facile ; le faire reconnaître à la caisse est le vrai
-- chantier. Cette table porte les quatre garanties : le code EXISTE, il
-- appartient à UNE tête, il ne sert qu'UNE fois, et la trace dit QUI l'a
-- accepté.
--
-- CE QUE LA BASE GARDE, ET QUE L'ÉCRAN NE PEUT PAS GARDER SEUL :
--
--   ① DEUX CODES IDENTIQUES NE PEUVENT PAS EXISTER. Un index unique sur la
--      forme normalisée du code (capitales, sans accent, sans ponctuation).
--      Sans lui, deux caisses hors ligne pourraient fabriquer le même code
--      pour deux têtes, et « ce code appartient à une autre cliente »
--      deviendrait incompréhensible.
--
--   ② UN CODE CONSOMMÉ NE SE ROUVRE PAS. Un déclencheur restaure `utiliseLe`,
--      `utilisePar`, `surPiece` et `remiseReelleXof` dès qu'ils sont posés :
--      la première caisse qui l'honore le ferme, et aucune écriture ultérieure
--      ne peut le rendre neuf. La garde de l'écran (`honoreLeCode`) est
--      idempotente ; celle-ci l'est aussi, et elle ne se contourne pas.
--
--   ③ L'AVANTAGE NE SE RÉÉCRIT PAS APRÈS COUP. Le même déclencheur gèle
--      `code`, `clientId`, `remisePct`, `remiseXof`, `serviceId`, `creeLe` et
--      `expireLe`. Un code envoyé à une cliente est une PROMESSE : la changer
--      après l'envoi ferait mentir le message qu'elle a reçu, et la Maison ne
--      saurait plus ce qu'elle a promis.
--
-- QUI PEUT QUOI (décision du 14 septembre) :
--   · CRÉER : la direction seule. Une remise est de l'argent qui sort.
--   · LIRE  : tout le personnel (pour l'honorer au comptoir), et LA CLIENTE
--             qui le porte — c'est ainsi que Ma Couronne lui montre sa
--             promotion à la réservation.
--   · HONORER (update) : tout le personnel, sous la garde du déclencheur.
--   · EFFACER : la direction seule.
--
-- `est_direction()` vient de 0089, `is_staff()` de 0003 — toutes deux passées.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.codes_promo (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.codes_promo enable row level security;

-- `unaccent` est une extension qui n'est pas toujours installée, et l'exiger
-- ferait échouer la migration sur un projet neuf. On se contente des lettres
-- que la Maison écrit vraiment dans un code : les voyelles accentuées du
-- français. Un code ne porte jamais de ɔ ni de ɖ — il doit se taper au
-- comptoir sur n'importe quel clavier.
--
-- ELLE SE DÉCLARE AVANT CELLE QUI L'APPELLE : PostgreSQL valide le corps
-- d'une fonction SQL à sa création, et l'ordre inverse échouerait sur
-- « function does not exist ».
create or replace function public.unaccent_immuable(brut text) returns text
language sql immutable as $$
  select translate(coalesce(brut, ''),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY');
$$;

-- ① LA FORME NORMALISÉE — le même juge qu'à l'écran (`normaliseLeCode`) :
--    capitales, sans accent, sans ponctuation. « eclat15-a7k » et
--    « ÉCLAT15 A7K » désignent le même code, et ne peuvent donc pas coexister.
create or replace function public.code_promo_normalise(brut text) returns text
language sql immutable as $$
  select regexp_replace(upper(public.unaccent_immuable(coalesce(brut, ''))), '[^A-Z0-9]', '', 'g');
$$;

create unique index if not exists codes_promo_code_unique
  on public.codes_promo (public.code_promo_normalise(data->>'code'));

create index if not exists codes_promo_client_idx on public.codes_promo ((data->>'clientId'));

drop policy if exists promo_lu       on public.codes_promo;
drop policy if exists promo_cree     on public.codes_promo;
drop policy if exists promo_modifie  on public.codes_promo;
drop policy if exists promo_efface   on public.codes_promo;

-- LA CLIENTE VOIT LE SIEN. Sans cela, Ma Couronne ne pourrait pas lui
-- montrer sa promotion à la réservation, et le code n'existerait que pour
-- le comptoir — ce qui en ferait une remise, pas une promotion.
create policy promo_lu on public.codes_promo for select to authenticated
  using (public.is_staff() or data->>'clientId' = (auth.uid())::text);

-- UNE REMISE EST DE L'ARGENT QUI SORT : la direction seule en crée.
create policy promo_cree on public.codes_promo for insert to authenticated
  with check (public.est_direction());

-- TOUT LE PERSONNEL PEUT L'HONORER, mais le déclencheur ci-dessous décide
-- ce qui, dans cette écriture, est réellement permis.
create policy promo_modifie on public.codes_promo for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy promo_efface on public.codes_promo for delete to authenticated
  using (public.est_direction());

-- ②③ CE QUI EST PROMIS RESTE PROMIS, CE QUI EST CONSOMMÉ RESTE CONSOMMÉ.
--
-- Le déclencheur RESTAURE plutôt qu'il ne refuse — même choix qu'en 0091
-- pour la grille de paie. Un refus ferait échouer toute la synchronisation
-- de la ligne (le front repousse l'objet entier) et laisserait l'écran en
-- rouge sans que personne comprenne ; une restauration silencieuse laisse
-- passer ce qui est légitime et annule le reste.
create or replace function public.code_promo_tient_sa_promesse() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fige text;
begin
  -- L'avantage, la tête et les bornes : gelés à la fabrication.
  foreach fige in array array['code', 'clientId', 'remisePct', 'remiseXof',
                              'serviceId', 'creeLe', 'expireLe'] loop
    if (old.data ? fige) then
      new.data := jsonb_set(new.data, array[fige], old.data -> fige, true);
    else
      new.data := new.data - fige;
    end if;
  end loop;

  -- LA PREMIÈRE CAISSE QUI L'HONORE LE FERME. Deux caisses qui cliquent
  -- ensemble ne remisent pas deux fois : la seconde écriture retrouve les
  -- valeurs de la première.
  if (old.data ? 'utiliseLe') and nullif(old.data->>'utiliseLe', '') is not null then
    foreach fige in array array['utiliseLe', 'utilisePar', 'surPiece', 'remiseReelleXof'] loop
      if (old.data ? fige) then
        new.data := jsonb_set(new.data, array[fige], old.data -> fige, true);
      else
        new.data := new.data - fige;
      end if;
    end loop;
  end if;

  -- La branche ne se déplace pas non plus : un code de Suru-Léré ne
  -- s'honore pas ailleurs.
  new.branch_id := old.branch_id;
  return new;
end;
$$;

drop trigger if exists codes_promo_promesse on public.codes_promo;

create trigger codes_promo_promesse before update on public.codes_promo
  for each row execute function public.code_promo_tient_sa_promesse();

drop trigger if exists codes_promo_touch on public.codes_promo;

create trigger codes_promo_touch before update on public.codes_promo
  for each row execute function public.touch_updated_at();

-- LE DIRECT (leçon de 0087) : un code honoré à la caisse doit disparaître
-- de l'écran du comptoir voisin dans la seconde, sinon deux caisses le
-- proposeront à la même cliente.
do $$
begin
  alter publication supabase_realtime add table public.codes_promo;
exception when duplicate_object then null;
end $$;

-- LA TRACE (0092) : un code de promotion est de l'argent. Qui l'a fabriqué,
-- qui l'a honoré, et sur quelle pièce — la base le signe, pas l'application.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'trace_le_geste') then
    execute 'drop trigger if exists trace_le_geste on public.codes_promo';
    execute 'create trigger trace_le_geste after insert or update or delete '
         || 'on public.codes_promo for each row execute function public.trace_le_geste()';
  end if;
end $$;

-- ── CONTRÔLE ───────────────────────────────────────────────────────
-- La table existe, zéro ligne, et ses trois gardes sont en place.
select 'codes_promo' as table_creee, count(*) as lignes from public.codes_promo;

select tgname as declencheur
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relname = 'codes_promo'
order by tgname;

select policyname as politique, cmd as commande
from pg_policies
where schemaname = 'public' and tablename = 'codes_promo'
order by policyname;
