# État du chantier — Le Trône complet

**Statut : les 24 routes du Trône sont implémentées. `npx tsc --noEmit` passe (0 erreur) et `npm run build` compile les 6 entrées.**

## Fait
- Scaffold Vite MPA : 6 entrées (`index`, `trone`, `couronne`, `consultation`, `lokaa`, `certificat`) sur une seule origine (ponts localStorage opérationnels).
- `src/ds/` : tokens du handoff + primitives React + classes `mnd-*`.
- `src/shared/` : store localStorage, branches multi-devises, currency (XOF), geo (195 pays / 70 devises), catalogue fon™, clients/personas, agenda, finances, ponts inter-apps (`bridges.ts`), et `settings.ts` (paramètres + marque).
- **Le Trône — 24 routes complètes** :
  - Pilotage : Dashboard, Analytics.
  - Clients & Agenda : Carnet, Consultations, Calendrier, Customers, Vitrine, Personas.
  - Vente : Catalogue, Caisse, Factures, Laboratoire.
  - Finances : Synthèse, Juste Prix, Dépenses.
  - Équipe & Croissance : Personnel, Marketing, Cercle, Abonnements, Recommandations IA, Académie.
  - Système : Paramètres, Branches, Marque & thème.
- Les 5 sœurs : Ma Couronne, La Consultation, LOKAA, Certificat, et le Portail d'entrée.

## Reste à faire (vérification & finition)
- Revue visuelle écran par écran contre les `.dc.html` + `screenshots/` (fidélité pixel).
- Câblage backend réel (Supabase / paiements KkiaPay + PayPal, envoi WhatsApp, webhooks) — aujourd'hui tout est localStorage + données de démo.
- Tests manuels des ponts inter-apps (compose Couronne → ERP, queue Consultation → ERP).

## Notes des agents (simplifications assumées)
- Certaines saisies rapides (nouvelle catégorie/caisse/budget dans Dépenses) utilisent `window.prompt` plutôt qu'une modale dédiée.
- Le Juste Prix, Vitrine et Customers dérivent persona/coefficient des données réelles plutôt que de rejouer les scripts codés en dur du prototype.
- Recette par branche et codes d'accès personnel sont indicatifs / démo (pas de modèle back-end).

Spécifications : `../MND Mobile App Design/design_handoff_mnd_platform/README.md` (source de vérité) + prototypes `.dc.html` + `screenshots/`.
Règles : copie française, pas d'émojis, rayons 2–4 px, Cormorant 300 + Jost, cuivre en accent seulement, graphiques SVG faits main, tout filtré par branche + `fmtMoney(xof, devise)`.
