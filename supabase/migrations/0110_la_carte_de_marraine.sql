-- ═══════════════════════════════════════════════════════════════════
-- 0110 — LA CARTE DE MARRAINE : SES CHAMPS NE S'ÉCRIVENT QU'AU TRÔNE
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--        28 septembre 2026, maquette « La carte de marraine MND » validée.
--
-- Chaque fiche porte désormais quatre champs du parrainage :
--   codeParrain   son code (PRENOM-XXX), posé par le Trône ;
--   carteModele   le modèle de sa carte (indigo, ivoire, cuivre) ;
--   parrainage    le résumé de ses filleules (prénom, état, date) ;
--   soinsOfferts  les soins que la Maison lui offre, et leur usage.
--
-- La cliente peut écrire sa propre ligne (cli_upd, 0027 : son adresse, ses
-- préférences, depuis Ma Couronne). Sans garde, elle pourrait s'offrir un
-- soin, ou prendre le code d'une autre. Ce déclencheur RÉIMPOSE trois de
-- ces champs depuis la ligne existante à toute écriture qui ne vient pas du
-- personnel. `carteModele` reste libre : choisir sa couleur n'engage rien.
--
-- CE N'EST PAS LE RÉARMEMENT DE `clients_protege_tarif` : le numéro 0037
-- lui reste réservé (voir REPRENDRE). Celui-ci est ÉTROIT et porte la leçon
-- du 10 août : `auth.uid()` vide (l'éditeur SQL, la clé de service des
-- fonctions Edge) = confiance, sinon les réparations passent pour suspectes.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.clients_protege_parrainage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- L'éditeur SQL et les fonctions Edge (clé de service) : confiance.
  if auth.uid() is null then return new; end if;
  -- Le personnel tient la carte, le résumé et les soins.
  if public.is_staff() then return new; end if;

  if tg_op = 'INSERT' then
    -- Une fiche créée par la cliente naît sans code ni soin : le Trône les pose.
    new.data := new.data - 'codeParrain' - 'parrainage' - 'soinsOfferts';
    return new;
  end if;

  new.data := (new.data - 'codeParrain' - 'parrainage' - 'soinsOfferts')
              || jsonb_strip_nulls(jsonb_build_object(
                   'codeParrain', old.data -> 'codeParrain',
                   'parrainage', old.data -> 'parrainage',
                   'soinsOfferts', old.data -> 'soinsOfferts'));
  return new;
end $$;

drop trigger if exists clients_protege_parrainage on public.clients;
create trigger clients_protege_parrainage
  before insert or update on public.clients
  for each row execute function public.clients_protege_parrainage();

-- La vérification, en lignes de résultat (l'éditeur n'affiche pas les NOTICE) :
select tgname as declencheur, tgenabled as actif
from pg_trigger
where tgrelid = 'public.clients'::regclass and tgname = 'clients_protege_parrainage';
