-- ═══════════════════════════════════════════════════════════════════
-- 0123 — RETIRER L'ANCIENNE FICHE DE L'HÉBERGEANT · 7 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc.
--
-- La première version du dossier de bourse (58af4983) créait, au premier
-- « Préparer les documents », une fiche d'hébergeant à un nom écrit dans
-- le code. Ce nom est retiré (9eb8f45d) : c'est la direction qui le saisit.
-- Ce script efface CETTE fiche (privée, sans marque de rôle, autre que
-- NYM SARL) et les brouillons qu'elle signait. Le prochain « Préparer »
-- recrée l'attestation et les quittances au nom saisi.
--
-- GARDES : rien n'est effacé si la fiche porte des papiers au classeur ou
-- un document en signature, signé ou annulé ; le résultat le dit.
-- ═══════════════════════════════════════════════════════════════════

do $bloc$
declare
  fiche record;
  papiers int;
  engages int;
  brouillons int := 0;
begin
  for fiche in
    select id, data->>'nom' as nom from public.secretariat
     where data->>'genre' = 'entreprise' and data->>'prive' = 'true'
       and coalesce(data->>'dossier', '') = '' and upper(trim(data->>'nom')) <> 'NYM SARL'
  loop
    select count(*) into papiers from public.papiers where data->>'titulaire' = 'ent:' || fiche.id;
    select count(*) into engages from public.secretariat
     where data->>'genre' = 'piece' and data->>'entrepriseId' = fiche.id and data->>'etat' <> 'brouillon';
    if papiers > 0 or engages > 0 then
      raise notice 'Fiche % gardee : % papier(s), % document(s) engage(s).', fiche.id, papiers, engages;
      continue;
    end if;
    delete from public.secretariat
     where data->>'genre' = 'piece' and data->>'entrepriseId' = fiche.id and data->>'etat' = 'brouillon';
    get diagnostics brouillons = row_count;
    delete from public.secretariat where id = fiche.id;
    raise notice 'Fiche % effacee avec % brouillon(s).', fiche.id, brouillons;
  end loop;
end
$bloc$;

-- Le contrôle : les fiches privées qui restent (l'hébergeant marqué, s'il
-- est déjà saisi) et les documents de bourse encore là.
select data->>'genre' as genre, coalesce(data->>'nom', data->>'titre') as quoi,
       coalesce(data->>'dossier', '') as role, coalesce(data->>'etat', '') as etat
from public.secretariat
where (data->>'genre' = 'entreprise' and data->>'prive' = 'true')
   or (data->>'genre' = 'piece' and coalesce(data->>'dossier', '') like 'bourse:%')
order by 1, 2;
