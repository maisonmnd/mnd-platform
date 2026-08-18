-- ═══════════════════════════════════════════════════════════════════
-- 0054b — LE CONTRÔLE DU GLISSEMENT KLƆKLƆ™
--
-- À coller après le 0054. Ne modifie RIEN : que des `select`.
-- « Success. No rows returned » ne dit pas ce qui est écrit — ceci le dit.
--
-- À relancer UNE SECONDE FOIS après avoir rechargé Le Trône (Ctrl+Maj+R) :
-- un onglet resté ouvert peut repousser son cache par-dessus le serveur.
-- Les six lignes doivent redire la même chose.
-- ═══════════════════════════════════════════════════════════════════

-- ① LE VERDICT — six nombres, et ce qu'ils doivent valoir.
select
  (select count(*) from public.repli_0054_invoices)                                as pieces_repliees,
  (select count(*) from public.repli_0054_appointments)                            as rdv_replies,
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Dépose%')                                           as reste_depose,
  (select count(*) from public.appointments a
    where a.data -> 'serviceIds' ?| array['sv-plt-05-sig-c','sv-plt-05-pre-c'])    as reste_ancien_rdv,
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Souffle%')                                          as lignes_souffle,
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Ancrage%')                                          as lignes_ancrage;
--  · `pieces_repliees` et `rdv_replies` > 0  → le repli a bien mordu.
--    S'ils valent 0, RIEN n'a été touché : dis-le moi, on cherche pourquoi.
--  · `reste_depose` et `reste_ancien_rdv` = 0 → plus une seule trace des anciens.
--  · `lignes_souffle` / `lignes_ancrage` > 0 → les nouveaux noms sont en place.

-- ② L'ARGENT REÇU N'A PAS BOUGÉ. Les deux colonnes doivent être ÉGALES,
--    et `ecart` valoir 0. C'est le contrôle qui compte le plus.
select
  coalesce((select sum((l ->> 'unitXof')::numeric * coalesce((l ->> 'qty')::numeric, 1)
                       * (1 - coalesce((l ->> 'discountPct')::numeric, 0) / 100))
     from public.repli_0054_invoices i, jsonb_array_elements(i.data -> 'lines') l
    where i.data ->> 'status' = 'payée'), 0)                                       as avant,
  coalesce((select sum((l ->> 'unitXof')::numeric * coalesce((l ->> 'qty')::numeric, 1)
                       * (1 - coalesce((l ->> 'discountPct')::numeric, 0) / 100))
     from public.invoices i, jsonb_array_elements(i.data -> 'lines') l
    where i.id in (select id from public.repli_0054_invoices)
      and i.data ->> 'status' = 'payée'), 0)                                       as apres,
  coalesce((select sum((l ->> 'unitXof')::numeric * coalesce((l ->> 'qty')::numeric, 1)
                       * (1 - coalesce((l ->> 'discountPct')::numeric, 0) / 100))
     from public.invoices i, jsonb_array_elements(i.data -> 'lines') l
    where i.id in (select id from public.repli_0054_invoices)
      and i.data ->> 'status' = 'payée'), 0)
  - coalesce((select sum((l ->> 'unitXof')::numeric * coalesce((l ->> 'qty')::numeric, 1)
                       * (1 - coalesce((l ->> 'discountPct')::numeric, 0) / 100))
     from public.repli_0054_invoices i, jsonb_array_elements(i.data -> 'lines') l
    where i.data ->> 'status' = 'payée'), 0)                                       as ecart;

-- ③ PIÈCE PAR PIÈCE — la liste à relire. Chaque ligne KLƆKLƆ™ touchée,
--    son statut, son ancien nom, son nouveau, son ancien prix, son nouveau.
select i.data ->> 'number'      as piece,
       i.data ->> 'status'      as statut,
       av ->> 'label'           as avant,
       ap ->> 'label'           as apres,
       (av ->> 'unitXof')::int  as prix_avant,
       (ap ->> 'unitXof')::int  as prix_apres,
       case when (av ->> 'unitXof') = (ap ->> 'unitXof') then 'intact' else 'recalculé' end as argent
from public.repli_0054_invoices r
join public.invoices i on i.id = r.id,
     jsonb_array_elements(r.data -> 'lines') with ordinality a(av, n),
     jsonb_array_elements(i.data -> 'lines') with ordinality b(ap, m)
where n = m
  and (av ->> 'label' like '%Ancrage%' or av ->> 'label' like '%Dépose%')
order by i.data ->> 'status', i.data ->> 'number';
--  Toute ligne « payée » doit lire `intact`. Toute ligne non payée, `recalculé`
--  (12 000 pour un Ancrage venu d'une Dépose, 8 000 pour un Souffle).

-- ④ LES RENDEZ-VOUS — combien ont glissé, et combien ont figé leur prix.
select a.data ->> 'status'                                          as statut,
       count(*)                                                     as rituels,
       count(*) filter (where a.data ? 'priceXof')                  as prix_figes,
       sum((a.data ->> 'priceXof')::numeric)                        as somme_figee
from public.appointments a
where a.id in (select id from public.repli_0054_appointments)
group by 1 order by 1;

-- ⑤ AUCUN RDV NE POINTE DANS LE VIDE. Zéro ligne attendue.
select a.id, sid as prestation_inconnue
from public.appointments a,
     jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
left join public.catalog_services s on s.id = sid
where s.id is null;
