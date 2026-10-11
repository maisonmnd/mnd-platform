# Le Centre de commande de la Maison MND

Cahier « Maison MND AI Operating System » (Yéman, 11 octobre 2026). Phase 1, la fondation, construite et publiée le 11 octobre 2026. Phase 2, le contenu, construite le 11 octobre 2026 (« construis la phase suivante ») : voir K.

Les choix de Yéman au sélecteur, le 11 octobre 2026 :

- la palette reste indigo, cuivre et ivoire ; le cahier proposait l'or, la crème et le noir ;
- la devise reste « mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là » ; le cahier proposait « Vous êtes belle » ;
- le système vit dans le Trône ;
- Yéman ou Brice valident, l'un ou l'autre (rôle `souverain`) ;
- aucun nom complet ni numéro de cliente ne part chez Claude : prénom et initiale seulement ;
- les agents appellent Claude d'eux-mêmes (matin, lundi, vendredi, premier du mois) sous un plafond de 10 $ par mois ;
- le briefing arrive dans le Trône avec une notification ;
- la phase 1 commence par la journée (le Centre de commande du jour) ;
- tout construire et publier le Trône si tout est vert ; rien ne part aux clientes, rien sur les réseaux.

## A. Architecture globale

```
Le Trône (navigateur, React)                 Supabase
  Direction > Centre de commande  ─────────►  documents (mnd_ia_*)        ◄── cron (appelle_fonction_edge)
    lit : rendez-vous, demandes, caisse,      Edge « centre-de-commande »  ──► Claude (Anthropic)
          offres, salle des envois             └─ notification web aux fondateurs
    écrit : missions, notes, réglages,
            journal du Trône, relevé du jour
```

- Aucune table nouvelle, aucune migration : tout vit dans le document de chaque sujet (`documents`, clé `mnd_ia_*`), synchronisé hors ligne comme l'identité ou les offres.
- La clé Anthropic reste dans la fonction Edge (elle existe déjà pour `bilan-redige` et `suggest-client`).
- Chaque document a un seul écrivain : le Trône ou la fonction, jamais les deux. Aucun geste ne se perd dans un conflit.

## B. Les agents

Registre : `src/shared/ia-agents-pur.ts`. Quinze agents nommés, chacun avec sa mission, sa phase, ce qu'il lit, ce qu'il rend, son niveau de validation au plus doux, sa consigne et ses garde-fous.

