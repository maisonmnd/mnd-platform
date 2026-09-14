-- ═══════════════════════════════════════════════════════════════════
-- 0094 — LES BILANS DU FOYER · 14 septembre 2026
--
-- « Peut-on envoyer le bilan d'un foyer ? » (Yéman).
--
-- OUI, ET LA QUESTION DIFFICILE ÉTAIT DÉJÀ TRANCHÉE. La base sait depuis le
-- 9 août qu'un parent porte les MINEURS de sa famille : c'est `est_ma_tete()`
-- (migration 0036), et elle garde la fiche, les rendez-vous, les factures et
-- les visites. À dix-huit ans l'enfant en sort de lui-même, ses données lui
-- appartiennent ; le lien de famille demeure et le parent peut continuer à
-- régler, mais il ne lit plus.
--
-- LES BILANS N'ONT JAMAIS ÉTÉ MIS SOUS CETTE GARDE. Leur politique est restée
-- celle du 0035 : « cette fiche et elle seule ». Conséquence, jusqu'à
-- aujourd'hui : DANS MA COURONNE, UNE MÈRE NE VOIT PAS LE BILAN DE SA FILLE.
--
-- POURQUOI MAINTENANT. La conversation outillée pose un bouton qui envoie le
-- relevé d'un foyer, bilans compris. L'envoyer sans corriger la base ferait de
-- WhatsApp une porte PLUS PERMISSIVE que l'application — le personnel lit
-- tout, donc le geste passerait — et c'est exactement la porte à ne pas
-- ouvrir. Deux surfaces qui ne disent pas la même chose sur les mêmes données
-- finissent toujours par se contredire devant une cliente.
--
-- CETTE MIGRATION N'OUVRE RIEN DE NEUF : elle aligne les bilans sur ce que
-- les rendez-vous et les factures font déjà depuis cinq semaines. Le personnel
-- garde son plein accès (`staff_all`, inchangée), et l'écriture reste au
-- comptoir — un bilan est la parole de la maison, pas une auto-évaluation.
-- ═══════════════════════════════════════════════════════════════════

-- La garde du parent doit exister : 0036 est passée le 9 août. Si elle
-- manquait, mieux vaut le dire ici que laisser une politique se poser sur
-- une fonction absente et bloquer la lecture de toute la table.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'est_ma_tete'
  ) then
    raise exception 'est_ma_tete() est absente : passez d’abord 0036_acces_parents_temps2.sql';
  end if;
end $$;

drop policy if exists own_sel on public.bilans;

create policy own_sel on public.bilans for select to authenticated
  using (public.is_staff() or public.est_ma_tete(data->>'clientId'));

-- ── CONTRÔLE ───────────────────────────────────────────────────────
-- La lecture des bilans dit désormais la même chose que celle des
-- rendez-vous et des factures.
select tablename as sur_quoi, policyname as politique, qual as la_regle
from pg_policies
where schemaname = 'public'
  and tablename in ('bilans', 'appointments', 'invoices')
  and policyname = 'own_sel'
order by tablename;
