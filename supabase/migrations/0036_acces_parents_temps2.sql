-- ═══════════════════════════════════════════════════════════════════
-- 0036 — L'ACCÈS DES PARENTS : le TEMPS 2 de 0028, enfin prêt.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Ma Couronne porte désormais le sélecteur de tête (réserver POUR un enfant)
-- et la liste des rendez-vous du foyer : le code est prêt, la lecture peut
-- s'ouvrir. C'est le bloc commenté de `0028_comptes_enfants.sql`, mot pour
-- mot — sorti dans sa propre migration pour être collé sans découpage.
--
-- ⚠ À PASSER AVANT de réserver pour un enfant depuis Ma Couronne : sans ces
--   politiques, l'écriture du rendez-vous d'un enfant est REFUSÉE par la RLS.
--
-- ── TROIS PRÉCAUTIONS, ÉCRITES DANS LA FONCTION ───────────────────
--  ① Elle interroge `clients`, qui est elle-même sous cette règle : sans
--    `security definer`, elle s'appellerait sans fin. Le chemin de recherche
--    est fixé pour qu'on ne puisse pas lui glisser une autre table.
--  ② Elle n'ouvre qu'aux MINEURS. À dix-huit ans, l'enfant sort du champ de
--    son parent : ses données lui appartiennent, et c'est la base qui le dit,
--    pas seulement l'écran.
--  ③ Sans date de naissance, elle refuse. La minorité ouvre l'accès aux
--    données de quelqu'un — elle ne se présume pas. La règle échoue fermée.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.est_ma_tete(cible text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- moi-même, toujours
    cible = (auth.uid())::text
    -- ou un mineur de la famille dont je suis le parent payeur
    or exists (
      select 1
      from public.clients enfant
      join public.families f
        on f.id = enfant.data->>'familyId'
      where enfant.id = cible
        and f.data->>'payerClientId' = (auth.uid())::text
        -- `nullif` AVANT le cast : une date vide ('') ferait echouer la
        -- conversion, et une erreur DANS UNE POLITIQUE bloque la lecture de
        -- toute la table — pour tout le monde, d'un coup.
        and nullif(enfant.data->>'birthday', '') is not null
        and (nullif(enfant.data->>'birthday', ''))::date > (current_date - interval '18 years')
        and coalesce((enfant.data->>'archived')::boolean, false) = false
    );
$$;

revoke all on function public.est_ma_tete(text) from public;
grant execute on function public.est_ma_tete(text) to authenticated;

-- La fiche : le parent LIT les têtes qu'il porte. Il n'écrit toujours que la
-- sienne — corriger la fiche d'un enfant reste un geste du comptoir.
drop policy if exists cli_sel on public.clients;
create policy cli_sel on public.clients for select to authenticated
  using (public.is_staff() or public.est_ma_tete(id));

-- Les documents de la cliente : il lit ceux de ses têtes, et peut RÉSERVER
-- pour elles — c'est tout l'objet.
do $$
declare t text;
begin
  foreach t in array array['appointments', 'invoices', 'client_sessions'] loop
    execute format('drop policy if exists own_sel on public.%I;', t);
    execute format('drop policy if exists own_ins on public.%I;', t);
    execute format('drop policy if exists own_upd on public.%I;', t);
    execute format('drop policy if exists own_del on public.%I;', t);
    execute format($p$create policy own_sel on public.%I for select to authenticated
      using (public.is_staff() or public.est_ma_tete(data->>'clientId'));$p$, t);
    execute format($p$create policy own_ins on public.%I for insert to authenticated
      with check (public.is_staff() or public.est_ma_tete(data->>'clientId'));$p$, t);
    execute format($p$create policy own_upd on public.%I for update to authenticated
      using (public.is_staff() or public.est_ma_tete(data->>'clientId'))
      with check (public.is_staff() or public.est_ma_tete(data->>'clientId'));$p$, t);
    execute format($p$create policy own_del on public.%I for delete to authenticated
      using (public.is_staff() or public.est_ma_tete(data->>'clientId'));$p$, t);
  end loop;
end $$;

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
-- Qui voit quoi, maintenant que le temps 2 est passé. Une tête « INVISIBLE —
-- pas de date de naissance » se répare au CRM (fiche → anniversaire) : la
-- minorité se prouve, elle ne se présume pas.

select p.data->>'name'                          as parent,
       f.name                                   as compte,
       e.data->>'name'                           as tete_portee,
       nullif(e.data->>'birthday', '')            as naissance,
       case
         when nullif(e.data->>'birthday', '') is null then 'INVISIBLE — pas de date de naissance'
         when (nullif(e.data->>'birthday', ''))::date <= (current_date - interval '18 years') then 'INVISIBLE — majeur'
         else 'visible par le parent'
       end                                       as verdict
  from public.clients p
  join (select id, data->>'name' as name, data->>'payerClientId' as payeur
          from public.families) f
    on f.payeur = p.id
  join public.clients e
    on e.data->>'familyId' = f.id
   and e.id <> p.id
 order by 1, 4;
