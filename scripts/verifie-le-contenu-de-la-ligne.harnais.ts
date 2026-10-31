/* LE CONTENU DE LA LIGNE, EPROUVE — 31 octobre 2026.
   `node scripts/verifie-le-contenu-de-la-ligne.mjs` (et `--prouve`).

   La panne : au Trone, ouvrir la facture MND-2026-0165 (Carnet des Trois,
   ABO-2026-001, 100 000 F, un versement en especes du 24 octobre 2026)
   faisait tomber l'ecran Factures, « .map is not a function ». La piece est
   nee au serveur (`verse_sur_l_abonnement`, 0138), et sa ligne portait un
   `detail` CHAINE, « 3 × Resserrage · 2 × Lavage », la ou le Trone attend
   `string[]`. La regle, desormais : `contenuDUneLigne` rend TOUJOURS un
   tableau de chaines (src/apps/trone/routes/vente/pdf-de-la-piece.ts), et
   la migration 0148 ecrit un tableau.

   TOUS LES ATTENDUS SONT ECRITS EN DUR. Les tetes et les prestations sont
   inventees. Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { detailPorte, contenuDUneLigne, type SourcesDuContenu } from '../src/apps/trone/routes/vente/pdf-de-la-piece';
import type { Invoice, InvoiceLine } from '../src/shared/finance';
import type { Service } from '../src/shared/catalog';
import type { Plan, Subscriber } from '../src/shared/abonnements';

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
const sansCommentairesSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const sourceSql = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentairesSql(s);
};

/* ── Le decor : un catalogue, un forfait, un contrat, sa formule ──────── */
const sv = (id: string, name: string, priceXof: number, extra: object = {}): Service =>
  ({ id, name, priceXof, ...extra }) as unknown as Service;
const services: Service[] = [
  sv('sv-resserrage', 'Resserrage', 15_000),
  sv('sv-lavage', 'Lavage', 8_000),
  sv('sv-soin', 'Soin profond', 12_000, { prixBarreXof: 15_000 }),
  /* Le forfait : ses prestations, et son prix, sous le prix de la carte. */
  sv('sv-pack', 'Pack Rentree', 30_000, { includes: [{ serviceId: 'sv-resserrage' }, { serviceId: 'sv-lavage' }, { serviceId: 'sv-soin' }] }),
];
const plan = { id: 'pl-trois', name: 'Carnet des Trois', mode: 'pack', included: [{ serviceId: 'sv-resserrage', qty: 3 }, { serviceId: 'sv-lavage', qty: null }] } as unknown as Plan;
const abo = { id: 'ab-1', planId: 'pl-trois', invoiceId: 'inv-0165', reference: 'ABO-2026-001' } as unknown as Subscriber;
const fmt = (x: number) => `${x} F`;
const nomDuService = (id: string) => services.find((s) => s.id === id)?.name ?? 'Prestation retiree';
const sources: SourcesDuContenu = { services, abonnes: [abo], formules: [plan], fmt, nomDuService };

const ligne = (o: Partial<InvoiceLine> & { label: string }): InvoiceLine =>
  ({ id: 'il-1', qty: 1, unitXof: 100_000, discountPct: 0, ...o }) as InvoiceLine;
const piece = (id: string, lines: InvoiceLine[]): Invoice => ({ id, lines, kind: 'facture', number: 'MND-2026-0165' }) as unknown as Invoice;

/* == #1 -- UN TABLEAU SE REND TEL QUEL, SANS SES VIDES == */
{
  const l = ligne({ label: 'Carnet des Trois', detail: ['3 × Resserrage', '', '  ', 'Lavage · à volonté'] });
  dit(1, 'detailPorte : le tableau, sans les chaines vides', ['3 × Resserrage', 'Lavage · à volonté'], detailPorte(l.detail));
  dit(1, 'contenuDUneLigne : ce qui est ecrit l emporte sur le contrat', ['3 × Resserrage', 'Lavage · à volonté'], contenuDUneLigne(piece('inv-0165', [l]), l, sources));
  /* Un tableau qui porte autre chose que des chaines (jsonb mal forme) ne garde que les chaines. */
  dit(1, 'un tableau mele ne garde que ses chaines', ['a'], detailPorte(['a', 3, null, { x: 1 }]));
}

/* == #2 -- LA CHAINE DE MND-2026-0165 DEVIENT UN TABLEAU D UN ELEMENT, ET L ECRAN NE TOMBE PLUS == */
{
  const chaine = '3 × Resserrage · 2 × Lavage';
  const l = ligne({ label: 'Carnet des Trois', detail: chaine as unknown as string[] });
  const contenu = contenuDUneLigne(piece('inv-0165', [l]), l, sources);
  dit(2, 'la chaine de la piece 0165 : un tableau d un element, la chaine entiere', [chaine], contenu);
  dit(2, '... sur lequel .map et .join passent (ce que fait l ecran Factures)', [true, chaine], [Array.isArray(contenu) && typeof contenu.map === 'function', contenu.join(' · ')]);
  dit(2, 'une chaine vide ou blanche ne porte rien', [[], []], [detailPorte(''), detailPorte('   ')]);
  dit(2, 'un objet, un nombre, null, undefined : rien, jamais une erreur', [[], [], [], []], [detailPorte({ a: 1 }), detailPorte(12), detailPorte(null), detailPorte(undefined)]);
}

