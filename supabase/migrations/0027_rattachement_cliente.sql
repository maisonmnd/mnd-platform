-- ═══════════════════════════════════════════════════════════════════
-- 0027 — Une cliente inscrite au Trône reprend SON dossier
--        (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- ── CE QUI BLOQUE AUJOURD'HUI ────────────────────────────────────
-- La RLS de la migration 0006 suppose une chose : la fiche d'une cliente
-- PORTE l'identifiant de son compte (`clients.id = auth.uid()`), et ses
-- rendez-vous, factures et séances portent le même dans `clientId`.
--
-- C'est vrai d'une cliente née en ligne, et d'elle seule. Les 185 fiches de
-- la Maison portent un identifiant maison, posé bien avant que ces femmes
-- n'aient un compte. Une cliente qui s'inscrit ne peut donc RIEN lire de son
-- histoire — la base la lui refuse, et l'écran ne montre qu'un dossier vide.
--
-- ── CE QUE CE SCRIPT FAIT ────────────────────────────────────────
-- La fiche garde son identifiant ; c'est le COMPTE qui vient s'y rattacher,
-- inscrit dans `data->>'authUserId'`. Les politiques suivent ce lien.
--
--   · `mon_dossier()` rend la fiche rattachée au compte connecté ;
--   · `clients` s'ouvre à sa propre fiche, par l'identifiant OU par le lien ;
--   · `appointments`, `invoices`, `client_sessions` de même.
--
-- Rien n'est re-clefé, aucun rendez-vous déplacé, aucune facture réécrite.
--
-- ── DEUX CHEMINS POUR SE RATTACHER ───────────────────────────────
-- 93 % des fiches portent un numéro, 22 % une adresse : c'est le TÉLÉPHONE
-- qui reconnaît une cliente ici.
--
--   ① `demander_rattachement(tel)` — elle saisit son numéro, la demande
--      s'inscrit sur la fiche, et la Maison confirme depuis Le Trône. Un
--      numéro se devine ; ce chemin ne donne donc jamais l'accès tout seul.
--   ② `rattacher_par_code(code)` — la Maison lui remet un code au fauteuil,
--      elle le saisit, le lien se fait immédiatement. Un code ne se devine
--      pas, et le geste se fait quand on la voit de toute façon.
--
-- Les deux passent par des fonctions SECURITY DEFINER : une cliente ne peut
-- pas écrire sur une fiche qui n'est pas encore la sienne, et c'est bien
-- ainsi. Sans elles, il faudrait lui ouvrir la table entière.
--
-- ── CE QUE CE SCRIPT N'EMPÊCHE PAS ───────────────────────────────
-- Demander un rattachement révèle qu'un numéro est celui d'une cliente de
-- la Maison. C'est le prix d'un message utile — « nous avons trouvé votre
-- dossier » — et il est mesuré : sans confirmation, la demande n'ouvre rien.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) LE DOSSIER DU COMPTE CONNECTÉ ─────────────────────────────
-- SECURITY DEFINER : la fonction lit `clients` en passant outre la RLS.
-- Sans cela, une politique sur `clients` qui appelle une lecture de
-- `clients` tournerait en rond.
create or replace function public.mon_dossier()
returns text
language sql stable security definer set search_path = public as $$
  select c.id
  from public.clients c
  where c.data ->> 'authUserId' = (auth.uid())::text
  limit 1;
$$;
grant execute on function public.mon_dossier() to authenticated;

-- ── 2) LES POLITIQUES SUIVENT LE LIEN ────────────────────────────
drop policy if exists cli_sel on public.clients;
drop policy if exists cli_ins on public.clients;
drop policy if exists cli_upd on public.clients;
create policy cli_sel on public.clients for select to authenticated
  using (public.is_staff() or id = (auth.uid())::text or id = public.mon_dossier());
create policy cli_ins on public.clients for insert to authenticated
  with check (public.is_staff() or id = (auth.uid())::text);
create policy cli_upd on public.clients for update to authenticated
  using (public.is_staff() or id = (auth.uid())::text or id = public.mon_dossier())
  with check (public.is_staff() or id = (auth.uid())::text or id = public.mon_dossier());

