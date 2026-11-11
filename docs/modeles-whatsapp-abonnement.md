# Les deux modèles WhatsApp de l'abonnée (lot 4 de l'abonnement refait)

Écrit le 8 novembre 2026, repris le 11 novembre 2026. Maquette
`public/maquette-l-abonnement-refait.html`, « Les messages qu'elle reçoit » :
deux messages par séance, tous deux liés à son rendez-vous, tous deux par la
salle d'attente des envois. Le jour même, rien n'arrive sur son téléphone à
son arrivée : tout se passe au fauteuil. « Une petite surprise à chaque
fois » ; « un message qui vient ce jour-là parce qu'ils nous font confiance »
(Yéman).

Ces deux fiches se déposent dans WhatsApp Manager › Modèles de message, telles
quelles. Le Trône les montre aussi avec un bouton « Copier » : Conversations ›
Perle (l'Assistant Maison) › « Ses modèles chez Meta », sous les modèles de
Perle. La règle qui les écrit vit dans `src/shared/messages-de-l-abonnee-pur.ts`
(`FICHES_DES_MODELES_DE_L_ABONNEE`) ; le banc
`scripts/verifie-les-messages-de-la-seance.mjs` tient ces fiches, ce document
et le code ensemble. À reporter dans le document vivant des modèles (Claude
Docs) le jour du dépôt chez Meta.

## 1. `rappel_rdv_attention` : la veille, avec l'attention

| Champ | À saisir chez Meta |
| --- | --- |
| Nom | `rappel_rdv_attention` |
| Catégorie | Utilitaire (UTILITY) |
| Langue | Français (fr) |
| En-tête | aucun |
| Corps | voir ci-dessous, mot pour mot |
| Pied de page | mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là |
| Boutons | aucun |

Corps :

> Bonjour {{1}}, votre rendez-vous est prévu demain à {{2}} à la Maison MND. Une attention vous y attend.

Variables, avec l'exemple à donner à Meta :

- `{{1}}` l'appel : la civilité notée et le prénom d'usage en entier
  (`appelDe`), ou le prénom seul quand la civilité n'est pas notée ; pour un
  foyer, les prénoms (« Jade et Faith »). Exemple : `Mme Awa`.
- `{{2}}` l'heure du rendez-vous. Exemple : `9 h`.

Jamais un montant, jamais un numéro de pièce.

**Secret Supabase** : `WA_TEMPLATE_RAPPEL_ATTENTION = rappel_rdv_attention`,
posé APRÈS l'approbation de Meta, lu par la fonction `rappels-j1`. Tant qu'il
n'est pas posé, le rappel de la veille habituel (`rappel_rdv`) part exactement
tel qu'il est, sans bruit ni erreur (la même règle que `WA_TEMPLATE_REPRISE`).

**Quand il part** : la veille d'une séance de FORMULE (couverte par un
abonnement, pas par un forfait) dont le panier d'attention est VALIDÉ dans
Abonnements › Les attentions, aux heures du rappel de la veille (18 h puis
19 h sans réglage), déposé en salle d'attente par `rappels-j1`, porté par le
facteur (`envois-partent`). Ne le reçoivent pas : un rendez-vous posé sans
confirmation (`sansConfirmation`, il garde le rappel d'hier mot pour mot), un
foyer dont une tête nommée n'a pas son attention, un panier seulement proposé
ou déjà remis.

**Le repli** : le colis emporte le rappel d'hier (`rappel_rdv`, mêmes
variables). Si Meta refuse le modèle neuf (non approuvé, en pause) ou si la
direction le met en pause dans « Ce qui va partir », c'est le rappel d'hier
qui part, dans la même minute.

**Jamais en direct** : quand le facteur se tait depuis plus de cinq minutes,
`rappels-j1` envoie lui-même, comme avant la salle, et alors toujours le
rappel d'hier, jamais l'attention.

## 2. `prochaine_seance` : après la séance, sa prochaine séance proposée

