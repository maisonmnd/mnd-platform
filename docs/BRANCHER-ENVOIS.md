# Brancher les envois automatiques — push, WhatsApp, SMS

L'architecture est UNE : la fonction planifiée `rappels-j1` se réveille chaque
soir, lit les rendez-vous du lendemain, envoie ce que ses clés lui permettent,
et consigne chaque tentative dans la table `envois` (migration 0043). Le push
marche sans aucun compte ; WhatsApp et SMS s'allument le jour où leurs clés
sont posées — sans retoucher le code.

Aucun secret dans ce dépôt (il est public). Toutes les clés vivent dans les
« secrets » de Supabase, lus par la fonction à l'exécution.

## Étape 1 — Déployer la fonction (une fois)

1. Supabase → **Edge Functions** → **Deploy a new function** → nom exact :
   `rappels-j1`.
2. Coller le contenu ENTIER de `supabase/functions/rappels-j1/index.ts`
   → **Deploy**.
3. Dans les réglages de la fonction, **désactiver « Verify JWT »** si l'option
   est proposée — la fonction fait sa propre garde (elle n'accepte que la clé
   service, celle du cron).

## Étape 2 — Poser le réveil (le cron)

Supabase → **Integrations** → **Cron** (activer si demandé) → **Create job** :

- **Name** : `rappels-j1-soir`
- **Schedule** : `0 17 * * *` — 17 h UTC = 18 h à Cotonou, l'heure où le
  carnet du lendemain est posé.
- **Type** : Edge Function → choisir `rappels-j1` · méthode POST.
- Si le formulaire demande un en-tête d'autorisation : `Authorization` =
  `Bearer <clé service_role>` (Settings → API → `service_role`). Le tableau
  de bord la propose souvent tout seul.

Essai immédiat sans attendre le soir : bouton **Run now** du job (ou
« Invoke » sur la fonction avec la clé service). Réponse attendue :
`{ "jour": "…", "rdv": N, "push": …, "whatsapp": 0, "sms": 0 }` — et les
lignes apparaissent dans la table `envois` + la tournée du matin du Trône.

**Dès cette étape, les rappels PUSH partent seuls.** Gratuit, pour toute
cliente qui a installé Ma Couronne. Les autres restent servies par la tournée
du matin (un tap par cliente).

## Étape 3 — Allumer WhatsApp (API Meta, payant à la conversation)

Ce que la Maison doit obtenir (personne ne peut le faire à sa place) :

1. Un **compte Meta Business** (business.facebook.com) vérifié au nom de la
   maison.
2. Dans **WhatsApp Manager** : créer l'application WhatsApp Business API et y
   rattacher un **numéro dédié** — ⚠ un numéro ne peut pas être à la fois sur
   l'app WhatsApp d'un téléphone et sur l'API. Prendre un numéro neuf, ou
   migrer (le numéro perd alors l'app du téléphone).
3. Faire approuver un **modèle de message** (obligatoire pour écrire la
   première — catégorie « Utility ») nommé `rappel_rdv`, langue **fr**, corps :

   > Bonjour {{1}}, petit rappel de la maison : votre rendez-vous est prévu
   > demain à {{2}}. Merci de nous prévenir en cas d'empêchement. À très vite.

   ({{1}} = prénom, {{2}} = heure — c'est exactement ce que la fonction envoie.)
4. Relever trois valeurs : le **jeton d'accès permanent** (System user token),
   l'**identifiant du numéro** (Phone number ID), et le nom du modèle.
5. Le tarif est à la conversation, facturé par Meta — le vérifier sur la page
   « WhatsApp Business Platform pricing » pour le Bénin avant d'allumer.

Puis poser les clés (Supabase → Edge Functions → `rappels-j1` → **Secrets**,
ou par CLI `supabase secrets set`) :

```
WA_TOKEN=<jeton permanent>
WA_PHONE_ID=<identifiant du numéro>
WA_TEMPLATE=rappel_rdv
```

Au prochain réveil, les WhatsApp partent — et la tournée du matin montre
« WhatsApp auto » sur chaque ligne servie.

## Étape 4 — Allumer les SMS (fournisseur à choisir)

Il faut un compte chez un fournisseur d'envoi SMS qui couvre le Bénin
(offre entreprise MTN/Moov, ou un agrégateur international type Twilio).
Tarif au SMS et enregistrement du nom d'expéditeur : à vérifier auprès du
fournisseur choisi.

La fonction parle nativement la forme Twilio :

```
SMS_TWILIO_SID=<Account SID>
SMS_TWILIO_TOKEN=<Auth token>
SMS_FROM=<numéro ou nom d'expéditeur approuvé>
```

Autre fournisseur = adapter le seul bloc « ③ SMS » de la fonction (le reste
ne bouge pas) — demander ce chantier quand le compte existe.

## Ce que le Trône montre

- **Tableau de bord → La tournée du matin** : les rendez-vous de demain, la
  pastille « Push parti seul » / « WhatsApp auto » / « SMS auto » / « Sans
  l'appli », et la cloche WhatsApp pré-remplie pour finir à la main.
- La table `envois` est le journal complet (une ligne par personne et par
  canal, avec le verdict et l'heure).

## Règles de la maison

- Jamais une clé dans le dépôt : les secrets vivent chez Supabase.
- Le téléphone d'une cliente ne sort jamais de la table `envois` (lecture
  personnel seulement — RLS de 0043).
- Un rappel ne part qu'UNE fois par canal et par rendez-vous, quel que soit
  le nombre de réveils du cron (identifiants déterministes `env-<rdv>-<canal>`).
