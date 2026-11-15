-- ═══════════════════════════════════════════════════════════════════════════
-- 0211 · LE RENDEZ-VOUS SUGGÉRÉ · 15 novembre 2026
--
-- « The way you make automatic appointments is not good » (Yéman, 14 novembre
-- 2026). Mme F. écrit « je n'avais pas pris de rdv pour demain » ; l'assistant
-- WhatsApp lui répond qu'elle a « bien un rendez-vous confirmé » : il ne savait
-- pas que la Maison l'avait seulement proposé.
--
-- Le Trône pose désormais `suggereLe` sur un rendez-vous « Suggéré par la
-- Maison » (shared/rendez-vous-suggere-pur.ts) ; son oui pose
-- `confirmeeParLaClienteLe`. L'assistant (reception-wa, appelée par
-- whatsapp-automate) lit le prochain rendez-vous d'un numéro par
-- `fiches_du_numero`.
--
-- CE QUE FAIT 0211, et rien d'autre : la même fonction qu'en 0173, mot pour
-- mot, avec `suggere: true` dans `prochainRdv` quand c'est une suggestion
-- sans oui (absent sinon, `jsonb_strip_nulls`). Rejouable : « create or
-- replace ». Aucune donnée touchée.

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
           'prochainRdv', case when not r.par_famille then (select jsonb_strip_nulls(jsonb_build_object(
                                      'date', a.data->>'date',
                                      'time', coalesce(a.data->>'time', ''),
                                      'suggere', case when btrim(coalesce(a.data->>'suggereLe', '')) <> ''
                                                       and btrim(coalesce(a.data->>'confirmeeParLaClienteLe', '')) = ''
                                                       and a.data->>'status' = 'confirmé'
                                                      then true end))
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
