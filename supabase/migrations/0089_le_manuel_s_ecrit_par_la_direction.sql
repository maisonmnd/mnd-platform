-- ═══════════════════════════════════════════════════════════════════
-- 0089 — LE MANUEL S'ÉCRIT PAR LA DIRECTION · 13 septembre 2026
--
-- « Permets-moi de corriger le manuel directement depuis le Trône. C'est un
-- document personnel, privé : l'éditer dans le Trône ne le rend-il pas
-- public ? » (Yéman).
--
-- NON, ET CETTE MIGRATION LE GARANTIT JUSQU'AU BOUT. Le code du Trône est
-- public, mais il ne porte que le formulaire, vide. Le texte du manuel ne
-- vit que dans cette table, et la clé publique n'y lit rien.
--
-- LE DÉFAUT QU'ELLE FERME. 0088 posait `staff_all` : tout le personnel
-- pouvait LIRE et ÉCRIRE. L'écran ne montrait l'import qu'à la direction,
-- mais une règle tenue par l'écran seul se contourne par la base. Désormais :
--   · tout le personnel LIT (la formatrice voit son plan en séance) ;
--   · seuls le souverain et le gérant ÉCRIVENT, créent et effacent.
--
-- `est_direction()` est SECURITY DEFINER, comme `is_souverain()` (0003) :
-- elle lit `staff` sans passer par sa RLS. Un membre du personnel ne peut
-- pas se donner le rôle de gérant (0073, `staff_guard`).
--
-- 0088 est déjà passée : on ne la rejoue pas, on remplace sa politique.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.est_direction() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid() and role in ('souverain', 'gerant')
  );
$$;

drop policy if exists staff_all        on public.manuel_formatrices;
drop policy if exists staff_lit        on public.manuel_formatrices;
drop policy if exists direction_cree   on public.manuel_formatrices;
drop policy if exists direction_modifie on public.manuel_formatrices;
drop policy if exists direction_efface on public.manuel_formatrices;

create policy staff_lit on public.manuel_formatrices for select to authenticated
  using (public.is_staff());

create policy direction_cree on public.manuel_formatrices for insert to authenticated
  with check (public.est_direction());

create policy direction_modifie on public.manuel_formatrices for update to authenticated
  using (public.est_direction()) with check (public.est_direction());

create policy direction_efface on public.manuel_formatrices for delete to authenticated
  using (public.est_direction());
