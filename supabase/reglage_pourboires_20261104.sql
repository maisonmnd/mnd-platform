-- Deux pourboires corrigés : 4 novembre 2026.
-- « Je veux que tu supprimes la facture du deuxième pourboire de N. M. Elle
-- n'en a donné qu'un seul. Ensuite, les pourboires d'aujourd'hui se rajoutent
-- sur la facture de R. S. A., il a donné 4 000 francs de pourboire » (Yéman).
--
-- 1. F-2026-0749 (« Pourboire · Team », 2 000 F, 23 octobre 2026, 18 h 44) est
--    la seconde pièce de pourboire de N. M. : sa suppression du 29 octobre 2026
--    n'est jamais arrivée au serveur (la table `traces` ne la voit que posée).
--    Ses parts sont déjà justes (une par membre, 2 000 F, corrigées le
--    29 octobre) : seule la pièce part, et avec elle 2 000 F fantômes de la
--    caisse du 23 octobre.
-- 2. F-2026-0773 (R. S. A., 4 novembre 2026) reçoit son pourboire de 4 000 F,
--    PARTAGÉ COMME À LA CAISSE (`addTipPartage`, src/shared/tips.ts) : toute
--    l'équipe de la maison, chacun à sa part (`partPourboire`, 1 par défaut,
--    0 = rien), les parts reliées à la pièce (`invoiceId`), la cliente en note.
--
-- Les deux pièces d'avant sont gardées dans une table de repli, sous RLS
-- aussitôt. REJOUABLE : la pièce ne s'efface que si elle est encore celle-là,
-- le pourboire ne se pose que si la pièce n'en a pas, et ses parts que si
-- aucune ne la porte.

create table if not exists public.repli_pourboires_20261104 as
  select id, branch_id, data, updated_at from public.invoices
   where id in ('inv-la8mtkeoen', 'inv-6leeyad2x3');
alter table public.repli_pourboires_20261104 enable row level security;

delete from public.invoices
 where id = 'inv-la8mtkeoen'
   and data->>'number' = 'F-2026-0749'
   and (data->'lines'->0->>'label') like 'Pourboire%';

do $pourboire$
declare
  piece record;
  total numeric;
  posees int;
  somme int := 0;
  m record;
  part int;
begin
  select id, branch_id, data into piece from public.invoices where id = 'inv-6leeyad2x3' and data->>'number' = 'F-2026-0773';
  if piece.id is null then
    raise exception 'F-2026-0773 introuvable';
  end if;
  select count(*) into posees from public.tips where data->>'invoiceId' = piece.id;
  if coalesce((piece.data->>'tipXof')::int, 0) > 0 or posees > 0 then
    return; -- déjà posé : on ne double jamais un pourboire
  end if;
  select sum(coalesce((t.data->>'partPourboire')::numeric, 1)) into total
    from public.team t
   where t.data->>'branchId' = coalesce(piece.data->>'branchId', piece.branch_id)
     and coalesce((t.data->>'partPourboire')::numeric, 1) > 0
     and t.data->>'archiveeLe' is null and coalesce((t.data->>'archived')::boolean, false) = false;
  if coalesce(total, 0) <= 0 then
    raise exception 'aucune part de pourboire dans l''équipe';
  end if;
  for m in
    select t.id, coalesce((t.data->>'partPourboire')::numeric, 1) as p
      from public.team t
     where t.data->>'branchId' = coalesce(piece.data->>'branchId', piece.branch_id)
       and coalesce((t.data->>'partPourboire')::numeric, 1) > 0
       and t.data->>'archiveeLe' is null and coalesce((t.data->>'archived')::boolean, false) = false
  loop
    part := floor(4000 * m.p / total);
    somme := somme + part;
    insert into public.tips (id, branch_id, data) values (
      'tp-' || substr(md5(random()::text || m.id), 1, 10),
      piece.branch_id,
      jsonb_build_object('id', null, 'staffId', m.id, 'amountXof', part, 'date', '2026-11-04',
                         'note', piece.data->>'clientName', 'invoiceId', piece.id));
  end loop;
  if somme <> 4000 then
    raise exception 'le partage ne tombe pas juste (% F)', somme;
  end if;
  update public.tips set data = jsonb_set(data, '{id}', to_jsonb(id)) where data->>'invoiceId' = piece.id and data->'id' = 'null'::jsonb;
  update public.invoices set data = data || jsonb_build_object('tipXof', 4000) where id = piece.id;
end $pourboire$;

-- Contrôle : la pièce effacée, le pourboire posé et ses parts.
select
  (select count(*) from public.invoices where id = 'inv-la8mtkeoen') as f0749_restante,
  (select data->>'tipXof' from public.invoices where id = 'inv-6leeyad2x3') as pourboire_f0773,
  (select sum((data->>'amountXof')::int) from public.tips where data->>'invoiceId' = 'inv-6leeyad2x3') as parts_f0773,
  (select count(*) from public.tips where data->>'invoiceId' = 'inv-6leeyad2x3') as nombre_de_parts,
  (select count(*) from public.repli_pourboires_20261104) as copies_de_repli;
