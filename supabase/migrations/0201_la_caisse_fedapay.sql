-- LA CAISSE FEDAPAY (12 novembre 2026, « Enlève MND PAY et remplace par FedaPay », Y.).
-- La caisse où dort l'argent payé par FedaPay jusqu'au reversement change de nom :
-- même identifiant (cb-mndpay-<branche>), même passé, seuls le nom et le sous-titre
-- changent. Aucun versement, aucune facture, aucune dépense ne porte l'ancien nom
-- (relu le 12 novembre avant d'écrire) ; le Trône reconnaît encore « MND PAY »
-- pour un poste resté sur l'ancienne version. Le déclencheur touch_updated_at
-- date la ligne : chaque poste la reçoit par la synchro.
update public.cashboxes
   set data = data || jsonb_build_object('name', 'FedaPay', 'sub', 'Avant le reversement')
 where id like 'cb-mndpay-%'
   and data->>'name' = 'MND PAY';

-- Contrôle : plus aucune caisse « MND PAY ».
select id, data->>'name' as nom, data->>'sub' as sous
  from public.cashboxes
 where id like 'cb-mndpay-%' or data->>'name' in ('MND PAY', 'FedaPay');
