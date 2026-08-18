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

## Étape 5 — L'avis Google sans main (19 août 2026)

« Je veux l'envoi sans main » : la fonction planifiée `avis-google` écrit
elle-même à chaque **première venue soldée** — le modèle WhatsApp avec le
prénom et le lien d'avis. Elle réutilise les MÊMES clés Meta que l'étape 3 ;
si l'étape 3 est faite, il ne reste que quatre gestes.

1. **Déployer la fonction** : Edge Functions → New function → nom exact
   `avis-google` → coller le contenu ENTIER de
   `supabase/functions/avis-google/index.ts` → Deploy (désactiver
   « Verify JWT » si proposé — elle n'accepte que la clé service).

2. **Faire approuver le modèle** dans WhatsApp Manager — nom `avis_google`,
   langue **fr**, catégorie **Marketing** (une demande d'avis n'est pas de
   l'« utility » aux yeux de Meta), corps :

   > Merci pour votre passage à la maison, {{1}}. Si l'expérience vous a plu,
   > un avis nous aiderait beaucoup : {{2}}
   > À très vite — votre couronne nous tient à cœur.

   ({{1}} = prénom, {{2}} = le lien d'avis — c'est exactement ce que la
   fonction envoie.) Si Meta refuse un lien en variable de corps, refaire le
   modèle avec un **bouton URL** et demander l'adaptation de la fonction.

3. **Poser le secret du modèle** (les autres clés servent déjà à rappels-j1) :

   ```
   WA_TEMPLATE_AVIS=avis_google
   ```

4. **Poser le réveil** : Integrations → Cron → Create job :
   - **Name** : `avis-google-heures`
   - **Schedule** : `30 8-20 * * *` — toutes les heures, de 9 h 30 à 21 h 30
     à Cotonou : l'avis part dans l'heure qui suit le solde, jamais la nuit.
   - **Type** : Edge Function → `avis-google` · POST · en-tête
     `Authorization: Bearer <clé service_role>` comme à l'étape 2.

Puis, DANS LE TRÔNE : Paramètres → Automatisations → allumer
**« Avis Google sans main · API WhatsApp »**. Tant que l'interrupteur est
éteint, la fonction ne fait rien (`{ "actif": false }`) et le comptoir garde
son geste d'un tap ; allumé, la fonction écrit et le comptoir se tait — la
cliente n'est jamais relancée deux fois.

Garde-fous de la fonction : une seule fois par cliente (sa PREMIÈRE pièce
réglée, identifiant `env-<facture>-wa-avis` au journal), fenêtre de deux
jours (un solde du soir est rattrapé le matin, jamais un vieux passage),
fiche sans téléphone consignée « sans-abonnement » au lieu d'échouer.

## Ce que le Trône montre

- **Tableau de bord → La tournée du matin** : les rendez-vous de demain, la
  pastille « Push parti seul » / « WhatsApp auto » / « SMS auto » / « Sans
  l'appli », et la cloche WhatsApp pré-remplie pour finir à la main.
- La table `envois` est le journal complet (une ligne par personne et par
  canal, avec le verdict et l'heure).

## Annexe — suivre les paiements du compte MoMoPay

Deux voies, choisies le 13 août :

### A. Le pointage du relevé (déjà construit — aucun compte à ouvrir)

Le QR du salon et l'USSD sont un canal fermé de MTN : le Trône ne voit pas
naître ces paiements. La seule vue COMPLÈTE du compte marchand est le relevé
du portail marchand MTN (ou l'historique de l'appli marchand).

Finances → Encaissements → **« Pointer le relevé MoMo »** : coller le relevé
tel quel, une opération par ligne. Le lecteur trouve montant, date et
référence où qu'ils soient sur la ligne, puis rapproche chaque entrée du
registre : *Pointé* (encaissement MoMo retrouvé) · *Acompte à confirmer*
(la preuve attendue vient d'arriver — un bouton confirme) · *Noté sous un
autre moyen* (l'argent est arrivé MoMo, le registre dit Espèces — à
corriger) · *Orphelin* (rien en face — à regarder).

Si le format du relevé réel lit mal, apporter un échantillon (quelques
lignes SANS les noms complets) — le lecteur se calibre en une retouche.

### B. L'API MoMo Collections — RequestToPay (la Caisse demande, la cliente valide)

Ce que la Maison doit obtenir auprès de MTN (rien ne se code avant) :

1. Un compte sur **momodeveloper.mtn.com** et l'abonnement au produit
   **Collections** (clé d'abonnement `Ocp-Apim-Subscription-Key`).
2. L'accès **production pour le Bénin** : il se demande à MTN (le bac à
   sable est ouvert à tous, la production passe par leur validation du
   marchand). Conditions, frais et devise de facturation : à vérifier avec
   MTN Bénin — ne rien signer sur la foi d'un souvenir.
3. À l'issue : un **API User** et une **API Key** de production, plus la clé
   d'abonnement.

Quand ces trois valeurs existent, demander le chantier : une fonction Edge
`momo-collecte` (RequestToPay + vérification du statut, secrets côté
Supabase), un bouton à la Caisse « Demander le paiement MoMo » (la cliente
reçoit la demande sur son téléphone et valide par PIN), et le journal des
demandes avec leur verdict. Le geste au comptoir change : c'est la Maison
qui tend la main, la cliente ne compose plus rien.

## Règles de la maison

- Jamais une clé dans le dépôt : les secrets vivent chez Supabase.
- Le téléphone d'une cliente ne sort jamais de la table `envois` (lecture
  personnel seulement — RLS de 0043).
- Un rappel ne part qu'UNE fois par canal et par rendez-vous, quel que soit
  le nombre de réveils du cron (identifiants déterministes `env-<rdv>-<canal>`).
