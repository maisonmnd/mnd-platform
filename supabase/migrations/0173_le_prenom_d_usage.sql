-- ═══════════════════════════════════════════════════════════════════════════
-- 0173 · LE PRÉNOM D'USAGE · 7 novembre 2026
--
-- « Les clientes comme Anne-Marie, comme Marie Gisèle, qui ont un prénom
-- composé : c'est important que, quand on leur écrit, on écrive toujours,
-- dans leur rendez-vous et dans leur messagerie WhatsApp, tout le prénom
-- composé » (Yéman). Au sélecteur : DEVINÉ, CORRIGEABLE. Le Trône devine le
-- prénom d'usage du nom (shared/civilite `prenomDUsage`) ; le champ
-- « Prénom d'usage » de la fiche (`data.prenomUsage`) le corrige.
--
-- Les fonctions WhatsApp (whatsapp-automate, whatsapp-webhook) lisent les
-- fiches d'un numéro par `fiches_du_numero` (0125, 0128), qui choisit ses
-- champs : sans cette migration, elles devinent le prénom du nom (ce qui
-- marche déjà), mais ne voient pas la correction notée sur la fiche.
--
-- CE QUE FAIT 0173, et rien d'autre : la même fonction qu'en 0128, mot pour
-- mot, avec `prenomUsage` ajouté (vide : absent, `jsonb_strip_nulls`).
-- Rejouable : « create or replace ».

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
           'prenomUsage', nullif(btrim(coalesce(r.data->>'prenomUsage', '')), ''),
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
