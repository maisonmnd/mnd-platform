/* LA GAMME AU RENDEZ-VOUS, ÉPROUVÉE — `node scripts/verifie-gamme.mjs`.

   Une erreur ici ne plante pas : elle fait payer à une cliente un prix qui
   n'est pas celui qu'on lui a annoncé, trois semaines plus tôt, au téléphone.
   Cela se paie en confiance. */
import {
  ligneBruteXof, ligneNetteXof, gammeBruteXof, gammeNetteXof, gammeEconomieXof,
  poseUnProduit, retireUnProduit, remiseDeLaLigne, ecartsDeTarif, manqueALEtagere,
  graveLesLignesReglees, gammeTouteReglee, lignesARegler,
  type LigneGamme,
} from '../src/shared/gamme';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① UNE LIGNE ──────────────────────────────────────────────────
   Le pourcentage porte sur la LIGNE entière, pas sur l'unité : « −10 % sur les
   deux flacons » se dit comme on le pense. */
const huile: LigneGamme = { id: 'p-huile', qty: 2, prixXof: 12500 };
dit('deux flacons au plein', 25000, ligneBruteXof(huile));
dit('… sans remise, le net est le plein', 25000, ligneNetteXof(huile));
dit('−10 % sur la ligne entière', 22500, ligneNetteXof({ ...huile, remise: { pct: 10 } }));
/* LE POURCENTAGE D'ABORD, LES FRANCS ENSUITE — l'ordre de toute la Maison, pour
   qu'une seule règle s'apprenne. */
dit('le % puis les francs', 20000, ligneNetteXof({ ...huile, remise: { pct: 10, xof: 2500 } }));
dit('une remise plus grande que la ligne l’offre', 0, ligneNetteXof({ ...huile, remise: { xof: 99000 } }));
dit('cent pour cent, c’est offert', 0, ligneNetteXof({ ...huile, remise: { pct: 100 } }));
/* UNE QUANTITÉ À ZÉRO NE VAUT RIEN — et ne rend jamais un négatif. */
dit('zéro flacon vaut zéro', 0, ligneBruteXof({ ...huile, qty: 0 }));
dit('une quantité négative vaut zéro', 0, ligneBruteXof({ ...huile, qty: -3 }));

/* ── ② LA GAMME D'UN RENDEZ-VOUS ─────────────────────────────────
   LE POURCENTAGE DU RENDEZ-VOUS PORTE SUR TOUT (arbitrage du 5 septembre 2026,
   « la remise famille s'applique sur tout le rendez-vous ») : un compte à
   −15 % est à −15 % partout, et c'est ce que la Maison dit à sa cliente. */
const panier: LigneGamme[] = [
  { id: 'p-huile', qty: 2, prixXof: 12500, remise: { pct: 10 } },
  { id: 'p-bonnet', qty: 1, prixXof: 8000 },
];
dit('le plein de la Gamme', 33000, gammeBruteXof(panier));
dit('… après les remises de ligne', 30500, gammeNetteXof(panier));
dit('… puis le pourcentage du rendez-vous', 25925, gammeNetteXof(panier, 15));
dit('ce que les remises retirent', 7075, gammeEconomieXof(panier, 15));
/* UN FORFAIT ÉTEINT LE POURCENTAGE (on ne remise pas un prix négocié) : la
   Gamme s'ajoute alors à son net de ligne, sans rien de plus. */
dit('sans pourcentage, le net de ligne', 30500, gammeNetteXof(panier, 0));
dit('une Gamme vide vaut zéro', 0, gammeNetteXof(undefined, 15));

/* ── ③ POSER, RETIRER, REMISER ───────────────────────────────────
   LE PRIX SE FIGE À LA PREMIÈRE POSE : une seconde unité ajoutée le lendemain
   ne retarife pas la première. */
const p1 = poseUnProduit([], { id: 'p-huile', priceXof: 12500 });
dit('un produit posé', [{ id: 'p-huile', qty: 1, prixXof: 12500 }], p1);
const p2 = poseUnProduit(p1, { id: 'p-huile', priceXof: 14000 });
dit('la seconde unité ne retarife pas la première', [{ id: 'p-huile', qty: 2, prixXof: 12500 }], p2);
dit('en retirer une', 1, poseUnProduit(p2, { id: 'p-huile', priceXof: 12500 }, -1)[0].qty);
/* TOMBER À ZÉRO, C'EST DISPARAÎTRE : une ligne à zéro flacon sur une facture
   n'est pas une information, c'est un doute. */
