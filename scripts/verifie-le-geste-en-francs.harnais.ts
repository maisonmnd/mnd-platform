/* LE GESTE EN FRANCS, ÉPROUVÉ : 5 novembre 2026.
   `node scripts/verifie-le-geste-en-francs.mjs` (et `--prouve`).

   « Les clientes comme V. A. auront des remises automatiques quand elles
   font tout le service : le shampoing et la reprise » ; au sélecteur : celles
   que je coche, 5 000 F toujours, SÍNSIN™ Essentiel et Signature. Le geste de
   la Maison prend un montant en francs et la coche de la fiche ; la pièce
   l'écrit en francs. Prestations et prix inventés pour le banc. */
import { readFileSync } from 'node:fs';
import {
  francsDuGeste, pricingOf, prixDansPanier, remiseGestePct, remiseGesteXof, unGesteDansLePanier,
  type JugeDuGeste, type PersonalPricing,
} from '../src/shared/pricing';
import type { Service } from '../src/shared/catalog';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

const sv = (o: Partial<Service> & { id: string }): Service => ({
  categoryId: 'c', name: o.id, palier: 'Fondation', priceXof: 0, durationMin: 30, hidePrice: false, sessions: 1, order: 1, ...o,
} as Service);
const REPRISE_E = sv({ id: 'reprise-e', priceXof: 20000 });
const REPRISE_S = sv({ id: 'reprise-s', priceXof: 25000 });
const KIDS = sv({ id: 'reprise-kids', priceXof: 15000 });
const PETIT = sv({ id: 'petit', priceXof: 3000, offertAvec: [{ serviceIds: ['reprise-e'], xof: 5000 }] });
const SHAMPOING = sv({
  id: 'shampoing', priceXof: 8000, priceMode: 'fixe',
  prixParLongueur: { court: 8000, 'mi-long': 10000, long: 12000 },
  offertAvec: [
    { pct: 50, serviceIds: ['coloration'] },
    { serviceIds: ['reprise-e', 'reprise-s'], xof: 5000, fichesCochees: true },
  ],
});
const COLORATION = sv({ id: 'coloration', priceXof: 30000 });

const p = (longueur: 'court' | 'mi-long' | 'long', coche = true): PersonalPricing => ({ clientCoef: 1, longueur, rituelComplet: coche });
const panier = [SHAMPOING, REPRISE_S];

/* ── 1. Les trois longueurs, la coche ── */
dit('mi-long : 5 000 F de moins, soit la moitié', [5000, 50, 5000],
  [remiseGesteXof(SHAMPOING, p('mi-long'), panier), remiseGestePct(SHAMPOING, p('mi-long'), panier), prixDansPanier(SHAMPOING, p('mi-long'), panier)]);
dit('court et long : toujours 5 000 F, jamais un pourcentage arrondi', [[5000, 3000], [5000, 7000]],
  [[remiseGesteXof(SHAMPOING, p('court'), panier), prixDansPanier(SHAMPOING, p('court'), panier)],
    [remiseGesteXof(SHAMPOING, p('long'), panier), prixDansPanier(SHAMPOING, p('long'), panier)]]);
dit('sans la coche, rien ; shampoing seul, rien ; avec la reprise Essentielle aussi', [0, 0, 5000],
  [remiseGesteXof(SHAMPOING, p('mi-long', false), panier), remiseGesteXof(SHAMPOING, p('mi-long'), [SHAMPOING]),
    remiseGesteXof(SHAMPOING, p('mi-long'), [SHAMPOING, REPRISE_E])]);
