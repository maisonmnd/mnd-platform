-- ══ 0128 · LA CLÉ DU NUMÉRO — 13 octobre 2026 ═══════════════════════════
--
-- Le premier essai de la réservation WhatsApp est resté sans réponse. Meta
-- identifie une Béninoise par son ancien numéro à huit chiffres
-- (229 97 00 00 99) ; le Trône, lui, écrit le plan de 2024 (229 01 97 00 00 99),
-- et la base comparait les deux à l'égal : la fiche n'était « pas celle de ce
-- numéro », le numéro listé en Essai n'était « pas le même ».
--
-- LA CLÉ : les deux formes se réduisent à 229 + huit chiffres, pour COMPARER
-- seulement. `numero_wa` ne change pas : les fils, les messages et les envois
-- gardent le numéro tel que Meta le dit. Même règle que `cleWa` (automate) et
-- `cleDuNumeroWa` (Trône).
--
-- Rejouable : tout est « create or replace » et « if not exists ».

create or replace function public.cle_du_numero_wa(brut text) returns text
language plpgsql immutable as $$
declare
  d text := public.numero_wa(brut);
begin
  if length(d) = 13 and d like '22901%' then return '229' || substr(d, 6); end if;
  return d;
end;
$$;

-- Les index qui portent la clé, à côté de ceux de `numero_wa` (0125).
create index if not exists clients_cle_numero_phone
  on public.clients (public.cle_du_numero_wa(data->>'phone'));
create index if not exists clients_cle_numero_phone2
  on public.clients (public.cle_du_numero_wa(data->>'phone2'));
create index if not exists team_cle_numero_phone
  on public.team (public.cle_du_numero_wa(data->>'phone'));
create index if not exists messages_wa_cle_numero
  on public.messages_wa (public.cle_du_numero_wa(data->>'numero'));

-- ── 1. LES FICHES D'UN NUMÉRO (0125), par clé ───────────────────────────
create or replace function public.fiches_du_numero(n text) returns jsonb
language sql stable security definer set search_path = public as $$
  with num as (select public.cle_du_numero_wa(n) as v),
  trouvees as (
    select c.id, c.data,
           public.cle_du_numero_wa(c.data->>'phone') = (select v from num) as par_phone,
           false as par_famille
      from public.clients c
     where length((select v from num)) >= 8
       and (public.cle_du_numero_wa(c.data->>'phone') = (select v from num)
            or public.cle_du_numero_wa(c.data->>'phone2') = (select v from num))
       and coalesce(c.data->>'archived', '') <> 'true'
  ),
  familles as (
    select distinct t.data->>'familyId' as fam
      from trouvees t
     where coalesce(t.data->>'familyId', '') <> ''
  ),
  famille as (
    select c.id, c.data, false as par_phone, true as par_famille
      from public.clients c
      join familles f on f.fam = c.data->>'familyId'
     where coalesce(c.data->>'archived', '') <> 'true'
       and not exists (select 1 from trouvees t where t.id = c.id)
  ),
  rangees as (
    select x.id, x.data, x.par_phone, x.par_famille,
           row_number() over (order by x.par_phone desc, x.par_famille, x.id) as rang
      from (select * from trouvees union all select * from famille) x
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', r.id,
           'nom', coalesce(r.data->>'name', ''),
           'civilite', case when r.data->>'civilite' in ('madame', 'mademoiselle', 'monsieur') then r.data->>'civilite' end,
           'auMasculin', case when r.data->>'auMasculin' = 'true' then true end,
           'branchId', nullif(r.data->>'branchId', ''),
           'familyId', nullif(r.data->>'familyId', ''),
           'naissance', nullif(r.data->>'birthday', ''),
           'parPhone', r.par_phone,
           'parFamille', case when r.par_famille then true end,
           'numeros', (select coalesce(jsonb_agg(distinct public.numero_wa(tel.x)), '[]'::jsonb)
                         from unnest(array[r.data->>'phone', r.data->>'phone2']) as tel(x)
                        where public.numero_wa(tel.x) <> ''),
           'derniereVenue', (select jsonb_build_object(
                                      'date', a.data->>'date',
                                      'serviceIds', case when jsonb_typeof(a.data->'serviceIds') = 'array'
                                                         then a.data->'serviceIds' else '[]'::jsonb end)
                               from public.appointments a
                              where a.data->>'clientId' = r.id
                                and a.data->>'status' = 'honoré'
                              order by a.data->>'date' desc, coalesce(a.data->>'time', '') desc
                              limit 1),
           'prochainRdv', case when not r.par_famille then (select jsonb_build_object(
                                      'date', a.data->>'date',
                                      'time', coalesce(a.data->>'time', ''))
                               from public.appointments a
                              where a.data->>'clientId' = r.id
                                and coalesce(a.data->>'status', '') in ('confirmé', 'en attente')
                                and a.data->>'date' >= to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD')
                              order by a.data->>'date', coalesce(a.data->>'time', '')
                              limit 1) end
         )) order by r.rang), '[]'::jsonb)
    from rangees r
   where r.rang <= 8;
