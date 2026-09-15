-- ═══════════════════════════════════════════════════════════════════
-- 0100 — CORRIGER UN DEVIS RETENU · 15 septembre 2026
--
-- « Modifier un devis accepté » (Yéman). Tranché le même jour : LA
-- DIRECTION CORRIGE un devis retenu, et la trace de la base garde la
-- version d'avant (0092, déjà posée sur `devis_recus` par 0099).
--
-- C'EST UN RETOUR SUR UNE RÈGLE DE 0099, ET IL EST ASSUMÉ. 0099 figeait le
-- MONTANT d'un devis retenu pour tout le monde : un prix qui bouge devait
-- passer par un avenant. Juste pour un prix qui change ; absurde pour une
-- faute de frappe ou un madrier compté deux fois.
--
-- CE QUI CHANGE, ET RIEN D'AUTRE :
--   · la direction corrige un devis retenu en entier (montant, lignes,
--     dates, numéro, fichier) ;
--   · le reste du personnel ne touche plus DU TOUT un devis retenu. 0099 ne
--     gelait que le montant ; les lignes, arrivées depuis, auraient pu le
--     contredire ;
--   · un devis pas encore retenu : inchangé. Le personnel corrige sa
--     saisie, l'état et le « retenu par » restent à la direction.
--
-- SEULE LA FONCTION EST REMPLACÉE. Le déclencheur `devis_recus_garde`, posé
-- en 0099, l'appelle déjà : il n'y a rien à recréer.
--
-- Les gardes RESTAURENT au lieu de refuser, comme en 0091, 0093, 0098 et
-- 0099 : un refus ferait échouer la synchronisation et laisserait l'écran en
-- rouge sans que personne comprenne.
--
-- 0099 est passée le 15 septembre 2026.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.devis_recu_garde() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fige text;
begin
  if tg_op = 'INSERT' then
    -- Le comptoir SAISIT un devis reçu ; il ne l'arrive jamais « retenu ».
    if not public.est_direction() then
      new.data := jsonb_set(new.data - 'retenuLe' - 'retenuPar', '{etat}', '"recu"', true);
    end if;
    return new;
  end if;

  -- LA DIRECTION CORRIGE, retenu ou non. La trace garde l'avant.
  if public.est_direction() then
    return new;
  end if;

  -- UN DEVIS RETENU NE SE TOUCHE QU'À LA DIRECTION, et en entier : son
  -- montant, ses lignes, ses dates, son fichier. On rend la ligne telle
  -- qu'elle était.
  if old.data->>'etat' = 'retenu' then
    new.data := old.data;
    return new;
  end if;

  -- Un devis pas encore retenu : le contenu se corrige, le oui ne se donne pas.
  foreach fige in array array['etat', 'retenuLe', 'retenuPar'] loop
    if (old.data ? fige) then
      new.data := jsonb_set(new.data, array[fige], old.data -> fige, true);
    else
      new.data := new.data - fige;
    end if;
  end loop;
  return new;
end;
$$;

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select
  p.proname as fonction_remplacee,
  pg_get_functiondef(p.oid) like '%new.data := old.data%' as retenu_fige_pour_le_personnel,
  exists (
    select 1 from pg_trigger t
    where t.tgname = 'devis_recus_garde' and t.tgfoid = p.oid and not t.tgisinternal
  ) as declencheur_branche
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'devis_recu_garde';
