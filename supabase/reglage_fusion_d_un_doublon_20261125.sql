-- ═══════════════════════════════════════════════════════════════════════════
-- RÉGLAGE — LA FUSION D'UN DOUBLON (2026-11-25, le soir)
--
-- Une cliente du carnet (une Fidèle, sept visites) s'est inscrite sur Ma
-- Couronne le 25 novembre : son compte a fait naître une fiche neuve, même
-- adresse électronique, aucun rendez-vous. « Fusionne » (Yéman).
--
-- La mécanique est celle du geste « Fusionner deux fiches » du Trône
-- (shared/fusion.ts, `survivantDe` et `fusionnerFiches`) :
--   · LA FICHE AU COMPTE SURVIT (son identifiant est le compte de connexion,
--     un compte ne déménage pas de fiche) ; l'ancienne est le SOCLE, les
--     champs remplis de la fiche au compte passent par-dessus ;
--   · deux écarts, pour ne rien perdre de ce que l'équipe a posé : le nom
--     reste celui de l'ancienne fiche (corrigé par l'équipe le même jour,
--     avec son accent) ; le persona de l'ancienne reste (celui de la fiche
--     au compte est la valeur d'office d'une inscription) ; le segment
--     « Nouvelle » ne passe pas (sept visites) ; les points s'additionnent,
--     les segments s'unissent, la plus ancienne entrée fait foi ;
--   · l'histoire suit : rendez-vous (clientId, clientName, offertPar),
--     factures, bilans, présence, déclarations d'enfants, familles, avoirs,
--     et, en plus du geste du Trône, les envois et les messages WhatsApp ;
--   · la coquille s'efface.
--
-- Le dépôt est public : les deux fiches sont désignées par l'empreinte md5 de
-- leur identifiant, jamais par leur nom.
--
-- GARDES : un repli d'abord (les deux fiches, et chaque ligne rattachée) ;
-- rien ne se fait si l'une des deux manque ou si les adresses électroniques
-- diffèrent. Rejouable : une fois l'ancienne effacée, il ne se passe plus rien.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Le repli ──────────────────────────────────────────────────────────
create table if not exists public.repli_clients_20261125_fusion as
  select * from public.clients
   where md5(id) in ('f95596bc92a2921e8598f84e366ecca0', 'afbf02bc0d0db9c25b108ec00359e3b9');
alter table public.repli_clients_20261125_fusion enable row level security;

