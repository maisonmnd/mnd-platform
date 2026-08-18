-- ═══════════════════════════════════════════════════════════════════
-- 0058 — LE FIL, le registre interne de la Maison
--        (à coller tel quel. RIEN À DÉCOMMENTER.)
--
-- Maquette `public/maquette-le-fil.html`, relue et validée par Yéman le
-- 18 août 2026. Un fil interne : se parler, prendre des notes, et DEMANDER
-- qu'une chose soit faite — une demande qui porte une facture s'éteignant
-- quand la facture est soldée.
--
-- ── CE QUE LA TABLE PORTE ────────────────────────────────────────
-- La forme des tables synchronisées de la Maison, sans exception :
-- `id` / `branch_id` / `data` / `updated_at`. Tout le reste vit dans `data`
-- (voir `src/shared/fil.ts`) — c'est ce qui permet d'ajouter un champ sans
-- migration, et c'est déjà ainsi pour les rendez-vous et les factures.
--
-- ── QUI PEUT LIRE ────────────────────────────────────────────────
-- LE PERSONNEL, ET PERSONNE D'AUTRE. Aucune cliente ne voit ce fil : ni par
-- Ma Couronne, ni par la clé publique. C'est la frontière que le serveur tient.
--
-- LA LIMITE, ET IL FAUT LA CONNAÎTRE : la règle « un fil qui parle d'argent
-- n'est pas montré à qui ne lit pas les montants » est tenue par l'ÉCRAN, pas
-- par le serveur — exactement comme les prix aujourd'hui (`sansPrix`). Un
-- maître ne verra pas ces messages dans Le Trône ; une session du personnel
-- qui interrogerait la base directement, si. Durcir cela demanderait de savoir
-- côté serveur qui a le droit aux montants, ce que la Maison décide
-- aujourd'hui dans ses réglages, pas dans la base. À faire le jour où les
-- droits d'écran descendront au serveur — pas avant, et pas à moitié.
-- ═══════════════════════════════════════════════════════════════════

begin;

create table if not exists public.fil_messages (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists fil_messages_branch_idx on public.fil_messages (branch_id);

/* Le fil se lit du plus ancien au plus récent, et une Maison bavarde en écrit
   beaucoup : l'horodatage vit dans `data`, on l'indexe là où il est. */
create index if not exists fil_messages_at_idx on public.fil_messages ((data ->> 'at'));

-- L'horodatage automatique, comme partout ailleurs.
drop trigger if exists fil_messages_touch on public.fil_messages;
create trigger fil_messages_touch
  before update on public.fil_messages
  for each row execute function public.touch_updated_at();

-- ── LES DROITS ───────────────────────────────────────────────────
alter table public.fil_messages enable row level security;
drop policy if exists fil_staff on public.fil_messages;
create policy fil_staff on public.fil_messages for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ── LE TEMPS RÉEL ────────────────────────────────────────────────
-- Sans cette ligne, un message n'arriverait qu'au rechargement — et un fil
-- qu'il faut rafraîchir n'est pas un fil.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fil_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.fil_messages';
  end if;
end $$;

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lancer juste après.
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from pg_tables
    where schemaname = 'public' and tablename = 'fil_messages')                      as table_creee,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'fil_messages')                      as politiques,
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'fil_messages')                                                as en_temps_reel,
  (select count(*) from pg_indexes
    where schemaname = 'public' and tablename = 'fil_messages')                       as index_poses;
--  Attendu : 1 · 1 · 1 · 3 (la clé primaire, la branche, l'horodatage).


-- ═══════════════════════════════════════════════════════════════════
-- CE QUI S'OUBLIE — la purge des douze mois.
--
-- Décision de Yéman, 18 août : « les messages s'effacent au bout de douze
-- mois, les demandes et les notes de cliente restent ». Ce qui engage se
-- garde, ce qui bavarde s'oublie.
--
-- ELLE NE TOURNE PAS TOUTE SEULE, ET C'EST VOULU : un effacement automatique
-- posé le jour de la création est un effacement dont personne ne se souvient
-- le jour où il emporte quelque chose. On la lance à la main, une fois par an,
-- après avoir lu ce qu'elle emporterait.
--
-- ① CE QU'ELLE EMPORTERAIT — ne supprime rien.
select count(*) as messages_a_oublier,
       min(data ->> 'at') as le_plus_ancien
from public.fil_messages
where (data ->> 'demandePour') is null
  and (data ->> 'at') < to_char(now() - interval '12 months', 'YYYY-MM-DD');

-- ② LA PURGE elle-même — à décommenter le jour où l'on décide.
-- delete from public.fil_messages
-- where (data ->> 'demandePour') is null
--   and (data ->> 'at') < to_char(now() - interval '12 months', 'YYYY-MM-DD');
