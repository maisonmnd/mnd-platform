/* L'ARRONDI DES REMISES EN POURCENTAGE, EPROUVE — 7 novembre 2026.
   `node scripts/verifie-arrondi-des-remises.mjs` (et `--prouve`).

   Les mots de Yeman : « arrondis les pourcentages, pas de monnaie, arrondis
   au franc rond suivant » ; au selecteur : AU 500 F SUPERIEUR, pour TOUTES
   les remises en pourcentage. Exemples d'elle : 28 050 F -> 28 500 F ;
   36 000 F -> 36 000 F ; 93 600 F -> 94 000 F ; 95 200 F -> 95 500 F ;
   26 400 F -> 26 500 F.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de ces phrases, jamais du code
   eprouve. Le cablage se lit dans les sources, commentaires effaces. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  arrondiAuCinqCents, prixApresRemisePct, remiseEnFrancsArrondie, arrondiEnVigueur, figeLaLigne, figeLesRemisesDeLaPiece,
  LE_JOUR_DE_L_ARRONDI, PALIER_DES_REMISES_XOF,
} from '../src/shared/arrondi-des-remises-pur';
import { forfaitPriceXof, pricingOf, type PersonalPricing, type ModelBand } from '../src/shared/pricing';
import { invoiceTotal, ligneNetXof } from '../src/shared/finance-pur';
import type { Invoice } from '../src/shared/finance';
import { leTicket } from '../src/apps/trone/routes/vente/encaissement-pur';
import { laRemiseSurTout, remiseFamilleEnFrancs } from '../src/apps/trone/routes/clients/places-au-trone-pur';
import { leChiffreDuPanier } from '../src/apps/couronne/places-pure';
import { apptNetXof } from '../src/apps/trone/routes/clients/_shared';
import type { Appointment } from '../src/shared/agenda';
import type { Service } from '../src/shared/catalog';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 220)}`));
};

const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};

/* ══ #1 — LES EXEMPLES DE YEMAN : AU 500 F SUPERIEUR ══ */
dit(1, 'ses cinq exemples', [28_500, 36_000, 94_000, 95_500, 26_500],
  [28_050, 36_000, 93_600, 95_200, 26_400].map(arrondiAuCinqCents));
dit(1, 'le palier est 500 F, le jour est le 7 novembre 2026', [500, '2026-11-07'], [PALIER_DES_REMISES_XOF, LE_JOUR_DE_L_ARRONDI]);
dit(1, 'un multiple de 500 F reste le sien, 1 F de plus monte d un palier', [500, 500, 1_000, 0], [arrondiAuCinqCents(500), arrondiAuCinqCents(1), arrondiAuCinqCents(501), arrondiAuCinqCents(0)]);
dit(1, 'la poussiere de virgule ne fait pas monter : 28 000,0000001 -> 28 000', 28_000, arrondiAuCinqCents(28_000.0000001));

/* ══ #2 — LES BORNES ══ */
dit(2, 'une remise de 0 % ne change rien, meme sur un prix qui n est pas rond', [10_250, 36_000], [prixApresRemisePct(10_250, 0), prixApresRemisePct(36_000, 0)]);
dit(2, '100 % = 0 F', 0, prixApresRemisePct(80_000, 100));
dit(2, 'jamais au-dela du prix plein : 10 250 F a 1 % reste 10 250 F, pas 10 500 F', 10_250, prixApresRemisePct(10_250, 1));
dit(2, '117 000 F a 20 % : 93 600 F exact -> 94 000 F', 94_000, prixApresRemisePct(117_000, 20));
dit(2, 'un pourcentage fractionnaire (50/3) : 60 000 F -> 50 000 F', 50_000, prixApresRemisePct(60_000, 50 / 3));
dit(2, 'illisible ou negatif : zero, ou le prix plein', [0, 0, 20_000, 20_000],
  [prixApresRemisePct(NaN, 10), prixApresRemisePct(-5, 10), prixApresRemisePct(20_000, -10), prixApresRemisePct(20_000, NaN)]);
