-- 7 nov. 2026, demande de Y. : « occupe-toi des corrections ».
-- Les trois factures de l'ancienne formule epuisee (150 000 F) ont ete payees
-- (3 versements au contrat, memes montants, memes dates) mais jamais soldees :
-- Ma Couronne les comptait comme dues. On ne pose que le statut « payee » et
-- une note : aucun paiement n'est ecrit sur la facture (le contrat les porte
-- deja), donc aucun chiffre d'affaires ne bouge. Etat d'avant : statut « envoyee ».
update public.invoices
set data = data || jsonb_build_object(
      'status', 'payée',
      'note', 'Payée au contrat le ' || case id
          when 'V5sX1v3yZ21JBqYjDvVd' then '2025-06-19'
          when 'jnUuiuXj8akrzg3u3pc0' then '2025-08-16'
          else '2026-06-17' end || ' ; soldée le 2026-11-07 (versement du contrat, jamais posé sur la facture).'),
    updated_at = now()
where id in ('V5sX1v3yZ21JBqYjDvVd', 'jnUuiuXj8akrzg3u3pc0', 'PactnJYaBlApQgH8LsbL')
  and data->>'clientId' = '9ZJC1cXkzuVTd25BNDjdsyZW44z1'
  and data->>'status' = 'envoyée';
