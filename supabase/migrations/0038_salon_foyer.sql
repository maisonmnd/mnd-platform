-- ═══════════════════════════════════════════════════════════════════
-- 0038 — SALON & FOYER : la séparation entreprise / foyer
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Le numéro 0037 est laissé LIBRE : il est réservé au réarmement corrigé du
-- déclencheur `clients_protege_tarif` (voir REPRENDRE, saga du 10 août).
--
-- Six tables au patron de la maison (id · branch_id · data · updated_at),
-- TOUTES réservées au SOUVERAIN (`is_souverain()`, posée par apply_auth /
-- 0003) : les retraits du foyer, la dette des associés et les caisses
-- indépendantes sont l'affaire du couple — même verrou que la paie.
-- Pour un gérant ou un maître, la lecture rend zéro ligne en silence :
-- la pastille de synchro reste verte, les écrans restent vides.
--
--   partage_config      — la règle des 4 enveloppes (une ligne par branche)
--   prelevements        — l'annexe du foyer (retraits perso)
--   prets_associes      — dépassements convertis en prêts + remboursements
--   reserves_mouvements — dotations / retraits des deux enveloppes d'épargne
--   caisse_succession   — registre autonome, HORS de tout total MND
--   caisse_devises      — registre autonome multi-devises, HORS totaux
--
-- Les deux caisses sont des mondes ÉTANCHES : aucun autre écran ne lit ces
-- tables — l'isolation est structurelle, pas un filtre d'affichage.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array[
    'partage_config', 'prelevements', 'prets_associes',
    'reserves_mouvements', 'caisse_succession', 'caisse_devises'
  ] loop
    execute format('
      create table if not exists public.%I (
        id         text primary key,
        branch_id  text,
        data       jsonb not null,
        updated_at timestamptz not null default now()
      )', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists souverain_all on public.%I', t);
    execute format('
      create policy souverain_all on public.%I for all to authenticated
        using (public.is_souverain()) with check (public.is_souverain())', t);
    -- Realtime — la leçon de 0034 : une table hors publication rend
    -- l'inter-postes muet. Idempotent.
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

-- Contrôle : les six tables existent, zéro ligne — les registres naîtront
-- des saisies du souverain.
select t.nom as table_creee,
       case t.nom
         when 'partage_config'      then (select count(*) from public.partage_config)
         when 'prelevements'        then (select count(*) from public.prelevements)
         when 'prets_associes'      then (select count(*) from public.prets_associes)
         when 'reserves_mouvements' then (select count(*) from public.reserves_mouvements)
         when 'caisse_succession'   then (select count(*) from public.caisse_succession)
         when 'caisse_devises'      then (select count(*) from public.caisse_devises)
       end as lignes
from (values ('partage_config'), ('prelevements'), ('prets_associes'),
             ('reserves_mouvements'), ('caisse_succession'), ('caisse_devises')) as t(nom);