| Phase | Agents | État |
|---|---|---|
| 1 Fondation | Orchestrateur, Mémoire | en service (l'orchestrateur dès que la fonction est collée) |
| 2 Contenu | Réseaux sociaux, Journal, Photo, Direction artistique, Vidéo, Usine à contenus | prêts : leurs outils marchent à la main, ils écrivent dès que la fonction est collée ; la direction artistique (gardien de la marque, sans Claude) est en service |
| 3 Automatisation | Publication | nommé, prévu |
| 4 Gestion | Stratégie, Finance, Juridique, RH, Marketing | nommés, prévus |
| 5 Intelligence | Analyse | nommé, prévu |

Aucun agent n'est simulé. Une tâche peut être confiée à un agent d'une phase à venir : elle attend, ou se fait à la main.

## C. Les données

| Document | Écrit par | Contenu |
|---|---|---|
| `mnd_ia_missions` | Trône | missions, tâches, validations |
| `mnd_ia_memoire` | Trône | notes des fondateurs (anonymisées à la saisie) |
| `mnd_ia_reglages` | Trône | plafond, automatique, notification |
| `mnd_ia_journal` | Trône | journal des gestes du Centre |
| `mnd_ia_etat` | Trône | relevé de l'encaissé du mois (au plus une écriture par heure) |
| `mnd_ia_briefings` | fonction | briefings et rapports (60 derniers) |
| `mnd_ia_journal_serveur` | fonction | journal de l'orchestrateur |
| `mnd_ia_compteur` | fonction | dépense par mois, en dollars estimés |
| `mnd_ia_contenus` | Trône | le calendrier des réseaux : publications, statuts, validations, résultats |
| `mnd_ia_seances` | Trône | briefs de séance photo et listes des prises |
| `mnd_ia_scripts` | Trône | scripts vidéo |
| `mnd_ia_articles` | Trône | articles du Journal en rédaction |

Chaque ligne de journal porte qui, quoi, quand, pourquoi, l'entrée, la sortie, le statut et l'erreur.

La mémoire de la Maison (`src/shared/ia-memoire-pur.ts`) ne contient que des faits déjà vrais ailleurs, chacun avec sa source. Le banc la relit contre `identite.ts`, les jetons de couleur et le registre.

## D. Les enchaînements

- **Chaque matin, 7 h** : faits du jour (sans nom), briefing ordonné, rangé, notification.
- **Le lundi, 7 h 30** : la semaine qui vient.
- **Le vendredi, 17 h** : la semaine écoulée.
- **Le premier du mois** : le mois écoulé.
- **Une mission** : un fondateur écrit un objectif. Il est anonymisé dans le Trône, découpé par l'orchestrateur, relu (niveaux relevés au minimum de leur genre), puis rangé « à relire ».
- **Une tâche** : automatique, elle est « à faire ». Sinon elle est « à valider » et ne peut ni démarrer ni se marquer faite sans le oui d'un fondateur.

Les niveaux (`src/shared/ia-validation-pur.ts`) :

- **Automatique** : calendrier, analyse, idées, brouillon, rangement, rapport.
- **À relire** : publication, campagne, article, séance photo, vidéo, concept, message aux clientes.
- **Décision humaine** : contrat, juridique, paiement, recrutement, identité, communication sensible, engagement financier, publication sensible.

Un agent peut durcir un niveau, jamais l'adoucir.

## E. Les intégrations

| Intégration | État |
|---|---|
| Claude (Anthropic) | relié par la fonction Edge |
| Notifications web | reliées (copie de l'envoi « direction » de `push-notify`) |
| Données du Trône | lues directement |
| Meta, Instagram, Facebook, WhatsApp, TikTok, YouTube | pas reliés ; publication à la main tant que Meta n'a pas ouvert l'accès |
| Google Drive, agenda, courriel | pas reliés |

Ce qui n'est pas relié est dit tel quel, jamais simulé.

## F. Le tableau de bord

Le Trône › Direction › **Centre de commande** (`/centre-de-commande`), réservé aux fondateurs.

- **Aujourd'hui** : rendez-vous, demandes du site, validations, encaissé à ce jour, briefing de base (sans Claude) et briefing de l'orchestrateur avec ses propositions.
- **Validations** : valider ou refuser, avec un mot.
- **Missions** : découpage par l'orchestrateur ou création à la main, tâches, statuts, échéances avec l'année.
- **Briefings et rapports** : l'historique, la consigne et le modèle de chacun.
- **Les agents** : par phase, leur état réel.
- **La mémoire de la Maison** : les rubriques sourcées et les notes des fondateurs.
- **Le journal des actions** : celui du Trône et celui de l'orchestrateur, réunis.
- **Réglages et plafond** : plafond, automatique, notification, dépense du mois.
- **La suite** : ce qui est construit, et les phases à venir.

Le Trône › Marketing & Fidélité › **Atelier des contenus** (`/atelier-des-contenus`), réservé aux fondateurs : voir K. Ce qui y attend une relecture est compté dans les Validations du Centre et dans le briefing de base.

## G. La sécurité

- L'écran est réservé au rôle `souverain` (`ROUTES_SOUVERAIN` et garde dans l'écran).
- La fonction n'admet que deux appelants. Le fondateur est vérifié par jeton et par la table `staff`, au rôle `souverain`. Le cron passe par la clé service, comparée à temps constant.
- Une mission ne se lance qu'au clic d'un fondateur. Une demande de contenu (mode `contenu`) aussi : le cron n'en écrit pas.
- Deux barrières contre les données nominatives. Le Trône remplace les noms de clientes par prénom et initiale, et retire numéros et adresses. La fonction repasse tout texte reçu ou lu.
- La fonction ne lit jamais la table des clientes.
- Le plafond se lit avant chaque appel, avec un prix relevé vers le haut. À 10 $, plus rien ne part.
- Aucune clé dans le code : tous les secrets sont ceux déjà posés dans Supabase.
- Limite connue : `documents` est lisible et inscriptible par tout le personnel au niveau de la base. La garde est l'écran ; une table à RLS `is_souverain()` est prévue en phase 3, quand une validation déclenchera une action réelle.

## H. La feuille de route

1. **Fondation** (fait, 11 octobre 2026) : orchestrateur, mémoire, missions, validation, briefings, journal, plafond, Centre de commande.
2. **Contenu** (construit, 11 octobre 2026) : piliers et calendrier des réseaux à partir des plans déjà préparés, le Journal comme rédaction, brief de séance et liste des prises, script vidéo, gardien de la marque, usine à contenus. Voir K.
3. **Automatisation** : statuts de publication jusqu'à « programmé » ; table à RLS pour les validations qui déclenchent ; rapports enrichis ; publication reliée le jour où Meta l'ouvre.
4. **Gestion** : stratégie, finance (lecture des caisses et du coffre), juridique (secrétariat, papiers, échéances), RH, marketing.
5. **Intelligence** : analyse des campagnes (la campagne de chaque demande est déjà gardée), recommandations, apprentissage.

## I. Les fichiers

- `src/shared/ia-validation-pur.ts`, `ia-anonymise-pur.ts`, `ia-budget-pur.ts`, `ia-agents-pur.ts`, `ia-memoire-pur.ts`, `ia-faits-pur.ts`, `ia-prompts-pur.ts`, `ia-relecture-pur.ts` : les modules purs.
- `src/shared/ia-centre.ts` : les magasins, les gestes, l'appel à la fonction.
- `src/apps/trone/routes/pilotage/CentreDeCommande.tsx`, `centre.css` : l'écran.
- `src/apps/trone/routes/index.tsx` : la route, Direction, réservée au souverain.
- `supabase/functions/centre-de-commande/index.ts` : l'orchestrateur (à coller, dossier du bureau « A recoller - centre de commande »).
- `scripts/copie-dans-le-centre.mjs` : refait les copies des modules purs dans la fonction.
- `scripts/verifie-le-centre-de-commande.mjs` : le banc, avec `--prouve`.
- Phase 2 : `src/shared/ia-marque-pur.ts`, `ia-contenu-pur.ts`, `ia-seance-pur.ts`, `ia-journal-pur.ts` (purs), `ia-plans-des-reseaux.ts` (écrit par `scripts/extrais-les-plans-des-reseaux.mjs` à partir des trois maquettes), `ia-atelier.ts` (magasins et gestes), `src/apps/trone/routes/equipe/AtelierDesContenus.tsx` et `atelier.css` (l'écran), `scripts/verifie-l-atelier-des-contenus.mjs` (le banc, avec `--prouve`).

## J. La première fonctionnalité

Le Centre de commande du jour : la journée lue dans le Trône, le briefing de base sans Claude, puis le briefing rédigé par l'orchestrateur chaque matin, avec une notification.

## K. La phase 2, le contenu

Cahier, § 9 à 16. Tout vit dans l'atelier des contenus ; rien ne part tout seul. Meta n'est pas relié : « programmé » veut dire « date et heure arrêtées », « publié » se coche après l'avoir fait, avec le lien.

- **Le calendrier.** Une publication porte date, heure, réseaux, format, pilier, objectif, sujet, accroche, légende, appel, visuel, statut, lien et résultats. Les statuts vont de brouillon à optimisé, sans saut : à relire, validé (Yéman ou Brice), programmé (une date), publié, analysé (au moins un chiffre relevé), optimisé (ce qu'on en retient). Changer le texte d'une publication validée la remet à relire.
- **Les plans déjà préparés.** Les trois maquettes (trente jours, Instagram mois deux et trois, LinkedIn deux mois) donnent 66 publications, importées d'un clic, toutes « à relire », jamais deux fois. Un plan se valide d'un geste, sauf les publications qu'une faute bloque. Ce qui est daté d'avant aujourd'hui et n'est pas marqué publié se montre à part.
- **Les dix piliers** du cahier, et leur équilibre sur les trente prochains jours.
- **Le gardien de la marque** (la direction artistique, sans Claude) relit chaque texte à chaque frappe. Il bloque le tiret cadratin, « Kolétan » et un prix dans une campagne. Il demande un jugement pour « salon », « MND » seul, « MND Formation », une date sans année, un emoji (™, © et ® ne comptent pas) et l'obsidienne dans une consigne d'image.
- **La séance photo.** Le brief complet, les dix prises du cahier à cocher, les formats. Pas de publication sans l'accord inscrit au registre des photos ; un enfant demande l'accord écrit de son parent ; le modèle se dit par son prénom et son initiale. L'accord obtenu ou une prise faite ne défont pas la validation du brief ; un changement de texte, si.
- **Le script vidéo.** Accroche, histoire, valeur, émotion, appel, puis les plans avec leur durée comparée à l'annoncée ; aucun prix à l'écran.
- **Le Journal comme rédaction.** Dix étapes, de l'idée à la publication. Un article se valide quand rien ne manque (description d'au moins 60 signes, trois mots-clés, une image, 300 mots, tous les faits vérifiés, pas de cliente sur un article qui nomme un défaut) et qu'aucune faute ne bloque. Validé, il se copie dans la forme exacte des fichiers de `docs/site-revelateur/journal/` ; le banc le fait lire par le lecteur du site lui-même. Il paraît à la publication suivante du site.
- **L'usine à contenus.** Une séance, une vidéo, un article ou une publication donne ses déclinaisons au rythme léger de la Maison (deux publications et une vidéo par semaine sur Instagram), mises au calendrier en brouillons, ou écrites par l'agent et rangées à relire.
- **Les agents.** Mode `contenu` de la fonction, aux fondateurs seuls : calendrier, déclinaisons, article, séance, vidéo. La demande part anonymisée du Trône, la fonction la repasse, la réponse est relue (listes, période, tiret, numéros) et revient « à relire ». La fonction n'écrit aucun contenu. Consignes versionnées : `MND_RESEAUX_CALENDRIER_v1`, `MND_JOURNAL_ARTICLE_v1`, `MND_PHOTO_SEANCE_v1`, `MND_VIDEO_SCRIPT_v1`, `MND_USINE_DECLINAISONS_v1`. Version de la fonction : `2026-10-11-b`.
