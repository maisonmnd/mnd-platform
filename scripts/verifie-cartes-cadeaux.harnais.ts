/* LA CARTE CADEAU, EPROUVEE — `node scripts/verifie-cartes-cadeaux.mjs`.

   2 octobre 2026, maquette « La carte cadeau en ligne » validee. Ce harnais
   tient les PROMESSES faites a Yeman, pas le calcul du jour :
     - un code se lit et se tape sans confusion, et n'existe qu'une fois ;
     - en ligne, seul un montant entre 5 000 et 500 000 F se regle ;
     - l'argent d'une carte entre UNE fois au registre, avant comme apres son
       rattachement a la fiche de la beneficiaire ;
     - le serveur (deux copies) relit le montant sur la commande, jamais dans
       la requete, et tire le code une seule fois ;
     - la base n'accepte du site qu'une commande a regler, sans code ;
     - le site ne charge pas l'ERP, et ne regle jamais un geste en ligne. */
import { readFileSync } from 'node:fs';
import {
  ALPHABET_DU_CODE, MONTANT_MIN_XOF, MONTANT_MAX_XOF, genereCode, normaliseCode, montantRefuse, valableJusquau,
  etatDeLaCarte, pourquoiOnNeRattachePas, creditDeLaCarte, rattacheLeCredit, carteParCode, commandeDuSite,
  type CarteCadeau,
} from '../src/shared/cartes-cadeaux-pur';
import { buildReceipts } from '../src/shared/receipts';
import { creditBalanceOf, type CreditMovement } from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const lit = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');

/* ── 1. Le code ── */
{
  dit('l alphabet n a ni 0, O, 1, I ni L', [], ['0', 'O', '1', 'I', 'L'].filter((c) => ALPHABET_DU_CODE.includes(c)));
  const code = genereCode((n) => Array.from({ length: n }, (_, i) => i * 7 + 3));
  dit('un code tire a la forme MND-XXXX-XXXX', true, /^MND-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(code));
  dit('tape en minuscules avec des espaces, il se retrouve', 'MND-7K4P-2QX9', normaliseCode('mnd 7k4p 2qx9'));
  dit('... sans tirets ni MND', 'MND-7K4P-2QX9', normaliseCode('7K4P2QX9'));
  dit('un O pour un 0 n est pas devine', null, normaliseCode('MND-7K4P-2QXO'));
  dit('trop court, ce n est pas un code', null, normaliseCode('MND-7K4P'));
  const cartes = [{ code: 'MND-7K4P-2QX9', anciensCodes: ['MND-AAAA-BBBB'] } as CarteCadeau];
  dit('un code remplace se reconnait comme ancien', true, carteParCode(cartes, 'MND-AAAA-BBBB').ancien);
}

/* ── 2. Les bornes du montant en ligne ── */
dit('les bornes sont 5 000 et 500 000 F', [5000, 500000], [MONTANT_MIN_XOF, MONTANT_MAX_XOF]);
dit('4 999 F se refuse, 5 000 et 500 000 passent, 500 001 se refuse',
  [true, false, false, true], [4999, 5000, 500000, 500001].map((x) => montantRefuse(x) !== null));
dit('une carte reglee le 2 octobre 2026 vaut jusqu au 2 octobre 2027', '2027-10-02', valableJusquau('2026-10-02T18:12:00.000Z'));

