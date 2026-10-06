-- ═══════════════════════════════════════════════════════════════════
-- 0121 — LE NUMÉRO DE NYM SARL · 7 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc.
-- « Le numéro du tampon peut être 01 67 30 00 00 » (Yéman). Le téléphone de
-- l'entreprise nourrit ses deux tampons et la ligne « Tél. » de l'en-tête.
-- Un document déjà signé garde l'image du tampon qu'il portait.
-- ═══════════════════════════════════════════════════════════════════

do $bloc$
begin
  update public.secretariat
     set data = data || jsonb_build_object('telephone', '+229 01 67 30 00 00')
   where data->>'genre' = 'entreprise' and upper(trim(data->>'nom')) = 'NYM SARL';
end
$bloc$;

select data->>'nom' as entreprise, data->>'telephone' as telephone, updated_at
from public.secretariat where data->>'genre' = 'entreprise' and upper(trim(data->>'nom')) = 'NYM SARL';
