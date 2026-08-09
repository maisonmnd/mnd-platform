-- ═══════════════════════════════════════════════════════════════════
-- 0028 — LES COMPTES ENFANTS
--        (à coller dans Supabase → SQL Editor). EN DEUX TEMPS.
--
-- Les enfants ont besoin de rendez-vous à leur nom : une couronne de neuf ans
-- n'est pas celle de sa mère, et son suivi non plus. Mais un mineur n'a ni
-- compte, ni e-mail, ni téléphone — c'est le parent qui agit pour lui.
--
-- ── CE QUE CE FICHIER FAIT, ET DANS QUEL ORDRE ────────────────────
--   TEMPS 1 : la table des déclarations. À passer MAINTENANT — Le Trône ne
--             peut pas se synchroniser sans elle.
--   TEMPS 2 : l'accès du parent aux têtes qu'il porte. À passer quand Ma
--             Couronne sera prête, PAS AVANT : elle ouvre une lecture, et une
--             lecture ouverte trop tôt ne se referme pas d'elle-même.
--
-- Le contrôle du bas est en LECTURE SEULE : il dit qui verrait quoi, sans rien
-- écrire. À lire avant le temps 2.
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════ TEMPS 1 ═══════════════════════════════
-- La file des déclarations. Le parent y dépose un prénom et une date de
-- naissance — RIEN QUI DÉSIGNE UNE FICHE EXISTANTE. C'est tout l'objet : s'il
-- pouvait écrire dans `clients`, il lui suffirait de rattacher à sa famille la
-- fiche d'une autre pour la lire entière.

create table if not exists public.enfants_declares (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.enfants_declares enable row level security;

drop policy if exists dev_all  on public.enfants_declares;
drop policy if exists own_sel  on public.enfants_declares;
drop policy if exists own_ins  on public.enfants_declares;
drop policy if exists own_upd  on public.enfants_declares;
drop policy if exists own_del  on public.enfants_declares;

-- Exactement le patron des rendez-vous : la ligne porte l'identifiant du
-- parent, il voit les siennes, le personnel voit tout.
create policy own_sel on public.enfants_declares for select to authenticated
  using (public.is_staff() or data->>'clientId' = (auth.uid())::text);
create policy own_ins on public.enfants_declares for insert to authenticated
  with check (public.is_staff() or data->>'clientId' = (auth.uid())::text);
-- LA MISE À JOUR EST RÉSERVÉE AU PERSONNEL : accepter ou refuser est un geste
-- de la Maison. Un parent qui pourrait écrire « accepté » sur sa propre demande
-- se donnerait à lui-même l'accès qu'elle est censée lui accorder.
create policy own_upd on public.enfants_declares for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy own_del on public.enfants_declares for delete to authenticated
  using (public.is_staff() or data->>'clientId' = (auth.uid())::text);

create index if not exists enfants_declares_parent_idx
  on public.enfants_declares ((data->>'clientId'));

-- Contrôle du temps 1 :
select 'enfants_declares' as table_creee,
       (select count(*) from public.enfants_declares) as lignes;


-- ═══════════════════════════ TEMPS 2 ═══════════════════════════════
-- L'ACCÈS DU PARENT. À NE PASSER QUE QUAND MA COURONNE EST PRÊTE.
--
-- Aujourd'hui la base dit : une cliente ne voit que sa fiche, et que ses
-- documents. Un parent ne peut donc lire ni la fiche de son enfant, ni son
-- carnet — l'écran n'aurait rien à afficher.
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

/*  ─── DÉCOMMENTER POUR PASSER LE TEMPS 2 ───

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
        and enfant.data->>'birthday' is not null
        and (enfant.data->>'birthday')::date > (current_date - interval '18 years')
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

    ─── FIN DU TEMPS 2 ─── */


-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
-- Qui verrait quoi, si le temps 2 était passé. À lire AVANT de le passer :
-- une ligne inattendue ici est une porte qu'on s'apprêtait à ouvrir.

select p.data->>'name'                          as parent,
       f.name                                   as compte,
       e.data->>'name'                           as tete_portee,
       e.data->>'birthday'                       as naissance,
       date_part('year', age((e.data->>'birthday')::date))::int as age,
       case
         when e.data->>'birthday' is null then 'INVISIBLE — pas de date de naissance'
         when (e.data->>'birthday')::date <= (current_date - interval '18 years') then 'INVISIBLE — majeur'
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
