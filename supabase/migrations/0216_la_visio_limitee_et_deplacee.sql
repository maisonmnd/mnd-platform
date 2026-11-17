-- ═══════════════════════════════════════════════════════════════════════════
-- 0216 — LA VISIO LIMITÉE ET DÉPLACÉE (17 novembre 2026, « La consultation en
-- affiches »)
--
-- « La visio reste gratuite, limitée : une par numéro tous les 90 jours, les
-- manquées comptent » ; « permets de modifier l'heure d'une visio qui a été
-- confirmée » (Yéman). La fonction `visio-salle` (2026-11-17-a) tient les
-- règles (src/shared/visio-pur.ts) ; la table `visios` (0209) reçoit ce qu'il
-- lui faut pour les juger, et rien d'autre :
--
--   ① DIX COLONNES. `deplacements` : combien de fois la cliente a changé
--      l'heure (deux au plus, réglable) ; `deplacee_le`, `deplacee_de` : quand,
--      et depuis quelle heure ; `annulee_le`, `annulee_par` : quand la visio a
--      été annulée, et par qui (« cliente » ou « maison ») ; `rdv_id` : son
--      rendez-vous du Carnet, quand la Maison les y inscrit ; `branch_id` : la
--      Maison de sa consultation ; `lien_etat` : son lien d'entrée est-il
--      parti sur WhatsApp, ou reste-t-il à envoyer à la main ; `suite_vue_le` :
--      elle a vu la suite sur sa page (le WhatsApp de la suite ne part plus).
--      `billet_hash` : l'empreinte du BILLET rendu à la réservation, un second
--      jeton qui montre l'heure, la change et l'annule, mais n'ouvre jamais la
--      salle (le lien d'entrée ne part que par WhatsApp).
--
--   ② L'HEURE D'UNE ANNULATION EST CELLE DU SERVEUR. Une visio annulée à
--      temps ne compte pas dans la limite : « à temps » se juge sur
--      `annulee_le`, que le déclencheur pose à l'horloge de la base, quel que
--      soit le poste qui annule. Une session de l'équipe : « maison » ; la
--      fonction écrit « cliente » elle-même. Remise à « réservée », la marque
--      s'efface.
--
-- Aucune donnée existante ne bouge : les visios d'avant gardent `deplacements`
-- à zéro, et une annulation d'avant, sans heure connue, ne compte pas (le
-- doute profite à la cliente, `annuleeATemps`).
--
-- Rejouable : `add column if not exists`, `create or replace`, `drop … if exists`.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ⟨0216⟩
-- ── ① LES COLONNES ────────────────────────────────────────────────────
alter table public.visios add column if not exists deplacements  int not null default 0;
alter table public.visios add column if not exists deplacee_le   timestamptz;
alter table public.visios add column if not exists deplacee_de   timestamptz;
alter table public.visios add column if not exists annulee_le    timestamptz;
alter table public.visios add column if not exists annulee_par   text;
alter table public.visios add column if not exists rdv_id        text;
alter table public.visios add column if not exists branch_id     text;
alter table public.visios add column if not exists lien_etat     text;
alter table public.visios add column if not exists suite_vue_le  timestamptz;
alter table public.visios add column if not exists billet_hash   text;

alter table public.visios drop constraint if exists visios_deplacements_positifs;
alter table public.visios add constraint visios_deplacements_positifs check (deplacements >= 0);
alter table public.visios drop constraint if exists visios_annulee_par_connu;
alter table public.visios add constraint visios_annulee_par_connu check (annulee_par is null or annulee_par in ('cliente', 'maison'));
alter table public.visios drop constraint if exists visios_lien_etat_connu;
alter table public.visios add constraint visios_lien_etat_connu check (lien_etat is null or lien_etat in ('whatsapp', 'a-envoyer', 'a-la-main'));

-- La limite lit les visios d'un numéro sur quatre-vingt-dix jours.
create index if not exists visios_par_numero_et_debut on public.visios (numero, debut);

-- ── ② L'HEURE DE L'ANNULATION, POSÉE PAR LA BASE ──────────────────────
create or replace function public.la_visio_dit_quand_elle_est_annulee() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.statut = 'annulée' and old.statut is distinct from 'annulée' then
    new.annulee_le := now();
    -- La fonction (clé de service, sans session) dit « cliente » elle-même ;
    -- une session de l'équipe, c'est la Maison.
    if new.annulee_par is null or new.annulee_par is not distinct from old.annulee_par then
      new.annulee_par := case when auth.uid() is null then 'cliente' else 'maison' end;
    end if;
  elsif new.statut <> 'annulée' and old.statut = 'annulée' then
    new.annulee_le := null;
    new.annulee_par := null;
  end if;
  return new;
end;
$$;

drop trigger if exists la_visio_dit_quand_elle_est_annulee on public.visios;
create trigger la_visio_dit_quand_elle_est_annulee
  before update on public.visios
  for each row execute function public.la_visio_dit_quand_elle_est_annulee();
-- ⟨/0216⟩

commit;


-- ── Contrôle ──────────────────────────────────────────────────────────
-- Dix colonnes attendues.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'visios'
   and column_name in ('deplacements', 'deplacee_le', 'deplacee_de', 'annulee_le', 'annulee_par', 'rdv_id', 'branch_id', 'lien_etat', 'suite_vue_le', 'billet_hash')
 order by column_name;
-- Deux déclencheurs attendus : celui de 0212 et celui-ci.
select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.visios'::regclass and not tgisinternal order by tgname;
