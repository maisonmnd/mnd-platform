-- ═══════════════════════════════════════════════════════════════════════════
-- 0209 — LA VISIO DE QUINZE MINUTES (13 novembre 2026, la Consultation, lot 3)
--
-- « Prendre le RDV pour la visio, au bout de 15 min un minuteur se met en
-- marche les 120 dernières secondes et coupe la conversation à la fin »
-- (Yéman). Trois pièces, rien d'autre :
--
--   ① LA TABLE `visios`. Une ligne par visio réservée : le créneau (début et
--      fin, fin = début + 15 min), la cliente (nom, numéro, ses huit derniers
--      chiffres), l'EMPREINTE du jeton de son lien d'entrée (SHA-256 : la
--      base ne peut pas rendre le jeton), la salle chez Daily, l'état et le
--      résumé de la Maison. Un seul quart d'heure ne se prend qu'une fois
--      (index unique sur `debut`, hors visios annulées).
--      ÉCRITE par la fonction `visio-salle` (clé de service) pour la
--      réservation ; LUE et MODIFIÉE par l'équipe (`is_staff()`) : l'état et
--      le résumé. Aucune règle pour le public : il passe par la fonction.
--
--   ② LE COMPARTIMENT `temoins`. Les photos des locks témoins faites à la
--      consultation privée, privé, lu et écrit par l'équipe seule.
--
--   ③ LES RÉGLAGES `mnd_visio` (document) : les jours et les quarts d'heure
--      ouverts. Écrits par la direction seule : `cles_ecrites_par_la_direction()`
--      (0208) s'allonge de cette clé. Lus par l'équipe (règles de 0130) et par
--      la fonction ; le site ne les lit pas, il demande les créneaux.
--
-- Rejouable : `if not exists`, `create or replace`, `drop … if exists`.
-- Aucune donnée existante ne bouge, aucune table `repli_` nécessaire.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ⟨0209⟩
-- ── ① LA TABLE `visios` ───────────────────────────────────────────────
create table if not exists public.visios (
  id               text primary key,
  consultation_id  text,
  debut            timestamptz not null,
  fin              timestamptz not null,
  nom              text not null,
  telephone        text not null,
  numero           text not null,
  jeton_hash       text not null,
  statut           text not null default 'réservée'
                   check (statut in ('réservée', 'annulée', 'tenue', 'manquée')),
  salle            text,
  salle_url        text,
  resume           jsonb,
  cree_le          timestamptz not null default now(),
  maj_le           timestamptz not null default now()
);

create unique index if not exists visios_un_quart_d_heure on public.visios (debut) where statut <> 'annulée';
create index if not exists visios_par_numero on public.visios (numero, fin);
create index if not exists visios_par_consultation on public.visios (consultation_id);

alter table public.visios enable row level security;

drop policy if exists visios_l_equipe_lit on public.visios;
create policy visios_l_equipe_lit on public.visios for select to authenticated
  using (public.is_staff());

drop policy if exists visios_l_equipe_ecrit on public.visios;
create policy visios_l_equipe_ecrit on public.visios for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ── ② LE COMPARTIMENT `temoins` ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('temoins', 'temoins', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists temoins_lire on storage.objects;
create policy temoins_lire on storage.objects for select to authenticated
  using (bucket_id = 'temoins' and public.is_staff());

drop policy if exists temoins_deposer on storage.objects;
create policy temoins_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'temoins' and public.is_staff());

drop policy if exists temoins_retirer on storage.objects;
create policy temoins_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'temoins' and public.is_staff());

-- ── ③ LES RÉGLAGES, ÉCRITS PAR LA DIRECTION ──────────────────────────
create or replace function public.cles_ecrites_par_la_direction() returns text[]
language sql immutable as $$
  select array['mnd_besoins', 'mnd_visio']::text[]
$$;
-- ⟨/0209⟩

commit;


-- ── Contrôle ──────────────────────────────────────────────────────────
select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'visios' order by policyname;
select id, public, file_size_limit from storage.buckets where id = 'temoins';
select public.cles_ecrites_par_la_direction();
