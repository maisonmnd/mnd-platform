/* L'ARRONDI DU CODE ET LA REMISE GAMME, EPROUVES — 23 octobre 2026.
   `node scripts/verifie-l-arrondi-du-code.mjs` (et `--prouve`).

   Les mots de Yeman : « Quand les codes promos sont mis, calcules et
   arrondis au franc suivant. Pas de monnaie » (au selecteur : au 1 000 F
   superieur), puis « Ne pas faire de remise sur la gamme quand je passe un
   code de reduction sur les services. La gamme doit avoir sa remise a part.
   ROSE15 est 15 % hors gamme » (au selecteur : une case Remise gamme).

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de ces phrases et du ticket de
   sa capture (84 000 F, ROSE15 a 8 250 F), jamais du code eprouve. Le
   cablage de la Caisse se lit dans la source, commentaires effaces. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { leTicket, remiseDeLaLigne } from '../src/apps/trone/routes/vente/encaissement-pur';
import { invoiceTotal, ligneFacture, type Invoice } from '../src/shared/finance';

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
const caisse = source('src/apps/trone/routes/vente/Caisse.tsx');

const sans = { remisePct: 0, remiseXof: 0, remiseDuRendezVousXof: 0, dejaRecuXof: 0, nomDuCode: 'ROSE15' };

/* ══ #1 — LE NET DU CODE MONTE AU MILLIER SUPERIEUR ══ */
{
  const t = leTicket({ ...sans, sousTotalXof: 84_000, prestationsXof: 55_000, promoBrutXof: 8_250 });
  dit(1, 'la capture : 84 000 F, ROSE15 a 8 250 F -> 76 000 F, la remise rend 250 F', [76_000, 8_000, 250, true], [t.netXof, t.promoXof, t.arrondiXof, t.cumul.codeConsomme]);
  const rond = leTicket({ ...sans, sousTotalXof: 80_000, prestationsXof: 80_000, promoBrutXof: 12_000 });
  dit(1, 'un net deja rond (68 000 F) ne bouge pas', [68_000, 12_000, 0], [rond.netXof, rond.promoXof, rond.arrondiXof]);
  /* LA REGLE, sur toute une plage : chaque fois que le code gagne, le net
     tombe sur un millier, ne descend jamais sous ce que le code donnait et
     ne depasse jamais le sous-total. */
  const fautes: string[] = [];
  for (const sous of [10_000, 47_350, 84_000, 123_475]) {
    for (let brut = 1; brut < 20_000; brut += 37) {
      const x = leTicket({ ...sans, sousTotalXof: sous, prestationsXof: sous, promoBrutXof: brut });
      if (!x.cumul.codeConsomme) continue;
      /* Un code ne retire jamais plus que le ticket : le net du code ne descend pas sous zéro. */
      const plancher = Math.max(0, sous - brut);
      if (x.netXof % 1000 !== 0 || x.netXof < plancher || x.netXof > sous || x.netXof - plancher >= 1000) fautes.push(`${sous}/${brut}->${x.netXof}`);
    }
  }
  dit(1, 'la regle sur 2 160 tickets : millier rond, jamais plus que le code, jamais 1 000 F de trop', [], fautes.slice(0, 5));
}

/* ══ #2 — UN CODE QUE L'ARRONDI RAMENE SOUS LA REMISE POSEE NE GAGNE PLUS ══ */
{
  const t = leTicket({ ...sans, sousTotalXof: 80_000, prestationsXof: 80_000, remisePct: 10, promoBrutXof: 8_400 });
  dit(2, '-10 % poses (8 000 F) contre un code a 8 400 F arrondi a 8 000 F : la remise posee reste, le code aussi', [72_000, 0, false], [t.netXof, t.promoXof, t.cumul.codeConsomme]);
}

