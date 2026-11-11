-- LES FICHES DE SOIN EN PDF — 11 novembre 2026.
-- « ranger les fiches de M. G. » (Y.) : le coffre privé des pièces des
-- clientes (0147) prend aussi un PDF, rangé sous `<clientId>/fiches/`. Les
-- droits ne changent pas : le personnel voit et dépose, la direction efface.
-- Rejouable : le type ne s'ajoute qu'une fois.

update storage.buckets
set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['application/pdf']) order by 1)
where id = 'pieces-des-clientes';

-- CONTRÔLE : sept types, dont application/pdf ; toujours fermé au public.
select id as compartiment, public as ouvert_au_public, allowed_mime_types as types
from storage.buckets where id = 'pieces-des-clientes';
