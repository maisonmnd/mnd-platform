-- ═══════════════════════════════════════════════════════════════════
-- 0109 — LA PLACE EST PRÊTE : une recrue attendue entre d'elle-même.
-- 22 septembre 2026.
--
-- POURQUOI. « Ça sert à quoi de confirmer un compte avec le code à six
-- chiffres et avoir toujours un compte non rattaché avec un maître qui doit
-- valider l'inscription ? » (Yéman). Les deux portes ne posent pas la même
-- question : le code prouve que l'adresse appartient bien à celle qui tape,
-- l'autorisation dit ce qu'elle a le droit de voir. Ce qui était de trop,
-- c'est l'ENTRE-DEUX : un compte confirmé qui n'atteint rien, parfois
-- jusqu'au lendemain, et une personne qui croit s'être trompée.
--
-- LE GESTE EST INVERSÉ. La direction prépare la fiche AVANT l'arrivée :
-- l'adresse de connexion (`compteMail`), le rôle d'accès (`roleDAcces`) et
-- la date d'invitation (`inviteeLe`). Quand la personne confirme son adresse,
-- elle se rattache elle-même à la fiche qui l'attend, et rien d'autre.
--
-- CE QUI REND CE RATTACHEMENT SÛR, et il faut le dire parce que c'est une
-- porte qui s'ouvre sans clic humain :
--   • l'adresse a été PROUVÉE par le code à six chiffres avant tout ;
--   • la fiche a été préparée par la DIRECTION, qui a choisi l'adresse ;
--   • une invitation PÉRIME au bout de 30 jours ;
--   • une fiche déjà entrée (`entreeLe`) ne rouvre plus ;
--   • DEUX fiches qui répondent à la même adresse n'ouvrent RIEN. Une
--     ambiguïté n'est jamais tranchée en faveur de celui qui entre ;
--   • le rôle `souverain` NE S'INVITE PAS. On peut inviter une gérante ou
--     une maîtresse ; donner les pleins pouvoirs reste un geste délibéré
--     depuis Accès & personnel, jamais l'effet d'un courrier.
--
-- QUATRE TEMPS DANS CE FICHIER :
--   ① la garde de `team` protège les deux champs qui ouvrent la porte ;
--   ② `fiche_qui_mattend()` dit quelle fiche attend l'appelant, ou rien ;
--   ③ la garde de `staff` laisse passer ce troisième cas légitime ;
--   ④ `rattacher_mon_compte()` est le seul geste offert à la recrue.
--
-- IDEMPOTENTE : tout est en create or replace. Rejouable sans dommage.
-- ═══════════════════════════════════════════════════════════════════


-- ── ① LA GARDE DE `team` COUVRE LES CHAMPS QUI OUVRENT UNE PORTE ──────
--
-- `team` est écrite par TOUT le personnel (0006 : policy `staff_all`, la
-- garde de 0091 ne restitue que la paie). Sans ce durcissement, une maîtresse
-- pourrait poser `roleDAcces` et `inviteeLe` sur une fiche de son choix et
-- faire entrer qui elle veut : l'invitation deviendrait une porte dérobée
-- ouverte à tout l'atelier, alors que l'autorisation est réservée au souverain
-- depuis 0073. On ajoute donc `roleDAcces` et `inviteeLe` à la liste des clés
-- que seule la direction écrit.
--
-- `entreeLe` reste libre, À DESSEIN : c'est `rattacher_mon_compte()` qui la
-- pose, et elle le fait APRÈS s'être inscrite dans `staff`, donc en tant que
-- membre du personnel et non de la direction. La protéger ferait annuler
-- silencieusement l'horodatage de sa propre arrivée. Ce n'est pas une clé qui
-- ouvre : la rouvrir ne sert à rien sans une invitation fraîche, qui, elle,
-- est protégée.
--
-- LE SQL EDITOR PASSE toujours (auth.uid() est nul hors session).
create or replace function public.team_garde_la_paie() returns trigger
language plpgsql set search_path = public as $$
declare
  cle text;
begin
  if auth.uid() is null or public.est_direction() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    foreach cle in array array['grille', 'contractType', 'salaireXof', 'email', 'compteMail',
                               'roleDAcces', 'inviteeLe'] loop
      if old.data ? cle then
        new.data := jsonb_set(new.data, array[cle], old.data -> cle, true);
      else
        new.data := new.data - cle;
      end if;
    end loop;
  else
    new.data := (new.data - 'grille' - 'contractType' - 'roleDAcces' - 'inviteeLe')
                || jsonb_build_object('salaireXof', 0);
  end if;

  return new;
end $$;