| Champ | À saisir chez Meta |
| --- | --- |
| Nom | `prochaine_seance` |
| Catégorie | Utilitaire (UTILITY) |
| Langue | Français (fr) |
| En-tête | aucun |
| Corps | voir ci-dessous, mot pour mot |
| Pied de page | mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là |
| Boutons | deux réponses rapides, dans cet ordre : « Oui, je réserve » · « Une autre date » |

Corps :

> Merci, {{1}}. Votre prochaine séance : {{2}} ?

Variables, avec l'exemple à donner à Meta :

- `{{1}}` l'appel (comme ci-dessus). Exemple : `Mme Awa`.
- `{{2}}` le moment proposé, le jour avec l'année et l'heure. Exemple :
  `samedi 23 janvier 2027 à 9 h`.

**Secret Supabase** : aucun. Le nom `prochaine_seance` est écrit dans le code,
et c'est le Trône qui dépose le message : il ne lit aucun secret de fonction.
L'allumage est la note de la direction : « approuvé » dans Conversations ›
Perle › « Ce que ça rapporte » › Ses modèles chez Meta › Les autres modèles
de la Maison, le jour où Meta l'approuve. Jamais noté : rien ne part, sans
bruit.

**À surveiller chez Meta** : la proposition d'une séance peut être rangée
« Marketing » par Meta. Elle reste liée à la formule en cours de l'abonnée
(une séance déjà payée) : demander « Utilitaire », et si Meta la reclasse,
le message part quand même, au tarif marketing.

**Quand il part** : quand une séance de formule est marquée faite au Trône
(le comptoir, la Caisse, « Marquer faite », la fin déclarée par la cliente, la
main de Grenat), le jour même ou le lendemain (un honneur de rattrapage plus
tardif ne propose rien), si aucun rendez-vous suivant n'est posé : déposé en
salle d'attente (dix minutes, jamais la nuit), une fois par séance
(`prochaine-seance-<rendez-vous>`). La date proposée est son jour favori et
son heure d'habitude, à son rythme, dans la vie du contrat, sur une lune
réglée, jamais avant l'ouverture, jamais un dimanche, jamais un jour fermé,
sur une place libre ; rien en quatre semaines : aucun message. Le numéro est
celui du rappel de la veille (le numéro à prévenir de la séance, sinon le
premier numéro de sa fiche, jamais le second). Une fiche d'essai reçoit à SON
numéro, comme partout.

**Au départ** : le facteur relit la séance et ses rendez-vous. Une suite posée
pendant les dix minutes de salle (la carte « Son prochain rituel », la
fenêtre du rendez-vous, Ma Couronne), ou une séance qui n'est plus marquée
faite : le message ne part pas.

**Ce que font les boutons** (`whatsapp-webhook`), venus du seul numéro à qui
le message est parti :

- « Oui, je réserve » pose la séance proposée, couverte par sa formule, sous
  le verrou du serveur (`reserver_une_seance_incluse_par_la_maison`, migration
  0198 : la formule à elle, en vie ce jour-là, sur une lune réglée, un crédit
  libre, la place libre), et répond d'une phrase qui est SA confirmation :
  « C’est noté, Mme Awa : votre séance est confirmée pour le samedi 23 janvier
  2027 à 9 h à la Maison MND. » La ligne `conf-<rendez-vous>-whatsapp`, posée
  avec la séance, tait le modèle de `confirmation-rdv` ; si la phrase ne part
  pas, la ligne passe « échec » et le modèle prend le relais. Si la place a été
  prise entre-temps, la main passe à la conversation et l'équipe est prévenue.
  Si une suite a été posée depuis le message, rien ne se pose : « C’est déjà
  fait, Mme Awa : votre prochaine séance est confirmée pour le … ».
- « Une autre date » ne pose rien : « Bien sûr, Mme Awa. Dites-nous ici le
  jour qui vous va : la Maison MND vous propose une heure. » L'équipe est
  prévenue (son prénom, jamais un texte).

## Ce qui ne part pas

- À son arrivée : AUCUN message (tranché le 6 novembre 2026). L'équipe lui
  remet son présent et sa carte, signée à la main.
- Aucune relance « venez découvrir votre surprise » : la maquette l'exclut.
