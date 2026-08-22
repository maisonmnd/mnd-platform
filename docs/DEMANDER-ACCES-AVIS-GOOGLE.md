# Demander l'accès aux avis Google — la démarche, pas à pas

**Décision du 22 août 2026.** Yéman : construire l'écran seulement UNE FOIS
l'accès obtenu. Rien n'est écrit côté Trône tant que Google n'a pas répondu —
ce document est la seule chose à faire d'ici là, et personne ne peut la faire
à la place de la Maison.

**Ce qu'on cherche :** lire les avis de la fiche MND et y répondre depuis
Le Trône. Une seule porte existe : l'API **Google Business Profile**, sur son
ancien point d'entrée v4 (`mybusiness.googleapis.com/v4/…/reviews`). Les API
récentes de Google — fiche, établissements, statistiques — ne couvrent PAS les
avis. L'API Places, elle, ne rend que cinq avis en lecture seule, sans réponse
possible : elle ne fait pas un écran.

**Ce qui bloque :** l'API n'est pas ouverte par défaut. Un projet neuf a un
quota de ZÉRO et reçoit un refus. Il faut la demander, et Google répond à son
rythme — quelques jours à quelques semaines. C'est le seul délai qu'on ne peut
pas raccourcir.

## Avant de commencer

- La fiche MND doit être **vérifiée** sur Google.
- Le compte Google utilisé doit en être **propriétaire ou gestionnaire**.
  Vérifier sur business.google.com que le compte de la Maison y figure bien —
  un compte simple contributeur ne pourra pas répondre.

## Étape 1 — Le projet Google Cloud

1. console.cloud.google.com → **Nouveau projet** → nom : `MND — Le Trône`.
2. Noter le **numéro de projet** (project number) — il est demandé à l'étape 3.

## Étape 2 — Activer les API

Dans le projet, **API et services → Bibliothèque**, activer les quatre :

- **Google My Business API** (celle des avis — la v4)
- **My Business Account Management API** (pour trouver le compte)
- **My Business Business Information API** (pour trouver l'établissement)
- **My Business Notifications API** (pour être prévenu d'un avis neuf plutôt
  que d'aller le chercher toutes les heures)

Si « Google My Business API » ne se trouve pas dans la bibliothèque, c'est
normal : elle n'apparaît qu'une fois l'accès accordé (étape 3). Activer les
trois autres et continuer.

## Étape 3 — La demande d'accès (l'étape qui attend)

Formulaire officiel : chercher **« Google Business Profile APIs access
request »** dans la documentation Google (developers.google.com/my-business).
Il demande :

- le **numéro de projet** de l'étape 1 ;
- l'**adresse e-mail** du compte gestionnaire de la fiche ;
- le **nom de l'entreprise** et son site ;
- **ce qu'on veut en faire** — répondre franchement : *gérer et répondre aux
  avis clients de notre propre établissement depuis notre logiciel de gestion
  interne*. C'est un usage propriétaire d'un seul établissement, le cas le plus
  simple à accorder. Ne pas laisser entendre qu'on revend un service à des
  tiers : la demande passe alors sous un examen bien plus long.

Google répond par e-mail. **Tant que la réponse n'est pas arrivée, il n'y a
rien à faire d'autre.**

## Étape 4 — L'autorisation (une seule fois, quand l'accès est accordé)

1. Dans le projet Cloud : **Identifiants → Créer → ID client OAuth**, type
   *Application Web*. Relever l'**ID client** et le **secret client**.
2. Écran de consentement : type **externe**, portée demandée
   `https://www.googleapis.com/auth/business.manage`.
3. Yéman donne son accord UNE fois, avec le compte gestionnaire de la fiche.
   Cela rend un **jeton de renouvellement** permanent.

## Étape 5 — Les clés au coffre

Trois secrets Supabase, jamais dans le code (le dépôt est public) :

- `GBP_CLIENT_ID`
- `GBP_CLIENT_SECRET`
- `GBP_REFRESH_TOKEN`

La clé Anthropic est **déjà posée** (`ANTHROPIC_API_KEY`, elle sert à
`suggest-client`) : la moitié IA ne demande aucune démarche.

## Ce qui se construit alors — pour mémoire

Un écran **Avis** dans Le Trône : les avis du plus récent au plus ancien, ceux
sans réponse en tête, la note et l'auteur, et le lien vers la fiche cliente
quand le nom correspond. L'IA lit l'avis ET ce contexte (ce qu'elle est venue
faire, depuis quand elle vient), propose une réponse dans la voix de la Maison.

**L'IA PROPOSE, LA SOUVERAINE VALIDE** — arbitrage de Yéman, 22 août 2026.
Rien ne part sans lecture. Une réponse publique porte le nom de la Maison, et
un avis à une étoile mal répondu se lit par tout le monde, pour toujours.

Deux fonctions Edge, sur le modèle exact de `suggest-client` (garde personnel
connecté, clé côté serveur) : une qui va chercher les avis et poste la réponse
validée, une qui rédige la proposition. Une maquette HTML à valider avant,
comme pour tout nouveau module du Trône.
