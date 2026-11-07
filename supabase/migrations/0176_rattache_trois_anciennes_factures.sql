-- 7 nov. 2026. Rectifie 0175 : poser « payee » sur ces trois factures leur
-- fabriquait (invoiceReglements) un reglement « Especes » compte en caisse et en
-- chiffre d'affaires, en double des versements deja portes par le contrat.
-- Etat d'avant, rendu : statut « envoyee », sans la note. On les RATTACHE au
-- contrat epuise par `subId` (aucun chiffre ne bouge) ; Mon solde ne compte plus
-- une piece qui porte le `subId` d'un contrat de la cliente.
update public.invoices
set data = (data - 'note') || jsonb_build_object('status', 'envoyée', 'subId', 'togQGusZC4u4kvFAHqms'),
    updated_at = now()
where id in ('V5sX1v3yZ21JBqYjDvVd', 'jnUuiuXj8akrzg3u3pc0', 'PactnJYaBlApQgH8LsbL')
  and data->>'clientId' = '9ZJC1cXkzuVTd25BNDjdsyZW44z1'
  and data->>'status' = 'payée';
