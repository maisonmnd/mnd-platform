-- ═══════════════════════════════════════════════════════════════════
-- 0054d — LES LIBELLÉS, ENFIN
--         (à coller tel quel. RIEN À DÉCOMMENTER.)
--
-- ⚠ FERME TOUS LES ONGLETS DU TRÔNE ET DE MA COURONNE AVANT DE LANCER.
--
-- ── CE QUI S'EST PASSÉ ───────────────────────────────────────────
-- Le 0054 et le 0054c ont fait glisser les RENDEZ-VOUS correctement — ils
-- portent des identifiants, aucune chaîne de caractères n'intervient
-- (`reste_prestige = 0`, contrôlé). Mais AUCUN libellé de facture n'a bougé :
-- le `replace()` visait la forme LONGUE du catalogue vivant
--
--     KLƆKLƆ™ Prestige · Le Shampoing « La Dépose »
--
-- alors que les pièces portent la forme COURTE, écrite avant que la fiche soit
-- renommée — 32 caractères, contrôlé sur les 18 lignes restantes :
--
--     KLƆKLƆ™ Prestige · « La Dépose »
--
-- `replace()` qui ne trouve pas sa chaîne rend le texte INCHANGÉ, sans erreur.
-- Le glissement des libellés a donc été un no-op silencieux, deux fois.
--
-- LA LEÇON : vérifier le catalogue ne suffit pas quand on réécrit des FACTURES.
-- Une pièce est un document du PASSÉ ; elle porte le nom qu'avait la prestation
-- LE JOUR OÙ ELLE A ÉTÉ ÉMISE, pas celui d'aujourd'hui. Il faut lire les
-- libellés dans `invoices`, jamais les déduire de `catalog_services`.
--
-- ── CE QUE CELUI-CI FAIT AUTREMENT ───────────────────────────────
-- Il ne cherche plus une chaîne exacte mais un MOTIF, qui absorbe d'un coup :
--   · la forme courte ET la forme longue — `(Le Shampoing )?` ;
--   · l'apostrophe courbe ’ ET l'apostrophe droite ' — `[’']` ;
--   · un éventuel suffixe de longueur (« · Court », « · Mi-Long »), qui
--     survit intact puisqu'on ne remplace que le motif, pas tout le libellé ;
--   · un libellé composite (« A + B ») — seule la part KLƆKLƆ™ est réécrite.
-- Ce qu'il écrit est la forme LONGUE, celle du catalogue d'aujourd'hui : c'est
-- elle que `alignerFacturesDuRituel` reproduira au prochain enregistrement.
--
-- ── L'ARGENT — inchangé par rapport à la décision du 17 août ──────
-- PAYÉE : le NOM seul. Le montant ne bouge pas. Une Dépose payée 18 000 F
--   restera à 18 000 F sous le nom Signature — c'est ce qui est entré.
-- NON PAYÉE : le prix du nouveau nom (12 000 / 8 000). Ces montants sont DÉJÀ
--   posés — la branche du `case` s'était bien ouverte au 0054, seul le libellé
--   avait manqué. On les repose à l'identique : l'opération est neutre et rend
--   ce fichier rejouable.
-- ═══════════════════════════════════════════════════════════════════

-- ── APERÇU — tous les libellés KLƆKLƆ™ existants. Ne modifie rien. ─
select l ->> 'label' as libelle, length(l ->> 'label') as taille,
       i.data ->> 'status' as statut, count(*) as lignes
from public.invoices i, jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
where l ->> 'label' like '%KL%KL%' or l ->> 'label' like '%Ancrage%'
   or l ->> 'label' like '%Dépose%' or l ->> 'label' like '%Souffle%'
group by 1, 2, 3 order by 4 desc;


begin;

create table if not exists public.repli_0054d_invoices
  (like public.invoices including all);
alter table public.repli_0054d_invoices enable row level security;

insert into public.repli_0054d_invoices
select * from public.invoices i
where exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
               where l ->> 'label' ~ $$KLƆKLƆ™ (Prestige|Signature) · (Le Shampoing )?« (La Dépose|L[’']Ancrage) »$$)
on conflict (id) do nothing;

update public.invoices i
set data = jsonb_set(i.data, '{lines}', (
      select jsonb_agg(
        case
          /* LA DÉPOSE devient L'ANCRAGE. Motif d'abord, argent ensuite. */
          when l ->> 'label' ~ $$KLƆKLƆ™ Prestige · (Le Shampoing )?« La Dépose »$$ then
            jsonb_set(
              case when i.data ->> 'status' = 'payée' then l
                   else jsonb_set(l, '{unitXof}', to_jsonb(12000)) end,
              '{label}',
              to_jsonb(regexp_replace(l ->> 'label',
                $$KLƆKLƆ™ Prestige · (Le Shampoing )?« La Dépose »$$,
                $$KLƆKLƆ™ Signature · Le Shampoing « L’Ancrage »$$)))
          /* L'ANCRAGE devient LE SOUFFLE. Même `case`, donc jamais en cascade :
             une Dépose passée ci-dessus ne repasse pas ici. */
          when l ->> 'label' ~ $$KLƆKLƆ™ Signature · (Le Shampoing )?« L[’']Ancrage »$$ then
            jsonb_set(
              case when i.data ->> 'status' = 'payée' then l
                   else jsonb_set(l, '{unitXof}', to_jsonb(8000)) end,
              '{label}',
              to_jsonb(regexp_replace(l ->> 'label',
                $$KLƆKLƆ™ Signature · (Le Shampoing )?« L[’']Ancrage »$$,
                $$KLƆKLƆ™ Essentiel · Le Shampoing « Le Souffle »$$)))
          else l
        end order by ord)
      from jsonb_array_elements(i.data -> 'lines') with ordinality t(l, ord)))
where exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
               where l ->> 'label' ~ $$KLƆKLƆ™ (Prestige|Signature) · (Le Shampoing )?« (La Dépose|L[’']Ancrage) »$$);

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lancer juste après, puis À NOUVEAU après Ctrl+Maj+R.
-- ═══════════════════════════════════════════════════════════════════

-- ① PLUS AUCUN ANCIEN NOM. Les deux premiers doivent valoir ZÉRO.
select
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data->'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Dépose%')                                  as reste_depose,
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data->'lines','[]'::jsonb)) l
    where l ->> 'label' ~ $$Prestige · (Le Shampoing )?« $$)              as reste_prestige_libelle,
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data->'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Souffle%')                                 as lignes_souffle,
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data->'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Ancrage%')                                 as lignes_ancrage;
--  Attendu : 0 · 0 · 258 (147 + 111) · 18 (les ex-Dépose devenues Ancrage).

-- ② L'ARGENT DES PIÈCES PAYÉES N'A PAS BOUGÉ. `avant` = `apres`.
select
  coalesce((select sum((l ->> 'unitXof')::numeric * coalesce((l ->> 'qty')::numeric, 1))
     from public.repli_0054d_invoices i, jsonb_array_elements(i.data -> 'lines') l
    where i.data ->> 'status' = 'payée'), 0)                              as avant,
  coalesce((select sum((l ->> 'unitXof')::numeric * coalesce((l ->> 'qty')::numeric, 1))
     from public.invoices i, jsonb_array_elements(i.data -> 'lines') l
    where i.id in (select id from public.repli_0054d_invoices)
      and i.data ->> 'status' = 'payée'), 0)                              as apres;

-- ③ CE QUI RESTE DE KLƆKLƆ™ EN BASE — la liste complète, à relire.
--    Seuls trois libellés doivent apparaître : Essentiel, Signature, Prestige
--    en forme longue — et AUCUN Prestige s'il ne s'en vend plus.
select l ->> 'label' as libelle, i.data ->> 'status' as statut, count(*) as lignes
from public.invoices i, jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
where l ->> 'label' like '%KL%KL%'
group by 1, 2 order by 1, 2;

-- ── ROLLBACK ─────────────────────────────────────────────────────
-- begin;
-- insert into public.invoices select * from public.repli_0054d_invoices
-- on conflict (id) do update set data = excluded.data;
-- commit;