/* ── 3. L'etat d'une carte ── */
{
  const base = commandeDuSite({
    id: 'cc-test', branchId: 'b1', maintenant: '2026-10-02T10:00:00Z', origine: 'en-ligne', objet: 'montant', montantXof: 25000,
    modele: 'medaillon', pour: 'Awa', de: 'Rama', remise: 'numerique', telephone: '01 97 00 00 00',
  });
  dit('une commande du site nait a regler, sans code', ['a-regler', undefined], [base.statut, base.code]);
  const reglee: CarteCadeau = { ...base, statut: 'reglee', code: 'MND-7K4P-2QX9', valableJusquau: '2027-10-02', payeLe: '2026-10-02T10:05:00Z', creditId: 'cre-cc-test' };
  const auj = '2026-10-03T09:00:00Z';
  dit('reglee et numerique : a envoyer', 'a-envoyer', etatDeLaCarte(reglee, auj));
  dit('... imprimee : a remettre', 'a-remettre', etatDeLaCarte({ ...reglee, remise: 'imprimee' }, auj));
  dit('... remise : attend sa visite', 'attend-sa-visite', etatDeLaCarte({ ...reglee, remiseLe: auj }, auj));
  dit('... echue apres sa date', 'echue', etatDeLaCarte(reglee, '2027-10-03T09:00:00Z'));
  dit('une carte a regler ne se rattache pas', true, !!pourquoiOnNeRattachePas(base, auj));
  dit('une carte echue ne se rattache pas', true, !!pourquoiOnNeRattachePas(reglee, '2027-10-03T09:00:00Z'));
  dit('une carte reglee et valide se rattache', null, pourquoiOnNeRattachePas(reglee, auj));

  /* ── 4. L'ARGENT ENTRE UNE FOIS ── */
  const depot = creditDeLaCarte(reglee, { montantXof: 25000, cashbox: 'KkiaPay', methode: 'KkiaPay', date: '2026-10-02T10:05:00Z', code: reglee.code! });
  const paiementEnLigne = { id: 'tx-1', branchId: 'b1', provider: 'kkiapay', amountXof: 25000, feesXof: 475, partnerId: 'cc-test', status: 'success', at: '2026-10-02T10:05:00Z' };
  const registre = (credits: CreditMovement[]) => buildReceipts({
    branchId: 'b1', invoices: [], online: [paiementEnLigne] as never, appointments: [], credits, formation: [], abonnements: [],
    nameOf: (id) => (id === 'cli-awa' ? 'Awa Kossou' : ''), apptLabel: () => '',
  });
  const avant = registre([depot]);
  dit('reglee en ligne : une seule ligne au registre, de 25 000 F, dans la caisse KkiaPay',
    [1, 25000, 'KkiaPay'], [avant.length, avant.reduce((s, r) => s + r.amountXof, 0), avant[0]?.cashbox]);
  const porteur = { type: 'client' as const, id: 'cli-awa' };
  const rattache = rattacheLeCredit(depot, porteur);
  dit('le rattachement ne change que le porteur', { ...depot, holderType: 'client', holderId: 'cli-awa' }, rattache);
  const apres = registre([rattache]);
  dit('rattachee : toujours une seule ligne, meme montant, meme jour, meme caisse, au nom d Awa',
    [1, 25000, avant[0]?.date, 'KkiaPay', 'Awa Kossou'], [apres.length, apres.reduce((s, r) => s + r.amountXof, 0), apres[0]?.date, apres[0]?.cashbox, apres[0]?.clientName]);
  dit('son avoir vaut la carte, la carte ne porte plus rien',
    [25000, 0], [creditBalanceOf([rattache], porteur), creditBalanceOf([rattache], { type: 'client', id: 'cc-test' })]);
}