dit(2, 'la remise en francs est le complement', 6_000, remiseEnFrancsArrondie(30_000, 20));
dit(2, 'la porte de date', [false, true, true, false],
  [arrondiEnVigueur('2026-11-06'), arrondiEnVigueur('2026-11-07'), arrondiEnVigueur('2026-11-07T10:00:00Z'), arrondiEnVigueur(undefined)]);

/* ══ #3 — LA REGLE SUR TOUTE UNE PLAGE ══ */
{
  const fautes: string[] = [];
  let n = 0;
  for (const plein of [10_250, 26_000, 33_333, 84_000, 131_000, 144_000, 250_000]) {
    for (const pct of [1, 5, 10, 15, 17, 20, 22, 25, 33, 37, 50, 99, 100 / 3]) {
      n++;
      const exact = plein * (1 - pct / 100);
      const r = prixApresRemisePct(plein, pct);
      const borne = r >= exact - 1e-6 && r <= plein && (r % 500 === 0 || r === plein) && (r - exact < 500 || r === plein);
      if (!borne) fautes.push(`${plein}/${pct}->${r}`);
    }
  }
  dit(3, `sur ${n} cas : jamais sous le prix exact, jamais au-dela du plein, un multiple de 500 F, jamais 500 F de trop`, [], fautes.slice(0, 5));
}

/* ══ #4 — LE FORFAIT DE LA CAPTURE : 20 % PAR CALIBRE ══ */
{
  const bandes = [{ id: 'b1', label: 'b1', maxLocks: 280, coef: 1, durCoef: 1 }] as unknown as ModelBand[];
  const p: PersonalPricing = pricingOf({ lockCount: 240, priceCoef: 1 }, bandes);
  const sv = (id: string, priceXof: number, plus: object = {}) =>
    ({ id, categoryId: 'c', name: id, palier: 'Fondation', priceXof, hidePrice: false, sessions: 1, master: 'B', durationMin: 60, order: 1, ...plus }) as unknown as Service;
  const cas: [number, number, number][] = [[117_000, 93_600, 94_000], [119_000, 95_200, 95_500], [121_000, 96_800, 97_000], [144_000, 115_200, 115_500], [131_000, 104_800, 105_000]];
  for (const [compo, avant, apres] of cas) {
    const a = sv('a', compo);
    const forfait = sv('f', 0, { includes: [{ serviceId: 'a' }], forfaitRemisePct: 20 });
    dit(4, `forfait a 20 % sur ${compo} F : ${avant} F devient ${apres} F`, apres, forfaitPriceXof(forfait, p, [a, forfait]));
  }
}

/* ══ #5 — LE PASSE NE BOUGE PAS ══ */
{
  /* Un rendez-vous honore d'octobre avec 15 % : son prix au franc pres. */
  const svc = { id: 'svA', name: 'A', priceXof: 33_000 } as unknown as Service;
  const byId = new Map<string, Service>([['svA', svc]]);
  const rdv = { id: 'r1', clientId: '', status: 'honoré', date: '2026-10-20', time: '10:00', serviceIds: ['svA'], priceXof: 33_000, discountPct: 15, creeLe: '2026-10-12T08:00:00Z' } as unknown as Appointment;
  dit(5, 'un RDV honore d octobre a 15 % : 33 000 F -> 28 050 F, au franc pres (pas 28 500 F)', 28_050, apptNetXof(rdv, byId));
  const avenir = { ...rdv, id: 'r2', status: 'confirmé', date: '2026-11-20' } as Appointment;
  dit(5, 'un RDV a venir deja pose avec 15 % garde son prix pose : 28 050 F', 28_050, apptNetXof(avenir, byId));
  /* Une piece d'octobre : lignes et remise globale en %, inchangees. */
  const ligne = { id: 'l1', label: 'Rituel', qty: 1, unitXof: 33_000, discountPct: 15 };
  const piece = { id: 'inv1', lines: [ligne], globalDiscountPct: 10, date: '2026-10-20' } as unknown as Invoice;
  dit(5, 'une piece d octobre (15 % de ligne puis 10 % global) : 25 245 F', 25_245, invoiceTotal(piece));
  const reenregistree = figeLesRemisesDeLaPiece(piece, piece);
  dit(5, '... re-enregistree sans y toucher, elle garde son total et ses pourcentages', [25_245, 15, 10],
    [invoiceTotal(reenregistree), reenregistree.lines[0].discountPct, reenregistree.globalDiscountPct]);
  const l2 = { id: 'l2', label: 'Soin', qty: 1, unitXof: 10_000, discountPct: 12 };
  const p2 = { ...piece, globalDiscountPct: 0, lines: [ligne, l2] } as unknown as Invoice;
  const ap = figeLesRemisesDeLaPiece({ ...p2, lines: [ligne, { ...l2, discountPct: 50 }] } as unknown as Invoice, p2);
  dit(5, '... et seule la ligne retouchee se fige (50 % de 10 000 F : 5 000 F), l autre garde ses 15 %', [0, 5_000, 15],
    [ap.lines[1].discountPct, ap.lines[1].discountXof, ap.lines[0].discountPct]);
}

