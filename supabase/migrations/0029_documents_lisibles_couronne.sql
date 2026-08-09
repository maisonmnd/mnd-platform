-- ═══════════════════════════════════════════════════════════════════
-- 0029 — Deux documents que Ma Couronne lit sans en avoir le droit
--        (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- ⚠ DÉJÀ EXÉCUTÉE le 9 août 2026, sous le nom 0028. Une autre session écrivait
--   au même moment `0028_comptes_enfants.sql` : deux 0028 dans le dossier, et
--   l'un des deux aurait fini par être sauté. Ce fichier a donc été renuméroté
--   APRÈS son passage en base. Le contenu n'a pas bougé d'un caractère, et il
--   est idempotent — le relancer ne fait que réécrire la même politique.
--
-- La liste blanche `docs_pub_read` dit ce qu'une cliente (et l'anonyme) peuvent
-- LIRE dans `documents`. Elle a été posée en 0006 avec huit clés, étendue à neuf
-- en 0011 pour `mnd_model_bands`. Deux clés lues par Ma Couronne n'y sont
-- jamais entrées.
--
-- LE PIÈGE DE CETTE FAMILLE DE BOGUES : la RLS ne rend pas d'erreur sur une
-- lecture, elle rend ZÉRO LIGNE. Rien ne casse, rien n'est rouge, aucune trace
-- en console — le magasin garde simplement sa valeur par défaut, et l'écran
-- affiche cette valeur avec le même aplomb que la vraie. C'est pour cela que
-- `mnd_model_bands` a mis des semaines à se voir (0011), et c'est exactement ce
-- qui se passe ici.
--
--   ① `mnd_model_band_sets` — LES BARÈMES PAR ATELIER.
--      Lu par la réservation de Ma Couronne (`useBandSets` → `pricingOf` →
--      `personalPriceXof`, Booking.tsx). Son défaut de code n'est PAS vide : il
--      porte VEKPE_BANDS_SEED (Jumbo ×0,53 … Galaxy ×4,2). Une cliente ne lisait
--      donc pas « rien », elle lisait LES COEFFICIENTS D'ORIGINE — et si la
--      Maison a corrigé ceux de VÈKPÈ™ au Trône, la création qu'on lui annonce
--      en ligne n'est plus celle que la Caisse lui facturera. Sur un barème qui
--      va jusqu'à ×4,2, l'écart se compte en centaines de milliers de francs.
--      `mnd_model_bands` avait déjà été ouvert pour cette raison exacte ; celui-ci
--      est né après (pricing.ts), et la liste n'a pas suivi.
--
--   ② `mnd_cercle_seuil` — LE NOMBRE DE PASSAGES POUR ENTRER AU CERCLE (3).
--      Lu par l'accueil et l'onglet Cercle de Ma Couronne, qui disent à la
--      cliente « encore N passages ». Sans la lecture, elle voit toujours 3,
--      même si la Maison a changé son seuil : deux surfaces annonceraient deux
--      promesses différentes à la même personne.
--
-- Ni l'une ni l'autre n'est une donnée privée : une grille tarifaire et un
-- nombre de passages. Les deux sont d'ailleurs déjà affichés aux clientes —
-- c'est bien le problème.
--
-- L'ÉCRITURE NE BOUGE PAS : `docs_staff_all` reste seul à autoriser l'écriture,
-- et la lecture publique ne s'ouvre qu'aux clés nommées ici.
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists docs_pub_read on public.documents;
create policy docs_pub_read on public.documents for select to anon, authenticated
  using (key = any(array[
    'mnd_settings', 'mnd_brand', 'mnd_offers', 'mnd_cercle_tiers',
    'mnd_points_rate', 'mnd_crown_styles', 'mnd_couronne_compose', 'mnd_vitrine_config',
    'mnd_model_bands',
    -- 0028 :
    'mnd_model_band_sets', 'mnd_cercle_seuil'
  ]));

-- ── Vérification — les onze clés, et rien d'autre en lecture publique ──
select
  p.polname as policy_ok,
  pg_get_expr(p.polqual, p.polrelid) as cles_ouvertes
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname = 'documents' and p.polname = 'docs_pub_read';

-- Ce que la cliente lira réellement (les clés présentes en base parmi les onze) :
select key, (data is not null) as porte_une_valeur, updated_at
from public.documents
where key in ('mnd_model_band_sets', 'mnd_cercle_seuil')
order by key;
