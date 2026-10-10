/* LA NOUVELLE GRILLE, ÉPROUVÉE — 10 octobre 2026 (lot 1, « maintenant »).

   La genèse des prix : la carte est une donnée (shared/nouvelle-grille-pur),
   appliquée une fois depuis le Trône. Ce banc tient la RÈGLE, pas le cas du
   jour :
   - le juge ne touche qu'une ligne restée telle qu'on la connaît, et rejoué
     il ne fait rien ;
   - « maintenant » ne monte AUCUN prix (les hausses attendent janvier) ;
   - toute nouveauté est masquée du site et de Ma Couronne jusqu'en janvier ;
   - une archivée n'est proposée à personne ; une ligne offerte d'un forfait
     ne se paie pas ;
   - les prix des venues nommées sont ceux de la maquette validée, rendus par
     le vrai moteur.
   Les attendus sont écrits à la main (la maquette du 10 octobre).
   `node scripts/verifie-la-nouvelle-grille.mjs` ; `--prouve` remet chaque
   faute une à une et exige que le banc crie. */
import { readFileSync } from 'node:fs';
import {
  appliqueLaGrille, egaux, masquesDeLaGrille, MASQUEES_JUSQUEN_JANVIER, NAISSANCES, PHRASES, RETOUCHES,
} from '../src/shared/nouvelle-grille-pur';
import { MODEL_BANDS_SEED, pricingOf, personalPriceXof, estProposable, type PersonalPricing } from '../src/shared/pricing';
import type { Service } from '../src/shared/catalog';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};
const JOUR = '2026-10-10';

/* ── 1. L'égalité ignore l'ordre des clés (le jsonb les rend dans un autre) ── */
dit('egaux : ordre des cles', true, egaux({ court: 1, long: 3, 'mi-long': 2 }, { long: 3, court: 1, 'mi-long': 2 }));
dit('egaux : une valeur differente', false, egaux({ court: 1 }, { court: 2 }));
dit('egaux : absent et undefined', true, egaux({ a: 1, b: undefined }, { a: 1 }));

/* ── 2. Le juge, sur un petit catalogue écrit à la main ── */
const svcs = [
  { id: 'sv-atl-ii-l', name: 'SÍNSIN™ Élaboré · La Reprise Longue Durée' },
  { id: 'sv-koko-sui', name: 'KÒKÒ™ Suivi par la Maison' },                       // renommé à la main : on n'y touche pas
  { id: 'sv-kids-kloklo', name: 'KLƆKLƆ™ Kids · Le Shampoing « Le Souffle »', prixBarreXof: 10000 },
  { id: 'sv-plt-45-std', name: 'GBÀTÀ™ Standard · Le Défaisage' },
  { id: 'sv-plt-45-int', name: 'GBÀTÀ™ Intégral · Le Défaisage', consultationAvant: false }, // posé à la main
  { id: 'aqua-locks-ritual', name: 'AQUA LOCKS RITUAL™ · Le Soin Ultra-Hydratant' },
  { id: 'sv-stu-a-nat-m', name: 'Nattes Couronne', archived: false },              // rétablie à la main
  { id: 'sv-atl-iv-ala-c', name: 'ÀLÀLÀ™', prixParLongueur: { long: 200000, court: 110000, 'mi-long': 150000 },
    description: 'Le rituel. Engagement 3 séances minimum. Fin.' },
  { id: 'sv-atl-iii-lum-c', name: 'YÈKPÈ™ Couleur Lumière · La Brillance Signature', priceXof: 30000 }, // recotée à la main
];
const cats = [
  { id: 'cat-defaisage', fon: 'GBÀTÀ™', label: 'Le Défaisage', parentId: 'atl-iv-finfin' },
  { id: 'koko', label: 'Le Diagnostic' },
];
const b = appliqueLaGrille({ services: svcs, categories: cats }, 'maintenant', JOUR);
const sv = (id: string) => b?.services.find((x) => x.id === id) as Record<string, unknown> | undefined;
dit('renomme une ligne restee telle quelle', 'SÍNSIN™ Signature · La Reprise Longue Durée', sv('sv-atl-ii-l')?.name);
dit('une ligne renommee a la main reste', 'KÒKÒ™ Suivi par la Maison', sv('sv-koko-sui')?.name);
dit('le prix barre s efface (cle absente)', false, 'prixBarreXof' in (sv('sv-kids-kloklo') ?? {}));
dit('une regle posee absente devient vraie', true, sv('sv-plt-45-std')?.consultationAvant);
dit('une regle posee a false par la main reste', false, sv('sv-plt-45-int')?.consultationAvant);
dit('archivee, datee du jour', [true, JOUR], [sv('aqua-locks-ritual')?.archived, sv('aqua-locks-ritual')?.archivedLe]);
dit('retablie a la main : on ne la rearchive pas', false, sv('sv-stu-a-nat-m')?.archived);
dit('ALALA : le long passe a 180 000, ordre des cles indifferent', 180000, (sv('sv-atl-iv-ala-c')?.prixParLongueur as Record<string, number>)?.long);
dit('ALALA : la phrase des seances change une fois', 'Le rituel. En deux séances. Fin.', sv('sv-atl-iv-ala-c')?.description);
dit('une ligne recotee a la main garde son prix', 30000, sv('sv-atl-iii-lum-c')?.priceXof);
dit('la categorie du defaisage devient un chapitre', [undefined, 'Le Dénouement'],
  [(b?.categories.find((c) => c.id === 'cat-defaisage') as Record<string, unknown>)?.parentId, (b?.categories.find((c) => c.id === 'cat-defaisage') as Record<string, unknown>)?.label]);
