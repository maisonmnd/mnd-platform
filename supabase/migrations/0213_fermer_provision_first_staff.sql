-- ═══════════════════════════════════════════════════════════════════════════
-- 0213 — RETIRER provision_first_staff (audit du 4 novembre 2026, M-1 ;
-- numérotée et datée le 17 novembre 2026)
--
-- LA FAILLE. `provision_first_staff(text)` (0003) est SECURITY DEFINER,
-- exécutable par `authenticated` (et par `anon` : 0003 n'a jamais retiré le
-- droit de PUBLIC), et inscrit l'appelant « souverain », toutes rubriques,
-- toutes branches, si la table `staff` est vide. Si `staff` était un jour
-- purgée, le prochain compte connecté (une cliente de Ma Couronne comprise)
-- devenait souverain. Le Trône l'appelait à chaque connexion ; il ne l'appelle
-- plus (src/shared/auth.ts), et apply_auth.sql ne la crée plus.
--
-- LE GESTE. On la SUPPRIME plutôt que de lui retirer ses droits : un futur
-- « grant execute » ne ramènera pas une RPC qui se promeut elle-même. Le
-- fondateur crée son compte, puis s'inscrit souverain à la main dans le SQL
-- Editor (gabarit en tête de apply_rls_prod.sql).
--
-- POURQUOI 0213, LE 17 NOVEMBRE. Écrite pour l'audit sous un numéro qui
-- tombait sous des migrations déjà passées (main va jusqu'à 0212), et qu'une
-- branche non fusionnée portait déjà pour une autre migration, elle n'avait
-- jamais été passée. Elle prend 0213, le numéro suivant, réservé pour elle ce
-- jour-là. Rien ne dépend de son rang : elle ne fait que supprimer.
--
-- L'ORDRE AVEC LE TRÔNE EST LIBRE. Un Trône construit avant l'audit appelle
-- encore la fonction à chaque connexion : une fois supprimée, l'appel échoue
-- et n'est que noté en console (`console.warn`), la connexion n'en souffre pas.
--
-- LE DÉCLENCHEUR `staff_guard` N'EST PAS TOUCHÉ, À DESSEIN. Il garde, depuis
-- 0073 (repris tel quel en 0109, sa dernière définition), un cas écrit pour
-- cette fonction :
--     if (select count(*) from public.staff) = 0 then
--       return new;                    -- amorçage du fondateur
--     end if;
-- C'est désormais LE passage de l'inscription à la main : dans le SQL Editor
-- (rôle postgres, sans jeton), `auth.uid()` est nul, donc ni
-- `if public.is_souverain() then` ni le cas de 0109
-- `if tg_op = 'INSERT' and new.user_id = auth.uid() then` ne s'appliquent.
-- Sans lui, aucun fondateur ne pourrait plus entrer ; avec lui, l'inscription
-- à la main ne vaut que pour le premier membre.
-- Depuis l'API, ce cas ne mène nulle part :
--   · une écriture directe dans `staff` (PostgREST, anon ou authenticated)
--     est soumise à la RLS : anon n'y a aucune politique d'écriture, et la seule
--     politique d'écriture, `staff_admin_write` (0073), exige
--     `public.is_souverain()` en USING comme en WITH CHECK, ce qui est faux
--     tant que la table est vide. Le déclencheur peut laisser passer la
--     ligne : la RLS la refuse ;
--   · les fonctions SECURITY DEFINER qui écrivent `staff`, celle-ci partie,
--     se gardent elles-mêmes : `authorize_staff` (0007) commence par
--     `if not public.is_souverain() then raise exception 'Réservé au
--     souverain.';`, et `rattacher_mon_compte` (0109) n'écrit que le rôle
--     d'une fiche préparée par la direction, que `fiche_qui_mattend` limite
--     à `gerant` ou `maitre` : jamais souverain ;
--   · la clé de service contourne la RLS, mais PAS `staff_guard` (relu le
--     18 novembre 2026 ; l'en-tête disait à tort qu'elle pouvait tout
--     écrire). Un déclencheur s'applique à tous les rôles, `service_role` et
--     `postgres` compris : `auth.uid()` y est nul, `is_souverain()` est
--     faux, et dès que `staff` n'est plus vide, toute écriture est refusée.
--     La clé de service, comme le SQL Editor, n'écrit donc `staff` que tant
--     que la table est vide ; aucune fonction Edge n'écrit `staff`.
-- Le déclencheur n'est donc pas redéfini ici.
--
-- Aucune donnée ne bouge. Rejouable : `drop … if exists`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0213⟩
drop function if exists public.provision_first_staff(text);
-- ⟨/0213⟩


-- ── Contrôle ──────────────────────────────────────────────────────────
-- Doit rendre `true` : plus aucune fonction de ce nom dans le schéma public,
-- quelle que soit sa signature.
select not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'provision_first_staff'
) as provision_first_staff_retiree;
