-- ═══════════════════════════════════════════════════════════════════════════
-- 0241 · LES FRAIS MTN AJOUTÉS POUR LA CLIENTE · 20 novembre 2026
--
-- « Ajoute le pourcentage de 1.6% sur les paiements de MTN API » (Yéman).
-- Comme Tap & Go, la cliente qui règle par MTN (compte de collecte, fonction
-- `collecte-mtn`) paie 1,6 % de plus, sur tout ce qui passe chez MTN (le
-- reste de sa pièce et son merci), au franc supérieur (`fraisAjoutesMtn`,
-- collecte-mtn-pur.ts). Le 11 novembre (0200), la Maison gardait les frais :
-- la demande valait exactement le reste et le merci.
--
-- Ce lot :
--   · `frais_ajoutes_xof` : les frais ajoutés de la demande (0 pour l'essai,
--     et pour les demandes d'avant) ;
--   · la règle du registre devient « montant = reste + merci + frais
--     ajoutés » ; l'essai n'en porte jamais.
-- Une demande écrite par l'ancienne fonction (sans la colonne) prend 0 et
-- tient toujours : la fonction peut se mettre en ligne APRÈS ce fichier.
--
-- Rejouable.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.collectes_mtn
  add column if not exists frais_ajoutes_xof integer not null default 0;

alter table public.collectes_mtn drop constraint if exists collectes_mtn_frais_ajoutes;
alter table public.collectes_mtn
  add constraint collectes_mtn_frais_ajoutes check (frais_ajoutes_xof between 0 and 40000);

alter table public.collectes_mtn drop constraint if exists collectes_mtn_genre;
alter table public.collectes_mtn add constraint collectes_mtn_genre check (
  (genre = 'reglement' and origine in ('lien', 'comptoir') and rdv_id is not null and piece_id is not null
    and reste_xof >= 1 and montant_xof = reste_xof + pourboire_xof + frais_ajoutes_xof)
  or (genre = 'essai' and origine = 'essai' and rdv_id is null and piece_id is null and montant_xof <= 500
    and reste_xof = 0 and pourboire_xof = 0 and frais_ajoutes_xof = 0)
);

commit;