/* == #3 -- SANS DETAIL, UN FORFAIT DU MEME NOM DIT SON CONTENU == */
{
  const l = ligne({ label: 'Pack Rentree', unitXof: 30_000 });
  const contenu = contenuDUneLigne(piece('inv-pack', [l]), l, sources);
  /* 15 000 + 8 000 + 15 000 (barre) = 38 000 F a la carte, 30 000 F pour elle, 8 000 F offerts. */
  dit(3, 'le forfait : ses trois prestations, puis le geste entier, au prix de la ligne', [
    'Resserrage · 15000 F', 'Lavage · 8000 F', 'Soin profond · 12000 F au lieu de 15000 F, 20 % offerts',
    '38000 F au tarif de la Maison, 30000 F pour elle, 8000 F offerts',
  ], contenu);
  dit(3, '... toujours un tableau de chaines', true, Array.isArray(contenu) && contenu.every((t) => typeof t === 'string' && t.length > 0));
  /* Une prestation simple, sans forfait ni contrat : rien, pas une erreur. */
  const simple = ligne({ label: 'Resserrage', unitXof: 15_000 });
  dit(3, 'une prestation simple sans detail ne porte rien', [], contenuDUneLigne(piece('inv-simple', [simple]), simple, sources));
}

/* == #4 -- SANS DETAIL, L ABONNEMENT NE DE CETTE PIECE DIT SES QUOTAS == */
{
  const l = ligne({ label: 'Carnet des Trois' });
  dit(4, 'la piece du contrat : les quotas vendus, dans les mots de libellesInclus', ['3 × Resserrage', 'Lavage · à volonté'],
    contenuDUneLigne(piece('inv-0165', [l]), l, sources));
  dit(4, 'une piece a deux lignes ne prend pas le contrat (on ne saurait laquelle)', [],
    contenuDUneLigne(piece('inv-0165', [l, ligne({ id: 'il-2', label: 'Gel', unitXof: 5_000 })]), l, sources));
  dit(4, 'une piece que nul contrat n a fait naitre ne porte rien', [],
    contenuDUneLigne(piece('inv-autre', [l]), l, sources));
}

/* == #5 -- LE CABLAGE : L ECRAN ET LE PDF PASSENT PAR LA REGLE == */
{
  const factures = source('src/apps/trone/routes/vente/Factures.tsx');
  const pdfDeLaPiece = source('src/apps/trone/routes/vente/pdf-de-la-piece.ts');
  dit(5, 'Factures : la liste des lignes lit detailPorte(l.detail), jamais l.detail nu avec .join', [true, false], [
    /detailPorte\(l\.detail\)\.join\(' · '\)/.test(factures),
    /l\.detail!\.join|\(l\.detail \?\? \[\]\)\.length/.test(factures),
  ]);
  dit(5, 'Factures : l ecran de la piece passe par contenuDeLaLigne(active, l).map', true, /contenuDeLaLigne\(active, l\)\.map\(/.test(factures));
  dit(5, 'pdf-de-la-piece : le crochet delegue a contenuDUneLigne, qui commence par detailPorte', [true, true], [
    /const contenuDeLaLigne = \(piece: Invoice, l: InvoiceLine\): string\[\] =>\n\s*contenuDUneLigne\(piece, l, \{/.test(pdfDeLaPiece),
    /const porte = detailPorte\(l\.detail\);\n\s*if \(porte\.length > 0\) return porte;/.test(pdfDeLaPiece),
  ]);
}

/* == #6 -- LE SERVEUR ECRIT UN TABLEAU (0148), ET REPREND LES CHAINES D AVANT == */
{
  const m = sourceSql('supabase/migrations/0148_le_contenu_de_la_ligne_en_tableau.sql');
  const fn = m.slice(m.indexOf('create or replace function public.verse_sur_l_abonnement'), m.indexOf('revoke all on function public.verse_sur_l_abonnement'));
  dit(6, '0148 : v_detail est jsonb, agrege par jsonb_agg, et string_agg ne s ecrit plus dans la fonction', [true, true, false], [
    /v_detail\s+jsonb;/.test(fn), /select jsonb_agg\([\s\S]*?\)\s*into v_detail/.test(fn), /string_agg\(/.test(fn),
  ]);
  dit(6, '0148 : la ligne porte \'detail\', v_detail, et les mots de libellesInclus (« · à volonté », « × »)', [true, true, true], [
    /'discountPct', 0, 'detail', v_detail\)/.test(fn), fn.includes("' · à volonté'"), fn.includes("' × '"),
  ]);
  /* La chaine se reconnait DEUX fois : dans le `case` qui redecoupe, et dans
     le `where` qui ne retient que les pieces encore fautives. */
  dit(6, '0148 : les pieces deja ecrites avec une chaine sont redecoupees en tableau (case + where), sur « · »', [2, true, true], [
    (m.match(/jsonb_typeof\(l->'detail'\) = 'string'/g) ?? []).length,
    /where jsonb_typeof\(l->'detail'\) = 'string'\);/.test(m),
    /string_to_array\(l->>'detail', '·'\)/.test(m),
  ]);
  /* 0138 reste telle qu'elle a ete passee (on ne relance jamais une migration) : la faute y est, documentee ici. */
  const ancienne = sourceSql('supabase/migrations/0138_le_parcours_de_l_abonnee.sql');
  dit(6, '0138, passee, porte encore v_detail text : c est 0148 qui corrige', true, /v_detail\s+text;/.test(ancienne));
}

console.log(ko === 0 ? 'Tout tient.' : `${ko} constat(s) en echec.`);
