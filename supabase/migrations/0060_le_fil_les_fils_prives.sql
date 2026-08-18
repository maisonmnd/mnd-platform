-- ═══════════════════════════════════════════════════════════════════
-- 0060 — LES FILS PRIVÉS SE FERMENT AU SERVEUR
--        (à coller tel quel. RIEN À DÉCOMMENTER.)
--
-- « Ne pas laisser un staff comme Gérard voir les notes que les souverains
-- s'envoient. Juste afficher ce qui les concerne » (Yéman, 18 août 2026).
--
-- ── CE QUI N'ALLAIT PAS ──────────────────────────────────────────
-- L'écran ne montrait à chacun que SES tête-à-tête — mais la politique du
-- 0058 laissait tout le personnel LIRE toute la table. Un fil privé n'était
-- donc caché que par l'affichage : la donnée, elle, arrivait sur l'appareil.
-- Une confidentialité tenue par l'écran n'est pas une confidentialité ; c'est
-- une politesse. Elle tombe au premier outil de développement ouvert.
--
-- ── LA RÈGLE, DÉSORMAIS TENUE PAR LA BASE ────────────────────────
--   notes:<adresse>   ne se lisent QUE par cette adresse
--   dm:<a>|<b>        ne se lisent QUE par a ou b
--   tout le reste     se lit par le personnel — c'est la Maison qui parle
--
-- L'adresse vient du JETON de la session (`auth.jwt()`), pas d'un champ que le
-- client pourrait écrire : on ne demande pas à celui qui lit de dire qui il est.
--
-- ÉCRIRE reste ouvert au personnel : poser un message dans un fil qu'on ne peut
-- pas relire n'apporte rien à qui voudrait tricher, et verrouiller l'écriture
-- par canal empêcherait un jour d'écrire à quelqu'un qu'on vient d'ajouter.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- La politique unique du 0058 laissait tout lire : on la remplace par quatre,
-- dont une lecture qui regarde le canal.
drop policy if exists fil_staff on public.fil_messages;

create policy fil_lire on public.fil_messages for select to authenticated
using (
  public.is_staff()
  and case
    when (data ->> 'canal') like 'notes:%'
      then (data ->> 'canal') = 'notes:' || lower(coalesce(auth.jwt() ->> 'email', ''))
    when (data ->> 'canal') like 'dm:%'
      then lower(coalesce(auth.jwt() ->> 'email', '')) = any (
             string_to_array(substring(data ->> 'canal' from 4), '|')
           )
    else true
  end
);

create policy fil_ecrire on public.fil_messages for insert to authenticated
  with check (public.is_staff());

create policy fil_reprendre on public.fil_messages for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy fil_effacer on public.fil_messages for delete to authenticated
  using (public.is_staff());

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lancer juste après.
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'fil_messages')          as politiques,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'fil_messages'
      and policyname = 'fil_lire')                                       as lecture_filtree,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'fil_messages'
      and policyname = 'fil_staff')                                      as ancienne_restante;
--  Attendu : 4 · 1 · 0
--  `ancienne_restante` DOIT valoir 0 : tant que l'ancienne politique existe,
--  elle autorise à elle seule toute lecture — deux politiques de SELECT
--  s'ADDITIONNENT, elles ne se restreignent pas l'une l'autre.
