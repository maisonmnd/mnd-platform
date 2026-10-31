# Mise en ligne

Depuis le 31 octobre 2026, Yéman ne colle plus rien dans Supabase et ne valide
plus les publications au sélecteur. Ce que la session écrit, elle le met en
ligne elle-même, aussitôt commité et vérifié :

- les fonctions Edge ;
- les fichiers SQL ;
- les secrets ;
- les réglages du Trône en base ;
- la publication du Trône et du site public.

Plus jamais de dossier « A recoller » sur le bureau, plus de question
« Je publie ? ».

La session confie ce travail à un agent dès qu'elle a commité. Le brief tient
en une phrase : « Lis docs/MISE-EN-LIGNE.md et mets en ligne, au commit <sha> :
fonctions …, SQL …, secrets …, réglages …, sites … ; bancs : … ».

L'agent ne pose aucune question à Yéman. Il rend compte à la session, qui le
lui dira.

## L'outil

`node scripts/mise-en-ligne.mjs` passe par l'API de gestion Supabase. La clé
est lue dans `~/.supabase/access-token`, posée une fois par Yéman avec
« Poser la cle Supabase » sur son bureau.

| Commande | Ce qu'elle fait |
| --- | --- |
| `etat` | Chaque fonction : sa version en ligne, et si elle est à jour ou en retard sur le dépôt. |
| `fonction <nom> … --commit <sha>` | Déploie le fichier **commité**. Garde son `verify_jwt` ; une fonction nouvelle exige `--jwt oui\|non`. Relit ensuite la version que dit le serveur. |
| `sql <fichier> --commit <sha>` | Passe le fichier. `--destructif` s'emploie seulement après une table `repli_` de ce qui va partir, avec la RLS activée aussitôt. |
| `requete "<select …>"` | Lecture seule, pour vérifier avant et après. |
| `secret <NOM>` | Pose un secret. La valeur arrive par l'entrée standard : `printf '%s' "$valeur" \| node scripts/mise-en-ligne.mjs secret NOM`. Jamais en argument, jamais à l'écran. |
| `secrets` | Les noms des secrets posés. |

Chaque geste s'inscrit dans `~/.supabase/journal-mise-en-ligne.txt`.

Si l'outil répond « aucune clé Supabase sur ce poste », il faut s'arrêter et le
dire à Yéman : elle n'a qu'à double-cliquer une fois sur le fichier du bureau.
Ne jamais chercher la clé ailleurs.

## L'ordre

1. **Bancs.** Faire passer :
   - ceux que la session nomme ;
   - pour whatsapp-automate, `node scripts/verifie-l-automate-wa.mjs` ;
   - pour les fonctions construites (assistant-maison, reception-wa,
     tri-des-messages, variantes-wa), `node scripts/assistant-maison-serveur.mjs --verifie`.

   Une preuve `--prouve` ne tourne jamais dans l'arbre commun, seulement dans une
   copie propre détachée. Un seul banc rouge, et rien ne part.
2. **SQL d'abord**, dans l'ordre des numéros, puisque le code qui suit peut en
   dépendre. Vérifier l'effet avec une `requete`. Ne jamais relancer une
   migration déjà passée (voir `docs/REPRENDRE.md`).
3. **Secrets**, s'il y en a.
4. **Fonctions.** Le rapport doit dire « le serveur dit … » ou « pas de
   contrôle de santé ». Au moindre écart de version, on s'arrête.
5. **Réglages du Trône**, c'est-à-dire ce qu'on lui demandait de « cliquer » ou
   d'« appliquer ». Ils passent par SQL sur les documents concernés, après une
   table `repli_` (RLS comprise) de chaque ligne touchée, puis une relecture.
6. **Publication** des sites demandés, depuis une copie propre détachée au
   commit :
   1. `git worktree add --detach <brouillon>/publier <sha>` ;
   2. une jonction `node_modules` (PowerShell
      `New-Item -ItemType Junction -Path <copie>\node_modules -Target <dépôt>\node_modules`),
      puis la copie de `.env.local` ;
   3. dans la copie, `node scripts/build-sites.mjs`, puis
      `node scripts/publie.mjs <sites>` (sans `MND_REFONDE`) ;
   4. la preuve : `node scripts/verifie-le-servi.mjs dist-sites/<site> <adresse servie>` ;
   5. retirer la copie (`git worktree remove --force`) et la jonction.

   Prévenir les sessions sœurs avant de publier, puis leur écrire « servi ».
7. **Rapport**, court, en français, pour Yéman :
   - ce qui est en ligne (version, numéro chez Supabase) ;
   - le build publié et le compte d'octets identiques ;
   - ce qui n'est pas parti, et pourquoi ;
   - ce qui ne se fait qu'à la main : un essai réel depuis un téléphone, un
     modèle à faire approuver chez Meta.

## Les règles qui tiennent toujours

- **Dépôt partagé.** Les autres sessions travaillent dans le même dépôt. Donner
  des chemins git explicites, jamais `git add -A`.
- **Secrets.** Une clé, un jeton ou un mot de passe ne s'affiche jamais. Il
  n'entre ni dans le dépôt ni dans un message.
- **Commits.** Initiales seulement, jamais le nom d'une cliente.
- **Données de clientes.** Ce que rend `requete --montre` peut en contenir : on
  le lit, mais on ne le recopie ni dans le dépôt ni dans un rapport.
- **Rien d'effacé sans repli.** Rien à la corbeille du Drive, et rien de
  supprimé en base sans `repli_` au préalable.
- **Retour en arrière d'abord.** Si quelque chose casse après une mise en ligne,
  remettre en ligne la version précédente
  (`fonction <nom> --commit <sha précédent>`), puis seulement enquêter.