do $$
declare t text;
begin
  foreach t in array array['appointments', 'invoices', 'client_sessions'] loop
    execute format('drop policy if exists own_sel on public.%I;', t);
    execute format('drop policy if exists own_ins on public.%I;', t);
    execute format('drop policy if exists own_upd on public.%I;', t);
    execute format($p$create policy own_sel on public.%I for select to authenticated
      using (public.is_staff()
             or data->>'clientId' = (auth.uid())::text
             or data->>'clientId' = public.mon_dossier());$p$, t);
    execute format($p$create policy own_ins on public.%I for insert to authenticated
      with check (public.is_staff()
             or data->>'clientId' = (auth.uid())::text
             or data->>'clientId' = public.mon_dossier());$p$, t);
    execute format($p$create policy own_upd on public.%I for update to authenticated
      using (public.is_staff()
             or data->>'clientId' = (auth.uid())::text
             or data->>'clientId' = public.mon_dossier())
      with check (public.is_staff()
             or data->>'clientId' = (auth.uid())::text
             or data->>'clientId' = public.mon_dossier());$p$, t);
  end loop;
end $$;

-- ── 3) LE NUMÉRO, COMPARABLE ─────────────────────────────────────
-- « +229 97 00 00 00 », « 97000000 », « 0097 97 00 00 00 » sont le même
-- numéro. On ne garde que les chiffres, et on compare les HUIT derniers :
-- l'indicatif pays n'est pas toujours noté, la ligne l'est toujours.
create or replace function public.tel_comparable(t text)
returns text
language sql immutable set search_path = public as $$
  select right(regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g'), 8);
$$;

-- ── 4) DEMANDER LE RATTACHEMENT ──────────────────────────────────
-- Inscrit la demande sur la fiche trouvée. N'ouvre RIEN : c'est la Maison
-- qui confirme depuis Le Trône. Une fiche déjà rattachée n'est jamais
-- proposée — un compte ne se reprend pas.
create or replace function public.demander_rattachement(tel text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare cible text;
begin
  if auth.uid() is null or length(public.tel_comparable(tel)) < 8 then
    return false;
  end if;
  select c.id into cible
  from public.clients c
  where public.tel_comparable(c.data ->> 'phone') = public.tel_comparable(tel)
    and coalesce(c.data ->> 'authUserId', '') = ''
    and coalesce((c.data ->> 'archived')::boolean, false) = false
  limit 1;
  if cible is null then
    return false;
  end if;
  update public.clients
  set data = jsonb_set(data, '{rattachementDemande}', jsonb_build_object(
        'authUserId', (auth.uid())::text,
        'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSZ')))
  where id = cible;
  return true;
end;
$$;
grant execute on function public.demander_rattachement(text) to authenticated;

-- ── 5) SE RATTACHER PAR CODE ─────────────────────────────────────
-- Le code est posé par la Maison sur la fiche, au fauteuil. Il ne se devine
-- pas : le lien se fait donc SANS confirmation, et le code est consommé.
create or replace function public.rattacher_par_code(code text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare cible text;
begin
  if auth.uid() is null or length(coalesce(code, '')) < 4 then
    return false;
  end if;
  select c.id into cible
  from public.clients c
  where c.data -> 'rattachementCode' ->> 'code' = upper(trim(code))
    and coalesce(c.data -> 'rattachementCode' ->> 'expire', '9999') >= to_char(now(), 'YYYY-MM-DD')
    and coalesce(c.data ->> 'authUserId', '') = ''
    and coalesce((c.data ->> 'archived')::boolean, false) = false
  limit 1;
  if cible is null then
    return false;
  end if;
  update public.clients
  set data = (jsonb_set(data, '{authUserId}', to_jsonb((auth.uid())::text))
              - 'rattachementCode') - 'rattachementDemande'
  where id = cible;
  return true;
end;
$$;
grant execute on function public.rattacher_par_code(text) to authenticated;


-- ── CONTRÔLES ────────────────────────────────────────────────────
-- A. Les politiques citent bien mon_dossier().
select c.relname as table_name, p.polname as policy,
       pg_get_expr(p.polqual, p.polrelid) like '%mon_dossier%' as suit_le_lien
from pg_class c
join pg_policy p on p.polrelid = c.oid
where c.relname in ('clients', 'appointments', 'invoices', 'client_sessions')
  and p.polname in ('cli_sel', 'cli_upd', 'own_sel', 'own_upd')
order by 1, 2;

-- B. Les trois fonctions existent.
select proname as fonction
from pg_proc
where proname in ('mon_dossier', 'demander_rattachement', 'rattacher_par_code', 'tel_comparable')
order by 1;

-- C. Combien de fiches sont rattachables par leur numéro, et combien de
--    numéros sont EN DOUBLE — un doublon rendrait le rattachement ambigu
--    et la première fiche trouvée gagnerait, ce qui n'est pas une règle.
select count(*)                                                        as fiches_avec_tel,
       count(*) - count(distinct public.tel_comparable(data ->> 'phone')) as numeros_en_double
from public.clients
where coalesce(data ->> 'phone', '') <> ''
  and coalesce((data ->> 'archived')::boolean, false) = false;