create table if not exists public.repli_rattaches_20261125_fusion as
  with a as (select id from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0')
  select 'appointments'::text as t, x.id, x.data, x.updated_at from public.appointments x, a
   where x.data->>'clientId' = a.id or x.data->>'offertPar' = a.id
  union all select 'invoices', x.id, x.data, x.updated_at from public.invoices x, a where x.data->>'clientId' = a.id
  union all select 'bilans', x.id, x.data, x.updated_at from public.bilans x, a where x.data->>'clientId' = a.id
  union all select 'client_sessions', x.id, x.data, x.updated_at from public.client_sessions x, a where x.data->>'clientId' = a.id
  union all select 'enfants_declares', x.id, x.data, x.updated_at from public.enfants_declares x, a
   where x.data->>'clientId' = a.id or x.data->>'clientCreeId' = a.id
  union all select 'families', x.id, x.data, x.updated_at from public.families x, a where x.data->>'payerClientId' = a.id
  union all select 'credit_movements', x.id, x.data, x.updated_at from public.credit_movements x, a
   where x.data->>'holderType' = 'client' and x.data->>'holderId' = a.id
  union all select 'envois', x.id, x.data, x.updated_at from public.envois x, a where x.data->>'clientId' = a.id
  union all select 'messages_wa', x.id, x.data, x.updated_at from public.messages_wa x, a where x.data->>'clientId' = a.id;
alter table public.repli_rattaches_20261125_fusion enable row level security;

-- ── ① La fiche fusionnée, sur la fiche au compte ──────────────────────
with a as (select id, data from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0'),
     s as (select id, data from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9'),
     r as (select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb) as remplis
             from s, jsonb_each(s.data) k
            where k.value <> 'null'::jsonb
              and not (jsonb_typeof(k.value) = 'string' and btrim(k.value #>> '{}') = '')
              and k.key not in ('name', 'persona', 'segments', 'loyaltyPoints', 'since'))
update public.clients c
   set data = (a.data || r.remplis) || jsonb_build_object(
         'id', s.id,
         'authUserId', s.data->'authUserId',
         'name', a.data->'name',
         'loyaltyPoints', coalesce((s.data->>'loyaltyPoints')::numeric, 0) + coalesce((a.data->>'loyaltyPoints')::numeric, 0),
         'segments', (select coalesce(jsonb_agg(distinct u.x), '[]'::jsonb)
                        from (select jsonb_array_elements_text(coalesce(a.data->'segments', '[]'::jsonb)) as x
                              union select jsonb_array_elements_text(coalesce(s.data->'segments', '[]'::jsonb))) u
                       where u.x <> 'Nouvelle'),
         'since', least(coalesce(a.data->>'since', s.data->>'since'), coalesce(s.data->>'since', a.data->>'since'))),
       updated_at = now()
  from a, s, r
 where c.id = s.id
   and lower(coalesce(a.data->>'email', '')) = lower(coalesce(s.data->>'email', ''))
   and coalesce(a.data->>'email', '') <> '';

-- ── ② L'histoire suit ──────────────────────────────────────────────────
-- (seulement si la fiche au compte porte déjà la fusion : son nom est celui de l'ancienne)
with a as (select id, data from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0'),
     s as (select id, data from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9'
             and data->'parcours' is not null)
update public.appointments x
   set data = x.data
         || case when x.data->>'clientId' = a.id then jsonb_build_object('clientId', s.id, 'clientName', s.data->'name') else '{}'::jsonb end
         || case when x.data->>'offertPar' = a.id then jsonb_build_object('offertPar', s.id) else '{}'::jsonb end,
       updated_at = now()
  from a, s
 where x.data->>'clientId' = a.id or x.data->>'offertPar' = a.id;

with a as (select id from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0'),
     s as (select id from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and data->'parcours' is not null)
update public.invoices x set data = x.data || jsonb_build_object('clientId', s.id), updated_at = now()
  from a, s where x.data->>'clientId' = a.id;

with a as (select id from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0'),
     s as (select id from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and data->'parcours' is not null)
update public.bilans x set data = x.data || jsonb_build_object('clientId', s.id), updated_at = now()
  from a, s where x.data->>'clientId' = a.id;

with a as (select id from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0'),
     s as (select id from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and data->'parcours' is not null)
update public.client_sessions x set data = x.data || jsonb_build_object('clientId', s.id), updated_at = now()
  from a, s where x.data->>'clientId' = a.id;

with a as (select id from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0'),
     s as (select id from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and data->'parcours' is not null)
update public.enfants_declares x
   set data = x.data
         || case when x.data->>'clientId' = a.id then jsonb_build_object('clientId', s.id) else '{}'::jsonb end
         || case when x.data->>'clientCreeId' = a.id then jsonb_build_object('clientCreeId', s.id) else '{}'::jsonb end,
       updated_at = now()
  from a, s where x.data->>'clientId' = a.id or x.data->>'clientCreeId' = a.id;

with a as (select id from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0'),
     s as (select id from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and data->'parcours' is not null)
update public.families x set data = x.data || jsonb_build_object('payerClientId', s.id), updated_at = now()
  from a, s where x.data->>'payerClientId' = a.id;

with a as (select id from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0'),
     s as (select id from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and data->'parcours' is not null)
update public.credit_movements x set data = x.data || jsonb_build_object('holderId', s.id), updated_at = now()
  from a, s where x.data->>'holderType' = 'client' and x.data->>'holderId' = a.id;

with a as (select id from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0'),
     s as (select id from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and data->'parcours' is not null)
update public.envois x set data = x.data || jsonb_build_object('clientId', s.id), updated_at = now()
  from a, s where x.data->>'clientId' = a.id;

with a as (select id from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0'),
     s as (select id from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and data->'parcours' is not null)
update public.messages_wa x set data = x.data || jsonb_build_object('clientId', s.id), updated_at = now()
  from a, s where x.data->>'clientId' = a.id;

-- ── ③ La coquille s'efface (seulement si plus rien ne la nomme) ────────
delete from public.clients c
 where md5(c.id) = 'f95596bc92a2921e8598f84e366ecca0'
   and exists (select 1 from public.clients s where md5(s.id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and s.data->'parcours' is not null)
   and not exists (select 1 from public.appointments x where x.data->>'clientId' = c.id or x.data->>'offertPar' = c.id)
   and not exists (select 1 from public.invoices x where x.data->>'clientId' = c.id)
   and not exists (select 1 from public.envois x where x.data->>'clientId' = c.id)
   and not exists (select 1 from public.messages_wa x where x.data->>'clientId' = c.id);

-- ── La relecture ───────────────────────────────────────────────────────
select (select count(*) from public.clients where md5(id) = 'f95596bc92a2921e8598f84e366ecca0') as ancienne_restante,
       (select data->'parcours'->>'etape' from public.clients where md5(id) = 'afbf02bc0d0db9c25b108ec00359e3b9') as etape_de_la_fiche_au_compte,
       (select count(*) from public.appointments x, public.clients s
         where md5(s.id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and x.data->>'clientId' = s.id) as rdv_sur_la_fiche_au_compte,
       (select count(*) from public.invoices x, public.clients s
         where md5(s.id) = 'afbf02bc0d0db9c25b108ec00359e3b9' and x.data->>'clientId' = s.id) as factures_sur_la_fiche_au_compte,
       (select count(*) from public.repli_rattaches_20261125_fusion) as rattaches_au_repli,
       (select count(*) from public.repli_clients_20261125_fusion) as fiches_au_repli;