const nes = NAISSANCES.filter((n) => n.temps === 'maintenant').map((n) => n.fiche.id);
dit('les naissances arrivent', nes, nes.filter((id) => (b?.services ?? []).concat(b?.categories ?? []).some((x) => x.id === id)));
dit('rejouee : rien a faire', null, appliqueLaGrille({ services: b?.services ?? [], categories: b?.categories ?? [] }, 'maintenant', JOUR));
dit('catalogue vide : seules les naissances (le runner l en garde)', nes.length, appliqueLaGrille({ services: [], categories: [] }, 'maintenant', JOUR)?.faits.length);

/* ── 3. La règle des données : MAINTENANT NE MONTE AUCUN PRIX ── */
const CHAMPS_PRIX = ['priceXof', 'prixParLongueur', 'priceFloors', 'tarifLockParLongueur', 'ratePerLock', 'prixBarreXof'];
const hausses: string[] = [];
for (const r of RETOUCHES) {
  if (r.temps !== 'maintenant') continue;
  for (const k of CHAMPS_PRIX) {
    if (!(k in r.pose) || k === 'prixBarreXof') continue;
    /* Un champ de prix NOUVEAU se compare au prix unique d'avant. */
    const av = r.si[k] !== undefined ? r.si[k] : (k !== 'priceXof' && typeof r.si.priceXof === 'number' ? r.si.priceXof : undefined);
    const ap = r.pose[k];
    if (typeof av === 'number' && typeof ap === 'number' && ap > av) hausses.push(`${r.id}.${k}`);
    if (ap && typeof ap === 'object' && (typeof av === 'number' || (av && typeof av === 'object'))) {
      for (const [sk, v] of Object.entries(ap as Record<string, number>)) {
        const w = typeof av === 'number' ? av : (av as Record<string, number>)[sk];
        if (typeof w !== 'number' || v > w) hausses.push(`${r.id}.${k}.${sk}`);
      }
    }
    if (av === undefined && k !== 'priceXof') hausses.push(`${r.id}.${k} (sans prix connu)`);
  }
}
dit('maintenant : aucune hausse de prix', [], hausses);
const masquees = new Set(MASQUEES_JUSQUEN_JANVIER);
dit('maintenant : chaque nouveaute est masquee jusqu en janvier', [],
  NAISSANCES.filter((n) => n.quoi === 'service' && n.temps === 'maintenant' && !masquees.has(n.fiche.id)).map((n) => n.fiche.id));
const MOTS = /—|salon|Kolétan|Kolétan|Essentielle|Abonnement :/i;
dit('aucun nom pose ne porte un mot interdit', [],
  RETOUCHES.filter((r) => typeof r.pose.name === 'string' && MOTS.test(r.pose.name as string)).map((r) => r.id)
    .concat(NAISSANCES.filter((n) => MOTS.test(String(n.fiche.name ?? n.fiche.fon ?? ''))).map((n) => n.fiche.id)));
dit('aucune phrase posee ne porte un mot interdit', [], PHRASES.filter((p) => MOTS.test(p.apres)).map((p) => p.id));

/* ── 4. Les masques de la vitrine ── */
const cfg = { hiddenServices: ['autre'], siteMasques: { services: ['x'], categories: ['c'] } };
const m1 = masquesDeLaGrille(cfg, 'maintenant');
dit('maintenant : les nouveautes masquees partout, le reste garde',
  [['autre', ...MASQUEES_JUSQUEN_JANVIER], ['x', ...MASQUEES_JUSQUEN_JANVIER], ['c']],
  [m1?.hiddenServices, m1?.siteMasques.services, m1?.siteMasques.categories]);
dit('maintenant rejoue : rien', null, masquesDeLaGrille(m1 ?? cfg, 'maintenant'));
const m2 = masquesDeLaGrille(m1 ?? cfg, 'janvier');
dit('janvier : on les montre, le reste garde', [['autre'], ['x']], [m2?.hiddenServices, m2?.siteMasques.services]);