-- ── ② QUELLE FICHE M'ATTEND ? ─────────────────────────────────────────
--
-- Rend la fiche `team` préparée pour l'adresse de la session, ou NULL.
-- SECURITY DEFINER parce que `team` est illisible tant qu'on n'est pas du
-- personnel (0006) : c'est précisément le cas de celle qui arrive.
--
-- La correspondance reprend mot pour mot celle de `est_ma_fiche` (0090) et
-- celle de `adresseDe` côté écran : compte d'abord, contact en repli, en
-- minuscules et détouré. Deux façons de lire une adresse donneraient deux
-- personnes différentes.
create or replace function public.fiche_qui_mattend() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then
    jsonb_build_object(
      'id',         min(t.id),
      'nom',        min(t.data ->> 'name'),
      'roleDAcces', min(t.data ->> 'roleDAcces'),
      'branchId',   min(t.branch_id)
    )
  end
  from public.team t
  where auth.uid() is not null
    and lower(coalesce(nullif(trim(t.data ->> 'compteMail'), ''), trim(t.data ->> 'email')))
        = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    and coalesce(nullif(trim(t.data ->> 'compteMail'), ''), trim(t.data ->> 'email')) <> ''
    and t.data ->> 'roleDAcces' in ('gerant', 'maitre')
    and nullif(trim(t.data ->> 'inviteeLe'), '') is not null
    -- LA DATE SE COMPARE COMME DU TEXTE, SANS CONVERSION. Un `::date` sur une
    -- valeur écrite à la main lèverait une exception, et Postgres ne garantit
    -- pas d'avoir filtré l'adresse avant de tenter la conversion : UNE seule
    -- fiche mal saisie dans tout `team` ferait donc échouer l'arrivée de
    -- n'importe qui. Les dates ISO se rangent dans l'ordre alphabétique,
    -- cette comparaison est exacte et ne peut rien lever. Une valeur
    -- illisible tombe d'elle-même du mauvais côté du seuil, ce qui est le
    -- bon refus : `arrivee-pure.ts` fait pareil (vérification ⑭).
    and left(t.data ->> 'inviteeLe', 10) >= to_char(current_date - 30, 'YYYY-MM-DD')
    and nullif(trim(t.data ->> 'entreeLe'), '') is null
    and not exists (select 1 from public.staff s where s.user_id = auth.uid());
$$;

revoke all on function public.fiche_qui_mattend() from public;
grant execute on function public.fiche_qui_mattend() to authenticated;


-- ── ③ LA GARDE DE `staff` CONNAÎT UN TROISIÈME CAS LÉGITIME ───────────
--
-- 0073 ne laissait passer que l'amorçage du fondateur et le souverain. On
-- ajoute le rattachement de quelqu'un À SA PROPRE LIGNE, et seulement si une
-- fiche l'attend AVEC LE MÊME RÔLE que celui qu'on tente d'écrire. Le rôle
-- n'est donc jamais choisi par celui qui entre.
--
-- La policy `staff_admin_write` (0073) reste inchangée : une écriture directe
-- depuis le navigateur est toujours refusée. Ce cas n'est atteignable que par
-- `rattacher_mon_compte()`, qui est SECURITY DEFINER et contourne la RLS.
-- Deux filets, deux raisons différentes de refuser.
create or replace function public.staff_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fiche jsonb;
begin
  if (select count(*) from public.staff) = 0 then
    return new;                    -- amorçage du fondateur
  end if;
  if public.is_souverain() then
    return new;                    -- le souverain administre
  end if;

  if tg_op = 'INSERT' and new.user_id = auth.uid() then
    fiche := public.fiche_qui_mattend();
    if fiche is not null and new.role = (fiche ->> 'roleDAcces') then
      return new;                  -- une place préparée, et elle seule
    end if;
  end if;

  raise exception 'Écriture de la table staff réservée au souverain.';
end $$;

drop trigger if exists staff_guard_biu on public.staff;
create trigger staff_guard_biu
  before insert or update on public.staff
  for each row execute function public.staff_guard();


-- ── ④ LE SEUL GESTE OFFERT À LA RECRUE ────────────────────────────────
--
-- Rend un état, jamais une erreur, pour que l'écran puisse parler :
--   {'statut':'entree', 'nom':…, 'role':…}  elle est chez elle ;
--   {'statut':'deja'}                        elle était déjà du personnel ;
--   {'statut':'aucune'}                      personne ne l'attend, l'écran
--                                            explique alors la suite.
-- Une exception ferait croire à une panne là où il n'y a qu'une absence.
create or replace function public.rattacher_mon_compte() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fiche jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('statut', 'aucune');
  end if;

  if exists (select 1 from public.staff s where s.user_id = auth.uid()) then
    return jsonb_build_object('statut', 'deja');
  end if;

  fiche := public.fiche_qui_mattend();
  if fiche is null then
    return jsonb_build_object('statut', 'aucune');
  end if;

  insert into public.staff (user_id, name, role, rubrics)
  values (auth.uid(),
          nullif(trim(coalesce(fiche ->> 'nom', '')), ''),
          fiche ->> 'roleDAcces',
          public.default_rubrics(fiche ->> 'roleDAcces'));

  -- LES MÊMES BRANCHES QU'UNE AUTORISATION À LA MAIN (0007) : une invitation
  -- ne doit pas donner moins que le geste qu'elle remplace, sans quoi la
  -- recrue verrait un atelier vide sans comprendre pourquoi.
  insert into public.staff_branches (user_id, branch_id)
  select auth.uid(), b.id from public.branches b
  on conflict do nothing;

  -- L'HORODATAGE FERME LA PORTE DERRIÈRE ELLE : une fiche entrée ne rouvre
  -- plus, même si l'invitation n'a pas encore péri.
  update public.team
     set data = data || jsonb_build_object('entreeLe', to_char(now(), 'YYYY-MM-DD'))
   where id = fiche ->> 'id';

  return jsonb_build_object('statut', 'entree',
                            'nom', fiche ->> 'nom',
                            'role', fiche ->> 'roleDAcces');
end $$;

revoke all on function public.rattacher_mon_compte() from public;
grant execute on function public.rattacher_mon_compte() to authenticated;


-- ── CONTRÔLE ──────────────────────────────────────────────────────────
-- À lire après passage : trois fonctions posées, la garde de team couvre
-- sept clés, celle de staff connaît le troisième cas.
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('fiche_qui_mattend', 'rattacher_mon_compte', 'staff_guard', 'team_garde_la_paie')
  ) as fonctions_posees,
  (select count(*) from pg_trigger where tgname in ('staff_guard_biu', 'team_garde_la_paie_biu')
    and not tgisinternal) as gardes_en_place,
  (select position('roleDAcces' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'team_garde_la_paie') as paie_couvre_le_role;
