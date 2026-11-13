# Le modèle d'ouverture des envois programmés

Écrit le 13 novembre 2026. Maquette `public/maquette-les-envois-programmes.html`,
validée le même jour (« construis »), choix « fenêtre = porte » : quand la
cliente n'a pas écrit depuis 24 heures, WhatsApp n'accepte plus qu'un modèle
approuvé par Meta. La Maison envoie d'abord ce modèle d'ouverture ; le message
programmé (et sa pièce jointe) part dès qu'elle répond.

La règle qui l'écrit vit dans `src/shared/envois-programmes-pur.ts`
(`MODELE_D_OUVERTURE`, `CORPS_D_OUVERTURE`, `composantsDOuverture`), recopiée
dans le facteur `supabase/functions/envois-partent`. La porte d'Opale le
connaît (`REGISTRE_DES_MODELES`, famille `ouverture`) : jamais deux fois à la
même fiche en vingt heures, la civilité de la fiche corrigée au `{{1}}`. Le
banc `scripts/verifie-les-envois-programmes.mjs` tient ce document, la règle
et le facteur ensemble. À reporter dans le document vivant des modèles
(Claude Docs) le jour du dépôt chez Meta.

## `un_message_pour_vous`

| Champ | À saisir chez Meta |
| --- | --- |
| Nom | `un_message_pour_vous` |
| Catégorie | Utilitaire (UTILITY) |
| Langue | Français (fr) |
| En-tête | aucun |
| Corps | voir ci-dessous, mot pour mot |
| Pied de page | mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là |
| Boutons | une réponse rapide : « Lire le message » |

Corps :

> Bonjour {{1}}, la Maison MND a un message pour vous. Touchez « Lire le message », ou répondez simplement, pour le recevoir ici.

Variable, avec l'exemple à donner à Meta :

- `{{1}}` l'appel : la civilité notée et le prénom d'usage en entier
  (`appelDe`), ou le prénom seul quand la civilité n'est pas notée.
  Exemple : `Mme Awa`.

Jamais un montant, jamais un numéro de pièce, jamais le mot « code ». Le
bouton n'a pas de paramètre : toucher « Lire le message » envoie ces mots à
la Maison, ce qui ouvre la fenêtre de 24 heures ; une réponse écrite fait de
même.

**Secret Supabase** : `WA_TEMPLATE_OUVERTURE = un_message_pour_vous`, posé
APRÈS l'approbation de Meta, lu par la fonction `envois-partent`. Tant qu'il
n'est pas posé, un envoi programmé dont la cliente n'a pas écrit depuis 24 h
ne part pas : sa ligne passe « À revoir » dans Conversations › Les envois
programmés, avec la phrase « elle n'a pas écrit depuis 24 h, et le modèle
d'ouverture n'est pas encore approuvé chez Meta : rien n'est parti », et qui
l'a programmé en est prévenu une fois, sur son téléphone. Une cliente qui a
écrit dans les 24 h reçoit son message tel quel, avec ou sans le secret.

**Quand il part** : à l'heure exacte d'un envoi programmé « seul, par
l'assistant » (même la nuit), quand elle n'a pas écrit depuis 24 h et que
l'envoi n'est pas un message privé (un message privé passe par Opale, sur
WhatsApp Web, sans modèle). Un seul par numéro : un second envoi programmé au
même numéro pendant qu'un modèle attend sa réponse l'attend avec lui, et les
deux messages partent à sa réponse. Sans réponse en sept jours, l'envoi passe
« À revoir ».

**À surveiller chez Meta** : un message « la Maison a un message pour vous »
peut être rangé « Marketing ». Il ouvre une conversation sur un message que la
Maison a déjà écrit pour elle (la suite de son appel, son rendez-vous, sa
facture) : demander « Utilitaire ». Si Meta le reclasse, il part quand même,
au tarif marketing. Si Meta le refuse, reformuler sans changer le fond, par
exemple : « Bonjour {{1}}, la Maison MND vous a écrit au sujet de votre suivi.
Touchez « Lire le message » pour le recevoir ici. » et garder le même nom ; si
le nom change, poser le secret au nouveau nom (le code ne connaît que le
secret).

**Ce que fait sa réponse** : rien de plus que d'ouvrir la fenêtre.
`whatsapp-webhook` range la réponse dans son fil comme toute réponse ; le
facteur la lit à son réveil suivant (chaque minute) et envoie le message
programmé, puis sa pièce, au nom de l'assistant (Perle ou Grenat). L'automate
de la Maison se tait sur ce fil vingt-quatre heures (`pause_le_fil`, motif
`envoi-programme`), comme après un envoi de l'équipe.