/* ── 5. Le serveur : deux copies, une regle ── */
{
  const v = lit('supabase/functions/kkiapay-verify/index.ts');
  const w = lit('supabase/functions/kkiapay-webhook/index.ts');
  const bloc = (t: string) => { const a = t.indexOf('const ALPHABET_DU_CODE'); const b = t.indexOf("throw new Error('carte_non_reglee');", a); return a < 0 || b < 0 ? '' : t.slice(a, b); };
  dit('kkiapay-verify et kkiapay-webhook portent le meme reglement de carte', true, bloc(v) !== '' && bloc(v) === bloc(w));
  dit('... avec l alphabet du depot', `const ALPHABET_DU_CODE = '${ALPHABET_DU_CODE}';`, (bloc(v).match(/const ALPHABET_DU_CODE = '[^']*';/) ?? [''])[0]);
  dit('... qui ne tire le code que si la carte n en a pas', true, /\.is\('data->>code', null\)/.test(bloc(v)));
  dit('... et un avoir a l identifiant deduit de la carte', true, /const creditId = `cre-\$\{o\.carteId\}`/.test(bloc(v)));
  const vs = sansCommentaires(v);
  dit('verify relit le montant sur la commande et refuse sans elle', true,
    /from\('cartes_cadeaux'\)\.select\('data'\)\.eq\('id', String\(carteId\)\)/.test(vs) && /expected = Math\.round\(Number\(cc\?\.data\?\.montantXof/.test(vs) && /carte_introuvable/.test(vs));
  dit('... avant de regler quoi que ce soit (le controle precede applyPayment)', true,
    vs.indexOf("carte_introuvable") > 0 && vs.indexOf("carte_introuvable") < vs.indexOf('await applyPayment(admin, {'));
  const ws = sansCommentaires(w);
  dit('le filet connait les cartes et relit leur montant', true,
    /partnerId\.startsWith\('cc-'\)/.test(ws) && /attendu = Math\.round\(Number\(cc\?\.data\?\.montantXof/.test(ws) && /paid \+ 1 < attendu/.test(ws));
  dit('l id de carte commence par cc- (le filet s y fie)', true, /^cc-/.test(commandeDuSite({
    id: 'cc-x', branchId: '', maintenant: '', origine: 'maison', objet: 'geste', geste: 'Un soin', modele: 'ivoire', pour: '', de: '', remise: 'numerique', telephone: '',
  }).id) && /`cc-\$\{/.test(lit('src/shared/cartes-cadeaux-pur.ts')));
}

/* ── 6. La base ── */
{
  const m = sansCommentaires(lit('supabase/migrations/0112_les_cartes_cadeaux.sql'));
  dit('la table a sa protection des sa creation', true, /alter table public\.cartes_cadeaux enable row level security/.test(m));
  const depot = (m.match(/create policy cc_depot[\s\S]*?\);\n/) ?? [''])[0];
  dit('le site ne depose qu une commande a regler, sans code ni paiement', true,
    ["data->>'statut' = 'a-regler'", "data->>'code' is null", "data->>'transactionId' is null", "data->>'creditId' is null"].every((x) => depot.includes(x)));
  dit('... dans les memes bornes que l ecran', true, depot.includes(`between ${MONTANT_MIN_XOF} and ${MONTANT_MAX_XOF}`));
  dit('le site ne relit rien : aucune lecture ouverte a l anonyme', false, /for select to anon/.test(m) || /for all to anon/.test(m));
  dit('un code n existe qu une fois', true, /create unique index if not exists cartes_cadeaux_code_unique/.test(m));
}

/* ── 7. Le site ── */
{
  const s = sansCommentaires(lit('src/apps/revelateur/ilots/Offrir.tsx'));
  dit('la page n emporte pas l ERP (ni finance, ni kkiapay.ts, ni sync)', false,
    /shared\/(finance|sync|kkiapay)'/.test(s));
  dit('« Regler maintenant » n existe que pour un montant', true, /mode === 'montant' && peutPayer \?/.test(s));
  dit('le serveur reçoit la commande, jamais le montant', true,
    /body: \{ transactionId, carteId: c\.id, branchId: c\.branchId \}/.test(s) && !/expectedXof/.test(s));
  dit('un code ne s affiche que rendu par le serveur', true, /setReglee\(\{ code: r\.carte\.code/.test(s) && !/genereCode/.test(s));
}

/* ── 8. Le registre des encaissements ne double pas un paiement de carte ── */
dit('le paiement KkiaPay d une carte ne fait pas sa propre ligne', true,
  /if \(p\.partnerId\?\.startsWith\('cc-'\)\) continue;/.test(sansCommentaires(lit('src/shared/receipts.ts'))));

console.log(ko === 0 ? '\nLa carte cadeau tient ses promesses.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
