-- ═══════════════════════════════════════════════════════════════════════════
-- RÉGLAGE — LES FIDÈLES DU CLASSEMENT (2026-11-25, le soir)
--
-- « La fidèle, c'est celle qui va à son rythme, mais qui est toujours là. Elle
-- est toujours présente, depuis plusieurs années, donc il faut mettre
-- [quatre clientes] dans ce groupe » (Yéman).
--
-- La Fidèle se calcule aussi (shared/classement-pur.ts : cliente depuis un an,
-- six visites, venue dans les six derniers mois) ; les quatre clientes nommées
-- y sont rangées en plus À LA MAIN (`clients.data.parcours.etape` = 'fidele'),
-- pour qu'elles y restent quoi que disent les critères. Le dépôt est public :
-- elles sont désignées par l'empreinte md5 de leur identifiant, jamais par
-- leur nom.
--
-- GARDES : un repli d'abord ; une cliente qui a déjà un choix d'étape n'est
-- pas touchée. Rejouable sans rien changer de plus.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Le repli ──────────────────────────────────────────────────────────
create table if not exists public.repli_clients_20261125_fideles as
  select * from public.clients
   where md5(id) in ('f95596bc92a2921e8598f84e366ecca0', 'adebf1e8b5116a03310e97fe6baaafdf',
                     '43b78222870d707c4df1376708ac7cfa', 'fe0e436514272c4e37ac1f67880bef3c');
alter table public.repli_clients_20261125_fideles enable row level security;

-- ── Les quatre Fidèles ─────────────────────────────────────────────────
update public.clients c
   set data = jsonb_set(c.data, '{parcours}', jsonb_build_object(
         'etape', 'fidele',
         'le', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'par', 'Yéman')),
       updated_at = now()
 where md5(c.id) in ('f95596bc92a2921e8598f84e366ecca0', 'adebf1e8b5116a03310e97fe6baaafdf',
                     '43b78222870d707c4df1376708ac7cfa', 'fe0e436514272c4e37ac1f67880bef3c')
   and coalesce(c.data->'parcours'->>'etape', '') = '';

-- ── La relecture ───────────────────────────────────────────────────────
select (select count(*) from public.clients where data->'parcours'->>'etape' = 'fidele') as fideles_a_la_main,
       (select count(*) from public.clients where data->'parcours'->>'etape' = 'privilegiee') as privilegiees,
       (select count(*) from public.repli_clients_20261125_fideles) as au_repli;
