-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC DE 0157 · LES POURBOIRES DE L'ÉQUIPE — 5 novembre 2026
--
-- À jouer APRÈS 0157, dans l'éditeur SQL. Tout est ANNULÉ par l'exception
-- finale : aucune part ne reste, aucune ligne du journal non plus, et aucune
-- notification ne part (une requête pg_net n'est envoyée qu'au commit).
--
-- Ce qu'il dit, dans le message d'erreur final : le déclencheur est posé, les
-- mots de la base sont ceux du Trône, et POUR CHAQUE MEMBRE QUI A UNE PART,
-- ce qu'une part d'un franc ferait aujourd'hui :
--   · « parti »        : son téléphone serait prévenu (fiche, compte, Vault) ;
--   · « sans-adresse » : sa fiche n'a ni compteMail ni email (Ressources
--                        humaines › sa fiche) ;
--   · « sans-compte »  : l'adresse ne mène à aucun compte du personnel ;
--   · « refuse : … »   : la fonction n'a pas pu être appelée (le Vault).
-- Les prénoms des membres seuls, jamais un nom de cliente.
-- ═══════════════════════════════════════════════════════════════════════════
do $essai$
declare
  r text := '';
  l record;
  n int;
  jour text := to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD');
begin
  select count(*) into n from pg_trigger where tgrelid = 'public.tips'::regclass and tgname = 'tips_previent';
  r := r || 'declencheur: ' || n || '; ';
  r := r || 'mots: ' || public.prenom_de_la_cliente('Mme Ranti Exemple') || ' / ' || public.francs_dits(1000) || ' / ' || public.mois_dit(current_date) || '; ';
  for l in
    select t.id, split_part(coalesce(t.data ->> 'name', '?'), ' ', 1) as prenom
      from public.team t
     where coalesce((t.data ->> 'partPourboire')::numeric, 1) > 0
       and (t.data ->> 'archiveeLe' is null or t.data ->> 'archiveeLe' > jour)
     order by t.id
  loop
    insert into public.tips (id, branch_id, data) values ('essai-0157-' || l.id, null,
      jsonb_build_object('id', 'essai-0157-' || l.id, 'staffId', l.id, 'amountXof', 1, 'date', jour, 'note', 'Essai'));
    r := r || l.prenom || ': ' || coalesce((select issue from public.pourboires_prevenus where tip_id = 'essai-0157-' || l.id), 'rien au journal') || '; ';
  end loop;
  raise exception 'ESSAI_0157_A_BLANC: %', r;
end $essai$;
