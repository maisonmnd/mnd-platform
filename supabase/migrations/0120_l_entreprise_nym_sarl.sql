-- ═══════════════════════════════════════════════════════════════════
-- 0120 — L'ENTREPRISE NYM SARL AU SECRÉTARIAT · 7 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc.
--
-- « Tu dois créer l'entreprise NYM SARL et son tampon pour faire certains
-- documents comme l'attestation de travail » (Yéman). Ses mentions, son
-- siège et son téléphone viennent d'elle ; le Secrétariat dessine de
-- lui-même son sceau rond et son cachet commercial (siège, RCCM, IFU).
--
-- Le signataire est un mandataire de NYM SARL dont le nom n'est pas encore
-- donné : il reste entre crochets, et un document entre crochets ne se
-- signe pas. Il se corrige dans la fiche de l'entreprise, au Secrétariat.
--
-- Ne crée rien si une entreprise « NYM SARL » existe déjà.
-- ═══════════════════════════════════════════════════════════════════

do $bloc$
declare
  branche text := coalesce(
    (select branch_id from public.secretariat where branch_id is not null limit 1),
    (select id from public.branches order by id limit 1));
begin
  if exists (select 1 from public.secretariat
              where data->>'genre' = 'entreprise' and upper(trim(data->>'nom')) = 'NYM SARL') then
    raise notice 'NYM SARL existe deja : rien a faire';
    return;
  end if;
  insert into public.secretariat (id, branch_id, data) values ('ent-nym-sarl', branche, jsonb_build_object(
    'id', 'ent-nym-sarl',
    'genre', 'entreprise',
    'branchId', branche,
    'entite', 'autre',
    'nom', 'NYM SARL',
    'mentions', 'Société à responsabilité limitée · RCCM RB/COT/09 B 4639 (ancien n° 14.205-B) · IFU 3200700011313 · Îlot 141, parcelle E 01, quartier Missèbo, 06 BP 2076 · Cotonou, Bénin',
    'telephone', '+229 01 21 31 08 10',
    'signataire', '[nom du mandataire], mandataire de NYM SARL',
    'creeLe', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));
end
$bloc$;

select data->>'nom' as entreprise, data->>'mentions' as mentions, data->>'telephone' as telephone,
       data->>'signataire' as signataire, branch_id
from public.secretariat where data->>'genre' = 'entreprise' and upper(trim(data->>'nom')) = 'NYM SARL';
