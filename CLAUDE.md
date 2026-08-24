# Plateforme Maison MND

Écosystème de la maison MND (soin de locks, Cotonou) : **cinq apps sœurs** qui
partagent un design system et une base Supabase, avec des identités distinctes.

**À lire en début de session :** `docs/REPRENDRE.md` — l'état vivant du chantier
(décisions récentes, migrations passées, pièges du moment). Ce fichier-ci ne
contient que ce qui ne bouge pas.

## Commandes

```bash
npm run dev          # les 8 entrées sur une seule origine (port 5173)
npm run typecheck    # tsc --noEmit — doit rester à 0 erreur
npm run build        # typecheck + build de production
node scripts/build-sites.mjs   # les 4 sites séparés → dist-sites/
```

Vérifier avec `npm run typecheck` après toute modification de `.ts` / `.tsx`.

## Architecture

**Vite MPA, une seule origine.** C'est structurel, pas cosmétique : les ponts
`localStorage` entre sœurs n'existent que parce que tout partage l'origine.
Entrées : `index` (portail), `trone`, `couronne`, `consultation`, `lokaa`,
`certificat`, `bilan`, `bulletin`.

| Dossier | Contenu |
| --- | --- |
| `src/ds/` | Design system : tokens du handoff (source de vérité, copiés tels quels), primitives React (`components.tsx`), classes `mnd-*` (`ds.css`) |
| `src/shared/` | Couche de données : `store.ts` (persistance), `supabase.ts` + `sync.ts`, `branches.ts`, `currency.ts`, `catalog.ts`, `bridges.ts`, `auth.ts`, `settings.ts` |
| `src/apps/<sœur>/` | Chaque sœur est autonome ; Le Trône route ses pages via `routes/index.tsx` |
| `supabase/` | Migrations numérotées + scripts d'audit et de réparation |

**Ponts inter-apps** (`bridges.ts`) : `mnd_branches`, `mnd_couronne_compose`
(rituel sur-mesure → ERP), `mnd_consultations_queue` (Consultation → ERP),
`mnd_vitrine_config` (ERP → Ma Couronne).

## Règles de données

- **La branche impose sa devise partout.** Tout est filtré par branche.
- **Les montants sont stockés en XOF**, affichés via `fmtMoney(xof, devise)`.
  Jamais de montant affiché sans passer par là.
- **Un rendez-vous ne stocke que des identifiants** de prestation, pas la maison
  ni la catégorie : la ventilation se recalcule à l'affichage depuis le catalogue
  courant. Déplacer une prestation reclasse donc tout l'historique.
- **Ne jamais relancer une migration déjà passée.** Voir `docs/REPRENDRE.md` pour
  celles qui sont exécutées et celles qui sont remplacées.

## Dépôt PUBLIC — données personnelles

`github.com/maisonmnd/mnd-platform` est public, et une fuite a déjà eu lieu
(2 août 2026). Les fichiers d'import portent noms, téléphones, e-mails et
anniversaires de clientes : ils sont dans `.gitignore` et **n'entrent jamais dans
un commit** (`supabase/import_v6*.sql`, `verif_clientes_intruses.sql`,
`repare_telephones.sql`). Ils se regénèrent par `scripts/import-genere.mjs`.

Ne jamais coder en dur une clé de service, un secret, ni un nom de domaine.

## Règles de marque (non négociables)

- Pas d'émojis.
- Rayons 2–4 px.
- **Cormorant Garamond 300 + Jost** uniquement.
- Le cuivre est un **accent** (boutons, filets) — jamais du texte courant sur
  fond clair.
- **Surfaces sombres : indigo, pas obsidienne.** L'obsidienne est trop sombre ;
  ne pas l'introduire dans de nouveaux écrans même si le handoff la mentionne.
- Animations fondues, sans rebond.
- Graphiques SVG faits main (pas de librairie de charts).
- La marque s'écrit **MND** — le ɖ appartient à *mi nyɔ́ ɖɛkpɛ* seulement.
- **La devise s'écrit `mi nyɔ́ ɖɛkpɛ · la maison veille`** — une seule source,
  `DEVISE_COMPLETE` dans `shared/identite.ts`. Jamais recopiée à la main :
  chaque copie finissait par diverger (« · nous sommes beaux », « — la maison
  veille. »). Point médian, comme tout ce qui sort de la Maison : un seul
  séparateur partout (décision d’harmonisation du 24 août, l’ancienne puce ronde
  jurait dans les pieds de page).
- **Les lettres fon ne se translittèrent JAMAIS.** Ni Cormorant ni Jost ne
  portent ɔ, ɖ, ɛ : la police `MND Fon` (EB Garamond, sous-ensemble OFL) les
  sert à l'écran par `unicode-range`, et `pieDeLaMaison()` l'embarque dans les
  PDF. Voir `src/ds/fonts/LISEZ-MOI.md` — y compris pourquoi l’accent de « ɔ́ »
  se pose à la main sur le papier.
- **Tout message écrit par l'IA se termine par la devise** — `signeLeMessage()`
  de `shared/identite.ts`. Elle est posée PAR LE CODE, jamais demandée au
  modèle dans son instruction : un modèle oublie une fois sur vingt,
  paraphrase (« nous sommes beaux ! »), ou écorche les diacritiques — et
  « mi nyo dekpe » sous un avis public serait pire que rien. La fonction ne la
  pose jamais deux fois (`porteLaDevise` la reconnaît écorchée).
- Copie française partout.

## Déploiement

GitHub Pages, quatre sites depuis `scripts/build-sites.mjs` : `mnd-platform`
(portail), `trone` (+ Consultation + Certificat embarqués), `couronne`, `lokaa`.
`VITE_BASE` fixe le sous-chemin, `VITE_APPS` restreint les entrées construites.

**Les liens entre sœurs sont des chemins relatifs à l'origine** (`/trone/`,
`/couronne/`). Aucun nom de domaine en dur : changer de compte GitHub ne doit
casser ni demander aucune modification de code.

## Références

- `docs/REPRENDRE.md` — état du chantier, à jour
- `docs/BACKEND.md` — Supabase, RLS, fonctions
- `HANDOFF.md` — ce qui est fait / ce qui reste
- `../MND Mobile App Design/design_handoff_mnd_platform/` — maquettes `.dc.html`,
  source de vérité visuelle