/* ══ #6 — LES PIECES NEUVES : LE POURCENTAGE S'ECRIT EN FRANCS, ARRONDI ══ */
{
  const l = figeLaLigne({ id: 'l', label: 'Rituel', qty: 1, unitXof: 33_000, discountPct: 15 } as never, null) as unknown as { discountPct: number; discountXof: number };
  dit(6, 'une ligne neuve a 15 % : 33 000 F -> 28 500 F, ecrit en francs', [0, 4_500, 28_500], [l.discountPct, l.discountXof, ligneNetXof(l as never)]);
  const p = figeLesRemisesDeLaPiece({ id: 'p', lines: [{ id: 'l', label: 'R', qty: 1, unitXof: 33_000, discountPct: 0 }], globalDiscountPct: 15, date: '2026-11-08' } as unknown as Invoice, null);
  dit(6, 'une remise globale neuve de 15 % : 28 050 F -> 28 500 F, nommee Remise 15 %', [28_500, 0, 'Remise 15 %'], [invoiceTotal(p), p.globalDiscountPct, p.discountLabel]);
  const q = figeLesRemisesDeLaPiece({ id: 'p', lines: [{ id: 'l', label: 'R', qty: 2, unitXof: 20_000, discountPct: 10 }], globalDiscountPct: 10, globalDiscountXof: 1_000, date: '2026-11-08' } as unknown as Invoice, null);
  dit(6, 'ligne 10 % (36 000 F) puis global 10 % (32 400 -> 32 500 F) puis 1 000 F : 31 500 F', 31_500, invoiceTotal(q));
}

/* ══ #7 — LA CAISSE : LE TICKET ET LA PIECE DISENT LE MEME NET ══ */
{
  const base = { remiseXof: 0, remiseDuRendezVousXof: 0, dejaRecuXof: 0, promoBrutXof: 0, nomDuCode: '' };
  const t = leTicket({ ...base, sousTotalXof: 33_000, prestationsXof: 33_000, remisePct: 15 });
  dit(7, 'ticket : -15 % sur 33 000 F -> 28 500 F, ecrit en francs (pas de pourcentage)', [28_500, 0, 4_500], [t.netXof, t.remisePct, t.remiseXof]);
  const piece = { lines: [{ id: 'l', label: 'R', qty: 1, unitXof: 33_000, discountPct: 0 }], globalDiscountPct: t.remisePct, globalDiscountXof: t.remiseXof } as unknown as Invoice;
  dit(7, 'la piece du ticket dit le meme net', 28_500, invoiceTotal(piece));
  const z = leTicket({ ...base, sousTotalXof: 36_000, prestationsXof: 36_000, remisePct: 0 });
  dit(7, 'sans remise : rien ne change', [36_000, 0], [z.netXof, z.remiseXof]);
  const g = leTicket({ ...base, sousTotalXof: 33_000, prestationsXof: 22_000, remisePct: 15 });
  dit(7, 'avec de la gamme (22 000 F de prestations sur 33 000 F) : net 28 500 F, la part des prestations 19 000 F', [28_500, 19_000], [g.netXof, g.partNetteXof]);
}

