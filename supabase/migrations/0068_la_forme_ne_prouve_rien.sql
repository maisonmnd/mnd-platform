-- ═══════════════════════════════════════════════════════════════════
-- 0068 — LA FORME NE PROUVE RIEN · 20 août 2026
--
-- Suite immédiate du 0067, et son démenti. Le 0066 exigeait un jeton
-- service_role ; le 0067 a ajouté « ou une clé sb_secret_… ». Puis la
-- réalité : la clé qui obtient des 200 chez les anciens jobs cron n'a
-- NI l'une NI l'autre forme — et le portier, sûr de sa liste, refusait
-- de l'envoyer. Deux migrations pour apprendre la même chose des deux
-- côtés : un contrôle de FORME bénit de mauvaises clés (0067) et bloque
-- de bonnes (0068). Le seul juge est l'essai réel — la fonction Edge
-- répond 200 ou 401, et net._http_response garde le verdict lisible.
--
-- Le portier ne vérifie donc plus que la PRÉSENCE des deux secrets.
-- (`_role_du_jeton` reste : il sert aux contrôles informatifs.)
--
-- Au passage, la recopie de clé depuis un job réussi doit prendre TOUT
-- ce qui suit « Bearer » jusqu'à la quote fermante — le filet du 0067
-- (`[A-Za-z0-9._-]+`) s'arrêtait au premier caractère spécial et
-- pouvait ne copier qu'un morceau :
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'service_role_key'),
--     (select substring(command from 'Bearer ([^'']+)')
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
  return net.http_post(
    url := rtrim(trim(base), '/') || '/functions/v1/' || nom,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(cle)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

revoke execute on function public.appelle_fonction_edge(text) from public, anon, authenticated;

-- ── LE CONTRÔLE — présence des secrets et longueur de la clé ────────
select 'edge_base_url' as secret,
       case when exists (select 1 from vault.decrypted_secrets where name = 'edge_base_url')
         then 'posé' else 'à poser' end as etat
union all
select 'service_role_key',
       coalesce('posée · ' || length(trim((select decrypted_secret
         from vault.decrypted_secrets where name = 'service_role_key'))) || ' caractères',
         'à poser');