$$;
revoke all on function public.fiches_du_numero(text) from public, anon, authenticated;
grant execute on function public.fiches_du_numero(text) to service_role;

-- ── 2. LA TÊTE D'UN NUMÉRO (0126), par clé ──────────────────────────────
create or replace function public.tete_du_numero(n text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  num text := public.cle_du_numero_wa(n);
  r record;
begin
  if auth.uid() is not null and not public.is_staff() then
    return jsonb_build_object('tiroir', 'clientes');
  end if;
  if num = '' then return jsonb_build_object('tiroir', 'clientes'); end if;

  select t.id, t.branch_id into r
    from public.team t
   where public.cle_du_numero_wa(t.data->>'phone') = num
   limit 1;
  if found then
    return jsonb_build_object('tiroir', 'equipe', 'staffId', r.id, 'branchId', r.branch_id);
  end if;

  select p->>'id' as id, p->>'branchId' as branch_id into r
    from public.documents d,
         jsonb_array_elements(case when jsonb_typeof(d.data) = 'array' then d.data else '[]'::jsonb end) p
   where d.key = 'mnd_prestataires'
     and coalesce((p->>'archived')::boolean, false) = false
     and public.cle_du_numero_wa(p->>'phone') = num
   limit 1;
  if found then
    return jsonb_build_object('tiroir', 'prestataires', 'prestataireId', r.id, 'branchId', r.branch_id);
  end if;

  select f.id, f.branch_id into r
    from public.fournisseurs f
   where public.cle_du_numero_wa(f.data->>'telephone') = num
   limit 1;
  if found then
    return jsonb_build_object('tiroir', 'prestataires', 'fournisseurId', r.id, 'branchId', r.branch_id);
  end if;

  return jsonb_build_object('tiroir', 'clientes');
end;
$$;
revoke execute on function public.tete_du_numero(text) from public, anon;
grant execute on function public.tete_du_numero(text) to authenticated, service_role;

-- ── 3. UN NUMÉRO RÉSERVÉ (0126), par clé ────────────────────────────────
create or replace function public.numero_est_reserve(n text) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or public.is_staff())
     and (public.tiroir_du_numero(n) <> 'clientes'
          or exists (
            select 1 from public.messages_wa m
             where public.cle_du_numero_wa(m.data->>'numero') = public.cle_du_numero_wa(n)
               and coalesce(m.data->>'tiroir', 'clientes') <> 'clientes'
          ));
$$;
revoke execute on function public.numero_est_reserve(text) from public, anon;
grant execute on function public.numero_est_reserve(text) to authenticated, service_role;

-- ── LE CONTRÔLE, en lignes de résultat ──────────────────────────────────
-- Attendu : « oui » ou « en place » partout.
select 'la clé réunit les deux formes' as quoi,
       case when public.cle_du_numero_wa('0197000099') = public.cle_du_numero_wa('22997000099')
             and public.cle_du_numero_wa('+229 01 97 00 00 99') = '22997000099'
             and public.cle_du_numero_wa('97 00 00 99') = '22997000099' then 'oui' else 'NON' end as etat
union all
select 'un numéro étranger ne bouge pas', case when public.cle_du_numero_wa('+33 6 12 34 56 78') = '33612345678' then 'oui' else 'NON' end
union all
select 'numero_wa ne change pas', case when public.numero_wa('97 00 00 99') = '2290197000099' then 'oui' else 'NON' end
union all
select 'les quatre index', (select count(*) from pg_indexes where schemaname = 'public'
         and indexname in ('clients_cle_numero_phone', 'clients_cle_numero_phone2', 'team_cle_numero_phone', 'messages_wa_cle_numero'))::text || ' sur 4'
union all
select 'fiches_du_numero compare par clé', case when pg_get_functiondef('public.fiches_du_numero(text)'::regprocedure) like '%cle_du_numero_wa(c.data->>''phone'')%' then 'en place' else 'NON' end
union all
select 'tete_du_numero compare par clé', case when pg_get_functiondef('public.tete_du_numero(text)'::regprocedure) like '%cle_du_numero_wa(t.data->>''phone'')%' then 'en place' else 'NON' end;
