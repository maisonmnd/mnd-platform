-- ═══════════════════════════════════════════════════════════════════
-- 0047 — LA FAMILLE SE LIT PAR LES SIENS.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- LE DERNIER MUR (14 août, compte de Valerie) : la table `families` n'a
-- toujours eu QU'UNE politique — `staff_all`. Le Trône voyait donc le compte
-- famille au complet pendant que Ma Couronne, côté cliente, recevait ZÉRO
-- ligne : le sélecteur de tête cherche la famille de la fiche, ne la trouve
-- jamais, et n'affiche aucun enfant — alors même que les enfants, eux, sont
-- lisibles (cli_sel passe par `est_ma_tete`). Les données étaient bonnes,
-- la porte de lecture n'existait pas.
--
-- Une cliente lit désormais LA famille qui est la sienne : celle que sa
-- fiche pointe, ou celle dont elle est la payeuse. En LECTURE seulement —
-- l'écriture des familles reste à la maison (staff_all) et à la fonction
-- serveur du rattachement (0046).
-- ═══════════════════════════════════════════════════════════════════

-- ── ① LE JUGE — cette famille est-elle la mienne ? ──────────────────
-- Security definer : il lit clients/families sans que la RLS de la
-- session ne l'aveugle — même bâtisse que `est_ma_tete`.
create or replace function public.est_ma_famille(fam text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients moi
    where (moi.id = (auth.uid())::text
           or moi.data->>'authUserId' = (auth.uid())::text)
      and (
        moi.data->>'familyId' = fam
        or exists (
          select 1 from public.families f
          where f.id = fam
            and f.data->>'payerClientId' = moi.id
        )
      )
  );
$$;

revoke all on function public.est_ma_famille(text) from public;
grant execute on function public.est_ma_famille(text) to authenticated;

-- ── ② LA PORTE DE LECTURE ───────────────────────────────────────────
drop policy if exists fam_sel on public.families;
create policy fam_sel on public.families for select to authenticated
  using (public.is_staff() or public.est_ma_famille(id));

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
select polname as politique, polcmd as commande
  from pg_policy
 where polrelid = 'public.families'::regclass
 order by 1;