/* ── 5. Le vrai moteur : les venues nommées de la maquette, une archivée ── */
const CAT_SV = (s: Partial<Service> & { id: string }): Service => ({
  categoryId: 'tn29axgoc5', name: s.id, palier: 'Fondation', priceXof: 0, hidePrice: false, sessions: 1, durationMin: 30, order: 0, master: '', ...s,
} as Service);
const catalogue: Service[] = [
  CAT_SV({ id: 'sv-atl-ii-e', priceXof: 20000, tarifMode: 'calibre', priceFloors: { 'cal-jumbo': 20000, 'cal-medium': 20000, 'cal-mini': 20000, 'cal-micro': 30000, 'cal-nano': 40000, 'cal-pico': 50000, 'cal-galaxy': 60000 } }),
  CAT_SV({ id: 'sv-atl-ii-l', priceXof: 25000, tarifMode: 'calibre', priceFloors: { 'cal-jumbo': 25000, 'cal-medium': 25000, 'cal-mini': 25000, 'cal-micro': 35000, 'cal-nano': 45000, 'cal-pico': 55000, 'cal-galaxy': 65000 } }),
  CAT_SV({ id: 'sv-plt-05-ess-c', priceXof: 8000, prixParLongueur: { court: 8000, 'mi-long': 10000, long: 12000 } }),
  CAT_SV({ id: 'sv-plt-05-sig-c', priceXof: 12000, prixParLongueur: { court: 12000, 'mi-long': 15000, long: 18000 } }),
  CAT_SV({ id: 'sv-plt-10-m', priceXof: 25000, prixParLongueur: { court: 20000, 'mi-long': 25000, long: 28000 } }),
  CAT_SV({ id: 'sv-plt-30-c', priceXof: 6000 }),
  CAT_SV({ id: 'sv-plt-50-sty-e', priceXof: 2000 }),
  CAT_SV({ id: 'sv-plt-50-sty-s', priceXof: 5000 }),
  CAT_SV({ id: 'sv-plt-40-m', priceXof: 15000, prixParLongueur: { court: 15000, 'mi-long': 25000, long: 35000 } }),
  ...NAISSANCES.filter((n) => n.quoi === 'service').map((n) => n.fiche as unknown as Service),
];
const tete = (locks: number, longueur: 'court' | 'mi-long' | 'long'): PersonalPricing =>
  ({ ...pricingOf({ lockCount: locks }, MODEL_BANDS_SEED), longueur });
const prix = (id: string, locks: number, l: 'court' | 'mi-long' | 'long') =>
  personalPriceXof(catalogue.find((s) => s.id === id)!, tete(locks, l), catalogue);
dit('GBEJI Essentiel : Medium court, Micro court, Galaxy long', [28000, 38000, 72000],
  [prix('sv-venue-gbeji-ess', 120, 'court'), prix('sv-venue-gbeji-ess', 300, 'court'), prix('sv-venue-gbeji-ess', 600, 'long')]);
dit('GBEJI Signature : Medium court, Nano mi-long', [33000, 55000],
  [prix('sv-venue-gbeji-sig', 120, 'court'), prix('sv-venue-gbeji-sig', 400, 'mi-long')]);
dit('Le Moment : Medium court, Medium long, Pico court (VIVIVO et sortie offerts)', [57000, 71000, 87000],
  [prix('sv-le-moment', 120, 'court'), prix('sv-le-moment', 120, 'long'), prix('sv-le-moment', 500, 'court')]);
dit('GBIGBI Cure de trois : court, mi-long, long', [37500, 62500, 87500],
  [prix('sv-gbigbi-cure-trois', 120, 'court'), prix('sv-gbigbi-cure-trois', 120, 'mi-long'), prix('sv-gbigbi-cure-trois', 120, 'long')]);
dit('une archivee n est proposee a personne', [true, false],
  [estProposable(CAT_SV({ id: 'a' }), tete(120, 'court'), 0), estProposable(CAT_SV({ id: 'b', archived: true }), tete(120, 'court'), 0)]);

/* ── 6. Les écrans et le déclencheur lisent le même juge (commentaires effacés) ── */
const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const main = sansCom('src/apps/trone/main.tsx');
dit('le Trone lance la grille au demarrage', true, /^migreLaNouvelleGrille\(\);$/m.test(main));
const runner = sansCom('src/shared/nouvelle-grille.ts');
dit('le declencheur : session, catalogue reconnu, vitrine relue, masques AVANT la carte', [true, true, true], [
  /getSession\(\)\)\.data\.session\) return;/.test(runner),
  /if \(!\(await masquee\(\)\)\) return;[^\n]*\n\s*posee\(\);\s*marque\(\);/.test(runner),
  /from\('documents'\)\.select\('data'\)\.eq\('key', 'mnd_vitrine_config'\)/.test(runner),
]);
dit('Ma Couronne et la carte de la Maison taisent les archivees', [true, true], [
  /s\.archived !== true && catOk\(s\.categoryId\)/.test(sansCom('src/shared/bridges.ts')),
  /services\.filter\(\(s\) => s\.archived !== true\)/.test(sansCom('src/apps/carte/App.tsx')),
]);
const catalogTs = sansCom('src/shared/catalog.ts');
dit('le defaisage vivant est reconnu', true, /s\.categoryId === CATEGORIE_GBATA_VIVANTE/.test(catalogTs) && /CATEGORIE_GBATA_VIVANTE = 'cat-defaisage'/.test(catalogTs));
const pur = sansCom('src/shared/nouvelle-grille-pur.ts');
dit('le juge est pur : aucun import', false, /^\s*import\s/m.test(pur));

console.log(ko === 0 ? '\nLa nouvelle grille tient.' : `\n${ko} epreuve(s) en echec.`);
