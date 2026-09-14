-- ═══════════════════════════════════════════════════════════════════
-- 0097 — LES MESSAGES ENTRENT DANS LA TRACE · 14 septembre 2026
--
-- « La correction ne cite pas l'original, l'original n'est pas barré, daté,
-- et juste réécrit » (Yéman).
--
-- C'EST UNE DÉCISION, ET ELLE A UNE CONDITION. Le fil du Trône portera
-- désormais le texte corrigé, sans rature et sans mention : un message qui
-- disait « 11 h » dira « 10 h », et rien à l'écran ne rappellera qu'il a
-- changé. C'est ce qui a été demandé, et c'est plus propre à lire.
--
-- MAIS UN MESSAGE RÉÉCRIT SANS TRACE EST UN MESSAGE EFFACÉ. La Maison vient
-- de se doter, en 0092, d'une trace signée par la BASE — pas par
-- l'application — précisément pour pouvoir répondre à « ce n'est pas moi qui
-- ai écrit cela ». Dix tables y sont entrées : les rendez-vous, les factures,
-- les règlements, les avoirs, les fiches, les dépenses, les caisses, les
-- transferts, le coffre, les entrées hors activité. PAS LES MESSAGES.
--
-- Sans cette migration, réécrire effacerait pour de bon, et l'on ne pourrait
-- plus dire ce que la cliente a REELLEMENT reçu — alors même que, sur son
-- téléphone, l'original est toujours là. Le fil de la Maison et le téléphone
-- de la cliente divergeraient, sans que rien ne garde la différence.
--
-- ELLE DOIT DONC PASSER AVANT QUE LA RÉÉCRITURE EXISTE, et c'est l'ordre dans
-- lequel elle est écrite ici.
--
-- CE QUE LA TRACE GARDERA : le texte d'avant, celui d'après, l'heure, et le
-- compte qui a corrigé. `trace_le_geste()` le fait déjà pour les dix autres
-- tables ; il suffit de lui donner celle-ci.
--
-- 0092 est passée le 14 septembre — `trace_le_geste()` existe.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'trace_le_geste'
  ) then
    raise exception 'trace_le_geste() est absente : passez d’abord 0092_la_trace_de_la_base.sql';
  end if;

  execute 'drop trigger if exists trace_le_geste on public.messages_wa';
  execute 'create trigger trace_le_geste after insert or update or delete '
       || 'on public.messages_wa for each row execute function public.trace_le_geste()';
end $$;

-- ── CONTRÔLE ───────────────────────────────────────────────────────
-- Onze tables tracées désormais, messages_wa comprise.
select c.relname as table_tracee
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and t.tgname = 'trace_le_geste'
  and n.nspname = 'public'
order by c.relname;
