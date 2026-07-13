# Plateforme Maison MND

Écosystème digital de la maison MND (soin de locks, Cotonou) — **cinq apps sœurs** : même design system, identités très distinctes. Construit depuis le handoff `MND Mobile App Design/design_handoff_mnd_platform/`.

## Les cinq sœurs

| Surface | Entrée | Identité | Rôle |
| --- | --- | --- | --- |
| **Portail** | `/` | Ivoire éditorial | Porte d'entrée vers les cinq surfaces |
| **Le Trône** | `/trone.html` | Obsidienne & indigo, sceau or — la salle du conseil | ERP back-office : 24 routes (pilotage, carnet, clients, caisse, laboratoire, finances, académie, branches…) |
| **Ma Couronne** | `/couronne.html` | Ivoire chaud & cuivre, cadre mobile 390×844 | App cliente : réservation en 7 temps, rituel sur-mesure, cercle |
| **La Consultation** | `/consultation.html` | Indigo profond cérémoniel | Diagnostic payant mondial : paywall 15 000 F, 8 étapes, transmission au Trône |
| **LOKAA** | `/lokaa.html` | Neutre + accent du locataire | SaaS white-label multi-salons, « Propulsé par MND » |
| **Certificat** | `/certificat.html` | Papier pur, A4 paysage | Certificat scellé de l'Académie, prêt à imprimer |

## Lancer

```bash
npm install
npm run dev        # une seule origine pour les 5 surfaces
npm run build      # typecheck + build de production
```

## Architecture

- **Vite MPA** (6 entrées HTML) — une seule origine, donc les **ponts localStorage** entre sœurs fonctionnent tels que définis par le handoff : `mnd_branches` (branches partagées), `mnd_couronne_compose` (rituel sur-mesure → ERP), `mnd_consultations_queue` (La Consultation → ERP), `mnd_vitrine_config` (ERP → Ma Couronne).
- `src/ds/` — design system : tokens du handoff (source de vérité, copiés tels quels) + primitives React (`components.tsx`) + classes `mnd-*` (`ds.css`).
- `src/shared/` — couche de données : magasins persistés en localStorage (`store.ts`), branches multi-devises (`branches.ts`, la branche impose sa devise partout), devises/format (`currency.ts`, montants stockés en XOF), catalogue fon™ (`catalog.ts`), clients/personas, agenda, finances, ponts (`bridges.ts`).
- `src/apps/<surface>/` — chaque sœur est autonome dans son dossier ; le Trône route ses 24 pages via `routes/index.tsx`.

## Règles de marque (non négociables)

Pas d'émojis · rayons 2–4 px · Cormorant Garamond 300 + Jost uniquement · cuivre jamais en texte courant sur fond clair · animations fondues sans rebond · la marque s'écrit **MND** (le ɖ appartient à *mi nyɔ́ ɖɛkpɛ* seulement).
