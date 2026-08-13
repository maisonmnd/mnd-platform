-- ═══════════════════════════════════════════════════════════════════
-- 0043 — LE JOURNAL DES ENVOIS (rappels & messages sortants)
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Les « automatisations » de Marketing étaient un registre sans émetteur :
-- des interrupteurs, des compteurs, et rien qui parte. Cette table est la
-- colonne vertébrale des trois canaux :
--
--   — PUSH : la fonction planifiée `rappels-j1` compose les rappels de la
--     veille et les envoie via `push-notify` (gratuit, déjà déployé) ;
--   — WHATSAPP : la même fonction enverra par l'API Meta dès que les
--     secrets seront posés (voir docs/BRANCHER-ENVOIS.md) ; en attendant,
--     la « tournée du matin » du Trône marque ici les envois faits main ;
--   — SMS : même logique, autre fournisseur, mêmes lignes de journal.
--
-- Chaque ligne = UN message à UNE personne par UN canal, avec son verdict.
-- L'idempotence vit ici : la fonction ne rappelle jamais deux fois le même
-- rendez-vous sur le même canal, quel que soit le nombre de réveils du cron.
--
-- ⚠ À PASSER AVANT LA PROCHAINE PUBLICATION : Le Trône se lie à cette
--   table — sans elle, la pastille de synchro vire au rouge.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.envois (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.envois enable row level security;

drop policy if exists staff_all on public.envois;

-- PERSONNEL SEULEMENT, lecture comprise : une ligne d'envoi porte le
-- téléphone et le prénom d'une cliente — jamais lisible par les autres.
create policy staff_all on public.envois for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- La fonction planifiée écrit avec la clé service (service_role) : elle
-- passe au-dessus de la RLS, aucune politique à ajouter pour elle.

create index if not exists envois_appt_idx  on public.envois ((data->>'apptId'));
create index if not exists envois_jour_idx  on public.envois ((data->>'dateRdv'));

-- Realtime — la leçon de 0034 : une table hors publication rend
-- l'inter-postes muet. Idempotent.
do $$
begin
  alter publication supabase_realtime add table public.envois;
exception
  when duplicate_object then null;
end $$;

-- Contrôle : la table existe, zéro ligne — le journal naîtra des rappels.
select 'envois' as table_creee, count(*) as lignes from public.envois;
