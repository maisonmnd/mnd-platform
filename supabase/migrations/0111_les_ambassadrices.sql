-- ═══════════════════════════════════════════════════════════════════
-- 0111 — LES AMBASSADRICES (à coller dans Supabase → SQL Editor).
--        28 septembre 2026, maquette « Les ambassadrices » validée.
--        UN SEUL TEMPS. Elle contient 0110 : si 0110 n'a pas été passée,
--        celle-ci suffit.
--
-- ① La garde des champs du parrainage sur la fiche, élargie : le code de
--   celle qui l'a fait venir (`parraineePar`, `parraineeLe`) ne s'écrit
--   qu'au Trône, comme son code, son résumé et ses récompenses. Restent à
--   la cliente : `carteModele` (sa couleur) et `choixRecompenses` (son
--   choix entre un soin et une remise, parmi ce que la Maison lui a posé).
--   Même règle qu'en 0110 : `auth.uid()` vide = confiance (leçon du 10 août).
--
-- ② Le classement du mois (`mnd_classement_ambassade`) : lisible par les
--   clientes CONNECTÉES seulement, jamais par le site public. Une politique
--   à part : la liste de `docs_pub_read` (0108) n'est pas touchée.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.clients_protege_parrainage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if public.is_staff() then return new; end if;

  if tg_op = 'INSERT' then
    new.data := new.data - 'codeParrain' - 'parrainage' - 'soinsOfferts' - 'parraineePar' - 'parraineeLe';
    return new;
  end if;

  new.data := (new.data - 'codeParrain' - 'parrainage' - 'soinsOfferts' - 'parraineePar' - 'parraineeLe')
              || jsonb_strip_nulls(jsonb_build_object(
                   'codeParrain', old.data -> 'codeParrain',
                   'parrainage', old.data -> 'parrainage',
                   'soinsOfferts', old.data -> 'soinsOfferts',
                   'parraineePar', old.data -> 'parraineePar',
                   'parraineeLe', old.data -> 'parraineeLe'));
  return new;
end $$;

drop trigger if exists clients_protege_parrainage on public.clients;
create trigger clients_protege_parrainage
  before insert or update on public.clients
  for each row execute function public.clients_protege_parrainage();

drop policy if exists docs_ambassade_read on public.documents;
create policy docs_ambassade_read on public.documents for select to authenticated
  using (key = 'mnd_classement_ambassade');

-- Le contrôle, en lignes de résultat :
select 'declencheur' as quoi, tgname as nom from pg_trigger
where tgrelid = 'public.clients'::regclass and tgname = 'clients_protege_parrainage'
union all
select 'politique', polname from pg_policy
where polrelid = 'public.documents'::regclass and polname = 'docs_ambassade_read';
