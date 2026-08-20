-- ═══════════════════════════════════════════════════════════════════
-- 0069 — LE PUSH N'A JAMAIS EU BESOIN DE SECRET · 20 août 2026
--
-- Fin de la chasse au 401. Après trois migrations à courir après la clé
-- (0066 le Vault, 0067 les deux formats, 0068 plus de contrôle du tout),
-- la lecture de push-notify a dit la vérité : son mode `reminders` fait
-- DÉJÀ les rappels J-1 (fenêtre 22–24 h avant, journal push_reminders,
-- idempotent) et NE DEMANDE AUCUN SECRET — seule la passerelle exige une
-- clé, et la publiable lui suffit. Le job `mnd-push-rappels` l'appelle
-- chaque heure et répond 200 depuis toujours.
--
-- Le `{"sent":0}` n'était pas une panne : c'était « aucun abonnement ne
-- correspond ». Les abonnements du téléphone pendaient à des fiches
-- clientes supprimées (comptes d'essai Ma Couronne).
--
-- rappels-j1 (la fonction au 401) reste utile pour le WhatsApp et le SMS,
-- qui attendent les clés Meta/Twilio. Le PUSH, lui, ne l'a jamais
-- attendue. Ce fichier n'ajoute qu'une porte pour appeler une fonction
-- Edge AVEC UN CORPS — afin de déclencher `reminders` à la demande.
--
-- LEÇON : avant de réparer un chemin, vérifier qu'un autre ne fait pas
-- déjà le travail. Trois migrations de clé pour un problème d'abonnement.
-- ═══════════════════════════════════════════════════════════════════

/* L'ANCIENNE SIGNATURE PART D'ABORD. Garder appelle_fonction_edge(text)
   à côté de appelle_fonction_edge(text, jsonb DEFAULT) rendrait tout appel
   à un seul argument AMBIGU — « function is not unique » — et casserait
   rappels_j1_soir_sql() et sauvegarde_nuit_sql() du même coup. */
drop function if exists public.appelle_fonction_edge(text);

create or replace function public.appelle_fonction_edge(nom text, corps jsonb default '{}'::jsonb)
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
    body := corps,
    timeout_milliseconds := 15000
  );
end;
$$;

revoke execute on function public.appelle_fonction_edge(text, jsonb) from public, anon, authenticated;

/* Le balayage des rappels, à la demande — même geste que le job horaire.
   Idempotent par construction : push-notify tient son journal
   (push_reminders) et ne renvoie jamais deux fois le même rappel. */
create or replace function public.pousse_les_rappels_sql()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.appelle_fonction_edge('push-notify', '{"mode":"reminders"}'::jsonb);
  return 'push-notify · reminders appelé — net._http_response dira combien sont partis';
end;
$$;

revoke execute on function public.pousse_les_rappels_sql() from public, anon, authenticated;
