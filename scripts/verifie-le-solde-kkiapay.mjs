import { build, transform } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { blocDe } from './tpe-copie-serveur.mjs';
import { CIBLE_DU_SOLDE, SOURCE_DU_SOLDE } from './kkiapay-solde-copie-serveur.mjs';

/* LE SOLDE KKIAPAY, EPROUVE (26 novembre 2026).

   1. la regle (src/shared/kkiapay-solde-pur.ts) rejouee sur des reponses ;
   2. la fonction `kkiapay-solde` : son bloc recopie a l identique, sa porte
      de direction, ses cles, et RIEN d ecrit ;
   3. l ecran du Trone, s il existe.

   `--prouve` casse chaque regle de texte EN MEMOIRE et attend que son
   controle la voie. */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const prouve = process.argv.includes('--prouve');
let echecs = 0;
const dit = (nom, ok, detail = '') => {
  if (!ok) echecs++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok || !detail ? '' : `\n       ${detail}`}`);
};
const egal = (nom, attendu, obtenu) => dit(nom, JSON.stringify(attendu) === JSON.stringify(obtenu), `attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);

/* ── 1. LA REGLE ── */
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-solde-kkiapay-'));
try {
  const sortie = path.join(dossier, 'pur.mjs');
  await build({ entryPoints: [path.join(racine, SOURCE_DU_SOLDE)], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', write: true });
  const t = await import(pathToFileURL(sortie).href);
  if (!prouve) {
    egal('un montant de KkiaPay : nombre, texte, espaces, virgule ; rien d autre', [12500, 12500, 12501, 3000, null, null, null],
      [t.francsDeKkiapay(12500), t.francsDeKkiapay('12 500'), t.francsDeKkiapay('12500.6'), t.francsDeKkiapay('3000,00'), t.francsDeKkiapay('abc'), t.francsDeKkiapay(null), t.francsDeKkiapay(Infinity)]);
    const reponse = {
      id: 'u1', email: 'x', developerAccounts: [
        { id: 'a1', label: 'Maison <MND>', wallet_balance: 150000, payment_wallet: { availableBalance: '40000' }, payout_wallet: { availableBalance: 110000 } },
        { id: 'a2', label: 'Sous-compte', wallet_balance: '5000', payment_wallet: { availableBalance: 0 }, payout_wallet: { availableBalance: '5 000' } },
        { id: 'a3', label: 'Sans portefeuille', wallet_balance: 999, payment_wallet: null, payout_wallet: { availableBalance: 999 } },
      ],
    };
    const lu = t.soldeDeKkiapay(reponse);
    egal('les comptes : ceux qui ont leurs deux portefeuilles, comme le tableau de bord', ['a1', 'a2'], lu.comptes.map((c) => c.id));
    egal('les trois soldes d un compte', { id: 'a1', nom: 'Maison MND', totalXof: 150000, operationXof: 40000, disponibleXof: 110000 }, lu.comptes[0]);
    egal('les sommes', [155000, 40000, 115000], [lu.totalXof, lu.operationXof, lu.disponibleXof]);
    egal('une reponse enveloppee dans data se lit aussi', 1, t.soldeDeKkiapay({ data: { developerAccounts: [reponse.developerAccounts[0]] } }).comptes.length);
    const vide = t.soldeDeKkiapay({ message: 'Unauthorized', statusCode: 401 });
    egal('rien a lire : aucune somme, et seulement le NOM des champs', [0, null, ['message', 'statusCode']], [vide.comptes.length, vide.totalXof, vide.forme]);
    egal('un solde illisible reste inconnu, il ne devient pas zero', [null, null], [t.soldeDeKkiapay({ developerAccounts: [{ id: 'z', payment_wallet: {}, payout_wallet: {} }] }).disponibleXof, t.soldeDeKkiapay(null).totalXof]);
    egal('le souci dit en clair', [null, true, true, true, true, true], [
      t.souciDuSoldeKkiapay(200, lu), /sans aucun compte/.test(t.souciDuSoldeKkiapay(200, vide)), /ne répond pas/.test(t.souciDuSoldeKkiapay(0, null)),
      /refuse les clés/.test(t.souciDuSoldeKkiapay(401, null)), /refuse les clés/.test(t.souciDuSoldeKkiapay(403, null)), /réponse 500/.test(t.souciDuSoldeKkiapay(500, null)),
    ]);
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

/* ── 2 et 3. LES TEXTES ── */
const FICHIERS = {
  fonction: CIBLE_DU_SOLDE,
  pur: SOURCE_DU_SOLDE,
  magasin: 'src/shared/kkiapay-solde.ts',
  ecran: 'src/apps/trone/routes/finances/KkiaPay.tsx',
  routes: 'src/apps/trone/routes/index.tsx',
};
const sources = Object.fromEntries(Object.entries(FICHIERS).map(([k, f]) => [k, lis(f)]));
const original = blocDe(sources.pur, 'kkiapay-solde');
const remplace = (texte, avant, apres) => texte.split(avant).join(apres);
const serve = (s) => s.fonction.slice(s.fonction.indexOf('Deno.serve('));

const controles = [
  {
    dit: 'la fonction porte le bloc ⟨kkiapay-solde⟩ de la regle, caractere pour caractere',
    ok: (s) => !!original && blocDe(s.fonction, 'kkiapay-solde') === original,
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, 'Math.round(x)', 'Math.floor(x)') }),
  },
  {
    dit: 'la fonction dit sa version, et un GET la rend avec les cles en booleens, sans valeur',
    ok: (s) => /const VERSION = '2026-11-\d\d-[a-z] · /.test(s.fonction)
      && /secrets: \{ public: !!cles\['x-api-key'\], private: !!cles\['x-private-key'\], secret: !!cles\['x-secret-key'\] \}/.test(s.fonction),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, "public: !!cles['x-api-key']", "public: cles['x-api-key']") }),
  },
  {
    dit: 'la direction seule (est_direction ou la cle de service, a temps constant), avant de rien demander a KkiaPay',
    ok: (s) => {
      const f = serve(s);
      const i = (x) => f.indexOf(x);
      return /commeAppelant\.rpc\('est_direction'\)/.test(s.fonction) && /cles\.some\(\(c\) => memeCle\(bearer, c\)\)/.test(s.fonction)
        && i("if (!(await laDirection(req))) return json({ ok: false, raison: 'refusee', version: VERSION }, 403);") > 0
        && i('await demandeLeSolde()') > i("if (!(await laDirection(req)))");
    },
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, "  if (!(await laDirection(req))) return json({ ok: false, raison: 'refusee', version: VERSION }, 403);\n", '') }),
  },
  {
    dit: 'KkiaPay est interroge avec les trois cles de la Maison, jamais un mot de passe, sur la route du tableau de bord',
    ok: (s) => /const KKIA_SOLDE_PATH = '\/merchant\/me';/.test(s.fonction)
      && /'x-api-key': \(Deno\.env\.get\('KKIAPAY_PUBLIC_KEY'\) \?\? ''\)\.trim\(\),/.test(s.fonction)
      && /'x-private-key': \(Deno\.env\.get\('KKIAPAY_PRIVATE_KEY'\) \?\? ''\)\.trim\(\),/.test(s.fonction)
      && /'x-secret-key': \(Deno\.env\.get\('KKIAPAY_SECRET_KEY'\) \?\? ''\)\.trim\(\),/.test(s.fonction)
      && !/password|mot_de_passe|auth\/login/i.test(s.fonction.replace(/\/\*[\s\S]*?\*\//g, '')),
    casse: (s) => ({ ...s, fonction: `${s.fonction}\nconst x = await fetch(KKIA_BASE + '/auth/login');` }),
  },
  {
    dit: 'sans les trois cles, rien ne part chez KkiaPay',
    ok: (s) => serve(s).indexOf("raison: 'cles-absentes'") > 0 && serve(s).indexOf("raison: 'cles-absentes'") < serve(s).indexOf('await demandeLeSolde()'),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, "raison: 'cles-absentes'", "raison: 'x'") }),
  },
  {
    dit: 'la fonction ne fait que lire : aucune ecriture en base, et la reponse de KkiaPay ne va pas au journal',
    ok: (s) => !/\.(insert|update|upsert|delete)\(|from\(/.test(s.fonction)
      && /console\.log\(`kkiapay-solde \$\{VERSION\.slice\(0, 12\)\}: KkiaPay \$\{http\}/.test(s.fonction) && !/console\.log\([^)]*corps/.test(s.fonction),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, '  const souci = souciDuSoldeKkiapay(http, lu);', '  console.log(corps);\n  const souci = souciDuSoldeKkiapay(http, lu);') }),
  },
  {
    dit: 'KkiaPay muet ne bloque pas : huit secondes au plus',
    ok: (s) => /setTimeout\(\(\) => minuterie\.abort\(\), 8_000\)/.test(s.fonction) && /signal: minuterie\.signal,/.test(s.fonction),
    casse: (s) => ({ ...s, fonction: remplace(s.fonction, 'signal: minuterie.signal,', '') }),
  },
];

/* L'écran (lot de l'affichage) : contrôlé dès qu'il existe. */
if (sources.ecran) {
  controles.push(
    {
      dit: 'l ecran passe par la fonction, la direction seule, et relit chaque minute tant qu il est visible',
      ok: (s) => /functions\.invoke\('kkiapay-solde'/.test(s.magasin) && /document\.visibilityState === 'visible'/.test(s.magasin) && /60_000/.test(s.magasin)
        && /const direction = moi\?\.role === 'souverain' \|\| moi\?\.role === 'gerant';/.test(s.ecran),
      casse: (s) => ({ ...s, magasin: remplace(s.magasin, "functions.invoke('kkiapay-solde'", "functions.invoke('x'") }),
    },
    {
      dit: 'l ecran montre les trois soldes de KkiaPay et dit le souci',
      ok: (s) => /Disponible/.test(s.ecran) && /Solde d’opération/.test(s.ecran) && /Solde total/.test(s.ecran) && /lecture\?\.souci/.test(s.ecran),
      casse: (s) => ({ ...s, ecran: remplace(s.ecran, 'lecture?.souci', 'null') }),
    },
    {
      dit: 'la page KkiaPay est reservee a la direction et nommee parmi les ecrans nes apres les departements',
      ok: (s) => /export const ROUTES_DIRECTION = \[[^\]]*'\/kkiapay'/.test(s.routes) && /ECRANS_NES_APRES_LES_DEPARTEMENTS: readonly string\[\] = \[[^\]]*'\/kkiapay'/.test(s.routes)
        && /\{ path: '\/kkiapay', label: 'KkiaPay',[^\n]*import\('\.\/finances\/KkiaPay'\)/.test(s.routes),
      casse: (s) => ({ ...s, routes: remplace(s.routes, ", '/kkiapay']", ']') }),
    },
  );
}

for (const c of controles) {
  const ok = c.ok(sources);
  if (!prouve) dit(c.dit, ok);
  else {
    const vu = !c.ok(c.casse(sources));
    dit(`prouve : ${c.dit}`, ok && vu, ok ? 'la panne passe inapercue' : 'le controle echoue deja sans panne');
  }
}

if (!prouve) {
  try {
    await transform(sources.fonction, { loader: 'ts', format: 'esm' });
    dit('la fonction se transpile', true);
  } catch (e) {
    dit('la fonction se transpile', false, String(e?.message ?? e).slice(0, 300));
  }
}

console.log(`\n${echecs ? `${echecs} ECHEC(S)` : 'TOUT EST VERT'}${prouve ? ' (preuve)' : ''}`);
process.exit(echecs ? 1 : 0);
