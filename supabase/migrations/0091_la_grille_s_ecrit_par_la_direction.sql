-- ═══════════════════════════════════════════════════════════════════
-- 0091 — LA GRILLE ET LA PAIE S'ÉCRIVENT PAR LA DIRECTION · 13 septembre 2026
--
-- « Oui, migration 0091 » (Yéman), à la question : faut-il fermer la grille
-- de prix dans la base, pour qu'une prestataire ne puisse pas la modifier
-- elle-même ?
--
-- LE TROU QU'ELLE FERME. La table `team` (les fiches du personnel) s'écrit
-- par tout le personnel depuis 0006. L'écran ne montre la grille qu'à la
-- direction, mais une règle tenue par l'écran seul se contourne par l'API :
-- une prestataire aurait pu relever ses propres prix avant l'acceptation de
-- sa facture (0090), son salaire, ou changer son type de contrat.
--
-- CE QUI EST GARDÉ, sur une fiche existante, pour qui n'est pas direction :
--   · `grille`, `contractType`, `salaireXof` : ce qui fait la paie ;
--   · `email`, `compteMail` : ce qui rattache un compte à une fiche, et donc
--     ouvre une facture (`est_ma_fiche`, 0090).
-- Une fiche NOUVELLE écrite hors direction naît sans grille, sans type de
-- contrat et à salaire zéro.
--
-- ON REMET, ON NE REFUSE PAS. La synchronisation pousse la fiche entière :
-- refuser la ligne perdrait aussi ce qu'une personne a légitimement changé
-- ailleurs sur la fiche, et un poste en retard d'un rafraîchissement
-- tomberait en échec pour une modification qu'il n'a pas faite. Le
-- déclencheur remet donc les champs gardés à leur valeur en base ; l'écho du
-- fil en direct réaligne l'écran.
--
-- UN UPSERT PASSE PAR LES DEUX PORTES. `insert … on conflict do update` fait
-- d'abord jouer le déclencheur d'insertion sur la ligne proposée, puis celui
-- de mise à jour : c'est ce dernier qui restitue les valeurs en base.
--
-- LE SQL EDITOR PASSE (aucun compte connecté) : les réparations à la main
-- restent possibles. La clé publique, elle, n'écrit pas `team` (0006).
--
-- `est_direction()` vient de 0089 (déjà passée).
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.team_garde_la_paie() returns trigger
language plpgsql set search_path = public as $$
declare
  cle text;
begin
  if auth.uid() is null or public.est_direction() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    foreach cle in array array['grille', 'contractType', 'salaireXof', 'email', 'compteMail'] loop
      if old.data ? cle then
        new.data := jsonb_set(new.data, array[cle], old.data -> cle, true);
      else
        new.data := new.data - cle;
      end if;
    end loop;
  else
    new.data := (new.data - 'grille' - 'contractType') || jsonb_build_object('salaireXof', 0);
  end if;

  return new;
end $$;

drop trigger if exists team_garde_la_paie_biu on public.team;

create trigger team_garde_la_paie_biu
  before insert or update on public.team
  for each row execute function public.team_garde_la_paie();