/* ══ #8 — LE CARNET, LA FAMILLE, MA COURONNE ══ */
{
  dit(8, 'fenetre du Carnet : -15 % neuf sur 33 000 F -> 4 500 F, ecrit en francs', { pctXof: 4_500, xof: 0, netXof: 28_500, enFrancs: true },
    laRemiseSurTout({ brutXof: 33_000, sansRemiseXof: 0, pct: 15, xof: 0, arrondi: true }));
  dit(8, 'fenetre rouverte sur un pourcentage deja pose : le calcul d hier, 4 950 F', { pctXof: 4_950, xof: 0, netXof: 28_050, enFrancs: false },
    laRemiseSurTout({ brutXof: 33_000, sansRemiseXof: 0, pct: 15, xof: 0 }));
  dit(8, 'remise famille en francs : 15 % de 33 000 F -> 4 500 F', 4_500, remiseFamilleEnFrancs([{ net: 33_000 }], 15));
  const c = leChiffreDuPanier({ lignes: [{ id: 'a', prixXof: 33_000 } as never], famillePct: 15 });
  dit(8, 'Ma Couronne : le prix annonce a la famille 15 % : 28 500 F', [28_500, 4_500], [c.prix, c.remiseFamille]);
  const o = leChiffreDuPanier({ lignes: [{ id: 'a', prixXof: 33_000 } as never], famillePct: 0, offreDeSaisonPct: 15 });
  dit(8, 'Ma Couronne : l offre de saison 15 % : 28 500 F, en francs', [28_500, 4_500, 'offre'], [o.prix, o.remiseOffre, o.retenue]);
}

/* ══ #9 — LE CABLAGE ══ */
{
  const pricing = source('src/shared/pricing.ts');
  const caisse = source('src/apps/trone/routes/vente/Caisse.tsx');
  const factures = source('src/apps/trone/routes/vente/Factures.tsx');
  const partage = source('src/apps/trone/routes/clients/_shared.tsx');
  const catalogue = source('src/apps/trone/routes/vente/Catalogue.tsx');
  const booking = source('src/apps/couronne/Booking.tsx');
  const ticket = source('src/apps/trone/routes/vente/encaissement-pur.ts');
  dit(9, 'le forfait du Catalogue et son apercu passent par la regle', [true, true, true, true], [
    /return prixApresRemisePct\(somme, remise\);/.test(pricing),
    /prixApresRemisePct\(inclusValeur, remisePct\)/.test(catalogue),
    /prixApresRemisePct\(inclusValeurHaute, remisePct\)/.test(catalogue),
    /prix: prixApresRemisePct\(compo, remisePct\)/.test(catalogue),
  ]);
  dit(9, 'la Caisse : la ligne et la piece passent par la regle', [true, true], [
    /const netXof = prixApresRemisePct\(unit \* v\.qty, discEff\);/.test(caisse),
    /figeLaLigne\(ligneFacture\(l\.n, l\.unit, l\.qty, l\.discEff\), null\)/.test(caisse),
  ]);
  dit(9, 'le ticket : le pourcentage monte par la regle et s ecrit en francs', [true, true], [
    /const resteApresPct = prixApresRemisePct\(Math\.round\(sous - sans\), pctEff\);/.test(ticket),
    /const enFrancs = pctEff > 0;/.test(ticket),
  ]);
  dit(9, 'les Factures : l enregistrement et l apercu figent les pourcentages neufs', [true, true], [
    /const d = figeLesRemisesDeLaPiece\(dBrut, editing\.mode === 'edit' \? invoices\.find/.test(factures),
    /const apercu = editing\s*\? figeLesRemisesDeLaPiece\(editing\.draft/.test(factures),
  ]);
  dit(9, 'la fenetre du Carnet pose l arrondi seulement sur un pourcentage neuf', true,
    /arrondi: !\(appt && \(appt\.discountPct \?\? 0\) === discountPct\),/.test(partage));
  dit(9, 'Ma Couronne ecrit l offre de saison en francs, jamais en pourcentage', [true, false], [
    /\? \{ discountXof: chiffre\.remiseOffre \}/.test(booking),
    /discountPct: chiffre\.pctOffre/.test(booking),
  ]);
}

console.log(ko === 0 ? 'Tout tient.' : `${ko} constat(s) en echec.`);
