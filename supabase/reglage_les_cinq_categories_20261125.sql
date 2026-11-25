-- ═══════════════════════════════════════════════════════════════════════════
-- RÉGLAGE — LES CINQ CATÉGORIES DU CLASSEMENT (2026-11-25)
--
-- « Pour le classement, je veux garder la diaspora, la dormante, la régulière,
-- l'annulée, la privilégiée (je veux que tu crées cette catégorie), et supprime
-- les autres et refaire le classement. […] Dans ce classement, tu verras
-- [cinq clientes] » (Yéman).
--
-- Le calcul est dans le code (shared/classement-pur.ts). Ce réglage pose ce
-- qui vit en base :
--   ① les deux catégories de la Maison du 20 novembre (« À définir », « Retour
--      en Afro ») partent avec les autres : `mnd_classement.categories` = [] ;
--   ② les cinq clientes nommées par Yéman sont rangées dans La Privilégiée
--      (`clients.data.parcours.etape`), un choix de la Maison qui passe avant
--      les critères. Le dépôt est public : elles sont désignées par l'empreinte
--      md5 de leur identifiant, jamais par leur nom.
--
-- GARDES : un repli d'abord ; une catégorie où une fiche a été rangée à la main
-- ne part pas ; une cliente qui a déjà un choix d'étape n'est pas touchée.
-- Rejouable sans rien changer de plus.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Le repli ──────────────────────────────────────────────────────────
create table if not exists public.repli_documents_20261125_cinq_categories as
  select * from public.documents where key = 'mnd_classement';
alter table public.repli_documents_20261125_cinq_categories enable row level security;

create table if not exists public.repli_clients_20261125_privilegiees as
  select * from public.clients
   where md5(id) in ('2d1ea42067716aa80268dd158ad23711', '1c7ef0375ae0b5ba51881e0813d8f2ab', '2dede418eab723c2a42b38a832438b68',
                     '15c2d8da593bf6feb837e6cce2ef9a60', '3efeb5c016854a0ee411c1b5021a7378');
alter table public.repli_clients_20261125_privilegiees enable row level security;

-- ── ① Les catégories de la Maison : aucune ─────────────────────────────
update public.documents d
   set data = jsonb_set(d.data, '{categories}', '[]'::jsonb),
       updated_at = now()
 where d.key = 'mnd_classement'
   and jsonb_typeof(d.data->'categories') = 'array'
   and jsonb_array_length(d.data->'categories') > 0
   and not exists (
     select 1 from public.clients c
      where c.data->'parcours'->>'etape' in (select x->>'id' from jsonb_array_elements(d.data->'categories') x)
   );

-- ── ② Les cinq Privilégiées ────────────────────────────────────────────
update public.clients c
   set data = jsonb_set(c.data, '{parcours}', jsonb_build_object(
         'etape', 'privilegiee',
         'le', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'par', 'Yéman')),
       updated_at = now()
 where md5(c.id) in ('2d1ea42067716aa80268dd158ad23711', '1c7ef0375ae0b5ba51881e0813d8f2ab', '2dede418eab723c2a42b38a832438b68',
                     '15c2d8da593bf6feb837e6cce2ef9a60', '3efeb5c016854a0ee411c1b5021a7378')
   and coalesce(c.data->'parcours'->>'etape', '') = '';

-- ── La relecture ───────────────────────────────────────────────────────
select (select jsonb_array_length(data->'categories') from public.documents where key = 'mnd_classement') as categories_de_la_maison,
       (select count(*) from public.clients where data->'parcours'->>'etape' = 'privilegiee') as privilegiees,
       (select count(*) from public.repli_clients_20261125_privilegiees) as au_repli;
