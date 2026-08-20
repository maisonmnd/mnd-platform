-- ═══════════════════════════════════════════════════════════════════
-- 0066 — LES RAPPELS SANS CLÉ DANS LE JOB · 20 août 2026
--
-- Le job `rappels-j1-soir` est en échec, et la sauvegarde a montré le mal :
-- une clé collée dans un en-tête de cron casse pour un caractère invisible,
-- et personne ne le voit. Les rappels, eux, ont BESOIN du HTTP (push,
-- WhatsApp) — la clé doit donc exister quelque part. Sa place : le VAULT,
-- posée UNE fois, et VALIDÉE par la base elle-même — la fonction refuse de
-- partir avec une mauvaise clé, en le disant.
--
-- GESTES DE LA MAISON (une fois, dans le SQL Editor — jamais dans ce
-- fichier : le dépôt est public) :
--
--   select vault.create_secret('https://VOTRE-PROJET.supabase.co', 'edge_base_url');
--   select vault.create_secret('LA_CLE_service_role', 'service_role_key');
--
-- Puis le job cron devient un SQL Snippet : select public.rappels_j1_soir_sql();
-- ═══════════════════════════════════════════════════════════════════

-- ── ① Lire le rôle inscrit DANS un jeton — la preuve qu'on tient la bonne
--       clé, au lieu de l'espérer ─────────────────────────────────────
create or replace function public._role_du_jeton(jeton text)
returns text
language plpgsql
immutable
as $$
declare
  corps text := split_part(jeton, '.', 2);
begin
  if corps = '' then return null; end if;
  corps := replace(replace(corps, '-', '+'), '_', '/');
  corps := rpad(corps, ((length(corps) + 3) / 4) * 4, '=');
  return (convert_from(decode(corps, 'base64'), 'utf8')::jsonb) ->> 'role';
exception when others then
  return null;
end;
$$;

-- ── ② L'appel d'une fonction Edge, la clé lue au Vault ──────────────
-- Réservé à la base elle-même (le cron tourne en postgres) : révoqué de
-- tous les rôles clients.
create or replace function public.appelle_fonction_edge(nom text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  cle text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'edge_base_url';
  select decrypted_secret into cle from vault.decrypted_secrets where name = 'service_role_key';
  if base is null then
    raise exception 'Vault : le secret « edge_base_url » manque — posez-le (voir 0066).';
  end if;
  if cle is null then
    raise exception 'Vault : le secret « service_role_key » manque — posez-le (voir 0066).';
  end if;
  /* LA CLÉ SE PROUVE AVANT DE PARTIR. C'est le 401 silencieux du 20 août,
     rendu impossible : une clé anon, tronquée ou d'un autre genre est
     refusée ICI, avec un mot clair — pas là-bas, sans un bruit. */
  if public._role_du_jeton(trim(cle)) is distinct from 'service_role' then
    raise exception 'Vault : « service_role_key » n''est pas une clé service_role valide — recollez-la depuis Settings → API.';
  end if;

  return net.http_post(
    url := rtrim(trim(base), '/') || '/functions/v1/' || nom,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(cle)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke execute on function public.appelle_fonction_edge(text) from public, anon, authenticated;

-- ── ③ Le geste du soir — UNE ligne pour le job cron ─────────────────
create or replace function public.rappels_j1_soir_sql()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.appelle_fonction_edge('rappels-j1');
  return 'rappels-j1 appelé — le journal des envois dira le reste';
end;
$$;

revoke execute on function public.rappels_j1_soir_sql() from public, anon, authenticated;

-- ── LE CONTRÔLE — l'état des deux secrets, en toutes lettres ────────
-- Attendu APRÈS avoir posé les secrets : deux lignes, la seconde disant
-- « clé service valide ». Avant : « à poser ».
select
  'edge_base_url' as secret,
  case when exists (select 1 from vault.decrypted_secrets where name = 'edge_base_url')
    then 'posé' else 'à poser' end as etat
union all
select
  'service_role_key',
  case
    when not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then 'à poser'
    when public._role_du_jeton(trim((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))) = 'service_role'
      then 'clé service VALIDE'
    else 'POSÉE MAIS INVALIDE — recollez-la'
  end;