dit('la reprise Kids ne déclenche pas le geste', 0, remiseGesteXof(SHAMPOING, p('mi-long'), [SHAMPOING, KIDS]));
dit('le plus généreux gagne : la coloration (50 %) contre 5 000 F en court, en long', [[5000, 62.5], [6000, 50]],
  [[remiseGesteXof(SHAMPOING, p('court'), [SHAMPOING, REPRISE_S, COLORATION]), remiseGestePct(SHAMPOING, p('court'), [SHAMPOING, REPRISE_S, COLORATION])],
    [Math.round(12000 * remiseGestePct(SHAMPOING, p('long'), [SHAMPOING, REPRISE_S, COLORATION]) / 100), remiseGestePct(SHAMPOING, p('long'), [SHAMPOING, REPRISE_S, COLORATION])]]);
dit('un geste en francs plus grand que le prix : offert, jamais sous zéro', [3000, 100, 0],
  [remiseGesteXof(PETIT, p('mi-long'), [PETIT, REPRISE_E]), remiseGestePct(PETIT, p('mi-long'), [PETIT, REPRISE_E]), prixDansPanier(PETIT, p('mi-long'), [PETIT, REPRISE_E])]);
dit('le geste en francs est un geste : la remise famille et les places limitées s’effacent', [true, false],
  [unGesteDansLePanier(panier, p('mi-long')), unGesteDansLePanier(panier, p('mi-long', false))]);

/* ── 2. La fiche ── */
dit('pricingOf lit la coche de la fiche', [true, false, false],
  [pricingOf({ remiseDuRituelComplet: true }, []).rituelComplet, pricingOf({}, []).rituelComplet, pricingOf(undefined, []).rituelComplet]);

/* ── 3. Le juge porte ses francs ── */
const juge: JugeDuGeste = Object.assign((s: Service) => remiseGestePct(s, p('long'), panier), { xof: (s: Service) => remiseGesteXof(s, p('long'), panier) });
dit('le juge du rituel porte les francs ; un juge nu n’en porte pas', [5000, 0, 0],
  [francsDuGeste(juge, SHAMPOING), francsDuGeste(juge, REPRISE_S), francsDuGeste((s: Service) => remiseGestePct(s, p('long'), panier), SHAMPOING)]);

/* ── 4. Les écrans et les pièces ── */
const lis = (f: string) => readFileSync(f, 'utf8');
const partage = lis('src/apps/trone/routes/clients/_shared.tsx');
const actions = lis('src/apps/trone/routes/clients/actions.tsx');
const factures = lis('src/apps/trone/routes/vente/Factures.tsx');
const catalogue = lis('src/apps/trone/routes/vente/Catalogue.tsx');
const fiche = lis('src/apps/trone/routes/clients/Customers.tsx');
const couronne = lis('src/apps/couronne/Booking.tsx');
dit('le contexte du rituel porte les francs du geste', true, /xof: \(sv: Service\) => remiseGesteXof\(sv, pricing, chosen\)/.test(partage));
dit('les trois pièces écrivent le geste en francs, en remise de ligne', [true, true, true],
  [/if \(gestesEnFrancs\[i\] > 0\) return 0;/.test(partage) && /gestesEnFrancs\[i\] > 0\s*\? gestesEnFrancs\[i\]/.test(partage),
    /if \(fr > 0\) return \{ nom: sv\.name, pleinXof: prixPlein\(sv\), remisePct: 0, remiseXof: fr \};/.test(actions),
    /discountPct: fr > 0 \? 0 : t\.gesteDe\(sv\)/.test(factures) && /- \(l\.discountXof \?\? 0\)/.test(factures)]);
dit('le Catalogue garde les francs et la coche à l’enregistrement', [true, true],
  [/\.\.\.\(francs > 0 \? \{ xof: francs \} : \{ pct:/.test(catalogue), /\.\.\.\(g\.fichesCochees \? \{ fichesCochees: true \} : \{\}\)/.test(catalogue)]);
dit('la fiche a sa coche ; Ma Couronne dit le geste en francs', [true, true],
  [/patch\(\{ remiseDuRituelComplet: e\.target\.checked \? true : undefined \}\)/.test(fiche), /remiseGesteXof\(s, pricing, selected\)/.test(couronne)]);

console.log(ko === 0 ? '\nLe geste en francs tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
