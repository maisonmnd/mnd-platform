-- Opale répond sur le WhatsApp de la Maison : 4 novembre 2026.
-- « L'automate fait beaucoup d'erreurs. J'aimerais que ce soit Opale qui gère
-- les conversations du Trône et qu'on remplace l'automate. » (Yéman.) Choix au
-- sélecteur le même jour : au serveur, 24 h/24, seule pour tout le monde dès
-- la mise en ligne.
--
-- Ce fichier pose le document `mnd_opale` = { "qui": "opale" } : la fonction
-- whatsapp-automate (2026-11-04-a et après) fait alors répondre Opale à la
-- place de l'automate ; l'ancien automate reste en réserve (Système ›
-- Paramètres › WhatsApp › « Qui répond sur WhatsApp », un toucher le
-- rallume). Aucune autre ligne ne bouge.
--
-- À PASSER APRÈS la mise en ligne de whatsapp-automate 2026-11-04-a : une
-- fonction plus ancienne ne lit pas ce document et rien ne changerait.
--
-- REJOUABLE : rejoué, il remet seulement « opale ». Rien n'est effacé, aucune
-- copie de repli n'est nécessaire (le document est neuf ; l'enlever rend la
-- main à l'automate).

insert into public.documents (key, data, updated_at)
values ('mnd_opale', '{"qui": "opale"}'::jsonb, now())
on conflict (key) do update
   set data = excluded.data,
       updated_at = now()
 where public.documents.data is distinct from excluded.data;

-- Ce qui est en base après coup.
select key, data, updated_at from public.documents where key = 'mnd_opale';
