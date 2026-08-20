-- ═══════════════════════════════════════════════════════════════════
-- 0067 — LA CLÉ NOUVEAU FORMAT · 20 août 2026
--
-- Le 401 « réservé au cron » qui hantait rappels-j1 (et avant lui
-- sauvegarde-nuit) avait une cause simple et invisible : le projet est
-- passé aux NOUVELLES clés Supabase (`sb_secret_…`). Les fonctions Edge
-- comparent l'Authorization à la clé de LEUR environnement — qui est la
-- clé sb_secret — tandis que le tableau de bord faisait copier l'ancien
-- jeton JWT service_role. Deux clés « valides », jamais identiques.
--
-- L'ironie : le contrôle du 0066 (`_role_du_jeton`) exigeait un JWT au
-- rôle service_role — il validait donc précisément la clé qui ne pouvait
-- pas marcher, et aurait refusé celle qui marche. La preuve est venue des
-- anciens jobs cron (mnd-staff-rdv-1h, mnd-push-rappels) : leurs appels
-- répondent 200, et la clé de leur commande n'est pas un JWT — c'est une
-- sb_secret. Leçon du jour : un contrôle qui valide la FORME peut bénir
-- la mauvaise clé ; seule l'égalité avec ce qui réussit fait foi.
--
-- Ce fichier ne change QUE le portier : il accepte désormais les deux
-- formats (sb_secret_… OU jeton service_role), et porte le délai d'appel
-- à 15 s — trois rendez-vous à rappeler dépassaient les 5 s du 0066.
--
-- GESTE DE LA MAISON (une fois, dans le SQL Editor — jamais ici, le
-- dépôt est public) : recopier la clé qui MARCHE depuis un job réussi,
-- de base à base, sans qu'elle s'affiche :
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'service_role_key'),
--     (select substring(command from 'Bearer ([A-Za-z0-9._-]+)')
--        from cron.job where jobid = <LE_JOB_QUI_RÉUSSIT>));
-- ═══════════════════════════════════════════════════════════════════

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
  cle := trim(cle);
  /* LES DEUX FORMATS SE PROUVENT AVANT DE PARTIR. Une clé sb_secret ne se
     décode pas ; un jeton se décode et doit dire service_role. Tout le
     reste est refusé ICI, avec un mot clair — pas là-bas, sans un bruit. */
  if not (cle like 'sb_secret_%' or public._role_du_jeton(cle) = 'service_role') then
    raise exception 'Vault : « service_role_key » n''est ni une clé secrète (sb_secret_…) ni un jeton service_role — recollez-la (voir 0067).';
  end if;

  return net.http_post(
    url := rtrim(trim(base), '/') || '/functions/v1/' || nom,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cle
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

revoke execute on function public.appelle_fonction_edge(text) from public, anon, authenticated;

-- ── LE CONTRÔLE — la forme de la clé du Vault, en toutes lettres ────
select
  case
    when cle like 'sb_secret_%' then 'clé secrète nouveau format — acceptée'
    when public._role_du_jeton(cle) = 'service_role' then 'jeton service_role — accepté'
    else 'CLÉ INVALIDE — recollez-la'
  end as forme_de_la_cle
from (select trim((select decrypted_secret from vault.decrypted_secrets
                   where name = 'service_role_key')) as cle) t;
