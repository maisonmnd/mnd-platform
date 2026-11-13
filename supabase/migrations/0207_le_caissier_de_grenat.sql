-- ════════════════════════════════════════════════════════════════════
-- 0207 · LE CAISSIER DE GRENAT — 13 novembre 2026
-- ════════════════════════════════════════════════════════════════════
--
-- « Le Trône n'a pas de caissier. J'aimerais créer un robot caissier qui
-- se déclenche automatiquement pour finaliser un paiement ou une facture »
-- (Yéman, 13 novembre 2026), puis « construis ».
--
-- Grenat tient la caisse ENTRE ses deux clôtures : la même fonction
-- `cloture-du-jour`, appelée toutes les cinq minutes avec
-- {"moment":"caisse"}, de 7 h à 23 h à Cotonou (6 h à 22 h UTC). La règle
-- est src/shared/le-caissier-pur.ts, recopiée dans la fonction (bloc
-- ⟨le-caissier⟩). Elle fait, et rien d'autre :
--   · les gestes sûrs de la clôture dès qu'ils sont vrais (honorer un
--     rendez-vous réglé en entier, relier une pièce, envoyer le reçu d'une
--     pièce payée calme depuis quinze minutes) ;
--   · prévenir le comptoir d'un rituel fini sans encaissement (une fois) ;
--   · demander la facture au Trône quand rien n'est venu (une heure après
--     la fin, par défaut), puis la déposer en salle d'attente.
--
-- CE FICHIER NE POSE QUE LE CRON. Aucune table : les marques du caissier
-- vivent sur les rendez-vous (`data.caissier`), écrites par la fonction
-- (clé service) ou par le poste qui écrit la pièce ; `honoreParGrenat`
-- porte le moment « caisse ». Le caissier s'éteint dans Paramètres
-- (`mnd_settings.caissier.actif = false`) : la fonction répond alors
-- « le caissier est éteint » sans rien lire.
--
-- Rejouable : le cron est retiré puis reposé sous le même nom.
-- `appelle_fonction_edge(nom, corps)` vient de 0069.

select cron.unschedule(jobid) from cron.job where jobname = 'le-caissier-de-grenat';

-- Toutes les cinq minutes, de 6 h à 22 h 55 UTC : 7 h à 23 h 55 à Cotonou.
-- La fonction ne travaille que le jour même, et pas un jour fermé sans
-- rendez-vous.
select cron.schedule('le-caissier-de-grenat', '*/5 6-22 * * *',
  $$select public.appelle_fonction_edge('cloture-du-jour', '{"source":"cron","moment":"caisse"}'::jsonb);$$);


-- ── Contrôle ──────────────────────────────────────────────────────────
select jobname, schedule, active from cron.job
 where jobname in ('le-caissier-de-grenat', 'cloture-de-grenat', 'cloture-de-grenat-matin')
 order by jobname;