/* ══ #3 — L'ARRONDI QUI MANGE TOUT LE CODE SE DIT ══ */
{
  const t = leTicket({ ...sans, sousTotalXof: 10_000, prestationsXof: 10_000, promoBrutXof: 500 });
  dit(3, '10 000 F a -5 % : l arrondi reprend les 500 F, le code n est pas consomme, et l ecran le dit', [10_000, 0, false, true], [t.netXof, t.promoXof, t.cumul.codeConsomme, t.codeMangeParLArrondi]);
  dit(3, 'Caisse : le message de l arrondi qui mange le code', true, /ticket\.codeMangeParLArrondi && \(/.test(caisse));
}

/* ══ #4 — LA PIECE DIT LE MEME NET QUE LE TICKET ══ */
{
  const t = leTicket({ ...sans, sousTotalXof: 84_000, prestationsXof: 55_000, promoBrutXof: 8_250 });
  const piece = { lines: [ligneFacture('Rituel', 55_000), ligneFacture('Produits', 29_000)], globalDiscountPct: t.remisePct, globalDiscountXof: t.remiseXof + t.remiseDuRendezVousXof + t.promoXof } as unknown as Invoice;
  dit(4, 'la piece ecrite : 76 000 F (invoiceTotal)', 76_000, invoiceTotal(piece));
}

/* ══ #5 — LA REMISE GAMME : LES PRODUITS SEULS, A PART DU CODE ══ */
{
  dit(5, 'un produit prend la remise gamme ; la plus forte des deux, jamais empilees', [10, 20, 10], [remiseDeLaLigne('product', 0, 10), remiseDeLaLigne('product', 20, 10), remiseDeLaLigne('product', 5, 10)]);
  dit(5, 'une prestation et une formation ne la prennent jamais', [0, 15, 5], [remiseDeLaLigne('service', 0, 10), remiseDeLaLigne('service', 15, 10), remiseDeLaLigne('formation', 5, 10)]);
  /* 55 000 F de prestations, 29 000 F de gamme a -10 % (26 100 F), ROSE15 sur
     les prestations seules (8 250 F) : 81 100 - 8 250 = 72 850 -> 73 000 F. */
  const gamme = 29_000 * (1 - remiseDeLaLigne('product', 0, 10) / 100);
  const t = leTicket({ ...sans, sousTotalXof: 55_000 + gamme, prestationsXof: 55_000, promoBrutXof: 8_250 });
  dit(5, 'la gamme a -10 % et ROSE15 hors gamme : 73 000 F, le code gagne, la gamme garde sa remise', [26_100, 73_000, true], [gamme, t.netXof, t.cumul.codeConsomme]);
  const piece = { lines: [ligneFacture('Rituel', 55_000), ligneFacture('Produits', 29_000, 1, 10)], globalDiscountPct: t.remisePct, globalDiscountXof: t.remiseXof + t.remiseDuRendezVousXof + t.promoXof } as unknown as Invoice;
  dit(5, '... et la piece dit 73 000 F, la remise gamme sur la ligne du produit', 73_000, invoiceTotal(piece));
}

/* ══ #6 — LE CABLAGE DE LA CAISSE ══ */
dit(6, 'Caisse : la remise gamme passe par la ligne, la piece l ecrit, le ticket neuf la remet a zero', [true, true, true, true, true], [
  /const discEff = remiseDeLaLigne\(it\.kind, v\.disc, remiseGamme\);/.test(caisse),
  /const netXof = unit \* v\.qty \* \(1 - discEff \/ 100\);/.test(caisse),
  /ligneFacture\(l\.n, l\.unit, l\.qty, l\.discEff\)/.test(caisse),
  /setGlobalDiscXof\(0\);\n\s*setRemiseGamme\(0\);/.test(caisse),
  /onClick=\{\(\) => setRemiseGamme\(taux\)\}/.test(caisse),
]);
dit(6, 'Caisse : le code ne vise que les prestations (ROSE15 hors gamme)', true,
  /const lignesRemisables = lines\n\s*\.filter\(\(l\) => l\.kind === 'service'\)\n\s*\.map\(\(l\) => \(\{ serviceId: l\.key\.slice\(2\), montantXof: Math\.round\(l\.netXof\) \}\)\);/.test(caisse));

console.log(ko === 0 ? 'Tout tient.' : `${ko} constat(s) en echec.`);