dit('à zéro, la ligne disparaît', 0, poseUnProduit(p1, { id: 'p-huile', priceXof: 12500 }, -1).length);
dit('retirer tout un produit', 0, retireUnProduit(p2, 'p-huile').length);
dit('retirer ce qui n’y est pas ne casse rien', 1, retireUnProduit(p2, 'p-inconnu').length);
dit('la remise se pose sur la bonne ligne', { pct: 20 },
  remiseDeLaLigne(panier, 'p-bonnet', { pct: 20 }).find((l) => l.id === 'p-bonnet')?.remise);
dit('… et ne touche pas la voisine', { pct: 10 },
  remiseDeLaLigne(panier, 'p-bonnet', { pct: 20 }).find((l) => l.id === 'p-huile')?.remise);

/* ── ④ LE TARIF QUI A BOUGÉ ──────────────────────────────────────
   Le prix figé fait foi, MAIS le comptoir doit pouvoir le dire : sans quoi la
   Maison vendrait à perte sans jamais le voir. */
const cat = new Map([['p-huile', { priceXof: 14000 }], ['p-bonnet', { priceXof: 8000 }]]);
dit('l’écart est nommé', [{ id: 'p-huile', poseXof: 12500, catalogueXof: 14000 }], ecartsDeTarif(panier, cat));
dit('un produit disparu du catalogue ne fait pas un écart', [],
  ecartsDeTarif([{ id: 'p-fantome', qty: 1, prixXof: 5000 }], cat));

/* ── ⑤ L'ÉTAGÈRE ─────────────────────────────────────────────────
   LE STOCK NE SE RÉSERVE PAS (arbitrage du 5 septembre) : le rendez-vous
   ANNONCE, il ne retient pas. La Maison voit le risque et décide. */
dit('deux demandés, six en rayon', false, manqueALEtagere(panier[0], 6));
dit('deux demandés, un seul en rayon', true, manqueALEtagere(panier[0], 1));
dit('un rayon vide manque toujours', true, manqueALEtagere(panier[1], 0));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);

/* ══ LA GAMME RÉGLÉE SE GRAVE — 7 septembre 2026 ═════════════════════
   « Arrange-moi tout ça que chaque paiement aille à sa place » (Yéman). Rien
   ne marquait une Gamme encaissée : la pastille disait « à régler » à vie, et
   rouvrir l'écran d'encaissement remplissait le panier une seconde fois — le
   même flacon se serait facturé deux fois. */
const promesse: LigneGamme[] = [
  { id: 'p-huile', qty: 1, prixXof: 12_000 },
  { id: 'p-baume', qty: 2, prixXof: 9_000 },
];
dit('rien de gravé, tout reste à régler', ['p-huile', 'p-baume'],
  lignesARegler(promesse).map((l) => l.id));
dit('… et rien n’est « tout réglé »', false, gammeTouteReglee(promesse));

/* LE PANIER COUVRE TOUT : les deux lignes se gravent, datées. */
const toutPris = graveLesLignesReglees(promesse, { 'p-huile': 1, 'p-baume': 2 }, '2026-09-07')!;
dit('tout couvert, tout gravé', ['2026-09-07', '2026-09-07'], toutPris.map((l) => l.regleeAt));
dit('… plus rien à régler', [], lignesARegler(toutPris).map((l) => l.id));
dit('… et la Gamme se dit réglée', true, gammeTouteReglee(toutPris));

/* ENCAISSÉE À MOITIÉ, LA LIGNE RESTE OUVERTE : c'est le comptoir qui a choisi
   d'en garder pour plus tard, pas la machine. */
const moitie = graveLesLignesReglees(promesse, { 'p-huile': 1, 'p-baume': 1 }, '2026-09-07')!;
dit('la quantité entamée reste due', ['p-baume'], lignesARegler(moitie).map((l) => l.id));
dit('… et l’huile est gravée', '2026-09-07', moitie[0].regleeAt);

/* UNE LIGNE DÉJÀ GRAVÉE NE SE REGRAVE PAS : sa date est celle du jour où
   l'argent est entré, pas du dernier passage à l'écran. */
const regrave = graveLesLignesReglees(toutPris, { 'p-huile': 1 }, '2026-12-25')!;
dit('une gravure ne se réécrit pas', '2026-09-07', regrave[0].regleeAt);

/* UNE GAMME VIDE N'EST PAS « RÉGLÉE », elle est absente : la pastille ne doit
   rien afficher, ni cuivre ni apaisé. */
dit('une gamme vide n’est pas réglée', false, gammeTouteReglee([]));
dit('… ni une gamme absente', false, gammeTouteReglee(undefined));
dit('… et graver l’absence rend l’absence', undefined, graveLesLignesReglees(undefined, {}, '2026-09-07'));
