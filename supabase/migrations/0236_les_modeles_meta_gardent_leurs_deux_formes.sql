-- ═══════════════════════════════════════════════════════════════════════════
-- 0236 · LES MODÈLES CHEZ META GARDENT LEURS DEUX FORMES · 18 novembre 2026
--
-- Le document `mnd_modeles_meta` porte deux choses : la LISTE que rend Meta
-- à « Relire chez Meta » (fonction `modeles-meta` : `modeles` en tableau,
-- `lusLe`, `version`) et les NOTES de la direction (« Ce que ça rapporte ›
-- Ses modèles chez Meta » : `notes`, `parQui`, `le` ; avant ce jour,
-- `modeles` en objet). Chacun de ses deux écrivains réécrivait le document
-- entier et effaçait l'autre : une seule note remplaçait la liste, et
-- `demande-submit` ne lisait plus `rdv_a_confirmer` « APPROVED » ; le
-- rendez-vous en attente s'éteignait sans bruit, les places du site
-- naissaient confirmées jusqu'au prochain « Relire chez Meta ».
--
-- Le code d'aujourd'hui ne touche plus que sa moitié
-- (src/shared/modeles-meta-pur.ts, recopié dans les deux fonctions). La base,
-- elle, garde l'autre moitié quand un écrivain d'avant l'oublie : un Trône
-- resté en cache sur un poste, une copie locale en retard, une fonction pas
-- encore remise en ligne.
--
-- CE QUE FAIT 0236, et rien d'autre : un déclencheur AVANT la mise à jour de
-- la seule ligne `mnd_modeles_meta` (un upsert passe par là quand la ligne
-- existe) :
--   1. un registre écrit à l'ancienne (`modeles` en objet) devient des notes,
--      AJOUTÉES aux notes d'avant ;
--   2. une écriture sans liste, ou avec une liste plus ancienne que celle de
--      la base (`lusLe`), garde la liste d'avant, avec sa date et sa version ;
--   3. une écriture sans notes, ou une relecture chez Meta (une liste plus
--      récente), garde les notes d'avant ; les siennes passent devant.
-- Une note retirée (« à déposer ») par le Trône d'aujourd'hui reste retirée :
-- il écrit toutes ses notes, sans celle-là, avec la liste qu'il a lue.
--
-- Aucune donnée ne bouge au passage : la ligne d'aujourd'hui (la liste seule)
-- est déjà dans la forme d'aujourd'hui. Rejouable : « create or replace »,
-- « drop trigger if exists ». Essai à blanc : supabase/essai_0236_a_blanc.sql.
-- Banc : node scripts/verifie-les-modeles-chez-meta.mjs (avec BANC_PGLITE).
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0236⟩
create or replace function public.modeles_meta_gardent_leurs_deux_formes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ancien      jsonb := case when jsonb_typeof(old.data) = 'object' then old.data else '{}'::jsonb end;
  neuf        jsonb := new.data;
  notes_avant jsonb := '{}'::jsonb;
begin
  -- Ce qui n'est pas un objet ne se lit pas : la ligne s'écrit telle quelle.
  if jsonb_typeof(neuf) is distinct from 'object' then
    return new;
  end if;

  -- Les notes d'avant, sous l'une ou l'autre forme.
  if jsonb_typeof(ancien->'modeles') = 'object' then
    notes_avant := ancien->'modeles';
  end if;
  if jsonb_typeof(ancien->'notes') = 'object' then
    notes_avant := notes_avant || (ancien->'notes');
  end if;

  -- 1. Le registre d'avant le 18 novembre 2026 : ses notes s'ajoutent.
  if jsonb_typeof(neuf->'modeles') = 'object' then
    neuf := (neuf - 'modeles') || jsonb_build_object('notes',
      notes_avant
      || case when jsonb_typeof(neuf->'notes') = 'object' then neuf->'notes' else '{}'::jsonb end
      || (neuf->'modeles'));
  end if;

  -- 2. La liste de Meta : sans liste, ou plus ancienne, celle d'avant reste.
  if jsonb_typeof(ancien->'modeles') = 'array'
     and (jsonb_typeof(neuf->'modeles') is distinct from 'array'
          or coalesce(neuf->>'lusLe', '') collate "C" < coalesce(ancien->>'lusLe', '') collate "C") then
    neuf := (neuf - 'modeles' - 'lusLe' - 'version')
      || jsonb_build_object('modeles', ancien->'modeles')
      || jsonb_strip_nulls(jsonb_build_object('lusLe', ancien->'lusLe', 'version', ancien->'version'));
  end if;

  -- 3. Les notes : sans notes, ou à une relecture chez Meta, celles d'avant restent.
  if jsonb_typeof(neuf->'notes') is distinct from 'object'
     or coalesce(neuf->>'lusLe', '') collate "C" > coalesce(ancien->>'lusLe', '') collate "C" then
    neuf := neuf || jsonb_build_object('notes',
      notes_avant
      || case when jsonb_typeof(neuf->'notes') = 'object' then neuf->'notes' else '{}'::jsonb end);
    if neuf->'parQui' is null and ancien->'parQui' is not null then
      neuf := neuf || jsonb_build_object('parQui', ancien->'parQui');
    end if;
    if neuf->'le' is null and ancien->'le' is not null then
      neuf := neuf || jsonb_build_object('le', ancien->'le');
    end if;
  end if;

  new.data := neuf;
  return new;
end $$;

drop trigger if exists modeles_meta_gardent_leurs_deux_formes on public.documents;
create trigger modeles_meta_gardent_leurs_deux_formes
  before update of data on public.documents
  for each row
  when (new.key = 'mnd_modeles_meta')
  execute function public.modeles_meta_gardent_leurs_deux_formes();
-- ⟨/0236⟩


-- ── Contrôle ──────────────────────────────────────────────────────────
-- Attendu : true (la garde est posée), « array » (la liste de Meta est là),
-- true (rdv_a_confirmer s'y lit APPROVED).
select
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'documents'
            and t.tgname = 'modeles_meta_gardent_leurs_deux_formes' and not t.tgisinternal) as la_garde_est_posee,
  (select jsonb_typeof(d.data->'modeles') from public.documents d where d.key = 'mnd_modeles_meta') as la_liste,
  (select exists (select 1 from jsonb_array_elements(case when jsonb_typeof(d.data->'modeles') = 'array' then d.data->'modeles' else '[]'::jsonb end) m
                   where m->>'nom' = 'rdv_a_confirmer' and m->>'etat' = 'APPROVED')
     from public.documents d where d.key = 'mnd_modeles_meta') as attente_approuvee;
